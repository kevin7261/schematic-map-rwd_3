/* eslint-disable no-console */

/**
 * 🚀 均勻網格捷運路線圖 — HV 最佳化執行流程 (Uniform Grid HV Optimize Execute)
 *
 * 按鈕一鍵自動執行（不需 API Key、不需剪貼簿／貼回）：
 * 依 `uniformGridHvOptimize.js` 內寫好的 prompt 規則（拓撲不變 + HV 最大化 + 幾何約束），
 * 在本機以貪婪對齊 + 逐點驗證跑最多 4 輪 → 虛線預覽 → 「執行」才寫回路線。
 */

import { showSolveOverlay } from './routeMapAdjust/schematic/solveOverlay.js';
import { processUniformGridToDrawData } from './dataProcessor.js';
import {
  buildHvOptimizePayload,
  applyHvOptimizeIncrementally,
  refreshHvOptimizePayloadFromCoords,
  rebuildRoutesFromOptimizedKeypoints,
  runGreedyHvOptimizeRound,
  buildHvOptimizeCoordsResponse,
  buildHvOptimizeChangeReport,
  computeHvStats,
  fingerprintUniformGridRoutes,
} from './uniformGridHvOptimize.js';

/** 安全上限 */
export const HV_OPTIMIZE_MAX_ROUNDS = 4;

/** 清除圖層上的 HV 最佳化虛線預覽狀態 */
export function clearHvOptimizePreview(layer) {
  if (layer) layer.hvOptimizeLastResult = null;
}

/**
 * 🚉 HV 最佳化：一鍵計算預覽（本機 prompt 規則，僅預覽）
 */
export async function runHvOptimizeForLayer(layer) {
  if (!layer?.processedJsonData || !Array.isArray(layer.processedJsonData.routes)) {
    return { ok: false, message: '目前圖層沒有可最佳化的路線資料，請先按「隨機產生」。' };
  }

  const { gridX, gridY, routes } = layer.processedJsonData;
  if (!routes.length) {
    return { ok: false, message: '目前沒有路線可最佳化。' };
  }

  const overlay = showSolveOverlay('HV 最佳化中…');
  let payload = buildHvOptimizePayload(routes, gridX, gridY);
  const beforeCoords = payload.movablePoints.map((p) => ({ x: p.x, y: p.y }));
  const initialHvStats = {
    edgeCount: payload.edges.length,
    hvEdges: payload.edges.length - payload.meta.initialNonHvCount,
    hvRatio: payload.meta.initialHvRatio,
  };

  let totalAccepted = 0;
  let totalRejected = 0;
  let lastCoords = beforeCoords.map((c) => ({ ...c }));
  let rounds = 0;

  try {
    for (; rounds < HV_OPTIMIZE_MAX_ROUNDS; rounds++) {
      overlay.setStatus(`第 ${rounds + 1} 輪：依 prompt 規則計算 HV 對齊…`);

      const { coords: greedyCoords, changed } = runGreedyHvOptimizeRound(payload);
      if (!changed) break;

      const applied = applyHvOptimizeIncrementally(
        payload,
        buildHvOptimizeCoordsResponse(greedyCoords)
      );
      totalAccepted += applied.acceptedCount;
      totalRejected += applied.rejectedCount;
      lastCoords = applied.coords.map((c) => ({ ...c }));

      if (applied.acceptedCount === 0) {
        rounds += 1;
        break;
      }

      payload = refreshHvOptimizePayloadFromCoords(payload, applied.coords);
    }

    const finalHvStats = computeHvStats(
      payload.edges.map((e) => {
        const a = lastCoords[e.fromId];
        const b = lastCoords[e.toId];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return { ...e, dx, dy, isHv: dx === 0 || dy === 0 };
      })
    );

    const changeReport = buildHvOptimizeChangeReport(
      buildHvOptimizePayload(routes, gridX, gridY),
      routes,
      beforeCoords,
      lastCoords,
      initialHvStats,
      finalHvStats
    );

    layer.hvOptimizeLastResult = {
      ...changeReport,
      previewOnly: true,
      algo: 'prompt-rules·拓撲不變·逐點驗證',
      routesFingerprint: fingerprintUniformGridRoutes(routes),
      finalCoords: lastCoords.map((c) => ({ x: c.x, y: c.y })),
      totalAccepted,
      totalRejected,
      rounds,
      ranAt: Date.now(),
    };

    overlay.close();

    return {
      ok: true,
      message: changeReport.changeSummary,
      hvStatsBefore: initialHvStats,
      hvStatsAfter: finalHvStats,
      totalAccepted,
      totalRejected,
      changeReport,
    };
  } catch (e) {
    overlay.close();
    console.error('[HV最佳化] 未預期錯誤:', e);
    return { ok: false, message: `HV 最佳化失敗：${e?.message || e}` };
  }
}

/**
 * ✅ 套用 HV 最佳化預覽：真正移動路線並清除虛線預覽
 */
export async function applyHvOptimizePreviewForLayer(layer) {
  const preview = layer?.hvOptimizeLastResult;
  if (!preview?.finalCoords?.length || !preview.changeCount) {
    return { ok: false, message: '沒有可套用的 HV 預覽，請先按「HV 最佳化」。' };
  }

  if (!layer?.processedJsonData || !Array.isArray(layer.processedJsonData.routes)) {
    return { ok: false, message: '目前圖層沒有路線資料。' };
  }

  const { gridX, gridY, routes } = layer.processedJsonData;
  if (fingerprintUniformGridRoutes(routes) !== preview.routesFingerprint) {
    return { ok: false, message: '路線已變更，請重新按「HV 最佳化」。' };
  }

  const overlay = showSolveOverlay('套用 HV 最佳化…');
  try {
    const payload = buildHvOptimizePayload(routes, gridX, gridY);
    const newRoutes = rebuildRoutesFromOptimizedKeypoints(routes, payload, preview.finalCoords);
    layer.processedJsonData = { ...layer.processedJsonData, routes: newRoutes };
    layer.drawJsonData = processUniformGridToDrawData(layer.processedJsonData);
    layer.hvOptimizeLastResult = null;
    overlay.close();
    return { ok: true, message: '已套用 HV 最佳化，路線已更新。' };
  } catch (e) {
    overlay.close();
    console.error('[HV最佳化] 套用失敗:', e);
    return { ok: false, message: `套用失敗：${e?.message || e}` };
  }
}
