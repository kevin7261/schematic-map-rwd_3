/**
 * 🧭 均勻網格捷運路線圖 — HV（水平／垂直）最佳化核心邏輯 (Uniform Grid HV Optimize Core)
 *
 * 目的：把「AI測試」圖層目前隨機漫遊產生的路線（`routes: [{ color, points, stations }]`），
 * 先建 network（完整頂點序列 + edges + topology）；App 寫 hv_payload.json，
 * Cursor Agent 依 skill 回寫 hv_response.json；App 以 `applyHvOptimizeIncrementally`
 * 逐點驗證後預覽。不用 API Key、不用剪貼簿。
 *
 * 【鐵律】座標只能由 Cursor LLM 推理決定；本檔僅含 payload／驗證／套用，不含任何自動求解。
 *
 * 與既有「AI調整」功能（src/utils/routeMapAdjust/routeAdjustLayout/llmLayoutCore.js）
 * 的多輪 LLM＋逐點驗證模式一致，但資料模型完全獨立、更簡單（無站名／地理座標／路線分歧環序）。
 *
 * 幾何交叉判定重用 {@link segmentIntersectionInterior2D}（src/utils/routeSegmentIntersections.js），
 * 車站重新取樣重用 {@link assignRandomStationsToRoutes}（src/utils/dataProcessor.js）。
 */

import { segmentIntersectionInterior2D } from './routeSegmentIntersections.js';
import { isUniformGridTurningPoint, redistributeUniformGridStationsAfterRouteMove } from './dataProcessor.js';
import { mergeHvNetworkKind, routesUseStoredMarkerKinds } from './uniformGridRouteMarkers.js';
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
  const setKind = (k, kind) => {
    kindByKey.set(k, mergeHvNetworkKind(kindByKey.get(k), kind));
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
  const useStoredKinds = routesUseStoredMarkerKinds(routes);
  const routeCountByPoint = computeRouteCountByPoint(routes);
  const kindByKey = useStoredKinds ? null : computeHvPointKindByKey(routes, routeCountByPoint);

  const idByKey = new Map();
  const movablePoints = [];

  const routePointIds = routes.map((route, routeIndex) =>
    (route.points || []).map((p, pointIndex) => {
      const k = pointKey(p);
      let id = idByKey.get(k);
      if (id === undefined) {
        id = movablePoints.length;
        idByKey.set(k, id);
        let kind = 'vertex';
        if (p.markerKind) {
          kind = p.markerKind;
        } else if (kindByKey) {
          kind = kindByKey.get(k) || 'vertex';
        }
        movablePoints.push({
          id,
          x: p.x,
          y: p.y,
          kind,
          routeRefs: [],
        });
      } else if (p.markerKind) {
        movablePoints[id].kind = mergeHvNetworkKind(movablePoints[id].kind, p.markerKind);
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
      goal:
        '平移紅/藍/粉紅拓撲點，使相鄰拓撲點之間的 edge 變成水平或垂直直線（拉直，不是新增轉折）',
      mustImproveHv: true,
      preserveTopology: true,
      applyStrategy:
        '【僅 LLM 推理】沿各路線紅/藍/粉紅的 x、y 座標序列（非 id 序）從中位往外；每步須拉直；同層選增益最大；禁止程式搜格。',
      topologyRule:
        '只可平移紅／藍／粉紅點的 (x,y)；拓撲結構關係不可變：edges 連接、route id 順序、轉乘 id 匯流組合、端點歸屬、id/kind 集合、各紅點相連路線之 360° CCW 環序皆同 payload；不可新增/刪除頂點；相鄰拓撲點之間僅一條直線；黑站不在 network 內；HV 拉直不製造折角；偏水平→水平 HV、偏垂直→垂直 HV、45°→兩者皆可，不可翻向',
    },
    output_schema: { coords: [{ id: 'integer', x: 'integer', y: 'integer' }] },
  };
}

const HV_JUNCTION_ANG_EPS = 1e-5;

function hvNormAngleDiff(a, b) {
  let d = a - b;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}

function hvLeaveAngleFromCoords(j, n) {
  return Math.atan2(n.y - j.y, n.x - j.x);
}

function hvOrderedBranchIds(spokes) {
  const tieOrder = spokes.map((s) => s.branchId);
  const tie = new Map(tieOrder.map((k, i) => [k, i]));
  return spokes
    .slice()
    .sort((a, b) => {
      const d = hvNormAngleDiff(a.ang, b.ang);
      if (Math.abs(d) > HV_JUNCTION_ANG_EPS) return d;
      return (tie.get(a.branchId) ?? 0) - (tie.get(b.branchId) ?? 0);
    })
    .map((s) => s.branchId);
}

function hvSameCyclicOrder(a, b) {
  if (a.length !== b.length || !a.length) return true;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[(start + i) % a.length]) return false;
  }
  return true;
}

/**
 * 各紅點（crossing）相連支線的 360° CCW 環序（branch = 鄰接 id，離開角由 coords 決定）
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{x:number,y:number}[]} coords
 */
export function computeJunctionRotationAtCrossings(payload, coords) {
  const { movablePoints, edges } = payload;
  /** @type {Map<number, { otherId: number, routeIndex: number }[]>} */
  const incident = new Map();

  edges.forEach((e) => {
    for (const jId of [e.fromId, e.toId]) {
      const otherId = e.fromId === jId ? e.toId : e.fromId;
      if (!incident.has(jId)) incident.set(jId, []);
      incident.get(jId).push({ otherId, routeIndex: e.routeIndex });
    }
  });

  /** @type {Object[]} */
  const junctions = [];

  incident.forEach((list, jId) => {
    if (movablePoints[jId]?.kind !== 'crossing') return;

    /** @type {Map<number, { branchId: number, routes: number[] }>} */
    const branchMap = new Map();
    list.forEach(({ otherId, routeIndex }) => {
      if (!branchMap.has(otherId)) {
        branchMap.set(otherId, { branchId: otherId, routes: [] });
      }
      const g = branchMap.get(otherId);
      if (!g.routes.includes(routeIndex)) g.routes.push(routeIndex);
    });

    if (branchMap.size < 2) return;

    const j = coords[jId];
    const spokes = [...branchMap.values()].map((b) => ({
      branchId: b.branchId,
      routes: b.routes,
      ang: hvLeaveAngleFromCoords(j, coords[b.branchId]),
    }));

    junctions.push({
      crossingId: jId,
      x: j.x,
      y: j.y,
      branchCount: spokes.length,
      branchOrderCCW: hvOrderedBranchIds(spokes),
      branches: spokes.map((s) => ({
        neighborId: s.branchId,
        routeIndices: s.routes,
        leaveAngleDeg: Math.round((s.ang * 180) / Math.PI),
      })),
    });
  });

  return junctions.sort((a, b) => a.crossingId - b.crossingId);
}

/**
 * 比對 baseline vs 目前 coords 的紅點 360° 環序
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{x:number,y:number}[]} coords
 * @param {{x:number,y:number}[]} baselineCoords
 */
export function auditCrossingRotationPreservation(payload, coords, baselineCoords) {
  const before = computeJunctionRotationAtCrossings(payload, baselineCoords);
  const after = computeJunctionRotationAtCrossings(payload, coords);
  const afterById = new Map(after.map((j) => [j.crossingId, j]));
  /** @type {Object[]} */
  const violations = [];

  before.forEach((ref) => {
    if (ref.branchCount < 2) return;
    const out = afterById.get(ref.crossingId);
    if (!out) return;
    if (hvSameCyclicOrder(ref.branchOrderCCW, out.branchOrderCCW)) return;
    violations.push({
      code: 'JUNCTION_ROTATION_FLIP',
      crossingId: ref.crossingId,
      x: ref.x,
      y: ref.y,
      beforeOrder: ref.branchOrderCCW,
      afterOrder: out.branchOrderCCW,
    });
  });

  return violations;
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
      junctionRotationAtCrossings: computeJunctionRotationAtCrossings(
        payload,
        payload.movablePoints.map((p) => ({ x: p.x, y: p.y }))
      ),
      junctionRotationDescription:
        '每個紅點（crossing）上，各相連支線依離開該點的第一段方向 CCW 排序；移動後此 360° 環序不可改變（與 validate-junction-rotation 同概念）。',
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
    applyStrategy: {
      order: 'center-out-by-coordinates',
      llmOnly: true,
      routeCoordinateCenters: computeRouteCoordinateCenters(payload),
      movableApplyOrder: computeHvCenterOutApplyOrder(payload),
      rules: payload.task.applyStrategy,
      note: 'movableApplyOrder 依 x/y 座標中位→向外（非 id 拓撲序）；供 LLM 推理參考，App 不程式求解。',
    },
    output_schema: payload.output_schema,
  };
}

/** System prompt：說明角色、拓撲不可變、幾何規則與輸出格式 */
export const HV_OPTIMIZE_SYSTEM_PROMPT = `你是示意圖佈局助手。你會收到一份地鐵風格路線圖的 JSON network payload：
- topology.routeKeypointSequences：每條路線依序經過的 movablePoint id（拓撲骨架，不可改）
- edges：化簡後的路線邊（routeIndex、fromId→toId 連接關係固定；dx/dy/isHv 為目前幾何）
- movablePoints：network 頂點；kind="crossing"＝紅點、"endpoint"＝藍點、"bend"＝粉紅轉折點、"vertex"＝無標記頂點（黑站或直線段中間點，不可平移）

【kind 不可變 — 違反即無效】
- 紅點（crossing）移動後仍是 crossing，絕不可變成 endpoint（藍）或其他 kind
- 藍點（endpoint）移動後仍是 endpoint；粉紅（bend）移動後仍是 bend
- 僅 kind 為 crossing／endpoint／bend 的 id 可改 (x,y)；kind=vertex 的 id 座標必須與 payload 完全相同（不可移動）

【路線幾何語意 — 拉直，不是轉彎】
- network 中相鄰兩個拓撲點（紅/藍/粉紅）之間**只有一條直線**；黑站在線段上，不是路線轉折點
- 平移紅/藍/粉紅的**目的**是讓這些直線段變成水平或垂直（HV），**不是**製造新的折角或 Z 形路徑
- 禁止把原先可共線的段移成非共線；禁止出現「僅為繞過 grid 而新增轉折」的移動
- 拉直時保留所有紅/藍/粉紅頂點，不可刪除或合併

【路線方向不可翻轉 — HV 拉直時必守】
對每條 edge，以移動前 baseline 的 |dx|、|dy| 判定主方向：
- |dx| > |dy|（偏水平）→ 拉直成 HV 後必須是水平線（dy=0），不可變垂直（dx=0）
- |dy| > |dx|（偏垂直）→ 拉直成 HV 後必須是垂直線（dx=0），不可變水平（dy=0）
- |dx| = |dy|（45° 對角）→ 拉直成水平或垂直皆可
已是水平／垂直 HV 的段，移動後須維持同向。若某次平移會讓段翻向 → 該點不可移動，維持原座標。

【套用策略 — 必須由 LLM 在對話中推理完成，禁止程式求解】
下列決策**不得**用 node 腳本、greedy、迴圈搜格、或 App 替 LLM 自動選點；只能在 Cursor 對話中推理後寫入 coords：
1. 沿每條路線紅/藍/粉紅點的 **x 座標序列**與 **y 座標序列**（**不是** id 拓撲順序）：各路線分別取 x、y 各自的中位數為中心，從距中位最近者開始**往外**（|x−medianX|、|y−medianY| 較小者先；同層取 max 較小者）。
2. 每移一點：須使牽動 edges 的 HV 邊數**嚴格增加**（路線變直）；否則該 id **回傳原座標**。
3. 同距中位層多點可移：LLM 選**拉直增益最大**者先移；一點多個合法格：選**拉直最多**者。
4. payload 的 applyStrategy（含 routeCoordinateCenters、movableApplyOrder）僅供 LLM 參考 x/y 中位→向外順序，**不是**程式幫你算座標。
App／validate 腳本只做幾何反驗證（越界、交叉、方向翻轉等），**不**產生或篩選最佳 (x,y)。

【拓撲結構不可改變 — 最高優先，違反即無效】
拓撲結構關係 = 路網的「誰連誰、順序、轉乘歸屬」，不是座標。移動後下列關係必須與 payload 完全相同：
1. 不可新增、刪除任何 network 頂點；不可改變任何點的 kind 或 id；僅 kind 為 crossing／endpoint／bend 者可平移 (x,y)。
2. topology.routeKeypointSequences 中每條路線的 id 序列不可增刪、不可重排、不可合併或拆分。
3. edges 的 fromId→toId 相鄰連接關係固定；你只能改變各 id 的 (x,y)，不能改「誰連誰」。
4. 轉乘匯流固定：同一 crossing id 在移動前後必須仍連接同一組 route；不可把一個轉乘 id 拆成兩個位置，或把兩個不同 id 移到同一座標。
5. **紅點 360° 環序固定**：每個 kind=crossing 的紅點，其相連支線（鄰接 id／路線離開方向）在 360° 上 CCW 排序移動前後必須相同；不可因平移而對調任兩支路線的相對順序（見 payload topology.junctionRotationAtCrossings）。
6. endpoint id 仍為同一路線（段）的起點或終點，不可變成中途匯流角色。
7. 回傳 coords 必須涵蓋所有 movablePoints 的 id；未移動的點請回傳原座標。

任務：平移紅/藍/粉紅，使每條 edge 成為水平（dy=0）或垂直（dx=0）的**直線**，最大化 HV 邊比例；不得產生路線中間的多餘轉折。

幾何規則（務必遵守）：
1. 新座標必須是 [0, meta.gridX] × [0, meta.gridY] 內的非負整數。
2. 任兩個 movablePoints 的新座標不可相同。
3. 同一路線（相同 routeIndex）的邊不可交叉、不可共線重疊。
4. 【禁止新增交叉】不同路線的邊不可產生「原本沒有」的邊內部交叉（即使在整數格點上也不行）。移動前已存在的跨路線邊內部交叉格點才可保留；共用紅點（crossing）的匯合不算邊內部交叉。
5. 儘量把非 HV 邊改成水平或垂直；已是 HV 的邊儘量保持；且須遵守「方向不可翻轉」。
6. 若某點無法在不違反拓撲、幾何與方向鎖定下改善，維持原 (x,y)。

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
    '【重要】topology 固定（拓撲結構關係不可變，含各紅點 360° CCW 環序）；套用順序：各路線紅/藍/粉紅依 x、y 座標序列（非 id 序）從中位往外，每步須使牽動邊 HV 增加否則不動，同層選拉直增益最大。',
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

/** 是否為非 LLM 回覆（鐵律：僅接受 computedBy === "llm"） */
export function isRejectedHvOptimizeNonLlmResponse(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') return true;
  if (responseBody.computedBy !== 'llm') return true;
  if (typeof responseBody.model === 'string' && responseBody.model.toLowerCase().includes('greedy')) {
    return true;
  }
  if (typeof responseBody.notes === 'string' && responseBody.notes.includes('computeResponse')) {
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
 * 同路線：完全不可交叉／共線重疊。
 * 不同路線：不可產生「原本沒有」的邊內部交叉（非整數交點一律禁止；整數格點交叉僅限 baseline 已存在者）。
 *
 * @param {{ routeIndex: number }} edgeA
 * @param {{x:number,y:number}} a1
 * @param {{x:number,y:number}} a2
 * @param {{ routeIndex: number }} edgeB
 * @param {{x:number,y:number}} b1
 * @param {{x:number,y:number}} b2
 * @param {Set<string>} allowedCrossRouteGridKeys - baseline 跨路線邊內部交叉格點 "x,y"
 * @returns {boolean}
 */
function edgesConflict(edgeA, a1, a2, edgeB, b1, b2, allowedCrossRouteGridKeys) {
  const crossPt = segmentIntersectionInterior2D(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y);
  if (crossPt) {
    const sameRoute = edgeA.routeIndex === edgeB.routeIndex;
    if (sameRoute) return true;
    const gx = Math.round(crossPt.x);
    const gy = Math.round(crossPt.y);
    if (Math.abs(crossPt.x - gx) > 1e-9 || Math.abs(crossPt.y - gy) > 1e-9) return true;
    if (!allowedCrossRouteGridKeys.has(`${gx},${gy}`)) return true;
  }
  if (segmentsOverlapCollinear(a1, a2, b1, b2)) return true;
  return false;
}

/** 收集 baseline 上「不同路線、邊內部、整數格點」交叉位置 */
function collectCrossRouteInteriorGridIntersections(edges, coords) {
  const keys = new Set();
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const edgeA = edges[i];
      const edgeB = edges[j];
      if (edgeA.routeIndex === edgeB.routeIndex) continue;
      const a1 = coords[edgeA.fromId];
      const a2 = coords[edgeA.toId];
      const b1 = coords[edgeB.fromId];
      const b2 = coords[edgeB.toId];
      const crossPt = segmentIntersectionInterior2D(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y);
      if (!crossPt) continue;
      const gx = Math.round(crossPt.x);
      const gy = Math.round(crossPt.y);
      if (Math.abs(crossPt.x - gx) > 1e-9 || Math.abs(crossPt.y - gy) > 1e-9) continue;
      keys.add(`${gx},${gy}`);
    }
  }
  return keys;
}

/**
 * 🚦 檢查某條邊（依目前座標）是否與所有其他邊都不衝突 (Validate One Edge Against All Others)
 * @param {Object} edge
 * @param {Object[]} allEdges
 * @param {{x:number,y:number}[]} coords - 依 movablePoints id 索引之目前座標
 * @returns {boolean}
 */
function isEdgeValidAgainstAll(edge, allEdges, coords, allowedCrossRouteGridKeys) {
  const a1 = coords[edge.fromId];
  const a2 = coords[edge.toId];
  for (const other of allEdges) {
    if (other === edge) continue;
    const b1 = coords[other.fromId];
    const b2 = coords[other.toId];
    if (edgesConflict(edge, a1, a2, other, b1, b2, allowedCrossRouteGridKeys)) return false;
  }
  return true;
}

/** @returns {Object|null} 衝突描述；無衝突回 null */
function describeEdgesConflict(edgeA, a1, a2, edgeB, b1, b2, allowedCrossRouteGridKeys) {
  const crossPt = segmentIntersectionInterior2D(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y);
  if (crossPt) {
    if (edgeA.routeIndex === edgeB.routeIndex) {
      return {
        code: 'SAME_ROUTE_CROSS',
        routeIndex: edgeA.routeIndex,
        edgeA: [edgeA.fromId, edgeA.toId],
        edgeB: [edgeB.fromId, edgeB.toId],
      };
    }
    const gx = Math.round(crossPt.x);
    const gy = Math.round(crossPt.y);
    if (Math.abs(crossPt.x - gx) > 1e-9 || Math.abs(crossPt.y - gy) > 1e-9) {
      return {
        code: 'NON_GRID_CROSS',
        routeA: edgeA.routeIndex,
        routeB: edgeB.routeIndex,
        x: crossPt.x,
        y: crossPt.y,
      };
    }
    if (!allowedCrossRouteGridKeys.has(`${gx},${gy}`)) {
      return {
        code: 'NEW_CROSS_ROUTE',
        routeA: edgeA.routeIndex,
        routeB: edgeB.routeIndex,
        grid: `${gx},${gy}`,
      };
    }
  }
  if (segmentsOverlapCollinear(a1, a2, b1, b2)) {
    return {
      code: 'COLLINEAR_OVERLAP',
      routeA: edgeA.routeIndex,
      routeB: edgeB.routeIndex,
    };
  }
  return null;
}

/**
 * @param {number} dx
 * @param {number} dy
 * @returns {'horizontal'|'vertical'|'diagonal45'|null}
 */
function classifySegmentDominantAxis(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx === 0 && ady === 0) return null;
  if (adx > ady) return 'horizontal';
  if (ady > adx) return 'vertical';
  return 'diagonal45';
}

/**
 * @param {number} dx
 * @param {number} dy
 * @returns {'horizontal'|'vertical'|null}
 */
function classifyHvEdgeAxis(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  if (dy === 0 && dx !== 0) return 'horizontal';
  if (dx === 0 && dy !== 0) return 'vertical';
  return null;
}

/** 移動前主方向與拉直後 HV 軸是否衝突（45° 段不檢） */
function violatesHvDirectionPreservation(beforeDx, beforeDy, afterDx, afterDy) {
  const before = classifySegmentDominantAxis(beforeDx, beforeDy);
  if (!before || before === 'diagonal45') return false;
  const afterAxis = classifyHvEdgeAxis(afterDx, afterDy);
  if (!afterAxis) return false;
  return before !== afterAxis;
}

/** @param {Object} v */
function formatHvAuditViolation(v) {
  if (v.message) return v.message;
  if (v.code === 'SAME_ROUTE_CROSS') {
    return `路線 ${v.routeIndex} 自交（邊 ${v.edgeA} × ${v.edgeB}）`;
  }
  if (v.code === 'NEW_CROSS_ROUTE') {
    return `新增跨路線交叉 @ (${v.grid})，路線 ${v.routeA} × ${v.routeB}`;
  }
  if (v.code === 'NON_GRID_CROSS') {
    return `非格點交叉，路線 ${v.routeA} × ${v.routeB} @ (${v.x.toFixed(2)},${v.y.toFixed(2)})`;
  }
  if (v.code === 'COLLINEAR_OVERLAP') {
    return `共線重疊，路線 ${v.routeA} × ${v.routeB}`;
  }
  if (v.code === 'DUPLICATE_COORD') {
    return `id=${v.idA} 與 id=${v.idB} 座標重疊 (${v.x},${v.y})`;
  }
  if (v.code === 'OUT_OF_BOUNDS') {
    return `id=${v.id} 越界 (${v.x},${v.y})`;
  }
  if (v.code === 'MISSING_COORD') {
    return `缺少可移動點 id=${v.id} 的 coords`;
  }
  if (v.code === 'FINGERPRINT_MISMATCH') {
    return 'routesFingerprint 與 payload 不符';
  }
  if (v.code === 'NOT_LLM') {
    return 'computedBy 須為 "llm"';
  }
  if (v.code === 'DIRECTION_FLIP') {
    return `路線 ${v.routeIndex} 邊 ${v.fromId}→${v.toId} 方向翻轉（移動前偏${v.beforeAxis}，拉直後為${v.afterAxis}）`;
  }
  if (v.code === 'JUNCTION_ROTATION_FLIP') {
    return `紅點 id=${v.crossingId} @ (${v.x},${v.y}) 相連路線 360° CCW 環序改變（移動前 [${(v.beforeOrder || []).join(',')}] → 移動後 [${(v.afterOrder || []).join(',')}]）`;
  }
  if (v.code === 'VERTEX_MOVED') {
    return v.message || `id=${v.id} kind=vertex（不可平移）座標被改動`;
  }
  return v.code || '未知違規';
}

/**
 * 🔍 全圖幾何反驗證（不求解，僅 audit）
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{x:number,y:number}[]} coords
 * @param {{ baselineCoords?: {x:number,y:number}[] }} [options]
 */
export function auditHvOptimizeCoords(payload, coords, options = {}) {
  const { edges, meta, movablePoints } = payload;
  const baselineCoords =
    options.baselineCoords || movablePoints.map((p) => ({ x: p.x, y: p.y }));
  const allowedKeys = collectCrossRouteInteriorGridIntersections(edges, baselineCoords);
  /** @type {Object[]} */
  const violations = [];

  coords.forEach((c, id) => {
    if (c.x < 0 || c.x > meta.gridX || c.y < 0 || c.y > meta.gridY) {
      violations.push({
        code: 'OUT_OF_BOUNDS',
        id,
        x: c.x,
        y: c.y,
        message: formatHvAuditViolation({ code: 'OUT_OF_BOUNDS', id, x: c.x, y: c.y }),
      });
    }
    const kind = movablePoints[id]?.kind;
    const base = baselineCoords[id];
    if (kind === 'vertex' && base && (c.x !== base.x || c.y !== base.y)) {
      violations.push({
        code: 'VERTEX_MOVED',
        id,
        message: `id=${id} kind=vertex（不可平移）座標被改動`,
      });
    }
  });

  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      if (coords[i].x === coords[j].x && coords[i].y === coords[j].y) {
        violations.push({
          code: 'DUPLICATE_COORD',
          idA: i,
          idB: j,
          x: coords[i].x,
          y: coords[i].y,
          message: formatHvAuditViolation({
            code: 'DUPLICATE_COORD',
            idA: i,
            idB: j,
            x: coords[i].x,
            y: coords[i].y,
          }),
        });
      }
    }
  }

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const edgeA = edges[i];
      const edgeB = edges[j];
      const raw = describeEdgesConflict(
        edgeA,
        coords[edgeA.fromId],
        coords[edgeA.toId],
        edgeB,
        coords[edgeB.fromId],
        coords[edgeB.toId],
        allowedKeys
      );
      if (raw) {
        violations.push({ ...raw, message: formatHvAuditViolation(raw) });
      }
    }
  }

  edges.forEach((e) => {
    const baseA = baselineCoords[e.fromId];
    const baseB = baselineCoords[e.toId];
    const a = coords[e.fromId];
    const b = coords[e.toId];
    const beforeDx = baseB.x - baseA.x;
    const beforeDy = baseB.y - baseA.y;
    const afterDx = b.x - a.x;
    const afterDy = b.y - a.y;
    if (!violatesHvDirectionPreservation(beforeDx, beforeDy, afterDx, afterDy)) return;
    const beforeAxis = classifySegmentDominantAxis(beforeDx, beforeDy);
    const afterAxis = classifyHvEdgeAxis(afterDx, afterDy);
    violations.push({
      code: 'DIRECTION_FLIP',
      routeIndex: e.routeIndex,
      fromId: e.fromId,
      toId: e.toId,
      beforeAxis: beforeAxis === 'horizontal' ? '水平' : '垂直',
      afterAxis: afterAxis === 'horizontal' ? '水平' : '垂直',
      message: formatHvAuditViolation({
        code: 'DIRECTION_FLIP',
        routeIndex: e.routeIndex,
        fromId: e.fromId,
        toId: e.toId,
        beforeAxis: beforeAxis === 'horizontal' ? '水平' : '垂直',
        afterAxis: afterAxis === 'horizontal' ? '水平' : '垂直',
      }),
    });
  });

  auditCrossingRotationPreservation(payload, coords, baselineCoords).forEach((raw) => {
    violations.push({ ...raw, message: formatHvAuditViolation(raw) });
  });

  const finalEdges = edges.map((e) => {
    const a = coords[e.fromId];
    const b = coords[e.toId];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { ...e, dx, dy, isHv: dx === 0 || dy === 0 };
  });
  const afterKeys = collectCrossRouteInteriorGridIntersections(edges, coords);

  return {
    pass: violations.length === 0,
    violations,
    hvStatsBefore: computeHvStats(edges),
    hvStatsAfter: computeHvStats(finalEdges),
    baselineCrossRouteGridKeys: [...allowedKeys],
    afterCrossRouteGridKeys: [...afterKeys],
    newCrossRouteGridKeys: [...afterKeys].filter((k) => !allowedKeys.has(k)),
  };
}

/** 合併 LLM 提議座標（未提及 id 維持 payload 原座標） */
export function mergeHvOptimizeCoordsFromResponse(payload, responseBody) {
  const n = payload.movablePoints.length;
  const coords = payload.movablePoints.map((p) => ({ x: p.x, y: p.y }));
  (responseBody?.coords || []).forEach((c) => {
    const id = Math.round(Number(c?.id));
    const x = Math.round(Number(c?.x));
    const y = Math.round(Number(c?.y));
    if (Number.isInteger(id) && id >= 0 && id < n && Number.isFinite(x) && Number.isFinite(y)) {
      coords[id] = { x, y };
    }
  });
  return coords;
}

/**
 * 🔍 反驗證 LLM response：提議全圖 + 逐點套用後結果
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {object} responseBody
 * @param {{ routesFingerprint?: string }} [options]
 */
export function auditHvOptimizeResponse(payload, responseBody, options = {}) {
  /** @type {Object[]} */
  const metaViolations = [];

  if (options.routesFingerprint && responseBody?.routesFingerprint !== options.routesFingerprint) {
    metaViolations.push({
      code: 'FINGERPRINT_MISMATCH',
      message: formatHvAuditViolation({ code: 'FINGERPRINT_MISMATCH' }),
    });
  }
  if (isRejectedHvOptimizeNonLlmResponse(responseBody)) {
    metaViolations.push({
      code: 'NOT_LLM',
      message: formatHvAuditViolation({ code: 'NOT_LLM' }),
    });
  }

  const proposedIds = new Set(
    (responseBody?.coords || [])
      .map((c) => Math.round(Number(c?.id)))
      .filter((id) => Number.isInteger(id))
  );
  payload.movablePoints.forEach((p, id) => {
    if (!isHvMovableKind(p.kind)) return;
    if (!proposedIds.has(id)) {
      metaViolations.push({
        code: 'MISSING_COORD',
        id,
        message: formatHvAuditViolation({ code: 'MISSING_COORD', id }),
      });
    }
  });

  const baselineCoords = payload.movablePoints.map((p) => ({ x: p.x, y: p.y }));
  const proposedCoords = mergeHvOptimizeCoordsFromResponse(payload, responseBody);
  const proposed = auditHvOptimizeCoords(payload, proposedCoords, { baselineCoords });
  proposed.violations = proposed.violations.map((v) => ({ ...v, phase: 'proposed' }));

  const applied = applyHvOptimizeIncrementally(payload, responseBody);
  const appliedAudit = auditHvOptimizeCoords(payload, applied.coords, { baselineCoords });
  appliedAudit.violations = appliedAudit.violations.map((v) => ({ ...v, phase: 'applied' }));

  const violations = [...metaViolations, ...proposed.violations, ...appliedAudit.violations];

  return {
    pass: violations.length === 0,
    violations,
    proposed: {
      pass: metaViolations.length === 0 && proposed.pass,
      hvStatsBefore: proposed.hvStatsBefore,
      hvStatsAfter: proposed.hvStatsAfter,
      newCrossRouteGridKeys: proposed.newCrossRouteGridKeys,
    },
    applied: {
      pass: appliedAudit.pass,
      hvStatsBefore: appliedAudit.hvStatsBefore,
      hvStatsAfter: appliedAudit.hvStatsAfter,
      newCrossRouteGridKeys: appliedAudit.newCrossRouteGridKeys,
    },
    incremental: {
      acceptedCount: applied.acceptedCount,
      rejectedCount: applied.rejectedCount,
    },
    auditedAt: Date.now(),
  };
}

/**
 * 📋 組出 coords 回覆格式 (Build Coords Response From Positions)
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
 * 中位數（偶數取中間兩數平均）
 * @param {number[]} arr
 */
function medianOfCoords(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 各路線紅/藍/粉紅點的 x、y 座標序列與中位數（套用順序依座標，非 id 序）
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 */
export function computeRouteCoordinateCenters(payload) {
  const { movablePoints, routePointIds } = payload;
  return routePointIds.map((ids, routeIndex) => {
    const movableOnRoute = [];
    ids.forEach((id) => {
      if (isHvMovableKind(movablePoints[id]?.kind)) movableOnRoute.push(id);
    });
    const xs = movableOnRoute.map((id) => movablePoints[id].x);
    const ys = movableOnRoute.map((id) => movablePoints[id].y);
    const xSequence = [...xs].sort((a, b) => a - b);
    const ySequence = [...ys].sort((a, b) => a - b);
    return {
      routeIndex,
      medianX: medianOfCoords(xs),
      medianY: medianOfCoords(ys),
      xSequence,
      ySequence,
      movableIds: movableOnRoute,
    };
  });
}

/**
 * 各路線紅/藍/粉紅：依 x/y 座標中位→向外之套用順序（非 id 拓撲序）
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @returns {{ id: number, x: number, y: number, centerDistance: number, xDistance: number, yDistance: number }[]}
 */
export function computeHvCenterOutApplyOrder(payload) {
  const { movablePoints } = payload;
  const routeCenters = computeRouteCoordinateCenters(payload);
  /** @type {Map<number, { centerDistance: number, xDistance: number, yDistance: number }>} */
  const distById = new Map();

  routeCenters.forEach(({ medianX, medianY, movableIds }) => {
    if (medianX == null || medianY == null) return;
    movableIds.forEach((id) => {
      const p = movablePoints[id];
      const xDistance = Math.abs(p.x - medianX);
      const yDistance = Math.abs(p.y - medianY);
      const centerDistance = Math.max(xDistance, yDistance);
      const prev = distById.get(id);
      if (
        !prev ||
        centerDistance < prev.centerDistance ||
        (centerDistance === prev.centerDistance && xDistance + yDistance < prev.xDistance + prev.yDistance)
      ) {
        distById.set(id, { centerDistance, xDistance, yDistance });
      }
    });
  });

  return [...distById.entries()]
    .sort(
      (a, b) =>
        a[1].centerDistance - b[1].centerDistance ||
        a[1].xDistance + a[1].yDistance - (b[1].xDistance + b[1].yDistance) ||
        a[0] - b[0]
    )
    .map(([id, d]) => ({
      id,
      x: movablePoints[id].x,
      y: movablePoints[id].y,
      ...d,
    }));
}

function touchingEdgesDirectionOk(touchingEdges, coords, baselineCoords) {
  return touchingEdges.every((e) => {
    const ba = baselineCoords[e.fromId];
    const bb = baselineCoords[e.toId];
    const a = coords[e.fromId];
    const b = coords[e.toId];
    return !violatesHvDirectionPreservation(bb.x - ba.x, bb.y - ba.y, b.x - a.x, b.y - a.y);
  });
}

/**
 * ✅ 逐點驗證並套用 LLM 提議的新座標（僅幾何反驗證，不求解）
 *
 * 依 LLM 回傳的 coords 逐一檢查：越界、重疊、方向翻轉、禁止交叉等。
 * **不**用程式搜尋格點、**不**替 LLM 選最佳位置或排序增益；策略由 LLM 在對話中完成。
 *
 * @param {ReturnType<typeof buildHvOptimizePayload>} payload
 * @param {{ coords?: { id: number, x: number, y: number }[] }} response - LLM 回覆
 */
export function applyHvOptimizeIncrementally(payload, response) {
  const { movablePoints, edges } = payload;
  const n = movablePoints.length;
  const coords = movablePoints.map((p) => ({ x: p.x, y: p.y }));
  const baselineCoords = movablePoints.map((p) => ({ x: p.x, y: p.y }));
  const allowedCrossRouteGridKeys = collectCrossRouteInteriorGridIntersections(edges, coords);

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

    const touchingEdges = edges.filter((e) => e.fromId === id || e.toId === id);
    const saved = coords[id];
    coords[id] = proposal;

    if (!touchingEdgesDirectionOk(touchingEdges, coords, baselineCoords)) {
      coords[id] = saved;
      rejectedCount++;
      continue;
    }

    const ok = touchingEdges.every((edge) =>
      isEdgeValidAgainstAll(edge, edges, coords, allowedCrossRouteGridKeys)
    );

    if (!ok) {
      coords[id] = saved;
      rejectedCount++;
      continue;
    }

    if (auditCrossingRotationPreservation(payload, coords, baselineCoords).length) {
      coords[id] = saved;
      rejectedCount++;
      continue;
    }

    acceptedCount++;
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
    const points = ids.map((id, pointIndex) => {
      const orig = route.points?.[pointIndex];
      const kind = orig?.markerKind ?? payload.movablePoints[id]?.kind ?? 'vertex';
      return {
        x: coords[id].x,
        y: coords[id].y,
        markerKind: kind,
      };
    });
    const oldPlain = (route.points || []).map((p) => ({ x: p.x, y: p.y }));
    const newPlain = points.map((p) => ({ x: p.x, y: p.y }));
    const stations = redistributeUniformGridStationsAfterRouteMove(
      oldPlain,
      newPlain,
      route.stations || []
    );
    return { color: route.color, points, stations };
  });
}
