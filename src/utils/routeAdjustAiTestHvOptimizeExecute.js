/* eslint-disable no-console */

/**
 * 🚀 均勻網格 — HV 最佳化（僅本地 Cursor 開發）
 *
 * 需 `npm run serve` + Cursor Agent（ai-test-hv-optimize skill）。
 * 正式 build／部署不提供；Agent 讀寫 public/data/ai_test/hv_*.json。
 */

import { showSolveOverlay } from './routeMapAdjust/schematic/solveOverlay.js';
import { processUniformGridToDrawData } from './dataProcessor.js';
import {
  postAiTestHvPayload,
  fetchAiTestHvResponse,
  deleteAiTestHvResponse,
  fetchAiTestHvAudit,
  deleteAiTestHvAudit,
  isAiTestHvLocalDevMode,
} from './routeAdjustAiTestHvBridge.js';
export { isAiTestHvLocalDevMode } from './routeAdjustAiTestHvBridge.js';
import {
  buildHvOptimizePayload,
  stripHvOptimizePayloadForExport,
  parseHvOptimizeLlmResponse,
  mergeHvOptimizeCoordsFromResponse,
  computeHvStats,
  refreshHvOptimizePayloadFromCoords,
  rebuildRoutesFromOptimizedKeypoints,
  buildHvOptimizeChangeReport,
  fingerprintUniformGridRoutes,
  resolveHvOptimizeModelLabel,
  isRejectedHvOptimizeNonLlmResponse,
} from './routeAdjustAiTestHvOptimize.js';

/** 清除圖層上的 HV 最佳化 session 與虛線預覽 */
export function clearHvOptimizePreview(layer) {
  if (!layer) return;
  layer.hvOptimizeLastResult = null;
  layer.hvOptimizeSession = null;
}

function ensureHvOptimizeSession(layer) {
  const { gridX, gridY, routes } = layer.processedJsonData;
  const fingerprint = fingerprintUniformGridRoutes(routes);
  const session = layer.hvOptimizeSession;
  if (session?.routesFingerprint === fingerprint) return session;

  const payload = buildHvOptimizePayload(routes, gridX, gridY);
  layer.hvOptimizeSession = {
    routesFingerprint: fingerprint,
    roundIndex: 0,
    initialBeforeCoords: payload.movablePoints.map((p) => ({ x: p.x, y: p.y })),
    initialHvStats: {
      edgeCount: payload.edges.length,
      hvEdges: payload.edges.length - payload.meta.initialNonHvCount,
      hvRatio: payload.meta.initialHvRatio,
    },
    workingCoords: null,
  };
  layer.hvOptimizeLastResult = null;
  return layer.hvOptimizeSession;
}

function getHvOptimizePayloadForSession(layer) {
  const { gridX, gridY, routes } = layer.processedJsonData;
  let payload = buildHvOptimizePayload(routes, gridX, gridY);
  const session = layer.hvOptimizeSession;
  if (session?.workingCoords?.length === payload.movablePoints.length) {
    payload = refreshHvOptimizePayloadFromCoords(payload, session.workingCoords);
  }
  return payload;
}

/** 寫入 payload 供 Cursor Agent 讀取 */
export async function syncAiTestHvPayloadForLayer(layer) {
  if (!layer?.processedJsonData?.routes?.length) {
    return { ok: false, message: '目前圖層沒有可最佳化的路線資料，請先按「隨機產生」。' };
  }

  const session = ensureHvOptimizeSession(layer);
  const payload = getHvOptimizePayloadForSession(layer);
  const network = stripHvOptimizePayloadForExport(payload);

  await postAiTestHvPayload({
    updatedAt: Date.now(),
    routesFingerprint: session.routesFingerprint,
    roundIndex: session.roundIndex,
    network,
    session: {
      initialBeforeCoords: session.initialBeforeCoords,
      initialHvStats: session.initialHvStats,
      workingCoords: session.workingCoords,
    },
  });

  return { ok: true, roundIndex: session.roundIndex + 1 };
}

/**
 * 讀取 Agent 回覆 JSON → 直接套用 LLM 座標 → 虛線預覽
 *
 * 【鐵律】App 不做幾何驗證；座標由 LLM 推理（ai-test-hv-optimize），
 * 幾何反驗證由 LLM audit（validate-ai-test-hv → hv_audit.json）完成。
 */
export async function applyAiTestHvResponseForLayer(layer, responseBody) {
  if (!layer?.processedJsonData?.routes?.length) {
    return { ok: false, message: '目前圖層沒有路線資料。' };
  }

  const session = ensureHvOptimizeSession(layer);
  const { routes } = layer.processedJsonData;
  const fingerprint = fingerprintUniformGridRoutes(routes);
  if (session.routesFingerprint !== fingerprint) {
    clearHvOptimizePreview(layer);
    return { ok: false, message: '路線已變更，請重新按「HV 最佳化」。' };
  }

  const overlay = showSolveOverlay('載入 LLM 座標…');
  try {
    const payload = getHvOptimizePayloadForSession(layer);
    const response = parseHvOptimizeLlmResponse(JSON.stringify(responseBody));
    const coords = mergeHvOptimizeCoordsFromResponse(payload, response);

    const changedCount = coords.filter(
      (c, id) => c.x !== payload.movablePoints[id].x || c.y !== payload.movablePoints[id].y
    ).length;

    const finalEdges = payload.edges.map((e) => {
      const a = coords[e.fromId];
      const b = coords[e.toId];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return { ...e, dx, dy, isHv: dx === 0 || dy === 0 };
    });
    const hvStatsAfter = computeHvStats(finalEdges);

    session.workingCoords = coords.map((c) => ({ x: c.x, y: c.y }));
    session.roundIndex += 1;

    const changeReport = buildHvOptimizeChangeReport(
      buildHvOptimizePayload(
        routes,
        layer.processedJsonData.gridX,
        layer.processedJsonData.gridY
      ),
      routes,
      session.initialBeforeCoords,
      coords,
      session.initialHvStats,
      hvStatsAfter
    );

    layer.hvOptimizeLastResult = {
      ...changeReport,
      previewOnly: true,
      algo: 'cursor-agent·LLM 座標·LLM audit',
      model: resolveHvOptimizeModelLabel(responseBody),
      computedBy: responseBody.computedBy ?? null,
      routesFingerprint: fingerprint,
      finalCoords: coords.map((c) => ({ x: c.x, y: c.y })),
      acceptedCount: changedCount,
      rejectedCount: 0,
      roundIndex: session.roundIndex,
      ranAt: Date.now(),
    };

    overlay.close();

    return {
      ok: true,
      message: `已載入 LLM 座標（移動 ${changedCount} 點）。${changeReport.changeSummary}`,
      changeReport,
      acceptedCount: changedCount,
      rejectedCount: 0,
    };
  } catch (e) {
    overlay.close();
    console.error('[HV最佳化] Agent 回覆載入失敗:', e);
    return { ok: false, message: `載入失敗：${e?.message || e}` };
  }
}

/**
 * 🚉 HV 最佳化：同步 payload + 若有 Agent 回覆則載入預覽
 */
export async function runHvOptimizeForLayer(layer) {
  if (!isAiTestHvLocalDevMode()) {
    return {
      ok: false,
      message: 'HV 最佳化僅限本地 Cursor 開發（npm run serve）；正式部署不提供。',
    };
  }
  if (!layer?.processedJsonData?.routes?.length) {
    return { ok: false, message: '目前圖層沒有可最佳化的路線資料，請先按「隨機產生」。' };
  }

  try {
    await syncAiTestHvPayloadForLayer(layer);

    const responseBody = await fetchAiTestHvResponse();
    if (!responseBody) {
      return {
        ok: true,
        pendingAgent: true,
        message:
          '已同步 hv_payload.json。\n尚無 hv_response.json；在 Cursor 用 LLM 推理完成後再按「HV 最佳化」。',
      };
    }

    if (isRejectedHvOptimizeNonLlmResponse(responseBody)) {
      return {
        ok: false,
        message:
          'hv_response.json 不符合鐵律（須 computedBy: "llm"）。\n座標只能由 Cursor LLM 推理決定，禁止腳本／程式求解。請用 writeResponse.mjs 寫入。',
      };
    }

    const fp = fingerprintUniformGridRoutes(layer.processedJsonData.routes);
    if (responseBody.routesFingerprint && responseBody.routesFingerprint !== fp) {
      return {
        ok: false,
        message:
          'Agent 回覆與目前路線不符（routesFingerprint 不同）。\n若剛按「隨機產生」，請在 Cursor 重新用 LLM 計算並寫入 hv_response.json。',
      };
    }

    // 【鐵律】App 不做幾何驗證；反驗證由 LLM audit（validate-ai-test-hv skill）完成
    const auditBody = await fetchAiTestHvAudit();
    if (!auditBody) {
      return {
        ok: true,
        pendingAgent: true,
        message:
          '已有 hv_response.json，但尚無 LLM audit。\n請在 Cursor 用 validate-ai-test-hv skill 由 LLM 反驗證並寫入 hv_audit.json 後再按「HV 最佳化」。',
      };
    }
    if (auditBody.auditedBy !== 'llm') {
      return {
        ok: false,
        message:
          'hv_audit.json 不符合鐵律（須 auditedBy: "llm"）。\naudit 判定只能由 Cursor LLM 推理，禁止程式 audit 腳本。請用 writeAudit.mjs 寫入。',
      };
    }
    if (auditBody.routesFingerprint && auditBody.routesFingerprint !== fp) {
      return {
        ok: false,
        message:
          'LLM audit 與目前路線不符（routesFingerprint 不同）。\n請在 Cursor 重新用 LLM 反驗證並寫入 hv_audit.json。',
      };
    }
    if (auditBody.pass !== true) {
      const list = (auditBody.violations || [])
        .slice(0, 6)
        .map((v) => v.message || v.code)
        .join('\n');
      const tail =
        (auditBody.violations || []).length > 6
          ? `\n…共 ${auditBody.violations.length} 項違規`
          : '';
      return {
        ok: false,
        message: `LLM audit 未通過：\n${list}${tail}\n請在 Cursor 用 LLM 修正 coords 後重新 writeResponse + LLM audit。`,
      };
    }

    return applyAiTestHvResponseForLayer(layer, responseBody);
  } catch (e) {
    console.error('[HV最佳化]', e);
    return { ok: false, message: e?.message || String(e) };
  }
}

/** @deprecated 改用 runHvOptimizeForLayer */
export const exportHvOptimizePromptForLayer = syncAiTestHvPayloadForLayer;

/** @deprecated 改用 applyAiTestHvResponseForLayer */
export const applyHvOptimizeLlmResponseForLayer = applyAiTestHvResponseForLayer;

/** 隨機產生 / 套用後清除 Agent 回覆檔與 LLM audit 檔 */
export async function resetAiTestHvBridgeFiles() {
  try {
    await deleteAiTestHvResponse();
  } catch {
    /* dev server 未啟動時略過 */
  }
  try {
    await deleteAiTestHvAudit();
  } catch {
    /* dev server 未啟動時略過 */
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

  if (!layer?.processedJsonData?.routes?.length) {
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
    clearHvOptimizePreview(layer);
    await resetAiTestHvBridgeFiles();
    await syncAiTestHvPayloadForLayer(layer);
    overlay.close();
    return { ok: true, message: '已套用 HV 最佳化，路線已更新。' };
  } catch (e) {
    overlay.close();
    console.error('[HV最佳化] 套用失敗:', e);
    return { ok: false, message: `套用失敗：${e?.message || e}` };
  }
}
