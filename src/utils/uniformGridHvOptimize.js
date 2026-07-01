/**
 * 🧭 均勻網格捷運路線圖 — HV（水平／垂直）最佳化核心邏輯 (Uniform Grid HV Optimize Core)
 *
 * 目的：把「AI測試」圖層目前隨機漫遊產生的路線（`routes: [{ color, points, stations }]`），
 * 先建 network（完整頂點序列 + edges + topology）；App 寫 hv_payload.json，
 * Cursor Agent 依 skill 回寫 hv_response.json；App 以 `applyHvOptimizeIncrementally`
 * 逐點驗證後預覽。不用 API Key、不用剪貼簿、不用本機求解。
 *
 * 與既有「AI調整」功能（src/utils/routeMapAdjust/routeAdjustLayout/llmLayoutCore.js）
 * 的多輪 LLM＋逐點驗證模式一致，但資料模型完全獨立、更簡單（無站名／地理座標／路線分歧環序）。
 *
 * 幾何交叉判定重用 {@link segmentIntersectionInterior2D}（src/utils/routeSegmentIntersections.js），
 * 車站重新取樣重用 {@link assignRandomStationsToRoutes}（src/utils/dataProcessor.js）。
 */

import { segmentIntersectionInterior2D } from './routeSegmentIntersections.js';
import { isUniformGridTurningPoint, redistributeUniformGridStationsAfterRouteMove } from './dataProcessor.js';
import { parseLlmJsonResponse } from './routeMapAdjust/routeAdjustLayout/llmApiClient.js';

/** @typedef {'crossing'|'endpoint'|'bend'|'vertex'} HvPointKind */

/** 紅／藍／粉紅點可平移；其餘頂點（無標記色）固定不動 */
function isHvMovableKind(kind) {
  return kind === 'crossing' || kind === 'endpoint' || kind === 'bend';
}

/** @param {HvPointKind} kind @returns {string} */
function hvKindLabel(kind) {
  if (kind === 'crossing') return '紅點';
  if (kind === 'endpoint') return '藍點';
  if (kind === 'bend') return '粉紅點';
  return '頂點';
}

/** @param {{x:number,y:number}} p @returns {string} */
function pointKey(p) {
  return `${p.x},${p.y}`;
}

/**
 * 🔑 路線指紋：用來判斷 HV 預覽是否仍對應目前這張圖（隨機產生後須清除舊預覽）
 * @param {{ points?: { x: number, y: number }[] }[]} routes
 * @returns {string}
 */
export function fingerprintUniformGridRoutes(routes) {
  if (!Array.isArray(routes) || !routes.length) return '';
  return routes
    .map((r, i) => {
      const pts = r.points || [];
      const a = pts[0];
      const b = pts[pts.length - 1];
      return `${i}:${pts.length}:${a?.x ?? ''},${a?.y ?? ''}:${b?.x ?? ''},${b?.y ?? ''}`;
    })
    .join('|');
}

/**
 * 計算每個座標被幾條路線使用（用來判斷是否為交叉點）
 * @param {{ points: {x:number,y:number}[] }[]} routes
 * @returns {Map<string, number>}
 */
function computeRouteCountByPoint(routes) {
  const routeCountByPoint = new Map();
  routes.forEach((route) => {
    const seen = new Set();
    route.points.forEach((p) => {
      const k = pointKey(p);
      if (seen.has(k)) return;
      seen.add(k);
      routeCountByPoint.set(k, (routeCountByPoint.get(k) || 0) + 1);
    });
  });
  return routeCountByPoint;
}

/**
 * 🎨 依繪製優先序分類頂點色別（粉紅＞藍＞紅，與 GridScalingTab 一致）
 * @param {{ points: {x:number,y:number}[] }[]} routes
 * @param {Map<string, number>} routeCountByPoint
 * @returns {Map<string, HvPointKind>}
 */
export function computeHvPointKindByKey(routes, routeCountByPoint) {
  /** @type {Map<string, HvPointKind>} */
  const kindByKey = new Map();
  const rank = { vertex: 0, crossing: 1, endpoint: 2, bend: 3 };
  const setKind = (k, kind) => {
    const prev = kindByKey.get(k) || 'vertex';
    if (rank[kind] > rank[prev]) kindByKey.set(k, kind);
  };

  routes.forEach((route) => {
    const pts = route.points || [];
    if (!pts.length) return;
    setKind(pointKey(pts[0]), 'endpoint');
    setKind(pointKey(pts[pts.length - 1]), 'endpoint');
    pts.forEach((p, idx) => {
      if (isUniformGridTurningPoint(pts, idx)) setKind(pointKey(p), 'bend');
    });
  });
  routeCountByPoint.forEach((count, k) => {
    if (count > 1) setKind(k, 'crossing');
  });
  return kindByKey;
}

/**
 * 📊 計算邊集合的 HV（水平／垂直）統計 (Compute HV Edge Stats)
 * @param {{ isHv: boolean }[]} edges
 * @returns {{ edgeCount: number, hvEdges: number, hvRatio: number }}
 */
export function computeHvStats(edges) {
  const edgeCount = edges.length;
  const hvEdges = edges.filter((e) => e.isHv).length;
  return { edgeCount, hvEdges, hvRatio: edgeCount > 0 ? hvEdges / edgeCount : 0 };
}

/**
 * 📦 建立 HV 最佳化 payload (Build HV Optimize Payload)
 *
 * 保留各路線完整頂點序列（含粉紅轉折點），座標相同者去重合併為單一 network 節點。
 * 僅 kind 為 crossing／endpoint／bend（紅／藍／粉紅）者可平移；其餘 vertex 頂點固定。
 *
 * @param {{ color: string, points: {x:number,y:number}[] }[]} routes
 * @param {number} gridX
 * @param {number} gridY
 * @returns {{
 *   meta: { gridX: number, gridY: number, routeCount: number, pointCount: number, movableMarkerCount: number, initialHvRatio: number, initialNonHvCount: number },
 *   movablePoints: { id: number, x: number, y: number, kind: HvPointKind, routeRefs: {routeIndex:number, pointIndex:number}[] }[],
 *   edges: { routeIndex: number, fromId: number, toId: number, dx: number, dy: number, isHv: boolean }[],
 *   routePointIds: number[][],
 *   routeKeypointIds: number[][],
 *   task: Object,
 *   output_schema: Object,
 * }}
 */
export function buildHvOptimizePayload(routes, gridX, gridY) {
  const routeCountByPoint = computeRouteCountByPoint(routes);
  const kindByKey = computeHvPointKindByKey(routes, routeCountByPoint);

  const idByKey = new Map();
  const movablePoints = [];

  const routePointIds = routes.map((route, routeIndex) =>
    (route.points || []).map((p, pointIndex) => {
      const k = pointKey(p);
      let id = idByKey.get(k);
      if (id === undefined) {
        id = movablePoints.length;
        idByKey.set(k, id);
        movablePoints.push({
          id,
          x: p.x,
          y: p.y,
          kind: kindByKey.get(k) || 'vertex',
          routeRefs: [],
        });
      }
      movablePoints[id].routeRefs.push({ routeIndex, pointIndex });
      return id;
    })
  );

  const edges = [];
  routePointIds.forEach((ids, routeIndex) => {
    for (let i = 0; i < ids.length - 1; i++) {
      const a = movablePoints[ids[i]];
      const b = movablePoints[ids[i + 1]];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      edges.push({ routeIndex, fromId: ids[i], toId: ids[i + 1], dx, dy, isHv: dx === 0 || dy === 0 });
    }
  });

  const hvStats = computeHvStats(edges);

  return {
    meta: {
      gridX,
      gridY,
      routeCount: routes.length,
      pointCount: movablePoints.length,
      movableMarkerCount: movablePoints.filter((p) => isHvMovableKind(p.kind)).length,
      initialHvRatio: hvStats.hvRatio,
      initialNonHvCount: hvStats.edgeCount - hvStats.hvEdges,
    },
    movablePoints,
    edges,
    routePointIds,
    routeKeypointIds: routePointIds,
    task: {
      goal: '平移 kind 為 crossing／endpoint／bend（紅／藍／粉紅）的點，讓 edges 中 dx=0 或 dy=0 的比例最大化',
      mustImproveHv: true,
      preserveTopology: true,
      topologyRule:
        '只可平移紅／藍／粉紅點的 (x,y)；不可新增/刪除頂點、不可改 kind、不可改每條路線的 id 序列與 edges 連接；黑點車站不在 network 內',
    },
    output_schema: { coords: [{ id: 'integer', x: 'integer', y: 'integer' }] },
  };
}

/**
 * ✂️ 去除內部欄位，產生給 LLM 的精簡 payload (Strip Payload for LLM Export)
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 */
export function stripHvOptimizePayloadForExport(payload) {
  return {
    meta: payload.meta,
    topology: {
      preserveTopology: true,
      routeKeypointSequences: payload.routePointIds,
      description:
        '每條路線依序經過的全部頂點 id 序列（含粉紅轉折）；edges 為相鄰 id 連線。此連接關係不可改變，只能平移 kind=crossing/endpoint/bend 的座標。',
    },
    movablePoints: payload.movablePoints.map(({ id, x, y, kind }) => ({ id, x, y, kind })),
    edges: payload.edges.map(({ routeIndex, fromId, toId, dx, dy, isHv }) => ({
      routeIndex,
      fromId,
      toId,
      dx,
      dy,
      isHv,
    })),
    task: payload.task,
    output_schema: payload.output_schema,
  };
}

/** System prompt：說明角色、拓撲不可變、幾何規則與輸出格式 */
export const HV_OPTIMIZE_SYSTEM_PROMPT = `你是示意圖佈局助手。你會收到一份地鐵風格路線圖的 JSON network payload：
- topology.routeKeypointSequences：每條路線依序經過的 movablePoint id（拓撲骨架，不可改）
- edges：化簡後的路線邊（routeIndex、fromId→toId 連接關係固定；dx/dy/isHv 為目前幾何）
- movablePoints：network 頂點；kind="crossing"＝紅點、"endpoint"＝藍點、"bend"＝粉紅轉折點、"vertex"＝無標記頂點（不可平移）

【拓撲結構不可改變 — 最高優先，違反即無效】
1. 不可新增、刪除任何 network 頂點；不可改變任何點的 kind 或 id；僅 kind 為 crossing／endpoint／bend 者可平移。
2. topology.routeKeypointSequences 中每條路線的 id 序列不可增刪、不可重排、不可合併或拆分。
3. edges 的 fromId→toId 相鄰連接關係固定；你只能改變各 id 的 (x,y) 座標，不能改「誰連誰」。
4. 回傳 coords 必須涵蓋所有 movablePoints 的 id；未移動的點請回傳原座標。

任務：在完全保留上述拓撲的前提下，平移 movablePoints，讓 edges 中水平（dy=0）或垂直（dx=0）的邊盡量多。

幾何規則（務必遵守）：
1. 新座標必須是 [0, meta.gridX] × [0, meta.gridY] 內的非負整數。
2. 任兩個 movablePoints 的新座標不可相同。
3. 同一路線（相同 routeIndex）的邊不可交叉、不可共線重疊。
4. 不同路線的邊若相交，交點必須在整數格點上。
5. 儘量把非 HV 邊改成水平或垂直；已是 HV 的邊儘量保持。
6. 若某點無法在不違反拓撲與幾何下改善，維持原 (x,y)。

只回傳 JSON，不要有其他文字。格式：
{"coords": [{"id": 0, "x": 0, "y": 0}, ...], "notes": "可省略"}`

/**
 * ✍️ 組出使用者 prompt（含目前 payload JSON） (Build User Prompt)
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {number} roundIndex - 0-based 回合序號
 * @returns {string}
 */
export function buildHvOptimizeUserPrompt(payload, roundIndex) {
  const stripped = stripHvOptimizePayloadForExport(payload);
  const hvBefore = stripped.edges.length - stripped.meta.initialNonHvCount;
  return [
    `第 ${roundIndex + 1} 輪。`,
    `目前 HV 邊 ${hvBefore}/${stripped.edges.length}（比例 ${(stripped.meta.initialHvRatio * 100).toFixed(1)}%）。`,
    '【重要】topology.routeKeypointSequences 與 edges 的連接關係不可改變；只能平移 movablePoints 座標以提升 HV。',
    '請針對下列 network payload 提出新座標：',
    '```json',
    JSON.stringify(stripped),
    '```',
  ].join('\n');
}

/**
 * 💬 組出 chat messages (Build Chat Messages)
 * @param {string} userPrompt
 * @returns {{role:string, content:string}[]}
 */
export function buildHvOptimizeChatMessages(userPrompt) {
  return [
    { role: 'system', content: HV_OPTIMIZE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 📋 組出貼到 Cursor 的完整 prompt（System + User，單一文字）
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {number} roundIndex
 */
export function buildHvOptimizeCursorExportText(payload, roundIndex) {
  return [
    '【依 ai-test-hv-optimize skill — 拓撲不可變】',
    '請只回傳 JSON：{"coords":[{"id":0,"x":0,"y":0},...],"notes":"可省略"}',
    '',
    '=== System ===',
    HV_OPTIMIZE_SYSTEM_PROMPT,
    '',
    '=== User ===',
    buildHvOptimizeUserPrompt(payload, roundIndex),
  ].join('\n');
}

/**
 * 解析 Cursor LLM 回覆 JSON
 * @param {string} text
 */
export function parseHvOptimizeLlmResponse(text) {
  const parsed = parseLlmJsonResponse(text);
  if (!parsed || !Array.isArray(parsed.coords)) {
    throw new Error('LLM 回覆須含 coords 陣列');
  }
  return parsed;
}

/** 從 Agent 回覆 JSON 解析可顯示的 model／計算來源標籤 */
export function resolveHvOptimizeModelLabel(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') return null;
  if (typeof responseBody.model === 'string' && responseBody.model.trim()) {
    return responseBody.model.trim();
  }
  if (responseBody.computedBy === 'llm') {
    return 'Cursor Agent（LLM）';
  }
  if (typeof responseBody.notes === 'string' && responseBody.notes.trim()) {
    return responseBody.notes.trim();
  }
  return null;
}

/** 是否為已停用的非 LLM（greedy／腳本）回覆 */
export function isRejectedHvOptimizeNonLlmResponse(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') return false;
  if (responseBody.computedBy === 'greedy-local') return true;
  if (typeof responseBody.notes === 'string' && responseBody.notes.includes('computeResponse')) {
    return true;
  }
  if (typeof responseBody.model === 'string' && responseBody.model.includes('greedy')) {
    return true;
  }
  return false;
}

/**
 * 🔀 判斷兩線段是否幾何上平行共線且區間重疊 (Check Collinear Overlap Between Two Segments)
 * @param {{x:number,y:number}} a1
 * @param {{x:number,y:number}} a2
 * @param {{x:number,y:number}} b1
 * @param {{x:number,y:number}} b2
 * @returns {boolean}
 */
function segmentsOverlapCollinear(a1, a2, b1, b2) {
  const EPS = 1e-9;
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) > EPS) return false; // 不平行

  const cross2 = (b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x;
  if (Math.abs(cross2) > EPS) return false; // 平行但不共線

  const len1sq = d1x * d1x + d1y * d1y;
  if (len1sq < EPS) return false;
  const project = (px, py) => ((px - a1.x) * d1x + (py - a1.y) * d1y) / len1sq;

  const tB0 = project(b1.x, b1.y);
  const tB1 = project(b2.x, b2.y);
  const loB = Math.min(tB0, tB1);
  const hiB = Math.max(tB0, tB1);
  const overlap = Math.min(1, hiB) - Math.max(0, loB);
  return overlap > EPS;
}

/**
 * 🚧 判斷兩條邊（依目前座標）是否互相衝突 (Check if Two Edges Conflict)
 * 同路線：完全不可交叉／共線重疊；不同路線：只有非整數格點交叉、或任何共線重疊才算衝突。
 *
 * @param {{ routeIndex: number }} edgeA
 * @param {{x:number,y:number}} a1
 * @param {{x:number,y:number}} a2
 * @param {{ routeIndex: number }} edgeB
 * @param {{x:number,y:number}} b1
 * @param {{x:number,y:number}} b2
 * @returns {boolean}
 */
function edgesConflict(edgeA, a1, a2, edgeB, b1, b2) {
  const crossPt = segmentIntersectionInterior2D(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y);
  if (crossPt) {
    const sameRoute = edgeA.routeIndex === edgeB.routeIndex;
    if (sameRoute) return true; // 同路線完全不可交叉
    if (!Number.isInteger(crossPt.x) || !Number.isInteger(crossPt.y)) return true; // 不同路線僅允許格點交叉
  }
  if (segmentsOverlapCollinear(a1, a2, b1, b2)) return true; // 任何共線重疊都不允許
  return false;
}

/**
 * 🚦 檢查某條邊（依目前座標）是否與所有其他邊都不衝突 (Validate One Edge Against All Others)
 * @param {Object} edge
 * @param {Object[]} allEdges
 * @param {{x:number,y:number}[]} coords - 依 movablePoints id 索引之目前座標
 * @returns {boolean}
 */
function isEdgeValidAgainstAll(edge, allEdges, coords) {
  const a1 = coords[edge.fromId];
  const a2 = coords[edge.toId];
  for (const other of allEdges) {
    if (other === edge) continue;
    const b1 = coords[other.fromId];
    const b2 = coords[other.toId];
    if (edgesConflict(edge, a1, a2, other, b1, b2)) return false;
  }
  return true;
}

/** @param {Object[]} edges @param {{x:number,y:number}[]} coords */
function countHvEdges(edges, coords) {
  return edges.reduce((n, e) => {
    const a = coords[e.fromId];
    const b = coords[e.toId];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return n + (dx === 0 || dy === 0 ? 1 : 0);
  }, 0);
}

/**
 * 為單一關鍵點產生 HV 對齊候選座標 (Generate HV Alignment Candidates for One Keypoint)
 * @param {number} id
 * @param {{x:number,y:number}[]} coords
 * @param {Object[]} edges
 * @param {{ gridX: number, gridY: number }} meta
 * @returns {{ x: number, y: number }[]}
 */
function generateHvAlignCandidatesForPoint(id, coords, edges, meta) {
  const candidates = new Map();
  const add = (x, y) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx < 0 || rx > meta.gridX || ry < 0 || ry > meta.gridY) return;
    candidates.set(`${rx},${ry}`, { x: rx, y: ry });
  };

  const self = coords[id];
  add(self.x, self.y);

  edges.forEach((edge) => {
    if (edge.fromId !== id && edge.toId !== id) return;
    const otherId = edge.fromId === id ? edge.toId : edge.fromId;
    const other = coords[otherId];
    const dx = other.x - self.x;
    const dy = other.y - self.y;
    if (dx === 0 || dy === 0) return;
    add(self.x, other.y);
    add(other.x, self.y);
  });

  return [...candidates.values()];
}

/**
 * 檢查單一點是否可移到 proposal (Validate a Single Point Move)
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{x:number,y:number}[]} coords
 * @param {number} id
 * @param {{x:number,y:number}} proposal
 */
function canMoveHvOptimizePoint(payload, coords, id, proposal) {
  const { edges, meta } = payload;
  const n = coords.length;
  if (id < 0 || id >= n) return false;
  if (
    proposal.x < 0 ||
    proposal.x > meta.gridX ||
    proposal.y < 0 ||
    proposal.y > meta.gridY
  ) {
    return false;
  }
  if (coords.some((c, otherId) => otherId !== id && c.x === proposal.x && c.y === proposal.y)) {
    return false;
  }

  const testCoords = coords.map((c) => ({ ...c }));
  testCoords[id] = { x: proposal.x, y: proposal.y };
  const touchingEdges = edges.filter((e) => e.fromId === id || e.toId === id);
  return touchingEdges.every((edge) => isEdgeValidAgainstAll(edge, edges, testCoords));
}

/**
 * 🎯 本機貪婪 HV 最佳化：一輪內逐點嘗試 HV 對齊候選 (Greedy Local HV Optimize, One Round)
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @returns {{ coords: {x:number,y:number}[], changed: boolean }}
 */
export function runGreedyHvOptimizeRound(payload) {
  const { edges, meta } = payload;
  const coords = payload.movablePoints.map((p) => ({ x: p.x, y: p.y }));
  let changed = false;

  for (let id = 0; id < coords.length; id++) {
    if (!isHvMovableKind(payload.movablePoints[id]?.kind)) continue;
    const current = coords[id];
    const candidates = generateHvAlignCandidatesForPoint(id, coords, edges, meta);
    let best = current;
    let bestHv = countHvEdges(edges, coords);

    candidates.forEach((candidate) => {
      if (candidate.x === current.x && candidate.y === current.y) return;
      if (!canMoveHvOptimizePoint(payload, coords, id, candidate)) return;
      const testCoords = coords.map((c) => ({ ...c }));
      testCoords[id] = candidate;
      const hv = countHvEdges(edges, testCoords);
      if (hv > bestHv) {
        best = candidate;
        bestHv = hv;
      }
    });

    if (best.x !== current.x || best.y !== current.y) {
      coords[id] = best;
      changed = true;
    }
  }

  return { coords, changed };
}

/**
 * 📋 組出本機最佳化後的 coords 回覆格式 (Build Coords Response From Positions)
 * @param {{x:number,y:number}[]} coords
 */
export function buildHvOptimizeCoordsResponse(coords) {
  return {
    coords: coords.map((c, id) => ({ id, x: c.x, y: c.y })),
  };
}

/**
 * 📊 建立座標變更報告（含相連路線顏色） (Build Coordinate Change Report With Route Colors)
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{ color: string }[]} routes
 * @param {{x:number,y:number}[]} beforeCoords
 * @param {{x:number,y:number}[]} afterCoords
 * @param {ReturnType<typeof computeHvStats>} hvStatsBefore
 * @param {ReturnType<typeof computeHvStats>} hvStatsAfter
 */
export function buildHvOptimizeChangeReport(
  payload,
  routes,
  beforeCoords,
  afterCoords,
  hvStatsBefore,
  hvStatsAfter
) {
  const changes = payload.movablePoints
    .map((p, id) => {
      if (!isHvMovableKind(p.kind)) return null;
      const from = beforeCoords[id];
      const to = afterCoords[id];
      if (from.x === to.x && from.y === to.y) return null;
      const routeIndices = [...new Set(p.routeRefs.map((r) => r.routeIndex))];
      const routeColors = routeIndices.map((ri) => routes[ri]?.color || '#666666');
      return {
        id,
        kind: p.kind,
        kindLabel: hvKindLabel(p.kind),
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        routeColors,
        routeIndices,
      };
    })
    .filter(Boolean);

  const beforePct = Math.round(hvStatsBefore.hvRatio * 100);
  const afterPct = Math.round(hvStatsAfter.hvRatio * 100);
  const head = `HV 邊 ${hvStatsAfter.hvEdges}/${hvStatsAfter.edgeCount}（${beforePct}% → ${afterPct}%）`;

  return {
    changeCount: changes.length,
    changes,
    changeSummary: changes.length
      ? [
          head,
          ...changes.map(
            (c) =>
              `${c.kindLabel} id=${c.id}：(${c.from.x},${c.from.y}) → (${c.to.x},${c.to.y})  路線 ${c.routeColors.join(' ')}`
          ),
        ].join('\n')
      : `${head}\n座標調整：無（已達目前可安全移動的最佳狀態）`,
    hvStatsBefore,
    hvStatsAfter,
  };
}

/**
 * ✅ 逐點驗證並套用 LLM 提議的新座標 (Validate and Apply Proposed Coordinates, Point by Point)
 *
 * 依 id 順序逐一嘗試套用提議座標；每個點暫時套用後，重新檢查所有「牽動到它」的邊是否仍
 * 合法（不越界、不與其他點重疊、不造成禁止的交叉／共線重疊）；不合法就回滾該點（僅此一點），
 * 其餘已套用的點維持不變，再繼續處理下一個點。
 *
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{ coords?: { id: number, x: number, y: number }[] }} response - LLM 回覆
 * @returns {{
 *   coords: {x:number,y:number}[],
 *   acceptedCount: number,
 *   rejectedCount: number,
 *   hvStatsBefore: ReturnType<typeof computeHvStats>,
 *   hvStatsAfter: ReturnType<typeof computeHvStats>,
 *   finalEdges: Object[],
 * }}
 */
export function applyHvOptimizeIncrementally(payload, response) {
  const { movablePoints, edges } = payload;
  const n = movablePoints.length;
  const coords = movablePoints.map((p) => ({ x: p.x, y: p.y }));

  const proposedById = new Map();
  (response?.coords || []).forEach((c) => {
    const id = Math.round(Number(c?.id));
    const x = Math.round(Number(c?.x));
    const y = Math.round(Number(c?.y));
    if (Number.isInteger(id) && id >= 0 && id < n && Number.isFinite(x) && Number.isFinite(y)) {
      proposedById.set(id, { x, y });
    }
  });

  let acceptedCount = 0;
  let rejectedCount = 0;

  for (let id = 0; id < n; id++) {
    if (!isHvMovableKind(movablePoints[id]?.kind)) continue;
    const proposal = proposedById.get(id);
    if (!proposal) continue;
    const original = coords[id];
    if (proposal.x === original.x && proposal.y === original.y) continue;

    if (
      proposal.x < 0 ||
      proposal.x > payload.meta.gridX ||
      proposal.y < 0 ||
      proposal.y > payload.meta.gridY
    ) {
      rejectedCount++;
      continue;
    }

    const collision = coords.some(
      (c, otherId) => otherId !== id && c.x === proposal.x && c.y === proposal.y
    );
    if (collision) {
      rejectedCount++;
      continue;
    }

    const saved = coords[id];
    coords[id] = proposal;

    const touchingEdges = edges.filter((e) => e.fromId === id || e.toId === id);
    const ok = touchingEdges.every((edge) => isEdgeValidAgainstAll(edge, edges, coords));

    if (ok) {
      acceptedCount++;
    } else {
      coords[id] = saved;
      rejectedCount++;
    }
  }

  const finalEdges = edges.map((e) => {
    const a = coords[e.fromId];
    const b = coords[e.toId];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { ...e, dx, dy, isHv: dx === 0 || dy === 0 };
  });

  return {
    coords,
    acceptedCount,
    rejectedCount,
    hvStatsBefore: computeHvStats(edges),
    hvStatsAfter: computeHvStats(finalEdges),
    finalEdges,
  };
}

/**
 * 🔁 用上一輪結果更新 payload，供下一輪 LLM 呼叫使用 (Refresh Payload From Applied Coords)
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{x:number,y:number}[]} coords
 * @returns {ReturnType<typeof buildHvOptimizePayload>}
 */
export function refreshHvOptimizePayloadFromCoords(payload, coords) {
  const movablePoints = payload.movablePoints.map((p, id) => ({
    ...p,
    x: coords[id].x,
    y: coords[id].y,
  }));
  const edges = payload.edges.map((e) => {
    const a = coords[e.fromId];
    const b = coords[e.toId];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { ...e, dx, dy, isHv: dx === 0 || dy === 0 };
  });
  const hvStats = computeHvStats(edges);
  return {
    ...payload,
    movablePoints,
    edges,
    meta: {
      ...payload.meta,
      initialHvRatio: hvStats.hvRatio,
      initialNonHvCount: hvStats.edgeCount - hvStats.hvEdges,
    },
  };
}

/**
 * 🏗️ 用最終座標重建路線（保留全部頂點；黑點依原線段均分） (Rebuild Routes from Optimized Coords)
 *
 * @param {{ color: string, points: {x:number,y:number}[], stations?: {x:number,y:number}[] }[]} routes
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{x:number,y:number}[]} coords
 */
export function rebuildRoutesFromOptimizedKeypoints(routes, payload, coords) {
  const routeIds = payload.routePointIds || payload.routeKeypointIds;
  return routes.map((route, routeIndex) => {
    const ids = routeIds[routeIndex];
    const points = ids.map((id) => ({ x: coords[id].x, y: coords[id].y }));
    const stations = redistributeUniformGridStationsAfterRouteMove(
      route.points || [],
      points,
      route.stations || []
    );
    return { color: route.color, points, stations };
  });
}
