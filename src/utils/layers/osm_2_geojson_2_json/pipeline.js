/**
 * OSM XML → GeoJSON FeatureCollection → 路段匯出 JSON（與 taipei_city_2026 同形之陣列寫入 jsonData）
 */

import { buildStandardRouteGeoJsonLoadResult } from '@/utils/dataProcessor.js';
import { exportRouteSegmentsFromGeoJson } from '@/utils/geojsonExportRouteSegments.js';
import { osmXmlStringToGeoJsonFeatureCollection } from '@/utils/osmXmlToGeoJson.js';

/** OSM XML 字串 → { geojsonData }（圖層 osm_2_geojson_2_json 管線第一步，非 layerId） */
export function osmXmlStringToGeojsonData(osmXmlString) {
  return { geojsonData: osmXmlStringToGeoJsonFeatureCollection(osmXmlString) };
}

/**
 * 路網 GeoJSON → 儀表板／表格＋路段匯出陣列（僅 jsonData；processedJsonData 為 null）
 * @param {Object} geojsonData - FeatureCollection
 */
export function geojson_2_json(geojsonData) {
  const base = buildStandardRouteGeoJsonLoadResult(geojsonData);
  const routeExportRows = exportRouteSegmentsFromGeoJson(geojsonData, {
    insertStationsOntoLinesByProximity: false,
  });
  return {
    ...base,
    jsonData: routeExportRows,
    processedJsonData: null,
  };
}

/**
 * @param {Object} obj - 已 parse 之 GeoJSON 根物件
 * @returns {Object} FeatureCollection
 */
function ensureRouteFeatureCollection(obj) {
  if (!obj || typeof obj !== 'object') {
    throw new Error('GeoJSON 必須為 JSON 物件');
  }
  if (obj.type === 'FeatureCollection') {
    if (!Array.isArray(obj.features)) {
      throw new Error('FeatureCollection 缺少 features 陣列');
    }
    return obj;
  }
  if (obj.type === 'Feature') {
    return { type: 'FeatureCollection', features: [obj] };
  }
  throw new Error(`不支援的 GeoJSON 根類型: ${obj.type ?? '(無 type)'}`);
}

/**
 * 路網 GeoJSON 物件 → 與 {@link osmXmlToOsm2GeojsonLoaderResult} 相同載入形狀（無原始 OSM XML）。
 * @param {Object} geojsonObj
 */
export function geojsonObjectToOsm2GeojsonLoaderResult(geojsonObj) {
  const geojsonData = ensureRouteFeatureCollection(geojsonObj);
  return {
    ...geojson_2_json(geojsonData),
    sourceOsmXmlText: '',
  };
}

/**
 * .geojson 檔案字串 → 與 {@link osmXmlToOsm2GeojsonLoaderResult} 相同載入形狀。
 * @param {string} text
 */
export function parseGeoJsonTextToOsm2GeojsonLoaderResult(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('GeoJSON 檔案必須為有效的 JSON');
  }
  return geojsonObjectToOsm2GeojsonLoaderResult(parsed);
}

/**
 * 單次載入：osmXmlStringToGeojsonData → geojson_2_json；供 geojsonLoader／本機選檔。
 * @returns {Object} 含 sourceOsmXmlText
 */
export function osmXmlToOsm2GeojsonLoaderResult(osmXmlString) {
  const { geojsonData } = osmXmlStringToGeojsonData(osmXmlString);
  return {
    ...geojson_2_json(geojsonData),
    sourceOsmXmlText: osmXmlString,
  };
}

/** @deprecated 請用 osmXmlToOsm2GeojsonLoaderResult */
export function parseLocalOsmXmlStringToRouteLoadResult(xmlString) {
  return osmXmlToOsm2GeojsonLoaderResult(xmlString);
}
