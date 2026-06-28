/* eslint-disable no-console */

/**
 * 三個示意圖佈局圖層（Stroke-based／Hill Climbing／MILP）共用輸入。
 *
 * 與三篇論文一致：佈局從**真實地理座標**起步。流程：
 *  1. 自上游 `osm_2_geojson_2_json.geojsonData` 取 flat segments（經緯度）。
 *  2. buildConnectSkeleton：每 section 只留頭尾兩 connect 端點（黑點另存，最後沿邊內插放回）。
 *  3. scaleSkeletonToIntegerGrid：經緯度**等比例**縮放到整數格（uniform scale 保角→拓撲/嵌入不變），
 *     碰撞(兩不同站映到同格)時提高解析度重試。
 *
 * 不再用 v1 的「秩正規化」（會破壞真實比例）。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { syncOrthoFlatSegmentEndpoints } from '@/utils/layers/json_grid_coord_normalized/axisAlignGridNetworkHillClimb.js';
import { SCHEMATIC_SOURCE_LAYER_ID } from './layerIds.js';

export function readPt(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

export function writePt(p, x, y) {
  if (Array.isArray(p)) {
    p[0] = x;
    p[1] = y;
  } else if (p && typeof p === 'object') {
    p.x = x;
    p.y = y;
  }
}

function syncNodeGrid(seg, idx, x, y) {
  const n = seg?.nodes?.[idx];
  if (n && typeof n === 'object') {
    n.tags = { ...(n.tags || {}), x_grid: x, y_grid: y };
  }
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * 從完整 flat segments 建 connect 骨架：connect 端點 + 中段黑點另存 sections。
 *
 * 🔁 connect 由骨架自身拓撲「重算」（不信上游切點）。先以 identity（同名/同 id）合併建拓撲，再判定：
 *   connect = 端點/分歧（degree≠2）或 真實轉乘（具名站且被 ≥2 route 經過）；
 *   其餘 **degree-2 單線直通點**（含一條線被切成多段、接點處重疊的紅點）→ **降為黑點、前後段串接成一條**。
 *   → 真正的共站/分歧/端點才是紅 connect 節點；直通站一律黑點。分支（degree≥3）不收縮；
 *     純環（無任何 connect 邊界）不收縮以保閉合；lollipop 迴圈以「回到起點前一步設邊界」拆成 2 段保環。
 * @returns {{ skeletonFlat:Array, sections:Array }}
 */
export function buildConnectSkeleton(baseFlat) {
  const idAt = (seg, i, nodes) => {
    const [x, y] = readPt(seg.points[i]);
    return nodeIdentity(nodes[i] || null, x, y);
  };
  const isRealId = (id) => id.startsWith('n:') || id.startsWith('s:');
  const addSet = (m, k, v) => { let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } s.add(v); };

  // ---- pass 1: identity 拓撲（相鄰 identity = 鄰居；經過的 route 集合）----
  const nbr = new Map();
  const rts = new Map();
  const keepIds = new Set(); // 🟡 交叉(cross)/🟣 切斷(purple)/connect/terminal：屬骨架節點,即使 degree-2 也不可收縮成黑點
  const blackIds = new Set(); // 🖤 黑點站：單線中間站，永遠不得升級成轉乘分歧（否則他線會被誤接到黑點上）
  for (const seg of baseFlat) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
    const rn = seg.route_name ?? seg.name ?? '';
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const id = idAt(seg, i, nodes);
      addSet(rts, id, rn);
      if (isSkeletonKeepNode(nodes[i])) keepIds.add(id);
      if (isBlackNode(nodes[i])) blackIds.add(id);
      if (prev != null && prev !== id) { addSet(nbr, id, prev); addSet(nbr, prev, id); }
      prev = id;
    }
  }
  // connect = 骨架保留節點（黃/紫/connect/terminal）或 degree≠2（端點/分歧）或 真實轉乘（具名站且 ≥2 route）。
  //   ⚠️ 黑點站例外：黑點是單線中間站，**除非是真正端點（degree≤1）否則一律收縮**——
  //   就算鄰近 snap 讓它度數變 3／被兩條線經過，也不可升級成分歧/轉乘點，否則他線（如紫線）會被誤接到黑點上、改變拓撲。
  const isConn = (id) => {
    if (keepIds.has(id)) return true;
    const deg = nbr.get(id)?.size ?? 0;
    if (blackIds.has(id)) return deg <= 1; // 黑點僅在真正端點才視為邊界，其餘一律收縮成黑點
    return deg !== 2 || (isRealId(id) && (rts.get(id)?.size ?? 0) >= 2);
  };

  // ---- pass 2: 每段於內部 connect 點切成 atom（原子段）----
  const atoms = [];
  for (const seg of baseFlat) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const nodes = Array.isArray(seg.nodes) ? seg.nodes : [];
    const last = pts.length - 1;
    const bset = new Set([0, last]);
    for (let i = 1; i < last; i++) if (isConn(idAt(seg, i, nodes))) bset.add(i);
    const b = [...bset].sort((x, y) => x - y);
    for (let bi = 0; bi + 1 < b.length; bi++) {
      const a = b[bi];
      const c = b[bi + 1];
      atoms.push({
        seg,
        headId: idAt(seg, a, nodes), tailId: idAt(seg, c, nodes),
        headPt: clone(pts[a]), tailPt: clone(pts[c]),
        headNode: clone(nodes[a]), tailNode: clone(nodes[c]),
        blacks: nodes.slice(a + 1, c).map(clone),
        used: false,
      });
    }
  }

  // ---- pass 3: 跨「非 connect 直通接點」串接 atom（重疊紅點 → 黑點、前後段合一）----
  const ends = new Map(); // id -> [{atom, end:'h'|'t'}]
  const pushEnd = (id, atom, end) => { let l = ends.get(id); if (!l) { l = []; ends.set(id, l); } l.push({ atom, end }); };
  for (const at of atoms) { pushEnd(at.headId, at, 'h'); pushEnd(at.tailId, at, 't'); }

  const mkBoundary = (nd) => { const o = clone(nd) || { node_type: 'connect' }; if (o.node_type === 'line' || o.node_type == null) o.node_type = 'connect'; return o; };
  const mkBlack = (nd) => { const o = clone(nd) || { node_type: 'line' }; o.node_type = 'line'; return o; };
  const trav = (at, end) => (end === 'h'
    ? { startId: at.headId, farId: at.tailId, startPt: at.headPt, startNode: at.headNode, farPt: at.tailPt, farNode: at.tailNode, blacks: at.blacks }
    : { startId: at.tailId, farId: at.headId, startPt: at.tailPt, startNode: at.tailNode, farPt: at.headPt, farNode: at.headNode, blacks: at.blacks.slice().reverse() });

  const skeletonFlat = [];
  const sections = [];
  const emit = (startPt, startNode, farPt, farNode, blacks, seg) => {
    skeletonFlat.push({
      route_name: seg?.route_name,
      name: seg?.name,
      points: [startPt, farPt],
      nodes: [mkBoundary(startNode), mkBoundary(farNode)],
      properties_start: clone(seg?.properties_start),
      properties_end: clone(seg?.properties_end),
      way_properties: clone(seg?.way_properties),
    });
    sections.push({ blackNodes: blacks });
  };

  // 自每個 connect 邊界出發，跨非 connect 直通點串接成一條
  for (const start of atoms) {
    for (const startEnd of ['h', 't']) {
      const startId = startEnd === 'h' ? start.headId : start.tailId;
      if (start.used || !isConn(startId)) continue;
      const t0 = trav(start, startEnd);
      const chainStartId = t0.startId;
      const blacks = [];
      let cur = start;
      let ce = startEnd;
      let endPt = t0.farPt;
      let endNode = t0.farNode;
      let guard = 0;
      for (;;) {
        const t = trav(cur, ce);
        cur.used = true;
        for (const bl of t.blacks) blacks.push(bl);
        // 抵達 connect 邊界、或快繞回起點（lollipop）、或防呆 → 收尾
        if (isConn(t.farId) || t.farId === chainStartId || guard++ > atoms.length + 2) {
          endPt = t.farPt; endNode = t.farNode; break;
        }
        blacks.push(mkBlack(t.farNode)); // 直通接點降為黑點
        let cands = (ends.get(t.farId) || []).filter((x) => !x.atom.used);
        if (cands.length !== 1) {
          // 黑點被他線鄰近 snap 而出現多個候選 → 只沿「同一條路線」連續穿過，不接他線。
          const same = cands.filter((x) => sameRoute(x.atom.seg, start.seg));
          if (same.length === 1) cands = same;
          else { endPt = t.farPt; endNode = t.farNode; break; }
        }
        cur = cands[0].atom;
        ce = cands[0].end;
      }
      emit(t0.startPt, t0.startNode, endPt, endNode, blacks, start.seg);
    }
  }
  // 純環（無 connect 邊界）：未串接的 atom 各自成段，保留環不收縮。
  for (const at of atoms) {
    if (at.used) continue;
    at.used = true;
    emit(at.headPt, at.headNode, at.tailPt, at.tailNode, at.blacks, at.seg);
  }
  return { skeletonFlat, sections };
}

/**
 * 把 connect 骨架的經緯度等比例縮放到整數格（就地改寫）。碰撞時提高解析度。
 * @returns {{ scale:number, cols:number, rows:number, connectCount:number, attempts:number }}
 */
export function scaleSkeletonToIntegerGrid(segments, opts = {}) {
  const EPS = 1e-9;
  const okey = (x, y) => `${Math.round(x / EPS)},${Math.round(y / EPS)}`;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const uniqueOrig = new Map(); // okey -> [x,y]
  for (const seg of segments) {
    for (const p of seg.points) {
      const [x, y] = readPt(p);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      uniqueOrig.set(okey(x, y), [x, y]);
    }
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  let target = opts.targetSpan ?? 48; // 期望最長邊的格數起點
  const maxTarget = opts.maxTargetSpan ?? 8192;
  let chosen = null;
  let attempts = 0;
  for (; target <= maxTarget; target *= 2) {
    attempts++;
    const scale = target / Math.max(w, h);
    const cellByOrig = new Map(); // okey -> [X,Y]
    const usedCell = new Map(); // "X,Y" -> okey
    let collision = false;
    for (const [k, [x, y]] of uniqueOrig) {
      const X = Math.round((x - minX) * scale);
      const Y = Math.round((y - minY) * scale);
      const ck = `${X},${Y}`;
      const owner = usedCell.get(ck);
      if (owner !== undefined && owner !== k) {
        collision = true;
        break;
      }
      usedCell.set(ck, k);
      cellByOrig.set(k, [X, Y]);
    }
    if (!collision) {
      chosen = { scale, cellByOrig };
      break;
    }
  }
  if (!chosen) {
    // 極端情況：用最後一次（容許少數重合，硬約束檢查會接手）
    const scale = maxTarget / Math.max(w, h);
    const cellByOrig = new Map();
    for (const [k, [x, y]] of uniqueOrig) {
      cellByOrig.set(k, [Math.round((x - minX) * scale), Math.round((y - minY) * scale)]);
    }
    chosen = { scale, cellByOrig };
  }

  let cols = 0;
  let rows = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.points.length; i++) {
      const [x, y] = readPt(seg.points[i]);
      const [X, Y] = chosen.cellByOrig.get(okey(x, y));
      writePt(seg.points[i], X, Y);
      syncNodeGrid(seg, i, X, Y);
      if (X > cols) cols = X;
      if (Y > rows) rows = Y;
    }
  }
  syncOrthoFlatSegmentEndpoints(segments);
  return {
    scale: chosen.scale,
    cols: cols + 1,
    rows: rows + 1,
    connectCount: chosen.cellByOrig.size,
    attempts,
  };
}

/**
 * 此節點是否為「必須保留」的骨架節點（非黑色路線中間站）：
 *   🟡 交叉(cross)、🟣 切斷(purple)、connect/terminal。即使 degree-2 也不可收縮成黑點。
 * 標記來源（routeStations.js 經 B3/flat 以 cloneJson 完整保留到 node.tags）：
 *   node_kind ∈ {cross, purple}；node_type ∈ {connect, terminal}；
 *   node_class_color = 🟡#ffd600 / 🟣#9c27b0；或 isCross/isPurple 旗標。
 */
/** 🖤 黑點站判定：node_kind='black' 或分類色為黑（#000000）。黑點為單線中間站，不得成為分歧/轉乘節點。 */
function isBlackNode(node) {
  if (!node || typeof node !== 'object') return false;
  const t = node.tags || {};
  const kind = node.node_kind ?? t.node_kind;
  if (kind === 'black') return true;
  const cc = String(t.node_class_color ?? node.node_class_color ?? '').toLowerCase();
  return cc === '#000000' || cc === '#000';
}

/** 兩段是否同一條路線（依 route_name；退而求 name）。 */
function sameRoute(segA, segB) {
  const a = String(segA?.route_name ?? segA?.name ?? '').trim();
  const b = String(segB?.route_name ?? segB?.name ?? '').trim();
  return a !== '' && a === b;
}

function isSkeletonKeepNode(node) {
  if (!node || typeof node !== 'object') return false;
  const t = node.tags || {};
  const kind = node.node_kind ?? t.node_kind;
  if (kind === 'cross' || kind === 'purple') return true;
  if (node.isCross || node.isPurple || t.isCross || t.isPurple) return true;
  const nt = node.node_type ?? t.node_type;
  if (nt === 'connect' || nt === 'terminal') return true;
  const cc = String(t.node_class_color ?? node.node_class_color ?? '').toLowerCase();
  if (cc === '#ffd600' || cc === '#9c27b0') return true; // 黃(交叉) / 紫(切斷)
  return false;
}

function nodeIdentity(node, x, y) {
  const t = (node && node.tags) || {};
  const name = node?.station_name ?? t.station_name ?? t.name;
  if (name != null && String(name).trim() !== '') return 'n:' + String(name).trim();
  const sid = node?.station_id ?? t.station_id;
  if (sid != null) {
    const s = String(sid).trim();
    if (s && s !== 'cross' && s !== 'connect') return 's:' + s;
  }
  return `xy:${x},${y}`;
}

/** 把整份 flat（含黑站）所有點等比例縮放到整數格（就地）。 */
function scaleAllFlatToGrid(segments, targetSpan = 200) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const seg of segments) for (const p of seg.points) {
    const [x, y] = readPt(p);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const scale = targetSpan / Math.max(1e-9, Math.max(maxX - minX, maxY - minY));
  for (const seg of segments) {
    for (let i = 0; i < seg.points.length; i++) {
      const [x, y] = readPt(seg.points[i]);
      writePt(seg.points[i], Math.round((x - minX) * scale), Math.round((y - minY) * scale));
    }
  }
  return { scale };
}

/**
 * #4 stroke 法輸入：每條路線(route)串成一條 stroke 折線（含所有站點），座標已縮放到格。
 * @returns {{ ok:boolean, message?:string, strokes?:Array, meta?:object }}
 */
export function resolveStrokeInput() {
  const dataStore = useDataStore();
  const src = dataStore.findLayerById(SCHEMATIC_SOURCE_LAYER_ID);
  if (!src) return { ok: false, message: `找不到上游圖層「${SCHEMATIC_SOURCE_LAYER_ID}」` };
  const geojson = src.geojsonData;
  if (!geojson?.features?.length) {
    return { ok: false, message: `請先開啟並載入圖層「OSM／GeoJSON → JSON」（geojsonData 尚無資料）。` };
  }
  let fields;
  try {
    fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
  } catch (e) {
    return { ok: false, message: '上游 GeoJSON 轉路網失敗：' + (e?.message || e) };
  }
  const baseFlat = JSON.parse(JSON.stringify(fields?.spaceNetworkGridJsonData || []));
  if (!baseFlat.length) return { ok: false, message: '上游路網為空。' };
  scaleAllFlatToGrid(baseFlat);

  // 依 route_name 分組各 section，串成一條 stroke 折線
  const byRoute = new Map();
  for (const seg of baseFlat) {
    const rn = seg.route_name ?? seg.name ?? '';
    if (!byRoute.has(rn)) byRoute.set(rn, []);
    byRoute.get(rn).push(seg);
  }
  const strokes = [];
  for (const [rn, segs] of byRoute) {
    const chained = chainSectionsIntoPolyline(segs);
    if (chained && chained.points.length >= 2) {
      strokes.push({ route_name: rn, color: segs[0]?.way_properties?.tags?.color, ...chained });
    }
  }
  if (!strokes.length) return { ok: false, message: '無法形成 stroke。' };
  strokes.sort((a, b) => polylineLength(b.points) - polylineLength(a.points)); // 依長度排名（高→低）
  return {
    ok: true,
    strokes,
    meta: {
      sourceLayerId: SCHEMATIC_SOURCE_LAYER_ID,
      strokeCount: strokes.length,
      pointCount: strokes.reduce((s, k) => s + k.points.length, 0),
    },
  };
}

function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** 把一條 route 的多個 section（共用 connect 端點）串成單一折線（points + nodes + identity）。 */
function chainSectionsIntoPolyline(segs) {
  // 每段 = 連續點列；以端點座標鍵建鄰接，找端點(出現一次的連接)起走
  const endKey = (seg, which) => {
    const p = which === 0 ? seg.points[0] : seg.points[seg.points.length - 1];
    const [x, y] = readPt(p);
    return `${x},${y}`;
  };
  const deg = new Map();
  for (const seg of segs) {
    for (const w of [0, 1]) {
      const k = endKey(seg, w);
      deg.set(k, (deg.get(k) || 0) + 1);
    }
  }
  const used = new Set();
  // 找起點：某段一端 degree==1
  let startSeg = segs.find((s) => deg.get(endKey(s, 0)) === 1) || segs.find((s) => deg.get(endKey(s, 1)) === 1) || segs[0];
  let atKey = deg.get(endKey(startSeg, 0)) === 1 ? endKey(startSeg, 0) : endKey(startSeg, 0);
  const points = [];
  const nodes = [];
  let curKey = atKey;
  let guard = 0;
  let seg = startSeg;
  while (seg && guard++ < segs.length + 2) {
    used.add(seg);
    const fwd = endKey(seg, 0) === curKey;
    const segPts = fwd ? seg.points : [...seg.points].reverse();
    const segNodes = fwd ? seg.nodes || [] : [...(seg.nodes || [])].reverse();
    for (let i = 0; i < segPts.length; i++) {
      const [x, y] = readPt(segPts[i]);
      if (points.length && points[points.length - 1][0] === x && points[points.length - 1][1] === y) continue; // 接點去重
      points.push([x, y]);
      const nd = segNodes[i];
      nodes.push({ node: nd || null, id: nodeIdentity(nd, x, y) });
    }
    curKey = endKey(seg, fwd ? 1 : 0);
    seg = segs.find((s) => !used.has(s) && (endKey(s, 0) === curKey || endKey(s, 1) === curKey));
  }
  return { points, nodes };
}

/**
 * @returns {{ ok:boolean, message?:string, skeletonFlat?:Array, sections?:Array, meta?:object }}
 */
export function resolveSchematicInput(executingLayerId) {
  const dataStore = useDataStore();
  // 優先使用執行圖層自身已匯入的 geojsonData（從畫線／從 OSM→JSON 匯入）；
  // 否則回退上游 osm_2_geojson_2_json（向後相容）。
  const own = executingLayerId ? dataStore.findLayerById(executingLayerId) : null;
  const src =
    own && own.geojsonData?.features?.length
      ? own
      : dataStore.findLayerById(SCHEMATIC_SOURCE_LAYER_ID);
  if (!src) return { ok: false, message: `找不到上游圖層「${SCHEMATIC_SOURCE_LAYER_ID}」` };
  const geojson = src.geojsonData;
  if (!geojson?.features?.length) {
    return {
      ok: false,
      message: `此圖層尚無輸入資料，請先「從畫線匯入」或「從 OSM／GeoJSON → JSON 匯入」。`,
    };
  }

  let fields;
  try {
    fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
  } catch (e) {
    console.error('schematic 輸入：geojson → flat 失敗', e);
    return { ok: false, message: '上游 GeoJSON 轉路網失敗：' + (e?.message || e) };
  }
  const baseFlat = fields?.spaceNetworkGridJsonData;
  if (!Array.isArray(baseFlat) || baseFlat.length === 0) {
    return { ok: false, message: '上游路網為空。' };
  }

  const { skeletonFlat, sections } = buildConnectSkeleton(baseFlat);
  if (skeletonFlat.length === 0) return { ok: false, message: '上游路網無可用 connect 骨架。' };
  const refAngleFlat = JSON.parse(JSON.stringify(skeletonFlat));
  const grid = scaleSkeletonToIntegerGrid(skeletonFlat, {});
  const blackCount = sections.reduce((s, sec) => s + (sec.blackNodes?.length || 0), 0);

  return {
    ok: true,
    skeletonFlat,
    refAngleFlat,
    sections,
    meta: {
      sourceLayerId: src.layerId,
      gridCols: grid.cols,
      gridRows: grid.rows,
      gridScale: Math.round(grid.scale * 1000) / 1000,
      connectCount: grid.connectCount,
      sectionCount: skeletonFlat.length,
      blackStationCount: blackCount,
    },
  };
}
