/* eslint-disable no-console */

/**
 * 「JSON·網格·座標正規化」圖層：單鍵 **b→c→d**（見 `layerId`：'json_grid_coord_normalized'）。
 * 開啟本圖層時已由 dataStore 自 `osm_2_geojson_2_json` 複製 `dataJson`／`geojsonData`；
 * 每次正規化／刪空欄列／鄰線修正成功後會將匯出列寫回 `dataJson`／`jsonData`／`geojsonData` 並 persist，供下游圖層鏡像讀取。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiD3FromC3Network } from '@/utils/taipeiTest4/c3ToD3CoordNormalize.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { LAYER_ID as OSM_2_LAYER_ID } from '@/utils/layers/osm_2_geojson_2_json/sessionOsmXml.js';
import {
  buildC3NetworkForCoordNormalize,
  writeLayoutNormalizedLayerDataOsmFromNetwork,
} from './jsonGridCoordNormalizeHelpers.js';
import {
  analyzeCoordNormalizeTopology,
  applyNeighborSideTopologyFix,
} from './coordNormalizeTopology.js';
import { pruneGridLinesWithoutConnectVertices } from '@/utils/taipeiDataProcTest3/f3ToG3PruneEmptyGridLines.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import {
  jsonGridCoordNormalizedPersistPayload,
  syncJsonGridCoordNormalizedDataJsonFromPipeline,
} from './mirrorFromOsm2Layer.js';
import { syncJsonGridFromCoordNormalizedMirrorFromParent } from './mirrorFromCoordNormalizedLayer.js';

export function executeJsonGridCoordNormalize() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById('json_grid_coord_normalized');
  if (!layer) {
    console.warn('executeJsonGridCoordNormalize：找不到圖層', 'json_grid_coord_normalized');
    return false;
  }

  const c3Prep = buildC3NetworkForCoordNormalize(layer);
  if (!c3Prep) return false;

  const { c3Network, resolved } = c3Prep;
  const out = buildTaipeiD3FromC3Network(c3Network);
  const topologyCheck = analyzeCoordNormalizeTopology(c3Network, out.flatSegs);

  try {
    layer.jsonGridCoordNormalizeReferenceC3 = JSON.parse(JSON.stringify(c3Network));
  } catch {
    layer.jsonGridCoordNormalizeReferenceC3 = null;
  }

  layer.spaceNetworkGridJsonData = out.flatSegs;
  layer.spaceNetworkGridJsonData_SectionData = out.sectionData;
  layer.spaceNetworkGridJsonData_ConnectData = out.connectData;
  layer.spaceNetworkGridJsonData_StationData = out.stationData;
  layer.showStationPlacement = false;
  layer.isLoaded = true;

  try {
    layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(out.flatSegs);
  } catch (e) {
    console.error('JSON 網格座標正規化：匯出 processedJsonData 失敗', e);
    layer.processedJsonData = out.rows ?? null;
  }

  const prevDash =
    layer.dashboardData && typeof layer.dashboardData === 'object' ? layer.dashboardData : {};
  const persistFix = layer.jsonGridNeighborFixPersist;
  let fixLog =
    Array.isArray(prevDash.neighborTopologyFixLog) && prevDash.neighborTopologyFixLog.length
      ? [...prevDash.neighborTopologyFixLog]
      : null;
  let fixAt = prevDash.neighborTopologyFixAt;
  let fixOk = prevDash.neighborTopologyFixOk;
  if (!fixLog?.length && persistFix?.log?.length) {
    fixLog = [...persistFix.log];
    fixAt = persistFix.at;
    fixOk = persistFix.ok;
  }
  const hadFixLog = !!(fixLog && fixLog.length);

  layer.dashboardData = {
    segmentCount: out.flatSegs.length,
    exportRowCount: Array.isArray(layer.processedJsonData) ? layer.processedJsonData.length : 0,
    sourceLayerId: 'json_grid_coord_normalized',
    routeSourceLayerId: resolved.fromExistingSn ? 'json_grid_coord_normalized' : OSM_2_LAYER_ID,
    coordNormalize: true,
    straightened: true,
    ...out.meta,
    topologyCheck,
    ...(hadFixLog
      ? {
          neighborTopologyFixLog: fixLog,
          neighborTopologyFixOk: fixOk,
          neighborTopologyFixAt: fixAt,
          neighborTopologyFixStale: true,
        }
      : {}),
  };

  if (hadFixLog && fixLog) {
    layer.jsonGridNeighborFixPersist = {
      log: fixLog,
      at: fixAt,
      ok: fixOk,
      stale: true,
    };
  }

  writeLayoutNormalizedLayerDataOsmFromNetwork(layer, out.flatSegs);

  syncJsonGridCoordNormalizedDataJsonFromPipeline(layer);
  dataStore.saveLayerState(
    'json_grid_coord_normalized',
    jsonGridCoordNormalizedPersistPayload(layer)
  );
  syncJsonGridFromCoordNormalizedMirrorFromParent(
    (id) => dataStore.findLayerById(id),
    dataStore.saveLayerState
  );

  return true;
}

/**
 * 同 {@link executeTaipeiDataProcTest3_D3_To_E3_Proc2}：對本層正規化後路網刪除無 connect 之整欄／列並壓縮座標，
 * 重算 Section／Connect／Station、processedJson、dataOSM 並 persist。
 * @returns {{ ok: boolean, noop?: boolean, reason?: string, colCount?: number, rowCount?: number }}
 */
export function executeJsonGridCoordNormalizedPruneEmptyGridLines() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById('json_grid_coord_normalized');
  if (!layer) {
    console.warn('executeJsonGridCoordNormalizedPruneEmptyGridLines：找不到圖層');
    return { ok: false, reason: 'no-layer' };
  }
  if (!layer.spaceNetworkGridJsonData?.length) {
    return { ok: false, reason: 'no-network' };
  }

  const inputSegs = JSON.parse(JSON.stringify(layer.spaceNetworkGridJsonData));
  const {
    segments: S_strokes,
    removedCols,
    removedRows,
    colCount,
    rowCount,
  } = pruneGridLinesWithoutConnectVertices(inputSegs);

  if (colCount === 0 && rowCount === 0) {
    return {
      ok: true,
      noop: true,
      colCount,
      rowCount,
      removedCols,
      removedRows,
    };
  }

  const computed = computeStationDataFromRoutes(S_strokes);
  layer.spaceNetworkGridJsonData = S_strokes;
  layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  layer.showStationPlacement = false;

  try {
    layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(layer.spaceNetworkGridJsonData);
  } catch (e) {
    console.error('刪空欄列：匯出 processedJsonData 失敗', e);
  }

  const prevDash =
    layer.dashboardData && typeof layer.dashboardData === 'object' ? layer.dashboardData : {};
  const persistFix = layer.jsonGridNeighborFixPersist;
  let fixLog =
    Array.isArray(prevDash.neighborTopologyFixLog) && prevDash.neighborTopologyFixLog.length
      ? [...prevDash.neighborTopologyFixLog]
      : null;
  let fixAt = prevDash.neighborTopologyFixAt;
  let fixOk = prevDash.neighborTopologyFixOk;
  if (!fixLog?.length && persistFix?.log?.length) {
    fixLog = [...persistFix.log];
    fixAt = persistFix.at;
    fixOk = persistFix.ok;
  }
  const hadFixLog = !!(fixLog && fixLog.length);

  layer.dashboardData = {
    ...prevDash,
    segmentCount: S_strokes.length,
    exportRowCount: Array.isArray(layer.processedJsonData) ? layer.processedJsonData.length : 0,
    topologyCheck: {
      skipped: true,
      summaryZh: '路網已執行「刪空欄列」；請再按「座標正規化」以重建 c3／d3 並更新拓撲比對。',
    },
    pruneEmptyGridLinesAt: Date.now(),
    removedColCount: colCount,
    removedRowCount: rowCount,
    removedCols,
    removedRows,
    inputSegments: inputSegs.length,
    outputSegments: S_strokes.length,
    ...(hadFixLog
      ? {
          neighborTopologyFixLog: fixLog,
          neighborTopologyFixOk: fixOk,
          neighborTopologyFixAt: fixAt,
          neighborTopologyFixStale: true,
        }
      : {}),
  };

  if (hadFixLog && fixLog) {
    layer.jsonGridNeighborFixPersist = {
      log: fixLog,
      at: fixAt,
      ok: fixOk,
      stale: true,
    };
  }

  writeLayoutNormalizedLayerDataOsmFromNetwork(layer, S_strokes);

  syncJsonGridCoordNormalizedDataJsonFromPipeline(layer);
  dataStore.saveLayerState(
    'json_grid_coord_normalized',
    jsonGridCoordNormalizedPersistPayload(layer)
  );
  syncJsonGridFromCoordNormalizedMirrorFromParent(
    (id) => dataStore.findLayerById(id),
    dataStore.saveLayerState
  );

  return {
    ok: true,
    noop: false,
    colCount,
    rowCount,
    removedCols,
    removedRows,
  };
}

/**
 * 依 c3 參考，將 d3 路網中「相對鄰線錯邊」之頂點移至最近合法格點，並重寫 OSM／processedJson。
 */
export function executeJsonGridNeighborTopologyFix() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById('json_grid_coord_normalized');
  if (!layer) {
    console.warn('executeJsonGridNeighborTopologyFix：找不到圖層');
    return { ok: false, message: '找不到圖層', moveLines: [] };
  }

  const c3Prep = buildC3NetworkForCoordNormalize(layer);
  if (!c3Prep?.c3Network?.length) {
    return { ok: false, message: '無法取得 c3 參考路網', moveLines: [] };
  }

  const sn = layer.spaceNetworkGridJsonData;
  if (!Array.isArray(sn) || sn.length === 0) {
    return {
      ok: false,
      message: '本層尚無正規化後路網（spaceNetworkGridJsonData）',
      moveLines: [],
    };
  }

  const hasStoredC3 =
    Array.isArray(layer.jsonGridCoordNormalizeReferenceC3) &&
    layer.jsonGridCoordNormalizeReferenceC3.length > 0;
  const c3ForFix = hasStoredC3 ? layer.jsonGridCoordNormalizeReferenceC3 : c3Prep.c3Network;

  if (!hasStoredC3) {
    console.warn(
      'executeJsonGridNeighborTopologyFix：缺少上次「座標正規化」所存之 c3 參考，改用即時從路網重建的 c3（可能無法偵測錯邊）。請再執行一次「座標正規化」後再按「修正」。'
    );
  }

  const { resolved } = c3Prep;
  const r = applyNeighborSideTopologyFix(c3ForFix, sn);

  const baseDash =
    layer.dashboardData && typeof layer.dashboardData === 'object' ? layer.dashboardData : {};
  layer.dashboardData = {
    ...baseDash,
    topologyCheck: r.topologyCheck,
    neighborTopologyFixLog: r.moveLines,
    neighborTopologyFixOk: r.ok,
    neighborTopologyFixAt: Date.now(),
    neighborTopologyFixStale: false,
  };

  const persistPayload = {
    log: r.moveLines,
    at: layer.dashboardData.neighborTopologyFixAt,
    ok: r.ok,
    stale: false,
  };
  layer.jsonGridNeighborFixPersist =
    r.moveLines?.length > 0 ? persistPayload : (layer.jsonGridNeighborFixPersist ?? null);

  if (!r.ok) {
    dataStore.saveLayerState('json_grid_coord_normalized', {
      dashboardData: layer.dashboardData,
      jsonGridNeighborFixPersist: layer.jsonGridNeighborFixPersist,
      jsonGridCoordNormalizeReferenceC3: layer.jsonGridCoordNormalizeReferenceC3,
    });
    return {
      ok: false,
      message: r.errorZh || '修正未完成',
      moveLines: r.moveLines,
      topologyCheck: r.topologyCheck,
    };
  }

  layer.spaceNetworkGridJsonData = r.patched;
  try {
    layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(r.patched);
  } catch (e) {
    console.error('鄰線錯邊修正：匯出 processedJsonData 失敗', e);
  }

  writeLayoutNormalizedLayerDataOsmFromNetwork(layer, r.patched);

  syncJsonGridCoordNormalizedDataJsonFromPipeline(layer);
  dataStore.saveLayerState(
    'json_grid_coord_normalized',
    jsonGridCoordNormalizedPersistPayload(layer)
  );
  syncJsonGridFromCoordNormalizedMirrorFromParent(
    (id) => dataStore.findLayerById(id),
    dataStore.saveLayerState
  );

  return {
    ok: true,
    message: `已修正 ${r.moveLines.length} 個頂點（${r.iterations} 輪）。`,
    moveLines: r.moveLines,
    topologyCheck: r.topologyCheck,
    routeSourceLayerId: resolved?.fromExistingSn ? 'json_grid_coord_normalized' : OSM_2_LAYER_ID,
  };
}
