/**
 * 🌐 瀏覽器端「即時抓取」單一城市地鐵路線（on-demand）。
 *
 * 使用者在三層下拉選好城市、按「讀取並畫出」時呼叫；用城市 bbox 即時查 Overpass，
 * 在前端就地處理成與 taipei.geojson 同格式的扁平 GeoJSON（way/node + route_*／station_* tags）。
 * 與 scripts/fetchMetroRoutes.mjs 同一套邏輯：依路線身分分組、單向取代表、轉乘站分群、
 * 去除重複線與多線合併關聯，站名／站號用真實 OSM 值。
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, onProgress) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      if (onProgress && attempt > 0) onProgress(`重試 Overpass（第 ${attempt + 1} 次）…`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(2500 + attempt * 2500);
    }
  }
  throw lastErr || new Error('Overpass 連線失敗');
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const keyOf = (c) => `${(+c[0]).toFixed(6)},${(+c[1]).toFixed(6)}`;

const normColor = (c) => {
  if (!c || typeof c !== 'string') return null;
  const s = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  return null;
};

const FALLBACK_PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#1ca8c9', '#f032e6',
  '#9a6324', '#469990', '#800000', '#000075', '#808000', '#e377c2', '#7f7f7f',
];

const cleanLineName = (name) =>
  String(name || '')
    .replace(/[（(][^（()）]*[)）]\s*$/g, '')
    .replace(/\s*[：:].*$/g, '')
    .replace(/\s*[-–—]?\s*(順行|逆行|外環|內環|clockwise|anti-?clockwise|outbound|inbound|outer|inner)\b.*$/gi, '')
    .trim();

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

function stitchWays(ways) {
  const k5 = (lat, lng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
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
      const hk = k5(head[0], head[1]);
      const tk = k5(tail[0], tail[1]);
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const s = segs[j];
        const sStart = k5(s[0][0], s[0][1]);
        const sEnd = k5(s[s.length - 1][0], s[s.length - 1][1]);
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

/** 把點投影到折線：回傳 { pos（沿線累距）, perp（垂距，度） } */
function projectPolyline(latlngs, p) {
  let best = null;
  let cum = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = latlngs[i];
    const b = latlngs[i + 1];
    const vx = b[1] - a[1];
    const vy = b[0] - a[0];
    const len2 = vx * vx + vy * vy;
    let t = len2 ? ((p[1] - a[1]) * vx + (p[0] - a[0]) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a[1] + t * vx;
    const cy = a[0] + t * vy;
    const perp = Math.hypot(p[1] - cx, p[0] - cy);
    if (!best || perp < best.perp) best = { pos: cum + Math.hypot(cy - a[0], cx - a[1]), perp };
    cum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return best;
}

const dedupeConsecutive = (pts) => {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
};

/**
 * 即時抓取某城市（以 bbox 界定）的地鐵路線，回傳扁平 GeoJSON（way/node）。
 * @param {[number,number,number,number]} bbox [south, west, north, east]
 * @param {{ onProgress?: (msg:string)=>void }} [opts]
 * @returns {Promise<{type:'FeatureCollection', features:object[]}>}
 */
export async function fetchMetroGeojsonByBbox(bbox, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const [s, w, n, e] = bbox;
  // 🚇 僅保留特定營運者（per-city 設定，如東京只留東京メトロ＋都營兩家地鐵公司）：
  //    僅對「營運中(open)」路線生效；施工/計畫線（刻意納入、常無營運者標記）不受此限。
  const keepOps = opts.keepOperators ? new RegExp(opts.keepOperators) : null;
  // 🎨 官方配色（per-city）：依 route_name 套色，首個符合者勝；施工/計畫線藉此繼承母線色。
  const colorRules = Array.isArray(opts.colorByName)
    ? opts.colorByName.map((r) => ({ re: new RegExp(r.match), color: r.color }))
    : [];
  const colorFor = (name, fallback) => {
    for (const r of colorRules) if (r.re.test(name || '')) return r.color;
    return fallback;
  };
  // 🎨 官方配色（per-city，依 route_id 精準套色；優先於 colorByName／OSM colour／fallback）：
  //    route_id（線代號，如 R/BR/1/M5）比 route_name 穩定，避免重生成時官方色被調色盤蓋掉。
  const colorByIdMap =
    opts.colorById && typeof opts.colorById === 'object' ? opts.colorById : null;
  const colorOf = (routeId, name, fallback) => {
    if (colorByIdMap && routeId != null && colorByIdMap[String(routeId)])
      return colorByIdMap[String(routeId)];
    return colorFor(name, fallback);
  };
  // 🧹 同名變體去重（per-city）：同一 regex family 只保留座標點最多者
  const dedupeRules = Array.isArray(opts.dedupeByName) ? opts.dedupeByName.map((s) => new RegExp(s)) : [];
  // 🚫 剔除符合者（per-city）：依 route_company 或 route_name 比對，剔除鄰市誤抓線（如佛山的廣州地鐵）。
  const dropRe = opts.dropByName ? new RegExp(opts.dropByName) : null;
  // 🗑️ 全域雜訊過濾：depot/車輛段、機場旅客捷運(APM)、纜車/索道、動物園單軌、空白或單字名。
  const NOISE_RE = /機廠|车辆段|車輛段|車庫|车库|depot|旅客捷運|旅客自動|Automated People Mover|People Mover|纜車|缆车|索道|cable car|funicular|動物園|动物园|Wild Asia|APM|Capitol Subway|Dirksen|Russell Line|Rayburn|華為|华为|松山湖/i;
  const isDrop = (company, name) => {
    const c = company || '';
    const nm = (name || '').trim();
    if (dropRe && (dropRe.test(c) || dropRe.test(nm))) return true;
    if (!nm || nm.length <= 1) return true; // 空白或單字（如 "G"）
    if (NOISE_RE.test(nm)) return true;
    return false;
  };
  // 🇨🇳 繁體優先：中國等地 OSM 多為簡體 name，若有 name:zh-Hant/zh-TW 則優先採用（符合「全繁體」規範）。
  const nameOf = (tags) =>
    (tags &&
      (tags['name:zh-Hant'] || tags['name:zh-hant'] || tags['name:zh-TW'] || tags['name:zh_Hant'])) ||
    (tags && tags.name) ||
    '';
  // 🚆 特別納入指定的鐵道(route=train)路線（per-city，如東京要含 JR 山手線/中央線）：
  //    這些線名符合者強制納入，繞過跨境/直通/營運者白名單等過濾。
  const includeRe = opts.includeRail ? new RegExp(opts.includeRail) : null;
  // 🎯 只保留線名符合者（per-city）：用於「單線城市」（如りんかい線、ゆりかもめ、PATH、桃園），
  //    其 bbox 會誤含整個都會網，故只留該線本身。
  const onlyRe = opts.onlyLineName ? new RegExp(opts.onlyLineName) : null;
  // 🗺️ 地理裁切（per-city）：營運線若多數頂點落在 bbox 外即剔除。用於緊鄰城市群（如佛山↔廣州），
  //    鄰市線名/營運者無城市標記、name-based 過濾抓不到時，以地理範圍剔除。需搭配收緊 bbox。
  onProgress('連線 OpenStreetMap（Overpass）…');
  // 含營運中（subway/light_rail/monorail）＋施工中（route=construction）＋計畫中（route=proposed）的同類路線；
  // 施工／計畫的實際模式記在 construction:route／proposed:route。
  const modeRe = '^(subway|light_rail|monorail)$';
  // 只抓「營運中」路線（route=subway/light_rail/monorail）；未完工（construction/proposed）不畫。
  // includeRail 可額外納入指定的 route=train 線（如東京 JR 山手線/中央線）。
  const query =
    `[out:json][timeout:120];(` +
    `relation["route"~"${modeRe}"](${s},${w},${n},${e});` +
    (opts.includeRail
      ? `relation["route"="train"]["name"~"${opts.includeRail}"](${s},${w},${n},${e});`
      : '') +
    `)->.r;.r out geom;node(r.r);out tags;` +
    `node["railway"~"^(station|halt)$"](${s},${w},${n},${e});out;`;
  const json = await overpass(query, onProgress);
  onProgress('處理路線資料…');

  const els = json.elements || [];
  const rels = els.filter((el) => el.type === 'relation');
  const nodeName = new Map();
  const nodeRef = new Map();
  const stationIds = new Set(); // 被標為車站/停靠點的 node（供無 stop 角色的舊式關聯補抓站點）
  for (const el of els)
    if (el.type === 'node' && el.tags) {
      const t = el.tags;
      const nm = nameOf(t);
      if (nm) nodeName.set(el.id, nm);
      if (t.ref) nodeRef.set(el.id, t.ref);
      if (/^(stop|station|halt|tram_stop)$/.test(t.railway || '') || t.public_transport === 'stop_position' || t.station === 'subway')
        stationIds.add(el.id);
    }
  // bbox 內的車站節點（含座標），供「關聯無 stop 成員」時補站點（如 Turin）
  const stationPool = els
    .filter((el) => el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon) && el.tags && /^(station|halt)$/.test(el.tags.railway || ''))
    .map((el) => ({ coord: [round6(el.lat), round6(el.lon)], id: el.id, name: nameOf(el.tags), ref: el.tags.ref || '' }));

  // 🌏 跨境過濾（以 network/operator 為單位）：bbox 邊緣可能與鄰境系統重疊（如載香港時 bbox
  //    北緣與深圳相接，會把深圳地鐵抓進來）。把同一 network 的所有成員座標取重心，重心落在
  //    bbox 外者整個 network 視為「鄰境系統」剔除；以 network 為單位可避免誤砍跨界的單一路線。
  //    註：若本地線重心剛好落在界外一點（如台北淡海輕軌），請以 per-city bbox 覆寫放寬該邊界。
  const inBbox = (lat, lng) => lat >= s && lat <= n && lng >= w && lng <= e;
  const netAgg = new Map();
  const netKeyOf = (tags) => (tags.network || tags.operator || '').trim();
  for (const rel of rels) {
    const k = netKeyOf(rel.tags || {});
    if (!k) continue; // 無 network/operator 者不參與整組剔除，交由後續個別處理
    let a = netAgg.get(k);
    if (!a) {
      a = { sumLat: 0, sumLng: 0, count: 0 };
      netAgg.set(k, a);
    }
    for (const m of rel.members || []) {
      if (m.type === 'node' && Number.isFinite(m.lat)) {
        a.sumLat += m.lat;
        a.sumLng += m.lon;
        a.count++;
      } else if (m.type === 'way' && Array.isArray(m.geometry)) {
        for (const g of m.geometry) {
          a.sumLat += g.lat;
          a.sumLng += g.lon;
          a.count++;
        }
      }
    }
  }
  const foreignNets = new Set();
  for (const [k, a] of netAgg)
    if (a.count && !inBbox(a.sumLat / a.count, a.sumLng / a.count)) foreignNets.add(k);

  // 🇯🇵 直通運轉剔除（主要針對東京等日本都市）：地鐵與私鐵/JR 的「相互直通運転」關聯會把
  //    路線延伸到遠郊私鐵段，使「地鐵線」變成 30~78km 的怪物。核心地鐵線在 OSM 另有乾淨的
  //    單獨關聯，故把直通關聯整個剔除。以日文 token 判定，不影響他國資料。
  const JP_METRO_OP = /(東京メトロ|東京地下鉄|Tokyo Metro|都営|東京都交通局|Toei|大阪メトロ|Osaka Metro|名古屋市|横浜市営|札幌市|京都市|神戸市|福岡市|仙台市)/;
  const JP_PRIVATE = /(京成|京急|京浜|東武|東急|西武|小田急|相鉄|京王|埼玉高速|東葉|北総|新京成|東京臨海|りんかい)/;
  const isThroughRun = (tags) => {
    const name = `${tags.name || ''}`;
    const op = `${tags.operator || ''}`;
    const net = `${tags.network || ''}`;
    if (/(直通|快特|快速特急|エアポート快|S-Train|Sトレイン)/.test(name)) return true; // 直通運転／直通之機場快特・特急服務種別
    if ((/;/.test(op) || /;/.test(net)) && JP_METRO_OP.test(`${op};${net}`)) return true; // 多營運商合併（含日本地鐵業者）
    if (/(都営|メトロ|地下鉄)/.test(name) && JP_PRIVATE.test(name)) return true; // 名稱同時含地鐵線與私鐵
    if (/旅客鉄道/.test(op) && !JP_METRO_OP.test(op)) return true; // 純 JR（非地鐵），多為直通進地鐵之 JR 段
    return false;
  };

  // 🚧 未通車（施工中／計畫中／停用）判定：OSM 常把「尚未通車」之線提早標成 route=subway，
  //    僅靠 route 值擋不掉。改以生命週期狀態 / 開通日期 / 名稱字樣綜合判定，所有城市一律剔除。
  const isUnopened = (tags) => {
    const t = tags || {};
    const lc = (v) => String(v == null ? '' : v).toLowerCase();
    if (/^(construction|proposed|planned|disused|abandoned|razed|dismantled|razing)$/.test(lc(t.state)))
      return true;
    if (t.construction || t.proposed || t.planned) return true; // construction=yes / proposed=yes 等
    if (/^(construction|proposed|disused|abandoned)$/.test(lc(t.railway))) return true;
    if (lc(t.route) === 'construction' || lc(t.route) === 'proposed') return true;
    if (t['construction:route'] || t['proposed:route'] || t['disused:route']) return true; // lifecycle 前綴
    if (lc(t.subway) === 'construction' || lc(t.light_rail) === 'construction') return true;
    // 名稱含未通車字樣（中／英／日）
    if (
      /(施工|建設中|建设中|興建|在建|未開業|未通車|未通车|計畫|計划|計画|規劃|规划|under\s*construction|proposed|planned|future|opening|u\/c)/i.test(
        `${nameOf(t)} ${t.name || ''} ${t.description || ''}`
      )
    )
      return true;
    // 開通日期在未來（opening_date / start_date）
    const futureDate = (v) => {
      const m = String(v || '').match(/^(\d{4})(?:-(\d{1,2}))?/);
      if (!m) return false;
      const od = new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1).getTime();
      return Number.isFinite(od) && od > Date.now();
    };
    if (futureDate(t.opening_date) || futureDate(t['opening_date:subway'])) return true;
    return false;
  };

  const groups = new Map();
  for (const rel of rels) {
    const tags = rel.tags || {};
    // 指定 JR 線強制納入，但仍排除「直通運転」等延伸變體
    const forceInclude = includeRe ? includeRe.test(nameOf(tags)) && !/直通/.test(nameOf(tags)) : false;
    if (isUnopened(tags)) continue; // 🚧 未通車路線：所有城市一律不畫（forceInclude 也不例外）
    if (!forceInclude && foreignNets.has(netKeyOf(tags))) continue; // 鄰境系統（如載香港時的深圳地鐵）
    if (!forceInclude && /[;,/]/.test((tags.ref || '').trim())) continue; // 多線直通合併關聯
    if (!forceInclude && isThroughRun(tags)) continue; // 與私鐵/JR 直通運轉之路段
    const stops = (rel.members || [])
      .filter(
        (m) =>
          m.type === 'node' &&
          Number.isFinite(m.lat) &&
          Number.isFinite(m.lon) &&
          !/platform/i.test(m.role || '') &&
          (/^stop/i.test(m.role || '') || stationIds.has(m.ref))
      )
      .map((m) => ({ coord: [round6(m.lat), round6(m.lon)], id: m.ref, name: nodeName.get(m.ref) || '', ref: nodeRef.get(m.ref) || '' }));
    const ways = (rel.members || [])
      .filter((m) => m.type === 'way' && Array.isArray(m.geometry) && !/platform|stop|station/i.test(m.role || ''))
      .map((m) => m.geometry.map((g) => [round6(g.lat), round6(g.lon)]));
    if (!stops.length && !ways.length) continue;

    const ref = (tags.ref || '').trim();
    const relName = nameOf(tags);
    const ident = ref || cleanLineName(relName) || normColor(tags.colour || tags.color) || 'rel' + rel.id;
    const key = `${(tags.network || '').trim()}|${ident}`;
    // 施工／計畫路線：實際模式在 construction:route／proposed:route；並記 status 供前端區分樣式
    const status =
      tags.route === 'construction'
        ? 'construction'
        : tags.route === 'proposed'
          ? 'proposed'
          : 'open';
    const mode =
      tags.route === 'construction'
        ? tags['construction:route'] || 'subway'
        : tags.route === 'proposed'
          ? tags['proposed:route'] || 'subway'
          : tags.route || 'subway';
    let g = groups.get(key);
    if (!g) {
      g = {
        routeCompany: tags.operator || tags.network || '',
        routeId: tags.ref || String(rel.id),
        routeName: relName || ref || '',
        osmId: String(rel.id),
        railway: mode,
        status,
        forceInclude,
        colorRaw: null,
        rels: [],
      };
      groups.set(key, g);
    }
    g.rels.push({ stops, ways });
    if (!g.colorRaw) g.colorRaw = tags.colour || tags.color || null;
  }

  const picked = [];
  let colorIdx = 0;
  for (const g of groups.values()) {
    let bestStops = null;
    let bestWays = null;
    for (const r of g.rels)
      if (r.stops.length >= 2 && (!bestStops || r.stops.length > bestStops.length)) {
        bestStops = r.stops;
        bestWays = r.ways; // 同一關聯的軌道幾何，供站序依路徑投影排序
      }
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
    picked.push({ ...g, color, stops: bestStops, stopsWays: bestWays, geom: geomFallback });
  }

  const allStops = [];
  for (const p of picked) if (p.stops) for (const st of p.stops) allStops.push(st.coord);
  const snap = allStops.length ? makeStationSnapper(allStops, 250) : null;

  const built = [];
  for (const p of picked) {
    let canon = null;
    let latlngs;
    if (p.stops && snap) {
      let stops = p.stops;
      // 站序修正：用同關聯的軌道幾何縫成路徑，依各站在路徑上的位置重新排序，修正 OSM stop 成員順序錯置
      const path = p.stopsWays ? stitchWays(p.stopsWays).sort((a, b) => b.length - a.length)[0] : null;
      if (path && path.length >= 2) {
        const proj = stops.map((st) => {
          const pr = projectPolyline(path, st.coord);
          return { st, pos: pr ? pr.pos : Infinity, perp: pr ? pr.perp : Infinity };
        });
        // 僅當多數站都能良好投影到路徑（垂距小）才採用投影排序，避免路徑不全時打亂正確順序
        const good = proj.filter((x) => x.perp < 0.003).length;
        if (good >= stops.length * 0.8) {
          proj.sort((a, b) => a.pos - b.pos);
          stops = proj.map((x) => x.st);
        }
      }
      canon = stops.map((st) => ({ c: snap(st.coord), id: st.id, name: st.name, ref: st.ref }));
      latlngs = dedupeConsecutive(canon.map((s2) => s2.c));
    } else if (p.geom) {
      // 關聯沒有 stop 成員：把落在此線上的鄰近車站節點當站點（依沿線位置排序）
      const on = [];
      for (const st of stationPool) {
        const pr = projectPolyline(p.geom, st.coord);
        if (pr && pr.perp < 0.0025) on.push({ ...st, pos: pr.pos });
      }
      on.sort((a, b) => a.pos - b.pos);
      if (on.length >= 2) {
        canon = on.map((st) => ({ c: st.coord, id: st.id, name: st.name, ref: st.ref }));
        latlngs = dedupeConsecutive(canon.map((s2) => s2.c));
      } else {
        latlngs = p.geom;
      }
    } else {
      continue;
    }
    if (!latlngs || latlngs.length < 2) continue;
    built.push({ ...p, latlngs, canon });
  }
  if (!built.length) return { type: 'FeatureCollection', generator: 'metroOsmFetch (OSM/Overpass, ODbL)', features: [] };

  // 🔗 同名車站合併：同一 station_name 視為同一站，只保留一個點。把各線上同名站的座標一律改為
  //    「最佳位置」＝所有同名出現點的重心（centroid），讓多線在此相接於單一交點、且僅產生一個站點。
  const byName = new Map();
  for (const l of built) {
    if (!l.canon) continue;
    for (const st of l.canon) {
      const nm = (st.name || '').trim();
      if (!nm) continue;
      let arr = byName.get(nm);
      if (!arr) {
        arr = [];
        byName.set(nm, arr);
      }
      arr.push(st.c);
    }
  }
  const nameToCoord = new Map();
  for (const [nm, coords] of byName) {
    const cen = coords.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
    nameToCoord.set(nm, [round6(cen[0] / coords.length), round6(cen[1] / coords.length)]);
  }
  for (const l of built) {
    if (!l.canon) continue;
    for (const st of l.canon) {
      const nm = (st.name || '').trim();
      if (nm && nameToCoord.has(nm)) st.c = nameToCoord.get(nm);
    }
    l.latlngs = dedupeConsecutive(l.canon.map((s2) => s2.c));
  }

  // 去除互相高度重疊的線（同線雙向/變體未合併）
  built.sort((a, b) => b.latlngs.length - a.latlngs.length);
  const lineDefs = [];
  const keptKeys = [];
  for (const l of built) {
    // per-city 營運者白名單（須在建站點前過濾，否則被剔線的站點會變孤立 node）：
    // 營運中路線須為允許之營運者；施工/計畫線不受限
    if (keepOps && (l.status || 'open') === 'open' && !keepOps.test(l.routeCompany || '') && !l.forceInclude)
      continue;
    if (!l.forceInclude && isDrop(l.routeCompany, l.routeName)) continue; // 鄰市誤抓線 / 雜訊 / 空名
    if (onlyRe && !onlyRe.test(l.routeName || '')) continue; // 單線城市：只留指定線
    // 地理裁切：營運線多數頂點在 bbox 外 → 鄰市線，剔除（施工/計畫線與 forceInclude 不受限）
    if (opts.clipToBbox && (l.status || 'open') === 'open' && !l.forceInclude) {
      const inN = l.latlngs.filter((c) => inBbox(c[0], c[1])).length;
      if (inN / l.latlngs.length < 0.5) continue;
    }
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

  const metaTally = new Map();
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

  const features = [];
  for (const l of lineDefs) {
    features.push({
      type: 'Feature',
      properties: {
        route_company: l.routeCompany,
        route_id: l.routeId,
        element_type: 'way',
        color: colorOf(l.routeId, l.routeName, l.color),
        route_name: l.routeName,
        osm_id: l.osmId,
        railway: l.railway,
        status: l.status || 'open',
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
    const stationId = t.ref || osmId;
    // 每個站點必須有 station_name 與 station_id；缺任一者不輸出該站（線仍照常穿過）
    if (!bestName || !stationId) continue;
    features.push({
      type: 'Feature',
      properties: { osm_id: osmId, station_name: bestName, element_type: 'node', station_id: stationId },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
  }
  // 🚧 施工／計畫路線（way 層級、無 route 關聯）：依名稱／ref 分組 → 縫合 → 取最長鏈 → 簡化。
  //    丟掉過短鏈（剪式橫渡線、引道等碎段）與重心落在 bbox 外者；與既有線高度重疊者視為重複剔除。
  const cpWays = els.filter(
    (el) => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2 && el.tags
  );
  const cpGroups = new Map();
  for (const wy of cpWays) {
    const t = wy.tags;
    const mode = t.construction || t.proposed || '';
    if (!/^(subway|light_rail|monorail)$/.test(mode)) continue;
    const cpName = nameOf(t);
    const ident = cleanLineName(cpName) || (t.ref || '').trim();
    if (!ident) continue; // 無名無 ref 的碎段（多為橫渡線／引道）→ 略過
    if (isDrop(t.operator || '', cpName)) continue; // 鄰市誤抓的施工/計畫線 / 雜訊
    if (onlyRe && !onlyRe.test(cpName)) continue; // 單線城市：只留指定線
    let g = cpGroups.get(ident);
    if (!g) {
      g = { name: cpName || t.ref || '', ref: (t.ref || '').trim(), status: t.railway, railway: mode, firstId: wy.id, ways: [] };
      cpGroups.set(ident, g);
    }
    g.ways.push(wy.geometry.map((p) => [round6(p.lat), round6(p.lon)]));
  }
  // 以「鄰近既有折線」判重（OSM 常把同一條計畫線以不同名稱／階段重複描繪，頂點不吻合但走向相同）：
  // 若候選鏈多數頂點落在已保留折線 ~66m 內，視為同線剔除。種子為營運／施工關聯線，逐條累加。
  const keptPolylines = lineDefs.map((l) => l.latlngs);
  const coveredFrac = (chain, polys) => {
    if (!polys.length) return 0;
    let hit = 0;
    for (const p of chain) {
      for (const pl of polys) {
        const pr = projectPolyline(pl, p);
        if (pr && pr.perp < 0.0006) {
          hit++;
          break;
        }
      }
    }
    return hit / chain.length;
  };
  let pIdx = lineDefs.length;
  // 較長者先處理，讓完整版優先保留、短變體被判為重複
  const cpSorted = [...cpGroups.values()].sort((a, b) => b.ways.length - a.ways.length);
  for (const g of cpSorted) {
    let best = null;
    let bl = -1;
    for (const c of stitchWays(g.ways)) if (lineLenDeg(c) > bl) ((bl = lineLenDeg(c)), (best = c));
    if (!best) continue;
    const chain = simplify(best, 0.0006);
    if (chain.length < 2 || lineLenDeg(chain) < 0.008) continue; // 過短（≲0.9km）→ 碎段，略過
    const cen = chain.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map((v) => v / chain.length);
    if (!inBbox(cen[0], cen[1])) continue; // 重心在 bbox 外 → 鄰境的計畫線
    if (coveredFrac(chain, keptPolylines) >= 0.6) continue; // 與既有線走向重複（如萬大線多版本）
    keptPolylines.push(chain);
    features.push({
      type: 'Feature',
      properties: {
        route_company: '',
        route_id: g.ref || String(g.firstId),
        element_type: 'way',
        color: colorOf(g.ref, g.name, FALLBACK_PALETTE[pIdx % FALLBACK_PALETTE.length]),
        route_name: g.name,
        osm_id: String(g.firstId),
        railway: g.railway,
        status: g.status === 'proposed' ? 'proposed' : 'construction',
      },
      geometry: { type: 'LineString', coordinates: chain.map(([lat, lng]) => [lng, lat]) },
    });
    pIdx += 1;
  }

  // 🧹 同名變體去重：同一 family（regex）的 way 只保留座標點最多者；再清掉因此孤立的 node
  let finalFeatures = features;
  if (dedupeRules.length) {
    const wayFeats = features.filter((f) => f.properties.element_type === 'way');
    const drop = new Set();
    for (const re of dedupeRules) {
      const grp = wayFeats.filter((f) => re.test(f.properties.route_name || ''));
      if (grp.length <= 1) continue;
      grp.sort((a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length);
      for (let i = 1; i < grp.length; i++) drop.add(grp[i]);
    }
    if (drop.size) {
      finalFeatures = features.filter((f) => !drop.has(f));
      const wayKeys = new Set();
      for (const f of finalFeatures)
        if (f.properties.element_type === 'way')
          for (const c of f.geometry.coordinates) wayKeys.add(keyOf([c[1], c[0]]));
      finalFeatures = finalFeatures.filter(
        (f) =>
          f.properties.element_type !== 'node' ||
          wayKeys.has(keyOf([f.geometry.coordinates[1], f.geometry.coordinates[0]]))
      );
    }
  }

  return {
    type: 'FeatureCollection',
    generator: 'metroOsmFetch (OpenStreetMap / Overpass, ODbL)',
    features: finalFeatures,
  };
}
