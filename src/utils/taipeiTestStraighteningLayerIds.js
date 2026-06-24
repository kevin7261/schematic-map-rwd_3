/**
 * 原「空間網絡網格測試_2」之 a 直線化圖層（taipei_a2）已移除。
 */
export const TAIPEI_TEST_STRAIGHTENING_LAYER_IDS = [];

export function isTaipeiTestStraighteningLayerId(layerId) {
  return layerId != null && TAIPEI_TEST_STRAIGHTENING_LAYER_IDS.includes(layerId);
}
