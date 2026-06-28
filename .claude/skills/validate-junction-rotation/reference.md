# 360° 環序驗證 — 算法細節

源码：`src/utils/routeMapAdjust/schematic/rotationStructure.js`（junction 表、角度、CCW 排序）、`routePairRotationCheck.js`（审计、离线 snap、中文 reasonLines）。

## 骨架无方向

每段 segment 仅连接两个 connect 格点。在分歧点 `jKey` 上，branch 身分是 **另一端** `nKey`（`rotationStructure.buildJunctionTable`）。  
`jHead` 只用于算「离开分歧点的 first-step 角」，不代表骨架有向边。

## 角度

```javascript
export function leaveAngle(seg, jHead) {
  const pts = seg.points;
  const [jx, jy] = readPt(pts[jHead ? 0 : pts.length - 1]);
  const [ox, oy] = readPt(pts[jHead ? 1 : pts.length - 2]);
  return Math.atan2(oy - jy, ox - jx);
}
```

## CCW 排序（最大角隙）

与 `rotationStructure.orderedNKeys` 相同：raw angle 排序 → 找最大角隙 → 从隙后一支起为 CCW 环起点。

## 主 Fail：branch 环序

```javascript
const refBranchOrder = orderedNKeys(refSpokes, refSpokes.map(s => s.nKey));
const outBranchOrder = orderedNKeys(outSpokes, refBranchOrder);
if (sameCyclic(refBranchOrder, outBranchOrder)) PASS;
```

**勿**对 `route_name` 做 `indexOf` 排 CCW（景安 Y 型：中和新蘆占两 branch）。

违规时取 `firstFlipBranchKeys(refBranchOrder, outBranchOrder)` 得到对调的两支，再格式化为 `景安→南勢角` leg（`junctionLabel` + far 站名）。

## 离线 snap（假阳性过滤）

当 `detectRefIsLatLng(ref)` 且 branch 环序不一致时，若该分歧点**所有** 2 点 connect branch 的 `|refFirstStep° − outFirstStep°|` 皆 ≤ `snapDeg`（默认 30°），视为量化噪声 → **PASS**。

台北 MILP 真错在景安 `(44,16)`：涉及 branch 存在 >30° 角差（南勢角段 pointing 东而非西北）。

## 最小修正（fixRotationResult.mjs）

与 app 内 `fixRotationStructure` **不同**：CLI 脚本默认**只改** `export_row_index 47` 的 far 端点，不迭代、不同步共用 connect。

1. 在 ref 环序取 prev/next branch 的 ref first-step 角  
2. `angMid = angPrev + (angNext−angPrev)_ccw / 2`  
3. 仅写该 segment far 端点  

App 内 MILP 应依赖 `fixRotationStructure` 自动迭代；离线 JSON 才用 `fixRotationResult.mjs`。

## 与 analyzeRotationStructure

| | fixRotationStructure | analyzeRoutePairRotation |
|---|---------------------|-------------------------|
| 比较 | branch cyclic | branch cyclic（同源 junction 表） |
| 离线 | 不适用（皆格网） | lat/lng ref + snap 过滤 |
| 输出 | 迭代 move + reasons | violations + reasonLines（含站名 leg） |
