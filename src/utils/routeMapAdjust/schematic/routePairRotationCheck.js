/**
 * 分歧點路線對 CCW 環序（validate-junction-rotation skill 與 app 共用）
 *
 * 角度：rotationStructure.js 同款的 first-step leaveAngle
 * 離線 lat/lng ref + 格網 out：須 2 點 connect 段角差 > snapDeg 才判 Fail
 */

const ANG_EPS = 1e-5;
export const DEFAULT_OFFLINE_SNAP_DEG = 30;

const key6 = (x, y) => `${Number(x).toFixed(6)},${Number(y).toFixed(6)}`;

function readPt(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

const deg = (rad) => (rad * 180) / Math.PI;

function leaveAngleFirstStep(seg, jHead) {
  const pts = seg.points;
  if (!pts || pts.length < 2) return 0;
  const [jx, jy] = readPt(pts[jHead ? 0 : pts.length - 1]);
  const [ox, oy] = readPt(pts[jHead ? 1 : pts.length - 2]);
  return Math.atan2(oy - jy, ox - jx);
}

/** skeletonFlat / fullFlat → { route_name, points }[] */
export function skeletonToCheckFlat(flat) {
  if (!Array.isArray(flat)) return [];
  return flat.map((seg) => ({
    route_name: String(seg.route_name ?? seg.name ?? '').trim(),
    points: (seg.points || []).map((p) => readPt(p)),
  }));
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

/** 骨架是否為經緯度（下載 input）而非 MILP 格網 */
export function detectRefIsLatLng(refFlat) {
  for (const seg of refFlat) {
    for (const [x, y] of seg.points || []) {
      if (x >= 100 && x <= 123 && y >= 15 && y <= 30) return true;
    }
  }
  return false;
}

function buildJunctionTable(flat) {
  const junctions = new Map();
  const add = (jKey, nKey, route, si, jHead) => {
    if (jKey === nKey || !route) return;
    if (!junctions.has(jKey)) junctions.set(jKey, new Map());
    const br = junctions.get(jKey);
    if (!br.has(nKey)) br.set(nKey, { nKey, route, si, jHead });
  };
  for (let si = 0; si < flat.length; si++) {
    const pts = flat[si].points;
    if (!pts || pts.length < 2) continue;
    const route = flat[si].route_name;
    add(key6(pts[0][0], pts[0][1]), key6(pts.at(-1)[0], pts.at(-1)[1]), route, si, true);
    add(key6(pts.at(-1)[0], pts.at(-1)[1]), key6(pts[0][0], pts[0][1]), route, si, false);
  }
  return junctions;
}

function spokesFrom(junction, flat) {
  return [...junction.values()].map((b) => ({
    ...b,
    ang: leaveAngleFirstStep(flat[b.si], b.jHead),
  }));
}

function orderedNKeys(spokes, tieOrder) {
  if (!spokes.length) return [];
  const tie = new Map(tieOrder.map((k, i) => [k, i]));
  const sorted = spokes.slice().sort((a, b) => {
    const d = a.ang - b.ang;
    if (Math.abs(d) > ANG_EPS) return d;
    return (tie.get(a.nKey) ?? 0) - (tie.get(b.nKey) ?? 0);
  });
  let maxGap = -1;
  let startIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    let gap = next.ang - cur.ang;
    if (i === sorted.length - 1) gap = next.ang + 2 * Math.PI - cur.ang;
    if (gap > maxGap) {
      maxGap = gap;
      startIdx = (i + 1) % sorted.length;
    }
  }
  const out = [];
  for (let i = 0; i < sorted.length; i++) out.push(sorted[(startIdx + i) % sorted.length].nKey);
  return out;
}

function sameCyclic(a, b) {
  if (a.length !== b.length || !a.length) return true;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[(start + i) % a.length]) return false;
  return true;
}

function routePairOrder(order, junction, routeA, routeB) {
  const iA = order.findIndex((k) => junction.get(k)?.route === routeA);
  const iB = order.findIndex((k) => junction.get(k)?.route === routeB);
  if (iA < 0 || iB < 0) return 'unknown';
  const n = order.length;
  const step = (iB - iA + n) % n;
  return step <= n / 2 ? 'A before B' : 'B before A';
}

function outGridLabel(flat, junction) {
  const any = [...junction.values()][0];
  if (!any) return '';
  const pts = flat[any.si].points;
  const [x, y] = readPt(pts[any.jHead ? 0 : pts.length - 1]);
  return `${Math.round(x)},${Math.round(y)}`;
}

function angleDiffDeg(a, b) {
  let d = deg(a - b);
  while (d <= -180) d += 360;
  while (d > 180) d -= 360;
  return Math.abs(d);
}

function hasLargeAngleMismatch(junction, refFlat, outFlat, routeA, routeB, snapDeg) {
  for (const b of junction.values()) {
    if (b.route !== routeA && b.route !== routeB) continue;
    const outPts = outFlat[b.si]?.points;
    if (!outPts || outPts.length !== 2) continue;
    const d = angleDiffDeg(
      leaveAngleFirstStep(refFlat[b.si], b.jHead),
      leaveAngleFirstStep(outFlat[b.si], b.jHead)
    );
    if (d > snapDeg) return true;
  }
  return false;
}

export function formatRoutePairViolationZh(v) {
  const grid = v.outGridApprox || '?';
  return `@(${grid}) ${v.routeA} ↔ ${v.routeB}：骨架 ${v.refOrder}、結果 ${v.outOrder}`;
}

/**
 * @param {Array<{route_name:string, points:number[][]}>} refFlat
 * @param {Array<{route_name:string, points:number[][]}>} outFlat
 */
export function analyzeRoutePairRotation(refFlat, outFlat, opts = {}) {
  const offlineRef = opts.offlineRef ?? detectRefIsLatLng(refFlat);
  const snapDeg = opts.snapDeg ?? DEFAULT_OFFLINE_SNAP_DEG;
  const junctions = buildJunctionTable(refFlat);
  const ge3Keys = [...junctions.entries()].filter(([, j]) => j.size >= 3);

  const violations = [];
  const branchStrict = [];
  let routePairPass = 0;

  for (const [jKey, junction] of ge3Keys) {
    const refSpokes = spokesFrom(junction, refFlat);
    const refOrder = orderedNKeys(refSpokes, refSpokes.map((s) => s.nKey));
    const outSpokes = spokesFrom(junction, outFlat);
    const outOrder = orderedNKeys(outSpokes, refOrder);

    const routes = [...new Set([...junction.values()].map((b) => b.route))];
    let junctionFail = false;

    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const routeA = routes[i];
        const routeB = routes[j];
        const refRel = routePairOrder(refOrder, junction, routeA, routeB);
        const outRel = routePairOrder(outOrder, junction, routeA, routeB);
        if (refRel === outRel || refRel === 'unknown' || outRel === 'unknown') continue;

        if (offlineRef && !hasLargeAngleMismatch(junction, refFlat, outFlat, routeA, routeB, snapDeg)) {
          continue;
        }

        junctionFail = true;
        const flipBranches = [...junction.values()].filter(
          (b) => b.route === routeA || b.route === routeB
        );
        const hintBranch =
          flipBranches
            .filter((b) => outFlat[b.si]?.points?.length === 2)
            .map((b) => ({
              b,
              d: angleDiffDeg(
                leaveAngleFirstStep(refFlat[b.si], b.jHead),
                leaveAngleFirstStep(outFlat[b.si], b.jHead)
              ),
            }))
            .sort((a, c) => c.d - a.d)[0]?.b ?? flipBranches[0];

        violations.push({
          refJunctionKey: jKey,
          outGridApprox: outGridLabel(outFlat, junction),
          branchCount: junction.size,
          routeA,
          routeB,
          refOrder: refRel,
          outOrder: outRel,
          fixHint: hintBranch
            ? {
                segmentIndex: hintBranch.si,
                route: hintBranch.route,
                junctionGrid: outGridLabel(outFlat, junction),
              }
            : undefined,
        });
      }
    }

    if (junctionFail) continue;
    routePairPass++;

    const refBranchOrder = orderedNKeys(refSpokes, refSpokes.map((s) => s.nKey));
    const outBranchOrder = orderedNKeys(outSpokes, refBranchOrder);
    if (!sameCyclic(refBranchOrder, outBranchOrder)) {
      branchStrict.push({
        refJunctionKey: jKey,
        outGridApprox: outGridLabel(outFlat, junction),
        branchCount: junction.size,
        routes,
      });
    }
  }

  const primaryVerdict = violations.length === 0 ? 'PASS' : 'FAIL';
  return {
    summary: {
      refSegmentCount: refFlat.length,
      outSegmentCount: outFlat.length,
      junctionCountGe3: ge3Keys.length,
      routePairPass,
      routePairFail: ge3Keys.length - routePairPass,
      branchStrictFail: branchStrict.length,
      offlineLatLngMode: offlineRef,
      offlineSnapDeg: offlineRef ? snapDeg : undefined,
      primaryVerdict,
    },
    violations,
    branchStrict: branchStrict.length ? branchStrict : undefined,
    summaryZh:
      primaryVerdict === 'PASS'
        ? `路線對 CCW 環序：${ge3Keys.length} 個分歧點皆一致。`
        : `路線對 CCW 環序：${violations.length} 組路線對順序與讀入骨架不符。`,
    reasonLines: violations.map(formatRoutePairViolationZh),
  };
}
