/**
 * taipei_h3 → taipei_i3：僅在 polyline 既有頂點上、依 g3→h3 插入的黑點（tags._forceDrawBlackDot）切段。
 * 不四捨五入座標、不 densify、不刪段、不重算 Station／Connect／Section，不寫 station_weights（線上不畫數字）。
 */

import { getNodeAtSegmentIndex } from '@/utils/randomConnectSegmentWeights.js';

function cloneJson(obj) {
  if (obj === undefined || obj === null) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function hasMeaningfulTaipeiFParentEndpointProps(p) {
  if (!p || typeof p !== 'object') return false;
  if (Object.keys(p).length === 0) return false;
  if (p.node_type != null && String(p.node_type).trim() !== '') return true;
  if (p.station_name || p.station_id) return true;
  if (p.connect_number != null && String(p.connect_number).trim() !== '') return true;
  if (p.tags && Object.keys(p.tags).length > 0) return true;
  return false;
}

function mergeTaipeiFEndpointFromParentProps(synthetic, parentProps) {
  if (!parentProps || typeof parentProps !== 'object') return synthetic;
  const stationName = (
    parentProps.station_name ||
    parentProps.tags?.station_name ||
    parentProps.tags?.name ||
    ''
  ).trim();
  const stationId = (parentProps.station_id || parentProps.tags?.station_id || '')
    .toString()
    .trim();
  const cn = parentProps.connect_number ?? parentProps.tags?.connect_number;
  const out = {
    ...parentProps,
    ...(synthetic || {}),
    node_type: parentProps.node_type || synthetic?.node_type || 'line',
    tags: { ...(parentProps.tags || {}), ...(synthetic?.tags || {}) },
  };
  if (stationName) out.station_name = stationName;
  if (stationId) out.station_id = stationId;
  if (cn != null && cn !== '') out.connect_number = cn;
  return out;
}

/** 僅內部頂點：g3→h3 弧長插入之中段站 */
function isH3InteriorBlackVertex(node, i, nPoints) {
  if (i <= 0 || i >= nPoints - 1) return false;
  if (!node || typeof node !== 'object') return false;
  if (String(node.node_type ?? '').toLowerCase() === 'connect') return false;
  const cn = node.connect_number ?? node.tags?.connect_number;
  if (cn != null && cn !== '') return false;
  return node.tags?._forceDrawBlackDot === true;
}

/**
 * @param {object} seg - 單一 flat segment（會讀取，不修改原物件）
 * @param {string} routeName
 * @returns {object[]}
 */
function sliceOneSegmentAtBlackVertices(seg, routeName) {
  const points = seg.points;
  if (!Array.isArray(points) || points.length < 2) return [];

  const nFull = points.length;
  const nodes = seg.nodes;
  const blackIdx = [];
  for (let i = 1; i < nFull - 1; i++) {
    const node = getNodeAtSegmentIndex(seg, i, nFull);
    if (isH3InteriorBlackVertex(node, i, nFull)) blackIdx.push(i);
  }

  const bounds = [...new Set([0, nFull - 1, ...blackIdx])].sort((a, b) => a - b);
  const out = [];

  for (let j = 0; j < bounds.length - 1; j++) {
    const i0 = bounds[j];
    const i1 = bounds[j + 1];
    if (i1 <= i0) continue;

    const pts = points.slice(i0, i1 + 1).map((p) => cloneJson(p));
    const nl = pts.length;
    if (nl < 2) continue;

    let newNodes;
    if (Array.isArray(nodes) && nodes.length === nFull) {
      newNodes = nodes.slice(i0, i1 + 1).map((n) => cloneJson(n));
    }

    const stub = {
      ...seg,
      points: pts,
      nodes: newNodes,
      properties_start: undefined,
      properties_end: undefined,
    };
    let ps = getNodeAtSegmentIndex(stub, 0, nl);
    let pe = getNodeAtSegmentIndex(stub, nl - 1, nl);
    if (i0 === 0 && hasMeaningfulTaipeiFParentEndpointProps(seg.properties_start)) {
      ps = mergeTaipeiFEndpointFromParentProps(ps, seg.properties_start);
    }
    if (i1 === nFull - 1 && hasMeaningfulTaipeiFParentEndpointProps(seg.properties_end)) {
      pe = mergeTaipeiFEndpointFromParentProps(pe, seg.properties_end);
    }

    const sub = {
      ...seg,
      points: pts,
      route_name: routeName,
      name: seg.name || routeName,
      properties_start: ps ? cloneJson(ps) : undefined,
      properties_end: pe ? cloneJson(pe) : undefined,
      station_weights: [],
      nav_weight: seg.nav_weight,
    };
    if (newNodes && newNodes.length === nl) sub.nodes = newNodes;
    else delete sub.nodes;

    delete sub.edge_weights;
    out.push(sub);
  }

  return out;
}

/**
 * @param {Array<object>} flatSegments - taipei_h3 spaceNetworkGridJsonData（flat）
 * @returns {Array<object>} 切段後 flat segments（座標／節點為拷貝，幾何與 h3 一致僅拆段）
 */
export function splitFlatH3SegmentsAtBlackVerticesOnly(flatSegments) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return [];

  const out = [];
  for (const seg of flatSegments) {
    const rn = String(seg.route_name ?? seg.name ?? 'Unknown');
    const parts = sliceOneSegmentAtBlackVertices(seg, rn);
    if (parts.length === 0) {
      const one = cloneJson(seg);
      one.route_name = rn;
      one.name = one.name || rn;
      one.station_weights = [];
      delete one.edge_weights;
      out.push(one);
    } else {
      out.push(...parts);
    }
  }
  return out;
}
