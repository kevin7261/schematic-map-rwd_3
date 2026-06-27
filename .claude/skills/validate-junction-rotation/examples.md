# 範例：台北 MILP input vs result

## 執行

```bash
node .claude/skills/validate-junction-rotation/checkRotation.mjs \
  schematic_rma_milp_input.json \
  schematic_rma_milp_result.json
```

## 人工確認的真錯（標準 A）

**`(44, 16)`** / 骨架 `(121.505364, 24.993599)`

| 路線對 | 骨架 CCW | 結果 CCW |
|--------|----------|----------|
| 中和新蘆(蘆洲) ↔ 環狀線 | 中和新蘆 在前 | 環狀線 在前 |

→ **Fail**（兩條不同路線的相對順序對調）

## 常見假陽性（不應判 Fail）

### `(46, 36)` / `(46, 32)` — 分支級誤報

- 4 向 = 2 路 × 2 支
- **first-step 分支級**環序可能不符（路徑簡化改第一段角）
- **路線對** far-end 檢查：淡水信義 ↔ 中和新蘆（或台電大樓=>松山）順序與骨架一致 → **Pass**

### 離線 JSON 比對限制

下載的 `input`（lat/lng）與 `result`（格網）**座標系不同**。腳本已分開計算 ref/out 角度，但仍可能對其他分歧點產生額外告警。

**最準**：在 app 內比對（MILP 後 ref/out 皆在格網），或將兩份 JSON 先轉到同一座標系再比。

## 輸出範例（僅 44,16 類真錯）

```json
{
  "summary": { "primaryVerdict": "FAIL", "routePairFail": 1 },
  "violations": [{
    "refJunctionKey": "121.505364,24.993599",
    "outGridApprox": "44,16",
    "routeA": "臺北捷運環狀線（大坪林->新北產業園區）",
    "routeB": "台北捷運中和新蘆線(蘆洲逆向)",
    "refOrder": "B before A",
    "outOrder": "A before B"
  }]
}
```

## 判斷流程速查

```
≥3 支分歧點
  → 對每對不同路線 (A,B)
      → ref/out 各自 CCW，比 first branch 先後
      → 不一致 = 真錯
  → 僅同路兩支或分支級不同、路線對皆一致 = Pass
```
