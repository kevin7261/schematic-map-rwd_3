/**
 * ✅ 結構驗證 metro GeoJSON（fetchMetroRoutes.mjs 的產物）。
 *
 * 這是「確定性 / 機械式」的驗證層：能自動擋下會造成畫面錯誤的結構問題，
 * 但「語意/視覺是否合理」（如環線全紅是否正常）需另由人或 agent/skill 判斷。
 *
 * 檢查項目（每座城市的 public/data/metro/<id>.geojson）：
 *   1. 合法 FeatureCollection，且有 way（路線）與 node（站點）
 *   2. way/node 的扁平欄位齊全（與 taipei.geojson 同格式）
 *   3. ✗ 多線合併關聯（route_id 含 ; , /）——會與各別線重複
 *   4. ✗ 重複線（兩條線互相覆蓋率皆 ≥80%）——同線雙向/變體未合併（高雄環狀線那類 bug）
 *   5. ✗ 孤立 node（座標未落在任一條線上）
 *   6. ⚠ 座標超出該城市 bbox（警告）
 *   7. ⚠ 全/多轉乘線（>70% 站為交點）——環線或共軌，通常正常，僅資訊提示
 *
 * 執行：node scripts/validateMetroRoutes.mjs            （驗全部）
 *      node scripts/validateMetroRoutes.mjs taipei tokyo （只驗指定城市）
 * 回傳值：有結構錯誤時 process.exit(1)，供 CI / fetch 後續判斷。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CITIES } from './fetchMetroRoutes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'public', 'data', 'metro');

const REQ_WAY = ['route_company', 'route_id', 'element_type', 'color', 'route_name', 'osm_id', 'railway'];
const REQ_NODE = ['osm_id', 'station_name', 'element_type', 'station_id'];
const k = (lon, lat) => `${(+lon).toFixed(6)},${(+lat).toFixed(6)}`;

function validateCity(city) {
  const errors = [];
  const warns = [];
  const file = path.join(DIR, `${city.id}.geojson`);
  if (!fs.existsSync(file)) return { errors: [`缺檔 ${city.id}.geojson`], warns: [] };

  let fc;
  try {
    fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { errors: [`JSON 解析失敗：${e.message}`], warns: [] };
  }
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) errors.push('非 FeatureCollection');
  const feats = fc.features || [];
  const ways = feats.filter((f) => f?.properties?.element_type === 'way' && f.geometry?.type === 'LineString');
  const nodes = feats.filter((f) => f?.properties?.element_type === 'node' && f.geometry?.type === 'Point');
  if (!ways.length) errors.push('沒有 way（路線）');

  // 2. 欄位齊全
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

  // 2b. route／station 名稱與代號需為「真值」（不可空、不可為自動產生的假值）
  const blank = (v) => !String(v == null ? '' : v).trim();
  const emptyRN = ways.filter((w) => blank(w.properties.route_name)).length;
  const emptyRI = ways.filter((w) => blank(w.properties.route_id)).length;
  if (emptyRN) errors.push(`${emptyRN} 條線 route_name 為空`);
  if (emptyRI) errors.push(`${emptyRI} 條線 route_id 為空`);
  const fakeSID = nodes.filter((n) => /^s\d+$/.test(String(n.properties.station_id || ''))).length;
  if (fakeSID) errors.push(`${fakeSID} 站 station_id 為自動產生假值（s+數字）`);
  const emptySID = nodes.filter((n) => blank(n.properties.station_id)).length;
  if (emptySID) errors.push(`${emptySID} 站 station_id 為空`);
  const colorName = ways.filter((w) => /^(紅|綠|藍|橘|紫|青|洋紅|棕|深青|暗紅|海軍藍|橄欖|粉紅|灰)色$/.test(String(w.properties.route_name || ''))).length;
  if (colorName) errors.push(`${colorName} 條線 route_name 為顏色名（非真實名稱）`);
  const emptyName = nodes.filter((n) => blank(n.properties.station_name)).length;
  if (nodes.length && emptyName / nodes.length > 0.15)
    warns.push(`${Math.round((emptyName / nodes.length) * 100)}% 站缺 station_name`);
  const badOsm = nodes.filter((n) => !/^\d+$/.test(String(n.properties.osm_id || ''))).length;
  if (badOsm) warns.push(`${badOsm} 站 osm_id 非 OSM 數字 id`);

  // 3. 多線合併關聯
  const multi = ways.filter((w) => /[;,/]/.test(w.properties.route_id));
  if (multi.length) errors.push(`多線合併關聯 ${multi.length}（${multi.slice(0, 3).map((w) => w.properties.route_id)}）`);

  // 4. 重複線（互相覆蓋率皆 ≥80%）
  const keysets = ways.map((w) => new Set(w.geometry.coordinates.map((c) => k(c[0], c[1]))));
  const dups = [];
  for (let i = 0; i < ways.length; i++)
    for (let j = i + 1; j < ways.length; j++) {
      let hit = 0;
      for (const x of keysets[i]) if (keysets[j].has(x)) hit++;
      if (keysets[i].size && keysets[j].size && hit / keysets[i].size >= 0.8 && hit / keysets[j].size >= 0.8)
        dups.push(`${ways[i].properties.route_id}≈${ways[j].properties.route_id}`);
    }
  if (dups.length) errors.push(`重複線 ${dups.length}（${dups.slice(0, 3)}）`);

  // 5. node 落在線上
  const vset = new Set([].concat(...ways.map((w) => w.geometry.coordinates.map((c) => k(c[0], c[1])))));
  const orphan = nodes.filter((n) => !vset.has(k(n.geometry.coordinates[0], n.geometry.coordinates[1])));
  if (orphan.length) errors.push(`孤立 node ${orphan.length}（未落在線上）`);

  // 6. 座標大致落在該城市附近（警告）：路線常延伸到郊區，故只在「大多數座標都偏離」時才示警，
  //    用以抓「整城資料落錯地方」這種嚴重錯誤，而非正常的郊區延伸。
  const [s, w0, n0, e0] = city.bbox;
  const pad = 0.15;
  let oob = 0;
  let tot = 0;
  for (const f of feats) {
    const cs = f.geometry?.type === 'LineString' ? f.geometry.coordinates : [f.geometry?.coordinates];
    for (const c of cs) {
      if (!Array.isArray(c)) continue;
      tot++;
      const [lon, lat] = c;
      if (lat < s - pad || lat > n0 + pad || lon < w0 - pad || lon > e0 + pad) oob++;
    }
  }
  if (tot && oob / tot > 0.4) warns.push(`${Math.round((oob / tot) * 100)}% 座標偏離 bbox（可能落錯位置）`);

  // 7. 全/多轉乘線（資訊）：>70% 站為交點 → 環線或共軌，通常正常
  const memb = new Map();
  ways.forEach((w, li) =>
    w.geometry.coordinates.forEach((c) => {
      const key = k(c[0], c[1]);
      let st = memb.get(key);
      if (!st) {
        st = new Set();
        memb.set(key, st);
      }
      st.add(li);
    })
  );
  const shared = [];
  ways.forEach((w) => {
    const tot = w.geometry.coordinates.length;
    let sh = 0;
    for (const c of w.geometry.coordinates) if (memb.get(k(c[0], c[1])).size >= 2) sh++;
    if (tot >= 4 && sh / tot > 0.7) shared.push(w.properties.route_id);
  });
  if (shared.length) warns.push(`多轉乘線（環線/共軌，多為正常）：${shared.join(',')}`);

  return { errors, warns, lines: ways.length, nodes: nodes.length };
}

export function validateAll(ids) {
  const want = (ids || []).map((s) => String(s).toLowerCase());
  const list = want.length ? CITIES.filter((c) => want.includes(c.id)) : CITIES;
  let bad = 0;
  console.log('\n=== 結構驗證 metro GeoJSON ===');
  for (const city of list) {
    const r = validateCity(city);
    const ok = !r.errors.length;
    if (!ok) bad++;
    const head = r.lines != null ? `lines=${String(r.lines).padStart(2)} nodes=${String(r.nodes).padStart(3)}` : '';
    console.log(
      (ok ? '✓ ' : '✗ ') +
        city.id.padEnd(11) +
        head +
        (r.errors.length ? '  錯誤：' + r.errors.join('；') : '') +
        (r.warns.length ? '  （' + r.warns.join('；') + '）' : '')
    );
  }
  console.log(bad ? `\n✗ ${bad} 城市有結構錯誤` : `\n✓ 全部 ${list.length} 城市結構通過`);
  return bad === 0;
}

// 直接執行 → 驗證並以 exit code 反映結果
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = validateAll(process.argv.slice(2));
  process.exit(ok ? 0 : 1);
}
