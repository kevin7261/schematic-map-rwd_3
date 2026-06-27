/* eslint-disable no-console */

/**
 * 主執行緒協調：即時（不預計算）求解精確八方向佈局。
 *  1. resolveSchematicInput 取 connect 骨架。
 *  2. 顯示全螢幕 overlay + 即時計時。
 *  3. 在 Web Worker 求解（主執行緒不凍結 → 計時持續更新；中途不停止，算到完成）。
 *  4. 完成後寫回圖層、關閉 overlay、跳出「耗時 X 秒」。
 */

import { resolveSchematicInput } from './input.js';
import { buildSchematicGraph, splitHighDegreeNodes, applyCoordsToSkeleton } from './graph.js';
import { writeSchematicResultToLayer, reinsertBlackStations } from './assemble.js';
import { showSolveOverlay } from './solveOverlay.js';

export async function runLiveLayout(layerId, profileId, title) {
  const input = resolveSchematicInput(layerId);
  if (!input.ok) {
    if (typeof window !== 'undefined' && window.alert) window.alert('[未產出]\n' + input.message);
    return { ok: false, message: input.message };
  }

  const overlay = showSolveOverlay(title || '示意圖佈局計算中…');

  const result = await new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./schematicWorker.js', import.meta.url), { type: 'module' });
    } catch (e) {
      resolve({ ok: false, message: 'Web Worker 建立失敗：' + (e?.message || e) });
      return;
    }
    worker.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.type === 'progress') overlay.setStatus(d.msg);
      else if (d.type === 'done') { worker.terminate(); resolve(d.result || { ok: false, message: '無結果' }); }
    };
    worker.onerror = (err) => { worker.terminate(); resolve({ ok: false, message: 'Worker 錯誤：' + (err?.message || err) }); };
    worker.postMessage({ skeletonFlat: input.skeletonFlat, profileId });
  });

  if (!result.ok) {
    const secs = overlay.close();
    if (typeof window !== 'undefined' && window.alert) window.alert(`[未產出]（耗時 ${secs.toFixed(1)} 秒）\n${result.message}`);
    return { ok: false, message: result.message };
  }

  // 主執行緒組裝：重建同一張圖 → 套用座標 → 內插黑站 → 寫回圖層。
  overlay.setStatus('產生圖層資料…');
  const graph = splitHighDegreeNodes(buildSchematicGraph(input.skeletonFlat), 8);
  const optimizedSkeleton = applyCoordsToSkeleton(input.skeletonFlat, graph, result.coords);
  const fullFlat = reinsertBlackStations(optimizedSkeleton, input.sections);
  const v = result.violations || {};
  const write = writeSchematicResultToLayer(layerId, fullFlat, {
    ...input.meta, ...v, h4Pairs: result.h4Pairs, sepPairs: result.sepPairs, milpStatus: result.status,
    // 各圖層據實標示其演算法（只有 ③ MILP 是精確求解；①② 為啟發式/直接式）。
    algo: title || profileId,
  });

  const secs = overlay.close();
  if (!write.ok) {
    if (typeof window !== 'undefined' && window.alert) window.alert('[寫入失敗]\n' + write.message);
    return write;
  }
  const fbNote = result.fallback
    ? '\n（精確 MILP 對瀏覽器太重，已自動改用啟發式八方向佈局保證產出）'
    : '';
  const summary = `完成！耗時 ${secs.toFixed(1)} 秒\n八方向違規 ${v.nonocti ?? '?'}、新交叉 ${v.crossings ?? '?'}、新重疊 ${v.overlaps ?? '?'}、重合 ${v.clashes ?? '?'}${fbNote}`;
  if (typeof window !== 'undefined' && window.alert) window.alert(summary);
  return { ok: true, message: summary, stats: write.stats };
}
