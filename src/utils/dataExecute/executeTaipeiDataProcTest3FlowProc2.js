/**
 * 資料處理_2 管線（taipei_*_dp_2，與 executeTaipeiDataProcTest3Flow 分檔複製）：執行步驟與 executeTaipeiTest3Flow 逐行對應，但僅依賴 @/utils/taipeiDataProcTest3（與測試_3 之 taipeiTest3 目錄分離）。
 * g3→h3 匯出列來源為 taipei_b3_dp_2，非 taipei_a3。
 */

/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';
import { loadCsvTrafficForLayer } from '@/utils/dataProcessor.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiDataProcTest3/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildTaipeiC3StyleLayerFieldsFromStraightenedNetwork } from '@/utils/taipeiDataProcTest3/buildTaipeiC3StyleLayerFieldsFromStraightenedNetwork.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiDataProcTest3/flatSegmentsToGeojsonStyleExportRows.js';
import { straightenSpaceNetworkAfterStrippingBlackStations } from '@/utils/dataExecute/straightenRoutesCurrentLayer.js';
import { buildTaipeiD3FromC3Network } from '@/utils/taipeiDataProcTest3/c3ToD3CoordNormalize.js';
import { applyHVToE3SpaceNetwork } from '@/utils/taipeiDataProcTest3/applyHVToE3Network.js';
import { applyNShapeReduceAllToSpaceNetworkData } from '@/utils/taipeiDataProcTest3/applyNShapeReduceToSpaceNetwork.js';
import { applyFlipLReduceF3ToG3Network } from '@/utils/taipeiDataProcTest3/f3ToG3FlipLReduce.js';
import { pruneGridLinesWithoutConnectVertices } from '@/utils/taipeiDataProcTest3/f3ToG3PruneEmptyGridLines.js';
import { applyG3ZShapeRedInteriorAxisSnapToNetwork } from '@/utils/taipeiDataProcTest3/g3ZShapeRedInteriorAxisSnapToNetwork.js';
import {
  assertA3RowsForG3ToH3,
  mergeConnectSpansPlaceBlackStationsAndSplit,
} from '@/utils/taipeiDataProcTest3/g3ToH3PlaceBlackStationsFromA3Rows.js';
import {
  applyMrtTrafficVolumesToTaipeiRoutes,
  buildTaipeiFDataTableRowsLikeSplitOutput,
  taipeiFSpaceNetworkDataToRoutesForDataTable,
} from '@/utils/randomConnectSegmentWeights.js';
import { splitFlatH3SegmentsAtBlackVerticesOnly } from '@/utils/taipeiDataProcTest3/h3ToI3SplitAtBlackVertices.js';
import { applyTaipeiL3BlackDotReductionWhileMinDiffLessThan } from '@/utils/taipeiL3BlackDotReductionStep.js';

/** a3：GeoJSON → 路段 → 寫入 b3（async 與其他 execute 呼叫一致） */
export async function executeTaipeiDataProcTest3_A3_To_B3_Proc2() {
  const dataStore = useDataStore();
  const a3 = dataStore.findLayerById('taipei_a3');
  const b3 = dataStore.findLayerById('taipei_b3_dp_2');
  if (!b3) {
    console.warn('executeTaipeiDataProcTest3_A3_To_B3_Proc2：找不到 taipei_b3');
    return;
  }

  const geojsonForExport = a3?.geojsonData;
  if (!geojsonForExport?.features?.length) {
    console.warn('無可用 GeoJSON（請載入 taipei_a3 之 geojsonData）');
    return;
  }

  const derived = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojsonForExport);
  b3.processedJsonData = derived.processedJsonData;
  b3.spaceNetworkGridJsonData = derived.spaceNetworkGridJsonData;
  b3.spaceNetworkGridJsonData_SectionData = derived.spaceNetworkGridJsonData_SectionData;
  b3.spaceNetworkGridJsonData_ConnectData = derived.spaceNetworkGridJsonData_ConnectData;
  b3.spaceNetworkGridJsonData_StationData = derived.spaceNetworkGridJsonData_StationData;
  b3.showStationPlacement = derived.showStationPlacement;
  b3.dashboardData = derived.dashboardData;
  b3.isLoaded = true;
  if (!b3.visible) {
    b3.visible = true;
    dataStore.saveLayerState('taipei_b3_dp_2', { visible: true });
  }
}

/** b3：交叉點直線化 → 寫入 c3 */
export function executeTaipeiDataProcTest3_B3_To_C3_Proc2() {
  const dataStore = useDataStore();
  const b3 = dataStore.findLayerById('taipei_b3_dp_2');
  const c3 = dataStore.findLayerById('taipei_c3_dp_2');
  if (!b3?.spaceNetworkGridJsonData?.length || !c3) {
    console.warn('executeTaipeiDataProcTest3_B3_To_C3_Proc2：缺少 b3 路網或 c3 圖層');
    return;
  }

  const result = straightenSpaceNetworkAfterStrippingBlackStations(b3.spaceNetworkGridJsonData);
  if (!result) {
    console.warn('交叉點直線化失敗（無資料或直線化錯誤）');
    return;
  }
  const derived = buildTaipeiC3StyleLayerFieldsFromStraightenedNetwork(result);
  c3.processedJsonData = derived.processedJsonData;
  c3.spaceNetworkGridJsonData = derived.spaceNetworkGridJsonData;
  c3.spaceNetworkGridJsonData_SectionData = derived.spaceNetworkGridJsonData_SectionData;
  c3.spaceNetworkGridJsonData_ConnectData = derived.spaceNetworkGridJsonData_ConnectData;
  c3.spaceNetworkGridJsonData_StationData = derived.spaceNetworkGridJsonData_StationData;
  c3.showStationPlacement = derived.showStationPlacement;
  c3.dashboardData = derived.dashboardData;
  c3.isLoaded = true;
  if (!c3.visible) {
    c3.visible = true;
    dataStore.saveLayerState('taipei_c3_dp_2', { visible: true });
  }
}

/** c3：座標正規化 → 寫入 d3 */
export function executeTaipeiDataProcTest3_C3_To_D3_Proc2() {
  const dataStore = useDataStore();
  const c3 = dataStore.findLayerById('taipei_c3_dp_2');
  const d3Layer = dataStore.findLayerById('taipei_d3_dp_2');
  if (!c3?.spaceNetworkGridJsonData?.length || !d3Layer) {
    console.warn('executeTaipeiDataProcTest3_C3_To_D3_Proc2：缺少 c3 路網或 d3 圖層');
    return;
  }

  const out = buildTaipeiD3FromC3Network(c3.spaceNetworkGridJsonData);
  d3Layer.spaceNetworkGridJsonData = out.flatSegs;
  d3Layer.spaceNetworkGridJsonData_SectionData = out.sectionData;
  d3Layer.spaceNetworkGridJsonData_ConnectData = out.connectData;
  d3Layer.spaceNetworkGridJsonData_StationData = out.stationData;
  d3Layer.showStationPlacement = false;
  d3Layer.isLoaded = true;
  try {
    d3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(out.flatSegs);
  } catch (e) {
    console.error('d3 匯出 processedJsonData 失敗', e);
    d3Layer.processedJsonData = out.rows;
  }
  d3Layer.dashboardData = {
    segmentCount: out.flatSegs.length,
    exportRowCount: Array.isArray(d3Layer.processedJsonData) ? d3Layer.processedJsonData.length : 0,
    sourceLayerId: 'taipei_c3_dp_2',
    coordNormalize: true,
    ...out.meta,
  };
  if (!d3Layer.visible) {
    d3Layer.visible = true;
    dataStore.saveLayerState('taipei_d3_dp_2', { visible: true });
  }
}

/** d3：刪除無紅／藍（connect）之整欄／整列並壓縮座標 → 寫入 e3 */
export function executeTaipeiDataProcTest3_D3_To_E3_Proc2() {
  const dataStore = useDataStore();
  const d3Layer = dataStore.findLayerById('taipei_d3_dp_2');
  const e3Layer = dataStore.findLayerById('taipei_e3_dp_2');
  if (!d3Layer?.spaceNetworkGridJsonData?.length || !e3Layer) {
    console.warn('executeTaipeiDataProcTest3_D3_To_E3_Proc2：缺少 d3 路網或 e3 圖層');
    return;
  }

  const inputSegs = JSON.parse(JSON.stringify(d3Layer.spaceNetworkGridJsonData));
  const {
    segments: S_strokes,
    removedCols,
    removedRows,
    colCount,
    rowCount,
  } = pruneGridLinesWithoutConnectVertices(inputSegs);

  const computed = computeStationDataFromRoutes(S_strokes);
  e3Layer.spaceNetworkGridJsonData = S_strokes;
  e3Layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  e3Layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  e3Layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  e3Layer.showStationPlacement = false;
  e3Layer.isLoaded = true;
  try {
    e3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(
      e3Layer.spaceNetworkGridJsonData
    );
  } catch (e) {
    console.error('e3 匯出 processedJsonData 失敗', e);
    e3Layer.processedJsonData = [];
  }
  e3Layer.dashboardData = {
    segmentCount: S_strokes.length,
    sourceLayerId: 'taipei_d3_dp_2',
    removedColCount: colCount,
    removedRowCount: rowCount,
    removedCols,
    removedRows,
    inputSegments: inputSegs.length,
    outputSegments: S_strokes.length,
  };
  if (!e3Layer.visible) {
    e3Layer.visible = true;
    dataStore.saveLayerState('taipei_e3_dp_2', { visible: true });
  }
}

/** e3：對角線轉水平垂直（applyHVToE3Network）→ 寫入 f3 */
export function executeTaipeiDataProcTest3_E3_To_F3_Proc2() {
  const dataStore = useDataStore();
  const e3Layer = dataStore.findLayerById('taipei_e3_dp_2');
  const f3Layer = dataStore.findLayerById('taipei_f3_dp_2');
  if (!e3Layer?.spaceNetworkGridJsonData?.length || !f3Layer) {
    console.warn('executeTaipeiDataProcTest3_E3_To_F3_Proc2：缺少 e3 路網或 f3 圖層');
    return;
  }

  const S_strokes = JSON.parse(JSON.stringify(e3Layer.spaceNetworkGridJsonData));
  const { converted, failed } = applyHVToE3SpaceNetwork(S_strokes, { coordDecimals: 1 });

  const computed = computeStationDataFromRoutes(S_strokes);
  f3Layer.spaceNetworkGridJsonData = S_strokes;
  f3Layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  f3Layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  f3Layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  f3Layer.showStationPlacement = false;
  f3Layer.isLoaded = true;
  try {
    f3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(
      f3Layer.spaceNetworkGridJsonData
    );
  } catch (e) {
    console.error('f3 匯出 processedJsonData 失敗', e);
    f3Layer.processedJsonData = [];
  }
  f3Layer.dashboardData = {
    segmentCount: S_strokes.length,
    sourceLayerId: 'taipei_e3_dp_2',
    hvConvertedCount: converted,
    hvFailedDiagonalEdges: failed,
    inputSegments: e3Layer.spaceNetworkGridJsonData.length,
    outputSegments: S_strokes.length,
  };
  if (!f3Layer.visible) {
    f3Layer.visible = true;
    dataStore.saveLayerState('taipei_f3_dp_2', { visible: true });
  }
}

/**
 * f3→g3（單一圖層按鈕）：先 ㄈ縮減為 L（紅／藍 connect 隨折線一併變換），再 Flip L 減轉折 → 寫入 g3
 */
export function executeTaipeiDataProcTest3_F3_To_G3_Proc2() {
  const dataStore = useDataStore();
  const f3Layer = dataStore.findLayerById('taipei_f3_dp_2');
  const g3Layer = dataStore.findLayerById('taipei_g3_dp_2');
  if (!f3Layer?.spaceNetworkGridJsonData?.length || !g3Layer) {
    console.warn('executeTaipeiDataProcTest3_F3_To_G3_Proc2：缺少 f3 路網或 g3 圖層');
    return;
  }

  const S_strokes = JSON.parse(JSON.stringify(f3Layer.spaceNetworkGridJsonData));
  const {
    routesData: afterN,
    nShapePassesRun,
    nShapeReducedAny,
  } = applyNShapeReduceAllToSpaceNetworkData(S_strokes);

  const { routesData, flipAcceptedCount, passes } = applyFlipLReduceF3ToG3Network(afterN, {
    coordDecimals: 1,
  });

  const computed = computeStationDataFromRoutes(routesData);
  g3Layer.spaceNetworkGridJsonData = routesData;
  g3Layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  g3Layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  g3Layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  g3Layer.showStationPlacement = false;
  g3Layer.isLoaded = true;
  try {
    g3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(
      g3Layer.spaceNetworkGridJsonData
    );
  } catch (e) {
    console.error('g3 匯出 processedJsonData 失敗', e);
    g3Layer.processedJsonData = [];
  }
  g3Layer.dashboardData = {
    segmentCount: routesData.length,
    sourceLayerId: 'taipei_f3_dp_2',
    nShapePassesRun,
    nShapeReducedAny,
    flipAcceptedCount,
    flipPasses: passes,
    inputSegments: f3Layer.spaceNetworkGridJsonData.length,
    outputSegments: routesData.length,
  };
  if (!g3Layer.visible) {
    g3Layer.visible = true;
    dataStore.saveLayerState('taipei_g3_dp_2', { visible: true });
  }

  // NEW：不改前述流程。Z 形紅色內轉折線按整數→0.5→…（保拓撲、轉折不重疊）平移軸座標
  const snapResult = applyG3ZShapeRedInteriorAxisSnapToNetwork(routesData);
  const movedAdjustments = snapResult.adjustments.filter((a) => a.status === 'moved');
  if (movedAdjustments.length > 0) {
    const computedAfter = computeStationDataFromRoutes(routesData);
    g3Layer.spaceNetworkGridJsonData = routesData;
    g3Layer.spaceNetworkGridJsonData_SectionData = computedAfter.sectionData;
    g3Layer.spaceNetworkGridJsonData_ConnectData = computedAfter.connectData;
    g3Layer.spaceNetworkGridJsonData_StationData = computedAfter.stationData;
    try {
      g3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(
        g3Layer.spaceNetworkGridJsonData
      );
    } catch (e) {
      console.error('g3 匯出 processedJsonData（軸座標吸附後）失敗', e);
    }
  }
  g3Layer.dashboardData = {
    ...g3Layer.dashboardData,
    zShapeRedInteriorAxisSnap: {
      redInteriorCount: snapResult.redInteriorCount,
      movedCount: movedAdjustments.length,
      noCandidateCount: snapResult.adjustments.filter((a) => a.status === 'no-candidate').length,
      adjustments: snapResult.adjustments,
    },
  };
}

/** g3：將 taipei_b3_dp_2 路段匯出列之中段站（黑點）依路線／路段序對應到 g3 折線，弧長均分 → 寫入 h3 */
export function executeTaipeiDataProcTest3_G3_To_H3_Proc2() {
  const dataStore = useDataStore();
  const b3DpRowSource = dataStore.findLayerById('taipei_b3_dp_2');
  const g3Layer = dataStore.findLayerById('taipei_g3_dp_2');
  const h3Layer = dataStore.findLayerById('taipei_h3_dp_2');
  if (!g3Layer?.spaceNetworkGridJsonData?.length || !h3Layer) {
    console.warn('executeTaipeiDataProcTest3_G3_To_H3_Proc2：缺少 g3 路網或 taipei_h3 圖層');
    return;
  }

  const check = assertA3RowsForG3ToH3(b3DpRowSource);
  if (!check.ok) {
    console.warn(`executeTaipeiDataProcTest3_G3_To_H3_Proc2：${check.message}`);
    return;
  }

  const inputSegs = JSON.parse(JSON.stringify(g3Layer.spaceNetworkGridJsonData));
  const { redistributedRoutesData, placedBlackSectionCount, skippedSectionCount, routeMismatches } =
    mergeConnectSpansPlaceBlackStationsAndSplit(inputSegs, check.rows);

  if (routeMismatches.length) {
    console.warn(
      '[g3→h3] 部分路線 a3 匯出列數與 g3 扁平折線數不同（中段站改依起迄站號／座標配對，非陣列索引）：',
      routeMismatches
    );
  }

  const computed = computeStationDataFromRoutes(redistributedRoutesData);
  h3Layer.spaceNetworkGridJsonData = redistributedRoutesData;
  h3Layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  h3Layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  h3Layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  h3Layer.showStationPlacement = true;
  h3Layer.isLoaded = true;
  try {
    h3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(
      h3Layer.spaceNetworkGridJsonData
    );
  } catch (e) {
    console.error('h3 匯出 processedJsonData 失敗', e);
    h3Layer.processedJsonData = [];
  }
  h3Layer.dashboardData = {
    segmentCount: redistributedRoutesData.length,
    sourceLayerId: 'taipei_g3_dp_2',
    a3SourceLayerId: 'taipei_b3_dp_2',
    placedBlackSectionCount,
    skippedSectionCount,
    routeMismatchCount: routeMismatches.length,
  };
  if (!h3Layer.visible) {
    h3Layer.visible = true;
    dataStore.saveLayerState('taipei_h3_dp_2', { visible: true });
  }
}

/** h3：僅在既有頂點依黑點切段（不改座標、不重算紅黑站別、無線上權重數字）→ 寫入 taipei_i3 */
export function executeTaipeiDataProcTest3_H3_To_I3_Proc2() {
  const dataStore = useDataStore();
  const h3Layer = dataStore.findLayerById('taipei_h3_dp_2');
  const i3Layer = dataStore.findLayerById('taipei_i3_dp_2');
  if (!h3Layer?.spaceNetworkGridJsonData?.length || !i3Layer) {
    console.warn('executeTaipeiDataProcTest3_H3_To_I3_Proc2：缺少 h3 路網或 taipei_i3 圖層');
    return;
  }

  const priorCount = h3Layer.spaceNetworkGridJsonData.length;
  const flatSegs = JSON.parse(JSON.stringify(h3Layer.spaceNetworkGridJsonData));
  const flatOut = splitFlatH3SegmentsAtBlackVerticesOnly(flatSegs);

  const connectData = h3Layer.spaceNetworkGridJsonData_ConnectData;
  const stationData = h3Layer.spaceNetworkGridJsonData_StationData;
  const sectionData = h3Layer.spaceNetworkGridJsonData_SectionData;
  const routesForTable = taipeiFSpaceNetworkDataToRoutesForDataTable(flatOut);
  const dataTableData = buildTaipeiFDataTableRowsLikeSplitOutput(routesForTable, {
    connectData,
    stationData,
    sectionData,
  });

  i3Layer.spaceNetworkGridJsonData = flatOut;
  i3Layer.spaceNetworkGridJsonData_SectionData = JSON.parse(JSON.stringify(sectionData ?? null));
  i3Layer.spaceNetworkGridJsonData_ConnectData = JSON.parse(JSON.stringify(connectData ?? null));
  i3Layer.spaceNetworkGridJsonData_StationData = JSON.parse(JSON.stringify(stationData ?? null));
  i3Layer.showStationPlacement = h3Layer.showStationPlacement !== false;
  i3Layer.trafficData = null;
  i3Layer.dataTableData = dataTableData;
  i3Layer.layerInfoData = {
    splitSourceLayerId: 'taipei_h3_dp_2',
    segmentsBeforeSplit: priorCount,
    segmentsAfterSplit: flatOut.length,
  };
  i3Layer.isLoaded = true;
  try {
    i3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(
      i3Layer.spaceNetworkGridJsonData
    );
  } catch (e) {
    console.error('i3 匯出 processedJsonData 失敗', e);
    i3Layer.processedJsonData = [];
  }
  i3Layer.dashboardData = {
    segmentCount: flatOut.length,
    sourceLayerId: 'taipei_h3_dp_2',
    segmentsBeforeSplit: priorCount,
  };
  if (!i3Layer.visible) {
    i3Layer.visible = true;
    dataStore.saveLayerState('taipei_i3_dp_2', { visible: true });
  }
}

/** i3：讀 mrt_link_volume CSV → 對應切段 station_weights → 寫入 taipei_j3（含 dataTableData） */
export async function executeTaipeiDataProcTest3_I3_To_J3_Proc2() {
  const dataStore = useDataStore();
  const i3Layer = dataStore.findLayerById('taipei_i3_dp_2');
  const j3Layer = dataStore.findLayerById('taipei_j3_dp_2');
  if (!i3Layer?.spaceNetworkGridJsonData?.length || !j3Layer) {
    console.warn('executeTaipeiDataProcTest3_I3_To_J3_Proc2：缺少 i3 路網或 taipei_j3 圖層');
    return;
  }

  const csvFileName = j3Layer.csvFileName_traffic ?? 'taipei_city/mrt_link_volume_undirected.csv';
  const { trafficData } = await loadCsvTrafficForLayer({
    csvFileName_traffic: csvFileName,
  });
  if (!trafficData?.rows?.length) {
    console.warn('executeTaipeiDataProcTest3_I3_To_J3_Proc2：CSV 無資料或讀取失敗');
  }

  const flatSegs = JSON.parse(JSON.stringify(i3Layer.spaceNetworkGridJsonData));
  const routesForTraffic = taipeiFSpaceNetworkDataToRoutesForDataTable(flatSegs);

  const connectData = i3Layer.spaceNetworkGridJsonData_ConnectData;
  const stationData = i3Layer.spaceNetworkGridJsonData_StationData;
  const sectionData = i3Layer.spaceNetworkGridJsonData_SectionData;

  const trafficStats = applyMrtTrafficVolumesToTaipeiRoutes(routesForTraffic, trafficData, {
    connectData,
    stationData,
    sectionData,
    /** 預設權重視為 0：與 CSV 無法對應之切段寫入 weight 0（與 taipei_i2 之 zeroUnmatchedTraffic 一致） */
    zeroUnmatchedTraffic: true,
  });

  const dataTableData = buildTaipeiFDataTableRowsLikeSplitOutput(routesForTraffic, {
    connectData,
    stationData,
    sectionData,
  });

  j3Layer.spaceNetworkGridJsonData = flatSegs;
  j3Layer.spaceNetworkGridJsonData_SectionData = JSON.parse(JSON.stringify(sectionData ?? null));
  j3Layer.spaceNetworkGridJsonData_ConnectData = JSON.parse(JSON.stringify(connectData ?? null));
  j3Layer.spaceNetworkGridJsonData_StationData = JSON.parse(JSON.stringify(stationData ?? null));
  j3Layer.showStationPlacement = i3Layer.showStationPlacement !== false;
  j3Layer.trafficData = trafficData;
  j3Layer.dataTableData = dataTableData;
  j3Layer.layerInfoData = {
    trafficCsvRows: trafficData?.rowCount ?? 0,
    trafficEdgesMatched: trafficStats.matched,
    trafficEdgesUnmatched: trafficStats.unmatched,
  };
  j3Layer.isLoaded = true;
  try {
    j3Layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(
      j3Layer.spaceNetworkGridJsonData
    );
  } catch (e) {
    console.error('j3 匯出 processedJsonData 失敗', e);
    j3Layer.processedJsonData = [];
  }
  j3Layer.dashboardData = {
    segmentCount: flatSegs.length,
    sourceLayerId: 'taipei_i3_dp_2',
    trafficCsvFile: csvFileName,
    trafficMatched: trafficStats.matched,
    trafficUnmatched: trafficStats.unmatched,
  };
  if (!j3Layer.visible) {
    j3Layer.visible = true;
    dataStore.saveLayerState('taipei_j3_dp_2', { visible: true });
  }
}

function deepCloneState(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/**
 * k3→l3：將 taipei_k3 目前已載入之路網（含 K3 分頁專用欄位）與儀表板等深拷貝至 taipei_l3（l3 另有獨立 jsonLoader／Vue 分頁，此函式僅負責複製）。
 */
export function executeTaipeiDataProcTest3_K3_To_L3_Proc2() {
  const dataStore = useDataStore();
  const k3Layer = dataStore.findLayerById('taipei_k3_dp_2');
  const l3Layer = dataStore.findLayerById('taipei_l3_dp_2');
  if (!k3Layer || !l3Layer) {
    console.warn('executeTaipeiDataProcTest3_K3_To_L3_Proc2：缺少 taipei_k3 或 taipei_l3 圖層');
    return;
  }
  const k3Routes = k3Layer.spaceNetworkGridJsonDataK3Tab;
  if (!Array.isArray(k3Routes) || k3Routes.length === 0) {
    console.warn('executeTaipeiDataProcTest3_K3_To_L3_Proc2：taipei_k3 尚無 K3 分頁路網（請先載入 k3 之 JSON）');
    return;
  }

  const c = deepCloneState;

  l3Layer.jsonData = c(k3Layer.jsonData);
  l3Layer.spaceNetworkGridJsonData = c(k3Layer.spaceNetworkGridJsonData);
  l3Layer.spaceNetworkGridJsonData_SectionData = c(k3Layer.spaceNetworkGridJsonData_SectionData);
  l3Layer.spaceNetworkGridJsonData_ConnectData = c(k3Layer.spaceNetworkGridJsonData_ConnectData);
  l3Layer.spaceNetworkGridJsonData_StationData = c(k3Layer.spaceNetworkGridJsonData_StationData);
  l3Layer.spaceNetworkGridJsonDataL3Tab = c(k3Layer.spaceNetworkGridJsonDataK3Tab);
  l3Layer.spaceNetworkGridJsonDataL3Tab_SectionData = c(
    k3Layer.spaceNetworkGridJsonDataK3Tab_SectionData
  );
  l3Layer.spaceNetworkGridJsonDataL3Tab_ConnectData = c(
    k3Layer.spaceNetworkGridJsonDataK3Tab_ConnectData
  );
  l3Layer.spaceNetworkGridJsonDataL3Tab_StationData = c(
    k3Layer.spaceNetworkGridJsonDataK3Tab_StationData
  );
  l3Layer.processedJsonData = c(k3Layer.processedJsonData);
  l3Layer.processedJsonDataL3Tab = c(k3Layer.processedJsonDataK3Tab);
  l3Layer.layoutGridJsonData = c(k3Layer.layoutGridJsonData);
  l3Layer.layoutGridJsonData_Test = c(k3Layer.layoutGridJsonData_Test);
  l3Layer.layoutGridJsonData_Test2 = c(k3Layer.layoutGridJsonData_Test2);
  l3Layer.layoutGridJsonData_Test3 = c(k3Layer.layoutGridJsonData_Test3);
  l3Layer.layoutGridJsonData_Test4 = c(k3Layer.layoutGridJsonData_Test4);
  l3Layer.dataTableData = c(k3Layer.dataTableData);
  const baseInfo = c(k3Layer.layerInfoData);
  l3Layer.layerInfoData =
    baseInfo && typeof baseInfo === 'object'
      ? { ...baseInfo, copiedFromLayerId: 'taipei_k3_dp_2' }
      : { copiedFromLayerId: 'taipei_k3_dp_2' };
  l3Layer.dashboardData = c(k3Layer.dashboardData);
  l3Layer.trafficData = c(k3Layer.trafficData);
  l3Layer.showStationPlacement = k3Layer.showStationPlacement !== false;
  l3Layer.drawJsonData = c(k3Layer.drawJsonData);
  l3Layer.isLoaded = true;

  if (!l3Layer.visible) {
    l3Layer.visible = true;
    dataStore.saveLayerState('taipei_l3_dp_2', { visible: true });
  }

  dataStore.saveLayerState('taipei_l3_dp_2', {
    isLoaded: l3Layer.isLoaded,
    jsonData: l3Layer.jsonData,
    spaceNetworkGridJsonData: l3Layer.spaceNetworkGridJsonData,
    spaceNetworkGridJsonData_SectionData: l3Layer.spaceNetworkGridJsonData_SectionData,
    spaceNetworkGridJsonData_ConnectData: l3Layer.spaceNetworkGridJsonData_ConnectData,
    spaceNetworkGridJsonData_StationData: l3Layer.spaceNetworkGridJsonData_StationData,
    spaceNetworkGridJsonDataL3Tab: l3Layer.spaceNetworkGridJsonDataL3Tab,
    spaceNetworkGridJsonDataL3Tab_SectionData: l3Layer.spaceNetworkGridJsonDataL3Tab_SectionData,
    spaceNetworkGridJsonDataL3Tab_ConnectData: l3Layer.spaceNetworkGridJsonDataL3Tab_ConnectData,
    spaceNetworkGridJsonDataL3Tab_StationData: l3Layer.spaceNetworkGridJsonDataL3Tab_StationData,
    processedJsonDataL3Tab: l3Layer.processedJsonDataL3Tab,
    layoutGridJsonData: l3Layer.layoutGridJsonData,
    layoutGridJsonData_Test: l3Layer.layoutGridJsonData_Test,
    layoutGridJsonData_Test2: l3Layer.layoutGridJsonData_Test2,
    layoutGridJsonData_Test3: l3Layer.layoutGridJsonData_Test3,
    layoutGridJsonData_Test4: l3Layer.layoutGridJsonData_Test4,
    processedJsonData: l3Layer.processedJsonData,
    drawJsonData: l3Layer.drawJsonData,
    dataTableData: l3Layer.dataTableData,
    dashboardData: l3Layer.dashboardData,
    layerInfoData: l3Layer.layerInfoData,
    trafficData: l3Layer.trafficData,
  });
}

/**
 * l3→m3：先依 dataStore 之 n 連續縮減黑點至「候選最小 weight 差 ≥ n」，再將 taipei_l3 路網等深拷至 taipei_m3。
 * ControlTab 會傳入 jsonData 作為第一參數；此流程改讀圖層 store，不使用該參數。
 */
export async function executeTaipeiDataProcTest3_L3_To_M3_Proc2() {
  const dataStore = useDataStore();
  const l3Layer = dataStore.findLayerById('taipei_l3_dp_2');
  const m3Layer = dataStore.findLayerById('taipei_m3_dp_2');
  if (!l3Layer || !m3Layer) {
    console.warn('executeTaipeiDataProcTest3_L3_To_M3_Proc2：缺少 taipei_l3 或 taipei_m3 圖層');
    return;
  }
  const l3Routes = l3Layer.spaceNetworkGridJsonDataL3Tab;
  if (!Array.isArray(l3Routes) || l3Routes.length === 0) {
    console.warn(
      'executeTaipeiDataProcTest3_L3_To_M3_Proc2：taipei_l3 尚無 L3 分頁路網（請先以 k3→l3 複製或載入 l3 之 JSON）'
    );
    return;
  }

  const raw = String(dataStore.taipeiL3ReductionWeightDiffThreshold ?? '').trim();
  const parsed = Number(raw);
  const threshold = Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
  await applyTaipeiL3BlackDotReductionWhileMinDiffLessThan(l3Layer, threshold);

  const c = deepCloneState;

  m3Layer.jsonData = c(l3Layer.jsonData);
  m3Layer.spaceNetworkGridJsonData = c(l3Layer.spaceNetworkGridJsonData);
  m3Layer.spaceNetworkGridJsonData_SectionData = c(l3Layer.spaceNetworkGridJsonData_SectionData);
  m3Layer.spaceNetworkGridJsonData_ConnectData = c(l3Layer.spaceNetworkGridJsonData_ConnectData);
  m3Layer.spaceNetworkGridJsonData_StationData = c(l3Layer.spaceNetworkGridJsonData_StationData);
  m3Layer.spaceNetworkGridJsonDataM3Tab = c(l3Layer.spaceNetworkGridJsonDataL3Tab);
  m3Layer.spaceNetworkGridJsonDataM3Tab_SectionData = c(
    l3Layer.spaceNetworkGridJsonDataL3Tab_SectionData
  );
  m3Layer.spaceNetworkGridJsonDataM3Tab_ConnectData = c(
    l3Layer.spaceNetworkGridJsonDataL3Tab_ConnectData
  );
  m3Layer.spaceNetworkGridJsonDataM3Tab_StationData = c(
    l3Layer.spaceNetworkGridJsonDataL3Tab_StationData
  );
  m3Layer.processedJsonData = c(l3Layer.processedJsonData);
  m3Layer.processedJsonDataM3Tab = c(l3Layer.processedJsonDataL3Tab);
  m3Layer.layoutGridJsonData = c(l3Layer.layoutGridJsonData);
  m3Layer.layoutGridJsonData_Test = c(l3Layer.layoutGridJsonData_Test);
  m3Layer.layoutGridJsonData_Test2 = c(l3Layer.layoutGridJsonData_Test2);
  m3Layer.layoutGridJsonData_Test3 = c(l3Layer.layoutGridJsonData_Test3);
  m3Layer.layoutGridJsonData_Test4 = c(l3Layer.layoutGridJsonData_Test4);
  m3Layer.dataTableData = c(l3Layer.dataTableData);
  const baseInfo = c(l3Layer.layerInfoData);
  m3Layer.layerInfoData =
    baseInfo && typeof baseInfo === 'object'
      ? { ...baseInfo, copiedFromLayerId: 'taipei_l3_dp_2' }
      : { copiedFromLayerId: 'taipei_l3_dp_2' };
  m3Layer.dashboardData = c(l3Layer.dashboardData);
  m3Layer.trafficData = c(l3Layer.trafficData);
  m3Layer.showStationPlacement = l3Layer.showStationPlacement !== false;
  m3Layer.drawJsonData = c(l3Layer.drawJsonData);
  m3Layer.isLoaded = true;

  if (!m3Layer.visible) {
    m3Layer.visible = true;
    dataStore.saveLayerState('taipei_m3_dp_2', { visible: true });
  }

  dataStore.saveLayerState('taipei_m3_dp_2', {
    isLoaded: m3Layer.isLoaded,
    jsonData: m3Layer.jsonData,
    spaceNetworkGridJsonData: m3Layer.spaceNetworkGridJsonData,
    spaceNetworkGridJsonData_SectionData: m3Layer.spaceNetworkGridJsonData_SectionData,
    spaceNetworkGridJsonData_ConnectData: m3Layer.spaceNetworkGridJsonData_ConnectData,
    spaceNetworkGridJsonData_StationData: m3Layer.spaceNetworkGridJsonData_StationData,
    spaceNetworkGridJsonDataM3Tab: m3Layer.spaceNetworkGridJsonDataM3Tab,
    spaceNetworkGridJsonDataM3Tab_SectionData: m3Layer.spaceNetworkGridJsonDataM3Tab_SectionData,
    spaceNetworkGridJsonDataM3Tab_ConnectData: m3Layer.spaceNetworkGridJsonDataM3Tab_ConnectData,
    spaceNetworkGridJsonDataM3Tab_StationData: m3Layer.spaceNetworkGridJsonDataM3Tab_StationData,
    processedJsonDataM3Tab: m3Layer.processedJsonDataM3Tab,
    layoutGridJsonData: m3Layer.layoutGridJsonData,
    layoutGridJsonData_Test: m3Layer.layoutGridJsonData_Test,
    layoutGridJsonData_Test2: m3Layer.layoutGridJsonData_Test2,
    layoutGridJsonData_Test3: m3Layer.layoutGridJsonData_Test3,
    layoutGridJsonData_Test4: m3Layer.layoutGridJsonData_Test4,
    processedJsonData: m3Layer.processedJsonData,
    drawJsonData: m3Layer.drawJsonData,
    dataTableData: m3Layer.dataTableData,
    dashboardData: m3Layer.dashboardData,
    layerInfoData: m3Layer.layerInfoData,
    trafficData: m3Layer.trafficData,
  });
}
