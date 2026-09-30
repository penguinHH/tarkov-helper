<script setup>
import { reactive } from 'vue'

// groups: [{ key, label, items: [{ key, label, count, color }] }]
// visible: { [layerKey]: boolean }（父组件的 reactive 对象，直接修改）
const props = defineProps({ groups: { type: Array, required: true }, visible: { type: Object, required: true } })

const collapsed = reactive({ containers: true, loose: true })

function setGroup(g, on) {
  for (const i of g.items) props.visible[i.key] = on
}
const groupState = (g) => {
  const n = g.items.filter((i) => props.visible[i.key]).length
  return n === 0 ? 'none' : n === g.items.length ? 'all' : 'some'
}
</script>

<template>
  <div class="panel">
    <div v-for="g in groups" :key="g.key" class="group">
      <div class="group-head">
        <button class="fold" @click="collapsed[g.key] = !collapsed[g.key]">{{ collapsed[g.key] ? '▸' : '▾' }}</button>
        <label class="group-label">
          <input
            type="checkbox"
            :checked="groupState(g) === 'all'"
            :indeterminate.prop="groupState(g) === 'some'"
            @change="setGroup(g, $event.target.checked)"
          />
          {{ g.label }}
        </label>
        <span class="muted count">{{ g.items.reduce((s, i) => s + i.count, 0) }}</span>
      </div>
      <div v-show="!collapsed[g.key]" class="items">
        <label v-for="i in g.items" :key="i.key" class="item">
          <input v-model="visible[i.key]" type="checkbox" />
          <span class="swatch" :style="{ background: i.color }"></span>
          <span class="name">{{ i.label }}</span>
          <span class="muted count">{{ i.count }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 4px; }
.group-head { display: flex; align-items: center; gap: 4px; }
.fold { border: none; background: none; padding: 0 2px; width: 18px; color: var(--muted); }
.group-label { display: flex; align-items: center; gap: 6px; font-weight: 600; cursor: pointer; flex: 1; }
.items { display: flex; flex-direction: column; padding: 2px 0 6px 22px; }
.item { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 1px 0; font-size: 13px; }
.item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.count { font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
