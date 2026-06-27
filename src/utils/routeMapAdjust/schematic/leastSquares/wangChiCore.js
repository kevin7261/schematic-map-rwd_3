/**
 * Wang & Chi (2011)「Focus+Context Metro Maps」（IEEE TVCG 17(12):2528–2535）
 * 之 §3「Metro map deformation」最小二乘變形法核心（worker-safe：不依賴 dataStore）。
 *
 * 以 Jacobi 疊代最小化論文的二次能量（等價 (AᵀA)⁻¹Aᵀb；Gauss-Newton 外圈每回合更新方向/旋轉）：
 *  Phase 1 平滑變形（§3.1）：
 *   · Ω_ℓ 規則邊長（式1）；· Ω_m 入射邊均分夾角（式2–3，f=2→共線）；· Ω_g 位置錨（式4）；
 *   · Ω_c 點—邊間距（式8 / §3.3）：非相鄰點與邊距離 < ε 時推離至 ε（避免邊—點過近/壓線）。
 *  Phase 2 八方向化（§3.2，式6）：Ω_o + Ω_g。
 *  保平面嵌入（§3.3）：阻尼套用——整步若新增交叉就把步長 α 連續減半，都不行則不動。
 *  coarse-to-fine（§3.4, Fig.4）：先在收縮後的粗圖求解、prolongate 回細圖再求解 → 避開局部極小。
 *
 * 權重 w_ℓ=5, w_g=0.05, w_o=10（§3.4）。本專案邊長均一（非 focus+context 的 Dα>Dβ）。
 * 各圖層各自輸出自己論文演算法的座標（不接 MILP）。
 */

const QUARTER = Math.PI / 4;

function snapOctVec(dx, dy) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return [0, 0];
  const ang = Math.round(Math.atan2(dy, dx) / QUARTER) * QUARTER;
  return [Math.cos(ang) * d, Math.sin(ang) * d];
}

function segProperCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = o(ax, ay, bx, by, cx, cy);
  const o2 = o(ax, ay, bx, by, dx, dy);
  const o3 = o(cx, cy, dx, dy, ax, ay);
  const o4 = o(cx, cy, dx, dy, bx, by);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

function medianEdgeLength(graph, coords) {
  const lens = [];
  for (const e of graph.edges) lens.push(Math.hypot(coords[e.v][0] - coords[e.u][0], coords[e.v][1] - coords[e.u][1]));
  if (!lens.length) return 4;
  lens.sort((a, b) => a - b);
  return Math.max(2, lens[lens.length >> 1]);
}

function projectOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [ax, ay];
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return [ax + t * dx, ay + t * dy];
}

/**
 * Phase 1 平滑變形（Ω_ℓ + Ω_m + Ω_g + Ω_c），含 §3.3 阻尼保嵌入。就地更新 V。
 * @param {{edges:Array,incident:Array,nodes:Array}} g
 * @param {Array<[number,number]>} V 變形中座標（就地更新）
 * @param {Array<[number,number]>} V0 Ω_g 錨點
 */
function smoothPhase1(g, V, V0, D, w, sweeps, epsilon) {
  const n = V.length;
  const edges = g.edges;
  const incident = g.incident;
  const acc = V.map(() => [0, 0, 0]);
  const T = V.map(() => [0, 0]);
  const reset = () => { for (let i = 0; i < n; i++) { acc[i][0] = 0; acc[i][1] = 0; acc[i][2] = 0; } };
  const add = (i, tx, ty, ww) => { acc[i][0] += tx * ww; acc[i][1] += ty * ww; acc[i][2] += ww; };
  const crossGuard = edges.length > 0 && edges.length <= 1000;
  const introducesCross = (alpha) => {
    for (let i = 0; i < n; i++) {
      T[i][0] = acc[i][2] > 1e-9 ? V[i][0] + alpha * (acc[i][0] / acc[i][2] - V[i][0]) : V[i][0];
      T[i][1] = acc[i][2] > 1e-9 ? V[i][1] + alpha * (acc[i][1] / acc[i][2] - V[i][1]) : V[i][1];
    }
    for (let a = 0; a < edges.length; a++) {
      const e1 = edges[a];
      for (let b = a + 1; b < edges.length; b++) {
        const e2 = edges[b];
        if (e1.u === e2.u || e1.u === e2.v || e1.v === e2.u || e1.v === e2.v) continue;
        if (segProperCross(V[e1.u][0], V[e1.u][1], V[e1.v][0], V[e1.v][1], V[e2.u][0], V[e2.u][1], V[e2.v][0], V[e2.v][1])) continue;
        if (segProperCross(T[e1.u][0], T[e1.u][1], T[e1.v][0], T[e1.v][1], T[e2.u][0], T[e2.u][1], T[e2.v][0], T[e2.v][1])) return true;
      }
    }
    return false;
  };
  const apply = () => {
    if (!crossGuard) {
      for (let i = 0; i < n; i++) if (acc[i][2] > 1e-9) { V[i][0] = acc[i][0] / acc[i][2]; V[i][1] = acc[i][1] / acc[i][2]; }
      return;
    }
    let alpha = 1;
    for (let tries = 0; tries < 7; tries++) {
      if (!introducesCross(alpha)) { for (let i = 0; i < n; i++) { V[i][0] = T[i][0]; V[i][1] = T[i][1]; } return; }
      alpha /= 2;
    }
  };
  const clearGuard = n * edges.length <= 400000; // Ω_c O(n·E)，超大網路略過

  for (let it = 0; it < sweeps; it++) {
    reset();
    for (let i = 0; i < n; i++) add(i, V0[i][0], V0[i][1], w.G); // Ω_g
    for (const e of edges) { // Ω_ℓ
      const i = e.u, j = e.v;
      let dx = V[i][0] - V[j][0], dy = V[i][1] - V[j][1];
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      add(i, V[j][0] + dx * D, V[j][1] + dy * D, w.L);
      add(j, V[i][0] - dx * D, V[i][1] - dy * D, w.L);
    }
    for (let i = 0; i < n; i++) { // Ω_m
      const inc = incident[i];
      const f = inc.length;
      if (f < 2) continue;
      const tanHalf = Math.tan((Math.PI - (2 * Math.PI) / f) / 2);
      for (let a = 0; a < inc.length; a++) {
        for (let b = a + 1; b < inc.length; b++) {
          const ej = edges[inc[a]], ek = edges[inc[b]];
          const jId = ej.u === i ? ej.v : ej.u, kId = ek.u === i ? ek.v : ek.u;
          const jx = V[jId][0], jy = V[jId][1], kx = V[kId][0], ky = V[kId][1];
          const mx = (jx + kx) / 2, my = (jy + ky) / 2;
          const ujx = (kx - jx) / 2, ujy = (ky - jy) / 2;
          const baseHalf = Math.hypot(ujx, ujy);
          let px = -ujy, py = ujx;
          const pl = Math.hypot(px, py) || 1; px /= pl; py /= pl;
          if ((V[i][0] - mx) * px + (V[i][1] - my) * py < 0) { px = -px; py = -py; }
          const h = baseHalf * tanHalf;
          add(i, mx + px * h, my + py * h, w.M);
        }
      }
    }
    if (clearGuard && epsilon > 0) { // Ω_c 點—邊間距（式8）
      for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        const a = e.u, b = e.v;
        for (let vId = 0; vId < n; vId++) {
          if (vId === a || vId === b) continue;
          const [ix, iy] = projectOnSegment(V[vId][0], V[vId][1], V[a][0], V[a][1], V[b][0], V[b][1]);
          let rx = V[vId][0] - ix, ry = V[vId][1] - iy;
          let d = Math.hypot(rx, ry);
          if (d >= epsilon) continue;
          if (d < 1e-6) { const el = Math.hypot(V[b][0] - V[a][0], V[b][1] - V[a][1]) || 1; rx = -(V[b][1] - V[a][1]) / el; ry = (V[b][0] - V[a][0]) / el; d = 1; }
          // 目標：把 v 推離邊至距離 ε
          add(vId, ix + (rx / d) * epsilon, iy + (ry / d) * epsilon, w.C);
        }
      }
    }
    apply();
  }
}

/**
 * 貪婪最近鄰匹配收縮 → 粗圖。回傳 { graph, map(fine→coarse), coords0(粗圖錨點質心) }。
 */
function coarsen(graph, coords0) {
  const n = graph.nodes.length;
  const matched = new Array(n).fill(-1);
  let next = 0;
  // 依邊長由短到長配對未匹配端點。
  const eord = graph.edges
    .map((e) => ({ e, len: Math.hypot(coords0[e.v][0] - coords0[e.u][0], coords0[e.v][1] - coords0[e.u][1]) }))
    .sort((a, b) => a.len - b.len);
  for (const { e } of eord) {
    if (matched[e.u] === -1 && matched[e.v] === -1) { matched[e.u] = next; matched[e.v] = next; next++; }
  }
  for (let i = 0; i < n; i++) if (matched[i] === -1) { matched[i] = next++; }
  const m = next;
  // 粗圖節點/邊/incident
  const nodes = Array.from({ length: m }, (_, id) => ({ id }));
  const cnt = new Array(m).fill(0);
  const cc = Array.from({ length: m }, () => [0, 0]);
  for (let i = 0; i < n; i++) { const s = matched[i]; cc[s][0] += coords0[i][0]; cc[s][1] += coords0[i][1]; cnt[s]++; }
  for (let s = 0; s < m; s++) { cc[s][0] /= cnt[s] || 1; cc[s][1] /= cnt[s] || 1; }
  const seen = new Map();
  const edges = [];
  const incident = Array.from({ length: m }, () => []);
  for (const e of graph.edges) {
    const su = matched[e.u], sv = matched[e.v];
    if (su === sv) continue;
    const k = su < sv ? `${su}-${sv}` : `${sv}-${su}`;
    if (seen.has(k)) continue;
    seen.set(k, 1);
    const id = edges.length;
    edges.push({ id, u: su, v: sv });
    incident[su].push(id); incident[sv].push(id);
  }
  return { graph: { nodes, edges, incident }, map: matched, coords0: cc };
}

/**
 * 對 connect 圖跑 Wang & Chi (2011) 最小二乘變形法。回傳整數座標（nodeId→[x,y]）。
 */
export function runWangChi(graph, coords0, opts = {}) {
  const n = graph.nodes.length;
  const V = coords0.map((c) => [c[0], c[1]]);
  if (n <= 1) return V.map((c) => [Math.round(c[0]), Math.round(c[1])]);

  const D = opts.idealLen ?? medianEdgeLength(graph, coords0);
  const w = { L: opts.wL ?? 5, G: opts.wG ?? 0.05, M: opts.wM ?? 1, C: opts.wC ?? 2 };
  const wO = opts.wO ?? 10;
  const ph1 = opts.smoothIters ?? 200;
  const ph2 = opts.octIters ?? 200;
  const epsilon = opts.epsilon ?? D * 0.4; // §3.3 點—邊期望間距 ε

  // ---- coarse-to-fine（§3.4）：粗圖先解 → prolongate → 細圖解 ----
  if (n > 12 && opts.coarse !== false) {
    const { graph: cg, map, coords0: cc } = coarsen(graph, coords0);
    if (cg.nodes.length < n) {
      const Vc = cc.map((c) => [c[0], c[1]]);
      smoothPhase1(cg, Vc, cc, D, w, Math.max(40, ph1 >> 1), epsilon);
      // prolongate：細點 = 其超點解 + (細點地理 − 超點地理質心)
      for (let i = 0; i < n; i++) {
        const s = map[i];
        V[i][0] = Vc[s][0] + (coords0[i][0] - cc[s][0]);
        V[i][1] = Vc[s][1] + (coords0[i][1] - cc[s][1]);
      }
    }
  }

  // ---- Phase 1：細圖平滑變形 ----
  smoothPhase1(graph, V, coords0, D, w, ph1, epsilon);

  // ---- Phase 2：八方向化（Ω_o + Ω_g），沿用阻尼保嵌入 ----
  const wp2 = { L: 0, G: w.G, M: 0, C: 0 };
  // 用 smoothPhase1 的阻尼框架但目標換成 octilinear：以一個小包裝重用 apply 的交叉守護。
  const acc = V.map(() => [0, 0, 0]);
  const T = V.map(() => [0, 0]);
  const edges = graph.edges;
  const crossGuard = edges.length > 0 && edges.length <= 1000;
  const willCross = (alpha) => {
    for (let i = 0; i < n; i++) {
      T[i][0] = acc[i][2] > 1e-9 ? V[i][0] + alpha * (acc[i][0] / acc[i][2] - V[i][0]) : V[i][0];
      T[i][1] = acc[i][2] > 1e-9 ? V[i][1] + alpha * (acc[i][1] / acc[i][2] - V[i][1]) : V[i][1];
    }
    for (let a = 0; a < edges.length; a++) {
      const e1 = edges[a];
      for (let b = a + 1; b < edges.length; b++) {
        const e2 = edges[b];
        if (e1.u === e2.u || e1.u === e2.v || e1.v === e2.u || e1.v === e2.v) continue;
        if (segProperCross(V[e1.u][0], V[e1.u][1], V[e1.v][0], V[e1.v][1], V[e2.u][0], V[e2.u][1], V[e2.v][0], V[e2.v][1])) continue;
        if (segProperCross(T[e1.u][0], T[e1.u][1], T[e1.v][0], T[e1.v][1], T[e2.u][0], T[e2.u][1], T[e2.v][0], T[e2.v][1])) return true;
      }
    }
    return false;
  };
  void wp2;
  for (let it = 0; it < ph2; it++) {
    for (let i = 0; i < n; i++) { acc[i][0] = w.G * coords0[i][0]; acc[i][1] = w.G * coords0[i][1]; acc[i][2] = w.G; }
    for (const e of edges) {
      const i = e.u, j = e.v;
      const [ox, oy] = snapOctVec(V[i][0] - V[j][0], V[i][1] - V[j][1]);
      acc[i][0] += wO * (V[j][0] + ox); acc[i][1] += wO * (V[j][1] + oy); acc[i][2] += wO;
      acc[j][0] += wO * (V[i][0] - ox); acc[j][1] += wO * (V[i][1] - oy); acc[j][2] += wO;
    }
    if (!crossGuard) {
      for (let i = 0; i < n; i++) if (acc[i][2] > 1e-9) { V[i][0] = acc[i][0] / acc[i][2]; V[i][1] = acc[i][1] / acc[i][2]; }
    } else {
      let alpha = 1, done = false;
      for (let tries = 0; tries < 7 && !done; tries++) {
        if (!willCross(alpha)) { for (let i = 0; i < n; i++) { V[i][0] = T[i][0]; V[i][1] = T[i][1]; } done = true; }
        else alpha /= 2;
      }
    }
  }

  return V.map((c) => [Math.round(c[0]), Math.round(c[1])]);
}
