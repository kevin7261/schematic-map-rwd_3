# 範例：台北 MILP input vs result

## 驗證（應只有 1 處 Fail）

```bash
node .claude/skills/validate-junction-rotation/checkRotation.mjs \
  /path/to/schematic_rma_milp_input.json \
  /path/to/schematic_rma_milp_result.json
```

**原始 result**（景安 `(44,16)` 上 **景安→南勢角** 支线与环状线 360° 顺序对调；段 `(44,16)–(46,16)` far 端仍指向东 `(46,16)`）：

```json
{
  "summary": {
    "primaryVerdict": "FAIL",
    "routePairFail": 1,
    "offlineLatLngMode": true,
    "offlineSnapDeg": 30
  },
  "reasonLines": [
    "景安站：景安→南勢角 与 景安→… 在 360° CCW 环序中顺序对调（佈局结果与读入骨架不符）"
  ],
  "violations": [{
    "junctionLabel": "景安",
    "outGridApprox": "44,16",
    "branchADesc": "「中和新蘆線」→南勢角",
    "branchBDesc": "「臺北捷運環狀線…」→…",
    "routeA": "中和新蘆線",
    "routeB": "臺北捷運環狀線（大坪林->新北產業園區）"
  }]
}
```

（离线 JSON 若无 `nodes` 站名，`junctionLabel` 可能仅为 `44,16`；app 内审计有完整 flat 时会显示「景安」。）

## 最小修正

```bash
node .claude/skills/validate-junction-rotation/fixRotationResult.mjs \
  schematic_rma_milp_input.json schematic_rma_milp_result.json --in-place
```

只改 **export_row_index 47**（景安→南勢角段）far 端：`(46,16) → (43,14)`。**不**拖动 `(44,16)` 或其它共用 connect。

修正後再跑 check → `PASS`。

## 假陽性（離線不應判 Fail）

| 格網 | 原因 |
|------|------|
| `(46,36)` / `(46,32)` | branch 环序经 snap 判定为角差噪声 |
| `(46,27)`、`(46,38)`、`(48,20)` | lat/lng vs 格网 first-step 差 ≤ 30° |

## 錯誤做法（勿用）

- 用**路線名**在 CCW 序列 `indexOf` 比顺序（景安 Y 型会抓错 → 南勢角 arm）  
- 对 `(46,32)`、`(54,14)` 等共用 connect 做全域 sync  
- 用 far-end 角跨 lat/lng / 格网混算
