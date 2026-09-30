import L from 'leaflet'

export const COLORS = {
  pmc: '#00e599',
  shared: '#00e4e5',
  scav: '#ff7800',
  transit: '#e53500',
  quest: '#e5e200',
  hazard: '#ff3b3b',
  boss: '#ff4d4d'
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// 所有标记都用「零尺寸锚点 + 内部元素居中」的方式，
// 因为 Leaflet 会用内联 transform 定位图标，外层不能再加 transform。
function anchored(inner) {
  return L.divIcon({ className: 'mk-anchor', html: inner, iconSize: [0, 0] })
}

// 带文字的标签（撤离点、转移点、BTR 等）
export function labelIcon(cls, text) {
  return anchored(`<span class="mk mk-label ${cls}">${esc(text)}</span>`)
}

// 圆形图标，glyph 为单个字符/符号
export function pinIcon(cls, glyph = '') {
  return anchored(`<span class="mk mk-pin ${cls}">${esc(glyph)}</span>`)
}

// 物品图片图标（散落物资、任务物品）
export function imageIcon(src, cls = '') {
  return anchored(`<span class="mk mk-img ${cls}"><img src="${esc(src)}" loading="lazy" /></span>`)
}

// 地名标签
export function placeIcon(text, size = 100, rotation = 0) {
  return anchored(
    `<span class="mk mk-place" style="font-size:${size / 100}em;transform:translate(-50%,-50%) rotate(${rotation}deg)">${esc(text)}</span>`
  )
}

export function playerIcon() {
  return anchored('<span class="mk mk-player"></span>')
}

// 容器类型 → 颜色（按名称哈希，保证同类容器颜色固定）
export function hashColor(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 55% 45%)`
}
