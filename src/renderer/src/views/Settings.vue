<script setup>
import { ref, onMounted } from 'vue'
import { state } from '../state'
import { t } from '../i18n'

const desktop = window.desktop
const version = __APP_VERSION__

// name / url / license 不翻译，use 为翻译 key
const CREDITS = [
  {
    title: 'credits.data',
    items: [
      { name: 'tarkov.dev', url: 'https://tarkov.dev', license: 'credits.openData', use: 'credits.useData' },
      { name: 'tarkov-dev-svg-maps (Shebuka et al.)', url: 'https://github.com/the-hideout/tarkov-dev-svg-maps', license: 'CC BY-NC-SA 4.0', use: 'credits.useSvgMaps' },
      { name: 'Escape from Tarkov Wiki', url: 'https://escapefromtarkov.fandom.com', license: 'CC BY-SA 3.0', use: 'credits.useWiki' }
    ]
  },
  {
    title: 'credits.code',
    items: [
      { name: 'tarkov.dev', url: 'https://github.com/the-hideout/tarkov-dev', license: 'MIT', use: 'credits.useTarkovDevCode' },
      { name: 'tarkov-time', url: 'https://github.com/adamburgess/tarkov-time', license: 'MIT', use: 'credits.useTarkovTime' },
      { name: 'TarkovMonitor', url: 'https://github.com/the-hideout/TarkovMonitor', license: 'GPL-3.0', use: 'credits.useTarkovMonitor' }
    ]
  },
  {
    title: 'credits.libs',
    items: [
      { name: 'Electron', url: 'https://www.electronjs.org', license: 'MIT', use: 'credits.useElectron' },
      { name: 'Vue / Vue Router', url: 'https://vuejs.org', license: 'MIT', use: 'credits.useVue' },
      { name: 'Leaflet', url: 'https://leafletjs.com', license: 'BSD-2-Clause', use: 'credits.useLeaflet' }
    ]
  },
  {
    title: 'credits.inspiration',
    items: [{ name: '枫织梦境 (Kaedeori)', url: 'https://member.kaedeori.com/', license: '—', use: 'credits.useKaedeori' }]
  }
]

// 主进程上报的监听状态：{ ok, code, path, error } → 当前语言的文字
const watchText = (s) => (s ? t(`settings.watch.${s.code}`, { path: s.path ?? '', error: s.error ?? '' }) : t('settings.notStarted'))

const form = ref(null)
const saved = ref(false)

onMounted(async () => {
  if (desktop) form.value = await desktop.getSettings()
})

async function pick(key, titleKey) {
  const dir = await desktop.pickFolder(t(titleKey))
  if (dir) form.value[key] = dir
}

async function save() {
  form.value = await desktop.setSettings({ ...form.value })
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}
</script>

<template>
  <div class="page">
    <h1>{{ $t('nav.settings') }}</h1>
    <div v-if="!desktop" class="notice">{{ $t('settings.browserOnly') }}</div>

    <section v-if="form" class="card">
      <h2>{{ $t('settings.screenshotsTitle') }}</h2>
      <p class="muted">{{ $t('settings.screenshotsDesc') }}</p>
      <div class="row">
        <input v-model="form.screenshotsDir" type="text" />
        <button @click="pick('screenshotsDir', 'settings.pickScreenshots')">{{ $t('settings.browse') }}</button>
      </div>
      <label class="check"><input v-model="form.deleteScreenshots" type="checkbox" />{{ $t('settings.deleteScreenshots') }}</label>
      <div class="status">
        <span class="dot" :class="state.watchStatus.screenshots?.ok ? 'ok' : 'err'"></span>
        {{ watchText(state.watchStatus.screenshots) }}
      </div>
    </section>

    <section v-if="form" class="card">
      <h2>{{ $t('settings.logsTitle') }}</h2>
      <p class="muted">{{ $t('settings.logsDesc') }}</p>
      <div class="row">
        <input v-model="form.logsDir" type="text" />
        <button @click="pick('logsDir', 'settings.pickLogs')">{{ $t('settings.browse') }}</button>
      </div>
      <div class="status">
        <span class="dot" :class="state.watchStatus.logs?.ok ? 'ok' : 'err'"></span>
        {{ watchText(state.watchStatus.logs) }}
        <span v-if="state.raidMap" class="muted">· {{ $t('settings.lastDetected', { map: state.raidMap }) }}</span>
      </div>
    </section>

    <div v-if="form">
      <button class="active" @click="save">{{ $t('settings.save') }}</button>
      <span v-if="saved" class="muted" style="margin-left: 10px">{{ $t('settings.saved') }}</span>
    </div>

    <section class="card about">
      <h2>{{ $t('settings.about') }}</h2>
      <p><b>Tarkov Helper</b> v{{ version }} · {{ $t('settings.unofficial') }}</p>
      <p class="muted">{{ $t('settings.copyright') }}</p>
      <p class="muted">{{ $t('settings.safety') }}</p>
    </section>

    <section class="card about">
      <h2>{{ $t('settings.credits') }}</h2>
      <div v-for="g in CREDITS" :key="g.title" class="credit-group">
        <h3>{{ $t(g.title) }}</h3>
        <ul>
          <li v-for="c in g.items" :key="c.name">
            <a :href="c.url" target="_blank">{{ c.name }}</a>
            <span class="lic">{{ c.license.startsWith('credits.') ? $t(c.license) : c.license }}</span>
            <span class="muted">— {{ $t(c.use) }}</span>
          </li>
        </ul>
      </div>
      <p class="muted sm">{{ $t('settings.noticesHint') }}</p>
    </section>
  </div>
</template>

<style scoped>
.row { display: flex; gap: 8px; margin: 8px 0; }
.row input { flex: 1; }
.check { display: flex; gap: 6px; align-items: center; }
.status { margin-top: 8px; font-size: 13px; }
p { margin: 0 0 4px; }
.about h3 { margin: 10px 0 4px; font-size: 13px; }
.about ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.8; }
.lic { font-size: 11px; background: var(--panel-2); border-radius: 3px; padding: 0 5px; margin: 0 6px; color: var(--muted); }
.sm { font-size: 12px; margin-top: 10px; }
</style>
