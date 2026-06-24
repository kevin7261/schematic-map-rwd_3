/**
 * executeTaipeiTest3_B3_To_C3：寫入 taipei_c3 之欄位與原 execute 相同（不另增／刪 dashboard 或圖層屬性）
 */

import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js';

function segmentCountFromNetwork(net) {
  if (!Array.isArray(net)) return 0;
  if (net[0]?.segments) {
    return net.reduce((n, r) => n + (Array.isArray(r.segments) ? r.segments.length : 0), 0);
  }
  return net.length;
}

/**
 * @param {*} straightenedNetwork - straightenSpaceNetworkAfterStrippingBlackStations 結果
 * @returns {Object} 與原 B3→C3 execute 寫入之鍵相同
 */
export function buildTaipeiC3StyleLayerFieldsFromStraightenedNetwork(straightenedNetwork) {
  const computed = computeStationDataFromRoutes(straightenedNetwork);

  let processedJsonData;
  try {
    processedJsonData = flatSegmentsToGeojsonStyleExportRows(straightenedNetwork);
  } catch (e) {
    console.error('交叉點直線化：匯出 processedJsonData 失敗', e);
    processedJsonData = [];
  }

  return {
    processedJsonData,
    spaceNetworkGridJsonData: straightenedNetwork,
    spaceNetworkGridJsonData_SectionData: computed.sectionData,
    spaceNetworkGridJsonData_ConnectData: computed.connectData,
    spaceNetworkGridJsonData_StationData: computed.stationData,
    showStationPlacement: false,
    dashboardData: {
      segmentCount: segmentCountFromNetwork(straightenedNetwork),
      sourceLayerId: 'taipei_b3',
      crossOnlyStraighten: true,
    },
  };
}
