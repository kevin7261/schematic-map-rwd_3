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
  const nodes = (fc.features || []).filter((f) => f.properties?.element_type === 'node');
  const byName = new Map();
  for (const n of nodes) {
    const nm = (n.properties.station_name || '').trim();
    if (!nm) continue;
    if (!byName.has(nm)) byName.set(nm, []);
    byName.get(nm).push(n.geometry.coordinates);
  }
  const remap = new Map(); // 舊座標 key → 新（重心）座標
  const nameCoord = new Map(); // 站名 → 新座標
  for (const [nm, coords] of byName) {
    let lon = 0;
    let lat = 0;
    for (const c of coords) {
      lon += c[0];
      lat += c[1];
    }
    const nc = [Math.round((lon / coords.length) * 1e6) / 1e6, Math.round((lat / coords.length) * 1e6) / 1e6];
    nameCoord.set(nm, nc);
    for (const c of coords) remap.set(key(c[0], c[1]), nc);
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
  // 每個站名只留一個 node（置於重心）
  const kept = new Map();
  const others = [];
  for (const f of fc.features || []) {
    if (f.properties?.element_type === 'node') {
      const nm = (f.properties.station_name || '').trim();
      if (!nm || kept.has(nm)) continue;
      f.geometry.coordinates = nameCoord.get(nm);
      kept.set(nm, f);
    } else others.push(f);
  }
  fc.features = [...others, ...kept.values()];
  return fc;
}
