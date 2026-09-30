<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { state, modeLabel, taskStatus, TASK_STATUS } from '../state'
import { fetchTasks } from '../api/tarkov'
import { i18n, t as tr, dataLang, fmtDateTime } from '../i18n'

const router = useRouter()
const data = ref(null) // { tasks, items, traders, maps }
const error = ref(null)
const cachedAt = ref(null)
const loading = ref(false)

// 筛选条件记在 sessionStorage，从详情页返回时保持
function loadFilters() {
  try {
    return JSON.parse(sessionStorage.getItem('task-filters')) ?? {}
  } catch {
    return {}
  }
}
const f = loadFilters()
const query = ref(f.query ?? '')
const trader = ref(f.trader ?? 'all')
const map = ref(f.map ?? 'all')
const status = ref(f.status ?? 'all')
const kappaOnly = ref(f.kappaOnly ?? false)
watch([query, trader, map, status, kappaOnly], () => {
  try {
    sessionStorage.setItem(
      'task-filters',
      JSON.stringify({ query: query.value, trader: trader.value, map: map.value, status: status.value, kappaOnly: kappaOnly.value })
    )
  } catch {
    // 忽略
  }
})

async function load() {
  loading.value = true
  try {
    const r = await fetchTasks(state.gameMode, dataLang())
    data.value = r.data
    cachedAt.value = r.cachedAt
    error.value = r.error
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => [state.gameMode, i18n.locale], load)

const traderList = computed(() => {
  if (!data.value) return []
  const used = new Set(data.value.tasks.map((t) => t.trader))
  return Object.values(data.value.traders).filter((t) => used.has(t.id))
})
const mapList = computed(() => {
  if (!data.value) return []
  const used = new Set(data.value.tasks.flatMap((t) => [t.map, ...t.objectives.flatMap((o) => o.maps)]).filter(Boolean))
  return Object.values(data.value.maps).filter((m) => used.has(m.id))
})

const tasksOnMap = (t) => new Set([t.map, ...t.objectives.flatMap((o) => o.maps)].filter(Boolean))

const filtered = computed(() => {
  if (!data.value) return []
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return data.value.tasks
    .filter((t) => trader.value === 'all' || t.trader === trader.value)
    .filter((t) => map.value === 'all' || tasksOnMap(t).has(map.value))
    .filter((t) => !kappaOnly.value || t.kappaRequired)
    .filter((t) => {
      const s = taskStatus(t.id)
      if (status.value === 'all') return true
      if (status.value === 'none') return !s
      return s === status.value
    })
    .filter((t) => {
      if (!words.length) return true
      const text = [t.name, t.normalizedName, ...t.objectives.map((o) => o.description)].join(' ').toLowerCase()
      return words.every((w) => text.includes(w))
    })
    .sort((a, b) => a.minPlayerLevel - b.minPlayerLevel || a.name.localeCompare(b.name, 'zh'))
})

const counts = computed(() => {
  const out = { started: 0, finished: 0, failed: 0 }
  for (const t of data.value?.tasks ?? []) {
    const s = taskStatus(t.id)
    if (s) out[s]++
  }
  return out
})

const mapNames = (t) =>
  [...tasksOnMap(t)]
    .map((id) => data.value.maps[id]?.name)
    .filter(Boolean)
    .join(tr('common.listSep'))
</script>

<template>
  <div class="page">
    <h1>{{ $t('nav.tasks') }} <span class="muted" style="font-size: 14px">{{ modeLabel(state.gameMode) }}</span></h1>

    <div class="filters">
      <input v-model="query" type="text" class="search" :placeholder="$t('tasks.searchPlaceholder')" />
      <select v-model="trader">
        <option value="all">{{ $t('tasks.allTraders') }}</option>
        <option v-for="t in traderList" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <select v-model="map">
        <option value="all">{{ $t('tasks.allMaps') }}</option>
        <option v-for="m in mapList" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <select v-model="status">
        <option value="all">{{ $t('tasks.allStatus') }}</option>
        <option value="none">{{ $t('taskStatus.none') }}</option>
        <option value="started">{{ $t('taskStatus.started') }} ({{ counts.started }})</option>
        <option value="finished">{{ $t('taskStatus.finished') }} ({{ counts.finished }})</option>
        <option value="failed">{{ $t('taskStatus.failed') }} ({{ counts.failed }})</option>
      </select>
      <label><input v-model="kappaOnly" type="checkbox" />{{ $t('tasks.kappaOnly') }}</label>
    </div>

    <div v-if="error" class="notice" :class="{ err: !cachedAt }">
      {{ cachedAt ? $t('common.cachedNotice', { time: fmtDateTime(cachedAt) }) : $t('common.loadFailed', { error: error.message }) }}
    </div>
    <div v-if="loading && !data" class="muted">{{ $t('tasks.loading') }}</div>
    <div v-if="data" class="muted count">
      {{ $t('tasks.count', { n: filtered.length }) }}
    </div>

    <div class="list">
      <button v-for="t in filtered" :key="t.id" class="task" @click="router.push(`/tasks/${t.id}`)">
        <img :src="t.image" loading="lazy" />
        <div class="info">
          <div class="name">
            {{ t.name }}
            <span v-if="t.kappaRequired" class="tag kappa">Kappa</span>
            <span v-if="t.lightkeeperRequired" class="tag lk">{{ $t('tasks.lightkeeper') }}</span>
          </div>
          <div class="muted sm">
            <img v-if="data.traders[t.trader]?.image" :src="data.traders[t.trader].image" class="trader" />
            {{ data.traders[t.trader]?.name }} · {{ $t('tasks.level', { n: t.minPlayerLevel }) }}<template v-if="mapNames(t)"> · {{ mapNames(t) }}</template>
          </div>
        </div>
        <span
          v-if="taskStatus(t.id)"
          class="status"
          :style="{ color: TASK_STATUS[taskStatus(t.id)].color, borderColor: TASK_STATUS[taskStatus(t.id)].color }"
        >
          {{ TASK_STATUS[taskStatus(t.id)].label }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.filters label { display: flex; gap: 4px; align-items: center; cursor: pointer; }
.filters select { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
.search { flex: 1; min-width: 240px; }
.count { font-size: 12px; }
.list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 8px; }
.task { display: flex; align-items: center; gap: 10px; text-align: left; padding: 8px; background: var(--panel); border-radius: 8px; }
.task > img { width: 72px; height: 44px; object-fit: cover; border-radius: 4px; background: #0d0f12; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sm { font-size: 12px; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trader { width: 16px; height: 16px; border-radius: 3px; }
.tag { font-size: 10px; padding: 0 5px; border-radius: 3px; font-weight: 500; }
.tag.kappa { background: #3a2f5a; color: #c9b8ff; }
.tag.lk { background: #1f3a4a; color: #9fd6f0; }
.status { font-size: 12px; border: 1px solid; border-radius: 10px; padding: 0 8px; flex-shrink: 0; }
</style>
