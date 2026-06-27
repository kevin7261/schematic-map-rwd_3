#!/usr/bin/env node
/**
 * CLI：分歧點路線對 CCW 環序（共用 src/routePairRotationCheck.js）
 *
 * Usage:
 *   node checkRotation.mjs skeleton.json result.json [--strict] [--snap-deg 30]
 */

import fs from 'fs';
import {
  analyzeRoutePairRotation,
  geojsonToCheckFlat,
  DEFAULT_OFFLINE_SNAP_DEG,
} from '../../../src/utils/routeMapAdjust/schematic/routePairRotationCheck.js';

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const strict = process.argv.includes('--strict');
  let snapDeg = DEFAULT_OFFLINE_SNAP_DEG;
  const snapIdx = process.argv.indexOf('--snap-deg');
  if (snapIdx >= 0 && process.argv[snapIdx + 1]) snapDeg = Number(process.argv[snapIdx + 1]);

  const [refPath, outPath] = args;
  if (!refPath || !outPath) {
    console.error('Usage: node checkRotation.mjs <skeleton.json> <result.json> [--strict] [--snap-deg 30]');
    process.exit(2);
  }

  const refFc = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const outFc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const report = analyzeRoutePairRotation(geojsonToCheckFlat(refFc), geojsonToCheckFlat(outFc), { snapDeg });

  if (!strict) delete report.branchStrict;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.primaryVerdict === 'PASS' ? 0 : 1);
}

main();
