/* eslint-disable no-console */

/**
 * 硬約束「違規統計」：量化某 connect 佈局的疊線、交叉、座標重合、非八方向邊數，供三圖層
 * 於 dashboard 據實回報「八方向 + 不交叉 + 不重疊 + 不重合」的達成情形。
 *
 * 佈局本身由 milp/runOctilinearLayout.js 之精確引擎產生（硬約束保證全為 0）；此處僅做驗證量測。
 */

import { segmentIntersectionInterior2D } from '@/utils/routeSegmentIntersections.js';

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

/** 兩線段共線重疊長度（>0 表疊線）；僅端點接觸回 0。 */
export function segOverlap(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  if (Math.abs(cross(rx, ry, sx, sy)) > 1e-9) return 0; // 不平行
  if (Math.abs(cross(rx, ry, c[0] - a[0], c[1] - a[1])) > 1e-9) return 0; // 不共線
  const L = Math.hypot(rx, ry);
  if (L < 1e-9) return 0;
  const ux = rx / L, uy = ry / L;
  const tb = (b[0] - a[0]) * ux + (b[1] - a[1]) * uy;
  const tc = (c[0] - a[0]) * ux + (c[1] - a[1]) * uy;
  const td = (d[0] - a[0]) * ux + (d[1] - a[1]) * uy;
  const lo = Math.max(Math.min(0, tb), Math.min(tc, td));
  const hi = Math.min(Math.max(0, tb), Math.max(tc, td));
  return Math.max(0, hi - lo);
}

function isOcti(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

import { countNodesOnForeignEdge } from './enforceNoNodeOnForeignEdge.js';

/** 全域違規統計（回報用）。 */
export function countViolations(graph, coords) {
  const { edges } = graph;
  let overlaps = 0, crossings = 0, clashes = 0, nonocti = 0;
  const seen = new Map();
  for (let i = 0; i < coords.length; i++) {
    const k = `${coords[i][0]},${coords[i][1]}`;
    if (seen.has(k)) clashes++; else seen.set(k, i);
  }
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    if (a.isLink) continue;
    const A = coords[a.u], B = coords[a.v];
    if (!isOcti(A, B)) nonocti++;
    for (let j = i + 1; j < edges.length; j++) {
      const b = edges[j];
      if (b.isLink) continue;
      const adj = a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v;
      const C = coords[b.u], D = coords[b.v];
      if (!adj && segmentIntersectionInterior2D(A[0], A[1], B[0], B[1], C[0], C[1], D[0], D[1])) crossings++;
      if (segOverlap(A, B, C, D) > 1e-6) overlaps++;
    }
  }
  const onForeignEdge = countNodesOnForeignEdge(graph, coords);
  return { overlaps, crossings, clashes, nonocti, onForeignEdge };
}
