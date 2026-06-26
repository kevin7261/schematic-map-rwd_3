/**
 * 🔁 一次性：重抓指定城市的 metro GeoJSON（套用最新的跨境過濾與施工/計畫路線邏輯）。
 * 用法：node scripts/_refetchCities.mjs taiwan-taipei china-hong-kong china-shenzhen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMetroGeojsonByBbox } from '../src/utils/metroOsmFetch.js';
import { overridesFor } from '../src/utils/metroOverrides.js';
import { isMainlandChina, convertFcToTraditional, mergeSameNameStations, addExtraStations, mergeLoopLines, dropOrphanNodes, splitAtConnects } from './_toTraditional.mjs';
import { validateGeojson } from './validateMetroGeojson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'public', 'data', 'metro');
const CATALOG = path.join(DIR, '_catalog.json');

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
const fileFor = (c) =>
  c.file || `${CONT_SLUG[c.continent] || 'other'}/${slug(c.country)}/${slug(c.city)}.geojson`;

const ids = process.argv.slice(2);
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

for (const id of ids) {
  const c = catalog.find((x) => x.id === id);
  if (!c) {
    console.log(`✗ 找不到 ${id}`);
    continue;
  }
  process.stdout.write(`抓取 ${c.city} (${id}) … `);
  try {
    const ov = overridesFor(id);
    const LRT_OK = ['Japan', 'Taiwan', 'Singapore', 'China', 'United States'];
    const fc = await fetchMetroGeojsonByBbox(ov.bbox || c.bbox, {
      onProgress: () => {},
      allowLightRail: LRT_OK.includes(c.country),
      keepOperators: ov.keepOperators,
      colorByName: ov.colorByName,
      dedupeByName: ov.dedupeByName,
      dropByName: ov.dropByName,
      includeRail: ov.includeRail,
      onlyLineName: ov.onlyLineName,
      clipToBbox: ov.clipToBbox,
      noNameMerge: ov.noNameMerge,
      includeUnopened: ov.includeUnopened,
    });
    if (isMainlandChina(c)) convertFcToTraditional(fc); // 大陸城市簡→繁
    if (ov.mergeLoops) mergeLoopLines(fc, ov.mergeLoops); // 環線半環縫合
    if (!ov.noNameMerge) mergeSameNameStations(fc); // 同名車站合併（紐約等特例除外）
    if (ov.extraStations) addExtraStations(fc, ov.extraStations); // 手動補站（OSM 缺漏）
    splitAtConnects(fc); // 交點截斷（路線中間不留紅點）
    dropOrphanNodes(fc); // 收尾：清除孤立 node
    const v = validateGeojson(fc);
    const rel = fileFor(c);
    const full = path.join(DIR, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(fc));
    c.file = rel; // 還原/設定 catalog file 參照
    fs.writeFileSync(CATALOG, JSON.stringify(catalog));
    console.log(`${v.lines} 線、${v.nodes} 站 ${v.errors.length ? '⚠ ' + v.errors.join('；') : '✓'}`);
  } catch (e) {
    console.log('失敗：', e.message || e);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
