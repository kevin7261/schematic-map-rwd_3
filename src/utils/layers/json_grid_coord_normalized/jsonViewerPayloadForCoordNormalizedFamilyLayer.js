import {
  JSON_GRID_COORD_NORMALIZED_LAYER_ID,
  isCoordNormalizedDataJsonMirrorFollowonLayerId,
} from './layerIds.js';

/**
 * 與 Upper「json-viewer」（SpaceNetworkGridJsonDataTab）對 coord-normalized 家族圖層之顯示優先序一致：
 * spaceNetworkGridJsonData（非空陣列）→ processedJsonData → dashboardData。
 *
 * @param {{ layerId?: string, spaceNetworkGridJsonData?: unknown[], processedJsonData?: unknown, dashboardData?: unknown }|null|undefined} layer
 * @returns {unknown|null}
 */
export function jsonViewerPayloadForCoordNormalizedFamilyLayer(layer) {
  if (!layer?.layerId) return null;
  if (
    layer.layerId !== JSON_GRID_COORD_NORMALIZED_LAYER_ID &&
    !isCoordNormalizedDataJsonMirrorFollowonLayerId(layer.layerId)
  ) {
    return null;
  }
  const sn = layer.spaceNetworkGridJsonData;
  if (Array.isArray(sn) && sn.length > 0) return sn;
  if (layer.processedJsonData != null) return layer.processedJsonData;
  if (layer.dashboardData != null) return layer.dashboardData;
  return null;
}
