/**
 * 資料處理_2：taipei_osm_geojson_2（geojsonData）→ 路段 JSON → taipei_b3_dp_2。
 */

/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojsonProc2 } from '@/utils/taipeiDataProcTest3/buildTaipeiA3StyleLayerFieldsFromGeojson.js';

const SOURCE_LAYER_ID = 'taipei_osm_geojson_2';
const TARGET_LAYER_ID = 'taipei_b3_dp_2';

export function executeOsmGeojsonToRouteSegmentsProc2() {
  const dataStore = useDataStore();
  const src = dataStore.findLayerById(SOURCE_LAYER_ID);
  const tgt = dataStore.findLayerById(TARGET_LAYER_ID);

  if (!src?.geojsonData?.features?.length) {
    throw new Error(`請先開啟並載入「Taipei OSM → GeoJSON（地圖）」圖層（${SOURCE_LAYER_ID}）`);
  }
  if (!tgt) {
    throw new Error(`找不到目標圖層 ${TARGET_LAYER_ID}`);
  }

  const derived = buildTaipeiB3ExecuteLayerFieldsFromGeojsonProc2(src.geojsonData);
  tgt.processedJsonData = derived.processedJsonData;
  tgt.spaceNetworkGridJsonData = derived.spaceNetworkGridJsonData;
  tgt.spaceNetworkGridJsonData_SectionData = derived.spaceNetworkGridJsonData_SectionData;
  tgt.spaceNetworkGridJsonData_ConnectData = derived.spaceNetworkGridJsonData_ConnectData;
  tgt.spaceNetworkGridJsonData_StationData = derived.spaceNetworkGridJsonData_StationData;
  tgt.showStationPlacement = derived.showStationPlacement;
  tgt.dashboardData = derived.dashboardData;
  tgt.isLoaded = true;
  tgt.isLoading = false;

  if (!tgt.visible) {
    tgt.visible = true;
    dataStore.saveLayerState(TARGET_LAYER_ID, { visible: true });
  }

  console.log(`executeOsmGeojsonToRouteSegmentsProc2：已寫入 ${TARGET_LAYER_ID}`);
}
