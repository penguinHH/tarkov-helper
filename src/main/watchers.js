import fs from 'fs'
import { join, basename } from 'path'

// 游戏截图文件名格式示例：
// 2024-05-06[22-58]_-205.94, 2.98, -135.40_0.00000, -0.98567, 0.00000, 0.16868_11.91 (0).png
// 依次为：时间、位置 x/y/z、朝向四元数 x/y/z/w
const SHOT_RE = /_(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)_(-?[\d.]+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+)_/

// 日志中的地图 ID → tarkov.dev 的 normalizedName
const LOCATION_MAP = {
  bigmap: 'customs',
  factory4_day: 'factory',
  factory4_night: 'factory',
  interchange: 'interchange',
  woods: 'woods',
  shoreline: 'shoreline',
  rezervbase: 'reserve',
  laboratory: 'the-lab',
  lighthouse: 'lighthouse',
  tarkovstreets: 'streets-of-tarkov',
  sandbox: 'ground-zero',
  sandbox_high: 'ground-zero',
  labyrinth: 'the-labyrinth'
}

let watchers = []
let logTimer = null

export function parseScreenshotName(name) {
  const m = name.match(SHOT_RE)
  if (!m) return null
  const [x, y, z, qx, qy, qz, qw] = m.slice(1).map(Number)
  // 由四元数求水平朝向（绕 Y 轴的偏航角，单位：度）
  const yaw = (Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)) * 180) / Math.PI
  return { x, y, z, yaw, file: name, time: Date.now() }
}

function watchScreenshots(settings, { onPosition, onStatus }) {
  const dir = settings.screenshotsDir
  if (!dir || !fs.existsSync(dir)) {
    onStatus({ source: 'screenshots', ok: false, code: 'screenshotsMissing', path: dir })
    return
  }
  const seen = new Set()
  const w = fs.watch(dir, (_event, filename) => {
    if (!filename || seen.has(filename) || !/\.(png|jpe?g)$/i.test(filename)) return
    const pos = parseScreenshotName(filename)
    if (!pos) return
    seen.add(filename)
    onPosition(pos)
    if (settings.deleteScreenshots) {
      // 等游戏写完文件再删
      setTimeout(() => fs.unlink(join(dir, filename), () => {}), 3000)
    }
  })
  watchers.push(w)
  onStatus({ source: 'screenshots', ok: true, code: 'screenshotsWatching', path: dir })
}

// 日志行格式参考 TarkovMonitor（https://github.com/the-hideout/TarkovMonitor，GPL-3.0）记录的格式，未复制其代码：
// 2024-05-06 22:58:01.123 +08:00|0.14.x.x|Info|application|TRACE-NetworkGameCreate profileStatus: ... Location: bigmap, ... shortId: ABC123
const LINE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})( [+-]\d{2}:\d{2})?\|(.*)$/gm

function parseTime(date, time, tz) {
  const t = new Date(`${date}T${time}${tz ? tz.trim() : ''}`).getTime()
  return Number.isFinite(t) ? t : Date.now()
}

// 轮询最新的 application 日志，识别当前地图和战局开始时间：
//   TRACE-NetworkGameCreate → 进入某张地图（带战局编号）
//   GameStarting            → PMC 开局倒计时开始
//   GameStarted             → 战局正式开始（PMC 倒计时结束；Scav 进入时）
// 日志中的 Session mode → json.tarkov.dev 的 gameMode
function sessionToGameMode(raw) {
  const s = raw.toLowerCase()
  if (s === 'pve') return 'pve'
  if (s === 'regular') return 'regular'
  if (s === 'pvpseason' || s === 'seasonal') return 'pvp-season'
  return null
}

function watchLogs(settings, { onRaid, onSession, onStatus }) {
  const dir = settings.logsDir
  if (!dir || !fs.existsSync(dir)) {
    onStatus({ source: 'logs', ok: false, code: 'logsMissing', path: dir })
    return
  }
  let currentFile = null
  let offset = 0
  let raid = null // { map, raw, raidId, loadedAt, startingAt, startedAt, online }

  const latestAppLog = () => {
    const folders = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('log_'))
      .map((d) => d.name)
      .sort()
    const latest = folders.at(-1)
    if (!latest) return null
    const f = fs
      .readdirSync(join(dir, latest))
      .filter((n) => /application(_\d+)?\.log$/i.test(n))
      .sort()
      .at(-1)
    return f ? join(dir, latest, f) : null
  }

  let session = null

  const handleLine = (time, msg) => {
    if (msg.includes('Session mode: ')) {
      const mode = sessionToGameMode(msg.match(/Session mode: ([^\s|]+)/)?.[1] ?? '')
      if (mode) session = mode
      return false
    }
    if (msg.includes('TRACE-NetworkGameCreate profileStatus')) {
      const loc = msg.match(/Location: ([^,]+)/)?.[1]?.trim()
      raid = {
        map: loc ? (LOCATION_MAP[loc.toLowerCase()] ?? null) : null,
        raw: loc,
        raidId: msg.match(/shortId: ([A-Z0-9]{6})/)?.[1] ?? null,
        online: msg.includes('RaidMode: Online'),
        loadedAt: time,
        startingAt: null,
        startedAt: null
      }
      return true
    }
    if (!raid) return false
    if (msg.includes('application|GameStarting')) {
      raid = { ...raid, startingAt: time }
      return true
    }
    if (msg.includes('application|GameStarted')) {
      raid = { ...raid, startedAt: time }
      return true
    }
    if (msg.includes('Network game matching aborted') || msg.includes('Network game matching cancelled')) {
      raid = null
      return true
    }
    return false
  }

  const tick = () => {
    try {
      const f = latestAppLog()
      if (!f) return
      if (f !== currentFile) {
        currentFile = f
        offset = 0
      }
      const size = fs.statSync(f).size
      if (size <= offset) return
      const fd = fs.openSync(f, 'r')
      const buf = Buffer.alloc(size - offset)
      fs.readSync(fd, buf, 0, buf.length, offset)
      fs.closeSync(fd)
      const text = buf.toString('utf8')
      // 只处理完整的行，最后半行留到下次
      const end = text.lastIndexOf('\n') + 1
      offset += Buffer.byteLength(text.slice(0, end))
      let changed = false
      const prevSession = session
      for (const m of text.slice(0, end).matchAll(LINE_RE)) {
        if (handleLine(parseTime(m[1], m[2], m[3]), m[4])) changed = true
      }
      if (session && session !== prevSession) onSession?.(session)
      // 太久以前的战局（比如启动本软件时读到的历史记录）不再上报
      if (changed && raid && Date.now() - raid.loadedAt < 3 * 60 * 60 * 1000) {
        onRaid({ ...raid, file: basename(f) })
      }
    } catch (e) {
      onStatus({ source: 'logs', ok: false, code: 'logsReadError', error: e.message })
    }
  }
  tick()
  logTimer = setInterval(tick, 2000)
  onStatus({ source: 'logs', ok: true, code: 'logsWatching', path: dir })
}

export function startWatchers(settings, handlers) {
  watchScreenshots(settings, handlers)
  watchLogs(settings, handlers)
}

export function stopWatchers() {
  for (const w of watchers) w.close()
  watchers = []
  if (logTimer) clearInterval(logTimer)
  logTimer = null
}
