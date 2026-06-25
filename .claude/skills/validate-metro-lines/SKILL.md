---
name: validate-metro-lines
description: Validate the metro GeoJSON dataset (public/data/metro) against Wikipedia's List of metro systems — checks each city's operating line count and line names, flags missing lines, over-fetch (neighbouring-city lines, duplicates, non-metro noise), and proposes per-city override fixes. Use after fetching/re-fetching, or to audit coverage and correctness. Pairs with the fetch-metro-geojson skill.
---

# 地鐵路線正確性驗證（對照 Wikipedia）

逐城把我們抓到的路線（線數、線名）對照 Wikipedia
[List of metro systems](https://en.wikipedia.org/wiki/List_of_metro_systems) 與各城市地鐵條目，
找出**缺漏**、**過度抓取**（誤含鄰市路線、同線重複變體、非地鐵雜訊如單軌/AirTrain/depot）。
抓取與清理屬另一個 skill：**fetch-metro-geojson**。

## 用多代理 workflow 平行驗證

- 工作流腳本：`.claude/skills/validate-metro-lines/validate.workflow.js`
- 取線 helper：`scripts/_cityLines.mjs <id>`（agent 用它讀我們目前的線名）
- 城市清單：`public/data/metro/_catalog.json`（取 `file` 非空者的 `id`）

### 執行

1. 產生要驗證的 city id 陣列（全部或子集）：
   ```bash
   node -e 'const c=require("./public/data/metro/_catalog.json");console.log(JSON.stringify(c.filter(x=>x.file).map(x=>x.id)))'
   ```
2. 以 **Workflow 工具**啟動，`args` 傳入該 **id 陣列**（必須是真正的 JSON 陣列；腳本亦容錯字串）：
   ```
   Workflow({ scriptPath: ".claude/skills/validate-metro-lines/validate.workflow.js", args: ["taiwan-taipei", ...] })
   ```
3. 每城一個 agent：`node scripts/_cityLines.mjs <id>` 取線 → WebFetch/WebSearch 查 Wikipedia（英文優先，缺則當地語言）→ 比對 → 回 `{verdict, wikiLineCount, ourLineCount, missing, extra, notes}`。

### 判讀規則（agent 內建）

- **視為同一條線**：不同語言/羅馬拼音、方向後綴（順行/逆行/Northbound）、分支變體。
- **不算 extra**：我們刻意納入的施工/計畫線（status≠open）。**不算 missing**：尚未通車的線。
- verdict：相符(允許命名差異)=ok；1 處小差異=minor；多處缺漏/多餘或抓錯城市=major。

回傳：`{ total, validated, okCount, major[], minor[] }`，major 依問題數排序。

## 從驗證結果到修正（餵回 fetch skill）

驗證 notes 會直接點出該怎麼修，多數對應 `src/utils/metroOverrides.js` 的 per-city 覆寫：

| 驗證發現 | 修正（metroOverrides.js / catalog） |
|---|---|
| 誤含鄰市路線（如 PATH 抓到紐約地鐵、Foshan 抓到廣州地鐵） | 收緊 `bbox`，或加 `keepOperators` 只留該市營運者 |
| 同線方向/分支重複 | 加 `dedupeByName: ['<family regex>']` |
| 非地鐵雜訊（單軌/AirTrain/depot/空名） | 收緊 bbox、keepOperators，或在 pipeline 過濾 |
| 缺營運中的線 | 確認 bbox 涵蓋、檢查該線在 OSM 的 route 標記；必要時放寬 bbox |
| 缺整個城市 | 在 `_catalog.json` 補 entry |

修正後重抓該城（fetch-metro-geojson skill 的 `node scripts/_refetchCities.mjs <id>`），再對該城重跑驗證確認。

## 已知典型案例（首輪驗證）

- `united-states-path`：bbox 誤含整個紐約都會區（24 條 NYC Subway + 輕軌 + AirTrain + 動物園單軌）→ 收緊 bbox / keepOperators=PATH。
- `china-foshan`：bbox 誤含約 20 條廣州地鐵 → 收緊 bbox / 排除廣州營運者；加 dedupeByName。
- `taiwan-taipei`：minor — 缺小碧潭支線；應移除「淡海機廠(depot)」與空名「G」→ dedupeByName / 過濾 depot。
