/**
 * 分歧點路線對 CCW 環序（validate-junction-rotation skill 與 app 共用）
 *
 * 骨架邊無方向：以 branch（另一端 connect 格座標）為身分排 360° CCW 環序。
 * 同一路線在 Y 型分歧（如景安→南勢角／景安→中和）會佔**兩個 branch**，不可只用路線名 indexOf。
 */

import {
  buildJunctionTable,
  spokesFrom,
  orderedNKeys,
  endPt,
  leaveAngle,
  sameCyclic,
  firstFlipPair,
} from './rotationStructure.js';

export const DEFAULT_OFFLINE_SNAP_DEG = 30;

function readPt(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

function toCheckSeg(seg) {
  if (!seg || typeof seg !== 'object') return { route_name: '', points: [] };
  return {
    route_name: String(seg.route_name ?? seg.name ?? '').trim(),
    points: (seg.points || []).map((p) => readPt(p)),
    nodes: seg.nodes,
    properties_start: seg.properties_start,
    properties_end: seg.properties_end,
  };
}

/** skeletonFlat / fullFlat → 檢查用段（保留 nodes 供站名標籤） */
export function skeletonToCheckFlat(flat) {
  if (!Array.isArray(flat)) return [];
  return flat.map(toCheckSeg);
}

export function geojsonToCheckFlat(fc) {
  return (fc.features || [])
    .filter((f) => f.geometry?.type === 'LineString')
    .map((f) => {
      const p = f.properties || {};
      const t = p.tags || p;
      return {
        route_name: String(t.route_name || p.name || '').trim(),
        points: f.geometry.coordinates.map((c) => [Number(c[0]), Number(c[1])]),
      };
    });
}

export function detectRefIsLatLng(refFlat) {
  for (const seg of refFlat) {
    for (const [x, y] of seg.points || []) {
      if (x >= 100 && x <= 123 && y >= 15 && y <= 30) return true;
    }
  }
  return false;
}

function pickStationName(node, props) {
  return String(
    node?.station_name ?? node?.tags?.station_name ?? node?.tags?.name ??
      props?.station_name ?? props?.tags?.station_name ?? ''
  ).trim();
}

/** 分歧點所在站名（branch 的 jHead 端） */
function junctionStationName(junction, flat) {
  const b = junction.branches.values().next().value;
  if (!b) return '';
  const seg = flat[b.si];
  if (!seg?.points?.length) return '';
  if (b.jHead) {
    return pickStationName(seg.nodes?.[0], seg.properties_start);
  }
  const last = seg.points.length - 1;
  return pickStationName(seg.nodes?.[last], seg.properties_end);
}

function branchFarStationName(seg, jHeadAtJunction) {
  if (!seg?.points?.length) return '';
  const last = seg.points.length - 1;
  if (jHeadAtJunction) {
    return pickStationName(seg.nodes?.[last], seg.properties_end);
  }
  return pickStationName(seg.nodes?.[0], seg.properties_start);
}

function branchDesc(spoke, flat) {
  const seg = flat[spoke.si];
  const rn = spoke.routes?.[0] || seg?.route_name || '';
  const far = branchFarStationName(seg, spoke.jHead);
  if (far) return `「${rn}」→${far}`;
  const [ox, oy] = spoke.nKey.split(',').map(Number);
  return `「${rn}」→(${ox},${oy})`;
}

function junctionLabel(jKey, junction, flat) {
  const sn = junctionStationName(junction, flat);
  if (sn) return sn;
  const any = junction.branches.values().next().value;
  if (!any) return jKey;
  const [x, y] = endPt(flat[any.si], any.jHead);
  return `${Math.round(x)},${Math.round(y)}`;
}

function deg(rad) {
  return (rad * 180) / Math.PI;
}

function angleDiffDeg(a, b) {
  let d = deg(a - b);
  while (d <= -180) d += 360;
  while (d > 180) d -= 360;
  return Math.abs(d);
}

/** 離線 lat/lng vs 格網：branch 環序看似對調，但涉及 branch 皆無 >snapDeg 的 2 點段角差 → 假陽性 */
function junctionHasSignificantTwoPointAngleChange(junction, refFlat, outFlat, snapDeg) {
  for (const b of junction.branches.values()) {
    const outPts = outFlat[b.si]?.points;
    if (!outPts || outPts.length !== 2) continue;
    const refPts = refFlat[b.si]?.points;
    if (!refPts || refPts.length !== 2) continue;
    const d = angleDiffDeg(
      leaveAngle(refFlat[b.si], b.jHead),
      leaveAngle(outFlat[b.si], b.jHead)
    );
    if (d > snapDeg) return true;
  }
  return false;
}

function routesOnBranch(junction, nKey) {
  return junction.branches.get(nKey)?.routes ?? [];
}

function firstFlipBranchKeys(refOrder, outOrder) {
  for (let i = 0; i < refOrder.length; i++) {
    for (let j = i + 1; j < refOrder.length; j++) {
      const refStep = (j - i + refOrder.length) % refOrder.length;
      const oi = outOrder.indexOf(refOrder[i]);
      const oj = outOrder.indexOf(refOrder[j]);
      if (oi < 0 || oj < 0) continue;
      const outStep = (oj - oi + refOrder.length) % refOrder.length;
      if (refStep !== outStep) return [refOrder[i], refOrder[j]];
    }
  }
  return [null, null];
}

function routePairOrderFromBranches(branchOrder, junction, routeA, routeB) {
  const idxA = branchOrder.findIndex((nk) => routesOnBranch(junction, nk).includes(routeA));
  const idxB = branchOrder.findIndex((nk) => routesOnBranch(junction, nk).includes(routeB));
  if (idxA < 0 || idxB < 0) return 'unknown';
  const n = branchOrder.length;
  const step = (idxB - idxA + n) % n;
  return step <= n / 2 ? 'A before B' : 'B before A';
}

/** 「景安」+「→南勢角」→ 景安→南勢角（站間 leg 描述） */
function legLabel(junctionLabel, branchDesc) {
  if (!branchDesc) return '';
  const m = branchDesc.match(/→(.+)$/);
  const far = m ? m[1].trim() : branchDesc;
  const jn = String(junctionLabel ?? '').trim();
  if (jn && far && !far.startsWith('(')) return `${jn}→${far}`;
  return branchDesc;
}

export function formatRoutePairViolationZh(v) {
  const jn = String(v.junctionLabel || v.outGridApprox || '?').trim();
  const station = jn.endsWith('站') ? jn : `${jn}站`;

  if (v.branchADesc && v.branchBDesc) {
    const legA = legLabel(jn, v.branchADesc);
    const legB = legLabel(jn, v.branchBDesc);
    return `${station}：${legA} 與 ${legB} 在 360° CCW 環序中順序對調（佈局結果與讀入骨架不符）`;
  }
  const armA = v.branchADesc ? `（${v.branchADesc}）` : '';
  const armB = v.branchBDesc ? `（${v.branchBDesc}）` : '';
  return `${station}：${v.routeA}${armA} ↔ ${v.routeB}${armB} 之 360° 環序不符`;
}

/**
 * @param {Array<object>} refFlat — 讀入骨架（格網；含 nodes／properties_*，供分歧點表與站名）
 * @param {Array<object>} outFlat — 佈局結果
 * @param {{ refAngleFlat?: Array<object>, offlineRef?: boolean, snapDeg?: number }} [opts]
 *   refAngleFlat — 縮放前經緯度 connect 段（與 skeletonFlat 同索引）；離開角以此為準，避免格網量化吃掉角差
 */
export function analyzeRoutePairRotation(refFlat, outFlat, opts = {}) {
  const ref = skeletonToCheckFlat(refFlat);
  const out = skeletonToCheckFlat(outFlat);
  const refAngle = opts.refAngleFlat ? skeletonToCheckFlat(opts.refAngleFlat) : ref;
  const useGeoRefAngles = opts.refAngleFlat != null;
  const offlineRef = useGeoRefAngles ? false : (opts.offlineRef ?? detectRefIsLatLng(ref));
  const snapDeg = opts.snapDeg ?? DEFAULT_OFFLINE_SNAP_DEG;

  const junctions = buildJunctionTable(ref);
  const ge3Keys = [...junctions.entries()].filter(([, j]) => j.branches.size >= 3);

  const violations = [];
  let routePairPass = 0;

  for (const [jKey, junction] of ge3Keys) {
    const refSpokes = spokesFrom(junction, ref, refAngle);
    const refBranchOrder = orderedNKeys(
      refSpokes,
      refSpokes.map((s) => s.nKey)
    );
    const outSpokes = spokesFrom(junction, out);
    const outBranchOrder = orderedNKeys(outSpokes, refBranchOrder);

    if (sameCyclic(refBranchOrder, outBranchOrder)) {
      routePairPass++;
      continue;
    }

    if (
      offlineRef &&
      !junctionHasSignificantTwoPointAngleChange(junction, refAngle, out, snapDeg)
    ) {
      routePairPass++;
      continue;
    }

    const spokeMap = new Map(refSpokes.map((s) => [s.nKey, { ...s, label: branchDesc(s, ref) }]));
    const pairLabel = firstFlipPair(refBranchOrder, outBranchOrder, spokeMap);
    const jLabel = junctionLabel(jKey, junction, ref);
    const [nkA, nkB] = firstFlipBranchKeys(refBranchOrder, outBranchOrder);
    const spA = nkA ? refSpokes.find((s) => s.nKey === nkA) : null;
    const spB = nkB ? refSpokes.find((s) => s.nKey === nkB) : null;
    const routeA = spA?.routes?.[0] ?? '—';
    const routeB = spB?.routes?.[0] ?? '—';
    const refRel = routePairOrderFromBranches(refBranchOrder, junction, routeA, routeB);
    const outRel = routePairOrderFromBranches(outBranchOrder, junction, routeA, routeB);

    violations.push({
      refJunctionKey: jKey,
      junctionLabel: jLabel,
      outGridApprox: junctionOutGridLabel(junction, out),
      branchCount: junction.branches.size,
      routeA,
      routeB,
      branchADesc: spA ? branchDesc(spA, ref) : '',
      branchBDesc: spB ? branchDesc(spB, ref) : '',
      refOrder: refRel !== 'unknown' ? refRel : 'branch flip',
      outOrder: outRel !== 'unknown' ? outRel : pairLabel,
      pairLabel,
    });
  }

  const primaryVerdict = violations.length === 0 ? 'PASS' : 'FAIL';
  return {
    summary: {
      refSegmentCount: ref.length,
      outSegmentCount: out.length,
      junctionCountGe3: ge3Keys.length,
      routePairPass,
      routePairFail: ge3Keys.length - routePairPass,
      offlineLatLngMode: offlineRef,
      geographicRefAngles: useGeoRefAngles,
      offlineSnapDeg: offlineRef ? snapDeg : undefined,
      primaryVerdict,
    },
    violations,
    summaryZh:
      primaryVerdict === 'PASS'
        ? `路線對 360° 環序：${ge3Keys.length} 個分歧點皆一致。`
        : `路線對 360° 環序：${violations.length} 處不符（分歧點上各支線 CCW 順序，如景安站 景安→南勢角 與環狀線等）`,
    reasonLines: violations.map(formatRoutePairViolationZh),
  };
}

function junctionOutGridLabel(junction, outFlat) {
  const any = junction.branches.values().next().value;
  if (!any) return '';
  const [x, y] = endPt(outFlat[any.si], any.jHead);
  return `${Math.round(x)},${Math.round(y)}`;
}
