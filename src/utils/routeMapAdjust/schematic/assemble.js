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

function readXY(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

function routeNameOf(seg) {
  return String(seg?.route_name ?? seg?.name ?? '').trim();
}

function collectRouteColors(seg, into) {
  if (!seg) return;
  const add = (c) => { if (c) into.add(String(c).trim()); };
  add(seg.way_properties?.tags?.route_color);
  add(seg.way_properties?.tags?.color);
  add(seg.color);
  const rc = seg.route_colors ?? seg.way_properties?.tags?.route_colors;
  if (rc) String(rc).split(',').forEach((c) => add(c));
}

function applyRouteColorsToSeg(seg, colors) {
  const arr = [...colors];
  seg.route_colors = arr.join(',');
  seg.color = arr.length === 1 ? arr[0] : '#000000';
  if (!seg.way_properties) seg.way_properties = { tags: {} };
  if (!seg.way_properties.tags) seg.way_properties.tags = {};
  seg.way_properties.tags.route_colors = seg.route_colors;
  seg.way_properties.tags.color = seg.color;
}

const AXIS_EPS = 1e-6;
const ROUTE_PALETTE = ['#7B1FA2', '#1976D2', '#388E3C', '#F57C00', '#C2185B', '#5D4037'];

function collectCorridorColors(fullFlat, sis) {
  const byRoute = new Map();
  for (const si of sis) {
    const seg = fullFlat[si];
    const rn = routeNameOf(seg);
    if (!rn || byRoute.has(rn)) continue;
    const c = seg?.way_properties?.tags?.route_color || seg?.way_properties?.tags?.color || seg?.color;
    if (c) byRoute.set(rn, String(c).trim());
  }
  const colors = new Set(byRoute.values());
  if (colors.size < 2 && byRoute.size >= 2) {
    let i = 0;
    for (const rn of byRoute.keys()) {
      colors.add(ROUTE_PALETTE[i++ % ROUTE_PALETTE.length]);
      void rn;
    }
  }
  if (colors.size === 0) for (const si of sis) collectRouteColors(fullFlat[si], colors);
  return colors;
}

function axisCollinearRunKey(pts) {
  if (!pts || pts.length < 2) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (let i = 1; i + 1 < pts.length; i++) {
    const p = pts[i];
    if (Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) > AXIS_EPS) return null;
  }
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx <= AXIS_EPS && ady > AXIS_EPS) {
    return `V:${Math.round(a[0] * 1000) / 1000}:${Math.min(a[1], b[1])}:${Math.max(a[1], b[1])}`;
  }
  if (ady <= AXIS_EPS && adx > AXIS_EPS) {
    return `H:${Math.round(a[1] * 1000) / 1000}:${Math.min(a[0], b[0])}:${Math.max(a[0], b[0])}`;
  }
  if (adx > AXIS_EPS && ady > AXIS_EPS && Math.abs(adx - ady) <= AXIS_EPS) {
    const k1 = `${Math.round(a[0] * 1000) / 1000},${Math.round(a[1] * 1000) / 1000}`;
    const k2 = `${Math.round(b[0] * 1000) / 1000},${Math.round(b[1] * 1000) / 1000}`;
    return k1 < k2 ? `D:${k1}|${k2}` : `D:${k2}|${k1}`;
  }
  return null;
}

function mergeCorridorSections(fullFlat, sis, edgeTag) {
  const sorted = sis.slice().sort((a, b) =>
    String(fullFlat[a]?.route_name ?? '').localeCompare(String(fullFlat[b]?.route_name ?? ''))
  );
  const primary = sorted[0];
  const colors = collectCorridorColors(fullFlat, sis);
  const uniqRoutes = [...new Set(sorted.map((si) => routeNameOf(fullFlat[si])).filter(Boolean))];
  if (colors.size > 0) applyRouteColorsToSeg(fullFlat[primary], colors);
  fullFlat[primary]._schematicCorridorSkipDraw = false;
  fullFlat[primary]._schematicCorridorRoutes = uniqRoutes;
  fullFlat[primary]._schematicCorridorEdgeId = edgeTag;
  for (let i = 1; i < sorted.length; i++) {
    const si = sorted[i];
    fullFlat[si]._schematicCorridorSkipDraw = true;
    fullFlat[si]._schematicCorridorRoutes = uniqRoutes;
    fullFlat[si]._schematicCorridorEdgeId = edgeTag;
    if (colors.size > 0) applyRouteColorsToSeg(fullFlat[si], colors);
  }
}

function dedupeCollinearRunDraws(fullFlat) {
  const byKey = new Map();
  let groups = 0;
  for (let si = 0; si < fullFlat.length; si++) {
    const seg = fullFlat[si];
    if (seg?._schematicCorridorSkipDraw) continue;
    const pts = Array.isArray(seg?.points) ? seg.points.map(readXY) : null;
    if (!pts || pts.length < 2) continue;
    const rn = routeNameOf(seg);
    const key = axisCollinearRunKey(pts);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, { primary: si, routes: rn ? [rn] : [] });
      continue;
    }
    const g = byKey.get(key);
    if (rn && !g.routes.includes(rn)) g.routes.push(rn);
    if (g.primary === si) continue;
    groups++;
    const colors = collectCorridorColors(fullFlat, [g.primary, si]);
    if (colors.size > 0) applyRouteColorsToSeg(fullFlat[g.primary], colors);
    fullFlat[g.primary]._schematicCorridorRoutes = [...g.routes];
    fullFlat[si]._schematicCorridorSkipDraw = true;
    fullFlat[si]._schematicCorridorRoutes = [...g.routes];
    if (colors.size > 0) applyRouteColorsToSeg(fullFlat[si], colors);
  }
  return groups;
}

/**
 * 共軌／同形共線：只畫一條多色交錯虛線（純顯示），其餘 skip；不改座標／拓撲。
 */
export function resolveSharedCorridorDrawing(fullFlat, graph) {
  let corridorGroups = 0;
  for (const edge of graph?.edges || []) {
    if (edge.isLink) continue;
    const sis = (edge.sections || []).filter((si) => fullFlat[si]?.points?.length >= 2);
    if (sis.length <= 1) continue;
    corridorGroups++;
    mergeCorridorSections(fullFlat, sis, `edge:${edge.id}`);
  }
  const collinearGroups = dedupeCollinearRunDraws(fullFlat);
  return { corridorGroups, collinearGroups };
}

/**
 * 偵測輸出端共線重疊（已標 skip 的不計）。
 * @returns {{ count:number, examples:Array<{r1:string,r2:string,at:[number,number]}> }}
 */
export function findOutputOverlaps(fullFlat) {
  const subs = [];
  for (const seg of fullFlat || []) {
    if (seg?._schematicCorridorSkipDraw) continue;
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

  // 線色 = way 顏色（骨架分類色）：讓結果檢視器之 path.color 直接採用，使輸出線與骨架同色。
  //   並保留 route_colors（該邊所有不同顏色）：≥2 色時結果檢視器可畫多色交錯虛線。
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
