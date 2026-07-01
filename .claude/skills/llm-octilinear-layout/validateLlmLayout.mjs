#!/usr/bin/env node
/**
 * 驗證 LLM 輸出的格網座標（硬約束 H2–H4 + HV 邊統計）。
 *
 * H1 非硬約束：優先水平/垂直，回報 hvEdges / diagonalEdges / skewEdges。
 *
 * Usage:
 *   node --loader ./loader.mjs validateLlmLayout.mjs payload.full.json response.json
 */

import fs from 'fs';
import { buildSchematicGraph } from '../../../src/utils/routeMapAdjust/schematic/graph.js';
import { countViolations } from '../../../src/utils/routeMapAdjust/schematic/repair.js';
import { applyCoordsToSkeleton } from '../../../src/utils/routeMapAdjust/schematic/graph.js';
import { reinsertBlackStations } from '../../../src/utils/routeMapAdjust/schematic/assemble.js';
import { analyzeRoutePairRotation } from '../../../src/utils/routeMapAdjust/schematic/routePairRotationCheck.js';

function loadPayload(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!raw._skeletonFlat) {
    const fullPath = path.replace(/\.json$/, '.full.json');
    if (fullPath !== path && fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
    throw new Error('Need *.full.json payload (run exportPromptPayload.mjs first)');
  }
  return raw;
}

function parseCoords(response, nodeCount) {
  const list = response.coords || response;
  if (!Array.isArray(list)) throw new Error('Response must have coords[] array');
  const coords = Array.from({ length: nodeCount }, () => [0, 0]);
  for (const c of list) {
    const id = Number(c.id);
    if (!Number.isInteger(id) || id < 0 || id >= nodeCount) {
      throw new Error(`Invalid node id ${c.id}`);
    }
    coords[id] = [Math.round(Number(c.x)), Math.round(Number(c.y))];
  }
  for (let i = 0; i < nodeCount; i++) {
    if (coords[i][0] < 0 || coords[i][1] < 0) {
      throw new Error(`Node ${i} has negative coords`);
    }
  }
  return coords;
}

/** 邊方向統計：HV 優先；斜線/斜向不阻擋 pass。 */
function countEdgeDirections(graph, coords) {
  let hvEdges = 0;
  let diagonalEdges = 0;
  let skewEdges = 0;
  const nonHvEdges = [];
  for (const e of graph.edges) {
    const dx = coords[e.v][0] - coords[e.u][0];
    const dy = coords[e.v][1] - coords[e.u][1];
    if (dx === 0 || dy === 0) {
      hvEdges++;
    } else if (Math.abs(dx) === Math.abs(dy)) {
      diagonalEdges++;
      nonHvEdges.push({ edgeId: e.id, u: e.u, v: e.v, dx, dy, kind: 'diagonal' });
    } else {
      skewEdges++;
      nonHvEdges.push({ edgeId: e.id, u: e.u, v: e.v, dx, dy, kind: 'skew' });
    }
  }
  const edgeCount = graph.edges.length;
  return {
    hvEdges,
    diagonalEdges,
    skewEdges,
    edgeCount,
    hvRatio: edgeCount ? hvEdges / edgeCount : 1,
    nonHvEdges,
  };
}

function buildRepairHints(graph, coords, violations, edgeStats) {
  const hints = [];
  if (edgeStats.nonHvEdges.length > 0) {
    hints.push(
      `H1 soft: ${edgeStats.hvEdges}/${edgeStats.edgeCount} edges are HV (${Math.round(edgeStats.hvRatio * 100)}%). Try converting non-HV edges to axis-aligned L-paths where H2–H4 still hold.`
    );
    for (const e of edgeStats.nonHvEdges.slice(0, 8)) {
      hints.push(
        `Edge ${e.edgeId} (node ${e.u}→${e.v}, ${e.kind}): dx=${e.dx} dy=${e.dy}; prefer HV by moving one endpoint to share x or y.`
      );
    }
  }
  if (violations.clashes > 0) {
    hints.push('Multiple nodes share the same grid cell; spread colliding nodes to nearest free cells.');
  }
  if (violations.crossings > 0) {
    hints.push('Non-adjacent edges cross; reroute one edge via L-shaped HV path.');
  }
  if (violations.overlaps > 0) {
    hints.push('Collinear edges overlap; offset parallel corridors or shorten overlapping segments.');
  }
  return hints;
}

export function validateLlmLayout(payload, response) {
  const skeletonFlat = payload._skeletonFlat;
  const sections = payload._sections || [];
  const graph = buildSchematicGraph(skeletonFlat);
  const coords = parseCoords(response, graph.nodes.length);
  const hard = countViolations(graph, coords);
  const edgeStats = countEdgeDirections(graph, coords);

  const optimized = applyCoordsToSkeleton(skeletonFlat, graph, coords);
  const refFull = reinsertBlackStations(JSON.parse(JSON.stringify(skeletonFlat)), sections);
  const outFull = reinsertBlackStations(optimized, sections);
  const rotation = analyzeRoutePairRotation(refFull, outFull, {});

  const rotationFail = rotation.summary?.primaryVerdict === 'FAIL' ? 1 : 0;
  const violations = {
    overlaps: hard.overlaps,
    crossings: hard.crossings,
    clashes: hard.clashes,
    rotationFail,
    ...edgeStats,
  };
  const repairHints = buildRepairHints(graph, coords, violations, edgeStats);
  if (rotationFail && rotation.reasonLines?.length) {
    repairHints.push(...rotation.reasonLines);
  }

  const pass =
    hard.overlaps === 0 &&
    hard.crossings === 0 &&
    hard.clashes === 0 &&
    rotationFail === 0;

  return {
    pass,
    violations,
    repairHints,
    rotation: rotation.summary,
    coords,
  };
}

function main() {
  const [payloadPath, responsePath] = process.argv.slice(2);
  if (!payloadPath || !responsePath) {
    console.error('Usage: node --loader ./loader.mjs validateLlmLayout.mjs <payload.full.json> <response.json>');
    process.exit(2);
  }
  const payload = loadPayload(payloadPath);
  const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
  const report = validateLlmLayout(payload, response);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main();
