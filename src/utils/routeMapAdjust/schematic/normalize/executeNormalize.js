/**
 * ⑨ 示意圖佈局（正規化）— 一鍵執行三步
 *
 * Step 1 — 座標正規化（四分樹）
 *   buildConnectSkeleton 去除黑站 → buildSnapLonLatFromC3Segments 建四分樹
 *   → 整數格 d3（與 c3 同結構，供 reinsertBlackStations 直接用）
 *   → analyzeCoordNormalizeTopology 比對 c3 vs d3 偵測鄰線錯邊
 *
 * Step 2 — 鄰線錯邊修正（有錯邊才執行；改後做交叉計數，若新增交叉則 revert）
 *
 * Step 3 — 刪空欄列（有拓撲比對結果才執行；同樣改前後交叉計數，新增交叉則 revert）
 *
 * 最後 reinsertBlackStations → 後矯正（黑點不可落在別條路線幾何線段上；
 *   若有，沿自身路線微量位移至最近無衝突位置，不改拓樸）
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildConnectSkeleton } from '../input.js';
import { buildSchematicGraph, splitHighDegreeNodes } from '../graph.js';
import { reinsertBlackStations, writeSchematicResultToLayer } from '../assemble.js';
import { buildSnapLonLatFromC3Segments } from '@/utils/taipeiTest4/c3ToD3CoordNormalize.js';
import {
  analyzeCoordNormalizeTopology,
  applyNeighborSideTopologyFix,
} from '@/utils/layers/json_grid_coord_normalized/coordNormalizeTopology.js';
import { pruneGridLinesWithoutConnectVertices } from '@/utils/taipeiDataProcTest3/f3ToG3PruneEmptyGridLines.js';

const LAYER_ID = 'schematic_rma_normalize';

// ── 幾何工具 ─────────────────────────────────────────────────────────────────

const rdXY = (p) =>
  Array.isArray(p)
    ? [Number(p[0]), Number(p[1])]
    : [Number(p?.x ?? 0), Number(p?.y ?? 0)];

/** 2D 叉積 */
const cz = (ax, ay, bx, by) => ax * by - ay * bx;

/** 兩線段是否交叉（共端點不算，純粹內部交叉） */
function segsCross(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const denom = cz(rx, ry, sx, sy);
  if (Math.abs(denom) < 1e-9) {
    // 共線：偵測重疊線段
    if (Math.abs(cz(rx, ry, c[0] - a[0], c[1] - a[1])) > 1e-9) return false;
    const L = rx * rx + ry * ry;
    if (L < 1e-18) return false;
    const tc = (rx * (c[0] - a[0]) + ry * (c[1] - a[1])) / L;
    const td = (rx * (d[0] - a[0]) + ry * (d[1] - a[1])) / L;
    const lo = Math.max(0, Math.min(tc, td));
    const hi = Math.min(1, Math.max(tc, td));
    return hi - lo > 1e-6;
  }
  const t = cz(c[0] - a[0], c[1] - a[1], sx, sy) / denom;
  const u = cz(c[0] - a[0], c[1] - a[1], rx, ry) / denom;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

/**
 * 計算 flat segments 中跨路線的交叉線段對數。
 * 共同端點不算（connect 節點常共享位置）。
 */
function countCrossings(segs) {
  const subs = [];
  for (let si = 0; si < segs.length; si++) {
    const pts = (segs[si].points || []).map(rdXY);
    const routeName = segs[si].route_name ?? segs[si].name ?? '';
    for (let k = 1; k < pts.length; k++) {
      subs.push({ si, routeName, a: pts[k - 1], b: pts[k] });
    }
  }
  let n = 0;
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      if (subs[i].si === subs[j].si) continue;
      if (subs[i].routeName === subs[j].routeName) continue;
      if (segsCross(subs[i].a, subs[i].b, subs[j].a, subs[j].b)) n++;
    }
  }
  return n;
}

// ── 四分樹 snap 套用 ──────────────────────────────────────────────────────────

function applySnapToSkeleton(flat, snapLonLat) {
  for (const seg of flat) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    for (let i = 0; i < pts.length; i++) {
      const [lon, lat] = rdXY(pts[i]);
      const [gx, gy] = snapLonLat(lon, lat);
      if (Array.isArray(pts[i])) { pts[i][0] = gx; pts[i][1] = gy; }
      else { pts[i].x = gx; pts[i].y = gy; }
      const nd = nodes[i];
      if (nd) {
        nd.x_grid = gx; nd.y_grid = gy;
        if (!nd.tags) nd.tags = {};
        nd.tags.x_grid = gx; nd.tags.y_grid = gy;
      }
    }
    const applyEp = (ep, pt) => {
      if (!ep || !pt) return;
      const [gx, gy] = rdXY(pt);
      ep.x_grid = gx; ep.y_grid = gy;
      if (!ep.tags) ep.tags = {};
      ep.tags.x_grid = gx; ep.tags.y_grid = gy;
    };
    applyEp(seg.properties_start, pts[0]);
    applyEp(seg.properties_end, pts[pts.length - 1]);
  }
}

// ── 黑點後矯正：不可落在別條路線的幾何線段上 ────────────────────────────────

/**
 * 判斷點 (px,py) 是否嚴格落在線段 (ax,ay)→(bx,by) 的內部
 * （端點本身不算：connect 節點共享位置是正常的）。
 */
function pointStrictlyOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return false;
  const cross = (px - ax) * dy - (py - ay) * dx;
  if (Math.abs(cross) > 1e-6 * Math.sqrt(len2)) return false; // 不共線
  const t = (dx * (px - ax) + dy * (py - ay)) / len2;
  return t > 1e-6 && t < 1 - 1e-6; // 嚴格內部
}

/**
 * 從 connect 骨架（2-point 段）建邊表，供黑點後矯正用。
 * 必須用 normalizedFlat（骨架），不可用 fullFlat（已插入黑點）——
 * 否則邊被黑點切成小段後，黑點落在切分端點時 t=0/1，pointStrictlyOnSeg 偵測不到。
 */
function buildSkeletonEdges(skeletonFlat) {
  const edges = [];
  for (const seg of skeletonFlat) {
    const rn = seg.route_name ?? seg.name ?? '';
    const pts = (seg.points || []).map(rdXY);
    for (let k = 1; k < pts.length; k++) {
      edges.push({ routeName: rn, ax: pts[k-1][0], ay: pts[k-1][1], bx: pts[k][0], by: pts[k][1] });
    }
  }
  return edges;
}

/**
 * 從骨架段端點建「其他路線的 connect 節點位置」集合。
 * 黑點若恰好落在別條路線的整數 connect 點上，也算衝突（即使不在任一邊的嚴格內部）。
 */
function buildOtherRouteConnectSet(skeletonFlat) {
  // key: "x,y"  value: Set<routeName>
  const pos = new Map();
  for (const seg of skeletonFlat) {
    const rn = seg.route_name ?? seg.name ?? '';
    const pts = (seg.points || []).map(rdXY);
    for (const pt of [pts[0], pts[pts.length - 1]]) {
      const k = `${pt[0]},${pt[1]}`;
      if (!pos.has(k)) pos.set(k, new Set());
      pos.get(k).add(rn);
    }
  }
  return pos;
}

/**
 * 黑點後矯正：若某黑點（_forceDrawBlackDot）落在別條路線的
 *   ① 骨架邊的嚴格內部，或 ② 別條路線的 connect 節點位置，
 * 則沿自身路線微量往一端位移（±0.3 格，最多 8 次），直到脫離衝突。
 * 不改拓樸，不移動 connect 節點。
 * @param {Array} fullFlat - reinsertBlackStations 後的完整路段（含黑點）
 * @param {Array} normalizedFlat - 放入黑點之前的骨架（connect→connect 2-point 段）
 */
function fixBlackDotsOnWrongRoutes(fullFlat, normalizedFlat) {
  const skEdges = buildSkeletonEdges(normalizedFlat);
  const otherConnects = buildOtherRouteConnectSet(normalizedFlat);
  let fixCount = 0;

  const isConflict = (px, py, ownRoute) => {
    // 嚴格在別條路線骨架邊內部
    if (skEdges.some(e => e.routeName !== ownRoute && pointStrictlyOnSeg(px, py, e.ax, e.ay, e.bx, e.by)))
      return true;
    // 落在別條路線的 connect 節點位置（整數格點碰撞）
    const k = `${px},${py}`;
    const routes = otherConnects.get(k);
    return !!routes && [...routes].some(r => r !== ownRoute);
  };

  for (const seg of fullFlat) {
    const rn = seg.route_name ?? seg.name ?? '';
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    const segPts = pts.map(rdXY);
    const n = segPts.length;
    if (n < 2) continue;

    const cum = [0];
    for (let k = 1; k < n; k++) {
      const dx = segPts[k][0] - segPts[k-1][0], dy = segPts[k][1] - segPts[k-1][1];
      cum.push(cum[k-1] + Math.hypot(dx, dy));
    }
    const total = cum[n-1];
    if (total < 1e-9) continue;

    for (let i = 1; i < n - 1; i++) {
      const nd = nodes[i];
      if (!nd?.tags?._forceDrawBlackDot) continue;

      const [px, py] = segPts[i];
      if (!isConflict(px, py, rn)) continue;

      const BASE = 0.3;
      let moved = false;
      const s0 = cum[i];
      for (let attempt = 1; attempt <= 8 && !moved; attempt++) {
        const delta = BASE * attempt;
        for (const dir of [1, -1]) {
          const sNew = s0 + dir * delta;
          if (sNew <= 1e-6 || sNew >= total - 1e-6) continue;
          let newPt = null;
          for (let k = 1; k < n; k++) {
            if (sNew <= cum[k] + 1e-9) {
              const frac = (sNew - cum[k-1]) / (cum[k] - cum[k-1] + 1e-18);
              newPt = [
                segPts[k-1][0] + frac * (segPts[k][0] - segPts[k-1][0]),
                segPts[k-1][1] + frac * (segPts[k][1] - segPts[k-1][1]),
              ];
              break;
            }
          }
          if (!newPt) continue;
          const [nx, ny] = newPt;
          if (!isConflict(nx, ny, rn)) {
            if (Array.isArray(pts[i])) { pts[i][0] = nx; pts[i][1] = ny; }
            else { pts[i].x = nx; pts[i].y = ny; }
            segPts[i] = [nx, ny];
            if (nd) {
              nd.x_grid = nx; nd.y_grid = ny;
              if (!nd.tags) nd.tags = {};
              nd.tags.x_grid = nx; nd.tags.y_grid = ny;
            }
            cum[i] = cum[i-1] + Math.hypot(nx - segPts[i-1][0], ny - segPts[i-1][1]);
            for (let k = i + 1; k < n; k++) {
              const dk = Math.hypot(segPts[k][0] - segPts[k-1][0], segPts[k][1] - segPts[k-1][1]);
              cum[k] = cum[k-1] + dk;
            }
            fixCount++;
            moved = true;
            break;
          }
        }
      }
      if (!moved) {
        console.warn(`[⑨後矯正] 無法移開黑點 (${px},${py}) @ route=${rn}，保持原位。`);
      }
    }
  }

  if (fixCount > 0) {
    console.log(`[⑨後矯正] 共矯正 ${fixCount} 個黑點（移離別條路線幾何線段）。`);
  }
}

// ── 主執行函式 ────────────────────────────────────────────────────────────────

export function executeNormalizeRma() {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(LAYER_ID);
  if (!layer) {
    console.warn('executeNormalizeRma：找不到圖層 schematic_rma_normalize');
    return false;
  }

  const geojson = layer.geojsonData;
  if (!geojson?.features?.length) {
    console.warn('executeNormalizeRma：圖層尚無輸入資料，請先載入骨架。');
    return false;
  }

  // ── 讀路網 → flat segments（含 lon/lat） ─────────────────────────────────
  let fields;
  try {
    fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
  } catch (e) {
    console.error('executeNormalizeRma：GeoJSON → flat 失敗', e);
    return false;
  }
  const baseFlat = fields?.spaceNetworkGridJsonData;
  if (!Array.isArray(baseFlat) || baseFlat.length === 0) {
    console.warn('executeNormalizeRma：上游路網為空。');
    return false;
  }

  // ── Step 1-a：去除黑站 → c3（lon/lat 骨架）+ sections（供最後放回） ────────
  const { skeletonFlat: c3Flat, sections } = buildConnectSkeleton(baseFlat);
  if (!c3Flat?.length) {
    console.warn('executeNormalizeRma：骨架無 connect 頂點。');
    return false;
  }

  // ── Step 1-b：四分樹正規化 → d3（整數格，與 c3 同結構） ─────────────────────
  const snapResult = buildSnapLonLatFromC3Segments(c3Flat);
  if (!snapResult) {
    console.warn('executeNormalizeRma：四分樹建立失敗。');
    return false;
  }
  const d3Flat = JSON.parse(JSON.stringify(c3Flat));
  applySnapToSkeleton(d3Flat, snapResult.snapLonLat);

  // ── Step 1-c：記錄 c3 快照 + 拓撲比對 ────────────────────────────────────
  try {
    layer.jsonGridCoordNormalizeReferenceC3 = JSON.parse(JSON.stringify(c3Flat));
  } catch {
    layer.jsonGridCoordNormalizeReferenceC3 = null;
  }
  const topologyCheck = analyzeCoordNormalizeTopology(c3Flat, d3Flat);
  console.log(
    `[⑨] 拓撲比對：${topologyCheck.summaryZh}`,
    `structMatch=${topologyCheck.structMatch} hasNeighborFlips=${topologyCheck.hasNeighborFlips}`
  );

  // ── Step 2：鄰線錯邊修正（有問題才執行；改後計算交叉，有增加則 revert） ───────
  let normalizedFlat = d3Flat;
  let neighborFixApplied = false;
  let fixLog = null;

  if (topologyCheck.hasNeighborFlips) {
    const crossBefore = countCrossings(d3Flat);
    try {
      const fixResult = applyNeighborSideTopologyFix(c3Flat, d3Flat);
      if (fixResult.ok && Array.isArray(fixResult.patched) && fixResult.patched.length) {
        const crossAfter = countCrossings(fixResult.patched);
        if (crossAfter <= crossBefore) {
          normalizedFlat = fixResult.patched;
          neighborFixApplied = true;
          fixLog = fixResult.moveLines || null;
          console.log(
            `[⑨] 鄰線錯邊修正完成，${fixResult.iterations} 輪，無新增交叉（${crossBefore}→${crossAfter}）。`
          );
        } else {
          console.warn(
            `[⑨] 鄰線錯邊修正後新增交叉 ${crossAfter - crossBefore} 處，revert，保留 d3 原始結果。`
          );
        }
      } else {
        console.warn('[⑨] 鄰線錯邊修正未成功。', fixResult.errorZh || '');
      }
    } catch (e) {
      console.error('[⑨] 鄰線錯邊修正例外', e);
    }
  }

  // ── Step 3：刪空欄列（有拓撲比對結果才執行；同樣保拓樸） ────────────────────
  let prunedCols = 0, prunedRows = 0;

  if (topologyCheck.structMatch) {
    const crossBefore = countCrossings(normalizedFlat);
    try {
      const pruneResult = pruneGridLinesWithoutConnectVertices(
        JSON.parse(JSON.stringify(normalizedFlat))
      );
      if (pruneResult?.segments?.length) {
        const crossAfter = countCrossings(pruneResult.segments);
        if (crossAfter <= crossBefore) {
          normalizedFlat = pruneResult.segments;
          prunedCols = pruneResult.colCount ?? 0;
          prunedRows = pruneResult.rowCount ?? 0;
          if (prunedCols > 0 || prunedRows > 0)
            console.log(`[⑨] 刪去空欄 ${prunedCols} 欄、空列 ${prunedRows} 列，無新增交叉。`);
        } else {
          console.warn(
            `[⑨] 刪空欄列後新增交叉 ${crossAfter - crossBefore} 處，revert，保留刪格前結果。`
          );
        }
      }
    } catch (e) {
      console.error('[⑨] 刪空欄列例外', e);
    }
  }

  // ── 建共軌圖（路線間走向偵測） ────────────────────────────────────────────
  let graph = buildSchematicGraph(normalizedFlat);
  try { graph = splitHighDegreeNodes(graph); } catch { /* 非致命 */ }

  // ── 放回黑站（沿各自路線弧長插值，不改 connect 拓樸） ───────────────────────
  const fullFlat = reinsertBlackStations(normalizedFlat, sections);

  // ── 後矯正：確保黑點不落在別條路線的幾何線段內部，也不與別條 connect 節點重疊 ──
  // 使用 normalizedFlat（骨架）而非 fullFlat（已插黑點），避免邊被黑點切段導致誤判。
  fixBlackDotsOnWrongRoutes(fullFlat, normalizedFlat);

  // ── 寫回圖層 ───────────────────────────────────────────────────────────────
  const result = writeSchematicResultToLayer(LAYER_ID, fullFlat, {
    sourceLayerId: LAYER_ID,
    coordNormalize: true,
    _schematicGraph: graph,
    topologyPreserved: topologyCheck.topologyPreserved,
    hasNeighborFlips: topologyCheck.hasNeighborFlips,
    neighborFlipCount: topologyCheck.neighborFlipCount,
    neighborFixApplied,
    fixLog,
    prunedCols,
    prunedRows,
    structMatch: topologyCheck.structMatch,
    gridCols: snapResult.sortedX.length - 1,
    gridRows: snapResult.sortedY.length - 1,
  });
  return result.ok !== false;
}
