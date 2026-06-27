/**
 * Nöllenburg & Wolff (2011)「Drawing High-Quality Metro Maps by MIP」**octilinear** MILP，
 * 依論文 §4 公式實作，輸出 CPLEX LP 供 HiGHS 求解。
 *
 * 方向 k（sector，CCW）：0=E 1=NE 2=N 3=NW 4=W 5=SW 6=S 7=SE；opp=(k+4)%8。
 *
 * 硬約束：
 *  (H1)&(H3) §4.2：每邊限「最近 3 個 octilinear 方向(orig,prec,succ)」之一；對應方向之座標一致(big-M)＋最小段長 ℓ。
 *  (H2)      §4.3：保持節點周圍鄰邊之環狀順序（外向方向沿 rotation order 嚴格遞增、僅一處換圈 Σβ=1）。
 *  (H4)      §4.4：每對「非相鄰邊」至少一個 octilinear 方向相隔 d_min（防交叉/重疊→防塌縮）。
 *            依論文 §5.2 以**惰性約束**加入：只對「目前解中相交的邊對」加 H4，迭代重解。opts.h4Pairs 提供這些邊對。
 *
 * 軟約束(目標)：
 *  (S1) 線彎折：同線相鄰段於節點趨向直線穿過（外向方向相反）。
 *  (S2) 相對位置：未用最近方向(orig)則計 1。
 *  (S3) 總長：Σλ_e（λ_e≥|ΔX|,|ΔY| 之 L∞ 長上界）。
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
 *   h4Pairs?:Array<[number,number]>, fixDirs?:object, integerCoords?:boolean, sepPairs?:Array<[number,number]> }} [opts]
 *
 * 兩階段求解支援：
 *  - fixDirs: { [edgeId]: k } 把每邊方向釘死（第二階段用），消去方向自由度。
 *  - integerCoords: true 時 X/Y/L 宣告為整數（第二階段，得精確八方向整數座標）。
 *  - sepPairs: [[a,b],…] 對「座標重合之節點對」加分離約束（≥1 格），惰性加入。
 */
export function buildMilpModel(graph, opts = {}) {
  const { nodes, edges, incident } = graph;
  const V = nodes.length;
  const Lmin = opts.Lmin ?? 2;
  const dMin = opts.dMin ?? 1;
  // COORDMAX 越小 → big-M 越緊 → LP 鬆弛越緊、MIP 越快找到可行整數解（過小則放不下會 infeasible）。
  // 中心錨定下 V*2 足夠容納緊湊 octilinear 佈局，且 big-M 較 V*4 緊一半 → 求解快很多。
  const COORDMAX = opts.coordMax ?? Math.max(40, V * 2);
  const M = 2 * COORDMAX + 10;
  const wBend = opts.wBend ?? 5;
  const wRpos = opts.wRpos ?? 3; // (S2) 相對位置：放寬方向後靠它把邊拉回原始方位、防塌縮
  const wLen = opts.wLen ?? 0.3;
  const h4Pairs = opts.h4Pairs || [];
  const fixDirs = opts.fixDirs || null;
  const sepPairs = opts.sepPairs || [];
  const integerCoords = !!opts.integerCoords;
  // 各論文「方向偏好」：S2 相對位置軟成本拉向此方向（不動硬約束/嵌入 → 穩定可解）。
  const preferredDirs = opts.preferredDirs || null;

  const rot = computeRotationSystem(graph);
  const routePairs = buildSameRouteEdgePairsAtNodes(graph);

  const obj = [];
  const cons = [];
  const bin = [];
  const boundsExtra = [];
  let ci = 0;

  // ---- (H1)&(H3) 每邊：方向唯一(限 3 方向) + 座標一致 + 最小段長；(S2) 相對位置 ----
  for (const e of edges) {
    const ang0 = Math.atan2(nodes[e.v].y - nodes[e.u].y, nodes[e.v].x - nodes[e.u].x);
    let k0 = Math.round(ang0 / (TWO_PI / NDIR));
    k0 = ((k0 % NDIR) + NDIR) % NDIR;
    // 論文 §4.2「限最近數方向」：D 越小 → 二元變數越少、MIP 越輕（瀏覽器單執行緒可解）。
    // 但過緊會與 H2 環序在高度數節點衝突致 infeasible → D 隨節點度數自動放寬。
    const deg = Math.max(incident[e.u].length, incident[e.v].length);
    const D = opts.dirWidth != null ? Math.max(opts.dirWidth, deg >= 5 ? 3 : opts.dirWidth) : NDIR;
    const allowed = [];
    for (let k = 0; k < NDIR; k++) {
      let diff = Math.abs(k - k0);
      diff = Math.min(diff, NDIR - diff);
      if (diff <= D) allowed.push(k);
      else cons.push(`c${ci++}: dir_${e.id}_${k} = 0`);
    }
    let sum = '';
    for (let k = 0; k < NDIR; k++) sum += term(1, `dir_${e.id}_${k}`);
    cons.push(`c${ci++}:${sum} = 1`);
    // 第二階段：方向釘死
    if (fixDirs && fixDirs[e.id] != null) cons.push(`c${ci++}: dir_${e.id}_${fixDirs[e.id]} = 1`);
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
    // (S2) 相對位置：未用偏好方向則計 1 → 最大化 dir_e_kPref（kPref 預設為地理最近方向 k0）
    const kPref = preferredDirs && preferredDirs[e.id] != null ? preferredDirs[e.id] : k0;
    if (!e.isLink) obj.push(term(-wRpos, `dir_${e.id}_${kPref}`));
  }

  // ---- (H2) 每節點：保持環狀邊序（外向方向）----
  // 第二階段方向已釘死時可略過 H2（環序由釘死方向隱含；保留反而可能因微小排序差致 infeasible）。
  if (!opts.skipH2) for (let n = 0; n < V; n++) {
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

  // ---- (S1) line straightness：直線穿過 = 該節點兩邊外向方向相反 ----
  let pidx = 0;
  for (const pr of routePairs) {
    const v = pr.node;
    const e1 = edges[pr.e1];
    const e2 = edges[pr.e2];
    for (let k = 0; k < NDIR; k++) {
      const i1 = e1.u === v ? k : (k + 4) % NDIR;
      const i2 = e2.u === v ? (k + 4) % NDIR : k;
      const b = `b_${pidx}_${k}`;
      cons.push(`c${ci++}:${term(1, b)}${term(-1, `dir_${e1.id}_${i1}`)} <= 0`);
      cons.push(`c${ci++}:${term(1, b)}${term(-1, `dir_${e2.id}_${i2}`)} <= 0`);
      boundsExtra.push(`0 <= ${b} <= 1`);
      obj.push(term(-wBend, b));
    }
    pidx++;
  }

  // ---- (H4) 邊間距：對「目前相交之非相鄰邊對」加分離約束（惰性，§5.2）----
  let gpi = 0;
  for (const [a, bId] of h4Pairs) {
    const e1 = edges[a];
    const e2 = edges[bId];
    if (!e1 || !e2) continue;
    let gsum = '';
    for (let k = 0; k < NDIR; k++) {
      const [cx, cy] = DIRV[k];
      const g = `g_${gpi}_${k}`;
      // e2 在 -(cx,cy) 側、e1 在 +(cx,cy) 側，相隔 d_min：p(e2端) - p(e1端) <= M(1-g) - d_min
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

  // ---- 節點分離（防座標重合）：對重合節點對加「至少一座標相差 ≥1」----
  let spi = 0;
  for (const [a, b] of sepPairs) {
    if (a === b) continue;
    let ssum = '';
    // 4 方向：±X、±Y 各相差 ≥1
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let oi = 0; oi < dirs.length; oi++) {
      const [cx, cy] = dirs[oi];
      const s = `sep_${spi}_${oi}`;
      // cx(Xa-Xb)+cy(Ya-Yb) >= 1 - M(1-s)
      cons.push(
        `c${ci++}:${projTerms(cx, cy, a, 1)}${projTerms(cx, cy, b, -1)}${term(M, s)} <= ${fmt(M - 1)}`
      );
      bin.push(s);
      ssum += term(1, s);
    }
    cons.push(`c${ci++}:${ssum} >= 1`);
    spi++;
  }

  // ---- (S3) 總長 ----
  for (const e of edges) obj.push(term(wLen, `L_${e.id}`));

  // ---- bounds ----
  // 錨定 node 0 於座標空間中心以去除平移自由度（不依地理座標 → 可用較小 COORDMAX、較緊 big-M、MIP 更快）。
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

  // 第二階段：座標與段長宣告為整數 → 精確八方向整數佈局
  const generals = [];
  if (integerCoords) {
    for (const n of nodes) generals.push(`X_${n.id}`, `Y_${n.id}`);
    for (const e of edges) generals.push(`L_${e.id}`);
  }

  const lp = [
    '\\ Nollenburg-Wolff MIP (octilinear, H1-H4 + S1-S3)',
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
