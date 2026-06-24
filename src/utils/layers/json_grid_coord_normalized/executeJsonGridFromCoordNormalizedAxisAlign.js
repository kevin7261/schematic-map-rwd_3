/* eslint-disable no-console */

/**
 * 「站點移動水平垂直化」圖層（layerId：`point_orthogonal`）：格點路網四鄰橫豎化、刪空欄列等。
 * 橫豎化每外輪先處理「hub 紅 connect − 末端藍 connect」斜鄰段：只平移藍端共點群使該段變 H／V，再進行既有的共點鄰格 hill climb。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';
import { resolveB3InputSpaceNetwork, writeLayoutNormalizedLayerDataOsmFromNetwork } from './jsonGridCoordNormalizeHelpers.js';
import { runAxisAlignHillClimb } from './axisAlignGridNetworkHillClimb.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { pruneGridLinesWithoutConnectVertices } from '@/utils/taipeiDataProcTest3/f3ToG3PruneEmptyGridLines.js';
import {
  jsonGridFromCoordNormalizedPersistPayload,
  syncJsonGridFromCoordDataJsonFromPipeline,
  refreshLineOrthogonalFromPointOrthogonalIfVisible,
} from './mirrorFromCoordNormalizedLayer.js';
import { POINT_ORTHOGONAL_LAYER_ID } from './layerIds.js';

const LAYER_ID = POINT_ORTHOGONAL_LAYER_ID;

/**
 * @returns {{ ok: boolean, noop?: boolean, message?: string, iterations?: number, costBefore?: number, costAfter?: number }}
 */
export function executeJsonGridFromCoordNormalizedAxisAlign(opts = {}) {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(LAYER_ID);
  if (!layer) {
    console.warn('executeJsonGridFromCoordNormalizedAxisAlign：找不到圖層', LAYER_ID);
    return { ok: false, message: '找不到圖層' };
  }

  const resolved = resolveB3InputSpaceNetwork(layer);
  if (!resolved?.spaceNetwork?.length) {
    return {
      ok: false,
      message:
        '沒有路網輸入。請先開啟本圖層複製父層 dataJson，或在父層「座標正規化」後再開本層；若本層有 dataJson，亦請貼入或載入 spaceNetworkGridJsonData。',
    };
  }

  const flat = normalizeSpaceNetworkDataToFlatSegments(
    JSON.parse(JSON.stringify(resolved.spaceNetwork)),
  );

  const r = runAxisAlignHillClimb(flat, { maxRounds: opts.maxRounds ?? 120 });
  if (!r.ok) {
    return { ok: false, message: r.message || '無法執行' };
  }

  if (!r.improved && r.costBefore === r.costAfter) {
    return {
      ok: true,
      noop: true,
      message: '已無法在鄰格內更橫豎（或已全為橫／豎線）。',
      iterations: r.iterations,
      costBefore: r.costBefore,
      costAfter: r.costAfter,
    };
  }

  layer.spaceNetworkGridJsonData = r.segments;
  const computed = computeStationDataFromRoutes(r.segments);
  layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  layer.showStationPlacement = false;

  try {
    layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(r.segments);
  } catch (e) {
    console.error('橫豎化：匯出 processedJsonData 失敗', e);
  }

  const prevDash = layer.dashboardData && typeof layer.dashboardData === 'object' ? layer.dashboardData : {};
  layer.dashboardData = {
    ...prevDash,
    axisAlignAt: Date.now(),
    axisAlignIterations: r.iterations,
    axisAlignCostBefore: r.costBefore,
    axisAlignCostAfter: r.costAfter,
    segmentCount: r.segments.length,
  };

  writeLayoutNormalizedLayerDataOsmFromNetwork(layer, r.segments);
  syncJsonGridFromCoordDataJsonFromPipeline(layer);
  dataStore.saveLayerState(LAYER_ID, jsonGridFromCoordNormalizedPersistPayload(layer));
  refreshLineOrthogonalFromPointOrthogonalIfVisible(
    (id) => dataStore.findLayerById(id),
    (id, payload) => dataStore.saveLayerState(id, payload),
  );

  return {
    ok: true,
    message: `橫豎化完成（${r.iterations} 輪改善；斜段權重 ${r.costBefore} → ${r.costAfter}）`,
    iterations: r.iterations,
    costBefore: r.costBefore,
    costAfter: r.costAfter,
  };
}

/**
 * 同 {@link executeJsonGridCoordNormalizedPruneEmptyGridLines}：對本層路網刪除無 connect 之整欄／列並壓縮座標，
 * 重算 Section／Connect／Station、processedJson、dataOSM 並 persist（僅寫入 `point_orthogonal` 圖層）。
 *
 * @returns {{ ok: boolean, noop?: boolean, reason?: string, colCount?: number, rowCount?: number }}
 */
export function executeJsonGridFromCoordNormalizedPruneEmptyGridLines() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(LAYER_ID);
  if (!layer) {
    console.warn('executeJsonGridFromCoordNormalizedPruneEmptyGridLines：找不到圖層');
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
    console.error('刪空欄列（point_orthogonal）：匯出 processedJsonData 失敗', e);
  }

  const prevDash =
    layer.dashboardData && typeof layer.dashboardData === 'object' ? layer.dashboardData : {};
  layer.dashboardData = {
    ...prevDash,
    segmentCount: S_strokes.length,
    exportRowCount: Array.isArray(layer.processedJsonData) ? layer.processedJsonData.length : 0,
    pruneEmptyGridLinesAt: Date.now(),
    removedColCount: colCount,
    removedRowCount: rowCount,
    removedCols,
    removedRows,
    inputSegments: inputSegs.length,
    outputSegments: S_strokes.length,
  };

  writeLayoutNormalizedLayerDataOsmFromNetwork(layer, S_strokes);
  syncJsonGridFromCoordDataJsonFromPipeline(layer);
  dataStore.saveLayerState(LAYER_ID, jsonGridFromCoordNormalizedPersistPayload(layer));
  refreshLineOrthogonalFromPointOrthogonalIfVisible(
    (id) => dataStore.findLayerById(id),
    (id, payload) => dataStore.saveLayerState(id, payload),
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
