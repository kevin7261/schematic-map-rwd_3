/**
 * 🗺️ 「路線圖調整 → 示意圖佈局」三圖層之執行函式。
 *
 * 與原本 schematic_stroke / schematic_hillclimb / schematic_milp 程式相同（共用 runLiveLayout），
 * 差別只在指向各自的新 layerId（讀其 geojsonData 為輸入、寫結果回該層）。
 * 輸入由 ControlTab「從路線圖調整載入」把 route_map_adjust 轉成 geojsonData 後提供。
 */
import { runLiveLayout } from '@/utils/layers/schematic_layout/runLiveLayout.js';

export const SCHEMATIC_RMA_STROKE_LAYER_ID = 'schematic_rma_stroke';
export const SCHEMATIC_RMA_HILLCLIMB_LAYER_ID = 'schematic_rma_hillclimb';
export const SCHEMATIC_RMA_MILP_LAYER_ID = 'schematic_rma_milp';

export async function executeStrokeFromRoute() {
  return runLiveLayout(SCHEMATIC_RMA_STROKE_LAYER_ID, 'stroke', '① 示意圖佈局（Stroke-based）');
}

export async function executeHillClimbFromRoute() {
  return runLiveLayout(SCHEMATIC_RMA_HILLCLIMB_LAYER_ID, 'hillclimb', '② 示意圖佈局（Hill Climbing）');
}

export async function executeMilpFromRoute() {
  return runLiveLayout(SCHEMATIC_RMA_MILP_LAYER_ID, 'milp', '③ 示意圖佈局（MILP）');
}
