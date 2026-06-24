/**
 * 座標正規化圖層（json_grid_coord_normalized）：自 OSM→GeoJSON→JSON 父圖層鏡像 dataJson／重置管線欄位／persist。
 * 與 {@link ../osm_2_geojson_2_json/index.js} 分檔對齊，store 僅注入 findLayerById／saveLayerState。
 */

import { LAYER_ID as OSM_2_GEOJSON_2_JSON_LAYER_ID } from '../osm_2_geojson_2_json/sessionOsmXml.js';
import { useDataStore } from '@/stores/dataStore.js';
import {
  mapDrawnExportRowsFromJsonDrawRoot,
  mergeSegmentStationsFromPriorExportRows,
  minimalLineStringFeatureCollectionFromRouteExportRows,
} from '../../mapDrawnRoutesImport.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { JSON_GRID_COORD_NORMALIZED_LAYER_ID } from './layerIds.js';
import { syncJsonGridFromCoordNormalizedMirrorFromParent } from './mirrorFromCoordNormalizedLayer.js';

/** 自 OSM 管線父圖層複製路段 JSON（dataJson）至座標正規化衍生圖層 */
export function applyOsm2DataJsonSyncedLayerFromParent(findLayerById, derivedLayer) {
  const parent = findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID);
  const raw =
    parent && Array.isArray(parent.dataJson)
      ? parent.dataJson
      : parent && Array.isArray(parent.jsonData)
        ? parent.jsonData
        : null;
  const arr = Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : null;
  derivedLayer.jsonData = arr;
  derivedLayer.dataJson = arr;
  derivedLayer.geojsonData = minimalLineStringFeatureCollectionFromRouteExportRows(
    Array.isArray(raw) ? raw : [],
    { stationPoints: 'endpoints', routeLine: 'endpoints' },
  );
  derivedLayer.isLoaded = true;
  derivedLayer.layoutUniformGridGeoJson = null;
  derivedLayer.layoutUniformGridMeta = null;
}

/**
 * 將正規化管線產物寫回本圖層 dataJson／jsonData 與 geojsonData（與 OSM 管線同型之匯出列），
 * 供 JSON 檢視與下游 `point_orthogonal` 鏡像讀取。
 */
export function syncJsonGridCoordNormalizedDataJsonFromPipeline(layer) {
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
      console.error('syncJsonGridCoordNormalizedDataJsonFromPipeline：自路網匯出列失敗', e);
      rows = null;
    }
  }
  if (!Array.isArray(rows) || rows.length === 0) return;
  const priorExport = mapDrawnExportRowsFromJsonDrawRoot(layer.jsonData, layer.dataJson);
  const arr = JSON.parse(JSON.stringify(rows));
  mergeSegmentStationsFromPriorExportRows(arr, priorExport);
  try {
    const store = useDataStore();
    const parent = store.findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID);
    const parentExport = mapDrawnExportRowsFromJsonDrawRoot(parent?.jsonData, parent?.dataJson);
    if (Array.isArray(parentExport) && parentExport.length > 0) {
      mergeSegmentStationsFromPriorExportRows(arr, parentExport);
    }
  } catch (e) {
    void e;
  }
  layer.jsonData = arr;
  layer.dataJson = arr;
  layer.geojsonData = minimalLineStringFeatureCollectionFromRouteExportRows(arr, {
    stationPoints: 'endpoints',
    routeLine: 'endpoints',
  });
}

/** 版面網格·座標正規化：清除直線化／正規化產物以改從新複製之 dataJson 重跑 */
export function resetJsonGridCoordNormalizedPipelineFields(lyr) {
  const dash = lyr.dashboardData;
  if (dash?.neighborTopologyFixLog?.length) {
    lyr.jsonGridNeighborFixPersist = {
      log: [...dash.neighborTopologyFixLog],
      at: dash.neighborTopologyFixAt,
      ok: dash.neighborTopologyFixOk,
      stale: true,
    };
  } else if (lyr.jsonGridNeighborFixPersist?.log?.length) {
    lyr.jsonGridNeighborFixPersist = {
      ...lyr.jsonGridNeighborFixPersist,
      stale: true,
    };
  }
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
  lyr.showStationPlacement = true;
  lyr.isLoaded = true;
  lyr.jsonGridCoordNormalizeReferenceC3 = null;
}

/**
 * Pinia persist 欄位：鏡像並重置管線後與 dataStore.toggle／reload 共用。
 * @param {{ omitLoadingFlags?: boolean }} [opts] toggle 時省略 isLoading，與原 store 行為一致。
 */
export function jsonGridCoordNormalizedPersistPayload(layer, opts = {}) {
  const { omitLoadingFlags = false } = opts;
  const payload = {
    isLoaded: layer.isLoaded,
    jsonData: layer.jsonData,
    geojsonData: layer.geojsonData,
    dataJson: layer.dataJson,
    layoutUniformGridGeoJson: layer.layoutUniformGridGeoJson ?? null,
    layoutUniformGridMeta: layer.layoutUniformGridMeta ?? null,
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
    showStationPlacement: layer.showStationPlacement,
    jsonGridNeighborFixPersist: layer.jsonGridNeighborFixPersist,
    jsonGridCoordNormalizeReferenceC3: layer.jsonGridCoordNormalizeReferenceC3,
  };
  if (!omitLoadingFlags) {
    payload.isLoading = layer.isLoading;
  }
  return payload;
}

/** 圖層開啟時：自父圖層鏡像、重置管線並 persist */
export function mirrorResetAndPersistJsonGridCoordNormalized(findLayerById, saveLayerState, layer) {
  applyOsm2DataJsonSyncedLayerFromParent(findLayerById, layer);
  resetJsonGridCoordNormalizedPipelineFields(layer);
  saveLayerState(layer.layerId, jsonGridCoordNormalizedPersistPayload(layer, { omitLoadingFlags: true }));
  syncJsonGridFromCoordNormalizedMirrorFromParent(findLayerById, saveLayerState);
}

/** reloadLayer：鏡像、重置、標記載入完成並 persist */
export function reloadJsonGridCoordNormalizedLayer(findLayerById, saveLayerState, layer) {
  applyOsm2DataJsonSyncedLayerFromParent(findLayerById, layer);
  resetJsonGridCoordNormalizedPipelineFields(layer);
  layer.isLoaded = true;
  layer.isLoading = false;
  saveLayerState(layer.layerId, jsonGridCoordNormalizedPersistPayload(layer));
  syncJsonGridFromCoordNormalizedMirrorFromParent(findLayerById, saveLayerState);
}

/** OSM 管線父圖層載入後，同步鏡像至座標正規化圖層並 persist（可見時） */
export function syncOsm2DataJsonMirrorFromParent(findLayerById, saveLayerState) {
  const layoutViewer = findLayerById(JSON_GRID_COORD_NORMALIZED_LAYER_ID);
  if (!layoutViewer) return;
  applyOsm2DataJsonSyncedLayerFromParent(findLayerById, layoutViewer);
  if (layoutViewer.visible) {
    saveLayerState(JSON_GRID_COORD_NORMALIZED_LAYER_ID, {
      jsonData: layoutViewer.jsonData,
      geojsonData: layoutViewer.geojsonData,
      dataJson: layoutViewer.dataJson,
      isLoaded: layoutViewer.isLoaded,
      layoutUniformGridGeoJson: layoutViewer.layoutUniformGridGeoJson ?? null,
      layoutUniformGridMeta: layoutViewer.layoutUniformGridMeta ?? null,
    });
  }
  syncJsonGridFromCoordNormalizedMirrorFromParent(findLayerById, saveLayerState);
}
