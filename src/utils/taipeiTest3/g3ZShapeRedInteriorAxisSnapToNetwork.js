/**
 * f3→g3 之後、不改變原拓撲的情況下，把 Z 形路段中「兩個連續轉折點之間」（不含頭尾那兩段）
 * 軸座標非整數的「紅色」線，整條沿軸向（水平線調整 y、垂直線調整 x）平移到可行位置。
 * 候選順序（同層內依與當前值距離）：**整數** → 0.5 → 0.25／0.75 → 1/8 → …（Dyadic 非整數），
 * 窮舉至 maxDyadicLevel；若皆不可行則不動（no-candidate）。
 * 兩端轉折點一起移動，保持水平／垂直。
 * 候選若出現下列任一情形則捨棄：相鄰段 0 長度、與全網其他邊之交叉／共線重疊集合改變、
 * **同一路段內**非相鄰邊之交叉／共線重疊集合改變（含路線自我重疊）、
 * **全路網**：不同頂點之**轉折與轉折**不可同座標；**轉折與任一路段端點**亦不可同座標
 * （僅端點與端點重合，如 connect 匯流，仍允許）。
 *
 * 就地修改 routesData 參考；不影響原拓撲定義：
 *  - 邊對之交叉（strict interior）集合不變
 *  - 共線重疊（有正長度重疊區間）集合不變
 */

const COORD_EPS = 1e-3;
const INT_EPS = 1e-5;
const DEFAULT_MAX_DYADIC_LEVEL = 8;

function getX(p) {
  return Array.isArray(p) ? Number(p[0]) : Number(p?.x ?? 0);
}
function getY(p) {
  return Array.isArray(p) ? Number(p[1]) : Number(p?.y ?? 0);
}
function setX(p, v) {
  if (Array.isArray(p)) p[0] = v;
  else p.x = v;
}
function setY(p, v) {
  if (Array.isArray(p)) p[1] = v;
  else p.y = v;
}
function toXY(p) {
  return [getX(p), getY(p)];
}
function isNearlyInteger(v) {
  return Number.isFinite(v) && Math.abs(v - Math.round(v)) < INT_EPS;
}

function listOrthogonalTurnVertexIndices(points) {
  const out = [];
  if (!Array.isArray(points) || points.length < 3) return out;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = toXY(points[i - 1]);
    const p1 = toXY(points[i]);
    const p2 = toXY(points[i + 1]);
    const dx1 = p1[0] - p0[0];
    const dy1 = p1[1] - p0[1];
    const dx2 = p2[0] - p1[0];
    const dy2 = p2[1] - p1[1];
    if (Math.hypot(dx1, dy1) < COORD_EPS || Math.hypot(dx2, dy2) < COORD_EPS) continue;
    const h1 = Math.abs(dy1) < COORD_EPS;
    const v1 = Math.abs(dx1) < COORD_EPS;
    const h2 = Math.abs(dy2) < COORD_EPS;
    const v2 = Math.abs(dx2) < COORD_EPS;
    if ((h1 && v2) || (v1 && h2)) out.push(i);
  }
  return out;
}

function collectFlatSegmentRefs(routesData) {
  const raw = routesData || [];
  const out = [];
  if (raw.length > 0 && raw[0]?.segments && !raw[0]?.points) {
    for (const route of raw) for (const seg of route.segments || []) out.push(seg);
  } else {
    for (const seg of raw) out.push(seg);
  }
  return out;
}

function endpointNodeTypeConnect(seg, which) {
  const nodes = seg?.nodes;
  const pts = seg?.points;
  if (Array.isArray(nodes) && Array.isArray(pts) && nodes.length === pts.length && pts.length >= 2) {
    const n = which === 'start' ? nodes[0] : nodes[nodes.length - 1];
    return String(n?.node_type ?? '').trim() === 'connect';
  }
  const props = which === 'start' ? seg?.properties_start : seg?.properties_end;
  const tags = props?.tags || {};
  return String(props?.node_type ?? tags?.node_type ?? '').trim() === 'connect';
}

function collectAllStraightEdges(segRefs) {
  const edges = [];
  for (let si = 0; si < segRefs.length; si++) {
    const pts = segRefs[si]?.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = toXY(pts[i]);
      const b = toXY(pts[i + 1]);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < COORD_EPS) continue;
      edges.push({ key: `${si}:${i}`, segIdx: si, edgeIdx: i, a, b });
    }
  }
  return edges;
}

function orthoCross(p1, p2, q1, q2) {
  const hP = Math.abs(p1[1] - p2[1]) < COORD_EPS;
  const vQ = Math.abs(q1[0] - q2[0]) < COORD_EPS;
  if (hP && vQ) {
    const x = q1[0];
    const y = p1[1];
    const pxLo = Math.min(p1[0], p2[0]);
    const pxHi = Math.max(p1[0], p2[0]);
    const qyLo = Math.min(q1[1], q2[1]);
    const qyHi = Math.max(q1[1], q2[1]);
    if (x <= pxLo + COORD_EPS || x >= pxHi - COORD_EPS) return false;
    if (y <= qyLo + COORD_EPS || y >= qyHi - COORD_EPS) return false;
    return true;
  }
  const vP = Math.abs(p1[0] - p2[0]) < COORD_EPS;
  const hQ = Math.abs(q1[1] - q2[1]) < COORD_EPS;
  if (vP && hQ) {
    const x = p1[0];
    const y = q1[1];
    const pyLo = Math.min(p1[1], p2[1]);
    const pyHi = Math.max(p1[1], p2[1]);
    const qxLo = Math.min(q1[0], q2[0]);
    const qxHi = Math.max(q1[0], q2[0]);
    if (y <= pyLo + COORD_EPS || y >= pyHi - COORD_EPS) return false;
    if (x <= qxLo + COORD_EPS || x >= qxHi - COORD_EPS) return false;
    return true;
  }
  return false;
}

function collinearOverlap(p1, p2, q1, q2) {
  const hP = Math.abs(p1[1] - p2[1]) < COORD_EPS;
  const hQ = Math.abs(q1[1] - q2[1]) < COORD_EPS;
  if (hP && hQ && Math.abs(p1[1] - q1[1]) < COORD_EPS) {
    const pLo = Math.min(p1[0], p2[0]);
    const pHi = Math.max(p1[0], p2[0]);
    const qLo = Math.min(q1[0], q2[0]);
    const qHi = Math.max(q1[0], q2[0]);
    const lo = Math.max(pLo, qLo);
    const hi = Math.min(pHi, qHi);
    return hi - lo > COORD_EPS;
  }
  const vP = Math.abs(p1[0] - p2[0]) < COORD_EPS;
  const vQ = Math.abs(q1[0] - q2[0]) < COORD_EPS;
  if (vP && vQ && Math.abs(p1[0] - q1[0]) < COORD_EPS) {
    const pLo = Math.min(p1[1], p2[1]);
    const pHi = Math.max(p1[1], p2[1]);
    const qLo = Math.min(q1[1], q2[1]);
    const qHi = Math.max(q1[1], q2[1]);
    const lo = Math.max(pLo, qLo);
    const hi = Math.min(pHi, qHi);
    return hi - lo > COORD_EPS;
  }
  return false;
}

/** 只計算與 affectedKeys 有關之邊對（大幅加速） */
function computePartialTopologyState(edges, affectedKeys) {
  const cross = new Set();
  const over = new Set();
  for (let i = 0; i < edges.length; i++) {
    const ei = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const ej = edges[j];
      if (!affectedKeys.has(ei.key) && !affectedKeys.has(ej.key)) continue;
      const pairKey = ei.key < ej.key ? `${ei.key}|${ej.key}` : `${ej.key}|${ei.key}`;
      if (orthoCross(ei.a, ei.b, ej.a, ej.b)) cross.add(pairKey);
      if (collinearOverlap(ei.a, ei.b, ej.a, ej.b)) over.add(pairKey);
    }
  }
  return { cross, over };
}

function sameState(s1, s2) {
  if (s1.cross.size !== s2.cross.size) return false;
  if (s1.over.size !== s2.over.size) return false;
  for (const k of s1.cross) if (!s2.cross.has(k)) return false;
  for (const k of s1.over) if (!s2.over.has(k)) return false;
  return true;
}

/** 同一路段內，非相鄰邊對之交叉／共線重疊（偵測自我重疊、折返） */

function geomKeyForVertexOverlap(x, y) {
  const rx = Math.round(Number(x) / COORD_EPS) * COORD_EPS;
  const ry = Math.round(Number(y) / COORD_EPS) * COORD_EPS;
  return `${rx},${ry}`;
}

/**
 * 全路網：不同 (路段,頂點索引) 若同座標，不可為「轉折+轉折」或「轉折+端點」；
 * 僅「端點+端點」重合（多線共用 connect）允許。
 */
function globalNetworkTurnEndpointVertexSeparationOk(segRefs) {
  const byKey = new Map();
  for (let si = 0; si < segRefs.length; si++) {
    const pts = segRefs[si]?.points || [];
    const n = pts.length;
    if (n < 2) continue;
    const turnSet = new Set(listOrthogonalTurnVertexIndices(pts));
    for (let vi = 0; vi < n; vi++) {
      const isEnd = vi === 0 || vi === n - 1;
      const isTurn = turnSet.has(vi);
      if (!isEnd && !isTurn) continue;
      const p = toXY(pts[vi]);
      const key = geomKeyForVertexOverlap(p[0], p[1]);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ si, vi, isTurn, isEnd });
    }
  }
  for (const arr of byKey.values()) {
    if (!arr || arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (a.si === b.si && a.vi === b.vi) continue;
        if (a.isTurn && b.isTurn) return false;
        if ((a.isTurn && b.isEnd) || (a.isEnd && b.isTurn)) return false;
      }
    }
  }
  return true;
}

function computeSegmentSelfNonAdjacentState(segIdx, edges) {
  const segEdges = edges.filter((e) => e.segIdx === segIdx);
  const cross = new Set();
  const over = new Set();
  for (let i = 0; i < segEdges.length; i++) {
    for (let j = i + 1; j < segEdges.length; j++) {
      const ei = segEdges[i];
      const ej = segEdges[j];
      if (Math.abs(ei.edgeIdx - ej.edgeIdx) <= 1) continue;
      const pairKey = ei.key < ej.key ? `${ei.key}|${ej.key}` : `${ej.key}|${ei.key}`;
      if (orthoCross(ei.a, ei.b, ej.a, ej.b)) cross.add(pairKey);
      if (collinearOverlap(ei.a, ei.b, ej.a, ej.b)) over.add(pairKey);
    }
  }
  return { cross, over };
}

/**
 * 整數（level 0）→ 0.5 → 0.25／0.75 → …；整數取鄰近範圍以涵蓋「可移到整數」之情形。
 */
function buildCandidateAxisValues(currentAxis, maxLevel) {
  const out = [];
  const center = Math.round(currentAxis);
  const intSpread = 6;
  const intSeen = new Set();
  for (let z = center - intSpread; z <= center + intSpread; z++) {
    const dist = Math.abs(z - currentAxis);
    if (dist < INT_EPS) continue;
    if (intSeen.has(z)) continue;
    intSeen.add(z);
    out.push({ level: 0, value: z, dist });
  }

  const floorX = Math.floor(currentAxis);
  const intStart = floorX - 3;
  const intEnd = floorX + 3;
  for (let k = 1; k <= maxLevel; k++) {
    const denom = 2 ** k;
    for (let ip = intStart; ip <= intEnd; ip++) {
      for (let j = 1; j < denom; j += 2) {
        const val = ip + j / denom;
        if (isNearlyInteger(val)) continue;
        out.push({ level: k, value: val, dist: Math.abs(val - currentAxis) });
      }
    }
  }
  out.sort((a, b) => a.level - b.level || a.dist - b.dist || a.value - b.value);
  return out;
}

/**
 * @param {Array} routesData - g3 spaceNetworkGridJsonData（mutated in place）
 * @param {{ maxDyadicLevel?: number }} [options]
 * @returns {{
 *   routesData: Array,
 *   redInteriorCount: number,
 *   adjustments: Array<{ fi:number, i0:number, i1:number, axis:'h'|'v', from:number, to:number, level?:number, status:'moved'|'no-candidate'|'already-integer', coordinates?: number[][] }>
 * }}
 */
export function applyG3ZShapeRedInteriorAxisSnapToNetwork(routesData, options = {}) {
  const maxLevel = options.maxDyadicLevel ?? DEFAULT_MAX_DYADIC_LEVEL;
  const segRefs = collectFlatSegmentRefs(routesData);
  const adjustments = [];
  let redInteriorCount = 0;

  const tasks = [];
  for (let fi = 0; fi < segRefs.length; fi++) {
    const seg = segRefs[fi];
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    if (!endpointNodeTypeConnect(seg, 'start') || !endpointNodeTypeConnect(seg, 'end')) continue;
    const turns = listOrthogonalTurnVertexIndices(pts);
    if (turns.length < 2) continue;
    for (let j = 0; j < turns.length - 1; j++) {
      const i0 = turns[j];
      const i1 = turns[j + 1];
      const a = toXY(pts[i0]);
      const b = toXY(pts[i1]);
      const horizontal = Math.abs(a[1] - b[1]) < COORD_EPS;
      const vertical = Math.abs(a[0] - b[0]) < COORD_EPS;
      if (!horizontal && !vertical) continue;
      const axis = horizontal ? 'h' : 'v';
      const axisValue = horizontal ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2;
      if (isNearlyInteger(axisValue)) continue;
      tasks.push({ fi, i0, i1, axis });
      redInteriorCount++;
    }
  }

  for (const task of tasks) {
    const seg = segRefs[task.fi];
    const pts = seg.points;
    const a0 = toXY(pts[task.i0]);
    const b0 = toXY(pts[task.i1]);
    const currentAxisValue = task.axis === 'h' ? (a0[1] + b0[1]) / 2 : (a0[0] + b0[0]) / 2;
    if (isNearlyInteger(currentAxisValue)) {
      adjustments.push({
        fi: task.fi,
        i0: task.i0,
        i1: task.i1,
        axis: task.axis,
        from: currentAxisValue,
        to: currentAxisValue,
        status: 'already-integer',
      });
      continue;
    }

    const affectedKeys = new Set();
    for (let ei = task.i0 - 1; ei <= task.i1; ei++) {
      if (ei >= 0) affectedKeys.add(`${task.fi}:${ei}`);
    }
    const edgesBefore = collectAllStraightEdges(segRefs);
    const stateBefore = computePartialTopologyState(edgesBefore, affectedKeys);
    const selfBefore = computeSegmentSelfNonAdjacentState(task.fi, edgesBefore);

    const originalAxisValues = [];
    for (let k = task.i0; k <= task.i1; k++) {
      originalAxisValues.push(task.axis === 'h' ? getY(pts[k]) : getX(pts[k]));
    }
    const restoreOriginal = () => {
      for (let k = task.i0; k <= task.i1; k++) {
        const orig = originalAxisValues[k - task.i0];
        if (task.axis === 'h') setY(pts[k], orig);
        else setX(pts[k], orig);
      }
    };

    const candidates = buildCandidateAxisValues(currentAxisValue, maxLevel);
    let applied = false;
    for (const cand of candidates) {
      for (let k = task.i0; k <= task.i1; k++) {
        if (task.axis === 'h') setY(pts[k], cand.value);
        else setX(pts[k], cand.value);
      }

      let lengthsOk = true;
      if (task.i0 - 1 >= 0) {
        const p0 = toXY(pts[task.i0 - 1]);
        const p1 = toXY(pts[task.i0]);
        if (Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) < COORD_EPS) lengthsOk = false;
      }
      if (task.i1 + 1 < pts.length) {
        const p0 = toXY(pts[task.i1]);
        const p1 = toXY(pts[task.i1 + 1]);
        if (Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) < COORD_EPS) lengthsOk = false;
      }
      if (!lengthsOk) {
        restoreOriginal();
        continue;
      }
      if (!globalNetworkTurnEndpointVertexSeparationOk(segRefs)) {
        restoreOriginal();
        continue;
      }

      const edgesAfter = collectAllStraightEdges(segRefs);
      const stateAfter = computePartialTopologyState(edgesAfter, affectedKeys);
      if (!sameState(stateBefore, stateAfter)) {
        restoreOriginal();
        continue;
      }
      const selfAfter = computeSegmentSelfNonAdjacentState(task.fi, edgesAfter);
      if (!sameState(selfBefore, selfAfter)) {
        restoreOriginal();
        continue;
      }

      const c0 = toXY(pts[task.i0]);
      const c1 = toXY(pts[task.i1]);
      adjustments.push({
        fi: task.fi,
        i0: task.i0,
        i1: task.i1,
        axis: task.axis,
        from: currentAxisValue,
        to: cand.value,
        level: cand.level,
        status: 'moved',
        coordinates: [c0, c1],
      });
      applied = true;
      break;
    }

    if (!applied) {
      adjustments.push({
        fi: task.fi,
        i0: task.i0,
        i1: task.i1,
        axis: task.axis,
        from: currentAxisValue,
        to: currentAxisValue,
        status: 'no-candidate',
      });
    }
  }

  return { routesData, redInteriorCount, adjustments };
}
