<script setup>
import { ref, computed } from 'vue'
import { t, fmtNum, fmtDate, localeTag } from '../i18n'

// points: [{ timestamp, price, priceMin }]（price = 当日均价，priceMin = 当日最低价）
const props = defineProps({ points: { type: Array, required: true } })

// 颜色取自参考调色板的深色档（已用校验脚本在 #1a1d22 背景上验证通过）
const SERIES = [
  { key: 'price', labelKey: 'chart.avg', color: '#3987e5' },
  { key: 'priceMin', labelKey: 'chart.min', color: '#d95926' }
]
const RANGES = [
  { days: 7 },
  { days: 30 },
  { days: 90 },
  { days: 0 }
]
const range = ref(30)
const showTable = ref(false)
const hover = ref(null)

const W = 560
const H = 220
const PAD = { l: 56, r: 12, t: 12, b: 26 }

const data = computed(() => {
  const all = [...props.points].sort((a, b) => a.timestamp - b.timestamp)
  if (!all.length) return all
  const from = range.value ? all.at(-1).timestamp - range.value * 86400000 : -Infinity
  const inRange = all.filter((p) => p.timestamp >= from)
  if (range.value && range.value <= 7) return inRange
  // 7 天以上按天汇总：均价取平均，最低价取当天最低
  const days = new Map()
  for (const p of inRange) {
    const key = new Date(p.timestamp).toDateString()
    const d = days.get(key) ?? { timestamp: p.timestamp, sum: 0, n: 0, priceMin: Infinity }
    if (p.price > 0) {
      d.sum += p.price
      d.n++
    }
    if (p.priceMin > 0) d.priceMin = Math.min(d.priceMin, p.priceMin)
    days.set(key, d)
  }
  return [...days.values()].map((d) => ({
    timestamp: d.timestamp,
    price: d.n ? d.sum / d.n : 0,
    priceMin: Number.isFinite(d.priceMin) ? d.priceMin : 0
  }))
})

const scale = computed(() => {
  const d = data.value
  if (!d.length) return null
  const t0 = d[0].timestamp
  const t1 = d.at(-1).timestamp || t0 + 1
  // 用 2%~98% 分位数定 Y 轴，个别离谱挂单不会把正常区间压扁；超出的点贴边绘制
  const vals = d
    .flatMap((p) => [p.price, p.priceMin])
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  const q = (f) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(f * (vals.length - 1))))]
  let lo = vals.length > 20 ? q(0.02) : vals[0]
  let hi = vals.length > 20 ? q(0.98) : vals.at(-1)
  if (lo === hi) hi = lo + 1
  const pad = (hi - lo) * 0.08
  lo = Math.max(0, lo - pad)
  hi += pad
  const x = (t) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3)
  const xTicks = [0, 0.5, 1].map((f) => t0 + (t1 - t0) * f)
  return { x, y, ticks, xTicks }
})

const paths = computed(() => {
  const s = scale.value
  if (!s) return []
  return SERIES.map((ser) => ({
    ...ser,
    d: data.value
      .filter((p) => p[ser.key] > 0)
      .map((p, i) => `${i ? 'L' : 'M'}${s.x(p.timestamp).toFixed(1)},${s.y(p[ser.key]).toFixed(1)}`)
      .join('')
  }))
})

// 末端直接标注当前值（每条线只标一个点）
const endLabels = computed(() => {
  const s = scale.value
  const last = data.value.at(-1)
  if (!s || !last) return []
  return SERIES.filter((ser) => last[ser.key] > 0).map((ser) => ({ ...ser, cx: s.x(last.timestamp), cy: s.y(last[ser.key]) }))
})

function onMove(e) {
  const s = scale.value
  if (!s) return
  const svg = e.currentTarget
  const rect = svg.getBoundingClientRect()
  const px = ((e.clientX - rect.left) / rect.width) * W
  let best = null
  for (const p of data.value) {
    const dx = Math.abs(s.x(p.timestamp) - px)
    if (!best || dx < best.dx) best = { dx, p }
  }
  hover.value = best && { p: best.p, x: s.x(best.p.timestamp), left: (s.x(best.p.timestamp) / W) * 100 }
}

const money = (v) => (v > 0 ? `${fmtNum(Math.round(v))} ₽` : '—')
const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : Math.round(v))
const day = (ts) => new Date(ts).toLocaleDateString(localeTag(), { month: 'numeric', day: 'numeric' })
const rangeLabel = (d) => (d ? t('chart.days', { n: d }) : t('common.all'))
</script>

<template>
  <div class="chart">
    <div class="head">
      <div class="legend">
        <span v-for="s in SERIES" :key="s.key" class="key"><i :style="{ background: s.color }"></i>{{ $t(s.labelKey) }}</span>
      </div>
      <div class="ctrl">
        <button v-for="r in RANGES" :key="r.days" :class="{ active: range === r.days }" @click="range = r.days">
          {{ rangeLabel(r.days) }}
        </button>
        <button :class="{ active: showTable }" @click="showTable = !showTable">{{ $t('chart.table') }}</button>
      </div>
    </div>

    <div v-if="!data.length" class="muted empty">{{ $t('chart.empty') }}</div>
    <div v-else-if="!showTable" class="plot">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="$t('chart.aria')" @mousemove="onMove" @mouseleave="hover = null">
        <g class="grid">
          <line v-for="(t, i) in scale.ticks" :key="i" :x1="PAD.l" :x2="W - PAD.r" :y1="scale.y(t)" :y2="scale.y(t)" />
        </g>
        <g class="axis">
          <text v-for="(t, i) in scale.ticks" :key="i" :x="PAD.l - 8" :y="scale.y(t) + 4" text-anchor="end">{{ short(t) }}</text>
          <text
            v-for="(t, i) in scale.xTicks"
            :key="'x' + i"
            :x="scale.x(t)"
            :y="H - 6"
            :text-anchor="i === 0 ? 'start' : i === 2 ? 'end' : 'middle'"
          >
            {{ day(t) }}
          </text>
        </g>
        <path v-for="p in paths" :key="p.key" :d="p.d" :stroke="p.color" class="line" />
        <circle v-for="l in endLabels" :key="l.key" :cx="l.cx" :cy="l.cy" r="4" :fill="l.color" class="dot" />
        <g v-if="hover">
          <line class="cross" :x1="hover.x" :x2="hover.x" :y1="PAD.t" :y2="H - PAD.b" />
          <template v-for="s in SERIES" :key="s.key">
            <circle v-if="hover.p[s.key] > 0" :cx="hover.x" :cy="scale.y(hover.p[s.key])" r="4" :fill="s.color" class="dot" />
          </template>
        </g>
      </svg>
      <div v-if="hover" class="tip" :style="{ left: `${Math.min(Math.max(hover.left, 18), 78)}%` }">
        <div class="tip-date">{{ fmtDate(hover.p.timestamp) }}</div>
        <div v-for="s in SERIES" :key="s.key" class="tip-row">
          <i :style="{ background: s.color }"></i>{{ $t(s.labelKey) }}<b>{{ money(hover.p[s.key]) }}</b>
        </div>
      </div>
    </div>
    <div v-else class="table">
      <table>
        <thead>
          <tr><th>{{ $t('chart.date') }}</th><th>{{ $t('chart.avg') }}</th><th>{{ $t('chart.min') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in [...data].reverse()" :key="p.timestamp">
            <td>{{ fmtDate(p.timestamp) }}</td>
            <td>{{ money(p.price) }}</td>
            <td>{{ money(p.priceMin) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.chart { display: flex; flex-direction: column; gap: 8px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.legend { display: flex; gap: 12px; font-size: 12px; color: var(--muted); }
.key { display: flex; align-items: center; gap: 5px; }
.key i, .tip-row i { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
.ctrl { display: flex; gap: 4px; }
.ctrl button { padding: 1px 8px; font-size: 12px; }
.plot { position: relative; }
svg { width: 100%; height: auto; display: block; }
.grid line { stroke: var(--border); stroke-width: 1; }
.axis text { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.dot { stroke: var(--panel); stroke-width: 2; }
.cross { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
.tip {
  position: absolute; top: 4px; transform: translateX(-50%); pointer-events: none;
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 12px; min-width: 140px;
}
.tip-date { color: var(--muted); margin-bottom: 2px; }
.tip-row { display: flex; align-items: center; gap: 6px; }
.tip-row b { margin-left: auto; font-weight: 600; font-variant-numeric: tabular-nums; }
.table { max-height: 240px; overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 3px 6px; border-bottom: 1px solid var(--border); }
th:first-child, td:first-child { text-align: left; }
.empty { padding: 20px 0; text-align: center; }
</style>
