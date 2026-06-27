/**
 * 圖層 #6：Bast, Brosi & Storandt (2020)「Metro Maps on Octilinear Grid Graphs」
 * 快速近似（octilinear 格網最短路放置）（即時求解）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（不預計算、中途不停止、算到完成），
 * 主執行緒顯示計時 overlay，完成跳出耗時。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_BAST_LAYER_ID } from '../layerIds.js';

// 向後相容：離線產生器/工具仍可由此取得格網最短路核心。
export { runBastGrid } from './bastGridCore.js';

export async function executeBast() {
  return runLiveLayout(SCHEMATIC_BAST_LAYER_ID, 'bast', '⑥ 示意圖佈局（Octilinear Grid）');
}
