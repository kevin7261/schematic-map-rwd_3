/**
 * Hong, Merrick & do Nascimento (2006)「Automatic visualisation of metro maps」
 * （JVLC 17(3):203–224）之 **Method 5**（作者提出最佳法）力導向核心（worker-safe）。
 *
 * Method 5 = 前處理(移除度數2站) → GEM 初值 → 修改版 PrEd(含邊權重) → 正交磁簧力 + 45° 磁簧力。
 * 本檔忠實實作其力模型(§3.2–3.4, Eq.1–5)＋ PrEd 之「8 區移動限制」(p.208, Bertault[13])：
 *   · 吸引力 Eq.1：F^a(u,v) = (d/δ)·(P(v)−P(u))            → 量值 d²/δ
 *   · 斥力   Eq.1：F^r(u,v) = −(δ²/d²)·(P(v)−P(u))         → 量值 δ²/d
 *     理想距離 δ(u,v)=L·min(W,weight)²（L 為尺度常數、W=25）。
 *   · 點—邊斥力 Eq.2：F^e = −((γ−d)²/d)·(P(i)−P(v))，d<γ  → 量值 (γ−d)²（反作用依投影 t 分攤給邊兩端）
 *   · 磁簧力 Eq.4：F^m = c_m·b·d^α·θ^β（c_m=0.1,b=30,α=1,β=0.5），垂直於邊、等量反向施於兩端，
 *     8 個磁場方向(4 正交+4 對角)取夾角最小者。**全強度施加、無漸強、無 class 權重**(論文直接相加)。
 *   · 移動限制(取代 GEM cooling)：每點周圍分 8 區，對每條非相鄰邊以其距離 r 限該方向可移動量 ≤ r/3，
 *     使任何位移都不會掃過該邊 → 保持嵌入、不新增交叉(PrEd 的定義性質)。
 *
 * 前處理(移除度數2站)/重插由上游骨架 + reinsertBlackStations 處理；本檔輸入即簡化圖 G′。
 * 註：邊權重 weight（=移除的度數2站數）未從上游 sections 接入本模組，暫以初值幾何邊長為代理。
 * 各圖層各自輸出自己論文演算法的座標（不接 MILP）。
 */

const FIELD_ANGLES = [];
for (let k = 0; k < 8; k++) FIELD_ANGLES.push((k * Math.PI) / 4);

// 論文 §3.4 力場常數（literal）。L、γ 為尺度常數，依格網於執行時設定（論文：L 決定縮放、γ 為可調常數）。
const W = 25.0; // δ=L·min(W,weight)²
const CM = 0.1; // 磁場 c_m
const B = 30.0; // 磁場強度 b
const ALPHA = 1.0;
const BETA = 0.5;

function wrapPi(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** 取夾角最小的磁場方向，回傳 { signedTheta, theta }。 */
function nearestField(edgeAng) {
  let bestAbs = Infinity, bestSigned = 0;
  for (const fa of FIELD_ANGLES) {
    const s = wrapPi(fa - edgeAng);
    if (Math.abs(s) < bestAbs) { bestAbs = Math.abs(s); bestSigned = s; }
  }
  return { signedTheta: bestSigned, theta: bestAbs };
}

function medianEdgeLength(graph, coords) {
  const lens = [];
  for (const e of graph.edges) lens.push(Math.hypot(coords[e.v][0] - coords[e.u][0], coords[e.v][1] - coords[e.u][1]));
  if (!lens.length) return 4;
  lens.sort((a, b) => a - b);
  return Math.max(2, lens[lens.length >> 1]);
}

/** 點 (px,py) 到線段 ab 的投影：回傳 [ix, iy, t]（t∈[0,1] 為沿 a→b 之參數）。 */
function projectOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [ax, ay, 0];
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return [ax + t * dx, ay + t * dy, t];
}

/** 線段 (p0→p1) 與線段 (a,b) 相交則回傳沿 p0→p1 之參數 t∈[0,1]，否則 null。 */
function segCrossParam(p0x, p0y, p1x, p1y, ax, ay, bx, by) {
  const rx = p1x - p0x,
    ry = p1y - p0y;
  const sx = bx - ax,
    sy = by - ay;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null; // 平行或退化
  const t = ((ax - p0x) * sy - (ay - p0y) * sx) / denom;
  const u = ((ax - p0x) * ry - (ay - p0y) * rx) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

/** 方向角 → 8 區(octant) index 0..7。 */
function octant(ang) {
  let a = ang % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return Math.floor(a / (Math.PI / 4)) % 8;
}

/**
 * Hong et al. (2006) Method 5 力導向法。回傳整數座標（nodeId→[x,y]）。
 */
export function runForceDirected(graph, coords0, opts = {}) {
  const n = graph.nodes.length;
  const coords = coords0.map((c) => [c[0], c[1]]);
  if (n <= 1) return coords.map((c) => [Math.round(c[0]), Math.round(c[1])]);

  const baseLen = opts.idealLen ?? medianEdgeLength(graph, coords0);
  const iters = opts.iterations ?? 400;

  // 邊權重代理（= 移除度數2站數之代理）→ 理想邊長 δ=L·min(W,weight)²；L 為尺度常數。
  const unit = Math.max(1, baseLen);
  const edgeW = graph.edges.map((e) => {
    const w = Math.round(Math.hypot(coords0[e.v][0] - coords0[e.u][0], coords0[e.v][1] - coords0[e.u][1]) / unit);
    return Math.min(W, Math.max(1, w));
  });
  const medW = (() => { const s = edgeW.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 1; })();
  const Lscale = baseLen / Math.max(1, medW * medW); // 論文 L（尺度常數）
  const idealLen = graph.edges.map((e, i) => Math.max(2, Lscale * Math.min(W, edgeW[i]) ** 2));
  const deltaBar = baseLen; // 非相鄰點對斥力之 δ（全域理想距離）
  const gamma = opts.gamma ?? baseLen * 1.5; // §3.2 點—邊期望距離 γ（可調常數，依格網設定）
  // 未受邊限制方向之單步上限（防溢位；不影響 PrEd「不掃過邊」之 r/3 限制）。
  const maxStep = opts.maxStep ?? baseLen;

  const disp = coords.map(() => [0, 0]);
  const zoneMax = Array.from({ length: n }, () => new Float64Array(8));

  // 每點的相鄰邊（供「移動後不可使任何相鄰邊與其他邊相交」之嚴格拓撲檢查）
  const incident = Array.from({ length: n }, () => []);
  graph.edges.forEach((e, ei) => { incident[e.u].push(ei); incident[e.v].push(ei); });
  // 把節點 i 放到 (nx,ny) 後，其任一相鄰邊是否與「非共端點之邊」相交（用目前座標）。
  const moveCreatesCrossing = (i, nx, ny) => {
    for (const ei of incident[i]) {
      const e = graph.edges[ei];
      const ux = e.u === i ? nx : coords[e.u][0];
      const uy = e.u === i ? ny : coords[e.u][1];
      const vx = e.v === i ? nx : coords[e.v][0];
      const vy = e.v === i ? ny : coords[e.v][1];
      for (let ej = 0; ej < graph.edges.length; ej++) {
        const f = graph.edges[ej];
        if (f.u === e.u || f.u === e.v || f.v === e.u || f.v === e.v) continue; // 共端點不算
        if (segCrossParam(ux, uy, vx, vy, coords[f.u][0], coords[f.u][1], coords[f.v][0], coords[f.v][1]) != null) {
          return true;
        }
      }
    }
    return false;
  };

  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) { disp[i][0] = 0; disp[i][1] = 0; }

    // 斥力 Eq.1：所有點對，F^r=−(δ̄²/d²)·(P(j)−P(i))（乘完整向量 → 量值 δ̄²/d）。
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = coords[i][0] - coords[j][0];
        let dy = coords[i][1] - coords[j][1];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) { dx = (i - j) * 1e-3 + 1e-3; dy = 1e-3; d2 = dx * dx + dy * dy; }
        const coef = (deltaBar * deltaBar) / d2; // ×完整向量(dx,dy)
        disp[i][0] += coef * dx; disp[i][1] += coef * dy;
        disp[j][0] -= coef * dx; disp[j][1] -= coef * dy;
      }
    }

    // 吸引力 Eq.1 + 磁簧力 Eq.4
    for (let ei = 0; ei < graph.edges.length; ei++) {
      const e = graph.edges[ei];
      const u = e.u, v = e.v;
      let dx = coords[v][0] - coords[u][0];
      let dy = coords[v][1] - coords[u][1];
      let d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = 1e-3; dy = 0; d = 1e-3; }
      const delta = idealLen[ei];
      // 吸引：F^a=(d/δ)·(P(v)−P(u)) → 量值 d²/δ
      const ca = d / delta;
      disp[u][0] += ca * dx; disp[u][1] += ca * dy;
      disp[v][0] -= ca * dx; disp[v][1] -= ca * dy;
      // 磁簧：F^m=c_m·b·d^α·θ^β，垂直於邊、等量反向
      const { signedTheta, theta } = nearestField(Math.atan2(dy, dx));
      if (theta > 1e-3) {
        const fm = CM * B * d ** ALPHA * Math.abs(theta) ** BETA;
        const sense = Math.sign(signedTheta);
        const ux = dx / d, uy = dy / d;
        const px = -uy * fm * sense, py = ux * fm * sense;
        disp[v][0] += px; disp[v][1] += py;
        disp[u][0] -= px; disp[u][1] -= py;
      }
    }

    // 點—邊斥力 Eq.2：非相鄰點 v 與邊(a,b)距離 d<γ，F^e 量值 (γ−d)²；反作用依投影 t 分攤。
    for (let ei = 0; ei < graph.edges.length; ei++) {
      const e = graph.edges[ei];
      const a = e.u, b = e.v;
      const ax = coords[a][0], ay = coords[a][1], bx = coords[b][0], by = coords[b][1];
      for (let vId = 0; vId < n; vId++) {
        if (vId === a || vId === b) continue;
        const vx = coords[vId][0], vy = coords[vId][1];
        const [ix, iy, t] = projectOnSegment(vx, vy, ax, ay, bx, by);
        let rx = vx - ix, ry = vy - iy;
        let dist = Math.hypot(rx, ry);
        if (dist >= gamma) continue;
        if (dist < 1e-6) { const el = Math.hypot(bx - ax, by - ay) || 1; rx = -(by - ay) / el; ry = (bx - ax) / el; dist = 1; }
        const coef = ((gamma - dist) * (gamma - dist)) / dist; // ×完整向量(rx,ry) → 量值 (γ−d)²
        disp[vId][0] += coef * rx; disp[vId][1] += coef * ry;
        disp[a][0] -= coef * rx * (1 - t); disp[a][1] -= coef * ry * (1 - t);
        disp[b][0] -= coef * rx * t; disp[b][1] -= coef * ry * t;
      }
    }

    // PrEd 移動限制(p.208)：8 區，依非相鄰邊距離 r 限該方向可移動量 ≤ r/3（取代 cooling）。
    for (let v = 0; v < n; v++) zoneMax[v].fill(maxStep);
    for (let ei = 0; ei < graph.edges.length; ei++) {
      const e = graph.edges[ei];
      const a = e.u, b = e.v;
      const ax = coords[a][0], ay = coords[a][1], bx = coords[b][0], by = coords[b][1];
      for (let v = 0; v < n; v++) {
        if (v === a || v === b) continue;
        const [ix, iy] = projectOnSegment(coords[v][0], coords[v][1], ax, ay, bx, by);
        const r = Math.hypot(coords[v][0] - ix, coords[v][1] - iy);
        if (r < 1e-9) continue;
        const lim = r / 3;
        const zv = octant(Math.atan2(iy - coords[v][1], ix - coords[v][0]));
        if (lim < zoneMax[v][zv]) zoneMax[v][zv] = lim;
        const za = octant(Math.atan2(coords[v][1] - ay, coords[v][0] - ax));
        if (lim < zoneMax[a][za]) zoneMax[a][za] = lim;
        const zb = octant(Math.atan2(coords[v][1] - by, coords[v][0] - bx));
        if (lim < zoneMax[b][zb]) zoneMax[b][zb] = lim;
      }
    }

    // 套用位移（依其方向所在 8 區之上限夾住）；逐點套用，clamp 以目前(已更新)座標為準。
    let maxMove = 0;
    for (let i = 0; i < n; i++) {
      let mvx = disp[i][0], mvy = disp[i][1];
      const m = Math.hypot(mvx, mvy);
      if (m < 1e-12) continue;
      const z = octant(Math.atan2(mvy, mvx));
      const lim = zoneMax[i][z];
      if (m > lim) { mvx *= lim / m; mvy *= lim / m; }
      // 🔒 嚴格防拓撲改變：移動後不可使該點「任一相鄰邊」與其他邊相交（8 區近似太粗會漏；此處精確檢查）。
      //   若整步會造成交叉 → 二分搜尋可安全前進之最大比例；完全不行則此點本輪不動。
      //   → 任何相鄰邊都不會掃到另一側 → 不新增交叉、相對位置不翻邊。
      if (moveCreatesCrossing(i, coords[i][0] + mvx, coords[i][1] + mvy)) {
        let loF = 0, hiF = 1;
        for (let b = 0; b < 14; b++) {
          const mid = (loF + hiF) / 2;
          if (moveCreatesCrossing(i, coords[i][0] + mvx * mid, coords[i][1] + mvy * mid)) hiF = mid;
          else loF = mid;
        }
        mvx *= loF; mvy *= loF;
      }
      coords[i][0] += mvx; coords[i][1] += mvy;
      const mm = Math.hypot(mvx, mvy);
      if (mm > maxMove) maxMove = mm;
    }
    if (maxMove < 1e-3) break;
  }

  // 整數化（四捨五入）可能在極近處造成新交叉：逐點檢查，若某點四捨五入後其相鄰邊與某非相鄰邊相交，
  //   改試其餘 3 個整數角，挑不相交者；皆不行則維持四捨五入。
  const rounded = coords.map((c) => [Math.round(c[0]), Math.round(c[1])]);
  const anyIncidentCross = (i) => {
    for (const ei of incident[i]) {
      const e = graph.edges[ei];
      const ux = rounded[e.u][0], uy = rounded[e.u][1], vx = rounded[e.v][0], vy = rounded[e.v][1];
      for (let ej = 0; ej < graph.edges.length; ej++) {
        const f = graph.edges[ej];
        if (f.u === e.u || f.u === e.v || f.v === e.u || f.v === e.v) continue; // 共端點不算交叉
        if (segCrossParam(ux, uy, vx, vy, rounded[f.u][0], rounded[f.u][1], rounded[f.v][0], rounded[f.v][1]) != null) {
          return true;
        }
      }
    }
    return false;
  };
  for (let i = 0; i < n; i++) {
    if (!anyIncidentCross(i)) continue;
    const fx = Math.floor(coords[i][0]), cx2 = Math.ceil(coords[i][0]);
    const fy = Math.floor(coords[i][1]), cy2 = Math.ceil(coords[i][1]);
    const orig = rounded[i];
    let fixed = null;
    for (const cnd of [[fx, fy], [cx2, fy], [fx, cy2], [cx2, cy2]]) {
      rounded[i] = cnd;
      if (!anyIncidentCross(i)) { fixed = cnd; break; }
    }
    if (!fixed) rounded[i] = orig; // 四角皆不行 → 還原四捨五入
  }
  return rounded;
}
