# AI測試 HV 最佳化 — LLM 推理規則（僅本地 Cursor 開發）

**不在正式部署使用。** Agent 用 **LLM 推理**決定座標，禁止跑求解腳本。

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

## 任務

最大化 HV 邊；整數格、不重疊、不非法交叉。

## 輸出（經 writeResponse.mjs 寫檔）

```json
{
  "routesFingerprint": "…",
  "computedBy": "llm",
  "model": "Composer",
  "coords": [{"id": 0, "x": 0, "y": 0}, ...]
}
```
