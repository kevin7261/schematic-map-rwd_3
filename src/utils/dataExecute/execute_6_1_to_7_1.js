// # @title Colab 7-1: 縮放地圖
// ==============================================================================
// 📝 程式說明：
// 1. [Input] 讀取 Step 6-2 (2_centered_*.json)。
// 2. [Debug] 強制印出讀取到的最大權重，確認資料是否正常。
// 3. [Feature] 指數網格：Cell Width = 2 ^ int(Weight)。
//    - 權重 0 -> 寬 1
//    - 權重 3 -> 寬 8
//    - 權重 5 -> 寬 32
// ==============================================================================
/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';

// --- 參數設定 ---
const MAX_EXPONENT_CAP = 8;

// ==========================================
// 1. 基礎幾何與輔助函式
// ==========================================
/**
 * 取得顏色
 * @param {Object} obj - 物件
 * @returns {string} 顏色字串
 */
function getColor(obj) {
  if (!obj) return '#555555';
  if (typeof obj !== 'object') return '#555555';
  if (obj.colour) return obj.colour;
  if (obj.color) return obj.color;
  const tags = obj.tags || obj.way_properties?.tags || {};
  if (tags.colour) return tags.colour;
  if (tags.color) return tags.color;
  return '#555555';
}

/**
 * 取得邊界
 * @param {Object|Array} dataInput - 資料輸入
 * @param {number} buffer - 緩衝區大小
 * @returns {Array<number>} [minX, maxX, minY, maxY]
 */
function getBounds(dataInput, buffer = 2) {
  const allX = [];
  const allY = [];
  if (dataInput && typeof dataInput === 'object' && 'nodes' in dataInput) {
    for (const n of dataInput.nodes || []) {
      if (n.is_real_station !== false) {
        allX.push(n.x);
        allY.push(n.y);
      }
    }
  }
  if (allX.length === 0) {
    const routes = dataInput.routes || (Array.isArray(dataInput) ? dataInput : []);
    for (const r of routes) {
      for (const s of r.segments || []) {
        for (const p of s.points || []) {
          allX.push(p[0]);
          allY.push(p[1]);
        }
      }
    }
  }
  if (allX.length === 0) return [0, 10, 0, 10];
  return [Math.min(...allX) - buffer, Math.max(...allX) + buffer, Math.min(...allY) - buffer, Math.max(...allY) + buffer];
}

// ==========================================
// 2. 核心：計算邊緣極值 (加強偵錯版)
// ==========================================
/**
 * 計算每一行與每一列的最大權重 (加強偵錯版)
 * @param {Object|Array} dataInput - 資料輸入
 * @returns {Object} {rowMaxValues, colMaxValues}
 */
function calculateMarginalMax(dataInput) {
  const rowMaxValues = {};
  const colMaxValues = {};

  // 統計用
  const weightCounter = new Map();
  let totalSegmentsWithWeights = 0;

  /**
   * 更新最大值
   * @param {Object} dic - 字典
   * @param {number} idx - 索引
   * @param {number} val - 值
   */
  function updateMax(dic, idx, val) {
    dic[idx] = Math.max(dic[idx] || 0, val);
  }

  const routes = dataInput.routes || (Array.isArray(dataInput) ? dataInput : []);

  for (const route of routes) {
    for (const seg of route.segments || []) {
      const pts = seg.points || [];
      if (pts.length < 2) continue;

      const stationWeights = seg.station_weights || [];
      if (stationWeights.length > 0) totalSegmentsWithWeights++;

      for (const wInfo of stationWeights) {
        const sIdx = wInfo.start_idx;
        const eIdx = wInfo.end_idx;
        // [Fix] 強制轉 int，防止字串比較錯誤
        let w;
        try {
          w = parseInt(wInfo.weight, 10);
          if (isNaN(w)) w = 0;
        } catch {
          w = 0;
        }

        weightCounter.set(w, (weightCounter.get(w) || 0) + 1);

        if (sIdx >= pts.length || eIdx >= pts.length) continue;

        const subPath = pts.slice(sIdx, eIdx + 1);
        if (subPath.length < 2) continue;

        for (let i = 0; i < subPath.length - 1; i++) {
          const p1 = subPath[i];
          const p2 = subPath[i + 1];
          const xStart = Math.min(p1[0], p2[0]);
          const xEnd = Math.max(p1[0], p2[0]);
          const yStart = Math.min(p1[1], p2[1]);
          const yEnd = Math.max(p1[1], p2[1]);

          const epsilon = 0.001;
          for (let x = Math.ceil(xStart - epsilon); x <= Math.floor(xEnd + epsilon); x++) {
            updateMax(colMaxValues, x, w);
          }
          for (let y = Math.ceil(yStart - epsilon); y <= Math.floor(yEnd + epsilon); y++) {
            updateMax(rowMaxValues, y, w);
          }
        }
      }
    }
  }

  // --- DEBUG INFO ---
  console.log('-'.repeat(50));
  console.log('🔍 [DEBUG] 權重資料診斷報告');
  console.log(`   - 含有權重資料的線段數: ${totalSegmentsWithWeights}`);
  const weightCounterObj = {};
  for (const [w, count] of weightCounter.entries()) {
    weightCounterObj[w] = count;
  }
  console.log(`   - 權重數值分佈: ${JSON.stringify(weightCounterObj)}`);

  if (Object.keys(rowMaxValues).length === 0) {
    console.log('❌ 警告：沒有計算到任何行權重 (Row Max 為空)！');
  } else {
    const maxR = Math.max(...Object.values(rowMaxValues));
    console.log(`   - Row Max 最大值: ${maxR} (預期寬度: ${2 ** Math.min(maxR, MAX_EXPONENT_CAP)})`);
  }

  if (Object.keys(colMaxValues).length === 0) {
    console.log('❌ 警告：沒有計算到任何列權重 (Col Max 為空)！');
  } else {
    const maxC = Math.max(...Object.values(colMaxValues));
    console.log(`   - Col Max 最大值: ${maxC} (預期寬度: ${2 ** Math.min(maxC, MAX_EXPONENT_CAP)})`);
  }
  console.log('-'.repeat(50));

  return { rowMaxValues, colMaxValues };
}

// ==========================================
// 3. 變動網格計算
// ==========================================
/**
 * 取得變動網格映射
 * @param {Object} rowMaxs - 行最大值
 * @param {Object} colMaxs - 列最大值
 * @param {Array<number>} rawBounds - 原始邊界 [minX, maxX, minY, maxY]
 * @returns {Object} {xBoundaries, yBoundaries, newBounds}
 */
function getVariableGridMappings(rowMaxs, colMaxs, rawBounds) {
  const [rawMinX, rawMaxX, rawMinY, rawMaxY] = rawBounds;

  // X 軸
  const xBoundaries = {};
  let currentNewX = 0.0;
  const startX = Math.floor(rawMinX);
  const endX = Math.ceil(rawMaxX);

  for (let xIdx = startX; xIdx <= endX; xIdx++) {
    xBoundaries[xIdx] = currentNewX;
    const val = colMaxs[xIdx] || 0;
    const effectiveVal = Math.min(val, MAX_EXPONENT_CAP);
    // [Formula] 2 ^ weight
    const cellWidth = Math.pow(2, effectiveVal);
    currentNewX += cellWidth;
  }
  xBoundaries[endX + 1] = currentNewX;
  const newMaxX = currentNewX;

  // Y 軸
  const yBoundaries = {};
  let currentNewY = 0.0;
  const startY = Math.floor(rawMinY);
  const endY = Math.ceil(rawMaxY);

  for (let yIdx = startY; yIdx <= endY; yIdx++) {
    yBoundaries[yIdx] = currentNewY;
    const val = rowMaxs[yIdx] || 0;
    const effectiveVal = Math.min(val, MAX_EXPONENT_CAP);
    // [Formula] 2 ^ weight
    const cellHeight = Math.pow(2, effectiveVal);
    currentNewY += cellHeight;
  }
  yBoundaries[endY + 1] = currentNewY;
  const newMaxY = currentNewY;

  return { xBoundaries, yBoundaries, newBounds: [0, newMaxX, 0, newMaxY] };
}

/**
 * 將原始整數網格座標轉換為變動網格座標
 * @param {number} x - X 座標
 * @param {number} y - Y 座標
 * @param {Object} xBounds - X 軸邊界映射
 * @param {Object} yBounds - Y 軸邊界映射
 * @returns {Array<number>} [newX, newY]
 */
function transformPoint(x, y, xBounds, yBounds) {
  // X transform
  const xIdx = Math.floor(x);
  const xRatio = x - xIdx;

  /**
   * 取得 X 邊界值
   * @param {number} idx - 索引
   * @returns {number} 邊界值
   */
  function getBx(idx) {
    if (idx in xBounds) return xBounds[idx];
    const sKeys = Object.keys(xBounds)
      .map(Number)
      .sort((a, b) => a - b);
    if (sKeys.length === 0) return idx;
    if (idx < sKeys[0]) {
      return xBounds[sKeys[0]] - (sKeys[0] - idx);
    }
    return xBounds[sKeys[sKeys.length - 1]] + (idx - sKeys[sKeys.length - 1]);
  }

  const nx = getBx(xIdx) + xRatio * (getBx(xIdx + 1) - getBx(xIdx));

  // Y transform
  const yIdx = Math.floor(y);
  const yRatio = y - yIdx;

  /**
   * 取得 Y 邊界值
   * @param {number} idx - 索引
   * @returns {number} 邊界值
   */
  function getBy(idx) {
    if (idx in yBounds) return yBounds[idx];
    const sKeys = Object.keys(yBounds)
      .map(Number)
      .sort((a, b) => a - b);
    if (sKeys.length === 0) return idx;
    if (idx < sKeys[0]) {
      return yBounds[sKeys[0]] - (sKeys[0] - idx);
    }
    return yBounds[sKeys[sKeys.length - 1]] + (idx - sKeys[sKeys.length - 1]);
  }

  const ny = getBy(yIdx) + yRatio * (getBy(yIdx + 1) - getBy(yIdx));
  return [nx, ny];
}

// ==========================================
// 4. 繪圖核心
// ==========================================
/**
 * 通用繪圖層，可繪製均勻或變形網格。
 * 若傳入 x_bounds, y_bounds 則進行座標變換。
 * (在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理)
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Object|Array} dataInput - 資料輸入
 * @param {Object} xBounds - X 軸邊界映射 (可選)
 * @param {Object} yBounds - Y 軸邊界映射 (可選)
 */
// eslint-disable-next-line no-unused-vars
function drawMapLayer(ax, dataInput, xBounds = null, yBounds = null) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  // 繪圖邏輯：
  // 1. Routes - 繪製路線
  // 2. Weights - 繪製權重（白底方框黑字）
  // 3. Nodes - 繪製站點（嚴格過濾，只畫真實車站）
  const isVariable = xBounds !== null && yBounds !== null;
  console.log(`[視覺化] Draw Map Layer (${isVariable ? 'Variable' : 'Uniform'} Grid)`);
}

// ==========================================
// 5. 畫布設置與執行
// ==========================================
/**
 * 繪製對比圖 (在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理)
 * @param {Object|Array} dataInput - 資料輸入
 * @param {string} outputPath - 輸出路徑 (可選)
 */
// eslint-disable-next-line no-unused-vars
function drawComparison(dataInput, outputPath) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  // 繪圖邏輯：
  // 1. 計算邊緣極值
  // 2. 計算變動網格映射
  // 3. 繪製左圖：Uniform Grid (Original)
  //    - 格線與刻度
  //    - 標註權重
  // 4. 繪製右圖：Exponential Grid (Width = 2^Weight)
  //    - 變形格線與刻度
  //    - 標註權重
  console.log('[視覺化] Draw Comparison (Uniform vs Exponential Grid)');
}

// ==========================================
// 6. 主程式
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_6_1_to_7_1(_jsonData) {
  const dataStore = useDataStore();
  const taipei6_1Layer = dataStore.findLayerById('taipei_6_1');
  const taipei7_1Layer = dataStore.findLayerById('taipei_7_1');

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_6_1 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_7_1 圖層`);
  console.log('='.repeat(60));

  if (!taipei6_1Layer || !taipei6_1Layer.spaceNetworkGridJsonData) {
    console.error(`❌ 錯誤: 找不到輸入檔案 taipei_6_1`);
    throw new Error(`找不到輸入檔案 taipei_6_1`);
  }

  try {
    console.log(`📂 讀取資料: 從 taipei_6_1 圖層`);
    const rawData = JSON.parse(JSON.stringify(taipei6_1Layer.spaceNetworkGridJsonData));

    // 確保資料格式 (可能是 routes 結構或直接陣列)
    const isInputArray = Array.isArray(rawData);
    let data = rawData;
    if (isInputArray) {
      // 如果是陣列格式，內部處理時轉換為 routes 結構
      data = { routes: rawData };
    } else if (!data.routes && Array.isArray(data)) {
      data = { routes: data };
    }

    console.log('🚀 繪製對比圖...');
    const { rowMaxValues, colMaxValues } = calculateMarginalMax(data);
    const rowMaxs = rowMaxValues;
    const colMaxs = colMaxValues;

    const rawBounds = getBounds(data);
    const { xBoundaries, yBoundaries, newBounds } = getVariableGridMappings(rowMaxs, colMaxs, rawBounds);

    // 計算網格長寬
    const gridWidth = newBounds[1] - newBounds[0];
    const gridHeight = newBounds[3] - newBounds[2];

    // 轉換座標到新網格（保持原始結構）
    const transformedData = JSON.parse(JSON.stringify(rawData));

    // 處理 routes（無論是陣列還是物件中的 routes）
    const routesToProcess = isInputArray ? transformedData : transformedData.routes || [];
    for (const route of routesToProcess) {
      for (const seg of route.segments || []) {
        // 轉換 points
        const newPoints = [];
        for (const p of seg.points || []) {
          const [newX, newY] = transformPoint(p[0], p[1], xBoundaries, yBoundaries);
          newPoints.push([newX, newY, ...(Array.isArray(p) && p.length > 2 ? p.slice(2) : [])]);
        }
        seg.points = newPoints;
      }
    }
    // 轉換 nodes 座標 (如果存在)
    if (transformedData.nodes && Array.isArray(transformedData.nodes)) {
      for (const node of transformedData.nodes) {
        if (node.x !== undefined && node.y !== undefined) {
          const [newX, newY] = transformPoint(node.x, node.y, xBoundaries, yBoundaries);
          node.x = newX;
          node.y = newY;
        }
      }
    }

    // 將網格長寬添加到資料中
    if (isInputArray) {
      // 如果是陣列，添加 meta 物件
      transformedData.meta = {
        ...(transformedData.meta || {}),
        gridWidth: gridWidth,
        gridHeight: gridHeight,
      };
    } else {
      // 如果是物件，添加或更新 meta
      if (!transformedData.meta) {
        transformedData.meta = {};
      }
      transformedData.meta.gridWidth = gridWidth;
      transformedData.meta.gridHeight = gridHeight;
    }

    // 繪製對比圖 (由前端 d3jsmap 組件處理)
    drawComparison(data, null);

    // 儲存檔案
    if (!taipei7_1Layer) {
      throw new Error('找不到 taipei_7_1 圖層');
    }

    // 確保每個 route 都有 original_props（用於顏色）
    for (const route of routesToProcess) {
      if (!route.original_props) {
        route.original_props = {};
      }
      const routeColor = getColor(route.original_props);
      if (routeColor !== '#555555') {
        route.original_props.colour = routeColor;
      }
    }

    // 輸出時保持原始結構（如果輸入是陣列，輸出也是陣列；如果輸入是物件，輸出也是物件）
    taipei7_1Layer.spaceNetworkGridJsonData = transformedData;
    taipei7_1Layer.layoutGridJsonData = transformedData;
    console.log(`✅ 對比圖已處理 (由前端 d3jsmap 組件顯示)`);
    console.log(`✅ 網格尺寸: ${gridWidth.toFixed(2)} x ${gridHeight.toFixed(2)}`);

    // 產生摘要並存到 dashboardData
    const routeCount = isInputArray ? transformedData.length : transformedData.routes?.length || 0;
    const dashboardData = {
      routeCount: routeCount,
      gridWidth: gridWidth,
      gridHeight: gridHeight,
      rowMaxCount: Object.keys(rowMaxs).length,
      colMaxCount: Object.keys(colMaxs).length,
      maxExponentCap: MAX_EXPONENT_CAP,
    };

    taipei7_1Layer.dashboardData = dashboardData;

    // 自動開啟 taipei_7_1 圖層以便查看結果
    if (!taipei7_1Layer.visible) {
      taipei7_1Layer.visible = true;
      dataStore.saveLayerState('taipei_7_1', { visible: true });
    }
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
