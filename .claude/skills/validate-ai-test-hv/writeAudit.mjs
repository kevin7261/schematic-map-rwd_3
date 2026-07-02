#!/usr/bin/env node
/**
 * Cursor Agent：將 LLM 反驗證（audit）結論寫入 hv_audit.json。
 *
 * 鐵律：本檔只寫檔，不做任何幾何檢查或計算；audit 判定只能由 LLM 在對話中推理完成。
 *
 * Usage:
 *   node .claude/skills/validate-ai-test-hv/writeAudit.mjs '{"auditedBy":"llm","pass":true,"violations":[]}'
 *   node .claude/skills/validate-ai-test-hv/writeAudit.mjs /path/to/audit.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const auditPath = path.join(repoRoot, 'public/data/ai_test/hv_audit.json');
const payloadPath = path.join(repoRoot, 'public/data/ai_test/hv_payload.json');

function readJsonArg(arg) {
  if (!arg) throw new Error('Usage: writeAudit.mjs <json-string|file.json>');
  if (arg.endsWith('.json') && fs.existsSync(arg)) {
    return JSON.parse(fs.readFileSync(arg, 'utf8'));
  }
  return JSON.parse(arg);
}

function main() {
  const body = readJsonArg(process.argv[2]);
  if (!body.auditedBy) {
    body.auditedBy = 'llm';
  }
  if (body.auditedBy !== 'llm') {
    throw new Error('【鐵律】hv_audit 須 auditedBy: "llm" — audit 判定只能由 LLM 推理，禁止程式 audit 腳本');
  }
  if (typeof body.pass !== 'boolean') {
    throw new Error('audit 須含 pass（boolean）');
  }
  if (!Array.isArray(body.violations)) {
    throw new Error('audit 須含 violations 陣列（PASS 時為 []）');
  }
  if (body.pass && body.violations.length) {
    throw new Error('pass: true 時 violations 必須為空陣列');
  }
  if (!body.routesFingerprint && fs.existsSync(payloadPath)) {
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    body.routesFingerprint = payload.routesFingerprint;
  }
  if (!body.model) {
    body.model = process.env.CURSOR_AGENT_MODEL || 'Cursor Agent（LLM）';
  }
  body.writtenAt = Date.now();
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(body, null, 2));
  console.log(
    JSON.stringify(
      { ok: true, path: auditPath, pass: body.pass, violationCount: body.violations.length },
      null,
      2
    )
  );
}

main();
