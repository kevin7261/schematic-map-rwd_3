/**
 * 🔧 网格合并和缩减工具函数
 * 用于处理 layoutGridJsonData_Test4 的合并和缩减操作
 */

/**
 * 生成数据表格数据
 * @param {Array} routesData - 路线数据
 * @returns {Array} 数据表格数据
 */
export function generateDataTableData_Test4(routesData) {
  const gridNodes = new Map(); // key: "x,y", value: { xGrid, yGrid, maxWeight: number, weights: number[] }

  const addWeightAt = (x, y, weight) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (typeof weight !== 'number' || !Number.isFinite(weight)) return;
    const xGrid = Math.round(x);
    const yGrid = Math.round(y);
    const key = `${xGrid},${yGrid}`;
    if (!gridNodes.has(key)) {
      gridNodes.set(key, { xGrid, yGrid, maxWeight: weight, weights: [weight] });
    } else {
      const existing = gridNodes.get(key);
      if (weight > (existing.maxWeight ?? -Infinity)) {
        existing.maxWeight = weight;
        existing.weights = [weight];
      }
    }
  };

  const rasterizeAndAddWeight = (ax, ay, bx, by, weight) => {
    ax = Math.round(ax);
    ay = Math.round(ay);
    bx = Math.round(bx);
    by = Math.round(by);

    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);

    if (dx === 0 && dy === 0) {
      addWeightAt(ax, ay, weight);
      return;
    }

    if (dy === 0) {
      const x0 = Math.min(ax, bx);
      const x1 = Math.max(ax, bx);
      for (let x = x0; x <= x1; x++) addWeightAt(x, ay, weight);
      return;
    }

    if (dx === 0) {
      const y0 = Math.min(ay, by);
      const y1 = Math.max(ay, by);
      for (let y = y0; y <= y1; y++) addWeightAt(ax, y, weight);
      return;
    }

    // 斜线（Bresenham）
    let x = ax;
    let y = ay;
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx - dy;
    const maxSteps = dx + dy + 1;
    for (let steps = 0; steps < maxSteps; steps++) {
      addWeightAt(x, y, weight);
      if (x === bx && y === by) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  };

  // 将 station_weights / edge_weights 依照端点坐标分配到节点
  for (const route of routesData || []) {
    const segments = route?.segments || [];
    for (const seg of segments) {
      const points = Array.isArray(seg.points) ? seg.points : [];
      if (points.length < 2) continue;

      const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : null;
      const edgeWeights = Array.isArray(seg.edge_weights) ? seg.edge_weights : null;

      if (stationWeights && stationWeights.length > 0) {
        for (const wInfo of stationWeights) {
          const sIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
          const eIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
          const w = wInfo?.weight;
          if (
            sIdx === null ||
            eIdx === null ||
            sIdx < 0 ||
            eIdx < 0 ||
            sIdx >= points.length ||
            eIdx >= points.length
          ) {
            continue;
          }

          const step = sIdx <= eIdx ? 1 : -1;
          for (let i = sIdx; i !== eIdx; i += step) {
            const p1 = points[i];
            const p2 = points[i + step];
            const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
            const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
            const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
            const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
            rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
          }
        }
      } else if (edgeWeights && edgeWeights.length > 0) {
        const nEdges = Math.min(edgeWeights.length, points.length - 1);
        for (let i = 0; i < nEdges; i++) {
          const w = edgeWeights[i];
          const p1 = points[i];
          const p2 = points[i + 1];
          const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
          const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
          const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
          const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
          rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
        }
      }
    }
  }

  // 找出网格的有效范围
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;

  for (const node of gridNodes.values()) {
    minRow = Math.min(minRow, node.yGrid);
    maxRow = Math.max(maxRow, node.yGrid);
    minCol = Math.min(minCol, node.xGrid);
    maxCol = Math.max(maxCol, node.xGrid);
  }

  if (minRow === Infinity || maxRow === -Infinity || minCol === Infinity || maxCol === -Infinity) {
    return [];
  }

  // 计算每一列/行的最大值
  const colMaxValues = {};
  const rowMaxValues = {};

  for (let col = minCol; col <= maxCol; col++) colMaxValues[col] = 0;
  for (let row = minRow; row <= maxRow; row++) rowMaxValues[row] = 0;

  for (const node of gridNodes.values()) {
    const maxWeight = node.weights.length > 0 ? Math.max(...node.weights) : 0;
    colMaxValues[node.xGrid] = Math.max(colMaxValues[node.xGrid] || 0, maxWeight);
    rowMaxValues[node.yGrid] = Math.max(rowMaxValues[node.yGrid] || 0, maxWeight);
  }

  const colSingles = [];
  const rowSingles = [];

  for (let col = minCol; col <= maxCol; col++) {
    colSingles.push({ actualCol: col, colMaxWeight: colMaxValues[col] ?? 0 });
  }
  for (let row = minRow; row <= maxRow; row++) {
    rowSingles.push({ actualRow: row, rowMaxWeight: rowMaxValues[row] ?? 0 });
  }

  // 过滤出「奇数坐标」的 col / row
  const colSinglesOdd = colSingles.filter((single) => single.actualCol % 2 !== 0);
  const rowSinglesOdd = rowSingles.filter((single) => single.actualRow % 2 !== 0);

  const dataTableData = [];

  // col：每个奇数 col 与下一个奇数 col 一组
  for (let i = 0; i < colSinglesOdd.length; i++) {
    const col1 = colSinglesOdd[i];
    const col2 = colSinglesOdd[i + 1];
    if (!col1 || !col2) continue;
    if (col2.actualCol !== col1.actualCol + 2) continue;
    dataTableData.push({
      type: 'col',
      idx1: col1.actualCol,
      idx2: col2.actualCol,
      idx1_max_weight: col1.colMaxWeight ?? 0,
      idx2_max_weight: col2.colMaxWeight ?? 0,
      合併: 'X',
    });
  }

  // row：每个奇数 row 与下一个奇数 row 一组
  for (let i = 0; i < rowSinglesOdd.length; i++) {
    const row1 = rowSinglesOdd[i];
    const row2 = rowSinglesOdd[i + 1];
    if (!row1 || !row2) continue;
    if (row2.actualRow !== row1.actualRow + 2) continue;
    dataTableData.push({
      type: 'row',
      idx1: row1.actualRow,
      idx2: row2.actualRow,
      idx1_max_weight: row1.rowMaxWeight ?? 0,
      idx2_max_weight: row2.rowMaxWeight ?? 0,
      合併: 'X',
    });
  }

  // 排序：先 col 再 row；同 type 内用 sum 由小到大
  dataTableData.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'col' ? -1 : 1;
    const aSum = (a.idx1_max_weight ?? 0) + (a.idx2_max_weight ?? 0);
    const bSum = (b.idx1_max_weight ?? 0) + (b.idx2_max_weight ?? 0);
    return aSum - bSum;
  });

  return dataTableData.map((item, index) => ({
    '#': index + 1,
    type: item.type,
    idx1: item.idx1,
    idx2: item.idx2,
    idx1_max_weight: item.idx1_max_weight,
    idx2_max_weight: item.idx2_max_weight,
    合併: item.合併 ?? 'X',
  }));
}

/**
 * 辅助函数：判断是否为连接节点
 */
function isConnectNodeAt(seg, idx) {
  const hasValue = (v) => v !== undefined && v !== null;
  const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
  const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
  const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
  const tags = ptProps?.tags || node?.tags || {};

  const nodeType =
    node?.node_type ||
    ptProps?.node_type ||
    tags?.node_type ||
    (hasValue(node?.connect_number) ? 'connect' : '');
  const hasConnectNumber =
    hasValue(node?.connect_number) ||
    hasValue(tags?.connect_number) ||
    hasValue(ptProps?.connect_number) ||
    hasValue(ptProps?.tags?.connect_number);
  return nodeType === 'connect' || hasConnectNumber;
}

/**
 * 辅助函数：判断是否为真实车站
 */
function isRealStation(seg, idx) {
  const node = Array.isArray(seg.nodes) ? seg.nodes[idx] : null;
  const pt = Array.isArray(seg.points) ? seg.points[idx] : null;
  const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
  const tags = ptProps?.tags || node?.tags || {};

  if (isConnectNodeAt(seg, idx)) return false;

  const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
  const inWeights = weights.some(
    (w) =>
      (Number.isFinite(w?.start_idx) && w.start_idx === idx) ||
      (Number.isFinite(w?.end_idx) && w.end_idx === idx)
  );
  if (inWeights) return true;

  const hasStationName = !!(
    node?.station_name ||
    ptProps?.station_name ||
    tags?.station_name ||
    ptProps?.tags?.station_name
  );
  const hasStationId = !!(
    node?.station_id ||
    ptProps?.station_id ||
    tags?.station_id ||
    ptProps?.tags?.station_id
  );
  const nodeType = node?.node_type || ptProps?.node_type || tags?.node_type || '';
  const isStationType = nodeType === 'station';

  return hasStationName || hasStationId || isStationType;
}

/**
 * 辅助函数：判断是否为转折点
 */
function isBendPoint(points, idx) {
  if (idx <= 0 || idx >= points.length - 1) return false;

  const prev = points[idx - 1];
  const curr = points[idx];
  const next = points[idx + 1];

  const px = Array.isArray(prev) ? prev[0] : prev.x || 0;
  const py = Array.isArray(prev) ? prev[1] : prev.y || 0;
  const cx = Array.isArray(curr) ? curr[0] : curr.x || 0;
  const cy = Array.isArray(curr) ? curr[1] : curr.y || 0;
  const nx = Array.isArray(next) ? next[0] : next.x || 0;
  const ny = Array.isArray(next) ? next[1] : next.y || 0;

  const dx1 = cx - px;
  const dy1 = cy - py;
  const dx2 = nx - cx;
  const dy2 = ny - cy;

  const crossProduct = dx1 * dy2 - dy1 * dx2;
  const epsilon = 0.001;

  return Math.abs(crossProduct) > epsilon;
}

/**
 * 合并路线（水平方向）
 * @param {Array} layoutData - 路线数据
 * @param {number} gap - 允许的权重差
 * @returns {Object} { modified: boolean, layoutData: Array }
 */
export function mergeRoutesHorizontal(layoutData, gap = 0) {
  if (!Array.isArray(layoutData)) {
    console.warn('layoutData 不是 Array');
    return { modified: false, layoutData };
  }

  let totalMerged = 0;
  let safety = 0;
  const maxSafety = 10000;

  console.log(`🚀 开始合并路线-H (gap<=${gap})，只合并水平线上的黑点...`);

  while (safety < maxSafety) {
    safety++;

    const dataTableData = generateDataTableData_Test4(layoutData);

    if (safety % 100 === 0) {
      console.log(
        `📊 第 ${safety} 轮，已合并 ${totalMerged} 个点，可选项目：${dataTableData.length}`
      );
    }

    let mergedThisRound = false;

    for (const item of dataTableData) {
      if (!item || item.合併 === 'V') continue;
      // 只处理水平线（row）
      if (item.type !== 'row') continue;

      const w1 = Number(item.idx1_max_weight ?? 0);
      const w2 = Number(item.idx2_max_weight ?? 0);
      const weightDiff = Math.abs(w1 - w2);
      const eps = 1e-9;
      if (weightDiff > gap + eps) continue;

      const odd1Coord = Number(item.idx1);
      const odd2Coord = Number(item.idx2);
      const evenCoord = (odd1Coord + odd2Coord) / 2;

      if (
        odd1Coord % 2 === 0 ||
        odd2Coord % 2 === 0 ||
        evenCoord % 2 !== 0 ||
        odd2Coord !== odd1Coord + 2
      ) {
        continue;
      }

      let mergedInThisItem = false;
      let deletedPointsCount = 0;
      let changedWeightsCount = 0;
      const mergedWeight = Math.max(item.idx1_max_weight ?? 0, item.idx2_max_weight ?? 0);

      for (const route of layoutData) {
        const segments = route?.segments || [];
        for (const seg of segments) {
          const points = Array.isArray(seg.points) ? seg.points : [];
          const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
          if (points.length === 0) continue;

          for (let idx = points.length - 1; idx >= 0; idx--) {
            const pt = points[idx];
            const y = Array.isArray(pt) ? pt[1] : pt?.y || 0;
            const yGrid = Math.round(y);

            if (yGrid !== evenCoord) continue;
            if (idx <= 0 || idx >= points.length - 1) continue;

            // 检查这个点是否真的在水平线上
            const prevPt = points[idx - 1];
            const nextPt = points[idx + 1];
            const prevY = Array.isArray(prevPt) ? prevPt[1] : prevPt?.y || 0;
            const nextY = Array.isArray(nextPt) ? nextPt[1] : nextPt?.y || 0;
            const prevYGrid = Math.round(prevY);
            const nextYGrid = Math.round(nextY);

            if (prevYGrid !== yGrid && nextYGrid !== yGrid) continue;

            if (isConnectNodeAt(seg, idx)) continue;
            if (!isRealStation(seg, idx)) continue;

            const isBend = isBendPoint(points, idx);

            if (isBend) {
              const pt = points[idx];
              const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
              const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
              points[idx] = [x, y];

              if (Array.isArray(seg.nodes)) {
                while (seg.nodes.length < points.length) seg.nodes.push({});
                seg.nodes[idx] = { node_type: 'line' };
              }

              const wIn = weights.find((w) => w.end_idx === idx);
              const wOut = weights.find((w) => w.start_idx === idx);

              if (wIn && wOut) {
                const combinedWeight = Math.max(Number(wIn.weight) || 0, Number(wOut.weight) || 0);
                wIn.end_idx = wOut.end_idx;
                wIn.weight = combinedWeight;
                const outIdx = weights.indexOf(wOut);
                if (outIdx >= 0) weights.splice(outIdx, 1);
                changedWeightsCount++;
              }
            } else {
              seg.points.splice(idx, 1);
              if (Array.isArray(seg.nodes) && seg.nodes.length > idx) seg.nodes.splice(idx, 1);

              for (const w of weights) {
                if (w.start_idx > idx) w.start_idx--;
                if (w.end_idx > idx) w.end_idx--;
              }
            }

            mergedInThisItem = true;
            totalMerged++;
            deletedPointsCount++;
          }

          for (const w of weights) {
            if (
              w.start_idx < 0 ||
              w.end_idx < 0 ||
              w.start_idx >= points.length ||
              w.end_idx >= points.length
            )
              continue;

            let passesOdd1 = false;
            let passesOdd2 = false;

            const step = w.start_idx <= w.end_idx ? 1 : -1;
            for (let i = w.start_idx; i !== w.end_idx; i += step) {
              const pt = points[i];
              const y = Array.isArray(pt) ? pt[1] : pt?.y || 0;
              const yGrid = Math.round(y);

              if (yGrid === odd1Coord) passesOdd1 = true;
              if (yGrid === odd2Coord) passesOdd2 = true;
            }

            if (passesOdd1 || passesOdd2) {
              const prev = Number(w.weight);
              if (!Number.isFinite(prev) || Math.abs(prev - Number(mergedWeight)) > eps) {
                w.weight = mergedWeight;
                mergedInThisItem = true;
                changedWeightsCount++;
              }
            }
          }
        }
      }

      if (mergedInThisItem && (deletedPointsCount > 0 || changedWeightsCount > 0)) {
        item.合併 = 'V';
        mergedThisRound = true;
        break;
      }
    }

    if (!mergedThisRound) break;
  }

  if (safety >= maxSafety) {
    console.warn('⚠️ mergeRoutesHorizontal 达到安全上限，停止避免无限循环');
  }

  if (totalMerged > 0) {
    console.log(`🎉 执行完成-H！共处理 ${totalMerged} 个点（只合并水平线上的黑点）`);
  } else {
    console.log('没有找到符合条件的项目可以合并（水平线）');
  }

  return { modified: totalMerged > 0, layoutData };
}

/**
 * 合并路线（垂直方向）
 * @param {Array} layoutData - 路线数据
 * @param {number} gap - 允许的权重差
 * @returns {Object} { modified: boolean, layoutData: Array }
 */
export function mergeRoutesVertical(layoutData, gap = 0) {
  if (!Array.isArray(layoutData)) {
    console.warn('layoutData 不是 Array');
    return { modified: false, layoutData };
  }

  let totalMerged = 0;
  let safety = 0;
  const maxSafety = 10000;

  console.log(`🚀 开始合并路线-V (gap<=${gap})，只合并垂直线上的黑点...`);

  while (safety < maxSafety) {
    safety++;

    const dataTableData = generateDataTableData_Test4(layoutData);

    if (safety % 100 === 0) {
      console.log(
        `📊 第 ${safety} 轮，已合并 ${totalMerged} 个点，可选项目：${dataTableData.length}`
      );
    }

    let mergedThisRound = false;

    for (const item of dataTableData) {
      if (!item || item.合併 === 'V') continue;
      // 只处理垂直线（col）
      if (item.type !== 'col') continue;

      const w1 = Number(item.idx1_max_weight ?? 0);
      const w2 = Number(item.idx2_max_weight ?? 0);
      const weightDiff = Math.abs(w1 - w2);
      const eps = 1e-9;
      if (weightDiff > gap + eps) continue;

      const odd1Coord = Number(item.idx1);
      const odd2Coord = Number(item.idx2);
      const evenCoord = (odd1Coord + odd2Coord) / 2;

      if (
        odd1Coord % 2 === 0 ||
        odd2Coord % 2 === 0 ||
        evenCoord % 2 !== 0 ||
        odd2Coord !== odd1Coord + 2
      ) {
        continue;
      }

      let mergedInThisItem = false;
      let deletedPointsCount = 0;
      let changedWeightsCount = 0;
      const mergedWeight = Math.max(item.idx1_max_weight ?? 0, item.idx2_max_weight ?? 0);

      for (const route of layoutData) {
        const segments = route?.segments || [];
        for (const seg of segments) {
          const points = Array.isArray(seg.points) ? seg.points : [];
          const weights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
          if (points.length === 0) continue;

          for (let idx = points.length - 1; idx >= 0; idx--) {
            const pt = points[idx];
            const x = Array.isArray(pt) ? pt[0] : pt?.x || 0;
            const xGrid = Math.round(x);

            if (xGrid !== evenCoord) continue;
            if (idx <= 0 || idx >= points.length - 1) continue;

            // 检查这个点是否真的在垂直线上
            const prevPt = points[idx - 1];
            const nextPt = points[idx + 1];
            const prevX = Array.isArray(prevPt) ? prevPt[0] : prevPt?.x || 0;
            const nextX = Array.isArray(nextPt) ? nextPt[0] : nextPt?.x || 0;
            const prevXGrid = Math.round(prevX);
            const nextXGrid = Math.round(nextX);

            if (prevXGrid !== xGrid && nextXGrid !== xGrid) continue;

            if (isConnectNodeAt(seg, idx)) continue;
            if (!isRealStation(seg, idx)) continue;

            const isBend = isBendPoint(points, idx);

            if (isBend) {
              const pt = points[idx];
              const x = Array.isArray(pt) ? pt[0] : pt.x || 0;
              const y = Array.isArray(pt) ? pt[1] : pt.y || 0;
              points[idx] = [x, y];

              if (Array.isArray(seg.nodes)) {
                while (seg.nodes.length < points.length) seg.nodes.push({});
                seg.nodes[idx] = { node_type: 'line' };
              }

              const wIn = weights.find((w) => w.end_idx === idx);
              const wOut = weights.find((w) => w.start_idx === idx);

              if (wIn && wOut) {
                const combinedWeight = Math.max(Number(wIn.weight) || 0, Number(wOut.weight) || 0);
                wIn.end_idx = wOut.end_idx;
                wIn.weight = combinedWeight;
                const outIdx = weights.indexOf(wOut);
                if (outIdx >= 0) weights.splice(outIdx, 1);
                changedWeightsCount++;
              }
            } else {
              seg.points.splice(idx, 1);
              if (Array.isArray(seg.nodes) && seg.nodes.length > idx) seg.nodes.splice(idx, 1);

              for (const w of weights) {
                if (w.start_idx > idx) w.start_idx--;
                if (w.end_idx > idx) w.end_idx--;
              }
            }

            mergedInThisItem = true;
            totalMerged++;
            deletedPointsCount++;
          }

          for (const w of weights) {
            if (
              w.start_idx < 0 ||
              w.end_idx < 0 ||
              w.start_idx >= points.length ||
              w.end_idx >= points.length
            )
              continue;

            let passesOdd1 = false;
            let passesOdd2 = false;

            const step = w.start_idx <= w.end_idx ? 1 : -1;
            for (let i = w.start_idx; i !== w.end_idx; i += step) {
              const pt = points[i];
              const x = Array.isArray(pt) ? pt[0] : pt?.x || 0;
              const xGrid = Math.round(x);

              if (xGrid === odd1Coord) passesOdd1 = true;
              if (xGrid === odd2Coord) passesOdd2 = true;
            }

            if (passesOdd1 || passesOdd2) {
              const prev = Number(w.weight);
              if (!Number.isFinite(prev) || Math.abs(prev - Number(mergedWeight)) > eps) {
                w.weight = mergedWeight;
                mergedInThisItem = true;
                changedWeightsCount++;
              }
            }
          }
        }
      }

      if (mergedInThisItem && (deletedPointsCount > 0 || changedWeightsCount > 0)) {
        item.合併 = 'V';
        mergedThisRound = true;
        break;
      }
    }

    if (!mergedThisRound) break;
  }

  if (safety >= maxSafety) {
    console.warn('⚠️ mergeRoutesVertical 达到安全上限，停止避免无限循环');
  }

  if (totalMerged > 0) {
    console.log(`🎉 执行完成-V！共处理 ${totalMerged} 个点（只合并垂直线上的黑点）`);
  } else {
    console.log('没有找到符合条件的项目可以合并（垂直线）');
  }

  return { modified: totalMerged > 0, layoutData };
}

/**
 * 缩减网格
 * @param {Array|Object} layoutData - 路线数据（Array 或包含 meta 的 Object）
 * @returns {Object} { modified: boolean, layoutData: Array|Object }
 */
export function reduceGrid(layoutData) {
  if (!layoutData) {
    console.warn('layoutData 为空');
    return { modified: false, layoutData };
  }

  // 处理两种格式：Array 或 Object（有 meta）
  let routes;
  let meta = null;

  if (Array.isArray(layoutData)) {
    routes = layoutData;
  } else if (layoutData.routes && Array.isArray(layoutData.routes)) {
    routes = layoutData.routes;
    meta = layoutData.meta || null;
  } else {
    console.warn('layoutData 格式不正确');
    return { modified: false, layoutData };
  }

  // 1. 扫描所有点，标记"被使用"的偶数 col/row
  const usedEvenCols = new Set();
  const usedEvenRows = new Set();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const addStationPoint = (x, y) => {
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    minX = Math.min(minX, roundedX);
    maxX = Math.max(maxX, roundedX);
    minY = Math.min(minY, roundedY);
    maxY = Math.max(maxY, roundedY);
    if (roundedX % 2 === 0) usedEvenCols.add(roundedX);
    if (roundedY % 2 === 0) usedEvenRows.add(roundedY);
  };

  const checkLineSegment = (ax, ay, bx, by) => {
    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);
    const roundedAx = Math.round(ax);
    const roundedAy = Math.round(ay);
    const roundedBx = Math.round(bx);
    const roundedBy = Math.round(by);

    minX = Math.min(minX, roundedAx, roundedBx);
    maxX = Math.max(maxX, roundedAx, roundedBx);
    minY = Math.min(minY, roundedAy, roundedBy);
    maxY = Math.max(maxY, roundedAy, roundedBy);

    const isVertical = dx === 0 || Math.abs(ax - bx) < 0.5;
    const isHorizontal = dy === 0 || Math.abs(ay - by) < 0.5;

    if (isVertical) {
      if (roundedAx % 2 === 0) usedEvenCols.add(roundedAx);
    } else if (isHorizontal) {
      if (roundedAy % 2 === 0) usedEvenRows.add(roundedAy);
    }
  };

  routes.forEach((route) => {
    const segments = route?.segments || [];
    segments.forEach((seg) => {
      const points = Array.isArray(seg.points) ? seg.points : [];

      points.forEach((pt, idx) => {
        const x = Array.isArray(pt) ? pt[0] : pt?.x || 0;
        const y = Array.isArray(pt) ? pt[1] : pt?.y || 0;

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        const prev = points[idx - 1];
        const next = points[idx + 1];

        if (prev) {
          const px = Array.isArray(prev) ? prev[0] : prev?.x || 0;
          const py = Array.isArray(prev) ? prev[1] : prev?.y || 0;
          if (Number.isFinite(px) && Number.isFinite(py)) {
            checkLineSegment(px, py, x, y);
          }
        }

        if (next) {
          const nx = Array.isArray(next) ? next[0] : next?.x || 0;
          const ny = Array.isArray(next) ? next[1] : next?.y || 0;
          if (Number.isFinite(nx) && Number.isFinite(ny)) {
            checkLineSegment(x, y, nx, ny);
          }
        }

        addStationPoint(x, y);
      });
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    console.warn('没有找到任何使用的坐标');
    return { modified: false, layoutData };
  }

  // 2. 只删除「偶数」col/row 里完全没被 used 的
  const colMap = new Map();
  const rowMap = new Map();

  const minEvenX = minX % 2 === 0 ? minX : minX - 1;
  const maxEvenX = maxX % 2 === 0 ? maxX : maxX + 1;
  const minEvenY = minY % 2 === 0 ? minY : minY - 1;
  const maxEvenY = maxY % 2 === 0 ? maxY : maxY + 1;

  const removableEvenCols = new Set();
  for (let x = minEvenX; x <= maxEvenX; x += 2) {
    if (!usedEvenCols.has(x)) removableEvenCols.add(x);
  }
  const removableEvenRows = new Set();
  for (let y = minEvenY; y <= maxEvenY; y += 2) {
    if (!usedEvenRows.has(y)) removableEvenRows.add(y);
  }

  // 建立 even 的压缩映射
  let newEvenX = 0;
  for (let x = minEvenX; x <= maxEvenX; x += 2) {
    colMap.set(x, newEvenX);
    if (!removableEvenCols.has(x)) newEvenX += 2;
  }
  let newEvenY = 0;
  for (let y = minEvenY; y <= maxEvenY; y += 2) {
    rowMap.set(y, newEvenY);
    if (!removableEvenRows.has(y)) newEvenY += 2;
  }

  const removedCols = removableEvenCols.size;
  const removedRows = removableEvenRows.size;

  if (removedCols === 0 && removedRows === 0) {
    console.log('没有空的偶数 col/row 需要删除');
    const finalWidth = Math.max(0, newEvenX);
    const finalHeight = Math.max(0, newEvenY);
    if (meta) {
      meta.gridWidth = finalWidth;
      meta.gridHeight = finalHeight;
      if (typeof meta.width === 'number') meta.width = finalWidth;
      if (typeof meta.height === 'number') meta.height = finalHeight;
    }
    console.log(`✅ 网格已正规化：新尺寸 ${finalWidth} x ${finalHeight}`);
    return { modified: false, layoutData };
  }

  console.log(
    `📉 缩减网格：删除 ${removedCols} 个空偶数 col，${removedRows} 个空偶数 row（相邻奇数会合并）`
  );

  // 映射函数
  const mapCoord = (v, mapEven) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return v;
    const baseEven = n % 2 === 0 ? n : n - 1;
    const mappedEven = mapEven.get(baseEven);
    if (!Number.isFinite(mappedEven)) return n;
    return n % 2 === 0 ? mappedEven : mappedEven + 1;
  };

  // 3. 调整所有点的坐标
  routes.forEach((route) => {
    const segments = route?.segments || [];
    segments.forEach((seg) => {
      const points = Array.isArray(seg.points) ? seg.points : [];
      points.forEach((pt, idx) => {
        if (Array.isArray(pt)) {
          const oldX = pt[0];
          const oldY = pt[1];
          const newX = mapCoord(oldX, colMap);
          const newY = mapCoord(oldY, rowMap);

          if (pt.length > 2) {
            points[idx] = [newX, newY, pt[2]];
          } else {
            points[idx] = [newX, newY];
          }
        } else if (pt && typeof pt === 'object') {
          const oldX = pt.x || 0;
          const oldY = pt.y || 0;
          pt.x = mapCoord(oldX, colMap);
          pt.y = mapCoord(oldY, rowMap);
        }
      });

      // 同步 nodes / properties_start/end / start_coord/end_coord
      if (Array.isArray(seg.nodes) && Array.isArray(seg.points)) {
        seg.nodes.forEach((node, i) => {
          const p = seg.points[i];
          if (!p) return;
          const x = Array.isArray(p) ? p[0] : p?.x;
          const y = Array.isArray(p) ? p[1] : p?.y;
          if (!node || typeof node !== 'object') return;
          node.x_grid = Number.isFinite(Number(x)) ? Math.round(Number(x)) : node.x_grid;
          node.y_grid = Number.isFinite(Number(y)) ? Math.round(Number(y)) : node.y_grid;
        });
      }
      if (seg.properties_start) {
        seg.properties_start.x_grid = mapCoord(seg.properties_start.x_grid, colMap);
        seg.properties_start.y_grid = mapCoord(seg.properties_start.y_grid, rowMap);
      }
      if (seg.properties_end) {
        seg.properties_end.x_grid = mapCoord(seg.properties_end.x_grid, colMap);
        seg.properties_end.y_grid = mapCoord(seg.properties_end.y_grid, rowMap);
      }
      if (Array.isArray(seg.start_coord) && seg.start_coord.length >= 2) {
        seg.start_coord = [
          mapCoord(seg.start_coord[0], colMap),
          mapCoord(seg.start_coord[1], rowMap),
        ];
      }
      if (Array.isArray(seg.end_coord) && seg.end_coord.length >= 2) {
        seg.end_coord = [mapCoord(seg.end_coord[0], colMap), mapCoord(seg.end_coord[1], rowMap)];
      }
    });
  });

  // 4. 更新 meta
  const finalWidth = Math.max(0, newEvenX);
  const finalHeight = Math.max(0, newEvenY);

  if (meta) {
    meta.gridWidth = finalWidth;
    meta.gridHeight = finalHeight;
    if (typeof meta.width === 'number') meta.width = finalWidth;
    if (typeof meta.height === 'number') meta.height = finalHeight;
  }

  console.log(
    `✅ 缩减网格完成：新尺寸 ${finalWidth} x ${finalHeight}（删除 ${removedCols} 列，${removedRows} 行）`
  );

  return { modified: true, layoutData };
}

/**
 * 自动合并和缩减网格，直到满足最小尺寸要求
 * @param {Object} options - 选项
 * @param {Array|Object} options.layoutData - 路线数据
 * @param {number} options.minWidthPt - 最小宽度要求（pt）
 * @param {number} options.minHeightPt - 最小高度要求（pt）
 * @param {Function} options.getMinDimensions - 获取当前最小尺寸的函数，返回 { minWidthPt, minHeightPt }
 * @param {number} options.maxGap - 最大 gap 值，默认为 3
 * @returns {Object} { modified: boolean, layoutData: Array|Object }
 */
export function autoMergeAndReduce(options) {
  const {
    layoutData: initialLayoutData,
    minWidthPt = 5,
    minHeightPt = 5,
    getMinDimensions,
    maxGap = 3,
  } = options;

  if (!getMinDimensions || typeof getMinDimensions !== 'function') {
    console.warn('autoMergeAndReduce: 需要提供 getMinDimensions 函数');
    return { modified: false, layoutData: initialLayoutData };
  }

  let layoutData = initialLayoutData;
  let modified = false;
  let dimensions = getMinDimensions(layoutData);

  console.log(
    `🔄 开始自动合并和缩减：当前最小宽度 ${dimensions.minWidthPt}pt，最小高度 ${dimensions.minHeightPt}pt`
  );

  // 处理宽度
  if (dimensions.minWidthPt < minWidthPt) {
    console.log(`⚠️ 最小宽度 ${dimensions.minWidthPt}pt < ${minWidthPt}pt，开始自动合并-H`);
    for (let gap = 0; gap <= maxGap; gap++) {
      console.log(`🔄 尝试合并-H (gap <= ${gap})`);
      const mergeResult = mergeRoutesHorizontal(layoutData, gap);
      if (mergeResult.modified) {
        layoutData = mergeResult.layoutData;
        modified = true;

        console.log(`🔄 合并-H 完成，执行缩减网格`);
        const reduceResult = reduceGrid(layoutData);
        if (reduceResult.modified) {
          layoutData = reduceResult.layoutData;
        }

        // 重新计算最小尺寸
        dimensions = getMinDimensions(layoutData);
        console.log(`📊 当前最小宽度 ${dimensions.minWidthPt}pt`);

        if (dimensions.minWidthPt >= minWidthPt) {
          console.log(`✅ 最小宽度已满足要求 (${dimensions.minWidthPt}pt >= ${minWidthPt}pt)`);
          break;
        }
      }
    }
  }

  // 处理高度
  if (dimensions.minHeightPt < minHeightPt) {
    console.log(`⚠️ 最小高度 ${dimensions.minHeightPt}pt < ${minHeightPt}pt，开始自动合并-V`);
    for (let gap = 0; gap <= maxGap; gap++) {
      console.log(`🔄 尝试合并-V (gap <= ${gap})`);
      const mergeResult = mergeRoutesVertical(layoutData, gap);
      if (mergeResult.modified) {
        layoutData = mergeResult.layoutData;
        modified = true;

        console.log(`🔄 合并-V 完成，执行缩减网格`);
        const reduceResult = reduceGrid(layoutData);
        if (reduceResult.modified) {
          layoutData = reduceResult.layoutData;
        }

        // 重新计算最小尺寸
        dimensions = getMinDimensions(layoutData);
        console.log(`📊 当前最小高度 ${dimensions.minHeightPt}pt`);

        if (dimensions.minHeightPt >= minHeightPt) {
          console.log(`✅ 最小高度已满足要求 (${dimensions.minHeightPt}pt >= ${minHeightPt}pt)`);
          break;
        }
      }
    }
  }

  return { modified, layoutData };
}
