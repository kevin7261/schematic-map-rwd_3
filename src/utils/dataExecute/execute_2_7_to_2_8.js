// # @title Colab 2-8: L型縮減
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 5 (拓撲修正後) 的資料 (07_topology_corrected_*.json)。
// 2. 執行「緊湊化演算法 (Compact Layout)」：
//    - 分析路線幾何，找出可收縮的 L 型轉折。
//    - 計算「虛擬移動 (Ghost Move)」：嘗試將路段向內推移。
//    - 碰撞檢測：確保推移後不會撞到其他車站或切斷其他路線。
// 3. 全域更新：
//    - 若移動合法，同步更新所有共用該路段的路線 (保持轉乘點連接)。
// 4. 輸出：
//    - 視覺上更緊湊、留白更少的示意地圖。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 2. 基礎工具 (屬性與幾何)
// ==========================================
/**
 * 嚴格判定是否為真實車站 (過濾幾何點)
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

// --- 幾何工具 ---
/**
 * 座標四捨五入
 * @param {number} val - 數值
 * @returns {number} 四捨五入後的數值
 */
function roundCoord(val) {
  return Math.round(val * 100) / 100;
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
 * @param {Array<number>|null} p1 - 點1座標
 * @param {Array<number>|null} p2 - 點2座標
 * @param {number} threshold - 容差
 * @returns {boolean} 是否相同
 */
function isSamePoint(p1, p2, threshold = 1e-4) {
  if (p1 === null || p2 === null) return false;
  return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2 < threshold;
}

/**
 * 判斷點 pt 是否在線段 seg_start-seg_end 上
 * @param {Array<number>|null} pt - 點座標
 * @param {Array<number>} segStart - 線段起點
 * @param {Array<number>} segEnd - 線段終點
 * @param {number} threshold - 容差
 * @returns {boolean} 是否在線段上
 */
function isPointOnSegment(pt, segStart, segEnd, threshold = 0.1) {
  if (pt === null) return false;
  const xMin = Math.min(segStart[0], segEnd[0]);
  const xMax = Math.max(segStart[0], segEnd[0]);
  const yMin = Math.min(segStart[1], segEnd[1]);
  const yMax = Math.max(segStart[1], segEnd[1]);

  // 1. 邊界框快篩
  if (!(xMin - threshold <= pt[0] && pt[0] <= xMax + threshold && yMin - threshold <= pt[1] && pt[1] <= yMax + threshold)) {
    return false;
  }

  // 2. 距離計算
  const [px, py] = pt;
  const [x1, y1] = segStart;
  const [x2, y2] = segEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return false;

  const u = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);

  // 點在線段延伸線上不算
  if (u < 0 || u > 1) return false;

  const xClosest = x1 + u * dx;
  const yClosest = y1 + u * dy;
  const distance = Math.sqrt((px - xClosest) ** 2 + (py - yClosest) ** 2);
  return distance < threshold;
}

// ==========================================
// 3. 資料結構轉換 (Flat <-> Grouped)
// ==========================================
/**
 * 轉為結構化資料，方便進行整條路線的幾何分析
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
 * 還原為 Flat List
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

// ==========================================
// 4. 幾何核心演算法 (Optimization Logic)
// ==========================================
/**
 * 將破碎的 segments 拼接為長路徑 (Logical Lines)。
 * 僅提取座標用於幾何分析，不影響原始資料屬性。
 * @param {Array} segments - 線段陣列
 * @returns {Array<Array<Array<number>>>} 拼接後的長路徑陣列
 */
function stitchSegmentsIntoLogicalLines(segments) {
  if (!segments || segments.length === 0) return [];
  const pool = [];
  // 深層複製以免修改原始資料
  for (const s of segments) {
    pool.push({ points: JSON.parse(JSON.stringify(s.points || [])) });
  }

  const stitched = [];
  while (pool.length > 0) {
    const curr = pool.shift();
    let chain = curr.points;
    let hasGrowth = true;

    while (hasGrowth) {
      hasGrowth = false;
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        const sPts = seg.points;
        if (!sPts || sPts.length === 0) continue;
        // 嘗試四種拼接方式
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
    stitched.push(chain);
  }
  return stitched;
}

/**
 * 取得路徑的幾何轉折點 (L-Shape 的角)
 * @param {Array<Array<number>>} points - 點座標陣列
 * @returns {Array<Array<number>>} 轉折點陣列
 */
function getCorners(points) {
  if (points.length < 2) return [];
  // 清理重複點
  const cleanPts = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (!isSamePoint(points[i], cleanPts[cleanPts.length - 1])) {
      cleanPts.push(points[i]);
    }
  }
  if (cleanPts.length < 2) return [];

  const corners = [cleanPts[0]];
  for (let i = 1; i < cleanPts.length - 1; i++) {
    const prev = cleanPts[i - 1];
    const curr = cleanPts[i];
    const nextP = cleanPts[i + 1];
    const dy1 = curr[1] - prev[1];
    const dy2 = nextP[1] - curr[1];
    const dx1 = curr[0] - prev[0];
    const dx2 = nextP[0] - curr[0];

    // 判斷是否為轉折 (方向改變)
    const isCollinear = Math.abs(dx1 * dy2 - dx2 * dy1) < 1e-4 && dx1 * dx2 + dy1 * dy2 > 0;
    if (!isCollinear) {
      corners.push(curr);
    }
  }

  corners.push(cleanPts[cleanPts.length - 1]);
  return corners;
}

// --- 碰撞檢測函式群 ---
/**
 * 檢查移動後的線段是否撞到其他站點
 * @param {Array<number>} ghostP1 - 虛擬移動起點
 * @param {Array<number>} ghostP2 - 虛擬移動終點
 * @param {Array<Array<number>>} allCollisionPoints - 所有碰撞點陣列
 * @param {Array<number>} anchorPt - 錨點
 * @returns {Array} [是否碰撞, 訊息]
 */
function checkNodeCollisionStrict(ghostP1, ghostP2, allCollisionPoints, anchorPt) {
  const collisionRadius = 0.5;
  for (const pt of allCollisionPoints) {
    if (isSamePoint(pt, anchorPt)) continue; // 忽略自己

    const d = dist(pt, ghostP2); // 檢查終點是否撞到點
    if (d < collisionRadius) return [true, 'Hit Node'];

    // 檢查路徑是否穿過點
    if (isPointOnSegment(pt, ghostP1, ghostP2, 0.1)) {
      if (!isSamePoint(pt, ghostP1, 0.1)) return [true, 'Cut Thru'];
    }
  }
  return [false, null];
}

/**
 * 檢查線段是否重疊
 * @param {Array<number>} s1Start - 線段1起點
 * @param {Array<number>} s1End - 線段1終點
 * @param {Array<number>} s2Start - 線段2起點
 * @param {Array<number>} s2End - 線段2終點
 * @returns {boolean} 是否重疊
 */
function checkSegmentOverlap(s1Start, s1End, s2Start, s2End) {
  if (isPointOnSegment(s1Start, s2Start, s2End, 0.1) && isPointOnSegment(s1End, s2Start, s2End, 0.1)) return true;
  if (isPointOnSegment(s2Start, s1Start, s1End, 0.1) && isPointOnSegment(s2End, s1Start, s1End, 0.1)) return true;
  return false;
}

/**
 * 檢查移動掃過的矩形區域內是否有其他點 (防止穿模)
 * @param {Array<number>} hP1 - 原始起點
 * @param {Array<number>} hP2 - 原始終點
 * @param {Array<number>} gP1 - 虛擬起點
 * @param {Array<number>} gP2 - 虛擬終點
 * @param {Array<Array<number>>} candidatePoints - 候選點陣列
 * @returns {boolean} 是否有干涉
 */
function checkAreaInterference(hP1, hP2, gP1, gP2, candidatePoints) {
  const xC = [hP1[0], hP2[0], gP1[0], gP2[0]];
  const yC = [hP1[1], hP2[1], gP1[1], gP2[1]];
  const rXmin = Math.min(...xC);
  const rXmax = Math.max(...xC);
  const rYmin = Math.min(...yC);
  const rYmax = Math.max(...yC);
  const eps = 0.1;
  for (const pt of candidatePoints) {
    if (rXmin - eps <= pt[0] && pt[0] <= rXmax + eps && rYmin - eps <= pt[1] && pt[1] <= rYmax + eps) {
      // 排除自己這條線上的點
      if (isPointOnSegment(pt, hP1, hP2, 0.1)) continue;
      if (isSamePoint(pt, gP1) || isSamePoint(pt, gP2)) continue;
      return true;
    }
  }
  return false;
}

/**
 * 檢查移動後是否會產生歪斜線 (Diagonal)
 * @param {Array<number>} hP1 - 原始起點
 * @param {Array<number>} hP2 - 原始終點
 * @param {number} shiftX - X 位移
 * @param {number} shiftY - Y 位移
 * @param {Array} dataList - 資料列表
 * @returns {boolean} 是否會產生斜線
 */
function checkWillCreateDiagonal(hP1, hP2, shiftX, shiftY, dataList) {
  const threshold = 0.1;
  for (const route of dataList) {
    for (const seg of route.segments) {
      const pts = seg.points;
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const pCurr = pts[i];
        const pNext = pts[i + 1];
        if (pCurr === null || pNext === null) continue;

        const currMoves = isPointOnSegment(pCurr, hP1, hP2, 0.1);
        const nextMoves = isPointOnSegment(pNext, hP1, hP2, 0.1);

        const newCurrX = currMoves ? pCurr[0] + shiftX : pCurr[0];
        const newCurrY = currMoves ? pCurr[1] + shiftY : pCurr[1];
        const newNextX = nextMoves ? pNext[0] + shiftX : pNext[0];
        const newNextY = nextMoves ? pNext[1] + shiftY : pNext[1];

        const dx = Math.abs(newCurrX - newNextX);
        const dy = Math.abs(newCurrY - newNextY);
        // 如果 dx 和 dy 都大於 0 (且大於閾值)，表示變成斜線了 (非90度/180度)
        if (dx > threshold && dy > threshold) return true;
      }
    }
  }
  return false;
}

// --- 優化器類別 (MapOptimizer) ---
/**
 * 地圖優化器類別
 */
class MapOptimizer {
  /**
   * 初始化優化器
   * @param {Array} structuredData - 結構化資料陣列
   */
  constructor(structuredData) {
    this.data = JSON.parse(JSON.stringify(structuredData));
    this.steps = [];
    this.isCompleted = false;
    this.analyzeGeometry();
  }

  /**
   * 分析當前地圖幾何，找出所有可能的移動 (Steps)
   */
  analyzeGeometry() {
    this.steps = [];
    const allSegmentsCache = [];
    const interferenceCandidates = new Set();
    const allCollisionPoints = [];
    const tempSet = new Set();

    // 1. 建立全域障礙物快取 (Collision Cache)
    for (const route of this.data) {
      for (const seg of route.segments) {
        const pts = seg.points;
        for (const pt of pts) {
          if (pt === null) continue;
          const ptTuple = `${roundCoord(pt[0])},${roundCoord(pt[1])}`;
          if (!tempSet.has(ptTuple)) {
            tempSet.add(ptTuple);
            allCollisionPoints.push(pt);
            interferenceCandidates.add(ptTuple);
          }
        }

        for (let k = 0; k < pts.length - 1; k++) {
          if (pts[k] && pts[k + 1]) {
            allSegmentsCache.push([pts[k], pts[k + 1]]);
          }
        }
      }
    }

    const interferenceList = Array.from(interferenceCandidates).map((p) => {
      const [x, y] = p.split(',').map(Number);
      return [x, y];
    });

    // 2. 分析每條路線的轉折點 (L-Shape Analysis)
    for (let rIdx = 0; rIdx < this.data.length; rIdx++) {
      const route = this.data[rIdx];
      const fullPaths = stitchSegmentsIntoLogicalLines(route.segments);

      for (let pathIdx = 0; pathIdx < fullPaths.length; pathIdx++) {
        const pathPts = fullPaths[pathIdx];
        const corners = getCorners(pathPts);

        for (let i = 0; i < corners.length - 1; i++) {
          const pStart = corners[i];
          const pEnd = corners[i + 1];
          const vx = pEnd[0] - pStart[0];
          const vy = pEnd[1] - pStart[1];
          const ghosts = [];

          // 內部函式：評估該次移動是否安全
          const processGhost = (gStart, gEnd, anchorPt) => {
            const shiftX = gStart[0] - pStart[0];
            const shiftY = gStart[1] - pStart[1];
            let status = 'safe';
            let msg = null;

            const [hit, hitMsg] = checkNodeCollisionStrict(gStart, gEnd, allCollisionPoints, anchorPt);
            if (hit) {
              status = 'collision';
              msg = hitMsg;
            } else if (allSegmentsCache.some((s) => checkSegmentOverlap(gStart, gEnd, s[0], s[1]))) {
              status = 'collision';
              msg = 'Seg Overlap';
            } else if (checkAreaInterference(pStart, pEnd, gStart, gEnd, interferenceList)) {
              status = 'interference';
            } else if (checkWillCreateDiagonal(pStart, pEnd, shiftX, shiftY, this.data)) {
              status = 'diagonal';
            }

            return { p1: gStart, p2: gEnd, status: status, shift: [shiftX, shiftY], msg: msg };
          };

          // 嘗試兩個方向的收縮 (往回縮 或 往後縮)
          if (i > 0) {
            // 嘗試往 i-1 的方向縮 (Towards previous corner)
            ghosts.push(processGhost(corners[i - 1], [corners[i - 1][0] + vx, corners[i - 1][1] + vy], corners[i - 1]));
          }
          if (i < corners.length - 2) {
            // 嘗試往 i+2 的方向縮 (Towards next corner)
            const g2Start = [corners[i + 2][0] - vx, corners[i + 2][1] - vy];
            ghosts.push(processGhost(g2Start, corners[i + 2], corners[i + 2]));
          }

          if (ghosts.length > 0) {
            this.steps.push({
              p1: pStart,
              p2: pEnd,
              ghosts: ghosts,
              info: `${route.route_name || 'Unknown'} (C${i})`,
            });
          }
        }
      }
    }

    if (this.steps.length === 0) {
      this.isCompleted = true;
    }
  }

  /**
   * 執行移動，並全域同步更新所有受影響的點
   * @param {Object} stepData - 步驟資料
   * @param {Object} bestGhost - 最佳虛擬移動
   */
  applyMove(stepData, bestGhost) {
    const [shiftX, shiftY] = bestGhost.shift;
    const p1 = stepData.p1;
    const p2 = stepData.p2;

    // 全域掃描更新：所有位於移動線段 (p1-p2) 上的點，都一起移動
    for (const route of this.data) {
      for (const seg of route.segments) {
        for (const pt of seg.points) {
          if (isPointOnSegment(pt, p1, p2, 0.1)) {
            pt[0] = roundCoord(pt[0] + shiftX);
            pt[1] = roundCoord(pt[1] + shiftY);
          }
        }

        // 同步更新頭尾屬性 (若有)
        if (seg.start_coord && seg.start_coord.length >= 2) {
          if (isPointOnSegment(seg.start_coord, p1, p2, 0.1)) {
            seg.start_coord[0] = roundCoord(seg.start_coord[0] + shiftX);
            seg.start_coord[1] = roundCoord(seg.start_coord[1] + shiftY);
          }
        }
        if (seg.end_coord && seg.end_coord.length >= 2) {
          if (isPointOnSegment(seg.end_coord, p1, p2, 0.1)) {
            seg.end_coord[0] = roundCoord(seg.end_coord[0] + shiftX);
            seg.end_coord[1] = roundCoord(seg.end_coord[1] + shiftY);
          }
        }
      }
    }

    // print(f"  ⚡ 執行縮排: {step_data['info']} (Moved {count} pts)")
    this.analyzeGeometry(); // 移動後重新分析幾何
  }

  /**
   * 運行到完成
   * @returns {Array} 優化後的資料
   */
  runToCompletion() {
    console.log('🚀 開始自動優化佈局 (Compact Layout)...');
    let iteration = 0;
    const maxIter = 100;
    let totalMoves = 0;

    while (!this.isCompleted && iteration < maxIter) {
      let moved = false;
      // 排序 steps，優先執行「位移量較小」的移動 (保守策略，避免大幅度破壞)
      this.steps.sort((a, b) => b.ghosts.length - a.ghosts.length);

      for (const step of this.steps) {
        const safeGhosts = step.ghosts.filter((g) => g.status === 'safe');
        if (safeGhosts.length > 0) {
          // 選擇位移最小的安全移動
          safeGhosts.sort((a, b) => Math.hypot(a.shift[0], a.shift[1]) - Math.hypot(b.shift[0], b.shift[1]));

          // 避免微小抖動 (小於 0.1 的移動忽略)
          if (Math.hypot(safeGhosts[0].shift[0], safeGhosts[0].shift[1]) > 0.1) {
            this.applyMove(step, safeGhosts[0]);
            moved = true;
            totalMoves++;
            break;
          }
        }
      }
      if (!moved) break;
      iteration++;
    }

    this.isCompleted = true;
    console.log(`✅ 自動優化完成，共執行 ${totalMoves} 次收縮位移。`);
    return this.data;
  }
}

// ==========================================
// 5. 繪圖與存檔函式
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
 * 繪製地圖 Step 8
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} flatData - 扁平資料陣列
 * @param {string} title - 圖表標題
 */
// eslint-disable-next-line no-unused-vars
function drawMapStep8(ax, flatData, title) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] ${title}`);
}

/**
 * 繪製對照圖
 * @param {Array} originalData - 原始資料
 * @param {Array} optimizedData - 優化後的資料
 */
// eslint-disable-next-line no-unused-vars
function plotComparison(originalData, optimizedData) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log('[視覺化] Comparison: Before vs After Compact Optimization');
}

// ==========================================
// 6. 主程式執行入口
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_7_to_2_8(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_7Layer = dataStore.findLayerById('taipei_2_7');
  const taipei2_8Layer = dataStore.findLayerById('taipei_2_8');

  // ==========================================
  // 1. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 5 拓撲修正後的檔案
  const inputJsonFilename = taipei2_7Layer ? 'taipei_2_7 (in-memory)' : 'taipei_2_7';
  // 輸出：Step 6 緊湊化後的檔案 (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_7 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_8 圖層`);
  console.log('='.repeat(60));

  if (!taipei2_7Layer || !taipei2_7Layer.spaceNetworkGridJsonData) {
    console.error(`❌ 錯誤: 找不到輸入檔 ${inputJsonFilename} (請先執行 Colab 7)`);
    throw new Error(`找不到輸入檔 ${inputJsonFilename} (請先執行 Colab 7)`);
  }

  try {
    const dataInputFlat = JSON.parse(JSON.stringify(taipei2_7Layer.spaceNetworkGridJsonData));

    // 1. 強制座標整數化 (消除浮點誤差，便於對齊)
    const sanitizeData = (flatList) => {
      for (const seg of flatList) {
        if (!seg.points) continue;
        for (const p of seg.points) {
          p[0] = roundCoord(p[0]);
          p[1] = roundCoord(p[1]);
        }
      }
      return flatList;
    };

    const dataReadyFlat = sanitizeData(dataInputFlat);
    const dataBeforeFlat = JSON.parse(JSON.stringify(dataReadyFlat));

    // 2. 轉換結構 -> 優化 -> 還原
    console.log('🔄 正在初始化 MapOptimizer...');
    const groupedData = groupFlatDataByRoute(dataReadyFlat);

    const optimizer = new MapOptimizer(groupedData);
    const finalGroupedData = optimizer.runToCompletion();

    const finalFlatData = flattenData(finalGroupedData);

    // 3. 存檔
    console.log('\n🚀 儲存 JSON 檔案...');
    if (!taipei2_8Layer) {
      throw new Error('找不到 taipei_2_8 圖層');
    }

    if (finalFlatData && finalFlatData.length > 0) {
      taipei2_8Layer.spaceNetworkGridJsonData = finalFlatData;
      console.log(`✅ 資料已傳給 taipei_2_8 圖層`);
    }

    // 4. 繪製比較圖
    console.log('\n🚀 產生對照圖 (Before vs After)...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    plotComparison(dataBeforeFlat, finalFlatData);

    // 自動開啟 taipei_2_8 圖層以便查看結果
    if (!taipei2_8Layer.visible) {
      taipei2_8Layer.visible = true;
      dataStore.saveLayerState('taipei_2_8', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      inputSegmentCount: dataInputFlat.length,
      outputSegmentCount: finalFlatData.length,
    };

    taipei2_8Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
