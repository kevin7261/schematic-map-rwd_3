/* eslint-disable no-console */
/**
 * 離線預算全球城市：骨架2 → ⑨ → 前置 → 一鍵執行（四步驟）結果。
 *
 * 執行：node --no-warnings --loader ./loader.mjs scripts/generateRmaMilpReadOneClick.mjs
 * 選項：
 *   --city=taiwan-taipei     只跑單一城市
 *   --skip-existing          已有 JSON 則跳過
 * 產物：public/data/metro/rma_milp_read_one_click/{cityId}.json
 *        public/data/metro/rma_milp_read_one_click/_index.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRmaMilpReadOneClickFromMetroGeojson } from '../src/utils/routeMapAdjust/pipeline/rmaOneClickFromMetro.js';

const ROOT = new URL('..', import.meta.url).pathname;
const CATALOG_PATH = join(ROOT, 'public/data/metro/_catalog.json');
const OUT_DIR = join(ROOT, 'public/data/metro/rma_milp_read_one_click');

const args = process.argv.slice(2);
const onlyCity = args.find((a) => a.startsWith('--city='))?.slice(7) || null;
const skipExisting = args.includes('--skip-existing');

mkdirSync(OUT_DIR, { recursive: true });

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
const cities = catalog.filter((c) => c.file && (!onlyCity || c.id === onlyCity));
if (onlyCity && !cities.length) {
  console.error(`找不到城市 id：${onlyCity}`);
  process.exit(1);
}

console.log(`一鍵執行預算 ${cities.length} 個城市 → ${OUT_DIR}\n`);

const index = [];
let ok = 0;
let fail = 0;
let skip = 0;
const t0 = Date.now();

for (let i = 0; i < cities.length; i++) {
  const city = cities[i];
  const outPath = join(OUT_DIR, `${city.id}.json`);
  if (skipExisting && existsSync(outPath)) {
    skip++;
    try {
      const prev = JSON.parse(readFileSync(outPath, 'utf8'));
      index.push({
        cityId: city.id,
        city: city.city,
        cityZh: city.cityZh || '',
        country: city.country,
        segmentCount: prev.segmentCount ?? prev.spaceNetworkGridJsonData?.length ?? 0,
        generatedAt: prev.generatedAt,
      });
    } catch {
      /* ignore corrupt skip */
    }
    continue;
  }

  const tag = `[${i + 1}/${cities.length}] ${city.id}`;
  try {
    const geoPath = join(ROOT, 'public/data/metro', city.file);
    const fc = JSON.parse(readFileSync(geoPath, 'utf8'));
    const result = buildRmaMilpReadOneClickFromMetroGeojson(fc, {
      cityId: city.id,
      city: city.city,
      country: city.country,
      cityZh: city.cityZh,
    });
    if (!result.ok) {
      fail++;
      console.warn(`  ✗ ${tag}: ${result.message}`);
      continue;
    }
    writeFileSync(outPath, JSON.stringify(result.payload));
    ok++;
    index.push({
      cityId: city.id,
      city: city.city,
      cityZh: city.cityZh || '',
      country: city.country,
      continent: city.continent,
      stations: city.stations,
      routes: city.routes,
      segmentCount: result.payload.segmentCount,
      prepSegmentCount: result.payload.prepSegmentCount,
      skeletonEdgeCount: result.payload.skeletonEdgeCount,
      generatedAt: result.payload.generatedAt,
    });
    console.log(
      `  ✓ ${tag}: ${result.payload.segmentCount} 段（前置 ${result.payload.prepSegmentCount} 段）`
    );
  } catch (e) {
    fail++;
    console.error(`  ✗ ${tag}:`, e?.message || e);
  }
}

index.sort((a, b) => a.cityId.localeCompare(b.cityId));
writeFileSync(join(OUT_DIR, '_index.json'), JSON.stringify(index, null, 2));

const sec = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n完成：成功 ${ok}、失敗 ${fail}、跳過 ${skip}（${sec}s）`);
console.log(`索引：${join(OUT_DIR, '_index.json')}（${index.length} 筆）`);
if (fail > 0) process.exitCode = 1;
