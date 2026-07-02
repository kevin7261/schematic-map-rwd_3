/**
 * 將「AI示意圖測試」routes（processedJsonData.routes）轉成
 * 路網網格可讀的 spaceNetworkGridJsonData flat segments（每 route 一段）。
 *
 * routes 格式：[{ color, routeName?, points:[{x,y,markerKind}], stations:[{x,y}] }]
 *  - points：拓撲關鍵點（端點／轉乘／轉折／一般頂點），不含黑站
 *  - stations：黑站（沿線段落）
 *
 * flat segment 格式（與 ①–⑧「站點與路線調整」層一致）：
 *  { route_name, name, color, route_colors, points:[[x,y]…], nodes:[…], way_properties }
 *  - points：關鍵點與黑站依幾何順序交錯後之陣列（[x,y]）
 *  - nodes：與 points 平行；端點→terminal(#1565c0)、轉乘→connect(#ff0000)、
 *    轉折→#e377c2、黑站→node_type 'line' 且 tags._forceDrawBlackDot=true
 *
 * 座標：AI測試網格 y=0 在上、向下增大；flat／SpaceNetworkGridTab 以 y 大者在上方，
 *  故以各 route 之 maxY 上下翻轉（y' = maxY - y），維持視覺上下一致。
 * 反向對應 {@link convertRmaFlatToAiTestRoutes}（rmaFlatToAiTestRoutes.js）。
 */

function num(v) {
  return Number(v ?? 0);
}

function ptXY(p) {
  return Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p?.x), num(p?.y)];
}

/** 點到線段 [a,b] 的最短距離平方 */
function pointToSegmentDistSq(p, a, b) {
  const [px, py] = ptXY(p);
  const [ax, ay] = ptXY(a);
  const [bx, by] = ptXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/** 黑站在線段 [a,b] 上的參數 t（用於沿線排序） */
function segParamT(st, a, b) {
  const [px, py] = ptXY(st);
  const [ax, ay] = ptXY(a);
  const [bx, by] = ptXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  return len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
}

function markerKindToNode(kind, x, y) {
  const base = { x_grid: x, y_grid: y };
  if (kind === 'endpoint') {
    return {
      node_type: 'terminal',
      node_class_color: '#1565c0',
      tags: { ...base, node_type: 'terminal', node_class_color: '#1565c0' },
    };
  }
  if (kind === 'crossing') {
    return {
      node_type: 'connect',
      node_class_color: '#ff0000',
      tags: { ...base, node_type: 'connect', node_class_color: '#ff0000' },
    };
  }
  if (kind === 'bend') {
    return {
      node_kind: 'right_angle_pink',
      node_class_color: '#e377c2',
      tags: { ...base, node_kind: 'right_angle_pink', node_class_color: '#e377c2' },
    };
  }
  return { tags: { ...base } };
}

function blackStationNode(x, y) {
  return {
    node_type: 'line',
    node_class_color: '#000000',
    tags: {
      x_grid: x,
      y_grid: y,
      node_type: 'line',
      node_class_color: '#000000',
      _forceDrawBlackDot: true,
    },
  };
}

/** 全部 route 之 points＋stations 的最大 y（供上下翻轉軸） */
function computeRoutesMaxY(routes) {
  let maxY = -Infinity;
  for (const r of routes) {
    for (const p of r.points || []) {
      const [, y] = ptXY(p);
      if (y > maxY) maxY = y;
    }
    for (const s of r.stations || []) {
      const [, y] = ptXY(s);
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(maxY) ? maxY : 0;
}

/**
 * @param {Array<{ color?: string, routeName?: string, points?: Array, stations?: Array }>} routes
 * @returns {Array<object>} spaceNetworkGridJsonData flat segments
 */
export function convertAiTestRoutesToRmaFlat(routes) {
  if (!Array.isArray(routes) || !routes.length) return [];
  const maxY = computeRoutesMaxY(routes);
  const flipY = (y) => maxY - y;

  const flat = [];
  routes.forEach((route, idx) => {
    const pts = Array.isArray(route.points) ? route.points : [];
    if (pts.length < 2) return;
    const stations = Array.isArray(route.stations) ? route.stations : [];

    // 每個黑站分配到最近線段 i（pts[i]→pts[i+1]）
    const stationsBySeg = new Map();
    for (const st of stations) {
      let bestSeg = 0;
      let bestD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pointToSegmentDistSq(st, pts[i], pts[i + 1]);
        if (d < bestD) {
          bestD = d;
          bestSeg = i;
        }
      }
      if (!stationsBySeg.has(bestSeg)) stationsBySeg.set(bestSeg, []);
      stationsBySeg.get(bestSeg).push(st);
    }

    const outPoints = [];
    const outNodes = [];
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = ptXY(pts[i]);
      const x = px;
      const y = flipY(py);
      let kind = pts[i]?.markerKind;
      if (!kind && (i === 0 || i === pts.length - 1)) kind = 'endpoint';
      outPoints.push([x, y]);
      outNodes.push(markerKindToNode(kind, x, y));

      // 插入落在線段 i 上的黑站（依沿線參數 t 排序）
      if (i < pts.length - 1 && stationsBySeg.has(i)) {
        const segStations = [...stationsBySeg.get(i)].sort(
          (s1, s2) => segParamT(s1, pts[i], pts[i + 1]) - segParamT(s2, pts[i], pts[i + 1])
        );
        for (const st of segStations) {
          const [sx, syRaw] = ptXY(st);
          outPoints.push([sx, flipY(syRaw)]);
          outNodes.push(blackStationNode(sx, flipY(syRaw)));
        }
      }
    }

    const color = route.color || '#888888';
    const routeName = route.routeName || `AI測試路線_${idx + 1}`;
    flat.push({
      route_name: routeName,
      name: routeName,
      color,
      route_colors: color,
      points: outPoints,
      nodes: outNodes,
      way_properties: { tags: { color, route_colors: color, name: routeName } },
    });
  });
  return flat;
}
