/**
 * 退化路段：首尾為同一格點（或距離過近），無有效起迄方向，不應繪製。
 */

const DEFAULT_EPS = 1e-9;

function pointXY(p) {
  if (!p) return [NaN, NaN];
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p.x), Number(p.y)];
}

/**
 * @param {Array} points - segment.points
 * @param {number} [eps]
 * @returns {boolean} true = 無有效起迄（應略過／刪除）
 */
export function segmentPointsMissingDistinctEndpoints(points, eps = DEFAULT_EPS) {
  if (!Array.isArray(points) || points.length < 2) return true;
  const [x0, y0] = pointXY(points[0]);
  const [x1, y1] = pointXY(points[points.length - 1]);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return true;
  return Math.hypot(x1 - x0, y1 - y0) <= eps;
}

/**
 * 就地清理 spaceNetworkGridJsonData：移除退化 segment。
 * 支援扁平 segment 陣列，或 2-5 格式 { route_name, segments: [...] }。
 * @returns {number} 刪除的 segment 筆數
 */
export function sanitizeSpaceNetworkGridJsonDataDegenerateSegments(data) {
  if (!Array.isArray(data) || data.length === 0) return 0;
  let removed = 0;

  const isMerged =
    data.length > 0 &&
    data[0]?.route_name &&
    Array.isArray(data[0].segments);

  if (isMerged) {
    for (const route of data) {
      if (!route || !Array.isArray(route.segments)) continue;
      const before = route.segments.length;
      route.segments = route.segments.filter(
        (seg) => !segmentPointsMissingDistinctEndpoints(seg?.points)
      );
      removed += before - route.segments.length;
    }
    return removed;
  }

  const kept = [];
  for (const seg of data) {
    if (segmentPointsMissingDistinctEndpoints(seg?.points)) {
      removed++;
    } else {
      kept.push(seg);
    }
  }
  if (removed > 0) {
    data.splice(0, data.length, ...kept);
  }
  return removed;
}

/**
 * @param {Object} layer - 含 spaceNetworkGridJsonData
 * @returns {number} 刪除筆數
 */
export function sanitizeLayerDegenerateRouteSegments(layer) {
  if (!layer?.spaceNetworkGridJsonData) return 0;
  return sanitizeSpaceNetworkGridJsonDataDegenerateSegments(layer.spaceNetworkGridJsonData);
}
