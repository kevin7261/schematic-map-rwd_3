/**
 * 示意圖佈局下載 JSON：補齊 segment／GeoJSON 站名（來自 StationData 或路線圖調整 stationMeta）。
 */

const llKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;

function readName(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return String(obj.station_name ?? obj.tags?.station_name ?? obj.tags?.name ?? '').trim();
}

function applyName(obj, name, id) {
  if (!obj || typeof obj !== 'object' || !name) return;
  if (readName(obj)) return;
  obj.station_name = name;
  if (id && !String(obj.station_id ?? obj.tags?.station_id ?? '').trim()) {
    obj.station_id = id;
  }
  if (obj.tags && typeof obj.tags === 'object') {
    obj.tags.station_name = name;
    if (id && !String(obj.tags.station_id ?? '').trim()) obj.tags.station_id = id;
  }
}

/**
 * @param {Array<object>} flat — spaceNetworkGridJsonData 扁平段
 * @param {{ stationData?: Array<object> }} [opts]
 */
export function enrichFlatSegmentsStationNames(flat, opts = {}) {
  if (!Array.isArray(flat)) return flat;
  const bySid = new Map();
  for (const row of opts.stationData || []) {
    const sid = String(row?.station_id ?? '').trim();
    const name = String(row?.station_name ?? '').trim();
    if (sid && name) bySid.set(sid, { name, id: sid });
  }

  const fill = (obj) => {
    if (!obj || typeof obj !== 'object' || readName(obj)) return;
    const sid = String(obj.station_id ?? obj.tags?.station_id ?? '').trim();
    if (sid && bySid.has(sid)) {
      const { name, id } = bySid.get(sid);
      applyName(obj, name, id);
    }
  };

  for (const seg of flat) {
    for (const n of seg.nodes || []) fill(n);
    fill(seg.properties_start);
    fill(seg.properties_end);
  }
  return flat;
}

/**
 * @param {*} fc — FeatureCollection
 * @param {Record<string, { id?: string, name?: string }>} [stationMeta] — lat,lng 鍵
 */
export function enrichGeoJsonStationNamesFromMeta(fc, stationMeta) {
  if (!fc?.features || !stationMeta || typeof stationMeta !== 'object') return fc;
  for (const f of fc.features) {
    if (f.geometry?.type !== 'Point') continue;
    const props = f.properties || {};
    const tags = props.tags && typeof props.tags === 'object' ? props.tags : {};
    if (readName({ ...props, tags })) continue;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lng, lat] = c;
    const meta = stationMeta[llKey(lat, lng)] || {};
    const name = String(meta.name ?? '').trim();
    if (!name) continue;
    tags.station_name = name;
    if (meta.id != null && meta.id !== '') tags.station_id = String(meta.id);
    props.tags = tags;
    props.station_name = name;
    if (meta.id != null && meta.id !== '') props.station_id = String(meta.id);
    f.properties = props;
  }
  return fc;
}

/**
 * @param {Array<object>} rows — flatSegmentsToGeojsonStyleExportRows 匯出列
 * @param {{ stationData?: Array<object> }} [opts]
 */
export function enrichExportRowsStationNames(rows, opts = {}) {
  if (!Array.isArray(rows)) return rows;
  const bySid = new Map();
  for (const row of opts.stationData || []) {
    const sid = String(row?.station_id ?? '').trim();
    const name = String(row?.station_name ?? '').trim();
    if (sid && name) bySid.set(sid, { name, id: sid });
  }
  const fill = (obj) => {
    if (!obj || typeof obj !== 'object' || readName(obj)) return;
    const sid = String(obj.station_id ?? obj.tags?.station_id ?? '').trim();
    if (sid && bySid.has(sid)) {
      const { name, id } = bySid.get(sid);
      applyName(obj, name, id);
    }
  };
  for (const row of rows) {
    const seg = row?.segment;
    if (!seg) continue;
    fill(seg.start);
    fill(seg.end);
    if (Array.isArray(seg.stations)) for (const st of seg.stations) fill(st);
  }
  return rows;
}

/**
 * 從路線圖調整骨架重新產生輸入 GeoJSON（含站名）；無骨架時回傳 null。
 * @param {ReturnType<typeof import('@/stores/dataStore.js').useDataStore>} dataStore
 */
export function buildSchematicInputGeoJsonForDownload(dataStore) {
  const straight = dataStore.findLayerById('route_map_adjust_straight');
  const skS = straight?.routeMapAdjustSkeleton;
  if (skS?.edges?.length) {
    const lines = Array.isArray(straight.routeMapAdjustStraightenedLines)
      ? straight.routeMapAdjustStraightenedLines
      : straight.routeMapAdjustLines || [];
    const blackDots = Array.isArray(straight.routeMapAdjustStraightenedBlackDots)
      ? straight.routeMapAdjustStraightenedBlackDots
      : straight.routeMapAdjustBlackDots || [];
    const stationMeta =
      straight.routeMapAdjustStraightenedStationMeta || straight.routeMapAdjustStationMeta || null;
    // lazy import avoided — caller passes routeMapAdjustSkeletonToGeoJson
    return { source: 'straight', sk: skS, lines, blackDots, stationMeta, straightLayer: straight };
  }
  const adj = dataStore.findLayerById('route_map_adjust');
  const sk = adj?.routeMapAdjustSkeleton;
  if (sk?.edges?.length) {
    return {
      source: 'adjust',
      sk,
      lines: adj.routeMapAdjustLines || [],
      blackDots: adj.routeMapAdjustBlackDots || [],
      stationMeta: adj.routeMapAdjustStationMeta || null,
      straightLayer: null,
    };
  }
  return null;
}
