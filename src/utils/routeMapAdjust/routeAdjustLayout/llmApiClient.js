/**
 * LLM JSON 回覆解析：優先直接 parse，其次去除 ```json 圍欄，最後抓最外層 {...}。
 */

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
