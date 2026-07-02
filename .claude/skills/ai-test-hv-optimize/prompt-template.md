# AI測試 HV 最佳化 — LLM 推理規則（僅本地 Cursor 開發）

## 鐵律

**座標只能由 Cursor LLM 推理決定。** 禁止腳本、greedy、程式迴圈求解。`writeResponse.mjs` 只寫檔，不算座標。

## 輸入

讀 `public/data/ai_test/hv_payload.json`：
- `routesFingerprint` — 寫 response 時必須相同
- `network.movablePoints` — 各 id 的 x,y,kind
- `network.edges` — 連接與 isHv
- `network.topology.routeKeypointSequences` — 拓撲骨架（不可改）

完整 System prompt：`src/utils/uniformGridHvOptimize.js` → `HV_OPTIMIZE_SYSTEM_PROMPT`

## kind 不可變（重大）

- **紅（crossing）移動後仍是紅**，絕不可變藍（endpoint）或粉紅以外 kind
- **藍（endpoint）移動後仍是藍**；**粉紅（bend）移動後仍是粉紅**
- payload 中 `kind=vertex` 的 id **不可移動**（黑站不在 network 內）

## 拉直，不是轉彎（核心任務）

- 相鄰兩個拓撲點（紅/藍/粉紅）之間**只有一條直線**；黑站畫在線段上，不是轉折點
- 平移紅/藍/粉紅的**目的**：讓這些直線變 **水平或垂直（HV）**，**拉直路線**
- **禁止**製造新的折角、Z 形、繞路轉折
- **禁止**把原先可共線的段移成斜線再折回
- 若無法在不新增轉折下改善 HV，該點**維持原座標**

## 路線方向不可翻轉（HV 拉直時）

對每條 edge，看移動前 baseline 的 |dx| vs |dy|：

- **|dx| > |dy|**（偏水平）→ 拉直後必須是**水平** HV（dy=0），不可變垂直
- **|dy| > |dx|**（偏垂直）→ 拉直後必須是**垂直** HV（dx=0），不可變水平
- **|dx| = |dy|**（45°）→ 拉直成水平或垂直**皆可**
- 已是水平／垂直 HV 的段，移動後須維持同向
- 若平移會翻向 → **不可移動**，維持原座標

## 套用順序（中位→向外 — **依 x/y 座標序列，非 id 序；LLM 在對話中完成**）

1. 沿每條路線紅/藍/粉紅點的 **x 座標序列**與 **y 座標序列**（**不是** id 拓撲順序）：各路線 x、y 各自取中位數，從距中位最近者**往外**推理（見 `applyStrategy.routeCoordinateCenters`、`movableApplyOrder`）。
2. 每移一點：牽動 edges 的 HV 數須**嚴格增加**，否則**不動**（回傳原座標）。
3. 同距中位層多點可移 → 先處理**拉直增益最大**者。
4. 一點有多個合法目標格 → 選**拉直最多**的那格。

App 不做幾何驗證也不替 LLM 搜格；反驗證由 **validate-ai-test-hv** skill 的 LLM audit 完成（App 只認 hv_audit.json pass:true）。

## 拓撲結構關係（移動後不可改）

**拓撲** = 路網「誰連誰、順序、轉乘歸屬」，不是 (x,y)。**只准平移座標**，下列關係移動前後必須相同：

1. **edges**：fromId→toId 連接集合不變（不可增刪邊、不可改端點 id）
2. **routeKeypointSequences**：每條路線的 id **順序**不變（不可重排、合併、拆段）
3. **轉乘匯流**：同一 crossing id 仍連接**同一組**路線；不可拆點、不可兩 id 併座標
4. **360° 環序**：每個紅點上相連支線的 CCW 環序（`topology.junctionRotationAtCrossings.branchOrderCCW`）移動後不可改
5. **端點**：endpoint id 仍是同一路線（段）的起／終點
6. **頂點集合**：同一組 id + kind，不可增刪改 kind

## 紅點 360° 環序（詳述）

- 支線身分 = 鄰接 id；離開角 = 從紅點指向該鄰接點的方向
- 依離開角 CCW 排序 → `branchOrderCCW`
- 移動後須與 baseline **same cyclic order**；對調任兩支線相對順序 = 違反拓撲
- 會改變環序的移動 → 該點**維持原座標**

幾何（座標、HV 拉直）可變；**拓撲圖結構不可變**。

## 拓撲不可變（操作面）

- **只平移** kind=crossing（紅）/ endpoint（藍）/ bend（粉紅）的 (x,y)
- id 序列與 edges 連接不可改
- coords 須列出**全部** movable id（含未動者）

## 禁止新增交叉

移動後**不得**讓不同路線的邊在「移動前不存在」的位置產生邊內部交叉。

## 任務

最大化 HV 邊；整數格、不重疊；**每步移動都應使路線更直，而非更彎**。

## 輸出（經 writeResponse.mjs 寫檔）

```json
{
  "routesFingerprint": "…",
  "computedBy": "llm",
  "model": "Composer",
  "coords": [{"id": 0, "x": 0, "y": 0}, ...]
}
```
