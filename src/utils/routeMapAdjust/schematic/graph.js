/**
 * connect 骨架 → 抽象圖。供 Stroke-based、Hill Climbing(line straightness)、MILP(嵌入保持) 共用。
 *
 * **節點以 connect 穩定身分(站名)為 key**（非縮放座標），避免密集市區不同站被縮放併格而度數虛胖。
 * 邊 = section（保留 route_name 與 vertex refs 供回寫）。平行 section 保留為多重邊。
 * 不同身分卻被縮放併到同格者，建圖後移到最近空格分開。
 */

export function readXY(p) {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
  return [Number(p?.x ?? 0), Number(p?.y ?? 0)];
}

/** connect 穩定身分 key：站名優先（cross 站 station_id 都是 'cross' 故不可用），退而求 station_id／connect_number，最後座標。 */
function connectKey(node) {
  const t = (node && node.tags) || {};
  const name = node?.station_name ?? t.station_name ?? t.name;
  if (name != null && String(name).trim() !== '') return 'n:' + String(name).trim();
  const sid = node?.station_id ?? t.station_id;
  if (sid != null) {
    const s = String(sid).trim();
    if (s && s !== 'cross' && s !== 'connect') return 's:' + s;
  }
  const cn = node?.connect_number ?? t.connect_number;
  if (cn != null && String(cn).trim() !== '') return 'c:' + String(cn).trim();
  return null;
}

function nearestFreeCell(x0, y0, occ) {
  for (let r = 1; r < 2000; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0) continue;
        if (!occ.has(`${x},${y}`)) return [x, y];
      }
    }
  }
  return [x0, y0];
}

/** 不同身分節點若初值落在同一格，逐一移到最近空格分開。 */
function spreadOverlaps(nodes) {
  const occ = new Map();
  let moved = 0;
  for (const nd of nodes) {
    const k = `${nd.x},${nd.y}`;
    if (!occ.has(k)) {
      occ.set(k, nd.id);
      continue;
    }
    const [x, y] = nearestFreeCell(nd.x, nd.y, occ);
    nd.x = x;
    nd.y = y;
    occ.set(`${x},${y}`, nd.id);
    moved++;
  }
  return moved;
}

/**
 * @param {Array<object>} skeletonFlat 2 點一段的 connect 骨架
 * @param {{ mergeByGridCell?: boolean }} [opts]
 *   mergeByGridCell：整數格路網（站點與路線調整）時，同格座標視為同一共點，不 spread 拆開。
 * @returns {{
 *   nodes: Array<{id:number,key:string,x:number,y:number,refs:Array<{si:number,pi:number}>}>,
 *   edges: Array<{id:number,u:number,v:number,route_name:string,si:number}>,
 *   incident: Array<Array<number>>,
 *   nodeOfRef: Map,
 *   spreadCount: number
 * }}
 */
export function buildSchematicGraph(skeletonFlat, opts = {}) {
  const mergeByGridCell = !!opts.mergeByGridCell;
  const keyToNode = new Map();
  const nodes = [];
  const nodeOfRef = new Map();
  const nodeIdByKey = (key, x, y) => {
    let id = keyToNode.get(key);
    if (id === undefined) {
      id = nodes.length;
      keyToNode.set(key, id);
      nodes.push({ id, key, x, y, refs: [] });
    }
    return id;
  };

  for (let si = 0; si < skeletonFlat.length; si++) {
    const seg = skeletonFlat[si];
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let pi = 0; pi < pts.length; pi++) {
      const [x, y] = readXY(pts[pi]);
      const ix = Math.round(x);
      const iy = Math.round(y);
      const key = mergeByGridCell
        ? `cell:${ix},${iy}`
        : (connectKey(seg?.nodes?.[pi]) || `xy:${x},${y}`);
      const id = nodeIdByKey(key, mergeByGridCell ? ix : x, mergeByGridCell ? iy : y);
      nodes[id].refs.push({ si, pi });
      nodeOfRef.set(`${si},${pi}`, id);
    }
  }

  const spreadCount = mergeByGridCell ? 0 : spreadOverlaps(nodes);

  // 邊以「無序節點對」去重：平行路線/重複 section 共用走廊 → 一條幾何邊（路線與分段清單保留）。
  // 這使度數=不同鄰居數（真實拓撲），避免重複 section 把度數灌爆。
  const edges = [];
  const incident = nodes.map(() => []);
  const pairToEdge = new Map();
  let dupCollapsed = 0;
  for (let si = 0; si < skeletonFlat.length; si++) {
    const seg = skeletonFlat[si];
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const u = nodeOfRef.get(`${si},0`);
    const v = nodeOfRef.get(`${si},${pts.length - 1}`);
    if (u == null || v == null || u === v) continue;
    const rn = seg.route_name ?? seg.name ?? '';
    const pk = `${Math.min(u, v)}-${Math.max(u, v)}`;
    let eid = pairToEdge.get(pk);
    if (eid === undefined) {
      eid = edges.length;
      pairToEdge.set(pk, eid);
      edges.push({ id: eid, u, v, route_name: rn, routes: new Set([rn]), sections: [si] });
      incident[u].push(eid);
      incident[v].push(eid);
    } else {
      edges[eid].routes.add(rn);
      edges[eid].sections.push(si);
      dupCollapsed++;
    }
  }

  return { nodes, edges, incident, nodeOfRef, spreadCount, dupCollapsed };
}

/** 同節點入射邊依「共享路線」併組（union-find）：同一條線的兩段留在同組以保連續。 */
function groupEdgesBySharedRoute(inc, edges) {
  const parent = new Map(inc.map((e) => [e, e]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const routeFirst = new Map();
  for (const eid of inc) {
    const routes = edges[eid].routes || new Set([edges[eid].route_name]);
    for (const r of routes) {
      if (routeFirst.has(r)) parent.set(find(eid), find(routeFirst.get(r)));
      else routeFirst.set(r, eid);
    }
  }
  const gm = new Map();
  for (const eid of inc) {
    const g = find(eid);
    if (!gm.has(g)) gm.set(g, []);
    gm.get(g).push(eid);
  }
  return [...gm.values()];
}

/**
 * Node-splitting：把度數 > maxPort 的真實交會站拆成相鄰子節點路徑（短連結邊相連），
 * 依「共享路線」分組裝箱使每子節點 ≤ maxPort（保留 2 槽給連結邊），同線兩段留同子節點以保連續。
 * 連結邊 route_name='' 不渲染。回傳新圖（nodes/edges/incident/nodeOfRef）。
 * @param {object} graph buildSchematicGraph 結果
 * @param {number} [maxPort=4] rectilinear=4
 */
export function splitHighDegreeNodes(graph, maxPort = 4) {
  const { nodes, edges, incident, nodeOfRef } = graph;
  const cap = Math.max(1, maxPort - 2); // 每子節點保留 ≤2 槽給連結邊

  const sectionToEdge = new Map();
  for (const e of edges) for (const si of e.sections) sectionToEdge.set(si, e.id);

  const newNodes = [];
  const assign = new Map(); // oldId -> { edgeToSub:Map, subIds:[], split:bool }
  let splitCount = 0;

  for (let v = 0; v < nodes.length; v++) {
    const inc = incident[v];
    if (inc.length <= maxPort) {
      const nid = newNodes.length;
      newNodes.push({ id: nid, key: nodes[v].key, x: nodes[v].x, y: nodes[v].y, refs: [] });
      const m = new Map();
      for (const eid of inc) m.set(eid, nid);
      assign.set(v, { edgeToSub: m, subIds: [nid], split: false });
      continue;
    }
    splitCount++;
    const groups = groupEdgesBySharedRoute(inc, edges);
    groups.sort((a, b) => b.length - a.length);
    const bins = [];
    let cur = [];
    let curSize = 0;
    for (const g of groups) {
      if (curSize > 0 && curSize + g.length > cap) {
        bins.push(cur);
        cur = [];
        curSize = 0;
      }
      cur.push(...g);
      curSize += g.length;
    }
    if (cur.length) bins.push(cur);

    const subIds = [];
    const edgeToSub = new Map();
    for (let b = 0; b < bins.length; b++) {
      const nid = newNodes.length;
      newNodes.push({ id: nid, key: `${nodes[v].key}#${b}`, x: nodes[v].x + b, y: nodes[v].y, refs: [] });
      subIds.push(nid);
      for (const eid of bins[b]) edgeToSub.set(eid, nid);
    }
    assign.set(v, { edgeToSub, subIds, split: true });
  }

  const newEdges = [];
  const newIncident = newNodes.map(() => []);
  const pushEdge = (u, vv, route_name, routes, sections, isLink) => {
    const id = newEdges.length;
    newEdges.push({ id, u, v: vv, route_name, routes, sections, isLink: !!isLink });
    newIncident[u].push(id);
    newIncident[vv].push(id);
  };
  for (const e of edges) {
    const nu = assign.get(e.u).edgeToSub.get(e.id);
    const nv = assign.get(e.v).edgeToSub.get(e.id);
    if (nu == null || nv == null || nu === nv) continue;
    pushEdge(nu, nv, e.route_name, e.routes, e.sections, false);
  }
  for (const a of assign.values()) {
    if (!a.split) continue;
    for (let i = 0; i + 1 < a.subIds.length; i++) {
      pushEdge(a.subIds[i], a.subIds[i + 1], '', new Set(), [], true);
    }
  }

  const newNodeOfRef = new Map();
  for (const [refKey, oldId] of nodeOfRef) {
    const parts = refKey.split(',');
    const si = Number(parts[0]);
    const pi = Number(parts[1]);
    const a = assign.get(oldId);
    const eid = sectionToEdge.get(si);
    const nid = eid != null && a.edgeToSub.has(eid) ? a.edgeToSub.get(eid) : a.subIds[0];
    newNodeOfRef.set(refKey, nid);
    newNodes[nid].refs.push({ si, pi });
  }

  return { nodes: newNodes, edges: newEdges, incident: newIncident, nodeOfRef: newNodeOfRef, splitCount };
}

/**
 * 固定平面嵌入：每節點入射邊依「初值座標的方位角」逆時針排序。
 * @param {object} graph buildSchematicGraph 結果
 * @returns {Array<Array<number>>} nodeId -> 依角度排序的 edgeId[]
 */
export function computeRotationSystem(graph) {
  const { nodes, edges, incident } = graph;
  const rot = [];
  for (let n = 0; n < nodes.length; n++) {
    const list = incident[n].slice();
    list.sort((ea, eb) => angleAt(nodes, edges, n, ea) - angleAt(nodes, edges, n, eb));
    rot.push(list);
  }
  return rot;
}

function angleAt(nodes, edges, nodeId, edgeId) {
  const e = edges[edgeId];
  const other = e.u === nodeId ? e.v : e.u;
  return Math.atan2(nodes[other].y - nodes[nodeId].y, nodes[other].x - nodes[nodeId].x);
}

/** 由圖節點取初值座標陣列 nodeId -> [x,y]。 */
export function initialCoords(graph) {
  return graph.nodes.map((n) => [n.x, n.y]);
}

/**
 * splitHighDegreeNodes 產生之 sub-node（key 帶 #0/#1…）佈局後合回同一格，恢復路線共點。
 * @param {object} graph
 * @param {Array<[number,number]>} coords
 * @returns {Array<[number,number]>}
 */
export function collapseSplitJunctionCoords(graph, coords) {
  const byBase = new Map();
  for (let i = 0; i < graph.nodes.length; i++) {
    const m = /^(.+)#\d+$/.exec(graph.nodes[i].key);
    if (!m) continue;
    const base = m[1];
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(i);
  }
  const out = coords.map((c) => [c[0], c[1]]);
  for (const ids of byBase.values()) {
    if (ids.length < 2) continue;
    let sx = 0;
    let sy = 0;
    for (const id of ids) {
      sx += out[id][0];
      sy += out[id][1];
    }
    const cx = Math.round(sx / ids.length);
    const cy = Math.round(sy / ids.length);
    for (const id of ids) {
      out[id] = [cx, cy];
    }
  }
  return out;
}

/**
 * 把最佳化後的節點座標寫回 connect 骨架（深拷），產出可供 reinsertBlackStations 的 optimizedSkeleton。
 * @param {Array<object>} skeletonFlat
 * @param {object} graph
 * @param {Array<[number,number]>} coords
 */
export function applyCoordsToSkeleton(skeletonFlat, graph, coords) {
  const out = JSON.parse(JSON.stringify(skeletonFlat));
  for (let nodeId = 0; nodeId < graph.nodes.length; nodeId++) {
    const [x, y] = coords[nodeId];
    for (const { si, pi } of graph.nodes[nodeId].refs) {
      const seg = out[si];
      const pt = seg?.points?.[pi];
      if (!pt) continue;
      if (Array.isArray(pt)) {
        pt[0] = x;
        pt[1] = y;
      } else if (pt && typeof pt === 'object') {
        pt.x = x;
        pt.y = y;
      }
      const nd = seg?.nodes?.[pi];
      if (nd && typeof nd === 'object') nd.tags = { ...(nd.tags || {}), x_grid: x, y_grid: y };
    }
  }
  return out;
}

/**
 * 每節點上「同一路線(route)的入射邊對」——line straightness 用：
 * 同節點同 route 的兩條邊應趨於共線（直線穿過）。
 * @returns {Array<{node:number, e1:number, e2:number}>}
 */
export function buildSameRouteEdgePairsAtNodes(graph) {
  const { incident, edges } = graph;
  const pairs = [];
  const seen = new Set();
  for (let n = 0; n < incident.length; n++) {
    const byRoute = new Map();
    for (const eid of incident[n]) {
      // 去重後每條邊帶多條路線(routes set)；逐路線歸組
      const routes = edges[eid].routes || new Set([edges[eid].route_name]);
      for (const rn of routes) {
        if (!byRoute.has(rn)) byRoute.set(rn, []);
        byRoute.get(rn).push(eid);
      }
    }
    for (const list of byRoute.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          // 同一對(e1,e2)在同節點只記一次（不同路線可能重複）
          const k = `${n}:${Math.min(list[i], list[j])}:${Math.max(list[i], list[j])}`;
          if (seen.has(k)) continue;
          seen.add(k);
          pairs.push({ node: n, e1: list[i], e2: list[j] });
        }
      }
    }
  }
  return pairs;
}
