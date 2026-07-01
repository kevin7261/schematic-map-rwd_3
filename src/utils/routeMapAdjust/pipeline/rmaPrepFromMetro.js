/**
 * 離線管線：metro GeoJSON → 路線圖轉換骨架2（變成骨架）→ ⑨ 正規化 → 站點與路線調整前置匯入結果。
 * 與 UI 手動操作等價：loadRouteAdjust2 skeleton → executeNormalizeRma → importLayoutResultIntoMilpReadRma。
 */

import { parseMetroGeojsonToRouteMap } from '@/utils/selectRouteMap/metroGeojsonToRouteMap.js';
import {
  buildRouteMapAdjustSkeleton,
  routeMapAdjustSkeletonToGeoJson,
  refreshPinkDpRatioInFlat,
} from '../routeStations.js';
import { normalizeSkeletonGeojsonToFlat } from '../schematic/normalize/executeNormalize.js';

export const RMA_MILP_READ_PREP_KIND = 'rma-milp-read-prep';
export const RMA_MILP_READ_PREP_VERSION = 1;

/**
 * @param {import('geojson').FeatureCollection} metroFc
 * @param {{ cityId?: string, city?: string, country?: string, cityZh?: string }} meta
 * @returns {{ ok: boolean, message?: string, payload?: object }}
 */
export function buildRmaMilpReadPrepFromMetroGeojson(metroFc, meta = {}) {
  const { lines, blackDots, stationMeta, routeCount } = parseMetroGeojsonToRouteMap(metroFc);
  if (!routeCount) {
    return { ok: false, message: '此城市資料無有效路線。' };
  }

  const stationCoordKeys = Object.keys(stationMeta || {}).map((k) => k.split(',').map(Number));
  const skeleton = buildRouteMapAdjustSkeleton(lines, blackDots, stationCoordKeys);
  const edges = Array.isArray(skeleton?.edges) ? skeleton.edges : [];
  if (!edges.length) {
    return { ok: false, message: '無法建立骨架（邊為空）。' };
  }

  const skeletonGeojson = routeMapAdjustSkeletonToGeoJson(
    skeleton,
    lines,
    blackDots,
    stationMeta
  );
  const norm = normalizeSkeletonGeojsonToFlat(skeletonGeojson);
  if (!norm.ok || !norm.fullFlat?.length) {
    return { ok: false, message: norm.message || '⑨ 正規化失敗。' };
  }

  const fullFlat = JSON.parse(JSON.stringify(norm.fullFlat));
  try {
    refreshPinkDpRatioInFlat(fullFlat);
  } catch {
    /* 非致命 */
  }

  const payload = {
    kind: RMA_MILP_READ_PREP_KIND,
    version: RMA_MILP_READ_PREP_VERSION,
    generatedAt: new Date().toISOString(),
    pipeline:
      '路線圖轉換骨架2（變成骨架）→ ⑨ 示意圖佈局（正規化）→ 站點與路線調整前置（從⑨匯入）',
    cityId: meta.cityId || null,
    city: meta.city || null,
    country: meta.country || null,
    cityZh: meta.cityZh || null,
    routeCount,
    skeletonEdgeCount: edges.length,
    skeletonNodeCount: Array.isArray(skeleton.nodes) ? skeleton.nodes.length : 0,
    segmentCount: fullFlat.length,
    normalizeStats: norm.stats || null,
    spaceNetworkGridJsonData: fullFlat,
  };

  return { ok: true, payload };
}

/**
 * @param {unknown} parsed
 * @returns {{ ok: boolean, message?: string, flat?: Array }}
 */
export function parseRmaMilpReadPrepFile(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, message: 'JSON 格式無效。' };
  }
  if (parsed.kind === RMA_MILP_READ_PREP_KIND && Array.isArray(parsed.spaceNetworkGridJsonData)) {
    if (!parsed.spaceNetworkGridJsonData.length) {
      return { ok: false, message: '預算結果為空。' };
    }
    return { ok: true, flat: parsed.spaceNetworkGridJsonData };
  }
  if (Array.isArray(parsed) && parsed.length) {
    return { ok: true, flat: parsed };
  }
  return {
    ok: false,
    message: '非站點與路線調整前置預算格式（須含 spaceNetworkGridJsonData）。',
  };
}

/** 預算 JSON 檔路徑（相對 public/data/metro） */
export function rmaMilpReadPrepRelativePath(cityId) {
  return `rma_milp_read_prep/${cityId}.json`;
}
