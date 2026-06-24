// # @title Colab 2-3: 隨機L與Z型配置
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 2.2 的示意化資料 (02_schematized_*.json)。
// 2. 執行「Z-Layout 演算法」：
//    - 將每一條路段 (Link) 嘗試變形為 L 型或 Z 型 (Ortho-schematization)。
//    - [關鍵] Station Injection: 變形後，將原本位於路段中間的車站 (黑點)，
//      依照比例重新「注入」回新的幾何路徑上。
// 3. 最佳化迴圈：
//    - 隨機嘗試多種 Z 型組合，尋找「交叉數 (Collisions)」最少的解。
// 4. 視覺化回饋：
//    - [新增] 若發生交叉，使用紅色 'X' 標記錯誤位置。
//    - 顯示黑點 (一般站) 與紅點 (轉乘站/端點)。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 2. 幾何核心演算法
// ==========================================
/**
 * 計算兩點距離
 * @param {Array<number>} p1 - 點1座標 [x, y]
 * @param {Array<number>} p2 - 點2座標 [x, y]
 * @returns {number} 距離
 */
function dist(p1, p2) {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}

/**
 * 計算路徑上每個點的累積距離比例 (0.0 ~ 1.0)
 * @param {Array<Array<number>>} points - 點座標陣列
 * @returns {Array<number>} 比例陣列
 */
function getPathRatios(points) {
  const dists = [0.0];
  let total = 0.0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = dist(points[i], points[i + 1]);
    total += d;
    dists.push(total);
  }
  if (total === 0) return new Array(points.length).fill(0.0);
  return dists.map((d) => d / total);
}

/**
 * 在 p1, p2 線段上根據比例插值
 * @param {Array<number>} p1 - 起點
 * @param {Array<number>} p2 - 終點
 * @param {number} ratio - 比例 (0.0 ~ 1.0)
 * @returns {Array<number>} 插值點座標
 */
function interpolatePoint(p1, p2, ratio) {
  return [p1[0] + (p2[0] - p1[0]) * ratio, p1[1] + (p2[1] - p1[1]) * ratio];
}

/**
 * 檢查兩線段是否共線且重疊
 * @param {Array} s1 - 線段1 [[x1, y1], [x2, y2]]
 * @param {Array} s2 - 線段2 [[x3, y3], [x4, y4]]
 * @returns {boolean} 是否重疊
 */
function isCollinearOverlap(s1, s2) {
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

  // 垂直線重疊檢查
  if (Math.abs(p1_s[0] - p2_s[0]) < 1e-6 && Math.abs(p3_s[0] - p4_s[0]) < 1e-6) {
    if (Math.abs(p1_s[0] - p3_s[0]) < 1e-6) {
      return Math.max(p1_s[1], p3_s[1]) < Math.min(p2_s[1], p4_s[1]) - 1e-4;
    }
  }

  // 水平線重疊檢查
  if (Math.abs(p1_s[1] - p2_s[1]) < 1e-6 && Math.abs(p3_s[1] - p4_s[1]) < 1e-6) {
    if (Math.abs(p1_s[1] - p3_s[1]) < 1e-6) {
      return Math.max(p1_s[0], p3_s[0]) < Math.min(p2_s[0], p4_s[0]) - 1e-4;
    }
  }
  return false;
}

/**
 * 檢查新路徑是否與已放置的路徑重疊 (Overlap)
 * @param {Array<Array<number>>} newPath - 新路徑
 * @param {Array} placedSegmentsGeometry - 已放置的線段幾何
 * @returns {boolean} 是否重疊
 */
function checkSegmentOverlap(newPath, placedSegmentsGeometry) {
  const newSegs = [];
  for (let i = 0; i < newPath.length - 1; i++) {
    newSegs.push([newPath[i], newPath[i + 1]]);
  }
  for (const ns of newSegs) {
    for (const ps of placedSegmentsGeometry) {
      if (ps.length !== 2) continue;
      if (isCollinearOverlap(ns, ps)) return true;
    }
  }
  return false;
}

/**
 * 判斷兩線段是否交叉 (布林值)
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

  // 共享端點不算交叉
  if (
    (p1_2d[0] === p3_2d[0] && p1_2d[1] === p3_2d[1]) ||
    (p1_2d[0] === p4_2d[0] && p1_2d[1] === p4_2d[1]) ||
    (p2_2d[0] === p3_2d[0] && p2_2d[1] === p3_2d[1]) ||
    (p2_2d[0] === p4_2d[0] && p2_2d[1] === p4_2d[1])
  ) {
    return false;
  }

  function crossMul(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }

  // 快速排斥實驗
  if (
    Math.max(p1_2d[0], p2_2d[0]) < Math.min(p3_2d[0], p4_2d[0]) ||
    Math.max(p3_2d[0], p4_2d[0]) < Math.min(p1_2d[0], p2_2d[0]) ||
    Math.max(p1_2d[1], p2_2d[1]) < Math.min(p3_2d[1], p4_2d[1]) ||
    Math.max(p3_2d[1], p4_2d[1]) < Math.min(p1_2d[1], p2_2d[1])
  ) {
    return false;
  }

  return (
    crossMul(p1_2d, p2_2d, p3_2d) * crossMul(p1_2d, p2_2d, p4_2d) < 0 &&
    crossMul(p3_2d, p4_2d, p1_2d) * crossMul(p3_2d, p4_2d, p2_2d) < 0
  );
}

/**
 * 取得兩線段的交叉點座標
 * @param {Array<number>} p1 - 線段1起點
 * @param {Array<number>} p2 - 線段1終點
 * @param {Array<number>} p3 - 線段2起點
 * @param {Array<number>} p4 - 線段2終點
 * @returns {Array<number>|null} 交叉點座標或 null
 */
function getLineIntersection(p1, p2, p3, p4) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 1e-10) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  if (0.001 < ua && ua < 0.999 && 0.001 < ub && ub < 0.999) {
    return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
  }
  return null;
}

/**
 * 判斷點是否在多邊形內 (用於圍欄檢查)
 * @param {Array<number>} point - 點座標 [x, y]
 * @param {Array<Array<number>>} polygon - 多邊形頂點陣列
 * @returns {boolean} 是否在多邊形內
 */
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  const n = polygon.length;
  let inside = false;
  let [p1x, p1y] = polygon[0];
  for (let i = 0; i <= n; i++) {
    const p2 = polygon[i % n];
    const [p2x, p2y] = p2;
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

// ==========================================
// 3. 邏輯與輔助工具
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
 * 找出所有非法的交叉點座標 (用於畫紅色 X)
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
      // 忽略共享端點
      if (
        (p1[0] === p3[0] && p1[1] === p3[1]) ||
        (p1[0] === p4[0] && p1[1] === p4[1]) ||
        (p2[0] === p3[0] && p2[1] === p3[1]) ||
        (p2[0] === p4[0] && p2[1] === p4[1])
      ) {
        continue;
      }
      const interPt = getLineIntersection(p1, p2, p3, p4);
      if (interPt) {
        let isNode = false;
        // 如果交叉點非常靠近端點，視為節點而非錯誤
        for (const p of [p1, p2, p3, p4]) {
          if (dist(interPt, p) < 0.01) {
            isNode = true;
            break;
          }
        }
        if (!isNode) {
          collisionPoints.add(JSON.stringify(interPt));
        }
      }
    }
  }
  return Array.from(collisionPoints).map((s) => JSON.parse(s));
}

/**
 * 快速計算碰撞次數 (最佳化用)
 * @param {Array<Array<number>>} newPoints - 新路徑點陣列
 * @param {Array} existingSegmentsGeometry - 已存在的線段幾何
 * @returns {number} 碰撞次數
 */
function countCollisionsFast(newPoints, existingSegmentsGeometry) {
  let count = 0;
  const newSegs = [];
  for (let i = 0; i < newPoints.length - 1; i++) {
    newSegs.push([newPoints[i], newPoints[i + 1]]);
  }
  for (const segNew of newSegs) {
    for (const segOld of existingSegmentsGeometry) {
      if (segmentsIntersectBoolean(segNew[0], segNew[1], segOld[0], segOld[1])) {
        count++;
      }
    }
  }
  return count;
}

/**
 * 檢查路徑是否意外包圍了其他站點 (Enclosure Check)
 * @param {Array<number>} originalStart - 原始起點
 * @param {Array<number>} originalEnd - 原始終點
 * @param {Array<Array<number>>} newPath - 新路徑
 * @param {Array<Array<number>>} allNodes - 所有節點陣列
 * @returns {boolean} 是否違反圍欄規則
 */
function checkEnclosureViolation(originalStart, originalEnd, newPath, allNodes) {
  if (newPath.length <= 2) return false;
  const polygon = [...newPath];
  const polyXs = polygon.map((p) => p[0]);
  const polyYs = polygon.map((p) => p[1]);
  const minX = Math.min(...polyXs);
  const maxX = Math.max(...polyXs);
  const minY = Math.min(...polyYs);
  const maxY = Math.max(...polyYs);
  const startT = JSON.stringify(originalStart.slice(0, 2));
  const endT = JSON.stringify(originalEnd.slice(0, 2));

  for (const node of allNodes) {
    const nt = JSON.stringify(node.slice(0, 2));
    if (nt === startT || nt === endT) continue;
    // 簡單邊界框篩選
    if (!(minX <= node[0] && node[0] <= maxX && minY <= node[1] && node[1] <= maxY)) continue;
    if (pointInPolygon(node, polygon)) return true;
  }
  return false;
}

// ==========================================
// 4. 生成器與求解器 (含站點注入邏輯)
// ==========================================
/**
 * 取得所有關鍵節點 (端點與交會點)
 * @param {Array} strokes - 線段陣列
 * @returns {Set<string>} 關鍵節點集合（JSON 字串格式，用於比較）
 */
function getKeyNodes(strokes) {
  const pointCounts = new Map();
  for (const stroke of strokes) {
    const points = stroke.points || [];
    const nodes = stroke.nodes || [];
    if (points.length > 0) {
      const startKey = JSON.stringify(points[0]);
      const endKey = JSON.stringify(points[points.length - 1]);
      pointCounts.set(startKey, (pointCounts.get(startKey) || 0) + 1);
      pointCounts.set(endKey, (pointCounts.get(endKey) || 0) + 1);
    }
    if (nodes.length === points.length) {
      for (let i = 0; i < points.length; i++) {
        const props = nodes[i] || {};
        if (props.node_type === 'connect') {
          const ptKey = JSON.stringify(points[i]);
          pointCounts.set(ptKey, (pointCounts.get(ptKey) || 0) + 1);
        }
      }
    }
  }
  // 返回 JSON 字串的 Set，用於快速比較
  return new Set(Array.from(pointCounts.keys()));
}

/**
 * 將路線分解為最小單位 (Link)，並提取中間站點資訊
 * @param {Array} strokes - 線段陣列
 * @param {Set} keyNodes - 關鍵節點集合
 * @returns {Array} 連線陣列
 */
function decomposeToLinks(strokes, keyNodes) {
  const links = [];
  for (const stroke of strokes) {
    const points = stroke.points || [];
    const nodes = stroke.nodes || new Array(points.length).fill({});
    const routeName = stroke.name;
    const originalProps = stroke;
    let startIdx = 0;

    for (let i = 1; i < points.length; i++) {
      const pCoord = JSON.stringify(points[i]);
      const isKeyNode = keyNodes.has(pCoord);
      if (isKeyNode || i === points.length - 1) {
        const segPoints = points.slice(startIdx, i + 1);
        const segNodes = nodes.slice(startIdx, i + 1);
        const startProps = segNodes[0] || {};
        const endProps = segNodes[segNodes.length - 1] || {};

        // 計算此段落中所有站點的相對比例
        const ratios = getPathRatios(segPoints);
        const intermediateStations = [];

        // 遍歷中間點，保留有意義的站點 (排除頭尾)
        for (let k = 1; k < segNodes.length - 1; k++) {
          const n = segNodes[k] || {};

          // 強制保留所有原始中間節點，確保輸入輸出結構一致 (黑點不消失)
          intermediateStations.push({ ratio: ratios[k], props: n });
        }

        const link = {
          start_coord: points[startIdx],
          end_coord: points[i],
          start_props: startProps,
          end_props: endProps,
          route_name: routeName,
          original_props: originalProps,
          stations: intermediateStations, // 暫存中間站點資料
        };
        links.push(link);
        startIdx = i;
      }
    }
  }
  return links;
}

/**
 * 生成各種 L 型或 Z 型的路徑候選
 * @param {Array<number>} pStart - 起點座標
 * @param {Array<number>} pEnd - 終點座標
 * @param {number} numSamples - 樣本數量
 * @returns {Array<Array<Array<number>>>} 候選路徑陣列
 */
function generateZPathCandidates(pStart, pEnd, numSamples = 10) {
  const startPt = [pStart[0], pStart[1]];
  const endPt = [pEnd[0], pEnd[1]];
  const [x1, y1] = startPt;
  const [x2, y2] = endPt;
  if (Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6) {
    return [[startPt, endPt]];
  }

  const candidates = [];
  candidates.push([startPt, [x2, y1], endPt]); // L型 1
  candidates.push([startPt, [x1, y2], endPt]); // L型 2

  // 隨機 Z 型 (水平優先)
  for (let i = 0; i < numSamples; i++) {
    const r = Math.random() * 0.8 + 0.1; // 0.1 到 0.9
    const midX = x1 + (x2 - x1) * r;
    candidates.push([startPt, [midX, y1], [midX, y2], endPt]);
  }

  // 隨機 Z 型 (垂直優先)
  for (let i = 0; i < numSamples; i++) {
    const r = Math.random() * 0.8 + 0.1; // 0.1 到 0.9
    const midY = y1 + (y2 - y1) * r;
    candidates.push([startPt, [x1, midY], [x2, midY], endPt]);
  }

  // 隨機打亂
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates;
}

/**
 * [核心修復] Station Injection
 * 將保存的站點根據比例注入到新的 Z 字型路徑上。
 * @param {Array<Array<number>>} corners - 轉折點陣列
 * @param {Array} stations - 站點陣列（含 ratio 和 props）
 * @param {Object} startProps - 起點屬性
 * @param {Object} endProps - 終點屬性
 * @returns {Array} [finalPoints, finalNodes]
 */
function mergeStationsIntoPath(corners, stations, startProps, endProps) {
  if (!stations || stations.length === 0) {
    // 如果沒有中間站，只構建轉折點
    const finalPoints = [...corners];
    const finalNodes = [startProps, ...new Array(corners.length - 2).fill({}), endProps];
    return [finalPoints, finalNodes];
  }

  const cornerRatios = getPathRatios(corners); // 計算新路徑的轉折點比例

  const finalPoints = [corners[0]];
  const finalNodes = [startProps];

  let stationIdx = 0;
  // 遍歷每一段幾何線段 (Corner i -> Corner i+1)
  for (let i = 0; i < corners.length - 1; i++) {
    const pStart = corners[i];
    const pEnd = corners[i + 1];
    const rStart = cornerRatios[i];
    const rEnd = cornerRatios[i + 1];

    // 找出所有比例落在這一段的車站
    while (stationIdx < stations.length) {
      const st = stations[stationIdx];
      // 判斷站點是否在此區間 (包含等於 r_end 的情況)
      if (st.ratio <= rEnd + 1e-6) {
        // 計算在此線段上的局部比例
        const segLen = rEnd - rStart;
        let localRatio;
        if (segLen > 0) {
          localRatio = (st.ratio - rStart) / segLen;
        } else {
          localRatio = 1.0; // 重疊點
        }

        const newPt = interpolatePoint(pStart, pEnd, localRatio);
        finalPoints.push(newPt);
        finalNodes.push(st.props);
        stationIdx++;
      } else {
        break;
      }
    }

    // 加入轉折點 (如果是最後一個點，會在迴圈外處理)
    // 轉折點通常是純幾何點，屬性為空 dict
    if (i < corners.length - 2) {
      finalPoints.push(pEnd);
      finalNodes.push({});
    }
  }

  // 加入終點
  finalPoints.push(corners[corners.length - 1]);
  finalNodes.push(endProps);

  return [finalPoints, finalNodes];
}

/**
 * 互動式求解器
 * @param {Array} links - 連線陣列
 * @param {Set} allNodes - 所有節點集合
 * @param {number} maxAttempts - 最大嘗試次數
 * @param {Function} liveCallback - 即時回調函數
 * @returns {Object} 求解結果
 */
function solveLayoutLive(links, allNodes, maxAttempts = 500, liveCallback = null) {
  const startTime = Date.now();
  let globalBestSolution = null;
  let globalMinRealIntersections = Infinity;
  let bestAttemptNum = 0;
  const allNodesList = Array.isArray(allNodes) ? allNodes : Array.from(allNodes);
  let bestRedCoords = [];
  let finalAttemptCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    finalAttemptCount = attempt;

    // 隨機打亂 links
    const shuffledLinks = [...links];
    for (let i = shuffledLinks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledLinks[i], shuffledLinks[j]] = [shuffledLinks[j], shuffledLinks[i]];
    }

    const currentSolution = [];
    const placedSegmentsGeom = []; // 碰撞偵測用的純幾何線段

    for (const link of shuffledLinks) {
      const [pStart, pEnd] = [link.start_coord, link.end_coord];
      const candidates = generateZPathCandidates(pStart, pEnd, 15);

      // 1. 選擇最佳 Z 路徑 (幾何層面)
      let bestPath = null;
      let minLocalCollisions = Infinity;

      // 篩選合法路徑
      const validCandidates = [];
      for (const path of candidates) {
        if (checkSegmentOverlap(path, placedSegmentsGeom)) continue;
        if (checkEnclosureViolation(pStart, pEnd, path, allNodesList)) continue;
        validCandidates.push(path);
      }
      const finalCandidates = validCandidates.length > 0 ? validCandidates : candidates;

      // 在合法路徑中選碰撞最少的
      for (const path of finalCandidates) {
        const collisions = countCollisionsFast(path, placedSegmentsGeom);
        if (collisions < minLocalCollisions) {
          minLocalCollisions = collisions;
          bestPath = path;
        }
        if (collisions === 0) break;
      }

      if (bestPath === null) {
        bestPath = [pStart, pEnd];
      }

      // 2. [關鍵] 將中間站點注入到最佳幾何路徑中
      const [finalPoints, finalNodes] = mergeStationsIntoPath(
        bestPath,
        link.stations,
        link.start_props,
        link.end_props
      );

      // 3. 構建輸出物件
      const outputItem = JSON.parse(JSON.stringify(link.original_props));
      outputItem.points = finalPoints;
      outputItem.nodes = finalNodes;
      // 更新長度
      outputItem.length = finalPoints.length;
      if (outputItem.segment_counts) {
        outputItem.segment_counts = [finalPoints.length];
      }

      currentSolution.push(outputItem);

      // 更新碰撞偵測用的幾何
      for (let i = 0; i < bestPath.length - 1; i++) {
        placedSegmentsGeom.push([bestPath[i], bestPath[i + 1]]);
      }
    }

    // 計算真實錯誤 (交叉點)
    const realIntersections = findIllegalIntersections(currentSolution);
    const numRedDots = realIntersections.length;

    const isNewBest = attempt === 1 || numRedDots < globalMinRealIntersections;
    if (isNewBest) {
      globalMinRealIntersections = numRedDots;
      globalBestSolution = JSON.parse(JSON.stringify(currentSolution));
      bestRedCoords = realIntersections;
      bestAttemptNum = attempt;
    }

    if (liveCallback) {
      const elapsed = (Date.now() - startTime) / 1000;
      liveCallback(
        attempt,
        numRedDots,
        globalMinRealIntersections,
        elapsed,
        isNewBest,
        globalBestSolution,
        bestRedCoords
      );
    }

    if (globalMinRealIntersections === 0) {
      break;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  return {
    solution: globalBestSolution,
    redsCount: globalMinRealIntersections,
    bestAttemptNum,
    duration,
    finalAttemptCount,
    bestRedCoords,
  };
}

// ==========================================
// 5. 視覺化 (顯示黑點與紅色X)
// ==========================================
/**
 * 繪製兩個階段的對照圖
 * @param {Array} beforeData - 處理前的資料
 * @param {Array} step2Sol - Step 2 解決方案
 * @param {Array} step2Reds - Step 2 紅色錯誤點
 * @param {number} step2Time - Step 2 執行時間
 * @param {string} statusText - 狀態文字
 */
// eslint-disable-next-line no-unused-vars
function plotTwoStages(beforeData, step2Sol, step2Reds, step2Time, statusText = '') {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] ${statusText}`);
}

/**
 * 產生互動式 Plotly HTML
 * @param {Array} solution - 解決方案
 * @param {string} outputHtml - 輸出 HTML 路徑
 */
// eslint-disable-next-line no-unused-vars
function createPlotlyFinal(solution, outputHtml) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] Plotly Final Result`);
}

// ==========================================
// 6. 主程式執行
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_2_to_2_3(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_2Layer = dataStore.findLayerById('taipei_2_2');
  const taipei2_3Layer = dataStore.findLayerById('taipei_2_3');

  // ==========================================
  // 1. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 2.2 示意化後的檔案
  const inputJsonFilename = taipei2_2Layer ? 'taipei_2_2 (in-memory)' : 'taipei_2_2';
  // 輸出：Step 2.3 Z-Layout 後的檔案 (已直接傳給下一個圖層)

  // [參數] 最大嘗試次數
  const MAX_ATTEMPTS = 500;

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_2 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_3 圖層`);
  console.log(`   - 最大嘗試次數: ${MAX_ATTEMPTS}`);
  console.log('='.repeat(60));

  if (!taipei2_2Layer || !taipei2_2Layer.spaceNetworkGridJsonData) {
    console.error(`❌ [錯誤] 找不到檔案: ${inputJsonFilename}`);
    console.error('請確認 Colab 5 / Step 2.2 是否已執行並產生檔案。');
    throw new Error(`找不到檔案: ${inputJsonFilename}`);
  }

  try {
    // --- [Step A] 讀取資料 ---
    console.log('\n🚀 [Step A] 讀取直線性資料 (Straightened Data)...');
    const dataStep2 = taipei2_2Layer.spaceNetworkGridJsonData;
    console.log(`   -> 讀取 ${dataStep2.length} 條線段。`);

    // 建立所有點的集合
    const allPointsSet = new Set();
    for (const s of dataStep2) {
      for (const p of s.points) {
        allPointsSet.add(JSON.stringify(p));
      }
    }
    const allNodesList = Array.from(allPointsSet).map((s) => JSON.parse(s));

    // --- [Step B] 找出關鍵節點並分解為連線 ---
    console.log('\n🚀 [Step B] 找出關鍵節點並分解為連線...');
    const keyNodes = getKeyNodes(dataStep2);
    const baseLinks = decomposeToLinks(dataStep2, keyNodes);
    console.log(`✅ 已載入 ${baseLinks.length} 條路段，準備進行 Z-Layout 最佳化。`);

    // --- [Step C] 執行最佳化 ---
    console.log(`\n🚀 [Step C] 執行 Z-Layout 最佳化 (最大嘗試次數: ${MAX_ATTEMPTS})...`);

    // 即時回調函數
    // eslint-disable-next-line no-unused-vars
    const liveCallback = (attempt, currRed, bestRed, elapsed, isNewBest, bestSol, bestRedsCoords) => {
      if (attempt % 50 === 0 || isNewBest) {
        console.log(
          `  執行中: 第 ${attempt} 次 | 錯誤紅點數: ${bestRed} | 耗時: ${elapsed.toFixed(1)} 秒`
        );
      }
    };

    const result = solveLayoutLive(baseLinks, allNodesList, MAX_ATTEMPTS, liveCallback);

    if (result.solution) {
      console.log(`\n✅ 布局解決完成！`);
      console.log(`   - 總執行次數: ${result.finalAttemptCount}`);
      console.log(`   - 最佳解發現於第 ${result.bestAttemptNum} 次 (錯誤紅點數: ${result.redsCount})`);
      console.log(`   - 總耗時: ${result.duration.toFixed(2)} 秒`);

      // --- [Step D] 儲存檔案 ---
      console.log('\n🚀 [Step D] 儲存 Z-Layout JSON...');
      if (!taipei2_3Layer) {
        throw new Error('找不到 taipei_2_3 圖層');
      }

      taipei2_3Layer.spaceNetworkGridJsonData = result.solution;
      console.log(`✅ 資料已傳給 taipei_2_3 圖層`);

      // --- [Step E] 繪製對照圖 ---
      console.log('\n🚀 [Step E] 產生對照圖 (Input vs Output)...');
      // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
      plotTwoStages(
        dataStep2,
        result.solution,
        result.bestRedCoords,
        result.duration,
        `Final Result: Collisions ${result.redsCount} | Found at #${result.bestAttemptNum} | Total Time ${result.duration.toFixed(1)}s`
      );

      // 自動開啟 taipei_2_3 圖層以便查看結果
      if (!taipei2_3Layer.visible) {
        taipei2_3Layer.visible = true;
        dataStore.saveLayerState('taipei_2_3', { visible: true });
      }

      // 產生摘要並存到 dashboardData
      const dashboardData = {
        inputSegments: dataStep2.length,
        outputLinks: result.solution.length,
        maxAttempts: MAX_ATTEMPTS,
        finalAttemptCount: result.finalAttemptCount,
        bestAttemptNum: result.bestAttemptNum,
        collisionsCount: result.redsCount,
        duration: parseFloat(result.duration.toFixed(2)),
      };

      taipei2_3Layer.dashboardData = dashboardData;
    } else {
      throw new Error('求解失敗，未產生解決方案');
    }
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
