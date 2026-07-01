#!/usr/bin/env node
/**
 * 套用 LLM 座標 → 產出 flat segments JSON + GeoJSON。
 *
 * Usage:
 *   node --loader ./loader.mjs applyLlmLayout.mjs payload.full.json response.json [out.json]
 */

import fs from 'fs';
import { buildSchematicGraph, applyCoordsToSkeleton } from '../../../src/utils/routeMapAdjust/schematic/graph.js';
import { reinsertBlackStations } from '../../../src/utils/routeMapAdjust/schematic/assemble.js';
import { flatSegmentsToGeojsonStyleExportRows } from '../../../src/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { validateLlmLayout } from './validateLlmLayout.mjs';

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
        properties: {
          route_name: row.routeName,
          element_type: 'way',
        },
        geometry: {
          type: 'LineString',
          coordinates: coords.map(([lat, lng]) => [lng, lat]),
        },
      });
    }
    for (const st of row.segment?.stations || []) {
      if (st.lat == null || st.lon == null) continue;
      features.push({
        type: 'Feature',
        properties: {
          station_name: st.station_name,
          station_id: st.station_id,
          element_type: 'node',
        },
        geometry: { type: 'Point', coordinates: [st.lon, st.lat] },
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
  const report = validateLlmLayout(payload, response);
  if (!report.pass) {
    console.error(JSON.stringify({ error: 'Validation failed', ...report }, null, 2));
    process.exit(1);
  }

  const graph = buildSchematicGraph(payload._skeletonFlat);
  const optimized = applyCoordsToSkeleton(payload._skeletonFlat, graph, report.coords);
  const fullFlat = reinsertBlackStations(optimized, payload._sections || []);
  const geojson = flatToFeatureCollection(fullFlat);

  const out = outPath || responsePath.replace(/\.json$/i, '') + '.result.json';
  const result = {
    generator: 'llm-octilinear-layout/applyLlmLayout.mjs',
    spaceNetworkGridJsonData: fullFlat,
    geojsonData: geojson,
    validation: { pass: true, violations: report.violations },
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ written: out, segmentCount: fullFlat.length, nodeCount: graph.nodes.length }, null, 2));
}

main();
