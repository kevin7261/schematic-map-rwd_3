/**
 * 手繪 sketch 與「網絡／網格繪製」管線 b 層一對一對應（執行下一步寫入目標）。
 * 各條管線圖層 id 獨立，不與其他群組共用。
 */
export const NETWORK_DRAW_SKETCH_TO_B3_LAYER_ID = {};

/**
 * @param {string} layerId
 * @returns {boolean}
 */
export function isRegisteredNetworkDrawSketchLayerId(layerId) {
  return layerId != null && Object.prototype.hasOwnProperty.call(NETWORK_DRAW_SKETCH_TO_B3_LAYER_ID, layerId);
}

/**
 * @param {string} layerId
 * @returns {boolean}
 */
export function isNetworkDrawSketchPipelineB3LayerId(layerId) {
  if (layerId == null) return false;
  return Object.values(NETWORK_DRAW_SKETCH_TO_B3_LAYER_ID).includes(layerId);
}
