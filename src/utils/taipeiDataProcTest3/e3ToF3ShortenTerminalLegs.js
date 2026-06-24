/**
 * taipei_e3 → taipei_f3：縮短末端路段（藍點→紅點之間只保留 1 單位長）
 *
 * 規則：
 * - 「末端點」(藍) = connect 節點中 degree ≤ 1（在折線邊上只連著 1 條邊）
 * - 「交叉點」(紅) = connect 節點中 degree ≥ 2
 * - 對每個「一端是末端、另一端是交叉」的路段：
 *     1. 候選新末端 = 距離 anchor（紅點）曼哈頓 1、且往原末端方向（先依 |dx|≥|dy| 決定主軸，次選另一軸）
 *     2. 路段縮成 2 點，nodes 同步頭尾
 * - 絕對不可與**其他路線**幾何重疊：
 *     · 新末端座標不可與其他路段之任一頂點重合
 *     · 新邊 (新末端—anchor) 不可與其他路段之任一邊重合
 *     · 新末端不可落在其他路段任一邊之內部（共線且介於兩端之間）
 * - 若所有候選皆衝突 → 該路段維持原狀
 * - 兩端皆末端的孤立路段：不處理
 */

/* eslint-disable no-console */

const ptKey = (x, y) => `${Math.round(Number(x))},${Math.round(Number(y))}`;

const getXY = (pt) =>
  Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : [Number(pt?.x ?? 0), Number(pt?.y ?? 0)];

/** 無向邊鍵（兩端點 key 排序） */
function undirectedEdgeKey(ax, ay, bx, by) {
  const k1 = ptKey(ax, ay);
  const k2 = ptKey(bx, by);
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

/**
 * (px,py) 是否落在線段 (ax,ay)-(bx,by) 上（軸對齊），且不與端點重合
 */
function pointStrictlyOnAxisAlignedEdgeInterior(px, py, ax, ay, bx, by) {
  const x1 = Math.round(ax);
  const y1 = Math.round(ay);
  const x2 = Math.round(bx);
  const y2 = Math.round(by);
  const ix = Math.round(px);
  const iy = Math.round(py);
  if (y1 === y2 && iy === y1) {
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    return ix > lo && ix < hi;
  }
  if (x1 === x2 && ix === x1) {
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    return iy > lo && iy < hi;
  }
  return false;
}

/**
 * 候選新末端：曼哈頓距離 anchor 為 1，盡量往原 terminal 方向；最多兩個（主軸優先）
 */
function candidateTerminalPositions(termX, termY, anchorX, anchorY) {
  const dx = anchorX - termX;
  const dy = anchorY - termY;
  if (dx === 0 && dy === 0) return [];

  const out = [];
  const pushUnique = (x, y) => {
    const k = ptKey(x, y);
    if (!out.some(([ox, oy]) => ptKey(ox, oy) === k)) {
      out.push([x, y]);
    }
  };

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) pushUnique(anchorX - Math.sign(dx), anchorY);
    if (dy !== 0) pushUnique(anchorX, anchorY - Math.sign(dy));
  } else {
    if (dy !== 0) pushUnique(anchorX, anchorY - Math.sign(dy));
    if (dx !== 0) pushUnique(anchorX - Math.sign(dx), anchorY);
  }
  return out;
}

/**
 * 新末端 (tx,ty) 與 anchor (ax,ay) 是否與 excludeIdx 以外之路網衝突
 */
function overlapsOtherRoutes(tx, ty, ax, ay, excludeIdx, segments) {
  const kNew = ptKey(tx, ty);
  const newEdgeKey = undirectedEdgeKey(tx, ty, ax, ay);

  for (let j = 0; j < segments.length; j++) {
    if (j === excludeIdx) continue;
    const pts = segments[j].points || [];
    for (let i = 0; i < pts.length; i++) {
      const [vx, vy] = getXY(pts[i]);
      if (ptKey(vx, vy) === kNew) return true;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [px, py] = getXY(pts[i]);
      const [qx, qy] = getXY(pts[i + 1]);
      if (undirectedEdgeKey(px, py, qx, qy) === newEdgeKey) return true;
      if (pointStrictlyOnAxisAlignedEdgeInterior(tx, ty, px, py, qx, qy)) return true;
    }
  }
  return false;
}

/** 更新 node 物件中的 x_grid / y_grid（若原本存在） */
function updateNodeCoord(node, x, y) {
  if (node.x_grid !== undefined) node.x_grid = x;
  if (node.y_grid !== undefined) node.y_grid = y;
  if (node.tags) {
    if (node.tags.x_grid !== undefined) node.tags.x_grid = x;
    if (node.tags.y_grid !== undefined) node.tags.y_grid = y;
  }
}

/**
 * @param {Array} segments - 路段陣列（請先 deep copy 再傳入）
 * @returns {{ segments: Array, terminalShortenedCount: number, skippedOverlapCount: number }}
 */
export function shortenTerminalLegsInNetwork(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { segments: [], terminalShortenedCount: 0, skippedOverlapCount: 0 };
  }

  const degreeMap = new Map();
  for (const seg of segments) {
    const pts = seg.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = getXY(pts[i]);
      const [bx, by] = getXY(pts[i + 1]);
      const k1 = ptKey(ax, ay);
      const k2 = ptKey(bx, by);
      if (k1 === k2) continue;
      degreeMap.set(k1, (degreeMap.get(k1) || 0) + 1);
      degreeMap.set(k2, (degreeMap.get(k2) || 0) + 1);
    }
  }

  const isTerminal = (x, y) => (degreeMap.get(ptKey(x, y)) || 0) <= 1;

  let terminalShortenedCount = 0;
  let skippedOverlapCount = 0;

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    const pts = seg.points || [];
    if (pts.length < 2) continue;

    const [sx, sy] = getXY(pts[0]);
    const [ex, ey] = getXY(pts[pts.length - 1]);

    const startTerm = isTerminal(sx, sy);
    const endTerm = isTerminal(ex, ey);

    if (!startTerm && !endTerm) continue;
    if (startTerm && endTerm) continue;

    const firstNode =
      seg.nodes?.length > 0 ? { ...(seg.nodes[0] || {}) } : { ...(seg.properties_start || {}) };
    const lastNode =
      seg.nodes?.length > 0
        ? { ...(seg.nodes[seg.nodes.length - 1] || {}) }
        : { ...(seg.properties_end || {}) };

    let chosen = null;

    if (startTerm) {
      const candidates = candidateTerminalPositions(sx, sy, ex, ey);
      for (const [tx, ty] of candidates) {
        if (!overlapsOtherRoutes(tx, ty, ex, ey, segIdx, segments)) {
          chosen = { tx, ty, anchorX: ex, anchorY: ey, firstNode, lastNode, startShort: true };
          break;
        }
      }
    } else {
      const candidates = candidateTerminalPositions(ex, ey, sx, sy);
      for (const [tx, ty] of candidates) {
        if (!overlapsOtherRoutes(tx, ty, sx, sy, segIdx, segments)) {
          chosen = { tx, ty, anchorX: sx, anchorY: sy, firstNode, lastNode, startShort: false };
          break;
        }
      }
    }

    if (!chosen) {
      skippedOverlapCount++;
      continue;
    }

    if (chosen.startShort) {
      updateNodeCoord(chosen.firstNode, chosen.tx, chosen.ty);
      seg.points = [[chosen.tx, chosen.ty], [chosen.anchorX, chosen.anchorY]];
      seg.nodes = [chosen.firstNode, chosen.lastNode];
      seg.properties_start = chosen.firstNode;
      seg.properties_end = chosen.lastNode;
    } else {
      updateNodeCoord(chosen.lastNode, chosen.tx, chosen.ty);
      seg.points = [[chosen.anchorX, chosen.anchorY], [chosen.tx, chosen.ty]];
      seg.nodes = [chosen.firstNode, chosen.lastNode];
      seg.properties_start = chosen.firstNode;
      seg.properties_end = chosen.lastNode;
    }

    terminalShortenedCount++;
  }

  console.log(
    `[e3→f3] 縮短 ${terminalShortenedCount} 條末端路段；因與他線重疊略過 ${skippedOverlapCount} 條。`
  );
  return { segments, terminalShortenedCount, skippedOverlapCount };
}
