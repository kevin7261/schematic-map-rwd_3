/* eslint-disable no-console */

/**
 * Worker-safe 求解（不依賴 dataStore）：connect 骨架 → 精確八方向佈局座標。
 * 三個 profile 共用精確硬約束引擎，差別在目標權重 + 方向偏好（各論文精神）。
 * 由 schematicWorker.js 在 Web Worker 內呼叫（避免凍結主執行緒 → overlay 計時可動）。
 */

import { buildSchematicGraph, splitHighDegreeNodes, initialCoords } from './graph.js';
import { runStrokeOnGraph } from './stroke/strokeCore.js';
import { runHillClimb } from './hillClimb/hillClimbCore.js';
import { runOctilinearLayout, computePreferredDirs } from './milp/runOctilinearLayout.js';
import { countViolations } from './repair.js';

const PROFILES = {
  stroke: { init: 'stroke', weights: { wBend: 2, wRpos: 1, wLen: 0.05 } },
  hillclimb: { init: 'hill', weights: { wBend: 1, wRpos: 2, wLen: 0.1 } },
  milp: { init: 'geo', weights: { wBend: 1.5, wRpos: 1.5, wLen: 0.1 } },
};

/**
 * @param {Array} skeletonFlat connect 骨架（已縮放整數格）
 * @param {string} profileId  stroke|hillclimb|milp
 * @param {(msg:string)=>void} onProgress 進度回報（worker 轉發給主執行緒）
 * @returns {Promise<{ ok, coords?, violations?, h4Pairs?, sepPairs?, status?, message? }>}
 */
export async function solveSchematic(skeletonFlat, profileId, onProgress) {
  const prof = PROFILES[profileId];
  if (!prof) return { ok: false, message: '未知 profile：' + profileId };
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  const graph = splitHighDegreeNodes(buildSchematicGraph(skeletonFlat), 8);
  const coords0 = initialCoords(graph);

  report('計算方向偏好（' + profileId + '）…');
  let preferredDirs = null;
  if (prof.init === 'stroke') preferredDirs = computePreferredDirs(graph, runStrokeOnGraph(graph, coords0, {}));
  else if (prof.init === 'hill') preferredDirs = computePreferredDirs(graph, runHillClimb(graph, coords0, {}).coords);

  const layout = await runOctilinearLayout(graph, {
    weights: prof.weights,
    preferredDirs,
    timeLimit: 30,
    maxTimeLimit: 240,
    maxH4Iter: 8,
    maxSepIter: 8,
    onProgress: report,
  });
  if (!layout.ok) return { ok: false, message: layout.message };

  return {
    ok: true,
    coords: layout.coords,
    violations: countViolations(graph, layout.coords),
    h4Pairs: layout.h4Pairs,
    sepPairs: layout.sepPairs,
    status: layout.status,
  };
}
