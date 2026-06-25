---
name: fetch-metro-geojson
description: Fetch, clean, validate, and maintain the global metro/urban-rail GeoJSON dataset under public/data/metro from OpenStreetMap (Overpass). Use when adding a city, re-fetching after rule changes, fixing a city's lines/colors/stations, or validating coverage against Wikipedia's List of metro systems.
---

# 全球地鐵 GeoJSON 抓取與維護

把全世界地鐵/都市軌道從 OpenStreetMap（Overpass）抓成統一的扁平 GeoJSON，存於
`public/data/metro/<洲>/<國>/<市>.geojson`，供「選擇路線圖」分頁載入。

權威城市清單參照 Wikipedia [List of metro systems](https://en.wikipedia.org/wiki/List_of_metro_systems)。
資料授權：© OpenStreetMap contributors（ODbL）。

## 檔案地圖

- `src/utils/metroOsmFetch.js` — **通用抓取 pipeline**（Overpass 查詢 → 處理 → 清理 → 輸出 GeoJSON）。瀏覽器與 Node 共用，純 opts 驅動。
- `src/utils/metroOverrides.js` — **per-city 覆寫設定**（bbox / keepOperators / colorByName / dedupeByName）。城市個別調整集中於此。
- `scripts/discoverMetroSystems.mjs` — 全球探索 `route=subway` 系統 → 反查國家城市 → 產生 `_catalog.json`。
- `scripts/fetchAllFromCatalog.mjs` — 依 catalog 抓「全部」城市（可續跑；`--force` 重抓全部）。
- `scripts/_refetchCities.mjs` — 重抓「指定城市」：`node scripts/_refetchCities.mjs <id> [<id>...]`。
- `scripts/validateMetroGeojson.mjs` — 結構驗證（欄位、空值、重複線、孤立 node…）；抓取流程內建逐檔驗證。
- `public/data/metro/_catalog.json` — 城市清單（id, city, country, continent, bbox, file, countryZh, cityZh）。

## 輸出格式（扁平 GeoJSON）

FeatureCollection，每條線一個 `element_type:"way"`、每站一個 `element_type:"node"`。
way 屬性：`route_company, route_id, color, route_name, osm_id, railway, status`（status = open/construction/proposed）。
node 屬性：`osm_id, station_name, station_id`。

## 清理規則（pipeline 內建）

1. **跨境過濾**：以 network/operator 為單位，network 重心落在 bbox 外者整組剔除（如載香港時剔除深圳地鐵）。若本地線重心剛好落界外一點（如台北淡海輕軌），用 per-city `bbox` 放寬該邊界，**不要**改成多數點判定（會放進鄰市系統）。
2. **直通運轉剔除**（日本）：名稱含「直通/快特/快速特急/S-Train」、多營運商合併（operator 含 `;` 且有日本地鐵業者）、地鐵線+私鐵同名、純 JR（旅客鉄道）→ 整條剔除；核心地鐵線在 OSM 另有乾淨關聯。以日文 token 判定，不影響他國。
3. **施工/計畫線**：另抓 `route=construction/proposed` 關聯與 way 層級 `railway=construction/proposed`（多無 route 關聯，如台北環狀各環段、桃園綠線），依名稱縫合；過短碎段（<0.9km）、bbox 外、與既有線走向重複者剔除。
4. **同名車站合併**：相同 `station_name` 視為同一站，合併到所有出現點的重心（最佳位置），各線改走此點 → 每站名只一個點、多線在轉乘站正確相接。（硬性規則）
5. **per-city 營運者白名單** `keepOperators`：只保留符合 regex 的營運者（僅 status=open 生效）。如東京只留東京メトロ＋都營。
6. **per-city 配色** `colorByName`：依 route_name 套官方色，首個符合者勝；施工/計畫線藉此**繼承母線色**。
7. **per-city 去重** `dedupeByName`：同一 regex family 只留座標點最多者（清掉 OSM 同線多名稱重複）。

## per-city 覆寫（src/utils/metroOverrides.js）

```js
'taiwan-taipei': {
  bbox: [s, w, n, e],                          // 覆寫 catalog bbox（如西延納桃園、北延納淡海）
  colorByName: [{ match: '淡水|信義', color: '#e3002c' }, ...], // 具體 family 排前、通用關鍵字排末
  dedupeByName: ['萬大|樹林', '環狀.*東環|東環段'],
},
'japan-tokyo': { keepOperators: '東京メトロ|東京地下鉄|Tokyo Metro|東京都交通局' },
```

## 常見任務

- **新增一個城市**：在 `_catalog.json` 加 entry（id, city, country, continent, bbox, file, countryZh, cityZh）→ `node scripts/_refetchCities.mjs <id>`。
- **某城線/色/站不對**：在 `metroOverrides.js` 加/改該城設定 → `node scripts/_refetchCities.mjs <id>` → 檢查 geojson。
- **改了 pipeline 規則要全球套用**：`node scripts/fetchAllFromCatalog.mjs --force`（背景跑；逐檔驗證、通過才寫）。
- **刪無用檔**：比對 catalog 的 `file` 參照，移除未被參照的 `.geojson`。
- **驗證單檔結構**：`node scripts/validateMetroGeojson.mjs`。

## 驗證正確性

抓完/改完後，用 **validate-metro-lines** skill 對照 Wikipedia 驗證線數與線名、找出缺漏與過度抓取，
其報告會直接指出該在本 skill 的 `metroOverrides.js` 加哪些覆寫（bbox/keepOperators/dedupeByName）。
修正後用 `node scripts/_refetchCities.mjs <id>` 重抓該城，再對該城重跑驗證確認。

## 注意事項

- 中文一律繁體（資料與 UI）。
- Overpass 會限流：腳本內建多鏡像輪替與退避；禮貌性間隔。
- `_refetchCities.mjs`、`_cityLines.mjs` 為維護用工具腳本（底線前綴）。
