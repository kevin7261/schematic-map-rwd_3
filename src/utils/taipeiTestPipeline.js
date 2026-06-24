/**
 * 原「空間網絡網格測試_2」管線（taipei_a2～e2）已移除；保留空結構供既有 helper 回傳 null／false。
 */

export const TAIPEI_TEST_PIPELINES = [];

/** 會觸發 executeFunction 的圖層（a～d） */
export const TAIPEI_TEST_PIPELINE_EXECUTE_LAYER_IDS = TAIPEI_TEST_PIPELINES.flatMap((p) => [
  p.a,
  p.b,
  p.c,
  p.d,
]);

export function getTaipeiTestPipelineByExecuteLayer(layerId) {
  if (layerId == null) return null;
  for (const p of TAIPEI_TEST_PIPELINES) {
    if (p.a === layerId || p.b === layerId || p.c === layerId || p.d === layerId) return p;
  }
  return null;
}

/**
 * @returns {{ pipeline: object, role: 'a'|'b'|'c'|'d', targetB?: string, src?: string, dst?: string } | null}
 */
export function resolveTaipeiTestPipelineStep(layerId) {
  const pipeline = getTaipeiTestPipelineByExecuteLayer(layerId);
  if (!pipeline) return null;
  if (pipeline.a === layerId) return { pipeline, role: 'a', targetB: pipeline.b };
  if (pipeline.b === layerId) return { pipeline, role: 'b', src: pipeline.b, dst: pipeline.c };
  if (pipeline.c === layerId) return { pipeline, role: 'c', src: pipeline.c, dst: pipeline.d };
  if (pipeline.d === layerId) return { pipeline, role: 'd', src: pipeline.d, dst: pipeline.e };
  return null;
}

const C_IDS = [];
const D_IDS = [];
const E_IDS = [];
const B_IDS = [];

export function isTaipeiTestBLayerTab(tab) {
  return tab != null && B_IDS.includes(tab);
}

export function isTaipeiTestCLayerTab(tab) {
  return tab != null && C_IDS.includes(tab);
}

export function isTaipeiTestDLayerTab(tab) {
  return tab != null && D_IDS.includes(tab);
}

export function isTaipeiTestELayerTab(tab) {
  return tab != null && E_IDS.includes(tab);
}

export function isTaipeiTestCDLayerTab(tab) {
  return isTaipeiTestCLayerTab(tab) || isTaipeiTestDLayerTab(tab);
}

export function isTaipeiTestCDELayerTab(tab) {
  return isTaipeiTestCLayerTab(tab) || isTaipeiTestDLayerTab(tab) || isTaipeiTestELayerTab(tab);
}

export function isTaipeiTestGridNormLayerTab(tab) {
  return isTaipeiTestCDELayerTab(tab);
}

const F_IDS = [];
const G_IDS = [];
const H_IDS = [];
const I_IDS = [];

export function isTaipeiTestFLayerTab(tab) {
  return tab != null && F_IDS.includes(tab);
}

export function isTaipeiTestGLayerTab(tab) {
  return tab != null && G_IDS.includes(tab);
}

export function isTaipeiTestHLayerTab(tab) {
  return tab != null && H_IDS.includes(tab);
}

export function isTaipeiTestILayerTab(tab) {
  return tab != null && I_IDS.includes(tab);
}

/** f～i 路網／權重層（與原 isTaipeiEfinalSpaceLayerTab 語意相同） */
export function isTaipeiTestFghiSpaceLayerTab(tab) {
  return (
    isTaipeiTestFLayerTab(tab) ||
    isTaipeiTestGLayerTab(tab) ||
    isTaipeiTestHLayerTab(tab) ||
    isTaipeiTestILayerTab(tab)
  );
}

export function isTaipeiTestGOrHWeightLayerTab(tab) {
  return isTaipeiTestGLayerTab(tab) || isTaipeiTestHLayerTab(tab);
}

/** 供 dataProcessor／prune／randomConnect 等 id 判斷 */
export const TAIPEI_TEST_FGHI_LAYER_IDS = [...F_IDS, ...G_IDS, ...H_IDS, ...I_IDS];

export function isTaipeiTestFghiLayerId(id) {
  return id != null && TAIPEI_TEST_FGHI_LAYER_IDS.includes(id);
}

/** 路網層識別集合（對應圖層已移除，保留空集合供既有 import 判斷使用） */
export const TAIPEI_TEST3_BCDEFG_LAYER_IDS = [];

/** @deprecated 請改用 TAIPEI_TEST3_BCDEFG_LAYER_IDS */
export const TAIPEI_TEST3_BCDEF_LAYER_IDS = TAIPEI_TEST3_BCDEFG_LAYER_IDS;

/** @deprecated 請改用 TAIPEI_TEST3_BCDEFG_LAYER_IDS */
export const TAIPEI_TEST3_BCDE_LAYER_IDS = TAIPEI_TEST3_BCDEFG_LAYER_IDS;

/** i3／j3／k3：站點勿用匯出列強制起迄為 connect（改依 nodes，黑點維持黑）；connect 藍／紅依 taipei_h3 全路網度數，勿用切段後子折線度數 */
export function isTaipeiTest3I3OrJ3LayerTab(tab) {
  void tab;
  return false;
}

/** j：路段流量（CSV）；ControlTab 匯出 JSON */
export function isTaipeiTest3J3TrafficExportLayerTab(tab) {
  void tab;
  return false;
}

export function isTaipeiTest3BcdeLayerTab(tab) {
  return tab != null && TAIPEI_TEST3_BCDEFG_LAYER_IDS.includes(tab);
}

/**
 * e 階路網繪圖：對角線段以「先橫後豎」矩齒展開（僅視覺，與 applyHVZ／applyHVToE3 之鋸齒變體一致）。
 * 用於尚未把資料邊全部硬化成純 H/V 前，仍可在圖上看到藍端→紅端方向之水平第一段等正交示意。
 */
export function isTaipeiE3DiagonalSawtoothDisplayLayerTab(tab) {
  if (tab == null) return false;
  return (
    tab === 'taipei_e3' ||
    tab === 'taipei_e3_dp' ||
    tab === 'taipei_e3_dp_2' ||
    tab === 'taipei_e3_dp_nd'
  );
}

export function isTaipeiTest3BcdefLayerTab(tab) {
  return tab != null && TAIPEI_TEST3_BCDEFG_LAYER_IDS.includes(tab);
}

export function isTaipeiTest3BcdefgLayerTab(tab) {
  return tab != null && TAIPEI_TEST3_BCDEFG_LAYER_IDS.includes(tab);
}

/** 與 SpaceNetworkGridTab 車站配置專區一致：測試路網圖層 */
export const TAIPEI_TEST_SPACE_NETWORK_STATION_TAB_IDS = [...TAIPEI_TEST_FGHI_LAYER_IDS];

export function isReducedSchematicPlotLayerId(layerId) {
  return isTaipeiTestCLayerTab(layerId) || isTaipeiTestDLayerTab(layerId);
}

/** 網格正規化 c／d／e 圖層對應的「b」圖層（疊加網格前座標對照） */
export function getTaipeiTestLayerBForGridNormLayer(layerId) {
  if (layerId == null) return null;
  for (const p of TAIPEI_TEST_PIPELINES) {
    if (p.c === layerId || p.d === layerId || p.e === layerId) return p.b;
  }
  return null;
}
