/**
 * 🗺️ 路線圖轉換直線骨架 — 在紅/藍站點（connect / terminal）之間拉直折線
 *
 * ⚠️ 僅供 route_map_adjust_straight 使用；與 route_map_adjust 的骨架流程獨立。
 *
 * 流程：
 *  1. 紅/藍錨點間以直線取代折線
 *  2. 頭尾同點（環線）：在拉直後路徑弧長 1/3、2/3 處插入 2 個轉折點
 *  3. 黑點站在各紅/藍段上依弧長平均分配
 *  4. 再呼叫 buildRouteMapAdjustSkeleton
 */
import {
  computeRouteMapAdjustRouteStations,
  computeRouteMapAdjustStations,
  buildRouteMapAdjustSkeleton,
} from './routeStations.js';

const round = (n) => Number(Number(n).toFixed(6));
const key = (p) => `${round(p[0])},${round(p[1])}`;
const metaKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;

const dedupePoints = (points, tol = 1e-5) => {
  const out = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue;
    if (!out.some((q) => Math.abs(q[0] - p[0]) < tol && Math.abs(q[1] - p[1]) < tol)) {
      out.push([round(p[0]), round(p[1])]);
    }
  }
  return out;
};

/** 紅/藍錨點（原座標）＋拉直後黑點 → 骨架站點分類用座標清單 */
export const collectStraightSkeletonStationCoords = (
  originalLines,
  originalBlackDots,
  straightBlackDots,
  stationMeta = null
) => {
  const metaKeys = Object.keys(stationMeta || {}).map((k) => k.split(',').map(Number));
  const { terminals, connects } = computeRouteMapAdjustStations(
    originalLines,
    originalBlackDots,
    metaKeys.length ? metaKeys : undefined
  );
  return dedupePoints([...(terminals || []), ...(connects || []), ...(straightBlackDots || [])]);
};

const planarDist = (a, b) => {
  const dx = a[1] - b[1];
  const dy = a[0] - b[0];
  return Math.sqrt(dx * dx + dy * dy);
};

/** 點 p 在折線上的投影（平面近似） */
const closestPointOnSegment = (p, a, b) => {
  const px = p[1];
  const py = p[0];
  const ax = a[1];
  const ay = a[0];
  const bx = b[1];
  const by = b[0];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [ay + t * dy, ax + t * dx];
};

const projectOnPolyline = (latlngs, point) => {
  let best = null;
  let cum = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = latlngs[i];
    const b = latlngs[i + 1];
    const c = closestPointOnSegment(point, a, b);
    const perpDist = planarDist(point, c);
    if (!best || perpDist < best.perpDist) {
      best = { pos: cum + planarDist(a, c), perpDist };
    }
    cum += planarDist(a, b);
  }
  return best;
};

/** 將每個黑點指派到投影距離最近的路線 */
const assignBlacksToRoutes = (lines, blackDots) => {
  const perRoute = lines.map(() => []);
  for (const b of blackDots) {
    if (!Array.isArray(b) || b.length < 2) continue;
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      const pr = projectOnPolyline(lines[i].latlngs, b);
      if (!pr) continue;
      if (!best || pr.perpDist < best.perpDist) {
        best = { routeIndex: i, pos: pr.pos, perpDist: pr.perpDist, latlng: b };
      }
    }
    if (best) {
      perRoute[best.routeIndex].push({ latlng: best.latlng, pos: best.pos });
    }
  }
  perRoute.forEach((arr) => arr.sort((a, b) => a.pos - b.pos));
  return perRoute;
};

/** 頭尾同點（環線）：closed 旗標或起終點座標相同 */
const isLoopRoute = (line) => {
  const pts = line?.latlngs;
  if (!Array.isArray(pts) || pts.length < 2) return false;
  return line.closed === true || key(pts[0]) === key(pts[pts.length - 1]);
};

/** 兩錨點間線性插值（至少 2 點） */
const equidistantPoints = (pStart, pEnd, totalPoints) => {
  if (totalPoints <= 1) return [[...pStart]];
  const out = [];
  for (let i = 0; i < totalPoints; i++) {
    const t = i / (totalPoints - 1);
    out.push([
      pStart[0] + (pEnd[0] - pStart[0]) * t,
      pStart[1] + (pEnd[1] - pStart[1]) * t,
    ]);
  }
  return out;
};

/** 折線弧長 */
const polylineLength = (path, closed = false) => {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += planarDist(path[i], path[i + 1]);
  if (closed && path.length >= 2) total += planarDist(path[path.length - 1], path[0]);
  return total;
};

/** 沿折線取距起點 targetDist 之座標（open polyline） */
const pointAtArcLength = (path, targetDist) => {
  if (!path?.length) return null;
  if (targetDist <= 0) return [...path[0]];
  let cum = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = planarDist(path[i], path[i + 1]);
    if (cum + seg >= targetDist) {
      const t = seg > 0 ? (targetDist - cum) / seg : 0;
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ];
    }
    cum += seg;
  }
  return [...path[path.length - 1]];
};

/** 在折線上依弧長比例插入轉折頂點（可 closed） */
const insertVerticesAtArcFractions = (path, fractions, closed = false) => {
  if (!Array.isArray(path) || path.length < 2 || !fractions?.length) return path;
  let pts = path.map((p) => [...p]);
  if (closed && pts.length >= 2 && key(pts[0]) === key(pts[pts.length - 1])) {
    pts = pts.slice(0, -1);
  }

  const buildSegs = (arr, isClosed) => {
    const segs = [];
    for (let i = 0; i < arr.length - 1; i++) {
      segs.push({ a: arr[i], b: arr[i + 1], i });
    }
    if (isClosed && arr.length >= 2) {
      segs.push({ a: arr[arr.length - 1], b: arr[0], i: arr.length - 1, wrap: true });
    }
    return segs;
  };

  for (const frac of [...fractions].sort((a, b) => a - b)) {
    const segs = buildSegs(pts, closed);
    const total = segs.reduce((s, x) => s + planarDist(x.a, x.b), 0);
    if (total <= 0) continue;
    const target = frac * total;
    let cum = 0;
    let inserted = null;
    let segIdx = -1;
    let segT = 0;
    for (let si = 0; si < segs.length; si++) {
      const len = planarDist(segs[si].a, segs[si].b);
      if (cum + len >= target - 1e-12) {
        segT = len > 0 ? (target - cum) / len : 0;
        segIdx = si;
        const a = segs[si].a;
        const b = segs[si].b;
        inserted = [a[0] + (b[0] - a[0]) * segT, a[1] + (b[1] - a[1]) * segT];
        break;
      }
      cum += len;
    }
    if (!inserted || segIdx < 0) continue;

    const seg = segs[segIdx];
    if (seg.wrap) {
      pts.push(inserted);
    } else {
      pts.splice(seg.i + 1, 0, inserted);
    }
  }

  if (closed && pts.length >= 2) {
    if (key(pts[0]) !== key(pts[pts.length - 1])) pts.push([...pts[0]]);
  }
  return pts;
};

/** 沿折線（open）依 (j+1)/(k+1) 平均放置 k 個黑點 */
const placeBlacksEvenlyOnPolyline = (path, count) => {
  if (!count || !Array.isArray(path) || path.length < 2) return [];
  const total = polylineLength(path, false);
  if (total <= 0) return [];
  const out = [];
  for (let j = 0; j < count; j++) {
    const target = ((j + 1) / (count + 1)) * total;
    out.push(pointAtArcLength(path, target));
  }
  return out;
};

/** 在折線上找與 latlng 同鍵的頂點索引；無精確匹配則取最近頂點 */
const indexOnPath = (path, latlng) => {
  const k = key(latlng);
  const exact = path.findIndex((p) => key(p) === k);
  if (exact >= 0) return exact;
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = planarDist(path[i], latlng);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
};

/**
 * 取拉直後折線上 anchorA → anchorB 之子路徑（依路線行進方向；環線可繞回）。
 */
const extractSubPathOnStraight = (path, aLatlng, bLatlng, closed = false) => {
  if (!Array.isArray(path) || path.length < 2) return path || [];
  let pts = path.map((p) => [...p]);
  if (closed && pts.length >= 2 && key(pts[0]) === key(pts[pts.length - 1])) {
    pts = pts.slice(0, -1);
  }
  const ia = indexOnPath(pts, aLatlng);
  const ib = indexOnPath(pts, bLatlng);
  if (ia === ib) {
    if (closed && pts.length >= 2) return pts.map((p) => [...p]);
    return [[...pts[ia]]];
  }
  if (!closed) {
    const lo = Math.min(ia, ib);
    const hi = Math.max(ia, ib);
    return pts.slice(lo, hi + 1).map((p) => [...p]);
  }
  if (ia <= ib) return pts.slice(ia, ib + 1).map((p) => [...p]);
  return [...pts.slice(ia), ...pts.slice(0, ib + 1)].map((p) => [...p]);
};

const appendPath = (out, seg) => {
  if (!seg.length) return;
  if (!out.length) out.push(...seg.map((p) => [...p]));
  else {
    for (let i = 0; i < seg.length; i++) {
      if (i === 0 && key(out[out.length - 1]) === key(seg[0])) continue;
      out.push([...seg[i]]);
    }
  }
};

/**
 * 單條路線：在相鄰紅/藍錨點之間以直線取代折線；環線再插入 1/3、2/3 轉折點。
 */
const straightenOneLine = (line, routeIndex, blackDots, allLines) => {
  const pts = line.latlngs;
  if (!Array.isArray(pts) || pts.length < 2) return line;

  const isClosed = isLoopRoute(line);
  const routeInfo = computeRouteMapAdjustRouteStations(allLines, blackDots)[routeIndex];
  const anchors = (routeInfo?.stations || []).filter(
    (s) => s.type === 'terminal' || s.type === 'connect'
  );

  anchors.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  const deduped = [];
  for (const a of anchors) {
    if (!a?.latlng) continue;
    if (!deduped.length || key(deduped[deduped.length - 1].latlng) !== key(a.latlng)) {
      deduped.push(a);
    }
  }

  let out = [];

  if (deduped.length < 2) {
    if (isClosed) {
      const total = polylineLength(pts, false);
      const s = deduped[0]?.latlng || pts[0];
      const p1 = pointAtArcLength(pts, total / 3);
      const p2 = pointAtArcLength(pts, (2 * total) / 3);
      appendPath(out, equidistantPoints(s, p1, 2));
      appendPath(out, equidistantPoints(p1, p2, 2));
      appendPath(out, equidistantPoints(p2, s, 2));
    } else {
      const a = deduped[0]?.latlng || pts[0];
      const b = pts[pts.length - 1];
      out = equidistantPoints(a, b, 2);
    }
  } else {
    const pairs = [];
    for (let i = 0; i < deduped.length - 1; i++) {
      pairs.push([deduped[i].latlng, deduped[i + 1].latlng]);
    }
    if (isClosed && deduped.length >= 2) {
      pairs.push([deduped[deduped.length - 1].latlng, deduped[0].latlng]);
    }
    for (const [a, b] of pairs) {
      appendPath(out, equidistantPoints(a, b, 2));
    }
  }

  if (isClosed) {
    out = insertVerticesAtArcFractions(out, [1 / 3, 2 / 3], true);
  }

  const closedOut = isClosed && out.length >= 2 && key(out[0]) === key(out[out.length - 1]);
  return {
    ...line,
    latlngs: out,
    closed: closedOut ? true : line.closed,
  };
};

/**
 * 各路線在紅/藍錨點間拉直（深拷貝，不修改原物件）。
 */
export const straightenRouteMapAdjustLinesAtRedBlue = (lines, blackDots = []) => {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];
  return safeLines.map((line, i) =>
    straightenOneLine(JSON.parse(JSON.stringify(line)), i, blackDots, safeLines)
  );
};

/**
 * 黑點站在拉直後折線上重新計算：各紅/藍段內依弧長平均分配。
 * @returns {{ blackDots: Array<[number,number]>, stationMeta: object }}
 */
export const redistributeBlackDotsOnStraightenedLines = (
  originalLines,
  straightenedLines,
  blackDots = [],
  stationMeta = null
) => {
  const meta = stationMeta && typeof stationMeta === 'object' ? { ...stationMeta } : {};
  const oldKeyToNew = new Map();
  const POS_EPS = 1e-6;

  const safeOrig = Array.isArray(originalLines)
    ? originalLines.filter((l) => l && Array.isArray(l.latlngs) && l.latlngs.length >= 2)
    : [];

  const routeInfos = computeRouteMapAdjustRouteStations(safeOrig, blackDots);
  const blacksByRoute = assignBlacksToRoutes(safeOrig, blackDots);

  routeInfos.forEach((routeInfo, routeIndex) => {
    const straightPath = straightenedLines[routeIndex]?.latlngs || [];
    if (straightPath.length < 2) return;

    const origLine = safeOrig[routeIndex];
    const isClosed = isLoopRoute(origLine);
    const routeBlacks = blacksByRoute[routeIndex] || [];

    const anchors = (routeInfo.stations || [])
      .filter((s) => s.type === 'terminal' || s.type === 'connect')
      .map((s) => {
        const pr = projectOnPolyline(origLine.latlngs, s.latlng);
        return { ...s, pos: s.pos ?? pr?.pos ?? 0 };
      })
      .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

    const deduped = [];
    for (const a of anchors) {
      if (!a?.latlng) continue;
      if (!deduped.length || key(deduped[deduped.length - 1].latlng) !== key(a.latlng)) {
        deduped.push(a);
      }
    }

    const sections = [];
    if (deduped.length >= 2) {
      for (let i = 0; i < deduped.length - 1; i++) {
        sections.push({ a: deduped[i], b: deduped[i + 1], wrap: false, fullLoop: false });
      }
      if (isClosed) {
        sections.push({
          a: deduped[deduped.length - 1],
          b: deduped[0],
          wrap: true,
          fullLoop: false,
        });
      }
    } else if (isClosed && deduped.length === 1) {
      sections.push({ a: deduped[0], b: deduped[0], wrap: true, fullLoop: true });
    } else if (deduped.length === 1) {
      const end = origLine.latlngs[origLine.latlngs.length - 1];
      sections.push({ a: deduped[0], b: { pos: Infinity, latlng: end }, wrap: false, fullLoop: false });
    } else if (routeBlacks.length) {
      const pts = origLine.latlngs;
      sections.push({
        a: { pos: 0, latlng: pts[0] },
        b: { pos: Infinity, latlng: pts[pts.length - 1] },
        wrap: false,
        fullLoop: false,
      });
    }

    for (const section of sections) {
      const a = section.a ?? section[0];
      const b = section.b ?? section[1];
      const wrap = section.wrap === true;
      const fullLoop = section.fullLoop === true;
      const sameAnchor = key(a.latlng) === key(b.latlng);
      const ap = a.pos ?? 0;
      const bp = b.pos ?? 0;

      const blacksInSection = routeBlacks.filter((s) => {
        if (fullLoop) return key(s.latlng) !== key(a.latlng);
        if (sameAnchor) return false;
        if (wrap && isClosed) {
          return s.pos > ap + POS_EPS || s.pos < bp - POS_EPS;
        }
        const lo = Math.min(ap, bp);
        const hi = Math.max(ap, bp);
        return s.pos > lo + POS_EPS && s.pos < hi - POS_EPS;
      });

      if (!blacksInSection.length) continue;

      const subPath = fullLoop || sameAnchor
        ? extractSubPathOnStraight(straightPath, a.latlng, b.latlng, isClosed)
        : extractSubPathOnStraight(straightPath, a.latlng, b.latlng, wrap && isClosed);

      const placed = placeBlacksEvenlyOnPolyline(subPath, blacksInSection.length);
      blacksInSection.forEach((st, idx) => {
        if (!placed[idx]) return;
        const oldK = metaKey(st.latlng[0], st.latlng[1]);
        oldKeyToNew.set(oldK, placed[idx]);
      });
    }
  });

  const newBlacks = [];
  const newMeta = {};
  const seenNew = new Set();

  for (const b of blackDots) {
    if (!Array.isArray(b) || b.length < 2) continue;
    const oldK = metaKey(b[0], b[1]);
    const pt = oldKeyToNew.get(oldK);
    if (!pt) continue;
    const nk = metaKey(pt[0], pt[1]);
    if (!seenNew.has(nk)) {
      seenNew.add(nk);
      newBlacks.push([round(pt[0]), round(pt[1])]);
    }
    if (meta[oldK] && !newMeta[nk]) newMeta[nk] = meta[oldK];
  }

  // 保留紅/藍站中繼（座標不變）；黑點只留新位置
  const movedBlackKeys = new Set(oldKeyToNew.keys());
  const keptMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!movedBlackKeys.has(k)) keptMeta[k] = v;
  }

  return { blackDots: newBlacks, stationMeta: { ...keptMeta, ...newMeta } };
};

/**
 * 先拉直、環線加 1/3/2/3 轉折、黑點平均分配，再建骨架。
 */
export const buildRouteMapAdjustStraightSkeleton = (
  lines,
  blackDots = null,
  stationMeta = null
) => {
  const meta = stationMeta && typeof stationMeta === 'object' ? stationMeta : {};
  const blacks = Array.isArray(blackDots) ? blackDots : [];

  const straightened = straightenRouteMapAdjustLinesAtRedBlue(lines, blacks);
  const { blackDots: straightBlackDots, stationMeta: straightMeta } =
    redistributeBlackDotsOnStraightenedLines(lines, straightened, blacks, meta);

  const anchorCoords = collectStraightSkeletonStationCoords(lines, blacks, [], meta);
  const allStationCoords = collectStraightSkeletonStationCoords(
    lines,
    blacks,
    straightBlackDots,
    meta
  );
  const metaKeys = Object.keys(meta).map((k) => k.split(',').map(Number));
  const { terminals: origTerminals, connects: origConnects } = computeRouteMapAdjustStations(
    lines,
    blacks,
    metaKeys.length ? metaKeys : undefined
  );

  const straightMetaOut = { ...straightMeta };
  for (const p of anchorCoords) {
    const k = metaKey(p[0], p[1]);
    if (!straightMetaOut[k]) straightMetaOut[k] = meta[k] || {};
  }

  const skeleton = buildRouteMapAdjustSkeleton(straightened, straightBlackDots, allStationCoords, {
    terminals: origTerminals,
    connects: origConnects,
  });
  return {
    skeleton,
    straightenedLines: straightened,
    straightenedBlackDots: straightBlackDots,
    straightenedStationMeta: straightMetaOut,
    straightAnchorCoords: anchorCoords,
  };
};
