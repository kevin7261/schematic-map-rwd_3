# 360° 環序驗證 — 算法細節

## 資料結構

### Flat segment

每條 `LineString` feature → `{ route_name, points: [[x,y], ...] }`

- input：`x=lng, y=lat`
- result：格網整數或浮點

### Junction table

對 segment `si` 的 head（index 0）與 tail（index last）：

- `jKey = key6(x, y)` 分歧點
- `nKey = key6(另一端 x, y)` branch 身分
- 同一 `(jKey, nKey)` 合併路線名

只保留 `branches.size >= 3` 的 `jKey`。

座標 key：`key6(x,y) => "${x.toFixed(6)},${y.toFixed(6)}"`

## 角度與排序

### far-end 角（標準 A，路線對）

```javascript
function leaveAngleToFarEnd(seg, jHead, nKey) {
  const pts = seg.points;
  const [jx, jy] = pts[jHead ? 0 : pts.length - 1];
  const [ox, oy] = nKey.split(',').map(Number);
  return Math.atan2(oy - jy, ox - jx);
}
```

### first-step 角（標準 B，分支級）

```javascript
function leaveAngleFirstStep(seg, jHead) {
  const pts = seg.points;
  const [jx, jy] = pts[jHead ? 0 : pts.length - 1];
  const [ox, oy] = pts[jHead ? 1 : pts.length - 2];
  return Math.atan2(oy - jy, ox - jx);
}
```

CCW 排序：依角度遞增，同角以 `nKey` tie-break。

## 標準 A：路線對 flip

對 junction 的 CCW 序列 `order`（元素為 `nKey`）：

```javascript
function firstRouteIndex(order, junction, route) {
  return order.findIndex((nKey) => junction.get(nKey).route === route);
}

function routePairOrder(order, junction, routeA, routeB) {
  const iA = firstRouteIndex(order, junction, routeA);
  const iB = firstRouteIndex(order, junction, routeB);
  const n = order.length;
  const step = (iB - iA + n) % n;
  return step <= n / 2 ? 'A before B' : 'B before A';
}
```

對所有不同路線對 `(A,B)`：若 `routePairOrder(refOrder)` ≠ `routePairOrder(outOrder)` → violation。

注意：2 路 4 支時，`firstRouteIndex` 取該路**第一次**出現在 CCW 環上的 branch。

## 標準 B：分支級 cyclic

```javascript
function sameCyclic(a, b) {
  if (a.length !== b.length || !a.length) return true;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[(start + i) % a.length]) return false;
  return true;
}
```

`refOrder` 與 `outOrder`（皆為 `nKey[]`）比對。  
**不作主 fail**，因 4 支 2 路常假陽性。

## 假陽性機制（教學用）

### 同路兩支

4 向 = 路線 P 進/出 + 路線 Q 進/出。分支級要求 `[P1,Q1,P2,Q2]` 完全一致；  
路徑簡化可能變 `[P1,Q1,Q2,P2]`，但 `firstRouteIndex(P)` 與 `firstRouteIndex(Q)` 先後不變 → 標準 A Pass。

### 第一段角度

中和新蘆一支 segVerts 4→2 時，firstStep 角可差 ~44°，分支排序變、路線對不變。

### 座標系

ref 用 lat/lng、out 用格網；角度在各自空間計算。路線對檢查只看**先後**，較穩。

## 與 rotationStructure.js 對照

| 函式 | 用途 |
|------|------|
| `buildJunctionTable` | 建分歧點表 |
| `leaveAngle` | 第一段方向 |
| `orderedNKeys` | CCW 排序 |
| `sameCyclic` | 分支級比對 |
| `firstFlipPair` | 分支級錯誤描述 |

本 skill 新增：**路線對 flip** 作為 `violations` 來源。
