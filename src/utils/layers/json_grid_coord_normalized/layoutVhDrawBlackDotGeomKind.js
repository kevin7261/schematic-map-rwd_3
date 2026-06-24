/**
 * 版面 VH 繪製中路網黑點：於 **目前 px 映射** 下分類為 水平／垂直／45度線／轉折點（與 SpaceNetworkGridTab 刻度間 segDir 邏輯一致）。
 */

/** @param {unknown} node */
function stationDisplayName(node) {
  if (!node || typeof node !== 'object') return '';
  const tags = node.tags && typeof node.tags === 'object' ? node.tags : {};
  return String(node.station_name ?? tags.station_name ?? tags.name ?? '').trim();
}

/** @param {unknown} a @param {unknown} b */
function sameLayoutSegmentNode(a, b) {
  if (!a || !b) return false;
  const ida = String(a.station_id ?? a.tags?.station_id ?? '').trim();
  const idb = String(b.station_id ?? b.tags?.station_id ?? '').trim();
  if (ida && idb && ida === idb) return true;
  const na = stationDisplayName(a);
  const nb = stationDisplayName(b);
  if (na && nb && na === nb) return true;
  const xa = Number(a.x_grid ?? a.tags?.x_grid);
  const xb = Number(b.x_grid ?? b.tags?.x_grid);
  const ya = Number(a.y_grid ?? a.tags?.y_grid);
  const yb = Number(b.y_grid ?? b.tags?.y_grid);
  if ([xa, xb, ya, yb].every((t) => Number.isFinite(t))) {
    return Math.abs(xa - xb) < 1e-6 && Math.abs(ya - yb) < 1e-6;
  }
  return false;
}

/**
 * @param {object|null|undefined} row — mapDrawn 匯出列
 * @param {number} fallbackArrayIndex — 與 dataJson 陣列索引一致之後備（無路線名時）
 * @returns {string}
 */
export function layoutVhDrawCopyRouteLabelFromExportRow(row, fallbackArrayIndex = 0) {
  const routeParts = [];
  const rn = String(row?.routeName ?? '').trim();
  if (rn) routeParts.push(rn);
  const rid =
    row?.route_id != null && String(row.route_id).trim() !== '' ? String(row.route_id).trim() : '';
  if (rid) routeParts.push(`id:${rid}`);
  const eri = row?.export_row_index;
  if (routeParts.length > 0) return routeParts.join(' · ');
  if (Number.isFinite(Number(eri))) return `匯出列#${eri}`;
  return `匯出列#${fallbackArrayIndex}`;
}

/**
 * @param {object} seg — segment
 * @param {object} midNode — 中段站節點
 * @returns {{ prev: object, current: object, next: object } | null}
 */
export function findLayoutSegmentMidNeighbors(seg, midNode) {
  if (!seg || typeof seg !== 'object' || !midNode || typeof midNode !== 'object') return null;
  const chain = [];
  if (seg.start) chain.push(seg.start);
  if (Array.isArray(seg.stations)) {
    for (const s of seg.stations) chain.push(s);
  }
  if (seg.end) chain.push(seg.end);
  const idx = chain.findIndex((n) => sameLayoutSegmentNode(n, midNode));
  if (idx <= 0 || idx >= chain.length - 1) return null;
  return { prev: chain[idx - 1], current: chain[idx], next: chain[idx + 1] };
}

/**
 * @param {{ 路線?: string, 黑點站名?: string, 前站另一端站名?: string, 後站另一端站名?: string }} parts
 */
export function layoutVhDrawCopyBlackDotRowMatchKey(parts) {
  const a = String(parts?.路線 ?? '');
  const b = String(parts?.黑點站名 ?? '');
  const c = String(parts?.前站另一端站名 ?? '');
  const d = String(parts?.後站另一端站名 ?? '');
  return [a, b, c, d].join('\x00');
}

/**
 * @param {number[][]} gridPts
 * @param {[number,number]} gxy
 * @param {number} dotSegIndex
 * @param {(gx:number, gy:number)=>[number,number]} gridToPx
 * @param {number} [vertexPxEps=2]
 * @returns {'水平'|'垂直'|'45度線'|'轉折點'}
 */
export function classifyLayoutVhDrawBlackDotGeomKind(gridPts, gxy, dotSegIndex, gridToPx, vertexPxEps = 2) {
  if (!Array.isArray(gridPts) || gridPts.length < 2 || !gxy || dotSegIndex < 0) return '45度線';
  const eps = Math.max(0.5, vertexPxEps);
  const gx0 = Number(gxy[0]);
  const gy0 = Number(gxy[1]);
  if (!Number.isFinite(gx0) || !Number.isFinite(gy0)) return '45度線';
  const pxy = gridToPx(gx0, gy0);
  if (!Array.isArray(pxy) || !pxy.every(Number.isFinite)) return '45度線';

  for (let i = 1; i < gridPts.length - 1; i++) {
    const v = gridPts[i];
    const vx = Number(v[0]);
    const vy = Number(v[1]);
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
    const pv = gridToPx(vx, vy);
    if (!Array.isArray(pv) || !pv.every(Number.isFinite)) continue;
    if (Math.hypot(pxy[0] - pv[0], pxy[1] - pv[1]) < eps) {
      return '轉折點';
    }
  }

  if (dotSegIndex >= gridPts.length - 1) return '45度線';
  const sA = gridPts[dotSegIndex];
  const sB = gridPts[dotSegIndex + 1];
  const pxA = gridToPx(Number(sA[0]), Number(sA[1]));
  const pxB = gridToPx(Number(sB[0]), Number(sB[1]));
  if (![pxA, pxB].every((p) => Array.isArray(p) && p.every(Number.isFinite))) return '45度線';
  const adxPx = Math.abs(pxB[0] - pxA[0]);
  const adyPx = Math.abs(pxB[1] - pxA[1]);
  const segEpsPx = 1.0;
  if (adyPx < segEpsPx && adxPx >= segEpsPx) return '水平';
  if (adxPx < segEpsPx && adyPx >= segEpsPx) return '垂直';
  return '45度線';
}

/** 複本層加權：虛線子網格「鄰線寬／高」下限（pt）。低於此值時依 `weight_差值` 由小到大逐步暫隱中段黑點，直到預估鄰線間距皆 ≥ 此值（見 SpaceNetworkGridTab `runCopyWeightedMidFinalize` 前之迭代）。 */
export const LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT = 5;
