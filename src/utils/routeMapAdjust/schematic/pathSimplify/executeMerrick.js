/**
 * 圖層 #7：Merrick & Gudmundsson (2007)「Path Simplification for Metro Map Layout」
 * C-directed 路徑簡化（依重要度逐路徑、以固定節點為界做 octilinear 簡化）（即時求解）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（不預計算、中途不停止、算到完成），
 * 主執行緒顯示計時 overlay，完成跳出耗時。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_MERRICK_LAYER_ID } from '../layerIds.js';

// 向後相容：離線產生器/工具仍可由此取得路徑簡化核心。
export { runMerrick } from './merrickCore.js';

export async function executeMerrick() {
  return runLiveLayout(SCHEMATIC_MERRICK_LAYER_ID, 'merrick', '⑦ 示意圖佈局（Path Simplification）');
}
