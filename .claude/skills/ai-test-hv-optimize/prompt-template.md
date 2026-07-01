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

## 拓撲不可變

- 只平移 kind=crossing（紅）/ endpoint（藍）/ bend（粉紅）
- id 序列與 edges 連接不可改
- coords 須列出**全部** movable id

## 禁止新增交叉（重大錯誤）

移動後**不得**讓不同路線的邊在「移動前不存在」的位置產生邊內部交叉（整數格點上也不行）。
App 驗證會拒絕產生新交叉的提案。

## 任務

最大化 HV 邊；整數格、不重疊。

## 輸出（經 writeResponse.mjs 寫檔）

```json
{
  "routesFingerprint": "…",
  "computedBy": "llm",
  "model": "Composer",
  "coords": [{"id": 0, "x": 0, "y": 0}, ...]
}
```
