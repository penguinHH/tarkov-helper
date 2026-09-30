// 时间换算公式来自 tarkov-time（https://github.com/adamburgess/tarkov-time，MIT，Copyright 2020 Adam Burgess）。
// 许可证全文见 THIRD_PARTY_NOTICES.md。
// 塔科夫游戏内时间 = 现实时间 × 7，基准为莫斯科时间（UTC+3）；
// 右侧时间与左侧相差 12 小时。
import { t } from '../i18n'

const RATIO = 7
const DAY = 24 * 60 * 60 * 1000
const MOSCOW = 3 * 60 * 60 * 1000

export function tarkovTime(now = Date.now(), right = false) {
  const ms = (MOSCOW + (right ? DAY / 2 : 0) + now * RATIO) % DAY
  return formatHMS(ms)
}

export function formatHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function timeAgo(ts, now = Date.now()) {
  const diff = Math.max(0, now - Number(ts))
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('time.justNow')
  if (min < 60) return t('time.minutesAgo', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('time.hoursAgo', { n: h })
  return t('time.daysAgo', { n: Math.floor(h / 24) })
}
