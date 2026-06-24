/**
 * 將 spaceNetworkGridJsonData 轉成與 exportRouteSegmentsFromGeoJson 相同語意之
 * { routeName, color, segment: { start, stations, end }, routeCoordinates }[]，
 * 不經 buildMapDrawnRoutesExport，故不會多出 node_type／tags／route_list 等欄位。
 * 支援扁平 segments 或 2-5 式 routes[].segments（會先展平）。
 */

import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';

function num(v) {
  return Number(v ?? 0);
}

function mergeNodeAndProps(node, props) {
  const n = node && typeof node === 'object' ? node : {};
  const p = props && typeof props === 'object' ? props : {};
  const tags = { ...(p.tags || {}), ...(n.tags || {}) };
  return { ...p, ...n, tags };
}

function lineStationFromNode(node, pt) {
  if (!node || typeof node !== 'object') return null;
  const sid = String(node.station_id ?? node.tags?.station_id ?? '').trim();
  const sname = String(
    node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? ''
  ).trim();
  if (!sid && !sname) return null;
  return {
    station_id: sid,
    station_name: sname,
    x_grid: num(pt?.[0]),
    y_grid: num(pt?.[1]),
  };
}

/**
 * 起迄站物件：鍵集合對齊 geojson snapStation（不含 connect_number）
 */
function endpointExportShape(node, props, pt) {
  const m = mergeNodeAndProps(node, props);
  const tags = m.tags || {};
  const routeList = Array.isArray(m.route_list)
    ? m.route_list
    : Array.isArray(m.route_name_list)
      ? m.route_name_list
      : [];
  // 以折線頂點為準，避免 ㄈ→L／Flip 後 points 已變但 node／tags 仍留舊格（畫線對、MapDrawn 點錯位）
  const x = num(pt?.[0] ?? m.x_grid ?? tags.x_grid);
  const y = num(pt?.[1] ?? m.y_grid ?? tags.y_grid);
  const out = {
    station_id: String(m.station_id ?? tags.station_id ?? '').trim(),
    station_name: String(m.station_name ?? tags.station_name ?? tags.name ?? '').trim(),
    route_name_list: routeList.map((r) => String(r)),
    x_grid: x,
    y_grid: y,
  };
  if (m.type) {
    out.type = m.type;
  } else {
    const d = routeList.filter((r) => String(r).trim() !== '').length;
    if (d > 1) out.type = 'intersection';
    else if (d === 1) out.type = 'terminal';
    else out.type = 'normal';
  }
  return out;
}

const COORD_EPS = 1e-3;

function pointIndexForXY(points, xGrid, yGrid) {
  const tx = num(xGrid);
  const ty = num(yGrid);
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const px = Array.isArray(pt) ? num(pt[0]) : num(pt?.x);
    const py = Array.isArray(pt) ? num(pt[1]) : num(pt?.y);
    if (Math.abs(px - tx) <= COORD_EPS && Math.abs(py - ty) <= COORD_EPS) return i;
  }
  return -1;
}

function endpointDisplayNodeType(endpointObj) {
  const t = String(endpointObj?.type ?? '').trim();
  if (t === 'intersection' || t === 'terminal') return 'connect';
  if (t === 'normal') return 'line';
  return 'connect';
}

/**
 * 與 flatSegmentsToGeojsonStyleExportRows 單段邏輯相同，但與展平 segments 一一對應（頂點少於 2 則為 null）。
 * 供 Control 分頁路段車站列表與 processedJsonData.segment 對齊（含 properties_start/end 併入起迄）。
 *
 * @param {Array<Object>} flatSegments - normalizeSpaceNetworkDataToFlatSegments 結果
 * @returns {Array<Object|null>}
 */
export function mapFlatSegmentsToExportRowsOrNull(flatSegments) {
  if (!Array.isArray(flatSegments)) return [];
  const out = [];
  for (const seg of flatSegments) {
    const points = Array.isArray(seg.points) ? seg.points : [];
    const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
    if (points.length < 2) {
      out.push(null);
      continue;
    }

    const routeName = String(seg.route_name ?? seg.name ?? 'Unknown');
    const wtags = seg.way_properties?.tags || {};
    const color =
      typeof wtags.color === 'string' && wtags.color.trim() !== '' ? wtags.color.trim() : '#666666';

    const ps = seg.properties_start || {};
    const pe = seg.properties_end || {};

    let start;
    let end;
    const midStations = [];
    const midCoords = points.slice(1, -1).map((p) => [num(p[0]), num(p[1])]);

    if (nodes.length === points.length) {
      start = endpointExportShape(nodes[0], ps, points[0]);
      end = endpointExportShape(nodes[nodes.length - 1], pe, points[points.length - 1]);
      for (let i = 1; i < points.length - 1; i++) {
        const row = lineStationFromNode(nodes[i], points[i]);
        if (row) {
          midStations.push(row);
          continue;
        }
        const ni = nodes[i];
        if (ni && typeof ni === 'object' && ni.node_type === 'connect') {
          midStations.push({
            station_id: String(ni.station_id ?? ni.tags?.station_id ?? '').trim(),
            station_name: String(
              ni.station_name ?? ni.tags?.station_name ?? ni.tags?.name ?? ''
            ).trim(),
            x_grid: num(points[i][0]),
            y_grid: num(points[i][1]),
            node_type: 'connect',
            connect_number: ni.connect_number ?? ni.tags?.connect_number ?? null,
            tags: ni.tags ? { ...ni.tags } : {},
          });
        }
      }
    } else {
      start = endpointExportShape({}, ps, points[0]);
      end = endpointExportShape({}, pe, points[points.length - 1]);
      for (let i = 1; i < points.length - 1; i++) {
        const ni = nodes[i];
        if (!ni || typeof ni !== 'object') continue;
        const row = lineStationFromNode(ni, points[i]);
        if (row) {
          midStations.push(row);
          continue;
        }
        if (ni.node_type === 'connect') {
          midStations.push({
            station_id: String(ni.station_id ?? ni.tags?.station_id ?? '').trim(),
            station_name: String(
              ni.station_name ?? ni.tags?.station_name ?? ni.tags?.name ?? ''
            ).trim(),
            x_grid: num(points[i][0]),
            y_grid: num(points[i][1]),
            node_type: 'connect',
            connect_number: ni.connect_number ?? ni.tags?.connect_number ?? null,
            tags: ni.tags ? { ...ni.tags } : {},
          });
        }
      }
    }

    out.push({
      routeName,
      color,
      segment: {
        start,
        stations: midStations,
        end,
      },
      routeCoordinates: [
        [num(points[0][0]), num(points[0][1])],
        midCoords,
        [num(points[points.length - 1][0]), num(points[points.length - 1][1])],
      ],
    });
  }
  return out;
}

/**
 * 由匯出列 segment 產生 Control 分頁「路段車站節點」列（與 processedJsonData 語意一致）。
 *
 * @param {Object} row - mapFlatSegmentsToExportRowsOrNull 之非 null 元素
 * @param {Array} points - 該段 seg.points
 * @param {(v: number) => string} [formatCoord]
 */
export function exportRowToControlStationNodes(row, points, formatCoord) {
  const fmt =
    typeof formatCoord === 'function'
      ? formatCoord
      : (v) => {
          const n = num(v);
          return String(n);
        };
  const seg = row?.segment;
  if (!seg) return [];
  const pts = Array.isArray(points) ? points : [];
  const list = [];

  const pushEndpoint = (ep, fallbackIdx) => {
    if (!ep || typeof ep !== 'object') return;
    const sid = String(ep.station_id ?? '').trim();
    const sname = String(ep.station_name ?? '').trim();
    if (!sid && !sname) return;
    const x = ep.x_grid;
    const y = ep.y_grid;
    let idx = pointIndexForXY(pts, x, y);
    if (idx < 0) idx = fallbackIdx;
    list.push({
      idx,
      x: fmt(x),
      y: fmt(y),
      nodeType: endpointDisplayNodeType(ep),
      stationName: sname,
      stationId: sid,
    });
  };

  pushEndpoint(seg.start, 'start');
  const mids = Array.isArray(seg.stations) ? seg.stations : [];
  for (let k = 0; k < mids.length; k++) {
    const m = mids[k];
    if (!m || typeof m !== 'object') continue;
    const sid = String(m.station_id ?? '').trim();
    const sname = String(m.station_name ?? '').trim();
    if (!sid && !sname) continue;
    const x = m.x_grid;
    const y = m.y_grid;
    let idx = pointIndexForXY(pts, x, y);
    if (idx < 0) idx = `mid${k}`;
    list.push({
      idx,
      x: fmt(x),
      y: fmt(y),
      nodeType: 'line',
      stationName: sname,
      stationId: sid,
    });
  }
  pushEndpoint(seg.end, 'end');
  return list;
}

/**
 * @param {Array<Object>} spaceNetworkData - spaceNetworkGridJsonData（扁平或 routes[].segments）
 * @returns {Array<Object>}
 */
export function flatSegmentsToGeojsonStyleExportRows(spaceNetworkData) {
  const flatSegments = normalizeSpaceNetworkDataToFlatSegments(spaceNetworkData);
  return mapFlatSegmentsToExportRowsOrNull(flatSegments).filter((r) => r != null);
}
