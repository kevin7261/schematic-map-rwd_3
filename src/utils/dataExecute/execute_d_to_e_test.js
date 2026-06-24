// # @title 2-11: 縮減座標 (測試版，讀取 taipei_d → 輸出 taipei_e)
// ==============================================================================
// 📝 程式說明：taipei_c 於 execute_b_to_c_test 寫入「疊加正規化網格座標」（刪空列／空行後塌縮）；taipei_d 為其複製。
// 本檔執行 taipei_d→taipei_e「縮減座標」：偵測空列／空行、移除並重新映射、塌縮後輸出 taipei_e；
// 並將 Section/Connect/Station 對齊塌縮後座標。
// ==============================================================================
/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';
import {
  resolveTaipeiTestPipelineStep,
  isTaipeiTestFghiLayerId,
} from '@/utils/taipeiTestPipeline.js';
import {
  collectStationPlacementPoints,
  collectLineStationGridPointsFromStationData,
  normalizeSpaceNetworkDataToFlatSegments,
  getMinSpacingCellSizesFromLayer,
} from '@/utils/gridNormalizationMinDistance.js';

// ==========================================
// 2. 資料結構轉換 (Flat List <-> Grouped)
// ==========================================
/**
 * 提取路線名稱（支援測試圖層 segment.route_name / segment.name）
 * @param {Object} item - 項目物件
 * @returns {string} 路線名稱
 */
function getRouteName(item) {
  if (item.route_name) return item.route_name;
  if (item.name) return item.name;
  const p = item.way_properties?.tags || {};
  return p.route_name || p.name || item.properties?.route_name || 'Unknown';
}

/**
 * 將扁平列表轉換為以路線為單位的結構。
 * @param {Array} flatData - 扁平資料陣列
 * @returns {Array} 結構化資料陣列
 */
export function groupFlatDataByRoute(flatData) {
  const grouped = new Map();
  for (const seg of flatData) {
    const rName = getRouteName(seg);
    if (!grouped.has(rName)) {
      grouped.set(rName, []);
    }
    grouped.get(rName).push(seg);
  }

  const structuredData = [];
  for (const [rName, segments] of grouped.entries()) {
    structuredData.push({
      route_name: rName,
      segments: segments,
      original_props: segments.length > 0 ? segments[0] : {},
    });
  }
  return structuredData;
}

/**
 * 將結構化資料還原為扁平列表 (輸出用)
 * @param {Array} structuredData - 結構化資料陣列
 * @returns {Array} 扁平列表
 */
export function flattenData(structuredData) {
  const flatList = [];
  for (const route of structuredData) {
    for (const seg of route.segments) {
      flatList.push(seg);
    }
  }
  return flatList;
}

// ==========================================
// 3. 幾何運算與輔助函式
// ==========================================
function dist(p1, p2) {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}

function generatePointsOnStraightSegments(polyline, totalCount) {
  if (totalCount <= 0) return [];
  if (totalCount === 1) {
    return [{ x: polyline[0][0], y: polyline[0][1], h: false, v: false }];
  }

  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    const d = dist(p1, p2);
    if (d < 1e-9) continue;
    const isH = Math.abs(p1[1] - p2[1]) < 0.1;
    const isV = Math.abs(p1[0] - p2[0]) < 0.1;
    segments.push({ len: d, p1: p1, p2: p2, h: isH, v: isV });
    totalLength += d;
  }

  if (totalLength === 0) {
    return Array(totalCount).fill({ x: polyline[0][0], y: polyline[0][1], h: false, v: false });
  }

  const resultPoints = [];
  const stepDist = totalLength / (totalCount - 1);
  let segIdx = 0;
  let coveredLen = 0;

  for (let i = 0; i < totalCount; i++) {
    const target = i * stepDist;
    while (segIdx < segments.length) {
      const seg = segments[segIdx];
      const segStartDist = coveredLen;
      const segEndDist = coveredLen + seg.len;
      if (target <= segEndDist + 1e-9) {
        const remain = target - segStartDist;
        const ratio = seg.len > 0 ? remain / seg.len : 0;
        const nx = seg.p1[0] + (seg.p2[0] - seg.p1[0]) * ratio;
        const ny = seg.p1[1] + (seg.p2[1] - seg.p1[1]) * ratio;
        resultPoints.push({ x: nx, y: ny, h: seg.h, v: seg.v });
        break;
      } else {
        coveredLen += seg.len;
        segIdx++;
      }
    }
  }

  while (resultPoints.length < totalCount) {
    resultPoints.push({
      x: polyline[polyline.length - 1][0],
      y: polyline[polyline.length - 1][1],
      h: false,
      v: false,
    });
  }
  return resultPoints;
}

function getColor(props) {
  const p = props?.way_properties?.tags || props?.properties || props || {};
  return p.colour || p.color || '#555555';
}

function getNodeMetadataFromProps(props) {
  const tags = props?.tags || {};
  let cNum = props?.connect_number;
  if (cNum === null || cNum === undefined) {
    cNum = tags.connect_number;
  }

  const meta = {
    connect_number: cNum,
    station_name: tags.station_name || tags.name || props?.station_name,
    station_id: tags.station_id || props?.station_id,
    route_name_list: props?.route_name_list || [],
    tags_object: tags,
    node_type: props?.node_type,
  };
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null && v !== undefined));
}

function getBounds(dataList, buffer = 2) {
  const allX = [];
  const allY = [];
  for (const route of dataList) {
    for (const seg of route.segments) {
      for (const p of seg.points) {
        allX.push(p[0]);
        allY.push(p[1]);
      }
    }
  }
  if (allX.length === 0) return [0, 10, 0, 10];
  return [
    Math.min(...allX) - buffer,
    Math.max(...allX) + buffer,
    Math.min(...allY) - buffer,
    Math.max(...allY) + buffer,
  ];
}

// ==========================================
// 4. 拓撲排序邏輯
// ==========================================
function reorderSegmentsContinuously(segmentsList) {
  if (!segmentsList || segmentsList.length === 0) return [];
  const workingList = JSON.parse(JSON.stringify(segmentsList));

  const getKey = (pt) => [Math.round(pt[0] * 100) / 100, Math.round(pt[1] * 100) / 100];

  const items = {};
  const adj = {};
  for (let i = 0; i < workingList.length; i++) {
    const seg = workingList[i];
    const pts = seg.points;
    if (!pts || pts.length === 0) continue;
    const pStart = getKey(pts[0]);
    const pEnd = getKey(pts[pts.length - 1]);
    const pStartStr = JSON.stringify(pStart);
    const pEndStr = JSON.stringify(pEnd);
    items[i] = { seg: seg, p_start: pStartStr, p_end: pEndStr, visited: false };
    if (!adj[pStartStr]) adj[pStartStr] = [];
    adj[pStartStr].push(i);
    if (!adj[pEndStr]) adj[pEndStr] = [];
    adj[pEndStr].push(i);
  }

  const degreeMap = {};
  for (const [k, v] of Object.entries(adj)) {
    degreeMap[k] = v.length;
  }

  const sortedResult = [];

  while (sortedResult.length < Object.keys(items).length) {
    const remaining = Object.keys(items)
      .map(Number)
      .filter((i) => !items[i].visited);
    if (remaining.length === 0) break;

    let startIdx = remaining[0];
    for (const idx of remaining) {
      const pS = items[idx].p_start;
      const pE = items[idx].p_end;
      if (degreeMap[pS] === 1 || degreeMap[pE] === 1) {
        startIdx = idx;
        break;
      }
    }

    const currItem = items[startIdx];
    currItem.visited = true;

    let needReverse = false;
    if (degreeMap[currItem.p_end] === 1 && degreeMap[currItem.p_start] !== 1) {
      needReverse = true;
    }
    let currCoord = needReverse ? currItem.p_start : currItem.p_end;

    const segData = currItem.seg;

    if (needReverse) {
      segData.points = segData.points.slice().reverse();
      if (segData.nodes) segData.nodes = segData.nodes.slice().reverse();
      if (segData.original_points)
        segData.original_points = segData.original_points.slice().reverse();
    }

    sortedResult.push(segData);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidates = adj[currCoord] || [];
      let nextIdx = null;
      for (const c of candidates) {
        if (!items[c].visited) {
          nextIdx = c;
          break;
        }
      }
      if (nextIdx === null) break;

      const nxtItem = items[nextIdx];
      nxtItem.visited = true;
      const nxtSeg = nxtItem.seg;

      if (nxtItem.p_start === currCoord) {
        currCoord = nxtItem.p_end;
      } else if (nxtItem.p_end === currCoord) {
        nxtSeg.points = nxtSeg.points.slice().reverse();
        if (nxtSeg.nodes) nxtSeg.nodes = nxtSeg.nodes.slice().reverse();
        if (nxtSeg.original_points)
          nxtSeg.original_points = nxtSeg.original_points.slice().reverse();
        currCoord = nxtItem.p_start;
      } else {
        break;
      }
      sortedResult.push(nxtSeg);
    }
  }

  return sortedResult;
}

function buildGlobalTopology(dataList) {
  const adjacency = {};
  for (const route of dataList) {
    for (const seg of route.segments) {
      const pts = seg.points;
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const k1 = [Math.round(pts[i][0]), Math.round(pts[i][1])];
        const k2 = [Math.round(pts[i + 1][0]), Math.round(pts[i + 1][1])];
        const k1Str = JSON.stringify(k1);
        const k2Str = JSON.stringify(k2);
        if (k1Str === k2Str) continue;
        if (!adjacency[k1Str]) adjacency[k1Str] = new Set();
        if (!adjacency[k2Str]) adjacency[k2Str] = new Set();
        adjacency[k1Str].add(k2Str);
        adjacency[k2Str].add(k1Str);
      }
    }
  }
  return adjacency;
}

function buildRouteOverlapMap(dataList) {
  const overlapMap = {};
  let routeIdx = 0;
  for (const route of dataList) {
    routeIdx++;
    const pointsInThisRoute = new Set();
    for (const seg of route.segments) {
      for (const p of seg.points) {
        pointsInThisRoute.add(JSON.stringify([Math.round(p[0]), Math.round(p[1])]));
      }
    }
    for (const pt of pointsInThisRoute) {
      if (!overlapMap[pt]) overlapMap[pt] = new Set();
      overlapMap[pt].add(routeIdx);
    }
  }
  return overlapMap;
}

function detectSharpTurns(polyline) {
  const turns = new Set();
  if (polyline.length < 3) return turns;
  for (let i = 1; i < polyline.length - 1; i++) {
    const prev = polyline[i - 1];
    const curr = polyline[i];
    const nextP = polyline[i + 1];

    const v1x = curr[0] - prev[0];
    const v1y = curr[1] - prev[1];
    const v2x = nextP[0] - curr[0];
    const v2y = nextP[1] - curr[1];

    const isV1Horiz = Math.abs(v1y) < 0.1 && Math.abs(v1x) > 0.1;
    const isV1Vert = Math.abs(v1x) < 0.1 && Math.abs(v1y) > 0.1;

    const isV2Horiz = Math.abs(v2y) < 0.1 && Math.abs(v2x) > 0.1;
    const isV2Vert = Math.abs(v2x) < 0.1 && Math.abs(v2y) > 0.1;

    if ((isV1Horiz && isV2Vert) || (isV1Vert && isV2Horiz)) {
      turns.add(JSON.stringify([Math.round(curr[0]), Math.round(curr[1])]));
    }
  }
  return turns;
}

export function prepareSequenceAndSortedData(dataList) {
  const sequence = [];
  const sortedData = JSON.parse(JSON.stringify(dataList));
  const metadataMap = {};

  for (const route of sortedData) {
    for (const seg of route.segments) {
      const pts = seg.points;
      const nodes = seg.nodes || [];
      if (nodes.length === pts.length) {
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const nodeProps = nodes[i];
          const k = JSON.stringify([Math.round(p[0]), Math.round(p[1])]);
          const meta = getNodeMetadataFromProps(nodeProps);
          if (Object.keys(meta).length > 0) {
            if (!metadataMap[k]) {
              metadataMap[k] = meta;
            } else {
              Object.assign(metadataMap[k], meta);
            }
          }
        }
      }
    }
  }

  const topologyMap = buildGlobalTopology(sortedData);
  const routeOverlapMap = buildRouteOverlapMap(sortedData);

  let routeIdx = 0;
  for (const route of sortedData) {
    routeIdx++;
    const routeName = route.route_name || `Route ${routeIdx}`;
    const routeColor = getColor(route.original_props || {});

    const rawSegments = route.segments;
    const sortedSegmentsList = reorderSegmentsContinuously(rawSegments);
    route.segments = sortedSegmentsList;

    let fullPolyline = [];
    if (sortedSegmentsList.length > 0) {
      const allPoints = [];
      for (const seg of sortedSegmentsList) {
        allPoints.push(...seg.points);
      }

      if (allPoints.length > 0) {
        fullPolyline.push(allPoints[0]);
        for (let i = 1; i < allPoints.length; i++) {
          const p = allPoints[i];
          if (dist(p, fullPolyline[fullPolyline.length - 1]) > 0.001) {
            fullPolyline.push(p);
          }
        }
      }
    }

    const turnCoords = detectSharpTurns(fullPolyline);

    for (let segI = 0; segI < sortedSegmentsList.length; segI++) {
      const seg = sortedSegmentsList[segI];
      const pts = seg.points;
      const origPts = seg.original_points || [];
      const count = origPts.length > 0 ? origPts.length : pts.length;

      const stationPtsData = generatePointsOnStraightSegments(pts, count);

      for (let i = 0; i < stationPtsData.length; i++) {
        const pData = stationPtsData[i];
        const finalX = Math.round(pData.x);
        const finalY = Math.round(pData.y);
        const coordKey = JSON.stringify([finalX, finalY]);

        const ptMeta = metadataMap[coordKey] || {};
        const degree = (topologyMap[coordKey] || new Set()).size;
        const numRoutes = (routeOverlapMap[coordKey] || new Set()).size;

        const isTurn = turnCoords.has(coordKey);

        const ptObj = {
          x: finalX,
          y: finalY,
          route_idx: routeIdx,
          route_name: routeName,
          seg_idx: segI,
          point_idx: i,
          color: routeColor,
          connect_number: ptMeta.connect_number,
          tags: ptMeta.tags_object || {},
          station_name: ptMeta.station_name,
          station_id: ptMeta.station_id,
          route_name_list: ptMeta.route_name_list,
          is_turn: isTurn,
          seg_is_h: pData.h,
          seg_is_v: pData.v,
        };

        if (ptObj.connect_number !== null && ptObj.connect_number !== undefined) {
          ptObj.marker_type = 'X';
          ptObj.color_code = '#D50000';
          ptObj.is_movable = false;
        } else if (isTurn) {
          ptObj.marker_type = 'X';
          ptObj.color_code = '#0046E3';
          ptObj.is_movable = false;
        } else if (numRoutes >= 2 || degree > 2) {
          ptObj.marker_type = 'X';
          ptObj.color_code = '#D50000';
          ptObj.is_movable = false;
        } else {
          ptObj.marker_type = 'O';
          ptObj.color_code = 'black';
          ptObj.is_movable = true;
        }

        sequence.push(ptObj);
      }
    }
  }

  return [sequence, sortedData];
}

// eslint-disable-next-line no-unused-vars
function drawMapStyle3(ax, dataList, titleSuffix = '', sequenceOverride = null) {
  console.log(`[視覺化] ${titleSuffix}`);
}

// ==========================================
// 6. 自動化核心 (Automator)
// ==========================================
export class RouteSequenceAutomator {
  constructor(data, sequence) {
    this.originalDataImmutable = JSON.parse(JSON.stringify(data));
    this.originalSequence = JSON.parse(JSON.stringify(sequence));
    this.data = JSON.parse(JSON.stringify(data));
    this.sequence = JSON.parse(JSON.stringify(sequence));
    const [xMin, xMax, yMin, yMax] = getBounds(this.data);
    this.centerX = (xMin + xMax) / 2;
    this.centerY = (yMin + yMax) / 2;
    this.routeGridMask = this._buildRouteGridMask();
    this.roundCount = 0;
    this.calculateVectorsOnly();
  }

  _buildRouteGridMask() {
    const mask = {};
    let rIdx = 0;
    for (const route of this.data) {
      rIdx++;
      const validCoords = new Set();
      for (const seg of route.segments) {
        const pts = seg.points;
        if (pts.length < 2) continue;
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          if (steps === 0) {
            validCoords.add(JSON.stringify([Math.round(p1[0]), Math.round(p1[1])]));
            continue;
          }
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            validCoords.add(
              JSON.stringify([Math.round(p1[0] + dx * t), Math.round(p1[1] + dy * t)])
            );
          }
        }
      }
      mask[rIdx] = validCoords;
    }
    return mask;
  }

  updateRouteGeometry(ptData, oldX, oldY, newX, newY) {
    if (ptData.route_idx < 1 || ptData.route_idx > this.data.length) return;
    const route = this.data[ptData.route_idx - 1];
    const segIdx = ptData.seg_idx;
    const pointIdx = ptData.point_idx;

    if (segIdx < route.segments.length) {
      const seg = route.segments[segIdx];
      if (seg.original_points) {
        if (pointIdx < seg.original_points.length) {
          seg.original_points[pointIdx][0] = newX;
          seg.original_points[pointIdx][1] = newY;
        }
      }
      if (seg.points) {
        for (const pt of seg.points) {
          if (Math.round(pt[0]) === oldX && Math.round(pt[1]) === oldY) {
            pt[0] = newX;
            pt[1] = newY;
          }
        }
      }
    }
  }

  calculateVectorsOnly() {
    const occupied = new Set(this.sequence.map((pt) => JSON.stringify([pt.x, pt.y])));
    const targetCx = Math.round(this.centerX);
    const targetCy = Math.round(this.centerY);

    for (const pt of this.sequence) {
      pt.vector_dx = 0;
      pt.vector_dy = 0;
      pt.vector_type = '';

      if (!pt.is_movable) continue;

      const px = pt.x;
      const py = pt.y;
      const isH = pt.seg_is_h || false;
      const isV = pt.seg_is_v || false;

      let dx = 0;
      let dy = 0;
      if (isH && px !== targetCx) {
        dx = px < targetCx ? 1 : -1;
      }
      if (isV && py !== targetCy) {
        dy = py < targetCy ? 1 : -1;
      }
      if (dx === 0 && dy === 0) {
        pt.vector_type = 'C';
        continue;
      }

      const nx = px + dx;
      const ny = py + dy;
      const validCoords = this.routeGridMask[pt.route_idx] || new Set();
      let blocked = false;
      if (!validCoords.has(JSON.stringify([nx, ny]))) blocked = true;
      if (occupied.has(JSON.stringify([nx, ny]))) blocked = true;

      pt.vector_dx = dx;
      pt.vector_dy = dy;
      pt.vector_type = blocked ? 'B' : 'G';
    }
  }

  /**
   * 一輪：依 sequence 順序處理每個可動黑點，該點沿水平／垂直往「固定中心」每次移 1 格，
   * 內層迴圈直到下一格超出遮罩或被其他點佔據（與 Colab optimize_one_round 單點連續滑動一致）。
   * 每嘗試一步前重建 routeGridMask（因 updateRouteGeometry 已改 seg.points，靜態遮罩會誤擋）。
   * 外層 runUntilStable 重複本輪直到整網無任何移動。
   */
  optimizeOneRound() {
    let moved = 0;
    const targetCx = Math.round(this.centerX);
    const targetCy = Math.round(this.centerY);

    for (const pt of this.sequence) {
      if (!pt.is_movable) continue;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        this.routeGridMask = this._buildRouteGridMask();
        const occupied = new Set(this.sequence.map((p) => JSON.stringify([p.x, p.y])));
        occupied.delete(JSON.stringify([pt.x, pt.y]));

        const isH = pt.seg_is_h || false;
        const isV = pt.seg_is_v || false;
        let dx = 0;
        let dy = 0;
        if (isH && pt.x !== targetCx) {
          dx = pt.x < targetCx ? 1 : -1;
        }
        if (isV && pt.y !== targetCy) {
          dy = pt.y < targetCy ? 1 : -1;
        }
        if (dx === 0 && dy === 0) break;

        const nx = pt.x + dx;
        const ny = pt.y + dy;
        const validCoords = this.routeGridMask[pt.route_idx] || new Set();
        if (!validCoords.has(JSON.stringify([nx, ny]))) break;
        if (occupied.has(JSON.stringify([nx, ny]))) break;

        const oldX = pt.x;
        const oldY = pt.y;
        pt.x = nx;
        pt.y = ny;
        moved++;
        this.updateRouteGeometry(pt, oldX, oldY, nx, ny);
      }
    }

    this.calculateVectorsOnly();
    return moved;
  }

  runUntilStable(maxRounds = 2000, quiet = false) {
    if (!quiet) console.log(`🚀 開始向量收縮 (Max ${maxRounds} rounds)...`);
    for (let r = 0; r < maxRounds; r++) {
      this.roundCount++;
      const m = this.optimizeOneRound();
      if (m === 0) break;
    }
    if (!quiet) console.log('✅ 收縮完成。');
  }

  /**
   * 移除空列（row，iy）和空行（col，ix），並重新映射所有座標以縮減網格大小。
   * @param {number[]} emptyOverlayRows - 要移除的 row（iy）索引陣列
   * @param {number[]} emptyOverlayCols - 要移除的 col（ix）索引陣列
   */
  removeEmptyRowsAndCols(emptyOverlayRows, emptyOverlayCols) {
    if (
      (!emptyOverlayRows || emptyOverlayRows.length === 0) &&
      (!emptyOverlayCols || emptyOverlayCols.length === 0)
    ) {
      return;
    }

    const { mapX, mapY, sortedX, sortedY } = buildOverlayRemovalMaps(
      this,
      emptyOverlayRows,
      emptyOverlayCols
    );

    const remapCoord = (oldVal, map, sorted) => {
      const v = Math.round(Number(oldVal));
      if (v in map) return map[v];
      if (sorted.length > 0) {
        const nearest = sorted.reduce((prev, curr) =>
          Math.abs(curr - v) < Math.abs(prev - v) ? curr : prev
        );
        return Math.round(Number(map[nearest]));
      }
      return v;
    };

    // 座標重映射：所有點只做座標平移，絕不刪除任何點
    for (const route of this.data) {
      for (const seg of route.segments) {
        if (Array.isArray(seg.points)) {
          for (const p of seg.points) {
            p[0] = remapCoord(p[0], mapX, sortedX);
            p[1] = remapCoord(p[1], mapY, sortedY);
          }
        }
        if (Array.isArray(seg.original_points)) {
          for (const p of seg.original_points) {
            p[0] = remapCoord(p[0], mapX, sortedX);
            p[1] = remapCoord(p[1], mapY, sortedY);
          }
        }
      }
    }

    // 與路段幾何一致重算 sequence（含轉折點 is_turn／座標），避免對 x、y 分別 nearest 造成 (ix,iy) 脫鉤
    const dataForSeq = JSON.parse(JSON.stringify(this.data));
    const [newSeq] = prepareSequenceAndSortedData(dataForSeq);
    this.sequence = newSeq;

    // 更新中心點
    const [xMin, xMax, yMin, yMax] = getBounds(this.data);
    this.centerX = (xMin + xMax) / 2;
    this.centerY = (yMin + yMax) / 2;

    // 重建 routeGridMask（使用新的座標）
    this.routeGridMask = this._buildRouteGridMask();
    this.calculateVectorsOnly();
  }

  generateCollapsedView() {
    // 疊加網格座標必為整數：用整數建 valid 與 map，避免浮點殘留
    const validX = new Set();
    const validY = new Set();
    for (const pt of this.sequence) {
      validX.add(Math.round(Number(pt.x)));
      validY.add(Math.round(Number(pt.y)));
    }
    for (const route of this.data) {
      for (const seg of route.segments) {
        for (const p of seg.points) {
          validX.add(Math.round(Number(p[0])));
          validY.add(Math.round(Number(p[1])));
        }
      }
    }

    const sortedX = Array.from(validX).sort((a, b) => a - b);
    const sortedY = Array.from(validY).sort((a, b) => a - b);
    const mapX = {};
    const mapY = {};
    for (let i = 0; i < sortedX.length; i++) {
      mapX[sortedX[i]] = i;
    }
    for (let i = 0; i < sortedY.length; i++) {
      mapY[sortedY[i]] = i;
    }

    const colSeq = JSON.parse(JSON.stringify(this.sequence));
    for (const pt of colSeq) {
      const rx = Math.round(Number(pt.x));
      const ry = Math.round(Number(pt.y));
      pt.x =
        rx in mapX
          ? mapX[rx]
          : sortedX.length > 0
            ? mapX[
                sortedX.reduce((prev, curr) =>
                  Math.abs(curr - rx) < Math.abs(prev - rx) ? curr : prev
                )
              ]
            : rx;
      pt.y =
        ry in mapY
          ? mapY[ry]
          : sortedY.length > 0
            ? mapY[
                sortedY.reduce((prev, curr) =>
                  Math.abs(curr - ry) < Math.abs(prev - ry) ? curr : prev
                )
              ]
            : ry;
      pt.x = Math.round(Number(pt.x));
      pt.y = Math.round(Number(pt.y));
    }

    const colData = JSON.parse(JSON.stringify(this.data));
    for (const route of colData) {
      for (const seg of route.segments) {
        // nodes 與 points 須等長才能索引對齊；若長度不符則退化為僅保留首尾
        const oldNodes =
          Array.isArray(seg.nodes) && seg.nodes.length === seg.points.length ? seg.nodes : null;
        const newPoints = [];
        const newNodes = oldNodes ? [] : null;
        for (let pi = 0; pi < seg.points.length; pi++) {
          const p = seg.points[pi];
          const oldX = Math.round(Number(p[0]));
          const oldY = Math.round(Number(p[1]));
          const newX =
            oldX in mapX
              ? mapX[oldX]
              : sortedX.length > 0
                ? mapX[
                    sortedX.reduce((prev, curr) =>
                      Math.abs(curr - oldX) < Math.abs(prev - oldX) ? curr : prev
                    )
                  ]
                : oldX;
          const newY =
            oldY in mapY
              ? mapY[oldY]
              : sortedY.length > 0
                ? mapY[
                    sortedY.reduce((prev, curr) =>
                      Math.abs(curr - oldY) < Math.abs(prev - oldY) ? curr : prev
                    )
                  ]
                : oldY;
          const nx = Math.round(Number(newX));
          const ny = Math.round(Number(newY));
          if (
            newPoints.length === 0 ||
            newPoints[newPoints.length - 1][0] !== nx ||
            newPoints[newPoints.length - 1][1] !== ny
          ) {
            newPoints.push(p.length > 2 ? [nx, ny, p[2]] : [nx, ny]);
            if (newNodes !== null) {
              newNodes.push(oldNodes[pi] ? { ...oldNodes[pi] } : { node_type: 'line' });
            }
          } else if (newNodes !== null && oldNodes[pi]) {
            // 連續格點合併到同一座標：保留更重要的 node（connect／紅點優先於 line）
            const prev = newNodes[newNodes.length - 1];
            const curr = oldNodes[pi];
            const prevImportant = prev?.node_type === 'connect' || prev?.connect_number != null;
            const currImportant = curr?.node_type === 'connect' || curr?.connect_number != null;
            if (currImportant && !prevImportant) {
              newNodes[newNodes.length - 1] = { ...curr };
            }
          }
        }
        seg.points = newPoints;
        if (newNodes !== null) seg.nodes = newNodes;
      }
    }

    for (const pt of colSeq) {
      const rIdx = pt.route_idx - 1;
      const sIdx = pt.seg_idx;
      const pIdx = pt.point_idx;
      if (rIdx >= 0 && rIdx < colData.length) {
        const seg = colData[rIdx].segments[sIdx];
        if (seg?.original_points && pIdx < seg.original_points.length) {
          seg.original_points[pIdx][0] = Math.round(Number(pt.x));
          seg.original_points[pIdx][1] = Math.round(Number(pt.y));
        }
      }
    }
    return [colSeq, colData];
  }

  showResults() {
    const [colSeq, colData] = this.generateCollapsedView();

    drawMapStyle3(
      null,
      this.originalDataImmutable,
      ' (1. Before Shrinking)',
      this.originalSequence
    );
    drawMapStyle3(null, colData, ' (2. After Shrinking & Collapsed)', colSeq);

    console.log(`✅ 對比圖已處理 (由前端 d3jsmap 組件顯示)`);

    return flattenData(colData);
  }
}

// ==========================================
// 6b. 車站配置：向量收縮後座標 → 與 showResults 相同的格網塌縮（對齊 taipei_d 輔助資料）
// ==========================================
/**
 * 與 RouteSequenceAutomator.generateCollapsedView 相同的 X/Y 塌縮映射（基於收縮後 geometry）
 */
function buildCollapseMapsFromAutomator(automator) {
  const validX = new Set();
  const validY = new Set();
  for (const pt of automator.sequence) {
    validX.add(Math.round(Number(pt.x)));
    validY.add(Math.round(Number(pt.y)));
  }
  for (const route of automator.data) {
    for (const seg of route.segments) {
      for (const p of seg.points) {
        validX.add(Math.round(Number(p[0])));
        validY.add(Math.round(Number(p[1])));
      }
    }
  }
  const sortedX = Array.from(validX).sort((a, b) => a - b);
  const sortedY = Array.from(validY).sort((a, b) => a - b);
  const mapX = {};
  const mapY = {};
  for (let i = 0; i < sortedX.length; i++) {
    mapX[sortedX[i]] = i;
  }
  for (let i = 0; i < sortedY.length; i++) {
    mapY[sortedY[i]] = i;
  }
  return { mapX, mapY, sortedX, sortedY };
}

function pushOverlayReason(map, key, msg) {
  if (msg == null || String(msg).trim() === '') return;
  if (!map.has(key)) map.set(key, []);
  const arr = map.get(key);
  if (!arr.includes(msg)) arr.push(msg);
}

/** 縮減後若仍保留此欄／列，附加於保留原因（與佔格理由並列） */
const OVERLAY_STATION_SAFETY_REASON = '避免縮減後紅／黑站重疊或消失（僅刪空欄列、不合併格點）';

/**
 * 僅刪整欄／整列（無紅／黑／轉折點的 row／col），不刪任何站點；
 * 故紅／黑點不可能共點，無需 prune，直接回傳 rawEmpty*。
 * @returns {{ emptyCols: number[], emptyRows: number[], safetyKeptCols: Set<number>, safetyKeptRows: Set<number> }}
 */
function pruneEmptyOverlayForStationInvariants(_automator, _layer, emptyCols, emptyRows) {
  return {
    emptyCols: [...emptyCols],
    emptyRows: [...emptyRows],
    safetyKeptCols: new Set(),
    safetyKeptRows: new Set(),
  };
}

function asObj(v) {
  return v && typeof v === 'object' ? v : {};
}

function hasStationNameLike(props) {
  return !!(props.station_name || props.tags?.station_name);
}

/**
 * 與 SpaceNetworkGridTab 的 stationFeatures 判斷對齊：
 * - 端點（first/last）一律視為 connect（同 SpaceNetworkGridTab startProps.node_type || 'connect'）。
 * - 中間點：node_type === 'connect' 或有 connect_number 或有 station_name 才算真正車站；
 *   純 node_type==='line' 且無名稱的幾何轉折不算。
 * @param {RouteSequenceAutomator} automator
 * @returns {Array<{ ix: number, iy: number, kind: 'connect'|'line' }>}
 */
function collectSegmentDrawnStationGridPoints(automator) {
  const out = [];
  for (const route of automator.data || []) {
    for (const seg of route.segments || []) {
      const pts = seg.points || [];
      if (pts.length === 0) continue;
      const nodes = seg.nodes || [];
      for (let i = 0; i < pts.length; i++) {
        const isEndpoint = i === 0 || i === pts.length - 1;
        const node = asObj(nodes[i]);
        const ptProps = Array.isArray(pts[i]) && pts[i].length > 2 ? asObj(pts[i][2]) : {};
        const tags = asObj(node.tags);
        const nodeType =
          node.node_type || ptProps.node_type || tags.node_type || ptProps.tags?.node_type || '';
        const hasConnectNumber =
          node.connect_number != null ||
          ptProps.connect_number != null ||
          tags.connect_number != null ||
          ptProps.tags?.connect_number != null;
        const isConnect = isEndpoint || nodeType === 'connect' || hasConnectNumber;
        if (!isConnect && !hasStationNameLike(node) && !hasStationNameLike(ptProps)) continue;
        out.push({
          ix: Math.round(Number(pts[i][0])),
          iy: Math.round(Number(pts[i][1])),
          kind: isConnect ? 'connect' : 'line',
        });
      }
    }
  }
  return out;
}

/**
 * 依目前路段幾何（與 prepareSequenceAndSortedData 相同之拓撲排序＋折線）偵測正交轉折頂點；
 * 每個轉折之 ix、iy 須同時保留（佔欄且佔列），刪列／刪欄後也與路段一併重映射。
 * @param {RouteSequenceAutomator} automator
 * @returns {Array<{ ix: number, iy: number }>}
 */
function collectSharpTurnOverlayCellsFromAutomator(automator) {
  const cells = [];
  for (const route of automator.data || []) {
    const raw = JSON.parse(JSON.stringify(route.segments || []));
    const sortedSegmentsList = reorderSegmentsContinuously(raw);
    let fullPolyline = [];
    if (sortedSegmentsList.length > 0) {
      const allPoints = [];
      for (const seg of sortedSegmentsList) {
        allPoints.push(...(seg.points || []));
      }
      if (allPoints.length > 0) {
        fullPolyline.push(allPoints[0]);
        for (let i = 1; i < allPoints.length; i++) {
          const p = allPoints[i];
          if (dist(p, fullPolyline[fullPolyline.length - 1]) > 0.001) {
            fullPolyline.push(p);
          }
        }
      }
    }
    const turnCoords = detectSharpTurns(fullPolyline);
    for (const key of turnCoords) {
      try {
        const [tx, ty] = JSON.parse(key);
        cells.push({ ix: Math.round(Number(tx)), iy: Math.round(Number(ty)) });
      } catch {
        /* ignore */
      }
    }
  }
  return cells;
}

/**
 * 用於判斷欄／列是否可刪：
 * - 有車站配置時：collectStationPlacementPoints；
 * - **一律**再併入路段 `nodes` 之 connect／line 與 `points` 對齊之格（與 JSON 一致），避免 Section 配對漏網時誤刪頂點、黑點消失；
 * - 加上幾何轉折頂點（正交轉角）。
 * @param {object|null|undefined} layer
 * @param {RouteSequenceAutomator} automator
 * @param {Map<number, string[]>} colReasons
 * @param {Map<number, string[]>} rowReasons
 * @returns {{ usedX: Set<number>, usedY: Set<number> }}
 */
function collectDrawableOverlayOccupancy(layer, automator, colReasons, rowReasons) {
  const usedX = new Set();
  const usedY = new Set();
  const sectionData = layer?.spaceNetworkGridJsonData_SectionData;
  const sectionLen = Array.isArray(sectionData) ? sectionData.length : 0;
  const showPl = layer?.showStationPlacement === true;

  const add = (ix, iy, msg) => {
    usedX.add(ix);
    usedY.add(iy);
    if (msg) {
      pushOverlayReason(colReasons, ix, msg);
      pushOverlayReason(rowReasons, iy, msg);
    }
  };

  const mergeSharpTurns = () => {
    for (const { ix, iy } of collectSharpTurnOverlayCellsFromAutomator(automator)) {
      add(ix, iy, `路線轉折點 (${ix},${iy})`);
    }
  };

  /** taipei_f／taipei_g：未開車站配置時仍須以 StationData／ConnectData 格點佔欄列，否則誤刪黑／紅圓點所在列或欄 */
  const mergeTaipeiFGStationConnectFromLayerJson = () => {
    const lid = layer?.layerId;
    if (!isTaipeiTestFghiLayerId(lid)) return;
    const blackRows = collectLineStationGridPointsFromStationData(
      layer?.spaceNetworkGridJsonData_StationData
    );
    for (const p of blackRows) {
      const ix = Math.round(Number(p.x));
      const iy = Math.round(Number(p.y));
      add(ix, iy, `黑點 (${ix},${iy})`);
    }
    const connectData = layer?.spaceNetworkGridJsonData_ConnectData;
    if (Array.isArray(connectData)) {
      for (const row of connectData) {
        if (!row || typeof row !== 'object') continue;
        const x = row.x_grid ?? row.tags?.x_grid;
        const y = row.y_grid ?? row.tags?.y_grid;
        if (x == null || y == null) continue;
        const ix = Math.round(Number(x));
        const iy = Math.round(Number(y));
        add(ix, iy, `紅點 (${ix},${iy})`);
      }
    }
  };

  if (sectionLen > 0 && showPl) {
    // 紅點：由 collectStationPlacementPoints 取路段端點（route geometry）
    const placement = collectStationPlacementPoints(layer);
    for (const p of placement) {
      if (p.kind !== 'connect') continue;
      const ix = Math.round(Number(p.x));
      const iy = Math.round(Number(p.y));
      add(ix, iy, `紅點 (${ix},${iy})`);
    }
    // 黑點：直接讀 StationData x_grid/y_grid（c→d 滑動後的實際位置），
    // 不可用弧長插值——c→d 只更新 StationData 而不改路段幾何，插值會回到舊位置
    const blackRows = collectLineStationGridPointsFromStationData(
      layer?.spaceNetworkGridJsonData_StationData
    );
    for (const p of blackRows) {
      const ix = Math.round(Number(p.x));
      const iy = Math.round(Number(p.y));
      add(ix, iy, `黑點 (${ix},${iy})`);
    }
  }

  mergeTaipeiFGStationConnectFromLayerJson();

  for (const p of collectSegmentDrawnStationGridPoints(automator)) {
    const msg = p.kind === 'connect' ? `紅點 (${p.ix},${p.iy})` : `黑點 (${p.ix},${p.iy})`;
    add(p.ix, p.iy, msg);
  }
  mergeSharpTurns();
  return { usedX, usedY };
}

/**
 * 與 getEmptyOverlayRowsAndCols 相同之刪除候選，並附「每一個未刪除之欄／列」的保留原因（刪除前疊加索引 ix, iy）。
 * 規則：車站配置紅／黑（若有）＋路段 connect／line 節點（與 JSON 一致）＋幾何轉折頂點判斷佔欄／佔列；
 * 不再用 sequence 的 O／黑點採樣；轉折與路段同步，見 removeEmptyRowsAndCols 內重算 sequence。
 * 初算之 rawEmpty* 僅依佔格；empty* 再經 pruneEmptyOverlayForStationInvariants，避免縮減後紅／黑站疊格或落在被刪欄列上（僅刪整欄列、不合併格點）。
 * @param {RouteSequenceAutomator} automator
 * @param {object} [layer] - 含 spaceNetworkGridJsonData_*、showStationPlacement；未傳時視同無 SectionData，僅依路段 connect／line 節點。
 * @returns {{
 *   emptyOverlayRows: number[],
 *   emptyOverlayCols: number[],
 *   rawEmptyOverlayRows: number[],
 *   rawEmptyOverlayCols: number[],
 *   retainedColReasons: Record<string, string[]>,
 *   retainedRowReasons: Record<string, string[]>,
 *   boundsPreRemoval: { minX: number, maxX: number, minY: number, maxY: number } | null
 * }}
 */
export function getOverlayShrinkageReport(automator, layer) {
  const colReasons = new Map();
  const rowReasons = new Map();
  const { usedX, usedY } = collectDrawableOverlayOccupancy(
    layer,
    automator,
    colReasons,
    rowReasons
  );

  const allX = new Set();
  const allY = new Set();
  for (const pt of automator.sequence) {
    allX.add(pt.x);
    allY.add(pt.y);
  }
  for (const route of automator.data) {
    for (const seg of route.segments) {
      for (const p of seg.points || []) {
        allX.add(Math.round(p[0]));
        allY.add(Math.round(p[1]));
      }
    }
  }

  if (allX.size === 0 || allY.size === 0) {
    return {
      emptyOverlayRows: [],
      emptyOverlayCols: [],
      rawEmptyOverlayRows: [],
      rawEmptyOverlayCols: [],
      retainedColReasons: {},
      retainedRowReasons: {},
      boundsPreRemoval: null,
    };
  }

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const rawEmptyOverlayCols = [];
  const rawEmptyOverlayRows = [];
  for (let x = minX; x <= maxX; x++) {
    if (!usedX.has(x)) rawEmptyOverlayCols.push(x);
  }
  for (let y = minY; y <= maxY; y++) {
    if (!usedY.has(y)) rawEmptyOverlayRows.push(y);
  }

  const pruned = pruneEmptyOverlayForStationInvariants(
    automator,
    layer,
    rawEmptyOverlayCols,
    rawEmptyOverlayRows
  );
  const emptyOverlayCols = pruned.emptyCols;
  const emptyOverlayRows = pruned.emptyRows;
  const deletedColSet = new Set(emptyOverlayCols);
  const deletedRowSet = new Set(emptyOverlayRows);

  const retainedColReasons = {};
  for (let x = minX; x <= maxX; x++) {
    if (deletedColSet.has(x)) continue;
    const reasons = [...(colReasons.get(x) || [])];
    if (pruned.safetyKeptCols.has(x) && !reasons.includes(OVERLAY_STATION_SAFETY_REASON)) {
      reasons.push(OVERLAY_STATION_SAFETY_REASON);
    }
    if (reasons.length === 0) {
      reasons.push(usedX.has(x) ? '佔欄（未能列舉原因）' : '（異常：此欄未刪除但無佔欄紀錄）');
    }
    retainedColReasons[String(x)] = reasons;
  }

  const retainedRowReasons = {};
  for (let y = minY; y <= maxY; y++) {
    if (deletedRowSet.has(y)) continue;
    const reasons = [...(rowReasons.get(y) || [])];
    if (pruned.safetyKeptRows.has(y) && !reasons.includes(OVERLAY_STATION_SAFETY_REASON)) {
      reasons.push(OVERLAY_STATION_SAFETY_REASON);
    }
    if (reasons.length === 0) {
      reasons.push(usedY.has(y) ? '佔列（未能列舉原因）' : '（異常：此列未刪除但無佔列紀錄）');
    }
    retainedRowReasons[String(y)] = reasons;
  }

  return {
    emptyOverlayRows,
    emptyOverlayCols,
    rawEmptyOverlayRows: rawEmptyOverlayRows,
    rawEmptyOverlayCols: rawEmptyOverlayCols,
    retainedColReasons,
    retainedRowReasons,
    boundsPreRemoval: { minX, maxX, minY, maxY },
  };
}

/**
 * 依 removeEmptyRowsAndCols 相同規則，由 automator 目前狀態建立舊疊加格索引 → 縮減後索引的 mapX/mapY。
 * @param {RouteSequenceAutomator} automator
 * @param {number[]} emptyOverlayRows
 * @param {number[]} emptyOverlayCols
 * @returns {{ mapX: Record<number, number>, mapY: Record<number, number>, sortedX: number[], sortedY: number[], emptyRowsSet: Set<number>, emptyColsSet: Set<number> }}
 */
export function buildOverlayRemovalMaps(automator, emptyOverlayRows, emptyOverlayCols) {
  const emptyRowsSet = new Set(emptyOverlayRows || []);
  const emptyColsSet = new Set(emptyOverlayCols || []);

  const usedX = new Set();
  const usedY = new Set();
  for (const pt of automator.sequence) {
    if (!emptyColsSet.has(pt.x)) usedX.add(pt.x);
    if (!emptyRowsSet.has(pt.y)) usedY.add(pt.y);
  }
  for (const route of automator.data) {
    for (const seg of route.segments) {
      for (const p of seg.points || []) {
        const px = Math.round(p[0]);
        const py = Math.round(p[1]);
        if (!emptyColsSet.has(px)) usedX.add(px);
        if (!emptyRowsSet.has(py)) usedY.add(py);
      }
    }
  }

  const sortedX = Array.from(usedX).sort((a, b) => a - b);
  const sortedY = Array.from(usedY).sort((a, b) => a - b);
  const mapX = {};
  const mapY = {};
  for (let i = 0; i < sortedX.length; i++) {
    mapX[sortedX[i]] = i;
  }
  for (let i = 0; i < sortedY.length; i++) {
    mapY[sortedY[i]] = i;
  }

  return { mapX, mapY, sortedX, sortedY, emptyRowsSet, emptyColsSet };
}

/**
 * 將「刪空前」保留之欄／列索引映射為圖面（空欄列移除後再塌縮）之 ix′、iy′，與示意圖／JSON 一致。
 * @param {Record<string, string[]>|null|undefined} retainedColReasons
 * @param {Record<string, string[]>|null|undefined} retainedRowReasons
 * @param {boolean} hadRemoval
 * @param {Record<number, number>|null|undefined} removalMapX
 * @param {Record<number, number>|null|undefined} removalMapY
 * @param {Record<number, number>|null|undefined} collapseMapX
 * @param {Record<number, number>|null|undefined} collapseMapY
 * @returns {{ colsDisplay: Array<{ reducedIx: number, preRemovalIx: number, reasons: string[] }>, rowsDisplay: Array<{ reducedIy: number, preRemovalIy: number, reasons: string[] }> }}
 */
export function buildOverlayRetentionDisplayTables(
  retainedColReasons,
  retainedRowReasons,
  hadRemoval,
  removalMapX,
  removalMapY,
  collapseMapX,
  collapseMapY
) {
  const mapColPreToReduced = (preIx) => {
    let xm = Math.round(Number(preIx));
    if (hadRemoval && removalMapX) {
      const v = removalMapX[xm] ?? removalMapX[String(xm)];
      if (v != null && v !== undefined) xm = Math.round(Number(v));
    }
    if (collapseMapX) {
      const c = collapseMapX[xm] ?? collapseMapX[String(xm)];
      if (c != null && c !== undefined) return { reducedIx: Math.round(Number(c)), midX: xm };
    }
    return { reducedIx: xm, midX: xm };
  };
  const mapRowPreToReduced = (preIy) => {
    let ym = Math.round(Number(preIy));
    if (hadRemoval && removalMapY) {
      const v = removalMapY[ym] ?? removalMapY[String(ym)];
      if (v != null && v !== undefined) ym = Math.round(Number(v));
    }
    if (collapseMapY) {
      const c = collapseMapY[ym] ?? collapseMapY[String(ym)];
      if (c != null && c !== undefined) return { reducedIy: Math.round(Number(c)), midY: ym };
    }
    return { reducedIy: ym, midY: ym };
  };

  const colsDisplay = Object.keys(retainedColReasons || {}).map((k) => {
    const pre = Number(k);
    const { reducedIx } = mapColPreToReduced(pre);
    return {
      reducedIx,
      preRemovalIx: pre,
      reasons: retainedColReasons[k],
    };
  });
  colsDisplay.sort((a, b) => a.reducedIx - b.reducedIx || a.preRemovalIx - b.preRemovalIx);

  const rowsDisplay = Object.keys(retainedRowReasons || {}).map((k) => {
    const pre = Number(k);
    const { reducedIy } = mapRowPreToReduced(pre);
    return {
      reducedIy,
      preRemovalIy: pre,
      reasons: retainedRowReasons[k],
    };
  });
  rowsDisplay.sort((a, b) => a.reducedIy - b.reducedIy || a.preRemovalIy - b.preRemovalIy);

  return { colsDisplay, rowsDisplay };
}

/**
 * 縮減前：在最小間距疊加網格座標下，找出可刪除的 row（iy）與 col（ix）。
 * 規則見 getOverlayShrinkageReport；本函式僅回傳刪除候選。
 * @param {RouteSequenceAutomator} automator
 * @param {object} [layer]
 * @returns {{ emptyOverlayRows: number[], emptyOverlayCols: number[] }}
 */
export function getEmptyOverlayRowsAndCols(automator, layer) {
  const r = getOverlayShrinkageReport(automator, layer);
  return { emptyOverlayRows: r.emptyOverlayRows, emptyOverlayCols: r.emptyOverlayCols };
}

function lookupMapRank(px, mapX, sortedKeys) {
  const p = Math.round(Number(px));
  if (mapX == null) return null;
  if (Object.prototype.hasOwnProperty.call(mapX, p)) return Math.round(Number(mapX[p]));
  const sp = String(p);
  if (Object.prototype.hasOwnProperty.call(mapX, sp)) return Math.round(Number(mapX[sp]));
  if (!sortedKeys.length) return null;
  const nearest = sortedKeys.reduce((prev, curr) =>
    Math.abs(curr - p) < Math.abs(prev - p) ? curr : prev
  );
  if (Object.prototype.hasOwnProperty.call(mapX, nearest)) return Math.round(Number(mapX[nearest]));
  const sn = String(nearest);
  if (Object.prototype.hasOwnProperty.call(mapX, sn)) return Math.round(Number(mapX[sn]));
  return null;
}

/**
 * 由「塌縮後縮減格索引」ix′, iy′（必須各在 [0, n) 內）還原刪空列／空行前之疊加網格座標。
 * 超出範圍回傳 null（勿 clamp，否則會把大座標誤當邊界格而顛倒疊加／縮減）。
 */
export function fullOverlayCoordsFromStrictReduced(ixReduced, iyReduced, gridTooltipMaps) {
  const m = gridTooltipMaps;
  if (!m?.collapseSortedX?.length || !m?.collapseSortedY?.length) return null;
  const fi = Math.round(Number(ixReduced));
  const fj = Math.round(Number(iyReduced));
  if (fi < 0 || fi >= m.collapseSortedX.length || fj < 0 || fj >= m.collapseSortedY.length)
    return null;
  const nx = m.collapseSortedX[fi];
  const ny = m.collapseSortedY[fj];
  const hadRemoval = m.hadRemoval === true;
  const rx = Array.isArray(m.removalSortedX) ? m.removalSortedX : [];
  const ry = Array.isArray(m.removalSortedY) ? m.removalSortedY : [];
  const ox = hadRemoval ? (nx >= 0 && nx < rx.length ? rx[nx] : nx) : nx;
  const oy = hadRemoval ? (ny >= 0 && ny < ry.length ? ry[ny] : ny) : ny;
  return [ox, oy];
}

/**
 * 由「b→c 寫入後的縮減疊加格索引」(ix′, iy′) 還原「刪空列／空行前」的疊加網格座標 (ix, iy)。
 * 若 ix′／iy′ 不在塌縮後合法範圍 [0, n)（例如圖上仍是疊加大座標），回傳 null。
 * @param {number} ixReduced
 * @param {number} iyReduced
 * @param {object} gridTooltipMaps
 * @returns {[number, number] | null}
 */
export function fullOverlayCoordsFromReducedIndices(ixReduced, iyReduced, gridTooltipMaps) {
  return fullOverlayCoordsFromStrictReduced(ixReduced, iyReduced, gridTooltipMaps);
}

/**
 * 疊加網格座標 (ix, iy) → 塌縮後縮減格 (ix′, iy′)（與 b→c 管線一致；供游標讀到大座標時對照）。
 * @param {number} ox
 * @param {number} oy
 * @param {{ hadRemoval?: boolean, removalMapX?: object, removalMapY?: object, removalSortedX?: number[] | null, removalSortedY?: number[] | null, collapseMapX?: object, collapseMapY?: object, collapseSortedX?: number[], collapseSortedY?: number[] }} gridTooltipMaps
 * @returns {[number, number] | null}
 */
export function reducedCoordsFromFullOverlayGrid(ox, oy, gridTooltipMaps) {
  const m = gridTooltipMaps;
  if (!m?.collapseMapX || !m?.collapseMapY) return null;
  let dx = Math.round(Number(ox));
  let dy = Math.round(Number(oy));
  if (m.hadRemoval === true && m.removalMapX && m.removalMapY) {
    const rsx = Array.isArray(m.removalSortedX) ? m.removalSortedX : [];
    const rsy = Array.isArray(m.removalSortedY) ? m.removalSortedY : [];
    const mx = lookupMapRank(dx, m.removalMapX, rsx);
    const my = lookupMapRank(dy, m.removalMapY, rsy);
    if (mx == null || my == null) return null;
    dx = mx;
    dy = my;
  }
  const csx = Array.isArray(m.collapseSortedX) ? m.collapseSortedX : [];
  const csy = Array.isArray(m.collapseSortedY) ? m.collapseSortedY : [];
  const cx = lookupMapRank(dx, m.collapseMapX, csx);
  const cy = lookupMapRank(dy, m.collapseMapY, csy);
  if (cx == null || cy == null) return null;
  return [cx, cy];
}

/**
 * 依游標格座標判斷是「塌縮後縮減索引」或「仍為疊加大座標」，回傳 { overlay, reduced } 供 tooltip。
 * 縮減疊加必為與 JSON／繪圖一致之塌縮空間；疊加為刪空列／行前（再經塌縮前）之對照座標。
 */
export function overlayReducedTooltipPair(ix, iy, gridTooltipMaps) {
  const m = gridTooltipMaps;
  const ixi = Math.round(Number(ix));
  const iyi = Math.round(Number(iy));
  if (!m?.collapseSortedX?.length || !m?.collapseSortedY?.length) {
    return { overlay: null, reduced: [ixi, iyi] };
  }
  const ncx = m.collapseSortedX.length;
  const ncy = m.collapseSortedY.length;
  const inCollapsedRange = ixi >= 0 && ixi < ncx && iyi >= 0 && iyi < ncy;
  if (inCollapsedRange) {
    const ov = fullOverlayCoordsFromStrictReduced(ixi, iyi, m);
    if (ov) return { overlay: ov, reduced: [ixi, iyi] };
  }
  const red = reducedCoordsFromFullOverlayGrid(ixi, iyi, m);
  if (red) return { overlay: [ixi, iyi], reduced: red };
  return { overlay: null, reduced: [ixi, iyi] };
}

/**
 * 縮減疊加格索引 (ix′, iy′) → 刪空列／空行前的疊加網格座標 (ix, iy)。
 * 與 remapOverlayCellAfterRemoval 互為逆（繪圖與比例尺在縮減空間時，游標讀到的是 ix′, iy′）。
 * @param {number} ixPrime
 * @param {number} iyPrime
 * @param {{ sortedX?: number[], sortedY?: number[] }} storedMaps — overlayRemovalMaps 之 sortedX／sortedY
 * @returns {[number, number] | null}
 */
export function overlayCoordsBeforeRemovalFromReduced(ixPrime, iyPrime, storedMaps) {
  const sx = Array.isArray(storedMaps?.sortedX) ? storedMaps.sortedX : [];
  const sy = Array.isArray(storedMaps?.sortedY) ? storedMaps.sortedY : [];
  if (!sx.length || !sy.length) return null;
  const fi = Math.round(Number(ixPrime));
  const fj = Math.round(Number(iyPrime));
  if (fi < 0 || fi >= sx.length || fj < 0 || fj >= sy.length) return null;
  return [sx[fi], sy[fj]];
}

/**
 * 將疊加網格索引 (ix, iy) 映射為「若執行空列／空行縮減後」的索引（與 removeEmptyRowsAndCols 的點映射一致）。
 * @param {number} ix
 * @param {number} iy
 * @param {{ mapX?: object, mapY?: object, sortedX?: number[], sortedY?: number[] }} storedMaps — 可序列化物件（含 mapX/mapY/sortedX/sortedY）
 * @returns {[number, number] | null}
 */
export function remapOverlayCellAfterRemoval(ix, iy, storedMaps) {
  if (!storedMaps || storedMaps.mapX == null || storedMaps.mapY == null) return null;
  const mapX = storedMaps.mapX;
  const mapY = storedMaps.mapY;
  const sortedX = Array.isArray(storedMaps.sortedX) ? storedMaps.sortedX : [];
  const sortedY = Array.isArray(storedMaps.sortedY) ? storedMaps.sortedY : [];
  const px = Math.round(Number(ix));
  const py = Math.round(Number(iy));

  let nx;
  if (px in mapX) {
    nx = mapX[px];
  } else if (sortedX.length > 0) {
    const nearest = sortedX.reduce((prev, curr) =>
      Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev
    );
    nx = mapX[nearest];
  } else {
    return null;
  }

  let ny;
  if (py in mapY) {
    ny = mapY[py];
  } else if (sortedY.length > 0) {
    const nearest = sortedY.reduce((prev, curr) =>
      Math.abs(curr - py) < Math.abs(prev - py) ? curr : prev
    );
    ny = mapY[nearest];
  } else {
    return null;
  }

  return [Math.round(Number(nx)), Math.round(Number(ny))];
}

/**
 * 疊加網格座標必須為整數（ix, iy）。將 segment 的 points / original_points 強制 round。
 * @param {Array} flatSegments
 */
export function ensureOverlayGridCoordinatesInteger(flatSegments) {
  if (!Array.isArray(flatSegments)) return;
  for (const seg of flatSegments) {
    if (Array.isArray(seg.points)) {
      for (const p of seg.points) {
        if (p && p.length >= 2) {
          p[0] = Math.round(Number(p[0]));
          p[1] = Math.round(Number(p[1]));
        }
      }
    }
    if (Array.isArray(seg.original_points)) {
      for (const p of seg.original_points) {
        if (p && p.length >= 2) {
          p[0] = Math.round(Number(p[0]));
          p[1] = Math.round(Number(p[1]));
        }
      }
    }
  }
}

/**
 * taipei_d 已是疊加網格整數座標：不再 floor(x/cellW)，僅建立 Automator 供縮減座標。
 * @param {object} layer
 * @returns {RouteSequenceAutomator|null}
 */
function buildAutomatorForReductionOnly(layer) {
  const raw = layer?.spaceNetworkGridJsonData;
  if (!raw) return null;
  const dataInput = JSON.parse(JSON.stringify(raw));
  const dataFlat = normalizeSpaceNetworkDataToFlatSegments(dataInput);
  if (!dataFlat.length) return null;
  ensureOverlayGridCoordinatesInteger(dataFlat);
  const dataGrouped = groupFlatDataByRoute(dataFlat);
  const [seqData, sortedData] = prepareSequenceAndSortedData(dataGrouped);
  return new RouteSequenceAutomator(sortedData, seqData);
}

/** 收縮後路網上所有頂點（整數格），供 2_9 車站座標對齊到收縮後網格 */
function collectShrunkVertices2D(automator) {
  const list = [];
  const seen = new Set();
  for (const route of automator.data) {
    for (const seg of route.segments) {
      for (const p of seg.points || []) {
        const x = Math.round(p[0]);
        const y = Math.round(p[1]);
        const k = `${x},${y}`;
        if (!seen.has(k)) {
          seen.add(k);
          list.push([x, y]);
        }
      }
    }
  }
  return list;
}

function collapseAxisCoord(coord, map, sorted) {
  const v = Math.round(Number(coord));
  if (v in map) return map[v];
  const nearest = sorted.reduce((prev, curr) =>
    Math.abs(curr - v) < Math.abs(prev - v) ? curr : prev
  );
  return map[nearest];
}

function remapConnectLikePropsFor2_10(
  obj,
  mapX,
  mapY,
  sortedX,
  sortedY,
  _vertices,
  cellW = 1,
  cellH = 1,
  removalMapX = null,
  removalMapY = null,
  removalSortedX = [],
  removalSortedY = []
) {
  if (!obj || typeof obj !== 'object') return;
  const cw = Number(cellW) > 0 ? Number(cellW) : 1;
  const ch = Number(cellH) > 0 ? Number(cellH) : 1;
  // X、Y 獨立做 1D 映射（單調映射，保證不同輸入 → 不同輸出，不會產生重疊）
  const remapAxis = (val, cellSize, rMap, rSorted, cMap, cSorted) => {
    let v = Math.floor(Number(val) / cellSize);
    // removal: 移除空欄列前 → 移除後
    if (rMap) {
      const rv = Math.round(v);
      if (rv in rMap) {
        v = Math.round(Number(rMap[rv]));
      } else if (rSorted && rSorted.length > 0) {
        const nearest = rSorted.reduce((p, c) => (Math.abs(c - rv) < Math.abs(p - rv) ? c : p));
        v = nearest in rMap ? Math.round(Number(rMap[nearest])) : rv;
      }
    }
    // collapse: 移除後 → 稠密 0,1,2,...
    return collapseAxisCoord(v, cMap, cSorted);
  };
  const applyPair = (xg, yg) => {
    if (xg == null || yg == null) return null;
    return {
      x: remapAxis(xg, cw, removalMapX, removalSortedX, mapX, sortedX),
      y: remapAxis(yg, ch, removalMapY, removalSortedY, mapY, sortedY),
    };
  };
  if (obj.x_grid != null && obj.y_grid != null) {
    const out = applyPair(obj.x_grid, obj.y_grid);
    if (out) {
      obj.x_grid = Math.round(Number(out.x));
      obj.y_grid = Math.round(Number(out.y));
    }
  }
  if (obj.tags && typeof obj.tags === 'object') {
    if (obj.tags.x_grid != null && obj.tags.y_grid != null) {
      const out = applyPair(obj.tags.x_grid, obj.tags.y_grid);
      if (out) {
        obj.tags.x_grid = Math.round(Number(out.x));
        obj.tags.y_grid = Math.round(Number(out.y));
      }
    }
  }
}

function remapStationAuxiliaryFor2_10(
  sectionData,
  connectData,
  stationData,
  mapX,
  mapY,
  sortedX,
  sortedY,
  _vertices,
  cellW = 1,
  cellH = 1,
  removalMapX = null,
  removalMapY = null,
  removalSortedX = [],
  removalSortedY = []
) {
  const remap = (obj) =>
    remapConnectLikePropsFor2_10(
      obj,
      mapX,
      mapY,
      sortedX,
      sortedY,
      _vertices,
      cellW,
      cellH,
      removalMapX,
      removalMapY,
      removalSortedX,
      removalSortedY
    );
  if (Array.isArray(connectData)) {
    connectData.forEach(remap);
  }
  if (Array.isArray(stationData)) {
    stationData.forEach(remap);
  }
  if (Array.isArray(sectionData)) {
    sectionData.forEach((sec) => {
      if (sec?.connect_start) remap(sec.connect_start);
      if (sec?.connect_end) remap(sec.connect_end);
    });
  }
}

/**
 * 疊加正規化網格座標：刪除可空列 iy／欄 ix（規則同 getOverlayShrinkageReport／getEmptyOverlayRowsAndCols：
 * 依紅／黑圓點與幾何轉折頂點（見 collectDrawableOverlayOccupancy）；不另做站點圓點疊格之第二道篩選），
 * 再壓縮為自 0 起之稠密索引；寫回 spaceNetworkGridJsonData，並對齊 Section／Connect／Station。
 * 寫入後 layer.overlayRemovalMaps 為 null（座標已是目標空間，繪圖不再二次映射）。
 * layer.gridTooltipMaps 供 hover 顯示「疊加網格座標」↔「縮減疊加網格座標」。
 * layer.overlayRetentionReasons 供操作 Tab：colsDisplay／rowsDisplay 以圖面塌縮後 ix′、iy′ 為主，並附刪空前索引（若不同）。
 * @param {object} layer
 */
export function applyOverlayNormalizedGridCoordinates(layer) {
  if (!layer?.spaceNetworkGridJsonData) return;

  const deep = (v) => (v != null ? JSON.parse(JSON.stringify(v)) : null);
  const sectionClone = deep(layer.spaceNetworkGridJsonData_SectionData) || [];
  const connectClone = deep(layer.spaceNetworkGridJsonData_ConnectData) || [];
  const stationClone = deep(layer.spaceNetworkGridJsonData_StationData) || [];

  const automator = buildAutomatorForReductionOnly(layer);
  if (!automator) {
    layer.emptyOverlayRows = [];
    layer.emptyOverlayCols = [];
    layer.overlayRemovalMaps = null;
    layer.gridTooltipMaps = null;
    layer.overlayRetentionReasons = null;
    return;
  }

  const shrinkReport = getOverlayShrinkageReport(automator, layer);
  const { emptyOverlayRows, emptyOverlayCols } = shrinkReport;
  const hadRemoval = emptyOverlayRows.length > 0 || emptyOverlayCols.length > 0;
  let removalSortedX = [];
  let removalSortedY = [];
  let removalMapX = null;
  let removalMapY = null;
  if (hadRemoval) {
    const rmPre = buildOverlayRemovalMaps(automator, emptyOverlayRows, emptyOverlayCols);
    removalSortedX = rmPre.sortedX;
    removalSortedY = rmPre.sortedY;
    removalMapX = rmPre.mapX;
    removalMapY = rmPre.mapY;
    automator.removeEmptyRowsAndCols(emptyOverlayRows, emptyOverlayCols);
    layer.emptyOverlayRows = emptyOverlayRows;
    layer.emptyOverlayCols = emptyOverlayCols;
  } else {
    layer.emptyOverlayRows = [];
    layer.emptyOverlayCols = [];
  }
  layer.overlayRemovalMaps = null;

  const collapse = buildCollapseMapsFromAutomator(automator);
  const { mapX, mapY, sortedX, sortedY } = collapse;
  const { colsDisplay, rowsDisplay } = buildOverlayRetentionDisplayTables(
    shrinkReport.retainedColReasons,
    shrinkReport.retainedRowReasons,
    hadRemoval,
    removalMapX,
    removalMapY,
    mapX,
    mapY
  );
  layer.overlayRetentionReasons = {
    cols: shrinkReport.retainedColReasons,
    rows: shrinkReport.retainedRowReasons,
    colsDisplay,
    rowsDisplay,
    boundsPreRemoval: shrinkReport.boundsPreRemoval,
    phase: 'b_to_c_overlay',
  };
  layer.gridTooltipMaps = {
    hadRemoval,
    /** 供 tooltip 說明：與縮減數值相同時仍可證明有跑過偵測／正規化 */
    removedEmptyRowCount: emptyOverlayRows.length,
    removedEmptyColCount: emptyOverlayCols.length,
    removalSortedX: hadRemoval ? removalSortedX : null,
    removalSortedY: hadRemoval ? removalSortedY : null,
    removalMapX: hadRemoval ? removalMapX : null,
    removalMapY: hadRemoval ? removalMapY : null,
    collapseMapX: collapse.mapX,
    collapseMapY: collapse.mapY,
    collapseSortedX: sortedX,
    collapseSortedY: sortedY,
  };
  const shrunkVertices = collectShrunkVertices2D(automator);
  const [, colData] = automator.generateCollapsedView();
  const finalFlatData = flattenData(colData);

  ensureOverlayGridCoordinatesInteger(finalFlatData);
  syncSegmentNodesFromPoints(finalFlatData);
  layer.spaceNetworkGridJsonData = finalFlatData;

  const ms = layer.minSpacingOverlayCell;
  const { cellW, cellH } =
    ms && Number(ms.cellW) > 0 && Number(ms.cellH) > 0
      ? { cellW: Number(ms.cellW), cellH: Number(ms.cellH) }
      : getMinSpacingCellSizesFromLayer(layer);

  remapStationAuxiliaryFor2_10(
    sectionClone,
    connectClone,
    stationClone,
    mapX,
    mapY,
    sortedX,
    sortedY,
    shrunkVertices,
    cellW,
    cellH,
    hadRemoval ? removalMapX : null,
    hadRemoval ? removalMapY : null,
    hadRemoval ? removalSortedX : [],
    hadRemoval ? removalSortedY : []
  );
  layer.spaceNetworkGridJsonData_SectionData = sectionClone;
  layer.spaceNetworkGridJsonData_ConnectData = connectClone;
  layer.spaceNetworkGridJsonData_StationData = stationClone;
}

/**
 * taipei_f／taipei_g：刪除「整欄／整列皆無黑點、紅點或路線轉折頂點」之空欄列，並將路段與 Section／Connect／Station 座標塌縮為連續索引。
 * 規則與疊加網格縮減相同（見 applyOverlayNormalizedGridCoordinates／collectDrawableOverlayOccupancy）。
 * @param {object} layer
 * @returns {{ removedRows: number, removedCols: number, hadRemoval: boolean } | null}
 */
export function applyTaipeiFPruneEmptyGridRowsCols(layer) {
  if (!layer?.spaceNetworkGridJsonData?.length) {
    return { removedRows: 0, removedCols: 0, hadRemoval: false };
  }
  if (!isTaipeiTestFghiLayerId(layer.layerId)) {
    console.warn(
      'applyTaipeiFPruneEmptyGridRowsCols：僅適用 taipei_f～i（含測試2 之 f2～i2）'
    );
    return null;
  }
  applyOverlayNormalizedGridCoordinates(layer);
  if (layer.overlayRetentionReasons && typeof layer.overlayRetentionReasons === 'object') {
    layer.overlayRetentionReasons.phase = 'taipei_f_g_grid_prune';
  }
  const nr = layer.emptyOverlayRows?.length ?? 0;
  const nc = layer.emptyOverlayCols?.length ?? 0;
  return { removedRows: nr, removedCols: nc, hadRemoval: nr > 0 || nc > 0 };
}

/** 塌縮後的 points 與 nodes 對齊，利於未開車站配置時仍從 nodes 畫黑點 */
function syncSegmentNodesFromPoints(flatSegments) {
  if (!Array.isArray(flatSegments)) return;
  for (const seg of flatSegments) {
    if (!seg?.points?.length) continue;
    if (!Array.isArray(seg.nodes) || seg.nodes.length !== seg.points.length) continue;
    for (let i = 0; i < seg.points.length; i++) {
      const n = seg.nodes[i];
      const pt = seg.points[i];
      if (!n || !pt) continue;
      if ('x_grid' in n) n.x_grid = pt[0];
      if ('y_grid' in n) n.y_grid = pt[1];
      if (n.tags && typeof n.tags === 'object') {
        if ('x_grid' in n.tags) n.tags.x_grid = pt[0];
        if ('y_grid' in n.tags) n.tags.y_grid = pt[1];
      }
      if (n.display_x != null) n.display_x = pt[0];
      if (n.display_y != null) n.display_y = pt[1];
    }
  }
}

// ==========================================
// 7. 主程式（讀取 taipei_d → 輸出 taipei_e）
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_d_to_e_test(_jsonData) {
  const dataStore = useDataStore();
  const execId = dataStore.taipeiTestExecuteSourceLayerId || 'taipei_d';
  const step = resolveTaipeiTestPipelineStep(execId);
  if (!step || step.role !== 'd') {
    throw new Error(`execute_d_to_e_test：無效的來源圖層 ${execId}（須為 taipei_d 或 taipei_d2）`);
  }
  const { src: srcD, dst: dstE } = step;
  const test2_10Layer = dataStore.findLayerById(srcD);
  const test2_11Layer = dataStore.findLayerById(dstE);

  console.log('='.repeat(60));
  console.log(`📂 [設定] 測試流程：縮減座標 (${srcD} → ${dstE})`);
  console.log(`   - 輸入: ${srcD}（疊加網格整數座標）`);
  console.log(`   - 輸出: ${dstE} 圖層`);
  console.log('='.repeat(60));

  if (!test2_10Layer || !test2_10Layer.spaceNetworkGridJsonData) {
    console.error(`❌ 錯誤: 找不到 ${srcD} 的資料 (請先執行上一步)`);
    throw new Error(`找不到 ${srcD} 的資料 (請先執行上一步)`);
  }

  try {
    console.log(`🚀 讀取資料: ${srcD} 圖層`);

    // 僅縮減座標：不重做疊加網格 floor(x/cellW)（taipei_d 已是整數疊加格）
    console.log('📐 縮減座標：偵測空列／空行並塌縮...');
    const automator = buildAutomatorForReductionOnly(test2_10Layer);

    if (!automator) {
      throw new Error(`${srcD} 沒有可處理的路段資料（points）`);
    }

    const shrinkReport = getOverlayShrinkageReport(automator, test2_10Layer);
    const { emptyOverlayRows, emptyOverlayCols } = shrinkReport;
    const hadRemoval = emptyOverlayRows.length > 0 || emptyOverlayCols.length > 0;
    let removalMapX = null;
    let removalMapY = null;
    let removalSortedX = [];
    let removalSortedY = [];
    let overlayRemovalMaps = null;
    if (hadRemoval) {
      const rm = buildOverlayRemovalMaps(automator, emptyOverlayRows, emptyOverlayCols);
      removalMapX = rm.mapX;
      removalMapY = rm.mapY;
      removalSortedX = rm.sortedX;
      removalSortedY = rm.sortedY;
      overlayRemovalMaps = {
        mapX: rm.mapX,
        mapY: rm.mapY,
        sortedX: rm.sortedX,
        sortedY: rm.sortedY,
        emptyOverlayRows,
        emptyOverlayCols,
      };
    }

    test2_10Layer.emptyOverlayRows = emptyOverlayRows;
    test2_10Layer.emptyOverlayCols = emptyOverlayCols;
    test2_10Layer.overlayRemovalMaps = overlayRemovalMaps;

    const ms = test2_10Layer.minSpacingOverlayCell;
    const { cellW, cellH } =
      ms && Number(ms.cellW) > 0 && Number(ms.cellH) > 0
        ? { cellW: Number(ms.cellW), cellH: Number(ms.cellH) }
        : getMinSpacingCellSizesFromLayer(test2_10Layer);

    if (emptyOverlayRows.length > 0 || emptyOverlayCols.length > 0) {
      console.log(
        `📐 縮減網格: 空列 ${emptyOverlayRows.length} 個, 空行 ${emptyOverlayCols.length} 個`
      );
    }

    // 移除空列／空行並重新映射
    if (emptyOverlayRows.length > 0 || emptyOverlayCols.length > 0) {
      console.log(
        `🗑️ 移除空列/空行: 空列 ${emptyOverlayRows.length} 個 (${emptyOverlayRows.join(', ')}), 空行 ${emptyOverlayCols.length} 個 (${emptyOverlayCols.join(', ')})`
      );
      automator.removeEmptyRowsAndCols(emptyOverlayRows, emptyOverlayCols);
      console.log('✅ 空列/空行已移除，座標已重新映射。');
    }

    // 與 generateCollapsedView 相同的塌縮映射（在 showResults 前建立，因 showResults 不會改 this.data）
    // 注意：此映射基於移除空列/空行後的座標
    const { mapX, mapY, sortedX, sortedY } = buildCollapseMapsFromAutomator(automator);
    const { colsDisplay, rowsDisplay } = buildOverlayRetentionDisplayTables(
      shrinkReport.retainedColReasons,
      shrinkReport.retainedRowReasons,
      hadRemoval,
      removalMapX,
      removalMapY,
      mapX,
      mapY
    );
    const retentionPayload = {
      cols: shrinkReport.retainedColReasons,
      rows: shrinkReport.retainedRowReasons,
      colsDisplay,
      rowsDisplay,
      boundsPreRemoval: shrinkReport.boundsPreRemoval,
      phase: 'd_to_e',
    };
    // taipei_d 圖面仍為 c→d 資料，不覆寫其 retention（保持與圖面座標一致）；僅 taipei_e 使用 d→e 結果
    const shrunkVertices = collectShrunkVertices2D(automator);

    // 4. 顯示結果並獲取最終數據
    console.log('📊 繪製最終結果圖...');
    const finalFlatData = automator.showResults();

    // 5. 寫入 taipei_e
    if (!test2_11Layer) {
      throw new Error(`找不到 ${dstE} 圖層`);
    }

    // 車站配置：2_10 的 Section/Connect/Station 對齊「收縮後 + 格網塌縮」座標
    const deep = (v) => (v != null ? JSON.parse(JSON.stringify(v)) : null);
    const sectionClone = deep(test2_10Layer.spaceNetworkGridJsonData_SectionData) || [];
    const connectClone = deep(test2_10Layer.spaceNetworkGridJsonData_ConnectData) || [];
    const stationClone = deep(test2_10Layer.spaceNetworkGridJsonData_StationData) || [];
    remapStationAuxiliaryFor2_10(
      sectionClone,
      connectClone,
      stationClone,
      mapX,
      mapY,
      sortedX,
      sortedY,
      shrunkVertices,
      cellW,
      cellH,
      hadRemoval ? removalMapX : null,
      hadRemoval ? removalMapY : null,
      hadRemoval ? removalSortedX : [],
      hadRemoval ? removalSortedY : []
    );
    test2_11Layer.spaceNetworkGridJsonData_SectionData = sectionClone;
    test2_11Layer.spaceNetworkGridJsonData_ConnectData = connectClone;
    test2_11Layer.spaceNetworkGridJsonData_StationData = stationClone;
    test2_11Layer.showStationPlacement =
      !!test2_10Layer.showStationPlacement &&
      Array.isArray(sectionClone) &&
      sectionClone.length > 0;

    // 網格正規化結果座標為疊加網格座標，必須為整數
    ensureOverlayGridCoordinatesInteger(finalFlatData);
    syncSegmentNodesFromPoints(finalFlatData);

    test2_11Layer.spaceNetworkGridJsonData = finalFlatData;
    // 網格正規化結果座標即為最小間距疊加網格座標；縮減時移除的空列／空行供操作 Tab 顯示
    test2_11Layer.emptyOverlayRows = emptyOverlayRows;
    test2_11Layer.emptyOverlayCols = emptyOverlayCols;
    test2_11Layer.overlayRetentionReasons = retentionPayload;
    // gridTooltipMaps 供黑點表格「縮減前／刪減後」座標對照（與 applyOverlayNormalizedGridCoordinates 一致）
    test2_11Layer.gridTooltipMaps = {
      hadRemoval,
      removedEmptyRowCount: emptyOverlayRows.length,
      removedEmptyColCount: emptyOverlayCols.length,
      removalSortedX: hadRemoval ? removalSortedX : null,
      removalSortedY: hadRemoval ? removalSortedY : null,
      removalMapX: hadRemoval ? removalMapX : null,
      removalMapY: hadRemoval ? removalMapY : null,
      collapseMapX: mapX,
      collapseMapY: mapY,
      collapseSortedX: sortedX,
      collapseSortedY: sortedY,
    };
    // 與 taipei_d 同步，供 hover 與座標對照
    test2_11Layer.minSpacingOverlayCell = test2_10Layer.minSpacingOverlayCell;
    console.log(`💾 結果已傳給 ${dstE} 圖層（含車站配置座標與 nodes 同步）`);

    if (!test2_11Layer.visible) {
      test2_11Layer.visible = true;
      dataStore.saveLayerState(dstE, { visible: true });
    }

    test2_11Layer.isLoaded = true;

    const dashboardData = {
      inputSegmentCount: flattenData(automator.data).length,
      outputSegmentCount: finalFlatData.length,
      totalPoints: automator.sequence.length,
      rounds: automator.roundCount,
      source: srcD,
    };

    test2_11Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
