/**
 * 把 metro GeoJSON（way/node）解析成「選擇路線圖」圖層用的路線／黑點／站名 meta。
 * 供 UI 載入與離線管線批次腳本共用。
 */

/**
 * @param {import('geojson').FeatureCollection} fc
 * @returns {{ lines: Array, blackDots: Array<[number,number]>, stationMeta: Record<string, object>, routeCount: number }}
 */
export function parseMetroGeojsonToRouteMap(fc) {
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  const isWay = (f) => f?.properties?.element_type === 'way' && f.geometry?.type === 'LineString';
  const isNode = (f) => f?.properties?.element_type === 'node' && f.geometry?.type === 'Point';
  const lines = feats
    .filter(isWay)
    .map((f) => ({
      color: f.properties.color || '#666666',
      routeName: f.properties.route_name,
      routeId: f.properties.route_id,
      routeCompany: f.properties.route_company,
      railway: f.properties.railway,
      osmId: f.properties.osm_id,
      latlngs: (f.geometry.coordinates || []).map(([lon, lat]) => [lat, lon]),
    }))
    .filter((l) => l.latlngs.length >= 2);
  const ll6 = (lat, lon) => `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
  const stationMeta = {};
  const nodes = [];
  for (const f of feats) {
    if (!isNode(f)) continue;
    const [lon, lat] = f.geometry.coordinates;
    stationMeta[ll6(lat, lon)] = {
      id: f.properties.station_id,
      name: f.properties.station_name,
      osmId: f.properties.osm_id,
    };
    nodes.push([lat, lon]);
  }
  const memb = new Map();
  lines.forEach((l, li) => {
    l.latlngs.forEach((c, i) => {
      const k = ll6(c[0], c[1]);
      let m = memb.get(k);
      if (!m) {
        m = { lines: new Set(), endpoint: false };
        memb.set(k, m);
      }
      m.lines.add(li);
      if (i === 0 || i === l.latlngs.length - 1) m.endpoint = true;
    });
  });
  const blackDots = nodes.filter(([lat, lon]) => {
    const m = memb.get(ll6(lat, lon));
    return m && m.lines.size < 2 && !m.endpoint;
  });
  return { lines, blackDots, stationMeta, routeCount: lines.length };
}
