/**
 * taipei_g3 → taipei_h3：依 taipei_a3 路段匯出列（space-network-grid-json-data／processedJsonData）
 * 將每段「中段站」（segment.stations）插入 g3 該段折線：紅／藍端點與既有折線頂點座標不變，
 * 僅在兩端 connect 間依弧長平均插入黑點（line 節點）；黑點座標不四捨五入，保留插值精度。
 */

import { isMapDrawnRoutesExportArray } from '@/utils/mapDrawnRoutesImport.js';
import { splitFlatH3SegmentsAtBlackVerticesOnly } from '@/utils/taipeiDataProcTest3/h3ToI3SplitAtBlackVertices.js';

function num(v) {
  return Number(v ?? 0);
}

function dist2(a, b) {
  const dx = num(a[0]) - num(b[0]);
  const dy = num(a[1]) - num(b[1]);
  return Math.sqrt(dx * dx + dy * dy);
}

function cumulativeLengths(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + dist2(pts[i - 1], pts[i]));
  }
  return cum;
}

function cloneJson(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function copyPt(p) {
  return [num(p[0]), num(p[1])];
}

/**
 * 供 SpaceNetworkGridTab 識別為「應畫出的黑點」（即使無站名）
 * @see SpaceNetworkGridTab isRealStation（nodes／points 分支）
 */
function lineNodeFromA3Station(st, coord) {
  const sid = st?.station_id ?? st?.tags?.station_id ?? '';
  const sname = st?.station_name ?? st?.tags?.station_name ?? st?.tags?.name ?? '';
  return {
    node_type: 'line',
    display: true,
    x_grid: coord[0],
    y_grid: coord[1],
    station_id: sid,
    station_name: sname,
    tags: {
      ...(st?.tags && typeof st.tags === 'object' ? cloneJson(st.tags) : {}),
      _forceDrawBlackDot: true,
    },
  };
}

/** 線段上最近點之參數 t∈[0,1]（歐氏投影） */
function closestParamOnSegment(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-18) return 0;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  return Math.max(0, Math.min(1, t));
}

/**
 * 站點 (px,py) 在折線上的累積弧長；若離折線過遠回傳 null（改走均分後援）。
 * maxDistSq 預設約 1px²，格點站與正交折線應遠小於此。
 */
function arcDistanceAlongPolylineForPoint(pts, cum, px, py, maxDistSq = 1) {
  let bestD = Infinity;
  let bestS = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = num(pts[i][0]);
    const ay = num(pts[i][1]);
    const bx = num(pts[i + 1][0]);
    const by = num(pts[i + 1][1]);
    const t = closestParamOnSegment(ax, ay, bx, by, px, py);
    const nx = ax + t * (bx - ax);
    const ny = ay + t * (by - ay);
    const ddx = px - nx;
    const ddy = py - ny;
    const d = ddx * ddx + ddy * ddy;
    const s = cum[i] + t * (cum[i + 1] - cum[i]);
    if (d < bestD) {
      bestD = d;
      bestS = s;
    }
  }
  if (!Number.isFinite(bestD) || bestD > maxDistSq) return null;
  return bestS;
}

/**
 * 中段站依 x_grid/y_grid 投影到折線弧長後排序；無法全部投影時退回 (j/(k+1))*L 均分（舊行為）。
 */
function buildInsertionTargetsFromStations(pts, cum, stations) {
  const k = Array.isArray(stations) ? stations.length : 0;
  const L = cum[cum.length - 1];
  if (k === 0 || L <= 0) return [];

  const entries = [];
  let missing = false;
  for (let j = 0; j < k; j++) {
    const st = stations[j];
    const sx = num(st?.x_grid ?? st?.tags?.x_grid);
    const sy = num(st?.y_grid ?? st?.tags?.y_grid);
    const s = arcDistanceAlongPolylineForPoint(pts, cum, sx, sy);
    if (s == null) {
      missing = true;
      break;
    }
    entries.push({ dist: s, st, j });
  }
  if (!missing && entries.length === k) {
    entries.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.j - b.j));
    return entries.map(({ dist, st }) => ({ dist, st }));
  }

  const targets = [];
  for (let jj = 1; jj <= k; jj++) {
    targets.push({ dist: (jj / (k + 1)) * L, st: stations[jj - 1] });
  }
  return targets;
}

/** 合併頂點若已為零權重合併隱藏，不可被 a3 站名覆寫成 display:true（否則主圖又畫出黑點） */
function isMergedHiddenVertex(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.display === false) return true;
  const t = node.tags;
  return !!(t && typeof t === 'object' && t._mergedHiddenBlackDot);
}

function applyStationOntoVertex(prevNode, st, prevPt) {
  if (isMergedHiddenVertex(prevNode)) {
    return cloneJson(prevNode);
  }
  const stNode = lineNodeFromA3Station(st, prevPt);
  return {
    ...prevNode,
    ...stNode,
    x_grid: prevPt[0],
    y_grid: prevPt[1],
  };
}

function isVisibleBlackStation(station) {
  if (!station || typeof station !== 'object') return false;
  return station.display !== false && station?.tags?.display !== false;
}

function extractPoints(seg) {
  const pts = seg.points || [];
  return pts.map((p) => {
    const x = Array.isArray(p) ? p[0] : p?.x;
    const y = Array.isArray(p) ? p[1] : p?.y;
    return [num(x), num(y)];
  });
}

function pointKey(x, y) {
  return `${Math.round(num(x) * 1e6) / 1e6},${Math.round(num(y) * 1e6) / 1e6}`;
}

function isConnectLikeNode(node, pointProps) {
  const tags = {
    ...(pointProps?.tags && typeof pointProps.tags === 'object' ? pointProps.tags : {}),
    ...(node?.tags && typeof node?.tags === 'object' ? node.tags : {}),
  };
  const connectNumber =
    node?.connect_number ??
    pointProps?.connect_number ??
    tags.connect_number ??
    tags?.properties?.connect_number;
  const nodeType = String(node?.node_type ?? pointProps?.node_type ?? tags.node_type ?? '').trim();
  return nodeType === 'connect' || (connectNumber != null && String(connectNumber).trim() !== '');
}

function buildConnectGridKeysFromFlatSegments(flatSegments) {
  const keys = new Set();
  for (const seg of flatSegments || []) {
    const pts = seg?.points || [];
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const pointProps =
        Array.isArray(p) && p.length > 2 && p[2] && typeof p[2] === 'object' ? p[2] : null;
      const node = nodes[i];
      if (!isConnectLikeNode(node, pointProps)) continue;
      const x = Array.isArray(p) ? p[0] : p?.x;
      const y = Array.isArray(p) ? p[1] : p?.y;
      if (x == null || y == null) continue;
      keys.add(pointKey(x, y));
    }
  }
  return keys;
}

function mergeSegmentsToConnectSpans(flatSegments) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return [];

  const connectGridKeys = buildConnectGridKeysFromFlatSegments(flatSegments);
  if (connectGridKeys.size === 0) return cloneJson(flatSegments);

  const byRoute = new Map();
  const routeOrder = [];
  for (const seg of flatSegments) {
    const routeName = seg?.route_name ?? seg?.name ?? 'Unknown';
    if (!byRoute.has(routeName)) {
      byRoute.set(routeName, []);
      routeOrder.push(routeName);
    }
    byRoute.get(routeName).push(seg);
  }

  const result = [];
  for (const routeName of routeOrder) {
    const segs = byRoute.get(routeName) || [];
    const byStart = new Map();
    const byEnd = new Map();
    for (const seg of segs) {
      const pts = extractPoints(seg);
      if (pts.length < 2) continue;
      byStart.set(pointKey(pts[0][0], pts[0][1]), seg);
      byEnd.set(pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]), seg);
    }

    const visited = new Set();
    for (const seg of segs) {
      const pts = extractPoints(seg);
      if (pts.length < 2 || visited.has(seg)) continue;

      const startKey = pointKey(pts[0][0], pts[0][1]);
      const prevSeg = byEnd.get(startKey);
      if (prevSeg && !visited.has(prevSeg) && !connectGridKeys.has(startKey)) continue;

      const chain = [];
      let cur = seg;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        chain.push(cur);
        const curPts = extractPoints(cur);
        const endKey = pointKey(curPts[curPts.length - 1][0], curPts[curPts.length - 1][1]);
        if (connectGridKeys.has(endKey)) break;
        const next = byStart.get(endKey);
        if (!next || visited.has(next)) break;
        cur = next;
      }

      if (chain.length === 1) {
        result.push(cloneJson(chain[0]));
        continue;
      }

      const first = chain[0];
      const last = chain[chain.length - 1];
      const allHaveNodes = chain.every(
        (item) => Array.isArray(item?.nodes) && item.nodes.length === (item.points || []).length
      );
      const mergedPoints = [...(first.points || []).map((p) => cloneJson(p))];
      const mergedNodes = allHaveNodes ? [...(first.nodes || []).map((n) => cloneJson(n))] : null;

      for (let i = 1; i < chain.length; i++) {
        const segPoints = (chain[i].points || []).slice(1).map((p) => cloneJson(p));
        mergedPoints.push(...segPoints);
        if (mergedNodes && Array.isArray(chain[i].nodes)) {
          mergedNodes.push(...chain[i].nodes.slice(1).map((n) => cloneJson(n)));
        }
      }

      const merged = {
        ...cloneJson(first),
        points: mergedPoints,
        properties_end: cloneJson(last.properties_end),
        station_weights: [],
      };
      if (mergedNodes && mergedNodes.length === mergedPoints.length) merged.nodes = mergedNodes;
      else delete merged.nodes;
      result.push(merged);
    }

    for (const seg of segs) {
      if (!visited.has(seg)) result.push(cloneJson(seg));
    }
  }

  return result;
}

/**
 * 在保留原 polyline 頂點與端點座標前提下，沿路徑弧長插入 k 個黑點。
 * @param {number[][]} pts
 * @param {object[]} nodes 與 pts 等長
 * @param {object[]} stations a3 segment.stations（長度 k；可為佔位物件，僅用於產生 _forceDrawBlackDot 節點）
 * @returns {{ points: number[][], nodes: object[] } | null}
 */
export function mergeBlackStationsAlongPolyline(pts, nodes, stations) {
  const k = Array.isArray(stations) ? stations.length : 0;
  if (k === 0) {
    return {
      points: pts.map(copyPt),
      nodes: nodes.map((n) => cloneJson(n)),
    };
  }
  if (pts.length < 2 || !Array.isArray(nodes) || nodes.length !== pts.length) return null;

  const cum = cumulativeLengths(pts);
  const L = cum[cum.length - 1];
  if (L <= 0) return null;

  const targets = buildInsertionTargetsFromStations(pts, cum, stations);

  const outPts = [];
  const outNodes = [];
  outPts.push(copyPt(pts[0]));
  outNodes.push(cloneJson(nodes[0]));

  let ti = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = cum[i];
    const b = cum[i + 1];
    const segLen = b - a;

    while (ti < targets.length && targets[ti].dist < b - 1e-12) {
      const D = targets[ti].dist;
      if (D <= a + 1e-12) {
        // 站點弧長恰好落在上一頂點（已在上輪末尾推入）；將站名補入該頂點 node
        if (outNodes.length > 0) {
          const prevNode = outNodes[outNodes.length - 1];
          const prevPt = outPts[outPts.length - 1];
          outNodes[outNodes.length - 1] = applyStationOntoVertex(
            prevNode,
            targets[ti].st,
            prevPt
          );
        }
        ti++;
        continue;
      }
      const local = D - a;
      const u = segLen > 1e-12 ? local / segLen : 0;
      const x = num(pts[i][0]) + u * (num(pts[i + 1][0]) - num(pts[i][0]));
      const y = num(pts[i][1]) + u * (num(pts[i + 1][1]) - num(pts[i][1]));
      const coord = [x, y];
      outPts.push(coord);
      outNodes.push(lineNodeFromA3Station(targets[ti].st, coord));
      ti++;
    }

    if (i < pts.length - 2) {
      const vertexPt = copyPt(pts[i + 1]);
      // 站點弧長恰好落在下一個轉折頂點：用站名取代空 node
      if (ti < targets.length && Math.abs(targets[ti].dist - b) <= 1e-9) {
        outPts.push(vertexPt);
        const baseN = nodes[i + 1];
        if (isMergedHiddenVertex(baseN)) {
          outNodes.push(cloneJson(baseN));
        } else {
          outNodes.push(lineNodeFromA3Station(targets[ti].st, vertexPt));
        }
        ti++;
      } else {
        outPts.push(vertexPt);
        outNodes.push(cloneJson(nodes[i + 1]));
      }
    }
  }

  const last = pts.length - 1;
  // 最後端點：若仍有未處理站點（弧長在最後線段末尾），補名入終點
  if (ti < targets.length) {
    const lastPt = copyPt(pts[last]);
    const lastNode = nodes[last];
    if (isMergedHiddenVertex(lastNode)) {
      outPts.push(lastPt);
      outNodes.push(cloneJson(lastNode));
      ti += 1;
    } else {
      const stNode = lineNodeFromA3Station(targets[ti].st, lastPt);
      outPts.push(lastPt);
      outNodes.push({ ...cloneJson(lastNode), ...stNode, x_grid: lastPt[0], y_grid: lastPt[1] });
      ti += 1;
    }
  } else {
    outPts.push(copyPt(pts[last]));
    outNodes.push(cloneJson(nodes[last]));
  }

  return { points: outPts, nodes: outNodes };
}

/**
 * @param {object} seg - g3 flat segment（會就地修改）
 * @param {object} row - a3 匯出列
 * @returns {boolean} 是否處理（k=0 視為已處理）
 */
/**
 * mergeBlackStationsAlongPolyline 需 nodes 與 points 逐點對齊；正交化後可能不等長，在此補齊／截斷。
 */
export function ensureNodesMatchPointCount(seg) {
  const pts = extractPoints(seg);
  let nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
  if (pts.length < 2) return false;
  if (nodes.length === pts.length) return true;

  if (nodes.length > pts.length) {
    seg.nodes = nodes.slice(0, pts.length).map((n) => cloneJson(n));
    return true;
  }

  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) {
      out.push(nodes[0] ? cloneJson(nodes[0]) : { node_type: 'line' });
    } else if (i === pts.length - 1) {
      const nl = nodes.length > 0 ? nodes[nodes.length - 1] : null;
      out.push(nl ? cloneJson(nl) : { node_type: 'line' });
    } else if (nodes[i]) {
      out.push(cloneJson(nodes[i]));
    } else {
      out.push({ node_type: 'line' });
    }
  }
  seg.nodes = out;
  return true;
}

function applyRowToSegment(seg, row) {
  const stations = Array.isArray(row?.segment?.stations)
    ? row.segment.stations.filter(isVisibleBlackStation)
    : [];
  const k = Array.isArray(stations) ? stations.length : 0;
  if (k === 0) return true;

  if (!ensureNodesMatchPointCount(seg)) return false;
  const pts = extractPoints(seg);
  const nodes = seg.nodes || [];
  if (pts.length < 2 || nodes.length !== pts.length) return false;

  const merged = mergeBlackStationsAlongPolyline(pts, nodes, stations);
  if (!merged) return false;
  seg.points = merged.points;
  seg.nodes = merged.nodes;
  return true;
}

function groupRowsByRoute(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const r = row.routeName || 'Unknown';
    if (!m.has(r)) m.set(r, []);
    m.get(r).push(row);
  }
  return m;
}

/** 與 g3／h3 折線端點比對用（度／格座標皆可能；略放寬以容 float 誤差） */
const COORD_MATCH_EPS = 1e-2;

function normId(id) {
  return String(id ?? '').trim();
}

function polylineLength(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += dist2(pts[i - 1], pts[i]);
  }
  return L;
}

/**
 * 與 flatSegmentsToGeojsonStyleExportRows 之 endpointExportShape 一致：站號取自 node 與 properties_* 合併，
 * 幾何端點永遠用折線首尾（不依賴 nodes 與 points 等長）。供 a3↔g3/h3 配對（a3 為經緯度、h3 為格點時僅站號可比）。
 */
function endpointStationIdFromNodeAndProps(node, props) {
  const n = node && typeof node === 'object' ? node : {};
  const p = props && typeof props === 'object' ? props : {};
  const tags = { ...(p.tags || {}), ...(n.tags || {}) };
  const m = { ...p, ...n, tags };
  return normId(m.station_id ?? tags.station_id);
}

function segEndpointMeta(seg) {
  const pts = extractPoints(seg);
  const nodes = seg.nodes || [];
  if (pts.length < 2) return null;
  const ps = seg.properties_start || {};
  const pe = seg.properties_end || {};
  const n0 = nodes[0] && typeof nodes[0] === 'object' ? nodes[0] : {};
  const nLast =
    nodes.length === pts.length && nodes.length > 0
      ? nodes[nodes.length - 1]
      : nodes.length > 0
        ? nodes[nodes.length - 1]
        : {};
  return {
    p0: pts[0],
    p1: pts[pts.length - 1],
    sid0: endpointStationIdFromNodeAndProps(n0, ps),
    sid1: endpointStationIdFromNodeAndProps(nLast, pe),
  };
}

function coordsClose(ax, ay, bx, by, eps) {
  return Math.abs(ax - bx) <= eps && Math.abs(ay - by) <= eps;
}

/**
 * a3 匯出列與 g3 單段折線是否為同一起迄（站號優先，否則座標；支援起迄對調）
 * @param {object} row - MapDrawn 匯出列
 * @param {object} seg - flat segment
 */
export function rowEndpointsMatchSeg(row, seg, eps = COORD_MATCH_EPS) {
  const rs = row?.segment?.start;
  const re = row?.segment?.end;
  const se = segEndpointMeta(seg);
  if (!rs || !re || !se) return false;
  const rx0 = num(rs.x_grid);
  const ry0 = num(rs.y_grid);
  const rx1 = num(re.x_grid);
  const ry1 = num(re.y_grid);

  const id0 = normId(rs.station_id);
  const id1 = normId(re.station_id);
  const idFwd = id0 && id1 && se.sid0 && se.sid1 && id0 === se.sid0 && id1 === se.sid1;
  const idBack = id0 && id1 && se.sid0 && se.sid1 && id0 === se.sid1 && id1 === se.sid0;

  const cFwd =
    coordsClose(rx0, ry0, se.p0[0], se.p0[1], eps) &&
    coordsClose(rx1, ry1, se.p1[0], se.p1[1], eps);
  const cBack =
    coordsClose(rx0, ry0, se.p1[0], se.p1[1], eps) &&
    coordsClose(rx1, ry1, se.p0[0], se.p0[1], eps);

  return idFwd || idBack || cFwd || cBack;
}

function rowStartMatchesSegStart(row, se, eps = COORD_MATCH_EPS) {
  const rs = row?.segment?.start;
  if (!rs || !se) return false;
  const id0 = normId(rs.station_id);
  if (id0 && se.sid0 && id0 === se.sid0) return true;
  return coordsClose(num(rs.x_grid), num(rs.y_grid), se.p0[0], se.p0[1], eps);
}

function rowEndMatchesSegEnd(row, se, eps = COORD_MATCH_EPS) {
  const re = row?.segment?.end;
  if (!re || !se) return false;
  const id1 = normId(re.station_id);
  if (id1 && se.sid1 && id1 === se.sid1) return true;
  return coordsClose(num(re.x_grid), num(re.y_grid), se.p1[0], se.p1[1], eps);
}

/**
 * 供 Control 分頁：h3 單段對應哪一筆 a3 匯出列。
 * 1) 起迄與該段完全一致（含對調）
 * 2) 後援：g3 切段後「前段／後段」僅一端為 connect、另一端為純轉折 —— 以同路線＋起點或終點對齊 a3 列（多筆時以「列終點／列起點距本段另一端」最近者）
 */
export function findBestA3RowForSegment(seg, allA3Rows) {
  if (!Array.isArray(allA3Rows) || allA3Rows.length === 0) return null;
  const routeName = seg.route_name ?? seg.name ?? 'Unknown';
  const rowsForRoute = allA3Rows.filter((r) => (r.routeName || 'Unknown') === routeName);
  if (rowsForRoute.length === 0) return null;

  const exact = rowsForRoute.filter((row) => rowEndpointsMatchSeg(row, seg));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    exact.sort((a, b) => {
      const ma = (a.segment?.stations || []).length;
      const mb = (b.segment?.stations || []).length;
      return mb - ma;
    });
    return exact[0];
  }

  const se = segEndpointMeta(seg);
  if (!se) return null;

  const byStart = rowsForRoute.filter((row) => rowStartMatchesSegStart(row, se));
  if (byStart.length === 1) return byStart[0];
  if (byStart.length > 1) {
    let best = byStart[0];
    let bestD = Infinity;
    for (const row of byStart) {
      const re = row.segment?.end;
      if (!re) continue;
      const dx = num(re.x_grid) - se.p1[0];
      const dy = num(re.y_grid) - se.p1[1];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = row;
      }
    }
    return best;
  }

  const byEnd = rowsForRoute.filter((row) => rowEndMatchesSegEnd(row, se));
  if (byEnd.length === 1) return byEnd[0];
  if (byEnd.length > 1) {
    let best = byEnd[0];
    let bestD = Infinity;
    for (const row of byEnd) {
      const rs = row.segment?.start;
      if (!rs) continue;
      const dx = num(rs.x_grid) - se.p0[0];
      const dy = num(rs.y_grid) - se.p0[1];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = row;
      }
    }
    return best;
  }

  return null;
}

export function a3ExportRowEndpointSummary(row) {
  const s = row?.segment?.start;
  const e = row?.segment?.end;
  if (!s || !e) return '';
  const n0 = String(s.station_name || s.station_id || '?').trim();
  const n1 = String(e.station_name || e.station_id || '?').trim();
  return `${n0} → ${n1}`;
}

/** Control 分頁：列出 a3 匯出列中段站顯示字串 */
export function a3MidStationLabels(row) {
  const mids = row?.segment?.stations;
  if (!Array.isArray(mids) || mids.length === 0) return [];
  return mids.map((st) => {
    const name = String(st?.station_name ?? '').trim();
    const id = String(st?.station_id ?? '').trim();
    if (name && id) return `${name}（${id}）`;
    return name || id || '?';
  });
}

/**
 * @param {Array} g3Segments - flat segments（深拷貝後傳入）
 * @param {Array} a3Rows - taipei_a3 processedJsonData（路段匯出列）
 * @returns {{ routesData: Array, placedBlackSectionCount: number, skippedSectionCount: number, routeMismatches: Array<{ route: string, a3: number, g3: number }> }}
 */
export function placeA3BlackStationsOntoG3Segments(g3Segments, a3Rows) {
  const routesData = cloneJson(g3Segments);
  if (!Array.isArray(routesData)) {
    return {
      routesData: [],
      placedBlackSectionCount: 0,
      skippedSectionCount: 0,
      routeMismatches: [],
    };
  }

  const rowsByRoute = groupRowsByRoute(a3Rows);
  const routeMismatches = [];
  let placedBlackSectionCount = 0;
  let skippedSectionCount = 0;

  const routeNamesInData = new Set();
  routesData.forEach((seg) => {
    routeNamesInData.add(seg.route_name ?? seg.name ?? 'Unknown');
  });
  const routeNames = new Set([...rowsByRoute.keys(), ...routeNamesInData]);

  for (const routeName of routeNames) {
    const rows = rowsByRoute.get(routeName) || [];
    const segIndices = [];
    routesData.forEach((seg, idx) => {
      const r = seg.route_name ?? seg.name ?? 'Unknown';
      if (r === routeName) segIndices.push(idx);
    });

    if (rows.length !== segIndices.length) {
      routeMismatches.push({ route: routeName, a3: rows.length, g3: segIndices.length });
    }

    const usedSegIdx = new Set();
    for (const row of rows) {
      const visibleStations = Array.isArray(row?.segment?.stations)
        ? row.segment.stations.filter(isVisibleBlackStation)
        : [];
      const k = visibleStations.length;
      if (k === 0) continue;

      let bestIdx = -1;
      let bestLen = -1;
      for (const idx of segIndices) {
        if (usedSegIdx.has(idx)) continue;
        if (!rowEndpointsMatchSeg(row, routesData[idx])) continue;
        const L = polylineLength(extractPoints(routesData[idx]));
        if (L > bestLen) {
          bestLen = L;
          bestIdx = idx;
        }
      }

      if (bestIdx < 0) {
        skippedSectionCount++;
        continue;
      }
      usedSegIdx.add(bestIdx);
      const ok = applyRowToSegment(routesData[bestIdx], row);
      if (!ok) skippedSectionCount++;
      else placedBlackSectionCount++;
    }
  }

  return { routesData, placedBlackSectionCount, skippedSectionCount, routeMismatches };
}

/**
 * 合併相鄰 connect-to-connect 路段後，沿合併後折線均分黑點，再依黑點切段。
 * 供 a5 / g3 等需要重覆使用的「合併 → 分配黑點 → 切段」流程共用。
 */
export function mergeConnectSpansPlaceBlackStationsAndSplit(flatSegments, a3Rows) {
  const mergedRoutesData = mergeSegmentsToConnectSpans(flatSegments);
  const placed = placeA3BlackStationsOntoG3Segments(mergedRoutesData, a3Rows);
  let splitRoutesData = splitFlatH3SegmentsAtBlackVerticesOnly(cloneJson(placed.routesData));
  if (!Array.isArray(splitRoutesData) || splitRoutesData.length === 0) {
    splitRoutesData = cloneJson(placed.routesData);
  }
  return {
    mergedRoutesData,
    redistributedRoutesData: placed.routesData,
    splitRoutesData,
    placedBlackSectionCount: placed.placedBlackSectionCount,
    skippedSectionCount: placed.skippedSectionCount,
    routeMismatches: placed.routeMismatches,
  };
}

export function assertA3RowsForG3ToH3(a3Layer) {
  const rows = a3Layer?.processedJsonData;
  if (!isMapDrawnRoutesExportArray(rows)) {
    return {
      ok: false,
      message: 'taipei_a3 缺少路段匯出列（processedJsonData）：請先載入 a3 GeoJSON',
    };
  }
  return { ok: true, rows };
}
