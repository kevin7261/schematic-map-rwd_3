/**
 * taipei_f 空間網路：依「欄 x」逐步高亮——僅考慮垂直線段；
 * 水平線不參與相連判斷，也不會被高亮。相連＝垂直邊共用網格點（可跨路線）。
 */

import {
  buildConnectIncidentSectionCount,
  connectEndpointDedupeKey,
} from '@/utils/sectionRouteConnectEndpoints.js';

function roundCoord(p) {
  if (Array.isArray(p)) {
    return [Math.round(Number(p[0])), Math.round(Number(p[1]))];
  }
  return [Math.round(Number(p.x)), Math.round(Number(p.y))];
}

/** 垂直邊在整數格點上的 key 集合（含端點間所有 y） */
function verticalEdgeGridKeys(x, y0, y1) {
  const set = new Set();
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  for (let y = lo; y <= hi; y++) set.add(`${x},${y}`);
  return set;
}

/**
 * 從路段折線取出僅「垂直」的邊（相鄰兩頂點四捨五入後同 x、不同 y）。
 * @returns {Array<{ x: number, coords: [[number,number],[number,number]], keys: Set<string> }>}
 */
export function extractVerticalEdgesFromSegment(seg) {
  const pts = seg?.points;
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const edges = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = roundCoord(pts[i - 1]);
    const [x1, y1] = roundCoord(pts[i]);
    if (x0 === x1 && y0 !== y1) {
      const yLo = Math.min(y0, y1);
      const yHi = Math.max(y0, y1);
      edges.push({
        x: x0,
        coords: [
          [x0, yLo],
          [x0, yHi],
        ],
        keys: verticalEdgeGridKeys(x0, y0, y1),
      });
    }
  }
  return edges;
}

/** 水平邊在整數格點上的 key 集合（含端點間所有 x） */
function horizontalEdgeGridKeys(y, x0, x1) {
  const set = new Set();
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  for (let x = lo; x <= hi; x++) set.add(`${x},${y}`);
  return set;
}

/**
 * 從路段折線取出僅「水平」的邊（相鄰兩頂點四捨五入後同 y、不同 x）。
 * @returns {Array<{ y: number, coords: [[number,number],[number,number]], keys: Set<string> }>}
 */
export function extractHorizontalEdgesFromSegment(seg) {
  const pts = seg?.points;
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const edges = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = roundCoord(pts[i - 1]);
    const [x1, y1] = roundCoord(pts[i]);
    if (y0 === y1 && x0 !== x1) {
      const xLo = Math.min(x0, x1);
      const xHi = Math.max(x0, x1);
      edges.push({
        y: y0,
        coords: [
          [xLo, y0],
          [xHi, y0],
        ],
        keys: horizontalEdgeGridKeys(y0, x0, x1),
      });
    }
  }
  return edges;
}

export function getFlatSegmentsFromLayer(layer) {
  const segments = layer?.spaceNetworkGridJsonData;
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const merged = segments[0].route_name != null && Array.isArray(segments[0].segments);
  if (merged) {
    const out = [];
    segments.forEach((route) => {
      const routeColor = route.color || '#555555';
      (route.segments || []).forEach((seg) => {
        out.push({
          ...seg,
          route_name: route.route_name,
          route_color: routeColor,
          original_props: route.original_props,
        });
      });
    });
    return out;
  }
  return segments;
}

/**
 * @param {Array} flatSegments
 * @returns {Array<{
 *   gridX: number,
 *   componentIndex: number,
 *   segmentIndices: number[],
 *   verticalPaths: Array<[[number,number],[number,number]]>,
 *   verticalPathSegIndices: number[],
 * }>}
 */
export function buildTaipeiFColHighlightPlan(flatSegments) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return [];

  /** @type {Array<{ segIdx: number, edge: ReturnType<typeof extractVerticalEdgesFromSegment>[0] }>} */
  const allEdges = [];
  flatSegments.forEach((seg, segIdx) => {
    extractVerticalEdgesFromSegment(seg).forEach((edge) => {
      allEdges.push({ segIdx, edge });
    });
  });

  if (allEdges.length === 0) return [];

  let maxX = 0;
  for (const { edge } of allEdges) {
    if (edge.x > maxX) maxX = edge.x;
  }

  const plan = [];
  for (let gridX = 0; gridX <= maxX; gridX++) {
    const touchingIdx = [];
    for (let ei = 0; ei < allEdges.length; ei++) {
      if (allEdges[ei].edge.x === gridX) touchingIdx.push(ei);
    }
    if (touchingIdx.length === 0) continue;

    const parent = Object.fromEntries(touchingIdx.map((i) => [i, i]));
    const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    for (let a = 0; a < touchingIdx.length; a++) {
      for (let b = a + 1; b < touchingIdx.length; b++) {
        const ia = touchingIdx[a];
        const ib = touchingIdx[b];
        const ka = allEdges[ia].edge.keys;
        const kb = allEdges[ib].edge.keys;
        let share = false;
        for (const k of ka) {
          if (kb.has(k)) {
            share = true;
            break;
          }
        }
        if (share) union(ia, ib);
      }
    }

    const compMap = new Map();
    for (const ei of touchingIdx) {
      const r = find(ei);
      if (!compMap.has(r)) compMap.set(r, []);
      compMap.get(r).push(ei);
    }

    const components = Array.from(compMap.values())
      .map((arr) => arr.sort((x, y) => x - y))
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));

    components.forEach((edgeIdxList, componentIndex) => {
      const segSet = new Set();
      const verticalPaths = [];
      const verticalPathSegIndices = [];
      for (const ei of edgeIdxList) {
        const { segIdx, edge } = allEdges[ei];
        segSet.add(segIdx);
        verticalPaths.push(edge.coords);
        verticalPathSegIndices.push(segIdx);
      }
      const segmentIndices = Array.from(segSet).sort((x, y) => x - y);
      plan.push({
        gridX,
        componentIndex,
        segmentIndices,
        verticalPaths,
        verticalPathSegIndices,
      });
    });
  }
  return plan;
}

/**
 * @param {Array} flatSegments
 * @returns {Array<{
 *   gridY: number,
 *   componentIndex: number,
 *   segmentIndices: number[],
 *   horizontalPaths: Array<[[number,number],[number,number]]>,
 *   horizontalPathSegIndices: number[],
 * }>}
 */
export function buildTaipeiFRowHighlightPlan(flatSegments) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return [];

  /** @type {Array<{ segIdx: number, edge: ReturnType<typeof extractHorizontalEdgesFromSegment>[0] }>} */
  const allEdges = [];
  flatSegments.forEach((seg, segIdx) => {
    extractHorizontalEdgesFromSegment(seg).forEach((edge) => {
      allEdges.push({ segIdx, edge });
    });
  });

  if (allEdges.length === 0) return [];

  let maxY = 0;
  for (const { edge } of allEdges) {
    if (edge.y > maxY) maxY = edge.y;
  }

  const plan = [];
  for (let gridY = 0; gridY <= maxY; gridY++) {
    const touchingIdx = [];
    for (let ei = 0; ei < allEdges.length; ei++) {
      if (allEdges[ei].edge.y === gridY) touchingIdx.push(ei);
    }
    if (touchingIdx.length === 0) continue;

    const parent = Object.fromEntries(touchingIdx.map((i) => [i, i]));
    const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    for (let a = 0; a < touchingIdx.length; a++) {
      for (let b = a + 1; b < touchingIdx.length; b++) {
        const ia = touchingIdx[a];
        const ib = touchingIdx[b];
        const ka = allEdges[ia].edge.keys;
        const kb = allEdges[ib].edge.keys;
        let share = false;
        for (const k of ka) {
          if (kb.has(k)) {
            share = true;
            break;
          }
        }
        if (share) union(ia, ib);
      }
    }

    const compMap = new Map();
    for (const ei of touchingIdx) {
      const r = find(ei);
      if (!compMap.has(r)) compMap.set(r, []);
      compMap.get(r).push(ei);
    }

    const components = Array.from(compMap.values())
      .map((arr) => arr.sort((x, y) => x - y))
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));

    components.forEach((edgeIdxList, componentIndex) => {
      const segSet = new Set();
      const horizontalPaths = [];
      const horizontalPathSegIndices = [];
      for (const ei of edgeIdxList) {
        const { segIdx, edge } = allEdges[ei];
        segSet.add(segIdx);
        horizontalPaths.push(edge.coords);
        horizontalPathSegIndices.push(segIdx);
      }
      const segmentIndices = Array.from(segSet).sort((x, y) => x - y);
      plan.push({
        gridY,
        componentIndex,
        segmentIndices,
        horizontalPaths,
        horizontalPathSegIndices,
      });
    });
  }
  return plan;
}

/**
 * 根據 SectionData incident 計數判定哪些 flat segment 含至少一個「hub 紅點」端點
 * (hub = 在 SectionData 中出現 ≥2 次的 connect)。
 * 含 hub 端點的 segment → 黑點向 hub 移動 → 用紅色高亮（set 內）；
 * 兩端皆非 hub → 黑點向中心移動 → 用綠色高亮（set 外）。
 */
export function buildSectionDataFlatSegmentIndexSet(layer) {
  const flat = getFlatSegmentsFromLayer(layer);
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const set = new Set();
  if (!Array.isArray(flat) || flat.length === 0 || !Array.isArray(sectionData)) return set;

  // 每個 connect 連到的「不同路線數」（同一路線不重複計）
  const routeSetMap = new Map();
  for (const sd of sectionData) {
    if (!sd) continue;
    const rn = String(sd.route_name ?? sd.route_hint ?? '').trim();
    const keys = new Set();
    for (const term of ['connect_start', 'connect_end']) {
      const c = sd[term];
      if (!c) continue;
      const cn = c.connect_number ?? c.tags?.connect_number;
      let dk;
      if (cn != null && String(cn).trim() !== '') {
        dk = `cn:${String(cn).trim()}`;
      } else {
        const x = c.x_grid ?? c.tags?.x_grid;
        const y = c.y_grid ?? c.tags?.y_grid;
        if (x != null && y != null) dk = `xy:${Math.round(Number(x))},${Math.round(Number(y))}`;
        else {
          const sid = c.station_id ?? c.tags?.station_id;
          if (sid != null && String(sid).trim() !== '') dk = `id:${String(sid).trim()}`;
        }
      }
      if (dk) keys.add(dk);
    }
    for (const k of keys) {
      if (!routeSetMap.has(k)) routeSetMap.set(k, new Set());
      if (rn) routeSetMap.get(k).add(rn);
    }
  }

  // 每個格點座標 → SectionData dedupe key
  const posToKey = new Map();
  for (const sd of sectionData) {
    if (!sd) continue;
    for (const term of ['connect_start', 'connect_end']) {
      const c = sd[term];
      if (!c) continue;
      const x = Math.round(Number(c.x_grid ?? c.tags?.x_grid));
      const y = Math.round(Number(c.y_grid ?? c.tags?.y_grid));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const cn = c.connect_number ?? c.tags?.connect_number;
      let dk;
      if (cn != null && String(cn).trim() !== '') dk = `cn:${String(cn).trim()}`;
      else dk = `xy:${x},${y}`;
      posToKey.set(`${x},${y}`, dk);
    }
  }

  const endpointPos = (p) => {
    const x = Math.round(Number(Array.isArray(p) ? p[0] : p.x));
    const y = Math.round(Number(Array.isArray(p) ? p[1] : p.y));
    return `${x},${y}`;
  };

  flat.forEach((seg, segIdx) => {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) return;
    const aKey = posToKey.get(endpointPos(pts[0]));
    const bKey = posToKey.get(endpointPos(pts[pts.length - 1]));
    const aInc = aKey ? routeSetMap.get(aKey)?.size || 0 : 0;
    const bInc = bKey ? routeSetMap.get(bKey)?.size || 0 : 0;
    // 至少一端為 hub（連到不同路線數 ≥2）→ 紅色
    if (aInc >= 2 || bInc >= 2) set.add(segIdx);
  });

  return set;
}

function gridCellKey(x, y) {
  return `${Math.round(Number(x))},${Math.round(Number(y))}`;
}

/** 將單一路段折線展開為格上單位水平／垂直邊（與 layer 鄰接圖一致） */
function expandSegmentToUnitEdges(seg, segIdx) {
  const pts = seg?.points;
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let [x1, y1] = roundCoord(pts[i]);
    let [x2, y2] = roundCoord(pts[i + 1]);
    if (y1 === y2) {
      const step = x2 >= x1 ? 1 : -1;
      for (let x = x1; x !== x2; x += step) {
        out.push({ a: gridCellKey(x, y1), b: gridCellKey(x + step, y1), segIdx });
      }
    } else if (x1 === x2) {
      const step = y2 >= y1 ? 1 : -1;
      for (let y = y1; y !== y2; y += step) {
        out.push({ a: gridCellKey(x1, y), b: gridCellKey(x1, y + step), segIdx });
      }
    }
  }
  return out;
}

function routeNameMatchesSectionData(sd, seg) {
  const sa = String(seg.route_name ?? seg.name ?? '').trim();
  const sb = String(sd.route_name ?? sd.route_hint ?? '').trim();
  if (!sa || !sb) return true;
  if (sa === sb) return true;
  if (sa.includes(sb) || sb.includes(sa)) return true;
  const strip = (t) => t.replace(/[（）()]/g, '');
  return strip(sa) === strip(sb);
}

function buildUndirectedAdjFromEdges(edgeList) {
  const adj = new Map();
  const add = (u, v) => {
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u).push(v);
    adj.get(v).push(u);
  };
  for (const e of edgeList) add(e.a, e.b);
  return adj;
}

function bfsDistFrom(startKey, adj) {
  const dist = new Map([[startKey, 0]]);
  const q = [startKey];
  while (q.length) {
    const k = q.shift();
    const d = dist.get(k);
    for (const nb of adj.get(k) || []) {
      if (!dist.has(nb)) {
        dist.set(nb, d + 1);
        q.push(nb);
      }
    }
  }
  return dist;
}

/** 所有落在某條最短路上的單位邊所屬之 flat segment 索引 */
function segIndicesOnShortestPaths(startKey, endKey, edgeList) {
  const adj = buildUndirectedAdjFromEdges(edgeList);
  const distA = bfsDistFrom(startKey, adj);
  if (!distA.has(endKey)) return new Set();
  const D = distA.get(endKey);
  const distB = bfsDistFrom(endKey, adj);
  const segSet = new Set();
  for (const e of edgeList) {
    const da = distA.get(e.a);
    const db = distA.get(e.b);
    const ba = distB.get(e.a);
    const bb = distB.get(e.b);
    if (da !== undefined && bb !== undefined && da + 1 + bb === D) segSet.add(e.segIdx);
    else if (db !== undefined && ba !== undefined && db + 1 + ba === D) segSet.add(e.segIdx);
  }
  return segSet;
}

/**
 * 與 listSectionRoutesBetweenConnects 同一套篩選之 SectionData 列；
 * 對每一筆在路網上取起迄紅點間最短路徑上的所有 flat segment（含 L 形多段），供地圖紅底 underlay。
 */
export function buildListedSectionDataFlatSegmentIndexSet(layer) {
  const flat = getFlatSegmentsFromLayer(layer);
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const out = new Set();
  if (!Array.isArray(flat) || flat.length === 0 || !Array.isArray(sectionData) || sectionData.length === 0) {
    return out;
  }
  const counts = buildConnectIncidentSectionCount(sectionData);

  for (const sd of sectionData) {
    if (!sd) continue;
    const s = sd.connect_start;
    const e = sd.connect_end;
    const sk = s ? connectEndpointDedupeKey(s) : 'invalid';
    const ek = e ? connectEndpointDedupeKey(e) : 'invalid';
    const sc = sk !== 'invalid' ? counts.get(sk) || 0 : 0;
    const ec = ek !== 'invalid' ? counts.get(ek) || 0 : 0;
    if (sc >= 2 && ec >= 2) continue;

    const sx = Math.round(Number(s?.x_grid ?? s?.tags?.x_grid));
    const sy = Math.round(Number(s?.y_grid ?? s?.tags?.y_grid));
    const ex = Math.round(Number(e?.x_grid ?? e?.tags?.x_grid));
    const ey = Math.round(Number(e?.y_grid ?? e?.tags?.y_grid));
    if (![sx, sy, ex, ey].every((v) => Number.isFinite(v))) continue;

    const startK = gridCellKey(sx, sy);
    const endK = gridCellKey(ex, ey);

    let edgeList = [];
    for (let si = 0; si < flat.length; si++) {
      if (!routeNameMatchesSectionData(sd, flat[si])) continue;
      edgeList.push(...expandSegmentToUnitEdges(flat[si], si));
    }
    let segSet = segIndicesOnShortestPaths(startK, endK, edgeList);
    if (segSet.size === 0) {
      edgeList = [];
      for (let si = 0; si < flat.length; si++) {
        edgeList.push(...expandSegmentToUnitEdges(flat[si], si));
      }
      segSet = segIndicesOnShortestPaths(startK, endK, edgeList);
    }
    for (const idx of segSet) out.add(idx);
  }

  return out;
}

/**
 * 單筆 SectionData（列入「紅點間路段」清單時）：起迄紅點間最短路徑上之所有格點 key。
 * 與 buildListedSectionRouteGridCellKeySet 同源；供位移邏輯對無 station_list 條目之端點格查 A/B／hub。
 */
export function gridCellKeysForListedSectionDataRow(layer, sd) {
  const flat = getFlatSegmentsFromLayer(layer);
  const out = new Set();
  if (!sd || !Array.isArray(flat) || flat.length === 0) return out;
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const counts = buildConnectIncidentSectionCount(sectionData || []);
  const s = sd.connect_start;
  const e = sd.connect_end;
  const sk = s ? connectEndpointDedupeKey(s) : 'invalid';
  const ek = e ? connectEndpointDedupeKey(e) : 'invalid';
  const sc = sk !== 'invalid' ? counts.get(sk) || 0 : 0;
  const ec = ek !== 'invalid' ? counts.get(ek) || 0 : 0;
  if (sc >= 2 && ec >= 2) return out;

  const sx = Math.round(Number(s?.x_grid ?? s?.tags?.x_grid));
  const sy = Math.round(Number(s?.y_grid ?? s?.tags?.y_grid));
  const ex = Math.round(Number(e?.x_grid ?? e?.tags?.x_grid));
  const ey = Math.round(Number(e?.y_grid ?? e?.tags?.y_grid));
  if (![sx, sy, ex, ey].every((v) => Number.isFinite(v))) return out;

  const startK = gridCellKey(sx, sy);
  const endK = gridCellKey(ex, ey);

  let edgeList = [];
  for (let si = 0; si < flat.length; si++) {
    if (!routeNameMatchesSectionData(sd, flat[si])) continue;
    edgeList.push(...expandSegmentToUnitEdges(flat[si], si));
  }
  let segSet = segIndicesOnShortestPaths(startK, endK, edgeList);
  if (segSet.size === 0) {
    edgeList = [];
    for (let si = 0; si < flat.length; si++) {
      edgeList.push(...expandSegmentToUnitEdges(flat[si], si));
    }
    segSet = segIndicesOnShortestPaths(startK, endK, edgeList);
  }
  for (const si of segSet) {
    addGridCellsFromSegmentPoints(flat[si]?.points, out);
  }
  return out;
}

/** 折線上所有整數格點（與 expandSegmentToUnitEdges 一致） */
function addGridCellsFromSegmentPoints(pts, cellSet) {
  if (!Array.isArray(pts) || pts.length < 2 || !cellSet) return;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = roundCoord(pts[i]);
    const [x2, y2] = roundCoord(pts[i + 1]);
    if (y1 === y2) {
      const step = x2 >= x1 ? 1 : -1;
      for (let x = x1; x !== x2; x += step) {
        cellSet.add(gridCellKey(x, y1));
        cellSet.add(gridCellKey(x + step, y1));
      }
    } else if (x1 === x2) {
      const step = y2 >= y1 ? 1 : -1;
      for (let y = y1; y !== y2; y += step) {
        cellSet.add(gridCellKey(x1, y));
        cellSet.add(gridCellKey(x1, y + step));
      }
    }
  }
}

/**
 * 列入清單之 SectionData 路段：起迄紅點間最短路徑所經 flat segment 上之所有格點 key（`x,y`）。
 * 地圖灰底與「該路段須參與位移」之黑點一致：含無 station_id／站名而未寫入 station_list 之端點格。
 */
export function buildListedSectionRouteGridCellKeySet(layer) {
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const cellSet = new Set();
  if (!Array.isArray(sectionData) || sectionData.length === 0) return cellSet;
  const counts = buildConnectIncidentSectionCount(sectionData);
  for (const sd of sectionData) {
    if (!sd) continue;
    const sk = sd.connect_start ? connectEndpointDedupeKey(sd.connect_start) : 'invalid';
    const ek = sd.connect_end ? connectEndpointDedupeKey(sd.connect_end) : 'invalid';
    const sc = sk !== 'invalid' ? counts.get(sk) || 0 : 0;
    const ec = ek !== 'invalid' ? counts.get(ek) || 0 : 0;
    if (sc >= 2 && ec >= 2) continue;
    for (const ck of gridCellKeysForListedSectionDataRow(layer, sd)) cellSet.add(ck);
  }
  return cellSet;
}
