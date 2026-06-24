import { expandLonLatChainFromRouteCoordinates } from '@/utils/mapDrawnRoutesImport.js';
import {
  compactNumericStationFieldsInExportRows,
  ensureSegmentStationStrings,
  normalizeRouteSegmentEndpointType,
} from '@/utils/geojsonRouteHelpers.js';

const LON_LAT_VERTEX_TOL_SQ = (4e-6) ** 2; // ~0.4–0.45 m scale，用於判定「頂點已存在／重疊」
const SAME_POINT_TOL_SQ = (8e-7) ** 2; // 合併重複交叉候選點

/** 與 geojsonExportRouteSegments 協調鍵（七位小數） */
const ROUTE_LIST_KEY_DECIMALS = 7;

function coordKeyLonLat(lon, lat) {
  const f = 10 ** ROUTE_LIST_KEY_DECIMALS;
  const x = Math.round(Number(lon) * f) / f;
  const y = Math.round(Number(lat) * f) / f;
  return `${x},${y}`;
}

/**
 * @param {number} x1,y1,x2,y2 第一線段
 * @param {number} x3,y3,x4,y4 第二線段
 * @returns {{ x: number, y: number, t: number, u: number } | null} 兩線段內部（不含端點）交點
 */
export function segmentIntersectionInterior2D(x1, y1, x2, y2, x3, y3, x4, y4) {
  const eps = 1e-12;
  const r1x = x2 - x1;
  const r1y = y2 - y1;
  const r2x = x4 - x3;
  const r2y = y4 - y3;
  const denom = r1x * r2y - r1y * r2x;
  if (Math.abs(denom) < eps) return null;
  const ddx = x3 - x1;
  const ddy = y3 - y1;
  const t = (ddx * r2y - ddy * r2x) / denom;
  const u = (ddx * r1y - ddy * r1x) / denom;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: x1 + t * r1x, y: y1 + t * r1y, t, u };
}

function distSqLonLat(lon1, lat1, lon2, lat2) {
  const dx = lon1 - lon2;
  const dy = lat1 - lat2;
  return dx * dx + dy * dy;
}

function cloneNode(obj) {
  return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : {};
}

export function makeIntersectionStation(lon, lat) {
  const lo = Number(lon);
  const la = Number(lat);
  return {
    station_id: '',
    station_name: '',
    route_name_list: [],
    lon: lo,
    lat: la,
    type: 'intersection',
    connect_number: 0,
  };
}

/**
 * 由折線頂點鍵成與手繪／匯出一致的路段列
 */
export function buildRouteExportRowFromChain(chain, routeName, color, startNode, endNode, meta = {}) {
  if (!Array.isArray(chain) || chain.length < 2) return null;
  const startPt = chain[0];
  const endPt = chain[chain.length - 1];
  const bendCoords = [];
  const stations = [];
  for (let i = 1; i < chain.length - 1; i++) {
    const pt = chain[i];
    bendCoords.push([pt[0], pt[1]]);
    const ensured = ensureSegmentStationStrings({}, pt[0], pt[1]);
    stations.push({
      station_id: ensured.station_id,
      station_name: ensured.station_name,
      lon: pt[0],
      lat: pt[1],
      type: 'normal',
    });
  }
  const s0 = cloneNode(startNode);
  const e0 = cloneNode(endNode);
  delete s0.x_grid;
  delete s0.y_grid;
  delete e0.x_grid;
  delete e0.y_grid;
  s0.lon = startPt[0];
  s0.lat = startPt[1];
  e0.lon = endPt[0];
  e0.lat = endPt[1];
  Object.assign(s0, ensureSegmentStationStrings(s0, s0.lon, s0.lat));
  Object.assign(e0, ensureSegmentStationStrings(e0, e0.lon, e0.lat));
  const row = {
    route_id: meta.route_id != null ? String(meta.route_id) : '',
    routeName: routeName || '路線',
    color: typeof color === 'string' && color.trim() !== '' ? color.trim() : '#666666',
    segment: {
      start: s0,
      stations,
      end: e0,
    },
    routeCoordinates: [startPt, bendCoords, endPt],
  };
  if (meta._drawn) {
    row._drawn = true;
    if (meta._drawnAt != null) row._drawnAt = meta._drawnAt;
  }
  return row;
}

/**
 * 在邊 chain[k]→chain[k+1] 的內部插入交點 (qlon, qlat)，將一列拆成兩列
 * @returns {Array<object>|null} [leftRow, rightRow]
 */
export function splitRouteRowAtEdgeInterior(row, edgeIndexK, qlon, qlat) {
  const chain = expandLonLatChainFromRouteCoordinates(row?.routeCoordinates);
  if (!chain || chain.length < 2) return null;
  if (edgeIndexK < 0 || edgeIndexK >= chain.length - 1) return null;
  const q = [qlon, qlat];
  const leftChain = chain.slice(0, edgeIndexK + 1);
  if (distSqLonLat(leftChain[leftChain.length - 1][0], leftChain[leftChain.length - 1][1], q[0], q[1]) > 1e-18) {
    leftChain.push(q);
  } else {
    leftChain[leftChain.length - 1] = q;
  }
  const rightChain = [q, ...chain.slice(edgeIndexK + 1)];
  if (rightChain.length < 2 || leftChain.length < 2) return null;

  const inter = makeIntersectionStation(qlon, qlat);
  const seg = row.segment || {};
  const rn = row.routeName || '路線';
  const col = row.color;
  const meta = { _drawn: row._drawn, _drawnAt: row._drawnAt, route_id: row.route_id ?? '' };

  const leftRow = buildRouteExportRowFromChain(leftChain, rn, col, seg.start || {}, inter, meta);
  const rightRow = buildRouteExportRowFromChain(rightChain, rn, col, inter, seg.end || {}, meta);
  if (!leftRow || !rightRow) return null;
  return [leftRow, rightRow];
}

/**
 * 若 (lon,lat) 與任一既有折線頂點過近，視為已有節點（含交叉點），不產生候選
 */
function isNearAnyChainVertex(lon, lat, chains) {
  for (const ch of chains) {
    for (const p of ch) {
      if (distSqLonLat(lon, lat, p[0], p[1]) < LON_LAT_VERTEX_TOL_SQ) return true;
    }
  }
  return false;
}

/**
 * 列舉「兩線段在內部相交、且附近尚無頂點」之候選
 * — 含不同路線（兩列）之交錯，以及同一路線上兩條不相鄰邊之自交。
 * @param {Array<object>} rows
 * @returns {Array<{ lon: number, lat: number, rowIndexA: number, edgeIndexA: number, rowIndexB: number, edgeIndexB: number }>}
 */
export function enumerateCrossingCandidates(rows) {
  if (!Array.isArray(rows) || rows.length < 1) return [];
  const chains = rows.map((r) => expandLonLatChainFromRouteCoordinates(r?.routeCoordinates));
  const valid = chains.map((c) => Array.isArray(c) && c.length >= 2);
  const merged = [];

  const pushMerged = (lon, lat, ia, ea, ib, eb) => {
    if (isNearAnyChainVertex(lon, lat, chains)) return;
    for (let m = merged.length - 1; m >= 0; m--) {
      if (distSqLonLat(lon, lat, merged[m].lon, merged[m].lat) < SAME_POINT_TOL_SQ) return;
    }
    merged.push({
      lon,
      lat,
      rowIndexA: ia,
      edgeIndexA: ea,
      rowIndexB: ib,
      edgeIndexB: eb,
    });
  };

  for (let i = 0; i < rows.length; i++) {
    if (!valid[i]) continue;
    const ci = chains[i];

    // 同列自交：邊 a 與邊 b 須相隔至少一邊（|a−b|≥2），否則共端點不會有「內部」交點
    for (let a = 0; a < ci.length - 1; a++) {
      const ax = ci[a][0];
      const ay = ci[a][1];
      const bx = ci[a + 1][0];
      const by = ci[a + 1][1];
      for (let b = a + 2; b < ci.length - 1; b++) {
        const cx = ci[b][0];
        const cy = ci[b][1];
        const dx = ci[b + 1][0];
        const dy = ci[b + 1][1];
        const hit = segmentIntersectionInterior2D(ax, ay, bx, by, cx, cy, dx, dy);
        if (!hit) continue;
        pushMerged(hit.x, hit.y, i, a, i, b);
      }
    }

    for (let j = i + 1; j < rows.length; j++) {
      if (!valid[j]) continue;
      const cj = chains[j];
      for (let a = 0; a < ci.length - 1; a++) {
        const ax = ci[a][0];
        const ay = ci[a][1];
        const bx = ci[a + 1][0];
        const by = ci[a + 1][1];
        for (let b = 0; b < cj.length - 1; b++) {
          const cx = cj[b][0];
          const cy = cj[b][1];
          const dx = cj[b + 1][0];
          const dy = cj[b + 1][1];
          const hit = segmentIntersectionInterior2D(ax, ay, bx, by, cx, cy, dx, dy);
          if (!hit) continue;
          pushMerged(hit.x, hit.y, i, a, j, b);
        }
      }
    }
  }
  return merged;
}

/**
 * 同一路線上兩邊內部相交：先於較大邊索引處切開，再在左段上對較小邊索引切開，產出三列。
 * @returns {Array<object>|null}
 */
function applySameRowCrossingToRows(rows, cand) {
  const i = cand.rowIndexA;
  let ea = cand.edgeIndexA;
  let eb = cand.edgeIndexB;
  if (ea > eb) [ea, eb] = [eb, ea];
  if (eb - ea < 2) return null;

  const row = rows[i];
  const splitEb = splitRouteRowAtEdgeInterior(row, eb, cand.lon, cand.lat);
  if (!splitEb || splitEb.length !== 2) return null;
  const [leftAfterEb, rightAfterEb] = splitEb;

  const splitEa = splitRouteRowAtEdgeInterior(leftAfterEb, ea, cand.lon, cand.lat);
  if (!splitEa || splitEa.length !== 2) return null;
  const [part1, part2] = splitEa;

  const out = [];
  for (let k = 0; k < rows.length; k++) {
    if (k === i) out.push(part1, part2, rightAfterEb);
    else out.push(rows[k]);
  }
  return renumberAndRecomputeRouteExportRows(out);
}

/**
 * 依陣列順序重新指定 routeName（路線_1、路線_2…）與 route_id（「1」起之數字字串），並遍歷各路線折線頂點
 * 聚合每座標之 route_name_list／connect_number／type（type=intersection 時 route_name_list 至少兩線）。
 * 交叉點打斷後須呼叫此函式，避免新舊路段沿用相同名稱或遺漏轉乘列表。
 *
 * @param {Array<object>} rows - MapDrawn 路段列
 * @param {{ emittedSegmentNamePrefix?: string }} [opts]
 * @returns {Array<object>}
 */
export function renumberAndRecomputeRouteExportRows(rows, opts = {}) {
  const prefix = opts.emittedSegmentNamePrefix ?? '路線';
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const renamed = rows.map((row, idx) => {
    const i = idx + 1;
    return {
      ...row,
      routeName: `${prefix}_${i}`,
      route_id: String(i),
    };
  });

  /** @type {Map<string, Set<string>>} */
  const keyToNames = new Map();
  const addName = (lon, lat, name) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !name) return;
    const k = coordKeyLonLat(lon, lat);
    if (!keyToNames.has(k)) keyToNames.set(k, new Set());
    keyToNames.get(k).add(name);
  };

  for (const row of renamed) {
    const chain = expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
    if (!chain || chain.length < 2) continue;
    const n = row.routeName;
    for (const c of chain) {
      addName(c[0], c[1], n);
    }
  }

  const listAt = (lon, lat) => {
    const k = coordKeyLonLat(lon, lat);
    return Array.from(keyToNames.get(k) ?? []).sort();
  };

  const rebuilt = renamed.map((row) => {
    const chain = expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
    if (!chain || chain.length < 2) return row;
    const seg = row.segment || {};

    const startLon = Number(seg.start?.lon ?? seg.start?.x_grid ?? chain[0][0]);
    const startLat = Number(seg.start?.lat ?? seg.start?.y_grid ?? chain[0][1]);
    const endLon = Number(seg.end?.lon ?? seg.end?.x_grid ?? chain[chain.length - 1][0]);
    const endLat = Number(seg.end?.lat ?? seg.end?.y_grid ?? chain[chain.length - 1][1]);

    /**
     * @param {'start'|'mid'|'end'} role
     */
    const fillNode = (node, lon, lat, role) => {
      const rlist = listAt(lon, lat);
      const cn = rlist.length;
      let typ;
      if (cn > 1) typ = 'intersection';
      else if (role === 'mid') typ = 'normal';
      else typ = 'terminal';
      const base = ensureSegmentStationStrings(
        { ...node, route_name_list: rlist, connect_number: cn },
        lon,
        lat
      );
      return {
        ...base,
        lon,
        lat,
        route_name_list: rlist,
        connect_number: cn,
        type: normalizeRouteSegmentEndpointType(typ),
      };
    };

    const newStations = (Array.isArray(seg.stations) ? seg.stations : []).map((st) => {
      const lon = Number(st.lon ?? st.x_grid);
      const lat = Number(st.lat ?? st.y_grid);
      return fillNode(st, lon, lat, 'mid');
    });

    return {
      ...row,
      segment: {
        start: fillNode(seg.start || {}, startLon, startLat, 'start'),
        stations: newStations,
        end: fillNode(seg.end || {}, endLon, endLat, 'end'),
      },
    };
  });

  compactNumericStationFieldsInExportRows(rebuilt);
  return rebuilt;
}

/**
 * 對候選做一次打斷：兩不同路線各拆成兩段；或同一路線兩邊內交則拆成三段，共用交點 type=intersection
 * @returns {Array<object>|null} 新 rows 或失敗為 null
 */
export function applyCrossingToRows(rows, cand) {
  if (!Array.isArray(rows) || !cand) return null;
  const { rowIndexA, edgeIndexA, rowIndexB, edgeIndexB, lon, lat } = cand;
  const ia = rowIndexA;
  const ib = rowIndexB;
  if (ia < 0 || ib < 0 || ia >= rows.length || ib >= rows.length) return null;

  if (ia === ib) {
    return applySameRowCrossingToRows(rows, cand);
  }
  const rowA = rows[ia];
  const rowB = rows[ib];
  const splitA = splitRouteRowAtEdgeInterior(rowA, edgeIndexA, lon, lat);
  const splitB = splitRouteRowAtEdgeInterior(rowB, edgeIndexB, lon, lat);
  if (!splitA || splitA.length !== 2 || !splitB || splitB.length !== 2) return null;
  const out = [];
  for (let k = 0; k < rows.length; k++) {
    if (k === ia) out.push(splitA[0], splitA[1]);
    else if (k === ib) out.push(splitB[0], splitB[1]);
    else out.push(rows[k]);
  }
  return renumberAndRecomputeRouteExportRows(out);
}
