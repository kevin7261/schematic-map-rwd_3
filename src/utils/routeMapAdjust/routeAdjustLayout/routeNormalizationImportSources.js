/**
 * 「路網網格／路網網格_2」自「路線正規化」群組匯入路網之來源清單（順序同 dataStore 群組）。
 * @typedef {{ layerId: string, label: string }} RouteNormalizationImportSource
 */

import {
  ROUTE_ADJUST_STROKE_LAYER_ID,
  ROUTE_ADJUST_HILLCLIMB_LAYER_ID,
  ROUTE_ADJUST_MILP_LAYER_ID,
  ROUTE_ADJUST_FORCE_LAYER_ID,
  ROUTE_ADJUST_WANGCHI_LAYER_ID,
  ROUTE_ADJUST_BAST_LAYER_ID,
  ROUTE_ADJUST_MERRICK_LAYER_ID,
  ROUTE_ADJUST_SAT_LAYER_ID,
  ROUTE_ADJUST_UPSTREAM_LAYER_ID,
  ROUTE_ADJUST_LAYOUT_LAYER_IDS,
  SCHEMATIC_RMA_DETAIL_ADJUST_LAYER_ID,
} from './layerIds.js';

/** 與 json_grid_coord_normalized/layerIds 同值；字面量避免 circular import */
const SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID = 'schematic_rma_toward_center_hv';
const SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID = 'schematic_rma_toward_center_vh';

/** @type {ReadonlyArray<RouteNormalizationImportSource>} */
export const ROUTE_NORMALIZATION_IMPORT_SOURCES = Object.freeze([
  { layerId: ROUTE_ADJUST_UPSTREAM_LAYER_ID, label: '路線正規化' },
  { layerId: ROUTE_ADJUST_STROKE_LAYER_ID, label: '① 站點與路線調整（Stroke-based）' },
  { layerId: ROUTE_ADJUST_HILLCLIMB_LAYER_ID, label: '② 站點與路線調整（Hill Climbing）' },
  { layerId: ROUTE_ADJUST_MILP_LAYER_ID, label: '③ 站點與路線調整（MILP）' },
  { layerId: ROUTE_ADJUST_FORCE_LAYER_ID, label: '④ 站點與路線調整（力導向）' },
  { layerId: ROUTE_ADJUST_WANGCHI_LAYER_ID, label: '⑤ 站點與路線調整（Wang & Chi）' },
  { layerId: ROUTE_ADJUST_BAST_LAYER_ID, label: '⑥ 站點與路線調整（Bast 格網最短路）' },
  { layerId: ROUTE_ADJUST_MERRICK_LAYER_ID, label: '⑦ 站點與路線調整（Merrick 路徑簡化）' },
  { layerId: ROUTE_ADJUST_SAT_LAYER_ID, label: '⑧ 站點與路線調整（SAT）' },
  { layerId: SCHEMATIC_RMA_DETAIL_ADJUST_LAYER_ID, label: '站點與路線細部調整' },
  { layerId: SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID, label: '站點與路線往中心聚集（先橫後直）' },
  { layerId: SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID, label: '站點與路線往中心聚集（先直後橫）' },
]);

/** 往中心聚集兩層：自站點與路線調整①～⑧匯入之來源清單。 */
export const ROUTE_ADJUST_TOWARD_CENTER_IMPORT_SOURCES = Object.freeze(
  ROUTE_NORMALIZATION_IMPORT_SOURCES.filter((s) => ROUTE_ADJUST_LAYOUT_LAYER_IDS.includes(s.layerId))
);
