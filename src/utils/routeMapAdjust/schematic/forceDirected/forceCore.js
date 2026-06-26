/**
 * Hong, Merrick & do Nascimento (2006)「Automatic visualisation of metro maps」
 * （JVLC 17(3):203–224）力導向法核心（worker-safe：不依賴 dataStore）。
 *
 * 依論文 §3 之 **Method 5**（作者提出的最佳方法）力模型實作。Method 5 = 前處理（移除度數 2 站）
 *  → GEM 初值 → 修改版 PrEd（保嵌入的彈簧）→ 正交磁簧力 + 45° 磁簧力（共 8 方向）。
 *
 * 本檔對應其中的「修改版 PrEd + 8 方向磁簧力」核心力疊代：
 *  (A) 前處理：本專案上游已把度數 2 黑站抽離 connect 骨架（黑站之後沿邊內插放回），
 *      故傳入的 graph 即論文的簡化圖 G′；邊「權重 weight」以初值幾何邊長為度數 2 站數的代理。
 *  (B) GEM 初值：依論文 §3.5「保留地理嵌入」——以真實地理座標 coords0 取代 GEM 當初始佈局
 *      （PrEd 保嵌入；本專案下游精確八方向引擎再以 H2 環序硬約束保嵌入，故初值用地理最忠實）。
 *  (C) 力（每次疊代對每點求合力後位移，含冷卻 temperature）：
 *      · 吸引力／斥力（式(1)）：理想邊長 δ(u,v)=L·min(W,weight)²（L 設定縮放、W=25 限最短邊長）。
 *      · 點—邊斥力（式(2)）：非相鄰點與邊距離 < γ 時相斥，避免節點壓過邊（防交叉）。
 *      · 磁簧力（式(4)）：F^m=c_m·b·d^α·θ^β；8 個磁場向量取夾角 θ 最小者，對邊施垂直旋轉力使其
 *        對齊最近的 0/45/90/…° 方向（Method 5 的正交＋對角磁場）。常數 c_m=0.1,b=30,α=1,β=0.5。
 *
 * 僅作為精確八方向引擎之「方向偏好」初值（computePreferredDirs 取其方向）。
 */

// 8 個磁場方向角（Method 5：4 正交 + 4 對角），每 45°。
const FIELD_ANGLES = [];
for (let k = 0; k < 8; k++) FIELD_ANGLES.push((k * Math.PI) / 4);

// 論文 §3.2–3.3 力場常數（保留原值；L、γ 依格網尺度於執行時重新縮放）。
const W = 25.0; // δ=L·min(W,weight)²：限制最短邊長
const CM = 0.1; // 磁場力 c_m
const B = 30.0; // 磁場強度 b
const ALPHA = 1.0; // d^α
const BETA = 0.5; // θ^β

/** 角度正規化到 (−π, π]。 */
function wrapPi(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** 取夾角最小的磁場方向，回傳 { fieldAng, signedTheta }（signedTheta 由邊角轉向磁場角，含旋轉正負）。 */
function nearestField(edgeAng) {
  let best = 0;
  let bestAbs = Infinity;
  let bestSigned = 0;
  for (const fa of FIELD_ANGLES) {
    const s = wrapPi(fa - edgeAng);
    if (Math.abs(s) < bestAbs) {
      bestAbs = Math.abs(s);
      bestSigned = s;
      best = fa;
    }
  }
  // 邊為無向：fieldAng 與 fieldAng+π 等價，取較近者（θ ≤ 22.5°）。
  return { fieldAng: best, signedTheta: bestSigned, theta: bestAbs };
}

/** 邊長中位數（理想邊長縮放基準，至少 2 避免塌縮）。 */
function medianEdgeLength(graph, coords) {
  const lens = [];
  for (const e of graph.edges) {
    const a = coords[e.u];
    const b = coords[e.v];
    lens.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  if (!lens.length) return 4;
  lens.sort((a, b) => a - b);
  return Math.max(2, lens[lens.length >> 1]);
}

/** 點 p 到線段 ab 的投影點（夾在端點之間）。 */
function projectOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [ax, ay];
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return [ax + t * dx, ay + t * dy];
}

/**
 * 對 connect 圖節點座標跑 Hong et al. (2006) Method 5 力導向法。
 * @param {object} graph buildSchematicGraph / splitHighDegreeNodes 結果（nodes/edges/incident）
 * @param {Array<[number,number]>} coords0 地理初值座標（nodeId→[x,y]）
 * @param {object} [opts] 可調參數
 * @returns {Array<[number,number]>} 佈局後整數座標（nodeId→[x,y]）
 */
export function runForceDirected(graph, coords0, opts = {}) {
  const n = graph.nodes.length;
  const coords = coords0.map((c) => [c[0], c[1]]);
  if (n <= 1) return coords.map((c) => [Math.round(c[0]), Math.round(c[1])]);

  const baseLen = opts.idealLen ?? medianEdgeLength(graph, coords0); // 格網尺度基準
  const iters = opts.iterations ?? 400;
  const cooling = opts.cooling ?? 0.985;
  let temp = opts.temp ?? baseLen * 1.5; // 單步位移上限（冷卻遞減）

  // 力縮放（把論文力場映到格網尺度；磁力隨疊代漸強：先擺位、後對齊 8 方向）。
  const kSpring = opts.kSpring ?? 0.10; // 吸引/斥力整體權重
  const kNodeEdge = opts.kNodeEdge ?? 0.08; // 點—邊斥力權重
  const kMag = opts.kMag ?? 0.020; // 磁簧力權重（× CM·B）
  const gamma = opts.gamma ?? baseLen * 1.2; // §3.2 點—邊期望距離 γ（縮放至格網）

  // (A) 邊權重 weight：以初值幾何邊長為「移除的度數 2 站數」代理 → 理想邊長 δ=L·min(W,weight)²。
  //     L 取 baseLen/min(W,medianWeight)² 使平均理想邊長 ≈ baseLen（論文：L 決定整體縮放）。
  const unit = Math.max(1, baseLen);
  const weightOf = (e) => {
    const a = coords0[e.u];
    const b = coords0[e.v];
    const w = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / unit);
    return Math.min(W, Math.max(1, w));
  };
  const edgeW = graph.edges.map(weightOf);
  const medW = (() => {
    const s = edgeW.slice().sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : 1;
  })();
  const Lscale = baseLen / Math.max(1, medW * medW); // 論文 L
  const idealLen = graph.edges.map((e, i) => Math.max(2, Lscale * Math.min(W, edgeW[i]) ** 2));
  const deltaBar = baseLen; // 非相鄰點對斥力用的全域理想距離

  const disp = coords.map(() => [0, 0]);

  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      disp[i][0] = 0;
      disp[i][1] = 0;
    }

    // 全節點斥力（式(1) 斥力項，δ 用全域 deltaBar；n≤門檻 → O(n²) 可接受）
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = coords[i][0] - coords[j][0];
        let dy = coords[i][1] - coords[j][1];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          dx = (i - j) * 1e-3 + 1e-3;
          dy = 1e-3;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const f = kSpring * ((deltaBar * deltaBar) / d2); // |F^r| = δ²/d
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        disp[i][0] += fx;
        disp[i][1] += fy;
        disp[j][0] -= fx;
        disp[j][1] -= fy;
      }
    }

    // 邊吸引力（式(1)，|F^a|=d²/δ，朝對端）＋ 磁簧力（式(4)，旋轉對齊 8 方向）
    const magW = kMag * CM * B * Math.min(1, it / (iters * 0.5)); // 漸強
    for (let ei = 0; ei < graph.edges.length; ei++) {
      const e = graph.edges[ei];
      const u = e.u;
      const v = e.v;
      const ax = coords[u][0];
      const ay = coords[u][1];
      const bx = coords[v][0];
      const by = coords[v][1];
      let dx = bx - ax;
      let dy = by - ay;
      let d = Math.hypot(dx, dy);
      if (d < 1e-6) {
        dx = 1e-3;
        dy = 0;
        d = 1e-3;
      }
      const ux = dx / d;
      const uy = dy / d;
      const delta = idealLen[ei];

      // 吸引：把 u、v 沿邊互拉，|F^a|=d²/δ
      const fa = kSpring * ((d * d) / delta);
      disp[u][0] += ux * fa;
      disp[u][1] += uy * fa;
      disp[v][0] -= ux * fa;
      disp[v][1] -= uy * fa;

      // 磁簧：取最近 8 方向，施垂直旋轉力使邊轉向該方向（F^m=c_m·b·d^α·θ^β）
      const edgeAng = Math.atan2(dy, dx);
      const { signedTheta, theta } = nearestField(edgeAng);
      if (theta > 1e-3) {
        const fm = magW * d ** ALPHA * Math.abs(theta) ** BETA;
        const sense = Math.sign(signedTheta); // +1：邊需逆時針轉
        // 垂直於邊的單位向量（逆時針 90°）= (−uy, ux)；v 端施 +、u 端施 − → 繞中點旋轉
        const px = -uy * fm * sense;
        const py = ux * fm * sense;
        disp[v][0] += px;
        disp[v][1] += py;
        disp[u][0] -= px;
        disp[u][1] -= py;
      }
    }

    // 點—邊斥力（式(2)）：非相鄰點與邊距離 < γ 時，把點推離投影、把邊端點推離點
    if (kNodeEdge > 0) {
      for (let ei = 0; ei < graph.edges.length; ei++) {
        const e = graph.edges[ei];
        const a = e.u;
        const b = e.v;
        const ax = coords[a][0];
        const ay = coords[a][1];
        const bx = coords[b][0];
        const by = coords[b][1];
        for (let vId = 0; vId < n; vId++) {
          if (vId === a || vId === b) continue;
          const vx = coords[vId][0];
          const vy = coords[vId][1];
          const [ix, iy] = projectOnSegment(vx, vy, ax, ay, bx, by);
          let rx = vx - ix;
          let ry = vy - iy;
          let dist = Math.hypot(rx, ry);
          if (dist >= gamma) continue;
          if (dist < 1e-6) {
            rx = -uyOf(ax, ay, bx, by);
            ry = uxOf(ax, ay, bx, by);
            dist = Math.hypot(rx, ry) || 1;
          }
          const f = kNodeEdge * (((gamma - dist) * (gamma - dist)) / Math.max(dist, 1e-3));
          const fx = (rx / dist) * f;
          const fy = (ry / dist) * f;
          disp[vId][0] += fx;
          disp[vId][1] += fy;
          // 反作用力分攤給邊兩端（式(3) 末項）
          disp[a][0] -= fx * 0.5;
          disp[a][1] -= fy * 0.5;
          disp[b][0] -= fx * 0.5;
          disp[b][1] -= fy * 0.5;
        }
      }
    }

    // 套用位移（冷卻上限）
    let maxMove = 0;
    for (let i = 0; i < n; i++) {
      let mvx = disp[i][0];
      let mvy = disp[i][1];
      const m = Math.hypot(mvx, mvy);
      if (m > temp) {
        mvx = (mvx / m) * temp;
        mvy = (mvy / m) * temp;
      }
      coords[i][0] += mvx;
      coords[i][1] += mvy;
      if (m > maxMove) maxMove = m;
    }
    temp *= cooling;
    if (temp < 0.01 && maxMove < 0.05) break;
  }

  return coords.map((c) => [Math.round(c[0]), Math.round(c[1])]);
}

/** 邊單位向量 x 分量（dist≈0 退化時用）。 */
function uxOf(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy) || 1;
  return dx / d;
}
/** 邊單位向量 y 分量。 */
function uyOf(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy) || 1;
  return dy / d;
}
