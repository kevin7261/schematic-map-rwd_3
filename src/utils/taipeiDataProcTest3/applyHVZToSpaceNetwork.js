/**
 * 直線 Z 形水平垂直化（與 ControlTab 原 taipei_a／taipei_a2 邏輯相同）
 * 紅點不動、禁止重疊／交叉、階梯貼齊 A→B。
 */

import { MAX_COLINEAR_ROUTE_OVERLAP_LEN } from '@/utils/routeOverlapGridTolerance.js';

const toCoord = (p) => [
  Array.isArray(p) ? p[0] : (p?.x ?? 0),
  Array.isArray(p) ? p[1] : (p?.y ?? 0),
];

/** 0＝整數格點（與 taipei_a 相同）；1＝小數第一位（Test3 g3） */
let hvzCoordDecimals = 0;
function roundCoordHVZ(v) {
  const n = Number(v);
  if (hvzCoordDecimals <= 0) return Math.round(n);
  const f = 10 ** hvzCoordDecimals;
  return Math.round(n * f) / f;
}
function roundPt(p) {
  return [roundCoordHVZ(p[0]), roundCoordHVZ(p[1])];
}

const eps = 1e-6;
const ptEq = (a, b) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

function segmentCross(a, b, c, d) {
  const cross2 = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const d1 = cross2(a, b, c),
    d2 = cross2(a, b, d);
  const d3 = cross2(c, d, a),
    d4 = cross2(c, d, b);
  if (Math.abs(d1) < eps && Math.abs(d2) < eps && Math.abs(d3) < eps && Math.abs(d4) < eps)
    return false;
  return d1 * d2 < -eps && d3 * d4 < -eps;
}

function segmentsOverlap(a, b, c, d) {
  const cross2 = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  if (Math.abs(cross2(a, b, c)) > eps || Math.abs(cross2(a, b, d)) > eps) return false;
  const lenAb = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const proj = (p) =>
    ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (lenAb * lenAb);
  const tc = proj(c),
    td = proj(d);
  const tLo = Math.max(0, Math.min(tc, td));
  const tHi = Math.min(1, Math.max(tc, td));
  const overlapLen = (tHi - tLo) * lenAb;
  return overlapLen > MAX_COLINEAR_ROUTE_OVERLAP_LEN + 1e-9;
}

function collectOtherSegs(allSegments, excludeIdx) {
  const out = [];
  allSegments.forEach((s, i) => {
    if (i === excludeIdx || !Array.isArray(s.points) || s.points.length < 2) return;
    const pts = s.points;
    for (let j = 0; j < pts.length - 1; j++) out.push([toCoord(pts[j]), toCoord(pts[j + 1])]);
  });
  return out;
}

function collectSameRouteSegs(allSegments, excludeIdx, routeName) {
  const out = [];
  const rn = routeName ?? allSegments[excludeIdx]?._routeName ?? 'Unknown';
  allSegments.forEach((s, i) => {
    if (i === excludeIdx || !Array.isArray(s.points) || s.points.length < 2) return;
    if ((s._routeName ?? s.route_name ?? s.name ?? 'Unknown') !== rn) return;
    const pts = s.points;
    for (let j = 0; j < pts.length - 1; j++) out.push([toCoord(pts[j]), toCoord(pts[j + 1])]);
  });
  return out;
}

function pathConflicts(newLineSegs, existingSegs) {
  for (const [a, b] of newLineSegs) {
    for (const [c, d] of existingSegs) {
      if (segmentCross(a, b, c, d)) return true;
      if (segmentsOverlap(a, b, c, d)) return true;
    }
  }
  return false;
}

function ptsToLineSegs(pts) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  return segs;
}

/**
 * 依格網步長決定鋸齒搜尋範圍。整數格維持原 60 上限；小數格（Test3）以每軸 ≤0.1 為目標，轉折數大幅提高。
 */
function getSawtoothSearchParams(A, B) {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const adx = Math.abs(B[0] - A[0]);
  const ady = Math.abs(B[1] - A[1]);
  if (hvzCoordDecimals <= 0) {
    const preferredL = Math.min(60, Math.max(2, Math.ceil(len / 2)));
    return { preferredL, maxK: 60 };
  }
  const stepMax = 10 ** -hvzCoordDecimals;
  const finePreferred = Math.max(2, Math.ceil(adx / stepMax) + Math.ceil(ady / stepMax) - 1);
  const coarsePreferred = Math.min(60, Math.max(2, Math.ceil(len / 2)));
  const preferredL = Math.max(coarsePreferred, finePreferred);
  const maxK = Math.min(5000, Math.max(120, finePreferred + 20));
  return { preferredL: Math.min(maxK, preferredL), maxK };
}

function buildSawtooth(A, B, numL) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const n = Math.max(1, numL);
  const kxH = Math.ceil((n + 1) / 2);
  const kyH = Math.floor((n + 1) / 2);
  const xStepH = kxH > 0 ? dx / kxH : 0;
  const yStepH = kyH > 0 ? dy / kyH : 0;
  const ptsH = [roundPt(A)];
  let x = A[0],
    y = A[1];
  for (let i = 1; i <= n; i++) {
    if (i % 2 === 1) {
      x += xStepH;
      ptsH.push(roundPt([x, y]));
    } else {
      y += yStepH;
      ptsH.push(roundPt([x, y]));
    }
  }
  ptsH.push(roundPt(B));
  const kyV = Math.ceil((n + 1) / 2);
  const kxV = Math.floor((n + 1) / 2);
  const xStepV = kxV > 0 ? dx / kxV : 0;
  const yStepV = kyV > 0 ? dy / kyV : 0;
  const ptsV = [roundPt(A)];
  x = A[0];
  y = A[1];
  for (let i = 1; i <= n; i++) {
    if (i % 2 === 1) {
      y += yStepV;
      ptsV.push(roundPt([x, y]));
    } else {
      x += xStepV;
      ptsV.push(roundPt([x, y]));
    }
  }
  ptsV.push(roundPt(B));
  return [
    { pts: ptsH, segs: ptsToLineSegs(ptsH) },
    { pts: ptsV, segs: ptsToLineSegs(ptsV) },
  ];
}

function findBestPath(A, B, existingSegs, sameRouteSegs = null) {
  const same = sameRouteSegs ?? existingSegs;
  const { preferredL, maxK } = getSawtoothSearchParams(A, B);
  const order = [];
  for (let k = 1; k <= maxK; k++) order.push(k);
  order.sort((a, b) => {
    const da = Math.abs(a - preferredL);
    const db = Math.abs(b - preferredL);
    return da - db || a - b;
  });
  for (const numL of order) {
    for (const cand of buildSawtooth(A, B, numL)) {
      if (pathConflicts(cand.segs, same)) continue;
      if (!pathConflicts(cand.segs, existingSegs)) return cand;
    }
  }
  return null;
}

function applyPath(seg, cand) {
  if (!cand || !seg) return;
  const pts = seg.points;
  const roundedMid = cand.pts.slice(1, -1).map(roundPt);
  seg.points = [roundPt(toCoord(pts[0])), ...roundedMid, roundPt(toCoord(pts[pts.length - 1]))];
  const [x0, y0] = toCoord(seg.points[0]);
  const [xE, yE] = toCoord(seg.points[seg.points.length - 1]);
  if (seg.properties_start) {
    seg.properties_start.x_grid = x0;
    seg.properties_start.y_grid = y0;
  }
  if (seg.properties_end) {
    seg.properties_end.x_grid = xE;
    seg.properties_end.y_grid = yE;
  }
  if (Array.isArray(seg.start_coord) && seg.start_coord.length >= 2) {
    seg.start_coord[0] = x0;
    seg.start_coord[1] = y0;
  }
  if (Array.isArray(seg.end_coord) && seg.end_coord.length >= 2) {
    seg.end_coord[0] = xE;
    seg.end_coord[1] = yE;
  }
  if (Array.isArray(seg.nodes)) {
    const nS = seg.nodes[0];
    const nE = seg.nodes[seg.nodes.length - 1];
    const midCount = Math.max(0, seg.points.length - 2);
    seg.nodes = [
      nS || { node_type: 'line' },
      ...Array.from({ length: midCount }, () => ({ node_type: 'line' })),
      nE || { node_type: 'line' },
    ];
  }
}

function getFallbackSawtooth(A, B, sameRouteSegs, existingSegs) {
  const { preferredL, maxK } = getSawtoothSearchParams(A, B);
  const order = [];
  for (let k = 1; k <= maxK; k++) order.push(k);
  order.sort((a, b) => {
    const da = Math.abs(a - preferredL);
    const db = Math.abs(b - preferredL);
    return da - db || a - b;
  });
  for (const numL of order) {
    for (const cand of buildSawtooth(A, B, numL)) {
      if (sameRouteSegs && pathConflicts(cand.segs, sameRouteSegs)) continue;
      if (!existingSegs || !pathConflicts(cand.segs, existingSegs)) return cand;
    }
  }
  const numL = Math.min(maxK, Math.max(2, preferredL));
  const [candH, candV] = buildSawtooth(A, B, numL);
  if (sameRouteSegs) {
    if (!pathConflicts(candH.segs, sameRouteSegs)) return candH;
    if (!pathConflicts(candV.segs, sameRouteSegs)) return candV;
  }
  return candH;
}

function fixConflictsPass(allSegments, upTo) {
  for (let iter = 0; iter < 30; iter++) {
    let found = false;
    for (let j = 0; j <= upTo; j++) {
      const seg = allSegments[j];
      if (!seg || !Array.isArray(seg.points) || seg.points.length < 2) continue;
      const lines = ptsToLineSegs(seg.points.map(toCoord));
      const others = collectOtherSegs(allSegments, j);
      if (!pathConflicts(lines, others)) continue;
      const A = toCoord(seg.points[0]);
      const B = toCoord(seg.points[seg.points.length - 1]);
      if (ptEq(A, B) || (Math.abs(A[0] - B[0]) < eps && Math.abs(A[1] - B[1]) < eps)) continue;
      const sameRouteSegs = collectSameRouteSegs(allSegments, j, seg._routeName);
      let cand = findBestPath(A, B, others, sameRouteSegs);
      if (!cand) cand = getFallbackSawtooth(A, B, sameRouteSegs, others);
      if (cand) {
        applyPath(seg, cand);
        found = true;
        break;
      }
    }
    if (!found) break;
  }
}

function tryConvertOne(allSegments, idx, forceHV = false) {
  const seg = allSegments[idx];
  if (!seg || !Array.isArray(seg.points) || seg.points.length < 2) return false;
  const A = toCoord(seg.points[0]);
  const B = toCoord(seg.points[seg.points.length - 1]);
  if (Math.abs(A[0] - B[0]) < eps || Math.abs(A[1] - B[1]) < eps) return false;
  const others = collectOtherSegs(allSegments, idx);
  const sameRouteSegs = collectSameRouteSegs(allSegments, idx, seg._routeName);
  let cand = findBestPath(A, B, others, sameRouteSegs);
  if (!cand && forceHV) cand = getFallbackSawtooth(A, B, sameRouteSegs, others);
  if (cand) {
    applyPath(seg, cand);
    return true;
  }
  return false;
}

function isDiagonalSegment(seg) {
  if (!seg?.points || seg.points.length !== 2) return false;
  const A = toCoord(seg.points[0]);
  const B = toCoord(seg.points[seg.points.length - 1]);
  return Math.abs(A[0] - B[0]) >= eps && Math.abs(A[1] - B[1]) >= eps;
}

function buildAllSegments(data) {
  const allSegments = [];
  if (!Array.isArray(data) || data.length === 0) return { allSegments, total: 0 };
  const is2_5 = data[0]?.route_name && Array.isArray(data[0]?.segments);
  if (is2_5) {
    data.forEach((r) => {
      (r.segments || []).forEach((s) => {
        s._routeName = r.route_name ?? r.name ?? 'Unknown';
        allSegments.push(s);
      });
    });
  } else {
    data.forEach((s) => {
      s._routeName = s.route_name ?? s.name ?? 'Unknown';
      allSegments.push(s);
    });
  }
  return { allSegments, total: allSegments.length };
}

/**
 * @param {Array} data - spaceNetworkGridJsonData
 * @returns {number} 路段總數（扁平）
 */
export function countHVZSegments(data) {
  return buildAllSegments(data).total;
}

/**
 * 一鍵完成：全部改為水平垂直（就地修改 data）
 * @param {{ coordDecimals?: number }} [options] coordDecimals=1 時座標對齊到小數第一位（Test3）
 */
export function applyHVZAllToSpaceNetworkData(data, options = {}) {
  const prev = hvzCoordDecimals;
  hvzCoordDecimals = options.coordDecimals ?? 0;
  try {
    const { allSegments, total } = buildAllSegments(data);
    if (total === 0) return;
    for (let round = 0; round < 3; round++) {
      for (let idx = 0; idx < total; idx++) {
        tryConvertOne(allSegments, idx, true);
      }
      fixConflictsPass(allSegments, total - 1);
    }
    for (let idx = 0; idx < total; idx++) {
      if (isDiagonalSegment(allSegments[idx])) tryConvertOne(allSegments, idx, true);
    }
    fixConflictsPass(allSegments, total - 1);
  } finally {
    hvzCoordDecimals = prev;
  }
}

/**
 * 單步：處理 stepIndex % total 對應路段（就地修改 data）
 * @returns {number} 下一個 stepIndex（一律 +1）
 * @param {{ coordDecimals?: number }} [options]
 */
export function applyHVZStepToSpaceNetworkData(data, stepIndex, options = {}) {
  const prev = hvzCoordDecimals;
  hvzCoordDecimals = options.coordDecimals ?? 0;
  try {
    const { allSegments, total } = buildAllSegments(data);
    if (total === 0) return stepIndex + 1;
    const idx = stepIndex % total;
    const seg = allSegments[idx];
    if (!seg || !Array.isArray(seg.points) || seg.points.length < 2) {
      return stepIndex + 1;
    }
    const A = toCoord(seg.points[0]);
    const B = toCoord(seg.points[seg.points.length - 1]);
    if (Math.abs(A[0] - B[0]) < eps || Math.abs(A[1] - B[1]) < eps) {
      return stepIndex + 1;
    }
    const others = collectOtherSegs(allSegments, idx);
    const sameRouteSegs = collectSameRouteSegs(allSegments, idx, seg._routeName);
    let cand = findBestPath(A, B, others, sameRouteSegs);
    if (!cand) cand = getFallbackSawtooth(A, B, sameRouteSegs, others);
    if (cand) applyPath(seg, cand);
    fixConflictsPass(allSegments, idx);
    return stepIndex + 1;
  } finally {
    hvzCoordDecimals = prev;
  }
}
