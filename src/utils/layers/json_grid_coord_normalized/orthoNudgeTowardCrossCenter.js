/**
 * 列／欄表：沿網格**朝紅虛線／紅十字中心線**位移（列→Δy；欄→Δx），並以
 * {@link checkOrthoGridHardConstraints} 驗證（無交叉／共線重疊／頂點落他線、無非法併格、無零長邊）。
 *
 * **決策準則：** 每次僅朝中心**移 1 格**（仍須硬約束通過，且不移動後降低水平／垂直邊數）。
 * **連通：** 在以「折線相鄰 + 同網格格點」為邊的圖上，對候選集取與錨點相通的連通塊後再評估；
 *    可避免橫／直帶涵蓋互不相連的線，同時仍能經「同格」帶動轉乘共點（見 {@link orthoRefsAnchoredConnectivityComponent}）。
 */

import {
  applyOrthoVertexRefsDelta,
  buildInitialOrthoCoPointGroups,
  buildOrthoCellGroups,
  checkOrthoGridHardConstraintsRelative,
  describeInvalidGeometry,
  shallowCloneOrthoSegmentsSynced,
} from './axisAlignGridNetworkHillClimb.js';
import { orthoRefsAnchoredConnectivityComponent } from './orthoNudgeTowardCrossConnectivity.js';

function parseParenCoord(str) {
  const m = String(str ?? '').match(/\((-?\d+),(-?\d+)\)/);
  if (!m) return null;
  return { gx: Number(m[1]), gy: Number(m[2]) };
}

/** @param {Array<object>} segments */
function roundedGridPt(segments, segIdx, ptIdx) {
  const pt = segments[segIdx]?.points?.[ptIdx];
  if (!pt) return null;
  const x = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
  const y = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { gx: Math.round(x), gy: Math.round(y) };
}

/** @returns {Array<{ si: number, pi: number }>} */
function dedupeRefs(refs) {
  const seen = new Set();
  const out = [];
  for (const r of refs) {
    const k = `${r.si},${r.pi}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function narrowOrthoCandidateRefs(segments, refs, routeName) {
  return orthoRefsAnchoredConnectivityComponent(segments, refs, routeName);
}

/**
 * 從 orthoRuns 收集頂點 ref，**並展開至同格所有共點夥伴（含跨 segment）**。
 * 若不展開，共點中只動部份頂點會造成拓撲斷開（線端與連接點分離）。
 * @param {Array<{ segIdx:number, pi0:number, pi1:number }>} runs
 */
function refsFromOrthoVertexRuns(segments, runs) {
  const raw = [];
  if (!Array.isArray(runs)) return raw;
  for (const rn of runs) {
    const si = rn?.segIdx;
    const pLo = Math.min(Number(rn?.pi0), Number(rn?.pi1));
    const pHi = Math.max(Number(rn?.pi0), Number(rn?.pi1));
    if (!Number.isFinite(si) || !Number.isFinite(pLo) || !Number.isFinite(pHi)) continue;
    const pts = segments[si]?.points;
    if (!Array.isArray(pts)) continue;
    for (let pi = pLo; pi <= pHi; pi++) {
      if (pts[pi] == null) continue;
      raw.push({ si, pi });
    }
  }
  const gm = buildOrthoCellGroups(segments);
  const seen = new Set();
  const expanded = [];
  for (const r of dedupeRefs(raw)) {
    const pt = segments[r.si]?.points?.[r.pi];
    if (!pt) continue;
    const x = Array.isArray(pt) ? Math.round(Number(pt[0])) : Math.round(Number(pt?.x));
    const y = Array.isArray(pt) ? Math.round(Number(pt[1])) : Math.round(Number(pt?.y));
    for (const cp of gm.get(`${x},${y}`) ?? []) {
      const k = `${cp.si},${cp.pi}`;
      if (seen.has(k)) continue;
      seen.add(k);
      expanded.push(cp);
    }
  }
  return expanded;
}

/** @returns {Array<{ si: number, pi: number }>} */
function collectRefsAtCell(segments, gx, gy) {
  const gm = buildOrthoCellGroups(segments);
  return gm.get(`${gx},${gy}`) ?? [];
}

/** 列：網格 y = yy 且 lo≤gx≤hi 之所有共點 ref */
function collectRefsHorizontalBand(segments, yy, lo, hi) {
  const gm = buildOrthoCellGroups(segments);
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  const refs = [];
  const seen = new Set();
  for (const [key, grp] of gm.entries()) {
    const [gx, gy] = key.split(',').map(Number);
    if (gy !== yy || gx < a || gx > b) continue;
    for (const g of grp) {
      const k = `${g.si},${g.pi}`;
      if (seen.has(k)) continue;
      seen.add(k);
      refs.push(g);
    }
  }
  return refs;
}

/** 欄：網格 x = xx 且 lo≤gy≤hi 之所有共點 ref */
function collectRefsVerticalBand(segments, xx, lo, hi) {
  const gm = buildOrthoCellGroups(segments);
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  const refs = [];
  const seen = new Set();
  for (const [key, grp] of gm.entries()) {
    const [gx, gy] = key.split(',').map(Number);
    if (gx !== xx || gy < a || gy > b) continue;
    for (const g of grp) {
      const k = `${g.si},${g.pi}`;
      if (seen.has(k)) continue;
      seen.add(k);
      refs.push(g);
    }
  }
  return refs;
}

/**
 * 計算路網中水平（dx=0）或垂直（dy=0）的邊數。
 * 用於判斷移動是否破壞正交性：若移動後邊數減少，則不應移動。
 */
function countOrthoEdges(segments) {
  let count = 0;
  for (const seg of segments) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ax = Array.isArray(a) ? Math.round(Number(a[0])) : Math.round(Number(a?.x));
      const ay = Array.isArray(a) ? Math.round(Number(a[1])) : Math.round(Number(a?.y));
      const bx = Array.isArray(b) ? Math.round(Number(b[0])) : Math.round(Number(b?.x));
      const by = Array.isArray(b) ? Math.round(Number(b[1])) : Math.round(Number(b?.y));
      if (ax === bx || ay === by) count++;
    }
  }
  return count;
}

/**
 * @param {Array<object>} flatSegments - normalizeSpaceNetworkDataToFlatSegments 結果
 * @param {'row'|'col'} tableAxis 列表用 row（動 y）、欄表用 col（動 x）
 * @param {{ kind: string, axisY?: number|null, axisX?: number|null, startCoord?: string, endCoord?: string,
 *   orthoV?: { segIdx: number, ptIdx: number },
 *   orthoRuns?: Array<{ segIdx: number, pi0: number, pi1: number }> }} item
 * @param {number} centerCx
 * @param {number} centerCy
 * @param {{ frozenVertexGroupIds?: Map<string, string> }} [opts]
 *   連續多步縮進時請傳**第一次按下前**對原路網之 `buildInitialOrthoCoPointGroups` 結果，以維持共點併格規則與第一次狀態一致。
 * @returns {{ ok: boolean, applied: boolean, skip?: boolean, segments?: Array|null, cellsMoved?: number, message?: string }}
 */
export function tryOrthoTowardCrossNudgeFromReportItem(
  flatSegments,
  tableAxis,
  item,
  centerCx,
  centerCy,
  opts = {}
) {
  const tcx = Math.round(Number(centerCx));
  const tcy = Math.round(Number(centerCy));
  const frozenVertexGroupIds = opts.frozenVertexGroupIds ?? null;
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return { ok: false, applied: false, message: '沒有路網' };
  }
  const work = shallowCloneOrthoSegmentsSynced(flatSegments);
  const initialIds =
    frozenVertexGroupIds != null ? frozenVertexGroupIds : buildInitialOrthoCoPointGroups(work);

  // --- 收集 refs 與判斷移動方向 ---
  let baseDx = 0;
  let baseDy = 0;
  let refs = [];

  if (tableAxis === 'row') {
    if (item.kind === '點') {
      const ov = item.orthoV;
      if (ov?.segIdx != null && ov?.ptIdx != null) {
        const rc = roundedGridPt(work, ov.segIdx, ov.ptIdx);
        if (!rc) return { ok: true, applied: false, skip: true, message: '此項對應頂點已不存在' };
        if (rc.gy === tcy)
          return { ok: true, applied: false, skip: true, message: '已在水平中心線' };
        baseDy = rc.gy < tcy ? 1 : -1;
        refs = narrowOrthoCandidateRefs(work, collectRefsAtCell(work, rc.gx, rc.gy), item.routeName);
      } else {
        const p = parseParenCoord(item.startCoord);
        if (!p) return { ok: false, applied: false, message: '無法解析點座標' };
        if (p.gy === tcy)
          return { ok: true, applied: false, skip: true, message: '已在水平中心線' };
        baseDy = p.gy < tcy ? 1 : -1;
        refs = narrowOrthoCandidateRefs(work, collectRefsAtCell(work, p.gx, p.gy), item.routeName);
      }
    } else if (item.kind === '線') {
      const runs = item.orthoRuns;
      if (Array.isArray(runs) && runs.length > 0) {
        refs = narrowOrthoCandidateRefs(work, refsFromOrthoVertexRuns(work, runs), item.routeName);
        if (!refs.length)
          return { ok: true, applied: false, skip: true, message: '此項無對應頂點' };
        let leadGy = null;
        for (const r of refs) {
          const c = roundedGridPt(work, r.si, r.pi);
          if (!c) continue;
          if (leadGy == null) leadGy = c.gy;
          else if (c.gy !== leadGy)
            return { ok: true, applied: false, skip: true, message: '合併橫線縱跨多列（非預期）' };
        }
        if (leadGy == null)
          return { ok: true, applied: false, skip: true, message: '此項無有效格座標' };
        if (leadGy === tcy)
          return { ok: true, applied: false, skip: true, message: '已在水平中心線' };
        baseDy = leadGy < tcy ? 1 : -1;
      } else {
        const yy =
          item.axisY != null && Number.isFinite(Number(item.axisY)) ? Number(item.axisY) : null;
        if (yy === null) return { ok: false, applied: false, message: '列「線」缺少網格 y' };
        if (yy === tcy) return { ok: true, applied: false, skip: true, message: '已在水平中心線' };
        baseDy = yy < tcy ? 1 : -1;
        const a = parseParenCoord(item.startCoord);
        const b = parseParenCoord(item.endCoord ?? '');
        if (!a || !b) return { ok: false, applied: false, message: '無法解析線端點座標' };
        const lo = Math.min(a.gx, b.gx);
        const hi = Math.max(a.gx, b.gx);
        refs = narrowOrthoCandidateRefs(work, collectRefsHorizontalBand(work, yy, lo, hi), item.routeName);
      }
    } else return { ok: false, applied: false, message: '未知項目型態' };
  } else if (tableAxis === 'col') {
    if (item.kind === '點') {
      const ov = item.orthoV;
      if (ov?.segIdx != null && ov?.ptIdx != null) {
        const rc = roundedGridPt(work, ov.segIdx, ov.ptIdx);
        if (!rc) return { ok: true, applied: false, skip: true, message: '此項對應頂點已不存在' };
        if (rc.gx === tcx)
          return { ok: true, applied: false, skip: true, message: '已在垂直中心線' };
        baseDx = rc.gx < tcx ? 1 : -1;
        refs = narrowOrthoCandidateRefs(work, collectRefsAtCell(work, rc.gx, rc.gy), item.routeName);
      } else {
        const p = parseParenCoord(item.startCoord);
        if (!p) return { ok: false, applied: false, message: '無法解析點座標' };
        if (p.gx === tcx)
          return { ok: true, applied: false, skip: true, message: '已在垂直中心線' };
        baseDx = p.gx < tcx ? 1 : -1;
        refs = narrowOrthoCandidateRefs(work, collectRefsAtCell(work, p.gx, p.gy), item.routeName);
      }
    } else if (item.kind === '線') {
      const runs = item.orthoRuns;
      if (Array.isArray(runs) && runs.length > 0) {
        refs = narrowOrthoCandidateRefs(work, refsFromOrthoVertexRuns(work, runs), item.routeName);
        if (!refs.length)
          return { ok: true, applied: false, skip: true, message: '此項無對應頂點' };
        let leadGx = null;
        for (const r of refs) {
          const c = roundedGridPt(work, r.si, r.pi);
          if (!c) continue;
          if (leadGx == null) leadGx = c.gx;
          else if (c.gx !== leadGx)
            return { ok: true, applied: false, skip: true, message: '合併縱線橫跨多欄（非預期）' };
        }
        if (leadGx == null)
          return { ok: true, applied: false, skip: true, message: '此項無有效格座標' };
        if (leadGx === tcx)
          return { ok: true, applied: false, skip: true, message: '已在垂直中心線' };
        baseDx = leadGx < tcx ? 1 : -1;
      } else {
        const xx =
          item.axisX != null && Number.isFinite(Number(item.axisX)) ? Number(item.axisX) : null;
        if (xx === null) return { ok: false, applied: false, message: '欄「線」缺少網格 x' };
        if (xx === tcx) return { ok: true, applied: false, skip: true, message: '已在垂直中心線' };
        baseDx = xx < tcx ? 1 : -1;
        const a = parseParenCoord(item.startCoord);
        const b = parseParenCoord(item.endCoord ?? '');
        if (!a || !b) return { ok: false, applied: false, message: '無法解析線端點座標' };
        const lo = Math.min(a.gy, b.gy);
        const hi = Math.max(a.gy, b.gy);
        refs = narrowOrthoCandidateRefs(work, collectRefsVerticalBand(work, xx, lo, hi), item.routeName);
      }
    } else return { ok: false, applied: false, message: '未知項目型態' };
  } else {
    return { ok: false, applied: false, message: '內部：tableAxis' };
  }

  refs = dedupeRefs(refs);
  if (refs.length === 0) {
    return { ok: true, applied: false, skip: true, message: '此項無頂點可動' };
  }

  const currentOrtho = countOrthoEdges(work);

  // 被移動頂點的格座標（移動前），供訊息指出「是哪一點動不了」
  const movedCells = [];
  const seenCell = new Set();
  for (const r of refs) {
    const c = roundedGridPt(work, r.si, r.pi);
    if (!c) continue;
    const k = `${c.gx},${c.gy}`;
    if (seenCell.has(k)) continue;
    seenCell.add(k);
    movedCells.push(`(${c.gx},${c.gy})`);
  }
  const movedLabel = movedCells.length
    ? `此項頂點 ${movedCells.slice(0, 4).join('、')}${movedCells.length > 4 ? '…' : ''} 朝 (${baseDx > 0 ? '右' : baseDx < 0 ? '左' : ''}${baseDy > 0 ? '上' : baseDy < 0 ? '下' : ''}|Δx${baseDx},Δy${baseDy}) 移 1 格`
    : '此項朝中心移 1 格';

  const trial1 = shallowCloneOrthoSegmentsSynced(work);
  applyOrthoVertexRefsDelta(trial1, refs, baseDx, baseDy);
  // 相對檢查：既有(輸入)重疊不算這步的錯，只擋「此步新增」的違規。
  const ck1 = checkOrthoGridHardConstraintsRelative(trial1, work, initialIds);
  if (!ck1.ok) {
    let detail = ck1.reason ? String(ck1.reason) : '硬約束未過';
    // 只列「這一步**新增**」的衝突（扣掉移動前就存在的），避免把既有巧合重疊誤報成本步造成。
    const baseProbs = new Set(describeInvalidGeometry(work, 50));
    const newProbs = describeInvalidGeometry(trial1, 50).filter((p) => !baseProbs.has(p));
    if (newProbs.length) detail = `${detail} → ${newProbs.slice(0, 3).join('；')}`;
    return {
      ok: true,
      applied: false,
      message: `${movedLabel}會違反硬約束（${detail}），故不移動。`,
    };
  }

  const n1 = countOrthoEdges(trial1);
  if (n1 < currentOrtho) {
    return {
      ok: true,
      applied: false,
      message: `${movedLabel}後水平垂直邊數 ${n1} < 目前 ${currentOrtho}（會把某條 H/V 線拗成斜線），正交性下降，故不移動。`,
    };
  }

  applyOrthoVertexRefsDelta(work, refs, baseDx, baseDy);
  return { ok: true, applied: true, segments: work, cellsMoved: 1 };
}
