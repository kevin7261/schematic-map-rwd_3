/**
 * layout_network_grid_from_vh_draw：將 CSV／合成 traffic 對應之數值寫入 VH 繪製層 segment **起點側**站點物件。
 *
 * 規則（與沿路順序 chain = start → stations[] → end 一致）：
 * - `traffic_weight` 僅存在於 **segment.start** 以及 **segment.stations** 各元素（每一條邊的「起點」）。
 * - 語意：該站連向 **沿路下一站** 的 weight。
 * - **segment.end（終點）不得出現 `traffic_weight`**（會清除）。
 *
 * 範例（起點 terminal 掛 weight；迄站無）：
 *   { "station_id":"R01", "station_name":"…", "type":"terminal", "traffic_weight": 1 }
 */

import {
  mapDrawnExportRowsFromJsonDrawRoot,
  mergeSegmentStationsFromPriorExportRows,
} from '@/utils/mapDrawnRoutesImport.js';
import { layoutVhDrawCopyRouteLabelFromExportRow } from './layoutVhDrawBlackDotGeomKind.js';

/** 根屬性（與 tags 分離）；寫入／清除時會同步清掉同名 tags 避免重複 */
export const LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY = 'traffic_weight';

/** @param {*} node */
export function layoutTrafficStationDisplayName(node) {
  if (!node || typeof node !== 'object') return '';
  const tags = node.tags && typeof node.tags === 'object' ? node.tags : {};
  return String(node.station_name ?? tags.station_name ?? tags.name ?? '').trim();
}

/** 站對表／套表用標籤：站名優先，否則 station_id，再否則格點 `@x,y` */
export function layoutTrafficStationPairLabel(node) {
  const name = layoutTrafficStationDisplayName(node);
  if (name) return name;
  if (!node || typeof node !== 'object') return '';
  const tags = node.tags && typeof node.tags === 'object' ? node.tags : {};
  const sid = String(node.station_id ?? tags.station_id ?? '').trim();
  if (sid) return sid;
  const x = Number(node.x_grid ?? tags.x_grid ?? node.lon ?? tags.lon);
  const y = Number(node.y_grid ?? tags.y_grid ?? node.lat ?? tags.lat);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return `@${Math.round(x * 2) / 2},${Math.round(y * 2) / 2}`;
  }
  return '';
}

export function layoutTrafficUndirectedPairKey(a, b) {
  return [String(a).trim(), String(b).trim()].sort().join('\x00');
}

/** @param {() => number} sampleWeightFn @returns {number} 1–9 */
function sampleLayoutTrafficWeight1to9(sampleWeightFn) {
  const sample =
    typeof sampleWeightFn === 'function'
      ? sampleWeightFn
      : () => {
          return 1;
        };
  const w = Number(sample());
  if (!Number.isFinite(w)) return 1;
  return Math.min(9, Math.max(1, Math.round(w)));
}

/**
 * @param {unknown[]} exportRows
 * @param {Map<string, {a:string,b:string,weight:number}>} pairWeightMap — 跨 bundle 共用，同一站對只抽一次
 * @param {() => number} sampleWeightFn
 */
export function applyRandomTrafficWeightsToExportRows(exportRows, sampleWeightFn, pairWeightMap) {
  clearTrafficWeightsFromExportRows(exportRows);
  if (!Array.isArray(exportRows) || exportRows.length === 0) return;

  const map =
    pairWeightMap instanceof Map
      ? pairWeightMap
      : (() => {
          /** @type {Map<string, {a:string,b:string,weight:number}>} */
          const local = new Map();
          return local;
        })();

  for (const row of exportRows) {
    const seg = row?.segment;
    if (!seg || typeof seg !== 'object') continue;
    const chain = [];
    if (seg.start) chain.push(seg.start);
    if (Array.isArray(seg.stations)) {
      for (const st of seg.stations) chain.push(st);
    }
    if (seg.end) chain.push(seg.end);
    if (chain.length < 2) continue;

    for (let i = 0; i < chain.length - 1; i++) {
      const origin = chain[i];
      const dest = chain[i + 1];
      const na = layoutTrafficStationPairLabel(origin);
      const nb = layoutTrafficStationPairLabel(dest);
      if (!na || !nb) continue;
      const k = layoutTrafficUndirectedPairKey(na, nb);
      if (!map.has(k)) {
        map.set(k, { a: na, b: nb, weight: sampleLayoutTrafficWeight1to9(sampleWeightFn) });
      }
      origin[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY] = map.get(k).weight;
    }
    clearNodeTrafficWeight(seg.end);
  }
}

/**
 * 依 VH 繪製層匯出路段（含 merged 中段站）列舉沿路相鄰邊，每一無向站對給一筆隨機 weight（1–9）。
 * @param {*} drawLayer — orthogonal_toward_center_vh_draw 圖層
 * @param {() => number} sampleWeightFn — 應回傳有限數字（例如 1–9）
 * @returns {{a:string,b:string,weight:number}[]}
 */
export function buildSyntheticTrafficRowsFromVhDrawLayer(drawLayer, sampleWeightFn) {
  if (!drawLayer) return [];
  /** @type {Map<string, {a:string,b:string,weight:number}>} */
  const pairWeightMap = new Map();
  for (const rows of collectVhDrawExportRowBundles(drawLayer)) {
    applyRandomTrafficWeightsToExportRows(rows, sampleWeightFn, pairWeightMap);
  }
  return [...pairWeightMap.values()];
}

/** @param {*} node */
function clearNodeTrafficWeight(node) {
  if (!node || typeof node !== 'object') return;
  delete node[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY];
  const tags = node.tags;
  if (tags && typeof tags === 'object') delete tags[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY];
}

/** @param {unknown[]} exportRows */
export function clearTrafficWeightsFromExportRows(exportRows) {
  if (!Array.isArray(exportRows)) return;
  for (const row of exportRows) {
    const seg = row?.segment;
    if (!seg || typeof seg !== 'object') continue;
    clearNodeTrafficWeight(seg.start);
    clearNodeTrafficWeight(seg.end);
    if (Array.isArray(seg.stations)) {
      for (const st of seg.stations) clearNodeTrafficWeight(st);
    }
  }
}

/**
 * @param {unknown[]} exportRows — mapDrawn 匯出列（會就地修改）
 * @param {{a:string,b:string,weight:number}[]} trafficCsvRows
 */
export function applyCsvTrafficWeightsToExportRows(exportRows, trafficCsvRows) {
  clearTrafficWeightsFromExportRows(exportRows);
  if (!Array.isArray(exportRows) || exportRows.length === 0) return;
  if (!Array.isArray(trafficCsvRows) || trafficCsvRows.length === 0) return;

  const trafficMap = new Map();
  for (const r of trafficCsvRows) {
    if (!r || typeof r !== 'object') continue;
    const k = layoutTrafficUndirectedPairKey(r.a, r.b);
    trafficMap.set(k, Number(r.weight));
  }

  for (const row of exportRows) {
    const seg = row?.segment;
    if (!seg || typeof seg !== 'object') continue;
    const chain = [];
    if (seg.start) chain.push(seg.start);
    if (Array.isArray(seg.stations)) {
      for (const st of seg.stations) chain.push(st);
    }
    if (seg.end) chain.push(seg.end);
    if (chain.length < 2) continue;

    // 僅邊的起點：chain[0]==start、chain[1..n-2]==stations[*]；終點 chain[last]==end 永不寫入
    for (let i = 0; i < chain.length - 1; i++) {
      const origin = chain[i];
      const dest = chain[i + 1];
      const na = layoutTrafficStationPairLabel(origin);
      const nb = layoutTrafficStationPairLabel(dest);
      if (!na || !nb) continue;
      const w = trafficMap.get(layoutTrafficUndirectedPairKey(na, nb));
      origin[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY] = Number.isFinite(w) ? w : 0;
    }

    clearNodeTrafficWeight(seg.end);
  }
}

/**
 * @param {{ findLayerById: Function }} dataStore — 沿用專案中 dataStore.findLayerById
 * @param {string} vhDrawLayerId
 * @param {{a:string,b:string,weight:number}[]|null|undefined} trafficCsvRows — 清空時傳 [] 或 null
 */
function collectVhDrawExportRowBundles(drawLayer) {
  /** @type {unknown[][]} */
  const bundles = [];
  const pushUnique = (arr) => {
    if (Array.isArray(arr) && arr.length && !bundles.includes(arr)) bundles.push(arr);
  };
  let primary = mapDrawnExportRowsFromJsonDrawRoot(drawLayer.jsonData, drawLayer.dataJson);
  if (!Array.isArray(primary)) primary = [];
  mergeSegmentStationsFromPriorExportRows(primary, drawLayer.processedJsonData);
  pushUnique(primary);
  pushUnique(mapDrawnExportRowsFromJsonDrawRoot(drawLayer.processedJsonData, null));
  return bundles;
}

export function applyLayoutTrafficCsvToVhDrawLayerRoots(dataStore, vhDrawLayerId, trafficCsvRows) {
  const drawLayer = dataStore?.findLayerById?.(vhDrawLayerId);
  if (!drawLayer) return;

  const bundles = collectVhDrawExportRowBundles(drawLayer);
  const hasCsv = Array.isArray(trafficCsvRows) && trafficCsvRows.length > 0;
  for (const rows of bundles) {
    if (hasCsv) applyCsvTrafficWeightsToExportRows(rows, trafficCsvRows);
    else clearTrafficWeightsFromExportRows(rows);
  }
}

/**
 * 「全部隨機 weight」：沿路每一邊皆寫入 1–9（含原未 assign／原為 0 者），並回傳無向站對表。
 * @param {{ findLayerById: Function }} dataStore
 * @param {string} vhDrawLayerId
 * @param {() => number} sampleWeightFn
 * @returns {{a:string,b:string,weight:number}[]}
 */
export function applyRandomLayoutTrafficWeightsToVhDrawLayerRoots(
  dataStore,
  vhDrawLayerId,
  sampleWeightFn
) {
  const drawLayer = dataStore?.findLayerById?.(vhDrawLayerId);
  if (!drawLayer) return [];

  /** @type {Map<string, {a:string,b:string,weight:number}>} */
  const pairWeightMap = new Map();
  for (const rows of collectVhDrawExportRowBundles(drawLayer)) {
    applyRandomTrafficWeightsToExportRows(rows, sampleWeightFn, pairWeightMap);
  }
  return [...pairWeightMap.values()];
}

/** @param {unknown} node */
export function getNodeTrafficWeightFromLayoutSegment(node) {
  if (!node || typeof node !== 'object') return null;
  const tags = node.tags && typeof node.tags === 'object' ? node.tags : {};
  const raw = node[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY] ?? tags[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown[]} rows — `layout_network_grid_from_vh_draw_copy` 黑點表列（就地排序並重編 `#`） */
export function sortLayoutVhDrawCopyBlackDotDataTableRowsByWeightDiffAsc(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  if (rows.length === 1) {
    if (rows[0] && typeof rows[0] === 'object') rows[0]['#'] = 1;
    return;
  }
  rows.sort((a, b) => {
    const da = Number(a?.weight_差值);
    const db = Number(b?.weight_差值);
    const na = Number.isFinite(da) ? da : 0;
    const nb = Number.isFinite(db) ? db : 0;
    if (na !== nb) return na - nb;
    const ia = Number(a?.['#']);
    const ib = Number(b?.['#']);
    if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
    return 0;
  });
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && typeof rows[i] === 'object') rows[i]['#'] = i + 1;
  }
}

/**
 * `layout_network_grid_from_vh_draw_copy` 專用 DataTable：每個路段 `segment.stations` 中段站（黑點）一列，
 * 含路線、兩側 weight 與鄰端站名、`weight_差值`、**點位類型**（預設 `—`，由 Upper 網格繪製依目前 px 即時寫入）。
 * 缺漏或未寫入之 `traffic_weight` 以 **0** 顯示（與 CSV 套表後無對應邊之 0 一致）。
 *
 * @param {unknown[]|null|undefined} exportRows — 與本層 `dataJson` 相同之 mapDrawn 匯出列
 * @returns {Record<string, unknown>[]}
 */
export function buildLayoutVhDrawCopyBlackDotTrafficDataTableRows(exportRows) {
  if (!Array.isArray(exportRows) || exportRows.length === 0) return [];
  const out = [];
  let rowNum = 0;
  for (let ri = 0; ri < exportRows.length; ri++) {
    const row = exportRows[ri];
    const seg = row?.segment;
    if (!seg || typeof seg !== 'object') continue;
    const stations = Array.isArray(seg.stations) ? seg.stations : [];
    if (stations.length === 0) continue;

    const 路線 = layoutVhDrawCopyRouteLabelFromExportRow(row, ri);

    for (let j = 0; j < stations.length; j++) {
      const prev = j === 0 ? seg.start : stations[j - 1];
      const current = stations[j];
      const next = j === stations.length - 1 ? seg.end : stations[j + 1];
      if (!prev || !current || !next) continue;
      if (current.node_type === 'connect') continue;

      const wIn = getNodeTrafficWeightFromLayoutSegment(prev);
      const wOut = getNodeTrafficWeightFromLayoutSegment(current);
      const nIn = wIn != null && Number.isFinite(Number(wIn)) ? Number(wIn) : 0;
      const nOut = wOut != null && Number.isFinite(Number(wOut)) ? Number(wOut) : 0;
      const nameOtherIn = layoutTrafficStationDisplayName(prev);
      const nameOtherOut = layoutTrafficStationDisplayName(next);
      const blackName = layoutTrafficStationDisplayName(current);

      out.push({
        '#': ++rowNum,
        路線,
        黑點站名: blackName || '（無名）',
        weight_與前站: nIn,
        前站另一端站名: nameOtherIn || '',
        weight_與後站: nOut,
        後站另一端站名: nameOtherOut || '',
        /** 語意：|與後站 − 與前站|；缺漏視為 0 */
        weight_差值: Math.abs(nOut - nIn),
        /** 水平／垂直／45度線／轉折點；繪製前為 — */
        點位類型: '—',
        /** 加權比例條下網格鄰線過窄／過矮時，不繪製之中段黑點 */
        因細間距隱藏: false,
        /** 因細間距隱藏時：與前／與後 weight 之 max，供折疊鄰段交通標注 */
        合併鄰段_weight: null,
      });
    }
  }
  sortLayoutVhDrawCopyBlackDotDataTableRowsByWeightDiffAsc(out);
  return out;
}
