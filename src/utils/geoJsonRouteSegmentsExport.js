/**
 * GeoJSON（路線 LineString + 車站 Point）→ 與 Python export_route_segments 相同語意的路段 JSON，
 * 並轉成 SpaceNetworkGridTab 可繪製的 Normalize segments（points + properties_start/end + way_properties）。
 */

import { normalizeRouteSegmentEndpointType, routeIdFromGeoJsonWayTags, ensureSegmentStationStrings } from './geojsonRouteHelpers.js';

/** GeoJSON feature.properties 可能為 { tags } 或已扁平 */
function flatFeatureProps(feature) {
  const p = feature?.properties;
  if (!p || typeof p !== 'object') return {};
  const tags = p.tags && typeof p.tags === 'object' ? p.tags : {};
  return { ...p, ...tags };
}

function coordKey(lon, lat) {
  return `${lon},${lat}`;
}

/**
 * 與使用者提供之 Python export_route_segments 等價：輸出陣列元素含 routeName、color、segment、routeCoordinates。
 * @param {Object} geojson GeoJSON FeatureCollection
 * @returns {Object[]}
 */
export function exportRouteSegmentsFromGeoJson(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];

  /** @type {Map<string, Object>} */
  const stations = new Map();
  const routes = [];

  for (const feature of features) {
    const geom = feature?.geometry;
    if (!geom) continue;
    const props = flatFeatureProps(feature);

    if (geom.type === 'Point') {
      const c = geom.coordinates;
      if (!Array.isArray(c) || c.length < 2) continue;
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const key = coordKey(lon, lat);
      const nameRaw = props.station_name ?? props.name;
      const nameTrim =
        nameRaw != null && String(nameRaw).trim() !== '' ? String(nameRaw).trim() : '';
      const sidRaw = props.station_id;
      const sidTrim =
        sidRaw != null && String(sidRaw).trim() !== '' ? String(sidRaw).trim() : '';
      const merged = ensureSegmentStationStrings(
        { station_id: sidTrim, station_name: nameTrim, route_name_list: [] },
        lon,
        lat,
      );
      stations.set(key, {
        ...merged,
        lon,
        lat,
        route_name_list: [],
      });
    } else if (geom.type === 'LineString') {
      const coords = (geom.coordinates || []).map((pt) => [pt[0], pt[1]]);
      if (coords.length < 2) continue;
      const routeName = props.name ?? props.route_name ?? '未命名路線';
      const color = props.color ?? '#000000';
      const routeId = routeIdFromGeoJsonWayTags(props) || '';
      routes.push({
        routeName,
        color,
        routeId,
        coordPairs: coords,
      });
    }
  }

  for (const route of routes) {
    const rName = route.routeName;
    for (const xy of route.coordPairs) {
      const key = coordKey(xy[0], xy[1]);
      const st = stations.get(key);
      if (st && !st.route_name_list.includes(rName)) {
        st.route_name_list.push(rName);
      }
    }
  }

  for (const st of stations.values()) {
    st.connect_number = st.route_name_list.length;
    if (st.connect_number > 1) {
      st.type = 'intersection';
    } else {
      st.type = 'normal';
    }
  }

  const outputSegments = [];

  for (const route of routes) {
    const rName = route.routeName;
    const rColor = route.color;
    const rRouteId = route.routeId != null ? String(route.routeId) : '';
    const routeStations = [];
    for (const xy of route.coordPairs) {
      const key = coordKey(xy[0], xy[1]);
      const st = stations.get(key);
      if (st) routeStations.push(st);
    }

    if (routeStations.length < 2) continue;

    if (routeStations[0].type === 'normal') routeStations[0].type = 'terminal';
    if (routeStations[routeStations.length - 1].type === 'normal') {
      routeStations[routeStations.length - 1].type = 'terminal';
    }

    let currentSegmentStart = null;
    let currentMidStations = [];

    for (const st of routeStations) {
      const isKeyNode = st.type === 'intersection' || st.type === 'terminal';

      if (isKeyNode) {
        if (currentSegmentStart == null) {
          currentSegmentStart = st;
          currentMidStations = [];
        } else {
          const endNode = st;

          const midStationsFormatted = [];
          const midCoords = [];
          for (const ms of currentMidStations) {
            const mlon = Number(ms.lon ?? ms.x_grid);
            const mlat = Number(ms.lat ?? ms.y_grid);
            const me = ensureSegmentStationStrings(ms, mlon, mlat);
            midStationsFormatted.push({
              station_id: me.station_id,
              station_name: me.station_name,
              lon: mlon,
              lat: mlat,
              type: 'normal',
            });
            midCoords.push([mlon, mlat]);
          }

          const slon = Number(currentSegmentStart.lon ?? currentSegmentStart.x_grid);
          const slat = Number(currentSegmentStart.lat ?? currentSegmentStart.y_grid);
          const elon = Number(endNode.lon ?? endNode.x_grid);
          const elat = Number(endNode.lat ?? endNode.y_grid);
          const startE = ensureSegmentStationStrings(currentSegmentStart, slon, slat);
          const endE = ensureSegmentStationStrings(endNode, elon, elat);

          const segmentData = {
            route_id: rRouteId,
            routeName: rName,
            color: rColor,
            segment: {
              start: {
                station_id: startE.station_id,
                station_name: startE.station_name,
                route_name_list: currentSegmentStart.route_name_list,
                lon: slon,
                lat: slat,
                type: normalizeRouteSegmentEndpointType(currentSegmentStart.type),
                connect_number: currentSegmentStart.connect_number,
              },
              stations: midStationsFormatted,
              end: {
                station_id: endE.station_id,
                station_name: endE.station_name,
                route_name_list: endNode.route_name_list,
                lon: elon,
                lat: elat,
                type: normalizeRouteSegmentEndpointType(endNode.type),
                connect_number: endNode.connect_number,
              },
            },
            routeCoordinates: [
              [slon, slat],
              midCoords,
              [elon, elat],
            ],
          };
          outputSegments.push(segmentData);

          currentSegmentStart = endNode;
          currentMidStations = [];
        }
      } else if (currentSegmentStart != null) {
        currentMidStations.push(st);
      }
    }
  }

  return outputSegments;
}

function stationToGridProps(st) {
  if (!st) return null;
  const gx = st.lon ?? st.x_grid;
  const gy = st.lat ?? st.y_grid;
  const e = ensureSegmentStationStrings(st, gx, gy);
  const sid = e.station_id;
  const sna = e.station_name;
  return {
    type: 'node',
    station_id: sid,
    station_name: sna,
    x_grid: gx,
    y_grid: gy,
    tags: {
      station_id: sid,
      station_name: sna,
      name: sna,
    },
    node_type: 'connect',
    connect_number: st.connect_number,
    route_name_list: Array.isArray(st.route_name_list) ? [...st.route_name_list] : [],
  };
}

/**
 * Python 匯出列 → SpaceNetworkGrid drawMap「1-1 / properties_start」分支用 segments。
 * @param {Object[]} exportRows exportRouteSegmentsFromGeoJson 回傳值
 * @returns {Object[]}
 */
export function routeSegmentsExportToSpaceNetworkSegments(exportRows) {
  if (!Array.isArray(exportRows)) return [];
  return exportRows.map((row) => {
    const rc = row.routeCoordinates;
    const midArr = Array.isArray(rc?.[1]) ? rc[1] : [];
    const points = [];
    if (Array.isArray(rc?.[0]) && rc[0].length >= 2) {
      points.push([rc[0][0], rc[0][1]]);
    }
    for (const m of midArr) {
      if (Array.isArray(m) && m.length >= 2) points.push([m[0], m[1]]);
    }
    if (Array.isArray(rc?.[2]) && rc[2].length >= 2) {
      points.push([rc[2][0], rc[2][1]]);
    }
    const sm = row.segment || {};
    return {
      name: row.routeName,
      points,
      way_properties: {
        type: 'way',
        tags: {
          color: row.color,
          route_name: row.routeName,
        },
      },
      properties_start: stationToGridProps(sm.start),
      properties_end: stationToGridProps(sm.end),
    };
  });
}

/**
 * 一次取得「Python 形狀匯出」與「空間網路網格用 segments」。
 * @param {Object} geojson
 * @returns {{ exportRows: Object[], spaceNetworkSegments: Object[] }}
 */
export function geoJsonToRouteSegmentsAndSpaceNetwork(geojson) {
  const exportRows = exportRouteSegmentsFromGeoJson(geojson);
  return {
    exportRows,
    spaceNetworkSegments: routeSegmentsExportToSpaceNetworkSegments(exportRows),
  };
}
