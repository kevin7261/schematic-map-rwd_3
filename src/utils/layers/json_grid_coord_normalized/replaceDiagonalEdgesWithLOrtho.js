/**
 * 將各折線上「非水平／非垂直」的單一邊改為正交路徑：
 *
 * 1. **L 形**（兩段正交、一個轉角）：先橫後豎 `(x1,y)` 或先豎後橫 `(x,y1)`；`tryL === false` 時略過。
 * 2. 若兩種 L 皆不可行且 `tryNzIfNoL` 為 true，再試 **Z 形**（H-V-H：`(x0,y0)→(kx,y0)→(kx,y1)→(x1,y1)`）
 *    與 **N／反 N 形**（V-H-V：`(x0,y0)→(x0,ky)→(x1,ky)→(x1,y1)`），其中 `kx`、`ky` 為起迄之間的格點內點。
 * 3. 若 `tryHv45` 為 true（通常與 L／N／Z 互斥）：將 **|Δx|≠|Δy|** 之斜邊改為<strong>一段或兩段轉折</strong>之路徑，每段僅為水平、垂直或 45°（|Δx|=|Δy|）；
 *    枚舉<strong>半格（0.5）刻度</strong>之轉折點。**單轉折**：先斜後正／先正後斜；**雙轉折**：斜線─直線─斜線（中間為水平或垂直）。
 *    已是單段 45° 斜線則略過。約束同 L／N／Z。
 *
 * 約束（L 與 N／Z 共用）：ortho 硬約束過濾交叉／共線重疊／頂點落線，以及「正交線段開放內部壓過紅／藍 connect 顯示格」（含 display_x/y）；
 * 轉角格不得落在**其他折線**之任一頂點格（與他線共格視為重疊），亦不得落在**他線**紅／藍 connect 的顯示格上（除非與該斜邊兩端點之 connect 允許重合）。
 * 若無任一可行替換則略過該斜邊。
 *
 * 兩種 L 皆可時，`preferVertFirst` 為 true 平手優先「先直後橫」（先豎後橫的 L），否則先橫後豎；並以與前後鄰邊「串成直線」評分為主。
 * N／Z 平手時：`preferVertFirst` 為 true 優先 **V-H-V（N）**，否則優先 **H-V-H（Z）**。
 */

import {
  orthoFlatSegmentsGeometryInvalid,
  shallowCloneOrthoSegmentsSynced,
  snapHalfCoord,
  syncOrthoFlatSegmentEndpoints,
} from './axisAlignGridNetworkHillClimb.js';

function getXY(pt) {
  if (Array.isArray(pt)) return [snapHalfCoord(pt[0]), snapHalfCoord(pt[1])];
  return [snapHalfCoord(pt?.x), snapHalfCoord(pt?.y)];
}

function cornerCellKey(cx, cy) {
  return `${snapHalfCoord(cx)},${snapHalfCoord(cy)}`;
}

function cloneVertexFromTemplate(template, x, y) {
  const rx = snapHalfCoord(x);
  const ry = snapHalfCoord(y);
  const t = template ?? [0, 0];
  const j = JSON.parse(JSON.stringify(t));
  if (Array.isArray(j)) {
    j[0] = rx;
    j[1] = ry;
    return j;
  }
  if (j && typeof j === 'object') {
    j.x = rx;
    j.y = ry;
    const tg = j.tags && typeof j.tags === 'object' ? j.tags : {};
    j.tags = { ...tg, x_grid: rx, y_grid: ry };
    return j;
  }
  return [rx, ry];
}

/** @returns {[number, number]} */
function vec(ax, ay, bx, by) {
  return [bx - ax, by - ay];
}

function isAxisAlignedNonZero(v) {
  const [vx, vy] = v;
  return (vx === 0 && vy !== 0) || (vy === 0 && vx !== 0);
}

/** 折線上連續三點 prev→mid→next 是否為同一水平或垂直線之同向延伸 */
function straightAligned(px, py, mx, my, nx, ny) {
  const vIn = vec(px, py, mx, my);
  const vOut = vec(mx, my, nx, ny);
  if (!isAxisAlignedNonZero(vIn) || !isAxisAlignedNonZero(vOut)) return false;
  const dot = vIn[0] * vOut[0] + vIn[1] * vOut[1];
  if (dot <= 0) return false;
  const sameAxis =
    (vIn[0] === 0 && vOut[0] === 0 && vIn[1] !== 0 && vOut[1] !== 0) ||
    (vIn[1] === 0 && vOut[1] === 0 && vIn[0] !== 0 && vOut[0] !== 0);
  return sameAxis;
}

/**
 * @param {number} x0,y0,x1,y1 斜向邊端點
 * @param {number} cx,cy 轉角
 * @param {(number|null)} px0,py0 前一站（可無）
 * @param {(number|null)} nx1,ny1 下一站（可無）
 */
function straightContinuationScore(x0, y0, x1, y1, cx, cy, px0, py0, nx1, ny1) {
  let s = 0;
  if (px0 != null && py0 != null) {
    if (straightAligned(px0, py0, x0, y0, cx, cy)) s++;
  }
  if (nx1 != null && ny1 != null) {
    if (straightAligned(cx, cy, x1, y1, nx1, ny1)) s++;
  }
  return s;
}

function isConnectLikeNode(node) {
  if (!node || typeof node !== 'object') return false;
  const nt = node.node_type ?? node.tags?.node_type;
  if (nt === 'connect') return true;
  return node.connect_number != null || node.tags?.connect_number != null;
}

function nodeAtPolylineVertex(seg, pi, pts) {
  if (!seg || !Array.isArray(pts)) return null;
  const L = pts.length;
  if (pi < 0 || pi >= L) return null;
  const inline = seg.nodes?.[pi];
  if (inline && typeof inline === 'object') return inline;
  if (pi === 0 && seg.properties_start && typeof seg.properties_start === 'object')
    return seg.properties_start;
  if (pi === L - 1 && seg.properties_end && typeof seg.properties_end === 'object')
    return seg.properties_end;
  return null;
}

/** connect 繪製用格：有 display_x/y 時與繪製一致（與 segmentUtils collectRedPointPositions 一致）。 */
function connectEffectiveGridAtVertex(seg, pi) {
  const pts = seg?.points;
  if (!Array.isArray(pts) || pi < 0 || pi >= pts.length) return null;
  const node = nodeAtPolylineVertex(seg, pi, pts);
  if (!isConnectLikeNode(node)) return null;
  const dx = Number(node?.display_x);
  const dy = Number(node?.display_y);
  if (Number.isFinite(dx) && Number.isFinite(dy)) return [snapHalfCoord(dx), snapHalfCoord(dy)];
  return getXY(pts[pi]);
}

/** 點是否在正交線段開放內部（非端點） */
function pointStrictlyInteriorOnOrthoSegment(px, py, ax, ay, bx, by) {
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (cross !== 0) return false;
  const minx = Math.min(ax, bx);
  const maxx = Math.max(ax, bx);
  const miny = Math.min(ay, by);
  const maxy = Math.max(ay, by);
  if (px < minx || px > maxx || py < miny || py > maxy) return false;
  if ((px === ax && py === ay) || (px === bx && py === by)) return false;
  return true;
}

/** 點是否在 45° 格斜線段（|Δx|=|Δy|≠0）之開放內部 */
function pointStrictlyInteriorOn45Segment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 || dy === 0) return false;
  if (Math.abs(dx) !== Math.abs(dy)) return false;
  const cross = dx * (py - ay) - dy * (px - ax);
  if (cross !== 0) return false;
  const minx = Math.min(ax, bx);
  const maxx = Math.max(ax, bx);
  const miny = Math.min(ay, by);
  const maxy = Math.max(ay, by);
  if (px <= minx || px >= maxx || py <= miny || py >= maxy) return false;
  return true;
}

/**
 * 任一段水平／垂直／45° 斜邊之**開放內部**若落在任一紅／藍 connect 的顯示格上（與線上頂點座標可分離），視為無效。
 * @param {unknown[]} segments
 * @param {{ flipSegmentIndices?: Set<number> }} [options] L-flip 驗證時可傳：若邊與 connect 所屬路段**皆**在此集合內，略過（只擋非本次 flip 之路線壓到紅／藍點）。
 */
export function orthoFlatSegmentsOverlapsForeignConnectDisplay(segments, options = undefined) {
  const flipSi = options?.flipSegmentIndices;
  if (!Array.isArray(segments) || segments.length === 0) return false;
  const grids = [];
  for (let si = 0; si < segments.length; si++) {
    const pts = segments[si]?.points;
    if (!Array.isArray(pts)) continue;
    for (let pi = 0; pi < pts.length; pi++) {
      const g = connectEffectiveGridAtVertex(segments[si], pi);
      if (g) grids.push({ gx: g[0], gy: g[1], si });
    }
  }
  for (let si = 0; si < segments.length; si++) {
    const pts = segments[si]?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let pi = 0; pi < pts.length - 1; pi++) {
      const [ax, ay] = getXY(pts[pi]);
      const [bx, by] = getXY(pts[pi + 1]);
      const isOrtho = ax === bx || ay === by;
      const dxe = bx - ax;
      const dye = by - ay;
      const is45 = !isOrtho && dxe !== 0 && dye !== 0 && Math.abs(dxe) === Math.abs(dye);
      if (!isOrtho && !is45) continue;
      for (const { gx, gy, si: siConn } of grids) {
        if (flipSi != null && flipSi.has(si) && flipSi.has(siConn)) continue;
        if (isOrtho) {
          if (pointStrictlyInteriorOnOrthoSegment(gx, gy, ax, ay, bx, by)) return true;
        } else if (pointStrictlyInteriorOn45Segment(gx, gy, ax, ay, bx, by)) return true;
      }
    }
  }
  return false;
}

/** 某一（候選／實際）L 型轉角格是否落在「別條線上的」紅／藍 connect 顯示格；僅允許與**當前要替換的斜邊兩個端點**上既有 connect 的顯示格重合。 */
export function orthoLcCornerTouchesForeignRbConnectDisplay(
  cornerGx,
  cornerGy,
  segments,
  diagonalSi,
  diagonalPiLow,
  diagonalPiHigh,
  allowedCornerCellKeys
) {
  const cx = snapHalfCoord(cornerGx);
  const cy = snapHalfCoord(cornerGy);
  if (!segments?.length || allowedCornerCellKeys == null) return false;
  if (allowedCornerCellKeys.has(cornerCellKey(cornerGx, cornerGy))) return false;
  let lo = diagonalPiLow;
  let hi = diagonalPiHigh;
  if (lo > hi) [lo, hi] = [hi, lo];
  for (let sj = 0; sj < segments.length; sj++) {
    const pts = segments[sj]?.points;
    if (!Array.isArray(pts)) continue;
    for (let pj = 0; pj < pts.length; pj++) {
      if (sj === diagonalSi && pj >= lo && pj <= hi) continue;
      if (!isConnectLikeNode(nodeAtPolylineVertex(segments[sj], pj, pts))) continue;
      const g = connectEffectiveGridAtVertex(segments[sj], pj);
      if (!g) continue;
      if (snapHalfCoord(g[0]) === cx && snapHalfCoord(g[1]) === cy) return true;
    }
  }
  return false;
}

/**
 * L 轉角格是否與**其他折線**（非當前路段 `excludeSegIndex`）上任一頂點共格。
 */
export function orthoLcCornerCoincidesOtherRoutePolylineVertex(
  cornerGx,
  cornerGy,
  segments,
  excludeSegIndex
) {
  const ck = cornerCellKey(cornerGx, cornerGy);
  if (!segments?.length || excludeSegIndex < 0 || excludeSegIndex >= segments.length) return false;
  for (let sj = 0; sj < segments.length; sj++) {
    if (sj === excludeSegIndex) continue;
    const pts = segments[sj]?.points;
    if (!Array.isArray(pts)) continue;
    for (let pj = 0; pj < pts.length; pj++) {
      const [vx, vy] = getXY(pts[pj]);
      if (cornerCellKey(vx, vy) === ck) return true;
    }
  }
  return false;
}

export function rbConnectAllowedCornerKeysForDiagonalEdge(segments, diagonalSi, diagonalPi) {
  const allowed = new Set();
  const seg = segments?.[diagonalSi];
  const pts = seg?.points;
  if (!Array.isArray(pts)) return allowed;
  for (const pIdx of [diagonalPi, diagonalPi + 1]) {
    if (pIdx < 0 || pIdx >= pts.length) continue;
    if (!isConnectLikeNode(nodeAtPolylineVertex(seg, pIdx, pts))) continue;
    const g = connectEffectiveGridAtVertex(seg, pIdx);
    if (g) allowed.add(cornerCellKey(g[0], g[1]));
  }
  return allowed;
}

export function orthoDiagonalToLOrthoGeometryOrConnectInvalid(segments) {
  return (
    orthoFlatSegmentsGeometryInvalid(segments) ||
    orthoFlatSegmentsOverlapsForeignConnectDisplay(segments)
  );
}

function insertCorner(segments, si, pi, cornerX, cornerY) {
  const seg = segments[si];
  const pts = seg?.points;
  if (!Array.isArray(pts) || pi < 0 || pi >= pts.length - 1) return false;
  const template = pts[pi];
  const corner = cloneVertexFromTemplate(template, cornerX, cornerY);
  const lenBefore = pts.length;
  pts.splice(pi + 1, 0, corner);
  const nodes = seg.nodes;
  if (Array.isArray(nodes) && nodes.length === lenBefore) {
    const bend = {
      node_type: 'line',
      tags: { x_grid: snapHalfCoord(cornerX), y_grid: snapHalfCoord(cornerY) },
    };
    nodes.splice(pi + 1, 0, bend);
  }
  return true;
}

/** 在 `pi`→`pi+1` 之中間依序插入兩個轉角（形成三條正交邊） */
function insertTwoCorners(segments, si, pi, c1x, c1y, c2x, c2y) {
  if (!insertCorner(segments, si, pi, c1x, c1y)) return false;
  if (!insertCorner(segments, si, pi + 1, c2x, c2y)) return false;
  return true;
}

/**
 * 替換後 path 為 pi…pi+3 共四點；兩轉角均需通過 rb connect／他線頂點共格檢查。
 */
function nzTwoCornersConstraintsOk(trial, si, pi, c1x, c1y, c2x, c2y, allowedCornerCellKeys) {
  const lo = pi;
  const hi = pi + 3;
  if (
    orthoLcCornerTouchesForeignRbConnectDisplay(
      c1x,
      c1y,
      trial,
      si,
      lo,
      hi,
      allowedCornerCellKeys
    ) ||
    orthoLcCornerCoincidesOtherRoutePolylineVertex(c1x, c1y, trial, si)
  ) {
    return false;
  }
  if (
    orthoLcCornerTouchesForeignRbConnectDisplay(
      c2x,
      c2y,
      trial,
      si,
      lo,
      hi,
      allowedCornerCellKeys
    ) ||
    orthoLcCornerCoincidesOtherRoutePolylineVertex(c2x, c2y, trial, si)
  ) {
    return false;
  }
  return !orthoDiagonalToLOrthoGeometryOrConnectInvalid(trial);
}

/** Z：H-V-H；與鄰邊共線程度（僅端點轉向處計分） */
function nzScoreZ(x0, y0, kx, y1, x1, px0, py0, nx1, ny1) {
  let s = 0;
  if (px0 != null && py0 != null && straightAligned(px0, py0, x0, y0, kx, y0)) s++;
  if (nx1 != null && ny1 != null && straightAligned(kx, y1, x1, y1, nx1, ny1)) s++;
  return s;
}

/** N／反 N：V-H-V */
function nzScoreN(x0, y0, ky, x1, y1, px0, py0, nx1, ny1) {
  let s = 0;
  if (px0 != null && py0 != null && straightAligned(px0, py0, x0, y0, x0, ky)) s++;
  if (nx1 != null && ny1 != null && straightAligned(x1, ky, x1, y1, nx1, ny1)) s++;
  return s;
}

/**
 * 若兩種 L 皆不可行，枚舉 Z／N 內點轉角。
 * @returns {Array<{ trial: object[], score: number, kind: 'z'|'n' }>}
 */
function buildNzReplacementsForDiagonal(
  work,
  si,
  pi,
  x0,
  y0,
  x1,
  y1,
  px0,
  py0,
  nx1,
  ny1,
  allowedCornerKeys
) {
  const xmin = Math.min(x0, x1);
  const xmax = Math.max(x0, x1);
  const ymin = Math.min(y0, y1);
  const ymax = Math.max(y0, y1);
  const viable = [];

  for (let kx = xmin + 1; kx <= xmax - 1; kx++) {
    const trial = JSON.parse(JSON.stringify(work));
    if (!insertTwoCorners(trial, si, pi, kx, y0, kx, y1)) continue;
    syncOrthoFlatSegmentEndpoints(trial);
    if (!nzTwoCornersConstraintsOk(trial, si, pi, kx, y0, kx, y1, allowedCornerKeys)) {
      continue;
    }
    viable.push({
      trial,
      score: nzScoreZ(x0, y0, kx, y1, x1, px0, py0, nx1, ny1),
      kind: 'z',
    });
  }

  for (let ky = ymin + 1; ky <= ymax - 1; ky++) {
    const trial = JSON.parse(JSON.stringify(work));
    if (!insertTwoCorners(trial, si, pi, x0, ky, x1, ky)) continue;
    syncOrthoFlatSegmentEndpoints(trial);
    if (!nzTwoCornersConstraintsOk(trial, si, pi, x0, ky, x1, ky, allowedCornerKeys)) {
      continue;
    }
    viable.push({
      trial,
      score: nzScoreN(x0, y0, ky, x1, y1, px0, py0, nx1, ny1),
      kind: 'n',
    });
  }

  return viable;
}

/** 頂點 b 之前後邊段是否共線且同向（正交或 45°） */
function collinearSameDirection(ax, ay, bx, by, cx, cy) {
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = cx - bx;
  const v2y = cy - by;
  if ((v1x === 0 && v1y === 0) || (v2x === 0 && v2y === 0)) return false;
  const cross = v1x * v2y - v1y * v2x;
  if (cross !== 0) return false;
  const dot = v1x * v2x + v1y * v2y;
  return dot > 0;
}

function hv45StraightContinuationScore(x0, y0, cx, cy, x1, y1, px0, py0, nx1, ny1) {
  let s = 0;
  if (px0 != null && py0 != null) {
    if (collinearSameDirection(px0, py0, x0, y0, cx, cy)) s++;
  }
  if (nx1 != null && ny1 != null) {
    if (collinearSameDirection(cx, cy, x1, y1, nx1, ny1)) s++;
  }
  return s;
}

const HV45_EPS = 1e-9;

function isOrthoHV(ax, ay, bx, by) {
  const axs = snapHalfCoord(ax);
  const ays = snapHalfCoord(ay);
  const bxs = snapHalfCoord(bx);
  const bys = snapHalfCoord(by);
  return axs === bxs || ays === bys;
}

function isDiag45HV(ax, ay, bx, by) {
  const axs = snapHalfCoord(ax);
  const ays = snapHalfCoord(ay);
  const bxs = snapHalfCoord(bx);
  const bys = snapHalfCoord(by);
  const ddx = bxs - axs;
  const ddy = bys - ays;
  if (ddx === 0 || ddy === 0) return false;
  return Math.abs(ddx) === Math.abs(ddy);
}

function hv45TripletSegmentsOk(ax, ay, px, py, qx, qy, bx, by) {
  const len = (x1, y1, x2, y2) => Math.abs(x2 - x1) + Math.abs(y2 - y1);
  if (
    len(ax, ay, px, py) < HV45_EPS ||
    len(px, py, qx, qy) < HV45_EPS ||
    len(qx, qy, bx, by) < HV45_EPS
  ) {
    return false;
  }
  return (
    isDiag45HV(ax, ay, px, py) &&
    isOrthoHV(px, py, qx, qy) &&
    isDiag45HV(qx, qy, bx, by)
  );
}

function hv45DdContinuationScore(x0, y0, px, py, qx, qy, x1, y1, px0, py0, nx1, ny1) {
  let s = 0;
  if (px0 != null && py0 != null && collinearSameDirection(px0, py0, x0, y0, px, py)) s++;
  if (nx1 != null && ny1 != null && collinearSameDirection(qx, qy, x1, y1, nx1, ny1)) s++;
  return s;
}

/** 斜─橫─斜：中間為水平 */
function collectHv45DodHorizontalMiddle(x0, y0, x1, y1, sx, sy, adx, ady) {
  const out = [];
  const seen = new Set();
  const maxSteps = (adx + ady + 4) * 2;
  for (let ki = 1; ki <= maxSteps; ki++) {
    const k = ki / 2;
    const Px = x0 + sx * k;
    const Py = y0 + sy * k;
    const legQB = Math.abs(y1 - Py);
    if (legQB < HV45_EPS) continue;
    for (const sign of [-1, 1]) {
      const Qx = x1 + sign * legQB;
      const Qy = Py;
      if (Math.abs(Qx - Px) < HV45_EPS) continue;
      if (!hv45TripletSegmentsOk(x0, y0, Px, Py, Qx, Qy, x1, y1)) continue;
      const key = `${cornerCellKey(Px, Py)}|${cornerCellKey(Qx, Qy)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ px: Px, py: Py, qx: Qx, qy: Qy });
    }
  }
  return out;
}

/** 斜─豎─斜：中間為垂直 */
function collectHv45DodVerticalMiddle(x0, y0, x1, y1, sx, sy, adx, ady) {
  const out = [];
  const seen = new Set();
  const maxSteps = (adx + ady + 4) * 2;
  for (let ki = 1; ki <= maxSteps; ki++) {
    const k = ki / 2;
    const Px = x0 + sx * k;
    const Py = y0 + sy * k;
    const legQB = Math.abs(x1 - Px);
    if (legQB < HV45_EPS) continue;
    for (const sign of [-1, 1]) {
      const Qx = Px;
      const Qy = y1 + sign * legQB;
      if (Math.abs(Qy - Py) < HV45_EPS) continue;
      if (!hv45TripletSegmentsOk(x0, y0, Px, Py, Qx, Qy, x1, y1)) continue;
      const key = `${cornerCellKey(Px, Py)}|${cornerCellKey(Qx, Qy)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ px: Px, py: Py, qx: Qx, qy: Qy });
    }
  }
  return out;
}

/**
 * |Δx|≠|Δy| 斜邊 → 一段或兩段轉折；轉折座標對齊 **0.5 格**。含單轉折（先斜後正／先正後斜）與雙轉折（斜─直─斜）。
 * @returns {Array<{ trial: object[], score: number, kind: string, bends: number }>}
 */
function buildHv45ReplacementsForDiagonal(
  work,
  si,
  pi,
  x0,
  y0,
  x1,
  y1,
  px0,
  py0,
  nx1,
  ny1,
  allowedCornerKeys,
  preferVertFirst
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const viable = [];

  if (adx === ady) return viable;

  const k = Math.min(adx, ady);
  const cdo = [x0 + sx * k, y0 + sy * k];
  const cod = adx > ady ? [x1 - sx * ady, y0] : [x0, y1 - sy * adx];

  const rawOne = [
    { cx: cdo[0], cy: cdo[1], kind: /** @type {'do'} */ ('do') },
    { cx: cod[0], cy: cod[1], kind: /** @type {'od'} */ ('od') },
  ];
  const seenOne = new Set();
  for (const { cx, cy, kind } of rawOne) {
    const key = cornerCellKey(cx, cy);
    if (seenOne.has(key)) continue;
    seenOne.add(key);
    if ((snapHalfCoord(cx) === snapHalfCoord(x0) && snapHalfCoord(cy) === snapHalfCoord(y0)) ||
        (snapHalfCoord(cx) === snapHalfCoord(x1) && snapHalfCoord(cy) === snapHalfCoord(y1))) {
      continue;
    }

    const trial = JSON.parse(JSON.stringify(work));
    if (!insertCorner(trial, si, pi, cx, cy)) continue;
    syncOrthoFlatSegmentEndpoints(trial);
    if (
      orthoLcCornerTouchesForeignRbConnectDisplay(
        cx,
        cy,
        trial,
        si,
        pi,
        pi + 2,
        allowedCornerKeys
      ) ||
      orthoLcCornerCoincidesOtherRoutePolylineVertex(cx, cy, trial, si) ||
      orthoDiagonalToLOrthoGeometryOrConnectInvalid(trial)
    ) {
      continue;
    }
    viable.push({
      trial,
      score: hv45StraightContinuationScore(x0, y0, cx, cy, x1, y1, px0, py0, nx1, ny1),
      kind,
      bends: 1,
    });
  }

  const dodList = [
    ...collectHv45DodHorizontalMiddle(x0, y0, x1, y1, sx, sy, adx, ady),
    ...collectHv45DodVerticalMiddle(x0, y0, x1, y1, sx, sy, adx, ady),
  ];
  const seenDod = new Set();
  for (const { px, py, qx, qy } of dodList) {
    const dk = `${cornerCellKey(px, py)}|${cornerCellKey(qx, qy)}`;
    if (seenDod.has(dk)) continue;
    seenDod.add(dk);
    const trial = JSON.parse(JSON.stringify(work));
    if (!insertTwoCorners(trial, si, pi, px, py, qx, qy)) continue;
    syncOrthoFlatSegmentEndpoints(trial);
    if (!nzTwoCornersConstraintsOk(trial, si, pi, px, py, qx, qy, allowedCornerKeys)) continue;
    viable.push({
      trial,
      score: hv45DdContinuationScore(x0, y0, px, py, qx, qy, x1, y1, px0, py0, nx1, ny1),
      kind: 'dod',
      bends: 2,
    });
  }

  viable.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.bends !== b.bends) return a.bends - b.bends;
    const pri = (v) => {
      if (v.bends !== 1) return 1;
      if (v.kind === 'od' && ady > adx) return preferVertFirst ? 2 : 0;
      if (v.kind === 'od' && adx > ady) return preferVertFirst ? 0 : 2;
      return 1;
    };
    return pri(b) - pri(a);
  });

  return viable;
}

/**
 * 僅掃描 `work[routeSegmentIndex]`：若該折線上有一條可替換斜邊，替換**第一個**（pi 由小到大）並回傳新路網。
 * @param {Array<object>} work 目前 flat 路網（會被結果取代；呼叫端應傳入可更新之物件）
 * @param {number} routeSegmentIndex flatSegments 折線索引
 */
function attemptFirstDiagonalReplacementOnRoute(work, routeSegmentIndex, options) {
  const { preferVertFirst = false, tryNzIfNoL = true, tryL = true, tryHv45 = false } = options;
  const si = routeSegmentIndex;
  const pts = work[si]?.points;
  if (!Array.isArray(pts) || pts.length < 2) return { work, replacedCount: 0 };

  for (let pi = 0; pi < pts.length - 1; pi++) {
    const [x0, y0] = getXY(pts[pi]);
    const [x1, y1] = getXY(pts[pi + 1]);
    if (x0 === x1 || y0 === y1) continue;

    const px0 = pi > 0 ? getXY(pts[pi - 1])[0] : null;
    const py0 = pi > 0 ? getXY(pts[pi - 1])[1] : null;
    const nx1 = pi + 2 < pts.length ? getXY(pts[pi + 2])[0] : null;
    const ny1 = pi + 2 < pts.length ? getXY(pts[pi + 2])[1] : null;

    const cand = [
      { cx: x1, cy: y0, horizFirst: true },
      { cx: x0, cy: y1, horizFirst: false },
    ];

    const allowedCornerKeys = rbConnectAllowedCornerKeysForDiagonalEdge(work, si, pi);

    if (tryL) {
      const viable = [];
      for (const { cx, cy, horizFirst } of cand) {
        if ((cx === x0 && cy === y0) || (cx === x1 && cy === y1)) continue;
        const trial = JSON.parse(JSON.stringify(work));
        if (!insertCorner(trial, si, pi, cx, cy)) continue;
        syncOrthoFlatSegmentEndpoints(trial);
        if (
          orthoLcCornerTouchesForeignRbConnectDisplay(
            cx,
            cy,
            trial,
            si,
            pi,
            pi + 2,
            allowedCornerKeys
          ) ||
          orthoLcCornerCoincidesOtherRoutePolylineVertex(cx, cy, trial, si) ||
          orthoDiagonalToLOrthoGeometryOrConnectInvalid(trial)
        )
          continue;
        const score = straightContinuationScore(x0, y0, x1, y1, cx, cy, px0, py0, nx1, ny1);
        viable.push({ trial, score, horizFirst });
      }

      if (viable.length > 0) {
        viable.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.horizFirst !== b.horizFirst) {
            if (preferVertFirst) return a.horizFirst ? 1 : -1;
            return a.horizFirst ? -1 : 1;
          }
          return 0;
        });
        const next = viable[0].trial;
        syncOrthoFlatSegmentEndpoints(next);
        return { work: next, replacedCount: 1 };
      }
    }

    if (tryNzIfNoL) {
      const nzViable = buildNzReplacementsForDiagonal(
        work,
        si,
        pi,
        x0,
        y0,
        x1,
        y1,
        px0,
        py0,
        nx1,
        ny1,
        allowedCornerKeys
      );
      if (nzViable.length > 0) {
        nzViable.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (preferVertFirst) {
            if (a.kind === 'n' && b.kind === 'z') return -1;
            if (a.kind === 'z' && b.kind === 'n') return 1;
          } else {
            if (a.kind === 'z' && b.kind === 'n') return -1;
            if (a.kind === 'n' && b.kind === 'z') return 1;
          }
          return 0;
        });
        const nextNz = nzViable[0].trial;
        syncOrthoFlatSegmentEndpoints(nextNz);
        return { work: nextNz, replacedCount: 1 };
      }
    }

    if (tryHv45) {
      const adxM = Math.abs(x1 - x0);
      const adyM = Math.abs(y1 - y0);
      if (adxM !== adyM) {
        const hvViable = buildHv45ReplacementsForDiagonal(
          work,
          si,
          pi,
          x0,
          y0,
          x1,
          y1,
          px0,
          py0,
          nx1,
          ny1,
          allowedCornerKeys,
          preferVertFirst
        );
        if (hvViable.length > 0) {
          const nextHv = hvViable[0].trial;
          syncOrthoFlatSegmentEndpoints(nextHv);
          return { work: nextHv, replacedCount: 1 };
        }
      }
    }
  }

  return { work, replacedCount: 0 };
}

/** 自轉角 (cx,cy) 沿軸往 (tx,ty) 走 1 格（兩點須共水平或共垂直線） */
function unitOrthoSegmentFromCornerToward(cx, cy, tx, ty) {
  const dx = snapHalfCoord(tx) - snapHalfCoord(cx);
  const dy = snapHalfCoord(ty) - snapHalfCoord(cy);
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0) return null;
  if (dx !== 0) {
    const s = dx > 0 ? 1 : -1;
    return { x0: cx, y0: cy, x1: cx + s, y1: cy };
  }
  const s = dy > 0 ? 1 : -1;
  return { x0: cx, y0: cy, x1: cx, y1: cy + s };
}

/**
 * 自 (fx,fy) 朝 (tx,ty) 的「視覺上第一步」線段（1 格）。
 * `allowDiagonal`：若 |Δx|=|Δy|≠0 則走 45° 一步；否則取曼哈頓較大軸向一步。
 */
function unitGridSegmentToward(fx, fy, tx, ty, allowDiagonal) {
  const dx = snapHalfCoord(tx) - snapHalfCoord(fx);
  const dy = snapHalfCoord(ty) - snapHalfCoord(fy);
  if (dx === 0 && dy === 0) return null;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  if (!allowDiagonal) {
    if (adx !== 0 && ady !== 0) return null;
    if (adx > 0) return { x0: fx, y0: fy, x1: fx + sx, y1: fy };
    return { x0: fx, y0: fy, x1: fx, y1: fy + sy };
  }
  if (adx !== 0 && ady !== 0) {
    if (adx === ady) return { x0: fx, y0: fy, x1: fx + sx, y1: fy + sy };
    if (adx > ady) return { x0: fx, y0: fy, x1: fx + sx, y1: fy };
    return { x0: fx, y0: fy, x1: fx, y1: fy + sy };
  }
  if (adx > 0) return { x0: fx, y0: fy, x1: fx + sx, y1: fy };
  return { x0: fx, y0: fy, x1: fx, y1: fy + sy };
}

function pairFromLReplacementCorner(x0, y0, x1, y1, cx, cy) {
  const a = unitOrthoSegmentFromCornerToward(cx, cy, x0, y0);
  const b = unitOrthoSegmentFromCornerToward(cx, cy, x1, y1);
  return a && b ? [a, b] : null;
}

/**
 * 預覽「下一筆」斜邊替換在轉角處的兩臂：各僅 1 格，呈 L 形（H／V／45° 模式若為單轉角則含斜向一步）。
 * 與 {@link attemptFirstDiagonalReplacementOnRoute} 選案邏輯一致（含 preferVertFirst／tryL／tryNzIfNoL／tryHv45）。
 *
 * @returns {['diagReplaceUnitArms', Array<{x0:number,y0:number,x1:number,y1:number}>> | null}
 */
export function peekDiagonalReplaceNextUnitArmHighlightBundle(
  flatSegments,
  routeSegmentIndex,
  options = {}
) {
  const { preferVertFirst = false, tryNzIfNoL = true, tryL = true, tryHv45 = false } = options;
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return null;
  const work = shallowCloneOrthoSegmentsSynced(flatSegments);
  if (orthoDiagonalToLOrthoGeometryOrConnectInvalid(work)) return null;
  const si = Number(routeSegmentIndex);
  if (!Number.isFinite(si) || si < 0 || si >= work.length) return null;
  const pts = work[si]?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;

  for (let pi = 0; pi < pts.length - 1; pi++) {
    const [x0, y0] = getXY(pts[pi]);
    const [x1, y1] = getXY(pts[pi + 1]);
    if (x0 === x1 || y0 === y1) continue;

    const px0 = pi > 0 ? getXY(pts[pi - 1])[0] : null;
    const py0 = pi > 0 ? getXY(pts[pi - 1])[1] : null;
    const nx1 = pi + 2 < pts.length ? getXY(pts[pi + 2])[0] : null;
    const ny1 = pi + 2 < pts.length ? getXY(pts[pi + 2])[1] : null;

    const cand = [
      { cx: x1, cy: y0, horizFirst: true },
      { cx: x0, cy: y1, horizFirst: false },
    ];

    const allowedCornerKeys = rbConnectAllowedCornerKeysForDiagonalEdge(work, si, pi);

    if (tryL) {
      const viable = [];
      for (const { cx, cy, horizFirst } of cand) {
        if ((cx === x0 && cy === y0) || (cx === x1 && cy === y1)) continue;
        const trial = JSON.parse(JSON.stringify(work));
        if (!insertCorner(trial, si, pi, cx, cy)) continue;
        syncOrthoFlatSegmentEndpoints(trial);
        if (
          orthoLcCornerTouchesForeignRbConnectDisplay(
            cx,
            cy,
            trial,
            si,
            pi,
            pi + 2,
            allowedCornerKeys
          ) ||
          orthoLcCornerCoincidesOtherRoutePolylineVertex(cx, cy, trial, si) ||
          orthoDiagonalToLOrthoGeometryOrConnectInvalid(trial)
        )
          continue;
        const score = straightContinuationScore(x0, y0, x1, y1, cx, cy, px0, py0, nx1, ny1);
        viable.push({ score, horizFirst, cx, cy });
      }

      if (viable.length > 0) {
        viable.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.horizFirst !== b.horizFirst) {
            if (preferVertFirst) return a.horizFirst ? 1 : -1;
            return a.horizFirst ? -1 : 1;
          }
          return 0;
        });
        const { cx, cy } = viable[0];
        const pair = pairFromLReplacementCorner(x0, y0, x1, y1, cx, cy);
        if (pair) return ['diagReplaceUnitArms', pair];
      }
    }

    if (tryNzIfNoL) {
      const nzViable = buildNzReplacementsForDiagonal(
        work,
        si,
        pi,
        x0,
        y0,
        x1,
        y1,
        px0,
        py0,
        nx1,
        ny1,
        allowedCornerKeys
      );
      if (nzViable.length > 0) {
        nzViable.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (preferVertFirst) {
            if (a.kind === 'n' && b.kind === 'z') return -1;
            if (a.kind === 'z' && b.kind === 'n') return 1;
          } else {
            if (a.kind === 'z' && b.kind === 'n') return -1;
            if (a.kind === 'n' && b.kind === 'z') return 1;
          }
          return 0;
        });
        const tpts = nzViable[0].trial[si]?.points;
        if (!Array.isArray(tpts) || pi + 2 >= tpts.length) continue;
        const [c1x, c1y] = getXY(tpts[pi + 1]);
        const [c2x, c2y] = getXY(tpts[pi + 2]);
        const s1 = unitOrthoSegmentFromCornerToward(c1x, c1y, x0, y0);
        const s2 = unitOrthoSegmentFromCornerToward(c1x, c1y, c2x, c2y);
        if (s1 && s2) return ['diagReplaceUnitArms', [s1, s2]];
      }
    }

    if (tryHv45) {
      const adxM = Math.abs(x1 - x0);
      const adyM = Math.abs(y1 - y0);
      if (adxM !== adyM) {
        const hvViable = buildHv45ReplacementsForDiagonal(
          work,
          si,
          pi,
          x0,
          y0,
          x1,
          y1,
          px0,
          py0,
          nx1,
          ny1,
          allowedCornerKeys,
          preferVertFirst
        );
        if (hvViable.length > 0) {
          const best = hvViable[0];
          const tpts = best.trial[si]?.points;
          if (!Array.isArray(tpts)) continue;
          if (best.bends === 1) {
            if (pi + 1 >= tpts.length) continue;
            const [cx, cy] = getXY(tpts[pi + 1]);
            const s1 = unitGridSegmentToward(cx, cy, x0, y0, true);
            const s2 = unitGridSegmentToward(cx, cy, x1, y1, true);
            if (s1 && s2) return ['diagReplaceUnitArms', [s1, s2]];
          } else {
            if (pi + 2 >= tpts.length) continue;
            const [p1x, p1y] = getXY(tpts[pi + 1]);
            const [p2x, p2y] = getXY(tpts[pi + 2]);
            const s1 = unitGridSegmentToward(p1x, p1y, x0, y0, true);
            const s2 = unitGridSegmentToward(p1x, p1y, p2x, p2y, true);
            if (s1 && s2) return ['diagReplaceUnitArms', [s1, s2]];
          }
        }
      }
    }
  }

  return null;
}

/**
 * 僅針對單一折線（`flatSegments[routeSegmentIndex]`）：替換**一處**斜邊（若存在）。
 * @param {{ preferVertFirst?: boolean, tryNzIfNoL?: boolean, tryL?: boolean, tryHv45?: boolean }} [options] `tryL` 預設 true；`tryNzIfNoL` 預設 true。
 */
export function replaceOneDiagonalInRoute(flatSegments, routeSegmentIndex, options = {}) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return {
      ok: false,
      segments: flatSegments ?? [],
      replacedCount: 0,
      message: '沒有路段資料。',
    };
  }
  let work = shallowCloneOrthoSegmentsSynced(flatSegments);
  if (orthoDiagonalToLOrthoGeometryOrConnectInvalid(work)) {
    return {
      ok: false,
      segments: work,
      replacedCount: 0,
      message:
        '目前路網已有交叉、重疊、頂點落線，或有線段穿過（壓過）非端點上之紅／藍 connect 顯示格；請先修正。',
    };
  }
  const si = Number(routeSegmentIndex);
  if (!Number.isFinite(si) || si < 0 || si >= work.length) {
    return { ok: true, segments: work, replacedCount: 0, message: '路線索引超出範圍。' };
  }
  const { work: next, replacedCount } = attemptFirstDiagonalReplacementOnRoute(work, si, options);
  return {
    ok: true,
    segments: next,
    replacedCount,
    message:
      replacedCount === 0
        ? '該路線上無可替換斜邊（或皆違反約束）。'
        : `已於路線 #${si + 1} 替換 1 處斜邊。`,
  };
}

/**
 * 僅針對單一折線：重複替換直到該線無斜邊或達安全上限（等同「一鍵」只套在同一條 polyline）。
 */
export function replaceDiagonalsInRouteUntilClear(flatSegments, routeSegmentIndex, options = {}) {
  const MAX_STEPS = 8192;
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return {
      ok: false,
      segments: flatSegments ?? [],
      replacedCount: 0,
      message: '沒有路段資料。',
    };
  }
  let work = shallowCloneOrthoSegmentsSynced(flatSegments);
  if (orthoDiagonalToLOrthoGeometryOrConnectInvalid(work)) {
    return {
      ok: false,
      segments: work,
      replacedCount: 0,
      message:
        '目前路網已有交叉、重疊、頂點落線，或有線段穿過（壓過）非端點上之紅／藍 connect 顯示格；請先修正。',
    };
  }
  const si = Number(routeSegmentIndex);
  if (!Number.isFinite(si) || si < 0 || si >= work.length) {
    return { ok: true, segments: work, replacedCount: 0, message: '路線索引超出範圍。' };
  }
  let total = 0;
  for (let k = 0; k < MAX_STEPS; k++) {
    const step = attemptFirstDiagonalReplacementOnRoute(work, si, options);
    if (step.replacedCount === 0) break;
    work = step.work;
    total += step.replacedCount;
  }
  return {
    ok: true,
    segments: work,
    replacedCount: total,
    message:
      total === 0
        ? `路線 #${si + 1} 上無可替換斜邊（或皆違反約束）。`
        : `路線 #${si + 1} 已替換 ${total} 處斜邊。`,
  };
}

/**
 * @param {Array<object>} flatSegments normalizeSpaceNetworkDataToFlatSegments 結果
 * @param {{ preferVertFirst?: boolean, tryNzIfNoL?: boolean, tryL?: boolean, tryHv45?: boolean }} [options]
 * @returns {{ ok: boolean, segments: Array<object>, replacedCount: number, message?: string }}
 */
export function replaceDiagonalEdgesWithLOrtho(flatSegments, options = {}) {
  const opts = { tryL: true, tryNzIfNoL: true, preferVertFirst: false, tryHv45: false, ...options };
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return {
      ok: false,
      segments: flatSegments ?? [],
      replacedCount: 0,
      message: '沒有路段資料。',
    };
  }

  let work = shallowCloneOrthoSegmentsSynced(flatSegments);
  if (orthoDiagonalToLOrthoGeometryOrConnectInvalid(work)) {
    return {
      ok: false,
      segments: work,
      replacedCount: 0,
      message:
        '目前路網已有交叉、重疊、頂點落線，或有線段穿過（壓過）非端點上之紅／藍 connect 顯示格；請先修正。',
    };
  }

  let replacedCount = 0;
  const maxPasses = Math.max(64, flatSegments.length * 32);
  let passes = 0;

  while (passes++ < maxPasses) {
    let replacedThisRound = false;

    for (let si = 0; si < work.length; si++) {
      const { work: next, replacedCount: rc } = attemptFirstDiagonalReplacementOnRoute(
        work,
        si,
        opts
      );
      if (rc > 0) {
        work = next;
        replacedCount += rc;
        replacedThisRound = true;
        break;
      }
    }

    if (!replacedThisRound) break;
  }

  const tryL = opts.tryL !== false;
  const tryNz = opts.tryNzIfNoL !== false;
  const tryHv45Only = opts.tryHv45 === true;
  let modePhrase = '優先 L，否則 N／Z 形三正交段';
  let emptyPhrase = '沒有可替換的非正交邊，或 L／N／Z 皆違反約束。';
  if (tryL && !tryNz) {
    modePhrase = '僅正交 L（兩段）';
    emptyPhrase = '沒有可替換的非正交邊，或兩種 L 皆違反約束。';
  } else if (!tryL && tryNz) {
    modePhrase = '僅 N／Z 形三正交段';
    emptyPhrase = '沒有可替換的非正交邊，或 N／Z 皆違反約束。';
  } else if (!tryL && !tryNz && tryHv45Only) {
    modePhrase = '僅水平／垂直／45°（0.5 格轉折；單轉折兩段或雙轉折斜─直─斜）';
    emptyPhrase =
      '沒有可替換之 |Δx|≠|Δy| 斜邊，或所有候選皆違反約束（若已為單段 45° 則不需替換）。';
  }

  return {
    ok: true,
    segments: work,
    replacedCount,
    message:
      replacedCount === 0 ? emptyPhrase : `已替換 ${replacedCount} 條非正交邊（${modePhrase}）。`,
  };
}
