/**
 * 七個「示意圖佈局」比較圖層的 layerId（照原編號排序）。
 *  #1 Li & Dong (2010)              — stroke-based 示意圖方法（octilinear，8 方向）
 *  #2 Stott & Rodgers (2011)        — Hill Climbing 多準則最佳化
 *  #3 Nöllenburg & Wolff (2011)     — MILP（octilinear，HiGHS 求解）
 *  #4 Hong, Merrick & do Nascimento (2006) — 力導向（Method 5：PrEd + 正交/45° 磁簧力）
 *  #5 Wang & Chi (2011)             — Focus+Context 最小二乘變形（Ω_ℓ/Ω_m/Ω_g → Ω_o）
 *  #6 Bast, Brosi & Storandt (2020) — Octilinear Grid Graph 最短路近似
 *  #7 Merrick & Gudmundsson (2007)  — C-directed 路徑簡化
 *
 * 各圖層共用建圖/骨架/渲染，只最佳化 connect 紅藍骨架，黑點最後沿邊內插放回。
 */

/** #1 Li & Dong (2010) stroke-based（8 方向 octilinear）— 路線圖調整骨架版（獨立複製） */
export const SCHEMATIC_STROKE_LAYER_ID = 'schematic_rma_stroke';
export const SCHEMATIC_HILLCLIMB_LAYER_ID = 'schematic_rma_hillclimb';
export const SCHEMATIC_MILP_LAYER_ID = 'schematic_rma_milp';
/** #4 Hong et al. (2006) 力導向 spring 法 */
export const SCHEMATIC_FORCE_LAYER_ID = 'schematic_rma_force';
/** #5 Wang & Chi (2011) Focus+Context 最小二乘變形法 */
export const SCHEMATIC_WANGCHI_LAYER_ID = 'schematic_rma_wangchi';
/** #6 Bast et al. (2020) Octilinear Grid Graph 最短路近似 */
export const SCHEMATIC_BAST_LAYER_ID = 'schematic_rma_bast';
/** #7 Merrick & Gudmundsson (2007) C-directed 路徑簡化 */
export const SCHEMATIC_MERRICK_LAYER_ID = 'schematic_rma_merrick';

/** 衍生圖層：MILP結果正規化（RMA）— 讀 ③ MILP（schematic_rma_milp）結果並做保拓樸座標正規化。 */
export const SCHEMATIC_MILP_READ_LAYER_ID = 'schematic_rma_milp_read';

/** 衍生圖層：站點與路線往中心聚集（RMA）— 自「MILP結果正規化（RMA）」串接。 */
export const SCHEMATIC_TOWARD_CENTER_HV_LAYER_ID = 'schematic_rma_toward_center_hv';
export const SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID = 'schematic_rma_toward_center_vh';

/** 衍生圖層：自「先直後橫」移入結果，於此做紅/藍 connect 拉直（含逐點除錯）。 */
export const SCHEMATIC_MILP_STRAIGHTEN_LAYER_ID = 'schematic_milp_straighten';

/** 共同上游輸入圖層 */
export const SCHEMATIC_SOURCE_LAYER_ID = 'osm_2_geojson_2_json';
