// # @title Colab 2-7: ㄈ型縮減
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 4 (直線化後) 的資料。
// 2. 執行「拓撲修正」消除 U 型 (ㄈ型) 結構。
// 3. [保護機制 1]：加入「底邊長度限制」，防止長距離的線段被錯誤塌陷。
// 4. [保護機制 2]：加入「H/V 完整性檢查」，若移動點會導致任何連線變成斜線，則禁止移動。
// ==============================================================================
/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 1. 檔案路徑與全域設定
// ==========================================
// [重要設定] 最大允許塌陷距離 (格)
const MAX_COLLAPSE_DIST = 2.5;

// ==========================================
// 2. 核心判定工具 (Utility Functions)
// ==========================================
/**
 * 嚴格判斷是否為需要繪製的車站
 * @param {Object} node - 節點屬性物件
 * @returns {boolean} 是否為有效車站
 */
function isRealStation(node) {
  if (!node) return false;
  if (node.node_type === 'connect') return true;
  if (node.station_name) return true;
  if (node.tags?.station_name) return true;
  if (node.tags?.station_name) return true;
  return false;
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
 * 提取路線名稱
 * @param {Object} item - 項目物件
 * @returns {string} 路線名稱
 */
function getRouteName(item) {
  const p = item.way_properties?.tags || {};
  return p.route_name || p.name || item.properties?.route_name || 'Unknown';
}

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
 * 判斷兩點是否相同
 * @param {Array<number>} p1 - 點1座標
 * @param {Array<number>} p2 - 點2座標
 * @param {number} threshold - 容差
 * @returns {boolean} 是否相同
 */
function isSamePoint(p1, p2, threshold = 1e-5) {
  return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2 < threshold;
}

// ==========================================
// 3. 資料結構轉換
// ==========================================
/**
 * 將扁平列表轉換為以路線為單位的結構
 * @param {Array} flatData - 扁平資料陣列
 * @returns {Array} 結構化資料陣列
 */
function groupFlatDataByRoute(flatData) {
  const grouped = new Map();
  for (const seg of flatData) {
    const rName = getRouteName(seg);
    if (!grouped.has(rName)) {
      grouped.set(rName, []);
    }
    grouped.get(rName).push(seg);
  }
  const structuredData = [];
  for (const [rName, segments] of grouped.entries()) {
    structuredData.push({
      route_name: rName,
      segments: segments,
    });
  }
  return structuredData;
}

/**
 * 將結構化資料還原為扁平列表 (輸出用)
 * @param {Array} structuredData - 結構化資料陣列
 * @returns {Array} 扁平列表
 */
function flattenData(structuredData) {
  const flatList = [];
  for (const route of structuredData) {
    for (const seg of route.segments) {
      flatList.push(seg);
    }
  }
  return flatList;
}

/**
 * 建立保護點集合 (車站/轉乘點)
 * @param {Array} structuredData - 結構化資料陣列
 * @returns {Set} 保護點集合
 */
function getProtectedPoints(structuredData) {
  const protectedSet = new Set();
  for (const route of structuredData) {
    for (const seg of route.segments) {
      const points = seg.points || [];
      const nodes = seg.nodes || [];
      if (nodes && nodes.length === points.length) {
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const nodeProp = nodes[i];
          if (isRealStation(nodeProp)) {
            const key = JSON.stringify([Math.round(pt[0] * 10000) / 10000, Math.round(pt[1] * 10000) / 10000]);
            protectedSet.add(key);
          }
        }
      }
      for (const propKey of ['properties_start', 'properties_end']) {
        const nodeProp = seg[propKey];
        if (nodeProp && isRealStation(nodeProp)) {
          const targetPt = propKey === 'properties_start' ? points[0] : points[points.length - 1];
          const key = JSON.stringify([Math.round(targetPt[0] * 10000) / 10000, Math.round(targetPt[1] * 10000) / 10000]);
          protectedSet.add(key);
        }
      }
    }
  }
  return protectedSet;
}

/**
 * 檢查座標是否在保護名單中
 * @param {Array<number>} pt - 座標
 * @param {Set} protectedSet - 保護點集合
 * @returns {boolean} 是否受保護
 */
function isProtected(pt, protectedSet) {
  const key = JSON.stringify([Math.round(pt[0] * 10000) / 10000, Math.round(pt[1] * 10000) / 10000]);
  return protectedSet.has(key);
}

// ==========================================
// 4. [關鍵新增] 斜線保護檢查
// ==========================================
/**
 * [保護機制]
 * 檢查若將 source_pt 移動到 target_pt：
 * 是否會導致與 source_pt 連接的「其他線段」變成斜線 (非水平且非垂直)。
 * @param {Array} structuredData - 結構化資料陣列
 * @param {Array<number>} sourcePt - 源點座標
 * @param {Array<number>} targetPt - 目標點座標
 * @returns {boolean} 是否通過檢查
 */
function validateHvIntegrity(structuredData, sourcePt, targetPt) {
  const epsilon = 0.1; // 容許誤差值

  // 遍歷所有路線的所有線段
  for (const route of structuredData) {
    for (const seg of route.segments) {
      const pts = seg.points || [];
      if (pts.length < 2) continue;

      // 找出 source_pt 在此線段中的索引 (可能出現多次)
      const indices = [];
      for (let i = 0; i < pts.length; i++) {
        if (isSamePoint(pts[i], sourcePt)) {
          indices.push(i);
        }
      }

      for (const idx of indices) {
        // 找出相鄰的點 (Neighbors)
        const neighbors = [];
        if (idx > 0) neighbors.push(pts[idx - 1]);
        if (idx < pts.length - 1) neighbors.push(pts[idx + 1]);

        for (const neighbor of neighbors) {
          // 如果鄰居點就是 target_pt，表示這段線段正在被縮短/合併，這是允許的 (長度變0)
          if (isSamePoint(neighbor, targetPt)) {
            continue;
          }

          // 模擬移動後的向量：Neighbor (不動) -> Target (新位置)
          const dx = Math.abs(neighbor[0] - targetPt[0]);
          const dy = Math.abs(neighbor[1] - targetPt[1]);

          // 判斷是否為水平或垂直
          const isVertical = dx < epsilon;
          const isHorizontal = dy < epsilon;

          // 如果移動後，既不是水平也不是垂直，則禁止移動！
          if (!(isVertical || isHorizontal)) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

// ==========================================
// 5. 核心邏輯：邏輯線拼接與 U 型檢測
// ==========================================
/**
 * 拼接 segments 為邏輯長線，並在轉折處切斷以便分析幾何形狀
 * @param {Array} segments - 線段陣列
 * @returns {Array} 拼接後的邏輯長線陣列
 */
function stitchSegmentsIntoLogicalLines(segments) {
  if (!segments || segments.length === 0) return [];
  const pool = JSON.parse(JSON.stringify(segments));
  const stitched = [];

  while (pool.length > 0) {
    const curr = pool.shift();
    let chain = curr.points || [];
    let hasGrowth = true;

    while (hasGrowth) {
      hasGrowth = false;
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        const sPts = seg.points || [];
        if (isSamePoint(chain[chain.length - 1], sPts[0])) {
          chain = chain.concat(sPts.slice(1));
          pool.splice(i, 1);
          hasGrowth = true;
          break;
        } else if (isSamePoint(chain[chain.length - 1], sPts[sPts.length - 1])) {
          chain = chain.concat(sPts.slice(0, -1).reverse());
          pool.splice(i, 1);
          hasGrowth = true;
          break;
        } else if (isSamePoint(chain[0], sPts[sPts.length - 1])) {
          chain = sPts.concat(chain.slice(1));
          pool.splice(i, 1);
          hasGrowth = true;
          break;
        } else if (isSamePoint(chain[0], sPts[0])) {
          chain = sPts.slice().reverse().concat(chain.slice(1));
          pool.splice(i, 1);
          hasGrowth = true;
          break;
        }
      }
    }

    // 拆解長線為直線段
    let tempPts = [chain[0]];
    const decomposedSegments = [];
    for (let j = 1; j < chain.length - 1; j++) {
      const v1 = [chain[j][0] - chain[j - 1][0], chain[j][1] - chain[j - 1][1]];
      const v2 = [chain[j + 1][0] - chain[j][0], chain[j + 1][1] - chain[j][1]];
      const d1 = dist(chain[j], chain[j - 1]);
      const d2 = dist(chain[j + 1], chain[j]);
      if (d1 > 0 && d2 > 0) {
        const dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (d1 * d2);
        if (dot < 0.99) {
          tempPts.push(chain[j]);
          decomposedSegments.push({ points: tempPts });
          tempPts = [chain[j]];
          continue;
        }
      }
      tempPts.push(chain[j]);
    }
    tempPts.push(chain[chain.length - 1]);
    decomposedSegments.push({ points: tempPts });
    stitched.push(...decomposedSegments);
  }

  return stitched;
}

/**
 * [幾何分析] 檢測 U 型 (ㄈ型)
 * @param {Object} seg1 - 線段1
 * @param {Object} seg2 - 線段2 (底)
 * @param {Object} seg3 - 線段3
 * @returns {Array} [isU, gapLen] 是否為 U 型，底邊長度
 */
function analyzeStrictUShape(seg1, seg2, seg3) {
  const p1S = seg1.points[0];
  const p1E = seg1.points[seg1.points.length - 1];
  const p3S = seg3.points[0];
  const p3E = seg3.points[seg3.points.length - 1];
  const l1 = dist(p1S, p1E);
  const l3 = dist(p3S, p3E);
  const v1 = [p1E[0] - p1S[0], p1E[1] - p1S[1]];
  const v3 = [p3E[0] - p3S[0], p3E[1] - p3S[1]];

  if (l1 * l3 !== 0) {
    const dot = (v1[0] * v3[0] + v1[1] * v3[1]) / (l1 * l3);
    if (dot < -0.9) {
      const p2S = seg2.points[0];
      const p2E = seg2.points[seg2.points.length - 1];
      const l2 = dist(p2S, p2E);
      if (l2 <= MAX_COLLAPSE_DIST && l2 < l1 && l2 < l3) {
        return [true, l2];
      }
    }
  }
  return [false, null];
}

/**
 * 全域更新座標 (將 old_pt 移動到 new_pt)
 * @param {Array} structuredData - 結構化資料陣列
 * @param {Array<number>} oldPt - 舊座標
 * @param {Array<number>} newPt - 新座標
 * @returns {number} 更新次數
 */
function updateGlobalPointCoords(structuredData, oldPt, newPt) {
  let count = 0;
  for (const route of structuredData) {
    for (const seg of route.segments) {
      const pts = seg.points || [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (isSamePoint(p, oldPt)) {
          pts[i][0] = newPt[0];
          pts[i][1] = newPt[1];
          count++;
        }
      }
    }
  }
  return count;
}

// ==========================================
// 6. 主自動化流程
// ==========================================
/**
 * 執行自動拓撲修正
 * @param {Array} flatData - 扁平資料陣列
 * @returns {Array} 處理後的扁平資料陣列
 */
function autoFixTopology(flatData) {
  console.log('🚀 正在執行自動拓撲修正 (U-Shape Correction)...');

  const data = groupFlatDataByRoute(flatData);
  const protectedPoints = getProtectedPoints(data);
  console.log(`🔒 已鎖定 ${protectedPoints.size} 個保護點 (車站/轉乘點)。`);

  let fixesCount = 0;
  const maxPasses = 10;

  for (let passIdx = 0; passIdx < maxPasses; passIdx++) {
    let foundFix = false;
    for (let rIdx = 0; rIdx < data.length; rIdx++) {
      const route = data[rIdx];
      const ls = stitchSegmentsIntoLogicalLines(route.segments);

      for (let i = 0; i < ls.length - 2; i++) {
        const seg1 = ls[i];
        const seg2 = ls[i + 1];
        const seg3 = ls[i + 2];
        const [isU, gapLen] = analyzeStrictUShape(seg1, seg2, seg3);

        if (isU) {
          const p2 = seg1.points[seg1.points.length - 1];
          const p3 = seg2.points[seg2.points.length - 1];
          const p2Protected = isProtected(p2, protectedPoints);
          const p3Protected = isProtected(p3, protectedPoints);

          let sourcePt = null;
          let targetPt = null;

          if (p2Protected && p3Protected) {
            continue;
          } else if (p2Protected) {
            sourcePt = p3;
            targetPt = p2;
          } else if (p3Protected) {
            sourcePt = p2;
            targetPt = p3;
          } else {
            sourcePt = p3;
            targetPt = p2;
          }

          // [關鍵修正]：在移動前，檢查是否會產生斜線
          if (!validateHvIntegrity(data, sourcePt, targetPt)) {
            // print(f"   🛡️ 跳過: {route['route_name']} (移動會導致斜線)")
            continue;
          }

          updateGlobalPointCoords(data, sourcePt, targetPt);
          fixesCount++;
          foundFix = true;
          console.log(`   ✨ 修正 (Pass ${passIdx + 1}): ${route.route_name} (Gap=${gapLen.toFixed(2)})`);
          break;
        }
      }
      if (foundFix) break;
    }
    if (!foundFix) break;
  }

  console.log(`✅ 自動拓撲修正完成，共修正 ${fixesCount} 處 U 型結構。`);
  return flattenData(data);
}

// ==========================================
// 7. 繪圖與存檔
// ==========================================
/**
 * 繪製節點 (只畫真實車站)
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
 * 繪製地圖
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} flatData - 扁平資料陣列
 * @param {string} title - 圖表標題
 */
// eslint-disable-next-line no-unused-vars
function drawMapStep7(ax, flatData, title) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] ${title}`);
}

/**
 * 繪製對照圖
 * @param {Array} originalData - 原始資料
 * @param {Array} correctedData - 修正後的資料
 */
// eslint-disable-next-line no-unused-vars
function plotComparison(originalData, correctedData) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] Comparison: Input vs Output (Fixed U-Shapes < ${MAX_COLLAPSE_DIST})`);
}

// ==========================================
// 8. 主程式執行
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_6_to_2_7(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_6Layer = dataStore.findLayerById('taipei_2_6');
  const taipei2_7Layer = dataStore.findLayerById('taipei_2_7');

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_6 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_7 圖層`);
  console.log(`   - 最大塌陷距離限制: ${MAX_COLLAPSE_DIST} 格`);
  console.log('='.repeat(60));

  if (!taipei2_6Layer || !taipei2_6Layer.spaceNetworkGridJsonData) {
    console.error(`❌ 錯誤: 找不到輸入檔 taipei_2_6`);
    throw new Error(`找不到輸入檔 taipei_2_6`);
  }

  try {
    const dataStep6 = JSON.parse(JSON.stringify(taipei2_6Layer.spaceNetworkGridJsonData));

    const dataBefore = JSON.parse(JSON.stringify(dataStep6));
    const finalDataList = autoFixTopology(dataStep6);

    if (!taipei2_7Layer) {
      throw new Error('找不到 taipei_2_7 圖層');
    }

    taipei2_7Layer.spaceNetworkGridJsonData = finalDataList;
    console.log(`✅ 結果已傳給 taipei_2_7 圖層`);

    plotComparison(dataBefore, finalDataList);

    // 自動開啟 taipei_2_7 圖層以便查看結果
    if (!taipei2_7Layer.visible) {
      taipei2_7Layer.visible = true;
      dataStore.saveLayerState('taipei_2_7', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      inputSegmentCount: dataStep6.length,
      outputSegmentCount: finalDataList.length,
      maxCollapseDist: MAX_COLLAPSE_DIST,
    };

    taipei2_7Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
