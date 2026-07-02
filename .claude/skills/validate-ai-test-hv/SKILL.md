---
name: validate-ai-test-hv
description: LLM audit AI測試 HV 最佳化結果 — 鐵律：audit 判定只能由 Cursor LLM 推理完成，禁止跑程式 audit 腳本。讀 hv_payload + hv_response，LLM 在對話中逐條檢查幾何/拓撲，writeAudit.mjs 只寫 hv_audit.json。Use after ai-test-hv-optimize writeResponse.mjs or when user reports HV layout errors.
---

# AI測試 HV — LLM 反驗證（validate-ai-test-hv）

## 鐵律

**audit 判定只能由 Cursor LLM 推理完成。**

- 禁止寫或執行程式 audit 腳本（迴圈掃邊、線段相交演算法、程式比對環序等）來產生判定
- `writeAudit.mjs` **只寫檔**，不做任何檢查或計算
- **不求解座標**：發現違規時回 **ai-test-hv-optimize** skill 用 LLM 修正 coords，不在本 skill 改座標

**本 skill 是流程必經步驟**。App **不做幾何驗證**，完全信任本 skill 的 LLM audit：按「HV 最佳化」時 App 只檢查 `hv_audit.json` 存在、`auditedBy: "llm"`、fingerprint 一致、`pass: true`，通過才載入座標進虛線預覽。

## 輸入

1. `public/data/ai_test/hv_payload.json` — baseline：`network.movablePoints`（id/x/y/kind）、`network.edges`、`network.topology`（含 `junctionRotationAtCrossings`）、`meta.gridX/gridY`、`routesFingerprint`
2. `public/data/ai_test/hv_response.json` — LLM 提議 coords

## LLM 必須逐條推理的檢查清單

對「提議座標全部套用後」的圖，在對話中逐條檢查並列出結論：

| code | 檢查內容（LLM 推理） |
|------|---------------------|
| `NOT_LLM` | response `computedBy` 是否為 `"llm"` |
| `FINGERPRINT_MISMATCH` | response `routesFingerprint` 是否與 payload 相同 |
| `MISSING_COORD` | 每個 kind=crossing/endpoint/bend 的 id 是否都在 coords 中 |
| `OUT_OF_BOUNDS` | 各座標是否在 [0,gridX]×[0,gridY] 整數格內 |
| `VERTEX_MOVED` | kind=vertex 的 id 座標是否與 payload 完全相同 |
| `DUPLICATE_COORD` | 任兩個 id 是否落在同一格 |
| `SAME_ROUTE_CROSS` | 同一 routeIndex 的邊是否自交 |
| `NEW_CROSS_ROUTE` | 不同路線的邊是否產生 baseline 沒有的邊內部交叉 |
| `COLLINEAR_OVERLAP` | 邊是否共線重疊 |
| `DIRECTION_FLIP` | 各邊 baseline \|dx\| vs \|dy\| 主方向 vs 移動後 HV 軸：偏水平不可變垂直、偏垂直不可變水平（45° 除外） |
| `JUNCTION_ROTATION_FLIP` | 各紅點相連支線的 360° CCW 環序是否與 payload `topology.junctionRotationAtCrossings.branchOrderCCW` 同 cyclic order |

推理方式：逐邊、逐點對照 baseline 與提議座標，用幾何常識判斷（如兩線段是否交叉、離開角相對順序是否對調）。網路小（通常 <100 個拓撲點）可在對話中完成。

**不檢查**（屬 ai-test-hv-optimize 的推理責任）：套用順序、每步 HV 增益、同層選點。

## 輸出（經 writeAudit.mjs 寫檔）

LLM 推理完成後，把結論寫入 `public/data/ai_test/hv_audit.json`：

```bash
node .claude/skills/validate-ai-test-hv/writeAudit.mjs '{"auditedBy":"llm","model":"…","pass":false,"violations":[{"code":"DIRECTION_FLIP","message":"路線 2 邊 5→8 …"}]}'
```

```json
{
  "auditedBy": "llm",
  "model": "<本對話使用的 Cursor model 名稱>",
  "routesFingerprint": "<與 payload 相同；省略時 writeAudit 自動補>",
  "pass": true,
  "violations": [{ "code": "…", "message": "…" }],
  "notes": "可省略"
}
```

`auditedBy` 非 `"llm"` 會被 writeAudit.mjs 拒絕。

## FAIL 時

1. 在對話中列出各 violation（code + 人話說明哪個 id/邊/紅點錯）
2. 回 **ai-test-hv-optimize** skill 用 **LLM 修正 coords** → `writeResponse.mjs`
3. 重新用本 skill LLM audit → PASS 後請使用者在 App 按「HV 最佳化」（按鈕流程不變）

## 與 App 的關係

App **完全信任 LLM audit**、自身不做幾何驗證。按「HV 最佳化」時 App 的檢查僅限：

1. `hv_audit.json` 存在（缺少 → 提示先跑本 skill）
2. `auditedBy: "llm"`（否則拒絕）
3. `routesFingerprint` 與目前路線一致
4. `pass: true`（FAIL → 顯示 violations，不進虛線預覽）

因此本 skill 的 LLM 推理品質就是最後防線：請逐條認真檢查，勿直接寫 `pass: true`。
