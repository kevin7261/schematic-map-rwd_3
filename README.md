# 🗺️ Schematic Map 3 — 八方向示意圖佈局與比較平台

[![Vue.js](https://img.shields.io/badge/Vue.js-3.2-4FC08D?style=flat-square&logo=vue.js)](https://vuejs.org/)
[![D3.js](https://img.shields.io/badge/D3.js-7.8-F9A03C?style=flat-square&logo=d3.js)](https://d3js.org/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?style=flat-square&logo=leaflet)](https://leafletjs.com/)
[![Pinia](https://img.shields.io/badge/Pinia-2.1-FFD859?style=flat-square&logo=pinia)](https://pinia.vuejs.org/)
[![HiGHS](https://img.shields.io/badge/Solver-HiGHS%20(WASM)-2563EB?style=flat-square)](https://highs.dev/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=flat-square&logo=bootstrap)](https://getbootstrap.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

> **Schematic Map 3** 是一個運行於瀏覽器的**捷運／地鐵路網示意圖（schematic map）自動生成與演算法比較平台**。
> 它把真實世界的 OpenStreetMap 路網資料，經過一條多階段的資料管線，轉換成**精確八方向（octilinear，8 方向）**的抽象路網圖；並在**同一套精確的 MILP（混合整數線性規劃）硬約束引擎**上，重現並比較三篇經典論文的佈局方法。整個求解過程在 Web Worker 中即時執行，並提供桌面／平板／手機的響應式介面。
>
> 本專案為碩士論文之實作系統。所有程式碼皆附詳細中文 JSDoc 註解。

---

## 📋 目錄

- [專案定位與學術背景](#-專案定位與學術背景)
- [核心功能總覽](#-核心功能總覽)
- [三種示意圖佈局方法](#-三種示意圖佈局方法)
- [八方向 MILP 求解引擎](#-八方向-milp-求解引擎)
- [資料處理管線](#-資料處理管線)
- [技術棧](#-技術棧)
- [快速開始](#-快速開始)
- [專案結構](#-專案結構)
- [前端介面架構](#-前端介面架構)
- [狀態管理（dataStore）](#-狀態管理datastore)
- [資料格式與資料集](#-資料格式與資料集)
- [離線批次預運算](#-離線批次預運算)
- [Claude Code Skills（資料維護）](#-claude-code-skills資料維護)
- [建置與部署](#-建置與部署)
- [開發指南](#-開發指南)
- [故障排除](#-故障排除)
- [文件與變更紀錄](#-文件與變更紀錄)
- [授權與聯絡](#-授權與聯絡)

---

## 🎯 專案定位與學術背景

**示意圖（schematic map / metro map）** 是一種刻意犧牲地理精確度、換取可讀性的路網表示法：所有路線只允許落在 **8 個方向**（水平、垂直、以及 45° 對角，即 E、NE、N、NW、W、SW、S、SE）上，這就是所謂的 **octilinear（八方向）** 限制。倫敦地鐵圖是最著名的範例。

要從真實座標自動產生這種圖，本質上是一個帶有大量幾何與拓樸硬約束的最佳化問題。本專案：

1. **重現三篇經典論文的方法**，並把它們放在**同一個求解框架**下做公平比較；
2. 以 **Taipei 捷運**（及其他城市）的真實 OSM 資料為輸入；
3. 提供一條可逐步檢視的**資料管線**，把地理路網逐步「拉直 → 抽象化 → 格網化 → 加權 → 壓縮 → 指數縮放」；
4. 在瀏覽器中以 **HiGHS（WASM）** 求解器即時計算，並保證輸出**零交叉、零重疊、零節點重合、嚴格八方向**。

> 三個比較圖層的論文出處（節錄自 `src/utils/layers/schematic_layout/layerIds.js`）：
> - **#1 Li & Dong (2010)** — stroke-based 八方向示意圖方法
> - **#2 Stott & Rodgers (2011)** — Hill Climbing 多準則最佳化
> - **#3 Nöllenburg & Wolff (2011)** — *Drawing High-Quality Metro Maps by Mixed-Integer Programming*（八方向 MILP）

---

## ✨ 核心功能總覽

| 類別 | 功能 |
|------|------|
| 🧮 **演算法比較** | 三種示意圖佈局方法（Stroke / Hill Climbing / MILP）共用同一精確八方向引擎，可一鍵切換、即時求解、並列比較 |
| 🛰️ **資料管線** | OSM → GeoJSON → JSON → 拉直 → 格網化 → 加權 → 壓縮 → 指數格網，全程可逐階段檢視與匯出 |
| 🗺️ **地圖底圖** | 整合 Leaflet 互動式地圖，可在地理底圖上繪製、編輯、匯入站點與路段 |
| 📊 **多重視覺化** | D3.js 繪製格網示意圖、空間網絡圖、版面網格、權重縮放圖等多種視圖 |
| ⚙️ **即時求解** | 佈局運算在 Web Worker 執行，主執行緒不凍結，全螢幕 overlay 即時顯示經過時間與進度 |
| 📱 **響應式介面** | 桌面四面板、平板上下兩層、手機單欄分頁，皆可拖拉調整面板比例 |
| 📋 **資料檢視** | 每個圖層皆有對應的 JSON 原始資料分頁、資料表格、屬性面板與統計儀表板 |
| 🌏 **多城市資料** | 內建 Taipei、Kaohsiung、Taichung、Hong Kong、London、New York、Tokyo 等路網資料 |

---

## 🧩 三種示意圖佈局方法

三種方法**共用建圖、骨架抽取與渲染流程**，只在「初始化方式」與「目標函數權重」上不同——藉此忠實反映各篇論文的設計精神（出自 `src/utils/layers/schematic_layout/solveSchematic.js`）：

```js
const PROFILES = {
  stroke:    { init: 'stroke', weights: { wBend: 2,   wRpos: 1,   wLen: 0.05 } },
  hillclimb: { init: 'hill',   weights: { wBend: 1,   wRpos: 2,   wLen: 0.1  } },
  milp:      { init: 'geo',    weights: { wBend: 1.5, wRpos: 1.5, wLen: 0.1  } },
};
```

| 圖層 ID | 方法 | 論文 | 初始化 | 權重特徵（精神） |
|---------|------|------|--------|------------------|
| `schematic_stroke` | **Stroke** | Li & Dong (2010) | stroke 分段法求方向偏好 | `wBend=2`（最重直線性）→ 偏好長而連續的線條 |
| `schematic_hillclimb` | **Hill Climbing** | Stott & Rodgers (2011) | 冷卻式局部搜尋（Hill Climbing）| `wRpos=2`（最重方向偏好）→ 多準則平衡 |
| `schematic_milp` | **MILP** | Nöllenburg & Wolff (2011) | 地理初始座標 | `1.5 / 1.5`（平衡）→ 論文基準 |

> 衍生圖層：`schematic_milp_read`（鏡像讀取 MILP 結果）、`schematic_milp_straighten`（自 MILP 結果做紅／藍 connect 拉直）。

**共同流程**（`solveSchematic.js`）：

1. 由 connect 骨架建圖（站點為紅／藍頂點，區段為邊），並把 degree > 8 的高度數節點拆分；
2. 以選定方法做初始化，萃取每條邊的**方向偏好（preferred direction）**；
3. 呼叫共用的 `runOctilinearLayout()`，帶入該方法的權重與方向偏好；
4. 求解完成後把**黑點站點**沿邊以弧長比例內插放回，再渲染。

三種方法的**軟性目標**一致（`milp/buildMilpModel.js`）：
- **S1 直線性**：同一路線相鄰邊應盡量同向（避免彎折）；
- **S2 相對位置**：懲罰偏離方向偏好的邊；
- **S3 總長度**：以 L∞ 上界最小化邊長。

---

## ⚙️ 八方向 MILP 求解引擎

核心位於 `src/utils/layers/schematic_layout/milp/`，求解器為 **HiGHS**，以 **WebAssembly** 在瀏覽器內執行（`highsLoader.js` 動態載入，失敗時回退至 CDN）。

### 兩階段求解（保證可行且精確）

出自 `milp/runOctilinearLayout.js`：

**Phase 1 — 連續座標 + 惰性 H4（消除交叉）**
- 以連續 X/Y 變數搭配二元方向指示變數求解；
- 解出後偵測交叉邊對 → 加入 H4 分離約束 → 重解，反覆直到**零交叉**；
- 從解中萃取並固定每條邊的方向。

**Phase 2 — 釘死方向 + 整數座標 + 惰性節點分離（消除重合）**
- 把 Phase 1 的方向釘死、座標改為整數變數（求解極快）；
- 偵測座標重合的節點 → 加入分離約束 → 重解，直到**零節點重合**。

### 硬約束（保證輸出品質）

| 約束 | 論文章節 | 作用 |
|------|----------|------|
| **H1 / H3** | §4.2 | 每條邊限制在最接近的 3 個八方向之一；座標對齊 + 最小邊長 |
| **H2** | §4.3 | 維持節點周圍邊的環狀順序（rotation order）→ 保平面性 / 不交叉 |
| **H4**（惰性） | §4.4 | 非相鄰邊對至少在 8 方向之一被 d_min 分離 → 防止交叉／重疊／塌陷 |
| **分離**（Phase 2） | — | 任兩相異節點至少相隔一個格網單位 |

求解後由 `repair.js` 的 `countViolations()` 進行事後驗證，統計：非八方向邊、交叉、重疊、節點重合——皆應為 **0**。

### Web Worker 即時求解

- `runLiveLayout.js`（主執行緒）解析輸入、建立全螢幕 overlay（即時計時器），並派生 Web Worker；
- `schematicWorker.js`（Worker 執行緒）呼叫 `solveSchematic()`，透過 `postMessage` 回報進度；
- 主執行緒即時更新狀態文字、完成後套用座標、放回黑點站點、輸出耗時與違規統計。
- 因此即使求解耗時數十秒，**UI 也不會凍結**。

### 關鍵資料結構（`graph.js`）

```text
graph = {
  nodes:    [{ id, key, x, y, refs:[{si,pi}] }],   // key = 站名 | 站號 | connect 編號
  edges:    [{ id, u, v, route_name, routes:Set, sections:[…] }],
  incident: [[edgeId,…], …]                         // incident[nodeId]
}
coords[nodeId] = [x, y]                              // 整數格網座標（非經緯度）
```

---

## 🛰️ 資料處理管線

真實 OSM 路網要變成示意圖，需經過一條編號化的管線（`src/utils/dataExecute/`，由 `index.js` 統籌）。階段命名 `X_Y_to_X_Y` 代表「由產物 X.Y 推進到 X.Y」：

| 階段檔案 | 概念階段 | 內容 |
|----------|----------|------|
| `execute_1_0_to_1_1` | **① OSM → GeoJSON** | 自 OSM XML 萃取路線，依站間最小距離決定格網單位，座標貼齊整數格，線段切成點對點區段 |
| `execute_1_1_to_1_2` | ① 線性化 | 進一步座標正規化為 raw 線性化 JSON |
| `execute_1_2_to_2_1` | **② 交叉點拉直** | 找出連接節點（交叉／端點），把中間點以等距線性內插取代 |
| `execute_2_1_to_2_2` | ② 抽象格網化 | 貼齊較粗格網（Grid Size = 5），同步站點屬性 |
| `execute_2_2_to_2_3` … `2_9_to_2_10` | ② 漸進精煉 | 座標正規化、H/V 軸對齊、N 形消除、flip-L 消除、空格網線修剪、黑點站點放置、區段切分、站點資料表建立 |
| `execute_2_10_to_3_1` | ② → ③ | 收斂輸出 |
| `execute_3_1_to_4_1` | **③ 結構標記** | 為路段標上站點連通性中介資料 |
| `execute_4_1_to_6_1` | **④ 權重指派** | 為「站到站」路徑指派離散權重（1–9），計算權重文字中點 |
| `execute_6_1_to_7_1` | **⑥→⑦ 壓縮 + 指數格網** | 移除相鄰權重相等／相近的中介站並壓縮空隙；最終以 `cell = 2^int(weight)` 指數縮放 |

> 另有 `dataProcessor.js`（資料載入核心）、`taipeiTest3/`、`taipeiDataProcTest3/`、`taipeiTest4/`、`layers/` 等子管線，對應介面上不同的測試流程與圖層家族。

---

## 🧰 技術棧

### 前端框架
- **Vue 3** — Composition API（`<script setup>` 與 `setup()` 並用）
- **Vue Router 4** — HTML5 History 模式，base 為 `/schematic-map-rwd_3/`
- **Pinia 2** — 集中式狀態管理（`stores/dataStore.js`）

### 視覺化與地圖
- **D3.js 7** — SVG 資料驅動渲染（格網、網絡、版面網格、權重縮放）
- **Leaflet 1.9** — 互動式地理底圖、繪製與匯入
- **Bootstrap 5** + **Font Awesome 6** — 響應式 UI 與圖示

### 演算法與運算
- **HiGHS（`highs` ^1.14, WASM）** — 八方向 MILP 求解器
- **elkjs ^0.11** — 圖形自動佈局輔助
- **@xmldom/xmldom** — OSM XML 解析（轉 GeoJSON）
- **Web Worker** — 背景求解，UI 不凍結

### 建置工具
- **Vue CLI 5（webpack）** — 實際使用的建置工具（`vue.config.js`）
  - 啟用 `experiments.asyncWebAssembly`（載入 HiGHS WASM）
  - `NormalModuleReplacementPlugin(/^node:/, …)` 處理 emscripten 的 `node:` scheme
  - dev server：`port 8080`、`host 0.0.0.0`、排除 `public/data/` 監看
  - dev 端 `/api/save-result` middleware 可把結果寫回 `public/data/result/`
- **Babel**（`useBuiltIns: 'usage'`, `core-js 3`）、**ESLint**、**Prettier**（2 空格、100 字寬、單引號）

> ⚠️ 倉庫中存在 `vite.config.js`，但**並未使用**——它是早期遷移實驗的遺留檔，實際建置一律走 Vue CLI / webpack。

---

## 🚀 快速開始

### 環境需求
- **Node.js** ≥ 16（建議 18 LTS；HiGHS WASM 與 webpack 5 需較新版本）
- **npm** ≥ 8

### 安裝與啟動

```bash
# 1. 取得原始碼
git clone https://github.com/kevin7261/schematic-map-rwd_3.git
cd schematic-map-rwd_3

# 2. 安裝相依套件
npm install

# 3. 啟動開發伺服器（http://localhost:8080）
npm run serve
```

開啟瀏覽器後，於左側面板開啟圖層、切換至對應分頁，即可逐步檢視資料管線各階段，或對示意圖圖層執行 Stroke / Hill Climbing / MILP 佈局求解。

---

## 📁 專案結構

```
schematic-map-rwd_3/
├── public/
│   └── data/                       # 各城市路網資料與管線各階段產物
│       ├── taipei_260315/          # Taipei 主資料集（step01–step07）
│       ├── taipei*/  taipei_city*/ # Taipei 其他變體
│       ├── hongkong/ london/ newyork/ tokyo/ kaohsiung/ taichung/
│       └── result/                 # dev API 寫回的求解結果
├── src/
│   ├── main.js                     # 進入點：掛載 Vue + Pinia + Router + Bootstrap
│   ├── App.vue                     # 根組件（<router-view>）
│   ├── router/index.js             # 單一路由 '/' → HomeView，其餘導回首頁
│   ├── config/mapDefaults.js       # 地圖預設值
│   ├── views/                      # 版面骨架（見「前端介面架構」）
│   │   ├── HomeView.vue            #   主頁 + 響應式四面板協調
│   │   ├── LeftView / RightView / MiddleView / UpperView /
│   │   │   BottomView / ResponsiveLowerView.vue
│   ├── tabs/                       # 功能分頁（見下）
│   ├── components/
│   │   ├── LoadingOverlay.vue
│   │   └── DetailItem.vue
│   ├── stores/
│   │   ├── dataStore.js            # 核心狀態：圖層、選取要素、各圖層資料
│   │   └── defineStore.js
│   ├── utils/
│   │   ├── dataProcessor.js        # 資料載入核心
│   │   ├── dataExecute/            # 編號化管線（execute_*_to_*.js）
│   │   └── layers/
│   │       ├── schematic_layout/   # ★ 八方向佈局演算法核心
│   │       │   ├── solveSchematic.js / schematicWorker.js / runLiveLayout.js
│   │       │   ├── graph.js / objective.js / repair.js / assemble.js
│   │       │   ├── milp/            # buildMilpModel / runOctilinearLayout / highsLoader …
│   │       │   ├── stroke/          # Li & Dong (2010)
│   │       │   └── hillClimb/       # Stott & Rodgers (2011)
│   │       ├── json_grid_coord_normalized/   # 座標正規化／格網家族
│   │       ├── osm_2_geojson_2_json/         # OSM → GeoJSON → JSON
│   │       └── …
│   └── assets/css/                 # variables.css / common.css
├── scripts/                        # 離線批次與維護工具（見下）
├── docs/                           # 功能文件
├── vue.config.js                   # 實際使用的 webpack 設定
├── vite.config.js                  # （遺留，未使用）
└── package.json
```

---

## 🖥️ 前端介面架構

### 版面與響應式斷點

由 `HomeView.vue` 統籌，依螢幕寬度切換三種版面：

| 裝置 | 斷點 | 版面 |
|------|------|------|
| 🖥️ 桌面 | `xl+`（≥1200px） | **四面板**：左（控制）／中（地圖＋表格）／右（屬性／資訊），面板可拖拉調整大小 |
| 📱 平板 | `md–lg`（768–1199px） | **上下兩層**，分頁式導航 |
| 📱 手機 | `sm-`（<768px） | **單欄**，分頁式導航 |

面板組成：
- **LeftView** — 圖層管理與控制項
- **MiddleView** → **UpperView**（地圖／儀表板／D3 圖表）+ **BottomView**（資料表格），中間有垂直拖拉調整器
- **RightView** — 屬性資訊與圖層資訊
- **ResponsiveLowerView** — 行動版整合圖層／表格／屬性／圖層資訊分頁

### 主要分頁（`src/tabs/`）

| 分頁 | 用途 |
|------|------|
| `LayersTab` | 圖層樹狀清單、開關、載入狀態 |
| `ControlTab` | 管線執行與佈局求解的控制面板 |
| `MapTab` | Leaflet 地理底圖、繪製／編輯／匯入站點與路段 |
| `D3jsTab` | D3 格網示意圖視覺化（含網格節點多值顯示） |
| `DashboardTab` | 統計摘要儀表板 |
| `DataTableTab` | 多圖層資料表（排序／篩選／分頁） |
| `PropertiesTab` / `LayerInfoTab` | 選取要素屬性 / 圖層分析結果 |
| `GridScalingTab` | 權重指數格網縮放視覺化 |
| `SpaceNetworkGridTab`（+ `K3` / `L3`） | 空間網絡格網視覺化（示意圖管線主視圖） |
| `LayoutGridTab`（+ `Test` / `Test3` / `Test4`） | 版面網格佈局視覺化（各測試流程） |
| `*JsonDataTab`（如 `SpaceNetworkGridJsonDataTab`、`LayoutGridJsonDataTab`、`ProcessedJsonDataTab`、`DrawJsonDataTab`） | 各視覺化分頁對應的**原始 JSON 資料檢視器** |

> 命名規則：`XxxTab.vue` 為視覺化視圖，對應的 `XxxJsonDataTab.vue` 為其底層 JSON 資料檢視器；`K3` / `L3` / `Test3` / `Test4` 為不同資料流程的變體。

---

## 🗃️ 狀態管理（dataStore）

`src/stores/dataStore.js`（Pinia）集中管理整個應用的資料層：

**State（節錄）**
- `layers` — 分組的圖層設定
- `layerStates` — 每個圖層的可見性／載入狀態／資料
- `selectedFeature` — 目前選取的要素
- 各圖層資料欄位：`jsonData`、`processedJsonData`、`geojsonData`、`spaceNetworkGridJsonData`、`layoutGridJsonData`、`dashboardData`、`dataTableData`
- `d3jsDimensions` 等視圖尺寸

**主要 Actions**

| 方法 | 說明 |
|------|------|
| `findLayerById(id)` / `getAllLayers()` | 依 ID 尋找 / 取得攤平後的全部圖層 |
| `toggleLayerVisibility(id)` | 切換圖層可見性（必要時觸發載入） |
| `reloadLayer(id)` | 強制重新載入圖層資料 |
| `setSelectedFeature(f)` / `clearSelectedFeature()` | 設定 / 清除選取要素 |
| `saveLayerState(id, state)` | 持久化圖層狀態 |
| `setShowStationNames()` / `setShowGrid()` / `setEnableWeightScaling()` | 視覺化開關 |
| `updateD3jsDimensions()` 等 | 同步各視圖尺寸 |

使用範例：

```js
import { useDataStore } from '@/stores/dataStore';
const dataStore = useDataStore();

await dataStore.toggleLayerVisibility('schematic_milp');   // 開啟並求解 MILP 圖層
const visible = dataStore.getAllLayers().filter((l) => l.visible);
```

---

## 📐 資料格式與資料集

### 行政區／路線示意圖格式

```json
[
  {
    "name": "淡水信義線",
    "color": "#E3002C",
    "nodes": [{ "coord": { "x": 0, "y": 0 }, "value": 1, "type": 1 }]
  }
]
```

### 標準地理資料（GeoJSON 風格）

```json
{ "name": "台北車站", "id": "R10", "type": "station",
  "geometry": { "type": "Point", "coordinates": [121.5170, 25.0478] },
  "properties": { "route_id": "R", "color": "#E3002C" } }
```

### 內建資料集

- **主資料集**：Taipei 捷運（臺北捷運），源自 OSM `railway=subway` 路線，含路線色碼、站點與幾何。
- **多城市**：Kaohsiung、Taichung、Hong Kong（MTR）、London（Underground）、New York（Subway）、Tokyo（Metro）。
- **管線階段產物**：`public/data/taipei_260315/step01–step07/` 內含每階段的 `*.json` 與對應 `*.png` 視覺化截圖：

  | 資料夾 | 階段 | 代表檔 |
  |--------|------|--------|
  | `step01` | OSM 萃取 / 線性化 / 正規化 | `01_osm2geojson` · `02_linearized_raw` · `03_normalize` |
  | `step02` | 拉直 / 抽象化 / Z 佈局 / 最佳化 | `01_straighten` … `04_final_optimized` |
  | `step03` | 結構標記 | `1_structure_tagged` |
  | `step04` | 權重指派 | `1_structure_weighted` |
  | `step05` | 版面格網 | `2_layout_grid` |
  | `step06` | 壓縮簡化 | `1-1/1-2/1-3_compressed` |
  | `step07` | 指數格網比較 | `7_comparison_exponential_grid` |

---

## 🧱 離線批次預運算

精確 MILP 在大型路網上可能耗時，`scripts/` 提供離線預運算與維護工具：

| 腳本 | 用途 |
|------|------|
| `generateSchematicLayouts.mjs` | 在 Node 端離線預先計算三種示意圖佈局（精確八方向 MILP），輸出 `public/data/taipei/schematic_{stroke,hillclimb,milp}.json` 供前端直接載入 |
| `remove-cross-river.mjs` | 清除資料中的 `cross_river` 偽站點，並重建站點／邊權重 |
| `remove-console.js` / `remove-console-ast.js` | 移除程式碼中的 `console.*`（字元解析版／AST 版） |

```bash
node --no-warnings scripts/generateSchematicLayouts.mjs
```

---

## 🤖 Claude Code Skills（資料維護）

專案在 `.claude/skills/` 內含兩個 [Claude Code](https://claude.com/claude-code) skill，
專責維護「選擇路線圖」分頁所載入的全球地鐵資料集 `public/data/metro/`。
資料授權：© OpenStreetMap contributors（ODbL）。**fetch 負責產生、validate 負責驗收。**

| Skill | 用途 | 何時使用 |
|-------|------|---------|
| **`fetch-metro-geojson`** | 從 OpenStreetMap（Overpass）把全球地鐵／都市軌道抓成統一的扁平 GeoJSON（每線一個 `way`、每站一個 `node`），輸出至 `public/data/metro/<洲>/<國>/<市>.geojson`，並逐檔結構驗證。內建清理規則：跨境過濾、日本直通運轉剔除、施工／計畫線縫合、同名車站合併、per-city 營運者白名單／配色／去重。 | 新增城市、規則改動後重抓、修正某城路線／配色／車站、對照 Wikipedia 補齊覆蓋率 |
| **`validate-metro-lines`** | 逐城把抓到的線數／線名對照 Wikipedia [List of metro systems](https://en.wikipedia.org/wiki/List_of_metro_systems)，找出**缺漏**與**過度抓取**（誤含鄰市線、同線重複、單軌／AirTrain／depot 等非地鐵雜訊），以多代理 workflow 平行驗證並回報修正建議。與 `fetch-metro-geojson` 搭配。 | 抓取／重抓後做覆蓋率與正確性稽核 |

### 關鍵檔案

| 檔案 | 角色 |
|------|------|
| `src/utils/metroOsmFetch.js` | 通用抓取 pipeline（Overpass 查詢 → 處理 → 清理 → 輸出），瀏覽器／Node 共用 |
| `src/utils/metroOverrides.js` | per-city 覆寫（`bbox` / `keepOperators` / `colorByName` / `dedupeByName` / `dropByName`） |
| `scripts/discoverMetroSystems.mjs` | 全球探索 `route=subway` 系統 → 產生 `_catalog.json` |
| `scripts/fetchAllFromCatalog.mjs` | 依 catalog 抓全部城市（可續跑；`--force` 重抓） |
| `scripts/_refetchCities.mjs` | 重抓指定城市：`node scripts/_refetchCities.mjs <id> [<id>…]` |
| `scripts/validateMetroGeojson.mjs` | 結構驗證（欄位、空值、重複線、孤立 node…） |
| `scripts/_cityLines.mjs` | 讀某城目前線名（驗證 workflow 用） |
| `public/data/metro/_catalog.json` | 城市清單（`id, city, country, continent, bbox, file, countryZh, cityZh`） |

> 兩個 skill 由 Claude Code 觸發；在對話中描述需求（如「新增大阪」「重抓東京」「稽核全部城市」）即會載入對應 skill 執行。

---

## 🏗️ 建置與部署

```bash
npm run serve         # 開發伺服器（:8080）
npm run build         # 生產建置（輸出 dist/）
npm run lint          # ESLint 檢查
npm run lint:fix      # ESLint 自動修復
npm run prettier      # Prettier 格式化
npm run format        # prettier + lint:fix
npm run deploy        # 建置並透過 gh-pages 發佈
```

部署到 **GitHub Pages**（`gh-pages -d dist --no-history`）後可於下列網址使用：

➡️ **<https://kevin7261.github.io/schematic-map-rwd_3>**

> base path 由 `vue.config.js` 的 `publicPath: '/schematic-map-rwd_3/'` 與 Router 的 `createWebHistory('/schematic-map-rwd_3/')` 一致設定。

---

## 🛠️ 開發指南

### 程式碼風格與註解
- 全專案統一 2 空格縮排、100 字寬、單引號（`.prettierrc.js`）。
- **所有函式／組件須附中文 JSDoc 註解**（功能、參數、回傳、範例），這是本專案的既定慣例。

```js
/**
 * 📊 計算圖層統計數據
 * @param {Array<Object>} nodes 節點陣列
 * @param {string} [field='value'] 統計欄位
 * @returns {{min:number,max:number,avg:number}} 統計結果
 */
function calculateLayerStatistics(nodes, field = 'value') { /* … */ }
```

### 組件放置原則
- 通用組件 → `src/components/`
- 功能分頁 → `src/tabs/`
- 版面骨架 → `src/views/`

### 提交訊息（語義化）
`feat:` / `fix:` / `docs:` / `style:` / `refactor:` / `test:` / `chore:`

---

## 🐞 故障排除

| 問題 | 可能原因與解法 |
|------|----------------|
| **HiGHS / WASM 載入失敗** | 確認 webpack `asyncWebAssembly` 已啟用；本機載入失敗時 `highsLoader.js` 會回退 CDN，需網路連線 |
| **佈局求解很久 / 看似卡住** | 求解在 Web Worker 進行，overlay 會顯示即時耗時；大型路網的精確 MILP 本就需數十秒，請等待 Phase 1/2 完成 |
| **求解後仍有交叉／重疊** | 檢查 `repair.js` 的 `countViolations()` 輸出；正常情況四項違規皆應為 0，若非 0 多半是輸入骨架資料異常 |
| **資料載入失敗** | 核對 `public/data/…` 路徑與 base path；確認 JSON 格式符合該圖層預期 |
| **響應式版面異常** | 檢查 Bootstrap 斷點與面板拖拉狀態；於不同尺寸重新整理 |
| **GitHub Pages 404 / 白畫面** | 確認 `publicPath` 與 Router base 一致，且以 `npm run deploy` 發佈 `dist/` |

調試工具：瀏覽器 DevTools（Console / Network / Sources）、Vue DevTools、overlay 進度面板。

---

## 📚 文件與變更紀錄

- `docs/GRID_VALUES_DOCUMENTATION.md` — 網格節點「多值顯示」功能（每節點顯示自身值與上下／左右鄰列最小值）的完整規格。
- `docs/QUICK_START_GRID_VALUES.md` — 網格多值顯示快速入門。
- `docs/PACKAGE_JSON_DOCUMENTATION.md` — `package.json` 各依賴與腳本逐項說明。
- `CHANGELOG_GRID_VALUES.md` — 網格多值顯示功能變更紀錄。

---

## 📄 授權與聯絡

本專案採用 **MIT 授權**，詳見 [LICENSE](LICENSE)。

- **作者**：Kevin Cheng
- **GitHub**：[@kevin7261](https://github.com/kevin7261)
- **線上展示**：<https://kevin7261.github.io/schematic-map-rwd_3>
- **問題回報**：<https://github.com/kevin7261/schematic-map-rwd_3/issues>

### 致謝
[Vue.js](https://vuejs.org/) · [D3.js](https://d3js.org/) · [Leaflet](https://leafletjs.com/) · [HiGHS](https://highs.dev/) · [Pinia](https://pinia.vuejs.org/) · [Bootstrap](https://getbootstrap.com/) · [OpenStreetMap](https://www.openstreetmap.org/)

以及三篇奠定本系統演算法基礎的論文：**Li & Dong (2010)**、**Stott & Rodgers (2011)**、**Nöllenburg & Wolff (2011)**。

---

**⭐ 若本專案對您有幫助，歡迎給予 Star，或透過 GitHub Issues 交流。**
