/**
 * 🗺️ Leaflet 自由畫線圖層 — 站點推導工具
 *
 * 由使用者繪製的路線（折線）與手動黑點，推導出三類站點：
 *  - 🔵 terminal（端點）：每條路線的起點與終點
 *  - 🔴 connect（交點）：不同線段彼此交叉之處（自動產生）
 *  - ⚫ 一般（黑點）：使用者手動點下的點
 *
 * 座標一律為 [lat, lng]。交點以平面近似計算（小範圍誤差可忽略）。
 */

/**
 * 🗺️ 可供「讀取並畫出」的世界各大城市捷運路線清單（50 座、依洲別分組）。
 * 每筆為 OSM 預抓的 GeoJSON（與專案原始輸入同格式：way/node + route_*／station_* tags，
 * 由 scripts/fetchMetroRoutes.mjs 產生）。
 * 註：此清單之 id／label／continent 須與 scripts/fetchMetroRoutes.mjs 的 CITIES 一致。
 */
const DRAW_REF_CONTINENTS = ['亞洲 Asia', '歐洲 Europe', '北美 North America', '南美 South America', '大洋洲 Oceania', '非洲 Africa'];
const DRAW_REF_CITIES = [
  // 亞洲 Asia
  { id: 'taipei', label: '台北 Taipei', continent: '亞洲 Asia' },
  { id: 'taichung', label: '台中 Taichung', continent: '亞洲 Asia' },
  { id: 'kaohsiung', label: '高雄 Kaohsiung', continent: '亞洲 Asia' },
  { id: 'tokyo', label: '東京 Tokyo', continent: '亞洲 Asia' },
  { id: 'osaka', label: '大阪 Osaka', continent: '亞洲 Asia' },
  { id: 'nagoya', label: '名古屋 Nagoya', continent: '亞洲 Asia' },
  { id: 'seoul', label: '首爾 Seoul', continent: '亞洲 Asia' },
  { id: 'busan', label: '釜山 Busan', continent: '亞洲 Asia' },
  { id: 'hongkong', label: '香港 Hong Kong', continent: '亞洲 Asia' },
  { id: 'singapore', label: '新加坡 Singapore', continent: '亞洲 Asia' },
  { id: 'shanghai', label: '上海 Shanghai', continent: '亞洲 Asia' },
  { id: 'beijing', label: '北京 Beijing', continent: '亞洲 Asia' },
  { id: 'guangzhou', label: '廣州 Guangzhou', continent: '亞洲 Asia' },
  { id: 'shenzhen', label: '深圳 Shenzhen', continent: '亞洲 Asia' },
  { id: 'bangkok', label: '曼谷 Bangkok', continent: '亞洲 Asia' },
  { id: 'delhi', label: '德里 Delhi', continent: '亞洲 Asia' },
  { id: 'dubai', label: '杜拜 Dubai', continent: '亞洲 Asia' },
  // 歐洲 Europe
  { id: 'london', label: '倫敦 London', continent: '歐洲 Europe' },
  { id: 'paris', label: '巴黎 Paris', continent: '歐洲 Europe' },
  { id: 'berlin', label: '柏林 Berlin', continent: '歐洲 Europe' },
  { id: 'munich', label: '慕尼黑 Munich', continent: '歐洲 Europe' },
  { id: 'madrid', label: '馬德里 Madrid', continent: '歐洲 Europe' },
  { id: 'barcelona', label: '巴塞隆納 Barcelona', continent: '歐洲 Europe' },
  { id: 'milan', label: '米蘭 Milano', continent: '歐洲 Europe' },
  { id: 'rome', label: '羅馬 Rome', continent: '歐洲 Europe' },
  { id: 'amsterdam', label: '阿姆斯特丹 Amsterdam', continent: '歐洲 Europe' },
  { id: 'vienna', label: '維也納 Vienna', continent: '歐洲 Europe' },
  { id: 'lisbon', label: '里斯本 Lisbon', continent: '歐洲 Europe' },
  { id: 'prague', label: '布拉格 Prague', continent: '歐洲 Europe' },
  { id: 'warsaw', label: '華沙 Warsaw', continent: '歐洲 Europe' },
  { id: 'budapest', label: '布達佩斯 Budapest', continent: '歐洲 Europe' },
  { id: 'stockholm', label: '斯德哥爾摩 Stockholm', continent: '歐洲 Europe' },
  { id: 'moscow', label: '莫斯科 Moscow', continent: '歐洲 Europe' },
  // 北美 North America
  { id: 'newyork', label: '紐約 New York', continent: '北美 North America' },
  { id: 'washington', label: '華盛頓 Washington', continent: '北美 North America' },
  { id: 'chicago', label: '芝加哥 Chicago', continent: '北美 North America' },
  { id: 'boston', label: '波士頓 Boston', continent: '北美 North America' },
  { id: 'sanfrancisco', label: '舊金山 San Francisco', continent: '北美 North America' },
  { id: 'losangeles', label: '洛杉磯 Los Angeles', continent: '北美 North America' },
  { id: 'philadelphia', label: '費城 Philadelphia', continent: '北美 North America' },
  { id: 'montreal', label: '蒙特婁 Montreal', continent: '北美 North America' },
  { id: 'toronto', label: '多倫多 Toronto', continent: '北美 North America' },
  { id: 'vancouver', label: '溫哥華 Vancouver', continent: '北美 North America' },
  { id: 'mexico', label: '墨西哥城 Mexico City', continent: '北美 North America' },
  // 南美 South America
  { id: 'saopaulo', label: '聖保羅 São Paulo', continent: '南美 South America' },
  { id: 'riodejaneiro', label: '里約熱內盧 Rio de Janeiro', continent: '南美 South America' },
  { id: 'buenosaires', label: '布宜諾斯艾利斯 Buenos Aires', continent: '南美 South America' },
  { id: 'santiago', label: '聖地牙哥 Santiago', continent: '南美 South America' },
  // 大洋洲 Oceania
  { id: 'sydney', label: '雪梨 Sydney', continent: '大洋洲 Oceania' },
  // 非洲 Africa
  { id: 'cairo', label: '開羅 Cairo', continent: '非洲 Africa' },
];
export const DRAW_REF_MAPS = DRAW_REF_CITIES.map((c) => ({
  ...c,
  kind: 'routes',
  routesFile: `data/metro/${c.id}.geojson`,
}));

/** 依洲別分組（供下拉選單 optgroup 使用） */
export const DRAW_REF_MAPS_BY_CONTINENT = DRAW_REF_CONTINENTS.map((continent) => ({
  continent,
  items: DRAW_REF_MAPS.filter((m) => m.continent === continent),
})).filter((g) => g.items.length);

/**
 * 路線具名調色盤：彼此區別、在淺色底圖上易辨識，且每色有中文名（路線以顏色為名）。
 */
export const ROUTE_PALETTE = [
  { name: '紅色', hex: '#e6194b' },
  { name: '綠色', hex: '#3cb44b' },
  { name: '藍色', hex: '#4363d8' },
  { name: '橘色', hex: '#f58231' },
  { name: '紫色', hex: '#911eb4' },
  { name: '青色', hex: '#1ca8c9' },
  { name: '洋紅色', hex: '#f032e6' },
  { name: '棕色', hex: '#9a6324' },
  { name: '深青色', hex: '#469990' },
  { name: '暗紅色', hex: '#800000' },
  { name: '海軍藍', hex: '#000075' },
  { name: '橄欖色', hex: '#808000' },
  { name: '粉紅色', hex: '#e377c2' },
  { name: '灰色', hex: '#7f7f7f' },
];

/**
 * 依路線索引取線色（不重複；超出調色盤時以黃金角 HSL 備援）。
 * @param {number} i 路線索引（0 起算）
 * @returns {string} 顏色字串
 */
export const routeColorForIndex = (i) => {
  const idx = Number.isFinite(i) && i >= 0 ? Math.floor(i) : 0;
  if (idx < ROUTE_PALETTE.length) return ROUTE_PALETTE[idx].hex;
  const hue = (idx * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 45%)`;
};

/**
 * 依路線索引取顏色名稱（路線以顏色為名）。
 * @param {number} i 路線索引（0 起算）
 * @returns {string} 顏色名稱
 */
export const routeColorNameForIndex = (i) => {
  const idx = Number.isFinite(i) && i >= 0 ? Math.floor(i) : 0;
  if (idx < ROUTE_PALETTE.length) return ROUTE_PALETTE[idx].name;
  return `顏色 ${idx + 1}`;
};

/** 兩向量外積（z 分量）：(px,py) × (qx,qy) */
const cross = (px, py, qx, qy) => px * qy - py * qx;

/**
 * 線段 a-b 與 c-d 的「真交叉」交點（0<t<1 且 0<u<1，端點接觸不算）。
 * @param {[number,number]} a [lat,lng]
 * @param {[number,number]} b
 * @param {[number,number]} c
 * @param {[number,number]} d
 * @returns {[number,number]|null} 交點 [lat,lng] 或 null
 */
export const segSegIntersection = (a, b, c, d) => {
  // 以 x=lng、y=lat 視為平面
  const ax = a[1];
  const ay = a[0];
  const bx = b[1];
  const by = b[0];
  const cx = c[1];
  const cy = c[0];
  const dx = d[1];
  const dy = d[0];

  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;

  const denom = cross(rx, ry, sx, sy);
  if (Math.abs(denom) < 1e-15) return null; // 平行或共線

  const qpx = cx - ax;
  const qpy = cy - ay;
  const t = cross(qpx, qpy, sx, sy) / denom;
  const u = cross(qpx, qpy, rx, ry) / denom;

  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return [ay + t * ry, ax + t * rx]; // [lat,lng]
  }
  return null;
};

/**
 * 點 p 在線段 a-b 上的最近點（平面近似，x=lng、y=lat）。
 * @returns {[number,number]} [lat,lng]
 */
const closestPointOnSegment = (p, a, b) => {
  const px = p[1];
  const py = p[0];
  const ax = a[1];
  const ay = a[0];
  const bx = b[1];
  const by = b[0];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [ay + t * dy, ax + t * dx]; // [lat,lng]
};

/**
 * 將點吸附到所有路線中最近的線段上（黑點一定落在線上）。
 * @param {[number,number]} latlng [lat,lng]
 * @param {Array<{latlngs:Array<[number,number]>}>} lines
 * @returns {[number,number]|null} 線上最近點，無任何線段時回傳 null
 */
export const snapPointToLines = (latlng, lines) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  let best = null;
  let bestD = Infinity;
  for (const l of safeLines) {
    for (let i = 0; i < l.latlngs.length - 1; i++) {
      const c = closestPointOnSegment(latlng, l.latlngs[i], l.latlngs[i + 1]);
      const ddx = c[1] - latlng[1];
      const ddy = c[0] - latlng[0];
      const d = ddx * ddx + ddy * ddy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
};

/** 依容差合併相近的點，避免多線交於一處時產生重複紅點 */
const dedupePoints = (points, tol = 1e-5) => {
  const out = [];
  for (const p of points) {
    if (!out.some((q) => Math.abs(q[0] - p[0]) < tol && Math.abs(q[1] - p[1]) < tol)) {
      out.push(p);
    }
  }
  return out;
};

/**
 * 由路線與黑點推導三類站點。
 * @param {Array<{latlngs:Array<[number,number]>}>} lines 路線
 * @param {Array<[number,number]>} blackDots 手動黑點
 * @returns {{terminals:Array<[number,number]>, connects:Array<[number,number]>, blacks:Array<[number,number]>}}
 */
export const computeLeafletDrawStations = (lines, blackDots) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const blacks = Array.isArray(blackDots)
    ? blackDots.filter((p) => Array.isArray(p) && p.length >= 2)
    : [];

  // 端點（terminal）：封閉路線無端點
  const terminals = [];
  for (const l of safeLines) {
    if (l.closed) continue;
    terminals.push(l.latlngs[0], l.latlngs[l.latlngs.length - 1]);
  }

  // 交點（connect）：只標記「實際存在的節點」——某條路線的節點（含端點）正好落在另一條路線上
  //   （＝多線共用的同一個站點）。⚠️ 不再以「線段交叉」自動生成交點：兩條畫出來的線
  //   只是視覺上交錯、但該處沒有任何節點時，不會憑空產生紅點。
  const connects = [];
  const ON_TOL = 1e-6;
  safeLines.forEach((lx, xi) => {
    lx.latlngs.forEach((v) => {
      for (let yi = 0; yi < safeLines.length; yi++) {
        if (yi === xi) continue;
        const pr = projectOnPolyline(safeLines[yi].latlngs, v);
        if (pr && pr.perpDist <= ON_TOL) {
          connects.push(v);
          break;
        }
      }
    });
  });

  return { terminals, connects: dedupePoints(connects), blacks };
};

/** 路線（索引）清單：折線通過 point（容差內）者 */
const routesThroughPoint = (safeLines, point, tol) => {
  const ids = [];
  safeLines.forEach((l, i) => {
    const pr = projectOnPolyline(l.latlngs, point);
    if (pr && pr.perpDist <= tol) ids.push(i);
  });
  return ids;
};

/** 兩點平面距離（度，僅供排序／比較用） */
const planarDist = (a, b) => {
  const dx = a[1] - b[1];
  const dy = a[0] - b[0];
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * 將點投影到折線上，回傳 { pos, perpDist }：
 *  - pos：沿折線自起點起算的累積距離（度）
 *  - perpDist：點到折線的最短距離（度），用於判斷該點是否落在此折線上
 */
const projectOnPolyline = (latlngs, point) => {
  let best = null;
  let cum = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = latlngs[i];
    const b = latlngs[i + 1];
    const c = closestPointOnSegment(point, a, b);
    const perpDist = planarDist(point, c);
    if (!best || perpDist < best.perpDist) {
      best = { pos: cum + planarDist(a, c), perpDist };
    }
    cum += planarDist(a, b);
  }
  return best;
};

/**
 * 逐路線、依序（起點→終點）列出該路線上的站點。
 * 站點型別：'terminal'（端點，藍）｜'connect'（交點，紅）｜'black'（一般，黑）。
 * connect 同時落在多條路線上時，會出現在每一條相關路線中。
 *
 * connect 站點會帶 connectRoutes：與其相交（共用）的其他路線索引（0 起算）。
 *
 * @param {Array<{color?:string, latlngs:Array<[number,number]>}>} lines
 * @param {Array<[number,number]>} blackDots
 * @returns {Array<{routeIndex:number, color:string, stations:Array<{type:string, latlng:[number,number], connectRoutes?:number[]}>}>}
 */
export const computeLeafletDrawRouteStations = (lines, blackDots) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const { connects, blacks } = computeLeafletDrawStations(safeLines, blackDots);
  const ON_LINE_TOL = 1e-6; // 約 0.1m：判斷點是否落在折線上
  const SAME_TOL = 1e-6; // 視為同一點的容差

  const nearSameConnect = (point) =>
    connects.find(
      (c) => Math.abs(c[0] - point[0]) < SAME_TOL && Math.abs(c[1] - point[1]) < SAME_TOL
    ) || null;

  // connect 站：附上交會的其他路線索引
  const makeConnectStation = (connectPt, latlng, pos, routeIndex) => ({
    type: 'connect',
    latlng,
    pos,
    connectRoutes: routesThroughPoint(safeLines, connectPt, ON_LINE_TOL).filter(
      (i) => i !== routeIndex
    ),
  });

  return safeLines.map((line, routeIndex) => {
    const pts = line.latlngs;
    const total = (() => {
      let s = 0;
      for (let i = 0; i < pts.length - 1; i++) s += planarDist(pts[i], pts[i + 1]);
      return s;
    })();

    const stations = [];
    // 端點：封閉路線無端點；否則若與某交點重合視為 connect（紅），其餘為 terminal（藍）
    if (!line.closed) {
      [
        { latlng: pts[0], pos: 0 },
        { latlng: pts[pts.length - 1], pos: total },
      ].forEach(({ latlng, pos }) => {
        const c = nearSameConnect(latlng);
        if (c) stations.push(makeConnectStation(c, latlng, pos, routeIndex));
        else stations.push({ type: 'terminal', latlng, pos });
      });
    }
    // 交點（紅）：落在此路線上者（排除已作為端點加入的）
    for (const c of connects) {
      const pr = projectOnPolyline(pts, c);
      if (!pr || pr.perpDist > ON_LINE_TOL) continue;
      const dupEndpoint = stations.some(
        (s) =>
          s.type === 'connect' &&
          Math.abs(s.latlng[0] - c[0]) < SAME_TOL &&
          Math.abs(s.latlng[1] - c[1]) < SAME_TOL
      );
      if (!dupEndpoint) stations.push(makeConnectStation(c, c, pr.pos, routeIndex));
    }
    // 一般（黑）：落在此路線上者
    for (const b of blacks) {
      const pr = projectOnPolyline(pts, b);
      if (pr && pr.perpDist <= ON_LINE_TOL) stations.push({ type: 'black', latlng: b, pos: pr.pos });
    }

    stations.sort((a, b) => a.pos - b.pos);
    return {
      routeIndex,
      color: line.color || '#000000',
      closed: !!line.closed,
      stations: stations.map(({ type, latlng, connectRoutes }) =>
        type === 'connect' ? { type, latlng, connectRoutes } : { type, latlng }
      ),
    };
  });
};

/**
 * 將 Leaflet 畫線內容轉成 OSM 風格路網 GeoJSON（type:'way'／'node'），
 * 供 osm_2_geojson_2_json 圖層之 GeoJSON 管線解析（station 由 Point 推導，
 * 交點度數由座標重合自動計算 → intersection／terminal／normal）。
 *
 * - 每條路線 → 一個 way LineString（座標鏈已把 connect／黑點插為頂點，使站點落在線上）
 * - 每個站點座標 → 一個 node Point（route_name_list 標明所屬路線）
 *
 * route_name／route_id 優先取 line.routeName／line.routeId（載入真實城市時為 OSM 原值），
 * station_name／station_id 優先取 stationMeta（依座標查 OSM 站名／節點 id）；
 * 皆缺時才退回以顏色命名／流水號（手繪情境）。
 *
 * @param {Array<{color?:string, latlngs:Array<[number,number]>, routeName?:string, routeId?:string}>} lines
 * @param {Array<[number,number]>} blackDots
 * @param {Object<string,{id?:string|number, name?:string}>} [stationMeta] 座標→站點資料，鍵為 `${lat.toFixed(6)},${lng.toFixed(6)}`
 * @returns {{type:'FeatureCollection', features:object[]}}
 */
export const leafletDrawToOsmRouteGeoJson = (lines, blackDots, stationMeta = null) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  const routeStations = computeLeafletDrawRouteStations(safeLines, blackDots);
  const nodeKey = (lon, lat) => `${lon.toFixed(7)},${lat.toFixed(7)}`;
  const rank = (t) => (t === 'intersection' ? 2 : t === 'terminal' ? 1 : 0);

  // 路線真實名稱／代號（缺則退回顏色名／流水號）
  const routeName = (i) => safeLines[i]?.routeName || routeColorNameForIndex(i);
  const routeId = (i) => safeLines[i]?.routeId || String(i + 1);
  // 站點真實資料（依座標查；鍵與 fetch 產出一致）
  const metaKey = (lat, lon) => `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
  const metaFor = (lat, lon) => (stationMeta && stationMeta[metaKey(lat, lon)]) || null;

  // 依座標彙整站點（型別取最高、route_name_list 聯集）
  const nodeByKey = new Map();
  routeStations.forEach((route) => {
    const rName = routeName(route.routeIndex);
    route.stations.forEach((st) => {
      const [lat, lon] = st.latlng;
      const key = nodeKey(lon, lat);
      const t = st.type === 'connect' ? 'intersection' : st.type === 'terminal' ? 'terminal' : 'normal';
      let e = nodeByKey.get(key);
      if (!e) {
        e = { lon, lat, type: t, routeNames: new Set(), meta: metaFor(lat, lon) };
        nodeByKey.set(key, e);
      } else if (rank(t) > rank(e.type)) {
        e.type = t;
      }
      e.routeNames.add(rName);
      if (st.type === 'connect' && Array.isArray(st.connectRoutes)) {
        st.connectRoutes.forEach((ri) => e.routeNames.add(routeName(ri)));
      }
    });
  });

  const features = [];

  // way features：把 connect／黑點依沿線位置插入頂點，使站點正好落在線上
  safeLines.forEach((line, i) => {
    const cum = [0];
    for (let k = 0; k < line.latlngs.length - 1; k++) {
      cum.push(cum[k] + planarDist(line.latlngs[k], line.latlngs[k + 1]));
    }
    const pts = line.latlngs.map((p, k) => ({ pos: cum[k], coord: [p[1], p[0]] }));
    (routeStations[i]?.stations || [])
      .filter((s) => s.type !== 'terminal')
      .forEach((s) => {
        const pr = projectOnPolyline(line.latlngs, s.latlng);
        if (pr) pts.push({ pos: pr.pos, coord: [s.latlng[1], s.latlng[0]] });
      });
    pts.sort((a, b) => a.pos - b.pos);
    const coords = [];
    for (const pt of pts) {
      const last = coords[coords.length - 1];
      if (last && last[0] === pt.coord[0] && last[1] === pt.coord[1]) continue;
      coords.push(pt.coord);
    }
    if (coords.length < 2) return;
    features.push({
      type: 'Feature',
      properties: {
        type: 'way',
        id: i + 1,
        tags: {
          route_id: routeId(i),
          route_name: routeName(i),
          color: line.color || '#666666',
          railway: 'subway',
        },
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
  });

  // node features：每個站點座標一個 Point（站名／站號優先用真實資料）
  let nid = 1;
  for (const e of nodeByKey.values()) {
    features.push({
      type: 'Feature',
      properties: {
        type: 'node',
        id: nid,
        tags: {
          station_id: e.meta && e.meta.id != null ? String(e.meta.id) : `s${nid}`,
          station_name: (e.meta && e.meta.name) || '',
          type: e.type,
          route_name_list: [...e.routeNames],
        },
      },
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
    });
    nid += 1;
  }

  return { type: 'FeatureCollection', features };
};
