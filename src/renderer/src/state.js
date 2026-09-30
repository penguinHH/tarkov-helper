import { reactive, watch } from 'vue'
import { t } from './i18n'

// 三种服务器，对应 json.tarkov.dev 的 gameMode；名称随界面语言变化
export const MODES = [{ id: 'regular' }, { id: 'pve' }, { id: 'pvp-season' }]
export const modeLabel = (id) => t(`mode.${id}`)

// 全局界面状态（游戏模式等），记在 localStorage 里
function load() {
  try {
    return JSON.parse(localStorage.getItem('ui-state')) ?? {}
  } catch {
    return {}
  }
}

export const state = reactive({
  gameMode: 'regular', // 'regular' = PVP，'pve' = PVE，'pvp-season' = 赛季服
  autoMode: true, // 根据游戏日志自动切换服务器
  ...load(),
  // 以下为运行时数据，不持久化
  sessionMode: null, // 日志识别到的当前服务器
  player: null, // 最近一次截图定位 { x, y, z, yaw, time }
  raidMap: null, // 日志识别到的当前地图 normalizedName
  // 战局计时：startedAt 为战局开始的现实时间（ms），来自日志 GameStarted 或手动校准
  raid: { map: null, raidId: null, startedAt: null, source: null },
  watchStatus: {} // { screenshots: { ok, code, path, error }, logs: {...} }
})

// 手动设置战局开始时间（例如按剩余时间校准）
export function setRaidStart(map, startedAt, source = 'manual') {
  state.raid = { ...state.raid, map, startedAt, source }
}

watch(
  () => [state.gameMode, state.autoMode],
  () => {
    try {
      localStorage.setItem('ui-state', JSON.stringify({ gameMode: state.gameMode, autoMode: state.autoMode }))
    } catch {
      // 忽略
    }
  }
)

// 桌面端事件（浏览器里单独打开页面时 window.desktop 不存在）
const desktop = window.desktop
if (desktop) {
  desktop.onPosition((p) => (state.player = p))
  desktop.onRaid((r) => {
    if (r.map) state.raidMap = r.map
    // 新战局：地图/编号变化时重置计时；GameStarted 到来时写入开始时间
    const isNew = r.raidId !== state.raid.raidId
    state.raid = {
      map: r.map ?? state.raid.map,
      raidId: r.raidId,
      startedAt: r.startedAt ?? (isNew ? null : state.raid.startedAt),
      source: r.startedAt ? 'log' : isNew ? null : state.raid.source
    }
  })
  desktop.onSession((mode) => {
    state.sessionMode = mode
    if (state.autoMode && MODES.some((m) => m.id === mode)) state.gameMode = mode
  })
  desktop.onWatchStatus((s) => (state.watchStatus = { ...state.watchStatus, [s.source]: s }))
}

// ---------- 任务进度 ----------
// taskProgress: { [mode]: { [taskId]: { status: 'started'|'failed'|'finished'|null, time, source } } }
export const taskProgress = reactive({ regular: {}, pve: {}, 'pvp-season': {} })
export const TASK_STATUS = {
  started: { get label() { return t('taskStatus.started') }, color: '#e5c94a' },
  finished: { get label() { return t('taskStatus.finished') }, color: '#4caf7a' },
  failed: { get label() { return t('taskStatus.failed') }, color: '#e06464' }
}

function applyProgress(p) {
  for (const m of Object.keys(taskProgress)) taskProgress[m] = p?.[m] ?? {}
}

export const taskStatus = (taskId, mode = state.gameMode) => taskProgress[mode]?.[taskId]?.status ?? null

// 手动标记（status 为 null 表示重置为未接）
export async function setTaskStatus(taskId, status, mode = state.gameMode) {
  if (desktop?.setTaskStatus) {
    applyProgress(await desktop.setTaskStatus(mode, taskId, status))
    return
  }
  taskProgress[mode] = { ...taskProgress[mode], [taskId]: { status, time: Date.now(), source: 'manual' } }
  try {
    localStorage.setItem('task-progress', JSON.stringify(taskProgress))
  } catch {
    // 忽略
  }
}

if (desktop?.getTaskProgress) {
  desktop.getTaskProgress().then(applyProgress)
  desktop.onTaskProgress(applyProgress)
} else {
  try {
    applyProgress(JSON.parse(localStorage.getItem('task-progress')))
  } catch {
    // 忽略
  }
}
