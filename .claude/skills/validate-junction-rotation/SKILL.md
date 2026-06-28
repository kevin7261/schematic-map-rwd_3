---
name: validate-junction-rotation
description: Validate 360° CCW branch order at schematic junctions (≥3 arms) by comparing skeleton input vs layout result. Uses rotationStructure.js junction table (branch = far-end connect key, undirected skeleton). Y-junctions like 景安 need per-arm checks (景安→南勢角 vs 景安→蘆洲), not route-name indexOf. Offline lat/lng vs grid uses 2-point segment snap (30°). Use when auditing schematic_rma_* MILP or fixing 景安→南勢角 at (44,16).
---

# 分歧點 360° 環序驗證

比對「讀入骨架」與「佈局結果」，判斷各分歧點（≥3 支）上 **branch 支線** 的 CCW 環序是否一致。

**骨架邊無方向性**：每段只是兩 connect 端點間的連線；比對的是各支線離開分歧點的 **first-step 角** 排成的 360° 環，不是段儲存方向。

**與 app 同源**：`buildJunctionTable` / `orderedNKeys` / `leaveAngle` 皆來自 `rotationStructure.js`；審計邏輯在 `routePairRotationCheck.js` 的 `analyzeRoutePairRotation`。

## App 內（MILP ③）

- **入射方向順序** — `fixRotationStructure`（branch 完整環序，格網對格網，迭代校正）
- **路線對環序審計** — 按鈕觸發 `auditMilpRoutePairRotation`（同上 branch 環序；有 `nodes` 時 violation 顯示 **景安→南勢角** 等站名 leg）

## 快速執行（离线下载 JSON）

```bash
node .claude/skills/validate-junction-rotation/checkRotation.mjs \
  schematic_rma_milp_input.json schematic_rma_milp_result.json

# 最小修正（預設只改 export_row_index 47 一段 far 端點）
node .claude/skills/validate-junction-rotation/fixRotationResult.mjs \
  schematic_rma_milp_input.json schematic_rma_milp_result.json --in-place
```

## 主判斷（Pass / Fail）

1. 只查 **≥3 branch** 的分歧點（branch 身分 = 該段**另一端** connect 格座標 `nKey`）
2. 各 branch 依 **first-step 角** CCW 排序（`rotationStructure` 最大角隙法）
3. **主判斷**：`sameCyclic(refBranchOrder, outBranchOrder)` — 整圈 branch 環序一致 → PASS
4. 不一致時報 **第一組對調的兩支 branch**（非僅路線名；含 `branchADesc` / `branchBDesc`）
5. **離線**（input=lat/lng、result=格網）：須先走 app 管線建 `refFull`+`refAngleFlat`（CLI 已內建）；**離開角以縮放前經緯度為準**，佈局以格網為準。勿對 lat/lng 直接 `gridKey` 建表（會得 0 分歧點）或僅比格網 ref（近距站如景安→南勢角會因量化同向而假 PASS）。
6. **離線 snap（≤30°）** 僅在**未**提供 `refAngleFlat、且 ref 仍為 lat/lng 平面座標時啟用。

### 景安 Y 型（必讀）

同一「中和新蘆線」在 **景安** 有兩支 arm（→南勢角、→中和／蘆洲）。**不可用路線名 `indexOf`**，否則會抓錯支線。  
典型真錯：**景安站** 上 **景安→南勢角** 與 **環狀線** 等其它路線的 360° CCW 相對順序對調。

## 台北 MILP 已知真錯

**格網 `(44,16)` ≈ 景安站** / 骨架 lat/lng `121.505364,24.993599`

| 项目 | 说明 |
|------|------|
| 错支線 | **景安→南勢角**（`export_row_index: 47`，段 `(44,16)–(46,16)`） |
| 问题 | 结果 far 端指向 `(46,16)`（≈0°），骨架应更偏西北；在 360° 环上与环状线顺序对调 |
| 修法 | **只改该段 far 端点**（默认 `(46,16)` → 楔形 `(43,14)`），**不 sync 共用 connect** |

其它分歧点在离线 lat/lng vs 格网下 branch 角差 < 30° → snap 过滤，**不算错**。

## 输出解读

```json
{
  "summary": { "primaryVerdict": "FAIL", "routePairFail": 1, "offlineSnapDeg": 30 },
  "reasonLines": [
    "景安站：景安→南勢角 与 景安→… 在 360° CCW 环序中顺序对调（佈局结果与读入骨架不符）"
  ],
  "violations": [{
    "junctionLabel": "景安",
    "branchADesc": "「中和新蘆線」→南勢角",
    "branchBDesc": "「環狀線」→…",
    "outGridApprox": "44,16"
  }]
}
```

## 与 rotationStructure.js / fix 工具

| 项目 | rotationStructure + fixRotationStructure | analyzeRoutePairRotation（本 skill CLI） | fixRotationResult.mjs |
|------|----------------------------------------|----------------------------------------|----------------------|
| 角度 | first-step | first-step | first-step |
| Fail | branch 完整环序 | branch 完整环序 + 离线 snap | — |
| 修正 | MILP 后迭代 move branch | — | **默认只改 row 47 一段** |

## 限制

- **最准**：app 内 ref/out 皆格网，且 flat 含 `nodes` / 站名 → violation 可读「景安→南勢角」
- 离线纯 LineString GeoJSON 无站名时，`junctionLabel` 可能仅显示格网 `(44,16)`
- 离线下载 JSON 适合抓 **景安→南勢角** 类大角差真错；勿对离线告警做全域 sync

## 参考

- [reference.md](reference.md)
- [examples.md](examples.md)
