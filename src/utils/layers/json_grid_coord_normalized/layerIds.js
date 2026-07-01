/** 圖層 id 單一來源，供本資料夾模組共用（避免 index ↔ 子檔 circular import） */

export const JSON_GRID_COORD_NORMALIZED_LAYER_ID = 'json_grid_coord_normalized';

/** 站點移動水平垂直化（layerId：point_orthogonal） */
export const POINT_ORTHOGONAL_LAYER_ID = 'point_orthogonal';

/** 站點與路線往示意圖中心聚集（橫／豎正交路網），佇序列→欄（HV）；layerId：`orthogonal_toward_center_hv`；dataJson 優先自 {@link POINT_ORTHOGONAL_LAYER_ID}，空則自座標正規化層 */
export const LINE_ORTHOGONAL_LAYER_ID = 'orthogonal_toward_center_hv';

/**
 * 紅／藍 connect 拉直：自 {@link LINE_ORTHOGONAL_LAYER_ID}（先橫後直）鏡像一份路網副本，
 * 逐一移動 connect 端點（移 1 格使水平／垂直路線變多、HV 邊數嚴格增加且通過硬約束）。
 * 單點／自動／一鍵完成三鍵；layerId：`connect_straighten_hv`
 */
export const CONNECT_STRAIGHTEN_HV_LAYER_ID = 'connect_straighten_hv';

/** 與 {@link LINE_ORTHOGONAL_LAYER_ID} 同一演算法與管線；控制台佇列順序為欄→列（VH）；layerId：`orthogonal_toward_center_vh` */
export const LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID = 'orthogonal_toward_center_vh';

/** 僅繪製／檢視：鏡像 {@link LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID} 之 dataJson（無編輯管線）；layerId：`orthogonal_toward_center_vh_draw` */
export const LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID = 'orthogonal_toward_center_vh_draw';

/**
 * 版面網絡網格（路網網格）：僅檢視，**dataOSM** 自 {@link LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID} 複製（geojson 由該 OSM 解析）。
 * layerId：`layout_network_grid_from_vh_draw_copy`
 */
export const LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY = 'layout_network_grid_from_vh_draw_copy';

/**
 * 版面網絡網格第二份（路網網格_2）：與 {@link LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY} 同檢視與資料來源，
 * 但 Control 不提供「載入 CSV」與「隨機 weight」（純檢視複本，重用 _copy 的繪製／資料邏輯）。
 * layerId：`layout_network_grid_from_vh_draw_copy2`
 */
export const LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2 =
  'layout_network_grid_from_vh_draw_copy2';

/**
 * 路線圖處理（RMA）版「路網網格」：與版面網絡網格家族同檢視／繪製／UI，
 * 但資料來源為 RMA 示意圖管線最後一層「站點與路線往中心聚集（先直後橫）」schematic_rma_toward_center_vh。
 */
export const LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA = 'layout_network_grid_from_vh_draw_rma';
export const LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA_2 =
  'layout_network_grid_from_vh_draw_rma2';
/** RMA 路網網格之資料來源（RMA 先直後橫往中心聚集層）。 */
export const SCHEMATIC_RMA_TOWARD_CENTER_VH_SOURCE_LAYER_ID = 'schematic_rma_toward_center_vh';

/** @param {string|undefined|null} layerId */
export function isOrthogonalVhDataJsonDrawMirrorLayerId(layerId) {
  return layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID;
}

/** 「路網網格」主層（含 CSV／隨機 weight／鄰線最小寬高等完整功能）：OSM copy 或 RMA。 */
export function isLayoutVhDrawMainCopyLayerId(layerId) {
  return (
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA
  );
}

/** 「路網網格_2」純檢視複本（fisheye／最短路徑選取）：OSM copy2 或 RMA_2。 */
export function isLayoutVhDrawSecondCopyLayerId(layerId) {
  return (
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2 ||
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA_2
  );
}

/** RMA 版路網網格（主層或第二份）。 */
export function isRmaLayoutNetworkGridFromVhDrawLayerId(layerId) {
  return (
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA ||
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA_2
  );
}

/** @param {string|undefined|null} layerId */
export function isLayoutNetworkGridFromVhDrawLayerId(layerId) {
  return (
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2 ||
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA ||
    layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA_2
  );
}

/** 先直後橫·繪製層與其版面網絡複本（示意網格／orthoBundle 等同一套繪製邏輯） */
export function isSpaceGridVhDrawFamilyLayerId(layerId) {
  return (
    isOrthogonalVhDataJsonDrawMirrorLayerId(layerId) ||
    isLayoutNetworkGridFromVhDrawLayerId(layerId)
  );
}

/** 僅檢視：列出「座標正規化」dataJson 路網之 connect 紅／藍點（與父層同資料來源） */
export const COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID = 'coord_normalized_red_blue_connect';

export const LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS = Object.freeze([
  LINE_ORTHOGONAL_LAYER_ID,
  LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID,
]);

/**
 * 示意圖管線中的「往中心聚集」兩層（與 OSM 管線那兩層演算法完全相同，但資料鏈不同：
 * 自「MILP結果正規化」→ 先橫後直 → 先直後橫 → connect 拉直）。
 * 這兩個 id 會被 {@link isLineOrthogonalTowardCenterLayerId} 視為同族（套用同一步進引擎/UI/繪製），
 * 但**不**列入 OSM 端鏡像（{@link isCoordNormalizedDataJsonMirrorFollowonLayerId} 仍只認原兩層），
 * 以免被 point_orthogonal 上游覆寫。
 */
export const SCHEMATIC_TOWARD_CENTER_HV_LAYER_ID = 'schematic_toward_center_hv';
export const SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID = 'schematic_toward_center_vh';
/**
 * 路線圖調整（RMA）示意圖管線之「往中心聚集」兩層：演算法/UI/繪製與 OSM 版完全相同，
 * 僅資料鏈不同（自「MILP結果正規化（RMA）」schematic_rma_milp_read → 先橫後直 → 先直後橫）。
 */
export const SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID = 'schematic_rma_toward_center_hv';
export const SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID = 'schematic_rma_toward_center_vh';
/** 衍生圖層：站點與路線調整（RMA）八演算法 #1–#8（詳見 routeMapAdjust/routeAdjustLayout）。 */
export { ROUTE_ADJUST_STROKE_LAYER_ID as SCHEMATIC_RMA_ROUTE_ADJUST_LAYER_ID } from '../../routeMapAdjust/routeAdjustLayout/layerIds.js';
export {
  ROUTE_ADJUST_LAYOUT_LAYER_IDS,
  isRouteAdjustLayoutLayer,
  isRouteAdjustLayoutOrAiLayer,
} from '../../routeMapAdjust/routeAdjustLayout/layerIds.js';
export const SCHEMATIC_TOWARD_CENTER_LAYER_IDS = Object.freeze([
  SCHEMATIC_TOWARD_CENTER_HV_LAYER_ID,
  SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID,
  SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID,
  SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID,
]);

/** @param {string|undefined|null} layerId */
export function isLineOrthogonalTowardCenterLayerId(layerId) {
  return (
    layerId != null &&
    (LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS.includes(layerId) ||
      SCHEMATIC_TOWARD_CENTER_LAYER_IDS.includes(layerId))
  );
}

/** 「先直後橫（垂直優先）」之往中心聚集層（OSM 版或示意圖版）。 */
export function isVertFirstTowardCenterLayerId(layerId) {
  return (
    layerId === LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID ||
    layerId === SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID ||
    layerId === SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID
  );
}

/** 自 {@link JSON_GRID_COORD_NORMALIZED_LAYER_ID} 鏡像 dataJson 之衍生層（站點垂直化、紅藍點表、線網往中心、VH 繪製鏡像）。僅 OSM 端原兩層，不含示意圖版／RMA 路網網格（RMA 自有資料鏈）。 */
export function isCoordNormalizedDataJsonMirrorFollowonLayerId(layerId) {
  return (
    layerId === POINT_ORTHOGONAL_LAYER_ID ||
    layerId === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
    LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS.includes(layerId) ||
    isOrthogonalVhDataJsonDrawMirrorLayerId(layerId) ||
    (isLayoutNetworkGridFromVhDrawLayerId(layerId) &&
      !isRmaLayoutNetworkGridFromVhDrawLayerId(layerId))
  );
}

/** @deprecated 請用 {@link POINT_ORTHOGONAL_LAYER_ID} */
export const JSON_GRID_FROM_COORD_NORMALIZED_LAYER_ID = POINT_ORTHOGONAL_LAYER_ID;
