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
8. **per-city 剔除** `dropByName`：route_company 或 route_name 符合者剔除（清鄰市誤抓線，如佛山的廣州地鐵；香港的深圳線）。
9. **全域雜訊過濾**：depot/車輛段、機場旅客捷運(APM)、纜車/索道、動物園單軌、空白或單字名（如 "G"）一律剔除。
10. **簡→繁**：中國大陸城市（country=China，排除港澳）抓後以 opencc-js 轉繁體（`scripts/_toTraditional.mjs`）；OSM 若有 name:zh-Hant 亦優先採用。日本/台灣等**不轉**（避免誤改日文漢字）。
11. **站點必備欄位**：每個 node 一定有 `station_name` 與 `station_id`，缺任一者不輸出（線仍穿過）；`route_name_list` 由「站點必在線上、線必有名」保證非空。
12. **per-city 納入指定鐵道** `includeRail`：強制納入符合 regex 的 route=train 線（繞過跨境/直通/白名單，但仍排除「直通」變體），如「東京+山手線+中央線」版本。

## per-city 覆寫（src/utils/metroOverrides.js）

```js
'taiwan-taipei': {
  bbox: [s, w, n, e],                          // 覆寫 catalog bbox（如西延納桃園、北延納淡海）
  colorByName: [{ match: '淡水|信義', color: '#e3002c' }, ...], // 具體 family 排前、通用關鍵字排末
  dedupeByName: ['萬大|樹林', '環狀.*東環|東環段'],
},
'japan-tokyo': { keepOperators: '東京メトロ|東京地下鉄|Tokyo Metro|東京都交通局' },
'china-foshan': { dropByName: '广州|廣州|Guangzhou' },   // 剔除鄰市（廣州）誤抓線
'japan-tokyo-yamanote-chuo': {                            // 東京+JR山手線+中央線
  keepOperators: '東京メトロ|東京地下鉄|Tokyo Metro|東京都交通局',
  includeRail: '山手線|Yamanote|中央線|中央・総武|Chūō|Chuo',
  dedupeByName: ['山手|Yamanote', '中央線快速|中央線（', '中央・総武'],
},
```

可用覆寫欄位：`bbox`、`keepOperators`、`colorByName`、`dedupeByName`、`dropByName`、`includeRail`、`onlyLineName`、`clipToBbox`、`noNameMerge`。

- `clipToBbox`：營運線多數頂點落在 bbox 外即剔除（緊鄰城市群，鄰市線名/營運者無城市標記時用；需搭配收緊 bbox）。
- `noNameMerge`：停用同名車站合併（如紐約，不同線的同名站多為不同實體站）。

其他覆寫欄位：`includeUnopened`（強制納入指定未通車線，如台北三鶯線）、`extraStations`（手動補 OSM 缺漏的站並接到指定線，如台北廣慈/奉天宮）。

其他內建行為：**分支保留**（同一條線的多個關聯，依站集合重疊 <70% 視為真實分支一併保留，如倫敦 Central 的 Ealing/Hainault、新加坡 EW 樟宜支線、台北新北投/小碧潭支線）；**站序投影排序**（以軌道幾何縫成路徑排序站點，修正 OSM stop 順序錯置）；**未通車不畫**（construction/proposed/未來開通日一律剔除，除非 includeUnopened）。

⚠️ 路線中間不可有紅(交點)/藍(端點)點：站點分類（`src/utils/*/routeStations.js` 的 computeRouteMapStations）已改為——端點須是「未被其他線段共用的真線端」（分支接點不算端點）、交點須落在「不同 route_name 的線」上（同線分支接點不算交點）。此為渲染邏輯，重新整理即生效。

- `onlyLineName`：只保留 route_name 符合 regex 的線。用於「單線城市」（discovery 把單一路線當城市，bbox 會誤含整個都會網），如 `japan-yurikamome`、`united-states-path`、`taiwan-taoyuan`、`united-kingdom-docklands-light-railway`。若該線為 route=train（如東京りんかい線）需同時設 `includeRail`。

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
