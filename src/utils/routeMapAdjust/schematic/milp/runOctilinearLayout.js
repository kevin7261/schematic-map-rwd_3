/* eslint-disable no-console */

/**
 * Nöllenburg & Wolff (2011) 之 octilinear MILP 求解驅動（**忠實單次求解**）。
 *
 * 依論文：解「一個」MILP（H1–H3 + S1–S3，整數八方向座標），H4 平面性以 §5.2 的
 * **惰性 cutting-plane** 加入——初始模型不含 H4，解出後偵測「相交 / 壓線 / 重合」的非相鄰邊對，
 * 加入對應 H4 分離約束後重解，直到無違規或達上限。無兩階段釘死方向、無 sepPairs 補丁
 * （H3 最小段長 + H4 分離即保證不重疊/不重合，符合論文精確模型）。
 *
 * 註：瀏覽器 HiGHS/WASM 無 solver callback，故以「重解」實現惰性加入（數學等價，效率較低）。
 *     大型網路可能於時限內無解 → 誠實回報失敗（由 solveSchematic 呈現，不以啟發式冒充）。
 */

import { buildMilpModel } from './buildMilpModel.js';
import { loadHighs } from './highsLoader.js';
import { findCrossingPairs, findNodeOnForeignEdgePairs } from '../objective.js';

const NDIR = 8;
const TWO_PI = Math.PI * 2;

/** 由「啟發式初始座標」算每邊偏好的 8 方向（供 S2 軟成本拉向；不動硬約束）。保留供外部使用。 */
export function computePreferredDirs(graph, coords) {
  const pref = {};
  for (const e of graph.edges) {
    const a = coords[e.u], b = coords[e.v];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    let k = Math.round(ang / (TWO_PI / NDIR));
    pref[e.id] = ((k % NDIR) + NDIR) % NDIR;
  }
  return pref;
}

function readCoords(graph, cols) {
  return graph.nodes.map((nd) => [
    Math.round(Number(cols[`X_${nd.id}`]?.Primal ?? 0)),
    Math.round(Number(cols[`Y_${nd.id}`]?.Primal ?? 0)),
  ]);
}
function isDegenerate(coords) {
  let mx = -Infinity, my = -Infinity;
  for (const [x, y] of coords) { if (x > mx) mx = x; if (y > my) my = y; }
  return mx < 2 && my < 2;
}
function findClashes(coords) {
  const seen = new Map();
  const out = [];
  for (let n = 0; n < coords.length; n++) {
    const k = `${coords[n][0]},${coords[n][1]}`;
    if (seen.has(k)) out.push([seen.get(k), n]);
    else seen.set(k, n);
  }
  return out;
}
/** 把「重合節點對」轉成一組非相鄰入射邊對，供 H4 分離（保持惰性 H4 框架，不另設 sepPairs）。 */
function clashToEdgePair(graph, a, b) {
  const incA = graph.incident[a] || [];
  const incB = graph.incident[b] || [];
  for (const x of incA) {
    for (const y of incB) {
      const ex = graph.edges[x], ey = graph.edges[y];
      if (ex.u === ey.u || ex.u === ey.v || ex.v === ey.u || ex.v === ey.v) continue;
      return [x, y];
    }
  }
  return null;
}

/**
 * @param {object} graph split 後的抽象圖（nodes 帶初始 x/y → 決定方位偏好 k0）
 * @param {object} opts { weights:{wBend,wRpos,wLen}, timeLimit, maxTimeLimit, maxH4Iter, preferredDirs }
 * @returns {Promise<{ ok, coords?, status?, objective?, h4Pairs?, message? }>}
 */
export async function runOctilinearLayout(graph, opts = {}) {
  const weights = opts.weights || {};
  const TIME = opts.timeLimit ?? 30;
  const MAX_TIME = opts.maxTimeLimit ?? 120;
  const MAX_H4 = opts.maxH4Iter ?? 8;
  const report = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  let highs;
  try {
    highs = await loadHighs();
  } catch (e) {
    return { ok: false, message: 'HiGHS 求解器無法載入（可能離線/CDN 被擋）：' + (e?.message || e) };
  }

  function solveEscalating(model, tag) {
    let t = TIME;
    for (;;) {
      let result;
      try {
        result = highs.solve(model.lp, { time_limit: t, presolve: 'on' });
      } catch (e) {
        return { error: 'MILP 求解錯誤（' + tag + '）：' + (e?.message || e) };
      }
      const st = String(result?.Status ?? '');
      const cols = result?.Columns;
      if (!cols || !cols['X_0']) return { cols: null, status: st };
      const cur = readCoords(graph, cols);
      const degenerate = isDegenerate(cur);
      if (!degenerate || t >= MAX_TIME) {
        return { cols, cur, degenerate, status: st, objective: Number(result?.ObjectiveValue ?? 0) };
      }
      t = Math.min(MAX_TIME, t * 2);
      report(`${tag}：尚未找到可行整數解，加時重試（${t}s）…`);
    }
  }

  // ---- 單次求解 + 惰性 H4（cutting-plane）：整數八方向座標 ----
  const h4Pairs = [];
  const seenH4 = new Set();
  let bestCoords = null;
  let bestBad = Infinity;
  let status = '';
  let objective = 0;

  for (let iter = 0; iter < MAX_H4; iter++) {
    report(`MILP 求解（八方向+消交叉+消壓線+消重合）第 ${iter + 1} 輪…`);
    const model = buildMilpModel(graph, {
      ...weights,
      h4Pairs,
      integerCoords: true,
      preferredDirs: opts.preferredDirs,
    });
    const sol = solveEscalating(model, `iter ${iter}`);
    if (sol.error) { if (bestCoords) break; return { ok: false, message: sol.error }; }
    status = sol.status;
    if (!sol.cols) { if (bestCoords) break; return { ok: false, message: `MILP 無可行解（iter ${iter}，status=${status}）` }; }
    if (sol.degenerate) {
      if (bestCoords) break;
      return { ok: false, message: `MILP 在 ${MAX_TIME}s 內找不到有意義整數解（模型對瀏覽器太重）。`, status };
    }

    const cur = sol.cur;
    const crossPairs = findCrossingPairs(graph, cur);
    const onEdgePairs = findNodeOnForeignEdgePairs(graph, cur);
    const clashes = findClashes(cur);
    const bad = crossPairs.length + onEdgePairs.length + clashes.length;
    console.log(`[NW11] iter ${iter}: status=${status} 交叉=${crossPairs.length} 壓線=${onEdgePairs.length} 重合=${clashes.length} H4對=${h4Pairs.length}`);

    if (bad < bestBad) { bestBad = bad; bestCoords = cur; objective = sol.objective; }
    if (bad === 0) break;

    // 惰性加入新違規邊對。
    let added = 0;
    const pushPair = (a, b) => {
      if (a == null || b == null) return;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seenH4.has(key)) return;
      seenH4.add(key);
      h4Pairs.push([a, b]);
      added++;
    };
    for (const [a, b] of crossPairs) pushPair(a, b);
    for (const [a, b] of onEdgePairs) pushPair(a, b);
    for (const [a, b] of clashes) {
      const ep = clashToEdgePair(graph, a, b);
      if (ep) pushPair(ep[0], ep[1]);
    }
    if (added === 0) break; // 無法再加新約束 → 收斂或受限
  }

  if (!bestCoords) {
    return { ok: false, message: `MILP 未得有效解（HiGHS 在 ${MAX_TIME}s 內無有意義整數解）。`, status };
  }

  return {
    ok: true,
    coords: bestCoords,
    status,
    objective,
    h4Pairs: h4Pairs.length,
    sepPairs: 0,
  };
}
