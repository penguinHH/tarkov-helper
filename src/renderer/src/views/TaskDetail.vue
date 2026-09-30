<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state, modeLabel, taskStatus, taskProgress, setTaskStatus, TASK_STATUS } from '../state'
import { fetchTasks, fetchWikiPage } from '../api/tarkov'
import { extractWiki } from '../utils/wiki'
import { i18n, t, tOr, dataLang, fmtNum, fmtDateTime } from '../i18n'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const error = ref(null)
const wiki = ref(null)
const wikiError = ref(null)
const wikiLoading = ref(false)

const task = computed(() => data.value?.tasks.find((x) => x.id === route.params.id) ?? null)
const byId = computed(() => Object.fromEntries((data.value?.tasks ?? []).map((x) => [x.id, x])))
const item = (id) => data.value?.items[id]
const trader = (id) => data.value?.traders[id]
const mapOf = (id) => data.value?.maps[id]
const progress = computed(() => (task.value ? taskProgress[state.gameMode]?.[task.value.id] : null))
const status = computed(() => (task.value ? taskStatus(task.value.id) : null))

// 后续任务：前置条件里包含本任务的
const nextTasks = computed(() =>
  task.value ? data.value.tasks.filter((x) => x.taskRequirements.some((r) => r.task === task.value.id)) : []
)
// 任务涉及的地图（有地图标记的才能跳转）
const mapsWithMarkers = computed(() => {
  if (!task.value) return []
  const ids = new Set(task.value.objectives.filter((o) => o.onMap).flatMap((o) => o.maps))
  return [...ids].map(mapOf).filter(Boolean)
})

const reqStatus = (s) => tOr(`taskDetail.req.${s}`, s)
const objType = (type) => tOr(`taskDetail.obj.${type}`, type)
const mapNames = (ids) =>
  ids
    .map((id) => mapOf(id)?.name)
    .filter(Boolean)
    .join(t('common.listSep'))

async function load() {
  error.value = null
  try {
    data.value = (await fetchTasks(state.gameMode, dataLang())).data
  } catch (e) {
    error.value = e
  }
}

async function loadWiki() {
  wiki.value = null
  wikiError.value = null
  if (!task.value?.wikiLink) return
  wikiLoading.value = true
  try {
    const r = await fetchWikiPage(task.value.wikiLink)
    wiki.value = { title: r.data.title, ...extractWiki(r.data.html) }
  } catch (e) {
    wikiError.value = e
  } finally {
    wikiLoading.value = false
  }
}

watch(() => [state.gameMode, i18n.locale], load, { immediate: true })
watch(() => task.value?.wikiLink, loadWiki, { immediate: true })

function showOnMap(m) {
  router.push({ path: `/map/${m.normalizedName}`, query: { task: task.value.id } })
}

const fmt = (n) => fmtNum(n)
const when = (ts) => (ts ? fmtDateTime(ts) : '')
</script>

<template>
  <div class="page">
    <div class="crumbs">
      <a href="#" @click.prevent="router.back()">← {{ $t('taskDetail.back') }}</a>
      <span class="muted">{{ modeLabel(state.gameMode) }}</span>
    </div>

    <div v-if="error" class="notice err">{{ $t('common.loadFailed', { error: error.message }) }}</div>
    <div v-else-if="!data" class="muted">{{ $t('common.loading') }}</div>
    <div v-else-if="!task" class="notice">{{ $t('taskDetail.notInMode', { mode: modeLabel(state.gameMode) }) }}</div>

    <template v-else>
      <div class="head card">
        <img :src="task.image" class="cover" />
        <div class="head-info">
          <h1>{{ task.name }}</h1>
          <div class="meta">
            <span class="trader">
              <img v-if="trader(task.trader)?.image" :src="trader(task.trader).image" />
              {{ trader(task.trader)?.name }}
            </span>
            <span>{{ $t('taskDetail.minLevel', { n: task.minPlayerLevel }) }}</span>
            <span v-if="task.map">{{ $t('taskDetail.map') }}{{ mapOf(task.map)?.name }}</span>
            <span v-if="task.factionName !== 'Any'">{{ $t('taskDetail.faction') }}{{ task.factionName }}</span>
            <span>{{ $t('taskDetail.exp', { n: fmt(task.experience) }) }}</span>
            <span v-if="task.kappaRequired" class="tag kappa">{{ $t('taskDetail.kappaRequired') }}</span>
            <span v-if="task.lightkeeperRequired" class="tag lk">{{ $t('taskDetail.lkRequired') }}</span>
            <span v-if="task.restartable" class="tag">{{ $t('taskDetail.restartable') }}</span>
          </div>

          <div class="status-box">
            <span v-if="status" class="status" :style="{ color: TASK_STATUS[status].color, borderColor: TASK_STATUS[status].color }">
              {{ TASK_STATUS[status].label }}
            </span>
            <span v-else class="status muted">{{ $t('taskStatus.none') }}</span>
            <span v-if="progress?.status" class="muted sm">
              {{ progress.source === 'log' ? $t('taskDetail.fromLog') : $t('taskDetail.manual') }} · {{ when(progress.time) }}
            </span>
            <span class="spacer"></span>
            <button :class="{ active: status === 'started' }" @click="setTaskStatus(task.id, 'started')">{{ $t('taskDetail.markStarted') }}</button>
            <button :class="{ active: status === 'finished' }" @click="setTaskStatus(task.id, 'finished')">{{ $t('taskDetail.markFinished') }}</button>
            <button @click="setTaskStatus(task.id, null)">{{ $t('taskDetail.reset') }}</button>
          </div>

          <div v-if="mapsWithMarkers.length" class="map-links">
            {{ $t('taskDetail.showOnMap') }}
            <button v-for="m in mapsWithMarkers" :key="m.id" @click="showOnMap(m)">{{ m.name }}</button>
          </div>
        </div>
      </div>

      <div class="grid2">
        <section class="card">
          <h2>{{ $t('taskDetail.objectives') }}</h2>
          <ol class="objs">
            <li v-for="o in task.objectives" :key="o.id">
              <div>
                <span class="otype">{{ objType(o.type) }}</span>
                <span v-if="o.optional" class="tag">{{ $t('taskDetail.optional') }}</span>
                {{ o.description }}
                <span v-if="o.count > 1" class="muted">(×{{ o.count }})</span>
              </div>
              <div v-if="o.maps.length" class="muted sm">{{ $t('taskDetail.map') }}{{ mapNames(o.maps) }}</div>
              <div v-if="o.questItem || o.items.length" class="items">
                <span v-for="id in [o.questItem, ...o.items].filter(Boolean)" :key="id" class="it">
                  <img :src="item(id)?.icon" loading="lazy" />{{ id === o.questItem ? item(id)?.name : item(id)?.shortName }}
                </span>
                <span v-if="o.moreItems" class="muted sm">{{ $t('taskDetail.anyOf', { n: o.moreItems + o.items.length }) }}</span>
              </div>
            </li>
          </ol>

          <template v-if="task.neededKeys.length">
            <h2>{{ $t('taskDetail.keys') }}</h2>
            <div v-for="k in task.neededKeys" :key="k.map" class="items">
              <span class="muted sm">{{ mapOf(k.map)?.name }}:</span>
              <span v-for="id in k.keys" :key="id" class="it"><img :src="item(id)?.icon" />{{ item(id)?.name }}</span>
            </div>
          </template>
        </section>

        <section class="card">
          <h2>{{ $t('taskDetail.rewards') }}</h2>
          <div class="rewards">
            <div>{{ $t('taskDetail.exp', { n: fmt(task.experience) }) }}</div>
            <div v-for="s in task.rewards.traderStanding" :key="s.trader">
              {{ $t('taskDetail.standing', { trader: trader(s.trader)?.name, n: (s.standing > 0 ? '+' : '') + s.standing }) }}
            </div>
            <div v-for="s in task.rewards.skillLevelReward" :key="s.name">{{ $t('taskDetail.skill', { name: s.name, n: s.level }) }}</div>
            <div v-for="id in task.rewards.traderUnlock" :key="id">{{ $t('taskDetail.unlockTrader', { name: trader(id)?.name ?? id }) }}</div>
            <div class="items">
              <span v-for="r in task.rewards.items" :key="r.item" class="it">
                <img :src="item(r.item)?.icon" loading="lazy" />{{ item(r.item)?.shortName }}<b v-if="r.count > 1">×{{ fmt(r.count) }}</b>
              </span>
            </div>
            <div v-if="task.rewards.offerUnlock.length" class="sub">
              <div class="muted sm">{{ $t('taskDetail.unlockOffer') }}</div>
              <div class="items">
                <span v-for="(u, i) in task.rewards.offerUnlock" :key="i" class="it">
                  <img :src="item(u.item)?.icon" loading="lazy" />{{ item(u.item)?.shortName }}
                  <span class="muted sm">{{ trader(u.trader)?.name }} LL{{ u.level }}</span>
                </span>
              </div>
            </div>
          </div>

          <h2>{{ $t('taskDetail.requirements') }}</h2>
          <div v-if="!task.taskRequirements.length && !task.traderRequirements.length" class="muted sm">{{ $t('taskDetail.none') }}</div>
          <div v-for="r in task.traderRequirements" :key="r.trader + r.type" class="sm">
            {{ trader(r.trader)?.name }} {{ r.type === 'level' ? $t('taskDetail.traderLevel') : r.type }} {{ r.compare }} {{ r.value }}
          </div>
          <div class="links">
            <RouterLink v-for="r in task.taskRequirements" :key="r.task" :to="`/tasks/${r.task}`" class="link-task">
              {{ byId[r.task]?.name ?? r.task }}
              <span class="muted sm">({{ $t('taskDetail.needs', { status: r.status.map(reqStatus).join('/') }) }})</span>
              <span v-if="taskStatus(r.task)" :style="{ color: TASK_STATUS[taskStatus(r.task)].color }" class="sm">
                · {{ TASK_STATUS[taskStatus(r.task)].label }}
              </span>
            </RouterLink>
          </div>

          <template v-if="nextTasks.length">
            <h2>{{ $t('taskDetail.next') }}</h2>
            <div class="links">
              <RouterLink v-for="x in nextTasks" :key="x.id" :to="`/tasks/${x.id}`" class="link-task">{{ x.name }}</RouterLink>
            </div>
          </template>
        </section>
      </div>

      <section class="card wiki">
        <h2>
          {{ $t('taskDetail.wikiTitle') }}
          <a v-if="task.wikiLink" :href="task.wikiLink" target="_blank" class="sm">{{ $t('taskDetail.openWiki') }} ↗</a>
        </h2>
        <div v-if="wikiLoading" class="muted">{{ $t('taskDetail.wikiLoading') }}</div>
        <div v-else-if="wikiError" class="muted">{{ $t('taskDetail.wikiFailed', { error: wikiError.message }) }}</div>
        <template v-else-if="wiki">
          <div class="wiki-body">
            <img v-if="wiki.image" :src="wiki.image" class="wiki-img" />
            <div v-if="wiki.intro" class="wiki-html" v-html="wiki.intro"></div>
            <div v-for="s in wiki.sections" :key="s.title" class="wiki-sec">
              <h3>
                {{ tOr(`wikiSections.${s.title}`, s.title) }}
                <span v-if="tOr(`wikiSections.${s.title}`, s.title) !== s.title" class="muted sm">{{ s.title }}</span>
              </h3>
              <div class="wiki-html" v-html="s.html"></div>
            </div>
          </div>
          <div class="muted sm credit">
            {{ $t('taskDetail.wikiCredit') }}
            <a :href="task.wikiLink" target="_blank">Escape from Tarkov Wiki</a> (Fandom, CC BY-SA)
          </div>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.crumbs { display: flex; justify-content: space-between; }
.head { display: flex; gap: 16px; }
.cover { width: 220px; height: 124px; object-fit: cover; border-radius: 6px; background: #0d0f12; flex-shrink: 0; }
.head-info { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.head-info h1 { margin: 0; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 13px; color: var(--muted); }
.trader { display: flex; align-items: center; gap: 6px; color: var(--text); }
.trader img { width: 22px; height: 22px; border-radius: 4px; }
.tag { font-size: 11px; padding: 0 6px; border-radius: 3px; background: var(--panel-2); color: var(--muted); }
.tag.kappa { background: #3a2f5a; color: #c9b8ff; }
.tag.lk { background: #1f3a4a; color: #9fd6f0; }
.status-box { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.status-box button { padding: 2px 10px; font-size: 12px; }
.status { font-size: 13px; border: 1px solid var(--border); border-radius: 10px; padding: 0 10px; }
.spacer { flex: 1; }
.map-links { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 13px; }
.map-links button { padding: 2px 10px; font-size: 12px; }
.grid2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
.card h2 { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; }
.card h2 + * { margin-top: 0; }
.objs { margin: 0 0 12px; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; }
.otype { font-size: 11px; background: var(--panel-2); border-radius: 3px; padding: 0 5px; margin-right: 4px; color: var(--accent); }
.items { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; align-items: center; }
.it { display: inline-flex; align-items: center; gap: 4px; background: var(--panel-2); border-radius: 4px; padding: 2px 6px 2px 2px; font-size: 12px; }
.it img { width: 26px; height: 26px; object-fit: contain; background: #0d0f12; border-radius: 3px; }
.rewards { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin-bottom: 14px; }
.sub { margin-top: 6px; }
.links { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.link-task { font-size: 13px; text-decoration: none; }
.sm { font-size: 12px; }
.wiki-body { display: flex; flex-direction: column; gap: 10px; }
.wiki-img { max-width: 360px; border-radius: 6px; }
.wiki-sec h3 { margin: 6px 0; font-size: 15px; }
.wiki-html { font-size: 13px; line-height: 1.6; }
.wiki-html :deep(img) { max-width: 100%; height: auto; border-radius: 4px; margin: 4px 0; }
.wiki-html :deep(table) { border-collapse: collapse; margin: 6px 0; }
.wiki-html :deep(td), .wiki-html :deep(th) { border: 1px solid var(--border); padding: 3px 6px; }
.wiki-html :deep(ul) { padding-left: 20px; margin: 4px 0; }
.credit { margin-top: 12px; }
@media (max-width: 1100px) { .grid2 { grid-template-columns: 1fr; } }
</style>
