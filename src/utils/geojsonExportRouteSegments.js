/**
 * GeoJSON FeatureCollection → 路段 JSON 陣列（與 Python export_route_segments 相同語意）
 * 輸出：{ routeName, color, segment: { start, stations, end }, routeCoordinates }[]
 */

import {
  getGeoJsonFeatureTagProps,
  normalizeRouteSegmentEndpointType,
  routeIdFromGeoJsonWayTags,
  ensureSegmentStationStrings,
} from './geojsonRouteHelpers.js';

function num(v) {
  return Number(v);
}

/** OSM：colour／color 多在 properties.tags；扁平 GeoJSON 則在 properties */
function routeLineColorFromFeature(feature) {
  const t = getGeoJsonFeatureTagProps(feature);
  const props = feature?.properties || {};
  const candidates = [t.colour, t.color, t.route_colour, props.color];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return '#000000';
}

function routeDisplayNameFromFeature(feature) {
  const t = getGeoJsonFeatureTagProps(feature);
  const props = feature?.properties || {};
  const n = t.name ?? t.route_name ?? props.name ?? props.route_name;
  return n != null && String(n).trim() !== '' ? String(n).trim() : '未命名路線';
}

/** 與 Point／polyline 頂點鍵一致（浮點誤差時仍對到 stations，以便填入 route_name_list） */
const COORD_KEY_DECIMALS = 7;

function coordTupleKey(coord) {
  if (!coord || coord.length < 2) return '';
  const f = 10 ** COORD_KEY_DECIMALS;
  const x = Math.round(num(coord[0]) * f) / f;
  const y = Math.round(num(coord[1]) * f) / f;
  return `${x},${y}`;
}

/**
 * 切段匯出：每筆輸出路段給新 routeName／route_id，並依新名稱重算端點 route_name_list／connect_number／type
 * @param {object[]} segments {@link exportRouteSegmentsFromGeoJson} 產物
 * @param {{ emittedSegmentNamePrefix?: string }} [renameOpts]
 */
function applyEmittedSegmentRenamingAndRouteLists(segments, renameOpts) {
  const prefix = renameOpts?.emittedSegmentNamePrefix ?? '路線';
  let i = 0;
  for (const seg of segments) {
    i += 1;
    seg.routeName = `${prefix}_${i}`;
    seg.route_id = String(i);
  }
  /** @type {Map<string, Set<string>>} */
  const keyToNames = new Map();
  const addName = (lon, lat, name) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !name) return;
    const k = coordTupleKey([lon, lat]);
    if (!keyToNames.has(k)) keyToNames.set(k, new Set());
    keyToNames.get(k).add(name);
  };
  for (const seg of segments) {
    const n = seg.routeName;
    const st = seg.segment;
    addName(num(st.start.lon), num(st.start.lat), n);
    addName(num(st.end.lon), num(st.end.lat), n);
  }
  const listAt = (lon, lat) => {
    const k = coordTupleKey([lon, lat]);
    return Array.from(keyToNames.get(k) ?? []).sort();
  };
  for (const seg of segments) {
    const st = seg.segment;
    const slon = num(st.start.lon);
    const slat = num(st.start.lat);
    const elon = num(st.end.lon);
    const elat = num(st.end.lat);
    st.start.route_name_list = listAt(slon, slat);
    st.end.route_name_list = listAt(elon, elat);
    st.start.connect_number = st.start.route_name_list.length;
    st.end.connect_number = st.end.route_name_list.length;
    st.start.type = normalizeRouteSegmentEndpointType(
      st.start.connect_number > 1 ? 'intersection' : 'terminal'
    );
    st.end.type = normalizeRouteSegmentEndpointType(
      st.end.connect_number > 1 ? 'intersection' : 'terminal'
    );
  }
}

/**
 * 站—線吸附最大距離（度）。真實「在線上」的站距離≈0；6e-4(~66m) 過寬會把鄰近別線的站誤吸附
 * （例：北門離機場線 5.1e-4 被誤掛機場線、LG12 離板南線 3.0e-4）。實測全網真站皆 0，故收緊到
 * 1.5e-4(~16m)：保留所有真實站、僅排除這類鄰近假吸附。
 */
const ON_SEGMENT_MAX_DIST_DEG = 1.5e-4;

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

/**
 * 將落在折線任一邊上的車站座標（交叉點常在內插位置、非頂點）依走向插入，
 * 使 export_route_segments 能於該處切段並標為 intersection／connect（紅點）。
 *
 * @param {number[][]} coords - LineString 頂點
 * @param {object[]} stationArr - 攤平後的車站陣列（含同格重疊之多站）
 * @returns {number[][]}
 */
function expandRouteCoordsWithStationsOnLine(coords, stationArr) {
  if (!Array.isArray(coords) || coords.length < 2) return coords ? [...coords] : [];
  const out = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = num(a[0]);
    const ay = num(a[1]);
    const bx = num(b[0]);
    const by = num(b[1]);
    if (i === 0) out.push([ax, ay]);

    const dMaxSq = ON_SEGMENT_MAX_DIST_DEG * ON_SEGMENT_MAX_DIST_DEG;
    /** @type {{ t: number, x: number, y: number }[]} */
    const hits = [];
    for (const st of stationArr) {
      const px = num(st.lon ?? st.x_grid);
      const py = num(st.lat ?? st.y_grid);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      if (distPointToClosedSegmentSq(ax, ay, bx, by, px, py) > dMaxSq) continue;
      const t = paramAlongSegment01(ax, ay, bx, by, px, py);
      hits.push({ t, x: px, y: py });
    }
    hits.sort((u, v) => u.t - v.t || u.x - v.x || u.y - v.y);
    for (const h of hits) {
      const c = [h.x, h.y];
      const last = out[out.length - 1];
      if (last && coordTupleKey(last) === coordTupleKey(c)) continue;
      out.push(c);
    }
    const end = [bx, by];
    const last = out[out.length - 1];
    if (!last || coordTupleKey(last) !== coordTupleKey(end)) out.push(end);
  }
  return out;
}

function snapStation(s) {
  const lon = num(s.lon ?? s.x_grid);
  const lat = num(s.lat ?? s.y_grid);
  const e = ensureSegmentStationStrings(s, lon, lat);
  return {
    station_id: e.station_id,
    station_name: e.station_name,
    route_name_list: [...(Array.isArray(s.route_name_list) ? s.route_name_list : [])],
    lon,
    lat,
    type: normalizeRouteSegmentEndpointType(s.type),
    connect_number: s.connect_number != null ? num(s.connect_number) : 0,
  };
}

/**
 * @param {*} geojson - GeoJSON FeatureCollection
 * @param {{
 *   renameEachEmittedSegment?: boolean,
 *   emittedSegmentNamePrefix?: string,
 *   insertStationsOntoLinesByProximity?: boolean,
 * }} [options] — `renameEachEmittedSegment`：交叉點切段後每段為獨立路線名（預設 `路線_1`…）與數字 `route_id`，不再沿用輸入之 routeName。
 * `insertStationsOntoLinesByProximity`（預設 true）：將車站 Point 依垂距門檻插入鄰近折線段；OSM 讀入應設 false 以保持頂點與拓樸如實。
 * @returns {Array<Object>}
 */
export function exportRouteSegmentsFromGeoJson(geojson, options = {}) {
  if (!geojson?.features || !Array.isArray(geojson.features)) return [];
  const {
    renameEachEmittedSegment = false,
    emittedSegmentNamePrefix,
    insertStationsOntoLinesByProximity = true,
  } = options;

  /** @type {Map<string, object>} */
  const stations = new Map();
  const routes = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const props = feature.properties || {};
    if (!geom) continue;

    if (geom.type === 'Point') {
      const t = getGeoJsonFeatureTagProps(feature);
      const c = geom.coordinates;
      if (!Array.isArray(c) || c.length < 2) continue;
      const coord = [num(c[0]), num(c[1])];
      const key = coordTupleKey(coord);
      const stNameRaw = t.station_name ?? t.name ?? props.station_name ?? props.name;
      const nameTrim =
        stNameRaw != null && String(stNameRaw).trim() !== '' ? String(stNameRaw).trim() : '';
      const sidRaw = t.station_id ?? props.station_id;
      const sidTrim =
        sidRaw != null && String(sidRaw).trim() !== '' ? String(sidRaw).trim() : '';
      // 來源車站身分：route_name_list（此站真正所屬路線）。同格多站(座標重疊但身分不同)時，
      // 據此把每條路線指回「自己的」站，避免別線剛好穿過某終點時偷用該站、把線誤切成交會。
      const srcRouteList = Array.isArray(t.route_name_list)
        ? t.route_name_list.map((r) => String(r ?? '').trim()).filter(Boolean)
        : Array.isArray(props.route_name_list)
          ? props.route_name_list.map((r) => String(r ?? '').trim()).filter(Boolean)
          : [];
      // 顏色以輸入結構為主：來源若標明 terminal／intersection 即沿用，不被「同格座標度數」覆寫。
      const srcType = props.type ?? t.type;
      const presetType =
        srcType === 'terminal' || srcType === 'intersection' ? srcType : undefined;
      const merged = ensureSegmentStationStrings(
        { station_id: sidTrim, station_name: nameTrim, route_name_list: [] },
        coord[0],
        coord[1],
      );
      const station = {
        ...merged,
        lon: coord[0],
        lat: coord[1],
        srcRouteList,
        ...(presetType ? { type: presetType } : {}),
      };
      // 不依座標把不同身分的站覆寫合併：同格保留多站，僅同 id＋同名才視為同一站(後者覆寫)。
      if (!stations.has(key)) stations.set(key, []);
      const bucket = stations.get(key);
      const identity = `${station.station_id}|${station.station_name}`;
      const exIdx = bucket.findIndex((s) => `${s.station_id}|${s.station_name}` === identity);
      if (exIdx >= 0) bucket[exIdx] = station;
      else bucket.push(station);
    } else if (geom.type === 'LineString') {
      const routeName = routeDisplayNameFromFeature(feature);
      const color = routeLineColorFromFeature(feature);
      const tprops = getGeoJsonFeatureTagProps(feature);
      const props = feature.properties || {};
      const routeId =
        routeIdFromGeoJsonWayTags({
          ...props,
          ...tprops,
        }) || '';
      const coords = (geom.coordinates || []).map((c) => [num(c[0]), num(c[1])]);
      routes.push({ routeName, color, routeId, coords });
    } else if (geom.type === 'MultiLineString') {
      const routeName = routeDisplayNameFromFeature(feature);
      const color = routeLineColorFromFeature(feature);
      const tprops = getGeoJsonFeatureTagProps(feature);
      const props = feature.properties || {};
      const routeId =
        routeIdFromGeoJsonWayTags({
          ...props,
          ...tprops,
        }) || '';
      for (const line of geom.coordinates || []) {
        const coords = line.map((c) => [num(c[0]), num(c[1])]);
        routes.push({ routeName, color, routeId, coords });
      }
    }
  }

  /** 攤平所有車站（含同格重疊多站），供鄰近插入與度數／型別計算逐站處理 */
  const allStations = [];
  for (const bucket of stations.values()) for (const st of bucket) allStations.push(st);

  /**
   * 取座標上「屬於該路線」的車站：
   * - 單站(無座標重疊) → 沿用原座標對應（與舊行為一致，零影響）。
   * - 同格多站(不同身分重疊) → 依各站自身 route_name_list 把路線指回自己的站；
   *   若無任一站宣告此路線、且有未宣告身分(幾何 connect)之站才回退之，否則回 null
   *   （該路線僅幾何穿過某別線終點 → 不在此切段、不偷用該站）。
   */
  const pickStationForRoute = (coord, rName) => {
    const bucket = stations.get(coordTupleKey(coord));
    if (!bucket || bucket.length === 0) return null;
    if (bucket.length === 1) return bucket[0];
    const own = bucket.find(
      (s) => Array.isArray(s.srcRouteList) && s.srcRouteList.includes(rName)
    );
    if (own) return own;
    const anon = bucket.find(
      (s) => !Array.isArray(s.srcRouteList) || s.srcRouteList.length === 0
    );
    return anon || null;
  };

  const routeWalkCoords = insertStationsOntoLinesByProximity
    ? routes.map((r) => expandRouteCoordsWithStationsOnLine(r.coords, allStations))
    : routes.map((r) => r.coords.map((c) => [num(c[0]), num(c[1])]));

  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    const rName = route.routeName;
    const walk = routeWalkCoords[ri];
    for (const coord of walk) {
      const st = pickStationForRoute(coord, rName);
      if (st && !st.route_name_list.includes(rName)) {
        st.route_name_list.push(rName);
      }
    }
  }

  for (const st of allStations) {
    const deg = st.route_name_list.length;
    st.connect_number = deg;
    const preset = st.type === 'terminal' || st.type === 'intersection' ? st.type : null;
    if (preset) {
      st.type = preset;
    } else {
      st.type = deg > 1 ? 'intersection' : 'normal';
    }
  }

  const outputSegments = [];

  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    const rName = route.routeName;
    const rColor = route.color;
    const rRouteId = route.routeId != null ? String(route.routeId) : '';
    const routeStations = [];
    const walk = routeWalkCoords[ri];
    for (const coord of walk) {
      const st = pickStationForRoute(coord, rName);
      if (st) routeStations.push(st);
    }

    /** 與 Python export_route_segments 相同：折線上須能對到至少兩個車站座標，否則略過該路線 */
    if (routeStations.length < 2) continue;

    if (routeStations[0].type === 'normal') routeStations[0].type = 'terminal';
    const last = routeStations[routeStations.length - 1];
    if (last.type === 'normal') last.type = 'terminal';

    let currentSegmentStart = null;
    let currentMidStations = [];

    for (const st of routeStations) {
      const isKeyNode = st.type === 'intersection' || st.type === 'terminal';

      if (isKeyNode) {
        if (currentSegmentStart === null) {
          currentSegmentStart = st;
          currentMidStations = [];
        } else {
          const endNode = st;
          const midStationsFormatted = currentMidStations.map((ms) => {
            const mlon = num(ms.lon ?? ms.x_grid);
            const mlat = num(ms.lat ?? ms.y_grid);
            const me = ensureSegmentStationStrings(ms, mlon, mlat);
            return {
              station_id: me.station_id,
              station_name: me.station_name,
              lon: mlon,
              lat: mlat,
              type: 'normal',
            };
          });
          const midCoords = currentMidStations.map((ms) => [
            num(ms.lon ?? ms.x_grid),
            num(ms.lat ?? ms.y_grid),
          ]);

          outputSegments.push({
            route_id: rRouteId,
            routeName: rName,
            color: rColor,
            segment: {
              start: snapStation(currentSegmentStart),
              stations: midStationsFormatted,
              end: snapStation(endNode),
            },
            routeCoordinates: [
              [
                num(currentSegmentStart.lon ?? currentSegmentStart.x_grid),
                num(currentSegmentStart.lat ?? currentSegmentStart.y_grid),
              ],
              midCoords,
              [num(endNode.lon ?? endNode.x_grid), num(endNode.lat ?? endNode.y_grid)],
            ],
          });
          currentSegmentStart = endNode;
          currentMidStations = [];
        }
      } else if (currentSegmentStart !== null) {
        currentMidStations.push(st);
      }
    }
  }

  if (renameEachEmittedSegment && outputSegments.length > 0) {
    applyEmittedSegmentRenamingAndRouteLists(outputSegments, { emittedSegmentNamePrefix });
  }

  return outputSegments;
}
