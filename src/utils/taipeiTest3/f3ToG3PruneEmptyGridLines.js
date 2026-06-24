/**
 * taipei_d3 → taipei_e3：刪除「沒有任何紅／藍點（connect）」的整欄或整列，並壓縮座標
 *
 * - 紅／藍在資料上皆為 node_type === 'connect'（或具 connect_number）
 * - 僅 line（黑點）佔用的 row／col 可刪
 * - 壓縮：對每個整數座標 x、y，new = old − (# 被刪的 col／row 索引 ≤ old)
 */

/* eslint-disable no-console */

const getXY = (pt) =>
  Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : [Number(pt?.x ?? 0), Number(pt?.y ?? 0)];

function isConnectProps(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.node_type === 'connect') return true;
  if (n.connect_number != null) return true;
  const t = n.tags || {};
  if (t.node_type === 'connect') return true;
  if (t.connect_number != null) return true;
  return false;
}

/** 第 idx 個頂點是否為 connect（紅或藍） */
function vertexIsConnect(seg, idx) {
  const pts = seg.points || [];
  const nodes = seg.nodes || [];
  if (!pts.length || idx < 0 || idx >= pts.length) return false;
  if (nodes.length === pts.length) {
    return isConnectProps(nodes[idx] || {});
  }
  if (idx === 0) return isConnectProps(seg.properties_start || {});
  if (idx === pts.length - 1) return isConnectProps(seg.properties_end || {});
  return false;
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

function shiftCoord(iv, removedSortedAsc) {
  return Math.round(Number(iv)) - countLeq(removedSortedAsc, iv);
}

function updateNodeGrid(node, x, y) {
  if (node.x_grid !== undefined) node.x_grid = x;
  if (node.y_grid !== undefined) node.y_grid = y;
  if (node.tags) {
    if (node.tags.x_grid !== undefined) node.tags.x_grid = x;
    if (node.tags.y_grid !== undefined) node.tags.y_grid = y;
  }
}

/**
 * @param {Array} segments - 路段（請先 deep copy）
 * @returns {{
 *   segments: Array,
 *   removedCols: number[],
 *   removedRows: number[],
 *   colCount: number,
 *   rowCount: number,
 * }}
 */
export function pruneGridLinesWithoutConnectVertices(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { segments: [], removedCols: [], removedRows: [], colCount: 0, rowCount: 0 };
  }

  const colHasConnect = new Set();
  const rowHasConnect = new Set();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const seg of segments) {
    const pts = seg.points || [];
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = getXY(pts[i]);
      const ix = Math.round(x);
      const iy = Math.round(y);
      minX = Math.min(minX, ix);
      maxX = Math.max(maxX, ix);
      minY = Math.min(minY, iy);
      maxY = Math.max(maxY, iy);
      if (vertexIsConnect(seg, i)) {
        colHasConnect.add(ix);
        rowHasConnect.add(iy);
      }
    }
  }

  if (!Number.isFinite(minX)) {
    return { segments, removedCols: [], removedRows: [], colCount: 0, rowCount: 0 };
  }

  const removedCols = [];
  for (let x = minX; x <= maxX; x++) {
    if (!colHasConnect.has(x)) removedCols.push(x);
  }
  const removedRows = [];
  for (let y = minY; y <= maxY; y++) {
    if (!rowHasConnect.has(y)) removedRows.push(y);
  }

  if (removedCols.length === 0 && removedRows.length === 0) {
    console.log('[d3→e3] 無需刪除的空欄／列。');
    return {
      segments,
      removedCols,
      removedRows,
      colCount: 0,
      rowCount: 0,
    };
  }

  for (const seg of segments) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    const newPts = pts.map((pt) => {
      const [x, y] = getXY(pt);
      const nx = shiftCoord(x, removedCols);
      const ny = shiftCoord(y, removedRows);
      if (Array.isArray(pt) && pt.length > 2) {
        return [nx, ny, pt[2]];
      }
      return [nx, ny];
    });
    seg.points = newPts;

    if (nodes.length === newPts.length) {
      for (let i = 0; i < nodes.length; i++) {
        const [nx, ny] = getXY(newPts[i]);
        updateNodeGrid(nodes[i], nx, ny);
      }
    }
    if (seg.properties_start) {
      const [nx, ny] = getXY(newPts[0]);
      updateNodeGrid(seg.properties_start, nx, ny);
    }
    if (seg.properties_end) {
      const [nx, ny] = getXY(newPts[newPts.length - 1]);
      updateNodeGrid(seg.properties_end, nx, ny);
    }
  }

  console.log(
    `[d3→e3] 刪除 ${removedCols.length} 欄、${removedRows.length} 列（無 connect 頂點）。`
  );
  return {
    segments,
    removedCols,
    removedRows,
    colCount: removedCols.length,
    rowCount: removedRows.length,
  };
}
