---
name: ai-test-hv-optimize
description: HV optimize for AI測試 layer — 鐵律：座標只能由 Cursor LLM 推理決定。LOCAL dev only. App writes payload; Agent LLM writes response via writeResponse.mjs. NO scripts, NO greedy, NO programmatic solving.
---

# AI測試 — HV 最佳化（僅本地 Cursor 開發）

## 鐵律

**座標只能由 Cursor LLM 推理決定。**

- 禁止任何自動求解腳本、greedy 演算法、程式迴圈產生 coords
- 禁止 Agent 執行 node 腳本來「算」座標（`writeResponse.mjs` 僅負責寫檔，不含求解）
- App 只做 payload 同步、幾何驗證、預覽、套用

**此功能不在正式部署使用。** 僅在 `npm run serve` + Cursor IDE 本地開發時運作。

## kind 不可變（必讀）

| kind | 顏色 | 可否平移 | 移動後 |
|------|------|----------|--------|
| crossing | 紅 | 可 | **必須仍是 crossing**（不可變藍） |
| endpoint | 藍 | 可 | 必須仍是 endpoint |
| bend | 粉紅 | 可 | 必須仍是 bend |
| vertex | 黑站/直線中點 | **不可** | 座標與 payload 完全相同 |

- 相鄰紅/藍/粉紅之間只能是**直線段**；中間 vertex 不是轉折點
- 不可新增/刪除 network 頂點；拉直時紅/藍/粉紅頂點仍須保留

## 拓撲結構關係是什麼？（移動後不可改）

**拓撲** = 路網的「誰跟誰連、順序如何、誰是誰」，**不是**座標位置。  
HV 最佳化**只准改 (x,y)**，以下關係移動前後必須完全一致：

| 關係 | payload 欄位 | 不可改變的內容 |
|------|-------------|----------------|
| **連接關係** | `network.edges` | 哪些 id 之間有邊（fromId→toId）；不可新增/刪除邊、不可改端點 id |
| **路線順序** | `topology.routeKeypointSequences` | 每條路線依序經過哪些 id；不可增刪、重排、合併或拆段 |
| **匯流／轉乘** | 同一 id 出現在多條 route | 同一紅點 id 仍連接**同一組**路線；不可把一個轉乘拆成兩個 id，或把兩個 id 併到同一座標冒充一點 |
| **360° 環序** | `topology.junctionRotationAtCrossings` | 每個紅點上，各相連支線依**離開角 CCW** 排序；移動後環序須與 baseline **完全相同**（不可對調任兩路線相對順序） |
| **端點歸屬** | kind=endpoint 的 id | 仍是該路線（段）的起點或終點，不可變成中途點或轉乘角色 |
| **頂點集合** | `movablePoints` | 同一組 id、同一 kind；不可新增/刪除/改 kind |

**可以變的**只有各 id 的整數格座標（幾何位置），用來拉直成 HV。  
**不可以**用移動製造「新路徑、新匯流、新分叉順序、新轉乘組合、紅點上路線 360° 環序對調」——那是改拓撲，不是平移。

## 紅點 360° 環序（移動後不可改）

每個 **紅點（crossing）** 是一個分歧／轉乘點。從該點出發，每條相連路線（支線）有一個**離開方向**（指向鄰接 id 的第一段方向角）。

- 將各支線依離開角 **逆時針（CCW）** 排序，得到一個 360° **環序**
- payload 的 `topology.junctionRotationAtCrossings` 列出 baseline 環序（`branchOrderCCW` = 鄰接 id 的 CCW 順序）
- **移動後**此環序須與 baseline **完全相同**（允許整圈旋轉視為相同，但不可對調任兩支線的相對順序）
- 與 app 內 `validate-junction-rotation` / `rotationStructure.js` 同概念
- 若平移紅點或鄰點會改變環序 → **不可移動**，維持原座標
- App 反驗證會拒絕 `JUNCTION_ROTATION_FLIP` 違規

**範例**：紅點 J 連接三支線 → 北（id=3）、東（id=7）、南（id=12）。baseline CCW 環序為 `[3,7,12]`。移動後不可變成 `[3,12,7]`（東、南對調）。

## 拉直，不是轉彎（核心）

- 相鄰紅/藍/粉紅之間**只有一條直線**；黑站不在 network 內
- 移動紅/藍/粉紅 = **把路線拉成 HV 直線**，**不是**新增路線轉折或 Z 形
- 無法在不新增轉折下改善 → **維持原座標**

## 路線方向不可翻轉（HV 拉直時）

對每一條 edge（移動前 baseline 的 dx, dy）：

| 移動前主方向 | 判定 | 拉直成 HV 後 |
|-------------|------|-------------|
| 偏水平 | \|dx\| > \|dy\| | **必須**是水平線（dy=0），不可變垂直 |
| 偏垂直 | \|dy\| > \|dx\| | **必須**是垂直線（dx=0），不可變水平 |
| 45° 對角 | \|dx\| = \|dy\| | 水平或垂直皆可 |

- 已是水平 HV 的段 → 移動後仍須水平；已是垂直 HV → 仍須垂直
- 若某次平移會讓段「翻向」（如偏水平段變垂直 HV）→ **該點不可移動**，維持原座標
- App 反驗證會拒絕 `DIRECTION_FLIP` 違規

## 套用順序（中位→向外 — **依 x/y 座標序列，非 id 序；僅 LLM 推理**）

1. 沿每條路線紅/藍/粉紅點的 **x 座標序列**與 **y 座標序列**（**不是** id 拓撲順序）：各路線 x、y **各自取中位數**為中心，從距中位最近者**往外**依序推理是否移動、移去哪一格（見 `applyStrategy.routeCoordinateCenters`、`movableApplyOrder`）。
2. **每移動一點**：牽動的所有 edges 中 HV 邊數須**嚴格增加**（路線變直）；否則**不動**（回傳原座標）。
3. **同距中位層**有多個可移點時，先處理**拉直增益最大**（新增 HV 邊最多）者。
4. 若某點有多個合法目標格，選**拉直最多**的那一格。

**禁止**用 node 腳本、greedy、迴圈搜格自動選點。App 只做幾何反驗證，**不**程式求解或排序增益。

## 流程

1. App **隨機產生**或**載入路線圖** → 按 **HV 最佳化** → 寫 `hv_payload.json`
2. Cursor 對話請 Agent「HV 最佳化」（本 skill）→ **LLM 推理** → 寫 `hv_response.json`
3. 再按 **HV 最佳化** → 虛線預覽 → **執行（套用移動）**

## Agent 必做（僅 LLM 推理）

1. 讀 `public/data/ai_test/hv_payload.json`（含 `routesFingerprint`、`network`）
2. 讀 `HV_OPTIMIZE_SYSTEM_PROMPT`（`uniformGridHvOptimize.js` 或 `prompt-template.md`）
3. **在對話中用 LLM 推理**每個可移動點的新 (x,y)：
   - **只平移** kind=crossing（紅）/ endpoint（藍）/ bend（粉紅）
   - **不可移動** kind=vertex；回傳原座標
   - **紅點不可變藍**；kind 不可改
   - **目的：拉直**——相鄰拓撲點之間僅 HV 直線；**禁止**製造新轉折
   - **方向鎖定**：偏水平段→水平 HV；偏垂直段→垂直 HV；45°→兩者皆可；不可翻向
   - **套用順序（僅 LLM 推理）**：各路線依 x、y 座標序列（非 id 序）從中位往外；每步須拉直（牽動邊 HV↑）；同層選增益最大；禁止程式搜格
   - **拓撲結構關係不可變**（只改座標）：edges 連接、route 上 id 順序、轉乘 id 匯流組合、端點歸屬、**各紅點 360° CCW 環序**皆不可改
   - 拓撲不可變；整數格、不重疊
   - **禁止新增跨路線交叉**
   - `coords` 須涵蓋**全部** movable id
4. 用 `writeResponse.mjs` 寫入推理結果：

```bash
node .claude/skills/ai-test-hv-optimize/writeResponse.mjs '{"routesFingerprint":"…","computedBy":"llm","model":"Composer","coords":[{"id":0,"x":4,"y":4},...]}'
```

```json
{
  "routesFingerprint": "<與 payload 完全相同>",
  "computedBy": "llm",
  "model": "<本對話使用的 Cursor model 名稱>",
  "coords": [{"id": 0, "x": 1, "y": 2}, ...]
}
```

`computedBy` 非 `"llm"` 的回覆會被 App 拒絕。

## 反驗證（Agent 可選，不改 App 介面）

寫完 response 後可跑 **validate-ai-test-hv** skill：

```bash
node --loader ./loader.mjs .claude/skills/validate-ai-test-hv/checkHvResponse.mjs
```

FAIL 時依 `hv_audit.json` 修正 LLM coords 再 writeResponse。使用者仍只按 App 原有「HV 最佳化」按鈕。

## 核心檔案

- `public/data/ai_test/hv_payload.json` — App（dev）寫入
- `public/data/ai_test/hv_response.json` — Agent（LLM）寫入
- `src/utils/uniformGridHvOptimize.js` — 規則與驗證（不求解）
- `src/utils/uniformGridHvOptimizeExecute.js` — 同步 / 載入 / 套用
- `.claude/skills/ai-test-hv-optimize/writeResponse.mjs` — 寫 response（不求解）
