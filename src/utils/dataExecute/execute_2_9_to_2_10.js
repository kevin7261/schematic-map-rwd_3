// taipei_2_9 → taipei_2_10：複製資料（站點往中心聚集已移除）。
/* eslint-disable no-unused-vars */

import { useDataStore } from '@/stores/dataStore.js';

function deep(v) {
  return v != null ? JSON.parse(JSON.stringify(v)) : null;
}

export function execute_2_9_to_2_10(_jsonData) {
  const dataStore = useDataStore();
  const src = dataStore.findLayerById('taipei_2_9');
  const dst = dataStore.findLayerById('taipei_2_10');

  if (!src || !src.spaceNetworkGridJsonData) {
    throw new Error('找不到 taipei_2_9 的資料 (請先執行上一步)');
  }
  if (!dst) {
    throw new Error('找不到 taipei_2_10 圖層');
  }

  dst.spaceNetworkGridJsonData = deep(src.spaceNetworkGridJsonData);
  dst.spaceNetworkGridJsonData_SectionData = deep(src.spaceNetworkGridJsonData_SectionData);
  dst.spaceNetworkGridJsonData_ConnectData = deep(src.spaceNetworkGridJsonData_ConnectData);
  dst.spaceNetworkGridJsonData_StationData = deep(src.spaceNetworkGridJsonData_StationData);
  dst.showStationPlacement = !!src.showStationPlacement;
  dst.dashboardData = deep(src.dashboardData) ?? { source: 'taipei_2_9' };
  dst.isLoaded = true;

  if (!dst.visible) {
    dst.visible = true;
    dataStore.saveLayerState('taipei_2_10', { visible: true });
  }
}
