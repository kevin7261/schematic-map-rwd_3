/**
 * Stott & Rodgers (2011) 多準則目標＋共用統計/幾何檢查。
 * 在「圖節點座標」上計算（connect 骨架）；Hill Climbing 直接最小化此加權和。
 * 方向模型由 params.directions 決定：8=octilinear(Stott 原文)、4=rectilinear。
 *
 * 5 準則：Angular Resolution / Edge Length / Balanced Edge Length / Line Straightness / (Oct/Recti)linearity。
 */

import { segmentIntersectionInterior2D } from '@/utils/routeSegmentIntersections.js';

const PI = Math.PI;
const TWO_PI = Math.PI * 2;

/** Stott & Rodgers (2011) Table 4 權重（Mexico City）：c_N1..c_N5。 */
export const STOTT_WEIGHTS = Object.freeze({
  N1: 30000, // angular resolution
  N2: 50, // edge length
  N3: 45, // balanced edge length
  N4: 220, // line straightness
  N5: 9250, // octilinearity
});

function edgeVecAtNode(nodes, edges, coords, nodeId, edgeId) {
  const e = edges[edgeId];
  const other = e.u === nodeId ? e.v : e.u;
  return [coords[other][0] - coords[nodeId][0], coords[other][1] - coords[nodeId][1]];
}

function angleOf(v) {
  return Math.atan2(v[1], v[0]);
}

/** 兩向量夾角(0..π) */
function angleBetween(a, b) {
  let d = Math.abs(angleOf(a) - angleOf(b));
  if (d > PI) d = TWO_PI - d;
  return d;
}

/** 邊與最近允許方向之夾角；nDir=8→最近 45°、nDir=4→最近 90°。 */
function dirDeviation(v, nDir) {
  const a = Math.atan2(v[1], v[0]);
  const step = TWO_PI / nDir;
  const nearest = Math.round(a / step) * step;
  let d = Math.abs(a - nearest);
  if (d > PI) d = TWO_PI - d;
  return d;
}

function edgeLength(coords, e) {
  const dx = coords[e.v][0] - coords[e.u][0];
  const dy = coords[e.v][1] - coords[e.u][1];
  return Math.hypot(dx, dy);
}

/**
 * Stott & Rodgers (2011) 5 準則加權和 m_N = Σ w_Ni·c_Ni（eq 1–6）。越低越好。
 * @param {object} graph
 * @param {Array<[number,number]>} coords
 * @param {Array<{node:number,e1:number,e2:number}>} routePairs 同線相鄰邊對
 * @param {{ desiredLen:number, weights?:object }} params desiredLen = 偏好邊長 l·g
 */
export function schematicCost(graph, coords, routePairs, params) {
  const { nodes, edges, incident } = graph;
  const W = { ...STOTT_WEIGHTS, ...(params.weights || {}) };
  const l = params.desiredLen || 1;

  // c_N1 angular resolution；c_N3 balanced edge length（僅 deg=2）
  let c1 = 0;
  let c3 = 0;
  for (let n = 0; n < nodes.length; n++) {
    const inc = incident[n];
    if (inc.length > 1) {
      const angs = inc.map((eid) => angleOf(edgeVecAtNode(nodes, edges, coords, n, eid))).sort((a, b) => a - b);
      const ideal = TWO_PI / inc.length;
      for (let i = 0; i < angs.length; i++) {
        const gap = i === 0 ? angs[0] - angs[angs.length - 1] + TWO_PI : angs[i] - angs[i - 1];
        c1 += Math.abs(ideal - gap);
      }
    }
    if (inc.length === 2) {
      c3 += Math.abs(edgeLength(coords, edges[inc[0]]) - edgeLength(coords, edges[inc[1]]));
    }
  }

  // c_N2 edge length；c_N5 octilinearity = Σ|sin(4·α)|（eq 5）
  let c2 = 0;
  let c5 = 0;
  for (const e of edges) {
    const dx = coords[e.v][0] - coords[e.u][0];
    const dy = coords[e.v][1] - coords[e.u][1];
    c2 += Math.abs(Math.hypot(dx, dy) / l - 1);
    const a = Math.atan2(Math.abs(dy), Math.abs(dx));
    c5 += Math.abs(Math.sin(4 * a));
  }

  // c_N4 line straightness = Σ 彎折偏離（直線穿過=0）
  let c4 = 0;
  for (const pr of routePairs) {
    const a = edgeVecAtNode(nodes, edges, coords, pr.node, pr.e1);
    const b = edgeVecAtNode(nodes, edges, coords, pr.node, pr.e2);
    c4 += PI - angleBetween(a, b);
  }

  return W.N1 * c1 + W.N2 * c2 + W.N3 * c3 + W.N4 * c4 + W.N5 * c5;
}

/** 佈局是否非法：有線段內部交叉（共端點之邊略過）。零長邊亦視為非法。 */
export function graphLayoutInvalid(graph, coords) {
  const { edges } = graph;
  for (const e of edges) {
    if (coords[e.u][0] === coords[e.v][0] && coords[e.u][1] === coords[e.v][1]) return true;
  }
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v) continue;
      const ax1 = coords[a.u][0];
      const ay1 = coords[a.u][1];
      const ax2 = coords[a.v][0];
      const ay2 = coords[a.v][1];
      const bx1 = coords[b.u][0];
      const by1 = coords[b.u][1];
      const bx2 = coords[b.v][0];
      const by2 = coords[b.v][1];
      if (segmentIntersectionInterior2D(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) return true;
    }
  }
  return false;
}

/**
 * 找「connect 節點落在非其入射邊（他路線）之開放內部」（= 路線壓過不屬該線之紅/藍點）。
 * 回傳 [入射邊id, 該他線邊id] 配對，供 H4 分離把該節點推離那條線。
 */
export function findNodeOnForeignEdgePairs(graph, coords, limit = 400) {
  const { edges, nodes, incident } = graph;
  const pairs = [];
  for (let n = 0; n < nodes.length; n++) {
    const px = coords[n][0], py = coords[n][1];
    const inc = incident[n];
    if (!inc.length) continue;
    for (const e of edges) {
      if (e.isLink) continue;
      if (e.u === n || e.v === n) continue; // 自身入射邊
      const ax = coords[e.u][0], ay = coords[e.u][1], bx = coords[e.v][0], by = coords[e.v][1];
      if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) !== 0) continue; // 不共線
      if (px < Math.min(ax, bx) || px > Math.max(ax, bx) || py < Math.min(ay, by) || py > Math.max(ay, by)) continue;
      if ((px === ax && py === ay) || (px === bx && py === by)) continue; // 在端點不算
      // 選一條「與 e 不相鄰」（不共端點）之入射邊來分離：分離約束會把該入射邊全體（含 n）推到 e 一側，
      // 從而把 n 推離 e。若挑到與 e 共端點的入射邊（如 inc[0] 恰好共享 e 的端點），分離器視為相鄰而拒絕，
      // 該重疊就永遠修不掉（H4 不收斂 → 輸出殘留交叉/重疊）。故優先挑非相鄰者，退而求其次才用 inc[0]。
      let incE = -1;
      for (const ie of inc) {
        const ed = edges[ie];
        if (ed.u === e.u || ed.u === e.v || ed.v === e.u || ed.v === e.v) continue; // 與 e 相鄰 → 不可分離
        incE = ie;
        break;
      }
      pairs.push([incE === -1 ? inc[0] : incE, e.id]);
      if (pairs.length >= limit) return pairs;
      break; // 此節點已找到一條壓過之線，加一組分離即可
    }
  }
  return pairs;
}

/** 找出目前佈局中「非相鄰邊」彼此交叉的邊對（供 MILP 惰性 H4 約束）。回傳 [edgeId,edgeId][]。 */
export function findCrossingPairs(graph, coords, limit = 400) {
  const { edges } = graph;
  const pairs = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v) continue;
      if (
        segmentIntersectionInterior2D(
          coords[a.u][0], coords[a.u][1], coords[a.v][0], coords[a.v][1],
          coords[b.u][0], coords[b.u][1], coords[b.v][0], coords[b.v][1]
        )
      ) {
        pairs.push([a.id, b.id]);
        if (pairs.length >= limit) return pairs;
      }
    }
  }
  return pairs;
}

/** 比較用描述統計（在渲染後 flat segments 上算）。nDir=8 octilinear、4 rectilinear。 */
export function schematicStats(segments, nDir = 8) {
  let totalEdges = 0;
  let offAxisEdges = 0;
  let totalLength = 0;
  const tol = 1e-6;
  for (const seg of segments) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = Array.isArray(pts[i]) ? [Number(pts[i][0]), Number(pts[i][1])] : [pts[i].x, pts[i].y];
      const [x2, y2] = Array.isArray(pts[i + 1]) ? [Number(pts[i + 1][0]), Number(pts[i + 1][1])] : [pts[i + 1].x, pts[i + 1].y];
      totalEdges++;
      totalLength += Math.hypot(x2 - x1, y2 - y1);
      if (dirDeviation([x2 - x1, y2 - y1], nDir) > tol) offAxisEdges++;
    }
  }
  return {
    totalEdges,
    offAxisEdges,
    onAxisEdges: totalEdges - offAxisEdges,
    totalLength: Math.round(totalLength * 1000) / 1000,
  };
}

/** connect 骨架層級的彎折統計（line straightness 比較指標）。 */
export function skeletonBendStats(graph, coords, routePairs, nDir = 8) {
  const tol = 1e-6;
  let routeBends = 0;
  for (const pr of routePairs) {
    const a = edgeVecAtNode(graph.nodes, graph.edges, coords, pr.node, pr.e1);
    const b = edgeVecAtNode(graph.nodes, graph.edges, coords, pr.node, pr.e2);
    if (Math.abs(PI - angleBetween(a, b)) > 0.2) routeBends++; // 非直線穿過
  }
  let offAxis = 0;
  for (const e of graph.edges) {
    const v = [coords[e.v][0] - coords[e.u][0], coords[e.v][1] - coords[e.u][1]];
    if (dirDeviation(v, nDir) > tol) offAxis++;
  }
  return { routeBends, skeletonOffAxisEdges: offAxis, skeletonEdges: graph.edges.length };
}
