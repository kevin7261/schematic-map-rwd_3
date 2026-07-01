/**
 * layout-grid H/V/45° 候選評分：junction 轉角與 45° 共線連續性。
 * 目標：45°／135° 斜段與前後 H/V 相接時，減少銳角與過小夾角。
 */

/** @param {number[]} A @param {number[]} B @param {number} eps */
export function classifyEdgeHV45(A, B, eps) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (ady < eps) return 'H';
  if (adx < eps) return 'V';
  if (Math.abs(adx - ady) < eps) return '45';
  return 'X';
}

/** @param {number[]} A @param {number[]} B */
function edgeUnit(A, B) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return null;
  return { ux: dx / len, uy: dy / len, len };
}

/**
 * 折線內部轉角（度）：180=直行，90=直角；越小越銳。
 * @param {number[][]} pts
 * @param {number} eps
 */
export function sumInternalTurnAnglePenalties(pts) {
  if (!pts || pts.length < 3) return 0;
  let penalty = 0;
  const MIN_COMFORT = 75;
  const SHARP = 45;
  for (let i = 1; i < pts.length - 1; i++) {
    const uIn = edgeUnit(pts[i - 1], pts[i]);
    const uOut = edgeUnit(pts[i], pts[i + 1]);
    if (!uIn || !uOut) continue;
    const dot = uIn.ux * uOut.ux + uIn.uy * uOut.uy;
    const clamped = Math.max(-1, Math.min(1, dot));
    const turnDeg = (Math.acos(clamped) * 180) / Math.PI;
    if (turnDeg < SHARP) penalty += (SHARP - turnDeg) * 2;
    else if (turnDeg < MIN_COMFORT) penalty += (MIN_COMFORT - turnDeg) * 0.5;
  }
  return penalty;
}

/**
 * 端點離開 junction 的第一段（含 45°）。
 * @returns {{ orient: string; level: number; len: number; ux: number; uy: number } | null}
 */
function terminalEdgeFull(pts, atStart, eps) {
  const m = pts.length;
  if (m < 2) return null;
  const A = atStart ? pts[0] : pts[m - 1];
  const B = atStart ? pts[1] : pts[m - 2];
  const u = edgeUnit(A, B);
  if (!u) return null;
  const orient = classifyEdgeHV45(A, B, eps);
  let level;
  if (orient === 'H') level = A[1];
  else if (orient === 'V') level = A[0];
  else if (orient === '45') level = Math.atan2(B[1] - A[1], B[0] - A[0]);
  else return null;
  return { orient, level, len: u.len, ux: u.ux, uy: u.uy };
}

/** 兩 45° 段是否同向（共線延續）。 */
function diag45SameRay(e1, e2, levelEps) {
  if (e1.orient !== '45' || e2.orient !== '45') return false;
  return Math.abs(e1.level - e2.level) < levelEps;
}

/**
 * junction 夾角懲罰：不同路線在共用端點離開方向過小 → 銳角／平行擠在一起。
 * @param {Map<number, { routeIdx: number; edge: object }[]>} edgesByJunction
 */
function sumJunctionCrossRoutePenalties(edgesByJunction) {
  let penalty = 0;
  const MIN_SEP = 60;
  const IDEAL_LO = 85;
  const IDEAL_HI = 95;
  for (const list of edgesByJunction.values()) {
    if (list.length < 2) continue;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (list[a].routeIdx === list[b].routeIdx) continue;
        const e1 = list[a].edge;
        const e2 = list[b].edge;
        const dot = e1.ux * e2.ux + e1.uy * e2.uy;
        const clamped = Math.max(-1, Math.min(1, dot));
        const sepDeg = (Math.acos(clamped) * 180) / Math.PI;
        if (sepDeg < MIN_SEP) penalty += (MIN_SEP - sepDeg) * 1.2;
        else if (sepDeg >= IDEAL_LO && sepDeg <= IDEAL_HI) penalty -= 0.15;
      }
    }
  }
  return penalty;
}

/**
 * 評分：H/V 共線連續 + 45° 同向共線 − 轉折數 − 內部銳角 − junction 跨路夾角過小。
 *
 * @param {{ candidates: { bends: number; pts: number[][] }[] }[]} rows
 * @param {number[]} idxArr
 * @param {(number|null)[]} routeJ — 各路線兩端 junction 索引
 * @param {number} eps
 */
export function scoreHv45ConnectivityAssignment(rows, idxArr, routeJ, eps) {
  const n = rows.length;
  /** @type {Map<number, { orient: string; level: number; len: number }[]>} */
  const hvCollinearByJ = new Map();
  /** @type {Map<number, { routeIdx: number; edge: object }[]>} */
  const edgesByJunction = new Map();
  let bendSum = 0;
  let internalTurnPenalty = 0;

  for (let i = 0; i < n; i++) {
    const rj = routeJ[i];
    const cand = rows[i].candidates[idxArr[i]];
    if (!cand?.pts) continue;
    bendSum += Math.max(0, cand.bends);
    internalTurnPenalty += sumInternalTurnAnglePenalties(cand.pts);

    const es = terminalEdgeFull(cand.pts, true, eps);
    const ee = terminalEdgeFull(cand.pts, false, eps);

    const pushCol = (jIdx, edge) => {
      if (!edge || (edge.orient !== 'H' && edge.orient !== 'V' && edge.orient !== '45')) return;
      if (!hvCollinearByJ.has(jIdx)) hvCollinearByJ.set(jIdx, []);
      hvCollinearByJ.get(jIdx).push(edge);
    };
    const pushCross = (jIdx, edge) => {
      if (!edge) return;
      if (!edgesByJunction.has(jIdx)) edgesByJunction.set(jIdx, []);
      edgesByJunction.get(jIdx).push({ routeIdx: i, edge });
    };

    if (rj) {
      pushCol(rj[0], es);
      pushCol(rj[1], ee);
      pushCross(rj[0], es);
      pushCross(rj[1], ee);
    }
  }

  let collinearScore = 0;
  const LEVEL_EPS = eps;
  for (const edges of hvCollinearByJ.values()) {
    const used = new Array(edges.length).fill(false);
    for (let a = 0; a < edges.length; a++) {
      if (used[a]) continue;
      let total = edges[a].len;
      let cnt = 1;
      for (let b = a + 1; b < edges.length; b++) {
        if (used[b]) continue;
        const same =
          edges[b].orient === edges[a].orient &&
          (edges[a].orient === '45'
            ? diag45SameRay(edges[a], edges[b], 0.08)
            : Math.abs(edges[b].level - edges[a].level) < LEVEL_EPS);
        if (same) {
          used[b] = true;
          total += edges[b].len;
          cnt += 1;
        }
      }
      used[a] = true;
      if (cnt >= 2) collinearScore += total;
    }
  }

  const BEND_PENALTY = 1e-3;
  const TURN_PENALTY = 0.08;
  const JUNCTION_PENALTY = 0.12;

  return (
    collinearScore -
    BEND_PENALTY * bendSum -
    TURN_PENALTY * internalTurnPenalty -
    JUNCTION_PENALTY * sumJunctionCrossRoutePenalties(edgesByJunction)
  );
}
