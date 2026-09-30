// 把一张地图的数据构建成分组的 Leaflet 图层，覆盖 tarkov.dev 互动地图的全部内容。
// 返回 { groups, layers, entries }：
//   groups  —— 图层面板用的分组 [{ key, label, items: [{ key, label, count, color }] }]
//   layers  —— { key: L.LayerGroup }
//   entries —— 每个标记的元数据（楼层判断、搜索、定位用）
import L from 'leaflet'
import { pos } from './crs'
import { COLORS, esc, labelIcon, pinIcon, imageIcon, placeIcon, hashColor } from './icons'
import { t, tOr } from '../i18n'

// 以下名称随界面语言变化（地图在切换语言时会重建）
const faction = (f) => tOr(`layers.faction.${f}`, f)
const lockType = (x) => tOr(`layers.lockType.${x}`, t('layers.lock'))
const hazardName = (type, fallback) => tOr(`layers.hazard.${type}`, fallback)
const operation = (op) => tOr(`layers.op.${op}`, op)

const outlineToLatLngs = (outline) => outline.map(pos)
const elevation = (p) => `<div class="pp-muted">${esc(t('layers.elevation', { n: p.y.toFixed(1) }))}</div>`

// opts.taskStatus(taskId) → 'started' | 'finished' | 'failed' | null，用于把任务标记按进度分层
export function buildLayers(map, meta, data, opts = {}) {
  const { items, categories } = data.shared
  const layers = {}
  const entries = []
  const groupDefs = []

  const layerFor = (key) => (layers[key] ??= L.layerGroup())

  // 注册一个标记：放进图层、记录元数据；有轮廓的悬停/点击时显示轮廓
  function add(key, marker, info) {
    const group = layerFor(key)
    let outline = null
    if (info.outline?.length > 2) {
      outline = L.polygon(outlineToLatLngs(info.outline), {
        color: info.outlineColor ?? '#fff',
        weight: 1.5,
        fillOpacity: 0.15,
        className: 'mk-outline hidden',
        interactive: false
      })
      group.addLayer(outline)
      const show = (on) => outline.getElement()?.classList.toggle('hidden', !on && !outline.forced)
      marker.on('mouseover', () => show(true))
      marker.on('mouseout', () => show(false))
      marker.on('click', () => {
        outline.forced = !outline.forced
        show(outline.forced)
      })
    }
    group.addLayer(marker)
    entries.push({
      key,
      marker,
      outline,
      position: info.position,
      top: info.top,
      bottom: info.bottom,
      search: info.search,
      taskId: info.taskId ?? null
    })
  }

  function group(key, label, items) {
    const list = items.filter((i) => layers[i.key])
    if (list.length) {
      for (const i of list) i.count = layers[i.key].getLayers().filter((l) => l instanceof L.Marker).length
      groupDefs.push({ key, label, items: list })
    }
  }

  // ---------- 撤离点 / 转移点 ----------
  for (const e of data.extracts) {
    if (!e.position) continue
    const lines = [`<b>${esc(e.name)}</b>`, `<div>${esc(t('layers.extractOf', { faction: faction(e.faction) }))}</div>`]
    if (e.switches.length) lines.push(`<div>${esc(t('layers.needsSwitch'))}${e.switches.map(esc).join(t('common.listSep'))}</div>`)
    if (e.transferItem?.item && items[e.transferItem.item]) {
      const it = items[e.transferItem.item]
      lines.push(
        `<div class="pp-item"><img src="${esc(it.icon)}" />${esc(t('layers.needsItem'))}${esc(it.name)}${e.transferItem.count > 1 ? ` ×${e.transferItem.count}` : ''}</div>`
      )
    }
    lines.push(elevation(e.position))
    const marker = L.marker(pos(e.position), {
      icon: labelIcon(`extract ${e.faction}`, e.name),
      zIndexOffset: { pmc: 150, shared: 125, scav: 100 }[e.faction] ?? 100,
      riseOnHover: true
    }).bindPopup(lines.join(''))
    add(`extract_${e.faction}`, marker, { ...e, outlineColor: COLORS[e.faction], search: e.name })
  }
  for (const tr of data.transits) {
    if (!tr.position) continue
    const marker = L.marker(pos(tr.position), { icon: labelIcon('transit', tr.description), zIndexOffset: 150, riseOnHover: true })
      .bindPopup(`<b>${esc(tr.description)}</b><div>${esc(t('layers.transit'))}</div>${elevation(tr.position)}`)
    add('transit', marker, { ...tr, outlineColor: COLORS.transit, search: tr.description })
  }
  group('extracts', t('layers.g.extracts'), [
    { key: 'extract_pmc', label: 'PMC', color: COLORS.pmc },
    { key: 'extract_shared', label: faction('shared'), color: COLORS.shared },
    { key: 'extract_scav', label: 'Scav', color: COLORS.scav },
    { key: 'transit', label: t('layers.transit'), color: COLORS.transit }
  ])

  // ---------- 出生点 / Boss ----------
  const bossByZone = {}
  for (const b of data.bosses) {
    for (const loc of b.spawnLocations) (bossByZone[loc.name] ??= []).push({ ...b, locChance: loc.chance })
  }
  for (const s of data.spawns) {
    if (!s.position) continue
    const cats = s.categories ?? []
    const sides = s.sides ?? []
    const bosses = cats.includes('boss') ? (bossByZone[s.zoneName] ?? []) : []
    if (bosses.length) {
      const html = bosses
        .map(
          (b) =>
            `<div class="pp-item">${b.image ? `<img src="${esc(b.image)}" />` : ''}<b>${esc(b.name)}</b>&nbsp;${Math.round(b.spawnChance * 100)}%${b.locChance < 1 ? ` (${esc(t('layers.here', { n: Math.round(b.locChance * 100) }))})` : ''}</div>`
        )
        .join('')
      const marker = L.marker(pos(s.position), { icon: pinIcon('boss', '☠'), zIndexOffset: 200, riseOnHover: true })
        .bindPopup(`${html}<div class="pp-muted">${esc(s.zoneName)}</div>${elevation(s.position)}`)
      add('spawn_boss', marker, { position: s.position, search: bosses.map((b) => b.name).join(' ') })
    } else if (cats.includes('player') && (sides.includes('pmc') || sides.includes('all'))) {
      const marker = L.marker(pos(s.position), { icon: pinIcon('spawn-pmc') }).bindPopup(
        `<b>${esc(t('layers.pmcSpawn'))}</b><div class="pp-muted">${esc(s.zoneName ?? '')}</div>${elevation(s.position)}`
      )
      add('spawn_pmc', marker, { position: s.position })
    } else if (cats.includes('sniper')) {
      const marker = L.marker(pos(s.position), { icon: pinIcon('spawn-sniper', '◎') }).bindPopup(
        `<b>${esc(t('layers.sniperScav'))}</b>${elevation(s.position)}`
      )
      add('spawn_sniper', marker, { position: s.position })
    } else if (sides.includes('scav') && (cats.includes('bot') || cats.includes('all'))) {
      const marker = L.marker(pos(s.position), { icon: pinIcon('spawn-scav') }).bindPopup(
        `<b>${esc(t('layers.scavSpawn'))}</b>${elevation(s.position)}`
      )
      add('spawn_scav', marker, { position: s.position })
    }
  }
  group('spawns', t('layers.g.spawns'), [
    { key: 'spawn_boss', label: 'Boss', color: COLORS.boss },
    { key: 'spawn_pmc', label: 'PMC', color: '#4c9bd0' },
    { key: 'spawn_scav', label: 'Scav', color: '#8fae5a' },
    { key: 'spawn_sniper', label: t('layers.sniperScav'), color: '#b27ad6' }
  ])

  // ---------- 任务 ----------
  const TASK_LAYER = { started: 'quest_active', finished: 'quest_done' }
  const TASK_TAG = {
    started: `<span class="pp-tag active">${esc(t('taskStatus.started'))}</span>`,
    finished: `<span class="pp-tag done">${esc(t('taskStatus.finished'))}</span>`
  }
  for (const tk of data.tasks) {
    const st = opts.taskStatus?.(tk.taskId) ?? null
    const active = st === 'started'
    const head = `<div class="pp-title">${TASK_TAG[st] ?? ''}${esc(tk.taskName)}${tk.trader ? `<span class="pp-muted"> (${esc(tk.trader)})</span>` : ''}</div>`
    const desc = `<div>${tk.optional ? esc(t('layers.optional')) : ''}${esc(tk.description)}</div>`
    const wiki = `<div class="pp-links"><a href="#/tasks/${esc(tk.taskId)}">${esc(t('layers.taskDetail'))}</a>${tk.wikiLink ? ` · <a href="${esc(tk.wikiLink)}" target="_blank">Wiki</a>` : ''}</div>`
    const qi = tk.questItem && items[tk.questItem]
    for (const p of tk.positions) {
      const marker = L.marker(pos(p), {
        icon: qi?.icon ? imageIcon(qi.icon, active ? 'quest active' : 'quest') : pinIcon(active ? 'quest active' : 'quest', '!'),
        zIndexOffset: active ? 400 : 300,
        riseOnHover: true
      }).bindPopup(
        `${head}${qi ? `<div class="pp-item"><img src="${esc(qi.icon)}" />${esc(qi.name)}</div>` : ''}${desc}${elevation(p)}${wiki}`
      )
      add(TASK_LAYER[st] ?? 'quest_item', marker, { position: p, taskId: tk.taskId, search: `${tk.taskName} ${qi?.name ?? ''}` })
    }
    for (const z of tk.zones) {
      if (!z.position) continue
      const marker = L.marker(pos(z.position), {
        icon: pinIcon(active ? 'quest active' : 'quest', '?'),
        zIndexOffset: active ? 400 : 300,
        riseOnHover: true
      }).bindPopup(
        `${head}${desc}${elevation(z.position)}${wiki}`
      )
      add(TASK_LAYER[st] ?? 'quest_objective', marker, {
        ...z,
        taskId: tk.taskId,
        outlineColor: active ? '#ffd23f' : COLORS.quest,
        search: `${tk.taskName} ${tk.description}`
      })
    }
  }
  group('tasks', t('layers.g.tasks'), [
    { key: 'quest_active', label: t('layers.questActive'), color: '#ffd23f' },
    { key: 'quest_item', label: t('layers.questItem'), color: COLORS.quest },
    { key: 'quest_objective', label: t('layers.questObjective'), color: COLORS.quest },
    { key: 'quest_done', label: t('taskStatus.finished'), color: '#6b6b6b' }
  ])

  // ---------- 地标 ----------
  for (const label of meta.labels ?? []) {
    const p = { x: label.position[0], y: label.position[2] ?? 0, z: label.position[1] }
    const marker = L.marker(pos(p), {
      icon: placeIcon(label.text, label.size, label.rotation),
      interactive: false,
      zIndexOffset: -100000
    })
    // 地名不参与楼层判断
    add('place_names', marker, { search: label.text })
  }
  for (const b of data.btrStops) {
    if (!b.position) continue
    const marker = L.marker(pos(b.position), { icon: labelIcon('btr', `BTR · ${b.name}`), riseOnHover: true }).bindPopup(
      `<b>${esc(t('layers.btrStop'))}</b><div>${esc(b.name)}</div>`
    )
    add('btr_stop', marker, { position: b.position, search: `BTR ${b.name}` })
  }
  group('landmarks', t('layers.g.landmarks'), [
    { key: 'place_names', label: t('layers.placeNames'), color: '#cfcfcf' },
    { key: 'btr_stop', label: t('layers.btrStop'), color: '#9ab04a' }
  ])

  // ---------- 可交互 ----------
  for (const l of data.locks) {
    const key = l.key && items[l.key]
    if (!key || !l.position) continue
    const marker = L.marker(pos(l.position), { icon: pinIcon('lock', '🔑'), riseOnHover: true }).bindPopup(
      `<b>${esc(lockType(l.lockType))}</b>${l.needsPower ? `<div><em>${esc(t('layers.needsPower'))}</em></div>` : ''}<div class="pp-item"><img src="${esc(key.icon)}" />${esc(key.name)}</div>${elevation(l.position)}`
    )
    add('lock', marker, { position: l.position, search: `${key.name} ${key.shortName}` })
  }
  for (const s of data.switches) {
    if (!s.position) continue
    const lines = [`<b>${esc(s.name)}</b>`]
    if (s.activatedBy) lines.push(`<div>${esc(t('layers.activatedBy', { name: s.activatedBy }))}</div>`)
    if (s.activates.length) {
      lines.push(`<div>${esc(t('layers.activates'))}</div>`)
      for (const a of s.activates) lines.push(`<div>· ${esc(operation(a.operation))} ${esc(a.name)}</div>`)
    }
    lines.push(elevation(s.position))
    const marker = L.marker(pos(s.position), { icon: pinIcon('switch', '⚡'), riseOnHover: true }).bindPopup(lines.join(''))
    add('switch', marker, { position: s.position, search: s.name })
  }
  for (const w of data.stationaryWeapons) {
    if (!w.position) continue
    const marker = L.marker(pos(w.position), { icon: pinIcon('stationary', '⌖'), riseOnHover: true }).bindPopup(
      `<b>${esc(w.name)}</b>${elevation(w.position)}`
    )
    add('stationary_gun', marker, { position: w.position, search: w.name })
  }
  group('usable', t('layers.g.usable'), [
    { key: 'lock', label: t('layers.locks'), color: '#d9b44a' },
    { key: 'switch', label: t('layers.switches'), color: '#e0d060' },
    { key: 'stationary_gun', label: t('layers.stationary'), color: '#a0a0a0' }
  ])

  // ---------- 危险区域 ----------
  const hazardItems = {}
  for (const h of data.hazards) {
    if (!h.position) continue
    const key = `hazard_${h.type}`
    hazardItems[key] ??= { key, label: hazardName(h.type, h.name), color: COLORS.hazard }
    const marker = L.marker(pos(h.position), {
      icon: pinIcon('hazard', h.type === 'mortar' ? '✹' : '⚠'),
      zIndexOffset: -100,
      riseOnHover: true
    }).bindPopup(`<b>${esc(hazardName(h.type, h.name))}</b>${elevation(h.position)}`)
    add(key, marker, { ...h, outlineColor: COLORS.hazard, search: hazardName(h.type, h.name) })
  }
  group('hazards', t('layers.g.hazards'), Object.values(hazardItems))

  // ---------- 容器 ----------
  const containerItems = {}
  for (const c of data.lootContainers) {
    if (!c.position) continue
    const key = `container_${c.type}`
    const color = hashColor(c.type)
    containerItems[key] ??= { key, label: c.name, color }
    const marker = L.marker(pos(c.position), {
      icon: anchoredBox(color, c.name),
      riseOnHover: true
    }).bindPopup(`<b>${esc(c.name)}</b>${elevation(c.position)}`)
    add(key, marker, { position: c.position, search: c.name })
  }
  group(
    'containers',
    t('layers.g.containers'),
    Object.values(containerItems).sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  )

  // ---------- 散落物资（按物品分类） ----------
  const looseItems = {}
  for (const l of data.lootLoose) {
    if (!l.position || !l.items.length) continue
    const list = l.items.map((id) => items[id]).filter(Boolean)
    if (!list.length) continue
    const catIds = [...new Set(list.map((i) => i.category).filter(Boolean))]
    const catId = catIds.length === 1 ? catIds[0] : 'mixed'
    const cat = categories[catId]
    const key = `loose_${catId}`
    looseItems[key] ??= { key, label: cat?.name ?? t('layers.mixedLoot'), color: '#c9b37e' }
    const icon = list.length === 1 ? imageIcon(list[0].icon, 'loot') : cat?.icon ? imageIcon(cat.icon, 'loot cat') : pinIcon('loot', '•')
    const marker = L.marker(pos(l.position), { icon, riseOnHover: true }).bindPopup(
      `<div class="pp-loot">${list.map((i) => `<div class="pp-item"><img src="${esc(i.icon)}" />${esc(i.name)}</div>`).join('')}</div>${elevation(l.position)}`
    )
    add(key, marker, { position: l.position, search: list.map((i) => `${i.name} ${i.shortName}`).join(' ') })
  }
  group(
    'loose',
    t('layers.g.loose'),
    Object.values(looseItems).sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  )

  return { groups: groupDefs, layers, entries }
}

// 容器图标：带颜色的小方块，首字作为标识
function anchoredBox(color, name) {
  return L.divIcon({
    className: 'mk-anchor',
    html: `<span class="mk mk-box" style="background:${color}">${esc([...name][0] ?? '')}</span>`,
    iconSize: [0, 0]
  })
}
