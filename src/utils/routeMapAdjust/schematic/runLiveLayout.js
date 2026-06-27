/* eslint-disable no-console */

import { resolveSchematicInput } from './input.js';
import { buildSchematicGraph, splitHighDegreeNodes, applyCoordsToSkeleton, initialCoords } from './graph.js';
import { analyzeRotationStructure, fixRotationStructure } from './rotationStructure.js';
import {
  writeSchematicResultToLayer,
  reinsertBlackStations,
  injectEdgeBends,
  resolveSharedCorridorDrawing,
  findOutputOverlaps,
} from './assemble.js';
import { showSolveOverlay } from './solveOverlay.js';
import { useDataStore } from '@/stores/dataStore.js';
import { syncPostLayoutOverlapState } from './overlapScan.js';

export async function runLiveLayout(layerId, profileId, title, opts = {}) {
  const maxWallMs = opts.maxWallMs ?? (profileId === 'sat' ? 180000 : 0);
  const isMilp = profileId === 'milp';
  const input = resolveSchematicInput(layerId);
  if (!input.ok) {
    if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + input.message);
    return { ok: false, message: input.message };
  }

  const graph = splitHighDegreeNodes(buildSchematicGraph(input.skeletonFlat), 8);
  const refCoordsSnapshot = isMilp ? initialCoords(graph) : null;

  const overlay = showSolveOverlay(title || '示意圖佈局計算中…');

  const result = await new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./schematicWorker.js', import.meta.url), { type: 'module' });
    } catch (e) {
      resolve({ ok: false, message: 'Web Worker 建立失敗：' + (e?.message || e) });
      return;
    }
    let killTimer = null;
    const finish = (res) => { if (killTimer) clearTimeout(killTimer); worker.terminate(); resolve(res); };
    if (maxWallMs > 0) {
      killTimer = setTimeout(() => {
        finish({ ok: false, message: `求解逾時（超過 ${Math.round(maxWallMs / 1000)} 秒）。` });
      }, maxWallMs);
    }
    worker.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.type === 'progress') overlay.setStatus(d.msg);
      else if (d.type === 'done') finish(d.result || { ok: false, message: '無結果' });
    };
    worker.onerror = (err) => { finish({ ok: false, message: 'Worker 錯誤：' + (err?.message || err) }); };
    worker.postMessage({ skeletonFlat: input.skeletonFlat, profileId });
  });

  if (!result.ok) {
    const secs = overlay.close();
    if (typeof window !== 'undefined' && window.alert) window.alert(`[未產出]（耗時 ${secs.toFixed(1)} 秒）\n${result.message}`);
    return { ok: false, message: result.message };
  }

  overlay.setStatus('產生圖層資料…');
  let layoutCoords = result.coords.map((c) => [c[0], c[1]]);
  let structCheck = null;
  let rotationStructureCheck = null;

  if (isMilp) {
    const initialStructCheck = analyzeRotationStructure(graph, refCoordsSnapshot, layoutCoords);
    structCheck = initialStructCheck;
    let fixedIterations = 0;
    if (!initialStructCheck.preserved) {
      overlay.setStatus(`入射方向順序校正（${initialStructCheck.violationCount} 處）…`);
      const fixed = fixRotationStructure(graph, refCoordsSnapshot, layoutCoords);
      structCheck = fixed.check;
      fixedIterations = fixed.iterations || 0;
      if (fixed.ok) layoutCoords = fixed.coords.map((c) => [c[0], c[1]]);
      else console.warn('[入射方向順序校正]', fixed);
    }
    rotationStructureCheck = {
      layoutDone: true,
      preserved: structCheck.preserved,
      detectedCount: initialStructCheck.violationCount,
      detectedReasons: initialStructCheck.reasons,
      remainingCount: structCheck.violationCount,
      remainingReasons: structCheck.reasons,
      fixedIterations,
      fixedOk: structCheck.preserved,
    };
  }

  const optimizedSkeleton = applyCoordsToSkeleton(input.skeletonFlat, graph, layoutCoords);
  injectEdgeBends(optimizedSkeleton, graph, result.edgePaths);
  const fullFlat = reinsertBlackStations(optimizedSkeleton, input.sections);
  const corridor = resolveSharedCorridorDrawing(fullFlat, graph);

  const meta = {
    ...input.meta,
    ...(result.violations || {}),
    h4Pairs: result.h4Pairs,
    sepPairs: result.sepPairs,
    milpStatus: result.status,
    algo: title || profileId,
  };
  if (rotationStructureCheck) meta.rotationStructureCheck = rotationStructureCheck;

  const write = writeSchematicResultToLayer(layerId, fullFlat, meta);

  const secs = overlay.close();
  if (!write.ok) {
    if (typeof window !== 'undefined' && window.alert) window.alert('[寫入失敗]\n' + write.message);
    return write;
  }

  const outOv = findOutputOverlaps(fullFlat);
  syncPostLayoutOverlapState(useDataStore().findLayerById(layerId), fullFlat, corridor, outOv);

  const v = result.violations || {};
  let ovNote = outOv.count > 0 ? `\n⚠️ 仍重疊 ${outOv.count} 段（橘虛線）` : '\n輸出端重疊：0';
  const merged = (corridor.corridorGroups || 0) + (corridor.collinearGroups || 0);
  if (merged > 0) ovNote += `\n已合併 ${merged} 處共軌→多色虛線`;

  let structNote = '';
  if (isMilp && structCheck) {
    structNote = structCheck.preserved
      ? '\n入射方向順序：與讀入骨架一致'
      : `\n⚠️ 入射方向順序仍有 ${structCheck.violationCount} 處不符`;
  }

  const summary = `完成！耗時 ${secs.toFixed(1)} 秒\n八方向違規 ${v.nonocti ?? '?'}、新交叉 ${v.crossings ?? '?'}、新重疊 ${v.overlaps ?? '?'}、重合 ${v.clashes ?? '?'}${structNote}${ovNote}`;
  if (typeof window !== 'undefined' && window.alert) window.alert(summary);
  return { ok: true, message: summary, stats: write.stats, outputOverlaps: outOv.count };
}
