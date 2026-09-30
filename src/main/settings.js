import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import fs from 'fs'

const file = () => join(app.getPath('userData'), 'settings.json')

export const defaults = {
  // 游戏截图目录：截图文件名里包含玩家坐标，用于在地图上定位
  screenshotsDir: join(homedir(), 'Documents', 'Escape from Tarkov', 'Screenshots'),
  // 游戏安装目录下的 Logs 目录，用于识别当前战局地图（实验性）
  logsDir: 'C:\\Battlestate Games\\Escape from Tarkov\\Logs',
  // 定位后自动删除截图，避免截图文件夹越堆越多
  deleteScreenshots: false
}

export function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(s) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify(s, null, 2))
  return s
}
