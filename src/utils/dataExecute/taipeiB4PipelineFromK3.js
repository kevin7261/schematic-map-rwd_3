/* eslint-disable no-console */

/**
 * 測試4：由 K3Tab flat segments 重算路網（可選零權重黑點合併）、mergeConnectSpans…、流量、權重 ÷100。
 * execute_A4_To_B4（寫入 taipei_b4）與手動合併（寫入 taipei_c4）共用。
 * （與 taipeiB5PipelineFromK3.js 分檔複製，測試4／測試5 不共用本體。）
 */

import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';
import {
  applyMrtTrafficVolumesToTaipeiRoutes,
  taipeiFSpaceNetworkDataToRoutesForDataTable,
} from '@/utils/randomConnectSegmentWeights.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js';
import { buildTaipeiK3JunctionDataTableRows } from '@/utils/taipeiK3JunctionDataTable.js';
import { mergeConnectSpansPlaceBlackStationsAndSplit } from '@/utils/taipeiTest3/g3ToH3PlaceBlackStationsFromA3Rows.js';
import { splitFlatH3SegmentsAtBlackVerticesOnly } from '@/utils/taipeiTest3/h3ToI3SplitAtBlackVertices.js';
import { isMapDrawnRoutesExportArray } from '@/utils/mapDrawnRoutesImport.js';
import {
  applyZeroWeightBlackMergeToFlatSegments,
  isConnectNode,
} from '@/utils/dataExecute/taipeiK3TabZeroWeightBlackMerge.js';
import { scaleRoutesWeights } from '@/utils/dataExecute/taipeiK3TabScaleWeightsDiv100.js';

function deepCloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function extractMapDrawnRowsFromJson(jsonData, fallbackRows) {
  if (Array.isArray(jsonData) && isMapDrawnRoutesExportArray(jsonData)) return jsonData;
  if (
    jsonData &&
    typeof jsonData === 'object' &&
    Array.isArray(jsonData.mapDrawnRoutes) &&
    isMapDrawnRoutesExportArray(jsonData.mapDrawnRoutes)
  ) {
    return jsonData.mapDrawnRoutes;
  }
  if (Array.isArray(fallbackRows) && isMapDrawnRoutesExportArray(fallbackRows)) return fallbackRows;
  return null;
}

/**
 * @param {*} dataStore Pinia dataStore
 * @param {object} a4 taipei_a4 圖層
 * @param {object} targetLayer 輸出圖層（taipei_b4 或 taipei_c4）
 * @param {Array} k3Routes 來源 K3Tab 路網（會深拷貝後正規化）
 * @param {{ zeroWeightMerge?: boolean, sourceLabel?: string }} options
 */
export async function runTaipeiB4PipelineFromK3Routes(
  dataStore,
  a4,
  targetLayer,
  k3Routes,
  options = {}
) {
  const zeroWeightMerge = !!options.zeroWeightMerge;
  const mergeMaxWeightDiff = Number.isFinite(Number(options.mergeMaxWeightDiff))
    ? Number(options.mergeMaxWeightDiff)
    : 10;
  const initialSegmentCount = Array.isArray(k3Routes) ? k3Routes.length : 0;

  const segs = normalizeSpaceNetworkDataToFlatSegments(deepCloneJson(k3Routes));

  for (const seg of segs) {
    const nodes = seg.nodes || [];
    const nNodes = nodes.length;
    for (let j = 1; j < nNodes - 1; j++) {
      if (!isConnectNode(seg, j) && nodes[j] && typeof nodes[j] === 'object') {
        nodes[j].display = true;
      }
    }
    if (nNodes >= 1) {
      const first = nodes[0];
      if (first && typeof first === 'object' && !isConnectNode(seg, 0)) {
        first.display = true;
      }
      const last = nodes[nNodes - 1];
      if (last && typeof last === 'object' && !isConnectNode(seg, nNodes - 1)) {
        last.display = true;
      }
    }
  }

  let removedBlackDots = [];
  if (zeroWeightMerge) {
    removedBlackDots = applyZeroWeightBlackMergeToFlatSegments(segs, {
      maxWeightDiff: mergeMaxWeightDiff,
    });
  }

  let finalSegs;
  let blackPlacementStats = {
    placedBlackSectionCount: 0,
    skippedSectionCount: 0,
    routeMismatches: [],
  };

  // 手動合併（b4→c4）：
  //   來源 K3Tab 的黑點位置與 per-edge 權重皆已在 a4→b4 時定好；
  //   applyZeroWeightBlackMergeToFlatSegments 已就地把合併段 station_weights 設為 max(參與者)，
  //   未合併段 station_weights 保持原值。直接以 segs 作為 finalSegs，
  //   不再經 mergeConnectSpans…（重均分會讓非合併段幾何微幅位移，導致其權重被誤算）。
  // a4→b4：仍跑完整 mergeConnectSpans…＋CSV＋÷100 流程。
  if (zeroWeightMerge) {
    finalSegs = segs;
  } else {
    const mapDrawnRowsRaw = extractMapDrawnRowsFromJson(a4.jsonData, a4.processedJsonData);
    const mapDrawnRows = mapDrawnRowsRaw ? deepCloneJson(mapDrawnRowsRaw) : null;
    if (mapDrawnRows?.length) {
      const redistributed = mergeConnectSpansPlaceBlackStationsAndSplit(segs, mapDrawnRows);
      finalSegs = redistributed.splitRoutesData;
      blackPlacementStats = {
        placedBlackSectionCount: redistributed.placedBlackSectionCount,
        skippedSectionCount: redistributed.skippedSectionCount,
        routeMismatches: redistributed.routeMismatches,
      };
    } else {
      console.warn(
        `${options.sourceLabel || 'taipeiB4PipelineFromK3'}：缺少 mapDrawnRoutes 匯出列，改用原本黑點切段流程`
      );
      finalSegs = splitFlatH3SegmentsAtBlackVerticesOnly(segs);
    }
  }

  if (!Array.isArray(finalSegs) || finalSegs.length === 0) {
    finalSegs = segs;
  }

  const trafficData = a4.trafficData;
  let computed = computeStationDataFromRoutes(finalSegs);

  // zeroWeightMerge：
  //   - 合併段 station_weights 已是 max(參與者)（zero-weight merge 就地設定）
  //   - 未合併段 station_weights 原封不動
  //   不再跑 CSV 重寫（會把未合併段也改掉）或 ÷100（會重複縮放）。
  // a4→b4：維持 CSV 覆寫 + ÷100 原邏輯。
  let scaledSegs;
  let trafficStats = { matched: 0, unmatched: 0 };
  if (zeroWeightMerge) {
    scaledSegs = finalSegs;
  } else {
    const routesForTraffic = taipeiFSpaceNetworkDataToRoutesForDataTable(finalSegs);
    if (trafficData?.rows?.length) {
      trafficStats = applyMrtTrafficVolumesToTaipeiRoutes(routesForTraffic, trafficData, {
        connectData: computed.connectData,
        stationData: computed.stationData,
        sectionData: computed.sectionData,
        zeroUnmatchedTraffic: true,
      });
    }
    scaledSegs = scaleRoutesWeights(finalSegs);
  }

  computed = computeStationDataFromRoutes(scaledSegs);

  let processedJsonData;
  try {
    processedJsonData = flatSegmentsToGeojsonStyleExportRows(scaledSegs);
  } catch (e) {
    console.error(
      `${options.sourceLabel || 'taipeiB4PipelineFromK3'}：processedJsonData 轉換失敗`,
      e
    );
    processedJsonData = [];
  }

  const c = deepCloneJson;

  targetLayer.jsonData = c(a4.jsonData);
  targetLayer.trafficData = c(a4.trafficData);

  targetLayer.spaceNetworkGridJsonDataK3Tab = c(scaledSegs);
  targetLayer.spaceNetworkGridJsonDataK3Tab_SectionData = c(computed.sectionData);
  targetLayer.spaceNetworkGridJsonDataK3Tab_ConnectData = c(computed.connectData);
  targetLayer.spaceNetworkGridJsonDataK3Tab_StationData = c(computed.stationData);

  targetLayer.spaceNetworkGridJsonData = c(scaledSegs);
  targetLayer.spaceNetworkGridJsonData_SectionData = c(computed.sectionData);
  targetLayer.spaceNetworkGridJsonData_ConnectData = c(computed.connectData);
  targetLayer.spaceNetworkGridJsonData_StationData = c(computed.stationData);

  targetLayer.processedJsonDataK3Tab = processedJsonData != null ? c(processedJsonData) : null;
  targetLayer.processedJsonData = c(processedJsonData);

  // dataTableData：在寫入 K3Tab 之後，以同一快照重建（含流量 fallback 後之 station_weights），
  // 與 layout-network-grid／JSON 分頁之路網權重一致。
  targetLayer.dataTableData = buildTaipeiK3JunctionDataTableRows(
    deepCloneJson(targetLayer.spaceNetworkGridJsonDataK3Tab)
  );

  targetLayer.layoutGridJsonData = c(scaledSegs);
  targetLayer.layoutGridJsonData_Test = c(scaledSegs);
  targetLayer.layoutGridJsonData_Test2 = c(scaledSegs);
  targetLayer.layoutGridJsonData_Test3 = c(scaledSegs);
  targetLayer.layoutGridJsonData_Test4 = c(scaledSegs);

  const baseInfo = c(a4.layerInfoData);
  targetLayer.layerInfoData =
    baseInfo && typeof baseInfo === 'object'
      ? {
          ...baseInfo,
          copiedFromLayerId: 'taipei_a4',
          weightScaledDivisor: 100,
          weightScaleRule: 'floor_divide_min_1',
          zeroWeightMergedBlackDotCount: removedBlackDots.length,
          placedBlackSectionCount: blackPlacementStats.placedBlackSectionCount,
          skippedBlackSectionCount: blackPlacementStats.skippedSectionCount,
          routeMismatchCount: blackPlacementStats.routeMismatches.length,
          trafficEdgesMatched: trafficStats.matched,
          trafficEdgesUnmatched: trafficStats.unmatched,
        }
      : {
          copiedFromLayerId: 'taipei_a4',
          weightScaledDivisor: 100,
          weightScaleRule: 'floor_divide_min_1',
          zeroWeightMergedBlackDotCount: removedBlackDots.length,
          placedBlackSectionCount: blackPlacementStats.placedBlackSectionCount,
          skippedBlackSectionCount: blackPlacementStats.skippedSectionCount,
          routeMismatchCount: blackPlacementStats.routeMismatches.length,
          trafficEdgesMatched: trafficStats.matched,
          trafficEdgesUnmatched: trafficStats.unmatched,
        };

  const baseDash = c(a4.dashboardData);
  targetLayer.dashboardData =
    baseDash && typeof baseDash === 'object'
      ? {
          ...baseDash,
          segmentCount: scaledSegs.length,
          weightScaledDivisor: 100,
          zeroWeightMergedBlackDotCount: removedBlackDots.length,
          placedBlackSectionCount: blackPlacementStats.placedBlackSectionCount,
          skippedBlackSectionCount: blackPlacementStats.skippedSectionCount,
          routeMismatchCount: blackPlacementStats.routeMismatches.length,
          trafficMatched: trafficStats.matched,
          trafficUnmatched: trafficStats.unmatched,
        }
      : {
          segmentCount: scaledSegs.length,
          weightScaledDivisor: 100,
          zeroWeightMergedBlackDotCount: removedBlackDots.length,
          placedBlackSectionCount: blackPlacementStats.placedBlackSectionCount,
          skippedBlackSectionCount: blackPlacementStats.skippedSectionCount,
          routeMismatchCount: blackPlacementStats.routeMismatches.length,
          trafficMatched: trafficStats.matched,
          trafficUnmatched: trafficStats.unmatched,
        };

  targetLayer.drawJsonData = c(a4.drawJsonData);
  targetLayer.squareGridCellsTaipeiTest3 = a4.squareGridCellsTaipeiTest3 === true;
  targetLayer.showStationPlacement = a4.showStationPlacement !== false;

  targetLayer.removedZeroWeightBlackDots = zeroWeightMerge ? removedBlackDots : [];

  targetLayer.isLoaded = true;

  const outLayerId = String(targetLayer.layerId || '');
  if (!targetLayer.visible) {
    targetLayer.visible = true;
    dataStore.saveLayerState(outLayerId, { visible: true });
  }

  dataStore.saveLayerState(outLayerId, {
    isLoaded: targetLayer.isLoaded,
    jsonData: targetLayer.jsonData,
    trafficData: targetLayer.trafficData,
    spaceNetworkGridJsonDataK3Tab: targetLayer.spaceNetworkGridJsonDataK3Tab,
    spaceNetworkGridJsonDataK3Tab_SectionData:
      targetLayer.spaceNetworkGridJsonDataK3Tab_SectionData,
    spaceNetworkGridJsonDataK3Tab_ConnectData:
      targetLayer.spaceNetworkGridJsonDataK3Tab_ConnectData,
    spaceNetworkGridJsonDataK3Tab_StationData:
      targetLayer.spaceNetworkGridJsonDataK3Tab_StationData,
    spaceNetworkGridJsonData: targetLayer.spaceNetworkGridJsonData,
    spaceNetworkGridJsonData_SectionData: targetLayer.spaceNetworkGridJsonData_SectionData,
    spaceNetworkGridJsonData_ConnectData: targetLayer.spaceNetworkGridJsonData_ConnectData,
    spaceNetworkGridJsonData_StationData: targetLayer.spaceNetworkGridJsonData_StationData,
    processedJsonDataK3Tab: targetLayer.processedJsonDataK3Tab,
    processedJsonData: targetLayer.processedJsonData,
    dataTableData: targetLayer.dataTableData,
    layerInfoData: targetLayer.layerInfoData,
    dashboardData: targetLayer.dashboardData,
    drawJsonData: targetLayer.drawJsonData,
    layoutGridJsonData: targetLayer.layoutGridJsonData,
    layoutGridJsonData_Test: targetLayer.layoutGridJsonData_Test,
    layoutGridJsonData_Test2: targetLayer.layoutGridJsonData_Test2,
    layoutGridJsonData_Test3: targetLayer.layoutGridJsonData_Test3,
    layoutGridJsonData_Test4: targetLayer.layoutGridJsonData_Test4,
    squareGridCellsTaipeiTest3: targetLayer.squareGridCellsTaipeiTest3,
    showStationPlacement: targetLayer.showStationPlacement,
    removedZeroWeightBlackDots: targetLayer.removedZeroWeightBlackDots,
  });

  return {
    removedBlackDots,
    scaledSegs,
    initialSegmentCount,
    blackPlacementStats,
    trafficStats,
  };
}
