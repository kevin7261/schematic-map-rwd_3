/* eslint-disable no-console */

/**
 * 三個示意圖佈局圖層（Stroke-based／Hill Climbing／MILP）共用輸入。
 *
 * 與三篇論文一致：佈局從**真實地理座標**起步。流程：
 *  1. 自上游 `osm_2_geojson_2_json.geojsonData` 取 flat segments（經緯度）。
 *  2. buildConnectSkeleton：每 section 只留頭尾兩 connect 端點（黑點另存，最後沿邊內插放回）。
 *  3. scaleSkeletonToIntegerGrid：經緯度**等比例**縮放到整數格（uniform scale 保角→拓撲/嵌入不變），
 *     碰撞(兩不同站映到同格)時提高解析度重試。
 *
 * 不再用 v1 的「秩正規化」（會破壞真實比例）。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { syncOrthoFlatSegmentEndpoints } from '@/utils/layers/json_grid_coord_normalized/axisAlignGridNetworkHillClimb.js';
import { SCHEMATIC_SOURCE_LAYER_ID } from './layerIds.js';

export function readPt(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

export function writePt(p, x, y) {
  if (Array.isArray(p)) {
    p[0] = x;
    p[1] = y;
  } else if (p && typeof p === 'object') {
    p.x = x;
    p.y = y;
  }
}

function syncNodeGrid(seg, idx, x, y) {
  const n = seg?.nodes?.[idx];
  if (n && typeof n === 'object') {
    n.tags = { ...(n.tags || {}), x_grid: x, y_grid: y };
  }
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * 從完整 flat segments 建 connect 骨架：每段只取頭尾兩 connect 端點；中段黑點另存 sections。
 * @returns {{ skeletonFlat:Array, sections:Array }}
 */
export function buildConnectSkeleton(baseFlat) {
  const skeletonFlat = [];
  const sections = [];
  for (const seg of baseFlat) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
    const last = pts.length - 1;
    skeletonFlat.push({
      route_name: seg.route_name,
      name: seg.name,
      points: [clone(pts[0]), clone(pts[last])],
      nodes: [clone(nodes[0]) || { node_type: 'connect' }, clone(nodes[last]) || { node_type: 'connect' }],
      properties_start: clone(seg.properties_start),
      properties_end: clone(seg.properties_end),
      way_properties: clone(seg.way_properties),
    });
    sections.push({ blackNodes: nodes.slice(1, last).map(clone) });
  }
  return { skeletonFlat, sections };
}

/**
 * 把 connect 骨架的經緯度等比例縮放到整數格（就地改寫）。碰撞時提高解析度。
 * @returns {{ scale:number, cols:number, rows:number, connectCount:number, attempts:number }}
 */
export function scaleSkeletonToIntegerGrid(segments, opts = {}) {
  const EPS = 1e-9;
  const okey = (x, y) => `${Math.round(x / EPS)},${Math.round(y / EPS)}`;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const uniqueOrig = new Map(); // okey -> [x,y]
  for (const seg of segments) {
    for (const p of seg.points) {
      const [x, y] = readPt(p);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      uniqueOrig.set(okey(x, y), [x, y]);
    }
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  let target = opts.targetSpan ?? 48; // 期望最長邊的格數起點
  const maxTarget = opts.maxTargetSpan ?? 8192;
  let chosen = null;
  let attempts = 0;
  for (; target <= maxTarget; target *= 2) {
    attempts++;
    const scale = target / Math.max(w, h);
    const cellByOrig = new Map(); // okey -> [X,Y]
    const usedCell = new Map(); // "X,Y" -> okey
    let collision = false;
    for (const [k, [x, y]] of uniqueOrig) {
      const X = Math.round((x - minX) * scale);
      const Y = Math.round((y - minY) * scale);
      const ck = `${X},${Y}`;
      const owner = usedCell.get(ck);
      if (owner !== undefined && owner !== k) {
        collision = true;
        break;
      }
      usedCell.set(ck, k);
      cellByOrig.set(k, [X, Y]);
    }
    if (!collision) {
      chosen = { scale, cellByOrig };
      break;
    }
  }
  if (!chosen) {
    // 極端情況：用最後一次（容許少數重合，硬約束檢查會接手）
    const scale = maxTarget / Math.max(w, h);
    const cellByOrig = new Map();
    for (const [k, [x, y]] of uniqueOrig) {
      cellByOrig.set(k, [Math.round((x - minX) * scale), Math.round((y - minY) * scale)]);
    }
    chosen = { scale, cellByOrig };
  }

  let cols = 0;
  let rows = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.points.length; i++) {
      const [x, y] = readPt(seg.points[i]);
      const [X, Y] = chosen.cellByOrig.get(okey(x, y));
      writePt(seg.points[i], X, Y);
      syncNodeGrid(seg, i, X, Y);
      if (X > cols) cols = X;
      if (Y > rows) rows = Y;
    }
  }
  syncOrthoFlatSegmentEndpoints(segments);
  return {
    scale: chosen.scale,
    cols: cols + 1,
    rows: rows + 1,
    connectCount: chosen.cellByOrig.size,
    attempts,
  };
}

function nodeIdentity(node, x, y) {
  const t = (node && node.tags) || {};
  const name = node?.station_name ?? t.station_name ?? t.name;
  if (name != null && String(name).trim() !== '') return 'n:' + String(name).trim();
  const sid = node?.station_id ?? t.station_id;
  if (sid != null) {
    const s = String(sid).trim();
    if (s && s !== 'cross' && s !== 'connect') return 's:' + s;
  }
  return `xy:${x},${y}`;
}

/** 把整份 flat（含黑站）所有點等比例縮放到整數格（就地）。 */
function scaleAllFlatToGrid(segments, targetSpan = 200) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const seg of segments) for (const p of seg.points) {
    const [x, y] = readPt(p);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const scale = targetSpan / Math.max(1e-9, Math.max(maxX - minX, maxY - minY));
  for (const seg of segments) {
    for (let i = 0; i < seg.points.length; i++) {
      const [x, y] = readPt(seg.points[i]);
      writePt(seg.points[i], Math.round((x - minX) * scale), Math.round((y - minY) * scale));
    }
  }
  return { scale };
}

/**
 * #4 stroke 法輸入：每條路線(route)串成一條 stroke 折線（含所有站點），座標已縮放到格。
 * @returns {{ ok:boolean, message?:string, strokes?:Array, meta?:object }}
 */
export function resolveStrokeInput() {
  const dataStore = useDataStore();
  const src = dataStore.findLayerById(SCHEMATIC_SOURCE_LAYER_ID);
  if (!src) return { ok: false, message: `找不到上游圖層「${SCHEMATIC_SOURCE_LAYER_ID}」` };
  const geojson = src.geojsonData;
  if (!geojson?.features?.length) {
    return { ok: false, message: `請先開啟並載入圖層「OSM／GeoJSON → JSON」（geojsonData 尚無資料）。` };
  }
  let fields;
  try {
    fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
  } catch (e) {
    return { ok: false, message: '上游 GeoJSON 轉路網失敗：' + (e?.message || e) };
  }
  const baseFlat = JSON.parse(JSON.stringify(fields?.spaceNetworkGridJsonData || []));
  if (!baseFlat.length) return { ok: false, message: '上游路網為空。' };
  scaleAllFlatToGrid(baseFlat);

  // 依 route_name 分組各 section，串成一條 stroke 折線
  const byRoute = new Map();
  for (const seg of baseFlat) {
    const rn = seg.route_name ?? seg.name ?? '';
    if (!byRoute.has(rn)) byRoute.set(rn, []);
    byRoute.get(rn).push(seg);
  }
  const strokes = [];
  for (const [rn, segs] of byRoute) {
    const chained = chainSectionsIntoPolyline(segs);
    if (chained && chained.points.length >= 2) {
      strokes.push({ route_name: rn, color: segs[0]?.way_properties?.tags?.color, ...chained });
    }
  }
  if (!strokes.length) return { ok: false, message: '無法形成 stroke。' };
  strokes.sort((a, b) => polylineLength(b.points) - polylineLength(a.points)); // 依長度排名（高→低）
  return {
    ok: true,
    strokes,
    meta: {
      sourceLayerId: SCHEMATIC_SOURCE_LAYER_ID,
      strokeCount: strokes.length,
      pointCount: strokes.reduce((s, k) => s + k.points.length, 0),
    },
  };
}

function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** 把一條 route 的多個 section（共用 connect 端點）串成單一折線（points + nodes + identity）。 */
function chainSectionsIntoPolyline(segs) {
  // 每段 = 連續點列；以端點座標鍵建鄰接，找端點(出現一次的連接)起走
  const endKey = (seg, which) => {
    const p = which === 0 ? seg.points[0] : seg.points[seg.points.length - 1];
    const [x, y] = readPt(p);
    return `${x},${y}`;
  };
  const deg = new Map();
  for (const seg of segs) {
    for (const w of [0, 1]) {
      const k = endKey(seg, w);
      deg.set(k, (deg.get(k) || 0) + 1);
    }
  }
  const used = new Set();
  // 找起點：某段一端 degree==1
  let startSeg = segs.find((s) => deg.get(endKey(s, 0)) === 1) || segs.find((s) => deg.get(endKey(s, 1)) === 1) || segs[0];
  let atKey = deg.get(endKey(startSeg, 0)) === 1 ? endKey(startSeg, 0) : endKey(startSeg, 0);
  const points = [];
  const nodes = [];
  let curKey = atKey;
  let guard = 0;
  let seg = startSeg;
  while (seg && guard++ < segs.length + 2) {
    used.add(seg);
    const fwd = endKey(seg, 0) === curKey;
    const segPts = fwd ? seg.points : [...seg.points].reverse();
    const segNodes = fwd ? seg.nodes || [] : [...(seg.nodes || [])].reverse();
    for (let i = 0; i < segPts.length; i++) {
      const [x, y] = readPt(segPts[i]);
      if (points.length && points[points.length - 1][0] === x && points[points.length - 1][1] === y) continue; // 接點去重
      points.push([x, y]);
      const nd = segNodes[i];
      nodes.push({ node: nd || null, id: nodeIdentity(nd, x, y) });
    }
    curKey = endKey(seg, fwd ? 1 : 0);
    seg = segs.find((s) => !used.has(s) && (endKey(s, 0) === curKey || endKey(s, 1) === curKey));
  }
  return { points, nodes };
}

/**
 * @returns {{ ok:boolean, message?:string, skeletonFlat?:Array, sections?:Array, meta?:object }}
 */
export function resolveSchematicInput(executingLayerId) {
  const dataStore = useDataStore();
  // 優先使用執行圖層自身已匯入的 geojsonData（從畫線／從 OSM→JSON 匯入）；
  // 否則回退上游 osm_2_geojson_2_json（向後相容）。
  const own = executingLayerId ? dataStore.findLayerById(executingLayerId) : null;
  const src =
    own && own.geojsonData?.features?.length
      ? own
      : dataStore.findLayerById(SCHEMATIC_SOURCE_LAYER_ID);
  if (!src) return { ok: false, message: `找不到上游圖層「${SCHEMATIC_SOURCE_LAYER_ID}」` };
  const geojson = src.geojsonData;
  if (!geojson?.features?.length) {
    return {
      ok: false,
      message: `此圖層尚無輸入資料，請先「從畫線匯入」或「從 OSM／GeoJSON → JSON 匯入」。`,
    };
  }

  let fields;
  try {
    fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
  } catch (e) {
    console.error('schematic 輸入：geojson → flat 失敗', e);
    return { ok: false, message: '上游 GeoJSON 轉路網失敗：' + (e?.message || e) };
  }
  const baseFlat = fields?.spaceNetworkGridJsonData;
  if (!Array.isArray(baseFlat) || baseFlat.length === 0) {
    return { ok: false, message: '上游路網為空。' };
  }

  const { skeletonFlat, sections } = buildConnectSkeleton(baseFlat);
  if (skeletonFlat.length === 0) return { ok: false, message: '上游路網無可用 connect 骨架。' };
  const grid = scaleSkeletonToIntegerGrid(skeletonFlat, {});
  const blackCount = sections.reduce((s, sec) => s + (sec.blackNodes?.length || 0), 0);

  return {
    ok: true,
    skeletonFlat,
    sections,
    meta: {
      sourceLayerId: src.layerId,
      gridCols: grid.cols,
      gridRows: grid.rows,
      gridScale: Math.round(grid.scale * 1000) / 1000,
      connectCount: grid.connectCount,
      sectionCount: skeletonFlat.length,
      blackStationCount: blackCount,
    },
  };
}
