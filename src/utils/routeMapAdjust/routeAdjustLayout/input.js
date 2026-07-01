/* eslint-disable no-console */

/**
 * 「站點與路線調整」八演算法輸入：自「站點與路線調整前置」schematic_rma_milp_read 讀 flat 路網，
 * 抽 connect 骨架（buildConnectSkeleton：保留分歧／交叉共點，黑點另存 sections），已是整數格座標，不再做地理縮放。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';
import { ROUTE_ADJUST_UPSTREAM_LAYER_ID, ROUTE_ADJUST_UPSTREAM_LAYER_NAME } from './layerIds.js';
import { buildConnectSkeleton } from '../schematic/input.js';

/**
 * @returns {{ ok: boolean, message?: string, skeletonFlat?: Array, sections?: Array, refAngleFlat?: Array, refFullFlat?: Array, meta?: object }}
 */
export function resolveRouteAdjustLayoutInput() {
  const dataStore = useDataStore();
  const src = dataStore.findLayerById(ROUTE_ADJUST_UPSTREAM_LAYER_ID);
  if (!src) {
    return { ok: false, message: `找不到上游圖層「${ROUTE_ADJUST_UPSTREAM_LAYER_NAME}」（${ROUTE_ADJUST_UPSTREAM_LAYER_ID}）` };
  }

  const raw = src.spaceNetworkGridJsonData ?? src.dataJson;
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      message:
        `上游「${ROUTE_ADJUST_UPSTREAM_LAYER_NAME}」尚無路網；請先完成 ③ MILP 佈局 →「移除無用網格」，或匯入 MILP 結果 JSON 後執行。`,
    };
  }

  let baseFlat;
  try {
    baseFlat = normalizeSpaceNetworkDataToFlatSegments(JSON.parse(JSON.stringify(raw)));
  } catch (e) {
    console.error('routeAdjustLayout 輸入：flat 解析失敗', e);
    return { ok: false, message: '上游路網解析失敗：' + (e?.message || e) };
  }

  if (!baseFlat.length) {
    return { ok: false, message: '上游路網為空。' };
  }

  const refFullFlat = JSON.parse(JSON.stringify(baseFlat));
  const { skeletonFlat, sections } = buildConnectSkeleton(baseFlat);
  if (!skeletonFlat.length) {
    return { ok: false, message: '上游路網無可用 connect 骨架（每段至少需起迄兩點）。' };
  }

  const refAngleFlat = JSON.parse(JSON.stringify(skeletonFlat));
  const blackCount = sections.reduce((s, sec) => s + (sec.blackNodes?.length || 0), 0);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const seg of skeletonFlat) {
    for (const p of seg.points || []) {
      const x = Math.round(Number(Array.isArray(p) ? p[0] : p?.x));
      const y = Math.round(Number(Array.isArray(p) ? p[1] : p?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    ok: true,
    skeletonFlat,
    refAngleFlat,
    refFullFlat,
    sections,
    meta: {
      sourceLayerId: ROUTE_ADJUST_UPSTREAM_LAYER_ID,
      inputKind: 'milp_read_normalized',
      gridCols: Number.isFinite(maxX - minX) ? maxX - minX + 1 : 0,
      gridRows: Number.isFinite(maxY - minY) ? maxY - minY + 1 : 0,
      sectionCount: skeletonFlat.length,
      blackStationCount: blackCount,
    },
  };
}
