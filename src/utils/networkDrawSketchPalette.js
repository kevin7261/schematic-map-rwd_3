/**
 * 與 NetworkDrawTab 手繪折線顯示相同之配色（依筆畫序號循環）。
 */

export const NETWORK_DRAW_ROUTE_COLORS = [
  '#e57373',
  '#f06292',
  '#ba68c8',
  '#9575cd',
  '#7986cb',
  '#64b5f6',
  '#4fc3f7',
  '#4dd0e1',
  '#4db6ac',
  '#81c784',
  '#aed581',
  '#dce775',
  '#fff176',
  '#ffb74d',
  '#ff8a65',
];

/** @param {number} index - 第幾筆（0-based，與 finishedPolylines 順序一致） */
export function getNetworkDrawRouteColor(index) {
  const n = NETWORK_DRAW_ROUTE_COLORS.length;
  if (!Number.isFinite(index) || n === 0) return '#666666';
  const i = Math.floor(index);
  return NETWORK_DRAW_ROUTE_COLORS[((i % n) + n) % n];
}
