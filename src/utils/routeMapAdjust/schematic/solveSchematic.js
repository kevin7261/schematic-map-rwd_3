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
import { runOctilinearLayout } from './milp/runOctilinearLayout.js';
import { countViolations } from './repair.js';

// MILP（③）目標權重：S1 彎折 / S2 相對位置 / S3 長度（Nöllenburg & Wolff 2011，§4.8 Eq.15）。
const MILP_WEIGHTS = { wBend: 1.5, wRpos: 1.5, wLen: 0.1 };

const KNOWN_PROFILES = new Set(['stroke', 'hillclimb', 'milp', 'force', 'wangchi', 'bast', 'merrick']);

/**
 * @param {Array} skeletonFlat connect 骨架（已縮放整數格）
 * @param {string} profileId  stroke|hillclimb|milp|force|wangchi|bast|merrick
 * @param {(msg:string)=>void} onProgress 進度回報（worker 轉發給主執行緒）
 * @returns {Promise<{ ok, coords?, violations?, h4Pairs?, sepPairs?, status?, message? }>}
 */
export async function solveSchematic(skeletonFlat, profileId, onProgress) {
  if (!KNOWN_PROFILES.has(profileId)) return { ok: false, message: '未知 profile：' + profileId };
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  const graph = splitHighDegreeNodes(buildSchematicGraph(skeletonFlat), 8);
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
    const coords = direct[profileId]();
    return { ok: true, coords, violations: countViolations(graph, coords), status: profileId };
  }

  // ③ MILP：Nöllenburg & Wolff (2011) 精確八方向求解。失敗就誠實回報「未產出」，
  //    **不**用啟發式冒充（論文忠實度要求）。
  report('MILP 精確八方向求解（Nöllenburg & Wolff 2011）…');
  const layout = await runOctilinearLayout(graph, {
    weights: MILP_WEIGHTS,
    preferredDirs: null, // S2 以地理最近八方向為偏好（論文 §4.6）
    timeLimit: 30,
    maxTimeLimit: 60,
    maxH4Iter: 8,
    maxSepIter: 8,
    onProgress: report,
  });

  if (!layout.ok) {
    return {
      ok: false,
      status: 'milp-failed',
      message: (layout.message || 'MILP 精確求解未產出（超時或不可行）') +
        '\n（依論文忠實度要求，不以啟發式結果冒充 MILP；請放寬時限或縮小網路後重試）',
    };
  }

  return {
    ok: true,
    coords: layout.coords,
    violations: countViolations(graph, layout.coords),
    h4Pairs: layout.h4Pairs,
    sepPairs: layout.sepPairs,
    status: layout.status,
  };
}
