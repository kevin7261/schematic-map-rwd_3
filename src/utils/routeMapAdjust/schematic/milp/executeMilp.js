/**
 * 圖層 #3：Nöllenburg & Wolff (2011) MILP（即時精確八方向求解）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（不預計算、中途不停止、算到完成），
 * 主執行緒顯示計時 overlay，完成跳出耗時。地理初始化 + 平衡權重（論文基準）。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_MILP_LAYER_ID } from '../layerIds.js';

export async function executeMilp() {
  return runLiveLayout(SCHEMATIC_MILP_LAYER_ID, 'milp', '③ 示意圖佈局（MILP）');
}
