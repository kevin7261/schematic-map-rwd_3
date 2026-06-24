/**
 * 路段工具：建立「直線路段」列表
 *
 * 規則：
 * - 不被 JSON 格式影響，純粹依「座標／幾何」決定連通與順序
 * - 下一筆路段 = 該轉折點（當前段終點）處「起點」與其相同的路段
 * - 同一路線全部執行完才換下一路線
 */

import { exceedsAllowedColinearOverlap1D } from '@/utils/routeOverlapGridTolerance.js';

const EPS = 1e-4;

/** 0＝整數格點；1＝小數第一位（Test3 g3 Flip L，由 flipLShapeInRoutesData 暫時設定） */
let SNAP_COORD_DECIMALS = 0;

function roundScalarForSnap(v) {
  const n = Number(v);
  if (SNAP_COORD_DECIMALS <= 0) {
    return Math.abs(n - Math.round(n)) < 0.01 ? Math.round(n) : n;
  }
  const f = 10 ** SNAP_COORD_DECIMALS;
  return Math.round(n * f) / f;
}

const getCoord = (p) =>
  Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x || 0), Number(p?.y || 0)];

/** 兩點是否相同（容差） */
const samePoint = (a, b) => a && b && Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

/** 叉積：三點共線 → 不是轉折點 */
const isTurn = (prev, curr, next) => {
  const cross =
    (curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0]);
  return Math.abs(cross) > EPS;
};

/** 反轉 raw JSON 路段（起終點互換，points 反向） */
function reverseRawSeg(seg) {
  return {
    ...seg,
    points: [...seg.points].reverse(),
    properties_start: seg.properties_end,
    properties_end: seg.properties_start,
    __reversed: !seg.__reversed,
  };
}

function buildSegmentViewsFromRoutesData(routesData) {
  if (!Array.isArray(routesData)) return [];

  const segmentViews = [];

  routesData.forEach((item) => {
    if (!item) return;

    if (Array.isArray(item.segments) && !item.points) {
      const routeName = item.route_name || item.name || 'Unknown';
      item.segments.forEach((seg) => {
        if (!seg?.points?.length) return;
        segmentViews.push({
          ...seg,
          name: routeName,
          __sourceRef: seg,
          __reversed: false,
        });
      });
      return;
    }

    if (Array.isArray(item.points) && item.points.length >= 2) {
      const routeName =
        item.name || item.route_name || item.way_properties?.tags?.route_name || 'Unknown';
      segmentViews.push({
        ...item,
        name: routeName,
        __sourceRef: item,
        __reversed: false,
      });
    }
  });

  return segmentViews;
}

/**
 * 依「座標」把 JSON 路段串成連通鏈（不使用 connect_number）
 * 允許路段反向接（JSON 段方向不一致時仍能正確串接）
 * 兩段相連 = 前段末點 == 後段起點  OR  前段末點 == 後段末點（此時反轉後段）
 */
export function buildChainsByCoords(segs) {
  if (!segs || segs.length === 0) return [];

  const used = new Set();
  const chains = [];

  const segStart = (s) => getCoord(s.points[0]);
  const segEnd = (s) => getCoord(s.points[s.points.length - 1]);

  while (used.size < segs.length) {
    let idx = segs.findIndex((_, i) => !used.has(i));
    if (idx < 0) break;

    const chain = [segs[idx]];
    used.add(idx);

    // 往後延伸：起點 = 當前末點（正向） OR 末點 = 當前末點（反向）
    for (;;) {
      const lastPt = segEnd(chain[chain.length - 1]);
      let next = segs.findIndex((s, i) => !used.has(i) && samePoint(segStart(s), lastPt));
      if (next >= 0) {
        chain.push(segs[next]);
        used.add(next);
        continue;
      }
      next = segs.findIndex((s, i) => !used.has(i) && samePoint(segEnd(s), lastPt));
      if (next >= 0) {
        chain.push(reverseRawSeg(segs[next]));
        used.add(next);
        continue;
      }
      break;
    }

    // 往前延伸：末點 = 當前起點（正向） OR 起點 = 當前起點（反向）
    for (;;) {
      const firstPt = segStart(chain[0]);
      let prev = segs.findIndex((s, i) => !used.has(i) && samePoint(segEnd(s), firstPt));
      if (prev >= 0) {
        chain.unshift(segs[prev]);
        used.add(prev);
        continue;
      }
      prev = segs.findIndex((s, i) => !used.has(i) && samePoint(segStart(s), firstPt));
      if (prev >= 0) {
        chain.unshift(reverseRawSeg(segs[prev]));
        used.add(prev);
        continue;
      }
      break;
    }

    chains.push(chain);
  }

  return chains;
}

/**
 * 將多條路線依「相同 route_name」＋端點座標串接成鏈（僅同路線內串接，不跨路線）
 * 供 taipei_a「串接Flip L型」：先串接再做 flip
 * @param {Array} routesData - 與 spaceNetworkGridJsonData 同格式（每項為 route，含 segments 或自身為單段）
 * @returns {Array} 串接後的路線陣列，每條 route 為 { route_name, name, segments: [...] }
 */
export function mergeRoutesByCoords(routesData) {
  if (!Array.isArray(routesData) || routesData.length === 0) return [];

  const flatSegs = [];
  routesData.forEach((route) => {
    if (Array.isArray(route?.segments) && !route?.points) {
      const name = route.route_name ?? route.name ?? 'Unknown';
      route.segments.forEach((seg) => {
        if (seg?.points?.length) flatSegs.push({ ...seg, name });
      });
    } else if (Array.isArray(route?.points) && route.points.length >= 2) {
      flatSegs.push({
        ...route,
        name: route.route_name ?? route.name ?? 'Unknown',
      });
    }
  });
  if (flatSegs.length === 0) return routesData;

  // 依 route_name 分組，僅在「同一 route_name」內依端點座標串接
  const byRouteName = new Map();
  flatSegs.forEach((seg) => {
    const routeName = seg.name ?? 'Unknown';
    if (!byRouteName.has(routeName)) byRouteName.set(routeName, []);
    byRouteName.get(routeName).push(seg);
  });

  // 依「輸入 routesData 的順序」輸出，確保：同路線起頭→尾端執行完才換下一路線
  const routeOrder = [];
  const seen = new Set();
  routesData.forEach((route) => {
    const name = route.route_name ?? route.name ?? 'Unknown';
    if (!seen.has(name)) {
      seen.add(name);
      routeOrder.push(name);
    }
  });

  const result = [];
  routeOrder.forEach((routeName) => {
    const segs = byRouteName.get(routeName) || [];
    if (segs.length === 0) return;
    const chains = buildChainsByCoords(segs);
    chains.forEach((chain, chainIdx) => {
      const name = chains.length === 1 ? routeName : `${routeName}_${chainIdx}`;
      result.push({
        route_name: routeName,
        name,
        segments: chain,
      });
    });
  });
  return result;
}

/**
 * FLIP 前處理：把同 route_name 的所有 segment 串接成一條路線，並移除所有紅點（connect）與黑點（station）。
 * 結果為每個 route_name 對應一條路線（單一 route 含一個 segment，points 為整條路線的所有座標）。
 * @param {Array} routesData - spaceNetworkGridJsonData 格式
 * @returns {Array} 處理後的路線陣列
 */
export function mergeAndStripConnectPoints(routesData) {
  if (!Array.isArray(routesData) || routesData.length === 0) return [];

  const flatSegs = [];
  routesData.forEach((route) => {
    if (Array.isArray(route?.segments) && !route?.points) {
      const name = route.route_name ?? route.name ?? 'Unknown';
      route.segments.forEach((seg) => {
        if (seg?.points?.length) flatSegs.push({ ...seg, name });
      });
    } else if (Array.isArray(route?.points) && route.points.length >= 2) {
      flatSegs.push({ ...route, name: route.route_name ?? route.name ?? 'Unknown' });
    }
  });
  if (flatSegs.length === 0) return routesData;

  const byRouteName = new Map();
  flatSegs.forEach((seg) => {
    const rn = seg.name ?? 'Unknown';
    if (!byRouteName.has(rn)) byRouteName.set(rn, []);
    byRouteName.get(rn).push(seg);
  });

  const routeOrder = [];
  const seen = new Set();
  routesData.forEach((route) => {
    const name = route.route_name ?? route.name ?? 'Unknown';
    if (!seen.has(name)) {
      seen.add(name);
      routeOrder.push(name);
    }
  });

  const result = [];
  routeOrder.forEach((routeName) => {
    const segs = byRouteName.get(routeName) || [];
    if (segs.length === 0) return;
    const chains = buildChainsByCoords(segs);

    chains.forEach((chain) => {
      const allPts = [];
      const allNodes = [];
      // 串接時僅在「接點」處去重，使用較嚴格的容差（1e-9）避免將相近但相異的點誤合併
      const MERGE_EPS = 1e-9;
      const samePointMerge = (a, b) =>
        a && b && Math.abs(a[0] - b[0]) < MERGE_EPS && Math.abs(a[1] - b[1]) < MERGE_EPS;
      chain.forEach((seg, si) => {
        const pts = (seg.points || []).map((p) => getCoord(p));
        const segNodes = seg.nodes || [];
        const start = si === 0 ? 0 : 1;
        for (let i = start; i < pts.length; i++) {
          if (allPts.length === 0 || !samePointMerge(allPts[allPts.length - 1], pts[i])) {
            allPts.push(pts[i]);
            allNodes.push(segNodes[i] ? { ...segNodes[i] } : { node_type: 'line' });
          }
        }
      });

      const nodes =
        allNodes.length === allPts.length ? allNodes : allPts.map(() => ({ node_type: 'line' }));

      result.push({
        route_name: routeName,
        name: routeName,
        segments: [
          {
            points: allPts,
            nodes,
            properties_start: { x_grid: allPts[0]?.[0], y_grid: allPts[0]?.[1] },
            properties_end: {
              x_grid: allPts[allPts.length - 1]?.[0],
              y_grid: allPts[allPts.length - 1]?.[1],
            },
            way_properties: chain[0]?.way_properties ?? {},
          },
        ],
      });
    });
  });
  return result;
}

/**
 * 從一條鏈（已串接的 JSON 段）擷取直線段
 */
function extractStraightFromChain(chain, routeName, chainId) {
  const allCoords = [];
  const coordMeta = [];

  chain.forEach((seg, segIdx) => {
    const pts = seg.points || [];
    const start = segIdx === 0 ? 0 : 1;
    for (let i = start; i < pts.length; i++) {
      allCoords.push(getCoord(pts[i]));
      coordMeta.push({ segIdx, ptIdx: i });
    }
  });

  if (allCoords.length < 2) return [];

  // 去除連續重複點，避免漏判轉折（例如 蘆洲→徐匯中學→大橋頭 路徑中的重複點）
  const deduped = [];
  const dedupedMeta = [];
  for (let i = 0; i < allCoords.length; i++) {
    if (i === 0 || !samePoint(allCoords[i], allCoords[i - 1])) {
      deduped.push(allCoords[i]);
      dedupedMeta.push(coordMeta[i]);
    }
  }
  const allCoordsFinal = deduped;
  const coordMetaFinal = dedupedMeta;

  const turningIndices = [0];
  for (let i = 1; i < allCoordsFinal.length - 1; i++) {
    if (isTurn(allCoordsFinal[i - 1], allCoordsFinal[i], allCoordsFinal[i + 1]))
      turningIndices.push(i);
  }
  turningIndices.push(allCoordsFinal.length - 1);

  const result = [];
  for (let k = 0; k < turningIndices.length - 1; k++) {
    const i0 = turningIndices[k];
    const i1 = turningIndices[k + 1];
    const p0 = allCoordsFinal[i0];
    const p1 = allCoordsFinal[i1];
    const m0 = coordMetaFinal[i0];
    const m1 = coordMetaFinal[i1];
    const seg0 = chain[m0.segIdx];
    const seg1 = chain[m1.segIdx];

    const props_start =
      m0.ptIdx === 0 && seg0.properties_start
        ? seg0.properties_start
        : { x_grid: p0[0], y_grid: p0[1], station_id: null, station_name: null };

    const lastPtIdx = (chain[m1.segIdx].points || []).length - 1;
    const props_end =
      m1.ptIdx === lastPtIdx && seg1.properties_end
        ? seg1.properties_end
        : { x_grid: p1[0], y_grid: p1[1], station_id: null, station_name: null };

    result.push({
      routeName,
      points: [p0, p1],
      jsonSegment: seg0,
      properties_start: props_start,
      properties_end: props_end,
      way_properties: seg0.way_properties,
      chain,
      chainId,
      startCoordMeta: m0,
      endCoordMeta: m1,
    });
  }

  return result;
}

/** 反轉單一 segment（交換起終點） */
function reverseSegment(seg) {
  return {
    ...seg,
    points: [seg.points[1], seg.points[0]],
    properties_start: seg.properties_end,
    properties_end: seg.properties_start,
  };
}

/**
 * 依「轉折點座標」找下一筆：起點 = 前一筆的終點（除路線起點外）
 * - 只從 head 開始（起點不是任何段末點）
 * - 當 chain B 的終點 = 當前終點時，反轉 B 再接上，使連續
 */
function orderSegmentsByTurningPoint(segments) {
  if (segments.length <= 1) return segments;

  const used = new Set();
  const result = [];

  // 找出 head：起點不是任何其他段的末點
  const isHead = (i) => {
    const startPt = segments[i].points[0];
    return !segments.some((s, j) => j !== i && samePoint(s.points[1], startPt));
  };

  /** 從 startIdx 出發往後接，回傳此 chain 的 segment 索引陣列 */
  const collectChainFrom = (startIdx) => {
    const chain = [];
    let cur = startIdx;
    while (cur !== -1 && !used.has(cur)) {
      used.add(cur);
      chain.push(cur);
      const endPt = segments[cur].points[1];
      const next = segments.findIndex((s, i) => !used.has(i) && samePoint(s.points[0], endPt));
      cur = next >= 0 ? next : -1;
    }
    return chain;
  };

  const heads = segments
    .map((_, i) => i)
    .filter((i) => isHead(i))
    .sort((a, b) => {
      const va = segments[a].points[0][0] + segments[a].points[0][1];
      const vb = segments[b].points[0][0] + segments[b].points[0][1];
      return va - vb;
    });

  /** chains: 每個元素是 segment 索引陣列 */
  const chains = [];
  heads.forEach((i) => {
    if (!used.has(i)) chains.push(collectChainFrom(i));
  });

  while (used.size < segments.length) {
    const lastEnd = result.length > 0 ? result[result.length - 1].points[1] : [0, 0];
    let bestIdx = -1;
    let bestDist = Infinity;
    segments.forEach((s, i) => {
      if (used.has(i)) return;
      const d = (s.points[0][0] - lastEnd[0]) ** 2 + (s.points[0][1] - lastEnd[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) break;
    chains.push(collectChainFrom(bestIdx));
  }

  /** 將 chains 串接，盡量讓「下一 chain 的起點 = 上 chain 的終點」。若找不到起點相符的，則找終點相符的 chain 並反轉後接上 */
  const orderedChains = [];
  const chainUsed = new Set();
  let currentEnd = null;

  const getChainStart = (c) => segments[c[0]].points[0];
  const getChainEnd = (c) => segments[c[c.length - 1]].points[1];

  const appendChain = (chain, reversed = false) => {
    const inds = reversed ? [...chain].reverse() : chain;
    inds.forEach((idx) => {
      const seg = segments[idx];
      result.push(reversed ? reverseSegment(seg) : seg);
    });
    currentEnd = reversed ? getChainStart(chain) : getChainEnd(chain);
  };

  while (orderedChains.length < chains.length) {
    if (currentEnd === null) {
      const headChainIdx = chains.findIndex((c, i) => !chainUsed.has(i) && isHead(c[0]));
      const anyUnusedIdx = chains.findIndex((_, i) => !chainUsed.has(i));
      const idx = headChainIdx >= 0 ? headChainIdx : anyUnusedIdx;
      if (idx < 0) break;
      chainUsed.add(idx);
      appendChain(chains[idx], false);
      orderedChains.push(idx);
      continue;
    }

    let found = -1;
    let foundReversed = false;
    for (let i = 0; i < chains.length; i++) {
      if (chainUsed.has(i)) continue;
      const c = chains[i];
      if (samePoint(getChainStart(c), currentEnd)) {
        found = i;
        foundReversed = false;
        break;
      }
      if (samePoint(getChainEnd(c), currentEnd)) {
        found = i;
        foundReversed = true;
        break;
      }
    }

    if (found >= 0) {
      chainUsed.add(found);
      appendChain(chains[found], foundReversed);
      orderedChains.push(found);
    } else {
      currentEnd = null;
    }
  }

  return result;
}

/**
 * 主函式：建立直線路段列表
 * 不被 JSON 影響，純依「轉折點座標」找下一筆；同路線執行完才換路線
 */
export function buildStraightSegments(layoutGridJsonData_Test) {
  if (!layoutGridJsonData_Test || !Array.isArray(layoutGridJsonData_Test)) return [];

  const byRoute = {};
  const routeOrder = [];
  const seen = new Set();

  layoutGridJsonData_Test.forEach((seg) => {
    const routeName = seg.name || seg.way_properties?.tags?.route_name || 'Unknown';
    if (!byRoute[routeName]) byRoute[routeName] = [];
    byRoute[routeName].push(seg);
    if (!seen.has(routeName)) {
      seen.add(routeName);
      routeOrder.push(routeName);
    }
  });

  const result = [];

  routeOrder.forEach((routeName) => {
    const rawSegs = byRoute[routeName] || [];

    // 依座標串接（不用 connect_number）
    const chains = buildChainsByCoords(rawSegs);

    // 每條鏈擷取直線段
    const allStraight = [];
    chains.forEach((chain, chainIndex) => {
      const segs = extractStraightFromChain(chain, routeName, `${routeName}::${chainIndex}`);
      segs.forEach((s) => allStraight.push(s));
    });

    // 依轉折點找下一筆：起點 = 當前終點 才算相連
    const ordered = orderSegmentsByTurningPoint(allStraight);
    ordered.forEach((s) => result.push(s));
  });

  return result;
}

/**
 * 與 flipLShapeInRoutesData 內部一致：先 buildSegmentViewsFromRoutesData 再 buildStraightSegments。
 * flip 的索引必須用此函式產生的直線段列表；勿用手動 flatten（getTaipeiTestLayoutData）再 buildStraightSegments，否則與實際 flip 的 idx 可能錯位。
 */
export function buildStraightSegmentsForFlip(routesData) {
  const segmentViews = buildSegmentViewsFromRoutesData(routesData);
  return buildStraightSegments(segmentViews);
}

const isAxisAligned = (p1, p2) => Math.abs(p1[0] - p2[0]) < EPS || Math.abs(p1[1] - p2[1]) < EPS;

const pointOnSegment = (p, s, e) => {
  if (!p || !s || !e) return false;
  const minX = Math.min(s[0], e[0]) - EPS;
  const maxX = Math.max(s[0], e[0]) + EPS;
  const minY = Math.min(s[1], e[1]) - EPS;
  const maxY = Math.max(s[1], e[1]) + EPS;

  if (Math.abs(s[0] - e[0]) < EPS) {
    return Math.abs(p[0] - s[0]) < EPS && p[1] >= minY && p[1] <= maxY;
  }

  if (Math.abs(s[1] - e[1]) < EPS) {
    return Math.abs(p[1] - s[1]) < EPS && p[0] >= minX && p[0] <= maxX;
  }

  return false;
};

const segmentRatio = (p, s, e) => {
  const dx = e[0] - s[0];
  const dy = e[1] - s[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    return Math.abs(dx) < EPS ? 0 : (p[0] - s[0]) / dx;
  }
  return Math.abs(dy) < EPS ? 0 : (p[1] - s[1]) / dy;
};

const lerpPoint = (s, e, t) => {
  const x = s[0] + (e[0] - s[0]) * t;
  const y = s[1] + (e[1] - s[1]) * t;
  if (SNAP_COORD_DECIMALS <= 0) {
    return [
      Math.abs(x - Math.round(x)) < EPS ? Math.round(x) : x,
      Math.abs(y - Math.round(y)) < EPS ? Math.round(y) : y,
    ];
  }
  const f = 10 ** SNAP_COORD_DECIMALS;
  return [Math.round(x * f) / f, Math.round(y * f) / f];
};

function classifyPointOnFlipPath(point, a, b, c) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const p = [Number(point[0]), Number(point[1])];
  if (samePoint(p, b)) return 'corner';
  if (pointOnSegment(p, a, b)) return 'ab';
  if (pointOnSegment(p, b, c)) return 'bc';
  return null;
}

function transformPointByFlip(point, a, b, c, d) {
  if (!Array.isArray(point) || point.length < 2) return point;

  const p = [Number(point[0]), Number(point[1])];

  if (pointOnSegment(p, a, b)) {
    return lerpPoint(a, d, segmentRatio(p, a, b));
  }

  if (pointOnSegment(p, b, c)) {
    return lerpPoint(d, c, segmentRatio(p, b, c));
  }

  return p;
}

function transformPointTuple(point, a, b, c, d) {
  if (!Array.isArray(point) || point.length < 2) return point;
  const nextCoord = transformPointByFlip(point, a, b, c, d);
  if (point.length > 2) return [nextCoord[0], nextCoord[1], point[2]];
  return nextCoord;
}

/**
 * 回傳 { points, insertIndex }：insertIndex 為插入角點 D 的索引，若無插入則為 -1
 */
function transformOrthogonalPointListWithInsertInfo(points, a, b, c, d) {
  if (!Array.isArray(points)) return { points: points || [], insertIndex: -1 };

  const transformed = [];
  const alignedOriginal = [];
  let prevClass = null;
  let insertIndex = -1;

  points.forEach((point) => {
    const currentClass = classifyPointOnFlipPath(point, a, b, c);
    const mappedPoint = transformPointTuple(point, a, b, c, d);

    if (
      prevClass &&
      currentClass &&
      prevClass !== currentClass &&
      prevClass !== 'corner' &&
      currentClass !== 'corner'
    ) {
      insertIndex = transformed.length;
      transformed.push([d[0], d[1]]);
      alignedOriginal.push([b[0], b[1]]);
    }

    const last = transformed[transformed.length - 1];
    const coord = getCoord(mappedPoint);
    if (!last || !samePoint(getCoord(last), coord)) {
      transformed.push(Array.isArray(mappedPoint) ? mappedPoint : coord);
      alignedOriginal.push(getCoord(point));
    }
    prevClass = currentClass;
  });

  return {
    points: fixDiagonalWithoutAddingPoints(transformed, alignedOriginal),
    insertIndex,
  };
}

/** 消除斜線且不增加轉折點：調整既有點位置，維持水平或垂直，且不讓下一段變斜線 */
function fixDiagonalWithoutAddingPoints(transformed, originalPoints) {
  if (!Array.isArray(transformed) || transformed.length < 2) return transformed;
  let result = transformed.map((p) => getCoord(p));
  const orig = (originalPoints || []).map((p) => getCoord(p));
  const hasDiagonal = (pts) => {
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j];
      const b = pts[j + 1];
      if (Math.abs(b[0] - a[0]) > EPS && Math.abs(b[1] - a[1]) > EPS) return true;
    }
    return false;
  };
  let maxPasses = result.length + 2;
  while (hasDiagonal(result) && maxPasses-- > 0) {
    for (let i = 0; i < result.length - 1; i++) {
      const p1 = result[i];
      const p2 = result[i + 1];
      const p3 = i + 2 < result.length ? result[i + 2] : null;
      const dx = Math.abs(p2[0] - p1[0]);
      const dy = Math.abs(p2[1] - p1[1]);

      if (dx > EPS && dy > EPS) {
        const o1 = orig[i] || p1;
        const o2 = orig[i + 1] || p2;
        const wasVertical = Math.abs(o2[0] - o1[0]) < EPS;
        const optVertical = [p1[0], p2[1]];
        const optHorizontal = [p2[0], p1[1]];
        const nextStaysAlignedIfVertical =
          !p3 || Math.abs(p3[0] - optVertical[0]) < EPS || Math.abs(p3[1] - optVertical[1]) < EPS;
        const nextStaysAlignedIfHorizontal =
          !p3 ||
          Math.abs(p3[0] - optHorizontal[0]) < EPS ||
          Math.abs(p3[1] - optHorizontal[1]) < EPS;
        if (nextStaysAlignedIfVertical && !nextStaysAlignedIfHorizontal) {
          result[i + 1] = optVertical;
        } else if (nextStaysAlignedIfHorizontal && !nextStaysAlignedIfVertical) {
          result[i + 1] = optHorizontal;
        } else if (wasVertical) {
          result[i + 1] = optVertical;
        } else {
          result[i + 1] = optHorizontal;
        }
      }
    }
  }
  return result.map((c) => [roundScalarForSnap(c[0]), roundScalarForSnap(c[1])]);
}

function snapCoordPair(c) {
  return [roundScalarForSnap(c[0]), roundScalarForSnap(c[1])];
}

function polylineHasNonOrthogonalEdge(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return false;
  for (let j = 0; j < pts.length - 1; j++) {
    const a = getCoord(pts[j]);
    const b = getCoord(pts[j + 1]);
    if (Math.abs(b[0] - a[0]) > EPS && Math.abs(b[1] - a[1]) > EPS) return true;
  }
  return false;
}

/**
 * 將 polyline 化為純水平／垂直：遇斜邊則插入一格點轉成 L（原頂點仍依序出現於新路徑中）
 */
function orthogonalizePolylineByInsertingCorners(points, preferAltCornerFirst = false) {
  const src = [];
  for (const p of points || []) {
    const c = snapCoordPair(getCoord(p));
    if (!src.length || !samePoint(src[src.length - 1], c)) src.push(c);
  }
  if (src.length < 2) return src;
  const out = [src[0].slice()];
  for (let i = 0; i < src.length - 1; i++) {
    const a = out[out.length - 1];
    const b = src[i + 1];
    if (samePoint(a, b)) continue;
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    if (dx < EPS || dy < EPS) {
      out.push(b.slice());
      continue;
    }
    const prev = out.length >= 2 ? out[out.length - 2] : null;
    const cameHoriz = prev && Math.abs(a[1] - prev[1]) < EPS;
    const alt1 = snapCoordPair([b[0], a[1]]);
    const alt2 = snapCoordPair([a[0], b[1]]);
    let corner;
    if (!prev) {
      corner = preferAltCornerFirst ? alt2 : alt1;
    } else {
      corner = cameHoriz ? alt2 : alt1;
    }
    if (samePoint(a, corner)) corner = samePoint(a, alt1) ? alt2 : alt1;
    if (samePoint(corner, b)) {
      out.push(b.slice());
      continue;
    }
    if (!samePoint(a, corner)) out.push(corner);
    out.push(b.slice());
  }
  if (polylineHasNonOrthogonalEdge(out) && !preferAltCornerFirst) {
    const retry = orthogonalizePolylineByInsertingCorners(points, true);
    if (!polylineHasNonOrthogonalEdge(retry)) return retry;
  }
  return out;
}

/** 起／迄頂點若有站別或 connect，必須保留（f3→g3 Flip L 後正交化插入轉折時，循序對齊易漏掉尾端） */
function nodeCarriesStationOrConnect(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.node_type === 'connect') return true;
  if (String(n.station_id ?? n.tags?.station_id ?? '').trim()) return true;
  if (String(n.station_name ?? n.tags?.station_name ?? n.tags?.name ?? '').trim()) return true;
  return Boolean(n.tags?._forceDrawBlackDot);
}

/**
 * 依座標在 newPts 上找回舊折線起／迄的節點身分，寫回 newNodes（從頭找起點、從尾找終點）
 */
function repairEndpointNodesAfterPolylineRemap(newPts, newNodes, oldPts, oldNodes) {
  if (!Array.isArray(newPts) || !Array.isArray(newNodes) || newNodes.length !== newPts.length) return;
  if (!Array.isArray(oldPts) || !Array.isArray(oldNodes) || oldPts.length === 0) return;

  const applyAtOldIndex = (oldIdx, preferFromEnd) => {
    const on = oldNodes[oldIdx];
    if (!nodeCarriesStationOrConnect(on)) return;
    const target = snapCoordPair(getCoord(oldPts[oldIdx]));
    const order = preferFromEnd
      ? [...Array(newPts.length).keys()].reverse()
      : [...Array(newPts.length).keys()];
    for (const ni of order) {
      if (samePoint(snapCoordPair(getCoord(newPts[ni])), target)) {
        newNodes[ni] = { ...on };
        return;
      }
    }
  };

  applyAtOldIndex(0, false);
  if (oldPts.length > 1) {
    applyAtOldIndex(oldPts.length - 1, true);
  }
}

function mergeNodesAfterOrthogonalize(oldPts, oldNodes, newPts) {
  if (!Array.isArray(oldNodes) || oldNodes.length !== oldPts.length) {
    return (newPts || []).map(() => ({ node_type: 'line' }));
  }
  const newNodes = [];
  let j = 0;
  for (let i = 0; i < (newPts || []).length; i++) {
    const p = snapCoordPair(getCoord(newPts[i]));
    if (j < oldPts.length && samePoint(p, snapCoordPair(getCoord(oldPts[j])))) {
      newNodes.push({ ...oldNodes[j] });
      j++;
    } else {
      newNodes.push({ node_type: 'line' });
    }
  }
  repairEndpointNodesAfterPolylineRemap(newPts, newNodes, oldPts, oldNodes);
  return newNodes;
}

/** Flip／ㄈ縮減後強制 points 每段正交，並依座標對齊補齊 nodes */
function enforceOrthogonalSegmentPointsAndNodes(segment, pointsKey, nodesKey) {
  const pts = segment[pointsKey];
  if (!Array.isArray(pts) || pts.length < 2) return;
  const ptsBefore = pts.map((p) => snapCoordPair(getCoord(p)));
  const ortho = orthogonalizePolylineByInsertingCorners(ptsBefore).map(snapCoordPair);
  segment[pointsKey] = ortho;
  const nds = segment[nodesKey];
  if (!Array.isArray(nds) || nds.length !== ptsBefore.length) return;
  segment[nodesKey] = mergeNodesAfterOrthogonalize(ptsBefore, nds, ortho);
}

/**
 * Connect 節點（紅點）的移動規則：
 * - 角點 B → 移到 D
 * - 原本在 A→B 臂上的其他點 → 移到對應新臂的「同一軸位置」（純水平或純垂直位移）
 * - 如果 A→B 是水平（y 相同）：D→C 也是水平，y 從 A.y 移到 C.y，x 不變。
 * - 如果 A→B 是垂直（x 相同）：D→C 也是垂直，x 從 A.x 移到 C.x，y 不變。
 * - B→C 臂同理。
 * 回傳 null 代表不在 L 型路徑上（不需移動）。
 */
function transformConnectNodeOnFlip(nodePos, a, b, c) {
  const p = [Number(nodePos[0]), Number(nodePos[1])];

  // A、C 是固定端點，不移動
  if (samePoint(p, a) || samePoint(p, c)) return null;

  if (pointOnSegment(p, a, b)) {
    if (Math.abs(a[0] - b[0]) < EPS) {
      return [c[0], p[1]];
    } else {
      return [p[0], c[1]];
    }
  }

  if (pointOnSegment(p, b, c)) {
    if (Math.abs(b[0] - c[0]) < EPS) {
      return [a[0], p[1]];
    } else {
      return [p[0], a[1]];
    }
  }

  return null;
}

function syncSegmentGeometry(segment, a, b, c, d) {
  if (!segment || !Array.isArray(segment.points)) return;

  // 1. 記住 connect 節點的原始渲染位置（flip 前），後面要用來修正
  const connectInfoBeforeFlip = [];
  if (Array.isArray(segment.nodes)) {
    segment.nodes.forEach((node, idx) => {
      if (node.node_type === 'connect' && idx < segment.points.length) {
        connectInfoBeforeFlip.push({ origIdx: idx, origPos: getCoord(segment.points[idx]) });
      }
    });
  }

  // 2. 用 lerp 變換整條 polyline（路線形狀的 flip）
  const { points, insertIndex } = transformOrthogonalPointListWithInsertInfo(
    segment.points,
    a,
    b,
    c,
    d
  );
  segment.points = points;

  // 3. nodes 陣列：D 插入點補一個 node_type:'line'，維持 points[i] 與 nodes[i] 對齊
  if (Array.isArray(segment.nodes) && insertIndex >= 0) {
    segment.nodes.splice(insertIndex, 0, { node_type: 'line' });
  }

  // 3b. 強制正交：插入轉角格點，避免 flip 後殘留斜線
  enforceOrthogonalSegmentPointsAndNodes(segment, 'points', 'nodes');

  // 4. 紅點只做「位移」：不改 points（線保持 flip 後的正交形狀），只寫入 node 的 display_x/display_y
  //    繪圖時用 display_x/display_y 畫紅點，線仍用 points（插入轉角後依座標對齊節點索引）
  connectInfoBeforeFlip.forEach(({ origPos }) => {
    const correctPos = transformConnectNodeOnFlip(origPos, a, b, c);
    if (!correctPos) return;
    const sp = snapCoordPair(correctPos);
    let k = -1;
    for (let i = 0; i < segment.points.length; i++) {
      if (samePoint(snapCoordPair(getCoord(segment.points[i])), sp)) {
        k = i;
        break;
      }
    }
    if (k >= 0 && segment.nodes[k]) {
      const node = segment.nodes[k];
      node.display_x = sp[0];
      node.display_y = sp[1];
    }
  });

  // 5. original_points / original_nodes 同步處理
  let origInsertIndex = -1;
  if (Array.isArray(segment.original_points)) {
    const origResult = transformOrthogonalPointListWithInsertInfo(
      segment.original_points,
      a,
      b,
      c,
      d
    );
    segment.original_points = origResult.points;
    origInsertIndex = origResult.insertIndex;
  }
  if (Array.isArray(segment.original_nodes) && origInsertIndex >= 0) {
    segment.original_nodes.splice(origInsertIndex, 0, { node_type: 'line' });
  }
  if (Array.isArray(segment.original_points)) {
    if (Array.isArray(segment.original_nodes)) {
      enforceOrthogonalSegmentPointsAndNodes(segment, 'original_points', 'original_nodes');
    } else {
      const op = segment.original_points;
      if (op.length >= 2) {
        const before = op.map((p) => snapCoordPair(getCoord(p)));
        segment.original_points =
          orthogonalizePolylineByInsertingCorners(before).map(snapCoordPair);
      }
    }
  }
}

function flipLShapeInRoutesDataInternal(routesData, segStartIdx, options = {}) {
  const clonedRoutesData = JSON.parse(JSON.stringify(routesData || []));
  const segmentViews = buildSegmentViewsFromRoutesData(clonedRoutesData);
  const straightSegments = buildStraightSegments(segmentViews);
  const analysis = computeFlipAnalysis(straightSegments, segStartIdx, segmentViews, options);

  if (!analysis.canFlip) {
    return {
      changed: false,
      routesData: clonedRoutesData,
      straightSegments,
      analysis,
      flippedConnectPoints: [],
    };
  }

  const seg = straightSegments[segStartIdx];
  const segNext = straightSegments[segStartIdx + 1];
  if (!seg || !segNext || seg.chainId !== segNext.chainId || !Array.isArray(seg.chain)) {
    return {
      changed: false,
      routesData: clonedRoutesData,
      straightSegments,
      analysis: { ...analysis, reason: analysis.reason || '找不到可修改的原始路段' },
      flippedConnectPoints: [],
    };
  }

  const a = seg.points[0];
  const b = seg.points[1];
  const c = segNext.points[1];
  if (!isAxisAligned(a, b) || !isAxisAligned(b, c)) {
    return {
      changed: false,
      routesData: clonedRoutesData,
      straightSegments,
      analysis: { ...analysis, reason: '目前只支援正交 L 型 Flip' },
      flippedConnectPoints: [],
    };
  }

  const d = [a[0] + c[0] - b[0], a[1] + c[1] - b[1]];

  // 只改 L 型路段自身涵蓋的原始資料段（chain 裡從 startChainIdx 到 endChainIdx）。
  // 其他路線的座標完全不動：A 和 C 本來就不移動，B 是幾何轉折點而非 connect 點，
  // 不會有其他路線的端點剛好在 B，因此不需要更新其他路線。
  const startChainIdx = seg.startCoordMeta?.segIdx;
  const endChainIdx = segNext.endCoordMeta?.segIdx;
  if (startChainIdx === undefined || endChainIdx === undefined) {
    return {
      changed: false,
      routesData: clonedRoutesData,
      straightSegments,
      analysis: { ...analysis, reason: '找不到路段鏈結資訊' },
      flippedConnectPoints: [],
    };
  }

  const lShapeSourceSegs = new Set();
  for (let i = startChainIdx; i <= endChainIdx; i++) {
    const source = seg.chain[i]?.__sourceRef || seg.chain[i];
    if (source) lShapeSourceSegs.add(source);
  }

  // STEP 1：從 L 型路段的 points[i]（渲染座標）蒐集 connect 節點的舊→新位置對應表
  // 關鍵：紅點渲染位置來自 points[i]，而非 nodes[i].x_grid/y_grid（那是 OSM 原始座標，不同）
  // 必須在 syncSegmentGeometry 修改 points 之前蒐集
  const connectMovesByPos = new Map(); // "roundX,roundY" → newPos（渲染座標）
  const connectMovesByNumber = new Map(); // connect_number → newPos
  const connectOldNewByNumber = new Map(); // connect_number → { oldPos, newPos }（供紅點一覽顯示 flip 前/後座標）

  lShapeSourceSegs.forEach((lSeg) => {
    if (!Array.isArray(lSeg.points)) return;
    lSeg.points.forEach((pt, idx) => {
      const node = lSeg.nodes?.[idx];
      if (!node || node.node_type !== 'connect') return;
      const pos = getCoord(pt);
      const newPos = transformConnectNodeOnFlip(pos, a, b, c);
      if (!newPos || samePoint(pos, newPos)) return;
      const snappedNew = snapCoordPair(newPos);
      const posKey = `${roundScalarForSnap(pos[0])},${roundScalarForSnap(pos[1])}`;
      connectMovesByPos.set(posKey, snappedNew);
      const cn = node.connect_number ?? node.tags?.connect_number;
      if (cn != null) {
        connectMovesByNumber.set(cn, snappedNew);
        connectOldNewByNumber.set(cn, { oldPos: pos, newPos: snappedNew });
      }
    });
  });

  // STEP 2：更新 L 型路段的幾何（points 陣列）+ properties_start/end 座標
  lShapeSourceSegs.forEach((sourceSegment) => {
    syncSegmentGeometry(sourceSegment, a, b, c, d);
    if (!Array.isArray(sourceSegment.points) || sourceSegment.points.length === 0) return;
    const firstPt = getCoord(sourceSegment.points[0]);
    const lastPt = getCoord(sourceSegment.points[sourceSegment.points.length - 1]);
    if (sourceSegment.properties_start) {
      sourceSegment.properties_start.x_grid = firstPt[0];
      sourceSegment.properties_start.y_grid = firstPt[1];
    }
    if (sourceSegment.properties_end) {
      sourceSegment.properties_end.x_grid = lastPt[0];
      sourceSegment.properties_end.y_grid = lastPt[1];
    }
  });

  // STEP 3：其他路段的 connect 節點跟著移動——同步更新 points 座標、nodes、properties
  const seenForUpdate = new Set();
  segmentViews.forEach((view) => {
    const source = view?.__sourceRef || view;
    if (!source || lShapeSourceSegs.has(source) || seenForUpdate.has(source)) return;
    seenForUpdate.add(source);
    if (!Array.isArray(source.points)) return;

    source.points.forEach((pt, idx) => {
      const pos = getCoord(pt);
      const key = `${roundScalarForSnap(pos[0])},${roundScalarForSnap(pos[1])}`;
      const newPos = connectMovesByPos.get(key);
      if (!newPos) return;
      // 更新 points 座標（關鍵：reconfigureStations 靠 points 建路徑和偵測交叉）
      source.points[idx] = snapCoordPair(newPos);
      if (idx === 0 && source.properties_start) {
        source.properties_start.x_grid = newPos[0];
        source.properties_start.y_grid = newPos[1];
      }
      if (idx === source.points.length - 1 && source.properties_end) {
        source.properties_end.x_grid = newPos[0];
        source.properties_end.y_grid = newPos[1];
      }
    });
  });

  // STEP 4：snap 座標（整數或 0.1 格），防止浮點漂移
  lShapeSourceSegs.forEach((seg) => {
    if (!Array.isArray(seg.points)) return;
    seg.points = seg.points.map((pt) => snapCoordPair(getCoord(pt)));
    if (seg.properties_start) {
      seg.properties_start.x_grid = roundScalarForSnap(seg.properties_start.x_grid);
      seg.properties_start.y_grid = roundScalarForSnap(seg.properties_start.y_grid);
    }
    if (seg.properties_end) {
      seg.properties_end.x_grid = roundScalarForSnap(seg.properties_end.x_grid);
      seg.properties_end.y_grid = roundScalarForSnap(seg.properties_end.y_grid);
    }
  });

  const flippedConnectPoints = Array.from(connectOldNewByNumber.entries()).map(
    ([cn, { oldPos, newPos }]) => ({
      connect_number: cn,
      x_grid_before: oldPos[0],
      y_grid_before: oldPos[1],
      x_grid: roundScalarForSnap(newPos[0]),
      y_grid: roundScalarForSnap(newPos[1]),
    })
  );

  return {
    changed: true,
    routesData: clonedRoutesData,
    straightSegments: buildStraightSegments(buildSegmentViewsFromRoutesData(clonedRoutesData)),
    analysis,
    flippedConnectPoints,
  };
}

/**
 * @param {{ coordDecimals?: number }} [options] coordDecimals=1 時對齊小數第一位（Test3 g3）
 */
export function flipLShapeInRoutesData(routesData, segStartIdx, options = {}) {
  const prev = SNAP_COORD_DECIMALS;
  SNAP_COORD_DECIMALS = options.coordDecimals ?? 0;
  try {
    return flipLShapeInRoutesDataInternal(routesData, segStartIdx, options);
  } finally {
    SNAP_COORD_DECIMALS = prev;
  }
}

/**
 * 從直線路段列表產生 DataTable 資料
 * 順序與 buildStraightSegments 完全一致 = 下一路段執行順序（從頭到尾，同路線完成才換路線）
 *
 * @param {Array} straightSegments - buildStraightSegments 的輸出
 * @returns {Array<Object>} DataTable 每列資料
 */
/** 從 properties 物件取站名，找不到時回傳 null */
function getStationLabel(props, fallbackCoord) {
  const name = props?.station_name || props?.tags?.station_name || props?.tags?.name;
  if (name) return name;
  if (fallbackCoord) return `${fallbackCoord[0]},${fallbackCoord[1]}`;
  return null;
}

export function generateDataTableDataFromStraightSegments(straightSegments) {
  if (!straightSegments || straightSegments.length === 0) return [];

  // 先算每個 segment 的原始起終點標籤
  const labels = straightSegments.map((seg) => ({
    start: getStationLabel(seg.properties_start, seg.points[0]),
    end: getStationLabel(seg.properties_end, seg.points[1]),
    p0: seg.points[0],
    p1: seg.points[1],
  }));

  // 讓「前一筆的終點座標 = 這一筆的起點座標」時，強制使用相同的標籤（取有名字的那個優先）
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1];
    const cur = labels[i];
    if (samePoint(prev.p1, cur.p0)) {
      const canonical =
        (prev.end && !prev.end.includes(',') ? prev.end : null) ||
        (cur.start && !cur.start.includes(',') ? cur.start : null) ||
        prev.end;
      prev.end = canonical;
      cur.start = canonical;
    }
  }

  return straightSegments.map((seg, index) => {
    const color = seg.way_properties?.tags?.color || seg.way_properties?.tags?.colour || '#999999';
    return {
      '#': index + 1,
      route_name: seg.routeName,
      route_color: color,
      color,
      起點: labels[index].start,
      終點: labels[index].end,
      id: `seg-${index}`,
    };
  });
}

/**
 * 從直線路段列表產生 DataTable 資料（L 型：每列 = 2 條相連直線段，欄位 起點 / 轉折點 / 終點）
 * 順序與 buildStraightSegments 一致，列數 = straightSegments.length - 1
 *
 * @param {Array} straightSegments - buildStraightSegments 的輸出
 * @returns {Array<Object>} DataTable 每列資料，每列含 起點、轉折點、終點
 */
export function generateDataTableDataFromLShapeSegments(straightSegments) {
  if (!straightSegments || straightSegments.length < 2) return [];

  const labels = straightSegments.map((seg) => ({
    start: getStationLabel(seg.properties_start, seg.points[0]),
    end: getStationLabel(seg.properties_end, seg.points[1]),
    p0: seg.points[0],
    p1: seg.points[1],
  }));

  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1];
    const cur = labels[i];
    if (samePoint(prev.p1, cur.p0)) {
      const canonical =
        (prev.end && !prev.end.includes(',') ? prev.end : null) ||
        (cur.start && !cur.start.includes(',') ? cur.start : null) ||
        prev.end;
      prev.end = canonical;
      cur.start = canonical;
    }
  }

  const result = [];
  for (let i = 0; i < straightSegments.length - 1; i++) {
    const seg = straightSegments[i];
    const segNext = straightSegments[i + 1];
    if (!samePoint(seg.points[1], segNext.points[0])) {
      // 不相連的段對：跳過，但 index 仍遞增（需繼續往後找相連的）
      continue;
    }
    const color = seg.way_properties?.tags?.color || seg.way_properties?.tags?.colour || '#999999';
    result.push({
      '#': result.length + 1,
      route_name: seg.routeName,
      route_color: color,
      color,
      起點: labels[i].start,
      轉折點: labels[i].end,
      終點: labels[i + 1].end,
      id: `lseg-${i}`,
      _segmentStartIndex: i, // 繪製高亮用：對應 straightSegments[i]、straightSegments[i+1]
    });
  }
  return result;
}

/**
 * 兩正交線段是否在同一條線上重疊（同一直線且區間相交）
 */
function orthogonalSegmentOverlaps(p1, p2, q1, q2) {
  const hP = Math.abs(p1[1] - p2[1]) < EPS;
  const hQ = Math.abs(q1[1] - q2[1]) < EPS;
  if (hP && hQ && Math.abs(p1[1] - q1[1]) < EPS) {
    const lo = Math.max(Math.min(p1[0], p2[0]), Math.min(q1[0], q2[0]));
    const hi = Math.min(Math.max(p1[0], p2[0]), Math.max(q1[0], q2[0]));
    return exceedsAllowedColinearOverlap1D(lo, hi);
  }
  const vP = Math.abs(p1[0] - p2[0]) < EPS;
  const vQ = Math.abs(q1[0] - q2[0]) < EPS;
  if (vP && vQ && Math.abs(p1[0] - q1[0]) < EPS) {
    const lo = Math.max(Math.min(p1[1], p2[1]), Math.min(q1[1], q2[1]));
    const hi = Math.min(Math.max(p1[1], p2[1]), Math.max(q1[1], q2[1]));
    return exceedsAllowedColinearOverlap1D(lo, hi);
  }
  return false;
}

/**
 * 一橫一豎兩線段是否在「內部」交叉（交點為兩段內點，非端點）
 */
function orthogonalSegmentsCross(p1, p2, q1, q2) {
  const hP = Math.abs(p1[1] - p2[1]) < EPS;
  const vQ = Math.abs(q1[0] - q2[0]) < EPS;
  if (hP && vQ) {
    const x = q1[0];
    const y = p1[1];
    const pxLo = Math.min(p1[0], p2[0]);
    const pxHi = Math.max(p1[0], p2[0]);
    const qyLo = Math.min(q1[1], q2[1]);
    const qyHi = Math.max(q1[1], q2[1]);
    if (x <= pxLo + EPS || x >= pxHi - EPS) return false;
    if (y <= qyLo + EPS || y >= qyHi - EPS) return false;
    return true;
  }
  const vP = Math.abs(p1[0] - p2[0]) < EPS;
  const hQ = Math.abs(q1[1] - q2[1]) < EPS;
  if (vP && hQ) {
    const x = p1[0];
    const y = q1[1];
    const pyLo = Math.min(p1[1], p2[1]);
    const pyHi = Math.max(p1[1], p2[1]);
    const qxLo = Math.min(q1[0], q2[0]);
    const qxHi = Math.max(q1[0], q2[0]);
    if (y <= pyLo + EPS || y >= pyHi - EPS) return false;
    if (x <= qxLo + EPS || x >= qxHi - EPS) return false;
    return true;
  }
  return false;
}

/**
 * 若兩正交線段於各自內部交叉，回傳交點 [x,y]；否則 null（與 orthogonalSegmentsCross 條件一致）
 */
function getOrthogonalCrossPoint(p1, p2, q1, q2) {
  const hP = Math.abs(p1[1] - p2[1]) < EPS;
  const vQ = Math.abs(q1[0] - q2[0]) < EPS;
  if (hP && vQ) {
    const x = q1[0];
    const y = p1[1];
    const pxLo = Math.min(p1[0], p2[0]);
    const pxHi = Math.max(p1[0], p2[0]);
    const qyLo = Math.min(q1[1], q2[1]);
    const qyHi = Math.max(q1[1], q2[1]);
    if (x <= pxLo + EPS || x >= pxHi - EPS) return null;
    if (y <= qyLo + EPS || y >= qyHi - EPS) return null;
    return [x, y];
  }
  const vP = Math.abs(p1[0] - p2[0]) < EPS;
  const hQ = Math.abs(q1[1] - q2[1]) < EPS;
  if (vP && hQ) {
    const x = p1[0];
    const y = q1[1];
    const pyLo = Math.min(p1[1], p2[1]);
    const pyHi = Math.max(p1[1], p2[1]);
    const qxLo = Math.min(q1[0], q2[0]);
    const qxHi = Math.max(q1[0], q2[0]);
    if (y <= pyLo + EPS || y >= pyHi - EPS) return null;
    if (x <= qxLo + EPS || x >= qxHi - EPS) return null;
    return [x, y];
  }
  return null;
}

/**
 * 蒐集目前圖面所有紅點座標（路線端點 + connect 節點）。
 * connect 節點若有 display_x/display_y，優先使用顯示座標。
 */
function collectRedPointPositions(straightSegments) {
  const result = [];
  const seen = new Set();
  const pushPoint = (p) => {
    if (!p) return;
    const c = getCoord(p);
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
    const key = `${Math.round(c[0] / EPS)},${Math.round(c[1] / EPS)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(c);
  };

  const collectConnectPointsFromSourceSegment = (source) => {
    if (!source || !Array.isArray(source.points) || !Array.isArray(source.nodes)) return;
    source.nodes.forEach((node, idx) => {
      const isConnect =
        node?.node_type === 'connect' ||
        node?.connect_number != null ||
        node?.tags?.connect_number != null;
      if (!isConnect) return;
      const dx = Number(node?.display_x);
      const dy = Number(node?.display_y);
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        pushPoint([dx, dy]);
        return;
      }
      if (idx < source.points.length) pushPoint(source.points[idx]);
    });
  };

  const seenSourceSeg = new Set();
  for (let i = 0; i < straightSegments.length; i++) {
    const s = straightSegments[i];
    const ps = s.properties_start;
    const pe = s.properties_end;
    if (ps && ps.x_grid != null && ps.y_grid != null)
      pushPoint([Number(ps.x_grid), Number(ps.y_grid)]);
    if (pe && pe.x_grid != null && pe.y_grid != null)
      pushPoint([Number(pe.x_grid), Number(pe.y_grid)]);

    const maybeCollect = (segRef) => {
      const source = segRef?.__sourceRef || segRef;
      if (!source || seenSourceSeg.has(source)) return;
      seenSourceSeg.add(source);
      collectConnectPointsFromSourceSegment(source);
    };
    maybeCollect(s.jsonSegment);
    if (Array.isArray(s.chain)) s.chain.forEach(maybeCollect);
  }

  return result;
}

/**
 * Flip 分析 — 禁止條件：
 * 1. L 型路徑上有紅點（connect）會被移動
 * 2. Flip 後會產生新的路線重疊或交叉
 *
 * @param {Array} straightSegments - buildStraightSegments 的輸出
 * @param {number} segStartIdx     - tableRow._segmentStartIndex
 * @param {Array} [flatSegments]   - 保留參數相容
 * @param {object} [options]       - 選用旗標（僅供「串接Flip L型」覆寫部分規則）
 * @param {boolean} [options.skipConnectMove=false] - 忽略「紅點會移動」禁止條件
 * @param {boolean} [options.skipCrossing=false]    - 忽略「與其他路線交叉」禁止條件
 * @param {boolean} [options.useRectangleOtherRouteCheck=false] - 改用「ABCD 矩形內有其他路線轉折點/起迄點/線段交叉點」禁止條件
 * @param {boolean} [options.forbidFlipIfLCornerHasConnect=false] - 若 L 型轉折點 B 上有 connect（紅點）則不可 flip（空間網絡網格測試_2 串接Flip 用）
 * @returns {{ reduceTurns: boolean, flipColor: string, reason: string, canFlip: boolean, turnChangeNet: number }}
 */
export function computeFlipAnalysis(straightSegments, segStartIdx, flatSegments, options = {}) {
  void flatSegments;
  const {
    skipConnectMove = false,
    skipCrossing = false,
    useRectangleOtherRouteCheck = false,
    forbidFlipIfLCornerHasConnect = false,
  } = options;
  if (!straightSegments || segStartIdx === undefined || segStartIdx < 0) {
    return {
      reduceTurns: false,
      flipColor: '#ef4444',
      reason: '資料不足',
      canFlip: false,
      turnChangeNet: 0,
    };
  }
  const seg = straightSegments[segStartIdx];
  const segNext = straightSegments[segStartIdx + 1];
  if (!seg || !segNext || !seg.points?.length || !segNext.points?.length) {
    return {
      reduceTurns: false,
      flipColor: '#ef4444',
      reason: '找不到相鄰路段',
      canFlip: false,
      turnChangeNet: 0,
    };
  }
  if (!samePoint(seg.points[1], segNext.points[0])) {
    return {
      reduceTurns: false,
      flipColor: '#ef4444',
      reason: '路段不相連',
      canFlip: false,
      turnChangeNet: 0,
    };
  }
  if (seg.chainId !== segNext.chainId) {
    return {
      reduceTurns: false,
      flipColor: '#ef4444',
      reason: '不屬於同一條路線鏈',
      canFlip: false,
      turnChangeNet: 0,
    };
  }

  const a = seg.points[0];
  const b = seg.points[1];
  const c = segNext.points[1];
  const d = [a[0] + c[0] - b[0], a[1] + c[1] - b[1]];

  if (!isAxisAligned(a, b) || !isAxisAligned(b, c)) {
    return {
      reduceTurns: false,
      flipColor: '#ef4444',
      reason: '非正交 L 型',
      canFlip: false,
      turnChangeNet: 0,
    };
  }

  // 禁止條件 1：L 型路徑上有會移動的紅點（connect）— 紅點永不改變
  let hasConnectWouldMove = false;
  let hasConnectAtLCorner = false;
  const bCornerSnap = snapCoordPair(getCoord(b));
  const startChainIdx = seg.startCoordMeta?.segIdx;
  const endChainIdx = segNext.endCoordMeta?.segIdx;
  const chain = seg.chain;
  if (
    chain &&
    Array.isArray(chain) &&
    startChainIdx !== undefined &&
    endChainIdx !== undefined &&
    startChainIdx <= endChainIdx
  ) {
    for (let i = startChainIdx; i <= endChainIdx; i++) {
      const source = chain[i]?.__sourceRef || chain[i];
      if (!source || !Array.isArray(source.points) || !Array.isArray(source.nodes)) continue;
      source.points.forEach((pt, idx) => {
        const node = source.nodes[idx];
        if (!node || node.node_type !== 'connect') return;
        const pos = getCoord(pt);
        if (forbidFlipIfLCornerHasConnect) {
          let atCorner = samePoint(snapCoordPair(pos), bCornerSnap);
          const dx = Number(node?.display_x);
          const dy = Number(node?.display_y);
          if (!atCorner && Number.isFinite(dx) && Number.isFinite(dy)) {
            atCorner = samePoint(snapCoordPair([dx, dy]), bCornerSnap);
          }
          if (atCorner) hasConnectAtLCorner = true;
        }
        const newPos = transformConnectNodeOnFlip(pos, a, b, c);
        if (newPos && !samePoint(pos, newPos)) hasConnectWouldMove = true;
      });
    }
  }

  // 禁止條件 2：Flip 後 A→D、D→C 不可與「任何」其他線段重疊或交叉（含其他路線 + 同路線自身）
  const excludeSet = new Set([segStartIdx, segStartIdx + 1]);
  let hasOverlap = false;
  let hasCrossing = false;
  for (let i = 0; i < straightSegments.length; i++) {
    if (excludeSet.has(i)) continue;
    const s = straightSegments[i];
    const q1 = s.points[0];
    const q2 = s.points[1];
    if (!q1 || !q2) continue;
    if (orthogonalSegmentOverlaps(a, d, q1, q2) || orthogonalSegmentOverlaps(d, c, q1, q2)) {
      hasOverlap = true;
      break;
    }
    if (!skipCrossing) {
      if (orthogonalSegmentsCross(a, d, q1, q2) || orthogonalSegmentsCross(d, c, q1, q2)) {
        hasCrossing = true;
        break;
      }
    }
  }

  // 禁止條件 3：同路線完整路徑自身重疊 / 交叉檢查
  //   同一 route_name 的任何兩段不可重疊或交叉（除非為路徑上真正相鄰的兩段，共端點）
  let hasSelfOverlap = false;
  if (!hasOverlap && !hasCrossing) {
    const lShapeRouteName = seg.routeName;
    const sameRouteSegs = [];
    for (let i = 0; i < straightSegments.length; i++) {
      if (straightSegments[i].routeName !== lShapeRouteName) continue;
      if (i === segStartIdx) {
        sameRouteSegs.push({ points: [a, d], _idx: i });
        sameRouteSegs.push({ points: [d, c], _idx: -1 });
      } else if (i === segStartIdx + 1) {
        continue;
      } else {
        sameRouteSegs.push({ points: straightSegments[i].points, _idx: i });
      }
    }
    for (let i = 0; i < sameRouteSegs.length && !hasSelfOverlap; i++) {
      for (let j = i + 1; j < sameRouteSegs.length; j++) {
        // 僅跳過路徑上真正相鄰的兩段（共端點且連續），不同 chain 的相鄰段也須檢查
        if (j === i + 1 && samePoint(sameRouteSegs[i].points[1], sameRouteSegs[j].points[0])) {
          continue;
        }
        const p1 = sameRouteSegs[i].points[0];
        const p2 = sameRouteSegs[i].points[1];
        const q1 = sameRouteSegs[j].points[0];
        const q2 = sameRouteSegs[j].points[1];
        if (orthogonalSegmentOverlaps(p1, p2, q1, q2) || orthogonalSegmentsCross(p1, p2, q1, q2)) {
          hasSelfOverlap = true;
          break;
        }
      }
    }
  }

  // 禁止條件 4：Flip 後新路徑 A→D、D→C 不可經過任何「未相連的紅點」（非此 L 端點 A、C 的交叉點）
  let hasRedPointOnNewPath = false;
  const redPointPositions = collectRedPointPositions(straightSegments);
  const lShapeEndA = a;
  const lShapeEndC = c;
  for (const p of redPointPositions) {
    if (samePoint(p, lShapeEndA) || samePoint(p, lShapeEndC)) continue;
    // D 也算在新路徑上：若 D 壓到其他紅點，視為不可 flip。
    const onAD = pointOnSegment(p, a, d) && !samePoint(p, a);
    const onDC = pointOnSegment(p, d, c) && !samePoint(p, c);
    if (onAD || onDC) {
      hasRedPointOnNewPath = true;
      break;
    }
  }

  // 禁止條件：L 型線段（A→B 或 B→C）上有其他路線的起迄點 → 不可 flip。
  // 例外：若其他路線的起迄點剛好在 L 的頭尾端點（A、C）上 → 允許 flip（Flip L 型與串接Flip L 型皆適用）
  let hasOtherRouteEndpointOnLShape = false;
  const lShapeRouteName = seg.routeName;
  const byRouteForLShape = new Map();
  straightSegments.forEach((s, i) => {
    const rn = s.routeName ?? 'Unknown';
    if (!byRouteForLShape.has(rn)) byRouteForLShape.set(rn, []);
    byRouteForLShape.get(rn).push({ seg: s, idx: i });
  });
  const isOnLShapeHeadOrTail = (p) => samePoint(p, a) || samePoint(p, c);
  for (const [routeName, list] of byRouteForLShape) {
    if (routeName === lShapeRouteName) continue;
    const segs = list.map((x) => x.seg);
    const firstPt = segs[0]?.points?.[0];
    const lastPt = segs[segs.length - 1]?.points?.[1];
    const fp = firstPt ? getCoord(firstPt) : null;
    const lp = lastPt ? getCoord(lastPt) : null;
    if (fp && !isOnLShapeHeadOrTail(fp) && (pointOnSegment(fp, a, b) || pointOnSegment(fp, b, c)))
      hasOtherRouteEndpointOnLShape = true;
    if (lp && !isOnLShapeHeadOrTail(lp) && (pointOnSegment(lp, a, b) || pointOnSegment(lp, b, c)))
      hasOtherRouteEndpointOnLShape = true;
    if (hasOtherRouteEndpointOnLShape) break;
  }

  // 禁止條件 5（僅 useRectangleOtherRouteCheck 時）：ABCD 矩形內不得有其他路線的轉折點、起迄點，或兩線段正交交叉點
  let hasOtherRouteTurningPointInRect = false;
  let hasOtherRouteEndpointsInRect = false;
  let hasOtherRouteSegmentCrossInRect = false;
  if (useRectangleOtherRouteCheck) {
    const minX = Math.min(a[0], b[0], c[0], d[0]);
    const maxX = Math.max(a[0], b[0], c[0], d[0]);
    const minY = Math.min(a[1], b[1], c[1], d[1]);
    const maxY = Math.max(a[1], b[1], c[1], d[1]);
    const isInsideRect = (p) => {
      if (!p || p.length < 2) return false;
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (samePoint(p, a) || samePoint(p, b) || samePoint(p, c) || samePoint(p, d)) return false;
      return x > minX + EPS && x < maxX - EPS && y > minY + EPS && y < maxY - EPS;
    };

    for (const [routeName, list] of byRouteForLShape) {
      if (routeName === lShapeRouteName) continue;
      const segs = list.map((x) => x.seg);
      for (let i = 0; i < segs.length - 1; i++) {
        const p = segs[i].points?.[1];
        if (p && samePoint(p, segs[i + 1].points?.[0]) && isInsideRect(getCoord(p))) {
          hasOtherRouteTurningPointInRect = true;
          break;
        }
      }
      if (hasOtherRouteTurningPointInRect) break;
      const firstPt = segs[0]?.points?.[0];
      const lastPt = segs[segs.length - 1]?.points?.[1];
      if (firstPt && isInsideRect(getCoord(firstPt))) hasOtherRouteEndpointsInRect = true;
      if (lastPt && isInsideRect(getCoord(lastPt))) hasOtherRouteEndpointsInRect = true;
      if (hasOtherRouteEndpointsInRect) break;
    }

    const flipI0 = segStartIdx;
    const flipI1 = segStartIdx + 1;
    for (let i = 0; i < straightSegments.length && !hasOtherRouteSegmentCrossInRect; i++) {
      for (let j = i + 1; j < straightSegments.length; j++) {
        if (i === flipI0 && j === flipI1) continue;
        const rnI = straightSegments[i].routeName ?? 'Unknown';
        const rnJ = straightSegments[j].routeName ?? 'Unknown';
        if (rnI === lShapeRouteName && rnJ === lShapeRouteName) continue;
        const p1 = straightSegments[i].points?.[0];
        const p2 = straightSegments[i].points?.[1];
        const q1 = straightSegments[j].points?.[0];
        const q2 = straightSegments[j].points?.[1];
        if (!p1 || !p2 || !q1 || !q2) continue;
        const crossPt = getOrthogonalCrossPoint(
          getCoord(p1),
          getCoord(p2),
          getCoord(q1),
          getCoord(q2)
        );
        if (crossPt && isInsideRect(crossPt)) {
          hasOtherRouteSegmentCrossInRect = true;
          break;
        }
      }
    }
  }

  const effectiveConnectMove = skipConnectMove ? false : hasConnectWouldMove;
  const effectiveCrossing = skipCrossing ? false : hasCrossing;
  const canFlip =
    !effectiveConnectMove &&
    !hasOverlap &&
    !effectiveCrossing &&
    !hasSelfOverlap &&
    !hasRedPointOnNewPath &&
    !hasOtherRouteTurningPointInRect &&
    !hasOtherRouteEndpointsInRect &&
    !hasOtherRouteSegmentCrossInRect &&
    !hasOtherRouteEndpointOnLShape &&
    !(forbidFlipIfLCornerHasConnect && hasConnectAtLCorner);
  const reasons = [];
  if (forbidFlipIfLCornerHasConnect && hasConnectAtLCorner)
    reasons.push('L 型轉折點為紅點（connect），不可 flip');
  if (hasConnectWouldMove && !skipConnectMove)
    reasons.push('L 型路徑上有紅點，flip 會改變紅點位置');
  if (hasOverlap) reasons.push('Flip 後會與其他路線重疊');
  if (hasCrossing && !skipCrossing) reasons.push('Flip 後會與其他路線交叉');
  if (hasSelfOverlap) reasons.push('Flip 後同路線自身會重疊或交叉');
  if (hasRedPointOnNewPath) reasons.push('Flip 後會落到其他未相連的紅點（交叉點）上');
  if (hasOtherRouteTurningPointInRect) reasons.push('ABCD 形成的矩形內有其他路線轉折點');
  if (hasOtherRouteEndpointsInRect) reasons.push('ABCD 形成的矩形內有其他路線起迄點');
  if (hasOtherRouteSegmentCrossInRect) reasons.push('ABCD 形成的矩形內有其他路線線段交叉點');
  if (hasOtherRouteEndpointOnLShape)
    reasons.push('L 型線段上有其他路線的起迄點相接（頭尾端點除外）');

  return {
    reduceTurns: true,
    canFlip,
    flipColor: canFlip ? '#22c55e' : '#ef4444',
    turnChangeNet: 0,
    reason: reasons.join('；'),
  };
}

/**
 * 與 computeFlipAnalysis 相同，但暫時套用 SNAP_COORD_DECIMALS（Test3 f3 小數格用 1）
 */
export function computeFlipAnalysisWithCoordDecimals(
  straightSegments,
  segStartIdx,
  layoutData,
  coordDecimals = 0,
  options = {}
) {
  const prev = SNAP_COORD_DECIMALS;
  SNAP_COORD_DECIMALS = coordDecimals ?? 0;
  try {
    return computeFlipAnalysis(straightSegments, segStartIdx, layoutData, options);
  } finally {
    SNAP_COORD_DECIMALS = prev;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ㄈ 縮減為 L 型（ㄈ-shape reduction）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 將 ㄈ 型路徑上的點映射到新的 L 型路徑位置
 *
 * @param {number[]} pt          - 待映射的點 [x, y]
 * @param {number[]} a,b,c,d     - ㄈ 型四個頂點
 * @param {boolean}  collapseASide - true = 折疊 A 側（|AB|<=|CD|）；false = 折疊 D 側
 * @returns {number[]} 新座標 [x, y]
 */
function transformPointOnNShape(pt, a, b, c, d, collapseASide) {
  const snapC = (v) => (Math.abs(v - Math.round(v)) < 0.01 ? Math.round(v) : v);
  const snap = (p) => [snapC(p[0]), snapC(p[1])];
  const p = getCoord(pt);
  const isHorizAB = Math.abs(a[1] - b[1]) < EPS;

  if (collapseASide) {
    // A→B 折疊到 A；shift = A - B（水平或垂直分量）
    const shift = isHorizAB ? [a[0] - b[0], 0] : [0, a[1] - b[1]];
    if (pointOnSegment(p, a, b)) return snap([a[0], a[1]]);
    if (pointOnSegment(p, b, c)) return snap([p[0] + shift[0], p[1] + shift[1]]);
    if (pointOnSegment(p, c, d)) {
      const lenCD = isHorizAB ? Math.abs(d[0] - c[0]) : Math.abs(d[1] - c[1]);
      if (lenCD < EPS) return snap([d[0], d[1]]);
      const r = isHorizAB ? Math.abs(p[0] - c[0]) / lenCD : Math.abs(p[1] - c[1]) / lenCD;
      return snap([p[0] + (1 - r) * shift[0], p[1] + (1 - r) * shift[1]]);
    }
  } else {
    // C→D 折疊到 D；shift = D - C（水平或垂直分量）
    const shift = isHorizAB ? [d[0] - c[0], 0] : [0, d[1] - c[1]];
    if (pointOnSegment(p, a, b)) {
      const lenAB = isHorizAB ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
      if (lenAB < EPS) return snap([a[0], a[1]]);
      const r = isHorizAB ? Math.abs(p[0] - a[0]) / lenAB : Math.abs(p[1] - a[1]) / lenAB;
      return snap([p[0] + r * shift[0], p[1] + r * shift[1]]);
    }
    if (pointOnSegment(p, b, c)) return snap([p[0] + shift[0], p[1] + shift[1]]);
    if (pointOnSegment(p, c, d)) return snap([d[0], d[1]]);
  }
  return snap([p[0], p[1]]);
}

/** ㄈ→L 去重時同座標兩節點合併：優先保留 connect（紅／藍）與站點資訊 */
function mergeColocatedNodesForNShapeDedup(prev, cur) {
  if (!prev) return cur ? { ...cur } : { node_type: 'line' };
  if (!cur) return { ...prev };
  const rank = (n) => {
    if (!n || typeof n !== 'object') return 0;
    if (n.node_type === 'connect') return 3;
    if (nodeCarriesStationOrConnect(n)) return 2;
    return 1;
  };
  const base = rank(cur) > rank(prev) ? { ...cur } : { ...prev };
  const other = rank(cur) > rank(prev) ? prev : cur;
  if (other && typeof other === 'object') {
    for (const k of Object.keys(other)) {
      if (base[k] == null || base[k] === '') base[k] = other[k];
    }
  }
  return base;
}

/**
 * 對一個 source 路段執行 ㄈ→L 幾何變換，就地修改 points / nodes
 */
function syncNShapeGeometry(segment, a, b, c, d, collapseASide) {
  if (!segment || !Array.isArray(segment.points)) return;
  const origNodes =
    Array.isArray(segment.nodes) && segment.nodes.length === segment.points.length
      ? segment.nodes
      : null;
  const newPts = segment.points.map((pt) => transformPointOnNShape(pt, a, b, c, d, collapseASide));

  const deduped = [];
  const dedupedNodes = [];
  for (let i = 0; i < newPts.length; i++) {
    const c0 = snapCoordPair(getCoord(newPts[i]));
    const nd = origNodes ? origNodes[i] : { node_type: 'line' };
    if (!deduped.length || !samePoint(deduped[deduped.length - 1], c0)) {
      deduped.push(c0);
      dedupedNodes.push(nd ? { ...nd } : { node_type: 'line' });
    } else {
      const li = dedupedNodes.length - 1;
      dedupedNodes[li] = mergeColocatedNodesForNShapeDedup(dedupedNodes[li], nd);
    }
  }
  if (deduped.length < 2) return;

  let alignedNodes = dedupedNodes;
  if (!origNodes) {
    alignedNodes = deduped.map(() => ({ node_type: 'line' }));
    if (Array.isArray(segment.nodes) && segment.nodes.length > 0) {
      alignedNodes[0] = {
        ...(segment.nodes[0] || {}),
        node_type: segment.nodes[0]?.node_type ?? 'line',
      };
      const oLast = segment.nodes[segment.nodes.length - 1];
      alignedNodes[alignedNodes.length - 1] = {
        ...(oLast || {}),
        node_type: oLast?.node_type ?? 'line',
      };
    }
  }

  const ortho = orthogonalizePolylineByInsertingCorners(deduped).map(snapCoordPair);
  segment.points = ortho;
  if (Array.isArray(alignedNodes) && alignedNodes.length === deduped.length) {
    segment.nodes = mergeNodesAfterOrthogonalize(deduped, alignedNodes, ortho);
    const ptsFinal = segment.points;
    segment.nodes.forEach((node, ni) => {
      if (!node || typeof node !== 'object' || !Array.isArray(ptsFinal) || ni >= ptsFinal.length)
        return;
      const p = ptsFinal[ni];
      const c = snapCoordPair(getCoord(p));
      if (node.node_type === 'connect') {
        delete node.display_x;
        delete node.display_y;
      }
      if (node.node_type === 'connect' || nodeCarriesStationOrConnect(node)) {
        node.x_grid = c[0];
        node.y_grid = c[1];
        node.tags = { ...(node.tags || {}), x_grid: c[0], y_grid: c[1] };
      }
    });
  }
}

/**
 * 找出 straightSegments 中所有 ㄈ 型的起始索引列表
 * 定義：相鄰三段 segs[i], segs[i+1], segs[i+2] 屬同一條鏈，
 *       首尾段平行且方向相反（非 Z 型），中段垂直。
 *
 * @returns {number[]} 每個元素是 ㄈ 型第一段在 straightSegments 中的索引
 */
export function buildNShapeList(straightSegments) {
  if (!Array.isArray(straightSegments)) return [];
  const result = [];
  for (let i = 0; i <= straightSegments.length - 3; i++) {
    const s0 = straightSegments[i];
    const s1 = straightSegments[i + 1];
    const s2 = straightSegments[i + 2];
    if (!s0?.points || !s1?.points || !s2?.points) continue;
    if (s0.chainId !== s1.chainId || s1.chainId !== s2.chainId) continue;
    if (!samePoint(s0.points[1], s1.points[0])) continue;
    if (!samePoint(s1.points[1], s2.points[0])) continue;

    const a = s0.points[0],
      b = s0.points[1],
      c = s1.points[1],
      d = s2.points[1];
    if (!isAxisAligned(a, b) || !isAxisAligned(b, c) || !isAxisAligned(c, d)) continue;

    const isHorizAB = Math.abs(a[1] - b[1]) < EPS;
    const isHorizCD = Math.abs(c[1] - d[1]) < EPS;
    if (isHorizAB !== isHorizCD) continue; // 首尾非平行

    const isHorizBC = Math.abs(b[1] - c[1]) < EPS;
    if (isHorizAB === isHorizBC) continue; // 中段非垂直

    // ㄈ 型：首尾段方向相反（< 0）；Z 型：方向相同（> 0）
    const oppositeDir = isHorizAB
      ? (b[0] - a[0]) * (d[0] - c[0]) < -EPS
      : (b[1] - a[1]) * (d[1] - c[1]) < -EPS;
    if (!oppositeDir) continue;

    result.push(i);
  }
  return result;
}

/**
 * ㄈ 型縮減為 L 型 — 分析是否可執行
 *
 * @param {Array}   straightSegments  - buildStraightSegments 輸出
 * @param {number}  segStartIdx       - ㄈ 型第一段在 straightSegments 中的索引
 * @param {object}  [options]         - 同 computeFlipAnalysis 的 options
 * @returns {{ canReduce, reduceColor, reason, collapseASide, newCorner, lenAB, lenCD }}
 */
export function computeNShapeAnalysis(straightSegments, segStartIdx, options = {}) {
  const {
    skipConnectMove = false,
    skipCrossing = false,
    useRectangleOtherRouteCheck = false,
  } = options;

  if (!straightSegments || segStartIdx == null || segStartIdx < 0) {
    return { canReduce: false, reduceColor: '#ef4444', reason: '資料不足' };
  }
  const s0 = straightSegments[segStartIdx];
  const s1 = straightSegments[segStartIdx + 1];
  const s2 = straightSegments[segStartIdx + 2];
  if (!s0?.points || !s1?.points || !s2?.points) {
    return { canReduce: false, reduceColor: '#ef4444', reason: '找不到三段路段' };
  }
  if (s0.chainId !== s1.chainId || s1.chainId !== s2.chainId) {
    return { canReduce: false, reduceColor: '#ef4444', reason: '不屬於同一條路線鏈' };
  }
  if (!samePoint(s0.points[1], s1.points[0]) || !samePoint(s1.points[1], s2.points[0])) {
    return { canReduce: false, reduceColor: '#ef4444', reason: '路段不相連' };
  }

  const a = s0.points[0],
    b = s0.points[1],
    c = s1.points[1],
    d = s2.points[1];
  if (!isAxisAligned(a, b) || !isAxisAligned(b, c) || !isAxisAligned(c, d)) {
    return { canReduce: false, reduceColor: '#ef4444', reason: '非正交路段' };
  }

  const isHorizAB = Math.abs(a[1] - b[1]) < EPS;
  const isHorizCD = Math.abs(c[1] - d[1]) < EPS;
  const isHorizBC = Math.abs(b[1] - c[1]) < EPS;
  if (isHorizAB !== isHorizCD)
    return { canReduce: false, reduceColor: '#ef4444', reason: '首尾不平行' };
  if (isHorizAB === isHorizBC)
    return { canReduce: false, reduceColor: '#ef4444', reason: '中段不垂直' };

  const oppositeDir = isHorizAB
    ? (b[0] - a[0]) * (d[0] - c[0]) < -EPS
    : (b[1] - a[1]) * (d[1] - c[1]) < -EPS;
  if (!oppositeDir)
    return { canReduce: false, reduceColor: '#ef4444', reason: '方向相同（Z 型，非 ㄈ 型）' };

  const lenAB = isHorizAB ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  const lenCD = isHorizAB ? Math.abs(d[0] - c[0]) : Math.abs(d[1] - c[1]);
  const collapseASide = lenAB <= lenCD;

  // 新 L 型的轉折點 E
  const e = isHorizAB
    ? collapseASide
      ? [a[0], c[1]]
      : [d[0], b[1]]
    : collapseASide
      ? [c[0], a[1]]
      : [b[0], d[1]];

  // 禁止條件 1：路徑上有紅點會被移動
  let hasConnectWouldMove = false;
  const startChainIdx = s0.startCoordMeta?.segIdx;
  const endChainIdx = s2.endCoordMeta?.segIdx;
  const chain = s0.chain;
  if (chain && Array.isArray(chain) && startChainIdx !== undefined && endChainIdx !== undefined) {
    for (let i = startChainIdx; i <= endChainIdx; i++) {
      const src = chain[i]?.__sourceRef || chain[i];
      if (!src?.points || !src?.nodes) continue;
      src.points.forEach((pt, idx) => {
        const node = src.nodes[idx];
        if (!node || node.node_type !== 'connect') return;
        const pos = getCoord(pt);
        const np = transformPointOnNShape(pos, a, b, c, d, collapseASide);
        if (!samePoint(pos, np)) hasConnectWouldMove = true;
      });
    }
  }

  // 禁止條件 2：新 L 路徑（A→E→D）與其他路段重疊或交叉
  const excludeSet = new Set([segStartIdx, segStartIdx + 1, segStartIdx + 2]);
  let hasOverlap = false;
  let hasCrossing = false;
  for (let i = 0; i < straightSegments.length; i++) {
    if (excludeSet.has(i)) continue;
    const q1 = straightSegments[i].points?.[0];
    const q2 = straightSegments[i].points?.[1];
    if (!q1 || !q2) continue;
    if (orthogonalSegmentOverlaps(a, e, q1, q2) || orthogonalSegmentOverlaps(e, d, q1, q2)) {
      hasOverlap = true;
      break;
    }
    if (!skipCrossing) {
      if (orthogonalSegmentsCross(a, e, q1, q2) || orthogonalSegmentsCross(e, d, q1, q2)) {
        hasCrossing = true;
        break;
      }
    }
  }

  // 禁止條件 3：同路線自身重疊/交叉
  let hasSelfOverlap = false;
  if (!hasOverlap && !hasCrossing) {
    const rn = s0.routeName;
    const srSegs = [];
    for (let i = 0; i < straightSegments.length; i++) {
      if (straightSegments[i].routeName !== rn) continue;
      if (i === segStartIdx) {
        srSegs.push({ points: [a, e] });
        srSegs.push({ points: [e, d] });
      } else if (i === segStartIdx + 1 || i === segStartIdx + 2) {
        continue;
      } else {
        srSegs.push({ points: straightSegments[i].points });
      }
    }
    for (let i = 0; i < srSegs.length && !hasSelfOverlap; i++) {
      for (let j = i + 1; j < srSegs.length; j++) {
        if (j === i + 1 && samePoint(srSegs[i].points[1], srSegs[j].points[0])) continue;
        const [p1, p2] = srSegs[i].points;
        const [q1, q2] = srSegs[j].points;
        if (orthogonalSegmentOverlaps(p1, p2, q1, q2) || orthogonalSegmentsCross(p1, p2, q1, q2)) {
          hasSelfOverlap = true;
          break;
        }
      }
    }
  }

  // 禁止條件 4：新路徑經過未相連的紅點
  let hasRedPointOnNewPath = false;
  if (!hasConnectWouldMove && !hasOverlap && !hasCrossing && !hasSelfOverlap) {
    const redPts = [];
    for (const s of straightSegments) {
      if (s.properties_start?.x_grid != null)
        redPts.push([Number(s.properties_start.x_grid), Number(s.properties_start.y_grid)]);
      if (s.properties_end?.x_grid != null)
        redPts.push([Number(s.properties_end.x_grid), Number(s.properties_end.y_grid)]);
    }
    for (const p of redPts) {
      if (samePoint(p, a) || samePoint(p, d)) continue;
      const onAE = pointOnSegment(p, a, e) && !samePoint(p, a) && !samePoint(p, e);
      const onED = pointOnSegment(p, e, d) && !samePoint(p, e) && !samePoint(p, d);
      if (onAE || onED) {
        hasRedPointOnNewPath = true;
        break;
      }
    }
  }

  // 禁止條件 5：ㄈ 線段上有其他路線的起迄點（頭尾端點 A/D 除外）
  let hasOtherRouteEndpointOnNShape = false;
  const nShapeRouteName = s0.routeName;
  const byRouteNShape = new Map();
  straightSegments.forEach((s) => {
    const rnKey = s.routeName ?? 'Unknown';
    if (!byRouteNShape.has(rnKey)) byRouteNShape.set(rnKey, []);
    byRouteNShape.get(rnKey).push(s);
  });
  const isNShapeEndpoint = (p) => samePoint(p, a) || samePoint(p, d);
  for (const [rnKey, segs] of byRouteNShape) {
    if (rnKey === nShapeRouteName) continue;
    const fp = segs[0]?.points?.[0] ? getCoord(segs[0].points[0]) : null;
    const lp = segs[segs.length - 1]?.points?.[1]
      ? getCoord(segs[segs.length - 1].points[1])
      : null;
    if (
      fp &&
      !isNShapeEndpoint(fp) &&
      (pointOnSegment(fp, a, b) || pointOnSegment(fp, b, c) || pointOnSegment(fp, c, d))
    )
      hasOtherRouteEndpointOnNShape = true;
    if (
      lp &&
      !isNShapeEndpoint(lp) &&
      (pointOnSegment(lp, a, b) || pointOnSegment(lp, b, c) || pointOnSegment(lp, c, d))
    )
      hasOtherRouteEndpointOnNShape = true;
    if (hasOtherRouteEndpointOnNShape) break;
  }

  // 矩形 = ㄈ 與移動後的 L 之間形成的正交區域（原垂直/水平段與新垂直/水平段之間）
  let rectMinX, rectMaxX, rectMinY, rectMaxY;
  if (isHorizAB) {
    const oldVertX = b[0];
    const newVertX = collapseASide ? a[0] : d[0];
    rectMinX = Math.min(oldVertX, newVertX);
    rectMaxX = Math.max(oldVertX, newVertX);
    rectMinY = Math.min(b[1], c[1]);
    rectMaxY = Math.max(b[1], c[1]);
  } else {
    const oldHorizY = b[1];
    const newHorizY = collapseASide ? a[1] : d[1];
    rectMinY = Math.min(oldHorizY, newHorizY);
    rectMaxY = Math.max(oldHorizY, newHorizY);
    rectMinX = Math.min(b[0], c[0]);
    rectMaxX = Math.max(b[0], c[0]);
  }

  // 禁止條件 6a：矩形內有別的路線與 B-C 完全平行（100% 平行）則不能縮減
  const bcIsVertical = isHorizAB;
  let hasParallelSegmentInRect = false;
  for (let i = 0; i < straightSegments.length; i++) {
    if (i === segStartIdx || i === segStartIdx + 1 || i === segStartIdx + 2) continue;
    if (straightSegments[i].routeName === nShapeRouteName) continue;
    const q1 = straightSegments[i].points?.[0];
    const q2 = straightSegments[i].points?.[1];
    if (!q1 || !q2) continue;
    const qc = getCoord(q1);
    const qc2 = getCoord(q2);
    const qVert = Math.abs(qc[0] - qc2[0]) < EPS;
    const qHoriz = Math.abs(qc[1] - qc2[1]) < EPS;
    if (!qVert && !qHoriz) continue;
    const parallelToBC = bcIsVertical ? qVert : qHoriz;
    if (!parallelToBC) continue;
    const segInRect = qVert
      ? qc[0] >= rectMinX - EPS &&
        qc[0] <= rectMaxX + EPS &&
        Math.min(qc[1], qc2[1]) < rectMaxY + EPS &&
        Math.max(qc[1], qc2[1]) > rectMinY - EPS
      : qc[1] >= rectMinY - EPS &&
        qc[1] <= rectMaxY + EPS &&
        Math.min(qc[0], qc2[0]) < rectMaxX + EPS &&
        Math.max(qc[0], qc2[0]) > rectMinX - EPS;
    if (segInRect) {
      hasParallelSegmentInRect = true;
      break;
    }
  }

  // 禁止條件 6b（useRectangleOtherRouteCheck）：矩形內不得有其他路線轉折點/起迄點/線段交叉點
  let hasOtherRouteTurningPointInRect = false;
  let hasOtherRouteEndpointsInRect = false;
  let hasOtherRouteSegmentCrossInRect = false;
  if (useRectangleOtherRouteCheck) {
    const isInsideRect = (p) => {
      if (!p || p.length < 2) return false;
      const x = Number(p[0]),
        y = Number(p[1]);
      if (samePoint(p, a) || samePoint(p, b) || samePoint(p, c) || samePoint(p, d)) return false;
      return x > rectMinX + EPS && x < rectMaxX - EPS && y > rectMinY + EPS && y < rectMaxY - EPS;
    };
    for (const [rnKey, segs] of byRouteNShape) {
      if (rnKey === nShapeRouteName) continue;
      for (let i = 0; i < segs.length - 1; i++) {
        const p = segs[i].points?.[1];
        if (p && samePoint(p, segs[i + 1].points?.[0]) && isInsideRect(getCoord(p))) {
          hasOtherRouteTurningPointInRect = true;
          break;
        }
      }
      if (hasOtherRouteTurningPointInRect) break;
      const fp = segs[0]?.points?.[0];
      const lp = segs[segs.length - 1]?.points?.[1];
      if (fp && isInsideRect(getCoord(fp))) hasOtherRouteEndpointsInRect = true;
      if (lp && isInsideRect(getCoord(lp))) hasOtherRouteEndpointsInRect = true;
      if (hasOtherRouteEndpointsInRect) break;
    }

    const nShapeIdx0 = segStartIdx;
    const nShapeIdx1 = segStartIdx + 1;
    const nShapeIdx2 = segStartIdx + 2;
    for (let i = 0; i < straightSegments.length && !hasOtherRouteSegmentCrossInRect; i++) {
      for (let j = i + 1; j < straightSegments.length; j++) {
        if (
          (i === nShapeIdx0 || i === nShapeIdx1 || i === nShapeIdx2) &&
          (j === nShapeIdx0 || j === nShapeIdx1 || j === nShapeIdx2)
        ) {
          continue;
        }
        const rnI = straightSegments[i].routeName ?? 'Unknown';
        const rnJ = straightSegments[j].routeName ?? 'Unknown';
        if (rnI === nShapeRouteName && rnJ === nShapeRouteName) continue;
        const p1 = straightSegments[i].points?.[0];
        const p2 = straightSegments[i].points?.[1];
        const q1 = straightSegments[j].points?.[0];
        const q2 = straightSegments[j].points?.[1];
        if (!p1 || !p2 || !q1 || !q2) continue;
        const crossPt = getOrthogonalCrossPoint(
          getCoord(p1),
          getCoord(p2),
          getCoord(q1),
          getCoord(q2)
        );
        if (crossPt && isInsideRect(crossPt)) {
          hasOtherRouteSegmentCrossInRect = true;
          break;
        }
      }
    }
  }

  const effectiveConnectMove = skipConnectMove ? false : hasConnectWouldMove;
  const effectiveCrossing = skipCrossing ? false : hasCrossing;
  const canReduce =
    !effectiveConnectMove &&
    !hasOverlap &&
    !effectiveCrossing &&
    !hasSelfOverlap &&
    !hasRedPointOnNewPath &&
    !hasParallelSegmentInRect &&
    !hasOtherRouteTurningPointInRect &&
    !hasOtherRouteEndpointsInRect &&
    !hasOtherRouteSegmentCrossInRect &&
    !hasOtherRouteEndpointOnNShape;

  const reasons = [];
  if (hasConnectWouldMove && !skipConnectMove) reasons.push('ㄈ 路徑上有紅點，縮減會改變紅點位置');
  if (hasOverlap) reasons.push('縮減後會與其他路線重疊');
  if (hasCrossing && !skipCrossing) reasons.push('縮減後會與其他路線交叉');
  if (hasSelfOverlap) reasons.push('縮減後同路線自身會重疊或交叉');
  if (hasRedPointOnNewPath) reasons.push('縮減後新路徑會落到其他紅點（交叉點）上');
  if (hasParallelSegmentInRect) reasons.push('矩形內有別的路線與 B-C 完全平行');
  if (hasOtherRouteTurningPointInRect) reasons.push('ㄈ 與 L 之間的矩形內有其他路線轉折點');
  if (hasOtherRouteEndpointsInRect) reasons.push('ㄈ 與 L 之間的矩形內有其他路線起迄點');
  if (hasOtherRouteSegmentCrossInRect) reasons.push('ㄈ 與 L 之間的矩形內有其他路線線段交叉點');
  if (hasOtherRouteEndpointOnNShape) reasons.push('ㄈ 型線段上有其他路線的起迄點');

  return {
    canReduce,
    reduceColor: canReduce ? '#22c55e' : '#ef4444',
    reason: reasons.join('；'),
    collapseASide,
    newCorner: e,
    lenAB,
    lenCD,
  };
}

/**
 * ㄈ 縮減為 L 型 — 執行幾何變換
 *
 * @param {Array}   routesData   - spaceNetworkGridJsonData
 * @param {number}  segStartIdx  - ㄈ 型第一段在 straightSegments 中的索引
 * @param {object}  [options]    - 同 computeNShapeAnalysis 的 options
 * @returns {{ changed, routesData, straightSegments, analysis }}
 */
export function reduceNShapeInRoutesData(routesData, segStartIdx, options = {}) {
  const cloned = JSON.parse(JSON.stringify(routesData || []));
  const segmentViews = buildSegmentViewsFromRoutesData(cloned);
  const straightSegments = buildStraightSegments(segmentViews);
  const analysis = computeNShapeAnalysis(straightSegments, segStartIdx, options);

  if (!analysis.canReduce) {
    return { changed: false, routesData: cloned, straightSegments, analysis };
  }

  const s0 = straightSegments[segStartIdx];
  const s2 = straightSegments[segStartIdx + 2];
  if (!s0 || !s2) {
    return {
      changed: false,
      routesData: cloned,
      straightSegments,
      analysis: { ...analysis, reason: '找不到路段' },
    };
  }

  const a = s0.points[0],
    b = s0.points[1];
  const c = straightSegments[segStartIdx + 1].points[1];
  const d = s2.points[1];
  const isHorizAB = Math.abs(a[1] - b[1]) < EPS;
  const lenAB = isHorizAB ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  const lenCD = isHorizAB ? Math.abs(d[0] - c[0]) : Math.abs(d[1] - c[1]);
  const collapseASide = lenAB <= lenCD;

  const startChainIdx = s0.startCoordMeta?.segIdx;
  const endChainIdx = s2.endCoordMeta?.segIdx;
  if (startChainIdx === undefined || endChainIdx === undefined) {
    return {
      changed: false,
      routesData: cloned,
      straightSegments,
      analysis: { ...analysis, reason: '找不到路段鏈結資訊' },
    };
  }

  const nShapeSourceSegs = new Set();
  for (let i = startChainIdx; i <= endChainIdx; i++) {
    const src = s0.chain[i]?.__sourceRef || s0.chain[i];
    if (src) nShapeSourceSegs.add(src);
  }

  // 與 Flip L 相同精神：先建立「舊格點 → ㄈ→L 後目標格點」，供其他路線共用紅／藍點跟著位移（否則斷線端點仍留在原座標）
  const nShapeMovesByPos = new Map();
  const addNShapeMove = (fromPt, toPt) => {
    const o = snapCoordPair(getCoord(fromPt));
    const n = snapCoordPair(getCoord(toPt));
    if (samePoint(o, n)) return;
    const k = `${roundScalarForSnap(o[0])},${roundScalarForSnap(o[1])}`;
    nShapeMovesByPos.set(k, n);
  };
  nShapeSourceSegs.forEach((seg) => {
    if (!Array.isArray(seg.points)) return;
    for (const pt of seg.points) {
      const o = getCoord(pt);
      const n = transformPointOnNShape(o, a, b, c, d, collapseASide);
      addNShapeMove(o, n);
    }
  });

  // 幾何變換
  nShapeSourceSegs.forEach((seg) => {
    syncNShapeGeometry(seg, a, b, c, d, collapseASide);
    if (Array.isArray(seg.points) && seg.points.length >= 2) {
      const first = seg.points[0];
      const last = seg.points[seg.points.length - 1];
      if (seg.properties_start) {
        seg.properties_start.x_grid = first[0];
        seg.properties_start.y_grid = first[1];
      }
      if (seg.properties_end) {
        seg.properties_end.x_grid = last[0];
        seg.properties_end.y_grid = last[1];
      }
    }
  });

  // snap 到整數格點
  const snapC = (v) => (Math.abs(v - Math.round(v)) < 0.01 ? Math.round(v) : v);
  nShapeSourceSegs.forEach((seg) => {
    if (!Array.isArray(seg.points)) return;
    seg.points = seg.points.map((pt) => {
      const cc = getCoord(pt);
      return [snapC(cc[0]), snapC(cc[1])];
    });
    if (seg.properties_start) {
      seg.properties_start.x_grid = snapC(seg.properties_start.x_grid);
      seg.properties_start.y_grid = snapC(seg.properties_start.y_grid);
    }
    if (seg.properties_end) {
      seg.properties_end.x_grid = snapC(seg.properties_end.x_grid);
      seg.properties_end.y_grid = snapC(seg.properties_end.y_grid);
    }
  });

  // 將對照表對齊到 nShape 路段變換後實際頂點（正交化可能與純 transform 差半格）
  if (nShapeMovesByPos.size > 0) {
    const allNewVerts = [];
    nShapeSourceSegs.forEach((seg) => {
      (seg.points || []).forEach((pt) => {
        const p = snapCoordPair(getCoord(pt));
        allNewVerts.push(p);
      });
    });
    for (const [k, v] of nShapeMovesByPos) {
      let best = v;
      let bestD = Infinity;
      for (const p of allNewVerts) {
        const d = (p[0] - v[0]) ** 2 + (p[1] - v[1]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (bestD < 0.25) nShapeMovesByPos.set(k, snapCoordPair(best));
    }
  }

  // 其他路段：頂點落在舊格者改到新格（含 properties、connect 節點）
  const seenOther = new Set();
  const allViewsAfter = buildSegmentViewsFromRoutesData(cloned);
  allViewsAfter.forEach((view) => {
    const source = view?.__sourceRef || view;
    if (!source || nShapeSourceSegs.has(source) || seenOther.has(source)) return;
    seenOther.add(source);
    if (!Array.isArray(source.points)) return;
    source.points.forEach((pt, idx) => {
      const pos = snapCoordPair(getCoord(pt));
      const pk = `${roundScalarForSnap(pos[0])},${roundScalarForSnap(pos[1])}`;
      const np = nShapeMovesByPos.get(pk);
      if (!np) return;
      if (Array.isArray(pt) && pt.length > 2) {
        source.points[idx] = [np[0], np[1], pt[2]];
      } else {
        source.points[idx] = np;
      }
      const node = source.nodes?.[idx];
      if (node && typeof node === 'object') {
        delete node.display_x;
        delete node.display_y;
        if (node.node_type === 'connect' || nodeCarriesStationOrConnect(node)) {
          node.x_grid = np[0];
          node.y_grid = np[1];
          node.tags = { ...(node.tags || {}), x_grid: np[0], y_grid: np[1] };
        }
      }
      if (idx === 0 && source.properties_start) {
        source.properties_start.x_grid = np[0];
        source.properties_start.y_grid = np[1];
        source.properties_start.tags = {
          ...(source.properties_start.tags || {}),
          x_grid: np[0],
          y_grid: np[1],
        };
      }
      if (idx === source.points.length - 1 && source.properties_end) {
        source.properties_end.x_grid = np[0];
        source.properties_end.y_grid = np[1];
        source.properties_end.tags = {
          ...(source.properties_end.tags || {}),
          x_grid: np[0],
          y_grid: np[1],
        };
      }
    });
  });

  return {
    changed: true,
    routesData: cloned,
    straightSegments: buildStraightSegments(buildSegmentViewsFromRoutesData(cloned)),
    analysis,
  };
}

/**
 * 計算兩正交線段重疊區間的兩端點（同一直線上的區間相交）
 * @returns {{ p1: [number,number], p2: [number,number] } | null}
 */
function orthogonalSegmentOverlapRange(p1, p2, q1, q2) {
  const hP = Math.abs(p1[1] - p2[1]) < EPS;
  const hQ = Math.abs(q1[1] - q2[1]) < EPS;
  if (hP && hQ && Math.abs(p1[1] - q1[1]) < EPS) {
    const lo = Math.max(Math.min(p1[0], p2[0]), Math.min(q1[0], q2[0]));
    const hi = Math.min(Math.max(p1[0], p2[0]), Math.max(q1[0], q2[0]));
    if (!exceedsAllowedColinearOverlap1D(lo, hi)) return null;
    const y = p1[1];
    return { p1: [lo, y], p2: [hi, y] };
  }
  const vP = Math.abs(p1[0] - p2[0]) < EPS;
  const vQ = Math.abs(q1[0] - q2[0]) < EPS;
  if (vP && vQ && Math.abs(p1[0] - q1[0]) < EPS) {
    const lo = Math.max(Math.min(p1[1], p2[1]), Math.min(q1[1], q2[1]));
    const hi = Math.min(Math.max(p1[1], p2[1]), Math.max(q1[1], q2[1]));
    if (!exceedsAllowedColinearOverlap1D(lo, hi)) return null;
    const x = p1[0];
    return { p1: [x, lo], p2: [x, hi] };
  }
  return null;
}

/**
 * 依 routeName 統計 straightSegments 數量，轉折點數 = 該路線段數 - 1
 */
function getTurnCountByRoute(straightSegments) {
  const countByRoute = new Map();
  if (!Array.isArray(straightSegments)) return countByRoute;
  straightSegments.forEach((seg) => {
    const r = seg.routeName || 'Unknown';
    countByRoute.set(r, (countByRoute.get(r) || 0) + 1);
  });
  const turnCountByRoute = new Map();
  countByRoute.forEach((count, routeName) => {
    turnCountByRoute.set(routeName, Math.max(0, count - 1));
  });
  return turnCountByRoute;
}

/**
 * 判斷重疊路段，只回傳「重疊區段」的幾何與該段所屬路線的轉折點數（供 highlight 與 hover 用）
 * 含同路線（相同 route_name）的兩段若共線且區間相交也計入重疊。
 * @param {Array} straightSegments - buildStraightSegments 的輸出
 * @returns {Array<{ points: [[number,number],[number,number]], turnCounts: Array<{ routeName: string, turnCount: number }> }>}
 */
export function findOverlappingSegmentRanges(straightSegments) {
  if (!Array.isArray(straightSegments)) return [];
  const turnCountByRoute = getTurnCountByRoute(straightSegments);
  const ranges = [];
  for (let i = 0; i < straightSegments.length; i++) {
    const a = straightSegments[i].points?.[0];
    const b = straightSegments[i].points?.[1];
    if (!a || !b) continue;
    for (let j = i + 1; j < straightSegments.length; j++) {
      const c = straightSegments[j].points?.[0];
      const d = straightSegments[j].points?.[1];
      if (!c || !d) continue;
      const range = orthogonalSegmentOverlapRange(a, b, c, d);
      if (!range) continue;
      // 同路線（相同 route_name）也算重疊，不因 route 相同而跳過
      const routeA = straightSegments[i].routeName || 'Unknown';
      const routeB = straightSegments[j].routeName || 'Unknown';
      const turnCounts = [];
      const addTurn = (name) => {
        const n = turnCountByRoute.get(name) ?? 0;
        if (!turnCounts.some((t) => t.routeName === name))
          turnCounts.push({ routeName: name, turnCount: n });
      };
      addTurn(routeA);
      if (routeB !== routeA) addTurn(routeB);
      ranges.push({
        points: [range.p1, range.p2],
        turnCounts,
      });
    }
  }
  return ranges;
}

/**
 * @deprecated 請改用 findOverlappingSegmentRanges；保留相容用
 * @returns {number[]} 有參與重疊的 straightSegment 的 index 陣列
 */
export function findOverlappingSegmentIndices(straightSegments) {
  if (!Array.isArray(straightSegments)) return [];
  const indices = new Set();
  for (let i = 0; i < straightSegments.length; i++) {
    const a = straightSegments[i].points?.[0];
    const b = straightSegments[i].points?.[1];
    if (!a || !b) continue;
    for (let j = i + 1; j < straightSegments.length; j++) {
      const c = straightSegments[j].points?.[0];
      const d = straightSegments[j].points?.[1];
      if (!c || !d) continue;
      if (orthogonalSegmentOverlaps(a, b, c, d)) {
        indices.add(i);
        indices.add(j);
      }
    }
  }
  return Array.from(indices);
}

/**
 * 從一組 chained segments 建立連續的 polyline 座標陣列
 */
function buildFullPath(chain) {
  const path = [];
  chain.forEach((seg, i) => {
    const pts = (seg.points || []).map((p) => getCoord(p));
    if (i === 0) {
      path.push(...pts);
    } else {
      if (path.length > 0 && samePoint(path[path.length - 1], pts[0])) {
        path.push(...pts.slice(1));
      } else {
        path.push(...pts);
      }
    }
  });
  return path;
}

// --- 重切路段：僅在交叉點與端點處切斷路線 ---
const coordKey = (pt) => `${Math.round(pt[0] * 1e6) / 1e6},${Math.round(pt[1] * 1e6) / 1e6}`;

function simplifyPolyline(path) {
  const deduped = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (!samePoint(path[i], deduped[deduped.length - 1])) deduped.push(path[i]);
  }
  if (deduped.length <= 2) return deduped;
  const result = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];
    const cross =
      (curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0]);
    if (Math.abs(cross) > EPS) result.push(curr);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

function findAxisAlignedCrossings(a1, a2, b1, b2) {
  const out = [];
  const aH = Math.abs(a1[1] - a2[1]) < EPS;
  const aV = Math.abs(a1[0] - a2[0]) < EPS;
  const bH = Math.abs(b1[1] - b2[1]) < EPS;
  const bV = Math.abs(b1[0] - b2[0]) < EPS;
  if (aH && bV) {
    const yH = a1[1],
      xV = b1[0];
    if (
      xV >= Math.min(a1[0], a2[0]) - EPS &&
      xV <= Math.max(a1[0], a2[0]) + EPS &&
      yH >= Math.min(b1[1], b2[1]) - EPS &&
      yH <= Math.max(b1[1], b2[1]) + EPS
    )
      out.push([xV, yH]);
  } else if (aV && bH) {
    const xV = a1[0],
      yH = b1[1];
    if (
      xV >= Math.min(b1[0], b2[0]) - EPS &&
      xV <= Math.max(b1[0], b2[0]) + EPS &&
      yH >= Math.min(a1[1], a2[1]) - EPS &&
      yH <= Math.max(a1[1], a2[1]) + EPS
    )
      out.push([xV, yH]);
  } else if (aH && bH && Math.abs(a1[1] - b1[1]) < EPS) {
    const oS = Math.max(Math.min(a1[0], a2[0]), Math.min(b1[0], b2[0]));
    const oE = Math.min(Math.max(a1[0], a2[0]), Math.max(b1[0], b2[0]));
    if (oE - oS > EPS) out.push([oS, a1[1]], [oE, a1[1]]);
    else if (Math.abs(oE - oS) < EPS) out.push([oS, a1[1]]);
  } else if (aV && bV && Math.abs(a1[0] - b1[0]) < EPS) {
    const oS = Math.max(Math.min(a1[1], a2[1]), Math.min(b1[1], b2[1]));
    const oE = Math.min(Math.max(a1[1], a2[1]), Math.max(b1[1], b2[1]));
    if (oE - oS > EPS) out.push([a1[0], oS], [a1[0], oE]);
    else if (Math.abs(oE - oS) < EPS) out.push([a1[0], oS]);
  }
  return out;
}

function buildRouteInfos(routesData, isMerged) {
  const infos = [];
  if (isMerged) {
    routesData.forEach((route, ri) => {
      const segs = route.segments || [];
      const chains = buildChainsByCoords(segs);
      infos.push({
        index: ri,
        name: route.route_name || route.name || 'Unknown',
        color: route.color || '#555555',
        paths: chains.map((c) => buildFullPath(c)),
        way_properties: segs[0]?.way_properties || {},
        original_props: route.original_props,
      });
    });
  } else {
    const byRoute = {};
    const order = [];
    routesData.forEach((seg) => {
      const name = seg.name || seg.route_name || seg.way_properties?.tags?.route_name || 'Unknown';
      if (!byRoute[name]) {
        byRoute[name] = {
          segs: [],
          color: seg.route_color || seg.way_properties?.tags?.colour || '#555555',
          way_properties: seg.way_properties,
        };
        order.push(name);
      }
      byRoute[name].segs.push(seg);
    });
    order.forEach((name, ri) => {
      const { segs, color, way_properties } = byRoute[name];
      const chains = buildChainsByCoords(segs);
      infos.push({
        index: ri,
        name,
        color,
        paths: chains.map((c) => buildFullPath(c)),
        way_properties: way_properties || {},
      });
    });
  }
  return infos;
}

/**
 * 重切路段：在交叉點與端點處切斷路線，產出新的 segments 與 connectData。
 *
 * @param {Array} routesData - layoutGridJsonData_Test / spaceNetworkGridJsonData
 * @param {Array|null} oldConnectData - 舊的 ConnectData，用於查找紅點的 station 屬性
 * @returns {{ routesData: Array, connectData: Array }}
 */
export function reconfigureStations(routesData, oldConnectData) {
  if (!Array.isArray(routesData) || routesData.length === 0) {
    return { routesData: [], connectData: oldConnectData || [] };
  }

  const cloned = JSON.parse(JSON.stringify(routesData));
  const isMerged = cloned[0]?.segments && !cloned[0]?.points;

  // 從 oldConnectData 建立 connect_number → 完整屬性 的查找表（最可靠的來源）
  const oldCNProps = new Map();
  if (Array.isArray(oldConnectData)) {
    oldConnectData.forEach((cd) => {
      if (!cd) return;
      [cd.connect_start, cd.connect_end].forEach((info) => {
        if (!info || info.connect_number == null) return;
        oldCNProps.set(info.connect_number, { ...info });
      });
    });
  }

  // 建立座標→屬性查找表：優先用 properties_start/end（flip 後座標已更新），
  // 再用 oldConnectData 以 connect_number 為橋樑補齊
  const stationLookup = new Map();
  const mergeInto = (k, props) => {
    if (!props) return;
    const existing = stationLookup.get(k);
    if (!existing) {
      stationLookup.set(k, { ...props });
      return;
    }
    if (props.node_type === 'connect' && existing.node_type !== 'connect') {
      stationLookup.set(k, { ...props });
      return;
    }
    if (props.station_name && !existing.station_name) existing.station_name = props.station_name;
    if (props.station_id && !existing.station_id) existing.station_id = props.station_id;
    if (props.connect_number != null && existing.connect_number == null)
      existing.connect_number = props.connect_number;
  };

  const collectFromSegs = (segs) => {
    (segs || []).forEach((seg) => {
      if (!seg?.points?.length) return;
      const pts = seg.points.map((p) => getCoord(p));
      // properties_start/end 是最可靠的（flip 後座標已更新）
      if (seg.properties_start) {
        const k = coordKey([seg.properties_start.x_grid, seg.properties_start.y_grid]);
        let props = { ...seg.properties_start };
        // 用 oldConnectData 補齊
        if (props.connect_number != null && oldCNProps.has(props.connect_number)) {
          const old = oldCNProps.get(props.connect_number);
          if (!props.station_name) props.station_name = old.station_name;
          if (!props.station_id) props.station_id = old.station_id;
          if (!props.tags) props.tags = {};
          if (!props.tags.station_name && old.station_name)
            props.tags.station_name = old.station_name;
          if (!props.tags.station_id && old.station_id) props.tags.station_id = old.station_id;
          if (!props.tags.name && old.station_name) props.tags.name = old.station_name;
        }
        mergeInto(k, props);
      }
      if (seg.properties_end) {
        const k = coordKey([seg.properties_end.x_grid, seg.properties_end.y_grid]);
        let props = { ...seg.properties_end };
        if (props.connect_number != null && oldCNProps.has(props.connect_number)) {
          const old = oldCNProps.get(props.connect_number);
          if (!props.station_name) props.station_name = old.station_name;
          if (!props.station_id) props.station_id = old.station_id;
          if (!props.tags) props.tags = {};
          if (!props.tags.station_name && old.station_name)
            props.tags.station_name = old.station_name;
          if (!props.tags.station_id && old.station_id) props.tags.station_id = old.station_id;
          if (!props.tags.name && old.station_name) props.tags.name = old.station_name;
        }
        mergeInto(k, props);
      }
      // nodes 作為備用（可能因 insertIndex 偏移而錯位，所以只在沒有更好來源時使用）
      const nodes = seg.nodes || [];
      pts.forEach((p, i) => {
        const k = coordKey(p);
        if (!stationLookup.has(k) && nodes[i]) {
          mergeInto(k, { ...nodes[i] });
        }
      });
    });
  };
  if (isMerged) cloned.forEach((r) => collectFromSegs(r.segments));
  else collectFromSegs(cloned);
  const routeInfos = buildRouteInfos(cloned, isMerged);
  const simplifiedPaths = routeInfos.map((r) => r.paths.map((p) => simplifyPolyline(p)));

  // 偵測每條路線的交叉點
  // 規則：若兩條路線之間有任何重疊路段，跳過這對路線（不在其中任一路線產生切割點）
  const intersections = routeInfos.map(() => []);
  const addPt = (ri, pt) => {
    if (!intersections[ri].some((p) => samePoint(p, pt))) intersections[ri].push(pt);
  };

  /** 判斷兩段是否重疊（共線且區間相交，長度 > 0） */
  const segmentsOverlapAxial = (a1, a2, b1, b2) => {
    const aH = Math.abs(a1[1] - a2[1]) < EPS;
    const aV = Math.abs(a1[0] - a2[0]) < EPS;
    const bH = Math.abs(b1[1] - b2[1]) < EPS;
    const bV = Math.abs(b1[0] - b2[0]) < EPS;
    if (aH && bH && Math.abs(a1[1] - b1[1]) < EPS) {
      const lo = Math.max(Math.min(a1[0], a2[0]), Math.min(b1[0], b2[0]));
      const hi = Math.min(Math.max(a1[0], a2[0]), Math.max(b1[0], b2[0]));
      return exceedsAllowedColinearOverlap1D(lo, hi);
    }
    if (aV && bV && Math.abs(a1[0] - b1[0]) < EPS) {
      const lo = Math.max(Math.min(a1[1], a2[1]), Math.min(b1[1], b2[1]));
      const hi = Math.min(Math.max(a1[1], a2[1]), Math.max(b1[1], b2[1]));
      return exceedsAllowedColinearOverlap1D(lo, hi);
    }
    return false;
  };

  for (let ri = 0; ri < routeInfos.length; ri++) {
    for (let rj = ri + 1; rj < routeInfos.length; rj++) {
      // 先檢查這對路線是否有重疊路段；若有則整對跳過，不產生任何切割點
      let pairHasOverlap = false;
      outer: for (const pa of simplifiedPaths[ri]) {
        for (const pb of simplifiedPaths[rj]) {
          for (let ai = 0; ai < pa.length - 1; ai++) {
            for (let bi = 0; bi < pb.length - 1; bi++) {
              if (segmentsOverlapAxial(pa[ai], pa[ai + 1], pb[bi], pb[bi + 1])) {
                pairHasOverlap = true;
                break outer;
              }
            }
          }
        }
      }
      if (pairHasOverlap) continue;

      for (const pa of simplifiedPaths[ri]) {
        for (const pb of simplifiedPaths[rj]) {
          for (let ai = 0; ai < pa.length - 1; ai++) {
            for (let bi = 0; bi < pb.length - 1; bi++) {
              findAxisAlignedCrossings(pa[ai], pa[ai + 1], pb[bi], pb[bi + 1]).forEach((pt) => {
                // 新的交叉點必須為整數刻度
                const snapped = [Math.round(pt[0]), Math.round(pt[1])];
                addPt(ri, snapped);
                addPt(rj, snapped);
              });
            }
          }
        }
      }
    }
  }

  // 在交叉點與端點處切斷
  const newRoutesData = routeInfos.map((route, ri) => {
    const myPts = intersections[ri];
    const isSplit = (pt) => myPts.some((c) => samePoint(c, pt));

    const newSegments = [];
    route.paths.forEach((path) => {
      if (path.length < 2) return;

      const isLoop = path.length > 2 && samePoint(path[0], path[path.length - 1]);

      // 環狀路線：旋轉 path 使第一個交叉點在 index 0，避免在非交叉點產生假紅點
      let workPath = path;
      if (isLoop) {
        let firstCross = -1;
        for (let i = 0; i < path.length - 1; i++) {
          if (isSplit(path[i])) {
            firstCross = i;
            break;
          }
        }
        if (firstCross > 0) {
          workPath = [...path.slice(firstCross, path.length - 1), ...path.slice(0, firstCross + 1)];
        }
      }

      const aug = [];
      const flags = [];
      for (let i = 0; i < workPath.length; i++) {
        aug.push(workPath[i]);
        flags.push(i === 0 || i === workPath.length - 1 || isSplit(workPath[i]));
        if (i < workPath.length - 1) {
          const edge = myPts.filter(
            (cp) =>
              !samePoint(cp, workPath[i]) &&
              !samePoint(cp, workPath[i + 1]) &&
              pointOnSegment(cp, workPath[i], workPath[i + 1])
          );
          edge.sort((a, b) => {
            const d = (p) => (p[0] - workPath[i][0]) ** 2 + (p[1] - workPath[i][1]) ** 2;
            return d(a) - d(b);
          });
          edge.forEach((sp) => {
            aug.push(sp);
            flags.push(true);
          });
        }
      }

      let start = 0;
      for (let i = 1; i < aug.length; i++) {
        if (!flags[i]) continue;
        const pts = aug.slice(start, i + 1);
        if (pts.length < 2) {
          start = i;
          continue;
        }
        const sp = pts[0],
          ep = pts[pts.length - 1];
        const spInfo = stationLookup.get(coordKey(sp)) || {};
        const epInfo = stationLookup.get(coordKey(ep)) || {};
        const nodes = pts.map((p, idx) => ({
          ...(stationLookup.get(coordKey(p)) || {}),
          node_type: idx === 0 || idx === pts.length - 1 ? 'connect' : 'line',
          x_grid: p[0],
          y_grid: p[1],
        }));
        newSegments.push({
          points: pts,
          properties_start: { ...spInfo, x_grid: sp[0], y_grid: sp[1], node_type: 'connect' },
          properties_end: { ...epInfo, x_grid: ep[0], y_grid: ep[1], node_type: 'connect' },
          nodes,
          way_properties: route.way_properties,
        });
        start = i;
      }
    });

    if (isMerged) {
      return {
        route_name: route.name,
        color: route.color,
        segments: newSegments,
        original_props: route.original_props,
      };
    }
    return newSegments.map((s) => ({
      ...s,
      name: route.name,
      route_name: route.name,
      route_color: route.color,
    }));
  });

  let finalData = isMerged ? newRoutesData : newRoutesData.flat();

  // 第二階段補切：第一輪切完後，再補切「不同路線、無重疊、但仍有未切交叉」的情況
  const isSegmentEndpoint = (seg, pt) => {
    const pts = (seg?.points || []).map((p) => getCoord(p));
    if (pts.length < 2) return true;
    return samePoint(pt, pts[0]) || samePoint(pt, pts[pts.length - 1]);
  };

  const splitSegmentByPoints = (seg, splitPts) => {
    const basePts = (seg?.points || []).map((p) => getCoord(p));
    if (basePts.length < 2 || !Array.isArray(splitPts) || splitPts.length === 0) return [seg];

    const uniqSplitPts = [];
    splitPts.forEach((pt) => {
      if (!uniqSplitPts.some((p) => samePoint(p, pt))) uniqSplitPts.push([pt[0], pt[1]]);
    });

    const aug = [];
    const flags = [];
    for (let i = 0; i < basePts.length; i++) {
      aug.push(basePts[i]);
      flags.push(
        i === 0 || i === basePts.length - 1 || uniqSplitPts.some((sp) => samePoint(sp, basePts[i]))
      );

      if (i < basePts.length - 1) {
        const edgePts = uniqSplitPts.filter(
          (sp) =>
            !samePoint(sp, basePts[i]) &&
            !samePoint(sp, basePts[i + 1]) &&
            pointOnSegment(sp, basePts[i], basePts[i + 1])
        );
        edgePts.sort(
          (a, b) =>
            segmentRatio(a, basePts[i], basePts[i + 1]) -
            segmentRatio(b, basePts[i], basePts[i + 1])
        );
        edgePts.forEach((sp) => {
          if (!aug.length || !samePoint(aug[aug.length - 1], sp)) {
            aug.push(sp);
            flags.push(true);
          }
        });
      }
    }

    const pieces = [];
    let start = 0;
    for (let i = 1; i < aug.length; i++) {
      if (!flags[i]) continue;
      const pts = aug.slice(start, i + 1);
      if (pts.length < 2) {
        start = i;
        continue;
      }
      const sp = pts[0];
      const ep = pts[pts.length - 1];
      const spInfo = stationLookup.get(coordKey(sp)) || {};
      const epInfo = stationLookup.get(coordKey(ep)) || {};
      const nodes = pts.map((p, idx) => ({
        ...(stationLookup.get(coordKey(p)) || {}),
        node_type: idx === 0 || idx === pts.length - 1 ? 'connect' : 'line',
        x_grid: p[0],
        y_grid: p[1],
      }));
      pieces.push({
        ...seg,
        points: pts,
        properties_start: { ...spInfo, x_grid: sp[0], y_grid: sp[1], node_type: 'connect' },
        properties_end: { ...epInfo, x_grid: ep[0], y_grid: ep[1], node_type: 'connect' },
        nodes,
      });
      start = i;
    }
    return pieces.length ? pieces : [seg];
  };

  const toRouteGroups = () => {
    if (isMerged) {
      return finalData.map((route) => ({
        route_name: route.route_name || route.name || 'Unknown',
        color: route.color,
        way_properties: route.way_properties,
        original_props: route.original_props,
        segments: Array.isArray(route.segments) ? [...route.segments] : [],
      }));
    }

    const groups = [];
    const groupMap = new Map();
    finalData.forEach((seg) => {
      const routeName =
        seg.route_name || seg.name || seg.way_properties?.tags?.route_name || 'Unknown';
      if (!groupMap.has(routeName)) {
        const g = {
          route_name: routeName,
          color: seg.route_color || seg.way_properties?.tags?.colour || '#555555',
          way_properties: seg.way_properties,
          segments: [],
        };
        groupMap.set(routeName, g);
        groups.push(g);
      }
      groupMap.get(routeName).segments.push(seg);
    });
    return groups;
  };

  // ── 第二階段補切 ──
  // 用第一階段切完後的 finalData，逐段比對不同路線。
  // 關鍵：先把每段 points 簡化（移除共線中間點），再用「嚴格內部」判斷。
  //  - 簡化後，重疊邊界的 T 型接合點一定落在子邊端點上 → 自動排除
  //  - 真正的十字交叉會落在簡化子邊的嚴格內部 → 偵測到並切開
  const routeGroups = toRouteGroups();
  for (let pass = 0; pass < 5; pass++) {
    const pendingSplits = new Map();

    const addPendingSplit = (gIdx, sIdx, pt) => {
      const key = `${gIdx}:${sIdx}`;
      if (!pendingSplits.has(key)) pendingSplits.set(key, []);
      const arr = pendingSplits.get(key);
      if (!arr.some((p) => samePoint(p, pt))) arr.push(pt);
    };

    for (let gi = 0; gi < routeGroups.length; gi++) {
      for (let gj = gi + 1; gj < routeGroups.length; gj++) {
        const ga = routeGroups[gi];
        const gb = routeGroups[gj];

        const simpA = ga.segments.map((seg) =>
          simplifyPolyline((seg?.points || []).map((p) => getCoord(p)))
        );
        const simpB = gb.segments.map((seg) =>
          simplifyPolyline((seg?.points || []).map((p) => getCoord(p)))
        );

        for (let sai = 0; sai < ga.segments.length; sai++) {
          const pa = simpA[sai];
          if (pa.length < 2) continue;

          for (let sbi = 0; sbi < gb.segments.length; sbi++) {
            const pb = simpB[sbi];
            if (pb.length < 2) continue;

            for (let ai = 0; ai < pa.length - 1; ai++) {
              for (let bi = 0; bi < pb.length - 1; bi++) {
                const a1 = pa[ai],
                  a2 = pa[ai + 1];
                const b1 = pb[bi],
                  b2 = pb[bi + 1];
                const aH = Math.abs(a1[1] - a2[1]) < EPS;
                const aV = Math.abs(a1[0] - a2[0]) < EPS;
                const bH = Math.abs(b1[1] - b2[1]) < EPS;
                const bV = Math.abs(b1[0] - b2[0]) < EPS;

                let x, y;
                if (aH && bV) {
                  x = b1[0];
                  y = a1[1];
                  if (x <= Math.min(a1[0], a2[0]) + EPS || x >= Math.max(a1[0], a2[0]) - EPS)
                    continue;
                  if (y <= Math.min(b1[1], b2[1]) + EPS || y >= Math.max(b1[1], b2[1]) - EPS)
                    continue;
                } else if (aV && bH) {
                  x = a1[0];
                  y = b1[1];
                  if (y <= Math.min(a1[1], a2[1]) + EPS || y >= Math.max(a1[1], a2[1]) - EPS)
                    continue;
                  if (x <= Math.min(b1[0], b2[0]) + EPS || x >= Math.max(b1[0], b2[0]) - EPS)
                    continue;
                } else {
                  continue;
                }

                const snapped = [Math.round(x), Math.round(y)];
                if (!isSegmentEndpoint(ga.segments[sai], snapped))
                  addPendingSplit(gi, sai, snapped);
                if (!isSegmentEndpoint(gb.segments[sbi], snapped))
                  addPendingSplit(gj, sbi, snapped);
              }
            }
          }
        }
      }
    }

    if (pendingSplits.size === 0) break;

    routeGroups.forEach((group, gIdx) => {
      const rebuilt = [];
      group.segments.forEach((seg, sIdx) => {
        const key = `${gIdx}:${sIdx}`;
        const splitPts = pendingSplits.get(key) || [];
        rebuilt.push(...splitSegmentByPoints(seg, splitPts));
      });
      group.segments = rebuilt;
    });
  }

  if (isMerged) {
    finalData = routeGroups.map((g) => ({
      route_name: g.route_name,
      color: g.color,
      segments: g.segments,
      original_props: g.original_props,
    }));
  } else {
    finalData = routeGroups.flatMap((g) =>
      g.segments.map((seg) => ({
        ...seg,
        name: seg.name || g.route_name,
        route_name: seg.route_name || g.route_name,
        route_color: seg.route_color || g.color,
      }))
    );
  }

  // 配置 connect_number：優先沿用 stationLookup（含 oldConnectData）的舊編號
  const usedCNs = new Set();
  const cnMap = new Map();

  // 先收集 stationLookup 中已有的 connect_number
  for (const [k, v] of stationLookup.entries()) {
    if (v.connect_number != null) {
      cnMap.set(k, v.connect_number);
      usedCNs.add(v.connect_number);
    }
  }

  let nextCN = usedCNs.size > 0 ? Math.max(...usedCNs) + 1 : 1;
  const getCN = (k) => {
    if (!cnMap.has(k)) {
      cnMap.set(k, nextCN++);
    }
    return cnMap.get(k);
  };

  const iter = (cb) => {
    if (isMerged) finalData.forEach((r) => (r.segments || []).forEach(cb));
    else finalData.forEach(cb);
  };

  const getStationName = (i) => i?.station_name || i?.tags?.station_name || i?.tags?.name || '';
  const getStationId = (i) => i?.station_id || i?.tags?.station_id || '';

  // 補齊 properties 的屬性：先用 stationLookup（座標查找），再用 oldCNProps（connect_number 查找）
  const patchProps = (props, coordK) => {
    if (!props) return;
    // 第一層：用座標從 stationLookup 補齊
    const byCoord = coordK ? stationLookup.get(coordK) : null;
    if (byCoord) {
      if (!props.station_name && byCoord.station_name) props.station_name = byCoord.station_name;
      if (!props.station_id && byCoord.station_id) props.station_id = byCoord.station_id;
      if (!props.tags) props.tags = {};
      if (!props.tags.station_name && byCoord.station_name)
        props.tags.station_name = byCoord.station_name;
      if (!props.tags.station_id && byCoord.station_id) props.tags.station_id = byCoord.station_id;
      if (!props.tags.name && byCoord.station_name) props.tags.name = byCoord.station_name;
    }
    // 第二層：用 connect_number 從 oldConnectData 補齊
    const cn = props.connect_number;
    if (cn != null && oldCNProps.has(cn)) {
      const old = oldCNProps.get(cn);
      if (!props.station_name && old.station_name) props.station_name = old.station_name;
      if (!props.station_id && old.station_id) props.station_id = old.station_id;
      if (!props.tags) props.tags = {};
      if (!props.tags.station_name && old.station_name) props.tags.station_name = old.station_name;
      if (!props.tags.station_id && old.station_id) props.tags.station_id = old.station_id;
      if (!props.tags.name && old.station_name) props.tags.name = old.station_name;
    }
  };

  iter((seg) => {
    const sk = coordKey([seg.properties_start.x_grid, seg.properties_start.y_grid]);
    const ek = coordKey([seg.properties_end.x_grid, seg.properties_end.y_grid]);
    seg.properties_start.connect_number = getCN(sk);
    seg.properties_end.connect_number = getCN(ek);
    patchProps(seg.properties_start, sk);
    patchProps(seg.properties_end, ek);
    if (seg.nodes?.length) {
      seg.nodes[0].connect_number = seg.properties_start.connect_number;
      seg.nodes[seg.nodes.length - 1].connect_number = seg.properties_end.connect_number;
      patchProps(seg.nodes[0], sk);
      patchProps(seg.nodes[seg.nodes.length - 1], ek);
    }
  });

  const connectData = [];
  iter((seg) => {
    const s = seg.properties_start || {};
    const e = seg.properties_end || {};
    const connectSids = new Set();
    const sSid = getStationId(s);
    const eSid = getStationId(e);
    if (sSid) connectSids.add(sSid);
    if (eSid) connectSids.add(eSid);
    connectData.push({
      connect_start: JSON.parse(JSON.stringify(s)),
      connect_end: JSON.parse(JSON.stringify(e)),
      station_list: (seg.nodes || [])
        .filter((n) => n.node_type === 'line')
        .map((n) => ({ station_id: getStationId(n), station_name: getStationName(n) }))
        .filter((n) => (n.station_id || n.station_name) && !connectSids.has(n.station_id)),
    });
  });

  return { routesData: finalData, connectData };
}
