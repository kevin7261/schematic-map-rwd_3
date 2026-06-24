/**
 * taipei_f 欄高亮：將垂直線向幾何中心（藍虛線）平移，遇其他垂直線或固定站點則停。
 */

import {
  extractVerticalEdgesFromSegment,
  extractHorizontalEdgesFromSegment,
  getFlatSegmentsFromLayer,
} from './taipeiFColRouteHighlightPlan.js';

function pathMatchesEdge(vp, edge) {
  if (!vp || vp.length < 2 || !edge?.coords) return false;
  const [[a0, a1], [b0, b1]] = vp;
  const [[e0, e1], [f0, f1]] = edge.coords;
  return a0 === e0 && b0 === f0 && a1 === e1 && b1 === f1;
}

function edgeKeyFromEdge(edge) {
  const c = edge.coords;
  return `${c[0][0]},${c[0][1]},${c[1][0]},${c[1][1]}`;
}

/**
 * 計算高亮垂直線向幾何中心平移的 delta。
 * @returns {{ delta: number, shiftedPaths: Array<[[number,number],[number,number]]> }}
 */
export function computeTaipeiFColHighlightShift({
  flatSegments,
  stationFeatures,
  verticalPaths,
  xMin,
  xMax,
}) {
  const empty = { delta: 0, shiftedPaths: [] };
  if (
    !Array.isArray(flatSegments) ||
    !Array.isArray(verticalPaths) ||
    verticalPaths.length === 0 ||
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax)
  ) {
    return empty;
  }

  const allEdges = [];
  flatSegments.forEach((seg, segIdx) => {
    extractVerticalEdgesFromSegment(seg).forEach((edge) => {
      allEdges.push({ segIdx, edge });
    });
  });

  const highlightEdgeEntries = [];
  for (const vp of verticalPaths) {
    for (const ae of allEdges) {
      if (pathMatchesEdge(vp, ae.edge)) {
        highlightEdgeEntries.push(ae);
        break;
      }
    }
  }
  if (highlightEdgeEntries.length === 0) return empty;

  const highlightKeys = new Set();
  for (const { edge } of highlightEdgeEntries) {
    for (const k of edge.keys) highlightKeys.add(k);
  }

  const highlightEdgeKeySet = new Set(
    highlightEdgeEntries.map(({ edge }) => edgeKeyFromEdge(edge))
  );

  const nonHighlightVerticalCells = new Set();
  for (const { edge } of allEdges) {
    if (highlightEdgeKeySet.has(edgeKeyFromEdge(edge))) continue;
    for (const k of edge.keys) nonHighlightVerticalCells.add(k);
  }

  const stationKey = (x, y) => `${Math.round(Number(x))},${Math.round(Number(y))}`;
  const stationMeta = new Map();
  if (Array.isArray(stationFeatures)) {
    for (const sf of stationFeatures) {
      if (!sf?.geometry?.coordinates) continue;
      const [sx, sy] = sf.geometry.coordinates;
      const k = stationKey(sx, sy);
      const nt = sf.nodeType || sf.properties?.node_type || 'line';
      const prev = stationMeta.get(k);
      if (!prev || (nt === 'connect' && prev.nodeType !== 'connect')) {
        stationMeta.set(k, { nodeType: nt });
      }
    }
  }

  const fixedStationCells = new Set();
  for (const k of stationMeta.keys()) {
    if (!highlightKeys.has(k)) fixedStationCells.add(k);
  }

  let sumX = 0;
  for (const { edge } of highlightEdgeEntries) {
    sumX += edge.x;
  }
  const avgX = sumX / highlightEdgeEntries.length;
  const centerX = (xMin + xMax) / 2;

  let dir = 0;
  if (avgX < centerX - 1e-9) dir = 1;
  else if (avgX > centerX + 1e-9) dir = -1;

  function validDelta(d) {
    for (const { edge } of highlightEdgeEntries) {
      const xNew = edge.x + d;
      for (const k of edge.keys) {
        const y = Number(k.split(',')[1]);
        const nk = `${xNew},${y}`;
        if (nonHighlightVerticalCells.has(nk)) return false;
        if (fixedStationCells.has(nk)) return false;
      }
    }
    return true;
  }

  let delta = 0;
  if (dir !== 0) {
    while (validDelta(delta + dir)) {
      delta += dir;
    }
  }

  const shiftedPaths = verticalPaths.map((vp) => [
    [vp[0][0] + delta, vp[0][1]],
    [vp[1][0] + delta, vp[1][1]],
  ]);

  return { delta, shiftedPaths };
}

/**
 * 計算高亮水平線向幾何中心（垂直方向）平移的 delta。
 * @returns {{ delta: number, shiftedPaths: Array<[[number,number],[number,number]]> }}
 */
export function computeTaipeiFRowHighlightShift({
  flatSegments,
  stationFeatures,
  horizontalPaths,
  yMin,
  yMax,
}) {
  const empty = { delta: 0, shiftedPaths: [] };
  if (
    !Array.isArray(flatSegments) ||
    !Array.isArray(horizontalPaths) ||
    horizontalPaths.length === 0 ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax)
  ) {
    return empty;
  }

  const allEdges = [];
  flatSegments.forEach((seg, segIdx) => {
    extractHorizontalEdgesFromSegment(seg).forEach((edge) => {
      allEdges.push({ segIdx, edge });
    });
  });

  const highlightEdgeEntries = [];
  for (const hp of horizontalPaths) {
    for (const ae of allEdges) {
      if (pathMatchesEdge(hp, ae.edge)) {
        highlightEdgeEntries.push(ae);
        break;
      }
    }
  }
  if (highlightEdgeEntries.length === 0) return empty;

  const highlightKeys = new Set();
  for (const { edge } of highlightEdgeEntries) {
    for (const k of edge.keys) highlightKeys.add(k);
  }

  const highlightEdgeKeySet = new Set(
    highlightEdgeEntries.map(({ edge }) => edgeKeyFromEdge(edge))
  );

  const nonHighlightHorizontalCells = new Set();
  for (const { edge } of allEdges) {
    if (highlightEdgeKeySet.has(edgeKeyFromEdge(edge))) continue;
    for (const k of edge.keys) nonHighlightHorizontalCells.add(k);
  }

  const stationKey = (x, y) => `${Math.round(Number(x))},${Math.round(Number(y))}`;
  const stationMeta = new Map();
  if (Array.isArray(stationFeatures)) {
    for (const sf of stationFeatures) {
      if (!sf?.geometry?.coordinates) continue;
      const [sx, sy] = sf.geometry.coordinates;
      const k = stationKey(sx, sy);
      const nt = sf.nodeType || sf.properties?.node_type || 'line';
      const prev = stationMeta.get(k);
      if (!prev || (nt === 'connect' && prev.nodeType !== 'connect')) {
        stationMeta.set(k, { nodeType: nt });
      }
    }
  }

  const fixedStationCells = new Set();
  for (const k of stationMeta.keys()) {
    if (!highlightKeys.has(k)) fixedStationCells.add(k);
  }

  let sumY = 0;
  for (const { edge } of highlightEdgeEntries) {
    sumY += edge.y;
  }
  const avgY = sumY / highlightEdgeEntries.length;
  const centerY = (yMin + yMax) / 2;

  let dir = 0;
  if (avgY < centerY - 1e-9) dir = 1;
  else if (avgY > centerY + 1e-9) dir = -1;

  function validDelta(d) {
    for (const { edge } of highlightEdgeEntries) {
      const yNew = edge.y + d;
      for (const k of edge.keys) {
        const x = Number(k.split(',')[0]);
        const nk = `${x},${yNew}`;
        if (nonHighlightHorizontalCells.has(nk)) return false;
        if (fixedStationCells.has(nk)) return false;
      }
    }
    return true;
  }

  let delta = 0;
  if (dir !== 0) {
    while (validDelta(delta + dir)) {
      delta += dir;
    }
  }

  const shiftedPaths = horizontalPaths.map((hp) => [
    [hp[0][0], hp[0][1] + delta],
    [hp[1][0], hp[1][1] + delta],
  ]);

  return { delta, shiftedPaths };
}

const roundN = (v) => Math.round(Number(v));

/**
 * 判斷整數格 (rx, ry) 是否落在任一條高亮垂直帶內。
 * yPadding=1 可涵蓋分段切點造成的「端點外 1 格」轉折點。
 */
function gridInVerticalStrips(rx, ry, strips, yPadding = 0) {
  for (const { xCol, yLo, yHi } of strips) {
    if (rx === xCol && ry >= yLo - yPadding && ry <= yHi + yPadding) return true;
  }
  return false;
}

function shiftPointXIfInStrips(pt, delta, strips) {
  const xRaw = Array.isArray(pt) ? pt[0] : pt?.x;
  const yRaw = Array.isArray(pt) ? pt[1] : pt?.y;
  if (xRaw == null || yRaw == null) return;
  const rx = roundN(xRaw);
  const ry = roundN(yRaw);
  if (!gridInVerticalStrips(rx, ry, strips, 1)) return;
  if (Array.isArray(pt)) {
    pt[0] = Number(pt[0]) + delta;
  } else if (pt && typeof pt === 'object') {
    pt.x = Number(pt.x) + delta;
  }
}

/** 與 points 對齊的 nodes（taipei_f mapDrawn）— 轉折後同步 x_grid／y_grid */
function syncSegmentNodesGridFromPoints(seg) {
  const pts = seg?.points;
  const nodes = seg?.nodes;
  if (!Array.isArray(pts) || !Array.isArray(nodes) || nodes.length !== pts.length) return;
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const x = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
    const y = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const n = nodes[i];
    if (!n || typeof n !== 'object') continue;
    n.x_grid = x;
    n.y_grid = y;
    if (n.tags && typeof n.tags === 'object') {
      n.tags.x_grid = x;
      n.tags.y_grid = y;
    }
  }
}

function shiftConnectPropsXIfInVerticalStrips(props, delta, strips) {
  if (!props || typeof props !== 'object') return;
  const xg = props.x_grid ?? props.tags?.x_grid;
  const yg = props.y_grid ?? props.tags?.y_grid;
  if (xg == null || yg == null) return;
  const rx = roundN(xg);
  const ry = roundN(yg);
  if (!gridInVerticalStrips(rx, ry, strips, 1)) return;
  const nx = Number(xg) + delta;
  if (props.x_grid != null) props.x_grid = nx;
  if (props.tags && typeof props.tags === 'object' && props.tags.x_grid != null) {
    props.tags.x_grid = nx;
  }
}

/** 整數格 (rx, ry) 是否落在任一條高亮水平帶內（該列 yRow、x∈[xLo,xHi]） */
function gridInHorizontalStrips(rx, ry, strips, xPadding = 0) {
  for (const { yRow, xLo, xHi } of strips) {
    if (ry === yRow && rx >= xLo - xPadding && rx <= xHi + xPadding) return true;
  }
  return false;
}

function shiftPointYIfInHorizontalStrips(pt, delta, strips) {
  const xRaw = Array.isArray(pt) ? pt[0] : pt?.x;
  const yRaw = Array.isArray(pt) ? pt[1] : pt?.y;
  if (xRaw == null || yRaw == null) return;
  const rx = roundN(xRaw);
  const ry = roundN(yRaw);
  if (!gridInHorizontalStrips(rx, ry, strips, 1)) return;
  if (Array.isArray(pt)) {
    pt[1] = Number(pt[1]) + delta;
  } else if (pt && typeof pt === 'object') {
    pt.y = Number(pt.y) + delta;
  }
}

function shiftConnectPropsYIfInHorizontalStrips(props, delta, strips) {
  if (!props || typeof props !== 'object') return;
  const xg = props.x_grid ?? props.tags?.x_grid;
  const yg = props.y_grid ?? props.tags?.y_grid;
  if (xg == null || yg == null) return;
  const rx = roundN(xg);
  const ry = roundN(yg);
  if (!gridInHorizontalStrips(rx, ry, strips, 1)) return;
  const ny = Number(yg) + delta;
  if (props.y_grid != null) props.y_grid = ny;
  if (props.tags && typeof props.tags === 'object' && props.tags.y_grid != null) {
    props.tags.y_grid = ny;
  }
}

/** 與折線／StationData 欄位移一致：同步 ConnectData、SectionData 端點與 station_list 格點，避免清單路段最短路徑仍用舊紅點座標。 */
function patchConnectAndSectionBundleAfterColShift(layer, delta, strips) {
  const cd = layer?.spaceNetworkGridJsonData_ConnectData;
  if (Array.isArray(cd)) {
    for (const row of cd) {
      shiftConnectPropsXIfInVerticalStrips(row, delta, strips);
    }
  }
  const sec = layer?.spaceNetworkGridJsonData_SectionData;
  if (Array.isArray(sec)) {
    for (const row of sec) {
      if (!row) continue;
      shiftConnectPropsXIfInVerticalStrips(row.connect_start, delta, strips);
      shiftConnectPropsXIfInVerticalStrips(row.connect_end, delta, strips);
      for (const st of row.station_list || []) {
        shiftConnectPropsXIfInVerticalStrips(st, delta, strips);
      }
    }
  }
  if (layer && typeof layer === 'object') {
    layer._taipeiFListedGraySnapshotDone = false;
    layer._taipeiFListedGrayStationKeySet = undefined;
    layer._taipeiFListedGrayRouteCellKeySet = undefined;
  }
}

/** 與折線／StationData 列位移一致：同步 ConnectData、SectionData 格點。 */
function patchConnectAndSectionBundleAfterRowShift(layer, delta, strips) {
  const cd = layer?.spaceNetworkGridJsonData_ConnectData;
  if (Array.isArray(cd)) {
    for (const row of cd) {
      shiftConnectPropsYIfInHorizontalStrips(row, delta, strips);
    }
  }
  const sec = layer?.spaceNetworkGridJsonData_SectionData;
  if (Array.isArray(sec)) {
    for (const row of sec) {
      if (!row) continue;
      shiftConnectPropsYIfInHorizontalStrips(row.connect_start, delta, strips);
      shiftConnectPropsYIfInHorizontalStrips(row.connect_end, delta, strips);
      for (const st of row.station_list || []) {
        shiftConnectPropsYIfInHorizontalStrips(st, delta, strips);
      }
    }
  }
  if (layer && typeof layer === 'object') {
    layer._taipeiFListedGraySnapshotDone = false;
    layer._taipeiFListedGrayStationKeySet = undefined;
    layer._taipeiFListedGrayRouteCellKeySet = undefined;
  }
}

function forEachSegmentInLayer(segments, fn) {
  const isMerged = segments[0]?.route_name != null && Array.isArray(segments[0]?.segments);
  if (isMerged) {
    for (const route of segments) {
      for (const seg of route.segments || []) fn(seg);
    }
  } else {
    for (const seg of segments) fn(seg);
  }
}

/**
 * 平移後：仍留在原欄 xColOld 的頂點。
 * @param verticalStrips 若提供，只計入「應隨垂直帶位移」的 y（與 shiftPointXIfInStrips 一致）；未提供則視為整欄平移。
 */
function findStaleVerticesOnColumnAfterShift(layer, xColOld, verticalStrips = null) {
  const stale = [];
  const flat = getFlatSegmentsFromLayer(layer);
  for (let si = 0; si < flat.length; si++) {
    const pts = flat[si]?.points;
    if (!Array.isArray(pts)) continue;
    for (let pi = 0; pi < pts.length; pi++) {
      const pt = pts[pi];
      const rx = roundN(Array.isArray(pt) ? pt[0] : pt?.x);
      const ry = roundN(Array.isArray(pt) ? pt[1] : pt?.y);
      if (rx !== xColOld) continue;
      if (
        Array.isArray(verticalStrips) &&
        verticalStrips.length > 0 &&
        !gridInVerticalStrips(rx, ry, verticalStrips, 1)
      ) {
        continue;
      }
      stale.push({ segIdx: si, ptIdx: pi, x: rx, y: ry });
    }
  }
  return stale;
}

/**
 * 平移後：仍留在原列 yRowOld 的頂點。
 * @param horizontalStrips 若提供，只計入「應隨水平帶位移」的 x（與 shiftPointYIfInHorizontalStrips 一致）；未提供則視為整列平移。
 */
function findStaleVerticesOnRowAfterShift(layer, yRowOld, horizontalStrips = null) {
  const stale = [];
  const flat = getFlatSegmentsFromLayer(layer);
  for (let si = 0; si < flat.length; si++) {
    const pts = flat[si]?.points;
    if (!Array.isArray(pts)) continue;
    for (let pi = 0; pi < pts.length; pi++) {
      const pt = pts[pi];
      const rx = roundN(Array.isArray(pt) ? pt[0] : pt?.x);
      const ry = roundN(Array.isArray(pt) ? pt[1] : pt?.y);
      if (ry !== yRowOld) continue;
      if (
        Array.isArray(horizontalStrips) &&
        horizontalStrips.length > 0 &&
        !gridInHorizontalStrips(rx, ry, horizontalStrips, 1)
      ) {
        continue;
      }
      stale.push({ segIdx: si, ptIdx: pi, x: rx, y: ry });
    }
  }
  return stale;
}

/** 該格 (x, y) 是否有水平邊經過（列位移後「倒 T」檢查用） */
function hasHorizontalIncidentAt(flat, x, y) {
  if (!Array.isArray(flat)) return false;
  for (const seg of flat) {
    const pts = seg.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
      const ay = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
      const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
      const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
      if (ay !== by || ay !== y) continue;
      const lo = Math.min(ax, bx);
      const hi = Math.max(ax, bx);
      if (x >= lo && x <= hi) return true;
    }
  }
  return false;
}

/** 頂點 i 是否為同一路線上垂直直穿該列：(x,yNew-1)-(x,yNew)-(x,yNew+1) */
function isVerticalStraightThroughMiddle(pts, i, x, yNew) {
  if (i < 1 || i >= pts.length - 1) return false;
  const ax = roundN(Array.isArray(pts[i - 1]) ? pts[i - 1][0] : pts[i - 1]?.x);
  const ay = roundN(Array.isArray(pts[i - 1]) ? pts[i - 1][1] : pts[i - 1]?.y);
  const mx = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
  const my = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
  const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
  const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
  if (ax !== x || mx !== x || bx !== x) return false;
  if (ay !== yNew - 1 || my !== yNew || by !== yNew + 1) return false;
  return true;
}

/** 列位移後：在 (x, yNew) 有水平線時，向上／向下單格垂直邊扣除直穿後仍同時多餘 → 倒 T */
function detectTShapeXsThroughRow(flat, yNew, xSet) {
  const badXs = [];
  if (!Array.isArray(flat)) return badXs;
  for (const x of xSet) {
    if (!hasHorizontalIncidentAt(flat, x, yNew)) continue;

    let upCount = 0;
    let downCount = 0;
    let throughCount = 0;

    for (const seg of flat) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
        const ay = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
        const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
        const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
        if (ax !== bx || ay === by) continue;
        if (ax !== x) continue;
        if ((ay === yNew - 1 && by === yNew) || (ay === yNew && by === yNew - 1)) upCount++;
        if ((ay === yNew && by === yNew + 1) || (ay === yNew + 1 && by === yNew)) downCount++;
      }
      for (let i = 1; i < pts.length - 1; i++) {
        if (isVerticalStraightThroughMiddle(pts, i, x, yNew)) throughCount++;
      }
    }

    const upRemain = upCount - throughCount;
    const downRemain = downCount - throughCount;
    if (upRemain > 0 && downRemain > 0) badXs.push(x);
  }
  return badXs;
}

function detectTShapeXsPerSegment(flat, yNew, xSet) {
  const badXs = [];
  if (!Array.isArray(flat)) return badXs;
  for (const x of xSet) {
    if (!hasHorizontalIncidentAt(flat, x, yNew)) continue;
    for (const seg of flat) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      let upCount = 0;
      let downCount = 0;
      let throughCount = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
        const ay = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
        const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
        const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
        if (ax !== bx || ay === by) continue;
        if (ax !== x) continue;
        if ((ay === yNew - 1 && by === yNew) || (ay === yNew && by === yNew - 1)) upCount++;
        if ((ay === yNew && by === yNew + 1) || (ay === yNew + 1 && by === yNew)) downCount++;
      }
      for (let i = 1; i < pts.length - 1; i++) {
        if (isVerticalStraightThroughMiddle(pts, i, x, yNew)) throughCount++;
      }
      if (upCount - throughCount > 0 && downCount - throughCount > 0) {
        badXs.push(x);
        break;
      }
    }
  }
  return badXs;
}

/** 該格 (xNew, y) 是否有垂直邊經過（與水平直穿區分；無垂直則不構成 T 岔） */
function hasVerticalIncidentAt(flat, xNew, y) {
  if (!Array.isArray(flat)) return false;
  for (const seg of flat) {
    const pts = seg.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
      const ay = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
      const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
      const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
      if (ax !== bx || ay === by) continue;
      if (ax !== xNew) continue;
      const lo = Math.min(ay, by);
      const hi = Math.max(ay, by);
      if (y >= lo && y <= hi) return true;
    }
  }
  return false;
}

/** 頂點 i 是否為同一路線上水平直穿該欄：(xNew-1,y)-(xNew,y)-(xNew+1,y)（各為單格邊） */
function isHorizontalStraightThroughMiddle(pts, i, xNew, y) {
  if (i < 1 || i >= pts.length - 1) return false;
  const ax = roundN(Array.isArray(pts[i - 1]) ? pts[i - 1][0] : pts[i - 1]?.x);
  const ay = roundN(Array.isArray(pts[i - 1]) ? pts[i - 1][1] : pts[i - 1]?.y);
  const mx = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
  const my = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
  const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
  const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
  if (ay !== y || my !== y || by !== y) return false;
  if (mx !== xNew) return false;
  return ax === xNew - 1 && bx === xNew + 1;
}

/**
 * T 岔：在「有垂直經過該格」前提下，向左／向右單格水平邊在扣除「同折線直穿」後仍同時多餘。
 * 僅有水平直穿而該列無垂直 → 不視為 T（避免誤判）。
 */
function detectTShapeYsThroughColumn(flat, xNew, ySet) {
  const badYs = [];
  if (!Array.isArray(flat)) return badYs;
  for (const y of ySet) {
    if (!hasVerticalIncidentAt(flat, xNew, y)) continue;

    let leftCount = 0;
    let rightCount = 0;
    let throughCount = 0;

    for (const seg of flat) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
        const ay = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
        const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
        const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
        if (ay !== by || ay !== y) continue;
        if ((ax === xNew - 1 && bx === xNew) || (ax === xNew && bx === xNew - 1)) leftCount++;
        if ((ax === xNew && bx === xNew + 1) || (ax === xNew + 1 && bx === xNew)) rightCount++;
      }
      for (let i = 1; i < pts.length - 1; i++) {
        if (isHorizontalStraightThroughMiddle(pts, i, xNew, y)) throughCount++;
      }
    }

    const leftRemain = leftCount - throughCount;
    const rightRemain = rightCount - throughCount;
    if (leftRemain > 0 && rightRemain > 0) badYs.push(y);
  }
  return badYs;
}

/** 同一路線折線：該列上扣除直穿後仍同時有向左與向右（跨路線不混算） */
function detectTShapeYsPerSegment(flat, xNew, ySet) {
  const badYs = [];
  if (!Array.isArray(flat)) return badYs;
  for (const y of ySet) {
    if (!hasVerticalIncidentAt(flat, xNew, y)) continue;
    for (const seg of flat) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      let leftCount = 0;
      let rightCount = 0;
      let throughCount = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
        const ay = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
        const bx = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][0] : pts[i + 1]?.x);
        const by = roundN(Array.isArray(pts[i + 1]) ? pts[i + 1][1] : pts[i + 1]?.y);
        if (ay !== by || ay !== y) continue;
        if ((ax === xNew - 1 && bx === xNew) || (ax === xNew && bx === xNew - 1)) leftCount++;
        if ((ax === xNew && bx === xNew + 1) || (ax === xNew + 1 && bx === xNew)) rightCount++;
      }
      for (let i = 1; i < pts.length - 1; i++) {
        if (isHorizontalStraightThroughMiddle(pts, i, xNew, y)) throughCount++;
      }
      if (leftCount - throughCount > 0 && rightCount - throughCount > 0) {
        badYs.push(y);
        break;
      }
    }
  }
  return badYs;
}

/** 用於 T 型檢查：圖層內所有出現過的整數列 y */
function collectAllRoundedYsFromFlat(flat) {
  const ys = new Set();
  if (!Array.isArray(flat)) return ys;
  for (const seg of flat) {
    const pts = seg?.points;
    if (!Array.isArray(pts)) continue;
    for (const pt of pts) {
      const yRaw = Array.isArray(pt) ? pt[1] : pt?.y;
      if (yRaw == null) continue;
      ys.add(roundN(yRaw));
    }
  }
  return ys;
}

function collectAllRoundedXsFromFlat(flat) {
  const xs = new Set();
  if (!Array.isArray(flat)) return xs;
  for (const seg of flat) {
    const pts = seg?.points;
    if (!Array.isArray(pts)) continue;
    for (const pt of pts) {
      const xRaw = Array.isArray(pt) ? pt[0] : pt?.x;
      if (xRaw == null) continue;
      xs.add(roundN(xRaw));
    }
  }
  return xs;
}

/** 連續重複頂點（同格）去除，避免位移後重疊點造成偽 T */
function dedupeConsecutiveDuplicatePointsInLayer(layer) {
  const segments = layer?.spaceNetworkGridJsonData;
  if (!Array.isArray(segments)) return;
  forEachSegmentInLayer(segments, (seg) => {
    if (!Array.isArray(seg.points) || seg.points.length < 2) return;
    const pts = seg.points;
    const nodes = seg.nodes;
    const op = seg.original_points;
    const newPts = [];
    const newNodes = [];
    const newOp = [];
    const hasNodes = Array.isArray(nodes) && nodes.length === pts.length;
    const hasOp = Array.isArray(op) && op.length === pts.length;
    for (let i = 0; i < pts.length; i++) {
      const rx = roundN(Array.isArray(pts[i]) ? pts[i][0] : pts[i]?.x);
      const ry = roundN(Array.isArray(pts[i]) ? pts[i][1] : pts[i]?.y);
      if (newPts.length > 0) {
        const p = newPts[newPts.length - 1];
        const px = roundN(Array.isArray(p) ? p[0] : p?.x);
        const py = roundN(Array.isArray(p) ? p[1] : p?.y);
        if (rx === px && ry === py) continue;
      }
      newPts.push(pts[i]);
      if (hasNodes) newNodes.push(nodes[i]);
      if (hasOp) newOp.push(op[i]);
    }
    seg.points = newPts;
    if (hasNodes) seg.nodes = newNodes;
    if (hasOp && newOp.length === newPts.length) seg.original_points = newOp;
    syncSegmentNodesGridFromPoints(seg);
  });
}

/**
 * 永久修改 layer.spaceNetworkGridJsonData：
 * 僅對「高亮垂直帶」內的格點 x+=delta（與 computeTaipeiFColHighlightShift 的垂直邊一致），
 * 不再整欄掃描——否則同欄上僅屬水平線的孤立頂點會被單點拖動。
 * yPadding=1 涵蓋 L 轉角端點。並同步 nodes、properties_start/end、StationData。
 * 另做拓撲檢查（stale／T 岔）。
 * @returns {{
 *   columnXBefore: number,
 *   columnXAfter: number,
 *   topologyError: string | null,
 * }}
 */
export function applyTaipeiFColShiftToLayerData(layer, verticalPaths, delta, segmentIndices) {
  const empty = {
    columnXBefore: 0,
    columnXAfter: 0,
    topologyError: null,
  };
  if (!delta || !Array.isArray(verticalPaths) || verticalPaths.length === 0) return empty;
  const segments = layer?.spaceNetworkGridJsonData;
  if (!Array.isArray(segments) || segments.length === 0) return empty;

  const xCol = roundN(verticalPaths[0][0][0]);

  const strips = [];
  for (const vp of verticalPaths) {
    if (!vp || vp.length < 2) continue;
    const xc = roundN(vp[0][0]);
    const yLo = Math.min(roundN(vp[0][1]), roundN(vp[1][1]));
    const yHi = Math.max(roundN(vp[0][1]), roundN(vp[1][1]));
    strips.push({ xCol: xc, yLo, yHi });
  }

  const modifySegPoints = (pts) => {
    if (!Array.isArray(pts) || pts.length === 0) return;
    for (const pt of pts) {
      shiftPointXIfInStrips(pt, delta, strips);
    }
  };

  const isMerged = segments[0]?.route_name != null && Array.isArray(segments[0]?.segments);
  if (isMerged) {
    for (const route of segments) {
      for (const seg of route.segments || []) {
        modifySegPoints(seg.points);
        if (Array.isArray(seg.original_points) && seg.original_points.length > 0) {
          modifySegPoints(seg.original_points);
        }
        syncSegmentNodesGridFromPoints(seg);
        shiftConnectPropsXIfInVerticalStrips(seg.properties_start, delta, strips);
        shiftConnectPropsXIfInVerticalStrips(seg.properties_end, delta, strips);
      }
    }
  } else {
    for (const seg of segments) {
      modifySegPoints(seg.points);
      if (Array.isArray(seg.original_points) && seg.original_points.length > 0) {
        modifySegPoints(seg.original_points);
      }
      syncSegmentNodesGridFromPoints(seg);
      shiftConnectPropsXIfInVerticalStrips(seg.properties_start, delta, strips);
      shiftConnectPropsXIfInVerticalStrips(seg.properties_end, delta, strips);
    }
  }

  const stationData = layer.spaceNetworkGridJsonData_StationData;
  if (Array.isArray(stationData)) {
    for (const s of stationData) {
      if (!s || typeof s !== 'object') continue;
      const xg = s.x_grid ?? s.tags?.x_grid;
      const yg = s.y_grid ?? s.tags?.y_grid;
      if (xg == null || yg == null) continue;
      const rx = roundN(xg);
      const ry = roundN(yg);
      if (!gridInVerticalStrips(rx, ry, strips, 1)) {
        continue;
      }
      const nx = Number(xg) + delta;
      if (s.x_grid != null) s.x_grid = nx;
      if (s.tags && typeof s.tags === 'object' && s.tags.x_grid != null) {
        s.tags.x_grid = nx;
      }
    }
  }

  patchConnectAndSectionBundleAfterColShift(layer, delta, strips);

  const columnXAfter = xCol + delta;
  let topologyError = null;
  if (Array.isArray(segmentIndices) && segmentIndices.length > 0) {
    let topologyOk = false;
    let lastSig = '';
    for (let iter = 0; iter < 15; iter++) {
      dedupeConsecutiveDuplicatePointsInLayer(layer);
      const flatAfter = getFlatSegmentsFromLayer(layer);
      const ysForT = collectAllRoundedYsFromFlat(flatAfter);
      const stale = findStaleVerticesOnColumnAfterShift(layer, xCol, strips);
      const tYs = detectTShapeYsThroughColumn(flatAfter, columnXAfter, ysForT);
      const tYsSeg = detectTShapeYsPerSegment(flatAfter, columnXAfter, ysForT);
      const tUnion = [...new Set([...tYs, ...tYsSeg])].sort((a, b) => a - b);

      if (stale.length === 0 && tUnion.length === 0) {
        topologyOk = true;
        break;
      }

      const sig = `${stale.length}|${tUnion.join(',')}`;
      if (sig === lastSig && iter > 0) break;
      lastSig = sig;
    }

    if (!topologyOk) {
      const flatAfter = getFlatSegmentsFromLayer(layer);
      const ysForT = collectAllRoundedYsFromFlat(flatAfter);
      const stale = findStaleVerticesOnColumnAfterShift(layer, xCol, strips);
      const tYs = detectTShapeYsThroughColumn(flatAfter, columnXAfter, ysForT);
      const tYsSeg = detectTShapeYsPerSegment(flatAfter, columnXAfter, ysForT);
      const tUnion = [...new Set([...tYs, ...tYsSeg])].sort((a, b) => a - b);
      const parts = [];
      if (stale.length > 0) {
        parts.push(
          `仍有 ${stale.length} 個頂點留在原欄 x=${xCol}（應隨欄位移），L 轉角可能已變成 T 型。`
        );
      }
      if (tUnion.length > 0) {
        const segOnly = tYsSeg.length > 0 && tYs.length === 0;
        const globalOnly = tYs.length > 0 && tYsSeg.length === 0;
        const hint = segOnly
          ? '同一路線折線在該格（扣除水平直穿後）仍同時有向左與向右的單格水平邊'
          : globalOnly
            ? '全圖層在該格（扣除水平直穿後）仍同時有向左與向右的單格水平邊'
            : '全圖或同一路線折線在該格（扣除水平直穿後）仍同時有向左與向右的單格水平邊';
        parts.push(`偵測到 T 字岔出（y=${tUnion.join(',')}）：${hint}，與僅允許 L 型轉角不符。`);
      }
      if (parts.length > 0) topologyError = parts.join(' ');
    }
  }

  return {
    columnXBefore: xCol,
    columnXAfter,
    topologyError,
  };
}

/**
 * 永久修改 layer：僅對「高亮水平帶」內的格點 y+=delta（與 computeTaipeiFRowHighlightShift 的水平邊一致），
 * 不再整列掃描——否則同列上僅屬垂直線的孤立頂點會被單點拖動。
 * xPadding=1 涵蓋 L 轉角端點。並同步 nodes、properties_start/end、StationData。
 * 拓撲檢查（stale／列向倒 T）。
 * @returns {{ rowYBefore: number, rowYAfter: number, topologyError: string | null }}
 */
export function applyTaipeiFRowShiftToLayerData(layer, horizontalPaths, delta, segmentIndices) {
  const empty = {
    rowYBefore: 0,
    rowYAfter: 0,
    topologyError: null,
  };
  if (!delta || !Array.isArray(horizontalPaths) || horizontalPaths.length === 0) return empty;
  const segments = layer?.spaceNetworkGridJsonData;
  if (!Array.isArray(segments) || segments.length === 0) return empty;

  const yRow = roundN(horizontalPaths[0][0][1]);

  const strips = [];
  for (const hp of horizontalPaths) {
    if (!hp || hp.length < 2) continue;
    const yr = roundN(hp[0][1]);
    const xLo = Math.min(roundN(hp[0][0]), roundN(hp[1][0]));
    const xHi = Math.max(roundN(hp[0][0]), roundN(hp[1][0]));
    strips.push({ yRow: yr, xLo, xHi });
  }

  const modifySegPointsY = (pts) => {
    if (!Array.isArray(pts) || pts.length === 0) return;
    for (const pt of pts) {
      shiftPointYIfInHorizontalStrips(pt, delta, strips);
    }
  };

  const isMerged = segments[0]?.route_name != null && Array.isArray(segments[0]?.segments);
  if (isMerged) {
    for (const route of segments) {
      for (const seg of route.segments || []) {
        modifySegPointsY(seg.points);
        if (Array.isArray(seg.original_points) && seg.original_points.length > 0) {
          modifySegPointsY(seg.original_points);
        }
        syncSegmentNodesGridFromPoints(seg);
        shiftConnectPropsYIfInHorizontalStrips(seg.properties_start, delta, strips);
        shiftConnectPropsYIfInHorizontalStrips(seg.properties_end, delta, strips);
      }
    }
  } else {
    for (const seg of segments) {
      modifySegPointsY(seg.points);
      if (Array.isArray(seg.original_points) && seg.original_points.length > 0) {
        modifySegPointsY(seg.original_points);
      }
      syncSegmentNodesGridFromPoints(seg);
      shiftConnectPropsYIfInHorizontalStrips(seg.properties_start, delta, strips);
      shiftConnectPropsYIfInHorizontalStrips(seg.properties_end, delta, strips);
    }
  }

  const stationData = layer.spaceNetworkGridJsonData_StationData;
  if (Array.isArray(stationData)) {
    for (const s of stationData) {
      if (!s || typeof s !== 'object') continue;
      const xg = s.x_grid ?? s.tags?.x_grid;
      const yg = s.y_grid ?? s.tags?.y_grid;
      if (xg == null || yg == null) continue;
      const rx = roundN(xg);
      const ry = roundN(yg);
      if (!gridInHorizontalStrips(rx, ry, strips, 1)) {
        continue;
      }
      const ny = Number(yg) + delta;
      if (s.y_grid != null) s.y_grid = ny;
      if (s.tags && typeof s.tags === 'object' && s.tags.y_grid != null) {
        s.tags.y_grid = ny;
      }
    }
  }

  patchConnectAndSectionBundleAfterRowShift(layer, delta, strips);

  const rowYAfter = yRow + delta;
  let topologyError = null;
  if (Array.isArray(segmentIndices) && segmentIndices.length > 0) {
    let topologyOk = false;
    let lastSig = '';
    for (let iter = 0; iter < 15; iter++) {
      dedupeConsecutiveDuplicatePointsInLayer(layer);
      const flatAfter = getFlatSegmentsFromLayer(layer);
      const xsForT = collectAllRoundedXsFromFlat(flatAfter);
      const stale = findStaleVerticesOnRowAfterShift(layer, yRow, strips);
      const tXs = detectTShapeXsThroughRow(flatAfter, rowYAfter, xsForT);
      const tXsSeg = detectTShapeXsPerSegment(flatAfter, rowYAfter, xsForT);
      const tUnion = [...new Set([...tXs, ...tXsSeg])].sort((a, b) => a - b);

      if (stale.length === 0 && tUnion.length === 0) {
        topologyOk = true;
        break;
      }

      const sig = `${stale.length}|${tUnion.join(',')}`;
      if (sig === lastSig && iter > 0) break;
      lastSig = sig;
    }

    if (!topologyOk) {
      const flatAfter = getFlatSegmentsFromLayer(layer);
      const xsForT = collectAllRoundedXsFromFlat(flatAfter);
      const stale = findStaleVerticesOnRowAfterShift(layer, yRow, strips);
      const tXs = detectTShapeXsThroughRow(flatAfter, rowYAfter, xsForT);
      const tXsSeg = detectTShapeXsPerSegment(flatAfter, rowYAfter, xsForT);
      const tUnion = [...new Set([...tXs, ...tXsSeg])].sort((a, b) => a - b);
      const parts = [];
      if (stale.length > 0) {
        parts.push(
          `仍有 ${stale.length} 個頂點留在原列 y=${yRow}（應隨列位移），L 轉角可能已變成倒 T 型。`
        );
      }
      if (tUnion.length > 0) {
        const segOnly = tXsSeg.length > 0 && tXs.length === 0;
        const globalOnly = tXs.length > 0 && tXsSeg.length === 0;
        const hint = segOnly
          ? '同一路線折線在該格（扣除垂直直穿後）仍同時有向上與向下的單格垂直邊'
          : globalOnly
            ? '全圖層在該格（扣除垂直直穿後）仍同時有向上與向下的單格垂直邊'
            : '全圖或同一路線折線在該格（扣除垂直直穿後）仍同時有向上與向下的單格垂直邊';
        parts.push(
          `偵測到倒 T／十字岔出（x=${tUnion.join(',')}）：${hint}，與僅允許 L 型轉角不符。`
        );
      }
      if (parts.length > 0) topologyError = parts.join(' ');
    }
  }

  return {
    rowYBefore: yRow,
    rowYAfter,
    topologyError,
  };
}
