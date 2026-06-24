/* eslint-disable no-console */
/**
 * 離線預先計算三個示意圖佈局（精確八方向 MILP，Node 多執行緒可解），輸出 JSON 供 app 直接載入。
 * 執行：node --no-warnings --loader ./loader.mjs scripts/generateSchematicLayouts.mjs
 * 產物：public/data/taipei/schematic_{stroke,hillclimb,milp}.json
 *
 * 三層共用精確硬約束引擎（H1 八方向 / H2 嵌入序 / H4 平面性），差別在目標權重 + 方向偏好。
 * 兩階段：連續座標+惰性H4 → 釘死方向+整數座標+惰性節點分離。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '../src/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildConnectSkeleton, scaleSkeletonToIntegerGrid } from '../src/utils/layers/schematic_layout/input.js';
import { buildSchematicGraph, splitHighDegreeNodes, initialCoords, applyCoordsToSkeleton } from '../src/utils/layers/schematic_layout/graph.js';
import { buildMilpModel } from '../src/utils/layers/schematic_layout/milp/buildMilpModel.js';
import { computePreferredDirs } from '../src/utils/layers/schematic_layout/milp/runOctilinearLayout.js';
import { findCrossingPairs, skeletonBendStats } from '../src/utils/layers/schematic_layout/objective.js';
import { countViolations } from '../src/utils/layers/schematic_layout/repair.js';
import { reinsertBlackStations } from '../src/utils/layers/schematic_layout/assemble.js';
import { buildSameRouteEdgePairsAtNodes } from '../src/utils/layers/schematic_layout/graph.js';
import { runStrokeOnGraph } from '../src/utils/layers/schematic_layout/stroke/strokeCore.js';
import { runHillClimb } from '../src/utils/layers/schematic_layout/hillClimb/hillClimbCore.js';

const require = createRequire(import.meta.url);
const highs = await (require('highs'))({ locateFile: (f) => './node_modules/highs/build/' + f });

function readCoords(graph, cols) {
  return graph.nodes.map((nd) => [Math.round(Number(cols[`X_${nd.id}`]?.Primal ?? 0)), Math.round(Number(cols[`Y_${nd.id}`]?.Primal ?? 0))]);
}
function isDegen(co) { let mx = -1e9, my = -1e9; for (const [x, y] of co) { if (x > mx) mx = x; if (y > my) my = y; } return mx < 2 && my < 2; }
function findClashes(co) { const m = new Map(); const o = []; for (let n = 0; n < co.length; n++) { const k = `${co[n][0]},${co[n][1]}`; if (m.has(k)) o.push([m.get(k), n]); else m.set(k, n); } return o; }

// 解一個模型；退化(無可行整數解)就加時重試，直到非退化或達 480s（離線一次性，時間不限）。
function solveHard(model, tag) {
  let t = 60;
  for (;;) {
    const r = highs.solve(model.lp, { time_limit: t, presolve: 'on', parallel: 'on', mip_heuristic_effort: 0.3 });
    const cols = r?.Columns;
    if (!cols || !cols['X_0']) return { cols: null };
    const cur = readCoords(graph0Ref, cols);
    if (!isDegen(cur) || t >= 480) return { cols, cur, degen: isDegen(cur), obj: Number(r?.ObjectiveValue ?? 0) };
    t = Math.min(480, t * 2);
    console.log(`    ${tag} 退化，加時 → ${t}s …`);
  }
}
let graph0Ref = null;

async function engine(graph, weights, pref) {
  graph0Ref = graph;
  const h4 = [], seen = new Set();
  let best = null, bestCols = null, bestCr = Infinity;
  for (let it = 0; it < 6; it++) {
    const m = buildMilpModel(graph, { ...weights, h4Pairs: h4, preferredDirs: pref });
    const sol = solveHard(m, `phase1 iter ${it}`);
    if (!sol.cols || sol.degen) break;
    const cur = sol.cur;
    const cr = findCrossingPairs(graph, cur).length;
    console.log(`    phase1 iter ${it}: 交叉=${cr}`);
    if (cr < bestCr) { bestCr = cr; best = cur; bestCols = sol.cols; }
    if (cr === 0) break;
    let add = 0; for (const [a, b] of findCrossingPairs(graph, cur)) { const k = a < b ? `${a}-${b}` : `${b}-${a}`; if (seen.has(k)) continue; seen.add(k); h4.push([a, b]); add++; }
    if (add === 0) break;
  }
  if (!best) return null;
  const fixDirs = {};
  for (const e of graph.edges) { let kk = 0; for (let k = 0; k < 8; k++) if (Number(bestCols[`dir_${e.id}_${k}`]?.Primal ?? 0) > 0.5) { kk = k; break; } fixDirs[e.id] = kk; }
  const sep = []; let coords = best;
  for (let it = 0; it < 8; it++) {
    const m = buildMilpModel(graph, { ...weights, h4Pairs: h4, fixDirs, sepPairs: sep, integerCoords: true, preferredDirs: pref });
    const sol = solveHard(m, `phase2 iter ${it}`);
    if (!sol.cols || sol.degen) break;
    coords = sol.cur;
    const cl = findClashes(coords);
    console.log(`    phase2 iter ${it}: 重合=${cl.length}`);
    if (!cl.length) break;
    for (const [a, b] of cl) if (!sep.some(([x, y]) => x === a && y === b)) sep.push([a, b]);
  }
  return coords;
}

const PROFILES = [
  { id: 'stroke', init: 'stroke', weights: { wBend: 2, wRpos: 1, wLen: 0.05 }, algo: 'stroke-based init (Li & Dong 2010) + exact octilinear engine (precomputed offline)' },
  { id: 'hillclimb', init: 'hill', weights: { wBend: 1, wRpos: 2, wLen: 0.1 }, algo: 'hill-climbing init (Stott & Rodgers 2011) + exact octilinear engine (precomputed offline)' },
  { id: 'milp', init: 'geo', weights: { wBend: 1.5, wRpos: 1.5, wLen: 0.1 }, algo: 'MILP (Nöllenburg & Wolff 2011, octilinear, precomputed offline)' },
];

const geojson = JSON.parse(readFileSync('./public/data/taipei/taipei.geojson', 'utf8'));

for (const prof of PROFILES) {
  console.log(`\n=== ${prof.id} ===`);
  // 每次重建乾淨輸入（scale 會就地改寫）
  const fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
  const baseFlat = JSON.parse(JSON.stringify(fields.spaceNetworkGridJsonData));
  const { skeletonFlat, sections } = buildConnectSkeleton(baseFlat);
  const grid = scaleSkeletonToIntegerGrid(skeletonFlat, {});
  const graph = splitHighDegreeNodes(buildSchematicGraph(skeletonFlat), 8);
  const coords0 = initialCoords(graph);
  let pref = null;
  if (prof.init === 'stroke') pref = computePreferredDirs(graph, runStrokeOnGraph(graph, coords0, {}));
  else if (prof.init === 'hill') pref = computePreferredDirs(graph, runHillClimb(graph, coords0, {}).coords);

  const t = Date.now();
  const coords = await engine(graph, prof.weights, pref);
  if (!coords) { console.error(`  ${prof.id} 求解失敗！`); process.exitCode = 1; continue; }
  const viol = countViolations(graph, coords);
  const routePairs = buildSameRouteEdgePairsAtNodes(graph);
  const bend = skeletonBendStats(graph, coords, routePairs);
  const optimizedSkeleton = applyCoordsToSkeleton(skeletonFlat, graph, coords);
  const fullFlat = reinsertBlackStations(optimizedSkeleton, sections);
  const blackCount = sections.reduce((s, sec) => s + (sec.blackNodes?.length || 0), 0);

  const out = {
    algo: prof.algo,
    generatedAt: new Date().toISOString(),
    meta: {
      sourceLayerId: 'osm_2_geojson_2_json',
      gridCols: grid.cols, gridRows: grid.rows, gridScale: Math.round(grid.scale * 1000) / 1000,
      connectCount: grid.connectCount, sectionCount: skeletonFlat.length, blackStationCount: blackCount,
      ...bend, ...viol, precomputed: true,
    },
    fullFlat,
  };
  writeFileSync(`./public/data/taipei/schematic_${prof.id}.json`, JSON.stringify(out));
  console.log(`  ✓ ${prof.id}: ${JSON.stringify(viol)}  段=${fullFlat.length}  (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}
console.log('\n完成。');
