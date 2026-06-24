// # @title Colab 2-4: flip優化 (Final Optimization) - 修正黑點與原點
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 2.3 的 Z-Layout 資料 (03_z_layout_*.json)。
// 2. 執行「模擬退火/爬山演算法」進行最終幾何優化：
//    - 嘗試翻轉路徑 (L型 <-> Z型) 以減少重疊 (Overlaps) 和 交叉 (Collisions)。
//    - [關鍵修正] 在變形過程中，嚴格保留「真實車站」屬性，
//      並將其「均勻分佈」在新的幾何路徑上。
// 3. 視覺化驗證：
//    - 繪圖時自動隱藏「幾何轉折點」，只顯示真正的車站 (黑點) 與轉乘點 (紅點)。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 2. 核心邏輯工具
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
 * [關鍵修正] 嚴格判定是否為需要繪製/保留的車站。
 * 只有轉乘站(connect)或有站名(station_name)的才算。
 * 空的 {} 或 僅標記為 line 的幾何轉折點會回傳 False。
 * @param {Object} node - 節點屬性物件
 * @returns {boolean} 是否為真實車站
 */
function isRealStation(node) {
  if (!node) return false;

  // 1. 轉乘點一定是車站
  if (node.node_type === 'connect') return true;

  // 2. 有站名的也是車站
  if (node.station_name) return true;
  if (node.tags?.station_name) return true;

  // 3. 其他情況 (如 node_type='line' 且無站名) 視為幾何點
  return false;
}

/**
 * 計算兩線段重疊的長度
 * @param {Array} s1 - 線段1 [[x1, y1], [x2, y2]]
 * @param {Array} s2 - 線段2 [[x3, y3], [x4, y4]]
 * @returns {number} 重疊長度
 */
function getSegmentOverlapLength(s1, s2) {
  const p1 = s1[0].slice(0, 2);
  const p2 = s1[1].slice(0, 2);
  const p3 = s2[0].slice(0, 2);
  const p4 = s2[1].slice(0, 2);

  const sorted1 = [p1, p2].sort((a, b) => {
    if (Math.abs(a[0] - b[0]) < 1e-6) return a[1] - b[1];
    return a[0] - b[0];
  });
  const sorted2 = [p3, p4].sort((a, b) => {
    if (Math.abs(a[0] - b[0]) < 1e-6) return a[1] - b[1];
    return a[0] - b[0];
  });

  const [p1_s, p2_s] = sorted1;
  const [p3_s, p4_s] = sorted2;

  // 垂直共線檢查
  if (Math.abs(p1_s[0] - p2_s[0]) < 1e-6 && Math.abs(p3_s[0] - p4_s[0]) < 1e-6) {
    if (Math.abs(p1_s[0] - p3_s[0]) < 1e-6) {
      // X 相同
      const start = Math.max(p1_s[1], p3_s[1]);
      const end = Math.min(p2_s[1], p4_s[1]);
      return Math.max(0.0, end - start);
    }
  }

  // 水平共線檢查
  if (Math.abs(p1_s[1] - p2_s[1]) < 1e-6 && Math.abs(p3_s[1] - p4_s[1]) < 1e-6) {
    if (Math.abs(p1_s[1] - p3_s[1]) < 1e-6) {
      // Y 相同
      const start = Math.max(p1_s[0], p3_s[0]);
      const end = Math.min(p2_s[0], p4_s[0]);
      return Math.max(0.0, end - start);
    }
  }

  return 0.0;
}

/**
 * 判斷兩線段是否交叉 (忽略端點重合)
 * @param {Array<number>} p1 - 線段1起點
 * @param {Array<number>} p2 - 線段1終點
 * @param {Array<number>} p3 - 線段2起點
 * @param {Array<number>} p4 - 線段2終點
 * @returns {boolean} 是否交叉
 */
function segmentsIntersectBoolean(p1, p2, p3, p4) {
  const p1_2d = p1.slice(0, 2);
  const p2_2d = p2.slice(0, 2);
  const p3_2d = p3.slice(0, 2);
  const p4_2d = p4.slice(0, 2);
  if (
    (p1_2d[0] === p3_2d[0] && p1_2d[1] === p3_2d[1]) ||
    (p1_2d[0] === p4_2d[0] && p1_2d[1] === p4_2d[1]) ||
    (p2_2d[0] === p3_2d[0] && p2_2d[1] === p3_2d[1]) ||
    (p2_2d[0] === p4_2d[0] && p2_2d[1] === p4_2d[1])
  ) {
    return false;
  }

  // 快速排斥
  if (
    Math.max(p1_2d[0], p2_2d[0]) < Math.min(p3_2d[0], p4_2d[0]) ||
    Math.max(p3_2d[0], p4_2d[0]) < Math.min(p1_2d[0], p2_2d[0]) ||
    Math.max(p1_2d[1], p2_2d[1]) < Math.min(p3_2d[1], p4_2d[1]) ||
    Math.max(p3_2d[1], p4_2d[1]) < Math.min(p1_2d[1], p2_2d[1])
  ) {
    return false;
  }

  function crossMul(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }

  return (
    crossMul(p1_2d, p2_2d, p3_2d) * crossMul(p1_2d, p2_2d, p4_2d) < -1e-9 &&
    crossMul(p3_2d, p4_2d, p1_2d) * crossMul(p3_2d, p4_2d, p2_2d) < -1e-9
  );
}

/**
 * 判斷點是否在多邊形內
 * @param {Array<number>} point - 點座標
 * @param {Array<Array<number>>} polygon - 多邊形頂點陣列
 * @returns {boolean} 是否在多邊形內
 */
function pointInPolygon(point, polygon) {
  const [x, y] = point.slice(0, 2);
  const n = polygon.length;
  let inside = false;
  let [p1x, p1y] = polygon[0].slice(0, 2);
  for (let i = 0; i <= n; i++) {
    const [p2x, p2y] = polygon[i % n].slice(0, 2);
    if (y > Math.min(p1y, p2y)) {
      if (y <= Math.max(p1y, p2y)) {
        if (x <= Math.max(p1x, p2x)) {
          let xinters;
          if (p1y !== p2y) {
            xinters = ((y - p1y) * (p2x - p1x)) / (p2y - p1y) + p1x;
          }
          if (p1x === p2x || x <= xinters) {
            inside = !inside;
          }
        }
      }
    }
    [p1x, p1y] = [p2x, p2y];
  }
  return inside;
}

/**
 * 檢查路徑是否意外包圍了其他點
 * @param {Array<number>} originalStart - 原始起點
 * @param {Array<number>} originalEnd - 原始終點
 * @param {Array<Array<number>>} newPath - 新路徑
 * @param {Array<Array<number>>} allNodes - 所有節點陣列
 * @returns {Array<number>|null} 被包圍的節點或 null
 */
function checkEnclosureViolation(originalStart, originalEnd, newPath, allNodes) {
  if (newPath.length <= 2) return null;
  const polygon = [...newPath];
  const startT = JSON.stringify(originalStart.slice(0, 2));
  const endT = JSON.stringify(originalEnd.slice(0, 2));
  const polyXs = polygon.map((p) => p[0]);
  const polyYs = polygon.map((p) => p[1]);
  const minX = Math.min(...polyXs);
  const maxX = Math.max(...polyXs);
  const minY = Math.min(...polyYs);
  const maxY = Math.max(...polyYs);

  for (const node of allNodes) {
    const nt = JSON.stringify(node.slice(0, 2));
    if (nt === startT || nt === endT) continue;
    if (!(minX <= node[0] && node[0] <= maxX && minY <= node[1] && node[1] <= maxY)) continue;
    if (pointInPolygon(node, polygon)) return node;
  }
  return null;
}

/**
 * 找出非法交叉點 (用於評分與繪圖)
 * @param {Array} solutionLinks - 解決方案中的連線陣列
 * @returns {Array<Array<number>>} 交叉點座標陣列
 */
function findIllegalIntersections(solutionLinks) {
  const segments = [];
  for (const link of solutionLinks) {
    const pts = link.points;
    for (let i = 0; i < pts.length - 1; i++) {
      segments.push({ p1: pts[i], p2: pts[i + 1] });
    }
  }
  const collisionPoints = new Set();
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s1 = segments[i];
      const s2 = segments[j];
      const [p1, p2, p3, p4] = [s1.p1, s1.p2, s2.p1, s2.p2];
      if (
        (p1[0] === p3[0] && p1[1] === p3[1]) ||
        (p1[0] === p4[0] && p1[1] === p4[1]) ||
        (p2[0] === p3[0] && p2[1] === p3[1]) ||
        (p2[0] === p4[0] && p2[1] === p4[1])
      ) {
        continue;
      }

      const [x1, y1] = p1.slice(0, 2);
      const [x2, y2] = p2.slice(0, 2);
      const [x3, y3] = p3.slice(0, 2);
      const [x4, y4] = p4.slice(0, 2);
      const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
      if (Math.abs(denom) < 1e-10) continue;
      const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
      const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
      if (0.001 < ua && ua < 0.999 && 0.001 < ub && ub < 0.999) {
        const ix = x1 + ua * (x2 - x1);
        const iy = y1 + ua * (y2 - y1);
        collisionPoints.add(JSON.stringify([ix, iy]));
      }
    }
  }
  return Array.from(collisionPoints).map((s) => JSON.parse(s));
}

// ==========================================
// 3. 優化邏輯 (Embed & Generator)
// ==========================================

/**
 * [核心修正] 將真實車站嵌入到新的幾何路徑上
 * 1. 計算路徑總長。
 * 2. 將中間車站「均勻」分佈在路徑上 (Schematization 標準做法)。
 * 3. 插入幾何轉折點，並標記 node_type='line' (隱形點)。
 * @param {Array<Array<number>>} geometryPoints - 幾何轉折點陣列
 * @param {Array<Object>} intermediateNodes - 中間節點屬性陣列
 * @param {Object} startProps - 起點屬性
 * @param {Object} endProps - 終點屬性
 * @returns {Array} [finalPoints, finalNodes]
 */
function embedNodesIntoPath(geometryPoints, intermediateNodes, startProps, endProps) {
  if (!geometryPoints || geometryPoints.length === 0) return [[], []];

  // 1. 計算路徑幾何結構
  let totalLength = 0;
  const segmentInfos = [];
  const cumulativeDist = [0];

  for (let i = 0; i < geometryPoints.length - 1; i++) {
    const d = dist(geometryPoints[i], geometryPoints[i + 1]);
    segmentInfos.push({
      len: d,
      p1: geometryPoints[i],
      p2: geometryPoints[i + 1],
      startDist: totalLength,
    });
    totalLength += d;
    cumulativeDist.push(totalLength);
  }

  const events = [];

  // A. 起點 (Priority 0)
  events.push({ dist: 0, pt: geometryPoints[0], props: startProps, priority: 0 });

  // B. 幾何轉折點 (Priority 1) -> 標記為 'line' (繪圖時會忽略)
  for (let i = 1; i < geometryPoints.length - 1; i++) {
    const d = cumulativeDist[i];
    events.push({ dist: d, pt: geometryPoints[i], props: { node_type: 'line' }, priority: 1 });
  }

  // C. 終點 (Priority 2)
  events.push({
    dist: totalLength,
    pt: geometryPoints[geometryPoints.length - 1],
    props: endProps,
    priority: 2,
  });

  // D. 中間車站 (Priority 1) -> 均勻分佈
  const numInter = intermediateNodes.length;
  if (numInter > 0 && totalLength > 0) {
    const step = totalLength / (numInter + 1);
    let currentTarget = step;
    for (let i = 0; i < intermediateNodes.length; i++) {
      const nodeProps = intermediateNodes[i];
      let foundCoord = geometryPoints[0];
      // 根據距離尋找座標
      for (const seg of segmentInfos) {
        if (seg.startDist <= currentTarget && currentTarget <= seg.startDist + seg.len + 1e-9) {
          const ratio = seg.len > 0 ? (currentTarget - seg.startDist) / seg.len : 0;
          const nx = seg.p1[0] + (seg.p2[0] - seg.p1[0]) * ratio;
          const ny = seg.p1[1] + (seg.p2[1] - seg.p1[1]) * ratio;
          foundCoord = [nx, ny];
          break;
        }
      }
      events.push({ dist: currentTarget, pt: foundCoord, props: nodeProps, priority: 1 });
      currentTarget += step;
    }
  }

  // 依照距離排序
  events.sort((a, b) => a.dist - b.dist);

  const finalPoints = events.map((e) => e.pt);
  const finalNodes = events.map((e) => e.props);

  return [finalPoints, finalNodes];
}

/**
 * 產生幾何候選路徑 (直線、L型、Z型)
 * @param {Array<number>} pStart - 起點座標
 * @param {Array<number>} pEnd - 終點座標
 * @param {number} numSamples - 樣本數量
 * @returns {Array} 候選路徑陣列，每個元素為 [points, type]
 */
function generateFullResampleCandidates(pStart, pEnd, numSamples = 25) {
  const [x1, y1] = pStart.slice(0, 2);
  const [x2, y2] = pEnd.slice(0, 2);
  const candidates = [];

  // 0. 直線
  if (Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6) {
    return [[[pStart, pEnd], 'Straight']];
  }

  // 1. L型
  candidates.push([[pStart, [x2, y1], pEnd], 'L-Shape']);
  candidates.push([[pStart, [x1, y2], pEnd], 'L-Shape']);

  // 2. Z型 (隨機採樣轉折點)
  for (let i = 0; i < numSamples; i++) {
    // 水平優先
    const mx = x1 + (x2 - x1) * (Math.random() * 0.8 + 0.1);
    candidates.push([[pStart, [mx, y1], [mx, y2], pEnd], 'Z-Shape']);
    // 垂直優先
    const my = y1 + (y2 - y1) * (Math.random() * 0.8 + 0.1);
    candidates.push([[pStart, [x1, my], [x2, my], pEnd], 'Z-Shape']);
  }

  return candidates;
}

/**
 * 計算路徑評分 (越低越好)
 * @param {Array<Array<number>>} targetPath - 目標路徑
 * @param {Array} solution - 當前解決方案
 * @param {number} currentIdx - 當前索引
 * @param {Array} allNodesList - 所有節點列表
 * @returns {Object} {score, overlapsLen, collisions, turns}
 */
// eslint-disable-next-line no-unused-vars
function calculateScoreSmart(targetPath, solution, currentIdx, allNodesList) {
  let overlapsLen = 0.0;
  let collisions = 0;
  const targetSegs = [];
  for (let i = 0; i < targetPath.length - 1; i++) {
    targetSegs.push([targetPath[i].slice(0, 2), targetPath[i + 1].slice(0, 2)]);
  }

  for (let otherIdx = 0; otherIdx < solution.length; otherIdx++) {
    if (otherIdx === currentIdx) continue;
    const otherPath = solution[otherIdx].points;
    const otherSegs = [];
    for (let k = 0; k < otherPath.length - 1; k++) {
      otherSegs.push([otherPath[k].slice(0, 2), otherPath[k + 1].slice(0, 2)]);
    }

    for (const ts of targetSegs) {
      for (const osSeg of otherSegs) {
        // 懲罰重疊
        overlapsLen += getSegmentOverlapLength(ts, osSeg);
        // 懲罰交叉
        if (segmentsIntersectBoolean(ts[0], ts[1], osSeg[0], osSeg[1])) {
          collisions++;
        }
      }
    }
  }

  const turns = Math.max(0, targetPath.length - 2);
  const totalLen = targetPath.reduce((sum, p, i) => {
    if (i < targetPath.length - 1) return sum + dist(p, targetPath[i + 1]);
    return sum;
  }, 0);

  // 權重設定：交叉最嚴重 > 重疊 > 轉折 > 長度
  const score = collisions * 1e9 + overlapsLen * 1e7 + turns * 50000 + totalLen * 1;
  return { score, overlapsLen, collisions, turns };
}

/**
 * 優化迭代生成器
 * @param {Array} initialSolution - 初始解決方案
 * @param {Set|Array} allNodes - 所有節點集合或陣列
 * @returns {Generator} 優化迭代生成器
 */
function* optimizationGenerator(initialSolution, allNodes) {
  let solution = JSON.parse(JSON.stringify(initialSolution));
  const allNodesList = Array.isArray(allNodes) ? allNodes : Array.from(allNodes);
  let iterationCounter = 0;
  const maxEpochs = 150; // 最大迭代輪數
  const tabuMap = {}; // 防止反覆震盪

  while (iterationCounter < maxEpochs) {
    iterationCounter++;
    let flipsInThisEpoch = 0;
    const indices = Array.from({ length: solution.length }, (_, i) => i);
    // 隨機打亂
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (const originalIdx of indices) {
      if (iterationCounter < (tabuMap[originalIdx] || 0)) continue;

      const link = solution[originalIdx];
      const pts = link.points;
      const nodes = link.nodes || [];
      const [pStart, pEnd] = [pts[0], pts[pts.length - 1]];

      // [關鍵] 提取真實車站，過濾掉上一步產生的空幾何點 (node_type='line')
      const intermediateNodes = [];
      if (nodes.length > 2) {
        for (let i = 1; i < nodes.length - 1; i++) {
          const n = nodes[i];
          if (isRealStation(n)) {
            intermediateNodes.push(n);
          }
        }
      }

      const startProps = nodes[0] || {};
      const endProps = nodes[nodes.length - 1] || {};

      const currResult = calculateScoreSmart(pts, solution, originalIdx, allNodesList);
      // 如果已經是直線且無碰撞重疊，則不需變動
      if (currResult.collisions === 0 && currResult.overlapsLen === 0 && pts.length <= 2) {
        continue;
      }

      let bestRes = null;
      let bestScore = currResult.score;
      const candidates = generateFullResampleCandidates(pStart, pEnd);

      for (const [candGeom] of candidates) {
        if (checkEnclosureViolation(pStart, pEnd, candGeom, allNodesList)) continue;
        const cResult = calculateScoreSmart(candGeom, solution, originalIdx, allNodesList);

        // 不允許讓交叉變多 (嚴格條件)
        if (cResult.collisions > currResult.collisions || (currResult.collisions === 0 && cResult.collisions > 0)) {
          continue;
        }

        // 必須有顯著改善才替換
        if (cResult.score < bestScore - 20.0) {
          bestScore = cResult.score;
          bestRes = candGeom;
        }
      }

      if (bestRes) {
        // 重新嵌入：將真實車站放到新幾何上
        const [newPoints, newNodes] = embedNodesIntoPath(
          bestRes,
          intermediateNodes,
          startProps,
          endProps
        );
        solution[originalIdx].points = newPoints;
        solution[originalIdx].nodes = newNodes;
        solution[originalIdx].length = newPoints.length;

        flipsInThisEpoch++;
        tabuMap[originalIdx] = iterationCounter + 3; // 鎖定幾輪
      }
    }

    yield {
      iteration: iterationCounter,
      totalFlips: flipsInThisEpoch,
      fullSolution: JSON.parse(JSON.stringify(solution)),
    };

    // 如果這一輪沒有任何優化，提前結束
    if (flipsInThisEpoch === 0) break;
  }
}

// ==========================================
// 4. 視覺化 (White-list Plotting)
// ==========================================
/**
 * 取得路線顏色
 * @param {Object} props - 屬性物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getColor(props) {
  let p = props.way_properties?.tags || {};
  if (!p || Object.keys(p).length === 0) p = props.properties || {};
  if (!p || Object.keys(p).length === 0) p = props;
  return p.colour || p.color || '#555555';
}

/**
 * 繪製最終對照圖
 * @param {Array} beforeData - 處理前的資料
 * @param {Array} afterSolution - 處理後的解決方案
 */
// eslint-disable-next-line no-unused-vars
function plotFinalComparison(beforeData, afterSolution) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log('[視覺化] Final Comparison: Input vs Output');
}

// ==========================================
// 5. 主程式執行
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_3_to_2_4(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_3Layer = dataStore.findLayerById('taipei_2_3');
  const taipei2_4Layer = dataStore.findLayerById('taipei_2_4');

  // ==========================================
  // 1. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 2.3 的 Z-Layout 結果
  const inputJsonFilename = taipei2_3Layer ? 'taipei_2_3 (in-memory)' : 'taipei_2_3';
  // 輸出：Step 2.4 最終優化結果 (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_3 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_4 圖層`);
  console.log('='.repeat(60));

  if (!taipei2_3Layer || !taipei2_3Layer.spaceNetworkGridJsonData) {
    console.error(`❌ [錯誤] 找不到輸入檔案: ${inputJsonFilename}`);
    console.error('請先執行 Colab 3');
    throw new Error(`找不到輸入檔案: ${inputJsonFilename}`);
  }

  try {
    const initialData = JSON.parse(JSON.stringify(taipei2_3Layer.spaceNetworkGridJsonData));

    // 收集端點用於拓撲檢查 (Enclosure Check)
    const allPointsSet = new Set();
    for (const s of initialData) {
      allPointsSet.add(JSON.stringify(s.points[0].slice(0, 2)));
      allPointsSet.add(JSON.stringify(s.points[s.points.length - 1].slice(0, 2)));
    }

    console.log('🚀 開始自動優化 (迭代次數上限: 150)...');
    console.log('   - 目標: 減少重疊與交叉');
    console.log('   - 修正: 隱藏幾何轉折點，保留真實車站黑點');

    const optimizerGen = optimizationGenerator(initialData, allPointsSet);
    let currentBestSolution = initialData;

    const startTime = Date.now();
    let totalFlips = 0;
    let finalIteration = 0;

    try {
      for (const stepData of optimizerGen) {
        currentBestSolution = stepData.fullSolution;
        const iteration = stepData.iteration;
        const flips = stepData.totalFlips;
        finalIteration = iteration;
        totalFlips += flips;

        if (flips > 0) {
          console.log(`  > Iteration ${iteration}: ${flips} segments optimized.`);
        }
      }

      const totalTime = (Date.now() - startTime) / 1000;

      // 存檔
      console.log('\n🚀 儲存最終優化結果...');
      if (!taipei2_4Layer) {
        throw new Error('找不到 taipei_2_4 圖層');
      }

      taipei2_4Layer.spaceNetworkGridJsonData = currentBestSolution;
      console.log(`✅ 資料已傳給 taipei_2_4 圖層`);

      console.log(`\n✅ 優化結束，結果已儲存。`);
      console.log(`   - 總迭代次數: ${finalIteration}`);
      console.log(`   - 總翻轉次數: ${totalFlips}`);
      console.log(`   - 總耗時: ${totalTime.toFixed(2)} 秒`);

      // 繪圖
      console.log('\n🚀 產生對照圖 (Input vs Output)...');
      // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
      plotFinalComparison(initialData, currentBestSolution);

      // 自動開啟 taipei_2_4 圖層以便查看結果
      if (!taipei2_4Layer.visible) {
        taipei2_4Layer.visible = true;
        dataStore.saveLayerState('taipei_2_4', { visible: true });
      }

      // 產生摘要並存到 dashboardData
      const finalReds = findIllegalIntersections(currentBestSolution);
      const dashboardData = {
        totalFlips: totalFlips,
        totalIterations: finalIteration,
        segmentCount: currentBestSolution.length,
        collisionsCount: finalReds.length,
        duration: parseFloat(totalTime.toFixed(2)),
      };

      taipei2_4Layer.dashboardData = dashboardData;
    } catch (error) {
      console.error(`❌ 錯誤: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
