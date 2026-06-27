---
name: validate-junction-rotation
description: Validate 360° CCW rotation order at schematic junctions (≥3 branches) by comparing skeleton input vs layout result GeoJSON. Uses route-pair relative order as the primary pass/fail criterion; flags false positives from branch-level-only checks. Use when auditing schematic_rma_* MILP/layout output, comparing input/result JSON, or discussing 入射方向順序 / rotationStructure.
---

# 分歧點 360° 環序驗證

比對「讀入骨架」與「佈局／直線化結果」，判斷各分歧點上**相連路線的逆時針相對順序**是否一致。

程式參考：`src/utils/routeMapAdjust/schematic/rotationStructure.js`（分支級完整環序）。  
本 skill 的**主判斷**較寬鬆且更符合人工核對：以**路線對**為準，避免 2 路 × 2 向（4 支）分歧點的假陽性。

## 何時使用

- 下載 `*_input.json` / `*_result.json` 後要比 360° 環序
- 使用者問「入射方向順序有沒有錯」「只有哪些分歧點真的錯」
- 審計 `schematic_rma_milp` 等八方向佈局輸出
- 要解釋為何 `analyzeRotationStructure` 報錯但地圖看起來只錯一點

## 快速執行

```bash
node .claude/skills/validate-junction-rotation/checkRotation.mjs \
  path/to/skeleton_input.json \
  path/to/layout_result.json
```

可選 `--strict`：同時列出分支級完整環序不符（僅供參考，**不作主判 fail**）。

## 判斷標準（必讀）

### 1. 適用對象

只檢查 **分歧點**：connect 骨架上 **≥3 支 branch** 交會的段端點。

- **要查**：紅／藍 connect、轉乘、≥3 路交會
- **不查**：degree=2 的中間折點（八方向格網轉角）

### 2. Branch 定義

每支 branch = 從分歧點沿某 segment 到**另一端 connect 端點**。

- **身分**：另一端座標 `nKey`（6 位小數 `"lng,lat"`），不是只用路線名
- 同一路線可在同一分歧點有**進／出兩支**

### 3. CCW 環序怎麼排

**路線對主判斷（標準 A）** — 用**指向另一端 connect 端點**的方向角：

```javascript
θ = atan2(otherY - jY, otherX - jX)  // other = branch 的 nKey 座標
```

**分支級嚴格模式（標準 B）** — 用**離開分歧點的第一段**方向角（同 `rotationStructure.js` 的 `leaveAngle`）。

兩者排序皆 CCW（θ 由小到大）。實務上**標準 A 必須用 far-end 角**，才符合人工核對（避免 4 支 2 路假陽性）。

**跨座標系比對**（骨架 lat/lng vs 結果格網）：

- ref 角度：在 ref segment 上，指向 ref 的 `nKey`（lat/lng）
- out 角度：在 out segment 上，指向**該 segment 在格網上的另一端**（不可把 ref nKey 代入 out 算角度）
- branch 身分仍用 ref 的 `nKey`；與 `rotationStructure.js` 在 app 內（兩邊皆格網）的邏輯一致

### 4. 主判斷（Pass / Fail）

**標準 A — 路線級相對順序（主標準）**

對分歧點上每一對**不同路線** A ≠ B：

- 在骨架 CCW 環上，找 A、B **各自第一次出現**的 branch 索引
- 若骨架為「A 在 B 前」、結果為「B 在 A 前」→ **Fail**
- 所有路線對皆一致 → **Pass**

**一句話**：360° 環序正確 ⟺ 每個 ≥3 向分歧點上，任意兩條**不同路線**的 CCW 相對先後與骨架一致。

**標準 B — 分支級完整環序（嚴格／輔助）**

要求 n 個 `nKey` 的完整 CCW 環序一致（可平移起點）。

- 在 **2 路 × 2 向（4 支）** 時易**假陽性**（同路兩支對調、路徑簡化改第一段角度）
- **不要**單獨當唯一 fail 條件；僅 `--strict` 時列出

### 5. 常見假陽性（不算錯）

- 同一路線進／出兩支在環上互換，但**路線與路線之間**順序不變
- 段頂點簡化（如 4→2）改變第一段角度，分支排序變、路線對不變
- 骨架 lat/lng vs 結果格網，分支角有雜訊但路線對一致

### 6. 真錯範例

`(44, 16)` / 骨架 `(121.505364, 24.993599)`：

- 路線對：**中和新蘆(蘆洲)** ↔ **環狀線**
- 骨架 CCW：中和新蘆 在 環狀線 前
- 結果 CCW：環狀線 在 中和新蘆 前 → **Fail**

## 輸出解讀

腳本輸出 JSON：

```json
{
  "summary": {
    "junctionCountGe3": 25,
    "routePairPass": 24,
    "routePairFail": 1,
    "branchStrictFail": 3
  },
  "violations": [
    {
      "refJunctionKey": "121.505364,24.993599",
      "routeA": "台北捷運中和新蘆線(蘆洲逆向)",
      "routeB": "臺北捷運環狀線（大坪林->新北產業園區）",
      "refOrder": "A before B",
      "outOrder": "B before A"
    }
  ]
}
```

- **`violations`**：僅含標準 A（路線對 flip）— 這才是要修的
- **`branchStrictFail`**：僅 `--strict` 時有意義

## 與 app 內建檢查的差異

| 項目 | `rotationStructure.js` | 本 skill |
|------|------------------------|----------|
| 粒度 | 分支 nKey 完整環序 | **路線對**為主 |
| 4 向 2 路 | 易假陽性 | 路線對一致即 Pass |
| 用途 | MILP 後校正迭代 | 人工／離線 JSON 審計 |

若要改 app 行為，可在 `analyzeRotationStructure` 旁加路線對檢查，或將 fail 條件從分支級改為路線對級。

## 輸入格式

兩份皆為 GeoJSON `FeatureCollection`，主要含 `LineString` way：

- **input**：路線圖轉換骨架／示意圖輸入（常為 lat/lng + `tags.route_name`）
- **result**：佈局結果（常為格網座標 + `name` / `export_row_index`）

腳本從 `LineString` 建 flat segments；兩邊 segment 數應相同（通常 56）。

## 詳細算法

- 算法細節：[reference.md](reference.md)
- 範例與假陽性：[examples.md](examples.md)

## 限制

- **離線 JSON**：input 常為 lat/lng、result 為格網；腳本分開算角度，但與 app 內格網對格網比對可能不完全一致。
- **App 內**：兩者皆在 MILP 格網上時，以 `rotationStructure.js` + 本 skill 路線對標準為準。
