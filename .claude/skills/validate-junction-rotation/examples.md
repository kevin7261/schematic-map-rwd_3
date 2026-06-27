# 範例：台北 MILP input vs result

## 驗證（應只有 1 處 Fail）

```bash
node .claude/skills/validate-junction-rotation/checkRotation.mjs \
  /path/to/schematic_rma_milp_input.json \
  /path/to/schematic_rma_milp_result.json
```

**原始 result**（`(44,16)–(46,16)` 仍指向東向 `(46,16)`）：

```json
{
  "summary": {
    "primaryVerdict": "FAIL",
    "routePairFail": 1,
    "offlineSnapDeg": 30
  },
  "violations": [{
    "outGridApprox": "44,16",
    "routeA": "臺北捷運環狀線（大坪林->新北產業園區）",
    "routeB": "台北捷運中和新蘆線(蘆洲逆向)",
    "refOrder": "B before A",
    "outOrder": "A before B",
    "fixHint": { "exportRowIndex": 47, "junctionGrid": "44,16" }
  }]
}
```

## 最小修正

```bash
node .claude/skills/validate-junction-rotation/fixRotationResult.mjs \
  schematic_rma_milp_input.json schematic_rma_milp_result.json --in-place
```

只改 **export_row_index 47** 第二點：`(46,16) → (43,14)`（楔形中点；**不**拖動 `(44,16)` 或其它路線共用點）。

修正後再跑 check → `PASS`。

## 假陽性（離線不應判 Fail）

| 格網 | 原因 |
|------|------|
| `(46,36)` / `(46,32)` | 4 向 2 路；first-step 量化後路線對仍一致 |
| `(46,27)`、`(46,38)`、`(48,20)` | lat/lng vs 格网 first-step 差 < 30°，路线对告警被 snap 过滤 |

## 錯誤做法（勿用）

- 对 `(46,32)`、`(54,14)` 等 **共用 connect** 做 `moveGridPoint` 全域同步  
- 用 far-end 角跨 lat/lng / 格网混算当主判（易产生 5+ 假告警）
