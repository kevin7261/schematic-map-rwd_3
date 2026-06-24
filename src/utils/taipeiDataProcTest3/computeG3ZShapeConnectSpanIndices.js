/**
 * f3→g3 完成後：標出「兩端皆為 connect（紅／藍）」且幾何上至少有 2 個正交轉折的路段索引，
 * 與 SpaceNetworkGridTab 之 flatSegments 展平順序一致（含 2-5 巢狀 segments）。
 */

const COORD_EPS = 1e-3;

function toXY(p) {
  if (!p) return [NaN, NaN];
  if (Array.isArray(p)) return [Number(p[0] ?? 0), Number(p[1] ?? 0)];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

function flattenSegmentsLikeComputeStation(routesData) {
  const raw = routesData || [];
  const segments = [];
  if (raw.length > 0 && raw[0]?.segments && !raw[0]?.points) {
    raw.forEach((route) => {
      const routeName = route.route_name ?? route.name ?? 'Unknown';
      (route.segments || []).forEach((seg) => {
        segments.push({
          ...seg,
          route_name: seg.route_name ?? routeName,
          name: seg.name ?? routeName,
          nodes: seg.nodes ?? [],
        });
      });
    });
  } else {
    raw.forEach((seg) => {
      segments.push({
        ...seg,
        route_name: seg.route_name ?? seg.name ?? 'Unknown',
        name: seg.name ?? seg.route_name ?? 'Unknown',
        nodes: seg.nodes ?? [],
      });
    });
  }
  return segments;
}

function endpointNodeTypeConnect(seg, end) {
  const nodes = seg.nodes;
  const pts = seg.points;
  if (Array.isArray(nodes) && Array.isArray(pts) && nodes.length === pts.length && pts.length >= 2) {
    const n = end === 'start' ? nodes[0] : nodes[nodes.length - 1];
    return String(n?.node_type ?? '').trim() === 'connect';
  }
  const props = end === 'start' ? seg.properties_start : seg.properties_end;
  const tags = props?.tags || {};
  return (
    String(props?.node_type ?? tags?.node_type ?? '').trim() === 'connect'
  );
}

/**
 * 折線內部頂點上「水平／垂直方向改變」的次數（與 node_type line 之幾何轉折一致）。
 */
export function countOrthogonalTurnsOnPoints(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let turns = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = toXY(points[i - 1]);
    const p1 = toXY(points[i]);
    const p2 = toXY(points[i + 1]);
    const dx1 = p1[0] - p0[0];
    const dy1 = p1[1] - p0[1];
    const dx2 = p2[0] - p1[0];
    const dy2 = p2[1] - p1[1];
    if (Math.hypot(dx1, dy1) < COORD_EPS || Math.hypot(dx2, dy2) < COORD_EPS) continue;
    const h1 = Math.abs(dy1) < COORD_EPS;
    const v1 = Math.abs(dx1) < COORD_EPS;
    const h2 = Math.abs(dy2) < COORD_EPS;
    const v2 = Math.abs(dx2) < COORD_EPS;
    if ((h1 && v2) || (v1 && h2)) turns++;
  }
  return turns;
}

/** 幾何轉折發生之頂點索引 i（1…n−2），與 countOrthogonalTurnsOnPoints 判定一致 */
function listOrthogonalTurnVertexIndices(points) {
  const out = [];
  if (!Array.isArray(points) || points.length < 3) return out;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = toXY(points[i - 1]);
    const p1 = toXY(points[i]);
    const p2 = toXY(points[i + 1]);
    const dx1 = p1[0] - p0[0];
    const dy1 = p1[1] - p0[1];
    const dx2 = p2[0] - p1[0];
    const dy2 = p2[1] - p1[1];
    if (Math.hypot(dx1, dy1) < COORD_EPS || Math.hypot(dx2, dy2) < COORD_EPS) continue;
    const h1 = Math.abs(dy1) < COORD_EPS;
    const v1 = Math.abs(dx1) < COORD_EPS;
    const h2 = Math.abs(dy2) < COORD_EPS;
    const v2 = Math.abs(dx2) < COORD_EPS;
    if ((h1 && v2) || (v1 && h2)) out.push(i);
  }
  return out;
}

const INT_EPS = 1e-5;

function isNearlyInteger(n) {
  if (!Number.isFinite(n)) return false;
  return Math.abs(n - Math.round(n)) < INT_EPS;
}

/**
 * Z 形路段上，「相鄰兩轉折點」之間的線段（不含連接起迄 connect 的頭、尾一段）；
 * 水平線以 y 是否為整數、垂直線以 x 是否為整數 → 綠／紅。
 * @returns {{ coordinates: number[][], stroke: string }[]}
 */
export function buildG3ZShapeInteriorTurnAxisSnapOverlays(routesData) {
  const minTurns = 2;
  const flat = flattenSegmentsLikeComputeStation(routesData);
  const overlays = [];
  for (let fi = 0; fi < flat.length; fi++) {
    const seg = flat[fi];
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    if (!endpointNodeTypeConnect(seg, 'start') || !endpointNodeTypeConnect(seg, 'end')) continue;
    if (countOrthogonalTurnsOnPoints(pts) < minTurns) continue;

    const turnIdx = listOrthogonalTurnVertexIndices(pts);
    if (turnIdx.length < 2) continue;

    for (let j = 0; j < turnIdx.length - 1; j++) {
      const ia = turnIdx[j];
      const ib = turnIdx[j + 1];
      const a = toXY(pts[ia]);
      const b = toXY(pts[ib]);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      if (Math.hypot(dx, dy) < COORD_EPS) continue;
      const horizontal = Math.abs(dy) < COORD_EPS;
      const vertical = Math.abs(dx) < COORD_EPS;
      let axisValue = null;
      if (horizontal) axisValue = (a[1] + b[1]) / 2;
      else if (vertical) axisValue = (a[0] + b[0]) / 2;
      else continue;
      const snapOk = isNearlyInteger(axisValue);
      overlays.push({
        coordinates: [a, b],
        stroke: snapOk ? '#00c853' : '#ff0000',
      });
    }
  }
  return overlays;
}

/**
 * @param {Array} routesData - g3 spaceNetworkGridJsonData（與 computeStationDataFromRoutes 相同結構）
 * @param {{ minTurns?: number }} [options] - 預設 minTurns=2（含兩個轉折點以上）
 * @returns {number[]} 符合條件之 flat segment 索引（由 0 起）
 */
export function computeG3ZShapeFlatSegmentIndicesBetweenConnects(routesData, options = {}) {
  const minTurns = options.minTurns ?? 2;
  const flat = flattenSegmentsLikeComputeStation(routesData);
  const out = [];
  for (let i = 0; i < flat.length; i++) {
    const seg = flat[i];
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    if (!endpointNodeTypeConnect(seg, 'start') || !endpointNodeTypeConnect(seg, 'end')) continue;
    if (countOrthogonalTurnsOnPoints(pts) >= minTurns) out.push(i);
  }
  return out;
}
