/**
 * 座標正規化後「相對鄰路線錯邊」比對與修正（c3 vs d3）
 *
 * 只檢查：頂點相對他路線有向線段是否從正規化前一側跑到另一側（如南勢角、淡水站）。
 * 「修正」：將該頂點移至鄰線正確半平面內之格點；若可與前後鄰點形成水平／垂直折線則優先選離原點最近者，否則取任意最近合法格點，再退到法向微移。
 */

import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function num(v) {
  return Number(v ?? 0);
}

function toPt(raw) {
  if (Array.isArray(raw)) return { x: num(raw[0]), y: num(raw[1]) };
  return { x: num(raw?.x), y: num(raw?.y) };
}

function clean(s) {
  const t = String(s ?? '').trim();
  return t === '—' || t === '－' ? '' : t;
}

/** 取得某段某頂點的車站顯示名 */
function stationAt(seg, pi, nPts) {
  const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
  if (nodes.length === nPts && nodes[pi] && typeof nodes[pi] === 'object') {
    const n = nodes[pi];
    const sn = clean(n.station_name ?? n.tags?.station_name ?? n.tags?.name ?? '');
    const cn = n.connect_number ?? n.tags?.connect_number;
    if (sn && cn != null && String(cn) !== '') return `${sn}(轉乘#${cn})`;
    if (sn) return sn;
    if (cn != null && String(cn) !== '') return `轉乘#${cn}`;
    if (n.node_type === 'connect') return '轉乘點';
  }
  if (pi === 0 && seg?.properties_start) {
    const sn = clean(
      seg.properties_start.station_name ?? seg.properties_start.tags?.station_name ?? ''
    );
    if (sn) return sn;
  }
  if (pi === nPts - 1 && seg?.properties_end) {
    const sn = clean(
      seg.properties_end.station_name ?? seg.properties_end.tags?.station_name ?? ''
    );
    if (sn) return sn;
  }
  return '';
}

/**
 * @typedef {{
 *   pts: Array<{x:number,y:number}>,
 *   routeName: string,
 *   sNames: string[],
 *   flatSegIndex: number,
 * }} Run
 */

/** 將路段資料展平為 Run 陣列（含 flat 原索引） */
function toRuns(rawSegs) {
  const flat = normalizeSpaceNetworkDataToFlatSegments(Array.isArray(rawSegs) ? rawSegs : []);
  const out = [];
  for (let k = 0; k < flat.length; k++) {
    const seg = flat[k];
    const pts = (seg.points || []).map(toPt);
    if (pts.length < 2) continue;
    const routeName = clean(seg.route_name ?? seg.name ?? '') || `路段#${k}`;
    out.push({
      pts,
      routeName,
      sNames: pts.map((_, pi) => stationAt(seg, pi, pts.length)),
      flatSegIndex: k,
    });
  }
  return out;
}

function pFmt(p) {
  return `(${Math.round(p.x)},${Math.round(p.y)})`;
}

function vLabel(run, pi) {
  const sn = run.sNames[pi];
  const loc = pFmt(run.pts[pi]);
  return sn
    ? `路線「${run.routeName}」車站「${sn}」${loc}`
    : `路線「${run.routeName}」第${pi}點 ${loc}`;
}

function eLabel(run, ei) {
  const a = run.sNames[ei] ? `「${run.sNames[ei]}」${pFmt(run.pts[ei])}` : pFmt(run.pts[ei]);
  const b = run.sNames[ei + 1]
    ? `「${run.sNames[ei + 1]}」${pFmt(run.pts[ei + 1])}`
    : pFmt(run.pts[ei + 1]);
  return `路線「${run.routeName}」${a}→${b}`;
}

// ─── 幾何 ───────────────────────────────────────────────────────────────────

const EPS = 1e-9;

function cross2d(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function distSegFoot(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) {
    const ex = p.x - a.x,
      ey = p.y - a.y;
    return { dist2: ex * ex + ey * ey, t: 0 };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = a.x + t * dx,
    cy = a.y + t * dy;
  const ex = p.x - cx,
    ey = p.y - cy;
  return { dist2: ex * ex + ey * ey, t };
}

function sideOfEdge(p, a, b) {
  const z = cross2d(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < EPS) return 0;
  if (Math.abs(z) < len * 2e-8) return 0;
  return z > 0 ? 1 : -1;
}

function bboxMaxSpan(runs) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of runs) {
    for (const q of r.pts) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
  }
  const sx = maxX - minX;
  const sy = maxY - minY;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return 800;
  return Math.max(sx, sy, 1);
}

/**
 * @typedef {{ ri: number, ei: number, p1: {x:number,y:number}, p2: {x:number,y:number}, run: Run }} Edge
 */

function mkEdges(runs) {
  /** @type {Edge[]} */
  const E = [];
  for (let ri = 0; ri < runs.length; ri++) {
    for (let ei = 0; ei + 1 < runs[ri].pts.length; ei++) {
      E.push({ ri, ei, p1: runs[ri].pts[ei], p2: runs[ri].pts[ei + 1], run: runs[ri] });
    }
  }
  return E;
}

function dist2xy(ax, ay, bx, by) {
  const dx = ax - bx,
    dy = ay - by;
  return dx * dx + dy * dy;
}

/** 兩點連線是否為水平或垂直（網格四捨五入後與整數格點 cand 對齊） */
function edgeIsAxisAlignedGrid(p, q) {
  const px = Math.round(p.x),
    py = Math.round(p.y);
  const qx = Math.round(q.x),
    qy = Math.round(q.y);
  return px === qx || py === qy;
}

/**
 * 移動後頂點若與鄰接點形成之兩段（或端點一段）皆為水平／垂直折線。
 */
function vertexNeighborsOrthoOk(prev, cand, next, pi, nPts) {
  if (nPts < 2) return true;
  if (pi <= 0) {
    return !!(next && edgeIsAxisAlignedGrid(cand, next));
  }
  if (pi >= nPts - 1) {
    return !!(prev && edgeIsAxisAlignedGrid(prev, cand));
  }
  return (
    !!(prev && edgeIsAxisAlignedGrid(prev, cand)) && !!(next && edgeIsAxisAlignedGrid(cand, next))
  );
}

/**
 * 在鄰線正確半平面上搜尋格點：優先「本線與前後鄰接段皆水平或垂直」且離 vd 最近者；
 * 若無則取半平面內離 vd 任意最近格點；搜尋框內仍無則回傳 null（改由呼叫端用法向啟發）。
 */
function nearestGridOnNeighborSidePreferOrtho(vd, a, b, targetSign, prev, next, pi, nPts, searchR) {
  const R = Math.max(8, Math.min(searchR ?? 56, 120));
  let bestAny = null;
  let bestAnyD = Infinity;
  let bestOrtho = null;
  let bestOrthoD = Infinity;
  const vdx = vd.x,
    vdy = vd.y;
  const bx = Math.round(vdx);
  const by = Math.round(vdy);

  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      const ox = bx + dx;
      const oy = by + dy;
      const cand = { x: ox, y: oy };
      if (sideOfEdge(cand, a, b) !== targetSign) continue;
      const d = dist2xy(ox, oy, vdx, vdy);
      if (d < bestAnyD) {
        bestAnyD = d;
        bestAny = cand;
      }
      if (vertexNeighborsOrthoOk(prev, cand, next, pi, nPts) && d < bestOrthoD) {
        bestOrthoD = d;
        bestOrtho = cand;
      }
    }
  }

  if (bestOrtho) return bestOrtho;
  return bestAny;
}

/**
 * 對鄰線 d3 邊段，將頂點做最小法向位移，使 sideOf 與 c3 參考側 targetSign 一致；輸出格點整數。
 *
 * @param {{x:number,y:number}} vd
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b  正規化後鄰線有向邊
 * @param {number} targetSign  +1 | -1（來自 c3 相對同一條邊索引的側向）
 */
function minimalGridMoveToSide(vd, a, b, targetSign) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS || (targetSign !== 1 && targetSign !== -1)) return null;

  const nx = -dy / len,
    ny = dx / len;
  const crossEn = len;

  const Z = cross2d(dx, dy, vd.x - a.x, vd.y - a.y);
  const cur = Z > len * 2e-8 ? 1 : Z < -len * 2e-8 ? -1 : 0;

  if (cur === targetSign && cur !== 0) {
    const rx = Math.round(vd.x),
      ry = Math.round(vd.y);
    if (sideOfEdge({ x: rx, y: ry }, a, b) === targetSign) return { x: rx, y: ry };
  }

  const margin = Math.max(len * 1e-5, 0.05);
  const Ztarget = targetSign * Math.max(len * 3e-7, margin);
  const s = (Ztarget - Z) / crossEn;

  const tryPt = (x, y) => {
    const p = { x, y };
    const qx = Math.round(p.x),
      qy = Math.round(p.y);
    const rr = { x: qx, y: qy };
    if (sideOfEdge(rr, a, b) === targetSign) return rr;
    for (let step = 1; step <= 12; step++) {
      const dirs = [
        [0, step],
        [0, -step],
        [step, 0],
        [-step, 0],
        [step, step],
        [step, -step],
        [-step, step],
        [-step, -step],
      ];
      for (const [ex, ey] of dirs) {
        const tx = qx + ex,
          ty = qy + ey;
        if (sideOfEdge({ x: tx, y: ty }, a, b) === targetSign) return { x: tx, y: ty };
      }
    }
    return null;
  };

  let cand = tryPt(vd.x + nx * s, vd.y + ny * s);
  if (cand) return cand;
  cand = tryPt(vd.x - nx * s, vd.y - ny * s);
  return cand;
}

/**
 * 先嘗試「正側＋與前後鄰點構成水平／垂直折線」之最近格點，否則正側任意最近，最後法向啟發。
 */
function gridMoveToSidePreferOrtho(vd, a, b, targetSign, prev, next, pi, nPts) {
  const g = nearestGridOnNeighborSidePreferOrtho(vd, a, b, targetSign, prev, next, pi, nPts, 72);
  if (g) return g;
  return minimalGridMoveToSide(vd, a, b, targetSign);
}

function setFlatPointMutate(flatSeg, pi, x, y) {
  const pts = flatSeg.points;
  if (!Array.isArray(pts) || pi < 0 || pi >= pts.length) return false;
  const p = pts[pi];
  if (Array.isArray(p)) {
    p[0] = x;
    p[1] = y;
    return true;
  }
  if (p && typeof p === 'object') {
    p.x = x;
    p.y = y;
    return true;
  }
  return false;
}

/**
 * 掃描「相對鄰線錯邊」（與 collectNeighborSideFlips 同判据；可多筆）。
 */
function collectNeighborFlipRecords(C, D, EC, ED, opts) {
  const { maxRecords = 80, rFactor = 0.068, rFloor = 22 } = opts || {};

  const records = [];
  const reasons = [];
  if (!C.length || EC.length !== ED.length) return { records, reasons };

  const span = Math.max(bboxMaxSpan(C), bboxMaxSpan(D));
  const Rnear = Math.max(rFloor, span * rFactor);
  const Rnear2 = Rnear * Rnear;

  const orderVerts = [];
  for (let ri = 0; ri < C.length; ri++) {
    for (let pi = 0; pi < C[ri].pts.length; pi++) {
      orderVerts.push({ ri, pi, named: !!C[ri].sNames[pi] });
    }
  }
  orderVerts.sort((a, b) => Number(b.named) - Number(a.named));

  const seenVtx = new Set();

  for (const { ri, pi } of orderVerts) {
    if (records.length >= maxRecords) break;

    const vKey = `${ri}_${pi}`;
    if (seenVtx.has(vKey)) continue;

    const vc = C[ri].pts[pi];
    const vd = D[ri].pts[pi];

    let bestK = -1;
    let bestSumD2 = Infinity;
    const edgeEps = 1e-5;

    for (let k = 0; k < EC.length; k++) {
      if (EC[k].ri === ri) continue;

      const ebc = EC[k];
      const ebd = ED[k];

      const fc = distSegFoot(vc, ebc.p1, ebc.p2);
      const fd = distSegFoot(vd, ebd.p1, ebd.p2);

      if (fc.dist2 > Rnear2 || fd.dist2 > Rnear2) continue;
      if (fc.t <= edgeEps || fc.t >= 1 - edgeEps || fd.t <= edgeEps || fd.t >= 1 - edgeEps)
        continue;

      const zc = sideOfEdge(vc, ebc.p1, ebc.p2);
      const zd = sideOfEdge(vd, ebd.p1, ebd.p2);
      if (zc === 0 || zd === 0 || zc === zd) continue;

      const sumD = fc.dist2 + fd.dist2;
      if (sumD < bestSumD2) {
        bestSumD2 = sumD;
        bestK = k;
      }
    }

    if (bestK < 0) continue;

    seenVtx.add(vKey);
    const ebd = ED[bestK];
    const distShow = Math.sqrt(
      Math.min(
        distSegFoot(vc, EC[bestK].p1, EC[bestK].p2).dist2,
        distSegFoot(vd, ebd.p1, ebd.p2).dist2
      )
    );

    const rec = {
      ri,
      pi,
      flatSegIndex: D[ri].flatSegIndex,
      edgeK: bestK,
      vc: { x: vc.x, y: vc.y },
      vd: { x: vd.x, y: vd.y },
      neighborLabel: eLabel(ebd.run, ebd.ei),
    };
    records.push(rec);

    reasons.push(
      `相對鄰線錯邊：` +
        `${vLabel(D[ri], pi)}；` +
        `參考鄰線 ${rec.neighborLabel}（頂點距該線約 ${distShow.toFixed(1)} 格）。` +
        `正規化前後分列該直線兩側（已跑到鄰線另一邊）。`
    );
  }

  return { records, reasons };
}

/**
 * 僅「鄰線錯邊」比對（給 UI 與修正後驗證）。
 * @param {unknown[]} c3Segments
 * @param {unknown[]} d3Segments
 */
export function analyzeCoordNormalizeTopology(c3Segments, d3Segments) {
  const C = toRuns(c3Segments);
  const D = toRuns(d3Segments);

  const out = {
    skipped: false,
    topologyPreserved: true,
    summaryZh: '',
    reasons: /** @type {string[]} */ ([]),
    neighborFlipCount: 0,
    nonDegree2VertexCountBefore: 0,
    nonDegree2VertexCountAfter: 0,
    componentCountBefore: 0,
    componentCountAfter: 0,
    statsCaptionZh: '',
    /** 若有錯邊，按鈕「修正」可執行 */
    hasNeighborFlips: false,
    structMatch: false,
  };

  if (!C.length || !D.length) {
    out.skipped = true;
    out.summaryZh = '路網資料為空，略過相鄰錯邊比對。';
    return out;
  }

  let structMatch = C.length === D.length;
  if (!structMatch) {
    out.topologyPreserved = false;
    out.reasons.push(
      `路段數不同：正規化前 ${C.length} 段、後 ${D.length} 段，無法做鄰線錯邊對照。`
    );
  } else {
    for (let i = 0; i < C.length; i++) {
      if (C[i].pts.length !== D[i].pts.length) {
        structMatch = false;
        out.topologyPreserved = false;
        out.reasons.push(
          `路線「${C[i].routeName}」折線頂點數改變：${C[i].pts.length} → ${D[i].pts.length}，無法對點位做錯邊對照。`
        );
      }
    }
  }

  out.structMatch = structMatch;

  const EC = mkEdges(C);
  const ED = mkEdges(D);

  if (structMatch) {
    const { reasons, records } = collectNeighborFlipRecords(C, D, EC, ED, {
      maxRecords: 80,
    });
    out.reasons.push(...reasons);
    out.neighborFlipCount = records.length;
    out.hasNeighborFlips = records.length > 0;
    if (records.length > 0) out.topologyPreserved = false;
  } else {
    out.hasNeighborFlips = false;
  }

  if (out.topologyPreserved) {
    out.summaryZh = '未偵測到頂點相對鄰路線「錯邊」（位移到另一側）之情事。';
  } else if (out.neighborFlipCount > 0) {
    out.summaryZh = `偵測到 ${out.neighborFlipCount} 處相對鄰線錯邊（點位移到鄰線另一側），詳見列表。`;
  } else {
    out.summaryZh =
      out.reasons.length > 0 ? out.reasons[0] + '（詳見列表）。' : '比對發現問題，請見列表。';
  }

  out.statsCaptionZh = `僅檢查「相對他路線邊」之左右側錯位；路線 ${C.length} 條、折線段 ${EC.length}；有站名頂點優先掃描。`;

  return out;
}

/**
 * 將 d3 路網中錯邊頂點逐一修正（最小法向位移至正確半平面），每步重驗，不可留下錯邊。
 *
 * @param {unknown[]} c3Segments  正規化前參考（只讀）
 * @param {unknown[]} d3Segments  會被深拷貝後修改
 * @returns {{
 *   ok: boolean,
 *   patched: unknown[],
 *   moveLines: string[],
 *   iterations: number,
 *   topologyCheck: ReturnType<typeof analyzeCoordNormalizeTopology>,
 *   errorZh?: string,
 * }}
 */
export function applyNeighborSideTopologyFix(c3Segments, d3Segments) {
  const emptyTc = () =>
    analyzeCoordNormalizeTopology(c3Segments, Array.isArray(d3Segments) ? d3Segments : []);

  if (!Array.isArray(d3Segments) || d3Segments.length === 0) {
    return {
      ok: false,
      patched: [],
      moveLines: [],
      iterations: 0,
      topologyCheck: emptyTc(),
      errorZh: 'd3 路網為空，無法修正。',
    };
  }

  const patched = JSON.parse(JSON.stringify(d3Segments));
  const moveLines = /** @type {string[]} */ ([]);
  const maxIter = 500;
  let stepCount = 0;

  while (stepCount < maxIter) {
    const C = toRuns(c3Segments);
    const D = toRuns(patched);
    const EC = mkEdges(C);
    const ED = mkEdges(D);
    const { records } = collectNeighborFlipRecords(C, D, EC, ED, { maxRecords: 1 });
    if (records.length === 0) break;

    const r = records[0];
    const ebc = EC[r.edgeK];
    const ebd = ED[r.edgeK];
    const targetSign = sideOfEdge(r.vc, ebc.p1, ebc.p2);
    if (targetSign !== 1 && targetSign !== -1) {
      return {
        ok: false,
        patched,
        moveLines,
        iterations: stepCount,
        topologyCheck: analyzeCoordNormalizeTopology(c3Segments, patched),
        errorZh: `頂點 ${vLabel(D[r.ri], r.pi)} 在參考鄰線上幾乎共線，無法自動決定要移向哪一側，請手動調整。`,
      };
    }

    const vd = D[r.ri].pts[r.pi];
    const runPts = D[r.ri].pts;
    const nRun = runPts.length;
    const prevV = r.pi > 0 ? runPts[r.pi - 1] : null;
    const nextV = r.pi + 1 < nRun ? runPts[r.pi + 1] : null;
    const newPt = gridMoveToSidePreferOrtho(vd, ebd.p1, ebd.p2, targetSign, prevV, nextV, r.pi, nRun);
    if (!newPt) {
      return {
        ok: false,
        patched,
        moveLines,
        iterations: stepCount,
        topologyCheck: analyzeCoordNormalizeTopology(c3Segments, patched),
        errorZh: `無法為 ${vLabel(D[r.ri], r.pi)} 計算最近合法格點（鄰線可能過短）。`,
      };
    }

    const flatArr = normalizeSpaceNetworkDataToFlatSegments(patched);
    const seg = flatArr[r.flatSegIndex];
    if (!seg?.points?.[r.pi]) {
      return {
        ok: false,
        patched,
        moveLines,
        iterations: stepCount,
        topologyCheck: analyzeCoordNormalizeTopology(c3Segments, patched),
        errorZh: '內部索引與路網結構不一致，無法寫入該頂點。',
      };
    }

    const beforeFmt = pFmt(vd);
    if (!setFlatPointMutate(seg, r.pi, newPt.x, newPt.y)) {
      return {
        ok: false,
        patched,
        moveLines,
        iterations: stepCount,
        topologyCheck: analyzeCoordNormalizeTopology(c3Segments, patched),
        errorZh: '寫入座標失敗（頂點格式非 [x,y] 或 {x,y}）。',
      };
    }

    moveLines.push(
      `網格座標（移動前 → 移動後）${beforeFmt} → ${pFmt(newPt)}；本線頂點 ${vLabel(
        D[r.ri],
        r.pi
      )}；參照鄰線 ${r.neighborLabel}`
    );
    stepCount++;
  }

  const topologyCheck = analyzeCoordNormalizeTopology(c3Segments, patched);
  const ok = topologyCheck.topologyPreserved && !topologyCheck.hasNeighborFlips;

  if (!ok && topologyCheck.hasNeighborFlips) {
    return {
      ok: false,
      patched,
      moveLines,
      iterations: stepCount,
      topologyCheck,
      errorZh:
        stepCount >= maxIter
          ? `已處理 ${maxIter} 次仍無法完全消除鄰線錯邊（可能互相牽制），請手動微調剩餘頂點。`
          : `修正後仍有鄰線錯邊，請檢查路網或手動調整。`,
    };
  }

  return { ok, patched, moveLines, iterations: stepCount, topologyCheck };
}
