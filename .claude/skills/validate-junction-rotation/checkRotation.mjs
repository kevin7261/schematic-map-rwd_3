#!/usr/bin/env node
/**
 * CLI：分歧點 branch CCW 環序（共用 src/routePairRotationCheck.js）
 *
 * 輸入 GeoJSON 經與 app 相同管線（geojson→connect 骨架→格網 ref + 縮放前經緯度離開角）再比對結果。
 *
 * Usage:
 *   node --loader ./loader.mjs .claude/skills/validate-junction-rotation/checkRotation.mjs input.json result.json
 */

import fs from 'fs';
import {
  analyzeRoutePairRotation,
  geojsonToCheckFlat,
  DEFAULT_OFFLINE_SNAP_DEG,
} from '../../../src/utils/routeMapAdjust/schematic/routePairRotationCheck.js';
import { buildRotationRefFromGeojson } from '../../../src/utils/routeMapAdjust/schematic/buildRotationRef.js';

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let snapDeg = DEFAULT_OFFLINE_SNAP_DEG;
  const snapIdx = process.argv.indexOf('--snap-deg');
  if (snapIdx >= 0 && process.argv[snapIdx + 1]) snapDeg = Number(process.argv[snapIdx + 1]);

  const [refPath, outPath] = args;
  if (!refPath || !outPath) {
    console.error(
      'Usage: node --loader ./loader.mjs checkRotation.mjs <skeleton.json> <result.json> [--snap-deg 30]'
    );
    process.exit(2);
  }

  const refFc = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const outFc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const { refFull, refAngleFlat } = buildRotationRefFromGeojson(refFc);
  const report = analyzeRoutePairRotation(refFull, geojsonToCheckFlat(outFc), {
    refAngleFlat,
    snapDeg,
  });

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.primaryVerdict === 'PASS' ? 0 : 1);
}

main();
