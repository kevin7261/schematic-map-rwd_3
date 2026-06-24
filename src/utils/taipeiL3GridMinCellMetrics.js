/** 與 SpaceNetworkGridTabL3 示意網格：邊距與單格上限（pt） */
export const TAIPEI_L3_GRID_MARGIN = 20;
/** 單格寬、高皆不超過此值（px≈pt 顯示） */
export const TAIPEI_L3_MAX_CELL_PT = 50;

/**
 * 依內繪區寬高決定欄數、列數：ceil(inner / 50)，至少 1。
 *
 * @param {number} innerWidthPx
 * @param {number} innerHeightPx
 * @returns {{ cols: number, rows: number }}
 */
export function computeTaipeiL3GridCounts(innerWidthPx, innerHeightPx) {
  const max = TAIPEI_L3_MAX_CELL_PT;
  const iw = Math.max(0, Number(innerWidthPx) || 0);
  const ih = Math.max(0, Number(innerHeightPx) || 0);
  const cols = Math.max(1, Math.ceil(iw / max));
  const rows = Math.max(1, Math.ceil(ih / max));
  return { cols, rows };
}

/**
 * 由容器外框像素推算欄列、單格寬／高（pt，顯示規則對齊 dataStore.updateSpaceNetworkGridMinCellDimensions）。
 *
 * @param {number} containerWidthPx
 * @param {number} containerHeightPx
 * @returns {{ cols: number, rows: number, minWidth: number, minHeight: number, innerDrawWidth: number, innerDrawHeight: number }}
 */
export function taipeiL3GridMetricsFromContainerPx(containerWidthPx, containerHeightPx) {
  const w = Number(containerWidthPx);
  const h = Number(containerHeightPx);
  const m = TAIPEI_L3_GRID_MARGIN;
  const innerW = Math.max(0, (Number.isFinite(w) ? w : 0) - m * 2);
  const innerH = Math.max(0, (Number.isFinite(h) ? h : 0) - m * 2);
  const { cols, rows } = computeTaipeiL3GridCounts(innerW, innerH);
  const cellW = cols > 0 ? innerW / cols : 0;
  const cellH = rows > 0 ? innerH / rows : 0;
  return {
    cols,
    rows,
    minWidth: cellW > 0 ? Math.max(2, Math.round(cellW)) : 0,
    minHeight: cellH > 0 ? Math.max(2, Math.round(cellH)) : 0,
    innerDrawWidth: innerW > 0 ? Math.round(innerW) : 0,
    innerDrawHeight: innerH > 0 ? Math.round(innerH) : 0,
  };
}
