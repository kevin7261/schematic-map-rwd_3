<script setup>
  /**
   * 📊 LayoutGridTab_Test3.vue - 版面網格測試3數據視覺化分頁組件
   *
   * 功能說明：
   * 1. 📑 圖層分頁導航 - 顯示所有可見圖層的標籤頁
   * 2. 📊 當前圖層資訊 - 顯示選中圖層的名稱和詳細信息
   * 3. 📈 圖層摘要資料 - 顯示總數量、行政區數量等統計信息
   * 4. 🎨 D3.js 圖表 - 使用 D3.js 繪製各種類型的圖表（網格示意圖、行政區示意圖）
   * 5. 🔄 自動切換功能 - 當新圖層開啟時自動切換到該圖層的分頁
   *
   * @component LayoutGridTab_Test3
   * @version 2.0.0
   * @author Kevin Cheng
   */

  import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
  import { useDataStore } from '@/stores/dataStore.js';
  import * as d3 from 'd3';
  import {
    isTaipeiTest3BcdeLayerTab,
    isTaipeiTest3I3OrJ3LayerTab,
  } from '@/utils/taipeiTestPipeline.js';
  import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';
  const emit = defineEmits(['active-layer-change']);

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

  const activeLayerTab = ref(null); /** 📑 當前作用中的圖層分頁 */

  /**
   * 🆔 獲取動態容器 ID (Get Dynamic Container ID)
   * 基於當前活動圖層生成唯一的容器 ID，避免多圖層衝突
   * @returns {string} 容器 ID
   */
  const getContainerId = () => {
    const layerId = activeLayerTab.value || 'default';
    return `schematic-container-layout-grid-test3-${layerId}`;
  };

  // ==================== 📊 示意圖繪製相關狀態 (Schematic Drawing State) ====================

  /** 📊 網格數據狀態 (Grid Data State) */
  const gridData = ref(null);
  const gridDimensions = ref({ x: 10, y: 10 });
  const gridSize = ref({ width: 0, height: 0 }); // 網格總尺寸（從 meta.gridWidth 和 meta.gridHeight 讀取）

  /** 📊 行政區數據狀態 (Administrative District Data State) */
  const nodeData = ref(null);
  const linkData = ref(null);

  /** 📊 地圖數據狀態 (Map Data State) */
  const mapGeoJsonData = ref(null);

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
  // requestAnimationFrame resize loop（確保拖曳面板時也能即時重繪）
  let resizeRafId = null;
  let lastRafSize = { w: 0, h: 0 };

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
   * 檢查圖層是否有任何可用的數據（dashboardData、layoutGridJsonData_Test3 等）
   */
  const currentLayerSummary = computed(() => {
    if (!activeLayerTab.value) {
      return null;
    }

    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    if (!layer) return null;

    // 檢查是否有任何可用的數據（LayoutGridTab_Test3 只看 layoutGridJsonData_Test3）
    const hasData =
      (layer.dashboardData !== null && layer.dashboardData !== undefined) ||
      (layer.layoutGridJsonData_Test3 !== null && layer.layoutGridJsonData_Test3 !== undefined) ||
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
   * LayoutGridTab_Test3 只看 layoutGridJsonData_Test3
   * 如果是 { routes, meta } 格式，回傳 routes（保持向後相容）
   */
  const getSchematicJsonData = (layer) => {
    if (!layer) return null;
    const data = layer.layoutGridJsonData_Test3;
    if (!data) return null;
    // 如果是 { routes, meta } 格式，回傳 routes
    if (data && typeof data === 'object' && Array.isArray(data.routes)) {
      return data.routes;
    }
    // 否則直接回傳（Array 或其他格式）
    return data;
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
      console.log(`[LayoutGridTab] loadLayerData 開始載入: ${layerId}`);
      // 找到指定的圖層
      const targetLayer = dataStore.findLayerById(layerId);
      if (!targetLayer) {
        throw new Error(`找不到圖層配置: ${layerId}`);
      }

      console.log(`[LayoutGridTab] 圖層資料檢查:`, {
        layerId,
        hasLayoutGridJsonData: !!targetLayer.layoutGridJsonData_Test3,
        layoutGridJsonData_TestType: targetLayer.layoutGridJsonData_Test3
          ? Array.isArray(targetLayer.layoutGridJsonData_Test3)
            ? 'Array'
            : typeof targetLayer.layoutGridJsonData_Test3
          : 'null',
        layoutGridJsonData_TestLength: Array.isArray(targetLayer.layoutGridJsonData_Test3)
          ? targetLayer.layoutGridJsonData_Test3.length
          : 'N/A',
        isMapLayerResult: isMapLayer(layerId),
      });

      // 🎯 優先檢查是否為地圖圖層（有 GeoJSON 數據或 Normalize Segments）
      if (isMapLayer(layerId)) {
        console.log(`[LayoutGridTab] 識別為地圖圖層`);
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
        console.log(`[LayoutGridTab] mapGeoJsonData 已設置:`, {
          type: mapGeoJsonData.value?.type,
          hasSegments: !!mapGeoJsonData.value?.segments,
          hasFeatures: !!mapGeoJsonData.value?.features,
        });
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
        // 如果有 layoutGridJsonData_Test3，優先檢查是否為 Normalize Segments 格式
        const d = getSchematicJsonData(targetLayer);
        if (!d) {
          console.error('❌ 無法找到圖層數據:', {
            layerId: layerId,
            hasLayoutGridJsonData: !!targetLayer.layoutGridJsonData_Test3,
            hasDataTableData: !!targetLayer.dataTableData,
            isLoaded: targetLayer.isLoaded,
          });
          throw new Error('無法從圖層數據中提取示意圖數據');
        }

        // 讀取 meta.gridWidth 和 meta.gridHeight（如果存在）
        const layoutData = targetLayer.layoutGridJsonData_Test3;
        if (layoutData && typeof layoutData === 'object' && layoutData.meta) {
          if (
            typeof layoutData.meta.gridWidth === 'number' &&
            typeof layoutData.meta.gridHeight === 'number'
          ) {
            gridSize.value = {
              width: layoutData.meta.gridWidth,
              height: layoutData.meta.gridHeight,
            };
            console.log(
              `[LayoutGridTab] 讀取到網格尺寸: ${gridSize.value.width} x ${gridSize.value.height}`
            );
          }
        }

        // 🎯 優先檢查是否為 Normalize Segments 格式（即使 isMapLayer 沒有識別出來）
        if (Array.isArray(d) && isNormalizeSegmentsFormat(d)) {
          console.log(`[LayoutGridTab] 在 else if 分支中識別為 Normalize Segments 格式`);
          // Normalize Segments 格式 - 作為地圖數據處理
          mapGeoJsonData.value = {
            type: 'NormalizeSegments',
            segments: d,
          };
          // 清除其他數據狀態
          gridData.value = null;
          nodeData.value = null;
          linkData.value = null;
        } else if (Array.isArray(d)) {
          // 嘗試將資料作為節點數據使用
          mapGeoJsonData.value = null;
          nodeData.value = d;
          setLinkData();
        } else if (d.type === 'grid') {
          // 網格數據
          mapGeoJsonData.value = null;
          gridData.value = d;
          gridDimensions.value = {
            x: d.gridX,
            y: d.gridY,
          };
        } else {
          // 其他格式，直接使用
          mapGeoJsonData.value = null;
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
      let width = container.clientWidth || rect.width;
      let height = container.clientHeight || rect.height;

      // 🛡️ 保護：確保尺寸至少大於 margin 的總和（top: 20, right: 20, bottom: 40, left: 50）
      // 最小寬度 = 50 + 20 + 100 = 170，最小高度 = 20 + 40 + 100 = 160
      const minWidth = 170;
      const minHeight = 160;

      width = Math.max(width, minWidth);
      height = Math.max(height, minHeight);

      const dimensions = {
        width,
        height,
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

    // 清除之前的圖表
    const containerId = getContainerId();
    d3.select(`#${containerId}`).selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out');

    // 🔍 創建可縮放的內容群組（與 LayoutGridTab / SpaceNetworkGridTab 一致）
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');
    const contentGroup = zoomGroup.append('g').attr('class', 'content-group');

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

    const lyrSchematicSquare = activeLayerTab.value
      ? dataStore.findLayerById(activeLayerTab.value)
      : null;
    const schematicSquareOn =
      activeLayerTab.value &&
      isTaipeiTest3BcdeLayerTab(activeLayerTab.value) &&
      lyrSchematicSquare?.squareGridCellsTaipeiTest3 === true;

    // 遞歸計算需要隱藏的行列，直到所有單元格 >= 40px
    const computeHiddenIndices = () => {
      const hiddenCols = new Set();
      const hiddenRows = new Set();

      // 最多迭代次數，避免無限循環
      const maxIterations = Math.max(gridDimensions.value.x, gridDimensions.value.y);
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;

        const visibleColumnMaxValues = columnMaxValues.filter((_, i) => !hiddenCols.has(i));
        const visibleRowMaxValues = rowMaxValues.filter((_, i) => !hiddenRows.has(i));
        const visColCount = visibleColumnMaxValues.length;
        const visRowCount = visibleRowMaxValues.length;
        const totalVisibleColumnValue = visibleColumnMaxValues.reduce((sum, val) => sum + val, 0);
        const totalVisibleRowValue = visibleRowMaxValues.reduce((sum, val) => sum + val, 0);

        let actualColumnWidths;
        let actualRowHeights;
        if (schematicSquareOn && visColCount > 0 && visRowCount > 0) {
          const cellSz = Math.min(width / visColCount, height / visRowCount);
          actualColumnWidths = columnMaxValues.map((_, index) =>
            hiddenCols.has(index) ? 0 : cellSz
          );
          actualRowHeights = rowMaxValues.map((_, index) => (hiddenRows.has(index) ? 0 : cellSz));
        } else {
          actualColumnWidths = columnMaxValues.map((maxVal, index) => {
            if (hiddenCols.has(index)) return 0;
            if (totalVisibleColumnValue === 0) return width / visColCount;
            return (maxVal / totalVisibleColumnValue) * width;
          });
          actualRowHeights = rowMaxValues.map((maxVal, index) => {
            if (hiddenRows.has(index)) return 0;
            if (totalVisibleRowValue === 0) return height / visRowCount;
            return (maxVal / totalVisibleRowValue) * height;
          });
        }

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

    const totalVisibleColumnValue = columnMaxValues
      .filter((_, i) => !hiddenColumnIndices.includes(i))
      .reduce((s, v) => s + v, 0);
    const totalVisibleRowValue = rowMaxValues
      .filter((_, i) => !hiddenRowIndices.includes(i))
      .reduce((s, v) => s + v, 0);

    let columnWidths;
    let rowHeights;
    let gridMargin;
    let gridDrawW;
    let gridDrawH;
    let cellSize;

    if (schematicSquareOn && visibleColumns > 0 && visibleRows > 0) {
      cellSize = Math.min(width / visibleColumns, height / visibleRows);
      gridDrawW = visibleColumns * cellSize;
      gridDrawH = visibleRows * cellSize;
      const gridOffsetX = (width - gridDrawW) / 2;
      const gridOffsetY = (height - gridDrawH) / 2;
      gridMargin = {
        ...margin,
        left: margin.left + gridOffsetX,
        top: margin.top + gridOffsetY,
      };
      columnWidths = columnMaxValues.map((_, index) =>
        hiddenColumnIndices.includes(index) ? 0 : cellSize
      );
      rowHeights = rowMaxValues.map((_, index) =>
        hiddenRowIndices.includes(index) ? 0 : cellSize
      );
    } else {
      cellSize = 0;
      gridDrawW = width;
      gridDrawH = height;
      gridMargin = { ...margin };
      columnWidths = columnMaxValues.map((maxVal, index) => {
        if (hiddenColumnIndices.includes(index)) return 0;
        if (totalVisibleColumnValue === 0) return width / visibleColumns;
        return (maxVal / totalVisibleColumnValue) * width;
      });
      rowHeights = rowMaxValues.map((maxVal, index) => {
        if (hiddenRowIndices.includes(index)) return 0;
        if (totalVisibleRowValue === 0) return height / visibleRows;
        return (maxVal / totalVisibleRowValue) * height;
      });
    }

    // 計算累積位置（用於快速查找每列/行的起始位置）
    const columnPositions = [0];
    const rowPositions = [0];
    for (let i = 0; i < columnWidths.length; i++) {
      columnPositions.push(columnPositions[i] + columnWidths[i]);
    }
    for (let i = 0; i < rowHeights.length; i++) {
      rowPositions.push(rowPositions[i] + rowHeights[i]);
    }

    const borderGroup = contentGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', gridMargin.left)
      .attr('y', gridMargin.top)
      .attr('width', schematicSquareOn ? gridDrawW : width)
      .attr('height', schematicSquareOn ? gridDrawH : height)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 🔍 設置縮放行為（即時縮放，不等縮放完才更新）
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);

    // 繪製網格節點（使用 contentGroup）
    drawGridNodes(
      contentGroup,
      columnWidths,
      rowHeights,
      columnPositions,
      rowPositions,
      gridMargin,
      hiddenColumnIndices,
      hiddenRowIndices,
      columnMaxValues,
      rowMaxValues
    );

    // 將此次重繪後的可見行列與單元尺寸寫入 store，供其他 Tab 讀取
    // 正方形格：寬高皆為 cellSize
    const avgCellWidth =
      cellSize || (visibleColumns > 0 ? width / visibleColumns : width / gridDimensions.value.x);
    const avgCellHeight =
      cellSize || (visibleRows > 0 ? height / visibleRows : height / gridDimensions.value.y);
    if (activeLayerTab.value) {
      dataStore.updateComputedGridState(activeLayerTab.value, {
        visibleX: visibleColumns,
        visibleY: visibleRows,
        cellWidth: avgCellWidth,
        cellHeight: avgCellHeight,
      });

      // 🔄 更新 drawJsonData，刪除被隱藏的行列
      updateDrawJsonData(hiddenColumnIndices, hiddenRowIndices);

      // 🎯 計算網格中最小寬度和最小高度（過濾掉隱藏的列/行，即寬度/高度為0的）
      const visibleColumnWidths = columnWidths.filter((w) => w > 0);
      const visibleRowHeights = rowHeights.filter((h) => h > 0);

      const minCellWidth = visibleColumnWidths.length > 0 ? Math.min(...visibleColumnWidths) : 0;
      const minCellHeight = visibleRowHeights.length > 0 ? Math.min(...visibleRowHeights) : 0;

      // 將 px 轉換為 pt（1 pt ≈ 1.333 px，在 96 DPI 的屏幕上）
      // 轉換公式：pt = px * 0.75
      // 🛡️ 避免極小值被四捨五入成 0：只要 px > 0，就至少顯示 1pt
      const minWidthPt = minCellWidth > 0 ? Math.max(1, Math.ceil(minCellWidth * 0.75)) : 0;
      const minHeightPt = minCellHeight > 0 ? Math.max(1, Math.ceil(minCellHeight * 0.75)) : 0;

      // 更新 dataStore 中的最小網格尺寸（供 ControlTab 顯示）
      dataStore.updateLayoutGridTabTest3MinCellDimensions(minWidthPt, minHeightPt);
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

          const x = margin.left - labelOffset;
          const y = margin.top + visibleRowPositions[visibleRowIdx] + rowHeights[yStat.row] / 2;

          // 只顯示最大值標籤
          statsGroup
            .append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'end')
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

    // 清除之前的圖表
    const containerId = getContainerId();
    d3.select(`#${containerId}`).selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out'); // 添加平滑過渡效果

    // 🔍 創建可縮放的內容群組（與 LayoutGridTab / SpaceNetworkGridTab 一致）
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');
    const contentGroup = zoomGroup.append('g').attr('class', 'content-group');

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
    const borderGroup = contentGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', actualWidth)
      .attr('height', actualHeight)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 🔍 設置縮放行為（即時縮放）
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

            contentGroup
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

            contentGroup
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

            contentGroup
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

            contentGroup
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
          contentGroup
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

        contentGroup
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

  /**
   * 🗺️ 繪製地圖 (Draw Map)
   * 使用 D3.js 繪製 GeoJSON 地圖數據或 Normalize Segments（站點和路線）
   * 背景強制為白色
   */
  const drawMap = () => {
    // console.log(`[LayoutGridTab] drawMap 開始:`, {
    //   hasMapGeoJsonData: !!mapGeoJsonData.value,
    //   mapGeoJsonDataType: mapGeoJsonData.value?.type,
    // });
    if (!mapGeoJsonData.value) {
      console.warn(`[LayoutGridTab] drawMap: mapGeoJsonData.value 為空，無法繪製`);
      return;
    }

    // 🛡️ 檢查容器是否存在且可見
    const containerId = getContainerId();
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`[LayoutGridTab] drawMap: 找不到容器 ${containerId}，延遲執行`);
      setTimeout(() => drawMap(), 100);
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      // console.warn(
      //   `[LayoutGridTab] drawMap: 容器尺寸為 0 (${rect.width}x${rect.height})，延遲執行`
      // );
      setTimeout(() => drawMap(), 100);
      return;
    }

    // 獲取容器尺寸
    const dimensions = getDimensions();

    // 添加適當的邊距（增加底部和左側邊距以容納刻度標籤）
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    let width = dimensions.width - margin.left - margin.right;
    let height = dimensions.height - margin.top - margin.bottom;

    // 🛡️ 保護：確保寬高不會是負數或太小
    if (width < 100) {
      console.warn(`[LayoutGridTab] drawMap: 計算出的寬度太小 (${width})，使用最小寬度 100`);
      width = 100;
    }
    if (height < 100) {
      console.warn(`[LayoutGridTab] drawMap: 計算出的高度太小 (${height})，使用最小高度 100`);
      height = 100;
    }

    console.log(`[LayoutGridTab] drawMap 尺寸計算:`, {
      containerWidth: dimensions.width,
      containerHeight: dimensions.height,
      margin,
      calculatedWidth: width,
      calculatedHeight: height,
      finalWidth: width + margin.left + margin.right,
      finalHeight: height + margin.top + margin.bottom,
    });

    // 清除之前的圖表和 tooltip
    d3.select(`#${containerId}`).selectAll('svg').remove();
    d3.select('body').selectAll('.d3js-map-tooltip').remove();

    // 🎯 強制設置容器背景為白色（清除任何可能的殘留樣式）
    // container 變數已在第 1740 行宣告，直接使用
    if (container) {
      container.style.backgroundColor = '#FFFFFF';
      container.style.background = '#FFFFFF';
      container.style.setProperty('background-color', '#FFFFFF', 'important');
      container.style.setProperty('background', '#FFFFFF', 'important');
    }

    // 創建 SVG 元素（強制白色背景）
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
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

    // 🔍 創建可縮放的內容群組（與 LayoutGridTab / SpaceNetworkGridTab 一致）
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');
    const contentGroup = zoomGroup.append('g').attr('class', 'content-group');

    // 🔍 設置縮放行為（即時縮放）
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);

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
    let normalizeFlatSegments = [];
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;

    if (isNormalizeFormat) {
      // Normalize Segments 格式處理
      const segments = mapGeoJsonData.value.segments || [];

      // 檢查是否為 2-5 格式（按路線分組）
      const isMergedRoutesFormat =
        segments.length > 0 && segments[0].route_name && Array.isArray(segments[0].segments);

      let flatSegments = [];
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
      normalizeFlatSegments = flatSegments;

      // 從 segments 中提取所有座標點
      const allPoints = new Set();
      flatSegments.forEach((seg) => {
        seg.points.forEach((point) => {
          // 支持 [x, y] 或 [x, y, props] 格式
          const rawX = Array.isArray(point) ? point[0] : point?.x;
          const rawY = Array.isArray(point) ? point[1] : point?.y;
          // 🛡️ 保護：避免 rawX/rawY 是 undefined / null / NaN 導致 xMin/yMin 變成 NaN
          const x = Number.isFinite(Number(rawX)) ? Number(rawX) : 0;
          const y = Number.isFinite(Number(rawY)) ? Number(rawY) : 0;
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

      routeFeatures = flatSegments.map((seg) => {
        // 檢查是否為 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式（points 為 [x, y, props]）
        const isHydratedFormat =
          seg.points &&
          seg.points.length > 0 &&
          Array.isArray(seg.points[0]) &&
          seg.points[0].length > 2;

        // 提取純座標（如果是 [x, y, props] 格式，只取前兩個元素）
        const coordinates = seg.points.map((point) => {
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
              original_points: seg.original_points || seg.points, // 傳遞原始點用於計算距離
              points: seg.points, // 傳遞 points 用於計算距離
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
              name: seg.name,
              station_weights: seg.station_weights, // 傳遞 station_weights
              original_points: seg.original_points || seg.points, // 傳遞原始點用於計算距離
              points: seg.points, // 傳遞 points 用於計算距離
            },
          };
        }
      });

      // 從 segments 中提取站點

      const stationMap = new Map();
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
                const midProps = Array.isArray(midPt) && midPt.length > 2 ? midPt[2] : {};
                const key = `${x},${y}`;

                // 判斷是否為真正的車站（不是幾何轉折點）
                // 真正的車站：node_type === 'connect' 或有 station_name
                // 不繪製：node_type === 'line' 的幾何轉折點
                const isRealStation =
                  midProps.node_type === 'connect' ||
                  midProps.station_name ||
                  midProps.tags?.station_name;

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
                        const isRealStation =
                          nodeProps.node_type === 'connect' ||
                          nodeProps.station_name ||
                          nodeProps.tags?.station_name;

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
                      const isRealStation =
                        nodeProps.node_type === 'connect' ||
                        nodeProps.station_name ||
                        nodeProps.tags?.station_name;

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
            const nodeProps = seg.nodes[index] || {};
            const key = `${x},${y}`;

            // 判斷是否為真正的車站（不是幾何轉折點）
            // 真正的車站：node_type === 'connect' 或有 station_name
            // 不繪製：node_type === 'line' 的幾何轉折點
            // taipei_h3：g3→h3 插入之中段站帶 tags._forceDrawBlackDot
            const isRealStation =
              nodeProps.node_type === 'connect' ||
              nodeProps.station_name ||
              nodeProps.tags?.station_name ||
              nodeProps.tags?._forceDrawBlackDot;

            // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
            if (!stationMap.has(key) && isRealStation) {
              stationMap.set(key, {
                geometry: {
                  type: 'Point',
                  coordinates: [x, y],
                },
                properties: {
                  ...nodeProps,
                  x_grid: x,
                  y_grid: y,
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
      stationFeatures = Array.from(stationMap.values());
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
          const [rawX, rawY] = geom.coordinates || [];
          const x = Number.isFinite(Number(rawX)) ? Number(rawX) : 0;
          const y = Number.isFinite(Number(rawY)) ? Number(rawY) : 0;
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        } else if (geom.type === 'LineString') {
          geom.coordinates.forEach((coord) => {
            const [rawX, rawY] = coord || [];
            const x = Number.isFinite(Number(rawX)) ? Number(rawX) : 0;
            const y = Number.isFinite(Number(rawY)) ? Number(rawY) : 0;
            xMin = Math.min(xMin, x);
            xMax = Math.max(xMax, x);
            yMin = Math.min(yMin, y);
            yMax = Math.max(yMax, y);
          });
        } else if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach((line) => {
            line.forEach((coord) => {
              const [rawX, rawY] = coord || [];
              const x = Number.isFinite(Number(rawX)) ? Number(rawX) : 0;
              const y = Number.isFinite(Number(rawY)) ? Number(rawY) : 0;
              xMin = Math.min(xMin, x);
              xMax = Math.max(xMax, x);
              yMin = Math.min(yMin, y);
              yMax = Math.max(yMax, y);
            });
          });
        }
      });
    }

    // 🎯 統計有黑點或路線的座標（記錄所有使用的 x 和 y）
    const usedCols = new Set();
    const usedRows = new Set();

    routeFeatures.forEach((feature) => {
      if (!feature || !feature.geometry) return;
      const geom = feature.geometry;
      if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
        geom.coordinates.forEach((coord) => {
          const x = Math.round(coord[0]);
          const y = Math.round(coord[1]);
          usedCols.add(x);
          usedRows.add(y);
        });
      } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
        geom.coordinates.forEach((line) => {
          if (Array.isArray(line)) {
            line.forEach((coord) => {
              const x = Math.round(coord[0]);
              const y = Math.round(coord[1]);
              usedCols.add(x);
              usedRows.add(y);
            });
          }
        });
      }
    });

    stationFeatures.forEach((feature) => {
      if (!feature || !feature.geometry) return;
      const [x, y] = feature.geometry.coordinates;
      usedCols.add(Math.round(x));
      usedRows.add(Math.round(y));
    });

    // 🎯 計算每個 col/row 的最大權重值（供邊緣標籤；繪圖格寬高與權重解耦）
    const colMaxValues = {};
    const rowMaxValues = {};

    const updateMax = (dic, idx, val) => {
      dic[idx] = Math.max(dic[idx] || 0, typeof val === 'number' ? val : Number(val) || 0);
    };

    routeFeatures.forEach((feature) => {
      if (!feature || !feature.properties) return;
      const props = feature.properties;
      const stationWeights = props.station_weights;
      const points = props.points || props.original_points || [];

      if (!Array.isArray(stationWeights) || stationWeights.length === 0) return;
      if (!Array.isArray(points) || points.length === 0) return;

      stationWeights.forEach((wInfo) => {
        const sIdx = wInfo.start_idx;
        const eIdx = wInfo.end_idx;
        const w = typeof wInfo.weight === 'number' ? wInfo.weight : Number(wInfo.weight) || 0;

        if (
          typeof sIdx !== 'number' ||
          typeof eIdx !== 'number' ||
          sIdx < 0 ||
          eIdx < 0 ||
          sIdx >= points.length ||
          eIdx >= points.length ||
          sIdx >= eIdx
        ) {
          return;
        }

        const subPath = points.slice(sIdx, eIdx + 1);
        if (subPath.length < 2) return;

        for (let i = 0; i < subPath.length - 1; i++) {
          const p1 = subPath[i];
          const p2 = subPath[i + 1];

          const x1 = Array.isArray(p1) ? p1[0] : p1.x || 0;
          const y1 = Array.isArray(p1) ? p1[1] : p1.y || 0;
          const x2 = Array.isArray(p2) ? p2[0] : p2.x || 0;
          const y2 = Array.isArray(p2) ? p2[1] : p2.y || 0;

          const segX0 = Math.min(x1, x2);
          const segX1 = Math.max(x1, x2);
          const segY0 = Math.min(y1, y2);
          const segY1 = Math.max(y1, y2);

          const epsilon = 0.001;
          for (let gx = Math.ceil(segX0 - epsilon); gx <= Math.floor(segX1 + epsilon); gx++) {
            updateMax(colMaxValues, gx, w);
          }
          for (let gy = Math.ceil(segY0 - epsilon); gy <= Math.floor(segY1 + epsilon); gy++) {
            updateMax(rowMaxValues, gy, w);
          }
        }
      });
    });

    const xStart = Math.floor(xMin);
    const xEnd = Math.ceil(xMax);
    const yStart = Math.floor(yMin);
    const yEnd = Math.ceil(yMax);

    const layerForMapSquare = activeLayerTab.value
      ? dataStore.findLayerById(activeLayerTab.value)
      : null;
    const squareGridOnMap =
      activeLayerTab.value &&
      isTaipeiTest3BcdeLayerTab(activeLayerTab.value) &&
      layerForMapSquare?.squareGridCellsTaipeiTest3 === true;

    let xScale;
    let yScale;
    let plotLeft;
    let plotTop;
    let plotW;
    let plotH;

    if (squareGridOnMap) {
      const nColCells = Math.max(1, xEnd - xStart + 1);
      const nRowCells = Math.max(1, yEnd - yStart + 1);
      const cellSize = Math.min(width / nColCells, height / nRowCells);
      plotW = nColCells * cellSize;
      plotH = nRowCells * cellSize;
      plotLeft = margin.left + (width - plotW) / 2;
      plotTop = margin.top + (height - plotH) / 2;

      const minWidthPtSq = cellSize > 0 ? Math.max(1, Math.ceil(cellSize * 0.75)) : 0;
      dataStore.updateLayoutGridTabTest3MinCellDimensions(minWidthPtSq, minWidthPtSq);

      xScale = (xv) => plotLeft + (xv - xStart) * cellSize;
      xScale.invert = (px) => xStart + (px - plotLeft) / cellSize;

      yScale = (yv) => plotTop + plotH - (yv - yStart) * cellSize;
      yScale.invert = (py) => yStart + (plotTop + plotH - py) / cellSize;
    } else {
      const targetLayerForMeta = activeLayerTab.value
        ? dataStore.findLayerById(activeLayerTab.value)
        : null;
      const rawLayoutForMeta = targetLayerForMeta?.layoutGridJsonData_Test3;
      const metaForFixed =
        rawLayoutForMeta && typeof rawLayoutForMeta === 'object' && !Array.isArray(rawLayoutForMeta)
          ? rawLayoutForMeta.meta || {}
          : {};

      const fixedColsFromMeta = Array.isArray(metaForFixed.fixedCols)
        ? metaForFixed.fixedCols.map((v) => Math.round(v))
        : [];
      const fixedRowsFromMeta = Array.isArray(metaForFixed.fixedRows)
        ? metaForFixed.fixedRows.map((v) => Math.round(v))
        : [];

      const fixedColSet = new Set();
      const fixedRowSet = new Set();
      for (let xi = xStart; xi <= xEnd; xi++) {
        if (xi % 2 === 0) fixedColSet.add(xi);
      }
      for (let yi = yStart; yi <= yEnd; yi++) {
        if (yi % 2 === 0) fixedRowSet.add(yi);
      }
      fixedColsFromMeta.forEach((xi) => {
        if (xi >= xStart && xi <= xEnd) fixedColSet.add(xi);
      });
      fixedRowsFromMeta.forEach((yi) => {
        if (yi >= yStart && yi <= yEnd) fixedRowSet.add(yi);
      });

      const totalColMaxValue = Object.keys(colMaxValues)
        .map((xk) => Number(xk))
        .filter((xk) => Number.isFinite(xk) && !fixedColSet.has(xk))
        .reduce((sum, xk) => sum + (colMaxValues[xk] || 0), 0);
      const totalRowMaxValue = Object.keys(rowMaxValues)
        .map((yk) => Number(yk))
        .filter((yk) => Number.isFinite(yk) && !fixedRowSet.has(yk))
        .reduce((sum, yk) => sum + (rowMaxValues[yk] || 0), 0);

      const FIXED_SIZE_PT = 1;
      const FIXED_SIZE_PX = FIXED_SIZE_PT / 0.75;

      const fixedColCount = fixedColSet.size;
      const fixedRowCount = fixedRowSet.size;
      const availableWidth = width - fixedColCount * FIXED_SIZE_PX;
      const availableHeight = height - fixedRowCount * FIXED_SIZE_PX;

      const colCumulativeWidths = {};
      const rowCumulativeHeights = {};
      let currentXPos = margin.left;

      const colWidths = [];
      for (let xi = xStart; xi <= xEnd; xi++) {
        let colWidth;
        if (fixedColSet.has(xi)) {
          colWidth = FIXED_SIZE_PX;
        } else {
          const maxValue = colMaxValues[xi] || 0;
          colWidth =
            totalColMaxValue > 0
              ? (maxValue / totalColMaxValue) * availableWidth
              : availableWidth / (xEnd - xStart + 1 - fixedColCount);
        }
        colWidths.push(colWidth);
        colCumulativeWidths[xi] = currentXPos;
        currentXPos += colWidth;
      }
      colCumulativeWidths[Math.ceil(xMax) + 1] = margin.left + width;

      let rowYPos = margin.top + height;
      const rowHeights = [];
      if (isFinite(yMin) && isFinite(yMax) && yMin <= yMax) {
        for (let yi = yStart; yi <= yEnd; yi++) {
          let rowHeight;
          if (fixedRowSet.has(yi)) {
            rowHeight = FIXED_SIZE_PX;
          } else {
            const maxValue = rowMaxValues[yi] || 0;
            rowHeight =
              totalRowMaxValue > 0
                ? (maxValue / totalRowMaxValue) * availableHeight
                : availableHeight / (yEnd - yStart + 1 - fixedRowCount);
          }
          rowHeights.push(rowHeight);
          rowCumulativeHeights[yi] = rowYPos;
          rowYPos -= rowHeight;
        }
        rowCumulativeHeights[Math.ceil(yMax) + 1] = margin.top;
      }

      const validColWidths = colWidths
        .map((w, idx) => ({ w, x: xStart + idx }))
        .filter((item) => item.w > 0 && !fixedColSet.has(item.x))
        .map((item) => item.w);
      const validRowHeights = rowHeights
        .map((h, idx) => ({ h, y: yStart + idx }))
        .filter((item) => item.h > 0 && !fixedRowSet.has(item.y))
        .map((item) => item.h);

      const minCellWidth = validColWidths.length > 0 ? Math.min(...validColWidths) : 0;
      const minCellHeight = validRowHeights.length > 0 ? Math.min(...validRowHeights) : 0;

      const minWidthPtLegacy = minCellWidth > 0 ? Math.max(1, Math.ceil(minCellWidth * 0.75)) : 0;
      const minHeightPtLegacy =
        minCellHeight > 0 ? Math.max(1, Math.ceil(minCellHeight * 0.75)) : 0;
      dataStore.updateLayoutGridTabTest3MinCellDimensions(minWidthPtLegacy, minHeightPtLegacy);

      xScale = (xv) => {
        const floorX = Math.floor(xv);
        const ceilX = Math.ceil(xv);
        const startPos =
          colCumulativeWidths[floorX] !== undefined ? colCumulativeWidths[floorX] : margin.left;
        const endPos =
          colCumulativeWidths[ceilX] !== undefined
            ? colCumulativeWidths[ceilX]
            : margin.left + width;
        const t = xv - floorX;
        return startPos + (endPos - startPos) * t;
      };

      yScale = (yv) => {
        const floorY = Math.floor(yv);
        const ceilY = Math.ceil(yv);
        const startPos =
          rowCumulativeHeights[floorY] !== undefined
            ? rowCumulativeHeights[floorY]
            : margin.top + height;
        const endPos =
          rowCumulativeHeights[ceilY] !== undefined ? rowCumulativeHeights[ceilY] : margin.top;
        const t = yv - floorY;
        return startPos + (endPos - startPos) * t;
      };

      xScale.invert = (px) => {
        for (let xi = Math.floor(xMin); xi <= Math.ceil(xMax); xi++) {
          const startPos =
            colCumulativeWidths[xi] !== undefined ? colCumulativeWidths[xi] : margin.left;
          const endPos =
            colCumulativeWidths[xi + 1] !== undefined
              ? colCumulativeWidths[xi + 1]
              : margin.left + width;
          if (px >= startPos && px <= endPos) {
            const t = (px - startPos) / (endPos - startPos);
            return xi + t;
          }
        }
        return xMin;
      };

      yScale.invert = (py) => {
        for (let yi = Math.floor(yMin); yi <= Math.ceil(yMax); yi++) {
          const startPos =
            rowCumulativeHeights[yi] !== undefined ? rowCumulativeHeights[yi] : margin.top + height;
          const endPos =
            rowCumulativeHeights[yi + 1] !== undefined ? rowCumulativeHeights[yi + 1] : margin.top;
          if (py <= startPos && py >= endPos) {
            const t = (startPos - py) / (startPos - endPos);
            return yi + t;
          }
        }
        return yMin;
      };

      plotLeft = margin.left;
      plotTop = margin.top;
      plotW = width;
      plotH = height;
    }

    const borderGroup = contentGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', plotLeft)
      .attr('y', plotTop)
      .attr('width', plotW)
      .attr('height', plotH)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    const emptyBackgroundGroup = contentGroup.append('g').attr('class', 'empty-background-group');

    for (let x = Math.floor(xMin); x <= Math.ceil(xMax); x++) {
      if (!usedCols.has(x)) {
        const xa = xScale(x);
        const xb = xScale(x + 1);
        emptyBackgroundGroup
          .append('rect')
          .attr('x', Math.min(xa, xb))
          .attr('y', plotTop)
          .attr('width', Math.max(1, Math.abs(xb - xa)))
          .attr('height', plotH)
          .attr('fill', '#F5F5F5')
          .attr('fill-opacity', 0.8)
          .style('pointer-events', 'none');
      }
    }

    for (let y = Math.floor(yMin); y <= Math.ceil(yMax); y++) {
      if (!usedRows.has(y)) {
        const ya = yScale(y);
        const yb = yScale(y + 1);
        emptyBackgroundGroup
          .append('rect')
          .attr('x', plotLeft)
          .attr('y', Math.min(ya, yb))
          .attr('width', plotW)
          .attr('height', Math.max(1, Math.abs(yb - ya)))
          .attr('fill', '#F5F5F5')
          .attr('fill-opacity', 0.8)
          .style('pointer-events', 'none');
      }
    }

    emptyBackgroundGroup.lower();

    // 🎯 繪製淺灰色網格線（在背景層，使用新的比例尺）
    const gridGroup = contentGroup.append('g').attr('class', 'grid-group');

    for (let x = Math.floor(xMin); x <= Math.ceil(xMax) + 1; x++) {
      const xPos = xScale(x);
      gridGroup
        .append('line')
        .attr('x1', xPos)
        .attr('y1', plotTop)
        .attr('x2', xPos)
        .attr('y2', plotTop + plotH)
        .attr('stroke', '#E0E0E0')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.6);
    }

    for (let y = Math.floor(yMin); y <= Math.ceil(yMax) + 1; y++) {
      const yPos = yScale(y);
      gridGroup
        .append('line')
        .attr('x1', plotLeft)
        .attr('y1', yPos)
        .attr('x2', plotLeft + plotW)
        .attr('y2', yPos)
        .attr('stroke', '#E0E0E0')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.6);
    }

    gridGroup.lower();

    const targetLayer = dataStore.findLayerById(activeLayerTab.value);
    const isTest2EdgeMode = targetLayer?.layerId === 'taipei_6_1_test2';

    // 🎯 在 col/row 邊緣標示最大值（舊模式）
    // taipei_6_1_test2 改為「寫在刻度旁邊」，避免畫兩次
    if (!isTest2EdgeMode) {
      // 🎯 在 col 邊緣標示最大值（上方）
      const colMaxLabelsGroup = contentGroup.append('g').attr('class', 'col-max-labels-group');
      for (let x = Math.floor(xMin); x <= Math.ceil(xMax); x++) {
        if (colMaxValues[x] && colMaxValues[x] > 0) {
          const xPos = xScale(x);
          const maxValue = colMaxValues[x];
          colMaxLabelsGroup
            .append('text')
            .attr('x', xPos)
            .attr('y', plotTop - 8)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#4CAF50')
            .text(maxValue);
        }
      }

      // 🎯 在 row 邊緣標示最大值（左側）
      const rowMaxLabelsGroup = contentGroup.append('g').attr('class', 'row-max-labels-group');
      for (let y = Math.floor(yMin); y <= Math.ceil(yMax); y++) {
        if (rowMaxValues[y] && rowMaxValues[y] > 0) {
          const yPos = yScale(y);
          const maxValue = rowMaxValues[y];
          rowMaxLabelsGroup
            .append('text')
            .attr('x', plotLeft - 8)
            .attr('y', yPos - 12)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#4CAF50')
            .text(maxValue);
        }
      }
    }

    // 🎯 從 dataTableData / layoutGridJsonData_Test3 提取邊緣最大值（用於 taipei_6_1_test2：寫在刻度旁邊）
    // 注意：taipei_6_1_test2 目前改用 loadSpaceNetworkGridJson3（只回傳 layoutGridJsonData_Test3），因此這裡需要 fallback 計算
    const edgeMaxValues = { col: {}, row: {} };

    const rasterizeAndUpdate = (ax, ay, bx, by, weight) => {
      ax = Math.round(ax);
      ay = Math.round(ay);
      bx = Math.round(bx);
      by = Math.round(by);

      const dx = Math.abs(bx - ax);
      const dy = Math.abs(by - ay);

      const mark = (x, y) => {
        updateMax(edgeMaxValues.col, x, weight);
        updateMax(edgeMaxValues.row, y, weight);
      };

      if (dx === 0 && dy === 0) {
        mark(ax, ay);
        return;
      }
      if (dy === 0) {
        const x0 = Math.min(ax, bx);
        const x1 = Math.max(ax, bx);
        for (let x = x0; x <= x1; x++) mark(x, ay);
        return;
      }
      if (dx === 0) {
        const y0 = Math.min(ay, by);
        const y1 = Math.max(ay, by);
        for (let y = y0; y <= y1; y++) mark(ax, y);
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
        mark(x, y);
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

    if (isTest2EdgeMode) {
      if (targetLayer?.dataTableData && Array.isArray(targetLayer.dataTableData)) {
        console.log(
          '📊 處理 edgeMaxValues（dataTableData），項目數:',
          targetLayer.dataTableData.length
        );

        // 🎯 注意：dataTableData 中的 idx 是相對坐標（從 0 開始）
        // 需要轉換回絕對坐標（加上 xMin/yMin）來與畫面座標軸一致
        targetLayer.dataTableData.forEach((item) => {
          if (item.type === 'col') {
            const actualCol = item.idx + Math.floor(xMin);
            if (actualCol !== undefined && item.idx_max_weight !== undefined) {
              updateMax(edgeMaxValues.col, actualCol, item.idx_max_weight);
            }
          } else if (item.type === 'row') {
            const actualRow = item.idx + Math.floor(yMin);
            if (actualRow !== undefined && item.idx_max_weight !== undefined) {
              updateMax(edgeMaxValues.row, actualRow, item.idx_max_weight);
            }
          }
        });
      } else {
        // Fallback：直接從 layoutGridJsonData_Test3 計算（會覆蓋到奇數座標，供「單數刻度顯示藍字最大值」）
        const layout = targetLayer?.layoutGridJsonData_Test3;
        const routes = Array.isArray(layout) ? layout : layout?.routes || [];
        console.log('📊 處理 edgeMaxValues（layoutGridJsonData_Test3），routes:', routes.length);

        for (const route of routes) {
          const segments = route?.segments || [];
          for (const seg of segments) {
            const points = Array.isArray(seg?.points) ? seg.points : [];
            const stationWeights = Array.isArray(seg?.station_weights) ? seg.station_weights : null;
            const edgeWeights = Array.isArray(seg?.edge_weights) ? seg.edge_weights : null;

            if (stationWeights && stationWeights.length > 0) {
              for (const wInfo of stationWeights) {
                const sIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
                const eIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
                const w = wInfo?.weight;
                if (
                  sIdx === null ||
                  eIdx === null ||
                  !Number.isFinite(Number(w)) ||
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
                  if (!p1 || !p2) continue;
                  const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
                  const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
                  const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
                  const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
                  rasterizeAndUpdate(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
                }
              }
            } else if (edgeWeights && edgeWeights.length > 0) {
              const nEdges = Math.min(edgeWeights.length, Math.max(0, points.length - 1));
              for (let i = 0; i < nEdges; i++) {
                const w = edgeWeights[i];
                if (!Number.isFinite(Number(w))) continue;
                const p1 = points[i];
                const p2 = points[i + 1];
                if (!p1 || !p2) continue;
                const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
                const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
                const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
                const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
                rasterizeAndUpdate(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
              }
            }
          }
        }
      }

      console.log('✅ edgeMaxValues.col 數量:', Object.keys(edgeMaxValues.col).length);
      console.log('✅ edgeMaxValues.row 數量:', Object.keys(edgeMaxValues.row).length);
    }

    const gridBottom = plotTop + plotH;

    // 🎯 繪製座標軸和刻度（在邊界外，使用新的比例尺）
    const axisGroup = contentGroup.append('g').attr('class', 'axis-group');

    // X軸刻度（偶數顯示座標，單數顯示 weight 最大值）
    for (let x = Math.floor(xMin); x <= Math.ceil(xMax); x++) {
      const xPos = xScale(x);
      const xCenterPos = xScale(x + 0.5); // 網格中心位置

      // 繪製刻度線（在底部邊界外）
      axisGroup
        .append('line')
        .attr('x1', xPos)
        .attr('y1', gridBottom)
        .attr('x2', xPos)
        .attr('y2', gridBottom + 5)
        .attr('stroke', '#666666')
        .attr('stroke-width', 1);

      if (x % 2 === 0) {
        // 偶數：顯示座標數字（灰色）
        axisGroup
          .append('text')
          .attr('x', xCenterPos)
          .attr('y', gridBottom + 18)
          .attr('text-anchor', 'middle')
          .attr('font-size', '7px')
          .attr('fill', '#666666')
          .text(x);
      } else {
        // 單數：顯示 weight 最大值（藍色），畫在刻度線外面（更下方）
        if (edgeMaxValues.col[x] !== undefined && edgeMaxValues.col[x] > 0) {
          axisGroup
            .append('text')
            .attr('x', xCenterPos)
            .attr('y', gridBottom + 32)
            .attr('text-anchor', 'middle')
            .attr('font-size', '7px')
            .attr('fill', '#2196F3')
            .attr('font-weight', 'bold')
            .text(edgeMaxValues.col[x]);
        }
      }
    }

    // Y軸刻度（偶數顯示座標，單數顯示 weight 最大值）
    for (let y = Math.floor(yMin); y <= Math.ceil(yMax); y++) {
      const yPos = yScale(y);
      const yCenterPos = yScale(y + 0.5); // 網格中心位置

      // 繪製刻度線（在左側邊界外）
      axisGroup
        .append('line')
        .attr('x1', plotLeft)
        .attr('y1', yPos)
        .attr('x2', plotLeft - 5)
        .attr('y2', yPos)
        .attr('stroke', '#666666')
        .attr('stroke-width', 1);

      if (y % 2 === 0) {
        // 偶數：顯示座標數字（灰色）
        axisGroup
          .append('text')
          .attr('x', plotLeft - 8)
          .attr('y', yCenterPos)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '7px')
          .attr('fill', '#666666')
          .text(y);
      } else {
        // 單數：顯示 weight 最大值（藍色），畫在刻度線外面（更左側）
        if (edgeMaxValues.row[y] !== undefined && edgeMaxValues.row[y] > 0) {
          axisGroup
            .append('text')
            .attr('x', plotLeft - 20)
            .attr('y', yCenterPos)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '7px')
            .attr('fill', '#2196F3')
            .attr('font-weight', 'bold')
            .text(edgeMaxValues.row[y]);
        }
      }
    }

    // 🎯 將座標轉換到網格中間（如果是整數，加 0.5）
    const toGridCenter = (coord) => {
      return Number.isInteger(coord) ? coord + 0.5 : coord;
    };

    // 創建線條生成器（座標轉換到網格中間）
    const lineGenerator = d3
      .line()
      .x((d) => xScale(toGridCenter(d[0])))
      .y((d) => yScale(toGridCenter(d[1])))
      .curve(d3.curveLinear);

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

    const drawRoutePath = (coords, tags, name, color, stationWeights, originalPoints, points) => {
      // 獲取顏色（參考 MapTab / Python 規則）
      const routeColor = tags?.colour || tags?.color || '#2c7bb6';

      // 確保 coords 是有效的座標陣列
      if (!Array.isArray(coords) || coords.length < 2) {
        return;
      }

      // 將 coords 轉換到網格中間
      const centerCoords = coords.map((coord) => [toGridCenter(coord[0]), toGridCenter(coord[1])]);

      // 使用 original_points 或 points 來確定車站位置（用於計算 edge 的起點和終點）
      const refPoints = originalPoints || points || coords;
      const refCoords = refPoints
        .map((pt) => {
          if (Array.isArray(pt)) {
            return pt.length >= 2 ? [toGridCenter(pt[0]), toGridCenter(pt[1])] : null;
          }
          return pt && pt.x !== undefined && pt.y !== undefined
            ? [toGridCenter(pt.x), toGridCenter(pt.y)]
            : null;
        })
        .filter((pt) => pt !== null);

      // 如果有 station_weights，分段繪製路線，每段使用對應的 weight 作為 stroke-width
      if (
        stationWeights &&
        Array.isArray(stationWeights) &&
        stationWeights.length > 0 &&
        refCoords.length >= 2
      ) {
        // 計算每個車站在實際繪製路線（centerCoords）上的路徑距離
        const stationDists = refCoords.map((pt) => getStationDistOnPolyline(pt, centerCoords));

        // 為每個 station_weights 分段繪製路線
        stationWeights.forEach((weightInfo) => {
          const { start_idx, end_idx, weight } = weightInfo;

          // 確保索引有效
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

          // 計算每個 centerCoords 點從起點開始的累積距離
          const coordDists = [0];
          let cumulativeDist = 0;
          for (let i = 0; i < centerCoords.length - 1; i++) {
            const segLen = dist(centerCoords[i], centerCoords[i + 1]);
            cumulativeDist += segLen;
            coordDists.push(cumulativeDist);
          }

          // 提取這段路線的座標
          const segmentCoords = [];

          // 添加起點
          const startPoint = getPointAtDistance(centerCoords, startDist);
          segmentCoords.push(startPoint);

          // 添加中間的點（如果有的話）
          for (let i = 0; i < centerCoords.length; i++) {
            if (coordDists[i] > startDist && coordDists[i] < endDist) {
              // 避免重複點
              const lastPoint = segmentCoords[segmentCoords.length - 1];
              const currentPoint = centerCoords[i];
              if (!lastPoint || dist(lastPoint, currentPoint) > 0.001) {
                segmentCoords.push(currentPoint);
              }
            }
          }

          // 添加終點
          const endPoint = getPointAtDistance(centerCoords, endDist);
          // 避免終點與最後一個點重複
          const lastPoint = segmentCoords[segmentCoords.length - 1];
          if (!lastPoint || dist(lastPoint, endPoint) > 0.001) {
            segmentCoords.push(endPoint);
          }

          // 確保至少兩個點
          if (segmentCoords.length < 2) {
            return;
          }

          // 繪製這段路線
          const segmentPathData = lineGenerator(segmentCoords);
          if (!segmentPathData) return;

          const weightValue = typeof weight === 'number' ? weight : Number(weight) || 3;
          const strokeWidth = `${weightValue}pt`;

          const pathElement = contentGroup
            .append('path')
            .attr('d', segmentPathData)
            .attr('stroke', routeColor)
            .attr('fill', 'none')
            .attr('stroke-width', strokeWidth)
            .attr('opacity', 0.9)
            .style('cursor', 'pointer');

          // 添加 hover 效果
          pathElement
            .on('mouseover', function (event) {
              // 高亮路線
              const hoverWidth = `${weightValue * 1.5}pt`;
              d3.select(this).attr('stroke-width', hoverWidth).attr('opacity', 1);

              // 顯示 tooltip
              let tooltipContent = '';
              if (name) {
                tooltipContent += `<strong>路線名稱:</strong> ${name}<br>`;
              }
              if (tags) {
                const tagsHtml = Object.entries(tags)
                  .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                  .join('<br>');
                tooltipContent += tagsHtml || '無標籤資訊';
              }
              tooltipContent += `<br><strong>權重:</strong> ${weightValue}`;

              tooltip
                .html(tooltipContent || '無標籤資訊')
                .style('opacity', 1)
                .style('left', event.pageX + 10 + 'px')
                .style('top', event.pageY - 10 + 'px');
            })
            .on('mousemove', function (event) {
              // 更新 tooltip 位置
              tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              // 恢復路線樣式
              d3.select(this).attr('stroke-width', strokeWidth).attr('opacity', 0.9);

              // 隱藏 tooltip
              tooltip.style('opacity', 0);
            });
        });
      } else {
        // 沒有 station_weights，繪製整條路線（使用默認寬度）
        const pathData = lineGenerator(centerCoords);
        if (!pathData) return;

        const pathElement = contentGroup
          .append('path')
          .attr('d', pathData)
          .attr('stroke', routeColor)
          .attr('fill', 'none')
          .attr('stroke-width', '3pt')
          .attr('opacity', 0.9)
          .style('cursor', 'pointer');

        // 添加 hover 效果
        pathElement
          .on('mouseover', function (event) {
            // 高亮路線
            d3.select(this).attr('stroke-width', '5pt').attr('opacity', 1);

            // 顯示 tooltip
            let tooltipContent = '';
            if (name) {
              tooltipContent += `<strong>路線名稱:</strong> ${name}<br>`;
            }
            if (tags) {
              const tagsHtml = Object.entries(tags)
                .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                .join('<br>');
              tooltipContent += tagsHtml || '無標籤資訊';
            }

            tooltip
              .html(tooltipContent || '無標籤資訊')
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
          })
          .on('mousemove', function (event) {
            // 更新 tooltip 位置
            tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
          })
          .on('mouseout', function () {
            // 恢復路線樣式
            d3.select(this).attr('stroke-width', '3pt').attr('opacity', 0.9);

            // 隱藏 tooltip
            tooltip.style('opacity', 0);
          });
      }

      // 繪製 station_weights（如果有）
      if (stationWeights && Array.isArray(stationWeights) && stationWeights.length > 0) {
        // 確保 coords 是有效的座標陣列
        if (!Array.isArray(coords) || coords.length < 2) {
          return;
        }

        // 使用 original_points 或 points 來確定車站位置（用於計算 edge 的起點和終點）
        const refPoints = originalPoints || points || coords;

        // 確保 refPoints 是有效的座標陣列
        if (!Array.isArray(refPoints) || refPoints.length < 2) {
          return;
        }

        // 將 refPoints 轉換為純座標格式 [x, y]，並轉換到網格中間
        const refCoords = refPoints
          .map((pt) => {
            if (Array.isArray(pt)) {
              return pt.length >= 2 ? [toGridCenter(pt[0]), toGridCenter(pt[1])] : null;
            }
            return pt && pt.x !== undefined && pt.y !== undefined
              ? [toGridCenter(pt.x), toGridCenter(pt.y)]
              : null;
          })
          .filter((pt) => pt !== null);

        if (refCoords.length < 2) {
          return;
        }

        // 將 coords 轉換到網格中間
        const centerCoords = coords.map((coord) => [
          toGridCenter(coord[0]),
          toGridCenter(coord[1]),
        ]);

        // 計算每個車站在實際繪製路線（centerCoords）上的路徑距離
        // 這樣可以確保權重值準確地繪製在線上
        const stationDists = refCoords.map((pt) => getStationDistOnPolyline(pt, centerCoords));

        // 繪製每個 station_weights 的權重值
        stationWeights.forEach((weightInfo) => {
          const { start_idx, end_idx, weight } = weightInfo;

          // 確保索引有效
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

          // 在實際繪製的路線（centerCoords）上找到中間點的座標
          // 這樣可以確保權重值準確地在線上
          const midPoint = getPointAtDistance(centerCoords, midDist);
          const [midX, midY] = midPoint;

          // 計算文本位置（使用比例尺轉換）
          const textX = xScale(midX);
          const textY = yScale(midY);

          // 創建文本群組
          const textGroup = contentGroup.append('g').attr('class', 'edge-weight-label');

          // 繪製白色背景矩形（模擬 Python 的 bbox）
          const padding = 0.1;
          const rectWidth = String(weight).length * 4 + padding * 2;
          const rectHeight = 8 + padding * 2;

          textGroup
            .append('rect')
            .attr('x', textX - rectWidth / 2)
            .attr('y', textY - rectHeight / 2)
            .attr('width', rectWidth)
            .attr('height', rectHeight)
            .attr('fill', 'white')
            .attr('fill-opacity', 1)
            .attr('stroke', 'none')
            .style('pointer-events', 'none');

          // 繪製權重值文本
          textGroup
            .append('text')
            .attr('x', textX)
            .attr('y', textY)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '7px')
            .attr('font-weight', 'bold')
            .attr('fill', 'black')
            .text(String(weight))
            .style('pointer-events', 'none');
        });
      }
    };

    // 繪製路線（支援 LineString / MultiLineString）
    routeFeatures.forEach((feature) => {
      if (!feature || !feature.geometry) return;
      const props = feature.properties || {};
      const tags = props.tags || {};
      const geom = feature.geometry;

      if (geom.type === 'LineString') {
        drawRoutePath(
          geom.coordinates,
          tags,
          props.name,
          props.color,
          props.station_weights,
          props.original_points,
          props.points
        );
      } else if (geom.type === 'MultiLineString') {
        geom.coordinates.forEach((coords) =>
          drawRoutePath(
            coords,
            tags,
            props.name,
            props.color,
            props.station_weights,
            props.original_points,
            props.points
          )
        );
      }
    });

    const gridDegKeyT3 = (gx, gy) => `${Math.round(Number(gx))},${Math.round(Number(gy))}`;
    let taipeiTest3ConnectDegreeMapTest3 = null;
    let segmentsForTest3ConnectDegreeT3 = normalizeFlatSegments;
    if (isTaipeiTest3I3OrJ3LayerTab(activeLayerTab.value)) {
      const h3Layer = visibleLayers.value.find((l) => l.layerId === 'taipei_h3');
      const h3Data = h3Layer?.spaceNetworkGridJsonData;
      if (Array.isArray(h3Data) && h3Data.length > 0) {
        try {
          segmentsForTest3ConnectDegreeT3 = normalizeSpaceNetworkDataToFlatSegments(h3Data);
        } catch {
          segmentsForTest3ConnectDegreeT3 = normalizeFlatSegments;
        }
      }
    }
    if (
      isNormalizeFormat &&
      isTaipeiTest3BcdeLayerTab(activeLayerTab.value) &&
      segmentsForTest3ConnectDegreeT3.length > 0
    ) {
      taipeiTest3ConnectDegreeMapTest3 = new Map();
      const bumpDeg = (k) =>
        taipeiTest3ConnectDegreeMapTest3.set(k, (taipeiTest3ConnectDegreeMapTest3.get(k) || 0) + 1);
      for (const seg of segmentsForTest3ConnectDegreeT3) {
        const pts = seg.points || [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const ax = Array.isArray(p0) ? Number(p0[0]) : Number(p0?.x ?? 0);
          const ay = Array.isArray(p0) ? Number(p0[1]) : Number(p0?.y ?? 0);
          const bx = Array.isArray(p1) ? Number(p1[0]) : Number(p1?.x ?? 0);
          const by = Array.isArray(p1) ? Number(p1[1]) : Number(p1?.y ?? 0);
          const k1 = gridDegKeyT3(ax, ay);
          const k2 = gridDegKeyT3(bx, by);
          if (k1 === k2) continue;
          bumpDeg(k1);
          bumpDeg(k2);
        }
      }
    }
    const taipeiTest3ConnectFillTest3 = (isConn, lx, ly) => {
      if (!isConn || !taipeiTest3ConnectDegreeMapTest3) return null;
      const deg = taipeiTest3ConnectDegreeMapTest3.get(gridDegKeyT3(lx, ly)) ?? 0;
      if (deg <= 1) return '#1565c0';
      return null;
    };

    // 繪製站點（根據 nodeType 區分 connect 和 line）
    stationFeatures.forEach((feature) => {
      const [x, y] = feature.geometry.coordinates;
      const props = feature.properties || {};
      const tags = props.tags || {};
      const nodeType = feature.nodeType || 'line'; // connect 或 line

      // 🎯 將座標轉換到網格中間（如果是整數，加 0.5）
      const centerX = toGridCenter(x);
      const centerY = toGridCenter(y);

      // 根據 nodeType 決定顏色和大小
      const isConnect = nodeType === 'connect';
      const fillColor =
        taipeiTest3ConnectFillTest3(isConnect, x, y) ?? (isConnect ? '#ff0000' : '#000000');
      const radius = isConnect ? 2.5 : 1.5; // connect 稍大一些

      const circleElement = contentGroup
        .append('circle')
        .attr('cx', xScale(centerX))
        .attr('cy', yScale(centerY))
        .attr('r', radius)
        .attr('fill', fillColor)
        .attr('stroke', fillColor)
        .attr('stroke-width', 1)
        .style('cursor', 'pointer');

      // 添加 hover 效果
      circleElement
        .on('mouseover', function (event) {
          // 高亮站點
          const highlightRadius = isConnect ? 4 : 3;
          d3.select(this).attr('r', highlightRadius).attr('stroke-width', 2);

          // 顯示 tooltip（包含座標和標籤）
          // 優先顯示網格座標
          let coordinateHtml;
          if (props.x_proj !== undefined && props.y_proj !== undefined) {
            // 1-2 圖層：使用壓縮後的網格座標
            coordinateHtml = `<strong>座標:</strong> (${props.x_proj}, ${props.y_proj})`;
          } else if (props.x_grid !== undefined && props.y_grid !== undefined) {
            // 1-1 圖層：使用 properties 中的網格座標
            coordinateHtml = `<strong>座標:</strong> (${props.x_grid}, ${props.y_grid})`;
          } else {
            // 其他圖層：顯示 geometry.coordinates
            coordinateHtml = `<strong>座標:</strong> (${x}, ${y})`;
          }

          // 構建 tooltip 內容
          let tooltipParts = [coordinateHtml];

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
  };

  /**
   * 🎨 統一繪製函數 (Unified Drawing Function)
   * 根據圖層類型選擇相應的繪製方法
   */
  const drawSchematic = () => {
    console.log(`[LayoutGridTab] drawSchematic 開始:`, {
      activeLayerTab: activeLayerTab.value,
      isMapLayer: isMapLayer(activeLayerTab.value),
      isGridSchematic: isGridSchematicLayer(activeLayerTab.value),
      hasMapGeoJsonData: !!mapGeoJsonData.value,
      mapGeoJsonDataType: mapGeoJsonData.value?.type,
    });
    // 🎯 優先檢查是否有地圖數據（mapGeoJsonData），如果有就直接繪製地圖
    if (mapGeoJsonData.value) {
      console.log(`[LayoutGridTab] 有 mapGeoJsonData，調用 drawMap`);
      drawMap();
    } else if (isMapLayer(activeLayerTab.value)) {
      console.log(`[LayoutGridTab] isMapLayer 為 true，調用 drawMap`);
      drawMap();
    } else if (isGridSchematicLayer(activeLayerTab.value)) {
      console.log(`[LayoutGridTab] 調用 drawGridSchematic`);
      drawGridSchematic();
    } else {
      console.log(`[LayoutGridTab] 調用 drawAdministrativeSchematic`);
      drawAdministrativeSchematic();
    }
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
    const dimensions = getDimensions();

    // 更新 dataStore 中的尺寸狀態（供 ControlTab 顯示）
    // 將 px 轉換為 pt（1 pt ≈ 1.333 px，在 96 DPI 的屏幕上）
    // 轉換公式：pt = px * 0.75
    const xPt = Math.round(dimensions.width * 0.75);
    const yPt = Math.round(dimensions.height * 0.75);
    dataStore.updateLayoutGridTabTest3Dimensions(xPt, yPt);

    drawSchematic();
  };

  /**
   * 🏃‍♂️ 在面板拖曳期間，用 rAF 逐幀檢查尺寸並重繪（避免只有拖曳結束才觸發）
   */
  const startResizeRafLoop = () => {
    if (resizeRafId) return;

    const tick = () => {
      resizeRafId = requestAnimationFrame(tick);
      const container = document.getElementById(getContainerId());
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0 && (w !== lastRafSize.w || h !== lastRafSize.h)) {
        lastRafSize = { w, h };
        resize();
      }
    };

    resizeRafId = requestAnimationFrame(tick);
  };

  const stopResizeRafLoop = () => {
    if (resizeRafId) {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = null;
    }
  };

  // 記錄上一次的圖層列表用於比較
  const previousLayers = ref([]);

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
        // 驗證新圖層是否存在於可見圖層中
        const layerExists = visibleLayers.value.some((l) => l.layerId === newLayerId);
        if (!layerExists) {
          console.warn(`[LayoutGridTab] 嘗試切換到不存在的圖層: ${newLayerId}`);
          return;
        }

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

  watch(
    () =>
      activeLayerTab.value && isTaipeiTest3BcdeLayerTab(activeLayerTab.value)
        ? dataStore.findLayerById(activeLayerTab.value)?.squareGridCellsTaipeiTest3
        : null,
    async () => {
      if (!activeLayerTab.value) return;
      await nextTick();
      drawSchematic();
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
        // ⚠️ 重要：drawMap / drawGridSchematic 內有「尺寸沒變就不重繪」的保護，
        // 但當資料改變（例如按鈕刪點/合併）時必須強制重繪，否則畫面和 hover/tooltip 會不同步。
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
   * 👀 監聽可見圖層變化，確保活動圖層始終有效
   * 當圖層被移除時，自動切換到有效的圖層或重置為 null
   */
  watch(
    () => visibleLayers.value.map((l) => l.layerId),
    async (newLayerIds) => {
      // 使用 nextTick 確保在 DOM 更新後執行，避免與 Vue 的 patch 過程衝突
      await nextTick();

      // 如果當前活動圖層不存在於可見圖層中，需要切換
      if (activeLayerTab.value && !newLayerIds.includes(activeLayerTab.value)) {
        // 清除當前狀態
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        gridData.value = null;
        nodeData.value = null;
        linkData.value = null;
        mapGeoJsonData.value = null;

        // 如果有其他可見圖層，切換到第一個
        if (newLayerIds.length > 0) {
          activeLayerTab.value = newLayerIds[0];
          emit('active-layer-change', activeLayerTab.value);
          // 載入新圖層數據
          await loadLayerData(activeLayerTab.value);
          await nextTick();
          drawSchematic();
        } else {
          // 沒有可見圖層時重置為 null
          activeLayerTab.value = null;
          emit('active-layer-change', null);
        }
      }
      // 如果沒有活動圖層但有可見圖層，自動選擇第一個
      else if (!activeLayerTab.value && newLayerIds.length > 0) {
        activeLayerTab.value = newLayerIds[0];
        emit('active-layer-change', activeLayerTab.value);
        // 載入新圖層數據
        await loadLayerData(activeLayerTab.value);
        await nextTick();
        drawSchematic();
      }
    },
    { flush: 'post' }
  );

  // ✅ 與 UpperView 的面板拖曳狀態對接：拖曳中即時重繪
  watch(
    () => props.isPanelDragging,
    (dragging) => {
      if (dragging) {
        // 重置快取尺寸，確保立刻開始重繪
        lastRafSize = { w: 0, h: 0 };
        startResizeRafLoop();
      } else {
        stopResizeRafLoop();
        // 拖曳結束後再保險重繪一次
        nextTick(() => resize());
      }
    },
    { immediate: true }
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
    window.removeEventListener('resize', resize);

    // 清理 ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    // 清理 rAF loop
    stopResizeRafLoop();
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
   * 🎨 LayoutGridTab 組件樣式 (LayoutGridTab Component Styles)
   *
   * 定義組件內部元素的樣式規則，使用 scoped 避免樣式污染
   * 主要樣式規則已在 common.css 中定義，此處僅包含組件特定調整
   */

  /* 📊 示意圖容器樣式 (Schematic Container Styles) */
  [id^='schematic-container-layout-grid'] {
    position: relative;
    overflow: hidden;
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  /* 🗺️ 地圖模式時強制白色背景 */
  [id^='schematic-container-layout-grid'] svg {
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  /* 🔍 縮放功能樣式 */
  [id^='schematic-container-layout-grid'] svg {
    cursor: grab;
  }

  [id^='schematic-container-layout-grid'] svg:active {
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
