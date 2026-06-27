/**
 * Merrick & Gudmundsson (2007)「Path Simplification for Metro Map Layout」(GD 2006, LNCS 4372)
 * 核心（worker-safe：不依賴 dataStore）。
 *
 * 論文 §2「C-Directed Path Simplification」：給定路徑 P、方向集合 C（octilinear=8 方向）與誤差 ε，
 *   求每條 link 皆平行於某 c∈C、且依序穿過每點 ε-圓、link 數最少的簡化 P′（精確 StabbingPath，O(|C|³n²)）。
 * §3「Extension to Metro Map Layout」：
 *   1. 路徑（route）依**重要度**排序（= 該路徑上同時屬於其他路徑的節點數＝交會數）。
 *   2. 取最重要路徑做 C-directed 簡化，將其各點放到簡化結果上（投影或沿 link 等距重分布），**固定**。
 *   3. 次重要路徑：以已固定節點為界切成子路徑，各子路徑做簡化（須剛好穿過固定端點），固定。
 *   4. 重複至所有路徑完成。延伸：最大彎角 α、最小 link 長 l_min。
 *
 * 本檔忠實實作其「按重要度逐路徑、以固定節點為界做 octilinear 簡化」之流程，輸出節點座標：
 *   · 自由整段：自一端起，逐段吸附到最近 8 方向、沿整數格步進（C-directed，少彎折）。
 *   · 兩固定端點之間：以 octilinear 折線（octiPath）連接，中間節點沿折線等距重分布（§3「redistributed
 *     along the line segment such that distance between adjacent pairs is equal」）。
 *
 * 各圖層各自輸出自己論文演算法的座標（不接 MILP）。
 */

const OCT8 = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function angBetween(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/** 最近的 8 方向整數步向量。 */
function snap8int(ang) {
  let best = OCT8[0];
  let bestD = Infinity;
  for (const d of OCT8) {
    const da = angBetween(ang, Math.atan2(d[1], d[0]));
    if (da < bestD) {
      bestD = da;
      best = d;
    }
  }
  return best;
}

/** A→B 的 octilinear 折線（對角段 + 正交段），回傳 2~3 點。 */
function octiPath(A, B) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return [A, B];
  const diag = Math.min(Math.abs(dx), Math.abs(dy));
  return [A, [A[0] + Math.sign(dx) * diag, A[1] + Math.sign(dy) * diag], B];
}

/** 沿折線 poly 取弧長比例 t∈[0,1] 之點。 */
function alongPath(poly, t) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  }
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

/** 依 route 把邊串成節點鏈（每條 route 一或多條鏈）。 */
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
      let cur = seed;
      const seq = [cur];
      let moved = true;
      while (moved) {
        moved = false;
        for (const { e, o } of adj.get(cur) || []) {
          if (usedE.has(e.id)) continue;
          usedE.add(e.id);
          seq.push(o);
          cur = o;
          moved = true;
          break;
        }
      }
      if (seq.length >= 2) chains.push({ rn, seq });
    }
    for (const e of edges) if (!usedE.has(e.id)) { usedE.add(e.id); chains.push({ rn, seq: [e.u, e.v] }); }
  }
  return chains;
}

/**
 * 對 connect 圖節點座標跑 Merrick & Gudmundsson (2007) 路徑簡化。
 * @param {object} graph buildSchematicGraph / splitHighDegreeNodes 結果（nodes/edges/incident）
 * @param {Array<[number,number]>} coords0 地理初值座標（nodeId→[x,y]）
 * @returns {Array<[number,number]>} 佈局後整數座標（nodeId→[x,y]）
 */
export function runMerrick(graph, coords0) {
  const n = graph.nodes.length;
  const coords = coords0.map((c) => [Math.round(c[0]), Math.round(c[1])]);
  if (n <= 1) return coords;

  const chains = buildRouteChains(graph);

  // 重要度：節點被幾條鏈經過（>1 即交會）；importance(chain)=其交會節點數。重要者先放並固定。
  const routeCount = new Array(n).fill(0);
  for (const ch of chains) for (const nid of new Set(ch.seq)) routeCount[nid]++;
  const importance = (ch) => ch.seq.reduce((s, nid) => s + (routeCount[nid] > 1 ? 1 : 0), 0);
  chains.sort((a, b) => importance(b) - importance(a) || b.seq.length - a.seq.length);

  const placed = new Array(n).fill(false);
  const occupied = new Set();
  const keyOf = (x, y) => x + ',' + y;
  const nearestFree = (gx, gy) => {
    if (!occupied.has(keyOf(gx, gy))) return [gx, gy];
    for (let r = 1; r < 500; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!occupied.has(keyOf(gx + dx, gy + dy))) return [gx + dx, gy + dy];
        }
      }
    }
    return [gx, gy];
  };
  const put = (nid, x, y) => {
    coords[nid] = [Math.round(x), Math.round(y)];
    occupied.add(keyOf(coords[nid][0], coords[nid][1]));
    placed[nid] = true;
  };

  /** 自由整段（起點 startPos 已定或為 geo），逐段吸附最近 8 方向、沿整數格步進。 */
  const simplifyForward = (seq, startFixed) => {
    let prev;
    let start = 0;
    if (startFixed) {
      prev = coords[seq[0]].slice();
      start = 1;
    } else {
      const [x, y] = nearestFree(coords[seq[0]][0], coords[seq[0]][1]);
      put(seq[0], x, y);
      prev = coords[seq[0]].slice();
      start = 1;
    }
    for (let i = start; i < seq.length; i++) {
      const nid = seq[i];
      if (placed[nid]) {
        prev = coords[nid].slice();
        continue;
      }
      const og = coords0[seq[i]];
      const op = coords0[seq[i - 1]];
      const d = snap8int(Math.atan2(og[1] - op[1], og[0] - op[0]));
      const dd = d[0] * d[0] + d[1] * d[1];
      const k = Math.max(1, Math.round(((og[0] - op[0]) * d[0] + (og[1] - op[1]) * d[1]) / dd));
      const [x, y] = nearestFree(prev[0] + k * d[0], prev[1] + k * d[1]);
      put(nid, x, y);
      prev = coords[nid].slice();
    }
  };

  /** 兩固定端點 A(seq[a]),B(seq[b]) 間：octilinear 折線連接，中間節點等距重分布。 */
  const fillBetween = (seq, a, b) => {
    const A = coords[seq[a]].slice();
    const B = coords[seq[b]].slice();
    const poly = octiPath(A, B);
    for (let i = a + 1; i < b; i++) {
      const nid = seq[i];
      if (placed[nid]) continue;
      const p = alongPath(poly, (i - a) / (b - a));
      const [x, y] = nearestFree(Math.round(p[0]), Math.round(p[1]));
      put(nid, x, y);
    }
  };

  for (const ch of chains) {
    const seq = ch.seq;
    const anchors = [];
    for (let i = 0; i < seq.length; i++) if (placed[seq[i]]) anchors.push(i);

    if (anchors.length === 0) {
      // 整段自由：自一端 C-directed 簡化。
      simplifyForward(seq, false);
      continue;
    }
    // 第一個 anchor 之前（反向）：把 seq[0..a0] 反轉後自 anchor 簡化。
    const a0 = anchors[0];
    if (a0 > 0) simplifyForward(seq.slice(0, a0 + 1).reverse(), true);
    // 相鄰 anchor 之間：折線填補 + 等距重分布。
    for (let t = 0; t + 1 < anchors.length; t++) fillBetween(seq, anchors[t], anchors[t + 1]);
    // 最後一個 anchor 之後（正向）：自 anchor 簡化。
    const aN = anchors[anchors.length - 1];
    if (aN < seq.length - 1) simplifyForward(seq.slice(aN), true);
  }

  // 任何未被任何鏈覆蓋的節點：放到離幾何位置最近的空格。
  for (let i = 0; i < n; i++) {
    if (!placed[i]) {
      const [x, y] = nearestFree(coords[i][0], coords[i][1]);
      put(i, x, y);
    }
  }

  return coords;
}
