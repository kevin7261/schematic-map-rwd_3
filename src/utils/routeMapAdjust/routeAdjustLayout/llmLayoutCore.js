/**
 * LLM 示意圖佈局核心（瀏覽器 + Node skill 共用）。
 * App 內直接套用 LLM 座標；validateLlmLayoutFromPayload 僅供 CLI 選用。
 */

import { buildSchematicGraph, applyCoordsToSkeleton } from '../schematic/graph.js';
import { countViolations } from '../schematic/repair.js';
import {
  isNodeOnForeignEdge,
  countNodesOnForeignEdge,
} from '../schematic/enforceNoNodeOnForeignEdge.js';
import { reinsertBlackStations } from '../schematic/assemble.js';
import { analyzeRoutePairRotation } from '../schematic/routePairRotationCheck.js';
import { buildJunctionTable, spokesFrom, orderedNKeys } from '../schematic/rotationStructure.js';
import { readPt } from '../schematic/input.js';

export const LLM_LAYOUT_SYSTEM_PROMPT = `你是地鐵示意圖（schematic map）佈局引擎。輸入含 connect 骨架、initial_grid（讀入初值，僅供參考）、initialAnalysis（初值非 HV 邊清單）。

你的任務：輸出新的整數格網座標，使 connect 之間的邊盡量是水平或垂直（dx=0 或 dy=0）。

重要（H1 調整目標）：
- initial_grid 不是答案；若 initialAnalysis.nonHvCount > 0，禁止原封不動回傳 initial_grid。
- 必須移動節點，把 initialAnalysis.nonHvEdges 列出的斜線/斜向邊改成 HV（通常讓兩端點同 x 或同 y）。
- 在 notes 列出你調整了哪些 id 及原因。

硬約束（每一點移動前都會逐點驗證；不通過則保留原位置）：
- 單次移動：|Δx| 不可超過路網寬度 W 的 1/10；|Δy| 不可超過路網高度 H 的 1/10（見 moveLimits）
- 邊的方位不可改變（45°/135° 分隔）：|dx|≥|dy| 的偏水平邊不可變成 |dy|>|dx| 的偏垂直，反之亦然
- 非相鄰 connect 邊不可在內部交叉
- 共線 connect 邊不可重疊（路線不可疊在同一段上）
- 不同 connect 節點不可佔同一格
- connect 端點不可落在「非其入射邊」之路線內部（不可壓他線）

佈局偏好（非硬約束，但請盡量）：
- 平行的水平／垂直段盡量對齊同一格線（同 y 或同 x），讓不同路線可串成共線長直段
- 減少不必要的折點；能共線就不要差 1 格錯開

只輸出 JSON：{"coords":[{"id":0,"x":0,"y":0},...],"notes":""}`;

function keyToName(key) {
  if (key.startsWith('n:')) return key.slice(2);
  return key;
}

/**
 * @param {Array} skeletonFlat connect 骨架（整數格）
 * @param {Array} refAngleFlat 環序參考（通常同 skeletonFlat）
 * @param {Array} [sections] 黑點 sections
 * @param {object} [metaExtra]
 */
export function buildLlmPayloadFromSkeleton(skeletonFlat, refAngleFlat, sections = [], metaExtra = {}) {
  const graph = buildSchematicGraph(skeletonFlat);

  const nodes = graph.nodes.map((nd) => {
    let geo = null;
    for (const ref of nd.refs) {
      const seg = refAngleFlat[ref.si];
      const ndObj = seg?.nodes?.[ref.pi];
      const tags = ndObj?.tags || {};
      const lon = Number(tags.lon ?? ndObj?.lon);
      const lat = Number(tags.lat ?? ndObj?.lat);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        geo = [lon, lat];
        break;
      }
      const [x, y] = readPt(seg?.points?.[ref.pi]);
      if (Math.abs(x) > 90 || Math.abs(y) > 90) {
        geo = [x, y];
        break;
      }
    }
    return {
      id: nd.id,
      key: nd.key,
      name: keyToName(nd.key),
      geo,
      initial_grid: [nd.x, nd.y],
    };
  });

  const edges = graph.edges.map((e) => ({
    id: e.id,
    u: e.u,
    v: e.v,
    routes: [...(e.routes || new Set([e.route_name].filter(Boolean)))],
  }));

  const juncTable = buildJunctionTable(refAngleFlat);
  const junctions = [];
  for (const [jKey, junction] of juncTable) {
    if (junction.branches.size < 3) continue;
    const spokes = spokesFrom(junction, refAngleFlat, refAngleFlat);
    const branchOrderCCW = orderedNKeys(spokes, spokes.map((s) => s.nKey));
    junctions.push({
      junctionKey: jKey,
      junctionName: keyToName(jKey),
      branchOrderCCW,
      branches: spokes.map((s) => ({
        branchKey: s.nKey,
        branchName: keyToName(s.nKey),
        leaveAngleDeg: Math.round((s.ang * 180) / Math.PI),
        routes: s.routes,
      })),
    });
  }

  const xs = nodes.map((n) => n.initial_grid[0]);
  const ys = nodes.map((n) => n.initial_grid[1]);
  const initialSpan = Math.max(
    xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
    1
  );

  const initialAnalysis = buildInitialAnalysis(graph, nodes);
  const moveLimits = computeMoveLimits(nodes.map((n) => n.initial_grid));

  return {
    meta: {
      connectCount: nodes.length,
      edgeCount: edges.length,
      initialSpan,
      initialHvRatio: initialAnalysis.hvRatio,
      initialNonHvCount: initialAnalysis.nonHvCount,
      networkWidth: moveLimits.networkWidth,
      networkHeight: moveLimits.networkHeight,
      source: 'llmLayoutCore.js',
      ...metaExtra,
    },
    nodes,
    edges,
    junctions,
    initialAnalysis,
    moveLimits,
    task: {
      goal: '將斜線/斜向 connect 邊改為水平或垂直（HV）',
      doNotCopyInitialGrid: initialAnalysis.nonHvCount > 0,
      maxDeltaX: moveLimits.maxDeltaX,
      maxDeltaY: moveLimits.maxDeltaY,
      preserveEdgeOrientation: true,
      orientationRule:
        '45°/135° 分隔：|dx|≥|dy| 為偏水平，|dy|>|dx| 為偏垂直；移動後各入射邊不可 H/V 互換',
    },
    output_schema: {
      coords: nodes.map((n) => ({ id: n.id, x: 'integer', y: 'integer' })),
    },
    _skeletonFlat: skeletonFlat,
    _sections: sections,
    _graphMeta: { spreadCount: graph.spreadCount, dupCollapsed: graph.dupCollapsed },
  };
}

/** 依目前 nodes[].initial_grid 建立 initialAnalysis */
export function buildInitialAnalysis(graph, nodes) {
  const initialCoords = nodes.map((n) => n.initial_grid);
  const initialEdgeStats = countEdgeDirections(graph, initialCoords);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const nonHvEdgeDetails = initialEdgeStats.nonHvEdges.map((e) => {
    const u = nodeById.get(e.u);
    const v = nodeById.get(e.v);
    return {
      edgeId: e.edgeId,
      u: e.u,
      v: e.v,
      uName: u?.name,
      vName: v?.name,
      dx: e.dx,
      dy: e.dy,
      kind: e.kind,
      fixHint: `移動「${v?.name || e.v}」或「${u?.name || e.u}」使兩端同 x 或同 y`,
    };
  });
  return {
    hvEdges: initialEdgeStats.hvEdges,
    edgeCount: initialEdgeStats.edgeCount,
    hvRatio: initialEdgeStats.hvRatio,
    nonHvCount: nonHvEdgeDetails.length,
    nonHvEdges: nonHvEdgeDetails.slice(0, 40),
  };
}

/** 下一輪 loop 前：更新 skeleton 與 payload 內 current 初值 */
export function refreshLlmPayloadFromCoords(payload, coords) {
  const graph = buildSchematicGraph(payload._skeletonFlat);
  payload._skeletonFlat = applyCoordsToSkeleton(payload._skeletonFlat, graph, coords);
  const graph2 = buildSchematicGraph(payload._skeletonFlat);
  for (const n of payload.nodes) {
    n.initial_grid = [coords[n.id][0], coords[n.id][1]];
  }
  payload.initialAnalysis = buildInitialAnalysis(graph2, payload.nodes);
  payload.moveLimits = computeMoveLimits(payload.nodes.map((n) => n.initial_grid));
  payload.meta.initialNonHvCount = payload.initialAnalysis.nonHvCount;
  payload.meta.networkWidth = payload.moveLimits.networkWidth;
  payload.meta.networkHeight = payload.moveLimits.networkHeight;
  payload.task.doNotCopyInitialGrid = payload.initialAnalysis.nonHvCount > 0;
  payload.task.maxDeltaX = payload.moveLimits.maxDeltaX;
  payload.task.maxDeltaY = payload.moveLimits.maxDeltaY;
  return payload;
}

/** @returns {Array<[number,number]>} */
export function parseLlmCoords(response, nodeCount) {
  const list = response.coords || response;
  if (!Array.isArray(list)) throw new Error('Response must have coords[] array');
  const coords = Array.from({ length: nodeCount }, () => [0, 0]);
  for (const c of list) {
    const id = Number(c.id);
    if (!Number.isInteger(id) || id < 0 || id >= nodeCount) {
      throw new Error(`Invalid node id ${c.id}`);
    }
    coords[id] = [Math.round(Number(c.x)), Math.round(Number(c.y))];
  }
  for (let i = 0; i < nodeCount; i++) {
    if (coords[i][0] < 0 || coords[i][1] < 0) {
      throw new Error(`Node ${i} has negative coords`);
    }
  }
  return coords;
}

/** 比對 coords vs baseline（預設 payload._originalInitialGrid 或 nodes.initial_grid） */
export function computeCoordChanges(payload, coords, opts = {}) {
  const nodes = payload?.nodes || [];
  const baseline =
    opts.baseline ||
    payload._originalInitialGrid ||
    nodes.map((n) => [...(n.initial_grid || [0, 0])]);
  const changed = [];
  const unchanged = [];
  for (const n of nodes) {
    const id = n.id;
    const [ox, oy] = baseline[id] || [0, 0];
    const [nx, ny] = coords[id] || [ox, oy];
    const item = {
      id,
      name: n.name || keyToName(n.key) || `節點${id}`,
      key: n.key,
      from: [ox, oy],
      to: [nx, ny],
    };
    if (ox === nx && oy === ny) unchanged.push(item);
    else changed.push(item);
  }
  const lines = changed.map(
    (c) => `${c.name}（id ${c.id}）：(${c.from[0]}, ${c.from[1]}) → (${c.to[0]}, ${c.to[1]})`
  );
  return { changed, unchanged, lines, changeCount: changed.length, totalCount: nodes.length };
}

/** @param {{ lines: string[], changeCount: number }} changes */
export function formatCoordChangeSummary(changes, maxLines = 40) {
  if (!changes?.changeCount) {
    return '座標調整：無（全部與讀入初值相同）';
  }
  const head = `座標調整 ${changes.changeCount}/${changes.totalCount} 點：`;
  const body = changes.lines.slice(0, maxLines).join('\n');
  const tail =
    changes.lines.length > maxLines ? `\n…另有 ${changes.lines.length - maxLines} 點未列出` : '';
  return `${head}\n${body}${tail}`;
}

/** 幾何硬約束：不重疊、不交叉、不同格、不壓他線 */
export function geometryConstraintsPass(hard) {
  return (
    (hard?.overlaps ?? 0) === 0 &&
    (hard?.crossings ?? 0) === 0 &&
    (hard?.clashes ?? 0) === 0 &&
    (hard?.onForeignEdge ?? 0) === 0
  );
}

function coordsGeometryOk(graph, coords) {
  return geometryConstraintsPass(countViolations(graph, coords));
}

/** 路網包络（connect 座標 bbox） */
export function computeNetworkBounds(coords) {
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  return {
    minX,
    maxX,
    minY,
    maxY,
    networkWidth: Math.max(maxX - minX, 1),
    networkHeight: Math.max(maxY - minY, 1),
  };
}

/** 單次移動步長上限：水平 ≤ W/10，垂直 ≤ H/10（至少 1 格） */
export function computeMoveLimits(coords) {
  const { networkWidth, networkHeight } = computeNetworkBounds(coords);
  return {
    networkWidth,
    networkHeight,
    maxDeltaX: Math.max(1, Math.floor(networkWidth / 10)),
    maxDeltaY: Math.max(1, Math.floor(networkHeight / 10)),
  };
}

export function moveWithinStepLimit(from, to, limits) {
  if (!limits) return true;
  const dx = Math.abs(to[0] - from[0]);
  const dy = Math.abs(to[1] - from[1]);
  return dx <= limits.maxDeltaX && dy <= limits.maxDeltaY;
}

/**
 * 45° / 135° 方位：|dx|≥|dy| → 偏水平；|dy|>|dx| → 偏垂直。
 * @returns {'horizontal'|'vertical'|null} null = 零長邊
 */
export function edgeDominantOrientation(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx === 0 && ady === 0) return null;
  if (adx >= ady) return 'horizontal';
  return 'vertical';
}

/** 移動 nodeId 後，其所有入射邊的 H/V 占优方位不可改變 */
export function nodeMovePreservesEdgeOrientation(graph, coords, nodeId, newX, newY) {
  for (const e of graph.edges) {
    if (e.isLink) continue;
    if (e.u !== nodeId && e.v !== nodeId) continue;
    const dx0 = coords[e.v][0] - coords[e.u][0];
    const dy0 = coords[e.v][1] - coords[e.u][1];
    let dx1 = dx0;
    let dy1 = dy0;
    if (e.u === nodeId) {
      dx1 = coords[e.v][0] - newX;
      dy1 = coords[e.v][1] - newY;
    } else {
      dx1 = newX - coords[e.u][0];
      dy1 = newY - coords[e.u][1];
    }
    const o0 = edgeDominantOrientation(dx0, dy0);
    const o1 = edgeDominantOrientation(dx1, dy1);
    if (o0 && o1 && o0 !== o1) return false;
  }
  return true;
}

function manhattanDeltas(maxR) {
  const out = [[0, 0]];
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) + Math.abs(dy) === r) out.push([dx, dy]);
      }
    }
  }
  return out;
}

/**
 * 逐點嘗試移動：每移動一點即驗證幾何；不通過則還原該點。
 * 多輪掃描以爭取更多可接受的移動（順序無關時）。
 */
export function applyNodeMovesIncrementally(graph, initialCoords, proposedCoords, opts = {}) {
  const limits = opts.moveLimits ?? computeMoveLimits(initialCoords);
  const coords = initialCoords.map((c) => [c[0], c[1]]);
  const pending = [];
  for (let i = 0; i < coords.length; i++) {
    const tx = proposedCoords[i][0];
    const ty = proposedCoords[i][1];
    if (coords[i][0] !== tx || coords[i][1] !== ty) {
      pending.push({ id: i, to: [tx, ty] });
    }
  }
  const accepted = [];
  const rejectedStep = [];
  const maxPasses = Math.max(pending.length + 8, 8);
  for (let pass = 0; pass < maxPasses && pending.length > 0; pass++) {
    let progress = false;
    const next = [];
    for (const ch of pending) {
      if (coords[ch.id][0] === ch.to[0] && coords[ch.id][1] === ch.to[1]) continue;
      const saved = [coords[ch.id][0], coords[ch.id][1]];
      if (!moveWithinStepLimit(saved, ch.to, limits)) {
        next.push({ ...ch, rejectReason: 'step' });
        continue;
      }
      if (!nodeMovePreservesEdgeOrientation(graph, coords, ch.id, ch.to[0], ch.to[1])) {
        next.push({ ...ch, rejectReason: 'orientation' });
        continue;
      }
      coords[ch.id] = [ch.to[0], ch.to[1]];
      if (coordsGeometryOk(graph, coords)) {
        accepted.push({ id: ch.id, from: saved, to: [ch.to[0], ch.to[1]] });
        progress = true;
      } else {
        coords[ch.id] = saved;
        next.push({ ...ch, rejectReason: 'geometry' });
      }
    }
    pending.length = 0;
    pending.push(...next);
    if (!progress) break;
  }
  for (const ch of pending) {
    if (ch.rejectReason === 'step') rejectedStep.push(ch);
  }
  return {
    coords,
    accepted,
    rejected: pending,
    rejectedStep,
    rejectedStepCount: rejectedStep.length,
    moveLimits: limits,
    acceptedCount: accepted.length,
    rejectedCount: pending.length,
  };
}

/** 壓他線修復：每一步移動都需通過幾何驗證 */
export function repairForeignEdgeIncrementally(graph, coords, opts = {}) {
  const limits = opts.moveLimits ?? computeMoveLimits(coords);
  const maxPasses = opts.maxPasses ?? 96;
  const maxDist = Math.min(
    opts.maxDist ?? 16,
    limits.maxDeltaX,
    limits.maxDeltaY
  );
  const out = coords.map((c) => [c[0], c[1]]);
  const deltas = manhattanDeltas(maxDist);
  let moves = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let n = 0; n < graph.nodes.length; n++) {
      if (!isNodeOnForeignEdge(graph, out, n)) continue;
      const ox = out[n][0];
      const oy = out[n][1];
      let best = null;
      for (const [dx, dy] of deltas) {
        if (dx === 0 && dy === 0) continue;
        const nx = Math.round(ox + dx);
        const ny = Math.round(oy + dy);
        if (!moveWithinStepLimit([ox, oy], [nx, ny], limits)) continue;
        if (!nodeMovePreservesEdgeOrientation(graph, out, n, nx, ny)) continue;
        const saved = [out[n][0], out[n][1]];
        out[n] = [nx, ny];
        const ok = !isNodeOnForeignEdge(graph, out, n) && coordsGeometryOk(graph, out);
        out[n] = saved;
        if (!ok) continue;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (!best || dist < best.dist) best = { nx, ny, dist };
      }
      if (best) {
        out[n] = [best.nx, best.ny];
        moves++;
        improved = true;
      }
    }
    if (!improved) break;
  }

  return { coords: out, moves, remaining: countNodesOnForeignEdge(graph, out) };
}

/** @param {{ accepted: object[], rejected: object[] }} incremental */
export function formatIncrementalApplySummary(incremental, payload, maxLines = 30) {
  const nodeById = new Map((payload?.nodes || []).map((n) => [n.id, n]));
  const lines = [];
  if (incremental?.acceptedCount > 0) {
    lines.push(`已套用 ${incremental.acceptedCount} 點移動（逐點驗證通過）`);
  }
  if (incremental?.rejectedCount > 0) {
    const rej = incremental.rejected.slice(0, maxLines).map((ch) => {
      const n = nodeById.get(ch.id);
      const name = n?.name || `節點${ch.id}`;
      const why =
        ch.rejectReason === 'step'
          ? '超出步長（W/10 或 H/10）'
          : ch.rejectReason === 'orientation'
            ? '方位改變（H/V 互換）'
            : '幾何不通過';
      return `${name}（id ${ch.id}）→ (${ch.to[0]}, ${ch.to[1]}) 未套用（${why}）`;
    });
    const tail =
      incremental.rejected.length > maxLines
        ? `\n…另有 ${incremental.rejected.length - maxLines} 點未列出`
        : '';
    lines.push(`未套用 ${incremental.rejectedCount} 點：\n${rej.join('\n')}${tail}`);
  }
  const limits = incremental?.moveLimits ?? payload?.moveLimits;
  if (limits) {
    lines.push(
      `步長上限：|Δx|≤${limits.maxDeltaX}（W=${limits.networkWidth}），|Δy|≤${limits.maxDeltaY}（H=${limits.networkHeight}）`
    );
  }
  return lines.join('\n\n');
}

/** 逐點驗證後套用 LLM 建議座標（一定產出合法幾何結果） */
export function applyLlmLayoutDirectFromPayload(payload, response, opts = {}) {
  const autoRepairForeign = opts.autoRepairForeign !== false;
  const skeletonFlat = payload._skeletonFlat;
  const sections = payload._sections || [];
  const graph = buildSchematicGraph(skeletonFlat);
  const initialCoords = payload.nodes.map((n) => [...n.initial_grid]);
  const moveLimits = payload.moveLimits ?? computeMoveLimits(initialCoords);
  const proposedCoords = parseLlmCoords(response, graph.nodes.length);
  const incremental = applyNodeMovesIncrementally(graph, initialCoords, proposedCoords, {
    moveLimits,
  });
  let coords = incremental.coords;
  let foreignRep = { moves: 0, remaining: 0 };
  if (autoRepairForeign) {
    foreignRep = repairForeignEdgeIncrementally(graph, coords, { moveLimits });
    coords = foreignRep.coords;
  }
  const optimized = applyCoordsToSkeleton(skeletonFlat, graph, coords);
  const outFull = reinsertBlackStations(optimized, sections);
  const edgeStats = countEdgeDirections(graph, coords);
  const hard = countViolations(graph, coords);
  const coordChanges = computeCoordChanges(payload, coords);
  return {
    coords,
    graph,
    fullFlat: outFull,
    edgeStats,
    coordChanges,
    incremental,
    geometry: { ...hard, pass: geometryConstraintsPass(hard) },
    foreignRep,
  };
}

export function buildGeometryRepairHints(geometry, payload) {
  const hints = [];
  if ((geometry?.onForeignEdge ?? 0) > 0) {
    hints.push(
      `有 ${geometry.onForeignEdge} 個 connect 端點壓在與其無關的路線內部；請移開這些節點，不可讓站點落在非其入射邊的線段上。`
    );
  }
  if ((geometry?.overlaps ?? 0) > 0) {
    hints.push(`有 ${geometry.overlaps} 處路線共線重疊；請錯開平行段或縮短重疊區間。`);
  }
  if ((geometry?.crossings ?? 0) > 0) {
    hints.push(`有 ${geometry.crossings} 處非相鄰邊交叉；請改走 L 形水平/垂直繞行。`);
  }
  if ((geometry?.clashes ?? 0) > 0) {
    hints.push(`有 ${geometry.clashes} 個不同站同格；請把重合節點分到相鄰空格。`);
  }
  const nonHv = payload?.initialAnalysis?.nonHvCount ?? 0;
  if (nonHv > 0) {
    hints.push('同時盡量維持 HV 邊（dx=0 或 dy=0）。');
  }
  return hints;
}

/** 幾何約束驗證（不含環序 / HV 改善門檻） */
export function validateLlmGeometryFromPayload(payload, response, opts = {}) {
  const applied = applyLlmLayoutDirectFromPayload(payload, response, opts);
  const violations = { ...applied.geometry, ...applied.edgeStats };
  const repairHints = buildGeometryRepairHints(applied.geometry, payload);
  return {
    pass: applied.geometry.pass,
    violations,
    repairHints,
    ...applied,
  };
}

export function countEdgeDirections(graph, coords) {
  let hvEdges = 0;
  let diagonalEdges = 0;
  let skewEdges = 0;
  const nonHvEdges = [];
  for (const e of graph.edges) {
    const dx = coords[e.v][0] - coords[e.u][0];
    const dy = coords[e.v][1] - coords[e.u][1];
    if (dx === 0 || dy === 0) {
      hvEdges++;
    } else if (Math.abs(dx) === Math.abs(dy)) {
      diagonalEdges++;
      nonHvEdges.push({ edgeId: e.id, u: e.u, v: e.v, dx, dy, kind: 'diagonal' });
    } else {
      skewEdges++;
      nonHvEdges.push({ edgeId: e.id, u: e.u, v: e.v, dx, dy, kind: 'skew' });
    }
  }
  const edgeCount = graph.edges.length;
  return {
    hvEdges,
    diagonalEdges,
    skewEdges,
    edgeCount,
    hvRatio: edgeCount ? hvEdges / edgeCount : 1,
    nonHvEdges,
  };
}

function buildRepairHints(violations, edgeStats, hvFail) {
  const hints = [];
  if (hvFail) {
    hints.push(hvFail);
    hints.push('不可原封不動回傳 initial_grid；請移動 initialAnalysis.nonHvEdges 涉及的端點，使 dx=0 或 dy=0。');
  }
  if (edgeStats.nonHvEdges.length > 0) {
    hints.push(
      `H1 soft: ${edgeStats.hvEdges}/${edgeStats.edgeCount} edges are HV (${Math.round(edgeStats.hvRatio * 100)}%). Try converting non-HV edges to axis-aligned L-paths where H2–H4 still hold.`
    );
    for (const e of edgeStats.nonHvEdges.slice(0, 8)) {
      hints.push(
        `Edge ${e.edgeId} (node ${e.u}→${e.v}, ${e.kind}): dx=${e.dx} dy=${e.dy}; prefer HV by moving one endpoint to share x or y.`
      );
    }
  }
  if (violations.clashes > 0) {
    hints.push('Multiple nodes share the same grid cell; spread colliding nodes to nearest free cells.');
  }
  if (violations.crossings > 0) {
    hints.push('Non-adjacent edges cross; reroute one edge via L-shaped HV path.');
  }
  if (violations.overlaps > 0) {
    hints.push('Collinear edges overlap; offset parallel corridors or shorten overlapping segments.');
  }
  if ((violations.onForeignEdge ?? 0) > 0) {
    hints.push('Connect nodes sit on unrelated route interiors; move them off foreign edges.');
  }
  return hints;
}

/** 初值有非 HV 邊時，輸出必須改善 HV 或至少移動座標 */
export function checkHvImprovement(payload, report) {
  const initial = payload?.initialAnalysis;
  if (!initial || initial.nonHvCount === 0) {
    return { ok: true, pass: true };
  }
  const initPct = Math.round((initial.hvRatio ?? 0) * 100);
  const outPct = Math.round((report.violations?.hvRatio ?? 0) * 100);
  const improved = (report.violations?.hvRatio ?? 0) > (initial.hvRatio ?? 0);
  const outNonHv =
    report.violations?.nonHvEdges?.length ??
    (report.violations?.diagonalEdges ?? 0) + (report.violations?.skewEdges ?? 0);
  const fewerNonHv = outNonHv < initial.nonHvCount;
  const moved = (report.coordChanges?.changeCount ?? 0) > 0;
  if (improved || fewerNonHv || (report.violations?.hvRatio ?? 0) >= 0.999) {
    return { ok: true, pass: true };
  }
  if (!moved) {
    return {
      ok: true,
      pass: false,
      hvFail: `未調整任何座標，但初值有 ${initial.nonHvCount} 條非 HV 邊（HV ${initPct}%）。請移動節點使邊改為水平/垂直。`,
    };
  }
  return {
    ok: true,
    pass: false,
    hvFail: `HV 未改善（${initPct}% → ${outPct}%），仍有非 HV 邊。請繼續移動 initialAnalysis.nonHvEdges 中的端點。`,
  };
}

/** @param {object} payload 含 _skeletonFlat / _sections */
export function validateLlmLayoutFromPayload(payload, response) {
  const skeletonFlat = payload._skeletonFlat;
  const sections = payload._sections || [];
  const graph = buildSchematicGraph(skeletonFlat);
  const coords = parseLlmCoords(response, graph.nodes.length);
  const hard = countViolations(graph, coords);
  const edgeStats = countEdgeDirections(graph, coords);

  const optimized = applyCoordsToSkeleton(skeletonFlat, graph, coords);
  const refFull = reinsertBlackStations(JSON.parse(JSON.stringify(skeletonFlat)), sections);
  const outFull = reinsertBlackStations(optimized, sections);
  const rotation = analyzeRoutePairRotation(refFull, outFull, {});

  const rotationFail = rotation.summary?.primaryVerdict === 'FAIL' ? 1 : 0;
  const violations = {
    overlaps: hard.overlaps,
    crossings: hard.crossings,
    clashes: hard.clashes,
    onForeignEdge: hard.onForeignEdge,
    rotationFail,
    ...edgeStats,
  };
  const coordChanges = computeCoordChanges(payload, coords);

  const hardPass =
    geometryConstraintsPass(hard) &&
    rotationFail === 0;

  const hvCheck = hardPass ? checkHvImprovement(payload, { violations, coordChanges }) : { pass: true };
  const repairHints = buildRepairHints(violations, edgeStats, hvCheck.hvFail);
  if (rotationFail && rotation.reasonLines?.length) {
    repairHints.push(...rotation.reasonLines);
  }

  const pass = hardPass && hvCheck.pass !== false;

  return {
    pass,
    hardPass,
    hvImprovementPass: hvCheck.pass !== false,
    violations,
    repairHints,
    rotation: rotation.summary,
    coords,
    graph,
    fullFlat: outFull,
    coordChanges,
  };
}

/** 給 LLM 的精簡 payload（不含 skeleton） */
export function stripLlmPayloadForExport(payload) {
  const { _skeletonFlat, _sections, _graphMeta, ...forLlm } = payload;
  void _skeletonFlat;
  void _sections;
  void _graphMeta;
  return forLlm;
}

export function buildLlmUserPrompt(payloadForLlm, loopRound = 0) {
  const nonHv = payloadForLlm?.initialAnalysis?.nonHvCount ?? 0;
  const hvPct = Math.round((payloadForLlm?.initialAnalysis?.hvRatio ?? 0) * 100);
  const taskLines = [
    '請輸出新的整數格網座標（不是複製 initial_grid）。',
    '優先水平/垂直：每條 connect 邊盡量 dx=0 或 dy=0。',
    '硬約束：路線不可重疊、非相鄰邊不可交叉、不同站不可同格、端點不可壓在無關路線上。',
    '步長限制：單次移動 |Δx|≤moveLimits.maxDeltaX（路網寬 W 的 1/10），|Δy|≤moveLimits.maxDeltaY（路網高 H 的 1/10）。',
    '方位限制（45°/135°）：|dx|≥|dy| 的偏水平邊不可變垂直占优；|dy|>|dx| 的偏垂直邊不可變水平占优。',
    '程式會逐點驗證你的建議移動；步長、方位或幾何不通過的點會保留原位置。',
    '整個流程會一輪接一輪重複，直到某一輪完全沒有任何點可以移動為止。',
    '佈局偏好：平行的 H/V 段對齊同一格線（共 y 或共 x），減少 1 格錯開，讓路線可串成長直段。',
  ];
  if (loopRound > 0) {
    taskLines.push(`這是第 ${loopRound + 1} 輪；上一輪已有移動被套用，請繼續改善剩餘非 HV 邊。`);
  }
  if (nonHv > 0) {
    taskLines.push(
      `初值 HV 僅 ${hvPct}%，有 ${nonHv} 條非 HV 邊；請依 initialAnalysis.nonHvEdges 移動端點改為 HV。`,
      '禁止輸出與 initial_grid 完全相同的 coords。'
    );
  }
  return `${LLM_LAYOUT_SYSTEM_PROMPT}\n\n${taskLines.join('\n')}\n\n${JSON.stringify(payloadForLlm, null, 2)}`;
}

export function buildLlmRepairPrompt(payloadForLlm, report) {
  const base = buildLlmUserPrompt(payloadForLlm);
  const violations = JSON.stringify(report.violations ?? {}, null, 2);
  const hints = (report.repairHints ?? []).join('\n');
  return `${base}\n\n上一輪未通過驗證。請只修改有問題的節點座標，其餘節點保持不變，重新輸出完整 coords 陣列。\n\n違規摘要：\n${violations}\n\n修復提示：\n${hints}`;
}

export function buildLlmChatMessages(userPrompt) {
  return [
    { role: 'system', content: LLM_LAYOUT_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}
