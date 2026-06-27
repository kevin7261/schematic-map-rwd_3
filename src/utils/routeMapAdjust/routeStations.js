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
export const computeRouteMapAdjustStations = (lines, blackDots, stationCoords) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const blacks = Array.isArray(blackDots)
    ? blackDots.filter((p) => Array.isArray(p) && p.length >= 2)
    : [];

  // 🎯 站點為基礎分類（有站點座標時）：紅/藍/黑只出現在真實車站，不在共軌/交叉非站點冒紅。
  if (Array.isArray(stationCoords) && stationCoords.length) {
    const ON = 1e-6;
    const rid = (l, i) => l.routeName || l.routeId || `#${i}`;
    const vk = (p) => `${(+p[0]).toFixed(6)},${(+p[1]).toFixed(6)}`;
    const endpointKeys = new Set();
    for (const l of safeLines) {
      if (l.closed) continue;
      endpointKeys.add(vk(l.latlngs[0]));
      endpointKeys.add(vk(l.latlngs[l.latlngs.length - 1]));
    }
    const t = [];
    const c = [];
    const b = [];
    for (const s of stationCoords) {
      if (!Array.isArray(s) || s.length < 2) continue;
      const routes = new Set();
      safeLines.forEach((l, i) => {
        const pr = projectOnPolyline(l.latlngs, s);
        if (pr && pr.perpDist <= ON) routes.add(rid(l, i));
      });
      if (routes.size >= 2) c.push(s);
      else if (endpointKeys.has(vk(s))) t.push(s);
      else b.push(s);
    }
    return { terminals: dedupePoints(t), connects: dedupePoints(c), blacks: dedupePoints(b) };
  }

  // 各頂點「總出現次數」（跨所有線、含同線重複）：真線端只出現 1 次；環線/分支/轉乘接點 ≥2 次
  const vkey = (p) => `${(+p[0]).toFixed(6)},${(+p[1]).toFixed(6)}`;
  const vertexCount = new Map();
  for (const l of safeLines)
    for (const v of l.latlngs) {
      const k = vkey(v);
      vertexCount.set(k, (vertexCount.get(k) || 0) + 1);
    }
  // 🔵 端點：首尾頂點且總出現次數 ≤1（環線/分支/轉乘接點非端點）
  const terminals = [];
  for (const l of safeLines) {
    if (l.closed) continue;
    for (const v of [l.latlngs[0], l.latlngs[l.latlngs.length - 1]]) {
      if ((vertexCount.get(vkey(v)) || 0) <= 1) terminals.push(v);
    }
  }

  // 🔴 交點：落在「不同路線」上才算；同線分支接點不算
  const connects = [];
  const ON_TOL = 1e-6;
  const rid = (l, i) => l.routeName || l.routeId || `#${i}`;
  safeLines.forEach((lx, xi) => {
    const xid = rid(lx, xi);
    lx.latlngs.forEach((v) => {
      for (let yi = 0; yi < safeLines.length; yi++) {
        if (yi === xi) continue;
        if (rid(safeLines[yi], yi) === xid) continue;
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
 * 骨架專用站點分類（degree 拓撲）。**只給「路線圖轉換骨架」用，不影響路線圖載入顯示。**
 * 規則：同一骨架路線上，除頭尾外不該有紅點 →
 *   🔴 connect 只在「真正分歧」(degree≥3)；🔵 terminal 在端點(degree≤1)；
 *   其餘 degree-2「直通站」（含多線共軌並行通過）一律 🖤 黑（之後沿邊內插放回，不冒紅）。
 * degree 以「每條線上相鄰站」計，共軌的相同前後站會合併 → 並行通過站 degree=2 → 黑。
 */
export const computeRouteMapAdjustSkeletonStations = (lines, blackDots, stationCoords) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  if (!Array.isArray(stationCoords) || !stationCoords.length) {
    return computeRouteMapAdjustStations(lines, blackDots, stationCoords); // 無站點座標 → 退回原規則
  }
  const ON = 1e-6;
  // 每條線上的站點依投影位置排序 → 相鄰者互為鄰居；degree = 不同鄰居站數。
  // ⚠️ 不用「線段端點」當端點：一條線被切成多段、段與段的接點其 degree=2（1-1 相連），
  //    應接成一條連續骨頭、該點變黑，而非當端點斷開。真端點只有 degree=1。
  const neighbors = stationCoords.map(() => new Set());
  for (const l of safeLines) {
    const on = [];
    stationCoords.forEach((s, si) => {
      if (!Array.isArray(s) || s.length < 2) return;
      const pr = projectOnPolyline(l.latlngs, s);
      if (pr && pr.perpDist <= ON) on.push({ si, pos: pr.pos });
    });
    on.sort((a, b) => a.pos - b.pos);
    for (let k = 0; k < on.length; k++) {
      if (k > 0 && on[k - 1].si !== on[k].si) neighbors[on[k].si].add(on[k - 1].si);
      if (k < on.length - 1 && on[k + 1].si !== on[k].si) neighbors[on[k].si].add(on[k + 1].si);
    }
    // 🟢 環線(circle)：除了 closed===true，首尾同座標也算封閉 → 接起接縫，避免接縫站
    //    被當成 degree-1 端點（藍點）。與 computeRouteMapAdjustLoopRoutes 的環線判定一致。
    const lp = l.latlngs;
    const isClosed =
      l.closed === true ||
      `${(+lp[0][0]).toFixed(6)},${(+lp[0][1]).toFixed(6)}` ===
        `${(+lp[lp.length - 1][0]).toFixed(6)},${(+lp[lp.length - 1][1]).toFixed(6)}`;
    if (isClosed && on.length >= 2) {
      const a = on[0].si;
      const z = on[on.length - 1].si;
      if (a !== z) {
        neighbors[a].add(z);
        neighbors[z].add(a);
      }
    }
  }
  const t = [];
  const c = [];
  const b = [];
  stationCoords.forEach((s, si) => {
    if (!Array.isArray(s) || s.length < 2) return;
    const deg = neighbors[si].size;
    if (deg >= 3) c.push(s); // 🔴 真正分歧
    else if (deg <= 1) t.push(s); // 🔵 真端點（degree 1）
    else b.push(s); // 🖤 degree-2「1-1 相連」直通（含共軌、被切段接點）→ 黑、串接成一條骨頭
  });
  return { terminals: dedupePoints(t), connects: dedupePoints(c), blacks: dedupePoints(b) };
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
 * 找出「頭尾共點」：某條路線的端點（起點或終點）與另一條路線共點。
 *  - 僅取非封閉路線的兩個端點。
 *  - 判定方式：該端點是否「落在」≥2 條路線上（含自身）。另一條路線只是「經過」此點
 *    （該點為其中間節點）也算共點 —— 例如某線在此終止、另一線從此通過。
 *  - 以投影距離（perpDist ≤ 容差）判定點是否落在某折線上，與 connect 偵測一致。
 * @param {Array} lines 路線
 * @returns {Array<{latlng:[number,number], routeIndexes:number[]}>}
 */
export const computeRouteMapAdjustSharedEndpoints = (lines) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const ON_TOL = 1e-6; // 約 0.1m：點是否落在折線上
  const round = (n) => Number(Number(n).toFixed(6));
  const key = (p) => `${round(p[0])},${round(p[1])}`;
  const out = new Map(); // key -> { latlng, routes:Set }
  safeLines.forEach((line) => {
    if (line.closed) return; // 封閉路線無端點
    const pts = line.latlngs;
    [pts[0], pts[pts.length - 1]].forEach((p) => {
      // 找出所有「通過此端點」的路線（含自身）
      const touching = new Set();
      safeLines.forEach((l2, lj) => {
        const pr = projectOnPolyline(l2.latlngs, p);
        if (pr && pr.perpDist <= ON_TOL) touching.add(lj);
      });
      if (touching.size < 2) return; // 僅自身 → 非共點
      const k = key(p);
      let e = out.get(k);
      if (!e) {
        e = { latlng: [round(p[0]), round(p[1])], routes: new Set() };
        out.set(k, e);
      }
      touching.forEach((r) => e.routes.add(r));
    });
  });
  return [...out.values()].map((e) => ({ latlng: e.latlng, routeIndexes: [...e.routes] }));
};

/**
 * 找出「頭尾共點」線段：在**同一對紅點（共點）之間**，有 **≥2 條路線各走不同路徑（分歧）**
 * 的那些「中段」。
 *  - 紅點＝該路線上有 ≥2 條路線通過的頂點（連接點 connect）。
 *  - 把每條路線依紅點切成「相鄰兩紅點之間」的子路段；只取**獨有（非共線）**的子路段。
 *  - 依「兩端紅點配對」分組；某對紅點之間若出現 **≥2 種不同幾何路徑** → 這些分歧路段即為
 *    頭尾共點（同頭同尾、中間各自分開），全部標出。只有單一路徑（或共線）者不算。
 * @param {Array} lines 路線
 * @returns {Array<{routeIndex:number, path:Array<[number,number]>, color:string|null,
 *                  aRouteCount:number, bRouteCount:number}>}
 */
export const computeRouteMapAdjustSharedEndpointSegments = (lines) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const ON_TOL = 1e-6;
  const round = (n) => Number(Number(n).toFixed(6));
  const nodeKey = (p) => `${round(p[0])},${round(p[1])}`;
  const edgeKey = (a, b) => {
    const ka = nodeKey(a);
    const kb = nodeKey(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  /** 通過頂點 p 的路線數（含自身）；≥2 即為紅點（連接點） */
  const routesThrough = (p, li) => {
    let c = 1; // 自身
    for (let lj = 0; lj < safeLines.length; lj++) {
      if (lj === li) continue;
      const pr = projectOnPolyline(safeLines[lj].latlngs, p);
      if (pr && pr.perpDist <= ON_TOL) c += 1;
    }
    return c;
  };

  // 共線邊（被 ≥2 條路線共用之線段）鍵集合：用於排除「相連（共線）」的子路段
  const sharedEdgeKeys = new Set();
  buildRouteMapAdjustMergedNetwork(safeLines).edges.forEach((e) => {
    if ((e.routes?.length || 0) >= 2) sharedEdgeKeys.add(edgeKey(e.a, e.b));
  });
  const exclusiveBetween = (pts, i0, i1) => {
    for (let e = i0; e < i1; e++) {
      if (sharedEdgeKeys.has(edgeKey(pts[e], pts[e + 1]))) return false;
    }
    return true;
  };

  // 1) 收集每條路線「相鄰兩紅點之間、且獨有（非共線）」的子路段
  const subpaths = [];
  safeLines.forEach((line, li) => {
    const pts = line.latlngs;
    // 🟢 環線(circle)不列入「頭尾共點(藍)」：環線只走綠線，不會有藍點。
    if (line.closed === true || nodeKey(pts[0]) === nodeKey(pts[pts.length - 1])) return;
    const redIdx = [];
    for (let i = 0; i < pts.length; i++) {
      if (routesThrough(pts[i], li) >= 2) redIdx.push(i);
    }
    for (let k = 0; k < redIdx.length - 1; k++) {
      const i0 = redIdx[k];
      const i1 = redIdx[k + 1];
      if (i1 - i0 < 1) continue;
      if (!exclusiveBetween(pts, i0, i1)) continue; // 共線段不算
      const path = pts.slice(i0, i1 + 1);
      const a = pts[i0];
      const b = pts[i1];
      const ka = nodeKey(a);
      const kb = nodeKey(b);
      const pairKey = ka < kb ? `${ka}#${kb}` : `${kb}#${ka}`;
      const seq = path.map(nodeKey);
      const fwd = seq.join('>');
      const rev = [...seq].reverse().join('>');
      const pathKey = fwd < rev ? fwd : rev; // 幾何路徑鍵（無方向）
      subpaths.push({
        routeIndex: li,
        path,
        color: line.color || null,
        pairKey,
        pathKey,
        aRouteCount: routesThrough(a, li),
        bRouteCount: routesThrough(b, li),
      });
    }
  });

  // 2) 依「兩端紅點配對」分組；同對紅點間出現 ≥2 種不同路徑（分歧）才標出
  const byPair = new Map();
  for (const sp of subpaths) {
    if (!byPair.has(sp.pairKey)) byPair.set(sp.pairKey, []);
    byPair.get(sp.pairKey).push(sp);
  }
  const out = [];
  for (const group of byPair.values()) {
    const distinct = new Set(group.map((s) => s.pathKey));
    if (distinct.size < 2) continue; // 只有一種路徑（或全共線）→ 非分歧
    const seen = new Set();
    for (const sp of group) {
      if (seen.has(sp.pathKey)) continue; // 每種不同路徑取一條代表
      seen.add(sp.pathKey);
      out.push({
        routeIndex: sp.routeIndex,
        path: sp.path,
        color: sp.color,
        aRouteCount: sp.aRouteCount,
        bRouteCount: sp.bRouteCount,
      });
    }
  }
  return out;
};

/**
 * 找出「頭尾同點」的路線（環線）：單一路線的頭端點與尾端點為同一座標。
 *  - 判定：line.closed === true，或起點與終點座標相同（取整 6 位）。
 *  - 回傳整條路線路徑，供地圖以綠色 highlight。
 * @param {Array} lines 路線
 * @returns {Array<{routeIndex:number, path:Array<[number,number]>, color:string|null}>}
 */
export const computeRouteMapAdjustLoopRoutes = (lines) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const round = (n) => Number(Number(n).toFixed(6));
  const key = (p) => `${round(p[0])},${round(p[1])}`;
  const out = [];
  safeLines.forEach((line, li) => {
    const pts = line.latlngs;
    const isLoop = line.closed === true || key(pts[0]) === key(pts[pts.length - 1]);
    if (isLoop) out.push({ routeIndex: li, path: pts, color: line.color || null });
  });
  return out;
};

/**
 * 把目前路網變成「骨架圖」：
 *  - 重疊（共線）之路段合併為一條邊（無方向去重）。
 *  - 不同路線之「真交叉」處若原本沒有節點，生成一個交叉節點，並把該點插入相關路線（切段）。
 *  - ⚠️ 不可改變原本結構：原本的端點（🔵 terminal）與交點（🔴 connect）站點一律保留為節點，
 *    收縮 degree-2 過路點時絕不可穿過它們，避免相交點消失或不同路線被誤接成一條。
 * @param {Array} lines 路線
 * @param {Array<[number,number]>} [blackDots] 黑點（供站點分類）
 * @param {Array<[number,number]>} [stationCoords] 站點座標（供以站點為基礎之分類）
 * @returns {{nodes:Array<[number,number]>, edges:Array<{a:[number,number],b:[number,number],routeCount:number}>,
 *           crossNodes:Array<[number,number]>}}
 */
export const buildRouteMapAdjustSkeleton = (lines, blackDots = null, stationCoords = null) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const round = (n) => Number(Number(n).toFixed(6));
  const key = (p) => `${round(p[0])},${round(p[1])}`;
  const ON_TOL = 1e-6;

  // 0) 骨架站點分類（degree 拓撲）：端點🔵(degree≤1)／真正分歧🔴(degree≥3) 保留為節點；
  //    degree-2 直通站（含共軌並行）不強制成節點 → 會被下方 degree-2 收縮成黑點（除頭尾外不冒紅）。
  const { terminals: stationTerminals, connects: stationConnects } = computeRouteMapAdjustSkeletonStations(
    safeLines,
    blackDots,
    stationCoords
  );
  // 交點要插入「每條通過該點的路線」（切段），端點本就是路線頂點不需插入。
  const stationConnectPts = (stationConnects || []).filter((p) => Array.isArray(p) && p.length >= 2);
  // 端點＋交點之鍵 → 強制視為真實節點（收縮時不可穿越）。
  const forcedNodeKeys = new Set([
    ...(stationTerminals || []).map((p) => key(p)),
    ...stationConnectPts.map((p) => key(p)),
  ]);

  // 1) 所有「真交叉」點（不同路線之線段內部相交）
  const rawCross = [];
  for (let i = 0; i < safeLines.length; i++) {
    for (let j = i + 1; j < safeLines.length; j++) {
      const A = safeLines[i].latlngs;
      const B = safeLines[j].latlngs;
      for (let p = 0; p < A.length - 1; p++) {
        for (let q = 0; q < B.length - 1; q++) {
          const x = segSegIntersection(A[p], A[p + 1], B[q], B[q + 1]);
          if (x) rawCross.push(x);
        }
      }
    }
  }
  const crossings = dedupePoints(rawCross, 1e-7);

  // 既有頂點集合 → 判斷哪些交叉是「新生成」的點
  const existing = new Set();
  for (const l of safeLines) for (const v of l.latlngs) existing.add(key(v));
  const crossNodes = crossings.filter((c) => !existing.has(key(c)));

  // 2) 把「交叉點＋交點站點」插入各路線（在所屬線段上、依序），使其成為圖的頂點（切段）。
  //    交點站點（connect）亦須切段，否則某路線只是「路過」該站而未斷點，相交點會在收縮時消失。
  const splitPoints = dedupePoints([...crossings, ...stationConnectPts], 1e-7);
  const insertOnLine = (latlngs) => {
    const out = [latlngs[0]];
    for (let i = 0; i < latlngs.length - 1; i++) {
      const a = latlngs[i];
      const b = latlngs[i + 1];
      const ab = planarDist(a, b);
      const on = [];
      for (const c of splitPoints) {
        const cp = closestPointOnSegment(c, a, b);
        if (planarDist(c, cp) > ON_TOL) continue; // 不在此段
        const ta = planarDist(a, c);
        if (ta > 1e-9 && ta < ab - 1e-9) on.push({ c, t: ta }); // 嚴格落在 a-b 之間
      }
      on.sort((x, y) => x.t - y.t);
      for (const o of on) out.push(o.c);
      out.push(b);
    }
    const dd = [out[0]];
    for (let i = 1; i < out.length; i++) {
      if (key(out[i]) !== key(dd[dd.length - 1])) dd.push(out[i]);
    }
    return dd;
  };

  // 3) 建鄰接圖（微段，含路線屬性），再收縮 degree-2 過路點 → 每條骨架邊 = 兩個
  //    「交叉點/端點」(degree≠2 或交叉生成點) 之間的整段折線。
  const attrOf = (l, li) => ({
    routeIndex: li,
    routeName: l.routeName || null,
    routeId: l.routeId || null,
    color: l.color || null,
    railway: l.railway || null,
  });
  const crossKeys = new Set(crossNodes.map((c) => key(c)));
  const vert = new Map(); // key -> latlng
  const adj = new Map(); // key -> Map(nbKey -> Map(routeIndex->attr))
  const addAdj = (k1, k2, attr) => {
    if (!adj.has(k1)) adj.set(k1, new Map());
    let m = adj.get(k1).get(k2);
    if (!m) {
      m = new Map();
      adj.get(k1).set(k2, m);
    }
    m.set(attr.routeIndex, attr);
  };
  safeLines.forEach((l, li) => {
    const attr = attrOf(l, li);
    const pts = insertOnLine(l.latlngs).map((p) => [round(p[0]), round(p[1])]);
    for (const p of pts) {
      const k = key(p);
      if (!vert.has(k)) vert.set(k, p);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = key(pts[k]);
      const b = key(pts[k + 1]);
      if (a === b) continue;
      addAdj(a, b, attr);
      addAdj(b, a, attr);
    }
  });

  const degree = (k) => adj.get(k)?.size || 0;
  // 交叉點／端點／分歧點，以及「本來的」端點(🔵)／交點(🔴)站點，皆為真實節點：
  //   收縮 degree-2 過路點時絕不可穿越，保留原本結構（相交點不消失、路線不被誤接）。
  const isReal = (k) => degree(k) !== 2 || crossKeys.has(k) || forcedNodeKeys.has(k);
  const mkey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const microSeen = new Set();
  const edgesOut = [];
  const nodeRoutes = new Map(); // key -> Map(routeIndex->attr)
  const addNodeRoutes = (k, routesMap) => {
    if (!nodeRoutes.has(k)) nodeRoutes.set(k, new Map());
    for (const [ri, a] of routesMap) nodeRoutes.get(k).set(ri, a);
  };

  // 從某條未走過的微段，沿 degree-2 過路點走到下一個真實節點（或回到起點＝環）
  const walkChain = (start, firstNb) => {
    const path = [vert.get(start)];
    const routes = new Map();
    let prev = start;
    let cur = firstNb;
    microSeen.add(mkey(prev, cur));
    for (const [ri, a] of adj.get(prev).get(cur)) routes.set(ri, a);
    path.push(vert.get(cur));
    let guard = 0;
    while (!isReal(cur) && cur !== start && guard++ < 100000) {
      const nbrs = [...adj.get(cur).keys()];
      const next = nbrs.find((x) => x !== prev);
      if (next === undefined) break;
      microSeen.add(mkey(cur, next));
      for (const [ri, a] of adj.get(cur).get(next)) routes.set(ri, a);
      path.push(vert.get(next));
      prev = cur;
      cur = next;
    }
    edgesOut.push({ path, routes: [...routes.values()] });
    addNodeRoutes(start, routes);
    addNodeRoutes(cur, routes);
  };

  // (a) 從真實節點出發收縮
  for (const k of vert.keys()) {
    if (!isReal(k)) continue;
    for (const nb of adj.get(k).keys()) {
      if (!microSeen.has(mkey(k, nb))) walkChain(k, nb);
    }
  }
  // (b) 純環（全 degree-2、無真實節點）：任取起點收縮成一條（首尾同點）
  for (const k of vert.keys()) {
    for (const nb of (adj.get(k) || new Map()).keys()) {
      if (!microSeen.has(mkey(k, nb))) walkChain(k, nb);
    }
  }

  // 分類旗標：
  //  - 環線路線索引（同一路線頭尾相同）
  //  - 頭尾共點：沿用原本 highlight 邏輯（兩共點間多條分走之子路段），取其兩端共點座標
  const loopRouteIdx = new Set();
  safeLines.forEach((l, li) => {
    if (l.closed === true || key(l.latlngs[0]) === key(l.latlngs[l.latlngs.length - 1])) {
      loopRouteIdx.add(li);
    }
  });
  // 🔵 頭尾共點（藍線）：骨架圖上「同一對節點之間有 ≥2 條不同邊（分歧路徑）」者
  //   ＝原本 highlight 邏輯（兩共點間多條分走），在收縮後的圖上即為「平行多重邊」。
  const pairEdges = new Map(); // pairKey -> [edgeIndex...]
  edgesOut.forEach((e, i) => {
    const p = e.path;
    if (!Array.isArray(p) || p.length < 2) return;
    const a = key(p[0]);
    const b = key(p[p.length - 1]);
    if (a === b) return; // 自環不算
    const pk = a < b ? `${a}#${b}` : `${b}#${a}`;
    if (!pairEdges.has(pk)) pairEdges.set(pk, []);
    pairEdges.get(pk).push(i);
  });
  const htsEdgeIdx = new Set();
  for (const idxs of pairEdges.values()) {
    if (idxs.length >= 2) idxs.forEach((i) => htsEdgeIdx.add(i));
  }

  // 各邊分類（環線優先於頭尾共點：circle 一律走綠線、2 個紫點，不可被當成藍線只切 1 個）
  const classified = edgesOut.map((e, i) => {
    const isLoop = (e.routes || []).some((r) => loopRouteIdx.has(r.routeIndex)); // 🟢 環線
    return {
      ...e,
      isMerged: (e.routes?.length || 0) >= 2, // 🔴 合併（共線）
      isLoop,
      isHeadTailShared: htsEdgeIdx.has(i) && !isLoop, // 🔵 頭尾共點（環線不算）
    };
  });

  // 折線上「指定弧長比例位置」之頂點索引（各取最接近該比例之彎折頂點）
  const turningIndicesAtFractions = (path, fractions) => {
    if (!Array.isArray(path) || path.length < 3 || !fractions.length) return [];
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + planarDist(path[i - 1], path[i]));
    const total = cum[cum.length - 1];
    const turns = [];
    for (let i = 1; i < path.length - 1; i++) {
      const ax = path[i][1] - path[i - 1][1];
      const ay = path[i][0] - path[i - 1][0];
      const bx = path[i + 1][1] - path[i][1];
      const by = path[i + 1][0] - path[i][0];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la === 0 || lb === 0) continue;
      if (Math.abs(ax * by - ay * bx) / (la * lb) > 1e-3) turns.push(i);
    }
    const cand = turns.length ? turns : path.map((_, i) => i).slice(1, -1);
    if (!cand.length) return [];
    const out = [];
    const used = new Set();
    for (const fr of fractions) {
      const target = total * fr;
      let best = -1;
      let bd = Infinity;
      for (const i of cand) {
        if (used.has(i)) continue;
        const d = Math.abs(cum[i] - target);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        used.add(best);
        out.push(best);
      }
    }
    return out.sort((a, b) => a - b);
  };

  // 🟣 紫點切斷位置：🔵 頭尾共點(藍線)＝1/2 處 1 個；🟢 環線(綠線)＝1/3、2/3 處 2 個；🔴 合併(共線)＝不切。
  //    紫點成為節點，邊在該處一分為多段。
  const finalEdges = [];
  const purpleNodes = [];
  for (const e of classified) {
    const fractions = e.isMerged ? [] : e.isLoop ? [1 / 3, 2 / 3] : e.isHeadTailShared ? [1 / 2] : [];
    const path = Array.isArray(e.path) ? e.path : [];
    const idxs = fractions.length ? turningIndicesAtFractions(path, fractions) : [];
    if (!idxs.length) {
      finalEdges.push(e);
      continue;
    }
    const bounds = [0, ...idxs, path.length - 1];
    for (let s = 0; s < bounds.length - 1; s++) {
      const sub = path.slice(bounds[s], bounds[s + 1] + 1);
      if (sub.length >= 2) finalEdges.push({ ...e, path: sub });
    }
    for (const i of idxs) purpleNodes.push({ latlng: path[i], routes: e.routes, isPurple: true });
  }

  return {
    nodes: [
      ...[...nodeRoutes.keys()].map((k) => ({
        latlng: vert.get(k),
        routes: [...nodeRoutes.get(k).values()],
        isCross: crossKeys.has(k),
      })),
      ...purpleNodes,
    ],
    edges: finalEdges,
    crossNodes,
  };
};

/**
 * 把「路線圖調整」之路線/黑點轉成 OSM 風格路網 GeoJSON（way／node），
 * 供示意圖佈局（schematic_layout）之輸入管線解析。格式與 leafletDrawToOsmRouteGeoJson 相同，
 * 但獨立使用本圖層之 computeRouteMapAdjustRouteStations／routeMapAdjustColorNameForIndex。
 * @param {Array<{color?:string, latlngs:Array<[number,number]>, routeName?:string, routeId?:string}>} lines
 * @param {Array<[number,number]>} blackDots
 * @param {Object<string,{id?:string|number, name?:string}>} [stationMeta] 座標→站點資料，鍵為 `${lat.toFixed(6)},${lng.toFixed(6)}`
 * @returns {{type:'FeatureCollection', features:object[]}}
 */
export const routeMapAdjustToOsmRouteGeoJson = (lines, blackDots, stationMeta = null) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const routeStations = computeRouteMapAdjustRouteStations(safeLines, blackDots);
  const nodeKey = (lon, lat) => `${lon.toFixed(7)},${lat.toFixed(7)}`;
  const rank = (t) => (t === 'intersection' ? 2 : t === 'terminal' ? 1 : 0);
  const routeName = (i) => safeLines[i]?.routeName || routeMapAdjustColorNameForIndex(i);
  const routeId = (i) => safeLines[i]?.routeId || String(i + 1);
  const metaKey = (lat, lon) => `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
  const metaFor = (lat, lon) => (stationMeta && stationMeta[metaKey(lat, lon)]) || null;

  const nodeByKey = new Map();
  routeStations.forEach((route) => {
    const rName = routeName(route.routeIndex);
    route.stations.forEach((st) => {
      const [lat, lon] = st.latlng;
      const k = nodeKey(lon, lat);
      const t =
        st.type === 'connect' ? 'intersection' : st.type === 'terminal' ? 'terminal' : 'normal';
      let e = nodeByKey.get(k);
      if (!e) {
        e = { lon, lat, type: t, routeNames: new Set(), meta: metaFor(lat, lon) };
        nodeByKey.set(k, e);
      } else if (rank(t) > rank(e.type)) {
        e.type = t;
      }
      e.routeNames.add(rName);
      if (st.type === 'connect' && Array.isArray(st.connectRoutes)) {
        st.connectRoutes.forEach((ri) => e.routeNames.add(routeName(ri)));
      }
    });
  });

  const features = [];
  safeLines.forEach((line, i) => {
    const cum = [0];
    for (let k = 0; k < line.latlngs.length - 1; k++) {
      cum.push(cum[k] + planarDist(line.latlngs[k], line.latlngs[k + 1]));
    }
    const pts = line.latlngs.map((p, k) => ({ pos: cum[k], coord: [p[1], p[0]] }));
    (routeStations[i]?.stations || [])
      .filter((s) => s.type !== 'terminal')
      .forEach((s) => {
        const pr = projectOnPolyline(line.latlngs, s.latlng);
        if (pr) pts.push({ pos: pr.pos, coord: [s.latlng[1], s.latlng[0]] });
      });
    pts.sort((a, b) => a.pos - b.pos);
    const coords = [];
    for (const pt of pts) {
      const last = coords[coords.length - 1];
      if (last && last[0] === pt.coord[0] && last[1] === pt.coord[1]) continue;
      coords.push(pt.coord);
    }
    if (coords.length < 2) return;
    features.push({
      type: 'Feature',
      properties: {
        type: 'way',
        id: i + 1,
        tags: {
          route_id: routeId(i),
          route_name: routeName(i),
          color: line.color || '#666666',
          railway: 'subway',
        },
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
  });

  let nid = 1;
  for (const e of nodeByKey.values()) {
    features.push({
      type: 'Feature',
      properties: {
        type: 'node',
        id: nid,
        tags: {
          station_id: e.meta && e.meta.id != null ? String(e.meta.id) : `s${nid}`,
          station_name: (e.meta && e.meta.name) || '',
          type: e.type,
          route_name_list: [...e.routeNames],
        },
      },
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
    });
    nid += 1;
  }

  return { type: 'FeatureCollection', features };
};

/**
 * 把「路線圖轉換骨架」的骨架（buildRouteMapAdjustSkeleton 的結果）轉成 OSM 風格路網 GeoJSON，
 * 供示意圖佈局輸入。每條骨架邊 → 一條 way（不掉任何邊），way 顏色＝**骨架邊分類色**：
 *   🔴 合併(共線) / 🔵 頭尾共點 / 🟢 環線 / 否則該路線原色。
 * 節點 → node Point（帶分類色 node_class_color：🟡 交叉生成 / 🟣 切斷點）。
 * @param {{nodes:Array, edges:Array, crossNodes:Array}} skeleton
 * @returns {{type:'FeatureCollection', features:object[]}}
 */
export const routeMapAdjustSkeletonToGeoJson = (skeleton, lines, blackDots, stationMeta) => {
  const edges = Array.isArray(skeleton?.edges) ? skeleton.edges : [];
  const nodes = Array.isArray(skeleton?.nodes) ? skeleton.nodes : [];
  // 與骨架渲染器一致的「底色＋原色」畫法：
  //   color    ＝ 路線原來的顏色（主線色，畫在上面）
  //   hl_color ＝ 🔴 合併(共線)／🔵 頭尾共點／🟢 環線 之底色高亮（墊在主線底下；無則空字串）
  // 骨架：所有路線一律黑色、不用 highlight 底色（共線/環線/頭尾共點不再上色）。
  const routeColorOf = () => '#000000';
  const hlColorOf = () => '';
  // 點色：只有 🔴 交叉/分歧（交叉點重算）／🔵 端點／🖤 其餘（路線中的點皆黑）。
  const llKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;
  const { terminals, connects, blacks } = computeRouteMapAdjustSkeletonStations(
    lines,
    blackDots,
    Object.keys(stationMeta || {}).map((k) => k.split(',').map(Number))
  );
  const terminalKeys = new Set((terminals || []).map((p) => llKey(p[0], p[1])));
  const connectKeys = new Set((connects || []).map((p) => llKey(p[0], p[1])));
  const nodeColor = (n) => {
    const k = llKey(n.latlng[0], n.latlng[1]);
    if (n.isCross) return '#ffd600'; // 🟡 交叉點（與原本黃點一致）
    if (n.isPurple) return '#9c27b0'; // 🟣 切斷點（與原本紫點一致）
    if (connectKeys.has(k)) return '#ff0000'; // 🔴 分歧(degree≥3)
    if (terminalKeys.has(k)) return '#1565c0'; // 🔵 端點
    return '#000000'; // 🖤 其餘 → 黑
  };
  const nodeRadius = (n) => (n.isCross ? 8 : n.isPurple ? 6 : 4);
  const features = [];
  edges.forEach((e, i) => {
    const path = Array.isArray(e.path) ? e.path : [];
    if (path.length < 2) return;
    const coords = path.map(([lat, lng]) => [lng, lat]);
    features.push({
      type: 'Feature',
      properties: {
        type: 'way',
        id: i + 1,
        tags: {
          route_id: String(i + 1),
          route_name: e.routes?.[0]?.routeName || `骨架邊 ${i + 1}`,
          color: routeColorOf(e), // 主線繪製色（骨架一律黑）
          route_color: e.routes?.[0]?.color || '', // 真正的路線顏色（hover 顯示用）
          hl_color: hlColorOf(e), // 共線/環線/頭尾共點底色（墊在底下；無則空）
          railway: 'subway',
        },
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
  });
  let nid = 1;
  // 🖤 黑點站（一般中間站）：骨架化後在示意圖佈局也要照原位置畫出（不可消失）。
  //    先加入，讓端點/交點/交叉節點之後疊在其上。
  (Array.isArray(blacks) ? blacks : []).forEach((p) => {
    if (!Array.isArray(p) || p.length < 2) return;
    const [lat, lng] = p;
    const meta = (stationMeta && stationMeta[llKey(lat, lng)]) || {};
    features.push({
      type: 'Feature',
      properties: {
        type: 'node',
        id: nid,
        tags: {
          station_id: meta.id != null ? String(meta.id) : `b${nid}`,
          station_name: meta.name || '',
          type: 'normal',
          node_kind: 'black',
          node_class_color: '#000000',
          node_class_r: 3,
        },
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
    nid += 1;
  });
  nodes.forEach((n) => {
    if (!n || !Array.isArray(n.latlng)) return;
    const [lat, lng] = n.latlng;
    features.push({
      type: 'Feature',
      properties: {
        type: 'node',
        id: nid,
        tags: {
          station_id: `n${nid}`,
          station_name: '',
          type: n.isCross ? 'intersection' : 'normal',
          node_kind: n.isPurple ? 'purple' : n.isCross ? 'cross' : '', // 🟣 切斷點 halo 用
          node_class_color: nodeColor(n),
          node_class_r: nodeRadius(n),
          route_name_list: (n.routes || []).map((r) => r.routeName).filter(Boolean),
        },
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
    nid += 1;
  });
  return { type: 'FeatureCollection', features };
};
