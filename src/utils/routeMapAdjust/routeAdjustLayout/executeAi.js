/* eslint-disable no-console */

/**
 * 「AI調整」圖層：自上游讀入 → LLM 多輪 loop → 逐點驗證 → 寫回圖層。
 * 支援逐步確認（每輪寫入圖層後等待使用者按「確定，下一輪」）。
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
export const MAX_LOOP_ROUNDS = 16;

export function getRouteAdjustAiLayer() {
  return useDataStore().findLayerById(ROUTE_ADJUST_AI_LAYER_ID);
}

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

export function formatAiRoundSummary(payload, applied, loopStats) {
  const { edgeStats, geometry, incremental, foreignRep } = applied;
  const round = loopStats?.rounds ?? 1;
  const initPct = Math.round((payload.meta?.initialHvRatio ?? 0) * 100);
  const hvPct = Math.round((edgeStats.hvRatio ?? 0) * 100);
  const moved = (incremental?.acceptedCount ?? 0) + (foreignRep?.moves ?? 0);
  return [
    `第 ${round} 輪完成（本輪 +${incremental?.acceptedCount ?? 0} 點，壓他線 ${foreignRep?.moves ?? 0} 次${moved === 0 ? '，無點可動' : ''}）`,
    `累計 ${loopStats?.totalAccepted ?? 0} 點 · HV ${edgeStats.hvEdges}/${edgeStats.edgeCount}（${initPct}% → ${hvPct}%）`,
    `幾何：${formatGeometryBlock(geometry)}`,
    formatIncrementalApplySummary(incremental, payload),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildFinalSummary(payload, applied, loopStats, secs) {
  const initPct = Math.round((payload.meta?.initialHvRatio ?? applied.edgeStats.hvRatio ?? 0) * 100);
  const hvPct = Math.round((applied.edgeStats.hvRatio ?? 0) * 100);
  const foreignNote =
    (loopStats.totalForeign ?? 0) > 0 ? `\n（壓他線自動修復共 ${loopStats.totalForeign} 次）` : '';
  return [
    `AI調整完成！共 ${loopStats.rounds} 輪，累計 ${loopStats.totalAccepted} 點`,
    `HV 邊 ${applied.edgeStats.hvEdges}/${applied.edgeStats.edgeCount}（${initPct}% → ${hvPct}%）`,
    `幾何：${formatGeometryBlock(applied.geometry)}${foreignNote}`,
    formatCoordChangeSummary(applied.coordChanges),
    `耗時 ${secs.toFixed(1)} 秒`,
  ]
    .filter(Boolean)
    .join('\n\n');
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

  const summary = buildFinalSummary(payload, applied, loop, 0);
  return {
    ok: true,
    pass: true,
    message: summary,
    stats: write.stats,
    coordChanges,
    edgeStats,
    geometry,
    incremental,
    loopStats: loop,
  };
}

function syncSessionToLayer(session) {
  const layer = getRouteAdjustAiLayer();
  if (layer) layer.llmLayoutSession = session;
}

export function resetRouteAdjustAiSession() {
  const layer = getRouteAdjustAiLayer();
  if (layer) layer.llmLayoutSession = null;
}

function newAiSession(payload) {
  return {
    payload,
    loopStats: { rounds: 0, totalAccepted: 0, totalRejected: 0, totalForeign: 0 },
    phase: 'running',
    canContinue: false,
    roundSummary: '',
    startedAt: Date.now(),
  };
}

/**
 * 執行單一 AI 調整輪次：LLM → 逐點驗證 → 寫入圖層。
 * @returns {Promise<object>}
 */
export async function runOneRouteAdjustAiRound(session) {
  const { payload, loopStats } = session;
  const roundIndex = loopStats.rounds;

  if (roundIndex >= MAX_LOOP_ROUNDS) {
    return { ok: false, message: `已達 ${MAX_LOOP_ROUNDS} 輪上限` };
  }

  loopStats.rounds = roundIndex + 1;
  const overlay = showSolveOverlay(`AI調整第 ${roundIndex + 1} 輪…`);

  try {
    overlay.setStatus(`第 ${roundIndex + 1} 輪：呼叫 LLM…`);
    let response;
    try {
      const forLlm = stripLlmPayloadForExport(payload);
      const messages = buildLlmChatMessages(buildLlmUserPrompt(forLlm, roundIndex));
      response = await callLlmLayoutChat(messages);
    } catch (e) {
      overlay.close();
      return {
        ok: false,
        message: `LLM 呼叫失敗（第 ${roundIndex + 1} 輪）：${e?.message || e}`,
      };
    }

    overlay.setStatus(`第 ${roundIndex + 1} 輪：逐點驗證…`);
    let applied;
    try {
      applied = applyLlmLayoutDirectFromPayload(payload, response);
      applied.coordChanges = computeCoordChanges(payload, applied.coords);
    } catch (e) {
      overlay.close();
      return {
        ok: false,
        message: `座標解析失敗（第 ${roundIndex + 1} 輪）：${e?.message || e}`,
      };
    }

    const movedThisRound =
      (applied.incremental?.acceptedCount ?? 0) + (applied.foreignRep?.moves ?? 0);
    loopStats.totalAccepted += applied.incremental?.acceptedCount ?? 0;
    loopStats.totalRejected += applied.incremental?.rejectedCount ?? 0;
    loopStats.totalForeign += applied.foreignRep?.moves ?? 0;

    overlay.setStatus('寫入圖層…');
    const apply = applyRouteAdjustAiLayout(payload, applied, loopStats);
    overlay.close();

    if (!apply.ok) return apply;

    const canContinue = movedThisRound > 0 && loopStats.rounds < MAX_LOOP_ROUNDS;
    if (canContinue) {
      refreshLlmPayloadFromCoords(payload, applied.coords);
    }

    session.lastApplied = applied;
    session.canContinue = canContinue;
    session.roundSummary = formatAiRoundSummary(payload, applied, loopStats);
    session.movedThisRound = movedThisRound;

    return {
      ok: true,
      apply,
      canContinue,
      movedThisRound,
      roundSummary: session.roundSummary,
      loopStats: { ...loopStats },
    };
  } catch (e) {
    overlay.close();
    throw e;
  }
}

/** 逐步模式：開始（第 1 輪） */
export async function startRouteAdjustAiStepwise() {
  resetRouteAdjustAiSession();
  const built = buildRouteAdjustAiPayload();
  if (!built.ok) {
    return { ok: false, message: built.message };
  }
  const payload = built.payload;
  payload._originalInitialGrid = payload.nodes.map((n) => [...n.initial_grid]);
  const session = newAiSession(payload);
  syncSessionToLayer(session);

  const result = await runOneRouteAdjustAiRound(session);
  if (!result.ok) {
    resetRouteAdjustAiSession();
    return result;
  }

  if (result.canContinue) {
    session.phase = 'awaiting_confirm';
  } else {
    session.phase = 'done';
    const secs = (Date.now() - session.startedAt) / 1000;
    result.finalMessage = buildFinalSummary(session.payload, session.lastApplied, session.loopStats, secs);
  }
  syncSessionToLayer(session);
  return { ...result, phase: session.phase };
}

/** 逐步模式：確認後下一輪 */
export async function continueRouteAdjustAiStepwise() {
  const layer = getRouteAdjustAiLayer();
  const session = layer?.llmLayoutSession;
  if (!session || session.phase !== 'awaiting_confirm') {
    return { ok: false, message: '目前沒有待確認的 AI 調整輪次' };
  }

  session.phase = 'running';
  syncSessionToLayer(session);

  const result = await runOneRouteAdjustAiRound(session);
  if (!result.ok) {
    session.phase = 'awaiting_confirm';
    syncSessionToLayer(session);
    return result;
  }

  if (result.canContinue) {
    session.phase = 'awaiting_confirm';
  } else {
    session.phase = 'done';
    const secs = (Date.now() - session.startedAt) / 1000;
    result.finalMessage = buildFinalSummary(session.payload, session.lastApplied, session.loopStats, secs);
  }
  syncSessionToLayer(session);
  return { ...result, phase: session.phase };
}

/** 逐步模式：停止（保留目前已寫入圖層的結果） */
export function stopRouteAdjustAiStepwise() {
  const layer = getRouteAdjustAiLayer();
  const session = layer?.llmLayoutSession;
  if (!session) {
    return { ok: false, message: '沒有進行中的 session' };
  }
  session.phase = 'done';
  session.canContinue = false;
  syncSessionToLayer(session);
  const secs = (Date.now() - (session.startedAt || Date.now())) / 1000;
  return {
    ok: true,
    message: `已停止（保留第 ${session.loopStats.rounds} 輪結果）\n耗時 ${secs.toFixed(1)} 秒`,
    phase: 'done',
  };
}

/**
 * dataStore executeFunction：自動跑完所有輪（不逐步確認）。
 */
export async function executeRouteAdjustAi() {
  const built = buildRouteAdjustAiPayload();
  if (!built.ok) {
    if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + built.message);
    return { ok: false, message: built.message };
  }

  const payload = built.payload;
  payload._originalInitialGrid = payload.nodes.map((n) => [...n.initial_grid]);
  const session = newAiSession(payload);
  const startedAt = Date.now();
  let lastResult = null;

  try {
    while (session.loopStats.rounds < MAX_LOOP_ROUNDS) {
      const result = await runOneRouteAdjustAiRound(session);
      if (!result.ok) {
        if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + result.message);
        return result;
      }
      lastResult = result;
      if (!result.canContinue) break;
    }

    if (!lastResult?.ok) {
      const msg = '未執行任何調整';
      if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + msg);
      return { ok: false, message: msg };
    }

    const secs = (Date.now() - startedAt) / 1000;
    const summary = buildFinalSummary(session.payload, session.lastApplied, session.loopStats, secs);
    if (typeof window !== 'undefined' && window.alert) window.alert(summary);
    return { ...lastResult.apply, message: summary };
  } finally {
    resetRouteAdjustAiSession();
  }
}
