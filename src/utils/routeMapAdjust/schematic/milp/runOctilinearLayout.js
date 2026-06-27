/* eslint-disable no-console */

/**
 * 共用精確「八方向佈局引擎」（Nöllenburg & Wolff MILP 的硬約束）。三個比較圖層共用，
 * 差別僅在**目標函數權重**與**初始化方位**（反映各論文精神）；硬約束相同 →
 * 三層輸出皆為**精確八方向、零交叉、零重疊、零重合**的整數佈局。
 *
 * 兩階段（在瀏覽器內以 HiGHS/WASM 可解）：
 *  Phase 1（連續座標 + 惰性 H4）：解 → 找交叉邊對 → 加 H4 分離 → 重解，直到零交叉。
 *    連續解的「邊方向(dir binary)」精確可靠，但連續座標取整會讓少數 45° 邊差 1 格。
 *  Phase 2（釘死方向 + 整數座標 + 惰性節點分離）：把 Phase 1 的方向釘死、座標改整數，
 *    再解（極快）→ 找座標重合節點 → 加分離 → 重解，得**精確八方向整數**且無重合。
 */

import { buildMilpModel } from './buildMilpModel.js';
import { loadHighs } from './highsLoader.js';
import { findCrossingPairs, findNodeOnForeignEdgePairs } from '../objective.js';

const NDIR = 8;
const TWO_PI = Math.PI * 2;

/** 由「啟發式初始座標」算每邊偏好的 8 方向（供各論文以 S2 軟成本拉向其形狀；不動硬約束）。 */
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

/**
 * @param {object} graph split 後的抽象圖（nodes 帶初始 x/y → 決定方位偏好 k0）
 * @param {object} opts { weights:{wBend,wRpos,wLen}, timeLimit, maxH4Iter, maxSepIter }
 * @returns {Promise<{ ok, coords?, status?, objective?, h4Pairs?, sepPairs?, message? }>}
 */
export async function runOctilinearLayout(graph, opts = {}) {
  const weights = opts.weights || {};
  const TIME = opts.timeLimit ?? 30;
  const MAX_H4 = opts.maxH4Iter ?? 8;
  const MAX_SEP = opts.maxSepIter ?? 8;
  const report = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  let highs;
  try {
    highs = await loadHighs();
  } catch (e) {
    return { ok: false, message: 'HiGHS 求解器無法載入（可能離線/CDN 被擋）：' + (e?.message || e) };
  }

  // 求解一個模型；若「退化/找不到可行整數解」，**逐步加時重試**（瀏覽器 WASM 較慢，
  // 第一個可行整數解有時 30s 不夠）。回傳 { cols, cur, degenerate, status, objective } 或 null（真無解）。
  const MAX_TIME = opts.maxTimeLimit ?? 120;
  function solveEscalating(model, tag) {
    let t = TIME;
    for (let attempt = 0; ; attempt++) {
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
      console.log(`[Octi] ${tag} 退化(無可行整數解)，加時重試 → ${t}s …`);
    }
  }

  // ---- Phase 1：連續座標 + 惰性 H4，求到零交叉 ----
  const h4Pairs = [];
  const seenH4 = new Set();
  let bestCoords = null;
  let bestCrossings = Infinity;
  let bestCols = null;
  let status = '';
  let objective = 0;
  for (let iter = 0; iter < MAX_H4; iter++) {
    report(`階段一（求八方向+消交叉+消壓線）第 ${iter + 1} 輪…`);
    const model = buildMilpModel(graph, { ...weights, h4Pairs, preferredDirs: opts.preferredDirs });
    const sol = solveEscalating(model, `phase1 iter ${iter}`);
    if (sol.error) { if (bestCoords) break; return { ok: false, message: sol.error }; }
    status = sol.status;
    if (!sol.cols) { if (bestCoords) break; return { ok: false, message: `MILP 無可行解（phase1 iter ${iter}，status=${status}）` }; }
    const cur = sol.cur;
    const degenerate = sol.degenerate;
    // 「不乾淨」= 交叉 + 節點壓在他線上（路線壓過非該線之紅/藍點）
    const crossPairs = degenerate ? [] : findCrossingPairs(graph, cur);
    const onEdgePairs = degenerate ? [] : findNodeOnForeignEdgePairs(graph, cur);
    const badCount = degenerate ? Infinity : crossPairs.length + onEdgePairs.length;
    console.log(`[Octi] phase1 iter ${iter}: status=${status} 交叉=${degenerate ? 'degen' : crossPairs.length} 壓線=${degenerate ? '-' : onEdgePairs.length} H4對=${h4Pairs.length}`);
    if (degenerate) { if (bestCoords) break; return { ok: false, message: `MILP 在 ${MAX_TIME}s 內仍找不到有意義整數解（模型對瀏覽器太重）。`, status }; }
    if (badCount < bestCrossings) {
      bestCrossings = badCount;
      bestCoords = cur;
      bestCols = sol.cols;
      objective = sol.objective;
    }
    if (badCount === 0) break;
    let added = 0;
    for (const [a, b] of [...crossPairs, ...onEdgePairs]) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seenH4.has(key)) continue;
      seenH4.add(key);
      h4Pairs.push([a, b]);
      added++;
    }
    if (added === 0) break;
  }
  if (!bestCoords || !bestCols) {
    return { ok: false, message: `MILP 僅得退化/超時解（HiGHS 在 ${MAX_TIME}s 內找不到有意義整數解；模型對瀏覽器太重）。`, status };
  }

  // ---- 從最佳連續解抽取邊方向 ----
  const fixDirs = {};
  for (const e of graph.edges) {
    let kk = 0;
    for (let k = 0; k < NDIR; k++) if (Number(bestCols[`dir_${e.id}_${k}`]?.Primal ?? 0) > 0.5) { kk = k; break; }
    fixDirs[e.id] = kk;
  }

  // ---- Phase 2：釘死方向 + 整數座標 + 惰性節點分離 ----
  const sepPairs = [];
  let coords = bestCoords;
  let p2status = '';
  for (let iter = 0; iter < MAX_SEP; iter++) {
    report(`階段二（整數座標+去重合）第 ${iter + 1} 輪…`);
    const model = buildMilpModel(graph, { ...weights, h4Pairs, fixDirs, sepPairs, integerCoords: true, preferredDirs: opts.preferredDirs });
    const sol = solveEscalating(model, `phase2 iter ${iter}`);
    if (sol.error) { console.warn('[Octi] ' + sol.error + '，沿用 phase1 best'); break; }
    p2status = sol.status;
    if (!sol.cols || sol.degenerate) {
      console.warn(`[Octi] phase2 iter ${iter} 無有效解 status=${p2status}，沿用 phase1 best`);
      break;
    }
    coords = sol.cur;
    const clashes = findClashes(coords);
    const onEdgePairs = findNodeOnForeignEdgePairs(graph, coords); // 節點壓在他線上
    console.log(`[Octi] phase2 iter ${iter}: status=${p2status} 重合節點=${clashes.length} 壓線=${onEdgePairs.length} 分離對=${sepPairs.length}`);
    if (!clashes.length && !onEdgePairs.length) break;
    let added = 0;
    for (const [a, b] of clashes) {
      if (!sepPairs.some(([x, y]) => x === a && y === b)) { sepPairs.push([a, b]); added++; }
    }
    for (const [a, b] of onEdgePairs) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seenH4.has(key)) { seenH4.add(key); h4Pairs.push([a, b]); added++; }
    }
    if (added === 0) break;
  }

  return {
    ok: true,
    coords,
    status: `${status} / p2:${p2status}`,
    objective,
    h4Pairs: h4Pairs.length,
    sepPairs: sepPairs.length,
  };
}
