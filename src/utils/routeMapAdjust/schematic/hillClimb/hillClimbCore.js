/* eslint-disable no-console */

/**
 * Stott & Rodgers (2011) Hill Climbing 核心（worker-safe：不依賴 dataStore）。
 * 逐站於半徑 R 鄰域試移到最降成本處 + 冷卻；移動硬約束：bounding、相對位置、無交叉、環序。
 * 僅作為精確八方向引擎之「方向偏好」初值（computePreferredDirs 取其方向）。
 */

import {
  computeRotationSystem,
  buildSameRouteEdgePairsAtNodes,
} from '../graph.js';
import { schematicCost } from '../objective.js';
import { segmentIntersectionInterior2D } from '@/utils/routeSegmentIntersections.js';

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

function medianEdgeLength(graph, coords) {
  const lens = graph.edges.map((e) => Math.hypot(coords[e.v][0] - coords[e.u][0], coords[e.v][1] - coords[e.u][1]));
  if (!lens.length) return 2;
  lens.sort((a, b) => a - b);
  return Math.max(2, Math.round(lens[Math.floor(lens.length / 2)]));
}

function preservesRotation(graph, rot, coords, movedNode) {
  const check = new Set([movedNode]);
  for (const eid of graph.incident[movedNode]) {
    const e = graph.edges[eid];
    check.add(e.u === movedNode ? e.v : e.u);
  }
  for (const n of check) {
    const inc = graph.incident[n];
    if (inc.length < 3) continue;
    const ordered = inc.slice().sort((ea, eb) => angAt(graph, coords, n, ea) - angAt(graph, coords, n, eb));
    if (!sameCyclicOrder(ordered, rot[n])) return false;
  }
  return true;
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

function occupiedCells(coords, exceptNode) {
  const occ = new Set();
  for (let i = 0; i < coords.length; i++) {
    if (i === exceptNode) continue;
    occ.add(`${coords[i][0]},${coords[i][1]}`);
  }
  return occ;
}

function relativePositionOk(graph, coords, init, n, nx, ny) {
  for (const eid of graph.incident[n]) {
    const e = graph.edges[eid];
    const m = e.u === n ? e.v : e.u;
    const sx0 = Math.sign(init[n][0] - init[m][0]);
    const sy0 = Math.sign(init[n][1] - init[m][1]);
    const sx = Math.sign(nx - coords[m][0]);
    const sy = Math.sign(ny - coords[m][1]);
    if (sx0 !== 0 && sx !== 0 && sx !== sx0) return false;
    if (sy0 !== 0 && sy !== 0 && sy !== sy0) return false;
  }
  return true;
}

const HILLCLIMB_WEIGHTS = { N1: 10, N2: 5, N3: 3, N4: 80, N5: 200 };

/** 純核心：Stott Hill Climbing（含冷卻）。 */
export function runHillClimb(graph, coords0, opts = {}) {
  const maxMove = opts.maxMove ?? 8;
  const cooling = opts.cooling ?? 0.7;
  const guardMax = opts.guard ?? 6;
  const maxTrials = opts.maxTrials ?? 2_000_000;
  const coords = coords0.map((c) => c.slice());
  const init = coords0.map((c) => c.slice());
  const rot = computeRotationSystem(graph);
  const routePairs = buildSameRouteEdgePairsAtNodes(graph);
  const desiredLen = medianEdgeLength(graph, coords);
  const params = { desiredLen, weights: opts.weights ?? HILLCLIMB_WEIGHTS };

  let cost = schematicCost(graph, coords, routePairs, params);
  const costBefore = cost;
  let moves = 0;
  let trials = 0;
  let passes = 0;

  for (let R = maxMove; R >= 1 && trials < maxTrials; R = R === 1 ? 0 : Math.max(1, Math.floor(R * cooling))) {
    let improvedAtR = true;
    let guard = 0;
    while (improvedAtR && guard < guardMax && trials < maxTrials) {
      improvedAtR = false;
      guard++;
      passes++;
      for (let n = 0; n < graph.nodes.length; n++) {
        if (trials >= maxTrials) break;
        const [ox, oy] = coords[n];
        const occ = occupiedCells(coords, n);
        const beforeCross = crossingsAtNode(graph, coords, n);
        let best = null;
        let bestCost = cost;
        for (let dx = -R; dx <= R; dx++) {
          for (let dy = -R; dy <= R; dy++) {
            if (dx === 0 && dy === 0) continue;
            trials++;
            const nx = ox + dx;
            const ny = oy + dy;
            if (nx < 0 || ny < 0) continue;
            if (occ.has(`${nx},${ny}`)) continue;
            if (!relativePositionOk(graph, coords, init, n, nx, ny)) continue;
            coords[n] = [nx, ny];
            const c = schematicCost(graph, coords, routePairs, params);
            if (c < bestCost - 1e-9) {
              if (preservesRotation(graph, rot, coords, n) && crossingsAtNode(graph, coords, n) <= beforeCross) {
                bestCost = c;
                best = [nx, ny];
              }
            }
            coords[n] = [ox, oy];
          }
        }
        if (best) { coords[n] = best; cost = bestCost; moves++; improvedAtR = true; }
      }
    }
    if (R === 1) break;
  }
  return { coords, costBefore, costAfter: cost, passes, moves, routePairs, desiredLen };
}
