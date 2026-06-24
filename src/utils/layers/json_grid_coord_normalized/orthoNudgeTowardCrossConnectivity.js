/**
 * 「朝紅十字縮進」候選頂點：以路網連通度限定「一起判斷／位移」的批次。
 *
 * **邊：** ① 同一 flat segment 上相鄰 `pi`～`pi+1`；② 四捨五入網格同格之多頂點（轉乘／共點）。
 * 在給定的候選集合 *Universe* 內取含錨點之連通分量，可避免「同一橫／直帶／重疊表列」含兩條互不連線的折線時被一併平移，
 * 同時仍能讓轉乘格上不同 segment 一起走（經由同格邊相連）。
 */

import { buildOrthoCellGroups } from './axisAlignGridNetworkHillClimb.js';

function refKey(si, pi) {
  return `${Math.round(Number(si))},${Math.round(Number(pi))}`;
}

function parseKey(k) {
  const [si, pi] = String(k).split(',').map(Number);
  return { si: Math.round(si), pi: Math.round(pi) };
}

function dedupeRefList(list) {
  const seen = new Set();
  const out = [];
  for (const r of list ?? []) {
    if (r == null || !Number.isFinite(Number(r.si)) || !Number.isFinite(Number(r.pi))) continue;
    const k = refKey(r.si, r.pi);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ si: Math.round(Number(r.si)), pi: Math.round(Number(r.pi)) });
  }
  return out;
}

function segmentRouteNeedle(seg, needle) {
  const s = String(seg?.route_name ?? seg?.name ?? '').trim();
  const n = String(needle ?? '').trim();
  if (!s || !n) return false;
  return s === n || s.includes(n) || n.includes(s);
}

/**
 * @param {Array<object>} segments — flat segments
 * @returns {Map<string, Set<string>>}
 */
export function buildOrthoVertexAdjacencyMap(segments) {
  const adj = new Map();

  /** @param {string} k */
  function ensure(k) {
    if (!adj.has(k)) adj.set(k, new Set());
    return adj.get(k);
  }

  function link(k1, k2) {
    if (k1 === k2 || !k1 || !k2) return;
    ensure(k1).add(k2);
    ensure(k2).add(k1);
  }

  if (!Array.isArray(segments)) return adj;

  for (let si = 0; si < segments.length; si++) {
    const pts = segments[si]?.points;
    if (!Array.isArray(pts)) continue;
    for (let pi = 0; pi < pts.length - 1; pi++) {
      link(refKey(si, pi), refKey(si, pi + 1));
    }
  }

  const gm = buildOrthoCellGroups(segments);
  for (const grp of gm.values()) {
    if (!Array.isArray(grp) || grp.length < 2) continue;
    const keys = grp.map((g) => refKey(g.si, g.pi));
    for (const k of keys) ensure(k);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) link(keys[i], keys[j]);
    }
  }

  return adj;
}


/**
 * @param {Array<object>} segments
 * @param {Array<{si:number, pi:number}>} candidates
 * @param {string|undefined|null} routeLabel — 控制台表列 `routeName`，優先據此選錨段
 */
export function orthoRefsAnchoredConnectivityComponent(segments, candidates, routeLabel) {
  const list = dedupeRefList(candidates);
  if (!list.length) return [];

  list.sort((a, b) => a.si - b.si || a.pi - b.pi);
  let anchor = list[0];
  const need = routeLabel != null ? String(routeLabel).trim() : '';
  if (need) {
    const exact = list.find((r) => {
      const s = String(segments[r.si]?.route_name ?? segments[r.si]?.name ?? '').trim();
      return s === need;
    });
    if (exact) anchor = exact;
    else {
      const loose = list.find((r) => segmentRouteNeedle(segments[r.si], need));
      if (loose) anchor = loose;
    }
  }

  const anchorKey = refKey(anchor.si, anchor.pi);
  const universe = new Set(list.map((r) => refKey(r.si, r.pi)));

  const adj = buildOrthoVertexAdjacencyMap(segments);
  const visited = new Set();
  /** @type {string[]} */
  const stack = [anchorKey];
  visited.add(anchorKey);
  while (stack.length) {
    const cur = stack.pop();
    const nbrs = adj.get(cur);
    if (!nbrs) continue;
    for (const nb of nbrs) {
      if (!universe.has(nb)) continue;
      if (visited.has(nb)) continue;
      visited.add(nb);
      stack.push(nb);
    }
  }

  const out = [];
  for (const k of visited) {
    const { si, pi } = parseKey(k);
    if (segments?.[si]?.points?.[pi] != null) out.push({ si, pi });
  }
  out.sort((a, b) => a.si - b.si || a.pi - b.pi);
  return out;
}

/**
 * 單一 ortho run（一段折線上的 pi 區間）之頂點 ref，展開至同格共點（與
 * `refsFromOrthoVertexRuns` 單段語意一致）。
 * @returns {Set<string>} `refKey(si,pi)`
 */
function expandOrthoRunRefsToKeySet(segments, segIdx, piLo, piHi) {
  const out = new Set();
  const si = Math.round(Number(segIdx));
  const lo = Math.min(Math.round(Number(piLo)), Math.round(Number(piHi)));
  const hi = Math.max(Math.round(Number(piLo)), Math.round(Number(piHi)));
  if (!Number.isFinite(si) || !Number.isFinite(lo) || !Number.isFinite(hi)) return out;
  const pts = segments[si]?.points;
  if (!Array.isArray(pts)) return out;
  const raw = [];
  for (let pi = lo; pi <= hi; pi++) {
    if (pts[pi] != null) raw.push({ si, pi });
  }
  const gm = buildOrthoCellGroups(segments);
  const seen = new Set();
  for (const r of raw) {
    const pt = segments[r.si]?.points?.[r.pi];
    if (!pt) continue;
    const x = Array.isArray(pt) ? Math.round(Number(pt[0])) : Math.round(Number(pt?.x));
    const y = Array.isArray(pt) ? Math.round(Number(pt[1])) : Math.round(Number(pt?.y));
    for (const cp of gm.get(`${x},${y}`) ?? []) {
      const k = refKey(cp.si, cp.pi);
      if (seen.has(k)) continue;
      seen.add(k);
      out.add(k);
    }
  }
  return out;
}

/**
 * 合併橫／直區間時 `overlaps` 可能含多條幾何上同帶、但路網上互不相連的線。
 * 在 **∪ 各 overlap 展開頂點** 所導出的子圖上算連通分量並分群，讓控制台／佇列可拆成多筆，
 * 否則錨點會永遠落在第一條的連通塊，其餘段永遠輪不到位移。
 *
 * @param {Array<object>} segments — flat segments
 * @param {Array<{ segIdx:number, startPtIdx:number, endPtIdx:number }>} overlaps
 * @returns {Array<Array<object>>} 每群為 overlaps 子陣列，順序依原 `overlaps` 排序
 */
export function clusterOrthoOverlapsForMergedBand(segments, overlaps) {
  if (!Array.isArray(overlaps) || !overlaps.length) return [];
  if (overlaps.length === 1) return [[overlaps[0]]];

  const expandedSets = overlaps.map((o) => {
    const pi0 = Math.min(Number(o.startPtIdx), Number(o.endPtIdx));
    const pi1 = Math.max(Number(o.startPtIdx), Number(o.endPtIdx));
    return expandOrthoRunRefsToKeySet(segments, o.segIdx, pi0, pi1);
  });

  const U = new Set();
  for (const s of expandedSets) {
    for (const k of s) U.add(k);
  }

  const adj = buildOrthoVertexAdjacencyMap(segments);
  const compOf = new Map();
  let compId = 0;
  for (const start of U) {
    if (compOf.has(start)) continue;
    const id = compId++;
    const stack = [start];
    compOf.set(start, id);
    while (stack.length) {
      const cur = stack.pop();
      const nbrs = adj.get(cur);
      if (!nbrs) continue;
      for (const nb of nbrs) {
        if (!U.has(nb)) continue;
        if (compOf.has(nb)) continue;
        compOf.set(nb, id);
        stack.push(nb);
      }
    }
  }

  let singletonKey = 1_000_000_000;
  const groupIdForOverlap = (i) => {
    const s = expandedSets[i];
    if (!s.size) return singletonKey++;
    const first = [...s].sort()[0];
    return compOf.has(first) ? compOf.get(first) : singletonKey++;
  };

  const buckets = new Map();
  for (let i = 0; i < overlaps.length; i++) {
    const gid = groupIdForOverlap(i);
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid).push(i);
  }

  const clustersOfIdx = [...buckets.values()].sort((a, b) => Math.min(...a) - Math.min(...b));
  return clustersOfIdx.map((idxs) => {
    const ord = [...idxs].sort((a, b) => a - b);
    return ord.map((j) => overlaps[j]);
  });
}
