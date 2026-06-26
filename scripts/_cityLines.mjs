/**
 * 一次性 helper：給定 catalog city id，印出 {id, city, country, cityZh, lines:[route_name,...]}。
 * 供驗證 workflow 的 agent 取得「我們目前的線名清單」。
 * 用法：node scripts/_cityLines.mjs <city-id>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'public', 'data', 'metro');
const id = process.argv[2];
const cat = JSON.parse(fs.readFileSync(path.join(DIR, '_catalog.json'), 'utf8'));
const c = cat.find((x) => x.id === id);
if (!c || !c.file) {
  console.log(JSON.stringify({ id, error: 'not found or no file' }));
  process.exit(0);
}
const fc = JSON.parse(fs.readFileSync(path.join(DIR, c.file), 'utf8'));
const lines = fc.features
  .filter((x) => x.properties.element_type === 'way')
  .map((x) => ({
    name: x.properties.route_name || '(無名)',
    color: x.properties.color || '',
    status: x.properties.status || 'open',
  }));
const stationCount = fc.features.filter((x) => x.properties.element_type === 'node').length;
console.log(
  JSON.stringify({ id, city: c.city, country: c.country, cityZh: c.cityZh || '', stationCount, lines })
);
