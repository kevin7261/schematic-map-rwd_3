// 路線直線化（示意圖直線化 / Schematization）
// 邏輯與 Colab 2-2 完全一致：讀取直線化資料 → 網格吸附 (Grid Size = 5) → 屬性同步。
// 對應 Python: get_equidistant_points, extract_connect_nodes, detect_frozen_nodes,
// snap_point, snap_and_interpolate_stroke, form_strokes_and_validate.

// ==========================================
// 3. 核心演算法函式（與 Python 完全一致）
// ==========================================

/**
 * [數學運算] 線性插值
 * 在起點與終點間，重新計算均勻分布的座標點。
 * Python: get_equidistant_points(p_start, p_end, total_points)
 */
function getEquidistantPoints(pStart, pEnd, totalPoints) {
  if (totalPoints <= 1) return [[...pStart]];
  const newPoints = [];
  const x1 = pStart[0];
  const y1 = pStart[1];
  const x2 = pEnd[0];
  const y2 = pEnd[1];
  for (let i = 0; i < totalPoints; i++) {
    const t = i / (totalPoints - 1);
    const nx = x1 + (x2 - x1) * t;
    const ny = y1 + (y2 - y1) * t;
    newPoints.push([nx, ny]);
  }
  return newPoints;
}

/**
 * [混合模式] 提取交會點 (Connect Nodes)
 * 同時檢查 properties_start/end 與 nodes 列表。Python: extract_connect_nodes(segments)
 */
function extractConnectNodes(segments) {
  const connCoords = new Set();
  for (const seg of segments) {
    const points = seg.points || [];
    if (!points.length) continue;

    // 來源 A: 頭尾屬性
    const pStart = seg.properties_start || {};
    const pEnd = seg.properties_end || {};
    if (pStart.node_type === 'connect') {
      const pt = points[0];
      connCoords.add(JSON.stringify([pt[0], pt[1]]));
    }
    if (pEnd.node_type === 'connect') {
      const pt = points[points.length - 1];
      connCoords.add(JSON.stringify([pt[0], pt[1]]));
    }

    // 來源 B: nodes 列表 (若存在)，zip(points, nodes)
    const nodes = seg.nodes || [];
    if (nodes.length === points.length) {
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const x = pt[0];
        const y = pt[1];
        const props = nodes[i] || {};
        if (props.node_type === 'connect') {
          connCoords.add(JSON.stringify([x, y]));
        }
      }
    }
  }
  return Array.from(connCoords).map((s) => JSON.parse(s));
}

/**
 * [碰撞偵測] 吸附後會重疊在同一網格點的節點標記為 frozen。Python: detect_frozen_nodes(nodes_coords, grid_size)
 */
function detectFrozenNodes(nodesCoords, gridSize) {
  const snappedMap = new Map();
  for (const node of nodesCoords) {
    const gx = Math.round(node[0] / gridSize) * gridSize;
    const gy = Math.round(node[1] / gridSize) * gridSize;
    const key = `${gx},${gy}`;
    if (!snappedMap.has(key)) snappedMap.set(key, []);
    snappedMap.get(key).push([node[0], node[1]]);
  }

  const frozen = new Set();
  for (const origNodes of snappedMap.values()) {
    const uniqueOrigs = new Set();
    for (const n of origNodes) {
      uniqueOrigs.add(JSON.stringify(n));
    }
    if (uniqueOrigs.size > 1) {
      for (const n of origNodes) {
        frozen.add(JSON.stringify(n));
      }
    }
  }
  return frozen;
}

/**
 * 單點吸附運算。Python: snap_point(pt, grid_size, frozen_set)
 * 新的交叉點必須為整數刻度，故輸出一律四捨五入為整數。
 */
function snapPoint(pt, gridSize, frozenSet) {
  const ptStr = JSON.stringify([pt[0], pt[1]]);
  if (frozenSet.has(ptStr)) return [Math.round(pt[0]), Math.round(pt[1])];
  const gx = Math.round(pt[0] / gridSize) * gridSize;
  const gy = Math.round(pt[1] / gridSize) * gridSize;
  return [Math.round(gx), Math.round(gy)];
}

/**
 * [核心邏輯] 網格吸附與屬性同步：頭尾吸附、重新插值、沿用 nodes、同步 properties_start/end。
 * Python: snap_and_interpolate_stroke(stroke, frozen_nodes, grid_size)
 */
function snapAndInterpolateStroke(stroke, frozenNodes, gridSize) {
  const points = stroke.points || [];
  const nodes = stroke.nodes || [];

  if (!points.length || points.length < 2) return;

  const pStartOld = points[0];
  const pEndOld = points[points.length - 1];

  const pStartNew = snapPoint(pStartOld, gridSize, frozenNodes);
  const pEndNew = snapPoint(pEndOld, gridSize, frozenNodes);

  const n = points.length;
  const newPointsCoords = getEquidistantPoints(pStartNew, pEndNew, n);
  // 新的交叉點（起終點）必須為整數刻度
  if (newPointsCoords.length > 0) {
    newPointsCoords[0] = [Math.round(newPointsCoords[0][0]), Math.round(newPointsCoords[0][1])];
    if (newPointsCoords.length > 1) {
      const last = newPointsCoords.length - 1;
      newPointsCoords[last] = [Math.round(newPointsCoords[last][0]), Math.round(newPointsCoords[last][1])];
    }
  }

  stroke.points = newPointsCoords;
  stroke.nodes = nodes;

  if (nodes.length > 0) {
    stroke.properties_start = nodes[0];
    stroke.properties_end = nodes[nodes.length - 1];
  }
}

/**
 * 檢查並補全 nodes 列表。Python: form_strokes_and_validate(segments)
 */
function formStrokesAndValidate(segments) {
  const processedStrokes = [];
  let missingCount = 0;

  for (const seg of segments) {
    const stroke = JSON.parse(JSON.stringify(seg));
    stroke.processed = false;

    const points = stroke.points || [];

    if (!stroke.nodes || stroke.nodes.length !== points.length) {
      missingCount++;
      const newNodes = [];
      for (let i = 0; i < points.length; i++) {
        const props = { node_type: 'line' };
        if (i === 0) Object.assign(props, stroke.properties_start || {});
        else if (i === points.length - 1) Object.assign(props, stroke.properties_end || {});
        newNodes.push(props);
      }
      stroke.nodes = newNodes;
    }

    processedStrokes.push(stroke);
  }

  if (missingCount > 0) {
    console.log(`⚠️ [路線直線化] 發現 ${missingCount} 條線段缺少完整 'nodes' 列表，已自動補全頭尾資訊。`);
  }

  return processedStrokes;
}

// ==========================================
// 對當前圖層執行路線直線化（主流程與 Python main() 一致）
// ==========================================

const DEFAULT_GRID_SIZE = 5;

/**
 * 取得扁平線段陣列 L_topology（與 Python 讀取 JSON 後的格式一致：list of segments）。
 * 若為「依路線分組」則展開為扁平列表，並回傳寫回用的索引。
 */
function getFlatTopology(data) {
  if (!Array.isArray(data) || data.length === 0) return { L_topology: [], isRouteFormat: false, indices: [] };
  const isRouteFormat = data[0].segments && Array.isArray(data[0].segments);

  if (isRouteFormat) {
    const L_topology = [];
    const indices = [];
    data.forEach((route, ri) => {
      (route.segments || []).forEach((seg, si) => {
        L_topology.push(seg);
        indices.push({ routeIndex: ri, segIndex: si });
      });
    });
    return { L_topology, isRouteFormat, indices };
  }
  return { L_topology: data, isRouteFormat: false, indices: [] };
}

/**
 * 黑點＝沿線站（line 且有站號／站名）；紅點＝ connect。僅捨棄黑點頂點，保留端點與純幾何 line。
 */
function isBlackStationVertex(node) {
  if (!node || node.node_type === 'connect') return false;
  const sid = String(node.station_id ?? node.tags?.station_id ?? '').trim();
  const sname = String(
    node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? ''
  ).trim();
  const bad = (s) => s === '' || s === '—' || s === '－';
  if (sid && !bad(sid)) return true;
  if (sname && !bad(sname)) return true;
  return false;
}

function stripBlackStationsFromOneSegment(seg) {
  const out = JSON.parse(JSON.stringify(seg));
  const pts = out.points || [];
  const nodes = out.nodes || [];
  if (pts.length < 2 || nodes.length !== pts.length) return out;
  const keepIdx = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 || i === pts.length - 1) keepIdx.push(i);
    else if (!isBlackStationVertex(nodes[i])) keepIdx.push(i);
  }
  if (keepIdx.length < 2) return out;
  out.points = keepIdx.map((i) => [...pts[i]]);
  out.nodes = keepIdx.map((i) => JSON.parse(JSON.stringify(nodes[i])));
  if (Array.isArray(out.original_points) && out.original_points.length === pts.length) {
    out.original_points = keepIdx.map((i) => out.original_points[i]);
  }
  if (out.nodes.length > 0) {
    out.properties_start = out.nodes[0];
    out.properties_end = out.nodes[out.nodes.length - 1];
  }
  return out;
}

/**
 * 就地修改：從每段 polyline 移除黑點站，再交給既有直線化（只動紅點／端點吸附與整段插值）。
 * @param {Array} data - 扁平 segments 或依路線分組 { segments: [] }
 */
export function stripBlackStationVerticesFromSpaceNetworkData(data) {
  if (!Array.isArray(data) || data.length === 0) return;
  const isRouteFormat = data[0].segments && Array.isArray(data[0].segments);
  if (isRouteFormat) {
    for (const route of data) {
      const segs = route.segments;
      if (!Array.isArray(segs)) continue;
      for (let si = 0; si < segs.length; si++) {
        segs[si] = stripBlackStationsFromOneSegment(segs[si]);
      }
    }
    return;
  }
  for (let i = 0; i < data.length; i++) {
    data[i] = stripBlackStationsFromOneSegment(data[i]);
  }
}

/**
 * 深拷貝來源 → 捨棄黑點站 → 與 taipei_a 相同之交叉點網格直線化。
 * @returns {Array|null} 與來源相同結構之新資料，失敗則 null
 */
export function straightenSpaceNetworkAfterStrippingBlackStations(
  sourceData,
  gridSize = DEFAULT_GRID_SIZE
) {
  if (!Array.isArray(sourceData) || sourceData.length === 0) return null;
  const cloned = JSON.parse(JSON.stringify(sourceData));
  stripBlackStationVerticesFromSpaceNetworkData(cloned);
  const fakeLayer = { spaceNetworkGridJsonData: cloned };
  const ok = straightenRoutesOnCurrentLayer(fakeLayer, gridSize);
  return ok ? cloned : null;
}

/**
 * 對指定圖層執行路線直線化（示意化），邏輯與 Colab 2-2 Python 完全一致。
 * Step A 讀取 → B 驗證 nodes → C 交會點與碰撞偵測 → D 示意化運算 → E 寫回。
 */
export function straightenRoutesOnCurrentLayer(layer, gridSize = DEFAULT_GRID_SIZE) {
  if (!layer || !layer.spaceNetworkGridJsonData) {
    console.warn('[路線直線化] 圖層或 spaceNetworkGridJsonData 不存在');
    return false;
  }

  const data = layer.spaceNetworkGridJsonData;
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('[路線直線化] 無線段資料');
    return false;
  }

  try {
    const { L_topology, isRouteFormat, indices } = getFlatTopology(data);

    if (L_topology.length === 0) {
      console.warn('[路線直線化] 扁平化後無線段');
      return false;
    }

    // Step B: 資料驗證與補全（與 Python form_strokes_and_validate 一致）
    const S_strokes = formStrokesAndValidate(L_topology);

    // Step C: 提取交會點與碰撞偵測
    const nodesInput = extractConnectNodes(S_strokes);
    const frozenNodes = detectFrozenNodes(nodesInput, gridSize);

    // Step D: 執行示意化運算
    for (const stroke of S_strokes) {
      snapAndInterpolateStroke(stroke, frozenNodes, gridSize);
    }

    // Step E: 寫回（維持原結構：若原本為 route 格式則填回各 route.segments）
    if (isRouteFormat && indices.length === S_strokes.length) {
      for (let k = 0; k < S_strokes.length; k++) {
        const { routeIndex, segIndex } = indices[k];
        data[routeIndex].segments[segIndex] = S_strokes[k];
      }
    } else {
      layer.spaceNetworkGridJsonData = S_strokes;
    }

    console.log(`[路線直線化] 完成 ${S_strokes.length} 條線段，網格大小 ${gridSize}`);
    return true;
  } catch (error) {
    console.error('[路線直線化] 執行錯誤:', error);
    return false;
  }
}
