/**
 * 圖層 #8：Fuchs (TU Wien 2022)「SAT-based Optimization of Octolinear Metro Map Layouts」
 * Nöllenburg & Wolff MILP 的 SAT 對應版（CNF 直譯 + weighted-partial MaxSAT）；
 * 精確八方向、無重疊、消交叉（惰性平面性），保拓樸（即時求解）。
 *
 * 按「執行」→ 在 Web Worker 即時求解（logic-solver 純 JS，主執行緒不凍結 → 計時可動）。
 * ⚠️ 此法比 ③ MILP 更慢（論文 Table 5.3）：瀏覽器端僅小骨架(~25 節點)可解，大城市會逾時。
 */

import { runLiveLayout } from '../runLiveLayout.js';
import { SCHEMATIC_SAT_LAYER_ID } from '../layerIds.js';

// 向後相容：離線工具仍可由此取得 SAT 核心。
export { runSat } from './satCore.js';

export async function executeSat() {
  return runLiveLayout(SCHEMATIC_SAT_LAYER_ID, 'sat', '⑧ 示意圖佈局（SAT）');
}
