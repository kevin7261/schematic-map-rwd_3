/* eslint-disable no-console */

/**
 * taipei_b4 → taipei_c4：複製路網與衍生欄位（與 b5→c5 相同語意）。b4 為 a4→b4 產出；後續手動合併等操作在 c4。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js';
import { buildTaipeiK3JunctionDataTableRows } from '@/utils/taipeiK3JunctionDataTable.js';

function deepCloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export async function execute_B4_To_C4() {
  const dataStore = useDataStore();
  const b4 = dataStore.findLayerById('taipei_b4');
  const c4 = dataStore.findLayerById('taipei_c4');
  if (!b4 || !c4) {
    console.warn('execute_B4_To_C4：缺少 taipei_b4 或 taipei_c4 圖層');
    return;
  }

  const b4Routes = b4.spaceNetworkGridJsonDataK3Tab;
  if (!Array.isArray(b4Routes) || b4Routes.length === 0) {
    console.warn('execute_B4_To_C4：taipei_b4 尚無 layout-network（K3Tab）路網，請先執行 a4→b4');
    return;
  }

  const finalSegs = deepCloneJson(b4Routes);
  const computed = computeStationDataFromRoutes(finalSegs);

  let processedJsonData;
  try {
    processedJsonData = flatSegmentsToGeojsonStyleExportRows(finalSegs);
  } catch (e) {
    console.error('execute_B4_To_C4：processedJsonData 轉換失敗', e);
    processedJsonData = [];
  }
  const c = deepCloneJson;

  c4.jsonData = c(b4.jsonData);
  c4.trafficData = c(b4.trafficData);

  c4.spaceNetworkGridJsonDataK3Tab = c(finalSegs);
  c4.spaceNetworkGridJsonDataK3Tab_SectionData = c(computed.sectionData);
  c4.spaceNetworkGridJsonDataK3Tab_ConnectData = c(computed.connectData);
  c4.spaceNetworkGridJsonDataK3Tab_StationData = c(computed.stationData);

  c4.spaceNetworkGridJsonData = c(finalSegs);
  c4.spaceNetworkGridJsonData_SectionData = c(computed.sectionData);
  c4.spaceNetworkGridJsonData_ConnectData = c(computed.connectData);
  c4.spaceNetworkGridJsonData_StationData = c(computed.stationData);

  c4.processedJsonDataK3Tab = processedJsonData != null ? c(processedJsonData) : null;
  c4.processedJsonData = c(processedJsonData);
  c4.dataTableData = buildTaipeiK3JunctionDataTableRows(c(c4.spaceNetworkGridJsonDataK3Tab));

  c4.layoutGridJsonData = c(finalSegs);
  c4.layoutGridJsonData_Test = c(finalSegs);
  c4.layoutGridJsonData_Test2 = c(finalSegs);
  c4.layoutGridJsonData_Test3 = c(finalSegs);
  c4.layoutGridJsonData_Test4 = c(finalSegs);

  const baseInfo = c(b4.layerInfoData);
  c4.layerInfoData =
    baseInfo && typeof baseInfo === 'object'
      ? {
          ...baseInfo,
          copiedFromLayerId: 'taipei_b4',
          weightScaledDivisor: 100,
          weightScaleRule: 'floor_divide_min_1',
        }
      : {
          copiedFromLayerId: 'taipei_b4',
          weightScaledDivisor: 100,
          weightScaleRule: 'floor_divide_min_1',
        };

  const baseDash = c(b4.dashboardData);
  c4.dashboardData =
    baseDash && typeof baseDash === 'object'
      ? {
          ...baseDash,
          segmentCount: finalSegs.length,
          weightScaledDivisor: 100,
        }
      : {
          segmentCount: finalSegs.length,
          weightScaledDivisor: 100,
        };

  c4.drawJsonData = c(b4.drawJsonData);
  c4.squareGridCellsTaipeiTest3 = b4.squareGridCellsTaipeiTest3 === true;
  c4.showStationPlacement = b4.showStationPlacement !== false;
  c4.removedZeroWeightBlackDots = c(b4.removedZeroWeightBlackDots);
  c4.isLoaded = true;

  if (!c4.visible) {
    c4.visible = true;
    dataStore.saveLayerState('taipei_c4', { visible: true });
  }

  dataStore.saveLayerState('taipei_c4', {
    isLoaded: c4.isLoaded,
    jsonData: c4.jsonData,
    trafficData: c4.trafficData,
    spaceNetworkGridJsonDataK3Tab: c4.spaceNetworkGridJsonDataK3Tab,
    spaceNetworkGridJsonDataK3Tab_SectionData: c4.spaceNetworkGridJsonDataK3Tab_SectionData,
    spaceNetworkGridJsonDataK3Tab_ConnectData: c4.spaceNetworkGridJsonDataK3Tab_ConnectData,
    spaceNetworkGridJsonDataK3Tab_StationData: c4.spaceNetworkGridJsonDataK3Tab_StationData,
    spaceNetworkGridJsonData: c4.spaceNetworkGridJsonData,
    spaceNetworkGridJsonData_SectionData: c4.spaceNetworkGridJsonData_SectionData,
    spaceNetworkGridJsonData_ConnectData: c4.spaceNetworkGridJsonData_ConnectData,
    spaceNetworkGridJsonData_StationData: c4.spaceNetworkGridJsonData_StationData,
    processedJsonDataK3Tab: c4.processedJsonDataK3Tab,
    processedJsonData: c4.processedJsonData,
    dataTableData: c4.dataTableData,
    layerInfoData: c4.layerInfoData,
    dashboardData: c4.dashboardData,
    drawJsonData: c4.drawJsonData,
    layoutGridJsonData: c4.layoutGridJsonData,
    layoutGridJsonData_Test: c4.layoutGridJsonData_Test,
    layoutGridJsonData_Test2: c4.layoutGridJsonData_Test2,
    layoutGridJsonData_Test3: c4.layoutGridJsonData_Test3,
    layoutGridJsonData_Test4: c4.layoutGridJsonData_Test4,
    squareGridCellsTaipeiTest3: c4.squareGridCellsTaipeiTest3,
    showStationPlacement: c4.showStationPlacement,
    removedZeroWeightBlackDots: c4.removedZeroWeightBlackDots,
  });

  console.log(`execute_B4_To_C4 完成：${finalSegs.length} 段路線已複製至 taipei_c4`);
}
