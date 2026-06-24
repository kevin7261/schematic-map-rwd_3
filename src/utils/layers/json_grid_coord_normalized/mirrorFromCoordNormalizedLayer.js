/**
 * 衍生圖層：`point_orthogonal` 自「座標正規化」複製 dataJson／jsonData；
 * 「站點與路線往中心聚集」兩種線網層優先自 `point_orthogonal` 複製；若尚無陣列則改讀「座標正規化」同一欄位（便於只開本層也能顯示）。
 * `orthogonal_toward_center_vh_draw` 僅鏡像 `orthogonal_toward_center_vh` 之 dataJson／geojson 供繪製；
 * `layout_network_grid_from_vh_draw` 自繪製層複製 **dataOSM**（並解析為 geojson 供網格檢視）。
 */

import {
  mapDrawnExportRowsFromJsonDrawRoot,
  mergeSegmentStationsFromPriorExportRows,
  minimalLineStringFeatureCollectionFromRouteExportRows,
} from '../../mapDrawnRoutesImport.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';
import {
  resolveB3InputSpaceNetwork,
  writeLayoutNormalizedLayerDataOsmFromExportRows,
  freshLayoutConnectPointFeaturesFromDraw,
  freshLayoutLineFeaturesFromDraw,
} from './jsonGridCoordNormalizeHelpers.js';
import {
  JSON_GRID_COORD_NORMALIZED_LAYER_ID,
  JSON_GRID_FROM_COORD_NORMALIZED_LAYER_ID,
  POINT_ORTHOGONAL_LAYER_ID,
  LINE_ORTHOGONAL_LAYER_ID,
  CONNECT_STRAIGHTEN_HV_LAYER_ID,
  isLineOrthogonalTowardCenterLayerId,
  LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS,
  LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID,
  LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
  COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID,
} from './layerIds.js';
import { buildVhDrawStationRowsForLayoutMap } from './layoutVhDrawFineIntegerGrid.js';
import { buildLayoutVhDrawCopyBlackDotTrafficDataTableRows } from './layoutTrafficWeightsSync.js';

/**
 * 將本圖層路網匯出列寫入 dataJson／jsonData／geojsonData（與座標正規化父層語意一致）。
 */
export function syncJsonGridFromCoordDataJsonFromPipeline(layer) {
  if (!layer) return;
  let rows = Array.isArray(layer.processedJsonData) ? layer.processedJsonData : null;
  if (
    (!rows || rows.length === 0) &&
    Array.isArray(layer.spaceNetworkGridJsonData) &&
    layer.spaceNetworkGridJsonData.length > 0
  ) {
    try {
      rows = flatSegmentsToGeojsonStyleExportRows(layer.spaceNetworkGridJsonData);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('syncJsonGridFromCoordDataJsonFromPipeline：自路網匯出列失敗', e);
      rows = null;
    }
  }
  if (!Array.isArray(rows) || rows.length === 0) return;
  const priorExportRows = mapDrawnExportRowsFromJsonDrawRoot(layer.jsonData, layer.dataJson);
  let arr = JSON.parse(JSON.stringify(rows));
  arr = mergeSegmentStationsFromPriorExportRows(arr, priorExportRows);
  layer.jsonData = arr;
  layer.dataJson = arr;
  layer.geojsonData = minimalLineStringFeatureCollectionFromRouteExportRows(arr, {
    stationPoints: 'endpoints',
    routeLine: 'endpoints',
  });
  if (layer.layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) {
    // 路網網格 dataOSM：保拓樸，直接用本層匯出列建線，不經 b3 依座標重新切段／合併
    // （避免不相關路線因座標重疊被截斷或互相借用車站）。
    writeLayoutNormalizedLayerDataOsmFromExportRows(layer, arr);
  }
}

/**
 * 路網網格 line 來源 OSM：優先**即時**由 draw 匯出列建立保拓樸 OSM（每段一條 way、不依座標重新切段），
 * 避免使用可能過期／舊版（依座標切段而把路線截斷）的 persist `draw.dataOSM`。無匯出列時退回 draw.dataOSM。
 */
function freshTopologyPreservingOsmFromDraw(draw) {
  const rows = Array.isArray(draw?.dataJson)
    ? draw.dataJson
    : Array.isArray(draw?.jsonData)
      ? draw.jsonData
      : null;
  if (Array.isArray(rows) && rows.length > 0) {
    const tmp = {};
    writeLayoutNormalizedLayerDataOsmFromExportRows(tmp, rows);
    if (tmp.dataOSM != null && String(tmp.dataOSM).trim() !== '') return String(tmp.dataOSM);
  }
  return draw?.dataOSM != null && String(draw.dataOSM).trim() !== '' ? String(draw.dataOSM) : null;
}

export function applyCoordNormalizedLayerDataJsonToFollowon(findLayerById, derivedLayer) {
  if (derivedLayer?.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY) {
    const draw = findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    derivedLayer.dataOSM = freshTopologyPreservingOsmFromDraw(draw);
    // 路網網格線：直接由匯出列建 LineString，不經 OSM 來回（避免來回把輸入結構改掉、把連續線弄斷）。
    const lineFeats = freshLayoutLineFeaturesFromDraw(draw);
    const pointFeats = freshLayoutConnectPointFeaturesFromDraw(draw);
    derivedLayer.geojsonData =
      lineFeats.length || pointFeats.length
        ? { type: 'FeatureCollection', features: [...lineFeats, ...pointFeats] }
        : null;
    derivedLayer.isLoaded = true;
    syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy(findLayerById, derivedLayer);
    return;
  }

  if (derivedLayer?.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2) {
    const draw = findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    derivedLayer.dataOSM = freshTopologyPreservingOsmFromDraw(draw);
    // 路網網格線：直接由匯出列建 LineString，不經 OSM 來回（避免來回把輸入結構改掉、把連續線弄斷）。
    const lineFeats = freshLayoutLineFeaturesFromDraw(draw);
    const pointFeats = freshLayoutConnectPointFeaturesFromDraw(draw);
    derivedLayer.geojsonData =
      lineFeats.length || pointFeats.length
        ? { type: 'FeatureCollection', features: [...lineFeats, ...pointFeats] }
        : null;
    derivedLayer.isLoaded = true;
    syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy2(findLayerById, derivedLayer);
    return;
  }

  if (derivedLayer?.layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) {
    const vh = findLayerById(LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID);
    const raw =
      vh && Array.isArray(vh.dataJson)
        ? vh.dataJson
        : vh && Array.isArray(vh.jsonData)
          ? vh.jsonData
          : null;
    const arr = Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : null;
    derivedLayer.jsonData = arr;
    derivedLayer.dataJson = arr;
    derivedLayer.geojsonData = minimalLineStringFeatureCollectionFromRouteExportRows(
      Array.isArray(raw) ? raw : [],
      { stationPoints: 'endpoints', routeLine: 'endpoints' }
    );
    // 路網網格 dataOSM：保拓樸，直接用上游匯出列建線，不經 b3 依座標重新切段／合併
    // （避免不相關路線因座標重疊被截斷或互相借用車站）。
    writeLayoutNormalizedLayerDataOsmFromExportRows(derivedLayer, arr);
    derivedLayer.isLoaded = true;
    return;
  }

  const sourceId = isLineOrthogonalTowardCenterLayerId(derivedLayer?.layerId)
    ? POINT_ORTHOGONAL_LAYER_ID
    : JSON_GRID_COORD_NORMALIZED_LAYER_ID;
  const parentOrtho = findLayerById(sourceId);
  let raw =
    parentOrtho && Array.isArray(parentOrtho.dataJson)
      ? parentOrtho.dataJson
      : parentOrtho && Array.isArray(parentOrtho.jsonData)
        ? parentOrtho.jsonData
        : null;
  if (
    isLineOrthogonalTowardCenterLayerId(derivedLayer?.layerId) &&
    (!Array.isArray(raw) || raw.length === 0)
  ) {
    const norm = findLayerById(JSON_GRID_COORD_NORMALIZED_LAYER_ID);
    raw =
      norm && Array.isArray(norm.dataJson)
        ? norm.dataJson
        : norm && Array.isArray(norm.jsonData)
          ? norm.jsonData
          : null;
  }
  const arr = Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : null;
  derivedLayer.jsonData = arr;
  derivedLayer.dataJson = arr;
  derivedLayer.geojsonData = minimalLineStringFeatureCollectionFromRouteExportRows(
    Array.isArray(raw) ? raw : [],
    { stationPoints: 'endpoints', routeLine: 'endpoints' }
  );
  derivedLayer.isLoaded = true;
}

/** 清除後續管線欄位，改以最新複製之 dataJson 為準 */
export function resetJsonGridFromCoordNormalizedPipelineFields(lyr) {
  lyr.spaceNetworkGridJsonData = null;
  lyr.spaceNetworkGridJsonData_SectionData = null;
  lyr.spaceNetworkGridJsonData_ConnectData = null;
  lyr.spaceNetworkGridJsonData_StationData = null;
  lyr.processedJsonData = null;
  lyr.dashboardData = null;
  lyr.drawJsonData = null;
  lyr.dataOSM = null;
  lyr.dataTableData = null;
  lyr.layerInfoData = null;
  lyr.highlightedSegmentIndex = null;
  if (lyr.layerId === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID) {
    lyr.rbConnectMovePreview = null;
    lyr.rbConnectVisitedKeys = [];
  }
  lyr.jsonGridFromCoordSuggestTargetGrid = null;
  lyr.lineOrthoTowardCrossHighlightTableAxis = null;
  lyr.lineOrthoTowardCrossFrozenCenter = null;
  lyr.layoutUniformGridGeoJson = null;
  lyr.layoutUniformGridMeta = null;
  if (
    lyr.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
    lyr.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2
  ) {
    lyr.layoutVhDrawFineGridTurnRbMidDots = false;
    lyr.layoutVhDrawShowBlackDotRowColRatioOverlay = false;
  }
  lyr.layoutVhDrawFineGrid = null;
  lyr.layoutVhDrawBlackDotRowColRatioReport = null;
  lyr.showStationPlacement = true;
  if (
    lyr.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
    lyr.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2
  ) {
    lyr.dataTableData = buildLayoutVhDrawCopyBlackDotTrafficDataTableRows(lyr.dataJson);
  }
}

/**
 * 「路網網格」：寫入與 Upper **json-viewer** 第一段優先順序同源之路由陣列（`mapDrawnExportRowsFromJsonDrawRoot`，深拷貝；含 VH 來源 segment 之 `traffic_weight`）。
 *
 * **必須** `jsonData` 為 null、僅 **`dataJson` 為匯出列陣列**，與 `SpaceNetworkGridJsonDataTab` 一致。
 *
 * @param {(id:string)=>*|null} findLayerById
 * @param {object|null} [layoutLayer] — 若傳入則寫入該物件（鏡像 apply 時）。
 */
export function syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy(findLayerById, layoutLayer) {
  const layout = layoutLayer ?? findLayerById(LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY);
  const draw = findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
  if (!layout || layout.layerId !== LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY || !draw) return;

  const rows = buildVhDrawStationRowsForLayoutMap({ findLayerById }, draw);
  layout.jsonData = null;
  layout.dataJson =
    Array.isArray(rows) && rows.length > 0 ? JSON.parse(JSON.stringify(rows)) : null;
  layout.dataTableData = buildLayoutVhDrawCopyBlackDotTrafficDataTableRows(layout.dataJson);
}

/** 同組複本 2（路網網格_2）：與 {@link syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy} 相同邏輯，綁定 `layout_network_grid_from_vh_draw_copy2`（重用 _copy 之表格建構）。 */
export function syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy2(findLayerById, layoutLayer) {
  const layout = layoutLayer ?? findLayerById(LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2);
  const draw = findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
  if (!layout || layout.layerId !== LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2 || !draw)
    return;

  const rows = buildVhDrawStationRowsForLayoutMap({ findLayerById }, draw);
  layout.jsonData = null;
  layout.dataJson =
    Array.isArray(rows) && rows.length > 0 ? JSON.parse(JSON.stringify(rows)) : null;
  layout.dataTableData = buildLayoutVhDrawCopyBlackDotTrafficDataTableRows(layout.dataJson);
}

/**
 * Pinia persist：開啟／reload 與 dataStore.toggle 共用。
 * @param {{ omitLoadingFlags?: boolean }} [opts]
 */
export function jsonGridFromCoordNormalizedPersistPayload(layer, opts = {}) {
  const { omitLoadingFlags = false } = opts;
  const payload = {
    isLoaded: layer.isLoaded,
    jsonData: layer.jsonData,
    geojsonData: layer.geojsonData,
    dataJson: layer.dataJson,
    layoutUniformGridGeoJson: layer.layoutUniformGridGeoJson ?? null,
    layoutUniformGridMeta: layer.layoutUniformGridMeta ?? null,
    layoutVhDrawFineGrid: layer.layoutVhDrawFineGrid ?? null,
    layoutVhDrawFineGridTurnRbMidDots: !!layer.layoutVhDrawFineGridTurnRbMidDots,
    spaceNetworkGridJsonData: layer.spaceNetworkGridJsonData,
    spaceNetworkGridJsonData_SectionData: layer.spaceNetworkGridJsonData_SectionData,
    spaceNetworkGridJsonData_ConnectData: layer.spaceNetworkGridJsonData_ConnectData,
    spaceNetworkGridJsonData_StationData: layer.spaceNetworkGridJsonData_StationData,
    processedJsonData: layer.processedJsonData,
    dashboardData: layer.dashboardData,
    drawJsonData: layer.drawJsonData,
    dataOSM: layer.dataOSM,
    dataTableData: layer.dataTableData,
    layerInfoData: layer.layerInfoData,
    highlightedSegmentIndex: layer.highlightedSegmentIndex,
    rbConnectMovePreview: layer.rbConnectMovePreview ?? null,
    rbConnectVisitedKeys: Array.isArray(layer.rbConnectVisitedKeys)
      ? layer.rbConnectVisitedKeys
      : [],
    jsonGridFromCoordSuggestTargetGrid: layer.jsonGridFromCoordSuggestTargetGrid ?? null,
    lineOrthoTowardCrossHighlightTableAxis: layer.lineOrthoTowardCrossHighlightTableAxis ?? null,
    lineOrthoTowardCrossFrozenCenter: layer.lineOrthoTowardCrossFrozenCenter ?? null,
    showStationPlacement: layer.showStationPlacement,
  };
  if (layer.layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) {
    payload.vhDrawUserJsonOverride = !!layer.vhDrawUserJsonOverride;
    payload.jsonFileName = layer.jsonFileName ?? null;
  }
  if (
    layer.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
    layer.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2
  ) {
    payload.csvFileName_traffic = layer.csvFileName_traffic ?? null;
    payload.layoutVhDrawTrafficData = layer.layoutVhDrawTrafficData ?? null;
    payload.layoutVhDrawTrafficMissing = Array.isArray(layer.layoutVhDrawTrafficMissing)
      ? layer.layoutVhDrawTrafficMissing
      : [];
    payload.layoutVhDrawShowTrafficWeights = layer.layoutVhDrawShowTrafficWeights !== false;
    payload.layoutVhDrawBlackDotRowColRatioReport =
      layer.layoutVhDrawBlackDotRowColRatioReport ?? null;
    payload.layoutVhDrawShowBlackDotRowColRatioOverlay =
      layer.layoutVhDrawShowBlackDotRowColRatioOverlay === true;
    const m = Number(layer.layoutVhDrawWeightedNeighborHideMinPt);
    payload.layoutVhDrawWeightedNeighborHideMinPt = Number.isFinite(m) && m > 0 ? m : 5;
    payload.layoutVhDrawFisheyeEnabled = layer.layoutVhDrawFisheyeEnabled === true;
    payload.layoutVhDrawPathSelectMode = layer.layoutVhDrawPathSelectMode === true;
  }
  if (!omitLoadingFlags) {
    payload.isLoading = layer.isLoading;
  }
  return payload;
}

/** 「版面網絡網格」（路網網格）層若可見，自 `orthogonal_toward_center_vh_draw` 重複製 **dataOSM** 並 persist */
export function refreshLayoutNetworkGridFromVhDrawIfVisibleCopy(findLayerById, saveLayerState) {
  const layout = findLayerById(LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY);
  if (!layout?.visible) return;
  mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, layout);
}

/** 同組複本 2（路網網格_2）：若可見則自 `orthogonal_toward_center_vh_draw` 重複製並 persist。 */
export function refreshLayoutNetworkGridFromVhDrawIfVisibleCopy2(findLayerById, saveLayerState) {
  const layout = findLayerById(LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2);
  if (!layout?.visible) return;
  mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, layout);
}

/**
 * `connect_straighten_hv`：本層尚無路網時，自上游 {@link LINE_ORTHOGONAL_LAYER_ID}
 * （站點與路線往中心聚集·先橫後直）鏡像一份路網副本，使「打開圖層即顯示上一層結果」。
 * 已有資料則僅標記 isLoaded、不覆寫使用者在本層的拉直編輯（重新拉取需另行清空本層資料）。
 */
export function seedConnectStraightenHvFromUpstreamIfEmpty(findLayerById, saveLayerState, layer) {
  const lyr = layer ?? findLayerById?.(CONNECT_STRAIGHTEN_HV_LAYER_ID);
  if (!lyr) return;
  // 使用者已匯入本機 JSON：沿用該檔，不自動鏡像上游
  if (lyr.connectStraightenUserJsonOverride) {
    lyr.isLoaded = true;
    if (typeof saveLayerState === 'function') saveLayerState(lyr.layerId, { isLoaded: true });
    return;
  }
  const hasData =
    Array.isArray(lyr.spaceNetworkGridJsonData) && lyr.spaceNetworkGridJsonData.length > 0;
  if (hasData) {
    lyr.isLoaded = true;
    if (typeof saveLayerState === 'function') saveLayerState(lyr.layerId, { isLoaded: true });
    return;
  }
  const up = findLayerById?.(LINE_ORTHOGONAL_LAYER_ID);
  const resolved = up ? resolveB3InputSpaceNetwork(up, { routeLineFromExportRows: 'full' }) : null;
  if (!resolved?.spaceNetwork?.length) return;
  const segs = normalizeSpaceNetworkDataToFlatSegments(
    JSON.parse(JSON.stringify(resolved.spaceNetwork))
  );
  lyr.spaceNetworkGridJsonData = segs;
  const comp = computeStationDataFromRoutes(segs);
  lyr.spaceNetworkGridJsonData_SectionData = comp.sectionData;
  lyr.spaceNetworkGridJsonData_ConnectData = comp.connectData;
  lyr.spaceNetworkGridJsonData_StationData = comp.stationData;
  try {
    lyr.processedJsonData = flatSegmentsToGeojsonStyleExportRows(segs);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('connect_straighten_hv 鏡像：processedJsonData 失敗', e);
  }
  syncJsonGridFromCoordDataJsonFromPipeline(lyr);
  lyr.isLoaded = true;
  if (typeof saveLayerState === 'function') {
    saveLayerState(lyr.layerId, jsonGridFromCoordNormalizedPersistPayload(lyr));
  }
}

export function mirrorResetAndPersistJsonGridFromCoordNormalized(
  findLayerById,
  saveLayerState,
  layer
) {
  applyCoordNormalizedLayerDataJsonToFollowon(findLayerById, layer);
  resetJsonGridFromCoordNormalizedPipelineFields(layer);
  saveLayerState(
    layer.layerId,
    jsonGridFromCoordNormalizedPersistPayload(layer, { omitLoadingFlags: true })
  );
  if (layer.layerId === LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID) {
    refreshOrthogonalVhMirrorDrawLayerIfVisible(findLayerById, saveLayerState);
  }
  if (layer.layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) {
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy(findLayerById, saveLayerState);
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy2(findLayerById, saveLayerState);
  }
}

export function reloadJsonGridFromCoordNormalizedLayer(findLayerById, saveLayerState, layer) {
  applyCoordNormalizedLayerDataJsonToFollowon(findLayerById, layer);
  resetJsonGridFromCoordNormalizedPipelineFields(layer);
  layer.isLoaded = true;
  layer.isLoading = false;
  saveLayerState(layer.layerId, jsonGridFromCoordNormalizedPersistPayload(layer));
  if (layer.layerId === LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID) {
    refreshOrthogonalVhMirrorDrawLayerIfVisible(findLayerById, saveLayerState);
  }
  if (layer.layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) {
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy(findLayerById, saveLayerState);
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy2(findLayerById, saveLayerState);
  }
}

export function syncJsonGridFromCoordNormalizedMirrorFromParent(findLayerById, saveLayerState) {
  const follow = findLayerById(JSON_GRID_FROM_COORD_NORMALIZED_LAYER_ID);
  if (follow?.visible) {
    mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, follow);
  }
  for (const id of LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS) {
    const lineOrtho = findLayerById(id);
    if (lineOrtho?.visible) {
      mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, lineOrtho);
    }
  }
  const rb = findLayerById(COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID);
  if (rb?.visible) {
    mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, rb);
  }
  refreshOrthogonalVhMirrorDrawLayerIfVisible(findLayerById, saveLayerState);
}

/** `orthogonal_toward_center_vh_draw`：自 VH 往中心層複製 dataJson（VH 層或其他鏡像更新後呼叫） */
export function refreshOrthogonalVhMirrorDrawLayerIfVisible(findLayerById, saveLayerState) {
  const draw = findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
  if (draw?.visible && !draw.vhDrawUserJsonOverride) {
    mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, draw);
  } else if (draw?.visible) {
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy(findLayerById, saveLayerState);
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy2(findLayerById, saveLayerState);
  }
}

/** 站點層寫入後，任一「往中心聚集」線網層開啟則自 `point_orthogonal` 重鏡像並 persist */
export function refreshLineOrthogonalFromPointOrthogonalIfVisible(findLayerById, saveLayerState) {
  for (const id of LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS) {
    const line = findLayerById(id);
    if (line?.visible) {
      mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, line);
    }
  }
  refreshOrthogonalVhMirrorDrawLayerIfVisible(findLayerById, saveLayerState);
}
