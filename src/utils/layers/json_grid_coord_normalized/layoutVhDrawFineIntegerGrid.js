/**
 * layout_network_grid_from_vh_draw：依邊緣區間黑點 max 之全域極大值 M，將粗格座標放大為整數細格 (m+1) 倍並四捨五入，
 * 供軸刻度與線頂點檢視（資料層 geojson 仍為粗格，僅檢視變換）。
 * 套用細格後：中段黑點可先 **對齊轉折並依錨區均分**，再以整數頂／邊對齊；亦支援僅沿路徑像素弧長之對齊（見 `computeLayoutVhDrawFineBlackDotsTurnRbRedistribute`）。
 */

import {
  mapDrawnExportRowsFromJsonDrawRoot,
  mergeSegmentStationsFromPriorExportRows,
} from '@/utils/mapDrawnRoutesImport.js';
import { LAYER_ID as OSM_2_GEOJSON_2_JSON_LAYER_ID } from '@/utils/layers/osm_2_geojson_2_json/sessionOsmXml.js';
import {
  JSON_GRID_COORD_NORMALIZED_LAYER_ID,
  LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS,
  LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
  POINT_ORTHOGONAL_LAYER_ID,
} from './layerIds.js';

export function buildVhDrawStationRowsForLayoutMap(dataStore, drawLayer) {
  if (!drawLayer) return [];
  let base = mapDrawnExportRowsFromJsonDrawRoot(drawLayer.jsonData, drawLayer.dataJson);
  if (!Array.isArray(base)) base = [];
  let out = base.length ? JSON.parse(JSON.stringify(base)) : [];
  out = mergeSegmentStationsFromPriorExportRows(out, drawLayer.processedJsonData);
  const chainIds = [
    ...LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS,
    POINT_ORTHOGONAL_LAYER_ID,
    JSON_GRID_COORD_NORMALIZED_LAYER_ID,
    OSM_2_GEOJSON_2_JSON_LAYER_ID,
  ];
  for (const id of chainIds) {
    if (id === drawLayer.layerId) continue;
    const src = dataStore.findLayerById(id);
    if (!src) continue;
    out = mergeSegmentStationsFromPriorExportRows(
      out,
      mapDrawnExportRowsFromJsonDrawRoot(src.jsonData, src.dataJson)
    );
    out = mergeSegmentStationsFromPriorExportRows(out, src.processedJsonData);
  }
  return out;
}

export function maxLayoutVhDrawBlackDotsOnLegInOpenXSlab(dotRows, t0, t1) {
  const lo = Math.min(Number(t0), Number(t1));
  const hi = Math.max(Number(t0), Number(t1));
  const tol = 1e-9;
  if (!(hi > lo)) return 0;
  const byLeg = new Map();
  for (let i = 0; i < dotRows.length; i++) {
    const d = dotRows[i];
    const gx = Number(d.gx);
    if (!(gx > lo + tol && gx < hi - tol)) continue;
    const k = `${d.fi}|${d.si}`;
    byLeg.set(k, (byLeg.get(k) ?? 0) + 1);
  }
  let m = 0;
  for (const cnt of byLeg.values()) {
    if (cnt > m) m = cnt;
  }
  return m;
}

export function maxLayoutVhDrawBlackDotsOnLegInOpenYSlab(dotRows, t0, t1) {
  const lo = Math.min(Number(t0), Number(t1));
  const hi = Math.max(Number(t0), Number(t1));
  const tol = 1e-9;
  if (!(hi > lo)) return 0;
  const byLeg = new Map();
  for (let i = 0; i < dotRows.length; i++) {
    const d = dotRows[i];
    const gy = Number(d.gy);
    if (!(gy > lo + tol && gy < hi - tol)) continue;
    const k = `${d.fi}|${d.si}`;
    byLeg.set(k, (byLeg.get(k) ?? 0) + 1);
  }
  let m = 0;
  for (const cnt of byLeg.values()) {
    if (cnt > m) m = cnt;
  }
  return m;
}

/**
 * layout-grid-viewer X 刻度間黑點 max：
 * - X 軸方向帶狀（垂直帶 px0~px1）：只計 H（水平）或 D（45°斜線）段上的黑點，V 段不貢獻 x 方向
 * - 按路線 fi 加總後取最大值，得「該欄間最多有幾顆對 x 方向有貢獻的黑點」
 * - dotRows 每筆需有 segDir（'H'|'V'|'D'）欄位；缺失時視為 D 以向下相容
 */
export function maxLayoutVhDrawBlackDotsOnLegInOpenXSlabPlotPx(dotRows, xScale, marginLeft, px0, px1) {
  const lo = Math.min(Number(px0), Number(px1));
  const hi = Math.max(Number(px0), Number(px1));
  const tol = 1e-4;
  if (!(hi > lo)) return 0;
  const ml = Number(marginLeft);
  const byRoute = new Map();
  for (let i = 0; i < dotRows.length; i++) {
    const d = dotRows[i];
    if (d.segDir === 'V') continue;
    const gx = Number(d.gx);
    if (!Number.isFinite(gx)) continue;
    const px = xScale(gx) - ml;
    if (!(px > lo + tol && px < hi - tol)) continue;
    byRoute.set(d.fi, (byRoute.get(d.fi) ?? 0) + 1);
  }
  let m = 0;
  for (const cnt of byRoute.values()) {
    if (cnt > m) m = cnt;
  }
  return m;
}

/**
 * layout-grid-viewer Y 刻度間黑點 max：
 * - Y 軸方向帶狀（水平帶 py0~py1）：只計 V（垂直）或 D（45°）段上的黑點，H 段不貢獻 y 方向
 * - 按路線 fi 加總後取最大值
 */
export function maxLayoutVhDrawBlackDotsOnLegInOpenYSlabPlotPx(dotRows, yScale, marginTop, py0, py1) {
  const lo = Math.min(Number(py0), Number(py1));
  const hi = Math.max(Number(py0), Number(py1));
  const tol = 1e-4;
  if (!(hi > lo)) return 0;
  const mt = Number(marginTop);
  const byRoute = new Map();
  for (let i = 0; i < dotRows.length; i++) {
    const d = dotRows[i];
    if (d.segDir === 'H') continue;
    const gy = Number(d.gy);
    if (!Number.isFinite(gy)) continue;
    const py = yScale(gy) - mt;
    if (!(py > lo + tol && py < hi - tol)) continue;
    byRoute.set(d.fi, (byRoute.get(d.fi) ?? 0) + 1);
  }
  let m = 0;
  for (const cnt of byRoute.values()) {
    if (cnt > m) m = cnt;
  }
  return m;
}

/**
 * 線段（leg）weight max 之資料單位：每筆代表路線折線的一段 leg，含其格座標包圍範圍與方向／weight。
 * `dir`：'H'（水平）｜'V'（垂直）｜'D'（45° 斜）；`weight`：該 leg 所屬「站→下一站」交通邊之 traffic_weight。
 * 與黑點 max 不同：weight 屬於「線」而非「點」，故以 leg 之跨距判斷落在哪些刻度間，會涵蓋其跨越的每一欄／列。
 * @typedef {{ fi:number, gx0:number, gx1:number, gy0:number, gy1:number, dir:('H'|'V'|'D'), weight:number }} LayoutWeightedLeg
 */

/**
 * layout-grid-viewer X 刻度間「線 weight max」（格座標版）：
 * - 下排（X）只看橫線（H）與 45° 斜線（D），排除垂直線（V）
 * - 凡 leg 之 gx 跨距與欄開區間 (t0,t1) 有重疊者納入，回傳其 traffic_weight 最大值
 */
export function maxLayoutVhDrawLineWeightInOpenXSlab(legs, t0, t1) {
  const lo = Math.min(Number(t0), Number(t1));
  const hi = Math.max(Number(t0), Number(t1));
  const tol = 1e-9;
  if (!(hi > lo)) return 0;
  let m = 0;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (L.dir === 'V') continue;
    const a = Number(L.gx0);
    const b = Number(L.gx1);
    if (!(b > lo + tol && a < hi - tol)) continue;
    const w = Number(L.weight);
    if (Number.isFinite(w) && w > m) m = w;
  }
  return m;
}

/**
 * layout-grid-viewer Y 刻度間「線 weight max」（格座標版）：
 * - 左排（Y）只看直線（V）與 45° 斜線（D），排除水平線（H）
 * - 凡 leg 之 gy 跨距與列開區間 (t0,t1) 有重疊者納入，回傳其 traffic_weight 最大值
 */
export function maxLayoutVhDrawLineWeightInOpenYSlab(legs, t0, t1) {
  const lo = Math.min(Number(t0), Number(t1));
  const hi = Math.max(Number(t0), Number(t1));
  const tol = 1e-9;
  if (!(hi > lo)) return 0;
  let m = 0;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (L.dir === 'H') continue;
    const a = Number(L.gy0);
    const b = Number(L.gy1);
    if (!(b > lo + tol && a < hi - tol)) continue;
    const w = Number(L.weight);
    if (Number.isFinite(w) && w > m) m = w;
  }
  return m;
}

/**
 * layout-grid-viewer X 刻度間「線 weight max」（plot px 版）：下排只看 H／D，排除 V；
 * 以 leg 在 plot px 的 x 跨距與欄帶 (px0,px1) 重疊判斷，回傳 max(weight)。
 */
export function maxLayoutVhDrawLineWeightInOpenXSlabPlotPx(legs, xScale, marginLeft, px0, px1) {
  const lo = Math.min(Number(px0), Number(px1));
  const hi = Math.max(Number(px0), Number(px1));
  const tol = 1e-4;
  if (!(hi > lo)) return 0;
  const ml = Number(marginLeft);
  let m = 0;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (L.dir === 'V') continue;
    const pa = xScale(Number(L.gx0)) - ml;
    const pb = xScale(Number(L.gx1)) - ml;
    const a = Math.min(pa, pb);
    const b = Math.max(pa, pb);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (!(b > lo + tol && a < hi - tol)) continue;
    const w = Number(L.weight);
    if (Number.isFinite(w) && w > m) m = w;
  }
  return m;
}

/**
 * layout-grid-viewer Y 刻度間「線 weight max」（plot px 版）：左排只看 V／D，排除 H；
 * 以 leg 在 plot px 的 y 跨距與列帶 (py0,py1) 重疊判斷，回傳 max(weight)。
 */
export function maxLayoutVhDrawLineWeightInOpenYSlabPlotPx(legs, yScale, marginTop, py0, py1) {
  const lo = Math.min(Number(py0), Number(py1));
  const hi = Math.max(Number(py0), Number(py1));
  const tol = 1e-4;
  if (!(hi > lo)) return 0;
  const mt = Number(marginTop);
  let m = 0;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (L.dir === 'H') continue;
    const pa = yScale(Number(L.gy0)) - mt;
    const pb = yScale(Number(L.gy1)) - mt;
    const a = Math.min(pa, pb);
    const b = Math.max(pa, pb);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (!(b > lo + tol && a < hi - tol)) continue;
    const w = Number(L.weight);
    if (Number.isFinite(w) && w > m) m = w;
  }
  return m;
}

function gcdNonNegative(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y > 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function gridXYAndSegAtGridDistanceAlong(gridPts, targetDist) {
  if (!gridPts || gridPts.length < 2) return null;
  const lens = [];
  let total = 0;
  for (let i = 0; i < gridPts.length - 1; i++) {
    const L = Math.hypot(gridPts[i + 1][0] - gridPts[i][0], gridPts[i + 1][1] - gridPts[i][1]);
    lens.push(L);
    total += L;
  }
  if (!(total > 0) || !Number.isFinite(targetDist) || targetDist <= 0) {
    return { gx: gridPts[0][0], gy: gridPts[0][1], segIndex: 0 };
  }
  const d = Math.min(targetDist, total);
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    const L = lens[i];
    if (acc + L >= d) {
      const t = L > 0 ? (d - acc) / L : 0;
      const g0 = gridPts[i];
      const g1 = gridPts[i + 1];
      return {
        gx: g0[0] + t * (g1[0] - g0[0]),
        gy: g0[1] + t * (g1[1] - g0[1]),
        segIndex: i,
      };
    }
    acc += L;
  }
  const last = gridPts[gridPts.length - 1];
  return { gx: last[0], gy: last[1], segIndex: gridPts.length - 2 };
}

/**
 * 沿路徑之 **像素** 歐氏長度累積至 targetDist，回傳該處以格座標線性內插之 (gx,gy) 與所在邊 index（與僅畫線時之弧長比例一致）。
 *
 * @param {[number,number][]} gridPts
 * @param {number} targetDist
 * @param {(gx: number, gy: number) => [number, number]} gridToPx
 */
function gridXYAndSegAtPixelDistanceAlong(gridPts, targetDist, gridToPx) {
  if (!gridPts || gridPts.length < 2 || typeof gridToPx !== 'function') return null;
  const lens = [];
  let total = 0;
  for (let i = 0; i < gridPts.length - 1; i++) {
    const g0 = gridPts[i];
    const g1 = gridPts[i + 1];
    const p0 = gridToPx(g0[0], g0[1]);
    const p1 = gridToPx(g1[0], g1[1]);
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    lens.push(L);
    total += L;
  }
  if (!(total > 0) || !Number.isFinite(targetDist) || targetDist <= 0) {
    return { gx: gridPts[0][0], gy: gridPts[0][1], segIndex: 0 };
  }
  const d = Math.min(targetDist, total);
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    const L = lens[i];
    if (acc + L >= d) {
      const t = L > 0 ? (d - acc) / L : 0;
      const g0 = gridPts[i];
      const g1 = gridPts[i + 1];
      return {
        gx: g0[0] + t * (g1[0] - g0[0]),
        gy: g0[1] + t * (g1[1] - g0[1]),
        segIndex: i,
      };
    }
    acc += L;
  }
  const last = gridPts[gridPts.length - 1];
  return { gx: last[0], gy: last[1], segIndex: gridPts.length - 2 };
}

export function gridXYAtGridDistanceAlongLineString(gridPts, targetDist) {
  const hit = gridXYAndSegAtGridDistanceAlong(gridPts, targetDist);
  if (!hit) return null;
  return [hit.gx, hit.gy];
}

/**
 * 與 {@link gridXYAtGridDistanceAlongLineString} 相同弧長目標，但座標對齊至該邊開區間內之 **整數格線交叉點**
 * （正交由線段約束取整數；對角／斜線取 gcd 格點中弧長最接近者）。
 * 若該邊段內無任何允許之中段格點（例如 gcd=1），回傳 null。
 *
 * @param {[number,number][]} gridPts
 * @param {number} targetDist
 * @param {number} [eps=1e-3]
 * @returns {[number,number]|null}
 */
export function integerLatticeBlackDotAtGridArcLengthAlongOrthoLineString(
  gridPts,
  targetDist,
  eps = 1e-3
) {
  const hit = gridXYAndSegAtGridDistanceAlong(gridPts, targetDist);
  if (!hit) return null;
  const g0 = gridPts[hit.segIndex];
  const g1 = gridPts[hit.segIndex + 1];
  if (!g0 || !g1) return null;
  return snapSegmentInteriorToIntegerLattice(g0[0], g0[1], g1[0], g1[1], hit.gx, hit.gy, eps);
}

/**
 * 沿路徑 **像素弧長** 定位（與僅視覺按比例之中段相同），再以格線整數對齊至合法網格交叉點。
 *
 * @param {[number,number][]} gridPts
 * @param {number} targetPx
 * @param {(gx: number, gy: number) => [number, number]} gridToPx
 * @param {number} [eps=1e-3]
 */
export function integerLatticeBlackDotAtPixelArcLengthAlongLineString(
  gridPts,
  targetPx,
  gridToPx,
  eps = 1e-3
) {
  const hit = gridXYAndSegAtPixelDistanceAlong(gridPts, targetPx, gridToPx);
  if (!hit) return null;
  const g0 = gridPts[hit.segIndex];
  const g1 = gridPts[hit.segIndex + 1];
  if (!g0 || !g1) return null;
  return snapSegmentInteriorToIntegerLattice(g0[0], g0[1], g1[0], g1[1], hit.gx, hit.gy, eps);
}

/**
 * 弧長插值點 (rawGx,rawGy) 為參考，回傳同邊開區間內之 **整數格點**，且須為粗／細格細分化後仍可落在線段上的格子（對角為 gcd 內插）。
 *
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} rawGx
 * @param {number} rawGy
 * @param {number} eps
 * @returns {[number,number]|null}
 */
export function snapSegmentInteriorToIntegerLattice(ax, ay, bx, by, rawGx, rawGy, eps = 1e-3) {
  if (![ax, ay, bx, by, rawGx, rawGy].every(Number.isFinite)) return null;
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) < eps && Math.abs(dy) < eps) {
    return [Math.round(ax), Math.round(ay)];
  }
  if (Math.abs(dx) < eps && Math.abs(dy) >= eps) {
    const x = Math.round(ax);
    const lo = Math.min(ay, by);
    const hi = Math.max(ay, by);
    const loI = Math.ceil(lo + eps);
    const hiI = Math.floor(hi - eps);
    if (loI > hiI) return null;
    const y = Math.max(loI, Math.min(hiI, Math.round(rawGy)));
    return [x, y];
  }
  if (Math.abs(dy) < eps && Math.abs(dx) >= eps) {
    const y = Math.round(ay);
    const lo = Math.min(ax, bx);
    const hi = Math.max(ax, bx);
    const loI = Math.ceil(lo + eps);
    const hiI = Math.floor(hi - eps);
    if (loI > hiI) return null;
    const x = Math.max(loI, Math.min(hiI, Math.round(rawGx)));
    return [x, y];
  }

  const ax0 = Math.round(ax);
  const ay0 = Math.round(ay);
  const bx0 = Math.round(bx);
  const by0 = Math.round(by);
  const rdx = bx0 - ax0;
  const rdy = by0 - ay0;
  const gstep = gcdNonNegative(rdx, rdy);
  if (!(gstep > 1)) return null;

  const sx = rdx / gstep;
  const sy = rdy / gstep;
  const stepLen = Math.hypot(sx, sy);
  if (!(stepLen > 0)) return null;

  const wx = bx - ax;
  const wy = by - ay;
  const vv = wx * wx + wy * wy;
  const distAlong =
    vv > 1e-24
      ? Math.min(1, Math.max(0, ((rawGx - ax) * wx + (rawGy - ay) * wy) / vv)) * Math.sqrt(vv)
      : 0;

  let bestK = 1;
  let bestErr = Infinity;
  for (let k = 1; k <= gstep - 1; k++) {
    const err = Math.abs(k * stepLen - distAlong);
    if (err < bestErr) {
      bestErr = err;
      bestK = k;
    }
  }
  return [ax0 + sx * bestK, ay0 + sy * bestK];
}

/**
 * 與插入之 (M+1) 細分網格一致：粗格座標下，區間內之點須滿足
 * \( (gx-x0)\cdot s,\ (gy-y0)\cdot s \) 為整數（s=M+1）；
 * orthogonal / gcd 斜段之合法內點，取距 (rawGx, rawGy) 最近者。
 *
 * @param {{ m: number, x0: number, y0: number }} spec
 */
export function snapSegmentInteriorToFineSubgridLattice(
  ax,
  ay,
  bx,
  by,
  rawGx,
  rawGy,
  spec,
  eps = 1e-3
) {
  if (![ax, ay, bx, by, rawGx, rawGy].every(Number.isFinite)) return null;
  if (
    !spec ||
    !Number.isFinite(spec.m) ||
    !Number.isFinite(spec.x0) ||
    !Number.isFinite(spec.y0)
  ) {
    return snapSegmentInteriorToIntegerLattice(ax, ay, bx, by, rawGx, rawGy, eps);
  }
  const M = Math.max(0, Math.floor(Number(spec.m)));
  const s = M + 1;
  if (s < 2) return snapSegmentInteriorToIntegerLattice(ax, ay, bx, by, rawGx, rawGy, eps);

  const x0 = Number(spec.x0);
  const y0 = Number(spec.y0);
  const dx = bx - ax;
  const dy = by - ay;
  let bestGx = NaN;
  let bestGy = NaN;
  let bestDist = Infinity;

  const consider = (gx, gy) => {
    if (![gx, gy].every(Number.isFinite)) return;
    const fx = (gx - x0) * s;
    const fy = (gy - y0) * s;
    if (Math.abs(fx - Math.round(fx)) > eps || Math.abs(fy - Math.round(fy)) > eps) return;
    const wx = bx - ax;
    const wy = by - ay;
    const vv = wx * wx + wy * wy;
    if (!(vv > 1e-24)) return;
    const t = ((gx - ax) * wx + (gy - ay) * wy) / vv;
    if (t <= eps || t >= 1 - eps) return;
    const px = ax + t * wx;
    const py = ay + t * wy;
    if (Math.hypot(px - gx, py - gy) > 2e-2) return;
    const d = (gx - rawGx) ** 2 + (gy - rawGy) ** 2;
    if (d < bestDist - 1e-18) {
      bestDist = d;
      bestGx = gx;
      bestGy = gy;
    }
  };

  if (Math.abs(dx) < eps && Math.abs(dy) < eps) {
    return [Math.round(ax), Math.round(ay)];
  }
  if (Math.abs(dx) < eps && Math.abs(dy) >= eps) {
    const gx = ax;
    const lo = Math.min(ay, by);
    const hi = Math.max(ay, by);
    const fyLo = Math.ceil((lo + eps - y0) * s);
    const fyHi = Math.floor((hi - eps - y0) * s);
    if (fyLo > fyHi) return null;
    const fyT = Math.round((rawGy - y0) * s);
    const fy = Math.max(fyLo, Math.min(fyHi, fyT));
    return [gx, y0 + fy / s];
  }
  if (Math.abs(dy) < eps && Math.abs(dx) >= eps) {
    const gy = ay;
    const lo = Math.min(ax, bx);
    const hi = Math.max(ax, bx);
    const fxLo = Math.ceil((lo + eps - x0) * s);
    const fxHi = Math.floor((hi - eps - x0) * s);
    if (fxLo > fxHi) return null;
    const fxT = Math.round((rawGx - x0) * s);
    const fx = Math.max(fxLo, Math.min(fxHi, fxT));
    return [x0 + fx / s, gy];
  }

  const minx = Math.min(ax, bx);
  const maxx = Math.max(ax, bx);
  const nxA = Math.floor((minx - x0) * s) - 2;
  const nxB = Math.ceil((maxx - x0) * s) + 2;

  if (Math.abs(dx) >= eps) {
    for (let nx = nxA; nx <= nxB; nx++) {
      const gx = x0 + nx / s;
      const t = (gx - ax) / dx;
      if (t <= eps || t >= 1 - eps) continue;
      const gy = ay + t * dy;
      const ny = Math.round((gy - y0) * s);
      const gySnap = y0 + ny / s;
      consider(gx, gySnap);
    }
  }

  const miny = Math.min(ay, by);
  const maxy = Math.max(ay, by);
  const nyA = Math.floor((miny - y0) * s) - 2;
  const nyB = Math.ceil((maxy - y0) * s) + 2;

  if (Math.abs(dy) >= eps) {
    for (let ny = nyA; ny <= nyB; ny++) {
      const gy = y0 + ny / s;
      const t = (gy - ay) / dy;
      if (t <= eps || t >= 1 - eps) continue;
      const gx = ax + t * dx;
      const nx = Math.round((gx - x0) * s);
      const gxSnap = x0 + nx / s;
      consider(gxSnap, gy);
    }
  }

  if (Number.isFinite(bestGx) && Number.isFinite(bestGy)) return [bestGx, bestGy];
  return snapSegmentInteriorToIntegerLattice(ax, ay, bx, by, rawGx, rawGy, eps);
}

/**
 * 像素弧長定位後對齊至 **粗格視圖** 插入之 (M+1) 細分網格（與 `computeLayoutVhDrawFineGridSpec` 同源）。
 *
 * @param {{ m: number, x0: number, y0: number }} fineSubgridSpec
 */
export function integerLatticeBlackDotAtPixelArcLengthAlongFineSubgridLineString(
  gridPts,
  targetPx,
  gridToPx,
  fineSubgridSpec,
  eps = 1e-3
) {
  const hit = gridXYAndSegAtPixelDistanceAlong(gridPts, targetPx, gridToPx);
  if (!hit) return null;
  const g0 = gridPts[hit.segIndex];
  const g1 = gridPts[hit.segIndex + 1];
  if (!g0 || !g1) return null;
  return snapSegmentInteriorToFineSubgridLattice(
    g0[0],
    g0[1],
    g1[0],
    g1[1],
    hit.gx,
    hit.gy,
    fineSubgridSpec,
    eps
  );
}

function latticeAlmostInt(x, tol) {
  return Math.abs(Number(x) - Math.round(Number(x))) <= tol;
}

/**
 * 粗格視圖：將 (gx,gy) 對到折線上距離最近且落在插入細分網格整數座標（含合法「格点」頂點）之點。
 */
export function snapBlackDotGxGyToFineSubgridAlongPolyline(gridPts, gx, gy, spec, eps = 1e-3) {
  if (
    !Array.isArray(gridPts) ||
    gridPts.length < 1 ||
    !Number.isFinite(Number(gx)) ||
    !Number.isFinite(Number(gy))
  ) {
    return null;
  }
  if (
    !spec ||
    !Number.isFinite(spec.m) ||
    !Number.isFinite(spec.x0) ||
    !Number.isFinite(spec.y0)
  ) {
    return null;
  }
  const M = Math.max(0, Math.floor(Number(spec.m)));
  const s = M + 1;
  if (s < 2) return null;
  const x0 = Number(spec.x0);
  const y0 = Number(spec.y0);
  let best = null;
  let bestD = Infinity;
  for (let vi = 0; vi < gridPts.length; vi++) {
    const vx = Number(gridPts[vi][0]);
    const vy = Number(gridPts[vi][1]);
    if (![vx, vy].every(Number.isFinite)) continue;
    const ffx = (vx - x0) * s;
    const ffy = (vy - y0) * s;
    if (!latticeAlmostInt(ffx, eps) || !latticeAlmostInt(ffy, eps)) continue;
    const d = (vx - gx) ** 2 + (vy - gy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [vx, vy];
    }
  }
  for (let i = 0; i < gridPts.length - 1; i++) {
    const g0 = gridPts[i];
    const g1 = gridPts[i + 1];
    if (!Array.isArray(g0) || !Array.isArray(g1)) continue;
    const snapped = snapSegmentInteriorToFineSubgridLattice(
      g0[0],
      g0[1],
      g1[0],
      g1[1],
      gx,
      gy,
      spec,
      eps
    );
    if (!snapped) continue;
    const d = (snapped[0] - gx) ** 2 + (snapped[1] - gy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = snapped;
    }
  }
  return best;
}

/**
 * 細格座標視圖：對到折線上距離最近之 **整數網格交叉**（與整數格對齊）。
 */
export function snapBlackDotGxGyToIntegerLatticeAlongPolyline(gridPts, gx, gy, eps = 1e-3) {
  if (
    !Array.isArray(gridPts) ||
    gridPts.length < 1 ||
    !Number.isFinite(Number(gx)) ||
    !Number.isFinite(Number(gy))
  ) {
    return null;
  }
  let best = null;
  let bestD = Infinity;
  for (let vi = 0; vi < gridPts.length; vi++) {
    const vx = Number(gridPts[vi][0]);
    const vy = Number(gridPts[vi][1]);
    if (![vx, vy].every(Number.isFinite)) continue;
    if (!latticeAlmostInt(vx, eps) || !latticeAlmostInt(vy, eps)) continue;
    const xr = Math.round(vx);
    const yr = Math.round(vy);
    const d = (xr - gx) ** 2 + (yr - gy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [xr, yr];
    }
  }
  for (let i = 0; i < gridPts.length - 1; i++) {
    const g0 = gridPts[i];
    const g1 = gridPts[i + 1];
    if (!Array.isArray(g0) || !Array.isArray(g1)) continue;
    const snapped = snapSegmentInteriorToIntegerLattice(
      g0[0],
      g0[1],
      g1[0],
      g1[1],
      gx,
      gy,
      eps
    );
    if (!snapped) continue;
    const d = (snapped[0] - gx) ** 2 + (snapped[1] - gy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = snapped;
    }
  }
  return best;
}

function cumPxAtVertices(gridPts, gridToPx) {
  const n = gridPts.length;
  const cum = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const p0 = gridToPx(gridPts[i - 1][0], gridPts[i - 1][1]);
    const p1 = gridToPx(gridPts[i][0], gridPts[i][1]);
    cum[i] = cum[i - 1] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  }
  return cum;
}

/**
 * Polyline interior vertices whose 進出邊向量不共線視為「轉折點」（先直後橫網格轉折）。
 * @returns {number[]} 頂點索引集合（不包含 0 與末端）
 */
export function layoutVhDrawInteriorTurnVertexIndices(gridPts, epsGeom = 1e-10) {
  const out = [];
  if (!Array.isArray(gridPts) || gridPts.length < 3) return out;
  for (let i = 1; i < gridPts.length - 1; i++) {
    const ax = gridPts[i][0] - gridPts[i - 1][0];
    const ay = gridPts[i][1] - gridPts[i - 1][1];
    const bx = gridPts[i + 1][0] - gridPts[i][0];
    const by = gridPts[i + 1][1] - gridPts[i][1];
    const lenA = Math.hypot(ax, ay);
    const lenB = Math.hypot(bx, by);
    if (lenA <= epsGeom || lenB <= epsGeom) continue;
    const cross = ax * by - ay * bx;
    if (Math.abs(cross) > epsGeom * Math.min(lenA, lenB)) {
      out.push(i);
    }
  }
  return out;
}

function uniqSortArcs(pxVals, uniqTolPx) {
  const s = [...pxVals].sort((a, b) => a - b);
  if (s.length === 0) return [0];
  const out = [s[0]];
  let last = s[0];
  for (let z = 1; z < s.length; z++) {
    const v = s[z];
    if (Math.abs(v - last) > uniqTolPx) {
      out.push(v);
      last = v;
    }
  }
  return out;
}

/**
 * 格平面距離對折線之垂足，與對應 **沿路徑像素弧長**（與細格中段 pixel 度量一致）。
 * @returns {{ arcPx: number, distGridSq: number }}
 */
function arcPxClosestGridFootAlongPolyline(gridPts, gx, gy, gridToPx) {
  let bestDg2 = Infinity;
  /** @type {number} */
  let bestArc = NaN;
  let cumSegStart = 0;
  for (let i = 0; i < gridPts.length - 1; i++) {
    const ax = Number(gridPts[i][0]);
    const ay = Number(gridPts[i][1]);
    const bx = Number(gridPts[i + 1][0]);
    const by = Number(gridPts[i + 1][1]);
    const wx = bx - ax;
    const wy = by - ay;
    const vv = wx * wx + wy * wy;
    const tt = vv > 1e-24 ? Math.min(1, Math.max(0, ((gx - ax) * wx + (gy - ay) * wy) / vv)) : 0;
    const fx = ax + tt * wx;
    const fy = ay + tt * wy;
    const dg2 = (gx - fx) * (gx - fx) + (gy - fy) * (gy - fy);
    const p0 = gridToPx(ax, ay);
    const p1 = gridToPx(bx, by);
    const segLenPx = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const arcPx = cumSegStart + tt * segLenPx;
    cumSegStart += segLenPx;
    if (dg2 < bestDg2 && Number.isFinite(arcPx)) {
      bestDg2 = dg2;
      bestArc = arcPx;
    }
  }
  return { arcPx: bestArc, distGridSq: bestDg2 };
}

/** Greedy：每轉折頂至多配一個黑點索引 k，每個 k 至多對一轉折頂（全體最小 |理想弧長 − 轉折弧長| 優先）。 */
function greedyAssignKsToTurnVertices(turnVis, cumPx, nSta, totalPx) {
  const cand = [];
  const seen = Array.isArray(turnVis) ? turnVis.filter(Number.isFinite).sort((a, b) => a - b) : [];
  for (const vi of seen) {
    const arcPx = cumPx[vi];
    if (!Number.isFinite(arcPx)) continue;
    for (let k = 1; k <= nSta; k++) {
      const ideal = (k * totalPx) / (nSta + 1);
      cand.push({ k, vi, d: Math.abs(ideal - arcPx) });
    }
  }
  cand.sort((a, b) => a.d - b.d || a.k - b.k || a.vi - b.vi);
  /** @type {Record<number, number>} */
  const kToVi = {};
  /** @type {Set<number>} */
  const viUsed = new Set();
  /** @type {Set<number>} */
  const kUsed = new Set();
  for (const c of cand) {
    if (kUsed.has(c.k) || viUsed.has(c.vi)) continue;
    kUsed.add(c.k);
    viUsed.add(c.vi);
    kToVi[c.k] = c.vi;
  }
  return kToVi;
}

/**
 * 細格中段黑點：① 對每個轉折頂以 **弧長最接近** 指派一個黑點到該整數頂格；② 其餘在相鄰錨（起／末、轉折、沿路線投影且在格誤差內之紅／藍車站）之間沿 **像素弧長** 均分，並整數對齊。
 *
 * @param {{ rbStationsGxGy?: Array<{ gx: number; gy: number }>, latticeEpsGrid?: number, coordMatchEpsGrid?: number, uniqArcPxTol?: number, fineSubgridSpec?: { m: number, x0: number, y0: number } | null }} [opt]
 * @returns {( [number, number] | null )[]} 長度 `nSta`：第 index 對應 k=index+1
 */
export function computeLayoutVhDrawFineBlackDotsTurnRbRedistribute(
  gridPts,
  nSta,
  gridToPx,
  opt = {}
) {
  /** @type {( [number, number] | null )[]} */
  const out = Array.from({ length: Math.max(0, nSta) }, () => null);
  const latticeEps = Number.isFinite(opt.latticeEpsGrid) ? opt.latticeEpsGrid : 1e-3;
  const epsCoord =
    typeof opt.coordMatchEpsGrid === 'number' && Number.isFinite(opt.coordMatchEpsGrid)
      ? opt.coordMatchEpsGrid
      : 1e-2;
  const uniqTol =
    typeof opt.uniqArcPxTol === 'number' && Number.isFinite(opt.uniqArcPxTol)
      ? opt.uniqArcPxTol
      : 1e-4;
  const rbList = Array.isArray(opt.rbStationsGxGy) ? opt.rbStationsGxGy : [];
  const fs = opt.fineSubgridSpec;
  const fineSub =
    fs &&
    Number.isFinite(fs.m) &&
    Number.isFinite(fs.x0) &&
    Number.isFinite(fs.y0) &&
    Math.floor(fs.m) > 0;

  if (!Array.isArray(gridPts) || gridPts.length < 2 || nSta <= 0 || typeof gridToPx !== 'function')
    return out;

  const cumPx = cumPxAtVertices(gridPts, gridToPx);
  const totalPx = cumPx[cumPx.length - 1];
  if (!(totalPx > 0)) return out;

  const turns = layoutVhDrawInteriorTurnVertexIndices(gridPts);
  const kToTurnVi = greedyAssignKsToTurnVertices(turns, cumPx, nSta, totalPx);
  const usedK = new Set();

  for (const [ks, vi] of Object.entries(kToTurnVi)) {
    const k = Number(ks);
    if (!Number.isFinite(k) || k < 1 || k > nSta || typeof vi !== 'number') continue;
    out[k - 1] = [Math.round(gridPts[vi][0]), Math.round(gridPts[vi][1])];
    usedK.add(k);
  }

  const anchorSet = new Set();
  anchorSet.add(0);
  anchorSet.add(totalPx);
  for (const vi of turns) {
    anchorSet.add(cumPx[vi]);
  }
  for (const rb of rbList) {
    const gx = Number(rb.gx);
    const gy = Number(rb.gy);
    const foot = arcPxClosestGridFootAlongPolyline(gridPts, gx, gy, gridToPx);
    if (foot && foot.distGridSq <= epsCoord * epsCoord && Number.isFinite(foot.arcPx)) {
      anchorSet.add(foot.arcPx);
    }
  }
  const ua = uniqSortArcs([...anchorSet], uniqTol);

  /** @type {number[][]} */
  const bucket = ua.length > 1 ? Array.from({ length: ua.length - 1 }, () => []) : [];

  const relGap = Math.max(1e-9, totalPx * 1e-12);
  for (let kk = 1; kk <= nSta; kk++) {
    if (usedK.has(kk)) continue;
    const ideal = (kk * totalPx) / (nSta + 1);
    let slot = -1;
    if (bucket.length === 1) slot = 0;
    else {
      for (let j = 0; j < ua.length - 1; j++) {
        const L = ua[j];
        const R = ua[j + 1];
        if (ideal > L + relGap && ideal < R - relGap) {
          slot = j;
          break;
        }
      }
    }
    if (slot >= 0) bucket[slot].push(kk);
    else {
      /** 數值落在錨上等邊界：塞入最接近之有效區間（含單區間備援） */
      let bestGap = Infinity;
      let bestJ = 0;
      for (let j = 0; j < ua.length - 1; j++) {
        const L = ua[j];
        const R = ua[j + 1];
        const mid = 0.5 * (L + R);
        const g = Math.abs(ideal - mid);
        if (R - L > relGap && g < bestGap) {
          bestGap = g;
          bestJ = j;
        }
      }
      bucket[bestJ].push(kk);
    }
  }

  for (let j = 0; j < bucket.length; j++) {
    const ks = bucket[j];
    if (!ks || ks.length === 0) continue;
    ks.sort((a, b) => a - b);
    const L = ua[j];
    const R = ua[j + 1];
    const spanPx = R - L;
    if (!(spanPx > relGap)) continue;
    const m = ks.length;
    for (let t = 0; t < m; t++) {
      const k = ks[t];
      const frac = (t + 1) / (m + 1);
      let pxTar = L + frac * spanPx;
      pxTar = Math.min(totalPx - relGap * 100, Math.max(relGap * 100, pxTar));
      let snapped = fineSub
        ? integerLatticeBlackDotAtPixelArcLengthAlongFineSubgridLineString(
            gridPts,
            pxTar,
            gridToPx,
            fs,
            latticeEps
          )
        : integerLatticeBlackDotAtPixelArcLengthAlongLineString(
            gridPts,
            pxTar,
            gridToPx,
            latticeEps
          );
      if (!snapped) {
        const hit = gridXYAndSegAtPixelDistanceAlong(gridPts, pxTar, gridToPx);
        if (hit) {
          const g0 = gridPts[hit.segIndex];
          const g1 = gridPts[hit.segIndex + 1];
          if (g0 && g1) {
            snapped = fineSub
              ? snapSegmentInteriorToFineSubgridLattice(
                  g0[0],
                  g0[1],
                  g1[0],
                  g1[1],
                  hit.gx,
                  hit.gy,
                  fs,
                  latticeEps
                )
              : snapSegmentInteriorToIntegerLattice(
                  g0[0],
                  g0[1],
                  g1[0],
                  g1[1],
                  hit.gx,
                  hit.gy,
                  latticeEps
                );
          }
          if (!snapped) {
            if (fineSub) {
              snapped = snapBlackDotGxGyToFineSubgridAlongPolyline(
                gridPts,
                hit.gx,
                hit.gy,
                fs,
                latticeEps
              );
            }
            if (!snapped) snapped = [Math.round(hit.gx), Math.round(hit.gy)];
          }
        }
      }
      out[k - 1] = snapped;
    }
  }

  return out;
}

/**
 * 與網格示意中段黑點同源，但弧長以 **格座標歐氏長度** 計（與縮放無關）。
 */
export function buildLayoutNetworkVhDrawMaxBlackDotsPerOrthoLine(dataStore, routeFeatures) {
  const drawLayer = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
  const exportRowsForSta = buildVhDrawStationRowsForLayoutMap(dataStore, drawLayer);
  const eps = 1e-3;
  const layoutEpXY = (ep) => {
    if (!ep || typeof ep !== 'object') return [NaN, NaN];
    const x = Number(ep.x_grid ?? ep.lon);
    const y = Number(ep.y_grid ?? ep.lat);
    return [x, y];
  };
  const layoutFindRowForLineGrid = (gridPts, rows) => {
    if (!Array.isArray(gridPts) || gridPts.length < 2 || !Array.isArray(rows)) return null;
    const g0 = gridPts[0];
    const g1 = gridPts[gridPts.length - 1];
    for (const row of rows) {
      const seg = row?.segment;
      if (!seg) continue;
      const [ax, ay] = layoutEpXY(seg.start);
      const [bx, by] = layoutEpXY(seg.end);
      if (![ax, ay, bx, by].every(Number.isFinite)) continue;
      const fw =
        Math.abs(g0[0] - ax) < eps &&
        Math.abs(g0[1] - ay) < eps &&
        Math.abs(g1[0] - bx) < eps &&
        Math.abs(g1[1] - by) < eps;
      const bw =
        Math.abs(g0[0] - bx) < eps &&
        Math.abs(g0[1] - by) < eps &&
        Math.abs(g1[0] - ax) < eps &&
        Math.abs(g1[1] - ay) < eps;
      if (fw || bw) return row;
    }
    return null;
  };
  const layoutMidStationCountFromJsonRow = (row) => {
    const mids = Array.isArray(row?.segment?.stations) ? row.segment.stations : [];
    if (mids.length === 0) return 0;
    let n = 0;
    for (const m of mids) {
      if (!m || typeof m !== 'object') continue;
      if (m.node_type === 'connect') continue;
      n++;
    }
    return n > 0 ? n : mids.length;
  };

  const vertEdgeKeyToCount = new Map();
  const horzEdgeKeyToCount = new Map();
  const bumpEdge = (map, key) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const dotsForBandMax = [];
  const layoutLineFeatCount = routeFeatures.filter(
    (f) => f?.geometry?.type === 'LineString'
  ).length;
  let layoutLineFeatIdx = 0;

  for (let fi = 0; fi < routeFeatures.length; fi++) {
    const rf = routeFeatures[fi];
    if (!rf?.geometry || rf.geometry.type !== 'LineString') continue;
    const coords = rf.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const gridPts = coords.map((c) => [Number(c[0]), Number(c[1])]);
    let row = layoutFindRowForLineGrid(gridPts, exportRowsForSta);
    if (!row && exportRowsForSta.length > 0 && layoutLineFeatCount === exportRowsForSta.length) {
      row = exportRowsForSta[layoutLineFeatIdx] ?? null;
    }
    layoutLineFeatIdx += 1;
    const nSta = row ? layoutMidStationCountFromJsonRow(row) : 0;
    if (nSta <= 0) continue;

    let totalGrid = 0;
    for (let i = 0; i < gridPts.length - 1; i++) {
      totalGrid += Math.hypot(gridPts[i + 1][0] - gridPts[i][0], gridPts[i + 1][1] - gridPts[i][1]);
    }
    if (!(totalGrid > 0)) continue;

    for (let k = 1; k <= nSta; k++) {
      const target = (k * totalGrid) / (nSta + 1);
      const hit = gridXYAndSegAtGridDistanceAlong(gridPts, target);
      if (!hit) continue;
      dotsForBandMax.push({
        gx: hit.gx,
        gy: hit.gy,
        fi,
        si: hit.segIndex,
      });
      const si = hit.segIndex;
      const g0 = gridPts[si];
      const g1 = gridPts[si + 1];
      if (!g0 || !g1) continue;
      const ax = g0[0];
      const ay = g0[1];
      const bx = g1[0];
      const by = g1[1];
      if (Math.abs(ax - bx) < eps && Math.abs(ay - by) >= eps) {
        const xLine = Math.round(ax);
        bumpEdge(vertEdgeKeyToCount, `${xLine}|${fi}|${si}`);
      } else if (Math.abs(ay - by) < eps && Math.abs(ax - bx) >= eps) {
        const yLine = Math.round(ay);
        bumpEdge(horzEdgeKeyToCount, `${yLine}|${fi}|${si}`);
      }
    }
  }

  const maxVertLineByX = new Map();
  for (const [key, cnt] of vertEdgeKeyToCount) {
    const xLine = Number(String(key).split('|')[0]);
    if (!Number.isFinite(xLine)) continue;
    maxVertLineByX.set(xLine, Math.max(maxVertLineByX.get(xLine) ?? 0, cnt));
  }
  const maxHorzLineByY = new Map();
  for (const [key, cnt] of horzEdgeKeyToCount) {
    const yLine = Number(String(key).split('|')[0]);
    if (!Number.isFinite(yLine)) continue;
    maxHorzLineByY.set(yLine, Math.max(maxHorzLineByY.get(yLine) ?? 0, cnt));
  }
  return { maxVertLineByX, maxHorzLineByY, dotsForBandMax };
}

export function featureCollectionGridBounds(fc) {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  };
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    return { xMin, xMax, yMin, yMax };
  }
  for (const f of fc.features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'Point' && Array.isArray(g.coordinates)) {
      add(g.coordinates[0], g.coordinates[1]);
    } else if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
      for (const c of g.coordinates) {
        if (Array.isArray(c) && c.length >= 2) add(c[0], c[1]);
      }
    } else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
      for (const line of g.coordinates) {
        if (Array.isArray(line)) {
          for (const c of line) {
            if (Array.isArray(c) && c.length >= 2) add(c[0], c[1]);
          }
        }
      }
    }
  }
  return { xMin, xMax, yMin, yMax };
}

/**
 * 取邊緣區間藍字之 **全域** 極大值 M，以及粗格原點 (x0,y0)=floor bbox。
 * 插入／細格視覺：**M≥1 且為偶數時自動 +1**，使插入網格分割數對應之 M 為單數（resize／繪製與資料細格並用）。
 * @returns {{ m: number, x0: number, y0: number } | null}
 */
export function computeLayoutVhDrawFineGridSpec(dataStore, coarseFc) {
  if (!coarseFc || coarseFc.type !== 'FeatureCollection' || !Array.isArray(coarseFc.features))
    return null;
  const routeFeatures = coarseFc.features.filter((f) => f?.geometry?.type === 'LineString');
  if (!routeFeatures.length) return null;
  const { xMin, xMax, yMin, yMax } = featureCollectionGridBounds(coarseFc);
  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax)
  )
    return null;
  const x0 = Math.floor(xMin);
  const x1 = Math.ceil(xMax);
  const y0 = Math.floor(yMin);
  const y1 = Math.ceil(yMax);
  const xTicks = [];
  for (let x = x0; x <= x1; x++) xTicks.push(x);
  const yTicks = [];
  for (let y = y0; y <= y1; y++) yTicks.push(y);

  const { dotsForBandMax } = buildLayoutNetworkVhDrawMaxBlackDotsPerOrthoLine(
    dataStore,
    routeFeatures
  );
  let M = 0;
  for (let i = 0; i < xTicks.length - 1; i++) {
    M = Math.max(
      M,
      maxLayoutVhDrawBlackDotsOnLegInOpenXSlab(dotsForBandMax, xTicks[i], xTicks[i + 1])
    );
  }
  for (let i = 0; i < yTicks.length - 1; i++) {
    M = Math.max(
      M,
      maxLayoutVhDrawBlackDotsOnLegInOpenYSlab(dotsForBandMax, yTicks[i], yTicks[i + 1])
    );
  }
  let mOut = Math.max(0, Math.floor(M));
  if (mOut > 0 && mOut % 2 === 0) mOut += 1;
  return { m: mOut, x0, y0 };
}

/**
 * 粗格版面：各**欄**開區間、各**列**開區間分別取其刻度間 black-dot max（語意與版面網格檢視之區間標註同源），
 * 再累加各自方向歸一化為該方向的配置比例。**欄／列互不混算**。
 * 若某方向全系 max 為 0，則該方向各段比例均等。
 *
 * @returns {{
 *   computedAt: string,
 *   xTicks: number[],
 *   yTicks: number[],
 *   colMaxBlackDots: number[],
 *   rowMaxBlackDots: number[],
 *   colRatios: number[],
 *   rowRatios: number[],
 *   sumColMax: number,
 *   sumRowMax: number,
 *   nCols: number,
 *   nRows: number,
 * } | null}
 */
export function computeLayoutVhDrawBlackDotRowColRatioReport(dataStore, coarseFc) {
  if (!coarseFc || coarseFc.type !== 'FeatureCollection' || !Array.isArray(coarseFc.features))
    return null;
  const routeFeatures = coarseFc.features.filter((f) => f?.geometry?.type === 'LineString');
  if (!routeFeatures.length) return null;
  const { xMin, xMax, yMin, yMax } = featureCollectionGridBounds(coarseFc);
  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax)
  ) {
    return null;
  }
  const x0 = Math.floor(xMin);
  const x1 = Math.ceil(xMax);
  const y0 = Math.floor(yMin);
  const y1 = Math.ceil(yMax);
  /** @type {number[]} */
  const xTicks = [];
  for (let x = x0; x <= x1; x++) xTicks.push(x);
  /** @type {number[]} */
  const yTicks = [];
  for (let y = y0; y <= y1; y++) yTicks.push(y);

  const { dotsForBandMax } = buildLayoutNetworkVhDrawMaxBlackDotsPerOrthoLine(
    dataStore,
    routeFeatures
  );

  const nCols = Math.max(0, xTicks.length - 1);
  const nRows = Math.max(0, yTicks.length - 1);
  if (nCols <= 0 || nRows <= 0) return null;

  /** @type {number[]} */
  const colMaxBlackDots = [];
  for (let i = 0; i < nCols; i++) {
    colMaxBlackDots.push(
      maxLayoutVhDrawBlackDotsOnLegInOpenXSlab(dotsForBandMax, xTicks[i], xTicks[i + 1])
    );
  }
  /** @type {number[]} */
  const rowMaxBlackDots = [];
  for (let j = 0; j < nRows; j++) {
    rowMaxBlackDots.push(
      maxLayoutVhDrawBlackDotsOnLegInOpenYSlab(dotsForBandMax, yTicks[j], yTicks[j + 1])
    );
  }

  let sumColMax = 0;
  for (let i = 0; i < colMaxBlackDots.length; i++) sumColMax += colMaxBlackDots[i] ?? 0;
  let sumRowMax = 0;
  for (let j = 0; j < rowMaxBlackDots.length; j++) sumRowMax += rowMaxBlackDots[j] ?? 0;

  /** @type {number[]} */
  const colRatios = colMaxBlackDots.map((m) => {
    if (sumColMax > 0) return (Number(m) || 0) / sumColMax;
    return nCols > 0 ? 1 / nCols : 0;
  });
  /** @type {number[]} */
  const rowRatios = rowMaxBlackDots.map((m) => {
    if (sumRowMax > 0) return (Number(m) || 0) / sumRowMax;
    return nRows > 0 ? 1 / nRows : 0;
  });

  return {
    computedAt: new Date().toISOString(),
    xTicks,
    yTicks,
    colMaxBlackDots,
    rowMaxBlackDots,
    colRatios,
    rowRatios,
    sumColMax,
    sumRowMax,
    nCols,
    nRows,
  };
}

function mapPair(coord, spec) {
  const gx = Number(coord[0]);
  const gy = Number(coord[1]);
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return [coord[0], coord[1]];
  const s = spec.m + 1;
  return [Math.round((gx - spec.x0) * s), Math.round((gy - spec.y0) * s)];
}

/**
 * @param {{ type:'FeatureCollection', features: object[] }} fc - 會就地修改 features
 */
export function applyLayoutVhDrawFineGridToFeatureCollection(fc, spec) {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features) || !spec) return fc;
  if (!Number.isFinite(spec.m) || !Number.isFinite(spec.x0) || !Number.isFinite(spec.y0)) return fc;
  const mapLine = (coords) => {
    if (!Array.isArray(coords)) return coords;
    return coords.map((c) => (Array.isArray(c) && c.length >= 2 ? mapPair(c, spec) : c));
  };
  for (const f of fc.features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'Point' && Array.isArray(g.coordinates)) {
      g.coordinates = mapPair(g.coordinates, spec);
    } else if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
      g.coordinates = mapLine(g.coordinates);
    } else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
      g.coordinates = g.coordinates.map((line) => mapLine(line));
    }
  }
  return fc;
}
