<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { state, modeLabel } from '../state'
import { fetchDashboard } from '../api/tarkov'
import { tarkovTime, formatHMS, timeAgo } from '../utils/tarkovTime'
import { i18n, dataLang, fmtDateTime } from '../i18n'

const now = ref(Date.now())
const data = ref(null)
const cachedAt = ref(null)
const error = ref(null)
const loading = ref(false)

let clock = null
let refresher = null

async function load() {
  loading.value = true
  try {
    const r = await fetchDashboard(state.gameMode, dataLang())
    data.value = r.data
    cachedAt.value = r.cachedAt
    error.value = r.error
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  clock = setInterval(() => (now.value = Date.now()), 1000)
  refresher = setInterval(load, 5 * 60 * 1000)
})
onUnmounted(() => {
  clearInterval(clock)
  clearInterval(refresher)
})
watch(() => [state.gameMode, i18n.locale], load)

const traders = computed(() =>
  (data.value?.traders ?? [])
    .filter((t) => t.resetTime)
    .map((t) => ({ ...t, left: new Date(t.resetTime).getTime() - now.value }))
)

const goons = computed(() => data.value?.goonReports ?? [])
</script>

<template>
  <div class="page">
    <h1>{{ $t('nav.dashboard') }} <span class="muted" style="font-size: 14px">{{ modeLabel(state.gameMode) }}</span></h1>

    <div v-if="error && cachedAt" class="notice">
      {{ $t('common.cachedNotice', { time: fmtDateTime(cachedAt) }) }}
    </div>
    <div v-else-if="error" class="notice err">{{ $t('dashboard.loadFailed', { error: error.message }) }}</div>

    <div class="grid">
      <section class="card">
        <h2>{{ $t('dashboard.raidTime') }}</h2>
        <div class="clock">
          <div><span class="big">{{ tarkovTime(now) }}</span><span class="muted">{{ $t('dashboard.left') }}</span></div>
          <div><span class="big">{{ tarkovTime(now, true) }}</span><span class="muted">{{ $t('dashboard.right') }}</span></div>
        </div>
      </section>

      <section class="card">
        <h2>{{ $t('dashboard.goons') }}</h2>
        <div v-if="!goons.length" class="muted">{{ loading ? $t('common.loading') : $t('dashboard.noReports') }}</div>
        <ul class="list">
          <li v-for="(g, i) in goons" :key="i">
            <RouterLink :to="`/map/${g.map.normalizedName}`">{{ g.map.name }}</RouterLink>
            <span class="muted">{{ timeAgo(g.timestamp, now) }}</span>
          </li>
        </ul>
      </section>
    </div>

    <section class="card">
      <h2>{{ $t('dashboard.traderResets') }}</h2>
      <div v-if="!traders.length" class="muted">{{ loading ? $t('common.loading') : $t('common.noData') }}</div>
      <div class="traders">
        <div v-for="t in traders" :key="t.id" class="trader">
          <img v-if="t.imageLink" :src="t.imageLink" :alt="t.name" />
          <div>
            <div>{{ t.name }}</div>
            <div :class="t.left <= 0 ? 'ready' : 'countdown'">
              {{ t.left <= 0 ? $t('dashboard.restocked') : formatHMS(t.left) }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>{{ $t('dashboard.links') }}</h2>
      <div class="links">
        <a href="https://www.escapefromtarkov.com" target="_blank">{{ $t('dashboard.officialSite') }}</a>
        <a href="https://escapefromtarkov.fandom.com/wiki/Escape_from_Tarkov_Wiki" target="_blank">{{ $t('dashboard.officialWiki') }}</a>
        <a href="https://tarkov.dev" target="_blank">Tarkov.dev</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.clock { display: flex; gap: 32px; }
.big { font-size: 32px; font-variant-numeric: tabular-nums; font-weight: 600; margin-right: 6px; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed var(--border); }
.traders { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.trader { display: flex; gap: 10px; align-items: center; background: var(--panel-2); border-radius: 8px; padding: 8px; }
.trader img { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; }
.countdown { font-variant-numeric: tabular-nums; color: var(--accent); }
.ready { color: var(--ok); }
.links { display: flex; gap: 16px; flex-wrap: wrap; }
</style>
