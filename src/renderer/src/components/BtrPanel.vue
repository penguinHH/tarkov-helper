<script setup>
import { ref, computed } from 'vue'
import { mmss, parseMmss, DEFAULTS } from '../map/btr'
import { t } from '../i18n'

// cfg：reactive 配置（order/wait/speed/roadFactor/samples），由父组件保存
// elapsed：战局已进行秒数（null = 未开始计时）
const props = defineProps({
  cfg: { type: Object, required: true },
  duration: { type: Number, required: true }, // 战局总时长（秒）
  elapsed: { type: Number, default: null },
  clockSource: { type: String, default: null },
  prediction: { type: Object, default: null },
  arrivals: { type: Object, default: () => ({}) },
  anchor: { type: Object, default: null },
  message: { type: String, default: '' }
})
const emit = defineEmits(['start-now', 'set-remaining', 'calibrate', 'clear-anchor', 'reverse', 'move', 'reset-config'])

const remainingInput = ref('')
const inputError = ref(false)
const showSettings = ref(false)

function submitRemaining() {
  const sec = parseMmss(remainingInput.value)
  if (sec == null || sec > props.duration) {
    inputError.value = true
    return
  }
  inputError.value = false
  emit('set-remaining', sec)
  remainingInput.value = ''
}

const statusText = computed(() => {
  const p = props.prediction
  if (props.elapsed == null) return t('btr.noClock')
  if (!props.anchor) return t('btr.notCalibrated')
  if (!p || p.status === 'unknown') return t('btr.outOfRange')
  if (p.status === 'stopped') return t('btr.stopped', { name: p.name, time: mmss(p.departIn) })
  return t('btr.moving', { from: p.from, to: p.to, time: mmss(p.arriveIn) })
})
const learnedCount = computed(() => Object.keys(props.cfg.samples).length)
</script>

<template>
  <div class="btr">
    <div class="title">{{ $t('btr.title') }}</div>

    <div class="clock">
      <template v-if="elapsed != null">
        <div>
          {{ $t('btr.elapsed') }} <b>{{ mmss(elapsed) }}</b> · {{ $t('btr.remaining') }} <b>{{ mmss(duration - elapsed) }}</b>
        </div>
        <div class="muted sm">{{ clockSource === 'log' ? $t('btr.clockFromLog') : $t('btr.clockManual') }}</div>
      </template>
      <div v-else class="muted sm">{{ $t('btr.clockHint') }}</div>
      <div class="row">
        <button @click="emit('start-now')">{{ $t('btr.startNow') }}</button>
        <input
          v-model="remainingInput"
          type="text"
          :placeholder="$t('btr.remainingPlaceholder')"
          :class="{ bad: inputError }"
          @keyup.enter="submitRemaining"
        />
        <button @click="submitRemaining">{{ $t('btr.calibrate') }}</button>
      </div>
      <div v-if="inputError" class="err sm">{{ $t('btr.invalidTime', { max: mmss(duration) }) }}</div>
    </div>

    <div class="status" :class="{ active: anchor && prediction?.status !== 'unknown' }">{{ statusText }}</div>
    <div v-if="message" class="msg sm">{{ message }}</div>

    <div class="stops">
      <div v-for="(name, i) in cfg.order" :key="name" class="stop">
        <span class="idx">{{ i + 1 }}</span>
        <span class="nm" :class="{ here: prediction?.status === 'stopped' && prediction.name === name }">{{ name }}</span>
        <span class="eta muted sm">
          <template v-if="anchor && arrivals[name] && elapsed != null">
            {{ arrivals[name].arrive <= elapsed ? $t('btr.atStop') : mmss(arrivals[name].arrive - elapsed) }}
          </template>
        </span>
        <button class="mini" :disabled="elapsed == null" :title="$t('btr.arriveTip')" @click="emit('calibrate', name, 'arrive')">{{ $t('btr.arrive') }}</button>
        <button class="mini" :disabled="elapsed == null" :title="$t('btr.departTip')" @click="emit('calibrate', name, 'depart')">{{ $t('btr.depart') }}</button>
        <span v-if="showSettings" class="order">
          <button class="mini" :disabled="i === 0" @click="emit('move', i, -1)">↑</button>
          <button class="mini" :disabled="i === cfg.order.length - 1" @click="emit('move', i, 1)">↓</button>
        </span>
      </div>
    </div>

    <div class="row">
      <button class="sm-btn" @click="emit('reverse')">{{ $t('btr.reverse') }}</button>
      <button v-if="anchor" class="sm-btn" @click="emit('clear-anchor')">{{ $t('btr.clearAnchor') }}</button>
      <button class="sm-btn" @click="showSettings = !showSettings">{{ showSettings ? $t('btr.hideSettings') : $t('btr.settings') }}</button>
    </div>

    <div v-if="showSettings" class="settings">
      <label>{{ $t('btr.waitLabel') }}<input v-model.number="cfg.wait" type="number" min="30" max="600" /></label>
      <label>{{ $t('btr.speedLabel') }}<input v-model.number="cfg.speed" type="number" min="1" max="20" step="0.5" /></label>
      <label>{{ $t('btr.roadLabel') }}<input v-model.number="cfg.roadFactor" type="number" min="1" max="3" step="0.1" /></label>
      <div class="muted sm">
        {{ $t('btr.modelHint', { n: learnedCount }) }}
        {{ $t('btr.defaults', { wait: DEFAULTS.wait, speed: DEFAULTS.speed, road: DEFAULTS.roadFactor }) }}
      </div>
      <button class="sm-btn" @click="emit('reset-config')">{{ $t('btr.resetConfig') }}</button>
    </div>

    <div class="muted sm note">
      {{ $t('btr.disclaimer') }}
    </div>
  </div>
</template>

<style scoped>
.btr { display: flex; flex-direction: column; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.title { font-weight: 700; }
.clock { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.clock b { font-variant-numeric: tabular-nums; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.row input { width: 110px; padding: 3px 6px; }
.row button { padding: 2px 8px; font-size: 12px; }
.bad { border-color: var(--err) !important; }
.err { color: var(--err); }
.status { font-size: 13px; padding: 6px 8px; border-radius: 6px; background: var(--panel-2); }
.status.active { background: #2b2f1a; color: #d7e07a; }
.msg { color: #8fd3a8; }
.stops { display: flex; flex-direction: column; gap: 2px; }
.stop { display: flex; align-items: center; gap: 4px; font-size: 13px; }
.idx { width: 16px; color: var(--muted); font-size: 11px; text-align: right; }
.nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm.here { color: #d7e07a; font-weight: 700; }
.eta { width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
.mini { padding: 0 5px; font-size: 11px; line-height: 18px; }
.mini:disabled { opacity: 0.4; cursor: default; }
.order { display: flex; gap: 2px; }
.sm-btn { padding: 2px 8px; font-size: 12px; }
.settings { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.settings label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.settings input { width: 80px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; }
.sm { font-size: 11px; }
.note { line-height: 1.4; }
</style>
