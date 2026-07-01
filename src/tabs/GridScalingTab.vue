<script setup>
  /**
   * 📊 GridScalingTab.vue - 網格縮放數據視覺化分頁組件
   *
   * 功能說明：
   * 1. 📑 圖層分頁導航 - 顯示所有可見圖層的標籤頁
   * 2. 📊 當前圖層資訊 - 顯示選中圖層的名稱和詳細信息
   * 3. 📈 圖層摘要資料 - 顯示總數量、行政區數量等統計信息
   * 4. 🎨 D3.js 圖表 - 使用 D3.js 繪製各種類型的圖表（網格示意圖、行政區示意圖）
   * 5. 🔄 自動切換功能 - 當新圖層開啟時自動切換到該圖層的分頁
   *
   * @component GridScalingTab
   * @version 1.0.0
   * @author Kevin Cheng
   */

  import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
  import { useDataStore } from '@/stores/dataStore.js';
  import * as d3 from 'd3';
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

  // ==================== 📊 示意圖繪製相關狀態 (Schematic Drawing State) ====================

  /** 📊 網格數據狀態 (Grid Data State) */
  const gridData = ref(null);
  const gridDimensions = ref({ x: 10, y: 10 });

  /**
   * ℹ️ GridScalingTab 僅專注於「網格縮放」視覺化
   * - 不再繪製行政區示意圖（node/link）
   * - 不再直接讀取 processedJsonData（改使用 layer.drawJsonData）
   */

  // ==================== 🎨 視覺化常數 (Visualization Constants) ====================

  /** 🎨 顏色配置 (Color Configuration) */
  const COLOR_CONFIG = {
    BACKGROUND: '#212121',
    GRID_LINE: '#666666',
    GRID_LINE_SECONDARY: '#333333',
    NODE_FILL: '#4CAF50',
    NODE_STROKE: '#2E7D32',
    TEXT_FILL: '#FFFFFF',
  };

  // ResizeObserver 實例
  let resizeObserver = null;

  /** 上次繪製所用的資料參考；資料變更（如「隨機產生」重新載入）時即使尺寸不變也需要重繪 */
  let lastDrawnGridData = null;

  /** 均勻網格路線／標記 hover 用 tooltip（懶建立、重複利用，避免每次重繪都新增 DOM） */
  let uniformGridTooltip = null;

  /**
   * 🏷️ 取得（或懶建立）均勻網格 hover tooltip 元素
   * @returns {Object} D3 selection
   */
  const getUniformGridTooltip = () => {
    if (!uniformGridTooltip) {
      d3.select('body').selectAll('.grid-scaling-uniform-grid-tooltip').remove();
      uniformGridTooltip = d3
        .select('body')
        .append('div')
        .attr('class', 'grid-scaling-uniform-grid-tooltip')
        .style('position', 'absolute')
        .style('padding', '8px 12px')
        .style('background-color', 'rgba(0, 0, 0, 0.85)')
        .style('color', '#FFFFFF')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .style('z-index', 1000);
    }
    return uniformGridTooltip;
  };

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

    // 立即清除 SVG 內容，避免重疊
    d3.select('#grid-scaling-container').selectAll('svg').remove();

    // 清除數據狀態
    gridData.value = null;

    // 設置新的活動圖層
    activeLayerTab.value = layerId;

    // 通知父層目前 UpperView 的作用圖層
    emit('active-layer-change', activeLayerTab.value);
  };

  /**
   * 📊 當前圖層摘要 (Current Layer Summary)
   */
  const currentLayerSummary = computed(() => {
    if (!activeLayerTab.value) {
      return null;
    }

    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);

    const result = layer ? layer.dashboardData || null : null;

    return result;
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
   * 🎨 判斷是否為網格示意圖圖層 (Check if Layer is Grid Schematic)
   * @param {string} layerId - 圖層 ID
   * @returns {boolean} 是否為網格示意圖圖層
   */
  const isGridSchematicLayer = (layerId) => {
    if (!layerId) return false;
    const layer = dataStore.findLayerById(layerId);
    return layer && layer.isGridSchematic === true;
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

      // 🎯 GridScalingTab 只使用 drawJsonData（由 store 從 processedJsonData 產生）
      if (targetLayer.drawJsonData && targetLayer.drawJsonData.type === 'grid') {
        gridData.value = targetLayer.drawJsonData;
        gridDimensions.value = {
          x: targetLayer.drawJsonData.gridX,
          y: targetLayer.drawJsonData.gridY,
        };
      } else {
        console.error('❌ 無法找到圖層數據:', {
          layerId: layerId,
          hasDrawJsonData: !!targetLayer.drawJsonData,
          drawJsonDataType: targetLayer.drawJsonData?.type,
          isLoaded: targetLayer.isLoaded,
        });
        throw new Error('GridScalingTab 只支援 type=grid 的 drawJsonData');
      }
    } catch (error) {
      console.error('❌ 無法載入圖層數據:', error.message);
    }
  };

  // ==================== 📏 容器尺寸和繪製函數 (Container Dimensions and Drawing Functions) ====================

  /**
   * 📏 獲取容器尺寸 (Get Container Dimensions)
   * @returns {Object} 包含 width 和 height 的尺寸物件
   */
  const getDimensions = () => {
    const container = document.getElementById('grid-scaling-container');

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

    // 檢查是否已存在 SVG，如果存在且尺寸相同「且資料未變」則不需要重繪
    // （資料變更時，例如「隨機產生」重新載入，即使容器尺寸不變也必須重繪）
    const existingSvg = d3.select('#grid-scaling-container').select('svg');
    if (existingSvg.size() > 0 && lastDrawnGridData === gridData.value) {
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

    lastDrawnGridData = gridData.value;

    // 清除之前的圖表
    d3.select('#grid-scaling-container').selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select('#grid-scaling-container')
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out');

    // 🎯 均勻網格：只平均切分繪製一個網格，不含數值/統計/隱藏列邏輯
    if (gridData.value.uniform) {
      drawUniformGridLines(svg, width, height, margin);

      if (activeLayerTab.value) {
        dataStore.updateComputedGridState(activeLayerTab.value, {
          visibleX: gridDimensions.value.x,
          visibleY: gridDimensions.value.y,
          cellWidth: width / (gridDimensions.value.x || 1),
          cellHeight: height / (gridDimensions.value.y || 1),
        });
      }
      return;
    }

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

    // 繪製網格線
    drawGridLines(
      svg,
      width,
      height,
      columnWidths,
      rowHeights,
      columnPositions,
      rowPositions,
      margin,
      hiddenColumnIndices,
      hiddenRowIndices
    );

    // 繪製網格節點
    drawGridNodes(
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
   * 📐 繪製均勻網格 (Draw Uniform Grid Lines)
   * 依 gridDimensions 平均切分寬高，只畫格線，不含數值或統計標籤
   * @param {Object} svg - D3 SVG 選擇器
   * @param {number} width - 繪圖區域寬度
   * @param {number} height - 繪圖區域高度
   * @param {Object} margin - 邊距配置
   */
  const drawUniformGridLines = (svg, width, height, margin) => {
    const gridX = gridDimensions.value.x || 1;
    const gridY = gridDimensions.value.y || 1;
    const cellWidth = width / gridX;
    const cellHeight = height / gridY;

    for (let i = 0; i <= gridX; i++) {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('x1', margin.left + i * cellWidth)
        .attr('y1', margin.top)
        .attr('x2', margin.left + i * cellWidth)
        .attr('y2', margin.top + height);
    }

    for (let j = 0; j <= gridY; j++) {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('x1', margin.left)
        .attr('y1', margin.top + j * cellHeight)
        .attr('x2', margin.left + width)
        .attr('y2', margin.top + j * cellHeight);
    }

    // 🚇 於網格上隨機產生的連續捷運風格路線（各自不同顏色，頂點皆為網格交點）
    const routes = gridData.value?.routes;
    if (Array.isArray(routes) && routes.length > 0) {
      const toPixel = (p) => [margin.left + p.x * cellWidth, margin.top + p.y * cellHeight];
      const markerInfo = computeUniformGridRouteMarkerInfo(routes);
      const tooltip = getUniformGridTooltip();

      const routeGroup = svg.append('g').attr('class', 'uniform-grid-routes');
      routes.forEach((route, routeIdx) => {
        const segments = splitUniformGridRouteAtCrossings(
          route.points,
          markerInfo.pointKey,
          markerInfo.routeCountByPoint
        );
        segments.forEach((segPoints, segIdx) => {
          const d = segPoints
            .map(toPixel)
            .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`)
            .join(' ');
          const from = segPoints[0];
          const to = segPoints[segPoints.length - 1];

          routeGroup
            .append('path')
            .attr('d', d)
            .attr('stroke', route.color)
            .attr('stroke-width', 4)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('fill', 'none')
            .style('cursor', 'pointer')
            .on('mouseover', function (event) {
              d3.select(this).attr('stroke-width', 6);
              tooltip
                .html(
                  `<strong>路線 ${routeIdx + 1}</strong><br>` +
                    `區段：第 ${segIdx + 1} / ${segments.length} 段（交叉點斷開）<br>` +
                    `站點數：${segPoints.length}<br>` +
                    `起點：(${from.x.toFixed(2)}, ${from.y.toFixed(2)})<br>` +
                    `終點：(${to.x.toFixed(2)}, ${to.y.toFixed(2)})`
                )
                .style('opacity', 1)
                .style('left', event.pageX + 12 + 'px')
                .style('top', event.pageY - 10 + 'px');
            })
            .on('mousemove', function (event) {
              tooltip
                .style('left', event.pageX + 12 + 'px')
                .style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              d3.select(this).attr('stroke-width', 4);
              tooltip.style('opacity', 0);
            });
        });
      });

      drawUniformGridRouteMarkers(svg, routes, toPixel, markerInfo, tooltip);
    }
  };

  /**
   * 📋 計算路線標記共用資訊 (Compute Shared Route Marker Info)
   * @param {{ points: { x: number, y: number }[] }[]} routes
   * @returns {{
   *   pointKey: (p: { x: number, y: number }) => string,
   *   pointByKey: Map<string, { x: number, y: number }>,
   *   routeCountByPoint: Map<string, number>,
   *   endpointKeys: Set<string>,
   * }}
   */
  const computeUniformGridRouteMarkerInfo = (routes) => {
    const pointKey = (p) => `${p.x},${p.y}`;
    const pointByKey = new Map();
    const routeCountByPoint = new Map();

    routes.forEach((route) => {
      const seenInRoute = new Set();
      route.points.forEach((p) => {
        const k = pointKey(p);
        pointByKey.set(k, p);
        if (seenInRoute.has(k)) return;
        seenInRoute.add(k);
        routeCountByPoint.set(k, (routeCountByPoint.get(k) || 0) + 1);
      });
    });

    const endpointKeys = new Set();
    routes.forEach((route) => {
      endpointKeys.add(pointKey(route.points[0]));
      endpointKeys.add(pointKey(route.points[route.points.length - 1]));
    });

    return { pointKey, pointByKey, routeCountByPoint, endpointKeys };
  };

  /**
   * ✂️ 依交叉點切分路線座標 (Split Route Points at Crossing Points)
   * 交叉點作為前後兩段的共同端點，讓畫出來的線條在視覺上仍完整銜接。
   * @param {{ x: number, y: number }[]} points
   * @param {(p: { x: number, y: number }) => string} pointKey
   * @param {Map<string, number>} routeCountByPoint
   * @returns {{ x: number, y: number }[][]}
   */
  const splitUniformGridRouteAtCrossings = (points, pointKey, routeCountByPoint) => {
    const segments = [];
    let current = [points[0]];
    for (let i = 1; i < points.length; i++) {
      current.push(points[i]);
      const isCrossing = (routeCountByPoint.get(pointKey(points[i])) || 0) > 1;
      if (isCrossing && i < points.length - 1) {
        segments.push(current);
        current = [points[i]];
      }
    }
    segments.push(current);
    return segments;
  };

  /**
   * ⚫🔴🔵 繪製路線車站（黑點）、交叉點（紅點）與端點（藍點） (Draw Route Station,
   * Crossing, and Endpoint Markers)
   * 交叉點：被 2 條以上路線共用的交叉點（如同轉乘站）；端點：各路線的起訖站；
   * 車站：路線上其餘一般交點中隨機標記的站點。若同一點同時符合多種身份，
   * 優先順序為交叉點（紅）＞端點（藍）＞車站（黑）。點與線皆支援 hover 顯示屬性。
   * @param {Object} svg - D3 SVG 選擇器
   * @param {{ color: string, points: { x: number, y: number }[], stations?: { x: number, y: number }[] }[]} routes
   * @param {(p: { x: number, y: number }) => [number, number]} toPixel
   * @param {ReturnType<typeof computeUniformGridRouteMarkerInfo>} markerInfo
   * @param {Object} tooltip - D3 selection
   */
  const drawUniformGridRouteMarkers = (svg, routes, toPixel, markerInfo, tooltip) => {
    const { pointKey, pointByKey, routeCountByPoint, endpointKeys } = markerInfo;

    const stationKeys = new Set();
    routes.forEach((route) => {
      (route.stations || []).forEach((p) => {
        const k = pointKey(p);
        pointByKey.set(k, p); // 車站可能落在網格線段中間，未必是既有頂點，需另外登記座標
        stationKeys.add(k);
      });
    });

    const markerGroup = svg.append('g').attr('class', 'uniform-grid-markers');

    const drawMarker = (key, color, label) => {
      const p = pointByKey.get(key);
      const [x, y] = toPixel(p);
      markerGroup
        .append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 4)
        .attr('fill', color)
        .attr('stroke', COLOR_CONFIG.TEXT_FILL)
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mouseover', function (event) {
          d3.select(this).attr('r', 6);
          tooltip
            .html(`<strong>${label}</strong><br>座標：(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`)
            .style('opacity', 1)
            .style('left', event.pageX + 12 + 'px')
            .style('top', event.pageY - 10 + 'px');
        })
        .on('mousemove', function (event) {
          tooltip.style('left', event.pageX + 12 + 'px').style('top', event.pageY - 10 + 'px');
        })
        .on('mouseout', function () {
          d3.select(this).attr('r', 4);
          tooltip.style('opacity', 0);
        });
    };

    // 車站（黑點）
    stationKeys.forEach((k) => drawMarker(k, '#000000', '車站'));

    // 端點（藍點）：若同一點同時是交叉點，讓交叉點（紅點）優先顯示
    endpointKeys.forEach((k) => {
      if ((routeCountByPoint.get(k) || 0) > 1) return;
      drawMarker(k, '#2196f3', '端點');
    });

    // 交叉點（紅點）
    routeCountByPoint.forEach((count, k) => {
      if (count > 1) drawMarker(k, '#f44336', `交叉點（${count} 條路線交會）`);
    });
  };

  /**
   * 📏 繪製網格線 (Draw Grid Lines)
   * @param {Object} svg - D3 SVG 選擇器
   * @param {number} width - 繪圖區域寬度
   * @param {number} height - 繪圖區域高度
   * @param {Array} columnWidths - 每列的寬度陣列
   * @param {Array} rowHeights - 每行的高度陣列
   * @param {Array} columnPositions - 每列的累積位置陣列
   * @param {Array} rowPositions - 每行的累積位置陣列
   * @param {Object} margin - 邊距配置
   * @param {Array} hiddenColumnIndices - 需要隱藏的列索引
   * @param {Array} hiddenRowIndices - 需要隱藏的行索引
   */
  const drawGridLines = (
    svg,
    width,
    height,
    columnWidths,
    rowHeights,
    columnPositions,
    rowPositions,
    margin,
    hiddenColumnIndices,
    hiddenRowIndices
  ) => {
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

    // 繪製垂直網格線
    visibleColumnPositions.forEach((xPos) => {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('x1', margin.left + xPos)
        .attr('y1', margin.top)
        .attr('x2', margin.left + xPos)
        .attr('y2', margin.top + height);
    });

    // 繪製水平網格線
    visibleRowPositions.forEach((yPos) => {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('y1', margin.top + yPos)
        .attr('x1', margin.left)
        .attr('y2', margin.top + yPos)
        .attr('x2', margin.left + width);
    });

    // 繪製次要網格線（網格中心線）
    let xPosCum = 0;
    for (let i = 0; i < columnWidths.length; i++) {
      if (hiddenColumnIndices.includes(i)) continue;
      const xCenter = xPosCum + columnWidths[i] / 2;

      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE_SECONDARY)
        .style('stroke-width', 1)
        .attr('x1', margin.left + xCenter)
        .attr('y1', margin.top)
        .attr('x2', margin.left + xCenter)
        .attr('y2', margin.top + height);

      xPosCum += columnWidths[i];
    }

    let yPosCum = 0;
    for (let i = 0; i < rowHeights.length; i++) {
      if (hiddenRowIndices.includes(i)) continue;
      const yCenter = yPosCum + rowHeights[i] / 2;

      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE_SECONDARY)
        .style('stroke-width', 1)
        .attr('x1', margin.left)
        .attr('y1', margin.top + yCenter)
        .attr('x2', margin.left + width)
        .attr('y2', margin.top + yCenter);

      yPosCum += rowHeights[i];
    }
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

      // 節點數字顏色固定為白色
      const nodeColor = '#FFFFFF';

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

    // 確保參數是陣列
    if (!Array.isArray(columnMaxValues) || !Array.isArray(rowMaxValues)) return;

    // 確保 hiddenColumnIndices 和 hiddenRowIndices 是陣列
    const safeHiddenColumnIndices = Array.isArray(hiddenColumnIndices) ? hiddenColumnIndices : [];
    const safeHiddenRowIndices = Array.isArray(hiddenRowIndices) ? hiddenRowIndices : [];

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
        if (!safeHiddenColumnIndices.includes(i)) {
          cumX += columnWidths[i];
          visibleColumnPositions.push(cumX);
        }
      }

      // 計算可見行的累積位置
      const visibleRowPositions = [0];
      let cumY = 0;
      for (let i = 0; i < rowHeights.length; i++) {
        if (!safeHiddenRowIndices.includes(i)) {
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
        if (!safeHiddenColumnIndices.includes(i)) {
          columnToVisibleIndex.set(i, visibleColIdx++);
        }
      }

      for (let i = 0; i < rowHeights.length; i++) {
        if (!safeHiddenRowIndices.includes(i)) {
          rowToVisibleIndex.set(i, visibleRowIdx++);
        }
      }

      // 繪製 X 排（垂直方向）統計標籤 - 只顯示最大值
      if (xRowStats && Array.isArray(xRowStats)) {
        xRowStats.forEach((xStat, index) => {
          // 當該列被隱藏時，不顯示此標籤
          if (safeHiddenColumnIndices.includes(index)) {
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
      if (yRowStats && Array.isArray(yRowStats)) {
        yRowStats.forEach((yStat, index) => {
          // 當該行被隱藏時，不顯示此標籤
          if (safeHiddenRowIndices.includes(index)) {
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
  /*
  const drawAdministrativeSchematic = () => {
    if (!nodeData.value) return;

    // 確保 nodeData.value 是數組
    if (!Array.isArray(nodeData.value)) {
      console.error('❌ nodeData.value 不是數組:', nodeData.value);
      return;
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

    // 檢查是否已存在 SVG，如果存在且尺寸相同「且資料未變」則不需要重繪
    // （資料變更時，例如「隨機產生」重新載入，即使容器尺寸不變也必須重繪）
    const existingSvg = d3.select('#grid-scaling-container').select('svg');
    if (existingSvg.size() > 0 && lastDrawnGridData === gridData.value) {
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

    lastDrawnGridData = gridData.value;

    // 清除之前的圖表
    d3.select('#grid-scaling-container').selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select('#grid-scaling-container')
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out'); // 添加平滑過渡效果

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

    // 繪製主要網格線
    for (let i = 0; i <= xMax; i++) {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('x1', x(i))
        .attr('y1', margin.top)
        .attr('x2', x(i))
        .attr('y2', margin.top + actualHeight);
    }

    for (let i = 0; i <= yMax; i++) {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('x1', margin.left)
        .attr('y1', y(i))
        .attr('x2', margin.left + actualWidth)
        .attr('y2', y(i));
    }

    // 繪製次要網格線
    for (let i = 0; i < xMax; i++) {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE_SECONDARY)
        .style('stroke-width', 1)
        .attr('x1', (x(i) + x(i + 1)) / 2)
        .attr('y1', margin.top)
        .attr('x2', (x(i) + x(i + 1)) / 2)
        .attr('y2', margin.top + actualHeight);
    }

    for (let i = 0; i < yMax; i++) {
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE_SECONDARY)
        .style('stroke-width', 1)
        .attr('x1', margin.left)
        .attr('y1', (y(i) + y(i + 1)) / 2)
        .attr('x2', margin.left + actualWidth)
        .attr('y2', (y(i) + y(i + 1)) / 2);
    }

    // 創建線條生成器
    const lineGenerator = d3
      .line()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveNatural);

    // 繪製每個路徑的節點連接
    nodeData.value.forEach((path) => {
      if (!path || !path.nodes || !Array.isArray(path.nodes)) return;
      path.nodes.forEach((node) => {
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

            svg
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

            svg
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

            svg
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

            svg
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
          svg
            .append('path')
            .attr('d', dString)
            .attr('stroke', path.color)
            .attr('fill', 'none')
            .attr('stroke-width', 6);
        }
      });
    });

    // 繪製節點數值標籤
    if (linkData.value) {
      // 獲取當前圖層的 drawJsonData（暫時保留以備將來使用）
      // const currentLayer = dataStore.findLayerById(activeLayerTab.value);
      // const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;

      const allLinks = linkData.value.flatMap((line) =>
        line.nodes.map((node) => ({
          ...node,
        }))
      );

      allLinks.forEach((node) => {
        // 節點數字顏色固定為白色
        const nodeColor = '#FFFFFF';

        svg
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
  */

  /**
   * 🎨 統一繪製函數 (Unified Drawing Function)
   * 本分頁僅繪製網格縮放
   */
  const drawSchematic = () => {
    drawGridSchematic();
  };

  /**
   * 📏 調整尺寸 (Resize)
   * 響應容器尺寸變化，重新繪製示意圖
   */
  const resize = () => {
    // 確保容器存在且可見
    const container = document.getElementById('grid-scaling-container');
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
        // 確保 SVG 內容已清除（雙重保險）
        d3.select('#grid-scaling-container').selectAll('svg').remove();

        // 清除舊數據（雙重保險）
        gridData.value = null;

        // 載入新圖層數據

        await loadLayerData(newLayerId);

        // 等待 DOM 更新後繪製
        await nextTick();

        drawSchematic();
      }
    }
  );

  /**
   * 👀 監聽當前圖層的 drawJsonData 變化
   * 當圖層數據載入完成時，自動載入並繪製示意圖
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      return layer ? layer.drawJsonData : null;
    },
    async (newDrawData) => {
      if (newDrawData && activeLayerTab.value) {
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
   * 🚀 組件掛載事件 (Component Mounted Event)
   */
  onMounted(async () => {
    // 初始化第一個可見圖層為作用中分頁
    if (visibleLayers.value.length > 0 && !activeLayerTab.value) {
      const firstGridLayer =
        visibleLayers.value.find(
          (l) => isGridSchematicLayer(l.layerId) || l.drawJsonData?.type === 'grid'
        ) || visibleLayers.value[0];
      activeLayerTab.value = firstGridLayer.layerId;

      // 載入初始數據
      await loadLayerData(activeLayerTab.value);
      await nextTick();
      drawSchematic();

      emit('active-layer-change', activeLayerTab.value);
    }

    // 監聽窗口大小變化
    window.addEventListener('resize', resize);

    // 監聽容器尺寸變化
    const container = document.getElementById('grid-scaling-container');
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

    // 清理均勻網格 hover tooltip
    d3.select('body').selectAll('.grid-scaling-uniform-grid-tooltip').remove();
    uniformGridTooltip = null;
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
              id="grid-scaling-container"
              class="w-100 h-100"
              style="min-height: 0; overflow: hidden"
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
   * 🎨 GridScalingTab 組件樣式 (GridScalingTab Component Styles)
   *
   * 定義組件內部元素的樣式規則，使用 scoped 避免樣式污染
   * 主要樣式規則已在 common.css 中定義，此處僅包含組件特定調整
   */

  /* 📊 示意圖容器樣式 (Schematic Container Styles) */
  #grid-scaling-container {
    position: relative;
    overflow: hidden;
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
