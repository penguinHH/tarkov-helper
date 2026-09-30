// 数据来自 tarkov.dev：https://json.tarkov.dev/endpoints
// 每次成功的结果都会缓存（桌面端存磁盘，浏览器存 localStorage），数据源出问题时回退到缓存。
const JSON_BASE = 'https://json.tarkov.dev'
const MAPS_META_URL = 'https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/src/data/maps.json'
const MAPS_TRANSLATION_URL = 'https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/src/translations'

async function readCache(key) {
  try {
    if (window.desktop?.cacheGet) return await window.desktop.cacheGet(key)
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

async function writeCache(key, data) {
  const value = { time: Date.now(), data }
  try {
    if (window.desktop?.cacheSet) await window.desktop.cacheSet(key, value)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 缓存写满或不可用时忽略
  }
}

// 返回 { data, cachedAt, error }：cachedAt 非空表示用的是旧缓存
async function cached(key, loader) {
  try {
    const data = await loader()
    writeCache(key, data)
    return { data, cachedAt: null, error: null }
  } catch (error) {
    const c = await readCache(key)
    if (c) return { data: c.data, cachedAt: c.time, error }
    throw error
  }
}

// 桌面端走主进程代发（无 CORS 限制），浏览器里直接 fetch
async function request(url, init) {
  if (window.desktop?.fetch) return window.desktop.fetch(url, init)
  const res = await fetch(url, init)
  return { ok: res.ok, status: res.status, text: await res.text() }
}

// tarkov.dev 的静态 JSON 数据（官网本身也用它）。文本字段存的是翻译键，
// 对应语言的译文在 {kind}_{lang} 文件里，缺失时回退英文。
async function getJson(path) {
  const res = await request(`${JSON_BASE}/${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} (${path})`)
  return JSON.parse(res.text).data
}

// 同一份原始数据 5 分钟内复用（地图约 8MB、物品约 1.4MB）
const memo = {}
function load(path) {
  const hit = memo[path]
  if (hit && Date.now() - hit.time < 5 * 60 * 1000) return hit.promise
  const promise = getJson(path)
  promise.catch(() => delete memo[path])
  memo[path] = { time: Date.now(), promise }
  return promise
}

async function translator(gameMode, kind, lang) {
  const [loc, en] = await Promise.all([
    load(`${gameMode}/${kind}_${lang}`),
    lang === 'en' ? {} : load(`${gameMode}/${kind}_en`)
  ])
  return (key) => (key == null ? key : (loc[key] ?? en[key] ?? key))
}

// gameMode: 'regular'(PVP) | 'pve'
export function fetchDashboard(gameMode, lang = 'zh') {
  return cached(`dashboard:${gameMode}:${lang}`, async () => {
    const [traders, t, maps, tm] = await Promise.all([
      load(`${gameMode}/traders`),
      translator(gameMode, 'traders', lang),
      load(`${gameMode}/maps`),
      translator(gameMode, 'maps', lang)
    ])
    return {
      traders: Object.values(traders).map((x) => ({
        id: x.id,
        name: t(x.name),
        normalizedName: x.normalizedName,
        resetTime: x.resetTime,
        imageLink: x.imageLink
      })),
      goonReports: [...maps.goonReports]
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
        .slice(0, 5)
        .map((r) => {
          const m = maps.maps[r.map]
          return { map: { name: m ? tm(m.name) : r.map, normalizedName: m?.normalizedName }, timestamp: r.timestamp }
        })
    }
  })
}

const xyz = (p) => (p ? { x: p.x, y: p.y, z: p.z } : null)
const outline = (o) => (o ?? []).map(xyz)

// 地图列表 + 每张图的全部标记数据（撤离、出生、Boss、容器、散落物资、锁、开关、危险区、任务等），
// 名称全部解析成目标语言，只保留地图页需要的字段。
export function fetchMapData(gameMode, lang = 'zh') {
  return cached(`mapdata:${gameMode}:${lang}`, async () => {
    const [raw, tm, itemsRaw, ti, tasksRaw, tt, tradersRaw, ttr] = await Promise.all([
      load(`${gameMode}/maps`),
      translator(gameMode, 'maps', lang),
      load(`${gameMode}/items`),
      translator(gameMode, 'items', lang),
      load(`${gameMode}/tasks`),
      translator(gameMode, 'tasks', lang),
      load(`${gameMode}/traders`),
      translator(gameMode, 'traders', lang)
    ])

    // 只收录被地图引用到的物品，控制缓存体积
    const items = {}
    const useItem = (id) => {
      if (!id) return null
      if (!items[id]) {
        const it = itemsRaw.items[id] ?? tasksRaw.questItems?.[id]
        if (!it) return null
        const t = itemsRaw.items[id] ? ti : tt
        items[id] = {
          id,
          name: t(it.name),
          shortName: t(it.shortName),
          icon: it.iconLink,
          image: it.baseImageLink,
          width: it.width,
          height: it.height,
          category: it.handbookCategories?.[0] ?? null
        }
      }
      return id
    }
    const categories = {}
    const useCategory = (id) => {
      const c = id && itemsRaw.handbookCategories[id]
      if (!c) return null
      categories[id] ??= { id, name: ti(c.name), icon: c.imageLink }
      return id
    }

    const maps = Object.values(raw.maps).map((m) => {
      const switchName = (id) => tm(m.switches.find((s) => s.id === id)?.name ?? id)
      const extractName = (id) => tm(m.extracts.find((e) => e.id === id)?.name ?? id)
      return {
        id: m.id,
        name: tm(m.name),
        normalizedName: m.normalizedName,
        raidDuration: m.raidDuration,
        players: m.players,
        extracts: m.extracts.map((e) => ({
          id: e.id,
          name: tm(e.name),
          faction: e.faction ?? 'shared',
          position: xyz(e.position),
          outline: outline(e.outline),
          top: e.top,
          bottom: e.bottom,
          switches: (e.switches ?? []).map(switchName),
          transferItem: e.transferItem ? { item: useItem(e.transferItem.item), count: e.transferItem.count } : null
        })),
        transits: m.transits.map((x) => ({
          id: x.id,
          description: tm(x.description),
          position: xyz(x.position),
          outline: outline(x.outline),
          top: x.top,
          bottom: x.bottom
        })),
        spawns: m.spawns.map((x) => ({
          zoneName: x.zoneName,
          sides: x.sides,
          categories: x.categories,
          position: xyz(x.position)
        })),
        bosses: m.bosses.map((b) => ({
          name: tm(raw.mobs[b.mob]?.name ?? b.mob),
          normalizedName: raw.mobs[b.mob]?.normalizedName ?? b.mob,
          image: raw.mobs[b.mob]?.imagePortraitLink ?? null,
          spawnChance: b.spawnChance,
          spawnLocations: (b.spawnLocations ?? []).map((l) => ({ name: l.name, chance: l.chance }))
        })),
        btrStops: (m.btrStops ?? []).map((s) => ({ name: tm(s.name), position: xyz(s) })),
        switches: m.switches.map((s) => ({
          id: s.id,
          name: tm(s.name),
          position: xyz(s.position),
          activatedBy: s.activatedBy ? switchName(s.activatedBy) : null,
          activates: (s.activates ?? []).map((a) => ({
            operation: a.operation,
            name: a.switch ? switchName(a.switch) : a.extract ? extractName(a.extract) : ''
          }))
        })),
        stationaryWeapons: m.stationaryWeapons.map((w) => ({
          name: tm(raw.stationaryWeapons[w.stationaryWeapon]?.name ?? w.stationaryWeapon),
          position: xyz(w.position)
        })),
        locks: m.locks.map((l) => ({
          lockType: l.lockType,
          key: useItem(l.key),
          needsPower: l.needsPower,
          position: xyz(l.position)
        })),
        hazards: [
          ...m.hazards.map((h) => ({
            type: h.hazardType,
            name: tm(h.name),
            position: xyz(h.position),
            outline: outline(h.outline),
            top: h.top,
            bottom: h.bottom
          })),
          ...(m.artillery?.zones ?? []).map((h) => ({
            type: 'mortar',
            name: fixedName('mortar', lang),
            position: xyz(h.position),
            outline: outline(h.outline),
            top: h.top,
            bottom: h.bottom ?? h.botom
          }))
        ],
        lootContainers: m.lootContainers.map((c) => {
          const def = raw.lootContainers[c.lootContainer]
          return {
            type: def?.normalizedName ?? c.lootContainer,
            name: tm(def?.name ?? c.lootContainer),
            position: xyz(c.position)
          }
        }),
        lootLoose: m.lootLoose.map((l) => {
          const ids = l.items.map(useItem).filter(Boolean)
          ids.forEach((id) => useCategory(items[id].category))
          return { position: xyz(l.position), items: ids }
        }),
        tasks: []
      }
    })

    // 任务目标：任务物品可能出现的位置 + 需要到达/标记的区域
    const byId = Object.fromEntries(maps.map((m) => [m.id, m]))
    for (const task of Object.values(tasksRaw.tasks)) {
      const trader = tradersRaw[task.trader]
      for (const o of task.objectives) {
        const perMap = {}
        const entry = (mapId) =>
          (perMap[mapId] ??= {
            taskId: task.id,
            taskName: tt(task.name),
            trader: trader ? ttr(trader.name) : '',
            wikiLink: task.wikiLink,
            description: tt(o.description),
            type: o.type,
            optional: o.optional,
            questItem: o.questItem ? useItem(o.questItem) : null,
            positions: [],
            zones: []
          })
        for (const loc of o.possibleLocations ?? []) {
          if (byId[loc.map]) entry(loc.map).positions.push(...loc.positions.map(xyz))
        }
        for (const z of o.zones ?? []) {
          if (byId[z.map]) {
            entry(z.map).zones.push({ position: xyz(z.position), outline: outline(z.outline), top: z.top, bottom: z.bottom })
          }
        }
        for (const [mapId, e] of Object.entries(perMap)) byId[mapId].tasks.push(e)
      }
    }

    return { maps, items, categories }
  })
}

export async function fetchSvg(url) {
  const res = await request(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text
}

// tarkov.dev 翻译文件里缺的楼层名（实验室、破冰船）；英文直接用原名
const LEVEL_NAMES = {
  zh: {
    'Second Level': '二层',
    Technical: '技术层',
    Infirmary: '医务室',
    Helipad: '停机坪',
    'Gym/Canteen': '健身房/食堂',
    'Accommodation (lower)': '住舱（下）',
    'Accommodation (mid)': '住舱（中）',
    'Accommodation (upper)': '住舱（上）',
    "Officers' Deck": '军官甲板',
    'Stairs (blocked)': '楼梯（封闭）',
    Bridge: '舰桥',
    'Bridge Roof': '舰桥顶',
    'Control Room': '控制室',
    'Engine Room': '轮机舱',
    'Engine Room (upper)': '轮机舱（上）',
    'Fuel Pumps': '燃油泵舱',
    'Fuel Pumps (lower)': '燃油泵舱（下）',
    'Storage/Security': '储藏/安保室'
  },
  ja: {
    'Second Level': '2層',
    Technical: '技術区画',
    Infirmary: '医務室',
    Helipad: 'ヘリポート',
    'Gym/Canteen': 'ジム/食堂',
    'Accommodation (lower)': '居住区（下）',
    'Accommodation (mid)': '居住区（中）',
    'Accommodation (upper)': '居住区（上）',
    "Officers' Deck": '士官甲板',
    'Stairs (blocked)': '階段（封鎖）',
    Bridge: '船橋',
    'Bridge Roof': '船橋屋上',
    'Control Room': '制御室',
    'Engine Room': '機関室',
    'Engine Room (upper)': '機関室（上）',
    'Fuel Pumps': '燃料ポンプ室',
    'Fuel Pumps (lower)': '燃料ポンプ室（下）',
    'Storage/Security': '倉庫/警備室'
  }
}

// 数据里没有翻译的少量固定名称
const FIXED_NAMES = {
  mortar: { zh: '迫击炮区域', en: 'Mortar zone', ja: '迫撃砲エリア' },
  flea: { zh: '跳蚤市场', en: 'Flea Market', ja: 'フリーマーケット' }
}
const fixedName = (key, lang) => FIXED_NAMES[key][lang] ?? FIXED_NAMES[key].en

// 地图底图元数据（坐标变换、SVG/瓦片路径、楼层、地名标签），来自 tarkov.dev 开源仓库。
// altMaps（如夜间工厂）与主图共用底图。
export function fetchMapsMeta(lang = 'zh') {
  return cached(`maps-meta:${lang}`, async () => {
    const [res, tr] = await Promise.all([
      request(MAPS_META_URL),
      // 楼层名的翻译（tarkov.dev 前端的翻译文件；地名它本身也不翻译）
      request(`${MAPS_TRANSLATION_URL}/${lang}/maps.json`).catch(() => null)
    ])
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = JSON.parse(res.text)
    const t = tr?.ok ? JSON.parse(tr.text) : {}
    const out = {}
    for (const group of raw) {
      const m = group.maps.find((x) => x.projection === 'interactive')
      if (!m) continue
      for (const l of m.layers ?? []) l.name = t[l.name] ?? LEVEL_NAMES[lang]?.[l.name] ?? l.name
      out[group.normalizedName] = m
      for (const alt of m.altMaps ?? []) out[alt] ??= m
    }
    return out
  })
}

// ---------- 物品价格 ----------

// 全部物品的价格信息（跳蚤市场 + 商人收购/出售），只保留价格页需要的字段
export function fetchItems(gameMode, lang = 'zh') {
  return cached(`items:${gameMode}:${lang}`, async () => {
    const [raw, t, tradersRaw, ttr] = await Promise.all([
      load(`${gameMode}/items`),
      translator(gameMode, 'items', lang),
      load(`${gameMode}/traders`),
      translator(gameMode, 'traders', lang)
    ])
    const hb = raw.handbookCategories
    // 物品的顶级分类（武器、弹药、钥匙……）
    const rootOf = (id) => {
      let c = hb[id]
      while (c?.parent && hb[c.parent]) c = hb[c.parent]
      return c?.id ?? null
    }
    const traders = { flea: { id: 'flea', name: fixedName('flea', lang), image: null } }
    for (const tr of Object.values(tradersRaw)) traders[tr.id] = { id: tr.id, name: ttr(tr.name), image: tr.imageLink }
    const categories = {}
    const items = Object.values(raw.items)
      .filter((it) => !it.types.includes('preset'))
      .map((it) => {
        const root = rootOf(it.handbookCategories?.[0])
        if (root && !categories[root]) categories[root] = { id: root, name: t(hb[root].name), icon: hb[root].imageLink }
        return {
          id: it.id,
          name: t(it.name),
          shortName: t(it.shortName),
          normalizedName: it.normalizedName,
          icon: it.iconLink,
          image: it.image512pxLink ?? it.baseImageLink,
          width: it.width,
          height: it.height,
          weight: it.weight,
          basePrice: it.basePrice,
          avg24hPrice: it.avg24hPrice ?? null,
          lastLowPrice: it.lastLowPrice ?? null,
          low24hPrice: it.low24hPrice ?? null,
          high24hPrice: it.high24hPrice ?? null,
          changeLast48hPercent: it.changeLast48hPercent ?? null,
          lastOfferCount: it.lastOfferCount ?? 0,
          updated: it.updated,
          noFlea: it.types.includes('noFlea'),
          category: root,
          sellToTrader: (it.sellToTrader ?? []).map((s) => ({
            trader: s.trader,
            price: s.price,
            priceRUB: s.priceRUB,
            currency: s.currency
          })),
          buyFromTrader: (it.buyFromTrader ?? []).map((b) => ({
            trader: b.trader,
            price: b.price,
            priceRUB: b.priceRUB,
            currency: b.currency,
            minTraderLevel: b.minTraderLevel,
            taskUnlock: Boolean(b.taskUnlock),
            buyLimit: b.buyLimit
          })),
          wikiLink: it.wikiLink,
          link: it.link
        }
      })
    return { items, traders, categories }
  })
}

// 单个物品的跳蚤市场价格历史：[{ timestamp, price, priceMin }]
export function fetchPriceHistory(gameMode, itemId) {
  return cached(`prices:${gameMode}:${itemId}`, () => getJson(`${gameMode}/prices/${itemId}`))
}

// ---------- 任务 ----------

// 全部任务（中文名称与目标描述），附带引用到的物品、商人、地图，供任务列表与详情页使用
export function fetchTasks(gameMode, lang = 'zh') {
  return cached(`tasks:${gameMode}:${lang}`, async () => {
    const [raw, tt, itemsRaw, ti, tradersRaw, ttr, mapsRaw, tm] = await Promise.all([
      load(`${gameMode}/tasks`),
      translator(gameMode, 'tasks', lang),
      load(`${gameMode}/items`),
      translator(gameMode, 'items', lang),
      load(`${gameMode}/traders`),
      translator(gameMode, 'traders', lang),
      load(`${gameMode}/maps`),
      translator(gameMode, 'maps', lang)
    ])
    const items = {}
    const useItem = (id) => {
      if (!id) return null
      if (!items[id]) {
        const it = itemsRaw.items[id] ?? raw.questItems?.[id]
        if (!it) return null
        const t = itemsRaw.items[id] ? ti : tt
        items[id] = { id, name: t(it.name), shortName: t(it.shortName), icon: it.iconLink }
      }
      return id
    }
    const traders = {}
    for (const tr of Object.values(tradersRaw)) traders[tr.id] = { id: tr.id, name: ttr(tr.name), image: tr.imageLink }
    const maps = {}
    for (const m of Object.values(mapsRaw.maps)) maps[m.id] = { id: m.id, name: tm(m.name), normalizedName: m.normalizedName }

    const tasks = Object.values(raw.tasks).map((t) => {
      const r = t.finishRewards ?? {}
      return {
        id: t.id,
        name: tt(t.name),
        normalizedName: t.normalizedName,
        trader: t.trader,
        map: t.map ?? null,
        minPlayerLevel: t.minPlayerLevel,
        kappaRequired: t.kappaRequired,
        lightkeeperRequired: t.lightkeeperRequired,
        factionName: t.factionName,
        experience: t.experience,
        wikiLink: t.wikiLink,
        image: t.taskImageLink,
        restartable: t.restartable,
        taskRequirements: (t.taskRequirements ?? []).map((q) => ({ task: q.task, status: q.status })),
        traderRequirements: (t.traderRequirements ?? []).map((q) => ({
          trader: q.trader,
          type: q.requirementType,
          compare: q.compareMethod,
          value: q.value
        })),
        objectives: (t.objectives ?? []).map((o) => ({
          id: o.id,
          type: o.type,
          description: tt(o.description),
          optional: o.optional,
          count: o.count ?? null,
          maps: o.maps ?? [],
          questItem: useItem(o.questItem),
          items: (o.items ?? []).slice(0, 12).map(useItem).filter(Boolean),
          moreItems: Math.max(0, (o.items?.length ?? 0) - 12),
          onMap: Boolean(o.zones?.length || o.possibleLocations?.length)
        })),
        neededKeys: (t.neededKeys ?? []).map((k) => ({ map: k.map, keys: k.keys.map(useItem).filter(Boolean) })),
        rewards: {
          items: (r.items ?? []).map((i) => ({ item: useItem(i.item), count: i.count })).filter((i) => i.item),
          traderStanding: (r.traderStanding ?? []).map((s) => ({ trader: s.trader, standing: s.standing })),
          offerUnlock: (r.offerUnlock ?? []).map((o) => ({ trader: o.trader, level: o.level, item: useItem(o.item) })),
          skillLevelReward: (r.skillLevelReward ?? []).map((s) => ({ name: tt(s.skill ?? s.name), level: s.level })),
          traderUnlock: (r.traderUnlock ?? []).map((u) => u.id ?? u)
        }
      }
    })
    return { tasks, items, traders, maps }
  })
}

// EFT 官方 Wiki（Fandom / MediaWiki）页面的 HTML 内容；wikiLink 形如 https://escapefromtarkov.fandom.com/wiki/Debut
const WIKI_API = 'https://escapefromtarkov.fandom.com/api.php'
export function fetchWikiPage(wikiLink) {
  const title = decodeURIComponent(wikiLink.split('/wiki/')[1] ?? '')
  return cached(`wiki:${title}`, async () => {
    const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&redirects=1&origin=*`
    const res = await request(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = JSON.parse(res.text)
    if (json.error) throw new Error(json.error.info ?? json.error.code)
    return { title: json.parse.title, html: json.parse.text['*'] }
  })
}
