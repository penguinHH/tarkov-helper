// 楼层判断规则改写自 tarkov.dev（https://github.com/the-hideout/tarkov-dev，MIT，Copyright (c) 2019 Oskar Risberg）
// 的 markerIsOnLayer / markerIsOnActiveLayer。许可证全文见 THIRD_PARTY_NOTICES.md。
// 楼层判断，规则与 tarkov.dev 一致：
// 每个楼层有若干 extent（高度区间 + 可选的平面范围，如某栋建筑），
// 标记的高度（top/bottom，没有则用 position.y）落在区间内、且位于范围内，就算在该楼层上。
import { getBounds, pos } from './crs'

// 返回 'full' | 'partial' | false
export function markerOnExtents(m, extents) {
  if (!m.position || !extents) return false
  const top = m.top ?? m.position.y
  const bottom = m.bottom ?? m.position.y
  for (const extent of extents) {
    if (top >= extent.height[0] && bottom < extent.height[1]) {
      const type = bottom >= extent.height[0] && top <= extent.height[1] ? 'full' : 'partial'
      if (!extent.bounds) return type
      for (const b of extent.bounds) {
        if (getBounds(b).contains(pos(m.position))) return type
      }
    }
  }
  return false
}

export function baseExtents(meta) {
  return [{ height: meta.heightRange ?? [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] }]
}

// activeIndex：当前楼层在 meta.layers 中的下标，null 表示地面
export function isOnActiveLevel(m, meta, activeIndex) {
  if (!m.position) return true
  const layers = meta.layers ?? []
  // 完全处于某个未激活、且限定了范围的楼层（例如某栋楼的二层）→ 不在当前层
  for (let i = 0; i < layers.length; i++) {
    if (i === activeIndex) continue
    const extents = layers[i].extents ?? []
    if (extents.some((e) => e.bounds) && markerOnExtents(m, extents) === 'full') return false
  }
  if (activeIndex != null) return Boolean(markerOnExtents(m, layers[activeIndex]?.extents))
  return Boolean(markerOnExtents(m, baseExtents(meta)))
}

// 找出标记所在的楼层下标（点击变暗的标记时自动切层用）
export function levelOf(m, meta) {
  const layers = meta.layers ?? []
  for (let i = 0; i < layers.length; i++) {
    if (markerOnExtents(m, layers[i].extents)) return i
  }
  return null
}
