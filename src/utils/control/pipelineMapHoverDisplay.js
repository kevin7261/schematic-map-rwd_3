import {
  setPipelineMapHover,
  clearPipelineMapHover,
} from './pipelineMapHoverFeedback.js';
import { findPipelineGroupName } from '@/utils/pipeline/pipelineLayerSnapshot.js';

export {
  pipelineMapHoverFeedback,
  pipelineMapHoverActiveLayerId,
  clearPipelineMapHover,
} from './pipelineMapHoverFeedback.js';

/** @param {*} dataStore @param {string} layerId */
export function isPipelineMapHoverLayer(dataStore, layerId) {
  return !!(layerId && findPipelineGroupName(dataStore, layerId));
}

/**
 * D3 地圖 tooltip：管線圖層改寫入 Control 頂部；其餘維持 body 浮動 tooltip。
 * @param {*} dataStore
 * @param {string} layerId
 * @param {import('d3-selection').Selection} d3Tooltip
 */
export function createPipelineAwareMapTooltip(dataStore, layerId, d3Tooltip) {
  const useControlPanel = isPipelineMapHoverLayer(dataStore, layerId);

  const show = (html, event) => {
    if (useControlPanel) {
      setPipelineMapHover(layerId, html);
      return;
    }
    d3Tooltip
      .html(html)
      .style('opacity', 1)
      .style('left', `${event.pageX + 10}px`)
      .style('top', `${event.pageY - 10}px`);
  };

  const updateHtml = (html) => {
    if (useControlPanel) {
      setPipelineMapHover(layerId, html);
      return;
    }
    d3Tooltip.html(html);
  };

  const move = (event) => {
    if (useControlPanel) return;
    d3Tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY - 10}px`);
  };

  const hide = () => {
    if (useControlPanel) {
      clearPipelineMapHover(layerId);
      return;
    }
    d3Tooltip.style('opacity', 0);
  };

  return { useControlPanel, show, updateHtml, move, hide };
}

/**
 * Leaflet 圖層 hover：管線圖層 → Control 頂部；其餘 → sticky tooltip。
 * @param {import('leaflet').Layer} leafletLayer
 * @param {string} layerId
 * @param {*} dataStore
 * @param {string} html
 */
export function bindLeafletHoverOrControlPanel(leafletLayer, layerId, dataStore, html) {
  if (!isPipelineMapHoverLayer(dataStore, layerId)) {
    leafletLayer.bindTooltip(html, { sticky: true });
    return;
  }
  // Leaflet 不支援 jQuery 式 namespaced events；必須用原生事件名
  leafletLayer.on('mouseover', () => setPipelineMapHover(layerId, html));
  leafletLayer.on('mouseout', () => clearPipelineMapHover(layerId));
}
