/**
 * 與 SpaceNetworkGridTab「車站配置」相同之 SectionData 配對邏輯，產生路線 hover 用欄位。
 */

/** 紅點端：站名 + connect #（不含座標） */
export function redEndpointShortLabel(c) {
  if (!c) return '—';
  const name = String(c.station_name ?? c.tags?.station_name ?? c.tags?.name ?? '').trim();
  const cn = c.connect_number ?? c.tags?.connect_number;
  const bits = [];
  if (name) bits.push(name);
  if (cn != null && String(cn).trim() !== '') bits.push(`#${cn}`);
  return bits.length ? bits.join(' ') : '—';
}

/**
 * @param {Object} layer - 須含 spaceNetworkGridJsonData_ConnectData / _SectionData
 * @param {Array} flatSegs - 與畫面 route 同序之 segment 陣列（含 points、route_name）
 * @returns {Array<null | { redStart: string, redEnd: string, blackCount: number }>}
 */
export function buildSegmentSectionHoverEntries(layer, flatSegs) {
  const n = flatSegs?.length ?? 0;
  const out = Array.from({ length: n }, () => null);
  const connectData = layer?.spaceNetworkGridJsonData_ConnectData;
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  if (!Array.isArray(connectData) || !Array.isArray(sectionData) || n === 0) return out;

  const toNum = (v) => Number(v ?? 0);
  const getC = (p) =>
    Array.isArray(p) ? [toNum(p[0]), toNum(p[1])] : [toNum(p?.x), toNum(p?.y)];
  const pointKey = (x, y) => `${toNum(x)},${toNum(y)}`;
  const normalizeRouteKey = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((r) => String(r ?? '').trim())
      .filter((r) => r !== '')
      .sort()
      .join('|');

  const currentConnects = new Map();
  flatSegs.forEach((seg) => {
    const routeName = seg.route_name ?? seg.name ?? 'Unknown';
    const pts = seg.points?.map(getC) || [];
    if (pts.length < 2) return;
    for (const pt of [pts[0], pts[pts.length - 1]]) {
      const k = pointKey(pt[0], pt[1]);
      if (!currentConnects.has(k)) {
        currentConnects.set(k, { x: pt[0], y: pt[1], routeNames: new Set() });
      }
      currentConnects.get(k).routeNames.add(routeName);
    }
  });

  const connectByRouteKey = new Map();
  connectData.forEach((cd) => {
    if (!cd) return;
    const rk = normalizeRouteKey(cd.route_list);
    if (!rk) return;
    if (!connectByRouteKey.has(rk)) connectByRouteKey.set(rk, []);
    connectByRouteKey.get(rk).push(cd);
  });

  const connectByNumber = new Map();
  const connectByCoord = new Map();
  connectData.forEach((c) => {
    if (!c) return;
    const cn = c.connect_number ?? c.tags?.connect_number;
    const cx = c.x_grid ?? c.tags?.x_grid;
    const cy = c.y_grid ?? c.tags?.y_grid;
    if (cn != null && !connectByNumber.has(cn)) connectByNumber.set(cn, c);
    if (cx != null && cy != null) {
      const pk = pointKey(cx, cy);
      if (!connectByCoord.has(pk)) connectByCoord.set(pk, c);
    }
  });

  const resolveConnect = (props, fallbackPoint) => {
    const cn = props?.connect_number ?? props?.tags?.connect_number;
    if (cn != null && connectByNumber.has(cn)) return connectByNumber.get(cn);
    const x = props?.x_grid ?? props?.tags?.x_grid ?? fallbackPoint?.[0];
    const y = props?.y_grid ?? props?.tags?.y_grid ?? fallbackPoint?.[1];
    if (x != null && y != null) return connectByCoord.get(pointKey(x, y)) || null;
    return null;
  };

  const connectId = (cd) => {
    if (!cd) return null;
    const cn = cd.connect_number ?? cd.tags?.connect_number;
    if (cn != null) return `cn:${cn}`;
    const cx = cd.x_grid ?? cd.tags?.x_grid;
    const cy = cd.y_grid ?? cd.tags?.y_grid;
    if (cx != null && cy != null) return `xy:${pointKey(cx, cy)}`;
    return null;
  };

  const pairKey = (a, b) => [a, b].sort().join(' <-> ');
  const sectionBuckets = new Map();
  sectionData.forEach((sd) => {
    if (!sd) return;
    const startCd = resolveConnect(sd.connect_start, null);
    const endCd = resolveConnect(sd.connect_end, null);
    const startCid = connectId(startCd);
    const endCid = connectId(endCd);
    const key = startCid && endCid ? pairKey(startCid, endCid) : null;
    if (key) {
      if (!sectionBuckets.has(key)) sectionBuckets.set(key, []);
      sectionBuckets.get(key).push(sd);
    }
  });

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
        const sx = toNum(cd?.x_grid ?? cd?.tags?.x_grid ?? 0);
        const sy = toNum(cd?.y_grid ?? cd?.tags?.y_grid ?? 0);
        const d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < bestDist) {
          bestDist = d;
          chosen = cd;
        }
      }
    }
    if (chosen) usedConnectData.add(chosen);
    endpointConnectMap.set(pointKey(x, y), chosen);
  });

  const usedSection = new Set();
  flatSegs.forEach((seg, idx) => {
    if (!seg?.points || seg.points.length < 2) return;
    const pts = seg.points.map(getC);
    const startK = pointKey(pts[0][0], pts[0][1]);
    const endK = pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    const segRoute = seg.route_name ?? seg.name ?? 'Unknown';
    const startCd = endpointConnectMap.get(startK);
    const endCd = endpointConnectMap.get(endK);
    const startCid = connectId(startCd);
    const endCid = connectId(endCd);
    const key = startCid && endCid ? pairKey(startCid, endCid) : null;
    if (!key) return;

    const candidates = sectionBuckets.get(key) || [];
    const avail = candidates.filter((sd) => !usedSection.has(sd));
    const byRoute = avail.filter((sd) => (sd.route_name ?? '').trim() === segRoute);
    // 嚴格依 route_name 配對：同名路段優先；否則只接受「無 route_name」的未指派 section。
    // 絕不把別條路線（不同 route_name）的 section 當成自己的——即使座標重疊、落在同一 bucket。
    const matched =
      byRoute.length >= 1
        ? byRoute[0]
        : avail.find((sd) => !(sd.route_name ?? '').trim()) || null;
    if (!matched) return;

    usedSection.add(matched);

    const connectSids = new Set();
    if (matched.connect_start?.station_id)
      connectSids.add(String(matched.connect_start.station_id).trim());
    if (matched.connect_end?.station_id)
      connectSids.add(String(matched.connect_end.station_id).trim());
    const stList = (matched.station_list || []).filter(
      (s) => !s.station_id || !connectSids.has(String(s.station_id ?? '').trim())
    );

    out[idx] = {
      redStart: redEndpointShortLabel(matched.connect_start),
      redEnd: redEndpointShortLabel(matched.connect_end),
      blackCount: stList.length,
    };
  });

  return out;
}
