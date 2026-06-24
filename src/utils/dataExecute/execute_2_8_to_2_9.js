// # @title Colab 2-9: 網格正規化
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 6 (緊湊化後) 的資料 (08_compact_layout_*.json)。
// 2. 執行「網格正規化 (Normalization)」：
//    - 收集所有出現過的 X 與 Y 座標。
//    - 建立排序映射表 (Sorted Mapping)：將稀疏的浮點數座標映射為連續整數 (0, 1, 2...)。
//    - 消除座標間的微小誤差與巨大間隙。
// 3. 修正：
//    - 支援 Colab 6/8 的 Flat List 結構 (解決 KeyError: 'segments')。
//    - 加入 IPython 圖片顯示功能。
// 4. 輸出：
//    - 座標為純整數的最終佈局資料。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 2. 基礎工具 (屬性與判定)
// ==========================================
/**
 * 判斷是否為真實車站
 * @param {Object} node - 節點屬性物件
 * @returns {boolean} 是否為真實車站
 */
// eslint-disable-next-line no-unused-vars
function isRealStation(node) {
  if (!node) return false;
  if (node.node_type === 'connect') return true;
  if (node.station_name) return true;
  if (node.tags?.station_name) return true;
  return false;
}

/**
 * 提取轉乘點編號
 * @param {Object} nodeProps - 節點屬性物件
 * @returns {string|null} 轉乘點編號
 */
// eslint-disable-next-line no-unused-vars
function getConnectId(nodeProps) {
  if (!nodeProps) return null;
  const val = nodeProps.connect_number;
  if (val) return String(val);
  return nodeProps.tags?.connect_number || null;
}

/**
 * 提取顏色
 * @param {Object} item - 項目物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getColorRobust(item) {
  const keys = ['color', 'colour'];
  const searchTargets = [
    item.way_properties?.tags || {},
    item.properties || {},
    item.properties?.tags || {},
    item,
    item.tags || {},
  ];
  for (const target of searchTargets) {
    if (!target || typeof target !== 'object') continue;
    for (const k of keys) {
      const val = target[k];
      if (val) return val;
    }
  }
  return '#555555';
}

// ==========================================
// 3. 幾何運算工具
// ==========================================
/**
 * 計算兩點距離
 * @param {Array<number>} p1 - 點1座標
 * @param {Array<number>} p2 - 點2座標
 * @returns {number} 距離
 */
function dist(p1, p2) {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}

/**
 * 在折線上均勻取樣 (用於輔助判斷網格密度)
 * @param {Array<Array<number>>} polyline - 折線點陣列
 * @param {number} totalCount - 總點數
 * @returns {Array<Array<number>>} 均勻分佈的點陣列
 */
function getEvenlyDistributedPoints(polyline, totalCount) {
  if (totalCount <= 0) return [];
  if (totalCount === 1) return [polyline[0]];

  // 計算總長與分段
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = dist(polyline[i], polyline[i + 1]);
    totalLength += d;
    segments.push([d, polyline[i], polyline[i + 1]]);
  }

  if (totalLength === 0) return [polyline[0]];

  const stepDist = totalLength / (totalCount - 1);
  const resultPoints = [polyline[0]];
  let currentDistTarget = stepDist;
  let coveredLen = 0;
  let segIdx = 0;

  for (let _ = 0; _ < totalCount - 1; _++) {
    while (segIdx < segments.length) {
      const [segLen, p1, p2] = segments[segIdx];
      if (coveredLen + segLen >= currentDistTarget - 1e-9) {
        const remainDist = currentDistTarget - coveredLen;
        const ratio = segLen > 0 ? remainDist / segLen : 0;
        const nx = p1[0] + (p2[0] - p1[0]) * ratio;
        const ny = p1[1] + (p2[1] - p1[1]) * ratio;
        resultPoints.push([nx, ny]);
        currentDistTarget += stepDist;
        break;
      } else {
        coveredLen += segLen;
        segIdx++;
      }
    }
  }

  if (resultPoints.length < totalCount) {
    resultPoints.push(polyline[polyline.length - 1]);
  } else {
    resultPoints[resultPoints.length - 1] = polyline[polyline.length - 1];
  }
  return resultPoints;
}

/**
 * [修正] 支援 Flat List 結構，提取所有座標點
 * @param {Array} flatData - 扁平資料陣列
 * @returns {Array<Array<number>>} 所有點座標陣列
 */
function extractAllPoints(flatData) {
  const points = [];
  for (const seg of flatData) {
    for (const p of seg.points) {
      points.push([p[0], p[1]]);
    }
  }
  return points;
}

/**
 * 計算點與點之間的最小距離 (推測原始網格大小)
 * @param {Array<Array<number>>} pointsNp - 點座標陣列
 * @returns {number} 最小距離
 */
function findNearestTwoPointsDist(pointsNp) {
  // 去重
  const uniquePoints = [];
  const seen = new Set();
  for (const pt of pointsNp) {
    const key = `${Math.round(pt[0] * 100) / 100},${Math.round(pt[1] * 100) / 100}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePoints.push(pt);
    }
  }

  if (uniquePoints.length < 2) return 100.0;

  let minDist = Infinity;
  let minP1 = null;
  let minP2 = null;

  // 計算所有點對的距離
  for (let i = 0; i < uniquePoints.length; i++) {
    for (let j = i + 1; j < uniquePoints.length; j++) {
      const d = dist(uniquePoints[i], uniquePoints[j]);
      if (d < minDist) {
        minDist = d;
        minP1 = uniquePoints[i];
        minP2 = uniquePoints[j];
      }
    }
  }

  if (minP1 && minP2) {
    const gridBase = Math.max(Math.abs(minP1[0] - minP2[0]), Math.abs(minP1[1] - minP2[1]));
    if (gridBase < 0.1) return 1.0;
    return gridBase;
  }

  return 1.0;
}

// ==========================================
// 4. 核心邏輯：全索引整數化 (Integer Collapsing)
// ==========================================
/**
 * 將所有座標映射到連續整數空間 (0, 1, 2...)
 * 消除空隙，實現 Grid Normalization。
 * @param {Array} flatData - 扁平資料陣列
 * @returns {Array} 整數化後的資料陣列
 */
function generateCollapsedDataStrict(flatData) {
  const newData = JSON.parse(JSON.stringify(flatData));
  const validXSet = new Set();
  const validYSet = new Set();

  // 1. 收集所有有效座標 (包含線段中間的採樣點)
  for (const seg of flatData) {
    const pts = seg.points;
    const origPts = seg.original_points || [];
    // 根據點的數量決定採樣密度，確保長線段中間也被考慮
    const count = origPts.length > 0 ? origPts.length : pts.length;

    const stationLocs = getEvenlyDistributedPoints(pts, count);
    for (const p of stationLocs) {
      validXSet.add(Math.round(p[0] * 100) / 100);
      validYSet.add(Math.round(p[1] * 100) / 100);
    }
  }

  // 2. 建立映射表 (Value -> Index)
  const sortedX = Array.from(validXSet).sort((a, b) => a - b);
  const sortedY = Array.from(validYSet).sort((a, b) => a - b);

  const mapX = {};
  const mapY = {};
  for (let i = 0; i < sortedX.length; i++) {
    mapX[sortedX[i]] = i;
  }
  for (let i = 0; i < sortedY.length; i++) {
    mapY[sortedY[i]] = i;
  }

  // 輔助函式：找最近的映射值 (容錯用)
  const getNewX = (val) => {
    val = Math.round(val * 100) / 100;
    if (val in mapX) return mapX[val];
    const nearest = sortedX.reduce((prev, curr) => (Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev));
    return mapX[nearest];
  };

  const getNewY = (val) => {
    val = Math.round(val * 100) / 100;
    if (val in mapY) return mapY[val];
    const nearest = sortedY.reduce((prev, curr) => (Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev));
    return mapY[nearest];
  };

  // 3. 執行轉換
  for (const seg of newData) {
    const newPoints = [];
    for (const p of seg.points) {
      const nx = getNewX(p[0]);
      const ny = getNewY(p[1]);
      newPoints.push([nx, ny]);
    }

    seg.points = newPoints;

    // 同步更新頭尾屬性
    if (seg.start_coord && seg.start_coord.length >= 2) {
      seg.start_coord = [getNewX(seg.start_coord[0]), getNewY(seg.start_coord[1])];
    }
    if (seg.end_coord && seg.end_coord.length >= 2) {
      seg.end_coord = [getNewX(seg.end_coord[0]), getNewY(seg.end_coord[1])];
    }
  }

  return newData;
}

// ==========================================
// 5. 繪圖與輔助函式
// ==========================================
/**
 * 計算繪圖邊界，確保網格對齊
 * @param {Array} flatData - 扁平資料陣列
 * @param {number} gridSize - 網格大小
 * @param {number} bufferGrids - 緩衝網格數
 * @returns {Array<number>} [minX, maxX, minY, maxY]
 */
// eslint-disable-next-line no-unused-vars
function getGridAlignedBounds(flatData, gridSize, bufferGrids = 1) {
  const allX = [];
  const allY = [];
  for (const seg of flatData) {
    for (const p of seg.points) {
      allX.push(p[0]);
      allY.push(p[1]);
    }
  }
  if (allX.length === 0) return [0, 10, 0, 10];

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const safeGrid = gridSize > 0.1 ? gridSize : 1.0;

  const boundMinX = Math.floor(minX / safeGrid) * safeGrid - bufferGrids * safeGrid;
  const boundMaxX = Math.ceil(maxX / safeGrid) * safeGrid + bufferGrids * safeGrid;
  const boundMinY = Math.floor(minY / safeGrid) * safeGrid - bufferGrids * safeGrid;
  const boundMaxY = Math.ceil(maxY / safeGrid) * safeGrid + bufferGrids * safeGrid;
  return [boundMinX, boundMaxX, boundMinY, boundMaxY];
}

/**
 * 繪製單張子圖
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} flatData - 扁平資料陣列
 * @param {string} title - 圖表標題
 * @param {number|null} gridSize - 網格大小
 * @param {boolean} isIntegerMode - 是否為整數模式
 */
// eslint-disable-next-line no-unused-vars
function drawSubplot(ax, flatData, title, gridSize = null, isIntegerMode = false) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] ${title} (Grid Size: ${gridSize}, Integer Mode: ${isIntegerMode})`);
}

/**
 * 繪製三圖合一 (Input -> Grid -> Output)
 * @param {Array} dataClean - 清理後的資料
 * @param {Array} dataCollapsed - 整數化後的資料
 * @param {number} gridSize - 網格大小
 * @param {string} filename - 檔案名稱
 */
// eslint-disable-next-line no-unused-vars
function saveCombinedPlot(dataClean, dataCollapsed, gridSize, filename) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] Combined Plot: Input -> Grid (${gridSize.toFixed(2)}) -> Output`);
  console.log(`[視覺化] 圖片已儲存: ${filename}`);
}

// ==========================================
// 6. 主程式執行
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_8_to_2_9(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_8Layer = dataStore.findLayerById('taipei_2_8');
  const taipei2_9Layer = dataStore.findLayerById('taipei_2_9');

  // ==========================================
  // 1. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 6 緊湊化後的檔案
  const inputJsonFilename = taipei2_8Layer ? 'taipei_2_8 (in-memory)' : 'taipei_2_8';
  // 輸出：Step 7 正規化後的檔案 (整數座標) (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_8 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_9 圖層`);
  console.log('='.repeat(60));

  if (!taipei2_8Layer || !taipei2_8Layer.spaceNetworkGridJsonData) {
    console.error(`❌ 錯誤: 找不到輸入檔 ${inputJsonFilename} (請先執行 Colab 8)`);
    throw new Error(`找不到輸入檔 ${inputJsonFilename} (請先執行 Colab 8)`);
  }

  try {
    console.log(`🚀 讀取檔案: ${inputJsonFilename}`);
    const dataInput = JSON.parse(JSON.stringify(taipei2_8Layer.spaceNetworkGridJsonData));

    const finalData = JSON.parse(JSON.stringify(dataInput));

    // 1. 計算原始網格基準 (用於繪製中間的檢查圖)
    const allPointsNp = extractAllPoints(finalData);
    const gridSizeCalculated = findNearestTwoPointsDist(allPointsNp);
    console.log(`📊 原始網格基準推測: ${gridSizeCalculated.toFixed(4)}`);

    // 2. 執行整數化 (Integer Collapsing)
    console.log('\n🔄 正在計算嚴格整數化佈局 (Grid Collapsing)...');
    const collapsedData = generateCollapsedDataStrict(finalData);

    // 3. 儲存結果
    console.log('\n🚀 儲存 JSON 檔案...');
    if (!taipei2_9Layer) {
      throw new Error('找不到 taipei_2_9 圖層');
    }

    taipei2_9Layer.spaceNetworkGridJsonData = collapsedData;
    console.log(`✅ 資料已傳給 taipei_2_9 圖層`);

    // 4. 繪圖驗證
    console.log('\n🚀 產生對照圖 (Input -> Grid -> Output)...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    saveCombinedPlot(finalData, collapsedData, gridSizeCalculated, 'dummy_path.png');

    // 自動開啟 taipei_2_9 圖層以便查看結果
    if (!taipei2_9Layer.visible) {
      taipei2_9Layer.visible = true;
      dataStore.saveLayerState('taipei_2_9', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      inputSegmentCount: finalData.length,
      outputSegmentCount: collapsedData.length,
      gridSize: parseFloat(gridSizeCalculated.toFixed(4)),
      totalPoints: allPointsNp.length,
    };

    taipei2_9Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
