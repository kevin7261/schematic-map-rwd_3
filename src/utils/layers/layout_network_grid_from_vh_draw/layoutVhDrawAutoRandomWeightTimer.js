import { ref } from 'vue';

export const LAYOUT_VH_DRAW_AUTO_RANDOM_WEIGHT_MS = 5000;

/** 目前正在自動隨機 weight 的 layout 圖層 layerId */
export const layoutVhDrawAutoRandomWeightLayerId = ref(null);

let intervalId = null;
let runInFlight = false;

export function isLayoutVhDrawAutoRandomWeightActive(layerId) {
  if (layerId == null) return false;
  return layoutVhDrawAutoRandomWeightLayerId.value === String(layerId);
}

export function stopLayoutVhDrawAutoRandomWeight() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  runInFlight = false;
  layoutVhDrawAutoRandomWeightLayerId.value = null;
}

/**
 * @param {string} layerId
 * @param {() => void | Promise<void>} randomizeFn
 */
export function startLayoutVhDrawAutoRandomWeight(layerId, randomizeFn) {
  stopLayoutVhDrawAutoRandomWeight();
  const id = String(layerId);
  layoutVhDrawAutoRandomWeightLayerId.value = id;

  const runOnce = async () => {
    if (layoutVhDrawAutoRandomWeightLayerId.value !== id) return;
    if (runInFlight) return;
    runInFlight = true;
    try {
      await randomizeFn();
    } catch (err) {
      console.error(err);
      stopLayoutVhDrawAutoRandomWeight();
    } finally {
      runInFlight = false;
    }
  };

  runOnce();
  intervalId = setInterval(runOnce, LAYOUT_VH_DRAW_AUTO_RANDOM_WEIGHT_MS);
}

/**
 * @param {string} layerId
 * @param {() => void | Promise<void>} randomizeFn
 * @returns {boolean} 啟動後為 true，停止後為 false
 */
export function toggleLayoutVhDrawAutoRandomWeight(layerId, randomizeFn) {
  if (isLayoutVhDrawAutoRandomWeightActive(layerId)) {
    stopLayoutVhDrawAutoRandomWeight();
    return false;
  }
  startLayoutVhDrawAutoRandomWeight(layerId, randomizeFn);
  return true;
}
