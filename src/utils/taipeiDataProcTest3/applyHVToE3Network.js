/**
 * taipei_e3 專用：對角線邊→水平垂直 (HV) 路徑
 * 拓樸不變 ＋ 禁止新的交叉 ＋ 禁止重疊 ＋ 禁止紅點／藍點／轉折點重合
 * 亦禁止「水平／垂直線段開區間」經過任何既有頂點（線壓在點上）
 * 優先最少轉折（L flip、鋸齒 H 先／V 先）；先小深度搜尋，必要時第二階段加大深度以消滅剩餘對角線
 * 結束後合併「共線冗餘」line 頂點，在不違規前提下再減轉折
 * 轉折點可用小數座標（預設 coordDecimals = 1）
 */

import { MAX_COLINEAR_ROUTE_OVERLAP_LEN } from '@/utils/routeOverlapGridTolerance.js';

/* ================================================================
 *  基本工具
 * ================================================================ */

const EPS = 1e-6;

const toCoord = (p) => [
  Number(Array.isArray(p) ? p[0] : (p?.x ?? 0)),
  Number(Array.isArray(p) ? p[1] : (p?.y ?? 0)),
];

let _dec = 1;
function rnd(v) {
  const f = 10 ** _dec;
  return Math.round(Number(v) * f) / f;
}
function rndPt(p) { return [rnd(p[0]), rnd(p[1])]; }
function ptKey(p) { return `${rnd(p[0])},${rnd(p[1])}`; }
function ptEq(a, b) { return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS; }
function isDiag(a, b) { return Math.abs(a[0] - b[0]) >= EPS && Math.abs(a[1] - b[1]) >= EPS; }

/** 嚴格水平或垂直邊（不可斜線、不可零長） */
function isEdgeStrictHV(u, v) {
  const dx = Math.abs(u[0] - v[0]);
  const dy = Math.abs(u[1] - v[1]);
  if (dx < EPS && dy < EPS) return false;
  return dx < EPS || dy < EPS;
}

/* ================================================================
 *  交叉 / 重疊 偵測（與 applyHVZToSpaceNetwork.js 同演算法）
 * ================================================================ */

function segCross(a, b, c, d) {
  const x2 = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const d1 = x2(a, b, c), d2 = x2(a, b, d);
  const d3 = x2(c, d, a), d4 = x2(c, d, b);
  if (Math.abs(d1) < EPS && Math.abs(d2) < EPS && Math.abs(d3) < EPS && Math.abs(d4) < EPS)
    return false;
  return d1 * d2 < -EPS && d3 * d4 < -EPS;
}

function segOverlap(a, b, c, d) {
  const x2 = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  if (Math.abs(x2(a, b, c)) > EPS || Math.abs(x2(a, b, d)) > EPS) return false;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const proj = (p) =>
    ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len);
  const tc = proj(c), td = proj(d);
  const tLo = Math.max(0, Math.min(tc, td));
  const tHi = Math.min(1, Math.max(tc, td));
  return (tHi - tLo) * len > MAX_COLINEAR_ROUTE_OVERLAP_LEN + 1e-9;
}

/* ================================================================
 *  收集既有 edge / point
 * ================================================================ */

function collectEdgesExcept(allSegs, skipSi, skipPi) {
  const out = [];
  for (let si = 0; si < allSegs.length; si++) {
    const pts = allSegs[si].points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let pi = 0; pi < pts.length - 1; pi++) {
      if (si === skipSi && pi === skipPi) continue;
      out.push([toCoord(pts[pi]), toCoord(pts[pi + 1])]);
    }
  }
  return out;
}

function collectOccupiedPts(allSegs) {
  const keys = new Set();
  for (const seg of allSegs) {
    if (!Array.isArray(seg.points)) continue;
    for (const p of seg.points) keys.add(ptKey(toCoord(p)));
  }
  return keys;
}

/** 所有路段頂點座標（四捨五入後去重），供「線段是否穿過點」檢查 */
function collectAllVertexCoordsRounded(allSegs) {
  const byKey = new Map();
  for (const seg of allSegs) {
    if (!Array.isArray(seg.points)) continue;
    for (const p of seg.points) {
      const q = rndPt(toCoord(p));
      const k = ptKey(q);
      if (!byKey.has(k)) byKey.set(k, q);
    }
  }
  return [...byKey.values()];
}

const INTERIOR_TOL = 2e-5;

/**
 * 正交線段 (u,v) 之開區間上，是否落在任何既有頂點（不含端點 u、v）
 */
function hvEdgeHitsInteriorVertex(u, v, vertexCoords) {
  const horiz = Math.abs(u[1] - v[1]) < EPS;
  const vert = Math.abs(u[0] - v[0]) < EPS;
  if (!horiz && !vert) return false;
  const minx = Math.min(u[0], v[0]);
  const maxx = Math.max(u[0], v[0]);
  const miny = Math.min(u[1], v[1]);
  const maxy = Math.max(u[1], v[1]);
  for (const q of vertexCoords) {
    if (ptEq(q, u) || ptEq(q, v)) continue;
    if (horiz) {
      if (
        Math.abs(q[1] - u[1]) < EPS &&
        q[0] > minx + INTERIOR_TOL &&
        q[0] < maxx - INTERIOR_TOL
      ) {
        return true;
      }
    }
    if (vert) {
      if (
        Math.abs(q[0] - u[0]) < EPS &&
        q[1] > miny + INTERIOR_TOL &&
        q[1] < maxy - INTERIOR_TOL
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 與 hvEdgeHitsInteriorVertex 相同，但略過指定 ptKey（合併共線頂點時排除將刪除的中點）
 */
function hvEdgeHitsInteriorVertexExcept(u, v, vertexCoords, excludePtKeys) {
  const horiz = Math.abs(u[1] - v[1]) < EPS;
  const vert = Math.abs(u[0] - v[0]) < EPS;
  if (!horiz && !vert) return false;
  const minx = Math.min(u[0], v[0]);
  const maxx = Math.max(u[0], v[0]);
  const miny = Math.min(u[1], v[1]);
  const maxy = Math.max(u[1], v[1]);
  for (const q of vertexCoords) {
    const qk = ptKey(q);
    if (excludePtKeys?.has(qk)) continue;
    if (ptEq(q, u) || ptEq(q, v)) continue;
    if (horiz) {
      if (
        Math.abs(q[1] - u[1]) < EPS &&
        q[0] > minx + INTERIOR_TOL &&
        q[0] < maxx - INTERIOR_TOL
      ) {
        return true;
      }
    }
    if (vert) {
      if (
        Math.abs(q[0] - u[0]) < EPS &&
        q[1] > miny + INTERIOR_TOL &&
        q[1] < maxy - INTERIOR_TOL
      ) {
        return true;
      }
    }
  }
  return false;
}

function isConnectNode(node, pt) {
  if (node && typeof node === 'object') {
    if (node.node_type === 'connect') return true;
    const t = node.tags || {};
    if (node.connect_number != null && node.connect_number !== '') return true;
    if (t.connect_number != null && t.connect_number !== '') return true;
  }
  if (Array.isArray(pt) && pt.length > 2) {
    const props = pt[2] || {};
    const tags = props.tags || {};
    if (props.node_type === 'connect' || tags.node_type === 'connect') return true;
    if (props.connect_number != null && props.connect_number !== '') return true;
    if (tags.connect_number != null && tags.connect_number !== '') return true;
  }
  return false;
}

/** a→b→c 為同一直線之 HV 折線且 b 嚴格在 a、c 之間，則 b 為冗餘轉折 */
function isRedundantHVMiddle(a, b, c) {
  if (!isEdgeStrictHV(a, b) || !isEdgeStrictHV(b, c)) return false;
  if (Math.abs(a[1] - b[1]) < EPS && Math.abs(b[1] - c[1]) < EPS && Math.abs(a[1] - c[1]) < EPS) {
    const lo = Math.min(a[0], c[0]);
    const hi = Math.max(a[0], c[0]);
    return b[0] > lo + INTERIOR_TOL && b[0] < hi - INTERIOR_TOL;
  }
  if (Math.abs(a[0] - b[0]) < EPS && Math.abs(b[0] - c[0]) < EPS && Math.abs(a[0] - c[0]) < EPS) {
    const lo = Math.min(a[1], c[1]);
    const hi = Math.max(a[1], c[1]);
    return b[1] > lo + INTERIOR_TOL && b[1] < hi - INTERIOR_TOL;
  }
  return false;
}

/* ================================================================
 *  衝突檢查
 * ================================================================ */

function edgesOf(pts) {
  const e = [];
  for (let i = 0; i < pts.length - 1; i++) e.push([pts[i], pts[i + 1]]);
  return e;
}

function hasEdgeConflict(candEdges, others) {
  for (const [a, b] of candEdges) {
    for (const [c, d] of others) {
      if (segCross(a, b, c, d)) return true;
      if (segOverlap(a, b, c, d)) return true;
    }
  }
  return false;
}

function hasPointOverlap(midPts, occupied) {
  for (const p of midPts) {
    if (occupied.has(ptKey(p))) return true;
  }
  return false;
}

function hasSelfOverlap(midPts) {
  const seen = new Set();
  for (const p of midPts) {
    const k = ptKey(p);
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

function hasSelfCross(pts) {
  const edges = edgesOf(pts);
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 2; j < edges.length; j++) {
      if (segCross(edges[i][0], edges[i][1], edges[j][0], edges[j][1])) return true;
      if (segOverlap(edges[i][0], edges[i][1], edges[j][0], edges[j][1])) return true;
    }
  }
  return false;
}

/* ================================================================
 *  候選路徑產生
 * ================================================================ */

function buildLShapes(A, B) {
  const out = [];
  const m1 = rndPt([B[0], A[1]]);
  if (!ptEq(m1, A) && !ptEq(m1, B))
    out.push({ mid: [m1], pts: [rndPt(A), m1, rndPt(B)] });
  const m2 = rndPt([A[0], B[1]]);
  if (!ptEq(m2, A) && !ptEq(m2, B))
    out.push({ mid: [m2], pts: [rndPt(A), m2, rndPt(B)] });
  return out;
}

function buildSawtooth(A, B, k) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const out = [];
  {
    const kx = Math.ceil((k + 1) / 2), ky = Math.floor((k + 1) / 2);
    const sx = kx > 0 ? dx / kx : 0, sy = ky > 0 ? dy / ky : 0;
    const pts = [rndPt(A)];
    let cx = A[0], cy = A[1];
    for (let i = 1; i <= k; i++) {
      if (i % 2 === 1) cx += sx; else cy += sy;
      pts.push(rndPt([cx, cy]));
    }
    pts.push(rndPt(B));
    out.push({ mid: pts.slice(1, -1), pts });
  }
  {
    const ky = Math.ceil((k + 1) / 2), kx = Math.floor((k + 1) / 2);
    const sx = kx > 0 ? dx / kx : 0, sy = ky > 0 ? dy / ky : 0;
    const pts = [rndPt(A)];
    let cx = A[0], cy = A[1];
    for (let i = 1; i <= k; i++) {
      if (i % 2 === 1) cy += sy; else cx += sx;
      pts.push(rndPt([cx, cy]));
    }
    pts.push(rndPt(B));
    out.push({ mid: pts.slice(1, -1), pts });
  }
  return out;
}

function isValidCandidate(c, otherEdges, occupied, vertexCoords) {
  if (hasSelfOverlap(c.mid)) return false;
  if (hasSelfCross(c.pts)) return false;
  if (hasPointOverlap(c.mid, occupied)) return false;
  const es = edgesOf(c.pts);
  for (const [u, v] of es) {
    if (!isEdgeStrictHV(u, v)) return false;
  }
  if (hasEdgeConflict(es, otherEdges)) return false;
  for (const [u, v] of es) {
    if (hvEdgeHitsInteriorVertex(u, v, vertexCoords)) return false;
  }
  return true;
}

function scoreCandidate(c) {
  /** 轉折數＝內點個數；次佳為總曼哈頓長度（越短越好） */
  const mids = c.mid?.length ?? 0;
  let manh = 0;
  const pts = c.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    manh += Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
  }
  return mids * 1e9 + manh;
}

function pickBetter(a, b) {
  if (!a) return b;
  if (!b) return a;
  const sa = scoreCandidate(a);
  const sb = scoreCandidate(b);
  return sb < sa ? b : a;
}

function findBestHVWithSawCap(A, B, otherEdges, occupied, vertexCoords, maxKSaw) {
  let best = null;
  for (const c of buildLShapes(A, B)) {
    if (isValidCandidate(c, otherEdges, occupied, vertexCoords)) best = pickBetter(best, c);
  }
  if (best) return best;

  for (let k = 2; k <= maxKSaw; k++) {
    for (const c of buildSawtooth(A, B, k)) {
      if (isValidCandidate(c, otherEdges, occupied, vertexCoords)) best = pickBetter(best, c);
    }
    if (best) return best;
  }
  return null;
}

function findBestHV(A, B, otherEdges, occupied, vertexCoords) {
  const step = 10 ** (-_dec);
  const adx = Math.abs(B[0] - A[0]);
  const ady = Math.abs(B[1] - A[1]);
  /** 第一階：較小 maxK，偏好少矩齒 */
  const maxK1 = Math.min(
    20,
    Math.max(2, Math.ceil(Math.max(adx, ady) / step / 2) + 2),
  );
  let best = findBestHVWithSawCap(A, B, otherEdges, occupied, vertexCoords, maxK1);
  if (best) return best;
  /** 第二階：加大深度，仍只接受嚴格 HV，以消滅剩餘對角線 */
  const maxK2 = Math.min(
    220,
    Math.max(maxK1 + 1, Math.ceil((adx + ady) / step) + 6),
  );
  return findBestHVWithSawCap(A, B, otherEdges, occupied, vertexCoords, maxK2);
}

/**
 * 合併共線上多餘的 line 頂點（不刪 connect），並維持無交叉／無重疊／線不穿點
 */
function simplifyRedundantHVVertices(allSegs) {
  let progress = true;
  let guard = 0;
  while (progress && guard++ < 5000) {
    progress = false;
    outer: for (let si = 0; si < allSegs.length; si++) {
      const seg = allSegs[si];
      if (!Array.isArray(seg.points) || seg.points.length < 3) continue;
      for (let i = 1; i < seg.points.length - 1; i++) {
        if (isConnectNode(seg.nodes?.[i], seg.points[i])) continue;
        const a = rndPt(toCoord(seg.points[i - 1]));
        const b = rndPt(toCoord(seg.points[i]));
        const c = rndPt(toCoord(seg.points[i + 1]));
        if (!isRedundantHVMiddle(a, b, c)) continue;

        const others = [];
        for (let sj = 0; sj < allSegs.length; sj++) {
          const p = allSegs[sj].points;
          if (!Array.isArray(p) || p.length < 2) continue;
          for (let pj = 0; pj < p.length - 1; pj++) {
            if (sj === si && (pj === i - 1 || pj === i)) continue;
            others.push([rndPt(toCoord(p[pj])), rndPt(toCoord(p[pj + 1]))]);
          }
        }
        if (hasEdgeConflict([[a, c]], others)) continue;

        const vtx = collectAllVertexCoordsRounded(allSegs);
        const excludeB = new Set([ptKey(b)]);
        if (hvEdgeHitsInteriorVertexExcept(a, c, vtx, excludeB)) continue;

        seg.points.splice(i, 1);
        if (Array.isArray(seg.nodes)) seg.nodes.splice(i, 1);
        progress = true;
        break outer;
      }
    }
  }
}

/* ================================================================
 *  segment 建構
 * ================================================================ */

function buildAllSegs(data) {
  const out = [];
  if (!Array.isArray(data) || data.length === 0) return out;
  const nested = data[0]?.route_name && Array.isArray(data[0]?.segments);
  if (nested) {
    data.forEach((r) =>
      (r.segments || []).forEach((s) => {
        s._routeName = r.route_name ?? r.name ?? 'Unknown';
        out.push(s);
      }),
    );
  } else {
    data.forEach((s) => {
      s._routeName = s.route_name ?? s.name ?? 'Unknown';
      out.push(s);
    });
  }
  return out;
}

function spliceHV(seg, pi, midPts) {
  const pts = seg.points;
  seg.points = [
    ...pts.slice(0, pi + 1),
    ...midPts.map(rndPt),
    ...pts.slice(pi + 1),
  ];
  if (Array.isArray(seg.nodes)) {
    const nd = seg.nodes;
    seg.nodes = [
      ...nd.slice(0, pi + 1),
      ...midPts.map(() => ({ node_type: 'line' })),
      ...nd.slice(pi + 1),
    ];
  }
}

/* ================================================================
 *  匯出：計數 / 全部轉換
 * ================================================================ */

/**
 * 計算剩餘對角線邊數
 * @param {Array} data - spaceNetworkGridJsonData
 * @returns {number}
 */
export function countE3DiagonalEdges(data) {
  const allSegs = buildAllSegs(data);
  let count = 0;
  for (const seg of allSegs) {
    if (!Array.isArray(seg.points) || seg.points.length < 2) continue;
    for (let i = 0; i < seg.points.length - 1; i++) {
      if (isDiag(toCoord(seg.points[i]), toCoord(seg.points[i + 1]))) count++;
    }
  }
  return count;
}

/**
 * 就地把 taipei_e3 所有對角線邊轉為水平垂直路徑。
 *
 * 保證：拓樸不變、無新交叉、無新重疊、無紅藍點或轉折點重合；路徑邊皆為嚴格水平或垂直。
 *
 * @param {Array} data - spaceNetworkGridJsonData
 * @param {{ coordDecimals?: number }} [options] 預設 coordDecimals=1（小數一位）
 * @returns {{ converted: number, failed: number }}
 */
export function applyHVToE3SpaceNetwork(data, options = {}) {
  const prev = _dec;
  _dec = options.coordDecimals ?? 1;
  try {
    const allSegs = buildAllSegs(data);
    if (allSegs.length === 0) return { converted: 0, failed: 0 };

    let converted = 0;

    for (let pass = 0; pass < 5; pass++) {
      let passOk = 0;

      for (let si = 0; si < allSegs.length; si++) {
        const seg = allSegs[si];
        if (!Array.isArray(seg.points) || seg.points.length < 2) continue;

        let pi = 0;
        while (pi < seg.points.length - 1) {
          const A = toCoord(seg.points[pi]);
          const B = toCoord(seg.points[pi + 1]);

          if (!isDiag(A, B)) { pi++; continue; }

          const others = collectEdgesExcept(allSegs, si, pi);
          const occ = collectOccupiedPts(allSegs);
          const vtx = collectAllVertexCoordsRounded(allSegs);
          const best = findBestHV(A, B, others, occ, vtx);

          if (best) {
            spliceHV(seg, pi, best.mid);
            pi += best.mid.length + 1;
            converted++;
            passOk++;
          } else {
            pi++;
          }
        }
      }

      if (passOk === 0) break;
    }

    simplifyRedundantHVVertices(allSegs);

    let failed = 0;
    for (const seg of allSegs) {
      if (!Array.isArray(seg.points)) continue;
      for (let i = 0; i < seg.points.length - 1; i++) {
        if (isDiag(toCoord(seg.points[i]), toCoord(seg.points[i + 1]))) failed++;
      }
    }

    return { converted, failed };
  } finally {
    _dec = prev;
  }
}
