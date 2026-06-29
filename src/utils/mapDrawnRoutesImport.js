import {
  ensureSegmentStationStrings,
  segmentNodeLon,
  segmentNodeLat,
  normalizeRouteSegmentEndpointType,
} from './geojsonRouteHelpers.js';

/**
 * 將 e 層「地圖路段匯出」JSON 陣列還原為 spaceNetworkGridJsonData 扁平 segments，
 * 並可再餵給 computeStationDataFromRoutes，使 taipei_f／taipei_g 讀檔後繪製與 taipei_e 一致。
 */

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

function pointKey(x, y) {
  return `${num(x)},${num(y)}`;
}

/** 三點是否共線且為水平或垂直（網格 HV 路徑） */
function axisAlignedCollinearTriple(a, b, c) {
  if (!a || !b || !c) return false;
  const ax = num(a[0]);
  const ay = num(a[1]);
  const bx = num(b[0]);
  const by = num(b[1]);
  const cx = num(c[0]);
  const cy = num(c[1]);
  const sameX = ax === bx && bx === cx;
  const sameY = ay === by && by === cy;
  return sameX || sameY;
}

/**
 * 中間頂點是否僅為幾何轉折（可刪）：非 connect，且無站名／站號。
 * 有 station 的 line 節點仍保留；g3→h3／匯出之中段黑點僅有 tags._forceDrawBlackDot 者亦不可刪。
 */
function nodeIsRemovableGeometricLine(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.node_type === 'connect') return false;
  if (node.tags?._forceDrawBlackDot) return false;
  const sid = node.station_id ?? node.tags?.station_id;
  const sname = node.station_name ?? node.tags?.station_name ?? node.tags?.name;
  if (sid || sname) return false;
  return node.node_type === 'line' || node.node_type == null;
}

/**
 * 讀入 network 後：直線段上僅存起迄（與必須保留的中間站），刪除共線的純幾何 line 頂點。
 * @returns {{ points: Array, nodes: Array, keptIndices: number[] }}
 */
export function simplifyCollinearBareLinePointsInSegment(points, nodes) {
  const n = Array.isArray(points) ? points.length : 0;
  if (n <= 2) {
    return {
      points,
      nodes,
      keptIndices: n > 0 ? points.map((_, i) => i) : [],
    };
  }
  if (!Array.isArray(nodes) || nodes.length !== n) {
    return {
      points,
      nodes,
      keptIndices: points.map((_, i) => i),
    };
  }
  const kept = [0];
  for (let i = 1; i < n - 1; i++) {
    const prev = points[kept[kept.length - 1]];
    const cur = points[i];
    const next = points[i + 1];
    if (nodeIsRemovableGeometricLine(nodes[i]) && axisAlignedCollinearTriple(prev, cur, next)) {
      continue;
    }
    kept.push(i);
  }
  kept.push(n - 1);
  const newPts = kept.map((j) => points[j]);
  const newNodes = kept.map((j) => nodes[j]);
  return { points: newPts, nodes: newNodes, keptIndices: kept };
}

/**
 * taipei_f／taipei_g：對 routes 內每個 segment 壓縮直線段上的多餘幾何點，並同步 original_points。
 */
export function simplifyTaipeiNetworkSegmentsInRoutes(routesData) {
  if (!Array.isArray(routesData)) return;
  for (const route of routesData) {
    for (const seg of route.segments || []) {
      const pts = seg.points;
      const nod = seg.nodes;
      const nOld = Array.isArray(pts) ? pts.length : 0;
      const { points, nodes, keptIndices } = simplifyCollinearBareLinePointsInSegment(pts, nod);
      if (keptIndices.length === nOld) continue;
      seg.points = points;
      seg.nodes = nodes;
      if (Array.isArray(seg.original_points) && seg.original_points.length === nOld) {
        seg.original_points = keptIndices.map((j) => seg.original_points[j]);
      }
    }
  }
}

/** 水平優先再垂直，逐步從 a 走到 b（不含 a，含 b） */
export function hvStepsHorizontalFirst(a, b) {
  const x0 = num(a[0]);
  const y0 = num(a[1]);
  const x1 = num(b[0]);
  const y1 = num(b[1]);
  const pts = [];
  let x = x0;
  let y = y0;
  const EPS = 1e-9;
  const MAX_STEPS = 2_000_000;

  const stepAxis = (cur, target, axisIsX) => {
    let c = cur;
    while (Math.abs(c - target) > EPS) {
      if (pts.length > MAX_STEPS) return null;
      const d = target - c;
      const step = Math.abs(d) >= 1 - EPS ? Math.sign(d) : d;
      c += step;
      if (axisIsX) {
        pts.push([c, y]);
      } else {
        pts.push([x, c]);
      }
    }
    return c;
  };

  const nx = stepAxis(x, x1, true);
  if (nx == null) return pts;
  x = nx;
  const ny = stepAxis(y, y1, false);
  if (ny == null) return pts;
  y = ny;
  return pts;
}

/**
 * routeCoordinates: [ start, bends[], end ] → 完整 HV 折線點列（含所有格步）
 */
export function expandHVChainFromRouteCoordinates(routeCoordinates) {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length !== 3) return [];
  const [pStart, bends, pEnd] = routeCoordinates;
  const vertices = [];
  if (pStart && Array.isArray(pStart) && pStart.length >= 2) {
    vertices.push([num(pStart[0]), num(pStart[1])]);
  }
  for (const b of bends || []) {
    if (b && Array.isArray(b) && b.length >= 2) {
      vertices.push([num(b[0]), num(b[1])]);
    }
  }
  if (pEnd && Array.isArray(pEnd) && pEnd.length >= 2) {
    vertices.push([num(pEnd[0]), num(pEnd[1])]);
  }
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return [[...vertices[0]]];
  const out = [[...vertices[0]]];
  for (let i = 1; i < vertices.length; i++) {
    const a = out[out.length - 1];
    const b = vertices[i];
    for (const s of hvStepsHorizontalFirst(a, b)) {
      const last = out[out.length - 1];
      if (s[0] !== last[0] || s[1] !== last[1]) out.push([s[0], s[1]]);
    }
  }
  return out;
}

/** 單一 [lon,lat] 或相容格式 */
function isLonLatPair(p) {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(Number(p[0])) &&
    Number.isFinite(Number(p[1]))
  );
}

/**
 * routeCoordinates: [ start, bends[], end ] → 僅串接頂點（經緯度折線，不做 HV 格點展開）
 * 另支援：頂層即折線頂點陣列 [[lon,lat], ...]（長度 ≥ 2），與程式匯出之三元組相容
 */
export function expandLonLatChainFromRouteCoordinates(routeCoordinates) {
  if (!Array.isArray(routeCoordinates)) return [];
  if (routeCoordinates.length >= 2 && routeCoordinates.every(isLonLatPair)) {
    const out = [];
    for (const p of routeCoordinates) {
      const nx = num(p[0]);
      const ny = num(p[1]);
      const last = out[out.length - 1];
      if (last && last[0] === nx && last[1] === ny) continue;
      out.push([nx, ny]);
    }
    return out.length >= 2 ? out : [];
  }
  if (routeCoordinates.length !== 3) return [];
  const [pStart, bends, pEnd] = routeCoordinates;
  const out = [];
  const pushPt = (p) => {
    if (!p || !Array.isArray(p) || p.length < 2) return;
    const nx = num(p[0]);
    const ny = num(p[1]);
    const last = out[out.length - 1];
    if (last && last[0] === nx && last[1] === ny) return;
    out.push([nx, ny]);
  };
  pushPt(pStart);
  for (const b of bends || []) pushPt(b);
  pushPt(pEnd);
  return out;
}

function endpointTypeMergeRank(tp) {
  const t = normalizeRouteSegmentEndpointType(tp);
  if (t === 'intersection') return 2;
  if (t === 'terminal') return 1;
  return 0;
}

function lonLatStationDedupKey(lo, la) {
  const x = num(lo);
  const y = num(la);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return `${x.toFixed(7)},${y.toFixed(7)}`;
}

/**
 * 由地圖路段匯出列還原 LineString FeatureCollection，並附與 MapTab 對齊之車站 Point（terminal 藍／intersection 紅／normal 黑）。
 *
 * @param {unknown[]} rows
 * @param {{ stationPoints?: 'all'|'endpoints', routeLine?: 'full'|'endpoints' }} [options] — json 繪製層：`endpoints` 僅繪製起迄直線與起迄站（不繪中段 stations）。
 * @returns {{ type: 'FeatureCollection', features: object[] }}
 */
export function minimalLineStringFeatureCollectionFromRouteExportRows(rows, options = {}) {
  const stationPointsMode = /** @type {'all'|'endpoints'} */ (
    options.stationPoints === 'endpoints' ? 'endpoints' : 'all'
  );
  const routeLineMode = /** @type {'full'|'endpoints'} */ (
    options.routeLine === 'endpoints' ? 'endpoints' : 'full'
  );

  if (!Array.isArray(rows)) return { type: 'FeatureCollection', features: [] };
  const features = [];
  /** @type {Map<string, { lon: number, lat: number, mergedType: string, meta: Record<string, unknown> }>} */
  const stationsByKey = new Map();

  const ingestStationNode = (node, fallbackType) => {
    if (!node || typeof node !== 'object') return;
    const lo = segmentNodeLon(node);
    const la = segmentNodeLat(node);
    const baseEk = lonLatStationDedupKey(lo, la);
    if (!baseEk) return;
    // 依「座標＋車站身分」分群：身分(station_id／station_name)不同的兩站即使座標重疊也**不合併**，
    // 避免別線剛好穿過某線終點時被併成交叉點（紅）而看似把路截斷；
    // 真正的轉乘站(同一 station_id)仍會合併成交會點。無身分(純幾何 connect)才僅依座標合併。
    const idPart = String(
      node.station_id ??
        node.tags?.station_id ??
        node.station_name ??
        node.tags?.station_name ??
        node.tags?.name ??
        ''
    ).trim();
    const ek = idPart ? `${baseEk}|${idPart}` : baseEk;

    const candT = normalizeRouteSegmentEndpointType(node.type ?? fallbackType ?? 'normal');
    const rn = Array.isArray(node.route_name_list)
      ? node.route_name_list.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];

    const prev = stationsByKey.get(ek);
    if (!prev) {
      stationsByKey.set(ek, {
        lon: lo,
        lat: la,
        mergedType: candT,
        meta: {
          station_id: node.station_id ?? node.tags?.station_id ?? '',
          station_name: node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? '',
          connect_number: node.connect_number,
          route_name_list: rn,
        },
      });
      return;
    }

    const rOld = endpointTypeMergeRank(prev.mergedType);
    const rNew = endpointTypeMergeRank(candT);
    if (rNew > rOld) {
      stationsByKey.set(ek, {
        lon: lo,
        lat: la,
        mergedType: candT,
        meta: {
          station_id: node.station_id ?? node.tags?.station_id ?? '',
          station_name: node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? '',
          connect_number: node.connect_number,
          route_name_list: rn,
        },
      });
      return;
    }

    if (rNew === rOld) {
      const acc = [...new Set([...(prev.meta.route_name_list || []), ...rn])];
      prev.meta.route_name_list = acc;
      if (
        prev.meta.connect_number == null &&
        node.connect_number != null &&
        node.connect_number !== ''
      ) {
        prev.meta.connect_number = node.connect_number;
      }
    }
  };

  rows.forEach((row, exportRowIndex) => {
    if (!row || typeof row !== 'object' || !Array.isArray(row.routeCoordinates)) return;
    const seg = row.segment && typeof row.segment === 'object' ? row.segment : null;
    let chain = expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
    if (!chain || chain.length < 2) return;

    if (routeLineMode === 'endpoints') {
      let a = chain[0];
      let b = chain[chain.length - 1];
      if (seg) {
        const lo0 = segmentNodeLon(seg.start);
        const la0 = segmentNodeLat(seg.start);
        const lo1 = segmentNodeLon(seg.end);
        const la1 = segmentNodeLat(seg.end);
        if (
          Number.isFinite(lo0) &&
          Number.isFinite(la0) &&
          Number.isFinite(lo1) &&
          Number.isFinite(la1)
        ) {
          a = [lo0, la0];
          b = [lo1, la1];
        }
      }
      chain = [a, b];
    }

    const lineCol =
      typeof row.color === 'string' && row.color.trim() !== '' ? row.color.trim() : '#666666';
    features.push({
      type: 'Feature',
      properties: {
        name: row.routeName ?? '',
        color: lineCol,
        route_id: row.route_id != null ? String(row.route_id) : '',
        /** 與 {@link mapDrawnExportRowsFromJsonDrawRoot} 傳入之 rows 索引一致，供 hover 對齊 segment */
        export_row_index: exportRowIndex,
      },
      geometry: { type: 'LineString', coordinates: chain },
    });
    if (seg) {
      ingestStationNode(seg.start, 'normal');
      if (stationPointsMode === 'all' && Array.isArray(seg.stations)) {
        for (const st of seg.stations) ingestStationNode(st, 'normal');
      }
      ingestStationNode(seg.end, 'normal');
    }
  });

  for (const { lon, lat, mergedType, meta } of stationsByKey.values()) {
    const ens = ensureSegmentStationStrings(
      {
        station_id: meta.station_id ?? '',
        station_name: meta.station_name ?? '',
      },
      lon,
      lat
    );
    const rn = Array.isArray(meta.route_name_list)
      ? [...new Set(meta.route_name_list.filter((s) => String(s).trim()))]
      : [];
    const cn =
      meta.connect_number != null && meta.connect_number !== '' ? meta.connect_number : undefined;
    features.push({
      type: 'Feature',
      properties: {
        type: mergedType,
        station_id: ens.station_id,
        station_name: ens.station_name,
        ...(cn !== undefined ? { connect_number: cn } : {}),
        ...(rn.length ? { route_name_list: rn } : {}),
        endpointFromRouteLonLatSegment: true,
        tags: {
          type: mergedType,
          station_id: ens.station_id,
          station_name: ens.station_name,
          ...(cn !== undefined ? { connect_number: cn } : {}),
          ...(rn.length ? { route_name_list: rn } : {}),
        },
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  }

  return { type: 'FeatureCollection', features };
}

function normalizeNodeStationStrings(o, px, py) {
  const ens = ensureSegmentStationStrings(
    {
      station_id: o.station_id ?? o.tags?.station_id ?? '',
      station_name: (o.station_name ?? o.tags?.station_name ?? o.tags?.name ?? '') || '',
    },
    px,
    py
  );
  o.station_id = ens.station_id;
  o.station_name = ens.station_name;
  if (!o.tags || typeof o.tags !== 'object') o.tags = {};
  o.tags.station_id = ens.station_id;
  o.tags.station_name = ens.station_name;
  if (o.tags.name == null || String(o.tags.name).trim() === '') {
    o.tags.name = ens.station_name;
  }
}

function cloneConnectNode(obj, px, py) {
  /** @type {Record<string, unknown>} */
  let o;
  if (!obj || typeof obj !== 'object') {
    o = { node_type: 'connect', x_grid: px, y_grid: py, tags: {} };
  } else {
    o = cloneJson(obj);
    o.node_type = 'connect';
    o.x_grid = px;
    o.y_grid = py;
    o.tags = o.tags && typeof o.tags === 'object' ? { ...o.tags } : {};
  }
  normalizeNodeStationStrings(o, px, py);
  return o;
}

/**
 * 與典型 e 層 segment 相同：nodes.length === points.length，每格一節點。
 */
const SEGMENT_EPS = 1e-6;

function pointLiesOnAxisAlignedSegment(a, b, sx, sy) {
  const ax = num(a[0]);
  const ay = num(a[1]);
  const bx = num(b[0]);
  const by = num(b[1]);
  const minx = Math.min(ax, bx);
  const maxx = Math.max(ax, bx);
  const miny = Math.min(ay, by);
  const maxy = Math.max(ay, by);
  if (Math.abs(ax - bx) <= SEGMENT_EPS) {
    return Math.abs(sx - ax) <= SEGMENT_EPS && sy >= miny - SEGMENT_EPS && sy <= maxy + SEGMENT_EPS;
  }
  if (Math.abs(ay - by) <= SEGMENT_EPS) {
    return Math.abs(sy - ay) <= SEGMENT_EPS && sx >= minx - SEGMENT_EPS && sx <= maxx + SEGMENT_EPS;
  }
  return false;
}

/** 由 a 走向 b 時，插入點在線段上的順序鍵（0…1） */
function parametricOrderOnSegment(a, b, sx, sy) {
  const ax = num(a[0]);
  const ay = num(a[1]);
  const bx = num(b[0]);
  const by = num(b[1]);
  if (Math.abs(ax - bx) <= SEGMENT_EPS) {
    const den = by - ay;
    return Math.abs(den) <= SEGMENT_EPS ? 0 : (sy - ay) / den;
  }
  const den = bx - ax;
  return Math.abs(den) <= SEGMENT_EPS ? 0 : (sx - ax) / den;
}

function sameGridPoint(p, q) {
  return (
    Math.abs(num(p[0]) - num(q[0])) <= SEGMENT_EPS && Math.abs(num(p[1]) - num(q[1])) <= SEGMENT_EPS
  );
}

/**
 * routeCoordinates 展開後僅含轉折頂點，segment.stations 之中間站（常為半格）可能不在頂點列上；
 * 若不插入，buildNodesAlignedToPoints 對不到站、會落成可刪幾何點而被 simplify 拿掉，與 j3 即時路網不一致。
 */
function insertMapDrawnStationsIntoPolyline(points, stations) {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    !Array.isArray(stations) ||
    stations.length === 0
  ) {
    return points;
  }
  /** @type {{ segIndex: number, t: number, pt: number[] }[]} */
  const inserts = [];
  for (const st of stations) {
    if (!st || typeof st !== 'object') continue;
    const sx = num(st.lon ?? st.x_grid ?? st.tags?.lon ?? st.tags?.x_grid);
    const sy = num(st.lat ?? st.y_grid ?? st.tags?.lat ?? st.tags?.y_grid);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (!pointLiesOnAxisAlignedSegment(a, b, sx, sy)) continue;
      const t = parametricOrderOnSegment(a, b, sx, sy);
      inserts.push({ segIndex: i, t, pt: [sx, sy] });
      break;
    }
  }
  if (inserts.length === 0) return points;
  inserts.sort((u, v) => (u.segIndex !== v.segIndex ? u.segIndex - v.segIndex : u.t - v.t));
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push([num(points[i][0]), num(points[i][1])]);
    const onSeg = inserts.filter((ins) => ins.segIndex === i).sort((a, b) => a.t - b.t);
    let prev = out[out.length - 1];
    for (const ins of onSeg) {
      if (sameGridPoint(prev, ins.pt)) continue;
      if (sameGridPoint(ins.pt, points[i + 1])) continue;
      out.push([ins.pt[0], ins.pt[1]]);
      prev = out[out.length - 1];
    }
  }
  const last = points[points.length - 1];
  out.push([num(last[0]), num(last[1])]);
  return out;
}

function buildNodesAlignedToPoints(points, startObj, endObj, stations) {
  const stationByKey = new Map();
  for (const s of stations || []) {
    if (!s || typeof s !== 'object') continue;
    const x = s.lon ?? s.x_grid ?? s.tags?.lon ?? s.tags?.x_grid;
    const y = s.lat ?? s.y_grid ?? s.tags?.lat ?? s.tags?.y_grid;
    if (x == null || y == null) continue;
    stationByKey.set(pointKey(x, y), s);
  }
  const n = points.length;
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const px = num(points[i][0]);
    const py = num(points[i][1]);
    const k = pointKey(px, py);
    if (i === 0) {
      nodes.push(cloneConnectNode(startObj, px, py));
    } else if (i === n - 1) {
      nodes.push(cloneConnectNode(endObj, px, py));
    } else if (stationByKey.has(k)) {
      const cloned = cloneJson(stationByKey.get(k));
      normalizeNodeStationStrings(cloned, px, py);
      nodes.push(cloned);
    } else {
      /** @type {Record<string, unknown>} */
      const bare = { node_type: 'line', x_grid: px, y_grid: py, tags: {} };
      normalizeNodeStationStrings(bare, px, py);
      nodes.push(bare);
    }
  }
  return nodes;
}

/**
 * @param {*} jsonData - 解析後的 JSON 根
 * @returns {boolean}
 */
export function isMapDrawnRoutesExportArray(jsonData) {
  if (!Array.isArray(jsonData) || jsonData.length === 0) return false;
  return jsonData.every(
    (row) =>
      row &&
      typeof row === 'object' &&
      typeof row.routeName === 'string' &&
      row.segment &&
      typeof row.segment === 'object' &&
      row.segment.start != null &&
      row.segment.end != null &&
      Array.isArray(row.routeCoordinates) &&
      row.routeCoordinates.length === 3
  );
}

/** json 繪製 `dataJson` 封裝（均勻網格結果一併保存）時之 `kind` */
export const JSON_DRAW_DATAJSON_WITH_UNIFORM_GRID_KIND = 'json_draw_with_layout_uniform_grid';

/**
 * 自 json 繪製層 root 取出路段匯出陣列：`jsonData`／`dataJson` 為陣列時直接用；為封裝時取 `routes`。
 * @param {*} jsonData
 * @param {*} dataJson
 * @returns {unknown[] | null}
 */
export function mapDrawnExportRowsFromJsonDrawRoot(jsonData, dataJson) {
  const routesFrom = (root) => {
    if (!root) return null;
    if (Array.isArray(root)) return root;
    if (typeof root === 'object' && Array.isArray(root.routes)) return root.routes;
    return null;
  };
  return routesFrom(jsonData) ?? routesFrom(dataJson);
}

/** 匯出列對齊鍵：路線名 + 起迄站號（供管線覆寫 json 時保留 segment.stations） */
export function exportRowStationEndpointsKey(row) {
  if (!row || typeof row !== 'object') return '';
  const s = row.segment?.start;
  const e = row.segment?.end;
  if (!s || !e) return '';
  const sid = String(s.station_id ?? '').trim();
  const eid = String(e.station_id ?? '').trim();
  const rn = String(row.routeName ?? '').trim();
  return `${rn}\0${sid}\0${eid}`;
}

/** 僅起迄站號（同一路段在不同圖層可能 routeName 略有差異，仍能對回中段站） */
export function exportRowEndpointsKeyWithoutRoute(row) {
  if (!row || typeof row !== 'object') return '';
  const s = row.segment?.start;
  const e = row.segment?.end;
  if (!s || !e) return '';
  const sid = String(s.station_id ?? '').trim();
  const eid = String(e.station_id ?? '').trim();
  if (!sid || !eid) return '';
  return `${sid}\0${eid}`;
}

function exportRowEndpointsKeyReversed(epKey) {
  if (!epKey) return '';
  const parts = epKey.split('\0');
  if (parts.length !== 2) return '';
  return `${parts[1]}\0${parts[0]}`;
}

function exportRowMidStationCount(row) {
  const st = row?.segment?.stations;
  return Array.isArray(st) ? st.length : 0;
}

function pickRicherExportRowForStationMerge(prev, cur) {
  const np = exportRowMidStationCount(prev);
  const nc = exportRowMidStationCount(cur);
  if (nc > np) return cur;
  if (np > nc) return prev;
  return prev ?? cur;
}

/**
 * hover／顯示用：自候選匯出列中找同起迄（路線名+起迄相符，或僅起迄站號相同／反向）且 `segment.stations` 最長者；
 * 若候選比本列更豐富則深拷貝 stations（含本列為空、或管線只留較短列表之情況）。
 */
export function enrichExportRowStationsFromPool(row, pool) {
  if (!row || typeof row !== 'object' || !Array.isArray(pool) || pool.length === 0) return row;
  const curLen = exportRowMidStationCount(row);
  const fullKey = exportRowStationEndpointsKey(row);
  const ep = exportRowEndpointsKeyWithoutRoute(row);
  const rev = exportRowEndpointsKeyReversed(ep);
  let best = null;
  let bestN = 0;
  for (const r of pool) {
    if (!r || typeof r !== 'object') continue;
    const kf = exportRowStationEndpointsKey(r);
    const ke = exportRowEndpointsKeyWithoutRoute(r);
    const match =
      (fullKey && kf === fullKey) ||
      (!!ep && (ke === ep || (!!rev && ke === rev)));
    if (!match) continue;
    const n = exportRowMidStationCount(r);
    if (n > bestN) {
      bestN = n;
      best = r;
    }
  }
  if (!best || bestN <= curLen) return row;
  const out = JSON.parse(JSON.stringify(row));
  if (!out.segment || typeof out.segment !== 'object') out.segment = {};
  out.segment.stations = JSON.parse(JSON.stringify(best.segment.stations));
  return out;
}

/**
 * 正規化管線寫回 jsonData 時，flatSegments 轉匯出列常會得到 `stations: []`；
 * 若上一版記憶體中同起迄之路段仍有中段站，則深拷貝合併回來（不刪使用者／OSM 中段資料）。
 *
 * @param {unknown[]} newRows
 * @param {unknown[]|null|undefined} priorRows
 */
export function mergeSegmentStationsFromPriorExportRows(newRows, priorRows) {
  if (!Array.isArray(newRows) || newRows.length === 0) return newRows;
  if (!Array.isArray(priorRows) || priorRows.length === 0) return newRows;
  const mapOldFull = new Map();
  const mapOldEp = new Map();
  for (const r of priorRows) {
    const kf = exportRowStationEndpointsKey(r);
    if (kf) {
      mapOldFull.set(kf, pickRicherExportRowForStationMerge(mapOldFull.get(kf), r));
    }
    const ke = exportRowEndpointsKeyWithoutRoute(r);
    if (ke) {
      mapOldEp.set(ke, pickRicherExportRowForStationMerge(mapOldEp.get(ke), r));
    }
  }
  for (const row of newRows) {
    if (!row || typeof row !== 'object' || !row.segment || typeof row.segment !== 'object')
      continue;
    const curLen = Array.isArray(row.segment.stations) ? row.segment.stations.length : 0;
    const oldFromFull = mapOldFull.get(exportRowStationEndpointsKey(row));
    const ep = exportRowEndpointsKeyWithoutRoute(row);
    const rev = exportRowEndpointsKeyReversed(ep);
    const oldFromEp = pickRicherExportRowForStationMerge(
      ep ? mapOldEp.get(ep) : null,
      rev ? mapOldEp.get(rev) : null,
    );
    const old = pickRicherExportRowForStationMerge(oldFromFull, oldFromEp);
    const oldSt = old?.segment?.stations;
    const oldLen = Array.isArray(oldSt) ? oldSt.length : 0;
    if (oldLen > curLen) {
      row.segment.stations = JSON.parse(JSON.stringify(oldSt));
    }
  }
  return newRows;
}

/**
 * 將均勻網格產物寫入 `dataJson`：含 routes 快照與格線／meta（與圖層欄位一致供持久化）。
 * @param {unknown[]} rows
 * @param {unknown|null} layoutUniformGridGeoJson
 * @param {unknown|null} layoutUniformGridMeta
 */
export function wrapJsonDrawDataJsonWithUniformGrid(
  rows,
  layoutUniformGridGeoJson,
  layoutUniformGridMeta
) {
  return {
    kind: JSON_DRAW_DATAJSON_WITH_UNIFORM_GRID_KIND,
    routes: JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : [])),
    layoutUniformGridGeoJson: layoutUniformGridGeoJson ?? null,
    layoutUniformGridMeta: layoutUniformGridMeta ?? null,
  };
}

/**
 * 手繪圖層 JSON 匯入：含既有 [起點, bends, 迄點] 三元組，或頂層為 [[lon,lat],…] 之折線（≥2 點）
 */
function rowIsClassicMapDrawnExport(row) {
  return (
    row &&
    typeof row === 'object' &&
    typeof row.routeName === 'string' &&
    row.segment &&
    typeof row.segment === 'object' &&
    row.segment.start != null &&
    row.segment.end != null &&
    Array.isArray(row.routeCoordinates) &&
    row.routeCoordinates.length === 3
  );
}

function rowIsLonLatPolylineMapDrawnExport(row) {
  return (
    row &&
    typeof row === 'object' &&
    typeof row.routeName === 'string' &&
    row.segment &&
    typeof row.segment === 'object' &&
    row.segment.start != null &&
    row.segment.end != null &&
    Array.isArray(row.routeCoordinates) &&
    row.routeCoordinates.length >= 2 &&
    row.routeCoordinates.every(isLonLatPair)
  );
}

/** @param {*} jsonData - 解析後 JSON 根 */
export function isNetworkDrawSketchRoutesExportJsonArray(jsonData) {
  if (!Array.isArray(jsonData) || jsonData.length === 0) return false;
  return jsonData.every(
    (row) => rowIsClassicMapDrawnExport(row) || rowIsLonLatPolylineMapDrawnExport(row)
  );
}

/**
 * @param {Array} rows - isMapDrawnRoutesExportArray 為 true 時的陣列
 * @returns {Array<Object>} 扁平 segments（points、nodes、properties_start/end、route_name）
 */
export function mapDrawnExportRowsToFlatSegments(rows) {
  const out = [];
  for (const row of rows || []) {
    const routeName = row.routeName || 'Unknown';
    const seg = row.segment || {};
    let points = expandHVChainFromRouteCoordinates(row.routeCoordinates);
    if (points.length < 2) continue;

    const startObj = cloneJson(seg.start);
    const endObj = cloneJson(seg.end);
    const stations = Array.isArray(seg.stations) ? seg.stations : [];

    points = insertMapDrawnStationsIntoPolyline(points, stations);
    const nodes = buildNodesAlignedToPoints(points, startObj, endObj, stations);
    const { points: sp, nodes: sn } = simplifyCollinearBareLinePointsInSegment(points, nodes);
    const properties_start = cloneJson(startObj);
    const properties_end = cloneJson(endObj);

    const rowColor =
      typeof row.color === 'string' && row.color.trim() !== '' ? row.color.trim() : '';
    const color =
      rowColor ||
      startObj?.tags?.color ||
      endObj?.tags?.color ||
      stations[0]?.tags?.color ||
      '#666666';

    out.push({
      points: sp,
      nodes: sn,
      properties_start,
      properties_end,
      route_name: routeName,
      name: routeName,
      way_properties: {
        type: 'way',
        tags: {
          route_name: routeName,
          color,
        },
      },
    });
  }
  return out;
}

/**
 * 手繪圖層匯入：與 {@link mapDrawnExportRowsToFlatSegmentsLonLat} 相同幾何篩選，另回傳每條折線對應之原始匯出列（供 hover 顯示屬性）。
 * @param {Array} rows - isNetworkDrawSketchRoutesExportJsonArray 為 true 時的陣列
 * @returns {{ polylines: Array<Array<{ x: number, y: number }>>, routeExportRows: Array<object> }}
 */
export function mapDrawnExportRowsToLonLatPolylinesWithMeta(rows) {
  const polylines = [];
  const routeExportRows = [];
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    const points = expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
    if (!Array.isArray(points) || points.length < 2) continue;
    const pl = [];
    for (const p of points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const nx = Number(p[0]);
      const ny = Number(p[1]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
      const last = pl[pl.length - 1];
      if (last && last.x === nx && last.y === ny) continue;
      pl.push({ x: nx, y: ny });
    }
    if (pl.length < 2) continue;
    polylines.push(pl);
    routeExportRows.push(cloneJson(row));
  }
  return { polylines, routeExportRows };
}

/**
 * 與 mapDrawnExportRowsToFlatSegments 相同輸出結構，但座標為經緯度時以頂點折線連接（供 GeoJSON 轉路段）
 * @param {Array} rows - exportRouteSegmentsFromGeoJson 或 Python 匯出之陣列
 * @returns {Array<Object>}
 */
export function mapDrawnExportRowsToFlatSegmentsLonLat(rows) {
  const out = [];
  for (const row of rows || []) {
    const routeName = row.routeName || 'Unknown';
    const seg = row.segment || {};
    const points = expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
    if (points.length < 2) continue;

    const startObj = cloneJson(seg.start);
    const endObj = cloneJson(seg.end);
    const stations = Array.isArray(seg.stations) ? seg.stations : [];

    const nodes = buildNodesAlignedToPoints(points, startObj, endObj, stations);
    for (let i = 1; i < nodes.length - 1; i++) {
      const n = nodes[i];
      if (n?.node_type !== 'connect' && (n.station_id != null || n.tags?.station_id)) {
        n.node_type = 'line';
      }
    }

    const properties_start = cloneJson(startObj);
    const properties_end = cloneJson(endObj);

    const rowColor =
      typeof row.color === 'string' && row.color.trim() !== '' ? row.color.trim() : '';
    const color =
      rowColor ||
      startObj?.tags?.color ||
      startObj?.color ||
      endObj?.tags?.color ||
      endObj?.color ||
      stations[0]?.tags?.color ||
      stations[0]?.color ||
      '#666666';

    const routeColors = typeof row.route_colors === 'string' && row.route_colors ? row.route_colors : '';
    out.push({
      points,
      nodes,
      properties_start,
      properties_end,
      route_name: routeName,
      name: routeName,
      way_properties: {
        type: 'way',
        tags: {
          route_name: routeName,
          color,
          ...(routeColors ? { route_colors: routeColors } : {}),
        },
      },
    });
  }
  return out;
}
