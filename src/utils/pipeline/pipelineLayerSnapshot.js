/**
 * 管線四階段（路線圖處理／示意圖佈局／路線調整／路網網格）圖層快照匯入／匯出。
 * 檔名：{groupName}_{layerName}_{cityName}.json
 */

import { isLayoutNetworkGridFromVhDrawLayerId } from '@/utils/layers/json_grid_coord_normalized/layerIds.js';

export const PIPELINE_SNAPSHOT_KIND = 'pipeline-layer-snapshot';
export const PIPELINE_SNAPSHOT_VERSION = 1;

export const PIPELINE_GROUP_NAMES = Object.freeze([
  '路線圖處理',
  '示意圖佈局',
  '路線調整',
  '路網網格',
]);

/** AI示意圖測試圖層（資料模型為 processedJsonData.routes + drawJsonData，與管線層不同）。 */
export const AI_TEST_SNAPSHOT_LAYER_IDS = Object.freeze([
  'ai_test_layer',
  'route_adjust_ai_test_layer',
]);

const AI_TEST_LAYER_KEYS = Object.freeze([
  'processedJsonData',
  'drawJsonData',
  'dashboardData',
  'dataTableData',
  'jsonData',
  'jsonFileName',
  'isLoaded',
  'hvOptimizeLastResult',
]);

const ROUTE_MAP_SELECT_KEYS = Object.freeze([
  'selectRouteMapLines',
  'selectRouteMapBlackDots',
  'selectRouteMapStationMeta',
  'selectRouteMapSource',
  'selectRouteMapGeojson',
  'selectRouteMapOfficialUrl',
  'selectRouteMapShowNames',
  'geojsonData',
  'isLoaded',
]);

const ROUTE_MAP_ADJUST_KEYS = Object.freeze([
  'routeMapAdjustLines',
  'routeMapAdjustBlackDots',
  'routeMapAdjustCrossStations',
  'routeMapAdjustSharedSegments',
  'routeMapAdjustSkeleton',
  'routeMapAdjustStraightenedLines',
  'routeMapAdjustStraightenedBlackDots',
  'routeMapAdjustStraightenedStationMeta',
  'routeMapAdjustStationMeta',
  'routeMapAdjustSource',
  'routeMapAdjustShowNames',
  'geojsonData',
  'isLoaded',
]);

const SPACE_NETWORK_PIPELINE_KEYS = Object.freeze([
  'spaceNetworkGridJsonData',
  'spaceNetworkGridJsonData_SectionData',
  'spaceNetworkGridJsonData_ConnectData',
  'spaceNetworkGridJsonData_StationData',
  'schematicBlackSections',
  'processedJsonData',
  'geojsonData',
  'jsonData',
  'dataJson',
  'dataOSM',
  'dataGeojson',
  'dataTableData',
  'dashboardData',
  'drawJsonData',
  'layoutUniformGridGeoJson',
  'layoutUniformGridMeta',
  'layoutVhDrawFineGrid',
  'layoutVhDrawFineGridTurnRbMidDots',
  'showStationPlacement',
  'seededFromSig',
  'milpRoutePairAudit',
  'schematicOverlapScan',
  'highlightedSegmentIndex',
  'rbConnectMovePreview',
  'rbConnectVisitedKeys',
  'jsonGridFromCoordSuggestTargetGrid',
  'lineOrthoTowardCrossHighlightTableAxis',
  'lineOrthoTowardCrossFrozenCenter',
  'connectStraightenHighlightCell',
  'connectStraightenMovePreview',
  'connectStraightenStepInfo',
  'milpReadStep',
  'milpReadStepInfo',
  'straightenedInput',
  'jsonGridCoordNormalizeReferenceC3',
  'jsonGridNeighborFixPersist',
  'jsonFileName',
]);

const LAYOUT_NETWORK_GRID_EXTRA_KEYS = Object.freeze([
  'rmaSourceLayerId',
  'vhDrawUserJsonOverride',
  'csvFileName_traffic',
  'layoutVhDrawTrafficData',
  'layoutVhDrawTrafficMissing',
  'layoutVhDrawShowTrafficWeights',
  'layoutVhDrawBlackDotRowColRatioReport',
  'layoutVhDrawShowBlackDotRowColRatioOverlay',
  'layoutVhDrawShowWeightRowColRatioOverlay',
  'layoutVhDrawWeightedNeighborHideMinPt',
  'layoutVhDrawFisheyeEnabled',
  'layoutVhDrawPathSelectMode',
  'layoutVhDrawAutoHideMidBlackDots',
  'layoutVhDrawShowEndpointStationNames',
  'layoutVhDrawShowMidBlackDotStationNames',
]);

/** @param {{ layers: Array<{ groupName: string, groupLayers: Array<{ layerId: string }> }> }} dataStore */
export function findPipelineGroupName(dataStore, layerId) {
  if (!dataStore?.layers || !layerId) return null;
  for (const g of dataStore.layers) {
    if (!PIPELINE_GROUP_NAMES.includes(g.groupName)) continue;
    if (g.groupLayers?.some((l) => l.layerId === layerId)) return g.groupName;
  }
  // AI示意圖測試等非管線群組：回實際所屬群組名（僅供檔名）
  for (const g of dataStore.layers) {
    if (g.groupLayers?.some((l) => l.layerId === layerId)) return g.groupName;
  }
  return null;
}

/** @param {{ layers: Array }} dataStore @param {object|null} layer */
export function isPipelineSnapshotLayer(dataStore, layer) {
  if (!layer?.layerId) return false;
  if (AI_TEST_SNAPSHOT_LAYER_IDS.includes(layer.layerId)) return true;
  return !!findPipelineGroupName(dataStore, layer.layerId);
}

export function sanitizePipelineSnapshotFilenamePart(text) {
  return (
    String(text ?? 'unknown')
      .trim()
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'unknown'
  );
}

/** @param {{ findLayerById: (id: string) => object|null }} dataStore */
export function resolvePipelineCityName(dataStore) {
  const srm = dataStore.findLayerById('select_route_map');
  const src = String(srm?.selectRouteMapSource ?? '').trim();
  if (src) {
    const head = src.split(',')[0]?.trim();
    if (head) return head;
  }
  for (const id of ['route_map_adjust', 'route_map_adjust_2', 'route_map_adjust_straight']) {
    const adj = dataStore.findLayerById(id);
    const as = String(adj?.routeMapAdjustSource ?? '').trim();
    const m = as.match(/：(.+?),/);
    if (m?.[1]) return m[1].trim();
  }
  return 'unknown';
}

function pickSnapshotKeys(layer) {
  if (AI_TEST_SNAPSHOT_LAYER_IDS.includes(layer.layerId)) return AI_TEST_LAYER_KEYS;
  if (layer.isSelectRouteMapLayer) return ROUTE_MAP_SELECT_KEYS;
  if (
    layer.isRouteMapAdjustLayer ||
    layer.isRouteMapAdjust2Layer ||
    layer.isRouteMapAdjustStraightLayer
  ) {
    return ROUTE_MAP_ADJUST_KEYS;
  }
  if (isLayoutNetworkGridFromVhDrawLayerId(layer.layerId)) {
    return [...SPACE_NETWORK_PIPELINE_KEYS, ...LAYOUT_NETWORK_GRID_EXTRA_KEYS];
  }
  if (layer.isRouteSchematicLayer || layer.isRouteAdjustLayoutLayer) {
    return SPACE_NETWORK_PIPELINE_KEYS;
  }
  return SPACE_NETWORK_PIPELINE_KEYS;
}

function copyKeysFromLayer(layer, keys) {
  const out = {};
  for (const k of keys) {
    if (layer[k] !== undefined) {
      out[k] = JSON.parse(JSON.stringify(layer[k]));
    }
  }
  return out;
}

/** @param {object|null} layer */
export function pipelineLayerHasExportableData(layer) {
  if (!layer) return false;
  if (AI_TEST_SNAPSHOT_LAYER_IDS.includes(layer.layerId)) {
    return (
      Array.isArray(layer.processedJsonData?.routes) &&
      layer.processedJsonData.routes.length > 0
    );
  }
  if (layer.isSelectRouteMapLayer) {
    return Array.isArray(layer.selectRouteMapLines) && layer.selectRouteMapLines.length > 0;
  }
  if (
    layer.isRouteMapAdjustLayer ||
    layer.isRouteMapAdjust2Layer ||
    layer.isRouteMapAdjustStraightLayer
  ) {
    const sk = layer.routeMapAdjustSkeleton;
    const edges = Array.isArray(sk?.edges) ? sk.edges : [];
    const lines = Array.isArray(layer.routeMapAdjustLines) ? layer.routeMapAdjustLines : [];
    return edges.length > 0 || lines.length > 0;
  }
  if (Array.isArray(layer.dataJson) && layer.dataJson.length > 0) return true;
  if (Array.isArray(layer.processedJsonData) && layer.processedJsonData.length > 0) return true;
  if (Array.isArray(layer.spaceNetworkGridJsonData) && layer.spaceNetworkGridJsonData.length > 0) {
    return true;
  }
  if (layer.geojsonData?.type === 'FeatureCollection' && layer.geojsonData.features?.length > 0) {
    return true;
  }
  return false;
}

export function buildPipelineLayerSnapshotFilename(groupName, layerName, cityName) {
  return `${sanitizePipelineSnapshotFilenamePart(groupName)}_${sanitizePipelineSnapshotFilenamePart(layerName)}_${sanitizePipelineSnapshotFilenamePart(cityName)}.json`;
}

/**
 * @param {object} layer
 * @param {{ findLayerById: Function, layers: Array }} dataStore
 */
export function buildPipelineLayerSnapshot(layer, dataStore) {
  const groupName = findPipelineGroupName(dataStore, layer.layerId);
  const layerName = layer.layerName || layer.layerId;
  const cityName = resolvePipelineCityName(dataStore);
  return {
    kind: PIPELINE_SNAPSHOT_KIND,
    version: PIPELINE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    layerId: layer.layerId,
    groupName,
    layerName,
    cityName,
    layerState: copyKeysFromLayer(layer, pickSnapshotKeys(layer)),
  };
}

function applyLayerState(layer, layerState) {
  if (!layer || !layerState || typeof layerState !== 'object') return;
  for (const [k, v] of Object.entries(layerState)) {
    layer[k] = JSON.parse(JSON.stringify(v));
  }
  if (isLayoutNetworkGridFromVhDrawLayerId(layer.layerId)) {
    layer.vhDrawUserJsonOverride = true;
  }
  layer.isLoaded = layer.isLoaded !== false;
  layer.isLoading = false;
}

/**
 * @param {object} layer
 * @param {unknown} parsed
 * @returns {{ ok: boolean, message?: string, snapshot?: object }}
 */
export function parsePipelineLayerSnapshotFile(parsed, expectedLayerId) {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, message: 'JSON 格式無效。' };
  }
  if (parsed.kind === PIPELINE_SNAPSHOT_KIND && parsed.layerState) {
    if (expectedLayerId && parsed.layerId && parsed.layerId !== expectedLayerId) {
      return {
        ok: false,
        message: `此快照屬於「${parsed.layerName || parsed.layerId}」，與目前圖層不符。`,
      };
    }
    return { ok: true, snapshot: parsed };
  }
  return {
    ok: false,
    message: '非管線快照格式。請使用本頁「匯出 JSON」產生的檔案。',
  };
}

/**
 * @param {object} layer
 * @param {object} snapshot
 * @param {{ saveLayerState?: (layerId: string, patch: object) => void, findLayerById?: Function, layers?: Array }} dataStore
 */
export function applyPipelineLayerSnapshot(layer, snapshot, dataStore) {
  applyLayerState(layer, snapshot.layerState);
  layer.jsonFileName = buildPipelineLayerSnapshotFilename(
    snapshot.groupName || findPipelineGroupName(dataStore, layer.layerId) || 'group',
    snapshot.layerName || layer.layerName,
    snapshot.cityName || resolvePipelineCityName(dataStore)
  );
  if (typeof dataStore?.saveLayerState === 'function') {
    const patch = {
      ...snapshot.layerState,
      isLoaded: true,
      isLoading: false,
      jsonFileName: layer.jsonFileName,
    };
    if (isLayoutNetworkGridFromVhDrawLayerId(layer.layerId)) {
      patch.vhDrawUserJsonOverride = true;
    }
    dataStore.saveLayerState(layer.layerId, patch);
  }
}

export function triggerPipelineJsonDownload(payload, filename) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
