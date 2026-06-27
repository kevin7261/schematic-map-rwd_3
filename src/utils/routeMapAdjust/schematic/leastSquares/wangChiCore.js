/**
 * Wang & Chi (2011)「Focus+Context Metro Maps」（IEEE TVCG 17(12):2528–2535）
 * 之 §3「Metro map deformation」最小二乘變形法核心（worker-safe：不依賴 dataStore）。
 *
 * 論文把示意圖特性寫成能量項，於最小二乘意義下求最佳節點位置（Gauss-Newton：交替解 V′ 與更新旋轉 R）。
 * 本檔忠實實作其「佈局」部分（不含 focus+context 放大與標籤），以 Jacobi 疊代最小化同一組二次能量
 * （等價於論文的 (AᵀA)⁻¹Aᵀb 最小二乘解，免外部線代庫）：
 *
 *  Phase 1 平滑變形（§3.1）：
 *   · Ω_ℓ 規則邊長（式 1）：‖(v′ᵢ−v′ⱼ) − s·Rᵢⱼ(vᵢ−vⱼ)‖²，s=D/|vᵢ−vⱼ|；Gauss-Newton 下 Rᵢⱼ 把原邊轉到
 *     現邊方向 → 穩態等於「把每條邊拉成長度 D、保持現方向」。
 *   · Ω_m 入射邊均分夾角（式 2–3）：節點 vᵢ 之各對鄰邊夾角趨於 θ=2π/f（f=度數）；f=2 退化為
 *     v′ᵢ=½(v′ⱼ+v′ₖ)（共線、直線穿過）。
 *   · Ω_g 位置錨（式 4）：‖v′ᵢ−vᵢ‖² 弱拉回地理原位（避免整體飄移/旋轉）。
 *  Phase 2 八方向化（§3.2）：
 *   · Ω_o（式 6）：把每條邊轉到最近 octilinear 方向 ‖(ṽᵢ−ṽⱼ)−f(v′ᵢ−v′ⱼ)‖²，配 Ω_g 求解。
 *
 * **保平面嵌入（§3.3）**：每回合 Jacobi 更新採阻尼套用——若整步會讓原本不相交的邊對交叉
 *   （破壞嵌入 → 點相對位置翻面、結構被改變），就把步長 α 連續減半直到不新增交叉，
 *   都不行則該回合不動。這是論文避免「把北邊站擺到南邊」的關鍵機制；缺它時純 Jacobi 會
 *   落入「完全八方向卻翻轉/旋轉子結構」的局部極小（直線化後相對位置錯誤）。
 *
 * 權重 w_ℓ=5, w_g=0.05, w_o=10（論文 §3.4）。本專案邊長均一（非 focus+context 的 Dα>Dβ）。
 * 僅作為精確八方向引擎之「方向偏好」初值（computePreferredDirs 取其方向）。
 */

const QUARTER = Math.PI / 4;

/** 把邊向量 (dx,dy) 轉到最近 octilinear 方向、保持長度（式 6 的 f）。 */
function snapOctVec(dx, dy) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return [0, 0];
  const ang = Math.round(Math.atan2(dy, dx) / QUARTER) * QUARTER;
  return [Math.cos(ang) * d, Math.sin(ang) * d];
}

/** 兩線段是否「真正相交」（不含共端點、不含共線退化）— 用於保平面嵌入。 */
function segProperCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = o(ax, ay, bx, by, cx, cy);
  const o2 = o(ax, ay, bx, by, dx, dy);
  const o3 = o(cx, cy, dx, dy, ax, ay);
  const o4 = o(cx, cy, dx, dy, bx, by);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

/** 邊長中位數（理想邊長 D 基準，至少 2 避免塌縮）。 */
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

/**
 * 對 connect 圖節點座標跑 Wang & Chi (2011) 最小二乘變形法。
 * @param {object} graph buildSchematicGraph / splitHighDegreeNodes 結果（nodes/edges/incident）
 * @param {Array<[number,number]>} coords0 地理初值座標（nodeId→[x,y]，亦為 Ω_g 之錨點 vᵢ）
 * @param {object} [opts] 可調參數
 * @returns {Array<[number,number]>} 佈局後整數座標（nodeId→[x,y]）
 */
export function runWangChi(graph, coords0, opts = {}) {
  const n = graph.nodes.length;
  const V = coords0.map((c) => [c[0], c[1]]); // 變形中的 v′
  if (n <= 1) return V.map((c) => [Math.round(c[0]), Math.round(c[1])]);

  const V0 = coords0; // 原始地理位置（Ω_g 錨點）
  const edges = graph.edges;
  const incident = graph.incident;
  const D = opts.idealLen ?? medianEdgeLength(graph, coords0); // 目標邊長

  const wL = opts.wL ?? 5; // Ω_ℓ
  const wG = opts.wG ?? 0.05; // Ω_g
  const wM = opts.wM ?? 1; // Ω_m
  const wO = opts.wO ?? 10; // Ω_o
  const ph1 = opts.smoothIters ?? 200;
  const ph2 = opts.octIters ?? 200;

  // 每點累積「目標位置 × 權重」與「權重和」→ Jacobi：v′ᵢ ← Σ(w·target)/Σw（最小化二次能量）。
  const acc = V.map(() => [0, 0, 0]);
  const reset = () => {
    for (let i = 0; i < n; i++) {
      acc[i][0] = 0;
      acc[i][1] = 0;
      acc[i][2] = 0;
    }
  };
  const add = (i, tx, ty, w) => {
    acc[i][0] += tx * w;
    acc[i][1] += ty * w;
    acc[i][2] += w;
  };
  // 阻尼套用（論文 §3.3）：先算各點 Jacobi 目標 T，再沿 (T−V) 走步長 α；
  // 若整步會使「原本不相交」的非相鄰邊對產生交叉（= 破壞平面嵌入 → 點相對位置翻面），
  // 就把 α 連續減半直到不新增交叉；都不行則 α=0（該回合不動），嚴格保住嵌入。
  // 這正是論文用來「避免邊相交、不把北邊站擺到南邊」的機制（Eq.4 位置錨 + §3.3 阻尼）。
  const T = V.map(() => [0, 0]);
  // 邊太多時放棄交叉檢查（O(E²)），退回直接套用，避免極端網路過慢。
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
        if (e1.u === e2.u || e1.u === e2.v || e1.v === e2.u || e1.v === e2.v) continue; // 相鄰邊不算
        // 只在乎「現在不交、走完會交」的新增交叉（既有地理交叉如立體交會不強拆）。
        const wasCross = segProperCross(
          V[e1.u][0],
          V[e1.u][1],
          V[e1.v][0],
          V[e1.v][1],
          V[e2.u][0],
          V[e2.u][1],
          V[e2.v][0],
          V[e2.v][1]
        );
        if (wasCross) continue;
        const willCross = segProperCross(
          T[e1.u][0],
          T[e1.u][1],
          T[e1.v][0],
          T[e1.v][1],
          T[e2.u][0],
          T[e2.u][1],
          T[e2.v][0],
          T[e2.v][1]
        );
        if (willCross) return true;
      }
    }
    return false;
  };
  const apply = () => {
    if (!crossGuard) {
      for (let i = 0; i < n; i++) {
        if (acc[i][2] > 1e-9) {
          V[i][0] = acc[i][0] / acc[i][2];
          V[i][1] = acc[i][1] / acc[i][2];
        }
      }
      return;
    }
    let alpha = 1;
    for (let tries = 0; tries < 7; tries++) {
      if (!introducesCross(alpha)) {
        for (let i = 0; i < n; i++) {
          V[i][0] = T[i][0];
          V[i][1] = T[i][1];
        }
        return;
      }
      alpha /= 2;
    }
    // 都會新增交叉 → α=0：本回合不動（嚴格保住平面嵌入）。
  };

  // ---- Phase 1：平滑變形（Ω_ℓ + Ω_m + Ω_g）----
  for (let it = 0; it < ph1; it++) {
    reset();
    // Ω_g 位置錨
    for (let i = 0; i < n; i++) add(i, V0[i][0], V0[i][1], wG);
    // Ω_ℓ 規則邊長（Gauss-Newton 穩態：長度 D、保持現方向）
    for (const e of edges) {
      const i = e.u;
      const j = e.v;
      let dx = V[i][0] - V[j][0];
      let dy = V[i][1] - V[j][1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      add(i, V[j][0] + dx * D, V[j][1] + dy * D, wL);
      add(j, V[i][0] - dx * D, V[i][1] - dy * D, wL);
    }
    // Ω_m 入射邊均分夾角 / 直線穿過
    for (let i = 0; i < n; i++) {
      const inc = incident[i];
      const f = inc.length;
      if (f < 2) continue;
      const theta = (2 * Math.PI) / f; // 均分全角
      const tanHalf = Math.tan((Math.PI - theta) / 2); // 等腰三角頂點高度因子（f=2 → 0 → 共線）
      for (let a = 0; a < inc.length; a++) {
        for (let b = a + 1; b < inc.length; b++) {
          const ej = edges[inc[a]];
          const ek = edges[inc[b]];
          const jId = ej.u === i ? ej.v : ej.u;
          const kId = ek.u === i ? ek.v : ek.u;
          const jx = V[jId][0];
          const jy = V[jId][1];
          const kx = V[kId][0];
          const ky = V[kId][1];
          const mx = (jx + kx) / 2; // 底邊中點 = v′ⱼ + u′ⱼₖ
          const my = (jy + ky) / 2;
          const ujx = (kx - jx) / 2; // 底邊半向量 u′ⱼₖ
          const ujy = (ky - jy) / 2;
          const baseHalf = Math.hypot(ujx, ujy);
          // 底邊的垂直單位向量，取朝向目前 v′ᵢ 那一側
          let px = -ujy;
          let py = ujx;
          const pl = Math.hypot(px, py) || 1;
          px /= pl;
          py /= pl;
          if ((V[i][0] - mx) * px + (V[i][1] - my) * py < 0) {
            px = -px;
            py = -py;
          }
          const h = baseHalf * tanHalf; // 頂點高度
          add(i, mx + px * h, my + py * h, wM);
        }
      }
    }
    apply();
  }

  // ---- Phase 2：八方向化（Ω_o + Ω_g）----
  for (let it = 0; it < ph2; it++) {
    reset();
    for (let i = 0; i < n; i++) add(i, V0[i][0], V0[i][1], wG);
    for (const e of edges) {
      const i = e.u;
      const j = e.v;
      const [ox, oy] = snapOctVec(V[i][0] - V[j][0], V[i][1] - V[j][1]);
      add(i, V[j][0] + ox, V[j][1] + oy, wO);
      add(j, V[i][0] - ox, V[i][1] - oy, wO);
    }
    apply();
  }

  return V.map((c) => [Math.round(c[0]), Math.round(c[1])]);
}
