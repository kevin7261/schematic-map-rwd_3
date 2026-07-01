---
name: ai-test-hv-optimize
description: HV optimize for AI測試 layer — topology-preserving keypoint moves to maximize horizontal/vertical edges. Prompt rules live in uniformGridHvOptimize.js; the app runs them locally (no API Key). Use when editing prompt rules or validation logic.
---

# AI測試 — HV 最佳化

## App 流程（一鍵，不需 API Key／不需貼 prompt）

1. **HV 最佳化** → 本機依 prompt 規則計算（最多 4 輪）→ 虛線箭頭預覽
2. **執行（套用移動）** → 寫回路線，虛線消失

Prompt 唯一來源：`src/utils/uniformGridHvOptimize.js` 的 `HV_OPTIMIZE_SYSTEM_PROMPT` +
`buildHvOptimizeUserPrompt`（見 [prompt-template.md](prompt-template.md)）。

## 拓撲不可變

- `topology.routeKeypointSequences`：每條路線 id 序列不可改
- `edges` 的 fromId→toId 不可改；只能平移 (x,y)

## 核心檔案

- `src/utils/uniformGridHvOptimize.js` — prompt + payload + 本機求解 + 驗證
- `src/utils/uniformGridHvOptimizeExecute.js` — 按鈕流程
- `src/tabs/GridScalingTab.vue` — 虛線預覽
