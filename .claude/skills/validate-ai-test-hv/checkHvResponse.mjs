#!/usr/bin/env node
/**
 * AI測試 HV 反驗證 — 讀 payload + response，寫 audit 報告
 *
 * Usage:
 *   node --loader ./loader.mjs .claude/skills/validate-ai-test-hv/checkHvResponse.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditHvOptimizeResponse } from '../../../src/utils/uniformGridHvOptimize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const payloadPath = path.join(repoRoot, 'public/data/ai_test/hv_payload.json');
const responsePath = path.join(repoRoot, 'public/data/ai_test/hv_response.json');
const auditPath = path.join(repoRoot, 'public/data/ai_test/hv_audit.json');

function payloadFromStored(stored) {
  const { network } = stored;
  return {
    meta: network.meta,
    movablePoints: network.movablePoints.map((p) => ({ ...p, routeRefs: [] })),
    edges: network.edges,
    routePointIds: network.topology.routeKeypointSequences,
    routeKeypointIds: network.topology.routeKeypointSequences,
  };
}

function main() {
  if (!fs.existsSync(payloadPath)) {
    console.error('hv_payload.json 不存在，請先在 App 按「HV 最佳化」。');
    process.exit(2);
  }
  if (!fs.existsSync(responsePath)) {
    console.error('hv_response.json 不存在，請先完成 LLM 推理並 writeResponse.mjs。');
    process.exit(2);
  }

  const stored = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const responseBody = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
  const payload = payloadFromStored(stored);

  const report = auditHvOptimizeResponse(payload, responseBody, {
    routesFingerprint: stored.routesFingerprint,
  });

  const body = {
    ...report,
    routesFingerprint: stored.routesFingerprint,
    responseModel: responseBody.model ?? null,
    writtenAt: Date.now(),
  };

  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(body, null, 2));

  console.log(JSON.stringify({ ok: report.pass, path: auditPath, violationCount: report.violations.length }, null, 2));
  if (!report.pass && report.violations.length) {
    console.error('Violations (first 10):');
    report.violations.slice(0, 10).forEach((v) => console.error(`- [${v.phase || 'meta'}] ${v.message}`));
  }
  process.exit(report.pass ? 0 : 1);
}

main();
