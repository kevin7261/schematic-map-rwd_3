/**
 * LLM 示意圖佈局核心（瀏覽器 + Node skill 共用）。
 * 優先水平/垂直（HV）；H2–H4 為硬約束。
 */

import { buildSchematicGraph, applyCoordsToSkeleton } from '../schematic/graph.js';
import { countViolations } from '../schematic/repair.js';
import { reinsertBlackStations } from '../schematic/assemble.js';
import { analyzeRoutePairRotation } from '../schematic/routePairRotationCheck.js';
import { buildJunctionTable, spokesFrom, orderedNKeys } from '../schematic/rotationStructure.js';
import { readPt } from '../schematic/input.js';

export const LLM_LAYOUT_SYSTEM_PROMPT = `你是地鐵示意圖（schematic map）佈局引擎。輸入為 connect 骨架圖（節點 + 邊 + 分歧點環序參考）。你的任務是為每個 connect 節點分配整數格網座標 (x, y)。

邊的方向（H1 — 軟目標）：優先水平/垂直（dx=0 或 dy=0）；僅在無法滿足 H2–H4 時才用斜線；HV 邊盡量多。

硬約束：H2 分歧點 branch CCW 環序一致；H3 不同節點不可同格；H4 非相鄰邊不可交叉/重疊。

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

  return {
    meta: {
      connectCount: nodes.length,
      edgeCount: edges.length,
      initialSpan,
      source: 'llmLayoutCore.js',
      ...metaExtra,
    },
    nodes,
    edges,
    junctions,
    output_schema: {
      coords: nodes.map((n) => ({ id: n.id, x: n.initial_grid[0], y: n.initial_grid[1] })),
    },
    _skeletonFlat: skeletonFlat,
    _sections: sections,
    _graphMeta: { spreadCount: graph.spreadCount, dupCollapsed: graph.dupCollapsed },
  };
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

/** 比對 LLM 輸出 vs 讀入初值 initial_grid */
export function computeCoordChanges(payload, coords) {
  const nodes = payload?.nodes || [];
  const changed = [];
  const unchanged = [];
  for (const n of nodes) {
    const id = n.id;
    const [ox, oy] = n.initial_grid || [0, 0];
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

function buildRepairHints(violations, edgeStats) {
  const hints = [];
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
  return hints;
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
    rotationFail,
    ...edgeStats,
  };
  const repairHints = buildRepairHints(violations, edgeStats);
  if (rotationFail && rotation.reasonLines?.length) {
    repairHints.push(...rotation.reasonLines);
  }

  const pass =
    hard.overlaps === 0 &&
    hard.crossings === 0 &&
    hard.clashes === 0 &&
    rotationFail === 0;

  const coordChanges = computeCoordChanges(payload, coords);

  return {
    pass,
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

export function buildLlmUserPrompt(payloadForLlm) {
  return `${LLM_LAYOUT_SYSTEM_PROMPT}\n\n請為以下骨架產生整數格網座標（優先水平/垂直，HV 邊盡量多）。\n\n${JSON.stringify(payloadForLlm, null, 2)}`;
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
