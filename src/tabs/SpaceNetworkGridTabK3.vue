<script setup>
  /**
   * 📊 SpaceNetworkGridTabK3.vue - taipei_k3 專用：畫法同 SpaceNetworkGridTab，資料讀寫獨立複製欄位
   *
   * 功能說明：
   * 1. 📑 圖層分頁導航 - 顯示所有可見圖層的標籤頁
   * 2. 📊 當前圖層資訊 - 顯示選中圖層的名稱和詳細信息
   * 3. 📈 圖層摘要資料 - 顯示總數量、行政區數量等統計信息
   * 4. 🎨 D3.js 圖表 - 使用 D3.js 繪製各種類型的圖表（網格示意圖、行政區示意圖）
   * 5. 🔄 自動切換功能 - 當新圖層開啟時自動切換到該圖層的分頁
   *
   * @component SpaceNetworkGridTabK3
   * @version 2.0.0
   * @author Kevin Cheng
   */

  import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
  import { useDataStore } from '@/stores/dataStore.js';
  import {
    buildStraightSegments,
    computeFlipAnalysis,
    buildNShapeList,
    computeNShapeAnalysis,
  } from '@/utils/segmentUtils.js';
  import {
    networkCoordToMinSpacingOverlayCell,
    closestPointOnPolyline,
    collectLineStationGridPointsFromStationData,
    collectStationPlacementPoints,
    normalizeSpaceNetworkDataToFlatSegments,
  } from '@/utils/gridNormalizationMinDistance.js';
  import { createReducedSchematicPlotMapper } from '@/utils/schematicPlotMapper.js';
  import {
    overlayCoordsBeforeRemovalFromReduced,
    overlayReducedTooltipPair,
    remapOverlayCellAfterRemoval,
  } from '@/utils/dataExecute/execute_d_to_e_test.js';
  import {
    bresenhamGridCells,
    resolveTaipeiFStationNameAndId,
    buildConnectNumberToNameIdMap,
    buildConnectGridKeyToNameIdMap,
    buildSectionRouteGridNameIdMap,
    buildSectionGridKeyToNameIdMap,
    buildBlackStationDisplayByGrid,
    applyTaipeiFMergePruneRebuildToLayer,
  } from '@/utils/randomConnectSegmentWeights.js';
  import { buildListedSectionRouteGridCellKeySet } from '@/utils/taipeiFColRouteHighlightPlan.js';
  import * as layerStationsTowardSchematicCenter from '@/utils/layerStationsTowardSchematicCenter.js';
  import { isTaipeiTestStraighteningLayerId } from '@/utils/taipeiTestStraighteningLayerIds.js';
  import {
    TAIPEI_TEST_SPACE_NETWORK_STATION_TAB_IDS,
    isTaipeiTestCDLayerTab,
    isTaipeiTestCDELayerTab,
    isTaipeiTestCLayerTab,
    isTaipeiTestDLayerTab,
    isTaipeiTestELayerTab,
    isTaipeiTestFghiSpaceLayerTab as isTaipeiEfinalSpaceLayerTab,
    isTaipeiTestGOrHWeightLayerTab as isTaipeiGOrHWeightLayer,
    isTaipeiTestFLayerTab,
    isTaipeiTestILayerTab,
    isTaipeiTest3BcdeLayerTab,
    isTaipeiTest3I3OrJ3LayerTab,
    isTaipeiE3DiagonalSawtoothDisplayLayerTab,
  } from '@/utils/taipeiTestPipeline.js';
  import { expandPolylineDiagonalsToSawtoothDisplay } from '@/utils/taipeiTest3/diagonalToSawtoothDisplay.js';
  import { isMapDrawnRoutesExportArray } from '@/utils/mapDrawnRoutesImport.js';

  import * as d3 from 'd3';
  import {
    niceTickStepMultipleOf5,
    buildTicksInRange,
    snapCoarseGridStepToMultipleOf5,
    formatAxisTickLabelMaxTwoDecimals,
  } from '@/utils/gridAxisTicks.js';
  import {
    normalizeTaipeiK3WeightKeyPart,
    buildRouteSequenceWeightLookupFromTaipeiK3DataTable,
  } from '@/utils/taipeiK3JunctionDataTable.js';
  import {
    buildRouteWeightStrokeScaleLinear,
    collectWeightsFromK3RouteDrawing,
    formatStrokeWidthPx,
    strokeWidthPxFromWeightScale,
  } from '@/utils/routeWeightStrokeScale.js';
  const emit = defineEmits(['active-layer-change']);

  /** taipei_f／taipei_g：與邊緣欄／列最大權重標籤同源，供權重比例格寬／列高用 */
  function accumulateTaipeiFColRowWeightMaxFromFeatures(routeFeatures) {
    const colWeightMax = new Map();
    const rowWeightMax = new Map();
    const consumeGeom = (geomCoords, props) => {
      const sw = props?.station_weights;
      if (!Array.isArray(sw) || sw.length === 0) return;
      const refPoints = props.original_points || props.points || geomCoords;
      if (!Array.isArray(refPoints) || refPoints.length < 2) return;
      const refCoords = refPoints
        .map((pt) => {
          if (Array.isArray(pt)) {
            return pt.length >= 2 ? [pt[0], pt[1]] : null;
          }
          return pt && pt.x !== undefined && pt.y !== undefined ? [pt.x, pt.y] : null;
        })
        .filter((pt) => pt !== null);
      if (refCoords.length < 2) return;
      for (const weightInfo of sw) {
        const { start_idx, end_idx, weight } = weightInfo;
        const wn = Number(weight);
        if (
          !Number.isFinite(wn) ||
          typeof start_idx !== 'number' ||
          typeof end_idx !== 'number' ||
          start_idx < 0 ||
          end_idx < 0 ||
          start_idx >= refCoords.length ||
          end_idx >= refCoords.length ||
          start_idx >= end_idx
        ) {
          continue;
        }
        for (let i = start_idx; i < end_idx; i++) {
          const ax = Math.round(Number(refCoords[i][0]));
          const ay = Math.round(Number(refCoords[i][1]));
          const bx = Math.round(Number(refCoords[i + 1][0]));
          const by = Math.round(Number(refCoords[i + 1][1]));
          const verts = bresenhamGridCells(ax, ay, bx, by);
          for (let j = 0; j < verts.length - 1; j++) {
            const [x0, y0] = verts[j];
            const [x1, y1] = verts[j + 1];
            if (y0 === y1) {
              const ix = Math.min(x0, x1);
              colWeightMax.set(ix, Math.max(colWeightMax.get(ix) ?? -Infinity, wn));
            } else if (x0 === x1) {
              const iy = Math.min(y0, y1);
              rowWeightMax.set(iy, Math.max(rowWeightMax.get(iy) ?? -Infinity, wn));
            }
          }
        }
      }
    };
    for (const feature of routeFeatures || []) {
      if (!feature?.geometry) continue;
      const props = feature.properties || {};
      const geom = feature.geometry;
      if (geom.type === 'LineString') consumeGeom(geom.coordinates, props);
      else if (geom.type === 'MultiLineString') {
        for (const coords of geom.coordinates || []) consumeGeom(coords, props);
      }
    }
    return { colWeightMax, rowWeightMax };
  }

  /**
   * 欄寬 ∝ 該欄最大權重（預設平方；squareWeights=false 時為線性）
   * 全為 0 則均分
   */
  function createTaipeiFWeightedXScale(
    xMin,
    xMax,
    marginLeft,
    plotW,
    colWeightMax,
    squareWeights = true
  ) {
    const n = Math.max(0, Math.round(xMax - xMin));
    if (n <= 0) {
      const s = d3
        .scaleLinear()
        .domain([xMin, xMax])
        .range([marginLeft, marginLeft + plotW]);
      return { scale: s, minCellWFrac: 1 };
    }
    const contribs = [];
    for (let j = 0; j < n; j++) {
      const ix = xMin + j;
      const w = colWeightMax.get(ix);
      if (Number.isFinite(w) && w > 0) {
        contribs.push(squareWeights ? w * w : w);
      } else {
        contribs.push(0);
      }
    }
    const sum = contribs.reduce((a, b) => a + b, 0);
    const widthsPx = sum <= 0 ? Array(n).fill(plotW / n) : contribs.map((c) => (c / sum) * plotW);
    const minCellWFrac = Math.min(...widthsPx) / plotW;
    const xBorderPx = [marginLeft];
    for (let j = 0; j < n; j++) xBorderPx.push(xBorderPx[j] + widthsPx[j]);
    const scale = (x) => {
      const xf = Number(x);
      if (!Number.isFinite(xf)) return marginLeft;
      if (xf <= xMin) return xBorderPx[0];
      if (xf >= xMax) return xBorderPx[n];
      const j = Math.min(Math.max(0, Math.floor(xf - xMin)), n - 1);
      const t = xf - (xMin + j);
      return xBorderPx[j] + t * widthsPx[j];
    };
    scale.invert = (px) => {
      const p = Number(px);
      if (p <= xBorderPx[0]) return xMin;
      if (p >= xBorderPx[n]) return xMax;
      let j = 0;
      while (j < n && p > xBorderPx[j + 1]) j++;
      j = Math.min(j, n - 1);
      const denom = widthsPx[j] > 1e-12 ? widthsPx[j] : 1;
      return xMin + j + (p - xBorderPx[j]) / denom;
    };
    return { scale, minCellWFrac };
  }

  /**
   * 列高 ∝ 該列最大權重（預設平方；squareWeights=false 時為線性）
   * 全為 0 則均分；data y 大者在畫面上方
   */
  function createTaipeiFWeightedYScale(
    yMin,
    yMax,
    marginTop,
    plotH,
    rowWeightMax,
    squareWeights = true
  ) {
    const n = Math.max(0, Math.round(yMax - yMin));
    if (n <= 0) {
      const s = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([marginTop, marginTop + plotH]);
      return { scale: s, minCellHFrac: 1 };
    }
    const contribs = [];
    for (let j = 0; j < n; j++) {
      const iy = yMin + j;
      const w = rowWeightMax.get(iy);
      if (Number.isFinite(w) && w > 0) {
        contribs.push(squareWeights ? w * w : w);
      } else {
        contribs.push(0);
      }
    }
    const sum = contribs.reduce((a, b) => a + b, 0);
    const heightsPx = sum <= 0 ? Array(n).fill(plotH / n) : contribs.map((c) => (c / sum) * plotH);
    const minCellHFrac = Math.min(...heightsPx) / plotH;
    const yLinePx = new Array(n + 1);
    yLinePx[n] = marginTop;
    for (let k = n - 1; k >= 0; k--) {
      yLinePx[k] = yLinePx[k + 1] + heightsPx[k];
    }
    const scale = (y) => {
      const yf = Number(y);
      if (!Number.isFinite(yf)) return marginTop + plotH / 2;
      if (yf <= yMin) return yLinePx[0];
      if (yf >= yMax) return yLinePx[n];
      const j = Math.min(Math.max(0, Math.floor(yf - yMin)), n - 1);
      const t = yf - (yMin + j);
      return yLinePx[j] + t * (yLinePx[j + 1] - yLinePx[j]);
    };
    scale.invert = (py) => {
      const p = Number(py);
      if (p <= marginTop) return yMax;
      if (p >= marginTop + plotH) return yMin;
      for (let k = 0; k < n; k++) {
        const yLo = yLinePx[k];
        const yHi = yLinePx[k + 1];
        const span = yHi - yLo;
        if (span === 0) continue;
        const lo = Math.min(yLo, yHi);
        const hi = Math.max(yLo, yHi);
        if (p >= lo && p <= hi) {
          return yMin + k + (p - yLo) / span;
        }
      }
      return (yMin + yMax) / 2;
    };
    return { scale, minCellHFrac };
  }

  // Props
  const props = defineProps({
    containerHeight: {
      type: Number,
      default: 600,
    },
    isPanelDragging: {
      type: Boolean,
      default: false,
    },
    activeMarkers: {
      type: Array,
      default: () => [],
    },
  });

  const dataStore = useDataStore();

  /** k3 在此分頁讀寫之獨立欄位（與主「空間網絡網格」分頁的 spaceNetworkGridJsonData 等互不共用） */
  const K3_GRID_TAB_K_TAB_LAYER_IDS = [];
  const useK3TabGridFieldsForLayer = (layer) =>
    layer && K3_GRID_TAB_K_TAB_LAYER_IDS.includes(layer.layerId);
  const snRoutesForK3TabLayer = (layer) => {
    if (!layer) return null;
    if (useK3TabGridFieldsForLayer(layer)) return layer.spaceNetworkGridJsonDataK3Tab ?? null;
    return layer.spaceNetworkGridJsonData ?? null;
  };
  const snSectionForK3TabLayer = (layer) => {
    if (!layer) return null;
    if (useK3TabGridFieldsForLayer(layer))
      return layer.spaceNetworkGridJsonDataK3Tab_SectionData ?? null;
    return layer.spaceNetworkGridJsonData_SectionData ?? null;
  };
  const snConnectForK3TabLayer = (layer) => {
    if (!layer) return null;
    if (useK3TabGridFieldsForLayer(layer))
      return layer.spaceNetworkGridJsonDataK3Tab_ConnectData ?? null;
    return layer.spaceNetworkGridJsonData_ConnectData ?? null;
  };
  const snStationForK3TabLayer = (layer) => {
    if (!layer) return null;
    if (useK3TabGridFieldsForLayer(layer))
      return layer.spaceNetworkGridJsonDataK3Tab_StationData ?? null;
    return layer.spaceNetworkGridJsonData_StationData ?? null;
  };

  const activeLayerTab = ref(null); /** 📑 當前作用中的圖層分頁 */

  /**
   * 🆔 獲取動態容器 ID (Get Dynamic Container ID)
   * 基於當前活動圖層生成唯一的容器 ID，避免多圖層衝突
   * @returns {string} 容器 ID
   */
  const getContainerId = () => {
    const layerId = activeLayerTab.value || 'default';
    return `schematic-container-space-network-grid-k3tab-${layerId}`;
  };

  // ==================== 📊 示意圖繪製相關狀態 (Schematic Drawing State) ====================

  /** 📊 網格數據狀態 (Grid Data State) */
  const gridData = ref(null);
  const gridDimensions = ref({ x: 10, y: 10 });

  /** 📊 行政區數據狀態 (Administrative District Data State) */
  const nodeData = ref(null);
  const linkData = ref(null);

  /** 📊 地圖數據狀態 (Map Data State) */
  const mapGeoJsonData = ref(null);

  /** taipei_g：resize 觸發自動合併時避免重入 */
  const taipeiFResizeAutoMergeRunning = ref(false);

  // ==================== 🎨 視覺化常數 (Visualization Constants) ====================

  /** 🎨 顏色配置 (Color Configuration) */
  const COLOR_CONFIG = {
    BACKGROUND: '#FFFFFF',
    GRID_LINE: '#666666',
    GRID_LINE_SECONDARY: '#333333',
    NODE_FILL: '#4CAF50',
    NODE_STROKE: '#2E7D32',
    TEXT_FILL: '#000000',
  };

  /** 🎨 顏色映射 (Color Mapping) */
  const colorMap = {
    red: '#ff0000',
    lightpink: '#ffb3ba',
    blue: '#0066cc',
    green: '#00aa44',
    lightgreen: '#90ee90',
    orange: '#ff8800',
    brown: '#8b4513',
    yellow: '#ffcc00',
    purple: '#800080',
    paleturquoise: '#afeeee',
    limegreen: '#32cd32',
  };

  // ResizeObserver 實例
  let resizeObserver = null;

  // 獲取所有開啟且有資料的圖層
  const visibleLayers = computed(() => {
    const allLayers = dataStore.getAllLayers();
    return allLayers.filter((layer) => layer.visible);
  });

  /**
   * 📑 設定作用中圖層分頁 (Set Active Layer Tab)
   * @param {string} layerId - 圖層 ID
   */
  const setActiveLayerTab = (layerId) => {
    // 如果切換到相同圖層，不需要重新處理
    if (activeLayerTab.value === layerId) {
      return;
    }

    // 立即清除 SVG 內容和 tooltip，避免重疊
    const oldContainerId = getContainerId();
    d3.select(`#${oldContainerId}`).selectAll('svg').remove();
    d3.select('body').selectAll('.d3js-map-tooltip').remove();

    // 清除數據狀態
    gridData.value = null;
    nodeData.value = null;
    linkData.value = null;
    mapGeoJsonData.value = null;

    // 設置新的活動圖層
    activeLayerTab.value = layerId;

    // 通知父層目前 UpperView 的作用圖層
    emit('active-layer-change', activeLayerTab.value);
  };

  /**
   * 📊 當前圖層摘要 (Current Layer Summary)
   * 檢查圖層是否有任何可用的數據（dashboardData、spaceNetworkGridJsonData 等）
   */
  const currentLayerSummary = computed(() => {
    if (!activeLayerTab.value) {
      return null;
    }

    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    if (!layer) return null;

    // 檢查是否有任何可用的數據（示意圖主資料為 snRoutes／dataTable）
    const routesSnap = snRoutesForK3TabLayer(layer);
    const hasData =
      (layer.dashboardData !== null && layer.dashboardData !== undefined) ||
      (routesSnap !== null && routesSnap !== undefined) ||
      (layer.dataTableData !== null && layer.dataTableData !== undefined);

    // 如果有數據，返回 dashboardData（如果存在）或一個標記物件
    return hasData ? layer.dashboardData || { hasData: true } : null;
  });

  /**
   * 📊 檢查當前圖層是否有 layerInfoData
   */
  const hasLayerInfoData = computed(() => {
    if (!activeLayerTab.value) {
      return false;
    }

    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);

    return layer && layer.layerInfoData !== null && layer.layerInfoData !== undefined;
  });

  /**
   * 📊 取得圖層完整標題 (包含群組名稱) (Get Layer Full Title with Group Name)
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
   * 📦 取得此分頁可用的主要示意圖資料
   * SpaceNetworkGridTab 只看 spaceNetworkGridJsonData
   */
  const getSchematicJsonData = (layer) => {
    if (!layer) return null;
    return snRoutesForK3TabLayer(layer);
  };

  /**
   * 🎨 判斷是否為網格示意圖圖層 (Check if Layer is Grid Schematic)
   * @param {string} layerId - 圖層 ID
   * @returns {boolean} 是否為網格示意圖圖層
   */
  const isGridSchematicLayer = (layerId) => {
    if (!layerId) return false;
    const layer = dataStore.findLayerById(layerId);
    return layer && layer.isGridSchematic === true;
  };

  /**
   * 🗺️ 判斷是否為地圖圖層 (Check if Layer has Map GeoJSON Data or Normalize Segments)
   * @param {string} layerId - 圖層 ID
   * @returns {boolean} 是否為地圖圖層
   */
  const getMapFeatureCollection = (layer) => {
    const data = getSchematicJsonData(layer);
    if (!layer || !data) return null;
    if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) return data;
    return null;
  };

  /**
   * 🗺️ 檢查是否為 Normalize Segments 格式
   * @param {any} data - 數據
   * @returns {boolean} 是否為 Normalize Segments 格式
   */
  const isNormalizeSegmentsFormat = (data) => {
    if (!Array.isArray(data) || data.length === 0) return false;
    // 檢查第一個元素是否有 Normalize Segments 的結構
    const firstItem = data[0];

    // 檢查是否為 2-5 格式（按路線分組）
    if (firstItem && firstItem.route_name && Array.isArray(firstItem.segments)) {
      return true;
    }

    // 檢查是否為一般 Normalize Segments 格式
    return (
      firstItem &&
      typeof firstItem === 'object' &&
      Array.isArray(firstItem.points) &&
      firstItem.points.length >= 2 &&
      Array.isArray(firstItem.points[0]) &&
      firstItem.points[0].length === 2
    );
  };

  const isMapLayer = (layerId) => {
    if (!layerId) return false;
    const layer = dataStore.findLayerById(layerId);
    if (!layer) return false;

    // 檢查是否為 Normalize Segments 格式
    const d = getSchematicJsonData(layer);
    if (d && isNormalizeSegmentsFormat(d)) {
      return true;
    }

    // 檢查是否為 GeoJSON FeatureCollection 格式
    const fc = getMapFeatureCollection(layer);
    if (!fc) return false;

    // 檢查是否包含 Point / LineString / MultiLineString features
    return fc.features.some(
      (f) =>
        f &&
        f.geometry &&
        (f.geometry.type === 'Point' ||
          f.geometry.type === 'LineString' ||
          f.geometry.type === 'MultiLineString')
    );
  };

  // ==================== 📊 數據載入和處理函數 (Data Loading and Processing Functions) ====================

  /**
   * 📊 載入圖層數據 (Load Layer Data)
   * @param {string} layerId - 圖層 ID
   */
  const loadLayerData = async (layerId) => {
    try {
      // 找到指定的圖層
      const targetLayer = dataStore.findLayerById(layerId);
      if (!targetLayer) {
        throw new Error(`找不到圖層配置: ${layerId}`);
      }

      // 🎯 優先檢查是否為地圖圖層（有 GeoJSON 數據或 Normalize Segments）
      if (isMapLayer(layerId)) {
        const schematicData = getSchematicJsonData(targetLayer);
        // 檢查是否為 Normalize Segments 格式
        if (schematicData && isNormalizeSegmentsFormat(schematicData)) {
          // Normalize Segments 格式
          mapGeoJsonData.value = {
            type: 'NormalizeSegments',
            segments: schematicData,
          };
        } else {
          // 地圖數據（GeoJSON 格式）
          mapGeoJsonData.value = getMapFeatureCollection(targetLayer);
        }
        // 清除其他數據狀態
        gridData.value = null;
        nodeData.value = null;
        linkData.value = null;
      } else if (targetLayer.dataTableData && targetLayer.dataTableData.length > 0) {
        // 清除地圖數據狀態
        mapGeoJsonData.value = null;

        // 表格數據格式，轉換為示意圖格式
        const schematicData = targetLayer.dataTableData.map((item) => ({
          color: item.color,
          name: item.name,
          nodes: item.nodes || [],
        }));

        nodeData.value = schematicData;

        setLinkData();
      } else {
        // 如果有 spaceNetworkGridJsonData，嘗試作為其他格式處理
        // 清除地圖數據狀態
        mapGeoJsonData.value = null;

        const d = getSchematicJsonData(targetLayer);
        if (!d) {
          console.error('❌ 無法找到圖層數據:', {
            layerId: layerId,
            hasSpaceNetworkGridJsonData: !!snRoutesForK3TabLayer(targetLayer),
            hasDataTableData: !!targetLayer.dataTableData,
            isLoaded: targetLayer.isLoaded,
          });
          throw new Error('無法從圖層數據中提取示意圖數據');
        }

        // 嘗試將資料作為節點數據使用
        if (Array.isArray(d)) {
          nodeData.value = d;
          setLinkData();
        } else if (d.type === 'grid') {
          // 網格數據
          gridData.value = d;
          gridDimensions.value = {
            x: d.gridX,
            y: d.gridY,
          };
        } else {
          // 其他格式，直接使用
          nodeData.value = d;
          setLinkData();
        }
      }
    } catch (error) {
      console.error('❌ 無法載入圖層數據:', error.message);
    }
  };

  /**
   * 📊 設定連接數據 (Set Link Data)
   */
  const setLinkData = () => {
    if (!nodeData.value) {
      console.warn('⚠️ setLinkData: nodeData.value 為空');
      linkData.value = [];
      return;
    }

    // 確保 nodeData.value 是數組
    if (!Array.isArray(nodeData.value)) {
      console.error('❌ setLinkData: nodeData.value 不是數組:', nodeData.value);
      linkData.value = [];
      return;
    }

    linkData.value = [];

    nodeData.value.forEach((path, index) => {
      // 確保 path 和 path.nodes 存在且是數組
      if (!path) {
        console.warn(`⚠️ setLinkData: 路徑 ${index} 為 null 或 undefined，跳過`);
        return;
      }
      if (!path.nodes) {
        console.warn(
          `⚠️ setLinkData: 路徑 ${index} (${path.name || '未命名'}) 缺少 nodes 屬性，跳過`
        );
        return;
      }
      if (!Array.isArray(path.nodes)) {
        console.warn(
          `⚠️ setLinkData: 路徑 ${index} (${path.name || '未命名'}) 的 nodes 不是數組 (${typeof path.nodes})，跳過`
        );
        return;
      }

      let thisX, thisY;
      let nodes = [];

      path.nodes.slice(0, path.nodes.length - 1).forEach((node) => {
        thisX = node.coord.x;
        thisY = node.coord.y;

        switch (node.type) {
          case 1:
          case 6:
          case 21:
          case 41:
            thisX = node.coord.x + 0.5;
            thisY = node.coord.y;
            break;
          case 2:
          case 8:
          case 12:
          case 32:
            thisX = node.coord.x;
            thisY = node.coord.y - 0.5;
            break;
          case 3:
          case 5:
          case 23:
          case 43:
            thisX = node.coord.x - 0.5;
            thisY = node.coord.y;
            break;
          case 4:
          case 7:
          case 14:
          case 34:
            thisX = node.coord.x;
            thisY = node.coord.y + 0.5;
            break;
        }

        nodes.push({
          value: node.value,
          type: node.type,
          coord: { x: thisX, y: thisY },
        });
      });

      let data = {
        color: colorMap[path.color] || path.color,
        name: path.name,
        nodes: nodes,
      };

      linkData.value.push(data);
    });
  };

  // ==================== 📏 容器尺寸和繪製函數 (Container Dimensions and Drawing Functions) ====================

  /**
   * 📏 獲取容器尺寸 (Get Container Dimensions)
   * @returns {Object} 包含 width 和 height 的尺寸物件
   */
  const getDimensions = () => {
    const container = document.getElementById(getContainerId());

    if (container) {
      // 獲取容器的實際可用尺寸
      const rect = container.getBoundingClientRect();
      const width = container.clientWidth || rect.width;
      const height = container.clientHeight || rect.height;

      const dimensions = {
        width: Math.max(width, 40),
        height: Math.max(height, 30),
      };

      // 更新 dataStore 中的尺寸狀態
      dataStore.updateD3jsDimensions(dimensions.width, dimensions.height);

      return dimensions;
    }

    // 如果找不到容器，使用預設尺寸
    const defaultDimensions = {
      width: 800,
      height: 600,
    };

    // 更新 dataStore 中的尺寸狀態
    dataStore.updateD3jsDimensions(defaultDimensions.width, defaultDimensions.height);

    return defaultDimensions;
  };

  /**
   * taipei_g 線性網格：依目前 SVG 版面、viewBox 與 d3 zoom 換算「一格」的螢幕 pt（與 Test4 相同 px→pt）
   */
  const refreshSpaceNetworkMinCellDimensions = () => {
    const b = dataStore.spaceNetworkSchematicPlotBounds;
    if (!b || !isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
      return;
    }
    const svgEl = document.querySelector(`#${getContainerId()} svg`);
    if (!svgEl || typeof svgEl.getBoundingClientRect !== 'function') {
      return;
    }
    const t = d3.zoomTransform(svgEl);
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    const vbw = vb && vb.width > 0 ? vb.width : 1;
    const vbh = vb && vb.height > 0 ? vb.height : 1;
    const scaleX = rect.width / vbw;
    const scaleY = rect.height / vbh;
    const xSpan = Math.max(1e-9, b.xSpan);
    const ySpan = Math.max(1e-9, b.ySpan);
    const cellWpxScreen =
      b.minCellWFrac != null && Number(b.minCellWFrac) > 0
        ? Number(b.minCellWFrac) * b.plotW * t.k * scaleX
        : (b.plotW / xSpan) * t.k * scaleX;
    const cellHpxScreen =
      b.minCellHFrac != null && Number(b.minCellHFrac) > 0
        ? Number(b.minCellHFrac) * b.plotH * t.k * scaleY
        : (b.plotH / ySpan) * t.k * scaleY;
    const ptWRaw = cellWpxScreen > 0 ? Math.max(1, Math.ceil(cellWpxScreen * 0.75)) : 0;
    const ptHRaw = cellHpxScreen > 0 ? Math.max(1, Math.ceil(cellHpxScreen * 0.75)) : 0;

    const rawMinW = Number(dataStore.taipeiFResizeMinWidthPtThreshold);
    const rawMinH = Number(dataStore.taipeiFResizeMinHeightPtThreshold);
    const MIN_W_PT = Number.isFinite(rawMinW) && rawMinW > 0 ? rawMinW : 10;
    const MIN_H_PT = Number.isFinite(rawMinH) && rawMinH > 0 ? rawMinH : 3;

    let reportMinW = ptWRaw;
    let reportMinH = ptHRaw;
    dataStore.updateSpaceNetworkGridMinCellDimensions(reportMinW, reportMinH);

    // 滑鼠縮放時不跑縮減網格（resize 依門檻自動合併）
    if (dataStore.taipeiFSpaceNetworkMouseZoom === true) {
      return;
    }
    const MAX_MERGE_DIFF = 4;
    if (taipeiFResizeAutoMergeRunning.value) return;
    const fLayer = isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)
      ? dataStore.findLayerById(activeLayerTab.value)
      : null;
    if (
      !fLayer ||
      !Array.isArray(fLayer.spaceNetworkGridJsonData) ||
      fLayer.spaceNetworkGridJsonData.length === 0
    ) {
      return;
    }
    // taipei_i：僅路網顯示，不跑與 Control 相同的 resize 自動合併
    if (fLayer.layerId != null && isTaipeiTestILayerTab(fLayer.layerId)) return;

    if (ptWRaw >= MIN_W_PT) {
      fLayer.taipeiFResizeAutoMergeHorizontalNext = 0;
    }
    if (ptHRaw >= MIN_H_PT) {
      fLayer.taipeiFResizeAutoMergeVerticalNext = 0;
    }

    const hNext = fLayer.taipeiFResizeAutoMergeHorizontalNext ?? 0;
    const vNext = fLayer.taipeiFResizeAutoMergeVerticalNext ?? 0;

    let axis = null;
    let diff = 0;
    if (ptWRaw < MIN_W_PT && hNext <= MAX_MERGE_DIFF) {
      axis = 'horizontal';
      diff = hNext;
    } else if (ptHRaw < MIN_H_PT && vNext <= MAX_MERGE_DIFF) {
      axis = 'vertical';
      diff = vNext;
    }
    if (!axis) return;

    taipeiFResizeAutoMergeRunning.value = true;
    nextTick(() => {
      try {
        // 與 Control「合併黑點路段」相同：merge → rebuild → 刪空欄列 → rebuild → 表格（見 applyTaipeiFMergePruneRebuildToLayer）
        const mergeResult = applyTaipeiFMergePruneRebuildToLayer(fLayer, {
          maxWeightDiff: diff,
          mergeAxisConstraint: axis,
        });
        dataStore.setTaipeiFResizeLastAutoMergeInfo({
          maxWeightDiff: diff,
          mergeAxisConstraint: axis,
          mergeCount: mergeResult.mergeCount,
          removedColCount: mergeResult.removedColCount,
          removedRowCount: mergeResult.removedRowCount,
          removedCols: mergeResult.removedCols,
          removedRows: mergeResult.removedRows,
          source: 'resize',
          at: Date.now(),
        });
        if (axis === 'horizontal') {
          fLayer.taipeiFResizeAutoMergeHorizontalNext = hNext + 1;
        } else {
          fLayer.taipeiFResizeAutoMergeVerticalNext = vNext + 1;
        }
        dataStore.requestSpaceNetworkGridFullRedraw();
      } finally {
        taipeiFResizeAutoMergeRunning.value = false;
      }
    });
  };

  /**
   * 🎨 繪製網格示意圖 (Draw Grid Schematic)
   */
  const drawGridSchematic = () => {
    if (!gridData.value) {
      return;
    }

    // 獲取容器尺寸
    const dimensions = getDimensions();

    // 添加適當的邊距
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // 檢查是否已存在 SVG，如果存在且尺寸相同則不需要重繪
    const containerId = getContainerId();
    const existingSvg = d3.select(`#${containerId}`).select('svg');
    if (existingSvg.size() > 0) {
      const existingWidth = parseFloat(existingSvg.attr('width'));
      const existingHeight = parseFloat(existingSvg.attr('height'));

      // 如果尺寸變化很小（小於 2px），則只更新尺寸而不重繪
      // 降低閾值以確保寬度變化時能正確重繪
      if (
        Math.abs(existingWidth - (width + margin.left + margin.right)) < 2 &&
        Math.abs(existingHeight - (height + margin.top + margin.bottom)) < 2
      ) {
        return;
      }
    }

    // 清除之前的圖表
    d3.select(`#${containerId}`).selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out');

    // 🔍 創建可縮放的內容群組
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');

    // 注意：現在使用實時計算的 columnMaxValues 和 rowMaxValues，不再需要預先計算的統計數據

    // 🎯 計算每列和每行的最大值（用於刪除邏輯）
    const columnMaxValues = new Array(gridDimensions.value.x).fill(0);
    const rowMaxValues = new Array(gridDimensions.value.y).fill(0);

    if (gridData.value && gridData.value.nodes) {
      gridData.value.nodes.forEach((node) => {
        columnMaxValues[node.x] = Math.max(columnMaxValues[node.x], node.value || 0);
        rowMaxValues[node.y] = Math.max(rowMaxValues[node.y], node.value || 0);
      });
    }

    // 遞歸計算需要隱藏的行列，直到所有單元格 >= 40px
    const computeHiddenIndices = () => {
      const hiddenCols = new Set();
      const hiddenRows = new Set();

      // 最多迭代次數，避免無限循環
      const maxIterations = Math.max(gridDimensions.value.x, gridDimensions.value.y);
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;

        // 🎯 計算當前可見列和行的最大值總和（用於比例分配）
        const visibleColumnMaxValues = columnMaxValues.filter((_, i) => !hiddenCols.has(i));
        const visibleRowMaxValues = rowMaxValues.filter((_, i) => !hiddenRows.has(i));

        const totalVisibleColumnValue = visibleColumnMaxValues.reduce((sum, val) => sum + val, 0);
        const totalVisibleRowValue = visibleRowMaxValues.reduce((sum, val) => sum + val, 0);

        // 🎯 計算每列的實際寬度和每行的實際高度
        const actualColumnWidths = columnMaxValues.map((maxVal, index) => {
          if (hiddenCols.has(index)) return 0;
          if (totalVisibleColumnValue === 0) {
            return width / visibleColumnMaxValues.length;
          }
          return (maxVal / totalVisibleColumnValue) * width;
        });

        const actualRowHeights = rowMaxValues.map((maxVal, index) => {
          if (hiddenRows.has(index)) return 0;
          if (totalVisibleRowValue === 0) {
            return height / visibleRowMaxValues.length;
          }
          return (maxVal / totalVisibleRowValue) * height;
        });

        let needAdjust = false;

        // 🎯 找出實際寬度 < 40 的列中，max 值最小的並隱藏
        const narrowColumns = columnMaxValues
          .map((max, index) => ({ index, max, width: actualColumnWidths[index] }))
          .filter((item) => !hiddenCols.has(item.index) && item.width < 40)
          .sort((a, b) => a.max - b.max);

        if (narrowColumns.length > 0 && visibleColumnMaxValues.length > 1) {
          hiddenCols.add(narrowColumns[0].index);
          needAdjust = true;
        }

        // 🎯 找出實際高度 < 40 的行中，max 值最小的並隱藏
        const shortRows = rowMaxValues
          .map((max, index) => ({ index, max, height: actualRowHeights[index] }))
          .filter((item) => !hiddenRows.has(item.index) && item.height < 40)
          .sort((a, b) => a.max - b.max);

        if (shortRows.length > 0 && visibleRowMaxValues.length > 1) {
          hiddenRows.add(shortRows[0].index);
          needAdjust = true;
        }

        // 如果這次迭代沒有調整，說明已達到穩定狀態
        if (!needAdjust) {
          break;
        }
      }

      return {
        hiddenColumnIndices: Array.from(hiddenCols),
        hiddenRowIndices: Array.from(hiddenRows),
      };
    };

    const { hiddenColumnIndices, hiddenRowIndices } = computeHiddenIndices();

    // 計算最終顯示的列數和行數
    const visibleColumns = gridDimensions.value.x - hiddenColumnIndices.length;
    const visibleRows = gridDimensions.value.y - hiddenRowIndices.length;

    // 🎯 最大值已經在上面計算過了，這裡直接使用

    // 過濾掉隱藏的列和行，只計算可見的最大值
    const visibleColumnMaxValues = columnMaxValues.filter(
      (_, i) => !hiddenColumnIndices.includes(i)
    );
    const visibleRowMaxValues = rowMaxValues.filter((_, i) => !hiddenRowIndices.includes(i));

    // 計算可見列/行的總和，用於比例分配
    const totalVisibleColumnValue = visibleColumnMaxValues.reduce((sum, val) => sum + val, 0);
    const totalVisibleRowValue = visibleRowMaxValues.reduce((sum, val) => sum + val, 0);

    // 🎯 根據最大值比例分配每列寬度和每行高度
    const columnWidths = columnMaxValues.map((maxVal, index) => {
      if (hiddenColumnIndices.includes(index)) {
        return 0; // 隱藏的列寬度為0
      }
      // 如果總和為0，平均分配
      if (totalVisibleColumnValue === 0) {
        return width / visibleColumns;
      }
      return (maxVal / totalVisibleColumnValue) * width;
    });

    const rowHeights = rowMaxValues.map((maxVal, index) => {
      if (hiddenRowIndices.includes(index)) {
        return 0; // 隱藏的行高度為0
      }
      // 如果總和為0，平均分配
      if (totalVisibleRowValue === 0) {
        return height / visibleRows;
      }
      return (maxVal / totalVisibleRowValue) * height;
    });

    // 計算累積位置（用於快速查找每列/行的起始位置）
    const columnPositions = [0];
    const rowPositions = [0];
    for (let i = 0; i < columnWidths.length; i++) {
      columnPositions.push(columnPositions[i] + columnWidths[i]);
    }
    for (let i = 0; i < rowHeights.length; i++) {
      rowPositions.push(rowPositions[i] + rowHeights[i]);
    }

    // 🎯 繪製邊界外框
    const borderGroup = zoomGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 🔍 設置縮放行為
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);

    // 繪製網格節點（使用 zoomGroup）
    drawGridNodes(
      zoomGroup,
      columnWidths,
      rowHeights,
      columnPositions,
      rowPositions,
      margin,
      hiddenColumnIndices,
      hiddenRowIndices,
      columnMaxValues,
      rowMaxValues
    );

    // 將此次重繪後的可見行列與單元尺寸寫入 store，供其他 Tab 讀取
    // 注意：這裡使用平均值作為參考，實際尺寸已經是動態的
    const avgCellWidth =
      visibleColumns > 0 ? width / visibleColumns : width / gridDimensions.value.x;
    const avgCellHeight = visibleRows > 0 ? height / visibleRows : height / gridDimensions.value.y;
    if (activeLayerTab.value) {
      dataStore.updateComputedGridState(activeLayerTab.value, {
        visibleX: visibleColumns,
        visibleY: visibleRows,
        cellWidth: avgCellWidth,
        cellHeight: avgCellHeight,
      });

      // 🔄 更新 drawJsonData，刪除被隱藏的行列
      updateDrawJsonData(hiddenColumnIndices, hiddenRowIndices);
    }
  };

  /**
   * 🔄 更新 drawJsonData（刪除被隱藏的行列）
   * @param {Array} hiddenColumnIndices - 被隱藏的列索引
   * @param {Array} hiddenRowIndices - 被隱藏的行索引
   */
  const updateDrawJsonData = (hiddenColumnIndices, hiddenRowIndices) => {
    if (!activeLayerTab.value || !gridData.value) return;

    const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    if (!currentLayer || !currentLayer.drawJsonData) return;

    // 建立快速查找的 Map：(x,y) -> node
    const nodeMap = new Map();
    gridData.value.nodes.forEach((node) => {
      nodeMap.set(`${node.x},${node.y}`, node);
    });

    /**
     * 獲取相鄰被刪除的 grid 值
     * @param {number} x - 當前節點的 x 座標
     * @param {number} y - 當前節點的 y 座標
     * @returns {Object} 包含四個方向相鄰被刪除的 grid 值
     */
    const getAdjacentDeletedValues = (x, y) => {
      const deletedNeighbors = {
        left: [], // 左側被刪除的列的值
        right: [], // 右側被刪除的列的值
        top: [], // 上方被刪除的行的值
        bottom: [], // 下方被刪除的行的值
      };

      // 檢查左側被刪除的列
      for (let checkX = x - 1; checkX >= 0; checkX--) {
        if (hiddenColumnIndices.includes(checkX)) {
          const deletedNode = nodeMap.get(`${checkX},${y}`);
          if (deletedNode) {
            deletedNeighbors.left.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的列就停止
          break;
        }
      }

      // 檢查右側被刪除的列
      for (let checkX = x + 1; checkX < gridDimensions.value.x; checkX++) {
        if (hiddenColumnIndices.includes(checkX)) {
          const deletedNode = nodeMap.get(`${checkX},${y}`);
          if (deletedNode) {
            deletedNeighbors.right.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的列就停止
          break;
        }
      }

      // 檢查上方被刪除的行
      for (let checkY = y - 1; checkY >= 0; checkY--) {
        if (hiddenRowIndices.includes(checkY)) {
          const deletedNode = nodeMap.get(`${x},${checkY}`);
          if (deletedNode) {
            deletedNeighbors.top.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的行就停止
          break;
        }
      }

      // 檢查下方被刪除的行
      for (let checkY = y + 1; checkY < gridDimensions.value.y; checkY++) {
        if (hiddenRowIndices.includes(checkY)) {
          const deletedNode = nodeMap.get(`${x},${checkY}`);
          if (deletedNode) {
            deletedNeighbors.bottom.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的行就停止
          break;
        }
      }

      return deletedNeighbors;
    };

    // 建立列和行的映射（原始索引 -> 新索引）
    const columnMapping = new Map();
    const rowMapping = new Map();
    let newColIndex = 0;
    let newRowIndex = 0;

    for (let i = 0; i < gridDimensions.value.x; i++) {
      if (!hiddenColumnIndices.includes(i)) {
        columnMapping.set(i, newColIndex++);
      }
    }

    for (let i = 0; i < gridDimensions.value.y; i++) {
      if (!hiddenRowIndices.includes(i)) {
        rowMapping.set(i, newRowIndex++);
      }
    }

    // 過濾並重新映射節點
    const newNodes = gridData.value.nodes
      .filter((node) => !hiddenColumnIndices.includes(node.x) && !hiddenRowIndices.includes(node.y))
      .map((node) => {
        // 獲取相鄰被刪除的 grid 值（使用原始座標）
        const deletedNeighbors = getAdjacentDeletedValues(node.x, node.y);

        return {
          ...node,
          x: columnMapping.get(node.x),
          y: rowMapping.get(node.y),
          coord: {
            x: columnMapping.get(node.x),
            y: rowMapping.get(node.y),
          },
          // 相鄰被刪除的 grid 值
          deletedNeighbors: deletedNeighbors,
        };
      });

    // 重新計算統計數據
    const newGridX = gridDimensions.value.x - hiddenColumnIndices.length;
    const newGridY = gridDimensions.value.y - hiddenRowIndices.length;

    // 計算 X 排統計
    const xRowStats = [];
    for (let x = 0; x < newGridX; x++) {
      const values = newNodes.filter((node) => node.x === x).map((node) => node.value);
      if (values.length > 0) {
        xRowStats.push({
          row: x,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          count: values.length,
        });
      }
    }

    // 計算 Y 排統計
    const yRowStats = [];
    for (let y = 0; y < newGridY; y++) {
      const values = newNodes.filter((node) => node.y === y).map((node) => node.value);
      if (values.length > 0) {
        yRowStats.push({
          row: y,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          count: values.length,
        });
      }
    }

    // 計算整體統計
    const allValues = newNodes.map((node) => node.value);
    const overallStats = {
      min: Math.min(...allValues),
      max: Math.max(...allValues),
      avg: allValues.reduce((sum, val) => sum + val, 0) / allValues.length,
      count: allValues.length,
    };

    // 更新 drawJsonData
    currentLayer.drawJsonData = {
      ...currentLayer.drawJsonData,
      gridX: newGridX,
      gridY: newGridY,
      nodes: newNodes,
      totalNodes: newNodes.length,
      statsLabels: {
        xRowStats,
        yRowStats,
        overallStats,
        color: currentLayer.drawJsonData.statsLabels?.color || '#4CAF50',
        highlightColumnIndices: [],
        highlightRowIndices: [],
      },
    };
  };

  /**
   * 🔢 繪製網格節點 (Draw Grid Nodes)
   * @param {Object} svg - D3 SVG 選擇器
   * @param {Array} columnWidths - 每列的寬度陣列
   * @param {Array} rowHeights - 每行的高度陣列
   * @param {Array} columnPositions - 每列的累積位置陣列
   * @param {Array} rowPositions - 每行的累積位置陣列
   * @param {Object} margin - 邊距配置
   * @param {Array} hiddenColumnIndices - 需要隱藏的列索引
   * @param {Array} hiddenRowIndices - 需要隱藏的行索引
   * @param {Array} columnMaxValues - 每列的最大值陣列
   * @param {Array} rowMaxValues - 每行的最大值陣列
   */
  const drawGridNodes = (
    svg,
    columnWidths,
    rowHeights,
    columnPositions,
    rowPositions,
    margin,
    hiddenColumnIndices,
    hiddenRowIndices,
    columnMaxValues,
    rowMaxValues
  ) => {
    if (!gridData.value || !gridData.value.nodes) return;

    // 獲取當前圖層的 drawJsonData（暫時保留以備將來使用）
    // const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    // const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;

    // 計算可見列和行的累積位置
    const visibleColumnPositions = [0];
    let cumX = 0;
    for (let i = 0; i < columnWidths.length; i++) {
      if (!hiddenColumnIndices.includes(i)) {
        cumX += columnWidths[i];
        visibleColumnPositions.push(cumX);
      }
    }

    const visibleRowPositions = [0];
    let cumY = 0;
    for (let i = 0; i < rowHeights.length; i++) {
      if (!hiddenRowIndices.includes(i)) {
        cumY += rowHeights[i];
        visibleRowPositions.push(cumY);
      }
    }

    // 建立原始索引到可見索引的映射
    const columnToVisibleIndex = new Map();
    const rowToVisibleIndex = new Map();
    let visibleColIdx = 0;
    let visibleRowIdx = 0;

    for (let i = 0; i < columnWidths.length; i++) {
      if (!hiddenColumnIndices.includes(i)) {
        columnToVisibleIndex.set(i, visibleColIdx++);
      }
    }

    for (let i = 0; i < rowHeights.length; i++) {
      if (!hiddenRowIndices.includes(i)) {
        rowToVisibleIndex.set(i, visibleRowIdx++);
      }
    }

    // 創建節點群組
    const nodeGroup = svg.append('g').attr('class', 'grid-nodes');

    // 獲取當前圖層的 drawJsonData 以取得 deletedNeighbors 資訊
    const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;
    const drawNodes = drawJsonData ? drawJsonData.nodes : null;

    // 建立快速查找 drawNode 的 Map：(x,y) -> drawNode
    const drawNodeMap = new Map();
    if (drawNodes) {
      drawNodes.forEach((drawNode) => {
        drawNodeMap.set(`${drawNode.x},${drawNode.y}`, drawNode);
      });
    }

    // 繪製每個節點（只顯示數值文字，不顯示圓圈）
    gridData.value.nodes.forEach((node) => {
      // 檢查是否需要隱藏該節點
      if (hiddenColumnIndices.includes(node.x) || hiddenRowIndices.includes(node.y)) {
        return; // 不繪製此節點
      }

      const visibleColIdx = columnToVisibleIndex.get(node.x);
      const visibleRowIdx = rowToVisibleIndex.get(node.y);

      if (visibleColIdx === undefined || visibleRowIdx === undefined) return;

      // 計算節點中心位置
      const x = margin.left + visibleColumnPositions[visibleColIdx] + columnWidths[node.x] / 2;
      const y = margin.top + visibleRowPositions[visibleRowIdx] + rowHeights[node.y] / 2;

      // 節點數字顏色使用配置的文字顏色
      const nodeColor = COLOR_CONFIG.TEXT_FILL;

      // 使用固定字體大小，不受網格大小影響
      const fontSize = 14; // 固定字體大小

      // 只繪製節點數值文字，使用動態決定的顏色
      nodeGroup
        .append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', fontSize)
        .attr('font-weight', 'bold')
        .attr('fill', nodeColor)
        .text(node.value);

      // 🎯 繪製相鄰被刪除的 grid 值
      const drawNode = drawNodeMap.get(`${visibleColIdx},${visibleRowIdx}`);
      if (drawNode && drawNode.deletedNeighbors) {
        const deletedNeighbors = drawNode.deletedNeighbors;
        const deletedFontSize = 10; // 被刪除值的字體大小
        const deletedColor = '#FFA500'; // 橙色，用於區分

        // 計算當前格子的寬度和高度
        const cellWidth = columnWidths[node.x];
        const cellHeight = rowHeights[node.y];

        // 左側被刪除的值
        if (deletedNeighbors.left && deletedNeighbors.left.length > 0) {
          const leftText = deletedNeighbors.left.join(',');
          nodeGroup
            .append('text')
            .attr('x', x - cellWidth / 4)
            .attr('y', y)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(leftText);
        }

        // 右側被刪除的值
        if (deletedNeighbors.right && deletedNeighbors.right.length > 0) {
          const rightText = deletedNeighbors.right.join(',');
          nodeGroup
            .append('text')
            .attr('x', x + cellWidth / 4)
            .attr('y', y)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(rightText);
        }

        // 上方被刪除的值
        if (deletedNeighbors.top && deletedNeighbors.top.length > 0) {
          const topText = deletedNeighbors.top.join(',');
          nodeGroup
            .append('text')
            .attr('x', x)
            .attr('y', y - cellHeight / 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(topText);
        }

        // 下方被刪除的值
        if (deletedNeighbors.bottom && deletedNeighbors.bottom.length > 0) {
          const bottomText = deletedNeighbors.bottom.join(',');
          nodeGroup
            .append('text')
            .attr('x', x)
            .attr('y', y + cellHeight / 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'top')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(bottomText);
        }
      }
    });

    // 繪製統計數據標籤
    drawStatisticsLabels(
      svg,
      columnWidths,
      rowHeights,
      columnPositions,
      rowPositions,
      margin,
      hiddenColumnIndices,
      hiddenRowIndices,
      columnMaxValues,
      rowMaxValues
    );
  };

  /**
   * 📊 繪製統計數據標籤 (Draw Statistics Labels)
   * @param {Object} svg - D3 SVG 選擇器
   * @param {Array} columnWidths - 每列的寬度陣列
   * @param {Array} rowHeights - 每行的高度陣列
   * @param {Array} columnPositions - 每列的累積位置陣列
   * @param {Array} rowPositions - 每行的累積位置陣列
   * @param {Object} margin - 邊距配置
   * @param {Array} hiddenColumnIndices - 需要隱藏的列索引
   * @param {Array} hiddenRowIndices - 需要隱藏的行索引
   * @param {Array} columnMaxValues - 每列的最大值陣列
   * @param {Array} rowMaxValues - 每行的最大值陣列
   */
  const drawStatisticsLabels = (
    svg,
    columnWidths,
    rowHeights,
    columnPositions,
    rowPositions,
    margin,
    hiddenColumnIndices,
    hiddenRowIndices,
    columnMaxValues,
    rowMaxValues
  ) => {
    if (!gridData.value || !columnMaxValues || !rowMaxValues) return;

    // 創建統計標籤群組
    const statsGroup = svg.append('g').attr('class', 'statistics-labels');

    // 使用固定字體大小，不受網格大小影響
    const fontSize = 12; // 固定字體大小（比節點數字稍小）
    const labelOffset = 5;

    // 使用實時計算的最大值數據，而不是預先計算的數據
    const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;

    // 創建實時統計數據
    const xRowStats = columnMaxValues.map((maxVal, index) => ({
      row: index,
      max: maxVal,
    }));

    const yRowStats = rowMaxValues.map((maxVal, index) => ({
      row: index,
      max: maxVal,
    }));

    const color = drawJsonData?.statsLabels?.color || '#4CAF50';

    if (xRowStats && yRowStats) {
      // 計算可見列的累積位置
      const visibleColumnPositions = [0];
      let cumX = 0;
      for (let i = 0; i < columnWidths.length; i++) {
        if (!hiddenColumnIndices.includes(i)) {
          cumX += columnWidths[i];
          visibleColumnPositions.push(cumX);
        }
      }
      const totalVisibleGridWidth = cumX;

      // 計算可見行的累積位置
      const visibleRowPositions = [0];
      let cumY = 0;
      for (let i = 0; i < rowHeights.length; i++) {
        if (!hiddenRowIndices.includes(i)) {
          cumY += rowHeights[i];
          visibleRowPositions.push(cumY);
        }
      }

      // 建立原始索引到可見索引的映射
      const columnToVisibleIndex = new Map();
      const rowToVisibleIndex = new Map();
      let visibleColIdx = 0;
      let visibleRowIdx = 0;

      for (let i = 0; i < columnWidths.length; i++) {
        if (!hiddenColumnIndices.includes(i)) {
          columnToVisibleIndex.set(i, visibleColIdx++);
        }
      }

      for (let i = 0; i < rowHeights.length; i++) {
        if (!hiddenRowIndices.includes(i)) {
          rowToVisibleIndex.set(i, visibleRowIdx++);
        }
      }

      // 繪製 X 排（垂直方向）統計標籤 - 只顯示最大值
      if (xRowStats) {
        xRowStats.forEach((xStat, index) => {
          // 當該列被隱藏時，不顯示此標籤
          if (hiddenColumnIndices.includes(index)) {
            return; // 不繪製此標籤
          }

          const visibleColIdx = columnToVisibleIndex.get(xStat.row);
          if (visibleColIdx === undefined) return;

          const x =
            margin.left + visibleColumnPositions[visibleColIdx] + columnWidths[xStat.row] / 2;
          const y = margin.top - labelOffset;

          // 只顯示最大值標籤
          statsGroup
            .append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', fontSize)
            .attr('font-weight', 'bold')
            .attr('fill', color) // 使用預設顏色
            .text(`${xStat.max}`);
        });
      }

      // 繪製 Y 排（水平方向）統計標籤 - 只顯示最大值
      if (yRowStats) {
        yRowStats.forEach((yStat, index) => {
          // 當該行被隱藏時，不顯示此標籤
          if (hiddenRowIndices.includes(index)) {
            return; // 不繪製此標籤
          }

          const visibleRowIdx = rowToVisibleIndex.get(yStat.row);
          if (visibleRowIdx === undefined) return;

          const x = margin.left + totalVisibleGridWidth + labelOffset;
          const y = margin.top + visibleRowPositions[visibleRowIdx] + rowHeights[yStat.row] / 2;

          // 只顯示最大值標籤（整個網格右側）
          statsGroup
            .append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', fontSize)
            .attr('font-weight', 'bold')
            .attr('fill', color) // 使用預設顏色
            .text(`${yStat.max}`);
        });
      }
    }
  };

  /**
   * 🎨 繪製行政區示意圖 (Draw Administrative District Schematic)
   */
  const drawAdministrativeSchematic = () => {
    if (!nodeData.value) {
      console.warn('⚠️ drawAdministrativeSchematic: nodeData.value 為空');
      return;
    }

    // 確保 nodeData.value 是數組
    if (!Array.isArray(nodeData.value)) {
      console.error('❌ nodeData.value 不是數組:', nodeData.value);
      return;
    }

    // 檢查數據格式並記錄無效的路徑
    const invalidPaths = nodeData.value.filter((path, index) => {
      if (!path) {
        console.warn(`⚠️ 路徑 ${index} 為 null 或 undefined`);
        return true;
      }
      if (!path.nodes) {
        console.warn(`⚠️ 路徑 ${index} (${path.name || '未命名'}) 缺少 nodes 屬性`);
        return true;
      }
      if (!Array.isArray(path.nodes)) {
        console.warn(
          `⚠️ 路徑 ${index} (${path.name || '未命名'}) 的 nodes 不是數組:`,
          typeof path.nodes
        );
        return true;
      }
      return false;
    });

    if (invalidPaths.length > 0) {
      console.warn(`⚠️ 發現 ${invalidPaths.length} 個無效路徑，將跳過這些路徑`);
    }

    // 畫布長寬px
    let dimensions = getDimensions();

    // 添加適當的邊距，確保內容不被截斷
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // 獲取所有節點座標（使用兼容 flatMap 的方法）
    const allPoints = nodeData.value.reduce((acc, d) => {
      if (d.nodes && Array.isArray(d.nodes)) {
        const points = d.nodes
          .map((node) => ({
            x: node.coord?.x,
            y: node.coord?.y,
          }))
          .filter((p) => p.x !== undefined && p.y !== undefined);
        return acc.concat(points);
      }
      return acc;
    }, []);

    // 找到點的最大最小值
    let xMax = d3.max(allPoints, (d) => d.x);
    let yMax = d3.max(allPoints, (d) => d.y);

    // 檢查是否已存在 SVG，如果存在且尺寸相同則不需要重繪
    const containerId = getContainerId();
    const existingSvg = d3.select(`#${containerId}`).select('svg');
    if (existingSvg.size() > 0) {
      const existingWidth = parseFloat(existingSvg.attr('width'));
      const existingHeight = parseFloat(existingSvg.attr('height'));

      // 如果尺寸變化很小（小於 2px），則只更新尺寸而不重繪
      // 降低閾值以確保寬度變化時能正確重繪
      if (
        Math.abs(existingWidth - (width + margin.left + margin.right)) < 2 &&
        Math.abs(existingHeight - (height + margin.top + margin.bottom)) < 2
      ) {
        return;
      }
    }

    // 清除之前的圖表
    d3.select(`#${containerId}`).selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out'); // 添加平滑過渡效果

    // 🔍 創建可縮放的內容群組
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');

    // 直接使用容器的完整尺寸，允許形狀變形以完全填滿容器
    const actualWidth = width;
    const actualHeight = height;

    // 繪製參數已準備就緒

    // 設定比例尺，使用實際繪圖區域
    const x = d3
      .scaleLinear()
      .domain([0, xMax])
      .range([margin.left, margin.left + actualWidth]);
    const y = d3
      .scaleLinear()
      .domain([yMax, 0])
      .range([margin.top, margin.top + actualHeight]);

    // 🎯 繪製邊界外框
    const borderGroup = zoomGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', actualWidth)
      .attr('height', actualHeight)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 🔍 設置縮放行為
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);

    // 創建線條生成器
    const lineGenerator = d3
      .line()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveNatural);

    // 繪製每個路徑的節點連接
    // 過濾掉無效的路徑
    const validPaths = nodeData.value.filter(
      (path) => path && path.nodes && Array.isArray(path.nodes)
    );
    validPaths.forEach((path) => {
      if (!path.nodes || !Array.isArray(path.nodes)) {
        return;
      }
      path.nodes.forEach((node) => {
        // 確保 node 和 node.coord 存在
        if (!node || !node.coord) {
          return;
        }

        let dString = '';
        let nodes = [];

        switch (node.type) {
          case 1:
            nodes = [
              { x: node.coord.x - 0.5, y: node.coord.y },
              { x: node.coord.x + 0.5, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 2:
            nodes = [
              { x: node.coord.x, y: node.coord.y - 0.5 },
              { x: node.coord.x, y: node.coord.y + 0.5 },
            ];
            dString = lineGenerator(nodes);
            break;
          case 3:
            nodes = [
              { x: node.coord.x + 0.5, y: node.coord.y },
              { x: node.coord.x - 0.5, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 4:
            nodes = [
              { x: node.coord.x, y: node.coord.y + 0.5 },
              { x: node.coord.x, y: node.coord.y - 0.5 },
            ];
            dString = lineGenerator(nodes);
            break;
          case 5:
            nodes = [
              { x: node.coord.x, y: node.coord.y },
              { x: node.coord.x - 0.5, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 6:
            nodes = [
              { x: node.coord.x + 0.5, y: node.coord.y },
              { x: node.coord.x, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 7:
            nodes = [
              { x: node.coord.x, y: node.coord.y + 0.5 },
              { x: node.coord.x, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 8:
            nodes = [
              { x: node.coord.x, y: node.coord.y },
              { x: node.coord.x, y: node.coord.y - 0.5 },
            ];
            dString = lineGenerator(nodes);
            break;
          case 12:
          case 43: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) + arcWidth) },
                { x: node.coord.x, y: node.coord.y - 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x - 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) - arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(0)
              .endAngle(Math.PI / 2);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) - arcWidth}, ${y(node.coord.y) + arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          case 21:
          case 34: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) - arcWidth) },
                { x: node.coord.x, y: node.coord.y + 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x + 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) + arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(-Math.PI / 2)
              .endAngle(-Math.PI);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) + arcWidth}, ${y(node.coord.y) - arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          case 14:
          case 23: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) - arcWidth) },
                { x: node.coord.x, y: node.coord.y + 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x - 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) - arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(Math.PI / 2)
              .endAngle(Math.PI);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) - arcWidth}, ${y(node.coord.y) - arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          case 32:
          case 41: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) + arcWidth) },
                { x: node.coord.x, y: node.coord.y - 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x + 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) + arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(0)
              .endAngle(-Math.PI / 2);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) + arcWidth}, ${y(node.coord.y) + arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          default:
            break;
        }

        if (dString !== '') {
          zoomGroup
            .append('path')
            .attr('d', dString)
            .attr('stroke', path.color)
            .attr('fill', 'none')
            .attr('stroke-width', 6);
        }
      });
    });

    // 繪製節點數值標籤
    if (linkData.value && Array.isArray(linkData.value)) {
      // 獲取當前圖層的 drawJsonData（暫時保留以備將來使用）
      // const currentLayer = dataStore.findLayerById(activeLayerTab.value);
      // const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;

      const allLinks = linkData.value
        .filter((line) => line && line.nodes && Array.isArray(line.nodes))
        .flatMap((line) =>
          line.nodes.map((node) => ({
            ...node,
          }))
        );

      allLinks.forEach((node) => {
        // 確保 node 和 node.coord 存在
        if (!node || !node.coord || node.coord.x === undefined || node.coord.y === undefined) {
          return;
        }

        // 節點數字顏色使用配置的文字顏色
        const nodeColor = COLOR_CONFIG.TEXT_FILL;

        zoomGroup
          .append('text')
          .attr('x', x(node.coord.x))
          .attr('y', y(node.coord.y))
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '10px')
          .attr('fill', nodeColor)
          .text(`${node.value}`);
      });
    }
  };

  /** taipei_g 滑鼠縮放：強制重繪時保留 d3 zoom、焦點格索引 */
  let drawMapForceNext = false;
  let savedTaipeiFZoomTransform = null;
  const taipeiFMouseZoomHover = ref({ ix: null, iy: null });
  let taipeiFMouseZoomRaf = 0;
  let scheduleTaipeiFDrawForMouseZoom = () => {};

  /**
   * 🗺️ 繪製地圖 (Draw Map)
   * 使用 D3.js 繪製 GeoJSON 地圖數據或 Normalize Segments（站點和路線）
   * 背景強制為白色
   */
  const drawMap = () => {
    const forceThisDraw = drawMapForceNext;
    drawMapForceNext = false;
    if (!mapGeoJsonData.value) return;

    // 獲取容器尺寸
    const dimensions = getDimensions();

    // 添加適當的邊距（增加底部和左側邊距以容納刻度標籤）
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // 檢查是否已存在 SVG，如果存在且尺寸相同則不需要重繪
    const containerId = getContainerId();
    const svgW = width + margin.left + margin.right;
    const svgH = height + margin.top + margin.bottom;
    const existingSvg = d3.select(`#${containerId}`).select('svg');
    if (forceThisDraw && existingSvg.size() > 0) {
      const node = existingSvg.node();
      if (node) {
        savedTaipeiFZoomTransform = d3.zoomTransform(node);
      }
    }
    if (existingSvg.size() > 0) {
      const ew = parseFloat(existingSvg.attr('data-inner-w'));
      const eh = parseFloat(existingSvg.attr('data-inner-h'));

      if (
        !forceThisDraw &&
        Number.isFinite(ew) &&
        Number.isFinite(eh) &&
        Math.abs(ew - svgW) < 2 &&
        Math.abs(eh - svgH) < 2
      ) {
        refreshSpaceNetworkMinCellDimensions();
        return;
      }
    }

    // 清除之前的圖表和 tooltip
    d3.select(`#${containerId}`).selectAll('svg').remove();
    d3.select('body').selectAll('.d3js-map-tooltip').remove();

    // 🎯 強制設置容器背景為白色（清除任何可能的殘留樣式）
    const container = document.getElementById(containerId);
    if (container) {
      container.style.backgroundColor = '#FFFFFF';
      container.style.background = '#FFFFFF';
      container.style.setProperty('background-color', '#FFFFFF', 'important');
      container.style.setProperty('background', '#FFFFFF', 'important');
    }

    // 創建 SVG 元素（強制白色背景）；viewBox + 100% 填滿容器，配合 preserveAspectRatio 適應版面
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('viewBox', `0 0 ${svgW} ${svgH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('data-inner-w', svgW)
      .attr('data-inner-h', svgH)
      .style('background-color', '#FFFFFF')
      .style('background', '#FFFFFF')
      .style('transition', 'all 0.2s ease-in-out');

    // 🎯 強制設置 SVG 背景色（使用 DOM 直接設置以確保生效）
    const svgElement = svg.node();
    if (svgElement) {
      svgElement.style.setProperty('background-color', '#FFFFFF', 'important');
      svgElement.style.setProperty('background', '#FFFFFF', 'important');
    }

    // 🎯 創建背景層群組（確保在最底層）
    const backgroundGroup = svg.append('g').attr('class', 'background-layer');

    // 🎯 添加白色背景矩形（最底層，確保背景是白色）
    backgroundGroup
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .attr('fill', '#FFFFFF')
      .attr('fill-opacity', 1);

    // 確保背景層在最底層
    backgroundGroup.lower();

    // 🔍 創建可縮放的內容群組
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');

    // 創建 tooltip 元素（用於顯示 hover 信息）
    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'd3js-map-tooltip')
      .style('position', 'absolute')
      .style('padding', '8px 12px')
      .style('background-color', 'rgba(0, 0, 0, 0.8)')
      .style('color', '#FFFFFF')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000)
      .style('max-width', '300px');

    // 檢查是否為 Normalize Segments 格式
    const isNormalizeFormat = mapGeoJsonData.value.type === 'NormalizeSegments';
    let routeFeatures = [];
    let stationFeatures = [];
    /** 展開後路段（Normalize 分支內賦值；繪製階段供度數著色等使用） */
    let flatSegments = [];
    /** taipei_d：以「縮減疊加網格（空列／空行）後」座標繪製路網 */
    let taipeiCReducedOverlayDraw = false;
    /** 網路座標 (gx,gy) → 繪圖用縮減格座標；非縮減模式為 null */
    let reducedPlotMapper = null;
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;

    if (isNormalizeFormat) {
      // Normalize Segments 格式處理（優先使用 layer 當前資料，以反映 flip 後的狀態）
      const activeLayerForSegments = visibleLayers.value.find(
        (l) => l.layerId === activeLayerTab.value
      );
      const currentLayerData = snRoutesForK3TabLayer(activeLayerForSegments);
      const segments =
        Array.isArray(currentLayerData) && currentLayerData.length > 0
          ? currentLayerData
          : mapGeoJsonData.value.segments || [];

      // 檢查是否為 2-5 格式（按路線分組）
      const isMergedRoutesFormat =
        segments.length > 0 && segments[0].route_name && Array.isArray(segments[0].segments);

      flatSegments = [];
      if (isMergedRoutesFormat) {
        // 2-5 格式：展開所有路線的 segments
        segments.forEach((route) => {
          const routeColor = route.color || '#555555';
          route.segments.forEach((seg) => {
            flatSegments.push({
              ...seg,
              route_name: route.route_name,
              route_color: routeColor,
              original_props: route.original_props,
            });
          });
        });
      } else {
        flatSegments = segments;
      }

      // 從 segments 中提取所有座標點
      const allPoints = new Set();
      flatSegments.forEach((seg) => {
        seg.points.forEach((point) => {
          // 支持 [x, y] 或 [x, y, props] 格式
          const x = Array.isArray(point) ? point[0] : point.x || 0;
          const y = Array.isArray(point) ? point[1] : point.y || 0;
          allPoints.add(`${x},${y}`);
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        });
      });

      // 將 segments 轉換為 routeFeatures 格式
      // 檢查是否為 2-3/2-4/2-5 格式（有 start_coord/end_coord）
      const isZLayoutFormat = flatSegments.length > 0 && flatSegments[0].start_coord;

      routeFeatures = flatSegments.map((seg, flatSegmentIndex) => {
        // 檢查是否為 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式（points 為 [x, y, props]）
        const isHydratedFormat =
          seg.points &&
          seg.points.length > 0 &&
          Array.isArray(seg.points[0]) &&
          seg.points[0].length > 2;

        // 提取純座標（如果是 [x, y, props] 格式，只取前兩個元素）
        let coordinates = seg.points.map((point) => {
          if (Array.isArray(point) && point.length >= 2) {
            return [point[0], point[1]];
          }
          return point;
        });
        if (isZLayoutFormat || isHydratedFormat) {
          // 2-3/2-4/2-5/2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式：從 props 或 original_props 獲取屬性
          const props = seg.props || seg.original_props || {};
          return {
            geometry: {
              type: 'LineString',
              coordinates: coordinates,
            },
            properties: {
              tags: props.way_properties?.tags || props.properties?.tags || {},
              name: seg.route_name || props.name || props.route_name,
              color: seg.route_color,
              station_weights: seg.station_weights, // 傳遞 station_weights
              nav_weight:
                seg.nav_weight != null && Number.isFinite(Number(seg.nav_weight))
                  ? Number(seg.nav_weight)
                  : 1,
              original_points: seg.original_points || seg.points, // 傳遞原始點用於計算距離
              points: seg.points, // 傳遞 points 用於計算距離
              _flatSegmentIndex: flatSegmentIndex,
            },
          };
        } else {
          // Normalize Segments 格式
          return {
            geometry: {
              type: 'LineString',
              coordinates: coordinates,
            },
            properties: {
              tags: seg.way_properties?.tags || {},
              name: seg.route_name || seg.name,
              station_weights: seg.station_weights, // 傳遞 station_weights
              nav_weight:
                seg.nav_weight != null && Number.isFinite(Number(seg.nav_weight))
                  ? Number(seg.nav_weight)
                  : 1,
              original_points: seg.original_points || seg.points, // 傳遞原始點用於計算距離
              points: seg.points, // 傳遞 points 用於計算距離
              _flatSegmentIndex: flatSegmentIndex,
            },
          };
        }
      });

      // 從 segments 中提取站點
      // 測試3：若已具 MapDrawn 匯出 JSON（processedJsonData），站點僅依該單一資料繪製，勿與 flatSegments 的 nodes／折線轉折混用
      const stationMap = new Map();
      const useTest3JsonStations =
        isTaipeiTest3BcdeLayerTab(activeLayerTab.value) &&
        !isTaipeiTest3I3OrJ3LayerTab(activeLayerTab.value) &&
        activeLayerForSegments &&
        isMapDrawnRoutesExportArray(activeLayerForSegments.processedJsonData);

      if (useTest3JsonStations) {
        const rows = activeLayerForSegments.processedJsonData;
        for (const row of rows) {
          const seg = row.segment || {};
          const routeColor = row.color;
          const addEndpoint = (pt) => {
            if (!pt || typeof pt !== 'object') return;
            const x = Number(pt.x_grid);
            const y = Number(pt.y_grid);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            const k = `${x},${y}`;
            if (!stationMap.has(k)) {
              stationMap.set(k, {
                geometry: { type: 'Point', coordinates: [x, y] },
                properties: {
                  ...pt,
                  x_grid: x,
                  y_grid: y,
                  color: routeColor,
                  node_type: 'connect',
                },
                nodeType: 'connect',
              });
            }
          };
          addEndpoint(seg.start);
          addEndpoint(seg.end);
          for (const st of seg.stations || []) {
            const x = Number(st.x_grid);
            const y = Number(st.y_grid);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const k = `${x},${y}`;
            const midIsConnect = String(st.node_type ?? '').trim() === 'connect';
            stationMap.set(k, {
              geometry: { type: 'Point', coordinates: [x, y] },
              properties: {
                ...st,
                x_grid: x,
                y_grid: y,
                color: routeColor,
                node_type: midIsConnect ? 'connect' : 'line',
              },
              nodeType: midIsConnect ? 'connect' : 'line',
            });
          }
        }
      } else {
        flatSegments.forEach((seg) => {
          // 檢查是否為 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式（points 為 [x, y, props]）
          const isHydratedFormat =
            seg.points &&
            seg.points.length > 0 &&
            Array.isArray(seg.points[0]) &&
            seg.points[0].length > 2;

          if (isHydratedFormat) {
            // 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式：從 points 陣列中提取端點屬性
            const pts = seg.points || [];
            if (pts.length > 0) {
              // 起點
              const startPt = pts[0];
              const [x1, y1] = Array.isArray(startPt)
                ? [startPt[0], startPt[1]]
                : [startPt.x || 0, startPt.y || 0];
              const startProps = Array.isArray(startPt) && startPt.length > 2 ? startPt[2] : {};
              const key1 = `${x1},${y1}`;
              if (!stationMap.has(key1)) {
                stationMap.set(key1, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x1, y1],
                  },
                  properties: {
                    ...startProps,
                    x_grid: x1,
                    y_grid: y1,
                  },
                  nodeType: startProps.node_type || 'connect',
                });
              }

              // 終點
              if (pts.length > 1) {
                const endPt = pts[pts.length - 1];
                const [x2, y2] = Array.isArray(endPt)
                  ? [endPt[0], endPt[1]]
                  : [endPt.x || 0, endPt.y || 0];
                const endProps = Array.isArray(endPt) && endPt.length > 2 ? endPt[2] : {};
                const key2 = `${x2},${y2}`;
                if (!stationMap.has(key2)) {
                  stationMap.set(key2, {
                    geometry: {
                      type: 'Point',
                      coordinates: [x2, y2],
                    },
                    properties: {
                      ...endProps,
                      x_grid: x2,
                      y_grid: y2,
                    },
                    nodeType: endProps.node_type || 'connect',
                  });
                }
              }

              // 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式：提取所有中間點（只繪製真正的車站，不繪製幾何轉折點）
              // 對於 6-1 格式，points 數組中每個點都是 [x, y, props]，直接提取所有中間點的屬性
              // 對於其他格式，使用 original_points 和 original_nodes 來分佈中間站點
              if (pts.length > 2) {
                // 直接從 points 數組中提取所有中間點（跳過起點和終點）
                for (let i = 1; i < pts.length - 1; i++) {
                  const midPt = pts[i];
                  const [x, y] = Array.isArray(midPt)
                    ? [midPt[0], midPt[1]]
                    : [midPt.x || 0, midPt.y || 0];
                  const midFromPt = Array.isArray(midPt) && midPt.length > 2 ? midPt[2] : {};
                  const midFromNode =
                    seg.nodes?.[i] && typeof seg.nodes[i] === 'object' ? seg.nodes[i] : {};
                  const midProps = { ...midFromNode, ...midFromPt };
                  const key = `${x},${y}`;

                  // 判斷是否為真正的車站（不是幾何轉折點）
                  // 真正的車站：node_type === 'connect' 或有 station_name
                  // 不繪製：node_type === 'line' 的幾何轉折點
                  // taipei_h3：tags._forceDrawBlackDot（見 g3ToH3PlaceBlackStationsFromA3Rows）
                  // 黑點 display===false 時不繪製（版面網格 K4 等）
                  const isBlackLike =
                    midProps.station_name ||
                    midProps.tags?.station_name ||
                    midProps.tags?._forceDrawBlackDot;
                  const isRealStation =
                    midProps.node_type === 'connect' || (isBlackLike && midProps.display !== false);

                  // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
                  if (!stationMap.has(key) && isRealStation) {
                    stationMap.set(key, {
                      geometry: {
                        type: 'Point',
                        coordinates: [x, y],
                      },
                      properties: {
                        ...midProps,
                        x_grid: x,
                        y_grid: y,
                      },
                      nodeType: midProps.node_type || 'line', // 保留原始 node_type
                    });
                  }
                }
              }

              // 如果沒有從 points 中提取到中間點，則使用 original_points 和 original_nodes 來分佈（兼容舊格式）
              if (
                seg.original_points &&
                Array.isArray(seg.original_points) &&
                seg.points &&
                Array.isArray(seg.points) &&
                seg.original_points.length > seg.points.length
              ) {
                const numStations = Math.max(0, seg.original_points.length - 2); // 減去起點和終點
                const originalNodes = seg.original_nodes || [];
                if (numStations > 0 && seg.points.length >= 2) {
                  // 計算路徑總長度
                  const dist = (p1, p2) => {
                    const x1 = Array.isArray(p1) ? p1[0] : p1.x || 0;
                    const y1 = Array.isArray(p1) ? p1[1] : p1.y || 0;
                    const x2 = Array.isArray(p2) ? p2[0] : p2.x || 0;
                    const y2 = Array.isArray(p2) ? p2[1] : p2.y || 0;
                    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
                  };

                  let totalLen = 0;
                  const segments = [];
                  for (let i = 0; i < seg.points.length - 1; i++) {
                    const d = dist(seg.points[i], seg.points[i + 1]);
                    totalLen += d;
                    segments.push({ len: d, p1: seg.points[i], p2: seg.points[i + 1] });
                  }

                  if (totalLen > 0) {
                    const stepDist = totalLen / (numStations + 1);
                    let currentTarget = stepDist;
                    let segIdx = 0;
                    let coveredLen = 0;

                    for (let i = 0; i < numStations; i++) {
                      // 計算對應的 original_points 索引（跳過起點，從 1 開始）
                      const originalIndex = i + 1;
                      // 優先從 original_points 中提取屬性（如果是 [x, y, props] 格式）
                      let nodeProps = {};
                      if (
                        seg.original_points[originalIndex] &&
                        Array.isArray(seg.original_points[originalIndex]) &&
                        seg.original_points[originalIndex].length > 2
                      ) {
                        nodeProps = seg.original_points[originalIndex][2] || {};
                      } else {
                        nodeProps = originalNodes[originalIndex] || {};
                      }

                      while (segIdx < segments.length) {
                        const segData = segments[segIdx];
                        if (coveredLen + segData.len >= currentTarget) {
                          const localDist = currentTarget - coveredLen;
                          const ratio = localDist / segData.len;
                          const p1x = Array.isArray(segData.p1) ? segData.p1[0] : segData.p1.x || 0;
                          const p1y = Array.isArray(segData.p1) ? segData.p1[1] : segData.p1.y || 0;
                          const p2x = Array.isArray(segData.p2) ? segData.p2[0] : segData.p2.x || 0;
                          const p2y = Array.isArray(segData.p2) ? segData.p2[1] : segData.p2.y || 0;
                          const nx = p1x + (p2x - p1x) * ratio;
                          const ny = p1y + (p2y - p1y) * ratio;
                          const key = `${nx},${ny}`;

                          // 判斷是否為真正的車站（不是幾何轉折點）
                          // 真正的車站：node_type === 'connect' 或有 station_name
                          // 不繪製：node_type === 'line' 的幾何轉折點
                          const isBlackLike =
                            nodeProps.station_name ||
                            nodeProps.tags?.station_name ||
                            nodeProps.tags?._forceDrawBlackDot;
                          const isRealStation =
                            nodeProps.node_type === 'connect' ||
                            (isBlackLike && nodeProps.display !== false);

                          // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
                          if (!stationMap.has(key) && isRealStation) {
                            stationMap.set(key, {
                              geometry: {
                                type: 'Point',
                                coordinates: [nx, ny],
                              },
                              properties: {
                                ...nodeProps, // 使用 original_points 或 original_nodes 中的屬性
                                x_grid: nx,
                                y_grid: ny,
                              },
                              nodeType: nodeProps.node_type || 'line', // 保留原始 node_type
                            });
                          }
                          break;
                        } else {
                          coveredLen += segData.len;
                          segIdx++;
                        }
                      }
                      currentTarget += stepDist;
                    }
                  }
                }
              }
            }
          } else if (isZLayoutFormat) {
            // 2-3/2-4/2-5 格式：從 start_coord/end_coord 和 start_props/end_props 提取
            if (seg.start_coord && seg.start_props) {
              const [x, y] = seg.start_coord;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: {
                    ...seg.start_props,
                    x_grid: x,
                    y_grid: y,
                  },
                  nodeType: seg.start_props.node_type || 'connect',
                });
              }
            }
            if (seg.end_coord && seg.end_props) {
              const [x, y] = seg.end_coord;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: {
                    ...seg.end_props,
                    x_grid: x,
                    y_grid: y,
                  },
                  nodeType: seg.end_props.node_type || 'connect',
                });
              }
            }

            // 2-3/2-4/2-5 格式：在路徑上分佈中間站點（黑點）
            if (
              isZLayoutFormat &&
              seg.original_points &&
              Array.isArray(seg.original_points) &&
              seg.points &&
              Array.isArray(seg.points)
            ) {
              const numStations = Math.max(0, seg.original_points.length - 2); // 減去起點和終點
              const originalNodes = seg.original_nodes || [];
              if (numStations > 0 && seg.points.length >= 2) {
                // 計算路徑總長度
                const dist = (p1, p2) => {
                  // 支持 [x, y] 或 [x, y, props] 格式
                  const x1 = Array.isArray(p1) ? p1[0] : p1.x || 0;
                  const y1 = Array.isArray(p1) ? p1[1] : p1.y || 0;
                  const x2 = Array.isArray(p2) ? p2[0] : p2.x || 0;
                  const y2 = Array.isArray(p2) ? p2[1] : p2.y || 0;
                  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
                };

                let totalLen = 0;
                const segments = [];
                for (let i = 0; i < seg.points.length - 1; i++) {
                  const d = dist(seg.points[i], seg.points[i + 1]);
                  totalLen += d;
                  segments.push({ len: d, p1: seg.points[i], p2: seg.points[i + 1] });
                }

                if (totalLen > 0) {
                  const stepDist = totalLen / (numStations + 1);
                  let currentTarget = stepDist;
                  let segIdx = 0;
                  let coveredLen = 0;

                  for (let i = 0; i < numStations; i++) {
                    // 計算對應的 original_points 索引（跳過起點，從 1 開始）
                    const originalIndex = i + 1;
                    const nodeProps = originalNodes[originalIndex] || {};

                    while (segIdx < segments.length) {
                      const segData = segments[segIdx];
                      if (coveredLen + segData.len >= currentTarget) {
                        const localDist = currentTarget - coveredLen;
                        const ratio = localDist / segData.len;
                        // 支持 [x, y] 或 [x, y, props] 格式
                        const p1x = Array.isArray(segData.p1) ? segData.p1[0] : segData.p1.x || 0;
                        const p1y = Array.isArray(segData.p1) ? segData.p1[1] : segData.p1.y || 0;
                        const p2x = Array.isArray(segData.p2) ? segData.p2[0] : segData.p2.x || 0;
                        const p2y = Array.isArray(segData.p2) ? segData.p2[1] : segData.p2.y || 0;
                        const nx = p1x + (p2x - p1x) * ratio;
                        const ny = p1y + (p2y - p1y) * ratio;
                        const key = `${nx},${ny}`;

                        // 判斷是否為真正的車站（不是幾何轉折點）
                        // 真正的車站：node_type === 'connect' 或有 station_name
                        // 不繪製：node_type === 'line' 的幾何轉折點
                        const isBlackLike =
                          nodeProps.station_name ||
                          nodeProps.tags?.station_name ||
                          nodeProps.tags?._forceDrawBlackDot;
                        const isRealStation =
                          nodeProps.node_type === 'connect' ||
                          (isBlackLike && nodeProps.display !== false);

                        // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
                        if (!stationMap.has(key) && isRealStation) {
                          stationMap.set(key, {
                            geometry: {
                              type: 'Point',
                              coordinates: [nx, ny],
                            },
                            properties: {
                              ...nodeProps, // 使用 original_nodes 中的屬性
                              x_grid: nx,
                              y_grid: ny,
                            },
                            nodeType: nodeProps.node_type || 'line', // 保留原始 node_type
                          });
                        }
                        break;
                      } else {
                        coveredLen += segData.len;
                        segIdx++;
                      }
                    }
                    currentTarget += stepDist;
                  }
                }
              }
            }
          } else if (
            seg.nodes &&
            Array.isArray(seg.nodes) &&
            seg.points &&
            Array.isArray(seg.points)
          ) {
            // 2-1 格式：從 nodes 陣列提取所有點（只繪製真正的車站，不繪製幾何轉折點）
            seg.points.forEach((point, index) => {
              const [x, y] = point;
              const fromPt = Array.isArray(point) && point.length > 2 ? point[2] : {};
              const nodeProps = { ...(seg.nodes[index] || {}), ...fromPt };
              // flip 後紅點位移：若有 display_x/display_y 則用於繪製紅點，線仍用 points
              const drawX = nodeProps.display_x ?? x;
              const drawY = nodeProps.display_y ?? y;
              const key = `${drawX},${drawY}`;

              // 判斷是否為真正的車站（不是幾何轉折點）
              // 真正的車站：node_type === 'connect' 或有 station_name
              // 不繪製：node_type === 'line' 的幾何轉折點
              // taipei_h3：g3→h3 插入之中段站帶 tags._forceDrawBlackDot（可无站名仍畫黑點）
              const isBlackLike =
                nodeProps.station_name ||
                nodeProps.tags?.station_name ||
                nodeProps.tags?._forceDrawBlackDot;
              const isRealStation =
                nodeProps.node_type === 'connect' || (isBlackLike && nodeProps.display !== false);

              // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
              if (!stationMap.has(key) && isRealStation) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [drawX, drawY],
                  },
                  properties: {
                    ...nodeProps,
                    x_grid: drawX,
                    y_grid: drawY,
                  },
                  nodeType: nodeProps.node_type || 'line', // 用於區分 connect 和 line
                });
              }
            });
          } else {
            // 1-1, 1-2 格式：從 properties_start 和 properties_end 提取
            if (seg.properties_start) {
              const x = seg.properties_start.x_grid;
              const y = seg.properties_start.y_grid;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: seg.properties_start,
                  nodeType: 'connect',
                });
              }
            }
            if (seg.properties_end) {
              const x = seg.properties_end.x_grid;
              const y = seg.properties_end.y_grid;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: seg.properties_end,
                  nodeType: 'connect',
                });
              }
            }
          }
        });
      }
      stationFeatures = Array.from(stationMap.values());

      // MapDrawn／站點可能略超出折線頂點 bbox；納入邊界使網格與欄／列摘要與畫面一致（縮減疊加分支會整段重算，此處不影響）
      if (isNormalizeFormat) {
        stationFeatures.forEach((f) => {
          const c = f.geometry?.coordinates;
          if (!Array.isArray(c) || c.length < 2) return;
          const gx = Number(c[0]);
          const gy = Number(c[1]);
          if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
          xMin = Math.min(xMin, gx);
          xMax = Math.max(xMax, gx);
          yMin = Math.min(yMin, gy);
          yMax = Math.max(yMax, gy);
        });
      }

      // taipei_d：路網／站點改在「縮減疊加網格」座標空間繪製（overlayRemovalMaps 由 execute_d_to_e_test 寫入 taipei_d）
      const tcLayerDraw = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      if (
        isTaipeiTestCDLayerTab(activeLayerTab.value) &&
        tcLayerDraw?.minSpacingOverlayCell &&
        Number(tcLayerDraw.minSpacingOverlayCell.cellW) > 0 &&
        Number(tcLayerDraw.minSpacingOverlayCell.cellH) > 0
      ) {
        taipeiCReducedOverlayDraw = true;
        // 與 schematicPlotMapper／Control 表格 mapNetworkToSchematicPlotXY 一致（taipei_c 無 rm 時勿再 floor(g/cell)）
        reducedPlotMapper =
          createReducedSchematicPlotMapper(tcLayerDraw) || ((gx, gy) => [Number(gx), Number(gy)]);

        const mapCoordPair = (p) => {
          if (!Array.isArray(p) || p.length < 2) return p;
          const [nx, ny] = reducedPlotMapper(Number(p[0]), Number(p[1]));
          return p.length > 2 ? [nx, ny, p[2]] : [nx, ny];
        };

        const mapCoordArray = (arr) => {
          if (!Array.isArray(arr)) return arr;
          return arr.map(mapCoordPair);
        };

        routeFeatures = routeFeatures.map((f) => {
          const coords = f.geometry?.coordinates;
          if (!coords) return f;
          const isMulti =
            coords.length > 0 && Array.isArray(coords[0]) && typeof coords[0][0] !== 'number';
          const newCoords = isMulti
            ? coords.map((line) => mapCoordArray(line))
            : mapCoordArray(coords);
          return {
            ...f,
            geometry: { ...f.geometry, coordinates: newCoords },
            properties: {
              ...f.properties,
              original_points: f.properties.original_points
                ? mapCoordArray(f.properties.original_points)
                : f.properties.original_points,
              points: f.properties.points
                ? mapCoordArray(f.properties.points)
                : f.properties.points,
            },
          };
        });

        stationFeatures = stationFeatures.map((f) => {
          const [x, y] = f.geometry.coordinates;
          const [nx, ny] = reducedPlotMapper(Number(x), Number(y));
          return {
            ...f,
            geometry: { ...f.geometry, coordinates: [nx, ny] },
            properties: { ...f.properties, x_grid: nx, y_grid: ny },
          };
        });

        xMin = Infinity;
        xMax = -Infinity;
        yMin = Infinity;
        yMax = -Infinity;
        const addB = (x, y) => {
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        };
        routeFeatures.forEach((f) => {
          const coords = f.geometry?.coordinates;
          if (!coords) return;
          const isMulti =
            coords.length > 0 && Array.isArray(coords[0]) && typeof coords[0][0] !== 'number';
          if (isMulti) {
            coords.forEach((line) => {
              line.forEach((c) => addB(c[0], c[1]));
            });
          } else {
            coords.forEach((c) => addB(c[0], c[1]));
          }
        });
        stationFeatures.forEach((f) => {
          const c = f.geometry?.coordinates;
          if (c) addB(c[0], c[1]);
        });
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
          xMin = 0;
          xMax = 1;
          yMin = 0;
          yMax = 1;
        } else {
          // 縮減疊加繪圖時不加邊界 padding，避免多畫一圈「空」網格線
          const pad = taipeiCReducedOverlayDraw ? 0 : 1;
          xMin -= pad;
          xMax += pad;
          yMin -= pad;
          yMax += pad;
        }
        // taipei_c：縮減網格 ix′/iy′ 為 0…n−1 之稠密索引；畫滿每一欄／列（僅用幾何 bbox 會漏掉無頂點但保留的格）
        if (
          isTaipeiTestCLayerTab(activeLayerTab.value) &&
          taipeiCReducedOverlayDraw &&
          !tcLayerDraw?.overlayShrinkApplyPending &&
          tcLayerDraw?.gridTooltipMaps?.collapseSortedX?.length &&
          tcLayerDraw?.gridTooltipMaps?.collapseSortedY?.length
        ) {
          const nx = tcLayerDraw.gridTooltipMaps.collapseSortedX.length;
          const ny = tcLayerDraw.gridTooltipMaps.collapseSortedY.length;
          xMin = -0.5;
          xMax = nx - 0.5;
          yMin = -0.5;
          yMax = ny - 0.5;
        }
      }
    } else {
      // GeoJSON 格式處理
      // 分離路線和站點
      routeFeatures = mapGeoJsonData.value.features.filter(
        (f) =>
          f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
      );
      stationFeatures = mapGeoJsonData.value.features.filter(
        (f) => f.geometry && f.geometry.type === 'Point'
      );

      // 計算邊界（使用網格座標）
      mapGeoJsonData.value.features.forEach((feature) => {
        if (!feature || !feature.geometry) return;
        const geom = feature.geometry;

        if (geom.type === 'Point') {
          const [x, y] = geom.coordinates;
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        } else if (geom.type === 'LineString') {
          geom.coordinates.forEach((coord) => {
            const [x, y] = coord;
            xMin = Math.min(xMin, x);
            xMax = Math.max(xMax, x);
            yMin = Math.min(yMin, y);
            yMax = Math.max(yMax, y);
          });
        } else if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach((line) => {
            line.forEach((coord) => {
              const [x, y] = coord;
              xMin = Math.min(xMin, x);
              xMax = Math.max(xMax, x);
              yMin = Math.min(yMin, y);
              yMax = Math.max(yMax, y);
            });
          });
        }
      });
    }

    /**
     * taipei_g：資料為整數格索引 (ix, iy)；路線／站點對齊格線交點 (ix, iy)。
     * 背景僅依軸刻度步長畫線（與刻度一致），不與縮減疊加繪圖、疊加網格對齊併用。
     */
    const overlayForSnap = taipeiCReducedOverlayDraw ? null : dataStore.shortestPairOverlayGrid;
    const useSchematicCellCenterGrid =
      isNormalizeFormat &&
      !taipeiCReducedOverlayDraw &&
      isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) &&
      !overlayForSnap;

    if (
      useSchematicCellCenterGrid &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax)
    ) {
      const gx0 = Math.floor(xMin);
      const gx1 = Math.ceil(xMax);
      const gy0 = Math.floor(yMin);
      const gy1 = Math.ceil(yMax);
      xMin = gx0;
      xMax = gx1 + 1;
      yMin = gy0;
      yMax = gy1 + 1;
    }

    /** taipei_g 邊緣欄／列最大權重（繪上／右緣前即算好，供比例尺與標籤共用） */
    const colWeightMax = new Map();
    const rowWeightMax = new Map();
    let taipeiFMinCellWFrac;
    let taipeiFMinCellHFrac;
    if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
      const acc = accumulateTaipeiFColRowWeightMaxFromFeatures(routeFeatures);
      acc.colWeightMax.forEach((v, k) => colWeightMax.set(k, v));
      acc.rowWeightMax.forEach((v, k) => rowWeightMax.set(k, v));
    }

    // 權重比例格寬／滑鼠焦點縮放僅 taipei_g；taipei_f 固定等寬等高（僅檢視）
    const mouseZoomOn =
      useSchematicCellCenterGrid &&
      isTaipeiGOrHWeightLayer(activeLayerTab.value) &&
      dataStore.taipeiFSpaceNetworkMouseZoom === true;
    if (mouseZoomOn) {
      const hh = taipeiFMouseZoomHover.value;
      const hx = Number.isFinite(hh.ix) ? hh.ix : null;
      const hy = Number.isFinite(hh.iy) ? hh.iy : null;
      colWeightMax.clear();
      rowWeightMax.clear();
      const nx = Math.max(0, Math.round(xMax - xMin));
      const ny = Math.max(0, Math.round(yMax - yMin));
      for (let j = 0; j < nx; j++) {
        const ix = xMin + j;
        const d = hx == null ? 999 : Math.abs(ix - hx);
        colWeightMax.set(ix, d <= 4 ? 5 - d : 1);
      }
      for (let j = 0; j < ny; j++) {
        const iy = yMin + j;
        const d = hy == null ? 999 : Math.abs(iy - hy);
        rowWeightMax.set(iy, d <= 4 ? 5 - d : 1);
      }
    }

    const taipeiFWeightScalingEffective = dataStore.taipeiFSpaceNetworkGridScaling !== false;
    const taipeiFApplyWeightPixelScaling =
      useSchematicCellCenterGrid &&
      isTaipeiGOrHWeightLayer(activeLayerTab.value) &&
      (mouseZoomOn || taipeiFWeightScalingEffective);

    // 設定比例尺（網格座標）；taipei_g 且開啟權重放大時欄寬／列高依權重比例；否則等寬等高
    let xScale;
    let yScale;
    if (taipeiFApplyWeightPixelScaling) {
      const squareWeightsForScale = !mouseZoomOn;
      const xs = createTaipeiFWeightedXScale(
        xMin,
        xMax,
        margin.left,
        width,
        colWeightMax,
        squareWeightsForScale
      );
      const ys = createTaipeiFWeightedYScale(
        yMin,
        yMax,
        margin.top,
        height,
        rowWeightMax,
        squareWeightsForScale
      );
      xScale = xs.scale;
      yScale = ys.scale;
      taipeiFMinCellWFrac = xs.minCellWFrac;
      taipeiFMinCellHFrac = ys.minCellHFrac;
    } else if (
      isTaipeiTest3BcdeLayerTab(activeLayerTab.value) &&
      dataStore.findLayerById(activeLayerTab.value)?.squareGridCellsTaipeiTest3 === true
    ) {
      /** 測試3且 Control 選「正方形」：與版面網格測試3一致，依繪區寬高取 min 並置中 */
      const spanX = xMax - xMin;
      const spanY = yMax - yMin;
      const sx = spanX > 0 ? spanX : 1;
      const sy = spanY > 0 ? spanY : 1;
      const cellSize = Math.min(width / sx, height / sy);
      const gridW = sx * cellSize;
      const gridH = sy * cellSize;
      const gridLeft = margin.left + (width - gridW) / 2;
      const gridTop = margin.top + (height - gridH) / 2;
      xScale = d3
        .scaleLinear()
        .domain([xMin, xMax])
        .range([gridLeft, gridLeft + gridW]);
      yScale = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([gridTop, gridTop + gridH]);
    } else {
      xScale = d3
        .scaleLinear()
        .domain([xMin, xMax])
        .range([margin.left, margin.left + width]);
      yScale = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([margin.top, margin.top + height]);
    }

    if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
      const bounds = {
        xSpan: xMax - xMin,
        ySpan: yMax - yMin,
        plotW: width,
        plotH: height,
      };
      if (taipeiFApplyWeightPixelScaling) {
        bounds.minCellWFrac = taipeiFMinCellWFrac;
        bounds.minCellHFrac = taipeiFMinCellHFrac;
      }
      dataStore.setSpaceNetworkSchematicPlotBounds(bounds);
    } else {
      dataStore.clearSpaceNetworkSchematicPlotBounds();
      dataStore.clearSpaceNetworkGridMinCellDimensions();
    }

    const offsetPathToSchematicCellCenters = (pathCoords) => pathCoords;

    /** 最小間距疊加網格 hover：taipei_c／d／e 有 minSpacingOverlayCell 且非縮減繪圖時，以 floor 算疊加格 */
    const minSpacingStLayer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    let minSpacingOverlay = null;
    if (
      minSpacingStLayer &&
      isTaipeiTestCDELayerTab(activeLayerTab.value) &&
      !taipeiCReducedOverlayDraw &&
      minSpacingStLayer.minSpacingOverlayCell &&
      Number(minSpacingStLayer.minSpacingOverlayCell.cellW) > 0 &&
      Number(minSpacingStLayer.minSpacingOverlayCell.cellH) > 0
    ) {
      minSpacingOverlay = {
        cellW: Number(minSpacingStLayer.minSpacingOverlayCell.cellW),
        cellH: Number(minSpacingStLayer.minSpacingOverlayCell.cellH),
      };
    }

    /** 等分網格座標 → 像素（滑鼠縮放時用於焦點欄／列索引，避免與權重比例尺循環） */
    const xPickLinear = d3
      .scaleLinear()
      .domain([xMin, xMax])
      .range([margin.left, margin.left + width]);
    const yPickLinear = d3
      .scaleLinear()
      .domain([yMax, yMin])
      .range([margin.top, margin.top + height]);

    /** 疊加與縮減數字相同時：避免誤以為未執行 b→c／縮減 */
    const eventToNetworkXY = (event) => {
      const t = d3.zoomTransform(svg.node());
      const [mouseX, mouseY] = d3.pointer(event, svg.node());
      const lx = (mouseX - t.x) / t.k;
      const ly = (mouseY - t.y) / t.k;
      return [xScale.invert(lx), yScale.invert(ly)];
    };

    const minSpacingInline = (gx, gy) => {
      const rm = minSpacingStLayer?.overlayRemovalMaps;
      const gtm = minSpacingStLayer?.gridTooltipMaps;
      if (taipeiCReducedOverlayDraw) {
        const ix = Math.round(Number(gx));
        const iy = Math.round(Number(gy));
        if (rm?.mapX) {
          const ov = overlayCoordsBeforeRemovalFromReduced(ix, iy, rm);
          if (ov && (ov[0] !== ix || ov[1] !== iy)) {
            return ` <span style="color:#c9f">[刪空前疊加 ${ov[0]},${ov[1]}] <span style="color:#a8f">[縮減 ${ix},${iy}]</span></span>`;
          }
          return ` <span style="color:#c9f">[縮減 ${ix},${iy}]</span>`;
        }
        const pair = gtm ? overlayReducedTooltipPair(ix, iy, gtm) : null;
        const ov = pair?.overlay;
        const red = pair?.reduced ?? [ix, iy];
        if (ov && (ov[0] !== red[0] || ov[1] !== red[1])) {
          return ` <span style="color:#c9f">[刪空／塌縮前 ${ov[0]},${ov[1]}] <span style="color:#a8f">[縮減 ${red[0]},${red[1]}]</span></span>`;
        }
        return ` <span style="color:#c9f">[縮減 ${red[0]},${red[1]}]</span>`;
      }
      if (!minSpacingOverlay) return '';
      const c = networkCoordToMinSpacingOverlayCell(
        gx,
        gy,
        minSpacingOverlay.cellW,
        minSpacingOverlay.cellH
      );
      if (!c) return '';
      const red = rm?.mapX ? remapOverlayCellAfterRemoval(c.ix, c.iy, rm) : null;
      return red && (red[0] !== c.ix || red[1] !== c.iy)
        ? ` <span style="color:#c9f">[疊加 ${c.ix},${c.iy}] <span style="color:#a8f">[縮減疊加 ${red[0]},${red[1]}]</span></span>`
        : ` <span style="color:#c9f">[疊加 ${c.ix},${c.iy}]</span>`;
    };

    /**
     * @param {'full' | 'supplementOnly'} mode — supplementOnly：主行已標「縮減網格索引」，此處僅在與刪空前不同時補一行對照
     */
    const minSpacingTooltipBlock = (gx, gy, mode = 'full') => {
      const supplementOnly = mode === 'supplementOnly';
      const rm = minSpacingStLayer?.overlayRemovalMaps;
      const gtm = minSpacingStLayer?.gridTooltipMaps;
      if (taipeiCReducedOverlayDraw) {
        const ix = Math.round(Number(gx));
        const iy = Math.round(Number(gy));
        if (rm?.mapX) {
          const ov = overlayCoordsBeforeRemovalFromReduced(ix, iy, rm);
          if (supplementOnly) {
            if (!ov || (ov[0] === ix && ov[1] === iy)) return '';
            return `<br><strong>刪空列／行前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})`;
          }
          let block = `<br><strong>縮減網格索引 (ix′, iy′):</strong> (${ix}, ${iy})`;
          if (ov && (ov[0] !== ix || ov[1] !== iy)) {
            block = `<br><strong>刪空列／行前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})` + block;
          }
          return block;
        }
        const pair = gtm ? overlayReducedTooltipPair(ix, iy, gtm) : null;
        const ov = pair?.overlay;
        const red = pair?.reduced ?? [ix, iy];
        if (supplementOnly) {
          if (!ov || (ov[0] === red[0] && ov[1] === red[1])) return '';
          return `<br><strong>刪空／塌縮前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})`;
        }
        let block = `<br><strong>縮減網格索引 (ix′, iy′):</strong> (${red[0]}, ${red[1]})`;
        if (ov && (ov[0] !== red[0] || ov[1] !== red[1])) {
          block = `<br><strong>刪空／塌縮前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})` + block;
        }
        return block;
      }
      if (!minSpacingOverlay) return '';
      const c = networkCoordToMinSpacingOverlayCell(
        gx,
        gy,
        minSpacingOverlay.cellW,
        minSpacingOverlay.cellH
      );
      if (!c) return '';
      const red = rm?.mapX ? remapOverlayCellAfterRemoval(c.ix, c.iy, rm) : null;
      let block = `<br><strong>疊加網格座標 (ix, iy):</strong> (${c.ix}, ${c.iy})`;
      if (red && (red[0] !== c.ix || red[1] !== c.iy)) {
        block += `<br><strong>縮減疊加網格座標 (ix′, iy′):</strong> (${red[0]}, ${red[1]})`;
      }
      return block;
    };

    // 🔍 設置縮放行為
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
        if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
          refreshSpaceNetworkMinCellDimensions();
        }
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);
    if (savedTaipeiFZoomTransform != null && isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
      svg.call(zoom.transform, savedTaipeiFZoomTransform);
    }
    savedTaipeiFZoomTransform = null;
    if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
      refreshSpaceNetworkMinCellDimensions();
    }

    // taipei_f／g：同步滑鼠網格座標到 dataStore（與 LayoutGridTab_Test4 同源）。
    // 其餘 map 圖層在 store「顯示滑鼠網格座標」開啟時亦同步，供 Control「空間網路圖」專區顯示。
    svg.on('mousemove.spaceNetworkFGridCoord', null);
    svg.on('mouseleave.spaceNetworkFGridCoord', null);
    const excludedMouseCoordLayers =
      activeLayerTab.value === 'taipei_6_1_test3' || activeLayerTab.value === 'taipei_6_1_test4';
    const showSpaceNetworkMouseGridCoord = dataStore.spaceNetworkGridShowMouseGridCoordinate;

    if (isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
      svg
        .on('mousemove.spaceNetworkFGridCoord', function (event) {
          let roundedGridX;
          let roundedGridY;
          if (mouseZoomOn) {
            const t = d3.zoomTransform(svg.node());
            const [mouseX, mouseY] = d3.pointer(event, svg.node());
            const lx = (mouseX - t.x) / t.k;
            const ly = (mouseY - t.y) / t.k;
            const gxL = xPickLinear.invert(lx);
            const gyL = yPickLinear.invert(ly);
            roundedGridX = Math.round(gxL);
            roundedGridY = Math.round(gyL);
            const nx = Math.max(0, Math.round(xMax - xMin));
            const ny = Math.max(0, Math.round(yMax - yMin));
            const inGrid =
              nx > 0 &&
              ny > 0 &&
              roundedGridX >= xMin &&
              roundedGridX <= xMin + nx - 1 &&
              roundedGridY >= yMin &&
              roundedGridY <= yMin + ny - 1;
            const nix = inGrid ? roundedGridX : null;
            const niy = inGrid ? roundedGridY : null;
            const prev = taipeiFMouseZoomHover.value;
            if (prev.ix !== nix || prev.iy !== niy) {
              taipeiFMouseZoomHover.value = { ix: nix, iy: niy };
              scheduleTaipeiFDrawForMouseZoom();
            }
          } else {
            const [gx, gy] = eventToNetworkXY(event);
            roundedGridX = Math.round(gx);
            roundedGridY = Math.round(gy);
          }
          if (
            roundedGridX >= Math.floor(xMin) - 1 &&
            roundedGridX <= Math.ceil(xMax) + 1 &&
            roundedGridY >= Math.floor(yMin) - 1 &&
            roundedGridY <= Math.ceil(yMax) + 1
          ) {
            dataStore.updateLayoutGridTabTest4MouseGridCoordinate(roundedGridX, roundedGridY);
          } else {
            dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
          }
        })
        .on('mouseleave.spaceNetworkFGridCoord', function () {
          dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
          if (mouseZoomOn) {
            const prev = taipeiFMouseZoomHover.value;
            if (prev.ix != null || prev.iy != null) {
              taipeiFMouseZoomHover.value = { ix: null, iy: null };
              scheduleTaipeiFDrawForMouseZoom();
            }
          }
        });
    } else if (
      (showSpaceNetworkMouseGridCoord || dataStore.spaceNetworkK4MouseBandFocusMagnifyEnabled) &&
      isMapLayer(activeLayerTab.value) &&
      !excludedMouseCoordLayers
    ) {
      svg
        .on('mousemove.spaceNetworkFGridCoord', function (event) {
          const [gx, gy] = eventToNetworkXY(event);
          const roundedGridX = Math.round(gx);
          const roundedGridY = Math.round(gy);
          if (
            roundedGridX >= Math.floor(xMin) - 1 &&
            roundedGridX <= Math.ceil(xMax) + 1 &&
            roundedGridY >= Math.floor(yMin) - 1 &&
            roundedGridY <= Math.ceil(yMax) + 1
          ) {
            dataStore.updateLayoutGridTabTest4MouseGridCoordinate(roundedGridX, roundedGridY);
          } else {
            dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
          }
        })
        .on('mouseleave.spaceNetworkFGridCoord', function () {
          dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
        });
    } else if (!excludedMouseCoordLayers) {
      dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
    }

    // 🎯 繪製邊界外框
    const borderGroup = zoomGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 計算網格間距（根據座標範圍自動調整）
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    /** taipei_d3／e3／f3／g3：整數座標系，背景與軸每 1 單位一條線／一個刻度 */
    const isTaipeiD3CoordNormalizeLayer =
      activeLayerTab.value === 'taipei_d3' ||
      activeLayerTab.value === 'taipei_e3' ||
      activeLayerTab.value === 'taipei_f3' ||
      activeLayerTab.value === 'taipei_g3' ||
      activeLayerTab.value === 'taipei_h3' ||
      isTaipeiTest3I3OrJ3LayerTab(activeLayerTab.value);

    /** 經緯度或小範圍連續座標：整數步長會變成 1 導致刻度迴圈為空，改以 d3.ticks 產生網格與軸刻度 */
    /** taipei_k3：固定每 10 格一線（與 space-network-grid-json-data-k3 檢視之網格座標對齊），不走連續抽稀 */
    const preferContinuousGridTicks =
      !isTaipeiD3CoordNormalizeLayer &&
      !taipeiCReducedOverlayDraw &&
      !useSchematicCellCenterGrid &&
      Number.isFinite(xRange) &&
      Number.isFinite(yRange) &&
      xRange > 1e-9 &&
      yRange > 1e-9 &&
      Math.max(xRange, yRange) <= 30;

    const formatAxisTickLabel = (tick, _span, asFloat) =>
      formatAxisTickLabelMaxTwoDecimals(tick, asFloat);

    // 縮減疊加／taipei_g：背景與軸皆每個整數一條線／一個刻度；其餘圖層網格與軸標籤可抽稀（粗步長為 5 的倍數）
    let xGridStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw || useSchematicCellCenterGrid
        ? 1
        : snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(xRange / 15)));
    let yGridStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw || useSchematicCellCenterGrid
        ? 1
        : snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(yRange / 15)));
    let tickXStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw
        ? snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(xRange / 15)))
        : useSchematicCellCenterGrid
          ? 1
          : xGridStep;
    let tickYStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw
        ? snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(yRange / 15)))
        : useSchematicCellCenterGrid
          ? 1
          : yGridStep;

    /** layout-network-grid：y 向網格／軸刻度步長與 x 一致（x／y 資料範圍不同時仍同疏密） */
    if (!useSchematicCellCenterGrid && !isTaipeiD3CoordNormalizeLayer) {
      yGridStep = xGridStep;
      tickYStep = tickXStep;
    }

    // 軸／網格共用刻度位置（taipei_g：整數格；連續座標：d3.ticks；其餘：整數步長抽稀）
    let layoutNetworkGridK3AxisOriginBottomLeft = false;
    const xTicks = [];
    const yTicks = [];
    if (useSchematicCellCenterGrid) {
      for (let tx = Math.ceil(xMin / tickXStep) * tickXStep; tx <= xMax; tx += tickXStep) {
        xTicks.push(tx);
      }
      for (let ty = Math.ceil(yMin / tickYStep) * tickYStep; ty <= yMax; ty += tickYStep) {
        yTicks.push(ty);
      }
    } else if (preferContinuousGridTicks) {
      const xTickStep = niceTickStepMultipleOf5(xRange, 10);
      // 需求：space-network-grid-k3 的水平線刻度與 x 軸一致
      const yTickStep = xTickStep;
      xTicks.push(...buildTicksInRange(xMin, xMax, xTickStep));
      yTicks.push(...buildTicksInRange(yMin, yMax, yTickStep));
    } else {
      for (let x = Math.ceil(xMin / tickXStep) * tickXStep; x <= xMax; x += tickXStep) {
        xTicks.push(x);
      }
      for (let y = Math.ceil(yMin / tickYStep) * tickYStep; y <= yMax; y += tickYStep) {
        yTicks.push(y);
      }
    }

    // 🎯 繪製淺灰色網格線（在背景層）
    const gridGroup = zoomGroup.append('g').attr('class', 'grid-group');

    if (useSchematicCellCenterGrid) {
      if (dataStore.showGrid) {
        xTicks.forEach((tick) => {
          const xPos = xScale(tick);
          gridGroup
            .append('line')
            .attr('x1', xPos)
            .attr('y1', margin.top)
            .attr('x2', xPos)
            .attr('y2', margin.top + height)
            .attr('stroke', '#E0E0E0')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.6);
        });
        yTicks.forEach((tick) => {
          const yPos = yScale(tick);
          gridGroup
            .append('line')
            .attr('x1', margin.left)
            .attr('y1', yPos)
            .attr('x2', margin.left + width)
            .attr('y2', yPos)
            .attr('stroke', '#E0E0E0')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.6);
        });
      }
    } else {
      xTicks.forEach((tick) => {
        const xPos = xScale(tick);
        gridGroup
          .append('line')
          .attr('x1', xPos)
          .attr('y1', margin.top)
          .attr('x2', xPos)
          .attr('y2', margin.top + height)
          .attr('stroke', '#E0E0E0')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.6);
      });
      yTicks.forEach((tick) => {
        const yPos = yScale(tick);
        gridGroup
          .append('line')
          .attr('x1', margin.left)
          .attr('y1', yPos)
          .attr('x2', margin.left + width)
          .attr('y2', yPos)
          .attr('stroke', '#E0E0E0')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.6);
      });
    }

    // 將網格線移到最底層
    gridGroup.lower();

    // 疊加縮減預覽：高亮目前步驟「會保留」的整欄或整列（刪空前 ix／iy）
    const shrinkStrip = dataStore.highlightedOverlayShrinkStrip;
    if (
      shrinkStrip &&
      shrinkStrip.layerId === activeLayerTab.value &&
      (shrinkStrip.kind === 'col' || shrinkStrip.kind === 'row') &&
      Number.isFinite(shrinkStrip.index)
    ) {
      const stripG = zoomGroup.append('g').attr('class', 'overlay-shrink-strip-highlight');
      const si = shrinkStrip.index;
      if (shrinkStrip.kind === 'col') {
        const xa = useSchematicCellCenterGrid ? xScale(si) : xScale(si - 0.5);
        const xb = useSchematicCellCenterGrid ? xScale(si + 1) : xScale(si + 0.5);
        const left = Math.min(xa, xb);
        const rw = Math.abs(xb - xa);
        stripG
          .append('rect')
          .attr('x', left)
          .attr('y', margin.top)
          .attr('width', rw)
          .attr('height', height)
          .attr('fill', 'rgba(180, 100, 255, 0.2)')
          .attr('stroke', 'rgba(120, 50, 200, 0.55)')
          .attr('stroke-width', 1)
          .attr('pointer-events', 'none');
      } else {
        const ya = useSchematicCellCenterGrid ? yScale(si) : yScale(si - 0.5);
        const yb = useSchematicCellCenterGrid ? yScale(si + 1) : yScale(si + 0.5);
        const top = Math.min(ya, yb);
        const rh = Math.abs(yb - ya);
        stripG
          .append('rect')
          .attr('x', margin.left)
          .attr('y', top)
          .attr('width', width)
          .attr('height', rh)
          .attr('fill', 'rgba(180, 100, 255, 0.2)')
          .attr('stroke', 'rgba(120, 50, 200, 0.55)')
          .attr('stroke-width', 1)
          .attr('pointer-events', 'none');
      }
    }

    // 🎯 繪製座標軸和刻度（在邊界外）
    const axisGroup = zoomGroup.append('g').attr('class', 'axis-group');

    // X軸刻度（taipei_g：標籤在格線座標 tick，與路線／站點一致）
    xTicks.forEach((tick) => {
      const xPos = xScale(tick);
      axisGroup
        .append('line')
        .attr('x1', xPos)
        .attr('y1', margin.top + height)
        .attr('x2', xPos)
        .attr('y2', margin.top + height + 5)
        .attr('stroke', '#666666')
        .attr('stroke-width', 1);
      axisGroup
        .append('text')
        .attr('x', xPos)
        .attr('y', margin.top + height + 18)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('fill', '#666666')
        .text(
          formatAxisTickLabel(
            layoutNetworkGridK3AxisOriginBottomLeft ? tick - xMin : tick,
            xRange,
            preferContinuousGridTicks
          )
        );
    });

    // Y軸刻度
    yTicks.forEach((tick) => {
      const yPos = yScale(tick);
      axisGroup
        .append('line')
        .attr('x1', margin.left)
        .attr('y1', yPos)
        .attr('x2', margin.left - 5)
        .attr('y2', yPos)
        .attr('stroke', '#666666')
        .attr('stroke-width', 1);
      axisGroup
        .append('text')
        .attr('x', margin.left - 8)
        .attr('y', yPos)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('fill', '#666666')
        .text(
          formatAxisTickLabel(
            layoutNetworkGridK3AxisOriginBottomLeft ? tick - yMin : tick,
            layoutNetworkGridK3AxisOriginBottomLeft ? xRange : yRange,
            preferContinuousGridTicks
          )
        );
    });

    // 創建線條生成器
    const lineGenerator = d3
      .line()
      .x((d) => xScale(d[0]))
      .y((d) => yScale(d[1]))
      .curve(d3.curveLinear);

    /** taipei_h2 導航：僅由 store 寫入 station_weights（路徑 10／其餘 0），此處不畫額外 highlight */
    const matchH2TrafficConnect = () => false;
    const matchH2TrafficBlack = () => false;

    // 疊加網格時：將紅點（交叉點）對齊到所在疊加網格單元中心
    // 縮減疊加格繪圖時座標已是格索引空間，不可再套用 shortestPair 疊加網格位移
    const overlayCellCenter = (gx, gy) => {
      if (!overlayForSnap || overlayForSnap.xLength <= 0 || overlayForSnap.yLength <= 0)
        return [gx, gy];
      const ox = overlayForSnap.xLength;
      const oy = overlayForSnap.yLength;
      const cx = (Math.floor(gx / ox) + 0.5) * ox;
      const cy = (Math.floor(gy / oy) + 0.5) * oy;
      return [cx, cy];
    };
    // 黑點重分配：位移交叉點後，黑點在「兩交叉點之間」的新線段上平均配置（僅疊加網格開啟時用）
    const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
    /** 測試3：折線邊的端點度數；度數≤1 之 connect 為末端（藍），≥2 為交叉（紅）。i3／j3 用 h3 全路網計度（切段後子折線度數會誤判） */
    let taipeiTest3ConnectDegreeMap = null;
    let segmentsForTest3ConnectDegree = flatSegments;
    if (isTaipeiTest3I3OrJ3LayerTab(activeLayerTab.value)) {
      const h3Layer = visibleLayers.value.find((l) => l.layerId === 'taipei_h3');
      const h3Data = h3Layer?.spaceNetworkGridJsonData;
      if (Array.isArray(h3Data) && h3Data.length > 0) {
        try {
          segmentsForTest3ConnectDegree = normalizeSpaceNetworkDataToFlatSegments(h3Data);
        } catch {
          segmentsForTest3ConnectDegree = flatSegments;
        }
      }
    }
    if (
      isTaipeiTest3BcdeLayerTab(activeLayerTab.value) &&
      Array.isArray(segmentsForTest3ConnectDegree) &&
      segmentsForTest3ConnectDegree.length > 0
    ) {
      taipeiTest3ConnectDegreeMap = new Map();
      const bumpDeg = (k) =>
        taipeiTest3ConnectDegreeMap.set(k, (taipeiTest3ConnectDegreeMap.get(k) || 0) + 1);
      const mapPt = reducedPlotMapper
        ? (gx, gy) => reducedPlotMapper(Number(gx), Number(gy))
        : (gx, gy) => [Number(gx), Number(gy)];
      for (const seg of segmentsForTest3ConnectDegree) {
        const pts = seg.points || [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const ax = Array.isArray(p0) ? Number(p0[0]) : Number(p0?.x ?? 0);
          const ay = Array.isArray(p0) ? Number(p0[1]) : Number(p0?.y ?? 0);
          const bx = Array.isArray(p1) ? Number(p1[0]) : Number(p1?.x ?? 0);
          const by = Array.isArray(p1) ? Number(p1[1]) : Number(p1?.y ?? 0);
          const [x1, y1] = mapPt(ax, ay);
          const [x2, y2] = mapPt(bx, by);
          const k1 = key(x1, y1);
          const k2 = key(x2, y2);
          if (k1 === k2) continue;
          bumpDeg(k1);
          bumpDeg(k2);
        }
      }
    }
    const taipeiTest3ConnectFill = (isConn, lx, ly) => {
      if (!isConn || !taipeiTest3ConnectDegreeMap) return null;
      const deg = taipeiTest3ConnectDegreeMap.get(key(lx, ly)) ?? 0;
      if (deg <= 1) return '#1565c0';
      return null;
    };

    /** 與度數≤1 末端同色：資料若標 terminal／terminus 等，不依全路網度數強制紅 */
    const connectBlueFromTaggedTerminal = (props, tags) => {
      const p = props && typeof props === 'object' ? props : {};
      const t = tags && typeof tags === 'object' ? tags : {};
      const raw =
        p.type ?? t.type ?? p.connect_type ?? t.connect_type ?? p.station_type ?? t.station_type;
      const s = raw == null ? '' : String(raw).trim().toLowerCase();
      if (!s) return false;
      return (
        s === 'terminal' || s === 'terminus' || s === 'end' || s === 'endpoint' || s === 'line_end'
      );
    };
    const connectKeys = new Set(
      stationFeatures
        .filter((f) => f.nodeType === 'connect')
        .map((f) => key(f.geometry.coordinates[0], f.geometry.coordinates[1]))
    );
    const blackRedistributeMap = new Map(); // key(x,y) -> [newX, newY]
    // 路線座標轉換：疊加網格時，線也一起移動（紅點→網格中心，黑點→平均配置）
    const transformPathCoords = (pathCoords) => {
      if (!overlayForSnap || !Array.isArray(pathCoords) || pathCoords.length < 2) return pathCoords;
      const indices = pathCoords
        .map((c, i) => (connectKeys.has(key(c[0], c[1])) ? i : -1))
        .filter((i) => i >= 0);
      if (indices.length < 2) return pathCoords;
      const result = [];
      for (let s = 0; s < indices.length - 1; s++) {
        const i0 = indices[s];
        const i1 = indices[s + 1];
        const start = overlayCellCenter(pathCoords[i0][0], pathCoords[i0][1]);
        const end = overlayCellCenter(pathCoords[i1][0], pathCoords[i1][1]);
        const blacks = pathCoords.slice(i0 + 1, i1);
        const N = blacks.length;
        result.push(start);
        for (let idx = 0; idx < N; idx++) {
          const t = (idx + 1) / (N + 1);
          const nx = start[0] + t * (end[0] - start[0]);
          const ny = start[1] + t * (end[1] - start[1]);
          result.push([nx, ny]);
          blackRedistributeMap.set(key(blacks[idx][0], blacks[idx][1]), [nx, ny]);
        }
        if (s === indices.length - 2) result.push(end);
      }
      return result.length > 0 ? result : pathCoords;
    };

    // 計算兩點之間的距離
    const dist = (p1, p2) => {
      const dx = p1[0] - p2[0];
      const dy = p1[1] - p2[1];
      return Math.sqrt(dx * dx + dy * dy);
    };

    // 在折線上找到距離起點 target_dist 的座標
    const getPointAtDistance = (polyline, targetDist) => {
      if (targetDist <= 0) return polyline[0];
      let currentDist = 0;
      for (let i = 0; i < polyline.length - 1; i++) {
        const p1 = polyline[i];
        const p2 = polyline[i + 1];
        const segLen = dist(p1, p2);
        if (currentDist + segLen >= targetDist) {
          const remain = targetDist - currentDist;
          const ratio = segLen > 0 ? remain / segLen : 0;
          return [p1[0] + (p2[0] - p1[0]) * ratio, p1[1] + (p2[1] - p1[1]) * ratio];
        }
        currentDist += segLen;
      }
      return polyline[polyline.length - 1];
    };

    // 計算某個車站點在折線上的路徑距離
    const getStationDistOnPolyline = (stationPt, polyline) => {
      let bestDist = 0;
      let minDistSq = Infinity;
      let currentAccumulatedDist = 0;

      for (let i = 0; i < polyline.length - 1; i++) {
        const p1 = polyline[i];
        const p2 = polyline[i + 1];
        const segLen = dist(p1, p2);

        // 投影點到線段
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
          currentAccumulatedDist += segLen;
          continue;
        }

        const t = Math.max(
          0,
          Math.min(1, ((stationPt[0] - p1[0]) * dx + (stationPt[1] - p1[1]) * dy) / lenSq)
        );
        const projPt = [p1[0] + t * dx, p1[1] + t * dy];
        const dSq = (stationPt[0] - projPt[0]) ** 2 + (stationPt[1] - projPt[1]) ** 2;

        if (dSq < minDistSq) {
          minDistSq = dSq;
          bestDist = currentAccumulatedDist + segLen * t;
        }

        currentAccumulatedDist += segLen;
      }

      return bestDist;
    };

    /** 路線 tooltip：單一數值完整顯示（整數不帶小數；非整數保留必要位數） */
    const formatPathCoordNumber = (n) => {
      if (!Number.isFinite(n)) return '';
      const r = Math.round(n);
      if (Math.abs(n - r) < 1e-9) return String(r);
      return n.toFixed(10).replace(/\.?0+$/, '');
    };

    const formatPathCoordPairForTooltipHtml = (gx, gy) => {
      if (!Number.isFinite(Number(gx)) || !Number.isFinite(Number(gy))) return '(—)';
      return `(${formatPathCoordNumber(gx)}, ${formatPathCoordNumber(gy)})`;
    };

    /** GeoJSON feature.properties 其餘欄位（已獨立列出的鍵不重複），供 layout-network-grid 等 hover 檢視 */
    const formatExtraFeaturePropsHtml = (obj, excludeKeys) => {
      if (!obj || typeof obj !== 'object') return '';
      const ex = new Set(Array.isArray(excludeKeys) ? excludeKeys : []);
      const lines = [];
      for (const [k, v] of Object.entries(obj)) {
        if (ex.has(k)) continue;
        let s;
        if (v === null) s = 'null';
        else if (typeof v === 'object') {
          try {
            s = JSON.stringify(v);
          } catch {
            s = String(v);
          }
          if (s.length > 280) s = `${s.slice(0, 277)}...`;
        } else {
          s = String(v);
        }
        lines.push(`<strong>${k}:</strong> ${s}`);
      }
      if (!lines.length) return '';
      return `<br><strong>— properties —</strong><br>${lines.join('<br>')}`;
    };

    // layout-network-grid（K3）：權重顯示以 dataTableData 為單一真值來源。
    const activeLayerForWeights = dataStore.findLayerById(activeLayerTab.value);
    const { lookup: routeSeqWeightLookupForK3, sequenceLookup: sequenceWeightLookupForK3 } =
      buildRouteSequenceWeightLookupFromTaipeiK3DataTable(activeLayerForWeights?.dataTableData);
    const drawnWeightLabelByFlatSegmentIndex = new Set();

    const routeStrokeScaleLinear = dataStore.showRouteThickness
      ? buildRouteWeightStrokeScaleLinear(
          collectWeightsFromK3RouteDrawing(
            routeFeatures,
            routeSeqWeightLookupForK3?.size ? routeSeqWeightLookupForK3 : sequenceWeightLookupForK3
          )
        )
      : null;

    const drawRoutePath = (
      coords,
      tags,
      name,
      color,
      stationWeights,
      originalPoints,
      points,
      isHvZTest3E3F3Highlight = false,
      featureProps = null
    ) => {
      // 獲取顏色（參考 MapTab / Python 規則）
      const routeColor = tags?.colour || tags?.color || '#2c7bb6';
      const pathData = lineGenerator(coords);
      if (!pathData) return;

      const baseStroke = isHvZTest3E3F3Highlight ? '#c2185b' : routeColor;
      const flatSegIdx = Number(featureProps?._flatSegmentIndex);
      const routeKeyForWeight = normalizeTaipeiK3WeightKeyPart(name);
      const routeSeqForWeight = Number.isFinite(flatSegIdx) ? flatSegIdx + 1 : NaN;
      const routeSeqWeightKey = `${routeKeyForWeight}|${routeSeqForWeight}`;
      const routeNameMatchedWeight =
        routeKeyForWeight &&
        Number.isFinite(routeSeqForWeight) &&
        routeSeqWeightLookupForK3.has(routeSeqWeightKey)
          ? routeSeqWeightLookupForK3.get(routeSeqWeightKey)
          : null;
      const dataTableWeightForThisSegment =
        routeNameMatchedWeight != null
          ? routeNameMatchedWeight
          : Number.isFinite(routeSeqForWeight) &&
              sequenceWeightLookupForK3?.has(routeSeqForWeight)
            ? sequenceWeightLookupForK3.get(routeSeqForWeight)
            : null;

      let routeTooltipHtml = '';

      const resolveWeightForRouteLineWidth = () => {
        if (Number.isFinite(Number(dataTableWeightForThisSegment))) {
          const n = Number(dataTableWeightForThisSegment);
          if (n > 0) return n;
        }
        if (Array.isArray(stationWeights) && stationWeights.length > 0) {
          let mx = 0;
          for (const w of stationWeights) {
            const n = Number(w?.weight);
            if (Number.isFinite(n) && n > mx) mx = n;
          }
          if (mx > 0) return mx;
        }
        const tw = Number(tags?.weight ?? tags?.route_weight ?? tags?.routeWeight);
        if (Number.isFinite(tw) && tw > 0) return tw;
        return 1;
      };

      const linePx =
        dataStore.showRouteThickness && routeStrokeScaleLinear
          ? strokeWidthPxFromWeightScale(routeStrokeScaleLinear, resolveWeightForRouteLineWidth())
          : null;
      const baseStrokeW =
        linePx != null ? formatStrokeWidthPx(linePx) : isHvZTest3E3F3Highlight ? 7 : 3;
      const hoverStrokeW =
        linePx != null ? formatStrokeWidthPx(linePx * 1.5) : isHvZTest3E3F3Highlight ? 9 : 5;

      const pathElement = zoomGroup
        .append('path')
        .attr('d', pathData)
        .attr('stroke', baseStroke)
        .attr('fill', 'none')
        .attr('stroke-width', baseStrokeW)
        .attr('opacity', 0.9)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('cursor', 'pointer')
        .style('pointer-events', 'stroke');

      // 添加 hover 效果
      pathElement
        .on('mouseover', function (event) {
          // 高亮路線
          d3.select(this).attr('stroke-width', hoverStrokeW).attr('opacity', 1);

          // 顯示 tooltip
          let tooltipContent = '';
          if (name) {
            tooltipContent += `<strong>路線名稱:</strong> ${name}<br>`;
          }
          /** 路徑上除起迄外的每一個頂點（含共線中間點），與資料折線一致 */
          const interiorCoords = coords.length > 2 ? coords.slice(1, -1) : [];
          const fmt = (p) => {
            if (!p) return '';
            const gx = Number(p[0]);
            const gy = Number(p[1]);
            const show = formatPathCoordPairForTooltipHtml(gx, gy);
            return `${show}${minSpacingInline(gx, gy)}`;
          };
          tooltipContent += `<strong>這一個路段的轉折點數:</strong> ${interiorCoords.length}`;
          if (coords.length >= 2) {
            tooltipContent += `<br><strong>起點座標:</strong> ${fmt(coords[0])}<br><strong>終點座標:</strong> ${fmt(coords[coords.length - 1])}`;
          }
          if (interiorCoords.length > 0) {
            tooltipContent += `<br><strong>轉折點座標（依序）:</strong> ${interiorCoords.map((p) => fmt(p)).join('；')}`;
          } else if (coords.length >= 2) {
            tooltipContent += `<br><strong>轉折點座標:</strong> （無）`;
          }
          tooltipContent += '<br>';
          if (tags) {
            const tagsHtml = Object.entries(tags)
              .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
              .join('<br>');
            tooltipContent += tagsHtml || '無標籤資訊';
          }
          if (Number.isFinite(Number(dataTableWeightForThisSegment))) {
            tooltipContent += '<br><strong>站間權重 (dataTable):</strong><br>';
            tooltipContent += `  路段序=${routeSeqForWeight}，weight=${Number(dataTableWeightForThisSegment)}<br>`;
          } else if (stationWeights && Array.isArray(stationWeights) && stationWeights.length > 0) {
            tooltipContent += '<br><strong>站間權重 (station_weights):</strong><br>';
            stationWeights.forEach((w, wi) => {
              const sw = w?.start_idx;
              const ew = w?.end_idx;
              const wt = w?.weight;
              tooltipContent += `  #${wi + 1} start_idx=${sw} → end_idx=${ew}，weight=${wt}<br>`;
            });
          }
          if (featureProps && typeof featureProps === 'object') {
            tooltipContent += formatExtraFeaturePropsHtml(featureProps, [
              'tags',
              'name',
              'color',
              'station_weights',
              'original_points',
              'points',
            ]);
          }

          routeTooltipHtml = tooltipContent || '無標籤資訊';

          tooltip
            .html(routeTooltipHtml)
            .style('opacity', 1)
            .style('left', event.pageX + 10 + 'px')
            .style('top', event.pageY - 10 + 'px');
        })
        .on('mousemove', function (event) {
          tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
          if ((!minSpacingOverlay && !taipeiCReducedOverlayDraw) || !routeTooltipHtml) return;
          const [gx, gy] = eventToNetworkXY(event);
          const near = closestPointOnPolyline(coords, gx, gy);
          if (!near) return;
          const [qx, qy] = near;
          const nqx = qx;
          const nqy = qy;
          const nearCoordStr = formatPathCoordPairForTooltipHtml(nqx, nqy);
          const nearLine = `<br><strong>游標鄰近路徑點:</strong> ${nearCoordStr}${minSpacingTooltipBlock(nqx, nqy)}`;
          tooltip.html(routeTooltipHtml + nearLine);
        })
        .on('mouseout', function () {
          // 恢復路線樣式
          d3.select(this)
            .attr('stroke-width', baseStrokeW)
            .attr('opacity', 0.9)
            .attr('stroke', baseStroke);

          // 隱藏 tooltip
          tooltip.style('opacity', 0);
        });

      // 繪製權重：優先 dataTable（單一真值來源）；若無 dataTable 對應才回退 station_weights。
      if (
        (!useSchematicCellCenterGrid || dataStore.showWeightLabels) &&
        dataStore.spaceNetworkGridShowRouteWeights
      ) {
        const appendWeightLabel = (px, py, textValue) => {
          const textGroup = zoomGroup.append('g').attr('class', 'edge-weight-label');
          textGroup
            .append('text')
            .attr('x', xScale(px))
            .attr('y', yScale(py))
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', useSchematicCellCenterGrid ? '9px' : '7px')
            .attr('font-weight', 'bold')
            .attr('fill', '#1a1a1a')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.4)
            .attr('paint-order', 'stroke')
            .style('pointer-events', 'none')
            .text(String(textValue));
        };

        if (Number.isFinite(Number(dataTableWeightForThisSegment))) {
          // 同一 flat segment（MultiLineString 可能分多 path）只畫一次，避免 97 重覆。
          if (!Number.isFinite(flatSegIdx) || !drawnWeightLabelByFlatSegmentIndex.has(flatSegIdx)) {
            if (Number.isFinite(flatSegIdx)) drawnWeightLabelByFlatSegmentIndex.add(flatSegIdx);
            if (Array.isArray(coords) && coords.length >= 2) {
              let totalDist = 0;
              for (let i = 0; i < coords.length - 1; i++)
                totalDist += dist(coords[i], coords[i + 1]);
              const [midX, midY] = getPointAtDistance(coords, totalDist / 2);
              appendWeightLabel(midX, midY, Number(dataTableWeightForThisSegment));
            }
          }
        } else if (
          stationWeights &&
          Array.isArray(stationWeights) &&
          stationWeights.length > 0 &&
          Array.isArray(coords) &&
          coords.length >= 2
        ) {
          const refPoints = originalPoints || points || coords;
          if (Array.isArray(refPoints) && refPoints.length >= 2) {
            const refCoords = refPoints
              .map((pt) => {
                if (Array.isArray(pt)) {
                  return pt.length >= 2 ? [pt[0], pt[1]] : null;
                }
                return pt && pt.x !== undefined && pt.y !== undefined ? [pt.x, pt.y] : null;
              })
              .filter((pt) => pt !== null);

            if (refCoords.length >= 2) {
              const stationDists = refCoords.map((pt) => getStationDistOnPolyline(pt, coords));
              stationWeights.forEach((weightInfo) => {
                const { start_idx, end_idx, weight } = weightInfo;
                if (
                  typeof start_idx !== 'number' ||
                  typeof end_idx !== 'number' ||
                  start_idx < 0 ||
                  end_idx < 0 ||
                  start_idx >= stationDists.length ||
                  end_idx >= stationDists.length ||
                  start_idx >= end_idx
                ) {
                  return;
                }

                const startDist = stationDists[start_idx];
                const endDist = stationDists[end_idx];
                const midDist = (startDist + endDist) / 2;
                const midPoint = getPointAtDistance(coords, midDist);
                const [midX, midY] = midPoint;
                appendWeightLabel(midX, midY, weight);
              });
            }
          }
        }
      }
    };

    const hvTransformPath = (path) => {
      if (!Array.isArray(path) || path.length < 2) return path;
      if (isTaipeiE3DiagonalSawtoothDisplayLayerTab(activeLayerTab.value)) {
        return expandPolylineDiagonalsToSawtoothDisplay(path, 1);
      }
      return path;
    };

    // 繪製路線（支援 LineString / MultiLineString）；有疊加網格時線一起移動
    routeFeatures.forEach((feature) => {
      if (!feature || !feature.geometry) return;
      const props = feature.properties || {};
      const tags = props.tags || {};
      const geom = feature.geometry;
      const isHvZHl = false;

      if (geom.type === 'LineString') {
        drawRoutePath(
          offsetPathToSchematicCellCenters(hvTransformPath(transformPathCoords(geom.coordinates))),
          tags,
          props.name,
          props.color,
          props.station_weights,
          props.original_points,
          props.points,
          isHvZHl,
          props
        );
      } else if (geom.type === 'MultiLineString') {
        geom.coordinates.forEach((coords) => {
          drawRoutePath(
            offsetPathToSchematicCellCenters(hvTransformPath(transformPathCoords(coords))),
            tags,
            props.name,
            props.color,
            props.station_weights,
            props.original_points,
            props.points,
            isHvZHl,
            props
          );
        });
      }
    });

    // taipei_f：欄高亮——垂直線 overlay（SectionData 路段紅色，其餘綠色；無 per-path 色則橘色）
    const colHl = dataStore.taipeiFColRouteHighlight;
    if (
      isTaipeiTestFLayerTab(activeLayerTab.value) &&
      colHl &&
      colHl.layerId === activeLayerTab.value &&
      Array.isArray(colHl.verticalPaths) &&
      colHl.verticalPaths.length > 0
    ) {
      const colHlG = zoomGroup.append('g').attr('class', 'taipei-f-col-vertical-highlight');
      colHl.verticalPaths.forEach((pathCoords, pi) => {
        if (!Array.isArray(pathCoords) || pathCoords.length < 2) return;
        const transformed = offsetPathToSchematicCellCenters(
          hvTransformPath(transformPathCoords(pathCoords))
        );
        const d = lineGenerator(transformed);
        if (!d) return;
        const stroke =
          Array.isArray(colHl.verticalPathColors) && colHl.verticalPathColors[pi]
            ? colHl.verticalPathColors[pi]
            : '#ff6600';
        colHlG
          .append('path')
          .attr('d', d)
          .attr('stroke', stroke)
          .attr('fill', 'none')
          .attr('stroke-width', 8)
          .attr('opacity', 0.65)
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'none');
      });
    }

    // taipei_f：列高亮——水平線 overlay（SectionData 紅／其他綠；無 per-path 色則青綠）
    const rowHl = dataStore.taipeiFRowRouteHighlight;
    if (
      isTaipeiTestFLayerTab(activeLayerTab.value) &&
      rowHl &&
      rowHl.layerId === activeLayerTab.value &&
      Array.isArray(rowHl.horizontalPaths) &&
      rowHl.horizontalPaths.length > 0
    ) {
      const rowHlG = zoomGroup.append('g').attr('class', 'taipei-f-row-horizontal-highlight');
      rowHl.horizontalPaths.forEach((pathCoords, pi) => {
        if (!Array.isArray(pathCoords) || pathCoords.length < 2) return;
        const transformed = offsetPathToSchematicCellCenters(
          hvTransformPath(transformPathCoords(pathCoords))
        );
        const dRow = lineGenerator(transformed);
        if (!dRow) return;
        const stroke =
          Array.isArray(rowHl.horizontalPathColors) && rowHl.horizontalPathColors[pi]
            ? rowHl.horizontalPathColors[pi]
            : '#009688';
        rowHlG
          .append('path')
          .attr('d', dRow)
          .attr('stroke', stroke)
          .attr('fill', 'none')
          .attr('stroke-width', 8)
          .attr('opacity', 0.65)
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'none');
      });
    }

    if (
      useSchematicCellCenterGrid &&
      dataStore.showWeightLabels &&
      dataStore.spaceNetworkGridShowRouteWeights &&
      !isTaipeiTestILayerTab(activeLayerTab.value) &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax) &&
      xMax > xMin &&
      yMax > yMin
    ) {
      const marginMaxG = zoomGroup.append('g').attr('class', 'taipei-f-grid-margin-weight-max');
      const edgeLabelFill = '#1565C0';
      const edgeFs = '11px';
      // 每欄／每列皆顯示；無水平線之欄、無垂直線之列顯示 0
      for (let ix = xMin; ix < xMax; ix++) {
        const maxW = colWeightMax.get(ix);
        const label = Number.isFinite(maxW) ? String(maxW) : '0';
        marginMaxG
          .append('text')
          .attr('x', xScale(ix + 0.5))
          .attr('y', margin.top - 3)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'bottom')
          .attr('font-size', edgeFs)
          .attr('font-weight', 'bold')
          .attr('fill', edgeLabelFill)
          .text(label);
      }
      for (let iy = yMin; iy < yMax; iy++) {
        const maxW = rowWeightMax.get(iy);
        const label = Number.isFinite(maxW) ? String(maxW) : '0';
        marginMaxG
          .append('text')
          .attr('x', margin.left + width + 4)
          .attr('y', yScale(iy + 0.5))
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', edgeFs)
          .attr('font-weight', 'bold')
          .attr('fill', edgeLabelFill)
          .text(label);
      }
    }

    // 繪製站點（根據 nodeType 區分 connect 和 line）
    stationFeatures.forEach((feature) => {
      const [x, y] = feature.geometry.coordinates;
      const props = feature.properties || {};
      const tags = props.tags || {};
      const nodeType = feature.nodeType || 'line'; // connect 或 line

      // 根據 nodeType 決定顏色和大小
      const isConnect = nodeType === 'connect';
      // 直線化測試／網格正規化：僅在「車站配置」開啟且已有 SectionData 時改由下方專區繪製，避免與 segment.nodes 重疊
      // taipei_h3：g3→h3 黑點僅存在於 segment.nodes／stationFeatures，專區未畫中段站，須走本迴圈
      const stLayer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      if (
        TAIPEI_TEST_SPACE_NETWORK_STATION_TAB_IDS.includes(activeLayerTab.value) &&
        activeLayerTab.value !== 'taipei_h3' &&
        !isTaipeiTest3I3OrJ3LayerTab(activeLayerTab.value) &&
        stLayer?.spaceNetworkGridJsonData_SectionData?.length > 0 &&
        stLayer?.showStationPlacement
      )
        return;

      // 有疊加網格時：紅點對齊網格單元中心；黑點依重分配表畫在兩交叉點間平均位置
      let drawX = x;
      let drawY = y;
      if (overlayForSnap) {
        if (isConnect) {
          [drawX, drawY] = overlayCellCenter(x, y);
        } else {
          const redist = blackRedistributeMap.get(key(x, y));
          if (redist) [drawX, drawY] = redist;
        }
      }
      const fillColor =
        isConnect && connectBlueFromTaggedTerminal(props, tags)
          ? '#1565c0'
          : (taipeiTest3ConnectFill(isConnect, x, y) ?? (isConnect ? '#ff0000' : '#000000'));
      const cn = props.connect_number ?? tags.connect_number;
      const sidLine = props.station_id ?? tags.station_id;
      const gxLine = props.x_grid !== undefined ? Number(props.x_grid) : Number(x);
      const gyLine = props.y_grid !== undefined ? Number(props.y_grid) : Number(y);
      const isConnectHl =
        isConnect &&
        dataStore.highlightedConnectNumber != null &&
        cn === dataStore.highlightedConnectNumber;
      const isH2ConnectHl = isConnect && matchH2TrafficConnect(cn);
      const isH2BlackHl = !isConnect && matchH2TrafficBlack(gxLine, gyLine, sidLine);
      const isHighlighted = isConnectHl || isH2ConnectHl;
      const isOnOtherRoute = isHighlighted || isH2BlackHl;
      const radius = isHighlighted || isH2BlackHl ? 5 : isConnect ? 2.5 : 1.5;
      const strokeWidth = isHighlighted || isH2BlackHl ? 2.5 : 1;
      const strokeColor = isHighlighted || isH2BlackHl ? '#ff6600' : fillColor;

      const circleElement = zoomGroup
        .append('circle')
        .attr('cx', xScale(drawX))
        .attr('cy', yScale(drawY))
        .attr('r', radius)
        .attr('fill', fillColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('class', isOnOtherRoute ? 'highlighted-connect-point' : '')
        .style('cursor', 'pointer');

      if (dataStore.showStationNames && isConnect) {
        let labelName = props.station_name !== undefined ? props.station_name : tags.station_name;
        if (labelName == null || String(labelName).trim() === '') {
          labelName = tags.name;
        }
        labelName = labelName != null ? String(labelName).trim() : '';
        if (labelName) {
          zoomGroup
            .append('text')
            .attr('x', xScale(drawX))
            .attr('y', yScale(drawY) - radius - 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', '11px')
            .attr('font-weight', 'bold')
            .attr('fill', '#1a1a1a')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.35)
            .attr('paint-order', 'stroke')
            .style('pointer-events', 'none')
            .text(labelName);
        }
      } else if (dataStore.showBlackDotStationNames && !isConnect) {
        let labelName = props.station_name !== undefined ? props.station_name : tags.station_name;
        if (labelName == null || String(labelName).trim() === '') {
          labelName = tags.name;
        }
        labelName = labelName != null ? String(labelName).trim() : '';
        if (labelName) {
          zoomGroup
            .append('text')
            .attr('x', xScale(drawX))
            .attr('y', yScale(drawY) - radius - 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#1a1a1a')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.35)
            .attr('paint-order', 'stroke')
            .style('pointer-events', 'none')
            .text(labelName);
        }
      }

      // 添加 hover 效果
      circleElement
        .on('mouseover', function (event) {
          // 高亮站點
          const highlightRadius = isConnect ? 4 : 3;
          d3.select(this).attr('r', highlightRadius).attr('stroke-width', 2);

          // 顯示 tooltip（包含座標和標籤）
          const gridGx =
            props.x_proj !== undefined && props.y_proj !== undefined
              ? Number(props.x_proj)
              : props.x_grid !== undefined
                ? Number(props.x_grid)
                : Number(x);
          const gridGy =
            props.y_proj !== undefined && props.y_proj !== undefined
              ? Number(props.y_proj)
              : props.y_grid !== undefined
                ? Number(props.y_grid)
                : Number(y);

          let coordinateHtml;
          if (taipeiCReducedOverlayDraw) {
            coordinateHtml = `<strong>縮減網格索引 (ix′, iy′):</strong> (${Math.round(gridGx)}, ${Math.round(gridGy)})`;
          } else if (props.x_proj !== undefined && props.y_proj !== undefined) {
            coordinateHtml = `<strong>座標:</strong> (${props.x_proj}, ${props.y_proj})`;
          } else if (props.x_grid !== undefined && props.y_grid !== undefined) {
            coordinateHtml = `<strong>座標:</strong> (${props.x_grid}, ${props.y_grid})`;
          } else {
            coordinateHtml = `<strong>座標:</strong> (${x}, ${y})`;
          }

          const spacingBlock = taipeiCReducedOverlayDraw
            ? minSpacingTooltipBlock(gridGx, gridGy, 'supplementOnly')
            : minSpacingTooltipBlock(gridGx, gridGy);
          let tooltipParts = [coordinateHtml + spacingBlock];

          // 優先顯示 station_id 和 station_name（同時支援 props 直屬與 props.tags）
          const stationId = props.station_id !== undefined ? props.station_id : tags.station_id;
          const stationName =
            props.station_name !== undefined ? props.station_name : tags.station_name;
          if (stationId !== undefined) {
            tooltipParts.push(`<strong>站點ID:</strong> ${stationId}`);
          }
          if (stationName !== undefined) {
            tooltipParts.push(`<strong>站點名稱:</strong> ${stationName}`);
          }

          // 顯示 connect_number（如果存在，用紅色標示）
          if (props.connect_number !== undefined) {
            tooltipParts.push(
              `<strong style="color: #ff0000;">Connect #:</strong> <span style="color: #ff0000;">${props.connect_number}</span>`
            );
          }

          // 顯示 node_type
          if (props.node_type !== undefined) {
            tooltipParts.push(`<strong>節點類型:</strong> ${props.node_type}`);
          }

          // 顯示其他 tags
          const tagsHtml = Object.entries(tags)
            .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
            .join('<br>');
          if (tagsHtml) {
            tooltipParts.push(tagsHtml);
          }

          const extraStationProps = formatExtraFeaturePropsHtml(props, [
            'tags',
            'station_id',
            'station_name',
            'connect_number',
            'node_type',
            'x_grid',
            'y_grid',
            'x_proj',
            'y_proj',
            'display',
          ]);
          if (extraStationProps) tooltipParts.push(extraStationProps);

          const tooltipContent = tooltipParts.join('<br>');

          tooltip
            .html(tooltipContent)
            .style('opacity', 1)
            .style('left', event.pageX + 10 + 'px')
            .style('top', event.pageY - 10 + 'px');
        })
        .on('mousemove', function (event) {
          // 更新 tooltip 位置
          tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
        })
        .on('mouseout', function () {
          // 恢復站點樣式
          d3.select(this).attr('r', radius).attr('stroke-width', 1);

          // 隱藏 tooltip
          tooltip.style('opacity', 0);
        });
    });

    // 🎯 車站配置：ConnectData(紅點) -> SectionData(黑點順序) -> StationData(完整站屬性)
    if (TAIPEI_TEST_SPACE_NETWORK_STATION_TAB_IDS.includes(activeLayerTab.value)) {
      const stLayer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      // taipei_h3：黑／紅／藍皆已由上方 stationFeatures 迴圈繪製，勿再由此區塊重畫
      if (
        stLayer?.showStationPlacement &&
        activeLayerTab.value !== 'taipei_h3' &&
        !isTaipeiTest3I3OrJ3LayerTab(activeLayerTab.value)
      ) {
        const connectData = snConnectForK3TabLayer(stLayer);
        const sectionData = snSectionForK3TabLayer(stLayer);
        const stationData = snStationForK3TabLayer(stLayer);
        const rtData = snRoutesForK3TabLayer(stLayer);
        // taipei_g：預建完整站名查詢 ctx（含 SectionData connect_start/end 站名補查）
        const taipeiFLabelCtx =
          isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) &&
          Array.isArray(connectData) &&
          Array.isArray(sectionData)
            ? {
                connectNumberToNameId: buildConnectNumberToNameIdMap(connectData, sectionData),
                connectGridKeyToNameId: buildConnectGridKeyToNameIdMap(connectData, sectionData),
                sectionRouteGridNameIdMap: buildSectionRouteGridNameIdMap(sectionData),
                sectionGridKeyToNameIdMap: buildSectionGridKeyToNameIdMap(sectionData),
                blackLabelsByGrid: buildBlackStationDisplayByGrid(stationData),
                stationData,
                connectData,
              }
            : null;
        if (Array.isArray(connectData) && Array.isArray(sectionData) && Array.isArray(rtData)) {
          const flatSegs =
            rtData.length > 0 && rtData[0]?.segments && !rtData[0]?.points
              ? rtData.flatMap((r) =>
                  (r.segments || []).map((s) => ({
                    ...s,
                    route_name: s.route_name ?? r.route_name ?? r.name,
                    name: s.name ?? r.route_name ?? r.name,
                  }))
                )
              : rtData;

          const toNum = (v) => Number(v ?? 0);
          const getC = (p) =>
            Array.isArray(p) ? [toNum(p[0]), toNum(p[1])] : [toNum(p?.x), toNum(p?.y)];
          const pointKey = (x, y) => `${toNum(x)},${toNum(y)}`;
          const normalizeRouteKey = (arr) =>
            (Array.isArray(arr) ? arr : [])
              .map((r) => String(r ?? '').trim())
              .filter((r) => r !== '')
              .sort()
              .join('|');

          const stationLookup = new Map();
          if (Array.isArray(stationData)) {
            stationData.forEach((s) => {
              if (s.station_id) stationLookup.set(s.station_id, s);
            });
          }

          // 從當前路段端點建立「當前紅點」：座標 + 經過的路線名（route_list）
          const currentConnects = new Map();
          flatSegs.forEach((seg) => {
            const routeName = seg.route_name ?? seg.name ?? 'Unknown';
            const pts = seg.points?.map(getC) || [];
            if (pts.length < 2) return;
            for (const pt of [pts[0], pts[pts.length - 1]]) {
              const k = pointKey(pt[0], pt[1]);
              if (!currentConnects.has(k)) {
                currentConnects.set(k, { x: pt[0], y: pt[1], routeNames: new Set() });
              }
              currentConnects.get(k).routeNames.add(routeName);
            }
          });

          // 依 route_list 分組儲存的 ConnectData（同一 route_list 可能多筆，用座標接近度區分）
          const connectByRouteKey = new Map();
          connectData.forEach((cd) => {
            if (!cd) return;
            const rk = normalizeRouteKey(cd.route_list);
            if (!rk) return;
            if (!connectByRouteKey.has(rk)) connectByRouteKey.set(rk, []);
            connectByRouteKey.get(rk).push(cd);
          });

          const connectByNumber = new Map();
          const connectByCoord = new Map();
          connectData.forEach((c) => {
            if (!c) return;
            const cn = c.connect_number ?? c.tags?.connect_number;
            const cx = c.x_grid ?? c.tags?.x_grid;
            const cy = c.y_grid ?? c.tags?.y_grid;
            if (cn != null && !connectByNumber.has(cn)) connectByNumber.set(cn, c);
            if (cx != null && cy != null) {
              const pk = pointKey(cx, cy);
              if (!connectByCoord.has(pk)) connectByCoord.set(pk, c);
            }
          });
          const resolveConnect = (props, fallbackPoint) => {
            const cn = props?.connect_number ?? props?.tags?.connect_number;
            if (cn != null && connectByNumber.has(cn)) return connectByNumber.get(cn);
            const x = props?.x_grid ?? props?.tags?.x_grid ?? fallbackPoint?.[0];
            const y = props?.y_grid ?? props?.tags?.y_grid ?? fallbackPoint?.[1];
            if (x != null && y != null) return connectByCoord.get(pointKey(x, y)) || null;
            return null;
          };
          const connectId = (cd) => {
            if (!cd) return null;
            const cn = cd.connect_number ?? cd.tags?.connect_number;
            if (cn != null) return `cn:${cn}`;
            const cx = cd.x_grid ?? cd.tags?.x_grid;
            const cy = cd.y_grid ?? cd.tags?.y_grid;
            if (cx != null && cy != null) return `xy:${pointKey(cx, cy)}`;
            return null;
          };
          const pairKey = (a, b) => [a, b].sort().join(' <-> ');
          const sectionBuckets = new Map();
          sectionData.forEach((sd) => {
            if (!sd) return;
            const startCd = resolveConnect(sd.connect_start, null);
            const endCd = resolveConnect(sd.connect_end, null);
            const startCid = connectId(startCd);
            const endCid = connectId(endCd);
            const key = startCid && endCid ? pairKey(startCid, endCid) : null;
            if (key) {
              if (!sectionBuckets.has(key)) sectionBuckets.set(key, []);
              sectionBuckets.get(key).push(sd);
            }
          });

          const expectedBlackCount = sectionData.reduce((sum, sd) => {
            if (!sd) return sum;
            const connectSids = new Set();
            const startSid = (
              sd.connect_start?.station_id ??
              sd.connect_start?.tags?.station_id ??
              ''
            )
              .toString()
              .trim();
            const endSid = (sd.connect_end?.station_id ?? sd.connect_end?.tags?.station_id ?? '')
              .toString()
              .trim();
            if (startSid) connectSids.add(startSid);
            if (endSid) connectSids.add(endSid);
            const stList = (sd.station_list || []).filter(
              (s) => !s.station_id || !connectSids.has(String(s.station_id ?? '').trim())
            );
            return sum + stList.length;
          }, 0);

          const drawDot = (cx, cy, props, isConnect, isBlackHighlighted = false) => {
            // taipei_c／taipei_d／taipei_e：黑點改由專用區塊繪製（c＝弧長；d＝向心滑動；e＝d→e 縮減後 StationData）
            if (
              !isConnect &&
              (isTaipeiTestCDELayerTab(activeLayerTab.value) ||
                isTaipeiEfinalSpaceLayerTab(activeLayerTab.value))
            )
              return;
            const mapped = reducedPlotMapper ? reducedPlotMapper(cx, cy) : [cx, cy];
            let [px, py] =
              isConnect && overlayForSnap && !reducedPlotMapper
                ? overlayCellCenter(cx, cy)
                : mapped;
            let fillColor = isConnect ? '#ff0000' : '#000000';
            if (isConnect) {
              const tg = props.tags && typeof props.tags === 'object' ? props.tags : {};
              if (connectBlueFromTaggedTerminal(props, tg)) {
                fillColor = '#1565c0';
              } else {
                const [degX, degY] = reducedPlotMapper ? reducedPlotMapper(cx, cy) : [cx, cy];
                fillColor = taipeiTest3ConnectFill(true, degX, degY) ?? '#ff0000';
              }
            }
            const cnDot = props.connect_number ?? props.tags?.connect_number;
            const isH2Conn = isConnect && matchH2TrafficConnect(cnDot);
            const isHighlighted = isConnect
              ? (dataStore.highlightedConnectNumber != null &&
                  cnDot === dataStore.highlightedConnectNumber) ||
                isH2Conn
              : isBlackHighlighted;
            const r = isHighlighted ? 5 : isConnect ? 2.5 : 1.5;
            const strokeColor = isHighlighted ? '#ff6600' : fillColor;
            const strokeWidth = isHighlighted ? 2.5 : 1;
            const el = zoomGroup
              .append('circle')
              .attr('cx', xScale(px))
              .attr('cy', yScale(py))
              .attr('r', r)
              .attr('fill', fillColor)
              .attr('stroke', strokeColor)
              .attr('stroke-width', strokeWidth)
              .attr('class', isHighlighted ? 'highlighted-connect-point' : '')
              .style('cursor', 'pointer');
            if (dataStore.showStationNames && isConnect) {
              let sname = (props.station_name ?? props.tags?.station_name ?? props.tags?.name ?? '')
                .toString()
                .trim();
              if (isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) && taipeiFLabelCtx) {
                const filled = resolveTaipeiFStationNameAndId(props, taipeiFLabelCtx);
                if (!sname) sname = (filled.station_name ?? '').toString().trim();
              }
              if (sname) {
                zoomGroup
                  .append('text')
                  .attr('x', xScale(px))
                  .attr('y', yScale(py) - r - 4)
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'bottom')
                  .attr('font-size', '11px')
                  .attr('font-weight', 'bold')
                  .attr('fill', '#1a1a1a')
                  .attr('stroke', '#ffffff')
                  .attr('stroke-width', 0.35)
                  .attr('paint-order', 'stroke')
                  .style('pointer-events', 'none')
                  .text(sname);
              }
            } else if (dataStore.showBlackDotStationNames && !isConnect) {
              let sname = (props.station_name ?? props.tags?.station_name ?? props.tags?.name ?? '')
                .toString()
                .trim();
              if (isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) && taipeiFLabelCtx) {
                const filled = resolveTaipeiFStationNameAndId(props, taipeiFLabelCtx);
                if (!sname) sname = (filled.station_name ?? '').toString().trim();
              }
              if (sname) {
                zoomGroup
                  .append('text')
                  .attr('x', xScale(px))
                  .attr('y', yScale(py) - r - 4)
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'bottom')
                  .attr('font-size', '10px')
                  .attr('font-weight', 'bold')
                  .attr('fill', '#1a1a1a')
                  .attr('stroke', '#ffffff')
                  .attr('stroke-width', 0.35)
                  .attr('paint-order', 'stroke')
                  .style('pointer-events', 'none')
                  .text(sname);
              }
            }
            el.on('mouseover', function (event) {
              d3.select(this)
                .attr('r', isConnect ? 4 : 3)
                .attr('stroke-width', 2);
              const dispX = cx;
              const dispY = cy;
              const dispFmt = (v) =>
                typeof v === 'number' && v.toFixed
                  ? taipeiCReducedOverlayDraw
                    ? String(Math.round(v))
                    : useSchematicCellCenterGrid
                      ? String(Math.round(Number(v)))
                      : v.toFixed(2)
                  : v;
              const coordLine = taipeiCReducedOverlayDraw
                ? `<strong>縮減網格索引 (ix′, iy′):</strong> (${dispFmt(dispX)}, ${dispFmt(dispY)})${minSpacingTooltipBlock(Number(dispX), Number(dispY), 'supplementOnly')}`
                : `<strong>座標:</strong> (${dispFmt(dispX)}, ${dispFmt(dispY)})${minSpacingTooltipBlock(Number(dispX), Number(dispY))}`;
              const parts = [coordLine];
              let sid = (props.station_id ?? props.tags?.station_id ?? '').toString().trim();
              let sname = (
                props.station_name ??
                props.tags?.station_name ??
                props.tags?.name ??
                ''
              ).trim();
              // taipei_g：紅點僅依 ConnectData／SectionData 對照（見 resolveTaipeiFStationNameAndId）
              if (isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) && taipeiFLabelCtx) {
                const filled = resolveTaipeiFStationNameAndId(props, taipeiFLabelCtx);
                if (!sname) sname = filled.station_name;
                if (!sid) sid = filled.station_id;
              }
              if (sid !== undefined && sid !== '') parts.push(`<strong>站點ID:</strong> ${sid}`);
              if (sname !== undefined && sname !== '')
                parts.push(`<strong>站點名稱:</strong> ${sname}`);
              if (props.connect_number != null)
                parts.push(
                  `<strong style="color:#ff0000;">Connect #:</strong> <span style="color:#ff0000;">${props.connect_number}</span>`
                );
              parts.push(`<strong>節點類型:</strong> ${isConnect ? 'connect' : 'line (station)'}`);
              const tags = props.tags || {};
              const skipTagKeys =
                isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) && isConnect
                  ? new Set(['station_name', 'station_id', 'name', 'x_grid', 'y_grid'])
                  : null;
              const tagsHtml = Object.entries(tags)
                .filter(([k]) => !skipTagKeys?.has(k))
                .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
                .join('<br>');
              if (tagsHtml) parts.push(tagsHtml);
              tooltip
                .html(parts.join('<br>'))
                .style('opacity', 1)
                .style('left', event.pageX + 10 + 'px')
                .style('top', event.pageY - 10 + 'px');
            })
              .on('mousemove', function (event) {
                tooltip
                  .style('left', event.pageX + 10 + 'px')
                  .style('top', event.pageY - 10 + 'px');
              })
              .on('mouseout', function () {
                d3.select(this).attr('r', r).attr('stroke-width', strokeWidth);
                tooltip.style('opacity', 0);
              });
          };

          // 1) 紅點：畫在「當前路段端點」位置，用 route_list 對應儲存的 ConnectData 屬性；同 route_list 多筆時以座標接近度配對
          const usedConnectData = new Set();
          const endpointConnectMap = new Map();
          currentConnects.forEach(({ x, y, routeNames }) => {
            // taipei_g：同格僅單一路線為黑點（StationData），多路線才畫紅點
            if (isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) && routeNames.size < 2) return;
            const rk = normalizeRouteKey([...routeNames]);
            const storedList = (rk && connectByRouteKey.get(rk)) || [];
            let chosen = null;
            if (storedList.length === 1) {
              chosen = storedList[0];
            } else if (storedList.length > 1) {
              let bestDist = Infinity;
              for (const cd of storedList) {
                if (usedConnectData.has(cd)) continue;
                const sx = toNum(cd?.x_grid ?? cd?.tags?.x_grid ?? 0);
                const sy = toNum(cd?.y_grid ?? cd?.tags?.y_grid ?? 0);
                const d = (x - sx) ** 2 + (y - sy) ** 2;
                if (d < bestDist) {
                  bestDist = d;
                  chosen = cd;
                }
              }
            }
            if (chosen) usedConnectData.add(chosen);
            endpointConnectMap.set(pointKey(x, y), chosen);
            drawDot(x, y, chosen || {}, true);
          });

          // 2) 黑點：每筆 SectionData 對應一個 segment（兩紅點之間）；以 connectId 雙端鍵 + route_name 配對，僅在該段內弧長均分
          const segmentPoly = (seg) => (seg.points || []).map(getC);
          const placeBlackAlongPoly = (poly, stList) => {
            if (stList.length === 0 || poly.length < 2) return 0;
            let totalLen = 0;
            const pathSegs = [];
            for (let i = 0; i < poly.length - 1; i++) {
              const dx = poly[i + 1][0] - poly[i][0];
              const dy = poly[i + 1][1] - poly[i][1];
              const len = Math.hypot(dx, dy);
              totalLen += len;
              pathSegs.push({ len, p1: poly[i], p2: poly[i + 1] });
            }
            if (totalLen <= 0) return 0;
            const step = totalLen / (stList.length + 1);
            for (let si = 0; si < stList.length; si++) {
              const target = step * (si + 1);
              let covered = 0;
              for (const ps of pathSegs) {
                if (covered + ps.len >= target) {
                  const ratio = (target - covered) / ps.len;
                  const sx = ps.p1[0] + (ps.p2[0] - ps.p1[0]) * ratio;
                  const sy = ps.p1[1] + (ps.p2[1] - ps.p1[1]) * ratio;
                  const fullProps = stationLookup.get(stList[si].station_id) || stList[si];
                  const hb = dataStore.highlightedBlackStation;
                  const coordEps = 0.08;
                  const gxb = Number(fullProps.x_grid ?? fullProps.tags?.x_grid ?? sx);
                  const gyb = Number(fullProps.y_grid ?? fullProps.tags?.y_grid ?? sy);
                  const sidB =
                    fullProps.station_id ?? fullProps.tags?.station_id ?? stList[si].station_id;
                  const isBlackHighlighted =
                    (hb &&
                      activeLayerTab.value === hb.layerId &&
                      Math.abs(Number(sx) - Number(hb.x)) < coordEps &&
                      Math.abs(Number(sy) - Number(hb.y)) < coordEps) ||
                    matchH2TrafficBlack(gxb, gyb, sidB);
                  drawDot(sx, sy, fullProps, false, isBlackHighlighted);
                  break;
                }
                covered += ps.len;
              }
            }
            return stList.length;
          };

          const usedSection = new Set();
          const unmatchedSegments = [];
          let actualBlackCount = 0;

          // taipei_g：切段後黑點改由 StationData（與 rebuildTaipeiFStationConnectAfterSplit 一致），
          // 不再用 Section 弧長配對（端點紅／黑語意已變）。
          if (!isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
            flatSegs.forEach((seg) => {
              if (!seg?.points || seg.points.length < 2) return;
              const pts = seg.points.map(getC);
              const startK = pointKey(pts[0][0], pts[0][1]);
              const endK = pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]);
              const segRoute = seg.route_name ?? seg.name ?? 'Unknown';
              const startCd = endpointConnectMap.get(startK);
              const endCd = endpointConnectMap.get(endK);
              const startCid = connectId(startCd);
              const endCid = connectId(endCd);
              const key = startCid && endCid ? pairKey(startCid, endCid) : null;
              const info = { routeName: segRoute, startPt: pts[0], endPt: pts[pts.length - 1] };

              if (!key) {
                unmatchedSegments.push({
                  ...info,
                  reason: !startCd
                    ? '起點未配對到 ConnectData'
                    : !endCd
                      ? '終點未配對到 ConnectData'
                      : !startCid
                        ? '起點 ConnectData 無 connect_number / x_grid,y_grid'
                        : '終點 ConnectData 無 connect_number / x_grid,y_grid',
                });
                return;
              }
              const candidates = sectionBuckets.get(key) || [];
              const avail = candidates.filter((sd) => !usedSection.has(sd));
              const byRoute = avail.filter((sd) => (sd.route_name ?? '').trim() === segRoute);
              // 嚴格依 route_name 配對：同名路段優先；否則只接受「無 route_name」的未指派 section。
              // 絕不把別條路線（不同 route_name）的 section 當成自己的——即使座標重疊、落在同一 bucket。
              const matched =
                byRoute.length >= 1
                  ? byRoute[0]
                  : avail.find((sd) => !(sd.route_name ?? '').trim()) || null;
              if (!matched) {
                unmatchedSegments.push({
                  ...info,
                  key,
                  reason:
                    avail.length === 0
                      ? candidates.length > 0
                        ? '該路段鍵的 SectionData 已全部被其他 segment 使用'
                        : `bucket 不存在 (key: ${key})`
                      : `同鍵多筆且無法依 route_name「${segRoute}」唯一對應`,
                });
                return;
              }
              usedSection.add(matched);

              const connectSids = new Set();
              if (matched.connect_start?.station_id)
                connectSids.add(matched.connect_start.station_id);
              if (matched.connect_end?.station_id) connectSids.add(matched.connect_end.station_id);
              const stList = (matched.station_list || []).filter(
                (s) => !s.station_id || !connectSids.has(s.station_id)
              );
              if (stList.length === 0) {
                unmatchedSegments.push({
                  ...info,
                  reason: '已配對 SectionData，但 station_list 過濾後為空',
                });
                return;
              }
              // 依 connect_start / connect_end 確保 poly 方向與 station_list 一致，避免黑點畫反
              const sdStartCd = resolveConnect(matched.connect_start, null);
              const sdEndCd = resolveConnect(matched.connect_end, null);
              let poly = segmentPoly(seg);
              if (
                sdStartCd &&
                sdEndCd &&
                connectId(startCd) === connectId(sdEndCd) &&
                connectId(endCd) === connectId(sdStartCd)
              ) {
                poly = [...poly].reverse();
              }
              actualBlackCount += placeBlackAlongPoly(poly, stList);
            });

            const unusedSections = sectionData.filter((sd) => !usedSection.has(sd));
            if (unusedSections.length > 0) {
              console.warn(
                `[車站配置] ⚠️ 有 ${unusedSections.length} 筆 SectionData 未被任何畫面上的 segment 使用（常見於 reconfigure 切段後 segment 數與儲存時不同，請再按「儲存車站資訊」）`,
                unusedSections.map((s) => ({
                  route_name: s.route_name,
                  nStations: (s.station_list || []).length,
                }))
              );
            }
            if (unmatchedSegments.length > 0) {
              console.warn(
                `[車站配置] ⚠️ ${unmatchedSegments.length} 個畫面上的 segment 無法配對 SectionData：`,
                unmatchedSegments
              );
            }
            if (
              !isTaipeiTestCLayerTab(activeLayerTab.value) &&
              expectedBlackCount !== actualBlackCount
            ) {
              console.error(
                `[車站配置] 🚨 重大 bug：原始黑點數 ${expectedBlackCount} 與重新配置後黑點數 ${actualBlackCount} 不符`,
                {
                  expectedBlackCount,
                  actualBlackCount,
                  unmatchedCount: unmatchedSegments.length,
                  unusedSectionCount: unusedSections.length,
                }
              );
            }
          }
        }
      }
    }

    // taipei_c／c2：黑點沿路段弧長位置繪製（與 JSON StationData 座標同源，100% 在路線上）
    if (isTaipeiTestCLayerTab(activeLayerTab.value)) {
      const stLayerC = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      if (stLayerC && Array.isArray(stLayerC.spaceNetworkGridJsonData)) {
        const rawPl = collectStationPlacementPoints(stLayerC).filter((p) => p.kind === 'station');
        const seenBlack = new Set();
        for (const p of rawPl) {
          const id = p.meta?.station_id ?? p.meta?.tags?.station_id;
          const dedupeKey =
            id != null && String(id).trim() !== ''
              ? `id:${String(id).trim()}`
              : `pos:${String(p.name ?? '')}|${Number(p.x).toFixed(5)},${Number(p.y).toFixed(5)}`;
          if (seenBlack.has(dedupeKey)) continue;
          seenBlack.add(dedupeKey);
          const x = Number(p.x);
          const y = Number(p.y);
          const [px, py] = reducedPlotMapper ? reducedPlotMapper(x, y) : [x, y];

          const hb = dataStore.highlightedBlackStation;
          const coordEps = 0.08;
          const props = p.meta || {};
          const tags = props.tags || {};
          const sid = props.station_id ?? tags.station_id;
          const hbSid = hb?.stationId;
          const isBlackHighlighted =
            hb &&
            hb.layerId === activeLayerTab.value &&
            (hbSid != null && String(hbSid).trim() !== ''
              ? String(sid ?? '').trim() === String(hbSid).trim()
              : Math.abs(Number(x) - Number(hb.x)) < coordEps &&
                Math.abs(Number(y) - Number(hb.y)) < coordEps);
          const radius = isBlackHighlighted ? 5 : 1.5;
          const strokeWidth = isBlackHighlighted ? 2.5 : 1;
          const fillColor = '#000000';
          const strokeColor = isBlackHighlighted ? '#ff6600' : fillColor;

          const el = zoomGroup
            .append('circle')
            .attr('cx', xScale(px))
            .attr('cy', yScale(py))
            .attr('r', radius)
            .attr('fill', fillColor)
            .attr('stroke', strokeColor)
            .attr('stroke-width', strokeWidth)
            .attr('class', isBlackHighlighted ? 'highlighted-connect-point' : '')
            .style('cursor', 'pointer');

          if (dataStore.showBlackDotStationNames) {
            let arcLabel = (props.station_name ?? tags.station_name ?? tags.name ?? '')
              .toString()
              .trim();
            if (arcLabel) {
              zoomGroup
                .append('text')
                .attr('x', xScale(px))
                .attr('y', yScale(py) - radius - 4)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'bottom')
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', '#1a1a1a')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 0.35)
                .attr('paint-order', 'stroke')
                .style('pointer-events', 'none')
                .text(arcLabel);
            }
          }

          el.on('mouseover', function (event) {
            d3.select(this)
              .attr('r', isBlackHighlighted ? 5 : 3)
              .attr('stroke-width', 2);
            const dispFmt = (v) =>
              typeof v === 'number' && v.toFixed
                ? taipeiCReducedOverlayDraw
                  ? String(Math.round(v))
                  : v.toFixed(2)
                : v;
            const parts = [`<strong>座標（刪減後）:</strong> (${dispFmt(x)}, ${dispFmt(y)})`];
            const sname = props.station_name ?? tags.station_name;
            if (sid !== undefined && sid !== '') parts.push(`<strong>站點ID:</strong> ${sid}`);
            if (sname !== undefined && sname !== '')
              parts.push(`<strong>站點名稱:</strong> ${sname}`);
            parts.push(`<strong>來源:</strong> 路段弧長（與 StationData 座標同源）`);
            tooltip
              .html(parts.join('<br>'))
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
          })
            .on('mousemove', function (event) {
              tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              d3.select(this).attr('r', radius).attr('stroke-width', strokeWidth);
              tooltip.style('opacity', 0);
            });
        }
      }
    }

    // taipei_e／e2／taipei_f／taipei_g：黑點以 StationData 座標繪製（d→e 縮減後；f／g 層載入 e_final JSON 與 e 同源）
    if (
      isTaipeiTestELayerTab(activeLayerTab.value) ||
      isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)
    ) {
      const stLayerE = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      if (
        stLayerE?.showStationPlacement &&
        Array.isArray(stLayerE.spaceNetworkGridJsonData_StationData)
      ) {
        // taipei_g：預建站名查詢 ctx 供黑點 tooltip 補查
        const _stationDataE = stLayerE.spaceNetworkGridJsonData_StationData;
        const _connectDataE = stLayerE.spaceNetworkGridJsonData_ConnectData || [];
        const _sectionDataE = stLayerE.spaceNetworkGridJsonData_SectionData || [];
        const taipeiFBlackCtx = isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)
          ? {
              connectNumberToNameId: buildConnectNumberToNameIdMap(_connectDataE, _sectionDataE),
              connectGridKeyToNameId: buildConnectGridKeyToNameIdMap(_connectDataE, _sectionDataE),
              sectionRouteGridNameIdMap: buildSectionRouteGridNameIdMap(_sectionDataE),
              sectionGridKeyToNameIdMap: buildSectionGridKeyToNameIdMap(_sectionDataE),
              blackLabelsByGrid: buildBlackStationDisplayByGrid(_stationDataE),
              stationData: _stationDataE,
              connectData: _connectDataE,
            }
          : null;

        const rows = collectLineStationGridPointsFromStationData(
          stLayerE.spaceNetworkGridJsonData_StationData
        );
        // taipei_f 灰底：即「紅點間路段」SectionData 清單內、Control 向心／SectionData-only 位移會處理的黑點。
        // station_list 身分鍵 ∪ 列入路段最短路徑格（與 layer 滑動邏輯同源；含無 id／站名之端點格）。
        layerStationsTowardSchematicCenter.ensureTaipeiFListedGrayHighlightSnapshot(stLayerE);
        const taipeiFListedGrayCtx = isTaipeiTestFLayerTab(activeLayerTab.value)
          ? {
              stationKeySet:
                Array.isArray(_sectionDataE) && _sectionDataE.length > 0
                  ? (stLayerE._taipeiFListedGrayStationKeySet ??
                    layerStationsTowardSchematicCenter.buildListedSectionStationKeySet(
                      _sectionDataE,
                      stLayerE
                    ))
                  : null,
              routeCellKeySet:
                stLayerE._taipeiFListedGrayRouteCellKeySet ??
                buildListedSectionRouteGridCellKeySet(stLayerE),
            }
          : null;
        for (const row of rows) {
          const x = Number(row.x);
          const y = Number(row.y);
          // 與 drawRoutePath／drawDot 一致：taipei_g 時站點在格線交點 (ix, iy)
          let px;
          let py;
          if (reducedPlotMapper) {
            [px, py] = reducedPlotMapper(x, y);
          } else {
            px = x;
            py = y;
          }

          const gridKeyXY = `${Math.round(Number(x))},${Math.round(Number(y))}`;
          const isListedSectionStationGray =
            taipeiFListedGrayCtx != null &&
            ((taipeiFListedGrayCtx.stationKeySet &&
              layerStationsTowardSchematicCenter.isLineStationRowOnListedSectionKeySet(
                row,
                taipeiFListedGrayCtx.stationKeySet
              )) ||
              (taipeiFListedGrayCtx.routeCellKeySet &&
                taipeiFListedGrayCtx.routeCellKeySet.has(gridKeyXY)));

          const hb = dataStore.highlightedBlackStation;
          const coordEps = 0.08;
          const props = row.meta || {};
          const tags = props.tags || {};
          const sid = props.station_id ?? tags.station_id;
          const hbSid = hb?.stationId;
          const isBlackHighlighted =
            (hb &&
              hb.layerId === activeLayerTab.value &&
              (hbSid != null && String(hbSid).trim() !== ''
                ? String(sid ?? '').trim() === String(hbSid).trim()
                : Math.abs(Number(x) - Number(hb.x)) < coordEps &&
                  Math.abs(Number(y) - Number(hb.y)) < coordEps)) ||
            matchH2TrafficBlack(x, y, sid);
          const radius = isBlackHighlighted ? 5 : 1.5;
          const strokeWidth = isBlackHighlighted ? 2.5 : 1;
          const fillColor = '#000000';
          const hlColor =
            isBlackHighlighted && hb?.color && typeof hb.color === 'string' ? hb.color : '#ff6600';
          const strokeColor = isBlackHighlighted ? hlColor : fillColor;

          if (isListedSectionStationGray) {
            zoomGroup
              .append('circle')
              .attr('cx', xScale(px))
              .attr('cy', yScale(py))
              .attr('r', 4.5)
              .attr('fill', '#9e9e9e')
              .attr('opacity', 0.5)
              .style('pointer-events', 'none');
          }

          const el = zoomGroup
            .append('circle')
            .attr('cx', xScale(px))
            .attr('cy', yScale(py))
            .attr('r', radius)
            .attr('fill', fillColor)
            .attr('stroke', strokeColor)
            .attr('stroke-width', strokeWidth)
            .attr('class', isBlackHighlighted ? 'highlighted-connect-point' : '')
            .style('cursor', 'pointer');

          if (dataStore.showBlackDotStationNames) {
            let snameLabel = (props.station_name ?? tags.station_name ?? tags.name ?? '')
              .toString()
              .trim();
            if (isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) && taipeiFBlackCtx) {
              const routeHintForRes = String(tags.route_hint ?? props.route_hint ?? '').trim();
              const filled = resolveTaipeiFStationNameAndId(props, {
                ...taipeiFBlackCtx,
                routeName: routeHintForRes,
              });
              if (!snameLabel) snameLabel = (filled.station_name ?? '').toString().trim();
            }
            if (snameLabel) {
              zoomGroup
                .append('text')
                .attr('x', xScale(px))
                .attr('y', yScale(py) - radius - 4)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'bottom')
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', '#1a1a1a')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 0.35)
                .attr('paint-order', 'stroke')
                .style('pointer-events', 'none')
                .text(snameLabel);
            }
          }

          el.on('mouseover', function (event) {
            d3.select(this)
              .attr('r', isBlackHighlighted ? 5 : 3)
              .attr('stroke-width', 2);
            const dispFmt = (v) => (typeof v === 'number' && v.toFixed ? String(Math.round(v)) : v);
            const parts = [
              `<strong>座標（縮減後 ix′, iy′）:</strong> (${dispFmt(x)}, ${dispFmt(y)})`,
            ];
            let snameBlack = (props.station_name ?? tags.station_name ?? tags.name ?? '').trim();
            let sidBlack = (sid ?? '').toString().trim();
            // taipei_g：同時補齊站名與站點ID（含 Section 全格點表、tags.route_hint 路線）
            if (isTaipeiEfinalSpaceLayerTab(activeLayerTab.value) && taipeiFBlackCtx) {
              const routeHint = String(tags.route_hint ?? '').trim();
              const filled = resolveTaipeiFStationNameAndId(props, {
                ...taipeiFBlackCtx,
                routeName: routeHint,
              });
              if (!snameBlack) snameBlack = filled.station_name;
              if (!sidBlack) sidBlack = filled.station_id;
            }
            if (sidBlack !== undefined && sidBlack !== '')
              parts.push(`<strong>站點ID:</strong> ${sidBlack}`);
            if (snameBlack !== undefined && snameBlack !== '')
              parts.push(`<strong>站名:</strong> ${snameBlack}`);
            parts.push(
              `<strong>來源:</strong> StationData（d→e 縮減網格後${
                isTaipeiTestFLayerTab(activeLayerTab.value)
                  ? '；f 與 e 下載 JSON 同源'
                  : isTaipeiTestILayerTab(activeLayerTab.value)
                    ? '；i 路網上顯示權重（無權重網格縮放）'
                    : isTaipeiGOrHWeightLayer(activeLayerTab.value)
                      ? '；g／h 與 e 下載 JSON 同源'
                      : ''
              }）`
            );
            tooltip
              .html(parts.join('<br>'))
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
          })
            .on('mousemove', function (event) {
              tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              d3.select(this).attr('r', radius).attr('stroke-width', strokeWidth);
              tooltip.style('opacity', 0);
            });
        }
      }
    }

    // taipei_d／d2：黑點以 StationData 座標繪製（execute_c_to_d_test 向心滑動結果）
    if (isTaipeiTestDLayerTab(activeLayerTab.value)) {
      const stLayerD = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      if (stLayerD && Array.isArray(stLayerD.spaceNetworkGridJsonData_StationData)) {
        const rows = collectLineStationGridPointsFromStationData(
          stLayerD.spaceNetworkGridJsonData_StationData
        );
        for (const row of rows) {
          const x = Number(row.x);
          const y = Number(row.y);
          const [px, py] = reducedPlotMapper ? reducedPlotMapper(x, y) : [x, y];

          const hb = dataStore.highlightedBlackStation;
          const coordEps = 0.08;
          const props = row.meta || {};
          const tags = props.tags || {};
          const sid = props.station_id ?? tags.station_id;
          const hbSid = hb?.stationId;
          const isBlackHighlighted =
            hb &&
            hb.layerId === activeLayerTab.value &&
            (hbSid != null && String(hbSid).trim() !== ''
              ? String(sid ?? '').trim() === String(hbSid).trim()
              : Math.abs(Number(x) - Number(hb.x)) < coordEps &&
                Math.abs(Number(y) - Number(hb.y)) < coordEps);
          const radius = isBlackHighlighted ? 5 : 1.5;
          const strokeWidth = isBlackHighlighted ? 2.5 : 1;
          const fillColor = '#000000';
          const strokeColor = isBlackHighlighted ? '#ff6600' : fillColor;

          const el = zoomGroup
            .append('circle')
            .attr('cx', xScale(px))
            .attr('cy', yScale(py))
            .attr('r', radius)
            .attr('fill', fillColor)
            .attr('stroke', strokeColor)
            .attr('stroke-width', strokeWidth)
            .attr('class', isBlackHighlighted ? 'highlighted-connect-point' : '')
            .style('cursor', 'pointer');

          el.on('mouseover', function (event) {
            d3.select(this)
              .attr('r', isBlackHighlighted ? 5 : 3)
              .attr('stroke-width', 2);
            const dispFmt = (v) =>
              typeof v === 'number' && v.toFixed
                ? taipeiCReducedOverlayDraw
                  ? String(Math.round(v))
                  : v.toFixed(2)
                : v;
            const parts = [`<strong>座標（刪減後）:</strong> (${dispFmt(x)}, ${dispFmt(y)})`];
            const sname = props.station_name ?? tags.station_name;
            if (sid !== undefined && sid !== '') parts.push(`<strong>站點ID:</strong> ${sid}`);
            if (sname !== undefined && sname !== '') parts.push(`<strong>站名:</strong> ${sname}`);
            parts.push(`<strong>來源:</strong> StationData（d 網格向心正規化）`);
            tooltip
              .html(parts.join('<br>'))
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
          })
            .on('mousemove', function (event) {
              tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              d3.select(this).attr('r', radius).attr('stroke-width', strokeWidth);
              tooltip.style('opacity', 0);
            });
        }
      }
    }

    // 🎯 繪製路段高亮覆蓋層（taipei_a：串接Flip L 型，依 hvFlipNextIndex 選中）
    if (isNormalizeFormat) {
      const activeLayer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      const routesData = snRoutesForK3TabLayer(activeLayer);
      let layoutData = Array.isArray(routesData) ? routesData : [];
      if (layoutData.length > 0 && layoutData[0]?.segments && !layoutData[0]?.points) {
        layoutData = layoutData.flatMap((r) =>
          (r.segments || []).map((s) => ({ ...s, name: r.route_name || r.name || 'Unknown' }))
        );
      }
      const straightSegments = buildStraightSegments(layoutData);
      const totalL = Math.max(0, (straightSegments?.length ?? 0) - 1);

      let segStartIdx = null;
      if (
        isTaipeiTestStraighteningLayerId(activeLayer?.layerId) &&
        totalL > 0 &&
        dataStore.connectFlipOverlayVisible
      ) {
        segStartIdx = dataStore.hvFlipNextIndex % totalL;
      }

      if (segStartIdx !== null && segStartIdx !== undefined && segStartIdx >= 0) {
        const seg = straightSegments[segStartIdx];
        const segNext = straightSegments[segStartIdx + 1];
        const EPS = 1e-4;
        const samePoint = (a, b) =>
          a && b && Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
        const isConnected =
          seg &&
          segNext &&
          seg.points?.length >= 2 &&
          segNext.points?.length >= 2 &&
          samePoint(seg.points[1], segNext.points[0]);
        const lShapePoints = isConnected ? [seg.points[0], seg.points[1], segNext.points[1]] : null;
        if (lShapePoints && lShapePoints.length >= 3) {
          // 選中的 L 型路線：高亮（金黃實線）
          const pathData = lineGenerator(lShapePoints);
          if (pathData) {
            zoomGroup
              .append('path')
              .attr('class', 'highlight-segment-overlay')
              .attr('d', pathData)
              .attr('stroke', '#FFD700')
              .attr('fill', 'none')
              .attr('stroke-width', '10pt')
              .attr('opacity', 0.55)
              .style('pointer-events', 'none');
          }
          // Flip 路線：可行＝綠虛線，不可行＝紅虛線（串接Flip L型 用放寬規則）
          const [a, b, c] = lShapePoints;
          const d = [a[0] + c[0] - b[0], a[1] + c[1] - b[1]];
          const connectFlipOptions = {
            skipConnectMove: true,
            skipCrossing: true,
            useRectangleOtherRouteCheck: true,
          };
          const { flipColor } = computeFlipAnalysis(
            straightSegments,
            segStartIdx,
            layoutData,
            connectFlipOptions
          );
          const flipPathData = lineGenerator([a, d, c]);
          if (flipPathData) {
            zoomGroup
              .append('path')
              .attr('class', 'highlight-flip-overlay')
              .attr('d', flipPathData)
              .attr('stroke', flipColor)
              .attr('fill', 'none')
              .attr('stroke-width', '6pt')
              .attr('stroke-dasharray', '8,5')
              .attr('opacity', 0.7)
              .style('pointer-events', 'none');
          }
          lShapePoints.forEach((coord) => {
            zoomGroup
              .append('circle')
              .attr('class', 'highlight-endpoint-overlay')
              .attr('cx', xScale(coord[0]))
              .attr('cy', yScale(coord[1]))
              .attr('r', 7)
              .attr('fill', 'rgba(255, 215, 0, 0.85)')
              .attr('stroke', '#FF8800')
              .attr('stroke-width', 2)
              .style('pointer-events', 'none');
          });
        }
      }
    }

    // 🎯 繪製 ㄈ 型高亮覆蓋層（taipei_a：ㄈ縮減 依 nShapeNextIndex 選中）
    if (
      isNormalizeFormat &&
      isTaipeiTestStraighteningLayerId(activeLayerTab.value) &&
      dataStore.nShapeOverlayVisible
    ) {
      const nLayer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      const nRoutesData = snRoutesForK3TabLayer(nLayer);
      let nLayoutData = Array.isArray(nRoutesData) ? nRoutesData : [];
      if (nLayoutData.length > 0 && nLayoutData[0]?.segments && !nLayoutData[0]?.points) {
        nLayoutData = nLayoutData.flatMap((r) =>
          (r.segments || []).map((s) => ({ ...s, name: r.route_name || r.name || 'Unknown' }))
        );
      }
      const nStraightSegs = buildStraightSegments(nLayoutData);
      const nList = buildNShapeList(nStraightSegs);
      if (nList.length > 0) {
        const nIdx = dataStore.nShapeNextIndex % nList.length;
        const segStartIdx = nList[nIdx];
        const s0 = nStraightSegs[segStartIdx];
        const s1 = nStraightSegs[segStartIdx + 1];
        const s2 = nStraightSegs[segStartIdx + 2];
        const EPS2 = 1e-4;
        const sameP = (a, b) =>
          a && b && Math.abs(a[0] - b[0]) < EPS2 && Math.abs(a[1] - b[1]) < EPS2;
        if (
          s0?.points?.length >= 2 &&
          s1?.points?.length >= 2 &&
          s2?.points?.length >= 2 &&
          sameP(s0.points[1], s1.points[0]) &&
          sameP(s1.points[1], s2.points[0])
        ) {
          const a = s0.points[0],
            b = s0.points[1],
            c = s1.points[1],
            d = s2.points[1];
          const REDUCE_N_OPT = {
            skipConnectMove: true,
            skipCrossing: true,
            useRectangleOtherRouteCheck: true,
          };
          const analysis = computeNShapeAnalysis(nStraightSegs, segStartIdx, REDUCE_N_OPT);
          const { reduceColor, newCorner: e } = analysis;

          // 金黃實線高亮：ㄈ 型現狀 A->B->C->D
          const nShapePath = lineGenerator([a, b, c, d]);
          if (nShapePath) {
            zoomGroup
              .append('path')
              .attr('class', 'highlight-nshape-overlay')
              .attr('d', nShapePath)
              .attr('stroke', '#FFD700')
              .attr('fill', 'none')
              .attr('stroke-width', '10pt')
              .attr('opacity', 0.55)
              .style('pointer-events', 'none');
          }
          // 虛線：縮減後的 L 型 A->E->D
          if (e) {
            const lPath = lineGenerator([a, e, d]);
            if (lPath) {
              zoomGroup
                .append('path')
                .attr('class', 'highlight-nshape-reduce-overlay')
                .attr('d', lPath)
                .attr('stroke', reduceColor)
                .attr('fill', 'none')
                .attr('stroke-width', '6pt')
                .attr('stroke-dasharray', '8,5')
                .attr('opacity', 0.7)
                .style('pointer-events', 'none');
            }
          }
          // 標示 4 個頂點
          for (const coord of [a, b, c, d]) {
            zoomGroup
              .append('circle')
              .attr('class', 'highlight-nshape-endpoint-overlay')
              .attr('cx', xScale(coord[0]))
              .attr('cy', yScale(coord[1]))
              .attr('r', 7)
              .attr('fill', 'rgba(255, 215, 0, 0.85)')
              .attr('stroke', '#FF8800')
              .attr('stroke-width', 2)
              .style('pointer-events', 'none');
          }
        }
      }
    }

    // 診斷高亮：只畫重疊區段，hover 顯示轉折點數
    if (
      isNormalizeFormat &&
      Array.isArray(dataStore.overlappingSegmentRanges) &&
      dataStore.overlappingSegmentRanges.length > 0
    ) {
      const overlapLineGen = d3
        .line()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[1]));
      const overlapGroup = zoomGroup.append('g').attr('class', 'overlapping-segments-overlay');
      dataStore.overlappingSegmentRanges.forEach((range) => {
        const pts = range.points;
        if (!Array.isArray(pts) || pts.length < 2) return;
        const pathData = overlapLineGen(pts);
        if (!pathData) return;
        const turnCounts = range.turnCounts || [];
        const displayText =
          turnCounts.length === 0
            ? '這一個路段的轉折點數：—'
            : turnCounts.length === 1
              ? `這一個路段的轉折點數：${turnCounts[0].turnCount}`
              : `這一個路段的轉折點數：${turnCounts.map((t) => `${t.routeName} ${t.turnCount}`).join('；')}`;
        overlapGroup
          .append('path')
          .attr('d', pathData)
          .attr('stroke', '#e60000')
          .attr('fill', 'none')
          .attr('stroke-width', '8pt')
          .attr('opacity', 0.75)
          .attr('title', displayText)
          .style('pointer-events', 'stroke')
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select('body').selectAll('.d3js-map-tooltip').remove();
            d3.select('body')
              .append('div')
              .attr('class', 'd3js-map-tooltip')
              .style('position', 'absolute')
              .style('z-index', 1000)
              .style('background', 'rgba(0,0,0,0.85)')
              .style('color', '#fff')
              .style('padding', '6px 10px')
              .style('border-radius', '4px')
              .style('font-size', '12px')
              .style('pointer-events', 'none')
              .style('left', `${event.pageX + 10}px`)
              .style('top', `${event.pageY + 10}px`)
              .text(displayText);
          })
          .on('mousemove', function (event) {
            d3.select('.d3js-map-tooltip')
              .style('left', `${event.pageX + 10}px`)
              .style('top', `${event.pageY + 10}px`);
          })
          .on('mouseout', function () {
            d3.select('body').selectAll('.d3js-map-tooltip').remove();
          });
      });
    }

    // taipei_c／d／e（含測試2）／f：繪圖座標空間之幾何中心十字參考線（與 xScale／yScale 定義域一致）
    if (
      isNormalizeFormat &&
      (isTaipeiTestCDELayerTab(activeLayerTab.value) ||
        isTaipeiTestFLayerTab(activeLayerTab.value)) &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax)
    ) {
      const crossCx = (xMin + xMax) / 2;
      const crossCy = (yMin + yMax) / 2;
      const crossG = zoomGroup
        .append('g')
        .attr('class', 'schematic-center-cross')
        .style('pointer-events', 'none');
      crossG
        .append('line')
        .attr('x1', xScale(crossCx))
        .attr('y1', margin.top)
        .attr('x2', xScale(crossCx))
        .attr('y2', margin.top + height)
        .attr('stroke', '#0046E3')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5 4')
        .attr('opacity', 0.65);
      crossG
        .append('line')
        .attr('x1', margin.left)
        .attr('y1', yScale(crossCy))
        .attr('x2', margin.left + width)
        .attr('y2', yScale(crossCy))
        .attr('stroke', '#0046E3')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5 4')
        .attr('opacity', 0.65);
    }
  };

  /**
   * 🎨 統一繪製函數 (Unified Drawing Function)
   * 根據圖層類型選擇相應的繪製方法
   */
  const drawSchematic = () => {
    if (isMapLayer(activeLayerTab.value)) {
      drawMap();
    } else if (isGridSchematicLayer(activeLayerTab.value)) {
      drawGridSchematic();
    } else {
      drawAdministrativeSchematic();
    }
  };

  scheduleTaipeiFDrawForMouseZoom = () => {
    if (taipeiFMouseZoomRaf) return;
    taipeiFMouseZoomRaf = requestAnimationFrame(() => {
      taipeiFMouseZoomRaf = 0;
      drawMapForceNext = true;
      drawSchematic();
    });
  };

  /**
   * 📏 調整尺寸 (Resize)
   * 響應容器尺寸變化，重新繪製示意圖
   */
  const resize = () => {
    // 確保容器存在且可見
    const container = document.getElementById(getContainerId());
    if (!container) {
      return;
    }

    // 檢查容器是否可見（寬度和高度都大於 0）
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      // 如果容器不可見，延遲執行
      setTimeout(() => {
        resize();
      }, 100);
      return;
    }

    // 先更新尺寸狀態，再重新繪製
    getDimensions();
    drawSchematic();
    refreshSpaceNetworkMinCellDimensions();
  };

  // 記錄上一次的圖層列表用於比較
  const previousLayers = ref([]);

  /**
   * 與操作分頁（ControlTab）選取對齊：避免地圖仍顯示「最新開啟」圖層而 Control 已選 k3。
   */
  watch(
    () => dataStore.controlActiveLayerId,
    (id) => {
      if (!id) return;
      if (!visibleLayers.value.some((l) => l.layerId === id)) return;
      if (activeLayerTab.value === id) return;
      setActiveLayerTab(id);
    },
    { flush: 'post' }
  );

  /**
   * 👀 監聽可見圖層變化，自動切換到新開啟的圖層分頁
   */
  watch(
    () => visibleLayers.value,
    (newLayers) => {
      // 如果沒有可見圖層，清除選中的分頁
      if (newLayers.length === 0) {
        activeLayerTab.value = null;
        previousLayers.value = [];
        return;
      }

      // 找出新增的圖層（比較新舊圖層列表）
      const previousLayerIds = previousLayers.value.map((layer) => layer.layerId);
      const newLayerIds = newLayers.map((layer) => layer.layerId);
      const addedLayerIds = newLayerIds.filter((id) => !previousLayerIds.includes(id));

      // 如果有新增的圖層，自動切換到最新新增的圖層
      if (addedLayerIds.length > 0) {
        const newestAddedLayerId = addedLayerIds[addedLayerIds.length - 1];
        activeLayerTab.value = newestAddedLayerId;
        emit('active-layer-change', activeLayerTab.value);
      }
      // 如果當前沒有選中分頁，或選中的分頁不在可見列表中，選中第一個
      else if (
        !activeLayerTab.value ||
        !newLayers.find((layer) => layer.layerId === activeLayerTab.value)
      ) {
        activeLayerTab.value = newLayers[0].layerId;
        emit('active-layer-change', activeLayerTab.value);
      }

      // 更新記錄的圖層列表
      previousLayers.value = [...newLayers];
    },
    { deep: true, immediate: true }
  );

  /**
   * 👀 監聽活動圖層變化，載入數據並繪製示意圖
   */
  watch(
    () => activeLayerTab.value,
    async (newLayerId, oldLayerId) => {
      if (newLayerId && newLayerId !== oldLayerId) {
        // 確保 SVG 內容和 tooltip 已清除（雙重保險）
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();

        // 清除舊數據（雙重保險）
        gridData.value = null;
        nodeData.value = null;
        linkData.value = null;
        mapGeoJsonData.value = null;

        // 載入新圖層數據

        await loadLayerData(newLayerId);

        // 等待 DOM 更新後繪製
        await nextTick();

        drawSchematic();
      }
    }
  );

  /**
   * 👀 監聽當前圖層的主要示意圖資料變化
   * 當圖層數據載入完成時，自動載入並繪製示意圖
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      return layer ? getSchematicJsonData(layer) : null;
    },
    async (newSchematicData) => {
      if (newSchematicData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await loadLayerData(activeLayerTab.value);
        await nextTick();
        drawSchematic();
      }
    },
    { deep: true }
  );

  /**
   * 👀 監聽路段高亮索引變化，重繪以更新高亮
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const lid = activeLayerTab.value;
      const layer = visibleLayers.value.find((l) => l.layerId === lid);
      return layer?.highlightedSegmentIndex ?? null;
    },
    async (newVal, oldVal) => {
      const same =
        Array.isArray(newVal) && Array.isArray(oldVal)
          ? newVal[0] === oldVal[0] && newVal[1] === oldVal[1]
          : newVal === oldVal;
      if (!same && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /**
   * 👀 監聽車站配置開關變化（直線化測試／網格正規化），重繪以顯示/隱藏車站
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      return layer?.showStationPlacement ?? null;
    },
    async (newVal, oldVal) => {
      if (newVal !== oldVal && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** taipei_k3：Control「顯示權重」或與格線共用之 showWeightLabels 切換時重繪。
   * 不依 activeLayerTab === taipei_k3：操作分頁與此地圖元件各自維護圖層選擇，若加此判斷會導致開關不觸發重繪。 */
  watch(
    () => [
      dataStore.spaceNetworkGridShowRouteWeights,
      dataStore.showWeightLabels,
      dataStore.showRouteThickness,
      dataStore.spaceNetworkK4WeightProportionalInnerGrid,
      dataStore.spaceNetworkK4WeightProportionalScaleN,
      dataStore.spaceNetworkGridShowMouseGridCoordinate,
      dataStore.spaceNetworkK4MouseBandFocusMagnifyEnabled,
      dataStore.spaceNetworkK4MouseBandFocusMagnifyN,
    ],
    async () => {
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData || !activeLayerTab.value || !isMapLayer(activeLayerTab.value)) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawMapForceNext = true;
      drawSchematic();
    }
  );

  /** taipei_f／taipei_g：dataStore「顯示網格／顯示權重／…」切換時重繪（Control 專屬操作僅 taipei_g） */
  watch(
    () => [
      dataStore.showGrid,
      dataStore.showWeightLabels,
      dataStore.showRouteThickness,
      dataStore.taipeiFSpaceNetworkGridScaling,
      dataStore.taipeiFSpaceNetworkMouseZoom,
    ],
    async () => {
      if (!isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      taipeiFMouseZoomHover.value = { ix: null, iy: null };
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawSchematic();
    }
  );

  /** 顯示紅／藍或黑點站名：地圖示意層重繪 */
  watch(
    () => [dataStore.showStationNames, dataStore.showBlackDotStationNames],
    async () => {
      if (!activeLayerTab.value || !isMapLayer(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawSchematic();
    }
  );

  /** 測試3：Control「正方形／預設」切換時重繪路網示意 */
  watch(
    () =>
      activeLayerTab.value && isTaipeiTest3BcdeLayerTab(activeLayerTab.value)
        ? dataStore.findLayerById(activeLayerTab.value)?.squareGridCellsTaipeiTest3
        : null,
    async () => {
      if (!activeLayerTab.value || !isTaipeiTest3BcdeLayerTab(activeLayerTab.value)) return;
      if (!isMapLayer(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawSchematic();
    }
  );

  /** 隨機權重等：強制卸載 SVG 後重載，避免 drawMap 同尺寸快取略過整圖重繪 */
  watch(
    () => dataStore.spaceNetworkGridFullRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      if (!activeLayerTab.value || !isMapLayer(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await loadLayerData(activeLayerTab.value);
      await nextTick();
      drawSchematic();
    }
  );

  /** taipei_f：欄（Col）路段逐步高亮 */
  watch(
    () => dataStore.taipeiFColRouteHighlightRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** taipei_f：列（Row）路段逐步高亮 */
  watch(
    () => dataStore.taipeiFRowRouteHighlightRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** 黑點車站逐步 highlight：store 變更時重繪，否則圓點樣式不會更新 */
  watch(
    () => dataStore.blackStationHighlightRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** 疊加縮減預覽：欄／列帶狀高亮 */
  watch(
    () => dataStore.overlayShrinkStripRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  watch(
    () => [
      dataStore.hvZStepTrigger,
      dataStore.hvFlipStepTrigger,
      dataStore.nShapeStepTrigger,
      dataStore.highlightDiagnosticsTrigger,
    ],
    async () => {
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    },
    { deep: true }
  );

  /**
   * 👀 監聽容器高度變化，觸發示意圖重繪
   */
  watch(
    () => props.containerHeight,
    () => {
      // 觸發示意圖重繪以適應新高度
      nextTick(() => {
        resize();
      });
    }
  );

  /**
   * 🚀 組件掛載事件 (Component Mounted Event)
   */
  onMounted(async () => {
    // 初始化第一個可見圖層為作用中分頁
    if (visibleLayers.value.length > 0 && !activeLayerTab.value) {
      activeLayerTab.value = visibleLayers.value[0].layerId;

      // 載入初始數據
      await loadLayerData(activeLayerTab.value);
      await nextTick();
      drawSchematic();

      emit('active-layer-change', activeLayerTab.value);
    }

    // 監聽窗口大小變化
    window.addEventListener('resize', resize);

    // 監聽容器尺寸變化
    const container = document.getElementById(getContainerId());
    if (container && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            resize();
          }
        }
      });
      resizeObserver.observe(container);

      // 同時監聽父容器
      const parentContainer = container.parentElement;
      if (parentContainer) {
        resizeObserver.observe(parentContainer);
      }
    }
  });

  /**
   * 🚀 組件卸載事件 (Component Unmounted Event)
   */
  onUnmounted(() => {
    if (taipeiFMouseZoomRaf) {
      cancelAnimationFrame(taipeiFMouseZoomRaf);
      taipeiFMouseZoomRaf = 0;
    }
    window.removeEventListener('resize', resize);

    // 清理 ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  });

  // 暴露方法給父組件使用
  defineExpose({
    resize, // 調整尺寸方法
  });
</script>

<template>
  <!-- 📊 多圖層 D3.js 數據視覺化儀表板視圖組件 -->
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <!-- 📑 圖層分頁導航 -->
    <div v-if="visibleLayers.length > 0" class="">
      <ul class="nav nav-tabs nav-fill">
        <li
          v-for="layer in visibleLayers"
          :key="layer.layerId"
          class="nav-item d-flex flex-column align-items-center"
        >
          <!-- tab按鈕 -->
          <div
            class="btn nav-link rounded-0 border-0 position-relative d-flex align-items-center justify-content-center my-bgcolor-gray-200"
            :class="{
              active: activeLayerTab === layer.layerId,
            }"
            @click="setActiveLayerTab(layer.layerId)"
          >
            <span>
              <span v-if="getLayerFullTitle(layer).groupName" class="my-title-xs-gray"
                >{{ getLayerFullTitle(layer).groupName }} -
              </span>
              <span class="my-title-sm-black">{{ getLayerFullTitle(layer).layerName }}</span>
            </span>
          </div>
          <div class="w-100" :class="`my-bgcolor-${layer.colorName}`" style="min-height: 4px"></div>
        </li>
      </ul>
    </div>

    <!-- 有開啟圖層時的內容 -->
    <div
      v-if="visibleLayers.length > 0"
      class="flex-grow-1 d-flex flex-column my-bgcolor-white"
      style="min-height: 0"
    >
      <!-- 📊 圖層摘要資料 -->
      <div v-if="currentLayerSummary" class="flex-grow-1 d-flex flex-column" style="min-height: 0">
        <!-- D3.js 示意圖 - 以彈性高度填滿可用空間 -->
        <div class="flex-grow-1 d-flex flex-column" style="min-height: 0">
          <div class="flex-grow-1" style="min-height: 0">
            <!-- 🎨 統一示意圖容器 (Unified Schematic Container) -->
            <div
              :id="getContainerId()"
              class="w-100 h-100"
              style="min-height: 0; overflow: hidden; background-color: #ffffff"
            ></div>
          </div>
        </div>
      </div>
      <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
        <div class="text-center">
          <div class="my-title-md-gray" v-if="hasLayerInfoData">有資料</div>
          <div class="my-title-md-gray" v-else>此圖層沒有可用的摘要資訊</div>
        </div>
      </div>
    </div>

    <!-- 沒有開啟圖層時的空狀態 -->
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <div class="my-title-md-gray p-3">沒有開啟的圖層</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /**
   * 🎨 SpaceNetworkGridTabK3 組件樣式
   *
   * 定義組件內部元素的樣式規則，使用 scoped 避免樣式污染
   * 主要樣式規則已在 common.css 中定義，此處僅包含組件特定調整
   */

  /* 📊 示意圖容器樣式 (Schematic Container Styles) */
  [id^='schematic-container-space-network-grid-k3tab'] {
    position: relative;
    overflow: hidden;
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  /* 🗺️ 地圖模式時強制白色背景 */
  [id^='schematic-container-space-network-grid-k3tab'] svg {
    display: block;
    max-width: 100%;
    max-height: 100%;
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  /* 🔍 縮放功能樣式 */
  [id^='schematic-container-space-network-grid-k3tab'] svg {
    cursor: grab;
  }

  [id^='schematic-container-space-network-grid-k3tab'] svg:active {
    cursor: grabbing;
  }

  /* 📝 網格文字樣式 (Grid Text Styles) */
  :deep(.grid-nodes text) {
    pointer-events: none;
    user-select: none;
  }

  /* 🎯 D3.js 圖表互動樣式 (D3.js Chart Interaction Styles) */
  :deep(.bar:hover) {
    cursor: pointer;
  }

  :deep(.scatter:hover) {
    cursor: pointer;
  }

  :deep(.dot:hover) {
    cursor: pointer;
  }
</style>
