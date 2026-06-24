/**
 * OSM XML → GeoJSON（僅 railway=subway、合併 cross 過河段），語意對齊 Python convert_osm_to_geojson_subway_only
 */

function tagsFromElement(el) {
  const tags = {};
  if (!el) return tags;
  for (const child of el.children) {
    if (child.localName !== 'tag') continue;
    const k = child.getAttribute('k');
    const v = child.getAttribute('v');
    if (k != null) tags[k] = v;
  }
  return tags;
}

function ndRefsFromWay(wayEl) {
  const out = [];
  for (const child of wayEl.children) {
    if (child.localName !== 'nd') continue;
    const ref = child.getAttribute('ref');
    if (ref != null) out.push(ref);
  }
  return out;
}

function isCrossStationId(stId) {
  if (stId == null) return false;
  const s = String(stId);
  return s === 'cross' || s.startsWith('cross_river_');
}

/**
 * @param {string} xmlString - 完整 OSM XML 字串
 * @returns {{ type: 'FeatureCollection', features: Array }}
 */
export function convertOsmXmlStringToGeojsonSubwayOnly(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    throw new Error('OSM XML 解析失敗');
  }
  const root = doc.documentElement;
  if (!root) {
    return { type: 'FeatureCollection', features: [] };
  }

  /** @type {Record<string, { tags: object, refs: string[] }>} */
  const waysDict = {};
  /** @type {Record<string, string[]>} */
  const nodeToWays = {};

  const ways = Array.from(root.getElementsByTagName('way'));
  for (const way of ways) {
    const tags = tagsFromElement(way);
    if (tags.railway !== 'subway' || tags.deleted === 'true') continue;
    const wayId = way.getAttribute('id');
    if (wayId == null) continue;
    const refs = ndRefsFromWay(way);
    waysDict[wayId] = { tags, refs };
    const uniq = new Set(refs);
    for (const ref of uniq) {
      if (!nodeToWays[ref]) nodeToWays[ref] = [];
      nodeToWays[ref].push(wayId);
    }
  }

  /** @type {Set<string>} */
  const nodesToMergeLines = new Set();
  const nodes = Array.from(root.getElementsByTagName('node'));
  for (const node of nodes) {
    const tags = tagsFromElement(node);
    const stId = tags.station_id ?? '';
    if (!isCrossStationId(stId)) continue;
    const nodeId = node.getAttribute('id');
    if (nodeId == null) continue;
    const wlist = nodeToWays[nodeId];
    if (wlist && wlist.length === 2) {
      nodesToMergeLines.add(nodeId);
    }
  }

  let mergedSomething = true;
  while (mergedSomething) {
    mergedSomething = false;
    const mergeIds = Array.from(nodesToMergeLines);
    for (const nodeId of mergeIds) {
      const waysWithNode = Object.keys(waysDict).filter((wid) => waysDict[wid].refs.includes(nodeId));
      if (waysWithNode.length !== 2) continue;
      const wid1 = waysWithNode[0];
      const wid2 = waysWithNode[1];
      const w1 = waysDict[wid1];
      const w2 = waysDict[wid2];
      const refs1 = w1.refs;
      const refs2 = w2.refs;
      const n = nodeId;
      let mergedRefs = null;
      if (refs1[refs1.length - 1] === n && refs2[0] === n) {
        mergedRefs = refs1.slice(0, -1).concat(refs2);
      } else if (refs1[0] === n && refs2[refs2.length - 1] === n) {
        mergedRefs = refs2.slice(0, -1).concat(refs1);
      } else if (refs1[refs1.length - 1] === n && refs2[refs2.length - 1] === n) {
        mergedRefs = refs1.slice(0, -1).concat([...refs2].reverse());
      } else if (refs1[0] === n && refs2[0] === n) {
        mergedRefs = [...refs1].reverse().slice(0, -1).concat(refs2);
      }
      if (mergedRefs != null) {
        const newWid = `${wid1}_merged_${wid2}`;
        waysDict[newWid] = { tags: { ...w1.tags }, refs: mergedRefs };
        delete waysDict[wid1];
        delete waysDict[wid2];
        mergedSomething = true;
        break;
      }
    }
  }

  /** @type {Set<string>} */
  const activeNodeRefs = new Set();
  for (const w of Object.values(waysDict)) {
    for (const ref of w.refs) {
      activeNodeRefs.add(ref);
    }
  }

  /** @type {Record<string, { lat: number, lon: number }>} */
  const nodesDict = {};
  for (const node of nodes) {
    const nodeId = node.getAttribute('id');
    const lat = parseFloat(node.getAttribute('lat'));
    const lon = parseFloat(node.getAttribute('lon'));
    if (nodeId == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    nodesDict[nodeId] = { lat, lon };
  }

  const features = [];

  for (const node of nodes) {
    const nodeId = node.getAttribute('id');
    if (nodeId == null) continue;
    const tags = tagsFromElement(node);
    if (tags.deleted === 'true') continue;
    const stId = tags.station_id ?? '';
    if (isCrossStationId(stId)) continue;
    if (Object.keys(tags).length > 0 && !activeNodeRefs.has(nodeId)) continue;
    if (Object.keys(tags).length === 0) continue;

    const pos = nodesDict[nodeId];
    if (!pos) continue;
    const properties = { osm_id: nodeId, element_type: 'node', ...tags };
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] },
      properties,
    });
  }

  for (const [wayId, wayData] of Object.entries(waysDict)) {
    const { tags, refs } = wayData;
    const coords = [];
    for (const ref of refs) {
      const p = nodesDict[ref];
      if (p) coords.push([p.lon, p.lat]);
    }
    if (coords.length === 0) continue;
    const properties = { osm_id: wayId, element_type: 'way', ...tags };
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties,
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * @param {string} fileName - public/data/ 下相對路徑
 * @returns {Promise<string>}
 */
export async function fetchPublicDataFileAsText(fileName) {
  const rel = String(fileName || '').replace(/^\//, '');
  const baseUrl = import.meta.env.BASE_URL || '/';
  const dataPath = `${baseUrl}data/${rel}`;
  let response = await fetch(dataPath);
  if (!response.ok) {
    response = await fetch(`/data/${rel}`);
  }
  if (!response.ok) {
    throw new Error(`無法載入 data/${rel}（HTTP ${response.status}）`);
  }
  return response.text();
}
