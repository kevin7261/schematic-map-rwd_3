/**
 * ✅ 驗證單一 metro GeoJSON（扁平 way/node 格式）是否結構正確、且 route／station 為真值。
 *
 * 提供純函式 validateGeojson(fc) 供抓取流程逐檔驗證；CLI 則遞迴掃描 public/data/metro/**.geojson。
 *
 * 檢查：欄位齊全、route_name/route_id 非空、station_id 非假值/非空、route_name 非顏色名、
 *       多線合併關聯、互相重疊重複線、node 是否落在線上。
 *
 * 執行：node scripts/validateMetroGeojson.mjs          （驗 data/metro 下全部）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normStationName } from '../src/utils/metroStationNameNorm.js';

const REQ_WAY = ['route_company', 'route_id', 'element_type', 'color', 'route_name', 'osm_id', 'railway'];
const REQ_NODE = ['osm_id', 'station_name', 'element_type', 'station_id'];
const k = (lon, lat) => `${(+lon).toFixed(6)},${(+lat).toFixed(6)}`;
const blank = (v) => !String(v == null ? '' : v).trim();

/** @returns {{errors:string[], warns:string[], lines:number, nodes:number}} */
export function validateGeojson(fc) {
  const errors = [];
  const warns = [];
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  if (fc?.type !== 'FeatureCollection') errors.push('非 FeatureCollection');
  const ways = feats.filter((f) => f?.properties?.element_type === 'way' && f.geometry?.type === 'LineString');
  const nodes = feats.filter((f) => f?.properties?.element_type === 'node' && f.geometry?.type === 'Point');
  if (!ways.length) {
    errors.push('沒有 way（路線）');
    return { errors, warns, lines: 0, nodes: nodes.length };
  }

  for (const w of ways) {
    const miss = REQ_WAY.filter((x) => !(x in w.properties));
    if (miss.length) {
      errors.push(`way 缺欄位 ${miss}`);
      break;
    }
  }
  for (const nd of nodes) {
    const miss = REQ_NODE.filter((x) => !(x in nd.properties));
    if (miss.length) {
      errors.push(`node 缺欄位 ${miss}`);
      break;
    }
  }

  const emptyRN = ways.filter((w) => blank(w.properties.route_name)).length;
  const emptyRI = ways.filter((w) => blank(w.properties.route_id)).length;
  // 全部線都沒名才當錯誤；少數線缺名（OSM 該關聯本就無 name/ref）只警告，不因此整城被排除
  if (emptyRN === ways.length) errors.push('所有線 route_name 皆空');
  else if (emptyRN) warns.push(`${emptyRN} 線 route_name 空`);
  if (emptyRI) errors.push(`${emptyRI} 線 route_id 空`);
  const fakeSID = nodes.filter((n) => /^s\d+$/.test(String(n.properties.station_id || ''))).length;
  if (fakeSID) errors.push(`${fakeSID} 站 station_id 為假值`);
  const emptySID = nodes.filter((n) => blank(n.properties.station_id)).length;
  if (emptySID) errors.push(`${emptySID} 站 station_id 空`);
  const colorName = ways.filter((w) => /^(紅|綠|藍|橘|紫|青|洋紅|棕|深青|暗紅|海軍藍|橄欖|粉紅|灰)色$/.test(String(w.properties.route_name || ''))).length;
  if (colorName) errors.push(`${colorName} 線 route_name 為顏色名`);
  const emptyNm = nodes.filter((n) => blank(n.properties.station_name)).length;
  if (nodes.length && emptyNm / nodes.length > 0.2) warns.push(`${Math.round((emptyNm / nodes.length) * 100)}% 站缺名`);

  const byNorm = new Map();
  for (const n of nodes) {
    const nm = (n.properties.station_name || '').trim();
    const nk = normStationName(nm);
    if (!nk) continue;
    const c = k(n.geometry.coordinates[0], n.geometry.coordinates[1]);
    let g = byNorm.get(nk);
    if (!g) {
      g = { coords: new Set(), names: new Set() };
      byNorm.set(nk, g);
    }
    g.coords.add(c);
    g.names.add(nm);
  }
  const normDupes = [...byNorm.entries()].filter(([, g]) => g.coords.size > 1);
  if (normDupes.length) {
    const sample = normDupes
      .slice(0, 3)
      .map(([nk, g]) => `${nk}(${[...g.names].join('/')})`)
      .join('; ');
    errors.push(`正規化同名未共點 ${normDupes.length} 組（如 ${sample}）`);
  }
  const exactDupes = new Map();
  for (const n of nodes) {
    const nm = (n.properties.station_name || '').trim();
    if (!nm) continue;
    const c = k(n.geometry.coordinates[0], n.geometry.coordinates[1]);
    let s = exactDupes.get(nm);
    if (!s) {
      s = new Set();
      exactDupes.set(nm, s);
    }
    s.add(c);
  }
  const exactMulti = [...exactDupes.entries()].filter(([, s]) => s.size > 1);
  if (exactMulti.length) {
    errors.push(`完全相同站名未共點 ${exactMulti.length} 組（如 ${exactMulti.slice(0, 3).map(([nm]) => nm).join('、')}）`);
  }

  const multi = ways.filter((w) => /[;,/]/.test(w.properties.route_id));
  if (multi.length) errors.push(`多線合併關聯 ${multi.length}`);

  // 重複線只比「同一條線(route_id)」之間（交點截斷後不同路線會共用相同路段，屬正常、不算重複）
  const keysets = ways.map((w) => new Set(w.geometry.coordinates.map((c) => k(c[0], c[1]))));
  const ridOf = (w) => w.properties.route_id || w.properties.route_name || '';
  let dup = 0;
  for (let i = 0; i < ways.length; i++)
    for (let j = i + 1; j < ways.length; j++) {
      if (ridOf(ways[i]) !== ridOf(ways[j])) continue; // 不同路線共用路段不算重複
      let hit = 0;
      for (const x of keysets[i]) if (keysets[j].has(x)) hit++;
      if (keysets[i].size && keysets[j].size && hit / keysets[i].size >= 0.8 && hit / keysets[j].size >= 0.8) dup++;
    }
  if (dup) warns.push(`重複線 ${dup} 對`); // 交點截斷後同線共用路段重疊屬正常，降為警告不擋寫檔

  const vset = new Set([].concat(...ways.map((w) => w.geometry.coordinates.map((c) => k(c[0], c[1])))));
  const orphan = nodes.filter((n) => !vset.has(k(n.geometry.coordinates[0], n.geometry.coordinates[1]))).length;
  if (orphan) errors.push(`孤立 node ${orphan}`);

  // 路線中間不可有端點(藍點)：真端點之線端頂點總出現次數應為 1；若該點同時是某線之內部頂點＝中段藍點
  const coords = ways.map((w) => w.geometry.coordinates);
  const vcount = new Map();
  for (const c of coords) for (const p of c) vcount.set(k(p[0], p[1]), (vcount.get(k(p[0], p[1])) || 0) + 1);
  const interior = new Set();
  for (const c of coords) for (let i = 1; i < c.length - 1; i++) interior.add(k(c[i][0], c[i][1]));
  let midTerm = 0;
  for (const c of coords)
    for (const v of [c[0], c[c.length - 1]])
      if ((vcount.get(k(v[0], v[1])) || 0) <= 1 && interior.has(k(v[0], v[1]))) midTerm++;
  if (midTerm) errors.push(`中段端點(藍點) ${midTerm}`);

  return { errors, warns, lines: ways.length, nodes: nodes.length };
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.geojson')) acc.push(p);
  }
  return acc;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.join(__dirname, '..', 'public', 'data', 'metro');
  const files = walk(ROOT).sort();
  let bad = 0;
  let lines = 0;
  for (const f of files) {
    let r;
    try {
      r = validateGeojson(JSON.parse(fs.readFileSync(f, 'utf8')));
    } catch (e) {
      r = { errors: ['解析失敗：' + e.message], warns: [], lines: 0, nodes: 0 };
    }
    lines += r.lines;
    if (r.errors.length) {
      bad++;
      console.log('✗ ' + path.relative(ROOT, f) + '  ' + r.errors.join('；'));
    }
  }
  console.log(`\n${bad ? '✗ ' + bad + ' 檔有結構錯誤' : '✓ 全部通過'}（共 ${files.length} 檔、${lines} 條線）`);
  process.exit(bad ? 1 : 0);
}
