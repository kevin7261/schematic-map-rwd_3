#!/usr/bin/env node
/**
 * Cursor Agent：將 HV 最佳化結果寫入 App 可讀取的 response 檔。
 *
 * Usage:
 *   node .claude/skills/ai-test-hv-optimize/writeResponse.mjs '{"coords":[...]}'
 *   node .claude/skills/ai-test-hv-optimize/writeResponse.mjs /path/to/response.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const responsePath = path.join(repoRoot, 'public/data/ai_test/hv_response.json');
const payloadPath = path.join(repoRoot, 'public/data/ai_test/hv_payload.json');

function readJsonArg(arg) {
  if (!arg) throw new Error('Usage: writeResponse.mjs <json-string|file.json>');
  if (arg.endsWith('.json') && fs.existsSync(arg)) {
    return JSON.parse(fs.readFileSync(arg, 'utf8'));
  }
  return JSON.parse(arg);
}

function main() {
  const body = readJsonArg(process.argv[2]);
  if (!Array.isArray(body.coords)) {
    throw new Error('response 須含 coords 陣列');
  }
  if (!body.routesFingerprint && fs.existsSync(payloadPath)) {
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    body.routesFingerprint = payload.routesFingerprint;
  }
  if (!body.computedBy) {
    body.computedBy = 'llm';
  }
  if (body.computedBy !== 'llm') {
    throw new Error('【鐵律】HV response 須 computedBy: "llm" — 座標只能由 LLM 推理，禁止腳本／程式求解');
  }
  if (!body.model) {
    body.model = process.env.CURSOR_AGENT_MODEL || 'Cursor Agent（LLM）';
  }
  body.writtenAt = Date.now();
  fs.mkdirSync(path.dirname(responsePath), { recursive: true });
  fs.writeFileSync(responsePath, JSON.stringify(body, null, 2));
  console.log(JSON.stringify({ ok: true, path: responsePath, coordCount: body.coords.length }, null, 2));
}

main();
