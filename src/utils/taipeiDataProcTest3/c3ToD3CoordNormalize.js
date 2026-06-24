/**
 * taipei_c3 → taipei_d3：座標正規化
 * 以四分樹遞迴切割全圖邊界框，直到每個葉區域內至多 1 個紅點（connect，相異座標）；
 * 再以所有葉矩形之邊界線排序去重，形成變寬度網格索引（整數 gx, gy）、切段、瘦身 way_properties.nodes。
 * 僅供 Taipei 測試 3 使用。
 */

import { colabRawSegmentsToExportRows } from '@/utils/taipeiDataProcTest3/colab11LinearizeForA3B3.js';
import { mapDrawnExportRowsToFlatSegmentsLonLat } from '@/utils/mapDrawnRoutesImport.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';

function num(v) {
  return Number(v);
}

/** 與路線直線化 extractConnectNodes 一致：紅點（connect）座標 */
function extractConnectCoords(segments) {
  const connCoords = new Set();
  for (const seg of segments) {
    const points = seg.points || [];
    if (!points.length) continue;
    const pStart = seg.properties_start || {};
    const pEnd = seg.properties_end || {};
    if (pStart.node_type === 'connect') {
      connCoords.add(JSON.stringify([num(points[0][0]), num(points[0][1])]));
    }
    if (pEnd.node_type === 'connect') {
      const pt = points[points.length - 1];
      connCoords.add(JSON.stringify([num(pt[0]), num(pt[1])]));
    }
    const nodes = seg.nodes || [];
    if (nodes.length === points.length) {
      for (let i = 0; i < points.length; i++) {
        const props = nodes[i] || {};
        if (props.node_type === 'connect') {
          const pt = points[i];
          connCoords.add(JSON.stringify([num(pt[0]), num(pt[1])]));
        }
      }
    }
  }
  return Array.from(connCoords).map((s) => JSON.parse(s));
}

function flattenAllVertexCoords(segments) {
  const list = [];
  const seen = new Set();
  for (const seg of segments) {
    for (const p of seg.points || []) {
      const x = num(p[0]);
      const y = num(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push([x, y]);
    }
  }
  return list;
}

const QT_EPS = 1e-11;
const QT_MAX_DEPTH = 56;

/** 紅點座標去重（同一經緯度視為一個紅點，供四分樹停止條件） */
function dedupeConnectCoords(coords) {
  const map = new Map();
  for (const p of coords || []) {
    const x = num(p[0]);
    const y = num(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const k = `${x},${y}`;
    if (!map.has(k)) map.set(k, [x, y]);
  }
  return [...map.values()];
}

/**
 * 四分樹：葉節點內相異紅點座標至多 1 個；空象限仍成葉（0 個紅點）。
 * @returns {{ leaf: boolean, xmin, xmax, ymin, ymax, reds?: Array, children?: Array, depth?: number }}
 */
function buildConnectQuadtree(xmin, xmax, ymin, ymax, reds, depth) {
  if (reds.length <= 1 || depth >= QT_MAX_DEPTH) {
    return { leaf: true, xmin, xmax, ymin, ymax, reds, depth };
  }
  const w = xmax - xmin;
  const h = ymax - ymin;
  if (w <= QT_EPS * 4 || h <= QT_EPS * 4) {
    return { leaf: true, xmin, xmax, ymin, ymax, reds, depth };
  }
  const xmid = (xmin + xmax) / 2;
  const ymid = (ymin + ymax) / 2;
  const buckets = [[], [], [], []];
  for (const p of reds) {
    const x = p[0];
    const y = p[1];
    const idx = (y < ymid ? 0 : 2) + (x < xmid ? 0 : 1);
    buckets[idx].push(p);
  }
  const boxes = [
    [xmin, xmid, ymin, ymid],
    [xmid, xmax, ymin, ymid],
    [xmin, xmid, ymid, ymax],
    [xmid, xmax, ymid, ymax],
  ];
  return {
    leaf: false,
    xmin,
    xmax,
    ymin,
    ymax,
    depth,
    children: boxes.map(([xa, xb, ya, yb], i) =>
      buildConnectQuadtree(xa, xb, ya, yb, buckets[i], depth + 1)
    ),
  };
}

function collectQuadLeaves(node, out) {
  if (node.leaf) {
    out.push(node);
    return;
  }
  for (const c of node.children || []) collectQuadLeaves(c, out);
}

function quadtreeMaxDepth(node) {
  if (node.leaf) return node.depth ?? 0;
  return Math.max(...(node.children || []).map(quadtreeMaxDepth));
}

/** 排序後合併近似相等邊界（避免浮點重複線） */
function uniqueSortedBoundaries(values, tol = 1e-9) {
  const s = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (const v of s) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > tol) out.push(v);
  }
  return out;
}

/**
 * val 落在帶 [sorted[i], sorted[i+1]]；內部分割線上取右／上側帶（與四分樹 x<mid、y<mid 分區一致）。
 * @returns {number} 帶索引 0 … sorted.length-2
 */
function valueToStripIndex(val, sorted) {
  const n = sorted.length;
  if (n < 2) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (sorted[mid] <= val + QT_EPS) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(lo, n - 2);
}

/** 歐式距離最小的一對相異點（距離 > 0） */
function closestDistinctPair(points) {
  if (!points || points.length < 2) return null;
  let minD = Infinity;
  let pointA = null;
  let pointB = null;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i][0] - points[j][0];
      const dy = points[i][1] - points[j][1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-18 && d < minD) {
        minD = d;
        pointA = points[i];
        pointB = points[j];
      }
    }
  }
  if (minD === Infinity) return null;
  return { distance: minD, pointA: [...pointA], pointB: [...pointB] };
}

function gridCellExtentFromRawSegments(rawSegments) {
  let minGx = Infinity;
  let maxGx = -Infinity;
  let minGy = Infinity;
  let maxGy = -Infinity;
  for (const rs of rawSegments || []) {
    for (const p of rs.points || []) {
      const gx = num(p[0]);
      const gy = num(p[1]);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
      minGx = Math.min(minGx, gx);
      maxGx = Math.max(maxGx, gx);
      minGy = Math.min(minGy, gy);
      maxGy = Math.max(maxGy, gy);
    }
  }
  if (!Number.isFinite(minGx)) {
    return { width: 0, height: 0, minGx: 0, maxGx: 0, minGy: 0, maxGy: 0 };
  }
  return {
    width: maxGx - minGx + 1,
    height: maxGy - minGy + 1,
    minGx,
    maxGx,
    minGy,
    maxGy,
  };
}

function boundsFromSegments(segments) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const seg of segments) {
    for (const p of seg.points || []) {
      const x = num(p[0]);
      const y = num(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minLon = Math.min(minLon, x);
      maxLon = Math.max(maxLon, x);
      minLat = Math.min(minLat, y);
      maxLat = Math.max(maxLat, y);
    }
  }
  if (!Number.isFinite(minLon)) {
    return { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 };
  }
  return { minLon, maxLon, minLat, maxLat };
}

function applySnapProps(baseProps, gx, gy) {
  const p = JSON.parse(JSON.stringify(baseProps || {}));
  p.x_grid = gx;
  p.y_grid = gy;
  if (!p.tags || typeof p.tags !== 'object') p.tags = {};
  p.tags.x_grid = gx;
  p.tags.y_grid = gy;
  return p;
}

function vertexProps(seg, index, nPts) {
  const nodes = seg.nodes;
  if (Array.isArray(nodes) && nodes.length === nPts) {
    return nodes[index] ? JSON.parse(JSON.stringify(nodes[index])) : {};
  }
  if (index === 0) return seg.properties_start ? JSON.parse(JSON.stringify(seg.properties_start)) : {};
  if (index === nPts - 1) {
    return seg.properties_end ? JSON.parse(JSON.stringify(seg.properties_end)) : {};
  }
  return { node_type: 'line' };
}

function normalizeStationLabel(v) {
  const s = (v ?? '').toString().trim();
  return s === '—' || s === '－' ? '' : s;
}

/** 與 computeStationDataFromRoutes 一致之站名來源 */
function stationDisplayNameFromProps(props) {
  if (!props || typeof props !== 'object') return '';
  return normalizeStationLabel(
    props.station_name ?? props.tags?.station_name ?? props.tags?.name ?? props.name ?? ''
  );
}

/** 在 c3 segments 上依經緯找頂點站名（容差對齊浮點） */
function findStationNameAtLonLat(segments, lon, lat) {
  const tl = num(lon);
  const tt = num(lat);
  if (!Number.isFinite(tl) || !Number.isFinite(tt)) return '';
  for (const seg of segments) {
    const pts = seg.points || [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const x = num(pts[i][0]);
      const y = num(pts[i][1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (Math.abs(x - tl) > 1e-7 || Math.abs(y - tt) > 1e-7) continue;
      const nm = stationDisplayNameFromProps(vertexProps(seg, i, n));
      if (nm) return nm;
    }
  }
  return '';
}

/**
 * @param {Array} c3FlatSegments - taipei_c3 spaceNetworkGridJsonData（扁平 segments）
 * @returns {{ rawSegments: Array, rows: Array, flatSegs: Array, sectionData: Array, connectData: Array, stationData: Array, meta: object }}
 */
export function buildTaipeiD3FromC3Network(c3FlatSegments) {
  const segments = Array.isArray(c3FlatSegments) ? c3FlatSegments : [];
  if (segments.length === 0) {
    return {
      rawSegments: [],
      rows: [],
      flatSegs: [],
      sectionData: [],
      connectData: [],
      stationData: [],
      meta: {
        gridUnit: null,
        coordNormalizeMode: 'quadtree',
        quadtree: null,
        connectPointCount: 0,
        bounds: null,
        segmentCount: 0,
        sourceLayerId: 'taipei_c3',
        gridSizeCells: null,
        nearestPairSource: null,
      },
    };
  }

  const connectCoords = extractConnectCoords(segments);
  const uniqueReds = dedupeConnectCoords(connectCoords);
  let nearestPairSource = closestDistinctPair(connectCoords);
  if (nearestPairSource == null) {
    nearestPairSource = closestDistinctPair(flattenAllVertexCoords(segments));
  }

  const { minLon, maxLon, minLat, maxLat } = boundsFromSegments(segments);
  let qxmin = minLon;
  let qxmax = maxLon;
  let qymin = minLat;
  let qymax = maxLat;
  const spanLon = qxmax - qxmin;
  const spanLat = qymax - qymin;
  const padLon = Math.max(Math.abs(spanLon), 1e-9) * 1e-7;
  const padLat = Math.max(Math.abs(spanLat), 1e-9) * 1e-7;
  if (spanLon < 1e-14) {
    qxmin -= padLon;
    qxmax += padLon;
  }
  if (spanLat < 1e-14) {
    qymin -= padLat;
    qymax += padLat;
  }

  const qtRoot = buildConnectQuadtree(qxmin, qxmax, qymin, qymax, uniqueReds, 0);
  const leaves = [];
  collectQuadLeaves(qtRoot, leaves);

  const xs = new Set();
  const ys = new Set();
  for (const L of leaves) {
    xs.add(L.xmin);
    xs.add(L.xmax);
    ys.add(L.ymin);
    ys.add(L.ymax);
  }
  const sortedX = uniqueSortedBoundaries(xs);
  const sortedY = uniqueSortedBoundaries(ys);

  const snapLonLat = (lon, lat) => [
    valueToStripIndex(num(lon), sortedX),
    valueToStripIndex(num(lat), sortedY),
  ];

  const rawSegments = [];
  for (const seg of segments) {
    const pts = seg.points || [];
    if (pts.length < 2) continue;
    const n = pts.length;
    const routeName = seg.route_name || seg.name || 'Unknown';
    const wayProps = JSON.parse(JSON.stringify(seg.way_properties || {}));
    delete wayProps.nodes;

    for (let i = 0; i < n - 1; i++) {
      const lon0 = num(pts[i][0]);
      const lat0 = num(pts[i][1]);
      const lon1 = num(pts[i + 1][0]);
      const lat1 = num(pts[i + 1][1]);
      const [gx0, gy0] = snapLonLat(lon0, lat0);
      const [gx1, gy1] = snapLonLat(lon1, lat1);

      const ps0 = applySnapProps(vertexProps(seg, i, n), gx0, gy0);
      const ps1 = applySnapProps(vertexProps(seg, i + 1, n), gx1, gy1);

      rawSegments.push({
        name: routeName,
        processed: false,
        points: [
          [gx0, gy0],
          [gx1, gy1],
        ],
        properties_start: ps0,
        properties_end: ps1,
        way_properties: wayProps,
      });
    }
  }

  const rows = colabRawSegmentsToExportRows(rawSegments);
  const flatSegs = mapDrawnExportRowsToFlatSegmentsLonLat(rows);
  const { sectionData, connectData, stationData } = computeStationDataFromRoutes(flatSegs);

  const gridSizeCells = gridCellExtentFromRawSegments(rawSegments);
  const boundsSpanCols = Math.max(0, sortedX.length - 1);
  const boundsSpanRows = Math.max(0, sortedY.length - 1);

  let minLeafW = Infinity;
  let minLeafH = Infinity;
  for (const L of leaves) {
    minLeafW = Math.min(minLeafW, L.xmax - L.xmin);
    minLeafH = Math.min(minLeafH, L.ymax - L.ymin);
  }
  if (!Number.isFinite(minLeafW)) minLeafW = 0;
  if (!Number.isFinite(minLeafH)) minLeafH = 0;

  const roundCoord = (p) =>
    p && Array.isArray(p) && p.length >= 2
      ? [Number(num(p[0]).toFixed(8)), Number(num(p[1]).toFixed(8))]
      : null;

  return {
    rawSegments,
    rows,
    flatSegs,
    sectionData,
    connectData,
    stationData,
    meta: {
      gridUnit: null,
      coordNormalizeMode: 'quadtree',
      quadtree: {
        leafCount: leaves.length,
        maxDepth: quadtreeMaxDepth(qtRoot),
        uniqueRedPointCount: uniqueReds.length,
        rawConnectCoordCount: connectCoords.length,
        boundaryStripsX: boundsSpanCols,
        boundaryStripsY: boundsSpanRows,
        minLeafWidth: Number(minLeafW.toFixed(14)),
        minLeafHeight: Number(minLeafH.toFixed(14)),
      },
      connectPointCount: connectCoords.length,
      bounds: {
        minLon: Number(minLon.toFixed(8)),
        maxLon: Number(maxLon.toFixed(8)),
        minLat: Number(minLat.toFixed(8)),
        maxLat: Number(maxLat.toFixed(8)),
      },
      segmentCount: rawSegments.length,
      sourceLayerId: 'taipei_c3',
      gridSizeCells: {
        width: gridSizeCells.width,
        height: gridSizeCells.height,
        byBoundsWidth: boundsSpanCols,
        byBoundsHeight: boundsSpanRows,
      },
      nearestPairSource: nearestPairSource
        ? {
            distance: Number(nearestPairSource.distance.toFixed(12)),
            pointA: roundCoord(nearestPairSource.pointA),
            pointB: roundCoord(nearestPairSource.pointB),
            stationNameA: findStationNameAtLonLat(
              segments,
              nearestPairSource.pointA[0],
              nearestPairSource.pointA[1]
            ),
            stationNameB: findStationNameAtLonLat(
              segments,
              nearestPairSource.pointB[0],
              nearestPairSource.pointB[1]
            ),
          }
        : null,
    },
  };
}
