/**
 * 🌍🚇 抓取世界各大城市的地鐵（subway / light_rail）路線幾何，輸出成「畫線」圖層可載入的 JSON。
 *
 * 來源：OpenStreetMap Overpass API（route=subway 關聯，含 colour 標籤與成員 way 幾何）。
 * 處理：把每條路線的多個 way 縫合成折線（chain）→ 去除反向重複 → Douglas–Peucker 簡化 → 取整。
 * 產物：public/data/metro/<city>.json
 *   { city, label, source, lines: [ { name, color, latlngs: [[lat,lng], ...] }, ... ] }
 *
 * 執行：node scripts/fetchMetroRoutes.mjs            （抓全部）
 *      node scripts/fetchMetroRoutes.mjs london paris （只抓指定城市）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'metro');

// 城市清單（含洲別與 bbox: south, west, north, east）。50 座、依洲別分組。
export const CONTINENTS = ['亞洲 Asia', '歐洲 Europe', '北美 North America', '南美 South America', '大洋洲 Oceania', '非洲 Africa'];
export const CITIES = [
  // ── 亞洲 Asia ──
  { id: 'taipei', label: '台北 Taipei', continent: '亞洲 Asia', bbox: [24.94, 121.40, 25.16, 121.68] },
  { id: 'taichung', label: '台中 Taichung', continent: '亞洲 Asia', bbox: [24.08, 120.56, 24.30, 120.80] },
  { id: 'kaohsiung', label: '高雄 Kaohsiung', continent: '亞洲 Asia', bbox: [22.52, 120.20, 22.78, 120.44] },
  { id: 'tokyo', label: '東京 Tokyo', continent: '亞洲 Asia', bbox: [35.55, 139.55, 35.82, 139.92] },
  { id: 'osaka', label: '大阪 Osaka', continent: '亞洲 Asia', bbox: [34.58, 135.38, 34.76, 135.58] },
  { id: 'nagoya', label: '名古屋 Nagoya', continent: '亞洲 Asia', bbox: [35.05, 136.82, 35.25, 136.98] },
  { id: 'seoul', label: '首爾 Seoul', continent: '亞洲 Asia', bbox: [37.45, 126.80, 37.65, 127.15] },
  { id: 'busan', label: '釜山 Busan', continent: '亞洲 Asia', bbox: [35.07, 128.95, 35.25, 129.20] },
  { id: 'hongkong', label: '香港 Hong Kong', continent: '亞洲 Asia', bbox: [22.25, 114.10, 22.40, 114.25] },
  { id: 'singapore', label: '新加坡 Singapore', continent: '亞洲 Asia', bbox: [1.24, 103.66, 1.47, 103.92] },
  { id: 'shanghai', label: '上海 Shanghai', continent: '亞洲 Asia', bbox: [31.10, 121.28, 31.38, 121.62] },
  { id: 'beijing', label: '北京 Beijing', continent: '亞洲 Asia', bbox: [39.78, 116.22, 40.05, 116.55] },
  { id: 'guangzhou', label: '廣州 Guangzhou', continent: '亞洲 Asia', bbox: [23.00, 113.20, 23.20, 113.42] },
  { id: 'shenzhen', label: '深圳 Shenzhen', continent: '亞洲 Asia', bbox: [22.50, 113.88, 22.65, 114.15] },
  { id: 'bangkok', label: '曼谷 Bangkok', continent: '亞洲 Asia', bbox: [13.65, 100.45, 13.86, 100.65] },
  { id: 'delhi', label: '德里 Delhi', continent: '亞洲 Asia', bbox: [28.48, 77.05, 28.76, 77.35] },
  { id: 'dubai', label: '杜拜 Dubai', continent: '亞洲 Asia', bbox: [25.04, 55.08, 25.30, 55.42] },
  // ── 歐洲 Europe ──
  { id: 'london', label: '倫敦 London', continent: '歐洲 Europe', bbox: [51.40, -0.30, 51.62, 0.10] },
  { id: 'paris', label: '巴黎 Paris', continent: '歐洲 Europe', bbox: [48.80, 2.22, 48.92, 2.47] },
  { id: 'berlin', label: '柏林 Berlin', continent: '歐洲 Europe', bbox: [52.40, 13.20, 52.62, 13.55] },
  { id: 'munich', label: '慕尼黑 Munich', continent: '歐洲 Europe', bbox: [48.08, 11.45, 48.20, 11.66] },
  { id: 'madrid', label: '馬德里 Madrid', continent: '歐洲 Europe', bbox: [40.30, -3.80, 40.55, -3.60] },
  { id: 'barcelona', label: '巴塞隆納 Barcelona', continent: '歐洲 Europe', bbox: [41.32, 2.05, 41.47, 2.25] },
  { id: 'milan', label: '米蘭 Milano', continent: '歐洲 Europe', bbox: [45.40, 9.08, 45.56, 9.28] },
  { id: 'rome', label: '羅馬 Rome', continent: '歐洲 Europe', bbox: [41.78, 12.40, 41.96, 12.62] },
  { id: 'amsterdam', label: '阿姆斯特丹 Amsterdam', continent: '歐洲 Europe', bbox: [52.29, 4.80, 52.43, 5.00] },
  { id: 'vienna', label: '維也納 Vienna', continent: '歐洲 Europe', bbox: [48.14, 16.30, 48.28, 16.46] },
  { id: 'lisbon', label: '里斯本 Lisbon', continent: '歐洲 Europe', bbox: [38.68, -9.26, 38.80, -9.08] },
  { id: 'prague', label: '布拉格 Prague', continent: '歐洲 Europe', bbox: [50.00, 14.34, 50.16, 14.56] },
  { id: 'warsaw', label: '華沙 Warsaw', continent: '歐洲 Europe', bbox: [52.13, 20.90, 52.33, 21.12] },
  { id: 'budapest', label: '布達佩斯 Budapest', continent: '歐洲 Europe', bbox: [47.44, 19.00, 47.56, 19.16] },
  { id: 'stockholm', label: '斯德哥爾摩 Stockholm', continent: '歐洲 Europe', bbox: [59.26, 17.94, 59.40, 18.14] },
  { id: 'moscow', label: '莫斯科 Moscow', continent: '歐洲 Europe', bbox: [55.60, 37.40, 55.85, 37.80] },
  // ── 北美 North America ──
  { id: 'newyork', label: '紐約 New York', continent: '北美 North America', bbox: [40.55, -74.05, 40.90, -73.70] },
  { id: 'washington', label: '華盛頓 Washington', continent: '北美 North America', bbox: [38.78, -77.18, 39.00, -76.88] },
  { id: 'chicago', label: '芝加哥 Chicago', continent: '北美 North America', bbox: [41.74, -87.78, 42.02, -87.52] },
  { id: 'boston', label: '波士頓 Boston', continent: '北美 North America', bbox: [42.30, -71.18, 42.42, -70.98] },
  { id: 'sanfrancisco', label: '舊金山 San Francisco', continent: '北美 North America', bbox: [37.60, -122.50, 37.90, -122.10] },
  { id: 'losangeles', label: '洛杉磯 Los Angeles', continent: '北美 North America', bbox: [33.92, -118.35, 34.12, -118.14] },
  { id: 'philadelphia', label: '費城 Philadelphia', continent: '北美 North America', bbox: [39.88, -75.26, 40.04, -75.10] },
  { id: 'montreal', label: '蒙特婁 Montreal', continent: '北美 North America', bbox: [45.40, -73.72, 45.60, -73.50] },
  { id: 'toronto', label: '多倫多 Toronto', continent: '北美 North America', bbox: [43.58, -79.58, 43.82, -79.28] },
  { id: 'vancouver', label: '溫哥華 Vancouver', continent: '北美 North America', bbox: [49.18, -123.18, 49.32, -122.78] },
  { id: 'mexico', label: '墨西哥城 Mexico City', continent: '北美 North America', bbox: [19.28, -99.22, 19.56, -99.02] },
  // ── 南美 South America ──
  { id: 'saopaulo', label: '聖保羅 São Paulo', continent: '南美 South America', bbox: [-23.72, -46.76, -23.48, -46.52] },
  { id: 'riodejaneiro', label: '里約熱內盧 Rio de Janeiro', continent: '南美 South America', bbox: [-22.98, -43.40, -22.78, -43.14] },
  { id: 'buenosaires', label: '布宜諾斯艾利斯 Buenos Aires', continent: '南美 South America', bbox: [-34.70, -58.52, -34.54, -58.34] },
  { id: 'santiago', label: '聖地牙哥 Santiago', continent: '南美 South America', bbox: [-33.56, -70.78, -33.36, -70.54] },
  // ── 大洋洲 Oceania ──
  { id: 'sydney', label: '雪梨 Sydney', continent: '大洋洲 Oceania', bbox: [-33.98, 150.98, -33.78, 151.28] },
  // ── 非洲 Africa ──
  { id: 'cairo', label: '開羅 Cairo', continent: '非洲 Africa', bbox: [29.95, 31.18, 30.12, 31.40] },
];

const FALLBACK_PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#1ca8c9', '#f032e6', '#9a6324', '#469990', '#800000',
  '#000075', '#808000', '#e377c2', '#7f7f7f',
];

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (res.status === 429 || res.status === 504) throw new Error('HTTP ' + res.status + ' (限流/逾時)');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(8000 + attempt * 6000); // 429 退避：越試越久
    }
  }
  throw lastErr;
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const key5 = (lat, lng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
const normColor = (c) => {
  if (!c || typeof c !== 'string') return null;
  const s = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  }
  return null; // 具名顏色（red 等）就交給 fallback，避免渲染不一致
};

/** 把一組 way（每個是 [[lat,lng],...]）縫合成數條 chain */
function stitchWays(ways) {
  const segs = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const chains = [];
  const used = new Array(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let chain = segs[i].slice();
    let extended = true;
    while (extended) {
      extended = false;
      const head = chain[0];
      const tail = chain[chain.length - 1];
      const hk = key5(head[0], head[1]);
      const tk = key5(tail[0], tail[1]);
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const s = segs[j];
        const sStart = key5(s[0][0], s[0][1]);
        const sEnd = key5(s[s.length - 1][0], s[s.length - 1][1]);
        if (sStart === tk) {
          chain = chain.concat(s.slice(1));
          used[j] = true;
          extended = true;
        } else if (sEnd === tk) {
          chain = chain.concat(s.slice(0, -1).reverse());
          used[j] = true;
          extended = true;
        } else if (sEnd === hk) {
          chain = s.slice(0, -1).concat(chain);
          used[j] = true;
          extended = true;
        } else if (sStart === hk) {
          chain = s.slice(1).reverse().concat(chain);
          used[j] = true;
          extended = true;
        }
        if (extended) break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

/** Douglas–Peucker 簡化（lat/lng 平面近似） */
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const sq = (v) => v * v;
  const segDist2 = (p, a, b) => {
    const vx = b[1] - a[1];
    const vy = b[0] - a[0];
    const wx = p[1] - a[1];
    const wy = p[0] - a[0];
    const len2 = vx * vx + vy * vy;
    let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return sq(p[1] - (a[1] + t * vx)) + sq(p[0] - (a[0] + t * vy));
  };
  const tol2 = tol * tol;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let md = -1;
    let mi = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist2(pts[i], pts[lo], pts[hi]);
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (md > tol2 && mi > 0) {
      keep[mi] = true;
      stack.push([lo, mi], [mi, hi]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const lineLenDeg = (pts) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
};

const metersBetween = (a, b) => {
  const dy = (a[0] - b[0]) * 111320;
  const dx = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

/** 把所有站點以貪婪法分群（半徑 meters）；回傳 snap(coord) → 該群中心（用以讓轉乘站座標完全一致） */
function makeStationSnapper(stations, meters) {
  const clusters = [];
  for (const s of stations) {
    let best = null;
    let bd = Infinity;
    for (const c of clusters) {
      const d = metersBetween(s, [c.lat, c.lng]);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best && bd <= meters) {
      best.lat = (best.lat * best.n + s[0]) / (best.n + 1);
      best.lng = (best.lng * best.n + s[1]) / (best.n + 1);
      best.n += 1;
    } else {
      clusters.push({ lat: s[0], lng: s[1], n: 1 });
    }
  }
  return (p) => {
    let best = null;
    let bd = Infinity;
    for (const c of clusters) {
      const d = metersBetween(p, [c.lat, c.lng]);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return [round6(best.lat), round6(best.lng)];
  };
}

const dedupeConsecutive = (pts) => {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
};

const keyOf = (c) => `${(+c[0]).toFixed(6)},${(+c[1]).toFixed(6)}`;

/** 由路線名去除「方向」標記，得到穩定的路線身分（用於合併同線不同方向的關聯） */
const cleanLineName = (name) =>
  String(name || '')
    .replace(/[（(][^（()）]*[)）]\s*$/g, '') // 去尾端括號：(順行)/(逆行)/(clockwise)…
    .replace(/\s*[：:].*$/g, '') // 去「： A → B」方向敘述
    .replace(
      /\s*[-–—]?\s*(順行|逆行|外環|內環|clockwise|anti-?clockwise|outbound|inbound|outer|inner)\b.*$/gi,
      ''
    )
    .trim();

async function fetchCity(city) {
  const [s, w, n, e] = city.bbox;
  // `.r out geom;`：關聯含成員幾何（stop 成員帶 lat/lon 與 ref=node id）；
  // `node(r.r);out tags;`：取所有成員 node 的 tags（站名／ref）→ 建 id→name／id→ref 對照。
  const query = `[out:json][timeout:180];relation["route"~"^(subway|light_rail)$"](${s},${w},${n},${e})->.r;.r out geom;node(r.r);out tags;`;
  const json = await overpass(query);
  const els = json.elements || [];
  const rels = els.filter((el) => el.type === 'relation');
  const nodeName = new Map();
  const nodeRef = new Map();
  for (const el of els)
    if (el.type === 'node' && el.tags) {
      if (el.tags.name) nodeName.set(el.id, el.tags.name);
      if (el.tags.ref) nodeRef.set(el.id, el.tags.ref);
    }

  // 依「路線身分（network|ref）」分組；每組保留各關聯（多為「每方向一個」）的 stop 序列與 way 幾何。
  const groups = new Map();
  for (const rel of rels) {
    const tags = rel.tags || {};
    // 跳過「多線直通運轉」的合併關聯（ref 含 ; , /），它們會與各別線重複（如東京 DT;Z;TS;TN）
    if (/[;,/]/.test((tags.ref || '').trim())) continue;
    const stops = (rel.members || [])
      .filter((m) => m.type === 'node' && /^stop/i.test(m.role || '') && Number.isFinite(m.lat) && Number.isFinite(m.lon))
      .map((m) => ({ coord: [round6(m.lat), round6(m.lon)], id: m.ref, name: nodeName.get(m.ref) || '', ref: nodeRef.get(m.ref) || '' }));
    const ways = (rel.members || [])
      .filter((m) => m.type === 'way' && Array.isArray(m.geometry) && !/platform|stop|station/i.test(m.role || ''))
      .map((m) => m.geometry.map((g) => [round6(g.lat), round6(g.lon)]));
    if (!stops.length && !ways.length) continue;

    const ref = (tags.ref || '').trim();
    // 路線身分：優先 ref；無 ref 時用「去方向後的名稱」或顏色，讓同線不同方向（如環狀順/逆行）合併
    const ident = ref || cleanLineName(tags.name) || normColor(tags.colour || tags.color) || 'rel' + rel.id;
    const key = `${(tags.network || '').trim()}|${ident}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        routeCompany: tags.operator || tags.network || '', // route_company（營運單位）
        routeId: tags.ref || String(rel.id), // route_id（OSM ref，否則 relation id）
        routeName: tags.name || ref || '', // route_name（OSM name）
        osmId: String(rel.id), // osm_id（relation id）
        railway: tags.route || 'subway', // railway（subway／light_rail）
        colorRaw: null,
        rels: [],
      };
      groups.set(key, g);
    }
    g.rels.push({ stops, ways });
    if (!g.colorRaw) g.colorRaw = tags.colour || tags.color || null;
  }

  // 每條線挑代表：優先「站數最多」的關聯（單一方向、完整）；無站點則退回最長 way chain。
  const picked = [];
  let colorIdx = 0;
  for (const g of groups.values()) {
    let bestStops = null;
    for (const r of g.rels) if (r.stops.length >= 2 && (!bestStops || r.stops.length > bestStops.length)) bestStops = r.stops;
    let geomFallback = null;
    if (!bestStops) {
      let best = null;
      let bl = -1;
      for (const r of g.rels) for (const c of stitchWays(r.ways)) if (lineLenDeg(c) > bl) ((bl = lineLenDeg(c)), (best = c));
      geomFallback = best ? simplify(best, 0.0006) : null;
    }
    if (!bestStops && (!geomFallback || geomFallback.length < 2)) continue;
    const color = normColor(g.colorRaw) || FALLBACK_PALETTE[colorIdx % FALLBACK_PALETTE.length];
    colorIdx += 1;
    picked.push({ ...g, color, stops: bestStops, geom: geomFallback });
  }

  // 跨線分群站點，讓轉乘站座標完全一致（→ 之後被判為交點）
  const allStops = [];
  for (const p of picked) if (p.stops) for (const st of p.stops) allStops.push(st.coord);
  const snap = allStops.length ? makeStationSnapper(allStops, 250) : null;

  // 串成折線（站點順序），保留每條線的 canonical 站點（含真實 id/name/ref）
  const built = [];
  for (const p of picked) {
    let canon = null;
    let latlngs;
    if (p.stops && snap) {
      canon = p.stops.map((st) => ({ c: snap(st.coord), id: st.id, name: st.name, ref: st.ref }));
      latlngs = dedupeConsecutive(canon.map((s2) => s2.c));
    } else {
      latlngs = p.geom;
    }
    if (!latlngs || latlngs.length < 2) continue;
    built.push({ ...p, latlngs, canon });
  }
  if (!built.length) throw new Error('無路線資料');

  // 🛡️ 安全網：移除「與另一條線高度互相重疊」的線（同一條線的不同方向/變體未被 ref 合併時）。
  //    互相覆蓋率皆 ≥80% 才視為重複 → 可區分「同線雙向」與「快慢車共用主幹（單向被覆蓋）」。
  built.sort((a, b) => b.latlngs.length - a.latlngs.length);
  const lineDefs = [];
  const keptKeys = [];
  for (const l of built) {
    const ks = new Set(l.latlngs.map(keyOf));
    let dup = false;
    for (const kk of keptKeys) {
      let hit = 0;
      for (const k of ks) if (kk.has(k)) hit++;
      if (hit / ks.size >= 0.8 && hit / kk.size >= 0.8) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    lineDefs.push(l);
    keptKeys.push(ks);
  }

  // 依「保留後」的線重建站點代表值（站名／站號／節點 id）
  const metaTally = new Map(); // key → { names:Map(name→count), id, ref }
  for (const l of lineDefs) {
    if (!l.canon) continue;
    for (const s2 of l.canon) {
      const k = keyOf(s2.c);
      let t = metaTally.get(k);
      if (!t) {
        t = { names: new Map(), id: null, ref: null };
        metaTally.set(k, t);
      }
      if (s2.name) t.names.set(s2.name, (t.names.get(s2.name) || 0) + 1);
      if (t.id == null && s2.id != null) t.id = s2.id;
      if (!t.ref && s2.ref) t.ref = s2.ref;
    }
  }

  // 輸出與 taipei/taipei.geojson 同格式的扁平 GeoJSON（way + node，屬性平鋪）
  const features = [];
  for (const l of lineDefs) {
    features.push({
      type: 'Feature',
      properties: {
        route_company: l.routeCompany,
        route_id: l.routeId,
        element_type: 'way',
        color: l.color,
        route_name: l.routeName,
        osm_id: l.osmId,
        railway: l.railway,
      },
      geometry: { type: 'LineString', coordinates: l.latlngs.map(([lat, lng]) => [lng, lat]) },
    });
  }
  for (const [k, t] of metaTally) {
    let bestName = '';
    let bestCnt = -1;
    for (const [nm, cnt] of t.names) if (cnt > bestCnt) ((bestCnt = cnt), (bestName = nm));
    const [lat, lng] = k.split(',').map(Number);
    const osmId = t.id != null ? String(t.id) : '';
    features.push({
      type: 'Feature',
      properties: {
        osm_id: osmId,
        station_name: bestName,
        element_type: 'node',
        station_id: t.ref || osmId,
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
  }

  return { type: 'FeatureCollection', generator: 'fetchMetroRoutes (OpenStreetMap / Overpass, ODbL)', features };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const want = process.argv.slice(2).map((s) => s.toLowerCase());
  const list = want.length ? CITIES.filter((c) => want.includes(c.id)) : CITIES;
  const index = [];
  for (const city of list) {
    process.stdout.write(`抓取 ${city.id} … `);
    try {
      const fc = await fetchCity(city);
      const ways = fc.features.filter((f) => f.properties?.element_type === 'way').length;
      const nodes = fc.features.filter((f) => f.properties?.element_type === 'node').length;
      const file = path.join(OUT_DIR, `${city.id}.geojson`);
      fs.writeFileSync(file, JSON.stringify(fc));
      console.log(`${ways} 條線、${nodes} 站 → ${path.relative(path.join(__dirname, '..'), file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
      index.push({ id: city.id, lines: ways });
    } catch (e) {
      console.log('失敗：', e.message);
    }
    await sleep(6000); // 禮貌性間隔，避免 Overpass 限流
  }
  console.log('\n完成：', index.map((i) => `${i.id}(${i.lines})`).join(', '));

  // 抓完自動跑結構驗證（欄位齊全、重複線、多線合併、node 落線、bbox）
  try {
    const { validateAll } = await import('./validateMetroRoutes.mjs');
    validateAll(want);
  } catch (e) {
    console.log('結構驗證載入失敗：', e.message);
  }
}

// 僅在「直接執行本檔」時抓取；被 validateMetroRoutes 匯入 CITIES 時不執行
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
