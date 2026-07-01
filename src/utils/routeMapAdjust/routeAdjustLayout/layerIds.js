/**
 * 「站點與路線調整」八演算法圖層（#1–#8，不含⑨正規化）。
 * 輸入：上游「站點與路線調整前置」schematic_rma_milp_read 之 spaceNetworkGridJsonData。
 * 演算法核心與「示意圖佈局」相同，但管線／輸入解析獨立於 routeMapAdjust/schematic。
 */

/** 上游：站點與路線調整前置（MILP 結果座標正規化後） */
export const ROUTE_ADJUST_UPSTREAM_LAYER_ID = 'schematic_rma_milp_read';
export const ROUTE_ADJUST_UPSTREAM_LAYER_NAME = '站點與路線調整前置';

/** #1 Li & Dong (2010) stroke-based */
export const ROUTE_ADJUST_STROKE_LAYER_ID = 'schematic_rma_route_adjust_stroke';
/** #2 Stott & Rodgers (2011) Hill Climbing */
export const ROUTE_ADJUST_HILLCLIMB_LAYER_ID = 'schematic_rma_route_adjust_hillclimb';
/** #3 Nöllenburg & Wolff (2011) MILP */
export const ROUTE_ADJUST_MILP_LAYER_ID = 'schematic_rma_route_adjust_milp';
/** #4 Hong et al. (2006) 力導向 */
export const ROUTE_ADJUST_FORCE_LAYER_ID = 'schematic_rma_route_adjust_force';
/** #5 Wang & Chi (2011) 最小二乘變形 */
export const ROUTE_ADJUST_WANGCHI_LAYER_ID = 'schematic_rma_route_adjust_wangchi';
/** #6 Bast et al. (2020) Octilinear 格網最短路 */
export const ROUTE_ADJUST_BAST_LAYER_ID = 'schematic_rma_route_adjust_bast';
/** #7 Merrick & Gudmundsson (2007) C-directed 路徑簡化 */
export const ROUTE_ADJUST_MERRICK_LAYER_ID = 'schematic_rma_route_adjust_merrick';
/** #8 Fuchs (2022) SAT octilinear */
export const ROUTE_ADJUST_SAT_LAYER_ID = 'schematic_rma_route_adjust_sat';

/** 站點與路線細部調整：自①～⑧或站點與路線調整前置匯入完整路網（含黑點），供往中心聚集上游。 */
export const SCHEMATIC_RMA_DETAIL_ADJUST_LAYER_ID = 'schematic_rma_detail_adjust';

/** 八個站點與路線調整佈局圖層（#1–#8） */
export const ROUTE_ADJUST_LAYOUT_LAYER_IDS = Object.freeze([
  ROUTE_ADJUST_STROKE_LAYER_ID,
  ROUTE_ADJUST_HILLCLIMB_LAYER_ID,
  ROUTE_ADJUST_MILP_LAYER_ID,
  ROUTE_ADJUST_FORCE_LAYER_ID,
  ROUTE_ADJUST_WANGCHI_LAYER_ID,
  ROUTE_ADJUST_BAST_LAYER_ID,
  ROUTE_ADJUST_MERRICK_LAYER_ID,
  ROUTE_ADJUST_SAT_LAYER_ID,
]);

export const isRouteAdjustLayoutLayer = (layerId) =>
  layerId != null && ROUTE_ADJUST_LAYOUT_LAYER_IDS.includes(layerId);

/** profileId → 圖層 layerId */
export const ROUTE_ADJUST_PROFILE_TO_LAYER_ID = Object.freeze({
  stroke: ROUTE_ADJUST_STROKE_LAYER_ID,
  hillclimb: ROUTE_ADJUST_HILLCLIMB_LAYER_ID,
  milp: ROUTE_ADJUST_MILP_LAYER_ID,
  force: ROUTE_ADJUST_FORCE_LAYER_ID,
  wangchi: ROUTE_ADJUST_WANGCHI_LAYER_ID,
  bast: ROUTE_ADJUST_BAST_LAYER_ID,
  merrick: ROUTE_ADJUST_MERRICK_LAYER_ID,
  sat: ROUTE_ADJUST_SAT_LAYER_ID,
});
