/**
 * 離線管線：metro GeoJSON → 骨架2→⑨→前置 → 一鍵執行（四步驟）結果。
 */

import { buildRmaMilpReadPrepFromMetroGeojson } from './rmaPrepFromMetro.js';
import {
  RMA_MILP_READ_ONE_CLICK_KIND,
  RMA_MILP_READ_ONE_CLICK_VERSION,
  runRmaMilpReadOneClickOnFlat,
} from './rmaOneClickPipeline.js';

/**
 * @param {import('geojson').FeatureCollection} metroFc
 * @param {{ cityId?: string, city?: string, country?: string, cityZh?: string }} meta
 * @returns {{ ok: boolean, message?: string, payload?: object }}
 */
export function buildRmaMilpReadOneClickFromMetroGeojson(metroFc, meta = {}) {
  const prep = buildRmaMilpReadPrepFromMetroGeojson(metroFc, meta);
  if (!prep.ok || !prep.payload?.spaceNetworkGridJsonData?.length) {
    return { ok: false, message: prep.message || '前置預算失敗。' };
  }

  const oneClick = runRmaMilpReadOneClickOnFlat(prep.payload.spaceNetworkGridJsonData);
  if (!oneClick.ok || !oneClick.flat?.length) {
    return { ok: false, message: oneClick.message || '一鍵執行失敗。' };
  }

  const payload = {
    kind: RMA_MILP_READ_ONE_CLICK_KIND,
    version: RMA_MILP_READ_ONE_CLICK_VERSION,
    generatedAt: new Date().toISOString(),
    pipeline:
      '路線圖轉換骨架2（變成骨架）→ ⑨ 正規化 → 前置匯入 → 一鍵執行（粉紅→棕→黑+灰→移除網格→移除交叉）',
    cityId: meta.cityId || prep.payload.cityId || null,
    city: meta.city || prep.payload.city || null,
    country: meta.country || prep.payload.country || null,
    cityZh: meta.cityZh || prep.payload.cityZh || null,
    routeCount: prep.payload.routeCount,
    skeletonEdgeCount: prep.payload.skeletonEdgeCount,
    skeletonNodeCount: prep.payload.skeletonNodeCount,
    segmentCount: oneClick.flat.length,
    prepSegmentCount: prep.payload.segmentCount,
    oneClickStats: oneClick.stats || null,
    spaceNetworkGridJsonData: oneClick.flat,
  };

  return { ok: true, payload };
}
