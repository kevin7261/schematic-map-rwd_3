/**
 * 圖層 osm_2_geojson_2_json：OSM XML → GeoJSON → 路段 JSON（模組分檔於本資料夾）。
 */

export {
  LAYER_ID,
  isSpaceLayoutUniformGridViewerLayerId,
  setOsm2GeojsonSessionOsmXml,
  getOsm2GeojsonSessionOsmXml,
} from './sessionOsmXml.js';
export {
  osmXmlStringToGeojsonData,
  geojson_2_json,
  geojsonObjectToOsm2GeojsonLoaderResult,
  parseGeoJsonTextToOsm2GeojsonLoaderResult,
  osmXmlToOsm2GeojsonLoaderResult,
  parseLocalOsmXmlStringToRouteLoadResult,
} from './pipeline.js';
export {
  mergeOsm2GeojsonLoaderResultIntoLayer,
  assignOsm2LayerViewerFields,
  getOsm2GeojsonPersistPatchAfterLoaderMerge,
  applyOsm2GeojsonRouteFieldsFromGeojsonData,
  syncOsm2LayerDerivedGeoJsonAndScheduleArtifactsPersist,
} from './layerMerge.js';
export { minimalOsmXmlFromLonLatFeatureCollection } from './minimalOsmXmlFromGeoJson.js';
