/**
 * 末端簡化 (Loop Pruning) - 針對當前圖層執行
 * 與 Colab 2-6 邏輯相同：偵測末端無效轉折、保留直線段、車站均勻分佈
 * 不修改既有 execute_2_5_to_2_6 程式
 */

// ==========================================
// 幾何運算工具
// ==========================================
function dist(p1, p2) {
  const [x1, y1] = Array.isArray(p1) ? p1.slice(0, 2) : [p1?.x ?? 0, p1?.y ?? 0];
  const [x2, y2] = Array.isArray(p2) ? p2.slice(0, 2) : [p2?.x ?? 0, p2?.y ?? 0];
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function isCollinear(p1, p2, p3, tolerance = 1e-5) {
  const [x1, y1] = Array.isArray(p1) ? p1.slice(0, 2) : [p1?.x ?? 0, p1?.y ?? 0];
  const [x2, y2] = Array.isArray(p2) ? p2.slice(0, 2) : [p2?.x ?? 0, p2?.y ?? 0];
  const [x3, y3] = Array.isArray(p3) ? p3.slice(0, 2) : [p3?.x ?? 0, p3?.y ?? 0];
  const v1x = x2 - x1;
  const v1y = y2 - y1;
  const v2x = x3 - x2;
  const v2y = y3 - y2;
  const cross = v1x * v2y - v1y * v2x;
  return Math.abs(cross) < tolerance;
}

function getPathLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += dist(points[i], points[i + 1]);
  }
  return total;
}

function getPointAtDistance(points, targetDist) {
  if (targetDist <= 0) return points[0]?.slice ? points[0].slice(0, 2) : [...points[0]];
  let currentDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segLen = dist(points[i], points[i + 1]);
    if (currentDist + segLen >= targetDist) {
      const ratio = (targetDist - currentDist) / segLen;
      const p0 = points[i];
      const p1 = points[i + 1];
      const x = (Array.isArray(p0) ? p0[0] : p0?.x) + ((Array.isArray(p1) ? p1[0] : p1?.x) - (Array.isArray(p0) ? p0[0] : p0?.x)) * ratio;
      const y = (Array.isArray(p0) ? p0[1] : p0?.y) + ((Array.isArray(p1) ? p1[1] : p1?.y) - (Array.isArray(p0) ? p0[1] : p0?.y)) * ratio;
      return [x, y];
    }
    currentDist += segLen;
  }
  const last = points[points.length - 1];
  return last?.slice ? last.slice(0, 2) : [last?.x ?? 0, last?.y ?? 0];
}

function resamplePath(points, count) {
  if (count < 2) return count === 1 && points[0] ? [points[0].slice ? points[0].slice(0, 2) : [points[0].x ?? 0, points[0].y ?? 0]] : [];
  const totalLen = getPathLength(points);
  const step = totalLen / (count - 1);
  const newPoints = [];
  for (let i = 0; i < count; i++) {
    const d = i === count - 1 ? totalLen : step * i;
    newPoints.push(getPointAtDistance(points, d));
  }
  return newPoints;
}

// ==========================================
// 屬性處理
// ==========================================
function isRealStation(node) {
  if (!node) return false;
  if (node.node_type === 'connect') return true;
  if (node.station_name) return true;
  if (node.tags?.station_name) return true;
  return false;
}

function getConnectId(nodeProps) {
  if (!nodeProps) return null;
  const val = nodeProps.connect_number ?? nodeProps.tags?.connect_number;
  return val != null ? String(val) : null;
}

function matchNodesToEndpoints(segmentList) {
  for (const seg of segmentList) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    if (!pts.length || !nodes.length) continue;
    if (pts[0].length === 2) pts[0] = [...pts[0], {}];
    if (pts[pts.length - 1].length === 2) pts[pts.length - 1] = [...pts[pts.length - 1], {}];
    if (getConnectId(nodes[0]) && typeof pts[0][2] === 'object') Object.assign(pts[0][2], nodes[0]);
    if (getConnectId(nodes[nodes.length - 1]) && typeof pts[pts.length - 1][2] === 'object') {
      Object.assign(pts[pts.length - 1][2], nodes[nodes.length - 1]);
    }
  }
}

function cleanPointsFormat(segmentList) {
  for (const seg of segmentList) {
    const pts = seg.points;
    if (!pts) continue;
    seg.points = pts.map((p) => (Array.isArray(p) ? p.slice(0, 2) : [p?.x ?? 0, p?.y ?? 0]));
  }
}

function buildConnectivityMap(segmentList) {
  const usageMap = new Map();
  for (const seg of segmentList) {
    const nodes = seg.nodes || [];
    if (!nodes.length) continue;
    const cidStart = getConnectId(nodes[0]);
    const cidEnd = getConnectId(nodes[nodes.length - 1]);
    if (cidStart) usageMap.set(cidStart, (usageMap.get(cidStart) || 0) + 1);
    if (cidEnd) usageMap.set(cidEnd, (usageMap.get(cidEnd) || 0) + 1);
  }
  return usageMap;
}

function getStraightSegmentIndexFromStart(points) {
  if (points.length <= 2) return points.length - 1;
  let lastIdx = 1;
  for (let i = 2; i < points.length; i++) {
    if (isCollinear(points[lastIdx - 1], points[lastIdx], points[i])) lastIdx = i;
    else break;
  }
  return lastIdx;
}

function getStraightSegmentIndexFromEnd(points) {
  if (points.length <= 2) return 0;
  let firstIdx = points.length - 2;
  for (let i = points.length - 3; i >= 0; i--) {
    if (isCollinear(points[firstIdx + 1], points[firstIdx], points[i])) firstIdx = i;
    else break;
  }
  return firstIdx;
}

function straightenDeadEnds(flatData) {
  const processedData = JSON.parse(JSON.stringify(flatData));
  matchNodesToEndpoints(processedData);
  const connMap = buildConnectivityMap(processedData);

  for (const seg of processedData) {
    const points = seg.points || [];
    const nodes = seg.nodes || [];

    if (points.length !== nodes.length) continue;
    if (points.length <= 2) continue;

    const startCid = getConnectId(nodes[0]);
    const endCid = getConnectId(nodes[nodes.length - 1]);
    const startCount = startCid ? connMap.get(startCid) || 0 : 1;
    const endCount = endCid ? connMap.get(endCid) || 0 : 1;

    let needsPruning = false;
    let keptGeometry = [];

    if (startCount > 1 && endCount <= 1) {
      const cutIdx = getStraightSegmentIndexFromStart(points);
      if (cutIdx < points.length - 1) {
        needsPruning = true;
        keptGeometry = points.slice(0, cutIdx + 1).map((p) => (Array.isArray(p) ? p.slice(0, 2) : [p?.x ?? 0, p?.y ?? 0]));
      }
    } else if (endCount > 1 && startCount <= 1) {
      const cutIdx = getStraightSegmentIndexFromEnd(points);
      if (cutIdx > 0) {
        needsPruning = true;
        keptGeometry = points.slice(cutIdx).map((p) => (Array.isArray(p) ? p.slice(0, 2) : [p?.x ?? 0, p?.y ?? 0]));
      }
    }

    if (needsPruning) {
      const validNodes = [];
      for (let i = 0; i < nodes.length; i++) {
        if (i === 0 || i === nodes.length - 1 || isRealStation(nodes[i])) validNodes.push(nodes[i]);
      }
      const countStations = validNodes.length;
      const newCoords = resamplePath(keptGeometry, countStations);
      seg.points = newCoords;
      seg.nodes = validNodes;
    }
  }

  cleanPointsFormat(processedData);
  return processedData;
}

/**
 * 對當前圖層執行末端簡化
 * 支援 routes 格式與 flat segments 格式
 * @param {Array} routesData - spaceNetworkGridJsonData
 * @returns {Array} 處理後的資料（維持輸入格式）
 */
export function endpointSimplifyOnLayer(routesData) {
  if (!Array.isArray(routesData) || routesData.length === 0) return routesData;

  const isRouteFormat =
    routesData[0]?.segments &&
    Array.isArray(routesData[0].segments) &&
    !routesData[0].points;

  let flatData;
  const routeMeta = []; // { routeIdx, routeName } 對應每個 segment

  if (isRouteFormat) {
    flatData = [];
    routesData.forEach((route, ri) => {
      const name = route.route_name ?? route.name ?? 'Unknown';
      (route.segments || []).forEach((seg) => {
        flatData.push({ ...seg, __routeIdx: ri, __routeName: name });
        routeMeta.push({ routeIdx: ri, routeName: name });
      });
    });
  } else {
    flatData = routesData.map((s) => ({ ...s }));
  }

  const processedFlat = straightenDeadEnds(flatData);

  if (isRouteFormat) {
    const byRoute = new Map();
    processedFlat.forEach((seg) => {
      const { __routeIdx, ...rest } = seg;
      delete rest.__routeName;
      const key = __routeIdx;
      if (!byRoute.has(key)) byRoute.set(key, []);
      byRoute.get(key).push(rest);
    });
    const routeOrder = [...new Set(routeMeta.map((m) => m.routeIdx))].sort((a, b) => a - b);
    return routeOrder.map((ri) => {
      const route = routesData[ri];
      return {
        ...route,
        route_name: route.route_name ?? route.name ?? 'Unknown',
        name: route.route_name ?? route.name ?? 'Unknown',
        segments: byRoute.get(ri) ?? [],
      };
    });
  }

  return processedFlat;
}
