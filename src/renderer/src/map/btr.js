// BTR 路线预测模型。
//
// 已知（公开资料）：BTR 沿固定站点循环行驶，每站停约 2 分钟；具体到站时间因局而异（±1~2 分钟）。
// 做法：路线 = 站点的循环顺序；两站间行驶时间 = 学到的实测值（中位数），没有实测就用
// 直线距离 × 道路系数 ÷ 速度估算。用户在游戏里看到 BTR 到站/离站时校准一次（锚点），
// 由锚点向前、向后推出整局的时刻表，再按战局已进行时间插值出当前位置。
// 同一局里连续两次校准会记录那一段的实际行驶时间，下次预测自动使用。

export const DEFAULTS = { wait: 120, speed: 6, roadFactor: 1.3 }

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// 最短回路作为默认顺序（站点 ≤ 8 个，直接枚举）
export function shortestCycle(stops) {
  const n = stops.length
  if (n <= 3) return stops.map((_, i) => i)
  let best = null
  let bestLen = Infinity
  const rest = stops.map((_, i) => i).slice(1)
  const permute = (arr, k) => {
    if (k === arr.length) {
      const order = [0, ...arr]
      let len = 0
      for (let i = 0; i < n; i++) len += dist(stops[order[i]].position, stops[order[(i + 1) % n]].position)
      if (len < bestLen) {
        bestLen = len
        best = order
      }
      return
    }
    for (let i = k; i < arr.length; i++) {
      ;[arr[k], arr[i]] = [arr[i], arr[k]]
      permute(arr, k + 1)
      ;[arr[k], arr[i]] = [arr[i], arr[k]]
    }
  }
  permute(rest, 0)
  return best
}

// ---------- 每张地图的配置（本机记住） ----------
export function loadConfig(mapKey, stops) {
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(`btr:${mapKey}`)) ?? {}
  } catch {
    // 忽略
  }
  const names = stops.map((s) => s.name)
  // 保存的顺序只在站点集合没变时有效
  const valid = Array.isArray(saved.order) && saved.order.length === names.length && saved.order.every((n) => names.includes(n))
  return {
    order: valid ? saved.order : shortestCycle(stops).map((i) => names[i]),
    wait: saved.wait ?? DEFAULTS.wait,
    speed: saved.speed ?? DEFAULTS.speed,
    roadFactor: saved.roadFactor ?? DEFAULTS.roadFactor,
    samples: saved.samples ?? {}
  }
}

export function saveConfig(mapKey, cfg) {
  try {
    localStorage.setItem(`btr:${mapKey}`, JSON.stringify(cfg))
  } catch {
    // 忽略
  }
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// 两站间行驶时间（秒）
export function travelTime(cfg, byName, from, to) {
  const learned = cfg.samples[`${from}>${to}`]
  if (learned?.length) return { seconds: median(learned), learned: true }
  const d = dist(byName[from].position, byName[to].position)
  return { seconds: (d * cfg.roadFactor) / cfg.speed, learned: false }
}

// 由锚点推出整局时刻表：[{ name, arrive, depart }]（单位：战局已进行秒数）
// anchor: { name, arrive }
export function buildSchedule(cfg, byName, anchor, duration) {
  const order = cfg.order
  const n = order.length
  const k0 = order.indexOf(anchor.name)
  if (k0 < 0 || n < 2) return []
  const visits = [{ name: anchor.name, arrive: anchor.arrive, depart: anchor.arrive + cfg.wait }]
  // 向后推
  let k = k0
  let t = anchor.arrive
  for (let guard = 0; guard < 200; guard++) {
    const next = (k + 1) % n
    t = t + cfg.wait + travelTime(cfg, byName, order[k], order[next]).seconds
    if (t > duration) break
    visits.push({ name: order[next], arrive: t, depart: t + cfg.wait })
    k = next
  }
  // 向前推
  k = k0
  t = anchor.arrive
  for (let guard = 0; guard < 200; guard++) {
    const prev = (k - 1 + n) % n
    const depart = t - travelTime(cfg, byName, order[prev], order[k]).seconds
    const arrive = depart - cfg.wait
    if (depart < 0) break
    visits.unshift({ name: order[prev], arrive, depart })
    t = arrive
    k = prev
  }
  return visits
}

// 当前状态：{ status: 'stopped'|'moving'|'unknown', position, name, from, to, arriveIn, departIn }
export function predict(schedule, byName, elapsed) {
  for (let i = 0; i < schedule.length; i++) {
    const v = schedule[i]
    if (elapsed >= v.arrive && elapsed <= v.depart) {
      return { status: 'stopped', name: v.name, position: byName[v.name].position, departIn: v.depart - elapsed }
    }
    const next = schedule[i + 1]
    if (next && elapsed > v.depart && elapsed < next.arrive) {
      const f = (elapsed - v.depart) / (next.arrive - v.depart)
      const a = byName[v.name].position
      const b = byName[next.name].position
      return {
        status: 'moving',
        from: v.name,
        to: next.name,
        position: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f },
        arriveIn: next.arrive - elapsed
      }
    }
  }
  return { status: 'unknown' }
}

// 每个站点下一次到达时间（已进行秒数），没有则为 null
export function nextArrivals(schedule, elapsed) {
  const out = {}
  for (const v of schedule) {
    if (v.depart >= elapsed && out[v.name] == null) out[v.name] = v
  }
  return out
}

// 记录一次校准；同一局里上一次校准的站点若恰好是这一站的上一站，就学习这段行驶时间。
// 若恰好是下一站（说明方向反了），返回 { reversed: true }。
export function learnFromCalibration(cfg, prev, cur) {
  if (!prev || prev.raidKey !== cur.raidKey || prev.name === cur.name) return {}
  const n = cfg.order.length
  const ka = cfg.order.indexOf(prev.name)
  const kb = cfg.order.indexOf(cur.name)
  if (ka < 0 || kb < 0) return {}
  if ((ka + 1) % n === kb) {
    const sample = cur.arrive - prev.arrive - cfg.wait
    // 过滤明显不合理的样本（漏看了一整圈等）
    if (sample > 10 && sample < 900) {
      const key = `${prev.name}>${cur.name}`
      cfg.samples[key] = [...(cfg.samples[key] ?? []), Math.round(sample)].slice(-10)
      return { learned: key, seconds: Math.round(sample) }
    }
  } else if ((kb + 1) % n === ka) {
    return { reversed: true }
  }
  return {}
}

export const mmss = (sec) => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function parseMmss(text) {
  const m = String(text).trim().match(/^(\d{1,2})[:：](\d{1,2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
