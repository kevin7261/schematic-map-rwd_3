/**
 * 🌍 探索全世界的地鐵（subway）系統，建立「城市清單」（catalog），供前端三層下拉（洲→國→市）。
 *
 * 只建清單、不抓各城市的完整路線資料；實際路線在使用者按「讀取並畫出」時才即時抓（on-demand）。
 *
 * 流程：
 *   1. 一次全球 Overpass 查詢：所有 route=subway 關聯的 tags + center（不取完整幾何，較小）
 *   2. 依 network/operator 分組成「系統」，算每系統的中心與 bbox
 *   3. 用 Nominatim 反向地理編碼每個系統中心 → 國家、城市；再以 (國,市) 合併多營運商城市
 *      （如東京 Metro＋都営 → 同一個「Tokyo」）；反查結果會快取，重跑很快
 *   4. 國碼 → 洲；輸出 public/data/metro/_catalog.json：[{ id, city, country, continent, bbox }]
 *
 * 執行：node scripts/discoverMetroSystems.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'data', 'metro', '_catalog.json');
const CACHE = path.join(__dirname, '.geocache.json');

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
      if (res.status === 429 || res.status === 504) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(8000 + attempt * 6000);
    }
  }
  throw lastErr;
}

// ISO2 國碼 → 洲別（涵蓋有地鐵的國家；其餘歸 Other）
const ISO_CONTINENT = {
  TW: 'Asia', JP: 'Asia', KR: 'Asia', CN: 'Asia', HK: 'Asia', SG: 'Asia', TH: 'Asia', MY: 'Asia',
  ID: 'Asia', PH: 'Asia', VN: 'Asia', IN: 'Asia', PK: 'Asia', BD: 'Asia', AE: 'Asia', SA: 'Asia',
  QA: 'Asia', KW: 'Asia', IR: 'Asia', IL: 'Asia', TR: 'Asia', UZ: 'Asia', KZ: 'Asia', AZ: 'Asia',
  AM: 'Asia', GE: 'Asia',
  GB: 'Europe', FR: 'Europe', DE: 'Europe', ES: 'Europe', IT: 'Europe', PT: 'Europe', NL: 'Europe',
  BE: 'Europe', AT: 'Europe', CH: 'Europe', SE: 'Europe', NO: 'Europe', DK: 'Europe', FI: 'Europe',
  PL: 'Europe', CZ: 'Europe', HU: 'Europe', RO: 'Europe', BG: 'Europe', GR: 'Europe', RU: 'Europe',
  UA: 'Europe', BY: 'Europe', RS: 'Europe', IE: 'Europe',
  US: 'North America', CA: 'North America', MX: 'North America', PA: 'North America', DO: 'North America',
  PR: 'North America',
  BR: 'South America', AR: 'South America', CL: 'South America', CO: 'South America', PE: 'South America',
  VE: 'South America', EC: 'South America',
  AU: 'Oceania', NZ: 'Oceania',
  EG: 'Africa', ZA: 'Africa', DZ: 'Africa', MA: 'Africa', NG: 'Africa', ET: 'Africa',
};
const CONTINENT_ZH = {
  Asia: '亞洲 Asia',
  Europe: '歐洲 Europe',
  'North America': '北美 North America',
  'South America': '南美 South America',
  Oceania: '大洋洲 Oceania',
  Africa: '非洲 Africa',
  Other: '其他 Other',
};

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache[key]) return cache[key];
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'schematic-map-rwd metro discovery (kevin7261@gmail.com)' },
      });
      if (res.ok) {
        const j = await res.json();
        const a = j.address || {};
        const r = {
          cc: (a.country_code || '').toUpperCase(),
          country: a.country || '',
          city: a.city || a.town || a.municipality || a.state || a.county || '',
        };
        cache[key] = r;
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        await sleep(1100); // Nominatim 使用規範：≤1 req/sec
        return r;
      }
    } catch (e) {
      void e;
    }
    await sleep(2500);
  }
  const empty = { cc: '', country: '', city: '' };
  cache[key] = empty;
  return empty;
}

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

async function main() {
  console.log('1/4 全球查詢 subway 系統…');
  const json = await overpass(`[out:json][timeout:600];relation["route"="subway"];out tags center;`);
  const rels = (json.elements || []).filter((e) => e.type === 'relation' && e.center);
  console.log(`  取得 ${rels.length} 條 subway route 關聯`);

  // 2) 依 network/operator 分組成系統
  const sys = new Map();
  for (const r of rels) {
    const net = (r.tags.network || r.tags.operator || '').trim();
    if (!net) continue;
    let g = sys.get(net);
    if (!g) {
      g = { net, lats: [], lons: [], count: 0 };
      sys.set(net, g);
    }
    g.lats.push(r.center.lat);
    g.lons.push(r.center.lon);
    g.count++;
  }
  const systems = [...sys.values()].map((g) => ({
    net: g.net,
    lat: avg(g.lats),
    lon: avg(g.lons),
    minLat: Math.min(...g.lats),
    maxLat: Math.max(...g.lats),
    minLon: Math.min(...g.lons),
    maxLon: Math.max(...g.lons),
    count: g.count,
  }));
  console.log(`2/4 分組為 ${systems.length} 個 network 系統`);

  // 3) 反向地理編碼 → (國,市) 合併
  console.log('3/4 反向地理編碼（Nominatim，首次較慢、之後讀快取）…');
  let i = 0;
  for (const s of systems) {
    const r = await reverseGeocode(s.lat, s.lon);
    s.cc = r.cc;
    s.country = r.country;
    s.city = r.city;
    if (++i % 25 === 0) console.log(`  ${i}/${systems.length}`);
  }
  const cities = new Map();
  for (const s of systems) {
    const city = s.city || s.net;
    const key = `${s.cc}|${city}`;
    let c = cities.get(key);
    if (!c) {
      c = { cc: s.cc, country: s.country, city, minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity, nets: [], count: 0 };
      cities.set(key, c);
    }
    c.minLat = Math.min(c.minLat, s.minLat);
    c.maxLat = Math.max(c.maxLat, s.maxLat);
    c.minLon = Math.min(c.minLon, s.minLon);
    c.maxLon = Math.max(c.maxLon, s.maxLon);
    c.nets.push(s.net);
    c.count += s.count;
  }

  // 4) 輸出 catalog
  const pad = 0.04;
  const seen = new Set();
  const catalog = [...cities.values()]
    .filter((c) => c.city && Number.isFinite(c.minLat))
    .map((c) => {
      const continent = CONTINENT_ZH[ISO_CONTINENT[c.cc] || 'Other'];
      let id = slug(`${c.cc}-${c.city}`) || slug(c.nets[0]) || `sys-${seen.size}`;
      while (seen.has(id)) id += '-x';
      seen.add(id);
      return {
        id,
        city: c.city,
        country: c.country || c.cc,
        countryCode: c.cc,
        continent,
        bbox: [
          +(c.minLat - pad).toFixed(4),
          +(c.minLon - pad).toFixed(4),
          +(c.maxLat + pad).toFixed(4),
          +(c.maxLon + pad).toFixed(4),
        ],
        lineCount: c.count,
      };
    });
  // 排序：洲 → 國 → 市
  const corder = Object.values(CONTINENT_ZH);
  catalog.sort(
    (a, b) =>
      corder.indexOf(a.continent) - corder.indexOf(b.continent) ||
      a.country.localeCompare(b.country) ||
      a.city.localeCompare(b.city)
  );
  fs.writeFileSync(OUT, JSON.stringify(catalog));
  console.log(`4/4 完成：${systems.length} 系統 → ${catalog.length} 城市 → ${path.relative(path.join(__dirname, '..'), OUT)}`);
  const byCont = {};
  for (const c of catalog) byCont[c.continent] = (byCont[c.continent] || 0) + 1;
  console.log('   洲別分布：', Object.entries(byCont).map(([k, v]) => `${k}:${v}`).join('、'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
