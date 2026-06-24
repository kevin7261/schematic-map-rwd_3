/** osm_2_geojson_2_json：Upper「OSM XML」檢視用 session；不入 Pinia persist */

import {
  JSON_GRID_COORD_NORMALIZED_LAYER_ID,
  JSON_GRID_FROM_COORD_NORMALIZED_LAYER_ID,
  COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID,
  isLineOrthogonalTowardCenterLayerId,
  isSpaceGridVhDrawFamilyLayerId,
} from '../json_grid_coord_normalized/layerIds.js';

export const LAYER_ID = 'osm_2_geojson_2_json';

/** 是否為版面網格／座標正規化系譜圖層；供 JSON 檢視、端點 GeoJSON 等沿用 */
export function isSpaceLayoutUniformGridViewerLayerId(layerId) {
  return (
    layerId === JSON_GRID_COORD_NORMALIZED_LAYER_ID ||
    layerId === JSON_GRID_FROM_COORD_NORMALIZED_LAYER_ID ||
    layerId === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
    isLineOrthogonalTowardCenterLayerId(layerId) ||
    isSpaceGridVhDrawFamilyLayerId(layerId)
  );
}

let sessionOsmXmlSourceText = '';

export function setOsm2GeojsonSessionOsmXml(text) {
  sessionOsmXmlSourceText = typeof text === 'string' ? text : '';
}

export function getOsm2GeojsonSessionOsmXml() {
  return sessionOsmXmlSourceText;
}
