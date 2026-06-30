/* eslint-disable no-console */

/**
 * 三圖層共用組裝/回寫：最佳化後的 connect 骨架 → 沿邊(可能含彎折)依**弧長比例**內插放回黑點 → 寫回圖層渲染。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { syncOrthoFlatSegmentEndpoints } from '@/utils/layers/json_grid_coord_normalized/axisAlignGridNetworkHillClimb.js';
import { schematicStats } from './objective.js';

function readXY(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

function nodeWithGrid(node, x, y, fallbackType) {
  const n = node ? JSON.parse(JSON.stringify(node)) : { node_type: fallbackType || 'line' };
  const t = n.tags || {};
  const node_kind = t.node_kind ?? n.node_kind;
  const node_class_color = t.node_class_color ?? n.node_class_color;
  const node_class_r = t.node_class_r ?? n.node_class_r;
  n.x_grid = x;
  n.y_grid = y;
  n.tags = {
    ...t,
    ...(node_kind != null ? { node_kind } : {}),
    ...(node_class_color != null ? { node_class_color } : {}),
    ...(node_class_r != null ? { node_class_r } : {}),
    x_grid: x,
    y_grid: y,
  };
  return n;
}

/** 沿 polyline 取弧長比例 t∈[0,1] 的點座標。 */
function pointAtArc(poly, cum, total, t) {
  if (total <= 0) return poly[0].slice();
  const target = t * total;
  for (let i = 1; i < poly.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1] || 1;
      const f = (target - cum[i - 1]) / seg;
      return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * f, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * f];
    }
  }
  return poly[poly.length - 1].slice();
}

/**
 * 是否已執行過 reinsertBlackStations（以 _forceDrawBlackDot 標記為準）。
 * 不可用 points.length > 2 判斷：骨架的 bend 角點也會使點數 > 2。
 */
export function flatSegmentsAlreadyHaveReinsertedBlackStations(segments) {
  if (!Array.isArray(segments)) return false;
  return segments.some(
    (s) =>
      Array.isArray(s?.nodes) &&
      s.nodes.some((n) => n && typeof n === 'object' && n.tags?._forceDrawBlackDot === true)
  );
}

/**
 * 把黑點沿「解出的 section 邊(start→[bend…]→end)」依弧長比例內插放回，組回完整 flat segments。
 * @param {Array<object>} optimizedSkeleton 每段 points 為 [start, (bend…), end]（皆 connect/bend 端）
 * @param {Array<{blackNodes:Array}>} sections 與 skeleton 同索引
 */
export function reinsertBlackStations(optimizedSkeleton, sections) {
  const full = [];
  for (let i = 0; i < optimizedSkeleton.length; i++) {
    const sk = optimizedSkeleton[i];
    const skPts = Array.isArray(sk?.points) ? sk.points.map(readXY) : null;
    if (!skPts || skPts.length < 2) continue;

    // polyline 弧長
    const cum = [0];
    for (let k = 1; k < skPts.length; k++) {
      const dx = skPts[k][0] - skPts[k - 1][0];
      const dy = skPts[k][1] - skPts[k - 1][1];
      cum.push(cum[k - 1] + Math.hypot(dx, dy));
    }
    const total = cum[cum.length - 1];

    const black = sections?.[i]?.blackNodes || [];
    const K = black.length;
    const last = skPts.length - 1;

    // 收集「沿邊」的所有插入點：bend 角點(幾何) + 黑點(車站)，依弧長排序
    const items = [];
    for (let k = 1; k < last; k++) {
      items.push({ s: cum[k], xy: skPts[k], node: nodeWithGrid(null, skPts[k][0], skPts[k][1], 'bend') });
    }
    for (let j = 0; j < K; j++) {
      const t = (j + 1) / (K + 1);
      const xy = pointAtArc(skPts, cum, total, t);
      const node = nodeWithGrid(black[j], xy[0], xy[1], 'line');
      if (!node.tags) node.tags = {};
      node.tags._forceDrawBlackDot = true;
      items.push({ s: t * total, xy, node });
    }
    items.sort((a, b) => a.s - b.s);

    const points = [skPts[0].slice()];
    const nodes = [nodeWithGrid(sk.nodes?.[0], skPts[0][0], skPts[0][1], 'connect')];
    for (const it of items) {
      points.push(it.xy.slice());
      nodes.push(it.node);
    }
    points.push(skPts[last].slice());
    nodes.push(nodeWithGrid(sk.nodes?.[1], skPts[last][0], skPts[last][1], 'connect'));

    full.push({
      route_name: sk.route_name,
      name: sk.name,
      points,
      nodes,
      properties_start: sk.properties_start,
      properties_end: sk.properties_end,
      way_properties: sk.way_properties,
      color: sk.color,
      route_colors: sk.route_colors,
      _schematicCorridorSkipDraw: sk._schematicCorridorSkipDraw,
      _schematicCorridorRoutes: sk._schematicCorridorRoutes,
    });
  }
  syncOrthoFlatSegmentEndpoints(full);
  return full;
}

/**
 * 寫回圖層並觸發渲染。
 * @returns {{ ok:boolean, message?:string, stats?:object }}
 */
export function writeSchematicResultToLayer(layerId, fullFlat, meta = {}) {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(layerId);
  if (!layer) return { ok: false, message: '找不到圖層 ' + layerId };
  if (!Array.isArray(fullFlat) || fullFlat.length === 0) {
    return { ok: false, message: '無結果路段可寫入' };
  }

  for (const seg of fullFlat) {
    if (seg && seg.color == null) seg.color = seg.way_properties?.tags?.color || undefined;
    if (seg && seg.route_colors == null) {
      const rc = seg.way_properties?.tags?.route_colors;
      if (rc) seg.route_colors = rc;
    }
    if (seg?.route_colors != null) {
      if (!seg.way_properties) seg.way_properties = { tags: {} };
      if (!seg.way_properties.tags) seg.way_properties.tags = {};
      seg.way_properties.tags.route_colors = seg.route_colors;
    }
    if (seg?._schematicCorridorSkipDraw) {
      if (!seg.way_properties) seg.way_properties = { tags: {} };
      if (!seg.way_properties.tags) seg.way_properties.tags = {};
      seg.way_properties.tags._schematicCorridorSkipDraw = true;
    }
  }

  layer.spaceNetworkGridJsonData = fullFlat;
  const computed = computeStationDataFromRoutes(fullFlat);
  layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  layer.showStationPlacement = false;

  try {
    layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(fullFlat);
  } catch (e) {
    console.error('schematic：匯出 processedJsonData 失敗', e);
    layer.processedJsonData = [];
  }

  const stats = schematicStats(fullFlat);
  const prevDash = layer.dashboardData && typeof layer.dashboardData === 'object' ? layer.dashboardData : {};
  layer.dashboardData = { ...prevDash, ...meta, segmentCount: fullFlat.length, ...stats };
  layer.isLoaded = true;
  if (!layer.visible) layer.visible = true;
  dataStore.saveLayerState(layerId, { visible: true });

  return { ok: true, stats };
}
