/**
 * 「站點與路線往中心聚集」專用：**首輪前**對「hub 紅 connect（度數≥2）— 末端藍 connect（度數≤1）」之**非正交鄰段**，
 * 僅平移藍端所屬共點群組，使該段改為水平或垂直（若能通過既有硬約束）。
 * 無內側邊時，橫／直嘗試順序僅依**該末端所在單一路段折線**上其餘正交邊票數決定（不與資料裡同名但獨立的另一 polygon 混在一起）。
 *
 * （與自動／一鍵之主迴圈分離；round 之間不重跑。）
 */

import {
  applyOrthoVertexRefsDelta,
  buildInitialOrthoCoPointGroups,
  buildOrthoCellGroups,
  checkOrthoGridHardConstraints,
  shallowCloneOrthoSegmentsSynced,
} from './axisAlignGridNetworkHillClimb.js';

function num(v) {
  return Math.round(Number(v ?? 0));
}

function getXY(pt) {
  if (Array.isArray(pt)) return [num(pt[0]), num(pt[1])];
  return [num(pt?.x), num(pt?.y)];
}

/** 頂點是否為 Connect（不含黑點／僅線站）— 近似 SpaceNetworkGrid 紅／藍點資料 */
function isConnectAtVertex(seg, pi) {
  const n = seg?.nodes?.[pi];
  if (n && typeof n === 'object') {
    const nt = String(n.node_type ?? n.tags?.node_type ?? '').toLowerCase();
    if (nt === 'connect') return true;
    if (n.connect_number != null || n.tags?.connect_number != null) return true;
  }
  const props =
    pi === 0
      ? seg?.properties_start
      : pi === (seg.points?.length ?? 0) - 1
        ? seg.properties_end
        : null;
  if (props && typeof props === 'object') {
    const nt = String(props.node_type ?? props.tags?.node_type ?? '').toLowerCase();
    if (nt === 'connect') return true;
    if (props.connect_number != null || props.tags?.connect_number != null) return true;
  }
  return false;
}

/** 每個網格格點（四捨五入）：含 connect 之頂點接上幾段折線（僅統計連續邊相接） */
function buildConnectIncidentEdgeCount(segments) {
  const m = new Map();
  const bump = (x, y) => {
    const k = `${x},${y}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const seg of segments) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const c0 = isConnectAtVertex(seg, i);
      const c1 = isConnectAtVertex(seg, i + 1);
      const [xa, ya] = getXY(pts[i]);
      const [xb, yb] = getXY(pts[i + 1]);
      if (c0) bump(xa, ya);
      if (c1) bump(xb, yb);
    }
  }
  return m;
}

/** 只在單一路段折線（相連頂點序列）上計正交邊數，可選排除某一鄰段 `excludeLo`～`excludeLo+1` */
function countOrthoHVOnSegmentExcludingEdge(seg, excludeLo) {
  let h = 0;
  let v = 0;
  const pts = seg?.points;
  if (!Array.isArray(pts) || pts.length < 2) return { h: 0, v: 0 };
  const ex =
    excludeLo != null && Number.isFinite(excludeLo) ? Math.round(Number(excludeLo)) : null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (ex !== null && i === ex) continue;
    const [xa, ya] = getXY(pts[i]);
    const [xb, yb] = getXY(pts[i + 1]);
    if (xa === xb || ya === yb) {
      if (xa === xb && ya === yb) continue;
      if (xa === xb) v++;
      else h++;
    }
  }
  return { h, v };
}

/**
 * spine 為水平鄰：末端應拉出**垂直**段（試 (rx, by)）
 * spine 為垂直鄰：末端應拉出**水平**段（試 (bx, ry)）
 * @returns {Array<'hv'|'vh'>}
 */
function candidateAxisOrder(seg, hubPi, termPi) {
  const pts = seg.points;
  let interiorPi = termPi === hubPi + 1 ? hubPi - 1 : hubPi + 1;
  let pref = /** @type {null | 'vertical_stub' | 'horizontal_stub'} */ (null);
  if (interiorPi >= 0 && interiorPi < pts.length) {
    const [hx, hy] = getXY(pts[hubPi]);
    const [ix, iy] = getXY(pts[interiorPi]);
    const dx = ix - hx;
    const dy = iy - hy;
    if (dx !== 0 && dy === 0) pref = 'vertical_stub';
    else if (dx === 0 && dy !== 0) pref = 'horizontal_stub';
  }
  /** @returns {Array<'hv'|'vh'>} */
  function fromPref(p) {
    if (p === 'vertical_stub') return ['hv', 'vh'];
    if (p === 'horizontal_stub') return ['vh', 'hv'];
    return ['hv', 'vh'];
  }

  let order = fromPref(pref);
  if (pref == null) {
    const diagLo = Math.min(hubPi, termPi);
    const votes = countOrthoHVOnSegmentExcludingEdge(seg, diagLo);
    if (votes.h > votes.v) order = ['hv', 'vh'];
    else if (votes.v > votes.h) order = ['vh', 'hv'];
  }
  return order;
}

/** 目前 R–B 段是否為正交邊（非零長） */
function edgeOrthoNonZero(seg, ia, ib) {
  const [xa, ya] = getXY(seg.points[ia]);
  const [xb, yb] = getXY(seg.points[ib]);
  if (xa === xb && ya === yb) return false;
  return xa === xb || ya === yb;
}

/**
 * @param {Array<object>} flatSegments
 * @returns {{ segments: Array, moves: number }}
 */
export function applyLineOrthoHubBlueDiagonalPrepassSegments(flatSegments) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return { segments: flatSegments, moves: 0 };
  }

  let work = shallowCloneOrthoSegmentsSynced(flatSegments);
  const initialIds = buildInitialOrthoCoPointGroups(work);
  let moves = 0;
  const maxOuter = 80;

  for (let outer = 0; outer < maxOuter; outer++) {
    const degMap = buildConnectIncidentEdgeCount(work);
    const tasks = [];

    for (let si = 0; si < work.length; si++) {
      const seg = work[si];
      const pts = seg?.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      for (let pi = 0; pi < pts.length - 1; pi++) {
        if (!isConnectAtVertex(seg, pi) || !isConnectAtVertex(seg, pi + 1)) continue;
        const [xa, ya] = getXY(pts[pi]);
        const [xb, yb] = getXY(pts[pi + 1]);
        if (xa === xb || ya === yb) continue;

        const ka = `${xa},${ya}`;
        const kb = `${xb},${yb}`;
        const da = degMap.get(ka) ?? 0;
        const db = degMap.get(kb) ?? 0;

        let hubPi;
        let termPi;
        if (da <= 1 && db >= 2) {
          termPi = pi;
          hubPi = pi + 1;
        } else if (db <= 1 && da >= 2) {
          termPi = pi + 1;
          hubPi = pi;
        } else {
          continue;
        }

        const [rx, ry] = getXY(pts[hubPi]);
        const [bx0, by0] = getXY(pts[termPi]);
        const hTargetBx = bx0;
        const hTargetBy = ry;
        const vTargetBx = rx;
        const vTargetBy = by0;

        if ((hTargetBx === rx && hTargetBy === ry) || (vTargetBx === rx && vTargetBy === ry)) continue;

        const axisOrder = candidateAxisOrder(seg, hubPi, termPi);
        tasks.push({
          si,
          hubPi,
          termPi,
          rx,
          ry,
          bx0,
          by0,
          hTargetBx,
          hTargetBy,
          vTargetBx,
          vTargetBy,
          axisOrder,
          key: `${si}-${hubPi}-${termPi}-${bx0}-${by0}`,
        });
      }
    }

    tasks.sort((a, b) => {
      const c = a.si - b.si;
      if (c !== 0) return c;
      return a.termPi - b.termPi;
    });

    let progressed = false;
    for (const t of tasks) {
      const cellGroups = buildOrthoCellGroups(work);
      const refs = cellGroups.get(`${t.bx0},${t.by0}`) ?? [];
      if (!refs.some((r) => r.si === t.si && r.pi === t.termPi)) continue;

      const tryMove = (nbx, nby) => {
        const dx = nbx - t.bx0;
        const dy = nby - t.by0;
        if (!dx && !dy) return false;
        const trial = shallowCloneOrthoSegmentsSynced(work);
        applyOrthoVertexRefsDelta(trial, refs, dx, dy);
        if (!checkOrthoGridHardConstraints(trial, initialIds).ok) return false;
        const se = trial[t.si];
        if (!edgeOrthoNonZero(se, t.hubPi, t.termPi)) return false;
        work = trial;
        return true;
      };

      let ok = false;
      for (const ax of t.axisOrder) {
        if (ax === 'hv') {
          if (tryMove(t.hTargetBx, t.hTargetBy)) {
            ok = true;
            break;
          }
        } else if (tryMove(t.vTargetBx, t.vTargetBy)) {
          ok = true;
          break;
        }
      }

      if (ok) {
        moves++;
        progressed = true;
        break;
      }
    }

    if (!progressed) break;
  }

  return { segments: work, moves };
}
