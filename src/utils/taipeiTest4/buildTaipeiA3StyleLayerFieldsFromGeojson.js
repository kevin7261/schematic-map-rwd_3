/**
 * taipei_sn4_a 載入 GeoJSON（loadGeoJsonForRoutes）與 executeTaipeiTest3_A3_To_B3 分流：
 * - 載入：含 dataTableData、layerInfoData 與較完整的 dashboardData（與原 load 合併結果一致）
 * - 寫入 b3：僅原 execute 會設定的欄位與 dashboard 鍵，不另增屬性
 */

import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import {
  compactNumericStationFieldsInExportRows,
  getGeoJsonFeatureTagProps,
  getGeoJsonRouteStableId,
  isGeoJsonWayLineFeature,
} from '@/utils/geojsonRouteHelpers.js';
import { mapDrawnExportRowsToFlatSegmentsLonLat } from '@/utils/mapDrawnRoutesImport.js';
import { exportTaipeiA3GeojsonToB3Rows } from './a3GeojsonToB3ExportRows.js';
import { hydrateExportRowsFromWayPropertyStations } from './hydrateExportRowsFromWayPropertyStations.js';

function computeTaipeiA3NetworkFromGeojson(geojson, exportOptions) {
  const { rows, colabMeta, linearizeAlgorithm } = exportTaipeiA3GeojsonToB3Rows(geojson, exportOptions);
  hydrateExportRowsFromWayPropertyStations(geojson, rows);
  if (exportOptions?.compactStationNumericIds) {
    compactNumericStationFieldsInExportRows(rows);
  }
  const flatSegs = mapDrawnExportRowsToFlatSegmentsLonLat(rows);
  const computed = computeStationDataFromRoutes(flatSegs);
  return { rows, flatSegs, computed, colabMeta, linearizeAlgorithm };
}

/**
 * loadGeoJsonForRoutes（taipei_sn4_a）專用
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
      sourceLayerId: 'taipei_sn4_a',
      linearizeAlgorithm,
      ...(colabMeta ? { colabLinearize: colabMeta } : {}),
    },
  };
}

/**
 * executeTaipeiTest3_A3_To_B3 專用（僅原寫入 b3 之欄位）
 * @param {*} geojson - FeatureCollection
 * @param {{
 *   renameEachEmittedSegment?: boolean,
 *   emittedSegmentNamePrefix?: string,
 *   compactStationNumericIds?: boolean,
 * }} [extraExportOptions]
 */
export function buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, extraExportOptions = {}) {
  const { rows, flatSegs, computed, colabMeta, linearizeAlgorithm } = computeTaipeiA3NetworkFromGeojson(geojson, {
    forceCoordinateRouteSegments: true,
    ...extraExportOptions,
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
      sourceLayerId: 'taipei_sn4_a',
      segmentExportSource: 'geojson',
      linearizeAlgorithm,
      ...(colabMeta ? { colabLinearize: colabMeta } : {}),
    },
  };
}
