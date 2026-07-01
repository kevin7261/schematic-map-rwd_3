#!/usr/bin/env node
/**
 * 從骨架 GeoJSON 匯出 LLM prompt payload（connect 圖 + 地理提示 + 分歧環序）。
 *
 * Usage:
 *   node --loader ./loader.mjs .claude/skills/llm-octilinear-layout/exportPromptPayload.mjs input.geojson [out.json]
 *
 * 產出兩檔：
 *   *.llm-payload.json      — 給 LLM（不含 skeleton）
 *   *.llm-payload.full.json — 含 skeleton/graph，供 validate/apply
 */

import fs from 'fs';
import { buildRotationRefFromGeojson } from '../../../src/utils/routeMapAdjust/schematic/buildRotationRef.js';
import { buildSchematicGraph } from '../../../src/utils/routeMapAdjust/schematic/graph.js';
import { buildJunctionTable, spokesFrom, orderedNKeys } from '../../../src/utils/routeMapAdjust/schematic/rotationStructure.js';
import { readPt } from '../../../src/utils/routeMapAdjust/schematic/input.js';

function keyToName(key) {
  if (key.startsWith('n:')) return key.slice(2);
  return key;
}

export function exportPayloadFromGeojson(geojson) {
  const { skeletonFlat, refAngleFlat, sections } = buildRotationRefFromGeojson(geojson);
  const graph = buildSchematicGraph(skeletonFlat);

  const nodes = graph.nodes.map((nd) => {
    let geo = null;
    for (const ref of nd.refs) {
      const seg = refAngleFlat[ref.si];
      const [lon, lat] = readPt(seg?.points?.[ref.pi]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        geo = [lon, lat];
        break;
      }
    }
    return {
      id: nd.id,
      key: nd.key,
      name: keyToName(nd.key),
      geo,
      initial_grid: [nd.x, nd.y],
    };
  });

  const edges = graph.edges.map((e) => ({
    id: e.id,
    u: e.u,
    v: e.v,
    routes: [...(e.routes || new Set([e.route_name].filter(Boolean)))],
  }));

  const juncTable = buildJunctionTable(refAngleFlat);
  const junctions = [];
  for (const [jKey, junction] of juncTable) {
    if (junction.branches.size < 3) continue;
    const spokes = spokesFrom(junction, refAngleFlat, refAngleFlat);
    const branchOrderCCW = orderedNKeys(spokes, spokes.map((s) => s.nKey));
    junctions.push({
      junctionKey: jKey,
      junctionName: keyToName(jKey),
      branchOrderCCW,
      branches: spokes.map((s) => ({
        branchKey: s.nKey,
        branchName: keyToName(s.nKey),
        leaveAngleDeg: Math.round((s.ang * 180) / Math.PI),
        routes: s.routes,
      })),
    });
  }

  const xs = nodes.map((n) => n.initial_grid[0]);
  const ys = nodes.map((n) => n.initial_grid[1]);
  const initialSpan = Math.max(
    xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
    1
  );

  return {
    meta: {
      connectCount: nodes.length,
      edgeCount: edges.length,
      initialSpan,
      source: 'exportPromptPayload.mjs',
    },
    nodes,
    edges,
    junctions,
    output_schema: {
      coords: nodes.map((n) => ({ id: n.id, x: n.initial_grid[0], y: n.initial_grid[1] })),
    },
    _skeletonFlat: skeletonFlat,
    _sections: sections,
    _graphMeta: { spreadCount: graph.spreadCount, dupCollapsed: graph.dupCollapsed },
  };
}

function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath) {
    console.error('Usage: node --loader ./loader.mjs exportPromptPayload.mjs <input.geojson> [out.json]');
    process.exit(2);
  }
  const geojson = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const payload = exportPayloadFromGeojson(geojson);
  const out = outPath || inPath.replace(/\.(geojson|json)$/i, '') + '.llm-payload.json';
  const { _skeletonFlat, _sections, _graphMeta, ...forLlm } = payload;
  fs.writeFileSync(out, JSON.stringify(forLlm, null, 2));
  fs.writeFileSync(out.replace(/\.json$/, '.full.json'), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ written: out, full: out.replace(/\.json$/, '.full.json'), ...forLlm.meta }, null, 2));
}

main();
