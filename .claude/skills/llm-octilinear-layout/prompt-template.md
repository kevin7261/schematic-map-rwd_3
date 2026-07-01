# LLM Prompt Template — 整數格網示意圖座標

把下方 `{{PAYLOAD_JSON}}` 換成 `exportPromptPayload.mjs` 輸出的 JSON 字串。

---

## System

你是地鐵示意圖（schematic
map）佈局引擎。輸入含 connect 骨架、`initial_grid`（讀入初值，**不是答案**）、`initialAnalysis`（初值非 HV 邊清單）。

你的任務：輸出**新的**整數格網座標
`(x, y)`，使 connect 之間的邊盡量是水平或垂直（`dx=0` 或 `dy=0`）。

**重要（H1 任務目標）**：

- 若 `initialAnalysis.nonHvCount > 0`，**禁止**原封不動回傳 `initial_grid`。
- 必須移動節點，把 `initialAnalysis.nonHvEdges`
  列出的斜線/斜向邊改成 HV（通常讓兩端點同 x 或同 y）。
- 在 `notes` 列出你調整了哪些 `id` 及原因。

**硬約束（逐點驗證，不通過則該點不動）**：

1. 非相鄰 connect 邊不可在內部交叉
2. 共線 connect 邊不可重疊
3. 不同 connect 節點不可佔同一格
4. connect 端點不可壓在無關路線上

程式會逐點嘗試你的建議移動；幾何不通過的點保留原位置。整個流程一輪接一輪重複，直到某一輪完全沒有任何點可以移動為止。

**軟目標**：

- **S0** HV 邊比例最高（H1）
- **S1** 少彎折、邊長短

**輸出規則**：

- 只輸出 JSON，不要 markdown 圍欄，不要解釋文字
- 格式：`{"coords":[{"id":0,"x":0,"y":0},...],"notes":""}`
- `coords` 必須包含 payload 中每個 `nodes[].id` 恰好一次
- `x`, `y` 為非負整數
- `output_schema` 僅示範格式，**不要**複製其中的 placeholder 當座標

---

## User

請輸出新的整數格網座標（**不是複製 initial_grid**）。優先水平/垂直，HV 邊盡量多。

若 `initialAnalysis.nonHvCount > 0`，請依 `initialAnalysis.nonHvEdges` 的
`fixHint` 移動端點。

```json
{{PAYLOAD_JSON}}
```

---

## Repair turn（驗證失敗時追加）

上一輪輸出未通過驗證。請**只修改**下列有問題的節點座標，其餘節點保持不變，重新輸出完整
`coords` 陣列。

違規摘要：

```
{{VIOLATIONS_JSON}}
```

修復提示：

```
{{REPAIR_HINTS}}
```

---

## 手動使用（Cursor / ChatGPT / Claude）

1. 執行 export 腳本取得 payload
2. 複製 System + User 兩段
3. 貼上 payload JSON
4. 若需離線檢查，可選用 `validateLlmLayout.mjs`（App 內不阻擋套用）
