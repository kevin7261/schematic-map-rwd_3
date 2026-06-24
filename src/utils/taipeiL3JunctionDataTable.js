/**
 * taipei_l3 DataTable：黑點相銜兩段之 w1／w2、起迄站名、|w1−w2|。
 * 與 taipei_k3 之 taipeiK3JunctionDataTable 邏輯相同但檔案／函式名獨立（不 import K3 模組）。
 */

import { normalizeSpaceNetworkDataToFlatSegments } from './gridNormalizationMinDistance.js';
import { getNodeAtSegmentIndex, gridKeyFromNode } from './randomConnectSegmentWeights.js';

function getStationName(node) {
  if (!node || typeof node !== 'object') return '';
  const raw = node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? node.name ?? '';
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
  const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : (pt?.props ?? {});
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
export function buildTaipeiL3JunctionDataTableRows(spaceNetworkGridJsonData) {
  const segs = normalizeSpaceNetworkDataToFlatSegments(spaceNetworkGridJsonData);
  if (!Array.isArray(segs) || segs.length === 0) return [];

  const out = [];

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
    }
  }

  return out.map((r, index) => ({
    '#': index + 1,
    ...r,
  }));
}

/**
 * 與 buildTaipeiL3JunctionDataTableRows 相同之黑點銜接判定，供 l3「縮減黑點」逐步合併。
 * @param {Array} spaceNetworkGridJsonData
 * @returns {Array<{ kind: 'intra' | 'inter', diff: number, segIndex?: number, junctionIdx?: number, segIndexA?: number, segIndexB?: number, w1: number, w2: number }>}
 */
export function collectTaipeiL3JunctionReductionCandidates(spaceNetworkGridJsonData) {
  const segs = normalizeSpaceNetworkDataToFlatSegments(spaceNetworkGridJsonData);
  if (!Array.isArray(segs) || segs.length === 0) return [];

  const candidates = [];

  let segRun = 0;
  for (const seg of segs) {
    segRun += 1;
    const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : [];
    const sorted = stationWeights
      .filter((w) => w && Number.isFinite(Number(w.weight)))
      .slice()
      .sort((a, b) => (Number(a.start_idx) || 0) - (Number(b.start_idx) || 0));

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

      candidates.push({
        kind: 'intra',
        diff: Math.abs(w1n - w2n),
        segIndex: segRun - 1,
        junctionIdx: j,
        w1: w1n,
        w2: w2n,
      });
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

      candidates.push({
        kind: 'inter',
        diff: Math.abs(w1n - w2n),
        segIndexA: runA - 1,
        segIndexB: runB - 1,
        w1: w1n,
        w2: w2n,
      });
    }
  }

  return candidates;
}
