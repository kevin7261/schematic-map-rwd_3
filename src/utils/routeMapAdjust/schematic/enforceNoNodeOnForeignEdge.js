/**
 * 硬約束：connect／terminal 端點（含藍點）不可落在「非其入射邊」之路線內部。
 * 供站點與路線調整 ①–⑧ 佈局後修復；Hill Climbing 移動時亦用同一判定。
 */

import { graphLayoutInvalid } from './objective.js';

/** 節點 n 是否壓在任一他線（非入射、非 link）之開放內部。 */
export function isNodeOnForeignEdge(graph, coords, n) {
  const { edges } = graph;
  const px = coords[n][0];
  const py = coords[n][1];
  for (const e of edges) {
    if (e.isLink) continue;
    if (e.u === n || e.v === n) continue;
    const ax = coords[e.u][0];
    const ay = coords[e.u][1];
    const bx = coords[e.v][0];
    const by = coords[e.v][1];
    if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) !== 0) continue;
    if (px < Math.min(ax, bx) || px > Math.max(ax, bx) || py < Math.min(ay, by) || py > Math.max(ay, by)) {
      continue;
    }
    if ((px === ax && py === ay) || (px === bx && py === by)) continue;
    return true;
  }
  return false;
}

/** @returns {number} */
export function countNodesOnForeignEdge(graph, coords) {
  let n = 0;
  for (let i = 0; i < graph.nodes.length; i++) {
    if (isNodeOnForeignEdge(graph, coords, i)) n++;
  }
  return n;
}

function manhattanDeltas(maxR) {
  const out = [[0, 0]];
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) + Math.abs(dy) === r) out.push([dx, dy]);
      }
    }
  }
  return out;
}

/**
 * 最小位移把壓線端點推離他線內部；整圖節點座標一併更新，不新增交叉。
 * @returns {{ coords: Array<[number,number]>, moves: number, remaining: number }}
 */
export function repairNodesOnForeignEdge(graph, coords, opts = {}) {
  const maxPasses = opts.maxPasses ?? 96;
  const maxDist = opts.maxDist ?? 16;
  const out = coords.map((c) => [c[0], c[1]]);
  const deltas = manhattanDeltas(maxDist);
  let moves = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let n = 0; n < graph.nodes.length; n++) {
      if (!isNodeOnForeignEdge(graph, out, n)) continue;
      const ox = out[n][0];
      const oy = out[n][1];
      let best = null;
      for (const [dx, dy] of deltas) {
        if (dx === 0 && dy === 0) continue;
        const nx = Math.round(ox + dx);
        const ny = Math.round(oy + dy);
        const saved = [out[n][0], out[n][1]];
        out[n] = [nx, ny];
        const ok =
          !isNodeOnForeignEdge(graph, out, n) && !graphLayoutInvalid(graph, out);
        out[n] = saved;
        if (!ok) continue;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (!best || dist < best.dist) best = { nx, ny, dist };
      }
      if (best) {
        out[n] = [best.nx, best.ny];
        moves++;
        improved = true;
      }
    }
    if (!improved) break;
  }

  return { coords: out, moves, remaining: countNodesOnForeignEdge(graph, out) };
}
