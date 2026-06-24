import {
  orthoFlatSegmentsEdgePairGeometryInvalid,
  shallowCloneOrthoSegmentsSynced,
  syncOrthoFlatSegmentEndpoints,
} from './axisAlignGridNetworkHillClimb.js';
import { orthoFlatSegmentsOverlapsForeignConnectDisplay } from './replaceDiagonalEdgesWithLOrtho.js';
import { listOrthogonalLShapesInFlatSegments } from './listOrthogonalLShapesInFlatSegments.js';

function num(v) {
  return Math.round(Number(v ?? 0));
}

function getXY(pt) {
  if (Array.isArray(pt)) return [num(pt[0]), num(pt[1])];
  return [num(pt?.x), num(pt?.y)];
}

function setXY(pt, x, y) {
  const rx = num(x);
  const ry = num(y);
  if (Array.isArray(pt)) {
    pt[0] = rx;
    pt[1] = ry;
    return;
  }
  if (pt && typeof pt === 'object') {
    pt.x = rx;
    pt.y = ry;
    const tags = pt.tags && typeof pt.tags === 'object' ? pt.tags : {};
    pt.tags = { ...tags, x_grid: rx, y_grid: ry };
  }
}

/** 同步頂點格座標與 node 標籤／紅藍 connect 繪製格 */
function setVertexGrid(seg, pi, x, y) {
  const pts = seg?.points;
  if (!Array.isArray(pts) || pi < 0 || pi >= pts.length) return;
  setXY(pts[pi], x, y);
  const nodes = seg?.nodes;
  if (!Array.isArray(nodes) || !nodes[pi] || typeof nodes[pi] !== 'object') return;
  const n = nodes[pi];
  const nx = num(x);
  const ny = num(y);
  const tg = n.tags && typeof n.tags === 'object' ? n.tags : {};
  n.tags = { ...tg, x_grid: nx, y_grid: ny };
  const isConnect =
    n.node_type === 'connect' ||
    n.tags?.node_type === 'connect' ||
    n.connect_number != null ||
    n.tags?.connect_number != null;
  if (
    isConnect ||
    (n.display_x != null && Number.isFinite(Number(n.display_x))) ||
    (n.display_y != null && Number.isFinite(Number(n.display_y)))
  ) {
    n.display_x = nx;
    n.display_y = ny;
  }
}

function pointKey(x, y) {
  return `${num(x)},${num(y)}`;
}

function parseKey(k) {
  return String(k).split(',').map(Number);
}

function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** 網格上一步方向，若非軸向則 null */
function unitStep(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > 0 && ay > 0) return null;
  return [dx === 0 ? 0 : Math.sign(dx), dy === 0 ? 0 : Math.sign(dy)];
}

function collinear(aKey, bKey, cKey) {
  const [ax, ay] = parseKey(aKey);
  const [bx, by] = parseKey(bKey);
  const [cx, cy] = parseKey(cKey);
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) === 0;
}

function directionLength(aKey, bKey) {
  const [ax, ay] = parseKey(aKey);
  const [bx, by] = parseKey(bKey);
  return manhattan(ax, ay, bx, by);
}

function buildFullAdjacency(segments) {
  const adj = new Map();
  const add = (a, b) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const seg of segments || []) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = getXY(pts[i]);
      const [x1, y1] = getXY(pts[i + 1]);
      add(pointKey(x0, y0), pointKey(x1, y1));
    }
  }
  return adj;
}

function continuationLengthAtEndpoint(adj, endpointKey, incidentKey) {
  const neigh = adj.get(endpointKey);
  if (!neigh) return 0;
  let best = 0;
  for (const nb of neigh) {
    if (nb === incidentKey) continue;
    if (!collinear(incidentKey, endpointKey, nb)) continue;
    best = Math.max(best, directionLength(endpointKey, nb));
  }
  return best;
}

function continuationGain(adjBefore, aKey, cKey, bKey, dKey) {
  const before =
    continuationLengthAtEndpoint(adjBefore, aKey, cKey) +
    continuationLengthAtEndpoint(adjBefore, bKey, cKey);
  const after =
    continuationLengthAtEndpoint(adjBefore, aKey, dKey) +
    continuationLengthAtEndpoint(adjBefore, bKey, dKey);
  return { before, after, gain: after - before };
}

/** 本次 L flip 涉及的路段索引（單折線為 segIndex；跨路段 graph 為 orthoSpecs 內之 si）。 */
function flipInvolvedSegmentIndices(L) {
  const s = new Set();
  if (L?.kind === 'graph' && Array.isArray(L.orthoSpecs)) {
    for (const spec of L.orthoSpecs) {
      if (spec && spec[0] === 'ortho' && Number.isFinite(Number(spec[1]))) s.add(Number(spec[1]));
    }
    return s;
  }
  const si = Number(L?.segIndex);
  if (Number.isFinite(si)) s.add(si);
  return s;
}

function candidateEndpointsForL(L, segments) {
  if (L?.kind === 'graph') {
    const c = L.cornerKey;
    const hKeys = Array.isArray(L.armHEdgeKeys) ? L.armHEdgeKeys : [];
    const vKeys = Array.isArray(L.armVEdgeKeys) ? L.armVEdgeKeys : [];
    const endOf = (keys) => {
      if (!keys.length) return null;
      const parts = keys[keys.length - 1].split('|');
      return parts[0] === c ? parts[1] : parts[1] === c ? parts[0] : parts.find((p) => p !== c);
    };
    const a = endOf(hKeys);
    const b = endOf(vKeys);
    if (!a || !b || !c) return null;
    return { cornerKey: c, aKey: a, bKey: b, hKeys, vKeys, graph: true };
  }
  const si = Number(L?.segIndex);
  const lo = Number(L?.lowIdx);
  const hi = Number(L?.highIdx);
  const ci = Number(L?.cornerIdx);
  const pts = segments?.[si]?.points;
  if (!Array.isArray(pts) || !Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(ci)) {
    return null;
  }
  const [cx, cy] = getXY(pts[ci]);
  const [ax, ay] = getXY(pts[lo]);
  const [bx, by] = getXY(pts[hi]);
  return {
    cornerKey: pointKey(cx, cy),
    aKey: pointKey(ax, ay),
    bKey: pointKey(bx, by),
    si,
    lo,
    hi,
    ci,
    graph: false,
  };
}

function oppositeCorner(aKey, cKey, bKey) {
  const [ax, ay] = parseKey(aKey);
  const [cx, cy] = parseKey(cKey);
  const [bx, by] = parseKey(bKey);
  if (ax === cx && by === cy) return pointKey(bx, ay);
  if (ay === cy && bx === cx) return pointKey(ax, by);
  return null;
}

function sampleIncreasingIndices(start, end, count) {
  if (count <= 0) return [];
  if (count === 1) return [start];
  if (end - start + 1 < count) return null;
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round(start + ((end - start) * i) / (count - 1));
    if (out.length && idx <= out[out.length - 1]) return null;
    out.push(idx);
  }
  return out;
}

function gridPathKeys(aKey, dKey, bKey) {
  const [ax, ay] = parseKey(aKey);
  const [dx, dy] = parseKey(dKey);
  const [bx, by] = parseKey(bKey);
  const uAD = unitStep(dx - ax, dy - ay);
  const uDB = unitStep(bx - dx, by - dy);
  if (!uAD || !uDB) return null;
  const lenAD = manhattan(ax, ay, dx, dy);
  const lenDB = manhattan(dx, dy, bx, by);
  if (lenAD <= 0 || lenDB <= 0) return null;
  const keys = [];
  for (let step = 0; step <= lenAD; step++) {
    keys.push(pointKey(ax + uAD[0] * step, ay + uAD[1] * step));
  }
  for (let step = 1; step <= lenDB; step++) {
    keys.push(pointKey(dx + uDB[0] * step, dy + uDB[1] * step));
  }
  return { keys, cornerStep: lenAD, totalSteps: lenAD + lenDB };
}

function sampledLRouteKeys(aKey, dKey, bKey, count) {
  if (count < 3) return null;
  const path = gridPathKeys(aKey, dKey, bKey);
  if (!path || path.keys.length < count) return null;
  const { keys, cornerStep, totalSteps } = path;
  const leftIntervals = Math.max(1, Math.min(count - 2, Math.round(((count - 1) * cornerStep) / totalSteps)));
  const left = sampleIncreasingIndices(0, cornerStep, leftIntervals + 1);
  const right = sampleIncreasingIndices(cornerStep, totalSteps, count - leftIntervals);
  if (!left || !right) return null;
  const indices = [...left, ...right.slice(1)];
  if (indices.length !== count || new Set(indices).size !== count) return null;
  return indices.map((idx) => keys[idx]);
}

function edgeKeyOtherEndpoint(edgeKey, currentKey) {
  const parts = String(edgeKey).split('|');
  if (parts.length !== 2) return null;
  if (parts[0] === currentKey) return parts[1];
  if (parts[1] === currentKey) return parts[0];
  return null;
}

function armKeysFromCorner(cornerKey, edgeKeys) {
  const out = [cornerKey];
  let cur = cornerKey;
  for (const edgeKey of edgeKeys || []) {
    const next = edgeKeyOtherEndpoint(edgeKey, cur);
    if (!next || next === cur) return null;
    out.push(next);
    cur = next;
  }
  return out;
}

function graphOldRouteKeys(info) {
  const hFromC = armKeysFromCorner(info.cornerKey, info.hKeys);
  const vFromC = armKeysFromCorner(info.cornerKey, info.vKeys);
  if (!hFromC || !vFromC || hFromC.length < 2 || vFromC.length < 2) return null;
  return [...hFromC.slice().reverse(), ...vFromC.slice(1)];
}

function applyGridMapToSegments(work, segmentIndices, oldToNew) {
  for (const si of segmentIndices || []) {
    const seg = work?.[si];
    const pts = seg?.points;
    if (!Array.isArray(pts)) continue;
    for (let pi = 0; pi < pts.length; pi++) {
      const k = pointKey(...getXY(pts[pi]));
      const nk = oldToNew.get(k);
      if (!nk) continue;
      const [nx, ny] = parseKey(nk);
      setVertexGrid(seg, pi, nx, ny);
    }
  }
}

/**
 * flip：先決定新 L 路線 A→D→B，再把原 L 範圍內的點依原路徑順序重新排列到新 L 上。
 * 新轉折 D 不要求沿用原 corner 點；connect 會同步 display_x/y。
 */

function validateFlipped(work, flipSegmentIndices) {
  syncOrthoFlatSegmentEndpoints(work);
  if (orthoFlatSegmentsEdgePairGeometryInvalid(work)) {
    return 'flip 後會產生路線交叉或共線重疊（端點相接除外），或折線含零長邊。';
  }
  if (orthoFlatSegmentsOverlapsForeignConnectDisplay(work, { flipSegmentIndices })) {
    return 'flip 後會造成非本次 flip 路線之正交邊，壓到紅／藍 connect 顯示格（線段開放內部）。';
  }
  return null;
}

export function tryFlipOrthogonalLShapeInFlatSegments(flatSegments, L) {
  const flipSi = flipInvolvedSegmentIndices(L);
  const base = shallowCloneOrthoSegmentsSynced(flatSegments);
  const info = candidateEndpointsForL(L, base);
  if (!info) return { ok: false, flipped: false, reason: '無法解析 L 形兩臂端點。' };

  const dKey = oppositeCorner(info.aKey, info.cornerKey, info.bKey);
  if (!dKey) return { ok: false, flipped: false, reason: 'L 形兩臂端點無法形成可 flip 的矩形對角。' };
  if (dKey === info.cornerKey || dKey === info.aKey || dKey === info.bKey) {
    return { ok: false, flipped: false, reason: 'flip 後轉角與既有端點重疊。' };
  }

  const beforeAdj = buildFullAdjacency(base);
  const gain = continuationGain(beforeAdj, info.aKey, info.cornerKey, info.bKey, dKey);
  if (gain.gain <= 0) {
    return {
      ok: false,
      flipped: false,
      reason: `flip 後無法讓水平／垂直線串接變長（before=${gain.before}, after=${gain.after}）。`,
    };
  }

  if (!gridPathKeys(info.aKey, dKey, info.bKey)) {
    return { ok: false, flipped: false, reason: '無法決定 flip 後兩臂的軸向步進。' };
  }

  const work = shallowCloneOrthoSegmentsSynced(base);
  const oldToNew = new Map();

  if (info.graph) {
    const oldRouteKeys = graphOldRouteKeys(info);
    if (!oldRouteKeys) return { ok: false, flipped: false, reason: '無法解析跨路段 L 的路徑順序。' };
    const newRouteKeys = sampledLRouteKeys(info.aKey, dKey, info.bKey, oldRouteKeys.length);
    if (!newRouteKeys) {
      return { ok: false, flipped: false, reason: 'flip 後的新 L 路徑格數不足，無法依序放回原 L 上的點。' };
    }
    for (let i = 0; i < oldRouteKeys.length; i++) oldToNew.set(oldRouteKeys[i], newRouteKeys[i]);
    applyGridMapToSegments(work, flipSi, oldToNew);
  } else {
    const si = info.si;
    const pts = work[si]?.points;
    if (!Array.isArray(pts)) return { ok: false, flipped: false, reason: '折線不存在。' };
    const { lo, hi } = info;
    const oldRouteKeys = [];
    for (let j = lo; j <= hi; j++) oldRouteKeys.push(pointKey(...getXY(pts[j])));
    const newRouteKeys = sampledLRouteKeys(info.aKey, dKey, info.bKey, oldRouteKeys.length);
    if (!newRouteKeys) {
      return { ok: false, flipped: false, reason: 'flip 後的新 L 路徑格數不足，無法依序放回原 L 上的點。' };
    }
    for (let i = 0; i < oldRouteKeys.length; i++) oldToNew.set(oldRouteKeys[i], newRouteKeys[i]);
    applyGridMapToSegments(work, flipSi, oldToNew);
  }

  const invalidReason = validateFlipped(work, flipSi);
  if (invalidReason) return { ok: false, flipped: false, reason: invalidReason };

  return {
    ok: true,
    flipped: true,
    segments: work,
    reason: `已 flip（含紅／藍點對應位移）；水平／垂直串接長度 ${gain.before} → ${gain.after}。`,
  };
}

export function flipFirstPossibleOrthogonalLShapeInFlatSegments(flatSegments) {
  const list = listOrthogonalLShapesInFlatSegments(flatSegments);
  const reasons = [];
  for (const item of list) {
    const r = tryFlipOrthogonalLShapeInFlatSegments(flatSegments, item);
    if (r.flipped) return { ...r, L: item, checkedCount: reasons.length + 1, totalCount: list.length };
    reasons.push(r.reason || '不可 flip');
  }
  return {
    ok: true,
    flipped: false,
    segments: flatSegments,
    checkedCount: reasons.length,
    totalCount: list.length,
    reason: reasons.length ? reasons[0] : '沒有符合規則的 L 形。',
    reasons,
  };
}
