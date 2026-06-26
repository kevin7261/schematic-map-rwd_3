/**
 * 圖層 #2：Stott & Rodgers (2011) Hill Climbing（即時精確八方向求解）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（不預計算、中途不停止、算到完成），
 * 主執行緒顯示計時 overlay，完成跳出耗時。hill-climb 提供方向偏好（多準則精神）。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_HILLCLIMB_LAYER_ID } from '../layerIds.js';

// 向後相容：離線產生器/工具仍可由此取得 hill-climb 核心。
export { runHillClimb } from './hillClimbCore.js';

export async function executeHillClimb() {
  return runLiveLayout(SCHEMATIC_HILLCLIMB_LAYER_ID, 'hillclimb', '② 示意圖佈局（Hill Climbing）');
}
