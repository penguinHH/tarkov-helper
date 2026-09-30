<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import L from 'leaflet'
import { state, setRaidStart, taskStatus, taskProgress } from '../state'
import { fetchMapData, fetchMapsMeta, fetchSvg } from '../api/tarkov'
import { getCRS, getBounds, getScaledBounds, pos } from '../map/crs'
import { buildLayers } from '../map/layers'
import { isOnActiveLevel, levelOf } from '../map/levels'
import { playerIcon, esc } from '../map/icons'
import LayerPanel from '../components/LayerPanel.vue'
import { i18n, t, dataLang, fmtDateTime, fmtTime } from '../i18n'
import BtrPanel from '../components/BtrPanel.vue'
import { loadConfig, saveConfig, buildSchedule, predict, nextArrivals, learnFromCalibration, mmss } from '../map/btr'

const route = useRoute()
const router = useRouter()

const mapEl = ref(null)
const leaflet = shallowRef(null)
const mapData = shallowRef(null) // { maps, items, categories }
const meta = ref({})
const error = ref(null)
const cachedAt = ref(null)
const loading = ref(true)
const currentLevel = ref(null) // meta.layers 下标，null = 地面
const baseStyle = ref('svg') // 两种底图都有时：'svg' 矢量图 | 'tile' 卫星图
const followRaid = ref(true)
const showPanel = ref(true)
const groups = shallowRef([])
const entries = shallowRef([])
const query = ref('')
const coords = ref(null)

// ---------- 图层显隐（记住用户选择） ----------
// 默认只开撤离、Boss、地名、BTR、危险区；任务/容器/物资数量多，按需打开
const DEFAULT_ON = /^(extract_|transit$|spawn_boss$|quest_active$|place_names$|btr_stop$|btr_route$|hazard_)/
function loadVisible() {
  try {
    return JSON.parse(localStorage.getItem('map-visible')) ?? {}
  } catch {
    return {}
  }
}
const visible = reactive(loadVisible())
watch(visible, () => {
  try {
    localStorage.setItem('map-visible', JSON.stringify(visible))
  } catch {
    // 忽略
  }
})

const currentKey = computed(() => route.params.map || state.raidMap || 'customs')
const current = computed(() => mapData.value?.maps.find((m) => m.normalizedName === currentKey.value))
const currentMeta = computed(() => meta.value[currentKey.value])
const useSvg = computed(
  () => Boolean(currentMeta.value?.svgPath) && (baseStyle.value === 'svg' || !currentMeta.value?.tilePath)
)
// 只列出有底图的地图；数据源不可用时退回用底图元数据里的地图名
const mapList = computed(() =>
  mapData.value
    ? mapData.value.maps.filter((m) => meta.value[m.normalizedName])
    : Object.keys(meta.value).map((k) => ({ normalizedName: k, name: k }))
)
const levels = computed(() =>
  (currentMeta.value?.layers ?? [])
    .map((l, i) => ({ ...l, index: i }))
    .filter((l) => l.tilePath || (l.svgLayer && useSvg.value))
)

let baseLayer = null
let levelTileLayer = null
let svgRoot = null
let builtLayers = {}
let playerMarker = null
let btrLayer = null
let btrMarker = null

async function loadMeta() {
  try {
    meta.value = (await fetchMapsMeta(dataLang())).data
  } catch (e) {
    error.value = e
  }
}

async function loadData() {
  loading.value = true
  try {
    const r = await fetchMapData(state.gameMode, dataLang())
    mapData.value = r.data
    cachedAt.value = r.cachedAt
    error.value = r.error
  } catch (e) {
    error.value = e
    cachedAt.value = null
  } finally {
    loading.value = false
  }
}

// ---------- 地图构建 ----------
function buildMap() {
  const m = currentMeta.value
  if (!m || !mapEl.value) return

  // 同一张图重建（如任务进度变化）时保留视野和楼层
  const keep =
    leaflet.value && leaflet.value.options.mapKey === currentKey.value
      ? { center: leaflet.value.getCenter(), zoom: leaflet.value.getZoom(), level: currentLevel.value }
      : null
  // CRS 与地图绑定，换图时重建 Leaflet 实例
  leaflet.value?.remove()
  baseLayer = levelTileLayer = svgRoot = playerMarker = btrLayer = btrMarker = null
  builtLayers = {}
  groups.value = []
  entries.value = []

  const maxZoom = Math.max(7, m.maxZoom)
  const map = L.map(mapEl.value, {
    crs: getCRS(m),
    minZoom: m.minZoom,
    maxZoom,
    zoomSnap: 0.25,
    maxBounds: getScaledBounds(m.bounds, 1.5),
    mapKey: currentKey.value
  })
  map.attributionControl.setPrefix(false)
  map.attributionControl.addAttribution(
    `${esc(t('map.attribution'))}<a href="https://tarkov.dev" target="_blank">tarkov.dev</a>${m.author ? ` / ${esc(m.author)}` : ''}`
  )
  leaflet.value = map
  const bounds = getBounds(m.bounds)
  // 窗口较小时，元数据给的 minZoom 可能装不下整张图，放宽到刚好能看全
  map.setMinZoom(Math.min(m.minZoom, Math.floor(map.getBoundsZoom(bounds) * 4) / 4))
  if (keep) map.setView(keep.center, keep.zoom, { animate: false })
  else map.fitBounds(bounds)
  currentLevel.value = keep?.level ?? null

  map.on('mousemove', (e) => (coords.value = { x: e.latlng.lng, z: e.latlng.lat }))
  map.on('mouseout', () => (coords.value = null))

  if (useSvg.value) {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    baseLayer = L.svgOverlay(svgEl, m.svgBounds ? getBounds(m.svgBounds) : bounds).addTo(map)
    fetchSvg(m.svgPath)
      .then((text) => {
        if (leaflet.value !== map) return
        svgEl.innerHTML = text
        const inner = svgEl.children[0]
        svgEl.setAttribute('viewBox', inner.getAttribute('viewBox'))
        svgRoot = inner
        applyLevel()
      })
      .catch((e) => (error.value = e))
  } else if (m.tilePath) {
    baseLayer = L.tileLayer(m.tilePath, {
      tileSize: m.tileSize || 256,
      bounds,
      maxZoom,
      maxNativeZoom: m.maxZoom
    }).addTo(map)
  }

  if (current.value && mapData.value) {
    const built = buildLayers(map, m, { ...current.value, shared: mapData.value }, { taskStatus: (id) => taskStatus(id) })
    builtLayers = built.layers
    for (const entry of built.entries) {
      entry.marker.on('add', () => markLevel(entry))
      // 点击不在当前楼层的标记 → 切到它所在的楼层
      entry.marker.on('click', () => {
        if (entry.offLevel) {
          const lv = levelOf(entry, m)
          if (lv !== currentLevel.value) currentLevel.value = lv
        }
      })
    }
    for (const g of built.groups) {
      for (const i of g.items) if (!(i.key in visible)) visible[i.key] = DEFAULT_ON.test(i.key)
    }
    // BTR 路线预测图层（放在「地标」分组里）
    if (btrStops.value.length) {
      btrLayer = L.layerGroup()
      builtLayers.btr_route = btrLayer
      const item = { key: 'btr_route', label: t('btr.title'), color: '#d7e07a', count: btrStops.value.length }
      const landmarks = built.groups.find((g) => g.key === 'landmarks')
      if (landmarks) landmarks.items.push(item)
      else built.groups.push({ key: 'landmarks', label: t('layers.g.landmarks'), items: [item] })
      if (!('btr_route' in visible)) visible.btr_route = true
    }
    groups.value = built.groups
    entries.value = built.entries
    syncLayers()
    drawBtrRoute()
    drawBtrMarker()
    if (keep?.level != null) applyLevel()
    focusTask()
  }
  updatePlayer(false)
}

function syncLayers() {
  const map = leaflet.value
  if (!map) return
  for (const [k, layer] of Object.entries(builtLayers)) {
    if (visible[k]) layer.addTo(map)
    else map.removeLayer(layer)
  }
}

// ---------- 楼层 ----------
function markLevel(entry) {
  const m = currentMeta.value
  if (!m || !entry.position) return
  entry.offLevel = !isOnActiveLevel(entry, m, currentLevel.value)
  entry.marker.getElement()?.classList.toggle('off-level', entry.offLevel)
  entry.outline?.getElement()?.classList.toggle('off-level', entry.offLevel)
}

function applyLevel() {
  const map = leaflet.value
  const m = currentMeta.value
  if (!map || !m) return
  const layer = currentLevel.value != null ? m.layers[currentLevel.value] : null
  const dimBase = Boolean(layer) && !layer.show

  // SVG：顶层 <g id> 分组对应楼层，只显示地面 + 当前楼层
  if (svgRoot) {
    for (const g of svgRoot.children) {
      if (g.nodeName !== 'g' || !g.id) continue
      const isBase = g.id === m.svgLayer || g.dataset.keepWithGroup === m.svgLayer
      const isActive = Boolean(layer?.svgLayer) && useSvg.value && g.id === layer.svgLayer
      g.style.display = isBase || isActive ? '' : 'none'
      g.style.opacity = isBase && dimBase ? '0.35' : ''
    }
  } else {
    baseLayer?.getContainer?.()?.classList.toggle('off-level', dimBase)
  }

  // 瓦片楼层：卫星图模式，或该楼层没有矢量图层时
  if (levelTileLayer) map.removeLayer(levelTileLayer)
  levelTileLayer = null
  if (layer?.tilePath && (!useSvg.value || !layer.svgLayer)) {
    levelTileLayer = L.tileLayer(layer.tilePath, {
      tileSize: m.tileSize || 256,
      bounds: getBounds(m.bounds),
      maxZoom: Math.max(7, m.maxZoom),
      maxNativeZoom: m.maxZoom
    }).addTo(map)
  }

  for (const entry of entries.value) markLevel(entry)
}

// ---------- 搜索（支持多个关键词，空格或逗号分隔） ----------
const layerLabels = computed(() => {
  const out = {}
  for (const g of groups.value) for (const i of g.items) out[i.key] = `${g.label} · ${i.label}`
  return out
})
const results = computed(() => {
  const words = query.value.trim().toLowerCase().split(/[\s,，]+/).filter(Boolean)
  if (!words.length) return []
  const out = []
  for (const e of entries.value) {
    if (!e.search || !e.position) continue
    const text = e.search.toLowerCase()
    if (words.some((w) => text.includes(w))) out.push(e)
    if (out.length >= 100) break
  }
  return out
})

function focusEntry(e) {
  const map = leaflet.value
  visible[e.key] = true
  const lv = e.offLevel ? levelOf(e, currentMeta.value) : currentLevel.value
  if (lv !== currentLevel.value) currentLevel.value = lv
  map.setView(pos(e.position), Math.max(map.getZoom(), currentMeta.value.maxZoom - 1))
  setTimeout(() => e.marker.openPopup(), 50)
}

const resultTitle = (e) => (e.search.length > 40 ? `${e.search.slice(0, 40)}…` : e.search)

// ---------- 从任务详情页跳转过来：?task=<id> 只看这个任务 ----------
function focusTask() {
  const id = route.query.task
  const map = leaflet.value
  if (!id || !map) return
  const list = entries.value.filter((e) => e.taskId === id && e.position)
  if (!list.length) return
  for (const e of list) visible[e.key] = true
  // 目标都在同一个楼层时，自动切过去
  const lvs = new Set(list.map((e) => levelOf(e, currentMeta.value)))
  if (lvs.size === 1) {
    const [lv] = lvs
    if (lv !== currentLevel.value && list.every((e) => !isOnActiveLevel(e, currentMeta.value, currentLevel.value))) {
      currentLevel.value = lv
    }
  }
  if (list.length === 1) map.setView(pos(list[0].position), Math.max(map.getZoom(), currentMeta.value.maxZoom - 1))
  else map.fitBounds(L.latLngBounds(list.map((e) => pos(e.position))), { padding: [60, 60], maxZoom: currentMeta.value.maxZoom })
  for (const e of list) e.marker.getElement()?.classList.add('focus')
  setTimeout(() => list[0].marker.openPopup(), 100)
}

// ---------- BTR 路线预测 ----------
const now = ref(Date.now())
const btrStops = computed(() => current.value?.btrStops?.filter((s) => s.position) ?? [])
const btrByName = computed(() => Object.fromEntries(btrStops.value.map((s) => [s.name, s])))
const btrCfg = ref(null)
const btrAnchor = ref(null) // { name, arrive, raidKey }
const btrMessage = ref('')
const raidDuration = computed(() => (current.value?.raidDuration ?? 40) * 60)
const raidKey = computed(() => state.raid.raidId ?? state.raid.startedAt)
const elapsed = computed(() => {
  if (!state.raid.startedAt) return null
  const e = (now.value - state.raid.startedAt) / 1000
  return e < 0 || e > raidDuration.value + 600 ? null : Math.min(e, raidDuration.value)
})
const btrSchedule = computed(() =>
  btrCfg.value && btrAnchor.value ? buildSchedule(btrCfg.value, btrByName.value, btrAnchor.value, raidDuration.value) : []
)
const btrPrediction = computed(() =>
  elapsed.value != null && btrSchedule.value.length ? predict(btrSchedule.value, btrByName.value, elapsed.value) : null
)
const btrArrivals = computed(() => (elapsed.value != null ? nextArrivals(btrSchedule.value, elapsed.value) : {}))

function loadBtr() {
  btrMessage.value = ''
  if (!btrStops.value.length) {
    btrCfg.value = null
    btrAnchor.value = null
    return
  }
  btrCfg.value = loadConfig(currentKey.value, btrStops.value)
  // 校准锚点只对同一局有效
  try {
    const a = JSON.parse(localStorage.getItem(`btr-anchor:${currentKey.value}`))
    btrAnchor.value = a && a.raidKey === raidKey.value ? a : null
  } catch {
    btrAnchor.value = null
  }
}
function saveAnchor() {
  try {
    localStorage.setItem(`btr-anchor:${currentKey.value}`, JSON.stringify(btrAnchor.value))
  } catch {
    // 忽略
  }
}

function btrStartNow() {
  setRaidStart(currentKey.value, Date.now())
}
function btrSetRemaining(sec) {
  setRaidStart(currentKey.value, Date.now() - (raidDuration.value - sec) * 1000)
}
function btrCalibrate(name, kind) {
  if (elapsed.value == null) return
  const cur = { name, arrive: kind === 'arrive' ? elapsed.value : elapsed.value - btrCfg.value.wait, raidKey: raidKey.value }
  const r = learnFromCalibration(btrCfg.value, btrAnchor.value, cur)
  if (r.reversed) {
    btrCfg.value.order.reverse()
    btrMessage.value = t('btr.msgReversed')
  } else if (r.learned) {
    btrMessage.value = t('btr.msgLearned', { segment: r.learned.replace('>', ' → '), time: mmss(r.seconds) })
  } else {
    btrMessage.value = t(kind === 'arrive' ? 'btr.msgCalibratedArrive' : 'btr.msgCalibratedDepart', { name })
  }
  btrAnchor.value = cur
  saveAnchor()
}
function btrClearAnchor() {
  btrAnchor.value = null
  btrMessage.value = ''
  saveAnchor()
}
function btrMove(i, d) {
  const o = btrCfg.value.order
  ;[o[i], o[i + d]] = [o[i + d], o[i]]
}
function btrResetConfig() {
  try {
    localStorage.removeItem(`btr:${currentKey.value}`)
  } catch {
    // 忽略
  }
  btrCfg.value = loadConfig(currentKey.value, btrStops.value)
  btrMessage.value = t('btr.msgReset')
}

// 站点顺序连线（只示意顺序，不是实际道路）
function drawBtrRoute() {
  if (!btrLayer || !btrCfg.value) return
  btrLayer.eachLayer((l) => l !== btrMarker && btrLayer.removeLayer(l))
  const pts = btrCfg.value.order
    .map((n) => btrByName.value[n])
    .filter(Boolean)
    .map((s) => pos(s.position))
  if (pts.length < 2) return
  L.polyline([...pts, pts[0]], { color: '#d7e07a', weight: 2, opacity: 0.6, dashArray: '6 6', interactive: false }).addTo(btrLayer)
  // 方向箭头：画在每段 2/3 处，指向下一站
  for (let i = 0; i < pts.length; i++) {
    const a = L.latLng(pts[i])
    const b = L.latLng(pts[(i + 1) % pts.length])
    const at = L.latLng(a.lat + (b.lat - a.lat) * 0.66, a.lng + (b.lng - a.lng) * 0.66)
    const pa = leaflet.value.latLngToLayerPoint(a)
    const pb = leaflet.value.latLngToLayerPoint(b)
    const deg = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI
    L.marker(at, {
      icon: L.divIcon({ className: 'mk-anchor', html: `<span class="mk mk-arrow" style="--r:${deg}deg">➤</span>`, iconSize: [0, 0] }),
      interactive: false
    }).addTo(btrLayer)
  }
}

function drawBtrMarker() {
  if (!btrLayer) return
  const p = btrPrediction.value
  if (!p || p.status === 'unknown') {
    if (btrMarker) btrLayer.removeLayer(btrMarker)
    btrMarker = null
    return
  }
  const text = p.status === 'stopped' ? t('btr.markerStopped', { time: mmss(p.departIn) }) : `→ ${p.to} · ${mmss(p.arriveIn)}`
  const icon = L.divIcon({
    className: 'mk-anchor',
    html: `<span class="mk mk-btr"><b>BTR</b><em>${esc(text)}</em></span>`,
    iconSize: [0, 0]
  })
  if (!btrMarker) btrMarker = L.marker(pos(p.position), { icon, zIndexOffset: 900, interactive: false }).addTo(btrLayer)
  else {
    btrMarker.setLatLng(pos(p.position))
    btrMarker.setIcon(icon)
  }
}

let clockTimer = null

// ---------- 玩家位置（截图定位） ----------
function updatePlayer(pan = true) {
  const map = leaflet.value
  const p = state.player
  if (!map || !p) return
  const latlng = pos(p)
  if (!playerMarker) playerMarker = L.marker(latlng, { icon: playerIcon(), zIndexOffset: 1000 }).addTo(map)
  else playerMarker.setLatLng(latlng)
  // 地图本身可能旋转过，朝向要叠加 coordinateRotation
  playerMarker
    .getElement()
    ?.querySelector('.mk')
    ?.style.setProperty('--yaw', `${p.yaw + (currentMeta.value?.coordinateRotation ?? 0)}deg`)
  playerMarker.bindTooltip(t('map.you', { time: fmtTime(p.time) }))
  if (pan) map.panTo(latlng)
}

function selectMap(key) {
  followRaid.value = false
  router.replace(`/map/${key}`)
}

// 容器尺寸变化（窗口缩放、侧栏开合）后让 Leaflet 重新计算大小
const resizeObserver = new ResizeObserver(() => leaflet.value?.invalidateSize())

onMounted(() => {
  clockTimer = setInterval(() => (now.value = Date.now()), 1000)
  resizeObserver.observe(mapEl.value)
  loadMeta()
  loadData()
})
onUnmounted(() => {
  clearInterval(clockTimer)
  resizeObserver.disconnect()
  leaflet.value?.remove()
})

watch(() => state.gameMode, loadData)
watch(
  () => i18n.locale,
  () => {
    loadMeta()
    loadData()
  }
)
watch([currentMeta, current, baseStyle], buildMap, { flush: 'post' })
watch(currentLevel, applyLevel)
watch(visible, syncLayers)
watch(() => state.player, () => updatePlayer())
// 任务进度变化（日志 / 手动标记）→ 重建任务图层；跳转带 ?task 时定位
const progressKey = computed(() => JSON.stringify(taskProgress[state.gameMode] ?? {}))
watch(progressKey, () => buildMap())
watch(() => route.query.task, focusTask)
// BTR：换图重新载入配置；配置变化保存并重画路线；每秒更新预测位置
watch([currentKey, () => btrStops.value.length], loadBtr, { immediate: true })
watch(raidKey, () => {
  if (btrAnchor.value && btrAnchor.value.raidKey !== raidKey.value) btrClearAnchor()
})
watch(
  btrCfg,
  (cfg) => {
    if (!cfg) return
    saveConfig(currentKey.value, cfg)
    drawBtrRoute()
  },
  { deep: true }
)
watch(btrPrediction, drawBtrMarker)
// 日志识别到新战局时自动切换地图
watch(
  () => state.raidMap,
  (m) => {
    if (m && followRaid.value) router.replace(`/map/${m}`)
  }
)
</script>

<template>
  <div class="map-page">
    <div class="toolbar">
      <div class="maps">
        <button
          v-for="m in mapList"
          :key="m.normalizedName"
          :class="{ active: m.normalizedName === currentKey }"
          @click="selectMap(m.normalizedName)"
        >
          {{ m.name }}
        </button>
      </div>
      <div class="options">
        <span v-if="current" class="info">
          <b>{{ current.name }}</b>
          <span class="muted">{{ $t('map.raidInfo', { min: current.raidDuration, players: current.players }) }}</span>
        </span>
        <select v-if="currentMeta?.tilePath && currentMeta.svgPath" v-model="baseStyle">
          <option value="svg">{{ $t('map.vector') }}</option>
          <option value="tile">{{ $t('map.satellite') }}</option>
        </select>
        <select v-if="levels.length" v-model="currentLevel">
          <option :value="null">{{ $t('map.ground') }}</option>
          <option v-for="l in levels" :key="l.index" :value="l.index">{{ l.name }}</option>
        </select>
        <label :title="$t('map.followRaidTip')"><input v-model="followRaid" type="checkbox" />{{ $t('map.followRaid') }}</label>
        <span v-if="state.player" class="muted">· {{ $t('map.located') }}</span>
        <span class="spacer"></span>
        <button @click="showPanel = !showPanel">{{ showPanel ? $t('map.hidePanel') : $t('map.showPanel') }}</button>
      </div>
    </div>

    <div v-if="error" class="notice" :class="{ err: !cachedAt }">
      {{
        cachedAt
          ? $t('common.cachedNotice', { time: fmtDateTime(cachedAt) })
          : $t('map.markersFailed', { error: error.message })
      }}
    </div>

    <div class="body">
      <div ref="mapEl" class="map">
        <div v-if="!currentMeta" class="placeholder muted">{{ $t('map.loadingMap') }}</div>
        <div v-if="coords" class="coords">X {{ coords.x.toFixed(1) }} · Z {{ coords.z.toFixed(1) }}</div>
      </div>

      <aside v-show="showPanel" class="side">
        <BtrPanel
          v-if="btrCfg"
          :cfg="btrCfg"
          :duration="raidDuration"
          :elapsed="elapsed"
          :clock-source="state.raid.source"
          :prediction="btrPrediction"
          :arrivals="btrArrivals"
          :anchor="btrAnchor"
          :message="btrMessage"
          @start-now="btrStartNow"
          @set-remaining="btrSetRemaining"
          @calibrate="btrCalibrate"
          @clear-anchor="btrClearAnchor"
          @reverse="btrCfg.order.reverse()"
          @move="btrMove"
          @reset-config="btrResetConfig"
        />
        <input v-model="query" type="text" class="search" :placeholder="$t('map.searchPlaceholder')" />
        <div v-if="query.trim()" class="results">
          <div v-if="!results.length" class="muted">{{ $t('map.noResults') }}</div>
          <button v-for="(r, i) in results" :key="i" class="result" @click="focusEntry(r)">
            <span>{{ resultTitle(r) }}</span>
            <span class="muted">{{ layerLabels[r.key] }}</span>
          </button>
        </div>
        <div v-if="loading && !groups.length" class="muted">{{ $t('map.loadingMarkers') }}</div>
        <LayerPanel v-else :groups="groups" :visible="visible" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.map-page { display: flex; flex-direction: column; height: 100%; min-height: 480px; }
.toolbar { display: flex; flex-direction: column; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel); }
.maps { display: flex; flex-wrap: wrap; gap: 6px; }
.options { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.options label { display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
.options select { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; }
.info { display: flex; gap: 8px; align-items: baseline; }
.spacer { flex: 1; }
.notice { margin: 8px 16px 0; }
.body { flex: 1; min-height: 360px; display: flex; }
.map { flex: 1; min-width: 0; background: #0b0c0e; position: relative; }
.placeholder { position: absolute; inset: 0; display: grid; place-items: center; }
.coords {
  position: absolute; left: 8px; bottom: 8px; z-index: 1000; pointer-events: none;
  background: rgba(0, 0, 0, 0.6); padding: 2px 8px; border-radius: 4px; font-size: 12px; font-variant-numeric: tabular-nums;
}
.side { width: 300px; flex-shrink: 0; border-left: 1px solid var(--border); background: var(--panel); padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.search { width: 100%; }
.results { display: flex; flex-direction: column; gap: 2px; max-height: 45%; overflow: auto; border-bottom: 1px solid var(--border); padding-bottom: 8px; flex-shrink: 0; }
.result { display: flex; flex-direction: column; align-items: flex-start; text-align: left; border: none; background: none; padding: 4px 6px; font-size: 13px; }
.result:hover { background: var(--panel-2); }
.result .muted { font-size: 11px; }
</style>

<style>
/* Leaflet 标记（非 scoped，Leaflet 在组件外创建 DOM） */
.leaflet-container { background: #0b0c0e; font: inherit; }
.mk-anchor { background: none; border: none; }
.mk { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; }
.leaflet-marker-icon.off-level { opacity: 0.3; }
.leaflet-container path.off-level { opacity: 0.3; }
.leaflet-layer.off-level { opacity: 0.35; }
.mk-outline.hidden { display: none; }

.mk-label { font-size: 11px; padding: 1px 5px; border-radius: 4px; color: #fff; border: 1px solid rgba(0, 0, 0, 0.6); }
.mk-label.extract.pmc { background: #0d7a55; }
.mk-label.extract.shared { background: #0b7475; }
.mk-label.extract.scav { background: #a65000; }
.mk-label.transit { background: #9c2600; }
.mk-label.btr { background: #5b6b2b; }

.mk-pin {
  width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  font-size: 11px; line-height: 1; color: #fff; border: 1px solid rgba(0, 0, 0, 0.7); box-shadow: 0 0 2px #000;
}
.mk-pin.boss { width: 22px; height: 22px; background: #b31d1d; font-size: 14px; }
.mk-pin.spawn-pmc { width: 10px; height: 10px; background: #4c9bd0; }
.mk-pin.spawn-scav { width: 8px; height: 8px; background: #8fae5a; }
.mk-pin.spawn-sniper { background: #7e4aa6; }
.mk-pin.quest { background: #b8b400; color: #111; font-weight: 700; }
.mk-pin.lock { background: #6b5518; }
.mk-pin.switch { background: #6b6418; }
.mk-pin.stationary { background: #555; font-size: 14px; }
.mk-pin.hazard { background: #8a1c1c; }
.mk-pin.loot { width: 12px; height: 12px; background: #8b7a4e; }

.mk-box {
  width: 16px; height: 16px; border-radius: 3px; display: grid; place-items: center;
  font-size: 10px; color: #fff; border: 1px solid rgba(0, 0, 0, 0.7);
}
.mk-img { width: 22px; height: 22px; border-radius: 3px; background: rgba(20, 20, 20, 0.85); border: 1px solid #777; display: grid; place-items: center; }
.leaflet-container .mk-img img { width: 20px !important; height: 20px !important; max-width: none !important; object-fit: contain; }
.mk-img.quest { border-color: #e5e200; box-shadow: 0 0 4px #e5e200; }
.mk-img.quest.active, .mk-pin.quest.active { border: 2px solid #ffd23f; box-shadow: 0 0 10px 2px #ffd23f; }
.mk-pin.quest.active { background: #ffd23f; }
.leaflet-marker-icon.focus .mk { outline: 3px solid #fff; outline-offset: 2px; border-radius: 4px; animation: mk-pulse 1.2s ease-in-out 3; }
@keyframes mk-pulse { 50% { transform: translate(-50%, -50%) scale(1.5); } }
.pp-tag { font-size: 11px; border-radius: 3px; padding: 0 5px; margin-right: 6px; font-weight: 500; }
.pp-tag.active { background: #ffd23f; color: #222; }
.pp-tag.done { background: #3a3a3a; color: #aaa; }
.pp-links { margin-top: 4px; }
.mk-img.cat img { filter: invert(0.9); }

.mk-place { color: #e8e8e8; text-shadow: 0 0 3px #000, 0 0 3px #000; font-weight: 600; pointer-events: none; font-size: 12px; }

.mk-btr {
  display: flex; align-items: center; gap: 6px; padding: 2px 8px 2px 4px; border-radius: 12px;
  background: #3b4214; border: 2px solid #d7e07a; color: #f3f6c8; font-size: 11px; box-shadow: 0 0 8px rgba(215, 224, 122, 0.6);
}
.mk-btr b { background: #d7e07a; color: #20240a; border-radius: 8px; padding: 0 5px; }
.mk-btr em { font-style: normal; }
.mk-arrow { color: #d7e07a; font-size: 12px; transform: translate(-50%, -50%) rotate(var(--r)); text-shadow: 0 0 2px #000; }
.mk-player { width: 0; height: 0; }
.mk-player::before {
  content: ''; position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; background: #ffd23f;
  clip-path: polygon(50% 0, 100% 100%, 50% 75%, 0 100%); transform: rotate(var(--yaw, 0deg)); filter: drop-shadow(0 0 3px #000);
}

.leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #1d2025; color: #e6e6e6; }
.leaflet-popup-content { margin: 10px 12px; font-size: 13px; line-height: 1.5; min-width: 160px; }
.pp-title { font-weight: 700; }
.pp-muted { color: #8b929c; font-size: 12px; }
.pp-item { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
.pp-item img { width: 28px; height: 28px; object-fit: contain; background: #111; border-radius: 3px; }
.pp-loot { max-height: 220px; overflow: auto; }
</style>
