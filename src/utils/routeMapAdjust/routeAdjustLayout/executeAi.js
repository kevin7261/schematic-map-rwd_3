/* eslint-disable no-console */

/**
 * 「AI調整」圖層：自上游讀入 → LLM（skill prompt）→ 驗證迴圈 → 寫回圖層。
 */

import { resolveRouteAdjustLayoutInput } from './input.js';
import { writeRouteAdjustLayoutResultToLayer } from './writeResult.js';
import { findOutputOverlaps } from '../schematic/assemble.js';
import { syncPostLayoutOverlapState } from '../schematic/overlapScan.js';
import { showSolveOverlay } from '../schematic/solveOverlay.js';
import { useDataStore } from '@/stores/dataStore.js';
import { ROUTE_ADJUST_AI_LAYER_ID } from './layerIds.js';
import {
  buildLlmPayloadFromSkeleton,
  validateLlmLayoutFromPayload,
  stripLlmPayloadForExport,
  buildLlmUserPrompt,
  buildLlmRepairPrompt,
  buildLlmChatMessages,
  computeCoordChanges,
  formatCoordChangeSummary,
} from './llmLayoutCore.js';
import { callLlmLayoutChat } from './llmApiClient.js';

const MAX_LLM_ROUNDS = 3;

/**
 * 自上游建立完整 LLM payload（含 skeleton，供驗證/套用）。
 */
export function buildRouteAdjustAiPayload() {
  const input = resolveRouteAdjustLayoutInput();
  if (!input.ok) return input;
  const payload = buildLlmPayloadFromSkeleton(
    input.skeletonFlat,
    input.refAngleFlat,
    input.sections,
    input.meta
  );
  return { ok: true, payload, input };
}

/**
 * 驗證 LLM 回覆 JSON（不寫入圖層）。
 */
export function validateRouteAdjustAiResponse(payload, response) {
  try {
    const report = validateLlmLayoutFromPayload(payload, response);
    return { ok: true, ...report };
  } catch (e) {
    return { ok: false, pass: false, message: e?.message || String(e) };
  }
}

/**
 * 套用 LLM 座標並寫入 AI調整 圖層。
 */
export function applyRouteAdjustAiLayout(payload, response) {
  const report = validateRouteAdjustAiResponse(payload, response);
  if (!report.ok) return report;
  if (!report.pass) {
    return {
      ok: false,
      pass: false,
      message: '驗證未通過',
      violations: report.violations,
      repairHints: report.repairHints,
    };
  }

  const dataStore = useDataStore();
  const layerId = ROUTE_ADJUST_AI_LAYER_ID;
  const coordChanges = report.coordChanges || computeCoordChanges(payload, report.coords);
  const meta = {
    ...(payload.meta || {}),
    algo: 'AI調整（LLM）',
    llmLayout: {
      hvRatio: report.violations?.hvRatio,
      hvEdges: report.violations?.hvEdges,
      edgeCount: report.violations?.edgeCount,
      changeCount: coordChanges.changeCount,
      coordChanges: coordChanges.changed,
    },
    _schematicGraph: report.graph,
  };

  const write = writeRouteAdjustLayoutResultToLayer(layerId, report.fullFlat, meta);
  if (!write.ok) return write;

  const layer = dataStore.findLayerById(layerId);
  layer.llmLayoutLastValidation = {
    pass: true,
    violations: report.violations,
    rotation: report.rotation,
    coordChanges,
    changeSummary: formatCoordChangeSummary(coordChanges),
  };

  const corridor = write.corridor || { corridorGroups: 0, collinearGroups: 0 };
  const outOv = findOutputOverlaps(report.fullFlat);
  syncPostLayoutOverlapState(layer, report.fullFlat, corridor, outOv);
  dataStore.requestSpaceNetworkGridFullRedraw();

  const v = report.violations || {};
  const hvPct = Math.round((v.hvRatio ?? 0) * 100);
  const summary = [
    `AI調整完成！HV 邊 ${v.hvEdges ?? '?'}/${v.edgeCount ?? '?'}（${hvPct}%）、交叉 ${v.crossings ?? 0}、重疊 ${v.overlaps ?? 0}、同格 ${v.clashes ?? 0}、環序 ${v.rotationFail ? 'FAIL' : 'OK'}`,
    formatCoordChangeSummary(coordChanges),
  ].join('\n\n');
  return { ok: true, pass: true, message: summary, stats: write.stats, report, coordChanges };
}

/**
 * dataStore executeFunction：自動讀上游 → LLM skill 佈局 → 最多 3 輪修復。
 */
export async function executeRouteAdjustAi() {
  const built = buildRouteAdjustAiPayload();
  if (!built.ok) {
    if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + built.message);
    return { ok: false, message: built.message };
  }

  const payload = built.payload;
  const forLlm = stripLlmPayloadForExport(payload);
  const overlay = showSolveOverlay('AI調整計算中…');

  let lastReport = null;
  let userPrompt = buildLlmUserPrompt(forLlm);

  try {
    for (let round = 0; round < MAX_LLM_ROUNDS; round++) {
      overlay.setStatus(round === 0 ? '呼叫 LLM 產生座標…' : `修復回合 ${round + 1}/${MAX_LLM_ROUNDS}…`);
      let response;
      try {
        const messages = buildLlmChatMessages(userPrompt);
        response = await callLlmLayoutChat(messages);
      } catch (e) {
        const secs = overlay.close();
        const msg = `LLM 呼叫失敗（${secs.toFixed(1)}s）：${e?.message || e}`;
        if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + msg);
        return { ok: false, message: msg };
      }

      overlay.setStatus('驗證硬約束…');
      lastReport = validateRouteAdjustAiResponse(payload, response);
      if (!lastReport.ok) {
        const secs = overlay.close();
        const msg = `驗證錯誤（${secs.toFixed(1)}s）：${lastReport.message}`;
        if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + msg);
        return { ok: false, message: msg };
      }

      if (lastReport.pass) {
        overlay.setStatus('寫入圖層…');
        const apply = applyRouteAdjustAiLayout(payload, response);
        const secs = overlay.close();
        if (!apply.ok) {
          if (typeof window !== 'undefined' && window.alert) window.alert('[寫入失敗]\n' + apply.message);
          return apply;
        }
        const summary = `${apply.message}\n耗時 ${secs.toFixed(1)} 秒`;
        if (typeof window !== 'undefined' && window.alert) window.alert(summary);
        return { ...apply, message: summary };
      }

      userPrompt = buildLlmRepairPrompt(forLlm, lastReport);
    }

    const secs = overlay.close();
    const hints = (lastReport?.repairHints ?? []).slice(0, 5).join('\n');
    const msg = `${MAX_LLM_ROUNDS} 輪後仍未通過驗證（${secs.toFixed(1)}s）${hints ? '\n\n' + hints : ''}`;
    if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + msg);
    return { ok: false, message: msg, violations: lastReport?.violations, repairHints: lastReport?.repairHints };
  } catch (e) {
    overlay.close();
    throw e;
  }
}
