#!/usr/bin/env node
/**
 * 驗證 LLM 輸出的格網座標（硬約束 H2–H4 + HV 邊統計）。
 *
 * Usage:
 *   node --loader ./loader.mjs validateLlmLayout.mjs payload.full.json response.json
 */

import fs from 'fs';
import { validateLlmLayoutFromPayload } from '../../../src/utils/routeMapAdjust/routeAdjustLayout/llmLayoutCore.js';

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

function main() {
  const [payloadPath, responsePath] = process.argv.slice(2);
  if (!payloadPath || !responsePath) {
    console.error('Usage: node --loader ./loader.mjs validateLlmLayout.mjs <payload.full.json> <response.json>');
    process.exit(2);
  }
  const payload = loadPayload(payloadPath);
  const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
  try {
    const report = validateLlmLayoutFromPayload(payload, response);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.pass ? 0 : 1);
  } catch (e) {
    console.error(JSON.stringify({ pass: false, error: e.message }, null, 2));
    process.exit(1);
  }
}

main();
