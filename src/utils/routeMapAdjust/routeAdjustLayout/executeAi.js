/* eslint-disable no-console */

/**
 * 「AI調整」圖層：自上游讀入 → LLM 多輪 loop → 逐點驗證 → 寫回圖層。
 * 每輪 LLM + 逐點移動；該輪完全無點可動時結束。
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
  applyLlmLayoutDirectFromPayload,
  refreshLlmPayloadFromCoords,
  stripLlmPayloadForExport,
  buildLlmUserPrompt,
  buildLlmChatMessages,
  computeCoordChanges,
  formatCoordChangeSummary,
  formatIncrementalApplySummary,
} from './llmLayoutCore.js';
import { callLlmLayoutChat } from './llmApiClient.js';

/** 安全上限，避免無限 LLM 呼叫 */
const MAX_LOOP_ROUNDS = 16;

/**
 * 自上游建立完整 LLM payload（含 skeleton，供套用）。
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
 * 驗證 LLM 回覆 JSON（CLI 選用）。
 */
export function validateRouteAdjustAiResponse(payload, response) {
  try {
    const report = validateLlmLayoutFromPayload(payload, response);
    return { ok: true, ...report };
  } catch (e) {
    return { ok: false, pass: false, message: e?.message || String(e) };
  }
}

function formatGeometryBlock(geometry) {
  if (!geometry) return '';
  return `重疊 ${geometry.overlaps ?? 0}、交叉 ${geometry.crossings ?? 0}、同格 ${geometry.clashes ?? 0}、壓他線 ${geometry.onForeignEdge ?? 0}`;
}

/**
 * 套用逐點驗證後的座標並寫入 AI調整 圖層。
 */
export function applyRouteAdjustAiLayout(payload, applied, loopStats = null) {
  const { coordChanges, edgeStats, graph, fullFlat, geometry, foreignRep, incremental } = applied;
  const loop = loopStats || {};

  const dataStore = useDataStore();
  const layerId = ROUTE_ADJUST_AI_LAYER_ID;
  const meta = {
    ...(payload.meta || {}),
    algo: 'AI調整（LLM·逐點驗證·多輪）',
    llmLayout: {
      hvRatio: edgeStats.hvRatio,
      hvEdges: edgeStats.hvEdges,
      edgeCount: edgeStats.edgeCount,
      changeCount: coordChanges.changeCount,
      loopRounds: loop.rounds ?? 1,
      totalAcceptedMoves: loop.totalAccepted ?? incremental?.acceptedCount ?? 0,
      totalRejectedMoves: loop.totalRejected ?? incremental?.rejectedCount ?? 0,
      totalForeignRepairs: loop.totalForeign ?? foreignRep?.moves ?? 0,
      coordChanges: coordChanges.changed,
      foreignEdgeRepairs: foreignRep?.moves ?? 0,
    },
    _schematicGraph: graph,
    overlaps: geometry.overlaps,
    crossings: geometry.crossings,
    clashes: geometry.clashes,
    onForeignEdge: geometry.onForeignEdge,
  };

  const write = writeRouteAdjustLayoutResultToLayer(layerId, fullFlat, meta);
  if (!write.ok) return write;

  const incrementalSummary = formatIncrementalApplySummary(incremental, payload);
  const layer = dataStore.findLayerById(layerId);
  layer.llmLayoutLastValidation = {
    pass: true,
    violations: { ...geometry, ...edgeStats },
    coordChanges,
    incremental,
    loopStats: loop,
    changeSummary: [formatCoordChangeSummary(coordChanges), incrementalSummary].filter(Boolean).join('\n\n'),
  };

  const corridor = write.corridor || { corridorGroups: 0, collinearGroups: 0 };
  const outOv = findOutputOverlaps(fullFlat);
  syncPostLayoutOverlapState(layer, fullFlat, corridor, outOv);
  dataStore.requestSpaceNetworkGridFullRedraw();

  const initPct = Math.round((payload.meta?.initialHvRatio ?? edgeStats.hvRatio ?? 0) * 100);
  const hvPct = Math.round((edgeStats.hvRatio ?? 0) * 100);
  const foreignNote =
    (loop.totalForeign ?? foreignRep?.moves ?? 0) > 0
      ? `\n（壓他線自動修復共 ${loop.totalForeign ?? foreignRep?.moves} 次）`
      : '';
  const loopNote = `共 ${loop.rounds ?? 1} 輪（本輪套用 ${incremental?.acceptedCount ?? 0} 點，累計 ${loop.totalAccepted ?? 0} 點）`;
  const summary = [
    `AI調整完成！${loopNote}`,
    `HV 邊 ${edgeStats.hvEdges}/${edgeStats.edgeCount}（${initPct}% → ${hvPct}%）`,
    `幾何：${formatGeometryBlock(geometry)}${foreignNote}`,
    formatCoordChangeSummary(coordChanges),
    incrementalSummary,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { ok: true, pass: true, message: summary, stats: write.stats, coordChanges, edgeStats, geometry, incremental, loopStats: loop };
}

/**
 * dataStore executeFunction：多輪 LLM loop，直到該輪無任何點可動。
 */
export async function executeRouteAdjustAi() {
  const built = buildRouteAdjustAiPayload();
  if (!built.ok) {
    if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + built.message);
    return { ok: false, message: built.message };
  }

  const payload = built.payload;
  payload._originalInitialGrid = payload.nodes.map((n) => [...n.initial_grid]);

  const overlay = showSolveOverlay('AI調整計算中…');
  const loopStats = { rounds: 0, totalAccepted: 0, totalRejected: 0, totalForeign: 0 };
  let lastApplied = null;

  try {
    for (let round = 0; round < MAX_LOOP_ROUNDS; round++) {
      loopStats.rounds = round + 1;
      overlay.setStatus(`AI 調整第 ${round + 1} 輪：呼叫 LLM…`);

      let response;
      try {
        const forLlm = stripLlmPayloadForExport(payload);
        const messages = buildLlmChatMessages(buildLlmUserPrompt(forLlm, round));
        response = await callLlmLayoutChat(messages);
      } catch (e) {
        const secs = overlay.close();
        const msg = `LLM 呼叫失敗（第 ${round + 1} 輪，${secs.toFixed(1)}s）：${e?.message || e}`;
        if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + msg);
        return { ok: false, message: msg };
      }

      overlay.setStatus(`AI 調整第 ${round + 1} 輪：逐點驗證…`);
      let applied;
      try {
        applied = applyLlmLayoutDirectFromPayload(payload, response);
      } catch (e) {
        const secs = overlay.close();
        const msg = `座標解析失敗（第 ${round + 1} 輪，${secs.toFixed(1)}s）：${e?.message || e}`;
        if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + msg);
        return { ok: false, message: msg };
      }

      const movedThisRound =
        (applied.incremental?.acceptedCount ?? 0) + (applied.foreignRep?.moves ?? 0);
      loopStats.totalAccepted += applied.incremental?.acceptedCount ?? 0;
      loopStats.totalRejected += applied.incremental?.rejectedCount ?? 0;
      loopStats.totalForeign += applied.foreignRep?.moves ?? 0;
      lastApplied = applied;

      if (movedThisRound === 0) {
        break;
      }

      refreshLlmPayloadFromCoords(payload, applied.coords);
    }

    if (!lastApplied) {
      const secs = overlay.close();
      const msg = `未執行任何調整（${secs.toFixed(1)}s）`;
      if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + msg);
      return { ok: false, message: msg };
    }

    lastApplied.coordChanges = computeCoordChanges(payload, lastApplied.coords);

    overlay.setStatus('寫入圖層…');
    const apply = applyRouteAdjustAiLayout(payload, lastApplied, loopStats);
    const secs = overlay.close();
    if (!apply.ok) {
      if (typeof window !== 'undefined' && window.alert) window.alert('[寫入失敗]\n' + apply.message);
      return apply;
    }
    const summary = `${apply.message}\n耗時 ${secs.toFixed(1)} 秒`;
    if (typeof window !== 'undefined' && window.alert) window.alert(summary);
    return { ...apply, message: summary };
  } catch (e) {
    overlay.close();
    throw e;
  }
}
