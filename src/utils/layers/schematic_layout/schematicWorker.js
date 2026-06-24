/* eslint-disable no-restricted-globals */
/**
 * Web Worker：在背景執行緒求解精確八方向佈局，避免凍結主執行緒
 * （主執行緒得以更新 overlay 計時、保持可互動）。
 */
import { solveSchematic } from './solveSchematic.js';

self.onmessage = async (e) => {
  const { skeletonFlat, profileId } = e.data || {};
  try {
    const res = await solveSchematic(skeletonFlat, profileId, (msg) => {
      self.postMessage({ type: 'progress', msg });
    });
    self.postMessage({ type: 'done', result: res });
  } catch (err) {
    self.postMessage({ type: 'done', result: { ok: false, message: String(err?.message || err) } });
  }
};
