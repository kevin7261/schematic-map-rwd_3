/**
 * 僅供 taipei_a3 → taipei_b3「站點直線化」：Colab 1-1 網格單元、吸附、依 nodes 切段。
 * 不依賴其他圖層群組之 execute；最近點對計算內嵌於此檔。
 */

function num(v) {
  return Number(v);
}

function findNearestTwoPoints(points) {
  if (points.length < 2) {
    throw new Error('點數量不足，需要至少 2 個點');
  }
  let minDistance = Infinity;
  let minIdx1 = 0;
  let minIdx2 = 1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i][0] - points[j][0];
      const dy = points[i][1] - points[j][1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
        minIdx1 = i;
        minIdx2 = j;
      }
    }
  }
  return {
    point1: points[minIdx1],
    point2: points[minIdx2],
    minDistance,
  };
}

export function stationIdFromPointProps(props) {
  if (props == null) return null;
  if (props.id != null && String(props.id).trim() !== '') return String(props.id);
  if (props.osm_id != null && String(props.osm_id).trim() !== '') return String(props.osm_id);
  return null;
}

export function geojsonSupportsColab11Linearize(geojson) {
  const features = geojson?.features;
  if (!Array.isArray(features) || features.length < 2) return false;
  /** @type {Set<string>} */
  const pointIds = new Set();
  /** @type {string[][]} */
  const lineNodeLists = [];
  for (const f of features) {
    const g = f?.geometry;
    const p = f?.properties || {};
    if (g?.type === 'Point') {
      const sid = stationIdFromPointProps(p);
      if (sid != null) pointIds.add(sid);
    } else if (
      (g?.type === 'LineString' || g?.type === 'MultiLineString') &&
      Array.isArray(p.nodes) &&
      p.nodes.length > 0
    ) {
      lineNodeLists.push(p.nodes.map((n) => String(n)));
    }
  }
  if (pointIds.size < 2 || lineNodeLists.length === 0) return false;
  for (const nids of lineNodeLists) {
    for (const nid of nids) {
      if (!pointIds.has(nid)) return false;
    }
  }
  return true;
}

function routeNameFromWayProps(wayProps) {
  const tags = wayProps?.tags;
  if (tags && typeof tags === 'object') {
    const n = tags.route_name ?? tags.name;
    if (n != null && String(n).trim() !== '') return String(n).trim();
  }
  const top = wayProps?.route_name ?? wayProps?.name;
  if (top != null && String(top).trim() !== '') return String(top).trim();
  return 'unknown';
}

function getColorFromWayProps(way) {
  const tags = way?.tags || {};
  const c = tags.colour || tags.color;
  if (typeof c === 'string' && c.trim() !== '') return c.trim();
  if (typeof way?.color === 'string' && way.color.trim() !== '') return way.color.trim();
  return '#2c7bb6';
}

/**
 * @returns {{ outputSegments: Array, meta: object }}
 */
export function linearizeGeojsonColab11(geojson) {
  if (!geojson?.features || !Array.isArray(geojson.features)) {
    return {
      outputSegments: [],
      meta: {
        stationCount: 0,
        segmentCount: 0,
        gridUnit: null,
        gridSize: null,
        bounds: null,
        nearestDistance: null,
      },
    };
  }

  const stationsData = [];
  const stationFeaturesMap = {};
  const lineFeatures = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry || {};
    const props = feature.properties || {};

    if (geom.type === 'Point') {
      const sid = stationIdFromPointProps(props);
      if (sid == null) continue;
      const [lon, lat] = geom.coordinates || [];
      stationsData.push({ id: sid, lon: num(lon), lat: num(lat) });
      stationFeaturesMap[sid] = feature;
    } else if (geom.type === 'LineString') {
      lineFeatures.push(feature);
    } else if (geom.type === 'MultiLineString') {
      const coords = geom.coordinates || [];
      for (const lineCoords of coords) {
        lineFeatures.push({
          ...feature,
          geometry: { type: 'LineString', coordinates: lineCoords },
        });
      }
    }
  }

  if (stationsData.length < 2) {
    throw new Error('站點數量不足 (少於 2 個)，無法計算網格。');
  }

  const pointsNp = stationsData.map((s) => [s.lon, s.lat]);
  const minLon = Math.min(...pointsNp.map((p) => p[0]));
  const maxLon = Math.max(...pointsNp.map((p) => p[0]));
  const minLat = Math.min(...pointsNp.map((p) => p[1]));
  const maxLat = Math.max(...pointsNp.map((p) => p[1]));

  const { point1: p1, point2: p2, minDistance: minDist } = findNearestTwoPoints(pointsNp);
  let gridUnit = Math.max(Math.abs(p1[0] - p2[0]), Math.abs(p1[1] - p2[1]));
  if (gridUnit === 0) gridUnit = 0.0001;

  const estW = Math.floor((maxLon - minLon) / gridUnit) + 1;
  const estH = Math.floor((maxLat - minLat) / gridUnit) + 1;

  const stationLookup = {};
  for (const s of stationsData) {
    const rawX = Math.floor((s.lon - minLon) / gridUnit);
    const rawY = Math.floor((s.lat - minLat) / gridUnit);
    const originalFeat = stationFeaturesMap[s.id];
    const newProps = JSON.parse(JSON.stringify(originalFeat?.properties || {}));
    newProps.x_grid = rawX;
    newProps.y_grid = rawY;

    stationLookup[s.id] = {
      coords: [rawX, rawY],
      properties: newProps,
    };
  }

  const outputSegments = [];
  for (const line of lineFeatures) {
    const nodeIds = line.properties?.nodes || [];
    const wayProps = JSON.parse(JSON.stringify(line.properties || {}));
    delete wayProps.nodes;

    const routeName = routeNameFromWayProps(wayProps);

    const pathNodes = [];
    for (const nid of nodeIds) {
      const key = String(nid);
      if (!(key in stationLookup)) continue;
      const nodeData = stationLookup[key];
      const prev = pathNodes[pathNodes.length - 1];
      if (
        !pathNodes.length ||
        prev.coords[0] !== nodeData.coords[0] ||
        prev.coords[1] !== nodeData.coords[1]
      ) {
        pathNodes.push(nodeData);
      }
    }

    if (pathNodes.length >= 2) {
      for (let i = 0; i < pathNodes.length - 1; i++) {
        const startNode = pathNodes[i];
        const endNode = pathNodes[i + 1];
        outputSegments.push({
          name: routeName,
          processed: false,
          points: [startNode.coords, endNode.coords],
          properties_start: startNode.properties,
          properties_end: endNode.properties,
          way_properties: wayProps,
        });
      }
    }
  }

  return {
    outputSegments,
    meta: {
      stationCount: stationsData.length,
      segmentCount: outputSegments.length,
      gridUnit: parseFloat(gridUnit.toFixed(6)),
      gridSize: { width: estW, height: estH },
      bounds: {
        minLon: parseFloat(minLon.toFixed(6)),
        maxLon: parseFloat(maxLon.toFixed(6)),
        minLat: parseFloat(minLat.toFixed(6)),
        maxLat: parseFloat(maxLat.toFixed(6)),
      },
      nearestDistance: parseFloat(minDist.toFixed(6)),
    },
  };
}

function buildSegmentEndpoint(props) {
  const p = JSON.parse(JSON.stringify(props || {}));
  if (!p.tags || typeof p.tags !== 'object') p.tags = {};
  const xg = p.x_grid ?? p.tags.x_grid;
  const yg = p.y_grid ?? p.tags.y_grid;
  if (xg != null) p.x_grid = num(xg);
  if (yg != null) p.y_grid = num(yg);
  if (p.tags.x_grid == null && p.x_grid != null) p.tags.x_grid = p.x_grid;
  if (p.tags.y_grid == null && p.y_grid != null) p.tags.y_grid = p.y_grid;

  const sid = p.station_id ?? p.tags?.station_id ?? p.id ?? p.osm_id ?? '';
  p.station_id = sid != null ? String(sid) : '';
  const sname = p.station_name ?? p.name ?? p.tags?.station_name ?? p.tags?.name ?? '';
  p.station_name = sname != null ? String(sname) : '';

  return p;
}

export function colabRawSegmentsToExportRows(rawSegments) {
  const rows = [];
  for (const seg of rawSegments || []) {
    const pts = seg.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const routeName = seg.name || 'unknown';
    const color = getColorFromWayProps(seg.way_properties);
    rows.push({
      routeName,
      color,
      segment: {
        start: buildSegmentEndpoint(seg.properties_start),
        stations: [],
        end: buildSegmentEndpoint(seg.properties_end),
      },
      routeCoordinates: [[num(pts[0][0]), num(pts[0][1])], [], [num(pts[1][0]), num(pts[1][1])]],
    });
  }
  return rows;
}
