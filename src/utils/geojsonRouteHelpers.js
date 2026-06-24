/**
 * GeoJSON 路網要素辨識（OSM 匯出：properties.type；自訂匯出：properties.element_type）
 */

export function isGeoJsonWayLineFeature(feature) {
  if (!feature?.properties || !feature.geometry) return false;
  const p = feature.properties;
  const isWay = p.type === 'way' || p.element_type === 'way';
  const gt = feature.geometry.type;
  return isWay && (gt === 'LineString' || gt === 'MultiLineString');
}

export function isGeoJsonNodePointFeature(feature) {
  if (!feature?.properties || !feature.geometry) return false;
  const p = feature.properties;
  const isNode = p.type === 'node' || p.element_type === 'node';
  return isNode && feature.geometry.type === 'Point';
}

/** OSM 風格：標籤在 properties.tags；扁平匯出則整份 properties 即屬性 */
export function getGeoJsonFeatureTagProps(feature) {
  if (!feature?.properties) return {};
  return feature.properties.tags || feature.properties;
}

export function getGeoJsonRouteStableId(feature) {
  const tags = getGeoJsonFeatureTagProps(feature);
  const idFallback = feature.properties?.id ?? feature.properties?.osm_id ?? 'unknown';
  return tags.route_id || tags.route_name || `route_${idFallback}`;
}

/**
 * 路段 JSON segment 端點之 type：僅允許 terminal／intersection，其餘一律 normal（含缺省、未知字串）
 * @param {string|undefined|null} type
 * @returns {'terminal'|'intersection'|'normal'}
 */
export function normalizeRouteSegmentEndpointType(type) {
  if (type === 'terminal' || type === 'intersection') return type;
  return 'normal';
}

/** 路段 JSON／segment 節點：優先 lon/lat（地理），否則 x_grid／y_grid（舊鍵） */
export function segmentNodeLon(node) {
  if (!node || typeof node !== 'object') return NaN;
  const v =
    node.lon ?? node.x_grid ?? node.tags?.lon ?? node.tags?.x_grid ?? node.tags?.lng;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** 見 {@link segmentNodeLon} */
export function segmentNodeLat(node) {
  if (!node || typeof node !== 'object') return NaN;
  const v =
    node.lat ?? node.y_grid ?? node.tags?.lat ?? node.tags?.y_grid;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * GeoJSON Way LineString／路線標籤上之路線編號（如捷運網頁示例 "R"）
 */
export function routeIdFromGeoJsonWayTags(tags) {
  if (!tags || typeof tags !== 'object') return '';
  const raw =
    tags.route_id ?? tags.route_ref ?? tags.ref ?? tags.line_id ?? tags.line ?? '';
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
}

/**
 * 與路由聚合／匯出相同之座標鍵（7 位小數），供站點去重編號。
 * @param {number} lon
 * @param {number} lat
 */
export function coordKeyLonLatDecimals(lon, lat) {
  const f = 1e7;
  const x = Math.round(Number(lon) * f) / f;
  const y = Math.round(Number(lat) * f) / f;
  return `${x},${y}`;
}

/**
 * 將路段列上各 segment.start／stations／end 改為：`station_id` 為數字字串、
 * `station_name` 為 `站點_{id}`；同一座標共用同一編號（依本陣列出現順序遞增）。
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
export function compactNumericStationFieldsInExportRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const keyToNum = new Map();
  let next = 1;

  const idForCoord = (lon, lat) => {
    const lo = Number(lon);
    const la = Number(lat);
    if (!Number.isFinite(lo) || !Number.isFinite(la)) return null;
    const k = coordKeyLonLatDecimals(lo, la);
    if (!keyToNum.has(k)) {
      keyToNum.set(k, next);
      next += 1;
    }
    return keyToNum.get(k);
  };

  const visitNodes = () => {
    const out = [];
    for (const row of rows) {
      const sm = row?.segment;
      if (!sm) continue;
      const push = (n) => {
        if (!n || typeof n !== 'object') return;
        const lo = Number(n.lon ?? n.x_grid);
        const la = Number(n.lat ?? n.y_grid);
        if (!Number.isFinite(lo) || !Number.isFinite(la)) return;
        out.push({ node: n, lon: lo, lat: la });
      };
      push(sm.start);
      for (const st of Array.isArray(sm.stations) ? sm.stations : []) push(st);
      push(sm.end);
    }
    return out;
  };

  for (const { node, lon, lat } of visitNodes()) {
    const id = idForCoord(lon, lat);
    if (id == null) continue;
    Object.assign(node, {
      station_id: String(id),
      station_name: `站點_${id}`,
      lon,
      lat,
    });
  }
  return rows;
}

/** 無正式站碼：匯出前列未壓縮前可為空字串，最後由 {@link compactNumericStationFieldsInExportRows} 填數字 id。 */
export function fallbackStationIdFromLonLat() {
  return '';
}

/** 無站名：同上，壓縮後為「站點_{id}」。 */
export function fallbackStationNameFromLonLat() {
  return '';
}

/**
 * 路段 JSON 之每個站點皆應帶齊 station_id、station_name（手繪／壓縮流程末端為數字 id 與「站點_{id}」）。
 */
export function ensureSegmentStationStrings(partial = {}, lon, lat) {
  const lo = Number(lon);
  const la = Number(lat);
  const fb = fallbackStationIdFromLonLat(lo, la);
  const sid =
    partial.station_id != null && String(partial.station_id).trim() !== ''
      ? String(partial.station_id).trim()
      : fb;
  const sna =
    partial.station_name != null && String(partial.station_name).trim() !== ''
      ? String(partial.station_name).trim()
      : fallbackStationNameFromLonLat(lo, la);
  return { ...partial, station_id: sid, station_name: sna };
}
