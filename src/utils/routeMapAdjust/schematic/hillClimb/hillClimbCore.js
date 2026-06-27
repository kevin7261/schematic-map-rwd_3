/* eslint-disable no-console */

/**
 * Stott et al. (2011) "Automatic Metro Map Layout Using Multicriteria Optimization"
 * (IEEE TVCG 17(1)) 之忠實實作（worker-safe，不依賴 dataStore）。
 *
 * 本檔輸出 hill-climbing 演算法**自己**的座標（不接 MILP）。流程對應論文：
 *   §3.1 + Algorithm 1：逐站於「以站為中心的矩形周框（距離 R）」試移到最降成本處（§3.1 原文
 *       "test the points around a rectangle centered on the station at a given distance"），
 *       每個外圈 pass 以 cooling 縮小 R（Table 4：Iterations=5、Max Station Movement=8）。
 *   §3.2：5 準則加權和 m_N（objective.js，eq.1–6），權重用 Table 4（STOTT_WEIGHTS）。
 *   §3.3：四條移動硬約束 — Bounding Area / Relative Position（象限）/ Occlusions（不疊不交）/ Edge Ordering（環序）。
 *   §4：群集移動以跳脫局部最佳 — 4.1 過長邊群集、4.2 非直線（共線）群集、4.3 沿過長邊二分。
 *       群集整體平移、維持內部相對位置，規則與單站相同。
 *   §3.5/§3.6 標籤準則不在本佈局比較範圍（未實作）。
 *
 * 理想邊長 = l·g（Table 4：l=4、g=grid spacing）。本系統座標已正規化為整數格（g=1），故 desiredLen=l=4。
 */

import {
  computeRotationSystem,
  buildSameRouteEdgePairsAtNodes,
} from '../graph.js';
import { schematicCost } from '../objective.js';
import { segOverlap } from '../repair.js';
import { segmentIntersectionInterior2D } from '@/utils/routeSegmentIntersections.js';

const STOTT_PREF_MULTIPLE = 4; // Table 4：Pref. grid spacing l
const STOTT_MIN_CLUSTER_DIST = 3; // Table 4：Min. Cluster Distance

function crossingsAtNode(graph, coords, n) {
  const { edges, incident } = graph;
  let cnt = 0;
  for (const eid of incident[n]) {
    const a = edges[eid];
    const ax1 = coords[a.u][0], ay1 = coords[a.u][1], ax2 = coords[a.v][0], ay2 = coords[a.v][1];
    for (let j = 0; j < edges.length; j++) {
      const b = edges[j];
      if (b.id === a.id) continue;
      if (a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v) continue;
      if (segmentIntersectionInterior2D(ax1, ay1, ax2, ay2, coords[b.u][0], coords[b.u][1], coords[b.v][0], coords[b.v][1])) cnt++;
    }
  }
  return cnt;
}

/**
 * §3.3 Occlusion Rule（疊線版）：n 之入射邊與其他任一邊「共線重疊」的數量。
 * segmentIntersectionInterior2D 只抓「真交叉」、抓不到共線重疊（同走廊疊在一起）→ 補此檢查，
 * 確保 hill-climbing 不會製造路線重疊（= 不改變拓撲結構）。含相鄰邊（兩入射邊折回同向亦為疊線）。
 */
function overlapAtNode(graph, coords, n) {
  const { edges, incident } = graph;
  let cnt = 0;
  for (const eid of incident[n]) {
    const a = edges[eid];
    const A = coords[a.u], B = coords[a.v];
    for (let j = 0; j < edges.length; j++) {
      if (j === eid) continue;
      const b = edges[j];
      if (segOverlap(A, B, coords[b.u], coords[b.v]) > 1e-6) cnt++;
    }
  }
  return cnt;
}

/** §3.3 Occlusion Rule（論文原文）：站不可移到「壓在他線(非其入射邊)內部」。 */
function nodeOnForeignEdge(graph, coords, n) {
  const { edges } = graph;
  const px = coords[n][0], py = coords[n][1];
  for (const e of edges) {
    if (e.u === n || e.v === n) continue; // 自身入射邊不算
    const ax = coords[e.u][0], ay = coords[e.u][1], bx = coords[e.v][0], by = coords[e.v][1];
    if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) !== 0) continue; // 不共線
    if (px < Math.min(ax, bx) || px > Math.max(ax, bx) || py < Math.min(ay, by) || py > Math.max(ay, by)) continue;
    if ((px === ax && py === ay) || (px === bx && py === by)) continue; // 在端點不算
    return true;
  }
  return false;
}

function angAt(graph, coords, nodeId, edgeId) {
  const e = graph.edges[edgeId];
  const other = e.u === nodeId ? e.v : e.u;
  return Math.atan2(coords[other][1] - coords[nodeId][1], coords[other][0] - coords[nodeId][0]);
}

function sameCyclicOrder(a, b) {
  if (a.length !== b.length) return false;
  const n = a.length;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  for (let i = 0; i < n; i++) if (a[i] !== b[(start + i) % n]) return false;
  return true;
}

function preservesRotation(graph, rot, coords, movedNodes) {
  const check = new Set();
  for (const mn of movedNodes) {
    check.add(mn);
    for (const eid of graph.incident[mn]) {
      const e = graph.edges[eid];
      check.add(e.u === mn ? e.v : e.u);
    }
  }
  for (const n of check) {
    const inc = graph.incident[n];
    if (inc.length < 3) continue;
    const ordered = inc.slice().sort((ea, eb) => angAt(graph, coords, n, ea) - angAt(graph, coords, n, eb));
    if (!sameCyclicOrder(ordered, rot[n])) return false;
  }
  return true;
}

function occupiedCells(coords, exceptSet) {
  const occ = new Set();
  for (let i = 0; i < coords.length; i++) {
    if (exceptSet.has(i)) continue;
    occ.add(`${coords[i][0]},${coords[i][1]}`);
  }
  return occ;
}

/** §3.3 Relative Position Rule：節點只能停在相對鄰居的同一象限。 */
function relativePositionOk(graph, coords, init, n, nx, ny, movedSet) {
  for (const eid of graph.incident[n]) {
    const e = graph.edges[eid];
    const m = e.u === n ? e.v : e.u;
    if (movedSet && movedSet.has(m)) continue; // 群集內部相對位置本就維持
    const sx0 = Math.sign(init[n][0] - init[m][0]);
    const sy0 = Math.sign(init[n][1] - init[m][1]);
    const sx = Math.sign(nx - coords[m][0]);
    const sy = Math.sign(ny - coords[m][1]);
    if (sx0 !== 0 && sx !== 0 && sx !== sx0) return false;
    if (sy0 !== 0 && sy !== 0 && sy !== sy0) return false;
  }
  return true;
}

/** 矩形周框（Chebyshev 距離 = R 的環）。 */
function ringOffsets(R) {
  const out = [];
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== R) continue;
      out.push([dx, dy]);
    }
  }
  return out;
}

function edgeLen(coords, e) {
  return Math.hypot(coords[e.v][0] - coords[e.u][0], coords[e.v][1] - coords[e.u][1]);
}

// ── 並查集（群集用）─────────────────────────────────────────────
function makeDSU(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  const union = (a, b) => { p[find(a)] = find(b); };
  return { find, union };
}

/** §4.1 過長邊群集：以「非過長邊」連通之站群（移動整群可縮短連接它們的過長邊）。 */
function clustersOverlength(graph, coords, ideal) {
  const dsu = makeDSU(graph.nodes.length);
  for (const e of graph.edges) if (edgeLen(coords, e) <= ideal) dsu.union(e.u, e.v);
  const groups = new Map();
  for (let i = 0; i < graph.nodes.length; i++) {
    const r = dsu.find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

/** §4.2 非直線群集：度≤2 連續路徑中之「最大共線連續段」。 */
function clustersNonstraight(graph, coords) {
  const deg = graph.nodes.map((_, i) => graph.incident[i].length);
  const usedEdge = new Set();
  const paths = [];
  // 由 junction / 端點出發，沿度=2 節點走出路徑。
  for (let s = 0; s < graph.nodes.length; s++) {
    if (deg[s] === 2) continue;
    for (const eid of graph.incident[s]) {
      if (usedEdge.has(eid)) continue;
      const seq = [s];
      let cur = s, ce = eid;
      for (;;) {
        usedEdge.add(ce);
        const e = graph.edges[ce];
        const nxt = e.u === cur ? e.v : e.u;
        seq.push(nxt);
        if (deg[nxt] !== 2) break;
        const ne = graph.incident[nxt].find((x) => x !== ce && !usedEdge.has(x));
        if (ne == null) break;
        cur = nxt; ce = ne;
      }
      if (seq.length >= 2) paths.push(seq);
    }
  }
  // 每條路徑取最大共線連續段。
  const clusters = [];
  for (const seq of paths) {
    let run = [seq[0]];
    for (let i = 1; i < seq.length; i++) {
      if (run.length >= 2) {
        const a = run[run.length - 2], b = run[run.length - 1], c = seq[i];
        const cross = (coords[b][0] - coords[a][0]) * (coords[c][1] - coords[a][1])
          - (coords[b][1] - coords[a][1]) * (coords[c][0] - coords[a][0]);
        if (Math.abs(cross) > 1e-6) { if (run.length >= 2) clusters.push(run); run = [b]; }
      }
      run.push(seq[i]);
    }
    if (run.length >= 2) clusters.push(run);
  }
  return clusters;
}

/**
 * §4.3 沿過長邊二分。論文用平面對偶圖找切割；此處以「移除過長邊後之連通元件、再依質心二分」
 * 忠實近似其目標（沿過長邊把圖切成兩部分一起移動）。⚠️ 非完整對偶圖法（已於論文中標註此簡化）。
 */
function clustersPartition(graph, coords, ideal) {
  const dsu = makeDSU(graph.nodes.length);
  for (const e of graph.edges) if (edgeLen(coords, e) <= ideal) dsu.union(e.u, e.v);
  const comps = new Map();
  for (let i = 0; i < graph.nodes.length; i++) {
    const r = dsu.find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(i);
  }
  const list = [...comps.values()];
  if (list.length < 2) return [];
  // 依元件質心 x 排序、累積分成兩半。
  list.sort((a, b) => {
    const cx = (g) => g.reduce((s, i) => s + coords[i][0], 0) / g.length;
    return cx(a) - cx(b);
  });
  const total = graph.nodes.length;
  const P1 = [];
  const P2 = [];
  let acc = 0;
  for (const g of list) { (acc < total / 2 ? P1 : P2).push(...g); acc += g.length; }
  return [P1, P2].filter((g) => g.length >= 2 && g.length < total);
}

/** 純核心：Stott et al. Hill Climbing（含冷卻 + §4 群集）。 */
export function runHillClimb(graph, coords0, opts = {}) {
  const maxMove = opts.maxMove ?? 8; // Table 4：Max Station Movement
  const cooling = opts.cooling ?? 0.7;
  const maxTrials = opts.maxTrials ?? 4_000_000;
  const prefLen = opts.prefLen ?? STOTT_PREF_MULTIPLE; // 理想邊長 l·g（g=1）
  const coords = coords0.map((c) => c.slice());
  const init = coords0.map((c) => c.slice());
  const rot = computeRotationSystem(graph);
  const routePairs = buildSameRouteEdgePairsAtNodes(graph);
  const params = { desiredLen: prefLen, weights: opts.weights ?? undefined }; // 預設用 objective.js 之 STOTT_WEIGHTS（Table 4）

  let cost = schematicCost(graph, coords, routePairs, params);
  const costBefore = cost;
  let moves = 0, trials = 0, passes = 0;

  // 單站移動：於距離 R 之矩形周框試移（§3.1）。
  const tryStation = (n, R) => {
    const [ox, oy] = coords[n];
    const occ = occupiedCells(coords, new Set([n]));
    const beforeCross = crossingsAtNode(graph, coords, n);
    const beforeOverlap = overlapAtNode(graph, coords, n);
    let best = null, bestCost = cost;
    for (const [dx, dy] of ringOffsets(R)) {
      if (trials >= maxTrials) break;
      trials++;
      const nx = ox + dx, ny = oy + dy;
      if (nx < 0 || ny < 0) continue; // Bounding Area
      if (occ.has(`${nx},${ny}`)) continue; // Occlusion（不重合）
      if (!relativePositionOk(graph, coords, init, n, nx, ny, null)) continue; // Relative Position
      coords[n] = [nx, ny];
      const c = schematicCost(graph, coords, routePairs, params);
      if (c < bestCost - 1e-9 && preservesRotation(graph, rot, coords, [n]) && crossingsAtNode(graph, coords, n) <= beforeCross && overlapAtNode(graph, coords, n) <= beforeOverlap && !nodeOnForeignEdge(graph, coords, n)) {
        bestCost = c; best = [nx, ny];
      }
      coords[n] = [ox, oy];
    }
    if (best) { coords[n] = best; cost = bestCost; moves++; return true; }
    return false;
  };

  // 群集移動：整群平移於距離 R 之周框（§4）。維持內部相對位置（整群同位移）。
  const tryCluster = (members, R) => {
    const set = new Set(members);
    const before = coords.map((c) => c.slice());
    const occ = occupiedCells(coords, set);
    let beforeCross = 0;
    let beforeOverlap = 0;
    for (const m of members) { beforeCross += crossingsAtNode(graph, coords, m); beforeOverlap += overlapAtNode(graph, coords, m); }
    let best = null, bestCost = cost;
    for (const [dx, dy] of ringOffsets(R)) {
      if (trials >= maxTrials) break;
      trials++;
      let ok = true;
      for (const m of members) {
        const nx = before[m][0] + dx, ny = before[m][1] + dy;
        if (nx < 0 || ny < 0) { ok = false; break; }
        if (occ.has(`${nx},${ny}`)) { ok = false; break; }
      }
      if (!ok) continue;
      for (const m of members) coords[m] = [before[m][0] + dx, before[m][1] + dy];
      // 邊界硬約束：相對位置（跨界邊）、環序、無新增交叉。
      let valid = true;
      for (const m of members) {
        if (!relativePositionOk(graph, coords, init, m, coords[m][0], coords[m][1], set)) { valid = false; break; }
      }
      if (valid) {
        const c = schematicCost(graph, coords, routePairs, params);
        let afterCross = 0;
        let afterOverlap = 0;
        for (const m of members) { afterCross += crossingsAtNode(graph, coords, m); afterOverlap += overlapAtNode(graph, coords, m); }
        if (c < bestCost - 1e-9 && preservesRotation(graph, rot, coords, members) && afterCross <= beforeCross && afterOverlap <= beforeOverlap
          && members.every((m) => !nodeOnForeignEdge(graph, coords, m))) {
          bestCost = c; best = [dx, dy];
        }
      }
      for (const m of members) coords[m] = before[m].slice();
    }
    if (best) {
      for (const m of members) coords[m] = [before[m][0] + best[0], before[m][1] + best[1]];
      cost = bestCost; moves++; return true;
    }
    return false;
  };

  // 外圈：cooling 縮小 R 至 1，之後於 R=1 續跑至無改善（Iterations≈log_cooling，Mexico City 約 5）。
  for (let R = maxMove; ; R = R > 1 ? Math.max(1, Math.floor(R * cooling)) : 1) {
    if (trials >= maxTrials) break;
    passes++;
    let improved = false;

    // 1) 逐站移動
    for (let n = 0; n < graph.nodes.length; n++) {
      if (trials >= maxTrials) break;
      if (tryStation(n, R)) improved = true;
    }

    // 2) 群集移動（§4.1 + §4.2 + §4.3）
    const clusters = [
      ...clustersOverlength(graph, coords, prefLen),
      ...clustersNonstraight(graph, coords),
      ...clustersPartition(graph, coords, prefLen),
    ];
    for (const cl of clusters) {
      if (trials >= maxTrials) break;
      if (cl.length < 2) continue;
      if (tryCluster(cl, R)) improved = true;
    }

    if (R === 1 && !improved) break;
  }

  // STOTT_MIN_CLUSTER_DIST 目前保留供未來 partition 細化使用。
  void STOTT_MIN_CLUSTER_DIST;

  return { coords, costBefore, costAfter: cost, passes, moves, routePairs, desiredLen: prefLen };
}
