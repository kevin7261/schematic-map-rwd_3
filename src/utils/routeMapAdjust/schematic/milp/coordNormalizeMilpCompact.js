/**
 * 路線正規化「座標正規化」：整數格吸附 + 安全刪空欄列 + 交叉修正。
 *
 * 1. 紅／黃／藍／粉紅／灰（及紫）骨架節點 snap 至整數格；同位置共點一併更新。
 * 2. 僅刪「整欄／列無上述骨架點」且「無 45° 對角線穿過」之格線。
 * 3. 若壓縮後仍新增交叉，微調可動頂點至最近合法整數格。
 */

const rdP = (p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x ?? 0), Number(p?.y ?? 0)]);
const wrP = (p, x, y) => {
  if (Array.isArray(p)) {
    p[0] = x;
    p[1] = y;
  } else if (p && typeof p === 'object') {
    p.x = x;
    p.y = y;
  }
};
const cz = (ax, ay, bx, by) => ax * by - ay * bx;
const coordKey = (x, y) => `${Number(x).toFixed(4)},${Number(y).toFixed(4)}`;

function syncNodeGrid(node, x, y) {
  if (!node || typeof node !== 'object') return;
  node.x_grid = x;
  node.y_grid = y;
  if (node.tags && typeof node.tags === 'object') {
    node.tags.x_grid = x;
    node.tags.y_grid = y;
  }
}

function isBlackNodeProps(n) {
  if (!n || typeof n !== 'object') return false;
  const t = n.tags || {};
  const kind = String(n.node_kind ?? t.node_kind ?? '').toLowerCase();
  if (kind === 'black') return true;
  const cc = String(t.node_class_color ?? n.node_class_color ?? '').toLowerCase();
  return cc === '#000000' || cc === '#000';
}

/** 紅／黃／藍／粉紅／灰／紫等骨架邊界節點（非黑點）。 */
export function isNonBlackSkeletonProps(n) {
  if (!n || typeof n !== 'object') return false;
  if (isBlackNodeProps(n)) return false;
  const t = n.tags || {};
  const kind = String(n.node_kind ?? t.node_kind ?? '').toLowerCase();
  if (
    kind === 'cross' ||
    kind === 'purple' ||
    kind === 'right_angle_pink' ||
    kind === 'gray' ||
    kind === 'brown'
  ) {
    return true;
  }
  if (n.isCross || n.isPurple || t.isCross || t.isPurple) return true;
  const nt = String(n.node_type ?? t.node_type ?? '').toLowerCase();
  if (nt === 'connect' || nt === 'terminal') return true;
  const cc = String(t.node_class_color ?? n.node_class_color ?? '').toLowerCase();
  return (
    cc === '#ff0000' ||
    cc === '#1565c0' ||
    cc === '#ffd600' ||
    cc === '#9c27b0' ||
    cc === '#e377c2' ||
    cc === '#7f7f7f' ||
    cc === '#9a6324'
  );
}

function vertexProps(seg, idx) {
  const pts = seg.points || [];
  const nodes = seg.nodes || [];
  if (!pts.length || idx < 0 || idx >= pts.length) return null;
  if (nodes.length === pts.length) return nodes[idx] || null;
  if (idx === 0) return seg.properties_start || null;
  if (idx === pts.length - 1) return seg.properties_end || null;
  return nodes[idx] || null;
}

function vertexIsNonBlackSkeleton(seg, idx) {
  return isNonBlackSkeletonProps(vertexProps(seg, idx));
}

/** 兩子邊（不同 section、不共端點）是否「交叉或疊線」。 */
export function pairBad(a, b, c, d) {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  if (Math.abs(cz(rx, ry, sx, sy)) < 1e-9 && Math.abs(cz(rx, ry, c[0] - a[0], c[1] - a[1])) < 1e-9) {
    const L = Math.hypot(rx, ry);
    if (L > 1e-9) {
      const ux = rx / L;
      const uy = ry / L;
      const tb = (b[0] - a[0]) * ux + (b[1] - a[1]) * uy;
      const tc = (c[0] - a[0]) * ux + (c[1] - a[1]) * uy;
      const td = (d[0] - a[0]) * ux + (d[1] - a[1]) * uy;
      const lo = Math.max(Math.min(0, tb), Math.min(tc, td));
      const hi = Math.min(Math.max(0, tb), Math.max(tc, td));
      if (hi - lo > 1e-6) return true;
    }
    return false;
  }
  const d1 = cz(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]);
  const d2 = cz(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]);
  const d3 = cz(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]);
  const d4 = cz(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

/** 整份 flat 的「交叉＋疊線」子邊對數（不同 section、不共端點）。 */
export function countFlatBad(segs) {
  const subs = [];
  segs.forEach((seg, sid) => {
    const pts = (seg.points || []).map(rdP);
    const ep0 = pts.length ? `${pts[0][0]},${pts[0][1]}` : '';
    const epN = pts.length ? `${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}` : '';
    for (let i = 1; i < pts.length; i++) subs.push({ sid, a: pts[i - 1], b: pts[i], ep0, epN });
  });
  let n = 0;
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      if (subs[i].sid === subs[j].sid) continue;
      if (
        subs[i].ep0 === subs[j].ep0 ||
        subs[i].ep0 === subs[j].epN ||
        subs[i].epN === subs[j].ep0 ||
        subs[i].epN === subs[j].epN
      ) {
        continue;
      }
      if (pairBad(subs[i].a, subs[i].b, subs[j].a, subs[j].b)) n++;
    }
  }
  return n;
}

function isDiagEdge(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return dx !== 0 && dy !== 0 && Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-9;
}

/** 45° 對角線穿過之整數格線（刪除會壓歪對角）。 */
function gridLinesCrossedByDiagonals(segs) {
  const cols = new Set();
  const rows = new Set();
  for (const seg of segs) {
    const pts = (seg.points || []).map(rdP);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!isDiagEdge(a, b)) continue;
      const xLo = Math.min(a[0], b[0]);
      const xHi = Math.max(a[0], b[0]);
      const yLo = Math.min(a[1], b[1]);
      const yHi = Math.max(a[1], b[1]);
      for (let c = Math.floor(xLo) + 1; c < Math.ceil(xHi); c++) cols.add(c);
      for (let r = Math.floor(yLo) + 1; r < Math.ceil(yHi); r++) rows.add(r);
    }
  }
  return { cols, rows };
}

function collectBounds(segs) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const seg of segs) {
    for (const p of seg.points || []) {
      const [x, y] = rdP(p);
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < minX) minX = ix;
      if (ix > maxX) maxX = ix;
      if (iy < minY) minY = iy;
      if (iy > maxY) maxY = iy;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

function applyRemapCopy(segs, removeCols, removeRows) {
  const copy = JSON.parse(JSON.stringify(segs));
  const remap = (v, removed) => {
    let s = 0;
    for (const k of removed) {
      if (k < v) s++;
      else break;
    }
    return v - s;
  };
  for (const seg of copy) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = rdP(pts[i]);
      const nx = remap(Math.round(x), removeCols);
      const ny = remap(Math.round(y), removeRows);
      wrP(pts[i], nx, ny);
      if (nodes.length === pts.length && nodes[i]) syncNodeGrid(nodes[i], nx, ny);
    }
    if (seg.properties_start && pts.length) {
      const [nx, ny] = rdP(pts[0]);
      syncNodeGrid(seg.properties_start, nx, ny);
    }
    if (seg.properties_end && pts.length) {
      const [nx, ny] = rdP(pts[pts.length - 1]);
      syncNodeGrid(seg.properties_end, nx, ny);
    }
  }
  return copy;
}

function countLeq(sortedAsc, v) {
  const iv = Math.round(Number(v));
  let c = 0;
  for (const r of sortedAsc) {
    if (r <= iv) c++;
    else break;
  }
  return c;
}

function applyRemapInPlace(segs, removeCols, removeRows) {
  const shift = (iv) => Math.round(Number(iv)) - countLeq(removeCols, iv);
  const shiftY = (iv) => Math.round(Number(iv)) - countLeq(removeRows, iv);
  for (const seg of segs) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = rdP(pts[i]);
      const nx = shift(x);
      const ny = shiftY(y);
      wrP(pts[i], nx, ny);
      if (nodes.length === pts.length && nodes[i]) syncNodeGrid(nodes[i], nx, ny);
    }
    if (seg.properties_start && pts.length) {
      const [nx, ny] = rdP(pts[0]);
      syncNodeGrid(seg.properties_start, nx, ny);
    }
    if (seg.properties_end && pts.length) {
      const [nx, ny] = rdP(pts[pts.length - 1]);
      syncNodeGrid(seg.properties_end, nx, ny);
    }
  }
}

/**
 * 將骨架邊界節點 snap 至整數格；同位置共點同步更新。
 * @returns {number} 調整的共點群組數
 */
export function snapNonBlackSkeletonToIntegerGrid(segs) {
  const groups = collectSkeletonVertexGroups(segs);
  let movedGroups = 0;
  for (const g of groups.values()) {
    const n = g.refs.length;
    let sx = 0;
    let sy = 0;
    for (const { si, pi } of g.refs) {
      const [x, y] = rdP(segs[si].points[pi]);
      sx += x;
      sy += y;
    }
    const px = sx / n;
    const py = sy / n;
    const target = [Math.round(px), Math.round(py)];
    const before = countFlatBad(segs);
    const candidates = [
      target,
      [Math.floor(px), Math.floor(py)],
      [Math.ceil(px), Math.floor(py)],
      [Math.floor(px), Math.ceil(py)],
      [Math.ceil(px), Math.ceil(py)],
    ];
    const seen = new Set();
    let chosen = target;
    for (const c of candidates) {
      const ck = `${c[0]},${c[1]}`;
      if (seen.has(ck)) continue;
      seen.add(ck);
      applyGroupCoord(segs, g.refs, c[0], c[1]);
      if (countFlatBad(segs) <= before) {
        chosen = c;
        break;
      }
      applyGroupCoord(segs, g.refs, Math.round(px), Math.round(py));
    }
    applyGroupCoord(segs, g.refs, chosen[0], chosen[1]);
    if (chosen[0] !== Math.round(px) || chosen[1] !== Math.round(py)) movedGroups++;
  }
  return movedGroups;
}

/**
 * 安全刪空欄列：無紅/黃/藍/粉紅/灰骨架點、無對角穿過，且合併後不新增交叉。
 */
export function compactEmptyGridLinesSafe(segs, crossBaseline = 0) {
  const bounds = collectBounds(segs);
  if (!bounds) return { removedCols: 0, removedRows: 0, removedColList: [], removedRowList: [] };

  const { minX, maxX, minY, maxY } = bounds;
  const colHasSkeleton = new Set();
  const rowHasSkeleton = new Set();
  for (const seg of segs) {
    const pts = seg.points || [];
    for (let i = 0; i < pts.length; i++) {
      if (!vertexIsNonBlackSkeleton(seg, i)) continue;
      const [x, y] = rdP(pts[i]);
      colHasSkeleton.add(Math.round(x));
      rowHasSkeleton.add(Math.round(y));
    }
  }

  const diagProtect = gridLinesCrossedByDiagonals(segs);
  let removeCols = [];
  for (let x = minX; x <= maxX; x++) {
    if (colHasSkeleton.has(x)) continue;
    if (diagProtect.cols.has(x)) continue;
    removeCols.push(x);
  }
  let removeRows = [];
  for (let y = minY; y <= maxY; y++) {
    if (rowHasSkeleton.has(y)) continue;
    if (diagProtect.rows.has(y)) continue;
    removeRows.push(y);
  }

  while (removeCols.length + removeRows.length > 0) {
    const trial = applyRemapCopy(segs, removeCols, removeRows);
    if (countFlatBad(trial) <= crossBaseline) break;
    if (removeRows.length > 0) removeRows.pop();
    else if (removeCols.length > 0) removeCols.pop();
    else break;
  }

  if (removeCols.length === 0 && removeRows.length === 0) {
    return { removedCols: 0, removedRows: 0, removedColList: [], removedRowList: [] };
  }

  applyRemapInPlace(segs, removeCols, removeRows);
  return {
    removedCols: removeCols.length,
    removedRows: removeRows.length,
    removedColList: removeCols,
    removedRowList: removeRows,
  };
}

function collectSkeletonVertexGroups(segs) {
  const groups = new Map();
  segs.forEach((seg, si) => {
    const pts = seg.points || [];
    for (let pi = 0; pi < pts.length; pi++) {
      if (!vertexIsNonBlackSkeleton(seg, pi)) continue;
      const [x, y] = rdP(pts[pi]);
      const k = coordKey(x, y);
      let g = groups.get(k);
      if (!g) {
        g = { refs: [], x, y };
        groups.set(k, g);
      }
      g.refs.push({ si, pi });
    }
  });
  return groups;
}

function applyGroupCoord(segs, refs, x, y) {
  for (const { si, pi } of refs) {
    const seg = segs[si];
    const pts = seg.points || [];
    wrP(pts[pi], x, y);
    const nodes = seg.nodes || [];
    if (nodes.length === pts.length && nodes[pi]) syncNodeGrid(nodes[pi], x, y);
    if (pi === 0 && seg.properties_start) syncNodeGrid(seg.properties_start, x, y);
    if (pi === pts.length - 1 && seg.properties_end) syncNodeGrid(seg.properties_end, x, y);
  }
}

/**
 * 若正規化後交叉數高於基線，微調可動骨架頂點（±1 曼哈頓鄰格）；同位置共點一併移動。
 * @returns {number} 成功修正的共點群組數
 */
export function resolveIntroducedCrossings(segs, crossBaseline, maxPasses = 48) {
  let fixed = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    if (countFlatBad(segs) <= crossBaseline) break;
    let improved = false;
    const groups = collectSkeletonVertexGroups(segs);
    for (const g of groups.values()) {
      const before = countFlatBad(segs);
      if (before <= crossBaseline) break;
      const ox = Math.round(g.x);
      const oy = Math.round(g.y);
      const deltas = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ];
      for (const [dx, dy] of deltas) {
        const nx = ox + dx;
        const ny = oy + dy;
        applyGroupCoord(segs, g.refs, nx, ny);
        const after = countFlatBad(segs);
        if (after < before && after <= crossBaseline) {
          fixed++;
          improved = true;
          g.x = nx;
          g.y = ny;
          break;
        }
        applyGroupCoord(segs, g.refs, ox, oy);
      }
    }
    if (!improved) break;
  }
  return fixed;
}
