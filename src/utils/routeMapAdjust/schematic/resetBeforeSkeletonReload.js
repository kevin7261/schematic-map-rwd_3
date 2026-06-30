/**
 * 示意圖佈局 #1–#9：從「路線圖轉換骨架」三按鈕重新載入前，
 * 清除「開始執行」產物，回到僅骨架輸入、尚未佈局的狀態。
 * @param {object|null} layer
 */
export function resetSchematicLayoutBeforeSkeletonReload(layer) {
  if (!layer) return;
  layer.spaceNetworkGridJsonData = null;
  layer.spaceNetworkGridJsonData_SectionData = null;
  layer.spaceNetworkGridJsonData_ConnectData = null;
  layer.spaceNetworkGridJsonData_StationData = null;
  layer.processedJsonData = null;
  layer.dashboardData = null;
  layer.drawJsonData = null;
  layer.dataTableData = null;
  layer.layerInfoData = null;
  layer.jsonData = null;
  layer.dataJson = null;
  layer.dataOSM = null;
  layer.dataGeojson = null;
  layer.milpRoutePairAudit = null;
  layer.schematicOverlapScan = null;
  layer.highlightedSegmentIndex = null;
  layer.seededFromSig = null;
  layer.quadtreePartition = null;
  layer.showStationPlacement = true;
  layer.geojsonData = null;
}
