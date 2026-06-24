/**
 * 資料處理：taipei_osm_geojson（geojsonData）→ 路段 JSON → taipei_b3_dp（空間網路網格 + 處理後 JSON）。
 */

/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiDataProcTest3/buildTaipeiA3StyleLayerFieldsFromGeojson.js';

const SOURCE_LAYER_ID = 'taipei_osm_geojson';
const TARGET_LAYER_ID = 'taipei_b3_dp';

export function executeOsmGeojsonToRouteSegments() {
  const dataStore = useDataStore();
  const src = dataStore.findLayerById(SOURCE_LAYER_ID);
  const tgt = dataStore.findLayerById(TARGET_LAYER_ID);

  if (!src?.geojsonData?.features?.length) {
    throw new Error(`請先開啟並載入「Taipei OSM → GeoJSON」圖層（${SOURCE_LAYER_ID}）`);
  }
  if (!tgt) {
    throw new Error(`找不到目標圖層 ${TARGET_LAYER_ID}`);
  }

  const derived = buildTaipeiB3ExecuteLayerFieldsFromGeojson(src.geojsonData);
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

  console.log(`executeOsmGeojsonToRouteSegments：已寫入 ${TARGET_LAYER_ID}`);
}
