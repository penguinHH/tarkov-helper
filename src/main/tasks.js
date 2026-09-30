// 任务进度：从游戏日志识别任务接取 / 失败 / 完成。
// 日志格式参考 TarkovMonitor（https://github.com/the-hideout/TarkovMonitor，GPL-3.0）的记录，未复制其代码。
//
// notifications.log 中的 "Got notification | ChatMessageReceived" 行后面跟一段 JSON：
//   message.type：10 = 接取，11 = 失败，12 = 完成
//   message.templateId："<任务ID> ..."
// 每个日志文件夹对应一次游戏启动，同文件夹 application.log 里的 "Session mode:" 决定是哪个服务器。
//
// 进度按服务器分别保存到 userData/task-progress.json，旧日志被删除也不会丢；手动标记与日志事件按时间先后取最新。
import { app } from 'electron'
import fs from 'fs'
import { join } from 'path'

const LINE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})( [+-]\d{2}:\d{2})?\|(.*)$/gm
const STATUS = { 10: 'started', 11: 'failed', 12: 'finished' }
const MODES = ['regular', 'pve', 'pvp-season']

const file = () => join(app.getPath('userData'), 'task-progress.json')

// progress: { [mode]: { [taskId]: { status, time, source } } }，status 为 null 表示手动重置
let progress = Object.fromEntries(MODES.map((m) => [m, {}]))
let timer = null
let onChange = null
const scanned = new Map() // 已扫描的历史文件：path → size

export function loadProgress() {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'))
    for (const m of MODES) progress[m] = saved[m] ?? {}
  } catch {
    // 首次运行
  }
  return progress
}

function save() {
  try {
    fs.writeFileSync(file(), JSON.stringify(progress))
  } catch {
    // 忽略
  }
}

// 合并一条记录：时间更新的覆盖旧的
function merge(mode, taskId, status, time, source) {
  const cur = progress[mode]?.[taskId]
  if (cur && cur.time >= time) return false
  progress[mode][taskId] = { status, time, source }
  return true
}

export function setManual(mode, taskId, status) {
  if (!progress[mode]) return progress
  merge(mode, taskId, status, Date.now(), 'manual')
  save()
  onChange?.(progress)
  return progress
}

function parseTime(date, time, tz) {
  const t = new Date(`${date}T${time}${tz ? tz.trim() : ''}`).getTime()
  return Number.isFinite(t) ? t : 0
}

function sessionToMode(raw) {
  const s = raw.toLowerCase()
  if (s === 'pve') return 'pve'
  if (s === 'pvpseason' || s === 'seasonal') return 'pvp-season'
  return 'regular'
}

function readText(path) {
  try {
    return fs.readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// 文件夹对应的服务器（application.log 里第一个 Session mode）；还没写入时返回 null
function folderMode(folder) {
  const app = fs.readdirSync(folder).filter((n) => /application(_\d+)?\.log$/i.test(n))
  for (const f of app.sort()) {
    const m = readText(join(folder, f)).match(/Session mode: ([^\s|]+)/)
    if (m) return sessionToMode(m[1])
  }
  return null
}

// 解析 notifications 日志，返回 [{ taskId, status, time }]
export function parseNotifications(text) {
  const out = []
  const lines = [...text.matchAll(LINE_RE)]
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]
    if (!m[4].includes('ChatMessageReceived')) continue
    const start = m.index + m[0].length
    const end = i + 1 < lines.length ? lines[i + 1].index : text.length
    try {
      const json = JSON.parse(text.slice(start, end).trim())
      const msg = json.message ?? json
      const status = STATUS[msg?.type]
      const taskId = msg?.templateId?.split(' ')[0]
      if (status && taskId) out.push({ taskId, status, time: parseTime(m[1], m[2], m[3]) })
    } catch {
      // JSON 不完整（文件还在写）或格式不同，跳过
    }
  }
  return out
}

function scanFolder(folder, mode) {
  let changed = false
  const files = fs.readdirSync(folder).filter((n) => /notifications(_\d+)?\.log$/i.test(n))
  for (const f of files) {
    const path = join(folder, f)
    let size = 0
    try {
      size = fs.statSync(path).size
    } catch {
      continue
    }
    if (scanned.get(path) === size) continue
    scanned.set(path, size)
    for (const e of parseNotifications(readText(path))) {
      if (merge(mode, e.taskId, e.status, e.time, 'log')) changed = true
    }
  }
  return changed
}

export function startTaskWatcher(logsDir, handler) {
  stopTaskWatcher()
  onChange = handler
  if (!logsDir || !fs.existsSync(logsDir)) return
  const folders = () =>
    fs
      .readdirSync(logsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('log_'))
      .map((d) => join(logsDir, d.name))
      .sort()
  const modes = new Map()
  // 识别到 Session mode 后缓存；识别不到按 PVP 处理，下次再试
  const modeOf = (folder) => {
    if (!modes.has(folder)) {
      const m = folderMode(folder)
      if (!m) return 'regular'
      modes.set(folder, m)
    }
    return modes.get(folder)
  }

  // 启动时扫描全部历史日志
  let changed = false
  try {
    for (const f of folders()) if (scanFolder(f, modeOf(f))) changed = true
  } catch {
    // 目录不可读时忽略
  }
  if (changed) save()
  handler(progress)

  // 之后只盯最新的文件夹
  timer = setInterval(() => {
    try {
      const latest = folders().at(-1)
      if (latest && scanFolder(latest, modeOf(latest))) {
        save()
        handler(progress)
      }
    } catch {
      // 忽略
    }
  }, 3000)
}

export function stopTaskWatcher() {
  if (timer) clearInterval(timer)
  timer = null
}

export const getProgress = () => progress
