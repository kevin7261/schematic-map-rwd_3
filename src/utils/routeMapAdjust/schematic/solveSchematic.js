/* eslint-disable no-console */

/**
 * Worker-safe 求解（不依賴 dataStore）：connect 骨架 → 各演算法的示意圖佈局座標。
 *
 * ⚠️ 重要（論文忠實度）：每個圖層**各自輸出自己論文演算法的座標**，彼此獨立，
 * 不再共用同一顆 MILP 引擎、也不再用啟發式結果冒充 MILP。
 *   ① stroke    → Li & Dong (2010) stroke-based（runStrokeOnGraph 自己的座標）
 *   ② hillclimb → Stott et al. (2011) 多準則 hill climbing（runHillClimb 自己的座標）
 *   ③ milp      → Nöllenburg & Wolff (2011) MILP 精確求解（runOctilinearLayout）
 * 其餘 force / wangchi 為附加方法，同樣各自輸出自己的座標。
 *
 * 由 schematicWorker.js 在 Web Worker 內呼叫（避免凍結主執行緒 → overlay 計時可動）。
 */

import { buildSchematicGraph, splitHighDegreeNodes, initialCoords } from './graph.js';
import { runStrokeOnGraph } from './stroke/strokeCore.js';
import { runHillClimb } from './hillClimb/hillClimbCore.js';
import { runForceDirected } from './forceDirected/forceCore.js';
import { runWangChi } from './leastSquares/wangChiCore.js';
import { runBastGrid } from './gridGraph/bastGridCore.js';
import { runMerrick } from './pathSimplify/merrickCore.js';
import { runSat } from './sat/satCore.js';
import { runOctilinearLayout } from './milp/runOctilinearLayout.js';
import { countViolations } from './repair.js';
import { repairNodesOnForeignEdge } from './enforceNoNodeOnForeignEdge.js';

// MILP（③）目標權重：S1 彎折 / S2 相對位置 / S3 長度（Nöllenburg & Wolff 2011，§4.8 Eq.15）。
const MILP_WEIGHTS = { wBend: 1.5, wRpos: 1.5, wLen: 0.1 };

const KNOWN_PROFILES = new Set(['stroke', 'hillclimb', 'milp', 'force', 'wangchi', 'bast', 'merrick', 'sat']);

// SAT（⑧）目標權重：f1 彎折 / f2 相對位置 / f3 邊長（Fuchs 2022，§3.4；論文預設皆 1，實驗用 (3,2,1)）。
const SAT_WEIGHTS = { f1: 3, f2: 2, f3: 1 };

function finalizeCoords(graph, coords, opts) {
  let out = coords.map((c) => [c[0], c[1]]);
  if (opts.enforceNoForeignEdge) {
    const rep = repairNodesOnForeignEdge(graph, out);
    out = rep.coords;
  }
  return out;
}

/**
 * @param {Array} skeletonFlat connect 骨架（已縮放整數格）
 * @param {string} profileId  stroke|hillclimb|milp|force|wangchi|bast|merrick
 * @param {(msg:string)=>void} onProgress 進度回報（worker 轉發給主執行緒）
 * @param {{ buildGraphOpts?: object, enforceNoForeignEdge?: boolean }} [opts]
 * @returns {Promise<{ ok, coords?, violations?, h4Pairs?, sepPairs?, status?, message? }>}
 */
export async function solveSchematic(skeletonFlat, profileId, onProgress, opts = {}) {
  if (!KNOWN_PROFILES.has(profileId)) return { ok: false, message: '未知 profile：' + profileId };
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  const graph = splitHighDegreeNodes(buildSchematicGraph(skeletonFlat, opts.buildGraphOpts || {}), 8);
  const coords0 = initialCoords(graph);

  // 啟發式 / 直接式圖層：各自輸出自己演算法的座標（不接 MILP）。
  const direct = {
    stroke: () => {
      report('Stroke 直線化（Li & Dong 2010）…');
      return runStrokeOnGraph(graph, coords0, {});
    },
    hillclimb: () => {
      report('Hill Climbing 多準則最佳化（Stott et al. 2011）…');
      return runHillClimb(graph, coords0, {}).coords;
    },
    force: () => {
      report('Force-directed 佈局…');
      return runForceDirected(graph, coords0, {});
    },
    wangchi: () => {
      report('Wang & Chi 最小平方佈局…');
      return runWangChi(graph, coords0, {});
    },
    bast: () => {
      report('Octilinear 格網最短路佈局（Bast et al. 2020）…');
      return runBastGrid(graph, coords0, {});
    },
    merrick: () => {
      report('C-directed 路徑簡化佈局（Merrick & Gudmundsson 2007）…');
      return runMerrick(graph, coords0, {});
    },
  };

  if (direct[profileId]) {
    const r = direct[profileId]();
    // ⑥ Bast 回傳 { coords, edgePaths }(邊內彎折幾何);其餘回傳 coords 陣列。
    const raw = Array.isArray(r) ? r : r.coords;
    const edgePaths = Array.isArray(r) ? undefined : r.edgePaths;
    const coords = finalizeCoords(graph, raw, opts);
    return { ok: true, coords, edgePaths, violations: countViolations(graph, coords), status: profileId };
  }

  // ⑧ SAT：Fuchs (2022) 精確八方向 weighted-partial MaxSAT（logic-solver，完全照論文 SAT 模型）。
  //    與 ③ MILP 同契約:小骨架可解、大城市誠實逾時（worker 由主執行緒 wall-clock 終止）。
  if (profileId === 'sat') {
    report('SAT 精確八方向求解（Fuchs 2022）…');
    const r = runSat(graph, coords0, {
      weights: SAT_WEIGHTS,
      optimize: true,
      maxPlanarIter: 8,
      onProgress: report,
    });
    if (!r.ok) {
      return { ok: false, status: 'sat-failed', message: (r.message || 'SAT 求解未產出') + '\n（依論文忠實度要求,不以啟發式冒充 SAT）' };
    }
    const coords = finalizeCoords(graph, r.coords, opts);
    return { ok: true, coords, violations: countViolations(graph, coords), h4Pairs: r.h4Pairs, status: r.status };
  }

  // ③ MILP：Nöllenburg & Wolff (2011) 精確八方向求解（完全照論文,不加 fallback/簡化)。
  //    NW11 本質重(原作者用 CPLEX 跑數小時),大城市可能未產出——此為忠實的代價,效能之後再調。
  report('MILP 精確八方向求解（Nöllenburg & Wolff 2011）…');
  const layout = await runOctilinearLayout(graph, {
    weights: MILP_WEIGHTS,
    preferredDirs: null, // S2 以地理最近八方向為偏好（論文 §4.6）
    timeLimit: 30,
    maxTimeLimit: 120,
    maxH4Iter: 8,
    maxSepIter: 8,
    onProgress: report,
  });

  if (!layout.ok) {
    return {
      ok: false,
      status: 'milp-failed',
      message: (layout.message || 'MILP 精確求解未產出（超時或不可行）') +
        '\n（依論文忠實度要求,不以啟發式冒充 MILP）',
    };
  }

  const coords = finalizeCoords(graph, layout.coords, opts);
  return {
    ok: true,
    coords,
    violations: countViolations(graph, coords),
    h4Pairs: layout.h4Pairs,
    sepPairs: layout.sepPairs,
    status: layout.status,
  };
}
