/* eslint-disable no-console */

/**
 * K3Tab flat segments：黑點合併（與 runTaipeiB4／B5PipelineFromK3Routes 之 zeroWeightMerge 分支相同語意）。
 * intra：同一路段上相鄰兩段 station_weights 於共點（非 connect）若 |Δweight| <= 門檻則合併；
 * inter：同路線相鄰切段在接點兩側若 |Δweight| <= 門檻則合併。
 */

import { mergeTwoTaipeiFSegmentsSameRoute } from '@/utils/randomConnectSegmentWeights.js';

function deepCloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeMergeMaxWeightDiff(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 10;
  return n;
}

function canMergeByWeightDiff(a, b, maxWeightDiff) {
  const wa = Number(a);
  const wb = Number(b);
  if (!Number.isFinite(wa) || !Number.isFinite(wb)) return false;
  return Math.abs(wa - wb) <= maxWeightDiff;
}

function maxWeightInSegment(seg) {
  const sw = Array.isArray(seg?.station_weights) ? seg.station_weights : [];
  let best = -Infinity;
  for (const w of sw) {
    const n = Number(w?.weight);
    if (Number.isFinite(n) && n > best) best = n;
  }
  if (Number.isFinite(best)) return best;
  const nav = Number(seg?.nav_weight);
  if (Number.isFinite(nav)) return nav;
  return 0;
}

export function gridKeyFromPoint(pt) {
  if (pt == null) return null;
  const x = Array.isArray(pt) ? pt[0] : pt?.x;
  const y = Array.isArray(pt) ? pt[1] : pt?.y;
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  return `${Math.round(Number(x))},${Math.round(Number(y))}`;
}

/** 判斷 seg 中第 idx 個節點是否為 connect（紅／藍端點）而非黑點 */
export function isConnectNode(seg, idx) {
  const nodes = seg.nodes || [];
  const node = nodes[idx];
  const pts = seg.points || [];
  const pt = pts[idx];
  const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : (pt?.props ?? {});
  const tags = ptProps?.tags || node?.tags || {};
  const cn =
    node?.connect_number ??
    tags?.connect_number ??
    ptProps?.connect_number ??
    ptProps?.tags?.connect_number;
  const nodeType =
    node?.node_type ||
    ptProps?.node_type ||
    tags?.node_type ||
    (cn != null && cn !== '' ? 'connect' : '');
  return nodeType === 'connect' || (cn != null && cn !== '');
}

/** 零權重合併頂點：不再當黑點／切段點，並自 Section／Station 推導時略過 */
function stripOneMergedBlackVertex(obj) {
  if (!obj || typeof obj !== 'object') return;
  obj.display = false;
  if (obj.tags && typeof obj.tags === 'object') {
    delete obj.tags._forceDrawBlackDot;
    obj.tags._mergedHiddenBlackDot = true;
  }
  obj.station_name = '';
  obj.station_id = '';
  if (obj.tags && typeof obj.tags === 'object') {
    obj.tags.station_name = '';
    obj.tags.name = '';
    obj.tags.station_id = '';
  }
}

function stripMergedBlackStationsFromSegments(segs) {
  if (!Array.isArray(segs)) return;
  for (const seg of segs) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    const n = pts.length;
    for (let j = 0; j < n; j++) {
      const node = nodes[j];
      if (!node || typeof node !== 'object' || node.display !== false) continue;
      stripOneMergedBlackVertex(node);
      const pt = pts[j];
      if (Array.isArray(pt) && pt.length > 2 && pt[2] && typeof pt[2] === 'object') {
        stripOneMergedBlackVertex(pt[2]);
      }
    }
  }
}

/** connect 資訊（供 removedZeroWeightBlackDots） */
function connectInfoFromEndpoint(seg, isStart) {
  const pts = seg.points || [];
  const nodes = seg.nodes || [];
  const idx = isStart ? 0 : pts.length - 1;
  const pt = pts[idx];
  const x = Array.isArray(pt) ? pt[0] : pt?.x;
  const y = Array.isArray(pt) ? pt[1] : pt?.y;
  const propsKey = isStart ? 'properties_start' : 'properties_end';
  const props = seg[propsKey] || nodes[idx] || {};
  return {
    x_grid: x != null ? Number(x) : null,
    y_grid: y != null ? Number(y) : null,
    connect_number: props.connect_number ?? props.tags?.connect_number ?? null,
    station_id: props.station_id ?? props.tags?.station_id ?? null,
    station_name: props.station_name ?? props.tags?.station_name ?? props.tags?.name ?? null,
  };
}

export function applyRemovedBlackDotsToMapDrawnRows(rows, removedBlackDots) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(removedBlackDots)) return rows;

  const hiddenByRouteCoord = new Set();
  for (const item of removedBlackDots) {
    const routeName = String(item?.route_name ?? '').trim();
    const x = Number(item?.x_grid);
    const y = Number(item?.y_grid);
    if (!routeName || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    hiddenByRouteCoord.add(`${routeName}|${gridKeyFromPoint([x, y])}`);
  }
  if (hiddenByRouteCoord.size === 0) return rows;

  for (const row of rows) {
    const routeName = String(row?.routeName ?? '').trim();
    const stations = Array.isArray(row?.segment?.stations) ? row.segment.stations : null;
    if (!routeName || !stations?.length) continue;
    for (const st of stations) {
      const x = Number(st?.x_grid ?? st?.tags?.x_grid);
      const y = Number(st?.y_grid ?? st?.tags?.y_grid);
      const coordKey = gridKeyFromPoint([x, y]);
      if (!coordKey) continue;
      if (!hiddenByRouteCoord.has(`${routeName}|${coordKey}`)) continue;
      st.display = false;
      st.tags = st.tags && typeof st.tags === 'object' ? { ...st.tags } : {};
      st.tags.display = false;
      st.tags._mergedHiddenBlackDot = true;
    }
  }

  return rows;
}

function mergeIntraZeroWeightPairs(seg, maxWeightDiff) {
  const removed = [];
  const nodes = seg.nodes || [];
  const nNodes = nodes.length;

  let changed = true;
  while (changed) {
    changed = false;
    const sw = Array.isArray(seg.station_weights)
      ? seg.station_weights
          .filter((w) => w && Number.isFinite(Number(w.weight)))
          .slice()
          .sort((a, b) => (Number(a.start_idx) || 0) - (Number(b.start_idx) || 0))
      : [];

    for (let i = 0; i < sw.length - 1; i++) {
      const w1 = sw[i];
      const w2 = sw[i + 1];
      const j = Number.isFinite(w1.end_idx) ? w1.end_idx : null;
      const j2 = Number.isFinite(w2.start_idx) ? w2.start_idx : null;
      if (j == null || j2 == null || j !== j2) continue;
      if (isConnectNode(seg, j)) continue;
      if (!canMergeByWeightDiff(w1.weight, w2.weight, maxWeightDiff)) continue;

      const pt = (seg.points || [])[j];
      const x = Array.isArray(pt) ? pt[0] : pt?.x;
      const y = Array.isArray(pt) ? pt[1] : pt?.y;
      removed.push({
        merge_type: 'intra',
        route_name: String(seg.route_name ?? seg.name ?? ''),
        x_grid: x != null ? Number(x) : null,
        y_grid: y != null ? Number(y) : null,
        connect_red: connectInfoFromEndpoint(seg, true),
        connect_blue: connectInfoFromEndpoint(seg, false),
      });

      const jNode = nodes[j];
      if (jNode && typeof jNode === 'object') {
        jNode.display = false;
      }

      const mergedWeight = Math.max(Number(w1.weight) || 0, Number(w2.weight) || 0);
      const merged = {
        start_idx: Number.isFinite(w1.start_idx) ? w1.start_idx : 0,
        end_idx: Number.isFinite(w2.end_idx) ? w2.end_idx : Math.max(0, nNodes - 1),
        weight: mergedWeight,
      };
      seg.station_weights = [
        ...seg.station_weights.filter((w) => w !== w1 && w !== w2),
        merged,
      ].sort((a, b) => (Number(a.start_idx) || 0) - (Number(b.start_idx) || 0));

      changed = true;
      break;
    }
  }
  return removed;
}

function mergeInterZeroWeightPairs(segs, removedOut, maxWeightDiff) {
  let changed = true;
  while (changed) {
    changed = false;

    const byRoute = new Map();
    for (let i = 0; i < segs.length; i++) {
      const rn = String(segs[i].route_name ?? segs[i].name ?? '');
      if (!byRoute.has(rn)) byRoute.set(rn, []);
      byRoute.get(rn).push(i);
    }

    let mergeTarget = null;
    outer: for (const [, indices] of byRoute) {
      for (let i = 0; i < indices.length - 1; i++) {
        const ia = indices[i];
        const ib = indices[i + 1];
        const segA = segs[ia];
        const segB = segs[ib];
        if (!segA || !segB) continue;

        const ptsA = segA.points || [];
        const ptsB = segB.points || [];
        if (ptsA.length < 2 || ptsB.length < 2) continue;

        const na = ptsA.length;

        const gA = gridKeyFromPoint(ptsA[na - 1]);
        const gB = gridKeyFromPoint(ptsB[0]);
        if (!gA || !gB || gA !== gB) continue;

        if (isConnectNode(segA, na - 1)) continue;

        const swA = Array.isArray(segA.station_weights) ? segA.station_weights : [];
        const swB = Array.isArray(segB.station_weights) ? segB.station_weights : [];
        if (swA.length === 0 || swB.length === 0) continue;

        const lastWA = swA
          .filter((w) => w && Number.isFinite(Number(w.weight)))
          .sort((a, b) => (Number(b.end_idx) || 0) - (Number(a.end_idx) || 0))[0];
        const firstWB = swB
          .filter((w) => w && Number.isFinite(Number(w.weight)))
          .sort((a, b) => (Number(a.start_idx) || 0) - (Number(b.start_idx) || 0))[0];

        if (!lastWA || !firstWB) continue;
        if (!canMergeByWeightDiff(lastWA.weight, firstWB.weight, maxWeightDiff)) continue;

        mergeTarget = { ia, ib };
        break outer;
      }
    }

    if (!mergeTarget) break;

    const { ia, ib } = mergeTarget;
    const segA = segs[ia];
    const segB = segs[ib];
    const ptsA = segA.points || [];
    const na = ptsA.length;

    const jPt = ptsA[na - 1];
    const jx = Array.isArray(jPt) ? jPt[0] : jPt?.x;
    const jy = Array.isArray(jPt) ? jPt[1] : jPt?.y;
    removedOut.push({
      merge_type: 'inter',
      route_name: String(segA.route_name ?? segA.name ?? ''),
      x_grid: jx != null ? Number(jx) : null,
      y_grid: jy != null ? Number(jy) : null,
      connect_red: connectInfoFromEndpoint(segA, true),
      connect_blue: connectInfoFromEndpoint(segB, false),
    });

    const nodesA = segA.nodes || [];
    if (nodesA[na - 1] && typeof nodesA[na - 1] === 'object') {
      nodesA[na - 1].display = false;
    }

    const mergedSeg = mergeTwoTaipeiFSegmentsSameRoute(
      deepCloneJson(segA),
      deepCloneJson(segB),
      0,
      {}
    );
    if (!mergedSeg) {
      console.warn('taipeiK3TabZeroWeightBlackMerge：inter 合併失敗', ia, ib);
      break;
    }

    const mergedWeight = Math.max(maxWeightInSegment(segA), maxWeightInSegment(segB));
    const nMergedPts = Array.isArray(mergedSeg.points) ? mergedSeg.points.length : 0;
    if (nMergedPts >= 2) {
      mergedSeg.station_weights = [{ start_idx: 0, end_idx: nMergedPts - 1, weight: mergedWeight }];
    }
    if (mergedSeg.nav_weight != null) {
      mergedSeg.nav_weight = mergedWeight;
    }

    segs[ia] = mergedSeg;
    segs.splice(ib, 1);
    changed = true;
  }
}

/**
 * 就地修改 `segs`：intra＋inter 黑點合併（|Δweight| <= 門檻），並清除合併頂點之站名／強制黑點標記。
 * @param {Array<object>} segs normalizeSpaceNetworkDataToFlatSegments 之輸出
 * @param {{ maxWeightDiff?: number }} [options]
 * @returns {Array<object>} removedBlackDots（供 mapDrawnRoutes 同步 display）
 */
export function applyZeroWeightBlackMergeToFlatSegments(segs, options = {}) {
  if (!Array.isArray(segs)) return [];
  const maxWeightDiff = normalizeMergeMaxWeightDiff(options.maxWeightDiff);
  const removedBlackDots = [];
  for (const seg of segs) {
    removedBlackDots.push(...mergeIntraZeroWeightPairs(seg, maxWeightDiff));
  }
  mergeInterZeroWeightPairs(segs, removedBlackDots, maxWeightDiff);
  stripMergedBlackStationsFromSegments(segs);
  return removedBlackDots;
}
