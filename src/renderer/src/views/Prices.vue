<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { state, modeLabel } from '../state'
import { fetchItems, fetchPriceHistory } from '../api/tarkov'
import PriceChart from '../components/PriceChart.vue'
import { i18n, t, dataLang, fmtNum, fmtDateTime } from '../i18n'
import { timeAgo } from '../utils/tarkovTime'

const data = ref(null) // { items, traders, categories }
const error = ref(null)
const cachedAt = ref(null)
const loading = ref(false)

const query = ref('')
const category = ref('all')
const sortKey = ref('perSlot')
const onlyFlea = ref(false)
const onlyFav = ref(false)
const limit = ref(100)
const selected = ref(null)
const history = ref(null)
const historyError = ref(null)

// 收藏（本机记住）
function loadFav() {
  try {
    return JSON.parse(localStorage.getItem('fav-items')) ?? {}
  } catch {
    return {}
  }
}
const fav = reactive(loadFav())
watch(fav, () => {
  try {
    localStorage.setItem('fav-items', JSON.stringify(fav))
  } catch {
    // 忽略
  }
})

function toggleFav(id) {
  if (fav[id]) delete fav[id]
  else fav[id] = true
}

async function load() {
  loading.value = true
  try {
    const r = await fetchItems(state.gameMode, dataLang())
    data.value = r.data
    cachedAt.value = r.cachedAt
    error.value = r.error
    if (selected.value) selected.value = r.data.items.find((i) => i.id === selected.value.id) ?? null
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => [state.gameMode, i18n.locale], load)

// ---------- 价格推导 ----------
const slots = (it) => Math.max(1, it.width * it.height)
const bestTrader = (it) =>
  it.sellToTrader.filter((s) => s.trader !== 'flea').reduce((best, s) => (!best || s.priceRUB > best.priceRUB ? s : best), null)
const fleaPrice = (it) => (it.noFlea ? null : (it.lastLowPrice ?? it.avg24hPrice ?? null))
// 能卖出的最好价格（跳蚤最低价 vs 商人最高收购价）
const bestSell = (it) => Math.max(fleaPrice(it) ?? 0, bestTrader(it)?.priceRUB ?? 0)
const perSlot = (it) => bestSell(it) / slots(it)

const SORTS = {
  perSlot: { fn: (it) => perSlot(it) },
  flea: { fn: (it) => fleaPrice(it) ?? -1 },
  avg: { fn: (it) => it.avg24hPrice ?? -1 },
  trader: { fn: (it) => bestTrader(it)?.priceRUB ?? -1 },
  up: { fn: (it) => it.changeLast48hPercent ?? -Infinity },
  down: { fn: (it) => -(it.changeLast48hPercent ?? Infinity) }
}

const categoryList = computed(() =>
  Object.values(data.value?.categories ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
)

const filtered = computed(() => {
  if (!data.value) return []
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const sortFn = SORTS[sortKey.value].fn
  return data.value.items
    .filter((it) => category.value === 'all' || it.category === category.value)
    .filter((it) => !onlyFlea.value || !it.noFlea)
    .filter((it) => !onlyFav.value || fav[it.id])
    .filter((it) => {
      if (!words.length) return true
      const text = `${it.name} ${it.shortName} ${it.normalizedName}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
    .map((it) => ({ it, v: sortFn(it) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.it)
})
const shown = computed(() => filtered.value.slice(0, limit.value))
watch([query, category, sortKey, onlyFlea, onlyFav], () => (limit.value = 100))

// ---------- 详情 ----------
async function select(it) {
  selected.value = it
  history.value = null
  historyError.value = null
  if (it.noFlea) return
  try {
    const r = await fetchPriceHistory(state.gameMode, it.id)
    if (selected.value?.id === it.id) history.value = r.data
  } catch (e) {
    if (selected.value?.id === it.id) historyError.value = e
  }
}

const traderName = (id) => data.value?.traders[id]?.name ?? id
const traderImg = (id) => data.value?.traders[id]?.image
const CUR = { RUB: '₽', USD: '$', EUR: '€' }
const money = (v, cur = 'RUB') =>
  v == null || v <= 0 ? '—' : cur === 'RUB' ? `${fmtNum(Math.round(v))} ₽` : `${CUR[cur] ?? ''}${fmtNum(Math.round(v))}`
const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`)
const sellAdvice = (it) => {
  const f = fleaPrice(it) ?? 0
  const tr = bestTrader(it)
  if (!f && !tr) return null
  if (tr && tr.priceRUB >= f) return t('prices.adviceTrader', { trader: traderName(tr.trader), price: money(tr.priceRUB) })
  return t('prices.adviceFlea', { price: money(f) })
}
</script>

<template>
  <div class="prices">
    <div class="list">
      <div class="filters">
        <input v-model="query" type="text" :placeholder="$t('prices.searchPlaceholder')" class="search" />
        <select v-model="sortKey">
          <option v-for="(s, k) in SORTS" :key="k" :value="k">{{ $t('prices.sortBy', { field: $t(`prices.sort.${k}`) }) }}</option>
        </select>
        <label><input v-model="onlyFlea" type="checkbox" />{{ $t('prices.onlyFlea') }}</label>
        <label><input v-model="onlyFav" type="checkbox" />{{ $t('prices.onlyFav') }}</label>
      </div>
      <div class="cats">
        <button :class="{ active: category === 'all' }" @click="category = 'all'">{{ $t('common.all') }}</button>
        <button v-for="c in categoryList" :key="c.id" :class="{ active: category === c.id }" @click="category = c.id">
          {{ c.name }}
        </button>
      </div>

      <div v-if="error" class="notice" :class="{ err: !cachedAt }">
        {{ cachedAt ? $t('common.cachedNotice', { time: fmtDateTime(cachedAt) }) : $t('common.loadFailed', { error: error.message }) }}
      </div>
      <div v-if="loading && !data" class="muted pad">{{ $t('prices.loading') }}</div>

      <div v-if="data" class="count muted">{{ $t('prices.count', { n: filtered.length, mode: modeLabel(state.gameMode) }) }}</div>
      <table v-if="data" class="table">
        <thead>
          <tr>
            <th></th>
            <th class="name-col">{{ $t('prices.colItem') }}</th>
            <th>{{ $t('prices.colFlea') }}</th>
            <th>{{ $t('prices.colAvg') }}</th>
            <th>{{ $t('prices.colPerSlot') }}</th>
            <th>{{ $t('prices.colTrader') }}</th>
            <th>48h</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in shown" :key="it.id" :class="{ sel: selected?.id === it.id }" @click="select(it)">
            <td class="star" @click.stop="toggleFav(it.id)">{{ fav[it.id] ? '★' : '☆' }}</td>
            <td class="name-col">
              <img :src="it.icon" loading="lazy" />
              <div>
                <div class="nm">{{ it.name }}</div>
                <div class="muted sm">{{ it.shortName }} · {{ it.width }}×{{ it.height }}</div>
              </div>
            </td>
            <td class="num">{{ it.noFlea ? $t('prices.banned') : money(it.lastLowPrice) }}</td>
            <td class="num">{{ money(it.avg24hPrice) }}</td>
            <td class="num strong">{{ money(perSlot(it)) }}</td>
            <td class="num">
              <template v-if="bestTrader(it)">
                {{ money(bestTrader(it).price, bestTrader(it).currency) }}
                <div class="muted sm">{{ traderName(bestTrader(it).trader) }}</div>
              </template>
              <template v-else>—</template>
            </td>
            <td class="num" :class="{ up: it.changeLast48hPercent > 0, down: it.changeLast48hPercent < 0 }">
              {{ pct(it.changeLast48hPercent) }}
            </td>
          </tr>
        </tbody>
      </table>
      <button v-if="filtered.length > limit" class="more" @click="limit += 200">{{ $t('prices.showMore', { n: filtered.length - limit }) }}</button>
    </div>

    <aside v-if="selected" class="detail">
      <div class="d-head">
        <img :src="selected.image" />
        <div>
          <div class="d-name">{{ selected.name }}</div>
          <div class="muted">{{ selected.shortName }} · {{ selected.width }}×{{ selected.height }} · {{ selected.weight }} kg</div>
          <div class="links">
            <a v-if="selected.wikiLink" :href="selected.wikiLink" target="_blank">Wiki</a>
            <a v-if="selected.link" :href="selected.link" target="_blank">tarkov.dev</a>
          </div>
        </div>
        <button class="close" @click="selected = null">✕</button>
      </div>

      <div v-if="sellAdvice(selected)" class="advice">{{ $t('prices.advice') }}{{ sellAdvice(selected) }}</div>

      <section>
        <h3>{{ $t('prices.fleaMarket') }}</h3>
        <div v-if="selected.noFlea" class="muted">{{ $t('prices.noFleaDesc') }}</div>
        <div v-else class="stats">
          <div><span class="muted">{{ $t('prices.lowest') }}</span><b>{{ money(selected.lastLowPrice) }}</b></div>
          <div><span class="muted">{{ $t('prices.colAvg') }}</span><b>{{ money(selected.avg24hPrice) }}</b></div>
          <div><span class="muted">{{ $t('prices.range24h') }}</span><b>{{ money(selected.low24hPrice) }} ~ {{ money(selected.high24hPrice) }}</b></div>
          <div><span class="muted">{{ $t('prices.change48h') }}</span><b :class="{ up: selected.changeLast48hPercent > 0, down: selected.changeLast48hPercent < 0 }">{{ pct(selected.changeLast48hPercent) }}</b></div>
          <div><span class="muted">{{ $t('prices.offers') }}</span><b>{{ selected.lastOfferCount }}</b></div>
          <div><span class="muted">{{ $t('prices.updated') }}</span><b>{{ timeAgo(new Date(selected.updated).getTime()) }}</b></div>
        </div>
      </section>

      <section v-if="!selected.noFlea">
        <h3>{{ $t('prices.history') }}</h3>
        <div v-if="historyError" class="muted">{{ $t('prices.historyFailed', { error: historyError.message }) }}</div>
        <div v-else-if="!history" class="muted">{{ $t('common.loading') }}</div>
        <PriceChart v-else :points="history" />
      </section>

      <section>
        <h3>{{ $t('prices.sellToTrader') }}</h3>
        <div v-if="!selected.sellToTrader.length" class="muted">{{ $t('prices.noTraderBuy') }}</div>
        <div
          v-for="s in [...selected.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB)"
          :key="s.trader"
          class="trow"
          :class="{ best: s === bestTrader(selected) }"
        >
          <img v-if="traderImg(s.trader)" :src="traderImg(s.trader)" />
          <span>{{ traderName(s.trader) }}</span>
          <b>{{ money(s.price, s.currency) }}</b>
          <span v-if="s.currency !== 'RUB'" class="muted sm">≈ {{ money(s.priceRUB) }}</span>
        </div>
      </section>

      <section>
        <h3>{{ $t('prices.buyFromTrader') }}</h3>
        <div v-if="!selected.buyFromTrader.length" class="muted">{{ $t('prices.noTraderSell') }}</div>
        <div v-for="(b, i) in selected.buyFromTrader" :key="i" class="trow">
          <img v-if="traderImg(b.trader)" :src="traderImg(b.trader)" />
          <span>{{ traderName(b.trader) }} <span class="muted sm">LL{{ b.minTraderLevel }}{{ b.taskUnlock ? ` · ${$t('prices.taskUnlock')}` : '' }}{{ b.buyLimit ? ` · ${$t('prices.buyLimit', { n: b.buyLimit })}` : '' }}</span></span>
          <b>{{ money(b.price, b.currency) }}</b>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.prices { display: flex; height: 100%; }
.list { flex: 1; min-width: 0; overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.filters { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.filters label { display: flex; gap: 4px; align-items: center; cursor: pointer; }
.filters select { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
.search { flex: 1; min-width: 220px; }
.cats { display: flex; gap: 6px; flex-wrap: wrap; }
.cats button { padding: 2px 10px; font-size: 13px; }
.count { font-size: 12px; }
.pad { padding: 20px 0; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th { position: sticky; top: -16px; background: var(--bg); color: var(--muted); font-weight: 600; text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--border); z-index: 1; }
.table td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
.table tbody tr { cursor: pointer; }
.table tbody tr:hover, .table tr.sel { background: var(--panel); }
.name-col { text-align: left !important; }
td.name-col { display: flex; align-items: center; gap: 10px; }
td.name-col img { width: 40px; height: 40px; object-fit: contain; background: #0d0f12; border-radius: 4px; flex-shrink: 0; }
.nm { font-weight: 500; }
.sm { font-size: 11px; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.strong { font-weight: 600; }
.up { color: #4caf7a; }
.down { color: #e06464; }
.star { width: 24px; color: var(--accent); text-align: center; font-size: 16px; }
.more { align-self: center; margin: 8px 0 20px; }

.detail { width: 420px; flex-shrink: 0; border-left: 1px solid var(--border); background: var(--panel); overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.d-head { display: flex; gap: 12px; align-items: flex-start; position: relative; }
.d-head img { width: 96px; height: 96px; object-fit: contain; background: #0d0f12; border-radius: 6px; }
.d-name { font-size: 16px; font-weight: 700; padding-right: 24px; }
.links { display: flex; gap: 10px; margin-top: 4px; font-size: 13px; }
.close { position: absolute; right: 0; top: 0; border: none; background: none; color: var(--muted); }
.advice { background: #1d2a22; color: #8fd3a8; border-radius: 6px; padding: 8px 10px; font-size: 13px; }
section h3 { margin: 0 0 8px; font-size: 13px; color: var(--muted); font-weight: 600; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 13px; }
.stats div { display: flex; flex-direction: column; }
.stats b { font-variant-numeric: tabular-nums; }
.trow { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; border-bottom: 1px dashed var(--border); }
.trow img { width: 26px; height: 26px; border-radius: 4px; object-fit: cover; }
.trow b { margin-left: auto; font-variant-numeric: tabular-nums; }
.trow.best b { color: var(--accent); }
</style>
