/**
 * ⑨ 示意圖佈局（正規化）— geojson way 端點 snap 1:1 + way 內彩色邊界切段
 *
 * 不變量：每條 LineString 的**起訖端點** snap 與預覽 hover 一致（同一 xs/ys）。
 * 不呼叫 buildConnectSkeleton（不跨 way 合併／重拓撲）。
 *
 * 流程：
 *   1. 每條 way 在紅／黃／藍／粉紅／棕／灰（及紫）邊界點**切開**（僅 way 內）
 *   2. 各段 snap → 拉直（共線簡化）→ 純黑點 (j+1)/(K+1) 均分
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildSchematicGraph, splitHighDegreeNodes } from '../graph.js';
import { reinsertBlackStations, writeSchematicResultToLayer } from '../assemble.js';
import { buildSnapLonLatFromC3Segments } from '@/utils/taipeiTest4/c3ToD3CoordNormalize.js';
import {
  GRAY_DOT_HEX,
  RIGHT_ANGLE_PINK_HEX,
  DEMOTED_PINK_BROWN_HEX,
} from '../../routeStations.js';

const LAYER_ID = 'schematic_rma_normalize';

// ── 工具 ─────────────────────────────────────────────────────────────────────

const num = (v) => Number(v);
const coordKey = (lon, lat) => `${num(lon).toFixed(6)},${num(lat).toFixed(6)}`;
/** way 頂點 ↔ Point 容差（度；≈2m），骨架 way 與 Point 常因投影略有偏差。 */
const POINT_MATCH_TOL = 2e-5;
/** 黑點投影到 way 的最大垂距（度）。 */
const ON_WAY_TOL = 2.5e-5;

/** 純黑點（均分插回；粉紅／灰／棕為邊界切點，不是黑點）。 */
function isBlackOnlyProps(props) {
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

/** 紅／黃／藍／粉紅／棕／灰（及紫）— way 內切開點。 */
function isColoredBoundaryProps(props) {
  if (!props || isBlackOnlyProps(props)) return false;
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

function isMidRouteStationProps(props) {
  return isBlackOnlyProps(props);
}

function blackDotKey(props, lon, lat) {
  const t = props?.tags || {};
  const sid = String(t.station_id ?? props?.station_id ?? '').trim();
  if (sid) return `id:${sid}`;
  const nm = String(t.station_name ?? props?.station_name ?? '').trim();
  if (nm) return `nm:${nm}`;
  return coordKey(lon, lat);
}

/** 點 (lon,lat) 投影到折線 coords；回傳 { pos, perp } 或 null（pos=沿線弧長）。 */
function projectOnWayLonLat(lon, lat, coords) {
  let best = null;
  let cum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const segLen = Math.hypot(dx, dy);
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((lon - ax) * dx + (lat - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const perp = Math.hypot(lon - cx, lat - cy);
    if (!best || perp < best.perp) best = { pos: cum + segLen * t, perp };
    cum += segLen;
  }
  return best;
}

function dedupeConsecutivePts(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** snap 後共線之中段頂點可消去 → 骨架直線段只留端點（車站由黑點均分插回）。 */
function simplifyCollinearKeepPts(pts, eps = 1e-6) {
  if (!pts || pts.length <= 2) return pts;
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    if (Math.abs(dx * (y - y0) - dy * (x - x0)) > eps) return pts;
  }
  return [pts[0], pts[pts.length - 1]];
}

/**
 * 自骨架 geojson 取彩色點排名作藍色網格（與預覽 hover、網格線同一組 xs/ys）。
 * @returns {{ snapLonLat:Function, sortedX:number[], sortedY:number[], bounds:object } | null}
 */
function buildGridSnapFromGeojson(geojson) {
  if (!geojson?.features?.length) return null;
  let fields;
  try {
    fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
  } catch (e) {
    console.error('buildGridSnapFromGeojson：GeoJSON → flat 失敗', e);
    return null;
  }
  const baseFlat = fields?.spaceNetworkGridJsonData;
  if (!Array.isArray(baseFlat) || baseFlat.length === 0) return null;
  return buildSnapLonLatFromC3Segments(baseFlat, { allColorSplitNodes: true });
}

/** geojson Point features → 精確 map + 全點列表（供容差匹配／沿 way 掃描黑點）。 */
function buildPointIndex(geojson) {
  const byKey = new Map();
  const all = [];
  for (const f of geojson.features || []) {
    if (f?.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates || [];
    if (lon == null || lat == null) continue;
    const props = f.properties || {};
    byKey.set(coordKey(lon, lat), props);
    all.push({ lon, lat, props });
  }
  return { byKey, all };
}

function lookupPointProps(lon, lat, byKey, all) {
  const exact = byKey.get(coordKey(lon, lat));
  if (exact) return exact;
  let best = null;
  let bd = POINT_MATCH_TOL;
  for (const p of all) {
    const d = Math.hypot(p.lon - lon, p.lat - lat);
    if (d <= bd) {
      bd = d;
      best = p.props;
    }
  }
  return best;
}

function buildSegmentFromWayRange(coords, idxA, idxB, snap, ptProps, pointAll, tags, usedBlack) {
  if (idxB <= idxA) return null;
  const subCoords = coords.slice(idxA, idxB + 1);
  if (subCoords.length < 2) return null;
  const last = subCoords.length - 1;
  const subLen = (() => {
    let s = 0;
    for (let k = 0; k < last; k++) {
      s += Math.hypot(subCoords[k + 1][0] - subCoords[k][0], subCoords[k + 1][1] - subCoords[k][1]);
    }
    return s;
  })();

  const blackEntries = [];
  const interiorKeep = [];

  for (let i = 1; i < last; i++) {
    const [lon, lat] = subCoords[i];
    const props = lookupPointProps(lon, lat, ptProps, pointAll);
    if (props && isMidRouteStationProps(props)) {
      const bk = blackDotKey(props, lon, lat);
      if (!usedBlack.has(bk)) {
        usedBlack.add(bk);
        const pr = projectOnWayLonLat(lon, lat, subCoords);
        blackEntries.push({ pos: pr ? pr.pos : i, props: JSON.parse(JSON.stringify(props)) });
      }
    } else if (!props || !isColoredBoundaryProps(props)) {
      interiorKeep.push(snap.snapLonLat(lon, lat));
    }
  }

  for (const p of pointAll) {
    if (!isMidRouteStationProps(p.props)) continue;
    const bk = blackDotKey(p.props, p.lon, p.lat);
    if (usedBlack.has(bk)) continue;
    const pr = projectOnWayLonLat(p.lon, p.lat, subCoords);
    if (!pr || pr.perp > ON_WAY_TOL) continue;
    if (pr.pos <= subLen * 1e-9 || pr.pos >= subLen * (1 - 1e-9)) continue;
    usedBlack.add(bk);
    blackEntries.push({ pos: pr.pos, props: JSON.parse(JSON.stringify(p.props)) });
  }

  blackEntries.sort((a, b) => a.pos - b.pos);

  const startGxy = snap.snapLonLat(subCoords[0][0], subCoords[0][1]);
  const endGxy = snap.snapLonLat(subCoords[last][0], subCoords[last][1]);
  let keepPts = dedupeConsecutivePts([startGxy, ...interiorKeep, endGxy]);
  keepPts = simplifyCollinearKeepPts(keepPts);
  if (keepPts.length < 2) return null;
  if (keepPts[0][0] === keepPts[keepPts.length - 1][0] && keepPts[0][1] === keepPts[keepPts.length - 1][1]) {
    return null;
  }

  const startProps = lookupPointProps(subCoords[0][0], subCoords[0][1], ptProps, pointAll);
  const endProps = lookupPointProps(subCoords[last][0], subCoords[last][1], ptProps, pointAll);
  const mkEnd = (props, gx, gy) => {
    const base = props ? JSON.parse(JSON.stringify(props)) : {};
    const t = base.tags || {};
    const node_class_color = t.node_class_color ?? base.node_class_color;
    const node_kind = t.node_kind ?? base.node_kind;
    const epType = t.type ?? base.type;
    return {
      ...base,
      node_type: 'connect',
      ...(node_class_color != null ? { node_class_color } : {}),
      ...(node_kind != null ? { node_kind } : {}),
      x_grid: gx,
      y_grid: gy,
      tags: {
        ...t,
        node_type: 'connect',
        ...(node_class_color != null ? { node_class_color } : {}),
        ...(node_kind != null ? { node_kind } : {}),
        ...(epType != null ? { type: epType } : {}),
        x_grid: gx,
        y_grid: gy,
      },
    };
  };

  return {
    skeleton: {
      route_name: tags.route_name ?? tags.route_id ?? '',
      name: tags.route_name ?? tags.route_id ?? '',
      points: keepPts,
      nodes: [
        mkEnd(startProps, keepPts[0][0], keepPts[0][1]),
        mkEnd(endProps, keepPts[keepPts.length - 1][0], keepPts[keepPts.length - 1][1]),
      ],
      properties_start: {
        ...mkEnd(startProps, keepPts[0][0], keepPts[0][1]),
        x_grid: keepPts[0][0],
        y_grid: keepPts[0][1],
      },
      properties_end: {
        ...mkEnd(endProps, keepPts[keepPts.length - 1][0], keepPts[keepPts.length - 1][1]),
        x_grid: keepPts[keepPts.length - 1][0],
        y_grid: keepPts[keepPts.length - 1][1],
      },
      way_properties: { tags: { ...tags } },
      color: tags.color,
      route_colors: tags.route_colors,
    },
    section: { blackNodes: blackEntries.map((e) => e.props) },
  };
}

/**
 * 每條 geojson LineString way：端點 snap 1:1；way 內彩色邊界切開；黑點均分插回。
 */
function snapGeojsonWaysToFlat(geojson, snap, ptIndex) {
  const { byKey: ptProps, all: pointAll } = ptIndex;
  const skeleton = [];
  const sections = [];

  for (const f of geojson.features || []) {
    if (f?.geometry?.type !== 'LineString') continue;
    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const tags = f.properties?.tags || {};
    const last = coords.length - 1;
    const usedBlack = new Set();

    // 切點：way 起訖 + 內部彩色邊界頂點
    const splitIdx = new Set([0, last]);
    for (let i = 1; i < last; i++) {
      const props = lookupPointProps(coords[i][0], coords[i][1], ptProps, pointAll);
      if (props && isColoredBoundaryProps(props)) splitIdx.add(i);
    }
    // 沿 way 的彩色邊界 Point（略偏頂點時對應到最近切點頂點）
    for (const p of pointAll) {
      if (!isColoredBoundaryProps(p.props)) continue;
      const pr = projectOnWayLonLat(p.lon, p.lat, coords);
      if (!pr || pr.perp > ON_WAY_TOL) continue;
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i <= last; i++) {
        const d = Math.hypot(coords[i][0] - p.lon, coords[i][1] - p.lat);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      if (bestD <= POINT_MATCH_TOL) splitIdx.add(bestI);
    }

    const indices = [...splitIdx].sort((a, b) => a - b);
    for (let si = 0; si + 1 < indices.length; si++) {
      const seg = buildSegmentFromWayRange(
        coords,
        indices[si],
        indices[si + 1],
        snap,
        ptProps,
        pointAll,
        tags,
        usedBlack
      );
      if (seg) {
        skeleton.push(seg.skeleton);
        sections.push(seg.section);
      }
    }
  }

  return reinsertBlackStations(skeleton, sections);
}

// ── 正規化網格預覽（載入骨架時計算，供「開始執行」前顯示藍色網格＋ hover snap） ───────

/**
 * 回傳藍色網格線 xs/ys（彩色點經/緯度排名；與執行 snap 同一組），供「開始執行」前預覽。
 * @returns {{ xs:number[], ys:number[], bounds:object } | null}
 */
export function computeQuadtreePartitionFromGeojson(geojson) {
  const snap = buildGridSnapFromGeojson(geojson);
  if (!snap || !Array.isArray(snap.sortedX) || !Array.isArray(snap.sortedY)) return null;
  return { xs: snap.sortedX.slice(), ys: snap.sortedY.slice(), bounds: snap.bounds };
}

// ── 主執行函式 ────────────────────────────────────────────────────────────────

/**
 * ⑨ 正規化核心（純函式）：骨架 geojson → flat 路網（含黑點均分插回）。
 * @returns {{ ok: boolean, message?: string, fullFlat?: Array, stats?: object }}
 */
export function normalizeSkeletonGeojsonToFlat(geojson) {
  if (!geojson?.features?.length) {
    return { ok: false, message: '圖層尚無輸入資料，請先載入骨架。' };
  }

  const snap = buildGridSnapFromGeojson(geojson);
  if (!snap) {
    return { ok: false, message: '藍色網格 snap 建立失敗。' };
  }
  const ptIndex = buildPointIndex(geojson);
  const fullFlat = snapGeojsonWaysToFlat(geojson, snap, ptIndex);
  if (!Array.isArray(fullFlat) || fullFlat.length === 0) {
    return { ok: false, message: '無 way 可正規化。' };
  }

  let graph = buildSchematicGraph(fullFlat);
  try {
    graph = splitHighDegreeNodes(graph);
  } catch {
    /* 非致命 */
  }

  return {
    ok: true,
    message: '正規化完成。',
    fullFlat,
    graph,
    stats: {
      segmentCount: fullFlat.length,
      gridCols: snap.sortedX.length - 1,
      gridRows: snap.sortedY.length - 1,
      graphNodes: graph?.nodes?.length ?? 0,
      graphEdges: graph?.edges?.length ?? 0,
    },
  };
}

export function executeNormalizeRma() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(LAYER_ID);
  if (!layer) {
    return { ok: false, message: '找不到圖層 schematic_rma_normalize' };
  }

  const geojson = layer.geojsonData;
  layer.quadtreePartition = null;

  const result = normalizeSkeletonGeojsonToFlat(geojson);
  if (!result.ok) return result;

  const write = writeSchematicResultToLayer(LAYER_ID, result.fullFlat, {
    sourceLayerId: LAYER_ID,
    coordNormalize: true,
    _schematicGraph: result.graph,
    gridCols: result.stats?.gridCols,
    gridRows: result.stats?.gridRows,
  });

  if (write.ok !== false) {
    dataStore.routeSchematicTick += 1;
  }

  return { ok: write.ok !== false, message: '正規化完成。', stats: write.stats ?? result.stats };
}
