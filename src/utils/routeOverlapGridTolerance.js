/**
 * 兩路段共線且區間相交時，重疊長度「超過」此值（格座標單位）才視為違規；
 * 長度 ≤ 此值視為可接受（與 0.1 格刻度一致）。
 */
export const MAX_COLINEAR_ROUTE_OVERLAP_LEN = 0.1;

/** 1D 區間 [lo,hi] 與另一區間的相交長度是否超過容許重疊 */
export function exceedsAllowedColinearOverlap1D(lo, hi) {
  return hi - lo > MAX_COLINEAR_ROUTE_OVERLAP_LEN + 1e-9;
}
