/**
 * 2-1→2-2 與 taipei d3→e3 共用：示意化網格吸附（無 Pinia／可安全被 dataStore 依賴鏈引用）
 * 碰撞偵測僅使用 node_type === 'connect' 之座標（紅點／交叉點）。
 */

/**
 * @param {Array<number>} pStart
 * @param {Array<number>} pEnd
 * @param {number} totalPoints
 * @returns {Array<Array<number>>}
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
 * @param {Array} segments
 * @returns {Array<Array<number>>}
 */
function extractConnectNodes(segments) {
  const connCoords = new Set();
  for (const seg of segments) {
    const points = seg.points || [];
    if (!points.length) continue;

    const pStart = seg.properties_start || {};
    const pEnd = seg.properties_end || {};
    if (pStart.node_type === 'connect') {
      connCoords.add(JSON.stringify(points[0]));
    }
    if (pEnd.node_type === 'connect') {
      connCoords.add(JSON.stringify(points[points.length - 1]));
    }

    const nodes = seg.nodes || [];
    if (nodes.length === points.length) {
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
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
 * @param {Array<Array<number>>} nodesCoords
 * @param {number} gridSize
 * @returns {Set<string>}
 */
function detectFrozenNodes(nodesCoords, gridSize) {
  const snappedMap = new Map();
  for (const node of nodesCoords) {
    const gx = Math.round(node[0] / gridSize) * gridSize;
    const gy = Math.round(node[1] / gridSize) * gridSize;
    const key = `${gx},${gy}`;
    if (!snappedMap.has(key)) {
      snappedMap.set(key, []);
    }
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
 * @param {Array<number>} pt
 * @param {number} gridSize
 * @param {Set<string>} frozenSet
 * @returns {Array<number>}
 */
function snapPoint(pt, gridSize, frozenSet) {
  const ptStr = JSON.stringify([pt[0], pt[1]]);
  if (frozenSet.has(ptStr)) {
    return [pt[0], pt[1]];
  }

  const gx = Math.round(pt[0] / gridSize) * gridSize;
  const gy = Math.round(pt[1] / gridSize) * gridSize;
  return [gx, gy];
}

/**
 * @param {Object} stroke
 * @param {Set<string>} frozenNodes
 * @param {number} gridSize
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

  stroke.points = newPointsCoords;
  stroke.nodes = nodes;

  if (nodes.length > 0) {
    stroke.properties_start = nodes[0];
    stroke.properties_end = nodes[nodes.length - 1];
  }
}

/**
 * @param {Array} segments
 * @returns {Array}
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
        if (i === 0) {
          Object.assign(props, stroke.properties_start || {});
        } else if (i === points.length - 1) {
          Object.assign(props, stroke.properties_end || {});
        }
        newNodes.push(props);
      }
      stroke.nodes = newNodes;
    }

    processedStrokes.push(stroke);
  }

  if (missingCount > 0) {
    console.log(`⚠️ [警告] 發現 ${missingCount} 條線段缺少完整 'nodes' 列表，已自動補全頭尾資訊。`);
  }

  return processedStrokes;
}

/**
 * @param {Array} segments - 線段陣列
 * @param {number} [gridSize=5] - 網格大小
 * @returns {{ strokes: Array, connectNodesCount: number, frozenNodesCount: number }}
 */
export function schematizeStraightenedNetwork(segments, gridSize = 5) {
  const S_strokes = formStrokesAndValidate(segments);
  const nodesInput = extractConnectNodes(S_strokes);
  const frozenNodes = detectFrozenNodes(nodesInput, gridSize);
  for (const stroke of S_strokes) {
    snapAndInterpolateStroke(stroke, frozenNodes, gridSize);
  }
  return {
    strokes: S_strokes,
    connectNodesCount: nodesInput.length,
    frozenNodesCount: frozenNodes.size,
  };
}
