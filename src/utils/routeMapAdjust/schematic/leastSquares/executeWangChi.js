/**
 * 圖層 #5：Wang & Chi (2011)「Focus+Context Metro Maps」之最小二乘變形佈局
 * （§3：Ω_ℓ 規則邊長 + Ω_m 均分夾角 + Ω_g 位置錨 → Ω_o 八方向化）（即時精確八方向求解）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（不預計算、中途不停止、算到完成），
 * 主執行緒顯示計時 overlay，完成跳出耗時。最小二乘變形提供方向偏好（八方向化之精神）。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_WANGCHI_LAYER_ID } from '../layerIds.js';

// 向後相容：離線產生器/工具仍可由此取得最小二乘變形核心。
export { runWangChi } from './wangChiCore.js';

export async function executeWangChi() {
  return runLiveLayout(SCHEMATIC_WANGCHI_LAYER_ID, 'wangchi', '⑤ 示意圖佈局（Least-Squares）');
}
