/**
 * 黑點（line 站）沿軸向路網滑動：
 * 「向示意圖中心（藍虛線）」僅處理非清單路段黑點，朝 hub／幾何中心滑動且繪圖座標不可越出 getSchematicPlotBoundsFromLayer 之框；
 * 若使用清單專用 API／listedSectionOnly 批次，則為 SectionData「紅點間路段」黑點，沿路網朝選定紅端點格前進（直線或 L 形皆可）；
 * 清單路段多格延伸以網格曼哈頓對該紅格遞減為準（勿用示意圖像素軸距，否則直線段靠非轉乘端易位移 0）；
 * 清單內路段：沿線網往「與其他路線相連」之紅端點移動（不同 route_name 在 SectionData 上 ≥2 種）；
 * 通常該段僅一端為該類紅點；若兩端皆為或皆否則退回曼哈頓較近端。
 * 更新 StationData 黑點格座標；同步 SectionData station_list 中該黑點之格點。
 * 折線優先在「與前後頂點共線」之 line／首或尾 connect 頂點上平移該格；若新格已離開該邊（例如垂直段上的站改水平位移），則自動插入正交轉折點以維持連通。
 * 不位移中間 connect、不位移轉折點（除非併入重合頂點之合併邏輯）。首／尾 connect：同步 original_points、properties、ConnectData／SectionData 端點格。
 * 每輪依目前路網重建鄰接圖。
 * 不修改 execute_c_to_d_test.js。
 */

import {
  collectLineStationGridPointsFromStationData,
  collectStationPlacementPoints,
  normalizeSpaceNetworkDataToFlatSegments,
} from '@/utils/gridNormalizationMinDistance.js';
import {
  getSchematicPlotBoundsFromLayer,
  mapNetworkToSchematicPlotXY,
} from '@/utils/schematicPlotMapper.js';
import {
  buildConnectIncidentSectionCount,
  connectEndpointDedupeKey,
} from '@/utils/sectionRouteConnectEndpoints.js';
import {
  buildListedSectionRouteGridCellKeySet,
  gridCellKeysForListedSectionDataRow,
} from '@/utils/taipeiFColRouteHighlightPlan.js';
import { realignTaipeiFSegmentStationWeightsPreserveOrder } from '@/utils/randomConnectSegmentWeights.js';
import { isTaipeiTestFLayerTab } from '@/utils/taipeiTestPipeline.js';

function toNum(v) {
  return Number(v ?? 0);
}

function getC(p) {
  return Array.isArray(p) ? [toNum(p[0]), toNum(p[1])] : [toNum(p?.x), toNum(p?.y)];
}

const AXIS_EPS = 0.1;
/** 與目標示意圖座標比對「是否已對齊該軸」時使用；勿與 AXIS_EPS 混用，否則 0.1 過寬會讓整段水平線誤判已對齊而無法橫移 */
const TARGET_AXIS_ALIGN_EPS = 1e-5;
/** 與 SpaceNetworkGridTab 藍色虛線十字（crossCx/crossCy）比對「是否貼線」 */
const BLUE_DASHED_CROSS_EPS = 1e-6;

function cellKey(x, y) {
  return `${Math.round(toNum(x))},${Math.round(toNum(y))}`;
}

function parseKey(k) {
  const [a, b] = String(k).split(',');
  return [Math.round(toNum(a)), Math.round(toNum(b))];
}

function nearestGraphCell(bx, by, adj) {
  if (!adj?.size) return null;
  let bestX = 0;
  let bestY = 0;
  let bestD = Infinity;
  for (const k of adj.keys()) {
    const [cx, cy] = parseKey(k);
    const d = (bx - cx) ** 2 + (by - cy) ** 2;
    if (
      d < bestD - 1e-18 ||
      (Math.abs(d - bestD) <= 1e-18 && (cx < bestX || (cx === bestX && cy < bestY)))
    ) {
      bestD = d;
      bestX = cx;
      bestY = cy;
    }
  }
  return [bestX, bestY];
}

function alignStationToGraph(bx, by, adj) {
  const rx = Math.round(toNum(bx));
  const ry = Math.round(toNum(by));
  if (adj.has(cellKey(rx, ry))) return [rx, ry];
  return nearestGraphCell(bx, by, adj);
}

function buildLineAdjacency(flatSegs) {
  const adj = new Map();
  const addUndirected = (ax, ay, bx, by) => {
    const ka = cellKey(ax, ay);
    const kb = cellKey(bx, by);
    if (ka === kb) return;
    if (!adj.has(ka)) adj.set(ka, new Set());
    if (!adj.has(kb)) adj.set(kb, new Set());
    adj.get(ka).add(kb);
    adj.get(kb).add(ka);
  };

  for (const seg of flatSegs || []) {
    const pts = (seg.points || []).map(getC);
    for (let i = 0; i < pts.length - 1; i++) {
      let [x1, y1] = pts[i];
      let [x2, y2] = pts[i + 1];
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      x2 = Math.round(x2);
      y2 = Math.round(y2);
      if (y1 === y2) {
        const ya = y1;
        const step = x2 >= x1 ? 1 : -1;
        for (let x = x1; x !== x2; x += step) {
          addUndirected(x, ya, x + step, ya);
        }
      } else if (x1 === x2) {
        const xa = x1;
        const step = y2 >= y1 ? 1 : -1;
        for (let y = y1; y !== y2; y += step) {
          addUndirected(xa, y, xa, y + step);
        }
      }
    }
  }
  return adj;
}

function redCellSetFromLayer(layer) {
  const set = new Set();
  for (const p of collectStationPlacementPoints(layer)) {
    if (p.kind === 'connect') set.add(cellKey(p.x, p.y));
  }
  return set;
}

function stationDedupeKeyFromRow(row) {
  const s = row.meta;
  const id = s?.station_id ?? s?.tags?.station_id;
  if (id != null && String(id).trim() !== '') return `id:${String(id).trim()}`;
  const fx = Number(row.x);
  const fy = Number(row.y);
  const nm = String(s?.station_name ?? s?.tags?.station_name ?? '')
    .trim()
    .replace(/^—$/, '')
    .replace(/^－$/, '');
  return nm ? `name:${nm}` : `pos:${nm}|${fx.toFixed(5)},${fy.toFixed(5)}`;
}

/** 與 collectLineStationGridPointsFromStationData 相同之鍵，供 SectionData station_list 對應 */
function stationLineRowDedupeKey(row) {
  const s = row.meta;
  if (!s) return 'invalid';
  const id = s?.station_id ?? s?.tags?.station_id;
  if (id != null && String(id).trim() !== '') return `id:${String(id).trim()}`;
  const fx = Number(row.x);
  const fy = Number(row.y);
  return `pos:${String(s?.station_name ?? s.tags?.station_name ?? '')}|${fx.toFixed(5)},${fy.toFixed(5)}`;
}

function stationLineRowDedupeKeyFromSectionStation(st) {
  if (!st || typeof st !== 'object') return 'invalid';
  const id = st.station_id ?? st.tags?.station_id;
  if (id != null && String(id).trim() !== '') return `id:${String(id).trim()}`;
  const fx = Number(st.x_grid ?? st.tags?.x_grid);
  const fy = Number(st.y_grid ?? st.tags?.y_grid);
  return `pos:${String(st.station_name ?? st.tags?.station_name ?? '')}|${fx.toFixed(5)},${fy.toFixed(5)}`;
}

function normalizedStationName(v) {
  return String(v ?? '')
    .trim()
    .replace(/^—$/, '')
    .replace(/^－$/, '');
}

function sectionStationIdentityKeys(st) {
  if (!st || typeof st !== 'object') return [];
  const keys = [];
  const id = st.station_id ?? st.tags?.station_id;
  if (id != null && String(id).trim() !== '') keys.push(`id:${String(id).trim()}`);
  const nm = normalizedStationName(st.station_name ?? st.tags?.station_name);
  if (nm) keys.push(`name:${nm}`);
  const fx = Number(st.x_grid ?? st.tags?.x_grid);
  const fy = Number(st.y_grid ?? st.tags?.y_grid);
  if (Number.isFinite(fx) && Number.isFinite(fy)) {
    keys.push(`pos:${nm}|${fx.toFixed(5)},${fy.toFixed(5)}`);
  }
  return keys;
}

function rowIdentityKeys(row, cx, cy) {
  const s = row?.meta || {};
  const keys = [];
  const id = s.station_id ?? s.tags?.station_id;
  if (id != null && String(id).trim() !== '') keys.push(`id:${String(id).trim()}`);
  const nm = normalizedStationName(s.station_name ?? s.tags?.station_name ?? row?.name);
  if (nm) keys.push(`name:${nm}`);
  const rx = Number.isFinite(cx) ? Number(cx) : Number(row?.x);
  const ry = Number.isFinite(cy) ? Number(cy) : Number(row?.y);
  if (Number.isFinite(rx) && Number.isFinite(ry)) {
    keys.push(`pos:${nm}|${rx.toFixed(5)},${ry.toFixed(5)}`);
  }
  return keys;
}

function formatConnectText(c) {
  if (!c || typeof c !== 'object') return '—';
  const cn = c.connect_number ?? c.tags?.connect_number;
  const name = String(c.station_name ?? c.tags?.station_name ?? '').trim();
  const x = c.x_grid ?? c.tags?.x_grid;
  const y = c.y_grid ?? c.tags?.y_grid;
  const parts = [];
  if (cn != null && String(cn).trim() !== '') parts.push(`#${cn}`);
  if (name) parts.push(name);
  if (x != null && y != null) parts.push(`(${Math.round(Number(x))},${Math.round(Number(y))})`);
  return parts.join(' ') || '—';
}

function gridOfConnectForHub(c) {
  const x = c?.x_grid ?? c?.tags?.x_grid;
  const y = c?.y_grid ?? c?.tags?.y_grid;
  if (x == null || y == null) return null;
  return [Math.round(Number(x)), Math.round(Number(y))];
}

/**
 * 紅點連到「不同 route_name」數量 ≥2 視為與其他路段相連（hub）。
 */
function buildConnectIncidentRouteCount(sectionData) {
  const routesByConnect = new Map();
  for (const sd of sectionData || []) {
    if (!sd) continue;
    const rn = String(sd.route_name ?? sd.route_hint ?? '').trim();
    const keys = new Set();
    for (const term of ['connect_start', 'connect_end']) {
      const c = sd[term];
      if (!c) continue;
      const key = connectEndpointDedupeKey(c);
      if (key === 'invalid') continue;
      keys.add(key);
    }
    for (const key of keys) {
      if (!routesByConnect.has(key)) routesByConnect.set(key, new Set());
      if (rn) routesByConnect.get(key).add(rn);
    }
  }
  const countMap = new Map();
  for (const [key, rset] of routesByConnect.entries()) {
    countMap.set(key, rset.size);
  }
  return countMap;
}

/**
 * 與 Control「紅點間路段」清單一致：列入路段之 station_list 身分鍵；
 * 若傳入 layer，併入該路段最短路徑格點鍵（`x,y`），與地圖灰底／位移對無 station_list 之端點一致。
 */
export function buildListedSectionStationKeySet(sectionData, layer) {
  const set = new Set();
  if (!Array.isArray(sectionData) || sectionData.length === 0) {
    if (layer && typeof layer === 'object') {
      for (const k of buildListedSectionRouteGridCellKeySet(layer)) set.add(k);
    }
    return set;
  }
  const counts = buildConnectIncidentSectionCount(sectionData);
  for (const sd of sectionData) {
    if (!sd) continue;
    const sk = sd.connect_start ? connectEndpointDedupeKey(sd.connect_start) : 'invalid';
    const ek = sd.connect_end ? connectEndpointDedupeKey(sd.connect_end) : 'invalid';
    const sc = sk !== 'invalid' ? counts.get(sk) || 0 : 0;
    const ec = ek !== 'invalid' ? counts.get(ek) || 0 : 0;
    if (sc >= 2 && ec >= 2) continue; // 與清單 listSectionRoutesBetweenConnects 一致
    for (const st of sd.station_list || []) {
      for (const key of sectionStationIdentityKeys(st)) set.add(key);
    }
  }
  if (layer && typeof layer === 'object') {
    for (const k of buildListedSectionRouteGridCellKeySet(layer)) set.add(k);
  }
  return set;
}

/**
 * 讀入／重載圖層後呼叫一次：凍結 taipei_f 灰底 highlight 所用鍵集合，之後不依目前折線重算
 * （否則 buildListedSectionRouteGridCellKeySet 隨路線變動，非灰點會變灰）。
 */
export function ensureTaipeiFListedGrayHighlightSnapshot(layer) {
  if (!layer || layer._taipeiFListedGraySnapshotDone) return;
  const sectionData = layer.spaceNetworkGridJsonData_SectionData;
  if (!Array.isArray(sectionData) || sectionData.length === 0) {
    layer._taipeiFListedGraySnapshotDone = true;
    return;
  }
  layer._taipeiFListedGrayStationKeySet = buildListedSectionStationKeySet(sectionData, layer);
  layer._taipeiFListedGrayRouteCellKeySet = buildListedSectionRouteGridCellKeySet(layer);
  layer._taipeiFListedGraySnapshotDone = true;
}

/** StationData 列（collectLineStationGridPointsFromStationData）是否在列入清單之 SectionData 路段上 */
export function isLineStationRowOnListedSectionKeySet(row, listedKeySet) {
  if (!listedKeySet || listedKeySet.size === 0 || !row) return false;
  for (const key of rowIdentityKeys(row, Number(row.x), Number(row.y))) {
    if (listedKeySet.has(key)) return true;
  }
  return false;
}

/**
 * 與 UI 清單相同之 SectionData 筆：每個 station_list 站 → 該段兩紅端點格（含 L 形，不要求同列同行）。
 * 是否為 hub：與 buildHubTargetGridMapByStationKey 相同（不同 route_name ≥2）。
 */
function buildListedSectionEndpointInfoByStationKey(layer) {
  const map = new Map();
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  if (!Array.isArray(sectionData) || sectionData.length === 0) return map;
  const sectCounts = buildConnectIncidentSectionCount(sectionData);
  const routeCounts = buildConnectIncidentRouteCount(sectionData);
  for (const sd of sectionData) {
    if (!sd) continue;
    const sk = sd.connect_start ? connectEndpointDedupeKey(sd.connect_start) : 'invalid';
    const ek = sd.connect_end ? connectEndpointDedupeKey(sd.connect_end) : 'invalid';
    const sc = sk !== 'invalid' ? sectCounts.get(sk) || 0 : 0;
    const ec = ek !== 'invalid' ? sectCounts.get(ek) || 0 : 0;
    if (sc >= 2 && ec >= 2) continue;

    const A = gridOfConnectForHub(sd.connect_start);
    const B = gridOfConnectForHub(sd.connect_end);
    if (!A || !B) continue;

    const startHub = sk !== 'invalid' && (routeCounts.get(sk) || 0) >= 2;
    const endHub = ek !== 'invalid' && (routeCounts.get(ek) || 0) >= 2;
    const routeLabel = `${String(sd.route_name ?? sd.route_hint ?? '').trim() || '（未命名路線）'} · ${formatConnectText(sd.connect_start)} → ${formatConnectText(sd.connect_end)}`;

    for (const st of sd.station_list || []) {
      const keys = sectionStationIdentityKeys(st);
      for (const key of keys) {
        map.set(key, { A, B, startHub, endHub, routeLabel });
      }
    }
    for (const ck of gridCellKeysForListedSectionDataRow(layer, sd)) {
      map.set(ck, { A, B, startHub, endHub, routeLabel });
    }
  }
  return map;
}

function getListedInfoForRow(row, cx, cy, listedEndpointMap) {
  for (const key of rowIdentityKeys(row, cx, cy)) {
    const info = listedEndpointMap.get(key);
    if (info) return info;
  }
  return listedEndpointMap.get(cellKey(cx, cy)) ?? null;
}

function isListedSectionRow(row, cx, cy, listedSectionStationSet) {
  for (const key of rowIdentityKeys(row, cx, cy)) {
    if (listedSectionStationSet.has(key)) return true;
  }
  return listedSectionStationSet.has(cellKey(cx, cy));
}

/**
 * 選定要靠近的紅端點格：優先「與其他路線相連」之一端（startHub／endHub＝該 connect 在 SectionData 上
 * 所屬不同 route_name 數 ≥2）。僅一端符合時必為該端；兩端皆符合或皆不符合時以曼哈頓較近端決定。
 */
function pickListedSectionTargetRedGrid(cx, cy, info) {
  const { A, B, startHub, endHub } = info;
  const manh = (p) => Math.abs(cx - p[0]) + Math.abs(cy - p[1]);
  if (startHub && !endHub) return A;
  if (endHub && !startHub) return B;
  const dA = manh(A);
  const dB = manh(B);
  if (dA < dB) return A;
  if (dB < dA) return B;
  if (A[0] !== B[0]) return A[0] < B[0] ? A : B;
  return A[1] <= B[1] ? A : B;
}

/**
 * 清單內紅點間路段：沿路網鄰接選一步，使格點曼哈頓距離嚴格減小（直線或 L 形皆適用，如左垂直段先下移再橫移）。
 * 不選「紅點（connect）格」為下一步：實際位移由 slideMax 執行，而 slideMax 禁止踩上紅格；若誤選紅鄰格會導致位移 0（例如緊鄰轉乘端之黑點）。
 */
function chooseSlideDeltaListedSectionTowardRed(cx, cy, adj, info, redSet) {
  const [tgX, tgY] = pickListedSectionTargetRedGrid(cx, cy, info);
  const manh = (x, y) => Math.abs(x - tgX) + Math.abs(y - tgY);
  const cur = manh(cx, cy);
  if (cur === 0) return null;
  const k = cellKey(cx, cy);
  const nbr = adj.get(k);
  if (!nbr || nbr.size === 0) return null;
  let bestD = Infinity;
  const candidates = [];
  for (const nk of nbr) {
    if (redSet && redSet.has(nk)) continue;
    const [nx, ny] = parseKey(nk);
    const d = manh(nx, ny);
    if (d < bestD) {
      bestD = d;
      candidates.length = 0;
      candidates.push([nx, ny, nk]);
    } else if (d === bestD) {
      candidates.push([nx, ny, nk]);
    }
  }
  if (!Number.isFinite(bestD) || bestD >= cur) return null;
  candidates.sort((a, b) => String(a[2]).localeCompare(String(b[2]), 'en'));
  const [bestNx, bestNy] = candidates[0];
  const dx = bestNx - cx;
  const dy = bestNy - cy;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  return { dx, dy };
}

/**
 * 紅點 route-incident ≥2 視為與其他路段相連；該 SectionData 段內黑點往該紅點格滑動。
 * 兩端皆為轉乘紅點時，每顆黑點往曼哈頓距離較近之一端。
 */
function buildHubTargetGridMapByStationKey(layer) {
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const map = new Map();
  if (!Array.isArray(sectionData) || sectionData.length === 0) return map;
  const counts = buildConnectIncidentRouteCount(sectionData);

  for (const sd of sectionData) {
    if (!sd) continue;
    const hubs = [];
    const seenHub = new Set();
    for (const term of ['connect_start', 'connect_end']) {
      const c = sd[term];
      if (!c) continue;
      const ek = connectEndpointDedupeKey(c);
      if (ek === 'invalid') continue;
      if ((counts.get(ek) || 0) < 2) continue;
      const g = gridOfConnectForHub(c);
      if (!g) continue;
      const gk = cellKey(g[0], g[1]);
      if (seenHub.has(gk)) continue;
      seenHub.add(gk);
      hubs.push({ gx: g[0], gy: g[1] });
    }
    if (hubs.length === 0) continue;

    for (const st of sd.station_list || []) {
      const key = stationLineRowDedupeKeyFromSectionStation(st);
      if (key === 'invalid') continue;
      let gx;
      let gy;
      if (hubs.length === 1) {
        gx = hubs[0].gx;
        gy = hubs[0].gy;
      } else {
        const sx = Math.round(Number(st.x_grid ?? st.tags?.x_grid));
        const sy = Math.round(Number(st.y_grid ?? st.tags?.y_grid));
        let best = hubs[0];
        let bestD = Math.abs(sx - hubs[0].gx) + Math.abs(sy - hubs[0].gy);
        for (let i = 1; i < hubs.length; i++) {
          const d = Math.abs(sx - hubs[i].gx) + Math.abs(sy - hubs[i].gy);
          if (d < bestD - 1e-9) {
            bestD = d;
            best = hubs[i];
          } else if (Math.abs(d - bestD) <= 1e-9) {
            if (hubs[i].gx < best.gx || (hubs[i].gx === best.gx && hubs[i].gy < best.gy)) {
              best = hubs[i];
            }
          }
        }
        gx = best.gx;
        gy = best.gy;
      }
      map.set(key, { gx, gy });
    }
  }
  return map;
}

function resolveSlideTargetPlot(layer, bounds, targetGrid) {
  if (targetGrid && Number.isFinite(targetGrid.gx) && Number.isFinite(targetGrid.gy)) {
    return mapNetworkToSchematicPlotXY(layer, targetGrid.gx, targetGrid.gy);
  }
  return [Number(bounds.centerX), Number(bounds.centerY)];
}

/** 偵測振盪：同一輪後若站點格配置曾出現過則停止 */
function blackStationsLayoutSignature(layer) {
  const rows = collectLineStationGridPointsFromStationData(
    layer.spaceNetworkGridJsonData_StationData
  );
  rows.sort(
    (a, b) =>
      Number(a.y) - Number(b.y) ||
      Number(a.x) - Number(b.x) ||
      stationDedupeKeyFromRow(a).localeCompare(stationDedupeKeyFromRow(b), 'zh-Hant')
  );
  return rows.map((r) => `${stationDedupeKeyFromRow(r)}@${cellKey(r.x, r.y)}`).join('|');
}

function hasHorizNeighbor(adj, cx, cy) {
  const k = cellKey(cx, cy);
  const nbr = adj.get(k);
  if (!nbr) return false;
  for (const nk of nbr) {
    const [nx, ny] = parseKey(nk);
    if (ny === cy && nx !== cx) return true;
  }
  return false;
}

function hasVertNeighbor(adj, cx, cy) {
  const k = cellKey(cx, cy);
  const nbr = adj.get(k);
  if (!nbr) return false;
  for (const nk of nbr) {
    const [nx, ny] = parseKey(nk);
    if (nx === cx && ny !== cy) return true;
  }
  return false;
}

/** 路網上為 L／T 等轉折（同時接水平與垂直段），非純直線中間格 */
function isAxisTurnCell(adj, cx, cy) {
  return hasHorizNeighbor(adj, cx, cy) && hasVertNeighbor(adj, cx, cy);
}

function getCenteringBounds(layer) {
  const bounds = getSchematicPlotBoundsFromLayer(layer);
  if (!bounds) return null;

  let { xMin, xMax, yMin, yMax } = bounds;
  const addPt = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  };

  const rows = collectLineStationGridPointsFromStationData(
    layer.spaceNetworkGridJsonData_StationData
  );
  for (const row of rows) {
    const [px, py] = mapNetworkToSchematicPlotXY(layer, row.x, row.y);
    addPt(px, py);
  }

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    centerX: (xMin + xMax) / 2,
    centerY: (yMin + yMax) / 2,
  };
}

/**
 * 僅依路線折線之示意圖邊界（藍虛線框）取幾何中心；不含黑點擴張、不依 SectionData hub 紅點。
 * 「站點向示意圖中心」之滑動目標應使用此物件搭配 targetGrid=null。
 */
function getSchematicCenteringBoundsForSlide(layer) {
  const b = getSchematicPlotBoundsFromLayer(layer);
  if (!b) return null;
  return {
    xMin: b.xMin,
    xMax: b.xMax,
    yMin: b.yMin,
    yMax: b.yMax,
    centerX: (b.xMin + b.xMax) / 2,
    centerY: (b.yMin + b.yMax) / 2,
  };
}

/** 與 SpaceNetworkGridTab 藍虛線示意邊界一致：網格格點映射後須落在此框內（向心不可越出） */
function isNetworkCellInsideSchematicPlotFrame(layer, gx, gy, frame) {
  if (!frame || !Number.isFinite(frame.xMin)) return true;
  const [px, py] = mapNetworkToSchematicPlotXY(layer, gx, gy);
  return (
    px >= frame.xMin - AXIS_EPS &&
    px <= frame.xMax + AXIS_EPS &&
    py >= frame.yMin - AXIS_EPS &&
    py <= frame.yMax + AXIS_EPS
  );
}

function chooseSlideDelta(layer, bounds, cx, cy, adj, targetGrid) {
  const [tcx, tcy] = resolveSlideTargetPlot(layer, bounds, targetGrid);
  const [px, py] = mapNetworkToSchematicPlotXY(layer, cx, cy);

  const canH = hasHorizNeighbor(adj, cx, cy);
  const canV = hasVertNeighbor(adj, cx, cy);

  const tryH = () => {
    if (!canH) return null;
    if (Math.abs(px - tcx) < TARGET_AXIS_ALIGN_EPS) return null;
    const signX = px < tcx ? 1 : -1;
    return { dx: signX, dy: 0 };
  };

  const tryV = () => {
    if (!canV) return null;
    if (Math.abs(py - tcy) < TARGET_AXIS_ALIGN_EPS) return null;
    const signY = py < tcy ? 1 : -1;
    return { dx: 0, dy: signY };
  };

  if (canH && !canV) return tryH();
  if (canV && !canH) return tryV();
  if (canH && canV) {
    const adx = Math.abs(tcx - px);
    const ady = Math.abs(tcy - py);
    if (adx > ady) {
      const h = tryH();
      if (h) return h;
      return tryV();
    }
    if (ady > adx) {
      const v = tryV();
      if (v) return v;
      return tryH();
    }
    // 兩軸等距：先試垂直再試水平，避免總是先往「右」滑
    const vTie = tryV();
    if (vTie) return vTie;
    return tryH();
  }
  return null;
}

function axisDistanceToSlideTarget(layer, tcx, tcy, x, y, dx) {
  const [px, py] = mapNetworkToSchematicPlotXY(layer, x, y);
  return dx !== 0 ? Math.abs(Number(tcx) - px) : Math.abs(Number(tcy) - py);
}

/**
 * 與 drawMap 之 schematic-center-cross 一致：垂直藍虛線 x=crossCx、水平藍虛線 y=crossCy。
 * 單步正交位移若「從線一側跨到另一側」則視為越線（端點貼線不算跨越）。
 */
function wouldCrossSchematicBlueDashedCenterLines(layer, gx0, gy0, gx1, gy1, dx, dy, frame) {
  if (!frame || !Number.isFinite(frame.xMin)) return false;
  const crossCx = (frame.xMin + frame.xMax) / 2;
  const crossCy = (frame.yMin + frame.yMax) / 2;
  const [px0, py0] = mapNetworkToSchematicPlotXY(layer, gx0, gy0);
  const [px1, py1] = mapNetworkToSchematicPlotXY(layer, gx1, gy1);
  const onVertLine = (px) => Math.abs(px - crossCx) < BLUE_DASHED_CROSS_EPS;
  const onHorizLine = (py) => Math.abs(py - crossCy) < BLUE_DASHED_CROSS_EPS;
  if (dx !== 0 && dy === 0) {
    if (onVertLine(px0) || onVertLine(px1)) return false;
    return (px0 - crossCx) * (px1 - crossCx) < 0;
  }
  if (dx === 0 && dy !== 0) {
    if (onHorizLine(py0) || onHorizLine(py1)) return false;
    return (py0 - crossCy) * (py1 - crossCy) < 0;
  }
  return false;
}

function slideMax(layer, tcx, tcy, curX, curY, dx, dy, adj, redSet, blackOccupied, schematicFrame) {
  let x = curX;
  let y = curY;
  let curDist = axisDistanceToSlideTarget(layer, tcx, tcy, x, y, dx);
  const cap = Math.max(adj.size, 1) + 4;
  for (let s = 0; s < cap; s++) {
    const nx = x + dx;
    const ny = y + dy;
    const nk = cellKey(nx, ny);
    const ck = cellKey(x, y);
    const nbr = adj.get(ck);
    if (!nbr || !nbr.has(nk)) break;
    if (redSet.has(nk)) break;
    if (blackOccupied.has(nk)) break;
    if (schematicFrame && !isNetworkCellInsideSchematicPlotFrame(layer, nx, ny, schematicFrame))
      break;
    if (
      schematicFrame &&
      wouldCrossSchematicBlueDashedCenterLines(layer, x, y, nx, ny, dx, dy, schematicFrame)
    ) {
      break;
    }
    const nextDist = axisDistanceToSlideTarget(layer, tcx, tcy, nx, ny, dx);
    if (nextDist > curDist + AXIS_EPS) {
      // 從直線段踏上「未被黑／紅佔據的轉折格」：允許該軸暫時離中心變遠，以便之後換軸向心
      if (isAxisTurnCell(adj, nx, ny) && !isAxisTurnCell(adj, x, y)) {
        x = nx;
        y = ny;
        curDist = nextDist;
        continue;
      }
      break;
    }
    x = nx;
    y = ny;
    curDist = nextDist;
  }
  return [x, y];
}

/**
 * 清單路段：沿 (dx,dy) 連續多格，僅當「到目標紅格 (tgX,tgY) 的曼哈頓距離」嚴格變短才前進。
 * 向心用的 slideMax 以示意圖像素軸距判斷，在 mapNetworkToSchematicPlotXY 非線性時可能第一步就停，
 * 造成靠「非轉乘端／直線段末端」的黑點位移為 0；清單邏輯須與 chooseSlideDeltaListedSectionTowardRed 同用網格曼哈頓。
 */
function slideMaxListedTowardTargetGrid(tgX, tgY, curX, curY, dx, dy, adj, redSet, blackOccupied) {
  const manh = (gx, gy) => Math.abs(gx - tgX) + Math.abs(gy - tgY);
  let x = curX;
  let y = curY;
  let curM = manh(x, y);
  const cap = Math.max(adj.size, 1) + 4;
  for (let s = 0; s < cap; s++) {
    const nx = x + dx;
    const ny = y + dy;
    const nk = cellKey(nx, ny);
    const ck = cellKey(x, y);
    const nbr = adj.get(ck);
    if (!nbr || !nbr.has(nk)) break;
    if (redSet.has(nk)) break;
    if (blackOccupied.has(nk)) break;
    const nextM = manh(nx, ny);
    if (nextM >= curM) break;
    x = nx;
    y = ny;
    curM = nextM;
  }
  return [x, y];
}

function forEachSegmentInLayer(segments, fn) {
  if (!Array.isArray(segments) || segments.length === 0) return;
  const isMerged = segments[0]?.route_name != null && Array.isArray(segments[0]?.segments);
  if (isMerged) {
    for (const route of segments) {
      for (const seg of route.segments || []) fn(seg, route.route_name);
    }
  } else {
    for (let si = 0; si < segments.length; si++) {
      fn(segments[si], segments[si]?.route_name ?? '');
    }
  }
}

function roundXY(pt) {
  if (!pt) return [0, 0];
  const x = Array.isArray(pt) ? pt[0] : pt.x;
  const y = Array.isArray(pt) ? pt[1] : pt.y;
  return [Math.round(Number(x)), Math.round(Number(y))];
}

function setPointXY(pt, x, y) {
  if (Array.isArray(pt)) {
    pt[0] = x;
    pt[1] = y;
    if (pt.length > 2 && pt[2] && typeof pt[2] === 'object') {
      const p = pt[2];
      if (p.x_grid != null) p.x_grid = x;
      if (p.y_grid != null) p.y_grid = y;
      if (p.tags && typeof p.tags === 'object') {
        p.tags.x_grid = x;
        p.tags.y_grid = y;
      }
    }
  } else if (pt && typeof pt === 'object') {
    pt.x = x;
    pt.y = y;
  }
}

function syncDrawCoordsForVertex(seg, idx, x, y) {
  const nodes = seg.nodes;
  if (Array.isArray(nodes) && nodes[idx]) {
    const n = nodes[idx];
    delete n.display_x;
    delete n.display_y;
    if (n.tags && typeof n.tags === 'object') {
      delete n.tags.display_x;
      delete n.tags.display_y;
    }
  }
  const pt = seg.points?.[idx];
  if (Array.isArray(pt) && pt.length > 2 && pt[2] && typeof pt[2] === 'object') {
    const p = pt[2];
    if (p.x_grid != null) p.x_grid = x;
    if (p.y_grid != null) p.y_grid = y;
    if (p.tags && typeof p.tags === 'object') {
      p.tags.x_grid = x;
      p.tags.y_grid = y;
    }
  }
}

function syncNodeGridAt(seg, idx, x, y) {
  const nodes = seg.nodes;
  if (!Array.isArray(nodes) || !nodes[idx]) return;
  const n = nodes[idx];
  n.x_grid = x;
  n.y_grid = y;
  if (n.tags && typeof n.tags === 'object') {
    n.tags.x_grid = x;
    n.tags.y_grid = y;
  }
}

function hasConnectPropValue(v) {
  return v !== undefined && v !== null && v !== '';
}

/** 含 node_type connect 或 connect_number 之頂點（轉乘端點慣例）。 */
function isConnectVertexAt(seg, i) {
  const node = Array.isArray(seg.nodes) ? seg.nodes[i] : null;
  const pt = Array.isArray(seg.points) ? seg.points[i] : null;
  const ptProps = Array.isArray(pt) && pt.length > 2 ? pt[2] : {};
  const tags = ptProps?.tags || node?.tags || {};
  const nt = String(node?.node_type ?? ptProps?.node_type ?? tags?.node_type ?? '').toLowerCase();
  if (nt === 'connect') return true;
  const hasConnectNumber =
    hasConnectPropValue(node?.connect_number) ||
    hasConnectPropValue(tags?.connect_number) ||
    hasConnectPropValue(ptProps?.connect_number) ||
    hasConnectPropValue(ptProps?.tags?.connect_number);
  return hasConnectNumber;
}

function syncPropsGrid(props, x, y) {
  if (!props || typeof props !== 'object') return;
  props.x_grid = x;
  props.y_grid = y;
  if (props.tags && typeof props.tags === 'object') {
    props.tags.x_grid = x;
    props.tags.y_grid = y;
  }
}

/** ConnectData／StationData／SectionData 端點格與 segment 同步 */
function patchAuxiliaryCoordsByGridMove(layer, oldX, oldY, newX, newY) {
  if (!layer || typeof layer !== 'object') return;
  const ox = Math.round(oldX);
  const oy = Math.round(oldY);
  const nx = Math.round(newX);
  const ny = Math.round(newY);
  const match = (xg, yg) =>
    xg != null && yg != null && Math.round(xg) === ox && Math.round(yg) === oy;

  const patchRow = (row) => {
    if (!row || typeof row !== 'object') return;
    const xg = row.x_grid ?? row.tags?.x_grid;
    const yg = row.y_grid ?? row.tags?.y_grid;
    if (!match(xg, yg)) return;
    if (row.x_grid != null) row.x_grid = nx;
    if (row.y_grid != null) row.y_grid = ny;
    if (row.tags && typeof row.tags === 'object') {
      row.tags.x_grid = nx;
      row.tags.y_grid = ny;
    }
  };

  const cd = layer.spaceNetworkGridJsonData_ConnectData;
  if (Array.isArray(cd)) cd.forEach(patchRow);

  const sd = layer.spaceNetworkGridJsonData_StationData;
  if (Array.isArray(sd)) sd.forEach(patchRow);

  const sec = layer.spaceNetworkGridJsonData_SectionData;
  if (Array.isArray(sec)) {
    for (const row of sec) {
      if (!row) continue;
      for (const key of ['connect_start', 'connect_end']) {
        const c = row[key];
        if (c && typeof c === 'object') {
          const xg = c.x_grid ?? c.tags?.x_grid;
          const yg = c.y_grid ?? c.tags?.y_grid;
          if (!match(xg, yg)) continue;
          if (c.x_grid != null) c.x_grid = nx;
          if (c.y_grid != null) c.y_grid = ny;
          if (c.tags && typeof c.tags === 'object') {
            c.tags.x_grid = nx;
            c.tags.y_grid = ny;
          }
        }
      }
    }
  }
}

function syncSegmentNodesGridFromPoints(seg) {
  const pts = seg?.points;
  const nodes = seg?.nodes;
  if (!Array.isArray(pts) || !Array.isArray(nodes) || nodes.length !== pts.length) return;
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const x = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
    const y = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const n = nodes[i];
    if (!n || typeof n !== 'object') continue;
    n.x_grid = x;
    n.y_grid = y;
    if (n.tags && typeof n.tags === 'object') {
      n.tags.x_grid = x;
      n.tags.y_grid = y;
    }
  }
}

/** 首／尾 connect 頂點位移後：original_points、properties、輔助表 */
function patchConnectEndpointMetadataAfterGridMove(layer, seg, i, nx, ny, ox, oy) {
  const pts = seg.points;
  if (!Array.isArray(pts)) return;
  if (Array.isArray(seg.original_points) && seg.original_points.length === pts.length) {
    const op = seg.original_points[i];
    if (Array.isArray(op)) {
      op[0] = nx;
      op[1] = ny;
    } else if (op && typeof op === 'object') {
      op.x = nx;
      op.y = ny;
    }
  }
  if (i === 0 && seg.properties_start && typeof seg.properties_start === 'object') {
    syncPropsGrid(seg.properties_start, nx, ny);
  }
  if (i === pts.length - 1 && seg.properties_end && typeof seg.properties_end === 'object') {
    syncPropsGrid(seg.properties_end, nx, ny);
  }
  patchAuxiliaryCoordsByGridMove(layer, ox, oy, nx, ny);
}

/** 頂點 i 為幾何轉折（前後邊不同向，正交路網） */
function isOrthogonalCornerVertex(pts, i) {
  if (i <= 0 || i >= pts.length - 1) return false;
  const [px, py] = roundXY(pts[i - 1]);
  const [qx, qy] = roundXY(pts[i + 1]);
  return px !== qx && py !== qy;
}

/**
 * (oxr,oyr) 與相鄰邊共線，且 (nxr,nyr) 為該邊上鄰格一步（中間頂點用，避免一次跳多格改變線形）。
 */
function canSlideOrthInlineVertex(pts, i, oxr, oyr, nxr, nyr) {
  if (!Array.isArray(pts) || pts.length < 2) return false;
  if (Math.abs(nxr - oxr) + Math.abs(nyr - oyr) !== 1) return false;

  if (i === 0) {
    const [qx, qy] = roundXY(pts[1]);
    if (qx === oxr) return nxr === oxr;
    if (qy === oyr) return nyr === oyr;
    return false;
  }
  if (i === pts.length - 1) {
    const [px, py] = roundXY(pts[pts.length - 2]);
    if (px === oxr) return nxr === oxr;
    if (py === oyr) return nyr === oyr;
    return false;
  }

  if (i <= 0 || i >= pts.length - 1) return false;
  const [px, py] = roundXY(pts[i - 1]);
  const [qx, qy] = roundXY(pts[i + 1]);
  if (px === qx && px === oxr && qx === oxr) {
    const yLo = Math.min(py, qy);
    const yHi = Math.max(py, qy);
    return (
      nxr === oxr &&
      Math.abs(nyr - oyr) === 1 &&
      oyr >= yLo &&
      oyr <= yHi &&
      nyr >= yLo &&
      nyr <= yHi
    );
  }
  if (py === qy && py === oyr && qy === oyr) {
    const xLo = Math.min(px, qx);
    const xHi = Math.max(px, qx);
    return (
      nyr === oyr &&
      Math.abs(nxr - oxr) === 1 &&
      oxr >= xLo &&
      oxr <= xHi &&
      nxr >= xLo &&
      nxr <= xHi
    );
  }
  return false;
}

/**
 * (oxr,oyr)→(nxr,nyr) 須為同一段正交邊上之位移（可一步或多步；僅折線首／尾頂點與 slideMax 單次多格對齊）。
 */
function canSlideOrthSameEdgeMulti(pts, i, oxr, oyr, nxr, nyr) {
  if (!Array.isArray(pts) || pts.length < 2) return false;
  if (oxr === nxr && oyr === nyr) return false;
  if (nxr !== oxr && nyr !== oyr) return false;

  if (i === 0) {
    const [qx, qy] = roundXY(pts[1]);
    if (qx === oxr) return nxr === oxr;
    if (qy === oyr) return nyr === oyr;
    return false;
  }
  if (i === pts.length - 1) {
    const [px, py] = roundXY(pts[pts.length - 2]);
    if (px === oxr) return nxr === oxr;
    if (py === oyr) return nyr === oyr;
    return false;
  }

  if (i <= 0 || i >= pts.length - 1) return false;
  const [px, py] = roundXY(pts[i - 1]);
  const [qx, qy] = roundXY(pts[i + 1]);
  if (px === qx && px === oxr && qx === oxr) {
    const yLo = Math.min(py, qy);
    const yHi = Math.max(py, qy);
    return nxr === oxr && oyr >= yLo && oyr <= yHi && nyr >= yLo && nyr <= yHi;
  }
  if (py === qy && py === oyr && qy === oyr) {
    const xLo = Math.min(px, qx);
    const xHi = Math.max(px, qx);
    return nyr === oyr && oxr >= xLo && oxr <= xHi && nxr >= xLo && nxr <= xHi;
  }
  return false;
}

/** 與 (tx,ty) 同列或同行時，從 (curX,curY) 朝目標走一步（曼哈頓鄰格） */
function orthoUnitStepToward(curX, curY, tx, ty) {
  if (curX === tx && curY === ty) return null;
  if (curX !== tx && curY !== ty) return null;
  if (curX === tx) {
    const s = curY < ty ? 1 : curY > ty ? -1 : 0;
    if (s === 0) return null;
    return [curX, curY + s];
  }
  const s = curX < tx ? 1 : curX > tx ? -1 : 0;
  if (s === 0) return null;
  return [curX + s, curY];
}

/** 頂點 i 置於 (nx,ny) 時，與 i-1、i+1 之邊是否皆為水平或垂直（禁止斜邊） */
function moveKeepsOrthogonalityWithNeighbors(pts, i, nx, ny) {
  const n = pts.length;
  if (i > 0) {
    const [px, py] = roundXY(pts[i - 1]);
    if (px !== nx && py !== ny) return false;
  }
  if (i < n - 1) {
    const [qx, qy] = roundXY(pts[i + 1]);
    if (qx !== nx && qy !== ny) return false;
  }
  return true;
}

/** 中間頂點沿軸多格：逐步模擬，每步皆須與鄰點正交 */
function canSimulateMiddleOrthoWalk(pts, i, ox, oy, nx, ny) {
  let cx = ox;
  let cy = oy;
  for (let guard = 0; guard < 65536; guard++) {
    if (cx === nx && cy === ny) return true;
    const next = orthoUnitStepToward(cx, cy, nx, ny);
    if (!next) return false;
    if (!moveKeepsOrthogonalityWithNeighbors(pts, i, next[0], next[1])) return false;
    cx = next[0];
    cy = next[1];
  }
  return false;
}

/** 整數格座標陣列（與 roundXY 後一致）之鄰邊正交檢查 */
function intCoordsPolylineOrthogonal(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return true;
  for (let k = 1; k < coords.length; k++) {
    const [a, b] = coords[k - 1];
    const [c, d] = coords[k];
    if (a !== c && b !== d) return false;
  }
  return true;
}

function orthoNeighborsOkForIntCoords(coords, j, sx, sy) {
  const n = coords.length;
  if (j > 0) {
    const [px, py] = coords[j - 1];
    if (px !== sx && py !== sy) return false;
  }
  if (j < n - 1) {
    const [qx, qy] = coords[j + 1];
    if (qx !== sx && qy !== sy) return false;
  }
  return true;
}

function snapshotSegmentPointsGrid(pts) {
  if (!Array.isArray(pts)) return [];
  return pts.map((_, k) => roundXY(pts[k]));
}

function restoreSegmentPointsGrid(seg, pts, snap) {
  if (!Array.isArray(pts) || !Array.isArray(snap) || snap.length !== pts.length) return;
  for (let k = 0; k < pts.length; k++) {
    const [x, y] = snap[k];
    setPointXY(pts[k], x, y);
    syncDrawCoordsForVertex(seg, k, x, y);
    syncNodeGridAt(seg, k, x, y);
  }
}

function vertexNodeTypeLower(nodes, j) {
  const node = Array.isArray(nodes) ? nodes[j] : null;
  return String(node?.node_type ?? node?.tags?.node_type ?? 'line').toLowerCase();
}

function isConnectNodeAt(nodes, j) {
  return vertexNodeTypeLower(nodes, j) === 'connect';
}

/** 折線上視為「黑點站」之頂點（非 connect，且有 station_id 或可辨識站名） */
function isBlackStationNodeAt(nodes, j) {
  if (isConnectNodeAt(nodes, j)) return false;
  const node = Array.isArray(nodes) ? nodes[j] : null;
  const sid = String(node?.station_id ?? node?.tags?.station_id ?? '').trim();
  if (sid) return true;
  const sn = normalizedStationName(node?.station_name ?? node?.tags?.station_name);
  return !!sn;
}

/**
 * 黑點站沿正交邊移動 (tx,ty) 一步後，將同一段上「兩黑點／紅點錨點之間」的純幾何 line 頂點一併平移，
 * 使兩黑點間折線段隨動（不位移 connect、不位移其他黑點站、不位移轉折點）。
 */
function shiftCollinearPureLineVerticesWithBlackStationStep(seg, im, nxr, nyr, tx, ty) {
  const pts = seg.points;
  const nodes = seg.nodes;
  if (!Array.isArray(pts) || pts.length < 2) return;
  if (tx !== 0 && ty !== 0) return;
  if (tx === 0 && ty === 0) return;
  // 僅折線首／尾頂點允許 |tx|+|ty|>1（路線長度可沿端點伸縮）；中間頂點僅一步，以免一次平移多格改變線形。
  const atPolylineEndpoint = im === 0 || im === pts.length - 1;
  if (!atPolylineEndpoint && Math.abs(tx) + Math.abs(ty) !== 1) return;

  const [xm, ym] = roundXY(pts[im]);
  if (xm !== nxr || ym !== nyr) return;

  const prev = im > 0 ? roundXY(pts[im - 1]) : null;
  const next = im < pts.length - 1 ? roundXY(pts[im + 1]) : null;

  // 端點（首或尾）：只有一側相鄰邊，依該邊方向決定 horizontal／vertical
  let horizontal;
  let vertical;
  if (prev && next) {
    horizontal = prev[1] === ym && next[1] === ym;
    vertical = prev[0] === xm && next[0] === xm;
  } else if (!prev && next) {
    // 首端點：只看 next
    horizontal = next[1] === ym && ty === 0;
    vertical = next[0] === xm && tx === 0;
  } else if (prev && !next) {
    // 末端點：只看 prev
    horizontal = prev[1] === ym && ty === 0;
    vertical = prev[0] === xm && tx === 0;
  } else {
    return;
  }
  if (!horizontal && !vertical) return;

  let lo = im;
  let hi = im;
  if (horizontal) {
    while (lo > 0 && roundXY(pts[lo - 1])[1] === ym) lo--;
    while (hi < pts.length - 1 && roundXY(pts[hi + 1])[1] === ym) hi++;
  } else {
    while (lo > 0 && roundXY(pts[lo - 1])[0] === xm) lo--;
    while (hi < pts.length - 1 && roundXY(pts[hi + 1])[0] === xm) hi++;
  }

  // 僅平移與錨點共線之 run；若有格點已脫離該水平／垂直線，平移會拉出斜邊，直接放棄整段 shift
  for (let j = lo; j <= hi; j++) {
    const [gx, gy] = roundXY(pts[j]);
    if (horizontal && gy !== ym) return;
    if (vertical && gx !== xm) return;
  }

  const shiftJsForward = [];
  for (let j = im + 1; j <= hi; j++) {
    if (isConnectNodeAt(nodes, j)) break;
    if (isBlackStationNodeAt(nodes, j)) break;
    if (isOrthogonalCornerVertex(pts, j)) break;
    const [qx, qy] = roundXY(pts[j]);
    if (horizontal && qy !== ym) break;
    if (vertical && qx !== xm) break;
    shiftJsForward.push(j);
  }
  const shiftJsBackward = [];
  for (let j = im - 1; j >= lo; j--) {
    if (isConnectNodeAt(nodes, j)) break;
    if (isBlackStationNodeAt(nodes, j)) break;
    if (isOrthogonalCornerVertex(pts, j)) break;
    const [qx, qy] = roundXY(pts[j]);
    if (horizontal && qy !== ym) break;
    if (vertical && qx !== xm) break;
    shiftJsBackward.push(j);
  }

  const coords = pts.map((p) => roundXY(p));
  const revertIm = () => {
    const rx = nxr - tx;
    const ry = nyr - ty;
    setPointXY(pts[im], rx, ry);
    syncDrawCoordsForVertex(seg, im, rx, ry);
    syncNodeGridAt(seg, im, rx, ry);
  };

  const tryApplyToCoords = (j) => {
    const [qx, qy] = coords[j];
    const sx = qx + tx;
    const sy = qy + ty;
    if (!orthoNeighborsOkForIntCoords(coords, j, sx, sy)) return false;
    coords[j] = [sx, sy];
    return true;
  };

  for (const j of shiftJsForward) {
    if (!tryApplyToCoords(j)) {
      revertIm();
      return;
    }
  }
  for (const j of shiftJsBackward) {
    if (!tryApplyToCoords(j)) {
      revertIm();
      return;
    }
  }
  if (!intCoordsPolylineOrthogonal(coords)) {
    revertIm();
    return;
  }

  const applyToPts = (j) => {
    const [sx, sy] = coords[j];
    setPointXY(pts[j], sx, sy);
    syncDrawCoordsForVertex(seg, j, sx, sy);
    syncNodeGridAt(seg, j, sx, sy);
  };
  for (const j of shiftJsForward) applyToPts(j);
  for (const j of shiftJsBackward) applyToPts(j);
}

/** 將被刪除頂點之黑點站屬性併入保留頂點（供「黑點併入既有轉折格」） */
function mergeBlackStationNodeFieldsInto(target, source) {
  if (!target || !source || typeof target !== 'object' || typeof source !== 'object') return;
  const sid = source.station_id ?? source.tags?.station_id;
  const sname = source.station_name ?? source.tags?.station_name;
  if (sid != null && String(sid).trim() !== '') {
    target.station_id = sid;
    if (!target.tags || typeof target.tags !== 'object') target.tags = {};
    target.tags.station_id = sid;
  }
  if (sname !== undefined && String(sname).trim() !== '') {
    target.station_name = sname;
    if (!target.tags || typeof target.tags !== 'object') target.tags = {};
    target.tags.station_name = sname;
  }
}

/**
 * 黑點新格 (nxr,nyr) 與折線上另一頂點 k 重合（常為轉折點）：刪除 i…k 之間之中間頂點與黑點原頂點，保留轉折格之路段。
 * 僅當 (lo+1..hi-1) 無 connect、無其他黑點站、無轉折點時執行。
 */
function tryMergeStationOntoCoincidentVertex(seg, layer, oxr, oyr, nxr, nyr) {
  const pts = seg.points;
  const nodes = seg.nodes;
  if (!Array.isArray(pts) || pts.length < 2) return false;

  let i = -1;
  for (let j = 0; j < pts.length; j++) {
    const [cx, cy] = roundXY(pts[j]);
    if (cx === oxr && cy === oyr) {
      i = j;
      break;
    }
  }
  if (i < 0) return false;

  const isConnI = isConnectVertexAt(seg, i);
  if (isConnI && !(i === 0 || i === pts.length - 1)) return false;

  let k = -1;
  for (let j = 0; j < pts.length; j++) {
    if (j === i) continue;
    const [cx, cy] = roundXY(pts[j]);
    if (cx === nxr && cy === nyr) {
      k = j;
      break;
    }
  }
  if (k < 0) return false;

  const isConnK = isConnectVertexAt(seg, k);
  if (isConnK && !(k === 0 || k === pts.length - 1)) return false;

  const lo = Math.min(i, k);
  const hi = Math.max(i, k);
  for (let j = lo + 1; j < hi; j++) {
    if (isConnectNodeAt(nodes, j)) return false;
    if (j !== i && isBlackStationNodeAt(nodes, j)) return false;
    if (isOrthogonalCornerVertex(pts, j)) return false;
  }

  const absorbedNode =
    Array.isArray(nodes) && nodes[i] ? { ...nodes[i], tags: { ...(nodes[i].tags || {}) } } : null;
  const opSync = Array.isArray(seg.original_points) && seg.original_points.length === pts.length;

  if (i < k) {
    const removeCount = k - i;
    pts.splice(i, removeCount);
    if (Array.isArray(nodes) && nodes.length >= i + removeCount) nodes.splice(i, removeCount);
    if (opSync) seg.original_points.splice(i, removeCount);
    adjustStationWeightsAfterPointsSplice(seg, i, removeCount, 0, layer);
    if (Array.isArray(nodes) && nodes[i] && absorbedNode) {
      mergeBlackStationNodeFieldsInto(nodes[i], absorbedNode);
    }
  } else {
    const removeCount = i - k;
    const spliceStart = k + 1;
    pts.splice(spliceStart, removeCount);
    if (Array.isArray(nodes) && nodes.length >= spliceStart + removeCount)
      nodes.splice(spliceStart, removeCount);
    if (opSync) seg.original_points.splice(spliceStart, removeCount);
    adjustStationWeightsAfterPointsSplice(seg, spliceStart, removeCount, 0, layer);
    if (Array.isArray(nodes) && nodes[k] && absorbedNode) {
      mergeBlackStationNodeFieldsInto(nodes[k], absorbedNode);
    }
  }

  if (Array.isArray(seg.original_points) && seg.original_points.length !== pts.length) {
    seg.original_points = null;
  }

  syncSegmentNodesGridFromPoints(seg);
  return true;
}

const GRID_EPS = 1e-9;

/** 單站向心一步內可沿路網連續滑動直到無下一步（經轉折可換向） */
const SLIDE_CHAIN_MAX_STEPS = 65536;

/**
 * points 頂點 splice 後，依索引平移規則修正 station_weights（弧長中點仍落在正確邊段上）。
 * @param {object} seg
 * @param {number} start splice 起點索引
 * @param {number} removeCount 刪除頂點數
 * @param {number} insertCount 插入頂點數（通常為 splice 第三參數展開長度）
 * @param {object} [layer] taipei_f 時於索引重對應後再依相鄰站點重建 station_weights，避免權重消失
 */
function adjustStationWeightsAfterPointsSplice(seg, start, removeCount, insertCount, layer) {
  const sw = seg.station_weights;
  if (!Array.isArray(sw) || sw.length === 0) return;
  const newLen = Array.isArray(seg.points) ? seg.points.length : 0;
  if (newLen < 2) {
    seg.station_weights = [];
    return;
  }
  const cutEnd = start + removeCount;
  const delta = insertCount - removeCount;

  const remapIdx = (oldIdx) => {
    if (typeof oldIdx !== 'number' || !Number.isFinite(oldIdx)) return -1;
    const o = Math.round(oldIdx);
    if (o < start) return o;
    if (o >= cutEnd) return o + delta;
    if (insertCount <= 0) return Math.min(start, newLen - 1);
    return start + Math.min(o - start, insertCount - 1);
  };

  const next = [];
  for (const w of sw) {
    if (!w || typeof w !== 'object') continue;
    let s = remapIdx(w.start_idx);
    let e = remapIdx(w.end_idx);
    if (s < 0 || e < 0) continue;
    if (s > e) {
      const t = s;
      s = e;
      e = t;
    }
    s = Math.max(0, Math.min(newLen - 1, s));
    e = Math.max(0, Math.min(newLen - 1, e));
    if (s >= e) continue;
    next.push({ ...w, start_idx: s, end_idx: e });
  }
  seg.station_weights = next;
  if (layer && isTaipeiTestFLayerTab(layer.layerId)) {
    const fallbackOrdered =
      next.length === 0
        ? sw.filter((w) => w && Number.isFinite(Number(w.weight))).map((w) => Number(w.weight))
        : null;
    realignTaipeiFSegmentStationWeightsPreserveOrder(seg, layer, {
      fallbackOrderedWeights: fallbackOrdered,
    });
  }
}

function sameGridPoint2(a, b) {
  return Math.abs(a[0] - b[0]) < GRID_EPS && Math.abs(a[1] - b[1]) < GRID_EPS;
}

function pushOrthoPointUnique(arr, x, y) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (arr.length && arr[arr.length - 1][0] === rx && arr[arr.length - 1][1] === ry) return;
  arr.push([rx, ry]);
}

/** A、M、B 是否共垂直線或共水平線（整數格） */
function collinearOrtho3(A, M, B) {
  return (A[0] === M[0] && M[0] === B[0]) || (A[1] === M[1] && M[1] === B[1]);
}

/** 直線段 A–B 上 S' 不在該線時：繞行仍保持與原線段相同的「先鉛直／先水平」骨架（與原 A–S_old–B 軸向一致） */
function buildCollinearDetourPath(A, Sp, B, verticalSpine) {
  const [xp, yp] = Sp;
  const out = [];
  if (verticalSpine) {
    const x0 = A[0];
    pushOrthoPointUnique(out, A[0], A[1]);
    pushOrthoPointUnique(out, x0, yp);
    pushOrthoPointUnique(out, xp, yp);
    pushOrthoPointUnique(out, xp, B[1]);
    pushOrthoPointUnique(out, x0, B[1]);
  } else {
    const y0 = A[1];
    pushOrthoPointUnique(out, A[0], y0);
    pushOrthoPointUnique(out, xp, y0);
    pushOrthoPointUnique(out, xp, yp);
    pushOrthoPointUnique(out, B[0], yp);
    pushOrthoPointUnique(out, B[0], y0);
  }
  return out;
}

/** 第一段沿 A→S_old 的軸向（與原邊同向）抵達 S' */
function segmentAToSpFirstAlongIn(A, Sp, firstLegVertical) {
  const [xA, yA] = A;
  const [xp, yp] = Sp;
  const out = [];
  pushOrthoPointUnique(out, xA, yA);
  if (firstLegVertical) {
    pushOrthoPointUnique(out, xA, yp);
    pushOrthoPointUnique(out, xp, yp);
  } else {
    pushOrthoPointUnique(out, xp, yA);
    pushOrthoPointUnique(out, xp, yp);
  }
  return out;
}

/** 最後一段沿 S_old→B 的軸向（與原邊同向）離開 S' 抵達 B */
function segmentSpToBLastAlongOut(Sp, B, lastLegVertical) {
  const [xp, yp] = Sp;
  const [xB, yB] = B;
  const out = [];
  pushOrthoPointUnique(out, xp, yp);
  if (lastLegVertical) {
    pushOrthoPointUnique(out, xB, yp);
    pushOrthoPointUnique(out, xB, yB);
  } else {
    pushOrthoPointUnique(out, xp, yB);
    pushOrthoPointUnique(out, xB, yB);
  }
  return out;
}

function mergeOrthoPathsDedup(p1, p2) {
  if (!p1.length) return p2.slice();
  if (!p2.length) return p1.slice();
  const a = p1[p1.length - 1];
  const b = p2[0];
  if (a[0] === b[0] && a[1] === b[1]) return p1.concat(p2.slice(1));
  return p1.concat(p2);
}

/**
 * 依原折線在 S_old 的進入邊／離開邊建 A→S'→B，不任意交換先橫先直（維持原 L 形骨架）。
 */
function buildSpinePreservingABPath(A, S_old, Sp, B) {
  const inVert = A[0] === S_old[0];
  const inHoriz = A[1] === S_old[1];
  const outVert = S_old[0] === B[0];
  const outHoriz = S_old[1] === B[1];
  if ((inVert && inHoriz) || (!inVert && !inHoriz)) return null;
  if ((outVert && outHoriz) || (!outVert && !outHoriz)) return null;

  const firstLegVertical = inVert;
  const lastLegVertical = outVert;

  if (collinearOrtho3(A, S_old, B)) {
    const verticalSpine = A[0] === S_old[0] && S_old[0] === B[0];
    return buildCollinearDetourPath(A, Sp, B, verticalSpine);
  }

  const p1 = segmentAToSpFirstAlongIn(A, Sp, firstLegVertical);
  const p2 = segmentSpToBLastAlongOut(Sp, B, lastLegVertical);
  return mergeOrthoPathsDedup(p1, p2);
}

function cloneNodeDeepForReconnect(n) {
  if (!n || typeof n !== 'object') return { node_type: 'line' };
  try {
    return JSON.parse(JSON.stringify(n));
  } catch {
    return { node_type: 'line' };
  }
}

function makePointAtCoord(templatePt, x, y) {
  if (Array.isArray(templatePt)) {
    const out = [x, y];
    if (templatePt.length > 2 && templatePt[2] != null && typeof templatePt[2] === 'object') {
      out.push(JSON.parse(JSON.stringify(templatePt[2])));
    }
    return out;
  }
  if (templatePt && typeof templatePt === 'object') {
    return { ...templatePt, x, y, x_grid: x, y_grid: y };
  }
  return [x, y];
}

function lineNodeForInsertedVertex(xi, yi) {
  return {
    node_type: 'line',
    x_grid: xi,
    y_grid: yi,
    tags: { x_grid: xi, y_grid: yi, node_type: 'line' },
  };
}

function findStationVertexIndexForGridMove(seg, oxr, oyr, sid, nameRaw) {
  const pts = seg.points;
  const nodes = seg.nodes;
  if (!Array.isArray(pts)) return -1;

  for (let i = 0; i < pts.length; i++) {
    const [cx, cy] = roundXY(pts[i]);
    if (cx !== oxr || cy !== oyr) continue;
    const isConn = isConnectVertexAt(seg, i);
    const isEndpointConnect = isConn && (i === 0 || i === pts.length - 1);
    if (isConn && !isEndpointConnect) continue;
    if (!isConn && isOrthogonalCornerVertex(pts, i) && !isBlackStationNodeAt(nodes, i)) continue;
    if (sid) {
      const node = nodes?.[i];
      const nid = String(node?.station_id ?? node?.tags?.station_id ?? '').trim();
      if (nid && nid !== sid) continue;
    } else if (nameRaw) {
      const node = nodes?.[i];
      const pn = normalizedStationName(node?.station_name ?? node?.tags?.station_name);
      const nr = normalizedStationName(nameRaw);
      if (pn && nr && pn !== nr) continue;
    }
    return i;
  }
  if (sid) {
    for (let i = 0; i < pts.length; i++) {
      const isConn = isConnectVertexAt(seg, i);
      const isEndpointConnect = isConn && (i === 0 || i === pts.length - 1);
      if (isConn && !isEndpointConnect) continue;
      const nid = String(nodes?.[i]?.station_id ?? nodes?.[i]?.tags?.station_id ?? '').trim();
      if (!nid || nid !== sid) continue;
      if (!isConn && isOrthogonalCornerVertex(pts, i) && !isBlackStationNodeAt(nodes, i)) continue;
      return i;
    }
  }
  return -1;
}

/**
 * 黑點新格已離開原共線邊時：依原 A→S_old、S_old→B 的軸向插入轉折，替換該段子折線（不任意改變原 L／直線骨架）。
 */
function tryReconnectStationInsertCorners(seg, layer, oxr, oyr, nxr, nyr, sid, nameRaw) {
  const pts = seg.points;
  const nodes = seg.nodes;
  if (!Array.isArray(pts) || pts.length < 2 || !Array.isArray(nodes)) return false;

  const i = findStationVertexIndexForGridMove(seg, oxr, oyr, sid, nameRaw);
  if (i < 0) return false;

  if (canSlideOrthSameEdgeMulti(pts, i, oxr, oyr, nxr, nyr)) return false;

  const isConn = isConnectVertexAt(seg, i);
  const isEndpointConnect = isConn && (i === 0 || i === pts.length - 1);
  const wasStart = i === 0;

  const S_old = [oxr, oyr];
  const Sp = [nxr, nyr];

  let combined;
  if (i > 0 && i < pts.length - 1) {
    const A = roundXY(pts[i - 1]);
    const B = roundXY(pts[i + 1]);
    if (sameGridPoint2(A, Sp) || sameGridPoint2(B, Sp)) return false;
    combined = buildSpinePreservingABPath(A, S_old, Sp, B);
  } else if (i === 0) {
    const B = roundXY(pts[1]);
    if (sameGridPoint2(Sp, B)) return false;
    const lastLegVertical = S_old[0] === B[0];
    combined = segmentSpToBLastAlongOut(Sp, B, lastLegVertical);
  } else {
    const A = roundXY(pts[i - 1]);
    if (sameGridPoint2(A, Sp)) return false;
    const firstLegVertical = A[0] === S_old[0];
    combined = segmentAToSpFirstAlongIn(A, Sp, firstLegVertical);
  }

  if (!combined || combined.length < 2) return false;
  if (!intCoordsPolylineOrthogonal(combined)) return false;
  if (!combined.some(([x, y]) => x === nxr && y === nyr)) return false;

  const newPoints = [];
  const newNodes = [];

  for (let k = 0; k < combined.length; k++) {
    const [xk, yk] = combined[k];
    const isA = k === 0 && i > 0;
    const isB = k === combined.length - 1 && i < pts.length - 1;
    const isStation = xk === nxr && yk === nyr;

    let tplPt;
    let nodeSrcIdx;
    if (isStation) {
      tplPt = pts[i];
      nodeSrcIdx = i;
    } else if (isA) {
      tplPt = pts[i - 1];
      nodeSrcIdx = i - 1;
    } else if (isB) {
      tplPt = pts[i + 1];
      nodeSrcIdx = i + 1;
    } else {
      tplPt = pts[i];
      nodeSrcIdx = -1;
    }
    newPoints.push(makePointAtCoord(tplPt, xk, yk));
    if (nodeSrcIdx >= 0 && nodes[nodeSrcIdx]) {
      newNodes.push(cloneNodeDeepForReconnect(nodes[nodeSrcIdx]));
    } else {
      newNodes.push(lineNodeForInsertedVertex(xk, yk));
    }
  }

  if (newPoints.length !== newNodes.length) return false;

  if (i > 0 && i < pts.length - 1) {
    const stIdx = i - 1;
    const rem = 3;
    const ins = newPoints.length;
    pts.splice(stIdx, rem, ...newPoints);
    nodes.splice(stIdx, rem, ...newNodes);
    adjustStationWeightsAfterPointsSplice(seg, stIdx, rem, ins, layer);
  } else if (i === 0) {
    const rem = 2;
    const ins = newPoints.length;
    pts.splice(0, rem, ...newPoints);
    nodes.splice(0, rem, ...newNodes);
    adjustStationWeightsAfterPointsSplice(seg, 0, rem, ins, layer);
  } else {
    const stIdx = i - 1;
    const rem = 2;
    const ins = newPoints.length;
    pts.splice(stIdx, rem, ...newPoints);
    nodes.splice(stIdx, rem, ...newNodes);
    adjustStationWeightsAfterPointsSplice(seg, stIdx, rem, ins, layer);
  }

  for (let j = 0; j < pts.length; j++) {
    const [gx, gy] = roundXY(pts[j]);
    syncDrawCoordsForVertex(seg, j, gx, gy);
    syncNodeGridAt(seg, j, gx, gy);
  }

  if (isEndpointConnect) {
    const ep = wasStart ? 0 : pts.length - 1; // 尾端 connect 在 splice 後仍為最後一頂點
    if (isConnectVertexAt(seg, ep)) {
      patchConnectEndpointMetadataAfterGridMove(layer, seg, ep, nxr, nyr, oxr, oyr);
    }
    syncSegmentNodesGridFromPoints(seg);
  } else {
    syncSegmentNodesGridFromPoints(seg);
  }

  if (Array.isArray(seg.original_points) && seg.original_points.length !== pts.length) {
    seg.original_points = null;
  }

  return true;
}

/**
 * 黑點位移後：
 *  (1) 若折線上存在與 (oxr,oyr) 重合之 line 頂點，或「僅首／尾」之 connect 頂點；且非轉折點；且新格仍在同一段正交邊上
 *      → 更新該頂點至 (nxr,nyr)。不插入新頂點（紅點間路段拓撲固定）。
 *      同一段上兩錨點間之純 line 頂點一併平移同一步，以更新兩黑點間路段。首／尾 connect 另同步 original_points、properties、ConnectData／SectionData 端點格。
 *      若新格與折線上既有頂點（多為轉折點）重合：刪除兩頂點間之中間頂點，黑點併入該格。
 *      若新格已離開原共線邊：依原 A→S、S→B 軸向插入轉折，使折線仍經過新格且不任意改變原線形骨架。
 *  (2) 同步 SectionData station_list 中該黑點格點（connect_start／end 與路段筆數不變）。
 */
function syncLineStationVertexAndSectionListForGridMove(layer, row, ox, oy, nx, ny) {
  const st = row?.meta;
  const oxr = Math.round(ox);
  const oyr = Math.round(oy);
  const nxr = Math.round(nx);
  const nyr = Math.round(ny);
  if (oxr === nxr && oyr === nyr) return;
  const sidRaw = st?.station_id ?? st?.tags?.station_id;
  const sid = sidRaw != null && String(sidRaw).trim() !== '' ? String(sidRaw).trim() : null;
  const nameRaw = String(st?.station_name ?? st?.tags?.station_name ?? '')
    .trim()
    .replace(/^—$/, '')
    .replace(/^－$/, '');

  forEachSegmentInLayer(layer.spaceNetworkGridJsonData, (seg) => {
    const pts = seg.points;
    const nodes = seg.nodes;
    if (!Array.isArray(pts) || pts.length < 2) return;
    if (tryMergeStationOntoCoincidentVertex(seg, layer, oxr, oyr, nxr, nyr)) {
      return;
    }
    let movedInSeg = false;
    for (let i = 0; i < pts.length; i++) {
      const [cx, cy] = roundXY(pts[i]);
      if (cx !== oxr || cy !== oyr) continue;

      const isConn = isConnectVertexAt(seg, i);
      const isEndpointConnect = isConn && (i === 0 || i === pts.length - 1);
      if (isConn && !isEndpointConnect) continue;
      if (!isConn && isOrthogonalCornerVertex(pts, i) && !isBlackStationNodeAt(nodes, i)) continue;
      const atPolylineEndpoint = i === 0 || i === pts.length - 1;
      let useMiddleMicroWalk = false;
      let canSlideOk = false;
      if (atPolylineEndpoint) {
        canSlideOk = canSlideOrthSameEdgeMulti(pts, i, oxr, oyr, nxr, nyr);
      } else if (canSlideOrthInlineVertex(pts, i, oxr, oyr, nxr, nyr)) {
        canSlideOk = true;
      } else if (canSlideOrthSameEdgeMulti(pts, i, oxr, oyr, nxr, nyr)) {
        if (canSimulateMiddleOrthoWalk(pts, i, oxr, oyr, nxr, nyr)) {
          canSlideOk = true;
          useMiddleMicroWalk = true;
        }
      }
      if (!canSlideOk) continue;

      if (useMiddleMicroWalk) {
        const ptSnap = snapshotSegmentPointsGrid(pts);
        let cx = oxr;
        let cy = oyr;
        while (cx !== nxr || cy !== nyr) {
          const next = orthoUnitStepToward(cx, cy, nxr, nyr);
          if (!next) break;
          if (!moveKeepsOrthogonalityWithNeighbors(pts, i, next[0], next[1])) break;
          setPointXY(pts[i], next[0], next[1]);
          syncDrawCoordsForVertex(seg, i, next[0], next[1]);
          syncNodeGridAt(seg, i, next[0], next[1]);
          shiftCollinearPureLineVerticesWithBlackStationStep(
            seg,
            i,
            next[0],
            next[1],
            next[0] - cx,
            next[1] - cy
          );
          cx = next[0];
          cy = next[1];
        }
        if (cx !== nxr || cy !== nyr) {
          restoreSegmentPointsGrid(seg, pts, ptSnap);
          continue;
        }
      } else {
        if (!moveKeepsOrthogonalityWithNeighbors(pts, i, nxr, nyr)) continue;
        setPointXY(pts[i], nxr, nyr);
        syncDrawCoordsForVertex(seg, i, nxr, nyr);
        syncNodeGridAt(seg, i, nxr, nyr);
        if (isEndpointConnect) {
          patchConnectEndpointMetadataAfterGridMove(layer, seg, i, nxr, nyr, oxr, oyr);
        }
        shiftCollinearPureLineVerticesWithBlackStationStep(seg, i, nxr, nyr, nxr - oxr, nyr - oyr);
        if (isEndpointConnect) {
          syncSegmentNodesGridFromPoints(seg);
        }
      }
      movedInSeg = true;
      break;
    }
    if (movedInSeg) return;

    if (sid) {
      for (let i = 0; i < pts.length; i++) {
        const node = Array.isArray(nodes) ? nodes[i] : null;
        const isConn = isConnectVertexAt(seg, i);
        const isEndpointConnect = isConn && (i === 0 || i === pts.length - 1);
        if (isConn && !isEndpointConnect) continue;
        const nid = String(node?.station_id ?? node?.tags?.station_id ?? '').trim();
        if (!nid || nid !== sid) continue;
        if (!isConn && isOrthogonalCornerVertex(pts, i) && !isBlackStationNodeAt(nodes, i))
          continue;
        const [vx, vy] = roundXY(pts[i]);
        const atPolylineEndpoint2 = i === 0 || i === pts.length - 1;
        let useMiddleMicroWalk2 = false;
        let canSlideOk2 = false;
        if (atPolylineEndpoint2) {
          canSlideOk2 = canSlideOrthSameEdgeMulti(pts, i, vx, vy, nxr, nyr);
        } else if (canSlideOrthInlineVertex(pts, i, vx, vy, nxr, nyr)) {
          canSlideOk2 = true;
        } else if (canSlideOrthSameEdgeMulti(pts, i, vx, vy, nxr, nyr)) {
          if (canSimulateMiddleOrthoWalk(pts, i, vx, vy, nxr, nyr)) {
            canSlideOk2 = true;
            useMiddleMicroWalk2 = true;
          }
        }
        if (!canSlideOk2) continue;

        if (useMiddleMicroWalk2) {
          const ptSnap2 = snapshotSegmentPointsGrid(pts);
          let cx = vx;
          let cy = vy;
          while (cx !== nxr || cy !== nyr) {
            const next = orthoUnitStepToward(cx, cy, nxr, nyr);
            if (!next) break;
            if (!moveKeepsOrthogonalityWithNeighbors(pts, i, next[0], next[1])) break;
            setPointXY(pts[i], next[0], next[1]);
            syncDrawCoordsForVertex(seg, i, next[0], next[1]);
            syncNodeGridAt(seg, i, next[0], next[1]);
            shiftCollinearPureLineVerticesWithBlackStationStep(
              seg,
              i,
              next[0],
              next[1],
              next[0] - cx,
              next[1] - cy
            );
            cx = next[0];
            cy = next[1];
          }
          if (cx !== nxr || cy !== nyr) {
            restoreSegmentPointsGrid(seg, pts, ptSnap2);
            continue;
          }
        } else {
          if (!moveKeepsOrthogonalityWithNeighbors(pts, i, nxr, nyr)) continue;
          setPointXY(pts[i], nxr, nyr);
          syncDrawCoordsForVertex(seg, i, nxr, nyr);
          syncNodeGridAt(seg, i, nxr, nyr);
          if (isEndpointConnect) {
            patchConnectEndpointMetadataAfterGridMove(layer, seg, i, nxr, nyr, vx, vy);
          }
          shiftCollinearPureLineVerticesWithBlackStationStep(seg, i, nxr, nyr, nxr - vx, nyr - vy);
          if (isEndpointConnect) {
            syncSegmentNodesGridFromPoints(seg);
          }
        }
        movedInSeg = true;
        break;
      }
      if (movedInSeg) return;
    }
    if (
      !movedInSeg &&
      tryReconnectStationInsertCorners(seg, layer, oxr, oyr, nxr, nyr, sid, nameRaw)
    ) {
      return;
    }
  });

  // 同步 SectionData station_list
  const sec = layer.spaceNetworkGridJsonData_SectionData;
  if (!Array.isArray(sec)) return;
  for (const rowSd of sec) {
    if (!rowSd) continue;
    for (const p of rowSd.station_list || []) {
      if (!p || typeof p !== 'object') continue;
      const xg = Math.round(Number(p.x_grid ?? p.tags?.x_grid));
      const yg = Math.round(Number(p.y_grid ?? p.tags?.y_grid));
      const pid = String(p.station_id ?? p.tags?.station_id ?? '').trim();
      const pn = String(p.station_name ?? p.tags?.station_name ?? '').trim();
      let matched = false;
      if (sid) {
        matched = pid === sid || (xg === oxr && yg === oyr);
      } else if (nameRaw) {
        matched = pn === nameRaw && xg === oxr && yg === oyr;
      } else {
        matched = xg === oxr && yg === oyr;
      }
      if (!matched) continue;
      p.x_grid = nxr;
      p.y_grid = nyr;
      if (!p.tags || typeof p.tags !== 'object') p.tags = {};
      p.tags.x_grid = nxr;
      p.tags.y_grid = nyr;
    }
  }
}

function gridXYFromStationRow(row) {
  const s = row?.meta;
  if (!s || typeof s !== 'object') {
    return [Math.round(Number(row?.x)), Math.round(Number(row?.y))];
  }
  return [
    Math.round(toNum(s.x_grid ?? s.tags?.x_grid ?? row.x)),
    Math.round(toNum(s.y_grid ?? s.tags?.y_grid ?? row.y)),
  ];
}

function clampBlackStationsOntoRouteGrid(layer, adj) {
  const rows = collectLineStationGridPointsFromStationData(
    layer.spaceNetworkGridJsonData_StationData
  );
  for (const row of rows) {
    const st = row.meta;
    if (!st || typeof st !== 'object') continue;
    const bx = toNum(st.x_grid ?? st.tags?.x_grid ?? row.x);
    const by = toNum(st.y_grid ?? st.tags?.y_grid ?? row.y);
    if (adj.has(cellKey(bx, by))) continue;
    const snap = nearestGraphCell(bx, by, adj);
    if (!snap) continue;
    const [cx, cy] = snap;
    st.x_grid = cx;
    st.y_grid = cy;
    if (!st.tags || typeof st.tags !== 'object') st.tags = {};
    st.tags.x_grid = cx;
    st.tags.y_grid = cy;
  }
}

/**
 * @param {{ listedSectionOnly?: boolean }} [options]
 *   預設 `listedSectionOnly: false`：每輪只對「非」清單路段黑點向 hub／示意圖幾何中心滑動，且每一步映射後須落在 `getSchematicPlotBoundsFromLayer` 之框內（不可越藍虛線邊界）；佔用集合仍含全部黑點。
 *   若 `listedSectionOnly: true`，每輪只對清單路段黑點滑向紅端點（或無資訊時退回 hub），不套用上述藍框限制；重複輪直到該子集無人可動（或達上限／重複版面）。
 * @returns {{
 *   loops: number,
 *   movesInLastLoop: number,
 *   totalMoves: number,
 *   stopReason: 'converged' | 'max_iterations' | 'repeated_layout' | 'no_graph' | 'no_bounds' | 'no_listed_stations' | 'no_non_listed_stations'
 * }}
 */
export function runLineStationsTowardSchematicCenter(layer, options = {}) {
  const listedSectionOnly = Boolean(options?.listedSectionOnly);

  let flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
  let adj = buildLineAdjacency(flat);
  if (adj.size === 0) {
    return {
      loops: 0,
      movesInLastLoop: 0,
      totalMoves: 0,
      stopReason: 'no_graph',
    };
  }

  const bounds = getCenteringBounds(layer);
  if (!bounds) {
    return {
      loops: 0,
      movesInLastLoop: 0,
      totalMoves: 0,
      stopReason: 'no_bounds',
    };
  }

  const hubMap = buildHubTargetGridMapByStationKey(layer);
  const listedSectionStationSet = buildListedSectionStationKeySet(
    layer.spaceNetworkGridJsonData_SectionData,
    layer
  );

  if (listedSectionOnly) {
    const rowsProbe = collectLineStationGridPointsFromStationData(
      layer.spaceNetworkGridJsonData_StationData
    );
    const hasListed = rowsProbe.some((r) =>
      isListedSectionRow(r, Number(r.x), Number(r.y), listedSectionStationSet)
    );
    if (!hasListed) {
      return {
        loops: 0,
        movesInLastLoop: 0,
        totalMoves: 0,
        stopReason: 'no_listed_stations',
      };
    }
  }

  if (!listedSectionOnly) {
    const rowsProbe = collectLineStationGridPointsFromStationData(
      layer.spaceNetworkGridJsonData_StationData
    );
    const hasNonListed = rowsProbe.some(
      (r) => !isListedSectionRow(r, Number(r.x), Number(r.y), listedSectionStationSet)
    );
    if (!hasNonListed) {
      return {
        loops: 0,
        movesInLastLoop: 0,
        totalMoves: 0,
        stopReason: 'no_non_listed_stations',
      };
    }
  }

  let loops = 0;
  let totalMoves = 0;
  let movesInLastLoop = 0;
  /** 外層輪數上限（避免路線同步後久不穩定時長時間卡住） */
  const maxLoops = 2000;
  let stopReason = 'converged';
  const layoutSignaturesSeen = new Set();

  clampBlackStationsOntoRouteGrid(layer, adj);
  layoutSignaturesSeen.add(blackStationsLayoutSignature(layer));

  while (loops < maxLoops) {
    flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
    adj = buildLineAdjacency(flat);
    if (adj.size === 0) break;

    movesInLastLoop = 0;

    const rowsAll = collectLineStationGridPointsFromStationData(
      layer.spaceNetworkGridJsonData_StationData
    );
    rowsAll.sort(
      (a, b) =>
        Number(a.y) - Number(b.y) ||
        Number(a.x) - Number(b.x) ||
        stationDedupeKeyFromRow(a).localeCompare(stationDedupeKeyFromRow(b), 'zh-Hant')
    );
    const rowsIterate = listedSectionOnly
      ? rowsAll.filter((r) =>
          isListedSectionRow(r, Number(r.x), Number(r.y), listedSectionStationSet)
        )
      : rowsAll.filter(
          (r) => !isListedSectionRow(r, Number(r.x), Number(r.y), listedSectionStationSet)
        );

    const blackOccupied = new Set();
    for (const r of rowsAll) {
      const [gx, gy] = gridXYFromStationRow(r);
      blackOccupied.add(cellKey(gx, gy));
    }

    for (const row of rowsIterate) {
      const st = row.meta;
      if (!st || typeof st !== 'object') continue;

      const rawX = toNum(st.x_grid ?? st.tags?.x_grid ?? row.x);
      const rawY = toNum(st.y_grid ?? st.tags?.y_grid ?? row.y);
      const aligned = alignStationToGraph(rawX, rawY, adj);
      if (!aligned) continue;
      const [cx, cy] = aligned;

      const rowKey = stationLineRowDedupeKey(row);
      let curX = cx;
      let curY = cy;
      let chain = 0;
      while (chain++ < SLIDE_CHAIN_MAX_STEPS) {
        flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
        adj = buildLineAdjacency(flat);
        if (adj.size === 0) break;

        const boundsLive = listedSectionOnly
          ? getCenteringBounds(layer)
          : getSchematicCenteringBoundsForSlide(layer) || getCenteringBounds(layer);
        if (!boundsLive) break;

        const schematicLive = !listedSectionOnly ? getSchematicPlotBoundsFromLayer(layer) : null;
        const redSetLive = redCellSetFromLayer(layer);

        const snapCur = alignStationToGraph(curX, curY, adj);
        if (!snapCur) break;
        curX = snapCur[0];
        curY = snapCur[1];

        let tcx;
        let tcy;
        let delta;
        let listedTgXY = null;
        if (listedSectionOnly) {
          const listedMapLive = buildListedSectionEndpointInfoByStationKey(layer);
          const listedInfo = getListedInfoForRow(row, curX, curY, listedMapLive);
          if (listedInfo) {
            listedTgXY = pickListedSectionTargetRedGrid(curX, curY, listedInfo);
            const [tgX, tgY] = listedTgXY;
            [tcx, tcy] = mapNetworkToSchematicPlotXY(layer, tgX, tgY);
            delta = chooseSlideDeltaListedSectionTowardRed(curX, curY, adj, listedInfo, redSetLive);
          } else {
            const targetGrid = hubMap.get(rowKey) || null;
            [tcx, tcy] = resolveSlideTargetPlot(layer, boundsLive, targetGrid);
            delta = chooseSlideDelta(layer, boundsLive, curX, curY, adj, targetGrid);
          }
        } else {
          [tcx, tcy] = resolveSlideTargetPlot(layer, boundsLive, null);
          delta = chooseSlideDelta(layer, boundsLive, curX, curY, adj, null);
        }
        if (!delta) break;

        blackOccupied.delete(cellKey(curX, curY));
        const occExcl = new Set(blackOccupied);

        let [nx, ny] = listedTgXY
          ? slideMaxListedTowardTargetGrid(
              listedTgXY[0],
              listedTgXY[1],
              curX,
              curY,
              delta.dx,
              delta.dy,
              adj,
              redSetLive,
              occExcl
            )
          : slideMax(
              layer,
              tcx,
              tcy,
              curX,
              curY,
              delta.dx,
              delta.dy,
              adj,
              redSetLive,
              occExcl,
              schematicLive
            );
        if (!adj.has(cellKey(nx, ny))) {
          const fix = alignStationToGraph(nx, ny, adj);
          if (fix) [nx, ny] = fix;
        }
        if (cellKey(nx, ny) === cellKey(curX, curY)) {
          blackOccupied.add(cellKey(curX, curY));
          break;
        }

        st.x_grid = nx;
        st.y_grid = ny;
        if (!st.tags || typeof st.tags !== 'object') st.tags = {};
        st.tags.x_grid = nx;
        st.tags.y_grid = ny;
        syncLineStationVertexAndSectionListForGridMove(layer, row, curX, curY, nx, ny);
        row.x = nx;
        row.y = ny;
        movesInLastLoop += 1;
        totalMoves += 1;
        blackOccupied.add(cellKey(nx, ny));
        curX = nx;
        curY = ny;
      }
    }

    loops += 1;
    if (movesInLastLoop === 0) break;

    const sigAfter = blackStationsLayoutSignature(layer);
    if (layoutSignaturesSeen.has(sigAfter)) {
      stopReason = 'repeated_layout';
      break;
    }
    layoutSignaturesSeen.add(sigAfter);
  }

  if (stopReason === 'converged' && loops >= maxLoops && movesInLastLoop > 0) {
    stopReason = 'max_iterations';
    console.warn(
      '[向心滑動＋路線同步] 已達輪數上限（' +
        maxLoops +
        '），已停止（若未收斂可檢查路網或改用手動調整）'
    );
  }

  if (stopReason === 'repeated_layout') {
    console.warn('[向心滑動＋路線同步] 偵測到站點配置重複（可能振盪），已停止');
  }

  flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
  adj = buildLineAdjacency(flat);
  if (adj.size > 0) clampBlackStationsOntoRouteGrid(layer, adj);

  return { loops, movesInLastLoop, totalMoves, stopReason };
}

/** 同 {@link runLineStationsTowardSchematicCenter}，但只處理清單路段黑點，至該子集無人可動為止。 */
export function runListedSectionStationsTowardSchematicCenter(layer) {
  return runLineStationsTowardSchematicCenter(layer, { listedSectionOnly: true });
}

/**
 * 僅檢查路網／邊界與黑點筆數，不位移（供自動向心每輪前使用）。
 */
/** 與 step 相同排序之黑點列（供 Control 高亮預覽） */
export function getSortedLineStationRowsForCentering(layer) {
  const rows = collectLineStationGridPointsFromStationData(
    layer.spaceNetworkGridJsonData_StationData
  );
  rows.sort(
    (a, b) =>
      Number(a.y) - Number(b.y) ||
      Number(a.x) - Number(b.x) ||
      stationDedupeKeyFromRow(a).localeCompare(stationDedupeKeyFromRow(b), 'zh-Hant')
  );
  return rows;
}

/**
 * 「站點向示意圖中心（藍虛線）」專用：排除列入 SectionData 紅點間路段清單之黑點（該類請用清單路段按鈕）。
 */
export function getSortedNonListedLineStationRowsForSchematicCenter(layer) {
  const listedSectionStationSet = buildListedSectionStationKeySet(
    layer.spaceNetworkGridJsonData_SectionData,
    layer
  );
  return getSortedLineStationRowsForCentering(layer).filter(
    (r) => !isListedSectionRow(r, Number(r.x), Number(r.y), listedSectionStationSet)
  );
}

export function getLineStationGridXYFromRow(row) {
  const [x, y] = gridXYFromStationRow(row);
  return { x, y };
}

export function probeLineStationCentering(layer) {
  const flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
  const adj = buildLineAdjacency(flat);
  if (adj.size === 0) {
    return { ok: false, reason: 'no_graph', rowCount: 0 };
  }
  const bounds = getCenteringBounds(layer);
  if (!bounds) {
    return { ok: false, reason: 'no_bounds', rowCount: 0 };
  }
  const rows = getSortedNonListedLineStationRowsForSchematicCenter(layer);
  return { ok: true, reason: null, rowCount: rows.length };
}

/**
 * 單次只處理「排序後第 index 筆」黑點站（與向心一鍵同一排序，僅非清單路段）；同步該站之 line 頂點與 SectionData station_list。
 * @param {object} layer
 * @param {number} indexInSortedRows 本輪要處理的站點索引（會對 rowCount 取模）
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   moved: boolean,
 *   canMove: boolean,
 *   isListedSectionStation: boolean,
 *   rowCount: number,
 *   nextIndex: number,
 *   targetIndex: number,
 *   highlightX: number,
 *   highlightY: number,
 *   stationName: string,
 *   stationId: string | number | null,
 *   sectionRouteLabel: string,
 * }}
 */
export function stepOneLineStationTowardSchematicCenter(layer, indexInSortedRows) {
  const empty = {
    ok: false,
    reason: 'no_graph',
    moved: false,
    canMove: false,
    isListedSectionStation: false,
    rowCount: 0,
    nextIndex: 0,
    targetIndex: 0,
    highlightX: 0,
    highlightY: 0,
    stationName: '',
    stationId: null,
    sectionRouteLabel: '',
  };

  let flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
  let adj = buildLineAdjacency(flat);
  if (adj.size === 0) {
    return { ...empty, reason: 'no_graph' };
  }

  if (!getSchematicCenteringBoundsForSlide(layer) && !getCenteringBounds(layer)) {
    return { ...empty, ok: false, reason: 'no_bounds' };
  }

  const listedSectionStationSet = buildListedSectionStationKeySet(
    layer.spaceNetworkGridJsonData_SectionData,
    layer
  );

  const allRows = getSortedLineStationRowsForCentering(layer);
  const rows = allRows.filter(
    (r) => !isListedSectionRow(r, Number(r.x), Number(r.y), listedSectionStationSet)
  );

  const n = rows.length;
  if (n === 0) {
    return {
      ok: true,
      moved: false,
      canMove: false,
      isListedSectionStation: false,
      rowCount: 0,
      nextIndex: 0,
      targetIndex: 0,
      highlightX: 0,
      highlightY: 0,
      stationName: '',
      stationId: null,
      sectionRouteLabel: '',
    };
  }

  const idx = ((Math.floor(Number(indexInSortedRows)) % n) + n) % n;
  const row = rows[idx];
  const st = row.meta;
  const stationName = String(row.name ?? '');
  const stationId = st?.station_id ?? st?.tags?.station_id ?? null;

  const bump = () => ({
    ok: true,
    moved: false,
    canMove: false,
    isListedSectionStation: false,
    rowCount: n,
    nextIndex: (idx + 1) % n,
    targetIndex: idx,
    highlightX: Number(row.x),
    highlightY: Number(row.y),
    stationName,
    stationId,
    sectionRouteLabel: '',
  });

  if (!st || typeof st !== 'object') {
    return bump();
  }

  const rawX = toNum(st.x_grid ?? st.tags?.x_grid ?? row.x);
  const rawY = toNum(st.y_grid ?? st.tags?.y_grid ?? row.y);
  const aligned = alignStationToGraph(rawX, rawY, adj);
  if (!aligned) {
    return bump();
  }
  const [cx, cy] = aligned;

  const blackOccupied = new Set();
  for (const r of allRows) {
    const [gx, gy] = gridXYFromStationRow(r);
    blackOccupied.add(cellKey(gx, gy));
  }

  let curX = cx;
  let curY = cy;
  let movedAny = false;
  let guard = 0;

  while (guard++ < SLIDE_CHAIN_MAX_STEPS) {
    flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
    adj = buildLineAdjacency(flat);
    if (adj.size === 0) break;

    const boundsLive = getSchematicCenteringBoundsForSlide(layer) || getCenteringBounds(layer);
    if (!boundsLive) break;

    const schematicLive = getSchematicPlotBoundsFromLayer(layer);
    const redLive = redCellSetFromLayer(layer);

    const snapCur = alignStationToGraph(curX, curY, adj);
    if (!snapCur) break;
    curX = snapCur[0];
    curY = snapCur[1];

    const [tcx2, tcy2] = resolveSlideTargetPlot(layer, boundsLive, null);
    const delta2 = chooseSlideDelta(layer, boundsLive, curX, curY, adj, null);
    if (!delta2) break;

    blackOccupied.clear();
    for (const r of allRows) {
      const [gx, gy] = gridXYFromStationRow(r);
      blackOccupied.add(cellKey(gx, gy));
    }
    blackOccupied.delete(cellKey(curX, curY));
    const occExcl = new Set(blackOccupied);

    let [nx, ny] = slideMax(
      layer,
      tcx2,
      tcy2,
      curX,
      curY,
      delta2.dx,
      delta2.dy,
      adj,
      redLive,
      occExcl,
      schematicLive
    );
    if (!adj.has(cellKey(nx, ny))) {
      const fix = alignStationToGraph(nx, ny, adj);
      if (fix) [nx, ny] = fix;
    }
    if (cellKey(nx, ny) === cellKey(curX, curY)) break;

    syncLineStationVertexAndSectionListForGridMove(layer, row, curX, curY, nx, ny);
    st.x_grid = nx;
    st.y_grid = ny;
    if (!st.tags || typeof st.tags !== 'object') st.tags = {};
    st.tags.x_grid = nx;
    st.tags.y_grid = ny;
    row.x = nx;
    row.y = ny;
    movedAny = true;
    curX = nx;
    curY = ny;
  }

  if (!movedAny) {
    flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
    adj = buildLineAdjacency(flat);
    const boundsProbe = getSchematicCenteringBoundsForSlide(layer) || getCenteringBounds(layer);
    const snapProbe = adj.size && boundsProbe ? alignStationToGraph(cx, cy, adj) : null;
    const delta0 =
      snapProbe && boundsProbe
        ? chooseSlideDelta(layer, boundsProbe, snapProbe[0], snapProbe[1], adj, null)
        : null;
    if (!delta0) {
      return {
        ok: true,
        moved: false,
        canMove: false,
        isListedSectionStation: false,
        rowCount: n,
        nextIndex: (idx + 1) % n,
        targetIndex: idx,
        highlightX: cx,
        highlightY: cy,
        stationName,
        stationId,
        sectionRouteLabel: '',
      };
    }
    return {
      ok: true,
      moved: false,
      canMove: true,
      isListedSectionStation: false,
      rowCount: n,
      nextIndex: (idx + 1) % n,
      targetIndex: idx,
      highlightX: cx,
      highlightY: cy,
      stationName,
      stationId,
      sectionRouteLabel: '',
    };
  }

  return {
    ok: true,
    moved: true,
    canMove: true,
    isListedSectionStation: false,
    rowCount: n,
    nextIndex: (idx + 1) % n,
    targetIndex: idx,
    highlightX: curX,
    highlightY: curY,
    stationName,
    stationId,
    sectionRouteLabel: '',
  };
}

/**
 * 與 stepOneLineStationTowardSchematicCenter 邏輯相同，
 * 但只在「列入清單的 SectionData 路段」黑點中依序處理（indexInSorted 對篩選後列表取模）。
 */
export function stepOneSectionStationTowardSchematicCenter(layer, indexInSortedRows) {
  const empty = {
    ok: false,
    reason: 'no_graph',
    moved: false,
    canMove: false,
    isListedSectionStation: true,
    rowCount: 0,
    nextIndex: 0,
    targetIndex: 0,
    highlightX: 0,
    highlightY: 0,
    stationName: '',
    stationId: null,
    sectionRouteLabel: '',
  };

  let flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
  let adj = buildLineAdjacency(flat);
  if (adj.size === 0) return { ...empty, reason: 'no_graph' };

  if (!getCenteringBounds(layer)) return { ...empty, reason: 'no_bounds' };

  const listedSectionStationSet = buildListedSectionStationKeySet(
    layer.spaceNetworkGridJsonData_SectionData,
    layer
  );
  const listedEndpointMap = buildListedSectionEndpointInfoByStationKey(layer);

  const allRows = collectLineStationGridPointsFromStationData(
    layer.spaceNetworkGridJsonData_StationData
  );
  allRows.sort(
    (a, b) =>
      Number(a.y) - Number(b.y) ||
      Number(a.x) - Number(b.x) ||
      stationDedupeKeyFromRow(a).localeCompare(stationDedupeKeyFromRow(b), 'zh-Hant')
  );

  // 只保留列入清單的黑點
  const rows = allRows.filter((r) =>
    isListedSectionRow(r, Number(r.x), Number(r.y), listedSectionStationSet)
  );

  const n = rows.length;
  if (n === 0)
    return {
      ok: true,
      moved: false,
      canMove: false,
      isListedSectionStation: true,
      rowCount: 0,
      nextIndex: 0,
      targetIndex: 0,
      highlightX: 0,
      highlightY: 0,
      stationName: '',
      stationId: null,
      sectionRouteLabel: '',
    };

  const idx = ((Math.floor(Number(indexInSortedRows)) % n) + n) % n;
  const row = rows[idx];
  const st = row.meta;
  const stationName = String(row.name ?? '');
  const stationId = st?.station_id ?? st?.tags?.station_id ?? null;
  const listedInfoAtRaw = getListedInfoForRow(row, Number(row.x), Number(row.y), listedEndpointMap);
  const sectionRouteLabel = listedInfoAtRaw?.routeLabel || '';

  const bump = () => ({
    ok: true,
    moved: false,
    canMove: false,
    isListedSectionStation: true,
    rowCount: n,
    nextIndex: (idx + 1) % n,
    targetIndex: idx,
    highlightX: Number(row.x),
    highlightY: Number(row.y),
    stationName,
    stationId,
    sectionRouteLabel,
  });

  if (!st || typeof st !== 'object') return bump();

  const rawX = toNum(st.x_grid ?? st.tags?.x_grid ?? row.x);
  const rawY = toNum(st.y_grid ?? st.tags?.y_grid ?? row.y);
  const aligned = alignStationToGraph(rawX, rawY, adj);
  if (!aligned) return bump();
  const [cx, cy] = aligned;

  const blackOccupied = new Set();
  for (const r of allRows) {
    const [gx, gy] = gridXYFromStationRow(r);
    blackOccupied.add(cellKey(gx, gy));
  }

  const hubMap = buildHubTargetGridMapByStationKey(layer);
  const rowKey = stationLineRowDedupeKey(row);
  let curX = cx;
  let curY = cy;
  let movedAny = false;
  let guard = 0;
  let outSectionLabel = sectionRouteLabel;

  while (guard++ < SLIDE_CHAIN_MAX_STEPS) {
    flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
    adj = buildLineAdjacency(flat);
    if (adj.size === 0) break;

    const boundsLive = getCenteringBounds(layer);
    if (!boundsLive) break;

    const redLive = redCellSetFromLayer(layer);
    const listedMapLive = buildListedSectionEndpointInfoByStationKey(layer);

    const snapCur = alignStationToGraph(curX, curY, adj);
    if (!snapCur) break;
    curX = snapCur[0];
    curY = snapCur[1];

    const listedInfoHere = getListedInfoForRow(row, curX, curY, listedMapLive);
    let tcx2;
    let tcy2;
    let delta2;
    let listedTgXY2 = null;
    if (listedInfoHere) {
      listedTgXY2 = pickListedSectionTargetRedGrid(curX, curY, listedInfoHere);
      const [tgX, tgY] = listedTgXY2;
      [tcx2, tcy2] = mapNetworkToSchematicPlotXY(layer, tgX, tgY);
      delta2 = chooseSlideDeltaListedSectionTowardRed(curX, curY, adj, listedInfoHere, redLive);
    } else {
      const targetGrid = hubMap.get(rowKey) || null;
      [tcx2, tcy2] = resolveSlideTargetPlot(layer, boundsLive, targetGrid);
      delta2 = chooseSlideDelta(layer, boundsLive, curX, curY, adj, targetGrid);
    }
    if (!delta2) break;

    blackOccupied.clear();
    for (const r of allRows) {
      const [gx, gy] = gridXYFromStationRow(r);
      blackOccupied.add(cellKey(gx, gy));
    }
    blackOccupied.delete(cellKey(curX, curY));
    const occExcl = new Set(blackOccupied);

    let [nx, ny] = listedTgXY2
      ? slideMaxListedTowardTargetGrid(
          listedTgXY2[0],
          listedTgXY2[1],
          curX,
          curY,
          delta2.dx,
          delta2.dy,
          adj,
          redLive,
          occExcl
        )
      : slideMax(layer, tcx2, tcy2, curX, curY, delta2.dx, delta2.dy, adj, redLive, occExcl, null);
    if (!adj.has(cellKey(nx, ny))) {
      const fix = alignStationToGraph(nx, ny, adj);
      if (fix) [nx, ny] = fix;
    }
    if (cellKey(nx, ny) === cellKey(curX, curY)) break;

    syncLineStationVertexAndSectionListForGridMove(layer, row, curX, curY, nx, ny);
    st.x_grid = nx;
    st.y_grid = ny;
    if (!st.tags || typeof st.tags !== 'object') st.tags = {};
    st.tags.x_grid = nx;
    st.tags.y_grid = ny;
    row.x = nx;
    row.y = ny;
    movedAny = true;
    outSectionLabel = listedInfoHere?.routeLabel || sectionRouteLabel;
    curX = nx;
    curY = ny;
  }

  if (!movedAny) {
    flat = normalizeSpaceNetworkDataToFlatSegments(layer.spaceNetworkGridJsonData || []);
    adj = buildLineAdjacency(flat);
    const boundsProbe = getCenteringBounds(layer);
    const mapProbe = buildListedSectionEndpointInfoByStationKey(layer);
    const redProbe = redCellSetFromLayer(layer);
    const snap0 = adj.size && boundsProbe ? alignStationToGraph(cx, cy, adj) : null;
    let delta0 = null;
    let listedInfo0 = null;
    if (snap0 && boundsProbe) {
      listedInfo0 = getListedInfoForRow(row, snap0[0], snap0[1], mapProbe);
      if (listedInfo0) {
        delta0 = chooseSlideDeltaListedSectionTowardRed(
          snap0[0],
          snap0[1],
          adj,
          listedInfo0,
          redProbe
        );
      } else {
        const targetGrid = hubMap.get(rowKey) || null;
        delta0 = chooseSlideDelta(layer, boundsProbe, snap0[0], snap0[1], adj, targetGrid);
      }
    }
    if (!delta0) {
      return {
        ok: true,
        moved: false,
        canMove: false,
        isListedSectionStation: true,
        rowCount: n,
        nextIndex: (idx + 1) % n,
        targetIndex: idx,
        highlightX: cx,
        highlightY: cy,
        stationName,
        stationId,
        sectionRouteLabel: listedInfo0?.routeLabel || sectionRouteLabel,
      };
    }
    return {
      ok: true,
      moved: false,
      canMove: true,
      isListedSectionStation: true,
      rowCount: n,
      nextIndex: (idx + 1) % n,
      targetIndex: idx,
      highlightX: cx,
      highlightY: cy,
      stationName,
      stationId,
      sectionRouteLabel: listedInfo0?.routeLabel || sectionRouteLabel,
    };
  }

  return {
    ok: true,
    moved: true,
    canMove: true,
    isListedSectionStation: true,
    rowCount: n,
    nextIndex: (idx + 1) % n,
    targetIndex: idx,
    highlightX: curX,
    highlightY: curY,
    stationName,
    stationId,
    sectionRouteLabel: outSectionLabel,
  };
}
