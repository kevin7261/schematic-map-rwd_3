#!/usr/bin/env node
/**
 * 從骨架 GeoJSON 匯出 LLM prompt payload。
 *
 * Usage:
 *   node --loader ./loader.mjs exportPromptPayload.mjs input.geojson [out.json]
 */

import fs from 'fs';
import { buildRotationRefFromGeojson } from '../../../src/utils/routeMapAdjust/schematic/buildRotationRef.js';
import { buildLlmPayloadFromSkeleton, stripLlmPayloadForExport } from '../../../src/utils/routeMapAdjust/routeAdjustLayout/llmLayoutCore.js';

export function exportPayloadFromGeojson(geojson) {
  const { skeletonFlat, refAngleFlat, sections } = buildRotationRefFromGeojson(geojson);
  return buildLlmPayloadFromSkeleton(skeletonFlat, refAngleFlat, sections);
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
  const forLlm = stripLlmPayloadForExport(payload);
  fs.writeFileSync(out, JSON.stringify(forLlm, null, 2));
  fs.writeFileSync(out.replace(/\.json$/, '.full.json'), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ written: out, full: out.replace(/\.json$/, '.full.json'), ...forLlm.meta }, null, 2));
}

main();
