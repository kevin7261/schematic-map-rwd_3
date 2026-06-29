/** * 🎮 操作控制分頁組件 (Control Tab Component) * * 功能說明 (Features): * 1. 🚀
執行下一步：提供圖層處理流程的執行按鈕 * 2. 📊 圖層選擇：顯示當前可操作的圖層 * 3. 🔄
狀態管理：追蹤執行狀態和圖層資訊 * 4. 📱 響應式設計：適配不同螢幕尺寸的顯示需求 * * 技術特點
(Technical Features): * - 使用 Vue 3 Composition API 進行狀態管理 * - 整合 Pinia 狀態管理系統 * -
支援多圖層切換和操作 * * @file ControlTab.vue * @version 1.0.0 * @author Kevin Cheng * @since 1.0.0
*/
<script setup>
  // ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

  /**
   * Vue 3 Composition API 核心功能引入
   * 提供響應式數據管理、計算屬性、生命週期鉤子等現代化 Vue 開發功能
   */
  import { ref, computed, watch, nextTick, onMounted, onUnmounted, reactive } from 'vue';

  /**
   * Pinia 狀態管理庫引入
   * 提供集中式狀態管理和跨組件數據共享能力
   */
  import { useDataStore } from '@/stores/dataStore.js';
  import {
    computeLeafletDrawStations,
    computeLeafletDrawRouteStations,
    routeColorNameForIndex,
    routeColorForIndex,
    leafletDrawToOsmRouteGeoJson,
  } from '@/utils/leafletDrawStations.js';
  import { useSelectRouteMapCatalog } from '@/utils/selectRouteMap/cityCatalog.js';
  import { useRouteMapAdjust } from '@/utils/routeMapAdjust/loadFromSelectRouteMap.js';
  import { useRouteMapAdjust2 } from '@/utils/routeMapAdjust/loadFromSelectRouteMap2.js';
  import { useRouteMapAdjustStraight } from '@/utils/routeMapAdjust/loadFromSelectRouteMapStraight.js';
  import { routeMapAdjustSkeletonToGeoJson } from '@/utils/routeMapAdjust/routeStations.js';
  import { collectStraightSkeletonStationCoords } from '@/utils/routeMapAdjust/straightenLinesAtRedBlue.js';
  import {
    LAYER_ID as OSM_2_GEOJSON_2_JSON_LAYER_ID,
    mergeOsm2GeojsonLoaderResultIntoLayer,
    osmXmlToOsm2GeojsonLoaderResult,
    parseGeoJsonTextToOsm2GeojsonLoaderResult,
    getOsm2GeojsonPersistPatchAfterLoaderMerge,
    setOsm2GeojsonSessionOsmXml,
  } from '@/utils/layers/osm_2_geojson_2_json/index.js';
  import { loadMilpJsonRaw } from '@/utils/layers/schematic_layout/milp/readMilpResult.js';
  import { loadMilpJsonRaw as loadMilpJsonRawRma } from '@/utils/routeMapAdjust/schematic/milp/readMilpResult.js';
  import { auditMilpRoutePairRotation } from '@/utils/routeMapAdjust/schematic/auditMilpRoutePair.js';
  import {
    buildSchematicInputGeoJsonForDownload,
    enrichFlatSegmentsStationNames,
    enrichGeoJsonStationNamesFromMeta,
    enrichExportRowsStationNames,
  } from '@/utils/routeMapAdjust/schematic/exportStationNames.js';
  import { reinsertBlackStations } from '@/utils/layers/schematic_layout/assemble.js';
  import { showSolveOverlay } from '@/utils/layers/schematic_layout/solveOverlay.js';
  import {
    executeJsonGridCoordNormalize,
    executeJsonGridCoordNormalizedPruneEmptyGridLines,
    executeJsonGridNeighborTopologyFix,
    resolveB3InputSpaceNetwork,
    writeLayoutNormalizedLayerDataOsmFromNetwork,
    applyBestCoPointGroupMoveOnGrid,
    syncJsonGridFromCoordDataJsonFromPipeline,
    jsonGridFromCoordNormalizedPersistPayload,
    executeJsonGridFromCoordNormalizedPruneEmptyGridLines,
    POINT_ORTHOGONAL_LAYER_ID,
    LINE_ORTHOGONAL_LAYER_ID,
    CONNECT_STRAIGHTEN_HV_LAYER_ID,
    LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID,
    LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
    LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS as ORTH_SPACE_LINE_IDS_MAIN,
    SCHEMATIC_TOWARD_CENTER_LAYER_IDS,
    SCHEMATIC_TOWARD_CENTER_HV_LAYER_ID,
    SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID,
    SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID,
    SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID,
    isVertFirstTowardCenterLayerId,
    COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID,
    refreshLineOrthogonalFromPointOrthogonalIfVisible,
    refreshOrthogonalVhMirrorDrawLayerIfVisible,
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy,
    refreshLayoutNetworkGridFromVhDrawIfVisibleCopy2,
    refreshRmaLayoutNetworkGridFromVhIfVisible,
    isRmaLayoutNetworkGridFromVhDrawLayerId,
    tryOrthoTowardCrossNudgeFromReportItem,
    applyLineOrthoHubBlueDiagonalPrepassSegments,
    shallowCloneOrthoSegmentsSynced,
    buildInitialOrthoCoPointGroups,
    findBestConnectPointMoveForHV,
    runConnectPointsHVMaximizeToFixpoint,
  } from '@/utils/layers/json_grid_coord_normalized/index.js';

  import { clusterOrthoOverlapsForMergedBand } from '@/utils/layers/json_grid_coord_normalized/orthoNudgeTowardCrossConnectivity.js';
  import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
  import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
  import { getIcon } from '@/utils/utils.js';
  import { useOrthogonalVhDrawControlTab } from '@/utils/layers/orthogonal_toward_center_vh_draw/useOrthogonalVhDrawControlTab.js';
  import { useLayoutNetworkGridFromVhDrawControlTab } from '@/utils/layers/layout_network_grid_from_vh_draw/useLayoutNetworkGridFromVhDrawControlTab.js';
  import OrthogonalVhDrawControlTabSection from '@/utils/layers/orthogonal_toward_center_vh_draw/ControlTabSection.vue';
  import LayoutNetworkGridFromVhDrawControlTabSection from '@/utils/layers/layout_network_grid_from_vh_draw/ControlTabSection.vue';

  /**
   * 網格合併和縮減工具函數引入
   * 提供路線合併和網格縮減的核心功能
   */
  import {
    generateDataTableData_Test4 as generateDataTableDataUtil,
    mergeRoutesHorizontal,
    mergeRoutesVertical,
    reduceGrid as reduceGridUtil,
  } from '@/utils/gridMergeReduce.js';
  import {
    mapFlatSegmentsToExportRowsOrNull,
    exportRowToControlStationNodes,
  } from '@/utils/taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js';
  import {
    isMapDrawnRoutesExportArray,
    mapDrawnExportRowsFromJsonDrawRoot,
    mergeSegmentStationsFromPriorExportRows,
    minimalLineStringFeatureCollectionFromRouteExportRows,
  } from '@/utils/mapDrawnRoutesImport.js';
  import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
  import {
    collectStationPlacementPoints,
    collectLineStationGridPointsFromStationData,
    computeGridStationMinAxisDistances,
    normalizeSpaceNetworkDataToFlatSegments,
    towardCenterMoveLabel,
  } from '../utils/gridNormalizationMinDistance.js';
  import { buildMapDrawnRoutesExport } from '@/utils/exportMapDrawnRoutesFromLayer.js';
  import {
    getSchematicPlotBoundsFromLayer,
    mapNetworkToSchematicPlotXY,
  } from '../utils/schematicPlotMapper.js';
  import {
    applyOverlayNormalizedGridCoordinates,
    applyTaipeiFPruneEmptyGridRowsCols,
    overlayReducedTooltipPair,
  } from '../utils/dataExecute/execute_d_to_e_test.js';
  import {
    applyRandomWeightsBetweenAdjacentStations,
    applyTaipeiFMergePruneRebuildToLayer,
    buildTaipeiFDataTableRowsFromSpaceNetwork,
  } from '@/utils/randomConnectSegmentWeights.js';
  import {
    buildTaipeiFColHighlightPlan,
    buildTaipeiFRowHighlightPlan,
    buildSectionDataFlatSegmentIndexSet,
    getFlatSegmentsFromLayer,
  } from '@/utils/taipeiFColRouteHighlightPlan.js';
  import {
    computeTaipeiFColHighlightShift,
    computeTaipeiFRowHighlightShift,
    applyTaipeiFColShiftToLayerData,
    applyTaipeiFRowShiftToLayerData,
  } from '@/utils/taipeiFColHighlightShift.js';
  import {
    probeLineStationCentering,
    runLineStationsTowardSchematicCenter,
    runListedSectionStationsTowardSchematicCenter,
    stepOneLineStationTowardSchematicCenter,
    stepOneSectionStationTowardSchematicCenter,
  } from '@/utils/layerStationsTowardSchematicCenter.js';
  import { listSectionRoutesBetweenConnects } from '@/utils/sectionRouteConnectEndpoints.js';
  import {
    getTaipeiTestLayerBForGridNormLayer,
    isTaipeiTestGridNormLayerTab,
    isTaipeiTestCLayerTab,
    isTaipeiTestDLayerTab,
    isTaipeiTestELayerTab,
    isTaipeiTestFLayerTab,
    isTaipeiTestGLayerTab,
    isTaipeiTestGOrHWeightLayerTab,
    isTaipeiTest3BcdeLayerTab,
    isTaipeiTest3J3TrafficExportLayerTab,
  } from '@/utils/taipeiTestPipeline.js';
  import { executeTaipeiB4ZeroWeightMergeAndRedistribute } from '@/utils/dataExecute/executeTaipeiB4ZeroWeightMergeAndRedistribute.js';
  // ==================== 🏪 狀態管理初始化 (State Management Initialization) ====================

  /**
   * 獲取 Pinia 數據存儲實例
   * 用於訪問全域狀態和圖層數據
   */
  const dataStore = useDataStore();

  const LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL = [
    ...ORTH_SPACE_LINE_IDS_MAIN,
    ...SCHEMATIC_TOWARD_CENTER_LAYER_IDS,
  ];

  /** layout-network-grid k4：分配倍率 n（寫入 store ref；不依賴 setter 以免 HMR 未掛上） */
  function applySpaceNetworkK4ProportionalScaleN(raw) {
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(v)) return;
    dataStore.spaceNetworkK4WeightProportionalScaleN = Math.min(6, Math.max(0.25, v));
  }

  /** taipei_k4：滑鼠所在 snap 帶加權峰值 n（整數 1～50；寫入 store ref） */
  function applySpaceNetworkK4MouseBandFocusMagnifyN(raw) {
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(v)) return;
    dataStore.spaceNetworkK4MouseBandFocusMagnifyN = Math.min(50, Math.max(1, Math.round(v)));
  }

  // ==================== 📊 響應式狀態定義 (Reactive State Definition) ====================

  /**
   * 📑 當前作用中的圖層分頁 (Active Layer Tab)
   * 追蹤使用者當前選中的圖層分頁
   */
  const activeLayerTab = ref(null);

  /**
   * 🔄 執行計算狀態 (Execution Loading State)
   * 追蹤 executeFunction 執行過程的狀態，用於顯示計算中指示器
   */
  const isExecuting = ref(false);
  /** taipei_c4：手動「零權重合併＋mergeConnectSpans…」執行中 */
  const isTaipeiB4ManualZeroMergeBusy = ref(false);
  const runTaipeiB4ManualZeroWeightMerge = async () => {
    if (isTaipeiB4ManualZeroMergeBusy.value) return;
    isTaipeiB4ManualZeroMergeBusy.value = true;
    try {
      await executeTaipeiB4ZeroWeightMergeAndRedistribute();
    } finally {
      isTaipeiB4ManualZeroMergeBusy.value = false;
    }
  };
  /** 曾 flip 過的紅點（目前僅預覽不執行 flip，此為保留欄位） */
  const flippedConnectPointsMap = ref({});
  const lastFlippedConnectPoints = flippedConnectPointsMap;

  // ==================== 📊 計算屬性定義 (Computed Properties Definition) ====================

  /**
   * 獲取所有可見且有資料的圖層 (Get All Visible Layers with Data)
   * 從全域狀態中篩選出可見且已載入資料的圖層
   */
  const visibleLayers = computed(() => {
    const allLayers = dataStore.getAllLayers();
    return allLayers.filter((layer) => layer && layer.visible);
  });

  /**
   * 獲取所有有效的可見圖層（確保每個圖層都有有效的 layerId）
   * 用於模板中的 v-for，避免渲染無效圖層
   */
  const validVisibleLayers = computed(() => {
    return visibleLayers.value.filter((layer) => layer && layer.layerId);
  });

  /**
   * 當前選中的圖層 (Current Selected Layer)
   * 根據 activeLayerTab 獲取當前選中的圖層物件
   */
  const currentLayer = computed(() => {
    if (!activeLayerTab.value || !visibleLayers.value || visibleLayers.value.length === 0) {
      return null;
    }
    return (
      visibleLayers.value.find((layer) => layer && layer.layerId === activeLayerTab.value) || null
    );
  });

  /** 選「座標正規化」圖層時，對應之 execute／目標 layerId */
  function pickJsonGridNormalizeExecuteBundle() {
    return {
      normLayerId: 'json_grid_coord_normalized',
      execNormalize: executeJsonGridCoordNormalize,
      execTopology: executeJsonGridNeighborTopologyFix,
      execPruneEmptyAfterNorm: executeJsonGridCoordNormalizedPruneEmptyGridLines,
    };
  }

  function jsonGridNeighborFixMatchesLayerId(lyr) {
    if (!lyr) return false;
    return lyr.layerId === 'json_grid_coord_normalized';
  }

  /** 自動化「頂點步進／一鍵」：對應使用中或作用中 point_orthogonal 層 */
  function resolveActivePointOrthogonalLayer() {
    const cur = currentLayer.value;
    const lid = cur?.layerId;
    if (lid === POINT_ORTHOGONAL_LAYER_ID) return cur;
    return dataStore.findLayerById(POINT_ORTHOGONAL_LAYER_ID);
  }

  /** 紅／藍 connect 自動步進時作用之圖層（依目前分頁） */
  function resolveRbConnectListLayer() {
    const cur = currentLayer.value;
    if (cur?.layerId === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID) return cur;
    return dataStore.findLayerById(COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID);
  }

  /**
   * 取得圖層完整標題 (包含群組名稱) (Get Layer Full Title with Group Name)
   * 組合群組名稱和圖層名稱，形成完整的圖層標題
   */
  const getLayerFullTitle = (layer) => {
    if (!layer) return { groupName: null, layerName: '未知圖層' };
    const groupName = dataStore.findGroupNameByLayerId(layer.layerId);
    return {
      groupName: groupName,
      layerName: layer.layerName,
    };
  };

  /**
   * 判斷當前圖層是否有 executeFunction 且屬於 Taipei 群組
   */
  const canExecuteLayer = computed(() => {
    if (!currentLayer.value) return false;

    // 檢查圖層是否屬於可執行「下一步」之群組
    const groupName = dataStore.findGroupNameByLayerId(currentLayer.value.layerId);
    if (groupName !== '空間網絡網格') return false;

    // 檢查是否有 executeFunction
    return (
      currentLayer.value.executeFunction && typeof currentLayer.value.executeFunction === 'function'
    );
  });

  /**
   * 判斷當前圖層是否為網格示意圖測試圖層
   * 只有網格示意圖測試圖層才顯示網格預覽
   *
   * @type {ComputedRef<boolean>}
   * @returns {boolean} 是否為網格示意圖測試圖層
   */
  const isCurrentLayerGridSchematic = computed(() => {
    if (!activeLayerTab.value) return false;
    if (!Array.isArray(visibleLayers.value) || visibleLayers.value.length === 0) {
      return false;
    }
    const currentLayer = visibleLayers.value.find(
      (layer) => layer && layer.layerId === activeLayerTab.value
    );
    return currentLayer && currentLayer.isGridSchematic === true;
  });

  /**
   * 判斷當前圖層是否為 taipei_6_1_test
   * 只有此圖層才顯示"合併一筆路線"按鈕
   *
   * @type {ComputedRef<boolean>}
   * @returns {boolean} 是否為 taipei_6_1_test 圖層
   */
  const isTaipei6_1Test = computed(() => {
    return currentLayer.value && currentLayer.value.layerId === 'taipei_6_1_test';
  });

  /**
   * 📊 判斷是否為 taipei_6_1_test2 圖層 (Check if is taipei_6_1_test2 Layer)
   * 用於控制特定圖層專屬功能的顯示
   *
   * @type {ComputedRef<boolean>}
   * @returns {boolean} 是否為 taipei_6_1_test2 圖層
   */
  const isTaipei6_1Test2 = computed(() => {
    return currentLayer.value && currentLayer.value.layerId === 'taipei_6_1_test2';
  });

  /**
   * 📊 判斷是否為 taipei_6_1_test3 或 taipei_6_1_test4 圖層 (Check if is taipei_6_1_test3 or taipei_6_1_test4 Layer)
   * 用於控制特定圖層專屬功能的顯示（顯示 LayoutGridTab_Test4 的網格資料）
   *
   * @type {ComputedRef<boolean>}
   * @returns {boolean} 是否為 taipei_6_1_test3 或 taipei_6_1_test4 圖層
   */
  const isTaipei6_1Test3 = computed(() => {
    return (
      currentLayer.value &&
      (currentLayer.value.layerId === 'taipei_6_1_test3' ||
        currentLayer.value.layerId === 'taipei_6_1_test4')
    );
  });

  /** layoutGridJsonData_Test4 相關操作（合併／縮減／隨機權重）適用圖層 */
  const isTaipei6_1Test3Or4LayerId = (layerId) =>
    layerId === 'taipei_6_1_test3' || layerId === 'taipei_6_1_test4';

  const isTaipeiF = computed(
    () => currentLayer.value && isTaipeiTestGOrHWeightLayerTab(currentLayer.value.layerId)
  );

  /**
   * 空間網路「路線權重數字」開關：有 spaceNetworkGridJsonData 或 K3／L3 專用複本，且非 taipei_f／g（該類另有專區顯示權重）。
   * 與 Upper 之 space-network-grid、space-network-grid-k3 之路線權重數字連動（l3 分頁為依版面動態網格預覽，不繪權重）。
   */
  const hasSpaceNetworkStandaloneRouteWeightToggle = computed(() => {
    const L = currentLayer.value;
    if (!L) return false;
    const hasSn =
      Array.isArray(L.spaceNetworkGridJsonData) && L.spaceNetworkGridJsonData.length > 0;
    const hasSnK3 =
      Array.isArray(L.spaceNetworkGridJsonDataK3Tab) && L.spaceNetworkGridJsonDataK3Tab.length > 0;
    const hasSnL3 =
      Array.isArray(L.spaceNetworkGridJsonDataL3Tab) && L.spaceNetworkGridJsonDataL3Tab.length > 0;
    const hasSnM3 =
      Array.isArray(L.spaceNetworkGridJsonDataM3Tab) && L.spaceNetworkGridJsonDataM3Tab.length > 0;
    if (!hasSn && !hasSnK3 && !hasSnL3 && !hasSnM3) return false;
    if (isTaipeiF.value && hasSn) return false;
    return true;
  });

  const getK3TabRawSegments = (layer) => {
    if (!layer) return null;
    return null;
  };

  const getRouteMetaForDiag = (seg, idx) => {
    const props = seg?.props || seg?.original_props || {};
    const tags =
      props?.way_properties?.tags || props?.properties?.tags || seg?.way_properties?.tags || {};
    const nameRaw =
      seg?.route_name ??
      props?.name ??
      props?.route_name ??
      tags?.name ??
      tags?.ref ??
      `route_${idx + 1}`;
    const routeName = String(nameRaw ?? '').trim() || `route_${idx + 1}`;
    const colorRaw = seg?.route_color ?? props?.color ?? tags?.colour ?? tags?.color ?? '';
    const routeColor = String(colorRaw ?? '').trim();
    const routeGroupKey = routeColor ? `color:${routeColor}` : `name:${routeName}`;
    return {
      routeName,
      routeColor,
      routeGroupKey,
      routeLabel: routeColor ? `${routeName}（${routeColor}）` : routeName,
    };
  };

  /**
   * K3 JSON（space-network-grid-json-data-k3）重疊點診斷：
   * 僅同一路線（同色）內，檢查同一 layout-network-grid 座標上「多個不同黑點站名／多個不同 connect 站名／connect+黑」。
   * 相鄰 segment 共端點（同座標但代表同一點）不計入重疊。
   */
  const k3JsonPointOverlapReport = computed(() => {
    const layer = currentLayer.value;
    const rawSegments = getK3TabRawSegments(layer);
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) return null;

    const routeBuckets = new Map();
    const normalizeName = (node) => {
      const n = node && typeof node === 'object' ? node : {};
      const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
      const raw =
        n.station_name ??
        tags.station_name ??
        tags.name ??
        n.station_id ??
        tags.station_id ??
        n.connect_number ??
        tags.connect_number;
      const s = raw == null ? '' : String(raw).trim();
      return s || null;
    };

    const ensureBucket = (meta) => {
      if (!routeBuckets.has(meta.routeGroupKey)) {
        routeBuckets.set(meta.routeGroupKey, {
          routeName: meta.routeName,
          routeColor: meta.routeColor,
          routeLabel: meta.routeLabel,
          byKey: new Map(),
        });
      }
      return routeBuckets.get(meta.routeGroupKey);
    };

    const ensurePoint = (bucket, x, y) => {
      const nx = Number(x);
      const ny = Number(y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
      const rx = Math.round(nx * 1e6) / 1e6;
      const ry = Math.round(ny * 1e6) / 1e6;
      const key = `${rx},${ry}`;
      if (!bucket.byKey.has(key)) {
        bucket.byKey.set(key, {
          x: rx,
          y: ry,
          hasConnect: false,
          hasBlack: false,
          connectNames: new Set(),
          blackNames: new Set(),
        });
      }
      return bucket.byKey.get(key);
    };

    const mark = (bucket, x, y, node) => {
      const row = ensurePoint(bucket, x, y);
      if (!row) return;
      const n = node && typeof node === 'object' ? node : {};
      const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
      const nt = String(n.node_type ?? '').trim();
      const label = normalizeName(n);
      if (nt === 'connect') {
        row.hasConnect = true;
        if (label) row.connectNames.add(label);
        return;
      }
      const hasStation = !!(n.station_name || n.station_id || tags.station_name || tags.station_id);
      const forceBlack = !!tags._forceDrawBlackDot;
      if (hasStation || forceBlack) {
        row.hasBlack = true;
        if (label) row.blackNames.add(label);
      }
    };

    for (let si = 0; si < rawSegments.length; si++) {
      const seg = rawSegments[si];
      if (!seg || typeof seg !== 'object') continue;
      const meta = getRouteMetaForDiag(seg, si);
      const bucket = ensureBucket(meta);
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        let x = null;
        let y = null;
        let node = null;
        if (Array.isArray(p) && p.length >= 2) {
          x = p[0];
          y = p[1];
          if (p.length > 2 && p[2] && typeof p[2] === 'object') node = p[2];
        } else if (p && typeof p === 'object') {
          x = p.x;
          y = p.y;
        }
        if (!node && nodes[i] && typeof nodes[i] === 'object') node = nodes[i];
        const gx = Number(x);
        const gy = Number(y);
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
        mark(bucket, gx, gy, node);
      }
    }

    const groups = [];
    for (const bucket of routeBuckets.values()) {
      const points = Array.from(bucket.byKey.values())
        .map((r) => ({
          ...r,
          connectNames: Array.from(r.connectNames),
          blackNames: Array.from(r.blackNames),
        }))
        .filter((r) => r.hasConnect || r.hasBlack)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      if (points.length === 0) continue;

      for (const p of points) {
        /** 重疊：同一座標上有「兩個不同的東西」才算——不同站名、不同 connect 編號，或 connect+黑混存。
         *  （同路線相鄰 segment 端點會在同座標出現兩次，但代表同一點，不算重疊。） */
        const mixConnectBlack = p.hasConnect && p.hasBlack;
        const multiBlackSamePx = p.hasBlack && p.blackNames.length > 1;
        const multiConnectSamePx = p.hasConnect && p.connectNames.length > 1;
        if (!(mixConnectBlack || multiBlackSamePx || multiConnectSamePx)) continue;

        const members = [
          {
            x: p.x,
            y: p.y,
            hasConnect: p.hasConnect,
            hasBlack: p.hasBlack,
            connectNames: p.connectNames,
            blackNames: p.blackNames,
          },
        ];

        groups.push({
          routeName: bucket.routeName,
          routeColor: bucket.routeColor,
          routeLabel: bucket.routeLabel,
          size: members.length,
          members,
        });
      }
    }

    groups.sort((a, b) => a.routeLabel.localeCompare(b.routeLabel, 'zh-Hant'));
    return {
      total: groups.length,
      rows: groups.slice(0, 30),
      truncated: groups.length > 30,
    };
  });

  /**
   * K3 JSON 分頁：列出所有 connect（紅／藍）與黑點在繪區 px 上的座標（與 JSON 分頁／近距診斷同一 mapPair）。
   */
  const k3JsonConnectBlackCoordsReport = computed(() => {
    const layer = currentLayer.value;
    const rawSegments = getK3TabRawSegments(layer);
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) return null;

    const toGridPoint = (p) => {
      if (Array.isArray(p) && p.length >= 2) {
        const x = Number(p[0]);
        const y = Number(p[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      if (p && typeof p === 'object') {
        const x = Number(p.x);
        const y = Number(p.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      return null;
    };

    const gkey = (gx, gy) => `${Math.round(gx)},${Math.round(gy)}`;
    const gridDeg = new Map();
    for (let si = 0; si < rawSegments.length; si++) {
      const seg = rawSegments[si];
      if (!seg || typeof seg !== 'object') continue;
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const coords = pts.map((p) => toGridPoint(p)).filter((p) => p);
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
        const ka = gkey(a[0], a[1]);
        const kb = gkey(b[0], b[1]);
        gridDeg.set(ka, (gridDeg.get(ka) || 0) + 1);
        gridDeg.set(kb, (gridDeg.get(kb) || 0) + 1);
      }
    }

    const normalizeName = (node) => {
      const n = node && typeof node === 'object' ? node : {};
      const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
      const raw =
        n.station_name ??
        tags.station_name ??
        tags.name ??
        n.station_id ??
        tags.station_id ??
        n.connect_number ??
        tags.connect_number;
      const s = raw == null ? '' : String(raw).trim();
      return s || null;
    };

    const routeBuckets = new Map();
    const dedupe = new Set();
    const MAX_ROWS = 1200;
    let rowCount = 0;
    let truncated = false;

    /** @returns {boolean} false = 已達列印上限，應停止掃描 */
    const pushRow = (meta, item) => {
      if (rowCount >= MAX_ROWS) return false;
      const dk = `${meta.routeGroupKey}|${item.kind}|${item.hue || ''}|${item.x}|${item.y}|${item.name || ''}|${item.display}`;
      if (dedupe.has(dk)) return true;
      dedupe.add(dk);
      if (!routeBuckets.has(meta.routeGroupKey)) {
        routeBuckets.set(meta.routeGroupKey, {
          routeLabel: meta.routeLabel,
          items: [],
        });
      }
      routeBuckets.get(meta.routeGroupKey).items.push(item);
      rowCount += 1;
      if (rowCount >= MAX_ROWS) {
        truncated = true;
        return false;
      }
      return true;
    };

    outer: for (let si = 0; si < rawSegments.length; si++) {
      const seg = rawSegments[si];
      if (!seg || typeof seg !== 'object') continue;
      const meta = getRouteMetaForDiag(seg, si);
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        let x = null;
        let y = null;
        let node = null;
        if (Array.isArray(p) && p.length >= 2) {
          x = p[0];
          y = p[1];
          if (p.length > 2 && p[2] && typeof p[2] === 'object') node = p[2];
        } else if (p && typeof p === 'object') {
          x = p.x;
          y = p.y;
        }
        if (!node && nodes[i] && typeof nodes[i] === 'object') node = nodes[i];
        const gx = Number(x);
        const gy = Number(y);
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
        const rx = Math.round(gx * 1e6) / 1e6;
        const ry = Math.round(gy * 1e6) / 1e6;

        const n = node && typeof node === 'object' ? node : {};
        const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
        const nt = String(n.node_type ?? '').trim();
        const name = normalizeName(n);
        const displayState = n.display === false || tags.display === false ? 'false' : 'true';

        if (nt === 'connect') {
          const d = gridDeg.get(gkey(gx, gy)) || 0;
          const hue = d <= 1 ? '藍' : '紅';
          if (
            !pushRow(meta, {
              kind: 'connect',
              hue,
              kindLabel: `connect·${hue}（${d <= 1 ? '末端' : '交叉'}）`,
              x: rx,
              y: ry,
              name,
              display: displayState,
            })
          ) {
            break outer;
          }
          continue;
        }
        const hasStation = !!(
          n.station_name ||
          n.station_id ||
          tags.station_name ||
          tags.station_id
        );
        const forceBlack = !!tags._forceDrawBlackDot;
        const hiddenBlack =
          n.display === false || tags.display === false || tags._mergedHiddenBlackDot;
        if (hasStation || forceBlack || hiddenBlack) {
          if (
            !pushRow(meta, {
              kind: 'black',
              hue: null,
              kindLabel: hiddenBlack ? '黑點（display=false）' : '黑點',
              x: rx,
              y: ry,
              name,
              display: displayState,
            })
          ) {
            break outer;
          }
        }
      }
    }

    const routes = Array.from(routeBuckets.values())
      .map((b) => ({
        routeLabel: b.routeLabel,
        items: b.items.sort((a, b) => a.y - b.y || a.x - b.x),
      }))
      .sort((a, b) => a.routeLabel.localeCompare(b.routeLabel, 'zh-Hant'));

    return {
      total: rowCount,
      maxRows: MAX_ROWS,
      truncated,
      routes,
    };
  });

  /**
   * K3 JSON 分頁：同一路線內任兩個黑/紅/藍點，距離 <= 門檻（px）之列舉（內繪區 px）。
   */
  const k3JsonConsecutiveNearPairsReport = computed(() => {
    const layer = currentLayer.value;
    const rawSegments = getK3TabRawSegments(layer);
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) return null;

    const threshold = Math.max(1, Math.round(Number(dataStore.k3JsonMinStationDistancePx) || 10));
    const hasValue = (v) => v !== undefined && v !== null;
    const toGridPoint = (p) => {
      if (Array.isArray(p) && p.length >= 2) {
        const x = Number(p[0]);
        const y = Number(p[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      if (p && typeof p === 'object') {
        const x = Number(p.x);
        const y = Number(p.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      return null;
    };
    const pointKey = (x, y) =>
      `${Math.round(Number(x) * 1e6) / 1e6},${Math.round(Number(y) * 1e6) / 1e6}`;

    const gridDeg = new Map();
    for (let si = 0; si < rawSegments.length; si++) {
      const seg = rawSegments[si];
      if (!seg || typeof seg !== 'object') continue;
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const coords = pts.map((p) => toGridPoint(p)).filter((p) => p);
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
        const ka = pointKey(a[0], a[1]);
        const kb = pointKey(b[0], b[1]);
        gridDeg.set(ka, (gridDeg.get(ka) || 0) + 1);
        gridDeg.set(kb, (gridDeg.get(kb) || 0) + 1);
      }
    }

    const normalizeName = (node) => {
      const n = node && typeof node === 'object' ? node : {};
      const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
      const raw =
        n.station_name ??
        tags.station_name ??
        tags.name ??
        n.station_id ??
        tags.station_id ??
        n.connect_number ??
        tags.connect_number;
      const s = raw == null ? '' : String(raw).trim();
      return s || '';
    };

    const roundedXY = (xy) => ({
      x: Math.round(Number(xy[0]) * 1e6) / 1e6,
      y: Math.round(Number(xy[1]) * 1e6) / 1e6,
    });

    const parsePointNodeAt = (seg, idx) => {
      const pts = Array.isArray(seg?.points) ? seg.points : [];
      const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
      const p = pts[idx];
      if (!p) return null;
      const xy0 = toGridPoint(p);
      if (!xy0) return null;
      let node = null;
      if (Array.isArray(p) && p.length > 2 && p[2] && typeof p[2] === 'object') node = p[2];
      if (!node && nodes[idx] && typeof nodes[idx] === 'object') node = nodes[idx];
      const n = node && typeof node === 'object' ? node : {};
      const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
      const r = roundedXY(xy0);
      return { x: r.x, y: r.y, n, tags };
    };

    /** 與主圖 SpaceNetworkGridTabK3 一致：type 等標 terminal 時視為末端（藍），不依 grid 度數 */
    const connectTaggedTerminalAsBlueHue = (n, tags) => {
      const tg = tags && typeof tags === 'object' ? tags : {};
      const raw =
        n?.type ??
        tg?.type ??
        n?.connect_type ??
        tg?.connect_type ??
        n?.station_type ??
        tg?.station_type;
      const s = raw == null ? '' : String(raw).trim().toLowerCase();
      if (!s) return false;
      return (
        s === 'terminal' || s === 'terminus' || s === 'end' || s === 'endpoint' || s === 'line_end'
      );
    };

    const isConnectSeg = (seg, idx) => {
      const pn = parsePointNodeAt(seg, idx);
      if (!pn) return false;
      const { n, tags } = pn;
      const nt = String(n.node_type ?? '').trim();
      return nt === 'connect' || hasValue(n.connect_number) || hasValue(tags.connect_number);
    };

    const endpointLabelText = (seg, idx) => {
      const pn = parsePointNodeAt(seg, idx);
      if (!pn) return '（無座標）';
      const { x, y, n, tags } = pn;
      const nm = normalizeName(n) || '（無站名）';
      if (isConnectSeg(seg, idx)) {
        const d = gridDeg.get(pointKey(x, y)) || 0;
        const hue = connectTaggedTerminalAsBlueHue(n, tags) || d <= 1 ? '藍' : '紅';
        return `${hue}·${nm}（${x}, ${y}）`;
      }
      return `路線端·${nm}（${x}, ${y}）`;
    };

    /** 與「兩點：」列相同語意：色相（粗體）＋站名＋（x, y） */
    const endpointLabelParts = (seg, idx) => {
      const pn = parsePointNodeAt(seg, idx);
      if (!pn) return null;
      const { x, y, n, tags } = pn;
      const nm = normalizeName(n) || '（無站名）';
      if (isConnectSeg(seg, idx)) {
        const d = gridDeg.get(pointKey(x, y)) || 0;
        const hue = connectTaggedTerminalAsBlueHue(n, tags) || d <= 1 ? '藍' : '紅';
        return { hue, name: nm, x, y };
      }
      return { hue: '路線端', name: nm, x, y };
    };

    const buildConnectLegIntervals = (seg) => {
      const pts = Array.isArray(seg?.points) ? seg.points : [];
      const n = pts.length;
      if (!n) return [];
      const conn = [];
      for (let i = 0; i < n; i++) {
        if (isConnectSeg(seg, i)) conn.push(i);
      }
      if (!conn.length) return [];
      const out = [];
      if (conn[0] > 0) out.push({ lo: 0, hi: conn[0], a: 0, b: conn[0] });
      for (let k = 0; k < conn.length - 1; k++) {
        out.push({ lo: conn[k], hi: conn[k + 1], a: conn[k], b: conn[k + 1] });
      }
      if (conn[conn.length - 1] < n - 1) {
        out.push({
          lo: conn[conn.length - 1],
          hi: n - 1,
          a: conn[conn.length - 1],
          b: n - 1,
        });
      }
      return out;
    };

    const axisEps = 1e-3;

    /**
     * 同一段 polyline 上兩頂點：僅當兩者落在「同一個」connect 子路段（兩端點為 connect 或路線端）內時，
     * 回傳該子路段起迄；不跨多段子路段串接。
     */
    const legSpanIfBothInSameConnectSubseg = (segSi, ia, ib) => {
      const seg = rawSegments[segSi];
      if (!seg || typeof seg !== 'object' || ia == null || ib == null) return null;
      const lo = Math.min(ia, ib);
      const hi = Math.max(ia, ib);
      const ivs = buildConnectLegIntervals(seg);
      const iv = ivs.find((v) => v.lo <= lo && hi <= v.hi);
      if (!iv) return null;
      return {
        key: `${segSi}|${iv.a}|${iv.b}`,
        fromLabel: endpointLabelText(seg, iv.a),
        toLabel: endpointLabelText(seg, iv.b),
        fromParts: endpointLabelParts(seg, iv.a),
        toParts: endpointLabelParts(seg, iv.b),
      };
    };

    const legSpanIfBothInSameConnectSubsegOnSeg = (seg, ia, ib) => {
      if (!seg || typeof seg !== 'object' || ia == null || ib == null) return null;
      const lo = Math.min(ia, ib);
      const hi = Math.max(ia, ib);
      const ivs = buildConnectLegIntervals(seg);
      const iv = ivs.find((v) => v.lo <= lo && hi <= v.hi);
      if (!iv) return null;
      return {
        key: `seg|${iv.a}|${iv.b}`,
        fromLabel: endpointLabelText(seg, iv.a),
        toLabel: endpointLabelText(seg, iv.b),
        fromParts: endpointLabelParts(seg, iv.a),
        toParts: endpointLabelParts(seg, iv.b),
      };
    };

    /** 折線最近點：回傳距離與沿線累積參數 tau（用於排序） */
    const closestOnPolyline = (spine, qx, qy) => {
      if (!Array.isArray(spine) || spine.length < 2) return { dist: Infinity, tau: 0 };
      let bestD = Infinity;
      let bestTau = 0;
      let cum = 0;
      for (let i = 0; i < spine.length - 1; i++) {
        const ax0 = spine[i][0];
        const ay0 = spine[i][1];
        const bx0 = spine[i + 1][0];
        const by0 = spine[i + 1][1];
        const ex = bx0 - ax0;
        const ey = by0 - ay0;
        const el2 = ex * ex + ey * ey;
        let t = 0;
        if (el2 > 1e-18) {
          t = Math.max(0, Math.min(1, ((qx - ax0) * ex + (qy - ay0) * ey) / el2));
        }
        const px = ax0 + t * ex;
        const py = ay0 + t * ey;
        const d = Math.hypot(qx - px, qy - py);
        const edgeLen = Math.sqrt(el2);
        const tau = cum + t * edgeLen;
        if (d < bestD) {
          bestD = d;
          bestTau = tau;
        }
        cum += edgeLen;
      }
      return { dist: bestD, tau: bestTau };
    };

    /**
     * 僅在同 routeGroupKey 內解析 connect 子路。
     * taipei_c4／c5 主圖診斷：route 折線無 node、station 為散點時，依 route 幾何投影排序 station 再算子路。
     */
    const resolveConnectLegForNearPair = (routeGroupKey, ax, ay, bx, by) => {
      const pkA = pointKey(ax, ay);
      const pkB = pointKey(bx, by);
      const snapPx = Math.max(
        1,
        Math.min(80, Math.round(Number(dataStore.k3JsonOverlapDistancePx) || 10))
      );

      const segsSameRoute = [];
      for (let si = 0; si < rawSegments.length; si++) {
        const seg = rawSegments[si];
        if (!seg || typeof seg !== 'object') continue;
        const meta = getRouteMetaForDiag(seg, si);
        if (meta.routeGroupKey !== routeGroupKey) continue;
        segsSameRoute.push({ si, seg });
      }
      if (!segsSameRoute.length) return { kind: 'none' };

      // Path 1：折線頂點上已有 connect（傳統 JSON）
      let best = null;
      let bestLen = Infinity;
      for (const { si, seg } of segsSameRoute) {
        if (!buildConnectLegIntervals(seg).length) continue;
        const pts = Array.isArray(seg.points) ? seg.points : [];
        const coords = pts.map((p) => toGridPoint(p));
        const ia = [];
        const ib = [];
        for (let i = 0; i < coords.length; i++) {
          const c = coords[i];
          if (!c) continue;
          if (pointKey(c[0], c[1]) === pkA) ia.push(i);
          if (pointKey(c[0], c[1]) === pkB) ib.push(i);
        }
        if (!ia.length || !ib.length) continue;
        for (const i of ia) {
          for (const j of ib) {
            const leg = legSpanIfBothInSameConnectSubseg(si, i, j);
            if (leg) {
              const len = Math.abs(i - j);
              if (len < bestLen) {
                best = leg;
                bestLen = len;
              }
            }
          }
        }
      }
      if (best) return { kind: 'single', leg: best };

      // Path 2：taipei_c4／c5 diag — diag_geometry route + station
      const hasDiag = segsSameRoute.some(
        ({ seg }) => seg.diag_geometry === 'route' || seg.diag_geometry === 'station'
      );
      if (!hasDiag) return { kind: 'none' };

      const routeSegs = segsSameRoute.filter(({ seg }) => seg.diag_geometry === 'route');
      const stationSegs = segsSameRoute.filter(({ seg }) => seg.diag_geometry === 'station');
      if (!routeSegs.length || !stationSegs.length) return { kind: 'none' };

      const spineOf = (seg) => {
        const pts = Array.isArray(seg.points) ? seg.points : [];
        const out = [];
        for (const p of pts) {
          const c = toGridPoint(p);
          if (c) out.push([c[0], c[1]]);
        }
        return out;
      };

      let bestSpine = null;
      let bestScore = Infinity;
      for (const { seg } of routeSegs) {
        const spine = spineOf(seg);
        if (spine.length < 2) continue;
        const da = closestOnPolyline(spine, ax, ay);
        const db = closestOnPolyline(spine, bx, by);
        const score = da.dist + db.dist;
        if (score < bestScore) {
          bestScore = score;
          bestSpine = spine;
        }
      }
      if (!bestSpine || bestScore > snapPx * 30) return { kind: 'none' };

      const hits = [];
      for (const { seg } of stationSegs) {
        const pts = Array.isArray(seg.points) ? seg.points : [];
        const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const c = toGridPoint(p);
          if (!c) continue;
          const rx = Math.round(Number(c[0]) * 1e6) / 1e6;
          const ry = Math.round(Number(c[1]) * 1e6) / 1e6;
          const { dist: dLine, tau } = closestOnPolyline(bestSpine, rx, ry);
          if (dLine > snapPx * 6) continue;
          let node = null;
          if (Array.isArray(p) && p.length > 2 && p[2] && typeof p[2] === 'object') node = p[2];
          if (!node && nodes[i] && typeof nodes[i] === 'object') node = nodes[i];
          hits.push({ rx, ry, tau, node: node && typeof node === 'object' ? node : {} });
        }
      }
      hits.sort((u, v) => u.tau - v.tau || u.rx - v.rx || u.ry - v.ry);
      const seen = new Set();
      const ordered = [];
      for (const h of hits) {
        const k = pointKey(h.rx, h.ry);
        if (seen.has(k)) continue;
        seen.add(k);
        ordered.push(h);
      }
      if (ordered.length < 2) return { kind: 'none' };

      const synthPoints = ordered.map((h) => [h.rx, h.ry, h.node]);
      const synthNodes = ordered.map((h) => h.node);
      const synthSeg = { points: synthPoints, nodes: synthNodes };

      const nearestIdx = (px, py) => {
        let bi = -1;
        let bd = Infinity;
        for (let i = 0; i < ordered.length; i++) {
          const d = Math.hypot(ordered[i].rx - px, ordered[i].ry - py);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        return bd <= snapPx * 2 ? bi : -1;
      };
      const ia = nearestIdx(ax, ay);
      const ib = nearestIdx(bx, by);
      if (ia < 0 || ib < 0) return { kind: 'none' };

      const leg = legSpanIfBothInSameConnectSubsegOnSeg(synthSeg, ia, ib);
      if (leg) return { kind: 'single', leg };
      return { kind: 'none' };
    };

    const routeBuckets = new Map();
    for (let si = 0; si < rawSegments.length; si++) {
      const seg = rawSegments[si];
      if (!seg || typeof seg !== 'object') continue;
      const meta = getRouteMetaForDiag(seg, si);
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
      if (!routeBuckets.has(meta.routeGroupKey)) {
        routeBuckets.set(meta.routeGroupKey, {
          routeGroupKey: meta.routeGroupKey,
          routeLabel: meta.routeLabel,
          byPoint: new Map(),
        });
      }
      const bucket = routeBuckets.get(meta.routeGroupKey);

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const xy = toGridPoint(p);
        if (!xy) continue;
        let node = null;
        if (Array.isArray(p) && p.length > 2 && p[2] && typeof p[2] === 'object') node = p[2];
        if (!node && nodes[i] && typeof nodes[i] === 'object') node = nodes[i];
        const n = node && typeof node === 'object' ? node : {};
        const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
        const nt = String(n.node_type ?? '').trim();
        const key = pointKey(xy[0], xy[1]);

        let kind = '';
        let hue = '';
        if (nt === 'connect' || hasValue(n.connect_number) || hasValue(tags.connect_number)) {
          const d = gridDeg.get(key) || 0;
          kind = 'connect';
          hue = connectTaggedTerminalAsBlueHue(n, tags) || d <= 1 ? '藍' : '紅';
        } else {
          const hasStation = !!(
            n.station_name ||
            n.station_id ||
            tags.station_name ||
            tags.station_id
          );
          const forceBlack = !!tags._forceDrawBlackDot;
          const hiddenBlack =
            n.display === false || tags.display === false || tags._mergedHiddenBlackDot;
          if (hasStation || forceBlack || hiddenBlack) {
            kind = 'black';
            hue = '黑';
          }
        }
        if (!kind) continue;
        const name = normalizeName(n);
        const pKey = `${key}|${hue}`;
        if (!bucket.byPoint.has(pKey)) {
          bucket.byPoint.set(pKey, {
            key,
            x: Math.round(Number(xy[0]) * 1e6) / 1e6,
            y: Math.round(Number(xy[1]) * 1e6) / 1e6,
            kind,
            hue,
            name,
            segSi: si,
            ptIdx: i,
          });
        } else if (!bucket.byPoint.get(pKey).name && name) {
          bucket.byPoint.get(pKey).name = name;
        }
      }
    }

    const axisLabelFor = (dx, dy) => {
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < axisEps && ady < axisEps) return '重疊';
      if (adx < axisEps && ady >= axisEps) return '垂直';
      if (ady < axisEps && adx >= axisEps) return '水平';
      return '斜向';
    };

    const rows = [];
    for (const bucket of routeBuckets.values()) {
      const items = Array.from(bucket.byPoint.values());
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (!Number.isFinite(dist) || dist > threshold) continue;
          let legConnectKind = 'none';
          let legConnectFrom = null;
          let legConnectTo = null;
          const resolved = resolveConnectLegForNearPair(bucket.routeGroupKey, a.x, a.y, b.x, b.y);
          if (resolved.kind === 'single' && resolved.leg) {
            legConnectKind = 'single';
            legConnectFrom = resolved.leg.fromParts;
            legConnectTo = resolved.leg.toParts;
          }
          rows.push({
            routeLabel: bucket.routeLabel,
            fromHue: a.hue,
            toHue: b.hue,
            fromName: a.name || `(${a.x}, ${a.y})`,
            toName: b.name || `(${b.x}, ${b.y})`,
            fromX: a.x,
            fromY: a.y,
            toX: b.x,
            toY: b.y,
            axisLabel: axisLabelFor(dx, dy),
            dist: Math.round(dist * 1000) / 1000,
            legConnectKind,
            legConnectFrom,
            legConnectTo,
          });
        }
      }
    }

    const axisOrder = (l) => (l === '水平' ? 0 : l === '垂直' ? 1 : l === '重疊' ? 2 : 3);
    rows.sort((u, v) => {
      if (u.dist !== v.dist) return u.dist - v.dist;
      const oa = axisOrder(u.axisLabel);
      const ob = axisOrder(v.axisLabel);
      if (oa !== ob) return oa - ob;
      return `${u.routeLabel}|${u.fromName}|${u.toName}`.localeCompare(
        `${v.routeLabel}|${v.fromName}|${v.toName}`,
        'zh-Hant'
      );
    });
    /** 相異「connect 間路段」數（與下方分組 key 一致；含全部近距對，不受 80 列截斷影響） */
    const resolvedLegKeys = new Set();
    const unresolvedLegKeys = new Set();
    for (const row of rows) {
      if (row.legConnectKind === 'single' && row.legConnectFrom && row.legConnectTo) {
        const a = row.legConnectFrom;
        const b = row.legConnectTo;
        resolvedLegKeys.add(
          `${row.routeLabel}\t${a.hue}|${a.name}|${a.x},${a.y}\t${b.hue}|${b.name}|${b.x},${b.y}`
        );
      } else {
        unresolvedLegKeys.add(
          `${row.routeLabel}\t${row.fromX},${row.fromY}\t${row.toX},${row.toY}`
        );
      }
    }
    const MAX_ROWS = 80;
    return {
      threshold,
      total: rows.length,
      rows: rows.slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
      connectLegSegmentCount: resolvedLegKeys.size,
      unresolvedNearPairGroupCount: unresolvedLegKeys.size,
    };
  });

  /**
   * 與 k3JsonConsecutiveNearPairsReport 相同資料，但依「connect 間路段」合併：
   * 同一區間（同路線、同 legConnectFrom／legConnectTo）之多對近距站點列在同一區塊。
   */
  const k3JsonConsecutiveNearPairsReportGroupedByLeg = computed(() => {
    const rep = k3JsonConsecutiveNearPairsReport.value;
    if (!rep) return null;
    const slice = Array.isArray(rep.rows) ? rep.rows : [];
    if (!slice.length) {
      return {
        threshold: rep.threshold,
        total: rep.total,
        truncated: rep.truncated,
        groups: [],
        connectLegSegmentCount: rep.connectLegSegmentCount ?? 0,
        unresolvedNearPairGroupCount: rep.unresolvedNearPairGroupCount ?? 0,
      };
    }
    const axisOrder = (l) => (l === '水平' ? 0 : l === '垂直' ? 1 : l === '重疊' ? 2 : 3);
    const legKey = (row) => {
      if (row.legConnectKind === 'single' && row.legConnectFrom && row.legConnectTo) {
        const a = row.legConnectFrom;
        const b = row.legConnectTo;
        return `1\t${row.routeLabel}\t${a.hue}|${a.name}|${a.x},${a.y}\t${b.hue}|${b.name}|${b.x},${b.y}`;
      }
      return `0\t${row.routeLabel}\t${row.fromX},${row.fromY}\t${row.toX},${row.toY}`;
    };
    const order = [];
    const byKey = new Map();
    for (const row of slice) {
      const k = legKey(row);
      if (!byKey.has(k)) {
        byKey.set(k, []);
        order.push(k);
      }
      byKey.get(k).push(row);
    }
    for (const k of order) {
      const g = byKey.get(k);
      g.sort((u, v) => {
        if (u.dist !== v.dist) return u.dist - v.dist;
        const oa = axisOrder(u.axisLabel);
        const ob = axisOrder(v.axisLabel);
        if (oa !== ob) return oa - ob;
        return `${u.fromName}|${u.toName}`.localeCompare(`${v.fromName}|${v.toName}`, 'zh-Hant');
      });
    }
    const groups = order.map((k) => {
      const rows = byKey.get(k);
      const first = rows[0];
      return {
        routeLabel: first.routeLabel,
        legConnectKind: first.legConnectKind,
        legConnectFrom: first.legConnectFrom,
        legConnectTo: first.legConnectTo,
        rows,
      };
    });
    groups.sort((u, v) => {
      if (u.routeLabel !== v.routeLabel) {
        return u.routeLabel.localeCompare(v.routeLabel, 'zh-Hant');
      }
      const uLeg =
        u.legConnectKind === 'single' && u.legConnectFrom && u.legConnectTo
          ? `${u.legConnectFrom.name}\t${u.legConnectTo.name}`
          : '\uffff';
      const vLeg =
        v.legConnectKind === 'single' && v.legConnectFrom && v.legConnectTo
          ? `${v.legConnectFrom.name}\t${v.legConnectTo.name}`
          : '\uffff';
      if (uLeg !== vLeg) return uLeg.localeCompare(vLeg, 'zh-Hant');
      const ua = u.legConnectKind === 'single' ? 0 : 1;
      const va = v.legConnectKind === 'single' ? 0 : 1;
      if (ua !== va) return ua - va;
      return 0;
    });
    return {
      threshold: rep.threshold,
      total: rep.total,
      truncated: rep.truncated,
      groups,
      connectLegSegmentCount: rep.connectLegSegmentCount ?? 0,
      unresolvedNearPairGroupCount: rep.unresolvedNearPairGroupCount ?? 0,
    };
  });

  /**
   * K3 JSON（space-network-grid-json-data-k3）路線重疊診斷：
   * 不同路線群（不同色／無色時不同名）之「水平／垂直」線段若共線且一維投影區間有重疊（長度 &gt; 0），即視為重疊；
   * 先將同一路線群折線上連續共線邊合併為最長段，再比對；最後依路線群 pair 與軸向合併相鄰重疊區間，避免折線切碎造成重複計段。
   */
  const k3JsonRouteOverlapReport = computed(() => {
    const layer = currentLayer.value;
    const rawSegments = getK3TabRawSegments(layer);
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) return null;

    const alignTol = 0;
    const minLen = 1e-6;

    const toPoint = (p) => {
      if (Array.isArray(p) && p.length >= 2) {
        const x = Number(p[0]);
        const y = Number(p[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      if (p && typeof p === 'object') {
        const x = Number(p.x);
        const y = Number(p.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      return null;
    };

    // 路線重疊檢查以「同色（或無色時同名）」視為同一路線群，避免同色分支彼此被當成不同路線
    const routeMetaKey = (m) => `${m.routeGroupKey}`;

    /** @returns {{ kind:'H'|'V', y?: number, x?: number, x1?: number, x2?: number, y1?: number, y2?: number, rKey: string, routeLabel: string } | null} */
    const normalizeHVEdge = (a, b, meta) => {
      if (!a || !b) return null;
      const rKey = routeMetaKey(meta);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      if (Math.abs(dy) <= alignTol && Math.abs(dx) > minLen) {
        const y = (a[1] + b[1]) / 2;
        return {
          kind: 'H',
          y,
          x1: Math.min(a[0], b[0]),
          x2: Math.max(a[0], b[0]),
          rKey,
          routeLabel: meta.routeLabel,
        };
      }
      if (Math.abs(dx) <= alignTol && Math.abs(dy) > minLen) {
        const x = (a[0] + b[0]) / 2;
        return {
          kind: 'V',
          x,
          y1: Math.min(a[1], b[1]),
          y2: Math.max(a[1], b[1]),
          rKey,
          routeLabel: meta.routeLabel,
        };
      }
      return null;
    };

    const overlap1d = (l1, r1, l2, r2) => {
      const L = Math.max(l1, l2);
      const R = Math.min(r1, r2);
      if (R - L <= minLen) return null;
      return [L, R];
    };

    /** 同一 segment 折線上連續、同 rKey、同軸之 HV 邊合併（避免與他線比對時一段拆成多條子邊而重複計段） */
    const mergeHVEdgesAlongPolyline = (list) => {
      if (!list.length) return [];
      const touchEps = 1e-5;
      const out = [];
      let cur = { ...list[0] };
      for (let k = 1; k < list.length; k++) {
        const e = list[k];
        if (
          cur.kind === 'H' &&
          e.kind === 'H' &&
          cur.rKey === e.rKey &&
          Math.abs(cur.y - e.y) <= alignTol &&
          !(cur.x2 < e.x1 - touchEps || e.x2 < cur.x1 - touchEps)
        ) {
          cur = {
            ...cur,
            x1: Math.min(cur.x1, e.x1),
            x2: Math.max(cur.x2, e.x2),
            y: (cur.y + e.y) / 2,
          };
          continue;
        }
        if (
          cur.kind === 'V' &&
          e.kind === 'V' &&
          cur.rKey === e.rKey &&
          Math.abs(cur.x - e.x) <= alignTol &&
          !(cur.y2 < e.y1 - touchEps || e.y2 < cur.y1 - touchEps)
        ) {
          cur = {
            ...cur,
            y1: Math.min(cur.y1, e.y1),
            y2: Math.max(cur.y2, e.y2),
            x: (cur.x + e.x) / 2,
          };
          continue;
        }
        out.push(cur);
        cur = { ...e };
      }
      out.push(cur);
      return out;
    };

    const edges = [];
    for (let si = 0; si < rawSegments.length; si++) {
      const seg = rawSegments[si];
      if (!seg || typeof seg !== 'object') continue;
      if (seg.diag_geometry === 'station') continue;
      const meta = getRouteMetaForDiag(seg, si);
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const coords = pts.map((p) => toPoint(p)).filter((p) => p);
      const segEdges = [];
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
        const e = normalizeHVEdge(a, b, meta);
        if (e) segEdges.push(e);
      }
      edges.push(...mergeHVEdgesAlongPolyline(segEdges));
    }

    const seen = new Set();
    const rows = [];
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i];
        const e2 = edges[j];
        if (e1.rKey === e2.rKey) continue;
        if (e1.kind !== e2.kind) continue;

        if (e1.kind === 'H') {
          if (Math.abs(e1.y - e2.y) > alignTol) continue;
          const ov = overlap1d(e1.x1, e1.x2, e2.x1, e2.x2);
          if (!ov) continue;
          const y = (e1.y + e2.y) / 2;
          const rk = [e1.rKey, e2.rKey].sort().join('||');
          const dedupeKey = `H|${rk}|${y}|${ov[0]}|${ov[1]}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          const la = e1.routeLabel;
          const lb = e2.routeLabel;
          const [ra, rb] = la.localeCompare(lb, 'zh-Hant') <= 0 ? [la, lb] : [lb, la];
          rows.push({
            pairKey: rk,
            routeA: ra,
            routeB: rb,
            start: [ov[0], y],
            end: [ov[1], y],
          });
        } else {
          if (Math.abs(e1.x - e2.x) > alignTol) continue;
          const ov = overlap1d(e1.y1, e1.y2, e2.y1, e2.y2);
          if (!ov) continue;
          const x = (e1.x + e2.x) / 2;
          const rk = [e1.rKey, e2.rKey].sort().join('||');
          const dedupeKey = `V|${rk}|${x}|${ov[0]}|${ov[1]}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          const la = e1.routeLabel;
          const lb = e2.routeLabel;
          const [ra, rb] = la.localeCompare(lb, 'zh-Hant') <= 0 ? [la, lb] : [lb, la];
          rows.push({
            pairKey: rk,
            routeA: ra,
            routeB: rb,
            start: [x, ov[0]],
            end: [x, ov[1]],
          });
        }
      }
    }

    const mergeTol = 1e-6;
    /** 內繪區 px 已 snap 時，軸向以整數 px 合併可避免浮點造成同線多筆 */
    const cSnapPx = (v) => Math.round(Number(v) || 0);
    const toSpan = (r) => {
      const x0 = Number(r.start[0]);
      const y0 = Number(r.start[1]);
      const x1 = Number(r.end[0]);
      const y1 = Number(r.end[1]);
      if (Math.abs(y0 - y1) <= mergeTol) {
        const c = (y0 + y1) / 2;
        return {
          pairKey: r.pairKey,
          routeA: r.routeA,
          routeB: r.routeB,
          kind: 'H',
          c,
          cSnap: cSnapPx(c),
          from: Math.min(x0, x1),
          to: Math.max(x0, x1),
        };
      }
      if (Math.abs(x0 - x1) <= mergeTol) {
        const c = (x0 + x1) / 2;
        return {
          pairKey: r.pairKey,
          routeA: r.routeA,
          routeB: r.routeB,
          kind: 'V',
          c,
          cSnap: cSnapPx(c),
          from: Math.min(y0, y1),
          to: Math.max(y0, y1),
        };
      }
      return null;
    };

    const spans = rows.map(toSpan).filter((s) => s && s.to - s.from > mergeTol);
    spans.sort((a, b) => {
      const pk = a.pairKey.localeCompare(b.pairKey, 'en');
      if (pk !== 0) return pk;
      if (a.kind !== b.kind) return a.kind === 'H' ? -1 : 1;
      if (a.cSnap !== b.cSnap) return a.cSnap - b.cSnap;
      if (a.from !== b.from) return a.from - b.from;
      return a.to - b.to;
    });

    const mergedSpans = [];
    for (const s of spans) {
      const prev = mergedSpans[mergedSpans.length - 1];
      if (
        prev &&
        prev.pairKey === s.pairKey &&
        prev.kind === s.kind &&
        prev.cSnap === s.cSnap &&
        s.from <= prev.to + mergeTol
      ) {
        prev.to = Math.max(prev.to, s.to);
      } else {
        mergedSpans.push({ ...s });
      }
    }

    const mergedRows = mergedSpans.map((s) =>
      s.kind === 'H'
        ? {
            routeA: s.routeA,
            routeB: s.routeB,
            start: [s.from, s.c],
            end: [s.to, s.c],
          }
        : {
            routeA: s.routeA,
            routeB: s.routeB,
            start: [s.c, s.from],
            end: [s.c, s.to],
          }
    );

    return {
      total: mergedRows.length,
      rows: mergedRows.slice(0, 60),
      truncated: mergedRows.length > 60,
    };
  });

  const taipeiFGridScalingChecked = computed(
    () => dataStore.taipeiFSpaceNetworkGridScaling !== false
  );

  const onTaipeiFGridScalingChange = (checked) => {
    dataStore.setTaipeiFSpaceNetworkGridScaling(checked);
  };

  /** 路網測試圖層：Control 分頁可獨立選「正方形網格」或預設（充滿繪區） */
  const setSquareGridCellsTaipeiTest3 = (layer, on) => {
    const lyr = dataStore.findLayerById(layer?.layerId);
    if (!lyr || !isTaipeiTest3BcdeLayerTab(layer.layerId)) return;
    lyr.squareGridCellsTaipeiTest3 = !!on;
  };

  const taipeiFHighlightMatchesCurrentLayer = (h) =>
    h &&
    currentLayer.value &&
    h.layerId === currentLayer.value.layerId &&
    isTaipeiTestFLayerTab(h.layerId);

  /** SectionData 紅點間路段高亮／其他路段高亮（空間網路欄列 overlay） */
  const TAIPEI_F_HL_SECTION = '#c62828';
  const TAIPEI_F_HL_OTHER = '#2e7d32';

  /** taipei_f：「下一筆 Col」逐步索引（與 buildTaipeiFColHighlightPlan 順序一致） */
  const taipeiFColHighlightStep = ref(-1);
  /** taipei_f：「下一筆 Row」逐步索引（與 buildTaipeiFRowHighlightPlan 順序一致） */
  const taipeiFRowHighlightStep = ref(-1);

  const taipeiFColHighlightSummary = computed(() => {
    const h = dataStore.taipeiFColRouteHighlight;
    if (!taipeiFHighlightMatchesCurrentLayer(h)) return '';
    const total = h.planLength ?? '?';
    const step = (h.stepIndex ?? 0) + 1;
    const d = h.delta ?? 0;
    const dStr = d > 0 ? `→+${d}` : d < 0 ? `→${d}` : '（不移動）';
    return `欄 x=${h.gridX}（${step}／${total}）${dStr}`;
  });

  /** taipei_f：欄位移後拓撲檢查（L 變 T、頂點未跟欄移動） */
  const taipeiFColTopologyError = computed(() => {
    const h = dataStore.taipeiFColRouteHighlight;
    if (!taipeiFHighlightMatchesCurrentLayer(h)) return '';
    return h.topologyError || '';
  });

  const taipeiFRowHighlightSummary = computed(() => {
    const h = dataStore.taipeiFRowRouteHighlight;
    if (!taipeiFHighlightMatchesCurrentLayer(h)) return '';
    const total = h.planLength ?? '?';
    const step = (h.stepIndex ?? 0) + 1;
    const d = h.delta ?? 0;
    const dStr = d > 0 ? `→+${d}` : d < 0 ? `→${d}` : '（不移動）';
    return `列 y=${h.gridY}（${step}／${total}）${dStr}`;
  });

  const taipeiFRowTopologyError = computed(() => {
    const h = dataStore.taipeiFRowRouteHighlight;
    if (!taipeiFHighlightMatchesCurrentLayer(h)) return '';
    return h.topologyError || '';
  });

  /** 紅點間路段（略過兩端皆為多路段共用紅點之筆） */
  const taipeiFSectionRouteList = computed(() => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId)) return [];
    const sd = layer.spaceNetworkGridJsonData_SectionData;
    if (!Array.isArray(sd) || sd.length === 0) return [];
    return listSectionRoutesBetweenConnects(sd);
  });

  const advanceTaipeiFColHighlight = () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId)) return;
    dataStore.clearTaipeiFRowRouteHighlight();
    taipeiFRowHighlightStep.value = -1;
    const flat = getFlatSegmentsFromLayer(layer);
    const plan = buildTaipeiFColHighlightPlan(flat);
    if (!plan.length) {
      taipeiFColHighlightStep.value = -1;
      dataStore.clearTaipeiFColRouteHighlight();
      return;
    }
    const next = (taipeiFColHighlightStep.value + 1) % plan.length;
    taipeiFColHighlightStep.value = next;
    const e = plan[next];

    let xMin = Infinity;
    let xMax = -Infinity;
    for (const seg of flat) {
      for (const pt of seg.points || []) {
        const x = Number(Array.isArray(pt) ? pt[0] : pt.x);
        if (Number.isFinite(x)) {
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
        }
      }
    }
    xMin = Math.floor(xMin);
    xMax = Math.ceil(xMax) + 1;

    const stationFeaturesForShift = [];
    for (const seg of flat) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length === 0) continue;
      const addPt = (pt, nodeType) => {
        const x = Number(Array.isArray(pt) ? pt[0] : pt.x);
        const y = Number(Array.isArray(pt) ? pt[1] : pt.y);
        const props = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
        stationFeaturesForShift.push({
          geometry: { coordinates: [x, y] },
          nodeType: props?.node_type || nodeType,
          properties: props,
        });
      };
      addPt(pts[0], 'connect');
      if (pts.length > 1) addPt(pts[pts.length - 1], 'connect');
    }
    if (Array.isArray(layer.spaceNetworkGridJsonData_StationData)) {
      const rows = collectLineStationGridPointsFromStationData(
        layer.spaceNetworkGridJsonData_StationData
      );
      for (const row of rows) {
        stationFeaturesForShift.push({
          geometry: { coordinates: [Number(row.x), Number(row.y)] },
          nodeType: 'line',
          properties: row.meta || {},
        });
      }
    }

    const { delta, shiftedPaths } = computeTaipeiFColHighlightShift({
      flatSegments: flat,
      stationFeatures: stationFeaturesForShift,
      verticalPaths: e.verticalPaths,
      xMin,
      xMax,
    });

    let shiftMeta = { topologyError: null };
    let effectiveDelta = delta;
    let pathsForStore = delta !== 0 ? shiftedPaths : e.verticalPaths;
    if (delta !== 0) {
      shiftMeta = applyTaipeiFColShiftToLayerData(layer, e.verticalPaths, delta, e.segmentIndices);
    }

    const sectionSegSet = buildSectionDataFlatSegmentIndexSet(layer);
    const verticalPathColors =
      Array.isArray(e.verticalPathSegIndices) &&
      e.verticalPathSegIndices.length === pathsForStore.length
        ? e.verticalPathSegIndices.map((si) =>
            sectionSegSet.has(si) ? TAIPEI_F_HL_SECTION : TAIPEI_F_HL_OTHER
          )
        : null;

    dataStore.setTaipeiFColRouteHighlight({
      layerId: layer.layerId,
      gridX: e.gridX,
      componentIndex: e.componentIndex,
      segmentIndices: e.segmentIndices,
      verticalPaths: pathsForStore,
      verticalPathColors,
      stepIndex: next,
      planLength: plan.length,
      delta: effectiveDelta,
      topologyError: shiftMeta.topologyError ?? null,
    });
  };

  const advanceTaipeiFRowHighlight = () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId)) return;
    dataStore.clearTaipeiFColRouteHighlight();
    taipeiFColHighlightStep.value = -1;
    const flat = getFlatSegmentsFromLayer(layer);
    const plan = buildTaipeiFRowHighlightPlan(flat);
    if (!plan.length) {
      taipeiFRowHighlightStep.value = -1;
      dataStore.clearTaipeiFRowRouteHighlight();
      return;
    }
    const next = (taipeiFRowHighlightStep.value + 1) % plan.length;
    taipeiFRowHighlightStep.value = next;
    const e = plan[next];

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const seg of flat) {
      for (const pt of seg.points || []) {
        const y = Number(Array.isArray(pt) ? pt[1] : pt.y);
        if (Number.isFinite(y)) {
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        }
      }
    }
    yMin = Math.floor(yMin);
    yMax = Math.ceil(yMax) + 1;

    const stationFeaturesForShift = [];
    for (const seg of flat) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length === 0) continue;
      const addPt = (pt, nodeType) => {
        const x = Number(Array.isArray(pt) ? pt[0] : pt.x);
        const y = Number(Array.isArray(pt) ? pt[1] : pt.y);
        const props = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
        stationFeaturesForShift.push({
          geometry: { coordinates: [x, y] },
          nodeType: props?.node_type || nodeType,
          properties: props,
        });
      };
      addPt(pts[0], 'connect');
      if (pts.length > 1) addPt(pts[pts.length - 1], 'connect');
    }
    if (Array.isArray(layer.spaceNetworkGridJsonData_StationData)) {
      const rows = collectLineStationGridPointsFromStationData(
        layer.spaceNetworkGridJsonData_StationData
      );
      for (const row of rows) {
        stationFeaturesForShift.push({
          geometry: { coordinates: [Number(row.x), Number(row.y)] },
          nodeType: 'line',
          properties: row.meta || {},
        });
      }
    }

    const { delta, shiftedPaths } = computeTaipeiFRowHighlightShift({
      flatSegments: flat,
      stationFeatures: stationFeaturesForShift,
      horizontalPaths: e.horizontalPaths,
      yMin,
      yMax,
    });

    let shiftMeta = { topologyError: null };
    let effectiveDelta = delta;
    let pathsForStore = delta !== 0 ? shiftedPaths : e.horizontalPaths;
    if (delta !== 0) {
      shiftMeta = applyTaipeiFRowShiftToLayerData(
        layer,
        e.horizontalPaths,
        delta,
        e.segmentIndices
      );
    }

    const sectionSegSetRow = buildSectionDataFlatSegmentIndexSet(layer);
    const horizontalPathColors =
      Array.isArray(e.horizontalPathSegIndices) &&
      e.horizontalPathSegIndices.length === pathsForStore.length
        ? e.horizontalPathSegIndices.map((si) =>
            sectionSegSetRow.has(si) ? TAIPEI_F_HL_SECTION : TAIPEI_F_HL_OTHER
          )
        : null;

    dataStore.setTaipeiFRowRouteHighlight({
      layerId: layer.layerId,
      gridY: e.gridY,
      componentIndex: e.componentIndex,
      segmentIndices: e.segmentIndices,
      horizontalPaths: pathsForStore,
      horizontalPathColors,
      stepIndex: next,
      planLength: plan.length,
      delta: effectiveDelta,
      topologyError: shiftMeta.topologyError ?? null,
    });
  };

  /**
   * 一鍵依序執行：以「當下圖層」建出的欄計畫長度連續跑完每一筆 Col，再以跑完後的圖層建列計畫並連續跑完每一筆 Row（等同手動各點一輪）。
   */
  const runTaipeiFColThenRowAll = () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId)) return;
    stopTaipeiFCenteringAutoAdvance();

    dataStore.clearTaipeiFRowRouteHighlight();
    taipeiFRowHighlightStep.value = -1;
    taipeiFColHighlightStep.value = -1;
    dataStore.clearTaipeiFColRouteHighlight();

    const flat0 = getFlatSegmentsFromLayer(layer);
    const colPlan0 = buildTaipeiFColHighlightPlan(flat0);
    const nCol = colPlan0.length;
    for (let k = 0; k < nCol; k++) {
      advanceTaipeiFColHighlight();
    }

    dataStore.clearTaipeiFColRouteHighlight();
    taipeiFColHighlightStep.value = -1;
    taipeiFRowHighlightStep.value = -1;
    dataStore.clearTaipeiFRowRouteHighlight();

    const flat1 = getFlatSegmentsFromLayer(layer);
    const rowPlan0 = buildTaipeiFRowHighlightPlan(flat1);
    const nRow = rowPlan0.length;
    for (let k = 0; k < nRow; k++) {
      advanceTaipeiFRowHighlight();
    }
  };

  /**
   * taipei_f：刪除整欄／整列皆無黑點、紅點或路線轉折頂點之格，並將路段與 Section／Connect／Station 座標塌縮重映射。
   */
  const pruneTaipeiFEmptyGridRowsColsFromControl = async () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId)) return;
    if (
      !Array.isArray(layer.spaceNetworkGridJsonData) ||
      layer.spaceNetworkGridJsonData.length === 0
    )
      return;
    if (!applyTaipeiFPruneEmptyGridRowsCols(layer)) return;
    layer.layoutGridJsonData = JSON.parse(JSON.stringify(layer.spaceNetworkGridJsonData));
    layer._taipeiFListedGraySnapshotDone = false;
    layer.dataTableData = buildTaipeiFDataTableRowsFromSpaceNetwork(
      layer.spaceNetworkGridJsonData,
      {
        connectData: layer.spaceNetworkGridJsonData_ConnectData,
        stationData: layer.spaceNetworkGridJsonData_StationData,
        sectionData: layer.spaceNetworkGridJsonData_SectionData,
      }
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 一鍵依序：清單路段向心 → 非清單向心 → 欄／列批次 → 空欄／空列縮減（單輪內部步驟） */
  const taipeiFOneClickPipelineRunning = ref(false);
  const TAIPEI_F_ONE_CLICK_PIPELINE_ROUNDS_REPEAT = 6;

  const runTaipeiFOneClickPipelineSteps = async () => {
    runTaipeiFListedSectionStationsTowardSchematicCenterComplete();
    await nextTick();
    runTaipeiFLineStationsTowardSchematicCenter();
    await nextTick();
    runTaipeiFColThenRowAll();
    await nextTick();
    await pruneTaipeiFEmptyGridRowsColsFromControl();
  };

  const runTaipeiFOneClickPipeline = async () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId) || !layer.spaceNetworkGridJsonData?.length)
      return;
    if (taipeiFOneClickPipelineRunning.value) return;
    taipeiFOneClickPipelineRunning.value = true;
    try {
      await runTaipeiFOneClickPipelineSteps();
    } finally {
      taipeiFOneClickPipelineRunning.value = false;
    }
  };

  /** 同上四步一輪，連續執行 6 輪（1-2-3-4 重複 6 次） */
  const runTaipeiFOneClickPipelineSixRounds = async () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId) || !layer.spaceNetworkGridJsonData?.length)
      return;
    if (taipeiFOneClickPipelineRunning.value) return;
    taipeiFOneClickPipelineRunning.value = true;
    try {
      for (let r = 0; r < TAIPEI_F_ONE_CLICK_PIPELINE_ROUNDS_REPEAT; r++) {
        await runTaipeiFOneClickPipelineSteps();
        await nextTick();
      }
    } finally {
      taipeiFOneClickPipelineRunning.value = false;
    }
  };

  /** taipei_f 自動執行（向心／清單路段／欄／列）共用間隔 */
  const TAIPEI_F_AUTO_INTERVAL_MS = 100;

  /** 欄／列逐步檢視：自動每 0.1 秒執行一步（互斥：啟動一邊會停另一邊） */
  const taipeiFColAutoIntervalId = ref(null);
  const taipeiFRowAutoIntervalId = ref(null);
  /** 向心靠攏：每 0.1 秒一步，依序 0…n−1，每步皆高亮該黑點（含未位移）；一輪結束若該輪完全無位移則停止 */
  const taipeiFCenteringAutoIntervalId = ref(null);
  const taipeiFCenteringAutoStationIndex = ref(0);
  const taipeiFCenteringAutoRoundMoves = ref(0);
  const taipeiFCenteringAutoSummary = ref('');

  const stopTaipeiFColAutoAdvance = () => {
    if (taipeiFColAutoIntervalId.value != null) {
      clearInterval(taipeiFColAutoIntervalId.value);
      taipeiFColAutoIntervalId.value = null;
    }
  };

  const stopTaipeiFRowAutoAdvance = () => {
    if (taipeiFRowAutoIntervalId.value != null) {
      clearInterval(taipeiFRowAutoIntervalId.value);
      taipeiFRowAutoIntervalId.value = null;
    }
  };

  const stopTaipeiFCenteringAutoTimerOnly = () => {
    if (taipeiFCenteringAutoIntervalId.value != null) {
      clearInterval(taipeiFCenteringAutoIntervalId.value);
      taipeiFCenteringAutoIntervalId.value = null;
    }
  };

  const stopTaipeiFCenteringAutoAdvance = () => {
    stopTaipeiFCenteringAutoTimerOnly();
    taipeiFCenteringAutoSummary.value = '';
    dataStore.setHighlightedBlackStation(null);
  };

  /** 向心：處理目前索引那一顆黑點（自動／手動共用） */
  const runTaipeiFCenteringSingleTick = () => {
    const layer = currentLayer.value;
    if (
      !layer ||
      !isTaipeiTestFLayerTab(layer.layerId) ||
      !layer.spaceNetworkGridJsonData?.length
    ) {
      stopTaipeiFCenteringAutoAdvance();
      return;
    }

    const probe = probeLineStationCentering(layer);
    if (!probe.ok) {
      taipeiFCenteringAutoSummary.value =
        probe.reason === 'no_bounds' ? '無法取得示意圖邊界，已停止' : '無路段鄰接圖，已停止';
      stopTaipeiFCenteringAutoAdvance();
      return;
    }
    const n = probe.rowCount;
    if (n === 0) {
      taipeiFCenteringAutoSummary.value = '無黑點站，已停止';
      stopTaipeiFCenteringAutoAdvance();
      return;
    }

    const idx = ((taipeiFCenteringAutoStationIndex.value % n) + n) % n;

    if (idx === 0) {
      taipeiFCenteringAutoRoundMoves.value = 0;
    }

    const r = stepOneLineStationTowardSchematicCenter(layer, idx);
    if (!r.ok) {
      taipeiFCenteringAutoSummary.value =
        r.reason === 'no_bounds' ? '無法取得示意圖邊界，已停止' : '無路段鄰接圖，已停止';
      stopTaipeiFCenteringAutoAdvance();
      return;
    }

    if (r.moved) {
      taipeiFCenteringAutoRoundMoves.value += 1;
    }

    const hbAfter = { layerId: layer.layerId, x: r.highlightX, y: r.highlightY };
    if (r.stationId != null && String(r.stationId).trim() !== '') hbAfter.stationId = r.stationId;
    hbAfter.color = !r.moved ? '#f9a825' : r.isListedSectionStation ? '#c62828' : '#2e7d32';
    dataStore.setHighlightedBlackStation(hbAfter);

    const label = r.stationName ? r.stationName : '黑點';
    const scopeLabel = r.isListedSectionStation ? '清單路段' : '非清單路段';
    const sectionLabel = r.sectionRouteLabel ? ` · ${r.sectionRouteLabel}` : '';
    taipeiFCenteringAutoSummary.value = `(${idx + 1}/${n}) [${scopeLabel}]${sectionLabel} · ${label} ${r.moved ? '已位移' : r.canMove ? '暫時受阻' : '無法移動'} → (${Math.round(r.highlightX)},${Math.round(r.highlightY)})`;

    if (idx === n - 1 && taipeiFCenteringAutoRoundMoves.value === 0) {
      stopTaipeiFCenteringAutoTimerOnly();
      taipeiFCenteringAutoSummary.value = '本輪無位移（已停止自動／可再按「下一步」從頭掃）';
      taipeiFCenteringAutoStationIndex.value = 0;
      taipeiFCenteringAutoRoundMoves.value = 0;
      return;
    }

    taipeiFCenteringAutoStationIndex.value = (idx + 1) % n;
  };

  const tickTaipeiFCenteringAuto = () => {
    runTaipeiFCenteringSingleTick();
  };

  /** 手動：每按一次只執行一顆黑點（與自動相同順序，會停止進行中的自動計時） */
  const stepTaipeiFCenteringOnce = () => {
    stopTaipeiFCenteringAutoTimerOnly();
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    taipeiFColHighlightStep.value = -1;
    taipeiFRowHighlightStep.value = -1;
    dataStore.clearTaipeiFColRouteHighlight();
    dataStore.clearTaipeiFRowRouteHighlight();
    runTaipeiFCenteringSingleTick();
  };

  const toggleTaipeiFCenteringAutoAdvance = () => {
    if (taipeiFCenteringAutoIntervalId.value != null) {
      stopTaipeiFCenteringAutoAdvance();
      return;
    }
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    taipeiFColHighlightStep.value = -1;
    taipeiFRowHighlightStep.value = -1;
    dataStore.clearTaipeiFColRouteHighlight();
    dataStore.clearTaipeiFRowRouteHighlight();
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId) || !layer.spaceNetworkGridJsonData?.length)
      return;
    taipeiFCenteringAutoStationIndex.value = 0;
    taipeiFCenteringAutoRoundMoves.value = 0;
    tickTaipeiFCenteringAuto();
    taipeiFCenteringAutoIntervalId.value = setInterval(
      tickTaipeiFCenteringAuto,
      TAIPEI_F_AUTO_INTERVAL_MS
    );
  };

  // ── 紅點間路段（SectionData）專用黑點位移 ──────────────────────────────────
  const taipeiFSectionCenteringAutoIntervalId = ref(null);
  const taipeiFSectionCenteringStationIndex = ref(0);
  const taipeiFSectionCenteringRoundMoves = ref(0);
  const taipeiFSectionCenteringSummary = ref('');

  const stopTaipeiFSectionCenteringTimerOnly = () => {
    if (taipeiFSectionCenteringAutoIntervalId.value != null) {
      clearInterval(taipeiFSectionCenteringAutoIntervalId.value);
      taipeiFSectionCenteringAutoIntervalId.value = null;
    }
  };

  const stopTaipeiFSectionCenteringAuto = () => {
    stopTaipeiFSectionCenteringTimerOnly();
    taipeiFSectionCenteringSummary.value = '';
    dataStore.setHighlightedBlackStation(null);
  };

  const runTaipeiFSectionCenteringSingleTick = () => {
    const layer = currentLayer.value;
    if (
      !layer ||
      !isTaipeiTestFLayerTab(layer.layerId) ||
      !layer.spaceNetworkGridJsonData?.length
    ) {
      stopTaipeiFSectionCenteringAuto();
      return;
    }
    const idx = taipeiFSectionCenteringStationIndex.value;
    if (idx === 0) taipeiFSectionCenteringRoundMoves.value = 0;

    const r = stepOneSectionStationTowardSchematicCenter(layer, idx);
    if (!r.ok) {
      taipeiFSectionCenteringSummary.value =
        r.reason === 'no_bounds' ? '無法取得示意圖邊界' : '無路段鄰接圖';
      stopTaipeiFSectionCenteringAuto();
      return;
    }
    if (r.rowCount === 0) {
      taipeiFSectionCenteringSummary.value = '清單內無黑點站';
      stopTaipeiFSectionCenteringAuto();
      return;
    }

    if (r.moved) taipeiFSectionCenteringRoundMoves.value += 1;

    const hb = { layerId: layer.layerId, x: r.highlightX, y: r.highlightY };
    if (r.stationId != null && String(r.stationId).trim() !== '') hb.stationId = r.stationId;
    hb.color = r.moved ? '#c62828' : '#f9a825';
    dataStore.setHighlightedBlackStation(hb);

    const lbl = r.stationName || '黑點';
    const secLbl = r.sectionRouteLabel ? ` · ${r.sectionRouteLabel}` : '';
    taipeiFSectionCenteringSummary.value = `(${idx + 1}/${r.rowCount})${secLbl} · ${lbl} ${r.moved ? '已位移' : r.canMove ? '暫時受阻' : '無法移動'} → (${Math.round(r.highlightX)},${Math.round(r.highlightY)})`;

    const n = r.rowCount;
    if (idx === n - 1 && taipeiFSectionCenteringRoundMoves.value === 0) {
      stopTaipeiFSectionCenteringTimerOnly();
      taipeiFSectionCenteringSummary.value = '本輪無位移（可再按「下一步」從頭掃）';
      taipeiFSectionCenteringStationIndex.value = 0;
      taipeiFSectionCenteringRoundMoves.value = 0;
      return;
    }
    taipeiFSectionCenteringStationIndex.value = (idx + 1) % n;
  };

  const stepTaipeiFSectionCenteringOnce = () => {
    stopTaipeiFSectionCenteringTimerOnly();
    stopTaipeiFCenteringAutoTimerOnly();
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    taipeiFColHighlightStep.value = -1;
    taipeiFRowHighlightStep.value = -1;
    dataStore.clearTaipeiFColRouteHighlight();
    dataStore.clearTaipeiFRowRouteHighlight();
    runTaipeiFSectionCenteringSingleTick();
  };

  const toggleTaipeiFSectionCenteringAuto = () => {
    if (taipeiFSectionCenteringAutoIntervalId.value != null) {
      stopTaipeiFSectionCenteringAuto();
      return;
    }
    stopTaipeiFCenteringAutoAdvance();
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    taipeiFColHighlightStep.value = -1;
    taipeiFRowHighlightStep.value = -1;
    dataStore.clearTaipeiFColRouteHighlight();
    dataStore.clearTaipeiFRowRouteHighlight();
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId) || !layer.spaceNetworkGridJsonData?.length)
      return;
    taipeiFSectionCenteringStationIndex.value = 0;
    taipeiFSectionCenteringRoundMoves.value = 0;
    runTaipeiFSectionCenteringSingleTick();
    taipeiFSectionCenteringAutoIntervalId.value = setInterval(
      runTaipeiFSectionCenteringSingleTick,
      TAIPEI_F_AUTO_INTERVAL_MS
    );
  };
  // ─────────────────────────────────────────────────────────────────────────

  const toggleTaipeiFAutoAdvance = (axis) => {
    if (axis === 'col') {
      if (taipeiFColAutoIntervalId.value != null) {
        stopTaipeiFColAutoAdvance();
        return;
      }
      stopTaipeiFRowAutoAdvance();
      stopTaipeiFCenteringAutoAdvance();
      const layer = currentLayer.value;
      if (!layer || !isTaipeiTestFLayerTab(layer.layerId)) return;
      advanceTaipeiFColHighlight();
      taipeiFColAutoIntervalId.value = setInterval(
        () => advanceTaipeiFColHighlight(),
        TAIPEI_F_AUTO_INTERVAL_MS
      );
      return;
    }
    if (axis !== 'row') return;
    if (taipeiFRowAutoIntervalId.value != null) {
      stopTaipeiFRowAutoAdvance();
      return;
    }
    stopTaipeiFColAutoAdvance();
    stopTaipeiFCenteringAutoAdvance();
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId)) return;
    advanceTaipeiFRowHighlight();
    taipeiFRowAutoIntervalId.value = setInterval(
      () => advanceTaipeiFRowHighlight(),
      TAIPEI_F_AUTO_INTERVAL_MS
    );
  };

  watch(currentLayer, () => {
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    stopTaipeiFCenteringAutoAdvance();
    stopTaipeiFSectionCenteringAuto();
    stopJsonGridFromCoordVertexAuto();
    stopLineOrthoTowardCrossAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawDiagonalRouteAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawLShapeAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawUnitL45Auto();
  });

  onUnmounted(() => {
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    stopTaipeiFCenteringAutoAdvance();
    stopTaipeiFSectionCenteringAuto();
    stopJsonGridFromCoordVertexAuto();
    stopLineOrthoTowardCrossAuto();
    stopRbConnectAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawDiagonalRouteAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawLShapeAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawUnitL45Auto();
  });

  /** 黑點站向示意圖幾何中心（藍虛線）靠攏；僅更新黑點格座標，不修改折線轉折 */
  const runTaipeiFLineStationsTowardSchematicCenter = () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId) || !layer.spaceNetworkGridJsonData?.length)
      return;
    stopTaipeiFCenteringAutoAdvance();
    stopTaipeiFSectionCenteringAuto();
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    taipeiFColHighlightStep.value = -1;
    taipeiFRowHighlightStep.value = -1;
    dataStore.clearTaipeiFColRouteHighlight();
    dataStore.clearTaipeiFRowRouteHighlight();
    const stats = runLineStationsTowardSchematicCenter(layer);
    layer.dashboardData = {
      ...(typeof layer.dashboardData === 'object' && layer.dashboardData
        ? layer.dashboardData
        : {}),
      centeringTowardSchematicWithRoutes: stats,
    };
  };

  /** 僅清單路段黑點：外層輪重複至該子集無人可動（與向心一鍵相同收斂條件，僅篩選對象不同） */
  const runTaipeiFListedSectionStationsTowardSchematicCenterComplete = () => {
    const layer = currentLayer.value;
    if (!layer || !isTaipeiTestFLayerTab(layer.layerId) || !layer.spaceNetworkGridJsonData?.length)
      return;
    stopTaipeiFCenteringAutoAdvance();
    stopTaipeiFSectionCenteringAuto();
    stopTaipeiFColAutoAdvance();
    stopTaipeiFRowAutoAdvance();
    taipeiFColHighlightStep.value = -1;
    taipeiFRowHighlightStep.value = -1;
    dataStore.clearTaipeiFColRouteHighlight();
    dataStore.clearTaipeiFRowRouteHighlight();
    const stats = runListedSectionStationsTowardSchematicCenter(layer);
    layer.dashboardData = {
      ...(typeof layer.dashboardData === 'object' && layer.dashboardData
        ? layer.dashboardData
        : {}),
      centeringTowardSchematicListedSection: stats,
    };
  };

  watch(
    () => currentLayer.value?.layerId,
    (id) => {
      if (!isTaipeiTestFLayerTab(id)) {
        taipeiFColHighlightStep.value = -1;
        taipeiFRowHighlightStep.value = -1;
        dataStore.clearTaipeiFColRouteHighlight();
        dataStore.clearTaipeiFRowRouteHighlight();
        stopTaipeiFCenteringAutoAdvance();
      }
    }
  );

  const unwrapLayoutTest3Routes = () => {
    const d = currentLayer.value?.layoutGridJsonData_Test3;
    if (!d) return null;
    if (Array.isArray(d)) return d;
    if (typeof d === 'object' && Array.isArray(d.routes)) return d.routes;
    return null;
  };

  /** test2：操作 tab 改動 Test3 版面後，同步空間網路分頁用的 routes */
  const syncSpaceNetworkFromTest2Layout = () => {
    if (currentLayer.value?.layerId !== 'taipei_6_1_test2') return;
    const routes = unwrapLayoutTest3Routes();
    if (!routes) return;
    currentLayer.value.spaceNetworkGridJsonData = JSON.parse(JSON.stringify(routes));
  };

  /** test3／test4：改動 Test4 版面後同步 spaceNetworkGridJsonData */
  const syncSpaceNetworkFromTest3Layout = () => {
    const id = currentLayer.value?.layerId;
    if (!isTaipei6_1Test3Or4LayerId(id)) return;
    const layout = currentLayer.value.layoutGridJsonData_Test4;
    if (!Array.isArray(layout)) return;
    currentLayer.value.spaceNetworkGridJsonData = JSON.parse(JSON.stringify(layout));
  };

  /** 執行下一步：具 geojson／layout／space 路網；k3 另認分頁專用路網欄位 */
  const currentLayerHasExecuteInputData = computed(() => {
    const layer = currentLayer.value;
    if (!layer) return false;
    if (
      layer.layerId === 'taipei_a4' ||
      layer.layerId === 'taipei_b4' ||
      layer.layerId === 'taipei_c4'
    ) {
      const hasK3Tab =
        Array.isArray(layer.spaceNetworkGridJsonDataK3Tab) &&
        layer.spaceNetworkGridJsonDataK3Tab.length > 0;
      const hasSn =
        Array.isArray(layer.spaceNetworkGridJsonData) && layer.spaceNetworkGridJsonData.length > 0;
      return !!(layer.geojsonData || layer.layoutGridJsonData || hasSn || hasK3Tab);
    }
    if (layer.layerId?.startsWith('schematic_')) {
      // 輸入取自上游 osm_2_geojson_2_json；本層初始無資料，按鈕恆可按，
      // 真正的「上游是否已載入」前置檢查在 executeFunction 內處理並回報。
      return true;
    }
    return !!(layer.geojsonData || layer.layoutGridJsonData || layer.spaceNetworkGridJsonData);
  });

  const controlExecuteNextDisabled = computed(() => {
    return !currentLayerHasExecuteInputData.value;
  });

  /** taipei_d3／JSON·網格·座標正規化：c3→d3 結果（dashboard 由對應 execute 寫入） */
  const taipeiD3CoordNormalizeReport = computed(() => {
    const layer = currentLayer.value;
    const d = layer?.dashboardData;
    if (
      (layer?.layerId !== 'taipei_d3' &&
        layer?.layerId !== 'json_grid_coord_normalized') ||
      !d?.coordNormalize ||
      !d.gridSizeCells
    )
      return null;
    return d;
  });

  /**
   * taipei_e3：僅「路網上有連線」之 connect–connect 邊（同一路段 points 上相鄰兩格皆為 connect）；
   * 紅＝路網 degree≥2，藍＝degree≤1。角度採離散標註（與路網僅水平／垂直／斜向一致）：
   * 水平與垂直皆 0°；左上–右下、右上–左下等斜向（|Δx| 與 |Δy| 皆 >0）皆 45°。無向邊去重；起迄依格鍵排序。
   */
  const taipeiE3RedBluePairsAngleReport = computed(() => {
    const layer = currentLayer.value;
    if (layer?.layerId !== 'taipei_e3' || !Array.isArray(layer.spaceNetworkGridJsonData)) {
      return null;
    }
    const segments = layer.spaceNetworkGridJsonData;
    if (segments.length === 0) return { rows: [], points: [] };

    const hasValue = (v) => v !== undefined && v !== null;
    const getXY = (pt) =>
      Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : [Number(pt?.x ?? 0), Number(pt?.y ?? 0)];
    const ptKey = (x, y) => `${Math.round(Number(x))},${Math.round(Number(y))}`;

    const isConnectAt = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};
      const nodeType =
        node?.node_type ||
        ptProps?.node_type ||
        tags?.node_type ||
        (hasValue(node?.connect_number) ? 'connect' : '');
      const hasConnectNumber =
        hasValue(node?.connect_number) ||
        hasValue(tags?.connect_number) ||
        hasValue(ptProps?.connect_number) ||
        hasValue(ptProps?.tags?.connect_number);
      return nodeType === 'connect' || hasConnectNumber;
    };

    const connectNumberAt = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};
      const cn =
        node?.connect_number ??
        tags?.connect_number ??
        ptProps?.connect_number ??
        ptProps?.tags?.connect_number;
      return hasValue(cn) ? String(cn) : '';
    };

    const stationNameAt = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};
      const raw =
        node?.station_name ||
        ptProps?.station_name ||
        tags?.station_name ||
        node?.tags?.name ||
        tags?.name ||
        ptProps?.name ||
        '';
      const s = String(raw).trim();
      return s === '—' || s === '－' ? '' : s;
    };

    const nameByGridKey = new Map();
    const nameByConnectNumber = new Map();
    const cd = layer.spaceNetworkGridJsonData_ConnectData;
    if (Array.isArray(cd)) {
      for (const c of cd) {
        if (!c) continue;
        const xg = Number(c.x_grid ?? c.tags?.x_grid);
        const yg = Number(c.y_grid ?? c.tags?.y_grid);
        if (Number.isFinite(xg) && Number.isFinite(yg)) {
          const gk = ptKey(xg, yg);
          const nm = (c.station_name ?? c.tags?.station_name ?? c.tags?.name ?? '')
            .toString()
            .trim();
          if (nm && nm !== '—' && nm !== '－' && !nameByGridKey.has(gk)) nameByGridKey.set(gk, nm);
        }
        const cnum = c.connect_number ?? c.tags?.connect_number;
        if (hasValue(cnum)) {
          const cks = String(cnum);
          const nm = (c.station_name ?? c.tags?.station_name ?? c.tags?.name ?? '')
            .toString()
            .trim();
          if (nm && nm !== '—' && nm !== '－' && !nameByConnectNumber.has(cks)) {
            nameByConnectNumber.set(cks, nm);
          }
        }
      }
    }

    const resolveStationName = (seg, idx, gridKey, cnStr) => {
      let nm = stationNameAt(seg, idx);
      if (!nm) nm = nameByGridKey.get(gridKey) || '';
      if (!nm && cnStr) nm = nameByConnectNumber.get(cnStr) || '';
      return nm;
    };

    const degreeMap = new Map();
    for (const seg of segments) {
      const pts = seg.points || [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = getXY(pts[i]);
        const [bx, by] = getXY(pts[i + 1]);
        const k1 = ptKey(ax, ay);
        const k2 = ptKey(bx, by);
        if (k1 === k2) continue;
        degreeMap.set(k1, (degreeMap.get(k1) || 0) + 1);
        degreeMap.set(k2, (degreeMap.get(k2) || 0) + 1);
      }
    }

    const connectByKey = new Map();
    for (const seg of segments) {
      const pts = seg.points || [];
      for (let idx = 0; idx < pts.length; idx++) {
        if (!isConnectAt(seg, idx)) continue;
        const [x, y] = getXY(pts[idx]);
        const key = ptKey(x, y);
        const deg = degreeMap.get(key) || 0;
        const rb = deg >= 2 ? '紅' : '藍';
        const cn = connectNumberAt(seg, idx);
        const stationName = resolveStationName(seg, idx, key, cn);
        if (!connectByKey.has(key)) {
          connectByKey.set(key, {
            key,
            x: Math.round(x),
            y: Math.round(y),
            rb,
            degree: deg,
            connectNumber: cn,
            stationName,
          });
        } else {
          const ex = connectByKey.get(key);
          if (!ex.stationName && stationName) ex.stationName = stationName;
          if (!ex.connectNumber && cn) ex.connectNumber = cn;
        }
      }
    }

    const points = Array.from(connectByKey.values());

    const vertexAt = (seg, idx) => {
      const [x, y] = getXY(seg.points[idx]);
      const key = ptKey(x, y);
      const found = connectByKey.get(key);
      if (found) return found;
      const deg = degreeMap.get(key) || 0;
      const cn = connectNumberAt(seg, idx);
      return {
        key,
        x: Math.round(x),
        y: Math.round(y),
        rb: deg >= 2 ? '紅' : '藍',
        degree: deg,
        connectNumber: cn,
        stationName: resolveStationName(seg, idx, key, cn),
      };
    };

    /** 水平、垂直 → 0°；斜向（|Δx|、|Δy| 皆 >0）→ 45° */
    const discreteEdgeAngleDeg = (dx, dy) => {
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx === 0 && ady === 0) return null;
      if (adx === 0 || ady === 0) return 0;
      return 45;
    };

    const seenUndirectedEdge = new Set();
    const rows = [];
    for (const seg of segments) {
      const pts = seg.points || [];
      for (let i = 0; i < pts.length - 1; i++) {
        if (!isConnectAt(seg, i) || !isConnectAt(seg, i + 1)) continue;
        const a = vertexAt(seg, i);
        const b = vertexAt(seg, i + 1);
        const uk = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
        if (seenUndirectedEdge.has(uk)) continue;
        seenUndirectedEdge.add(uk);
        const from = a.key <= b.key ? a : b;
        const to = a.key <= b.key ? b : a;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angleDeg = discreteEdgeAngleDeg(dx, dy);
        if (angleDeg == null) continue;
        rows.push({
          angleDeg,
          from,
          to,
          dx,
          dy,
          dist: Math.abs(dx) + Math.abs(dy),
        });
      }
    }

    rows.sort((u, v) => {
      if (u.angleDeg !== v.angleDeg) return u.angleDeg - v.angleDeg;
      if (u.dist !== v.dist) return u.dist - v.dist;
      return `${u.from.key}->${u.to.key}`.localeCompare(`${v.from.key}->${v.to.key}`);
    });

    return { rows, points };
  });

  /** 目前圖層：路段車站節點（不含純幾何轉折；與地圖 isRealStation 一致）；支援扁平或 2-5 式 routes */
  const layerSegmentStationNodesReport = computed(() => {
    const layer = currentLayer.value;
    if (!layer) return null;
    /** 僅 OSM/XML→GeoJSON 與衍生 JSON，無空間網格路段資料 */
    if (layer.layerId === OSM_2_GEOJSON_2_JSON_LAYER_ID) return null;
    /** k／k4／l／m：黑點相銜權重改見 Data 分頁 dataTableData，此處不列節點清單 */
    if (
      layer.layerId === 'taipei_a4' ||
      layer.layerId === 'taipei_b4' ||
      layer.layerId === 'taipei_c4'
    ) {
      return null;
    }
    if (!layer.isLoaded) {
      return {
        layerId: layer.layerId,
        layerName: layer.layerName ?? layer.layerId,
        flatSegmentCount: 0,
        segments: [],
        notLoaded: true,
        noSpaceNetwork: false,
      };
    }
    if (layer.spaceNetworkGridJsonData == null) {
      return {
        layerId: layer.layerId,
        layerName: layer.layerName ?? layer.layerId,
        flatSegmentCount: 0,
        segments: [],
        notLoaded: false,
        noSpaceNetwork: true,
      };
    }
    const segs = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData);
    if (!Array.isArray(segs) || segs.length === 0) {
      return {
        layerId: layer.layerId,
        layerName: layer.layerName ?? layer.layerId,
        flatSegmentCount: 0,
        segments: [],
        notLoaded: false,
        noSpaceNetwork: false,
      };
    }

    const fmt = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '?';
      return Number.isInteger(n * 2) ? String(n) : n.toFixed(4);
    };

    const exportRowPerSeg = mapFlatSegmentsToExportRowsOrNull(segs);

    const isStationNode = (node) => {
      if (!node || typeof node !== 'object') return false;
      const nodeType = node.node_type ?? 'line';
      if (nodeType === 'connect') return true;
      const sname = (node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? '').trim();
      const sid = (node.station_id ?? node.tags?.station_id ?? '').toString().trim();
      if (sname || sid) return true;
      return Boolean(node.tags?._forceDrawBlackDot);
    };

    const segments = segs
      .map((seg, segIdx) => {
        const routeName = seg.route_name ?? seg.name ?? '未知路線';
        const pts = seg.points ?? [];
        const nodes = seg.nodes ?? [];
        const exportRow = exportRowPerSeg[segIdx] ?? null;
        let stationNodes = exportRow ? exportRowToControlStationNodes(exportRow, pts, fmt) : [];
        if (stationNodes.length === 0) {
          for (let i = 0; i < pts.length; i++) {
            const node = nodes[i] ?? null;
            if (!isStationNode(node)) continue;
            const pt = pts[i];
            const x = Array.isArray(pt) ? pt[0] : pt?.x;
            const y = Array.isArray(pt) ? pt[1] : pt?.y;
            const nodeType = node?.node_type ?? 'line';
            const sname = (
              node?.station_name ??
              node?.tags?.station_name ??
              node?.tags?.name ??
              ''
            ).trim();
            const sid = (node?.station_id ?? node?.tags?.station_id ?? '').toString().trim();
            stationNodes.push({
              idx: i,
              x: fmt(x),
              y: fmt(y),
              nodeType,
              stationName: sname,
              stationId: sid,
            });
          }
        }
        return {
          segIdx: segIdx + 1,
          routeName,
          stationNodes,
          a3Correspondence: null,
        };
      })
      .filter((s) => s.stationNodes.length > 0);

    return {
      layerId: layer.layerId,
      layerName: layer.layerName ?? layer.layerId,
      flatSegmentCount: segs.length,
      segments,
      notLoaded: false,
      noSpaceNetwork: false,
    };
  });

  /** 網格正規化／結果圖層：顯示紅點＋黑點最小水平／垂直間距 */
  const isGridNormStationMetricsLayer = computed(() => {
    const id = currentLayer.value?.layerId;
    return isTaipeiTestGridNormLayerTab(id);
  });

  /** 疊加縮減預覽：自動「下一步」 */
  const isOverlayShrinkAutoRunning = ref(false);
  let overlayShrinkAutoHighlightTimer = null;

  /** 疊加縮減預覽：逐步高亮「會保留」的欄／列（b→c 未套用前） */
  const overlayShrinkPreviewPlanLength = computed(() => {
    const p = currentLayer.value?.overlayShrinkStepPlan;
    return Array.isArray(p) ? p.length : 0;
  });

  const advanceOverlayShrinkHighlight = () => {
    const layer = currentLayer.value;
    if (!layer?.overlayShrinkApplyPending || !layer.overlayShrinkStepPlan?.length) return;
    const plan = layer.overlayShrinkStepPlan;
    let idx = (layer.overlayShrinkStepIndex ?? -1) + 1;
    if (idx >= plan.length) idx = 0;
    layer.overlayShrinkStepIndex = idx;
    const step = plan[idx];
    dataStore.setHighlightedOverlayShrinkStrip({
      layerId: layer.layerId,
      kind: step.kind,
      index: step.index,
    });
  };

  /** 自動執行：每 0.1 秒下一步（點擊切換開／關） */
  const runOverlayShrinkAutoHighlight = () => {
    if (overlayShrinkAutoHighlightTimer) {
      clearInterval(overlayShrinkAutoHighlightTimer);
      overlayShrinkAutoHighlightTimer = null;
      isOverlayShrinkAutoRunning.value = false;
      return;
    }
    if (!currentLayer.value?.overlayShrinkApplyPending || !overlayShrinkPreviewPlanLength.value)
      return;
    isOverlayShrinkAutoRunning.value = true;
    overlayShrinkAutoHighlightTimer = setInterval(advanceOverlayShrinkHighlight, 100);
  };

  const applyTaipeiCOverlayShrink = async () => {
    if (overlayShrinkAutoHighlightTimer) {
      clearInterval(overlayShrinkAutoHighlightTimer);
      overlayShrinkAutoHighlightTimer = null;
      isOverlayShrinkAutoRunning.value = false;
    }
    const tab = activeLayerTab.value;
    if (!isTaipeiTestCLayerTab(tab)) return;
    const layer = dataStore.findLayerById(tab);
    if (!layer?.spaceNetworkGridJsonData) return;
    applyOverlayNormalizedGridCoordinates(layer);
    const repNorm = computeGridStationMinAxisDistances(layer);
    if (repNorm.minWidth != null && repNorm.minHeight != null && repNorm.pointCount >= 2) {
      layer.minSpacingOverlayCell = { cellW: repNorm.minWidth, cellH: repNorm.minHeight };
    } else {
      layer.minSpacingOverlayCell = null;
    }
    await nextTick();
  };

  /** 切換圖層時：離開清除 highlight；進入 taipei_c 且有黑點時設 highlight */
  watch(
    () => activeLayerTab.value,
    (tab) => {
      if (overlayShrinkAutoHighlightTimer) {
        clearInterval(overlayShrinkAutoHighlightTimer);
        overlayShrinkAutoHighlightTimer = null;
        isOverlayShrinkAutoRunning.value = false;
      }
      if (!isTaipeiTestCLayerTab(tab)) {
        dataStore.setHighlightedBlackStation(null);
        dataStore.setHighlightedOverlayShrinkStrip(null);
        return;
      }
      const rows = gridNormBlackStationRows.value;
      if (rows.length > 0) {
        const row = rows[0];
        dataStore.setHighlightedBlackStation({
          layerId: tab,
          x: row.x,
          y: row.y,
          stationId: row.meta?.station_id ?? row.meta?.tags?.station_id ?? null,
        });
      } else {
        dataStore.setHighlightedBlackStation(null);
      }
    },
    { immediate: true }
  );

  /**
   * 示意圖管線串接：MILP結果正規化 → 先橫後直 → 先直後橫 → connect 拉直。
   * 啟用某層時自動自其「上游」抓目前結果顯示；上游內容變更（簽章不同）→ 重抓，否則保留本層既有操作結果。
   */
  const SCHEMATIC_CHAIN_UPSTREAM = {
    schematic_toward_center_hv: 'schematic_milp_read',
    schematic_toward_center_vh: 'schematic_toward_center_hv',
    schematic_milp_straighten: 'schematic_toward_center_vh',
    // 路線圖調整（RMA）示意圖管線：MILP結果正規化（RMA）→ 先橫後直 → 先直後橫
    schematic_rma_toward_center_hv: 'schematic_rma_milp_read',
    schematic_rma_toward_center_vh: 'schematic_rma_toward_center_hv',
  };
  /** 路網內容廉價簽章：段數:總點數:座標雜湊（供「上游是否變更」判斷）。 */
  const cheapSegSig = (segs) => {
    if (!Array.isArray(segs)) return '0';
    let pts = 0;
    let acc = 0;
    for (const s of segs) {
      const p = Array.isArray(s?.points) ? s.points : [];
      pts += p.length;
      for (const q of p) {
        const x = Math.round(Number(Array.isArray(q) ? q[0] : q?.x)) || 0;
        const y = Math.round(Number(Array.isArray(q) ? q[1] : q?.y)) || 0;
        acc = (acc + x * 73856093 + y * 19349663) | 0;
      }
    }
    return `${segs.length}:${pts}:${acc}`;
  };
  /**
   * 確保 layerId 已自上游鏈抓取（遞迴向上）；上游未變更則保留本層結果。
   * 黑點站處理：HV/VH 兩層**只存 connect 骨架**（黑點站抽離成 metadata `schematicBlackSections` 隨鏈傳遞，
   * 不參與、不顯示）；到 connect 拉直（最後）才用該 metadata 把黑點站**平均沿線放回**。
   */
  const ensureSchematicChainSeeded = (layerId) => {
    const srcId = SCHEMATIC_CHAIN_UPSTREAM[layerId];
    if (!srcId) return; // 鏈頂（MILP結果正規化）由自身座標正規化產生
    ensureSchematicChainSeeded(srcId);
    const lyr = dataStore.findLayerById(layerId);
    const src = dataStore.findLayerById(srcId);
    if (!lyr || !src) return;
    const srcData = src.spaceNetworkGridJsonData;
    if (!Array.isArray(srcData) || srcData.length === 0) return; // 上游尚無結果
    const sig = cheapSegSig(srcData);
    const has = Array.isArray(lyr.spaceNetworkGridJsonData) && lyr.spaceNetworkGridJsonData.length > 0;
    if (has && lyr.seededFromSig === sig) return; // 上游未變、已有資料 → 保留本層（含已操作結果）

    if (layerId === 'schematic_toward_center_hv' || layerId === 'schematic_rma_toward_center_hv') {
      // 上游＝MILP結果正規化（含黑點）：抽離黑點 → 只存骨架；黑點 sections 存 metadata 隨鏈傳遞。
      const full = normalizeSpaceNetworkDataToFlatSegments(JSON.parse(JSON.stringify(srcData)));
      const { skeleton, sections } = milpReadFlatToSkeleton(full);
      lyr.schematicBlackSections = sections;
      applyConnectStraightenSegmentsToLayer(lyr, skeleton);
    } else if (layerId === 'schematic_toward_center_vh' || layerId === 'schematic_rma_toward_center_vh') {
      // 上游＝先橫後直（已是骨架）：複製骨架；沿用其黑點 sections metadata。
      lyr.schematicBlackSections = src.schematicBlackSections || [];
      applyConnectStraightenSegmentsToLayer(lyr, JSON.parse(JSON.stringify(srcData)));
    } else if (layerId === 'schematic_milp_straighten') {
      // 最後一層：用上游骨架＋黑點 sections metadata，把黑點站**平均沿線放回**，再做 connect 拉直。
      const skel = normalizeSpaceNetworkDataToFlatSegments(JSON.parse(JSON.stringify(srcData)));
      const sections = src.schematicBlackSections || [];
      const full = sections.length === skel.length ? reinsertBlackStations(skel, sections) : skel;
      applyConnectStraightenSegmentsToLayer(lyr, full);
      milpReadStep.value = -1;
      milpReadStepInfo.value = '';
      lyr.connectStraightenHighlightCell = null;
      lyr.connectStraightenMovePreview = null;
    } else {
      applyConnectStraightenSegmentsToLayer(lyr, JSON.parse(JSON.stringify(srcData)));
    }
    lyr.seededFromSig = sig;
  };
  watch(
    () => activeLayerTab.value,
    async (tab) => {
      // 路網網格（RMA）：切到該分頁時自 RMA「先直後橫」重抓（來源變更才重建，保留已套用之流量）
      if (isRmaLayoutNetworkGridFromVhDrawLayerId(tab)) {
        try {
          refreshRmaLayoutNetworkGridFromVhIfVisible(
            dataStore.findLayerById.bind(dataStore),
            dataStore.saveLayerState.bind(dataStore),
            tab
          );
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('路網網格（RMA）：自上游抓取失敗', e);
        }
        await nextTick();
        dataStore.requestSpaceNetworkGridFullRedraw();
        return;
      }
      if (!SCHEMATIC_CHAIN_UPSTREAM[tab]) return;
      try {
        ensureSchematicChainSeeded(tab);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('示意圖管線串接：自動抓取上游失敗', e);
        return;
      }
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
    },
    { immediate: true }
  );

  const gridStationMinAxisReport = computed(() => {
    if (!isGridNormStationMetricsLayer.value || !currentLayer.value) return null;
    return computeGridStationMinAxisDistances(currentLayer.value);
  });

  /** b→c 四等分疊加網格（execute_b_to_c_test 寫入 dashboardData） */
  const overlayQuadSubdivideInfo = computed(
    () => currentLayer.value?.dashboardData?.overlayQuadSubdivide ?? null
  );

  /** 與 gridNormalizationMinDistance 之 station 鍵一致，供 taipei_b 對照「疊加網格前」座標 */
  const blackStationPlacementLookupKey = (p) => {
    const id = p.meta?.station_id ?? p.meta?.tags?.station_id;
    if (id != null && String(id).trim() !== '') return `id:${String(id).trim()}`;
    const nm = String(p.name ?? '')
      .trim()
      .replace(/^—$/, '')
      .replace(/^－$/, '');
    return nm ? `name:${nm}` : `pos:${p.name}|${Number(p.x).toFixed(5)},${Number(p.y).toFixed(5)}`;
  };

  /** 網格正規化（taipei_c／d／e）：黑點刪減後座標＝ StationData x_grid,y_grid（與 JSON 一致，不依路段重算） */
  const gridNormBlackStationRows = computed(() => {
    if (!isGridNormStationMetricsLayer.value || !currentLayer.value) return [];

    const bId = getTaipeiTestLayerBForGridNormLayer(currentLayer.value.layerId);
    const layerB = bId ? dataStore.findLayerById(bId) : null;
    const preMap = new Map();
    if (
      layerB &&
      Array.isArray(layerB.spaceNetworkGridJsonData) &&
      layerB.spaceNetworkGridJsonData.length &&
      Array.isArray(layerB.spaceNetworkGridJsonData_ConnectData) &&
      Array.isArray(layerB.spaceNetworkGridJsonData_SectionData)
    ) {
      const rawB = collectStationPlacementPoints(layerB).filter((p) => p.kind === 'station');
      const seenB = new Set();
      for (const p of rawB) {
        const key = blackStationPlacementLookupKey(p);
        if (seenB.has(key)) continue;
        seenB.add(key);
        preMap.set(key, { x: p.x, y: p.y });
      }
    }

    const rows = collectLineStationGridPointsFromStationData(
      currentLayer.value.spaceNetworkGridJsonData_StationData
    );
    const bounds = getSchematicPlotBoundsFromLayer(currentLayer.value);
    return rows.map((row) => {
      const lk = blackStationPlacementLookupKey(row);
      const pre = preMap.get(lk) ?? null;
      const base = {
        ...row,
        preOverlayX: pre?.x ?? null,
        preOverlayY: pre?.y ?? null,
      };
      if (!bounds) {
        return { ...base, towardCenterLabel: '—' };
      }
      const [px, py] = mapNetworkToSchematicPlotXY(currentLayer.value, row.x, row.y);
      return {
        ...base,
        towardCenterLabel: towardCenterMoveLabel(
          px,
          py,
          bounds.centerX,
          bounds.centerY,
          !!row.seg_is_h,
          !!row.seg_is_v
        ),
      };
    });
  });

  const gridNormCompanionBLayerId = computed(
    () => getTaipeiTestLayerBForGridNormLayer(currentLayer.value?.layerId) ?? 'taipei_b'
  );

  /** 黑點一覽表格列高亮：與地圖上目前 highlight 的黑點一致（僅 taipei_c） */
  const isTaipeiCBlackRowTableActive = (row) => {
    const lid = currentLayer.value?.layerId;
    if (!isTaipeiTestCLayerTab(lid)) return false;
    const h = dataStore.highlightedBlackStation;
    return !!(h && h.layerId === lid && h.x === row.x && h.y === row.y);
  };

  const fmtGridXY = (x, y) => {
    const fx = Number(x);
    const fy = Number(y);
    const xs = Number.isFinite(fx) ? fx.toFixed(2) : String(x);
    const ys = Number.isFinite(fy) ? fy.toFixed(2) : String(y);
    return `(${xs}, ${ys})`;
  };

  /** taipei_c：整數座標顯示整數；非整數保留兩位，避免不同黑點看似重疊 */
  const fmtGridNormCoord = (x, y) => {
    if (isTaipeiTestCLayerTab(currentLayer.value?.layerId)) {
      const fx = Number(x);
      const fy = Number(y);
      const nearInt = (v) => Number.isFinite(v) && Math.abs(v - Math.round(v)) < 1e-6;
      const xs = nearInt(fx) ? String(Math.round(fx)) : fx.toFixed(2);
      const ys = nearInt(fy) ? String(Math.round(fy)) : fy.toFixed(2);
      return `(${xs}, ${ys})`;
    }
    return fmtGridXY(x, y);
  };

  /**
   * 黑點表兩欄：列表／JSON 在套用縮減後已是「刪減後」座標，須用 gridTooltipMaps 還原「縮減前」疊加格。
   * overlayReducedTooltipPair：若輸入為塌縮後索引則 overlay＝刪空前、reduced＝輸入；若輸入為疊加大座標則相反。
   */
  const fmtBlackStationCoordBeforeRemoval = (row) => {
    const gm = currentLayer.value?.gridTooltipMaps;
    const ix = Math.round(Number(row.x));
    const iy = Math.round(Number(row.y));
    if (!gm?.collapseSortedX?.length || !gm?.collapseSortedY?.length) {
      return fmtGridNormCoord(ix, iy);
    }
    const pair = overlayReducedTooltipPair(ix, iy, gm);
    if (pair.overlay != null) {
      return fmtGridNormCoord(pair.overlay[0], pair.overlay[1]);
    }
    return fmtGridNormCoord(ix, iy);
  };

  const fmtBlackStationCoordAfterRemoval = (row) => {
    const gm = currentLayer.value?.gridTooltipMaps;
    const ix = Math.round(Number(row.x));
    const iy = Math.round(Number(row.y));
    if (!gm?.collapseSortedX?.length || !gm?.collapseSortedY?.length) {
      return fmtGridNormCoord(ix, iy);
    }
    const pair = overlayReducedTooltipPair(ix, iy, gm);
    return fmtGridNormCoord(pair.reduced[0], pair.reduced[1]);
  };

  /** taipei_b 層、尚未做四等分／疊加塌縮前之示意座標（與弧長配置同源） */
  const fmtBlackStationCoordPreOverlay = (row) => {
    if (row.preOverlayX == null || row.preOverlayY == null) return '—';
    return fmtGridXY(row.preOverlayX, row.preOverlayY);
  };

  /** taipei_c：最小軸向間距在疊加格上為整數格寬／高 */
  const fmtMinAxisDelta = (n) => {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    const v = Number(n);
    if (isTaipeiTestCLayerTab(currentLayer.value?.layerId)) return String(Math.round(v));
    return v.toFixed(4);
  };

  watch(
    activeLayerTab,
    (tab) => {
      lastFlippedConnectPoints.value = {};
      dataStore.setControlActiveLayerId(tab ?? null);
    },
    { immediate: true }
  );

  /**
   * 手繪「執行下一步」等由 store 指定圖層時，同步本頁選取；否則 activeLayerTab 仍停在 network_draw_sketch
   * 會在下一輪把 controlActiveLayerId 覆寫回去，導致網格分頁無法切到手繪匯出所指定的圖層。
   */
  watch(
    () => dataStore.controlActiveLayerId,
    (id) => {
      if (!id || activeLayerTab.value === id) return;
      if (
        !Array.isArray(visibleLayers.value) ||
        !visibleLayers.value.some((l) => l?.layerId === id)
      )
        return;
      activeLayerTab.value = id;
    }
  );

  /**
   * 📊 取得 LayoutGridTab_Test3 當前尺寸 (Get LayoutGridTab_Test3 Current Dimensions)
   * 從 dataStore 中獲取 LayoutGridTab_Test3 的當前尺寸（以 pt 為單位）
   *
   * @type {ComputedRef<{x: number, y: number}>}
   * @returns {{x: number, y: number}} 當前尺寸的 x（寬度）和 y（高度）
   */
  const layoutGridTabTest3Dimensions = computed(() => {
    return dataStore.layoutGridTabTest3Dimensions;
  });

  /**
   * 📊 取得 LayoutGridTab_Test3 網格最小尺寸 (Get LayoutGridTab_Test3 Min Cell Dimensions)
   * 從 dataStore 中獲取 LayoutGridTab_Test3 的網格最小尺寸（以 pt 為單位）
   *
   * @type {ComputedRef<{minWidth: number, minHeight: number}>}
   * @returns {{minWidth: number, minHeight: number}} 最小寬度和最小高度
   */
  const layoutGridTabTest3MinCellDimensions = computed(() => {
    return dataStore.layoutGridTabTest3MinCellDimensions;
  });

  /**
   * 📊 取得 LayoutGridTab_Test4 當前尺寸 (Get LayoutGridTab_Test4 Current Dimensions)
   * 從 dataStore 中獲取 LayoutGridTab_Test4 的當前尺寸（以 pt 為單位）
   *
   * @type {ComputedRef<{x: number, y: number}>}
   * @returns {{x: number, y: number}} 當前尺寸的 x（寬度）和 y（高度）
   */
  const layoutGridTabTest4Dimensions = computed(() => {
    return dataStore.layoutGridTabTest4Dimensions;
  });

  /**
   * 📊 取得 LayoutGridTab_Test4 網格最小尺寸 (Get LayoutGridTab_Test4 Min Cell Dimensions)
   * 從 dataStore 中獲取 LayoutGridTab_Test4 的網格最小尺寸（以 pt 為單位）
   *
   * @type {ComputedRef<{minWidth: number, minHeight: number}>}
   * @returns {{minWidth: number, minHeight: number}} 最小寬度和最小高度
   */
  const layoutGridTabTest4MinCellDimensions = computed(() => {
    return dataStore.layoutGridTabTest4MinCellDimensions;
  });

  /**
   * 📊 取得 LayoutGridTab_Test4 滑鼠網格座標 (Get LayoutGridTab_Test4 Mouse Grid Coordinate)
   * 從 dataStore 中獲取 LayoutGridTab_Test4 的滑鼠網格座標
   */
  const layoutGridTabTest4MouseGridCoordinate = computed(() => {
    return dataStore.layoutGridTabTest4MouseGridCoordinate;
  });

  /** taipei_g 空間網路：目前縮放下最小格寬／高（pt） */
  const spaceNetworkGridMinCellDimensions = computed(() => {
    return dataStore.spaceNetworkGridMinCellDimensions;
  });

  /** taipei_g：最近一次 resize 自動合併門檻觸發的合併紀錄（權重差 N 與手動「合併黑點路段 (權重差≤N)」同義） */
  const taipeiFResizeLastAutoMergeInfo = computed(() => dataStore.taipeiFResizeLastAutoMergeInfo);

  const formatTaipeiFResizeAutoMergeTime = (at) => {
    if (at == null || !Number.isFinite(Number(at))) return '';
    return new Date(Number(at)).toLocaleString();
  };

  /**
   * 📊 取得當前網格實際長寬 (Get Current Grid Actual Dimensions)
   * 從 layoutGridJsonData_Test2（版面網格測試分頁資料欄）中獲取當前網格的實際長寬（經過合併和縮減後）
   * 優先從 meta 中讀取，如果沒有則從實際座標計算
   * 使用 computed 確保在數據變化時自動更新
   *
   * @type {ComputedRef<{width: number, height: number}>}
   * @returns {{width: number, height: number}} 當前網格的寬度和高度
   */
  const currentGridDimensions = computed(() => {
    if (!currentLayer.value || !currentLayer.value.layoutGridJsonData_Test2) {
      return { width: 0, height: 0 };
    }

    const layoutData = currentLayer.value.layoutGridJsonData_Test2;

    // 處理兩種格式：Array 或 Object（有 meta）
    let routes;
    let meta;
    if (Array.isArray(layoutData)) {
      routes = layoutData;
      meta = null;
    } else if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.routes)) {
      routes = layoutData.routes;
      meta = layoutData.meta || null;
    } else {
      return { width: 0, height: 0 };
    }

    // 優先從 meta 中讀取
    if (meta && typeof meta.gridWidth === 'number' && typeof meta.gridHeight === 'number') {
      return {
        width: meta.gridWidth,
        height: meta.gridHeight,
      };
    }

    // 如果沒有 meta，從實際座標計算
    const usedCols = new Set();
    const usedRows = new Set();

    routes.forEach((route) => {
      const segments = route?.segments || [];
      segments.forEach((seg) => {
        const points = Array.isArray(seg.points) ? seg.points : [];
        points.forEach((pt) => {
          const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
          const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
          usedCols.add(Math.round(x));
          usedRows.add(Math.round(y));
        });
      });
    });

    if (usedCols.size === 0 || usedRows.size === 0) {
      return { width: 0, height: 0 };
    }

    const sortedCols = Array.from(usedCols).sort((a, b) => a - b);
    const sortedRows = Array.from(usedRows).sort((a, b) => a - b);
    const minX = sortedCols[0];
    const maxX = sortedCols[sortedCols.length - 1];
    const minY = sortedRows[0];
    const maxY = sortedRows[sortedRows.length - 1];

    return {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  });

  /**
   * 📊 取得當前網格實際長寬 (Get Current Grid Actual Dimensions for Test3)
   * 從 layoutGridJsonData_Test3（LayoutGridTab_Test3）中獲取當前網格的實際長寬（經過合併和縮減後）
   * 優先從 meta 中讀取，如果沒有則從實際座標計算
   * 使用 computed 確保在數據變化時自動更新
   *
   * @type {ComputedRef<{width: number, height: number}>}
   * @returns {{width: number, height: number}} 當前網格的寬度和高度
   */
  const currentGridDimensions3 = computed(() => {
    if (!currentLayer.value || !currentLayer.value.layoutGridJsonData_Test3) {
      return { width: 0, height: 0 };
    }

    const layoutData = currentLayer.value.layoutGridJsonData_Test3;

    // 處理兩種格式：Array 或 Object（有 meta）
    let routes;
    let meta;
    if (Array.isArray(layoutData)) {
      routes = layoutData;
      meta = null;
    } else if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.routes)) {
      routes = layoutData.routes;
      meta = layoutData.meta || null;
    } else {
      return { width: 0, height: 0 };
    }

    // 優先從 meta 中讀取
    if (meta && typeof meta.gridWidth === 'number' && typeof meta.gridHeight === 'number') {
      return {
        width: meta.gridWidth,
        height: meta.gridHeight,
      };
    }

    // 如果沒有 meta，從實際座標計算
    const usedCols = new Set();
    const usedRows = new Set();

    routes.forEach((route) => {
      const segments = route?.segments || [];
      segments.forEach((seg) => {
        const points = Array.isArray(seg.points) ? seg.points : [];
        points.forEach((pt) => {
          const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
          const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
          usedCols.add(Math.round(x));
          usedRows.add(Math.round(y));
        });
      });
    });

    if (usedCols.size === 0 || usedRows.size === 0) {
      return { width: 0, height: 0 };
    }

    const sortedCols = Array.from(usedCols).sort((a, b) => a - b);
    const sortedRows = Array.from(usedRows).sort((a, b) => a - b);
    const minX = sortedCols[0];
    const maxX = sortedCols[sortedCols.length - 1];
    const minY = sortedRows[0];
    const maxY = sortedRows[sortedRows.length - 1];

    return {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  });

  /**
   * 從 routes 版面（陣列或 { routes, meta }）推算網格寬高；Test4 與 taipei_g 共用。
   * taipei_g 載入 e_final（地圖路段匯出）後為「扁平 segments」陣列：每筆頂層有 points，無 segments。
   */
  const gridDimensionsFromRoutesLayoutData = (layoutData) => {
    if (!layoutData) return { width: 0, height: 0 };
    let routes;
    let meta;
    if (Array.isArray(layoutData)) {
      routes = layoutData;
      meta = null;
    } else if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.routes)) {
      routes = layoutData.routes;
      meta = layoutData.meta || null;
    } else {
      return { width: 0, height: 0 };
    }
    if (meta) {
      const w =
        typeof meta.gridWidth === 'number'
          ? meta.gridWidth
          : typeof meta.width === 'number'
            ? meta.width
            : null;
      const h =
        typeof meta.gridHeight === 'number'
          ? meta.gridHeight
          : typeof meta.height === 'number'
            ? meta.height
            : null;
      if (w != null && h != null && w > 0 && h > 0) {
        return { width: w, height: h };
      }
    }
    const usedCols = new Set();
    const usedRows = new Set();
    const addPoint = (pt) => {
      const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
      const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
      usedCols.add(Math.round(x));
      usedRows.add(Math.round(y));
    };
    routes.forEach((item) => {
      const segs = item?.segments;
      if (Array.isArray(segs) && segs.length > 0) {
        segs.forEach((seg) => {
          (Array.isArray(seg.points) ? seg.points : []).forEach(addPoint);
        });
      } else if (Array.isArray(item?.points)) {
        item.points.forEach(addPoint);
      }
    });
    if (usedCols.size === 0 || usedRows.size === 0) {
      return { width: 0, height: 0 };
    }
    const sortedCols = Array.from(usedCols).sort((a, b) => a - b);
    const sortedRows = Array.from(usedRows).sort((a, b) => a - b);
    const minX = sortedCols[0];
    const maxX = sortedCols[sortedCols.length - 1];
    const minY = sortedRows[0];
    const maxY = sortedRows[sortedRows.length - 1];
    return {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  };

  /**
   * 📊 取得當前網格實際長寬 (Get Current Grid Actual Dimensions for Test4)
   * 從 layoutGridJsonData_Test4（LayoutGridTab_Test4）中獲取當前網格的實際長寬（經過合併和縮減後）
   * 優先從 meta 中讀取，如果沒有則從實際座標計算
   * 使用 computed 確保在數據變化時自動更新
   *
   * @type {ComputedRef<{width: number, height: number}>}
   * @returns {{width: number, height: number}} 當前網格的寬度和高度
   */
  const currentGridDimensions4 = computed(() => {
    if (!currentLayer.value || !currentLayer.value.layoutGridJsonData_Test4) {
      return { width: 0, height: 0 };
    }
    return gridDimensionsFromRoutesLayoutData(currentLayer.value.layoutGridJsonData_Test4);
  });

  /** taipei_g／taipei_h：與 Test4 相同演算法，資料來自 loadSpaceNetworkGridJson 寫入的 layoutGridJsonData */
  const currentGridDimensionsTaipeiF = computed(() => {
    if (!currentLayer.value || !isTaipeiTestGOrHWeightLayerTab(currentLayer.value.layerId)) {
      return { width: 0, height: 0 };
    }
    return gridDimensionsFromRoutesLayoutData(currentLayer.value.layoutGridJsonData);
  });

  // ==================== 🔧 核心功能函數定義 (Core Function Definitions) ====================

  /**
   * 📑 設定作用中圖層分頁 (Set Active Layer Tab)
   * 切換當前選中的圖層分頁
   */
  const setActiveLayerTab = (layerId) => {
    activeLayerTab.value = layerId;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 🗺️「選擇路線圖」(select_route_map) 載入面板 — 與下方 leaflet 畫線完全獨立之複製版，
  //    邏輯集中於 src/utils/selectRouteMap/cityCatalog.js；此處僅將其暴露給 template。
  //    變數一律以 srm 前綴，避免與既有畫線圖層變數衝突。
  // ─────────────────────────────────────────────────────────────────────────
  const {
    selContinent: srmContinent,
    selCountry: srmCountry,
    selCity: srmCity,
    selQuick: srmQuick,
    selStationSort: srmStationSort,
    loadableCities: srmLoadableCities,
    quickCities: srmQuickCities,
    stationSortedCities: srmStationSortedCities,
    drawContinents: srmContinents,
    drawCountries: srmCountries,
    drawCities: srmCities,
    isTracingRefMap: srmTracing,
    drawLoadMsg: srmLoadMsg,
    loadSelectedCity: srmLoadSelectedCity,
    quickLoadCity: srmQuickLoad,
    clearRouteMap: srmClear,
    routeMapSource: srmSource,
    routeMapOfficialUrl: srmOfficialUrl,
    showStationNames: srmShowNames,
    routeMapStats: srmStats,
    routeMapRouteList: srmRouteList,
    routeMapStationColor: srmStationColor,
    routeMapRouteColor: srmRouteColor,
    routeMapRouteName: srmRouteName,
    routeMapStationLabel: srmStationLabel,
  } = useSelectRouteMapCatalog(dataStore);

  // 🗺️「路線圖調整」(route_map_adjust) 載入面板 — 獨立複製版，邏輯集中於
  //    src/utils/routeMapAdjust/loadFromSelectRouteMap.js；變數以 rma 前綴避免衝突。
  const {
    hasSourceRoutes: rmaHasSource,
    isLoading: rmaLoading,
    loadFromSelectRouteMap: rmaLoadFromSelect,
    clearRouteMapAdjust: rmaClear,
    routeMapAdjustCrossList: rmaCrossList,
    sharedSegmentList: rmaSharedList,
    sharedEndpointList: rmaEndpointList,
    loopRouteList: rmaLoopList,
    hasSkeleton: rmaHasSkeleton,
    toggleSkeleton: rmaToggleSkeleton,
    skeletonStats: rmaSkeletonStats,
    routeMapAdjustSource: rmaSource,
    showStationNames: rmaShowNames,
    routeMapAdjustStats: rmaStats,
    routeMapAdjustRouteList: rmaRouteList,
    routeMapAdjustStationColor: rmaStationColor,
    routeMapAdjustRouteColor: rmaRouteColor,
    routeMapAdjustRouteName: rmaRouteName,
    routeMapAdjustStationLabel: rmaStationLabel,
  } = useRouteMapAdjust(dataStore);

  // 🗺️「路線圖轉換骨架2」(route_map_adjust_2) 載入面板 — 獨立複製版
  const {
    hasSourceRoutes: rma2HasSource,
    isLoading: rma2Loading,
    loadFromSelectRouteMap: rma2LoadFromSelect,
    clearRouteMapAdjust2: rma2Clear,
    routeMapAdjustCrossList: rma2CrossList,
    sharedSegmentList: rma2SharedList,
    sharedEndpointList: rma2EndpointList,
    loopRouteList: rma2LoopList,
    hasSkeleton: rma2HasSkeleton,
    toggleSkeleton: rma2ToggleSkeleton,
    skeletonStats: rma2SkeletonStats,
    routeMapAdjustSource: rma2Source,
    showStationNames: rma2ShowNames,
    routeMapAdjustStats: rma2Stats,
    routeMapAdjustRouteList: rma2RouteList,
    routeMapAdjustStationColor: rma2StationColor,
    routeMapAdjustRouteColor: rma2RouteColor,
    routeMapAdjustRouteName: rma2RouteName,
    routeMapAdjustStationLabel: rma2StationLabel,
  } = useRouteMapAdjust2(dataStore);

  // 🗺️「路線圖轉換直線骨架」(route_map_adjust_straight) 載入面板 — 獨立複製版
  const {
    hasSourceRoutes: rmasHasSource,
    isLoading: rmasLoading,
    loadFromSelectRouteMap: rmasLoadFromSelect,
    clearRouteMapAdjustStraight: rmasClear,
    routeMapAdjustCrossList: rmasCrossList,
    sharedSegmentList: rmasSharedList,
    sharedEndpointList: rmasEndpointList,
    loopRouteList: rmasLoopList,
    hasSkeleton: rmasHasSkeleton,
    toggleSkeleton: rmasToggleSkeleton,
    skeletonStats: rmasSkeletonStats,
    routeMapAdjustSource: rmasSource,
    showStationNames: rmasShowNames,
    routeMapAdjustStats: rmasStats,
    routeMapAdjustRouteList: rmasRouteList,
    routeMapAdjustStationColor: rmasStationColor,
    routeMapAdjustRouteColor: rmasRouteColor,
    routeMapAdjustRouteName: rmasRouteName,
    routeMapAdjustStationLabel: rmasStationLabel,
  } = useRouteMapAdjustStraight(dataStore);

  /** 📥「示意圖佈局」：把「路線圖轉換骨架」的**骨架**轉成 geojson（way 顏色＝骨架分類色）寫入此圖層之 geojsonData */
  const loadRouteAdjustIntoSchematic = (layer) => {
    if (!layer) return;
    const adj = dataStore.findLayerById('route_map_adjust');
    const sk = adj?.routeMapAdjustSkeleton;
    const edges = Array.isArray(sk?.edges) ? sk.edges : [];
    if (!edges.length) {
      window.alert('「路線圖轉換骨架」尚未建立骨架，請先到「路線圖轉換骨架」按「變成骨架」。');
      return;
    }
    const fc = routeMapAdjustSkeletonToGeoJson(
      sk,
      Array.isArray(adj.routeMapAdjustLines) ? adj.routeMapAdjustLines : [],
      Array.isArray(adj.routeMapAdjustBlackDots) ? adj.routeMapAdjustBlackDots : [],
      adj.routeMapAdjustStationMeta || null
    );
    layer.geojsonData = fc;
    layer.isLoaded = true;
    if (!layer.visible) layer.visible = true;
    dataStore.setRouteSchematicActiveLayer(layer.layerId); // 獨立顯示：畫此圖層的骨架
    window.alert(`已載入骨架：${edges.length} 條邊、${(sk.nodes || []).length} 個節點。可按「開始執行」。`);
  };

  /** 📥「示意圖佈局」：把「路線圖轉換直線骨架」的骨架轉成 geojson 寫入此圖層之 geojsonData */
  const loadRouteAdjustStraightIntoSchematic = (layer) => {
    if (!layer) return;
    const adj = dataStore.findLayerById('route_map_adjust_straight');
    const sk = adj?.routeMapAdjustSkeleton;
    const edges = Array.isArray(sk?.edges) ? sk.edges : [];
    if (!edges.length) {
      window.alert('「路線圖轉換直線骨架」尚未建立骨架，請先到「路線圖轉換直線骨架」按「變成骨架」。');
      return;
    }
    const lines = Array.isArray(adj.routeMapAdjustStraightenedLines)
      ? adj.routeMapAdjustStraightenedLines
      : Array.isArray(adj.routeMapAdjustLines)
        ? adj.routeMapAdjustLines
        : [];
    const blackDots = Array.isArray(adj.routeMapAdjustStraightenedBlackDots)
      ? adj.routeMapAdjustStraightenedBlackDots
      : Array.isArray(adj.routeMapAdjustBlackDots)
        ? adj.routeMapAdjustBlackDots
        : [];
    const stationMeta =
      adj.routeMapAdjustStraightenedStationMeta || adj.routeMapAdjustStationMeta || null;
    const stationCoords = collectStraightSkeletonStationCoords(
      adj.routeMapAdjustLines,
      adj.routeMapAdjustBlackDots,
      blackDots,
      stationMeta
    );
    const fc = routeMapAdjustSkeletonToGeoJson(sk, lines, blackDots, stationMeta, stationCoords);
    layer.geojsonData = fc;
    layer.isLoaded = true;
    if (!layer.visible) layer.visible = true;
    dataStore.setRouteSchematicActiveLayer(layer.layerId);
    window.alert(
      `已載入直線骨架：${edges.length} 條邊、${(sk.nodes || []).length} 個節點。可按「開始執行」。`
    );
  };

  /** 🗺️ Leaflet 畫線圖層物件 */
  const leafletDrawLayer = computed(() => dataStore.findLayerById('leaflet_josm_draw'));

  /** 🗺️ 目前繪製工具：'none'（不編輯，預設）｜'line'｜'point'。再按一次作用中的工具→回到不編輯 */
  const leafletDrawMode = computed(() => dataStore.leafletDrawMode);
  const setLeafletDrawMode = (mode) =>
    dataStore.setLeafletDrawMode(dataStore.leafletDrawMode === mode ? 'none' : mode);

  /** 🗺️ 目前畫線資料來源（載入城市時顯示；隨機／清除後為空） */
  const leafletDrawSource = computed(() => leafletDrawLayer.value?.leafletDrawSource || '');

  /** 🌍 全球城市清單（catalog）：洲→國→市三層；按「讀取並畫出」才即時抓該城市路線（on-demand） */
  const metroCatalog = ref([]);
  const loadMetroCatalog = async () => {
    if (metroCatalog.value.length) return;
    try {
      const res = await fetch(`${process.env.BASE_URL || '/'}data/metro/_catalog.json`);
      if (res.ok) metroCatalog.value = await res.json();
    } catch (e) {
      void e;
    }
  };
  onMounted(loadMetroCatalog);

  const CONTINENT_ORDER = ['亞洲 Asia', '歐洲 Europe', '北美 North America', '南美 South America', '大洋洲 Oceania', '非洲 Africa', '其他 Other'];
  const selContinent = ref('');
  const selCountry = ref('');
  const selCity = ref('');
  // 只顯示「已預先抓好（有 file）」的城市
  const loadableCities = computed(() => metroCatalog.value.filter((c) => c.file));
  const drawContinents = computed(() => {
    const set = new Set(loadableCities.value.map((c) => c.continent));
    return CONTINENT_ORDER.filter((c) => set.has(c));
  });
  const drawCountries = computed(() => {
    const map = new Map();
    for (const c of loadableCities.value)
      if (c.continent === selContinent.value && !map.has(c.country)) map.set(c.country, c.countryZh || '');
    return [...map.entries()]
      .map(([country, zh]) => ({ country, label: (zh ? zh + ' ' : '') + country }))
      .sort((a, b) => a.country.localeCompare(b.country));
  });
  const drawCities = computed(() =>
    loadableCities.value
      .filter((c) => c.continent === selContinent.value && c.country === selCountry.value)
      .sort((a, b) => a.city.localeCompare(b.city))
  );
  watch(selContinent, () => {
    selCountry.value = '';
    selCity.value = '';
  });
  watch(selCountry, () => {
    selCity.value = '';
  });

  /** 把扁平 GeoJSON（way/node）套到畫線圖層：路線、黑點中間站、站名站號 meta；回傳路線數 */
  const applyMetroFcToDrawLayer = (fc, lyr) => {
    const feats = Array.isArray(fc?.features) ? fc.features : [];
    const isWay = (f) => f?.properties?.element_type === 'way' && f.geometry?.type === 'LineString';
    const isNode = (f) => f?.properties?.element_type === 'node' && f.geometry?.type === 'Point';
    const lines = feats
      .filter(isWay)
      .map((f) => ({
        color: f.properties.color || '#666666',
        routeName: f.properties.route_name,
        routeId: f.properties.route_id,
        routeCompany: f.properties.route_company,
        railway: f.properties.railway,
        osmId: f.properties.osm_id,
        latlngs: (f.geometry.coordinates || []).map(([lon, lat]) => [lat, lon]),
      }))
      .filter((l) => l.latlngs.length >= 2);
    if (!lines.length) return 0;
    const ll6 = (lat, lon) => `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
    const stationMeta = {};
    const nodes = [];
    for (const f of feats) {
      if (!isNode(f)) continue;
      const [lon, lat] = f.geometry.coordinates;
      stationMeta[ll6(lat, lon)] = { id: f.properties.station_id, name: f.properties.station_name, osmId: f.properties.osm_id };
      nodes.push([lat, lon]);
    }
    const memb = new Map();
    lines.forEach((l, li) => {
      l.latlngs.forEach((c, i) => {
        const k = ll6(c[0], c[1]);
        let m = memb.get(k);
        if (!m) {
          m = { lines: new Set(), endpoint: false };
          memb.set(k, m);
        }
        m.lines.add(li);
        if (i === 0 || i === l.latlngs.length - 1) m.endpoint = true;
      });
    });
    const blackDots = nodes.filter(([lat, lon]) => {
      const m = memb.get(ll6(lat, lon));
      return m && m.lines.size < 2 && !m.endpoint;
    });
    lyr.leafletDrawLines = lines;
    lyr.leafletDrawBlackDots = blackDots;
    lyr.leafletDrawStationMeta = stationMeta; // 供匯入時還原真實站名／站號
    return lines.length;
  };

  /** 📂 載入所選城市「預先抓好」的 GeoJSON（data/metro/<洲>/<國>/<市>.geojson）並畫到畫線圖層 */
  const isTracingRefMap = ref(false);
  const drawLoadMsg = ref('');
  const loadSelectedCity = async () => {
    const city = metroCatalog.value.find((c) => c.id === selCity.value);
    if (!city || !city.file) {
      window.alert('請依序選擇 洲 → 國家 → 城市。');
      return;
    }
    const lyr = leafletDrawLayer.value;
    if (!lyr) return;
    isTracingRefMap.value = true;
    drawLoadMsg.value = '讀取中…';
    try {
      const res = await fetch(`${process.env.BASE_URL || '/'}data/metro/${city.file}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const fc = await res.json();
      const n = applyMetroFcToDrawLayer(fc, lyr);
      if (!n) {
        window.alert('此城市資料無有效路線。');
        return;
      }
      lyr.leafletDrawSource = `${city.city}, ${city.country}・© OpenStreetMap contributors（ODbL）`;
      dataStore.requestLeafletDrawFit();
    } catch (e) {
      window.alert('讀取失敗：' + (e && e.message ? e.message : e));
    } finally {
      isTracingRefMap.value = false;
      drawLoadMsg.value = '';
    }
  };

  /**
   * 🗺️ 目前路線／站點統計（connect 紅點／terminal 藍點／一般黑點）
   * SpaceNetworkGridTab 與此處共用 computeLeafletDrawStations 推導，確保一致
   */
  const leafletDrawStats = computed(() => {
    const lyr = leafletDrawLayer.value;
    const lines = Array.isArray(lyr?.leafletDrawLines) ? lyr.leafletDrawLines : [];
    const blackDots = Array.isArray(lyr?.leafletDrawBlackDots) ? lyr.leafletDrawBlackDots : [];
    const { terminals, connects, blacks } = computeLeafletDrawStations(lines, blackDots);
    return {
      routes: lines.length,
      connect: connects.length,
      terminal: terminals.length,
      black: blacks.length,
    };
  });

  /** 🗺️ 各路線依序（起點→終點）的站點清單 */
  const leafletDrawRouteList = computed(() => {
    const lyr = leafletDrawLayer.value;
    const lines = Array.isArray(lyr?.leafletDrawLines) ? lyr.leafletDrawLines : [];
    const blackDots = Array.isArray(lyr?.leafletDrawBlackDots) ? lyr.leafletDrawBlackDots : [];
    return computeLeafletDrawRouteStations(lines, blackDots);
  });

  /** 站點型別 → 顏色（與地圖、其他圖層一致） */
  const leafletStationColor = (type) =>
    type === 'terminal' ? '#1565c0' : type === 'connect' ? '#ff0000' : '#000000';

  /** 依路線索引取該路線顏色（路線以顏色為名） */
  const leafletRouteColor = (index) => leafletDrawRouteList.value[index]?.color || '#000000';

  /** 依路線索引取顏色名稱（路線名＝顏色） */
  const leafletRouteName = (index) => routeColorNameForIndex(index);

  /** 站點型別 → 標籤文字 */
  const leafletStationLabel = (type) =>
    type === 'terminal'
      ? 'terminal（端點）'
      : type === 'connect'
        ? 'connect（交點）'
        : '一般（黑點）';

  /**
   * 🗺️ 清除 Leaflet 自由畫線圖層上所有線與黑點
   * SpaceNetworkGridTab 監聽變動會即時重繪地圖
   */
  const clearLeafletDrawLines = () => {
    const lyr = leafletDrawLayer.value;
    if (lyr) {
      lyr.leafletDrawLines = [];
      lyr.leafletDrawBlackDots = [];
      lyr.leafletDrawStationMeta = null;
      lyr.leafletDrawSource = null;
    }
  };

  /**
   * 🎲 隨機生成一個「像捷運路線」的路網（取代目前畫線圖層內容）
   *
   * 設計成貼近真實捷運路網的樣貌：
   *  - 🧭 八方向（octilinear）：每段只走水平／垂直／45° 對角，線條乾淨有方向感，不會纏繞
   *  - 🚉 多站：每條路線沿途有多個中間站（黑點），非僅頭尾兩站
   *  - 🔴 轉乘：數條路線共用中央樞紐並彼此交叉 → 自動形成 connect（交點）轉乘站
   *  - 🔵 端點：每條路線兩端為 terminal
   *
   * 座標貼齊整數格再轉 lat/lng：經度步長以 1/cos(緯度) 校正 Mercator 投影，
   * 使 45° 對角線在地圖上看起來接近 45°。資料格式與手繪一致
   * （{ color, latlngs:[[lat,lng],…] } + 黑點 [lat,lng]），
   * SpaceNetworkGridTab 監聽變動會即時重繪。
   */
  const generateRandomLeafletDrawNetwork = () => {
    const lyr = leafletDrawLayer.value;
    if (!lyr) return;

    const CENTER = [25.0478, 121.5319]; // 台北車站
    const COSLAT = Math.cos((CENTER[0] * Math.PI) / 180);
    const STEP_LAT = 0.007; // 相鄰格約 0.78 km（接近捷運站距）
    const STEP_LNG = STEP_LAT / COSLAT; // 校正 Mercator，使對角線視覺接近 45°
    const MAXR = 8; // 路網半徑（格）≈ ±6 km
    const round7 = (v) => Math.round(v * 1e7) / 1e7;
    const cellLat = (j) => round7(CENTER[0] + j * STEP_LAT);
    const cellLng = (i) => round7(CENTER[1] + i * STEP_LNG);
    const clamp = (v) => Math.max(-MAXR, Math.min(MAXR, v));

    // 8 個方向：E, NE, N, NW, W, SW, S, SE
    const DIRS = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ];

    // 不重疊的關鍵：記錄所有「已使用的單位格邊」。兩條路線可在站點交會（共用一個點），
    // 但不得共用任何一段格邊（不得有任一段重疊）。格邊以無向鍵表示。
    const usedEdges = new Set();
    const edgeKey = (a, b) => {
      const ka = `${a[0]},${a[1]}`;
      const kb = `${b[0]},${b[1]}`;
      return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    };

    // 八方向 grid walk（逐格前進）：每步優先直行、其次 ±45°…，且永不重用既有格邊、不回頭。
    // 回傳 { cells, edges }；edges 僅在該線被採用時才併入 usedEdges（失敗嘗試不污染）。
    const buildLine = (start, dir0, maxStations) => {
      const localEdges = new Set();
      const edgeTaken = (ek) => usedEdges.has(ek) || localEdges.has(ek);
      const cells = [[start[0], start[1]]];
      let i = start[0];
      let j = start[1];
      let d = dir0;
      let guard = 0;
      while (cells.length < maxStations && guard++ < 400) {
        // 候選方向：直行 → ±45° → ±90° → ±135°（排除 180° 回頭），越偏離越後 → 線條平順
        const cand = [d, (d + 1) % 8, (d + 7) % 8, (d + 2) % 8, (d + 6) % 8, (d + 3) % 8, (d + 5) % 8];
        if (Math.random() < 0.35) {
          // 約 35% 機率優先嘗試轉 45°，增加彎折變化（仍受不重疊限制）
          cand.unshift(Math.random() < 0.5 ? (d + 1) % 8 : (d + 7) % 8);
        }
        let moved = false;
        for (const nd of cand) {
          const ni = clamp(i + DIRS[nd][0]);
          const nj = clamp(j + DIRS[nd][1]);
          if (ni === i && nj === j) continue; // 撞邊界
          const ek = edgeKey([i, j], [ni, nj]);
          if (edgeTaken(ek)) continue; // 會與既有路線重疊 → 換方向
          localEdges.add(ek);
          i = ni;
          j = nj;
          d = nd;
          cells.push([i, j]);
          moved = true;
          break;
        }
        if (!moved) break; // 八方向皆被佔用／撞邊界 → 收尾
      }
      return { cells, edges: localEdges };
    };

    // 逐條建線並串成單一連通路網：第一條自中心（台北車站）出發；其後每條都從
    // 「既有路網上的某個站點」起步 → 必與既有路線共用至少一站，整個路網保證連在一起。
    const routeCount = 4 + Math.floor(Math.random() * 3); // 4–6 條
    const lines = [];
    const usedCells = [[0, 0]]; // 已存在的格點 [i,j]（含中心），作為後續路線的連接錨點
    for (let r = 0; r < routeCount; r++) {
      let chosen = null;
      // 多次嘗試不同錨點／方向，挑出夠長（≥3 站）的線；避免起點被佔滿而生出過短的線
      for (let attempt = 0; attempt < 10 && !chosen; attempt++) {
        const anchor = usedCells[Math.floor(Math.random() * usedCells.length)];
        const dir0 = Math.floor(Math.random() * 8);
        const maxStations = 8 + Math.floor(Math.random() * 6); // 8–13 站
        const built = buildLine([anchor[0], anchor[1]], dir0, maxStations);
        if (built.cells.length >= 3) chosen = built;
      }
      if (!chosen) continue;
      chosen.edges.forEach((e) => usedEdges.add(e)); // 採用 → 鎖定其格邊，後續不得重疊
      chosen.cells.forEach((c) => usedCells.push(c));
      lines.push({
        color: routeColorForIndex(r),
        latlngs: chosen.cells.map(([i, j]) => [cellLat(j), cellLng(i)]),
      });
    }
    if (lines.length === 0) return;

    // 交會站（線段交叉＋共用節點）；中間站取「非端點且非交會」的轉折點為黑點
    const { connects } = computeLeafletDrawStations(lines, []);
    const TOL = 1e-6;
    const nearConnect = (ll) =>
      connects.some((c) => Math.abs(c[0] - ll[0]) < TOL && Math.abs(c[1] - ll[1]) < TOL);

    const blackDots = [];
    const seenBlack = new Set();
    lines.forEach((ln) => {
      for (let k = 1; k < ln.latlngs.length - 1; k++) {
        const ll = ln.latlngs[k];
        if (nearConnect(ll)) continue; // 交會點已是 connect，不再放黑點
        const key = `${ll[0]},${ll[1]}`;
        if (seenBlack.has(key)) continue;
        seenBlack.add(key);
        blackDots.push(ll);
      }
    });

    lyr.leafletDrawLines = lines;
    lyr.leafletDrawBlackDots = blackDots;
    lyr.leafletDrawStationMeta = null; // 隨機路網無真實站名
    lyr.leafletDrawSource = null;
  };

  /**
   * 圖層在 upperViewTabs 中可開啟之上半部捷徑（與 UpperView 分頁鈕同 30px 圓鈕樣式）
   * @param {{ upperViewTabs?: string[] } | null} layer
   */
  const layerUpperTabShortcuts = (layer) => {
    if (!layer || !Array.isArray(layer.upperViewTabs)) return [];
    const out = [];
    return out;
  };

  const openHomeUpperTab = (tab) => {
    if (typeof tab === 'string' && tab) {
      dataStore.requestHomeActiveUpperTab(tab);
    }
  };

  /**
   * 執行當前圖層的 executeFunction
   */
  /**
   * 示意圖佈局圖層：下載指定圖層目前 JSON（spaceNetworkGridJsonData）為檔案。
   */
  const onDownloadSchematicJson = (layer) => {
    const L = layer || currentLayer.value;
    const data = L?.spaceNetworkGridJsonData;
    if (!Array.isArray(data) || data.length === 0) {
      window.alert('此圖層尚無 JSON 結果，請先執行/匯入產生結果。');
      return;
    }
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${L.layerId || 'schematic'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * MILP結果正規化：匯入下載的 MILP 結果 JSON 檔（扁平路段陣列，或含 fullFlat／spaceNetworkGridJsonData）。
   * 匯入只**顯示原始路網**（不正規化）；座標正規化要等使用者按「執行下一步」。
   */
  const onLoadMilpJsonFile = async (event) => {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = '';
    if (!file) return;
    try {
      let parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) {
        parsed = parsed?.fullFlat || parsed?.spaceNetworkGridJsonData || parsed?.flatSegs || null;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        window.alert('JSON 格式不符（需為路段陣列，或含 fullFlat／spaceNetworkGridJsonData）。');
        return;
      }
      loadMilpJsonRaw(parsed); // 只顯示原始；正規化要按「執行下一步」
    } catch (e) {
      window.alert('匯入失敗：' + (e?.message || e));
    }
  };

  /**
   * MILP結果正規化：自「示意圖佈局①②③」其一匯入其排版結果（spaceNetworkGridJsonData，扁平路段陣列），
   * 走與「匯入 JSON 檔」相同管線（loadMilpJsonRaw）：存為 dataJson、顯示原始；正規化要按「座標正規化」。
   */
  const importLayoutResultIntoMilpRead = (sourceLayerId) => {
    const src = dataStore.findLayerById(sourceLayerId);
    if (!src) return;
    const segs = Array.isArray(src.spaceNetworkGridJsonData) ? src.spaceNetworkGridJsonData : null;
    if (!segs || segs.length === 0) {
      window.alert(`圖層「${src.layerName || sourceLayerId}」尚無排版結果，請先執行該佈局。`);
      return;
    }
    loadMilpJsonRaw(JSON.parse(JSON.stringify(segs)));
  };

  /** MILP結果正規化（RMA）：匯入下載的 MILP 結果 JSON 檔（寫入 schematic_rma_milp_read）。 */
  const onLoadMilpJsonFileRma = async (event) => {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = '';
    if (!file) return;
    try {
      let parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) {
        parsed = parsed?.fullFlat || parsed?.spaceNetworkGridJsonData || parsed?.flatSegs || null;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        window.alert('JSON 格式不符（需為路段陣列，或含 fullFlat／spaceNetworkGridJsonData）。');
        return;
      }
      loadMilpJsonRawRma(parsed); // 只顯示原始；正規化要按「座標正規化」
    } catch (e) {
      window.alert('匯入失敗：' + (e?.message || e));
    }
  };

  /** MILP結果正規化（RMA）：自「示意圖佈局①②③（RMA）」其一匯入其排版結果（寫入 schematic_rma_milp_read）。 */
  const importLayoutResultIntoMilpReadRma = (sourceLayerId) => {
    const src = dataStore.findLayerById(sourceLayerId);
    if (!src) return;
    const segs = Array.isArray(src.spaceNetworkGridJsonData) ? src.spaceNetworkGridJsonData : null;
    if (!segs || segs.length === 0) {
      window.alert(`圖層「${src.layerName || sourceLayerId}」尚無排版結果，請先執行該佈局。`);
      return;
    }
    loadMilpJsonRawRma(JSON.parse(JSON.stringify(segs)));
  };

  const executeLayerFunction = async () => {
    if (!currentLayer.value || !currentLayer.value.executeFunction) {
      console.warn('當前圖層沒有 executeFunction');
      return;
    }

    // Taipei 流程：taipei_1_0 使用 geojsonData，後續流程使用 layoutGridJsonData / spaceNetworkGridJsonData
    // 測試圖層：可能使用 jsonData
    const L = currentLayer.value;
    const isTaipeiLayer = L.layerId?.startsWith('taipei_');
    let jsonData = isTaipeiLayer
      ? L.geojsonData || L.layoutGridJsonData || L.spaceNetworkGridJsonData
      : L.geojsonData || L.layoutGridJsonData || L.spaceNetworkGridJsonData || L.jsonData;
    // schematic_*（Stroke-based／Hill Climbing／MILP）：executeFunction 自上游
    // osm_2_geojson_2_json 圖層讀資料，不依賴此參數；僅須非空以通過檢查。
    if (!jsonData && L.layerId?.startsWith('schematic_')) {
      jsonData = { type: 'FeatureCollection', features: [] };
    }
    if (!jsonData) {
      const missingFields = isTaipeiLayer
        ? 'geojsonData / layoutGridJsonData / spaceNetworkGridJsonData'
        : 'geojsonData / layoutGridJsonData / spaceNetworkGridJsonData / jsonData';
      console.warn(`當前圖層沒有 ${missingFields}`);
      return;
    }

    isExecuting.value = true;
    if (currentLayer.value.layerId === 'schematic_rma_milp') {
      currentLayer.value.milpRoutePairAudit = null;
    }

    try {
      // 等待 UI 更新以顯示"計算中"畫面
      await nextTick();

      // 執行函數（可為 async）
      await Promise.resolve(currentLayer.value.executeFunction(jsonData));

      // 稍微延遲後關閉，確保用戶能看到"計算中"畫面
      setTimeout(() => {
        isExecuting.value = false;
      }, 300);
    } catch (error) {
      console.error('執行圖層函數時發生錯誤:', error);
      isExecuting.value = false;
    }
  };

  const onControlExecuteNextClick = () => {
    executeLayerFunction();
  };

  const onTaipeiOsmSpaceGridPickLocalFileClick = () => {
    const el = document.getElementById('taipei-osm-space-grid-local-file-input');
    if (el) el.click();
  };

  /**
   * 本機檔：依副檔名與內容判斷走 GeoJSON 或 OSM XML（避免僅有 `.json`／無副檔名時誤當 XML 而讀取失敗）。
   */
  const inferOsm2LocalIngestFormat = (logicalFileName, text) => {
    const nameLower = (logicalFileName || '').toLowerCase();
    const trimmed = String(text ?? '')
      .replace(/^\uFEFF/, '')
      .trim();
    if (nameLower.endsWith('.geojson') || nameLower.endsWith('.json')) return 'geojson';
    if (nameLower.endsWith('.osm') || nameLower.endsWith('.xml')) return 'osm';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'geojson';
    return 'osm';
  };

  /** 將 OSM／GeoJSON 原始字串併入 OSM→GeoJSON 圖層（與本機選檔相同管線／持久化／鏡像）。 */
  const ingestOsmSpaceGridTextIntoLayer = (layer, text, logicalFileName) => {
    const normalizedText = String(text ?? '').replace(/^\uFEFF/, '');
    const fmt = inferOsm2LocalIngestFormat(logicalFileName, normalizedText);
    const fromGeojson = fmt === 'geojson';
    let result;
    const mergeOpts = {
      groupName: dataStore.findGroupNameByLayerId(layer.layerId),
    };
    if (fromGeojson) {
      setOsm2GeojsonSessionOsmXml('');
      result = parseGeoJsonTextToOsm2GeojsonLoaderResult(normalizedText);
    } else {
      setOsm2GeojsonSessionOsmXml(normalizedText);
      result = osmXmlToOsm2GeojsonLoaderResult(normalizedText);
      mergeOpts.sourceOsmXmlText = normalizedText;
    }
    layer.osmFileName = logicalFileName ?? null;
    mergeOsm2GeojsonLoaderResultIntoLayer(layer, result, mergeOpts);
    dataStore.saveLayerState(layer.layerId, getOsm2GeojsonPersistPatchAfterLoaderMerge(layer));
    dataStore.syncOsm2DataJsonMirrorFromParent();
  };

  /** 匯入 Leaflet 畫線圖層內容（轉成 OSM 風格路網 GeoJSON）作為本層來源並顯示 */
  const onImportLeafletDrawIntoOsmSpaceGridClick = () => {
    const layer = dataStore.findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID);
    if (!layer || layer.isLoading) return;
    const draw = dataStore.findLayerById('leaflet_josm_draw');
    const lines = Array.isArray(draw?.leafletDrawLines) ? draw.leafletDrawLines : [];
    const blackDots = Array.isArray(draw?.leafletDrawBlackDots) ? draw.leafletDrawBlackDots : [];
    if (lines.length === 0) {
      window.alert('Leaflet 畫線圖層尚無路線，請先在「空間網絡網格 → Leaflet 畫線」畫線。');
      return;
    }
    const fc = leafletDrawToOsmRouteGeoJson(lines, blackDots, draw?.leafletDrawStationMeta || null);
    ingestOsmSpaceGridTextIntoLayer(layer, JSON.stringify(fc), 'leaflet-draw.geojson');
    layer.isLoaded = true; // 已有資料，避免開啟時再走 loader 覆蓋
    if (!layer.visible) dataStore.toggleLayerVisibility(OSM_2_GEOJSON_2_JSON_LAYER_ID);
  };

  /** 三個示意圖佈局圖層的輸入來源匯入：'draw'（從畫線）｜'osm'（從 OSM／GeoJSON → JSON） */
  const importIntoSchematicLayer = (targetLayerId, source) => {
    const layer = dataStore.findLayerById(targetLayerId);
    if (!layer) return;
    let fc;
    if (source === 'draw') {
      const draw = dataStore.findLayerById('leaflet_josm_draw');
      const lines = Array.isArray(draw?.leafletDrawLines) ? draw.leafletDrawLines : [];
      if (lines.length === 0) {
        window.alert('Leaflet 畫線圖層尚無路線，請先在「空間網絡網格 → Leaflet 畫線」畫線。');
        return;
      }
      fc = leafletDrawToOsmRouteGeoJson(lines, draw?.leafletDrawBlackDots || [], draw?.leafletDrawStationMeta || null);
    } else {
      const osm = dataStore.findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID);
      if (!osm?.geojsonData?.features?.length) {
        window.alert('「OSM／GeoJSON → JSON」圖層尚無資料，請先載入或匯入。');
        return;
      }
      fc = JSON.parse(JSON.stringify(osm.geojsonData));
    }
    layer.geojsonData = fc;
    layer.isLoaded = true;
    dataStore.saveLayerState(targetLayerId, { geojsonData: layer.geojsonData, isLoaded: true });
  };

  const onTaipeiOsmSpaceGridLoadBundledTaipeiClick = async () => {
    const layer = dataStore.findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID);
    if (!layer || layer.isLoading) return;
    try {
      layer.isLoading = true;
      const rawRel =
        typeof layer.publicBundledTaipeiOsmPath === 'string' &&
        layer.publicBundledTaipeiOsmPath.trim()
          ? layer.publicBundledTaipeiOsmPath.trim().replace(/^\/+/, '')
          : 'taipei/taipei.osm';
      // 對齊 @/utils/dataProcessor.js loadOsmXmlAsGeoJsonForRoutes／loadGeoJsonForRoutes（Vue CLI 用 process.env）
      const baseUrl = process.env.BASE_URL || '/';
      const primaryUrl = `${baseUrl.replace(/\/?$/, '/')}${rawRel.replace(/^\/+/, '')}`;

      let res;
      try {
        res = await fetch(primaryUrl);
      } catch {
        res = await fetch(`/${rawRel.replace(/^\/+/, '')}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      ingestOsmSpaceGridTextIntoLayer(layer, text, 'taipei/taipei.osm');
    } catch (err) {
      console.error('自動讀入 taipei/taipei.osm 失敗:', err);
      layer.isLoading = false;
      const pathLabel =
        (typeof layer.publicBundledTaipeiOsmPath === 'string' &&
          layer.publicBundledTaipeiOsmPath.trim()) ||
        'taipei/taipei.osm';
      window.alert(`無法載入「${pathLabel}」。${String(err?.message ?? err ?? '')}`);
      dataStore.saveLayerState(layer.layerId, { isLoading: false });
    }
  };

  const onJsonGridNeighborTopologyFixClick = async () => {
    if (isExecuting.value) return;
    isExecuting.value = true;
    try {
      await nextTick();
      const b = pickJsonGridNormalizeExecuteBundle();
      const r = await Promise.resolve(b.execTopology());
      const coordBlock =
        r.moveLines && r.moveLines.length
          ? `以下為 d3 路網上被移動頂點的「網格座標」（整數格，與編輯器網格一致）：\n\n${r.moveLines.join(
              '\n'
            )}\n\n`
          : '';
      const tail = r.message || '';
      if (r.ok) {
        window.alert(`鄰線錯邊修正完成。\n\n${coordBlock}${tail}`);
      } else {
        window.alert(`鄰線錯邊修正未完成。\n\n${r.message || ''}\n\n${coordBlock}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        isExecuting.value = false;
      }, 300);
    }
  };

  /** 與拓撲／dashboard 分離存放的「修正」座標字串列；圖層欄位 {@link jsonGridNeighborFixPersist} 優先 */
  const jsonGridNeighborFixDisplayLines = (lyr) => {
    if (!lyr || !jsonGridNeighborFixMatchesLayerId(lyr)) return [];
    const p = lyr.jsonGridNeighborFixPersist?.log;
    if (Array.isArray(p) && p.length > 0) return p;
    const d = lyr.dashboardData?.neighborTopologyFixLog;
    return Array.isArray(d) && d.length > 0 ? d : [];
  };

  const jsonGridNeighborFixStaleVisual = (lyr) => {
    if (!lyr || !jsonGridNeighborFixMatchesLayerId(lyr)) return false;
    if (lyr.jsonGridNeighborFixPersist?.stale) return true;
    return !!lyr.dashboardData?.neighborTopologyFixStale;
  };

  const jsonGridTopologyPanelShow = (lyr) => {
    if (!lyr || !jsonGridNeighborFixMatchesLayerId(lyr)) return false;
    const tc = lyr.dashboardData?.topologyCheck;
    if (tc && !tc.skipped) return true;
    return jsonGridNeighborFixDisplayLines(lyr).length > 0;
  };

  /** 須先完成「座標正規化」取得拓撲比對（非刪空欄列後之 skipped 占位）才可刪空欄列 */
  const jsonGridPruneEmptyGridLinesEnabled = (lyr) => {
    if (!lyr || !jsonGridNeighborFixMatchesLayerId(lyr)) return false;
    const tc = lyr.dashboardData?.topologyCheck;
    return !!(tc && !tc.skipped);
  };

  /** `point_orthogonal`：本層有路網即可刪空欄列（與父層拓撲狀態無關） */
  const jsonGridFromCoordPruneEmptyGridLinesEnabled = (lyr) => {
    if (
      !lyr ||
      lyr.layerId !== POINT_ORTHOGONAL_LAYER_ID
    )
      return false;
    return Array.isArray(lyr.spaceNetworkGridJsonData) && lyr.spaceNetworkGridJsonData.length > 0;
  };

  const jsonGridTopologyCardToneClass = (lyr) => {
    const tc = lyr?.dashboardData?.topologyCheck;
    if (tc && !tc.skipped) {
      return tc.topologyPreserved
        ? 'bg-success bg-opacity-10 text-success'
        : 'bg-danger bg-opacity-10 text-danger';
    }
    return 'bg-secondary bg-opacity-10 text-body border border-secondary border-opacity-25';
  };

  /**
   * `point_orthogonal`：由路網（或 geojson／dataJson 建網）列舉每段折線上之所有頂點。
   * @returns {Array<{ row: number, segIdx: number, ptIdx: number, routeName: string, x: number, y: number, role: string, label: string }>}
   */
  const jsonGridFromCoordNormalizedVertexList = (lyr) => {
    if (
      !lyr ||
      lyr.layerId !== POINT_ORTHOGONAL_LAYER_ID
    )
      return [];
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) return [];
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const out = [];
    let row = 0;
    for (let segIdx = 0; segIdx < flat.length; segIdx++) {
      const seg = flat[segIdx];
      const routeName = String(seg.route_name ?? seg.name ?? 'Unknown');
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
      const nPts = pts.length;
      for (let ptIdx = 0; ptIdx < nPts; ptIdx++) {
        const pt = pts[ptIdx];
        const x = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
        const y = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
        const n = nodes[ptIdx];
        let role = '';
        if (n?.node_type === 'connect') role = 'connect';
        else if (n?.node_type === 'line') role = 'line';
        else if (ptIdx === 0) role = 'start';
        else if (ptIdx === nPts - 1) role = 'end';
        else role = 'bend';
        let label = '';
        if (n && typeof n === 'object') {
          const sn = String(n.station_name ?? n.tags?.station_name ?? n.tags?.name ?? '').trim();
          const cn = n.connect_number ?? n.tags?.connect_number;
          if (sn) label = cn != null && String(cn) !== '' ? `${sn}（轉乘#${cn}）` : sn;
          else if (cn != null && String(cn) !== '') label = `轉乘#${cn}`;
          else if (n.node_type === 'connect') label = '轉乘點';
        }
        if (!label) {
          if (ptIdx === 0) label = '起點';
          else if (ptIdx === nPts - 1) label = '終點';
          else label = '—';
        }
        row += 1;
        out.push({
          row,
          segIdx,
          ptIdx,
          routeName,
          x: Number.isFinite(x) ? Math.round(x) : x,
          y: Number.isFinite(y) ? Math.round(y) : y,
          role,
          label,
        });
      }
    }
    return out;
  };

  /**
   * `coord_normalized_red_blue_connect`：同「座標正規化」路網，僅列 `node_type === 'connect'`，色相依格上度數（與 K3 JSON connect 表一致）。
   * @returns {Array<{ row: number, segIdx: number, ptIdx: number, routeName: string, routeLabel: string, x: number, y: number, hue: string, deg: number, label: string }>}
   */
  const coordNormalizedRedBlueConnectList = (lyr) => {
    if (!lyr || lyr.layerId !== COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID) return [];
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) return [];
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );

    const toGridPoint = (p) => {
      if (Array.isArray(p) && p.length >= 2) {
        const x = Number(p[0]);
        const y = Number(p[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      if (p && typeof p === 'object') {
        const x = Number(p.x);
        const y = Number(p.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      return null;
    };
    const gkey = (gx, gy) => `${Math.round(gx)},${Math.round(gy)}`;
    const gridDeg = new Map();
    for (let si = 0; si < flat.length; si++) {
      const seg = flat[si];
      if (!seg || typeof seg !== 'object') continue;
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const coords = pts.map((p) => toGridPoint(p)).filter((p) => p);
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
        const ka = gkey(a[0], a[1]);
        const kb = gkey(b[0], b[1]);
        gridDeg.set(ka, (gridDeg.get(ka) || 0) + 1);
        gridDeg.set(kb, (gridDeg.get(kb) || 0) + 1);
      }
    }

    const out = [];
    let row = 0;
    for (let segIdx = 0; segIdx < flat.length; segIdx++) {
      const seg = flat[segIdx];
      if (!seg || typeof seg !== 'object') continue;
      const meta = getRouteMetaForDiag(seg, segIdx);
      const pts = Array.isArray(seg.points) ? seg.points : [];
      const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
      for (let ptIdx = 0; ptIdx < pts.length; ptIdx++) {
        const p = pts[ptIdx];
        let x = null;
        let y = null;
        let node = null;
        if (Array.isArray(p) && p.length >= 2) {
          x = p[0];
          y = p[1];
          if (p.length > 2 && p[2] && typeof p[2] === 'object') node = p[2];
        } else if (p && typeof p === 'object') {
          x = p.x;
          y = p.y;
        }
        if (!node && nodes[ptIdx] && typeof nodes[ptIdx] === 'object') node = nodes[ptIdx];
        const gx = Number(x);
        const gy = Number(y);
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
        const n = node && typeof node === 'object' ? node : {};
        if (String(n.node_type ?? '').trim() !== 'connect') continue;

        const d = gridDeg.get(gkey(gx, gy)) || 0;
        const hue = d <= 1 ? '藍' : '紅';
        const tags = n.tags && typeof n.tags === 'object' ? n.tags : {};
        let label = '';
        const sn = String(n.station_name ?? tags.station_name ?? tags.name ?? '').trim();
        const cn = n.connect_number ?? tags.connect_number;
        if (sn) label = cn != null && String(cn) !== '' ? `${sn}（轉乘#${cn}）` : sn;
        else if (cn != null && String(cn) !== '') label = `轉乘#${cn}`;
        else label = '轉乘點';

        row += 1;
        out.push({
          row,
          segIdx,
          ptIdx,
          routeName: meta.routeName,
          routeLabel: meta.routeLabel,
          x: Math.round(gx),
          y: Math.round(gy),
          hue,
          deg: d,
          label,
        });
      }
    }

    out.sort(
      (a, b) => a.y - b.y || a.x - b.x || a.routeLabel.localeCompare(b.routeLabel, 'zh-Hant')
    );
    return out;
  };

  /**
   * 「往中心聚集」線網層：由路網拆出格點折線之水平邊、垂直邊（斜邊不列入表內，僅計數）。
   * 同一路線（同一段 polyline）上連續且共線之橫／豎邊合併為一列（邊序為起迄索引）。
   * `runsInOrder` 與 horizontal／vertical 皆依路線名（zh-Hant）再依幾何排序，供 Control 總表與「下一條」步進。
   * @returns {{ horizontal: Array, vertical: Array, runsInOrder: Array, diagonalCount: number }}
   */
  /**
   * 「往中心聚集」運算輸入：示意圖管線版（schematic_toward_center_*）**只看 connect 骨架**
   * （紅/藍點＋其間 H/V/斜線；黑點站抽離不參與），故回傳去黑點之骨架；其餘層維持原樣（含黑點）。
   * 顯示/匯出仍以 layer.spaceNetworkGridJsonData（含黑點）為準；移動後再沿線把黑點放回（見寫回處）。
   */
  const resolveTowardCenterInput = (lyr) => {
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (
      resolved?.spaceNetwork?.length &&
      SCHEMATIC_TOWARD_CENTER_LAYER_IDS.includes(lyr?.layerId)
    ) {
      const full = normalizeSpaceNetworkDataToFlatSegments(
        JSON.parse(JSON.stringify(resolved.spaceNetwork))
      );
      const { skeleton } = milpReadFlatToSkeleton(full);
      return { spaceNetwork: skeleton, fromExistingSn: true };
    }
    return resolved;
  };

  const jsonGridLineOrthogonalAxisLineLists = (lyr) => {
    const empty = { horizontal: [], vertical: [], runsInOrder: [], diagonalCount: 0 };
    if (!lyr || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId)) return empty;
    const resolved = resolveTowardCenterInput(lyr);
    if (!resolved?.spaceNetwork?.length) return empty;
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const horizontal = [];
    const vertical = [];
    const runsInOrder = [];
    let diagonalCount = 0;

    const edgeKind = (pa, pb) => {
      const x0 = Array.isArray(pa) ? Number(pa[0]) : Number(pa?.x);
      const y0 = Array.isArray(pa) ? Number(pa[1]) : Number(pa?.y);
      const x1 = Array.isArray(pb) ? Number(pb[0]) : Number(pb?.x);
      const y1 = Array.isArray(pb) ? Number(pb[1]) : Number(pb?.y);
      if (
        !Number.isFinite(x0) ||
        !Number.isFinite(y0) ||
        !Number.isFinite(x1) ||
        !Number.isFinite(y1)
      ) {
        return { kind: 'skip' };
      }
      const rx0 = Math.round(x0);
      const ry0 = Math.round(y0);
      const rx1 = Math.round(x1);
      const ry1 = Math.round(y1);
      if (rx0 === rx1 && ry0 === ry1) return { kind: 'skip' };
      if (ry0 === ry1) return { kind: 'h', y: ry0 };
      if (rx0 === rx1) return { kind: 'v', x: rx0 };
      return { kind: 'd' };
    };

    for (let segIdx = 0; segIdx < flat.length; segIdx++) {
      const seg = flat[segIdx];
      const routeName = String(seg.route_name ?? seg.name ?? 'Unknown');
      const pts = Array.isArray(seg.points) ? seg.points : [];
      let i = 0;
      while (i < pts.length - 1) {
        const k0 = edgeKind(pts[i], pts[i + 1]);
        if (k0.kind === 'skip') {
          i += 1;
          continue;
        }
        if (k0.kind === 'd') {
          diagonalCount += 1;
          i += 1;
          continue;
        }
        if (k0.kind === 'h') {
          const yLine = k0.y;
          let j = i;
          while (j < pts.length - 2) {
            const kn = edgeKind(pts[j + 1], pts[j + 2]);
            if (kn.kind !== 'h' || kn.y !== yLine) break;
            j += 1;
          }
          let xMin = Infinity;
          let xMax = -Infinity;
          let ixMin = null;
          let ixMax = null;
          for (let k = i; k <= j + 1; k++) {
            const pt = pts[k];
            const gx = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
            if (!Number.isFinite(gx)) continue;
            const rx = Math.round(gx);
            xMin = Math.min(xMin, rx);
            xMax = Math.max(xMax, rx);
          }
          for (let k = i; k <= j + 1; k++) {
            const pt = pts[k];
            const gx = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
            if (!Number.isFinite(gx)) continue;
            const rx = Math.round(gx);
            if (rx === xMin && (ixMin === null || k < ixMin)) ixMin = k;
            if (rx === xMax && (ixMax === null || k > ixMax)) ixMax = k;
          }
          const i0 = ixMin ?? i;
          const i1 = ixMax ?? j + 1;
          const item = {
            segIdx,
            edgeIdxStart: i,
            edgeIdxEnd: j,
            routeName,
            y: yLine,
            xMin,
            xMax,
            span: Math.abs(xMax - xMin),
            startPtIdx: i0,
            endPtIdx: i1,
          };
          horizontal.push(item);
          runsInOrder.push({ kind: 'h', ...item });
          i = j + 1;
          continue;
        }
        if (k0.kind === 'v') {
          const xLine = k0.x;
          let j = i;
          while (j < pts.length - 2) {
            const kn = edgeKind(pts[j + 1], pts[j + 2]);
            if (kn.kind !== 'v' || kn.x !== xLine) break;
            j += 1;
          }
          let yMin = Infinity;
          let yMax = -Infinity;
          let iyMin = null;
          let iyMax = null;
          for (let k = i; k <= j + 1; k++) {
            const pt = pts[k];
            const gy = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
            if (!Number.isFinite(gy)) continue;
            const ry = Math.round(gy);
            yMin = Math.min(yMin, ry);
            yMax = Math.max(yMax, ry);
          }
          for (let k = i; k <= j + 1; k++) {
            const pt = pts[k];
            const gy = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
            if (!Number.isFinite(gy)) continue;
            const ry = Math.round(gy);
            if (ry === yMin && (iyMin === null || k < iyMin)) iyMin = k;
            if (ry === yMax && (iyMax === null || k > iyMax)) iyMax = k;
          }
          const j0 = iyMin ?? i;
          const j1 = iyMax ?? j + 1;
          const item = {
            segIdx,
            edgeIdxStart: i,
            edgeIdxEnd: j,
            routeName,
            x: xLine,
            yMin,
            yMax,
            span: Math.abs(yMax - yMin),
            startPtIdx: j0,
            endPtIdx: j1,
          };
          vertical.push(item);
          runsInOrder.push({ kind: 'v', ...item });
          i = j + 1;
        }
      }
    }
    const cmpRoute = (a, b) =>
      String(a.routeName ?? '').localeCompare(String(b.routeName ?? ''), 'zh-Hant');
    horizontal.sort((a, b) => {
      const cr = cmpRoute(a, b);
      if (cr !== 0) return cr;
      if (a.y !== b.y) return a.y - b.y;
      return a.xMin - b.xMin;
    });
    vertical.sort((a, b) => {
      const cr = cmpRoute(a, b);
      if (cr !== 0) return cr;
      if (a.x !== b.x) return a.x - b.x;
      return a.yMin - b.yMin;
    });
    runsInOrder.sort((a, b) => {
      const cr = cmpRoute(a, b);
      if (cr !== 0) return cr;
      if (a.segIdx !== b.segIdx) return a.segIdx - b.segIdx;
      if (a.edgeIdxStart !== b.edgeIdxStart) return a.edgeIdxStart - b.edgeIdxStart;
      if (a.kind !== b.kind) return a.kind === 'h' ? -1 : 1;
      return 0;
    });
    let rh = 0;
    for (const h of horizontal) {
      rh += 1;
      h.row = rh;
    }
    let rv = 0;
    for (const v of vertical) {
      rv += 1;
      v.row = rv;
    }
    let rAll = 0;
    for (const run of runsInOrder) {
      rAll += 1;
      run.rowAll = rAll;
    }
    return { horizontal, vertical, runsInOrder, diagonalCount };
  };

  /**
   * 整數軸上區間 [lo,hi]（格座標），相接或重疊則併成一條。
   * @param {Array<{ lo: number, hi: number }>} intervals
   */
  const merge1DGridLineIntervals = (intervals) => {
    if (!Array.isArray(intervals) || intervals.length === 0) return [];
    const s = intervals
      .map((it) => ({
        lo: Math.min(Number(it.lo), Number(it.hi)),
        hi: Math.max(Number(it.lo), Number(it.hi)),
      }))
      .filter((it) => Number.isFinite(it.lo) && Number.isFinite(it.hi) && it.hi > it.lo)
      .sort((a, b) => a.lo - b.lo);
    if (!s.length) return [];
    const out = [];
    let cur = { ...s[0] };
    for (let i = 1; i < s.length; i++) {
      const n = s[i];
      if (n.lo <= cur.hi) cur.hi = Math.max(cur.hi, n.hi);
      else {
        out.push(cur);
        cur = { ...n };
      }
    }
    out.push(cur);
    return out;
  };

  /**
   * 固定網格 y：各 route 上之橫段投到 x 軸後，跨 route 區間可相接則算**同一條**，回傳每條 span（格步）。
   */
  const globalMergedHorizontalLineSpansFromRuns = (horizontal) => {
    const byY = new Map();
    for (const h of horizontal) {
      const y = Math.round(Number(h.y));
      const lo = Math.min(Number(h.xMin), Number(h.xMax));
      const hi = Math.max(Number(h.xMin), Number(h.xMax));
      if (!Number.isFinite(y) || !Number.isFinite(lo) || !Number.isFinite(hi)) continue;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ lo, hi });
    }
    const spans = [];
    for (const intvs of byY.values()) {
      for (const m of merge1DGridLineIntervals(intvs)) {
        spans.push(m.hi - m.lo);
      }
    }
    return spans;
  };

  /** 固定網格 x：直段跨 route 在 y 上合併 */
  const globalMergedVerticalLineSpansFromRuns = (vertical) => {
    const byX = new Map();
    for (const v of vertical) {
      const x = Math.round(Number(v.x));
      const lo = Math.min(Number(v.yMin), Number(v.yMax));
      const hi = Math.max(Number(v.yMin), Number(v.yMax));
      if (!Number.isFinite(x) || !Number.isFinite(lo) || !Number.isFinite(hi)) continue;
      if (!byX.has(x)) byX.set(x, []);
      byX.get(x).push({ lo, hi });
    }
    const spans = [];
    for (const intvs of byX.values()) {
      for (const m of merge1DGridLineIntervals(intvs)) {
        spans.push(m.hi - m.lo);
      }
    }
    return spans;
  };

  /**
   * 與 {@link jsonGridLineOrthogonalAxisLineLists} 一致之格步／斜線計數。
   * 「條數與平均長度」：**跨 route**，同網格 y（橫）或同 x（直）上投影子區間相接則併一條（不必同 route_name）。
   */
  const jsonGridLineOrthogonalHVEdgeTotals = (lyr) => {
    const { horizontal, vertical, diagonalCount } = jsonGridLineOrthogonalAxisLineLists(lyr);
    const sumSpan = (arr) =>
      arr.reduce((s, it) => {
        const sp = Number(it?.span);
        return s + (Number.isFinite(sp) && sp > 0 ? sp : 0);
      }, 0);
    const hvSteps = sumSpan(horizontal) + sumSpan(vertical);
    const d = Math.max(0, Math.round(Number(diagonalCount)) || 0);
    const total = hvSteps + d;
    const ratioPct = total > 0 ? (100 * hvSteps) / total : null;

    const spansH = globalMergedHorizontalLineSpansFromRuns(horizontal);
    const spansV = globalMergedVerticalLineSpansFromRuns(vertical);
    const sumHglob = spansH.reduce((a, b) => a + b, 0);
    const sumVglob = spansV.reduce((a, b) => a + b, 0);
    const nH = spansH.length;
    const nV = spansV.length;
    const nHVLines = nH + nV;
    const avgH = nH > 0 ? sumHglob / nH : null;
    const avgV = nV > 0 ? sumVglob / nV : null;
    const avgHV = nHVLines > 0 ? (sumHglob + sumVglob) / nHVLines : null;
    return {
      hvSteps,
      diagonalEdges: d,
      total,
      ratioPct,
      nH,
      nV,
      nHVLines,
      avgH,
      avgV,
      avgHV,
    };
  };

  /** 兩個「往中心聚集」圖層按鈕下顯示：HV／斜線／合計、HV 佔比、同軸跨路線相接之橫／豎「條」平均長度。 */
  const jsonGridLineOrthogonalHVEdgeRatioLabel = (lyr) => {
    const t = jsonGridLineOrthogonalHVEdgeTotals(lyr);
    if (t.total <= 0) {
      return '尚無可計數邊段（請開啟本圖層並確認路網資料）。';
    }
    const pct = t.ratioPct != null ? `${t.ratioPct.toFixed(1)}%` : '—';
    const base = `水平＋垂直 ${t.hvSteps} 斜線 ${t.diagonalEdges} 合計 ${t.total} （水平＋垂直占全部可計數邊 ${pct}）`;
    if (t.nHVLines <= 0) {
      return `${base}。無水平／垂直線（僅斜線或其它）。`;
    }
    const fmt = (x) => (x != null && Number.isFinite(x) ? x.toFixed(1) : '—');
    const avgAll = fmt(t.avgHV);
    const partH = t.nH > 0 ? `水平 ${t.nH} 條均 ${fmt(t.avgH)}` : '水平 0 條';
    const partV = t.nV > 0 ? `垂直 ${t.nV} 條均 ${fmt(t.avgV)}` : '垂直 0 條';
    return `${base}。同網格橫線／直線上跨路線可相接則併一條：共 ${t.nHVLines} 條，平均長度 ${avgAll} 格步（${partH}；${partV}）。`;
  };

  /**
   * 列／欄表目前項對應 schematic 橘色 highlight：`點→[segIdx,ptIdx]`；`線→['ortho',segIdx,e0,e1]` 或 `['orthoBundle',[...]]`
   */
  const lineOrthoTowardCrossReportItemHighlight = (lyr, flat, picksMap, tableAxis, item) => {
    if (!lyr || !item) return null;
    if (item.kind === '點') {
      const ov = item.orthoV;
      if (ov?.segIdx != null && ov?.ptIdx != null && flat[ov.segIdx]?.points?.[ov.ptIdx] != null)
        return [ov.segIdx, ov.ptIdx];
      const p = parseParenGridCoordOrtho(item.startCoord);
      if (!p) return null;
      const pr = pickOrthoVertexRefPreferRouteOrder(flat, picksMap, p.gx, p.gy);
      return pr ? [pr.segIdx, pr.ptIdx] : null;
    }
    if (item.kind !== '線') return null;

    const pushValidOrthoHlQuad = (out, cand) => {
      if (
        !Array.isArray(cand) ||
        cand[0] !== 'ortho' ||
        cand.length < 4 ||
        !Number.isFinite(Number(cand[1])) ||
        !Number.isFinite(Number(cand[2])) ||
        !Number.isFinite(Number(cand[3]))
      )
        return;
      const si = Number(cand[1]);
      const e0 = Number(cand[2]);
      const e1 = Number(cand[3]);
      const pts = flat[si]?.points;
      if (Array.isArray(pts) && e0 <= e1 && e1 < pts.length - 1) out.push(['ortho', si, e0, e1]);
    };

    const bundleQuads = [];
    if (Array.isArray(item.orthoHlBundle)) {
      for (const q of item.orthoHlBundle) pushValidOrthoHlQuad(bundleQuads, q);
    }
    if (!bundleQuads.length) pushValidOrthoHlQuad(bundleQuads, item.orthoHl);

    const mergedHorBandEndpointTouch = (h, band) => {
      const hxLo = Math.min(h.xMin, h.xMax);
      const hxHi = Math.max(h.xMin, h.xMax);
      let s = 0;
      if (band.lo >= hxLo && band.lo <= hxHi) s += 2;
      if (band.hi >= hxLo && band.hi <= hxHi) s += 2;
      return s;
    };
    const mergedVerBandEndpointTouch = (v0, band) => {
      const vyLo = Math.min(v0.yMin, v0.yMax);
      const vyHi = Math.max(v0.yMin, v0.yMax);
      let s = 0;
      if (band.lo >= vyLo && band.lo <= vyHi) s += 2;
      if (band.hi >= vyLo && band.hi <= vyHi) s += 2;
      return s;
    };

    if (bundleQuads.length === 1) return bundleQuads[0];
    if (bundleQuads.length > 1) return ['orthoBundle', bundleQuads];

    const { horizontal, vertical } = jsonGridLineOrthogonalAxisLineLists(lyr);
    const overlapLen = (aLo, aHi, bLo, bHi) => {
      const lo = Math.max(aLo, bLo);
      const hi = Math.min(aHi, bHi);
      return lo <= hi ? hi - lo : -1;
    };
    if (tableAxis === 'row') {
      const yy =
        item.axisY != null && Number.isFinite(Number(item.axisY)) ? Number(item.axisY) : null;
      const a = parseParenGridCoordOrtho(item.startCoord);
      const b = parseParenGridCoordOrtho(item.endCoord ?? '');
      if (yy === null || !a || !b) return null;
      const lo = Math.min(a.gx, b.gx);
      const hi = Math.max(a.gx, b.gx);
      const band = { lo, hi };
      const cand = horizontal.filter((h) => {
        if (h.y !== yy) return false;
        const hxLo = Math.min(h.xMin, h.xMax);
        const hxHi = Math.max(h.xMin, h.xMax);
        return overlapLen(lo, hi, hxLo, hxHi) >= 0;
      });
      if (!cand.length) return null;
      cand.sort((u, v) => {
        const su = mergedHorBandEndpointTouch(u, band);
        const sv = mergedHorBandEndpointTouch(v, band);
        if (sv !== su) return sv - su;
        const uxLo = Math.min(u.xMin, u.xMax);
        const uxHi = Math.max(u.xMin, u.xMax);
        const vxLo = Math.min(v.xMin, v.xMax);
        const vxHi = Math.max(v.xMin, v.xMax);
        const ou = overlapLen(lo, hi, uxLo, uxHi);
        const ov = overlapLen(lo, hi, vxLo, vxHi);
        if (ov !== ou) return ov - ou;
        return (v.span ?? 0) - (u.span ?? 0);
      });
      const h0 = cand[0];
      return ['ortho', h0.segIdx, h0.edgeIdxStart, h0.edgeIdxEnd];
    }
    const xx =
      item.axisX != null && Number.isFinite(Number(item.axisX)) ? Number(item.axisX) : null;
    const a = parseParenGridCoordOrtho(item.startCoord);
    const b = parseParenGridCoordOrtho(item.endCoord ?? '');
    if (xx === null || !a || !b) return null;
    const lo = Math.min(a.gy, b.gy);
    const hi = Math.max(a.gy, b.gy);
    const band = { lo, hi };
    const cand = vertical.filter((v0) => {
      if (v0.x !== xx) return false;
      const vyLo = Math.min(v0.yMin, v0.yMax);
      const vyHi = Math.max(v0.yMin, v0.yMax);
      return overlapLen(lo, hi, vyLo, vyHi) >= 0;
    });
    if (!cand.length) return null;
    cand.sort((u, v) => {
      const su = mergedVerBandEndpointTouch(u, band);
      const sv = mergedVerBandEndpointTouch(v, band);
      if (sv !== su) return sv - su;
      const uyLo = Math.min(u.yMin, u.yMax);
      const uyHi = Math.max(u.yMin, u.yMax);
      const vyLo = Math.min(v.yMin, v.yMax);
      const vyHi = Math.max(v.yMin, v.yMax);
      const ou = overlapLen(lo, hi, uyLo, uyHi);
      const ov = overlapLen(lo, hi, vyLo, vyHi);
      if (ov !== ou) return ov - ou;
      return (v.span ?? 0) - (u.span ?? 0);
    });
    const vPick = cand[0];
    return ['ortho', vPick.segIdx, vPick.edgeIdxStart, vPick.edgeIdxEnd];
  };

  /**
   * 與示意圖紅十字對齊：中心＝所有「紅/黃/藍/紫點（交叉點 connect／端點 terminal＝各路段端點，
   * 不含路線上的黑點站）」之網格座標，x、y 各自取**中位數**，再取整數格。
   */
  const gridOrthoCrossCenterRoundedFromFlat = (flat) => {
    const xs = [];
    const ys = [];
    const seen = new Set();
    const addEnd = (p) => {
      const x = Array.isArray(p) ? Number(p[0]) : Number(p?.x);
      const y = Array.isArray(p) ? Number(p[1]) : Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const rx = Math.round(x);
      const ry = Math.round(y);
      const k = `${rx},${ry}`;
      if (seen.has(k)) return;
      seen.add(k);
      xs.push(rx);
      ys.push(ry);
    };
    if (Array.isArray(flat)) {
      for (const seg of flat) {
        const pts = Array.isArray(seg?.points) ? seg.points : [];
        if (pts.length < 1) continue;
        addEnd(pts[0]); // 路段起點（紅/藍/黃/紫，非黑點）
        addEnd(pts[pts.length - 1]); // 路段迄點
      }
    }
    if (!xs.length) {
      return { cx: 0, cy: 0 };
    }
    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    return {
      cx: Math.round(median(xs)),
      cy: Math.round(median(ys)),
    };
  };

  /** 目前路網（flat）所有頂點的整數格包圍盒；無有效點回 null。 */
  const flatGridBBoxOrNull = (flat) => {
    if (!Array.isArray(flat)) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const seg of flat) {
      const pts = Array.isArray(seg?.points) ? seg.points : [];
      for (const p of pts) {
        const x = Math.round(Number(Array.isArray(p) ? p[0] : p?.x));
        const y = Math.round(Number(Array.isArray(p) ? p[1] : p?.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (minX === Infinity) return null;
    return { minX, maxX, minY, maxY };
  };

  /**
   * 鎖定的紅十字中心是否仍適用於「目前」路網：須落在目前 bbox 內。
   * 換資料（如大檔→小檔）時，舊中心會跑到新路網範圍外 → 視為失效，避免每顆點都朝畫面外的中心移而全被擋。
   */
  const frozenCenterValidForFlat = (fc, flat) => {
    if (!fc || !Number.isFinite(Number(fc.cx)) || !Number.isFinite(Number(fc.cy))) return false;
    const bb = flatGridBBoxOrNull(flat);
    if (!bb) return false;
    const cx = Number(fc.cx);
    const cy = Number(fc.cy);
    return cx >= bb.minX && cx <= bb.maxX && cy >= bb.minY && cy <= bb.maxY;
  };

  /**
   * `orthogonal_toward_center_hv`／`orthogonal_toward_center_vh`：讀取列／欄表／提示用之紅十字格 —
   * 若有**且仍落在目前路網內**之鎖定值則回傳之，否則（含換資料後失效）回目前路網 bbox 中點（不寫入 layer）。
   */
  const readLineOrthoTowardCrossCenterForDisplay = (lyr, flat) => {
    const fc = lyr?.lineOrthoTowardCrossFrozenCenter;
    if (lyr && frozenCenterValidForFlat(fc, flat)) {
      return { cx: Math.round(Number(fc.cx)), cy: Math.round(Number(fc.cy)) };
    }
    return gridOrthoCrossCenterRoundedFromFlat(flat);
  };

  /**
   * 第一次「朝紅十字縮進」時，若尚未鎖定（或舊鎖定值已不在目前路網內＝換資料失效）則將紅十字格
   * 寫入 `layer.lineOrthoTowardCrossFrozenCenter`（之後不因路網平移而改基準）。
   */
  const lockLineOrthoTowardCrossCenterFromFlatIfUnset = (lyr, flat) => {
    if (!lyr) return gridOrthoCrossCenterRoundedFromFlat(flat);
    const fc = lyr.lineOrthoTowardCrossFrozenCenter;
    if (frozenCenterValidForFlat(fc, flat)) {
      return { cx: Math.round(Number(fc.cx)), cy: Math.round(Number(fc.cy)) };
    }
    const cross = gridOrthoCrossCenterRoundedFromFlat(flat);
    lyr.lineOrthoTowardCrossFrozenCenter = { cx: cross.cx, cy: cross.cy };
    return cross;
  };

  /** 離十字中心的距離順序：0 → +1 → −1 → +2 → −2 → …（同 Δ 次要鍵為函數返回值） */
  const compareOrbitSignedDelta = (da, db) => {
    const aa = Math.abs(da);
    const ab = Math.abs(db);
    if (aa !== ab) return aa - ab;
    if (da === 0 || db === 0) return da - db;
    if (da > 0 && db < 0) return -1;
    if (da < 0 && db > 0) return 1;
    return da - db;
  };

  const formatSignedGridDelta = (d) => {
    if (!Number.isFinite(d)) return '—';
    if (d === 0) return '0';
    return d > 0 ? `+${d}` : `${d}`;
  };

  /** 水平／垂直折線頂點：站名（與 point_orthogonal 頂點表一致規則）與網格座標字串 */
  const hvVertexStationAndCoord = (seg, ptIdx) => {
    const pts = Array.isArray(seg?.points) ? seg.points : [];
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    const nPts = pts.length;
    const pt = pts[ptIdx];
    let x = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
    let y = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
    const rx = Number.isFinite(x) ? Math.round(x) : x;
    const ry = Number.isFinite(y) ? Math.round(y) : y;
    const coordStr =
      Number.isFinite(Number(rx)) && Number.isFinite(Number(ry)) ? `(${rx},${ry})` : '—';

    const n = nodes?.[ptIdx];
    let label = '';
    if (n && typeof n === 'object') {
      const sn = String(n.station_name ?? n.tags?.station_name ?? n.tags?.name ?? '').trim();
      const cn = n.connect_number ?? n.tags?.connect_number;
      if (sn) label = cn != null && String(cn) !== '' ? `${sn}（轉乘#${cn}）` : sn;
      else if (cn != null && String(cn) !== '') label = `轉乘#${cn}`;
      else if (n.node_type === 'connect') label = '轉乘點';
    }
    if (!label) {
      if (ptIdx === 0) label = '起點';
      else if (ptIdx === nPts - 1) label = '終點';
      else label = '—';
    }
    return { station: label, coord: coordStr };
  };

  /** 同列／同欄相接或重疊之整數區間合併，路線名採並集並以 「／」 顯示 */
  const mergeIntervalsWithRoutes = (items) => {
    if (!Array.isArray(items) || items.length === 0) return [];
    const sorted = [...items].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    let curLo = sorted[0].lo;
    let curHi = sorted[0].hi;
    const curRoutes = new Set(sorted[0].routes ?? []);
    const outBare = [];
    for (let i = 1; i < sorted.length; i++) {
      const it = sorted[i];
      if (it.lo <= curHi + 1) {
        curHi = Math.max(curHi, it.hi);
        const addSrc = it.routes instanceof Set ? it.routes : new Set(it.routes ?? []);
        for (const r of addSrc) curRoutes.add(r);
      } else {
        outBare.push({ lo: curLo, hi: curHi, routes: new Set(curRoutes) });
        curLo = it.lo;
        curHi = it.hi;
        curRoutes.clear();
        const addSrc = it.routes instanceof Set ? it.routes : new Set(it.routes ?? []);
        for (const r of addSrc) curRoutes.add(r);
      }
    }
    outBare.push({ lo: curLo, hi: curHi, routes: new Set(curRoutes) });
    return outBare.map((m) => {
      const arr = [...m.routes].sort((a, b) =>
        String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hant')
      );
      const nonEmpty = arr.filter((s) => String(s ?? '').trim() !== '');
      return {
        lo: m.lo,
        hi: m.hi,
        routeLabel: nonEmpty.length > 0 ? nonEmpty.join('／') : arr.length ? arr.join('／') : '—',
      };
    });
  };

  /** 各路網段頂點四捨五入索引（格座標 → 對應 (segIdx,ptIdx,route)…） */
  const buildOrthoGridRoundedVertexPickIndex = (flat) => {
    const m = new Map();
    if (!Array.isArray(flat)) return m;
    for (let segIdx = 0; segIdx < flat.length; segIdx++) {
      const seg = flat[segIdx];
      const routeName = String(seg.route_name ?? seg.name ?? '').trim();
      const pts = Array.isArray(seg.points) ? seg.points : [];
      for (let ptIdx = 0; ptIdx < pts.length; ptIdx++) {
        const p = pts[ptIdx];
        const x = Array.isArray(p) ? Number(p[0]) : Number(p?.x);
        const y = Array.isArray(p) ? Number(p[1]) : Number(p?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const gx = Math.round(x);
        const gy = Math.round(y);
        const k = `${gx},${gy}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push({
          segIdx,
          ptIdx,
          route: routeName || 'Unknown',
        });
      }
    }
    return m;
  };

  const pickOrthoVertexStationPreferRouteOrder = (flat, picksMap, gx, gy) => {
    const pts = picksMap.get(`${gx},${gy}`);
    if (!pts || pts.length === 0) {
      const coord = Number.isFinite(gx) && Number.isFinite(gy) ? `(${gx},${gy})` : '—';
      return { station: '—', coord };
    }
    const sorted = [...pts].sort((a, b) =>
      String(a.route ?? '').localeCompare(String(b.route ?? ''), 'zh-Hant')
    );
    const fst = sorted[0];
    const seg = flat[fst.segIdx];
    return hvVertexStationAndCoord(seg, fst.ptIdx);
  };

  const parseParenGridCoordOrtho = (s) => {
    const m = String(s ?? '').match(/\((-?\d+),(-?\d+)\)/);
    if (!m) return null;
    return { gx: Number(m[1]), gy: Number(m[2]) };
  };

  const pickOrthoVertexRefPreferRouteOrder = (flat, picksMap, gx, gy) => {
    const pts = picksMap.get(`${gx},${gy}`);
    if (!pts?.length) return null;
    const sorted = [...pts].sort((a, b) =>
      String(a.route ?? '').localeCompare(String(b.route ?? ''), 'zh-Hant')
    );
    return { segIdx: sorted[0].segIdx, ptIdx: sorted[0].ptIdx };
  };

  const collectRoutesAtOrthoGridVertex = (picksMap, gx, gy) => {
    const pts = picksMap.get(`${gx},${gy}`);
    if (!pts?.length) return '—';
    const r = [...new Set(pts.map((p) => String(p.route ?? '').trim() || 'Unknown'))].sort((a, b) =>
      a.localeCompare(b, 'zh-Hant')
    );
    return r.length ? r.join('／') : '—';
  };

  /**
   * `temp`：**水平／垂直區段跨路線可相接處視為一串**後列「線」。**任一頂點若不在任一條該網格列上的水平區間覆蓋內**（僅評估 HV
   * 區段組合結果）則為「點」。欄表對網格 x **垂直覆蓋**對稱處理。yΔ／xΔ 同上（紅十字中心）。
   */
  const jsonGridLineOrthogonalRowColPointOrLineReport = (lyr) => {
    const empty = {
      rowTable: [],
      colTable: [],
      centerCx: null,
      centerCy: null,
    };
    if (!lyr || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId)) return empty;
    const resolved = resolveTowardCenterInput(lyr);
    if (!resolved?.spaceNetwork?.length) return empty;
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const cross = readLineOrthoTowardCrossCenterForDisplay(lyr, flat);
    const centerCx = cross.cx;
    const centerCy = cross.cy;
    const picksMap = buildOrthoGridRoundedVertexPickIndex(flat);
    const { horizontal: horizontals, vertical: verticals } =
      jsonGridLineOrthogonalAxisLineLists(lyr);

    const horBandsByY = new Map();
    for (const h of horizontals) {
      const xa = Math.min(h.xMin, h.xMax);
      const xb = Math.max(h.xMin, h.xMax);
      const rn = String(h.routeName ?? '').trim();
      const arr = horBandsByY.get(h.y) ?? [];
      arr.push({ lo: xa, hi: xb, routes: new Set([rn || '']) });
      horBandsByY.set(h.y, arr);
    }
    /** @type Map<number, Array<{ lo: number, hi: number, routeLabel: string }>> */
    const mergedHRow = new Map();
    for (const [yy, intervals] of horBandsByY) {
      mergedHRow.set(yy, mergeIntervalsWithRoutes(intervals));
    }

    const verBandsByX = new Map();
    for (const v of verticals) {
      const ya = Math.min(v.yMin, v.yMax);
      const yb = Math.max(v.yMin, v.yMax);
      const rn = String(v.routeName ?? '').trim();
      const arr = verBandsByX.get(v.x) ?? [];
      arr.push({ lo: ya, hi: yb, routes: new Set([rn || '']) });
      verBandsByX.set(v.x, arr);
    }
    const mergedVX = new Map();
    for (const [xx, intervals] of verBandsByX) {
      mergedVX.set(xx, mergeIntervalsWithRoutes(intervals));
    }

    const isCoveredHorizBand = (gx, gy) => {
      const bands = mergedHRow.get(gy);
      if (!bands?.length) return false;
      return bands.some((b) => gx >= b.lo && gx <= b.hi);
    };
    const isCoveredVertBand = (gx, gy) => {
      const bands = mergedVX.get(gx);
      if (!bands?.length) return false;
      return bands.some((b) => gy >= b.lo && gy <= b.hi);
    };

    const hvOverlapLenSeg = (lo, hi, a, b) => {
      const u = Math.min(a, b);
      const v = Math.max(a, b);
      const L = Math.max(lo, u);
      const R = Math.min(hi, v);
      return L <= R ? R - L : -1;
    };

    const mergedHorBandEndpointTouch = (h, band) => {
      const hxLo = Math.min(h.xMin, h.xMax);
      const hxHi = Math.max(h.xMin, h.xMax);
      let s = 0;
      if (band.lo >= hxLo && band.lo <= hxHi) s += 2;
      if (band.hi >= hxLo && band.hi <= hxHi) s += 2;
      return s;
    };
    const mergedVerBandEndpointTouch = (v0, band) => {
      const vyLo = Math.min(v0.yMin, v0.yMax);
      const vyHi = Math.max(v0.yMin, v0.yMax);
      let s = 0;
      if (band.lo >= vyLo && band.lo <= vyHi) s += 2;
      if (band.hi >= vyLo && band.hi <= vyHi) s += 2;
      return s;
    };

    const rowTable = [];
    const colTable = [];

    const pushRow = (o) => {
      const dy = o.axisY - centerCy;
      rowTable.push({
        ...o,
        deltaY: dy,
        deltaYLabel: formatSignedGridDelta(dy),
      });
    };
    const pushCol = (o) => {
      const dx = o.axisX - centerCx;
      colTable.push({
        ...o,
        deltaX: dx,
        deltaXLabel: formatSignedGridDelta(dx),
      });
    };

    for (const [yy, bands] of mergedHRow) {
      for (const b of bands) {
        let startA = pickOrthoVertexStationPreferRouteOrder(flat, picksMap, b.lo, yy);
        let endZ = pickOrthoVertexStationPreferRouteOrder(flat, picksMap, b.hi, yy);
        const band = { lo: b.lo, hi: b.hi };
        const overlaps = horizontals.filter((h) => {
          if (h.y !== yy) return false;
          const hxLo = Math.min(h.xMin, h.xMax);
          const hxHi = Math.max(h.xMin, h.xMax);
          return hvOverlapLenSeg(b.lo, b.hi, hxLo, hxHi) >= 0;
        });
        overlaps.sort((u, v) => {
          const su = mergedHorBandEndpointTouch(u, band);
          const sv = mergedHorBandEndpointTouch(v, band);
          if (sv !== su) return sv - su;
          const uxLo = Math.min(u.xMin, u.xMax);
          const uxHi = Math.max(u.xMin, u.xMax);
          const vxLo = Math.min(v.xMin, v.xMax);
          const vxHi = Math.max(v.xMin, v.xMax);
          const ou = hvOverlapLenSeg(b.lo, b.hi, uxLo, uxHi);
          const ov = hvOverlapLenSeg(b.lo, b.hi, vxLo, vxHi);
          if (ov !== ou) return ov - ou;
          return (v.span ?? 0) - (u.span ?? 0);
        });
        const overlapClusters =
          overlaps.length > 1
            ? clusterOrthoOverlapsForMergedBand(flat, overlaps)
            : overlaps.length === 1
              ? [[overlaps[0]]]
              : [];

        for (const group of overlapClusters.length ? overlapClusters : [null]) {
          let startAG = startA;
          let endZG = endZ;
          /** @type {Array<{ segIdx: number, pi0: number, pi1: number }>} */
          let orthoRuns = [];
          let orthoLineHl = null;
          let orthoHlBundle = null;
          let orthoHlNote = undefined;
          if (group?.length) {
            orthoRuns = group.map((h) => ({
              segIdx: h.segIdx,
              pi0: Math.min(h.startPtIdx, h.endPtIdx),
              pi1: Math.max(h.startPtIdx, h.endPtIdx),
            }));
            orthoHlBundle = group.map((h) => [
              'ortho',
              Number(h.segIdx),
              Number(h.edgeIdxStart),
              Number(h.edgeIdxEnd),
            ]);
            orthoLineHl = orthoHlBundle[0];
            const nAll = overlaps.length;
            const nGrp = group.length;
            const nCl = overlapClusters.length;
            if (nAll > 1 && nCl === 1) {
              orthoHlNote = `表中「線」來自合併橫區間（${nAll} 段重合）；橘色為全部重合區段（與表中列一致）；起迄取優先段（較緊貼合併區間端點者）頂點並依 x 排序。`;
            } else if (nCl > 1) {
              orthoHlNote = `合併橫區間原含 ${nAll} 段重合，路網上拆成 ${nCl} 組互不相連；本列為其中一組（${nGrp} 段相連）；橘色僅標示本組。`;
            }
            const hPri = group[0];
            const segPri = flat[hPri.segIdx];
            if (segPri?.points) {
              const iLo = Math.min(hPri.startPtIdx, hPri.endPtIdx);
              const iHi = Math.max(hPri.startPtIdx, hPri.endPtIdx);
              const Va = hvVertexStationAndCoord(segPri, iLo);
              const Vz = hvVertexStationAndCoord(segPri, iHi);
              const ga = parseParenGridCoordOrtho(Va.coord);
              const gz = parseParenGridCoordOrtho(Vz.coord);
              if (ga && gz && ga.gy === yy && gz.gy === yy) {
                if (ga.gx <= gz.gx) {
                  startAG = Va;
                  endZG = Vz;
                } else {
                  startAG = Vz;
                  endZG = Va;
                }
              } else {
                startAG = Va;
                endZG = Vz;
              }
            }
          }
          pushRow({
            axisY: yy,
            kind: '線',
            routeName: b.routeLabel,
            startStation: startAG.station,
            startCoord: startAG.coord,
            endStation: endZG.station,
            endCoord: endZG.coord,
            orthoHlNote,
            orthoRuns: orthoRuns.length ? orthoRuns : undefined,
            orthoHl: orthoLineHl ?? undefined,
            orthoHlBundle: orthoHlBundle ?? undefined,
          });
        }
      }
    }

    for (const [xx, bands] of mergedVX) {
      for (const b of bands) {
        let startA = pickOrthoVertexStationPreferRouteOrder(flat, picksMap, xx, b.lo);
        let endZ = pickOrthoVertexStationPreferRouteOrder(flat, picksMap, xx, b.hi);
        const band = { lo: b.lo, hi: b.hi };
        const overlaps = verticals.filter((v0) => {
          if (v0.x !== xx) return false;
          const vyLo = Math.min(v0.yMin, v0.yMax);
          const vyHi = Math.max(v0.yMin, v0.yMax);
          return hvOverlapLenSeg(b.lo, b.hi, vyLo, vyHi) >= 0;
        });
        overlaps.sort((u, v) => {
          const su = mergedVerBandEndpointTouch(u, band);
          const sv = mergedVerBandEndpointTouch(v, band);
          if (sv !== su) return sv - su;
          const uyLo = Math.min(u.yMin, u.yMax);
          const uyHi = Math.max(u.yMin, u.yMax);
          const vyLo = Math.min(v.yMin, v.yMax);
          const vyHi = Math.max(v.yMin, v.yMax);
          const ou = hvOverlapLenSeg(b.lo, b.hi, uyLo, uyHi);
          const ov = hvOverlapLenSeg(b.lo, b.hi, vyLo, vyHi);
          if (ov !== ou) return ov - ou;
          return (v.span ?? 0) - (u.span ?? 0);
        });
        const overlapClustersCol =
          overlaps.length > 1
            ? clusterOrthoOverlapsForMergedBand(flat, overlaps)
            : overlaps.length === 1
              ? [[overlaps[0]]]
              : [];

        for (const group of overlapClustersCol.length ? overlapClustersCol : [null]) {
          let startAG = startA;
          let endZG = endZ;
          let orthoRuns = [];
          let orthoLineHl = null;
          let orthoHlBundle = null;
          let orthoHlNote = undefined;
          if (group?.length) {
            orthoRuns = group.map((vv) => ({
              segIdx: vv.segIdx,
              pi0: Math.min(vv.startPtIdx, vv.endPtIdx),
              pi1: Math.max(vv.startPtIdx, vv.endPtIdx),
            }));
            orthoHlBundle = group.map((vv) => [
              'ortho',
              Number(vv.segIdx),
              Number(vv.edgeIdxStart),
              Number(vv.edgeIdxEnd),
            ]);
            orthoLineHl = orthoHlBundle[0];
            const nAll = overlaps.length;
            const nGrp = group.length;
            const nCl = overlapClustersCol.length;
            if (nAll > 1 && nCl === 1) {
              orthoHlNote = `表中「線」來自合併直區間（${nAll} 段重合）；橘色為全部重合區段；起迄取優先段（較緊貼合併區間端點者）頂點並依 y 排序。`;
            } else if (nCl > 1) {
              orthoHlNote = `合併直區間原含 ${nAll} 段重合，路網上拆成 ${nCl} 組互不相連；本列為其中一組（${nGrp} 段相連）；橘色僅標示本組。`;
            }
            const vPri = group[0];
            const segPri = flat[vPri.segIdx];
            if (segPri?.points) {
              const iLo = Math.min(vPri.startPtIdx, vPri.endPtIdx);
              const iHi = Math.max(vPri.startPtIdx, vPri.endPtIdx);
              const Va = hvVertexStationAndCoord(segPri, iLo);
              const Vz = hvVertexStationAndCoord(segPri, iHi);
              const ga = parseParenGridCoordOrtho(Va.coord);
              const gz = parseParenGridCoordOrtho(Vz.coord);
              if (ga && gz && ga.gx === xx && gz.gx === xx) {
                if (ga.gy <= gz.gy) {
                  startAG = Va;
                  endZG = Vz;
                } else {
                  startAG = Vz;
                  endZG = Va;
                }
              } else {
                startAG = Va;
                endZG = Vz;
              }
            }
          }
          pushCol({
            axisX: xx,
            kind: '線',
            routeName: b.routeLabel,
            startStation: startAG.station,
            startCoord: startAG.coord,
            endStation: endZG.station,
            endCoord: endZG.coord,
            orthoHlNote,
            orthoRuns: orthoRuns.length ? orthoRuns : undefined,
            orthoHl: orthoLineHl ?? undefined,
            orthoHlBundle: orthoHlBundle ?? undefined,
          });
        }
      }
    }

    const seenDotRow = new Set();
    const seenDotCol = new Set();
    for (const key of picksMap.keys()) {
      const [sx, sy] = key.split(',').map(Number);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

      if (!isCoveredHorizBand(sx, sy)) {
        const dk = `${sx},${sy}`;
        if (!seenDotRow.has(dk)) {
          seenDotRow.add(dk);
          const sc = pickOrthoVertexStationPreferRouteOrder(flat, picksMap, sx, sy);
          const orthoDot = pickOrthoVertexRefPreferRouteOrder(flat, picksMap, sx, sy);
          pushRow({
            axisY: sy,
            kind: '點',
            routeName: collectRoutesAtOrthoGridVertex(picksMap, sx, sy),
            startStation: sc.station,
            startCoord: sc.coord,
            endStation: '—',
            endCoord: '—',
            orthoV: orthoDot ? { segIdx: orthoDot.segIdx, ptIdx: orthoDot.ptIdx } : undefined,
          });
        }
      }

      if (!isCoveredVertBand(sx, sy)) {
        const dk = `${sx},${sy}`;
        if (!seenDotCol.has(dk)) {
          seenDotCol.add(dk);
          const sc = pickOrthoVertexStationPreferRouteOrder(flat, picksMap, sx, sy);
          const orthoDot = pickOrthoVertexRefPreferRouteOrder(flat, picksMap, sx, sy);
          pushCol({
            axisX: sx,
            kind: '點',
            routeName: collectRoutesAtOrthoGridVertex(picksMap, sx, sy),
            startStation: sc.station,
            startCoord: sc.coord,
            endStation: '—',
            endCoord: '—',
            orthoV: orthoDot ? { segIdx: orthoDot.segIdx, ptIdx: orthoDot.ptIdx } : undefined,
          });
        }
      }
    }

    const cmpZh = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hant');
    rowTable.sort((p, q) => {
      const co = compareOrbitSignedDelta(p.deltaY, q.deltaY);
      if (co !== 0) return co;
      if (p.axisY !== q.axisY) return p.axisY - q.axisY;
      if (p.kind !== q.kind) return p.kind === '線' ? -1 : 1;
      const cr = cmpZh(p.routeName, q.routeName);
      if (cr !== 0) return cr;
      return cmpZh(p.startCoord, q.startCoord);
    });
    colTable.sort((p, q) => {
      const co = compareOrbitSignedDelta(p.deltaX, q.deltaX);
      if (co !== 0) return co;
      if (p.axisX !== q.axisX) return p.axisX - q.axisX;
      if (p.kind !== q.kind) return p.kind === '線' ? -1 : 1;
      const cr = cmpZh(p.routeName, q.routeName);
      if (cr !== 0) return cr;
      return cmpZh(p.startCoord, q.startCoord);
    });

    return { rowTable, colTable, centerCx, centerCy };
  };

  /** `temp`／「先直後橫」層：依隊列對當項設 highlight；單次 Pulse 最多移一格；連按／自動再行下一隊列項。 */
  function makeLineOrthoTowardCrossUiState() {
    return {
      seqIdx: 0,
      lastHint: '',
      tableBump: 0,
      autoActive: false,
      autoNoMoveStreak: 0,
      oneClickRunning: false,
    };
  }
  /** @type Record<string, ReturnType<typeof makeLineOrthoTowardCrossUiState>> */
  const lineOrthoTowardCrossUiByLayerId = reactive(
    Object.fromEntries(
      LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.map((id) => [id, makeLineOrthoTowardCrossUiState()])
    )
  );
  /** @type Record<string, ReturnType<typeof setInterval> | null> */
  const lineOrthoTowardCrossAutoTimerByLayerId = {};
  /** @type Record<string, boolean> */
  const lineOrthoTowardCrossAutoTickBusyByLayerId = {};
  for (const id of LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL) {
    lineOrthoTowardCrossAutoTimerByLayerId[id] = null;
    lineOrthoTowardCrossAutoTickBusyByLayerId[id] = false;
  }

  const lineOrthoTowardCrossUiFor = (lyr) =>
    lyr?.layerId ? (lineOrthoTowardCrossUiByLayerId[lyr.layerId] ?? null) : null;

  /** 「先直後橫（垂直優先）」：OSM 版或示意圖版皆算。 */
  const isVertFirstAnyLayerId = (id) => isVertFirstTowardCenterLayerId(id);

  /** 一輪隊列之短標（停止自動時提示用） */
  const lineOrthoTowardCrossCycleShortLabel = (lyr) =>
    isVertFirstAnyLayerId(lyr?.layerId) ? '欄→列' : '列→欄';

  /** 綠鍵／說明：整表循環順序 */
  const lineOrthoTowardCrossCycleLongLabel = (lyr) =>
    isVertFirstAnyLayerId(lyr?.layerId) ? '欄整表→列整表' : '列整表→欄整表';

  const LINE_ORTHO_TOWARD_CROSS_AUTO_MS = 1000;
  /** 一鍵完成：與「自動」同條件停滯前，單次最多 pulse 數（防異常迴圈） */
  const LINE_ORTHO_TOWARD_CROSS_FINISH_ALL_MAX_PULSES = 20000;

  const stopLineOrthoTowardCrossAuto = (onlyLayerId = null) => {
    for (const id of LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL) {
      if (onlyLayerId != null && id !== onlyLayerId) continue;
      if (lineOrthoTowardCrossAutoTimerByLayerId[id] != null) {
        clearInterval(lineOrthoTowardCrossAutoTimerByLayerId[id]);
        lineOrthoTowardCrossAutoTimerByLayerId[id] = null;
      }
      lineOrthoTowardCrossUiByLayerId[id].autoActive = false;
      lineOrthoTowardCrossUiByLayerId[id].autoNoMoveStreak = 0;
      lineOrthoTowardCrossAutoTickBusyByLayerId[id] = false;
    }
  };

  /** 對照「縮進前／後」路網，取代表頂點四捨五入格座標。供 temp 圖層位移預覽（示意圖灰／青圈）。 */
  const computeLineOrthoTowardCrossMovePreview = (beforeSegs, afterSegs, it, picksMap) => {
    if (!Array.isArray(beforeSegs) || !Array.isArray(afterSegs) || !it) return null;

    const roundedPtOn = (segs, si, pi) => {
      const pt = segs?.[si]?.points?.[pi];
      if (pt == null) return null;
      const x = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
      const y = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { gx: Math.round(x), gy: Math.round(y) };
    };

    let si = NaN;
    let pi = NaN;
    if (it.kind === '點') {
      const ov = it.orthoV;
      if (ov?.segIdx != null && ov?.ptIdx != null) {
        si = Number(ov.segIdx);
        pi = Number(ov.ptIdx);
      } else {
        const parsed = parseParenGridCoordOrtho(it.startCoord);
        if (!parsed) return null;
        const pr = pickOrthoVertexRefPreferRouteOrder(beforeSegs, picksMap, parsed.gx, parsed.gy);
        if (!pr) return null;
        si = pr.segIdx;
        pi = pr.ptIdx;
      }
    } else if (it.kind === '線' && Array.isArray(it.orthoRuns) && it.orthoRuns.length > 0) {
      const r0 = it.orthoRuns[0];
      si = Number(r0.segIdx);
      pi = Math.min(Number(r0.pi0), Number(r0.pi1));
    } else {
      return null;
    }

    if (!Number.isFinite(si) || !Number.isFinite(pi)) return null;
    const bef = roundedPtOn(beforeSegs, si, pi);
    const aft = roundedPtOn(afterSegs, si, pi);
    if (!bef || !aft) return null;
    if (bef.gx === aft.gx && bef.gy === aft.gy) return null;
    return {
      pivotSegIdx: si,
      pivotPtIdx: pi,
      fromGx: bef.gx,
      fromGy: bef.gy,
      toGx: aft.gx,
      toGy: aft.gy,
    };
  };

  const buildLineOrthoTowardCrossQueueAndReport = (lyr) => {
    const empty = { queue: [], report: null };
    if (!lyr || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId)) return empty;
    const rep = jsonGridLineOrthogonalRowColPointOrLineReport(lyr);
    const rowFirst = !isVertFirstAnyLayerId(lyr.layerId);
    const rows = rep.rowTable.map((it) => ({ tableAxis: 'row', it }));
    const cols = rep.colTable.map((it) => ({ tableAxis: 'col', it }));
    const queue = rowFirst ? [...rows, ...cols] : [...cols, ...rows];
    return { queue, report: rep };
  };

  const lineOrthoTowardCrossQueueLength = (lyr) =>
    buildLineOrthoTowardCrossQueueAndReport(lyr).queue.length;

  /**
   * 為列／欄表每一筆做**試算（不套用、不改圖層）**：朝紅十字移 1 格的結果，
   * 用以在表上顯示「能否移動／不能移動的原因」。回傳與 rowTable／colTable **同序**之陣列。
   * 每筆：{ ok:boolean, text:string }（ok=true 表示這格可移動；否則 text 為被擋／跳過原因）。
   * @returns {{ row: Array<{ok:boolean,text:string}>, col: Array<{ok:boolean,text:string}> }}
   */
  const lineOrthoTowardCrossReasonsFor = (lyr) => {
    const out = { row: [], col: [] };
    if (!lyr || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId)) return out;
    const resolved = resolveTowardCenterInput(lyr);
    if (!resolved?.spaceNetwork?.length) return out;
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const rep = jsonGridLineOrthogonalRowColPointOrLineReport(lyr);
    if (
      rep?.centerCx == null ||
      rep?.centerCy == null ||
      !Number.isFinite(rep.centerCx) ||
      !Number.isFinite(rep.centerCy)
    )
      return out;
    const frozenIds = buildInitialOrthoCoPointGroups(flat);
    const reasonFor = (tableAxis, it) => {
      try {
        const r = tryOrthoTowardCrossNudgeFromReportItem(
          shallowCloneOrthoSegmentsSynced(flat),
          tableAxis,
          it,
          rep.centerCx,
          rep.centerCy,
          { frozenVertexGroupIds: frozenIds }
        );
        if (r.applied) return { ok: true, text: '可移動 1 格' };
        if (r.skip)
          return { ok: false, text: String(r.message || '跳過（已對齊中心軸／無對應頂點）') };
        return {
          ok: false,
          text: String(r.message || '受阻（硬約束未過或正交性下降）'),
        };
      } catch (e) {
        return { ok: false, text: '評估失敗' };
      }
    };
    out.row = rep.rowTable.map((it) => reasonFor('row', it));
    out.col = rep.colTable.map((it) => reasonFor('col', it));
    return out;
  };

  /**
   * 將 {@link lineOrthoTowardCrossReasonsFor} 彙整成「可移動幾筆／被擋幾筆＋各原因筆數」摘要，
   * 供綠色按鈕上方顯示（尤其全被擋時，一眼看出為何不動）。
   * @returns {{ total:number, movable:number, blocked:number, lines:string[] } | null}
   */
  const lineOrthoTowardCrossReasonSummary = (lyr) => {
    if (!lyr || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId)) return null;
    const reasons = lineOrthoTowardCrossReasonsFor(lyr);
    const all = [...reasons.row, ...reasons.col];
    if (all.length === 0) return null;
    let movable = 0;
    const blockedCounts = new Map();
    for (const r of all) {
      if (r?.ok) {
        movable += 1;
      } else {
        const key = String(r?.text || '受阻').trim();
        blockedCounts.set(key, (blockedCounts.get(key) ?? 0) + 1);
      }
    }
    const lines = [...blockedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([text, n]) => `· ${n} 筆：${text}`);

    // 「目前這筆」＝下一次按綠鈕會處理的、地圖上以橘線／橘圈標示者 → 顯示它**自己**的原因。
    let current = null;
    const rep = jsonGridLineOrthogonalRowColPointOrLineReport(lyr);
    const ui = lineOrthoTowardCrossUiFor(lyr);
    const total = reasons.row.length + reasons.col.length;
    if (total > 0) {
      const rowFirst = !isVertFirstAnyLayerId(lyr.layerId);
      // 地圖橘標＝「剛處理過」的那筆＝seqIdx−1（pulse 後 seqIdx 已 +1）；對齊之，避免訊息指到別筆。
      const idx = (((Number(ui?.seqIdx) || 0) - 1) % total + total) % total;
      let cur = null;
      let item = null;
      let axisLabel = '';
      if (rowFirst) {
        if (idx < reasons.row.length) {
          cur = reasons.row[idx];
          item = rep.rowTable[idx];
          axisLabel = '列(y)';
        } else {
          const k = idx - reasons.row.length;
          cur = reasons.col[k];
          item = rep.colTable[k];
          axisLabel = '欄(x)';
        }
      } else {
        if (idx < reasons.col.length) {
          cur = reasons.col[idx];
          item = rep.colTable[idx];
          axisLabel = '欄(x)';
        } else {
          const k = idx - reasons.col.length;
          cur = reasons.row[k];
          item = rep.rowTable[k];
          axisLabel = '列(y)';
        }
      }
      if (cur && item) {
        const where =
          item.kind === '線'
            ? `${item.routeName} ${item.startCoord ?? ''}→${item.endCoord ?? ''}`
            : `${item.routeName} ${item.startStation ?? ''}${item.startCoord ?? ''}`;
        current = {
          ok: !!cur.ok,
          label: `#${idx + 1}/${total} ${axisLabel}·${item.kind}：${where}`.trim(),
          text: String(cur.text || ''),
        };
      }
    }

    return { total: all.length, movable, blocked: all.length - movable, lines, current };
  };

  const formatLineOrthoTowardCrossHint = (
    posLabel,
    stepCount,
    haltReason,
    centerCx,
    centerCy,
    movePreview
  ) => {
    const cx = Number.isFinite(Number(centerCx)) ? Number(centerCx) : NaN;
    const cy = Number.isFinite(Number(centerCy)) ? Number(centerCy) : NaN;
    const centerFrag =
      Number.isFinite(cx) && Number.isFinite(cy)
        ? `（紅十字中心格約 (${cx},${cy}) — 所列 yΔ／xΔ 係相對於此中心）`
        : '';
    const lines = [
      `項目：${posLabel}${centerFrag}`,
      stepCount > 0
        ? `結果：已向紅十字中心縮進 ${stepCount} 格。`
        : '結果：本次未對路網寫入任何縮進（幾何不變）。',
      `停止原因／說明：${haltReason && String(haltReason).trim() ? haltReason.trim() : '—（無詳細停止訊息）'}`,
    ];
    const mp = movePreview;
    if (
      mp &&
      Number.isFinite(Number(mp.fromGx)) &&
      Number.isFinite(Number(mp.fromGy)) &&
      Number.isFinite(Number(mp.toGx)) &&
      Number.isFinite(Number(mp.toGy))
    ) {
      lines.push(
        `代表頂點格位移（示意圖：灰虛線圈＝舊、青實線圈＝新）：(${Math.round(mp.fromGx)},${Math.round(mp.fromGy)}) → (${Math.round(mp.toGx)},${Math.round(mp.toGy)})`
      );
    }
    return lines.join('\n');
  };

  /**
   * 共點平移後舊報表項的座標／axis 字串已過期；以路線名＋種類配對新路網重算之列／欄表中最接近的那一筆。
   */
  const pickRematchedOrthoTowardCrossReportItem = (lyr, tableAxis, prevIt) => {
    if (!lyr || !prevIt) return prevIt;
    const rep = jsonGridLineOrthogonalRowColPointOrLineReport(lyr);
    const list = tableAxis === 'row' ? rep.rowTable : rep.colTable;
    if (!Array.isArray(list) || list.length === 0) return prevIt;
    const rnPrev = String(prevIt.routeName ?? '');
    let best = null;
    let bestScore = Infinity;
    for (const cand of list) {
      if (cand.kind !== prevIt.kind) continue;
      if (String(cand.routeName ?? '') !== rnPrev) continue;
      let d = Infinity;
      if (cand.kind === '線') {
        if (tableAxis === 'row') {
          const pv =
            prevIt.axisY != null && Number.isFinite(Number(prevIt.axisY))
              ? Number(prevIt.axisY)
              : NaN;
          const cv =
            cand.axisY != null && Number.isFinite(Number(cand.axisY)) ? Number(cand.axisY) : NaN;
          if (Number.isFinite(pv) && Number.isFinite(cv)) d = Math.abs(cv - pv);
        } else {
          const pv =
            prevIt.axisX != null && Number.isFinite(Number(prevIt.axisX))
              ? Number(prevIt.axisX)
              : NaN;
          const cv =
            cand.axisX != null && Number.isFinite(Number(cand.axisX)) ? Number(cand.axisX) : NaN;
          if (Number.isFinite(pv) && Number.isFinite(cv)) d = Math.abs(cv - pv);
        }
      } else if (cand.kind === '點') {
        const pa = parseParenGridCoordOrtho(prevIt.startCoord);
        const pb = parseParenGridCoordOrtho(cand.startCoord);
        if (pa && pb) d = Math.abs(pa.gx - pb.gx) + Math.abs(pa.gy - pb.gy);
        else continue;
      } else continue;
      if (d < bestScore) {
        bestScore = d;
        best = cand;
      }
    }
    return best != null ? best : prevIt;
  };

  const refreshOrthogonalVhMirrorForLineOrthoLayer = (lyr) => {
    if (!lyr) return;
    if (lyr.layerId === LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID) {
      refreshOrthogonalVhMirrorDrawLayerIfVisible(
        dataStore.findLayerById.bind(dataStore),
        dataStore.saveLayerState.bind(dataStore)
      );
    }
  };

  /**
   * 單按一次「朝紅十字縮進」：`clearMovePreview`、`queue[idx]`、`seqIdx+=1`；每次最多移一格。與自動排程同軌。
   * @returns {Promise<boolean>} 是否發生評估類嚴重失敗（!r.ok，需視情況中斷自動／批次）
   */
  async function pulseOnceLineOrthoTowardCross(lyr, { muteEvalErrorAlert = false, batch = false } = {}) {
    const uiLine = lineOrthoTowardCrossUiFor(lyr);
    if (
      !lyr ||
      !uiLine ||
      !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId) ||
      isExecuting.value
    )
      return { evaluationFailed: false, earlyExit: true };
    lyr.lineOrthoTowardCrossMovePreview = null;
    const resolved = resolveTowardCenterInput(lyr);
    if (!resolved?.spaceNetwork?.length) {
      if (!muteEvalErrorAlert)
        window.alert('沒有可編輯的路網；請確認已有 spaceNetworkGridJsonData 或完整 dataJson。');
      return { evaluationFailed: true, earlyExit: true };
    }
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    lockLineOrthoTowardCrossCenterFromFlatIfUnset(lyr, flat);
    const { queue, report } = buildLineOrthoTowardCrossQueueAndReport(lyr);
    if (!queue.length) {
      uiLine.lastHint = '無列／欄表項目可處理。';
      return { evaluationFailed: false, earlyExit: true };
    }
    if (
      report?.centerCx == null ||
      report?.centerCy == null ||
      !Number.isFinite(report.centerCx) ||
      !Number.isFinite(report.centerCy)
    ) {
      if (!muteEvalErrorAlert) window.alert('無法取得紅線中心（全路網頂點 bbox 中點）。');
      return { evaluationFailed: true, earlyExit: true };
    }
    const picksBeforeOrthoMove = buildOrthoGridRoundedVertexPickIndex(flat);

    const idx = uiLine.seqIdx % queue.length;
    const { tableAxis, it } = queue[idx];
    const posLabel = `#${idx + 1}/${queue.length} ${tableAxis === 'row' ? '列(y)' : '欄(x)'} · ${it.kind}`;

    uiLine.seqIdx = (idx + 1) % queue.length;

    let workingFlat = shallowCloneOrthoSegmentsSynced(flat);
    const frozenIds = buildInitialOrthoCoPointGroups(workingFlat);
    let stepCount = 0;
    let haltReason = '';

    const r = tryOrthoTowardCrossNudgeFromReportItem(
      workingFlat,
      tableAxis,
      it,
      report.centerCx,
      report.centerCy,
      { frozenVertexGroupIds: frozenIds }
    );

    if (!r.ok) {
      haltReason = r.message
        ? String(r.message)
        : '評估時發生錯誤（tryOrthoTowardCrossNudgeFromReportItem 回報 !ok）。';
      if (!muteEvalErrorAlert) window.alert(`${posLabel}：${haltReason}`);
      if (!batch) {
        const pk = buildOrthoGridRoundedVertexPickIndex(flat);
        const hi = lineOrthoTowardCrossReportItemHighlight(lyr, flat, pk, tableAxis, it);
        lyr.highlightedSegmentIndex = hi;
        lyr.lineOrthoTowardCrossHighlightTableAxis = hi ? tableAxis : null;
        await dataStore.saveLayerState(lyr.layerId, {
          ...jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true }),
        });
        refreshOrthogonalVhMirrorForLineOrthoLayer(lyr);
        uiLine.lastHint = formatLineOrthoTowardCrossHint(
          posLabel,
          stepCount,
          haltReason,
          report.centerCx,
          report.centerCy,
          null
        );
        await nextTick();
        dataStore.requestSpaceNetworkGridFullRedraw();
      }
      return { evaluationFailed: true, earlyExit: false, posLabel, stepCount };
    }
    if (!r.applied) {
      if (r.skip) {
        haltReason =
          r.message ||
          '已符合「跳過」條件（例如已對齊紅十字對應軸／找不到對應頂點），故未對此項試算偏移。';
      } else {
        haltReason =
          r.message ||
          '朝中心位移時，約束檢查未通過（交叉、路線共線重疊、頂點落線、非法併格或零長邊）；或移一格後水平／垂直邊數下降。';
      }
    } else {
      workingFlat = r.segments;
      stepCount = r.cellsMoved ?? 1;
    }

    /** 套用後之重算報表／中心（離紅線 y／x 與新路網一致）— 無位移時沿用 pulse 開始時結果 */
    let repHint = report;
    let hlSegments = flat;
    let itemForHl = it;

    if (stepCount > 0) {
      if (!batch) {
        uiLine.tableBump += 1;
        lyr.lineOrthoTowardCrossMovePreview = computeLineOrthoTowardCrossMovePreview(
          flat,
          workingFlat,
          it,
          picksBeforeOrthoMove
        );
      }
      // 示意圖管線版：這 2 層只存/顯示 connect 骨架（黑點站完全不參與、不顯示；最後在 connect 拉直才平均放回）。
      applyJsonGridFromCoordBestMoveSegmentsToLayer(lyr, workingFlat);
      const resolvedAfter = resolveTowardCenterInput(lyr);
      if (!resolvedAfter?.spaceNetwork?.length) {
        if (!muteEvalErrorAlert)
          window.alert('縮進後無法載入路網；請確認 spaceNetworkGridJsonData 或 dataJson。');
        return {
          evaluationFailed: true,
          earlyExit: false,
          posLabel,
          stepCount,
        };
      }
      if (!batch) {
        hlSegments = normalizeSpaceNetworkDataToFlatSegments(
          JSON.parse(JSON.stringify(resolvedAfter.spaceNetwork))
        );
        repHint = jsonGridLineOrthogonalRowColPointOrLineReport(lyr);
        itemForHl = pickRematchedOrthoTowardCrossReportItem(lyr, tableAxis, it);
      }
    }

    // batch（一鍵連跑）：略過 highlight／存檔／鏡像／重繪等純呈現工作，僅在迴圈結束後統一做一次。
    if (batch) {
      return { evaluationFailed: false, earlyExit: false, posLabel, stepCount, haltReason };
    }

    const picksHlMap = buildOrthoGridRoundedVertexPickIndex(hlSegments);
    const hi = lineOrthoTowardCrossReportItemHighlight(
      lyr,
      hlSegments,
      picksHlMap,
      tableAxis,
      itemForHl
    );
    lyr.highlightedSegmentIndex = hi;
    lyr.lineOrthoTowardCrossHighlightTableAxis = hi ? tableAxis : null;

    await dataStore.saveLayerState(lyr.layerId, {
      ...jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true }),
    });
    refreshOrthogonalVhMirrorForLineOrthoLayer(lyr);

    uiLine.lastHint = formatLineOrthoTowardCrossHint(
      posLabel,
      stepCount,
      haltReason,
      repHint.centerCx,
      repHint.centerCy,
      lyr.lineOrthoTowardCrossMovePreview ?? null
    );

    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
    return {
      evaluationFailed: false,
      earlyExit: false,
      posLabel,
      stepCount,
      haltReason,
    };
  }

  const onLineOrthoTowardCrossStepClick = async (lyr) => {
    if (!lyr || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId) || isExecuting.value)
      return;
    await pulseOnceLineOrthoTowardCross(lyr, { muteEvalErrorAlert: false });
  };

  const startLineOrthoTowardCrossAuto = async (lyr) => {
    const uiA = lineOrthoTowardCrossUiFor(lyr);
    if (
      !lyr ||
      !uiA ||
      !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId) ||
      isExecuting.value
    )
      return;
    if (lineOrthoTowardCrossQueueLength(lyr) === 0) {
      window.alert('無列／欄表項目，無法自動執行。');
      return;
    }
    if (uiA.oneClickRunning) return;
    stopLineOrthoTowardCrossAuto();
    await maybeLineOrthoHubBlueDiagonalPrepassOnce(lyr);
    const layerIdForTimer = lyr.layerId;
    uiA.autoNoMoveStreak = 0;
    uiA.autoActive = true;
    lineOrthoTowardCrossAutoTimerByLayerId[layerIdForTimer] = setInterval(async () => {
      const uiTick = lineOrthoTowardCrossUiByLayerId[layerIdForTimer];
      if (
        !uiTick?.autoActive ||
        lineOrthoTowardCrossAutoTickBusyByLayerId[layerIdForTimer] ||
        isExecuting.value ||
        uiTick.oneClickRunning
      )
        return;
      lineOrthoTowardCrossAutoTickBusyByLayerId[layerIdForTimer] = true;
      try {
        const lyr2 = dataStore.findLayerById(layerIdForTimer);
        if (!lyr2 || lyr2.layerId !== layerIdForTimer) return;
        if (lineOrthoTowardCrossQueueLength(lyr2) === 0) {
          stopLineOrthoTowardCrossAuto();
          uiTick.lastHint = `${uiTick.lastHint || ''}\n（自動執行已停止：隊列為空）`.trim();
          return;
        }
        const r = await pulseOnceLineOrthoTowardCross(lyr2, { muteEvalErrorAlert: true });
        if (r?.evaluationFailed) {
          stopLineOrthoTowardCrossAuto();
          uiTick.lastHint =
            `${uiTick.lastHint || ''}\n（自動執行已停止：發生評估／路網／儲存錯誤，見上文。）`.trim();
        } else if (!r?.earlyExit) {
          const qRound = buildLineOrthoTowardCrossQueueAndReport(lyr2).queue.length;
          const moved = Number(r?.stepCount) > 0;
          if (moved) {
            uiTick.autoNoMoveStreak = 0;
          } else if (qRound > 0) {
            uiTick.autoNoMoveStreak += 1;
            if (uiTick.autoNoMoveStreak >= qRound) {
              stopLineOrthoTowardCrossAuto();
              const ord = lineOrthoTowardCrossCycleShortLabel(lyr2);
              uiTick.lastHint =
                `${uiTick.lastHint || ''}\n（自動執行已停止：已連續跑完一輪隊列（${ord} 共 ${qRound} 項）皆無縮進。）`.trim();
            }
          }
        }
      } finally {
        lineOrthoTowardCrossAutoTickBusyByLayerId[layerIdForTimer] = false;
      }
    }, LINE_ORTHO_TOWARD_CROSS_AUTO_MS);
  };

  const toggleLineOrthoTowardCrossAuto = (lyr) => {
    const uiT = lineOrthoTowardCrossUiFor(lyr);
    if (!lyr || !uiT || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId)) return;
    if (uiT.autoActive) stopLineOrthoTowardCrossAuto();
    else startLineOrthoTowardCrossAuto(lyr);
  };

  const onLineOrthoTowardCrossFinishAllClick = async (lyr) => {
    const uiF = lineOrthoTowardCrossUiFor(lyr);
    if (
      !lyr ||
      !uiF ||
      !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId) ||
      isExecuting.value
    )
      return;
    stopLineOrthoTowardCrossAuto();
    const { queue } = buildLineOrthoTowardCrossQueueAndReport(lyr);
    if (!queue.length) {
      uiF.lastHint = '無列／欄表項目可處理。';
      return;
    }
    // 示意圖「站點與路線往中心聚集（先橫後直／先直後橫）」：執行時顯示全螢幕計時 overlay，結束彈窗通知耗時。
    const useOverlay = SCHEMATIC_TOWARD_CENTER_LAYER_IDS.includes(lyr.layerId);
    const overlay = useOverlay
      ? showSolveOverlay(
          lyr.layerId === SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID
            ? '站點與路線往中心聚集（先直後橫）計算中…'
            : '站點與路線往中心聚集（先橫後直）計算中…'
        )
      : null;
    if (overlay) await new Promise((r) => setTimeout(r, 30)); // 讓 overlay 先繪出再開始重運算
    uiF.oneClickRunning = true;
    const summaries = [];
    let totalSteps = 0;
    let aborted = false;
    let stagnationStop = false;
    let pulseCount = 0;
    try {
      // 計時器讓出節流：每 pulse 都 setTimeout(0) 會被瀏覽器 clamp 到 4ms（×20000 pulse 可多出數十秒）；
      // 改為距上次讓出 ≥ 此毫秒才讓一次，足以讓 overlay 秒數順暢更新又幾乎不拖慢運算。
      const OVERLAY_YIELD_MS = 50;
      let lastOverlayYieldAt = Date.now();
      // prepass 是迴圈前的單一同步運算；先讓出一次使秒數起跳，並以狀態標示（卡在這裡時可看出）。
      overlay?.setStatus('預處理中（prepass）…');
      if (overlay) await new Promise((res) => setTimeout(res, 0));
      await maybeLineOrthoHubBlueDiagonalPrepassOnce(lyr);
      if (overlay) await new Promise((res) => setTimeout(res, 0));
      let noMoveStreak = 0;
      while (pulseCount < LINE_ORTHO_TOWARD_CROSS_FINISH_ALL_MAX_PULSES) {
        const r = await pulseOnceLineOrthoTowardCross(lyr, {
          muteEvalErrorAlert: pulseCount > 0,
          batch: true,
        });
        pulseCount++;
        overlay?.setStatus(`第 ${pulseCount} 次 pulse；累計縮進約 ${totalSteps} 格…`);
        // 讓出 macrotask，使 overlay 的 setInterval 計時器得以更新（否則整段同步運算會讓秒數凍在 0）。
        if (overlay && Date.now() - lastOverlayYieldAt >= OVERLAY_YIELD_MS) {
          lastOverlayYieldAt = Date.now();
          await new Promise((res) => setTimeout(res, 0));
        }
        if (r.evaluationFailed) {
          aborted = true;
          summaries.push(
            `${r.posLabel ?? `第 ${pulseCount} 次 pulse`}：發生評估／路網／儲存錯誤（批次中止；首項會彈窗說明）。`
          );
          break;
        }
        if (r.earlyExit) break;
        const sc = Number(r.stepCount) || 0;
        totalSteps += sc;
        summaries.push(
          `${r.posLabel}：縮進 ${sc} 格。${r.haltReason ? `（${String(r.haltReason)}）` : ''}`
        );
        const qRound = buildLineOrthoTowardCrossQueueAndReport(lyr).queue.length;
        if (qRound === 0) break;
        if (sc > 0) {
          noMoveStreak = 0;
        } else {
          noMoveStreak += 1;
          if (noMoveStreak >= qRound) {
            stagnationStop = true;
            break;
          }
        }
      }
      const hitMaxPulses = !aborted && pulseCount >= LINE_ORTHO_TOWARD_CROSS_FINISH_ALL_MAX_PULSES;
      if (hitMaxPulses) {
        summaries.push(
          `（已達單次一鍵上限 ${LINE_ORTHO_TOWARD_CROSS_FINISH_ALL_MAX_PULSES} 次 pulse，請再按一次一鍵完成續跑。）`
        );
      }
      const report = jsonGridLineOrthogonalRowColPointOrLineReport(lyr);
      let hdrMain = '';
      if (aborted) {
        hdrMain = `一鍵完成：因錯誤中止；已紀錄 ${summaries.length} 段（通常最後一行為中止原因）。累計縮進格數約 ${totalSteps}。`;
      } else if (stagnationStop) {
        const ordStop = lineOrthoTowardCrossCycleShortLabel(lyr);
        hdrMain = `一鍵完成：已執行至「連續一輪隊列（${ordStop}）皆無縮進」為止（與自動執行停止條件相同）。共 ${pulseCount} 次 pulse，累計縮進約 ${totalSteps} 格。`;
      } else if (hitMaxPulses) {
        hdrMain = `一鍵完成：已跑滿單次上限 ${LINE_ORTHO_TOWARD_CROSS_FINISH_ALL_MAX_PULSES} 次 pulse，累計縮進約 ${totalSteps} 格。`;
      } else {
        hdrMain = `一鍵完成：共 ${pulseCount} 次 pulse，累計縮進約 ${totalSteps} 格（可能因隊列為空等提早結束）。`;
      }
      const hdr = [
        hdrMain,
        report?.centerCx != null &&
        report?.centerCy != null &&
        Number.isFinite(report.centerCx) &&
        Number.isFinite(report.centerCy)
          ? `紅十字中心格約 (${report.centerCx},${report.centerCy})。`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      uiF.lastHint = `${hdr}\n\n${summaries.join('\n')}`.trim();
      // batch 連跑時各 pulse 略過了存檔／鏡像／重繪，於此統一做一次（最終結果才落地）。
      await dataStore.saveLayerState(lyr.layerId, {
        ...jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true }),
      });
      refreshOrthogonalVhMirrorForLineOrthoLayer(lyr);
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
    } finally {
      uiF.oneClickRunning = false;
      if (overlay) {
        const secs = overlay.close();
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(
            `完成！耗時 ${secs.toFixed(1)} 秒\n共 ${pulseCount} 次 pulse，累計縮進約 ${totalSteps} 格。`
          );
        }
      }
    }
  };

  /** 手動步進頂點列表索引（每按一次 highlight 下一筆，循環） */
  const jsonGridFromCoordVertexStep = ref(-1);

  const JSON_GRID_FROM_COORD_VERTEX_AUTO_MS = 1000;
  let jsonGridFromCoordVertexAutoTimerId = null;
  const jsonGridFromCoordVertexAutoActive = ref(false);
  let jsonGridFromCoordVertexAutoTickBusy = false;
  const jsonGridFromCoordVertexOneClickRunning = ref(false);

  const stopJsonGridFromCoordVertexAuto = () => {
    if (jsonGridFromCoordVertexAutoTimerId != null) {
      clearInterval(jsonGridFromCoordVertexAutoTimerId);
      jsonGridFromCoordVertexAutoTimerId = null;
    }
    jsonGridFromCoordVertexAutoActive.value = false;
    jsonGridFromCoordVertexAutoTickBusy = false;
  };

  /**
   * @param {unknown} lyr
   * @param {unknown[]} segments
   * @param {unknown[]|null} [mapDrawnStationsFallback] 例如「先直後橫·繪製」本機 JSON：首次寫入時 lyr 尚無 dataJson，
   *   需以檔案內匯出列補回 flatSegments 匯出時遺失的 segment.stations。
   */
  const applyJsonGridFromCoordBestMoveSegmentsToLayer = (
    lyr,
    segments,
    mapDrawnStationsFallback = null
  ) => {
    const priorExportRows = mapDrawnExportRowsFromJsonDrawRoot(lyr.jsonData, lyr.dataJson);
    lyr.spaceNetworkGridJsonData = segments;
    const computed = computeStationDataFromRoutes(segments);
    lyr.spaceNetworkGridJsonData_SectionData = computed.sectionData;
    lyr.spaceNetworkGridJsonData_ConnectData = computed.connectData;
    lyr.spaceNetworkGridJsonData_StationData = computed.stationData;
    try {
      let rows = flatSegmentsToGeojsonStyleExportRows(segments);
      rows = mergeSegmentStationsFromPriorExportRows(rows, priorExportRows);
      if (Array.isArray(mapDrawnStationsFallback) && mapDrawnStationsFallback.length > 0) {
        rows = mergeSegmentStationsFromPriorExportRows(rows, mapDrawnStationsFallback);
      }
      lyr.processedJsonData = rows;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('共點平移：匯出 processedJsonData 失敗', e);
    }
    writeLayoutNormalizedLayerDataOsmFromNetwork(lyr, segments);
    syncJsonGridFromCoordDataJsonFromPipeline(lyr);
    lyr.jsonGridFromCoordSuggestTargetGrid = null;
    if (LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId)) return;
    if (lyr.layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) {
      refreshLayoutNetworkGridFromVhDrawIfVisibleCopy(
        dataStore.findLayerById.bind(dataStore),
        dataStore.saveLayerState.bind(dataStore)
      );
      refreshLayoutNetworkGridFromVhDrawIfVisibleCopy2(
        dataStore.findLayerById.bind(dataStore),
        dataStore.saveLayerState.bind(dataStore)
      );
      return;
    }
    for (const oid of LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL) {
      const lo = dataStore.findLayerById(oid);
      if (lo) lo.lineOrthoTowardCrossMovePreview = null;
    }
    refreshLineOrthogonalFromPointOrthogonalIfVisible(
      dataStore.findLayerById.bind(dataStore),
      dataStore.saveLayerState.bind(dataStore)
    );
  };

  // ── coord_normalized_red_blue_connect：按鈕式 connect 紅／藍點最佳化移動 ──────

  /** 目前列表索引（-1 表示尚未開始）；每輪 0→n-1 各點只試一次，輪完再從 0 開始新一輪 */
  const rbConnectHighlightStep = ref(-1);
  /** 本輪（自索引 0 試到 n-1）實際套用移動的次數；整輪為 0 時自動模式停止 */
  const rbConnectMovesInRound = ref(0);
  const RB_CONNECT_AUTO_MS = 1000;
  let rbConnectAutoTimerId = null;
  const rbConnectAutoActive = ref(false);
  let rbConnectAutoTickBusy = false;

  const stopRbConnectAuto = () => {
    if (rbConnectAutoTimerId != null) {
      clearInterval(rbConnectAutoTimerId);
      rbConnectAutoTimerId = null;
    }
    rbConnectAutoActive.value = false;
    rbConnectAutoTickBusy = false;
  };

  const orthogonalVhDrawControlTabApi = useOrthogonalVhDrawControlTab({
    dataStore,
    isExecuting,
    applyJsonGridFromCoordBestMoveSegmentsToLayer,
    stopJsonGridFromCoordVertexAuto,
    stopRbConnectAuto,
  });
  const layoutNetworkGridFromVhDrawControlTabApi = useLayoutNetworkGridFromVhDrawControlTab({
    dataStore,
    pickOrthogonalVhDrawLocalJsonClick: () =>
      orthogonalVhDrawControlTabApi.pickOrthogonalVhDrawLocalJsonClick(),
    importOrthogonalVhDrawFromConvergeCenter: (sourceLayerIds) =>
      orthogonalVhDrawControlTabApi.applyOrthogonalVhDrawFromConvergeCenterLayer(sourceLayerIds),
    // 同名兩組：OSM 管線（版面網格資料鏈，優先）＋ 示意圖管線（MILP 那條，備援）。
    convergeCenterVertFirstLayerId: [
      orthogonalVhDrawControlTabApi.LINE_ORTHOGONAL_TOWARD_CENTER_VERT_FIRST_LAYER_ID,
      'schematic_toward_center_vh',
    ],
    convergeCenterHorizFirstLayerId: [
      orthogonalVhDrawControlTabApi.LINE_ORTHOGONAL_TOWARD_CENTER_HORIZ_FIRST_LAYER_ID,
      'schematic_toward_center_hv',
    ],
  });

  /**
   * 把路段寫回 coord_normalized_red_blue_connect 層（spaceNetworkGridJsonData + 衍生 + dataJson）。
   * 同時更新對應父層 json_grid_coord_normalized 之 dataJson，讓鏡像圖層一致。
   */
  const applyRbConnectSegmentsToLayer = (lyr, segments) => {
    const priorExportRows = mapDrawnExportRowsFromJsonDrawRoot(lyr.jsonData, lyr.dataJson);
    lyr.spaceNetworkGridJsonData = segments;
    const comp = computeStationDataFromRoutes(segments);
    lyr.spaceNetworkGridJsonData_SectionData = comp.sectionData;
    lyr.spaceNetworkGridJsonData_ConnectData = comp.connectData;
    lyr.spaceNetworkGridJsonData_StationData = comp.stationData;
    try {
      let rows = flatSegmentsToGeojsonStyleExportRows(segments);
      rows = mergeSegmentStationsFromPriorExportRows(rows, priorExportRows);
      lyr.processedJsonData = rows;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('rbConnect 移動：processedJsonData 失敗', e);
    }
    syncJsonGridFromCoordDataJsonFromPipeline(lyr);
    const parent = dataStore.findLayerById('json_grid_coord_normalized');
    if (parent && Array.isArray(lyr.dataJson)) {
      parent.dataJson = JSON.parse(JSON.stringify(lyr.dataJson));
      parent.jsonData = parent.dataJson;
    }
  };

  /** 手動步進：依列表序一次一點；一輪內每點只試一次，輪完才從頭；自動模式在「整輪零移動」時停止 */
  const advanceRbConnectHighlight = async () => {
    const lyr = resolveRbConnectListLayer();
    const rbLayerId = lyr?.layerId ?? COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID;
    const list = lyr ? coordNormalizedRedBlueConnectList(lyr) : [];
    if (!lyr || !list.length) {
      window.alert('尚無 connect 點；請先開啟本圖層並確認父層「座標正規化」已有路網。');
      stopRbConnectAuto();
      return;
    }
    const n = list.length;
    const prev = rbConnectHighlightStep.value;
    let nextIdx;
    if (prev < 0) {
      nextIdx = 0;
      lyr.rbConnectVisitedKeys = [];
    } else {
      nextIdx = (prev + 1) % n;
      if (nextIdx === 0) {
        if (rbConnectAutoActive.value && rbConnectMovesInRound.value === 0) {
          stopRbConnectAuto();
          return;
        }
        rbConnectMovesInRound.value = 0;
        lyr.rbConnectVisitedKeys = [];
      }
    }

    lyr.rbConnectMovePreview = null;
    rbConnectHighlightStep.value = nextIdx;
    const it = list[nextIdx];
    lyr.highlightedSegmentIndex = [it.segIdx, it.ptIdx];
    const visitedKey = `${it.segIdx},${it.ptIdx}`;
    lyr.rbConnectVisitedKeys = Array.from(
      new Set([
        ...(Array.isArray(lyr.rbConnectVisitedKeys) ? lyr.rbConnectVisitedKeys : []),
        visitedKey,
      ])
    );

    await dataStore.saveLayerState(rbLayerId, {
      highlightedSegmentIndex: lyr.highlightedSegmentIndex,
      rbConnectMovePreview: null,
      rbConnectVisitedKeys: lyr.rbConnectVisitedKeys,
    });
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
    await nextTick();

    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) {
      return;
    }
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const r = findBestConnectPointMoveForHV(flat, it.segIdx, it.ptIdx);
    if (!r.ok) {
      window.alert(r.message || '無法評估移動');
      stopRbConnectAuto();
      dataStore.saveLayerState(rbLayerId, {
        highlightedSegmentIndex: lyr.highlightedSegmentIndex,
        rbConnectVisitedKeys: lyr.rbConnectVisitedKeys,
      });
      return;
    }
    if (r.applied && Array.isArray(r.segments)) {
      const ptAfter = r.segments[it.segIdx]?.points?.[it.ptIdx];
      const toGx = Array.isArray(ptAfter)
        ? Math.round(Number(ptAfter[0]))
        : Math.round(Number(ptAfter?.x));
      const toGy = Array.isArray(ptAfter)
        ? Math.round(Number(ptAfter[1]))
        : Math.round(Number(ptAfter?.y));
      if (Number.isFinite(toGx) && Number.isFinite(toGy)) {
        lyr.rbConnectMovePreview = {
          fromGx: it.x,
          fromGy: it.y,
          toGx,
          toGy,
        };
      }
      rbConnectMovesInRound.value += 1;
      lyr.highlightedSegmentIndex = [it.segIdx, it.ptIdx];
      applyRbConnectSegmentsToLayer(lyr, r.segments);
      dataStore.saveLayerState(rbLayerId, jsonGridFromCoordNormalizedPersistPayload(lyr));
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
      return;
    }
    dataStore.saveLayerState(rbLayerId, {
      highlightedSegmentIndex: lyr.highlightedSegmentIndex,
      rbConnectVisitedKeys: lyr.rbConnectVisitedKeys,
    });
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const startRbConnectAuto = () => {
    const lyr = resolveRbConnectListLayer();
    if (!lyr || coordNormalizedRedBlueConnectList(lyr).length === 0) {
      window.alert('尚無 connect 點；請先開啟本圖層並確認父層「座標正規化」已有路網。');
      return;
    }
    stopRbConnectAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawDiagonalRouteAuto();
    rbConnectHighlightStep.value = -1;
    rbConnectMovesInRound.value = 0;
    lyr.rbConnectVisitedKeys = [];
    lyr.rbConnectMovePreview = null;
    rbConnectAutoActive.value = true;
    rbConnectAutoTimerId = setInterval(async () => {
      if (!rbConnectAutoActive.value || rbConnectAutoTickBusy) return;
      rbConnectAutoTickBusy = true;
      try {
        await advanceRbConnectHighlight();
      } finally {
        rbConnectAutoTickBusy = false;
      }
    }, RB_CONNECT_AUTO_MS);
  };

  // ── end coord_normalized_red_blue_connect ────────────────────────────────

  // ── connect_straighten_hv：紅／藍 connect 拉直（移 1 格使水平／垂直路線變多）────────
  const connectStraightenStep = ref(-1);
  /** 本輪（自索引 0 試到 n-1）實際套用移動的次數；整輪為 0 時自動模式停止 */
  const connectStraightenMovesInRound = ref(0);
  const CONNECT_STRAIGHTEN_AUTO_MS = 1000;
  let connectStraightenAutoTimerId = null;
  const connectStraightenAutoActive = ref(false);
  let connectStraightenAutoTickBusy = false;

  const resolveConnectStraightenLayer = () =>
    dataStore.findLayerById(CONNECT_STRAIGHTEN_HV_LAYER_ID);

  /** 頂點 (seg, ptIdx) 是否為 connect（紅 hub／藍末端）端點 */
  const isConnectVertexForStraighten = (seg, ptIdx) => {
    const node = Array.isArray(seg?.nodes) ? seg.nodes[ptIdx] : null;
    if (node && typeof node === 'object') {
      const nt = String(node.node_type ?? node.tags?.node_type ?? '').toLowerCase();
      if (nt === 'connect') return true;
      if (node.connect_number != null || node.tags?.connect_number != null) return true;
    }
    const pt = Array.isArray(seg?.points) ? seg.points[ptIdx] : null;
    const props =
      Array.isArray(pt) && pt.length > 2 && pt[2] && typeof pt[2] === 'object' ? pt[2] : null;
    if (props) {
      const nt = String(props.node_type ?? props.tags?.node_type ?? '').toLowerCase();
      if (nt === 'connect') return true;
      if (props.connect_number != null || props.tags?.connect_number != null) return true;
    }
    return false;
  };

  /** 將路網（flat segments）寫回本圖層並重算 Section／Connect／Station／匯出列 */
  const applyConnectStraightenSegmentsToLayer = (lyr, segments) => {
    // 保留 route_colors（該邊所有不同顏色）：≥2 色時結果檢視器畫多色交錯虛線（純顯示）。
    if (Array.isArray(segments)) {
      for (const seg of segments) {
        if (seg && seg.route_colors == null) {
          const rc = seg.way_properties?.tags?.route_colors;
          if (rc) seg.route_colors = rc;
        }
      }
    }
    lyr.spaceNetworkGridJsonData = segments;
    const comp = computeStationDataFromRoutes(segments);
    lyr.spaceNetworkGridJsonData_SectionData = comp.sectionData;
    lyr.spaceNetworkGridJsonData_ConnectData = comp.connectData;
    lyr.spaceNetworkGridJsonData_StationData = comp.stationData;
    try {
      lyr.processedJsonData = flatSegmentsToGeojsonStyleExportRows(segments);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('connectStraighten：processedJsonData 失敗', e);
    }
    try {
      syncJsonGridFromCoordDataJsonFromPipeline(lyr);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('connectStraighten：dataJson 同步失敗', e);
    }
  };

  /** 本圖層尚無路網時，自上游「往中心聚集（先橫後直）」鏡像一份；回傳是否已有路網可用 */
  const seedConnectStraightenFromUpstreamIfEmpty = (lyr) => {
    if (!lyr) return false;
    if (Array.isArray(lyr.spaceNetworkGridJsonData) && lyr.spaceNetworkGridJsonData.length > 0) {
      return true;
    }
    const up = dataStore.findLayerById(LINE_ORTHOGONAL_LAYER_ID);
    const resolved = up ? resolveB3InputSpaceNetwork(up, { routeLineFromExportRows: 'full' }) : null;
    if (!resolved?.spaceNetwork?.length) return false;
    const segs = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    applyConnectStraightenSegmentsToLayer(lyr, segs);
    return true;
  };

  /** 列出本圖層所有 connect（紅／藍）端點（同格只列一次），供逐一步進 */
  const connectStraightenConnectList = (lyr) => {
    if (!lyr) return [];
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) return [];
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const out = [];
    const seenCell = new Set();
    let row = 0;
    for (let segIdx = 0; segIdx < flat.length; segIdx++) {
      const seg = flat[segIdx];
      const pts = Array.isArray(seg?.points) ? seg.points : [];
      for (let ptIdx = 0; ptIdx < pts.length; ptIdx++) {
        if (!isConnectVertexForStraighten(seg, ptIdx)) continue;
        const p = pts[ptIdx];
        const gx = Math.round(Number(Array.isArray(p) ? p[0] : p?.x));
        const gy = Math.round(Number(Array.isArray(p) ? p[1] : p?.y));
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
        const ck = `${gx},${gy}`;
        if (seenCell.has(ck)) continue;
        seenCell.add(ck);
        out.push({ row: row++, segIdx, ptIdx, x: gx, y: gy });
      }
    }
    return out;
  };

  const stopConnectStraightenAuto = () => {
    if (connectStraightenAutoTimerId != null) {
      clearInterval(connectStraightenAutoTimerId);
      connectStraightenAutoTimerId = null;
    }
    connectStraightenAutoActive.value = false;
    connectStraightenAutoTickBusy = false;
  };

  /** 單點：依列表序試下一個 connect；命中即移動（移 1 格、HV 邊數嚴格增加才移） */
  const advanceConnectStraighten = async () => {
    const lyr = resolveConnectStraightenLayer();
    if (!lyr) return;
    if (!seedConnectStraightenFromUpstreamIfEmpty(lyr)) {
      window.alert('上游「站點與路線往中心聚集（先橫後直）」尚無路網；請先產生該圖層資料。');
      stopConnectStraightenAuto();
      return;
    }
    const list = connectStraightenConnectList(lyr);
    if (!list.length) {
      window.alert('本圖層無 connect 端點。');
      stopConnectStraightenAuto();
      return;
    }
    const n = list.length;
    const prev = connectStraightenStep.value;
    let nextIdx;
    if (prev < 0) {
      nextIdx = 0;
      connectStraightenMovesInRound.value = 0;
    } else {
      nextIdx = (prev + 1) % n;
      if (nextIdx === 0) {
        if (connectStraightenAutoActive.value && connectStraightenMovesInRound.value === 0) {
          stopConnectStraightenAuto();
          return;
        }
        connectStraightenMovesInRound.value = 0;
      }
    }
    connectStraightenStep.value = nextIdx;
    const it = list[nextIdx];
    lyr.highlightedSegmentIndex = [it.segIdx, it.ptIdx];
    lyr.connectStraightenMovePreview = null;

    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) {
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
      return;
    }
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const r = findBestConnectPointMoveForHV(flat, it.segIdx, it.ptIdx);
    if (r.ok && r.applied && Array.isArray(r.segments)) {
      const ptAfter = r.segments[it.segIdx]?.points?.[it.ptIdx];
      const toGx = Math.round(Number(Array.isArray(ptAfter) ? ptAfter[0] : ptAfter?.x));
      const toGy = Math.round(Number(Array.isArray(ptAfter) ? ptAfter[1] : ptAfter?.y));
      if (Number.isFinite(toGx) && Number.isFinite(toGy)) {
        lyr.connectStraightenMovePreview = { fromGx: it.x, fromGy: it.y, toGx, toGy };
      }
      connectStraightenMovesInRound.value += 1;
      applyConnectStraightenSegmentsToLayer(lyr, r.segments);
      dataStore.saveLayerState(lyr.layerId, jsonGridFromCoordNormalizedPersistPayload(lyr));
    } else {
      dataStore.saveLayerState(lyr.layerId, {
        highlightedSegmentIndex: lyr.highlightedSegmentIndex,
      });
    }
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const startConnectStraightenAuto = () => {
    const lyr = resolveConnectStraightenLayer();
    if (!lyr) return;
    if (!seedConnectStraightenFromUpstreamIfEmpty(lyr)) {
      window.alert('上游「站點與路線往中心聚集（先橫後直）」尚無路網；請先產生該圖層資料。');
      return;
    }
    if (connectStraightenConnectList(lyr).length === 0) {
      window.alert('本圖層無 connect 端點。');
      return;
    }
    stopConnectStraightenAuto();
    connectStraightenStep.value = -1;
    connectStraightenMovesInRound.value = 0;
    lyr.connectStraightenMovePreview = null;
    connectStraightenAutoActive.value = true;
    connectStraightenAutoTimerId = setInterval(async () => {
      if (!connectStraightenAutoActive.value || connectStraightenAutoTickBusy) return;
      connectStraightenAutoTickBusy = true;
      try {
        await advanceConnectStraighten();
      } finally {
        connectStraightenAutoTickBusy = false;
      }
    }, CONNECT_STRAIGHTEN_AUTO_MS);
  };

  /** 一鍵完成：掃所有 connect 端點，反覆移動至整輪皆無法再增加 HV 邊數 */
  const finishConnectStraightenAll = async () => {
    const lyr = resolveConnectStraightenLayer();
    if (!lyr) return;
    if (connectStraightenAutoActive.value) stopConnectStraightenAuto();
    if (!seedConnectStraightenFromUpstreamIfEmpty(lyr)) {
      window.alert('上游「站點與路線往中心聚集（先橫後直）」尚無路網；請先產生該圖層資料。');
      return;
    }
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) return;
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const r = runConnectPointsHVMaximizeToFixpoint(flat);
    if (!r.ok) {
      window.alert(r.message || '無法執行紅／藍點拉直。');
      return;
    }
    if (r.moves > 0 && Array.isArray(r.segments)) {
      connectStraightenStep.value = -1;
      lyr.highlightedSegmentIndex = null;
      lyr.connectStraightenMovePreview = null;
      applyConnectStraightenSegmentsToLayer(lyr, r.segments);
      dataStore.saveLayerState(lyr.layerId, jsonGridFromCoordNormalizedPersistPayload(lyr));
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
    }
    const topo = (r.invalidBefore ?? 0) > 0
      ? `\n（注意：原路網本有 ${r.invalidBefore} 處交叉/重疊/頂點落線；拉直後為 ${r.invalidAfter}，過程未使其增加。）`
      : '';
    const rs = r.rejectSummary;
    const why = (r.moves === 0 && rs)
      ? `\n（評估 ${rs.connects} 個 connect、試移 ${rs.tried} 次；被擋原因：目標格已有其他線/點 ${rs.targetNotFree}、會改變拓撲 ${rs.topoWorse}、水平/垂直線會變少 ${rs.hvLoss}、既沒增加水平/垂直也沒縮短總長 ${rs.noGain}）`
      : '';
    window.alert(
      (r.moves > 0
        ? `紅／藍 connect 拉直：移動 ${r.moves} 個 connect（${r.rounds} 輪），水平／垂直邊數 ${r.hvBefore} → ${r.hvAfter}。` +
            (r.hitMaxMoves ? '（已達單次上限，請再按一次續跑。）' : '')
        : '已無任一 connect 可用軸對齊跳格增加水平／垂直路線。' + why) + topo
    );
  };

  /**
   * MILP結果正規化：對本層目前結果做「紅／藍 connect 拉直」（與 connect 拉直圖層同邏輯：
   * 移 1 格使水平／垂直路線最大化，迭代到不動點），結果寫回本層並重繪。
   */
  const onMilpReadConnectStraighten = async (layer) => {
    const lyr = layer || currentLayer.value;
    if (!lyr) return;
    const data = lyr.spaceNetworkGridJsonData;
    if (!Array.isArray(data) || data.length === 0) {
      window.alert('此圖層尚無結果，請先「座標正規化」或匯入後再拉直。');
      return;
    }
    const flat = normalizeSpaceNetworkDataToFlatSegments(JSON.parse(JSON.stringify(data)));
    // 在 connect 骨架（抽離黑點站）上拉直，再沿新弧長把黑點站放回（整條 section 真正拉直）
    const { skeleton, sections } = milpReadFlatToSkeleton(flat);
    const r = runConnectPointsHVMaximizeToFixpoint(skeleton);
    if (!r.ok) {
      window.alert(r.message || '無法執行紅／藍點拉直。');
      return;
    }
    if (r.moves > 0 && Array.isArray(r.segments)) {
      lyr.connectStraightenHighlightCell = null;
      lyr.connectStraightenMovePreview = null;
      milpReadStep.value = -1;
      const fullFlat = reinsertBlackStations(r.segments, sections);
      applyConnectStraightenSegmentsToLayer(lyr, fullFlat);
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
    }
    const topo = (r.invalidBefore ?? 0) > 0
      ? `\n（注意：原路網本有 ${r.invalidBefore} 處交叉/重疊/頂點落線；拉直後為 ${r.invalidAfter}，過程未使其增加。）`
      : '';
    const rs = r.rejectSummary;
    const why = (r.moves === 0 && rs)
      ? `\n（評估 ${rs.connects} 個 connect、試移 ${rs.tried} 次；被擋原因：目標格已有其他線/點 ${rs.targetNotFree}、會改變拓撲 ${rs.topoWorse}、水平/垂直線會變少 ${rs.hvLoss}、既沒增加水平/垂直也沒縮短總長 ${rs.noGain}）`
      : '';
    window.alert(
      (r.moves > 0
        ? `紅／藍 connect 拉直：移動 ${r.moves} 個 connect（${r.rounds} 輪），水平／垂直邊數 ${r.hvBefore} → ${r.hvAfter}。` +
            (r.hitMaxMoves ? '（已達單次上限，請再按一次續跑。）' : '')
        : '已無任一 connect 可用軸對齊跳格增加水平／垂直路線。' + why) + topo
    );
  };

  // ── MILP結果正規化：connect 拉直在「connect 骨架」上做 ──
  // 黑點站在 flat segments 中是凍結的中間頂點；只移動 connect 端點無法把整條 section 拉直，
  // 因為黑點站留在原斜線上。故先把黑點站抽離成 sections、僅在 connect 骨架（每段 [起 connect, 迄 connect]）
  // 上做軸對齊跳格拉直，再沿新弧長把黑點站放回 → 整條線真正拉直、黑點站重新落在線上。
  const milpReadStep = ref(-1);
  const milpReadStepInfo = ref('');

  /** flat segments → { skeleton（每段只留起迄 connect 端點）, sections（每段被抽離的黑點站，依序）} */
  const milpReadFlatToSkeleton = (flat) => {
    const skeleton = [];
    const sections = [];
    for (const seg of flat) {
      const pts = Array.isArray(seg?.points) ? seg.points : [];
      const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
      const black = [];
      for (let i = 1; i < pts.length - 1; i++) black.push(nodes[i]); // 起迄為 connect，中間皆黑點站
      const last = pts.length - 1;
      skeleton.push({
        route_name: seg.route_name,
        name: seg.name,
        points: [
          Array.isArray(pts[0]) ? pts[0].slice() : { ...pts[0] },
          Array.isArray(pts[last]) ? pts[last].slice() : { ...pts[last] },
        ],
        nodes: [nodes[0], nodes[last]],
        properties_start: seg.properties_start,
        properties_end: seg.properties_end,
        way_properties: seg.way_properties,
      });
      sections.push({ blackNodes: black });
    }
    return { skeleton, sections };
  };

  /** 列出 connect 骨架的所有端點（同格只列一次），供逐一步進 */
  const milpReadSkeletonConnectList = (skeleton) => {
    const out = [];
    const seen = new Set();
    let row = 0;
    for (let segIdx = 0; segIdx < skeleton.length; segIdx++) {
      const pts = skeleton[segIdx]?.points || [];
      for (const ptIdx of [0, pts.length - 1]) {
        if (ptIdx < 0 || !pts[ptIdx]) continue;
        const p = pts[ptIdx];
        const gx = Math.round(Number(Array.isArray(p) ? p[0] : p?.x));
        const gy = Math.round(Number(Array.isArray(p) ? p[1] : p?.y));
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
        const ck = `${gx},${gy}`;
        if (seen.has(ck)) continue;
        seen.add(ck);
        out.push({ row: row++, segIdx, ptIdx, x: gx, y: gy });
      }
    }
    return out;
  };

  /** 逐點：highlight 下一個 connect（橘圈），能移就移（軸對齊跳格），不能移則顯示原因 */
  const advanceMilpReadConnectStraighten = async (layer) => {
    const lyr = layer || currentLayer.value;
    if (!lyr) return;
    const data = lyr.spaceNetworkGridJsonData;
    if (!Array.isArray(data) || data.length === 0) {
      window.alert('此圖層尚無結果，請先「座標正規化」或匯入後再逐點拉直。');
      return;
    }
    const flat = normalizeSpaceNetworkDataToFlatSegments(JSON.parse(JSON.stringify(data)));
    const { skeleton, sections } = milpReadFlatToSkeleton(flat);
    const list = milpReadSkeletonConnectList(skeleton);
    if (!list.length) {
      window.alert('本圖層無 connect 端點。');
      return;
    }
    const n = list.length;
    const prev = milpReadStep.value;
    const nextIdx = prev < 0 ? 0 : (prev + 1) % n;
    milpReadStep.value = nextIdx;
    const it = list[nextIdx];
    lyr.connectStraightenHighlightCell = { gx: it.x, gy: it.y };
    lyr.connectStraightenMovePreview = null;
    const r = findBestConnectPointMoveForHV(skeleton, it.segIdx, it.ptIdx);
    if (r.ok && r.applied && Array.isArray(r.segments)) {
      const ptAfter = r.segments[it.segIdx]?.points?.[it.ptIdx];
      const toGx = Math.round(Number(Array.isArray(ptAfter) ? ptAfter[0] : ptAfter?.x));
      const toGy = Math.round(Number(Array.isArray(ptAfter) ? ptAfter[1] : ptAfter?.y));
      if (Number.isFinite(toGx) && Number.isFinite(toGy)) {
        lyr.connectStraightenMovePreview = { fromGx: it.x, fromGy: it.y, toGx, toGy };
        lyr.connectStraightenHighlightCell = { gx: toGx, gy: toGy };
      }
      const fullFlat = reinsertBlackStations(r.segments, sections);
      applyConnectStraightenSegmentsToLayer(lyr, fullFlat);
      milpReadStepInfo.value =
        `第 ${nextIdx + 1}/${n} 點 (${it.x},${it.y}) → (${toGx},${toGy})：✓ 移動，水平/垂直邊 ${r.hvBefore} → ${r.hvAfter}`;
    } else {
      const rj = r.reject || {};
      const parts = [
        `目標格已有其他線/點 ${rj.targetNotFree || 0}`,
        `會新增交叉/重疊/壓線 ${rj.topoWorse || 0}`,
        `水平/垂直線會變少 ${rj.hvLoss || 0}`,
        `既沒增加水平/垂直也沒縮短總長 ${rj.noGain || 0}`,
      ];
      if (rj.zeroLen) parts.push(`零長邊 ${rj.zeroLen}`);
      milpReadStepInfo.value =
        `第 ${nextIdx + 1}/${n} 點 (${it.x},${it.y})：✗ 不移動。候選對齊格 ${rj.tried || 0} 個全被擋 — ${parts.join('、')}`;
    }
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 重置逐點游標與 highlight（回到第 1 點之前） */
  const resetMilpReadStep = async (layer) => {
    const lyr = layer || currentLayer.value;
    milpReadStep.value = -1;
    milpReadStepInfo.value = '';
    if (lyr) {
      lyr.connectStraightenHighlightCell = null;
      lyr.connectStraightenMovePreview = null;
    }
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const CONNECT_STRAIGHTEN_LOCAL_JSON_INPUT_ID = 'connect-straighten-local-json-input';
  const pickConnectStraightenLocalJsonClick = () => {
    document.getElementById(CONNECT_STRAIGHTEN_LOCAL_JSON_INPUT_ID)?.click();
  };

  /** 與 vh-draw 匯入相同：自 dataJson／mapDrawnRoutes／路段匯出陣列取出路線匯出列 */
  const extractMapDrawnRoutesRowsForConnectStraighten = (parsed) => {
    if (parsed && typeof parsed === 'object') {
      const fromDataJson = mapDrawnExportRowsFromJsonDrawRoot(null, parsed.dataJson);
      if (fromDataJson && isMapDrawnRoutesExportArray(fromDataJson)) return fromDataJson;
    }
    if (Array.isArray(parsed) && isMapDrawnRoutesExportArray(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.mapDrawnRoutes) &&
      isMapDrawnRoutesExportArray(parsed.mapDrawnRoutes)
    ) {
      return parsed.mapDrawnRoutes;
    }
    return null;
  };

  /** 匯入本機 JSON 檔作為本層路網（設使用者覆寫旗標，之後打開不再自動鏡像上游） */
  const onConnectStraightenLocalJsonInputChange = async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    const lyr = resolveConnectStraightenLayer();
    if (!file || !lyr) return;
    try {
      lyr.isLoading = true;
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rows = extractMapDrawnRoutesRowsForConnectStraighten(parsed);
      if (!rows?.length) {
        window.alert(
          'JSON 須為地圖路段匯出陣列（routeName／segment／routeCoordinates），或含 dataJson／mapDrawnRoutes 之物件。'
        );
        lyr.isLoading = false;
        return;
      }
      const fc = minimalLineStringFeatureCollectionFromRouteExportRows(rows, {
        stationPoints: 'all',
        routeLine: 'full',
      });
      const derived = buildTaipeiB3ExecuteLayerFieldsFromGeojson(fc, {});
      const sn = derived?.spaceNetworkGridJsonData;
      if (!Array.isArray(sn) || sn.length === 0) {
        window.alert('無法由該 JSON 建立路網（spaceNetworkGridJsonData 為空）。');
        lyr.isLoading = false;
        return;
      }
      lyr.connectStraightenUserJsonOverride = true;
      lyr.jsonFileName = file.name;
      applyConnectStraightenSegmentsToLayer(lyr, sn);
      lyr.isLoaded = true;
      lyr.isLoading = false;
      connectStraightenStep.value = -1;
      lyr.highlightedSegmentIndex = null;
      lyr.connectStraightenMovePreview = null;
      await dataStore.saveLayerState(lyr.layerId, jsonGridFromCoordNormalizedPersistPayload(lyr));
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
      window.alert(`已讀入「${file.name}」。之後開啟本層將沿用此檔（不再自動鏡像上游）。`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      window.alert('讀取或解析 JSON 失敗（詳見控制台）。');
      if (lyr) {
        lyr.isLoading = false;
        dataStore.saveLayerState(lyr.layerId, { isLoading: false });
      }
    }
  };

  /** 重新自上游鏡像（清掉使用者匯入覆寫與既有資料，再拉一次上游結果） */
  const resyncConnectStraightenFromUpstream = async () => {
    const lyr = resolveConnectStraightenLayer();
    if (!lyr) return;
    if (connectStraightenAutoActive.value) stopConnectStraightenAuto();
    lyr.connectStraightenUserJsonOverride = false;
    lyr.jsonFileName = null;
    lyr.spaceNetworkGridJsonData = null;
    connectStraightenStep.value = -1;
    lyr.highlightedSegmentIndex = null;
    lyr.connectStraightenMovePreview = null;
    if (!seedConnectStraightenFromUpstreamIfEmpty(lyr)) {
      window.alert('上游「站點與路線往中心聚集（先橫後直）」尚無路網；請先產生該圖層資料。');
      return;
    }
    dataStore.saveLayerState(lyr.layerId, jsonGridFromCoordNormalizedPersistPayload(lyr));
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
    window.alert('已重新自上游「往中心聚集（先橫後直）」鏡像最新結果。');
  };
  // ── end connect_straighten_hv ────────────────────────────────────────────

  const maybeLineOrthoHubBlueDiagonalPrepassOnce = async (lyr) => {
    if (!lyr || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(lyr.layerId) || isExecuting.value)
      return;
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) return;
    const flatIn = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const { segments: passSegs, moves } = applyLineOrthoHubBlueDiagonalPrepassSegments(flatIn);
    if (!moves) return;
    applyJsonGridFromCoordBestMoveSegmentsToLayer(lyr, passSegs);
    await dataStore.saveLayerState(lyr.layerId, {
      ...jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true }),
    });
    refreshOrthogonalVhMirrorForLineOrthoLayer(lyr);
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /**
   * 於目前圖層路網嘗試對單一頂點做最佳共點平移（不更新 highlight／步進）。
   * @returns {{ ok: boolean, applied: boolean, errorMessage?: string, targetGrid?: {x:number,y:number}, costBefore?: number, costAfter?: number }}
   */
  const tryJsonGridFromCoordApplyBestMoveAtVertex = (lyr, it) => {
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) {
      return { ok: false, applied: false, errorMessage: '沒有路網輸入。' };
    }
    const flat = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    const move = applyBestCoPointGroupMoveOnGrid(flat, it.segIdx, it.ptIdx);
    if (!move.ok) {
      return { ok: false, applied: false, errorMessage: move.message || '無法評估平移' };
    }
    if (!move.applied || !Array.isArray(move.segments)) {
      return { ok: true, applied: false };
    }
    applyJsonGridFromCoordBestMoveSegmentsToLayer(lyr, move.segments);
    return {
      ok: true,
      applied: true,
      targetGrid: move.target,
      costBefore: move.costBefore,
      costAfter: move.costAfter,
    };
  };

  /** 手動步進：highlight 下一點並嘗試平移；自動模式每秒呼叫 */
  const advanceJsonGridFromCoordVertexHighlight = async () => {
    const lyr = resolveActivePointOrthogonalLayer();
    const pid = lyr?.layerId;
    const list = lyr ? jsonGridFromCoordNormalizedVertexList(lyr) : [];
    if (!lyr || !pid || !list.length) {
      window.alert('尚無頂點；請先有路網資料。');
      stopJsonGridFromCoordVertexAuto();
      return;
    }
    jsonGridFromCoordVertexStep.value = (jsonGridFromCoordVertexStep.value + 1) % list.length;
    const it = list[jsonGridFromCoordVertexStep.value];
    lyr.highlightedSegmentIndex = [it.segIdx, it.ptIdx];
    lyr.jsonGridFromCoordSuggestTargetGrid = null;

    const r = tryJsonGridFromCoordApplyBestMoveAtVertex(lyr, it);
    if (!r.ok && r.errorMessage) {
      window.alert(r.errorMessage);
      stopJsonGridFromCoordVertexAuto();
      dataStore.saveLayerState(pid, {
        highlightedSegmentIndex: lyr.highlightedSegmentIndex,
        jsonGridFromCoordSuggestTargetGrid: null,
      });
      return;
    }

    if (r.applied) {
      jsonGridFromCoordVertexStep.value = -1;
      lyr.highlightedSegmentIndex = null;
      dataStore.saveLayerState(pid, jsonGridFromCoordNormalizedPersistPayload(lyr));
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
      return;
    }

    dataStore.saveLayerState(pid, {
      highlightedSegmentIndex: lyr.highlightedSegmentIndex,
      jsonGridFromCoordSuggestTargetGrid: null,
    });
  };

  const startJsonGridFromCoordVertexAuto = () => {
    const lyr = resolveActivePointOrthogonalLayer();
    if (!lyr || jsonGridFromCoordNormalizedVertexList(lyr).length === 0) {
      window.alert('尚無頂點；請先有路網資料。');
      return;
    }
    if (jsonGridFromCoordVertexOneClickRunning.value) return;
    stopJsonGridFromCoordVertexAuto();
    orthogonalVhDrawControlTabApi.stopVhDrawDiagonalRouteAuto();
    jsonGridFromCoordVertexAutoActive.value = true;
    jsonGridFromCoordVertexAutoTimerId = setInterval(async () => {
      if (!jsonGridFromCoordVertexAutoActive.value || jsonGridFromCoordVertexAutoTickBusy) return;
      jsonGridFromCoordVertexAutoTickBusy = true;
      try {
        await advanceJsonGridFromCoordVertexHighlight();
      } finally {
        jsonGridFromCoordVertexAutoTickBusy = false;
      }
    }, JSON_GRID_FROM_COORD_VERTEX_AUTO_MS);
  };

  /** 自列表頭逐一嘗試平移，一有套用即回到頭，直到整輪無可改善（不更新 highlight／中途不重繪） */
  const runJsonGridFromCoordVertexUntilStableNoUi = async () => {
    const lyr = resolveActivePointOrthogonalLayer();
    const pid = lyr?.layerId;
    if (!lyr || !pid || jsonGridFromCoordNormalizedVertexList(lyr).length === 0) {
      window.alert('尚無頂點；請先有路網資料。');
      return;
    }
    if (jsonGridFromCoordVertexAutoActive.value) stopJsonGridFromCoordVertexAuto();
    jsonGridFromCoordVertexOneClickRunning.value = true;
    const MAX_MOVES = 50000;
    let moveCount = 0;
    let round = 0;
    const logPrefix = `[${pid}][一鍵完成]`;
    try {
      // eslint-disable-next-line no-console
      console.log(logPrefix, '開始', {
        頂點數: jsonGridFromCoordNormalizedVertexList(lyr).length,
        單次平移上限: MAX_MOVES,
      });
      lyr.highlightedSegmentIndex = null;
      lyr.jsonGridFromCoordSuggestTargetGrid = null;
      while (moveCount < MAX_MOVES) {
        const list = jsonGridFromCoordNormalizedVertexList(lyr);
        if (!list.length) {
          // eslint-disable-next-line no-console
          console.log(logPrefix, '頂點列表為空，結束');
          break;
        }
        round += 1;
        // eslint-disable-next-line no-console
        console.log(logPrefix, `第 ${round} 輪掃描起點`, {
          本輪頂點數: list.length,
          累計平移: moveCount,
        });
        let appliedRound = false;
        let vi = 0;
        for (const it of list) {
          vi += 1;
          if (vi === 1 || vi === list.length || vi % 50 === 0) {
            // eslint-disable-next-line no-console
            console.log(logPrefix, `第 ${round} 輪進度 ${vi}/${list.length}`, {
              列表序: it.row,
              segIdx: it.segIdx,
              ptIdx: it.ptIdx,
              route: it.routeName,
              xy: [it.x, it.y],
            });
          }
          const r = tryJsonGridFromCoordApplyBestMoveAtVertex(lyr, it);
          if (!r.ok) {
            // eslint-disable-next-line no-console
            console.error(logPrefix, '評估／套用失敗', r.errorMessage);
            window.alert(r.errorMessage || '無法評估平移');
            dataStore.saveLayerState(pid, jsonGridFromCoordNormalizedPersistPayload(lyr));
            await nextTick();
            dataStore.requestSpaceNetworkGridFullRedraw();
            return;
          }
          if (r.applied) {
            moveCount += 1;
            appliedRound = true;
            // eslint-disable-next-line no-console
            console.log(logPrefix, `第 ${moveCount} 次平移（本輪於 ${vi}/${list.length} 命中）`, {
              列表序: it.row,
              segIdx: it.segIdx,
              ptIdx: it.ptIdx,
              route: it.routeName,
              原座標: [it.x, it.y],
              目標格: r.targetGrid,
              斜段權重: `${r.costBefore} → ${r.costAfter}`,
            });
            break;
          }
        }
        if (!appliedRound) {
          // eslint-disable-next-line no-console
          console.log(logPrefix, `第 ${round} 輪掃描完畢，無平移 → 收斂`, { 累計平移: moveCount });
          break;
        }
        // eslint-disable-next-line no-console
        console.log(logPrefix, `第 ${round} 輪已套用平移，回到列表頭再掃`, { 累計平移: moveCount });
      }
      if (moveCount >= MAX_MOVES) {
        // eslint-disable-next-line no-console
        console.warn(logPrefix, '已達單次平移上限，停止', { 累計平移: moveCount, 輪數: round });
        window.alert('一鍵完成已達單次平移上限，請檢查路網或改用手動步進。');
      }
      jsonGridFromCoordVertexStep.value = -1;
      lyr.highlightedSegmentIndex = null;
      lyr.jsonGridFromCoordSuggestTargetGrid = null;
      dataStore.saveLayerState(pid, jsonGridFromCoordNormalizedPersistPayload(lyr));
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
      // eslint-disable-next-line no-console
      console.log(logPrefix, '結束', {
        累計平移: moveCount,
        最後輪次: round,
        已觸發上限: moveCount >= MAX_MOVES,
      });
      if (moveCount === 0) {
        window.alert('路網已無可改善之共點平移（斜段已盡量在約束內轉橫豎）。');
      }
    } finally {
      jsonGridFromCoordVertexOneClickRunning.value = false;
    }
  };

  /** 「座標正規化」圖層：依序對齊本區——正規化 → 鄰線錯邊修正（與「修正」按鈕同條件）→ 刪空欄列 */
  const jsonGridCoordNormalizedPipelineOneClickRunning = ref(false);

  const onJsonGridCoordNormalizedFullPipelineClick = async () => {
    if (isExecuting.value || jsonGridCoordNormalizedPipelineOneClickRunning.value) return;
    jsonGridCoordNormalizedPipelineOneClickRunning.value = true;
    try {
      await nextTick();
      const b = pickJsonGridNormalizeExecuteBundle();
      const normOk = await Promise.resolve(b.execNormalize());
      if (!normOk) {
        window.alert(
          '一鍵流程中止：無法完成「座標正規化」（請確認已開啟本圖層並自「OSM／GeoJSON → JSON」複製 dataJson／路網）。'
        );
        return;
      }

      const layNorm = dataStore.findLayerById(b.normLayerId);
      const tc0 = layNorm?.dashboardData?.topologyCheck;
      if (tc0 && !tc0.skipped && tc0.structMatch && tc0.hasNeighborFlips) {
        await Promise.resolve(b.execTopology());
      }

      await nextTick();
      const layPrune = dataStore.findLayerById(b.normLayerId);
      const tcp = layPrune?.dashboardData?.topologyCheck;
      if (tcp && !tcp.skipped) {
        await Promise.resolve(b.execPruneEmptyAfterNorm());
      }
    } catch (err) {
      console.error(err);
      window.alert('一鍵流程發生錯誤（詳見控制台）。');
    } finally {
      jsonGridCoordNormalizedPipelineOneClickRunning.value = false;
    }
  };

  /** JSON·網格·座標正規化（單鍵 b→c→d） */
  const onJsonGridCoordNormalizeClick = async () => {
    if (isExecuting.value) return;
    isExecuting.value = true;
    try {
      await nextTick();
      const b = pickJsonGridNormalizeExecuteBundle();
      const ok = await Promise.resolve(b.execNormalize());
      if (!ok) {
        window.alert(
          '座標正規化失敗：請先在左側開啟「JSON·網格·座標正規化」圖層（會自動自「OSM／GeoJSON → JSON」複製 dataJson），或將路網貼入 spaceNetworkGridJsonData 後再試。'
        );
      } else {
        const layNorm = dataStore.findLayerById(b.normLayerId);
        const tc = layNorm?.dashboardData?.topologyCheck;
        if (tc && !tc.skipped && !tc.topologyPreserved) {
          window.alert(`座標正規化已完成。\n\n${tc.summaryZh}`);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        isExecuting.value = false;
      }, 300);
    }
  };

  /** 「JSON·網格·座標正規化」圖層：刪空欄列（依目前選定之 main／群組_2 執行） */
  const onJsonGridPruneEmptyGridLinesClick = async () => {
    const b = pickJsonGridNormalizeExecuteBundle();
    const lay = dataStore.findLayerById(b.normLayerId);
    const tc = lay?.dashboardData?.topologyCheck;
    if (!(tc && !tc.skipped)) {
      window.alert('須先完成「座標正規化」並顯示上方拓撲比對後，才可刪空欄列。');
      return;
    }
    if (isExecuting.value) return;
    isExecuting.value = true;
    try {
      await nextTick();
      await Promise.resolve(b.execPruneEmptyAfterNorm());
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        isExecuting.value = false;
      }, 300);
    }
  };

  const onJsonGridFromCoordPruneEmptyGridLinesClick = async () => {
    if (isExecuting.value) return;
    const follow = resolveActivePointOrthogonalLayer();
    if (!follow?.spaceNetworkGridJsonData?.length) {
      window.alert('本層尚無路網（spaceNetworkGridJsonData）。請先載入或鏡像父層資料。');
      return;
    }
    isExecuting.value = true;
    try {
      await nextTick();
      const r = await Promise.resolve(executeJsonGridFromCoordNormalizedPruneEmptyGridLines());
      if (!r?.ok) {
        if (r?.reason === 'no-network') {
          window.alert('尚無路網可刪空欄列。');
        }
        return;
      }
      if (r.noop) {
        window.alert('目前沒有「整欄或整列皆無 connect（紅／藍）頂點」可刪除；路網維持不變。');
      } else {
        await nextTick();
        dataStore.requestSpaceNetworkGridFullRedraw();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        isExecuting.value = false;
      }, 300);
    }
  };

  const onTaipeiOsmSpaceGridLocalFileInputChange = async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    const layer = dataStore.findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID);
    if (!file) return;
    if (!layer) {
      window.alert(
        '找不到「OSM／GeoJSON → JSON」圖層（osm_2_geojson_2_json）。請確認左側圖層列表內含此圖層後再試。'
      );
      return;
    }
    try {
      layer.isLoading = true;
      const text = await file.text();
      ingestOsmSpaceGridTextIntoLayer(layer, text, file.name);
    } catch (err) {
      console.error('本機 OSM／GeoJSON 讀取失敗:', err);
      layer.isLoading = false;
      dataStore.saveLayerState(layer.layerId, { isLoading: false });
      window.alert(`讀檔失敗：${String(err?.message ?? err ?? '')}`);
    }
  };

  // ==================== 👀 響應式監聽器 (Reactive Watchers) ====================

  /**
   * 記錄上一次的圖層列表用於比較變化
   * 用於偵測新增的圖層並自動切換到最新圖層
   */
  const previousLayers = ref([]);

  /**
   * 👀 監聽可見圖層變化，自動切換到新開啟的圖層分頁
   */
  watch(
    () => visibleLayers.value,
    (newLayers) => {
      // 確保 newLayers 是有效的陣列
      if (!Array.isArray(newLayers)) {
        activeLayerTab.value = null;
        previousLayers.value = [];
        return;
      }

      // 如果沒有可見圖層，清除選中的分頁
      if (newLayers.length === 0) {
        activeLayerTab.value = null;
        previousLayers.value = [];
        return;
      }

      // 確保所有圖層都有有效的 layerId
      const validLayers = newLayers.filter((layer) => layer && layer.layerId);

      // 如果沒有有效圖層，清除選中的分頁
      if (validLayers.length === 0) {
        activeLayerTab.value = null;
        previousLayers.value = [];
        return;
      }

      // 使用 nextTick 確保在 DOM 更新後再進行狀態更新
      nextTick(() => {
        // 找出新增的圖層（比較新舊圖層列表）
        const previousLayerIds = (previousLayers.value || [])
          .filter((layer) => layer && layer.layerId)
          .map((layer) => layer.layerId);
        const newLayerIds = validLayers.map((layer) => layer.layerId);
        const addedLayerIds = newLayerIds.filter((id) => !previousLayerIds.includes(id));

        // 如果有新增的圖層，自動切換到最新新增的圖層
        if (addedLayerIds.length > 0) {
          const newestAddedLayerId = addedLayerIds[addedLayerIds.length - 1];
          if (validLayers.find((layer) => layer.layerId === newestAddedLayerId)) {
            activeLayerTab.value = newestAddedLayerId;
          }
        }
        // 如果當前沒有選中分頁，或選中的分頁不在可見列表中，選中第一個
        else if (
          !activeLayerTab.value ||
          !validLayers.find((layer) => layer.layerId === activeLayerTab.value)
        ) {
          if (validLayers[0] && validLayers[0].layerId) {
            activeLayerTab.value = validLayers[0].layerId;
          }
        }

        // 更新記錄的圖層列表（只記錄有效的圖層）
        previousLayers.value = [...validLayers];
      });
    },
    { deep: false, immediate: true }
  );

  // ==================== 🎯 網格預覽功能 (Grid Preview Functions) ====================

  /**
   * 🎨 網格預覽尺寸 (Grid Preview Size)
   * 設定網格預覽的 SVG 尺寸
   */
  const previewGridSize = 120;

  /**
   * 📊 取得預覽節點數據 (Get Preview Nodes Data)
   * 從當前圖層的 processedJsonData 中提取節點信息用於預覽
   * 使用原始數據，不受刪除邏輯影響
   */
  const getPreviewNodes = () => {
    if (!activeLayerTab.value) return [];

    if (!Array.isArray(visibleLayers.value) || visibleLayers.value.length === 0) {
      return [];
    }

    const currentLayer = visibleLayers.value.find(
      (layer) => layer && layer.layerId === activeLayerTab.value
    );

    if (!currentLayer || !currentLayer.processedJsonData) return [];

    // 🎯 只使用 processedJsonData 中的原始數據
    if (
      currentLayer.processedJsonData.nodes &&
      Array.isArray(currentLayer.processedJsonData.nodes)
    ) {
      return currentLayer.processedJsonData.nodes;
    }

    return [];
  };

  /**
   * 📊 計算每列的最大值 (Calculate Column Max Values)
   * 用於顯示列的最大值標籤
   */
  const getColumnMaxValues = () => {
    const nodes = getPreviewNodes();
    const { gridX } = getOriginalGridDimensions();

    if (!Array.isArray(nodes) || gridX <= 0) {
      return [];
    }

    const columnMaxValues = new Array(gridX).fill(0);

    nodes.forEach((node) => {
      if (node && typeof node.x === 'number' && node.x >= 0 && node.x < gridX) {
        columnMaxValues[node.x] = Math.max(columnMaxValues[node.x], node.value || 0);
      }
    });

    return columnMaxValues;
  };

  /**
   * 📊 計算每行的最大值 (Calculate Row Max Values)
   * 用於顯示行的最大值標籤
   */
  const getRowMaxValues = () => {
    const nodes = getPreviewNodes();
    const { gridY } = getOriginalGridDimensions();

    if (!Array.isArray(nodes) || gridY <= 0) {
      return [];
    }

    const rowMaxValues = new Array(gridY).fill(0);

    nodes.forEach((node) => {
      if (node && typeof node.y === 'number' && node.y >= 0 && node.y < gridY) {
        rowMaxValues[node.y] = Math.max(rowMaxValues[node.y], node.value || 0);
      }
    });

    return rowMaxValues;
  };

  /**
   * 📊 取得原始網格尺寸 (Get Original Grid Dimensions)
   * 從 processedJsonData 中獲取原始網格尺寸，不受刪除邏輯影響
   */
  const getOriginalGridDimensions = () => {
    if (!activeLayerTab.value) return { gridX: 0, gridY: 0 };

    if (!Array.isArray(visibleLayers.value) || visibleLayers.value.length === 0) {
      return { gridX: 0, gridY: 0 };
    }

    const currentLayer = visibleLayers.value.find(
      (layer) => layer && layer.layerId === activeLayerTab.value
    );

    if (!currentLayer || !currentLayer.processedJsonData) {
      return { gridX: 0, gridY: 0 };
    }

    return {
      gridX: currentLayer.processedJsonData.gridX || 0,
      gridY: currentLayer.processedJsonData.gridY || 0,
    };
  };

  /**
   * 📍 計算節點 X 座標 (Calculate Node X Position)
   * 根據節點的 x 索引計算在預覽中的 X 座標
   */
  const getNodeX = (nodeX) => {
    const { gridX } = getOriginalGridDimensions();
    if (gridX === 0) return 0;
    return (nodeX + 0.5) * (previewGridSize / gridX);
  };

  /**
   * 📍 計算節點 Y 座標 (Calculate Node Y Position)
   * 根據節點的 y 索引計算在預覽中的 Y 座標
   */
  const getNodeY = (nodeY) => {
    const { gridY } = getOriginalGridDimensions();
    if (gridY === 0) return 0;
    return (nodeY + 0.5) * (previewGridSize / gridY);
  };

  /**
   * 🎲 隨機產生權重 (Randomize Weights)
   * 根據指定的權重值和機率分佈重新產生所有權重
   * 同時更新 layoutGridJsonData_Test 和 dataTableData
   */
  const randomizeWeights = () => {
    if (!currentLayer.value) {
      console.warn('當前圖層不存在');
      return;
    }

    const layoutData = currentLayer.value.layoutGridJsonData_Test;
    if (!Array.isArray(layoutData)) {
      console.warn('layoutGridJsonData_Test 不是 Array');
      return;
    }

    // 權重值和機率分佈
    const WEIGHT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const WEIGHT_PROBS = [256, 128, 64, 32, 16, 8, 4, 2, 1];

    // 計算總機率
    const totalProb = WEIGHT_PROBS.reduce((sum, prob) => sum + prob, 0);

    // 產生隨機權重的函數
    const generateRandomWeight = () => {
      const random = Math.random() * totalProb;
      let cumulative = 0;
      for (let i = 0; i < WEIGHT_VALUES.length; i++) {
        cumulative += WEIGHT_PROBS[i];
        if (random <= cumulative) {
          return WEIGHT_VALUES[i];
        }
      }
      return WEIGHT_VALUES[0]; // 預設返回最小值
    };

    // 遍歷所有路線，重新產生 station_weights
    layoutData.forEach((route) => {
      if (!route || !Array.isArray(route.segments)) return;

      route.segments.forEach((seg) => {
        if (!seg || !Array.isArray(seg.station_weights)) return;

        // 重新產生每個 station_weight 的權重值
        seg.station_weights.forEach((weightInfo) => {
          if (weightInfo && typeof weightInfo.weight === 'number') {
            weightInfo.weight = generateRandomWeight();
          }
        });
      });
    });

    // 🔄 重新生成 dataTableData（基於更新後的權重）
    const dataTableData = [];

    // 輔助函數：從 node 物件中提取 station_name
    const getStationName = (node) => {
      if (!node) return '';
      return node.station_name || node.tags?.station_name || node.tags?.name || '';
    };

    const getStationId = (node) => {
      if (!node) return '';
      return node.station_id || node.tags?.station_id || '';
    };

    // 盡量用穩定且唯一的 key（優先 node.id，其次 station_id，其次 station_name + grid）
    const getNodeKey = (node) => {
      if (!node) return 'node:unknown';
      if (Number.isFinite(node.id)) return `id:${node.id}`;
      const sid = getStationId(node);
      if (sid) return `station_id:${sid}`;
      const name = getStationName(node) || 'unknown';
      const x = node.x_grid ?? node.tags?.x_grid ?? '';
      const y = node.y_grid ?? node.tags?.y_grid ?? '';
      return `name:${name}|x:${x}|y:${y}`;
    };

    // key -> { node, weights: number[], routeName: string, routeColor: string }
    const nodeAdj = new Map();

    const ensureNodeEntry = (node, routeName, routeColor) => {
      const key = `${routeName}|${getNodeKey(node)}`;
      if (!nodeAdj.has(key)) {
        nodeAdj.set(key, { node, weights: [], routeName, routeColor: routeColor || '' });
      } else {
        // 用資訊更完整的 node 覆蓋（避免先遇到空物件）
        const cur = nodeAdj.get(key);
        const curName = getStationName(cur.node);
        const newName = getStationName(node);
        if (!curName && newName) cur.node = node;
        if (!cur.routeColor && routeColor) cur.routeColor = routeColor;
      }
      return key;
    };

    const addWeightToNode = (node, weight, routeName, routeColor) => {
      if (!node) return;
      const key = ensureNodeEntry(node, routeName, routeColor);
      if (typeof weight === 'number' && Number.isFinite(weight)) {
        nodeAdj.get(key).weights.push(weight);
      }
    };

    // 遍歷所有路線和 segments，收集權重
    for (const route of layoutData) {
      const routeName = route.route_name || 'Unknown';
      const defaultRouteColor = route.original_props?.colour || route.color || '#999999';
      const segments = route.segments || [];

      for (let segIndex = 0; segIndex < segments.length; segIndex++) {
        const seg = segments[segIndex];
        const routeColor =
          seg.way_properties?.tags?.color || seg.way_properties?.tags?.colour || defaultRouteColor;
        const nodes = seg.nodes || [];
        const propertiesStart = seg.properties_start;
        const propertiesEnd = seg.properties_end;
        const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : null;

        if (stationWeights && stationWeights.length > 0) {
          // 處理 station_weights（兩個黑點之間一個權重）
          for (let wIndex = 0; wIndex < stationWeights.length; wIndex++) {
            const wInfo = stationWeights[wIndex];
            const startIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
            const endIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
            const weight = wInfo?.weight;

            const startNode =
              startIdx === 0 ? propertiesStart || nodes[0] : nodes[startIdx] || nodes[0];
            const endNode =
              endIdx === nodes.length - 1
                ? propertiesEnd || nodes[endIdx]
                : nodes[endIdx] || nodes[nodes.length - 1];

            // 兩端節點都要收到這條邊的 weight
            addWeightToNode(startNode, weight, routeName, routeColor);
            addWeightToNode(endNode, weight, routeName, routeColor);
          }
        }
      }
    }

    // 產生 table rows：每個節點 1 row，取最小的兩個 weight（由小到大）
    let rowIndex = 1;
    for (const entry of nodeAdj.values()) {
      const node = entry.node;
      const weights = (entry.weights || []).filter(
        (w) => typeof w === 'number' && Number.isFinite(w)
      );
      weights.sort((a, b) => a - b);

      // 依需求：每筆一定要有 2 個與該黑點相連的 weight（不足 2 的通常是路線端點，直接略過）
      if (weights.length < 2) continue;

      const w1 = weights[0];
      const w2 = weights[1];

      const stationId = getStationId(node);
      const xGrid = node?.x_grid ?? node?.tags?.x_grid ?? null;
      const yGrid = node?.y_grid ?? node?.tags?.y_grid ?? null;

      dataTableData.push({
        '#': rowIndex++,
        route_name: entry.routeName || '',
        route_color: entry.routeColor || '',
        station_id: stationId || '',
        station_name: getStationName(node),
        node_type: node?.node_type ?? '',
        x_grid: xGrid,
        y_grid: yGrid,
        weight_1: w1,
        weight_2: w2,
        合併: 'X',
        合併2: 'X',
      });
    }

    // 排序：先看 weight_1，再看 weight_2（都由小到大）
    dataTableData.sort((a, b) => {
      const a1 = a.weight_1 ?? Number.POSITIVE_INFINITY;
      const b1 = b.weight_1 ?? Number.POSITIVE_INFINITY;
      if (a1 !== b1) return a1 - b1;
      const a2 = a.weight_2 ?? Number.POSITIVE_INFINITY;
      const b2 = b.weight_2 ?? Number.POSITIVE_INFINITY;
      return a2 - b2;
    });

    // 重新編號（排序後更新 # 欄位）
    dataTableData.forEach((row, index) => {
      row['#'] = index + 1;
    });

    // 🔄 更新 dataTableData
    currentLayer.value.dataTableData = dataTableData;

    // 🔄 用新引用觸發 LayoutGridTab_Test 的 deep watch，讓權重更新後自動重繪
    currentLayer.value.layoutGridJsonData_Test = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
    );

    // 🔄 將更新後的 layoutGridJsonData_Test 也複製到 layoutGridJsonData_Test2
    currentLayer.value.layoutGridJsonData_Test2 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
    );

    // 🔄 將更新後的 layoutGridJsonData_Test 也複製到 layoutGridJsonData_Test3
    currentLayer.value.layoutGridJsonData_Test3 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
    );

    console.log(
      '已重新產生所有權重值並更新 dataTableData、layoutGridJsonData_Test2 和 layoutGridJsonData_Test3'
    );
  };

  /**
   * 🔗 合併一筆路線 (Merge One Route)
   * 依據 dataTableData 裡面的順序，找到第一筆符合條件的項目，將其合併改成 "V"
   * 略過條件：
   * - node_type = 'connect' 的項目
   * - weight_1 與 weight_2 不同的項目
   * 每次點擊必須執行一筆，如果當前筆不符合條件就找下一筆，直到找到或全部執行完
   *
   * 🎯 新功能：實際刪除黑點並合併路段
   * 1. 找到對應的黑點在 layoutGridJsonData_Test 中的位置
   * 2. 把經過該點的兩段路（帶各自 weight）合併成一段
   * 3. 從 points 陣列中刪除該點
   * 4. 更新所有 station_weights 的索引
   */
  const mergeOneRoute = (gap = 0) => {
    if (!currentLayer.value) return;

    const layoutData = currentLayer.value.layoutGridJsonData_Test;
    if (!Array.isArray(layoutData)) {
      console.warn('layoutGridJsonData_Test 不是 Array（目前只支援 2-5 routes array 格式）');
      return;
    }

    // ✅ 直接從 station_weights 找「連續兩段 weight 差 <= gap」的中間點，不再依賴 station_id/station_name 來定位 points 索引
    // 規則：
    // - Math.abs(w1.weight - w2.weight) <= gap（允許權重差在 gap 範圍內）
    // - w1.end_idx === w2.start_idx（共用中間點）
    // - 中間點不是 connect（避免刪紅點/轉乘點）
    let merged = false;
    let mergedRouteName = '';

    const isConnectNodeAt = (seg, idx) => {
      const hasValue = (v) => v !== undefined && v !== null;
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      const nodeType =
        node?.node_type ||
        ptProps?.node_type ||
        tags?.node_type ||
        (hasValue(node?.connect_number) ? 'connect' : '');
      const hasConnectNumber =
        hasValue(node?.connect_number) ||
        hasValue(tags?.connect_number) ||
        hasValue(ptProps?.connect_number) ||
        hasValue(ptProps?.tags?.connect_number);
      return nodeType === 'connect' || hasConnectNumber;
    };

    /**
     * 判斷是否為真正的車站（有 station_name 的點）
     * 只有真正的車站才可被合併刪除
     * 幾何轉折點（無 station_name）和 connect 節點不應被刪除
     */
    const isRealStation = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      // 有 station_name 才算真正的車站
      const hasStationName = !!(
        node?.station_name ||
        ptProps?.station_name ||
        tags?.station_name ||
        ptProps?.tags?.station_name
      );

      return hasStationName;
    };

    /**
     * 判斷某個點是否為幾何轉折點（前後線段方向不同）
     * 如果是轉折點，刪除後需要保留座標以維持路線形狀
     */
    const isBendPoint = (points, idx) => {
      if (idx <= 0 || idx >= points.length - 1) return false;

      const prev = points[idx - 1];
      const curr = points[idx];
      const next = points[idx + 1];

      const px = Array.isArray(prev) ? prev[0] : prev.x || 0;
      const py = Array.isArray(prev) ? prev[1] : prev.y || 0;
      const cx = Array.isArray(curr) ? curr[0] : curr.x || 0;
      const cy = Array.isArray(curr) ? curr[1] : curr.y || 0;
      const nx = Array.isArray(next) ? next[0] : next.x || 0;
      const ny = Array.isArray(next) ? next[1] : next.y || 0;

      // 計算前段向量和後段向量
      const dx1 = cx - px;
      const dy1 = cy - py;
      const dx2 = nx - cx;
      const dy2 = ny - cy;

      // 如果向量方向不同（不共線），就是轉折點
      // 使用叉積判斷：如果叉積不為 0，表示不共線
      const crossProduct = dx1 * dy2 - dy1 * dx2;
      const epsilon = 0.001; // 容許微小誤差

      return Math.abs(crossProduct) > epsilon;
    };

    for (const route of layoutData) {
      if (merged) break;
      const routeName = route?.route_name || '';
      const segments = route?.segments || [];

      for (const seg of segments) {
        if (merged) break;
        const points = Array.isArray(seg.points) ? seg.points : [];
        const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
        if (points.length < 3 || weights.length < 2) continue;

        for (let i = 0; i < weights.length - 1; i++) {
          const w1 = weights[i];
          const w2 = weights[i + 1];
          if (!w1 || !w2) continue;
          // 使用 gap 參數：允許 weight 差 <= gap
          const weightDiff = Math.abs((w1.weight || 0) - (w2.weight || 0));
          if (weightDiff > gap) continue;
          if (w1.end_idx !== w2.start_idx) continue;

          const midIdx = w1.end_idx;
          // 不刪端點，避免破壞線段
          if (midIdx <= 0 || midIdx >= points.length - 1) continue;
          // 不刪 connect/轉乘點
          if (isConnectNodeAt(seg, midIdx)) continue;
          // 不刪幾何轉折點（只刪真正的車站）
          if (!isRealStation(seg, midIdx)) continue;

          // 1) 合併兩段 weight：把 w1 end 延伸到 w2 end，並移除 w2
          w1.end_idx = w2.end_idx;
          weights.splice(i + 1, 1);

          // 2) 檢查是否為幾何轉折點
          const isBend = isBendPoint(points, midIdx);

          if (isBend) {
            // 如果是轉折點，保留座標但移除車站屬性
            // 將該點轉換為純幾何點 [x, y]
            const pt = points[midIdx];
            const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
            const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
            points[midIdx] = [x, y]; // 只保留座標，不保留屬性

            // 🎯 將 nodes 對應位置標記為幾何轉折點（不刪除，保持索引一致）
            if (Array.isArray(seg.nodes)) {
              // 確保 nodes 數組長度與 points 一致
              while (seg.nodes.length < points.length) {
                seg.nodes.push({});
              }
              // 將該位置標記為幾何點，node_type: 'line' 表示非車站點
              seg.nodes[midIdx] = { node_type: 'line' };
            }

            // ⚠️ 注意：因為 points 沒有刪除（只是改成純座標），所以 station_weights 的索引不需要調整
          } else {
            // 如果不是轉折點，直接刪除該點
            seg.points.splice(midIdx, 1);
            if (Array.isArray(seg.nodes) && seg.nodes.length > midIdx) {
              seg.nodes.splice(midIdx, 1);
            }

            // 3) 修正所有 station_weights 的索引（刪除點後，midIdx 之後的索引都要 -1）
            for (const w of weights) {
              if (w.start_idx > midIdx) w.start_idx--;
              if (w.end_idx > midIdx) w.end_idx--;
            }
          }

          merged = true;
          mergedRouteName = routeName;
          break;
        }
      }
    }

    if (!merged) {
      console.log('所有項目都已處理完畢，沒有需要合併的項目');
      return;
    }

    // 在 dataTableData 中把最可能對應的那一筆設成 V（維持 UI 的「合併欄位」行為）
    if (Array.isArray(currentLayer.value.dataTableData)) {
      const row = currentLayer.value.dataTableData.find(
        (r) =>
          r &&
          r.合併 !== 'V' &&
          r.node_type !== 'connect' &&
          Math.abs((r.weight_1 || 0) - (r.weight_2 || 0)) <= gap &&
          String(r.route_name || '') === String(mergedRouteName || '')
      );
      if (row) row.合併 = 'V';
    }

    // 🔄 用新引用觸發 LayoutGridTab_Test 的 deep watch，讓點消失後自動重繪
    currentLayer.value.layoutGridJsonData_Test = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
    );

    // 🔄 同步更新到 layoutGridJsonData_Test2
    currentLayer.value.layoutGridJsonData_Test2 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
    );
  };

  /**
   * 🔗 合併一筆路線2 (Merge One Route 2)
   * - 依據 DataTableTab 目前的 dataTableData 順序，找到第一筆可合併的項目（使用「合併2」欄位記錄）
   * - 使用該筆的 route_name + weight_1/weight_2（必要時再用 station_id/station_name）去 layoutGridJsonData_Test2 定位並合併
   * - 合併成功後：將該 row 的 合併2 設為 "V"
   *
   * @param {number} gap - 允許的權重差
   * @param {string} direction - 方向篩選：'V' (垂直線) 或 'H' (水平線) 或 null (不篩選)
   * @returns {boolean} 是否有成功合併
   */
  const mergeOneRoute2 = (gap = 0, direction = null) => {
    if (!currentLayer.value) return false;

    const tableData = currentLayer.value.dataTableData;
    if (!Array.isArray(tableData) || tableData.length === 0) {
      console.warn('dataTableData 為空，無法依表格順序合併');
      return false;
    }

    const layoutData2 = currentLayer.value.layoutGridJsonData_Test2;
    if (!Array.isArray(layoutData2)) {
      console.warn('layoutGridJsonData_Test2 不是 Array（目前只支援 2-5 routes array 格式）');
      return false;
    }

    const isConnectNodeAt = (seg, idx) => {
      const hasValue = (v) => v !== undefined && v !== null;
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      const nodeType =
        node?.node_type ||
        ptProps?.node_type ||
        tags?.node_type ||
        (hasValue(node?.connect_number) ? 'connect' : '');
      const hasConnectNumber =
        hasValue(node?.connect_number) ||
        hasValue(tags?.connect_number) ||
        hasValue(ptProps?.connect_number) ||
        hasValue(ptProps?.tags?.connect_number);
      return nodeType === 'connect' || hasConnectNumber;
    };

    const isRealStation = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      const hasStationName = !!(
        node?.station_name ||
        ptProps?.station_name ||
        tags?.station_name ||
        ptProps?.tags?.station_name
      );
      return hasStationName;
    };

    const isBendPoint = (points, idx) => {
      if (idx <= 0 || idx >= points.length - 1) return false;

      const prev = points[idx - 1];
      const curr = points[idx];
      const next = points[idx + 1];

      const px = Array.isArray(prev) ? prev[0] : prev.x || 0;
      const py = Array.isArray(prev) ? prev[1] : prev.y || 0;
      const cx = Array.isArray(curr) ? curr[0] : curr.x || 0;
      const cy = Array.isArray(curr) ? curr[1] : curr.y || 0;
      const nx = Array.isArray(next) ? next[0] : next.x || 0;
      const ny = Array.isArray(next) ? next[1] : next.y || 0;

      const dx1 = cx - px;
      const dy1 = cy - py;
      const dx2 = nx - cx;
      const dy2 = ny - cy;

      const crossProduct = dx1 * dy2 - dy1 * dx2;
      const epsilon = 0.001;
      return Math.abs(crossProduct) > epsilon;
    };

    const matchesTableWeights = (wA, wB, segW1, segW2) => {
      // 允許交換順序
      return (wA === segW1 && wB === segW2) || (wA === segW2 && wB === segW1);
    };

    const getStationMetaAt = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      const stationId =
        node?.station_id ||
        ptProps?.station_id ||
        tags?.station_id ||
        ptProps?.tags?.station_id ||
        '';
      const stationName =
        node?.station_name ||
        ptProps?.station_name ||
        tags?.station_name ||
        ptProps?.tags?.station_name ||
        '';

      return {
        station_id: String(stationId || ''),
        station_name: String(stationName || ''),
      };
    };

    // 依 DataTable 的順序逐筆嘗試合併：
    // 若某筆 row 找不到對應可合併點，不能直接 return false（否則「執行完成2」會提早停止）
    // 而是跳過它，繼續往後找下一筆。
    const candidateRows = tableData.filter(
      (r) =>
        r &&
        r.node_type !== 'connect' &&
        r.合併2 !== 'V' &&
        r.合併2 !== 'F' &&
        Math.abs((r.weight_1 || 0) - (r.weight_2 || 0)) <= gap &&
        // 如果有指定方向，只處理符合方向的節點
        (direction === null || !r['V/H'] || r['V/H'] === direction)
    );

    if (candidateRows.length === 0) {
      return false;
    }

    for (const targetRow of candidateRows) {
      const targetRouteName = String(targetRow.route_name || '');
      const targetW1 = Number(targetRow.weight_1);
      const targetW2 = Number(targetRow.weight_2);
      const targetStationId = String(targetRow.station_id || '');
      const targetStationName = String(targetRow.station_name || '');

      let merged = false;

      for (const route of layoutData2) {
        if (merged) break;
        const routeName = String(route?.route_name || '');

        // 如果表格有 route_name，就先限制只在該路線中找
        if (targetRouteName && routeName && routeName !== targetRouteName) continue;

        const segments = route?.segments || [];
        for (const seg of segments) {
          if (merged) break;

          const points = Array.isArray(seg.points) ? seg.points : [];
          const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
          if (points.length < 3 || weights.length < 2) continue;

          for (let i = 0; i < weights.length - 1; i++) {
            const w1 = weights[i];
            const w2 = weights[i + 1];
            if (!w1 || !w2) continue;

            const ww1 = Number(w1.weight);
            const ww2 = Number(w2.weight);
            if (!Number.isFinite(ww1) || !Number.isFinite(ww2)) continue;

            // 需要對應表格的那一筆（weight_1/weight_2）
            if (!matchesTableWeights(targetW1, targetW2, ww1, ww2)) continue;

            // 沿用原本合併規則：gap 允許範圍內、且兩段 weight 是連續的中間點
            const weightDiff = Math.abs((w1.weight || 0) - (w2.weight || 0));
            if (weightDiff > gap) continue;
            if (w1.end_idx !== w2.start_idx) continue;

            const midIdx = w1.end_idx;
            if (midIdx <= 0 || midIdx >= points.length - 1) continue; // 不刪端點
            if (isConnectNodeAt(seg, midIdx)) continue; // 不刪 connect
            if (!isRealStation(seg, midIdx)) continue; // 只刪真正車站

            // 如果表格提供 station_id/station_name，就再做一次精準比對
            if (targetStationId || targetStationName) {
              const meta = getStationMetaAt(seg, midIdx);
              if (targetStationId && meta.station_id && meta.station_id !== targetStationId)
                continue;
              if (targetStationName && meta.station_name && meta.station_name !== targetStationName)
                continue;
            }

            // 1) 合併兩段 weight：把 w1 end 延伸到 w2 end，並移除 w2
            w1.end_idx = w2.end_idx;
            weights.splice(i + 1, 1);

            // 2) 檢查是否為幾何轉折點
            const isBend = isBendPoint(points, midIdx);

            if (isBend) {
              const pt = points[midIdx];
              const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
              const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
              points[midIdx] = [x, y];

              // 🎯 將 nodes 對應位置標記為幾何轉折點（不刪除，保持索引一致）
              if (Array.isArray(seg.nodes)) {
                // 確保 nodes 數組長度與 points 一致
                while (seg.nodes.length < points.length) {
                  seg.nodes.push({});
                }
                // 將該位置標記為幾何點，node_type: 'line' 表示非車站點
                seg.nodes[midIdx] = { node_type: 'line' };
              }
              // points 未刪除 => station_weights 索引不需要調整
            } else {
              seg.points.splice(midIdx, 1);
              if (Array.isArray(seg.nodes) && seg.nodes.length > midIdx) {
                seg.nodes.splice(midIdx, 1);
              }
              // 3) 修正索引
              for (const w of weights) {
                if (w.start_idx > midIdx) w.start_idx--;
                if (w.end_idx > midIdx) w.end_idx--;
              }
            }

            merged = true;
            break;
          }
        }
      }

      if (merged) {
        // 記錄在 DataTable 的「合併2」欄位
        targetRow.合併2 = 'V';

        // 觸發重繪：深拷 layoutGridJsonData_Test2 使相依元件 watch 重繪
        // 重繪時會自動更新最小尺寸（在 drawGridNodes 函數中）
        currentLayer.value.layoutGridJsonData_Test2 = JSON.parse(
          JSON.stringify(currentLayer.value.layoutGridJsonData_Test2)
        );

        return true;
      }

      // 這筆 row 在 layoutGridJsonData_Test2 找不到可合併點：標記為 F，避免「執行完成2」一直卡在同一筆
      targetRow.合併2 = 'F';
    }

    return false;
  };

  /**
   * 📉 縮減網格2 (Reduce Grid 2)
   * 專門針對 layoutGridJsonData_Test2 的縮減網格功能
   * 刪除整個 col 或 row 沒有黑點或路線的網格，並調整座標讓網格大小縮減
   */
  const reduceGrid2 = () => {
    if (!currentLayer.value) return;

    const layoutData = currentLayer.value.layoutGridJsonData_Test2;
    if (!layoutData) {
      console.warn('layoutGridJsonData_Test2 為空');
      return;
    }

    // 處理兩種格式：Array 或 Object（有 meta）
    let routes;
    let meta;
    if (Array.isArray(layoutData)) {
      routes = layoutData;
      meta = null;
    } else if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.routes)) {
      routes = layoutData.routes;
      meta = layoutData.meta || null;
    } else {
      console.warn(
        'layoutGridJsonData_Test2 格式不支援（目前只支援 Array 或 {routes, meta} 格式）'
      );
      return;
    }

    // 1. 統計所有使用的座標
    const usedCols = new Set();
    const usedRows = new Set();

    routes.forEach((route) => {
      const segments = route?.segments || [];
      segments.forEach((seg) => {
        const points = Array.isArray(seg.points) ? seg.points : [];
        points.forEach((pt) => {
          const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
          const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
          usedCols.add(Math.round(x));
          usedRows.add(Math.round(y));
        });
      });
    });

    // 2. 找出空 col/row 並建立映射表（舊座標 -> 新座標）
    const colMap = new Map(); // 舊 x -> 新 x
    const rowMap = new Map(); // 舊 y -> 新 y

    if (usedCols.size === 0 || usedRows.size === 0) {
      console.warn('沒有找到任何使用的座標');
      return;
    }

    // 計算 col 映射（刪除空的 col）
    const sortedCols = Array.from(usedCols).sort((a, b) => a - b);
    const minX = sortedCols[0];
    const maxX = sortedCols[sortedCols.length - 1];

    let newX = 0;
    for (let oldX = minX; oldX <= maxX; oldX++) {
      if (usedCols.has(oldX)) {
        colMap.set(oldX, newX);
        newX++;
      }
    }

    // 計算 row 映射（刪除空的 row）
    const sortedRows = Array.from(usedRows).sort((a, b) => a - b);
    const minY = sortedRows[0];
    const maxY = sortedRows[sortedRows.length - 1];

    let newY = 0;
    for (let oldY = minY; oldY <= maxY; oldY++) {
      if (usedRows.has(oldY)) {
        rowMap.set(oldY, newY);
        newY++;
      }
    }

    const removedCols = maxX - minX + 1 - newX;
    const removedRows = maxY - minY + 1 - newY;

    if (removedCols === 0 && removedRows === 0) {
      console.log('沒有空的 col/row 需要刪除');
      return;
    }

    console.log(`📉 縮減網格2：刪除 ${removedCols} 個空 col，${removedRows} 個空 row`);

    // 3. 調整所有點的座標
    routes.forEach((route) => {
      const segments = route?.segments || [];
      segments.forEach((seg) => {
        const points = Array.isArray(seg.points) ? seg.points : [];
        points.forEach((pt, idx) => {
          if (Array.isArray(pt)) {
            const oldX = pt[0];
            const oldY = pt[1];
            const newXCoord = colMap.get(Math.round(oldX)) ?? oldX;
            const newYCoord = rowMap.get(Math.round(oldY)) ?? oldY;

            if (pt.length > 2) {
              // [x, y, props] 格式，保留 props
              points[idx] = [newXCoord, newYCoord, pt[2]];
            } else {
              // [x, y] 格式
              points[idx] = [newXCoord, newYCoord];
            }
          } else if (pt && typeof pt === 'object') {
            // {x, y} 格式
            const oldX = pt.x || 0;
            const oldY = pt.y || 0;
            pt.x = colMap.get(Math.round(oldX)) ?? oldX;
            pt.y = rowMap.get(Math.round(oldY)) ?? oldY;
          }
        });
      });
    });

    // 4. 更新 meta.gridWidth 和 meta.gridHeight（如果存在）
    if (meta) {
      meta.gridWidth = newX;
      meta.gridHeight = newY;
      if (typeof meta.width === 'number') meta.width = newX;
      if (typeof meta.height === 'number') meta.height = newY;
    }

    console.log(`✅ 網格已縮減2：新尺寸 ${newX} x ${newY}`);

    // 5. 觸發資料更新（layoutGridJsonData_Test2；深拷觸發 watch 重繪）
    // 重繪時會自動更新最小尺寸（在 drawGridNodes 函數中）
    currentLayer.value.layoutGridJsonData_Test2 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test2)
    );
  };

  /**
   * 合併一筆路線2 後立刻縮減網格
   * @param {number} gap - 允許的權重差
   * @param {string} direction - 方向篩選：'V' (垂直線) 或 'H' (水平線) 或 null (不篩選)
   */
  const mergeOneRoute2AndReduce = (gap = 0, direction = null) => {
    const didMerge = mergeOneRoute2(gap, direction);
    if (didMerge) {
      reduceGrid2(); // 使用專門的 reduceGrid2
    }
  };

  /**
   * 🔗 執行完成2 (Merge All Routes 2)
   * 重複執行「合併一筆路線2」直到沒有更多可合併的項目
   * @param {number} gap - 允許的權重差
   * @param {string} direction - 方向篩選：'V' (垂直線) 或 'H' (水平線) 或 null (不篩選)
   */
  const mergeAllRoutes2AndReduce = (gap = 0, direction = null) => {
    if (!currentLayer.value) return;

    let mergedCount = 0;
    // 依需求：每合併一筆就立刻縮減網格
    while (mergeOneRoute2(gap, direction)) {
      mergedCount++;
      reduceGrid2(); // 使用專門的 reduceGrid2
    }

    if (mergedCount > 0) {
      console.log(`🎉 執行完成2！共合併 ${mergedCount} 筆（每筆皆已縮減網格）`);
    }
  };

  /**
   * 🔗 執行完成 (Merge All Routes)
   * 重複執行「合併一筆路線」直到沒有更多可合併的項目
   */
  const mergeAllRoutes = (gap = 0) => {
    if (!currentLayer.value) return;

    const layoutData = currentLayer.value.layoutGridJsonData_Test;
    if (!Array.isArray(layoutData)) {
      console.warn('layoutGridJsonData_Test 不是 Array（目前只支援 2-5 routes array 格式）');
      return;
    }

    const isConnectNodeAt = (seg, idx) => {
      const hasValue = (v) => v !== undefined && v !== null;
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      const nodeType =
        node?.node_type ||
        ptProps?.node_type ||
        tags?.node_type ||
        (hasValue(node?.connect_number) ? 'connect' : '');
      const hasConnectNumber =
        hasValue(node?.connect_number) ||
        hasValue(tags?.connect_number) ||
        hasValue(ptProps?.connect_number) ||
        hasValue(ptProps?.tags?.connect_number);
      return nodeType === 'connect' || hasConnectNumber;
    };

    /**
     * 判斷是否為真正的車站（有 station_name 的點）
     * 只有真正的車站才可被合併刪除
     * 幾何轉折點（無 station_name）和 connect 節點不應被刪除
     */
    const isRealStation = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      // 有 station_name 才算真正的車站
      const hasStationName = !!(
        node?.station_name ||
        ptProps?.station_name ||
        tags?.station_name ||
        ptProps?.tags?.station_name
      );

      return hasStationName;
    };

    /**
     * 判斷某個點是否為幾何轉折點（前後線段方向不同）
     * 如果是轉折點，刪除後需要保留座標以維持路線形狀
     */
    const isBendPoint = (points, idx) => {
      if (idx <= 0 || idx >= points.length - 1) return false;

      const prev = points[idx - 1];
      const curr = points[idx];
      const next = points[idx + 1];

      const px = Array.isArray(prev) ? prev[0] : prev.x || 0;
      const py = Array.isArray(prev) ? prev[1] : prev.y || 0;
      const cx = Array.isArray(curr) ? curr[0] : curr.x || 0;
      const cy = Array.isArray(curr) ? curr[1] : curr.y || 0;
      const nx = Array.isArray(next) ? next[0] : next.x || 0;
      const ny = Array.isArray(next) ? next[1] : next.y || 0;

      // 計算前段向量和後段向量
      const dx1 = cx - px;
      const dy1 = cy - py;
      const dx2 = nx - cx;
      const dy2 = ny - cy;

      // 如果向量方向不同（不共線），就是轉折點
      // 使用叉積判斷：如果叉積不為 0，表示不共線
      const crossProduct = dx1 * dy2 - dy1 * dx2;
      const epsilon = 0.001; // 容許微小誤差

      return Math.abs(crossProduct) > epsilon;
    };

    let totalMerged = 0;
    let hasMore = true;

    // 循環執行合併，直到沒有更多可合併的項目
    while (hasMore) {
      hasMore = false;
      let mergedInThisRound = false;

      for (const route of layoutData) {
        if (mergedInThisRound) break;
        const segments = route?.segments || [];

        for (const seg of segments) {
          if (mergedInThisRound) break;
          const points = Array.isArray(seg.points) ? seg.points : [];
          const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
          if (points.length < 3 || weights.length < 2) continue;

          for (let i = 0; i < weights.length - 1; i++) {
            const w1 = weights[i];
            const w2 = weights[i + 1];
            if (!w1 || !w2) continue;
            // 使用 gap 參數：允許 weight 差 <= gap
            const weightDiff = Math.abs((w1.weight || 0) - (w2.weight || 0));
            if (weightDiff > gap) continue;
            if (w1.end_idx !== w2.start_idx) continue;

            const midIdx = w1.end_idx;
            // 不刪端點，避免破壞線段
            if (midIdx <= 0 || midIdx >= points.length - 1) continue;
            // 不刪 connect/轉乘點
            if (isConnectNodeAt(seg, midIdx)) continue;
            // 不刪幾何轉折點（只刪真正的車站）
            if (!isRealStation(seg, midIdx)) continue;

            // 1) 合併兩段 weight：把 w1 end 延伸到 w2 end，並移除 w2
            w1.end_idx = w2.end_idx;
            weights.splice(i + 1, 1);

            // 2) 檢查是否為幾何轉折點
            const isBend = isBendPoint(points, midIdx);

            if (isBend) {
              // 如果是轉折點，保留座標但移除車站屬性
              // 將該點轉換為純幾何點 [x, y]
              const pt = points[midIdx];
              const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
              const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
              points[midIdx] = [x, y]; // 只保留座標，不保留屬性

              // 🎯 將 nodes 對應位置標記為幾何轉折點（不刪除，保持索引一致）
              if (Array.isArray(seg.nodes)) {
                // 確保 nodes 數組長度與 points 一致
                while (seg.nodes.length < points.length) {
                  seg.nodes.push({});
                }
                // 將該位置標記為幾何點，node_type: 'line' 表示非車站點
                seg.nodes[midIdx] = { node_type: 'line' };
              }

              // ⚠️ 注意：因為 points 沒有刪除（只是改成純座標），所以 station_weights 的索引不需要調整
            } else {
              // 如果不是轉折點，直接刪除該點
              seg.points.splice(midIdx, 1);
              if (Array.isArray(seg.nodes) && seg.nodes.length > midIdx) {
                seg.nodes.splice(midIdx, 1);
              }

              // 3) 修正所有 station_weights 的索引（刪除點後，midIdx 之後的索引都要 -1）
              for (const w of weights) {
                if (w.start_idx > midIdx) w.start_idx--;
                if (w.end_idx > midIdx) w.end_idx--;
              }
            }

            mergedInThisRound = true;
            hasMore = true;
            totalMerged++;
            break;
          }
        }
      }

      // 如果這一輪有合併，更新 dataTableData 中對應的 row（設為 V）
      if (mergedInThisRound && Array.isArray(currentLayer.value.dataTableData)) {
        // 找到第一個還沒設成 V 的項目（使用 gap 參數）
        const row = currentLayer.value.dataTableData.find(
          (r) =>
            r &&
            r.合併 !== 'V' &&
            r.node_type !== 'connect' &&
            Math.abs((r.weight_1 || 0) - (r.weight_2 || 0)) <= gap
        );
        if (row) row.合併 = 'V';
      }
    }

    if (totalMerged > 0) {
      console.log(`🎉 執行完成！共合併 ${totalMerged} 個點`);

      // 🔄 用新引用觸發 LayoutGridTab_Test 的 deep watch，讓點消失後自動重繪
      currentLayer.value.layoutGridJsonData_Test = JSON.parse(
        JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
      );

      // 🔄 同步更新到 layoutGridJsonData_Test2
      currentLayer.value.layoutGridJsonData_Test2 = JSON.parse(
        JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
      );
    } else {
      console.log('所有項目都已處理完畢，沒有需要合併的項目');
    }
  };

  /**
   * 📉 縮減網格 (Reduce Grid)
   * 刪除整個 col 或 row 沒有黑點或路線的網格，並調整座標讓網格大小縮減
   */
  const reduceGrid = () => {
    if (!currentLayer.value) return;

    const layoutData = currentLayer.value.layoutGridJsonData_Test;
    if (!layoutData) {
      console.warn('layoutGridJsonData_Test 為空');
      return;
    }

    // 處理兩種格式：Array 或 Object（有 meta）
    let routes;
    let meta;
    if (Array.isArray(layoutData)) {
      routes = layoutData;
      meta = null;
    } else if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.routes)) {
      routes = layoutData.routes;
      meta = layoutData.meta || null;
    } else {
      console.warn('layoutGridJsonData_Test 格式不支援（目前只支援 Array 或 {routes, meta} 格式）');
      return;
    }

    // 1. 統計所有使用的座標
    const usedCols = new Set();
    const usedRows = new Set();

    routes.forEach((route) => {
      const segments = route?.segments || [];
      segments.forEach((seg) => {
        const points = Array.isArray(seg.points) ? seg.points : [];
        points.forEach((pt) => {
          const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
          const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
          usedCols.add(Math.round(x));
          usedRows.add(Math.round(y));
        });
      });
    });

    // 2. 找出空 col/row 並建立映射表（舊座標 -> 新座標）
    const colMap = new Map(); // 舊 x -> 新 x
    const rowMap = new Map(); // 舊 y -> 新 y

    if (usedCols.size === 0 || usedRows.size === 0) {
      console.warn('沒有找到任何使用的座標');
      return;
    }

    // 計算 col 映射（刪除空的 col）
    const sortedCols = Array.from(usedCols).sort((a, b) => a - b);
    const minX = sortedCols[0];
    const maxX = sortedCols[sortedCols.length - 1];

    let newX = 0;
    for (let oldX = minX; oldX <= maxX; oldX++) {
      if (usedCols.has(oldX)) {
        colMap.set(oldX, newX);
        newX++;
      }
    }

    // 計算 row 映射（刪除空的 row）
    const sortedRows = Array.from(usedRows).sort((a, b) => a - b);
    const minY = sortedRows[0];
    const maxY = sortedRows[sortedRows.length - 1];

    let newY = 0;
    for (let oldY = minY; oldY <= maxY; oldY++) {
      if (usedRows.has(oldY)) {
        rowMap.set(oldY, newY);
        newY++;
      }
    }

    const removedCols = maxX - minX + 1 - newX;
    const removedRows = maxY - minY + 1 - newY;

    if (removedCols === 0 && removedRows === 0) {
      console.log('沒有空的 col/row 需要刪除');
      return;
    }

    console.log(`📉 縮減網格：刪除 ${removedCols} 個空 col，${removedRows} 個空 row`);

    // 3. 調整所有點的座標
    routes.forEach((route) => {
      const segments = route?.segments || [];
      segments.forEach((seg) => {
        const points = Array.isArray(seg.points) ? seg.points : [];
        points.forEach((pt, idx) => {
          if (Array.isArray(pt)) {
            const oldX = pt[0];
            const oldY = pt[1];
            const newX = colMap.get(Math.round(oldX)) ?? oldX;
            const newY = rowMap.get(Math.round(oldY)) ?? oldY;

            if (pt.length > 2) {
              // [x, y, props] 格式，保留 props
              points[idx] = [newX, newY, pt[2]];
            } else {
              // [x, y] 格式
              points[idx] = [newX, newY];
            }
          } else if (pt && typeof pt === 'object') {
            // {x, y} 格式
            const oldX = pt.x || 0;
            const oldY = pt.y || 0;
            pt.x = colMap.get(Math.round(oldX)) ?? oldX;
            pt.y = rowMap.get(Math.round(oldY)) ?? oldY;
          }
        });
      });
    });

    // 4. 更新 meta.gridWidth 和 meta.gridHeight（如果存在）
    if (meta) {
      meta.gridWidth = newX;
      meta.gridHeight = newY;
      if (typeof meta.width === 'number') meta.width = newX;
      if (typeof meta.height === 'number') meta.height = newY;
    }

    console.log(`✅ 網格已縮減：新尺寸 ${newX} x ${newY}`);

    // 5. 觸發資料更新
    currentLayer.value.layoutGridJsonData_Test = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
    );

    // 🔄 同步更新到 layoutGridJsonData_Test2
    currentLayer.value.layoutGridJsonData_Test2 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test)
    );
  };

  /**
   * 🔗 執行完成4 (Merge All Routes for Test4)
   * 重複執行「合併一筆路線」直到沒有更多可合併的項目（針對 layoutGridJsonData_Test4）
   */
  // ✅ 供 mergeAllRoutes4 / reduceGrid4 共用：從 routesData 重新生成 dataTableData（taipei_6_1_test3 專用格式）
  const generateDataTableData_Test4 = (routesData) => {
    const gridNodes = new Map(); // key: "x,y", value: { xGrid, yGrid, maxWeight: number, weights: number[] }

    const addWeightAt = (x, y, weight) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (typeof weight !== 'number' || !Number.isFinite(weight)) return;
      const xGrid = Math.round(x);
      const yGrid = Math.round(y);
      const key = `${xGrid},${yGrid}`;
      if (!gridNodes.has(key)) {
        gridNodes.set(key, { xGrid, yGrid, maxWeight: weight, weights: [weight] });
      } else {
        const existing = gridNodes.get(key);
        if (weight > (existing.maxWeight ?? -Infinity)) {
          existing.maxWeight = weight;
          existing.weights = [weight];
        }
      }
    };

    const rasterizeAndAddWeight = (ax, ay, bx, by, weight) => {
      ax = Math.round(ax);
      ay = Math.round(ay);
      bx = Math.round(bx);
      by = Math.round(by);

      const dx = Math.abs(bx - ax);
      const dy = Math.abs(by - ay);

      if (dx === 0 && dy === 0) {
        addWeightAt(ax, ay, weight);
        return;
      }

      if (dy === 0) {
        const x0 = Math.min(ax, bx);
        const x1 = Math.max(ax, bx);
        for (let x = x0; x <= x1; x++) addWeightAt(x, ay, weight);
        return;
      }

      if (dx === 0) {
        const y0 = Math.min(ay, by);
        const y1 = Math.max(ay, by);
        for (let y = y0; y <= y1; y++) addWeightAt(ax, y, weight);
        return;
      }

      // 斜線（Bresenham）
      let x = ax;
      let y = ay;
      const sx = ax < bx ? 1 : -1;
      const sy = ay < by ? 1 : -1;
      let err = dx - dy;
      const maxSteps = dx + dy + 1;
      for (let steps = 0; steps < maxSteps; steps++) {
        addWeightAt(x, y, weight);
        if (x === bx && y === by) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x += sx;
        }
        if (e2 < dx) {
          err += dx;
          y += sy;
        }
      }
    };

    // 將 station_weights / edge_weights 依照端點座標分配到節點
    for (const route of routesData || []) {
      const segments = route?.segments || [];
      for (const seg of segments) {
        const points = Array.isArray(seg.points) ? seg.points : [];
        if (points.length < 2) continue;

        const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : null;
        const edgeWeights = Array.isArray(seg.edge_weights) ? seg.edge_weights : null;

        if (stationWeights && stationWeights.length > 0) {
          for (const wInfo of stationWeights) {
            const sIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
            const eIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
            const w = wInfo?.weight;
            if (
              sIdx === null ||
              eIdx === null ||
              sIdx < 0 ||
              eIdx < 0 ||
              sIdx >= points.length ||
              eIdx >= points.length
            ) {
              continue;
            }

            const step = sIdx <= eIdx ? 1 : -1;
            for (let i = sIdx; i !== eIdx; i += step) {
              const p1 = points[i];
              const p2 = points[i + step];
              const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
              const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
              const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
              const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
              rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
            }
          }
        } else if (edgeWeights && edgeWeights.length > 0) {
          const nEdges = Math.min(edgeWeights.length, points.length - 1);
          for (let i = 0; i < nEdges; i++) {
            const w = edgeWeights[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
            const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
            const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
            const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
            rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
          }
        }
      }
    }

    // 找出網格的有效範圍
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minCol = Infinity;
    let maxCol = -Infinity;

    for (const node of gridNodes.values()) {
      minRow = Math.min(minRow, node.yGrid);
      maxRow = Math.max(maxRow, node.yGrid);
      minCol = Math.min(minCol, node.xGrid);
      maxCol = Math.max(maxCol, node.xGrid);
    }

    if (
      minRow === Infinity ||
      maxRow === -Infinity ||
      minCol === Infinity ||
      maxCol === -Infinity
    ) {
      return [];
    }

    // 計算每一列/行的最大值
    const colMaxValues = {};
    const rowMaxValues = {};

    for (let col = minCol; col <= maxCol; col++) colMaxValues[col] = 0;
    for (let row = minRow; row <= maxRow; row++) rowMaxValues[row] = 0;

    for (const node of gridNodes.values()) {
      const maxWeight = node.weights.length > 0 ? Math.max(...node.weights) : 0;
      colMaxValues[node.xGrid] = Math.max(colMaxValues[node.xGrid] || 0, maxWeight);
      rowMaxValues[node.yGrid] = Math.max(rowMaxValues[node.yGrid] || 0, maxWeight);
    }

    const colSingles = [];
    const rowSingles = [];

    for (let col = minCol; col <= maxCol; col++) {
      colSingles.push({ actualCol: col, colMaxWeight: colMaxValues[col] ?? 0 });
    }
    for (let row = minRow; row <= maxRow; row++) {
      rowSingles.push({ actualRow: row, rowMaxWeight: rowMaxValues[row] ?? 0 });
    }

    // 過濾出「奇數座標」的 col / row（直接用座標 parity 判斷，避免 minCol/minRow parity 導致漏抓）
    const colSinglesOdd = colSingles.filter((single) => single.actualCol % 2 !== 0);
    const rowSinglesOdd = rowSingles.filter((single) => single.actualRow % 2 !== 0);

    const dataTableData = [];

    // col：每個奇數 col 與下一個奇數 col 一組（相鄰兩個奇數座標應差 2）
    for (let i = 0; i < colSinglesOdd.length; i++) {
      const col1 = colSinglesOdd[i];
      const col2 = colSinglesOdd[i + 1];
      if (!col1 || !col2) continue;
      if (col2.actualCol !== col1.actualCol + 2) continue;
      dataTableData.push({
        type: 'col',
        // ✅ 直接存「實際座標」，mergeAllRoutes4 不再依賴 minCol 偏移
        idx1: col1.actualCol,
        idx2: col2.actualCol,
        idx1_max_weight: col1.colMaxWeight ?? 0,
        idx2_max_weight: col2.colMaxWeight ?? 0,
        合併: 'X',
      });
    }

    // row：每個奇數 row 與下一個奇數 row 一組（相鄰兩個奇數座標應差 2）
    for (let i = 0; i < rowSinglesOdd.length; i++) {
      const row1 = rowSinglesOdd[i];
      const row2 = rowSinglesOdd[i + 1];
      if (!row1 || !row2) continue;
      if (row2.actualRow !== row1.actualRow + 2) continue;
      dataTableData.push({
        type: 'row',
        idx1: row1.actualRow,
        idx2: row2.actualRow,
        idx1_max_weight: row1.rowMaxWeight ?? 0,
        idx2_max_weight: row2.rowMaxWeight ?? 0,
        合併: 'X',
      });
    }

    // 排序：先 col 再 row；同 type 內用 sum 由小到大
    dataTableData.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'col' ? -1 : 1;
      const aSum = (a.idx1_max_weight ?? 0) + (a.idx2_max_weight ?? 0);
      const bSum = (b.idx1_max_weight ?? 0) + (b.idx2_max_weight ?? 0);
      return aSum - bSum;
    });

    return dataTableData.map((item, index) => ({
      '#': index + 1,
      type: item.type,
      idx1: item.idx1,
      idx2: item.idx2,
      idx1_max_weight: item.idx1_max_weight,
      idx2_max_weight: item.idx2_max_weight,
      合併: item.合併 ?? 'X',
    }));
  };

  /**
   * 🎲 隨機產生權重4 (Randomize Weights for Test4)
   * 根據指定的權重值和機率分佈重新產生所有權重（針對 layoutGridJsonData_Test4）
   * 同時更新 layoutGridJsonData_Test4 和 dataTableData
   */
  const randomizeWeights4 = () => {
    if (!currentLayer.value) {
      console.warn('當前圖層不存在');
      return;
    }
    if (!isTaipei6_1Test3Or4LayerId(currentLayer.value.layerId)) {
      console.warn('隨機產生權重4 僅適用 6-1 權重簡化3／對應 test4 圖層');
      return;
    }

    const layoutData = currentLayer.value.layoutGridJsonData_Test4;
    if (!Array.isArray(layoutData)) {
      console.warn('layoutGridJsonData_Test4 不是 Array');
      return;
    }

    // 權重值和機率分佈（與 randomizeWeights 相同）
    const WEIGHT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const WEIGHT_PROBS = [256, 128, 64, 32, 16, 8, 4, 2, 1];

    // 計算總機率
    const totalProb = WEIGHT_PROBS.reduce((sum, prob) => sum + prob, 0);

    // 產生隨機權重的函數
    const generateRandomWeight = () => {
      const random = Math.random() * totalProb;
      let cumulative = 0;
      for (let i = 0; i < WEIGHT_VALUES.length; i++) {
        cumulative += WEIGHT_PROBS[i];
        if (random <= cumulative) {
          return WEIGHT_VALUES[i];
        }
      }
      return WEIGHT_VALUES[0]; // 預設返回最小值
    };

    // 遍歷所有路線，重新產生 station_weights
    layoutData.forEach((route) => {
      if (!route || !Array.isArray(route.segments)) return;

      route.segments.forEach((seg) => {
        if (!seg || !Array.isArray(seg.station_weights)) return;

        // 重新產生每個 station_weight 的權重值
        seg.station_weights.forEach((weightInfo) => {
          if (weightInfo && typeof weightInfo.weight === 'number') {
            weightInfo.weight = generateRandomWeight();
          }
        });
      });
    });

    // 🔄 重新生成 dataTableData（使用 generateDataTableData_Test4）
    currentLayer.value.dataTableData = generateDataTableData_Test4(layoutData);

    // 🔄 用新引用觸發 LayoutGridTab_Test4 的 deep watch，讓權重更新後自動重繪
    currentLayer.value.layoutGridJsonData_Test4 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test4)
    );

    syncSpaceNetworkFromTest3Layout();
    console.log('已重新產生所有權重值並更新 dataTableData 和 layoutGridJsonData_Test4');
  };

  /**
   * taipei_g（g 權重簡化）：相鄰車站段重抽 station_weights（1～9，與 sampleWeight1to9Biased 一致），並同步 dataTableData。
   */
  const randomizeTaipeiFWeights = async () => {
    if (!currentLayer.value || !isTaipeiTestGLayerTab(currentLayer.value.layerId)) {
      console.warn('隨機產生權重（g 層）僅適用 taipei_g（taipei_h 使用流量 CSV）');
      return;
    }
    const routes = currentLayer.value.spaceNetworkGridJsonData;
    if (!Array.isArray(routes) || routes.length === 0) {
      console.warn('taipei_g／taipei_h：spaceNetworkGridJsonData 無資料');
      return;
    }
    const options = {
      connectData: currentLayer.value.spaceNetworkGridJsonData_ConnectData,
      stationData: currentLayer.value.spaceNetworkGridJsonData_StationData,
      sectionData: currentLayer.value.spaceNetworkGridJsonData_SectionData,
    };
    const { dataTableRows } = applyRandomWeightsBetweenAdjacentStations(
      routes,
      Math.random,
      options
    );
    currentLayer.value.dataTableData = dataTableRows;
    currentLayer.value.spaceNetworkGridJsonData = JSON.parse(JSON.stringify(routes));
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /**
   * taipei_g：黑點處僅接兩段、且兩段權重絕對差≤maxWeightDiff 時合併（合併後權重取兩段 max）；
   * 每次執行後皆刪除空欄／空列並壓縮格索引，重算 StationData／ConnectData／SectionData／表格，並重繪空間網路圖。
   * @param {number} maxWeightDiff 0：僅同權重；其餘為兩段權重絕對差允許之上限（如 1～3）
   */
  const mergeTaipeiFBlackJunctionSegments = async (maxWeightDiff) => {
    if (!currentLayer.value || !isTaipeiTestGOrHWeightLayerTab(currentLayer.value.layerId)) {
      console.warn('黑點路段合併僅適用 taipei_g／taipei_h');
      return;
    }
    const raw = currentLayer.value.spaceNetworkGridJsonData;
    if (!Array.isArray(raw) || raw.length === 0) {
      console.warn('taipei_g／taipei_h：spaceNetworkGridJsonData 無資料');
      return;
    }
    const { mergeCount, removedColCount, removedRowCount, removedCols, removedRows } =
      applyTaipeiFMergePruneRebuildToLayer(currentLayer.value, { maxWeightDiff });
    dataStore.setTaipeiFResizeLastAutoMergeInfo({
      maxWeightDiff,
      mergeAxisConstraint: null,
      mergeCount,
      removedColCount,
      removedRowCount,
      removedCols,
      removedRows,
      source: 'manual',
      at: Date.now(),
    });
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
    console.log(
      `taipei_g：黑點路段合併完成（權重差≤${maxWeightDiff}，合併後取較大權重），合併 ${mergeCount} 次；刪除空欄 ${removedColCount}、空列 ${removedRowCount}；空欄索引 [${(removedCols || []).join(', ')}]；空列索引 [${(removedRows || []).join(', ')}]`
    );
  };

  const mergeAllRoutes4 = (gap = 0) => {
    if (!currentLayer.value || !isTaipei6_1Test3Or4LayerId(currentLayer.value.layerId)) return;

    const layoutData = currentLayer.value.layoutGridJsonData_Test4;
    if (!Array.isArray(layoutData)) {
      console.warn('layoutGridJsonData_Test4 不是 Array（目前只支援 2-5 routes array 格式）');
      return;
    }

    // ✅ 每次合併後都重新生成 dataTableData，直到整個畫面沒有可合併項目才停止

    // 計算最小座標值（用於將 idx 轉換為實際座標）
    let minCol = Infinity;
    let minRow = Infinity;
    for (const route of layoutData) {
      const segments = route?.segments || [];
      for (const seg of segments) {
        const points = Array.isArray(seg.points) ? seg.points : [];
        for (const pt of points) {
          const x = Array.isArray(pt) ? pt[0] : pt?.x;
          const y = Array.isArray(pt) ? pt[1] : pt?.y;
          if (Number.isFinite(x)) minCol = Math.min(minCol, Math.round(x));
          if (Number.isFinite(y)) minRow = Math.min(minRow, Math.round(y));
        }
      }
    }
    if (minCol === Infinity) minCol = 0;
    if (minRow === Infinity) minRow = 0;

    const isConnectNodeAt = (seg, idx) => {
      const hasValue = (v) => v !== undefined && v !== null;
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      const nodeType =
        node?.node_type ||
        ptProps?.node_type ||
        tags?.node_type ||
        (hasValue(node?.connect_number) ? 'connect' : '');
      const hasConnectNumber =
        hasValue(node?.connect_number) ||
        hasValue(tags?.connect_number) ||
        hasValue(ptProps?.connect_number) ||
        hasValue(ptProps?.tags?.connect_number);
      return nodeType === 'connect' || hasConnectNumber;
    };

    /**
     * 判斷某個點是否為真正的黑點（station）且可以被合併
     * 只有黑點才可以合併，紅點（connect）、端點不能合併
     * ✅ 判斷標準：在 station_weights 中出現 或 有 station_name/station_id 或 node_type='station'
     * ✅ 轉折點也可以合併（但合併時會保留座標，轉換成 line 類型）
     */
    const isRealStation = (seg, idx) => {
      const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
      const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
      const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
      const tags = ptProps?.tags || node?.tags || {};

      // 先檢查是否為 connect 點（紅點），如果是則返回 false
      if (isConnectNodeAt(seg, idx)) return false;

      // 檢查是否在 station_weights 中出現（權重的端點一定是站點，即使它是轉折點）
      const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
      const inWeights = weights.some(
        (w) =>
          (Number.isFinite(w?.start_idx) && w.start_idx === idx) ||
          (Number.isFinite(w?.end_idx) && w.end_idx === idx)
      );
      if (inWeights) return true;

      // 檢查是否有 station_name 或 station_id（真正的車站）
      const hasStationName = !!(
        node?.station_name ||
        ptProps?.station_name ||
        tags?.station_name ||
        ptProps?.tags?.station_name
      );
      const hasStationId = !!(
        node?.station_id ||
        ptProps?.station_id ||
        tags?.station_id ||
        ptProps?.tags?.station_id
      );

      // 或者 node_type 為 'station'（但不是 'connect' 或 'line'）
      const nodeType = node?.node_type || ptProps?.node_type || tags?.node_type || '';
      const isStationType = nodeType === 'station';

      return hasStationName || hasStationId || isStationType;
    };

    /**
     * 判斷某個點是否為幾何轉折點（前後線段方向不同）
     * 如果是轉折點，刪除後需要保留座標以維持路線形狀
     */
    const isBendPoint = (points, idx) => {
      if (idx <= 0 || idx >= points.length - 1) return false;

      const prev = points[idx - 1];
      const curr = points[idx];
      const next = points[idx + 1];

      const px = Array.isArray(prev) ? prev[0] : prev.x || 0;
      const py = Array.isArray(prev) ? prev[1] : prev.y || 0;
      const cx = Array.isArray(curr) ? curr[0] : curr.x || 0;
      const cy = Array.isArray(curr) ? curr[1] : curr.y || 0;
      const nx = Array.isArray(next) ? next[0] : next.x || 0;
      const ny = Array.isArray(next) ? next[1] : next.y || 0;

      // 計算前段向量和後段向量
      const dx1 = cx - px;
      const dy1 = cy - py;
      const dx2 = nx - cx;
      const dy2 = ny - cy;

      // 如果向量方向不同（不共線），就是轉折點
      // 使用叉積判斷：如果叉積不為 0，表示不共線
      const crossProduct = dx1 * dy2 - dy1 * dx2;
      const epsilon = 0.001; // 容許微小誤差

      return Math.abs(crossProduct) > epsilon;
    };

    let totalMerged = 0;
    let safety = 0;

    console.log(`🚀 開始合併路線 (gap<=${gap})...`);

    while (safety < 10000) {
      safety++;

      // 重新生成 dataTableData（用最新 routes）
      const dataTableData = generateDataTableData_Test4(layoutData);
      currentLayer.value.dataTableData = dataTableData;

      if (safety % 100 === 0) {
        console.log(
          `📊 第 ${safety} 輪，已合併 ${totalMerged} 個點，可選項目：${dataTableData.length}`
        );
      }

      let mergedThisRound = false;

      for (const item of dataTableData) {
        if (!item || item.合併 === 'V') continue;

        // 檢查權重是否滿足合併條件
        const w1 = Number(item.idx1_max_weight ?? 0);
        const w2 = Number(item.idx2_max_weight ?? 0);
        const weightDiff = Math.abs(w1 - w2);
        const eps = 1e-9;
        if (weightDiff > gap + eps) continue;

        // 計算實際的網格座標
        const odd1Coord = Number(item.idx1);
        const odd2Coord = Number(item.idx2);
        const evenCoord = (odd1Coord + odd2Coord) / 2;

        // 驗證：odd1Coord/odd2Coord 應為奇數、evenCoord 應為偶數
        if (
          odd1Coord % 2 === 0 ||
          odd2Coord % 2 === 0 ||
          evenCoord % 2 !== 0 ||
          odd2Coord !== odd1Coord + 2
        ) {
          continue;
        }

        let mergedInThisItem = false;
        let deletedPointsCount = 0;
        let changedWeightsCount = 0;
        const mergedWeight = Math.max(item.idx1_max_weight ?? 0, item.idx2_max_weight ?? 0);

        // 遍歷所有路線，處理在偶數排上的點和合併奇數排的路線
        for (const route of layoutData) {
          const segments = route?.segments || [];
          for (const seg of segments) {
            const points = Array.isArray(seg.points) ? seg.points : [];
            const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
            if (points.length === 0) continue;

            // 1. 刪除偶數排上的點（從後往前遍歷，避免索引變化影響）
            for (let idx = points.length - 1; idx >= 0; idx--) {
              const pt = points[idx];
              const x = Array.isArray(pt) ? pt[0] : pt?.x || 0;
              const y = Array.isArray(pt) ? pt[1] : pt?.y || 0;
              const xGrid = Math.round(x);
              const yGrid = Math.round(y);

              // 判斷點是否在要刪除的偶數排上
              let shouldDelete = false;
              if (item.type === 'col') shouldDelete = xGrid === evenCoord;
              else shouldDelete = yGrid === evenCoord;

              if (!shouldDelete) continue;

              // 不刪端點，避免破壞線段
              if (idx <= 0 || idx >= points.length - 1) {
                if (safety <= 5) {
                  console.log(`⏭️ 跳過端點 idx=${idx}, 座標 (${xGrid}, ${yGrid})`);
                }
                continue;
              }
              // 不刪 connect/轉乘點（紅點）
              if (isConnectNodeAt(seg, idx)) {
                if (safety <= 5) {
                  console.log(`⏭️ 跳過紅點 idx=${idx}, 座標 (${xGrid}, ${yGrid})`);
                }
                continue;
              }
              // 🎯 只合併黑點（station），不合併紅點（connect）和端點
              if (!isRealStation(seg, idx)) {
                if (safety <= 5) {
                  console.log(`⏭️ 跳過非站點 idx=${idx}, 座標 (${xGrid}, ${yGrid})`);
                }
                continue;
              }

              // 檢查是否為幾何轉折點
              const isBend = isBendPoint(points, idx);

              if (isBend) {
                // 轉折點：保留座標作為幾何點，移除站點屬性，並合併相關的 station_weights
                const pt = points[idx];
                const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
                const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
                points[idx] = [x, y]; // 只保留座標，不保留屬性

                if (Array.isArray(seg.nodes)) {
                  while (seg.nodes.length < points.length) seg.nodes.push({});
                  seg.nodes[idx] = { node_type: 'line' };
                }

                // 合併 station_weights：找到以 idx 為端點的 weights 並合併
                const wIn = weights.find((w) => w.end_idx === idx);
                const wOut = weights.find((w) => w.start_idx === idx);

                if (wIn && wOut) {
                  const combinedWeight = Math.max(
                    Number(wIn.weight) || 0,
                    Number(wOut.weight) || 0
                  );
                  // 更新第一個 weight，刪除第二個
                  wIn.end_idx = wOut.end_idx;
                  wIn.weight = combinedWeight;
                  const outIdx = weights.indexOf(wOut);
                  if (outIdx >= 0) weights.splice(outIdx, 1);

                  // 標記已合併，避免重複處理
                  changedWeightsCount++;
                }
              } else {
                // 非轉折點：直接刪除點
                seg.points.splice(idx, 1);
                if (Array.isArray(seg.nodes) && seg.nodes.length > idx) seg.nodes.splice(idx, 1);

                // 更新 station_weights 的索引
                for (const w of weights) {
                  if (w.start_idx > idx) w.start_idx--;
                  if (w.end_idx > idx) w.end_idx--;
                }
              }

              mergedInThisItem = true;
              totalMerged++;
              deletedPointsCount++;
            }

            // 2. 更新經過 odd1/odd2 的 station_weights 的 weight
            for (const w of weights) {
              if (
                w.start_idx < 0 ||
                w.end_idx < 0 ||
                w.start_idx >= points.length ||
                w.end_idx >= points.length
              )
                continue;

              let passesOdd1 = false;
              let passesOdd2 = false;

              const step = w.start_idx <= w.end_idx ? 1 : -1;
              for (let i = w.start_idx; i !== w.end_idx; i += step) {
                const pt = points[i];
                const x = Array.isArray(pt) ? pt[0] : pt?.x || 0;
                const y = Array.isArray(pt) ? pt[1] : pt?.y || 0;
                const xGrid = Math.round(x);
                const yGrid = Math.round(y);

                if (item.type === 'col') {
                  if (xGrid === odd1Coord) passesOdd1 = true;
                  if (xGrid === odd2Coord) passesOdd2 = true;
                } else {
                  if (yGrid === odd1Coord) passesOdd1 = true;
                  if (yGrid === odd2Coord) passesOdd2 = true;
                }
              }

              if (passesOdd1 || passesOdd2) {
                const prev = Number(w.weight);
                if (!Number.isFinite(prev) || Math.abs(prev - Number(mergedWeight)) > eps) {
                  w.weight = mergedWeight;
                  mergedInThisItem = true;
                  changedWeightsCount++;
                }
              }
            }
          }
        }

        // ✅ 只有真的有改變（刪點或改 weight）才算合併成功
        if (mergedInThisItem && (deletedPointsCount > 0 || changedWeightsCount > 0)) {
          item.合併 = 'V';
          mergedThisRound = true;
          // 重要：完成一筆後立刻跳出，下一輪用最新資料重新算 dataTableData
          break;
        }
      }

      if (!mergedThisRound) break;
    }

    if (safety >= 10000) {
      console.warn('⚠️ mergeAllRoutes4 達到安全上限，停止避免無限迴圈');
    }

    if (totalMerged > 0) {
      console.log(`🎉 執行完成4！共處理 ${totalMerged} 個點（直到沒有可合併項目）`);
      currentLayer.value.layoutGridJsonData_Test4 = JSON.parse(JSON.stringify(layoutData));
      currentLayer.value.dataTableData = generateDataTableData_Test4(layoutData);
      syncSpaceNetworkFromTest3Layout();
    } else {
      console.log('沒有找到符合條件的項目可以合併');
    }
  };

  /**
   * 🔀 合併路線4-H (Merge Routes 4 - Horizontal Only)
   * 只合併位在水平線上的黑點
   */
  const mergeAllRoutes4H = (gap = 0) => {
    if (!currentLayer.value || !isTaipei6_1Test3Or4LayerId(currentLayer.value.layerId)) return;

    let layoutData = currentLayer.value.layoutGridJsonData_Test4;
    if (!Array.isArray(layoutData)) {
      console.warn('layoutGridJsonData_Test4 不是 Array（目前只支援 2-5 routes array 格式）');
      return;
    }

    const result = mergeRoutesHorizontal(layoutData, gap);
    if (result.modified) {
      currentLayer.value.layoutGridJsonData_Test4 = JSON.parse(JSON.stringify(result.layoutData));
      currentLayer.value.dataTableData = generateDataTableDataUtil(result.layoutData);
      syncSpaceNetworkFromTest3Layout();
    }
  };

  /**
   * 🔀 合併路線4-V (Merge Routes 4 - Vertical Only)
   * 只合併位在垂直線上的黑點
   */
  const mergeAllRoutes4V = (gap = 0) => {
    if (!currentLayer.value || !isTaipei6_1Test3Or4LayerId(currentLayer.value.layerId)) return;

    let layoutData = currentLayer.value.layoutGridJsonData_Test4;
    if (!Array.isArray(layoutData)) {
      console.warn('layoutGridJsonData_Test4 不是 Array（目前只支援 2-5 routes array 格式）');
      return;
    }

    const result = mergeRoutesVertical(layoutData, gap);
    if (result.modified) {
      currentLayer.value.layoutGridJsonData_Test4 = JSON.parse(JSON.stringify(result.layoutData));
      currentLayer.value.dataTableData = generateDataTableDataUtil(result.layoutData);
      syncSpaceNetworkFromTest3Layout();
    }
  };

  /**
   * 🗜️ 縮減網格4 (Reduce Grid 4)
   * 刪除所有空的偶數網格（淺紅色），並合併相鄰的奇數網格
   */
  const reduceGrid4 = () => {
    if (!currentLayer.value || !isTaipei6_1Test3Or4LayerId(currentLayer.value.layerId)) return;

    const layoutData = currentLayer.value.layoutGridJsonData_Test4;
    if (!layoutData) {
      console.warn('layoutGridJsonData_Test4 為空');
      return;
    }

    const result = reduceGridUtil(layoutData);
    if (result.modified) {
      currentLayer.value.layoutGridJsonData_Test4 = JSON.parse(JSON.stringify(result.layoutData));
      if (isTaipei6_1Test3Or4LayerId(currentLayer.value.layerId)) {
        const routes = Array.isArray(result.layoutData)
          ? result.layoutData
          : result.layoutData.routes || [];
        currentLayer.value.dataTableData = generateDataTableDataUtil(routes);
      }
      syncSpaceNetworkFromTest3Layout();
    }
  };

  // ==================== 🗑️ Test2: 固定 row/col 為 1pt（不刪除資料） ====================

  /**
   * 確保 layoutGridJsonData_Test3 具備 meta（若目前是 Array，轉成 {routes, meta}）
   * @returns {Object|null} Object with routes and meta properties, or null
   */
  const ensureTest3LayoutAndMeta = () => {
    if (!currentLayer.value) return null;
    const layoutData = currentLayer.value.layoutGridJsonData_Test3;
    if (!layoutData) return null;

    if (Array.isArray(layoutData)) {
      const wrapped = { routes: layoutData, meta: {} };
      currentLayer.value.layoutGridJsonData_Test3 = wrapped;
      return wrapped;
    }

    if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.routes)) {
      layoutData.meta =
        layoutData.meta && typeof layoutData.meta === 'object' ? layoutData.meta : {};
      return { routes: layoutData.routes, meta: layoutData.meta };
    }

    console.warn('layoutGridJsonData_Test3 格式不支援');
    return null;
  };

  /**
   * 從 routes/segments/points 推算目前資料的最小座標（用來把 idx 轉成實際座標）
   */
  const getTest3MinXY = (routes) => {
    let minX = Infinity;
    let minY = Infinity;
    (routes || []).forEach((route) => {
      const segments = route?.segments || [];
      segments.forEach((seg) => {
        const points = Array.isArray(seg.points) ? seg.points : [];
        points.forEach((pt) => {
          const x = Array.isArray(pt) ? pt[0] : pt?.x;
          const y = Array.isArray(pt) ? pt[1] : pt?.y;
          if (Number.isFinite(Number(x))) minX = Math.min(minX, Math.round(Number(x)));
          if (Number.isFinite(Number(y))) minY = Math.min(minY, Math.round(Number(y)));
        });
      });
    });
    return {
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
    };
  };

  const addUniqueSorted = (arr, value) => {
    const v = Math.round(value);
    const base = Array.isArray(arr) ? arr.map((x) => Math.round(x)) : [];
    if (!base.includes(v)) base.push(v);
    base.sort((a, b) => a - b);
    return base;
  };

  /**
   * 🗑️ 刪除row：不刪除資料，只把該 row 的高度固定成 1pt（寫入 meta.fixedRows）
   * 依 dataTableData 的順序：type=row、removable=V、且 刪除 != 'V'
   * 注意：只能改 dataTableData 的「刪除」欄位
   */
  const deleteOneRow = () => {
    if (!currentLayer.value || currentLayer.value.layerId !== 'taipei_6_1_test2') return false;
    const tableData = currentLayer.value.dataTableData;
    if (!Array.isArray(tableData) || tableData.length === 0) return false;

    const payload = ensureTest3LayoutAndMeta();
    if (!payload) return false;

    const targetRow = tableData.find(
      (r) => r && r.type === 'row' && r.removable === 'V' && r.刪除 !== 'V'
    );
    if (!targetRow) return false;

    const idx = targetRow.idx;
    if (typeof idx !== 'number' || !Number.isFinite(idx)) return false;

    const { minY } = getTest3MinXY(payload.routes);
    const actualRow = minY + idx;

    payload.meta.fixedRows = addUniqueSorted(payload.meta.fixedRows, actualRow);
    targetRow.刪除 = 'V';

    currentLayer.value.layoutGridJsonData_Test3 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test3)
    );
    syncSpaceNetworkFromTest2Layout();
    return true;
  };

  /**
   * 🗑️ 刪除col：不刪除資料，只把該 col 的寬度固定成 1pt（寫入 meta.fixedCols）
   * 依 dataTableData 的順序：type=col、removable=V、且 刪除 != 'V'
   * 注意：只能改 dataTableData 的「刪除」欄位
   */
  const deleteOneCol = () => {
    if (!currentLayer.value || currentLayer.value.layerId !== 'taipei_6_1_test2') return false;
    const tableData = currentLayer.value.dataTableData;
    if (!Array.isArray(tableData) || tableData.length === 0) return false;

    const payload = ensureTest3LayoutAndMeta();
    if (!payload) return false;

    const targetCol = tableData.find(
      (r) => r && r.type === 'col' && r.removable === 'V' && r.刪除 !== 'V'
    );
    if (!targetCol) return false;

    const idx = targetCol.idx;
    if (typeof idx !== 'number' || !Number.isFinite(idx)) return false;

    const { minX } = getTest3MinXY(payload.routes);
    const actualCol = minX + idx;

    payload.meta.fixedCols = addUniqueSorted(payload.meta.fixedCols, actualCol);
    targetCol.刪除 = 'V';

    currentLayer.value.layoutGridJsonData_Test3 = JSON.parse(
      JSON.stringify(currentLayer.value.layoutGridJsonData_Test3)
    );
    syncSpaceNetworkFromTest2Layout();
    return true;
  };

  const deleteAllRows = () => {
    while (deleteOneRow()) {
      // keep deleting
    }
  };

  const deleteAllCols = () => {
    while (deleteOneCol()) {
      // keep deleting
    }
  };

  /**
   * 與 SpaceNetworkGridTab 一致之地圖路段匯出（buildMapDrawnRoutesExport）。
   * @param {string} layerId
   * @param {string} filename
   */
  const downloadMapDrawnExportJson = (layerId, filename) => {
    const layer = dataStore.findLayerById(layerId);
    if (!layer?.spaceNetworkGridJsonData?.length) return;

    const data = buildMapDrawnRoutesExport(layer);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lineOrthoTowardCenterRoutesExportFilename = (layerId) =>
    layerId === SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID
      ? 'schematic_toward_center_vh_routes.json'
      : layerId === SCHEMATIC_TOWARD_CENTER_HV_LAYER_ID
        ? 'schematic_toward_center_hv_routes.json'
        : layerId === SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID
          ? 'schematic_rma_toward_center_vh_routes.json'
          : layerId === SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID
            ? 'schematic_rma_toward_center_hv_routes.json'
            : layerId === LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID
              ? 'orthogonal_toward_center_vh_routes.json'
              : 'orthogonal_toward_center_hv_routes.json';

  /**
   * `orthogonal_toward_center_hv`／`vh`：與 Upper「json-viewer」同一來源（SpaceNetworkGridJsonDataTab
   * `isSpaceLayoutUniformGridViewerLayerId` → `dataJson ?? jsonData`）。勿用
   * `jsonViewerPayloadForCoordNormalizedFamilyLayer`（會取 spaceNetworkGridJsonData 等，與檢視不一致）。
   */
  const lineOrthoTowardCenterJsonViewerMirrorPayload = (layer) => {
    const id = layer?.layerId;
    if (!id || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(id)) return null;
    const jdraw = layer.dataJson ?? layer.jsonData;
    return jdraw != null ? jdraw : null;
  };

  /**
   * 示意圖「往中心聚集」HV／VH 兩層：HV/VH 層只存 connect 骨架（黑點站抽離成 metadata
   * `schematicBlackSections` 隨鏈傳遞、不參與運算）。下載時把黑點站**平均沿線放回**目前骨架
   * 產生含黑點的匯出列；**不**變更圖層狀態（骨架仍維持骨架，供下游 connect 拉直）。
   */
  const schematicTowardCenterRoutesExportRowsWithBlackDots = (layer) => {
    const skel = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(layer?.spaceNetworkGridJsonData || []))
    );
    if (!Array.isArray(skel) || skel.length === 0) return null;
    const sections = Array.isArray(layer.schematicBlackSections) ? layer.schematicBlackSections : [];
    const full = sections.length === skel.length ? reinsertBlackStations(skel, sections) : skel;
    try {
      return flatSegmentsToGeojsonStyleExportRows(full);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('下載示意圖往中心聚集路線 JSON：黑點放回失敗', e);
      return null;
    }
  };

  const downloadLineOrthoTowardCenterRoutesJson = (layer) => {
    if (!layer || !LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(layer.layerId)) return;

    let payload;
    if (SCHEMATIC_TOWARD_CENTER_LAYER_IDS.includes(layer.layerId)) {
      // 示意圖 HV/VH：黑點站不參與運算，下載時自 metadata 平均沿線放回（不變更圖層骨架）。
      payload = schematicTowardCenterRoutesExportRowsWithBlackDots(layer);
    } else {
      // OSM 版：下載前把中段黑點（segment.stations）併回 dataJson：沿用既有站點，不做版面中點計算
      // （與 Control「先直後橫·繪製」下載同一流程）。
      try {
        syncJsonGridFromCoordDataJsonFromPipeline(layer);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('下載往中心聚集路線 JSON：同步黑點失敗', e);
      }
      payload = lineOrthoTowardCenterJsonViewerMirrorPayload(layer);
    }
    if (payload == null) return;
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lineOrthoTowardCenterRoutesExportFilename(layer.layerId);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** taipei_e：僅匯出地圖路段格式（陣列；每筆 routeName、segment、routeCoordinates） */
  const downloadFinalJson = () => {
    const id = currentLayer.value?.layerId;
    if (!isTaipeiTestELayerTab(id)) return;
    downloadMapDrawnExportJson(id, 'e_final_taipei.json');
  };

  /** taipei_f：地圖路段匯出，結構與 e_final（routeName／segment／routeCoordinates）一致 */
  const taipeiFNetworkExportFilename = () => 'f_network_taipei.json';

  const downloadTaipeiFNetworkJson = () => {
    const id = currentLayer.value?.layerId;
    if (!isTaipeiTestFLayerTab(id)) return;
    downloadMapDrawnExportJson(id, taipeiFNetworkExportFilename());
  };

  /** j：路段匯出（與 e／f 相同語意）＋ dataTableData／layerInfo／dashboard */
  const taipeiJ3TrafficExportFilename = () => {
    return 'j3_routes_traffic_taipei_test3.json';
  };

  const downloadTaipeiJ3Json = () => {
    const id = currentLayer.value?.layerId;
    if (!isTaipeiTest3J3TrafficExportLayerTab(id)) return;
    const layer = dataStore.findLayerById(id);
    if (!layer?.spaceNetworkGridJsonData?.length) return;

    const payload = {
      layerId: id,
      exportedAt: new Date().toISOString(),
      mapDrawnRoutes: buildMapDrawnRoutesExport(layer),
      dataTableData: layer.dataTableData ?? null,
      layerInfoData: layer.layerInfoData ?? null,
      dashboardData: layer.dashboardData ?? null,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = taipeiJ3TrafficExportFilename(id);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * 通用 JSON 下載：把任意 payload 以縮排 JSON 觸發瀏覽器下載。
   * @param {*} payload
   * @param {string} filename
   */
  const triggerJsonDownload = (payload, filename) => {
    if (payload == null) return;
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
  };

  /**
   * 「路線圖轉換骨架」(route_map_adjust)：下載骨架 GeoJSON。
   * 與 loadRouteAdjustIntoSchematic 餵給示意圖佈局的輸入完全同格式（示意圖計算即讀此格式）。
   */
  const downloadRouteMapAdjustSkeletonJson = () => {
    const adj = dataStore.findLayerById('route_map_adjust');
    const sk = adj?.routeMapAdjustSkeleton;
    const edges = Array.isArray(sk?.edges) ? sk.edges : [];
    if (!edges.length) {
      window.alert('「路線圖轉換骨架」尚未建立骨架，請先按「變成骨架」。');
      return;
    }
    const fc = routeMapAdjustSkeletonToGeoJson(
      sk,
      Array.isArray(adj.routeMapAdjustLines) ? adj.routeMapAdjustLines : [],
      Array.isArray(adj.routeMapAdjustBlackDots) ? adj.routeMapAdjustBlackDots : [],
      adj.routeMapAdjustStationMeta || null
    );
    triggerJsonDownload(fc, 'route_map_adjust_skeleton.json');
  };

  /**
   * 「路線圖轉換骨架2」(route_map_adjust_2)：下載骨架 GeoJSON。
   * 與 loadRouteAdjustIntoSchematic 餵給示意圖佈局的輸入完全同格式（示意圖計算即讀此格式）。
   */
  const downloadRouteMapAdjust2SkeletonJson = () => {
    const adj = dataStore.findLayerById('route_map_adjust_2');
    const sk = adj?.routeMapAdjustSkeleton;
    const edges = Array.isArray(sk?.edges) ? sk.edges : [];
    if (!edges.length) {
      window.alert('「路線圖轉換骨架2」尚未建立骨架，請先按「變成骨架」。');
      return;
    }
    const fc = routeMapAdjustSkeletonToGeoJson(
      sk,
      Array.isArray(adj.routeMapAdjustLines) ? adj.routeMapAdjustLines : [],
      Array.isArray(adj.routeMapAdjustBlackDots) ? adj.routeMapAdjustBlackDots : [],
      adj.routeMapAdjustStationMeta || null
    );
    triggerJsonDownload(fc, 'route_map_adjust_2_skeleton.json');
  };

  /**
   * 「路線圖轉換直線骨架」(route_map_adjust_straight)：下載骨架 GeoJSON。
   * 與 loadRouteAdjustStraightIntoSchematic 餵給示意圖佈局的輸入完全同格式。
   */
  const downloadRouteMapAdjustStraightSkeletonJson = () => {
    const adj = dataStore.findLayerById('route_map_adjust_straight');
    const sk = adj?.routeMapAdjustSkeleton;
    const edges = Array.isArray(sk?.edges) ? sk.edges : [];
    if (!edges.length) {
      window.alert('「路線圖轉換直線骨架」尚未建立骨架，請先按「變成骨架」。');
      return;
    }
    const lines = Array.isArray(adj.routeMapAdjustStraightenedLines)
      ? adj.routeMapAdjustStraightenedLines
      : Array.isArray(adj.routeMapAdjustLines)
        ? adj.routeMapAdjustLines
        : [];
    const blackDots = Array.isArray(adj.routeMapAdjustStraightenedBlackDots)
      ? adj.routeMapAdjustStraightenedBlackDots
      : Array.isArray(adj.routeMapAdjustBlackDots)
        ? adj.routeMapAdjustBlackDots
        : [];
    const stationMeta =
      adj.routeMapAdjustStraightenedStationMeta || adj.routeMapAdjustStationMeta || null;
    const stationCoords = collectStraightSkeletonStationCoords(
      adj.routeMapAdjustLines,
      adj.routeMapAdjustBlackDots,
      blackDots,
      stationMeta
    );
    const fc = routeMapAdjustSkeletonToGeoJson(sk, lines, blackDots, stationMeta, stationCoords);
    triggerJsonDownload(fc, 'route_map_adjust_straight_skeleton.json');
  };

  /**
   * 「示意圖佈局」(schematic_rma_*)：下載目前載入的輸入骨架 GeoJSON。
   * 優先自路線圖調整骨架重產（含站名）；否則補齊 layer.geojsonData 內 Point 站名。
   */
  const downloadRouteSchematicInputJson = (layer) => {
    const rebuilt = buildSchematicInputGeoJsonForDownload(dataStore);
    let fc;
    if (rebuilt) {
      let stationCoords = null;
      if (rebuilt.source === 'straight' && rebuilt.straightLayer) {
        const adj = rebuilt.straightLayer;
        stationCoords = collectStraightSkeletonStationCoords(
          adj.routeMapAdjustLines,
          adj.routeMapAdjustBlackDots,
          rebuilt.blackDots,
          rebuilt.stationMeta
        );
      }
      fc = routeMapAdjustSkeletonToGeoJson(
        rebuilt.sk,
        rebuilt.lines,
        rebuilt.blackDots,
        rebuilt.stationMeta,
        stationCoords
      );
    } else if (layer?.geojsonData?.features?.length) {
      fc = JSON.parse(JSON.stringify(layer.geojsonData));
      const meta =
        dataStore.findLayerById('route_map_adjust_straight')
          ?.routeMapAdjustStraightenedStationMeta ||
        dataStore.findLayerById('route_map_adjust')?.routeMapAdjustStationMeta ||
        null;
      enrichGeoJsonStationNamesFromMeta(fc, meta);
    } else {
      window.alert(
        '此圖層尚未載入輸入骨架，請先「從路線圖轉換骨架載入」或「從路線圖轉換直線骨架載入」。'
      );
      return;
    }
    triggerJsonDownload(fc, `${layer.layerId}_input.json`);
  };

  /**
   * 「示意圖佈局」(schematic_rma_*)：是否已有直線化（八方向佈局）後的結果可下載。
   */
  const routeSchematicHasResult = (layer) =>
    Array.isArray(layer?.spaceNetworkGridJsonData) && layer.spaceNetworkGridJsonData.length > 0;

  const milpRoutePairAuditing = ref(false);

  /** ③ MILP（RMA）：按鈕觸發路線對 CCW 環序審計（不動佈局管線） */
  const runMilpRoutePairAudit = (layer) => {
    if (!layer || layer.layerId !== 'schematic_rma_milp') return;
    if (!routeSchematicHasResult(layer)) {
      window.alert('此圖層尚無佈局結果，請先按「開始執行」。');
      return;
    }
    milpRoutePairAuditing.value = true;
    try {
      const result = auditMilpRoutePairRotation(layer.layerId, layer.spaceNetworkGridJsonData);
      if (!result.ok) {
        window.alert(result.message || '審計失敗');
        return;
      }
      layer.milpRoutePairAudit = result.audit;
    } finally {
      milpRoutePairAuditing.value = false;
    }
  };

  /**
   * 「示意圖佈局」(schematic_rma_*)：下載**直線化後的結果** GeoJSON。
   * 把佈局結果（spaceNetworkGridJsonData）以與骨架輸入相同的 GeoJSON FeatureCollection
   * 格式輸出（經 export 列 → minimalLineStringFeatureCollectionFromRouteExportRows），
   * 與「下載 JSON（輸入骨架）」同格式、可再次載入同一管線。
   */
  const downloadRouteSchematicResultJson = (layer) => {
    if (!routeSchematicHasResult(layer)) {
      window.alert('此圖層尚無佈局結果，請先按「開始執行」計算示意圖佈局。');
      return;
    }
    let rows = Array.isArray(layer.processedJsonData) ? layer.processedJsonData : null;
    if (!rows || !rows.length) {
      try {
        const flat = normalizeSpaceNetworkDataToFlatSegments(
          JSON.parse(JSON.stringify(layer.spaceNetworkGridJsonData))
        );
        enrichFlatSegmentsStationNames(flat, {
          stationData: layer.spaceNetworkGridJsonData_StationData,
        });
        rows = flatSegmentsToGeojsonStyleExportRows(flat);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('下載示意圖佈局結果 JSON：產生匯出列失敗', e);
        rows = null;
      }
    }
    if (!rows || !rows.length) {
      window.alert('無法由佈局結果產生匯出資料。');
      return;
    }
    enrichExportRowsStationNames(rows, {
      stationData: layer.spaceNetworkGridJsonData_StationData,
    });
    const fc = minimalLineStringFeatureCollectionFromRouteExportRows(rows, {
      stationPoints: 'all',
      routeLine: 'full',
    });
    triggerJsonDownload(fc, `${layer.layerId}_result.json`);
  };

</script>

<template>
  <!-- 🎮 操作控制分頁組件 -->
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <!-- 📑 圖層分頁導航 -->
    <div v-if="visibleLayers.length > 0" class="">
      <ul class="nav nav-tabs nav-fill">
        <li
          v-for="layer in validVisibleLayers"
          :key="layer.layerId"
          class="nav-item d-flex flex-column align-items-stretch w-100"
        >
          <div
            class="d-flex align-items-center justify-content-center gap-1 w-100 flex-wrap flex-md-nowrap px-1"
          >
            <!-- 文字分頁（操作區選中的圖層） -->
            <div
              class="btn nav-link flex-grow-1 min-w-0 rounded-0 border-0 position-relative d-flex align-items-center justify-content-center my-bgcolor-gray-200"
              :class="{
                active: activeLayerTab === layer.layerId,
              }"
              @click="setActiveLayerTab(layer.layerId)"
            >
              <span class="my-title-sm-black text-center text-break">
                <span v-if="getLayerFullTitle(layer).groupName" class="my-title-xs-gray"
                  >{{ getLayerFullTitle(layer).groupName }} -
                </span>
                <span>{{ getLayerFullTitle(layer).layerName }}</span>
              </span>
            </div>
            <button
              v-for="s in layerUpperTabShortcuts(layer)"
              :key="layer.layerId + '-up-' + s.tab"
              type="button"
              class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs flex-shrink-0"
              :title="s.title"
              style="width: 30px; min-width: 30px; height: 30px"
              @click.stop="openHomeUpperTab(s.tab)"
            >
              <i :class="getIcon(s.iconKey).icon"></i>
            </button>
          </div>
          <div class="w-100" :class="`my-bgcolor-${layer.colorName}`" style="min-height: 4px"></div>
        </li>
      </ul>
    </div>

    <!-- 📋 圖層操作內容區域 -->
    <div v-if="visibleLayers.length > 0" class="flex-grow-1 overflow-auto p-3 my-bgcolor-white">
      <div
        v-for="layer in validVisibleLayers"
        :key="layer.layerId"
        v-show="activeLayerTab === layer.layerId"
      >
        <!-- 🗺️ 示意圖佈局（從路線圖調整）：載入 + 執行（僅①②③演算法層） -->
        <div
          v-if="layer.isRouteSchematicLayer && ['schematic_rma_stroke', 'schematic_rma_hillclimb', 'schematic_rma_milp', 'schematic_rma_force', 'schematic_rma_wangchi', 'schematic_rma_bast', 'schematic_rma_merrick', 'schematic_rma_sat', 'schematic_rma_normalize'].includes(layer.layerId)"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">{{ layer.layerName }}</div>
          <div class="my-font-size-xs text-muted pb-2" style="line-height: 1.45">
            從「路線圖轉換骨架」或「路線圖轉換直線骨架」載入骨架作為輸入，再按「開始執行」計算示意圖佈局。
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="loadRouteAdjustIntoSchematic(layer)"
          >
            從路線圖轉換骨架載入
          </button>
          <button
            type="button"
            class="btn rounded-pill border my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="loadRouteAdjustStraightIntoSchematic(layer)"
          >
            從路線圖轉換直線骨架載入
          </button>
          <div v-if="layer.geojsonData && layer.geojsonData.features" class="my-font-size-xs text-muted pb-2">
            已載入輸入：{{ layer.geojsonData.features.length }} 個 features
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            :disabled="!layer.geojsonData || !layer.geojsonData.features || !layer.geojsonData.features.length || isExecuting"
            @click="executeLayerFunction"
          >
            {{ isExecuting ? '執行中…' : '開始執行' }}
          </button>
          <div
            v-if="layer.layerId === 'schematic_rma_normalize'"
            class="text-muted mt-2"
            style="font-size: 10px; line-height: 1.45"
          >
            座標正規化 → 鄰線錯邊修正（若須）→ 刪空欄列
          </div>
          <button
            type="button"
            class="btn rounded-pill border my-font-size-xs text-nowrap w-100 my-cursor-pointer mt-2"
            :disabled="!layer.geojsonData || !layer.geojsonData.features || !layer.geojsonData.features.length"
            title="下載目前載入的輸入骨架 GeoJSON（與路線圖轉換骨架／直線骨架同格式，即示意圖計算所讀之格式）"
            @click="downloadRouteSchematicInputJson(layer)"
          >
            下載 JSON（輸入骨架）
          </button>
          <button
            type="button"
            class="btn rounded-pill border my-font-size-xs text-nowrap w-100 my-cursor-pointer mt-2"
            :disabled="!routeSchematicHasResult(layer)"
            title="下載直線化（八方向佈局）後的結果 GeoJSON（與輸入骨架同格式、可再次載入）"
            @click="downloadRouteSchematicResultJson(layer)"
          >
            下載 JSON（直線化結果）
          </button>
          <button
            v-if="layer.layerId === 'schematic_rma_milp'"
            type="button"
            class="btn rounded-pill border my-font-size-xs text-nowrap w-100 my-cursor-pointer mt-2"
            :disabled="!routeSchematicHasResult(layer) || milpRoutePairAuditing || isExecuting"
            title="比對讀入骨架與佈局結果：各分歧點 360° CCW 路線環序（骨架邊無方向，只看點上各路線相對順序）"
            @click="runMilpRoutePairAudit(layer)"
          >
            {{ milpRoutePairAuditing ? '檢查中…' : '檢查路線對環序' }}
          </button>
          <div
            v-if="layer.layerId === 'schematic_rma_milp' && layer.milpRoutePairAudit"
            class="mt-2 p-2 rounded border my-font-size-xs"
            style="line-height: 1.45"
          >
            <div class="my-title-xs-gray pb-1">360° 支線環序（分歧點上各路線離開角 CCW 順序）</div>
            <div class="text-muted pb-1" style="font-size: 10px; line-height: 1.4">
              例：景安站檢查「景安→南勢角」支線與環狀線等之相對順序，非骨架段行進方向。
            </div>
            <div
              v-if="layer.milpRoutePairAudit.primaryVerdict === 'PASS'"
              class="text-success"
            >
              正確 — {{ layer.milpRoutePairAudit.junctionCountGe3 }} 個分歧點路線對順序一致
            </div>
            <div v-else class="text-danger pb-1">
              錯誤 — {{ layer.milpRoutePairAudit.violationCount }} 組路線對順序與骨架不符
            </div>
            <ul
              v-if="layer.milpRoutePairAudit.reasonLines?.length"
              class="mb-0 ps-3"
            >
              <li
                v-for="(r, ri) in layer.milpRoutePairAudit.reasonLines"
                :key="'mra-' + ri"
                :class="layer.milpRoutePairAudit.primaryVerdict === 'PASS' ? 'text-muted' : 'text-danger'"
              >
                {{ r }}
              </li>
            </ul>
          </div>
          <div
            v-if="layer.layerId === 'schematic_rma_milp' && layer.dashboardData?.rotationStructureCheck?.layoutDone"
            class="mt-2 p-2 rounded border my-font-size-xs"
            style="line-height: 1.45"
          >
            <div class="my-title-xs-gray pb-1">入射方向順序（讀入骨架）</div>
            <div
              v-if="layer.dashboardData.rotationStructureCheck.preserved && !layer.dashboardData.rotationStructureCheck.detectedCount"
              class="text-muted"
            >
              與讀入骨架一致（≥3 分支之 360° 環序，另一端點順序正確）
            </div>
            <div v-else class="text-muted pb-1">
              <span v-if="layer.dashboardData.rotationStructureCheck.preserved">
                曾 {{ layer.dashboardData.rotationStructureCheck.detectedCount }} 處不符，已校正
                {{ layer.dashboardData.rotationStructureCheck.fixedIterations }} 處
              </span>
              <span v-else>
                仍有 {{ layer.dashboardData.rotationStructureCheck.remainingCount }} 處不符讀入骨架
              </span>
            </div>
            <ul
              v-if="
                layer.dashboardData.rotationStructureCheck.preserved &&
                layer.dashboardData.rotationStructureCheck.detectedReasons?.length
              "
              class="mb-0 ps-3"
            >
              <li
                v-for="(r, si) in layer.dashboardData.rotationStructureCheck.detectedReasons"
                :key="'rs-d-' + si"
              >
                {{ r }}
              </li>
            </ul>
            <ul
              v-if="
                !layer.dashboardData.rotationStructureCheck.preserved &&
                layer.dashboardData.rotationStructureCheck.remainingReasons?.length
              "
              class="mb-0 ps-3 pt-1"
            >
              <li
                v-for="(r, si) in layer.dashboardData.rotationStructureCheck.remainingReasons"
                :key="'rs-r-' + si"
                class="text-danger"
              >
                （未校正）{{ r }}
              </li>
            </ul>
          </div>
          <div
            v-if="layer.schematicOverlapScan?.layoutDone && !layer.schematicOverlapScan.error"
            class="mt-3 p-2 rounded border my-font-size-xs"
            style="line-height: 1.45"
          >
            <div class="my-title-xs-gray pb-1">佈局後重疊</div>
            <div class="text-muted pb-1">
              仍重疊 {{ layer.schematicOverlapScan.total ?? 0 }} 處（橘）
            </div>
            <ul v-if="layer.schematicOverlapScan.rows?.length" class="mb-0 ps-3">
              <li v-for="(row, ri) in layer.schematicOverlapScan.rows" :key="ri">{{ row.label }}</li>
            </ul>
            <div v-if="layer.schematicOverlapScan.truncated" class="text-muted pt-1">（僅顯示前 60 筆）</div>
          </div>
        </div>

        <!-- 🗺️ 選擇路線圖（select_route_map）：載入城市路線（獨立複製，與畫線圖層不共用） -->
        <div v-if="layer.isSelectRouteMapLayer" class="pb-3 mb-3 border-bottom">
          <!-- ⚡ 快選：常用城市一鍵載入 -->
          <div class="my-title-xs-gray pb-2">快選城市</div>
          <select
            v-model="srmQuick"
            :disabled="srmTracing"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-2 my-cursor-pointer"
            @change="srmQuickLoad(srmQuick)"
          >
            <option value="">快選城市…</option>
            <option v-for="c in srmQuickCities" :key="c.id" :value="c.id">
              {{ (c.cityZh ? c.cityZh + ' ' : '') + c.city }}
            </option>
          </select>

          <!-- 依站點數排序：由少到多 -->
          <select
            v-model="srmStationSort"
            :disabled="srmTracing"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-3 my-cursor-pointer"
            @change="srmQuickLoad(srmStationSort)"
          >
            <option value="">依站點數排序…</option>
            <option v-for="c in srmStationSortedCities" :key="c.id" :value="c.id">
              {{ (c.cityZh ? c.cityZh + ' ' : '') + c.city + '（' + c.stations + ' 站・' + c.routes + ' 線）' }}
            </option>
          </select>

          <!-- 載入世界各城市路線：洲 → 國家 → 城市，按「讀取並畫出」載入 -->
          <div class="my-title-xs-gray pb-2">載入城市路線（全球）</div>
          <select
            v-model="srmContinent"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-2 my-cursor-pointer"
          >
            <option value="">選擇洲別…（共 {{ srmLoadableCities.length }} 城市）</option>
            <option v-for="c in srmContinents" :key="c" :value="c">{{ c }}</option>
          </select>
          <select
            v-model="srmCountry"
            :disabled="!srmContinent"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-2 my-cursor-pointer"
          >
            <option value="">選擇國家…</option>
            <option v-for="c in srmCountries" :key="c.country" :value="c.country">{{ c.label }}</option>
          </select>
          <select
            v-model="srmCity"
            :disabled="!srmCountry"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-2 my-cursor-pointer"
          >
            <option value="">選擇城市…</option>
            <option v-for="c in srmCities" :key="c.id" :value="c.id">
              {{ (c.cityZh ? c.cityZh + ' ' : '') + c.city }}
            </option>
          </select>
          <div class="d-flex gap-2 pb-1">
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              :disabled="!srmCity || srmTracing"
              title="載入所選城市的路線並畫到地圖上"
              @click="srmLoadSelectedCity"
            >
              {{ srmTracing ? '讀取中…' : '讀取並畫出' }}
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="srmClear"
            >
              清除
            </button>
          </div>
          <div v-if="srmTracing && srmLoadMsg" class="text-muted my-font-size-xs pb-2">{{ srmLoadMsg }}</div>
          <div v-if="srmSource" class="text-muted my-font-size-xs pb-3" style="line-height: 1.45">
            資料來源：{{ srmSource }}
            <div v-if="srmOfficialUrl">
              <a :href="srmOfficialUrl" target="_blank" rel="noopener noreferrer">官方路線圖 ↗</a>
            </div>
          </div>

          <!-- 🏷️ 顯示車站名開關 -->
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="my-content-sm-black">顯示車站名</div>
            <div class="layer-toggle" @click.stop>
              <input type="checkbox" id="switch-select-route-map-names" v-model="srmShowNames" />
              <label for="switch-select-route-map-names"></label>
            </div>
          </div>

          <!-- 目前路線／站點 + 各路線站點：整塊限高 320pt，內容過長可捲動 -->
          <div style="max-height: 320pt; overflow-y: auto">
          <!-- 目前路線／站點統計 -->
          <div class="my-title-xs-gray pb-2">目前路線／站點</div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span>路線</span><span>{{ srmStats.routes }} 條</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ff0000"
              ></span>
              connect（交點）
            </span>
            <span>{{ srmStats.connect }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #1565c0"
              ></span>
              terminal（端點）
            </span>
            <span>{{ srmStats.terminal }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-3">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #000000"
              ></span>
              一般（黑點）
            </span>
            <span>{{ srmStats.black }}</span>
          </div>

          <!-- 各路線站點（依序：起點 → 終點） -->
          <div class="my-title-xs-gray pb-2">各路線站點（依序）</div>
          <div v-if="srmRouteList.length === 0" class="my-font-size-xs pb-3">尚未載入任何路線</div>
          <div v-for="route in srmRouteList" :key="route.routeIndex" class="pb-2">
            <div class="d-flex align-items-center my-font-size-xs pb-1">
              <span
                class="d-inline-block rounded-pill me-2"
                :style="{ width: '24px', height: '6px', backgroundColor: route.color }"
              ></span>
              {{ srmRouteName(route.routeIndex) }}{{ route.closed ? '（封閉）' : '' }}（{{
                route.stations.length
              }}
              站）
            </div>
            <div class="ps-3">
              <div v-for="(st, si) in route.stations" :key="si" class="my-font-size-xs pb-1">
                <div class="d-flex align-items-center">
                  <span class="me-2" style="min-width: 18px">{{ si + 1 }}.</span>
                  <span
                    class="d-inline-block rounded-circle me-2"
                    :style="{ width: '8px', height: '8px', backgroundColor: srmStationColor(st.type) }"
                  ></span>
                  <span>{{ st.name || srmStationLabel(st.type) }}</span>
                </div>
                <!-- 交會路線：第二行、縮排顯示 -->
                <div
                  v-if="st.type === 'connect' && st.connectRoutes && st.connectRoutes.length"
                  class="d-flex align-items-center flex-wrap ps-4 pt-1"
                >
                  <span class="me-1">· 交會</span>
                  <span v-for="ri in st.connectRoutes" :key="ri" class="d-flex align-items-center me-2">
                    <span
                      class="d-inline-block rounded-pill me-1"
                      :style="{ width: '16px', height: '5px', backgroundColor: srmRouteColor(ri) }"
                    ></span>
                    {{ srmRouteName(ri) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="pb-2"></div>
          </div>
        </div>

        <!-- 🗺️ 路線圖調整（route_map_adjust）：從選擇路線圖載入（獨立複製，與其他圖層不共用） -->
        <div v-if="layer.isRouteMapAdjustLayer" class="pb-3 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">來源</div>
          <div class="d-flex gap-2 pb-1">
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              :disabled="!rmaHasSource || rmaLoading"
              title="把「選擇路線圖」目前載入的路線複製一份到本圖層"
              @click="rmaLoadFromSelect"
            >
              {{ rmaLoading ? '載入中…' : '從選擇路線圖載入' }}
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="rmaClear"
            >
              清除
            </button>
          </div>
          <div v-if="!rmaHasSource" class="text-muted my-font-size-xs pb-2">
            「選擇路線圖」目前尚無路線，請先到「選擇路線圖」載入城市路線。
          </div>
          <div v-if="rmaSource" class="text-muted my-font-size-xs pb-3" style="line-height: 1.45">
            資料來源：{{ rmaSource }}
          </div>

          <!-- 🦴 把目前路網變成骨架：重疊→一條線、交叉無點處生成點 -->
          <div class="my-title-xs-gray pb-2">骨架</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="rmaHasSkeleton ? 'my-btn-red' : 'my-btn-green'"
            :disabled="rmaStats.routes === 0"
            title="把目前路網變成骨架：重疊路線合併為一條線，交叉但無點處生成一個點。再按一次還原。"
            @click="rmaToggleSkeleton"
          >
            {{ rmaHasSkeleton ? '還原（取消骨架）' : '變成骨架' }}
          </button>
          <template v-if="rmaSkeletonStats.built">
            <div class="d-flex justify-content-between my-font-size-xs pb-1">
              <span>節點</span><span>{{ rmaSkeletonStats.nodes }}</span>
            </div>
            <div class="d-flex justify-content-between my-font-size-xs pb-1">
              <span>邊（去重後）</span><span>{{ rmaSkeletonStats.edges }}</span>
            </div>
            <div class="d-flex justify-content-between my-font-size-xs pb-2">
              <span class="d-flex align-items-center">
                <span
                  class="d-inline-block rounded-circle me-2"
                  style="width: 10px; height: 10px; background-color: #ff6d00"
                ></span>
                交叉生成節點
              </span>
              <span>{{ rmaSkeletonStats.crossNodes }}</span>
            </div>
          </template>
          <button
            type="button"
            class="btn rounded-pill border my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-3"
            :disabled="!rmaHasSkeleton"
            title="下載骨架 GeoJSON（與示意圖佈局輸入同格式，即示意圖計算所讀之格式）"
            @click="downloadRouteMapAdjustSkeletonJson"
          >
            下載 JSON（骨架）
          </button>

          <!-- 🏷️ 顯示車站名開關 -->
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="my-content-sm-black">顯示車站名</div>
            <div class="layer-toggle" @click.stop>
              <input type="checkbox" id="switch-route-map-adjust-names" v-model="rmaShowNames" />
              <label for="switch-route-map-adjust-names"></label>
            </div>
          </div>

          <!-- 紅/黃/綠/藍 highlight 清單：整塊限高 320pt，內容過長可捲動 -->
          <div style="max-height: 320pt; overflow-y: auto">
          <!-- 🔶 共線段（預設顯示）：被 ≥2 路線共用之重疊段 -->
          <div class="my-title-xs-gray pb-2">
            共線段（重疊）
            <span class="text-muted">· 預設於地圖以紅色底色高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #ff1744"
              ></span>
              共線段數
            </span>
            <span>{{ rmaSharedList.length }}</span>
          </div>
          <div v-if="rmaSharedList.length === 0" class="my-font-size-xs pb-3">
            無共線段（沒有多條路線共用同一段）。
          </div>
          <div
            v-for="s in rmaSharedList"
            :key="s.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ s.index + 1 }}.</span>
            <span>{{ s.routeCount }} 路線：{{ s.routeNames.join('、') }}</span>
          </div>
          <div v-if="rmaSharedList.length" class="pb-2"></div>

          <!-- 🟡 交叉站點 cross（黃，預設顯示） -->
          <div class="my-title-xs-gray pb-2">
            交叉站點（cross）
            <span class="text-muted">· 路線幾何交叉但無站點處，地圖以黃色 halo 高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ffd600"
              ></span>
              cross 數
            </span>
            <span>{{ rmaCrossList.length }}</span>
          </div>
          <div v-if="rmaCrossList.length === 0" class="my-font-size-xs pb-3">
            無交叉站點（沒有路線幾何交叉但無站點之處）。
          </div>
          <div
            v-for="c in rmaCrossList"
            :key="c.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ c.index + 1 }}.</span>
            <span
              class="d-inline-block rounded-circle me-2"
              style="width: 8px; height: 8px; background-color: #ffd600"
            ></span>
            <span>cross（{{ c.latlng[0].toFixed(5) }}, {{ c.latlng[1].toFixed(5) }}）</span>
          </div>
          <div v-if="rmaCrossList.length" class="pb-2"></div>

          <!-- 🟢 頭尾同點（環線，預設顯示）：單一路線頭尾為同一點 -->
          <div class="my-title-xs-gray pb-2">
            頭尾同點（環線）
            <span class="text-muted">· 單一路線頭尾為同一點，地圖以綠色線高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #00c853"
              ></span>
              環線數
            </span>
            <span>{{ rmaLoopList.length }}</span>
          </div>
          <div v-if="rmaLoopList.length === 0" class="my-font-size-xs pb-3">
            無環線（沒有頭尾為同一點的路線）。
          </div>
          <div
            v-for="e in rmaLoopList"
            :key="e.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ e.index + 1 }}.</span>
            <span>{{ e.routeName }}</span>
          </div>
          <div v-if="rmaLoopList.length" class="pb-2"></div>

          <!-- 🔵 頭尾共點（預設顯示）：多條路線端點相接處 -->
          <div class="my-title-xs-gray pb-2">
            頭尾共點
            <span class="text-muted">· 頭尾兩端皆為紅點（交點）之路線段，地圖以藍色線高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #1e88e5"
              ></span>
              線段數
            </span>
            <span>{{ rmaEndpointList.length }}</span>
          </div>
          <div v-if="rmaEndpointList.length === 0" class="my-font-size-xs pb-3">
            無此類線段（沒有頭尾兩端皆為紅點之路線段）。
          </div>
          <div
            v-for="e in rmaEndpointList"
            :key="e.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ e.index + 1 }}.</span>
            <span>{{ e.routeName }}（紅點×{{ e.aRouteCount }} → 紅點×{{ e.bRouteCount }}）</span>
          </div>
          <div v-if="rmaEndpointList.length" class="pb-2"></div>

          </div>

          <!-- 目前路線／站點 + 明細：整塊限高 320pt，內容過長可捲動 -->
          <div style="max-height: 320pt; overflow-y: auto">
          <!-- 目前路線／站點統計 -->
          <div class="my-title-xs-gray pb-2">目前路線／站點</div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span>路線</span><span>{{ rmaStats.routes }} 條</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ff0000"
              ></span>
              connect（交點）
            </span>
            <span>{{ rmaStats.connect }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #1565c0"
              ></span>
              terminal（端點）
            </span>
            <span>{{ rmaStats.terminal }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-3">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #000000"
              ></span>
              一般（黑點）
            </span>
            <span>{{ rmaStats.black }}</span>
          </div>


          <!-- 各路線站點（依序：起點 → 終點） -->
          <div class="my-title-xs-gray pb-2">各路線站點（依序）</div>
          <div v-if="rmaRouteList.length === 0" class="my-font-size-xs pb-3">尚未載入任何路線</div>
          <div v-for="route in rmaRouteList" :key="route.routeIndex" class="pb-2">
            <div class="d-flex align-items-center my-font-size-xs pb-1">
              <span
                class="d-inline-block rounded-pill me-2"
                :style="{ width: '24px', height: '6px', backgroundColor: route.color }"
              ></span>
              {{ rmaRouteName(route.routeIndex) }}{{ route.closed ? '（封閉）' : '' }}（{{
                route.stations.length
              }}
              站）
            </div>
            <div class="ps-3">
              <div v-for="(st, si) in route.stations" :key="si" class="my-font-size-xs pb-1">
                <div class="d-flex align-items-center">
                  <span class="me-2" style="min-width: 18px">{{ si + 1 }}.</span>
                  <span
                    class="d-inline-block rounded-circle me-2"
                    :style="{ width: '8px', height: '8px', backgroundColor: rmaStationColor(st.type) }"
                  ></span>
                  <span>{{ st.name || rmaStationLabel(st.type) }}</span>
                </div>
                <!-- 交會路線：第二行、縮排顯示 -->
                <div
                  v-if="st.type === 'connect' && st.connectRoutes && st.connectRoutes.length"
                  class="d-flex align-items-center flex-wrap ps-4 pt-1"
                >
                  <span class="me-1">· 交會</span>
                  <span v-for="ri in st.connectRoutes" :key="ri" class="d-flex align-items-center me-2">
                    <span
                      class="d-inline-block rounded-pill me-1"
                      :style="{ width: '16px', height: '5px', backgroundColor: rmaRouteColor(ri) }"
                    ></span>
                    {{ rmaRouteName(ri) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="pb-2"></div>
          </div>
        </div>

        <!-- 🗺️ 路線圖轉換骨架2（route_map_adjust_2）：從選擇路線圖載入（獨立複製，與其他圖層不共用） -->
        <div v-if="layer.isRouteMapAdjust2Layer" class="pb-3 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">來源</div>
          <div class="d-flex gap-2 pb-1">
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              :disabled="!rma2HasSource || rma2Loading"
              title="把「選擇路線圖」目前載入的路線複製一份到本圖層"
              @click="rma2LoadFromSelect"
            >
              {{ rma2Loading ? '載入中…' : '從選擇路線圖載入' }}
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="rma2Clear"
            >
              清除
            </button>
          </div>
          <div v-if="!rma2HasSource" class="text-muted my-font-size-xs pb-2">
            「選擇路線圖」目前尚無路線，請先到「選擇路線圖」載入城市路線。
          </div>
          <div v-if="rma2Source" class="text-muted my-font-size-xs pb-3" style="line-height: 1.45">
            資料來源：{{ rma2Source }}
          </div>

          <!-- 🦴 把目前路網變成骨架：重疊→一條線、交叉無點處生成點 -->
          <div class="my-title-xs-gray pb-2">骨架</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="rma2HasSkeleton ? 'my-btn-red' : 'my-btn-green'"
            :disabled="rma2Stats.routes === 0"
            title="把目前路網變成骨架：重疊路線合併為一條線，交叉但無點處生成一個點。再按一次還原。"
            @click="rma2ToggleSkeleton"
          >
            {{ rma2HasSkeleton ? '還原（取消骨架）' : '變成骨架' }}
          </button>
          <template v-if="rma2SkeletonStats.built">
            <div class="d-flex justify-content-between my-font-size-xs pb-1">
              <span>節點</span><span>{{ rma2SkeletonStats.nodes }}</span>
            </div>
            <div class="d-flex justify-content-between my-font-size-xs pb-1">
              <span>邊（去重後）</span><span>{{ rma2SkeletonStats.edges }}</span>
            </div>
            <div class="d-flex justify-content-between my-font-size-xs pb-2">
              <span class="d-flex align-items-center">
                <span
                  class="d-inline-block rounded-circle me-2"
                  style="width: 10px; height: 10px; background-color: #ff6d00"
                ></span>
                交叉生成節點
              </span>
              <span>{{ rma2SkeletonStats.crossNodes }}</span>
            </div>
          </template>
          <button
            type="button"
            class="btn rounded-pill border my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-3"
            :disabled="!rma2HasSkeleton"
            title="下載骨架 GeoJSON（與示意圖佈局輸入同格式，即示意圖計算所讀之格式）"
            @click="downloadRouteMapAdjust2SkeletonJson"
          >
            下載 JSON（骨架）
          </button>

          <!-- 🏷️ 顯示車站名開關 -->
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="my-content-sm-black">顯示車站名</div>
            <div class="layer-toggle" @click.stop>
              <input type="checkbox" id="switch-route-map-adjust-2-names" v-model="rma2ShowNames" />
              <label for="switch-route-map-adjust-2-names"></label>
            </div>
          </div>

          <!-- 紅/黃/綠/藍 highlight 清單：整塊限高 320pt，內容過長可捲動 -->
          <div style="max-height: 320pt; overflow-y: auto">
          <!-- 🔶 共線段（預設顯示）：被 ≥2 路線共用之重疊段 -->
          <div class="my-title-xs-gray pb-2">
            共線段（重疊）
            <span class="text-muted">· 預設於地圖以紅色底色高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #ff1744"
              ></span>
              共線段數
            </span>
            <span>{{ rma2SharedList.length }}</span>
          </div>
          <div v-if="rma2SharedList.length === 0" class="my-font-size-xs pb-3">
            無共線段（沒有多條路線共用同一段）。
          </div>
          <div
            v-for="s in rma2SharedList"
            :key="s.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ s.index + 1 }}.</span>
            <span>{{ s.routeCount }} 路線：{{ s.routeNames.join('、') }}</span>
          </div>
          <div v-if="rma2SharedList.length" class="pb-2"></div>

          <!-- 🟡 交叉站點 cross（黃，預設顯示） -->
          <div class="my-title-xs-gray pb-2">
            交叉站點（cross）
            <span class="text-muted">· 路線幾何交叉但無站點處，地圖以黃色 halo 高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ffd600"
              ></span>
              cross 數
            </span>
            <span>{{ rma2CrossList.length }}</span>
          </div>
          <div v-if="rma2CrossList.length === 0" class="my-font-size-xs pb-3">
            無交叉站點（沒有路線幾何交叉但無站點之處）。
          </div>
          <div
            v-for="c in rma2CrossList"
            :key="c.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ c.index + 1 }}.</span>
            <span
              class="d-inline-block rounded-circle me-2"
              style="width: 8px; height: 8px; background-color: #ffd600"
            ></span>
            <span>cross（{{ c.latlng[0].toFixed(5) }}, {{ c.latlng[1].toFixed(5) }}）</span>
          </div>
          <div v-if="rma2CrossList.length" class="pb-2"></div>

          <!-- 🟢 頭尾同點（環線，預設顯示）：單一路線頭尾為同一點 -->
          <div class="my-title-xs-gray pb-2">
            頭尾同點（環線）
            <span class="text-muted">· 單一路線頭尾為同一點，地圖以綠色線高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #00c853"
              ></span>
              環線數
            </span>
            <span>{{ rma2LoopList.length }}</span>
          </div>
          <div v-if="rma2LoopList.length === 0" class="my-font-size-xs pb-3">
            無環線（沒有頭尾為同一點的路線）。
          </div>
          <div
            v-for="e in rma2LoopList"
            :key="e.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ e.index + 1 }}.</span>
            <span>{{ e.routeName }}</span>
          </div>
          <div v-if="rma2LoopList.length" class="pb-2"></div>

          <!-- 🔵 頭尾共點（預設顯示）：多條路線端點相接處 -->
          <div class="my-title-xs-gray pb-2">
            頭尾共點
            <span class="text-muted">· 頭尾兩端皆為紅點（交點）之路線段，地圖以藍色線高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #1e88e5"
              ></span>
              線段數
            </span>
            <span>{{ rma2EndpointList.length }}</span>
          </div>
          <div v-if="rma2EndpointList.length === 0" class="my-font-size-xs pb-3">
            無此類線段（沒有頭尾兩端皆為紅點之路線段）。
          </div>
          <div
            v-for="e in rma2EndpointList"
            :key="e.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ e.index + 1 }}.</span>
            <span>{{ e.routeName }}（紅點×{{ e.aRouteCount }} → 紅點×{{ e.bRouteCount }}）</span>
          </div>
          <div v-if="rma2EndpointList.length" class="pb-2"></div>

          </div>

          <!-- 目前路線／站點 + 明細：整塊限高 320pt，內容過長可捲動 -->
          <div style="max-height: 320pt; overflow-y: auto">
          <!-- 目前路線／站點統計 -->
          <div class="my-title-xs-gray pb-2">目前路線／站點</div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span>路線</span><span>{{ rma2Stats.routes }} 條</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ff0000"
              ></span>
              connect（交點）
            </span>
            <span>{{ rma2Stats.connect }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #1565c0"
              ></span>
              terminal（端點）
            </span>
            <span>{{ rma2Stats.terminal }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-3">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #000000"
              ></span>
              一般（黑點）
            </span>
            <span>{{ rma2Stats.black }}</span>
          </div>

          <!-- 各路線站點（依序：起點 → 終點） -->
          <div class="my-title-xs-gray pb-2">各路線站點（依序）</div>
          <div v-if="rma2RouteList.length === 0" class="my-font-size-xs pb-3">尚未載入任何路線</div>
          <div v-for="route in rma2RouteList" :key="route.routeIndex" class="pb-2">
            <div class="d-flex align-items-center my-font-size-xs pb-1">
              <span
                class="d-inline-block rounded-pill me-2"
                :style="{ width: '24px', height: '6px', backgroundColor: route.color }"
              ></span>
              {{ rma2RouteName(route.routeIndex) }}{{ route.closed ? '（封閉）' : '' }}（{{
                route.stations.length
              }}
              站）
            </div>
            <div class="ps-3">
              <div v-for="(st, si) in route.stations" :key="si" class="my-font-size-xs pb-1">
                <div class="d-flex align-items-center">
                  <span class="me-2" style="min-width: 18px">{{ si + 1 }}.</span>
                  <span
                    class="d-inline-block rounded-circle me-2"
                    :style="{ width: '8px', height: '8px', backgroundColor: rma2StationColor(st.type) }"
                  ></span>
                  <span>{{ st.name || rma2StationLabel(st.type) }}</span>
                </div>
                <!-- 交會路線：第二行、縮排顯示 -->
                <div
                  v-if="st.type === 'connect' && st.connectRoutes && st.connectRoutes.length"
                  class="d-flex align-items-center flex-wrap ps-4 pt-1"
                >
                  <span class="me-1">· 交會</span>
                  <span v-for="ri in st.connectRoutes" :key="ri" class="d-flex align-items-center me-2">
                    <span
                      class="d-inline-block rounded-pill me-1"
                      :style="{ width: '16px', height: '5px', backgroundColor: rma2RouteColor(ri) }"
                    ></span>
                    {{ rma2RouteName(ri) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="pb-2"></div>
          </div>
        </div>

        <!-- 🗺️ 路線圖轉換直線骨架（route_map_adjust_straight）：從選擇路線圖載入（獨立複製，與其他圖層不共用） -->
        <div v-if="layer.isRouteMapAdjustStraightLayer" class="pb-3 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">來源</div>
          <div class="d-flex gap-2 pb-1">
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              :disabled="!rmasHasSource || rmasLoading"
              title="把「選擇路線圖」目前載入的路線複製一份到本圖層"
              @click="rmasLoadFromSelect"
            >
              {{ rmasLoading ? '載入中…' : '從選擇路線圖載入' }}
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="rmasClear"
            >
              清除
            </button>
          </div>
          <div v-if="!rmasHasSource" class="text-muted my-font-size-xs pb-2">
            「選擇路線圖」目前尚無路線，請先到「選擇路線圖」載入城市路線。
          </div>
          <div v-if="rmasSource" class="text-muted my-font-size-xs pb-3" style="line-height: 1.45">
            資料來源：{{ rmasSource }}
          </div>

          <!-- 🦴 紅/藍錨點間拉直後再變成骨架 -->
          <div class="my-title-xs-gray pb-2">骨架</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="rmasHasSkeleton ? 'my-btn-red' : 'my-btn-green'"
            :disabled="rmasStats.routes === 0"
            title="紅/藍錨點間拉直；頭尾同點（環線）在 1/3、2/3 加轉折點；黑點平均分配在直線上，再合併成骨架。再按一次還原。"
            @click="rmasToggleSkeleton"
          >
            {{ rmasHasSkeleton ? '還原（取消骨架）' : '變成骨架' }}
          </button>
          <template v-if="rmasSkeletonStats.built">
            <div class="d-flex justify-content-between my-font-size-xs pb-1">
              <span>節點</span><span>{{ rmasSkeletonStats.nodes }}</span>
            </div>
            <div class="d-flex justify-content-between my-font-size-xs pb-1">
              <span>邊（去重後）</span><span>{{ rmasSkeletonStats.edges }}</span>
            </div>
            <div class="d-flex justify-content-between my-font-size-xs pb-2">
              <span class="d-flex align-items-center">
                <span
                  class="d-inline-block rounded-circle me-2"
                  style="width: 10px; height: 10px; background-color: #ff6d00"
                ></span>
                交叉生成節點
              </span>
              <span>{{ rmasSkeletonStats.crossNodes }}</span>
            </div>
          </template>
          <button
            type="button"
            class="btn rounded-pill border my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-3"
            :disabled="!rmasHasSkeleton"
            title="下載直線骨架 GeoJSON（與示意圖佈局輸入同格式，即示意圖計算所讀之格式）"
            @click="downloadRouteMapAdjustStraightSkeletonJson"
          >
            下載 JSON（骨架）
          </button>

          <!-- 🏷️ 顯示車站名開關 -->
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="my-content-sm-black">顯示車站名</div>
            <div class="layer-toggle" @click.stop>
              <input type="checkbox" id="switch-route-map-adjust-straight-names" v-model="rmasShowNames" />
              <label for="switch-route-map-adjust-straight-names"></label>
            </div>
          </div>

          <!-- 紅/黃/綠/藍 highlight 清單：整塊限高 320pt，內容過長可捲動 -->
          <div style="max-height: 320pt; overflow-y: auto">
          <!-- 🔶 共線段（預設顯示）：被 ≥2 路線共用之重疊段 -->
          <div class="my-title-xs-gray pb-2">
            共線段（重疊）
            <span class="text-muted">· 預設於地圖以紅色底色高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #ff1744"
              ></span>
              共線段數
            </span>
            <span>{{ rmasSharedList.length }}</span>
          </div>
          <div v-if="rmasSharedList.length === 0" class="my-font-size-xs pb-3">
            無共線段（沒有多條路線共用同一段）。
          </div>
          <div
            v-for="s in rmasSharedList"
            :key="s.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ s.index + 1 }}.</span>
            <span>{{ s.routeCount }} 路線：{{ s.routeNames.join('、') }}</span>
          </div>
          <div v-if="rmasSharedList.length" class="pb-2"></div>

          <!-- 🟡 交叉站點 cross（黃，預設顯示） -->
          <div class="my-title-xs-gray pb-2">
            交叉站點（cross）
            <span class="text-muted">· 路線幾何交叉但無站點處，地圖以黃色 halo 高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ffd600"
              ></span>
              cross 數
            </span>
            <span>{{ rmasCrossList.length }}</span>
          </div>
          <div v-if="rmasCrossList.length === 0" class="my-font-size-xs pb-3">
            無交叉站點（沒有路線幾何交叉但無站點之處）。
          </div>
          <div
            v-for="c in rmasCrossList"
            :key="c.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ c.index + 1 }}.</span>
            <span
              class="d-inline-block rounded-circle me-2"
              style="width: 8px; height: 8px; background-color: #ffd600"
            ></span>
            <span>cross（{{ c.latlng[0].toFixed(5) }}, {{ c.latlng[1].toFixed(5) }}）</span>
          </div>
          <div v-if="rmasCrossList.length" class="pb-2"></div>

          <!-- 🟢 頭尾同點（環線，預設顯示）：單一路線頭尾為同一點 -->
          <div class="my-title-xs-gray pb-2">
            頭尾同點（環線）
            <span class="text-muted">· 單一路線頭尾為同一點，地圖以綠色線高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #00c853"
              ></span>
              環線數
            </span>
            <span>{{ rmasLoopList.length }}</span>
          </div>
          <div v-if="rmasLoopList.length === 0" class="my-font-size-xs pb-3">
            無環線（沒有頭尾為同一點的路線）。
          </div>
          <div
            v-for="e in rmasLoopList"
            :key="e.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ e.index + 1 }}.</span>
            <span>{{ e.routeName }}</span>
          </div>
          <div v-if="rmasLoopList.length" class="pb-2"></div>

          <!-- 🔵 頭尾共點（預設顯示）：多條路線端點相接處 -->
          <div class="my-title-xs-gray pb-2">
            頭尾共點
            <span class="text-muted">· 頭尾兩端皆為紅點（交點）之路線段，地圖以藍色線高亮</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block me-2"
                style="width: 14px; height: 8px; background-color: #1e88e5"
              ></span>
              線段數
            </span>
            <span>{{ rmasEndpointList.length }}</span>
          </div>
          <div v-if="rmasEndpointList.length === 0" class="my-font-size-xs pb-3">
            無此類線段（沒有頭尾兩端皆為紅點之路線段）。
          </div>
          <div
            v-for="e in rmasEndpointList"
            :key="e.index"
            class="d-flex align-items-center my-font-size-xs pb-1"
          >
            <span class="me-2" style="min-width: 18px">{{ e.index + 1 }}.</span>
            <span>{{ e.routeName }}（紅點×{{ e.aRouteCount }} → 紅點×{{ e.bRouteCount }}）</span>
          </div>
          <div v-if="rmasEndpointList.length" class="pb-2"></div>

          </div>

          <!-- 目前路線／站點 + 明細：整塊限高 320pt，內容過長可捲動 -->
          <div style="max-height: 320pt; overflow-y: auto">
          <!-- 目前路線／站點統計 -->
          <div class="my-title-xs-gray pb-2">目前路線／站點</div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span>路線</span><span>{{ rmasStats.routes }} 條</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ff0000"
              ></span>
              connect（交點）
            </span>
            <span>{{ rmasStats.connect }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #1565c0"
              ></span>
              terminal（端點）
            </span>
            <span>{{ rmasStats.terminal }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-3">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #000000"
              ></span>
              一般（黑點）
            </span>
            <span>{{ rmasStats.black }}</span>
          </div>


          <!-- 各路線站點（依序：起點 → 終點） -->
          <div class="my-title-xs-gray pb-2">各路線站點（依序）</div>
          <div v-if="rmasRouteList.length === 0" class="my-font-size-xs pb-3">尚未載入任何路線</div>
          <div v-for="route in rmasRouteList" :key="route.routeIndex" class="pb-2">
            <div class="d-flex align-items-center my-font-size-xs pb-1">
              <span
                class="d-inline-block rounded-pill me-2"
                :style="{ width: '24px', height: '6px', backgroundColor: route.color }"
              ></span>
              {{ rmasRouteName(route.routeIndex) }}{{ route.closed ? '（封閉）' : '' }}（{{
                route.stations.length
              }}
              站）
            </div>
            <div class="ps-3">
              <div v-for="(st, si) in route.stations" :key="si" class="my-font-size-xs pb-1">
                <div class="d-flex align-items-center">
                  <span class="me-2" style="min-width: 18px">{{ si + 1 }}.</span>
                  <span
                    class="d-inline-block rounded-circle me-2"
                    :style="{ width: '8px', height: '8px', backgroundColor: rmasStationColor(st.type) }"
                  ></span>
                  <span>{{ st.name || rmasStationLabel(st.type) }}</span>
                </div>
                <!-- 交會路線：第二行、縮排顯示 -->
                <div
                  v-if="st.type === 'connect' && st.connectRoutes && st.connectRoutes.length"
                  class="d-flex align-items-center flex-wrap ps-4 pt-1"
                >
                  <span class="me-1">· 交會</span>
                  <span v-for="ri in st.connectRoutes" :key="ri" class="d-flex align-items-center me-2">
                    <span
                      class="d-inline-block rounded-pill me-1"
                      :style="{ width: '16px', height: '5px', backgroundColor: rmasRouteColor(ri) }"
                    ></span>
                    {{ rmasRouteName(ri) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="pb-2"></div>
          </div>
        </div>

        <!-- Leaflet 自由畫線（JOSM 式）：工具切換、統計、說明、清除 -->
        <div v-if="layer.isLeafletDrawLayer" class="pb-3 mb-3 border-bottom">
          <!-- 主要操作（置頂）：隨機產生 / 清除全部 -->
          <div class="d-flex gap-2 pb-3">
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              title="在台北車站周邊隨機產生數條路線（取代目前內容）"
              @click="generateRandomLeafletDrawNetwork"
            >
              隨機產生
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="clearLeafletDrawLines"
            >
              清除全部
            </button>
          </div>

          <!-- 工具切換 -->
          <div class="my-title-xs-gray pb-2">繪製工具</div>
          <div class="d-flex gap-2 pb-3">
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              :class="leafletDrawMode === 'line' ? 'my-btn-blue' : 'my-bgcolor-gray-300'"
              @click="setLeafletDrawMode('line')"
            >
              畫線
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              :class="leafletDrawMode === 'point' ? 'my-btn-blue' : 'my-bgcolor-gray-300'"
              @click="setLeafletDrawMode('point')"
            >
              畫黑點
            </button>
          </div>

          <!-- 載入世界各城市路線：洲 → 國家 → 城市，按「讀取並畫出」才即時抓（OSM，取代目前內容） -->
          <div class="my-title-xs-gray pb-2">載入城市路線（全球）</div>
          <select
            v-model="selContinent"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-2 my-cursor-pointer"
          >
            <option value="">選擇洲別…（共 {{ loadableCities.length }} 城市）</option>
            <option v-for="c in drawContinents" :key="c" :value="c">{{ c }}</option>
          </select>
          <select
            v-model="selCountry"
            :disabled="!selContinent"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-2 my-cursor-pointer"
          >
            <option value="">選擇國家…</option>
            <option v-for="c in drawCountries" :key="c.country" :value="c.country">{{ c.label }}</option>
          </select>
          <select
            v-model="selCity"
            :disabled="!selCountry"
            class="form-select form-select-sm rounded-pill my-font-size-xs mb-2 my-cursor-pointer"
          >
            <option value="">選擇城市…</option>
            <option v-for="c in drawCities" :key="c.id" :value="c.id">
              {{ (c.cityZh ? c.cityZh + ' ' : '') + c.city }}
            </option>
          </select>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
            :disabled="!selCity || isTracingRefMap"
            title="即時向 OpenStreetMap 抓取所選城市的路線，畫到地圖上"
            @click="loadSelectedCity"
          >
            {{ isTracingRefMap ? '讀取中…' : '讀取並畫出' }}
          </button>
          <div v-if="isTracingRefMap && drawLoadMsg" class="text-muted my-font-size-xs pb-2">{{ drawLoadMsg }}</div>
          <div v-if="leafletDrawSource" class="text-muted my-font-size-xs pb-3" style="line-height: 1.45">
            資料來源：{{ leafletDrawSource }}
          </div>

          <!-- 目前路線／站點統計 -->
          <div class="my-title-xs-gray pb-2">目前路線／站點</div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span>路線</span><span>{{ leafletDrawStats.routes }} 條</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #ff0000"
              ></span>
              connect（交點）
            </span>
            <span>{{ leafletDrawStats.connect }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-1">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #1565c0"
              ></span>
              terminal（端點）
            </span>
            <span>{{ leafletDrawStats.terminal }}</span>
          </div>
          <div class="d-flex justify-content-between my-font-size-xs pb-3">
            <span class="d-flex align-items-center">
              <span
                class="d-inline-block rounded-circle me-2"
                style="width: 10px; height: 10px; background-color: #000000"
              ></span>
              一般（黑點）
            </span>
            <span>{{ leafletDrawStats.black }}</span>
          </div>

          <!-- 各路線站點（依序：起點 → 終點） -->
          <div class="my-title-xs-gray pb-2">各路線站點（依序）</div>
          <div v-if="leafletDrawRouteList.length === 0" class="my-font-size-xs pb-3">
            尚未畫任何路線
          </div>
          <div v-for="route in leafletDrawRouteList" :key="route.routeIndex" class="pb-2">
            <div class="d-flex align-items-center my-font-size-xs pb-1">
              <span
                class="d-inline-block rounded-pill me-2"
                :style="{ width: '24px', height: '6px', backgroundColor: route.color }"
              ></span>
              {{ leafletRouteName(route.routeIndex) }}{{ route.closed ? '（封閉）' : '' }}（{{
                route.stations.length
              }}
              站）
            </div>
            <div class="ps-3">
              <div
                v-for="(st, si) in route.stations"
                :key="si"
                class="d-flex align-items-center my-font-size-xs pb-1"
              >
                <span class="me-2" style="min-width: 18px">{{ si + 1 }}.</span>
                <span
                  class="d-inline-block rounded-circle me-2"
                  :style="{
                    width: '8px',
                    height: '8px',
                    backgroundColor: leafletStationColor(st.type),
                  }"
                ></span>
                <span class="d-flex align-items-center">
                  {{ leafletStationLabel(st.type) }}
                  <template v-if="st.type === 'connect' && st.connectRoutes && st.connectRoutes.length">
                    <span class="ms-1 me-1">· 交會</span>
                    <span
                      v-for="ri in st.connectRoutes"
                      :key="ri"
                      class="d-flex align-items-center me-2"
                    >
                      <span
                        class="d-inline-block rounded-pill me-1"
                        :style="{ width: '16px', height: '5px', backgroundColor: leafletRouteColor(ri) }"
                      ></span>
                      {{ leafletRouteName(ri) }}
                    </span>
                  </template>
                </span>
              </div>
            </div>
          </div>
          <div class="pb-2"></div>

          <!-- 操作說明 -->
          <div class="my-title-xs-gray pb-2">操作說明</div>
          <template v-if="leafletDrawMode === 'line'">
            <div class="my-font-size-xs pb-1">點擊：新增節點</div>
            <div class="my-font-size-xs pb-1">雙擊／Enter：結束此線</div>
            <div class="my-font-size-xs pb-1">右鍵：封閉此線（接回起點）</div>
            <div class="my-font-size-xs pb-3">Esc：取消此線</div>
          </template>
          <template v-else-if="leafletDrawMode === 'point'">
            <div class="my-font-size-xs pb-3">點擊：在最近的路線上新增一個黑點</div>
          </template>
          <template v-else>
            <div class="my-font-size-xs pb-1">目前為瀏覽模式（不編輯），可自由拖曳地圖。</div>
            <div class="my-font-size-xs pb-3">按「畫線」開始繪製路線，或「畫黑點」新增站點。</div>
          </template>

        </div>

        <!-- 示意圖佈局 ①②③：輸入來源匯入 -->
        <div
          v-if="
            ['schematic_stroke', 'schematic_hillclimb', 'schematic_milp'].includes(layer.layerId)
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">輸入來源</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
            @click="importIntoSchematicLayer(layer.layerId, 'draw')"
          >
            從畫線匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue mb-2"
            @click="importIntoSchematicLayer(layer.layerId, 'osm')"
          >
            從 OSM／GeoJSON → JSON 匯入
          </button>
          <div class="text-muted" style="font-size: 11px; line-height: 1.45">
            匯入後按「執行」即以此來源排版；未匯入則沿用上游 OSM／GeoJSON → JSON。
          </div>
        </div>

        <!-- osm_2_geojson_2_json：本機 .osm／.geojson -->
        <div v-if="layer.layerId === OSM_2_GEOJSON_2_JSON_LAYER_ID" class="pb-3 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">OSM／GeoJSON 來源（本機檔）</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
            :disabled="layer.isLoading"
            @click="onTaipeiOsmSpaceGridPickLocalFileClick"
          >
            選擇本機 .osm 或 .geojson 並讀入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue mb-2"
            :disabled="layer.isLoading"
            @click="onTaipeiOsmSpaceGridLoadBundledTaipeiClick"
          >
            自動讀入 taipei/taipei.osm
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
            :disabled="layer.isLoading"
            @click="onImportLeafletDrawIntoOsmSpaceGridClick"
          >
            匯入畫線圖層內容
          </button>
          <div class="text-muted mb-3" style="font-size: 11px; line-height: 1.45">
            支援本機選 .osm（XML）或 .geojson／.json（<code class="small">Feature</code>／<code
              class="small"
              >FeatureCollection</code
            >）；無副檔名時若以 <code class="small">{</code>／<code class="small">[</code> 開頭則依
            GeoJSON 解析。無選檔時開啟圖層不會請求伺服器資料。
          </div>
          <div class="my-title-xs-gray pb-1">流程說明（本機選檔）</div>
          <ol class="my-font-size-xs text-muted mb-2 ps-3" style="line-height: 1.55">
            <li>
              <strong>讀檔</strong>：.osm 時以
              <code class="small">setOsm2GeojsonSessionOsmXml</code> 快取 OSM 字串；.geojson 時清空
              session，<code class="small">dataOSM</code> 由路網幾何產生簡易 XML。檔名寫入
              <code class="small">osmFileName</code>。
            </li>
            <li>
              <strong>→ GeoJSON + 表格 + 路段陣列</strong>：<code class="small"
                >osmXmlToOsm2GeojsonLoaderResult</code
              >
              或 <code class="small">parseGeoJsonTextToOsm2GeojsonLoaderResult</code>（<code
                class="small"
                >osm_2_geojson_2_json/pipeline.js</code
              >）。
            </li>
            <li>
              <strong>合併至圖層</strong>：<code class="small"
                >mergeOsm2GeojsonLoaderResultIntoLayer</code
              >
              （<code class="small">layerMerge.js</code>）更新
              <code class="small">geojsonData</code>／<code class="small">jsonData</code>／儀表等。
            </li>
            <li>
              <strong>持久化</strong>：<code class="small"
                >getOsm2GeojsonPersistPatchAfterLoaderMerge</code
              >
              →
              <code class="small">saveLayerState</code>
            </li>
          </ol>
        </div>

        <!-- JSON·網格·座標正規化 — 空間網絡網格 -->
        <div
          v-if="layer.layerId === 'json_grid_coord_normalized'"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">座標正規化</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-orange mb-2"
            :disabled="isExecuting || jsonGridCoordNormalizedPipelineOneClickRunning"
            @click="onJsonGridCoordNormalizedFullPipelineClick"
          >
            一鍵執行完（座標正規化 → 鄰線錯邊修正（若須）→ 刪空欄列）
          </button>
          <div class="text-muted mb-3" style="font-size: 10px; line-height: 1.45">
            等同依序按下本區塊內：「座標正規化」「修正」（僅在本拓撲比對允許時）「刪空欄列」；結束時以摘要對話框回報三步結果。
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue"
            @click="onJsonGridCoordNormalizeClick"
          >
            座標正規化（本層 dataJson／路網 → d3）
          </button>
          <div class="text-muted mt-2" style="font-size: 11px; line-height: 1.55">
            <strong>開啟本圖層</strong>會自動自「OSM／GeoJSON → JSON」複製
            <code class="small">dataJson</code>／<code class="small">geojsonData</code>。<br />
            按鈕一次完成本層 <strong>b→c→d</strong>（內含原有路線整形與
            <code class="small">buildTaipeiD3FromC3Network</code>）；成功後將 d3 路網經
            <code class="small">minimalOsmXmlFromLonLatFeatureCollection</code> 寫入本層
            <code class="small">dataOSM</code>。
          </div>
          <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.45">
            按下「修正」後的<strong>網格座標紀錄</strong>會存在本圖層；關閉或重開圖層後仍可顯示（與
            <code class="small">dashboardData</code> 分開保存，避免被「重開圖層」清空）。
          </div>
          <div
            v-if="jsonGridTopologyPanelShow(layer)"
            class="mt-2 rounded px-2 py-2"
            style="font-size: 11px; line-height: 1.5"
            :class="jsonGridTopologyCardToneClass(layer)"
          >
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
              <div>
                <strong>拓撲比對（c3 vs d3）</strong>
                <span class="text-muted ms-1" style="font-size: 10px"
                  >僅偵測點位移到「鄰線另一側」</span
                >
              </div>
              <button
                type="button"
                class="btn btn-sm rounded-pill border-0 text-nowrap my-font-size-xs my-cursor-pointer px-3"
                :class="
                  layer.dashboardData?.topologyCheck?.topologyPreserved &&
                  !jsonGridNeighborFixDisplayLines(layer).length
                    ? 'btn-success'
                    : 'my-btn-green'
                "
                style="min-height: 28px"
                :disabled="
                  isExecuting ||
                  !layer.dashboardData?.topologyCheck?.structMatch ||
                  !layer.dashboardData?.topologyCheck?.hasNeighborFlips
                "
                @click="onJsonGridNeighborTopologyFixClick"
              >
                修正
              </button>
            </div>
            <div
              v-if="
                layer.dashboardData?.topologyCheck && !layer.dashboardData.topologyCheck.skipped
              "
              class="mt-1"
            >
              {{ layer.dashboardData.topologyCheck.summaryZh }}
            </div>
            <div
              v-else-if="jsonGridNeighborFixDisplayLines(layer).length"
              class="mt-1 text-muted"
              style="font-size: 10px"
            >
              目前尚無本次工作階段的拓撲摘要（請先按「座標正規化」）；下方為先前「修正」所動到的<strong
                >網格座標（移動前 → 後）</strong
              >。
            </div>
            <div
              v-if="jsonGridNeighborFixDisplayLines(layer).length"
              class="mt-2 p-2 rounded border border-success border-opacity-50 bg-body text-body"
              style="font-size: 10.5px; white-space: pre-wrap; word-break: break-all"
            >
              <strong class="d-block mb-1 text-success">鄰線錯邊修正紀錄（網格座標）</strong>
              <span
                v-if="jsonGridNeighborFixStaleVisual(layer)"
                class="d-block text-muted mb-1"
                style="font-size: 10px"
              >
                曾執行「座標正規化」或重開圖層後，路網可能已重算；下列為最近一次成功套用「修正」時寫入的座標。
              </span>
              <div
                v-for="(ln, li) in jsonGridNeighborFixDisplayLines(layer)"
                :key="'fix-' + li"
                class="mb-1 pb-1"
                :class="
                  li < jsonGridNeighborFixDisplayLines(layer).length - 1
                    ? 'border-bottom border-secondary border-opacity-25'
                    : ''
                "
              >
                {{ ln }}
              </div>
            </div>
            <div
              v-if="layer.dashboardData?.topologyCheck?.reasons?.length"
              class="mt-1 mb-0 ps-2 text-body"
              style="font-size: 10.5px"
            >
              <div
                v-for="(r, idx) in layer.dashboardData.topologyCheck.reasons"
                :key="'top-reason-' + idx"
                class="mb-1 border-start border-2 ps-2"
                :class="
                  layer.dashboardData.topologyCheck.topologyPreserved
                    ? 'border-warning'
                    : 'border-danger'
                "
                style="white-space: pre-wrap; word-break: break-all"
              >
                {{ r }}
              </div>
            </div>
            <div
              v-if="
                layer.dashboardData?.topologyCheck && !layer.dashboardData.topologyCheck.skipped
              "
              class="mt-1 text-muted"
              style="font-size: 10px"
            >
              {{ layer.dashboardData.topologyCheck.statsCaptionZh }}
            </div>
            <div
              v-if="
                layer.dashboardData?.topologyCheck &&
                !layer.dashboardData.topologyCheck.skipped &&
                layer.dashboardData.topologyCheck.topologyPreserved &&
                !layer.dashboardData.topologyCheck.hasNeighborFlips
              "
              class="mt-2 text-muted border-top border-secondary border-opacity-25 pt-2"
              style="font-size: 10px; line-height: 1.45"
            >
              未偵測到錯邊時無法按下「修正」，也不會產生座標變更紀錄。若肉眼仍覺得站在鄰線另一側，可能是該點超出「近距離鄰線」掃描範圍，需手動調整或放寬演算法閾值。
            </div>
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mt-2"
            :disabled="isExecuting || !jsonGridPruneEmptyGridLinesEnabled(layer)"
            @click="onJsonGridPruneEmptyGridLinesClick"
          >
            刪空欄列（無 connect 之整欄／列 → 壓縮座標）
          </button>
          <div
            v-if="!jsonGridPruneEmptyGridLinesEnabled(layer)"
            class="text-muted mt-1"
            style="font-size: 10px; line-height: 1.45"
          >
            完成「座標正規化」並顯示上方拓撲比對後，即可刪除無 connect 之整欄／列。
          </div>
        </div>

        <!-- point_orthogonal：所有頂點列表 -->
        <div
          v-if="layer.layerId === POINT_ORTHOGONAL_LAYER_ID"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">所有頂點列表</div>
          <div class="d-flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer my-btn-green px-3"
              style="min-height: 28px"
              :disabled="
                jsonGridFromCoordNormalizedVertexList(layer).length === 0 ||
                jsonGridFromCoordVertexAutoActive ||
                jsonGridFromCoordVertexOneClickRunning
              "
              @click="advanceJsonGridFromCoordVertexHighlight"
            >
              下一頂點（示意圖 highlight）
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer my-btn-green px-3"
              style="min-height: 28px"
              :disabled="
                jsonGridFromCoordNormalizedVertexList(layer).length === 0 ||
                jsonGridFromCoordVertexAutoActive ||
                jsonGridFromCoordVertexOneClickRunning
              "
              @click="startJsonGridFromCoordVertexAuto"
            >
              自動（每秒一步）
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer btn-outline-secondary px-3"
              style="min-height: 28px"
              :disabled="!jsonGridFromCoordVertexAutoActive"
              @click="stopJsonGridFromCoordVertexAuto"
            >
              停止自動
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer my-btn-green px-3"
              style="min-height: 28px"
              :disabled="
                jsonGridFromCoordNormalizedVertexList(layer).length === 0 ||
                jsonGridFromCoordVertexAutoActive ||
                jsonGridFromCoordVertexOneClickRunning
              "
              @click="runJsonGridFromCoordVertexUntilStableNoUi"
            >
              一鍵完成（不顯示過程）
            </button>
          </div>
          <div class="text-muted mb-2" style="font-size: 10px; line-height: 1.45">
            手動：每按一次 highlight
            下一頂點（橘圈）；若該共點群組能往**上下左右四鄰格**之一平移且嚴格減少斜段權重、又不破壞共點／交叉／重疊／頂點落線，則平移並歸零；否則僅
            highlight。自動：每 1
            秒等同按一次「下一頂點」。一鍵完成：自列表頭反覆嘗試平移直至整輪無可改善，過程不更新橘圈／不重繪，結束後一次寫回；若原本已無可改善則會提示。
          </div>
          <div
            v-if="jsonGridFromCoordNormalizedVertexList(layer).length === 0"
            class="text-muted my-font-size-xs"
            style="line-height: 1.45"
          >
            尚無路網可列點。請開啟本圖層以自「座標正規化」複製 dataJson／geojson，或貼入
            <code class="small">spaceNetworkGridJsonData</code>。
          </div>
          <div
            v-else
            class="border rounded overflow-auto bg-body"
            style="max-height: 280px; font-size: 11px"
          >
            <table class="table table-sm table-bordered mb-0 align-middle">
              <thead class="sticky-top bg-secondary bg-opacity-10">
                <tr class="text-nowrap">
                  <th>#</th>
                  <th>路段序</th>
                  <th>頂點序</th>
                  <th>路線名</th>
                  <th>(x,y)</th>
                  <th>類型</th>
                  <th>標籤</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="it in jsonGridFromCoordNormalizedVertexList(layer)"
                  :key="'gcpt-' + it.row"
                >
                  <td>{{ it.row }}</td>
                  <td>{{ it.segIdx }}</td>
                  <td>{{ it.ptIdx }}</td>
                  <td class="text-break" style="max-width: 120px">{{ it.routeName }}</td>
                  <td class="text-nowrap">({{ it.x }}, {{ it.y }})</td>
                  <td>{{ it.role }}</td>
                  <td class="text-break" style="max-width: 140px">{{ it.label }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mt-2"
            :disabled="isExecuting || !jsonGridFromCoordPruneEmptyGridLinesEnabled(layer)"
            @click="onJsonGridFromCoordPruneEmptyGridLinesClick"
          >
            刪空欄列（無 connect 之整欄／列 → 壓縮座標）
          </button>
          <div
            v-if="!jsonGridFromCoordPruneEmptyGridLinesEnabled(layer)"
            class="text-muted mt-1"
            style="font-size: 10px; line-height: 1.45"
          >
            本層有路網（spaceNetworkGridJsonData）時即可刪除無 connect 之整欄／列並壓縮座標。
          </div>
        </div>

        <!-- 座標正規化·紅藍點列表（鏡像父層 dataJson）：僅 connect -->
        <div
          v-if="layer.layerId === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">connect 紅／藍點</div>
          <div class="text-muted mb-2" style="font-size: 10px; line-height: 1.45">
            與「座標正規化」同一路網來源（本層鏡像）。格點度數為相鄰折線段之端點連線數（與 K3 JSON
            connect 列表相同算法）：度數 ≤1
            為<strong>藍</strong>（末端），否則為<strong>紅</strong>（交叉）。
            <br />
            依列表序每次一點，一輪內每個 connect
            只試一次，輪完才從列表開頭再開新一輪。「自動」每秒走一步，直到<strong>整整一輪都沒有任何移動</strong>時自動停止。下一個：先橘圈；若有移動則灰圈＝移動前格、青圈＝移動後格、橘圈疊在新格（座標正規化／垂直化分頁亦顯示，紅藍層須開啟）。
          </div>
          <!-- 操作按鈕 -->
          <div class="d-flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer my-btn-green px-3"
              style="min-height: 28px"
              :disabled="
                coordNormalizedRedBlueConnectList(layer).length === 0 || rbConnectAutoActive
              "
              @click="advanceRbConnectHighlight"
            >
              下一個（highlight／移動）
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer my-btn-green px-3"
              style="min-height: 28px"
              :disabled="
                coordNormalizedRedBlueConnectList(layer).length === 0 || rbConnectAutoActive
              "
              @click="startRbConnectAuto"
            >
              自動（每秒；整輪無移動則停）
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer btn-outline-secondary px-3"
              style="min-height: 28px"
              :disabled="!rbConnectAutoActive"
              @click="stopRbConnectAuto"
            >
              停止自動
            </button>
          </div>
          <div
            v-if="coordNormalizedRedBlueConnectList(layer).length === 0"
            class="text-muted my-font-size-xs"
            style="line-height: 1.45"
          >
            尚無路網可列點。請開啟本圖層並確認父層「座標正規化」已有 dataJson／路網。
          </div>
          <div
            v-else
            class="border rounded overflow-auto bg-body"
            style="max-height: 280px; font-size: 11px"
          >
            <table class="table table-sm table-bordered mb-0 align-middle">
              <thead class="sticky-top bg-secondary bg-opacity-10">
                <tr class="text-nowrap">
                  <th>#</th>
                  <th>路段序</th>
                  <th>頂點序</th>
                  <th>路線（色）</th>
                  <th>色相</th>
                  <th>度數</th>
                  <th>(x,y)</th>
                  <th>標籤</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="it in coordNormalizedRedBlueConnectList(layer)"
                  :key="'rbconn-' + it.row + '-' + it.segIdx + '-' + it.ptIdx"
                  :class="{
                    'table-warning':
                      Array.isArray(layer.highlightedSegmentIndex) &&
                      layer.highlightedSegmentIndex[0] === it.segIdx &&
                      layer.highlightedSegmentIndex[1] === it.ptIdx,
                    'table-success':
                      Array.isArray(layer.rbConnectVisitedKeys) &&
                      layer.rbConnectVisitedKeys.includes(`${it.segIdx},${it.ptIdx}`) &&
                      !(
                        Array.isArray(layer.highlightedSegmentIndex) &&
                        layer.highlightedSegmentIndex[0] === it.segIdx &&
                        layer.highlightedSegmentIndex[1] === it.ptIdx
                      ),
                  }"
                >
                  <td>{{ it.row }}</td>
                  <td>{{ it.segIdx }}</td>
                  <td>{{ it.ptIdx }}</td>
                  <td class="text-break" style="max-width: 140px">{{ it.routeLabel }}</td>
                  <td>{{ it.hue }}</td>
                  <td>{{ it.deg }}</td>
                  <td class="text-nowrap">({{ it.x }}, {{ it.y }})</td>
                  <td class="text-break" style="max-width: 160px">{{ it.label }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <LayoutNetworkGridFromVhDrawControlTabSection
          :layer="layer"
          :is-executing="isExecuting"
          :api="layoutNetworkGridFromVhDrawControlTabApi"
        />
        <OrthogonalVhDrawControlTabSection
          :layer="layer"
          :is-executing="isExecuting"
          :api="orthogonalVhDrawControlTabApi"
        />


        <!-- 往中心聚集（列→欄 或 欄→列）：各列／欄 HV 線段（表格：站名＋座標） -->
        <div
          v-if="LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS_ALL.includes(layer.layerId)"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">各列（y）／各欄（x）：點或線</div>
          <template
            v-for="loReport in [jsonGridLineOrthogonalRowColPointOrLineReport(layer)]"
            :key="
              'lo-temp-axis-' +
              layer.layerId +
              '-' +
              (lineOrthoTowardCrossUiFor(layer)?.tableBump ?? 0) +
              '-' +
              loReport.rowTable.length +
              '-' +
              loReport.colTable.length
            "
          >
            <div
              v-if="loReport.rowTable.length === 0 && loReport.colTable.length === 0"
              class="text-muted my-font-size-xs"
              style="line-height: 1.45"
            >
              尚無可分類之資料。請開啟本圖層並確認已有路網（或已自「座標正規化」鏡像 dataJson）。
            </div>
            <template v-else>
              <div class="text-muted mb-2" style="font-size: 10px; line-height: 1.45">
                僅統計<strong>水平、垂直線段</strong>（斜線略過）。<strong
                  >紅十字／yΔ／xΔ 基準格</strong
                >：未鎖定時為全路網頂點包圍盒中點；第一次「朝紅十字縮進」會<strong>鎖定</strong>該格，之後不因路網位移而漂移（與網格線座標基準一致）。縮進為<strong>整格共點平移</strong>並受硬約束，不會任意斷邊；每次按鈕<strong>最多移一格</strong>（且不移動後降低水平／垂直邊數）。列出順序：
                <strong>0 → +1 → −1 → +2 → −2 → …</strong>。<strong>yΔ／xΔ</strong>
                為相對<strong>該</strong>基準格之<strong>網格列／欄距</strong>（非重新編號）。
                <strong
                  >單鍵／自動循環處理順序：{{ lineOrthoTowardCrossCycleLongLabel(layer) }}</strong
                >（下方兩表仍「先列後欄」僅為閱讀排版）。
                <template v-if="loReport.centerCx != null && loReport.centerCy != null">
                  目前基準格座標（約）為 ({{ loReport.centerCx }}, {{ loReport.centerCy }})。
                </template>
              </div>
              <template
                v-for="loSummary in [lineOrthoTowardCrossReasonSummary(layer)]"
                :key="'lo-summary-' + (loSummary ? loSummary.total + '-' + loSummary.movable : 'none')"
              >
                <div
                  v-if="loSummary"
                  class="border rounded px-2 py-1 mb-2"
                  :class="loSummary.movable > 0 ? 'border-success bg-success bg-opacity-10' : 'border-danger bg-danger bg-opacity-10'"
                  style="font-size: 10px; line-height: 1.5; white-space: pre-wrap"
                >
                  <div
                    v-if="loSummary.current"
                    class="mb-1 pb-1 border-bottom"
                    :class="loSummary.current.ok ? 'text-success' : 'text-danger'"
                  >
                    <span class="fw-semibold">目前這筆（橘標）：</span>{{ loSummary.current.label }}
                    <br />
                    <span class="fw-semibold">{{
                      loSummary.current.ok ? '可移動：' : '不能移動：'
                    }}</span
                    >{{ loSummary.current.text }}
                  </div>
                  <div class="fw-semibold mb-1">
                    可移動 {{ loSummary.movable }} 筆 / 共 {{ loSummary.total }} 筆（被擋
                    {{ loSummary.blocked }} 筆）{{
                      loSummary.movable === 0 ? '— 全被擋' : ''
                    }}
                  </div>
                  <div v-for="(ln, li) in loSummary.lines" :key="'lo-sum-ln-' + li">{{ ln }}</div>
                </div>
              </template>
              <button
                type="button"
                class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
                :disabled="
                  isExecuting ||
                  lineOrthoTowardCrossQueueLength(layer) === 0 ||
                  lineOrthoTowardCrossUiFor(layer)?.autoActive ||
                  lineOrthoTowardCrossUiFor(layer)?.oneClickRunning
                "
                @click="onLineOrthoTowardCrossStepClick(layer)"
              >
                朝紅十字縮進至頂（順序：{{
                  lineOrthoTowardCrossCycleLongLabel(layer)
                }}，循環）；當項以橘線／橘圈標示。
              </button>
              <button
                type="button"
                class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-orange mb-2"
                :disabled="
                  isExecuting ||
                  lineOrthoTowardCrossQueueLength(layer) === 0 ||
                  lineOrthoTowardCrossUiFor(layer)?.oneClickRunning
                "
                @click="toggleLineOrthoTowardCrossAuto(layer)"
              >
                {{
                  lineOrthoTowardCrossUiFor(layer)?.autoActive
                    ? '停止自動（每秒一次縮進）'
                    : '自動執行：先嘗試將 hub 紅 connect－末端藍 connect 斜鄰段改橫／直（僅開啟自動時首輪一次），之後每秒仿單鍵縮進'
                }}
              </button>
              <button
                type="button"
                class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue mb-2"
                :disabled="
                  isExecuting ||
                  lineOrthoTowardCrossQueueLength(layer) === 0 ||
                  lineOrthoTowardCrossUiFor(layer)?.autoActive ||
                  lineOrthoTowardCrossUiFor(layer)?.oneClickRunning
                "
                @click="onLineOrthoTowardCrossFinishAllClick(layer)"
              >
                一鍵完成：開頭先嘗試將 hub 紅 connect－末端藍 connect
                斜鄰段改橫／直（僅批次首輪一次），再反覆縮進至「一整輪隊列皆無可改善」為止並於下方顯示彙總
              </button>
              <button
                type="button"
                class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-primary mb-2"
                :disabled="
                  isExecuting || lineOrthoTowardCenterJsonViewerMirrorPayload(layer) == null
                "
                @click="downloadLineOrthoTowardCenterRoutesJson(layer)"
              >
                下載 JSON（與 Upper「json-viewer」相同內容）
              </button>
              <div
                class="border rounded bg-body px-2 py-1 mb-2 text-secondary"
                style="font-size: 10px; line-height: 1.5"
              >
                {{ jsonGridLineOrthogonalHVEdgeRatioLabel(layer) }}
              </div>
              <div
                v-if="lineOrthoTowardCrossUiFor(layer)?.lastHint"
                class="text-muted mb-2"
                style="font-size: 10px; line-height: 1.45; white-space: pre-wrap"
              >
                {{ lineOrthoTowardCrossUiFor(layer).lastHint }}
              </div>
              <template
                v-for="loReasons in [lineOrthoTowardCrossReasonsFor(layer)]"
                :key="'lo-reasons-' + loReasons.row.length + '-' + loReasons.col.length"
              >
                <div class="small text-secondary mb-1">
                  列（row／離紅線 y）<span class="text-muted">— 「原因」欄為試算結果，不會更動圖層</span>
                </div>
                <div
                  class="border rounded overflow-auto bg-body mb-3"
                  style="max-height: 260px; font-size: 11px"
                >
                  <table class="table table-sm table-bordered mb-0 align-middle">
                    <thead class="sticky-top bg-secondary bg-opacity-10">
                      <tr class="text-nowrap">
                        <th>yΔ</th>
                        <th>網格 y</th>
                        <th>型</th>
                        <th>路線名</th>
                        <th>站名（起）</th>
                        <th>座標（起）</th>
                        <th>站名（迄）</th>
                        <th>座標（迄）</th>
                        <th>原因（可否移動）</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template
                        v-for="(it, ri) in loReport.rowTable"
                        :key="'lo-row-w-' + ri + '-' + it.kind"
                      >
                        <tr>
                          <td class="text-nowrap fw-semibold">{{ it.deltaYLabel }}</td>
                          <td class="text-nowrap text-muted">{{ it.axisY }}</td>
                          <td class="text-nowrap">{{ it.kind }}</td>
                          <td class="text-break" style="max-width: 100px">{{ it.routeName }}</td>
                          <td class="text-break" style="max-width: 120px">{{ it.startStation }}</td>
                          <td class="text-nowrap">{{ it.startCoord }}</td>
                          <td class="text-break" style="max-width: 120px">{{ it.endStation }}</td>
                          <td class="text-nowrap">{{ it.endCoord }}</td>
                          <td
                            class="text-break"
                            style="max-width: 160px"
                            :class="loReasons.row[ri]?.ok ? 'text-success' : 'text-danger'"
                          >
                            {{ loReasons.row[ri]?.text ?? '—' }}
                          </td>
                        </tr>
                        <tr v-if="it.kind === '線' && it.orthoHlNote" class="table-light">
                          <td
                            colspan="9"
                            class="small text-muted"
                            style="border-top: 0; white-space: pre-wrap"
                          >
                            {{ it.orthoHlNote }}
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
                <div class="small text-secondary mb-1">欄（col／離紅線 x）</div>
                <div
                  class="border rounded overflow-auto bg-body"
                  style="max-height: 260px; font-size: 11px"
                >
                  <table class="table table-sm table-bordered mb-0 align-middle">
                    <thead class="sticky-top bg-secondary bg-opacity-10">
                      <tr class="text-nowrap">
                        <th>xΔ</th>
                        <th>網格 x</th>
                        <th>型</th>
                        <th>路線名</th>
                        <th>站名（起）</th>
                        <th>座標（起）</th>
                        <th>站名（迄）</th>
                        <th>座標（迄）</th>
                        <th>原因（可否移動）</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template
                        v-for="(it, ci) in loReport.colTable"
                        :key="'lo-col-w-' + ci + '-' + it.kind"
                      >
                        <tr>
                          <td class="text-nowrap fw-semibold">{{ it.deltaXLabel }}</td>
                          <td class="text-nowrap text-muted">{{ it.axisX }}</td>
                          <td class="text-nowrap">{{ it.kind }}</td>
                          <td class="text-break" style="max-width: 100px">{{ it.routeName }}</td>
                          <td class="text-break" style="max-width: 120px">{{ it.startStation }}</td>
                          <td class="text-nowrap">{{ it.startCoord }}</td>
                          <td class="text-break" style="max-width: 120px">{{ it.endStation }}</td>
                          <td class="text-nowrap">{{ it.endCoord }}</td>
                          <td
                            class="text-break"
                            style="max-width: 160px"
                            :class="loReasons.col[ci]?.ok ? 'text-success' : 'text-danger'"
                          >
                            {{ loReasons.col[ci]?.text ?? '—' }}
                          </td>
                        </tr>
                        <tr v-if="it.kind === '線' && it.orthoHlNote" class="table-light">
                          <td
                            colspan="9"
                            class="small text-muted"
                            style="border-top: 0; white-space: pre-wrap"
                          >
                            {{ it.orthoHlNote }}
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </template>
            </template>
          </template>
        </div>

        <!-- 紅／藍 connect 拉直（移 1 格使水平／垂直路線變多） -->
        <div
          v-if="layer.layerId === CONNECT_STRAIGHTEN_HV_LAYER_ID"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">紅／藍 connect 拉直</div>
          <div class="text-muted my-font-size-xs mb-2">
            自上游「站點與路線往中心聚集（先橫後直）」鏡像路網副本（本圖層尚無資料時自動載入）；逐一檢查
            connect 端點，凡移 1 格能讓水平／垂直路線變多（HV 邊數嚴格增加且通過硬約束）即移動。
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
            :disabled="isExecuting || connectStraightenAutoActive"
            @click="advanceConnectStraighten"
          >
            單點：下一個 connect（highlight／移動）
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-orange mb-2"
            :disabled="isExecuting"
            @click="
              connectStraightenAutoActive
                ? stopConnectStraightenAuto()
                : startConnectStraightenAuto()
            "
          >
            {{
              connectStraightenAutoActive
                ? '停止自動'
                : '自動（每秒一次；整輪無移動則停）'
            }}
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue mb-2"
            :disabled="isExecuting || connectStraightenAutoActive"
            @click="finishConnectStraightenAll"
          >
            一鍵完成：掃所有 connect，反覆移動至整輪無可改善
          </button>
          <div class="d-flex gap-2">
            <button
              type="button"
              class="btn rounded-pill border my-font-size-xs text-nowrap flex-fill my-cursor-pointer btn-outline-secondary mb-2"
              :disabled="isExecuting || connectStraightenAutoActive"
              @click="pickConnectStraightenLocalJsonClick"
            >
              匯入 JSON 檔（覆寫本層路網）
            </button>
            <button
              type="button"
              class="btn rounded-pill border my-font-size-xs text-nowrap flex-fill my-cursor-pointer btn-outline-secondary mb-2"
              :disabled="isExecuting || connectStraightenAutoActive"
              @click="resyncConnectStraightenFromUpstream"
            >
              重新自上游同步
            </button>
          </div>
          <input
            :id="CONNECT_STRAIGHTEN_LOCAL_JSON_INPUT_ID"
            type="file"
            accept=".json,application/json"
            class="d-none"
            @change="onConnectStraightenLocalJsonInputChange"
          />
          <div v-if="resolveConnectStraightenLayer()?.jsonFileName" class="text-muted my-font-size-xs">
            目前來源檔：{{ resolveConnectStraightenLayer()?.jsonFileName }}
          </div>
        </div>

        <div v-if="isCurrentLayerGridSchematic" class="pb-3 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">網格預覽</div>
          <div class="d-flex justify-content-center">
            <div
              class="border border-secondary rounded"
              style="background-color: #212121; padding: 8px"
            >
              <svg
                :width="previewGridSize + 40"
                :height="previewGridSize + 40"
                class="border border-dark"
              >
                <!-- 定義偏移量，為標籤預留空間 -->
                <defs>
                  <g id="grid-container" transform="translate(20, 20)">
                    <!-- 繪製網格線 -->
                    <g v-for="i in getOriginalGridDimensions().gridX + 1" :key="'col-' + i">
                      <line
                        :x1="(i - 1) * (previewGridSize / getOriginalGridDimensions().gridX)"
                        :y1="0"
                        :x2="(i - 1) * (previewGridSize / getOriginalGridDimensions().gridX)"
                        :y2="previewGridSize"
                        stroke="#666"
                        stroke-width="0.5"
                      />
                    </g>
                    <g v-for="i in getOriginalGridDimensions().gridY + 1" :key="'row-' + i">
                      <line
                        :x1="0"
                        :y1="(i - 1) * (previewGridSize / getOriginalGridDimensions().gridY)"
                        :x2="previewGridSize"
                        :y2="(i - 1) * (previewGridSize / getOriginalGridDimensions().gridY)"
                        stroke="#666"
                        stroke-width="0.5"
                      />
                    </g>

                    <!-- 繪製節點數值文字 -->
                    <text
                      v-for="node in getPreviewNodes()"
                      :key="'text-' + node.x + '-' + node.y"
                      :x="getNodeX(node.x)"
                      :y="getNodeY(node.y)"
                      text-anchor="middle"
                      dominant-baseline="middle"
                      font-size="8"
                      font-weight="bold"
                      fill="#FFFFFF"
                    >
                      {{ node.value }}
                    </text>
                  </g>
                </defs>

                <!-- 使用定義的網格容器 -->
                <use href="#grid-container" />

                <!-- 繪製列最大值標籤 -->
                <text
                  v-for="(maxVal, index) in getColumnMaxValues()"
                  :key="'col-max-' + index"
                  :x="20 + (index + 0.5) * (previewGridSize / getOriginalGridDimensions().gridX)"
                  y="15"
                  text-anchor="middle"
                  dominant-baseline="bottom"
                  font-size="8"
                  font-weight="bold"
                  fill="#4CAF50"
                >
                  {{ maxVal }}
                </text>

                <!-- 繪製行最大值標籤 -->
                <text
                  v-for="(maxVal, index) in getRowMaxValues()"
                  :key="'row-max-' + index"
                  x="15"
                  :y="20 + (index + 0.5) * (previewGridSize / getOriginalGridDimensions().gridY)"
                  text-anchor="end"
                  dominant-baseline="middle"
                  font-size="8"
                  font-weight="bold"
                  fill="#4CAF50"
                >
                  {{ maxVal }}
                </text>
              </svg>
            </div>
          </div>
          <div class="text-center mt-2">
            <small class="text-muted">
              {{ getOriginalGridDimensions().gridX }} ×
              {{ getOriginalGridDimensions().gridY }} 原始網格
            </small>
          </div>
        </div>

        <!-- 執行中提示 -->
        <div v-if="isExecuting" class="pb-2 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">計算中...</div>
          <div class="d-flex justify-content-center">
            <div class="spinner-border spinner-border-sm" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        </div>

        <!-- 執行按鈕區域 -->
        <div v-if="canExecuteLayer && currentLayer" class="pb-3 mb-3 border-bottom">
          <button
            v-if="currentLayer"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="onControlExecuteNextClick"
            :disabled="controlExecuteNextDisabled"
          >
            {{ currentLayer && currentLayer.layerId === 'schematic_milp_read' ? '座標正規化' : '執行下一步' }}
          </button>
        </div>

        <!-- MILP結果正規化：匯入下載的 MILP 結果 JSON 檔並做座標正規化 -->
        <div
          v-if="layer.layerId === 'schematic_milp_read'"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">匯入 JSON（下載的 MILP 結果）並正規化</div>
          <label
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-0"
          >
            匯入 JSON 檔（正規化）
            <input
              type="file"
              accept=".json,application/json"
              class="d-none"
              @change="onLoadMilpJsonFile($event)"
            />
          </label>
          <div class="my-title-xs-gray pt-2 pb-1">從示意圖佈局匯入排版結果</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpRead('schematic_stroke')"
          >
            從示意圖佈局①（Stroke-based）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-teal my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpRead('schematic_hillclimb')"
          >
            從示意圖佈局②（Hill Climbing）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpRead('schematic_milp')"
          >
            從示意圖佈局③（MILP）匯入
          </button>
          <div class="my-title-xs-gray pt-1" style="line-height: 1.3">
            匯入只顯示原始；按「座標正規化」才正規化。未匯入時，「座標正規化」會直接讀記憶體中的 ③ MILP 結果。後續步驟（往中心聚集 先橫後直／先直後橫、connect 拉直）在下方各圖層。
          </div>
        </div>

        <!-- 路線正規化（RMA）：座標正規化 + 匯入下載的 MILP 結果 JSON / 從①②③（RMA）匯入 -->
        <div
          v-if="layer.layerId === 'schematic_rma_milp_read'"
          class="pb-3 mb-3 border-bottom"
        >
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :disabled="isExecuting"
            @click="executeLayerFunction"
          >
            {{ isExecuting ? '計算中…' : '座標正規化' }}
          </button>
          <div class="my-title-xs-gray pb-2">匯入 JSON（下載的 MILP 結果）</div>
          <label
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-0"
          >
            匯入 JSON 檔
            <input
              type="file"
              accept=".json,application/json"
              class="d-none"
              @change="onLoadMilpJsonFileRma($event)"
            />
          </label>
          <div class="my-title-xs-gray pt-2 pb-1">從示意圖佈局（RMA）匯入排版結果</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_stroke')"
          >
            從①（Stroke-based）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-teal my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_hillclimb')"
          >
            從②（Hill Climbing）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_milp')"
          >
            從③（MILP）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_force')"
          >
            從④（Force-directed）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_wangchi')"
          >
            從⑤（Least-Squares）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_bast')"
          >
            從⑥（Octilinear Grid）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_merrick')"
          >
            從⑦（Path Simplification）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_sat')"
          >
            從⑧（SAT）匯入
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-lime my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="importLayoutResultIntoMilpReadRma('schematic_rma_normalize')"
          >
            從⑨（正規化）匯入
          </button>
          <div class="my-title-xs-gray pt-1" style="line-height: 1.3">
            匯入只顯示原始；按「座標正規化」才正規化。未匯入時，「座標正規化」會直接讀記憶體中的 ③ MILP（RMA）結果。後續步驟（往中心聚集 先橫後直／先直後橫）在下方各圖層。
          </div>
        </div>

        <!-- connect 拉直：自「MILP結果正規化」移入結果，於此做紅/藍 connect 拉直（一鍵＋逐點除錯） -->
        <div
          v-if="layer.layerId === 'schematic_milp_straighten'"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2" style="line-height: 1.3">
            本層會自動抓上游「往中心聚集（先直後橫）」目前結果顯示；直接做 connect 拉直即可（「執行下一步」可重新抓取上游）。
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            :disabled="!(layer.spaceNetworkGridJsonData && layer.spaceNetworkGridJsonData.length)"
            @click="onMilpReadConnectStraighten(layer)"
          >
            紅／藍 connect 拉直（一鍵完成）
          </button>
          <div class="my-title-xs-gray pt-1" style="line-height: 1.3">
            一鍵把所有 connect 拉直到不動點（最多移 1 格；水平／垂直線變多、或總長縮短且 H/V 不變少）。
          </div>

          <!-- 逐點除錯：每按一次 highlight 一個紅/藍點，並移動或顯示不移動的原因 -->
          <div class="my-title-xs-gray pt-3 pb-1">逐點除錯（看為何不移動）</div>
          <div class="d-flex gap-2">
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap flex-fill my-cursor-pointer"
              :disabled="!(layer.spaceNetworkGridJsonData && layer.spaceNetworkGridJsonData.length)"
              @click="advanceMilpReadConnectStraighten(layer)"
            >
              下一個 connect ▶
            </button>
            <button
              type="button"
              class="btn rounded-pill border-0 my-btn-white my-font-size-xs text-nowrap my-cursor-pointer"
              @click="resetMilpReadStep(layer)"
            >
              重置
            </button>
          </div>
          <div
            v-if="milpReadStepInfo"
            class="my-font-size-xs pt-2"
            style="line-height: 1.4; word-break: break-all"
            :class="milpReadStepInfo.includes('✓') ? 'text-success' : 'text-danger'"
          >
            {{ milpReadStepInfo }}
          </div>
          <div class="my-title-xs-gray pt-1" style="line-height: 1.3">
            橘圈＝目前評估之點；灰圈＝移動前格、青圈＝移動後格。
          </div>
        </div>

        <!-- 示意圖佈局（#1/#2/#3 與 MILP結果正規化）：下載目前 JSON 結果 -->
        <div
          v-if="layer.layerId && layer.layerId.startsWith('schematic_')"
          class="pb-3 mb-3 border-bottom"
        >
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            :disabled="!(layer.spaceNetworkGridJsonData && layer.spaceNetworkGridJsonData.length)"
            @click="onDownloadSchematicJson(layer)"
          >
            下載目前 JSON
          </button>
          <div class="my-title-xs-gray pt-1" style="line-height: 1.3">
            下載此圖層目前的 spaceNetworkGridJsonData（需先執行/匯入產生結果）。
          </div>
        </div>

        <!-- 路網測試圖層：各圖層分頁獨立 — 正方形網格（開關樣式同圖層／taipei_g） -->
        <div v-if="isTaipeiTest3BcdeLayerTab(layer.layerId)" class="pb-3 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">網格比例（版面／路網）</div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black text-wrap pe-2" style="max-width: 62%">
              正方形（依寬高取 min）
            </div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                :id="'switch-sqgrid-test3-' + layer.layerId"
                :checked="layer.squareGridCellsTaipeiTest3 === true"
                @change="setSquareGridCellsTaipeiTest3(layer, $event.target.checked)"
              />
              <label :for="'switch-sqgrid-test3-' + layer.layerId"></label>
            </div>
          </div>
          <div class="my-title-xs-gray" style="font-size: 11px">關閉＝預設（網格充滿繪區）</div>
        </div>

        <!-- taipei_d3：正規化網格長寬、四分樹或 Grid Unit、最近兩點（c3 座標） -->
        <div
          v-if="taipeiD3CoordNormalizeReport && currentLayer"
          class="pb-3 mb-3 border-bottom"
          style="font-size: 11px; line-height: 1.55"
        >
          <div class="my-title-xs-gray pb-2">座標正規化結果</div>
          <div class="text-muted mb-1">
            正規化格索引包圍盒（寬×高）：
            <strong class="text-dark"
              >{{ taipeiD3CoordNormalizeReport.gridSizeCells.width }} ×
              {{ taipeiD3CoordNormalizeReport.gridSizeCells.height }}</strong
            >
            格
          </div>
          <div class="text-muted mb-1">
            邊界換算佔格（參考）：
            {{ taipeiD3CoordNormalizeReport.gridSizeCells.byBoundsWidth }} ×
            {{ taipeiD3CoordNormalizeReport.gridSizeCells.byBoundsHeight }}
          </div>
          <div v-if="taipeiD3CoordNormalizeReport.gridUnit != null" class="text-muted mb-1">
            Grid Unit（作為 1 格之最近兩點距離）：
            <strong class="text-dark">{{ taipeiD3CoordNormalizeReport.gridUnit }}</strong>
          </div>
          <div v-else-if="taipeiD3CoordNormalizeReport.quadtree" class="text-muted mb-1">
            四分樹正規化：葉
            <strong class="text-dark">{{ taipeiD3CoordNormalizeReport.quadtree.leafCount }}</strong>
            、最深
            <strong class="text-dark">{{ taipeiD3CoordNormalizeReport.quadtree.maxDepth }}</strong>
            ；相異紅點座標
            <strong class="text-dark">{{
              taipeiD3CoordNormalizeReport.quadtree.uniqueRedPointCount
            }}</strong>
            （原始紅點頂
            {{ taipeiD3CoordNormalizeReport.quadtree.rawConnectCoordCount }}）；邊界帶寬×高
            <strong class="text-dark"
              >{{ taipeiD3CoordNormalizeReport.quadtree.boundaryStripsX }} ×
              {{ taipeiD3CoordNormalizeReport.quadtree.boundaryStripsY }}</strong
            >
            ；最小葉寬×高（c3 度）
            <strong class="text-dark"
              >{{ taipeiD3CoordNormalizeReport.quadtree.minLeafWidth }} ×
              {{ taipeiD3CoordNormalizeReport.quadtree.minLeafHeight }}</strong
            >
          </div>
          <template v-if="taipeiD3CoordNormalizeReport.nearestPairSource">
            <div class="text-muted mb-0">
              最近兩點（c3 路網座標）、距離
              {{ taipeiD3CoordNormalizeReport.nearestPairSource.distance }}：<br />
              <span class="text-dark text-break"
                >A
                <span v-if="taipeiD3CoordNormalizeReport.nearestPairSource.stationNameA">
                  {{ taipeiD3CoordNormalizeReport.nearestPairSource.stationNameA }}
                </span>
                （{{ taipeiD3CoordNormalizeReport.nearestPairSource.pointA?.join(', ') }}）</span
              ><br />
              <span class="text-dark text-break"
                >B
                <span v-if="taipeiD3CoordNormalizeReport.nearestPairSource.stationNameB">
                  {{ taipeiD3CoordNormalizeReport.nearestPairSource.stationNameB }}
                </span>
                （{{ taipeiD3CoordNormalizeReport.nearestPairSource.pointB?.join(', ') }}）</span
              >
            </div>
          </template>
        </div>

        <!-- 各圖層：路段車站節點（不含純轉折頂點） -->
        <div
          v-if="layerSegmentStationNodesReport"
          class="pb-3 mb-3 border-bottom"
          style="font-size: 11px; line-height: 1.6"
        >
          <div class="my-title-xs-gray pb-2">
            路段車站節點 — {{ layerSegmentStationNodesReport.layerName }}（{{
              layerSegmentStationNodesReport.segments.length
            }}
            段／扁平 {{ layerSegmentStationNodesReport.flatSegmentCount }} 段）
          </div>
          <div v-if="layerSegmentStationNodesReport.notLoaded" class="text-muted small mb-0">
            圖層尚未載入，尚無路段車站節點可列。
          </div>
          <div
            v-else-if="layerSegmentStationNodesReport.noSpaceNetwork"
            class="text-muted small mb-0"
          >
            本圖層尚未有 <code class="small">spaceNetworkGridJsonData</code>，無路段可列。
          </div>
          <template v-else>
            <div class="text-muted small mb-2" style="line-height: 1.45">
              依 <code class="small">spaceNetworkGridJsonData</code> 展平後順序；各段車站點與
              <code class="small">flatSegmentsToGeojsonStyleExportRows</code>／
              <code class="small">processedJsonData.segment</code> 一致（起迄含
              <code class="small">properties_start</code>／<code class="small">properties_end</code
              >）。頂點少於 2 之段改掃 <code class="small">nodes</code>；僅列至少一個車站點之路段。
            </div>
            <div
              v-if="currentLayer?.layerId === 'taipei_h3'"
              class="text-muted small mb-2"
              style="line-height: 1.45"
            >
              taipei_h3：路段編號與 taipei_a3 匯出列序號未必相同（g3 於交叉點切段）；各段下方可對照
              a3。
            </div>
            <div
              v-if="layerSegmentStationNodesReport.segments.length === 0"
              class="text-muted small mb-0"
            >
              本圖層共
              {{ layerSegmentStationNodesReport.flatSegmentCount }}
              條扁平折線，皆無可列出之車站節點。
            </div>
            <div
              v-for="seg in layerSegmentStationNodesReport.segments"
              :key="seg.segIdx"
              class="mb-3"
            >
              <div class="fw-semibold text-dark mb-1" style="font-size: 11px">
                {{ seg.routeName }} · 路段 #{{ seg.segIdx }}（{{ seg.stationNodes.length }} 車站點）
              </div>
              <template v-if="currentLayer?.layerId === 'taipei_h3'">
                <div
                  v-if="seg.a3Correspondence"
                  class="text-muted small mb-1"
                  style="line-height: 1.45"
                >
                  對應 taipei_a3 匯出：{{ seg.a3Correspondence.summary
                  }}<span v-if="seg.a3Correspondence.midCount > 0">
                    · 中段站 {{ seg.a3Correspondence.midCount }} 個</span
                  >
                  <span v-if="seg.a3Correspondence.midLabels?.length" class="d-block mt-1">
                    a3 中段：{{ seg.a3Correspondence.midLabels.join('、') }}
                  </span>
                </div>
                <div v-else class="text-muted small mb-1" style="line-height: 1.45">
                  無 taipei_a3 匯出列與此段對應（切段或起迄與 a3 列不一致時會發生）。
                </div>
              </template>
              <div
                v-for="n in seg.stationNodes"
                :key="`${seg.segIdx}-${n.idx}`"
                class="d-flex gap-2"
                style="font-size: 10px; font-family: monospace"
              >
                <span class="text-muted">[{{ n.idx }}]</span>
                <span class="text-dark">({{ n.x }}, {{ n.y }})</span>
                <span v-if="n.stationName" class="text-dark">
                  {{ n.stationName
                  }}<span v-if="n.stationId" class="text-muted">（{{ n.stationId }}）</span>
                </span>
                <span :class="n.nodeType === 'connect' ? 'text-danger' : 'text-secondary'">{{
                  n.nodeType
                }}</span>
              </div>
            </div>
          </template>
        </div>

        <!-- taipei_e3：connect 相鄰連線，離散角：水平／垂直＝0°，斜向＝45° -->
        <div
          v-if="taipeiE3RedBluePairsAngleReport && currentLayer?.layerId === 'taipei_e3'"
          class="pb-3 mb-3 border-bottom"
          style="font-size: 11px; line-height: 1.5"
        >
          <div class="my-title-xs-gray pb-2">
            紅／藍 connect 相鄰連線（水平／垂直＝0°，斜向＝45°）
          </div>
          <div class="text-muted mb-2" style="font-size: 10px">
            僅統計<strong>路段折線上相鄰兩頂點</strong>且<strong>兩端皆為 connect</strong
            >之邊（無向邊只列一次）。紅＝路網 degree≥2，藍＝degree≤1。<strong
              >水平與垂直皆標為 0°</strong
            >；<strong>左上–右下、右上–左下等斜向</strong>（|Δx|、|Δy| 皆 &gt;0）<strong
              >皆標為 45°</strong
            >。路網僅此兩類時，角度必為 0° 或 45°。起點／終點依格鍵排序（與幾何走向無關）。
          </div>
          <div v-if="taipeiE3RedBluePairsAngleReport.points.length < 2" class="text-muted mb-0">
            需至少兩個 connect 格點才可能出現 connect–connect 連線。
          </div>
          <template v-else>
            <div class="text-muted mb-1">
              connect 點數：<strong class="text-dark">{{
                taipeiE3RedBluePairsAngleReport.points.length
              }}</strong>
              ；<strong>相鄰 connect–connect 連線</strong>：<strong class="text-dark">{{
                taipeiE3RedBluePairsAngleReport.rows.length
              }}</strong>
            </div>
            <div v-if="taipeiE3RedBluePairsAngleReport.rows.length === 0" class="text-muted mb-0">
              尚無 connect–connect 相鄰邊。
            </div>
            <div v-else class="table-responsive">
              <table class="table table-sm table-bordered mb-0" style="font-size: 11px">
                <thead class="table-light">
                  <tr>
                    <th scope="col" class="text-nowrap">#</th>
                    <th scope="col" class="text-nowrap">角度°</th>
                    <th scope="col" class="text-nowrap">起點</th>
                    <th scope="col" class="text-nowrap">終點</th>
                    <th scope="col" class="text-nowrap">Δx,Δy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in taipeiE3RedBluePairsAngleReport.rows" :key="idx">
                    <td>{{ idx + 1 }}</td>
                    <td class="text-nowrap text-dark">{{ row.angleDeg }}</td>
                    <td class="text-nowrap">
                      <div class="text-dark fw-semibold">
                        {{ row.from.stationName || '（無站名）' }}
                      </div>
                      <div class="text-muted" style="font-size: 10px">
                        <span
                          :class="row.from.rb === '紅' ? 'text-danger' : ''"
                          :style="row.from.rb === '藍' ? 'color:#1565c0' : ''"
                          >{{ row.from.rb }}</span
                        >
                        <span v-if="row.from.connectNumber">
                          · cn {{ row.from.connectNumber }}</span
                        >
                        · ({{ row.from.x }}, {{ row.from.y }})
                      </div>
                    </td>
                    <td class="text-nowrap">
                      <div class="text-dark fw-semibold">
                        {{ row.to.stationName || '（無站名）' }}
                      </div>
                      <div class="text-muted" style="font-size: 10px">
                        <span
                          :class="row.to.rb === '紅' ? 'text-danger' : ''"
                          :style="row.to.rb === '藍' ? 'color:#1565c0' : ''"
                          >{{ row.to.rb }}</span
                        >
                        <span v-if="row.to.connectNumber"> · cn {{ row.to.connectNumber }}</span>
                        · ({{ row.to.x }}, {{ row.to.y }})
                      </div>
                    </td>
                    <td class="text-nowrap text-muted">{{ row.dx }}, {{ row.dy }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <!-- 網格正規化／結果：車站紅點＋黑點最小水平／垂直間距（與畫面上車站配置一致） -->
        <div
          v-if="isGridNormStationMetricsLayer && currentLayer && gridStationMinAxisReport"
          class="pb-3 mb-3 border-bottom"
        >
          <div
            v-if="isTaipeiTestCLayerTab(currentLayer?.layerId)"
            class="mb-3 p-2 rounded border"
            style="font-size: 11px; line-height: 1.5; background: #f8f9fa"
          >
            <div
              v-if="currentLayer?.overlayShrinkApplyPending"
              class="mb-2 p-2 rounded d-flex flex-wrap gap-2 align-items-center"
              style="background: #f3e8ff; border: 1px solid #d4b8f0"
            >
              <template v-if="overlayShrinkPreviewPlanLength > 0">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary rounded-pill"
                  @click="advanceOverlayShrinkHighlight"
                >
                  下一步
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary rounded-pill"
                  @click="runOverlayShrinkAutoHighlight"
                >
                  {{ isOverlayShrinkAutoRunning ? '停止' : '自動執行（0.1 秒／步）' }}
                </button>
              </template>
              <button
                type="button"
                class="btn btn-sm btn-primary rounded-pill"
                @click="applyTaipeiCOverlayShrink"
              >
                套用疊加縮減
              </button>
            </div>
            <div v-if="overlayQuadSubdivideInfo" class="text-dark mb-2">
              <strong>b→c 疊加網格（版面四等分）</strong>：目前採用
              <strong
                >{{ overlayQuadSubdivideInfo.gridN }}×{{ overlayQuadSubdivideInfo.gridN }}</strong
              >
              格（層級 {{ overlayQuadSubdivideInfo.level }}，單格最大紅+黑≤{{
                overlayQuadSubdivideInfo.maxRedBlackPerCellEnd
              }}）。刪空列／行前（已平移包圍盒原點）單格寬
              <strong>{{ Number(overlayQuadSubdivideInfo.cellW).toFixed(6) }}</strong
              >、高 <strong>{{ Number(overlayQuadSubdivideInfo.cellH).toFixed(6) }}</strong
              >。
              <span class="text-muted d-block mt-1" style="font-size: 10px">
                歸格方式：以<strong>格中心</strong>為準（連續座標換算 nx＝x/cw 後，對應 nx∈[ix−0.5,
                ix+0.5] 之整數格 ix，即四捨五入後 clamp），非 floor(x/cw) 的左下角矩形。塌縮後
                <code>minSpacingOverlayCell</code> 固定為 1×1（刪減後索引）。
              </span>
            </div>
            <template v-else>
              <div v-if="currentLayer.minSpacingOverlayCell" class="text-dark">
                每一格寬度 <strong>cellW</strong>＝{{
                  Number(currentLayer.minSpacingOverlayCell.cellW).toFixed(4)
                }}、每一格高度 <strong>cellH</strong>＝{{
                  Number(currentLayer.minSpacingOverlayCell.cellH).toFixed(4)
                }}
              </div>
              <div v-else class="text-muted">尚無 minSpacingOverlayCell。</div>
              <template v-if="gridStationMinAxisReport && gridStationMinAxisReport.pointCount >= 2">
                <div v-if="gridStationMinAxisReport.widthPair" class="mt-2 text-muted">
                  <span class="text-dark">參考：任兩站最小 |Δx|</span> 由
                  <strong class="text-dark">{{ gridStationMinAxisReport.widthPair.a.name }}</strong>
                  {{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.widthPair.a.x,
                      gridStationMinAxisReport.widthPair.a.y
                    )
                  }}
                  與
                  <strong class="text-dark">{{ gridStationMinAxisReport.widthPair.b.name }}</strong>
                  {{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.widthPair.b.x,
                      gridStationMinAxisReport.widthPair.b.y
                    )
                  }}
                  （|Δx|＝{{ fmtMinAxisDelta(gridStationMinAxisReport.minWidth) }}）。
                </div>
                <div v-if="gridStationMinAxisReport.heightPair" class="mt-1 text-muted">
                  <span class="text-dark">參考：任兩站最小 |Δy|</span> 由
                  <strong class="text-dark">{{
                    gridStationMinAxisReport.heightPair.a.name
                  }}</strong>
                  {{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.heightPair.a.x,
                      gridStationMinAxisReport.heightPair.a.y
                    )
                  }}
                  與
                  <strong class="text-dark">{{
                    gridStationMinAxisReport.heightPair.b.name
                  }}</strong>
                  {{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.heightPair.b.x,
                      gridStationMinAxisReport.heightPair.b.y
                    )
                  }}
                  （|Δy|＝{{ fmtMinAxisDelta(gridStationMinAxisReport.minHeight) }}）。
                </div>
              </template>
            </template>
          </div>

          <template v-if="!isTaipeiTestDLayerTab(currentLayer?.layerId)">
            <div class="my-title-xs-gray pb-2">
              黑點車站一覽 ({{ gridNormBlackStationRows.length }})
            </div>
            <div
              v-if="gridNormBlackStationRows.length === 0"
              class="text-muted mb-3"
              style="font-size: 11px"
            >
              尚無黑點（需路線與已儲存之 ConnectData／SectionData／StationData）。
            </div>
            <template v-else>
              <!-- taipei_e：站名 / 站點往中心聚集的縮減前（疊加格）/ 縮減前（疊加格）/ 往圖心方向；地圖為縮減後 -->
              <template v-if="isTaipeiTestELayerTab(currentLayer?.layerId)">
                <div class="mb-1 text-muted" style="font-size: 10px">
                  「站點往中心聚集的縮減前」= c→d 滑動後、d→e 縮減前的疊加格 (ix, iy)；「縮減前」=
                  d→e 縮減後（地圖同）。
                </div>
                <div class="table-responsive mb-3">
                  <table class="table table-sm table-bordered mb-0" style="font-size: 11px">
                    <thead class="table-light">
                      <tr>
                        <th scope="col" class="text-nowrap">站名</th>
                        <th scope="col" class="text-nowrap">站點往中心聚集的縮減前（疊加格）</th>
                        <th scope="col" class="text-nowrap">縮減前（疊加格）</th>
                        <th scope="col" class="text-nowrap">往圖心方向（沿路水平／垂直）</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(row, idx) in gridNormBlackStationRows"
                        :key="idx"
                        :class="{ 'table-active': isTaipeiCBlackRowTableActive(row) }"
                      >
                        <td>{{ row.name }}</td>
                        <td class="text-dark text-nowrap">
                          {{ fmtBlackStationCoordBeforeRemoval(row) }}
                        </td>
                        <td class="text-dark text-nowrap">
                          {{ fmtBlackStationCoordAfterRemoval(row) }}
                        </td>
                        <td class="text-dark text-nowrap" style="max-width: 12rem">
                          {{ row.towardCenterLabel }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
              <!-- taipei_c：站名 / 原來座標 / 縮減前 / 刪減後 / 往圖心方向 -->
              <template v-else>
                <div class="mb-1 text-muted" style="font-size: 10px">
                  「原來座標」取自
                  <strong>{{ gridNormCompanionBLayerId }}</strong>
                  圖層（與本表相同之路段＋弧長邏輯），為尚未做四等分／疊加網格前之示意
                  (x,y)；無法對照時顯示 —。
                </div>
                <div class="table-responsive mb-3">
                  <table class="table table-sm table-bordered mb-0" style="font-size: 11px">
                    <thead class="table-light">
                      <tr>
                        <th scope="col" class="text-nowrap">站名</th>
                        <th scope="col" class="text-nowrap">原來座標（疊加網格前）</th>
                        <th scope="col" class="text-nowrap">縮減前（疊加格）</th>
                        <th scope="col" class="text-nowrap">刪減後（列表／JSON）</th>
                        <th scope="col" class="text-nowrap">往圖心方向（沿路水平／垂直）</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(row, idx) in gridNormBlackStationRows"
                        :key="idx"
                        :class="{ 'table-active': isTaipeiCBlackRowTableActive(row) }"
                      >
                        <td>{{ row.name }}</td>
                        <td class="text-dark text-nowrap">
                          {{ fmtBlackStationCoordPreOverlay(row) }}
                        </td>
                        <td class="text-dark text-nowrap">
                          {{ fmtBlackStationCoordBeforeRemoval(row) }}
                        </td>
                        <td class="text-dark text-nowrap">
                          {{ fmtBlackStationCoordAfterRemoval(row) }}
                        </td>
                        <td class="text-dark text-nowrap" style="max-width: 12rem">
                          {{ row.towardCenterLabel }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
            </template>
          </template>

          <div class="my-title-xs-gray pb-2">網格車站最小間距（參考統計）</div>
          <div v-if="overlayQuadSubdivideInfo" class="text-muted mb-2" style="font-size: 10px">
            b→c 疊加格由<strong>版面四等分</strong>決定；下列 |Δx|／|Δy| 僅供參考，<strong
              >不是</strong
            >
            cellW／cellH 來源。黑點若弧長落在同一數值格，列表會沿路段微移以避免與他站共點顯示。
          </div>
          <div v-else class="text-muted mb-1" style="font-size: 10px">
            「縮減前」為刪空欄列前之疊加格 (ix, iy)；「刪減後」與目前
            <code>spaceNetworkGridJsonData</code>／列表一致。依
            <code>gridTooltipMaps</code> 互換；無對照表時兩欄相同。
          </div>
          <div
            v-if="gridStationMinAxisReport.pointCount < 2"
            class="text-muted"
            style="font-size: 11px"
          >
            需有路線資料與已儲存之 ConnectData／SectionData，且至少兩個車站點才可計算。
          </div>
          <div v-else class="text-start" style="font-size: 11px; line-height: 1.45">
            <template v-if="overlayQuadSubdivideInfo">
              <div class="mb-1 text-muted">
                參考 |Δx| min：
                <span v-if="gridStationMinAxisReport.minWidth != null" class="text-dark">{{
                  fmtMinAxisDelta(gridStationMinAxisReport.minWidth)
                }}</span>
                <span v-else>—</span>
                ；|Δy| min：
                <span v-if="gridStationMinAxisReport.minHeight != null" class="text-dark">{{
                  fmtMinAxisDelta(gridStationMinAxisReport.minHeight)
                }}</span>
                <span v-else>—</span>
              </div>
            </template>
            <template v-else>
              <div class="mb-1">
                <strong>網格寬</strong>（任兩站最小 |Δx|）：
                <span v-if="gridStationMinAxisReport.minWidth != null" class="text-dark">
                  {{ fmtMinAxisDelta(gridStationMinAxisReport.minWidth) }}
                </span>
                <span v-else class="text-muted">—（所有站點 x 相同或僅一站）</span>
              </div>
              <div v-if="gridStationMinAxisReport.widthPair" class="text-muted mb-2 ps-1">
                <div>
                  {{ gridStationMinAxisReport.widthPair.a.name }}
                  <span class="text-dark">{{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.widthPair.a.x,
                      gridStationMinAxisReport.widthPair.a.y
                    )
                  }}</span>
                  <span
                    v-if="gridStationMinAxisReport.widthPair.a.kind === 'connect'"
                    class="text-danger"
                    >紅</span
                  >
                  <span v-else>黑</span>
                </div>
                <div>
                  {{ gridStationMinAxisReport.widthPair.b.name }}
                  <span class="text-dark">{{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.widthPair.b.x,
                      gridStationMinAxisReport.widthPair.b.y
                    )
                  }}</span>
                  <span
                    v-if="gridStationMinAxisReport.widthPair.b.kind === 'connect'"
                    class="text-danger"
                    >紅</span
                  >
                  <span v-else>黑</span>
                </div>
              </div>
              <div class="mb-1">
                <strong>網格高</strong>（任兩站最小 |Δy|）：
                <span v-if="gridStationMinAxisReport.minHeight != null" class="text-dark">
                  {{ fmtMinAxisDelta(gridStationMinAxisReport.minHeight) }}
                </span>
                <span v-else class="text-muted">—（所有站點 y 相同或僅一站）</span>
              </div>
              <div v-if="gridStationMinAxisReport.heightPair" class="text-muted ps-1">
                <div>
                  {{ gridStationMinAxisReport.heightPair.a.name }}
                  <span class="text-dark">{{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.heightPair.a.x,
                      gridStationMinAxisReport.heightPair.a.y
                    )
                  }}</span>
                  <span
                    v-if="gridStationMinAxisReport.heightPair.a.kind === 'connect'"
                    class="text-danger"
                    >紅</span
                  >
                  <span v-else>黑</span>
                </div>
                <div>
                  {{ gridStationMinAxisReport.heightPair.b.name }}
                  <span class="text-dark">{{
                    fmtGridNormCoord(
                      gridStationMinAxisReport.heightPair.b.x,
                      gridStationMinAxisReport.heightPair.b.y
                    )
                  }}</span>
                  <span
                    v-if="gridStationMinAxisReport.heightPair.b.kind === 'connect'"
                    class="text-danger"
                    >紅</span
                  >
                  <span v-else>黑</span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 網格正規化結果（2_10）：縮減時移除的空疊加網格列／行 -->
        <div
          v-if="
            isTaipeiTestELayerTab(currentLayer?.layerId) &&
            currentLayer?.spaceNetworkGridJsonData?.length
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">縮減的疊加網格（空列／空行）</div>
          <div class="text-muted mb-1" style="font-size: 10px">
            橫列（row）只看點與橫線；直行（col）只看點與直線。僅被直線經過的列、僅被橫線經過的行可刪除，縮減時已移除。
          </div>
          <div class="text-start" style="font-size: 11px; line-height: 1.45">
            <div class="mb-1">
              <strong>空列</strong>（row，iy；僅被直線經過）：
              <span v-if="(currentLayer.emptyOverlayRows?.length ?? 0) > 0" class="text-dark">
                {{ (currentLayer.emptyOverlayRows || []).join(', ') }}
              </span>
              <span v-else class="text-muted">無</span>
            </div>
            <div>
              <strong>空行</strong>（col，ix；僅被橫線經過）：
              <span v-if="(currentLayer.emptyOverlayCols?.length ?? 0) > 0" class="text-dark">
                {{ (currentLayer.emptyOverlayCols || []).join(', ') }}
              </span>
              <span v-else class="text-muted">無</span>
            </div>
          </div>
        </div>

        <!-- taipei_e 下載最後結果 JSON -->
        <div
          v-if="
            isTaipeiTestELayerTab(currentLayer?.layerId) &&
            currentLayer?.spaceNetworkGridJsonData?.length
          "
          class="pb-3 mb-3 border-bottom"
        >
          <button
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="downloadFinalJson"
          >
            下載最後結果 JSON（僅路段匯出格式）
          </button>
        </div>

        <!-- taipei_j3／j3_dp／j3_dp_2／j3_dp_nd 下載 JSON（路段匯出＋表格／流量摘要） -->
        <div
          v-if="
            isTaipeiTest3J3TrafficExportLayerTab(currentLayer?.layerId) &&
            currentLayer?.spaceNetworkGridJsonData?.length
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">匯出</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="downloadTaipeiJ3Json"
          >
            下載 JSON（路段匯出＋ dataTableData／流量摘要）
          </button>
        </div>

        <!-- taipei_f：依欄 x 逐步高亮相連路段（跨路線相接視為同一筆） -->
        <div
          v-if="
            isTaipeiTestFLayerTab(currentLayer?.layerId) &&
            currentLayer?.spaceNetworkGridJsonData?.length
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">一鍵流程</div>
          <div class="text-muted mb-2" style="font-size: 10px">
            依序執行：① 紅點間路段黑點位移（僅清單路段，至無人可動）②
            站點向示意圖中心（僅非清單黑點，至無人可動）③ 欄／列一鍵批次（先欄後列）④
            空欄／空列縮減。
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="{ 'opacity-50': taipeiFOneClickPipelineRunning }"
            :disabled="taipeiFOneClickPipelineRunning"
            @click="runTaipeiFOneClickPipeline"
          >
            {{
              taipeiFOneClickPipelineRunning
                ? '執行中…'
                : '一鍵執行（清單向心 → 向心 → 欄列批次 → 縮減）'
            }}
          </button>
          <div class="text-muted mb-2" style="font-size: 10px">
            連續 6 輪：每輪皆為 ①②③④，共 6×(1-2-3-4)。
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-3"
            :class="{ 'opacity-50': taipeiFOneClickPipelineRunning }"
            :disabled="taipeiFOneClickPipelineRunning"
            @click="runTaipeiFOneClickPipelineSixRounds"
          >
            {{
              taipeiFOneClickPipelineRunning
                ? '執行中…'
                : '一鍵執行 ×6 輪（清單向心 → 向心 → 欄列批次 → 縮減）'
            }}
          </button>

          <div class="my-title-xs-gray pb-2">空欄／空列縮減</div>
          <div class="text-muted mb-2" style="font-size: 10px">
            整欄或整列若皆無黑點、紅點或路線轉折頂點，則刪除該欄／列，並將全路網與
            Section／Connect／Station 座標一併重映射為連續索引。
          </div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-3"
            @click="pruneTaipeiFEmptyGridRowsColsFromControl"
          >
            刪除空欄／空列並重映射座標
          </button>

          <div class="my-title-xs-gray pb-2">紅點間路段（SectionData）</div>
          <div class="my-title-xs-gray text-center mb-2" style="font-size: 10px">
            不列出起迄兩紅點皆與多條路段相連者（兩端皆為轉乘／分歧節點）。
          </div>
          <ul
            v-if="taipeiFSectionRouteList.length"
            class="list-unstyled mb-3 ps-1 my-content-sm-black"
            style="font-size: 11px"
          >
            <li v-for="row in taipeiFSectionRouteList" :key="'sec-' + row.index" class="mb-1">
              <span class="text-muted">{{ row.index + 1 }}.</span>
              {{ row.routeName ? row.routeName + ' · ' : '' }}{{ row.startText }} →
              {{ row.endText }}
            </li>
          </ul>
          <div v-else class="text-muted mb-3" style="font-size: 11px">尚無 SectionData 路段</div>

          <div class="my-title-xs-gray pb-2 mt-1">紅點間路段黑點位移（僅清單路段）</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="stepTaipeiFSectionCenteringOnce"
          >
            下一步（清單路段·一顆黑點）
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="taipeiFSectionCenteringAutoIntervalId != null ? 'my-btn-orange' : 'my-btn-blue'"
            @click="toggleTaipeiFSectionCenteringAuto"
          >
            {{
              taipeiFSectionCenteringAutoIntervalId != null
                ? '停止自動（清單路段）'
                : '自動執行（清單路段·每 0.1 秒）'
            }}
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="runTaipeiFListedSectionStationsTowardSchematicCenterComplete"
          >
            一鍵完成（清單路段·至無人可動）
          </button>
          <div
            v-if="taipeiFSectionCenteringSummary"
            class="my-content-sm-black text-center text-muted mb-2"
            style="font-size: 11px"
          >
            {{ taipeiFSectionCenteringSummary }}
          </div>
          <div class="my-title-xs-gray text-center mb-3" style="font-size: 10px">
            只處理列在上方清單的紅點間路段黑點；沿路網朝「與其他路線相連」之紅端點移動（通常僅一端）。路線折線轉折點位置不會改變。
            「一鍵完成（清單路段）」重複輪直到清單內黑點整輪無人可動；其他黑點格仍參與佔用判定。
          </div>
          <div class="my-title-xs-gray pb-2">站點向示意圖中心（藍虛線，僅非清單黑點）</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="stepTaipeiFCenteringOnce"
          >
            下一步（向心·一顆黑點）
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="taipeiFCenteringAutoIntervalId != null ? 'my-btn-orange' : 'my-btn-blue'"
            @click="toggleTaipeiFCenteringAutoAdvance"
          >
            {{
              taipeiFCenteringAutoIntervalId != null
                ? '停止自動（向心·每顆黑點）'
                : '自動執行向心（每 0.1 秒一顆黑點）'
            }}
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="runTaipeiFLineStationsTowardSchematicCenter"
          >
            一鍵完成（向心·至無人可動）
          </button>
          <div
            v-if="taipeiFCenteringAutoSummary"
            class="my-content-sm-black text-center text-muted mb-2"
            style="font-size: 11px"
          >
            {{ taipeiFCenteringAutoSummary }}
          </div>
          <div class="my-title-xs-gray text-center mb-3" style="font-size: 10px">
            僅處理「非」紅點間路段（SectionData）清單內之黑點；清單內路段請用上方「清單路段」按鈕。
            目標為藍虛線框（路線折線邊界）之幾何中心，不依 SectionData 轉乘 hub
            紅點；在示意圖座標上朝該中心移動。
            映射後座標不可越出藍虛線框；折線頂點隨站點更新。水平／垂直段上皆可沿該邊滑動；轉折處可換軸繼續靠向中心。
            「一鍵完成」：多輪至整輪無上述黑點可再位移（或重複版面／輪數上限）。
            「下一步」／自動：排序僅含非清單黑點；會停止欄／列與向心自動計時。
          </div>
          <div class="my-title-xs-gray pb-2">欄／列 一鍵批次</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-3"
            @click="runTaipeiFColThenRowAll"
          >
            一鍵執行（先欄後列）
          </button>
          <div class="my-title-xs-gray pb-2">欄（x）逐步檢視</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="advanceTaipeiFColHighlight"
          >
            下一筆 Col
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="taipeiFColAutoIntervalId != null ? 'my-btn-orange' : 'my-btn-blue'"
            @click="toggleTaipeiFAutoAdvance('col')"
          >
            {{ taipeiFColAutoIntervalId != null ? '停止自動（欄）' : '自動執行（每 0.1 秒）' }}
          </button>
          <div
            v-if="taipeiFColHighlightSummary"
            class="my-content-sm-black text-center text-muted"
            style="font-size: 11px"
          >
            {{ taipeiFColHighlightSummary }}
          </div>
          <div
            v-if="taipeiFColTopologyError"
            class="text-danger text-center mt-2 px-1"
            style="font-size: 11px; font-weight: 600"
          >
            重大錯誤：{{ taipeiFColTopologyError }}
          </div>
          <div v-else-if="!taipeiFColHighlightSummary" class="my-title-xs-gray text-center">
            由 x=0 起；僅垂直線相連／高亮（不含水平線）
          </div>
          <div class="my-title-xs-gray pb-2 pt-3">列（y）逐步檢視</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="advanceTaipeiFRowHighlight"
          >
            下一筆 Row
          </button>
          <button
            type="button"
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            :class="taipeiFRowAutoIntervalId != null ? 'my-btn-orange' : 'my-btn-green'"
            @click="toggleTaipeiFAutoAdvance('row')"
          >
            {{ taipeiFRowAutoIntervalId != null ? '停止自動（列）' : '自動執行（每 0.1 秒）' }}
          </button>
          <div
            v-if="taipeiFRowHighlightSummary"
            class="my-content-sm-black text-center text-muted"
            style="font-size: 11px"
          >
            {{ taipeiFRowHighlightSummary }}
          </div>
          <div
            v-if="taipeiFRowTopologyError"
            class="text-danger text-center mt-2 px-1"
            style="font-size: 11px; font-weight: 600"
          >
            重大錯誤：{{ taipeiFRowTopologyError }}
          </div>
          <div v-else-if="!taipeiFRowHighlightSummary" class="my-title-xs-gray text-center">
            由 y=0 起；僅水平線相連／高亮（不含垂直線）
          </div>

          <div class="my-title-xs-gray pb-2 pt-3">匯出目前路網</div>
          <button
            type="button"
            class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="downloadTaipeiFNetworkJson"
          >
            下載 {{ taipeiFNetworkExportFilename(currentLayer?.layerId) }}（僅路段匯出格式）
          </button>
        </div>

        <!-- taipei_g：隨機產生路段 station_weights -->
        <div
          v-if="
            isTaipeiTestGLayerTab(currentLayer?.layerId) &&
            currentLayer?.spaceNetworkGridJsonData?.length
          "
          class="pb-3 mb-3 border-bottom"
        >
          <button
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="randomizeTaipeiFWeights"
          >
            隨機產生權重
          </button>
        </div>

        <!-- LayoutGridTab_Test3 當前尺寸（僅 6-1 簡化2 圖層面板顯示，避免與其他圖層混淆） -->
        <div
          v-if="
            isTaipei6_1Test2 &&
            (layoutGridTabTest3Dimensions.x > 0 || layoutGridTabTest3Dimensions.y > 0)
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">LayoutGridTab_Test3 當前尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              X: {{ layoutGridTabTest3Dimensions.x }} pt × Y:
              {{ layoutGridTabTest3Dimensions.y }} pt
            </div>
            <small class="text-muted">寬度 × 高度</small>
          </div>
        </div>

        <!-- LayoutGridTab_Test3 網格最小尺寸（僅 6-1 簡化2） -->
        <div
          v-if="
            isTaipei6_1Test2 &&
            (layoutGridTabTest3MinCellDimensions.minWidth > 0 ||
              layoutGridTabTest3MinCellDimensions.minHeight > 0)
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">LayoutGridTab_Test3 網格最小尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              最小寬度: {{ layoutGridTabTest3MinCellDimensions.minWidth }} pt × 最小高度:
              {{ layoutGridTabTest3MinCellDimensions.minHeight }} pt
            </div>
            <small class="text-muted">最小寬度 × 最小高度</small>
          </div>
        </div>

        <!-- LayoutGridTab_Test4 當前尺寸（僅 6-1 簡化3／test4） -->
        <div
          v-if="
            isTaipei6_1Test3 &&
            (layoutGridTabTest4Dimensions.x > 0 || layoutGridTabTest4Dimensions.y > 0)
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">LayoutGridTab_Test4 當前尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              X: {{ layoutGridTabTest4Dimensions.x }} pt × Y:
              {{ layoutGridTabTest4Dimensions.y }} pt
            </div>
            <small class="text-muted">寬度 × 高度</small>
          </div>
        </div>

        <!-- LayoutGridTab_Test4 網格最小尺寸（僅 6-1 簡化3／test4） -->
        <div
          v-if="
            isTaipei6_1Test3 &&
            (layoutGridTabTest4MinCellDimensions.minWidth > 0 ||
              layoutGridTabTest4MinCellDimensions.minHeight > 0)
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">LayoutGridTab_Test4 網格最小尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              最小寬度: {{ layoutGridTabTest4MinCellDimensions.minWidth }} pt × 最小高度:
              {{ layoutGridTabTest4MinCellDimensions.minHeight }} pt
            </div>
            <small class="text-muted">最小寬度 × 最小高度</small>
          </div>
        </div>

        <!-- 當前執行的合併操作顯示（taipei_6_1_test3／test4） -->
        <div
          v-if="currentLayer && isTaipei6_1Test3 && dataStore.currentMergeOperation4"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">正在執行</div>
          <div
            class="d-flex align-items-center justify-content-center p-2 rounded"
            style="background-color: #e3f2fd; border: 1px solid #90caf9"
          >
            <div
              class="spinner-border spinner-border-sm text-primary me-2"
              role="status"
              style="width: 1rem; height: 1rem"
            >
              <span class="visually-hidden">執行中...</span>
            </div>
            <div>
              <strong class="text-primary">{{ dataStore.currentMergeOperation4 }}</strong>
            </div>
          </div>
        </div>

        <!-- 當前網格長寬顯示（僅在 taipei_6_1_test 圖層顯示） -->
        <div
          v-if="isTaipei6_1Test && currentLayer && currentLayer.layoutGridJsonData_Test2"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">當前網格尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              {{ currentGridDimensions.width }} × {{ currentGridDimensions.height }}
            </div>
            <small class="text-muted">長 × 寬</small>
          </div>
        </div>

        <!-- 當前網格長寬顯示（僅在 taipei_6_1_test2 圖層顯示） -->
        <div
          v-if="isTaipei6_1Test2 && currentLayer && currentLayer.layoutGridJsonData_Test3"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">layoutGridJsonData_Test3 當前網格尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              {{ currentGridDimensions3.width }} × {{ currentGridDimensions3.height }}
            </div>
            <small class="text-muted">長 × 寬</small>
          </div>
        </div>

        <!-- 當前網格長寬顯示（僅在 taipei_6_1_test3 或 taipei_6_1_test4 圖層顯示） -->
        <div
          v-if="isTaipei6_1Test3 && currentLayer && currentLayer.layoutGridJsonData_Test4"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">layoutGridJsonData_Test4 當前網格尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              {{ currentGridDimensions4.width }} × {{ currentGridDimensions4.height }}
            </div>
            <small class="text-muted">長 × 寬</small>
          </div>
        </div>

        <!-- 當前網格尺寸（taipei_g；高 × 寬，計算方式同 layoutGridJsonData_Test4） -->
        <div
          v-if="isTaipeiF && currentLayer && currentLayer.layoutGridJsonData"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">當前網格尺寸</div>
          <div class="text-center">
            <div class="my-title-sm-black">
              {{ currentGridDimensionsTaipeiF.height }} × {{ currentGridDimensionsTaipeiF.width }}
            </div>
            <small class="text-muted">高 × 寬</small>
          </div>
        </div>

        <!-- 滑鼠網格座標：Test4 分頁 或 taipei_g 空間網路分頁（共用 dataStore 座標） -->
        <div
          v-if="
            (isTaipei6_1Test3 && currentLayer && currentLayer.layoutGridJsonData_Test4) ||
            (isTaipeiF && currentLayer && currentLayer.layoutGridJsonData)
          "
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">滑鼠網格座標</div>
          <div class="text-center">
            <div
              v-if="
                layoutGridTabTest4MouseGridCoordinate.x !== null &&
                layoutGridTabTest4MouseGridCoordinate.y !== null
              "
              class="my-title-sm-black"
            >
              ({{ layoutGridTabTest4MouseGridCoordinate.x }},
              {{ layoutGridTabTest4MouseGridCoordinate.y }})
            </div>
            <div v-else class="my-title-xs-gray">請將滑鼠移至網格上</div>
          </div>
          <div class="text-center mt-2 pt-2 border-top border-secondary border-opacity-25">
            <div class="my-title-xs-gray pb-1">目前最小網格</div>
            <template v-if="isTaipeiF">
              <div
                v-if="
                  spaceNetworkGridMinCellDimensions.minWidth > 0 ||
                  spaceNetworkGridMinCellDimensions.minHeight > 0
                "
                class="my-content-sm-black"
              >
                <div>高（垂直）：{{ spaceNetworkGridMinCellDimensions.minHeight }} pt</div>
                <div>寬（水平）：{{ spaceNetworkGridMinCellDimensions.minWidth }} pt</div>
              </div>
              <div v-else class="my-title-xs-gray">—</div>
            </template>
            <template v-else>
              <div
                v-if="
                  layoutGridTabTest4MinCellDimensions.minWidth > 0 ||
                  layoutGridTabTest4MinCellDimensions.minHeight > 0
                "
                class="my-content-sm-black"
              >
                <div>寬度：{{ layoutGridTabTest4MinCellDimensions.minWidth }} pt</div>
                <div>高度：{{ layoutGridTabTest4MinCellDimensions.minHeight }} pt</div>
              </div>
              <div v-else class="my-title-xs-gray">—</div>
            </template>
          </div>
        </div>

        <!-- taipei_g：顯示網格／顯示權重（與 LayoutGridTab_Test4 共用 dataStore 開關） -->
        <div
          v-if="isTaipeiF && currentLayer?.spaceNetworkGridJsonData?.length"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="my-title-xs-gray pb-2">空間網路圖顯示</div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black">顯示網格</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-taipei-f-showGrid"
                :checked="dataStore.showGrid"
                @change="dataStore.setShowGrid($event.target.checked)"
              />
              <label for="switch-taipei-f-showGrid"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black">顯示權重</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-taipei-f-showWeightLabels"
                :checked="dataStore.showWeightLabels"
                @change="dataStore.setShowWeightLabels($event.target.checked)"
              />
              <label for="switch-taipei-f-showWeightLabels"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="pe-2">
              <div class="my-content-sm-black">顯示粗細（依權重）</div>
              <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.25">
                d3.scaleLinear：權重 min～max → 1px～10pt
              </div>
            </div>
            <div class="layer-toggle flex-shrink-0" @click.stop>
              <input
                type="checkbox"
                id="switch-taipei-f-showRouteThickness"
                :checked="dataStore.showRouteThickness"
                @change="dataStore.setShowRouteThickness($event.target.checked)"
              />
              <label for="switch-taipei-f-showRouteThickness"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black">顯示站名</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-taipei-f-showStationNames"
                :checked="dataStore.showStationNames"
                @change="dataStore.setShowStationNames($event.target.checked)"
              />
              <label for="switch-taipei-f-showStationNames"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black text-wrap pe-2" style="max-width: 62%">權重放大</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-taipei-f-grid-scaling"
                :checked="taipeiFGridScalingChecked"
                @change="onTaipeiFGridScalingChange($event.target.checked)"
              />
              <label for="switch-taipei-f-grid-scaling"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black text-wrap pe-2" style="max-width: 62%">滑鼠縮放</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-taipei-f-mouse-zoom"
                :checked="dataStore.taipeiFSpaceNetworkMouseZoom === true"
                @change="dataStore.setTaipeiFSpaceNetworkMouseZoom($event.target.checked)"
              />
              <label for="switch-taipei-f-mouse-zoom"></label>
            </div>
          </div>
          <div class="mt-2 pt-2 border-top border-secondary border-opacity-25">
            <div class="my-title-xs-gray pb-2">縮減網格（resize 自動合併門檻）</div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black text-wrap pe-2" style="max-width: 58%">
                寬度小於（pt）
              </div>
              <input
                id="input-taipei-f-min-width-pt"
                type="number"
                min="0.5"
                step="0.5"
                :value="dataStore.taipeiFResizeMinWidthPtThreshold"
                @input="dataStore.setTaipeiFResizeMinWidthPtThreshold($event.target.value)"
                class="form-control form-control-sm"
                style="width: 80px; flex-shrink: 0"
              />
            </div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black text-wrap pe-2" style="max-width: 58%">
                高度小於（pt）
              </div>
              <input
                id="input-taipei-f-min-height-pt"
                type="number"
                min="0.5"
                step="0.5"
                :value="dataStore.taipeiFResizeMinHeightPtThreshold"
                @input="dataStore.setTaipeiFResizeMinHeightPtThreshold($event.target.value)"
                class="form-control form-control-sm"
                style="width: 80px; flex-shrink: 0"
              />
            </div>
            <div
              v-if="
                dataStore.enableWeightScaling &&
                (spaceNetworkGridMinCellDimensions.minWidth > 0 ||
                  spaceNetworkGridMinCellDimensions.minHeight > 0)
              "
              class="my-content-sm-black mt-1"
              style="font-size: 11px; line-height: 1.4"
            >
              目前最小格：寬 {{ spaceNetworkGridMinCellDimensions.minWidth }} pt、高
              {{ spaceNetworkGridMinCellDimensions.minHeight }} pt
            </div>
            <div
              v-if="taipeiFResizeLastAutoMergeInfo"
              class="my-content-sm-black border rounded px-2 py-2 mt-2"
              style="font-size: 11px; line-height: 1.45"
            >
              <div class="fw-semibold mb-1">
                {{
                  taipeiFResizeLastAutoMergeInfo.source === 'manual'
                    ? '上次手動合併黑點路段（已執行）'
                    : '上次 resize 自動合併（已執行）'
                }}
              </div>
              <div v-if="taipeiFResizeLastAutoMergeInfo.source === 'manual'">
                本次為手動「合併黑點路段 (權重差≤{{
                  taipeiFResizeLastAutoMergeInfo.maxWeightDiff
                }})」完整執行結果（不限制單一方向）。
              </div>
              <div v-else>
                等同手動「合併黑點路段 (權重差≤{{
                  taipeiFResizeLastAutoMergeInfo.maxWeightDiff
                }})」之 N；該次僅
                <template v-if="taipeiFResizeLastAutoMergeInfo.mergeAxisConstraint === 'horizontal'"
                  >水平向</template
                >
                <template
                  v-else-if="taipeiFResizeLastAutoMergeInfo.mergeAxisConstraint === 'vertical'"
                  >垂直向</template
                >
                <template v-else>—</template>
                嘗試合併（與手動按鈕不同：resize 會依門檻輪流只跑單一方向與階段 0～4）。
              </div>
              <div class="mt-1">
                實際合併黑點：{{ taipeiFResizeLastAutoMergeInfo.mergeCount }} 次；刪空欄
                {{ taipeiFResizeLastAutoMergeInfo.removedColCount }}、刪空列
                {{ taipeiFResizeLastAutoMergeInfo.removedRowCount }}。
              </div>
              <div class="text-muted mt-1" style="font-size: 10px">
                可刪欄（原索引）：
                {{
                  taipeiFResizeLastAutoMergeInfo.removedCols &&
                  taipeiFResizeLastAutoMergeInfo.removedCols.length
                    ? taipeiFResizeLastAutoMergeInfo.removedCols.join(', ')
                    : '無'
                }}
              </div>
              <div class="text-muted mt-1" style="font-size: 10px">
                可刪列（原索引）：
                {{
                  taipeiFResizeLastAutoMergeInfo.removedRows &&
                  taipeiFResizeLastAutoMergeInfo.removedRows.length
                    ? taipeiFResizeLastAutoMergeInfo.removedRows.join(', ')
                    : '無'
                }}
              </div>
              <div
                v-if="taipeiFResizeLastAutoMergeInfo.mergeCount === 0"
                class="text-muted mt-1"
                style="font-size: 10px"
              >
                合併次數為 0
                表示路網上沒有符合「該權重差與該方向」可合併的黑點（仍會執行刪空欄列與座標重映射）。
              </div>
              <div class="text-muted mt-1" style="font-size: 10px">
                {{ formatTaipeiFResizeAutoMergeTime(taipeiFResizeLastAutoMergeInfo.at) }}
              </div>
            </div>
            <div class="my-title-xs-gray mt-2 mb-0" style="font-size: 11px; line-height: 1.35">
              resize
              時最小格寬／高分別低於上列門檻則依序觸發水平／垂直黑點自動合併；每次合併後皆刪除空欄／空列並重映射座標（與下方「合併黑點路段」相同流程）。開啟「權重放大」時另顯示目前最小格
            </div>
          </div>
        </div>

        <!-- 合併路線和縮減網格按鈕（taipei_6_1_test3／test4） -->
        <div
          v-if="currentLayer && isTaipei6_1Test3 && currentLayer.layoutGridJsonData_Test4"
          class="pb-3 mb-3 border-bottom"
        >
          <!-- 隨機產生權重 -->
          <button
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-3"
            @click="randomizeWeights4"
          >
            隨機產生權重
          </button>

          <!-- LayoutGridTab_Test4：顯示/比例開關（樣式同 LeftView 圖層開關） -->
          <div class="mb-3">
            <div class="my-title-xs-gray pb-2">LayoutGridTab_Test4 顯示設定</div>

            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black">顯示網格</div>
              <div class="layer-toggle" @click.stop>
                <input
                  type="checkbox"
                  id="switch-test4-showGrid"
                  :checked="dataStore.showGrid"
                  @change="dataStore.setShowGrid($event.target.checked)"
                />
                <label for="switch-test4-showGrid"></label>
              </div>
            </div>

            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black">顯示權重</div>
              <div class="layer-toggle" @click.stop>
                <input
                  type="checkbox"
                  id="switch-test4-showWeightLabels"
                  :checked="dataStore.showWeightLabels"
                  @change="dataStore.setShowWeightLabels($event.target.checked)"
                />
                <label for="switch-test4-showWeightLabels"></label>
              </div>
            </div>

            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="pe-2">
                <div class="my-content-sm-black">顯示粗細</div>
                <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.25">
                  d3.scaleLinear：權重 min～max → 1px～10pt
                </div>
              </div>
              <div class="layer-toggle flex-shrink-0" @click.stop>
                <input
                  type="checkbox"
                  id="switch-test4-showRouteThickness"
                  :checked="dataStore.showRouteThickness"
                  @change="dataStore.setShowRouteThickness($event.target.checked)"
                />
                <label for="switch-test4-showRouteThickness"></label>
              </div>
            </div>

            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black">權重放大</div>
              <div class="layer-toggle" @click.stop>
                <input
                  type="checkbox"
                  id="switch-test4-enableWeightScaling"
                  :checked="dataStore.enableWeightScaling"
                  @change="dataStore.setEnableWeightScaling($event.target.checked)"
                />
                <label for="switch-test4-enableWeightScaling"></label>
              </div>
            </div>

            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black">顯示站名</div>
              <div class="layer-toggle" @click.stop>
                <input
                  type="checkbox"
                  id="switch-test3-showStationNames"
                  :checked="dataStore.showStationNames"
                  @change="dataStore.setShowStationNames($event.target.checked)"
                />
                <label for="switch-test3-showStationNames"></label>
              </div>
            </div>

            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black">自動合併閾值 (pt)</div>
              <input
                type="number"
                min="0"
                step="0.1"
                :value="dataStore.autoMergeThreshold"
                @input="dataStore.setAutoMergeThreshold($event.target.value)"
                class="form-control form-control-sm"
                style="width: 80px; display: inline-block"
              />
            </div>

            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="my-content-sm-black">權重放大倍數</div>
              <input
                type="number"
                min="1"
                step="1"
                :value="dataStore.weightScalingMultiplier"
                @input="dataStore.setWeightScalingMultiplier($event.target.value)"
                class="form-control form-control-sm"
                style="width: 80px; display: inline-block"
              />
            </div>

            <div class="d-flex align-items-center justify-content-between">
              <div class="my-content-sm-black">縮放指數</div>
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                :value="dataStore.weightScalingExponent"
                @input="dataStore.setWeightScalingExponent($event.target.value)"
                class="form-control form-control-sm"
                style="width: 80px; display: inline-block"
              />
            </div>
          </div>

          <!-- gap <= 0 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4(0)"
            >
              合併路線 (gap &lt;= 0)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeAllRoutes4H(0)"
            >
              合併路線-H (gap &lt;= 0)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4V(0)"
            >
              合併路線-V (gap &lt;= 0)
            </button>
          </div>
          <!-- gap <= 1 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4(1)"
            >
              合併路線 (gap &lt;= 1)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeAllRoutes4H(1)"
            >
              合併路線-H (gap &lt;= 1)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4V(1)"
            >
              合併路線-V (gap &lt;= 1)
            </button>
          </div>
          <!-- gap <= 2 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4(2)"
            >
              合併路線 (gap &lt;= 2)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeAllRoutes4H(2)"
            >
              合併路線-H (gap &lt;= 2)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4V(2)"
            >
              合併路線-V (gap &lt;= 2)
            </button>
          </div>
          <!-- gap <= 3 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4(3)"
            >
              合併路線 (gap &lt;= 3)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeAllRoutes4H(3)"
            >
              合併路線-H (gap &lt;= 3)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes4V(3)"
            >
              合併路線-V (gap &lt;= 3)
            </button>
          </div>
          <!-- 縮減網格 -->
          <button
            class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="reduceGrid4"
          >
            縮減網格
          </button>
        </div>

        <!-- 刪除 row/col（固定為 1pt，不刪除資料；僅 taipei_6_1_test2 顯示） -->
        <div
          v-if="isTaipei6_1Test2 && currentLayer && currentLayer.dataTableData"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="deleteOneRow"
            >
              刪除row
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="deleteAllRows"
            >
              執行完成-row
            </button>
          </div>
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="deleteOneCol"
            >
              刪除col
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="deleteAllCols"
            >
              執行完成-col
            </button>
          </div>
        </div>

        <!-- 隨機產生權重按鈕區域（僅在 taipei_6_1_test 圖層顯示） -->
        <div
          v-if="isTaipei6_1Test && currentLayer && currentLayer.layoutGridJsonData_Test"
          class="pb-3 mb-3 border-bottom"
        >
          <button
            class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="randomizeWeights"
          >
            隨機產生權重
          </button>
        </div>

        <!-- 合併一筆路線2（放在隨機產生權重下方） -->
        <div
          v-if="isTaipei6_1Test && currentLayer && currentLayer.dataTableData"
          class="pb-3 mb-3 border-bottom"
        >
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeOneRoute2AndReduce(4, 'V')"
            >
              合併一筆路線2-V (gap &lt;= 4)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeAllRoutes2AndReduce(4, 'V')"
            >
              執行完成2-V (gap &lt;= 4)
            </button>
          </div>
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-orange my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeOneRoute2AndReduce(4, 'H')"
            >
              合併一筆路線2-H (gap &lt;= 4)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="mergeAllRoutes2AndReduce(4, 'H')"
            >
              執行完成2-H (gap &lt;= 4)
            </button>
          </div>
        </div>

        <!-- 合併一筆路線按鈕區域（僅在 taipei_6_1_test 圖層顯示） -->
        <div
          v-if="isTaipei6_1Test && currentLayer && currentLayer.dataTableData"
          class="pb-3 mb-3 border-bottom"
        >
          <!-- gap <= 0 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeOneRoute(0)"
            >
              合併一筆路線 (gap ＜= 0)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="mergeAllRoutes(0)"
            >
              執行完成 (gap ＜= 0)
            </button>
          </div>
          <!-- gap <= 1 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeOneRoute(1)"
            >
              合併一筆路線 (gap ＜= 1)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="mergeAllRoutes(1)"
            >
              執行完成 (gap ＜= 1)
            </button>
          </div>
          <!-- gap <= 2 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeOneRoute(2)"
            >
              合併一筆路線 (gap ＜= 2)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="mergeAllRoutes(2)"
            >
              執行完成 (gap ＜= 2)
            </button>
          </div>
          <!-- gap <= 3 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeOneRoute(3)"
            >
              合併一筆路線 (gap ＜= 3)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer"
              @click="mergeAllRoutes(3)"
            >
              執行完成 (gap ＜= 3)
            </button>
          </div>
          <!-- gap <= 4 -->
          <div class="mb-2">
            <button
              class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-1"
              @click="mergeOneRoute(4)"
            >
              合併一筆路線 (gap ＜= 4)
            </button>
            <button
              class="btn rounded-pill border-0 my-btn-green my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
              @click="mergeAllRoutes(4)"
            >
              執行完成 (gap ＜= 4)
            </button>
          </div>
          <!-- 縮減網格 -->
          <button
            class="btn rounded-pill border-0 my-btn-red my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="reduceGrid"
          >
            縮減網格
          </button>
        </div>

        <!-- 空間網路主分頁／K3／L3 分頁共用：路線上權重數字（預設顯示）；taipei_f／g 用上方專區「顯示權重」 -->
        <div v-if="hasSpaceNetworkStandaloneRouteWeightToggle" class="pb-3 mb-3 border-bottom">
          <div class="my-title-xs-gray pb-2">空間網路圖（主分頁／K3／K4）</div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black">顯示路線權重數字</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-space-network-route-weights"
                :checked="dataStore.spaceNetworkGridShowRouteWeights"
                @change="dataStore.setSpaceNetworkGridShowRouteWeights($event.target.checked)"
              />
              <label for="switch-space-network-route-weights"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black">顯示滑鼠網格座標</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-space-network-mouse-grid-coord"
                :checked="dataStore.spaceNetworkGridShowMouseGridCoordinate"
                @change="
                  dataStore.setSpaceNetworkGridShowMouseGridCoordinate($event.target.checked)
                "
              />
              <label for="switch-space-network-mouse-grid-coord"></label>
            </div>
          </div>
          <div
            v-if="dataStore.spaceNetworkGridShowMouseGridCoordinate"
            class="text-center mb-3 py-2 px-2 rounded border border-secondary border-opacity-25"
            style="font-size: 12px; line-height: 1.35; background: rgba(0, 0, 0, 0.03)"
          >
            <div class="text-muted" style="font-size: 10px">滑鼠所在網格（資料座標 x, y）</div>
            <div
              v-if="
                layoutGridTabTest4MouseGridCoordinate.x !== null &&
                layoutGridTabTest4MouseGridCoordinate.y !== null
              "
              class="my-title-sm-black mb-0"
            >
              ({{ layoutGridTabTest4MouseGridCoordinate.x }},
              {{ layoutGridTabTest4MouseGridCoordinate.y }})
            </div>
            <div v-else class="my-title-xs-gray mb-0">
              請將滑鼠移至 space-network-grid 或 K3／K4 圖上
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="pe-2">
              <div class="my-content-sm-black">依滑鼠放大 snap 欄／列（內繪寬高）</div>
              <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.25">
                僅 taipei_k4（a4～c5）。滑鼠所在 snap
                <strong>欄</strong>／<strong>列</strong>內繪寬／高
                ×<strong>n</strong>；左右或上下每遠一帶 −1，最小 1×。與「依 max
                比例分配」可併用；欄與列距離各自計算（帶索引＝與 JSON snap 一致）。
              </div>
            </div>
            <div class="layer-toggle flex-shrink-0" @click.stop>
              <input
                type="checkbox"
                id="switch-space-network-k4-mouse-band-focus-magnify"
                :checked="dataStore.spaceNetworkK4MouseBandFocusMagnifyEnabled"
                @change="
                  dataStore.setSpaceNetworkK4MouseBandFocusMagnifyEnabled($event.target.checked)
                "
              />
              <label for="switch-space-network-k4-mouse-band-focus-magnify"></label>
            </div>
          </div>
          <div class="mb-3 ps-1">
            <div class="d-flex flex-wrap align-items-center gap-2">
              <label class="my-content-sm-black mb-0" for="input-k4-mouse-band-focus-magnify-n">
                放大峰值 n（預設 5）
              </label>
              <input
                id="input-k4-mouse-band-focus-magnify-n"
                type="number"
                class="form-control form-control-sm"
                style="width: 5.5rem"
                min="1"
                max="50"
                step="1"
                :value="dataStore.spaceNetworkK4MouseBandFocusMagnifyN"
                @change="applySpaceNetworkK4MouseBandFocusMagnifyN($event.target.value)"
              />
            </div>
            <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.35">
              僅在上一項開啟且滑鼠在圖內時重算內繪 remap；移出圖或關閉後恢復。
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="pe-2">
              <div class="my-content-sm-black">顯示粗細（依權重）</div>
              <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.25">
                d3.scaleLinear：權重 min～max → 1px～10pt；主分頁／K3／K4
              </div>
            </div>
            <div class="layer-toggle flex-shrink-0" @click.stop>
              <input
                type="checkbox"
                id="switch-space-network-route-thickness"
                :checked="dataStore.showRouteThickness"
                @change="dataStore.setShowRouteThickness($event.target.checked)"
              />
              <label for="switch-space-network-route-thickness"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="pe-2">
              <div class="my-content-sm-black">
                把每一個網格的寬度/高度用 row／col 最大值依比例分配
              </div>
              <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.25">
                僅
                <code class="small">layout-network-grid</code
                >（taipei_k4）；在「顯示粗細（依權重）」下方；與粗細獨立。關＝均分 snap
                帶；開＝依欄／列 max 比例分配內繪寬高，格線／路線／紅藍點用同一座標 remap 對齊。
              </div>
            </div>
            <div class="layer-toggle flex-shrink-0" @click.stop>
              <input
                type="checkbox"
                id="switch-space-network-k4-weight-proportional-inner-grid"
                :checked="dataStore.spaceNetworkK4WeightProportionalInnerGrid"
                @change="
                  dataStore.setSpaceNetworkK4WeightProportionalInnerGrid($event.target.checked)
                "
              />
              <label for="switch-space-network-k4-weight-proportional-inner-grid"></label>
            </div>
          </div>
          <div class="mb-3 ps-1">
            <div class="d-flex flex-wrap align-items-center gap-2">
              <label class="my-content-sm-black mb-0" for="input-k4-weight-proportional-scale-n">
                分配倍率 n（預設 1）
              </label>
              <input
                id="input-k4-weight-proportional-scale-n"
                type="number"
                class="form-control form-control-sm"
                style="width: 5.5rem"
                min="0.25"
                max="6"
                step="0.05"
                :value="dataStore.spaceNetworkK4WeightProportionalScaleN"
                @change="applySpaceNetworkK4ProportionalScaleN($event.target.value)"
              />
            </div>
            <div class="text-muted mt-1" style="font-size: 10px; line-height: 1.35">
              格寬／格高依各 snap 帶的 max 之
              <strong>n</strong>
              次方分配（有效權重 ∝ max<sup>n</sup>；n=1 與「僅依 max」相同）。僅在上一項開啟時生效。
              「max×常數」若為全圖同一倍數，正規化後比例不變，故以指數
              <strong>n</strong>
              調整強弱。
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black">顯示紅點／藍點站名</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-space-network-connect-station-names"
                :checked="dataStore.showStationNames"
                @change="dataStore.setShowStationNames($event.target.checked)"
              />
              <label for="switch-space-network-connect-station-names"></label>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="my-content-sm-black">顯示黑點站名</div>
            <div class="layer-toggle" @click.stop>
              <input
                type="checkbox"
                id="switch-space-network-black-station-names"
                :checked="dataStore.showBlackDotStationNames"
                @change="dataStore.setShowBlackDotStationNames($event.target.checked)"
              />
              <label for="switch-space-network-black-station-names"></label>
            </div>
          </div>
          <!-- taipei_b4：僅 a 產出與 b→c 複製；snap／近距／重疊診斷／手動合併等請在 taipei_c4 -->
          <template
            v-if="currentLayer?.layerId !== 'taipei_b4'"
          >
            <div class="text-muted" style="font-size: 11px; line-height: 1.4">
              權重數字同步 <code class="small">space-network-grid</code> 與
              <code class="small">space-network-grid-k3</code>／
              <code class="small">space-network-grid-k4</code> 折線上
              <code class="small">station_weights</code>。
              紅／藍站名開關為 <code class="small">connect</code>（交叉紅／末端藍）上之文字標籤；與
              taipei_f
              專區「顯示站名」同一全域設定。黑點（沿線站）站名為下一項獨立開關。預設皆關閉。
            </div>
            <div class="d-flex align-items-center justify-content-between mt-2 mb-1">
              <div class="my-content-sm-black">
                JSON 座標 snap（px，k4 用）
                <span class="text-muted fw-normal" style="font-size: 11px">；預設為 10</span>
              </div>
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                :value="dataStore.k3JsonOverlapDistancePx"
                @input="dataStore.setK3JsonOverlapDistancePx($event.target.value)"
                class="form-control form-control-sm"
                style="width: 88px; display: inline-block"
              />
            </div>
            <div class="d-flex align-items-center justify-content-between mt-1 mb-1">
              <div class="my-content-sm-black">
                站點最小距離（px）
                <span class="text-muted fw-normal" style="font-size: 11px">；預設為 10</span>
              </div>
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                :value="dataStore.k3JsonMinStationDistancePx"
                @input="dataStore.setK3JsonMinStationDistancePx($event.target.value)"
                class="form-control form-control-sm"
                style="width: 88px; display: inline-block"
              />
            </div>
            <div
              v-if="currentLayer?.layerId === 'taipei_c4'"
              class="mt-2 p-3 border rounded"
              style="font-size: 11px; line-height: 1.5; background: #f1f8f4"
            >
              <div class="my-content-sm-black mb-2">taipei_c4 手動處理（與 b4 零權重合併語意）</div>
              <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="my-content-sm-black">
                  合併門檻（|Δweight| ≤ N）
                  <span class="text-muted fw-normal" style="font-size: 10px">；預設 10</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  :value="dataStore.taipeiK3MergeMaxWeightDiff"
                  @input="dataStore.setTaipeiK3MergeMaxWeightDiff($event.target.value)"
                  class="form-control form-control-sm"
                  style="width: 92px; display: inline-block"
                />
              </div>
              <ol
                class="text-muted mb-2 ps-3"
                style="font-size: 10px; line-height: 1.6; margin-bottom: 0.75rem !important"
              >
                <li class="mb-1">
                  以<strong>目前 taipei_c4</strong> K3Tab 為輸入（請先執行 b4「執行下一步」自
                  taipei_b4 複製路網）。
                </li>
                <li class="mb-1">
                  執行與 <strong>taipei_b4</strong> 相同之黑點合併：相鄰兩段
                  <strong>|Δweight| ≤ {{ dataStore.taipeiK3MergeMaxWeightDiff }}</strong> 即合併。
                </li>
                <li class="mb-1">
                  執行
                  <code class="small">mergeConnectSpansPlaceBlackStationsAndSplit</code>
                  。
                </li>
                <li class="mb-1">
                  套用 <strong>taipei_a4</strong> 之 mapDrawn／CSV（流量會以<strong
                    >原始 CSV 單位</strong
                  >覆寫各切段權重，與 a4→b4 相同）。
                </li>
                <li class="mb-0">
                  對<strong>覆寫後</strong>之權重再做與 <strong>a4→b4</strong> 相同之
                  <strong>floor(÷100)</strong>（正權重至少為 1），並將整份路網寫回
                  <strong>taipei_c4</strong>。此步<strong>不是</strong>對「已除過 100 的舊 c4
                  數值」再除一次，而是對<strong>CSV 剛寫入的大數</strong>做與主流程一致的縮放。
                </li>
              </ol>
              <div class="text-muted mb-3" style="font-size: 10px; line-height: 1.55">
                <strong>a4→b4</strong> 不會自動執行此流程；請在檢視近距診斷後按需操作。
              </div>
              <button
                type="button"
                class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer"
                :disabled="
                  isTaipeiB4ManualZeroMergeBusy ||
                  !((currentLayer?.spaceNetworkGridJsonDataK3Tab || []).length > 0)
                "
                @click="runTaipeiB4ManualZeroWeightMerge"
              >
                {{ isTaipeiB4ManualZeroMergeBusy ? '執行中…' : '開始執行' }}
              </button>
            </div>
            <div
              v-if="k3JsonConsecutiveNearPairsReport"
              class="mt-2 p-2 border rounded"
              style="font-size: 11px; line-height: 1.4; background: #f8fbff"
            >
              <div class="my-content-sm-black mb-1">
                任兩個黑點／紅點／藍點最小距離
                <strong>≤{{ k3JsonConsecutiveNearPairsReport.threshold }}px</strong> 的兩點站名：
                <span
                  :style="{
                    color: k3JsonConsecutiveNearPairsReport.total > 0 ? '#c00' : '#2e7d32',
                    fontWeight: 'bold',
                  }"
                >
                  {{ k3JsonConsecutiveNearPairsReport.total }} 對
                </span>
                <span class="text-muted fw-normal">
                  ；connect 間路段
                  <strong style="color: #333">{{
                    k3JsonConsecutiveNearPairsReport.connectLegSegmentCount
                  }}</strong>
                  個
                </span>
                <span
                  v-if="(k3JsonConsecutiveNearPairsReport.unresolvedNearPairGroupCount || 0) > 0"
                  class="text-muted fw-normal"
                >
                  （無法對應 connect 間路段之近距組：<strong>{{
                    k3JsonConsecutiveNearPairsReport.unresolvedNearPairGroupCount
                  }}</strong>
                  組）
                </span>
              </div>
              <div v-if="k3JsonConsecutiveNearPairsReport.total === 0" class="text-muted">
                目前未偵測到小於等於 {{ k3JsonConsecutiveNearPairsReport.threshold }}px
                的黑/紅/藍點對。
              </div>
              <div v-else-if="k3JsonConsecutiveNearPairsReportGroupedByLeg" class="text-muted">
                <div
                  v-for="(group, gi) in k3JsonConsecutiveNearPairsReportGroupedByLeg.groups"
                  :key="`near-pair-leg-${gi}`"
                  :style="{
                    paddingLeft: '8px',
                    lineHeight: 1.45,
                    marginBottom:
                      gi < k3JsonConsecutiveNearPairsReportGroupedByLeg.groups.length - 1
                        ? '16px'
                        : '0',
                    paddingBottom:
                      gi < k3JsonConsecutiveNearPairsReportGroupedByLeg.groups.length - 1
                        ? '14px'
                        : '0',
                    borderBottom:
                      gi < k3JsonConsecutiveNearPairsReportGroupedByLeg.groups.length - 1
                        ? '1px solid rgba(0, 60, 140, 0.14)'
                        : 'none',
                  }"
                >
                  <div><strong>路線：</strong>{{ group.routeLabel }}</div>
                  <div class="mt-1" style="color: #444">
                    <strong>connect 間路段：</strong>
                    <template
                      v-if="
                        group.legConnectKind === 'single' &&
                        group.legConnectFrom &&
                        group.legConnectTo
                      "
                    >
                      <strong>{{ group.legConnectFrom.hue }}</strong
                      >{{ group.legConnectFrom.name }}（{{ group.legConnectFrom.x }},
                      {{ group.legConnectFrom.y }}）↔ <strong>{{ group.legConnectTo.hue }}</strong
                      >{{ group.legConnectTo.name }}（{{ group.legConnectTo.x }},
                      {{ group.legConnectTo.y }}）
                    </template>
                    <span v-else>（無法對應到 connect 間區間）</span>
                  </div>
                  <div
                    v-for="(row, ri) in group.rows"
                    :key="`near-pair-${gi}-${ri}`"
                    class="mt-2"
                    style="padding-left: 10px; border-left: 2px solid rgba(0, 80, 160, 0.2)"
                  >
                    <div>
                      <strong>兩點：</strong><strong>{{ row.fromHue }}</strong
                      >{{ row.fromName }}（{{ row.fromX }}, {{ row.fromY }}）↔
                      <strong>{{ row.toHue }}</strong
                      >{{ row.toName }}（{{ row.toX }}, {{ row.toY }}）
                    </div>
                    <div>
                      <strong>{{ row.axisLabel }}</strong>
                      ・
                      <span style="color: #b00020">距離 {{ row.dist }} px</span>
                    </div>
                  </div>
                </div>
                <span v-if="k3JsonConsecutiveNearPairsReport.truncated">…（僅顯示前 80 對）</span>
              </div>
            </div>
            <div
              v-if="k3JsonPointOverlapReport"
              class="mt-2 p-2 border rounded"
              style="font-size: 11px; line-height: 1.4; background: #fffdf5"
            >
              <div class="my-content-sm-black mb-1">
                JSON（K3 分頁）紅/藍/黑點重疊點（僅同路線〈同色〉：<strong
                  >同一 layout-network-grid 座標</strong
                >上多個黑點站名／多個 connect 站名／connect+黑）：
                <span
                  :style="{
                    color: k3JsonPointOverlapReport.total > 0 ? '#c00' : '#2e7d32',
                    fontWeight: 'bold',
                  }"
                >
                  {{ k3JsonPointOverlapReport.total }} 處
                </span>
                <span
                  v-if="
                    currentLayer?.layerId === 'taipei_a4' ||
                    currentLayer?.layerId === 'taipei_b4' ||
                    currentLayer?.layerId === 'taipei_c4'
                  "
                  class="text-muted"
                >
                  （taipei_c4／c6：內繪區 px 與主圖 layout-network-grid-k3 路徑 tooltip 一致，含 k4
                  弧長重算後黑點與 snap；視窗尺寸依目前量測）
                </span>
              </div>
              <div v-if="k3JsonPointOverlapReport.total === 0" class="text-muted">
                目前未偵測到同座標重疊（同一 layout-network-grid 座標上多個不同黑點站名／多個不同
                connect 站名／connect+黑）。
              </div>
              <div v-else class="text-muted">
                <div
                  v-for="(row, i) in k3JsonPointOverlapReport.rows"
                  :key="`ov-group-${i}`"
                  class="mb-1"
                >
                  <div style="color: #333">
                    <strong>路線：</strong>{{ row.routeLabel }} ・
                    <strong>Group {{ i + 1 }}</strong>
                  </div>
                  <div
                    v-for="(m, mi) in row.members"
                    :key="`ov-member-${i}-${mi}`"
                    class="text-muted"
                    style="padding-left: 8px"
                  >
                    ({{ m.x }}, {{ m.y }}) [{{ m.hasConnect ? 'connect' : ''
                    }}{{ m.hasConnect && m.hasBlack ? '+' : '' }}{{ m.hasBlack ? 'black' : '' }}]：
                    <div
                      v-for="(nm, ni) in m.connectNames"
                      :key="`ov-member-${i}-${mi}-connect-${ni}`"
                      style="padding-left: 10px"
                    >
                      connect={{ nm }}
                    </div>
                    <div
                      v-for="(nm, ni) in m.blackNames"
                      :key="`ov-member-${i}-${mi}-black-${ni}`"
                      style="padding-left: 10px"
                    >
                      black={{ nm }}
                    </div>
                    <span v-if="m.connectNames.length === 0 && m.blackNames.length === 0">
                      （無可辨識站名）
                    </span>
                  </div>
                </div>
                <span v-if="k3JsonPointOverlapReport.truncated">…（僅顯示前 30 處）</span>
              </div>
            </div>
            <div
              v-if="k3JsonRouteOverlapReport"
              class="mt-2 p-2 border rounded"
              style="font-size: 11px; line-height: 1.4; background: #f7fbff"
            >
              <div class="my-content-sm-black mb-1">
                JSON（K3 分頁）重疊路線（layout-network-grid：水平／垂直共線且區間重疊）：
                <span
                  :style="{
                    color: k3JsonRouteOverlapReport.total > 0 ? '#c00' : '#2e7d32',
                    fontWeight: 'bold',
                  }"
                >
                  {{ k3JsonRouteOverlapReport.total }} 段
                </span>
              </div>
              <div v-if="k3JsonRouteOverlapReport.total === 0" class="text-muted">
                目前未偵測到不同路線在 layout-network-grid
                上水平／垂直共線且線段重疊（僅端點相接不算）。
              </div>
              <div v-else class="text-muted">
                <div
                  v-for="(row, i) in k3JsonRouteOverlapReport.rows"
                  :key="`ov-route-${i}`"
                  class="mb-1"
                  style="padding-left: 8px"
                >
                  {{ row.routeA }} ↔ {{ row.routeB }}： ({{ row.start[0] }}, {{ row.start[1] }}) px
                  → ({{ row.end[0] }}, {{ row.end[1] }}) px
                </div>
                <span v-if="k3JsonRouteOverlapReport.truncated">…（僅顯示前 60 段）</span>
              </div>
            </div>
            <div
              v-if="k3JsonConnectBlackCoordsReport"
              class="mt-2 p-2 border rounded"
              style="
                font-size: 11px;
                line-height: 1.4;
                background: #f4fff7;
                max-height: 320px;
                overflow-y: auto;
              "
            >
              <div class="my-content-sm-black mb-1">
                JSON（K3 分頁）紅／藍／黑點座標與 display 狀態（taipei_c4／c5：內繪區 px，與主圖
                tooltip；以路線分組顯示）：
                <span class="text-muted"
                  >共 {{ k3JsonConnectBlackCoordsReport.total }} 筆（已去重）</span
                >
              </div>
              <div
                v-for="(rt, ri) in k3JsonConnectBlackCoordsReport.routes"
                :key="`k3-coords-route-${ri}`"
                class="mb-2"
              >
                <div style="color: #333"><strong>路線：</strong>{{ rt.routeLabel }}</div>
                <div
                  v-for="(it, ii) in rt.items"
                  :key="`k3-coords-${ri}-${ii}`"
                  class="text-muted"
                  style="padding-left: 8px"
                >
                  {{ it.kindLabel }} · ({{ it.x }}, {{ it.y }}) · display={{ it.display
                  }}<span v-if="it.name"> · {{ it.name }}</span>
                </div>
              </div>
              <div v-if="k3JsonConnectBlackCoordsReport.truncated" class="text-muted mt-1">
                …（僅列前 {{ k3JsonConnectBlackCoordsReport.maxRows }} 筆，其餘未掃完）
              </div>
            </div>
          </template>
        </div>

        <!-- 沒有可執行操作的提示（taipei_g／taipei_h 另有底部專區，不顯示此列） -->
        <div
          v-if="currentLayer && !isTaipeiF && !hasSpaceNetworkStandaloneRouteWeightToggle"
          class="pb-3 mb-3"
        >
          <div class="my-title-xs-gray text-center">此圖層沒有可執行的操作</div>
        </div>

        <!-- taipei_g／taipei_h：依權重差門檻合併黑點路段（Control 分頁最底部） -->
        <div
          v-if="isTaipeiF && currentLayer?.spaceNetworkGridJsonData?.length"
          class="pb-3 mb-0 border-top pt-3"
        >
          <div class="my-title-xs-gray pb-2">合併黑點路段（合併後取較大權重）</div>
          <button
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="mergeTaipeiFBlackJunctionSegments(0)"
          >
            合併黑點路段 (權重差&lt;=0)
          </button>
          <button
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="mergeTaipeiFBlackJunctionSegments(1)"
          >
            合併黑點路段 (權重差&lt;=1)
          </button>
          <button
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer mb-2"
            @click="mergeTaipeiFBlackJunctionSegments(2)"
          >
            合併黑點路段 (權重差&lt;=2)
          </button>
          <button
            class="btn rounded-pill border-0 my-btn-blue my-font-size-xs text-nowrap w-100 my-cursor-pointer"
            @click="mergeTaipeiFBlackJunctionSegments(3)"
          >
            合併黑點路段 (權重差&lt;=3)
          </button>
        </div>
      </div>
    </div>

    <!-- 沒有開啟的圖層 -->
    <div v-else class="d-flex align-items-center justify-content-center h-100">
      <div class="my-title-xs-gray text-center">沒有開啟的圖層</div>
    </div>

    <input
      id="orthogonal-vh-draw-local-json-input"
      type="file"
      class="d-none"
      accept=".json,application/json"
      @change="orthogonalVhDrawControlTabApi.onOrthogonalVhDrawLocalJsonInputChange"
    />
    <input
      id="taipei-osm-space-grid-local-file-input"
      type="file"
      class="d-none"
      accept=".osm,.xml,.geojson,application/geo+json,application/json,application/xml,text/xml,*/*"
      @change="onTaipeiOsmSpaceGridLocalFileInputChange"
    />
  </div>
</template>

<style scoped>
  /* 🎨 開關樣式：同 LeftView 的 LayersTab toggle（input + label） */
  .layer-toggle input[type='checkbox'] {
    height: 0;
    width: 0;
    visibility: hidden;
  }

  .layer-toggle label {
    cursor: pointer;
    width: 28px;
    height: 16px;
    background: var(--my-color-gray-300);
    display: block;
    border-radius: 16px;
    position: relative;
    transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .layer-toggle label:after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    background: var(--my-color-white);
    border-radius: 12px;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .layer-toggle input:checked + label {
    background: var(--my-color-green);
  }

  .layer-toggle input:checked + label:after {
    transform: translateX(12px);
  }

  .layer-toggle input:disabled + label {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
