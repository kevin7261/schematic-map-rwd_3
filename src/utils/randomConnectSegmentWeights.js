import { applyTaipeiFPruneEmptyGridRowsCols } from './dataExecute/execute_d_to_e_test.js';
import { isMapDrawnRoutesExportArray } from './mapDrawnRoutesImport.js';
import { isTaipeiTestFLayerTab, isTaipeiTestGOrHWeightLayerTab } from './taipeiTestPipeline.js';

/**
 * 依等比級數對 k∈{1,…,9} 加權抽樣（公比 1/2）：權重 2^(9−k)，1 最高、9 最低，總和 511。
 * 與相鄰 k 的機率比為 2:1。
 */
const K_MIN = 1;
const K_MAX = 9;
const GEOMETRIC_WEIGHTS = [];
let totalGeometricWeight = 0;
for (let k = K_MIN; k <= K_MAX; k++) {
  const w = 2 ** (K_MAX - k);
  GEOMETRIC_WEIGHTS.push(w);
  totalGeometricWeight += w;
}

/** 先算總權重再以累積機率落點；供 taipei_g 切段、站間權重與 ControlTab 等一致語意。 */
export function sampleWeight1to9Biased(rng = Math.random) {
  const r = rng() * totalGeometricWeight;
  let cumulative = 0;
  for (let i = 0; i < GEOMETRIC_WEIGHTS.length; i++) {
    cumulative += GEOMETRIC_WEIGHTS[i];
    if (r <= cumulative) return K_MIN + i;
  }
  return K_MAX;
}

/** k∈{1,…,10}，機率與 1/k 成正比（反比級數：1 最高、10 最低）；總權重＝H₁₀。 */
const INV10_MIN = 1;
const INV10_MAX = 10;
const INVERSE_SERIES_1_TO_10_WEIGHTS = [];
let totalInverseSeries1to10Weight = 0;
for (let k = INV10_MIN; k <= INV10_MAX; k++) {
  const w = 1 / k;
  INVERSE_SERIES_1_TO_10_WEIGHTS.push(w);
  totalInverseSeries1to10Weight += w;
}

export function sampleWeight1to10InverseSeries(rng = Math.random) {
  const r = rng() * totalInverseSeries1to10Weight;
  let cumulative = 0;
  for (let i = 0; i < INVERSE_SERIES_1_TO_10_WEIGHTS.length; i++) {
    cumulative += INVERSE_SERIES_1_TO_10_WEIGHTS[i];
    if (r <= cumulative) return INV10_MIN + i;
  }
  return INV10_MAX;
}

export function getNodeAtSegmentIndex(seg, i, nPoints) {
  const nodes = seg.nodes;
  if (Array.isArray(nodes) && nodes[i]) return nodes[i];
  const pts = seg.points || [];
  const pt = pts[i];
  if (Array.isArray(pt) && pt.length > 2 && pt[2] && typeof pt[2] === 'object') return pt[2];
  if (i === 0 && seg.properties_start) return seg.properties_start;
  if (i === nPoints - 1 && seg.properties_end) return seg.properties_end;
  // nodes 較 points 短時：仍用格點對 StationData 黑點／權重分段
  if (Array.isArray(pt) && pt.length >= 2) {
    return {
      x_grid: Number(pt[0]),
      y_grid: Number(pt[1]),
      node_type: 'line',
      tags: {},
    };
  }
  return null;
}

function getStationName(node) {
  if (!node || typeof node !== 'object') return '';
  return (node.station_name || node.tags?.station_name || node.tags?.name || '').trim();
}

function getStationId(node) {
  if (!node || typeof node !== 'object') return '';
  return (node.station_id || node.tags?.station_id || '').toString().trim();
}

export function gridKeyFromNode(node) {
  if (!node || typeof node !== 'object') return null;
  const x = node.x_grid ?? node.tags?.x_grid;
  const y = node.y_grid ?? node.tags?.y_grid;
  if (x == null || y == null) return null;
  return `${Math.round(Number(x))},${Math.round(Number(y))}`;
}

/**
 * StationData 列：黑點（非 connect，且無 connect_number）→ 與格點 (x,y) 對應，
 * 與 collectLineStationGridPointsFromStationData 一致。
 */
export function buildBlackStationGridKeySet(stationData) {
  const set = new Set();
  if (!Array.isArray(stationData)) return set;
  for (const s of stationData) {
    if (!s || typeof s !== 'object') continue;
    const nt = String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase();
    if (nt === 'connect') continue;
    if ((s.connect_number ?? s.tags?.connect_number) != null) continue;
    const x = s.x_grid ?? s.tags?.x_grid;
    const y = s.y_grid ?? s.tags?.y_grid;
    if (x == null || y == null) continue;
    set.add(`${Math.round(Number(x))},${Math.round(Number(y))}`);
  }
  return set;
}

/**
 * ConnectData／StationData／SectionData 端點中 node_type 為 connect 的格點（紅點），供 taipei_g 端點是否為「站」之檢查。
 */
export function buildConnectStationGridKeySet(connectData, stationData, sectionData) {
  const set = new Set();
  const add = (row) => {
    if (!row || typeof row !== 'object') return;
    if (String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase() !== 'connect') return;
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null) return;
    set.add(`${Math.round(Number(x))},${Math.round(Number(y))}`);
  };
  if (Array.isArray(connectData)) connectData.forEach(add);
  if (Array.isArray(stationData)) stationData.forEach(add);
  if (Array.isArray(sectionData)) {
    for (const sec of sectionData) {
      if (!sec || typeof sec !== 'object') continue;
      for (const key of ['connect_start', 'connect_end']) {
        add(sec[key]);
      }
    }
  }
  return set;
}

/**
 * 單一格點是否為圖上紅點（connect 格鍵）或黑點（Station 黑點格鍵）；與切段篩選一致。
 */
export function taipeiFNodeIsRedOrBlackStation(node, blackStationKeys, connectGridKeys) {
  if (!node || typeof node !== 'object') return false;
  const k = gridKeyFromNode(node);
  if (!k) return false;
  if (blackStationKeys && blackStationKeys.has(k)) return true;
  if (connectGridKeys && connectGridKeys.has(k)) return true;
  return false;
}

/**
 * taipei_g 切段：起點與終點皆須為圖上「紅點」或「黑點」格。
 * 不可沿用 isRouteStationVertex 之「line 但含站名／站碼」規則；也不可僅依 node_type === 'connect'
 *（merge 或空 JSON 會誤標）。僅接受格鍵在 augment 後的 Connect／Station 黑點集合內。
 */
export function taipeiFSegmentEndpointsAreStations(
  sNode,
  eNode,
  blackStationKeys,
  connectGridKeys
) {
  return (
    taipeiFNodeIsRedOrBlackStation(sNode, blackStationKeys, connectGridKeys) &&
    taipeiFNodeIsRedOrBlackStation(eNode, blackStationKeys, connectGridKeys)
  );
}

/**
 * 切段前掃描 routes：把 segment 上已標 connect／connect_number 的格與黑點（含 isBlackStationSplitVertex）
 * 併入集合，供純 JSON 或 bundle 缺欄時仍能對齊圖上紅／黑點。
 */
export function augmentTaipeiFStationGridKeysFromRoutes(
  routesData,
  blackStationKeys,
  connectGridKeys
) {
  const bk = new Set(blackStationKeys || []);
  const ck = new Set(connectGridKeys || []);
  for (const route of routesData || []) {
    for (const seg of route.segments || []) {
      const pts = seg.points;
      if (!Array.isArray(pts)) continue;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const node = getNodeAtSegmentIndex(seg, i, n);
        if (!node) continue;
        const k = gridKeyFromNode(node);
        if (node.node_type === 'connect') {
          if (k) ck.add(k);
          continue;
        }
        const cn = node.connect_number ?? node.tags?.connect_number;
        if (cn != null && cn !== '') {
          if (k) ck.add(k);
          continue;
        }
        if (isBlackStationSplitVertex(node, bk)) {
          if (k) bk.add(k);
        }
      }
    }
  }
  return { blackStationKeys: bk, connectGridKeys: ck };
}

/**
 * connect_number → 顯示字串（站名優先，無則 station_id）。
 * 合併 ConnectData、StationData 與 SectionData 之 connect_start／connect_end（縮減後格點與路段上
 * connect_number 可能不一致，Section 可補齊編號對照）。
 */
export function buildConnectNumberToLabelMap(connectData, stationData, sectionData) {
  const m = new Map();
  const add = (row) => {
    if (!row || typeof row !== 'object') return;
    if (String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase() !== 'connect') return;
    const cn = row.connect_number ?? row.tags?.connect_number;
    if (cn == null || cn === '') return;
    const key = Number(cn);
    const name = (row.station_name || row.tags?.station_name || row.tags?.name || '').trim();
    const sid = (row.station_id || row.tags?.station_id || '').toString().trim();
    const label = name || sid;
    if (!label) return;
    if (!m.has(key)) m.set(key, label);
  };
  if (Array.isArray(connectData)) connectData.forEach(add);
  if (Array.isArray(stationData)) stationData.forEach(add);
  if (Array.isArray(sectionData)) {
    for (const sec of sectionData) {
      if (!sec || typeof sec !== 'object') continue;
      for (const key of ['connect_start', 'connect_end']) {
        const p = sec[key];
        if (!p || typeof p !== 'object') continue;
        if (String(p.node_type ?? p.tags?.node_type ?? '').toLowerCase() !== 'connect') continue;
        add(p);
      }
    }
  }
  return m;
}

/** @deprecated 改用 buildConnectNumberToLabelMap（需併入 StationData） */
export function buildConnectNumberToStationName(connectData) {
  return buildConnectNumberToLabelMap(connectData, null);
}

/** 格點 → 轉乘站顯示名（僅 connect 列；含 SectionData 端點以對齊縮減後座標） */
export function buildConnectGridKeyToLabel(connectData, stationData, sectionData) {
  const m = new Map();
  const add = (row) => {
    if (!row || typeof row !== 'object') return;
    if (String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase() !== 'connect') return;
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null) return;
    const k = `${Math.round(Number(x))},${Math.round(Number(y))}`;
    const name = (row.station_name || row.tags?.station_name || row.tags?.name || '').trim();
    const sid = (row.station_id || row.tags?.station_id || '').toString().trim();
    const label = name || sid;
    if (!label) return;
    if (!m.has(k)) m.set(k, label);
  };
  if (Array.isArray(connectData)) connectData.forEach(add);
  if (Array.isArray(stationData)) stationData.forEach(add);
  if (Array.isArray(sectionData)) {
    for (const sec of sectionData) {
      if (!sec || typeof sec !== 'object') continue;
      for (const key of ['connect_start', 'connect_end']) {
        const p = sec[key];
        if (!p || typeof p !== 'object') continue;
        add(p);
      }
    }
  }
  return m;
}

/**
 * connect_number → { name, id }
 * 僅來自 spaceNetworkGridJsonData_ConnectData 與 SectionData 端點；StationData 不參與（避免與紅點重複配置）。
 * ConnectData 先寫入（同編號以先出現為準）；Section 僅補 Connect 未給的欄位。
 */
export function buildConnectNumberToNameIdMap(connectData, sectionData) {
  const m = new Map();
  const rowIsConnect = (row) =>
    row &&
    typeof row === 'object' &&
    String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase() === 'connect';

  const addFromConnect = (row) => {
    if (!rowIsConnect(row)) return;
    const cn = row.connect_number ?? row.tags?.connect_number;
    if (cn == null || cn === '') return;
    const key = Number(cn);
    if (m.has(key)) return;
    const name = (row.station_name || row.tags?.station_name || row.tags?.name || '').trim();
    const id = (row.station_id || row.tags?.station_id || '').toString().trim();
    m.set(key, { name, id });
  };

  const addFromSectionEndpoint = (row) => {
    if (!rowIsConnect(row)) return;
    const cn = row.connect_number ?? row.tags?.connect_number;
    if (cn == null || cn === '') return;
    const key = Number(cn);
    const name = (row.station_name || row.tags?.station_name || row.tags?.name || '').trim();
    const id = (row.station_id || row.tags?.station_id || '').toString().trim();
    if (!m.has(key)) {
      if (name || id) m.set(key, { name, id });
      return;
    }
    const prev = m.get(key);
    m.set(key, {
      name: prev.name || name,
      id: prev.id || id,
    });
  };

  if (Array.isArray(connectData)) connectData.forEach(addFromConnect);
  if (Array.isArray(sectionData)) {
    for (const sec of sectionData) {
      if (!sec || typeof sec !== 'object') continue;
      for (const key of ['connect_start', 'connect_end']) {
        const p = sec[key];
        if (!p || typeof p !== 'object') continue;
        addFromSectionEndpoint(p);
      }
    }
  }
  return m;
}

/**
 * 格點 → { name, id }（僅 ConnectData + SectionData connect 端點；先 Connect、Section 只補空）
 */
export function buildConnectGridKeyToNameIdMap(connectData, sectionData) {
  const m = new Map();
  const rowIsConnect = (row) =>
    row &&
    typeof row === 'object' &&
    String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase() === 'connect';

  const addFromConnect = (row) => {
    if (!rowIsConnect(row)) return;
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null) return;
    const k = `${Math.round(Number(x))},${Math.round(Number(y))}`;
    if (m.has(k)) return;
    const name = (row.station_name || row.tags?.station_name || row.tags?.name || '').trim();
    const id = (row.station_id || row.tags?.station_id || '').toString().trim();
    m.set(k, { name, id });
  };

  const addFromSectionEndpoint = (row) => {
    if (!rowIsConnect(row)) return;
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null) return;
    const k = `${Math.round(Number(x))},${Math.round(Number(y))}`;
    const name = (row.station_name || row.tags?.station_name || row.tags?.name || '').trim();
    const id = (row.station_id || row.tags?.station_id || '').toString().trim();
    if (!m.has(k)) {
      if (name || id) m.set(k, { name, id });
      return;
    }
    const prev = m.get(k);
    m.set(k, {
      name: prev.name || name,
      id: prev.id || id,
    });
  };

  if (Array.isArray(connectData)) connectData.forEach(addFromConnect);
  if (Array.isArray(sectionData)) {
    for (const sec of sectionData) {
      if (!sec || typeof sec !== 'object') continue;
      for (const key of ['connect_start', 'connect_end']) {
        const p = sec[key];
        if (!p || typeof p !== 'object') continue;
        addFromSectionEndpoint(p);
      }
    }
  }
  return m;
}

/** 「路線名｜格點」→ { name, id }（僅 SectionData；同鍵以先出現為準） */
export function buildSectionRouteGridNameIdMap(sectionData) {
  const m = new Map();
  if (!Array.isArray(sectionData)) return m;
  for (const row of sectionData) {
    const rn = (row.route_name || '').trim();
    if (!rn) continue;
    for (const key of ['connect_start', 'connect_end']) {
      const p = row[key];
      if (!p || typeof p !== 'object') continue;
      const x = p.x_grid ?? p.tags?.x_grid;
      const y = p.y_grid ?? p.tags?.y_grid;
      if (x == null || y == null) continue;
      const name = (p.station_name || p.tags?.station_name || p.tags?.name || '').trim();
      const id = (p.station_id || p.tags?.station_id || '').toString().trim();
      const gk = `${Math.round(Number(x))},${Math.round(Number(y))}`;
      const mapKey = `${rn}|${gk}`;
      if (m.has(mapKey)) continue;
      m.set(mapKey, { name, id });
    }
  }
  return m;
}

/**
 * SectionData 內所有格點（端點＋station_list）→ { name, id }；供無路線語境之黑點 tooltip。
 */
export function buildSectionGridKeyToNameIdMap(sectionData) {
  const m = new Map();
  if (!Array.isArray(sectionData)) return m;
  const addPoint = (p) => {
    if (!p || typeof p !== 'object') return;
    const x = p.x_grid ?? p.tags?.x_grid;
    const y = p.y_grid ?? p.tags?.y_grid;
    if (x == null || y == null) return;
    const name = (p.station_name || p.tags?.station_name || p.tags?.name || '').trim();
    const id = (p.station_id || p.tags?.station_id || '').toString().trim();
    const gk = `${Math.round(Number(x))},${Math.round(Number(y))}`;
    const prev = m.get(gk) || { name: '', id: '' };
    m.set(gk, {
      name: name || prev.name,
      id: id || prev.id,
    });
  };
  for (const row of sectionData) {
    addPoint(row.connect_start);
    addPoint(row.connect_end);
    for (const st of row.station_list || []) addPoint(st);
  }
  return m;
}

/** 與當前格點垂直／水平鄰格（含自身），供縮減座標與 ConnectData 差一格時對照 */
function gridKeysSelfAndOrthogonalNeighbors(gk) {
  if (!gk) return [];
  const parts = String(gk).split(',');
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [gk];
  return [`${x},${y}`, `${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`];
}

/**
 * 同路線上距離該格最近的轉乘列（Connect／Station）之站名；用於格點與表單略偏時。
 */
export function findNearestConnectLabelOnRoute(node, routeName, stationData, connectData) {
  const gx = node?.x_grid ?? node?.tags?.x_grid;
  const gy = node?.y_grid ?? node?.tags?.y_grid;
  if (gx == null || gy == null) return '';
  const rn = String(routeName || '').trim();
  if (!rn) return '';
  const fx = Number(gx);
  const fy = Number(gy);
  let best = '';
  let bestD = Infinity;
  const consider = (row) => {
    if (!row || typeof row !== 'object') return;
    if (String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase() !== 'connect') return;
    const lists = []
      .concat(Array.isArray(row.route_list) ? row.route_list : [])
      .concat(Array.isArray(row.route_name_list) ? row.route_name_list : []);
    if (!lists.some((t) => String(t).trim() === rn)) return;
    const sx = row.x_grid ?? row.tags?.x_grid;
    const sy = row.y_grid ?? row.tags?.y_grid;
    if (sx == null || sy == null) return;
    const d = Math.abs(Number(sx) - fx) + Math.abs(Number(sy) - fy);
    const name = (row.station_name || row.tags?.station_name || row.tags?.name || '').trim();
    const sid = (row.station_id || row.tags?.station_id || '').toString().trim();
    const lab = name || sid;
    if (!lab) return;
    if (d < bestD) {
      bestD = d;
      best = lab;
    }
  };
  if (Array.isArray(stationData)) stationData.forEach(consider);
  if (Array.isArray(connectData)) connectData.forEach(consider);
  return best;
}

/** 同格多筆黑點（資料重疊）→ 「站A／站B」 */
export function buildBlackStationDisplayByGrid(stationData) {
  const acc = new Map();
  if (!Array.isArray(stationData)) return acc;
  for (const s of stationData) {
    if (!s || typeof s !== 'object') continue;
    const nt = String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase();
    if (nt === 'connect') continue;
    if ((s.connect_number ?? s.tags?.connect_number) != null) continue;
    const x = s.x_grid ?? s.tags?.x_grid;
    const y = s.y_grid ?? s.tags?.y_grid;
    if (x == null || y == null) continue;
    const k = `${Math.round(Number(x))},${Math.round(Number(y))}`;
    const name = (s.station_name || s.tags?.station_name || s.tags?.name || '').trim();
    const sid = (s.station_id || s.tags?.station_id || '').toString().trim();
    const label = name || sid;
    if (!label) continue;
    if (!acc.has(k)) acc.set(k, []);
    acc.get(k).push(label);
  }
  const out = new Map();
  acc.forEach((arr, k) => {
    out.set(k, [...new Set(arr)].join('／'));
  });
  return out;
}

/**
 * 路徑上的「車站」頂點（與畫面上紅／黑一致）：
 * - 紅點：node_type === connect
 * - 黑點：格點與 StationData 黑點列相同（站名在 StationData，nodes 上常為無名 line）
 * - 其餘：含站名／站碼的 line（向後相容）
 */
export function isRouteStationVertex(node, blackStationKeys) {
  if (!node || typeof node !== 'object') return false;
  if (node.node_type === 'connect') return true;
  const k = gridKeyFromNode(node);
  if (k && blackStationKeys && blackStationKeys.has(k)) return true;
  const name = getStationName(node);
  const sid = getStationId(node);
  if (node.node_type === 'line' && (name || sid)) return true;
  return false;
}

/**
 * 路線切斷用：僅「黑點」（不含 connect 紅點）。
 * 格點落在 StationData 黑點表，或為具站名／站碼之 line 節點。
 */
export function isBlackStationSplitVertex(node, blackStationKeys) {
  if (!node || typeof node !== 'object') return false;
  if (node.node_type === 'connect') return false;
  const cn = node.connect_number ?? node.tags?.connect_number;
  if (cn != null && cn !== '') return false;
  const k = gridKeyFromNode(node);
  if (k && blackStationKeys && blackStationKeys.size > 0 && blackStationKeys.has(k)) return true;
  const name = getStationName(node);
  const sid = getStationId(node);
  if ((name || sid) && node.node_type === 'line') return true;
  return false;
}

/**
 * @deprecated 改用 isRouteStationVertex（需 StationData 黑點格）；無 layer 時語意不完整。
 */
export function isRouteStationNode(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.node_type === 'connect') return true;
  const name = getStationName(node);
  const sid = getStationId(node);
  if (node.node_type === 'line' && (name || sid)) return true;
  return false;
}

/**
 * @param {object} node
 * @param {{
 *   connectLookup?: Map<number,string>,
 *   connectGridLabelMap?: Map<string,string>,
 *   blackLabelsByGrid?: Map<string,string>,
 *   stationData?: Array,
 * }} [ctx]
 */
/**
 * 由 spaceNetworkGridJsonData_SectionData 建立「路線名｜格點」→ 站名（connect_start／connect_end 之 tags／欄位）。
 * 供 g 權重表與 Connect／Station 對照並行使用。
 */
export function buildSectionRouteGridLabelMap(sectionData) {
  const m = new Map();
  if (!Array.isArray(sectionData)) return m;
  const labelFromEndpoint = (props) => {
    if (!props || typeof props !== 'object') return '';
    const n = (props.tags?.station_name || props.tags?.name || props.station_name || '').trim();
    if (n) return n;
    const sid = (props.station_id || props.tags?.station_id || '').toString().trim();
    return sid || '';
  };
  for (const row of sectionData) {
    const rn = (row.route_name || '').trim();
    if (!rn) continue;
    for (const key of ['connect_start', 'connect_end']) {
      const p = row[key];
      if (!p) continue;
      const x = p.x_grid ?? p.tags?.x_grid;
      const y = p.y_grid ?? p.tags?.y_grid;
      if (x == null || y == null) continue;
      const lab = labelFromEndpoint(p);
      if (!lab) continue;
      const gk = `${Math.round(Number(x))},${Math.round(Number(y))}`;
      m.set(`${rn}|${gk}`, lab);
    }
  }
  return m;
}

/**
 * ConnectData 列上可能的路線名候選（與 SectionData route_name 對照用）
 */
export function collectConnectRouteNameCandidates(node) {
  const out = [];
  const push = (v) => {
    const s = String(v ?? '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  if (!node || typeof node !== 'object') return out;
  push(node.route_name);
  if (Array.isArray(node.route_name_list)) node.route_name_list.forEach(push);
  if (Array.isArray(node.route_list)) node.route_list.forEach(push);
  return out;
}

/**
 * 同時解析站點名稱與站點ID（不互換）。
 * 紅點（connect）僅依 ConnectData／SectionData 對照表與節點本體，不用 StationData、鄰格、最近點推測。
 * 黑點仍可用 sectionGridKeyToNameIdMap、StationData。
 * ctx：connectNumberToNameId、connectGridKeyToNameId、sectionRouteGridNameIdMap、sectionGridKeyToNameIdMap、
 * blackLabelsByGrid、stationData；routeName 可選（黑點／向後相容），紅點改由 node 上 route_list 候選比對 Section。
 * @returns {{ station_name: string, station_id: string }}
 */
export function resolveTaipeiFStationNameAndId(node, ctx = {}) {
  const out = { station_name: '', station_id: '' };
  if (!node || typeof node !== 'object') return out;

  const mergePartial = (name, id) => {
    const n = (name ?? '').toString().trim();
    const i = (id ?? '').toString().trim();
    if (n && !out.station_name) out.station_name = n;
    if (i && !out.station_id) out.station_id = i;
  };

  mergePartial(
    node.station_name || node.tags?.station_name || node.tags?.name,
    node.station_id || node.tags?.station_id
  );

  const {
    connectNumberToNameId,
    connectGridKeyToNameId,
    sectionRouteGridNameIdMap,
    sectionGridKeyToNameIdMap,
    blackLabelsByGrid,
    stationData,
    routeName,
  } = ctx;

  const gk = gridKeyFromNode(node);

  const isConnect =
    String(node.node_type ?? node.tags?.node_type ?? '').toLowerCase() === 'connect' ||
    (node.connect_number ?? node.tags?.connect_number) != null;

  if (isConnect) {
    const cn = node.connect_number ?? node.tags?.connect_number;
    if (cn != null && cn !== '' && connectNumberToNameId?.size) {
      const rec = connectNumberToNameId.get(Number(cn));
      if (rec) mergePartial(rec.name, rec.id);
    }
    if (gk && connectGridKeyToNameId?.size) {
      const rec = connectGridKeyToNameId.get(gk);
      if (rec) mergePartial(rec.name, rec.id);
    }

    const routeCandidates = [
      ...collectConnectRouteNameCandidates(node),
      ...(routeName ? [String(routeName).trim()] : []),
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    if (sectionRouteGridNameIdMap?.size && gk) {
      for (const rn of routeCandidates) {
        const rec = sectionRouteGridNameIdMap.get(`${rn}|${gk}`);
        if (rec) mergePartial(rec.name, rec.id);
      }
    }
    return out;
  }

  if (routeName && sectionRouteGridNameIdMap?.size && gk) {
    const rec = sectionRouteGridNameIdMap.get(`${String(routeName).trim()}|${gk}`);
    if (rec) mergePartial(rec.name, rec.id);
  }

  if (sectionGridKeyToNameIdMap?.size && gk) {
    const rec = sectionGridKeyToNameIdMap.get(gk);
    if (rec) mergePartial(rec.name, rec.id);
  }

  if (gk && blackLabelsByGrid?.size) {
    const merged = blackLabelsByGrid.get(gk);
    if (merged && !out.station_name) out.station_name = merged;
  }

  if (gk && Array.isArray(stationData)) {
    for (const s of stationData) {
      const sk = gridKeyFromNode(s);
      if (sk !== gk) continue;
      mergePartial(
        s.station_name || s.tags?.station_name || s.tags?.name,
        s.station_id || s.tags?.station_id
      );
    }
  }
  return out;
}

export function resolveTaipeiFStationLabel(node, ctx = {}) {
  if (!node || typeof node !== 'object') return '—';
  const {
    connectLookup,
    connectGridLabelMap,
    blackLabelsByGrid,
    stationData,
    connectData,
    sectionRouteGridLabelMap,
    routeName,
  } = ctx;

  const n = getStationName(node);
  if (n) return n;
  const sid = getStationId(node);
  if (sid) return sid;

  const gkForSec = gridKeyFromNode(node);
  if (routeName && sectionRouteGridLabelMap?.size && gkForSec) {
    const kSec = `${String(routeName).trim()}|${gkForSec}`;
    if (sectionRouteGridLabelMap.has(kSec)) return sectionRouteGridLabelMap.get(kSec);
  }

  if (node.node_type === 'connect') {
    const cn = node.connect_number ?? node.tags?.connect_number;
    if (cn != null && cn !== '' && connectLookup?.size) {
      const fromNum = connectLookup.get(Number(cn));
      if (fromNum) return fromNum;
    }
    const k = gridKeyFromNode(node);
    if (k && connectGridLabelMap?.size) {
      const fromGrid = connectGridLabelMap.get(k);
      if (fromGrid) return fromGrid;
      for (const nk of gridKeysSelfAndOrthogonalNeighbors(k)) {
        const g = connectGridLabelMap.get(nk);
        if (g) return g;
      }
    }
    if (k && Array.isArray(stationData)) {
      for (const s of stationData) {
        if (!s || typeof s !== 'object') continue;
        if (String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase() !== 'connect') continue;
        const sx = s.x_grid ?? s.tags?.x_grid;
        const sy = s.y_grid ?? s.tags?.y_grid;
        if (sx == null || sy == null) continue;
        if (`${Math.round(Number(sx))},${Math.round(Number(sy))}` !== k) continue;
        const sn = (s.station_name || s.tags?.station_name || s.tags?.name || '').trim();
        if (sn) return sn;
        const id = (s.station_id || s.tags?.station_id || '').toString().trim();
        if (id) return id;
      }
      for (const nk of gridKeysSelfAndOrthogonalNeighbors(k)) {
        for (const s of stationData) {
          if (!s || typeof s !== 'object') continue;
          if (String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase() !== 'connect') continue;
          const sx = s.x_grid ?? s.tags?.x_grid;
          const sy = s.y_grid ?? s.tags?.y_grid;
          if (sx == null || sy == null) continue;
          if (`${Math.round(Number(sx))},${Math.round(Number(sy))}` !== nk) continue;
          const sn = (s.station_name || s.tags?.station_name || s.tags?.name || '').trim();
          if (sn) return sn;
          const id = (s.station_id || s.tags?.station_id || '').toString().trim();
          if (id) return id;
        }
      }
    }
    const nearest = findNearestConnectLabelOnRoute(node, routeName, stationData, connectData);
    if (nearest) return nearest;
    return '—';
  }

  const k2 = gridKeyFromNode(node);
  if (k2 && blackLabelsByGrid?.size) {
    const merged = blackLabelsByGrid.get(k2);
    if (merged) return merged;
  }
  if (k2 && Array.isArray(stationData)) {
    for (const s of stationData) {
      if (!s || typeof s !== 'object') continue;
      const sx = s.x_grid ?? s.tags?.x_grid;
      const sy = s.y_grid ?? s.tags?.y_grid;
      if (sx == null || sy == null) continue;
      if (`${Math.round(Number(sx))},${Math.round(Number(sy))}` !== k2) continue;
      const sn = (s.station_name || s.tags?.station_name || s.tags?.name || '').trim();
      if (sn) return sn;
      const id = (s.station_id || s.tags?.station_id || '').toString().trim();
      if (id) return id;
    }
  }
  return '—';
}

/** @deprecated 改用 resolveTaipeiFStationLabel */
export function stationDisplayName(node) {
  return resolveTaipeiFStationLabel(node, {});
}

/** 與 dataProcessor 一致：扁平 segment 清單 vs 依路線分組 */
export function forEachSegmentInSpaceNetwork(data, fn) {
  if (!Array.isArray(data) || data.length === 0) return;
  const head = data[0];
  const isFlatSegmentList =
    head?.points && !(Array.isArray(head.segments) && head.segments.length > 0);
  let flatIdx = 0;
  if (isFlatSegmentList) {
    for (const seg of data) fn(seg, flatIdx++);
    return;
  }
  for (const route of data) {
    for (const seg of route.segments || []) fn(seg, flatIdx++);
  }
}

/**
 * 扁平 segment[] 包成 [{ segments }] 供 augment；已為依路線分組時原樣傳回。
 */
function normalizeSpaceNetworkDataToRoutesForAugment(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const head = data[0];
  const isFlatSegmentList =
    head?.points && !(Array.isArray(head.segments) && head.segments.length > 0);
  if (isFlatSegmentList) return [{ segments: data }];
  return data;
}

/**
 * `layer.spaceNetworkGridJsonData` 在 taipei_f 流程可能為扁平 segment[]（與依路線分組格式並存）。
 * DataTable 建表需 `route.segments[]`，此函式將扁平清單依 route_name 還原分組。
 */
export function taipeiFSpaceNetworkDataToRoutesForDataTable(data) {
  if (!Array.isArray(data) || data.length === 0) return data;
  const head = data[0];
  const isFlatSegmentList =
    head?.points && !(Array.isArray(head.segments) && head.segments.length > 0);
  if (!isFlatSegmentList) return data;
  const groups = new Map();
  for (const seg of data) {
    const rn = String(seg.route_name || seg.name || 'Unknown');
    if (!groups.has(rn)) groups.set(rn, { route_name: rn, name: rn, segments: [] });
    groups.get(rn).segments.push(seg);
  }
  return Array.from(groups.values());
}

/**
 * Station／Connect／Section 建表後，再掃描路網節點擴充格鍵；供切段、DataTable、隨機權重共用。
 */
export function buildAugmentedTaipeiFEndpointGridKeys(spaceNetworkOrRoutesData, options = {}) {
  let blackStationKeys = buildBlackStationGridKeySet(options.stationData);
  let connectGridKeys = buildConnectStationGridKeySet(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const routes = normalizeSpaceNetworkDataToRoutesForAugment(spaceNetworkOrRoutesData);
  return augmentTaipeiFStationGridKeysFromRoutes(routes, blackStationKeys, connectGridKeys);
}

/**
 * 建 DataTable 列：同一路線上沿 points 順序之「相鄰車站頂點」各一筆 segment（與 applyRandomWeightsBetweenAdjacentStations 一致）。
 * 站名／格點對照使用 `options.stationData`（spaceNetworkGridJsonData_StationData）。
 * 欄位：#、路線、車站名稱1、車站名稱2、座標1、座標2、路段序（扁平路段序 1-based，與 layout-network-grid-k3 之 _flatSegmentIndex+1 對齊）、
 * w1／w2（與 weight 相同，供 buildRouteSequenceWeightLookupFromTaipeiK3DataTable）、weight（若有對應 station_weights 則填入，否則 undefined）
 * （另含隱藏用 start_idx / end_idx）。
 * @param {{
 *   connectData?: Array,
 *   stationData?: Array,
 *   sectionData?: Array,
 * }} [options] 與 e 匯出同源（Section／Connect／Station），供站名與格點對照
 */
export function buildTaipeiFDataTableRowsFromSpaceNetwork(spaceNetworkData, options = {}) {
  const connectLookup = buildConnectNumberToLabelMap(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const connectGridLabelMap = buildConnectGridKeyToLabel(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const blackLabelsByGrid = buildBlackStationDisplayByGrid(options.stationData);
  const { blackStationKeys, connectGridKeys } = buildAugmentedTaipeiFEndpointGridKeys(
    spaceNetworkData,
    options
  );
  const sectionRouteGridLabelMap = buildSectionRouteGridLabelMap(options.sectionData);
  const labelCtx = {
    connectLookup,
    connectGridLabelMap,
    blackLabelsByGrid,
    stationData: options.stationData,
    connectData: options.connectData,
    sectionRouteGridLabelMap,
  };

  const formatCoordCell = (node) => {
    const k = gridKeyFromNode(node);
    if (!k) return '—';
    const [x, y] = k.split(',');
    return `(${x}, ${y})`;
  };

  const findWeightForIndices = (stationWeights, start_idx, end_idx) => {
    if (!Array.isArray(stationWeights)) return undefined;
    for (const w of stationWeights) {
      if (w?.start_idx === start_idx && w?.end_idx === end_idx) return w.weight;
    }
    return undefined;
  };

  const rows = [];
  forEachSegmentInSpaceNetwork(spaceNetworkData, (seg, flatSegIdx0) => {
    const routeFlatOneBased = flatSegIdx0 + 1;
    const routeName = seg.route_name || seg.name || 'Unknown';
    const points = seg.points;
    if (!Array.isArray(points) || points.length < 2) return;
    const n = points.length;
    const stationIndices = [];
    for (let i = 0; i < n; i++) {
      const node = getNodeAtSegmentIndex(seg, i, n);
      if (taipeiFNodeIsRedOrBlackStation(node, blackStationKeys, connectGridKeys)) {
        stationIndices.push(i);
      }
    }
    const sw = seg.station_weights;
    for (let r = 0; r < stationIndices.length - 1; r++) {
      const start_idx = stationIndices[r];
      const end_idx = stationIndices[r + 1];
      if (start_idx >= end_idx) continue;
      const sNode = getNodeAtSegmentIndex(seg, start_idx, n);
      const eNode = getNodeAtSegmentIndex(seg, end_idx, n);
      const ctxWithRoute = { ...labelCtx, routeName };
      const rawNav = seg.nav_weight;
      const nav_weight = rawNav != null && Number.isFinite(Number(rawNav)) ? Number(rawNav) : 1;
      const pairW = findWeightForIndices(sw, start_idx, end_idx);
      const wholeW = sw?.[0]?.weight;
      const weight =
        pairW != null && Number.isFinite(Number(pairW))
          ? Number(pairW)
          : wholeW != null && Number.isFinite(Number(wholeW))
            ? Number(wholeW)
            : null;
      const wForTable = weight != null && Number.isFinite(Number(weight)) ? Number(weight) : null;
      rows.push({
        路線: routeName,
        車站名稱1: resolveTaipeiFStationLabel(sNode, ctxWithRoute),
        車站名稱2: resolveTaipeiFStationLabel(eNode, ctxWithRoute),
        座標1: formatCoordCell(sNode),
        座標2: formatCoordCell(eNode),
        路段序: String(routeFlatOneBased),
        w1: wForTable,
        w2: wForTable,
        weight,
        nav_weight,
        start_idx,
        end_idx,
      });
    }
  });
  rows.sort((a, b) => {
    const c = String(a.路線).localeCompare(String(b.路線));
    if (c !== 0) return c;
    const d = (a.start_idx ?? 0) - (b.start_idx ?? 0);
    if (d !== 0) return d;
    return (a.end_idx ?? 0) - (b.end_idx ?? 0);
  });
  return rows.map((row, index) => ({
    '#': index + 1,
    路線: row.路線,
    車站名稱1: row.車站名稱1,
    車站名稱2: row.車站名稱2,
    座標1: row.座標1,
    座標2: row.座標2,
    路段序: row.路段序,
    w1: row.w1,
    w2: row.w2,
    weight: row.weight,
    nav_weight: row.nav_weight,
    start_idx: row.start_idx,
    end_idx: row.end_idx,
  }));
}

/**
 * 僅 dataTableData 每列的 weight 依等比分布（與 sampleWeight1to9Biased）重抽；不修改 station_weights，圖面維持 JSON。
 */
export function buildTaipeiFDataTableWithBiasedWeightResample(
  spaceNetworkData,
  rng = Math.random,
  options = {}
) {
  const rows = buildTaipeiFDataTableRowsFromSpaceNetwork(spaceNetworkData, options);
  return rows.map((row) => {
    const w = sampleWeight1to9Biased(rng);
    return {
      ...row,
      weight: w,
      w1: w,
      w2: w,
    };
  });
}

/**
 * 對每個 segment：沿 points 順序找出相鄰「車站」頂點（紅 connect；黑則以 StationData 格點對應），
 * 每對相鄰站點之間一筆 station_weights：{ start_idx, end_idx, weight }。
 * weight 預設為 1～9 加權隨機（等比級數 2^(9−k)，1 最高）；可傳 options.sampleWeight 改為其他抽樣（如 1～10 反比級數）。會就地改寫 spaceNetworkData（影響路網繪製）。
 * @param {{
 *   connectData?: Array,
 *   stationData?: Array,
 *   sectionData?: Array,
 *   sampleWeight?: (rng: () => number) => number,
 * }} [options] 需含 StationData 才能含黑點站段；SectionData 用於站名對照
 */
export function applyRandomWeightsBetweenAdjacentStations(
  spaceNetworkData,
  rng = Math.random,
  options = {}
) {
  const sampleWeight =
    typeof options.sampleWeight === 'function' ? options.sampleWeight : sampleWeight1to9Biased;
  const { blackStationKeys, connectGridKeys } = buildAugmentedTaipeiFEndpointGridKeys(
    spaceNetworkData,
    options
  );
  let segmentCount = 0;
  let weightEntryCount = 0;

  forEachSegmentInSpaceNetwork(spaceNetworkData, (seg) => {
    segmentCount++;
    const points = seg.points;
    if (!Array.isArray(points) || points.length < 2) {
      seg.station_weights = [];
      return;
    }
    const n = points.length;
    const stationIndices = [];
    for (let i = 0; i < n; i++) {
      const node = getNodeAtSegmentIndex(seg, i, n);
      if (taipeiFNodeIsRedOrBlackStation(node, blackStationKeys, connectGridKeys)) {
        stationIndices.push(i);
      }
    }
    const weights = [];
    for (let r = 0; r < stationIndices.length - 1; r++) {
      const start_idx = stationIndices[r];
      const end_idx = stationIndices[r + 1];
      if (start_idx >= end_idx) continue;
      weights.push({
        start_idx,
        end_idx,
        weight: sampleWeight(rng),
      });
      weightEntryCount++;
    }
    seg.station_weights = weights;
  });

  const dataTableRows = buildTaipeiFDataTableRowsFromSpaceNetwork(spaceNetworkData, options);
  return { segmentCount, weightEntryCount, dataTableRows };
}

/**
 * 折線頂點 splice／插入轉折後：依目前 points 上相鄰「紅／黑站」頂點重建每筆 station_weights 的 start_idx／end_idx，
 * 盡量保留原有 weight 數值（精確索引、舊區間包容、或依序對應），避免黑點位移後權重列被清空。
 * @param {object} seg
 * @param {object} layer 需含 layerId、taipei_f 之 spaceNetworkGridJsonData 與 Connect／Station／Section bundle
 * @param {{ fallbackOrderedWeights?: number[] }} [extra] remap 後無有效區間時，依序沿用這些 weight 數值
 */
export function realignTaipeiFSegmentStationWeightsPreserveOrder(seg, layer, extra = {}) {
  if (!seg || !layer || !isTaipeiTestFLayerTab(layer.layerId)) return;
  const fallbackOrdered = Array.isArray(extra.fallbackOrderedWeights)
    ? extra.fallbackOrderedWeights.filter((n) => Number.isFinite(Number(n))).map((n) => Number(n))
    : null;
  const net = layer.spaceNetworkGridJsonData;
  if (!Array.isArray(net)) return;
  const options = {
    stationData: layer.spaceNetworkGridJsonData_StationData,
    connectData: layer.spaceNetworkGridJsonData_ConnectData,
    sectionData: layer.spaceNetworkGridJsonData_SectionData,
  };
  const { blackStationKeys, connectGridKeys } = buildAugmentedTaipeiFEndpointGridKeys(net, options);
  const points = seg.points;
  if (!Array.isArray(points) || points.length < 2) {
    seg.station_weights = [];
    return;
  }
  const n = points.length;
  const stationIndices = [];
  for (let i = 0; i < n; i++) {
    const node = getNodeAtSegmentIndex(seg, i, n);
    if (taipeiFNodeIsRedOrBlackStation(node, blackStationKeys, connectGridKeys)) {
      stationIndices.push(i);
    }
  }
  if (stationIndices.length < 2) {
    seg.station_weights = [];
    return;
  }

  const oldSorted = (Array.isArray(seg.station_weights) ? seg.station_weights : [])
    .filter((w) => w && typeof w === 'object')
    .map((w) => ({
      start_idx: Math.round(Number(w.start_idx)),
      end_idx: Math.round(Number(w.end_idx)),
      weight: w.weight,
    }))
    .filter(
      (w) => Number.isFinite(w.start_idx) && Number.isFinite(w.end_idx) && w.start_idx < w.end_idx
    )
    .sort((a, b) => a.start_idx - b.start_idx || a.end_idx - b.end_idx);

  const pickWeight = (k, a, b) => {
    const exact = oldSorted.find((w) => w.start_idx === a && w.end_idx === b);
    if (exact != null && Number.isFinite(Number(exact.weight))) return Number(exact.weight);
    let best = null;
    let bestSpan = Infinity;
    for (const w of oldSorted) {
      if (w.start_idx <= a && w.end_idx >= b) {
        const span = w.end_idx - w.start_idx;
        if (span < bestSpan) {
          bestSpan = span;
          best = w;
        }
      }
    }
    if (best != null && Number.isFinite(Number(best.weight))) return Number(best.weight);
    const byOrder = oldSorted[k];
    if (byOrder != null && Number.isFinite(Number(byOrder.weight))) return Number(byOrder.weight);
    const last = oldSorted[oldSorted.length - 1];
    if (last != null && Number.isFinite(Number(last.weight))) return Number(last.weight);
    if (fallbackOrdered && fallbackOrdered.length) {
      return fallbackOrdered[Math.min(k, fallbackOrdered.length - 1)];
    }
    return 5;
  };

  const weights = [];
  for (let r = 0; r < stationIndices.length - 1; r++) {
    const start_idx = stationIndices[r];
    const end_idx = stationIndices[r + 1];
    if (start_idx >= end_idx) continue;
    weights.push({
      start_idx,
      end_idx,
      weight: pickWeight(r, start_idx, end_idx),
    });
  }
  seg.station_weights = weights;
}

/** @deprecated 改用 applyRandomWeightsBetweenAdjacentStations */
export function applyRandomWeightsBetweenConnectNodes(spaceNetworkData, rng = Math.random) {
  return applyRandomWeightsBetweenAdjacentStations(spaceNetworkData, rng, {});
}

function xyFromPoint(pt) {
  if (pt == null) return [NaN, NaN];
  const x = Array.isArray(pt) ? pt[0] : pt.x;
  const y = Array.isArray(pt) ? pt[1] : pt.y;
  return [Number(x), Number(y)];
}

/** 與 dataProcessor 網格線段一致：Bresenham 經過的整數格點（含端點） */
export function bresenhamGridCells(ax, ay, bx, by) {
  ax = Math.round(ax);
  ay = Math.round(ay);
  bx = Math.round(bx);
  by = Math.round(by);
  const out = [];
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx - dy;
  let x = ax;
  let y = ay;
  const maxSteps = dx + dy + 2;
  for (let s = 0; s < maxSteps; s++) {
    out.push([x, y]);
    if (x === bx && y === by) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** 單位格邊 → 該邊所屬網格單元中心 (ix+0.5, iy+0.5)，與 taipei_g 權重格心標一致 */
export function taipeiFCellCenterForUnitGridEdge(v0, v1) {
  const x0 = v0[0];
  const y0 = v0[1];
  const x1 = v1[0];
  const y1 = v1[1];
  if (x0 === x1) return [x0 + 0.5, Math.min(y0, y1) + 0.5];
  if (y0 === y1) return [Math.min(x0, x1) + 0.5, y0 + 0.5];
  return [Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5];
}

/**
 * 沿 refCoords 上 [start_idx, end_idx] 站間路徑，列出經過之網格單元中心（去重）。
 * @param {Array<Array<number>>} refCoords
 * @returns {Array<[number, number]>}
 */
export function collectTaipeiFWeightCellCentersBetweenRefIndices(refCoords, start_idx, end_idx) {
  if (!Array.isArray(refCoords) || start_idx >= end_idx) return [];
  const seen = new Set();
  const out = [];
  for (let i = start_idx; i < end_idx; i++) {
    const ax = Math.round(Number(refCoords[i][0]));
    const ay = Math.round(Number(refCoords[i][1]));
    const bx = Math.round(Number(refCoords[i + 1][0]));
    const by = Math.round(Number(refCoords[i + 1][1]));
    const verts = bresenhamGridCells(ax, ay, bx, by);
    for (let j = 0; j < verts.length - 1; j++) {
      const cc = taipeiFCellCenterForUnitGridEdge(verts[j], verts[j + 1]);
      const key = `${cc[0]},${cc[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(cc);
      }
    }
  }
  return out;
}

/** 站點到線段的最短距離（格心／半格與整數格可對齊）；小於約 0.55 視為同一路線上 */
function stationNearSegment(sx, sy, x0, y0, x1, y1, tol = 0.55) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(sx - x0, sy - y0) < tol;
  let t = ((sx - x0) * dx + (sy - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x0 + t * dx;
  const qy = y0 + t * dy;
  return Math.hypot(sx - qx, sy - qy) < tol;
}

/** 投影參數 t∈[0,1]，供沿邊排序 */
function projectT(sx, sy, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return 0;
  let t = ((sx - x0) * dx + (sy - y0) * dy) / len2;
  return Math.max(0, Math.min(1, t));
}

function isStationDataBlackRow(s) {
  if (!s || typeof s !== 'object') return false;
  const nt = String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase();
  if (nt === 'connect') return false;
  if (
    (s.connect_number ?? s.tags?.connect_number) != null &&
    String(s.connect_number).trim() !== ''
  ) {
    return false;
  }
  return true;
}

/**
 * 稀疏 polyline 時，黑點可能落在兩頂點之間而未出現在 points[]；且路徑可能是格心 (ix+0.5)
 * 與 StationData 整數格差 0.5，僅用 Bresenham 會對不到。
 * 作法：Bresenham 上的端點／黑點格 + 以幾何貼近線段篩選 StationData 黑點，合併後依投影 t 排序。
 */
export function densifyPointsWithBlackStations(points, blackStationKeys, stationData) {
  if (!Array.isArray(points) || points.length < 2)
    return Array.isArray(points) ? points.slice() : [];
  if (!blackStationKeys || blackStationKeys.size === 0) return points.slice();
  const merged = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = xyFromPoint(points[i]);
    const [x1, y1] = xyFromPoint(points[i + 1]);
    if (
      !Number.isFinite(x0) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y1)
    ) {
      continue;
    }
    const rx0 = Math.round(x0);
    const ry0 = Math.round(y0);
    const rx1 = Math.round(x1);
    const ry1 = Math.round(y1);
    const line = bresenhamGridCells(rx0, ry0, rx1, ry1);
    const stops = [];
    const pushStop = (gx, gy, t) => {
      const key = `${gx},${gy}`;
      stops.push({ gx, gy, t, key });
    };
    for (const [gx, gy] of line) {
      const key = `${gx},${gy}`;
      const isEnd = (gx === rx0 && gy === ry0) || (gx === rx1 && gy === ry1);
      const isBlack = blackStationKeys.has(key);
      if (isEnd || isBlack) {
        const t = projectT(gx + 0.5, gy + 0.5, x0, y0, x1, y1);
        pushStop(gx, gy, t);
      }
    }
    if (Array.isArray(stationData)) {
      for (const s of stationData) {
        if (!isStationDataBlackRow(s)) continue;
        const sx = s.x_grid ?? s.tags?.x_grid;
        const sy = s.y_grid ?? s.tags?.y_grid;
        if (sx == null || sy == null) continue;
        const fx = Number(sx);
        const fy = Number(sy);
        if (!stationNearSegment(fx, fy, x0, y0, x1, y1)) continue;
        const gx = Math.round(fx);
        const gy = Math.round(fy);
        if (!blackStationKeys.has(`${gx},${gy}`)) continue;
        const t = projectT(fx, fy, x0, y0, x1, y1);
        pushStop(gx, gy, t);
      }
    }
    stops.sort((a, b) => a.t - b.t || a.gx - b.gx || a.gy - b.gy);
    const chunk = [];
    const seen = new Set();
    for (const s of stops) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      chunk.push([s.gx, s.gy]);
    }
    if (chunk.length === 0) continue;
    if (merged.length === 0) {
      merged.push(...chunk.map(([x, y]) => [x, y]));
    } else {
      merged.push(...chunk.slice(1).map(([x, y]) => [x, y]));
    }
  }
  return merged.length >= 2 ? merged : points.slice();
}

/** 空 {} 的 properties_start/end 不應觸發 merge，否則會把預設 node_type 寫成 connect。 */
function hasMeaningfulTaipeiFParentEndpointProps(p) {
  if (!p || typeof p !== 'object') return false;
  if (Object.keys(p).length === 0) return false;
  if (p.node_type != null && String(p.node_type).trim() !== '') return true;
  if (p.station_name || p.station_id) return true;
  if (p.connect_number != null && String(p.connect_number).trim() !== '') return true;
  if (p.tags && Object.keys(p.tags).length > 0) return true;
  return false;
}

/**
 * 切段後若僅剩格點 line（無 connect_number），從父段 properties_start／end 補上
 * SectionData／匯出時寫入的 station_name、connect_number、tags，供 DataTable 顯示。
 */
function mergeTaipeiFEndpointFromParentProps(synthetic, parentProps) {
  if (!parentProps || typeof parentProps !== 'object') return synthetic;
  const stationName = (
    parentProps.station_name ||
    parentProps.tags?.station_name ||
    parentProps.tags?.name ||
    ''
  ).trim();
  const stationId = (parentProps.station_id || parentProps.tags?.station_id || '')
    .toString()
    .trim();
  const cn = parentProps.connect_number ?? parentProps.tags?.connect_number;
  const out = {
    ...parentProps,
    ...(synthetic || {}),
    node_type: parentProps.node_type || synthetic?.node_type || 'line',
    tags: { ...(parentProps.tags || {}), ...(synthetic?.tags || {}) },
  };
  if (stationName) out.station_name = stationName;
  if (stationId) out.station_id = stationId;
  if (cn != null && cn !== '') out.connect_number = cn;
  return out;
}

/**
 * taipei_g 切段後：依「路段端點」匯集 route_name。
 * 同一格僅一種路線 → 黑點（StationData line）；多種路線 → 紅點（ConnectData connect）。
 */
export function rebuildTaipeiFStationConnectAfterSplit(routesData, options = {}) {
  const oldStation = Array.isArray(options.stationData) ? options.stationData : [];
  const oldConnect = Array.isArray(options.connectData) ? options.connectData : [];

  const pointKey = (x, y) => `${Math.round(Number(x))},${Math.round(Number(y))}`;
  const routeKeySorted = (set) =>
    [...set]
      .map((r) => String(r ?? '').trim())
      .filter((r) => r !== '')
      .sort();

  /** @type {Map<string, { x: number, y: number, routes: Set<string> }>} */
  const endpointRoutes = new Map();
  const addEndpoint = (x, y, routeName) => {
    if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return;
    const ix = Math.round(Number(x));
    const iy = Math.round(Number(y));
    const k = pointKey(ix, iy);
    const rn = String(routeName || '').trim() || 'Unknown';
    if (!endpointRoutes.has(k)) {
      endpointRoutes.set(k, { x: ix, y: iy, routes: new Set() });
    }
    endpointRoutes.get(k).routes.add(rn);
  };

  for (const route of routesData || []) {
    const rn = route.route_name || route.name || 'Unknown';
    for (const seg of route.segments || []) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 1) continue;
      const p0 = pts[0];
      const p1 = pts[pts.length - 1];
      const x0 = Array.isArray(p0) ? p0[0] : p0?.x;
      const y0 = Array.isArray(p0) ? p0[1] : p0?.y;
      const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
      const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
      addEndpoint(x0, y0, rn);
      if (pts.length >= 2) addEndpoint(x1, y1, rn);
    }
  }

  let nextCn = 1;
  for (const c of oldConnect) {
    const n = Number(c?.connect_number ?? c?.tags?.connect_number);
    if (Number.isFinite(n) && n >= nextCn) nextCn = n + 1;
  }

  const stationRowRichness = (obj) => {
    if (!obj || typeof obj !== 'object') return -1;
    const sid = String(obj.station_id ?? obj.tags?.station_id ?? '').trim();
    const sname = String(obj.station_name ?? obj.tags?.station_name ?? obj.tags?.name ?? '').trim();
    const routeHint = String(obj.route_hint ?? obj.tags?.route_hint ?? '').trim();
    const tagCount = obj.tags && typeof obj.tags === 'object' ? Object.keys(obj.tags).length : 0;
    let score = 0;
    if (sid) score += 6;
    if (sname) score += 6;
    if (routeHint) score += 2;
    score += Math.min(tagCount, 10);
    return score;
  };

  /** 舊黑點列：同格可能多筆，保留「資訊最完整」一筆供繼承。 */
  const blackByGrid = new Map();
  /** 舊黑點列（同格多筆）完整清單，供補齊欄位。 */
  const blackRowsByGrid = new Map();
  for (const s of oldStation) {
    if (!s || typeof s !== 'object') continue;
    if (String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase() === 'connect') continue;
    if (
      (s.connect_number ?? s.tags?.connect_number) != null &&
      String(s.connect_number).trim() !== ''
    ) {
      continue;
    }
    const gx = s.x_grid ?? s.tags?.x_grid;
    const gy = s.y_grid ?? s.tags?.y_grid;
    if (gx == null || gy == null) continue;
    const k = pointKey(gx, gy);
    if (!blackRowsByGrid.has(k)) blackRowsByGrid.set(k, []);
    blackRowsByGrid.get(k).push(s);
    const prev = blackByGrid.get(k);
    if (!prev || stationRowRichness(s) > stationRowRichness(prev)) blackByGrid.set(k, s);
  }

  const pickNameIdFromRow = (obj) => {
    if (!obj || typeof obj !== 'object') return { station_name: '', station_id: '' };
    const station_name = (
      obj.station_name ||
      obj.tags?.station_name ||
      obj.tags?.name ||
      ''
    ).trim();
    const station_id = (obj.station_id || obj.tags?.station_id || '').toString().trim();
    return { station_name, station_id };
  };

  /** 與黑點列一致：紅點 connect 也應有站名／站碼（來自同格舊黑點、舊 Connect、或路段端點節點） */
  const labelsFromRoutesAtGrid = (gx, gy) => {
    const want = pointKey(gx, gy);
    let station_name = '';
    let station_id = '';
    for (const route of routesData || []) {
      for (const seg of route.segments || []) {
        const pts = seg.points;
        if (!Array.isArray(pts) || pts.length < 1) continue;
        const n = pts.length;
        for (const idx of [0, n - 1]) {
          const pt = pts[idx];
          const px = Array.isArray(pt) ? pt[0] : pt?.x;
          const py = Array.isArray(pt) ? pt[1] : pt?.y;
          if (pointKey(px, py) !== want) continue;
          const node = getNodeAtSegmentIndex(seg, idx, n);
          if (!node) continue;
          const p = pickNameIdFromRow(node);
          if (p.station_name && !station_name) station_name = p.station_name;
          if (p.station_id && !station_id) station_id = p.station_id;
        }
      }
    }
    return { station_name, station_id };
  };

  const mergeMissingFromObj = (base, extra) => {
    if (!extra || typeof extra !== 'object') return base;
    const out = base && typeof base === 'object' ? base : {};
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'tags') continue;
      if (out[k] == null || out[k] === '') out[k] = v;
    }
    const baseTags = out.tags && typeof out.tags === 'object' ? out.tags : {};
    const extraTags = extra.tags && typeof extra.tags === 'object' ? extra.tags : {};
    for (const [k, v] of Object.entries(extraTags)) {
      if (baseTags[k] == null || baseTags[k] === '') baseTags[k] = v;
    }
    if (Object.keys(baseTags).length > 0) out.tags = baseTags;
    return out;
  };

  const bestRouteEndpointNodeAtGrid = (gx, gy, routeName = '') => {
    const want = pointKey(gx, gy);
    let best = null;
    let bestScore = -1;
    const wantedRoute = String(routeName || '').trim();
    for (const route of routesData || []) {
      const rn = String(route.route_name || route.name || '').trim();
      if (wantedRoute && rn && rn !== wantedRoute) continue;
      for (const seg of route.segments || []) {
        const pts = seg.points;
        if (!Array.isArray(pts) || pts.length < 1) continue;
        const n = pts.length;
        for (const idx of [0, n - 1]) {
          const pt = pts[idx];
          const px = Array.isArray(pt) ? pt[0] : pt?.x;
          const py = Array.isArray(pt) ? pt[1] : pt?.y;
          if (pointKey(px, py) !== want) continue;
          const node = getNodeAtSegmentIndex(seg, idx, n);
          if (!node || typeof node !== 'object') continue;
          const score = stationRowRichness(node);
          if (score > bestScore) {
            bestScore = score;
            best = node;
          }
        }
      }
    }
    return best;
  };

  const fillConnectRowDisplay = (row) => {
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null) return;
    const k = pointKey(x, y);
    let fromBlack = blackByGrid.get(k);
    if (!fromBlack) {
      for (const s of oldStation) {
        if (!s || typeof s !== 'object') continue;
        if (String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase() === 'connect') continue;
        const gx = s.x_grid ?? s.tags?.x_grid;
        const gy = s.y_grid ?? s.tags?.y_grid;
        if (gx == null || gy == null) continue;
        if (pointKey(gx, gy) !== k) continue;
        fromBlack = s;
        break;
      }
    }
    let nameIdFromOldConnect = { station_name: '', station_id: '' };
    let oldConnectRowAtGrid = null;
    for (const c of oldConnect) {
      if (!c || typeof c !== 'object') continue;
      const cx = c.x_grid ?? c.tags?.x_grid;
      const cy = c.y_grid ?? c.tags?.y_grid;
      if (cx == null || cy == null) continue;
      if (pointKey(cx, cy) !== k) continue;
      const p = pickNameIdFromRow(c);
      if (p.station_name || p.station_id) {
        nameIdFromOldConnect = p;
        oldConnectRowAtGrid = c;
        break;
      }
    }
    const fromRoutes = labelsFromRoutesAtGrid(x, y);
    const cur = pickNameIdFromRow(row);
    const fb = pickNameIdFromRow(fromBlack);
    const station_name =
      cur.station_name ||
      fb.station_name ||
      nameIdFromOldConnect.station_name ||
      fromRoutes.station_name ||
      '';
    const station_id =
      cur.station_id ||
      fb.station_id ||
      nameIdFromOldConnect.station_id ||
      fromRoutes.station_id ||
      '';
    if (station_name) row.station_name = station_name;
    if (station_id) row.station_id = station_id;
    const mergedTags = { ...(row.tags && typeof row.tags === 'object' ? row.tags : {}) };
    if (fromBlack?.tags && typeof fromBlack.tags === 'object') {
      for (const [key, val] of Object.entries(fromBlack.tags)) {
        if (mergedTags[key] == null || mergedTags[key] === '') mergedTags[key] = val;
      }
    }
    if (oldConnectRowAtGrid?.tags && typeof oldConnectRowAtGrid.tags === 'object') {
      for (const [key, val] of Object.entries(oldConnectRowAtGrid.tags)) {
        if (mergedTags[key] == null || mergedTags[key] === '') mergedTags[key] = val;
      }
    }
    if (Object.keys(mergedTags).length) row.tags = mergedTags;
  };

  const stationData = [];
  const connectData = [];

  endpointRoutes.forEach(({ x, y, routes }) => {
    const sorted = routeKeySorted(routes);
    if (routes.size > 1) {
      const route_list = sorted;
      let matched = null;
      for (const c of oldConnect) {
        if (!c || typeof c !== 'object') continue;
        const cx = c.x_grid ?? c.tags?.x_grid;
        const cy = c.y_grid ?? c.tags?.y_grid;
        if (cx == null || cy == null) continue;
        if (pointKey(cx, cy) !== pointKey(x, y)) continue;
        const oldRoutes = new Set(
          []
            .concat(c.route_list || [])
            .concat(c.route_name_list || [])
            .map((r) => String(r ?? '').trim())
            .filter(Boolean)
        );
        if (routeKeySorted(oldRoutes).join('|') !== sorted.join('|')) continue;
        matched = JSON.parse(JSON.stringify(c));
        matched.x_grid = x;
        matched.y_grid = y;
        matched.route_list = route_list;
        matched.route_name_list = route_list.slice();
        break;
      }
      if (matched) {
        fillConnectRowDisplay(matched);
        connectData.push(matched);
      } else {
        const newRow = {
          node_type: 'connect',
          x_grid: x,
          y_grid: y,
          connect_number: nextCn++,
          route_list,
          route_name_list: route_list.slice(),
          tags: {},
        };
        fillConnectRowDisplay(newRow);
        connectData.push(newRow);
      }
    } else {
      const onlyRoute = sorted[0] || 'Unknown';
      const k = pointKey(x, y);
      const fromOld = blackByGrid.get(k);
      if (fromOld) {
        const row = JSON.parse(JSON.stringify(fromOld));
        const sameGridRows = blackRowsByGrid.get(k) || [];
        for (const cand of sameGridRows) mergeMissingFromObj(row, cand);
        const fromRouteNode = bestRouteEndpointNodeAtGrid(x, y, onlyRoute);
        mergeMissingFromObj(row, fromRouteNode);
        row.x_grid = x;
        row.y_grid = y;
        row.node_type = row.node_type || 'line';
        delete row.connect_number;
        if (row.tags) delete row.tags.connect_number;
        if (!row.tags || typeof row.tags !== 'object') row.tags = {};
        if (!row.tags.route_hint) row.tags.route_hint = onlyRoute;
        stationData.push(row);
      } else {
        const fromRouteNode = bestRouteEndpointNodeAtGrid(x, y, onlyRoute);
        if (fromRouteNode && typeof fromRouteNode === 'object') {
          const row = JSON.parse(JSON.stringify(fromRouteNode));
          row.x_grid = x;
          row.y_grid = y;
          // 匯出檔起迄常為 connect；此分支僅在「同格單一路線」時進來，圖上應畫黑點（line），
          // 不可保留 connect，否則 collectLineStationGridPointsFromStationData 會略過且紅點也不畫（<2 路線）。
          row.node_type = 'line';
          delete row.connect_number;
          if (row.tags && typeof row.tags === 'object') delete row.tags.connect_number;
          if (!row.tags || typeof row.tags !== 'object') row.tags = {};
          if (!row.tags.route_hint) row.tags.route_hint = onlyRoute;
          stationData.push(row);
        } else {
          stationData.push({
            node_type: 'line',
            x_grid: x,
            y_grid: y,
            station_name: '',
            station_id: '',
            tags: { route_hint: onlyRoute },
          });
        }
      }
    }
  });

  return { stationData, connectData };
}

function taipeiFSegmentGridKeysFromPoints(seg) {
  const pts = seg?.points;
  if (!Array.isArray(pts)) return [];
  const out = [];
  for (const p of pts) {
    const x = Math.round(Number(Array.isArray(p) ? p[0] : p?.x));
    const y = Math.round(Number(Array.isArray(p) ? p[1] : p?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    out.push(`${x},${y}`);
  }
  return out;
}

function taipeiFGridKeyArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** short 為 long 的連續子序列，或 short 反序後為 long 的連續子序列；至少 2 格。 */
function taipeiFGridPathIsContiguousSubpath(shortKeys, longKeys) {
  if (shortKeys.length < 2 || longKeys.length < shortKeys.length) return false;
  const rev = [...shortKeys].reverse();
  outer: for (let start = 0; start <= longKeys.length - shortKeys.length; start++) {
    for (let i = 0; i < shortKeys.length; i++) {
      if (longKeys[start + i] !== shortKeys[i]) continue outer;
    }
    return true;
  }
  outer2: for (let start = 0; start <= longKeys.length - rev.length; start++) {
    for (let i = 0; i < rev.length; i++) {
      if (longKeys[start + i] !== rev[i]) continue outer2;
    }
    return true;
  }
  return false;
}

/**
 * 兩段路徑在格點序列上重疊：完全相同、一端為另一端之反序、或一段為另一段之連續子路徑（含反序對齊）。
 */
export function taipeiFSegmentPathsOverlapGridKeys(ka, kb) {
  if (!Array.isArray(ka) || !Array.isArray(kb) || ka.length < 2 || kb.length < 2) return false;
  if (taipeiFGridKeyArraysEqual(ka, kb)) return true;
  if (taipeiFGridKeyArraysEqual(ka, [...kb].reverse())) return true;
  if (taipeiFGridPathIsContiguousSubpath(ka, kb)) return true;
  if (taipeiFGridPathIsContiguousSubpath(kb, ka)) return true;
  return false;
}

function taipeiFSegmentGridSpanWeightAtEnd(seg) {
  const sw = seg?.station_weights;
  if (!Array.isArray(sw) || sw.length === 0) return null;
  const n = seg.points?.length ?? 0;
  if (n < 2) return null;
  const hit = sw.find((w) => Number(w?.end_idx) === n - 1);
  if (hit != null && Number.isFinite(Number(hit.weight))) return Number(hit.weight);
  const last = sw[sw.length - 1];
  return last != null && Number.isFinite(Number(last.weight)) ? Number(last.weight) : null;
}

function taipeiFSegmentGridSpanWeightAtStart(seg) {
  const sw = seg?.station_weights;
  if (!Array.isArray(sw) || sw.length === 0) return null;
  const n = seg.points?.length ?? 0;
  if (n < 2) return null;
  const hit = sw.find((w) => Number(w?.start_idx) === 0);
  if (hit != null && Number.isFinite(Number(hit.weight))) return Number(hit.weight);
  const first = sw[0];
  return first != null && Number.isFinite(Number(first.weight)) ? Number(first.weight) : null;
}

/** taipei_g 黑點相接兩段合併：預設允許之最大權重絕對差（可經 options.maxWeightDiff 覆寫）。 */
const TAIPEI_F_BLACK_JUNCTION_MERGE_DEFAULT_MAX_WEIGHT_DIFF = 2;

/**
 * @param {{ l3BlackDotReconnectMerge?: boolean }} [options] 僅 taipei_l3 黑點跨段合併時傳 `l3BlackDotReconnectMerge: true`，供圖面標示權重字色。
 */
export function mergeTwoTaipeiFSegmentsSameRoute(first, second, weight, options) {
  const pa = first.points || [];
  const pb = second.points || [];
  if (pa.length < 2 || pb.length < 2) return null;
  const mergedPoints = pa.slice();
  const tail = pb.slice(1);
  mergedPoints.push(...tail);
  const na = first.nodes;
  const nb = second.nodes;
  let mergedNodes;
  if (
    Array.isArray(na) &&
    Array.isArray(nb) &&
    na.length === pa.length &&
    nb.length === pb.length
  ) {
    mergedNodes = na.slice().concat(nb.slice(1));
    // 合併接合點（原 first 最後一點）降格為純幾何 line 節點，移除站名/站碼，
    // 否則該座標仍被縮減判定視為「有黑點」而無法刪除對應的空 row/col。
    const junctionIdx = na.length - 1;
    if (junctionIdx > 0 && junctionIdx < mergedNodes.length - 1) {
      const jn = mergedNodes[junctionIdx];
      if (jn && typeof jn === 'object') {
        const bare = { node_type: 'line' };
        const xg = jn.x_grid ?? jn.tags?.x_grid;
        const yg = jn.y_grid ?? jn.tags?.y_grid;
        if (xg != null) bare.x_grid = xg;
        if (yg != null) bare.y_grid = yg;
        if (jn.tags && typeof jn.tags === 'object') {
          bare.tags = { x_grid: xg, y_grid: yg };
        } else {
          bare.tags = {};
        }
        mergedNodes[junctionIdx] = bare;
      }
    }
  }
  const rn = first.route_name || first.name || second.route_name || second.name || 'Unknown';
  const out = {
    ...first,
    points: mergedPoints,
    route_name: rn,
    name: first.name || second.name || rn,
    properties_start: first.properties_start,
    properties_end: second.properties_end,
    station_weights: [
      {
        start_idx: 0,
        end_idx: mergedPoints.length - 1,
        weight,
      },
    ],
  };
  if (mergedNodes) out.nodes = mergedNodes;
  else delete out.nodes;
  delete out.edge_weights;
  // 合併後，移除直線段上的純幾何中間點（含已降格的接合點），與 simplifyCollinearBareLinePointsInSegment 相同規則
  if (Array.isArray(out.nodes) && out.nodes.length === out.points.length && out.points.length > 2) {
    const pts = out.points;
    const nds = out.nodes;
    const keep = [0];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[keep[keep.length - 1]];
      const cur = pts[i];
      const next = pts[i + 1];
      const nd = nds[i];
      const isBareLine =
        nd &&
        typeof nd === 'object' &&
        nd.node_type !== 'connect' &&
        !(nd.station_id ?? nd.tags?.station_id) &&
        !(nd.station_name ?? nd.tags?.station_name ?? nd.tags?.name);
      const px = Array.isArray(prev) ? prev[0] : (prev?.x ?? 0);
      const py = Array.isArray(prev) ? prev[1] : (prev?.y ?? 0);
      const cx = Array.isArray(cur) ? cur[0] : (cur?.x ?? 0);
      const cy = Array.isArray(cur) ? cur[1] : (cur?.y ?? 0);
      const nx = Array.isArray(next) ? next[0] : (next?.x ?? 0);
      const ny = Array.isArray(next) ? next[1] : (next?.y ?? 0);
      const collinear =
        (py === cy && cy === ny && px !== cx) || (px === cx && cx === nx && py !== cy);
      if (isBareLine && collinear) continue;
      keep.push(i);
    }
    keep.push(pts.length - 1);
    if (keep.length < pts.length) {
      out.points = keep.map((i) => pts[i]);
      out.nodes = keep.map((i) => nds[i]);
    }
  }
  // 共線簡化後頂點數變少，須對齊 station_weights 之 idx，否則地圖權重標籤會被略過
  if (
    Array.isArray(out.station_weights) &&
    out.station_weights.length > 0 &&
    Array.isArray(out.points)
  ) {
    const n = out.points.length;
    if (n >= 2) {
      for (const w of out.station_weights) {
        if (!w || typeof w !== 'object') continue;
        let s = Number.isFinite(Number(w.start_idx)) ? Number(w.start_idx) : 0;
        let e = Number.isFinite(Number(w.end_idx)) ? Number(w.end_idx) : n - 1;
        s = Math.max(0, Math.min(s, n - 1));
        e = Math.max(0, Math.min(e, n - 1));
        if (s >= e) {
          w.start_idx = 0;
          w.end_idx = n - 1;
        } else {
          w.start_idx = s;
          w.end_idx = e;
        }
      }
    }
  }
  const markL3Reconnect = options?.l3BlackDotReconnectMerge === true;
  const inheritedGreen = Boolean(
    first.l3_black_dot_reduced_weight_green || second.l3_black_dot_reduced_weight_green
  );
  if (markL3Reconnect || inheritedGreen) {
    out.l3_black_dot_reduced_weight_green = true;
  } else {
    delete out.l3_black_dot_reduced_weight_green;
  }
  return out;
}

function taipeiFPointGridXY(pt) {
  if (!pt) return [NaN, NaN];
  const x = Array.isArray(pt) ? pt[0] : pt.x;
  const y = Array.isArray(pt) ? pt[1] : pt.y;
  return [Math.round(Number(x)), Math.round(Number(y))];
}

/** 最後一條邊：水平／垂直（正交格）或 null */
function taipeiFSegmentLastEdgeAxis(seg) {
  const pts = seg?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const [ax, ay] = taipeiFPointGridXY(pts[pts.length - 2]);
  const [bx, by] = taipeiFPointGridXY(pts[pts.length - 1]);
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  if (ay === by && ax !== bx) return 'horizontal';
  if (ax === bx && ay !== by) return 'vertical';
  return null;
}

function taipeiFSegmentFirstEdgeAxis(seg) {
  const pts = seg?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const [ax, ay] = taipeiFPointGridXY(pts[0]);
  const [bx, by] = taipeiFPointGridXY(pts[1]);
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  if (ay === by && ax !== bx) return 'horizontal';
  if (ax === bx && ay !== by) return 'vertical';
  return null;
}

function tryMergeOneTaipeiFPairInSegments(
  segments,
  blackStationKeys,
  connectGridKeys,
  labelCtx,
  mergedStations,
  maxWeightDiff,
  mergeAxisConstraint,
  bothWeightsMustBeZero = false
) {
  const nSeg = segments.length;
  for (let i = 0; i < nSeg; i++) {
    for (let j = 0; j < nSeg; j++) {
      if (i === j) continue;
      const sa = segments[i];
      const sb = segments[j];
      const ptsA = sa?.points;
      const ptsB = sb?.points;
      if (!Array.isArray(ptsA) || !Array.isArray(ptsB) || ptsA.length < 2 || ptsB.length < 2)
        continue;

      const tryMergeOrdered = (first, second, idxFirst, idxSecond) => {
        const nFirst = first.points.length;
        const kEnd = gridKeyFromNode(getNodeAtSegmentIndex(first, nFirst - 1, nFirst));
        const kStart = gridKeyFromNode(getNodeAtSegmentIndex(second, 0, second.points.length));
        if (!kEnd || !kStart || kEnd !== kStart) return false;
        if (connectGridKeys.has(kEnd)) return false;
        if (!blackStationKeys.has(kEnd)) return false;
        if (mergeAxisConstraint === 'horizontal') {
          if (
            taipeiFSegmentLastEdgeAxis(first) !== 'horizontal' ||
            taipeiFSegmentFirstEdgeAxis(second) !== 'horizontal'
          ) {
            return false;
          }
        } else if (mergeAxisConstraint === 'vertical') {
          if (
            taipeiFSegmentLastEdgeAxis(first) !== 'vertical' ||
            taipeiFSegmentFirstEdgeAxis(second) !== 'vertical'
          ) {
            return false;
          }
        }
        const w1 = taipeiFSegmentGridSpanWeightAtEnd(first);
        const w2 = taipeiFSegmentGridSpanWeightAtStart(second);
        if (w1 == null || w2 == null) return false;
        if (bothWeightsMustBeZero) {
          if (w1 !== 0 || w2 !== 0) return false;
        } else if (Math.abs(w1 - w2) > maxWeightDiff) {
          return false;
        }
        const mergedW = bothWeightsMustBeZero ? 0 : Math.max(w1, w2);
        const merged = mergeTwoTaipeiFSegmentsSameRoute(first, second, mergedW);
        if (!merged) return false;
        const routeName =
          first.route_name || first.name || second.route_name || second.name || 'Unknown';
        const jNode = getNodeAtSegmentIndex(first, nFirst - 1, nFirst);
        const stationName = labelCtx
          ? resolveTaipeiFStationLabel(jNode, { ...labelCtx, routeName })
          : '';
        const xy = kEnd.split(',');
        const x_grid = Number(xy[0]);
        const y_grid = Number(xy[1]);
        if (Array.isArray(mergedStations)) {
          mergedStations.push({
            路線: routeName,
            車站名稱: stationName && String(stationName).trim() !== '' ? stationName : '—',
            x_grid: Number.isFinite(x_grid) ? x_grid : null,
            y_grid: Number.isFinite(y_grid) ? y_grid : null,
            格鍵: kEnd,
            權重: mergedW,
          });
        }
        const a = Math.min(idxFirst, idxSecond);
        const b = Math.max(idxFirst, idxSecond);
        segments.splice(b, 1);
        segments.splice(a, 1);
        segments.push(merged);
        return true;
      };

      if (tryMergeOrdered(sa, sb, i, j)) return true;
      if (tryMergeOrdered(sb, sa, j, i)) return true;
    }
  }
  return false;
}

/**
 * 供 `rebuildTaipeiFStationConnectAfterSplit`：扁平 segment[] 或 routes[{segments}] → routes[{ route_name, segments }]（segment 維持原參照）。
 */
export function taipeiFSpaceNetworkToRebuildRoutes(spaceNetworkData) {
  if (!Array.isArray(spaceNetworkData) || spaceNetworkData.length === 0) return [];
  const head = spaceNetworkData[0];
  const isFlat = head?.points && !(Array.isArray(head.segments) && head.segments.length > 0);
  if (!isFlat) {
    return spaceNetworkData.map((r) => ({
      route_name: r.route_name || r.name || 'Unknown',
      name: r.name || r.route_name,
      segments: r.segments || [],
    }));
  }
  const routeOrder = [];
  const byRoute = new Map();
  for (const seg of spaceNetworkData) {
    const rn = seg.route_name || seg.name || 'Unknown';
    if (!byRoute.has(rn)) {
      byRoute.set(rn, []);
      routeOrder.push(rn);
    }
    byRoute.get(rn).push(seg);
  }
  return routeOrder.map((rn) => ({
    route_name: rn,
    name: rn,
    segments: byRoute.get(rn),
  }));
}

/**
 * 扁平 segment[] 或 routes[{segments}] → 依首次出現路線順序分組的 routes 陣列（深拷貝 segment 參照）。
 */
function taipeiFSpaceNetworkToRouteGroups(spaceNetworkData) {
  if (!Array.isArray(spaceNetworkData) || spaceNetworkData.length === 0) {
    return { routes: [], routeOrder: [], wasFlat: false };
  }
  const head = spaceNetworkData[0];
  const isFlat = head?.points && !(Array.isArray(head.segments) && head.segments.length > 0);
  if (!isFlat) {
    return {
      routes: JSON.parse(JSON.stringify(spaceNetworkData)),
      routeOrder: (spaceNetworkData || []).map((r) => r.route_name || r.name || 'Unknown'),
      wasFlat: false,
    };
  }
  const routeOrder = [];
  const byRoute = new Map();
  for (const seg of spaceNetworkData) {
    const rn = seg.route_name || seg.name || 'Unknown';
    if (!byRoute.has(rn)) {
      byRoute.set(rn, []);
      routeOrder.push(rn);
    }
    byRoute.get(rn).push(JSON.parse(JSON.stringify(seg)));
  }
  const routes = routeOrder.map((rn) => ({
    route_name: rn,
    name: rn,
    segments: byRoute.get(rn),
  }));
  return { routes, routeOrder, wasFlat: true };
}

function taipeiFRouteGroupsToSpaceNetwork(routes, routeOrder, wasFlat) {
  if (!wasFlat) return routes;
  const out = [];
  for (const rn of routeOrder) {
    const route = routes.find((r) => (r.route_name || r.name) === rn);
    if (route?.segments?.length) out.push(...route.segments);
  }
  return out;
}

function taipeiFGetXYFromPoint(pt) {
  if (Array.isArray(pt) && pt.length >= 2) return [Number(pt[0]), Number(pt[1])];
  if (pt && typeof pt === 'object') return [Number(pt.x), Number(pt.y)];
  return [NaN, NaN];
}

/**
 * taipei_g 空欄列縮減：刪除不含「紅點／黑點／轉折點」的 row / col，並將座標壓成連續索引。
 * 就地改寫 `spaceNetworkData` 與 `options.sectionData`（若提供）。
 * SectionData 僅 connect_start／connect_end 參與佔用判定（不掃 station_list，避免與路段 nodes 重複而無法塌縮）。
 * @returns {{ removedRowCount: number, removedColCount: number, removedRows: number[], removedCols: number[], rowMap: Map<number,number>, colMap: Map<number,number> }}
 */
export function pruneTaipeiFEmptyGridRowsAndCols(spaceNetworkData, options = {}) {
  const empty = {
    removedRowCount: 0,
    removedColCount: 0,
    removedRows: [],
    removedCols: [],
    rowMap: new Map(),
    colMap: new Map(),
  };
  if (!Array.isArray(spaceNetworkData) || spaceNetworkData.length === 0) return empty;

  const routesGrouped = taipeiFSpaceNetworkToRebuildRoutes(spaceNetworkData);
  const stationData = options.stationData;
  const connectData = options.connectData;
  const sectionData = options.sectionData;

  const rowsWithConnectNodes = new Set();
  const colsWithConnectNodes = new Set();
  const rowsWithStationNodes = new Set();
  const colsWithStationNodes = new Set();
  const rowsWithTurningPoints = new Set();
  const colsWithTurningPoints = new Set();

  for (const route of routesGrouped) {
    const segments = route.segments || [];
    for (const seg of segments) {
      const points = seg.points || [];
      const nodes = seg.nodes || [];
      const propertiesStart = seg.properties_start;
      const propertiesEnd = seg.properties_end;

      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        const next = points[i + 1];
        const px = Array.isArray(prev) ? prev[0] : prev?.x;
        const py = Array.isArray(prev) ? prev[1] : prev?.y;
        const cx = Array.isArray(cur) ? cur[0] : cur?.x;
        const cy = Array.isArray(cur) ? cur[1] : cur?.y;
        const nx = Array.isArray(next) ? next[0] : next?.x;
        const ny = Array.isArray(next) ? next[1] : next?.y;
        if (
          !Number.isFinite(Number(px)) ||
          !Number.isFinite(Number(py)) ||
          !Number.isFinite(Number(cx)) ||
          !Number.isFinite(Number(cy)) ||
          !Number.isFinite(Number(nx)) ||
          !Number.isFinite(Number(ny))
        ) {
          continue;
        }
        const vx1 = Math.round(Number(cx)) - Math.round(Number(px));
        const vy1 = Math.round(Number(cy)) - Math.round(Number(py));
        const vx2 = Math.round(Number(nx)) - Math.round(Number(cx));
        const vy2 = Math.round(Number(ny)) - Math.round(Number(cy));
        if (vx1 === 0 && vy1 === 0) continue;
        if (vx2 === 0 && vy2 === 0) continue;
        if (vx1 !== vx2 || vy1 !== vy2) {
          const xg = Math.round(Number(cx));
          const yg = Math.round(Number(cy));
          colsWithTurningPoints.add(xg);
          rowsWithTurningPoints.add(yg);
        }
      }

      const pushProps = (props, pt) => {
        if (!props) return;
        const nodeType =
          props.node_type || props.tags?.node_type || (props.connect_number ? 'connect' : '');
        const hasConnectNumber = !!(props.connect_number || props.tags?.connect_number);
        const hasStationId = !!(props.station_id || props.tags?.station_id);
        const hasStationName = !!(
          props.station_name ||
          props.tags?.station_name ||
          props.tags?.name
        );
        const x = Array.isArray(pt) ? pt[0] : pt?.x;
        const y = Array.isArray(pt) ? pt[1] : pt?.y;
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return;
        const xGrid = Math.round(Number(x));
        const yGrid = Math.round(Number(y));
        if (nodeType === 'connect' || hasConnectNumber) {
          colsWithConnectNodes.add(xGrid);
          rowsWithConnectNodes.add(yGrid);
        }
        if (
          nodeType === 'station' ||
          ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
        ) {
          colsWithStationNodes.add(xGrid);
          rowsWithStationNodes.add(yGrid);
        }
      };
      if (points.length > 0) {
        pushProps(propertiesStart, points[0]);
        pushProps(propertiesEnd, points[points.length - 1]);
      }
      if (Array.isArray(nodes) && nodes.length > 0) {
        for (let i = 0; i < nodes.length && i < points.length; i++) {
          const node = nodes[i];
          const pt = points[i];
          if (!node || !pt) continue;
          const nodeType =
            node.node_type || node.tags?.node_type || (node.connect_number ? 'connect' : '');
          const hasConnectNumber = !!(node.connect_number || node.tags?.connect_number);
          const hasStationId = !!(node.station_id || node.tags?.station_id);
          const hasStationName = !!(
            node.station_name ||
            node.tags?.station_name ||
            node.tags?.name
          );
          const x = Array.isArray(pt) ? pt[0] : pt?.x;
          const y = Array.isArray(pt) ? pt[1] : pt?.y;
          if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
          const xGrid = Math.round(Number(x));
          const yGrid = Math.round(Number(y));
          if (nodeType === 'connect' || hasConnectNumber) {
            colsWithConnectNodes.add(xGrid);
            rowsWithConnectNodes.add(yGrid);
          }
          if (
            nodeType === 'station' ||
            ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
          ) {
            colsWithStationNodes.add(xGrid);
            rowsWithStationNodes.add(yGrid);
          }
        }
      }
    }
  }

  const addStationRow = (row) => {
    if (!row || typeof row !== 'object') return;
    const nt = String(row.node_type ?? row.tags?.node_type ?? '').toLowerCase();
    const hasConnectNumber =
      (row.connect_number ?? row.tags?.connect_number) != null &&
      String(row.connect_number ?? row.tags?.connect_number).trim() !== '';
    const hasStationIdentity =
      String(row.station_id ?? row.tags?.station_id ?? '').trim() !== '' ||
      String(row.station_name ?? row.tags?.station_name ?? row.tags?.name ?? '').trim() !== '';
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null) return;
    const xg = Math.round(Number(x));
    const yg = Math.round(Number(y));
    if (nt === 'connect' || hasConnectNumber) {
      colsWithConnectNodes.add(xg);
      rowsWithConnectNodes.add(yg);
    } else {
      if (!hasStationIdentity) return;
      colsWithStationNodes.add(xg);
      rowsWithStationNodes.add(yg);
    }
  };
  if (Array.isArray(stationData)) stationData.forEach(addStationRow);
  if (Array.isArray(connectData)) connectData.forEach(addStationRow);

  if (Array.isArray(sectionData)) {
    for (const row of sectionData) {
      for (const key of ['connect_start', 'connect_end']) {
        const p = row[key];
        if (!p || typeof p !== 'object') continue;
        const x = p.x_grid ?? p.tags?.x_grid;
        const y = p.y_grid ?? p.tags?.y_grid;
        if (x == null || y == null) continue;
        const xg = Math.round(Number(x));
        const yg = Math.round(Number(y));
        const isConnect =
          String(p.node_type ?? p.tags?.node_type ?? '').toLowerCase() === 'connect' ||
          (p.connect_number ?? p.tags?.connect_number) != null;
        const hasStationIdentity =
          String(p.station_id ?? p.tags?.station_id ?? '').trim() !== '' ||
          String(p.station_name ?? p.tags?.station_name ?? p.tags?.name ?? '').trim() !== '';
        if (isConnect) {
          colsWithConnectNodes.add(xg);
          rowsWithConnectNodes.add(yg);
        } else {
          if (!hasStationIdentity) continue;
          colsWithStationNodes.add(xg);
          rowsWithStationNodes.add(yg);
        }
      }
      // 佔用判定不掃 station_list（與 nodes／StationData 重複時會鎖死整段欄列，無法刪空 row/col）
    }
  }

  const validRows = new Set();
  const validCols = new Set();
  rowsWithConnectNodes.forEach((r) => validRows.add(r));
  rowsWithStationNodes.forEach((r) => validRows.add(r));
  rowsWithTurningPoints.forEach((r) => validRows.add(r));
  colsWithConnectNodes.forEach((c) => validCols.add(c));
  colsWithStationNodes.forEach((c) => validCols.add(c));
  colsWithTurningPoints.forEach((c) => validCols.add(c));

  if (validRows.size === 0 || validCols.size === 0) return empty;

  const sortedRows = Array.from(validRows).sort((a, b) => a - b);
  const sortedCols = Array.from(validCols).sort((a, b) => a - b);

  const rowMap = new Map();
  const colMap = new Map();
  sortedRows.forEach((oldRow, index) => rowMap.set(oldRow, index));
  sortedCols.forEach((oldCol, index) => colMap.set(oldCol, index));

  const allX = new Set();
  const allY = new Set();
  for (const route of routesGrouped) {
    for (const seg of route.segments || []) {
      for (const pt of seg.points || []) {
        const x = Array.isArray(pt) ? pt[0] : pt?.x;
        const y = Array.isArray(pt) ? pt[1] : pt?.y;
        if (Number.isFinite(Number(x))) allX.add(Math.round(Number(x)));
        if (Number.isFinite(Number(y))) allY.add(Math.round(Number(y)));
      }
    }
  }
  let removedColCount = 0;
  let removedRowCount = 0;
  const removedCols = [];
  const removedRows = [];
  if (allX.size > 0) {
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    for (let x = minX; x <= maxX; x++) {
      if (!validCols.has(x)) {
        removedColCount++;
        removedCols.push(x);
      }
    }
  }
  if (allY.size > 0) {
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    for (let y = minY; y <= maxY; y++) {
      if (!validRows.has(y)) {
        removedRowCount++;
        removedRows.push(y);
      }
    }
  }
  empty.removedColCount = removedColCount;
  empty.removedRowCount = removedRowCount;
  empty.removedCols = removedCols;
  empty.removedRows = removedRows;

  const remapPoint = (oldXGrid, oldYGrid) => {
    let newX = oldXGrid;
    let newY = oldYGrid;
    if (colMap.has(oldXGrid)) {
      newX = colMap.get(oldXGrid);
    } else {
      let closestCol = sortedCols[0];
      let minDist = Math.abs(oldXGrid - closestCol);
      for (const col of sortedCols) {
        const dist = Math.abs(oldXGrid - col);
        if (dist < minDist) {
          minDist = dist;
          closestCol = col;
        }
      }
      newX = colMap.get(closestCol);
    }
    if (rowMap.has(oldYGrid)) {
      newY = rowMap.get(oldYGrid);
    } else {
      let closestRow = sortedRows[0];
      let minDist = Math.abs(oldYGrid - closestRow);
      for (const row of sortedRows) {
        const dist = Math.abs(oldYGrid - row);
        if (dist < minDist) {
          minDist = dist;
          closestRow = row;
        }
      }
      newY = rowMap.get(closestRow);
    }
    return [newX, newY];
  };

  const remapPointInPlace = (pt) => {
    if (Array.isArray(pt) && pt.length >= 2) {
      const oldX = Math.round(Number(pt[0]));
      const oldY = Math.round(Number(pt[1]));
      const [nx, ny] = remapPoint(oldX, oldY);
      pt[0] = nx;
      pt[1] = ny;
      return;
    }
    if (pt && typeof pt === 'object') {
      const oldX = Math.round(Number(pt.x));
      const oldY = Math.round(Number(pt.y));
      const [nx, ny] = remapPoint(oldX, oldY);
      pt.x = nx;
      pt.y = ny;
    }
  };

  const remapSegment = (seg) => {
    const points = seg.points || [];
    for (const p of points) remapPointInPlace(p);
    const [sx, sy] = taipeiFGetXYFromPoint(points[0]);
    const [ex, ey] = taipeiFGetXYFromPoint(points[points.length - 1]);
    if (seg.properties_start && Number.isFinite(sx) && Number.isFinite(sy)) {
      seg.properties_start = { ...seg.properties_start, x_grid: sx, y_grid: sy };
    }
    if (seg.properties_end && Number.isFinite(ex) && Number.isFinite(ey)) {
      seg.properties_end = { ...seg.properties_end, x_grid: ex, y_grid: ey };
    }
    if (Array.isArray(seg.nodes) && seg.nodes.length === points.length) {
      seg.nodes = seg.nodes.map((node, idx) => {
        if (!node || typeof node !== 'object') return node;
        const [nx, ny] = taipeiFGetXYFromPoint(points[idx]);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return node;
        return { ...node, x_grid: nx, y_grid: ny };
      });
    }
    if (Array.isArray(seg.start_coord)) seg.start_coord = [sx, sy];
    if (Array.isArray(seg.end_coord)) seg.end_coord = [ex, ey];
  };

  const head = spaceNetworkData[0];
  const isFlat = head?.points && !(Array.isArray(head.segments) && head.segments.length > 0);
  const routeOrder = [];
  const byRoute = new Map();
  if (isFlat) {
    for (const seg of spaceNetworkData) {
      const rn = seg.route_name || seg.name || 'Unknown';
      if (!byRoute.has(rn)) {
        byRoute.set(rn, []);
        routeOrder.push(rn);
      }
      byRoute.get(rn).push(seg);
    }
  }
  const routesToRemap = isFlat
    ? routeOrder.map((rn) => ({ route_name: rn, segments: byRoute.get(rn) }))
    : routesGrouped;

  for (const route of routesToRemap) {
    for (const seg of route.segments || []) remapSegment(seg);
  }

  if (Array.isArray(sectionData)) {
    const remapSectionPoint = (p) => {
      if (!p || typeof p !== 'object') return;
      const x = p.x_grid ?? p.tags?.x_grid;
      const y = p.y_grid ?? p.tags?.y_grid;
      if (x == null || y == null) return;
      const [nx, ny] = remapPoint(Math.round(Number(x)), Math.round(Number(y)));
      p.x_grid = nx;
      p.y_grid = ny;
      if (p.tags && typeof p.tags === 'object') {
        p.tags.x_grid = nx;
        p.tags.y_grid = ny;
      }
    };
    for (const row of sectionData) {
      remapSectionPoint(row.connect_start);
      remapSectionPoint(row.connect_end);
      for (const st of row.station_list || []) remapSectionPoint(st);
    }
  }

  empty.rowMap = rowMap;
  empty.colMap = colMap;
  return empty;
}

/**
 * taipei_g：若某黑點（非紅點 connect）僅為同路線兩段之相接點，且兩段權重絕對差 ≤ `options.maxWeightDiff`（預設 2），則刪除該站並合併為一段；
 * 合併後該段 `station_weights` 之 weight 為兩段權重之較大值。
 * 會就地改寫傳入的 spaceNetworkData（與 applyRandomWeightsBetweenAdjacentStations 相同結構）。
 * @param {{ maxWeightDiff?: number, mergeAxisConstraint?: 'horizontal'|'vertical', collectMergedStations?: boolean, connectData?: Array, stationData?: Array, sectionData?: Array, bothWeightsMustBeZero?: boolean }} [options]
 *   `bothWeightsMustBeZero`：僅當相接兩段在接點之 span 權重皆為 0 時合併（合併後 weight 為 0）。
 * @returns {{ mergeCount: number, mergedStations: Array<{路線:string, 車站名稱:string, x_grid:number|null, y_grid:number|null, 格鍵:string, 權重:number}> }}
 */
export function mergeTaipeiFSegmentsAtEqualWeightBlackJunctions(spaceNetworkData, options = {}) {
  if (!Array.isArray(spaceNetworkData) || spaceNetworkData.length === 0) {
    return { mergeCount: 0, mergedStations: [] };
  }
  const bothWeightsMustBeZero = options.bothWeightsMustBeZero === true;
  const maxWeightDiff =
    Number.isFinite(Number(options.maxWeightDiff)) && Number(options.maxWeightDiff) >= 0
      ? Number(options.maxWeightDiff)
      : TAIPEI_F_BLACK_JUNCTION_MERGE_DEFAULT_MAX_WEIGHT_DIFF;
  const collectMerged = options.collectMergedStations === true;
  const mergeAxisConstraint =
    options.mergeAxisConstraint === 'horizontal' || options.mergeAxisConstraint === 'vertical'
      ? options.mergeAxisConstraint
      : null;
  const connectLookup = buildConnectNumberToLabelMap(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const connectGridLabelMap = buildConnectGridKeyToLabel(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const blackLabelsByGrid = buildBlackStationDisplayByGrid(options.stationData);
  const { blackStationKeys, connectGridKeys } = buildAugmentedTaipeiFEndpointGridKeys(
    spaceNetworkData,
    options
  );
  const sectionRouteGridLabelMap = buildSectionRouteGridLabelMap(options.sectionData);
  const labelCtx = {
    connectLookup,
    connectGridLabelMap,
    blackLabelsByGrid,
    stationData: options.stationData,
    connectData: options.connectData,
    sectionRouteGridLabelMap,
  };
  const { routes, routeOrder, wasFlat } = taipeiFSpaceNetworkToRouteGroups(spaceNetworkData);
  let mergeCount = 0;
  const mergedStations = collectMerged ? [] : null;
  const maxPasses = 5000;
  for (const route of routes) {
    const segs = route.segments || [];
    let guard = 0;
    while (guard++ < maxPasses) {
      if (
        !tryMergeOneTaipeiFPairInSegments(
          segs,
          blackStationKeys,
          connectGridKeys,
          labelCtx,
          mergedStations,
          maxWeightDiff,
          mergeAxisConstraint,
          bothWeightsMustBeZero
        )
      )
        break;
      mergeCount++;
    }
    route.segments = segs;
  }
  spaceNetworkData.length = 0;
  if (wasFlat) {
    spaceNetworkData.push(...taipeiFRouteGroupsToSpaceNetwork(routes, routeOrder, wasFlat));
  } else {
    spaceNetworkData.push(...routes);
  }
  return { mergeCount, mergedStations: collectMerged ? mergedStations : [] };
}

/**
 * taipei_g：與 Control/taipei_f 相同流程（merge → rebuild → applyTaipeiFPruneEmptyGridRowsCols → rebuild → 表格），就地更新圖層欄位。
 * @param {{ maxWeightDiff?: number, mergeAxisConstraint?: 'horizontal'|'vertical' }} [opts]
 * @returns {{ mergeCount: number, removedColCount: number, removedRowCount: number, removedCols: number[], removedRows: number[] }}
 */
export function applyTaipeiFMergePruneRebuildToLayer(layer, opts = {}) {
  if (!layer || !isTaipeiTestGOrHWeightLayerTab(layer.layerId)) {
    return {
      mergeCount: 0,
      removedColCount: 0,
      removedRowCount: 0,
      removedCols: [],
      removedRows: [],
    };
  }
  const raw = layer.spaceNetworkGridJsonData;
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      mergeCount: 0,
      removedColCount: 0,
      removedRowCount: 0,
      removedCols: [],
      removedRows: [],
    };
  }
  const options = {
    connectData: layer.spaceNetworkGridJsonData_ConnectData,
    stationData: layer.spaceNetworkGridJsonData_StationData,
    sectionData: layer.spaceNetworkGridJsonData_SectionData,
    maxWeightDiff: opts.maxWeightDiff,
    mergeAxisConstraint: opts.mergeAxisConstraint,
  };
  const routes = JSON.parse(JSON.stringify(raw));
  const { mergeCount } = mergeTaipeiFSegmentsAtEqualWeightBlackJunctions(routes, options);
  let routesData = taipeiFSpaceNetworkToRebuildRoutes(routes);
  let rebuilt = rebuildTaipeiFStationConnectAfterSplit(routesData, options);
  const workingLayer = {
    layerId: layer.layerId,
    spaceNetworkGridJsonData: routes,
    spaceNetworkGridJsonData_StationData: rebuilt.stationData,
    spaceNetworkGridJsonData_ConnectData: rebuilt.connectData,
    spaceNetworkGridJsonData_SectionData: JSON.parse(
      JSON.stringify(layer.spaceNetworkGridJsonData_SectionData || [])
    ),
    minSpacingOverlayCell: layer.minSpacingOverlayCell || null,
  };
  const pruneStats = applyTaipeiFPruneEmptyGridRowsCols(workingLayer) || {
    removedRows: 0,
    removedCols: 0,
    hadRemoval: false,
  };
  const removedRows = Array.isArray(workingLayer.emptyOverlayRows)
    ? [...workingLayer.emptyOverlayRows]
    : [];
  const removedCols = Array.isArray(workingLayer.emptyOverlayCols)
    ? [...workingLayer.emptyOverlayCols]
    : [];
  routesData = taipeiFSpaceNetworkToRebuildRoutes(workingLayer.spaceNetworkGridJsonData);
  rebuilt = rebuildTaipeiFStationConnectAfterSplit(routesData, {
    ...options,
    stationData: rebuilt.stationData,
    connectData: rebuilt.connectData,
    sectionData: workingLayer.spaceNetworkGridJsonData_SectionData,
  });
  const tableOptions = {
    ...options,
    stationData: rebuilt.stationData,
    connectData: rebuilt.connectData,
    sectionData: workingLayer.spaceNetworkGridJsonData_SectionData,
  };
  layer.spaceNetworkGridJsonData = workingLayer.spaceNetworkGridJsonData;
  layer.layoutGridJsonData = JSON.parse(JSON.stringify(workingLayer.spaceNetworkGridJsonData));
  layer.spaceNetworkGridJsonData_StationData = rebuilt.stationData;
  layer.spaceNetworkGridJsonData_ConnectData = rebuilt.connectData;
  layer.spaceNetworkGridJsonData_SectionData = workingLayer.spaceNetworkGridJsonData_SectionData;
  layer.emptyOverlayRows = removedRows;
  layer.emptyOverlayCols = removedCols;
  layer.overlayRemovalMaps = workingLayer.overlayRemovalMaps ?? null;
  layer.gridTooltipMaps = workingLayer.gridTooltipMaps ?? null;
  layer.overlayRetentionReasons = workingLayer.overlayRetentionReasons ?? null;
  layer.dataTableData = buildTaipeiFDataTableRowsFromSpaceNetwork(
    workingLayer.spaceNetworkGridJsonData,
    tableOptions
  );
  return {
    mergeCount,
    removedColCount: pruneStats.removedCols ?? 0,
    removedRowCount: pruneStats.removedRows ?? 0,
    removedCols,
    removedRows,
  };
}

/**
 * 跨路線比對切段：若兩 segment 格點路徑重疊，刪除較短者（同長則保留路線／索引較前者）。就地改寫 `route.segments`。
 */
export function removeShorterOverlappingTaipeiFSegments(routesData) {
  if (!Array.isArray(routesData)) return;
  const entries = [];
  for (let ri = 0; ri < routesData.length; ri++) {
    const route = routesData[ri];
    const segs = route.segments || [];
    for (let si = 0; si < segs.length; si++) {
      const keys = taipeiFSegmentGridKeysFromPoints(segs[si]);
      if (keys.length < 2) continue;
      entries.push({ route, ri, si, keys, len: keys.length });
    }
  }
  const remove = new Set();
  const cmpOrder = (a, b) => {
    if (a.ri !== b.ri) return a.ri - b.ri;
    return a.si - b.si;
  };
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (remove.has(i) || remove.has(j)) continue;
      const ei = entries[i];
      const ej = entries[j];
      if (!taipeiFSegmentPathsOverlapGridKeys(ei.keys, ej.keys)) continue;
      if (ei.len < ej.len) remove.add(i);
      else if (ej.len < ei.len) remove.add(j);
      else if (cmpOrder(ei, ej) < 0) remove.add(j);
      else remove.add(i);
    }
  }
  const byRoute = new Map();
  for (const idx of remove) {
    const e = entries[idx];
    if (!byRoute.has(e.route)) byRoute.set(e.route, new Set());
    byRoute.get(e.route).add(e.si);
  }
  for (const route of routesData) {
    const drop = byRoute.get(route);
    if (!drop || drop.size === 0) continue;
    const segs = route.segments || [];
    route.segments = segs.filter((_, si) => !drop.has(si));
  }
}

/**
 * taipei_g：沿每條 segment 的 points，在「黑點」格／站點處切斷，改寫 `route.segments`；
 * 起點或終點若非紅點（connect）亦非黑點／車站之段會捨棄（不存入、不畫）。
 * 另：跨路線格點路徑重疊時刪較短段，避免同一路徑重複畫權重數字。
 * 列數與切後 segment 數相同。欄位：#、路線、車站名稱1、車站名稱2、座標1、座標2。
 * @param {Array} routesData - 依路線分組（每路線 `segments[]`）
 * @param {{
 *   connectData?: Array,
 *   stationData?: Array,
 *   sectionData?: Array,
 *   initialSegmentWeight?: number,
 * }} [options] 與 e 匯出同源，供站名顯示
 * @param {() => number} [options.rng] 抽樣用，預設 Math.random（`initialSegmentWeight` 為有限數時略過抽樣）
 * @returns {Array<Object>} dataTableData（含 weight：1～9 或指定初值如 0，等比加權抽樣）
 */
export function splitTaipeiFRoutesAtBlackStations(routesData, options = {}) {
  if (!Array.isArray(routesData)) return [];

  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const fixedInitialW = Number(options.initialSegmentWeight);
  const useFixedInitialWeight = Number.isFinite(fixedInitialW);

  /** 每個切段一筆 station_weights，供 SpaceNetworkGridTab 線段中點畫數字 */
  const assignTaipeiFSegmentWeight = (sub) => {
    const pts = sub?.points;
    if (!Array.isArray(pts) || pts.length < 2) {
      if (sub) sub.station_weights = [];
      return undefined;
    }
    const n = pts.length;
    const w = useFixedInitialWeight ? fixedInitialW : sampleWeight1to9Biased(rng);
    sub.station_weights = [{ start_idx: 0, end_idx: n - 1, weight: w }];
    return w;
  };

  const connectLookup = buildConnectNumberToLabelMap(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const connectGridLabelMap = buildConnectGridKeyToLabel(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const blackLabelsByGrid = buildBlackStationDisplayByGrid(options.stationData);
  const { blackStationKeys, connectGridKeys } = buildAugmentedTaipeiFEndpointGridKeys(
    routesData,
    options
  );
  const sectionRouteGridLabelMap = buildSectionRouteGridLabelMap(options.sectionData);
  const labelCtx = {
    connectLookup,
    connectGridLabelMap,
    blackLabelsByGrid,
    stationData: options.stationData,
    connectData: options.connectData,
    sectionRouteGridLabelMap,
  };

  const formatCoordCell = (node) => {
    const k = gridKeyFromNode(node);
    if (!k) return '—';
    const [x, y] = k.split(',');
    return `(${x}, ${y})`;
  };

  const buildSubSegment = (seg, i0, i1, routeName) => {
    const points = seg.points || [];
    const nodes = seg.nodes;
    const pts = points.slice(i0, i1 + 1);
    const nl = pts.length;
    let newNodes;
    if (Array.isArray(nodes) && nodes.length === points.length) {
      newNodes = nodes
        .slice(i0, i1 + 1)
        .map((n) => (n && typeof n === 'object' ? JSON.parse(JSON.stringify(n)) : n));
    }
    // 勿把整段之 properties_start/end（縮減後全域座標）帶進 stub，否則 nodes 被清空時
    // getNodeAtSegmentIndex 在 i===0 永遠先回傳同一個 properties_start，切段後每列端點都相同。
    const stub = {
      ...seg,
      points: pts,
      nodes: newNodes,
      properties_start: undefined,
      properties_end: undefined,
    };
    let ps = getNodeAtSegmentIndex(stub, 0, nl);
    let pe = getNodeAtSegmentIndex(stub, nl - 1, nl);
    const nFull = points.length;
    if (i0 === 0 && hasMeaningfulTaipeiFParentEndpointProps(seg.properties_start)) {
      ps = mergeTaipeiFEndpointFromParentProps(ps, seg.properties_start);
    }
    if (i1 === nFull - 1 && hasMeaningfulTaipeiFParentEndpointProps(seg.properties_end)) {
      pe = mergeTaipeiFEndpointFromParentProps(pe, seg.properties_end);
    }
    const out = {
      ...seg,
      points: pts,
      route_name: routeName,
      name: seg.name || routeName,
      properties_start: ps ? JSON.parse(JSON.stringify(ps)) : undefined,
      properties_end: pe ? JSON.parse(JSON.stringify(pe)) : undefined,
    };
    if (newNodes && newNodes.length === pts.length) out.nodes = newNodes;
    else delete out.nodes;

    if (Array.isArray(seg.station_weights)) {
      out.station_weights = seg.station_weights
        .filter(
          (w) =>
            Number.isFinite(w?.start_idx) &&
            Number.isFinite(w?.end_idx) &&
            w.start_idx >= i0 &&
            w.end_idx <= i1
        )
        .map((w) => ({
          ...w,
          start_idx: w.start_idx - i0,
          end_idx: w.end_idx - i0,
        }));
    } else {
      out.station_weights = [];
    }

    if (Array.isArray(seg.edge_weights) && seg.edge_weights.length >= points.length - 1) {
      out.edge_weights = seg.edge_weights.slice(i0, i1);
    } else if (seg.edge_weights) {
      delete out.edge_weights;
    }

    return out;
  };

  // ① 先切完：只改寫 route.segments，不產生表格
  for (const route of routesData) {
    const routeName = route.route_name || route.name || 'Unknown';
    const newSegs = [];

    for (const seg of route.segments || []) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        continue;
      }
      const densified = densifyPointsWithBlackStations(pts, blackStationKeys, options.stationData);
      const segWork = { ...seg, points: densified };
      if (densified.length !== pts.length) {
        delete segWork.nodes;
        segWork.station_weights = [];
        delete segWork.edge_weights;
      }
      const n = densified.length;
      const blackIdx = [];
      for (let i = 0; i < n; i++) {
        const node = getNodeAtSegmentIndex(segWork, i, n);
        if (isBlackStationSplitVertex(node, blackStationKeys)) blackIdx.push(i);
      }
      const bounds = [...new Set([0, n - 1, ...blackIdx])].sort((a, b) => a - b);
      for (let j = 0; j < bounds.length - 1; j++) {
        const i0 = bounds[j];
        const i1 = bounds[j + 1];
        if (i1 <= i0) continue;
        const sub = buildSubSegment(segWork, i0, i1, routeName);
        const nn = sub.points?.length ?? 0;
        if (nn < 2) continue;
        const sNode = getNodeAtSegmentIndex(sub, 0, nn);
        const eNode = getNodeAtSegmentIndex(sub, nn - 1, nn);
        if (!taipeiFSegmentEndpointsAreStations(sNode, eNode, blackStationKeys, connectGridKeys)) {
          continue;
        }
        assignTaipeiFSegmentWeight(sub);
        newSegs.push(sub);
      }
    }

    route.segments = newSegs;
  }

  removeShorterOverlappingTaipeiFSegments(routesData);

  // ② 再依「切完後」的每個 segment 建一列（列數 = 最終 segment 數）
  const rows = [];
  for (const route of routesData) {
    const routeName = route.route_name || route.name || 'Unknown';
    const ctxWithRoute = { ...labelCtx, routeName };
    for (const seg of route.segments || []) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      const nn = pts.length;
      const sNode = getNodeAtSegmentIndex(seg, 0, nn);
      const eNode = getNodeAtSegmentIndex(seg, nn - 1, nn);
      const rawW = seg.station_weights?.[0]?.weight;
      const weight = rawW != null && Number.isFinite(Number(rawW)) ? Number(rawW) : null;
      const rawNav = seg.nav_weight;
      const nav_weight = rawNav != null && Number.isFinite(Number(rawNav)) ? Number(rawNav) : 1;
      rows.push({
        路線: routeName,
        車站名稱1: resolveTaipeiFStationLabel(sNode, ctxWithRoute),
        車站名稱2: resolveTaipeiFStationLabel(eNode, ctxWithRoute),
        座標1: formatCoordCell(sNode),
        座標2: formatCoordCell(eNode),
        weight,
        nav_weight,
      });
    }
  }

  return rows.map((r, index) => ({
    '#': index + 1,
    ...r,
  }));
}

/** 捷運 CSV 站名正規化（與 CSV「站點A／站點B」比對用） */
export function normalizeTrafficStationName(s) {
  return String(s || '')
    .replace(/—/g, '')
    .replace(/／/g, '/')
    .replace(/臺/g, '台')
    .trim();
}

function undirectedTrafficKey(a, b) {
  const na = normalizeTrafficStationName(a);
  const nb = normalizeTrafficStationName(b);
  if (!na || !nb) return null;
  return na <= nb ? `${na}\n${nb}` : `${nb}\n${na}`;
}

/**
 * 由流量 CSV 列建 undirected Map（key：正規化後兩站字典序合併）
 * @param {Array<{ 站點A?: string, 站點B?: string, 總人次?: number }>} rows
 */
export function buildTrafficVolumeMapFromRows(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const a = r['站點A'] ?? r.stationA;
    const b = r['站點B'] ?? r.stationB;
    const v = r['總人次'] ?? r.volume;
    const key = undirectedTrafficKey(a, b);
    if (key && Number.isFinite(Number(v))) map.set(key, Number(v));
  }
  return map;
}

export function lookupTrafficVolumeInMap(map, label1, label2) {
  const l1 = normalizeTrafficStationName(label1);
  const l2 = normalizeTrafficStationName(label2);
  if (!l1 || !l2 || l1 === '—' || l2 === '—') return null;
  const tryPair = (a, b) => {
    const key = undirectedTrafficKey(a, b);
    return key ? map.get(key) : undefined;
  };
  let v = tryPair(l1, l2);
  if (v != null) return v;
  const strip = (x) => (x.endsWith('站') ? x.slice(0, -1) : x);
  v = tryPair(strip(l1), strip(l2));
  return v != null ? v : null;
}

/**
 * taipei_h：依 CSV 流量覆寫各切段 `station_weights[0].weight`（與 split 後單筆權重結構一致）
 * @param {{ divideTrafficVolumeBy100ToInt?: boolean, zeroUnmatchedTraffic?: boolean }} [options]
 *   `divideTrafficVolumeBy100ToInt`：taipei_h2／taipei_i2 將 CSV 讀值 ÷100 後四捨五入為整數；
 *   `zeroUnmatchedTraffic`：無法對應 CSV 之切段權重設為 0（taipei_i2、taipei_j3；不保留其他預設／隨機值）
 * @returns {{ matched: number, unmatched: number }}
 */
export function applyMrtTrafficVolumesToTaipeiRoutes(routesData, trafficData, options = {}) {
  const divideTrafficVolumeBy100ToInt = options.divideTrafficVolumeBy100ToInt === true;
  const zeroUnmatchedTraffic = options.zeroUnmatchedTraffic === true;
  const rows = trafficData?.rows ?? trafficData ?? [];
  const map = buildTrafficVolumeMapFromRows(rows);
  const connectLookup = buildConnectNumberToLabelMap(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const connectGridLabelMap = buildConnectGridKeyToLabel(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const blackLabelsByGrid = buildBlackStationDisplayByGrid(options.stationData);
  const sectionRouteGridLabelMap = buildSectionRouteGridLabelMap(options.sectionData);
  const labelCtx = {
    connectLookup,
    connectGridLabelMap,
    blackLabelsByGrid,
    stationData: options.stationData,
    connectData: options.connectData,
    sectionRouteGridLabelMap,
  };
  let matched = 0;
  let unmatched = 0;
  if (!Array.isArray(routesData)) return { matched: 0, unmatched: 0 };
  for (const route of routesData) {
    const routeName = route.route_name || route.name || 'Unknown';
    const ctxWithRoute = { ...labelCtx, routeName };
    for (const seg of route.segments || []) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      const nn = pts.length;
      const sNode = getNodeAtSegmentIndex(seg, 0, nn);
      const eNode = getNodeAtSegmentIndex(seg, nn - 1, nn);
      const n1 = resolveTaipeiFStationLabel(sNode, ctxWithRoute);
      const n2 = resolveTaipeiFStationLabel(eNode, ctxWithRoute);
      let vol = lookupTrafficVolumeInMap(map, n1, n2);
      if (vol != null && Number.isFinite(vol)) {
        let w = Number(vol);
        if (divideTrafficVolumeBy100ToInt) {
          w = Math.round(w / 100);
        }
        if (!Array.isArray(seg.station_weights) || seg.station_weights.length === 0) {
          seg.station_weights = [{ start_idx: 0, end_idx: nn - 1, weight: w }];
        } else if (seg.station_weights[0]) {
          seg.station_weights[0].weight = w;
          seg.station_weights[0].start_idx = 0;
          seg.station_weights[0].end_idx = nn - 1;
        }
        matched++;
      } else {
        unmatched++;
        if (zeroUnmatchedTraffic) {
          if (!Array.isArray(seg.station_weights) || seg.station_weights.length === 0) {
            seg.station_weights = [{ start_idx: 0, end_idx: nn - 1, weight: 0 }];
          } else if (seg.station_weights[0]) {
            seg.station_weights[0].weight = 0;
            seg.station_weights[0].start_idx = 0;
            seg.station_weights[0].end_idx = nn - 1;
          }
        }
      }
    }
  }
  return { matched, unmatched };
}

/**
 * 將 CSV 流量寫入地圖路段匯出 JSON 的 `segment.start.weight` 與各 `segment.stations[i].weight`
 *（語意：該點沿折線到「下一個具名節點」之邊權重；`end` 不寫入 weight）。
 * 與 `applyMrtTrafficVolumesToTaipeiRoutes` 相同之站名解析與 CSV 鍵（undirected）。
 *
 * @param {object|Array} jsonRoot - 頂層為 mapDrawn 列陣列，或 bundle `{ mapDrawnRoutes: [...] }`
 * @param {*} trafficData - 同 `applyMrtTrafficVolumesToTaipeiRoutes`
 * @param {{ connectData?: Array, stationData?: Array, sectionData?: Array, divideTrafficVolumeBy100ToInt?: boolean, zeroUnmatchedTraffic?: boolean }} [options]
 */
export function applyOutgoingTrafficWeightsToMapDrawnExportJson(jsonRoot, trafficData, options = {}) {
  const divideTrafficVolumeBy100ToInt = options.divideTrafficVolumeBy100ToInt === true;
  const zeroUnmatchedTraffic = options.zeroUnmatchedTraffic === true;
  const rows = trafficData?.rows ?? trafficData ?? [];
  const map = buildTrafficVolumeMapFromRows(rows);
  const connectLookup = buildConnectNumberToLabelMap(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const connectGridLabelMap = buildConnectGridKeyToLabel(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const blackLabelsByGrid = buildBlackStationDisplayByGrid(options.stationData);
  const sectionRouteGridLabelMap = buildSectionRouteGridLabelMap(options.sectionData);
  const labelCtx = {
    connectLookup,
    connectGridLabelMap,
    blackLabelsByGrid,
    stationData: options.stationData,
    connectData: options.connectData,
    sectionRouteGridLabelMap,
  };

  let mapDrawnRows = null;
  if (Array.isArray(jsonRoot) && isMapDrawnRoutesExportArray(jsonRoot)) {
    mapDrawnRows = jsonRoot;
  } else if (
    jsonRoot &&
    typeof jsonRoot === 'object' &&
    Array.isArray(jsonRoot.mapDrawnRoutes) &&
    isMapDrawnRoutesExportArray(jsonRoot.mapDrawnRoutes)
  ) {
    mapDrawnRows = jsonRoot.mapDrawnRoutes;
  }
  if (!Array.isArray(mapDrawnRows) || mapDrawnRows.length === 0) return;

  for (const row of mapDrawnRows) {
    if (!row || typeof row !== 'object' || !row.segment || typeof row.segment !== 'object') continue;
    const routeName = String(row.routeName || 'Unknown');
    const ctxWithRoute = { ...labelCtx, routeName };
    const seg = row.segment;
    const start = seg.start;
    const end = seg.end;
    if (!start || end == null) continue;
    const stations = Array.isArray(seg.stations) ? seg.stations : [];
    if (end && typeof end === 'object' && 'weight' in end) delete end.weight;

    const chain = [start, ...stations, end].filter((n) => n != null);
    if (chain.length < 2) continue;

    const edgeWeight = (fromNode, toNode) => {
      const n1 = resolveTaipeiFStationLabel(fromNode, ctxWithRoute);
      const n2 = resolveTaipeiFStationLabel(toNode, ctxWithRoute);
      let vol = lookupTrafficVolumeInMap(map, n1, n2);
      if (vol != null && Number.isFinite(vol)) {
        let w = Number(vol);
        if (divideTrafficVolumeBy100ToInt) w = Math.round(w / 100);
        return w;
      }
      if (zeroUnmatchedTraffic) return 0;
      return null;
    };

    for (let i = 0; i < chain.length - 1; i++) {
      const w = edgeWeight(chain[i], chain[i + 1]);
      if (i === 0) {
        if (w != null) start.weight = w;
        else delete start.weight;
      } else {
        const st = stations[i - 1];
        if (st && typeof st === 'object') {
          if (w != null) st.weight = w;
          else delete st.weight;
        }
      }
    }
  }
}

/**
 * 與 `splitTaipeiFRoutesAtBlackStations` ② 相同：每切段一列（#、路線、車站名稱1／2、座標、weight）
 */
export function buildTaipeiFDataTableRowsLikeSplitOutput(routesData, options = {}) {
  const routesForTable = taipeiFSpaceNetworkDataToRoutesForDataTable(routesData);
  const connectLookup = buildConnectNumberToLabelMap(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const connectGridLabelMap = buildConnectGridKeyToLabel(
    options.connectData,
    options.stationData,
    options.sectionData
  );
  const blackLabelsByGrid = buildBlackStationDisplayByGrid(options.stationData);
  const sectionRouteGridLabelMap = buildSectionRouteGridLabelMap(options.sectionData);
  const labelCtx = {
    connectLookup,
    connectGridLabelMap,
    blackLabelsByGrid,
    stationData: options.stationData,
    connectData: options.connectData,
    sectionRouteGridLabelMap,
  };

  const formatCoordCell = (node) => {
    const k = gridKeyFromNode(node);
    if (!k) return '—';
    const [x, y] = k.split(',');
    return `(${x}, ${y})`;
  };

  const rows = [];
  if (!Array.isArray(routesForTable)) {
    return [];
  }
  for (const route of routesForTable) {
    const routeName = route.route_name || route.name || 'Unknown';
    const ctxWithRoute = { ...labelCtx, routeName };
    for (const seg of route.segments || []) {
      const pts = seg.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      const nn = pts.length;
      const sNode = getNodeAtSegmentIndex(seg, 0, nn);
      const eNode = getNodeAtSegmentIndex(seg, nn - 1, nn);
      const rawW = seg.station_weights?.[0]?.weight;
      const weight = rawW != null && Number.isFinite(Number(rawW)) ? Number(rawW) : null;
      const rawNav = seg.nav_weight;
      const nav_weight = rawNav != null && Number.isFinite(Number(rawNav)) ? Number(rawNav) : 1;
      rows.push({
        路線: routeName,
        車站名稱1: resolveTaipeiFStationLabel(sNode, ctxWithRoute),
        車站名稱2: resolveTaipeiFStationLabel(eNode, ctxWithRoute),
        座標1: formatCoordCell(sNode),
        座標2: formatCoordCell(eNode),
        weight,
        nav_weight,
      });
    }
  }

  return rows.map((r, index) => ({
    '#': index + 1,
    ...r,
  }));
}
