/**
 * AI測試 HV 最佳化 — App ↔ Cursor Agent 檔案橋接
 *
 * **僅限本地 Cursor 開發**：需 `npm run serve`（vue.config.js devServer API），
 * 正式 build／部署不提供此橋接。
 */

const PAYLOAD_URL = '/api/route-adjust-ai-test-hv/payload';
const RESPONSE_URL = '/api/route-adjust-ai-test-hv/response';

/** 是否為本地 dev（Vue CLI development + devServer API） */
export function isAiTestHvLocalDevMode() {
  return process.env.NODE_ENV === 'development';
}

const DEV_ONLY_MSG =
  'HV 最佳化僅限本地 Cursor 開發（npm run serve）；正式部署不提供。';

function assertAiTestHvLocalDev() {
  if (!isAiTestHvLocalDevMode()) {
    throw new Error(DEV_ONLY_MSG);
  }
}

/** @param {object} body */
export async function postAiTestHvPayload(body) {
  assertAiTestHvLocalDev();
  const r = await fetch(PAYLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) {
      throw new Error('devServer API 未就緒：請在本機執行 npm run serve 後再試');
    }
    throw new Error(data.error || `同步 payload 失敗 (${r.status})`);
  }
  return data;
}

/** @returns {Promise<object|null>} */
export async function fetchAiTestHvResponse() {
  assertAiTestHvLocalDev();
  const r = await fetch(RESPONSE_URL);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `讀取 response 失敗 (${r.status})`);
  if (data.missing) return null;
  return data;
}

export async function deleteAiTestHvResponse() {
  if (!isAiTestHvLocalDevMode()) return { ok: true };
  const r = await fetch(RESPONSE_URL, { method: 'DELETE' });
  if (r.status === 404) return { ok: true };
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `清除 response 失敗 (${r.status})`);
  return data;
}

const AUDIT_URL = '/api/route-adjust-ai-test-hv/audit';

/** LLM 反驗證結果（validate-ai-test-hv skill 寫入） @returns {Promise<object|null>} */
export async function fetchAiTestHvAudit() {
  assertAiTestHvLocalDev();
  const r = await fetch(AUDIT_URL);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `讀取 audit 失敗 (${r.status})`);
  if (data.missing) return null;
  return data;
}

export async function deleteAiTestHvAudit() {
  if (!isAiTestHvLocalDevMode()) return { ok: true };
  const r = await fetch(AUDIT_URL, { method: 'DELETE' });
  if (r.status === 404) return { ok: true };
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `清除 audit 失敗 (${r.status})`);
  return data;
}
