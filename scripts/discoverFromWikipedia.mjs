/**
 * 🌍📖 以 Wikipedia「List of metro systems」為權威清單，建立全球城市 catalog（洲→國→市）。
 *
 * 只建清單（city, country, continent, bbox）；實際路線在前端按「讀取並畫出」才即時抓。
 * 流程：
 *   1. 取 Wikipedia 該頁 wikitext（API），解析主表的 City／Country（Country 欄為 rowspan，需沿用）
 *   2. 國家 → 洲（內建對照表）
 *   3. 每個「City, Country」用 Nominatim 查 bbox（boundingbox），夾到合理大小；結果快取
 *   4. 輸出 public/data/metro/_catalog.json
 *
 * 執行：node scripts/discoverFromWikipedia.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'data', 'metro', '_catalog.json');
const CACHE = path.join(__dirname, '.geocache.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COUNTRY_CONTINENT = {
  // 亞洲
  Armenia: 'Asia', Azerbaijan: 'Asia', Bangladesh: 'Asia', China: 'Asia', Georgia: 'Asia',
  India: 'Asia', Indonesia: 'Asia', Iran: 'Asia', Japan: 'Asia', Kazakhstan: 'Asia',
  Malaysia: 'Asia', 'North Korea': 'Asia', Pakistan: 'Asia', Philippines: 'Asia', Qatar: 'Asia',
  'Saudi Arabia': 'Asia', Singapore: 'Asia', 'South Korea': 'Asia', Taiwan: 'Asia', Thailand: 'Asia',
  Turkey: 'Asia', 'United Arab Emirates': 'Asia', Uzbekistan: 'Asia', Vietnam: 'Asia',
  // 歐洲
  Austria: 'Europe', Belarus: 'Europe', Belgium: 'Europe', Bulgaria: 'Europe', 'Czech Republic': 'Europe',
  Denmark: 'Europe', Finland: 'Europe', France: 'Europe', Germany: 'Europe', Greece: 'Europe',
  Hungary: 'Europe', Italy: 'Europe', Netherlands: 'Europe', Norway: 'Europe', Poland: 'Europe',
  Portugal: 'Europe', Romania: 'Europe', Russia: 'Europe', Spain: 'Europe', Sweden: 'Europe',
  Switzerland: 'Europe', Ukraine: 'Europe', 'United Kingdom': 'Europe',
  // 北美
  Canada: 'North America', 'Dominican Republic': 'North America', Mexico: 'North America',
  Panama: 'North America', 'United States': 'North America',
  // 南美
  Argentina: 'South America', Brazil: 'South America', Chile: 'South America', Colombia: 'South America',
  Ecuador: 'South America', Peru: 'South America', Venezuela: 'South America',
  // 大洋洲
  Australia: 'Oceania',
  // 非洲
  Algeria: 'Africa', Egypt: 'Africa', Nigeria: 'Africa',
};
const CONTINENT_ZH = {
  Asia: '亞洲 Asia', Europe: '歐洲 Europe', 'North America': '北美 North America',
  'South America': '南美 South America', Oceania: '大洋洲 Oceania', Africa: '非洲 Africa', Other: '其他 Other',
};

async function fetchWikipediaCities() {
  const url = 'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_metro_systems&prop=wikitext&format=json&formatversion=2';
  const res = await fetch(url, { headers: { 'User-Agent': 'schematic-map-rwd metro catalog (kevin7261@gmail.com)' } });
  const wt = (await res.json()).parse.wikitext;
  const start = wt.indexOf('{| class="wikitable');
  const table = wt.slice(start, wt.indexOf('\n|}', start));
  const cityRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;
  const flagRe = /\{\{flag(?:country|icon|deco|u)?\|([^}|]+)/i;
  const out = [];
  let lastCountry = null;
  for (const r of table.split('\n|-').slice(1)) {
    const lines = r.split('\n').filter((l) => /^\|/.test(l) && !/^\|\}/.test(l));
    if (!lines.length) continue;
    let city = null;
    for (const l of lines) {
      const cm = l.match(cityRe);
      if (cm) {
        city = cm[2] || cm[1];
        break;
      }
    }
    let country = null;
    for (const l of lines) {
      const fm = l.match(flagRe);
      if (fm) {
        country = fm[1].trim();
        break;
      }
    }
    if (country) lastCountry = country;
    else country = lastCountry;
    city = (city || '').replace(/\{\{[^}]*\}\}/g, '').trim();
    if (city && country) out.push({ city, country });
  }
  return out;
}

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
// 以 Nominatim 的「城市點」(lat/lon) 為中心（可靠）；只有當 boundingbox 中心與該點相近時才採用其尺寸，
// 否則用預設半徑（避免行政區含離島／轄區過大導致中心飄到海上，例如 Tokyo、Shanghai）。
async function geocodeBbox(city, country) {
  const key = `wmgeo|${city}|${country}`;
  let hit = cache[key];
  if (hit === undefined) {
    const tryQ = async (q) => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'schematic-map-rwd metro catalog (kevin7261@gmail.com)' } });
      if (!res.ok) return null;
      const arr = await res.json();
      await sleep(1100);
      return arr && arr[0] ? arr[0] : null;
    };
    hit = null;
    for (let attempt = 0; attempt < 2 && !hit; attempt++) {
      try {
        const r = (await tryQ(`${city}, ${country}`)) || (await tryQ(city));
        if (r) hit = { lat: +r.lat, lon: +r.lon, bb: r.boundingbox ? r.boundingbox.map(Number) : null };
      } catch (e) {
        void e;
        await sleep(2000);
      }
    }
    cache[key] = hit; // 可能為 null
    fs.writeFileSync(CACHE, JSON.stringify(cache));
  }
  if (!hit) return null;
  const { lat, lon, bb } = hit;
  let hLat = 0.35;
  let hLon = 0.35;
  if (bb) {
    const [s, n, w, e] = bb; // Nominatim boundingbox = [minLat, maxLat, minLon, maxLon]
    if (Math.abs((s + n) / 2 - lat) < 0.25 && Math.abs((w + e) / 2 - lon) < 0.25) {
      hLat = Math.min(0.45, Math.max(0.2, (n - s) / 2 + 0.05));
      hLon = Math.min(0.45, Math.max(0.2, (e - w) / 2 + 0.05));
    }
  }
  return [+(lat - hLat).toFixed(4), +(lon - hLon).toFixed(4), +(lat + hLat).toFixed(4), +(lon + hLon).toFixed(4)];
}

const slug = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

// 手動修正：名稱有歧義導致 Nominatim 定位錯誤的城市（bbox: south,west,north,east）
const BBOX_OVERRIDE = {
  'Chongqing|China': [29.2, 106.2, 29.92, 106.92], // 巨大轄區 → 定位飄到郊區，改用市區
  'Dnipro|Ukraine': [48.36, 34.84, 48.56, 35.24], // 與「第聶伯河」同名 → 改用城市本身
  'Kawasaki|Japan': [35.5, 139.6, 35.62, 139.78],
};

async function main() {
  console.log('1/3 取得 Wikipedia「List of metro systems」…');
  const cities = await fetchWikipediaCities();
  console.log(`  解析到 ${cities.length} 城市、${new Set(cities.map((c) => c.country)).size} 國`);

  console.log('2/3 Nominatim 取 bbox（首次較慢、之後讀快取）…');
  const seen = new Set();
  const catalog = [];
  let i = 0;
  let skipped = 0;
  for (const c of cities) {
    const bbox = BBOX_OVERRIDE[`${c.city}|${c.country}`] || (await geocodeBbox(c.city, c.country));
    if (++i % 25 === 0) console.log(`  ${i}/${cities.length}`);
    if (!bbox) {
      skipped++;
      continue;
    }
    const continent = CONTINENT_ZH[COUNTRY_CONTINENT[c.country] || 'Other'];
    let id = slug(`${c.country}-${c.city}`) || `sys-${seen.size}`;
    while (seen.has(id)) id += '-x';
    seen.add(id);
    catalog.push({ id, city: c.city, country: c.country, continent, bbox });
  }

  const corder = Object.values(CONTINENT_ZH);
  catalog.sort(
    (a, b) =>
      corder.indexOf(a.continent) - corder.indexOf(b.continent) ||
      a.country.localeCompare(b.country) ||
      a.city.localeCompare(b.city)
  );
  fs.writeFileSync(OUT, JSON.stringify(catalog));
  const byCont = {};
  for (const c of catalog) byCont[c.continent] = (byCont[c.continent] || 0) + 1;
  console.log(`3/3 完成：${catalog.length} 城市（跳過 ${skipped} 無法定位）→ ${path.relative(path.join(__dirname, '..'), OUT)}`);
  console.log('   洲別：', Object.entries(byCont).map(([k, v]) => `${k}:${v}`).join('、'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
