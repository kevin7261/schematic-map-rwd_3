/**
 * 均勻網格路線 — 拓撲標記色（紅/藍/粉紅）與繪製用 key 集合
 * markerKind 在 HV 拉直後仍保留，不因幾何共線而消失。
 */

/** @typedef {'crossing'|'endpoint'|'bend'|'vertex'} UniformGridMarkerKind */

const KIND_RANK = { vertex: 0, crossing: 1, endpoint: 2, bend: 3 };

function isUniformGridTurningPoint(points, idx) {
  if (idx <= 0 || idx >= points.length - 1) return false;
  const prev = points[idx - 1];
  const curr = points[idx];
  const next = points[idx + 1];
  const dx1 = curr.x - prev.x;
  const dy1 = curr.y - prev.y;
  const dx2 = next.x - curr.x;
  const dy2 = next.y - curr.y;
  return Math.abs(dx1 * dy2 - dy1 * dx2) > 0.001;
}

/** @param {UniformGridMarkerKind} a @param {UniformGridMarkerKind} b */
export function mergeUniformGridMarkerKind(a, b) {
  const left = a || 'vertex';
  const right = b || 'vertex';
  return KIND_RANK[left] >= KIND_RANK[right] ? left : right;
}

/** @param {{ x: number, y: number }[]} routes */
function computeRouteCountByPoint(routes) {
  const routeCountByPoint = new Map();
  routes.forEach((route) => {
    const seen = new Set();
    (route.points || []).forEach((p) => {
      const k = `${p.x},${p.y}`;
      if (seen.has(k)) return;
      seen.add(k);
      routeCountByPoint.set(k, (routeCountByPoint.get(k) || 0) + 1);
    });
  });
  return routeCountByPoint;
}

/** 依幾何＋多路線交會建立 kindByKey（初始隨機產生用） */
function computeGeometricKindByKey(routes) {
  const routeCountByPoint = computeRouteCountByPoint(routes);
  /** @type {Map<string, UniformGridMarkerKind>} */
  const kindByKey = new Map();
  const setKind = (k, kind) => {
    kindByKey.set(k, mergeUniformGridMarkerKind(kindByKey.get(k), kind));
  };

  routes.forEach((route) => {
    const pts = route.points || [];
    if (!pts.length) return;
    setKind(`${pts[0].x},${pts[0].y}`, 'endpoint');
    setKind(`${pts[pts.length - 1].x},${pts[pts.length - 1].y}`, 'endpoint');
    pts.forEach((p, idx) => {
      if (isUniformGridTurningPoint(pts, idx)) setKind(`${p.x},${p.y}`, 'bend');
    });
  });
  routeCountByPoint.forEach((count, k) => {
    if (count > 1) setKind(k, 'crossing');
  });
  return kindByKey;
}

/** 隨機產生路線後：寫入每個頂點的 markerKind（拓撲標記，後續 HV 不刪） */
export function attachUniformGridRouteMarkerKinds(routes) {
  if (!Array.isArray(routes)) return;
  const kindByKey = computeGeometricKindByKey(routes);
  routes.forEach((route) => {
    route.points = (route.points || []).map((p) => ({
      x: p.x,
      y: p.y,
      markerKind: kindByKey.get(`${p.x},${p.y}`) || 'vertex',
    }));
  });
}

/** @param {{ markerKind?: UniformGridMarkerKind }[]} routes */
export function routesUseStoredMarkerKinds(routes) {
  return (
    Array.isArray(routes) &&
    routes.some((r) => (r.points || []).some((p) => p.markerKind != null))
  );
}

/**
 * 繪製／切線用 marker key 集合
 * @param {{ points: { x: number, y: number, markerKind?: UniformGridMarkerKind }[] }[]} routes
 */
export function collectUniformGridMarkerKeys(routes) {
  const pointKey = (p) => `${p.x},${p.y}`;
  const pointByKey = new Map();
  const routeCountByPoint = computeRouteCountByPoint(routes);
  const turningPointKeys = new Set();
  const endpointKeys = new Set();
  const crossingKeys = new Set();
  const useStored = routesUseStoredMarkerKinds(routes);

  routes.forEach((route) => {
    (route.points || []).forEach((p) => pointByKey.set(pointKey(p), p));
  });

  if (useStored) {
    routes.forEach((route) => {
      (route.points || []).forEach((p) => {
        const k = pointKey(p);
        if (p.markerKind === 'bend') turningPointKeys.add(k);
        else if (p.markerKind === 'endpoint') endpointKeys.add(k);
        else if (p.markerKind === 'crossing') crossingKeys.add(k);
      });
    });
  } else {
    routes.forEach((route) => {
      const pts = route.points || [];
      if (!pts.length) return;
      endpointKeys.add(pointKey(pts[0]));
      endpointKeys.add(pointKey(pts[pts.length - 1]));
      pts.forEach((p, idx) => {
        if (isUniformGridTurningPoint(pts, idx)) turningPointKeys.add(pointKey(p));
      });
    });
    routeCountByPoint.forEach((count, k) => {
      if (count > 1 && !turningPointKeys.has(k)) crossingKeys.add(k);
    });
  }

  return { pointKey, pointByKey, routeCountByPoint, turningPointKeys, endpointKeys, crossingKeys, useStored };
}

/**
 * 路線切分斷點：拓撲 bend/crossing 或幾何 fallback
 */
export function isUniformGridRouteBreakPoint(p, points, idx, routeCountByPoint, pointKey) {
  if (p?.markerKind === 'bend' || p?.markerKind === 'crossing') return true;
  if (p?.markerKind) return false;
  const k = pointKey(p);
  if ((routeCountByPoint.get(k) || 0) > 1) return true;
  return isUniformGridTurningPoint(points, idx);
}
