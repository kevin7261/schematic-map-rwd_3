/**
 * Li & Dong (2010) stroke 法核心（worker-safe：不依賴 dataStore）。
 * 由各 route 的 connect 串成 stroke、方向扭曲 DP 切段、每段對齊最近 8 方向沿整數格步進。
 * 僅作為精確八方向引擎之「方向偏好」初值（computePreferredDirs 取其方向）。
 */

const DEG = Math.PI / 180;

function angBetween(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

const OCT8 = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
function snap8int(ang) {
  let best = OCT8[0];
  let bestD = Infinity;
  for (const d of OCT8) {
    const da = angBetween(ang, Math.atan2(d[1], d[0]));
    if (da < bestD) { bestD = da; best = d; }
  }
  return best;
}

function dpDirectionSplit(pts, thresholdRad) {
  const breaks = new Set([0, pts.length - 1]);
  const rec = (s, e) => {
    if (e - s < 2) return;
    const chord = Math.atan2(pts[e][1] - pts[s][1], pts[e][0] - pts[s][0]);
    let worst = -1;
    let worstD = thresholdRad;
    for (let i = s; i < e; i++) {
      const segAng = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      const d = angBetween(chord, segAng);
      if (d > worstD) { worstD = d; worst = i + 1 <= e - 1 ? i + 1 : i; }
    }
    if (worst > s && worst < e) { breaks.add(worst); rec(s, worst); rec(worst, e); }
  };
  rec(0, pts.length - 1);
  return [...breaks].sort((a, b) => a - b);
}

function octiPath(A, B) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
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
  for (const [, edges] of byRoute) {
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.u)) adj.set(e.u, []);
      if (!adj.has(e.v)) adj.set(e.v, []);
      adj.get(e.u).push({ e, o: e.v });
      adj.get(e.v).push({ e, o: e.u });
    }
    const usedE = new Set();
    const starts = [...adj.keys()].filter((n) => adj.get(n).length === 1);
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
      if (seq.length >= 2) chains.push(seq);
    }
    for (const e of edges) if (!usedE.has(e.id)) { usedE.add(e.id); chains.push([e.u, e.v]); }
  }
  return chains;
}

/** 對 connect 圖節點座標跑 stroke 法。回傳 coords（nodeId→[x,y]）。 */
export function runStrokeOnGraph(graph, coords0, opts = {}) {
  const threshold = (opts.thresholdDeg ?? 45) * DEG;
  const coords = coords0.map((c) => c.slice());
  const placed = new Set();
  let chains = buildRouteChains(graph);
  const clen = (ch) => {
    let L = 0;
    for (let i = 1; i < ch.length; i++) L += Math.hypot(coords0[ch[i]][0] - coords0[ch[i - 1]][0], coords0[ch[i]][1] - coords0[ch[i - 1]][1]);
    return L;
  };
  chains = chains.sort((a, b) => clen(b) - clen(a));

  for (const chain of chains) {
    const orig = chain.map((nid) => coords0[nid]);
    const newPts = new Array(chain.length);
    newPts[0] = placed.has(chain[0]) ? coords[chain[0]].slice() : coords0[chain[0]].slice();
    const fixedSet = new Set();
    for (let i = 0; i < chain.length; i++) if (placed.has(chain[i])) fixedSet.add(i);
    const breaks = [...new Set([0, chain.length - 1, ...dpDirectionSplit(orig, threshold), ...fixedSet])].sort((a, b) => a - b);

    for (let b = 0; b < breaks.length - 1; b++) {
      const s = breaks[b];
      const e = breaks[b + 1];
      const aNew = newPts[s];
      if (fixedSet.has(e)) {
        const bNew = coords[chain[e]].slice();
        const path = octiPath(aNew, bNew);
        for (let i = s + 1; i < e; i++) {
          if (placed.has(chain[i])) { newPts[i] = coords[chain[i]].slice(); continue; }
          const p = alongPath(path, (i - s) / (e - s));
          newPts[i] = [Math.round(p[0]), Math.round(p[1])];
        }
        newPts[e] = bNew;
      } else {
        const d = snap8int(Math.atan2(orig[e][1] - orig[s][1], orig[e][0] - orig[s][0]));
        const dd = d[0] * d[0] + d[1] * d[1];
        let prevK = 0;
        for (let i = s + 1; i <= e; i++) {
          if (placed.has(chain[i])) { newPts[i] = coords[chain[i]].slice(); continue; }
          let k = Math.round(((orig[i][0] - orig[s][0]) * d[0] + (orig[i][1] - orig[s][1]) * d[1]) / dd);
          if (k <= prevK) k = prevK + 1;
          prevK = k;
          newPts[i] = [aNew[0] + k * d[0], aNew[1] + k * d[1]];
        }
      }
    }
    for (let i = 0; i < chain.length; i++) {
      const nid = chain[i];
      if (!placed.has(nid)) {
        coords[nid] = [Math.round(newPts[i][0]), Math.round(newPts[i][1])];
        placed.add(nid);
      }
    }
  }
  return coords;
}
