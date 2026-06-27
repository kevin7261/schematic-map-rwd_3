/* eslint-disable no-console */

/**
 * 三圖層共用組裝/回寫：最佳化後的 connect 骨架 → 沿邊(可能含彎折)依**弧長比例**內插放回黑點 → 寫回圖層渲染。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { syncOrthoFlatSegmentEndpoints } from '@/utils/layers/json_grid_coord_normalized/axisAlignGridNetworkHillClimb.js';
import { schematicStats } from './objective.js';
import { segOverlap } from './repair.js';

/** 平行共軌路線錯開間距（整數格）。 */
const PARALLEL_LANE_SPACING = 1;

function octiPerpDelta(a, b, lane = 1) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy !== 0) return [lane, 0];
  if (dy === 0 && dx !== 0) return [0, lane];
  if (Math.abs(dx) === Math.abs(dy)) {
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    return [-sy * lane, sx * lane];
  }
  const [ux, uy] = perpOffsetUnit(a, b);
  return [Math.round(ux * lane), Math.round(uy * lane)];
}

function readXY(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

function writePt(p, x, y) {
  if (Array.isArray(p)) {
    p[0] = x;
    p[1] = y;
  } else if (p && typeof p === 'object') {
    p.x = x;
    p.y = y;
  }
}

function syncPointGrid(seg, idx, x, y) {
  const nd = seg?.nodes?.[idx];
  if (nd && typeof nd === 'object') nd.tags = { ...(nd.tags || {}), x_grid: x, y_grid: y };
}

function collectRouteColors(seg, into) {
  if (!seg) return;
  const add = (c) => { if (c) into.add(String(c).trim()); };
  add(seg.color);
  add(seg.way_properties?.tags?.color);
  const rc = seg.route_colors ?? seg.way_properties?.tags?.route_colors;
  if (rc) String(rc).split(',').forEach((c) => add(c));
}

function applyRouteColorsToSeg(seg, colors) {
  const arr = [...colors];
  seg.route_colors = arr.join(',');
  seg.color = arr.length === 1 ? arr[0] : '#000000';
  if (seg.way_properties?.tags) {
    seg.way_properties.tags.route_colors = seg.route_colors;
    seg.way_properties.tags.color = seg.color;
  }
}

function makeBendNode(x, y) {
  return { node_type: 'bend', tags: { x_grid: x, y_grid: y } };
}

/**
 * 平行共軌：每條路線保留獨立 section（拓撲不變），端點釘在 connect 節點，
 * 中段以八方向平行軌錯開（2 點段加 A→A'→B'→B 微彎），並標 route_colors 供交錯渲染。
 */
export function spreadParallelCorridorLanes(optimizedSkeleton, graph) {
  for (const edge of graph?.edges || []) {
    if (edge.isLink) continue;
    const sis = edge.sections || [];
    if (sis.length <= 1) continue;

    const sorted = sis.slice().sort((a, b) =>
      String(optimizedSkeleton[a]?.route_name ?? '').localeCompare(String(optimizedSkeleton[b]?.route_name ?? ''))
    );
    const corridorColors = new Set();
    for (const si of sorted) collectRouteColors(optimizedSkeleton[si], corridorColors);

    const n = sorted.length;
    for (let lane = 0; lane < n; lane++) {
      const si = sorted[lane];
      const seg = optimizedSkeleton[si];
      if (!seg?.points || seg.points.length < 2) continue;

      applyRouteColorsToSeg(seg, corridorColors);

      const laneOff = (lane - (n - 1) / 2) * PARALLEL_LANE_SPACING;
      if (Math.abs(laneOff) < 1e-9) continue;

      const pts = seg.points.map(readXY);
      const a = pts[0];
      const b = pts[pts.length - 1];
      const [pdx, pdy] = octiPerpDelta(a, b, 1);
      const sign = laneOff > 0 ? 1 : -1;
      const mag = Math.abs(laneOff);
      const dx = pdx * sign * mag;
      const dy = pdy * sign * mag;

      if (pts.length === 2) {
        const a2 = [a[0] + dx, a[1] + dy];
        const b2 = [b[0] + dx, b[1] + dy];
        seg.points = [[a[0], a[1]], a2, b2, [b[0], b[1]]];
        seg.nodes = [seg.nodes?.[0], makeBendNode(a2[0], a2[1]), makeBendNode(b2[0], b2[1]), seg.nodes?.[1]];
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          writePt(seg.points[i], pts[i][0] + dx, pts[i][1] + dy);
          syncPointGrid(seg, i, pts[i][0] + dx, pts[i][1] + dy);
        }
      }
    }
  }
}

/**
 * 偵測「輸出端」不同路線之線段共線重疊（graph 併邊檢查看不到、但畫面上看得到）。
 * @returns {{ count:number, examples:Array<{r1:string,r2:string,at:[number,number]}> }}
 */
export function findOutputOverlaps(fullFlat) {
  const subs = [];
  for (const seg of fullFlat || []) {
    const pts = Array.isArray(seg?.points) ? seg.points.map(readXY) : [];
    const rn = seg?.route_name ?? seg?.name ?? '';
    for (let i = 0; i + 1 < pts.length; i++) subs.push({ rn, seg, a: pts[i], b: pts[i + 1] });
  }
  const examples = [];
  let count = 0;
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      if (subs[i].rn === subs[j].rn) continue;
      if (segOverlap(subs[i].a, subs[i].b, subs[j].a, subs[j].b) > 1e-6) {
        count++;
        if (examples.length < 8) {
          examples.push({
            r1: subs[i].rn,
            r2: subs[j].rn,
            at: subs[i].a,
            seg1: subs[i].seg,
            seg2: subs[j].seg,
            a: subs[i].a,
            b: subs[i].b,
          });
        }
      }
    }
  }
  return { count, examples };
}

function perpOffsetUnit(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [0, 0];
  return [-dy / len, dx / len];
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
  const t = n.tags || {};
  // 🟡 交叉/🟣 切斷分類色：確保進到 tags（結果渲染器以 tags.node_class_color 上色）。
  //   標記可能在頂層(B3 snapStation 透傳)或已在 tags(原節點)，兩者皆收。
  const node_kind = t.node_kind ?? n.node_kind;
  const node_class_color = t.node_class_color ?? n.node_class_color;
  const node_class_r = t.node_class_r ?? n.node_class_r;
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

  // 線色 = way 顏色（骨架分類色）：讓結果檢視器之 path.color 直接採用，使輸出線與骨架同色。
  //   並保留 route_colors（該邊所有不同顏色）：≥2 色時結果檢視器可畫多色交錯虛線。
  for (const seg of fullFlat) {
    if (seg && seg.color == null) seg.color = seg.way_properties?.tags?.color || undefined;
    if (seg && seg.route_colors == null) {
      const rc = seg.way_properties?.tags?.route_colors;
      if (rc) seg.route_colors = rc;
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
