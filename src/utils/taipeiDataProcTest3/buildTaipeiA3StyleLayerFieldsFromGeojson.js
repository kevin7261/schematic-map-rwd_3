/**
 * 資料處理管線專用複本（與 taipeiTest3/buildTaipeiA3StyleLayerFieldsFromGeojson 同邏輯，獨立維護）。
 * OSM→GeoJSON 寫入 taipei_b3_dp 使用 buildTaipeiB3ExecuteLayerFieldsFromGeojson；taipei_a3 載入仍用 taipeiTest3 原檔。
 */

import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import {
  getGeoJsonFeatureTagProps,
  getGeoJsonRouteStableId,
  isGeoJsonWayLineFeature,
} from '@/utils/geojsonRouteHelpers.js';
import { mapDrawnExportRowsToFlatSegmentsLonLat } from '@/utils/mapDrawnRoutesImport.js';
import { exportTaipeiA3GeojsonToB3Rows } from './a3GeojsonToB3ExportRows.js';

function computeTaipeiA3NetworkFromGeojson(geojson, exportOptions) {
  const { rows, colabMeta, linearizeAlgorithm } = exportTaipeiA3GeojsonToB3Rows(geojson, exportOptions);
  const flatSegs = mapDrawnExportRowsToFlatSegmentsLonLat(rows);
  const computed = computeStationDataFromRoutes(flatSegs);
  return { rows, flatSegs, computed, colabMeta, linearizeAlgorithm };
}

/**
 * loadGeoJsonForRoutes（taipei_a3）專用
 * @param {*} geojson - FeatureCollection
 */
export function buildTaipeiA3LoadLayerFieldsFromGeojson(geojson) {
  const routeFeatures = geojson.features.filter(isGeoJsonWayLineFeature);
  const routeMap = new Map();
  routeFeatures.forEach((feature) => {
    const tags = getGeoJsonFeatureTagProps(feature);
    const routeId = getGeoJsonRouteStableId(feature);
    if (!routeMap.has(routeId)) {
      routeMap.set(routeId, {
        '#': routeMap.size + 1,
        route_id: tags.route_id || '-',
        route_name: tags.route_name || '-',
        route_company: tags.route_company || '-',
        color: tags.color || '#666666',
        railway: tags.railway || '-',
        ...tags,
      });
    }
  });
  const dataTableData = Array.from(routeMap.values());
  const dashboardBase = {
    totalRoutes: dataTableData.length,
    routeNames: dataTableData.map((route) => route.route_name).filter((name) => name !== '-'),
  };
  const layerInfoData = {
    totalRoutes: dataTableData.length,
    routeNames: dataTableData.map((route) => route.route_name).filter((name) => name !== '-'),
  };

  const { rows, flatSegs, computed, colabMeta, linearizeAlgorithm } = computeTaipeiA3NetworkFromGeojson(geojson);

  return {
    processedJsonData: rows,
    spaceNetworkGridJsonData: flatSegs,
    spaceNetworkGridJsonData_SectionData: computed.sectionData,
    spaceNetworkGridJsonData_ConnectData: computed.connectData,
    spaceNetworkGridJsonData_StationData: computed.stationData,
    showStationPlacement: true,
    dataTableData,
    layerInfoData,
    dashboardData: {
      ...dashboardBase,
      segmentCount: flatSegs.length,
      exportRowCount: rows.length,
      sectionCount: computed.sectionData?.length ?? 0,
      stationRecordCount: computed.stationData?.length ?? 0,
      sourceLayerId: 'taipei_a3',
      linearizeAlgorithm,
      ...(colabMeta ? { colabLinearize: colabMeta } : {}),
    },
  };
}

/**
 * executeOsmGeojsonToRouteSegments／taipei_b3_dp 專用（欄位與測試_3 寫入 b3 相同，sourceLayerId 改為 OSM 圖層）
 * @param {*} geojson - FeatureCollection
 */
export function buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson) {
  const { rows, flatSegs, computed, colabMeta, linearizeAlgorithm } = computeTaipeiA3NetworkFromGeojson(geojson, {
    forceCoordinateRouteSegments: true,
  });

  return {
    processedJsonData: rows,
    spaceNetworkGridJsonData: flatSegs,
    spaceNetworkGridJsonData_SectionData: computed.sectionData,
    spaceNetworkGridJsonData_ConnectData: computed.connectData,
    spaceNetworkGridJsonData_StationData: computed.stationData,
    showStationPlacement: true,
    dashboardData: {
      segmentCount: flatSegs.length,
      exportRowCount: rows.length,
      sourceLayerId: 'taipei_osm_geojson',
      segmentExportSource: 'geojson',
      linearizeAlgorithm,
      ...(colabMeta ? { colabLinearize: colabMeta } : {}),
    },
  };
}

/**
 * 資料處理_2：executeOsmGeojsonToRouteSegmentsProc2／taipei_b3_dp_2 專用（與 buildTaipeiB3ExecuteLayerFieldsFromGeojson 分函式複製，dashboard.sourceLayerId 獨立）
 * @param {*} geojson - FeatureCollection
 */
export function buildTaipeiB3ExecuteLayerFieldsFromGeojsonProc2(geojson) {
  const { rows, flatSegs, computed, colabMeta, linearizeAlgorithm } = computeTaipeiA3NetworkFromGeojson(geojson, {
    forceCoordinateRouteSegments: true,
  });

  return {
    processedJsonData: rows,
    spaceNetworkGridJsonData: flatSegs,
    spaceNetworkGridJsonData_SectionData: computed.sectionData,
    spaceNetworkGridJsonData_ConnectData: computed.connectData,
    spaceNetworkGridJsonData_StationData: computed.stationData,
    showStationPlacement: true,
    dashboardData: {
      segmentCount: flatSegs.length,
      exportRowCount: rows.length,
      sourceLayerId: 'taipei_osm_geojson_2',
      segmentExportSource: 'geojson',
      linearizeAlgorithm,
      ...(colabMeta ? { colabLinearize: colabMeta } : {}),
    },
  };
}

/**
 * 網絡繪製（_nd）：executeOsmGeojsonToRouteSegmentsNd／手繪 network_draw_sketch GeoJSON→taipei_b3_dp_nd 專用（與 Proc2 函式分檔複製）
 * @param {*} geojson - FeatureCollection
 */
export function buildTaipeiB3ExecuteLayerFieldsFromGeojsonNd(geojson) {
  const { rows, flatSegs, computed, colabMeta, linearizeAlgorithm } = computeTaipeiA3NetworkFromGeojson(geojson, {
    forceCoordinateRouteSegments: true,
  });

  return {
    processedJsonData: rows,
    spaceNetworkGridJsonData: flatSegs,
    spaceNetworkGridJsonData_SectionData: computed.sectionData,
    spaceNetworkGridJsonData_ConnectData: computed.connectData,
    spaceNetworkGridJsonData_StationData: computed.stationData,
    showStationPlacement: true,
    dashboardData: {
      segmentCount: flatSegs.length,
      exportRowCount: rows.length,
      sourceLayerId: 'network_draw_sketch',
      segmentExportSource: 'geojson',
      linearizeAlgorithm,
      ...(colabMeta ? { colabLinearize: colabMeta } : {}),
    },
  };
}
