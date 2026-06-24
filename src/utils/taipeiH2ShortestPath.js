/**
 * taipei_h2 路線導航：依示意圖路網 segment.nodes／points 建無權重圖，
 * 以 BFS 最短路徑（等同 NetworkX shortest_path 於未加權圖）求起迄站間路徑與折線。
 * 頂點鍵與 Control 下拉 value 相同（JSON.stringify）。
 * nav_weight：相容欄位（導航時一律保留 1；導航語意改寫 station_weights：最短路徑上為 10，其餘為 0）。
 */

import {
  forEachSegmentInSpaceNetwork,
  buildTaipeiFDataTableRowsLikeSplitOutput,
} from './randomConnectSegmentWeights.js';

const normStr = (v) => {
  const s = String(v ?? '').trim();
  if (s === '—' || s === '－') return '';
  return s;
};

/**
 * @param {object} node
 * @param {number[]} pt [x,y]
 * @returns {string|null}
 */
export function taipeiH2VertexKeyFromNode(node, pt) {
  if (!node || !Array.isArray(pt) || pt.length < 2) return null;
  const px = Number(pt[0]);
  const py = Number(pt[1]);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;

  if (node.node_type === 'connect') {
    const cn = node.connect_number ?? node.tags?.connect_number;
    if (cn != null && Number.isFinite(Number(cn))) {
      return JSON.stringify({ t: 'c', n: Number(cn) });
    }
  }

  const sid = normStr(node.station_id ?? node.tags?.station_id);
  const gx = Number(node.x_grid ?? node.tags?.x_grid ?? px);
  const gy = Number(node.y_grid ?? node.tags?.y_grid ?? py);
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;

  const sname = normStr(node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? '');
  if (!sid && !sname) return null;

  /** 與 Control 下拉黑點 value 鍵順序一致：t, x, y, i */
  return JSON.stringify({ t: 'b', x: gx, y: gy, i: sid || '' });
}

/**
 * 與路網資料同源之 segment **物件參考**（可寫入 nav_weight）
 * @param {Array} routesData - layer.spaceNetworkGridJsonData
 * @returns {Array<{ seg: object, route_name: string }>}
 */
export function taipeiH2FlattenSegmentRefs(routesData) {
  const raw = routesData || [];
  const out = [];
  if (raw.length === 0) return out;
  const head = raw[0];
  const isFlatSegmentList =
    head?.points && !(Array.isArray(head.segments) && head.segments.length > 0);
  if (isFlatSegmentList) {
    for (const seg of raw) {
      out.push({ seg, route_name: seg.route_name || seg.name || 'Unknown' });
    }
  } else {
    for (const route of raw) {
      const routeName = route.route_name ?? route.name ?? 'Unknown';
      for (const seg of route.segments || []) {
        out.push({ seg, route_name: routeName });
      }
    }
  }
  return out;
}

/**
 * @deprecated 僅保留供相容；新路徑請用 taipeiH2FlattenSegmentRefs + taipeiH2BuildNavigationGraph
 */
export function taipeiH2FlattenSegments(routesData) {
  return taipeiH2FlattenSegmentRefs(routesData).map(({ seg, route_name }) => ({
    ...seg,
    route_name,
    nodes: seg.nodes ?? [],
  }));
}

const dirKey = (from, to) => `${from}>>>${to}`;

const NAV_SW_BACKUP_KEY = '_taipeiNavStationWeightsBackupMap';
const NAV_SW_BACKUP_KEY_K3 = '_taipeiNavStationWeightsBackupMapK3';

/** 對指定 data 陣列備份所有 segment 的 station_weights */
function takeNavSwBackupForData(data, backupKey, layer) {
  if (!layer || layer[backupKey]) return;
  if (!Array.isArray(data)) return;
  const m = new Map();
  forEachSegmentInSpaceNetwork(data, (seg) => {
    m.set(
      seg,
      Array.isArray(seg.station_weights)
        ? JSON.parse(JSON.stringify(seg.station_weights))
        : null
    );
  });
  layer[backupKey] = m;
}

/** 從備份還原指定 layer 上的備份 */
function restoreNavSwFromBackup(backupKey, layer) {
  const m = layer?.[backupKey];
  if (!m) return;
  for (const [seg, sw] of m.entries()) {
    if (sw == null) {
      delete seg.station_weights;
    } else {
      seg.station_weights = JSON.parse(JSON.stringify(sw));
    }
  }
}

function clearNavSwBackup(backupKey, layer) {
  if (layer && layer[backupKey]) {
    delete layer[backupKey];
  }
}

/** 對 data 陣列將 pathSet 裡的 segment 設為 weight=10，其餘 1 */
function applyWeights10ZeroToData(data, pathSet) {
  forEachSegmentInSpaceNetwork(data, (seg) => {
    const nn = (seg.points || []).length;
    const endIdx = Math.max(0, nn - 1);
    const w = pathSet.has(seg) ? 10 : 1;
    if (!Array.isArray(seg.station_weights) || seg.station_weights.length === 0) {
      seg.station_weights = [{ start_idx: 0, end_idx: endIdx, weight: w }];
    } else {
      for (const entry of seg.station_weights) {
        if (entry) entry.weight = w;
      }
    }
  });
}

/** 用 BFS 在 data 中找路，並回傳 pathKeys（若無法連通則 null） */
function findPathKeysInData(data, k0, k1) {
  if (!Array.isArray(data) || !k0 || !k1 || k0 === k1) return null;
  const flatRefs = taipeiH2FlattenSegmentRefs(data);
  const { adj } = taipeiH2BuildNavigationGraph(flatRefs);
  return taipeiH2BfsShortestPath(adj, k0, k1);
}

/** 從 data 中以 pathKeys 取得 segment 物件集合 */
function getPathSetFromData(data, k0, k1) {
  const set = new Set();
  if (!Array.isArray(data) || !k0 || !k1 || k0 === k1) return set;
  const flatRefs = taipeiH2FlattenSegmentRefs(data);
  const { adj, edgeToSeg } = taipeiH2BuildNavigationGraph(flatRefs);
  const pathKeys = taipeiH2BfsShortestPath(adj, k0, k1);
  if (!pathKeys || pathKeys.length < 2) return set;
  for (let j = 0; j < pathKeys.length - 1; j++) {
    const a = pathKeys[j];
    const b = pathKeys[j + 1];
    let seg = edgeToSeg.get(dirKey(a, b));
    if (!seg) seg = edgeToSeg.get(dirKey(b, a));
    if (seg) set.add(seg);
  }
  return set;
}

/**
 * 導航：最短路徑上之每段 `station_weights` 設為 10，其餘設為 1。
 * 同時作用於 spaceNetworkGridJsonData（h2）和 spaceNetworkGridJsonDataK3Tab（c5）。
 * 清除起迄時自備份還原。
 * @param {object} layer
 * @param {[string|null, string|null]} keys
 */
export function applyTaipeiH2C5NavigationStationWeights10Zero(layer, keys) {
  const k0 = keys?.[0];
  const k1 = keys?.[1];

  // ── 處理 spaceNetworkGridJsonData ──
  const data = layer?.spaceNetworkGridJsonData;
  if (Array.isArray(data)) {
    if (!k0 || !k1 || k0 === k1) {
      restoreNavSwFromBackup(NAV_SW_BACKUP_KEY, layer);
      clearNavSwBackup(NAV_SW_BACKUP_KEY, layer);
    } else {
      if (!layer[NAV_SW_BACKUP_KEY]) {
        takeNavSwBackupForData(data, NAV_SW_BACKUP_KEY, layer);
      } else {
        restoreNavSwFromBackup(NAV_SW_BACKUP_KEY, layer);
      }
      const pathKeys = findPathKeysInData(data, k0, k1);
      if (!pathKeys || pathKeys.length < 2) {
        restoreNavSwFromBackup(NAV_SW_BACKUP_KEY, layer);
        clearNavSwBackup(NAV_SW_BACKUP_KEY, layer);
      } else {
        const pathSet = getPathSetFromData(data, k0, k1);
        applyWeights10ZeroToData(data, pathSet);
      }
    }
  }

  // ── 處理 spaceNetworkGridJsonDataK3Tab（版面網格 K3 層） ──
  const dataK3 = layer?.spaceNetworkGridJsonDataK3Tab;
  if (Array.isArray(dataK3)) {
    if (!k0 || !k1 || k0 === k1) {
      restoreNavSwFromBackup(NAV_SW_BACKUP_KEY_K3, layer);
      clearNavSwBackup(NAV_SW_BACKUP_KEY_K3, layer);
    } else {
      if (!layer[NAV_SW_BACKUP_KEY_K3]) {
        takeNavSwBackupForData(dataK3, NAV_SW_BACKUP_KEY_K3, layer);
      } else {
        restoreNavSwFromBackup(NAV_SW_BACKUP_KEY_K3, layer);
      }
      const pathKeys = findPathKeysInData(dataK3, k0, k1);
      if (!pathKeys || pathKeys.length < 2) {
        restoreNavSwFromBackup(NAV_SW_BACKUP_KEY_K3, layer);
        clearNavSwBackup(NAV_SW_BACKUP_KEY_K3, layer);
      } else {
        const pathSet = getPathSetFromData(dataK3, k0, k1);
        applyWeights10ZeroToData(dataK3, pathSet);
      }
    }
  }
}

/**
 * @param {Array<{ seg: object }>} flatRefs
 * @returns {{
 *   adj: Map<string, Set<string>>,
 *   directedPolylines: Map<string, number[][]>,
 *   edgeToSeg: Map<string, object>,
 *   edgeToRouteName: Map<string, string>
 * }}
 */
export function taipeiH2BuildNavigationGraph(flatRefs) {
  const adj = new Map();
  const directedPolylines = new Map();
  const edgeToSeg = new Map();
  const edgeToRouteName = new Map();

  const addAdj = (a, b) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };

  for (const { seg, route_name } of flatRefs || []) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    if (pts.length < 2) continue;
    const n = Math.min(pts.length, nodes.length);
    const stationIdx = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const coord = Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x), Number(p?.y)];
      const k = taipeiH2VertexKeyFromNode(nodes[i], coord);
      if (k) stationIdx.push({ k, i });
    }
    const seq = [];
    for (const s of stationIdx) {
      if (seq.length === 0 || seq[seq.length - 1].k !== s.k) seq.push(s);
    }
    for (let j = 0; j < seq.length - 1; j++) {
      const i0 = seq[j].i;
      const i1 = seq[j + 1].i;
      const slice = [];
      for (let t = i0; t <= i1; t++) {
        const p = pts[t];
        const x = Array.isArray(p) ? Number(p[0]) : Number(p?.x);
        const y = Array.isArray(p) ? Number(p[1]) : Number(p?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) slice.push([x, y]);
      }
      if (slice.length < 2) continue;
      const a = seq[j].k;
      const b = seq[j + 1].k;
      addAdj(a, b);
      const dk = dirKey(a, b);
      if (!directedPolylines.has(dk)) directedPolylines.set(dk, slice);
      if (!edgeToSeg.has(dk)) edgeToSeg.set(dk, seg);
      if (!edgeToRouteName.has(dk)) {
        const rn = normStr(route_name ?? seg.route_name ?? seg.name ?? '');
        edgeToRouteName.set(dk, rn || 'Unknown');
      }
    }
  }

  return { adj, directedPolylines, edgeToSeg, edgeToRouteName };
}

/** @deprecated 使用 taipeiH2BuildNavigationGraph(taipeiH2FlattenSegmentRefs(data)) */
export function taipeiH2BuildStationGraph(segments) {
  const fakeRefs = (segments || []).map((s) => ({ seg: s }));
  const { adj, directedPolylines } = taipeiH2BuildNavigationGraph(fakeRefs);
  return { adj, directedPolylines };
}

/**
 * @param {Map<string, Set<string>>} adj
 * @param {string} start
 * @param {string} end
 * @returns {string[]|null}
 */
export function taipeiH2BfsShortestPath(adj, start, end) {
  if (!start || !end) return null;
  if (start === end) return [start];
  if (!adj.has(start) || !adj.has(end)) return null;
  const queue = [start];
  const prev = new Map([[start, null]]);
  while (queue.length) {
    const u = queue.shift();
    if (u === end) break;
    for (const v of adj.get(u) || []) {
      if (prev.has(v)) continue;
      prev.set(v, u);
      queue.push(v);
    }
  }
  if (!prev.has(end)) return null;
  const path = [];
  let cur = end;
  while (cur != null) {
    path.push(cur);
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

/**
 * @param {string[]} pathKeys
 * @param {Map<string, number[][]>} directedPolylines
 * @returns {number[][][]}
 */
export function taipeiH2PathToPolylines(pathKeys, directedPolylines) {
  if (!Array.isArray(pathKeys) || pathKeys.length < 2) return [];
  const out = [];
  for (let j = 0; j < pathKeys.length - 1; j++) {
    const a = pathKeys[j];
    const b = pathKeys[j + 1];
    let poly = directedPolylines.get(`${a}>>>${b}`);
    if (!poly || poly.length < 2) {
      const rev = directedPolylines.get(`${b}>>>${a}`);
      if (rev && rev.length >= 2) poly = [...rev].reverse();
    }
    if (poly && poly.length >= 2) out.push(poly);
  }
  return out;
}

/**
 * @param {object} layer
 * @param {string} k0
 * @param {string} k1
 * @returns {Set<object>} segment 物件參考
 */
export function taipeiH2GetPathSegmentRefSet(layer, k0, k1) {
  const set = new Set();
  if (!k0 || !k1 || k0 === k1) return set;
  const flatRefs = taipeiH2FlattenSegmentRefs(layer?.spaceNetworkGridJsonData);
  const { adj, edgeToSeg } = taipeiH2BuildNavigationGraph(flatRefs);
  const pathKeys = taipeiH2BfsShortestPath(adj, k0, k1);
  if (!pathKeys || pathKeys.length < 2) return set;
  for (let j = 0; j < pathKeys.length - 1; j++) {
    const a = pathKeys[j];
    const b = pathKeys[j + 1];
    let seg = edgeToSeg.get(dirKey(a, b));
    if (!seg) seg = edgeToSeg.get(dirKey(b, a));
    if (seg) set.add(seg);
  }
  return set;
}

/** 每個 segment 預設 nav_weight = 1（僅 taipei_h2 載入時呼叫） */
export function ensureTaipeiH2SegmentNavWeightDefaults(routesDataOrFlat) {
  forEachSegmentInSpaceNetwork(routesDataOrFlat, (seg) => {
    if (seg.nav_weight == null || !Number.isFinite(Number(seg.nav_weight))) {
      seg.nav_weight = 1;
    } else {
      seg.nav_weight = Number(seg.nav_weight);
    }
  });
}

/**
 * showBoost：最短路徑上 segment.nav_weight=5，其餘 1；關閉時全部 1
 * @param {object} layer
 * @param {[string|null, string|null]} keys
 * @param {boolean} showBoost
 */
export function taipeiH2ApplyNavigationNavWeights(layer, keys, showBoost) {
  const data = layer?.spaceNetworkGridJsonData;
  if (!Array.isArray(data)) return;
  ensureTaipeiH2SegmentNavWeightDefaults(data);
  const k0 = keys?.[0];
  const k1 = keys?.[1];
  if (!showBoost || !k0 || !k1) {
    forEachSegmentInSpaceNetwork(data, (seg) => {
      seg.nav_weight = 1;
    });
    return;
  }
  if (k0 === k1) {
    forEachSegmentInSpaceNetwork(data, (seg) => {
      seg.nav_weight = 1;
    });
    return;
  }
  const pathSet = taipeiH2GetPathSegmentRefSet(layer, k0, k1);
  forEachSegmentInSpaceNetwork(data, (seg) => {
    seg.nav_weight = pathSet.has(seg) ? 5 : 1;
  });
}

/**
 * 同步導航 station_weights（最短路徑 10／其餘 1）、nav_weight 固定 1，並重建 taipei_h2 的 dataTableData
 */
export function refreshTaipeiH2NavigationTableAndWeights(layer, keys) {
  if (!layer || layer.layerId !== 'taipei_h2') return;
  if (Array.isArray(layer.spaceNetworkGridJsonData)) {
    forEachSegmentInSpaceNetwork(layer.spaceNetworkGridJsonData, (seg) => {
      seg.nav_weight = 1;
    });
  }
  applyTaipeiH2C5NavigationStationWeights10Zero(layer, keys);
  layer.dataTableData = buildTaipeiFDataTableRowsLikeSplitOutput(layer.spaceNetworkGridJsonData, {
    connectData: layer.spaceNetworkGridJsonData_ConnectData,
    stationData: layer.spaceNetworkGridJsonData_StationData,
    sectionData: layer.spaceNetworkGridJsonData_SectionData,
  });
}

function lookupNameForKey(key, layer) {
  try {
    const o = JSON.parse(key);
    if (o.t === 'c' && Number.isFinite(Number(o.n))) {
      const cd = layer?.spaceNetworkGridJsonData_ConnectData;
      if (Array.isArray(cd)) {
        const hit = cd.find(
          (c) => Number(c?.connect_number ?? c?.tags?.connect_number) === Number(o.n)
        );
        if (hit) {
          const n = normStr(
            hit.station_name ?? hit.tags?.station_name ?? hit.tags?.name ?? ''
          );
          if (n) return n;
        }
      }
      return `紅點 #${o.n}`;
    }
    if (o.t === 'b') {
      if (o.i && String(o.i).trim() !== '') return String(o.i).trim();
      const sd = layer?.spaceNetworkGridJsonData_StationData;
      if (Array.isArray(sd)) {
        const x = Number(o.x);
        const y = Number(o.y);
        for (const row of sd) {
          if (!row) continue;
          const sx = Number(row.x_grid ?? row.tags?.x_grid);
          const sy = Number(row.y_grid ?? row.tags?.y_grid);
          if (Math.abs(sx - x) < 0.08 && Math.abs(sy - y) < 0.08) {
            const n = normStr(row.station_name ?? row.tags?.station_name ?? row.tags?.name ?? '');
            if (n) return n;
          }
        }
      }
      return `黑點 (${o.x}, ${o.y})`;
    }
  } catch {
    /* ignore */
  }
  return key;
}

/**
 * @param {string[]} pathKeys
 * @param {object} layer
 * @returns {string[]} 每站顯示名稱（與 Python path 串接語意相同）
 */
export function taipeiH2PathKeysToStationNames(pathKeys, layer) {
  if (!Array.isArray(pathKeys)) return [];
  return pathKeys.map((k) => lookupNameForKey(k, layer));
}

function routeNameForPathEdge(a, b, edgeToRouteName) {
  const direct = normStr(edgeToRouteName?.get(dirKey(a, b)) ?? '');
  if (direct) return direct;
  const rev = normStr(edgeToRouteName?.get(dirKey(b, a)) ?? '');
  if (rev) return rev;
  return 'Unknown';
}

/**
 * @param {object} layer
 * @param {[string|null, string|null]} keys - store 內兩格 JSON 字串
 * @returns {{
 *   pathKeys: string[]|null,
 *   stationNames: string[],
 *   pathJoined: string,
 *   pathWithRoutesJoined: string,
 *   polylines: number[][][],
 *   error: string|null
 * }}
 */
export function taipeiH2ComputeShortestPathOverlay(layer, keys) {
  const k0 = keys?.[0];
  const k1 = keys?.[1];
  if (!k0 || !k1) {
    return {
      pathKeys: null,
      stationNames: [],
      pathJoined: '',
      pathWithRoutesJoined: '',
      polylines: [],
      error: null,
    };
  }
  if (k0 === k1) {
    return {
      pathKeys: [k0],
      stationNames: taipeiH2PathKeysToStationNames([k0], layer),
      pathJoined: taipeiH2PathKeysToStationNames([k0], layer).join('、'),
      pathWithRoutesJoined: taipeiH2PathKeysToStationNames([k0], layer).join('、'),
      polylines: [],
      error: null,
    };
  }
  const flatRefs = taipeiH2FlattenSegmentRefs(layer?.spaceNetworkGridJsonData);
  const { adj, directedPolylines, edgeToRouteName } = taipeiH2BuildNavigationGraph(flatRefs);
  const pathKeys = taipeiH2BfsShortestPath(adj, k0, k1);
  if (!pathKeys || pathKeys.length < 2) {
    return {
      pathKeys: null,
      stationNames: [],
      pathJoined: '',
      pathWithRoutesJoined: '',
      polylines: [],
      error: '無法導航：兩站間無連通路徑',
    };
  }
  const stationNames = taipeiH2PathKeysToStationNames(pathKeys, layer);
  const polylines = taipeiH2PathToPolylines(pathKeys, directedPolylines);
  const legTexts = [];
  for (let i = 0; i < pathKeys.length - 1; i++) {
    const fromName = stationNames[i] ?? pathKeys[i];
    const toName = stationNames[i + 1] ?? pathKeys[i + 1];
    const routeName = routeNameForPathEdge(pathKeys[i], pathKeys[i + 1], edgeToRouteName);
    legTexts.push(`${fromName} —[${routeName}]→ ${toName}`);
  }
  return {
    pathKeys,
    stationNames,
    pathJoined: stationNames.join('、'),
    pathWithRoutesJoined: legTexts.join(' ｜ '),
    polylines,
    error: null,
  };
}
