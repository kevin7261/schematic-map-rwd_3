/* eslint-disable no-console */

/**
 * ⑧ Fuchs (TU Wien 2022)「SAT-based Optimization of Octolinear Metro Map Layouts」之忠實實作。
 *
 * 這是 Nöllenburg & Wolff (2011) MILP 的 SAT 對應版（論文 Ch.3 將 MILP 直譯為 CNF）。
 * 本檔忠實實作論文的 **SAT 模型**：
 *   §3.3.1  方向 α + 最小段長（每邊 exactly-one of S(u,v)，|S|=3，dev=1）          → (11.1)–(11.7)
 *   §3.3.2  組合嵌入 / 旋轉系統（deg>2 用 β 標記環繞缺口、方向遞增；deg=2 兩邊異向）   → (12.x)/(13.1)
 *   §3.3.3  平面性 / 邊間距 γ（非相鄰同面邊對之八方向分離）—**惰性**加入（同 [NW10]）   → (14)–(16)
 *   §3.4    MaxSAT 目標：彎折 θ(§3.4.1) + 相對位置 ξ(§3.4.2) + 邊長 λ(§3.4.3) 之加權軟子句  → (26)–(28)
 *
 * 唯一務實取捨（論文 §3.1/§7/§8 自己點出且允許的等價替換）：
 *   整數以 logic-solver 的 **二進位位元向量** 表示，取代論文 §3.1 的 **一元(unary)** 編碼。
 *   兩者對 a≤b、a=b·g、a+b+g=c 等約束**語意完全等價**；改用二進位是因論文一元在
 *   z₁=x+y、z₃=y−x 這類三變數等式會產生 O(x_max²) 子句／節點 → 直接灌爆瀏覽器（§8 明載）。
 *   方向/彎折/相對位置這些「小整數(≤3)」之軟成本則仍以一元位元呈現（即論文 (26.1)/(27.1)/(28.1) 的 ¬aⁱ），
 *   既忠實又便宜。SAT 求解器：logic-solver（純 JS MiniSat，minimizeWeightedSum 做 weighted partial MaxSAT）。
 *
 * ⚠️ 可解性（論文 Table 5.3 自身數據）：此法比 ③ MILP 更慢；論文用編譯級 Glucose3+RC2（Xeon 叢集、
 *    10h 上限）在 49–70 節點時**完全無解**，44 節點需 2.4–3.9h。純 JS 又慢 10–100×。故瀏覽器端僅
 *    ~25 節點(蒙特婁等級)以下骨架有機會；大城市會誠實逾時（由主執行緒 wall-clock 終止 worker）。
 */

import Logic from 'logic-solver';
import { computeRotationSystem } from '../graph.js';
import { findCrossingPairs, findNodeOnForeignEdgePairs } from '../objective.js';

const NDIR = 8;
const TWO_PI = Math.PI * 2;

const C = (n) => Logic.constantBits(n);
const le = (a, b) => Logic.lessThanOrEqual(a, b);
const eq = (a, b) => Logic.equalBits(a, b);
const sum = (...a) => Logic.sum(...a);
const mod8 = (i) => ((i % NDIR) + NDIR) % NDIR;

/** 由初值座標算邊 (u→v) 之最近八方向 sector（論文 §2.2 的 sec_u(v)，常數）。 */
function sectorOf(graph, u, v) {
  const a = graph.nodes[u], b = graph.nodes[v];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return mod8(Math.round(ang / (TWO_PI / NDIR)));
}

/** 允許方向集 S(u,v) = {sec-1, sec, sec+1}（dev=1，論文 §2.2）。 */
function allowedDirs(sec) {
  return [mod8(sec - 1), sec, mod8(sec + 1)];
}

/** 環狀八方向差 ∈0..4（θ 的 circular distance，論文 §3.4.1）。 */
function circDiff(i, j) {
  const d = Math.abs(i - j) % NDIR;
  return Math.min(d, NDIR - d);
}

/**
 * α_i ⇒「邊 (u→v) 沿方向 i」之幾何硬約束（論文 (11.5)–(11.7) 的座標版）。
 * 以 modified L∞ 度量的四軸座標表示：z0=x(水平)、z2=y(垂直)、對角用 x±y 之和等式（避免負數/減法）。
 *  i=0 E / 4 W：y 相等；i=2 N / 6 S：x 相等；
 *  i=1 NE / 5 SW：x_v+y_u = x_u+y_v（即 x−y 相等）；i=3 NW / 7 SE：x_u+y_u = x_v+y_v（即 x+y 相等）。
 * 沿軸方向再加 ≥ Lmin 之最小段長。
 */
function dirGeom(i, X, Y, u, v, Lmin) {
  const xu = X[u], yu = Y[u], xv = X[v], yv = Y[v];
  const L = C(Lmin);
  switch (i) {
    case 0: return Logic.and(eq(yu, yv), le(sum(xu, L), xv)); // E
    case 1: return Logic.and(eq(sum(xv, yu), sum(xu, yv)), le(sum(xu, L), xv)); // NE
    case 2: return Logic.and(eq(xu, xv), le(sum(yu, L), yv)); // N
    case 3: return Logic.and(eq(sum(xu, yu), sum(xv, yv)), le(sum(yu, L), yv)); // NW
    case 4: return Logic.and(eq(yu, yv), le(sum(xv, L), xu)); // W
    case 5: return Logic.and(eq(sum(xv, yu), sum(xu, yv)), le(sum(xv, L), xu)); // SW
    case 6: return Logic.and(eq(xu, xv), le(sum(yv, L), yu)); // S
    case 7: return Logic.and(eq(sum(xu, yu), sum(xv, yv)), le(sum(xv, L), xu)); // SE
    default: return Logic.TRUE;
  }
}

/** 沿軸 (axis%4) 之座標可比較量：0→x、1→x+y、2→y、3→y+x... 實作用 sum 避免負數。
 *  「a 在軸 ax 上 ≤ b（差 ≥ dmin）」之布林（論文 (15)/(16) 分離約束）。 */
function axisLE(ax, X, Y, a, b, dmin) {
  const d = C(dmin);
  switch (ax % 4) {
    case 0: return le(sum(X[a], d), X[b]); // z0 = x
    case 1: return le(sum(X[a], Y[a], d), sum(X[b], Y[b])); // z1 = x+y
    case 2: return le(sum(Y[a], d), Y[b]); // z2 = y
    case 3: return le(sum(Y[a], X[b], d), sum(Y[b], X[a])); // z3 = y-x ⇔ y_a+x_b ≤ y_b+x_a
    default: return Logic.TRUE;
  }
}

/** 非相鄰邊對 (e,e') 之八方向分離（論文 (14.1)/(15)/(16)）：∃方向 d，e 全體 ≤ e' 全體（或反向）。 */
function separationClause(X, Y, e, ep, dmin) {
  const { u, v } = e, up = ep.u, vp = ep.v;
  const clauses = [];
  for (let ax = 0; ax < 4; ax++) {
    // γ_ax：e 在較小側
    clauses.push(Logic.and(
      axisLE(ax, X, Y, u, up, dmin), axisLE(ax, X, Y, u, vp, dmin),
      axisLE(ax, X, Y, v, up, dmin), axisLE(ax, X, Y, v, vp, dmin),
    ));
    // γ_{ax+4}：e' 在較小側
    clauses.push(Logic.and(
      axisLE(ax, X, Y, up, u, dmin), axisLE(ax, X, Y, up, v, dmin),
      axisLE(ax, X, Y, vp, u, dmin), axisLE(ax, X, Y, vp, v, dmin),
    ));
  }
  return Logic.or(clauses);
}

/**
 * 主求解。
 * @param {object} graph splitHighDegreeNodes 後之圖（nodes 帶初值 x/y、edges{u,v}、incident）
 * @param {Array<[number,number]>} coords0 初值座標（決定 sector 與初始嵌入；本檔僅用 graph.nodes 的 x/y）
 * @param {object} opts { weights:{f1,f2,f3}, Lmin, dmin, dev, xmax, maxPlanarIter, optimize, onProgress }
 * @returns {{ ok, coords?, status?, message?, h4Pairs? }}
 */
export function runSat(graph, coords0, opts = {}) {
  const report = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const f1 = opts.weights?.f1 ?? 1; // 彎折
  const f2 = opts.weights?.f2 ?? 1; // 相對位置
  const f3 = opts.weights?.f3 ?? 1; // 邊長
  const Lmin = opts.Lmin ?? 1;
  const dmin = opts.dmin ?? 1;
  const optimize = opts.optimize !== false;
  const MAX_PLANAR = opts.maxPlanarIter ?? 6;

  const { nodes, edges, incident } = graph;
  const N = nodes.length;
  if (N === 0) return { ok: false, message: 'SAT：空圖' };

  // 格網上界 x_max=y_max（論文 §3.2 自由參數）：取足以容納佈局之最小值，越小子句越少。
  let xmax = Math.max(8, opts.xmax ?? N);
  const bitsFor = (m) => Math.max(1, Math.ceil(Math.log2(m + 1)));

  // sector / 允許方向（常數，建一次）。
  const sec = edges.map((e) => sectorOf(graph, e.u, e.v)); // sec_u(v)
  const S = edges.map((e, i) => allowedDirs(sec[i]));

  const rot = computeRotationSystem(graph); // 各節點入射邊依初值角度排序（輸入嵌入）

  /** 建一次完整 solver（除惰性平面性外之所有硬約束 + 目標定義變數）。 */
  function buildSolver(curXmax) {
    const nb = bitsFor(curXmax);
    const solver = new Logic.Solver();
    const X = nodes.map((_, i) => Logic.variableBits(`x${i}`, nb));
    const Y = nodes.map((_, i) => Logic.variableBits(`y${i}`, nb));
    for (let i = 0; i < N; i++) {
      solver.require(le(X[i], C(curXmax)));
      solver.require(le(Y[i], C(curXmax)));
    }

    // 每邊 α：exactly-one of S；α_i ⇒ 幾何（11.x）。同時記 outDir(node,edge)。
    const alpha = edges.map(() => ({})); // edgeId -> { dir(i): term }
    const outDir = new Map(); // `${nodeId}_${edgeId}` -> variableBits(3)（自 node 出發之方向 0..7）
    const ensureOut = (n, eid) => {
      const k = `${n}_${eid}`;
      let b = outDir.get(k);
      if (!b) { b = Logic.variableBits(`d_${k}`, 3); outDir.set(k, b); }
      return b;
    };
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      const dirs = S[ei];
      const aTerms = [];
      const dU = (incident[e.u]?.length ?? 0) >= 2 ? ensureOut(e.u, ei) : null;
      const dV = (incident[e.v]?.length ?? 0) >= 2 ? ensureOut(e.v, ei) : null;
      for (const i of dirs) {
        const a = `a_${ei}_${i}`;
        alpha[ei][i] = a;
        aTerms.push(a);
        solver.require(Logic.implies(a, dirGeom(i, X, Y, e.u, e.v, Lmin))); // (11.5)-(11.7)
        if (dU) solver.require(Logic.implies(a, eq(dU, C(i)))); // outDir(u)=i
        if (dV) solver.require(Logic.implies(a, eq(dV, C(mod8(i + 4))))); // outDir(v)=i+4
      }
      solver.require(Logic.exactlyOne(aTerms)); // (11.1)+(11.2)
    }

    // 旋轉系統 / 嵌入：deg>2 用 β（環繞缺口 + 方向遞增）；deg=2 兩邊異向。
    for (let n = 0; n < N; n++) {
      const inc = rot[n];
      const d = inc.length;
      if (d <= 1) continue;
      if (d === 2) {
        // (13.1)：兩入射邊自 n 出發不可同向（否則重疊）。
        const d1 = ensureOut(n, inc[0]);
        const d2 = ensureOut(n, inc[1]);
        solver.require(Logic.not(eq(d1, d2)));
        continue;
      }
      // (12.x)：依輸入環序，除單一缺口外方向嚴格遞增。
      const beta = inc.map((_, k) => `b_${n}_${k}`);
      solver.require(Logic.exactlyOne(beta)); // (12.1)+(12.2)
      for (let k = 0; k < d; k++) {
        const cur = ensureOut(n, inc[k]);
        const nxt = ensureOut(n, inc[(k + 1) % d]);
        // β_k ∨ (dir_k + 1 ≤ dir_{k+1})
        solver.require(Logic.or(beta[k], le(sum(cur, C(1)), nxt))); // (12.3)/(12.4)
      }
    }

    // 終端邊固定最短（論文 (24.1)）：|dx|≤Lmin 且 |dy|≤Lmin（配合 H3≥Lmin → 恰 Lmin）。
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      const term = (incident[e.u]?.length ?? 0) === 1 || (incident[e.v]?.length ?? 0) === 1;
      if (!term) continue;
      const L = C(Lmin);
      solver.require(le(X[e.v], sum(X[e.u], L)));
      solver.require(le(X[e.u], sum(X[e.v], L)));
      solver.require(le(Y[e.v], sum(Y[e.u], L)));
      solver.require(le(Y[e.u], sum(Y[e.v], L)));
    }

    // ---- 目標（MaxSAT 軟成本布林；minimizeWeightedSum 會盡量使其為 false）----
    const costTerms = [];
    const weights = [];
    const addCost = (term, w) => { if (term && w > 0) { costTerms.push(term); weights.push(w); } };

    // ξ 相對位置（§3.4.2）：dev=1 → 偏離 sector 即成本（選了非中心方向）。
    if (optimize && f2 > 0) {
      for (let ei = 0; ei < edges.length; ei++) {
        const offCenter = S[ei].filter((i) => i !== sec[ei]).map((i) => alpha[ei][i]).filter(Boolean);
        if (offCenter.length) addCost(Logic.or(offCenter), f2);
      }
    }

    // θ 線彎折（§3.4.1）：每節點上「同一路線」兩入射邊之夾角偏離直線(180°)即成本，權重 θ·f1。
    if (optimize && f1 > 0) {
      for (let n = 0; n < N; n++) {
        const inc = incident[n];
        if (inc.length < 2) continue;
        // 依 route 將入射邊分組
        const byRoute = new Map();
        for (const ei of inc) {
          const routes = edges[ei].routes || new Set([edges[ei].route_name]);
          for (const r of routes) {
            if (!r) continue;
            if (!byRoute.has(r)) byRoute.set(r, []);
            byRoute.get(r).push(ei);
          }
        }
        const seen = new Set();
        for (const list of byRoute.values()) {
          for (let p = 0; p < list.length; p++) {
            for (let q = p + 1; q < list.length; q++) {
              const e1 = list[p], e2 = list[q];
              const key = e1 < e2 ? `${e1}-${e2}` : `${e2}-${e1}`;
              if (seen.has(key)) continue;
              seen.add(key);
              // 列舉兩邊自 n 出發之方向組合 → 彎折 θ = 4 - circDiff（180°=直線→0）。
              for (const i1 of S[e1]) {
                const j1 = edges[e1].u === n ? i1 : mod8(i1 + 4);
                const a1 = alpha[e1][i1];
                if (!a1) continue;
                for (const i2 of S[e2]) {
                  const j2 = edges[e2].u === n ? i2 : mod8(i2 + 4);
                  const a2 = alpha[e2][i2];
                  if (!a2) continue;
                  const theta = NDIR / 2 - circDiff(j1, j2); // 4 - dist ∈ 0..3（dist=4 直線）
                  if (theta > 0) addCost(Logic.and(a1, a2), theta * f1);
                }
              }
            }
          }
        }
      }
    }

    // λ 邊長（§3.4.3）：非終端邊，長度超過 Lmin 之 4 格窗（Lmin+1..Lmin+4）逐格成本 f3（論文截斷窗=4）。
    if (optimize && f3 > 0) {
      for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        if ((incident[e.u]?.length ?? 0) === 1 || (incident[e.v]?.length ?? 0) === 1) continue;
        for (let k = 1; k <= 4; k++) {
          const m = C(Lmin + k);
          // 長度 ≥ Lmin+k ⇔ |dx|≥m 或 |dy|≥m（八方向邊長 = L∞）
          const lenGE = Logic.or(
            le(sum(X[e.u], m), X[e.v]), le(sum(X[e.v], m), X[e.u]),
            le(sum(Y[e.u], m), Y[e.v]), le(sum(Y[e.v], m), Y[e.u]),
          );
          addCost(lenGE, f3);
        }
      }
    }

    return { solver, X, Y, costTerms, weights };
  }

  function decode(sol, X, Y) {
    return nodes.map((_, i) => [sol.evaluate(X[i]), sol.evaluate(Y[i])]);
  }

  // logic-solver 內建 minisat 為 asm.js 固定記憶體 → 太大時 enlargeMemory abort()（會 throw）。
  // 故全程 try/catch：分兩階段——①先求「可行八方向+平面+保拓樸」解（便宜），②再盡力 MaxSAT 最佳化。
  // 記憶體不足時保留階段①的可行解（仍滿足論文所有硬約束），最佳化標示為未完成；完全放不下才誠實失敗。
  const MEM_MSG = '此骨架對瀏覽器端 SAT 求解器過大（minisat 記憶體不足）。請改用較小城市,或用 ③ MILP / ⑥ Octilinear Grid。';

  // ---- 階段①：可行解 + 惰性平面性（cutting-plane，同 MILP；只用 solve()，不掛目標）----
  let built, baseSol;
  try {
    built = buildSolver(xmax);
    baseSol = built.solver.solve();
    if (!baseSol && xmax < N * 3) {
      xmax = Math.min(N * 3, xmax * 2 + 4);
      report(`SAT：格網不足，放大至 ${xmax} 重建…`);
      built = buildSolver(xmax);
      baseSol = built.solver.solve();
    }
  } catch (e) {
    console.warn('[SAT] 建模/可行求解記憶體不足', e?.message || e);
    return { ok: false, message: MEM_MSG };
  }
  if (!baseSol) return { ok: false, message: 'SAT 不可行（UNSAT，可能格網/嵌入過緊）' };

  const { solver, X, Y, costTerms, weights } = built;
  const seenPairs = new Set();
  let added = 0;

  const pushSep = (ai, bi) => {
    const a = edges[ai], b = edges[bi];
    if (!a || !b) return false;
    if (a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v) return false; // 相鄰不分離
    const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
    if (seenPairs.has(key)) return false;
    seenPairs.add(key);
    solver.require(separationClause(X, Y, a, b, dmin));
    added++;
    return true;
  };
  /** 對一組座標偵測違規並惰性加入分離；回傳新增數。 */
  const addViolations = (cur) => {
    let n = 0;
    for (const [ai, bi] of findCrossingPairs(graph, cur)) if (pushSep(ai, bi)) n++;
    for (const [incE, foreignE] of findNodeOnForeignEdgePairs(graph, cur)) if (pushSep(incE, foreignE)) n++;
    return n;
  };
  const badCount = (cur) =>
    findCrossingPairs(graph, cur).length + findNodeOnForeignEdgePairs(graph, cur).length;

  let feasibleCoords = decode(baseSol, X, Y);
  try {
    for (let iter = 0; iter < MAX_PLANAR; iter++) {
      report(`SAT 求可行解（八方向+消交叉）第 ${iter + 1} 輪…`);
      const cur = decode(baseSol, X, Y);
      feasibleCoords = cur;
      const bad = badCount(cur);
      console.log(`[SAT] 可行 iter ${iter}: 違規=${bad} 分離對=${added}`);
      if (bad === 0 || iter === MAX_PLANAR - 1) break;
      if (addViolations(cur) === 0) break;
      baseSol = solver.solve();
      if (!baseSol) break; // 加分離後不可行 → 用目前可行解
    }
  } catch (e) {
    console.warn('[SAT] 可行階段記憶體不足，回傳目前可行解', e?.message || e);
    // 保留最後 feasibleCoords；若連第一個解都沒有則失敗。
    if (!feasibleCoords) return { ok: false, message: MEM_MSG };
  }

  // ---- 階段②：盡力 MaxSAT 最佳化（彎折/相對位置/邊長）。記憶體不足 → 保留階段①可行解 ----
  let coords = feasibleCoords;
  let optimized = false;
  if (optimize && costTerms.length && baseSol) {
    try {
      report('SAT 最佳化（彎折/相對位置/邊長）…');
      let opt = solver.minimizeWeightedSum(baseSol, costTerms, weights);
      for (let oi = 0; oi < 3; oi++) {
        const cur = decode(opt, X, Y);
        if (badCount(cur) === 0) { coords = cur; optimized = true; break; }
        // 最佳化可能引入新交叉 → 補分離再最佳化（有限次）；否則保留階段①平面可行解。
        if (addViolations(cur) === 0) break;
        const re = solver.solve();
        if (!re) break;
        opt = solver.minimizeWeightedSum(re, costTerms, weights);
      }
    } catch (e) {
      console.warn('[SAT] 最佳化記憶體不足，保留可行解', e?.message || e);
    }
  }

  if (!coords) return { ok: false, message: MEM_MSG };

  // ---- 拓撲保證（硬契約）：絕不輸出仍含交叉/重疊之佈局 ----
  // 階段① 的惰性平面性可能因 maxPlanarIter 用盡、或加分離後 UNSAT（格網/嵌入過緊）而提早 break，
  // 此時 feasibleCoords 仍殘留交叉或「站壓在他線上」的重疊 → 渲染出的拓撲已與輸入不同。
  // 依論文忠實度與本專案原則：寧可誠實「未產出」，也絕不冒充一張拓撲被改變的地圖。
  const residual = badCount(coords);
  if (residual > 0) {
    const cr = findCrossingPairs(graph, coords).length;
    const ov = findNodeOnForeignEdgePairs(graph, coords).length;
    return {
      ok: false,
      status: 'sat-topology-broken',
      message:
        `SAT 無法在目前格網/嵌入下消除全部交叉與重疊（殘留 交叉 ${cr}、線壓站 ${ov}），` +
        `若輸出將改變拓撲結構。依忠實度要求不輸出被改變拓撲的地圖——請改用較小城市，或 ③ MILP / ⑥ Octilinear Grid。`,
    };
  }
  return { ok: true, coords, status: optimized ? 'sat' : 'sat-feasible', h4Pairs: added, optimized };
}
