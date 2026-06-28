/**
 * ⑨ 示意圖佈局（正規化）：座標正規化 → 刪空欄列 → 放回黑站。
 * 完全在 schematic_rma_normalize 圖層內完成，不觸碰其他圖層。
 * 輸入骨架取自 layer.geojsonData（由「從路線圖轉換骨架載入」寫入）。
 *
 * 演算法只在骨架（connect 節點）上執行，不看黑點，與①-⑧一致：
 *  1. resolveSchematicInput → skeletonFlat（整數格 connect 節點）+ sections（黑站另存）
 *  2. 刪空欄列（pruneGridLinesWithoutConnectVertices）在骨架上做，黑站不參與計算
 *  3. reinsertBlackStations → 黑站依弧長比例放回（位置正確）
 *  4. writeSchematicResultToLayer → 設線色＋計算藍/紅/黃/紫點色＋共軌虛線
 */

import { resolveSchematicInput } from '../input.js';
import { reinsertBlackStations, writeSchematicResultToLayer } from '../assemble.js';
import { buildSchematicGraph, splitHighDegreeNodes } from '../graph.js';
import { pruneGridLinesWithoutConnectVertices } from '@/utils/taipeiDataProcTest3/f3ToG3PruneEmptyGridLines.js';

const LAYER_ID = 'schematic_rma_normalize';

export function executeNormalizeRma() {
  // Step 1：座標正規化（scaleSkeletonToIntegerGrid 等比例縮放至整數格）
  const input = resolveSchematicInput(LAYER_ID);
  if (!input.ok) {
    console.warn('executeNormalizeRma：', input.message);
    return false;
  }
  const { skeletonFlat, sections, meta } = input;

  // 建圖（共軌偵測用，與①-⑧一致）
  const graph = splitHighDegreeNodes(buildSchematicGraph(skeletonFlat), 8);

  // Step 2：刪空欄列 — 在骨架（只有 connect 節點，無黑點）上做
  // 黑點弧長插值位置為非整數，若在 reinsertBlackStations 後才做會污染欄列判斷
  let workingSkeleton = JSON.parse(JSON.stringify(skeletonFlat));
  try {
    const { segments: pruned, colCount, rowCount } = pruneGridLinesWithoutConnectVertices(workingSkeleton);
    if (colCount > 0 || rowCount > 0) workingSkeleton = pruned;
  } catch (e) {
    console.error('executeNormalizeRma 刪空欄列失敗', e);
  }

  // Step 3：黑站沿邊弧長比例放回（骨架座標已壓縮後才插值，位置正確）
  const fullFlat = reinsertBlackStations(workingSkeleton, sections);

  // Step 4：寫回圖層（設線色＋計算藍/紅/黃/紫點色＋共軌虛線）
  const result = writeSchematicResultToLayer(LAYER_ID, fullFlat, {
    ...meta,
    _schematicGraph: graph,
  });
  return result.ok !== false;
}
