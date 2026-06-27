#!/usr/bin/env node
/**
 * 分歧點 360° 環序驗證：骨架 input vs 佈局 result GeoJSON
 *
 * 主判斷（標準 A）：路線對 CCW 相對順序；角度用 far-end（指向另一端 nKey）
 * 可選 --strict：分支級完整環序（first-step 角，同 rotationStructure.js）
 *
 * Usage:
 *   node checkRotation.mjs skeleton.json result.json [--strict]
 */

import fs from 'fs';

const ANG_EPS = 1e-5;
const key6 = (x, y) => `${Number(x).toFixed(6)},${Number(y).toFixed(6)}`;

const readPt = (p) => [Number(p[0]), Number(p[1])];
const keyToXY = (k) => k.split(',').map(Number);

const normAngleDiff = (a, b) => {
  let d = a - b;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
};

/** 標準 A（骨架 ref）：指向 ref 的 nKey（lat/lng） */
const leaveAngleFarEndRef = (seg, jHead, nKey) => {
  const pts = seg.points;
  if (!pts || pts.length < 2) return 0;
  const [jx, jy] = readPt(pts[jHead ? 0 : pts.length - 1]);
  const [ox, oy] = keyToXY(nKey);
  return Math.atan2(oy - jy, ox - jx);
};

/** 標準 A（結果 out）：指向該 segment 在 out 格網上的另一端（勿混用 ref nKey） */
const leaveAngleFarEndOut = (seg, jHead) => {
  const pts = seg.points;
  if (!pts || pts.length < 2) return 0;
  const [jx, jy] = readPt(pts[jHead ? 0 : pts.length - 1]);
  const [ox, oy] = readPt(pts[jHead ? pts.length - 1 : 0]);
  return Math.atan2(oy - jy, ox - jx);
};

/** 標準 B：離開分歧點的第一段（rotationStructure.js） */
const leaveAngleFirstStep = (seg, jHead) => {
  const pts = seg.points;
  if (!pts || pts.length < 2) return 0;
  const [jx, jy] = readPt(pts[jHead ? 0 : pts.length - 1]);
  const [ox, oy] = readPt(pts[jHead ? 1 : pts.length - 2]);
  return Math.atan2(oy - jy, ox - jx);
};

function geojsonToFlat(fc) {
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

function spokesFromRef(junction, flat) {
  return [...junction.values()].map((b) => ({
    ...b,
    ang: leaveAngleFarEndRef(flat[b.si], b.jHead, b.nKey),
  }));
}

function spokesFromOut(junction, flat) {
  return [...junction.values()].map((b) => ({
    ...b,
    ang: leaveAngleFarEndOut(flat[b.si], b.jHead),
  }));
}

function orderedNKeys(spokes, tieOrder) {
  const tie = new Map(tieOrder.map((k, i) => [k, i]));
  return spokes
    .slice()
    .sort((a, b) => {
      const d = normAngleDiff(a.ang, b.ang);
      if (Math.abs(d) > ANG_EPS) return d;
      return (tie.get(a.nKey) ?? 0) - (tie.get(b.nKey) ?? 0);
    })
    .map((s) => s.nKey);
}

function sameCyclic(a, b) {
  if (a.length !== b.length || !a.length) return true;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[(start + i) % a.length]) return false;
  return true;
}

function uniqueRoutes(junction) {
  return [...new Set([...junction.values()].map((b) => b.route))];
}

function routePairOrder(order, junction, routeA, routeB) {
  const idxA = order.filter((k) => junction.get(k)?.route === routeA);
  const idxB = order.filter((k) => junction.get(k)?.route === routeB);
  if (!idxA.length || !idxB.length) return 'unknown';
  const iA = order.indexOf(idxA[0]);
  const iB = order.indexOf(idxB[0]);
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

function analyze(refFlat, outFlat) {
  const junctions = buildJunctionTable(refFlat);
  const ge3Keys = [...junctions.entries()].filter(([, j]) => j.size >= 3);

  const violations = [];
  const branchStrict = [];
  let routePairPass = 0;

  for (const [jKey, junction] of ge3Keys) {
    const refSpokes = spokesFromRef(junction, refFlat);
    const refOrder = orderedNKeys(refSpokes, refSpokes.map((s) => s.nKey));
    const outSpokes = spokesFromOut(junction, outFlat);
    const outOrder = orderedNKeys(outSpokes, refOrder);

    const routes = uniqueRoutes(junction);
    let junctionFail = false;

    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const routeA = routes[i];
        const routeB = routes[j];
        const refRel = routePairOrder(refOrder, junction, routeA, routeB);
        const outRel = routePairOrder(outOrder, junction, routeA, routeB);
        if (refRel !== outRel && refRel !== 'unknown' && outRel !== 'unknown') {
          junctionFail = true;
          violations.push({
            refJunctionKey: jKey,
            outGridApprox: outGridLabel(outFlat, junction),
            branchCount: junction.size,
            routeA,
            routeB,
            refOrder: refRel,
            outOrder: outRel,
          });
        }
      }
    }

    if (junctionFail) continue;
    routePairPass++;

    const refBranch = [...junction.values()].map((b) => ({
      ...b,
      ang: leaveAngleFirstStep(refFlat[b.si], b.jHead),
    }));
    const refBranchOrder = orderedNKeys(refBranch, refBranch.map((s) => s.nKey));
    const outBranch = [...junction.values()].map((b) => ({
      ...b,
      ang: leaveAngleFirstStep(outFlat[b.si], b.jHead),
    }));
    const outBranchOrder = orderedNKeys(outBranch, refBranchOrder);

    if (!sameCyclic(refBranchOrder, outBranchOrder)) {
      branchStrict.push({
        refJunctionKey: jKey,
        outGridApprox: outGridLabel(outFlat, junction),
        branchCount: junction.size,
        routes,
      });
    }
  }

  return {
    summary: {
      refSegmentCount: refFlat.length,
      outSegmentCount: outFlat.length,
      junctionCountGe3: ge3Keys.length,
      routePairPass,
      routePairFail: ge3Keys.length - routePairPass,
      branchStrictFail: branchStrict.length,
      primaryVerdict: violations.length === 0 ? 'PASS' : 'FAIL',
    },
    violations,
    branchStrict: branchStrict.length ? branchStrict : undefined,
  };
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--strict');
  const strict = process.argv.includes('--strict');
  const [refPath, outPath] = args;

  if (!refPath || !outPath) {
    console.error('Usage: node checkRotation.mjs <skeleton.json> <result.json> [--strict]');
    process.exit(2);
  }

  const refFc = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const outFc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const report = analyze(geojsonToFlat(refFc), geojsonToFlat(outFc));

  if (!strict) delete report.branchStrict;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.primaryVerdict === 'PASS' ? 0 : 1);
}

main();
