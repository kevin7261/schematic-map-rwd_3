/**
 * Bast, Brosi & Storandt (2020)「Metro Maps on Octilinear Grid Graphs」(EuroVis/CGF 39(3))
 * 之**快速近似演算法**（§4）核心（worker-safe）。
 *
 * 在 octilinear grid 圖 Γ 上,把每條輸入邊路由為「set-to-set 最短路」(可含多次彎折),
 * 已路由路徑作為障礙;依 line degree 排序邊;保拓樸(封鎖已用格點/格邊、對角交叉)。
 *   · 成本(§2.2, §6.1):hop c_h + 彎折 c_b(c180=0,c135=1,c90=1.5,c45=2;180°U-turn 禁止)
 *     + 對角線 +0.5 offset;端點移動懲罰 = ‖p(v)−ψ‖·(c_h+c_m), c_m=0.5。
 *   · 候選格點:輸入點幾何位置半徑 r=3D 內之格點;兩端皆未定時以 Voronoi 切分(§4.2)。
 *   · port/sink/bend 節點以「Dijkstra 狀態含入向 dir」等價表示(免顯式建圖)。
 * 度數2站於上游收縮、之後等距插回。各圖層各自輸出自己論文演算法之座標（不接 MILP）。
 *
 * 註:本檔為論文「近似演算法(無 local search 的 A-2 變體)」;§4.6 local search 未實作。
 */

const DIRS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const BEND = [0, 1, 1.5, 2, Infinity]; // 轉角 0/45/90/135/180°(U-turn 禁止)
const C_H = 0.5; // hop 成本(小;彎折為主)
const C_M = 0.5; // 移動懲罰
const DIAG_OFF = 0.5; // 對角線額外 offset
const R = 3; // 候選半徑(3D, D=1)

function octTurn(a, b) { const d = Math.abs(a - b) % 8; return Math.min(d, 8 - d); }
const isDiag = (di) => di % 2 === 1;

function medianEdgeLength(graph, coords) {
  const lens = [];
  for (const e of graph.edges) lens.push(Math.hypot(coords[e.v][0] - coords[e.u][0], coords[e.v][1] - coords[e.u][1]));
  if (!lens.length) return 4;
  lens.sort((a, b) => a - b);
  return Math.max(1, Math.round(lens[lens.length >> 1]));
}

/** 二元最小堆(以 cost)。 */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(c, x) { const a = this.a; a.push({ c, x }); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].c <= a[i].c) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].c < a[m].c) m = l; if (r < a.length && a[r].c < a[m].c) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top.x; }
}

/** §4.1 line-degree 邊排序(dangling-node BFS,鄰邊依鄰點 ldeg 降冪)。 */
function edgeOrder(graph, ldeg) {
  const n = graph.nodes.length;
  const processed = new Array(n).fill(false);
  const inDangling = new Array(n).fill(false);
  const order = [];
  const addedE = new Set();
  let remaining = n;
  while (remaining > 0) {
    // 取未處理且 ldeg 最高者起一個元件
    let seed = -1, sd = -1;
    for (let i = 0; i < n; i++) if (!processed[i] && ldeg[i] > sd) { sd = ldeg[i]; seed = i; }
    if (seed < 0) break;
    const dangling = [seed]; inDangling[seed] = true;
    while (dangling.length) {
      // 取 dangling 中 ldeg 最高者
      let bi = 0; for (let i = 1; i < dangling.length; i++) if (ldeg[dangling[i]] > ldeg[dangling[bi]]) bi = i;
      const vd = dangling.splice(bi, 1)[0];
      inDangling[vd] = false;
      if (processed[vd]) continue;
      processed[vd] = true; remaining--;
      const nbrs = graph.incident[vd].map((eid) => { const e = graph.edges[eid]; return { eid, u: e.u === vd ? e.v : e.u }; });
      nbrs.sort((a, b) => ldeg[b.u] - ldeg[a.u]);
      for (const { eid, u } of nbrs) {
        if (!addedE.has(eid)) { addedE.add(eid); order.push(eid); }
        if (!processed[u] && !inDangling[u]) { dangling.push(u); inDangling[u] = true; }
      }
    }
  }
  // 保險:未納入之邊補在後面
  for (const e of graph.edges) if (!addedE.has(e.id)) order.push(e.id);
  return order;
}

export function runBastGrid(graph, coords0, opts = {}) {
  const n = graph.nodes.length;
  if (n === 0) return { coords: [], edgePaths: {} };
  if (n === 1) return { coords: [[Math.round(coords0[0][0]), Math.round(coords0[0][1])]], edgePaths: {} };
  // edgePaths[edgeId] = 該邊在 grid 上的彎折路徑[[x,y]…](pos[u]→pos[v]);供管線以彎折幾何渲染。
  const edgePaths = {};

  const geo = coords0.map((c) => [Math.round(c[0]), Math.round(c[1])]);
  void (opts.idealLen ?? medianEdgeLength(graph, coords0));

  // line degree = 經過該節點之不同 route 數
  const routesPerNode = Array.from({ length: n }, () => new Set());
  for (const e of graph.edges) {
    if (e.isLink) continue;
    for (const rn of e.routes || new Set([e.route_name])) { routesPerNode[e.u].add(rn); routesPerNode[e.v].add(rn); }
  }
  const ldeg = routesPerNode.map((s) => s.size);

  const pos = new Array(n).fill(null);
  const blockedNode = new Set(); // 路徑內部格點(不可穿過/重用)
  const blockedEdge = new Set(); // 已用格邊(無向)
  const blockedDiag = new Set(); // 已用對角線(cell+type),防 X 交叉
  const nk = (x, y) => x + ',' + y;
  const ek = (x1, y1, x2, y2) => (x1 < x2 || (x1 === x2 && y1 <= y2)) ? `${x1},${y1}|${x2},${y2}` : `${x2},${y2}|${x1},${y1}`;
  const diagKey = (x, y, di) => { const [dx, dy] = DIRS[di]; const mnx = Math.min(x, x + dx), mny = Math.min(y, y + dy); return `${mnx},${mny},${dx * dy > 0 ? 'A' : 'B'}`; };
  const diagOpp = (x, y, di) => { const [dx, dy] = DIRS[di]; const mnx = Math.min(x, x + dx), mny = Math.min(y, y + dy); return `${mnx},${mny},${dx * dy > 0 ? 'B' : 'A'}`; };

  const cands = (id) => {
    if (pos[id]) return [{ x: pos[id][0], y: pos[id][1], pen: 0 }];
    const g = geo[id]; const out = [];
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
      const d2 = dx * dx + dy * dy; if (d2 > R * R) continue;
      const x = g[0] + dx, y = g[1] + dy;
      if (blockedNode.has(nk(x, y))) continue;
      out.push({ x, y, pen: Math.sqrt(d2) * (C_H + C_M) });
    }
    if (!out.length) out.push({ x: g[0], y: g[1], pen: 0 });
    return out;
  };

  const route = (S, T) => {
    // Voronoi 切分(兩端皆未定時,候選分給較近者)
    const tKey = new Set(T.map((t) => nk(t.x, t.y)));
    const tPen = new Map(); for (const t of T) { const k = nk(t.x, t.y); if (!tPen.has(k) || t.pen < tPen.get(k)) tPen.set(k, t.pen); }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of S.concat(T)) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const margin = Math.max(10, (maxX - minX) + (maxY - minY));
    minX -= margin; maxX += margin; minY -= margin; maxY += margin;
    const dist = new Map(), par = new Map();
    const heap = new Heap();
    for (const s of S) {
      if (tKey.has(nk(s.x, s.y))) continue; // s==t 退化跳過
      const k = `${s.x},${s.y},-1`;
      if (!dist.has(k) || s.pen < dist.get(k)) { dist.set(k, s.pen); par.set(k, null); heap.push(s.pen, { x: s.x, y: s.y, d: -1, k }); }
    }
    let best = null, bestCost = Infinity;
    while (heap.size) {
      const cur = heap.pop(); const g = dist.get(cur.k); if (g > bestCost) break;
      const tp = tPen.get(nk(cur.x, cur.y));
      if (tp != null && cur.d >= 0) { const tot = g + tp; if (tot < bestCost) { bestCost = tot; best = cur; } }
      for (let di = 0; di < 8; di++) {
        const nx = cur.x + DIRS[di][0], ny = cur.y + DIRS[di][1];
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        const goal = tKey.has(nk(nx, ny));
        if (blockedNode.has(nk(nx, ny)) && !goal) continue;
        if (blockedEdge.has(ek(cur.x, cur.y, nx, ny))) continue;
        if (isDiag(di) && blockedDiag.has(diagOpp(cur.x, cur.y, di))) continue;
        const b = cur.d < 0 ? 0 : BEND[octTurn(cur.d, di)];
        if (!isFinite(b)) continue;
        const ng = g + C_H + b + (isDiag(di) ? DIAG_OFF : 0);
        const k2 = `${nx},${ny},${di}`;
        if (!dist.has(k2) || ng < dist.get(k2)) { dist.set(k2, ng); par.set(k2, cur.k); heap.push(ng, { x: nx, y: ny, d: di, k: k2 }); }
      }
    }
    if (!best) return null;
    let k = best.k; const path = [];
    while (k != null) { const i = k.lastIndexOf(','); const xy = k.slice(0, i).split(','); path.push([+xy[0], +xy[1]]); k = par.get(k); }
    path.reverse();
    return path;
  };

  const blockPath = (path) => {
    for (let i = 0; i < path.length; i++) {
      if (i > 0 && i < path.length - 1) blockedNode.add(nk(path[i][0], path[i][1])); // 內部格點
      if (i > 0) {
        const [x1, y1] = path[i - 1], [x2, y2] = path[i];
        blockedEdge.add(ek(x1, y1, x2, y2));
        const dx = x2 - x1, dy = y2 - y1;
        if (dx !== 0 && dy !== 0) { // 對角:封鎖此對角(其交叉對角即被擋)
          let di = DIRS.findIndex(([a, b]) => a === Math.sign(dx) && b === Math.sign(dy));
          if (di >= 0) blockedDiag.add(diagKey(x1, y1, di));
        }
      }
    }
  };

  const order = edgeOrder(graph, ldeg);
  for (const eid of order) {
    const e = graph.edges[eid];
    if (e.isLink) continue;
    const u = e.u, v = e.v;
    let S = cands(u), T = cands(v);
    if (!pos[u] && !pos[v]) { // Voronoi 切分
      S = S.filter((p) => Math.hypot(p.x - geo[u][0], p.y - geo[u][1]) <= Math.hypot(p.x - geo[v][0], p.y - geo[v][1]));
      T = T.filter((p) => Math.hypot(p.x - geo[v][0], p.y - geo[v][1]) < Math.hypot(p.x - geo[u][0], p.y - geo[u][1]));
      if (!S.length) S = cands(u); if (!T.length) T = cands(v);
    }
    const path = route(S, T);
    if (!path || path.length < 2) {
      // fallback:直接放到幾何最近未占用格
      if (!pos[u]) { const c = cands(u)[0]; pos[u] = [c.x, c.y]; blockedNode.add(nk(c.x, c.y)); }
      if (!pos[v]) { const c = cands(v).find((p) => !blockedNode.has(nk(p.x, p.y))) || cands(v)[0]; pos[v] = [c.x, c.y]; blockedNode.add(nk(c.x, c.y)); }
      continue;
    }
    if (!pos[u]) pos[u] = path[0].slice();
    if (!pos[v]) pos[v] = path[path.length - 1].slice();
    edgePaths[eid] = path.map((p) => [p[0], p[1]]);
    blockPath(path);
  }

  for (let i = 0; i < n; i++) if (!pos[i]) pos[i] = [geo[i][0], geo[i][1]];
  return { coords: pos, edgePaths };
}
