// 移植自 tarkov.dev（https://github.com/the-hideout/tarkov-dev，MIT，Copyright (c) 2019 Oskar Risberg），
// src/pages/map/index.jsx 中的 getCRS / applyRotation / pos / getBounds / getScaledBounds。
// 许可证全文见仓库根目录 THIRD_PARTY_NOTICES.md。
// 游戏坐标 → Leaflet 坐标的换算，与 tarkov.dev 的实现保持一致，
// 这样可以直接复用它的 maps.json（transform / coordinateRotation / bounds）。
import L from 'leaflet'

function applyRotation(latLng, rotation) {
  if (!latLng.lng && !latLng.lat) return L.latLng(0, 0)
  if (!rotation) return latLng
  const a = (rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const { lng: x, lat: y } = latLng
  return L.latLng(x * sin + y * cos, x * cos - y * sin)
}

export function getCRS(meta) {
  const [scaleX, marginX, sY, marginY] = meta.transform ?? [1, 0, 1, 0]
  return L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(scaleX, marginX, sY * -1, marginY),
    projection: L.extend({}, L.Projection.LonLat, {
      project: (latLng) => L.Projection.LonLat.project(applyRotation(latLng, meta.coordinateRotation)),
      unproject: (point) =>
        applyRotation(L.Projection.LonLat.unproject(point), (meta.coordinateRotation ?? 0) * -1)
    })
  })
}

// 游戏内 position {x, y, z} → Leaflet [lat, lng]
export const pos = (p) => [p.z, p.x]

export function getBounds(b) {
  return b ? L.latLngBounds([b[0][1], b[0][0]], [b[1][1], b[1][0]]) : undefined
}

export function getScaledBounds(b, factor) {
  const cx = (b[0][0] + b[1][0]) / 2
  const cy = (b[0][1] + b[1][1]) / 2
  const w = (b[1][0] - b[0][0]) * factor
  const h = (b[1][1] - b[0][1]) * factor
  return [
    [cy - h / 2, cx - w / 2],
    [cy + h / 2, cx + w / 2]
  ]
}
