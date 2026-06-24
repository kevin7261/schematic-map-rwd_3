// # @title Colab 2-1: 交叉點路線直線化
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 1 的壓縮網格資料 (Normalize JSON)。
// 2. 拓撲分析：識別「交會點 (Connect Node)」(即路線交叉或端點)。
// 3. 直線化處理：將兩個交會點之間的所有中間點，替換為數學上的等距直線點。
// 4. 資料重建：重新生成並保留 `nodes` 屬性列表 (包含 node_type 與 connect_number)。
// 5. 輸出 Step 2 的結果並繪製靜態圖 (無 Plotly)。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 3. 核心演算法函式
// ==========================================
/**
 * [數學運算] 線性插值生成點
 * 功能：在起點與終點之間，均勻生成指定數量的座標點。
 * @param {Array<number>} pStart - 起點座標 [x, y]
 * @param {Array<number>} pEnd - 終點座標 [x, y]
 * @param {number} totalPoints - 總點數
 * @returns {Array<Array<number>>} 等距點陣列
 */
function getEquidistantPoints(pStart, pEnd, totalPoints) {
  if (totalPoints <= 1) return [[...pStart]];
  const newPoints = [];
  const [x1, y1] = pStart;
  const [x2, y2] = pEnd;
  for (let i = 0; i < totalPoints; i++) {
    const t = i / (totalPoints - 1);
    const nx = x1 + (x2 - x1) * t;
    const ny = y1 + (y2 - y1) * t;
    newPoints.push([nx, ny]);
  }
  return newPoints;
}

/**
 * 資料正規化：確保輸入格式為列表且包含 points
 * @param {*} data - 輸入資料
 * @returns {Array} 正規化後的線段陣列
 */
function normalizeInputData(data) {
  let segments = [];
  if (typeof data === 'object' && !Array.isArray(data)) {
    segments = data.features || [data];
  } else if (Array.isArray(data)) {
    segments = data;
  } else {
    return [];
  }

  const normalizedSegments = [];
  for (const item of segments) {
    const seg = JSON.parse(JSON.stringify(item));
    let coords = seg.points;

    // 相容 GeoJSON 格式
    if (!coords && seg.geometry) {
      coords = seg.geometry.coordinates;
    }

    if (!coords) continue;

    // 確保座標為 float
    const cleanCoords = coords.map((p) => [parseFloat(p[0]), parseFloat(p[1])]);
    seg.points = cleanCoords;

    // 確保有名稱與屬性欄位
    if (!seg.name) {
      seg.name = seg.properties?.name || seg.properties?.route_name;
    }
    if (!seg.way_properties) {
      if (seg.properties) {
        seg.way_properties = { tags: seg.properties };
      } else {
        seg.way_properties = {};
      }
    }

    normalizedSegments.push(seg);
  }
  return normalizedSegments;
}

/**
 * [核心邏輯] 建立拓撲並拉直路線
 * 1. 建立鄰接表 (Adjacency List)。
 * 2. 識別拓撲節點 (Topological Nodes)：端點、交叉點、或路線變更點。
 * 3. 遍歷所有節點，將兩節點間的路徑「拉直」。
 * 4. [關鍵] 重建並保留 `nodes` 欄位。
 * @param {Array} segments - 輸入線段陣列
 * @returns {Object} {segments, topoNodes, stats, nodeRoutesLog}
 */
function buildTopologyStraightLines(segments) {
  // 1. 建立鄰接表
  const adj = new Map();
  for (const seg of segments) {
    const points = seg.points;
    if (!points || points.length < 2) continue;
    const u = JSON.stringify(points[0]);
    const v = JSON.stringify(points[points.length - 1]);

    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);

    adj.get(u).push([v, seg]);
    adj.get(v).push([u, seg]);
  }

  // 2. 識別拓撲關鍵點 (Intersection / Endpoints)
  const topoNodes = new Set();
  for (const [ptStr, neighbors] of adj.entries()) {
    let isTopoNode = false;
    // 條件 A: 連接數不等於 2 (即端點或多叉路口)
    if (neighbors.length !== 2) {
      isTopoNode = true;
    } else {
      // 條件 B: 雖然連接數為 2，但路線名稱改變 (例如紅線轉藍線的接點)
      const seg1 = neighbors[0][1];
      const seg2 = neighbors[1][1];
      if (seg1.name !== seg2.name) {
        isTopoNode = true;
      }
    }

    if (isTopoNode) {
      topoNodes.add(ptStr);
    }
  }

  // 防呆：若無拓撲點，任意取一點作為起始
  if (topoNodes.size === 0 && adj.size > 0) {
    const firstPt = Array.from(adj.keys())[0];
    topoNodes.add(firstPt);
  }

  // 為拓撲點編號 (為了視覺化與 Log)
  const sortedNodes = Array.from(topoNodes).sort();
  const nodeMap = new Map();
  sortedNodes.forEach((ptStr, i) => {
    nodeMap.set(ptStr, i + 1);
  });

  // 分析每個編號點經過的路線 (Log 用)
  const nodeRoutesLog = {};
  for (const [ptStr, idx] of nodeMap.entries()) {
    const routes = new Set();
    if (adj.has(ptStr)) {
      for (const [, seg] of adj.get(ptStr)) {
        const rName = seg.name || seg.properties?.route_name || 'Unknown';
        routes.add(rName);
      }
    }
    nodeRoutesLog[idx] = Array.from(routes).sort();
  }

  // 3. 路線拉直 (Straightening)
  const newStraightSegments = [];
  const processedEdges = new Set();
  const stats = { input_points: 0, output_points: 0 };

  const parseCoord = (str) => JSON.parse(str);

  for (const startNodeStr of topoNodes) {
    const startNode = parseCoord(startNodeStr);
    const neighbors = adj.get(startNodeStr) || [];

    for (const [neighborStr, firstSeg] of neighbors) {
      // 初始化路徑收集器
      const pathNodesProps = [];
      let currSeg = firstSeg;
      const pStart = currSeg.points[0];

      // 判斷方向並收集屬性
      let propsStart, propsEnd, pointsList;
      if (JSON.stringify(pStart) === startNodeStr) {
        propsStart = currSeg.properties_start || {};
        propsEnd = currSeg.properties_end || {};
        pointsList = currSeg.points;
      } else {
        propsStart = currSeg.properties_end || {};
        propsEnd = currSeg.properties_start || {};
        pointsList = [...currSeg.points].reverse();
      }

      pathNodesProps.push(propsStart);
      for (let i = 0; i < pointsList.length - 2; i++) {
        pathNodesProps.push({}); // 中間點暫時為空
      }

      let lastNodeProps = propsEnd;
      let prev = startNodeStr;
      let curr = neighborStr;
      const currentSegProps = JSON.parse(JSON.stringify(firstSeg));

      // 繼續走，直到遇到下一個拓撲點
      while (!topoNodes.has(curr)) {
        pathNodesProps.push(lastNodeProps);

        let foundNext = false;
        const neighborsList = adj.get(curr) || [];
        for (const [nxtStr, nextSeg] of neighborsList) {
          if (nxtStr !== prev) {
            const npStart = nextSeg.points[0];
            let nPropsEnd, nPoints;
            if (JSON.stringify(npStart) === curr) {
              nPropsEnd = nextSeg.properties_end || {};
              nPoints = nextSeg.points;
            } else {
              nPropsEnd = nextSeg.properties_start || {};
              nPoints = [...nextSeg.points].reverse();
            }

            for (let i = 0; i < nPoints.length - 2; i++) {
              pathNodesProps.push({});
            }

            prev = curr;
            curr = nxtStr;
            lastNodeProps = nPropsEnd;
            foundNext = true;
            break;
          }
        }
        if (!foundNext) {
          break;
        }
      }

      pathNodesProps.push(lastNodeProps);
      const endNodeStr = curr;

      // 避免重複處理同一條邊 (A->B 與 B->A)
      const pathId = JSON.stringify([startNodeStr, endNodeStr].sort());
      if (processedEdges.has(pathId)) {
        continue;
      }
      processedEdges.add(pathId);

      // 計算拉直
      const totalCount = pathNodesProps.length;
      stats.input_points += totalCount;

      const fullStraightPoints = getEquidistantPoints(startNode, parseCoord(endNodeStr), totalCount);
      stats.output_points += fullStraightPoints.length;

      // 4. 組合輸出資料 (含 nodes 重建)，交叉點（起終點）必須為整數刻度
      const cleanPoints = [];
      const nodeDataList = [];

      if (fullStraightPoints.length > 0) {
        for (let i = 0; i < totalCount; i++) {
          let [x, y] = fullStraightPoints[i];
          if (i === 0 || i === totalCount - 1) {
            x = Math.round(x);
            y = Math.round(y);
          }

          // 屬性處理與標記
          let props = JSON.parse(JSON.stringify(pathNodesProps[i] || {}));
          if (typeof props !== 'object' || props === null) {
            props = {};
          }

          if (i === 0) {
            props.node_type = 'connect';
            if (nodeMap.has(startNodeStr)) {
              props.connect_number = nodeMap.get(startNodeStr);
            }
          } else if (i === totalCount - 1) {
            props.node_type = 'connect';
            if (nodeMap.has(endNodeStr)) {
              props.connect_number = nodeMap.get(endNodeStr);
            }
          } else {
            props.node_type = 'line';
          }

          cleanPoints.push([x, y]);
          nodeDataList.push(props);
        }
      }

      const newSeg = currentSegProps;
      newSeg.segment_counts = [totalCount];
      newSeg.length = totalCount;
      newSeg.points = cleanPoints;
      newSeg.nodes = nodeDataList; // [保留 nodes]

      // 同步更新頭尾屬性
      if (nodeDataList.length > 0) {
        newSeg.properties_start = nodeDataList[0];
        newSeg.properties_end = nodeDataList[nodeDataList.length - 1];
      }

      newStraightSegments.push(newSeg);
    }
  }

  const topoNodesArray = Array.from(topoNodes).map((s) => parseCoord(s));
  return { segments: newStraightSegments, topoNodes: topoNodesArray, stats, nodeRoutesLog };
}

// ==========================================
// 4. 輔助函式：視覺化
// ==========================================
/**
 * 取得路線顏色
 * @param {Object} segment - 線段物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getSegmentColor(segment) {
  const defaultColor = '#000000';
  let props = segment.way_properties?.tags || {};
  if (!props || Object.keys(props).length === 0) {
    props = segment.properties || {};
  }
  return props.colour || props.color || defaultColor;
}

/**
 * 繪製靜態比較圖 (Input vs Output)
 * @param {Array} rawData - 原始資料
 * @param {Array} straightData - 拉直後的資料
 * @param {string} outputImg - 輸出圖片路徑 (在 JS 中由前端組件處理)
 * @param {Set} keyNodes - 關鍵節點集合
 */
// eslint-disable-next-line no-unused-vars
function plotStaticMpl(rawData, straightData, outputImg, keyNodes = null) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] 靜態比較圖: Input vs Output`);
}

// ==========================================
// 5. 主執行流程
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_1_2_to_2_1(_jsonData) {
  const dataStore = useDataStore();
  const taipei1_2Layer = dataStore.findLayerById('taipei_1_2');
  const taipei2_1Layer = dataStore.findLayerById('taipei_2_1');

  // ==========================================
  // 2. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 1 (Colab 3) 的輸出
  const inputJsonFilename = taipei1_2Layer ? 'taipei_1_2 (in-memory)' : 'taipei_1_2';
  // 輸出：Step 2 的結果 (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案 (Step 1): 從 taipei_1_2 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_1 圖層`);
  console.log('='.repeat(60));

  if (!taipei1_2Layer || !taipei1_2Layer.spaceNetworkGridJsonData) {
    console.error(`❌ [錯誤] 找不到輸入檔案: ${inputJsonFilename}`);
    throw new Error(`找不到輸入檔案: ${inputJsonFilename}`);
  }

  try {
    // --- [Step A] 讀取資料 ---
    console.log('\n🚀 [Step A] 讀取 Normalize JSON 資料...');
    const rawData = taipei1_2Layer.spaceNetworkGridJsonData;

    // 資料正規化 (確保是 List 結構)
    const L_raw = normalizeInputData(rawData);
    console.log(`   -> 讀取並標準化了 ${L_raw.length} 條線段。`);

    // --- [Step B] 執行拓撲分析與直線化 ---
    console.log('\n🚀 [Step B] 執行拓撲分析與路線直線化...');
    const { segments: L_straight, topoNodes: keyNodesSet, stats, nodeRoutesLog: routeLog } = buildTopologyStraightLines(L_raw);

    console.log(`   -> 轉換完成，輸出 ${L_straight.length} 條直線化線段。`);
    console.log(`   -> 輸入總點數: ${stats.input_points} -> 輸出總點數: ${stats.output_points}`);

    // --- [Step C] 輸出交會點日誌 (Connect Node Analysis) ---
    console.log('\n🔍 [Step C] 交會點 (Connect Node) 詳細分析:');
    console.log('-'.repeat(60));
    console.log(`${'No.'.padEnd(6)} | ${'Routes Passing Through'}`);
    console.log('-'.repeat(60));

    const sortedLog = Object.entries(routeLog).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    for (const [cNum, routes] of sortedLog) {
      const routesStr = routes.join(', ');
      console.log(`${String(cNum).padEnd(6)} | ${routesStr}`);
    }
    console.log('-'.repeat(60));

    // 驗證資料結構
    if (L_straight.length > 0 && L_straight[0].points) {
      console.log(`   -> (Debug) 屬性檢查: 'nodes' in output? ${'nodes' in L_straight[0]}`);
    }

    // --- [Step D] 儲存檔案 ---
    console.log('\n🚀 [Step D] 儲存 Step 2 JSON 檔案...');
    if (!taipei2_1Layer) {
      throw new Error('找不到 taipei_2_1 圖層');
    }

    taipei2_1Layer.spaceNetworkGridJsonData = L_straight;
    console.log(`✅ 資料已傳給 taipei_2_1 圖層`);

    // --- [Step E] 繪製靜態圖 ---
    console.log('\n🚀 [Step E] 繪製並儲存靜態地圖...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    plotStaticMpl(L_raw, L_straight, '', keyNodesSet);

    // 自動開啟 taipei_2_1 圖層以便查看結果
    if (!taipei2_1Layer.visible) {
      taipei2_1Layer.visible = true;
      dataStore.saveLayerState('taipei_2_1', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      inputSegments: L_raw.length,
      outputSegments: L_straight.length,
      inputPoints: stats.input_points,
      outputPoints: stats.output_points,
      connectNodesCount: Object.keys(routeLog).length,
      nodeRoutesLog: routeLog,
    };

    taipei2_1Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
