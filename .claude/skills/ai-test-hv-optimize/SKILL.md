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

## 環境需求

- 本機 `npm run serve`（`vue.config.js` devServer 提供 `/api/ai-test-hv/*`）
- Cursor Agent 讀寫 repo 內 `public/data/ai_test/hv_*.json`
- 不用 API Key、不用剪貼簿

## 流程

1. App **隨機產生** → 按 **HV 最佳化** → 寫 `hv_payload.json`
2. Cursor 對話請 Agent「HV 最佳化」（本 skill）→ **LLM 推理** → 寫 `hv_response.json`
3. 再按 **HV 最佳化** → 虛線預覽 → **執行（套用移動）**

## Agent 必做（僅 LLM 推理）

1. 讀 `public/data/ai_test/hv_payload.json`（含 `routesFingerprint`、`network`）
2. 讀 `HV_OPTIMIZE_SYSTEM_PROMPT`（`uniformGridHvOptimize.js` 或 `prompt-template.md`）
3. **在對話中用 LLM 推理**每個可移動點的新 (x,y)：
   - 只平移 kind=crossing（紅）/ endpoint（藍）/ bend（粉紅）
   - 拓撲不可變；最大化 HV 邊；整數格、不重疊
   - **禁止新增跨路線交叉**（移動前沒有的邊內部交叉一律不可）
   - `coords` 須涵蓋**全部** movable id（未動者回傳原座標）
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
