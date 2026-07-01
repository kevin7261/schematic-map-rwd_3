/**
 * ⑨ 示意圖佈局（正規化）
 *
 * 演算法（四步，無其他規則）：
 *   1. GeoJSON → flat（與全站相同匯入管線）
 *   2. 全點 snap 至藍色網格
 *   3. 紅／黃／藍／粉紅／棕／灰 邊界點切開
 *   4. 每段拉直；段內黑點 (j+1)/(K+1) 均分
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildSchematicGraph, splitHighDegreeNodes } from '../graph.js';
import { writeSchematicResultToLayer } from '../assemble.js';
import { buildSnapLonLatFromC3Segments } from '@/utils/taipeiTest4/c3ToD3CoordNormalize.js';
import {
  GRAY_DOT_HEX,
  RIGHT_ANGLE_PINK_HEX,
  DEMOTED_PINK_BROWN_HEX,
} from '../../routeStations.js';

const LAYER_ID = 'schematic_rma_normalize';

const readPt = (p) =>
  Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x ?? 0), Number(p?.y ?? 0)];

function isBlackDotProps(props) {
  if (!props) return false;
  const t = props.tags || {};
  const kind = String(props.node_kind ?? t.node_kind ?? '').toLowerCase();
  if (kind === 'black') return true;
  if (kind === '') {
    const c = String(t.node_class_color ?? props.node_class_color ?? '').toLowerCase();
    if (c === '#000000' || c === '#000') return true;
  }
  return false;
}

function isBlackVertexNode(node) {
  if (!node || typeof node !== 'object') return false;
  const t = node.tags || {};
  const kind = node.node_kind ?? t.node_kind;
  if (kind === 'black') return true;
  const cc = String(t.node_class_color ?? node.node_class_color ?? '').toLowerCase();
  return cc === '#000000' || cc === '#000';
}

/** 邊界切點（非黑點）— 在此切開路線。 */
function isBoundarySplitProps(props) {
  if (!props || typeof props !== 'object') return false;
  if (isBlackDotProps(props)) return false;
  const t = props.tags || {};
  const kind = String(props.node_kind ?? t.node_kind ?? '').toLowerCase();
  if (
    kind === 'cross' ||
    kind === 'purple' ||
    kind === 'right_angle_pink' ||
    kind === 'gray' ||
    kind === 'brown'
  ) {
    return true;
  }
  if (props.isCross || props.isPurple || t.isCross || t.isPurple) return true;
  const nt = String(props.node_type ?? t.node_type ?? '').toLowerCase();
  if (nt === 'connect' || nt === 'terminal') return true;
  const cc = String(t.node_class_color ?? props.node_class_color ?? '').toLowerCase();
  return (
    cc === '#ff0000' ||
    cc === '#1565c0' ||
    cc === '#ffd600' ||
    cc === '#9c27b0' ||
    cc === RIGHT_ANGLE_PINK_HEX.toLowerCase() ||
    cc === GRAY_DOT_HEX.toLowerCase() ||
    cc === DEMOTED_PINK_BROWN_HEX.toLowerCase()
  );
}

function isBoundaryNode(node) {
  return node && isBoundarySplitProps(node);
}

function enrichNodePropsFromTags(node) {
  if (!node || typeof node !== 'object') return node;
  const t = node.tags || {};
  if (node.station_name == null && t.station_name != null) node.station_name = t.station_name;
  if (node.station_id == null && t.station_id != null) node.station_id = t.station_id;
  if (node.node_kind == null && t.node_kind != null) node.node_kind = t.node_kind;
  if (node.node_class_color == null && t.node_class_color != null) {
    node.node_class_color = t.node_class_color;
  }
  if (node.node_type == null && t.node_type != null) node.node_type = t.node_type;
  return node;
}

function mkVertexNode(props, gx, gy, fallbackType = 'line') {
  const base = props ? JSON.parse(JSON.stringify(props)) : {};
  const t = base.tags || {};
  const node = {
    ...base,
    node_type: base.node_type ?? t.node_type ?? fallbackType,
    x_grid: gx,
    y_grid: gy,
    tags: { ...t, x_grid: gx, y_grid: gy },
  };
  return enrichNodePropsFromTags(node);
}

function mkConnectEndpoint(node, propsFallback, x, y) {
  const nd = mkVertexNode(node || propsFallback, x, y, 'connect');
  nd.node_type = 'connect';
  return nd;
}

function dedupeBlackNodesByKey(nodes) {
  const seen = new Set();
  const out = [];
  for (const nd of nodes || []) {
    const t = nd?.tags || {};
    const sid = String(t.station_id ?? nd?.station_id ?? '').trim();
    const snm = String(t.station_name ?? nd?.station_name ?? '').trim();
    const k = sid ? `id:${sid}` : snm ? `nm:${snm}` : `${nd?.x_grid},${nd?.y_grid}`;
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(nd);
  }
  return out;
}

function geojsonToFlat(geojson) {
  const fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {
    forceCoordinateRouteSegments: true,
  });
  return fields?.spaceNetworkGridJsonData || [];
}

function buildGridSnapFromFlat(flat) {
  if (!Array.isArray(flat) || flat.length === 0) return null;
  return buildSnapLonLatFromC3Segments(flat, { allColorSplitNodes: true });
}

/** ② 所有頂點 snap 至藍格。 */
function snapFlatSegments(flat, snap) {
  const out = [];
  for (const seg of flat || []) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
    const newPts = [];
    const newNodes = [];
    for (let i = 0; i < pts.length; i++) {
      const [lon, lat] = readPt(pts[i]);
      const [gx, gy] = snap.snapLonLat(lon, lat);
      newPts.push([gx, gy]);
      newNodes.push(mkVertexNode(nodes[i] || {}, gx, gy, nodes[i]?.node_type || 'line'));
    }
    const [sx, sy] = newPts[0];
    const [ex, ey] = newPts[newPts.length - 1];
    out.push({
      route_name: seg.route_name,
      name: seg.name,
      points: newPts,
      nodes: newNodes,
      properties_start: { ...newNodes[0], x_grid: sx, y_grid: sy },
      properties_end: { ...newNodes[newNodes.length - 1], x_grid: ex, y_grid: ey },
      way_properties: seg.way_properties,
      color: seg.color,
      route_colors: seg.route_colors,
    });
  }
  return out;
}

/** ③ 段內邊界點切開（起訖已是邊界）。 */
function splitFlatAtBoundaries(flat) {
  const out = [];
  for (const seg of flat || []) {
    const pts = seg.points;
    const nodes = seg.nodes || [];
    const last = pts.length - 1;
    const breaks = [0];
    for (let i = 1; i < last; i++) {
      if (isBoundaryNode(nodes[i])) breaks.push(i);
    }
    breaks.push(last);

    for (let bi = 0; bi + 1 < breaks.length; bi++) {
      const a = breaks[bi];
      const b = breaks[bi + 1];
      const subPts = pts.slice(a, b + 1).map((p) => [p[0], p[1]]);
      const subNodes = nodes.slice(a, b + 1);
      const x0 = subPts[0][0];
      const y0 = subPts[0][1];
      const x1 = subPts[subPts.length - 1][0];
      const y1 = subPts[subPts.length - 1][1];
      if (x0 === x1 && y0 === y1) continue;

      out.push({
        route_name: seg.route_name,
        name: seg.name,
        points: subPts,
        nodes: subNodes,
        properties_start: { ...subNodes[0], x_grid: x0, y_grid: y0 },
        properties_end: { ...subNodes[subNodes.length - 1], x_grid: x1, y_grid: y1 },
        way_properties: seg.way_properties,
        color: seg.color,
        route_colors: seg.route_colors,
      });
    }
  }
  return out;
}

/** ④ 拉直 + 黑點均分 (j+1)/(K+1)。 */
function straightenAndEvenBlackDots(flat) {
  const out = [];
  for (const seg of flat || []) {
    const pts = seg?.points;
    const nodes = seg?.nodes;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const x0 = pts[0][0];
    const y0 = pts[0][1];
    const x1 = pts[pts.length - 1][0];
    const y1 = pts[pts.length - 1][1];
    if (x0 === x1 && y0 === y1) continue;

    const startNode = mkConnectEndpoint(nodes?.[0], seg.properties_start, x0, y0);
    const endNode = mkConnectEndpoint(nodes?.[nodes.length - 1], seg.properties_end, x1, y1);
    const blacks = dedupeBlackNodesByKey(
      (nodes || []).slice(1, -1).filter(isBlackVertexNode)
    );

    const points = [[x0, y0]];
    const outNodes = [startNode];
    for (let j = 0; j < blacks.length; j++) {
      const t = (j + 1) / (blacks.length + 1);
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const bn = mkVertexNode(blacks[j], x, y, 'line');
      bn.node_kind = 'black';
      bn.tags = { ...(bn.tags || {}), node_kind: 'black', _forceDrawBlackDot: true };
      points.push([x, y]);
      outNodes.push(bn);
    }
    points.push([x1, y1]);
    outNodes.push(endNode);

    out.push({
      route_name: seg.route_name,
      name: seg.name,
      points,
      nodes: outNodes,
      properties_start: { ...startNode },
      properties_end: { ...endNode },
      way_properties: seg.way_properties,
      color: seg.color,
      route_colors: seg.route_colors,
    });
  }
  return out;
}

export function computeQuadtreePartitionFromGeojson(geojson) {
  const flat = geojsonToFlat(geojson);
  const snap = buildGridSnapFromFlat(flat);
  if (!snap || !Array.isArray(snap.sortedX) || !Array.isArray(snap.sortedY)) return null;
  return { xs: snap.sortedX.slice(), ys: snap.sortedY.slice(), bounds: snap.bounds };
}

export function executeNormalizeRma() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(LAYER_ID);
  if (!layer) {
    return { ok: false, message: '找不到圖層 schematic_rma_normalize' };
  }

  const geojson = layer.geojsonData;
  if (!geojson?.features?.length) {
    return { ok: false, message: '圖層尚無輸入資料，請先載入骨架。' };
  }
  layer.quadtreePartition = null;

  const baseFlat = geojsonToFlat(geojson);
  if (!baseFlat.length) {
    return { ok: false, message: '無路網可正規化。' };
  }

  const snap = buildGridSnapFromFlat(baseFlat);
  if (!snap) {
    return { ok: false, message: '藍色網格 snap 建立失敗。' };
  }

  const snapped = snapFlatSegments(baseFlat, snap);
  const split = splitFlatAtBoundaries(snapped);
  const fullFlat = straightenAndEvenBlackDots(split);
  if (!fullFlat.length) {
    return { ok: false, message: '正規化後無有效路段。' };
  }

  let graph = buildSchematicGraph(fullFlat);
  try {
    graph = splitHighDegreeNodes(graph);
  } catch {
    /* 非致命 */
  }

  const result = writeSchematicResultToLayer(LAYER_ID, fullFlat, {
    sourceLayerId: LAYER_ID,
    coordNormalize: true,
    splitAtBoundary: true,
    segmentCountBeforeSplit: split.length,
    segmentCountAfterSplit: fullFlat.length,
    _schematicGraph: graph,
    gridCols: snap.sortedX.length - 1,
    gridRows: snap.sortedY.length - 1,
  });

  if (result.ok !== false && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`正規化完成。\n路段 ${split.length} 段 → 拉直 ${fullFlat.length} 段。`);
  }

  return {
    ok: result.ok !== false,
    message: '正規化完成。',
    stats: result.stats,
  };
}
