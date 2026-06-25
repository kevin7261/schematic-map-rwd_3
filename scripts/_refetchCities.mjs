/**
 * 🔁 一次性：重抓指定城市的 metro GeoJSON（套用最新的跨境過濾與施工/計畫路線邏輯）。
 * 用法：node scripts/_refetchCities.mjs taiwan-taipei china-hong-kong china-shenzhen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMetroGeojsonByBbox } from '../src/utils/metroOsmFetch.js';
import { validateGeojson } from './validateMetroGeojson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'public', 'data', 'metro');
const CATALOG = path.join(DIR, '_catalog.json');

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
    const fc = await fetchMetroGeojsonByBbox(c.bbox, { onProgress: () => {} });
    const v = validateGeojson(fc);
    const ways = fc.features.filter((f) => f.properties?.element_type === 'way');
    const constr = ways.filter((f) => f.properties?.status === 'construction').length;
    const prop = ways.filter((f) => f.properties?.status === 'proposed').length;
    const full = path.join(DIR, c.file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(fc));
    console.log(
      `${v.lines} 線（施工 ${constr}、計畫 ${prop}）、${v.nodes} 站 ${v.errors.length ? '⚠ ' + v.errors.join('；') : '✓'}`
    );
  } catch (e) {
    console.log('失敗：', e.message || e);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
