/**
 * 管線四階段圖層：地圖 hover 資訊改顯示於 Control「操作」分頁頂部（非浮動 tooltip）。
 */
import { reactive, ref } from 'vue';

/** @type {Record<string, { html: string }>} */
export const pipelineMapHoverFeedback = reactive({});

/** 目前正在 hover 的管線圖層（供 Control 分頁顯示，不依 Control 自身選取的 tab） */
export const pipelineMapHoverActiveLayerId = ref(null);

/** @param {string} layerId @param {string|null|undefined} html */
export function setPipelineMapHover(layerId, html) {
  if (!layerId) return;
  if (html == null || html === '') {
    delete pipelineMapHoverFeedback[layerId];
    if (pipelineMapHoverActiveLayerId.value === layerId) {
      pipelineMapHoverActiveLayerId.value = null;
    }
    return;
  }
  pipelineMapHoverFeedback[layerId] = { html: String(html) };
  pipelineMapHoverActiveLayerId.value = layerId;
}

/** @param {string} layerId */
export function clearPipelineMapHover(layerId) {
  if (!layerId) return;
  delete pipelineMapHoverFeedback[layerId];
  if (pipelineMapHoverActiveLayerId.value === layerId) {
    pipelineMapHoverActiveLayerId.value = null;
  }
}
