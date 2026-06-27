# 360° 環序驗證 — 算法細節

## 角度（与 rotationStructure.js 相同）

```javascript
function leaveAngleFirstStep(seg, jHead) {
  const pts = seg.points;
  const [jx, jy] = pts[jHead ? 0 : pts.length - 1];
  const [ox, oy] = pts[jHead ? 1 : pts.length - 2];
  return Math.atan2(oy - jy, ox - jx);
}
```

## CCW 排序（最大角隙）

1. 按 raw angle 排序  
2. 找相邻角最大 gap（>180° 空档）  
3. 从 gap 后一支开始为 CCW 环起点  

避免 `(44,40)` 类 135° / −45° 被 normAngleDiff 反序。

## 路线对 flip

```javascript
const iA = order.findIndex(k => junction.get(k).route === routeA);
const iB = order.findIndex(k => junction.get(k).route === routeB);
const step = (iB - iA + n) % n;
return step <= n / 2 ? 'A before B' : 'B before A';
```

## 离线 snap（假阳性过滤）

当 ref 为 lat/lng、out 为格网时，路线对 flip 还须：

```javascript
max(|refFirstStep° − outFirstStep°|) among branches of routeA or routeB at junction > snapDeg
```

默认 `snapDeg = 30`，且 **out 该 branch 须为 2 点 connect 段**。台北 MILP 仅 `(44,16)–(46,16)`（row 47）满足。

## 最小修正（fixRotationResult.mjs）

1. `restoreOverfitPatches`：还原错误的全域 sync  
2. 对目标 `export_row_index`（默认 47）：  
   - 在 ref 环序取 prev/next branch 的 **ref first-step 角**  
   - `angMid = angPrev + (angNext−angPrev)_ccw / 2`  
   - **仅**写该 segment 的 far 端点 `round(j + dist·(cos,sin))`  
   - **不** moveGridPoint 同步其它段

## 与 analyzeRotationStructure 差异

| | app | 离线 skill |
|---|-----|------------|
| ref/out 空间 | 皆格网 | ref lat/lng, out 格网 |
| Fail | 分支 cyclic | 路线对 + snap |
| fix | graph 迭代 | 单行 47 默认 |
