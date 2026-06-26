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
 * 在「交點」把路線截斷成段：交點＝座標同時屬於 ≥2 條不同路線(route_name)的頂點。
 * 截斷後交點一律落在線段端點，不會出現「路線中間有紅點」。
 */
export function splitAtConnects(fc) {
  const k = (p) => `${(+p[0]).toFixed(6)},${(+p[1]).toFixed(6)}`;
  const ways = (fc.features || []).filter((f) => f.properties?.element_type === 'way');
  // 只在「轉乘車站(有 node)」處截斷，不在共軌中段的非站點頂點切（否則會暴量）
  const nodeKeys = new Set(
    (fc.features || [])
      .filter((f) => f.properties?.element_type === 'node')
      .map((f) => k(f.geometry.coordinates))
  );
  const rid = (w) => w.properties.route_name || w.properties.route_id || '';
  const coordRoutes = new Map(); // 座標 → 經過的不同路線集合
  for (const w of ways) {
    const r = rid(w);
    const seen = new Set();
    for (const c of w.geometry.coordinates) {
      const kk = k(c);
      if (seen.has(kk)) continue;
      seen.add(kk);
      if (!coordRoutes.has(kk)) coordRoutes.set(kk, new Set());
      coordRoutes.get(kk).add(r);
    }
  }
  const isConnect = (kk) => nodeKeys.has(kk) && (coordRoutes.get(kk)?.size || 0) >= 2;
  const others = (fc.features || []).filter((f) => f.properties?.element_type !== 'way');
  const out = [];
  for (const w of ways) {
    const cs = w.geometry.coordinates;
    let seg = [cs[0]];
    for (let i = 1; i < cs.length; i++) {
      seg.push(cs[i]);
      if (i < cs.length - 1 && isConnect(k(cs[i]))) {
        out.push({ type: 'Feature', properties: { ...w.properties }, geometry: { type: 'LineString', coordinates: seg } });
        seg = [cs[i]];
      }
    }
    if (seg.length >= 2) out.push({ type: 'Feature', properties: { ...w.properties }, geometry: { type: 'LineString', coordinates: seg } });
  }
  fc.features = [...others, ...out];
  return fc;
}

/** 移除孤立 node（座標不在任何 way 頂點上者）——後處理改動 way 後的收尾。 */
export function dropOrphanNodes(fc) {
  const k = (p) => `${(+p[0]).toFixed(6)},${(+p[1]).toFixed(6)}`;
  const vset = new Set();
  for (const f of fc.features || [])
    if (f.properties?.element_type === 'way') for (const c of f.geometry.coordinates) vset.add(k(c));
  fc.features = (fc.features || []).filter(
    (f) => f.properties?.element_type !== 'node' || vset.has(k(f.geometry.coordinates))
  );
  return fc;
}

/**
 * 環線縫合：把同一條環線的多個半環/方向段（route_name 符合同一 pattern）縫成一條完整（盡量閉合）的線，
 * 解決 OSM 把環線拆成 CW/ACW 半環、各停在中段造成「假端點」的問題。
 * patterns: [regex字串]
 */
export function mergeLoopLines(fc, patterns) {
  if (!Array.isArray(patterns) || !patterns.length) return fc;
  const kk = (p) => `${(+p[0]).toFixed(5)},${(+p[1]).toFixed(5)}`;
  for (const pat of patterns) {
    const re = new RegExp(pat);
    const group = fc.features.filter(
      (f) => f.properties?.element_type === 'way' && re.test(f.properties.route_name || '')
    );
    if (!group.length) continue;
    // 每個環取「最長的單向」（即完整一圈），頭尾相接閉合成 ring；其餘（反向等）刪除。
    group.sort((a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length);
    const keep = group[0];
    const cs = keep.geometry.coordinates;
    if (cs.length >= 3 && kk(cs[0]) !== kk(cs[cs.length - 1])) cs.push(cs[0].slice()); // 閉合
    const drop = new Set(group.slice(1));
    if (drop.size) fc.features = fc.features.filter((f) => !drop.has(f));
  }
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
