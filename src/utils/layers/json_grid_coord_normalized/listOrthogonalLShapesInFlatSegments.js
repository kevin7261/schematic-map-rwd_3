/**
 * 在 flat 路網上列舉「正交 L 形」：
 * - 轉折格點：在<strong>完整路網</strong>（相鄰折線段皆計入，含斜線）上度數必為 <strong>2</strong>，且兩邊皆為水平／垂直並互相垂直（僅 L 的兩臂，不可有第三條路線或斜線接在轉角）。
 * - 兩臂：沿 H／V 直線延伸；每到一格，若在完整路網上有任一連線與「當前臂走向」不共線（不同方向），則該格為此臂端點並停止（含該段）。
 * - 單一折線內轉角與多路段端點相接之轉角皆適用；斜線不畫進 orthoBundle，但參與度數與「不同向」判斷。
 */

function num(v) {
  return Math.round(Number(v ?? 0));
}

function getXY(pt) {
  if (Array.isArray(pt)) return [num(pt[0]), num(pt[1])];
  return [num(pt?.x), num(pt?.y)];
}

function pointKeyXY(x, y) {
  return `${x},${y}`;
}

function vec(ax, ay, bx, by) {
  return [bx - ax, by - ay];
}

function isAxisAlignedNonZero(v) {
  const [vx, vy] = v;
  return (vx === 0 && vy !== 0) || (vy === 0 && vx !== 0);
}

/** prev→mid→next 同軸同向延伸 */
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

/** @param {Map<string, Set<string>>} adj */
function deg(adj, key) {
  return adj.has(key) ? adj.get(key).size : 0;
}

function normalizeUndirectedEdgeKey(x0, y0, x1, y1) {
  if (x0 < x1 || (x0 === x1 && y0 < y1)) {
    return `${x0},${y0}|${x1},${y1}`;
  }
  return `${x1},${y1}|${x0},${y0}`;
}

/** 由 pred→u 之臂走向，檢查 u 是否有「不與該走向共線」之其他連線（不同方向即停） */
function hasOffArmEdge(fullAdj, uKey, predKey) {
  const neigh = fullAdj.get(uKey);
  if (!neigh) return false;
  const [ux, uy] = uKey.split(',').map(Number);
  const [px, py] = predKey.split(',').map(Number);
  for (const nb of neigh) {
    if (nb === predKey) continue;
    const [nx, ny] = nb.split(',').map(Number);
    const vx = nx - ux;
    const vy = ny - uy;
    if (vx === 0 && vy === 0) continue;
    const wx = ux - px;
    const wy = uy - py;
    if (wx === 0 && wy === 0) continue;
    if (wx * vy - wy * vx !== 0) return true;
  }
  return false;
}

/** 完整路網：相鄰折線點皆連邊（含斜線） */
function buildFullAdjacency(flatSegments) {
  const adj = new Map();
  const addEdge = (ka, kb) => {
    if (ka === kb) return;
    if (!adj.has(ka)) adj.set(ka, new Set());
    if (!adj.has(kb)) adj.set(kb, new Set());
    adj.get(ka).add(kb);
    adj.get(kb).add(ka);
  };
  for (const seg of flatSegments || []) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = getXY(pts[i]);
      const [x1, y1] = getXY(pts[i + 1]);
      if (x0 === x1 && y0 === y1) continue;
      addEdge(pointKeyXY(x0, y0), pointKeyXY(x1, y1));
    }
  }
  return adj;
}

function buildAxisAlignedAdjacency(flatSegments) {
  const adj = new Map();
  const addEdge = (ka, kb) => {
    if (ka === kb) return;
    if (!adj.has(ka)) adj.set(ka, new Set());
    if (!adj.has(kb)) adj.set(kb, new Set());
    adj.get(ka).add(kb);
    adj.get(kb).add(ka);
  };
  for (const seg of flatSegments || []) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = getXY(pts[i]);
      const [x1, y1] = getXY(pts[i + 1]);
      if (x0 === x1 && y0 === y1) continue;
      if (x0 !== x1 && y0 !== y1) continue;
      addEdge(pointKeyXY(x0, y0), pointKeyXY(x1, y1));
    }
  }
  return adj;
}

/** @returns {Map<string, Array<{ si: number, i: number }>>} */
function buildEdgeOccurrences(flatSegments) {
  const m = new Map();
  for (let si = 0; si < (flatSegments || []).length; si++) {
    const pts = flatSegments[si]?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = getXY(pts[i]);
      const [x1, y1] = getXY(pts[i + 1]);
      if (x0 === x1 && y0 === y1) continue;
      if (x0 !== x1 && y0 !== y1) continue;
      const ek = normalizeUndirectedEdgeKey(x0, y0, x1, y1);
      if (!m.has(ek)) m.set(ek, []);
      m.get(ek).push({ si, i });
    }
  }
  return m;
}

/** 轉角：完整圖度數 2，且兩邊皆為正交並互相垂直 */
function isCleanOrthogonalLCorner(cKey, fullAdj) {
  if (deg(fullAdj, cKey) !== 2) return false;
  const neigh = [...fullAdj.get(cKey)];
  const [cx, cy] = cKey.split(',').map(Number);
  const dirs = [];
  for (const nb of neigh) {
    const [nx, ny] = nb.split(',').map(Number);
    const dx = nx - cx;
    const dy = ny - cy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (!((ax === 0 && ay === 1) || (ax === 1 && ay === 0))) return false;
    dirs.push([dx, dy]);
  }
  if (dirs.length !== 2) return false;
  const [a, b] = dirs;
  return a[0] * b[0] + a[1] * b[1] === 0;
}

/**
 * 從轉角 (cx,cy) 沿 H／V 走向 (nx,ny)，收集正交邊 key；在完整圖上遇「不同向」連線或 H／V 分歧則停。
 */
function walkStraightArmEdgeKeys(cx, cy, nx, ny, hvAdj, fullAdj) {
  const keys = [];
  let px = cx;
  let py = cy;
  let qx = nx;
  let qy = ny;
  const maxSteps = Math.max(8, (hvAdj.size || 0) * 4);
  for (let step = 0; step < maxSteps; step++) {
    const [dx, dy] = [qx - px, qy - py];
    if (!((dx !== 0 && dy === 0) || (dx === 0 && dy !== 0))) break;
    keys.push(normalizeUndirectedEdgeKey(px, py, qx, qy));
    const curKey = pointKeyXY(qx, qy);
    const predKey = pointKeyXY(px, py);
    if (hasOffArmEdge(fullAdj, curKey, predKey)) break;
    if (deg(hvAdj, curKey) !== 2) break;
    const neigh = [...hvAdj.get(curKey)];
    let nxt = null;
    for (const nb of neigh) {
      const [tx, ty] = nb.split(',').map(Number);
      if (tx === px && ty === py) continue;
      const vx = tx - qx;
      const vy = ty - qy;
      const wx = qx - px;
      const wy = qy - py;
      if (wx * vy - wy * vx !== 0) continue;
      if (wx * vx + wy * vy <= 0) continue;
      nxt = [tx, ty];
      break;
    }
    if (!nxt) break;
    px = qx;
    py = qy;
    qx = nxt[0];
    qy = nxt[1];
  }
  return keys;
}

function edgeKeysToOrthoSpecs(edgeKeys, edgeOcc) {
  const specs = [];
  for (const ek of edgeKeys) {
    const occs = edgeOcc.get(ek);
    if (!occs || occs.length === 0) continue;
    const { si, i } = occs[0];
    specs.push(['ortho', si, i, i]);
  }
  return specs;
}

function listGraphCornerLShapes(hvAdj, fullAdj, edgeOcc) {
  const out = [];
  for (const cKey of hvAdj.keys()) {
    const neigh = [...hvAdj.get(cKey)];
    if (neigh.length !== 2) continue;
    if (!isCleanOrthogonalLCorner(cKey, fullAdj)) continue;
    const [cx, cy] = cKey.split(',').map(Number);
    let hNbr = null;
    let vNbr = null;
    for (const nb of neigh) {
      const [nx, ny] = nb.split(',').map(Number);
      if (ny === cy && nx !== cx) hNbr = nb;
      else if (nx === cx && ny !== cy) vNbr = nb;
    }
    if (!hNbr || !vNbr) continue;
    const [hx, hy] = hNbr.split(',').map(Number);
    const [vx, vy] = vNbr.split(',').map(Number);
    const armH = walkStraightArmEdgeKeys(cx, cy, hx, hy, hvAdj, fullAdj);
    const armV = walkStraightArmEdgeKeys(cx, cy, vx, vy, hvAdj, fullAdj);
    const orthoSpecs = [
      ...edgeKeysToOrthoSpecs(armH, edgeOcc),
      ...edgeKeysToOrthoSpecs(armV, edgeOcc),
    ];
    if (orthoSpecs.length === 0) continue;
    out.push({ kind: 'graph', cornerKey: cKey, armHEdgeKeys: armH, armVEdgeKeys: armV, orthoSpecs });
  }
  return out;
}

function extendArmTowardLowIndex(pts, hvAdj, fullAdj, cornerIdx) {
  let k = cornerIdx;
  while (k > 0) {
    const prev = k - 1;
    const [xa, ya] = getXY(pts[prev]);
    const [xb, yb] = getXY(pts[k]);
    if (xa === xb && ya === yb) return k;
    if (xa !== xb && ya !== yb) return k;
    if (k < cornerIdx) {
      const [xc, yc] = getXY(pts[k + 1]);
      if (!straightAligned(xa, ya, xb, yb, xc, yc)) return k;
    }
    const keyP = pointKeyXY(xa, ya);
    const keyFrom = pointKeyXY(xb, yb);
    if (hasOffArmEdge(fullAdj, keyP, keyFrom)) return prev;
    const d = deg(hvAdj, keyP);
    if (d > 2) return prev;
    if (d === 1) return prev;
    if (prev === 0) return 0;
    k = prev;
  }
  return 0;
}

function extendArmTowardHighIndex(pts, hvAdj, fullAdj, cornerIdx) {
  const L = pts.length;
  let k = cornerIdx;
  while (k < L - 1) {
    const next = k + 1;
    const [xa, ya] = getXY(pts[k]);
    const [xb, yb] = getXY(pts[next]);
    if (xa === xb && ya === yb) return k;
    if (xa !== xb && ya !== yb) return k;
    if (k > cornerIdx) {
      const [xc, yc] = getXY(pts[k - 1]);
      if (!straightAligned(xc, yc, xa, ya, xb, yb)) return k;
    }
    const keyN = pointKeyXY(xb, yb);
    const keyFrom = pointKeyXY(xa, ya);
    if (hasOffArmEdge(fullAdj, keyN, keyFrom)) return next;
    const d = deg(hvAdj, keyN);
    if (d > 2) return next;
    if (d === 1) return next;
    if (next === L - 1) return L - 1;
    k = next;
  }
  return L - 1;
}

function orthoBundleHighlightForPolylineLShape(L) {
  const si = Number(L.segIndex);
  const i = Number(L.cornerIdx);
  const lo = Number(L.lowIdx);
  const hi = Number(L.highIdx);
  if (![si, i, lo, hi].every((n) => Number.isFinite(n))) return null;
  if (lo > i || i > hi) return null;
  return [
    'orthoBundle',
    [
      ['ortho', si, lo, i - 1],
      ['ortho', si, i, hi - 1],
    ],
  ];
}

function orthoSpecsDedupeKey(specs) {
  const sorted = [...specs].sort((a, b) => {
    for (let k = 1; k < 4; k++) {
      const na = Number(a[k]);
      const nb = Number(b[k]);
      if (na !== nb) return na - nb;
    }
    return 0;
  });
  return JSON.stringify(sorted);
}

/**
 * @param {Array<object>} flatSegments
 * @returns {Array<
 *   | { segIndex: number, cornerIdx: number, lowIdx: number, highIdx: number }
 *   | { kind: 'graph', cornerKey: string, orthoSpecs: Array<['ortho', number, number, number]> }
 * >}
 */
export function listOrthogonalLShapesInFlatSegments(flatSegments) {
  const out = [];
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return out;
  const fullAdj = buildFullAdjacency(flatSegments);
  const hvAdj = buildAxisAlignedAdjacency(flatSegments);
  const edgeOcc = buildEdgeOccurrences(flatSegments);
  const seen = new Set();

  for (let si = 0; si < flatSegments.length; si++) {
    const pts = flatSegments[si]?.points;
    if (!Array.isArray(pts) || pts.length < 3) continue;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = getXY(pts[i - 1]);
      const [x1, y1] = getXY(pts[i]);
      const [x2, y2] = getXY(pts[i + 1]);
      const v1 = [x1 - x0, y1 - y0];
      const v2 = [x2 - x1, y2 - y1];
      const o1 = v1[0] === 0 && v1[1] !== 0;
      const o1h = v1[1] === 0 && v1[0] !== 0;
      const o2 = v2[0] === 0 && v2[1] !== 0;
      const o2h = v2[1] === 0 && v2[0] !== 0;
      if (!(o1 || o1h) || !(o2 || o2h)) continue;
      if (v1[0] * v2[0] + v1[1] * v2[1] !== 0) continue;

      const cornerKey = pointKeyXY(x1, y1);
      if (!isCleanOrthogonalLCorner(cornerKey, fullAdj)) continue;

      const lowIdx = extendArmTowardLowIndex(pts, hvAdj, fullAdj, i);
      const highIdx = extendArmTowardHighIndex(pts, hvAdj, fullAdj, i);
      const L = { segIndex: si, cornerIdx: i, lowIdx, highIdx };
      const bundle = orthoBundleHighlightForPolylineLShape(L);
      if (!bundle) continue;
      const key = orthoSpecsDedupeKey(bundle[1]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(L);
    }
  }

  for (const g of listGraphCornerLShapes(hvAdj, fullAdj, edgeOcc)) {
    const key = orthoSpecsDedupeKey(g.orthoSpecs);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }

  out.sort((a, b) => {
    const ka = a.cornerKey ?? `${String(a.segIndex).padStart(6, '0')}:${a.cornerIdx}`;
    const kb = b.cornerKey ?? `${String(b.segIndex).padStart(6, '0')}:${b.cornerIdx}`;
    return ka.localeCompare(kb);
  });
  return out;
}

/**
 * @param {
 *   | { segIndex: number, cornerIdx: number, lowIdx: number, highIdx: number }
 *   | { orthoSpecs: Array<['ortho', number, number, number]> }
 * } L
 * @returns {['orthoBundle', Array<['ortho', number, number, number]>] | null}
 */
export function orthoBundleHighlightForLShape(L) {
  if (!L || typeof L !== 'object') return null;
  if (Array.isArray(L.orthoSpecs) && L.orthoSpecs.length > 0) {
    return ['orthoBundle', L.orthoSpecs];
  }
  return orthoBundleHighlightForPolylineLShape(L);
}

export function orthoBundleHighlightForAllLShapes(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const lines = [];
  for (const L of list) {
    const b = orthoBundleHighlightForLShape(L);
    if (b && Array.isArray(b[1])) lines.push(...b[1]);
  }
  if (lines.length === 0) return null;
  return ['orthoBundle', lines];
}
