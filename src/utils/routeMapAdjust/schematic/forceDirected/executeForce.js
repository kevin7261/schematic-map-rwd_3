/**
 * 圖層 #4：Hong, Merrick & do Nascimento (2006)「Automatic visualisation of metro maps」
 * 力導向法（Method 5：修改版 PrEd + 正交/45° 磁簧力）（即時精確八方向求解）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（不預計算、中途不停止、算到完成），
 * 主執行緒顯示計時 overlay，完成跳出耗時。力導向法提供方向偏好（磁簧把邊對齊 8 方向之精神）。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_FORCE_LAYER_ID } from '../layerIds.js';

// 向後相容：離線產生器/工具仍可由此取得力導向核心。
export { runForceDirected } from './forceCore.js';

export async function executeForce() {
  return runLiveLayout(SCHEMATIC_FORCE_LAYER_ID, 'force', '④ 示意圖佈局（Force-directed）');
}
