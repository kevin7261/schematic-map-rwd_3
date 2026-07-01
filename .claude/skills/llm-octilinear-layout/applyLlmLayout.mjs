#!/usr/bin/env node
/**
 * 套用 LLM 座標 → 產出 flat segments JSON + GeoJSON。
 *
 * Usage:
 *   node --loader ./loader.mjs applyLlmLayout.mjs payload.full.json response.json [out.json]
 */

import fs from 'fs';
import { applyLlmLayoutDirectFromPayload } from '../../../src/utils/routeMapAdjust/routeAdjustLayout/llmLayoutCore.js';
import { flatSegmentsToGeojsonStyleExportRows } from '../../../src/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';

function loadPayload(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!raw._skeletonFlat) {
    const fullPath = path.replace(/\.json$/, '.full.json');
    if (fullPath !== path && fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
    throw new Error('Need *.full.json payload');
  }
  return raw;
}

function flatToFeatureCollection(flat) {
  const rows = flatSegmentsToGeojsonStyleExportRows(flat);
  const features = [];
  for (const row of rows) {
    const coords = row.routeCoordinates || [];
    if (coords.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { route_name: row.routeName, element_type: 'way' },
        geometry: {
          type: 'LineString',
          coordinates: coords.map(([lat, lng]) => [lng, lat]),
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function main() {
  const [payloadPath, responsePath, outPath] = process.argv.slice(2);
  if (!payloadPath || !responsePath) {
    console.error('Usage: node --loader ./loader.mjs applyLlmLayout.mjs <payload.full.json> <response.json> [out.json]');
    process.exit(2);
  }
  const payload = loadPayload(payloadPath);
  const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
  let report;
  try {
    report = applyLlmLayoutDirectFromPayload(payload, response);
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }, null, 2));
    process.exit(1);
  }

  const out = outPath || responsePath.replace(/\.json$/i, '') + '.result.json';
  const result = {
    generator: 'llm-octilinear-layout/applyLlmLayout.mjs',
    spaceNetworkGridJsonData: report.fullFlat,
    geojsonData: flatToFeatureCollection(report.fullFlat),
    stats: {
      hvRatio: report.edgeStats.hvRatio,
      changeCount: report.coordChanges.changeCount,
      acceptedMoves: report.incremental?.acceptedCount ?? 0,
      rejectedMoves: report.incremental?.rejectedCount ?? 0,
      geometry: report.geometry,
    },
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ written: out, segmentCount: report.fullFlat.length }, null, 2));
}

main();
