---
name: validate-ai-test-hv
description: Audit AI測試 HV 最佳化結果（反驗證）。讀 hv_payload + hv_response，程式檢查幾何是否畫錯（新交叉、自交、重疊等）。不求解座標。Use after writeResponse.mjs or when user reports HV layout errors. Does NOT change App UI.
---

# AI測試 HV — 反驗證（validate-ai-test-hv）

**不求解座標**（鐵律仍由 LLM 決定移動）。本 skill 只做 **deterministic 幾何 audit**。

App 介面操作不變；Agent 在寫完 `hv_response.json` 後可選跑本 skill，產出 `hv_audit.json` 供修正 LLM 提案。

## 檢查項目

- `computedBy: "llm"`、routesFingerprint 一致
- coords 涵蓋全部可移動 id（紅/藍/粉紅）
- **禁止新增跨路線邊內部交叉**（相對 baseline）
- 同路自交、共線重疊、座標重疊、越界
- **方向不可翻轉**（偏水平→水平 HV；偏垂直→垂直 HV；45° 除外）
- HV 統計（proposed 全套用 vs incremental 逐點套用後）

**套用策略**（依 x/y 座標中位→向外、每步拉直、同層增益最大）由 **LLM 在對話中推理**；本 audit **不**程式檢查 HV 增益或套用順序。

## 執行

```bash
node --loader ./loader.mjs .claude/skills/validate-ai-test-hv/checkHvResponse.mjs
```

- 讀 `public/data/ai_test/hv_payload.json`、`hv_response.json`
- 寫 `public/data/ai_test/hv_audit.json`
- exit 0 = PASS，1 = FAIL

## FAIL 時

1. 讀 `hv_audit.json` 的 `violations`
2. 回 **ai-test-hv-optimize** skill 用 LLM **修正 coords**（非腳本求解）
3. 再跑本 validate → 通過後請使用者在 App 按「HV 最佳化」（按鈕流程不變）

## 與 App 的關係

App 載入 response 時也會跑相同幾何反驗證；FAIL 時現有「HV 最佳化」按鈕會顯示錯誤，不進入虛線預覽。
