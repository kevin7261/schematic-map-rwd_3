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

/**
 * 🩷 中段黑點「轉折（粉紅）」判定相關工具。
 *   以「曲折度 + 折線簡化」找出過於曲折的骨架邊上的代表性轉折位置，把對應黑點標成粉紅：
 *     (1) Sinuosity 量每條骨架邊（端點/交點之間子路徑）的曲折度＝弧長/直線距離；
 *     (2) 曲折度超過門檻者，對其路徑跑 Douglas–Peucker 簡化，保留的中段轉折頂點
 *         吸附到最近黑點 → 該黑點變粉紅（其餘照常黑色）。
 *   另保留「兩路段夾角」計算，僅供 hover 顯示（不再用於粉紅判定）。
 */
/** 曲折度門檻：骨架邊 sinuosity > 此值才視為「太曲折」，才在其上挑轉折黑點變粉紅。預設 1.25（弧長比直線長 25%）。 */
export const RIGHT_ANGLE_PINK_SINUOSITY_MIN = 1.25;
/**
 * Douglas–Peucker 容差「比例」：頂點到頭尾直線的垂直距離 ÷ 頭尾直線長度 > 此比例，才算「代表性轉折」。
 *   為無單位比例（與路線大小無關）；越小→越多粉紅。預設 0.25（垂線約為頭尾直線長度的 25%）。
 */
export const RIGHT_ANGLE_PINK_DP_EPSILON_RATIO = 0.25;
/** 轉折之中段黑點的粉紅色碼（與 ROUTE_MAP_ADJUST_PALETTE 之「粉紅色」一致）。 */
export const RIGHT_ANGLE_PINK_HEX = '#e377c2';

/**
 * 由骨架邊建立「中段頂點 → 前後鄰點」查表，供計算每個黑點的路線轉折角。
 *   walkChain 收縮時保留所有 degree-2 過路頂點（含中段黑點站）為 path 中段頂點，
 *   故黑點即可在此以座標鍵查到其前後鄰點。
 * @param {Array<{path:Array<[number,number]>}>} edges 骨架邊
 * @returns {Map<string,{prev:[number,number],node:[number,number],next:[number,number]}>}
 */
export const buildSkeletonInteriorVertexLookup = (edges) => {
  const key = (p) => `${Number(p[0]).toFixed(6)},${Number(p[1]).toFixed(6)}`;
  const map = new Map();
  for (const e of Array.isArray(edges) ? edges : []) {
    const path = Array.isArray(e?.path) ? e.path : [];
    for (let i = 1; i < path.length - 1; i++) {
      const k = key(path[i]);
      if (!map.has(k)) map.set(k, { prev: path[i - 1], node: path[i], next: path[i + 1] });
    }
  }
  return map;
};

/**
 * 在中段頂點 node 量兩路段的「夾角／交角」（度）：180°=直行、90°=直角、<90°=銳角、0°=原路折返。
 *   即由 node 望向前後鄰點兩向量的夾角。以等距圓柱投影（經度乘 cos(lat)）在當地平面量，
 *   避免經緯度尺度差造成角度失真。
 */
const skeletonCornerAngleDeg = (prev, node, next) => {
  const kx = Math.cos((Number(node[0]) * Math.PI) / 180);
  const u1x = (prev[1] - node[1]) * kx;
  const u1y = prev[0] - node[0];
  const u2x = (next[1] - node[1]) * kx;
  const u2y = next[0] - node[0];
  const m1 = Math.hypot(u1x, u1y);
  const m2 = Math.hypot(u2x, u2y);
  if (m1 < 1e-12 || m2 < 1e-12) return 180;
  let cos = (u1x * u2x + u1y * u2y) / (m1 * m2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
};

/**
 * 取中段黑點兩路段的「夾角／交角」（度）；查不到鄰點（非中段頂點）回傳 null。
 * @param {Map} lookup buildSkeletonInteriorVertexLookup 之回傳
 * @param {[number,number]} blackDot 黑點座標 [lat,lng]
 * @returns {number|null}
 */
export const blackDotCornerAngleDeg = (lookup, blackDot) => {
  if (!lookup || !Array.isArray(blackDot) || blackDot.length < 2) return null;
  const k = `${Number(blackDot[0]).toFixed(6)},${Number(blackDot[1]).toFixed(6)}`;
  const hit = lookup.get(k);
  if (!hit) return null;
  return skeletonCornerAngleDeg(hit.prev, hit.node, hit.next);
};

/** 公尺/緯度度（近似）。 */
const M_PER_DEG = 111320;

/**
 * 把折線投影到平面（供量距離／簡化用）。
 *   planar=false：輸入為 [lat,lng]，經度乘 cos(latRef) 校正成當地公尺平面。
 *   planar=true：輸入已是平面格座標（x,y 同尺度），直接用、不做 cos 校正。
 */
const pathToMeters = (path, planar = false) => {
  if (!Array.isArray(path) || !path.length) return [];
  if (planar) return path.map((p) => [Number(p[0]), Number(p[1])]);
  const latRef = (Number(path[0][0]) * Math.PI) / 180;
  const kx = Math.cos(latRef) * M_PER_DEG;
  return path.map((p) => [Number(p[1]) * kx, Number(p[0]) * M_PER_DEG]);
};

/** 點 p 到線段 a-b 的垂直距離（與輸入同單位）。 */
const perpDistToSegment = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/**
 * Douglas–Peucker（容差為「比例」）：回傳 { keep, ratios }。
 *   keep[i]＝是否保留頂點 i（含頭尾）；ratios[i]＝保留該頂點時「垂線 ÷ 頭尾直線長度」之比例（其餘為 null）。
 *   每次以目前子段的頭尾兩點連線為基線，比較「最遠頂點到基線的垂線 ÷ 基線長度」是否 > ratio；
 *   超過才保留該頂點並遞迴左右兩半。故容差與路線大小無關，只看相對彎曲程度。
 *   頭尾近重合（環）時先強制保留離起點最遠的頂點，避免基線退化。
 */
const douglasPeuckerKeep = (xy, ratio) => {
  const n = xy.length;
  const keep = new Array(n).fill(false);
  const ratios = new Array(n).fill(null);
  const anchorSeg = new Array(n).fill(null); // 保留頂點 i 時所對應 DP 子段 [a,b] 索引
  if (n === 0) return { keep, ratios, anchorSeg };
  keep[0] = true;
  keep[n - 1] = true;
  if (n < 3) return { keep, ratios, anchorSeg };
  let stack = [[0, n - 1]];
  if (Math.hypot(xy[0][0] - xy[n - 1][0], xy[0][1] - xy[n - 1][1]) < 1) {
    let far = 1;
    let farD = -1;
    for (let i = 1; i < n - 1; i++) {
      const d = Math.hypot(xy[i][0] - xy[0][0], xy[i][1] - xy[0][1]);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    keep[far] = true;
    stack = [
      [0, far],
      [far, n - 1],
    ];
  }
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDistToSegment(xy[i], xy[a], xy[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    const baseLen = Math.hypot(xy[b][0] - xy[a][0], xy[b][1] - xy[a][1]); // 頭尾直線長度
    if (idx > a && baseLen > 0 && maxD / baseLen > ratio) {
      keep[idx] = true;
      ratios[idx] = maxD / baseLen; // 此頂點的轉折比例
      anchorSeg[idx] = [a, b];
      stack.push([a, idx], [idx, b]);
    }
  }
  return { keep, ratios, anchorSeg };
};

/**
 * 骨架邊「曲折度」= 弧長 / 兩端直線距離（公尺）。1＝直線；越大越曲折；頭尾近重合（環）回傳 Infinity。
 * @param {Array<[number,number]>} path 折線 [lat,lng]
 * @returns {number}
 */
export const edgeSinuosity = (path, planar = false) => {
  const xy = pathToMeters(path, planar);
  if (xy.length < 2) return 1;
  let arc = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    arc += Math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]);
  }
  const chord = Math.hypot(xy[xy.length - 1][0] - xy[0][0], xy[xy.length - 1][1] - xy[0][1]);
  if (chord < 1) return arc < 1 ? 1 : Infinity;
  return arc / chord;
};

/**
 * 骨架（路線圖轉換骨架2 等）：粉紅點 dp_ratio 幾何（Sinuosity + Douglas–Peucker，與 computeRightAnglePinkBlackDots 同源）。
 * @returns {Map<string, {ratio:number, anchorA:[number,number], anchorB:[number,number], pointP:[number,number], footH:[number,number], chordLen:number, perpLen:number}>}
 *   鍵＝`lat.toFixed(6),lng.toFixed(6)`；座標皆為 [lat,lng]。
 */
export const buildSkeletonPinkDpDetailMap = (edges, blackDots, opts = {}) => {
  const sinuosityMin = opts.sinuosityMin ?? RIGHT_ANGLE_PINK_SINUOSITY_MIN;
  const epsilonRatio = opts.epsilonRatio ?? RIGHT_ANGLE_PINK_DP_EPSILON_RATIO;
  const planar = !!opts.planar;
  const key = (p) => `${Number(p[0]).toFixed(6)},${Number(p[1]).toFixed(6)}`;
  const blackKeys = new Set(
    (Array.isArray(blackDots) ? blackDots : [])
      .filter((b) => Array.isArray(b) && b.length >= 2)
      .map((b) => key(b))
  );
  const pending = new Map();
  if (!blackKeys.size) return pending;
  for (const e of Array.isArray(edges) ? edges : []) {
    const path = Array.isArray(e?.path) ? e.path : [];
    if (path.length < 3) continue;
    if (edgeSinuosity(path, planar) <= sinuosityMin) continue;
    const xy = pathToMeters(path, planar);
    const { keep, anchorSeg } = douglasPeuckerKeep(xy, epsilonRatio);
    for (let i = 1; i < path.length - 1; i++) {
      if (!keep[i]) continue;
      const k = key(path[i]);
      if (!blackKeys.has(k)) continue;
      const seg = anchorSeg[i];
      if (!seg) continue;
      const [iA, iB] = seg;
      const detail = measurePinkDpDetail(xy[iA], xy[iB], xy[i]);
      detail.anchorA = [path[iA][0], path[iA][1]];
      detail.anchorB = [path[iB][0], path[iB][1]];
      detail.pointP = [path[i][0], path[i][1]];
      const cur = pending.get(k);
      // 同一黑點若出現在多條（共線）邊，取較大的轉折比例（與 computeRightAnglePinkBlackDots 一致）。
      if (!cur || detail.ratio > cur.ratio) pending.set(k, detail);
    }
  }
  return pending;
};

/**
 * 以「Sinuosity 量曲折度 + Douglas–Peucker 找轉折」挑出應變粉紅的黑點。
 *   逐骨架邊（端點/交點之間子路徑）：sinuosity > 門檻者視為太曲折，對其路徑跑 DP；
 *   DP 保留的中段轉折頂點本身即為黑點站位置，直接標粉紅。
 *   （傳入 blackDots 僅作保險：只標確實在黑點集合內的頂點，避免非站點幾何頂點被誤標。）
 * @param {Array<{path:Array<[number,number]>}>} edges 骨架邊
 * @param {Array<[number,number]>} blackDots 黑點 [lat,lng]
 * @param {{sinuosityMin?:number, epsilonRatio?:number}} [opts]
 * @returns {Map<string,number|null>} 應變粉紅之黑點 → 其轉折比例（垂線/頭尾直線；鍵＝`lat.toFixed(6),lng.toFixed(6)`）
 */
export const computeRightAnglePinkBlackDots = (edges, blackDots, opts = {}) => {
  const detail = buildSkeletonPinkDpDetailMap(edges, blackDots, opts);
  const pink = new Map();
  for (const [k, d] of detail) pink.set(k, d.ratio);
  return pink;
};

/** 🟥🟨🟦 邊界節點判定：紅(connect)/黃(cross)/藍(terminal)。以「分類色」為準最可靠。 */
const RYB_NODE_COLORS = new Set(['#ff0000', '#ffd600', '#1565c0']);
const nodeIsRYBClass = (nd) => {
  if (!nd) return false;
  const t = nd.tags || {};
  const cc = String(t.node_class_color ?? nd.node_class_color ?? '').toLowerCase();
  // ⚠️ 顏色優先：粉紅/灰/棕/黑/紫**不是**紅/黃/藍邊界。這些點（粉紅/灰/棕）雖為「保留節點」而帶 node_type='connect'，
  //   若僅看 node_type 會被誤判為紅邊界 → 粉紅變路徑端點而非中段頂點 → 重算時全部被降級。
  if (cc) {
    if (RYB_NODE_COLORS.has(cc)) return true; // 🔴🟡🔵
    if (
      cc === '#000000' || cc === '#000' || cc === '#9c27b0' || // 黑 / 紫
      cc === RIGHT_ANGLE_PINK_HEX.toLowerCase() ||
      cc === GRAY_DOT_HEX.toLowerCase() ||
      cc === DEMOTED_PINK_BROWN_HEX.toLowerCase()
    ) {
      return false;
    }
  }
  const kind = nd.node_kind ?? t.node_kind;
  if (kind === 'right_angle_pink' || kind === 'gray' || kind === 'brown' || kind === 'black' || kind === 'purple') {
    return false;
  }
  if (kind === 'cross') return true; // 黃
  const nt = nd.node_type ?? t.node_type;
  return nt === 'connect' || nt === 'terminal'; // 紅/藍
};
/** 🩷 粉紅點判定。 */
const nodeIsPinkClass = (nd) => {
  if (!nd) return false;
  const t = nd.tags || {};
  if ((nd.node_kind ?? t.node_kind) === 'right_angle_pink') return true;
  const cc = String(t.node_class_color ?? nd.node_class_color ?? '').toLowerCase();
  return cc === RIGHT_ANGLE_PINK_HEX.toLowerCase();
};
/** 🖤 黑點判定。 */
const nodeIsBlackClass = (nd) => {
  if (!nd) return false;
  const t = nd.tags || {};
  if ((nd.node_kind ?? t.node_kind) === 'black') return true;
  const cc = String(t.node_class_color ?? nd.node_class_color ?? '').toLowerCase();
  return cc === '#000000' || cc === '#000';
};
/** 🤎 棕點判定。 */
const nodeIsBrownClass = (nd) => {
  if (!nd) return false;
  const t = nd.tags || {};
  if ((nd.node_kind ?? t.node_kind) === 'brown') return true;
  const cc = String(t.node_class_color ?? nd.node_class_color ?? '').toLowerCase();
  return cc === DEMOTED_PINK_BROWN_HEX.toLowerCase();
};
/** 🟪 紫點判定。 */
const nodeIsPurpleClass = (nd) => {
  if (!nd) return false;
  const t = nd.tags || {};
  if ((nd.node_kind ?? t.node_kind) === 'purple') return true;
  const cc = String(t.node_class_color ?? nd.node_class_color ?? '').toLowerCase();
  return cc === '#9c27b0';
};
/** 🟥🟦🟨🟪 紅/藍/黃/紫邊界（dp_ratio 顯示用：以最近的這四種點為頭尾）。 */
const nodeIsRYBPClass = (nd) => nodeIsRYBClass(nd) || nodeIsPurpleClass(nd);
/** 設定節點為某分類色（同時寫頂層與 tags）。 */
const setNodeClass = (nd, kind, hex) => {
  nd.node_kind = kind;
  nd.node_class_color = hex;
  if (!nd.tags) nd.tags = {};
  nd.tags.node_kind = kind;
  nd.tags.node_class_color = hex;
};
/** 紅/黃/藍/粉紅（拉直時保留為轉折頂點之錨點）。 */
const nodeIsRYBorPinkClass = (nd) => nodeIsRYBClass(nd) || nodeIsPinkClass(nd);

/** 拉直專用：黑點沿 A–B 弦線性均分 ((j+1)/(n+1))，保持共線。 */
const distributeBlacksOnChord = (ax, ay, bx, by, n) => {
  if (n <= 0) return [];
  const dx = bx - ax;
  const dy = by - ay;
  const out = [];
  for (let j = 0; j < n; j++) {
    const t = (j + 1) / (n + 1);
    out.push([ax + dx * t, ay + dy * t]);
  }
  return out;
};

const cloneSegShell = (seg) => {
  if (!seg || typeof seg !== 'object') return {};
  const o = JSON.parse(JSON.stringify(seg));
  delete o.points;
  delete o.nodes;
  return o;
};

const syncNodeGridCoords = (nd, x, y) => {
  if (!nd || typeof nd !== 'object') return;
  nd.x_grid = x;
  nd.y_grid = y;
  if (!nd.tags) nd.tags = {};
  nd.tags.x_grid = x;
  nd.tags.y_grid = y;
};

const readFlatPt = (p) =>
  Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x ?? 0), Number(p?.y ?? 0)];

/** ① 合併：舊鏈 keys → 一條 polyline（原座標，去連續重複格）。 */
const mergeLegPointsFromKeys = (ks, coordOf, cloneNodeAtKey) => {
  const points = [];
  const nodes = [];
  for (const k of ks) {
    const [x, y] = coordOf.get(k);
    if (points.length) {
      const [px, py] = points[points.length - 1];
      if (Math.abs(px - x) < 1e-9 && Math.abs(py - y) < 1e-9) continue;
    }
    points.push([x, y]);
    nodes.push(cloneNodeAtKey(k));
  }
  return { points, nodes };
};

/**
 * ② 拉直（錨點 A,B 座標鎖死）+ ③ 黑點 ((j+1)/(n+1) 均分)。
 * 折角格不保留、不映射；黑點不決定轉折，只落在 A–B 直線上。
 * @returns {{ points, nodes, interiorPoints, interiorNodes }}
 */
const straightenAndRedistributeLeg = (ks, anchorA, anchorB, cloneNodeAtKey, stationKeys) => {
  const [ax, ay] = anchorA;
  const [bx, by] = anchorB;
  const n = stationKeys.length;
  const slotXY = distributeBlacksOnChord(ax, ay, bx, by, n);
  const interiorPoints = [];
  const interiorNodes = [];
  for (let j = 0; j < n; j++) {
    const nd = cloneNodeAtKey(stationKeys[j]);
    setNodeClass(nd, 'black', '#000000');
    nd.node_type = nd.node_type || 'line';
    if (!nd.tags) nd.tags = {};
    nd.tags._forceDrawBlackDot = true;
    const [x, y] = slotXY[j];
    interiorPoints.push([x, y]);
    syncNodeGridCoords(nd, x, y);
    interiorNodes.push(nd);
  }
  const points = [[ax, ay], ...interiorPoints, [bx, by]];
  const nodes = [cloneNodeAtKey(ks[0]), ...interiorNodes, cloneNodeAtKey(ks[ks.length - 1])];
  syncNodeGridCoords(nodes[0], ax, ay);
  syncNodeGridCoords(nodes[nodes.length - 1], bx, by);
  return { points, nodes, interiorPoints, interiorNodes };
};

/**
 * 棕點路段：① 合併 segment → ② 拉直 → ③ 黑點重分配。
 * 錨點座標絕不改；支線 segment 不碰；折角格只刪不位移。
 * @returns {number} 拉直的路段數
 */
const collapseBrownAnchorChainsInFlat = (flat, brownLegKeys, isAnchorFn) => {
  if (!brownLegKeys?.size) return 0;
  const pendingBrowns = new Set(brownLegKeys);
  const vkey = (a, b) => `${a.toFixed(6)},${b.toFixed(6)}`;

  const buildGraph = () => {
    const occ = new Map();
    const coordOf = new Map();
    const anchor = new Map();
    const adj = new Map();
    const addAdj = (x, y) => { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); };
    flat.forEach((seg, si) => {
      const pts = seg?.points;
      if (!Array.isArray(pts) || pts.length < 2) return;
      const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
      let prev = null;
      for (let pi = 0; pi < pts.length; pi++) {
        const [a, b] = readFlatPt(pts[pi]);
        const k = vkey(a, b);
        if (!occ.has(k)) { occ.set(k, []); coordOf.set(k, [a, b]); anchor.set(k, false); }
        occ.get(k).push({ si, pi });
        if (isAnchorFn(nodes[pi])) anchor.set(k, true);
        if (prev != null && prev !== k) { addAdj(prev, k); addAdj(k, prev); }
        prev = k;
      }
    });
    return { occ, coordOf, anchor, adj };
  };

  /** 沿 degree-2 鏈走到錨點；岔路（degree≠2）即停，不跨支線。 */
  const extendOneWay = (from, prev, isAnc, adj) => {
    const path = [];
    let cur = from;
    let back = prev;
    while (cur != null) {
      path.push(cur);
      if (isAnc(cur)) return path;
      const nbs = [...(adj.get(cur) || [])].filter((n) => n !== back);
      if (nbs.length !== 1) return null;
      back = cur;
      cur = nbs[0];
    }
    return null;
  };

  const legThroughBrown = (bk, isAnc, adj) => {
    const paths = [];
    for (const nb of adj.get(bk) || []) {
      const p = extendOneWay(nb, bk, isAnc, adj);
      if (p?.length && isAnc(p[p.length - 1])) paths.push(p);
    }
    if (paths.length < 2) return null;
    const endA = paths[0][paths[0].length - 1];
    const p2 = paths.find((p) => p[p.length - 1] !== endA);
    if (!p2) return null;
    return [...paths[0].slice().reverse(), bk, ...p2];
  };

  const findOneLeg = (graph) => {
    const { coordOf, anchor, adj } = graph;
    const isAnc = (k) => !!anchor.get(k);
    for (const bk of pendingBrowns) {
      const ks = legThroughBrown(bk, isAnc, adj);
      if (!ks || ks.length < 2) continue;
      if (!isAnc(ks[0]) || !isAnc(ks[ks.length - 1])) continue;
      return { ks, coordOf, occ: graph.occ, anchor };
    }
    return null;
  };

  const cloneNodeAtKey = (key, occ) => {
    const entries = occ.get(key) || [];
    let pick = null;
    for (const { si, pi } of entries) {
      const nd = flat[si]?.nodes?.[pi];
      if (!nd) continue;
      const kind = nd.node_kind ?? nd.tags?.node_kind;
      if (kind === 'black' || kind === 'brown' || brownLegKeys.has(key)) { pick = nd; break; }
      if (!pick) pick = nd;
    }
    return pick
      ? JSON.parse(JSON.stringify(pick))
      : { node_type: 'line', node_kind: 'black', tags: { node_kind: 'black', _forceDrawBlackDot: true } };
  };

  const isStationKey = (k, occ) => {
    if (brownLegKeys.has(k)) return true;
    for (const { si, pi } of occ.get(k) || []) {
      if (nodeIsBlackClass(flat[si]?.nodes?.[pi])) return true;
    }
    return false;
  };

  let straightened = 0;
  while (pendingBrowns.size > 0) {
    const graph = buildGraph();
    const leg = findOneLeg(graph);
    if (!leg) break;

    const { ks, coordOf, occ } = leg;
    const kStart = ks[0];
    const kEnd = ks[ks.length - 1];
    const anchorA = coordOf.get(kStart).slice();
    const anchorB = coordOf.get(kEnd).slice();
    const stationKeys = ks.slice(1, -1).filter((k) => isStationKey(k, occ));

    mergeLegPointsFromKeys(ks, coordOf, (k) => cloneNodeAtKey(k, occ));

    const final = straightenAndRedistributeLeg(
      ks, anchorA, anchorB, (k) => cloneNodeAtKey(k, occ), stationKeys
    );
    if (final.points.length < 2) break;

    const segsToDrop = new Set();
    const newSegs = [];
    const partialDone = new Set();

    const chainIndexOf = (k) => ks.indexOf(k);
    const isConsecutiveLegSubpath = (keys) => {
      if (keys.length < 2) return false;
      const idx = keys.map(chainIndexOf);
      if (idx.some((i) => i < 0)) return false;
      const sorted = [...idx].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) return false;
      }
      return true;
    };

    const fullSegs = [];
    const partialSegs = [];
    for (let si = 0; si < flat.length; si++) {
      const seg = flat[si];
      const pts = seg?.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      const keys = pts.map((p) => vkey(...readFlatPt(p)));
      if (isConsecutiveLegSubpath(keys)) { fullSegs.push(si); continue; }
      const iA = keys.indexOf(kStart);
      const iB = keys.indexOf(kEnd);
      if (iA >= 0 && iB >= 0 && iA !== iB) partialSegs.push({ si, iA, iB });
    }

    // 部分路段：錨點 index 不動，只換中間；依 segment 方向決定黑點順序。
    for (const { si, iA, iB } of partialSegs) {
      if (fullSegs.includes(si) || partialDone.has(si)) continue;
      const seg = flat[si];
      const i0 = Math.min(iA, iB);
      const i1 = Math.max(iA, iB);
      const alongKs = iA < iB;
      const interiorPts = alongKs ? final.interiorPoints : [...final.interiorPoints].reverse();
      const interiorNds = alongKs ? final.interiorNodes : [...final.interiorNodes].reverse();
      seg.points = [...seg.points.slice(0, i0 + 1), ...interiorPts, ...seg.points.slice(i1)];
      seg.nodes = [...seg.nodes.slice(0, i0 + 1), ...interiorNds, ...seg.nodes.slice(i1)];
      partialDone.add(si);
    }

    if (fullSegs.length) {
      for (const si of fullSegs) segsToDrop.add(si);
      const shell = cloneSegShell(flat[fullSegs[0]]);
      const lastSeg = flat[fullSegs[fullSegs.length - 1]];
      if (lastSeg?.properties_end) shell.properties_end = JSON.parse(JSON.stringify(lastSeg.properties_end));
      newSegs.push({ ...shell, points: final.points, nodes: final.nodes });
    }

    if (segsToDrop.size) {
      const kept = flat.filter((_, si) => !segsToDrop.has(si));
      flat.length = 0;
      flat.push(...kept, ...newSegs);
    }

    for (const k of ks) pendingBrowns.delete(k);
    straightened++;
  }

  return straightened;
};

/**
 * 由 flat segments（points + nodes）建「以紅/黃/藍為邊界」之折線；紫/粉紅/灰/黑視為內部直通頂點。
 *   planar=false：輸出 [lat,lng]（flat 點為 [lon,lat]）；planar=true：輸出原始平面 [x,y]。
 * @returns {Array<{path:Array<[number,number]>}>}
 */
const buildRYBBoundedPaths = (flat, planar) => {
  const repr = (a, b) => (planar ? [a, b] : [b, a]);
  const vkey = (a, b) => `${a.toFixed(6)},${b.toFixed(6)}`;
  const vert = new Map(); // vkey -> {a,b,ryb}
  const adj = new Map();
  const addAdj = (x, y) => { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); };
  for (const seg of Array.isArray(flat) ? flat : []) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const [a, b] = readFlatPt(pts[i]);
      const k = vkey(a, b);
      if (!vert.has(k)) vert.set(k, { a, b, ryb: false });
      if (nodeIsRYBClass(nodes[i])) vert.get(k).ryb = true;
      if (prev != null && prev !== k) { addAdj(prev, k); addAdj(k, prev); }
      prev = k;
    }
  }
  const isRYB = (k) => !!vert.get(k)?.ryb;
  const ek = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const seen = new Set();
  const paths = [];
  const walk = (start, first) => {
    const ks = [start, first];
    seen.add(ek(start, first));
    let prev = start;
    let cur = first;
    let guard = 0;
    while (!isRYB(cur) && cur !== start && guard++ < 100000) {
      const next = [...(adj.get(cur) || [])].find((n) => n !== prev);
      if (next === undefined) break;
      seen.add(ek(cur, next));
      ks.push(next);
      prev = cur;
      cur = next;
    }
    return ks.map((k) => { const v = vert.get(k); return repr(v.a, v.b); });
  };
  for (const [k] of vert) {
    if (!isRYB(k)) continue;
    for (const nb of adj.get(k) || []) if (!seen.has(ek(k, nb))) paths.push({ path: walk(k, nb) });
  }
  for (const [k] of vert) { // 殘餘純環（無 RYB 邊界）
    for (const nb of adj.get(k) || []) if (!seen.has(ek(k, nb))) paths.push({ path: walk(k, nb) });
  }
  return paths;
};

/** 點 p 到線段 a-b 的垂足（t 已 clamp 到 [0,1]）。 */
const footOnSegment = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [a[0], a[1]];
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
};

const measurePinkDpDetail = (A, B, P) => {
  const chordLen = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const footH = footOnSegment(P, A, B);
  const perpLen = Math.hypot(P[0] - footH[0], P[1] - footH[1]);
  const ratio = chordLen <= 0 ? 0 : Number((perpLen / chordLen).toFixed(4));
  return { ratio, anchorA: A, anchorB: B, pointP: P, footH, chordLen, perpLen };
};

const nodeAtSegmentIndex = (seg, pi) => {
  const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
  if (nodes[pi]) return nodes[pi];
  const p = seg?.points?.[pi];
  if (Array.isArray(p) && p.length > 2 && p[2] && typeof p[2] === 'object') return p[2];
  return null;
};

/** flat 上某索引的格座標（points 優先，否則 nodes.x_grid/y_grid）。 */
const coordFromSegIndex = (seg, pi) => {
  const pts = seg?.points;
  if (Array.isArray(pts) && pts[pi] != null) return readFlatPt(pts[pi]);
  const nd = nodeAtSegmentIndex(seg, pi);
  if (!nd) return null;
  const x = nd.x_grid ?? nd.tags?.x_grid;
  const y = nd.y_grid ?? nd.tags?.y_grid;
  if (x == null || y == null) return null;
  return [Number(x), Number(y)];
};

/** dp_ratio 量測用錨點：RYBP + 畫面上紅/藍 connect（含 node_class_color #ff0000 的 line 站）。 */
const nodeIsDpRatioAnchor = (nd) => {
  if (!nd) return false;
  if (nodeIsPinkClass(nd) || nodeIsBrownClass(nd)) return false;
  const kind = nd.node_kind ?? nd.tags?.node_kind;
  if (kind === 'gray') return false;
  if (nodeIsRYBPClass(nd)) return true;
  const cc = String(nd.node_class_color ?? nd.tags?.node_class_color ?? '').toLowerCase();
  if (cc === '#ff0000' || cc === '#1565c0' || cc === '#ffd600' || cc === '#9c27b0') return true;
  const nt = nd.node_type ?? nd.tags?.node_type;
  return nt === 'connect' || nt === 'terminal';
};

/** 整數格：正交示意圖座標比對用。 */
const gridCell = (v) => Math.round(Number(v));

/**
 * 由「畫面上可見錨點」量 dp_ratio（同列／同行最近 RYB+P；与 hover 画线同源）。
 * @param {[number,number]} pointP 粉点 [x,y]
 * @param {Array<[number,number]>} anchorCoords 屏幕上的锚点格坐标
 */
export const measurePinkDpFromScreenAnchors = (pointP, anchorCoords) => {
  if (!pointP || !Array.isArray(anchorCoords) || !anchorCoords.length) return null;
  const P = [Number(pointP[0]), Number(pointP[1])];
  if (!Number.isFinite(P[0]) || !Number.isFinite(P[1])) return null;
  const px = gridCell(P[0]);
  const py = gridCell(P[1]);
  const uniq = new Map();
  for (const a of anchorCoords) {
    if (!Array.isArray(a) || a.length < 2) continue;
    const x = Number(a[0]);
    const y = Number(a[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    uniq.set(`${gridCell(x)},${gridCell(y)}`, [x, y]);
  }
  const anchors = [...uniq.values()];
  let best = null;
  const pickMin = (det) => {
    if (!det) return;
    if (!best || det.ratio < best.ratio) best = det;
  };
  const onRow = anchors.filter((a) => gridCell(a[1]) === py);
  if (onRow.length >= 2) {
    const left = onRow.filter((a) => gridCell(a[0]) < px).sort((a, b) => gridCell(b[0]) - gridCell(a[0]))[0];
    const right = onRow.filter((a) => gridCell(a[0]) > px).sort((a, b) => gridCell(a[0]) - gridCell(b[0]))[0];
    if (left && right) pickMin(measurePinkDpDetail(left, right, P));
  }
  const onCol = anchors.filter((a) => gridCell(a[0]) === px);
  if (onCol.length >= 2) {
    const below = onCol.filter((a) => gridCell(a[1]) < py).sort((a, b) => gridCell(b[1]) - gridCell(a[1]))[0];
    const above = onCol.filter((a) => gridCell(a[1]) > py).sort((a, b) => gridCell(a[1]) - gridCell(b[1]))[0];
    if (below && above) pickMin(measurePinkDpDetail(below, above, P));
  }
  return best;
};

/** stationFeatures 上是否為 dp_ratio 锚点（与画圆 fill 逻辑一致）。 */
export const isScreenDpAnchorFeature = (feature) => {
  const p = feature?.properties;
  if (!p) return false;
  const tags = p.tags || {};
  const cc = String(p.node_class_color ?? tags.node_class_color ?? '').toLowerCase();
  if (cc === RIGHT_ANGLE_PINK_HEX.toLowerCase() || tags.node_kind === 'right_angle_pink') return false;
  if (cc === GRAY_DOT_HEX.toLowerCase() || tags.node_kind === 'gray') return false;
  if (cc === DEMOTED_PINK_BROWN_HEX.toLowerCase() || tags.node_kind === 'brown') return false;
  if (cc === '#ff0000' || cc === '#1565c0' || cc === '#ffd600' || cc === '#9c27b0') return true;
  const nt = feature.nodeType ?? p.node_type ?? tags.node_type;
  return nt === 'connect' || nt === 'terminal';
};

/**
 * 計算粉紅／棕點 dp_ratio 幾何（不修改 flat）。
 * @returns {Map<string, {ratio:number, anchorA:[number,number], anchorB:[number,number], pointP:[number,number], footH:[number,number], chordLen:number, perpLen:number}>}
 */
export const buildPinkDpRatioDetailMap = (flat) => {
  const pending = new Map();
  if (!Array.isArray(flat) || !flat.length) return pending;
  const vkey = (a, b) => `${a.toFixed(6)},${b.toFixed(6)}`;
  const stage = (k, detail) => {
    if (!detail || detail.ratio == null || !Number.isFinite(detail.ratio)) return;
    const cur = pending.get(k);
    if (!cur || detail.ratio < cur.ratio) pending.set(k, detail);
  };

  const occ = new Map();
  const pinkKeys = new Set();
  const rybpCoordMap = new Map();
  const coordOf = new Map();
  const anchorKeys = new Set();
  const adj = new Map();
  const addAdj = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  const addRybp = (P) => {
    if (!P) return;
    const k = vkey(P[0], P[1]);
    rybpCoordMap.set(k, [P[0], P[1]]);
    anchorKeys.add(k);
    coordOf.set(k, [P[0], P[1]]);
  };
  for (let si = 0; si < flat.length; si++) {
    const seg = flat[si];
    const pts = seg?.points;
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    const nLen = Math.max(Array.isArray(pts) ? pts.length : 0, nodes.length);
    let prev = null;
    for (let pi = 0; pi < nLen; pi++) {
      const P = coordFromSegIndex(seg, pi);
      if (!P) continue;
      const k = vkey(P[0], P[1]);
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push({ si, pi });
      coordOf.set(k, P);
      const nd = nodeAtSegmentIndex(seg, pi);
      const cc = String(nd?.node_class_color ?? nd?.tags?.node_class_color ?? '').toLowerCase();
      if (nodeIsPinkClass(nd) || nodeIsBrownClass(nd) || cc === RIGHT_ANGLE_PINK_HEX.toLowerCase()) {
        pinkKeys.add(k);
      }
      if (nodeIsDpRatioAnchor(nd)) addRybp(P);
      if (prev != null && prev !== k) {
        addAdj(prev, k);
        addAdj(k, prev);
      }
      prev = k;
    }
  }

  const measureAxisAlignedAtPink = (P) => {
    const px = gridCell(P[0]);
    const py = gridCell(P[1]);
    const anchors = [...rybpCoordMap.values()];
    const out = [];
    const onRow = anchors.filter((a) => gridCell(a[1]) === py);
    if (onRow.length >= 2) {
      const left = onRow.filter((a) => gridCell(a[0]) < px).sort((a, b) => gridCell(b[0]) - gridCell(a[0]))[0];
      const right = onRow.filter((a) => gridCell(a[0]) > px).sort((a, b) => gridCell(a[0]) - gridCell(b[0]))[0];
      if (left && right) out.push(measurePinkDpDetail(left, right, P));
    }
    const onCol = anchors.filter((a) => gridCell(a[0]) === px);
    if (onCol.length >= 2) {
      const below = onCol.filter((a) => gridCell(a[1]) < py).sort((a, b) => gridCell(b[1]) - gridCell(a[1]))[0];
      const above = onCol.filter((a) => gridCell(a[1]) > py).sort((a, b) => gridCell(a[1]) - gridCell(b[1]))[0];
      if (below && above) out.push(measurePinkDpDetail(below, above, P));
    }
    return out;
  };
  for (const pk of pinkKeys) {
    const P = coordOf.get(pk);
    if (!P) continue;
    for (const det of measureAxisAlignedAtPink(P)) stage(pk, det);
  }

  /** 沿單一路段折線，取 P 左右最近 RYBP 錨點量 dp_ratio。 */
  const measureOnSegmentAt = (si, pi) => {
    const seg = flat[si];
    const pts = seg?.points;
    if (!Array.isArray(pts) || pi < 0 || pi >= pts.length) return null;
    let iL = pi - 1;
    while (iL >= 0 && !nodeIsDpRatioAnchor(nodeAtSegmentIndex(seg, iL))) iL--;
    let iR = pi + 1;
    while (iR < pts.length && !nodeIsDpRatioAnchor(nodeAtSegmentIndex(seg, iR))) iR++;
    if (iL < 0 || iR >= pts.length) return null;
    const a = coordFromSegIndex(seg, iL);
    const b = coordFromSegIndex(seg, iR);
    const P = readFlatPt(pts[pi]);
    if (!a || !b) return null;
    return measurePinkDpDetail(a, b, P);
  };

  // 同格常跨多路段：對粉點座標的「每一個」折線 occurrence 量測，取 min（最局部）。
  for (const pk of pinkKeys) {
    if (pending.has(pk)) continue;
    for (const { si, pi } of occ.get(pk) || []) {
      const det = measureOnSegmentAt(si, pi);
      if (det) stage(pk, det);
    }
  }

  const walkToAnchor = (start, first) => {
    let prev = start;
    let cur = first;
    let guard = 0;
    while (!anchorKeys.has(cur) && guard++ < 100000) {
      const nbs = [...(adj.get(cur) || [])].filter((n) => n !== prev);
      if (!nbs.length) return null;
      prev = cur;
      cur = nbs[0];
    }
    return anchorKeys.has(cur) ? cur : null;
  };
  for (const pk of pinkKeys) {
    if (pending.has(pk)) continue;
    const P = coordOf.get(pk);
    if (!P) continue;
    let best = null;
    for (const nb of adj.get(pk) || []) {
      const aKey = walkToAnchor(pk, nb);
      if (!aKey) continue;
      for (const nb2 of adj.get(pk) || []) {
        if (nb2 === nb) continue;
        const bKey = walkToAnchor(pk, nb2);
        if (!bKey || bKey === aKey) continue;
        const det = measurePinkDpDetail(coordOf.get(aKey), coordOf.get(bKey), P);
        if (!best || det.ratio < best.ratio) best = det;
      }
    }
    if (best) stage(pk, best);
  }

  return pending;
};

/**
 * 計算粉紅／棕點 dp_ratio（不修改 flat）。
 * @returns {Map<string, number>} vkey → ratio
 */
export const buildPinkDpRatioMap = (flat) => {
  const detail = buildPinkDpRatioDetailMap(flat);
  const pending = new Map();
  for (const [k, d] of detail) pending.set(k, d.ratio);
  return pending;
};

/**
 * 為每個粉紅／棕點寫上 dp_ratio（供 hover 顯示確認）：
 *   沿**同一路段折線**向前／向後找紧邻 RYBP 锚点 A、B，以 A–B 连线为基线；
 *   dp_ratio = 点到该线段的垂距 ÷ |AB|（与 douglasPeuckerKeep / RIGHT_ANGLE_PINK_DP_EPSILON_RATIO 同概念）。
 *   同格多路段取 min（最局部之垂距比）。
 * @param {Array<{points:Array, nodes:Array}>} flat 路網 flat segments（就地寫 nodes.dp_ratio / tags.dp_ratio）
 */
export const refreshPinkDpRatioInFlat = (flat) => {
  if (!Array.isArray(flat) || !flat.length) return;

  for (const seg of flat) {
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    for (const nd of nodes) {
      if (!nodeIsPinkClass(nd) && !nodeIsBrownClass(nd)) continue;
      delete nd.dp_ratio;
      if (nd.tags) delete nd.tags.dp_ratio;
    }
  }

  const pending = buildPinkDpRatioMap(flat);
  if (!pending.size) return;

  const occ = new Map();
  const vkey = (a, b) => `${a.toFixed(6)},${b.toFixed(6)}`;
  flat.forEach((seg, si) => {
    const pts = seg?.points;
    if (!Array.isArray(pts)) return;
    for (let pi = 0; pi < pts.length; pi++) {
      const [a, b] = readFlatPt(pts[pi]);
      const k = vkey(a, b);
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push({ si, pi });
    }
  });

  for (const [k, val] of pending) {
    for (const { si, pi } of occ.get(k) || []) {
      const nd = flat[si]?.nodes?.[pi];
      if (!nd) continue;
      if (!nodeIsPinkClass(nd) && !nodeIsBrownClass(nd)) continue;
      if (!nd.tags) nd.tags = {};
      nd.dp_ratio = val;
      nd.tags.dp_ratio = val;
    }
  }
};

/**
 * 🤎 以「紅/黃/藍為邊界 + Sinuosity/DP（參數同骨架2）」重算 flat segments 上的粉紅點；
 *   不再為代表性轉折者，就地把該節點 tags 改成棕色（不需為粉紅 → 降級）。
 *   判斷依據＝該粉紅點的 dp_ratio（以最近的紅/藍/黃/紫為頭尾，垂線 ÷ 頭尾直線；與 hover 顯示同一值）：
 *     dp_ratio < 門檻（RIGHT_ANGLE_PINK_DP_EPSILON_RATIO，預設 0.25）→ 接近直線、非真正轉折 → 降級棕色；
 *     dp_ratio ≥ 門檻 → 仍是轉折 → 維持粉紅。粉紅與棕點都會帶 dp_ratio 供 hover 確認。
 * @param {Array<{points:Array, nodes:Array}>} flat 路網 flat segments（就地修改 nodes tags）
 * @param {{epsilonRatio?:number}} [opts]
 * @returns {number} 降級數量
 */
export const revalidatePinkToBrownInFlat = (flat, opts = {}) => {
  if (!Array.isArray(flat) || !flat.length) return 0;
  const threshold = opts.epsilonRatio ?? RIGHT_ANGLE_PINK_DP_EPSILON_RATIO; // 0.25
  // 1) 先算每個粉紅點的 dp_ratio（以相邻紅/藍/黃/紫為頭尾）。改 brown 不影響錨點，故值穩定。
  refreshPinkDpRatioInFlat(flat);
  // 2) dp_ratio < 門檻 → 降級棕色（棕點保留剛算好的 dp_ratio）。
  let demoted = 0;
  for (const seg of flat) {
    const pts = seg?.points;
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    if (!Array.isArray(pts)) continue;
    for (let i = 0; i < pts.length; i++) {
      const nd = nodes[i];
      if (!nodeIsPinkClass(nd)) continue;
      const r = nd.dp_ratio ?? nd.tags?.dp_ratio;
      if (r != null && r < threshold) {
        setNodeClass(nd, 'brown', DEMOTED_PINK_BROWN_HEX);
        demoted++;
      }
    }
  }
  return demoted;
};

/**
 * 🤎→🖤 + 🩶 把棕點改回一般黑點，再以「紅/黃/藍/粉紅 + 新增灰點」為邊界重算灰點配置
 *   （規則同骨架2：兩相鄰邊界點之間黑點 ≥ maxBetween+1（預設 5）時，於中間補 G=⌊N/(maxBetween+1)⌋ 個灰點，
 *   使每段黑點 ≤ maxBetween）。既有灰點先一併還原成黑點後重算。
 *   ① 合併 segment → ② 拉直（錨點不動、刪折角）→ ③ 黑點 (j+1)/(n+1) 重分配。
 *   computeGrayBlackDots 以「索引」均分定位，與座標系無關；故 planar 僅影響邊界折線之建構。
 * @param {Array<{points:Array, nodes:Array}>} flat 路網 flat segments（就地修改 nodes tags 與座標）
 * @param {{planar?:boolean, maxBetween?:number}} [opts]
 * @returns {{brownToBlack:number, straightened:number, gray:number}}
 */
export const recomputeGrayAfterBrownToBlack = (flat, opts = {}) => {
  if (!Array.isArray(flat) || !flat.length) return { brownToBlack: 0, straightened: 0, gray: 0 };
  const planar = !!opts.planar;
  const repr = (a, b) => (planar ? [a, b] : [b, a]);
  const kkey = (p) => `${Number(p[0]).toFixed(6)},${Number(p[1]).toFixed(6)}`;
  const isBrown = (nd) => {
    if (!nd) return false;
    const t = nd.tags || {};
    return (
      (nd.node_kind ?? t.node_kind) === 'brown' ||
      String(t.node_class_color ?? nd.node_class_color ?? '').toLowerCase() === DEMOTED_PINK_BROWN_HEX.toLowerCase()
    );
  };
  const isGray = (nd) => {
    if (!nd) return false;
    const t = nd.tags || {};
    return (
      (nd.node_kind ?? t.node_kind) === 'gray' ||
      String(t.node_class_color ?? nd.node_class_color ?? '').toLowerCase() === GRAY_DOT_HEX.toLowerCase()
    );
  };
  // 0) 記錄棕點座標（棕→黑後仍用同一格定位「需拉直的錨點區段」）。
  const brownKeys = new Set();
  for (const seg of flat) {
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    const pts = seg?.points;
    if (!Array.isArray(pts)) continue;
    for (let i = 0; i < pts.length; i++) {
      if (!isBrown(nodes[i])) continue;
      const [a, b] = readFlatPt(pts[i]);
      brownKeys.add(`${a.toFixed(6)},${b.toFixed(6)}`);
    }
  }
  // 1) 棕→黑；既有灰→黑（重算前先還原，避免舊灰殘留）。
  let brownToBlack = 0;
  for (const seg of flat) {
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    const pts = seg?.points;
    if (!Array.isArray(pts)) continue;
    for (let i = 0; i < pts.length; i++) {
      const nd = nodes[i];
      if (!nd) continue;
      if (isBrown(nd)) {
        setNodeClass(nd, 'black', '#000000');
        nd.node_type = 'line';
        if (!nd.tags) nd.tags = {};
        nd.tags._forceDrawBlackDot = true;
        nd.tags.node_type = 'line';
        brownToBlack++;
      }
      else if (isGray(nd)) setNodeClass(nd, 'black', '#000000');
    }
  }
  // 1.5) ① 合併 → ② 拉直 → ③ 黑點重分配（僅含棕點的錨點鏈）。
  const straightened = brownKeys.size > 0
    ? collapseBrownAnchorChainsInFlat(flat, brownKeys, nodeIsRYBorPinkClass)
    : 0;
  // 2) 以紅/黃/藍為邊界建折線；粉紅為內部 flush 邊界（同骨架2 computeGrayBlackDots 之 pinkKeys）。
  const paths = buildRYBBoundedPaths(flat, planar);
  const blackPts = [];
  const pinkKeys = new Set();
  for (const seg of flat) {
    const pts = seg?.points;
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    if (!Array.isArray(pts)) continue;
    for (let i = 0; i < pts.length; i++) {
      const [a, b] = readFlatPt(pts[i]);
      if (nodeIsBlackClass(nodes[i])) blackPts.push(repr(a, b));
      else if (nodeIsPinkClass(nodes[i])) pinkKeys.add(kkey(repr(a, b)));
    }
  }
  // 3) 重算灰點（規則／參數同骨架2）。
  const grayKeys = computeGrayBlackDots(paths, blackPts, pinkKeys, {
    maxBetween: opts.maxBetween ?? GRAY_MAX_BLACK_BETWEEN,
  });
  // 4) 套用：被選中的黑點 → 灰。
  let gray = 0;
  for (const seg of flat) {
    const pts = seg?.points;
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    if (!Array.isArray(pts)) continue;
    for (let i = 0; i < pts.length; i++) {
      if (!nodeIsBlackClass(nodes[i])) continue;
      const [a, b] = readFlatPt(pts[i]);
      if (grayKeys.has(kkey(repr(a, b)))) { setNodeClass(nodes[i], 'gray', GRAY_DOT_HEX); gray++; }
    }
  }
  return { brownToBlack, straightened, gray };
};

/** 黑點上限：兩相鄰邊界點（紅/黃/紫/藍/粉紅/灰）之間最多容許的黑點數。超過則在中間把黑點改灰點。預設 4。 */
export const GRAY_MAX_BLACK_BETWEEN = 4;
/** 灰點色碼（與 ROUTE_MAP_ADJUST_PALETTE 之「灰色」一致）。 */
export const GRAY_DOT_HEX = '#7f7f7f';
/** 棕點色碼（與 ROUTE_MAP_ADJUST_PALETTE 之「棕色」一致）：正規化時以紅/黃/藍為邊界重算後「不需為粉紅」之降級色。 */
export const DEMOTED_PINK_BROWN_HEX = '#9a6324';

/**
 * 在骨架邊上，把過長的「黑點連續段」中間改為灰點，使任兩相鄰邊界點（紅/黃/紫/藍/粉紅/灰）之間
 * 的黑點數 ≤ maxBetween（預設 4）。
 *   邊界＝邊端點(真實節點) + 內部的粉紅點；其間連續的非粉紅黑點為一「連續段」。
 *   連續段長 N：需改灰點數 G = ⌊N / (maxBetween+1)⌋（即 N≥5→1、≥10→2、餘類推）。
 *   灰點取最接近均分（最中間）的位置，使每個子段黑點數 ≤ maxBetween。
 * @param {Array<{path:Array<[number,number]>}>} edges 骨架邊
 * @param {Array<[number,number]>} blackDots 黑點 [lat,lng]
 * @param {Set<string>|Map<string,*>} pinkKeys 粉紅點鍵（需具 .has）
 * @param {{maxBetween?:number}} [opts]
 * @returns {Set<string>} 應改灰之黑點座標鍵集合（鍵＝`lat.toFixed(6),lng.toFixed(6)`）
 */
export const computeGrayBlackDots = (edges, blackDots, pinkKeys, opts = {}) => {
  const maxBetween = opts.maxBetween ?? GRAY_MAX_BLACK_BETWEEN;
  const groupCap = maxBetween + 1; // 每 groupCap 個黑點需 1 灰點（預設 5）
  const key = (p) => `${Number(p[0]).toFixed(6)},${Number(p[1]).toFixed(6)}`;
  const blackKeys = new Set(
    (Array.isArray(blackDots) ? blackDots : [])
      .filter((b) => Array.isArray(b) && b.length >= 2)
      .map((b) => key(b))
  );
  const isPink = (k) => !!(pinkKeys && typeof pinkKeys.has === 'function' && pinkKeys.has(k));
  const gray = new Set();
  if (!blackKeys.size) return gray;
  for (const e of Array.isArray(edges) ? edges : []) {
    const path = Array.isArray(e?.path) ? e.path : [];
    if (path.length < 3) continue;
    let run = []; // 目前連續段之 path 索引
    const flush = () => {
      const N = run.length;
      const G = Math.floor(N / groupCap);
      for (let j = 1; j <= G; j++) {
        // 均分位置：第 j 個灰點落在連續段的 round(j*(N+1)/(G+1))-1（最中間）。
        let local = Math.round((j * (N + 1)) / (G + 1)) - 1;
        local = Math.max(0, Math.min(N - 1, local));
        gray.add(key(path[run[local]]));
      }
      run = [];
    };
    for (let i = 1; i < path.length - 1; i++) {
      const k = key(path[i]);
      if (isPink(k)) {
        flush(); // 粉紅為邊界 → 切斷連續段
        continue;
      }
      if (!blackKeys.has(k)) continue; // 非站點幾何頂點（理論上不會有）
      run.push(i);
    }
    flush(); // 段尾（邊端點為邊界）
  }
  return gray;
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
 * @param {{terminals?:Array, connects?:Array}} [forcedAnchors] 額外強制保留之端點／交點（直線骨架用）
 * @returns {{nodes:Array<[number,number]>, edges:Array<{a:[number,number],b:[number,number],routeCount:number}>,
 *           crossNodes:Array<[number,number]>}}
 */
export const buildRouteMapAdjustSkeleton = (
  lines,
  blackDots = null,
  stationCoords = null,
  forcedAnchors = null
) => {
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
  const stationConnectPts = dedupePoints([
    ...(stationConnects || []).filter((p) => Array.isArray(p) && p.length >= 2),
    ...((forcedAnchors?.connects || []).filter((p) => Array.isArray(p) && p.length >= 2)),
  ]);
  // 端點＋交點之鍵 → 強制視為真實節點（收縮時不可穿越）。
  const forcedNodeKeys = new Set([
    ...(stationTerminals || []).map((p) => key(p)),
    ...((forcedAnchors?.terminals || []).map((p) => key(p))),
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
  // 某節點 k 對某鄰居 nbk 之邊上的 route_name 集合
  const routeNamesOnEdge = (k, nbk) => {
    const m = adj.get(k)?.get(nbk);
    const s = new Set();
    if (m) for (const a of m.values()) s.add(a.routeName ?? a.routeId ?? String(a.routeIndex));
    return s;
  };
  // degree-2 但「兩側 route_name 不同」→ 視為紅點（不同路線交接/轉乘），收縮串接時須保留，不可把兩條不同路線串成一條。
  const isDiffRouteNameJunction = (k) => {
    const nbr = adj.get(k);
    if (!nbr || nbr.size !== 2) return false;
    const [a, b] = [...nbr.keys()];
    const sa = routeNamesOnEdge(k, a);
    const sb = routeNamesOnEdge(k, b);
    if (sa.size !== sb.size) return true;
    for (const x of sa) if (!sb.has(x)) return true;
    return false;
  };
  // 交叉點／端點／分歧點，以及「本來的」端點(🔵)／交點(🔴)站點，皆為真實節點：
  //   收縮 degree-2 過路點時絕不可穿越，保留原本結構（相交點不消失、路線不被誤接）。
  //   另：degree-2 但兩側 route_name 不同者亦保留為紅點。
  const isReal = (k) =>
    degree(k) !== 2 || crossKeys.has(k) || forcedNodeKeys.has(k) || isDiffRouteNameJunction(k);
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
        isRouteJunction: isDiffRouteNameJunction(k), // 🔴 不同 route_name 交接之 degree-2 紅點
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
export const routeMapAdjustSkeletonToGeoJson = (
  skeleton,
  lines,
  blackDots,
  stationMeta,
  stationCoords = null
) => {
  const edges = Array.isArray(skeleton?.edges) ? skeleton.edges : [];
  const nodes = Array.isArray(skeleton?.nodes) ? skeleton.nodes : [];
  // 骨架邊顏色：取該邊所有路線之「不同顏色」。
  //   1 種顏色（單一路線）→ color 即該色；≥2 種→ color 留黑，route_colors 帶全部顏色供交錯畫。
  const distinctColorsOf = (e) => {
    const out = [];
    const seen = new Set();
    for (const r of e.routes || []) {
      const c = r?.color || null;
      if (c && !seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out;
  };
  const routeColorOf = (e) => {
    const cols = distinctColorsOf(e);
    return cols.length === 1 ? cols[0] : '#000000';
  };
  const hlColorOf = () => '';
  // 點色：只有 🔴 交叉/分歧（交叉點重算）／🔵 端點／🖤 其餘（路線中的點皆黑）。
  const llKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;
  const coords =
    Array.isArray(stationCoords) && stationCoords.length
      ? stationCoords
      : Object.keys(stationMeta || {}).map((k) => k.split(',').map(Number));
  const metaKeys = Object.keys(stationMeta || {}).map((k) => k.split(',').map(Number));
  const { terminals: origTerminals, connects: origConnects } = computeRouteMapAdjustStations(
    lines,
    blackDots,
    metaKeys.length ? metaKeys : undefined
  );
  const { terminals, connects, blacks } = computeRouteMapAdjustSkeletonStations(
    lines,
    blackDots,
    coords.length ? coords : undefined
  );
  const terminalKeys = new Set([
    ...(terminals || []).map((p) => llKey(p[0], p[1])),
    ...(origTerminals || []).map((p) => llKey(p[0], p[1])),
  ]);
  const connectKeys = new Set([
    ...(connects || []).map((p) => llKey(p[0], p[1])),
    ...(origConnects || []).map((p) => llKey(p[0], p[1])),
  ]);
  const nodeColor = (n) => {
    const k = llKey(n.latlng[0], n.latlng[1]);
    if (n.isCross) return '#ffd600'; // 🟡 交叉點（與原本黃點一致）
    if (n.isPurple) return '#9c27b0'; // 🟣 切斷點（與原本紫點一致）
    if (connectKeys.has(k) || n.isRouteJunction) return '#ff0000'; // 🔴 分歧(degree≥3)／不同 route_name 交接
    if (terminalKeys.has(k)) return '#1565c0'; // 🔵 端點
    return '#000000'; // 🖤 其餘 → 黑
  };
  const nodeRadius = () => 4;
  const features = [];
  // 🖤 黑點站：優先用呼叫端傳入的 blackDots（直線骨架為拉直後重新分配之位置）；否則用骨架重算的 blacks。
  const blackFeatures = Array.isArray(blackDots) && blackDots.length ? blackDots : blacks;
  // 每個黑點指派到「投影最近」的骨架邊，記其沿邊弧長位置——稍後插進該 way 的頂點，
  // 使示意圖佈局讀 way 幾何轉 flat 時黑點即為中段頂點（不會在轉換時遺失而於佈局後消失）。
  const blackOnEdge = edges.map(() => []);
  (Array.isArray(blackFeatures) ? blackFeatures : []).forEach((b) => {
    if (!Array.isArray(b) || b.length < 2) return;
    let bestE = -1;
    let bestD = Infinity;
    let bestPos = 0;
    edges.forEach((e, i) => {
      const path = Array.isArray(e.path) ? e.path : [];
      if (path.length < 2) return;
      const pr = projectOnPolyline(path, b);
      if (pr && pr.perpDist < bestD) {
        bestD = pr.perpDist;
        bestE = i;
        bestPos = pr.pos;
      }
    });
    if (bestE >= 0) blackOnEdge[bestE].push({ pos: bestPos, coord: [b[1], b[0]] });
  });
  edges.forEach((e, i) => {
    const path = Array.isArray(e.path) ? e.path : [];
    if (path.length < 2) return;
    // 既有頂點沿弧長 + 指派到本邊的黑點，依弧長排序組成 way 座標（黑點成為中段頂點）。
    const cum = [0];
    for (let k = 0; k < path.length - 1; k++) cum.push(cum[k] + planarDist(path[k], path[k + 1]));
    const pts = path.map((p, k) => ({ pos: cum[k], coord: [p[1], p[0]] }));
    for (const blk of blackOnEdge[i]) pts.push(blk);
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
          route_id: String(i + 1),
          route_name: e.routes?.[0]?.routeName || `骨架邊 ${i + 1}`,
          color: routeColorOf(e), // 單一路線→該色；多色→黑（交錯由 route_colors 畫）
          route_colors: distinctColorsOf(e).join(','), // 該邊所有不同顏色（≥2 色交錯畫）
          route_color: e.routes?.[0]?.color || '', // 真正的路線顏色（hover 顯示用）
          hl_color: hlColorOf(e), // 共線/環線/頭尾共點底色（墊在底下；無則空）
          railway: 'subway',
        },
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
  });
  let nid = 1;
  // 🩷 中段黑點轉折（粉紅）：以曲折度 + Douglas–Peucker 在太曲折的骨架邊上挑代表性轉折黑點。
  const pinkKeys = computeRightAnglePinkBlackDots(edges, blackFeatures);
  // 🩶 過長黑點段中間改灰點：使兩相鄰邊界點（紅/黃/紫/藍/粉紅/灰）之間黑點 ≤ 4。
  const grayKeys = computeGrayBlackDots(edges, blackFeatures, pinkKeys);
  blackFeatures.forEach((p) => {
    if (!Array.isArray(p) || p.length < 2) return;
    const [lat, lng] = p;
    const meta = (stationMeta && stationMeta[llKey(lat, lng)]) || {};
    const pinkKey = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
    const isPink = pinkKeys.has(pinkKey);
    const isGray = !isPink && grayKeys.has(pinkKey);
    const dpRatio = isPink ? pinkKeys.get(pinkKey) : null; // 轉折比例（垂線/頭尾直線）
    features.push({
      type: 'Feature',
      properties: {
        type: 'node',
        id: nid,
        tags: {
          station_id: meta.id != null ? String(meta.id) : `b${nid}`,
          station_name: meta.name || '',
          type: 'normal',
          // 🩷 粉紅＝曲折邊轉折點；🩶 灰＝過長黑點段中間之分隔點；其餘黑點
          node_kind: isPink ? 'right_angle_pink' : isGray ? 'gray' : 'black',
          node_class_color: isPink ? RIGHT_ANGLE_PINK_HEX : isGray ? GRAY_DOT_HEX : '#000000',
          node_class_r: 4, // 黑/紅/藍/黃/紫/灰/粉紅/棕骨架點同尺寸
          dp_ratio: dpRatio != null ? Number(dpRatio.toFixed(4)) : undefined, // 🩷 轉折比例
        },
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
    nid += 1;
  });
  nodes.forEach((n) => {
    if (!n || !Array.isArray(n.latlng)) return;
    const [lat, lng] = n.latlng;
    const meta = (stationMeta && stationMeta[llKey(lat, lng)]) || {};
    features.push({
      type: 'Feature',
      properties: {
        type: 'node',
        id: nid,
        tags: {
          station_id: meta.id != null ? String(meta.id) : `n${nid}`,
          station_name: meta.name || '',
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
