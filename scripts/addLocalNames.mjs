/**
 * 🈯 為 _catalog.json 補上中文名（countryZh / cityZh），供下拉選單顯示「中文 English」。
 * 國家用內建對照；城市用 Wikipedia 語言連結（en → zh）批次查詢、快取。保留既有 file 欄位。
 *
 * 執行：node scripts/addLocalNames.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(__dirname, '..', 'public', 'data', 'metro', '_catalog.json');
const CACHE = path.join(__dirname, '.zhcache.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COUNTRY_ZH = {
  Algeria: '阿爾及利亞', Argentina: '阿根廷', Armenia: '亞美尼亞', Australia: '澳洲', Austria: '奧地利',
  Azerbaijan: '亞塞拜然', Bangladesh: '孟加拉', Belarus: '白俄羅斯', Belgium: '比利時', Brazil: '巴西',
  Bulgaria: '保加利亞', Canada: '加拿大', Chile: '智利', China: '中國', Colombia: '哥倫比亞',
  'Czech Republic': '捷克', Denmark: '丹麥', 'Dominican Republic': '多明尼加', Ecuador: '厄瓜多', Egypt: '埃及',
  Finland: '芬蘭', France: '法國', Georgia: '喬治亞', Germany: '德國', Greece: '希臘', Hungary: '匈牙利',
  India: '印度', Indonesia: '印尼', Iran: '伊朗', Italy: '義大利', Japan: '日本', Kazakhstan: '哈薩克',
  Malaysia: '馬來西亞', Mexico: '墨西哥', Netherlands: '荷蘭', Nigeria: '奈及利亞', 'North Korea': '北韓',
  Norway: '挪威', Pakistan: '巴基斯坦', Panama: '巴拿馬', Peru: '秘魯', Philippines: '菲律賓', Poland: '波蘭',
  Portugal: '葡萄牙', Qatar: '卡達', Romania: '羅馬尼亞', Russia: '俄羅斯', 'Saudi Arabia': '沙烏地阿拉伯',
  Singapore: '新加坡', 'South Korea': '南韓', Spain: '西班牙', Sweden: '瑞典', Switzerland: '瑞士',
  Taiwan: '台灣', Thailand: '泰國', Turkey: '土耳其', Ukraine: '烏克蘭', 'United Arab Emirates': '阿聯',
  'United Kingdom': '英國', 'United States': '美國', Uzbekistan: '烏茲別克', Venezuela: '委內瑞拉', Vietnam: '越南',
};

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

async function fetchZhTitles(titles) {
  const need = titles.filter((t) => cache[t] === undefined);
  for (let i = 0; i < need.length; i += 40) {
    const batch = need.slice(i, i + 40);
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks&lllang=zh&lllimit=max&redirects=1&titles=' +
      encodeURIComponent(batch.join('|'));
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'schematic-map-rwd zh names (kevin7261@gmail.com)' } });
      const j = await res.json();
      const pages = j.query?.pages || {};
      // 先把 redirects/normalized 對回原查詢標題
      const norm = {};
      for (const r of j.query?.normalized || []) norm[r.to] = r.from;
      for (const r of j.query?.redirects || []) norm[r.to] = norm[r.from] || r.from;
      for (const p of Object.values(pages)) {
        const orig = norm[p.title] || p.title;
        const zh = p.langlinks && p.langlinks[0] ? p.langlinks[0]['*'] : '';
        cache[orig] = zh || '';
      }
      // 沒回到的標題標記為空，避免反覆查
      for (const t of batch) if (cache[t] === undefined) cache[t] = '';
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      await sleep(400);
    } catch (e) {
      void e;
      await sleep(1500);
    }
  }
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  console.log('查詢城市中文名（Wikipedia 語言連結）…');
  await fetchZhTitles([...new Set(cat.map((c) => c.city))]);
  let cityHit = 0;
  for (const c of cat) {
    c.countryZh = COUNTRY_ZH[c.country] || '';
    const zh = (cache[c.city] || '').replace(/（.*?）|\(.*?\)/g, '').trim();
    c.cityZh = zh;
    if (zh) cityHit++;
  }
  fs.writeFileSync(CATALOG, JSON.stringify(cat));
  console.log(`完成：國家中文 ${cat.filter((c) => c.countryZh).length}/${cat.length}、城市中文 ${cityHit}/${cat.length}`);
  console.log('樣本：', cat.slice(0, 5).map((c) => `${c.cityZh}/${c.city}`).join('、'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
