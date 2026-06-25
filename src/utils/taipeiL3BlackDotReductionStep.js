/**
 * taipei_l3：依 Data 分頁之「weight 差」最小者，合併銜接黑點兩側之權重區間（或合併同路線兩段），
 * 新權重為兩段之 max；路段合併語意與 mergeTwoTaipeiFSegmentsSameRoute 一致。
 */

import { normalizeSpaceNetworkDataToFlatSegments } from './gridNormalizationMinDistance.js';
import {
  collectTaipeiL3JunctionReductionCandidates,
  buildTaipeiL3JunctionDataTableRows,
} from './taipeiL3JunctionDataTable.js';
import {
  mergeTwoTaipeiFSegmentsSameRoute,
  getNodeAtSegmentIndex,
} from './randomConnectSegmentWeights.js';
import { useDataStore } from '@/stores/dataStore.js';
import { computeStationDataFromRoutes } from './dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from './taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js';

const TAIPEI_L3_BLACK_DOT_REDUCTION_LAYER_IDS = new Set([
  'taipei_l3',
  'taipei_l3_dp',
  'taipei_l3_dp_nd',
]);

function isTaipeiL3BlackDotReductionLayer(layer) {
  return Boolean(layer && TAIPEI_L3_BLACK_DOT_REDUCTION_LAYER_IDS.has(layer.layerId));
}

function compareCandidates(a, b) {
  if (a.diff !== b.diff) return a.diff - b.diff;
  const ka = a.kind === 'intra' ? 0 : 1;
  const kb = b.kind === 'intra' ? 0 : 1;
  if (ka !== kb) return ka - kb;
  if (a.kind === 'intra' && b.kind === 'intra') {
    if (a.segIndex !== b.segIndex) return a.segIndex - b.segIndex;
    return a.junctionIdx - b.junctionIdx;
  }
  if (a.kind === 'inter' && b.kind === 'inter') {
    if (a.segIndexA !== b.segIndexA) return a.segIndexA - b.segIndexA;
    return a.segIndexB - b.segIndexB;
  }
  return 0;
}

function pointToGridXY(pt) {
  if (pt == null) return null;
  const px = Array.isArray(pt) ? pt[0] : pt?.x;
  const py = Array.isArray(pt) ? pt[1] : pt?.y;
  if (!Number.isFinite(Number(px)) || !Number.isFinite(Number(py))) return null;
  return { x: Number(px), y: Number(py) };
}

/**
 * 下一筆將合併之黑點（與「下一步」候選相同），供 SpaceNetworkGridTab 以 highlightedBlackStation 繪製。
 * @param {{ kind: string }} pick
 * @param {Array} segs 已 normalize 之 flat segments（與 pick 索引一致）
 * @returns {{ layerId: string, x: number, y: number, stationId?: string, color?: string } | null}
 */
function blackDotHighlightPayloadFromPick(pick, segs, highlightLayerId = 'taipei_l3') {
  if (!pick || !Array.isArray(segs)) return null;
  const HL_COLOR = '#00e5ff';

  if (pick.kind === 'intra') {
    const seg = segs[pick.segIndex];
    const pts = seg?.points || [];
    const j = pick.junctionIdx;
    if (j < 0 || j >= pts.length) return null;
    const xy = pointToGridXY(pts[j]);
    if (!xy) return null;
    const nodes = seg?.nodes || [];
    const node = nodes[j];
    const sid = node?.station_id ?? node?.tags?.station_id;
    const out = { layerId: highlightLayerId, x: xy.x, y: xy.y, color: HL_COLOR };
    if (sid != null && String(sid).trim() !== '') out.stationId = String(sid).trim();
    return out;
  }

  if (pick.kind === 'inter') {
    const segA = segs[pick.segIndexA];
    const ptsA = segA?.points || [];
    const na = ptsA.length;
    if (na < 1) return null;
    const xy = pointToGridXY(ptsA[na - 1]);
    if (!xy) return null;
    const endNode = getNodeAtSegmentIndex(segA, na - 1, na);
    const sid = endNode?.station_id ?? endNode?.tags?.station_id;
    const out = { layerId: highlightLayerId, x: xy.x, y: xy.y, color: HL_COLOR };
    if (sid != null && String(sid).trim() !== '') out.stationId = String(sid).trim();
    return out;
  }

  return null;
}

/**
 * 依目前 L3 路網更新 store 之「下一筆合併黑點」高亮（無候選則清除）。
 * @param {{ layerId: string, spaceNetworkGridJsonDataL3Tab?: Array } | null | undefined} layer
 */
export function refreshTaipeiL3BlackDotHighlightFromLayer(layer) {
  const dataStore = useDataStore();
  if (!isTaipeiL3BlackDotReductionLayer(layer)) return;

  const raw = layer.spaceNetworkGridJsonDataL3Tab;
  if (!Array.isArray(raw) || raw.length === 0) {
    dataStore.setHighlightedBlackStation(null);
    return;
  }

  const segs = JSON.parse(JSON.stringify(normalizeSpaceNetworkDataToFlatSegments(raw)));
  const candidates = collectTaipeiL3JunctionReductionCandidates(segs);
  if (candidates.length === 0) {
    dataStore.setHighlightedBlackStation(null);
    return;
  }
  candidates.sort(compareCandidates);
  const payload = blackDotHighlightPayloadFromPick(candidates[0], segs, layer.layerId);
  dataStore.setHighlightedBlackStation(payload);
}

/**
 * 單一路段內：合併於 junctionIdx 相接之兩筆 station_weights，weight = max(w1,w2)；
 * 並將該頂點之黑點節點降格為純 line（與 taipei_g 兩段合併時接點處理一致）。
 * @returns {boolean}
 */
function mergeIntraStationWeightsAtJunction(seg, junctionIdx) {
  const j = junctionIdx;
  const sw = Array.isArray(seg.station_weights) ? [...seg.station_weights] : [];
  const sorted = sw
    .filter((w) => w && Number.isFinite(Number(w.weight)))
    .slice()
    .sort((a, b) => (Number(a.start_idx) || 0) - (Number(b.start_idx) || 0));

  let w1 = null;
  let w2 = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const je = Number.isFinite(a.end_idx) ? a.end_idx : null;
    const js = Number.isFinite(b.start_idx) ? b.start_idx : null;
    if (je === j && js === j) {
      w1 = a;
      w2 = b;
      break;
    }
  }
  if (!w1 || !w2) return false;

  const merged = {
    start_idx: Number.isFinite(w1.start_idx) ? w1.start_idx : 0,
    end_idx: Number.isFinite(w2.end_idx) ? w2.end_idx : Math.max(0, (seg.points || []).length - 1),
    weight: Math.max(Number(w1.weight), Number(w2.weight)),
  };

  const next = sw.filter((w) => w !== w1 && w !== w2);
  next.push(merged);
  seg.station_weights = next.sort(
    (a, b) => (Number(a.start_idx) || 0) - (Number(b.start_idx) || 0)
  );
  seg.l3_black_dot_reduced_weight_green = true;

  const nodes = seg.nodes;
  const pts = seg.points;
  if (
    Array.isArray(nodes) &&
    Array.isArray(pts) &&
    nodes.length === pts.length &&
    j > 0 &&
    j < nodes.length - 1
  ) {
    const jn = nodes[j];
    if (jn && typeof jn === 'object') {
      const bare = { node_type: 'line' };
      const xg = jn.x_grid ?? jn.tags?.x_grid;
      const yg = jn.y_grid ?? jn.tags?.y_grid;
      if (xg != null) bare.x_grid = xg;
      if (yg != null) bare.y_grid = yg;
      if (jn.tags && typeof jn.tags === 'object') {
        bare.tags = { x_grid: xg, y_grid: yg };
      } else {
        bare.tags = {};
      }
      nodes[j] = bare;
    }
  }

  return true;
}

function syncTaipeiL3DerivedFields(layer, flatSegs) {
  const snOut = flatSegs;
  const snCopy = JSON.parse(JSON.stringify(snOut));

  layer.spaceNetworkGridJsonDataL3Tab = snCopy;
  layer.spaceNetworkGridJsonData = JSON.parse(JSON.stringify(snOut));

  const computed = computeStationDataFromRoutes(snOut);
  layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  layer.spaceNetworkGridJsonDataL3Tab_SectionData = JSON.parse(
    JSON.stringify(computed.sectionData)
  );
  layer.spaceNetworkGridJsonDataL3Tab_ConnectData = JSON.parse(
    JSON.stringify(computed.connectData)
  );
  layer.spaceNetworkGridJsonDataL3Tab_StationData = JSON.parse(
    JSON.stringify(computed.stationData)
  );

  let processedJsonData;
  try {
    processedJsonData = flatSegmentsToGeojsonStyleExportRows(snOut);
  } catch {
    processedJsonData = [];
  }
  layer.processedJsonData = processedJsonData;
  layer.processedJsonDataL3Tab =
    processedJsonData != null ? JSON.parse(JSON.stringify(processedJsonData)) : null;

  layer.dataTableData = buildTaipeiL3JunctionDataTableRows(snOut);

  layer.layoutGridJsonData = JSON.parse(JSON.stringify(snOut));
  layer.layoutGridJsonData_Test = JSON.parse(JSON.stringify(snOut));
  layer.layoutGridJsonData_Test2 = JSON.parse(JSON.stringify(snOut));

  refreshTaipeiL3BlackDotHighlightFromLayer(layer);
}

/**
 * 對 taipei_l3 圖層執行一步：於所有可合併黑點候選中選 weight 差最小者合併。
 * @param {{ layerId: string, spaceNetworkGridJsonDataL3Tab?: Array }} layer
 * @returns {{ changed: boolean, reason?: string }}
 */
export function applyTaipeiL3BlackDotReductionOneStep(layer) {
  if (!isTaipeiL3BlackDotReductionLayer(layer)) {
    return { changed: false, reason: 'not_taipei_l3' };
  }
  const raw = layer.spaceNetworkGridJsonDataL3Tab;
  if (!Array.isArray(raw) || raw.length === 0) {
    refreshTaipeiL3BlackDotHighlightFromLayer(layer);
    return { changed: false, reason: 'no_l3_routes' };
  }

  const segs = JSON.parse(JSON.stringify(normalizeSpaceNetworkDataToFlatSegments(raw)));
  const candidates = collectTaipeiL3JunctionReductionCandidates(segs);
  if (candidates.length === 0) {
    refreshTaipeiL3BlackDotHighlightFromLayer(layer);
    return { changed: false, reason: 'no_mergeable_junctions' };
  }

  candidates.sort(compareCandidates);
  const pick = candidates[0];

  if (pick.kind === 'intra') {
    const seg = JSON.parse(JSON.stringify(segs[pick.segIndex]));
    const ok = mergeIntraStationWeightsAtJunction(seg, pick.junctionIdx);
    if (!ok) {
      refreshTaipeiL3BlackDotHighlightFromLayer(layer);
      return { changed: false, reason: 'intra_merge_failed' };
    }
    segs[pick.segIndex] = seg;
    syncTaipeiL3DerivedFields(layer, segs);
    return { changed: true };
  }

  let ia = pick.segIndexA;
  let ib = pick.segIndexB;
  if (
    !Number.isFinite(ia) ||
    !Number.isFinite(ib) ||
    ia < 0 ||
    ib < 0 ||
    ia >= segs.length ||
    ib >= segs.length
  ) {
    refreshTaipeiL3BlackDotHighlightFromLayer(layer);
    return { changed: false, reason: 'bad_segment_indices' };
  }
  let first = JSON.parse(JSON.stringify(segs[ia]));
  let second = JSON.parse(JSON.stringify(segs[ib]));
  if (ib < ia) {
    const t = ia;
    ia = ib;
    ib = t;
    const ts = first;
    first = second;
    second = ts;
  }
  const mergedW = Math.max(Number(pick.w1), Number(pick.w2));
  const merged = mergeTwoTaipeiFSegmentsSameRoute(first, second, mergedW, {
    l3BlackDotReconnectMerge: true,
  });
  if (!merged) {
    refreshTaipeiL3BlackDotHighlightFromLayer(layer);
    return { changed: false, reason: 'inter_merge_failed' };
  }

  const next = segs.slice();
  next[ia] = merged;
  next.splice(ib, 1);
  syncTaipeiL3DerivedFields(layer, next);
  return { changed: true };
}

const TAIPEI_L3_REDUCTION_UNTIL_DIFF_MAX_STEPS = 10000;

/**
 * 一鍵連續合併：僅在「目前候選中最小 weight 差」仍小於 threshold 時執行下一步；
 * 當最小 weight 差 ≥ threshold、無候選、或單步失敗則停止。
 * @param {{ layerId: string, spaceNetworkGridJsonDataL3Tab?: Array }} layer
 * @param {number} threshold n：最小 weight 差達此值後不再合併（無效值則視為 500）
 * @returns {Promise<{ steps: number, stopped: 'min_diff_ge_threshold' | 'no_candidates' | 'no_routes' | 'step_failed' | 'not_l3' | 'max_steps' }>}
 */
export async function applyTaipeiL3BlackDotReductionWhileMinDiffLessThan(layer, threshold) {
  if (!isTaipeiL3BlackDotReductionLayer(layer)) {
    return { steps: 0, stopped: 'not_l3' };
  }
  const rawNum = Number(threshold);
  const lim = Number.isFinite(rawNum) && rawNum >= 0 ? rawNum : 500;

  let steps = 0;
  for (let i = 0; i < TAIPEI_L3_REDUCTION_UNTIL_DIFF_MAX_STEPS; i++) {
    const raw = layer.spaceNetworkGridJsonDataL3Tab;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { steps, stopped: 'no_routes' };
    }
    const segs = JSON.parse(JSON.stringify(normalizeSpaceNetworkDataToFlatSegments(raw)));
    const candidates = collectTaipeiL3JunctionReductionCandidates(segs);
    if (candidates.length === 0) {
      return { steps, stopped: 'no_candidates' };
    }
    candidates.sort(compareCandidates);
    if (candidates[0].diff >= lim) {
      return { steps, stopped: 'min_diff_ge_threshold' };
    }
    const r = applyTaipeiL3BlackDotReductionOneStep(layer);
    if (!r.changed) {
      return { steps, stopped: 'step_failed' };
    }
    steps += 1;
    if (steps % 40 === 0 && typeof requestAnimationFrame === 'function') {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
  return { steps, stopped: 'max_steps' };
}
