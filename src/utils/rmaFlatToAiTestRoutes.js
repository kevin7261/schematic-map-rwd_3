/**
 * 將「站點與路線調整前置」一鍵執行 flat（spaceNetworkGridJsonData）
 * 轉成 AI示意圖測試圖層的 processedJsonData.routes 格式。
 * 保留各城市一鍵執行後的原始整數格座標；每 flat section 一條 route（與前置圖層段數 1:1）。
 */
import { readPt } from '@/utils/routeMapAdjust/schematic/input.js';
import { mergeHvNetworkKind } from './uniformGridRouteMarkers.js';

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

/** 依 flat 節點色 + 多路線交會覆寫 markerKind（不用幾何端點推斷） */
function applyMetroMarkerKinds(routes, flatKindByKey) {
  const routeCountByPoint = computeRouteCountByPoint(routes);
  routes.forEach((route) => {
    route.points = route.points.map((p) => {
      const k = `${p.x},${p.y}`;
      let kind = flatKindByKey.get(k) || 'vertex';
      if ((routeCountByPoint.get(k) || 0) > 1 && kind !== 'bend') {
        kind = 'crossing';
      }
      return { x: p.x, y: p.y, markerKind: kind };
    });
  });
}

/** 從 flat 所有點計算整數格邊界（gridX/gridY = 最大 x/y） */
export function computeFlatGridBounds(flat) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seg of flat) {
    for (const p of seg.points || []) {
      const [x, y] = readPt(p);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, gridX: 0, gridY: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    gridX: maxX,
    gridY: maxY,
  };
}

/**
 * 前置／SpaceNetworkGridTab：y 大者在上方；AI測試 GridScalingTab：y=0 在上、向下增大。
 * @param {object[]} flat
 * @param {number} yMax - flat 最大 y（flip 軸）
 */
export function flipFlatYForAiTestGrid(flat, yMax) {
  return flat.map((seg) => ({
    ...seg,
    points: (seg.points || []).map((p) => {
      const [x, y] = readPt(p);
      return [x, yMax - y];
    }),
  }));
}

function isBlackStationNode(node) {
  if (!node || typeof node !== 'object') return false;
  const t = node.tags || {};
  const cc = String(t.node_class_color ?? node.node_class_color ?? '').toLowerCase();
  const nt = String(node.node_type ?? t.node_type ?? '').toLowerCase();
  return cc === '#000000' || nt === 'line';
}

/**
 * 與 oneClick `_index.json` 的 stations 欄位一致：唯一 station_name 數（含紅/藍轉乘與端點站）。
 * @param {object[]} flat
 */
export function computeFlatMetroStats(flat) {
  if (!Array.isArray(flat) || !flat.length) {
    return {
      stationCount: 0,
      blackStationCount: 0,
      routeNameCount: 0,
      segmentCount: 0,
    };
  }

  const names = new Set();
  const blackKeys = new Set();
  const routeNames = new Set();

  for (const seg of flat) {
    const rn = seg.route_name ?? seg.name;
    if (rn) routeNames.add(rn);
    const pts = seg.points || [];
    const nodes = seg.nodes?.length === pts.length ? seg.nodes : [];
    pts.forEach((p, i) => {
      const n = nodes[i];
      if (n) {
        const t = n.tags || {};
        const name = String(t.station_name ?? n.station_name ?? '').trim();
        if (name) names.add(name);
      }
      if (isBlackStationNode(n)) {
        const [x, y] = readPt(p);
        blackKeys.add(`${x},${y}`);
      }
    });
  }

  return {
    stationCount: names.size,
    blackStationCount: blackKeys.size,
    routeNameCount: routeNames.size,
    segmentCount: flat.length,
  };
}

/** @returns {'crossing'|'endpoint'|'bend'|null} */
function markerKindFromFlatNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (isBlackStationNode(node)) return null;
  const t = node.tags || {};
  const cc = String(t.node_class_color ?? node.node_class_color ?? '').toLowerCase();
  const nt = String(node.node_type ?? t.node_type ?? '').toLowerCase();
  const nk = String(node.node_kind ?? t.node_kind ?? '').toLowerCase();
  if (cc === '#e377c2' || nk === 'right_angle_pink') return 'bend';
  if (cc === '#1565c0' || nt === 'terminal') return 'endpoint';
  if (cc === '#ff0000' || cc === '#ffd600' || cc === '#9c27b0') return 'crossing';
  if (nt === 'connect') return 'crossing';
  return null;
}

function routeColorFromSegment(seg) {
  const c = seg.color ?? seg.way_properties?.tags?.color;
  return c ? String(c) : '#888888';
}

function segmentToPolyline(seg) {
  const pts = seg.points || [];
  if (pts.length < 2) return null;
  return {
    points: pts.map((p) => readPt(p)),
    nodes: seg.nodes?.length === pts.length ? seg.nodes : pts.map(() => null),
  };
}

function polylineToRoutePoints(chained, setFlatKind) {
  const stations = [];
  const points = [];
  const pushKeypoint = (x, y, node) => {
    const kind = markerKindFromFlatNode(node);
    const xi = Math.round(x);
    const yi = Math.round(y);
    const last = points[points.length - 1];
    if (last && last.x === xi && last.y === yi) {
      if (kind) setFlatKind(xi, yi, kind);
      if (kind && last.markerKind) {
        last.markerKind = mergeHvNetworkKind(last.markerKind, kind);
      } else if (kind) {
        last.markerKind = kind;
      }
      return;
    }
    if (kind) setFlatKind(xi, yi, kind);
    points.push(kind ? { x: xi, y: yi, markerKind: kind } : { x: xi, y: yi });
  };

  chained.points.forEach(([x, y], idx) => {
    const node = chained.nodes[idx];
    if (isBlackStationNode(node)) {
      stations.push({ x, y });
      return;
    }
    pushKeypoint(x, y, node);
  });

  return { points, stations };
}

/**
 * @param {object[]} flat - spaceNetworkGridJsonData（保留原始整數格座標）
 * @returns {{ ok: boolean, message?: string, routes?: object[], meta?: object }}
 */
export function convertRmaFlatToAiTestRoutes(flat) {
  if (!Array.isArray(flat) || !flat.length) {
    return { ok: false, message: '路網 flat 為空。' };
  }

  const bounds = computeFlatGridBounds(flat);
  const orientedFlat = flipFlatYForAiTestGrid(flat, bounds.maxY);
  const gridBounds = computeFlatGridBounds(orientedFlat);

  /** @type {Map<string, 'crossing'|'endpoint'|'bend'|'vertex'>} */
  const flatKindByKey = new Map();
  const setFlatKind = (x, y, kind) => {
    if (!kind) return;
    const k = `${x},${y}`;
    flatKindByKey.set(k, mergeHvNetworkKind(flatKindByKey.get(k), kind));
  };

  const routes = [];
  for (const seg of orientedFlat) {
    const routeName = seg.route_name ?? seg.name ?? '';
    if (!routeName) continue;
    const polyline = segmentToPolyline(seg);
    if (!polyline) continue;
    const { points, stations } = polylineToRoutePoints(polyline, setFlatKind);
    routes.push({
      color: routeColorFromSegment(seg),
      routeName,
      points,
      stations,
    });
  }

  if (!routes.length) {
    return { ok: false, message: '無法從 flat 形成任何路線段。' };
  }

  const validRoutes = routes.filter((r) => (r.points || []).length >= 2);
  if (!validRoutes.length) {
    return { ok: false, message: '簡化後無有效路線段（每段至少兩個拓撲點）。' };
  }

  applyMetroMarkerKinds(validRoutes, flatKindByKey);

  const flatStats = computeFlatMetroStats(orientedFlat);

  return {
    ok: true,
    routes: validRoutes,
    meta: {
      gridX: gridBounds.gridX,
      gridY: gridBounds.gridY,
      minX: gridBounds.minX,
      minY: gridBounds.minY,
      maxX: gridBounds.maxX,
      maxY: gridBounds.maxY,
      routeCount: validRoutes.length,
      routeNameCount: flatStats.routeNameCount,
      segmentCount: flatStats.segmentCount,
      stationCount: flatStats.stationCount,
      blackStationCount: flatStats.blackStationCount,
    },
  };
}
