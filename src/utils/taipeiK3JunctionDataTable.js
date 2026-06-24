/**
 * taipei_k3 DataTable：黑點相銜兩段之 w1／w2、起迄站名、|w1−w2|。
 * 與 ControlTab 先前「黑點站間權重」邏輯一致；供 loadTaipeiK3J3RoutesTrafficJson 寫入 dataTableData。
 */

import { normalizeSpaceNetworkDataToFlatSegments } from './gridNormalizationMinDistance.js';
import { getNodeAtSegmentIndex, gridKeyFromNode } from './randomConnectSegmentWeights.js';

function getStationName(node) {
  if (!node || typeof node !== 'object') return '';
  const raw =
    node.station_name ??
    node.tags?.station_name ??
    node.tags?.name ??
    node.name ??
    '';
  const s = String(raw).trim();
  return s === '—' || s === '－' ? '' : s;
}

function hasConnectNumber(node, ptProps) {
  const tags = ptProps?.tags || node?.tags || {};
  const has = (v) => v !== undefined && v !== null && v !== '';
  return (
    has(node?.connect_number) ||
    has(tags?.connect_number) ||
    has(ptProps?.connect_number) ||
    has(ptProps?.tags?.connect_number)
  );
}

function isConnectAt(seg, idx) {
  const nodes = seg.nodes || [];
  const node = nodes[idx];
  const pts = seg.points || [];
  const pt = pts[idx];
  const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : pt?.props ?? {};
  const tags = ptProps?.tags || node?.tags || {};
  const nodeType =
    node?.node_type ||
    ptProps?.node_type ||
    tags?.node_type ||
    (hasConnectNumber(node, ptProps) ? 'connect' : '');
  return nodeType === 'connect' || hasConnectNumber(node, ptProps);
}

function resolveNode(seg, idx) {
  const nodes = seg.nodes || [];
  const n = nodes.length;
  if (n === 0) return null;
  if (idx === 0) return seg.properties_start || nodes[0];
  if (idx === n - 1) return seg.properties_end || nodes[n - 1];
  return nodes[idx] || nodes[0];
}

function gridKeyFromPoint(pt) {
  if (pt == null) return null;
  const x = Array.isArray(pt) ? pt[0] : pt?.x;
  const y = Array.isArray(pt) ? pt[1] : pt?.y;
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  return `${Math.round(Number(x))},${Math.round(Number(y))}`;
}

/**
 * @param {Array} spaceNetworkGridJsonData
 * @returns {Array<Object>} DataTable 列（含「#」欄）
 */
export function buildTaipeiK3JunctionDataTableRows(spaceNetworkGridJsonData) {
  const segs = normalizeSpaceNetworkDataToFlatSegments(spaceNetworkGridJsonData);
  if (!Array.isArray(segs) || segs.length === 0) return [];

  const out = [];
  const coveredSegmentWeights = new Set();
  const markCovered = (routeName, endpointsLabel) => {
    const route = String(routeName ?? '');
    const endpoints = String(endpointsLabel ?? '').trim();
    if (!route || !endpoints) return;
    coveredSegmentWeights.add(`${route}|${endpoints}`);
  };

  let segRun = 0;
  for (const seg of segs) {
    segRun += 1;
    const routeName = seg.route_name ?? seg.name ?? '未知路線';
    const nodes = seg.nodes || [];
    const nNodes = nodes.length;
    const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
    const sorted = stationWeights
      .filter((w) => w && Number.isFinite(Number(w.weight)))
      .slice()
      .sort((a, b) => (Number(a.start_idx) || 0) - (Number(b.start_idx) || 0));

    const endpointsLabel = (w) => {
      const sIdx = Number.isFinite(w.start_idx) ? w.start_idx : 0;
      const eIdx = Number.isFinite(w.end_idx) ? w.end_idx : Math.max(0, nNodes - 1);
      const sn = resolveNode(seg, sIdx);
      const en = resolveNode(seg, eIdx);
      const h = getStationName(sn) || '黑點';
      const t = getStationName(en) || '黑點';
      return `${h} — ${t}`;
    };

    for (let i = 0; i < sorted.length - 1; i++) {
      const w1 = sorted[i];
      const w2 = sorted[i + 1];
      const j = Number.isFinite(w1.end_idx) ? w1.end_idx : null;
      const j2 = Number.isFinite(w2.start_idx) ? w2.start_idx : null;
      if (j == null || j2 == null || j !== j2) continue;
      if (isConnectAt(seg, j)) continue;

      const w1n = Number(w1.weight);
      const w2n = Number(w2.weight);
      if (!Number.isFinite(w1n) || !Number.isFinite(w2n)) continue;

      const centerNode = resolveNode(seg, j);
      const centerName = getStationName(centerNode) || '黑點';

      out.push({
        路線: String(routeName),
        路段序: String(segRun),
        銜接黑點: centerName,
        w1: w1n,
        路段1起迄: endpointsLabel(w1),
        w2: w2n,
        路段2起迄: endpointsLabel(w2),
        weight差: Math.abs(w1n - w2n),
      });
      markCovered(routeName, endpointsLabel(w1));
      markCovered(routeName, endpointsLabel(w2));
    }
  }

  const byRoute = new Map();
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const rn = String(seg.route_name ?? seg.name ?? '未知路線');
    if (!byRoute.has(rn)) byRoute.set(rn, []);
    byRoute.get(rn).push({ seg, segRun: i + 1 });
  }

  for (const [, list] of byRoute) {
    for (let i = 0; i < list.length - 1; i++) {
      const { seg: segA, segRun: runA } = list[i];
      const { seg: segB, segRun: runB } = list[i + 1];
      const ptsA = segA.points || [];
      const ptsB = segB.points || [];
      if (ptsA.length < 2 || ptsB.length < 2) continue;

      const na = ptsA.length;
      const nb = ptsB.length;
      const endA = getNodeAtSegmentIndex(segA, na - 1, na);
      const startB = getNodeAtSegmentIndex(segB, 0, nb);

      const kA = gridKeyFromNode(endA);
      const kB = gridKeyFromNode(startB);
      let shareVertex = kA != null && kB != null && kA === kB;
      if (!shareVertex) {
        const g1 = gridKeyFromPoint(ptsA[na - 1]);
        const g2 = gridKeyFromPoint(ptsB[0]);
        shareVertex = g1 != null && g2 != null && g1 === g2;
      }
      if (!shareVertex) continue;

      if (isConnectAt(segA, na - 1)) continue;

      const swA = Array.isArray(segA.station_weights) ? segA.station_weights[0] : null;
      const swB = Array.isArray(segB.station_weights) ? segB.station_weights[0] : null;
      if (!swA || !swB) continue;

      const w1n = Number(swA.weight);
      const w2n = Number(swB.weight);
      if (!Number.isFinite(w1n) || !Number.isFinite(w2n)) continue;

      const centerName = getStationName(endA) || getStationName(startB) || '黑點';

      const nnA = ptsA.length;
      const nnB = ptsB.length;
      const seg1Endpoints = (() => {
        const sn = resolveNode(segA, 0);
        const en = resolveNode(segA, nnA - 1);
        return `${getStationName(sn) || '黑點'} — ${getStationName(en) || '黑點'}`;
      })();
      const seg2Endpoints = (() => {
        const sn = resolveNode(segB, 0);
        const en = resolveNode(segB, nnB - 1);
        return `${getStationName(sn) || '黑點'} — ${getStationName(en) || '黑點'}`;
      })();

      out.push({
        路線: String(list[i].seg.route_name ?? list[i].seg.name ?? '未知路線'),
        路段序: `${runA}↔${runB}`,
        銜接黑點: centerName,
        w1: w1n,
        路段1起迄: seg1Endpoints,
        w2: w2n,
        路段2起迄: seg2Endpoints,
        weight差: Math.abs(w1n - w2n),
      });
      markCovered(list[i].seg.route_name ?? list[i].seg.name ?? '未知路線', seg1Endpoints);
      markCovered(list[i].seg.route_name ?? list[i].seg.name ?? '未知路線', seg2Endpoints);
    }
  }

  // 補齊：若某段沒有落在任何「銜接兩段」列（常見於頭尾皆為交叉點），
  // 仍補一列以確保每段權重可被 DataTable / lookup 命中。
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const routeName = String(seg.route_name ?? seg.name ?? '未知路線');
    const nodes = seg.nodes || [];
    const nNodes = nodes.length;
    const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
    for (const w of stationWeights) {
      if (!w || !Number.isFinite(Number(w.weight))) continue;
      const sIdx = Number.isFinite(w.start_idx) ? w.start_idx : 0;
      const eIdx = Number.isFinite(w.end_idx) ? w.end_idx : Math.max(0, nNodes - 1);
      const sn = resolveNode(seg, sIdx);
      const en = resolveNode(seg, eIdx);
      const endpoints = `${getStationName(sn) || '黑點'} — ${getStationName(en) || '黑點'}`;
      const key = `${routeName}|${endpoints}`;
      if (coveredSegmentWeights.has(key)) continue;
      const weight = Number(w.weight);
      out.push({
        路線: routeName,
        路段序: String(i + 1),
        銜接黑點: '（補）',
        w1: weight,
        路段1起迄: endpoints,
        w2: weight,
        路段2起迄: endpoints,
        weight差: 0,
      });
      coveredSegmentWeights.add(key);
    }
  }

  return out.map((r, index) => ({
    '#': index + 1,
    ...r,
  }));
}

/**
 * 解析 DataTable「路段1起迄／路段2起迄」欄位（與 buildTaipeiK3JunctionDataTableRows 的 `h — t` 格式一致）。
 * @param {unknown} label
 * @returns {[string, string]|null}
 */
export function splitTaipeiK3RouteEndpointsLabel(label) {
  if (label == null || label === '') return null;
  const s = String(label).trim();
  const parts = s.split(/\s*[—–－]\s*/u);
  if (parts.length >= 2) {
    return [parts[0].trim(), parts[parts.length - 1].trim()];
  }
  const dash = s.split(/\s*-\s*/);
  if (dash.length >= 2) {
    return [dash[0].trim(), dash[dash.length - 1].trim()];
  }
  return null;
}

/**
 * 站名/路線鍵正規化（避免「崑/昆」等字形差異造成 lookup miss）。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTaipeiK3WeightKeyPart(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/崑/g, '昆')
    .trim();
}

/**
 * 由 taipei K3 黑點銜接 DataTable 列建立「路線|起站|迄站」→ 權重，供 layout-network-grid 與表格同一來源顯示。
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 * @returns {Map<string, number>}
 */
export function buildEdgeWeightLookupFromTaipeiK3DataTable(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    const route = normalizeTaipeiK3WeightKeyPart(row['路線'] ?? row['路線名'] ?? row.route ?? '');
    if (!route) continue;
    const w1 = Number(row.w1);
    const w2 = Number(row.w2);
    const p1 = splitTaipeiK3RouteEndpointsLabel(row['路段1起迄']);
    const p2 = splitTaipeiK3RouteEndpointsLabel(row['路段2起迄']);
    if (p1 && Number.isFinite(w1)) {
      map.set(
        `${route}|${normalizeTaipeiK3WeightKeyPart(p1[0])}|${normalizeTaipeiK3WeightKeyPart(p1[1])}`,
        w1
      );
    }
    if (p2 && Number.isFinite(w2)) {
      map.set(
        `${route}|${normalizeTaipeiK3WeightKeyPart(p2[0])}|${normalizeTaipeiK3WeightKeyPart(p2[1])}`,
        w2
      );
    }
  }
  return map;
}

function parseRouteSeqPair(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // 取字串中的整數：相容「31↔32」「31–32」「31-32」等 UI／複製貼上差異
  const nums = s.match(/\d+/g);
  if (nums && nums.length >= 2) {
    const a = Number(nums[0]);
    const b = Number(nums[nums.length - 1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  if (nums && nums.length === 1) {
    const single = Number(nums[0]);
    if (Number.isFinite(single)) return [single];
  }
  const single = Number(s);
  if (Number.isFinite(single)) return [single];
  return null;
}

/**
 * 由 DataTable 的「路線 + 路段序 + w1/w2」建立每段唯一權重映射，並回傳衝突資訊供檢查。
 * - 路段序為 `A↔B`：w1 對 A，w2 對 B
 * - 路段序為單一數字：若 w1/w2 其中一個存在則採用該值
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 * @returns {{ lookup: Map<string, number>, sequenceLookup: Map<number, number>, conflicts: Array<{key:string, existing:number, incoming:number, rowIndex:number}> }}
 */
export function buildRouteSequenceWeightLookupFromTaipeiK3DataTable(rows) {
  const lookup = new Map();
  const sequenceLookup = new Map();
  const conflicts = [];
  if (!Array.isArray(rows)) return { lookup, sequenceLookup, conflicts };

  const put = (route, seq, value) => {
    if (!Number.isFinite(seq) || !Number.isFinite(value)) return;
    const seqN = Number(seq);
    const v = Number(value);
    const existingSeq = Number(sequenceLookup.get(seqN));
    sequenceLookup.set(seqN, Number.isFinite(existingSeq) ? Math.max(existingSeq, v) : v);
    if (!route) return;
    const key = `${route}|${seqN}`;
    if (lookup.has(key)) {
      const existing = Number(lookup.get(key));
      if (Number.isFinite(existing)) {
        if (existing !== v) lookup.set(key, Math.max(existing, v));
        return;
      }
    }
    lookup.set(key, v);
  };

  const numOrNaN = (raw) => {
    if (raw == null || raw === '') return NaN;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };

  rows.forEach((row) => {
    const route = normalizeTaipeiK3WeightKeyPart(row?.['路線'] ?? row?.['路線名'] ?? row?.route ?? '');
    const seq = parseRouteSeqPair(row?.['路段序']);
    if (!seq || seq.length === 0) return;

    const w1 = numOrNaN(row?.w1);
    const w2 = numOrNaN(row?.w2);
    const wt = numOrNaN(row?.weight);

    if (seq.length >= 2) {
      if (Number.isFinite(w1)) put(route, seq[0], w1);
      if (Number.isFinite(w2)) put(route, seq[1], w2);
      return;
    }

    const chosen = Number.isFinite(w1) ? w1 : Number.isFinite(w2) ? w2 : Number.isFinite(wt) ? wt : NaN;
    if (Number.isFinite(chosen)) put(route, seq[0], chosen);
  });

  return { lookup, sequenceLookup, conflicts };
}
