import { app, BrowserWindow, ipcMain, shell, dialog, net } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { loadSettings, saveSettings } from './settings'
import { startWatchers, stopWatchers } from './watchers'
import { loadProgress, getProgress, setManual, startTaskWatcher, stopTaskWatcher } from './tasks'

const ALLOWED_HOSTS = ['escapefromtarkov.fandom.com', 'json.tarkov.dev', 'raw.githubusercontent.com', 'assets.tarkov.dev']

let win = null
let settings = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#111316',
    title: 'Tarkov Helper',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function restartWatchers() {
  stopWatchers()
  startTaskWatcher(settings.logsDir, (p) => send('tasks:progress', p))
  startWatchers(settings, {
    onPosition: (p) => send('game:position', p),
    onRaid: (r) => send('game:raid', r),
    onSession: (m) => send('game:session', m),
    onStatus: (s) => send('game:watch-status', s)
  })
}

app.whenReady().then(() => {
  settings = loadSettings()
  loadProgress()

  // 任务进度（按服务器）：读取 / 手动标记
  ipcMain.handle('tasks:get', () => getProgress())
  ipcMain.handle('tasks:set', (_e, mode, taskId, status) => setManual(mode, taskId, status))

  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, patch) => {
    settings = saveSettings({ ...settings, ...patch })
    restartWatchers()
    return settings
  })
  // 由主进程代发网络请求，避开渲染进程的 CORS 限制；只允许白名单域名
  ipcMain.handle('net:fetch', async (_e, url, init) => {
    const host = new URL(url).hostname
    if (!ALLOWED_HOSTS.includes(host)) throw new Error(`Host not allowed: ${host}`)
    const res = await net.fetch(url, init)
    return { ok: res.ok, status: res.status, text: await res.text() }
  })
  // 数据缓存放磁盘（完整地图数据有好几 MB，localStorage 放不下）
  const cacheFile = (key) => join(app.getPath('userData'), 'cache', `${key.replace(/[^\w.-]/g, '_')}.json`)
  ipcMain.handle('cache:get', (_e, key) => {
    try {
      return JSON.parse(fs.readFileSync(cacheFile(key), 'utf8'))
    } catch {
      return null
    }
  })
  ipcMain.handle('cache:set', (_e, key, value) => {
    fs.mkdirSync(join(app.getPath('userData'), 'cache'), { recursive: true })
    fs.writeFileSync(cacheFile(key), JSON.stringify(value))
  })
  ipcMain.handle('dialog:pick-folder', async (_e, title) => {
    const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  createWindow()
  win.webContents.on('did-finish-load', restartWatchers)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopWatchers()
  stopTaskWatcher()
  if (process.platform !== 'darwin') app.quit()
})
