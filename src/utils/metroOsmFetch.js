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
  onProgress('連線 OpenStreetMap（Overpass）…');
  const query = `[out:json][timeout:120];relation["route"~"^(subway|light_rail|monorail)$"](${s},${w},${n},${e})->.r;.r out geom;node(r.r);out tags;node["railway"~"^(station|halt)$"](${s},${w},${n},${e});out;`;
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
      if (t.name) nodeName.set(el.id, t.name);
      if (t.ref) nodeRef.set(el.id, t.ref);
      if (/^(stop|station|halt|tram_stop)$/.test(t.railway || '') || t.public_transport === 'stop_position' || t.station === 'subway')
        stationIds.add(el.id);
    }
  // bbox 內的車站節點（含座標），供「關聯無 stop 成員」時補站點（如 Turin）
  const stationPool = els
    .filter((el) => el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon) && el.tags && /^(station|halt)$/.test(el.tags.railway || ''))
    .map((el) => ({ coord: [round6(el.lat), round6(el.lon)], id: el.id, name: el.tags.name || '', ref: el.tags.ref || '' }));

  const groups = new Map();
  for (const rel of rels) {
    const tags = rel.tags || {};
    if (/[;,/]/.test((tags.ref || '').trim())) continue; // 多線直通合併關聯
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
    const ident = ref || cleanLineName(tags.name) || normColor(tags.colour || tags.color) || 'rel' + rel.id;
    const key = `${(tags.network || '').trim()}|${ident}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        routeCompany: tags.operator || tags.network || '',
        routeId: tags.ref || String(rel.id),
        routeName: tags.name || ref || '',
        osmId: String(rel.id),
        railway: tags.route || 'subway',
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

  const allStops = [];
  for (const p of picked) if (p.stops) for (const st of p.stops) allStops.push(st.coord);
  const snap = allStops.length ? makeStationSnapper(allStops, 250) : null;

  const built = [];
  for (const p of picked) {
    let canon = null;
    let latlngs;
    if (p.stops && snap) {
      canon = p.stops.map((st) => ({ c: snap(st.coord), id: st.id, name: st.name, ref: st.ref }));
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

  // 去除互相高度重疊的線（同線雙向/變體未合併）
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
      properties: { osm_id: osmId, station_name: bestName, element_type: 'node', station_id: t.ref || osmId },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
  }
  return { type: 'FeatureCollection', generator: 'metroOsmFetch (OpenStreetMap / Overpass, ODbL)', features };
}
