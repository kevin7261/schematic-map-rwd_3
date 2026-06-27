/**
 * Nöllenburg & Wolff (2011)「Drawing and Labeling High-Quality Metro Maps by
 * Mixed-Integer Programming」(IEEE TVCG 17(5)) 之 octilinear MILP，依論文 §4 公式實作，
 * 輸出 CPLEX LP 供 HiGHS 求解。本檔為**忠實單次求解**模型（不做兩階段釘死方向）。
 *
 * 方向 k（sector，CCW）：0=E 1=NE 2=N 3=NW 4=W 5=SW 6=S 7=SE；opp=(k+4)%8。
 *
 * 硬約束：
 *  (H1)&(H3) §4.2 Eq.1–3：每邊限「最近 3 個 octilinear 方向 {prec,orig,succ}」之一（論文模型，
 *            預設 dirWidth=1 → 3 方向）；對應方向之座標一致(big-M)＋最小段長 ℓ。
 *  (H2)      §4.3 Eq.4–5：保持節點周圍鄰邊之環狀順序（外向方向沿 rotation order 嚴格遞增、僅一處換圈）。
 *  (H4)      §4.4 Eq.6–7：每對「非相鄰邊」至少一個 octilinear 方向相隔 d_min。
 *            依 §5.2 以**惰性約束**加入（cutting-plane）：只對「目前解中相交/壓線/重合」的邊對加 H4，迭代重解。
 *
 * 軟約束(目標，§4.8 Eq.15)：
 *  (S1) §4.5 Eq.8–10 漸進式彎折成本：bd(u,v,w)=4−min(Δ,8−Δ)∈{0,1,2,3}（0=直線穿過、越銳越貴）。
 *  (S2) §4.6 Eq.11–12 相對位置：未用最近(輸入)方向則計成本。
 *  (S3) §4.7 Eq.13–14 總長：Σ L_e（L∞ 段長）。
 */

import { computeRotationSystem, buildSameRouteEdgePairsAtNodes } from '../graph.js';

const NDIR = 8;
const TWO_PI = Math.PI * 2;
const DIRV = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function fmt(n) {
  return (Math.round(n * 1e6) / 1e6).toString();
}
function term(coef, name) {
  if (coef === 0) return '';
  return `${coef >= 0 ? ' + ' : ' - '}${fmt(Math.abs(coef))} ${name}`;
}
/** 「從 nodeId 往外」方向數線性項；e.u 端=k、e.v 端=(k+4)%8；可乘 sign。 */
function outDnumTerms(nodeId, e, sign) {
  let s = '';
  for (let k = 0; k < NDIR; k++) {
    const d = e.u === nodeId ? k : (k + 4) % NDIR;
    s += term(sign * d, `dir_${e.id}_${k}`);
  }
  return s;
}

/** p_dir(node)=cx·X+cy·Y 的線性項（H4 分離投影）。 */
function projTerms(cx, cy, nodeId, sign) {
  return `${term(sign * cx, `X_${nodeId}`)}${term(sign * cy, `Y_${nodeId}`)}`;
}

/**
 * @param {object} graph
 * @param {{ Lmin?:number, dMin?:number, wBend?:number, wRpos?:number, wLen?:number,
 *   dirWidth?:number, h4Pairs?:Array<[number,number]>, integerCoords?:boolean, preferredDirs?:object }} [opts]
 */
export function buildMilpModel(graph, opts = {}) {
  const { nodes, edges, incident } = graph;
  const V = nodes.length;
  const Lmin = opts.Lmin ?? 2;
  const dMin = opts.dMin ?? 1;
  const COORDMAX = opts.coordMax ?? Math.max(40, V * 2);
  const M = 2 * COORDMAX + 10;
  const wBend = opts.wBend ?? 1.5;
  const wRpos = opts.wRpos ?? 1.5;
  const wLen = opts.wLen ?? 0.1;
  const h4Pairs = opts.h4Pairs || [];
  const integerCoords = !!opts.integerCoords;
  // §4.2 Eq.1：每邊限最近 3 方向（dirWidth=1 → diff≤1 → {prec,orig,succ}）。論文模型即此。
  const dirWidth = opts.dirWidth ?? 1;
  // 各論文「方向偏好」：S2 相對位置軟成本拉向此方向（不動硬約束）。
  const preferredDirs = opts.preferredDirs || null;

  const rot = computeRotationSystem(graph);
  const routePairs = buildSameRouteEdgePairsAtNodes(graph);

  const obj = [];
  const cons = [];
  const bin = [];
  const boundsExtra = [];
  let ci = 0;

  // ---- (H1)&(H3) 每邊：限 3 方向 + 座標一致 + 最小段長；(S2) 相對位置 ----
  const allowedByEdge = {};
  for (const e of edges) {
    const ang0 = Math.atan2(nodes[e.v].y - nodes[e.u].y, nodes[e.v].x - nodes[e.u].x);
    let k0 = Math.round(ang0 / (TWO_PI / NDIR));
    k0 = ((k0 % NDIR) + NDIR) % NDIR;
    const allowed = [];
    for (let k = 0; k < NDIR; k++) {
      let diff = Math.abs(k - k0);
      diff = Math.min(diff, NDIR - diff);
      if (diff <= dirWidth) allowed.push(k);
      else cons.push(`c${ci++}: dir_${e.id}_${k} = 0`);
    }
    allowedByEdge[e.id] = allowed;
    let sum = '';
    for (let k = 0; k < NDIR; k++) sum += term(1, `dir_${e.id}_${k}`);
    cons.push(`c${ci++}:${sum} = 1`);
    for (const k of allowed) {
      const [cx, cy] = DIRV[k];
      const d = `dir_${e.id}_${k}`;
      const xb = `${term(1, `X_${e.v}`)}${term(-1, `X_${e.u}`)}${term(-cx, `L_${e.id}`)}`;
      cons.push(`c${ci++}:${xb}${term(M, d)} <= ${fmt(M)}`);
      cons.push(`c${ci++}:${xb}${term(-M, d)} >= ${fmt(-M)}`);
      const yb = `${term(1, `Y_${e.v}`)}${term(-1, `Y_${e.u}`)}${term(-cy, `L_${e.id}`)}`;
      cons.push(`c${ci++}:${yb}${term(M, d)} <= ${fmt(M)}`);
      cons.push(`c${ci++}:${yb}${term(-M, d)} >= ${fmt(-M)}`);
    }
    for (let k = 0; k < NDIR; k++) bin.push(`dir_${e.id}_${k}`);
    boundsExtra.push(`${fmt(Lmin)} <= L_${e.id} <= ${fmt(COORDMAX)}`);
    // (S2) §4.6：未用偏好方向(預設=地理最近 k0)則計成本 → 最大化 dir_e_kPref。
    const kPref = preferredDirs && preferredDirs[e.id] != null ? preferredDirs[e.id] : k0;
    if (!e.isLink) obj.push(term(-wRpos, `dir_${e.id}_${kPref}`));
  }

  // ---- (H2) 每節點：保持環狀邊序（外向方向）----
  for (let n = 0; n < V; n++) {
    const R = rot[n];
    const m = R.length;
    if (m < 2) continue;
    let wsum = '';
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const w = `w_${n}_${i}`;
      cons.push(`c${ci++}: ${outDnumTerms(n, edges[R[j]], 1)}${outDnumTerms(n, edges[R[i]], -1)}${term(NDIR, w)} >= 1`);
      bin.push(w);
      wsum += term(1, w);
    }
    cons.push(`c${ci++}:${wsum} = 1`);
  }

  // ---- (S1) §4.5 Eq.8–10：漸進式彎折成本 ----
  // 同線相鄰段 (e1,e2) 於節點 v：依其外向方向組合 (out1,out2) 計 bd=4−min(Δ,8−Δ)，Δ=(out2−out1) mod 8。
  // 直線穿過(out2=opp(out1)) → bd=0；45°→1；90°→2；135°→3。以 z 變數選取實際組合並計成本。
  let pidx = 0;
  for (const pr of routePairs) {
    const v = pr.node;
    const e1 = edges[pr.e1];
    const e2 = edges[pr.e2];
    const a1 = allowedByEdge[e1.id] || [];
    const a2 = allowedByEdge[e2.id] || [];
    let zsum = '';
    for (const k1 of a1) {
      const out1 = e1.u === v ? k1 : (k1 + 4) % NDIR;
      for (const k2 of a2) {
        const out2 = e2.u === v ? k2 : (k2 + 4) % NDIR;
        const delta = (out2 - out1 + NDIR) % NDIR;
        const bd = 4 - Math.min(delta, NDIR - delta); // 0..4（0=直線穿過）
        const z = `z_${pidx}_${k1}_${k2}`;
        // z 僅當 e1 取 k1 且 e2 取 k2 時可為 1；Σz=1 → 恰選實際組合。
        cons.push(`c${ci++}:${term(1, z)}${term(-1, `dir_${e1.id}_${k1}`)} <= 0`);
        cons.push(`c${ci++}:${term(1, z)}${term(-1, `dir_${e2.id}_${k2}`)} <= 0`);
        boundsExtra.push(`0 <= ${z} <= 1`);
        if (bd > 0) obj.push(term(wBend * bd, z)); // 懲罰彎折（越銳越貴）
        zsum += term(1, z);
      }
    }
    if (zsum) cons.push(`c${ci++}:${zsum} = 1`);
    pidx++;
  }

  // ---- (H4) §4.4 + §5.2 惰性：對「目前相交/壓線/重合之非相鄰邊對」加分離約束（≥ d_min）----
  let gpi = 0;
  for (const [a, bId] of h4Pairs) {
    const e1 = edges[a];
    const e2 = edges[bId];
    if (!e1 || !e2) continue;
    let gsum = '';
    for (let k = 0; k < NDIR; k++) {
      const [cx, cy] = DIRV[k];
      const g = `g_${gpi}_${k}`;
      for (const n2 of [e2.u, e2.v]) {
        for (const n1 of [e1.u, e1.v]) {
          cons.push(
            `c${ci++}:${projTerms(cx, cy, n2, 1)}${projTerms(cx, cy, n1, -1)}${term(M, g)} <= ${fmt(M - dMin)}`
          );
        }
      }
      bin.push(g);
      gsum += term(1, g);
    }
    cons.push(`c${ci++}:${gsum} >= 1`);
    gpi++;
  }

  // ---- (S3) §4.7 總長 ----
  for (const e of edges) obj.push(term(wLen, `L_${e.id}`));

  // ---- bounds ----
  // 錨定 node 0 於座標空間中心以去除平移自由度（不依地理座標 → 較緊 big-M、MIP 更快）。
  const ax = Math.round(COORDMAX / 2);
  const ay = Math.round(COORDMAX / 2);
  const bounds = [];
  for (const n of nodes) {
    if (n.id === 0) {
      bounds.push(`X_0 = ${fmt(ax)}`);
      bounds.push(`Y_0 = ${fmt(ay)}`);
    } else {
      bounds.push(`0 <= X_${n.id} <= ${fmt(COORDMAX)}`);
      bounds.push(`0 <= Y_${n.id} <= ${fmt(COORDMAX)}`);
    }
  }
  bounds.push(...boundsExtra);

  // 整數座標：得精確八方向整數佈局（NW11 §4.2 註：octilinear 解落於格點）。
  const generals = [];
  if (integerCoords) {
    for (const n of nodes) generals.push(`X_${n.id}`, `Y_${n.id}`);
    for (const e of edges) generals.push(`L_${e.id}`);
  }

  const lp = [
    '\\ Nollenburg-Wolff 2011 MIP (octilinear, H1-H4 + S1-S3, single-solve, lazy H4)',
    'Minimize',
    ` obj:${obj.join('') || ' 0'}`,
    'Subject To',
    ...cons.map((c) => ` ${c}`),
    'Bounds',
    ...bounds.map((b) => ` ${b}`),
    ...(generals.length ? ['General', ...generals.map((v) => ` ${v}`)] : []),
    'Binary',
    ...bin.map((b) => ` ${b}`),
    'End',
    '',
  ].join('\n');

  let maxDeg = 0;
  for (const inc of incident) if (inc.length > maxDeg) maxDeg = inc.length;

  return {
    lp,
    routePairs,
    meta: {
      directions: NDIR,
      nodeCount: V,
      edgeCount: edges.length,
      binaryCount: bin.length,
      constraintCount: cons.length,
      h4PairCount: h4Pairs.length,
      maxDegree: maxDeg,
      M,
      Lmin,
    },
  };
}
