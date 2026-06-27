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

/**
 * ⑥ Bast：把每條邊的 grid 彎折路徑塞進對應 skeleton 段之 points（start→bend…→end），
 * 使邊以八方向彎折折線渲染、黑站沿彎折路徑分布。其餘佈局(無 edgePaths)不受影響。
 * @param {Array<object>} optimizedSkeleton applyCoordsToSkeleton 之輸出（就地修改）
 * @param {object} graph splitHighDegreeNodes 之輸出（edges 帶 sections）
 * @param {object} edgePaths { [edgeId]: [[x,y]…] }（pos[u]→pos[v]）
 */
export function injectEdgeBends(optimizedSkeleton, graph, edgePaths) {
  if (!edgePaths) return;
  const d2 = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; };
  for (const e of graph.edges) {
    const path = edgePaths[e.id];
    if (!path || path.length < 3) continue; // 無中間彎折 → 維持直線
    for (const si of e.sections || []) {
      const seg = optimizedSkeleton[si];
      if (!seg?.points || seg.points.length < 2) continue;
      const start = readXY(seg.points[0]);
      const interiorFwd = path.slice(1, -1);
      const interior = d2(path[0], start) <= d2(path[path.length - 1], start) ? interiorFwd : interiorFwd.slice().reverse();
      const endPt = seg.points[seg.points.length - 1];
      seg.points = [seg.points[0], ...interior.map((p) => [p[0], p[1]]), endPt];
    }
  }
}

function nodeWithGrid(node, x, y, fallbackType) {
  const n = node ? JSON.parse(JSON.stringify(node)) : { node_type: fallbackType || 'line' };
  n.tags = { ...(n.tags || {}), x_grid: x, y_grid: y };
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
      items.push({ s: t * total, xy, node: nodeWithGrid(black[j], xy[0], xy[1], 'line') });
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

  // 線色 = way 顏色（骨架分類色）：讓結果檢視器之 path.color 直接採用，使輸出線與骨架同色
  for (const seg of fullFlat) {
    if (seg && seg.color == null) seg.color = seg.way_properties?.tags?.color || undefined;
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
