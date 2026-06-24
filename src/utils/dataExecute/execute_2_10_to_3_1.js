// # @title Colab 3-1: 區分影響結構部分
// Description:
// 1. 讀取 Colab 10 的輸出 (10_sequence_check)。
// 2. 執行拓樸分析，判斷路網結構：骨幹(Core/Red) vs 分支(Branch/Blue)。
// 3. 繪製 Before/After 比較圖 (加入防重疊機制，確保站點/文字只畫一次)。
// Input: step02/10_sequence_check_{project_name}.json
// Output: step03/1_structure_tagged_{project_name}.json, step03/1_structure_compare_{project_name}.png

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 2. 資料迭代與輔助函式
// ==========================================
/**
 * 統一迭代 Segments (支援 Grouped 或 Flat 格式)
 * @param {Array} dataList - 資料列表
 * @yields {Object} 線段物件
 */
function* iterSegments(dataList) {
  if (!dataList || dataList.length === 0) return;
  const isGrouped = dataList[0] && typeof dataList[0] === 'object' && 'segments' in dataList[0];
  if (isGrouped) {
    for (const route of dataList) {
      for (const seg of route.segments || []) {
        yield seg;
      }
    }
  } else {
    for (const seg of dataList) {
      yield seg;
    }
  }
}

/**
 * 取得原始路線顏色
 * @param {Object} seg - 線段物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getOriginalColor(seg) {
  let p = seg.way_properties?.tags || {};
  if (!p || Object.keys(p).length === 0) {
    p = seg.properties || {};
  }
  return p.colour || p.color || '#555555';
}

/**
 * 取得邊界
 * @param {Array} dataList - 資料列表
 * @param {number} buffer - 緩衝區大小
 * @returns {Array<number>} [minX, maxX, minY, maxY]
 */
// eslint-disable-next-line no-unused-vars
function getBounds(dataList, buffer = 2) {
  const allX = [];
  const allY = [];
  for (const seg of iterSegments(dataList)) {
    for (const p of seg.points || []) {
      allX.push(p[0]);
      allY.push(p[1]);
    }
  }
  if (allX.length === 0) return [0, 10, 0, 10];
  return [Math.min(...allX) - buffer, Math.max(...allX) + buffer, Math.min(...allY) - buffer, Math.max(...allY) + buffer];
}

// ==========================================
// 3. 核心演算法：結構屬性分析 (Core vs Branch)
// ==========================================
/**
 * 建立鄰接表
 * @param {Array} dataList - 資料列表
 * @returns {Map} 鄰接表
 */
function buildAdjacency(dataList) {
  const adj = new Map();
  const toKey = (pt) => [Math.round(pt[0] * 10000) / 10000, Math.round(pt[1] * 10000) / 10000];
  for (const seg of iterSegments(dataList)) {
    const pts = seg.points || [];
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const u = toKey(pts[i]);
      const v = toKey(pts[i + 1]);
      const uStr = JSON.stringify(u);
      const vStr = JSON.stringify(v);
      if (uStr !== vStr) {
        if (!adj.has(uStr)) adj.set(uStr, new Set());
        if (!adj.has(vStr)) adj.set(vStr, new Set());
        adj.get(uStr).add(vStr);
        adj.get(vStr).add(uStr);
      }
    }
  }
  return adj;
}

/**
 * 分析線段結構屬性
 * @param {Object} segment - 線段物件
 * @param {Map} adj - 鄰接表
 * @returns {string} 結構類型 ('core' 或 'branch')
 */
function analyzeSegmentStructure(segment, adj) {
  const pts = segment.points || [];
  if (pts.length < 2) return 'unknown';
  const toKey = (pt) => [Math.round(pt[0] * 10000) / 10000, Math.round(pt[1] * 10000) / 10000];

  const pStart = toKey(pts[0]);
  const pEnd = toKey(pts[pts.length - 1]);
  const pStartNext = toKey(pts[1]);
  const pEndPrev = toKey(pts[pts.length - 2]);

  /**
   * 沿路徑尋找直到遇到非 Degree-2 的節點
   * @param {Array<number>} current - 當前節點
   * @param {Array<number>} cameFrom - 來源節點
   * @returns {number} 終端節點的度數
   */
  const findTerminalDegree = (current, cameFrom) => {
    let steps = 0;
    const maxSteps = 2000;
    let currNode = JSON.stringify(current);
    let prevNode = JSON.stringify(cameFrom);
    while (adj.has(currNode) && adj.get(currNode).size === 2) {
      if (steps > maxSteps) break;
      const neighbors = new Set(adj.get(currNode));
      neighbors.delete(prevNode);
      if (neighbors.size === 0) break; // Dead end
      const nxt = Array.from(neighbors)[0];
      prevNode = currNode;
      currNode = nxt;
      steps++;
    }
    return adj.has(currNode) ? adj.get(currNode).size : 0;
  };

  // 往兩端外側尋找
  const degStart = findTerminalDegree(pStart, pStartNext);
  const degEnd = findTerminalDegree(pEnd, pEndPrev);

  // 規則：兩端皆連接至交叉點(>2)視為骨幹(Core)，否則為分支(Branch)
  if (degStart > 2 && degEnd > 2) return 'core';
  else return 'branch';
}

// ==========================================
// 4. 繪圖核心 (嚴格比照 Colab 10 畫風 + 防重疊)
// ==========================================
/**
 * 嚴格重現 Colab 10 的 Matplotlib 風格參數。
 * [重點修正] 加入 visited 機制，避免重複繪製相同的站點/文字。
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} dataList - 資料列表
 * @param {string} title - 圖表標題
 * @param {boolean} useStructureColor - 是否使用結構顏色
 */
// eslint-disable-next-line no-unused-vars
function drawStrictStyle(ax, dataList, title, useStructureColor = false) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] ${title} (Use Structure Color: ${useStructureColor})`);
}

// ==========================================
// 5. 主程式執行
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_10_to_3_1(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_10Layer = dataStore.findLayerById('taipei_2_10');
  const taipei3_1Layer = dataStore.findLayerById('taipei_3_1');

  // ==========================================
  // 1. 檔案路徑設定
  // ==========================================
  // 輸入：Colab 10 的輸出
  const inputJsonFilename = taipei2_10Layer ? 'taipei_2_10 (in-memory)' : 'taipei_2_10';
  // 輸出：結構標記後的資料 (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑');
  console.log(`   - Input : 從 taipei_2_10 圖層讀取`);
  console.log(`   - Json  : 已直接傳給 taipei_3_1 圖層`);
  console.log('='.repeat(60));

  if (!taipei2_10Layer || !taipei2_10Layer.spaceNetworkGridJsonData) {
    console.error(`❌ 錯誤: 找不到檔案 ${inputJsonFilename}`);
    throw new Error(`找不到檔案 ${inputJsonFilename}`);
  }

  try {
    console.log(`📖 讀取檔案: ${inputJsonFilename}`);
    const dataInput = JSON.parse(JSON.stringify(taipei2_10Layer.spaceNetworkGridJsonData));

    // 複製一份作處理
    const dataProcessed = JSON.parse(JSON.stringify(dataInput));

    console.log('🧩 建立拓樸與結構分析...');
    const adjList = buildAdjacency(dataProcessed);

    let coreCnt = 0;
    let branchCnt = 0;

    // 標記屬性
    const segmentsList = Array.from(iterSegments(dataProcessed));
    for (const seg of segmentsList) {
      const stype = analyzeSegmentStructure(seg, adjList);
      seg.structure_type = stype;
      // 寫入建議顏色
      seg.structure_color = stype === 'core' ? '#D50000' : '#0046E3';

      if (stype === 'core') coreCnt++;
      else branchCnt++;
    }

    console.log(`📊 統計結果: 🔴骨幹 ${coreCnt} 條, 🔵分支 ${branchCnt} 條`);

    // 存檔 JSON
    console.log('\n🚀 儲存 JSON 檔案...');
    if (!taipei3_1Layer) {
      throw new Error('找不到 taipei_3_1 圖層');
    }

    taipei3_1Layer.spaceNetworkGridJsonData = dataProcessed;
    console.log(`💾 資料已傳給 taipei_3_1 圖層`);

    // 繪圖 (只畫 2 張)
    console.log('🎨 繪製 Before/After 比較圖...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    drawStrictStyle(null, dataProcessed, 'Before: Original Route Colors', false);
    drawStrictStyle(null, dataProcessed, 'After: Structure Tagged (Red=Core, Blue=Branch)', true);

    // 自動開啟 taipei_3_1 圖層以便查看結果
    if (!taipei3_1Layer.visible) {
      taipei3_1Layer.visible = true;
      dataStore.saveLayerState('taipei_3_1', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      inputSegmentCount: segmentsList.length,
      outputSegmentCount: segmentsList.length,
      coreCount: coreCnt,
      branchCount: branchCnt,
    };

    taipei3_1Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
