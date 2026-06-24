/**
 * taipei_sn4_a：將各 way 之 properties.stations（及 HD_S 手繪點）併入路段匯出列
 * `segment.stations`，供 space-network-grid-json-data 與後續 flatSegments 與主圖黑點一致。
 */

import { getGeoJsonFeatureTagProps, isGeoJsonWayLineFeature } from '@/utils/geojsonRouteHelpers.js';
import { expandLonLatChainFromRouteCoordinates } from '@/utils/mapDrawnRoutesImport.js';

const HD_S_ID = 'HD_S';

function num(v) {
  return Number(v ?? 0);
}

/** 密頂點弧線：點常貼在某短邊上，與 routeCoordinates 弦距離大；需較寬容差 */
const STATION_MATCH_TOL_DEG = 8e-4;
const STATION_MATCH_TOL_SQ = STATION_MATCH_TOL_DEG * STATION_MATCH_TOL_DEG;

function paramAlongSegment01(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-22) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  return Math.max(0, Math.min(1, t));
}

function distPointToClosedSegmentSq(ax, ay, bx, by, px, py) {
  const t = paramAlongSegment01(ax, ay, bx, by, px, py);
  const qx = ax + t * (bx - ax);
  const qy = ay + t * (by - ay);
  const dx = px - qx;
  const dy = py - qy;
  return dx * dx + dy * dy;
}

function minDistSqToCoordsChain(coords, lng, lat) {
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = distPointToClosedSegmentSq(num(a[0]), num(a[1]), num(b[0]), num(b[1]), lng, lat);
    if (d < best) best = d;
  }
  return best;
}

function sortKeyAlongCoordsChain(coords, lng, lat) {
  let cumulative = 0;
  let bestKey = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = num(a[0]);
    const ay = num(a[1]);
    const bx = num(b[0]);
    const by = num(b[1]);
    const segLen = Math.hypot(bx - ax, by - ay);
    const t = paramAlongSegment01(ax, ay, bx, by, lng, lat);
    const d = distPointToClosedSegmentSq(ax, ay, bx, by, lng, lat);
    const s = cumulative + t * segLen;
    if (d < bestD) {
      bestD = d;
      bestKey = s;
    }
    cumulative += segLen;
  }
  return bestKey;
}

/** 與手繪／GeoJSON 浮點一致：九位小數內不重複即視為不同站（避免 1e6 四捨五入誤併） */
function coordKeyXYPrecise(x, y) {
  const u = num(x);
  const v = num(y);
  return `${u.toFixed(9)},${v.toFixed(9)}`;
}

function almostSameCoord(a, b, eps = 1e-12) {
  return Math.abs(num(a.lng) - num(b.lng)) <= eps && Math.abs(num(a.lat) - num(b.lat)) <= eps;
}

function routeDisplayNameFromWayFeature(feature) {
  const t = getGeoJsonFeatureTagProps(feature);
  const props = feature?.properties || {};
  const n = t.name ?? t.route_name ?? props.name ?? props.route_name;
  return n != null && String(n).trim() !== '' ? String(n).trim() : '未命名路線';
}

function wayFeatureToLongestLineCoords(feature) {
  const g = feature?.geometry;
  if (!g) return [];
  if (g.type === 'LineString') {
    return (g.coordinates || []).map((c) => [num(c[0]), num(c[1])]);
  }
  if (g.type === 'MultiLineString') {
    let best = [];
    for (const line of g.coordinates || []) {
      const coords = line.map((c) => [num(c[0]), num(c[1])]);
      if (coords.length > best.length) best = coords;
    }
    return best;
  }
  return [];
}

/**
 * 各路線名 → 該 way 之完整 LineString 座標（取同名中最長一條，與 export 折線一致）
 * @param {*} geojson
 * @returns {Map<string, number[][]>}
 */
function buildFullWayCoordsByRouteName(geojson) {
  const map = new Map();
  if (!geojson?.features) return map;
  for (const f of geojson.features) {
    if (!isGeoJsonWayLineFeature(f)) continue;
    const rn = routeDisplayNameFromWayFeature(f);
    const coords = wayFeatureToLongestLineCoords(f);
    if (coords.length < 2) continue;
    const prev = map.get(rn);
    if (!prev || coords.length > prev.length) map.set(rn, coords);
  }
  return map;
}

/**
 * 只以 sketch_sn4 HD_S **Point** 為權威（與手繪點擊一一對應）；
 * 不依賴 way.properties.stations（與 Point 座標可能微差、且 route_name 與 export 列名易不一致導致漏配）。
 *
 * @param {*} geojson - FeatureCollection
 * @param {Array<{ routeName?: string, segment?: object, routeCoordinates?: unknown }>} rows
 */
export function hydrateExportRowsFromWayPropertyStations(geojson, rows) {
  if (!geojson?.features || !Array.isArray(rows) || !rows.length) return;

  /** @type {{ lng: number; lat: number; station_id: string; station_name: string }[]} */
  const stationsToPlace = [];
  const seenPrecise = new Set();

  for (const f of geojson.features) {
    const p = f?.properties;
    if (!p?.sketch_sn4 || p.sketch_sn4_way) continue;
    if (String(p.station_id ?? '') !== HD_S_ID) continue;
    if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) continue;
    const lng = num(f.geometry.coordinates[0]);
    const lat = num(f.geometry.coordinates[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const kp = coordKeyXYPrecise(lng, lat);
    if (seenPrecise.has(kp)) continue;
    seenPrecise.add(kp);
    stationsToPlace.push({
      lng,
      lat,
      station_id: String(p.station_id ?? ''),
      station_name: String(p.station_name ?? ''),
    });
  }

  /** 手改 GeoJSON：way.properties.stations 有點但無對應 HD_S Point 時補上 */
  for (const f of geojson.features) {
    if (!isGeoJsonWayLineFeature(f)) continue;
    const arr = f.properties?.stations;
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      if (!s || typeof s !== 'object') continue;
      const lng = num(s.lng ?? s.x);
      const lat = num(s.lat ?? s.y);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (stationsToPlace.some((q) => almostSameCoord({ lng, lat }, q))) continue;
      const kp = coordKeyXYPrecise(lng, lat);
      if (seenPrecise.has(kp)) continue;
      seenPrecise.add(kp);
      stationsToPlace.push({
        lng,
        lat,
        station_id: String(s.station_id ?? ''),
        station_name: String(s.station_name ?? ''),
      });
    }
  }

  if (!stationsToPlace.length) return;

  const fullCoordsByRoute = buildFullWayCoordsByRouteName(geojson);

  for (const st of stationsToPlace) {
    let bestRow = null;
    let bestD = Infinity;
    let bestRi = Infinity;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const rn = String(row.routeName ?? '').trim();
      const full = rn ? fullCoordsByRoute.get(rn) : null;
      const chain =
        full && full.length >= 2
          ? full
          : expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
      if (chain.length < 2) continue;
      const d = minDistSqToCoordsChain(chain, st.lng, st.lat);
      if (d > STATION_MATCH_TOL_SQ) continue;
      const tieEps = 1e-24;
      if (d < bestD - tieEps || (Math.abs(d - bestD) <= tieEps && ri < bestRi)) {
        bestD = d;
        bestRi = ri;
        bestRow = row;
      }
    }
    if (!bestRow) continue;
    const seg = bestRow.segment;
    if (!seg) continue;
    if (!Array.isArray(seg.stations)) seg.stations = [];
    const k = coordKeyXYPrecise(st.lng, st.lat);
    if (
      seg.stations.some((x) =>
        coordKeyXYPrecise(x.lon ?? x.x_grid, x.lat ?? x.y_grid) === k
      )
    )
      continue;
    seg.stations.push({
      station_id: st.station_id,
      station_name: st.station_name,
      lon: st.lng,
      lat: st.lat,
    });
  }

  for (const row of rows) {
    const seg = row.segment;
    if (!seg?.stations?.length) continue;
    const rn = String(row.routeName ?? '').trim();
    const full = rn ? fullCoordsByRoute.get(rn) : null;
    const chain =
      full && full.length >= 2
        ? full
        : expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
    if (chain.length < 2) continue;
    seg.stations.sort(
      (a, b) =>
        sortKeyAlongCoordsChain(chain, num(a.lon ?? a.x_grid), num(a.lat ?? a.y_grid)) -
        sortKeyAlongCoordsChain(chain, num(b.lon ?? b.x_grid), num(b.lat ?? b.y_grid))
    );
  }
}
