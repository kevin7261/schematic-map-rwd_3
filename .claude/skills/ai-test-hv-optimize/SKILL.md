---
name: ai-test-hv-optimize
description: HV optimize for AI測試 layer — LOCAL Cursor dev only. App writes hv_payload.json; Cursor Agent uses LLM reasoning (NOT scripts) to decide coords and writes hv_response.json via writeResponse.mjs. Not for production deploy.
---

# AI測試 — HV 最佳化（僅本地 Cursor 開發）

**此功能不在正式部署使用。** 僅在 `npm run serve` + Cursor IDE 本地開發時運作。

## 硬性規定：座標必須由 LLM 決定

- **禁止**執行任何自動求解腳本（含 `runGreedyHvOptimizeRound`、`computeResponse.mjs` 等）
- **禁止**用程式迴圈產生 coords 再寫入 response
- Cursor Agent 必須**讀 payload、依規則用 LLM 推理**每個可移動點的新 (x,y)，再寫檔
- App 只做幾何驗證與預覽，不做座標求解

## 環境需求

- 本機 `npm run serve`（`vue.config.js` devServer 提供 `/api/ai-test-hv/*`）
- Cursor Agent 讀寫 repo 內 `public/data/ai_test/hv_*.json`
- 不用 API Key、不用剪貼簿

## 流程

1. App **隨機產生** → 按 **HV 最佳化** → 寫 `hv_payload.json`
2. Cursor 對話請 Agent「HV 最佳化」（本 skill）→ **LLM 推理** → 寫 `hv_response.json`
3. 再按 **HV 最佳化** → 虛線預覽 → **執行（套用移動）**

## Agent 必做（LLM 推理）

1. 讀 `public/data/ai_test/hv_payload.json`（含 `routesFingerprint`、`network`）
2. 讀 `src/utils/uniformGridHvOptimize.js` 的 `HV_OPTIMIZE_SYSTEM_PROMPT`（或 `prompt-template.md`）
3. 依規則**在對話中推理**新座標：
   - 只平移 kind=crossing（紅）/ endpoint（藍）/ bend（粉紅）
   - 拓撲不可變；最大化 HV 邊；整數格、不重疊、不非法交叉
   - `coords` 須涵蓋**所有** movable id（未動者回傳原座標）
4. 用 `writeResponse.mjs` 寫入（勿手改 json 漏欄位）：

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

App 預覽區會顯示 `model`。`computedBy` 非 `llm` 的回覆會被拒絕。

## 核心檔案

- `public/data/ai_test/hv_payload.json` — App（dev）寫入
- `public/data/ai_test/hv_response.json` — Agent（LLM）寫入
- `src/utils/uniformGridHvOptimize.js` — 規則與驗證
- `src/utils/uniformGridHvOptimizeExecute.js` — 同步 / 載入 / 套用
- `.claude/skills/ai-test-hv-optimize/writeResponse.mjs` — 寫 response
