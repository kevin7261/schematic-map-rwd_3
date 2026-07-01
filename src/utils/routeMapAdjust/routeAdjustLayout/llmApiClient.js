/**
 * LLM API 客戶端：優先走 dev server proxy（/api/llm-layout），否則用 localStorage API Key 直連。
 */

const LS_KEY = 'schematicMapLlmApiKey';
const LS_BASE = 'schematicMapLlmApiBase';
const LS_MODEL = 'schematicMapLlmModel';
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.4';

export function getLlmApiSettings() {
  if (typeof localStorage === 'undefined') {
    return { apiKey: '', apiBase: DEFAULT_BASE, model: DEFAULT_MODEL };
  }
  return {
    apiKey: localStorage.getItem(LS_KEY) || '',
    apiBase: localStorage.getItem(LS_BASE) || DEFAULT_BASE,
    model: localStorage.getItem(LS_MODEL) || DEFAULT_MODEL,
  };
}

export function saveLlmApiSettings({ apiKey, apiBase, model }) {
  if (typeof localStorage === 'undefined') return;
  if (apiKey != null) {
    if (apiKey) localStorage.setItem(LS_KEY, apiKey);
    else localStorage.removeItem(LS_KEY);
  }
  if (apiBase != null) localStorage.setItem(LS_BASE, apiBase || DEFAULT_BASE);
  if (model != null) localStorage.setItem(LS_MODEL, model || DEFAULT_MODEL);
}

/** @param {string} text */
export function parseLlmJsonResponse(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('LLM 回覆為空');
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error('無法解析 LLM JSON 回覆');
}

/** gpt-5.x 僅支援 temperature 預設值 1，不可傳 0.2 */
export function buildChatCompletionRequestBody(model, messages) {
  const body = {
    model,
    messages,
    response_format: { type: 'json_object' },
  };
  if (!/^gpt-5/i.test(String(model))) {
    body.temperature = 0.2;
  }
  return body;
}

/**
 * @param {Array<{role:string,content:string}>} messages
 * @returns {Promise<object>} parsed coords JSON
 */
export async function callLlmLayoutChat(messages) {
  const settings = getLlmApiSettings();
  let content = null;
  let lastErr = null;

  // 1) dev proxy（OPENAI_API_KEY 設在 npm run serve 環境）
  try {
    const proxyRes = await fetch('/api/llm-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: settings.model }),
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.ok && data.content) content = data.content;
      else lastErr = new Error(data.error || 'LLM proxy 失敗');
    } else if (proxyRes.status !== 404 && proxyRes.status !== 503) {
      const data = await proxyRes.json().catch(() => ({}));
      lastErr = new Error(data.error || `LLM proxy HTTP ${proxyRes.status}`);
    }
  } catch (e) {
    lastErr = e;
  }

  // 2) 直連 OpenAI-compatible API
  if (!content) {
    if (!settings.apiKey) {
      throw new Error(
        lastErr?.message ||
          '未設定 LLM：請在 dev server 環境設 OPENAI_API_KEY（.env.local）後重啟 npm run serve'
      );
    }
    const base = settings.apiBase.replace(/\/$/, '');
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionRequestBody(settings.model, messages)),
    });
    const data = await r.json();
    if (!r.ok) {
      throw new Error(data.error?.message || `LLM HTTP ${r.status}`);
    }
    content = data.choices?.[0]?.message?.content;
  }

  return parseLlmJsonResponse(content);
}
