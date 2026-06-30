/**
 * ⑨ 示意圖佈局（正規化）— 每條 geojson way 1:1 snap，黑點事後均分
 *
 * ⚠️ 不變量（使用者硬性要求，見記憶 normalize9-uses-rank-normalization）：
 *   「執行後每條邊 hover 的端點 == 你預覽 hover 的端點」。
 *   預覽 hover 的是 layer.geojsonData 的**原始 LineString way**（一條 way＝一條邊），
 *   端點 snap＝valueToNearestIndex(lon/lat, xs/ys)（藍色網格＝彩色點經/緯度排名）。
 *
 *   故執行**完全照 geojson 的 way 1:1**：
 *     - 不呼叫 buildConnectSkeleton（不重切段、不在 connect 點切、不跨邊合併）
 *     - 每條 LineString → 一條 flat segment，端點＋幾何轉折頂點就地 snap 到藍色網格
 *     - 中段「黑點站」抽離後沿 snap 後的邊**依弧長均分插回**（黑點不參與 snap／佈局，最後才平均放上）
 *
 *   如此端點 == 預覽 snap（兩者皆對同一條 way 的同一端點、用同一組 xs/ys 做 valueToNearestIndex）。
 *   請勿改回 buildConnectSkeleton／任何重切段或位移步驟，否則執行端點會與預覽不一致。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildSchematicGraph, splitHighDegreeNodes } from '../graph.js';
import { reinsertBlackStations, writeSchematicResultToLayer } from '../assemble.js';
import { buildSnapLonLatFromC3Segments } from '@/utils/taipeiTest4/c3ToD3CoordNormalize.js';

const LAYER_ID = 'schematic_rma_normalize';

// ── 工具 ─────────────────────────────────────────────────────────────────────

const num = (v) => Number(v);
const coordKey = (lon, lat) => `${num(lon).toFixed(6)},${num(lat).toFixed(6)}`;

/** 黑點站家族（路線中段站；snap 後沿邊均分插回，不當佈局頂點）。 */
const BLACK_DOT_KINDS = new Set(['black', 'gray', 'right_angle_pink', 'brown']);

function isBlackDotProps(props) {
  const t = props?.tags || {};
  if (BLACK_DOT_KINDS.has(t.node_kind)) return true;
  // 無 node_kind 但分類色為黑 → 視為黑點。connect(紅)/terminal(藍)/cross(黃)/purple(紫) 皆不算。
  if (t.node_kind == null) {
    const c = String(t.node_class_color ?? '').toLowerCase();
    if (c === '#000000') return true;
  }
  return false;
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

/** geojson Point features → coordKey → node properties（供端點站名／黑點分類查找）。 */
function buildPointPropsMap(geojson) {
  const m = new Map();
  for (const f of geojson.features || []) {
    if (f?.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates || [];
    if (lon == null || lat == null) continue;
    m.set(coordKey(lon, lat), f.properties || {});
  }
  return m;
}

/**
 * 每條 geojson LineString way → 一條 snap 後 flat segment（1:1，不重切、不合併）。
 *   端點＋幾何轉折頂點 snap 到藍色網格；中段黑點站抽離 → 沿 snap 後邊依弧長均分插回。
 */
function snapGeojsonWaysToFlat(geojson, snap, ptProps) {
  const skeleton = [];
  const sections = [];
  for (const f of geojson.features || []) {
    if (f?.geometry?.type !== 'LineString') continue;
    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const tags = f.properties?.tags || {};

    const keepPts = []; // 保留為佈局頂點（端點＋轉折）：snap 後格座標
    const blackNodes = []; // 中段黑點站（依序）：snap 後沿邊均分插回
    const last = coords.length - 1;
    for (let i = 0; i < coords.length; i++) {
      const [lon, lat] = coords[i];
      const isEnd = i === 0 || i === last;
      const props = ptProps.get(coordKey(lon, lat));
      if (!isEnd && props && isBlackDotProps(props)) {
        blackNodes.push(JSON.parse(JSON.stringify(props)));
      } else {
        const [gx, gy] = snap.snapLonLat(lon, lat);
        keepPts.push([gx, gy]);
      }
    }
    if (keepPts.length < 2) continue;

    const startGxy = keepPts[0];
    const endGxy = keepPts[keepPts.length - 1];
    const startProps = ptProps.get(coordKey(coords[0][0], coords[0][1]));
    const endProps = ptProps.get(coordKey(coords[last][0], coords[last][1]));
    const mkEnd = (props, gx, gy) => {
      const base = props ? JSON.parse(JSON.stringify(props)) : {};
      const t = base.tags || {};
      return {
        ...base,
        node_type: 'connect',
        x_grid: gx,
        y_grid: gy,
        tags: { ...t, x_grid: gx, y_grid: gy },
      };
    };

    skeleton.push({
      route_name: tags.route_name ?? tags.route_id ?? '',
      name: tags.route_name ?? tags.route_id ?? '',
      points: keepPts,
      nodes: [mkEnd(startProps, startGxy[0], startGxy[1]), mkEnd(endProps, endGxy[0], endGxy[1])],
      properties_start: { x_grid: startGxy[0], y_grid: startGxy[1], tags: { x_grid: startGxy[0], y_grid: startGxy[1] } },
      properties_end: { x_grid: endGxy[0], y_grid: endGxy[1], tags: { x_grid: endGxy[0], y_grid: endGxy[1] } },
      way_properties: { tags: { ...tags } },
      color: tags.color,
      route_colors: tags.route_colors,
    });
    sections.push({ blackNodes });
  }

  // 黑點沿 snap 後邊依弧長均分插回（與 ①–⑧ 同一函式：黑點最後才平均放上）。
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
  // 開始執行 → 清掉「載入骨架時」的藍色網格預覽（結果改為整數格空間）。
  layer.quadtreePartition = null;

  const snap = buildGridSnapFromGeojson(geojson);
  if (!snap) {
    console.warn('executeNormalizeRma：藍色網格 snap 建立失敗。');
    return false;
  }
  const ptProps = buildPointPropsMap(geojson);
  const fullFlat = snapGeojsonWaysToFlat(geojson, snap, ptProps);
  if (!Array.isArray(fullFlat) || fullFlat.length === 0) {
    console.warn('executeNormalizeRma：無 way 可正規化。');
    return false;
  }

  // 共軌圖（供結果檢視器共軌虛線）：以 snap 後 1:1 way 建立。
  let graph = buildSchematicGraph(fullFlat);
  try {
    graph = splitHighDegreeNodes(graph);
  } catch {
    /* 非致命 */
  }

  const result = writeSchematicResultToLayer(LAYER_ID, fullFlat, {
    sourceLayerId: LAYER_ID,
    coordNormalize: true,
    _schematicGraph: graph,
    gridCols: snap.sortedX.length - 1,
    gridRows: snap.sortedY.length - 1,
  });
  return result.ok !== false;
}
