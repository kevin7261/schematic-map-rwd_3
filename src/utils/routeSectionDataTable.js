/**
 * SectionData 路線—路段：站間 weight（1–9 等比）、與 DataTableTab 扁平列共用邏輯。
 */

/** DataTableTab 欄位順序 */
export const ROUTE_SECTION_FLAT_COLUMNS = [
  '#',
  '路線',
  '車站1',
  '座標1',
  '車站2',
  '座標2',
  '距離(格)',
  '中點座標',
  'weight',
];

function hashStringToUint32(str) {
  let h = 1779033703;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  if (a === 0) a = 2463534242;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleIntervalWeight19GeometricRng(rng) {
  let total = 0;
  const cum = [];
  for (let k = 1; k <= 9; k++) {
    total += 1 << (9 - k);
    cum.push(total);
  }
  const u = rng() * total;
  for (let k = 0; k < 9; k++) {
    if (u < cum[k]) return k + 1;
  }
  return 9;
}

/** 等比 1–9；以 seed 字串決定，同一 seed 永遠同一數字（與 ControlTab、DataTableTab 一致） */
export function sampleIntervalWeight19Seeded(seedStr) {
  const rng = mulberry32(hashStringToUint32(String(seedStr)));
  return sampleIntervalWeight19GeometricRng(rng);
}

/** SectionData：交叉點（紅）端點顯示字串 */
export function formatSectionConnectLabel(c) {
  if (!c) return '—';
  const name = String(c.station_name ?? c.tags?.station_name ?? c.tags?.name ?? '').trim();
  const cn = c.connect_number ?? c.tags?.connect_number;
  const x = c.x_grid ?? c.tags?.x_grid;
  const y = c.y_grid ?? c.tags?.y_grid;
  const bits = [];
  if (name) bits.push(name);
  if (cn != null && String(cn).trim() !== '') bits.push(`#${cn}`);
  const xy =
    x != null && y != null && Number.isFinite(Number(x)) && Number.isFinite(Number(y))
      ? `(${Number(x)},${Number(y)})`
      : '';
  const head = bits.length ? bits.join(' ') : '';
  if (head && xy) return `${head} ${xy}`;
  return head || xy || '—';
}

/** SectionData：中間站（黑）顯示字串 */
export function formatSectionBlackStation(s) {
  if (!s) return '—';
  const name = String(s.station_name ?? '').trim();
  const id = String(s.station_id ?? '').trim();
  if (name && id) return `${name}（${id}）`;
  return name || id || '—';
}

/** StationData → id:/name: 鍵對應格點字串 "(x,y)" */
export function buildStationGridLookup(stationData) {
  const map = new Map();
  if (!Array.isArray(stationData)) return map;
  for (const row of stationData) {
    const sid = String(row.station_id ?? row.tags?.station_id ?? '').trim();
    const sname = String(row.station_name ?? row.tags?.station_name ?? row.tags?.name ?? '').trim();
    const x = row.x_grid ?? row.tags?.x_grid;
    const y = row.y_grid ?? row.tags?.y_grid;
    if (x == null || y == null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
      continue;
    }
    const pair = `(${Number(x)},${Number(y)})`;
    if (sid) map.set(`id:${sid}`, pair);
    if (sname) map.set(`name:${sname}`, pair);
  }
  return map;
}

export function formatSectionBlackStationWithCoords(s, lookup) {
  const base = formatSectionBlackStation(s);
  if (!s || base === '—') return base;
  const sid = String(s.station_id ?? '').trim();
  const sname = String(s.station_name ?? '').trim();
  let xy = sid ? lookup.get(`id:${sid}`) : undefined;
  if (!xy && sname) xy = lookup.get(`name:${sname}`);
  if (!xy) {
    const x = s.x_grid ?? s.tags?.x_grid;
    const y = s.y_grid ?? s.tags?.y_grid;
    if (x != null && y != null && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
      xy = `(${Number(x)},${Number(y)})`;
    }
  }
  return xy ? `${base} ${xy}` : base;
}

function isSectionTableBlackPlaceholder(row) {
  return row?.typeLabel === '黑' && row?.content === '（中間無黑點）';
}

/**
 * 相鄰兩「站」之間一個 1–9 weight（等比）；seedPrefix 建議為 SectionData 陣列索引字串，與區間序 j 組成唯一 seed。
 */
export function assignIntervalWeights19SeededForTableRows(tableRows, sectionSeedPrefix) {
  if (!Array.isArray(tableRows) || tableRows.length < 2) return;
  const logicalIdx = [];
  for (let i = 0; i < tableRows.length; i++) {
    const r = tableRows[i];
    if (r.typeLabel === '紅·起') logicalIdx.push(i);
  }
  for (let i = 0; i < tableRows.length; i++) {
    const r = tableRows[i];
    if (r.typeLabel === '黑' && !isSectionTableBlackPlaceholder(r)) logicalIdx.push(i);
  }
  for (let i = 0; i < tableRows.length; i++) {
    const r = tableRows[i];
    if (r.typeLabel === '紅·迄') logicalIdx.push(i);
  }
  for (let i = 0; i < tableRows.length; i++) {
    tableRows[i].weight = '—';
  }
  for (let j = 0; j < logicalIdx.length - 1; j++) {
    const fromIdx = logicalIdx[j];
    const seed = `${sectionSeedPrefix}|${j}`;
    tableRows[fromIdx].weight = String(sampleIntervalWeight19Seeded(seed));
  }
}

/** 解析「(x,y)」字串為數值；失敗則 null */
export function parseParenCoordString(coordStr) {
  if (!coordStr || coordStr === '—') return null;
  const m = String(coordStr).match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

/** 兩格點曼哈頓距離（網格數），座標先四捨五入為整數格 */
export function gridManhattanDistanceFromCoordStrings(aStr, bStr) {
  const p = parseParenCoordString(aStr);
  const q = parseParenCoordString(bStr);
  if (!p || !q) return null;
  const x1 = Math.round(p[0]);
  const y1 = Math.round(p[1]);
  const x2 = Math.round(q[0]);
  const y2 = Math.round(q[1]);
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/** 中點座標字串，兩軸皆為整數 */
export function midpointIntCoordString(aStr, bStr) {
  const p = parseParenCoordString(aStr);
  const q = parseParenCoordString(bStr);
  if (!p || !q) return '—';
  const mx = Math.round((p[0] + q[0]) / 2);
  const my = Math.round((p[1] + q[1]) / 2);
  return `(${mx},${my})`;
}

/** 尾端「 (x,y)」與站名分離；無座標則座標欄為 — */
export function splitStationAndCoord(content) {
  if (!content || content === '—') return { station: '—', coord: '—' };
  const s = String(content).trim();
  const m = s.match(/^(.*?)\s+(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))\s*$/);
  if (m) {
    const station = m[1].trim() || '—';
    return { station, coord: m[2] };
  }
  return { station: s, coord: '—' };
}

function collectLogicalRowIndices(tableRows) {
  const logicalIdx = [];
  for (let i = 0; i < tableRows.length; i++) {
    const r = tableRows[i];
    if (r.typeLabel === '紅·起') logicalIdx.push(i);
  }
  for (let i = 0; i < tableRows.length; i++) {
    const r = tableRows[i];
    if (r.typeLabel === '黑' && !isSectionTableBlackPlaceholder(r)) logicalIdx.push(i);
  }
  for (let i = 0; i < tableRows.length; i++) {
    const r = tableRows[i];
    if (r.typeLabel === '紅·迄') logicalIdx.push(i);
  }
  return logicalIdx;
}

/**
 * 與 ControlTab「路線—路段」同資料，扁平為 # / 路線 / 車站1 / 座標1 / 車站2 / 座標2 / 距離(格) / 中點座標 / weight。
 */
export function buildRouteSectionFlatDataTableRows(layer) {
  const sections = layer?.spaceNetworkGridJsonData_SectionData;
  if (!Array.isArray(sections) || sections.length === 0) return [];

  const routeOrder = [];
  const seenRoute = new Set();
  for (const sec of sections) {
    const rn = String(sec?.route_name ?? '').trim() || 'Unknown';
    if (!seenRoute.has(rn)) {
      seenRoute.add(rn);
      routeOrder.push(rn);
    }
  }
  const byRoute = new Map();
  for (const rn of routeOrder) byRoute.set(rn, []);

  const stationLookup = buildStationGridLookup(layer.spaceNetworkGridJsonData_StationData);

  for (let secIdx = 0; secIdx < sections.length; secIdx++) {
    const sec = sections[secIdx];
    const rn = String(sec?.route_name ?? '').trim() || 'Unknown';
    const arr = byRoute.get(rn);
    if (!arr) continue;
    const blacks = (sec.station_list || []).map((s) =>
      formatSectionBlackStationWithCoords(s, stationLookup)
    );
    const segmentIndex = arr.length + 1;
    const tableRows = [
      {
        typeLabel: '紅·起',
        order: '—',
        content: formatSectionConnectLabel(sec.connect_start),
      },
    ];
    if (blacks.length === 0) {
      tableRows.push({ typeLabel: '黑', order: '—', content: '（中間無黑點）' });
    } else {
      blacks.forEach((b, bi) => {
        tableRows.push({ typeLabel: '黑', order: String(bi + 1), content: b });
      });
    }
    tableRows.push({
      typeLabel: '紅·迄',
      order: '—',
      content: formatSectionConnectLabel(sec.connect_end),
    });
    assignIntervalWeights19SeededForTableRows(tableRows, String(secIdx));
    arr.push({ segmentIndex, tableRows });
  }

  let num = 0;
  const out = [];
  for (const routeName of routeOrder) {
    const segments = byRoute.get(routeName) || [];
    for (const seg of segments) {
      const { tableRows } = seg;
      const logicalIdx = collectLogicalRowIndices(tableRows);
      for (let j = 0; j < logicalIdx.length - 1; j++) {
        num++;
        const from = tableRows[logicalIdx[j]];
        const to = tableRows[logicalIdx[j + 1]];
        const a = splitStationAndCoord(from.content);
        const b = splitStationAndCoord(to.content);
        const distGrid = gridManhattanDistanceFromCoordStrings(a.coord, b.coord);
        const midStr = midpointIntCoordString(a.coord, b.coord);
        out.push({
          '#': num,
          路線: routeName,
          車站1: a.station,
          座標1: a.coord,
          車站2: b.station,
          座標2: b.coord,
          '距離(格)': distGrid != null ? distGrid : '—',
          中點座標: midStr,
          weight: from.weight,
        });
      }
    }
  }
  return out;
}

export function layerHasSectionRouteTable(layer) {
  const s = layer?.spaceNetworkGridJsonData_SectionData;
  return Array.isArray(s) && s.length > 0;
}

// --- 地圖上站間 weight：沿折線弧長之中點（與 placeBlackAlongPoly 之 step 一致）---

function dist2(p1, p2) {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function polylineLength(poly) {
  if (!Array.isArray(poly) || poly.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    len += dist2(poly[i], poly[i + 1]);
  }
  return len;
}

/** 沿折線從起點累積 targetDist 之座標 */
export function getPointAtDistanceOnPolyline(polyline, targetDist) {
  if (!Array.isArray(polyline) || polyline.length < 2) return null;
  if (targetDist <= 0) return [polyline[0][0], polyline[0][1]];
  let currentDist = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    const segLen = dist2(p1, p2);
    if (currentDist + segLen >= targetDist) {
      const remain = targetDist - currentDist;
      const ratio = segLen > 0 ? remain / segLen : 0;
      return [p1[0] + (p2[0] - p1[0]) * ratio, p1[1] + (p2[1] - p1[1]) * ratio];
    }
    currentDist += segLen;
  }
  const last = polyline[polyline.length - 1];
  return [last[0], last[1]];
}

/**
 * 相鄰兩站之間弧長中點距離（從起點算）；blackStationCount = k 時有 k+1 個區間。
 * 與 placeBlackAlongPoly 之 step = totalLen/(k+1) 一致。
 */
export function computeIntervalMidDistancesOnPolyline(poly, blackStationCount) {
  const k = blackStationCount | 0;
  if (!Array.isArray(poly) || poly.length < 2) return [];
  const totalLen = polylineLength(poly);
  if (totalLen <= 0) return [];
  const numIntervals = k + 1;
  const step = totalLen / numIntervals;
  const mids = [];
  for (let j = 0; j < numIntervals; j++) {
    mids.push((j + 0.5) * step);
  }
  return mids;
}

/** 格心（整數格線則刻度在 n+0.5） */
export function snapGridCellCenterXY(x, y) {
  return [Math.floor(Number(x)) + 0.5, Math.floor(Number(y)) + 0.5];
}
