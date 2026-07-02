/**
 * Control 分頁：版面網絡網格家族（layout_network_grid_from_vh_draw*）
 * 由原 ControlTab.vue 抽出，行為不變。
 */
import { nextTick, reactive } from 'vue';
import { setControlLoadFeedback } from '@/utils/control/controlLoadFeedback.js';
import {
  LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA_2,
  LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT,
  jsonGridFromCoordNormalizedPersistPayload,
  syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy,
  applyLayoutTrafficCsvToVhDrawLayerRoots,
  applyRandomLayoutTrafficWeightsToVhDrawLayerRoots,
  isLayoutNetworkGridFromVhDrawLayerId,
  isLayoutVhDrawMainCopyLayerId,
  isLayoutVhDrawSecondCopyLayerId,
  isRmaLayoutNetworkGridFromVhDrawLayerId,
  buildLayoutVhDrawCopyBlackDotTrafficDataTableRows,
  buildVhDrawStationRowsForLayoutMap,
  refreshRmaLayoutNetworkGridFromVhIfVisible,
  SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID,
  SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID,
  ROUTE_NORMALIZATION_IMPORT_SOURCES,
} from '@/utils/layers/json_grid_coord_normalized/index.js';
import {
  layoutVhDrawAutoRandomWeightLayerId,
  isLayoutVhDrawAutoRandomWeightActive,
  stopLayoutVhDrawAutoRandomWeight,
  toggleLayoutVhDrawAutoRandomWeight,
} from './layoutVhDrawAutoRandomWeightTimer.js';
import { convertAiTestRoutesToRmaFlat } from '@/utils/aiTestRoutesToRmaFlat.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';

/** AI示意圖測試（路線調整）圖層 id：資料為 processedJsonData.routes，需先轉 flat 才能匯入路網網格。 */
const AI_TEST_ROUTE_ADJUST_LAYER_ID = 'route_adjust_ai_test_layer';

/** AI測試來源：由 processedJsonData.routes 產生 flat 並寫回來源層 spaceNetworkGridJsonData（供匯入沿用）。 */
function ensureAiTestSourceFlat(src) {
  const routes = src?.processedJsonData?.routes;
  if (!Array.isArray(routes) || !routes.length) return false;
  const flat = convertAiTestRoutesToRmaFlat(routes);
  if (!flat.length) return false;
  src.spaceNetworkGridJsonData = flat;
  const computed = computeStationDataFromRoutes(flat);
  src.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  src.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  src.spaceNetworkGridJsonData_StationData = computed.stationData;
  return true;
}

/**
 * @param {{
 *   dataStore: import('@/stores/dataStore.js').ReturnType;
 *   pickOrthogonalVhDrawLocalJsonClick: () => void;
 *   importOrthogonalVhDrawFromConvergeCenter: (sourceLayerId: string) => void;
 *   convergeCenterVertFirstLayerId: string;
 *   convergeCenterHorizFirstLayerId: string;
 * }} opts
 */
export function useLayoutNetworkGridFromVhDrawControlTab({
  dataStore,
  pickOrthogonalVhDrawLocalJsonClick,
  importOrthogonalVhDrawFromConvergeCenter,
  convergeCenterVertFirstLayerId,
  convergeCenterHorizFirstLayerId,
}) {
  const persistLayoutVhDrawGridRoutesDataJsonSnapshotCopy = () => {
    syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy((id) => dataStore.findLayerById(id));
    const lay = dataStore.findLayerById(LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY);
    if (lay) {
      dataStore.saveLayerState(
        lay.layerId,
        jsonGridFromCoordNormalizedPersistPayload(lay, { omitLoadingFlags: true })
      );
    }
  };

  const isLayoutNetworkGridFromVhDrawControlLayer = (lyr) =>
    !!lyr && isLayoutNetworkGridFromVhDrawLayerId(lyr.layerId);

  /** 是否為「主層」(含 CSV／隨機 weight／鄰線最小寬高)：OSM copy 或 RMA。 */
  const isMainCopyLayer = (lyr) => !!lyr && isLayoutVhDrawMainCopyLayerId(lyr.layerId);
  /** 是否為「第二份」純檢視複本(fisheye／最短路徑)：OSM copy2 或 RMA_2。 */
  const isSecondCopyLayer = (lyr) => !!lyr && isLayoutVhDrawSecondCopyLayerId(lyr.layerId);

  /** 交通流量 weight 作用的「根」圖層：RMA 版直接套用於本層 dataJson；OSM 版套用於 VH 繪製層。 */
  const trafficRootLayerId = (lyr) =>
    isRmaLayoutNetworkGridFromVhDrawLayerId(lyr?.layerId)
      ? lyr.layerId
      : LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID;

  /** 套用流量後：RMA 直接重算本層黑點表並 persist；OSM 走 VH 繪製層 + 同步 copy。 */
  const persistAfterTrafficChange = (lyr) => {
    if (isRmaLayoutNetworkGridFromVhDrawLayerId(lyr?.layerId)) {
      lyr.dataTableData = buildLayoutVhDrawCopyBlackDotTrafficDataTableRows(
        buildVhDrawStationRowsForLayoutMap(dataStore, lyr)
      );
      dataStore.saveLayerState(
        lyr.layerId,
        jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
      );
      return;
    }
    const vhDraw = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    if (vhDraw) {
      dataStore.saveLayerState(vhDraw.layerId, {
        jsonData: vhDraw.jsonData,
        dataJson: vhDraw.dataJson,
        processedJsonData: vhDraw.processedJsonData,
      });
    }
    persistLayoutVhDrawGridRoutesDataJsonSnapshotCopy();
  };

  /** 是否為 RMA 版路網網格（主層或第二份）。 */
  const isRmaLayer = (lyr) => isRmaLayoutNetworkGridFromVhDrawLayerId(lyr?.layerId);

  /**
   * 路網網格（RMA）：自「路線調整」群組任一路網層匯入（強制重建本層）。
   * @param {object} lyr 本層
   * @param {string} sourceLayerId 路線調整群組內任一 layerId
   */
  const importRmaLayoutNetworkGridFrom = async (lyr, sourceLayerId) => {
    if (!isRmaLayer(lyr)) return;
    const src = dataStore.findLayerById(sourceLayerId);
    const label =
      ROUTE_NORMALIZATION_IMPORT_SOURCES.find((s) => s.layerId === sourceLayerId)?.label ||
      src?.layerName ||
      sourceLayerId;
    // AI示意圖測試（路線調整）：資料在 processedJsonData.routes，先轉成 flat 寫回來源層。
    if (sourceLayerId === AI_TEST_ROUTE_ADJUST_LAYER_ID) ensureAiTestSourceFlat(src);
    if (!src || !Array.isArray(src.spaceNetworkGridJsonData) || !src.spaceNetworkGridJsonData.length) {
      setControlLoadFeedback(
        lyr.layerId,
        `「${label}」尚無路網；請先完成該層運算或匯入。`,
        'danger'
      );
      return;
    }
    refreshRmaLayoutNetworkGridFromVhIfVisible(
      dataStore.findLayerById.bind(dataStore),
      dataStore.saveLayerState.bind(dataStore),
      lyr.layerId,
      { sourceLayerId }
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
    setControlLoadFeedback(lyr.layerId, `已自「${label}」匯入路網。`, 'success');
  };

  const routeNormSourceHasData = (sourceLayerId) => {
    const src = dataStore.findLayerById(sourceLayerId);
    if (sourceLayerId === AI_TEST_ROUTE_ADJUST_LAYER_ID) {
      return !!(
        Array.isArray(src?.processedJsonData?.routes) && src.processedJsonData.routes.length
      );
    }
    return !!(src && Array.isArray(src.spaceNetworkGridJsonData) && src.spaceNetworkGridJsonData.length);
  };

  const layoutVhDrawCopyRowsSortedByWeightDiffAsc = (lyr) => {
    if (!isMainCopyLayer(lyr)) return [];
    const rows = lyr.dataTableData;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return [...rows].sort((a, b) => {
      const da = Number(a?.weight_差值);
      const db = Number(b?.weight_差值);
      const na = Number.isFinite(da) ? da : 0;
      const nb = Number.isFinite(db) ? db : 0;
      if (na !== nb) return na - nb;
      const ia = Number(a?.['#']);
      const ib = Number(b?.['#']);
      if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
      return 0;
    });
  };

  const onLayoutNetworkLoadTrafficCsvClick = async (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    try {
      const rel = String(lyr.csvFileName_traffic ?? '').trim();
      if (!rel || rel.includes('..')) throw new Error('無效的 csvFileName_traffic');
      const base = process.env.BASE_URL ?? '/';
      const csvUrl = `${base.endsWith('/') ? base : `${base}/`}data/${rel}`;
      const resp = await fetch(csvUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) throw new Error('CSV 內容不足');
      const header = lines[0].split(',');
      const aIdx = header.findIndex((c) => c.includes('站點A'));
      const bIdx = header.findIndex((c) => c.includes('站點B'));
      const wIdx = header.findIndex((c) => c.includes('總人次') || c === 'weight');
      if (aIdx < 0 || bIdx < 0 || wIdx < 0)
        throw new Error(`CSV 欄位未找到（header: ${header.join(',')}）`);
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length <= Math.max(aIdx, bIdx, wIdx)) continue;
        const a = parts[aIdx].trim();
        const b = parts[bIdx].trim();
        const w = Number(parts[wIdx]);
        if (!a || !b || !Number.isFinite(w)) continue;
        data.push({ a, b, weight: w });
      }
      lyr.layoutVhDrawTrafficData = data;
      lyr.layoutVhDrawTrafficMissing = [];
      applyLayoutTrafficCsvToVhDrawLayerRoots(dataStore, trafficRootLayerId(lyr), data);
      persistAfterTrafficChange(lyr);
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
    } catch (err) {
      console.error(err);
      setControlLoadFeedback(lyr.layerId, '載入 CSV 失敗：' + err.message, 'danger');
    }
  };

  const onLayoutNetworkClearTrafficCsvClick = async (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawTrafficData = null;
    lyr.layoutVhDrawTrafficMissing = [];
    applyLayoutTrafficCsvToVhDrawLayerRoots(dataStore, trafficRootLayerId(lyr), null);
    persistAfterTrafficChange(lyr);
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowTrafficWeightsChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowTrafficWeights = checked;
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawAutoHideMidBlackDotsChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawAutoHideMidBlackDots = checked === true;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowEndpointStationNamesChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowEndpointStationNames = checked === true;
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowMidBlackDotStationNamesChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowMidBlackDotStationNames = checked === true;
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 路網網格_2：清除最短路徑放大所選的紅/藍點。 */
  const onClearLayoutVhDrawPathSel = async () => {
    dataStore.clearLayoutVhDrawPathSel();
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 路網網格_2：最短路徑選取模式開關。關閉時一併清除已選紅/藍點。 */
  const onLayoutVhDrawPathSelectModeChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawPathSelectMode = checked === true;
    if (!lyr.layoutVhDrawPathSelectMode) dataStore.clearLayoutVhDrawPathSel();
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 路網網格_2：layout-grid 滑鼠放大鏡（fisheye）開關。開啟才執行變形。 */
  const onLayoutVhDrawFisheyeEnabledChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawFisheyeEnabled = checked === true;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowBlackDotRowColRatioOverlayChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowBlackDotRowColRatioOverlay = checked === true;
    // 比例來源擇一：開啟黑點數比例時關閉 weight 比例
    if (checked === true) lyr.layoutVhDrawShowWeightRowColRatioOverlay = false;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowWeightRowColRatioOverlayChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowWeightRowColRatioOverlay = checked === true;
    // 比例來源擇一：開啟 weight 比例時關閉黑點數比例
    if (checked === true) lyr.layoutVhDrawShowBlackDotRowColRatioOverlay = false;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawCopyWeightedNeighborHideMinPtChange = async (lyr, ev) => {
    if (!isMainCopyLayer(lyr)) return;
    let v = Number(ev?.target?.value);
    if (!Number.isFinite(v)) v = LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT;
    v = Math.min(99, Math.max(0.25, v));
    lyr.layoutVhDrawWeightedNeighborHideMinPt = v;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const sampleLayoutTrafficWeight1to9InverseGeometric = (ratio = 2) => {
    const r = Math.max(1.0001, Number(ratio));
    const weights = [];
    let sum = 0;
    for (let k = 1; k <= 9; k++) {
      const w = 1 / r ** k;
      weights.push(w);
      sum += w;
    }
    let u = Math.random() * sum;
    for (let i = 0; i < weights.length; i++) {
      u -= weights[i];
      if (u <= 0) return i + 1;
    }
    return 9;
  };

  const applyLayoutNetworkRandomizeTrafficWeights = async (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    const rootId = trafficRootLayerId(lyr);
    if (!dataStore.findLayerById(rootId)) {
      window.alert('找不到路網來源圖層。');
      stopLayoutVhDrawAutoRandomWeight();
      return;
    }

    dataStore.requestLayoutVhDrawRouteWeightAnim(lyr.layerId);

    const sampleFn = () => sampleLayoutTrafficWeight1to9InverseGeometric(2);
    const dataRows = applyRandomLayoutTrafficWeightsToVhDrawLayerRoots(dataStore, rootId, sampleFn);
    if (!dataRows.length) {
      window.alert(
        '尚無可產生 weight 的相鄰路段。請確認路網來源已有路網（站名、station_id 或格點座標），或改用載入 CSV。'
      );
      stopLayoutVhDrawAutoRandomWeight();
      return;
    }
    lyr.layoutVhDrawTrafficData = dataRows;
    lyr.layoutVhDrawTrafficMissing = [];
    persistAfterTrafficChange(lyr);
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutNetworkRandomizeTrafficWeightsClick = (lyr) =>
    applyLayoutNetworkRandomizeTrafficWeights(lyr);

  const onLayoutNetworkToggleAutoRandomizeTrafficWeightsClick = (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    toggleLayoutVhDrawAutoRandomWeight(lyr.layerId, () =>
      applyLayoutNetworkRandomizeTrafficWeights(lyr)
    );
  };

  return reactive({
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA,
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA_2,
    /** 主層(完整功能)：OSM copy 或 RMA */
    isMainCopyLayer,
    /** 第二份(純檢視)：OSM copy2 或 RMA_2 */
    isSecondCopyLayer,
    /** 是否為 RMA 版路網網格 */
    isRmaLayer,
    /** RMA：自指定往中心聚集層匯入路網 */
    importRmaLayoutNetworkGridFrom,
    routeNormalizationImportSources: ROUTE_NORMALIZATION_IMPORT_SOURCES,
    routeNormSourceHasData,
    SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID,
    SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID,
    LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT,
    /** 路網網格_2：layout-grid-viewer 目前滑鼠所在 pt 座標（{x,y}，無則為 null） */
    get layoutVhDrawViewerMousePt() {
      return dataStore.layoutVhDrawViewerMousePt;
    },
    isLayoutNetworkGridFromVhDrawControlLayer,
    layoutVhDrawCopyRowsSortedByWeightDiffAsc,
    pickOrthogonalVhDrawLocalJsonClick,
    importOrthogonalVhDrawFromConvergeCenter,
    convergeCenterVertFirstLayerId,
    convergeCenterHorizFirstLayerId,
    onLayoutNetworkLoadTrafficCsvClick,
    onLayoutNetworkClearTrafficCsvClick,
    onLayoutVhDrawShowTrafficWeightsChange,
    onLayoutVhDrawShowEndpointStationNamesChange,
    onLayoutVhDrawShowMidBlackDotStationNamesChange,
    onLayoutVhDrawFisheyeEnabledChange,
    onLayoutVhDrawPathSelectModeChange,
    onClearLayoutVhDrawPathSel,
    get layoutVhDrawPathSelCount() {
      return Array.isArray(dataStore.layoutVhDrawPathSel) ? dataStore.layoutVhDrawPathSel.length : 0;
    },
    get layoutVhDrawPathInfo() {
      return dataStore.layoutVhDrawPathInfo;
    },
    onLayoutVhDrawShowBlackDotRowColRatioOverlayChange,
    onLayoutVhDrawShowWeightRowColRatioOverlayChange,
    onLayoutVhDrawAutoHideMidBlackDotsChange,
    onLayoutVhDrawCopyWeightedNeighborHideMinPtChange,
    onLayoutNetworkRandomizeTrafficWeightsClick,
    onLayoutNetworkToggleAutoRandomizeTrafficWeightsClick,
    isLayoutVhDrawAutoRandomWeightActive: (lyr) =>
      isLayoutVhDrawAutoRandomWeightActive(lyr?.layerId),
    get layoutVhDrawAutoRandomWeightActiveLayerId() {
      return layoutVhDrawAutoRandomWeightLayerId.value;
    },
  });
}
