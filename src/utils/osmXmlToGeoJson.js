/**
 * 將 JOSM/OSM 0.6 XML（node + way）轉成與專案既有 GeoJSON 路網相容的 FeatureCollection。
 * way → LineString（properties.type === 'way'、tags 巢狀）；
 * 僅輸出有標籤的 node → Point，避免幾何頂點全部當成車站點。
 *
 * 略過的 way：`waterway=river`、`railway=rail`（不納入 GeoJSON）。
 *
 * `station_id` 為 `cross_river` 或以 `cross_river_` 開頭的 node：不輸出 Point；在 way 上略過該頂點，使路線直接連接前後點。
 */

function isCrossRiverStationNode(tags) {
  if (!tags || typeof tags !== 'object') return false;
  const sid = String(tags.station_id ?? '').trim();
  return sid === 'cross_river' || sid.startsWith('cross_river_');
}

function shouldSkipWayForGeoJson(tags) {
  if (!tags || typeof tags !== 'object') return false;
  if (tags.waterway === 'river') return true;
  if (tags.railway === 'rail') return true;
  return false;
}

function readTags(element) {
  const tags = {};
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    if (child.tagName.toLowerCase() !== 'tag') continue;
    const k = child.getAttribute('k');
    const v = child.getAttribute('v');
    if (k != null && v != null) tags[k] = v;
  }
  return tags;
}

/**
 * 依 nd 順序組座標，略過 cross_river 站點，使折線在該處不斷開。
 * @param {number[]} refs
 * @param {Map<number, { lat: number, lon: number, tags: Record<string, string> }>} nodeMap
 * @returns {{ coordinates: [number, number][], keptRefs: number[] }}
 */
function buildWayCoordinatesSkippingCrossRiver(refs, nodeMap) {
  /** @type {[number, number][]} */
  const coordinates = [];
  /** @type {number[]} */
  const keptRefs = [];
  for (const ref of refs) {
    const n = nodeMap.get(ref);
    if (!n) continue;
    if (isCrossRiverStationNode(n.tags)) continue;
    coordinates.push([n.lon, n.lat]);
    keptRefs.push(ref);
  }
  return { coordinates, keptRefs };
}

/**
 * @param {string} xmlString
 * @returns {Object} GeoJSON FeatureCollection
 */
export function osmXmlStringToGeoJsonFeatureCollection(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    throw new Error('OSM XML 解析失敗');
  }

  /** @type {Map<number, { lat: number, lon: number, tags: Record<string, string> }>} */
  const nodes = new Map();
  for (const el of doc.querySelectorAll('node')) {
    const id = Number(el.getAttribute('id'));
    const lat = parseFloat(el.getAttribute('lat'));
    const lon = parseFloat(el.getAttribute('lon'));
    if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    nodes.set(id, { lat, lon, tags: readTags(el) });
  }

  /** @type {Object[]} */
  const features = [];

  for (const el of doc.querySelectorAll('way')) {
    const wayId = Number(el.getAttribute('id'));
    const tags = readTags(el);
    if (shouldSkipWayForGeoJson(tags)) continue;
    /** @type {number[]} */
    const refs = [];
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (child.tagName.toLowerCase() !== 'nd') continue;
      const ref = Number(child.getAttribute('ref'));
      if (Number.isFinite(ref)) refs.push(ref);
    }
    if (refs.length < 2) continue;

    const { coordinates, keptRefs } = buildWayCoordinatesSkippingCrossRiver(refs, nodes);
    if (coordinates.length < 2) continue;

    const isClosedArea =
      coordinates.length >= 4 &&
      coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
      coordinates[0][1] === coordinates[coordinates.length - 1][1] &&
      (tags.area === 'yes' || tags.building || tags.landuse);

    if (isClosedArea) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'way',
          id: Number.isFinite(wayId) ? wayId : keptRefs[0],
          tags,
          nodes: keptRefs,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      });
    } else {
      features.push({
        type: 'Feature',
        properties: {
          type: 'way',
          id: Number.isFinite(wayId) ? wayId : keptRefs[0],
          tags,
          nodes: keptRefs,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    }
  }

  for (const [id, { lat, lon, tags }] of nodes) {
    if (!tags || Object.keys(tags).length === 0) continue;
    if (isCrossRiverStationNode(tags)) continue;
    features.push({
      type: 'Feature',
      properties: {
        type: 'node',
        id,
        tags,
      },
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
