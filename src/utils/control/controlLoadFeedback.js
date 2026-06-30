/**
 * Control 分頁：載入／匯入操作之 inline 訊息（取代 window.alert）。
 * 以 layerId 為鍵，在對應按鈕區塊下方顯示。
 */
import { reactive } from 'vue';

/** @type {Record<string, { message: string, tone: 'muted'|'success'|'danger' }>} */
export const controlLoadFeedback = reactive({});

/**
 * @param {string} layerId
 * @param {string|null|undefined} message
 * @param {'muted'|'success'|'danger'} [tone='muted']
 */
export function setControlLoadFeedback(layerId, message, tone = 'muted') {
  if (!layerId) return;
  if (!message) {
    delete controlLoadFeedback[layerId];
    return;
  }
  controlLoadFeedback[layerId] = { message, tone };
}

/** @param {'muted'|'success'|'danger'|undefined} tone */
export function controlLoadFeedbackClass(tone) {
  if (tone === 'success') return 'text-success';
  if (tone === 'danger') return 'text-danger';
  return 'text-muted';
}
