---
name: llm-octilinear-layout
description: Generate integer-grid schematic coordinates from connect skeleton + geographic hints using LLM structured output, prioritizing horizontal/vertical edges (HV maximization) with repair validation loop. Replaces HiGHS MILP and logic-solver SAT for small networks (<30 connect nodes). Use when prototyping AI layout, exporting LLM prompt payloads, validating LLM coordinate JSON, or applying LLM layout back to schematic_rma layers.
---

# LLM 整數格網示意圖佈局

用 **LLM structured output** 取代 `highs`（MILP）與 `logic-solver`（SAT），從 connect 骨架直接產生整數格網座標。**優先水平/垂直（HV），HV 邊盡量多**；不強制全八方向。

**適用規模**：connect 節點 < 30 效果最佳；更大路網請分段或 fallback 到 stroke/hillclimb 初解 + LLM 修復。

## App 內（路線調整 → AI調整）

1. 完成上游「站點與路線調整前置」
2. 選 **AI調整** layer → **開始執行**
3. 自動讀上游 → LLM（skill prompt）→ 驗證 H2–H4 → 寫入圖層

**LLM 連線**：dev server 設 `OPENAI_API_KEY`（走 `/api/llm-layout` proxy），或在 UI 填入 API Key。

## 快速流程（CLI / 離線）

```bash
# 1. 從骨架 GeoJSON 匯出 LLM 輸入
node --no-warnings --loader ./loader.mjs \
  .claude/skills/llm-octilinear-layout/exportPromptPayload.mjs \
  schematic_rma_milp_input.json \
  /tmp/llm-layout-payload.json

# 2. 把 payload + prompt-template.md 送給 LLM → 存成 llm-layout-response.json

# 3. 驗證（硬約束 H2–H4 + HV 邊統計）
node --no-warnings --loader ./loader.mjs \
  .claude/skills/llm-octilinear-layout/validateLlmLayout.mjs \
  /tmp/llm-layout-payload.full.json \
  /tmp/llm-layout-response.json

# 4. 寫回 GeoJSON（可 import 到 schematic_rma_milp_read）
node --no-warnings --loader ./loader.mjs \
  .claude/skills/llm-octilinear-layout/applyLlmLayout.mjs \
  /tmp/llm-layout-payload.full.json \
  /tmp/llm-layout-response.json \
  /tmp/llm-layout-result.json
```

## Agent 執行步驟

1. **匯出 payload** — 執行 `exportPromptPayload.mjs`（輸入 = app 下載的骨架 GeoJSON 或 `geojsonData` 存檔）。
2. **組 prompt** — 讀 [prompt-template.md](prompt-template.md)，把 `{{PAYLOAD_JSON}}` 替換成 payload 字串。
3. **呼叫 LLM** — 要求 **只回 JSON**（schema 見 payload 內 `output_schema`）。溫度 ≤ 0.2。
4. **驗證** — 執行 `validateLlmLayout.mjs`；exit 0 = PASS。
5. **失敗時修復迴圈**（最多 3 輪）— 把 `validateLlmLayout` 的 `violations` + `repairHints` 附加到 prompt，要求 LLM **只改有問題的節點**。
6. **套用** — `applyLlmLayout.mjs` 產出 result GeoJSON；可 import 到 `schematic_rma_milp_read` 或與 `checkRotation.mjs` 交叉驗證。

## 約束分級

| 代號 | 規則 | 驗證 |
|------|------|------|
| **H1（軟）** | **優先**水平/垂直（`dx=0` 或 `dy=0`）；斜線僅在必要時使用；目標 HV 邊最多 | `validateLlmLayout` 回報 `hvEdges` / `diagonalEdges` / `skewEdges` |
| **H2（硬）** | 分歧點（≥3 支）branch CCW 環序與地理骨架一致 | `routePairRotationCheck.js` |
| **H3（硬）** | 相鄰 connect 不可同格 | `repair.js` clashes |
| **H4（硬）** | 非相鄰邊不可交叉、不可共線重疊 | `repair.js` crossings/overlaps |

## 軟目標（S0–S3，LLM 盡量優化）

- **S0** HV 邊比例最高（對應 H1）
- **S1** 彎折少（同一路線相鄰邊方向一致優先）
- **S2** 相對方位與地理初值相近（北在上、東在右的整體趨勢）
- **S3** 邊長 L∞ 盡量短（compact layout）

## 輸入／輸出格式

**Payload**（`exportPromptPayload.mjs` 產生）：

```json
{
  "meta": { "connectCount": 24, "edgeCount": 28, "initialSpan": 48 },
  "nodes": [{ "id": 0, "key": "n:淡水", "name": "淡水", "geo": [121.446, 25.168], "initial_grid": [0, 0] }],
  "edges": [{ "id": 0, "u": 0, "v": 1, "routes": ["淡水信義線"] }],
  "junctions": [{ "junctionKey": "n:景安", "branchOrderCCW": ["n:南勢角", "n:蘆洲"], "branches": [] }],
  "output_schema": { "coords": [{ "id": 0, "x": 0, "y": 0 }] }
}
```

**LLM 回覆**（必填）：

```json
{
  "coords": [{ "id": 0, "x": 0, "y": 0 }],
  "notes": "optional"
}
```

- `coords` 長度 = `nodes.length`；`id` 必須涵蓋所有節點。
- `x`, `y` 為**非負整數**。

## 與現有管線整合

```
route_map_adjust 骨架 GeoJSON
  → exportPromptPayload.mjs
  → LLM coords
  → validateLlmLayout.mjs
  → applyLlmLayout.mjs → result GeoJSON
  → import schematic_rma_milp_read / assemble.js 路徑
  → 路線正規化 → 路網網格
```

不需 `highs.wasm` 或 `logic-solver`；後處理仍用既有 `assemble.js`（黑點內插）、`readMilpResult.js`（網格壓縮）。

## 限制

- 大型路網（>50 connect）LLM 易漏約束；先用 stroke/hillclimb 初解再 LLM 微調較穩。
- 景安 Y 型等近距站：環序以 payload 內 `junctions[].leaveAngleDeg`（地理角）為準，勿用路線名 indexOf 判斷 branch。
- LLM 輸出必須整數；若模型回浮點，驗證前四捨五入。

## 參考

- [prompt-template.md](prompt-template.md) — 可直接貼給 ChatGPT / Claude / Cursor
- [examples.md](examples.md) — 小型範例與修復 prompt
