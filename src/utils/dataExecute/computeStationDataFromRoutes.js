/**
 * 從 routesData 計算 SectionData、ConnectData、StationData
 * 供 taipei_a「儲存車站資訊」使用
 *
 * SectionData：**每個 segment（兩端紅點之間）一筆**，connect_start／connect_end 為該段起迄，
 * station_list 僅來自該段 nodes 的 line 車站。繪製時以 connectId 雙端鍵一對一配對，不會跨線錯置。
 */

/**
 * @param {Array} routesData - spaceNetworkGridJsonData（routes 或 flat segments）
 * @returns {{ sectionData: Array, connectData: Array, stationData: Array }}
 */
export function computeStationDataFromRoutes(routesData) {
  const normalize = (v) => {
    const s = (v ?? '').trim();
    return s === '—' || s === '－' ? '' : s;
  };

  const toCoord = (p) =>
    Array.isArray(p)
      ? [Number(p[0] ?? 0), Number(p[1] ?? 0)]
      : [Number(p?.x ?? 0), Number(p?.y ?? 0)];

  const pushLineStations = (nodes, connectSids, out) => {
    for (const n of nodes || []) {
      if (n.node_type !== 'line') continue;
      const sid = normalize(n.station_id ?? n.tags?.station_id ?? '');
      const sname = normalize(n.station_name ?? n.tags?.station_name ?? n.tags?.name ?? '');
      if (sid === '' && sname === '') continue;
      if (sid && connectSids.has(sid)) continue;
      out.push({ station_id: sid, station_name: sname });
    }
  };

  const segments = [];
  const raw = routesData || [];
  if (raw.length > 0 && raw[0]?.segments && !raw[0]?.points) {
    raw.forEach((route) => {
      const routeName = route.route_name ?? route.name ?? 'Unknown';
      (route.segments || []).forEach((seg) => {
        segments.push({
          ...seg,
          route_name: seg.route_name ?? routeName,
          name: seg.name ?? routeName,
          nodes: seg.nodes ?? [],
        });
      });
    });
  } else {
    raw.forEach((seg) => {
      segments.push({
        ...seg,
        route_name: seg.route_name ?? seg.name ?? 'Unknown',
        name: seg.name ?? seg.route_name ?? 'Unknown',
        nodes: seg.nodes ?? [],
      });
    });
  }

  const sectionData = [];
  for (const seg of segments) {
    if (!seg?.points || seg.points.length < 2) continue;
    const routeName = seg.route_name ?? seg.name ?? 'Unknown';
    const pts = seg.points || [];
    const c0 = toCoord(pts[0]);
    const c1 = toCoord(pts[pts.length - 1]);
    const start = {
      ...(seg.properties_start || {}),
      x_grid: c0[0],
      y_grid: c0[1],
      tags: { ...(seg.properties_start?.tags || {}), x_grid: c0[0], y_grid: c0[1] },
    };
    const end = {
      ...(seg.properties_end || {}),
      x_grid: c1[0],
      y_grid: c1[1],
      tags: { ...(seg.properties_end?.tags || {}), x_grid: c1[0], y_grid: c1[1] },
    };
    const connect_start = JSON.parse(JSON.stringify(start));
    const connect_end = JSON.parse(JSON.stringify(end));
    const connectSids = new Set();
    const startSid = normalize(start.station_id ?? start.tags?.station_id ?? '');
    const endSid = normalize(end.station_id ?? end.tags?.station_id ?? '');
    if (startSid) connectSids.add(startSid);
    if (endSid) connectSids.add(endSid);
    const station_list = [];
    pushLineStations(seg.nodes, connectSids, station_list);
    sectionData.push({
      route_name: routeName,
      connect_start,
      connect_end,
      station_list,
    });
  }

  const connectPointKey = (props) => {
    if (!props) return null;
    const cn = props.connect_number ?? props.tags?.connect_number;
    if (cn != null) return `cn:${cn}`;
    const x = props.x_grid ?? props.tags?.x_grid ?? '';
    const y = props.y_grid ?? props.tags?.y_grid ?? '';
    return `xy:${x},${y}`;
  };
  const connectPointMap = new Map();
  for (const seg of segments) {
    const routeName = seg.route_name ?? seg.name ?? 'Unknown';
    const pts = seg.points || [];
    if (pts.length < 2) continue;
    const g0 = toCoord(pts[0]);
    const g1 = toCoord(pts[pts.length - 1]);
    const start = {
      ...(seg.properties_start || {}),
      x_grid: g0[0],
      y_grid: g0[1],
      tags: { ...(seg.properties_start?.tags || {}), x_grid: g0[0], y_grid: g0[1] },
    };
    const end = {
      ...(seg.properties_end || {}),
      x_grid: g1[0],
      y_grid: g1[1],
      tags: { ...(seg.properties_end?.tags || {}), x_grid: g1[0], y_grid: g1[1] },
    };
    for (const props of [start, end]) {
      if (!props) continue;
      const key = connectPointKey(props);
      if (!key) continue;
      const attrs = JSON.parse(JSON.stringify(props));
      if (!connectPointMap.has(key)) {
        connectPointMap.set(key, { ...attrs, route_list: [] });
      }
      const entry = connectPointMap.get(key);
      if (!entry.route_list.includes(routeName)) entry.route_list.push(routeName);
    }
  }
  const connectData = Array.from(connectPointMap.values());

  const stationMap = new Map();
  for (const seg of segments) {
    for (const node of seg.nodes || []) {
      const sid = normalize(node.station_id ?? node.tags?.station_id ?? '');
      const sname = normalize(
        node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? ''
      );
      if (!sid && !sname) continue;
      const key = sid || sname;
      if (!stationMap.has(key)) {
        stationMap.set(key, {
          station_id: sid,
          station_name: sname,
          node_type: node.node_type ?? '',
          connect_number: node.connect_number ?? node.tags?.connect_number ?? null,
          x_grid: node.x_grid ?? node.tags?.x_grid ?? null,
          y_grid: node.y_grid ?? node.tags?.y_grid ?? null,
          tags: node.tags ? JSON.parse(JSON.stringify(node.tags)) : {},
        });
      }
    }
  }
  if (raw.length > 0 && raw[0]?.segments && !raw[0]?.points) {
    for (const route of raw) {
      for (const node of route.nodes || []) {
        const sid = normalize(node.station_id ?? node.tags?.station_id ?? '');
        const sname = normalize(
          node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? ''
        );
        if (!sid && !sname) continue;
        const key = sid || sname;
        if (!stationMap.has(key)) {
          stationMap.set(key, {
            station_id: sid,
            station_name: sname,
            node_type: node.node_type ?? '',
            connect_number: node.connect_number ?? node.tags?.connect_number ?? null,
            x_grid: node.x_grid ?? node.tags?.x_grid ?? null,
            y_grid: node.y_grid ?? node.tags?.y_grid ?? null,
            tags: node.tags ? JSON.parse(JSON.stringify(node.tags)) : {},
          });
        }
      }
    }
  }
  const stationData = Array.from(stationMap.values());

  return { sectionData, connectData, stationData };
}
