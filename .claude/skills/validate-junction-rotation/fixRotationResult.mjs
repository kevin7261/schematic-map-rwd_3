#!/usr/bin/env node
/**
 * 最小校正：只改單一 branch 的 far 端點（不 sync 共用 connect）。
 * 預設修正 export_row_index 47 @ (44,16)–(46,16) 中和新蘆支線。
 *
 * Usage:
 *   node fixRotationResult.mjs skeleton.json result.json [--in-place]
 *   node fixRotationResult.mjs skeleton.json result.json --row 47 --in-place
 */

import fs from 'fs';

const key6 = (x, y) => `${Number(x).toFixed(6)},${Number(y).toFixed(6)}`;
const readPt = (p) => [Number(p[0]), Number(p[1])];

function leaveAngleFirstStep(seg, jHead) {
  const pts = seg.points;
  const [jx, jy] = readPt(pts[jHead ? 0 : pts.length - 1]);
  const [ox, oy] = readPt(pts[jHead ? 1 : pts.length - 2]);
  return Math.atan2(oy - jy, ox - jx);
}

function geojsonToFlat(fc) {
  return (fc.features || [])
    .filter((f) => f.geometry?.type === 'LineString')
    .map((f, fi) => ({
      fi,
      row: f.properties?.export_row_index ?? fi,
      route_name: String(f.properties?.tags?.route_name || f.properties?.name || '').trim(),
      points: f.geometry.coordinates.map((c) => [Number(c[0]), Number(c[1])]),
    }));
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
    add(key6(pts[0][0], pts[0][1]), key6(pts.at(-1)[0], pts.at(-1)[1]), flat[si].route_name, si, true);
    add(key6(pts.at(-1)[0], pts.at(-1)[1]), key6(pts[0][0], pts[0][1]), flat[si].route_name, si, false);
  }
  return junctions;
}

function orderedNKeys(spokes, tieOrder) {
  const tie = new Map(tieOrder.map((k, i) => [k, i]));
  const sorted = spokes.slice().sort((a, b) => {
    const d = a.ang - b.ang;
    if (Math.abs(d) > 1e-5) return d;
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

function computeWedgeTarget(refFlat, outFlat, targetSi) {
  const junctions = buildJunctionTable(refFlat);
  for (const [, junction] of junctions) {
    const branch = [...junction.values()].find((b) => b.si === targetSi);
    if (!branch) continue;

    const refSpokes = [...junction.values()].map((b) => ({
      ...b,
      ang: leaveAngleFirstStep(refFlat[b.si], b.jHead),
    }));
    const refOrder = orderedNKeys(refSpokes, refSpokes.map((s) => s.nKey));
    const idx = refOrder.indexOf(branch.nKey);
    const prevKey = refOrder[(idx - 1 + refOrder.length) % refOrder.length];
    const nextKey = refOrder[(idx + 1) % refOrder.length];
    const prev = refSpokes.find((s) => s.nKey === prevKey);
    const next = refSpokes.find((s) => s.nKey === nextKey);

    const angPrev = prev ? leaveAngleFirstStep(refFlat[prev.si], prev.jHead) : 0;
    const angNext = next ? leaveAngleFirstStep(refFlat[next.si], next.jHead) : angPrev + Math.PI / 2;
    let d = angNext - angPrev;
    while (d <= 0) d += Math.PI * 2;
    const angMid = angPrev + d / 2;

    const seg = outFlat[targetSi];
    const jIdx = branch.jHead ? 0 : seg.points.length - 1;
    const farIdx = branch.jHead ? seg.points.length - 1 : 0;
    const [jx, jy] = readPt(seg.points[jIdx]);
    const [ox0, oy0] = readPt(seg.points[farIdx]);
    const dist = Math.max(2, Math.hypot(ox0 - jx, oy0 - jy));
    const nx = Math.round(jx + dist * Math.cos(angMid));
    const ny = Math.round(jy + dist * Math.sin(angMid));

    return {
      jKey: [...junctions.keys()].find((k) => junction.has(branch.nKey) || true),
      branch,
      before: [ox0, oy0],
      after: [nx, ny],
      junctionGrid: `${Math.round(jx)},${Math.round(jy)}`,
    };
  }
  return null;
}

/** 還原先前過度 sync 修改的已知座標 */
function restoreOverfitPatches(fc) {
  const lines = fc.features.filter((f) => f.geometry?.type === 'LineString');
  const byRow = new Map(lines.map((f) => [f.properties?.export_row_index, f]));

  const replaceAll = (from, to) => {
    for (const f of lines) {
      for (const c of f.geometry.coordinates) {
        if (c[0] === from[0] && c[1] === from[1]) {
          c[0] = to[0];
          c[1] = to[1];
        }
      }
    }
  };

  replaceAll([51, 28], [46, 32]);
  replaceAll([49, 39], [48, 40]);

  if (byRow.get(8)) byRow.get(8).geometry.coordinates = [[46, 27], [46, 32]];
  if (byRow.get(4)) byRow.get(4).geometry.coordinates = [[46, 38], [48, 40]];
  if (byRow.get(47)) byRow.get(47).geometry.coordinates = [[44, 16], [46, 16]];

  const fixStart = (row, pt) => {
    const f = byRow.get(row);
    if (f?.geometry?.coordinates?.length) {
      f.geometry.coordinates[0] = pt;
    }
  };
  fixStart(49, [54, 14]);
  fixStart(50, [54, 14]);
  const f46 = byRow.get(46);
  if (f46?.geometry?.coordinates?.length) {
    f46.geometry.coordinates[f46.geometry.coordinates.length - 1] = [54, 14];
  }
}

function main() {
  const inPlace = process.argv.includes('--in-place');
  const rowIdx = process.argv.includes('--row')
    ? Number(process.argv[process.argv.indexOf('--row') + 1])
    : 47;
  const args = process.argv.slice(2).filter((a) => a !== '--in-place' && a !== '--row' && a !== String(rowIdx));
  const [refPath, outPath] = args;

  if (!refPath || !outPath) {
    console.error('Usage: node fixRotationResult.mjs skeleton.json result.json [--row 47] [--in-place]');
    process.exit(2);
  }

  const refFc = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const outFc = JSON.parse(fs.readFileSync(outPath, 'utf8'));

  restoreOverfitPatches(outFc);

  const refFlat = geojsonToFlat(refFc).map(({ route_name, points }) => ({ route_name, points }));
  const outFlat = geojsonToFlat(outFc).map(({ route_name, points }) => ({ route_name, points }));

  const targetFlatIdx = geojsonToFlat(outFc).findIndex((s) => s.row === rowIdx);
  if (targetFlatIdx < 0) {
    console.error('export_row_index not found:', rowIdx);
    process.exit(2);
  }

  const wedge = computeWedgeTarget(refFlat, outFlat, targetFlatIdx);
  if (!wedge) {
    console.error('cannot compute wedge for row', rowIdx);
    process.exit(2);
  }

  const seg = outFlat[targetFlatIdx];
  const farIdx = wedge.branch.jHead ? seg.points.length - 1 : 0;
  seg.points[farIdx] = [...wedge.after];

  const lineFeature = outFc.features.filter((f) => f.geometry?.type === 'LineString')[targetFlatIdx];
  lineFeature.geometry.coordinates = seg.points.map((p) => [...p]);

  const outTarget = inPlace ? outPath : outPath.replace(/\.json$/i, '_fixed.json');
  fs.writeFileSync(outTarget, JSON.stringify(outFc, null, 2) + '\n');

  console.log(
    JSON.stringify(
      {
        ok: true,
        exportRowIndex: rowIdx,
        route: wedge.branch.route,
        junctionGrid: wedge.junctionGrid,
        move: `${wedge.before.map(Math.round).join(',')} → ${wedge.after.join(',')}`,
        writtenTo: outTarget,
      },
      null,
      2
    )
  );
}

main();
