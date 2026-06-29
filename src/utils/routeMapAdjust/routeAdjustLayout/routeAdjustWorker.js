/* eslint-disable no-restricted-globals */
/**
 * Web Worker：站點與路線調整八演算法（背景求解，演算法核心委派 schematic/solveSchematic）。
 */
import { solveSchematic } from '../schematic/solveSchematic.js';

self.onmessage = async (e) => {
  const { skeletonFlat, profileId } = e.data || {};
  try {
    const res = await solveSchematic(skeletonFlat, profileId, (msg) => {
      self.postMessage({ type: 'progress', msg });
    });
    self.postMessage({ type: 'done', result: res });
  } catch (err) {
    self.postMessage({
      type: 'done',
      result: { ok: false, message: String(err?.message || err) },
    });
  }
};
