/**
 * Merrick & Gudmundsson (2007)「Path Simplification for Metro Map Layout」(GD 2006, LNCS 4372)。
 *
 * §2 C-Directed Path Simplification：給路徑 P、方向集 C(octilinear 8 方向)、誤差 ε，
 *   求每段 link 平行某 c∈C、依序穿過每點 ε-圓、link 數最少的簡化 P′（頂點不限輸入點）。
 * §3 Metro Map Layout：路徑依「重要度(= 與其他路徑共用之節點數)」排序;最重要者先簡化並**固定**;
 *   後續路徑以固定節點為界切成子路徑、各自簡化(須穿過固定端點);重複。延伸:最大彎角 α、最小 link 長 l_min。
 *
 * ⚠️ 忠實度說明:論文把精確 minimum-link StabbingPath(boundary-path/O(|C|³n²)) 的關鍵資料結構
 *   推到參考文獻 [25](Merrick 碩論,本專案未取得)。本檔以**貪婪極大延伸**實作 §2 的問題本身——
 *   輸出**正確的** C-directed ε-stabbing 路徑(每段平行 8 方向、依序穿過 ε-圓、頂點自由),link 數
 *   為貪婪近似(非可證明最小)。固定兩端之子路徑以 octilinear 連接 + 等距重分布(§3 之 placement 選項)。
 *
 * 各圖層各自輸出自己論文演算法的座標（不接 MILP）。
 */

const OCT8 = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
// 8 方向之單位向量(對角線 /√2)
const OCTU = OCT8.map(([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; });

function angBetween(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}
function nearestDirIdx(dx, dy) {
  const ang = Math.atan2(dy, dx);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 8; i++) {
    const da = angBetween(ang, Math.atan2(OCT8[i][1], OCT8[i][0]));
    if (da < bestD) { bestD = da; best = i; }
  }
  return best;
}
/** 兩 8 方向索引之轉角(45° 單位):0=直、1=45°、2=90°、3=135°、4=180°。 */
function octTurn(a, b) { const d = Math.abs(a - b) % 8; return Math.min(d, 8 - d); }

function octiPath(A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return [A, B];
  const diag = Math.min(Math.abs(dx), Math.abs(dy));
  return [A, [A[0] + Math.sign(dx) * diag, A[1] + Math.sign(dy) * diag], B];
}
function alongPath(poly, t) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const target = t * total;
  for (let i = 1; i < poly.length; i++) {
    if (cum[i] >= target) {
      const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * f, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * f];
    }
  }
  return poly[poly.length - 1].slice();
}

function buildRouteChains(graph) {
  const byRoute = new Map();
  for (const e of graph.edges) {
    if (e.isLink) continue;
    for (const rn of e.routes || new Set([e.route_name])) {
      if (!byRoute.has(rn)) byRoute.set(rn, []);
      byRoute.get(rn).push(e);
    }
  }
  const chains = [];
  for (const [rn, edges] of byRoute) {
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.u)) adj.set(e.u, []);
      if (!adj.has(e.v)) adj.set(e.v, []);
      adj.get(e.u).push({ e, o: e.v });
      adj.get(e.v).push({ e, o: e.u });
    }
    const usedE = new Set();
    const starts = [...adj.keys()].filter((nn) => adj.get(nn).length === 1);
    const seeds = starts.length ? starts : [adj.keys().next().value];
    for (const seed of seeds) {
      let cur = seed; const seq = [cur]; let moved = true;
      while (moved) {
        moved = false;
        for (const { e, o } of adj.get(cur) || []) {
          if (usedE.has(e.id)) continue;
          usedE.add(e.id); seq.push(o); cur = o; moved = true; break;
        }
      }
      if (seq.length >= 2) chains.push({ rn, seq });
    }
    for (const e of edges) if (!usedE.has(e.id)) { usedE.add(e.id); chains.push({ rn, seq: [e.u, e.v] }); }
  }
  return chains;
}

function medianEdgeLength(graph, coords) {
  const lens = [];
  for (const e of graph.edges) lens.push(Math.hypot(coords[e.v][0] - coords[e.u][0], coords[e.v][1] - coords[e.u][1]));
  if (!lens.length) return 4;
  lens.sort((a, b) => a - b);
  return Math.max(2, lens[lens.length >> 1]);
}

/** 方向 di 之單一 link 自 pts[i] 起，依序 ε-stab 之最大終點 e 與可行垂距區間 [lo,hi]。 */
function maxStab(pts, i, di, eps) {
  const u = OCTU[di], n = [-u[1], u[0]];
  const perp = (p) => p[0] * n[0] + p[1] * n[1];
  const along = (p) => p[0] * u[0] + p[1] * u[1];
  let lo = perp(pts[i]) - eps, hi = perp(pts[i]) + eps;
  let prevA = along(pts[i]); let e = i;
  for (let k = i + 1; k < pts.length; k++) {
    const a = along(pts[k]); const pk = perp(pts[k]);
    if (a < prevA - 1e-9) break; // 沿方向需單調(依序)
    const nlo = Math.max(lo, pk - eps), nhi = Math.min(hi, pk + eps);
    if (nlo > nhi + 1e-9) break; // 無法在 ε 內穿過
    lo = nlo; hi = nhi; prevA = a; e = k;
  }
  return { e, lo, hi };
}

/** 兩 octilinear 線(方向 u,垂距 b)之交點。 */
function lineInt(u1, b1, u2, b2) {
  const n1 = [-u1[1], u1[0]], n2 = [-u2[1], u2[0]];
  const det = n1[0] * n2[1] - n1[1] * n2[0];
  if (Math.abs(det) < 1e-9) return null;
  return [(b1 * n2[1] - b2 * n1[1]) / det, (n1[0] * b2 - n2[0] * b1) / det];
}

/**
 * 自由段(可選固定起點)之 C-directed ε-stabbing 簡化。回傳每個輸入點之新座標。
 * @param {Array<[number,number]>} pts 子路徑地理點
 * @param {number} eps 誤差
 * @param {number} maxBendRad 最大彎角
 * @param {[number,number]|null} startFixed 固定起點座標(null=自由)
 * @returns {Array<[number,number]>} 與 pts 等長之座標
 */
function cDirectedSimplify(pts, eps, maxBendRad, startFixed) {
  const m = pts.length;
  if (m === 1) return [startFixed ? startFixed.slice() : pts[0].slice()];
  // 貪婪極大延伸求 links
  const links = [];
  let i = 0, prevDir = -1;
  while (i < m - 1) {
    let best = null;
    for (let di = 0; di < 8; di++) {
      if (prevDir >= 0 && (octTurn(prevDir, di) * Math.PI) / 4 > maxBendRad + 1e-9) continue;
      const r = maxStab(pts, i, di, eps);
      if (r.e <= i) continue;
      // 偏離度：方向 di 與「實際弦 pts[i]→pts[e]」之夾角(平手時取最貼近真實走向者,避免垂直段被水平線壓掉)。
      const chordAng = Math.atan2(pts[r.e][1] - pts[i][1], pts[r.e][0] - pts[i][0]);
      const devi = angBetween(chordAng, Math.atan2(OCT8[di][1], OCT8[di][0]));
      if (!best || r.e > best.e || (r.e === best.e && devi < best.devi)) {
        best = { dirIdx: di, s: i, e: r.e, lo: r.lo, hi: r.hi, devi };
      }
    }
    if (!best) { // 受 α 限或退化 → 強制單步取最近方向
      const di = nearestDirIdx(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const r = maxStab(pts, i, di, eps);
      best = { dirIdx: di, s: i, e: Math.max(i + 1, r.e), lo: r.lo, hi: r.hi };
    }
    links.push(best); i = best.e; prevDir = best.dirIdx;
  }
  const M = links.length;
  const us = links.map((l) => OCTU[l.dirIdx]);
  const nOf = (u) => [-u[1], u[0]];
  const perpOf = (p, u) => { const n = nOf(u); return p[0] * n[0] + p[1] * n[1]; };
  const projOf = (p, u, b) => { const n = nOf(u); const a = p[0] * u[0] + p[1] * u[1]; return [a * u[0] + b * n[0], a * u[1] + b * n[1]]; };

  // 選各 link 垂距 b、求轉折頂點 v[0..M]
  const b = new Array(M);
  const v = new Array(M + 1);
  b[0] = startFixed ? perpOf(startFixed, us[0]) : Math.min(Math.max(perpOf(pts[0], us[0]), links[0].lo), links[0].hi);
  v[0] = startFixed ? startFixed.slice() : projOf(pts[0], us[0], b[0]);
  for (let t = 1; t < M; t++) {
    const idx = links[t].s; // 轉折處對應之輸入點索引
    b[t] = Math.min(Math.max(perpOf(pts[idx], us[t]), links[t].lo), links[t].hi);
    const x = lineInt(us[t - 1], b[t - 1], us[t], b[t]);
    v[t] = x || projOf(pts[idx], us[t - 1], b[t - 1]);
  }
  v[M] = projOf(pts[m - 1], us[M - 1], b[M - 1]);

  // 放置每個輸入點
  const out = new Array(m);
  out[0] = v[0];
  for (let t = 0; t < M; t++) {
    for (let k = links[t].s + 1; k <= links[t].e; k++) {
      if (k === m - 1) out[k] = v[M];
      else if (k === links[t].e) out[k] = v[t + 1]; // 轉折頂點
      else out[k] = projOf(pts[k], us[t], b[t]); // link 內部:垂直投影
    }
  }
  return out;
}

/**
 * 對 connect 圖跑 Merrick & Gudmundsson (2007) 路徑簡化。回傳整數座標（nodeId→[x,y]）。
 * @param {object} graph
 * @param {Array<[number,number]>} coords0
 * @param {{epsilon?:number, maxBendDeg?:number}} [opts]
 */
export function runMerrick(graph, coords0, opts = {}) {
  const n = graph.nodes.length;
  const coords = coords0.map((c) => [Math.round(c[0]), Math.round(c[1])]);
  if (n <= 1) return coords;

  const chains = buildRouteChains(graph);
  const eps = opts.epsilon ?? Math.max(1, medianEdgeLength(graph, coords0) * 0.15); // 誤差門檻 ε(小容差)
  const maxBendRad = ((opts.maxBendDeg ?? 180) * Math.PI) / 180; // 最大彎角 α

  // 重要度（§3）：節點被幾條**不同 route** 經過(>1=交會)；importance=交會節點數。重要者先放並固定。
  const routesPerNode = Array.from({ length: n }, () => new Set());
  for (const ch of chains) for (const nid of ch.seq) routesPerNode[nid].add(ch.rn);
  const importance = (ch) => ch.seq.reduce((s, nid) => s + (routesPerNode[nid].size > 1 ? 1 : 0), 0);
  chains.sort((a, b2) => importance(b2) - importance(a) || b2.seq.length - a.seq.length);

  const placed = new Array(n).fill(false);
  const put = (nid, x, y) => { coords[nid] = [Math.round(x), Math.round(y)]; placed[nid] = true; };

  // 自由段(可固定起點)：C-directed 簡化 → 放置(已置放點維持)。
  const placeFreeRun = (idxSeq, startFixed) => {
    const pts = idxSeq.map((nid) => coords0[nid]);
    const start = startFixed ? coords[idxSeq[0]].slice() : null;
    const res = cDirectedSimplify(pts, eps, maxBendRad, start);
    for (let i = 0; i < idxSeq.length; i++) {
      const nid = idxSeq[i];
      if (placed[nid]) continue;
      put(nid, res[i][0], res[i][1]);
    }
  };
  // 兩固定端點間(§3 placement)：octilinear 折線 + 等距重分布(穿過兩固定端點)。
  const fillBetween = (seq, a, b2) => {
    const A = coords[seq[a]].slice(), B = coords[seq[b2]].slice();
    const poly = octiPath(A, B);
    for (let i = a + 1; i < b2; i++) {
      const nid = seq[i];
      if (placed[nid]) continue;
      const p = alongPath(poly, (i - a) / (b2 - a));
      put(nid, p[0], p[1]);
    }
  };

  for (const ch of chains) {
    const seq = ch.seq;
    const anchors = [];
    for (let i = 0; i < seq.length; i++) if (placed[seq[i]]) anchors.push(i);

    if (anchors.length === 0) { placeFreeRun(seq, false); continue; }
    const a0 = anchors[0];
    if (a0 > 0) placeFreeRun(seq.slice(0, a0 + 1).reverse(), true); // 首 anchor 前(反向,固定起點)
    for (let t = 0; t + 1 < anchors.length; t++) fillBetween(seq, anchors[t], anchors[t + 1]); // anchor 間
    const aN = anchors[anchors.length - 1];
    if (aN < seq.length - 1) placeFreeRun(seq.slice(aN), true); // 末 anchor 後(正向,固定起點)
  }

  for (let i = 0; i < n; i++) if (!placed[i]) put(i, coords[i][0], coords[i][1]);
  return coords;
}
