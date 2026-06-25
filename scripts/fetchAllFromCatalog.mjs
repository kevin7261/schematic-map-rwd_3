/**
 * 🌍⬇️ 依 _catalog.json 把「全部城市」的地鐵路線預先抓成 GeoJSON，存成 2 層資料夾 洲/國/。
 *
 *   public/data/metro/<continent>/<country>/<city>.geojson   （扁平 way/node，同 taipei.geojson）
 *
 * 特性：
 *   - 逐檔抓 → 立即驗證（validateGeojson）→ 通過才寫檔（確保內容正確）
 *   - 可續跑（resumable）：已存在且通過驗證的檔會略過；失敗的城市下次再補
 *   - 同步把 file 路徑寫回 _catalog.json；前端只顯示已成功的城市
 *
 * 執行：node scripts/fetchAllFromCatalog.mjs          （抓全部、可重複執行補齊）
 *      node scripts/fetchAllFromCatalog.mjs --force   （重抓，忽略既有檔）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchMetroGeojsonByBbox } from '../src/utils/metroOsmFetch.js';
import { overridesFor } from '../src/utils/metroOverrides.js';
import { isMainlandChina, convertFcToTraditional } from './_toTraditional.mjs';
import { validateGeojson } from './validateMetroGeojson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'public', 'data', 'metro');
const CATALOG = path.join(DIR, '_catalog.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONT_SLUG = {
  '亞洲 Asia': 'asia',
  '歐洲 Europe': 'europe',
  '北美 North America': 'north-america',
  '南美 South America': 'south-america',
  '大洋洲 Oceania': 'oceania',
  '非洲 Africa': 'africa',
  '其他 Other': 'other',
};
const slug = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'x';

const CONCURRENCY = 4; // 並行抓取數（搭配 3 個 Overpass 鏡像，對單一鏡像仍友善）

async function main() {
  const force = process.argv.includes('--force');
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  console.log(`目標 ${catalog.length} 城市（並行 ${CONCURRENCY}）；輸出 ${path.relative(path.join(__dirname, '..'), DIR)}/<洲>/<國>/<市>.geojson`);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let done = 0;
  const failed = [];

  const processCity = async (c) => {
    const rel = `${CONT_SLUG[c.continent] || 'other'}/${slug(c.country)}/${slug(c.city)}.geojson`;
    const full = path.join(DIR, rel);
    const tag = `${c.continent.split(' ')[1] || c.continent}/${c.country}/${c.city}`;

    if (!force && fs.existsSync(full)) {
      try {
        const v = validateGeojson(JSON.parse(fs.readFileSync(full, 'utf8')));
        if (!v.errors.length) {
          c.file = rel;
          skip++;
          return;
        }
      } catch (e) {
        void e;
      }
    }
    try {
      const ov = overridesFor(c.id);
      const fc = await fetchMetroGeojsonByBbox(ov.bbox || c.bbox, {
        keepOperators: ov.keepOperators,
        colorByName: ov.colorByName,
        dedupeByName: ov.dedupeByName,
        dropByName: ov.dropByName,
        includeRail: ov.includeRail,
        onlyLineName: ov.onlyLineName,
        clipToBbox: ov.clipToBbox,
      });
      if (isMainlandChina(c)) convertFcToTraditional(fc); // 大陸城市簡→繁
      const v = validateGeojson(fc);
      if (v.errors.length) {
        fail++;
        failed.push(`${c.city}(${v.errors[0]})`);
        delete c.file;
        console.log(`[${++done}/${catalog.length}] ${tag} … 驗證未過：${v.errors.join('；')}`);
      } else {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, JSON.stringify(fc));
        c.file = rel;
        ok++;
        console.log(`[${++done}/${catalog.length}] ${tag} … ${v.lines} 線、${v.nodes} 站 ✓`);
      }
    } catch (e) {
      fail++;
      failed.push(`${c.city}(fetch)`);
      delete c.file;
      console.log(`[${++done}/${catalog.length}] ${tag} … 抓取失敗：${e.message || e}`);
    }
    fs.writeFileSync(CATALOG, JSON.stringify(catalog)); // 即時存檔，續跑用
  };

  // 並行工作池
  let idx = 0;
  const worker = async () => {
    while (idx < catalog.length) {
      const c = catalog[idx++];
      await processCity(c);
      await sleep(1500);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync(CATALOG, JSON.stringify(catalog));
  const haveFile = catalog.filter((c) => c.file).length;
  console.log(`\n完成：新增 ${ok}、略過 ${skip}、失敗 ${fail}；目前有資料城市 ${haveFile}/${catalog.length}`);
  if (failed.length) console.log('未取得：', failed.slice(0, 50).join('、') + (failed.length > 50 ? ' …' : ''));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
