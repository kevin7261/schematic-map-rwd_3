/**
 * ⑨ 示意圖佈局（正規化）— 藍色網格 snap + 邊界切段 + 黑點均分
 *
 * 預覽 hover：layer.geojsonData 原始 LineString way 端點 snap（valueToNearestIndex）。
 * 「開始執行」：
 *   1. 各路線 snap 至藍色網格（allColorSplitNodes 四分樹）
 *   2. 在紅／黃／藍／粉紅／棕／灰（及紫）邊界點**切開**（buildConnectSkeleton）
 *   3. 純黑點抽離後沿邊均分插回
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildSchematicGraph, splitHighDegreeNodes } from '../graph.js';
import { buildConnectSkeleton } from '../input.js';
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
/** way 頂點 ↔ Point 容差（度；≈2m），骨架 way 与 Point 常因投影略有偏差。 */
const POINT_MATCH_TOL = 2e-5;
/** 黑點投影到 way 的最大垂距（度）。 */
const ON_WAY_TOL = 2.5e-5;

/** 純黑點（單線中段站；非邊界切點）。 */
function isBlackDotProps(props) {
  if (!props) return false;
  const t = props?.tags || {};
  if (t.node_kind === 'black') return true;
  if (t.node_kind == null) {
    const c = String(t.node_class_color ?? props.node_class_color ?? '').toLowerCase();
    if (c === '#000000' || c === '#000') return true;
  }
  return false;
}

/**
 * 邊界切點：紅／黃／藍／粉紅／棕／灰（及紫、交叉）—「開始執行」時在此切開路線。
 */
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

function boundarySplitKey(props, lon, lat) {
  const t = props?.tags || {};
  const sid = String(t.station_id ?? props?.station_id ?? '').trim();
  if (sid) return `id:${sid}`;
  const nm = String(t.station_name ?? props?.station_name ?? '').trim();
  if (nm) return `nm:${nm}`;
  return coordKey(lon, lat);
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

function wayTotalLen(coords) {
  let s = 0;
  for (let k = 0; k < coords.length - 1; k++) {
    const [ax, ay] = coords[k];
    const [bx, by] = coords[k + 1];
    s += Math.hypot(bx - ax, by - ay);
  }
  return s;
}


function mkVertexNode(props, gx, gy, fallbackType = 'line') {
  const base = props ? JSON.parse(JSON.stringify(props)) : {};
  const t = base.tags || {};
  const node_type = base.node_type ?? t.node_type ?? fallbackType;
  return {
    ...base,
    node_type,
    x_grid: gx,
    y_grid: gy,
    tags: { ...t, x_grid: gx, y_grid: gy },
  };
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

/** geojson Point features → 精確 map + 全點列表（供容差匹配／沿 way 掃描）。 */
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

/**
 * geojson LineString way → snap 後 flat（保留邊界切點頂點 + 黑點 + 幾何轉折；供 buildConnectSkeleton 切段）。
 */
function snapGeojsonWaysToFlat(geojson, snap, ptIndex) {
  const { byKey: ptProps, all: pointAll } = ptIndex;
  const flat = [];

  for (const f of geojson.features || []) {
    if (f?.geometry?.type !== 'LineString') continue;
    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const tags = f.properties?.tags || {};
    const last = coords.length - 1;
    const totalLen = wayTotalLen(coords);

    /** @type {Array<{ kind:'split'|'black', pos:number, props:object, gxy?:[number,number] }>} */
    const events = [];
    const usedBoundary = new Set();
    const usedBlack = new Set();

    const pushSplit = (idx, props, lon, lat) => {
      const bk = boundarySplitKey(props || {}, lon, lat);
      if (usedBoundary.has(bk)) return;
      usedBoundary.add(bk);
      const pr = projectOnWayLonLat(lon, lat, coords);
      events.push({
        kind: 'split',
        pos: pr ? pr.pos : idx,
        props: props ? JSON.parse(JSON.stringify(props)) : {},
        gxy: snap.snapLonLat(lon, lat),
      });
    };

    const pushBlack = (props, lon, lat) => {
      const bk = blackDotKey(props, lon, lat);
      if (usedBlack.has(bk)) return;
      usedBlack.add(bk);
      const pr = projectOnWayLonLat(lon, lat, coords);
      if (!pr || pr.perp > ON_WAY_TOL) return;
      if (pr.pos <= totalLen * 1e-9 || pr.pos >= totalLen * (1 - 1e-9)) return;
      events.push({
        kind: 'black',
        pos: pr.pos,
        props: JSON.parse(JSON.stringify(props)),
        gxy: snap.snapLonLat(lon, lat),
      });
    };

    // way 頂點
    for (let i = 0; i <= last; i++) {
      const [lon, lat] = coords[i];
      const props = lookupPointProps(lon, lat, ptProps, pointAll);
      if (i === 0 || i === last) {
        pushSplit(i, props, lon, lat);
      } else if (props && isBoundarySplitProps(props)) {
        pushSplit(i, props, lon, lat);
      } else if (props && isBlackDotProps(props)) {
        pushBlack(props, lon, lat);
      }
    }

    // 沿 way 掃描 Point（頂點座標不完全重合時）
    for (const p of pointAll) {
      const pr = projectOnWayLonLat(p.lon, p.lat, coords);
      if (!pr || pr.perp > ON_WAY_TOL) continue;
      if (pr.pos <= totalLen * 1e-9 || pr.pos >= totalLen * (1 - 1e-9)) continue;
      if (isBoundarySplitProps(p.props)) pushSplit(-1, p.props, p.lon, p.lat);
      else if (isBlackDotProps(p.props)) pushBlack(p.props, p.lon, p.lat);
    }

    events.sort((a, b) => a.pos - b.pos);

    // 相鄰 split 間建段（split 之間可含 black + 幾何轉折）
    const splits = events.filter((e) => e.kind === 'split');
    if (splits.length < 2) continue;

    for (let si = 0; si + 1 < splits.length; si++) {
      const a = splits[si];
      const b = splits[si + 1];
      if (a.gxy[0] === b.gxy[0] && a.gxy[1] === b.gxy[1]) continue;

      /** @type {Array<{ pos:number, gxy:[number,number], node:object }>} */
      const interior = [];

      for (let i = 1; i < last; i++) {
        const [lon, lat] = coords[i];
        const pr = projectOnWayLonLat(lon, lat, coords);
        if (!pr || pr.pos <= a.pos + 1e-9 || pr.pos >= b.pos - 1e-9) continue;
        const props = lookupPointProps(lon, lat, ptProps, pointAll);
        if (props && (isBoundarySplitProps(props) || isBlackDotProps(props))) continue;
        const gxy = snap.snapLonLat(lon, lat);
        interior.push({ pos: pr.pos, gxy, node: mkVertexNode(props, gxy[0], gxy[1], 'bend') });
      }

      for (const bl of events) {
        if (bl.kind !== 'black' || bl.pos <= a.pos + 1e-9 || bl.pos >= b.pos - 1e-9) continue;
        const nd = mkVertexNode(bl.props, bl.gxy[0], bl.gxy[1], 'line');
        nd.node_kind = 'black';
        nd.tags = { ...(nd.tags || {}), node_kind: 'black' };
        interior.push({ pos: bl.pos, gxy: bl.gxy, node: nd });
      }

      interior.sort((x, y) => x.pos - y.pos);

      const points = [a.gxy.slice()];
      const nodes = [mkVertexNode(a.props, a.gxy[0], a.gxy[1], 'connect')];
      for (const it of interior) {
        points.push(it.gxy.slice());
        nodes.push(it.node);
      }
      points.push(b.gxy.slice());
      nodes.push(mkVertexNode(b.props, b.gxy[0], b.gxy[1], 'connect'));

      const keepPts = [];
      const keepNodes = [];
      for (let pi = 0; pi < points.length; pi++) {
        const p = points[pi];
        const prev = keepPts[keepPts.length - 1];
        if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
        keepPts.push(p);
        keepNodes.push(nodes[pi]);
      }
      if (keepPts.length < 2) continue;

      flat.push({
        route_name: tags.route_name ?? tags.route_id ?? '',
        name: tags.route_name ?? tags.route_id ?? '',
        points: keepPts,
        nodes: keepNodes,
        properties_start: {
          x_grid: keepPts[0][0],
          y_grid: keepPts[0][1],
          tags: { x_grid: keepPts[0][0], y_grid: keepPts[0][1] },
          ...(a.props || {}),
        },
        properties_end: {
          x_grid: keepPts[keepPts.length - 1][0],
          y_grid: keepPts[keepPts.length - 1][1],
          tags: {
            x_grid: keepPts[keepPts.length - 1][0],
            y_grid: keepPts[keepPts.length - 1][1],
          },
          ...(b.props || {}),
        },
        way_properties: { tags: { ...tags } },
        color: tags.color,
        route_colors: tags.route_colors,
      });
    }
  }

  return flat;
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

export function executeNormalizeRma() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(LAYER_ID);
  if (!layer) {
    console.warn('executeNormalizeRma：找不到圖層 schematic_rma_normalize');
    return false;
  }

  const geojson = layer.geojsonData;
  if (!geojson?.features?.length) {
    console.warn('executeNormalizeRma：圖層尚無輸入資料，請先載入骨架。');
    return false;
  }
  layer.quadtreePartition = null;

  const snap = buildGridSnapFromGeojson(geojson);
  if (!snap) {
    console.warn('executeNormalizeRma：藍色網格 snap 建立失敗。');
    return false;
  }
  const ptIndex = buildPointIndex(geojson);
  const snappedFlat = snapGeojsonWaysToFlat(geojson, snap, ptIndex);
  if (!Array.isArray(snappedFlat) || snappedFlat.length === 0) {
    console.warn('executeNormalizeRma：無 way 可正規化。');
    return false;
  }

  // 紅／黃／藍／粉紅／棕／灰 邊界切開 → 黑點抽離 → 沿邊均分插回
  const { skeletonFlat, sections } = buildConnectSkeleton(snappedFlat);
  const fullFlat = reinsertBlackStations(skeletonFlat, sections);
  if (!Array.isArray(fullFlat) || fullFlat.length === 0) {
    console.warn('executeNormalizeRma：切段後無有效路網。');
    return false;
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
    segmentCountBeforeSplit: snappedFlat.length,
    segmentCountAfterSplit: fullFlat.length,
    _schematicGraph: graph,
    gridCols: snap.sortedX.length - 1,
    gridRows: snap.sortedY.length - 1,
  });
  return result.ok !== false;
}
