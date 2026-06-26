/**
 * 簡→繁轉換（僅中國大陸城市）：中國大陸 OSM 多為簡體，依「全繁體」規範轉為繁體。
 * 港澳台、日本等請勿轉換（會誤改日文漢字，如 広島→廣島）。
 */
import OpenCC from 'opencc-js';

const conv = OpenCC.Converter({ from: 'cn', to: 'tw' });

/** 是否為需要簡轉繁的中國大陸城市（排除港澳） */
export function isMainlandChina(city) {
  return !!city && city.country === 'China' && !['china-hong-kong', 'china-macau'].includes(city.id);
}

/** 將 GeoJSON 內的線名/站名/營運者轉為繁體（就地修改並回傳） */
export function convertFcToTraditional(fc) {
  for (const f of fc.features || []) {
    const p = f.properties || {};
    if (p.route_name) p.route_name = conv(p.route_name);
    if (p.station_name) p.station_name = conv(p.station_name);
    if (p.route_company) p.route_company = conv(p.route_company);
  }
  return fc;
}

/**
 * 同名車站合併（最終保險，於簡→繁之後執行）：相同 station_name 一律合併到所有出現點的重心，
 * 各線經過該站的座標一律改為此點 → 不會出現「附近同名車站卻沒共點」。每個站名只留一個 node。
 * 在簡→繁之後跑，可同時解決「一線標簡體、一線標繁體」轉換後同名卻不共點的情況。
 */
export function mergeSameNameStations(fc) {
  const key = (lon, lat) => `${(+lon).toFixed(6)},${(+lat).toFixed(6)}`;
  // 正規化分組鍵：把常見異體字視為同字（臺=台、塩=鹽…），避免「臺北車站/台北車站」沒合併
  const normName = (s) =>
    String(s || '')
      .trim()
      .replace(/臺/g, '台')
      .replace(/塩/g, '鹽')
      .replace(/\s+/g, '');
  const nodes = (fc.features || []).filter((f) => f.properties?.element_type === 'node');
  const byKey = new Map(); // 正規化鍵 → { coords:[], names:Map(原名→次數) }
  for (const n of nodes) {
    const nm = (n.properties.station_name || '').trim();
    if (!nm) continue;
    const nk = normName(nm);
    let g = byKey.get(nk);
    if (!g) {
      g = { coords: [], names: new Map() };
      byKey.set(nk, g);
    }
    g.coords.push(n.geometry.coordinates);
    g.names.set(nm, (g.names.get(nm) || 0) + 1);
  }
  const remap = new Map(); // 舊座標 key → 新（重心）座標
  const nameCoord = new Map(); // 正規化鍵 → 新座標
  const keyToName = new Map(); // 正規化鍵 → 顯示用站名（取最常見之原名）
  for (const [nk, g] of byKey) {
    let lon = 0;
    let lat = 0;
    for (const c of g.coords) {
      lon += c[0];
      lat += c[1];
    }
    const nc = [
      Math.round((lon / g.coords.length) * 1e6) / 1e6,
      Math.round((lat / g.coords.length) * 1e6) / 1e6,
    ];
    nameCoord.set(nk, nc);
    let best = '';
    let bc = -1;
    for (const [nm, c] of g.names) if (c > bc) ((bc = c), (best = nm));
    keyToName.set(nk, best);
    for (const c of g.coords) remap.set(key(c[0], c[1]), nc);
  }
  // 改寫各線座標：經過同名站處一律改為該站重心，並去除連續重複點
  for (const f of fc.features || []) {
    if (f.properties?.element_type !== 'way') continue;
    const out = [];
    for (const c of f.geometry.coordinates) {
      const nc = remap.get(key(c[0], c[1])) || c;
      const last = out[out.length - 1];
      if (!last || last[0] !== nc[0] || last[1] !== nc[1]) out.push(nc);
    }
    f.geometry.coordinates = out;
  }
  // 每個（正規化）站名只留一個 node（置於重心），並統一顯示名為最常見之原名
  const kept = new Map();
  const others = [];
  for (const f of fc.features || []) {
    if (f.properties?.element_type === 'node') {
      const nm = (f.properties.station_name || '').trim();
      if (!nm) continue;
      const nk = normName(nm);
      if (kept.has(nk)) continue;
      f.geometry.coordinates = nameCoord.get(nk);
      f.properties.station_name = keyToName.get(nk) || nm;
      kept.set(nk, f);
    } else others.push(f);
  }
  fc.features = [...others, ...kept.values()];
  return fc;
}

/**
 * 手動補站（OSM 缺漏時用）：把指定站點加入並接到某條線的最近端點延伸出去。
 * extras: [{ name, coord:[lon,lat], attachTo:'<route_name regex>' }]
 */
export function addExtraStations(fc, extras) {
  if (!Array.isArray(extras) || !extras.length) return fc;
  const ways = (fc.features || []).filter((f) => f.properties?.element_type === 'way');
  for (const ex of extras) {
    const [lon, lat] = ex.coord;
    fc.features.push({
      type: 'Feature',
      properties: { osm_id: '', station_name: ex.name, element_type: 'node', station_id: 'manual-' + ex.name },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
    if (!ex.attachTo) continue;
    const re = new RegExp(ex.attachTo);
    let best = null;
    let bd = Infinity;
    let bend = 0;
    for (const w of ways) {
      if (!re.test(w.properties.route_name || '')) continue;
      const cs = w.geometry.coordinates;
      for (const ei of [0, cs.length - 1]) {
        const e = cs[ei];
        const d = Math.hypot(e[0] - lon, e[1] - lat);
        if (d < bd) {
          bd = d;
          best = w;
          bend = ei;
        }
      }
    }
    if (best) {
      if (bend === 0) best.geometry.coordinates.unshift([lon, lat]);
      else best.geometry.coordinates.push([lon, lat]);
    }
  }
  return fc;
}
