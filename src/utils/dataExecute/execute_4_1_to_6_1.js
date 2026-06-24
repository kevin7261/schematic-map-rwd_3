// # @title Colab 6-1: 權重簡化 (Diff <= 0, <= 1, <= 2)
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 4 的權重化資料 (1_structure_weighted_*.json)。
// 2. 執行「迭代刪除 (Iterative Pruning)」：
//    - [邏輯更新] 針對 Station-to-Station 結構。
//    - 若連續兩個區間 (A->B, B->C) 權重相同，且 B 點非轉乘站，則移除 B 點。
//    - 將 A->B->C 合併為 A->C，權重維持不變。
// 3. 執行「座標壓縮 (Compression)」：消除刪除點後產生的空隙。
// 4. 執行「梯度刪除 (Gradient Pruning)」：
//    - 階段 1 (Diff <= 1): 若相鄰路段權重差 |w1 - w2| <= 1，則刪除中間點。
//    - 階段 2 (Diff <= 2): 若相鄰路段權重差 |w1 - w2| <= 2，則刪除中間點。
// 5. 視覺化驗證：繪製 Before/After 比較圖 (由前端 d3jsmap 組件處理)。
// ==============================================================================
/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 1. 檔案路徑與全域設定
// ==========================================
// 輸入：Step 4 產生的權重化資料
// 輸出：Step 6 壓縮後的資料 (已直接傳給下一個圖層)

// ==========================================
// 2. 幾何運算與輔助函式
// ==========================================
/**
 * 計算兩點距離的平方
 * @param {Array<number>} p1 - 點1座標
 * @param {Array<number>} p2 - 點2座標
 * @returns {number} 距離的平方
 */
function distSq(p1, p2) {
  return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;
}

/**
 * 計算兩點距離
 * @param {Array<number>} p1 - 點1座標
 * @param {Array<number>} p2 - 點2座標
 * @returns {number} 距離
 */
function dist(p1, p2) {
  return Math.sqrt(distSq(p1, p2));
}

/**
 * 計算折線總長
 * @param {Array<Array<number>>} polyline - 折線點陣列
 * @returns {number} 總長度
 */
// eslint-disable-next-line no-unused-vars
function getPathLength(polyline) {
  let length = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    length += dist(polyline[i], polyline[i + 1]);
  }
  return length;
}

/**
 * 在折線上找出距離起點 target_dist 的座標
 * @param {Array<Array<number>>} polyline - 折線點陣列
 * @param {number} targetDist - 目標距離
 * @returns {Array<number>} 座標
 */
// eslint-disable-next-line no-unused-vars
function getPointAlongPath(polyline, targetDist) {
  if (targetDist <= 0) return polyline[0];
  let currentDist = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    const segLen = dist(p1, p2);
    if (currentDist + segLen >= targetDist) {
      const remain = targetDist - currentDist;
      const ratio = segLen > 0 ? remain / segLen : 0;
      const nx = p1[0] + (p2[0] - p1[0]) * ratio;
      const ny = p1[1] + (p2[1] - p1[1]) * ratio;
      return [nx, ny];
    }
    currentDist += segLen;
  }
  return polyline[polyline.length - 1];
}

/**
 * 取得路線顏色
 * @param {Object} seg - 線段物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getRouteColor(seg) {
  const p = seg.way_properties?.tags || {};
  if (!p || Object.keys(p).length === 0) {
    const props = seg.properties || {};
    return props.colour || props.color || '#555555';
  }
  return p.colour || p.color || '#555555';
}

/**
 * 取得路線名稱
 * @param {Object} item - 項目物件
 * @returns {string} 路線名稱
 */
function getRouteName(item) {
  const p = item.way_properties?.tags || {};
  return p.route_name || p.name || item.properties?.route_name || 'Unknown';
}

// ==========================================
// 3. 核心：計算邊緣極值 (Station-to-Station)
// ==========================================
/**
 * 計算 Row/Col 最大權重 (Station-to-Station 版)
 * @param {Array} data - 資料列表
 * @returns {Object} {rowMaxValues, colMaxValues}
 */
function calculateMarginalMax(data) {
  const rowMaxValues = {};
  const colMaxValues = {};

  /**
   * 更新最大值
   * @param {Object} dic - 字典
   * @param {number} idx - 索引
   * @param {number} val - 值
   */
  function updateMax(dic, idx, val) {
    dic[idx] = Math.max(dic[idx] || 0, val);
  }

  /**
   * 迭代所有 segments
   * @param {Array} d - 資料列表
   * @yields {Object} 線段物件
   */
  function* iterAllSegments(d) {
    if (d[0] && typeof d[0] === 'object' && 'segments' in d[0]) {
      for (const r of d) {
        for (const s of r.segments || []) {
          yield s;
        }
      }
    } else {
      for (const s of d) {
        yield s;
      }
    }
  }

  for (const seg of iterAllSegments(data)) {
    const pts = seg.points || [];
    if (pts.length < 2) continue;
    const stationWeights = seg.station_weights || [];

    for (const wInfo of stationWeights) {
      const sIdx = wInfo.start_idx;
      const eIdx = wInfo.end_idx;
      const w = wInfo.weight;
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

  return { rowMaxValues, colMaxValues };
}

// ==========================================
// 4. 壓縮與重映射 (Compression)
// ==========================================
/**
 * 移除空隙，將座標重新映射到連續的整數空間。
 * @param {Array} data - 資料列表
 * @returns {Object} {data, rowMaxValues, colMaxValues, width, height}
 */
function compressMapData(data) {
  const activeXs = new Set();
  const activeYs = new Set();

  // 收集所有還存在的有效座標 (包含幾何點)
  for (const route of data) {
    for (const seg of route.segments || []) {
      for (const p of seg.points || []) {
        activeXs.add(Math.round(p[0]));
        activeYs.add(Math.round(p[1]));
      }
    }
  }

  if (activeXs.size === 0) {
    console.log('⚠️ 警告：無法收集到任何有效座標，跳過壓縮步驟。');
    return {
      data: JSON.parse(JSON.stringify(data)),
      rowMaxValues: {},
      colMaxValues: {},
      width: 0,
      height: 0,
    };
  }

  const sortedXs = Array.from(activeXs).sort((a, b) => a - b);
  const sortedYs = Array.from(activeYs).sort((a, b) => a - b);

  // 建立映射表
  const mapX = {};
  const mapY = {};
  sortedXs.forEach((old, newIdx) => {
    mapX[old] = newIdx;
  });
  sortedYs.forEach((old, newIdx) => {
    mapY[old] = newIdx;
  });

  const newData = JSON.parse(JSON.stringify(data));

  // 執行映射
  for (const route of newData) {
    for (const seg of route.segments || []) {
      const newPoly = [];
      for (const p of seg.points || []) {
        let ox = Math.round(p[0]);
        let oy = Math.round(p[1]);
        // 容錯處理：找最近的有效格點
        if (!(ox in mapX)) {
          ox = sortedXs.reduce(
            (best, x) => (Math.abs(x - ox) < Math.abs(best - ox) ? x : best),
            sortedXs[0]
          );
        }
        if (!(oy in mapY)) {
          oy = sortedYs.reduce(
            (best, y) => (Math.abs(y - oy) < Math.abs(best - oy) ? y : best),
            sortedYs[0]
          );
        }
        const nx = mapX[ox];
        const ny = mapY[oy];
        // 保留原始屬性 (若有)
        const originalProps = p.length > 2 ? p[2] : {};
        if (
          originalProps &&
          typeof originalProps === 'object' &&
          Object.keys(originalProps).length > 0
        ) {
          newPoly.push([nx, ny, originalProps]);
        } else {
          newPoly.push([nx, ny]);
        }
      }

      seg.points = newPoly;

      // station_weights 中的 index 不需要改變，因為點的順序沒變，只是座標變了
    }
  }

  const { rowMaxValues, colMaxValues } = calculateMarginalMax(newData);
  return {
    data: newData,
    rowMaxValues,
    colMaxValues,
    width: sortedXs.length,
    height: sortedYs.length,
  };
}

// ==========================================
// 5. 迭代刪除冗餘點 (Station Level Pruning - Diff <= 0)
// ==========================================
/**
 * [新邏輯]
 * 針對每個 Segment，檢查 station_weights。
 * 如果連續兩段權重相同 (w1 == w2)，且中間共用的那個站點 (end_idx of w1 == start_idx of w2)
 * 沒有 'connect_number' (非轉乘站)，則可以視為冗餘。
 *
 * 動作：合併這兩段 weight info，並從 points 中移除該站點標記 ?
 * 不，points 幾何點不能隨便刪，否則形狀會變。
 * 這裡我們簡化為：將 station_weights 合併，視為「虛擬刪除」該站點的權重邊界。
 * @param {Array} data - 資料列表
 * @returns {Array} 處理後的資料列表
 */
function pruneRedundantStations(data) {
  const newData = JSON.parse(JSON.stringify(data));
  let totalMerged = 0;

  for (const route of newData) {
    for (const seg of route.segments || []) {
      const weights = seg.station_weights || [];
      if (weights.length < 2) continue;

      const newWeights = [];

      if (weights.length === 0) continue;

      let currentW = weights[0];

      for (let i = 1; i < weights.length; i++) {
        const nextW = weights[i];

        // 檢查是否可合併
        // 1. 權重相同
        const weightsSame = currentW.weight === nextW.weight;

        // 2. 中間站點 (current_w['end_idx']) 是否為轉乘站？
        const midIdx = currentW.end_idx;
        let isConnectNode = false;

        // 檢查 node list (若有)
        if (seg.nodes && midIdx < seg.nodes.length) {
          const nodeInfo = seg.nodes[midIdx];
          if (nodeInfo) {
            const tags = nodeInfo.tags || {};
            if (nodeInfo.connect_number || tags.connect_number) {
              isConnectNode = true;
            }
          }
        }

        // 如果權重相同且不是轉乘站 -> 合併
        if (weightsSame && !isConnectNode) {
          // 合併：延伸 current_w 的結束點
          currentW.end_idx = nextW.end_idx;
          totalMerged++;
        } else {
          // 不能合併，推入 current，換下一個
          newWeights.push(currentW);
          currentW = nextW;
        }
      }

      newWeights.push(currentW);
      seg.station_weights = newWeights;
    }
  }

  console.log(`✂️  已合併 ${totalMerged} 個冗餘權重區間。`);
  return newData;
}

// ==========================================
// 6. 梯度刪除 (Gradient Pruning - Diff <= 1 或 <= 2)
// ==========================================
/**
 * 混合刪除 (Diff <= diffThreshold)
 * @param {Array} inputData - 輸入資料
 * @param {number} diffThreshold - 權重差值閾值 (1 或 2)
 * @returns {Object} {data, totalRemoved}
 */
function pruneGradientNodes(inputData, diffThreshold) {
  const currentData = JSON.parse(JSON.stringify(inputData));
  let iteration = 0;
  let totalRemoved = 0;

  console.log(`🔄 開始混合權重刪除程序 (|w1-w2| <= ${diffThreshold})...`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    iteration++;
    let removedInThisPass = 0;

    for (const route of currentData) {
      for (const seg of route.segments || []) {
        const weights = seg.station_weights || [];
        if (weights.length < 2) continue;

        const newWeights = [];

        let i = 0;
        while (i < weights.length) {
          let canMerge = false;

          if (i + 1 < weights.length) {
            const wCurr = weights[i];
            const wNext = weights[i + 1];

            // [條件1] 權重差 <= diffThreshold
            const diff = Math.abs(wCurr.weight - wNext.weight);
            const isDiffSmall = diff <= diffThreshold;

            // [條件2] 中間點是否為轉乘站？
            const midIdx = wCurr.end_idx;
            let isConnectNode = false;

            // 檢查 node list (若有)
            if (seg.nodes && midIdx < seg.nodes.length) {
              const nodeInfo = seg.nodes[midIdx];
              if (nodeInfo) {
                const tags = nodeInfo.tags || {};
                if (nodeInfo.connect_number || tags.connect_number) {
                  isConnectNode = true;
                }
              }
            }

            // 如果不是轉乘站且權重差小 -> 合併
            if (isDiffSmall && !isConnectNode) {
              canMerge = true;
            }
          }

          if (canMerge) {
            // 合併動作: 取 Max Weight，延伸 End Index
            const wCurr = weights[i];
            const wNext = weights[i + 1];

            const mergedW = {
              start_idx: wCurr.start_idx,
              end_idx: wNext.end_idx,
              weight: Math.max(wCurr.weight, wNext.weight), // 取最大
            };

            newWeights.push(mergedW);
            i += 2; // 跳過下一段
            removedInThisPass++;
          } else {
            // 保留
            newWeights.push(weights[i]);
            i += 1;
          }
        }

        seg.station_weights = newWeights;
      }
    }

    totalRemoved += removedInThisPass;
    if (removedInThisPass === 0) {
      console.log(`✅ [迭代結束] 第 ${iteration} 輪掃描後已無符合條件的區段。`);
      break;
    } else {
      console.log(`   ➡ 第 ${iteration} 輪：合併了 ${removedInThisPass} 個區段。`);
    }
  }

  console.log(`🎉 簡化完成！共合併 ${totalRemoved} 個區段。`);
  return { data: currentData, totalRemoved };
}

// ==========================================
// 7. 繪圖核心
// ==========================================
/**
 * 迭代所有 segments
 * @param {Array} dataList - 資料列表
 * @yields {Object} 線段物件
 */
// eslint-disable-next-line no-unused-vars
function* iterSegments(dataList) {
  if (!dataList) return;
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
 * 繪製地圖 (在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理)
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {string} title - 標題
 * @param {Array} data - 資料列表
 */
// eslint-disable-next-line no-unused-vars
function drawBaseMapOnAxis(ax, title, data) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  // 繪圖邏輯：
  // 1. 計算邊界
  // 2. 繪製邊緣數值 (row_maxs, col_maxs)
  // 3. 繪製路線
  // 4. 繪製權重
  // 5. 繪製站點
  console.log(`[視覺化] ${title}`);
}

// ==========================================
// 8. 主執行流程
// ==========================================
/**
 * 確保資料是 Grouped 結構
 * @param {Array} data - 資料陣列
 * @returns {Array} Grouped 結構的資料陣列
 */
function ensureGroupedStructure(data) {
  if (!data || data.length === 0) return [];
  if (data[0] && typeof data[0] === 'object' && 'segments' in data[0]) return data;
  console.log('⚠️ 格式不符，嘗試簡單分組...');
  const grouped = new Map();
  for (const seg of data) {
    const rName = getRouteName(seg);
    if (!grouped.has(rName)) {
      grouped.set(rName, []);
    }
    grouped.get(rName).push(seg);
  }
  const structuredData = [];
  for (const [rName, segments] of grouped.entries()) {
    structuredData.push({ route_name: rName, segments: segments });
  }
  return structuredData;
}

// ==========================================
// 9. 主程式
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_4_1_to_6_1(_jsonData) {
  const dataStore = useDataStore();
  const taipei4_1Layer = dataStore.findLayerById('taipei_4_1');
  const taipei6_1Layer = dataStore.findLayerById('taipei_6_1');

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_4_1 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_6_1 圖層`);
  console.log('='.repeat(60));

  if (!taipei4_1Layer || !taipei4_1Layer.spaceNetworkGridJsonData) {
    console.error(`❌ [錯誤] 找不到輸入檔案: taipei_4_1`);
    throw new Error(`找不到輸入檔案: taipei_4_1`);
  }

  try {
    // Step A: 讀取
    console.log('🚀 Step A: 讀取資料...');
    const rawData = JSON.parse(JSON.stringify(taipei4_1Layer.spaceNetworkGridJsonData));

    // 確保格式 (雖然 Step 4 輸出應該已經是 Grouped)
    let initialData = ensureGroupedStructure(rawData);

    // Step B: 執行權重簡化 (Pruning - Diff <= 0)
    console.log('🔄 Step B: 執行權重簡化 (Pruning)...');
    // 多次執行直到無法再合併
    for (let round = 0; round < 5; round++) {
      const beforeJson = JSON.stringify(initialData);
      initialData = pruneRedundantStations(initialData);
      if (JSON.stringify(initialData) === beforeJson) break;
    }

    // Step C: 座標壓縮
    console.log('📐 Step C: 執行座標壓縮...');
    let compressedData = compressMapData(initialData);
    let currentData = compressedData.data;
    console.log(`✅ 壓縮後資料 (Grid: ${compressedData.width}x${compressedData.height})`);

    // Step D: 梯度刪除 (Diff <= 1)
    console.log('🔄 Step D: 執行梯度刪除 (Gradient Pruning, Diff <= 1)...');
    const phase2Result = pruneGradientNodes(currentData, 1);
    currentData = phase2Result.data;
    const phase2TotalRemoved = phase2Result.totalRemoved;

    // Step E: 梯度刪除 (Diff <= 2)
    console.log('🔄 Step E: 執行梯度刪除 (Gradient Pruning, Diff <= 2)...');
    const phase3Result = pruneGradientNodes(currentData, 2);
    currentData = phase3Result.data;
    const phase3TotalRemoved = phase3Result.totalRemoved;

    // Step F: 最終座標壓縮
    console.log('📐 Step F: 執行最終座標壓縮...');
    compressedData = compressMapData(currentData);

    // Step G: 儲存檔案
    console.log('💾 Step G: 儲存檔案...');
    if (!taipei6_1Layer) {
      throw new Error('找不到 taipei_6_1 圖層');
    }

    taipei6_1Layer.spaceNetworkGridJsonData = compressedData.data;
    taipei6_1Layer.layoutGridJsonData = compressedData.data;
    console.log(
      `✅ 壓縮後資料已傳給 taipei_6_1 圖層 (Grid: ${compressedData.width}x${compressedData.height})`
    );

    // Step H: 繪製對比圖 (由前端 d3jsmap 組件處理)
    console.log('🎨 Step H: 繪製對比圖 (由前端 d3jsmap 組件處理)...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    drawBaseMapOnAxis(null, 'Before: 原始 (Raw)', initialData);
    drawBaseMapOnAxis(null, 'After: 簡化與壓縮 (Pruned & Compressed)', compressedData.data);

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      routeCount: compressedData.data.length,
      phase2Removed: phase2TotalRemoved,
      phase3Removed: phase3TotalRemoved,
      totalRemoved: phase2TotalRemoved + phase3TotalRemoved,
      gridWidth: compressedData.width,
      gridHeight: compressedData.height,
    };

    taipei6_1Layer.dashboardData = dashboardData;

    // 自動開啟 taipei_6_1 圖層以便查看結果
    if (!taipei6_1Layer.visible) {
      taipei6_1Layer.visible = true;
      dataStore.saveLayerState('taipei_6_1', { visible: true });
    }
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
