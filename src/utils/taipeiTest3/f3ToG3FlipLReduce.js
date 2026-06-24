/**
 * taipei_f3 → taipei_g3：對每個 L 型轉折嘗試 Flip L
 * 接受條件：以 computeFlipAnalysis／flipLShapeInRoutesData 的 canFlip 為準（與 f3→g3 批次相同）
 * （成功則 res.changed === true，不再做額外衝突分數過濾）
 */

import {
  buildStraightSegmentsForFlip,
  computeFlipAnalysisWithCoordDecimals,
  findOverlappingSegmentRanges,
  flipLShapeInRoutesData,
} from '@/utils/segmentUtils.js';

const EPS = 1e-4;

/** 兩正交線段是否於內部交叉（與 segmentUtils.orthogonalSegmentsCross 一致） */
function orthogonalSegmentsCross(p1, p2, q1, q2) {
  const hP = Math.abs(p1[1] - p2[1]) < EPS;
  const vQ = Math.abs(q1[0] - q2[0]) < EPS;
  if (hP && vQ) {
    const x = q1[0];
    const y = p1[1];
    const pxLo = Math.min(p1[0], p2[0]);
    const pxHi = Math.max(p1[0], p2[0]);
    const qyLo = Math.min(q1[1], q2[1]);
    const qyHi = Math.max(q1[1], q2[1]);
    if (x <= pxLo + EPS || x >= pxHi - EPS) return false;
    if (y <= qyLo + EPS || y >= qyHi - EPS) return false;
    return true;
  }
  const vP = Math.abs(p1[0] - p2[0]) < EPS;
  const hQ = Math.abs(q1[1] - q2[1]) < EPS;
  if (vP && hQ) {
    const x = p1[0];
    const y = q1[1];
    const pyLo = Math.min(p1[1], p2[1]);
    const pyHi = Math.max(p1[1], p2[1]);
    const qxLo = Math.min(q1[0], q2[0]);
    const qxHi = Math.max(q1[0], q2[0]);
    if (y <= pyLo + EPS || y >= pyHi - EPS) return false;
    if (x <= qxLo + EPS || x >= qxHi - EPS) return false;
    return true;
  }
  return false;
}

function countCrossingPairs(straightSegments) {
  if (!Array.isArray(straightSegments)) return 0;
  let n = 0;
  for (let i = 0; i < straightSegments.length; i++) {
    const p1 = straightSegments[i].points?.[0];
    const p2 = straightSegments[i].points?.[1];
    if (!p1 || !p2) continue;
    for (let j = i + 1; j < straightSegments.length; j++) {
      const q1 = straightSegments[j].points?.[0];
      const q2 = straightSegments[j].points?.[1];
      if (!q1 || !q2) continue;
      if (orthogonalSegmentsCross(p1, p2, q1, q2)) n++;
    }
  }
  return n;
}

/**
 * 路網衝突分數：共線重疊區間數 × 加權 ＋ 正交交叉對數（愈低愈好）
 */
export function measureF3G3NetworkConflictScore(routesData) {
  const ss = buildStraightSegmentsForFlip(routesData);
  const ranges = findOverlappingSegmentRanges(ss);
  const cross = countCrossingPairs(ss);
  return ranges.length * 10000 + cross;
}

/**
 * 就地修改 routesData 參考（呼叫端請傳入深拷貝若需保留原稿）
 * @returns {{ routesData: Array, flipAcceptedCount: number, passes: number }}
 */
export function applyFlipLReduceF3ToG3Network(routesData, options = {}) {
  const coordDecimals = options.coordDecimals ?? 1;
  let data = routesData;
  let flipAcceptedCount = 0;
  let passes = 0;
  const maxPasses = options.maxPasses ?? 25;

  for (let pass = 0; pass < maxPasses; pass++) {
    const ss = buildStraightSegmentsForFlip(data);
    const totalL = Math.max(0, ss.length - 1);
    if (totalL <= 0) break;

    let changedPass = false;
    for (let idx = 0; idx < totalL; idx++) {
      const snapshot = JSON.parse(JSON.stringify(data));
      const res = flipLShapeInRoutesData(snapshot, idx, { coordDecimals });
      if (!res.changed) continue;
      data = res.routesData;
      flipAcceptedCount++;
      changedPass = true;
    }
    if (!changedPass) break;
    passes++;
  }

  return { routesData: data, flipAcceptedCount, passes };
}

const F3_FLIP_DECIMALS = 1;

/**
 * 單步 Flip（與 applyFlipLReduceF3ToG3Network 相同：canFlip 且 flipLShapeInRoutesData.changed）
 * @returns {{
 *   ok: boolean,
 *   changed: boolean,
 *   reason: string,
 *   nextIndex: number,
 *   routesData: Array,
 *   analysis: object | null,
 * }}
 */
export function trySingleF3FlipStep(routesData, flipIndex, options = {}) {
  const coordDecimals = options.coordDecimals ?? F3_FLIP_DECIMALS;
  if (!Array.isArray(routesData) || routesData.length === 0) {
    return {
      ok: false,
      changed: false,
      reason: '無路網資料',
      nextIndex: 0,
      routesData,
      analysis: null,
    };
  }

  const snapshot = JSON.parse(JSON.stringify(routesData));
  const ss = buildStraightSegmentsForFlip(snapshot);
  const totalL = Math.max(0, ss.length - 1);
  if (totalL <= 0) {
    return {
      ok: false,
      changed: false,
      reason: '沒有可 flip 的 L 型',
      nextIndex: 0,
      routesData,
      analysis: null,
    };
  }

  const idx = flipIndex % totalL;
  const nextIndex = (flipIndex + 1) % totalL;

  const analysis = computeFlipAnalysisWithCoordDecimals(ss, idx, snapshot, coordDecimals, {});
  if (!analysis.canFlip) {
    return {
      ok: false,
      changed: false,
      reason: analysis.reason?.trim() || '不可 flip',
      nextIndex,
      routesData,
      analysis,
    };
  }

  const res = flipLShapeInRoutesData(snapshot, idx, { coordDecimals });
  if (!res.changed) {
    return {
      ok: false,
      changed: false,
      reason: 'flip 未套用（內部拒絕）',
      nextIndex,
      routesData,
      analysis,
    };
  }

  return {
    ok: true,
    changed: true,
    reason: '',
    nextIndex,
    routesData: res.routesData,
    analysis,
  };
}
