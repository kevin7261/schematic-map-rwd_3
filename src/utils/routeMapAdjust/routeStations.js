/**
 * 🗺️ 路線圖調整（route_map_adjust）— 站點推導與路線顏色工具
 *
 * ⚠️ 本檔為「路線圖調整」圖層**獨立複製**之版本，刻意不與 select_route_map / leaflet_josm_draw
 *    的任何工具共用，避免互相牽動。
 *
 * 由路線（折線）與站點黑點，推導三類站點：
 *  - 🔵 terminal（端點）：每條路線的起點與終點
 *  - 🔴 connect（交點）：某路線節點正好落在另一條路線上（多線共用之站點）
 *  - ⚫ 一般（黑點）：節點黑點
 *
 * 座標一律為 [lat, lng]。
 */

/** 路線具名調色盤（與顏色名一一對應；路線以顏色為名） */
export const ROUTE_MAP_ADJUST_PALETTE = [
  { name: '紅色', hex: '#e6194b' },
  { name: '綠色', hex: '#3cb44b' },
  { name: '藍色', hex: '#4363d8' },
  { name: '橘色', hex: '#f58231' },
  { name: '紫色', hex: '#911eb4' },
  { name: '青色', hex: '#1ca8c9' },
  { name: '洋紅色', hex: '#f032e6' },
  { name: '棕色', hex: '#9a6324' },
  { name: '深青色', hex: '#469990' },
  { name: '暗紅色', hex: '#800000' },
  { name: '海軍藍', hex: '#000075' },
  { name: '橄欖色', hex: '#808000' },
  { name: '粉紅色', hex: '#e377c2' },
  { name: '灰色', hex: '#7f7f7f' },
];

/** 依路線索引取線色（超出調色盤時以黃金角 HSL 備援） */
export const routeMapAdjustColorForIndex = (i) => {
  const idx = Number.isFinite(i) && i >= 0 ? Math.floor(i) : 0;
  if (idx < ROUTE_MAP_ADJUST_PALETTE.length) return ROUTE_MAP_ADJUST_PALETTE[idx].hex;
  const hue = (idx * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 45%)`;
};

/** 依路線索引取顏色名稱（路線以顏色為名） */
export const routeMapAdjustColorNameForIndex = (i) => {
  const idx = Number.isFinite(i) && i >= 0 ? Math.floor(i) : 0;
  if (idx < ROUTE_MAP_ADJUST_PALETTE.length) return ROUTE_MAP_ADJUST_PALETTE[idx].name;
  return `顏色 ${idx + 1}`;
};

/** 點 p 在線段 a-b 上的最近點（平面近似，x=lng、y=lat） */
const closestPointOnSegment = (p, a, b) => {
  const px = p[1];
  const py = p[0];
  const ax = a[1];
  const ay = a[0];
  const bx = b[1];
  const by = b[0];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [ay + t * dy, ax + t * dx];
};

/** 兩點平面距離（度，僅供排序／比較用） */
const planarDist = (a, b) => {
  const dx = a[1] - b[1];
  const dy = a[0] - b[0];
  return Math.sqrt(dx * dx + dy * dy);
};

/** 將點投影到折線上，回傳 { pos, perpDist } */
const projectOnPolyline = (latlngs, point) => {
  let best = null;
  let cum = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = latlngs[i];
    const b = latlngs[i + 1];
    const c = closestPointOnSegment(point, a, b);
    const perpDist = planarDist(point, c);
    if (!best || perpDist < best.perpDist) {
      best = { pos: cum + planarDist(a, c), perpDist };
    }
    cum += planarDist(a, b);
  }
  return best;
};

/** 依容差合併相近的點 */
const dedupePoints = (points, tol = 1e-5) => {
  const out = [];
  for (const p of points) {
    if (!out.some((q) => Math.abs(q[0] - p[0]) < tol && Math.abs(q[1] - p[1]) < tol)) {
      out.push(p);
    }
  }
  return out;
};

/** 路線（索引）清單：折線通過 point（容差內）者 */
const routesThroughPoint = (safeLines, point, tol) => {
  const ids = [];
  safeLines.forEach((l, i) => {
    const pr = projectOnPolyline(l.latlngs, point);
    if (pr && pr.perpDist <= tol) ids.push(i);
  });
  return ids;
};

/**
 * 由路線與黑點推導三類站點。
 * @returns {{terminals:Array<[number,number]>, connects:Array<[number,number]>, blacks:Array<[number,number]>}}
 */
export const computeRouteMapAdjustStations = (lines, blackDots) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const blacks = Array.isArray(blackDots)
    ? blackDots.filter((p) => Array.isArray(p) && p.length >= 2)
    : [];

  const terminals = [];
  for (const l of safeLines) {
    if (l.closed) continue;
    terminals.push(l.latlngs[0], l.latlngs[l.latlngs.length - 1]);
  }

  const connects = [];
  const ON_TOL = 1e-6;
  safeLines.forEach((lx, xi) => {
    lx.latlngs.forEach((v) => {
      for (let yi = 0; yi < safeLines.length; yi++) {
        if (yi === xi) continue;
        const pr = projectOnPolyline(safeLines[yi].latlngs, v);
        if (pr && pr.perpDist <= ON_TOL) {
          connects.push(v);
          break;
        }
      }
    });
  });

  return { terminals, connects: dedupePoints(connects), blacks };
};

/**
 * 逐路線、依序（起點→終點）列出該路線上的站點。
 * 站點型別：'terminal'（端點，藍）｜'connect'（交點，紅）｜'black'（一般，黑）。
 */
export const computeRouteMapAdjustRouteStations = (lines, blackDots) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const { connects, blacks } = computeRouteMapAdjustStations(safeLines, blackDots);
  const ON_LINE_TOL = 1e-6;
  const SAME_TOL = 1e-6;

  const nearSameConnect = (point) =>
    connects.find(
      (c) => Math.abs(c[0] - point[0]) < SAME_TOL && Math.abs(c[1] - point[1]) < SAME_TOL
    ) || null;

  const makeConnectStation = (connectPt, latlng, pos, routeIndex) => ({
    type: 'connect',
    latlng,
    pos,
    connectRoutes: routesThroughPoint(safeLines, connectPt, ON_LINE_TOL).filter(
      (i) => i !== routeIndex
    ),
  });

  return safeLines.map((line, routeIndex) => {
    const pts = line.latlngs;
    const total = (() => {
      let s = 0;
      for (let i = 0; i < pts.length - 1; i++) s += planarDist(pts[i], pts[i + 1]);
      return s;
    })();

    const stations = [];
    if (!line.closed) {
      [
        { latlng: pts[0], pos: 0 },
        { latlng: pts[pts.length - 1], pos: total },
      ].forEach(({ latlng, pos }) => {
        const c = nearSameConnect(latlng);
        if (c) stations.push(makeConnectStation(c, latlng, pos, routeIndex));
        else stations.push({ type: 'terminal', latlng, pos });
      });
    }
    for (const c of connects) {
      const pr = projectOnPolyline(pts, c);
      if (!pr || pr.perpDist > ON_LINE_TOL) continue;
      const dupEndpoint = stations.some(
        (s) =>
          s.type === 'connect' &&
          Math.abs(s.latlng[0] - c[0]) < SAME_TOL &&
          Math.abs(s.latlng[1] - c[1]) < SAME_TOL
      );
      if (!dupEndpoint) stations.push(makeConnectStation(c, c, pr.pos, routeIndex));
    }
    for (const b of blacks) {
      const pr = projectOnPolyline(pts, b);
      if (pr && pr.perpDist <= ON_LINE_TOL) stations.push({ type: 'black', latlng: b, pos: pr.pos });
    }

    stations.sort((a, b) => a.pos - b.pos);
    return {
      routeIndex,
      color: line.color || '#000000',
      closed: !!line.closed,
      stations: stations.map(({ type, latlng, connectRoutes }) =>
        type === 'connect' ? { type, latlng, connectRoutes } : { type, latlng }
      ),
    };
  });
};

/** 兩向量外積（z 分量）：(px,py) × (qx,qy) */
const cross = (px, py, qx, qy) => px * qy - py * qx;

/**
 * 線段 a-b 與 c-d 的「真交叉」交點（0<t<1 且 0<u<1，端點接觸不算）。
 * @returns {[number,number]|null} 交點 [lat,lng] 或 null
 */
const segSegIntersection = (a, b, c, d) => {
  const ax = a[1];
  const ay = a[0];
  const bx = b[1];
  const by = b[0];
  const cx = c[1];
  const cy = c[0];
  const dx = d[1];
  const dy = d[0];
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denom = cross(rx, ry, sx, sy);
  if (Math.abs(denom) < 1e-15) return null; // 平行或共線
  const qpx = cx - ax;
  const qpy = cy - ay;
  const t = cross(qpx, qpy, sx, sy) / denom;
  const u = cross(qpx, qpy, rx, ry) / denom;
  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return [ay + t * ry, ax + t * rx]; // [lat,lng]
  }
  return null;
};

/**
 * 找出「路線幾何交叉但該處沒有站點」的位置（cross）。
 *  - 取不同路線之線段「真交叉」（線段內部相交，非端點接觸）。
 *  - 排除已落在既有站點（terminal／connect／black）附近者 → 只留下「沒有站點」的交叉。
 *  - 不會插入頂點、不截斷任何線；僅回傳交叉座標供疊加標示。
 * @param {Array<{latlngs:Array<[number,number]>}>} lines
 * @param {Array<[number,number]>} [excludePoints] 已有站點座標（要排除的位置）
 * @returns {Array<[number,number]>} 交叉站點座標 [lat,lng]
 */
export const computeRouteMapAdjustCrossPoints = (lines, excludePoints = []) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const raw = [];
  for (let i = 0; i < safeLines.length; i++) {
    for (let j = i + 1; j < safeLines.length; j++) {
      const A = safeLines[i].latlngs;
      const B = safeLines[j].latlngs;
      for (let p = 0; p < A.length - 1; p++) {
        for (let q = 0; q < B.length - 1; q++) {
          const x = segSegIntersection(A[p], A[p + 1], B[q], B[q + 1]);
          if (x) raw.push(x);
        }
      }
    }
  }
  const deduped = dedupePoints(raw, 1e-6);
  const EXCLUDE_TOL = 1e-5; // 約 1m：與既有站點重合則視為「已有站點」，不列為 cross
  const excl = Array.isArray(excludePoints) ? excludePoints : [];
  return deduped.filter(
    (p) =>
      !excl.some((s) => Math.abs(s[0] - p[0]) < EXCLUDE_TOL && Math.abs(s[1] - p[1]) < EXCLUDE_TOL)
  );
};

/**
 * 把整個路網合併成單一結構（圖：節點＋邊）。
 *  - 每條路線拆成相鄰兩點的線段；以「無方向、座標取整（6 位小數 ≈ 0.1m）」為鍵合併。
 *  - 多條路線重疊（共用同一線段）時合併成同一條邊（一條線），
 *    但該邊的 `routes` 以 **list** 記下所有經過此邊之路線的完整屬性。
 * @param {Array<{latlngs:Array<[number,number]>, color?,routeName?,routeId?,routeCompany?,railway?,osmId?}>} lines
 * @returns {{nodes:Array<[number,number]>, edges:Array<{a:[number,number],b:[number,number],routes:object[]}>}}
 */
export const buildRouteMapAdjustMergedNetwork = (lines) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const round = (n) => Number(Number(n).toFixed(6));
  const nodeKey = (p) => `${round(p[0])},${round(p[1])}`;
  const nodes = new Map(); // key -> [lat,lng]
  const edges = new Map(); // edgeKey -> { a, b, routes: [] }

  safeLines.forEach((line, li) => {
    const attr = {
      routeIndex: li,
      routeName: line.routeName ?? null,
      routeId: line.routeId ?? null,
      routeCompany: line.routeCompany ?? null,
      railway: line.railway ?? null,
      osmId: line.osmId ?? null,
      color: line.color ?? null,
    };
    const pts = line.latlngs;
    for (let k = 0; k < pts.length - 1; k++) {
      const aK = nodeKey(pts[k]);
      const bK = nodeKey(pts[k + 1]);
      if (aK === bK) continue; // 零長線段略過
      if (!nodes.has(aK)) nodes.set(aK, [round(pts[k][0]), round(pts[k][1])]);
      if (!nodes.has(bK)) nodes.set(bK, [round(pts[k + 1][0]), round(pts[k + 1][1])]);
      const lo = aK < bK ? aK : bK;
      const hi = aK < bK ? bK : aK;
      const ek = `${lo}|${hi}`;
      let e = edges.get(ek);
      if (!e) {
        e = { a: nodes.get(lo), b: nodes.get(hi), routes: [] };
        edges.set(ek, e);
      }
      // 同一條路線在同一邊只記一次（路線往返同段時避免重複）
      if (!e.routes.some((r) => r.routeIndex === li)) e.routes.push(attr);
    }
  });

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
};

/**
 * 取出「共線段」：被 ≥2 條路線共用（重疊）的線段。
 *  - 以 {@link buildRouteMapAdjustMergedNetwork} 合併後，篩出 routes.length >= 2 的邊。
 * @param {Array} lines 路線
 * @returns {Array<{a:[number,number],b:[number,number],routes:object[]}>} 共線段（每段含經過之路線屬性 list）
 */
export const computeRouteMapAdjustSharedSegments = (lines) => {
  const net = buildRouteMapAdjustMergedNetwork(lines);
  return net.edges.filter((e) => (e.routes?.length || 0) >= 2);
};

/**
 * 找出「頭尾共點」：多條路線的端點（起點或終點）落在同一座標處。
 *  - 僅取非封閉路線的兩個端點；座標取整（6 位小數）後比對。
 *  - 該座標被 ≥2 條不同路線之端點共用時即列入。
 * @param {Array} lines 路線
 * @returns {Array<{latlng:[number,number], routeIndexes:number[]}>}
 */
export const computeRouteMapAdjustSharedEndpoints = (lines) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const round = (n) => Number(Number(n).toFixed(6));
  const key = (p) => `${round(p[0])},${round(p[1])}`;
  const map = new Map(); // key -> { latlng, routes:Set }
  safeLines.forEach((line, li) => {
    if (line.closed) return; // 封閉路線無端點
    const pts = line.latlngs;
    [pts[0], pts[pts.length - 1]].forEach((p) => {
      const k = key(p);
      let e = map.get(k);
      if (!e) {
        e = { latlng: [round(p[0]), round(p[1])], routes: new Set() };
        map.set(k, e);
      }
      e.routes.add(li);
    });
  });
  return [...map.values()]
    .filter((e) => e.routes.size >= 2)
    .map((e) => ({ latlng: e.latlng, routeIndexes: [...e.routes] }));
};
