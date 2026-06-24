// # @title Colab 2-6: 末端簡化
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 3 (路線整合後) 的資料 (05_merged_routes_*.json)。
// 2. 執行「末端簡化 (Loop Pruning)」：
//    - 偵測路線末端的「無效轉折」(通常是原始地圖的地理扭曲)。
//    - 找出連接主要路網的「直線段」作為保留幾何。
// 3. 執行「均勻分佈 (Redistribution)」：
//    - 收集該路段所有真實車站。
//    - 將車站均勻重新排列在保留的直線上 (Linear Interpolation)。
// 4. 輸出：
//    - 視覺上更整潔、且站點間距平均的示意地圖。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 2. 幾何運算工具 (Geometry Utils)
// ==========================================
/**
 * 計算兩點距離
 * @param {Array} p1 - 點1座標 (可能是 [x, y] 或 [x, y, props])
 * @param {Array} p2 - 點2座標 (可能是 [x, y] 或 [x, y, props])
 * @returns {number} 距離
 */
function dist(p1, p2) {
  // 提取座標部分（處理可能包含屬性的情況）
  const [x1, y1] = p1.slice(0, 2);
  const [x2, y2] = p2.slice(0, 2);
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

/**
 * 檢查三點是否共線 (判定直線用)
 * @param {Array} p1 - 點1 (可能是 [x, y] 或 [x, y, props])
 * @param {Array} p2 - 點2 (可能是 [x, y] 或 [x, y, props])
 * @param {Array} p3 - 點3 (可能是 [x, y] 或 [x, y, props])
 * @param {number} tolerance - 容差
 * @returns {boolean} 是否共線
 */
function isCollinear(p1, p2, p3, tolerance = 1e-5) {
  // 提取座標部分（處理可能包含屬性的情況）
  const [x1, y1] = p1.slice(0, 2);
  const [x2, y2] = p2.slice(0, 2);
  const [x3, y3] = p3.slice(0, 2);
  const v1 = [x2 - x1, y2 - y1];
  const v2 = [x3 - x2, y3 - y2];
  const crossProduct = v1[0] * v2[1] - v1[1] * v2[0];
  return Math.abs(crossProduct) < tolerance;
}

/**
 * 計算路徑總長度
 * @param {Array<Array<number>>} points - 點座標陣列
 * @returns {number} 總長度
 */
function getPathLength(points) {
  let total = 0.0;
  for (let i = 0; i < points.length - 1; i++) {
    total += dist(points[i], points[i + 1]);
  }
  return total;
}

/**
 * [線性插值核心] 找出路徑上距離起點 target_dist 處的座標。
 * @param {Array<Array<number>>} points - 路徑點陣列
 * @param {number} targetDist - 目標距離
 * @returns {Array<number>} 座標
 */
function getPointAtDistance(points, targetDist) {
  if (targetDist <= 0) return points[0];

  let currentDist = 0.0;
  for (let i = 0; i < points.length - 1; i++) {
    const segLen = dist(points[i], points[i + 1]);
    if (currentDist + segLen >= targetDist) {
      // 目標點在這段線段上，進行插值
      const ratio = (targetDist - currentDist) / segLen;
      const nx = points[i][0] + (points[i + 1][0] - points[i][0]) * ratio;
      const ny = points[i][1] + (points[i + 1][1] - points[i][1]) * ratio;
      return [nx, ny];
    }
    currentDist += segLen;
  }

  return points[points.length - 1];
}

/**
 * [重新取樣] 將路徑 points 重新取樣為 count 個等距的點。
 * 這是實現「均勻分佈」的關鍵。
 * @param {Array<Array<number>>} points - 原始路徑點陣列
 * @param {number} count - 目標點數
 * @returns {Array<Array<number>>} 重新取樣後的點陣列
 */
function resamplePath(points, count) {
  if (count < 2) return count === 1 ? [points[0]] : [];

  const totalLen = getPathLength(points);
  const step = totalLen / (count - 1);

  const newPoints = [];
  for (let i = 0; i < count; i++) {
    let d = step * i;
    // 修正浮點數誤差導致最後一點超出範圍
    if (i === count - 1) d = totalLen;
    const newPt = getPointAtDistance(points, d);
    newPoints.push(newPt);
  }

  return newPoints;
}

// ==========================================
// 3. 屬性處理工具 (Attribute Utils)
// ==========================================
/**
 * 判斷是否為有效車站 (黑點/紅點)
 * @param {Object} node - 節點屬性物件
 * @returns {boolean} 是否為有效車站
 */
function isRealStation(node) {
  if (!node) return false;
  if (node.node_type === 'connect') return true;
  if (node.station_name) return true;
  if (node.tags?.station_name) return true;
  return false;
}

/**
 * 提取顏色 (相容多種結構)
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

/**
 * 提取轉乘點編號
 * @param {Object} nodeProps - 節點屬性物件
 * @returns {string|null} 轉乘點編號
 */
function getConnectId(nodeProps) {
  if (!nodeProps) return null;
  const val = nodeProps.connect_number;
  if (val) return String(val);
  return nodeProps.tags?.connect_number || null;
}

/**
 * 防呆：確保 points 的頭尾有暫存屬性 (拓撲判斷用)
 * @param {Array} segmentList - 線段陣列
 */
function matchNodesToEndpoints(segmentList) {
  for (const seg of segmentList) {
    const pts = seg.points;
    const nodes = seg.nodes || [];
    if (!pts || !nodes) continue;
    // 暫時將屬性掛載到座標陣列上，方便後續處理
    if (pts[0].length === 2) pts[0] = [...pts[0], {}];
    if (pts[pts.length - 1].length === 2) pts[pts.length - 1] = [...pts[pts.length - 1], {}];

    if (getConnectId(nodes[0])) {
      if (typeof pts[0][2] === 'object') {
        Object.assign(pts[0][2], nodes[0]);
      }
    }
    if (getConnectId(nodes[nodes.length - 1])) {
      if (typeof pts[pts.length - 1][2] === 'object') {
        Object.assign(pts[pts.length - 1][2], nodes[nodes.length - 1]);
      }
    }
  }
}

/**
 * 清理函式：還原 points 為純 [x, y] 格式
 * @param {Array} segmentList - 線段陣列
 */
function cleanPointsFormat(segmentList) {
  for (const seg of segmentList) {
    const pts = seg.points;
    if (!pts) continue;
    seg.points = pts.map((p) => p.slice(0, 2));
  }
}

/**
 * 建立連接計數表，找出樞紐點 (Hubs)
 * @param {Array} segmentList - 線段陣列
 * @returns {Map} 連接計數表
 */
function buildConnectivityMap(segmentList) {
  const usageMap = new Map();
  for (const seg of segmentList) {
    const nodes = seg.nodes || [];
    if (!nodes.length) continue;
    const cidStart = getConnectId(nodes[0]);
    const cidEnd = getConnectId(nodes[nodes.length - 1]);
    if (cidStart) {
      usageMap.set(cidStart, (usageMap.get(cidStart) || 0) + 1);
    }
    if (cidEnd) {
      usageMap.set(cidEnd, (usageMap.get(cidEnd) || 0) + 1);
    }
  }
  return usageMap;
}

/**
 * 從起點開始找，直到直線結束的索引
 * @param {Array<Array<number>>} points - 點座標陣列
 * @returns {number} 索引
 */
function getStraightSegmentIndexFromStart(points) {
  if (points.length <= 2) return points.length - 1;
  let lastIdx = 1;
  for (let i = 2; i < points.length; i++) {
    if (isCollinear(points[lastIdx - 1], points[lastIdx], points[i])) {
      lastIdx = i;
    } else {
      break;
    }
  }
  return lastIdx;
}

/**
 * 從終點往回找，直到直線結束的索引
 * @param {Array<Array<number>>} points - 點座標陣列
 * @returns {number} 索引
 */
function getStraightSegmentIndexFromEnd(points) {
  if (points.length <= 2) return 0;
  let firstIdx = points.length - 2;
  for (let i = points.length - 3; i >= 0; i--) {
    if (isCollinear(points[firstIdx + 1], points[firstIdx], points[i])) {
      firstIdx = i;
    } else {
      break;
    }
  }
  return firstIdx;
}

// ==========================================
// 4. 核心邏輯：均勻分佈重組 (Global Redistribution)
// ==========================================
/**
 * 執行末端裁切與全路段均勻分佈
 * @param {Array} flatData - 扁平資料陣列
 * @returns {Array} 處理後的資料陣列
 */
function straightenDeadEnds(flatData) {
  console.log('🚀 正在執行末端裁切與全路段均勻分佈 (Global Redistribution)...');
  const processedData = JSON.parse(JSON.stringify(flatData));
  matchNodesToEndpoints(processedData);
  const connMap = buildConnectivityMap(processedData);

  let countPruned = 0;

  for (const seg of processedData) {
    const points = seg.points;
    const nodes = seg.nodes || [];

    if (points.length !== nodes.length) continue;
    if (points.length <= 2) continue;

    const startCid = getConnectId(nodes[0]);
    const endCid = getConnectId(nodes[nodes.length - 1]);

    const startCount = startCid ? connMap.get(startCid) || 0 : 1;
    const endCount = endCid ? connMap.get(endCid) || 0 : 1;

    // 標記是否需要進行縮減
    let needsPruning = false;
    let keptGeometry = []; // 這裡只存保留下來的直線幾何 (純座標)

    // Case A: 起點是樞紐(Hub)，終點是死路(Tail) -> 保留起點端的直線
    if (startCount > 1 && endCount <= 1) {
      const cutIdx = getStraightSegmentIndexFromStart(points);
      if (cutIdx < points.length - 1) {
        needsPruning = true;
        keptGeometry = points.slice(0, cutIdx + 1).map((p) => p.slice(0, 2));
      }
    }
    // Case B: 終點是樞紐(Hub)，起點是死路(Tail) -> 保留終點端的直線
    else if (endCount > 1 && startCount <= 1) {
      const cutIdx = getStraightSegmentIndexFromEnd(points);
      if (cutIdx > 0) {
        needsPruning = true;
        keptGeometry = points.slice(cutIdx).map((p) => p.slice(0, 2));
      }
    }

    // 如果發生了縮減，執行「全路段均勻分配」
    if (needsPruning) {
      // 1. 收集原始所有的有效車站 (按照原本順序)
      //    這樣即使幾何被切掉，車站資料(nodes)依然存在
      const validNodes = [];

      // 遍歷 nodes，只保留 (頭尾) 或 (真實車站)
      // 頭尾必須保留以維持線段結構，中間則只留黑點
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (i === 0 || i === nodes.length - 1 || isRealStation(node)) {
          validNodes.push(node);
        }
      }

      // 2. 計算新的等距座標
      const countStations = validNodes.length;

      // [關鍵] 使用 Resample 將 kept_geometry 分割成 count_stations 等分
      const newCoords = resamplePath(keptGeometry, countStations);

      // 3. 寫回資料
      // 將屬性與新座標一一對應
      seg.points = newCoords;
      seg.nodes = validNodes; // 替換為過濾後的車站列表

      countPruned++;
    }
  }

  cleanPointsFormat(processedData);
  console.log(`✂️  共優化並均勻重組了 ${countPruned} 條路線。`);
  return processedData;
}

// ==========================================
// 5. 繪圖函式 (Visualization)
// ==========================================
/**
 * 明確繪製節點
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} segmentsList - 線段陣列
 * @param {boolean} drawBlack - 是否繪製黑點
 * @param {boolean} drawRed - 是否繪製紅點
 */
// eslint-disable-next-line no-unused-vars
function drawNodesExplicitly(ax, segmentsList, drawBlack = true, drawRed = true) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] Draw Nodes: Black=${drawBlack}, Red=${drawRed}`);
}

/**
 * 繪製地圖 Step 6
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} flatData - 扁平資料陣列
 * @param {string} title - 圖表標題
 */
// eslint-disable-next-line no-unused-vars
function drawMapStep6(ax, flatData, title) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] ${title}`);
}

/**
 * 繪製對照圖
 * @param {Array} originalData - 原始資料
 * @param {Array} simplifiedData - 簡化後的資料
 */
// eslint-disable-next-line no-unused-vars
function plotComparison(originalData, simplifiedData) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log('[視覺化] Comparison: Before Pruning vs After');
}

// ==========================================
// 6. 主程式執行
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_5_to_2_6(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_5Layer = dataStore.findLayerById('taipei_2_5');
  const taipei2_6Layer = dataStore.findLayerById('taipei_2_6');

  // ==========================================
  // 1. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 3 整合後的檔案
  const inputJsonFilename = taipei2_5Layer ? 'taipei_2_5 (in-memory)' : 'taipei_2_5';
  // 輸出：Step 4 簡化後的檔案 (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_5 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_6 圖層`);
  console.log('='.repeat(60));

  if (!taipei2_5Layer || !taipei2_5Layer.spaceNetworkGridJsonData) {
    console.error(`❌ 錯誤: 找不到輸入檔 ${inputJsonFilename}`);
    console.error('   請確認 Colab 5 是否已執行成功。');
    throw new Error(`找不到輸入檔 ${inputJsonFilename}`);
  }

  try {
    // 1. 讀取資料
    const dataStep5 = JSON.parse(JSON.stringify(taipei2_5Layer.spaceNetworkGridJsonData));

    // 2. 執行簡化與重組
    const finalDataList = straightenDeadEnds(dataStep5);

    // 3. 存檔
    console.log('\n🚀 儲存 JSON 檔案...');
    if (!taipei2_6Layer) {
      throw new Error('找不到 taipei_2_6 圖層');
    }

    taipei2_6Layer.spaceNetworkGridJsonData = finalDataList;
    console.log(`✅ 資料已傳給 taipei_2_6 圖層`);

    // 4. 繪圖驗證
    console.log('\n🚀 產生對照圖 (Before vs After)...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    plotComparison(dataStep5, finalDataList);

    // 自動開啟 taipei_2_6 圖層以便查看結果
    if (!taipei2_6Layer.visible) {
      taipei2_6Layer.visible = true;
      dataStore.saveLayerState('taipei_2_6', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      inputSegmentCount: dataStep5.length,
      outputSegmentCount: finalDataList.length,
    };

    taipei2_6Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
