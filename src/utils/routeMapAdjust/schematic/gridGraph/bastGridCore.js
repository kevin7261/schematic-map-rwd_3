/**
 * Bast, Brosi & Storandt (2020)「Metro Maps on Octilinear Grid Graphs」(EuroVis / CGF 39(3))
 * 之**快速近似演算法**核心（worker-safe：不依賴 dataStore）。
 *
 * 論文方法：在一張「octilinear 格網圖 Γ」上找各輸入站的格點 ψ(v)，邊則為格點間的最短路徑；
 *   近似解不解 ILP，改以「依序貪婪地在格網圖上算最短路」放置——每條邊從已定端點的格點，
 *   路由到另一端點之候選格點集合（取幾何位置附近的格點），成本 = 移動懲罰（離幾何位置距離）
 *   + 彎折懲罰（c135=1, c90=1.5, c45=2，越銳越貴）；已用格點/扇區封鎖以保拓樸（不新增交叉、保環序）。
 *   度數 2 站先收縮、最後等距插回。
 *
 * 本檔對應其近似演算法、輸出**連通節點的格點座標**（黑站已於上游收縮，之後沿邊等距插回）：
 *  · 格網 = 整數格；8 方向 octilinear。
 *  · 邊處理順序：自「線度數最高」節點 BFS（論文 §「edge ordering」）。
 *  · 每條邊 (u 已放, v 未放)：在 8 方向 × 各步長中，選讓 v 落在「離其幾何位置最近且未被占用」之格點、
 *    且在 u 處彎折成本最小者（論文：候選格點 + sink 邊距離懲罰 + 彎折懲罰之最短路）。
 *  · 占用格點封鎖（一格一站）→ 近似拓撲保持。
 *
 * 各圖層各自輸出自己論文演算法的座標（不接 MILP）。
 */

const DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** 兩 octilinear 方向索引間的彎折成本（論文 c135=1, c90=1.5, c45=2；直走=0）。 */
function bendCost(dirA, dirB) {
  if (dirA == null) return 0; // 起點：無前一段
  let d = Math.abs(dirA - dirB);
  d = Math.min(d, 8 - d); // 轉角（單位 45°）：0..4
  return [0, 1, 1.5, 2, 2.5][d];
}

/** 邊長中位數（步長尺度基準，至少 1）。 */
function medianEdgeLength(graph, coords) {
  const lens = [];
  for (const e of graph.edges) {
    const a = coords[e.u];
    const b = coords[e.v];
    lens.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  if (!lens.length) return 4;
  lens.sort((a, b) => a - b);
  return Math.max(1, Math.round(lens[lens.length >> 1]));
}

/** 線度數（入射邊數）最高的節點當 BFS 起點。 */
function pickRoot(graph) {
  let best = 0;
  let bestDeg = -1;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = graph.incident[i].length;
    if (d > bestDeg) {
      bestDeg = d;
      best = i;
    }
  }
  return best;
}

/**
 * 對 connect 圖節點座標跑 Bast et al. (2020) 近似（octilinear 格網最短路放置）。
 * @param {object} graph buildSchematicGraph / splitHighDegreeNodes 結果（nodes/edges/incident）
 * @param {Array<[number,number]>} coords0 地理初值座標（nodeId→[x,y]，已縮放整數格＝幾何目標）
 * @param {object} [opts] 可調參數
 * @returns {Array<[number,number]>} 佈局後整數格點座標（nodeId→[x,y]）
 */
export function runBastGrid(graph, coords0, opts = {}) {
  const n = graph.nodes.length;
  if (n === 0) return [];
  if (n === 1) return [[Math.round(coords0[0][0]), Math.round(coords0[0][1])]];

  const geo = coords0.map((c) => [Math.round(c[0]), Math.round(c[1])]); // 幾何目標格點
  const L = opts.idealLen ?? medianEdgeLength(graph, coords0);
  const wMove = opts.wMove ?? 1; // 移動懲罰（離幾何位置距離）
  const wBend = opts.wBend ?? 2.0 * L; // 彎折懲罰（× 邊長尺度，使與距離可比）
  const maxSpan = opts.maxSpan ?? 4; // 每方向以幾何投影步長 ±maxSpan 找空格

  const pos = new Array(n).fill(null);
  const inDir = new Array(n).fill(null); // 進入各節點的方向索引（算彎折用）
  const occupied = new Set();
  const occ = (x, y) => occupied.has(x + ',' + y);
  const setPos = (i, x, y, dir) => {
    pos[i] = [x, y];
    inDir[i] = dir;
    occupied.add(x + ',' + y);
  };
  /** 找離 (gx,gy) 最近的未占用整數格（環狀外擴）。 */
  const nearestFree = (gx, gy) => {
    if (!occ(gx, gy)) return [gx, gy];
    for (let r = 1; r < 500; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!occ(gx + dx, gy + dy)) return [gx + dx, gy + dy];
        }
      }
    }
    return [gx, gy];
  };

  // BFS 邊處理順序：自線度數最高節點。
  const root = pickRoot(graph);
  const [rx, ry] = nearestFree(geo[root][0], geo[root][1]);
  setPos(root, rx, ry, null);

  const queue = [root];
  let qh = 0;
  while (qh < queue.length) {
    const u = queue[qh++];
    for (const eid of graph.incident[u]) {
      const e = graph.edges[eid];
      const v = e.u === u ? e.v : e.u;
      if (pos[v] != null) continue; // 已放（兩端皆已放的邊：直邊渲染，容許彎折）

      // 在 8 方向 × 幾何投影附近步長中，選成本最小且空的格點。
      const ux = pos[u][0];
      const uy = pos[u][1];
      const offx = geo[v][0] - ux;
      const offy = geo[v][1] - uy;
      let best = null;
      for (let di = 0; di < 8; di++) {
        const [dxu, dyu] = DIRS[di];
        const dd = dxu * dxu + dyu * dyu;
        const k0 = Math.max(1, Math.round((offx * dxu + offy * dyu) / dd)); // 幾何投影步長
        for (let k = Math.max(1, k0 - maxSpan); k <= k0 + maxSpan; k++) {
          const x = ux + k * dxu;
          const y = uy + k * dyu;
          if (occ(x, y)) continue;
          const dist = Math.hypot(x - geo[v][0], y - geo[v][1]); // 幾何精度
          const cost = wMove * dist + wBend * bendCost(inDir[u], di);
          if (!best || cost < best.cost) best = { x, y, dir: di, cost };
        }
      }
      if (!best) {
        const [fx, fy] = nearestFree(geo[v][0], geo[v][1]);
        best = { x: fx, y: fy, dir: null };
      }
      setPos(v, best.x, best.y, best.dir);
      queue.push(v);
    }
  }

  // 非連通殘餘節點：放到離幾何位置最近的空格。
  for (let i = 0; i < n; i++) {
    if (pos[i] == null) {
      const [fx, fy] = nearestFree(geo[i][0], geo[i][1]);
      setPos(i, fx, fy, null);
    }
  }

  return pos;
}
