---
name: validate-junction-rotation
description: Validate 360° CCW rotation order at schematic junctions (≥3 branches) by comparing skeleton input vs layout result GeoJSON. Aligns with rotationStructure.js first-step angles; route-pair as primary pass/fail. Offline lat/lng vs grid uses snap threshold to avoid false positives. Use when auditing schematic_rma_* MILP output or fixing (44,16) 中和新蘆 branch.
---

# 分歧點 360° 環序驗證

比對「讀入骨架」與「佈局結果」，判斷各分歧點上**不同路線的逆時針相對順序**是否一致。

**與 app 一致**：角度用 `rotationStructure.js` 的 **第一段方向**（`leaveAngle` / first-step），不是 far-end 跨座標混算。

## App 内（MILP ③ 跑完自动）

`runLiveLayout` 在 MILP 完成且分支校正后，会调用同一套 `analyzeRoutePairRotation`（`src/utils/routeMapAdjust/schematic/routePairRotationCheck.js`），结果写入 `dashboardData.rotationStructureCheck.routePairCheck`。

**Control 面板**「示意圖佈局 ③ MILP」区块会显示：

- **入射方向順序** — 分支级 `fixRotationStructure`（格网对格网）
- **路線對環序審計（skill 同邏輯）** — PASS / FAIL，与离线下载 JSON 跑 skill 同一算法（app 内为格网对格网，无 lat/lng 假阳过滤）

完成 alert 也会附带 `路線對環序審計：PASS` 或 FAIL 行。

## 快速執行（离线下载 JSON）

```bash
# 驗證
node .claude/skills/validate-junction-rotation/checkRotation.mjs \
  schematic_rma_milp_input.json schematic_rma_milp_result.json

# 最小修正（預設只改 export_row_index 47 一段）
node .claude/skills/validate-junction-rotation/fixRotationResult.mjs \
  schematic_rma_milp_input.json schematic_rma_milp_result.json --in-place
```

## 主判斷（Pass / Fail）

1. 只查 **≥3 支 branch** 的分歧點  
2. 各 branch 依 **first-step 角** CCW 排序（最大角隙法，避免 >180° 反序）  
3. 对每对**不同路線**：骨架 vs 结果的 **first branch 先後** 不一致 → 候选 Fail  
4. **離線**（input=lat/lng、result=格網）：候选 Fail 还须 flip 涉及路线中，存在 **2 点 connect 段**（仅 head/tail 两点）且该 branch **|ref°−out°| > 30°**。多段折线仅有角差不算（避免 `(44,40)`、`(52,27)` 假阳）。

## 台北 MILP 真错（仅此一处）

**格网 `(44,16)`** / 骨架 `121.505364,24.993599`

| 项目 | 说明 |
|------|------|
| 错段 | `export_row_index: 47`，中和新蘆 `(44,16)–(46,16)` |
| 问题 | 结果指向 `(46,16)`（≈0°），骨架应更偏西北（≈−46°），环状线与中和新蘆 **路线对** 顺序对调 |
| 修法 | **只改该段 far 端点**（默认 `(46,16)` → 楔形区 `(43,14)`），**不 sync 其它共用 connect** |

其它分歧点（`(46,27)`、`(46,38)`、`(48,20)` 等）在离线 lat/lng vs 格网比对下路线对可能看似 flip，但 first-step 角差 < 30°，**不算拓撲错**。

## 输出解读

```json
{
  "summary": {
    "primaryVerdict": "FAIL",
    "routePairFail": 1,
    "offlineLatLngMode": true,
    "offlineSnapDeg": 30
  },
  "violations": [{
    "outGridApprox": "44,16",
    "routeA": "臺北捷運環狀線（大坪林->新北產業園區）",
    "routeB": "台北捷運中和新蘆線(蘆洲逆向)",
    "fixHint": { "exportRowIndex": 47, "junctionGrid": "44,16" }
  }]
}
```

`--strict`：额外列出分支级完整环序不符（**不作主 Fail**）。

## 与 rotationStructure.js

| 项目 | rotationStructure.js | 本 skill |
|------|---------------------|----------|
| 角度 | first-step | first-step（一致） |
| Fail 粒度 | 分支完整环序 | **路线对** + 离线 snap |
| 修正 | 迭代 move 一支 branch | **默认只改 row 47 一段** |

## 限制

- **最准**：app 内 MILP 后 ref/out 皆在格网，直接跑 `analyzeRotationStructure`。  
- 离线下载 JSON 仅适合抓 **(44,16)** 类大角差真错；勿对离线告警做全域 sync 改坐标。

## 参考

- [reference.md](reference.md)
- [examples.md](examples.md)
