/**
 * dataStore 用：建立「站點與路線調整」八演算法圖層定義（精簡欄位）。
 */

/** @param {{ layerId: string, layerName: string, colorName: string, executeFunction: Function|null }} spec */
export function makeRouteAdjustLayoutLayer(spec) {
  return {
    layerId: spec.layerId,
    layerName: spec.layerName,
    visible: false,
    isLoading: false,
    isLoaded: false,
    colorName: spec.colorName,
    jsonData: null,
    spaceNetworkGridJsonData: null,
    spaceNetworkGridJsonData_SectionData: null,
    spaceNetworkGridJsonData_ConnectData: null,
    spaceNetworkGridJsonData_StationData: null,
    showStationPlacement: true,
    geojsonData: null,
    processedJsonData: null,
    drawJsonData: null,
    dashboardData: null,
    dataTableData: null,
    layerInfoData: null,
    jsonLoader: null,
    geojsonLoader: null,
    processToDrawData: null,
    geojsonFileName: null,
    osmFileName: null,
    jsonFileName: null,
    executeFunction: spec.executeFunction ?? null,
    isDataLayer: true,
    hideFromMap: true,
    display: true,
    highlightedSegmentIndex: null,
    squareGridCellsTaipeiTest3: false,
    dataOSM: null,
    dataGeojson: null,
    dataJson: null,
    isRouteSchematicLayer: true,
    isRouteAdjustLayoutLayer: true,
    upperViewTabs: [
      'space-layout-grid-viewer',
      'route-schematic',
      'space-network-grid-json-data',
      'dashboard',
    ],
  };
}

/** @param {{ layerId: string, layerName: string, colorName: string, executeFunction?: Function|null }} spec */
export function makeRouteAdjustAiLayer(spec) {
  const base = makeRouteAdjustLayoutLayer({
    ...spec,
    executeFunction: spec.executeFunction ?? null,
  });
  return {
    ...base,
    isRouteAdjustLayoutLayer: false,
    isRouteAdjustAiLayer: true,
  llmLayoutPayload: null,
  llmLayoutLastValidation: null,
  llmLayoutSession: null,
  };
}

/** @param {{ layerId: string, layerName: string, colorName: string }} spec */
export function makeRmaDetailAdjustLayer(spec) {
  return {
    layerId: spec.layerId,
    layerName: spec.layerName,
    visible: false,
    isLoading: false,
    isLoaded: false,
    colorName: spec.colorName,
    jsonData: null,
    spaceNetworkGridJsonData: null,
    spaceNetworkGridJsonData_SectionData: null,
    spaceNetworkGridJsonData_ConnectData: null,
    spaceNetworkGridJsonData_StationData: null,
    showStationPlacement: true,
    geojsonData: null,
    processedJsonData: null,
    drawJsonData: null,
    dashboardData: null,
    dataTableData: null,
    layerInfoData: null,
    jsonLoader: null,
    geojsonLoader: null,
    processToDrawData: null,
    geojsonFileName: null,
    osmFileName: null,
    jsonFileName: null,
    executeFunction: null,
    isDataLayer: true,
    hideFromMap: true,
    display: true,
    highlightedSegmentIndex: null,
    squareGridCellsTaipeiTest3: false,
    dataOSM: null,
    dataGeojson: null,
    dataJson: null,
    isRouteSchematicLayer: true,
    isRmaDetailAdjustLayer: true,
    upperViewTabs: [
      'space-layout-grid-viewer',
      'route-schematic',
      'space-network-grid-json-data',
      'dashboard',
    ],
  };
}
