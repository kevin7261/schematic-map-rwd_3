import {
  orthoFlatSegmentsGeometryInvalid,
  shallowCloneOrthoSegmentsSynced,
  snapHalfCoord,
  syncOrthoFlatSegmentEndpoints,
} from './axisAlignGridNetworkHillClimb.js';
import { orthoFlatSegmentsOverlapsForeignConnectDisplay } from './replaceDiagonalEdgesWithLOrtho.js';

function getXY(pt) {
  if (Array.isArray(pt)) return [snapHalfCoord(pt[0]), snapHalfCoord(pt[1])];
  return [snapHalfCoord(pt?.x), snapHalfCoord(pt?.y)];
}

function pointEq(a, b) {
  return a && b && snapHalfCoord(a[0]) === snapHalfCoord(b[0]) && snapHalfCoord(a[1]) === snapHalfCoord(b[1]);
}

function pointKey(x, y) {
  return `${snapHalfCoord(x)},${snapHalfCoord(y)}`;
}

function isAxisUnitStep(dx, dy) {
  return (Math.abs(dx) === 1 && dy === 0) || (dx === 0 && Math.abs(dy) === 1);
}

function axisDirFromCorner(cx, cy, tx, ty) {
  const dx = snapHalfCoord(tx) - snapHalfCoord(cx);
  const dy = snapHalfCoord(ty) - snapHalfCoord(cy);
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0) return null;
  if (dx !== 0) return { ux: dx > 0 ? 1 : -1, uy: 0, len: Math.abs(dx) };
  return { ux: 0, uy: dy > 0 ? 1 : -1, len: Math.abs(dy) };
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
    const tags = j.tags && typeof j.tags === 'object' ? j.tags : {};
    j.tags = { ...tags, x_grid: rx, y_grid: ry };
    return j;
  }
  return [rx, ry];
}

function lineNode(x, y) {
  return {
    node_type: 'line',
    tags: { x_grid: snapHalfCoord(x), y_grid: snapHalfCoord(y) },
  };
}

function nodeAt(seg, pi) {
  if (!seg || pi < 0) return null;
  if (Array.isArray(seg.nodes) && seg.nodes[pi] && typeof seg.nodes[pi] === 'object') {
    return seg.nodes[pi];
  }
  const pts = seg.points;
  if (!Array.isArray(pts)) return null;
  if (pi === 0 && seg.properties_start && typeof seg.properties_start === 'object') return seg.properties_start;
  if (pi === pts.length - 1 && seg.properties_end && typeof seg.properties_end === 'object') return seg.properties_end;
  return null;
}

function isConnectLikeNode(node) {
  if (!node || typeof node !== 'object') return false;
  const nt = node.node_type ?? node.tags?.node_type;
  return nt === 'connect' || node.connect_number != null || node.tags?.connect_number != null;
}

function sameRouteUnitLCandidate(flatSegments, si, ci) {
  const seg = flatSegments?.[si];
  const pts = seg?.points;
  if (!Array.isArray(pts) || pts.length < 3 || ci <= 0 || ci >= pts.length - 1) return null;
  if (isConnectLikeNode(nodeAt(seg, ci))) return null;

  const [px, py] = getXY(pts[ci - 1]);
  const [cx, cy] = getXY(pts[ci]);
  const [nx, ny] = getXY(pts[ci + 1]);
  const aDir = axisDirFromCorner(cx, cy, px, py);
  const bDir = axisDirFromCorner(cx, cy, nx, ny);
  if (!aDir || !bDir) return null;
  if (aDir.len < 1 || bDir.len < 1) return null;
  if (aDir.ux * bDir.ux + aDir.uy * bDir.uy !== 0) return null;

  const ax = cx + aDir.ux;
  const ay = cy + aDir.uy;
  const bx = cx + bDir.ux;
  const by = cy + bDir.uy;
  if (!isAxisUnitStep(ax - cx, ay - cy) || !isAxisUnitStep(bx - cx, by - cy)) return null;

  return {
    si,
    ci,
    cornerX: cx,
    cornerY: cy,
    aX: ax,
    aY: ay,
    bX: bx,
    bY: by,
    prevIndex: ci - 1,
    nextIndex: ci + 1,
    prevLen: aDir.len,
    nextLen: bDir.len,
  };
}

/**
 * 列出同一條 flat route 內的正交 L。兩臂可長於 1 格，但候選只代表靠轉角各 1 格。
 */
export function listUnitOrthogonalLCandidates(flatSegments) {
  const out = [];
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return out;
  const seen = new Set();
  for (let si = 0; si < flatSegments.length; si++) {
    const pts = flatSegments[si]?.points;
    if (!Array.isArray(pts) || pts.length < 3) continue;
    for (let ci = 1; ci < pts.length - 1; ci++) {
      const cand = sameRouteUnitLCandidate(flatSegments, si, ci);
      if (!cand) continue;
      const key = `${si}:${ci}:${pointKey(cand.cornerX, cand.cornerY)}:${pointKey(cand.aX, cand.aY)}:${pointKey(cand.bX, cand.bY)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cand);
    }
  }
  return out;
}

export function unitOrthogonalL45HighlightBundle(cand) {
  if (!cand) return null;
  return [
    'diagReplaceUnitArms',
    [
      { x0: cand.cornerX, y0: cand.cornerY, x1: cand.aX, y1: cand.aY },
      { x0: cand.cornerX, y0: cand.cornerY, x1: cand.bX, y1: cand.bY },
    ],
  ];
}

function applyUnitLReplacementUnchecked(work, cand) {
  const seg = work?.[cand.si];
  const pts = seg?.points;
  if (!Array.isArray(pts) || cand.ci <= 0 || cand.ci >= pts.length - 1) return false;

  const ci = cand.ci;
  const a = [cand.aX, cand.aY];
  const b = [cand.bX, cand.bY];
  const prev = getXY(pts[ci - 1]);
  const next = getXY(pts[ci + 1]);
  const newPts = pts.slice(0, ci);

  if (!pointEq(prev, a)) newPts.push(cloneVertexFromTemplate(pts[ci], a[0], a[1]));
  if (!pointEq(newPts.length ? getXY(newPts[newPts.length - 1]) : null, b) && !pointEq(next, b)) {
    newPts.push(cloneVertexFromTemplate(pts[ci], b[0], b[1]));
  }
  for (let i = ci + 1; i < pts.length; i++) {
    const pxy = getXY(pts[i]);
    const last = newPts.length ? getXY(newPts[newPts.length - 1]) : null;
    if (pointEq(last, pxy)) continue;
    newPts.push(pts[i]);
  }
  if (newPts.length < 2) return false;
  seg.points = newPts;

  if (Array.isArray(seg.nodes) && seg.nodes.length === pts.length) {
    const newNodes = seg.nodes.slice(0, ci);
    if (!pointEq(prev, a)) newNodes.push(lineNode(a[0], a[1]));
    if (!pointEq(newPts.length ? getXY(newPts[newNodes.length - 1]) : null, b) && !pointEq(next, b)) {
      newNodes.push(lineNode(b[0], b[1]));
    }
    for (let i = ci + 1; i < seg.nodes.length; i++) {
      if (newNodes.length >= newPts.length) break;
      newNodes.push(seg.nodes[i]);
    }
    if (newNodes.length === newPts.length) seg.nodes = newNodes;
  }
  syncOrthoFlatSegmentEndpoints(work);
  return true;
}

function validateUnitL45Replacement(work) {
  if (orthoFlatSegmentsGeometryInvalid(work)) {
    return '替換後會與其他路線交叉、共線重疊，或有頂點落在其他線段開放段上。';
  }
  if (orthoFlatSegmentsOverlapsForeignConnectDisplay(work)) {
    return '替換後線段開放內部會壓到紅／藍 connect 顯示格。';
  }
  return null;
}

export function tryReplaceUnitOrthogonalLWith45(flatSegments, cand) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return { ok: false, replaced: false, segments: flatSegments ?? [], reason: '沒有路段資料。' };
  }
  const base = shallowCloneOrthoSegmentsSynced(flatSegments);
  const refreshed = sameRouteUnitLCandidate(base, Number(cand?.si), Number(cand?.ci));
  if (!refreshed) {
    return { ok: true, replaced: false, segments: base, reason: '候選已不存在，或不是同一路線內的正交 L。' };
  }
  if (
    refreshed.cornerX !== cand.cornerX ||
    refreshed.cornerY !== cand.cornerY ||
    refreshed.aX !== cand.aX ||
    refreshed.aY !== cand.aY ||
    refreshed.bX !== cand.bX ||
    refreshed.bY !== cand.bY
  ) {
    return { ok: true, replaced: false, segments: base, reason: '候選座標已改變，請重新標示。' };
  }

  const work = shallowCloneOrthoSegmentsSynced(base);
  if (!applyUnitLReplacementUnchecked(work, refreshed)) {
    return { ok: true, replaced: false, segments: base, reason: '無法插入單位端點或移除原 L 轉角。' };
  }
  const invalid = validateUnitL45Replacement(work);
  if (invalid) return { ok: true, replaced: false, segments: base, reason: invalid };

  return {
    ok: true,
    replaced: true,
    segments: work,
    reason: '已將靠轉角兩臂各 1 格縮成單一 45° 斜線。',
  };
}

export function replaceUnitOrthogonalLWith45DiagonalWhereClear(flatSegments) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return {
      ok: false,
      segments: flatSegments ?? [],
      replacedCount: 0,
      message: '沒有路段資料。',
    };
  }

  let work = shallowCloneOrthoSegmentsSynced(flatSegments);
  if (validateUnitL45Replacement(work)) {
    return {
      ok: false,
      segments: work,
      replacedCount: 0,
      message: '目前路網已有交叉、重疊、頂點落線，或線段壓過紅／藍 connect；請先修正。',
    };
  }

  let replacedCount = 0;
  let lastReason = '';
  const maxSteps = Math.max(64, flatSegments.length * 64);
  for (let step = 0; step < maxSteps; step++) {
    const candidates = listUnitOrthogonalLCandidates(work);
    if (!candidates.length) break;
    let replacedThisRound = false;
    for (const cand of candidates) {
      const r = tryReplaceUnitOrthogonalLWith45(work, cand);
      if (r.replaced) {
        work = r.segments;
        replacedCount += 1;
        replacedThisRound = true;
        lastReason = r.reason || '';
        break;
      }
      lastReason = r.reason || lastReason;
    }
    if (!replacedThisRound) break;
  }

  return {
    ok: true,
    segments: work,
    replacedCount,
    message:
      replacedCount === 0
        ? lastReason || '沒有可替換的單位正交 L（或皆違反約束）。'
        : `已將 ${replacedCount} 個單位正交 L 縮成 45° 斜線。`,
  };
}
