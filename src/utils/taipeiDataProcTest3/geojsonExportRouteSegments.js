/**
 * 資料處理管線專用複本（與 @/utils/geojsonExportRouteSegments.js 同邏輯，獨立檔案）。
 * GeoJSON FeatureCollection → 路段 JSON 陣列（與 Python export_route_segments 相同語意）
 */

import { getGeoJsonFeatureTagProps } from '@/utils/geojsonRouteHelpers.js';

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

function coordTupleKey(coord) {
  return `${num(coord[0])},${num(coord[1])}`;
}

function snapStation(s) {
  return {
    station_id: s.station_id,
    station_name: s.station_name,
    route_name_list: [...(s.route_name_list || [])],
    x_grid: s.x_grid,
    y_grid: s.y_grid,
    type: s.type,
    connect_number: s.connect_number,
  };
}

/**
 * @param {*} geojson - GeoJSON FeatureCollection
 * @returns {Array<Object>}
 */
export function exportRouteSegmentsFromGeoJson(geojson) {
  if (!geojson?.features || !Array.isArray(geojson.features)) return [];

  /** @type {Map<string, object>} */
  const stations = new Map();
  const routes = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const props = feature.properties || {};
    if (!geom) continue;

    if (geom.type === 'Point') {
      const t = getGeoJsonFeatureTagProps(feature);
      const stName = t.station_name ?? t.name ?? props.station_name ?? props.name;
      if (!stName || String(stName).trim() === '') continue;
      const c = geom.coordinates;
      const coord = [num(c[0]), num(c[1])];
      const key = coordTupleKey(coord);
      const sidRaw = t.station_id ?? props.station_id;
      stations.set(key, {
        station_id: sidRaw != null && String(sidRaw).trim() !== '' ? String(sidRaw) : '',
        station_name: String(stName).trim(),
        x_grid: coord[0],
        y_grid: coord[1],
        route_name_list: [],
      });
    } else if (geom.type === 'LineString') {
      const routeName = routeDisplayNameFromFeature(feature);
      const color = routeLineColorFromFeature(feature);
      const coords = (geom.coordinates || []).map((c) => [num(c[0]), num(c[1])]);
      routes.push({ routeName, color, coords });
    } else if (geom.type === 'MultiLineString') {
      const routeName = routeDisplayNameFromFeature(feature);
      const color = routeLineColorFromFeature(feature);
      for (const line of geom.coordinates || []) {
        const coords = line.map((c) => [num(c[0]), num(c[1])]);
        routes.push({ routeName, color, coords });
      }
    }
  }

  for (const route of routes) {
    const rName = route.routeName;
    for (const coord of route.coords) {
      const st = stations.get(coordTupleKey(coord));
      if (st && !st.route_name_list.includes(rName)) {
        st.route_name_list.push(rName);
      }
    }
  }

  for (const st of stations.values()) {
    const deg = st.route_name_list.length;
    st.connect_number = deg;
    st.type = deg > 1 ? 'intersection' : 'normal';
  }

  const outputSegments = [];

  for (const route of routes) {
    const rName = route.routeName;
    const rColor = route.color;
    const routeStations = [];
    for (const coord of route.coords) {
      const st = stations.get(coordTupleKey(coord));
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
          const midStationsFormatted = currentMidStations.map((ms) => ({
            station_id: ms.station_id,
            station_name: ms.station_name,
            x_grid: ms.x_grid,
            y_grid: ms.y_grid,
          }));
          const midCoords = currentMidStations.map((ms) => [ms.x_grid, ms.y_grid]);

          outputSegments.push({
            routeName: rName,
            color: rColor,
            segment: {
              start: snapStation(currentSegmentStart),
              stations: midStationsFormatted,
              end: snapStation(endNode),
            },
            routeCoordinates: [
              [currentSegmentStart.x_grid, currentSegmentStart.y_grid],
              midCoords,
              [endNode.x_grid, endNode.y_grid],
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

  return outputSegments;
}
