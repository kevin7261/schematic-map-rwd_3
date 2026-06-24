/**
 * Export map-drawn route legs — aligned with SpaceNetworkGridTab drawing:
 * - Red endpoints: polyline points[0] / points[last] + ConnectData (same pairing as the map).
 * - Black stations (e/f): full StationData rows for station_list order (map draws blacks from StationData).
 */

import { normalizeSpaceNetworkDataToFlatSegments } from './gridNormalizationMinDistance.js';

const EPS = 1e-6;

function num(v) {
  return Number(v ?? 0);
}

function cloneJson(obj) {
  if (obj === undefined || obj === null) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function getC(p) {
  return Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p?.x), num(p?.y)];
}

function pointKey(x, y) {
  return `${num(x)},${num(y)}`;
}

/** 路線繪製色（供匯出與 g 層讀檔）；與 segment.way_properties.tags.color 同源 */
function segmentDisplayColor(seg) {
  const tags = seg?.way_properties?.tags;
  const c0 = tags?.color ?? seg?.original_props?.tags?.color;
  if (typeof c0 === 'string' && c0.trim() !== '') return c0.trim();
  if (typeof seg?.color === 'string' && seg.color.trim() !== '') return seg.color.trim();
  return '#666666';
}

function normalizeRouteKey(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((r) => String(r ?? '').trim())
    .filter((r) => r !== '')
    .sort()
    .join('|');
}

function pairKey(a, b) {
  return [a, b].sort().join(' <-> ');
}

/**
 * ConnectData full record + geometry from polyline endpoint (sparse wins on x_grid/y_grid).
 */
function enrichFromMaster(sparse, master) {
  if (!master) return sparse ? cloneJson(sparse) : null;
  if (!sparse) return cloneJson(master);
  const m = cloneJson(master);
  const s = cloneJson(sparse);
  return {
    ...m,
    ...s,
    tags: { ...(m.tags || {}), ...(s.tags || {}) },
  };
}

function buildConnectResolution(connectData) {
  const connectByRouteKey = new Map();
  for (const cd of connectData || []) {
    if (!cd) continue;
    const rk = normalizeRouteKey(cd.route_list);
    if (!rk) continue;
    if (!connectByRouteKey.has(rk)) connectByRouteKey.set(rk, []);
    connectByRouteKey.get(rk).push(cd);
  }

  const connectByNumber = new Map();
  const connectByCoord = new Map();
  for (const c of connectData || []) {
    if (!c) continue;
    const cn = c.connect_number ?? c.tags?.connect_number;
    const cx = c.x_grid ?? c.tags?.x_grid;
    const cy = c.y_grid ?? c.tags?.y_grid;
    if (cn != null && !connectByNumber.has(cn)) connectByNumber.set(cn, c);
    if (cx != null && cy != null) {
      const pk = pointKey(cx, cy);
      if (!connectByCoord.has(pk)) connectByCoord.set(pk, c);
    }
  }

  const resolveConnect = (props, fallbackPoint) => {
    if (!props) return null;
    const cn = props.connect_number ?? props.tags?.connect_number;
    if (cn != null && connectByNumber.has(cn)) return connectByNumber.get(cn);
    const x = props.x_grid ?? props.tags?.x_grid ?? fallbackPoint?.[0];
    const y = props.y_grid ?? props.tags?.y_grid ?? fallbackPoint?.[1];
    if (x != null && y != null) return connectByCoord.get(pointKey(x, y)) || null;
    return null;
  };

  const connectId = (cd) => {
    if (!cd) return null;
    const cnn = cd.connect_number ?? cd.tags?.connect_number;
    if (cnn != null) return `cn:${cnn}`;
    const cx = cd.x_grid ?? cd.tags?.x_grid;
    const cy = cd.y_grid ?? cd.tags?.y_grid;
    if (cx != null && cy != null) return `xy:${pointKey(cx, cy)}`;
    return null;
  };

  return { connectByRouteKey, resolveConnect, connectId };
}

function buildConnectByCoordMap(connectData) {
  const connectByCoord = new Map();
  for (const c of connectData || []) {
    if (!c) continue;
    const cx = c.x_grid ?? c.tags?.x_grid;
    const cy = c.y_grid ?? c.tags?.y_grid;
    if (cx == null || cy == null) continue;
    const pk = pointKey(cx, cy);
    if (!connectByCoord.has(pk)) connectByCoord.set(pk, c);
  }
  return connectByCoord;
}

function buildEndpointConnectMap(flatSegs, connectData) {
  const { connectByRouteKey, resolveConnect, connectId } = buildConnectResolution(connectData);
  const connectByCoord = buildConnectByCoordMap(connectData);

  const currentConnects = new Map();
  for (const seg of flatSegs) {
    const routeName = seg.route_name ?? seg.name ?? 'Unknown';
    const pts = seg.points?.map(getC) || [];
    if (pts.length < 2) continue;
    for (const pt of [pts[0], pts[pts.length - 1]]) {
      const k = pointKey(pt[0], pt[1]);
      if (!currentConnects.has(k)) {
        currentConnects.set(k, { x: pt[0], y: pt[1], routeNames: new Set() });
      }
      currentConnects.get(k).routeNames.add(routeName);
    }
  }

  const usedConnectData = new Set();
  const endpointConnectMap = new Map();
  currentConnects.forEach(({ x, y, routeNames }) => {
    const rk = normalizeRouteKey([...routeNames]);
    const storedList = (rk && connectByRouteKey.get(rk)) || [];
    let chosen = null;
    if (storedList.length === 1) {
      chosen = storedList[0];
    } else if (storedList.length > 1) {
      let bestDist = Infinity;
      for (const cd of storedList) {
        if (usedConnectData.has(cd)) continue;
        const sx = num(cd?.x_grid ?? cd?.tags?.x_grid ?? 0);
        const sy = num(cd?.y_grid ?? cd?.tags?.y_grid ?? 0);
        const d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < bestDist) {
          bestDist = d;
          chosen = cd;
        }
      }
    }
    if (!chosen) {
      chosen = connectByCoord.get(pointKey(x, y)) || null;
    }
    if (chosen) usedConnectData.add(chosen);
    endpointConnectMap.set(pointKey(x, y), chosen || null);
  });

  return { endpointConnectMap, resolveConnect, connectId };
}

function buildSectionBuckets(sectionData, resolveConnect, connectId) {
  const sectionBuckets = new Map();
  for (const sd of sectionData || []) {
    if (!sd) continue;
    const startCd = resolveConnect(sd.connect_start, null);
    const endCd = resolveConnect(sd.connect_end, null);
    const startCid = connectId(startCd);
    const endCid = connectId(endCd);
    const key = startCid && endCid ? pairKey(startCid, endCid) : null;
    if (!key) continue;
    if (!sectionBuckets.has(key)) sectionBuckets.set(key, []);
    sectionBuckets.get(key).push(sd);
  }
  return sectionBuckets;
}

function matchSectionForSegment(seg, ctx) {
  const { endpointConnectMap, sectionBuckets, resolveConnect, connectId, usedSection } = ctx;
  const pts = (seg.points || []).map(getC);
  if (pts.length < 2) return null;
  const startK = pointKey(pts[0][0], pts[0][1]);
  const endK = pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  const segRoute = (seg.route_name ?? seg.name ?? 'Unknown').trim();
  const startCd = endpointConnectMap.get(startK);
  const endCd = endpointConnectMap.get(endK);
  const startCid = connectId(startCd);
  const endCid = connectId(endCd);
  const bucketKey = startCid && endCid ? pairKey(startCid, endCid) : null;
  if (!bucketKey) return null;

  const candidates = sectionBuckets.get(bucketKey) || [];
  const avail = candidates.filter((sd) => !usedSection.has(sd));
  const byRoute = avail.filter((sd) => (sd.route_name ?? '').trim() === segRoute);
  // 嚴格依 route_name 配對：同名路段優先；否則只接受「無 route_name」的未指派 section。
  // 絕不把別條路線（不同 route_name）的 section 當成自己的——即使座標重疊、落在同一 bucket。
  const matched =
    byRoute.length >= 1
      ? byRoute[0]
      : avail.find((sd) => !(sd.route_name ?? '').trim()) || null;
  if (!matched) return null;

  let poly = pts;
  let polyReversed = false;
  const sdStartCd = resolveConnect(matched.connect_start, null);
  const sdEndCd = resolveConnect(matched.connect_end, null);
  if (
    sdStartCd &&
    sdEndCd &&
    connectId(startCd) === connectId(sdEndCd) &&
    connectId(endCd) === connectId(sdStartCd)
  ) {
    poly = [...pts].reverse();
    polyReversed = true;
  }

  usedSection.add(matched);
  /** polyReversed：折線已反轉時，幾何首點＝原 segment 終點，ConnectData 須對調 */
  return { matched, poly, startCd, endCd, polyReversed };
}

function stationsFromSectionMatched(matched, stationLookup) {
  const connectSids = new Set();
  const startSid = (
    matched.connect_start?.station_id ??
    matched.connect_start?.tags?.station_id ??
    ''
  )
    .toString()
    .trim();
  const endSid = (matched.connect_end?.station_id ?? matched.connect_end?.tags?.station_id ?? '')
    .toString()
    .trim();
  if (startSid) connectSids.add(startSid);
  if (endSid) connectSids.add(endSid);
  const stList = (matched.station_list || []).filter(
    (s) => !s.station_id || !connectSids.has(String(s.station_id ?? '').trim())
  );
  const out = [];
  for (const st of stList) {
    const sid = String(st.station_id ?? '').trim();
    const full = sid && stationLookup.has(sid) ? stationLookup.get(sid) : st;
    out.push(cloneJson(full));
  }
  return out;
}

function connectNodesOrdered(nodes) {
  return (nodes || []).filter((n) => String(n?.node_type).toLowerCase() === 'connect');
}

function buildStationByXY(stationData) {
  const byXY = new Map();
  const lines = [];
  const others = [];
  for (const s of stationData || []) {
    if (!s) continue;
    if (String(s.node_type).toLowerCase() === 'line') lines.push(s);
    else others.push(s);
  }
  for (const s of [...lines, ...others]) {
    const x = s.x_grid ?? s.tags?.x_grid;
    const y = s.y_grid ?? s.tags?.y_grid;
    if (x == null || y == null) continue;
    const k = pointKey(x, y);
    if (!byXY.has(k)) byXY.set(k, s);
  }
  return byXY;
}

function resolveStationMaster(sparse, byXY) {
  const x = sparse.x_grid ?? sparse.tags?.x_grid;
  const y = sparse.y_grid ?? sparse.tags?.y_grid;
  if (x == null || y == null) return null;
  return byXY.get(pointKey(x, y)) || null;
}

function lineStationsFromNodes(nodes, stationByXY) {
  const out = [];
  for (const n of nodes || []) {
    if (String(n?.node_type).toLowerCase() !== 'line') continue;
    const master = resolveStationMaster(n, stationByXY);
    out.push(enrichFromMaster(n, master));
  }
  return out;
}

function endpointsFromPolylineEndpoints(seg, endpointConnectMap) {
  const pts = (seg.points || []).map(getC);
  const startK = pointKey(pts[0][0], pts[0][1]);
  const endK = pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  const startCd = endpointConnectMap.get(startK) || null;
  const endCd = endpointConnectMap.get(endK) || null;
  const startGeom = { x_grid: pts[0][0], y_grid: pts[0][1], node_type: 'connect' };
  const endGeom = {
    x_grid: pts[pts.length - 1][0],
    y_grid: pts[pts.length - 1][1],
    node_type: 'connect',
  };
  return {
    start: enrichFromMaster(startGeom, startCd),
    end: enrichFromMaster(endGeom, endCd),
  };
}

/**
 * Vertices where polyline direction changes (HV turns or non-colinear).
 * @param {Array} pts - [[x,y], ...]
 * @returns {Array<[number, number]>}
 */
export function polylineTurningPoints(pts) {
  const flat = (pts || []).map((p) => [num(p[0]), num(p[1])]);
  if (flat.length < 3) return [];
  const out = [];
  for (let i = 1; i < flat.length - 1; i++) {
    const p0 = flat[i - 1];
    const p1 = flat[i];
    const p2 = flat[i + 1];
    const dx1 = p1[0] - p0[0];
    const dy1 = p1[1] - p0[1];
    const dx2 = p2[0] - p1[0];
    const dy2 = p2[1] - p1[1];
    const horiz1 = Math.abs(dy1) < EPS && Math.abs(dx1) > EPS;
    const vert1 = Math.abs(dx1) < EPS && Math.abs(dy1) > EPS;
    const horiz2 = Math.abs(dy2) < EPS && Math.abs(dx2) > EPS;
    const vert2 = Math.abs(dx2) < EPS && Math.abs(dy2) > EPS;
    const turn90 = (horiz1 && vert2) || (vert1 && horiz2);
    if (turn90) {
      out.push([p1[0], p1[1]]);
      continue;
    }
    if ((horiz1 || vert1) && (horiz2 || vert2)) {
      continue;
    }
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) > EPS) {
      out.push([p1[0], p1[1]]);
    }
  }
  return out;
}

function routeCoordinatesTripleFromPoly(poly) {
  if (!poly || poly.length === 0) return null;
  if (poly.length === 1) {
    const p = poly[0];
    return [[...p], [], [...p]];
  }
  return [[...poly[0]], polylineTurningPoints(poly), [...poly[poly.length - 1]]];
}

/**
 * ConnectData／StationData／SectionData 中所有「connect」格點的格鍵集合；
 * 並從 flatSegs 的 nodes 補充 node_type === 'connect' 的格點。
 */
function buildConnectGridKeySetForExport(connectData, stationData, sectionData, flatSegs) {
  const set = new Set();
  const addIfConnect = (row) => {
    if (!row || typeof row !== 'object') return;
    const nt = String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase();
    if (nt !== 'connect') return;
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null) return;
    set.add(pointKey(x, y));
  };
  if (Array.isArray(connectData)) connectData.forEach(addIfConnect);
  if (Array.isArray(stationData)) stationData.forEach(addIfConnect);
  if (Array.isArray(sectionData)) {
    for (const sec of sectionData) {
      if (!sec || typeof sec !== 'object') continue;
      addIfConnect(sec.connect_start);
      addIfConnect(sec.connect_end);
    }
  }
  for (const seg of flatSegs || []) {
    const pts = seg.points || [];
    const nodes = seg.nodes;
    if (!Array.isArray(nodes)) continue;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n || String(n.node_type ?? '').toLowerCase() !== 'connect') continue;
      const pt = pts[i];
      if (!pt) continue;
      const [px, py] = getC(pt);
      set.add(pointKey(px, py));
    }
  }
  return set;
}

/**
 * 在同一路線內，把相鄰只由「黑點（非 connect）」相接的 sub-segment 合併，
 * 讓每筆 segment 的起點與終點都是 connect（紅點）或真正的末端點。
 * 合併後 points／nodes 串接，station_weights 清空（載入時重算）。
 */
function mergeSegmentsToConnectSpans(flat, connectGridKeys) {
  if (!connectGridKeys || connectGridKeys.size === 0) return flat;

  const byRoute = new Map();
  const routeOrder = [];
  for (const seg of flat) {
    const rn = seg.route_name ?? seg.name ?? 'Unknown';
    if (!byRoute.has(rn)) { byRoute.set(rn, []); routeOrder.push(rn); }
    byRoute.get(rn).push(seg);
  }

  const result = [];

  for (const rn of routeOrder) {
    const segs = byRoute.get(rn);

    // endKey → segment
    const byEnd = new Map();
    for (const s of segs) {
      const pts = (s.points || []).map(getC);
      if (!pts.length) continue;
      byEnd.set(pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]), s);
    }
    // startKey → segment
    const byStart = new Map();
    for (const s of segs) {
      const pts = (s.points || []).map(getC);
      if (!pts.length) continue;
      byStart.set(pointKey(pts[0][0], pts[0][1]), s);
    }

    const visited = new Set();

    for (const seg of segs) {
      const pts0 = (seg.points || []).map(getC);
      if (!pts0.length || visited.has(seg)) continue;

      const sk = pointKey(pts0[0][0], pts0[0][1]);
      const prevSeg = byEnd.get(sk);
      // 若前一段未被 visit 且接縫不是 connect，則此 seg 不是鏈的起點
      if (prevSeg && !visited.has(prevSeg) && !connectGridKeys.has(sk)) continue;

      const chain = [];
      let cur = seg;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        chain.push(cur);
        const curPts = (cur.points || []).map(getC);
        const ek = pointKey(curPts[curPts.length - 1][0], curPts[curPts.length - 1][1]);
        if (connectGridKeys.has(ek)) break; // 終點是 connect → 停
        const next = byStart.get(ek);
        if (!next || visited.has(next)) break;
        cur = next;
      }

      if (chain.length === 1) {
        result.push(chain[0]);
        continue;
      }

      const first = chain[0];
      const last = chain[chain.length - 1];
      const allHaveNodes = chain.every(
        (s) => Array.isArray(s.nodes) && s.nodes.length === (s.points || []).length,
      );
      const mergedPoints = [...(first.points || [])];
      const mergedNodes = allHaveNodes ? [...(first.nodes || [])] : null;

      for (let ci = 1; ci < chain.length; ci++) {
        const s = chain[ci];
        mergedPoints.push(...(s.points || []).slice(1));
        if (mergedNodes && Array.isArray(s.nodes)) {
          mergedNodes.push(...s.nodes.slice(1));
        }
      }

      const merged = {
        ...first,
        points: mergedPoints,
        properties_end: last.properties_end,
        station_weights: [],
      };
      if (mergedNodes && mergedNodes.length === mergedPoints.length) {
        merged.nodes = mergedNodes;
      } else {
        delete merged.nodes;
      }
      result.push(merged);
    }

    // 未被走到的段直接加入（防漏）
    for (const s of segs) {
      if (!visited.has(s)) result.push(s);
    }
  }

  return result;
}

/**
 * taipei_e／taipei_f／taipei_g 共用：輸出與 e_final 地圖路段匯出相同結構（routeName、color、segment、routeCoordinates）。
 * start／end 一定為 connect（紅點）或路線末端點；中間黑點站一律放入 stations[]。
 * @param {{
 *   layerId?: string,
 *   spaceNetworkGridJsonData?: Array,
 *   spaceNetworkGridJsonData_ConnectData?: Array,
 *   spaceNetworkGridJsonData_SectionData?: Array,
 *   spaceNetworkGridJsonData_StationData?: Array,
 * }} layer
 */
export function buildMapDrawnRoutesExport(layer) {
  const raw = layer?.spaceNetworkGridJsonData;
  const rawFlat = normalizeSpaceNetworkDataToFlatSegments(raw || []);
  const connectData = layer?.spaceNetworkGridJsonData_ConnectData;
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const stationData = layer?.spaceNetworkGridJsonData_StationData;

  // 將黑點相接的 sub-segment 合併回 connect→connect 跨段，確保 start/end 皆為紅點或末端點
  const connectGridKeys = buildConnectGridKeySetForExport(
    connectData,
    stationData,
    sectionData,
    rawFlat,
  );
  const flat = mergeSegmentsToConnectSpans(rawFlat, connectGridKeys);

  const stationLookup = new Map();
  for (const s of stationData || []) {
    if (s?.station_id) stationLookup.set(String(s.station_id).trim(), s);
  }

  const stationByXY = buildStationByXY(stationData);

  const canSectionMatch =
    Array.isArray(connectData) &&
    connectData.length > 0 &&
    Array.isArray(sectionData) &&
    sectionData.length > 0;

  let endpointConnectMap = null;
  let sectionCtx = null;
  if (Array.isArray(connectData) && connectData.length > 0) {
    const built = buildEndpointConnectMap(flat, connectData);
    endpointConnectMap = built.endpointConnectMap;
    if (canSectionMatch) {
      const { resolveConnect, connectId } = buildConnectResolution(connectData);
      sectionCtx = {
        endpointConnectMap,
        sectionBuckets: buildSectionBuckets(sectionData, resolveConnect, connectId),
        resolveConnect,
        connectId,
        usedSection: new Set(),
      };
    }
  }

  const result = [];

  for (const seg of flat) {
    if (!seg?.points || seg.points.length < 2) continue;
    const routeName = seg.route_name ?? seg.name ?? 'Unknown';

    let start;
    let end;
    let stations;
    let polyForCoords = (seg.points || []).map(getC);

    if (canSectionMatch) {
      const m = matchSectionForSegment(seg, sectionCtx);
      if (m) {
        polyForCoords = m.poly;
        const [p0, p1] = [m.poly[0], m.poly[m.poly.length - 1]];
        const cdAtStart = m.polyReversed ? m.endCd : m.startCd;
        const cdAtEnd = m.polyReversed ? m.startCd : m.endCd;
        start = enrichFromMaster({ x_grid: p0[0], y_grid: p0[1], node_type: 'connect' }, cdAtStart);
        end = enrichFromMaster({ x_grid: p1[0], y_grid: p1[1], node_type: 'connect' }, cdAtEnd);
        stations = stationsFromSectionMatched(m.matched, stationLookup);
      }
    }

    if (start == null || end == null) {
      if (endpointConnectMap) {
        const ep = endpointsFromPolylineEndpoints(seg, endpointConnectMap);
        start = ep.start;
        end = ep.end;
      } else {
        const connects = connectNodesOrdered(seg.nodes);
        const startSparse = connects[0] || seg.properties_start;
        const endSparse = connects.length >= 2 ? connects[connects.length - 1] : seg.properties_end;
        const pts = (seg.points || []).map(getC);
        const r = buildConnectResolution(connectData || []);
        start = startSparse
          ? enrichFromMaster(
              { x_grid: pts[0][0], y_grid: pts[0][1], node_type: 'connect' },
              r.resolveConnect(startSparse, pts[0])
            )
          : null;
        end = endSparse
          ? enrichFromMaster(
              {
                x_grid: pts[pts.length - 1][0],
                y_grid: pts[pts.length - 1][1],
                node_type: 'connect',
              },
              r.resolveConnect(endSparse, pts[pts.length - 1])
            )
          : null;
      }
    }
    if (stations === undefined) {
      stations = lineStationsFromNodes(seg.nodes, stationByXY);
    }

    const triple = routeCoordinatesTripleFromPoly(polyForCoords);
    if (!triple) continue;

    result.push({
      routeName,
      color: segmentDisplayColor(seg),
      segment: {
        start,
        stations: stations ?? lineStationsFromNodes(seg.nodes, stationByXY),
        end,
      },
      routeCoordinates: triple,
    });
  }

  return result;
}
