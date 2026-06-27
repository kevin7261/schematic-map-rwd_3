/**
 * 分歧點 360° 相對順序（讀入骨架 vs 直線化後輸出）
 *
 * 算法（依使用者規格）：直線化、黑點/彎折放回後，對每個分歧點（≥3 支），
 * 各支線以「另一端 connect 端點格座標」為身分，依該線**離開分歧點的第一段方向**排 CCW，
 * 比對讀入骨架與輸出的環序是否一致。
 *
 * 重要：以「段的頭(head)/尾(tail)」標記分歧端，於各骨架陣列即時解析索引；
 * 因 reinsertBlackStations 會在段中插入黑點，端點永遠是 index 0 / 最後一個。
 */

import { reinsertBlackStations } from './assemble.js';

const ANG_EPS = 1e-5;

function readPt(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

function gridKey(x, y) {
  return `${Math.round(x)},${Math.round(y)}`;
}

function parseKey(k) {
  const [x, y] = k.split(',').map(Number);
  return [x, y];
}

function normAngleDiff(a, b) {
  let d = a - b;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}

/** 段端點座標（head: index 0；tail: 最後一個）。 */
function endPt(seg, jHead) {
  const pts = seg.points;
  return readPt(pts[jHead ? 0 : pts.length - 1]);
}

/** 分歧點沿該線離開的第一段方向（head→points[1]；tail→points[len-2]）。 */
function leaveAngle(seg, jHead) {
  const pts = seg.points;
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  const [jx, jy] = readPt(pts[jHead ? 0 : pts.length - 1]);
  const [ox, oy] = readPt(pts[jHead ? 1 : pts.length - 2]);
  return Math.atan2(oy - jy, ox - jx);
}

/**
 * 由讀入骨架建分歧點表。身分 nKey = 該段「另一端 connect 端點」之讀入格座標。
 * @returns {Map<string, { branches: Map<string, { nKey:string, routes:string[], si:number, jHead:boolean }> }>}
 */
function buildJunctionTable(refSkeleton) {
  const junctions = new Map();

  const addBranch = (jKey, nKey, rn, si, jHead) => {
    if (jKey === nKey) return;
    if (!junctions.has(jKey)) junctions.set(jKey, { branches: new Map() });
    const br = junctions.get(jKey).branches;
    if (!br.has(nKey)) br.set(nKey, { nKey, routes: [], si, jHead });
    const g = br.get(nKey);
    if (rn && !g.routes.includes(rn)) g.routes.push(rn);
  };

  for (let si = 0; si < refSkeleton.length; si++) {
    const seg = refSkeleton[si];
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const [hx, hy] = endPt(seg, true);
    const [tx, ty] = endPt(seg, false);
    const hKey = gridKey(hx, hy);
    const tKey = gridKey(tx, ty);
    const rn = String(seg.route_name ?? seg.name ?? '').trim();
    addBranch(hKey, tKey, rn, si, true); // 分歧在 head，另一端是 tail
    addBranch(tKey, hKey, rn, si, false); // 分歧在 tail，另一端是 head
  }
  return junctions;
}

function branchLabel(branch) {
  const [ox, oy] = parseKey(branch.nKey);
  const rn = branch.routes[0] || '';
  return rn ? `「${rn}」→(${ox},${oy})` : `→(${ox},${oy})`;
}

function spokesFrom(junction, skeleton) {
  return [...junction.branches.values()].map((b) => ({
    ...b,
    ang: leaveAngle(skeleton[b.si], b.jHead),
    label: branchLabel(b),
  }));
}

function orderedNKeys(spokes, tieOrder) {
  const tie = new Map(tieOrder.map((k, i) => [k, i]));
  return spokes
    .slice()
    .sort((a, b) => {
      const d = normAngleDiff(a.ang, b.ang);
      if (Math.abs(d) > ANG_EPS) return d;
      return (tie.get(a.nKey) ?? 0) - (tie.get(b.nKey) ?? 0);
    })
    .map((s) => s.nKey);
}

function sameCyclic(a, b) {
  if (a.length !== b.length || !a.length) return true;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[(start + i) % a.length]) return false;
  return true;
}

function firstFlipPair(refOrder, outOrder, spokeMap) {
  for (let i = 0; i < refOrder.length; i++) {
    for (let j = i + 1; j < refOrder.length; j++) {
      const refStep = (j - i + refOrder.length) % refOrder.length;
      const oi = outOrder.indexOf(refOrder[i]);
      const oj = outOrder.indexOf(refOrder[j]);
      if (oi < 0 || oj < 0) continue;
      const outStep = (oj - oi + refOrder.length) % refOrder.length;
      if (refStep !== outStep) {
        return `${spokeMap.get(refOrder[i])?.label ?? refOrder[i]} 與 ${spokeMap.get(refOrder[j])?.label ?? refOrder[j]} 之相對順序對調`;
      }
    }
  }
  return '分支環序對調';
}

function analyzeJunction(jKey, junction, refSkeleton, outSkeleton) {
  if (junction.branches.size < 3) return { ok: true };

  const refSpokes = spokesFrom(junction, refSkeleton);
  const refOrder = orderedNKeys(refSpokes, refSpokes.map((s) => s.nKey));
  const outSpokes = spokesFrom(junction, outSkeleton);
  const outOrder = orderedNKeys(outSpokes, refOrder);

  // 輸出端的分歧點實際格座標（畫面所見），用於標籤
  const anyBranch = junction.branches.values().next().value;
  const [ox, oy] = endPt(outSkeleton[anyBranch.si], anyBranch.jHead);
  const outLabelKey = `${Math.round(ox)},${Math.round(oy)}`;

  if (sameCyclic(refOrder, outOrder)) return { ok: true, jKey, outLabelKey };

  const spokeMap = new Map(refSpokes.map((s) => [s.nKey, s]));
  return {
    ok: false,
    jKey,
    outLabelKey,
    refOrder,
    outOrder,
    refSpokes,
    label: `@(${outLabelKey})（讀入 @${jKey}）${junction.branches.size} 向`,
    pairLabel: firstFlipPair(refOrder, outOrder, spokeMap),
  };
}

/**
 * @param {Array<object>} refFullFlat 讀入 fullFlat（黑點已放回）
 * @param {Array<object>} outFullFlat 直線化後 fullFlat（索引與 refFullFlat 對齊）
 */
export function analyzeRotationStructure(refFullFlat, outFullFlat) {
  if (!Array.isArray(refFullFlat) || !Array.isArray(outFullFlat)) {
    return { preserved: true, violationCount: 0, violations: [], reasons: [], summaryZh: '無骨架可比對。' };
  }

  const junctions = buildJunctionTable(refFullFlat);
  const violations = [];

  for (const [jKey, junction] of junctions) {
    const r = analyzeJunction(jKey, junction, refFullFlat, outFullFlat);
    if (r.ok) continue;
    violations.push(r);
  }

  const reasons = violations.map(
    (v) => `入射方向順序不符：分歧點 ${v.label}；${v.pairLabel}（360° 環序與讀入骨架不同）`
  );

  return {
    preserved: violations.length === 0,
    violationCount: violations.length,
    violations,
    reasons,
    summaryZh: violations.length
      ? `偵測到 ${violations.length} 處分歧點 360° 分支順序與讀入骨架不符。`
      : '各分歧點相連分支 360° 相對順序與讀入骨架一致。',
  };
}

/**
 * 校正：把錯序支線的「另一端點」移回讀入骨架的角向楔形區（移動 connect 端點 → 重建 fullFlat 再驗）。
 * @param {Array<object>} refFullFlat 讀入 fullFlat 快照
 * @param {Array<object>} outConnectSkeleton 直線化 connect（含彎折；就地拷貝修改）
 * @param {Array<object>} sections buildConnectSkeleton 之 sections
 * @param {object} graph split 後圖
 * @param {Array<[number,number]>} outCoords MILP 圖座標（回寫）
 */
export function fixRotationStructure(refFullFlat, outConnectSkeleton, sections, graph, outCoords, opts = {}) {
  const maxIter = opts.maxIter ?? 120;
  const connectSkel = JSON.parse(JSON.stringify(outConnectSkeleton));
  const coords = outCoords.map((c) => [c[0], c[1]]);
  const moveLines = [];
  let iterations = 0;
  const nodeOfRef = graph?.nodeOfRef;

  const buildOutFull = () => reinsertBlackStations(JSON.parse(JSON.stringify(connectSkel)), sections || []);

  for (let step = 0; step < maxIter; step++) {
    const outFull = buildOutFull();
    const check = analyzeRotationStructure(refFullFlat, outFull);
    if (check.preserved) {
      syncConnectToCoords(connectSkel, graph, coords);
      return { ok: true, coords, outConnectSkeleton: connectSkel, check, moveLines, iterations };
    }

    const v = check.violations[0];
    const misNKey = findMisorderedNKey(v.refOrder, v.outOrder);
    const branch = v.refSpokes.find((s) => s.nKey === misNKey);
    if (!branch) break;

    const idx = v.refOrder.indexOf(misNKey);
    const prevKey = v.refOrder[(idx - 1 + v.refOrder.length) % v.refOrder.length];
    const nextKey = v.refOrder[(idx + 1) % v.refOrder.length];
    const prev = v.refSpokes.find((s) => s.nKey === prevKey);
    const next = v.refSpokes.find((s) => s.nKey === nextKey);

    const angPrev = prev ? leaveAngle(refFullFlat[prev.si], prev.jHead) : 0;
    const angNext = next ? leaveAngle(refFullFlat[next.si], next.jHead) : angPrev + Math.PI / 2;
    let d = angNext - angPrev;
    while (d <= 0) d += Math.PI * 2;
    const angMid = angPrev + d / 2;

    const seg = connectSkel[branch.si];
    const jIdx = branch.jHead ? 0 : seg.points.length - 1;
    const farIdx = branch.jHead ? seg.points.length - 1 : 0;
    const [jx, jy] = readPt(seg.points[jIdx]);
    const [ox0, oy0] = readPt(seg.points[farIdx]);
    const dist = Math.max(2, Math.hypot(ox0 - jx, oy0 - jy));
    const nx = Math.round(jx + dist * Math.cos(angMid));
    const ny = Math.round(jy + dist * Math.sin(angMid));
    const before = `(${Math.round(ox0)},${Math.round(oy0)})`;

    writePt(seg.points[farIdx], nx, ny);
    syncNodeGrid(seg, farIdx, nx, ny);
    if (nodeOfRef) {
      const nid = nodeOfRef.get(`${branch.si},${farIdx}`);
      if (nid != null && coords[nid]) coords[nid] = [nx, ny];
    }

    moveLines.push(`結構校正 ${branch.label}：${before} → (${nx},${ny})；分歧點 ${v.label}`);
    iterations++;
  }

  syncConnectToCoords(connectSkel, graph, coords);
  const check = analyzeRotationStructure(refFullFlat, buildOutFull());
  return {
    ok: check.preserved,
    coords,
    outConnectSkeleton: connectSkel,
    check,
    moveLines,
    iterations,
    errorZh: check.preserved ? undefined : `已迭代 ${maxIter} 次仍無法完全恢復分支順序。`,
  };
}

function findMisorderedNKey(refOrder, outOrder) {
  for (let i = 1; i < refOrder.length; i++) {
    for (let j = i + 1; j < refOrder.length; j++) {
      const refStep = (j - i + refOrder.length) % refOrder.length;
      const oi = outOrder.indexOf(refOrder[i]);
      const oj = outOrder.indexOf(refOrder[j]);
      if (oi < 0 || oj < 0) continue;
      const outStep = (oj - oi + refOrder.length) % refOrder.length;
      if (refStep !== outStep) return refOrder[j];
    }
  }
  return refOrder[refOrder.length - 1] ?? null;
}

function writePt(p, x, y) {
  if (Array.isArray(p)) {
    p[0] = x;
    p[1] = y;
  } else if (p && typeof p === 'object') {
    p.x = x;
    p.y = y;
  }
}

function syncNodeGrid(seg, idx, x, y) {
  const n = seg?.nodes?.[idx];
  if (n && typeof n === 'object') n.tags = { ...(n.tags || {}), x_grid: x, y_grid: y };
}

function syncConnectToCoords(connectSkel, graph, coords) {
  if (!graph?.nodes) return;
  for (let nodeId = 0; nodeId < graph.nodes.length; nodeId++) {
    const refs = graph.nodes[nodeId].refs;
    if (!refs?.length) continue;
    const { si, pi } = refs[0];
    const pt = connectSkel[si]?.points?.[pi];
    if (!pt) continue;
    coords[nodeId] = readPt(pt);
  }
}

/** 除錯：列出所有 ≥3 分歧點（輸出座標）之 ref / out 另一端點環序。 */
export function dumpAllJunctions(refFullFlat, outFullFlat) {
  const junctions = buildJunctionTable(refFullFlat);
  const out = [];
  for (const [jKey, junction] of junctions) {
    if (junction.branches.size < 3) continue;
    const refSpokes = spokesFrom(junction, refFullFlat);
    const outSpokes = spokesFrom(junction, outFullFlat);
    const refOrder = orderedNKeys(refSpokes, refSpokes.map((s) => s.nKey));
    const outOrder = orderedNKeys(outSpokes, refOrder);
    const anyBranch = junction.branches.values().next().value;
    const [ox, oy] = endPt(outFullFlat[anyBranch.si], anyBranch.jHead);
    out.push({
      refJunction: jKey,
      outJunction: `${Math.round(ox)},${Math.round(oy)}`,
      branchCount: junction.branches.size,
      refOrder,
      outOrder,
      ok: sameCyclic(refOrder, outOrder),
    });
  }
  return out;
}

export function debugRotationAtGrid(refFullFlat, outFullFlat, gx, gy) {
  const jKey = gridKey(gx, gy);
  const junctions = buildJunctionTable(refFullFlat);
  const junction = junctions.get(jKey);
  if (!junction) return { jKey, found: false, branchCount: 0 };
  const r = analyzeJunction(jKey, junction, refFullFlat, outFullFlat);
  const refSpokes = spokesFrom(junction, refFullFlat);
  const outSpokes = spokesFrom(junction, outFullFlat);
  return {
    jKey,
    found: true,
    branchCount: junction.branches.size,
    refEnds: orderedNKeys(refSpokes, refSpokes.map((s) => s.nKey)),
    outEnds: orderedNKeys(outSpokes, refSpokes.map((s) => s.nKey)),
    ok: r.ok,
    flip: r.pairLabel || null,
  };
}
