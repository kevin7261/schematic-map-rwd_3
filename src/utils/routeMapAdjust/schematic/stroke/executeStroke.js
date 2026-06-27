/**
 * 圖層 #1：Li & Dong (2010) stroke-based（成筆畫 → 排序 → 垂直投影直線化）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（不預計算、中途不停止、算到完成），
 * 主執行緒顯示計時 overlay，完成跳出耗時。本圖層輸出 stroke 演算法自己的座標，
 * 不接 MILP（論文忠實度要求）。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_STROKE_LAYER_ID } from '../layerIds.js';

// 向後相容：離線產生器/工具仍可由此取得 stroke 核心。
export { runStrokeOnGraph } from './strokeCore.js';

export async function executeStroke() {
  return runLiveLayout(SCHEMATIC_STROKE_LAYER_ID, 'stroke', '① 示意圖佈局（Stroke-based）');
}
