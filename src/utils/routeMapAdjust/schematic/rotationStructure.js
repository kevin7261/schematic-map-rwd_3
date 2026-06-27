/**
 * 分歧點 360° 相對順序：以「路線分支」(每 route 一 spoke) 比較，不逐 graph 邊比。
 * 同一路線在分歧點的進／出邊（直通）合併為同一 spoke，避免「A 與 A 對調」假陽性。
 */

const ANG_EPS = 1e-5;

function angAt(graph, coords, nodeId, edgeId) {
  const e = graph.edges[edgeId];
  const other = e.u === nodeId ? e.v : e.u;
  return Math.atan2(coords[other][1] - coords[nodeId][1], coords[other][0] - coords[nodeId][1]);
}

function normAngleDiff(a, b) {
  let d = a - b;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}

function routeKey(graph, eid) {
  const e = graph.edges[eid];
  const rn = String(e?.route_name ?? '').trim();
  return rn || `__edge_${eid}`;
}

/** 每 route 一 spoke；同 route 兩邊約 180° 視為直通，只留一個代表角。 */
function routeSpokesAtNode(graph, coords, n) {
  /** @type {Map<string, { key: string, angs: number[], eids: number[] }>} */
  const byRoute = new Map();
  for (const eid of graph.incident[n]) {
    const key = routeKey(graph, eid);
    const ang = angAt(graph, coords, n, eid);
    let g = byRoute.get(key);
    if (!g) {
      g = { key, angs: [], eids: [] };
      byRoute.set(key, g);
    }
    g.angs.push(ang);
    g.eids.push(eid);
  }

  const spokes = [];
  for (const g of byRoute.values()) {
    let repAng = g.angs[0];
    if (g.angs.length >= 2) {
      const sorted = g.angs.slice().sort((a, b) => a - b);
      const maxGap = g.angs.length === 2
        ? Math.abs(normAngleDiff(g.angs[0], g.angs[1]))
        : 0;
      if (g.angs.length === 2 && maxGap > Math.PI * 0.75) {
        repAng = g.angs[0];
      } else {
        repAng = sorted[0];
      }
    }
    spokes.push({ key: g.key, ang: repAng, eids: g.eids });
  }
  return spokes;
}

function orderedSpokeKeys(graph, coords, n, refKeyOrder) {
  const spokes = routeSpokesAtNode(graph, coords, n);
  const refIdx = new Map(refKeyOrder.map((k, i) => [k, i]));
  return spokes
    .slice()
    .sort((a, b) => {
      const d = normAngleDiff(a.ang, b.ang);
      if (Math.abs(d) > ANG_EPS) return d;
      return (refIdx.get(a.key) ?? 0) - (refIdx.get(b.key) ?? 0);
    })
    .map((s) => s.key);
}

function sameCyclicKeys(a, b) {
  if (a.length !== b.length || !a.length) return true;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[(start + i) % a.length]) return false;
  return true;
}

function nodeLabel(graph, coords, n) {
  const [x, y] = coords[n];
  return `@(${Math.round(x)},${Math.round(y)}) ${graph.incident[n]?.length ?? 0} 向`;
}

function pairLabel(keyA, keyB) {
  const a = keyA.startsWith('__edge_') ? '未命名支線' : `「${keyA}」`;
  const b = keyB.startsWith('__edge_') ? '未命名支線' : `「${keyB}」`;
  return `${a} 與 ${b} 之相對順序對調`;
}

/**
 * @param {object} graph
 * @param {Array<[number,number]>} refCoords
 * @param {Array<[number,number]>} outCoords
 */
export function analyzeRotationStructure(graph, refCoords, outCoords) {
  /** @type {Array<{node:number, refKeys:string[], label:string, pairLabel:string}>} */
  const violations = [];

  for (let n = 0; n < graph.incident.length; n++) {
    if (graph.incident[n].length < 3) continue;

    const refSpokes = routeSpokesAtNode(graph, refCoords, n);
    if (refSpokes.length < 3) continue;

    const refKeys = orderedSpokeKeys(graph, refCoords, n, refSpokes.map((s) => s.key));
    const outKeys = orderedSpokeKeys(graph, outCoords, n, refKeys);
    if (sameCyclicKeys(refKeys, outKeys)) continue;

    let flip = '';
    for (let i = 0; i < refKeys.length && !flip; i++) {
      for (let j = i + 1; j < refKeys.length; j++) {
        const refStep = (j - i + refKeys.length) % refKeys.length;
        const oi = outKeys.indexOf(refKeys[i]);
        const oj = outKeys.indexOf(refKeys[j]);
        if (oi < 0 || oj < 0) continue;
        const outStep = (oj - oi + refKeys.length) % refKeys.length;
        if (refStep !== outStep) {
          flip = pairLabel(refKeys[i], refKeys[j]);
          break;
        }
      }
    }

    violations.push({
      node: n,
      refKeys,
      label: nodeLabel(graph, outCoords, n),
      pairLabel: flip || '路線分支環序對調',
    });
  }

  const reasons = violations.map(
    (v) => `入射方向順序不符：分歧點 ${v.label}；${v.pairLabel}（360° 相對順序與讀入骨架不同）`
  );

  return {
    preserved: violations.length === 0,
    violationCount: violations.length,
    violations,
    reasons,
    summaryZh: violations.length
      ? `偵測到 ${violations.length} 處分歧點路線分支 360° 順序與讀入骨架不符。`
      : '各分歧點路線分支 360° 相對順序與讀入骨架一致。',
  };
}

export function fixRotationStructure(graph, refCoords, outCoords, opts = {}) {
  const maxIter = opts.maxIter ?? 80;
  const coords = outCoords.map((c) => [c[0], c[1]]);
  const moveLines = /** @type {string[]} */ ([]);
  let iterations = 0;

  for (let step = 0; step < maxIter; step++) {
    const check = analyzeRotationStructure(graph, refCoords, coords);
    if (check.preserved) {
      return { ok: true, coords, check, moveLines, iterations };
    }

    const v = check.violations[0];
    const n = v.node;
    const refKeys = v.refKeys;
    const refSpokes = routeSpokesAtNode(graph, refCoords, n);
    const outSpokes = routeSpokesAtNode(graph, coords, n);
    const outByKey = new Map(outSpokes.map((s) => [s.key, s]));

    let misKey = refKeys[0];
    for (let i = 0; i < refKeys.length; i++) {
      for (let j = i + 1; j < refKeys.length; j++) {
        const ia = orderedSpokeKeys(graph, coords, n, refKeys).indexOf(refKeys[i]);
        const ib = orderedSpokeKeys(graph, coords, n, refKeys).indexOf(refKeys[j]);
        const refCCW = (i - j + refKeys.length) % refKeys.length;
        const outCCW = (ia - ib + refKeys.length) % refKeys.length;
        if (outCCW !== refCCW) {
          misKey = refKeys[j];
          break;
        }
      }
    }

    const idx = refKeys.indexOf(misKey);
    const prevKey = refKeys[(idx - 1 + refKeys.length) % refKeys.length];
    const nextKey = refKeys[(idx + 1) % refKeys.length];
    const misSpoke = outByKey.get(misKey);
    if (!misSpoke?.eids?.length) break;

    const eid = misSpoke.eids[0];
    const e = graph.edges[eid];
    const other = e.u === n ? e.v : e.u;
    const prevSpoke = outByKey.get(prevKey);
    const nextSpoke = outByKey.get(nextKey);
    const angPrev = prevSpoke?.ang ?? angAt(graph, coords, n, graph.incident[n][0]);
    const angNext = nextSpoke?.ang ?? angPrev + Math.PI / 2;
    let d = angNext - angPrev;
    while (d <= 0) d += Math.PI * 2;
    const angMid = angPrev + d / 2;

    const dist = Math.max(2, Math.hypot(coords[other][0] - coords[n][0], coords[other][1] - coords[n][1]));
    coords[other] = [
      Math.round(coords[n][0] + dist * Math.cos(angMid)),
      Math.round(coords[n][1] + dist * Math.sin(angMid)),
    ];
    moveLines.push(`結構校正 @${nodeLabel(graph, coords, n)}`);
    iterations++;
  }

  const check = analyzeRotationStructure(graph, refCoords, coords);
  return {
    ok: check.preserved,
    coords,
    check,
    moveLines,
    iterations,
    errorZh: check.preserved ? undefined : `已迭代 ${maxIter} 次仍無法完全恢復路線分支順序。`,
  };
}
