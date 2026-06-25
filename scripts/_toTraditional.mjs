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
