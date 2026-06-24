/**
 * 網格正規化／車站配置：與 SpaceNetworkGridTab 相同邏輯收集紅點＋黑點座標，
 * 計算任兩站之間「最小正水平距離 |Δx|」與「最小正垂直距離 |Δy|」（網格寬／高）。
 */

/**
 * 將 spaceNetworkGridJsonData 統一為扁平 segments（支援 2-5 式或已是 flat list）。
 * @param {Array} spaceData
 * @returns {Array}
 */
export function normalizeSpaceNetworkDataToFlatSegments(spaceData) {
  if (!Array.isArray(spaceData) || spaceData.length === 0) return [];
  const first = spaceData[0];
  if (first?.segments && Array.isArray(first.segments) && first.points === undefined) {
    return spaceData.flatMap((r) =>
      (r.segments || []).map((s) => ({
        ...s,
        route_name: s.route_name ?? r.route_name ?? r.name,
        name: s.name ?? r.route_name ?? r.name,
      }))
    );
  }
  return spaceData;
}

const EPS = 1e-5;

function toNum(v) {
  return Number(v ?? 0);
}

function getC(p) {
  return Array.isArray(p) ? [toNum(p[0]), toNum(p[1])] : [toNum(p?.x), toNum(p?.y)];
}

function pointKey(x, y) {
  return `${toNum(x)},${toNum(y)}`;
}

function normalizeRouteKey(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((r) => String(r ?? '').trim())
    .filter((r) => r !== '')
    .sort()
    .join('|');
}

function pairKey(a, b) {
  return [a, b].sort().join(' <-> ');
}

function normalizeStationText(v) {
  const s = (v ?? '').trim();
  return s === '—' || s === '－' ? '' : s;
}

function connectDisplayName(props) {
  if (!props) return '紅點';
  const sn = normalizeStationText(props.station_name ?? props.tags?.station_name ?? '');
  const cn = props.connect_number ?? props.tags?.connect_number;
  if (sn) return cn != null ? `${sn}（轉乘 #${cn}）` : sn;
  if (cn != null) return `轉乘點 #${cn}`;
  return '紅點';
}

function stationDisplayName(props) {
  if (!props) return '黑點';
  const sn = normalizeStationText(props.station_name ?? props.tags?.station_name ?? '');
  const sid = normalizeStationText(props.station_id ?? props.tags?.station_id ?? '');
  if (sn) return sn;
  if (sid) return sid;
  return '黑點';
}

const AXIS_EPS = 0.1;

/**
 * 假設沿路段僅能水平或垂直移向幾何中心時，顯示移動方向（與向量收縮邏輯一致）
 * @param {number} px
 * @param {number} py
 * @param {number} centerX
 * @param {number} centerY
 * @param {boolean} segIsH
 * @param {boolean} segIsV
 * @returns {string}
 */
export function towardCenterMoveLabel(px, py, centerX, centerY, segIsH, segIsV) {
  const tcx = Math.round(Number(centerX));
  const tcy = Math.round(Number(centerY));
  const x = Number(px);
  const y = Number(py);
  if (segIsH && !segIsV) {
    if (Math.abs(x - tcx) < AXIS_EPS) return '—（已在垂直中線）';
    return x < tcx ? '→ 往右' : '← 往左';
  }
  if (segIsV && !segIsH) {
    if (Math.abs(y - tcy) < AXIS_EPS) return '—（已在水平中線）';
    return y < tcy ? '↑ 往上' : '↓ 往下';
  }
  const dx = tcx - x;
  const dy = tcy - y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) < AXIS_EPS) return '—';
    return dx > 0 ? '→ 往右（斜段）' : '← 往左（斜段）';
  }
  if (Math.abs(dy) < AXIS_EPS) return '—';
  return dy > 0 ? '↑ 往上（斜段）' : '↓ 往下（斜段）';
}

/**
 * @param {object} layer - 含 spaceNetworkGridJsonData, *_ConnectData, *_SectionData, *_StationData
 * @returns {Array<{ x: number, y: number, kind: 'connect'|'station', name: string, meta: object, seg_is_h?: boolean, seg_is_v?: boolean }>}
 */
export function collectStationPlacementPoints(layer) {
  const rtData = layer?.spaceNetworkGridJsonData;
  const connectData = layer?.spaceNetworkGridJsonData_ConnectData;
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const stationData = layer?.spaceNetworkGridJsonData_StationData;
  if (!Array.isArray(rtData) || !Array.isArray(connectData) || !Array.isArray(sectionData)) {
    return [];
  }

  const flatSegs =
    rtData.length > 0 && rtData[0]?.segments && !rtData[0]?.points
      ? rtData.flatMap((r) =>
          (r.segments || []).map((s) => ({
            ...s,
            route_name: s.route_name ?? r.route_name ?? r.name,
            name: s.name ?? r.route_name ?? r.name,
          }))
        )
      : rtData;

  const stationLookup = new Map();
  if (Array.isArray(stationData)) {
    stationData.forEach((s) => {
      if (s?.station_id) stationLookup.set(s.station_id, s);
    });
  }

  const connectByNumber = new Map();
  const connectByCoord = new Map();
  connectData.forEach((c) => {
    if (!c) return;
    const cn = c.connect_number ?? c.tags?.connect_number;
    const cx = c.x_grid ?? c.tags?.x_grid;
    const cy = c.y_grid ?? c.tags?.y_grid;
    if (cn != null) connectByNumber.set(cn, c);
    if (cx != null && cy != null) connectByCoord.set(pointKey(cx, cy), c);
  });

  const resolveConnect = (props, fallbackPoint) => {
    const cn = props?.connect_number ?? props?.tags?.connect_number;
    if (cn != null && connectByNumber.has(cn)) return connectByNumber.get(cn);
    const x = props?.x_grid ?? props?.tags?.x_grid ?? fallbackPoint?.[0];
    const y = props?.y_grid ?? props?.tags?.y_grid ?? fallbackPoint?.[1];
    if (x != null && y != null) return connectByCoord.get(pointKey(x, y)) || null;
    return null;
  };

  const endpointMeta = (props, fallbackPoint) => {
    const c = resolveConnect(props, fallbackPoint);
    if (!c) return { connect: null, cn: '', routeKey: '' };
    return {
      connect: c,
      cn: String(c.connect_number ?? c.tags?.connect_number ?? ''),
      routeKey: normalizeRouteKey(c.route_list),
    };
  };

  const connectByRouteKey = new Map();
  connectData.forEach((cd) => {
    if (!cd) return;
    const rk = normalizeRouteKey(cd.route_list);
    if (!rk) return;
    if (!connectByRouteKey.has(rk)) connectByRouteKey.set(rk, []);
    connectByRouteKey.get(rk).push(cd);
  });

  const sectionBuckets = new Map();
  sectionData.forEach((sd) => {
    if (!sd) return;
    const sMeta = endpointMeta(sd.connect_start, null);
    const eMeta = endpointMeta(sd.connect_end, null);
    const strictKey =
      sMeta.routeKey && eMeta.routeKey
        ? `route:${pairKey(sMeta.routeKey, eMeta.routeKey)}`
        : sMeta.cn !== '' && eMeta.cn !== ''
          ? `cn:${pairKey(sMeta.cn, eMeta.cn)}`
          : null;
    if (strictKey) {
      if (!sectionBuckets.has(strictKey)) sectionBuckets.set(strictKey, []);
      sectionBuckets.get(strictKey).push(sd);
    }
  });

  const currentConnects = new Map();
  flatSegs.forEach((seg) => {
    const routeName = seg.route_name ?? seg.name ?? 'Unknown';
    const pts = seg.points?.map(getC) || [];
    if (pts.length < 2) return;
    for (const pt of [pts[0], pts[pts.length - 1]]) {
      const k = pointKey(pt[0], pt[1]);
      if (!currentConnects.has(k)) {
        currentConnects.set(k, { x: pt[0], y: pt[1], routeNames: new Set() });
      }
      currentConnects.get(k).routeNames.add(routeName);
    }
  });

  const out = [];

  const usedConnectData = new Set();
  currentConnects.forEach(({ x, y, routeNames }) => {
    const rk = normalizeRouteKey([...routeNames]);
    const storedList = (rk && connectByRouteKey.get(rk)) || [];
    let chosen = null;
    if (storedList.length === 1) {
      chosen = storedList[0];
    } else if (storedList.length > 1) {
      let bestDist = Infinity;
      for (const cd of storedList) {
        if (usedConnectData.has(cd)) continue;
        const sx = toNum(cd?.x_grid ?? cd?.tags?.x_grid ?? 0);
        const sy = toNum(cd?.y_grid ?? cd?.tags?.y_grid ?? 0);
        const d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < bestDist) {
          bestDist = d;
          chosen = cd;
        }
      }
    }
    if (chosen) usedConnectData.add(chosen);
    const props = chosen || {};
    out.push({
      x,
      y,
      kind: 'connect',
      name: connectDisplayName(props),
      meta: { ...props },
    });
  });

  /** 紅＋已放黑點佔位（6 位小數鍵），避免多黑點弧長落在同一數值格 */
  const placementOccKeys = new Set();
  const occKey = (x, y) => `${Number(x).toFixed(6)},${Number(y).toFixed(6)}`;
  for (const p of out) {
    placementOccKeys.add(occKey(p.x, p.y));
  }

  const usedSection = new Set();
  flatSegs.forEach((seg) => {
    if (!seg?.points || seg.points.length < 2) return;
    const pts = seg.points.map(getC);
    const startK = pointKey(pts[0][0], pts[0][1]);
    const endK = pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    const startRouteKey = normalizeRouteKey([...(currentConnects.get(startK)?.routeNames ?? [])]);
    const endRouteKey = normalizeRouteKey([...(currentConnects.get(endK)?.routeNames ?? [])]);
    const strictKey =
      startRouteKey && endRouteKey ? `route:${pairKey(startRouteKey, endRouteKey)}` : null;
    if (!strictKey) return;
    const candidates = sectionBuckets.get(strictKey) || [];
    const matched = candidates.find((sd) => {
      if (usedSection.has(sd)) return false;
      const sdStart = endpointMeta(sd.connect_start, null);
      const sdEnd = endpointMeta(sd.connect_end, null);
      const routePairSd = pairKey(sdStart.routeKey, sdEnd.routeKey);
      return routePairSd !== '' && routePairSd === pairKey(startRouteKey, endRouteKey);
    });
    if (!matched) return;
    usedSection.add(matched);

    const connectSids = new Set();
    if (matched.connect_start?.station_id) connectSids.add(matched.connect_start.station_id);
    if (matched.connect_end?.station_id) connectSids.add(matched.connect_end.station_id);
    const stList = (matched.station_list || []).filter(
      (s) => !s.station_id || !connectSids.has(s.station_id)
    );
    if (stList.length === 0) return;

    // 依 connect_start / connect_end 確保 poly 方向與 station_list 一致，避免黑點畫反
    const sdStartC = resolveConnect(matched.connect_start, null);
    const sdEndC = resolveConnect(matched.connect_end, null);
    let workPts = pts;
    if (sdStartC && sdEndC) {
      const startX = toNum(sdStartC.x_grid ?? sdStartC.tags?.x_grid ?? 0);
      const startY = toNum(sdStartC.y_grid ?? sdStartC.tags?.y_grid ?? 0);
      const endX = toNum(sdEndC.x_grid ?? sdEndC.tags?.x_grid ?? 0);
      const endY = toNum(sdEndC.y_grid ?? sdEndC.tags?.y_grid ?? 0);
      const d0ToStart = (pts[0][0] - startX) ** 2 + (pts[0][1] - startY) ** 2;
      const d0ToEnd = (pts[0][0] - endX) ** 2 + (pts[0][1] - endY) ** 2;
      if (d0ToEnd < d0ToStart) workPts = [...pts].reverse();
    }

    let totalLen = 0;
    const pathSegs = [];
    for (let i = 0; i < workPts.length - 1; i++) {
      const dx = workPts[i + 1][0] - workPts[i][0];
      const dy = workPts[i + 1][1] - workPts[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      totalLen += len;
      pathSegs.push({ len, p1: workPts[i], p2: workPts[i + 1] });
    }
    if (totalLen <= 0) return;

    const step = totalLen / (stList.length + 1);
    for (let si = 0; si < stList.length; si++) {
      const target = step * (si + 1);
      let covered = 0;
      for (const ps of pathSegs) {
        if (covered + ps.len >= target) {
          const ratio = (target - covered) / ps.len;
          let sx = ps.p1[0] + (ps.p2[0] - ps.p1[0]) * ratio;
          let sy = ps.p1[1] + (ps.p2[1] - ps.p1[1]) * ratio;
          const fullProps = stationLookup.get(stList[si].station_id) || stList[si];
          const dxSeg = ps.p2[0] - ps.p1[0];
          const dySeg = ps.p2[1] - ps.p1[1];
          const segLen = Math.sqrt(dxSeg * dxSeg + dySeg * dySeg);
          const sl = segLen > AXIS_EPS ? segLen : 1;
          const ux = dxSeg / sl;
          const uy = dySeg / sl;
          let bump = 0;
          let ok = occKey(sx, sy);
          while (placementOccKeys.has(ok) && bump < 64) {
            bump += 1;
            sx += ux * 1e-5 * bump;
            sy += uy * 1e-5 * bump;
            ok = occKey(sx, sy);
          }
          placementOccKeys.add(ok);
          const segIsH = Math.abs(dySeg) < AXIS_EPS && Math.abs(dxSeg) > AXIS_EPS;
          const segIsV = Math.abs(dxSeg) < AXIS_EPS && Math.abs(dySeg) > AXIS_EPS;
          out.push({
            x: sx,
            y: sy,
            kind: 'station',
            name: stationDisplayName(fullProps),
            meta: { ...fullProps },
            seg_is_h: segIsH,
            seg_is_v: segIsV,
          });
          break;
        }
        covered += ps.len;
      }
    }
  });

  return out;
}

/**
 * 黑點 line 站：直接使用 StationData 的 x_grid／y_grid（與刪減後列表／JSON 一致），不依路段弧長重新配置。
 * @param {Array<object>|null|undefined} stationData
 * @returns {Array<{ x: number, y: number, name: string, meta: object, seg_is_h: boolean, seg_is_v: boolean }>}
 */
export function collectLineStationGridPointsFromStationData(stationData) {
  if (!Array.isArray(stationData)) return [];
  const seen = new Set();
  const rows = [];
  for (const s of stationData) {
    if (!s || typeof s !== 'object') continue;
    const nt = String(s.node_type ?? s.tags?.node_type ?? '').toLowerCase();
    if (nt === 'connect') continue;
    if ((s.connect_number ?? s.tags?.connect_number) != null) continue;
    const x = s.x_grid ?? s.tags?.x_grid;
    const y = s.y_grid ?? s.tags?.y_grid;
    if (x == null || y == null) continue;
    const fx = Number(x);
    const fy = Number(y);
    const id = s.station_id ?? s.tags?.station_id;
    const dedupeKey =
      id != null && String(id).trim() !== ''
        ? `id:${String(id).trim()}`
        : `pos:${String(s.station_name ?? s.tags?.station_name ?? '')}|${fx.toFixed(5)},${fy.toFixed(5)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const sn = normalizeStationText(s.station_name ?? s.tags?.station_name ?? '');
    const sid = normalizeStationText(s.station_id ?? s.tags?.station_id ?? '');
    const name = sn || sid || '黑點';
    rows.push({
      x: fx,
      y: fy,
      name,
      meta: s,
      seg_is_h: false,
      seg_is_v: false,
    });
  }
  rows.sort(
    (a, b) => a.y - b.y || a.x - b.x || String(a.name).localeCompare(String(b.name), 'zh-Hant')
  );
  return rows;
}

/**
 * @param {object} layer
 * @returns {{
 *   pointCount: number,
 *   minWidth: number | null,
 *   minHeight: number | null,
 *   widthPair: { a: object, b: object, dx: number } | null,
 *   heightPair: { a: object, b: object, dy: number } | null,
 * }}
 */
export function computeGridStationMinAxisDistances(layer) {
  const points = collectStationPlacementPoints(layer);
  if (points.length < 2) {
    return {
      pointCount: points.length,
      minWidth: null,
      minHeight: null,
      widthPair: null,
      heightPair: null,
    };
  }

  let minWidth = null;
  let widthPair = null;
  let minHeight = null;
  let heightPair = null;

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > EPS && (minWidth === null || dx < minWidth - EPS)) {
        minWidth = dx;
        widthPair = { a, b, dx };
      }
      if (dy > EPS && (minHeight === null || dy < minHeight - EPS)) {
        minHeight = dy;
        heightPair = { a, b, dy };
      }
    }
  }

  return {
    pointCount: points.length,
    minWidth,
    minHeight,
    widthPair,
    heightPair,
  };
}

/**
 * 以「最小 |Δx|／|Δy|」為單元，將網路座標映射到疊加網格索引（原點對齊 0，與 overlayCellCenter 的 floor 劃格一致）。
 * @param {number} gx
 * @param {number} gy
 * @param {number} cellW
 * @param {number} cellH
 * @returns {{ ix: number, iy: number } | null}
 */
export function networkCoordToMinSpacingOverlayCell(gx, gy, cellW, cellH) {
  const ox = Number(cellW);
  const oy = Number(cellH);
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !(ox > 0) || !(oy > 0)) return null;
  return {
    ix: Math.floor(gx / ox),
    iy: Math.floor(gy / oy),
  };
}

/**
 * 折線上距 (gx, gy) 最近的點（網路座標）。
 * @param {number[][]} coords
 * @param {number} gx
 * @param {number} gy
 * @returns {number[] | null} [qx, qy]
 */
export function closestPointOnPolyline(coords, gx, gy) {
  if (!Array.isArray(coords) || coords.length < 1) return null;
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;

  let best = [coords[0][0], coords[0][1]];
  let bestD2 = (gx - best[0]) ** 2 + (gy - best[1]) ** 2;

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0];
    const ay = coords[i][1];
    const bx = coords[i + 1][0];
    const by = coords[i + 1][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-18) {
      t = Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / len2));
    }
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d2 = (gx - qx) ** 2 + (gy - qy) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = [qx, qy];
    }
  }
  return best;
}

/**
 * 由圖層車站配置推算最小間距疊加網格單元（與 hover / ix,iy 一致）；無法推算時回傳 1×1（維持舊行為）。
 * @param {object|null} layer
 * @returns {{ cellW: number, cellH: number, fromMinSpacing: boolean }}
 */
export function getMinSpacingCellSizesFromLayer(layer) {
  const rep = computeGridStationMinAxisDistances(layer);
  if (rep.minWidth == null || rep.minHeight == null || rep.pointCount < 2) {
    return { cellW: 1, cellH: 1, fromMinSpacing: false };
  }
  return {
    cellW: rep.minWidth,
    cellH: rep.minHeight,
    fromMinSpacing: true,
  };
}

function dedupeConsecutivePoints(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return arr;
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const a = out[out.length - 1];
    const b = arr[i];
    if (!Array.isArray(b) || b.length < 2) continue;
    if (a[0] !== b[0] || a[1] !== b[1]) out.push(b);
  }
  return out;
}

function nodeImportance(n) {
  if (!n || typeof n !== 'object') return 0;
  if (n.node_type === 'connect' || n.connect_number != null || n.tags?.connect_number != null)
    return 2;
  if (n.station_name || n.tags?.station_name) return 1;
  return 0;
}

function dedupeConsecutivePointsWithNodes(points, nodes) {
  if (!Array.isArray(points) || points.length < 2) return { points, nodes };
  const hasNodes = Array.isArray(nodes) && nodes.length === points.length;
  const outPts = [points[0]];
  const outNodes = hasNodes ? [nodes[0]] : null;
  for (let i = 1; i < points.length; i++) {
    const a = outPts[outPts.length - 1];
    const b = points[i];
    if (!Array.isArray(b) || b.length < 2) continue;
    if (a[0] !== b[0] || a[1] !== b[1]) {
      outPts.push(b);
      if (outNodes) outNodes.push(nodes[i]);
    } else if (outNodes && nodes[i]) {
      if (nodeImportance(nodes[i]) > nodeImportance(outNodes[outNodes.length - 1])) {
        outNodes[outNodes.length - 1] = nodes[i];
      }
    }
  }
  return { points: outPts, nodes: outNodes };
}

/**
 * 疊加四等分網格：以「格中心」為準——在無因次座標 nx＝(x−xMin)/cw 下，第 ix 格對應 nx∈[ix−0.5, ix+0.5]（邊界四捨五入），
 * 即 ix＝clamp(round(nx), 0, g−1)。有別於舊式 floor(x/cw) 的左下角對齊劃格。
 * @param {number} axisCoordFromMin - 已減去包圍盒原點之座標（x 或 y）
 * @param {number} cellSize - cw 或 ch
 * @param {number} gridN - 該軸分割數 g（與 b→c 四等分 2^k 一致）
 * @returns {number}
 */
export function overlayQuadCellIndex1D(axisCoordFromMin, cellSize, gridN) {
  const u = Number(axisCoordFromMin);
  const cs = Number(cellSize);
  const g = Math.max(1, Math.floor(Number(gridN)));
  if (!Number.isFinite(u) || !Number.isFinite(cs) || !(cs > 0)) return 0;
  let ix = Math.round(u / cs);
  if (ix < 0) ix = 0;
  else if (ix >= g) ix = g - 1;
  return ix;
}

/**
 * 將路段上 points／original_points 轉為疊加網格索引座標，並去除連續重複點。
 * - 若傳入 **gridN**（b→c 四等分）：採 **格中心 ±0.5 格**（round + clamp），與 maxRedBlackCountInQuadGrid 一致。
 * - 否則（最小間距 fallback）：維持 (floor(x/cw), floor(y/ch))。
 * 供 2-9→2-10 正規化在「疊加網格座標」上執行向量收縮與塌縮。
 * @param {Array<object>} segments - 扁平 segment 陣列
 * @param {number} cellW
 * @param {number} cellH
 * @param {number|null} [gridN] - 可選；有值時為 g×g 四等分網格邊數
 */
export function mapSegmentListToOverlayCellIndices(segments, cellW, cellH, gridN = null) {
  const cw = Number(cellW) > 0 ? Number(cellW) : 1;
  const ch = Number(cellH) > 0 ? Number(cellH) : 1;
  const g =
    gridN != null && Number.isFinite(Number(gridN)) && Number(gridN) >= 1
      ? Math.floor(Number(gridN))
      : null;
  const mapPt = (p) => {
    if (!Array.isArray(p) || p.length < 2) return p;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (g != null) {
      return [overlayQuadCellIndex1D(x, cw, g), overlayQuadCellIndex1D(y, ch, g)];
    }
    return [Math.floor(x / cw), Math.floor(y / ch)];
  };
  if (!Array.isArray(segments)) return;
  for (const seg of segments) {
    if (!seg) continue;
    if (Array.isArray(seg.points)) {
      const mappedPts = seg.points.map(mapPt);
      const dd = dedupeConsecutivePointsWithNodes(mappedPts, seg.nodes);
      seg.points = dd.points;
      if (dd.nodes) seg.nodes = dd.nodes;
      if (seg.points.length === 1) {
        const p = seg.points[0];
        seg.points = [
          [p[0], p[1]],
          [p[0], p[1]],
        ];
        if (Array.isArray(seg.nodes) && seg.nodes.length === 1) {
          seg.nodes = [seg.nodes[0], { ...seg.nodes[0] }];
        }
      }
    }
    if (Array.isArray(seg.original_points)) {
      seg.original_points = dedupeConsecutivePoints(seg.original_points.map(mapPt));
      if (seg.original_points.length === 1) {
        const p = seg.original_points[0];
        seg.original_points = [
          [p[0], p[1]],
          [p[0], p[1]],
        ];
      }
    }
  }
}
