/**
 * 三個「示意圖佈局」比較圖層的 layerId（照原編號排序）。
 *  #1 Li & Dong (2010)        — stroke-based 示意圖方法（octilinear，8 方向）
 *  #2 Stott & Rodgers (2011)  — Hill Climbing 多準則最佳化
 *  #3 Nöllenburg & Wolff (2011) — MILP（HiGHS 求解）
 *
 * 三者共用建圖/骨架/渲染，只最佳化 connect 紅藍骨架，黑點最後沿邊內插放回。
 */

/** #1 Li & Dong (2010) stroke-based（8 方向 octilinear） */
export const SCHEMATIC_STROKE_LAYER_ID = 'schematic_stroke';
export const SCHEMATIC_HILLCLIMB_LAYER_ID = 'schematic_hillclimb';
export const SCHEMATIC_MILP_LAYER_ID = 'schematic_milp';

/** 衍生圖層：直接讀取 ③ MILP 的結果（鏡像）。 */
export const SCHEMATIC_MILP_READ_LAYER_ID = 'schematic_milp_read';

/** 衍生圖層：自「MILP結果正規化」移入結果，於此做紅/藍 connect 拉直（含逐點除錯）。 */
export const SCHEMATIC_MILP_STRAIGHTEN_LAYER_ID = 'schematic_milp_straighten';

/** 共同上游輸入圖層 */
export const SCHEMATIC_SOURCE_LAYER_ID = 'osm_2_geojson_2_json';
