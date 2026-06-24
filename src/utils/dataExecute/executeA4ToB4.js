/**
 * taipei_a4 → taipei_b4：mergeConnectSpansPlaceBlackStationsAndSplit 切段（有 mapDrawnRoutes 時）、
 * 掛載 CSV 流量、權重 ÷100。**零權重黑點合併**請於 Control 按「b4：零權重合併…」手動執行。
 *
 * 流程：
 *  1. 深拷貝 taipei_a4 的 K3Tab 路網並正規化為 flat segments。
 *  2. 對黑點標 display=true。
 *  3. mergeConnectSpansPlaceBlackStationsAndSplit 或 splitFlatH3SegmentsAtBlackVerticesOnly 切段。
 *  4. 對切段後路網套用 taipei_a4 之 CSV 流量（applyMrtTrafficVolumesToTaipeiRoutes，zeroUnmatchedTraffic）。
 *  5. 權重縮小 1/100（與舊 execute_B4_To_C4 相同規則）。
 *
 * （與 execute_A5_To_B5 分檔複製；實作呼叫 runTaipeiB4PipelineFromK3Routes，測試4／測試5 不共用本體。）
 */

/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';
import { runTaipeiB4PipelineFromK3Routes } from '@/utils/dataExecute/taipeiB4PipelineFromK3.js';

export async function execute_A4_To_B4() {
  const dataStore = useDataStore();
  const a4 = dataStore.findLayerById('taipei_a4');
  const b4 = dataStore.findLayerById('taipei_b4');
  if (!a4 || !b4) {
    console.warn('executeA4ToB4：缺少 taipei_a4 或 taipei_b4 圖層');
    return;
  }
  const k3Routes = a4.spaceNetworkGridJsonDataK3Tab;
  if (!Array.isArray(k3Routes) || k3Routes.length === 0) {
    console.warn('executeA4ToB4：taipei_a4 尚無 layout-network（K3Tab）路網，請先載入 a4 JSON');
    return;
  }

  const { scaledSegs, initialSegmentCount, blackPlacementStats } =
    await runTaipeiB4PipelineFromK3Routes(dataStore, a4, b4, k3Routes, {
      zeroWeightMerge: false,
      sourceLabel: 'executeA4ToB4',
    });

  console.log(
    `executeA4ToB4 完成：權重已除以 100；黑點配置 ${blackPlacementStats.placedBlackSectionCount} 段，` +
      `切段後路段數 ${scaledSegs.length}（原 ${initialSegmentCount}）`
  );
}
