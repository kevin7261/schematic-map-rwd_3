import { minimalLineStringFeatureCollectionFromRouteExportRows } from '@/utils/mapDrawnRoutesImport.js';

import { minimalOsmXmlFromLonLatFeatureCollection } from './minimalOsmXmlFromGeoJson.js';
import { LAYER_ID, getOsm2GeojsonSessionOsmXml } from './sessionOsmXml.js';
import { geojson_2_json } from './pipeline.js';

/**
 * 同步圖層上的 Upper 三分頁資料（不入檔、僅記憶體）。
 * @param {object} layer
 * @param {{ sourceOsmXmlText?: string, forceSyntheticOsm?: boolean }} [options]
 */
export function assignOsm2LayerViewerFields(layer, options = {}) {
  if (!layer || layer.layerId !== LAYER_ID) return;
  const { sourceOsmXmlText = '', forceSyntheticOsm = false } = options;
  layer.dataJson = layer.jsonData ?? null;
  layer.dataGeojson = layer.geojsonData ?? null;

  const gj = layer.geojsonData;
  const hasGj = gj?.features?.length > 0;
  let osm = '';

  if (forceSyntheticOsm) {
    osm = hasGj ? minimalOsmXmlFromLonLatFeatureCollection(gj) : '';
    if (!osm.trim()) {
      const sess = getOsm2GeojsonSessionOsmXml();
      if (sess?.trim()) osm = sess;
    }
    layer.dataOSM = osm.trim() ? osm : null;
    return;
  }

  if (typeof sourceOsmXmlText === 'string' && sourceOsmXmlText.trim()) {
    osm = sourceOsmXmlText;
  } else if (getOsm2GeojsonSessionOsmXml()?.trim()) {
    osm = getOsm2GeojsonSessionOsmXml();
  }
  if (!osm.trim() && hasGj) {
    osm = minimalOsmXmlFromLonLatFeatureCollection(gj);
  }
  layer.dataOSM = osm.trim() ? osm : null;
}

/**
 * @param {object} layer
 * @param {object} result
 * @param {{ groupName?: string, sourceOsmXmlText?: string } | null} [persistence]
 */
export function mergeOsm2GeojsonLoaderResultIntoLayer(layer, result, persistence = null) {
  layer.jsonData = result.jsonData ?? null;
  layer.processedJsonData = result.processedJsonData ?? null;
  layer.geojsonData = result.geojsonData ?? null;
  layer.dashboardData = result.dashboardData ?? null;
  layer.dataTableData = result.dataTableData ?? null;
  layer.layerInfoData = result.layerInfoData ?? null;
  layer.isLoaded = true;
  layer.isLoading = false;
  const src =
    typeof persistence?.sourceOsmXmlText === 'string' && persistence.sourceOsmXmlText.trim()
      ? persistence.sourceOsmXmlText
      : typeof result?.sourceOsmXmlText === 'string'
        ? result.sourceOsmXmlText
        : '';
  if (layer.layerId === LAYER_ID) {
    assignOsm2LayerViewerFields(layer, { sourceOsmXmlText: src });
  }
}

/** 供本機載入後 saveLayerState 使用 */
export function getOsm2GeojsonPersistPatchAfterLoaderMerge(layer) {
  return {
    osmFileName: layer.osmFileName,
    jsonData: layer.jsonData,
    processedJsonData: layer.processedJsonData,
    geojsonData: layer.geojsonData,
    dataOSM: layer.dataOSM,
    dataGeojson: layer.dataGeojson,
    dataJson: layer.dataJson,
    dashboardData: layer.dashboardData,
    dataTableData: layer.dataTableData,
    layerInfoData: layer.layerInfoData,
    isLoaded: layer.isLoaded,
    isLoading: layer.isLoading,
  };
}

/**
 * 依目前 geojsonData 再跑 geojson_2_json，寫回圖層
 * @returns {Object|null} saveLayerState 用之 patch；無資料時 null
 */
export function applyOsm2GeojsonRouteFieldsFromGeojsonData(layer) {
  const gj = layer?.geojsonData;
  if (!gj?.features?.length) return null;
  const result = geojson_2_json(gj);
  layer.processedJsonData = result.processedJsonData ?? null;
  layer.dashboardData = result.dashboardData ?? null;
  layer.dataTableData = result.dataTableData ?? null;
  layer.layerInfoData = result.layerInfoData ?? null;
  layer.jsonData = result.jsonData ?? null;
  if (layer.layerId === LAYER_ID) {
    assignOsm2LayerViewerFields(layer, {});
  }
  return {
    processedJsonData: layer.processedJsonData,
    dashboardData: layer.dashboardData,
    dataTableData: layer.dataTableData,
    layerInfoData: layer.layerInfoData,
    jsonData: layer.jsonData,
  };
}

/**
 * MapTab 手繪／交叉後：依 jsonData 還原路線 LineString GeoJSON，並更新 dataOSM／dataGeojson／dataJson（由 GeoJSON 產生簡易 OSM XML）。
 *
 * @param {object} layer
 * @param {string|null|undefined} groupName
 */
export function syncOsm2LayerDerivedGeoJsonAndScheduleArtifactsPersist(layer, groupName) {
  if (!layer || layer.layerId !== LAYER_ID || !groupName || String(groupName).trim() === '') {
    return null;
  }
  const gj = minimalLineStringFeatureCollectionFromRouteExportRows(
    Array.isArray(layer.jsonData) ? layer.jsonData : []
  );
  layer.geojsonData = gj;
  assignOsm2LayerViewerFields(layer, { forceSyntheticOsm: true });
  return { geojsonData: gj };
}
