<script setup>
import { state, MODES, modeLabel } from './state'
import { i18n, LOCALES, setLocale } from './i18n'
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">Tarkov Helper</div>
      <nav>
        <RouterLink to="/" class="nav-item">{{ $t('nav.dashboard') }}</RouterLink>
        <RouterLink to="/map" class="nav-item" :class="{ 'nav-active': $route.path.startsWith('/map') }">
          {{ $t('nav.map') }}
        </RouterLink>
        <RouterLink to="/prices" class="nav-item">{{ $t('nav.prices') }}</RouterLink>
        <RouterLink to="/tasks" class="nav-item" :class="{ 'nav-active': $route.path.startsWith('/tasks/') }">{{ $t('nav.tasks') }}</RouterLink>
        <RouterLink to="/settings" class="nav-item">{{ $t('nav.settings') }}</RouterLink>
      </nav>
      <div class="mode">
        <div class="mode-switch">
          <button v-for="m in MODES" :key="m.id" :class="{ active: state.gameMode === m.id }" @click="state.gameMode = m.id">
            {{ modeLabel(m.id) }}
          </button>
        </div>
        <label class="auto" :title="$t('nav.followGameTip')">
          <input v-model="state.autoMode" type="checkbox" />{{ $t('nav.followGame') }}
          <span v-if="state.sessionMode" class="muted">（{{ modeLabel(state.sessionMode) }}）</span>
        </label>
      </div>
      <select class="lang" :value="i18n.locale" @change="setLocale($event.target.value)">
        <option v-for="l in LOCALES" :key="l.id" :value="l.id">{{ l.label }}</option>
      </select>
      <div class="sidebar-foot">{{ $t('nav.dataSource') }}</div>
    </aside>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
