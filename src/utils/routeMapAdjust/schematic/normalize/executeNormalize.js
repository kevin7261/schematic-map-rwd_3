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

function coordKey(pt) {
  const [x, y] = rdXY(pt);
  return `${x},${y}`;
}

/**
 * 檢查正規化是否把「原本不同座標」的骨架頂點壓成同一格。
 * 原本同座標的 junction 可共點；不同原始座標變同格則視為拓撲被改。
 */
function findNewCoincidentSkeletonVertices(referenceFlat, candidateFlat) {
  const byOut = new Map();
  const nSegs = Math.min(referenceFlat?.length ?? 0, candidateFlat?.length ?? 0);
  for (let si = 0; si < nSegs; si++) {
    const refPts = referenceFlat[si]?.points || [];
    const outPts = candidateFlat[si]?.points || [];
    const nPts = Math.min(refPts.length, outPts.length);
    for (let pi = 0; pi < nPts; pi++) {
      const outKey = coordKey(outPts[pi]);
      const refKey = coordKey(refPts[pi]);
      if (!byOut.has(outKey)) {
        byOut.set(outKey, { refKeys: new Set(), samples: [] });
      }
      const rec = byOut.get(outKey);
      rec.refKeys.add(refKey);
      if (rec.samples.length < 4) rec.samples.push({ si, pi, refKey });
    }
  }
  return [...byOut.entries()]
    .filter(([, rec]) => rec.refKeys.size > 1)
    .map(([outKey, rec]) => ({ outKey, refKeys: [...rec.refKeys], samples: rec.samples }));
}

function warnNewCoincidentSkeletonVertices(stage, collisions) {
  if (!Array.isArray(collisions) || collisions.length === 0) return;
  console.warn(
    `[⑨] ${stage} 會把 ${collisions.length} 組原本不同的骨架點壓成共點，已阻止以保拓撲。`,
    collisions.slice(0, 5)
  );
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
 * ⑨ 骨架後矯正（**在放回黑站之前**，只動骨架的彩色頂點 🔴🔵🟡🟣＝各 segment 端點；與黑點無關，
 * 黑站是整個調整完才放回）。若某頂點出現以下任一狀況 →
 *   ① 落在**別條路線邊的嚴格內部**、② 與**別條路線頂點同格碰撞**、③ 其相鄰段與**別條路線交叉**，
 * 則把該頂點**（含所有同座標共點＝整個 junction 連動）位移到最近鄰格**（Chebyshev 半徑 1→R），
 * 取「落線＋碰撞＋交叉」總分最小者。
 *
 * 保拓撲：同座標頂點一起移（junction 不拆）、不改連通順序、且**只在能改善時才移**（新分數 < 原分數），
 * 故不破壞原拓撲、不新增交叉。
 * @param {Array} skeletonFlat - connect→connect 骨架（放黑站前）
 */
function adjustSkeletonPointsOnRouteOrCrossing(skeletonFlat) {
  const routeOf = (si) => skeletonFlat[si]?.route_name ?? skeletonFlat[si]?.name ?? '';
  /** 同座標頂點分組：coordKey → [{si,pi}]（junction 連動單位）。 */
  const buildGroups = () => {
    const g = new Map();
    for (let si = 0; si < skeletonFlat.length; si++) {
      const pts = skeletonFlat[si]?.points;
      if (!Array.isArray(pts)) continue;
      for (let pi = 0; pi < pts.length; pi++) {
        const [x, y] = rdXY(pts[pi]);
        const k = `${x},${y}`;
        if (!g.has(k)) g.set(k, []);
        g.get(k).push({ si, pi });
      }
    }
    return g;
  };
  const buildEdges = () => {
    const E = [];
    for (let si = 0; si < skeletonFlat.length; si++) {
      const pts = skeletonFlat[si]?.points;
      if (!Array.isArray(pts)) continue;
      const arr = pts.map(rdXY);
      for (let k = 1; k < arr.length; k++) E.push({ si, pi: k - 1, rn: routeOf(si), a: arr[k - 1], b: arr[k] });
    }
    return E;
  };
  /** 頂點群放在 (x,y) 時之不良分數（refs＝共點群、ownRoutes＝其所屬路線、edges＝全邊）。 */
  const badnessAt = (x, y, refs, ownRoutes, edges) => {
    const moving = new Set(refs.map((r) => `${r.si}:${r.pi}`));
    let bad = 0;
    // ① 落在別條路線邊嚴格內部
    for (const e of edges) {
      if (ownRoutes.has(e.rn)) continue;
      if (pointStrictlyOnSeg(x, y, e.a[0], e.a[1], e.b[0], e.b[1])) { bad += 1; break; }
    }
    // ② 與「非本群」任一頂點同格（含同路線：避免併點改拓撲）
    for (let si = 0; si < skeletonFlat.length; si++) {
      const pts = skeletonFlat[si]?.points;
      if (!Array.isArray(pts)) continue;
      for (let pi = 0; pi < pts.length; pi++) {
        if (moving.has(`${si}:${pi}`)) continue;
        const [vx, vy] = rdXY(pts[pi]);
        if (vx === x && vy === y) { bad += 1; }
      }
    }
    // ③ 相鄰段與別條路線交叉（以候選位置 (x,y) 重算入射邊）
    for (const r of refs) {
      const pts = skeletonFlat[r.si]?.points;
      if (!Array.isArray(pts)) continue;
      const rn = routeOf(r.si);
      for (const adj of [r.pi - 1, r.pi + 1]) {
        if (adj < 0 || adj >= pts.length) continue;
        if (moving.has(`${r.si}:${adj}`)) continue; // 鄰點亦在移動群 → 該段整段移，略過
        const nb = rdXY(pts[adj]);
        for (const e of edges) {
          if (e.rn === rn) continue; // 只看別條路線
          if (moving.has(`${e.si}:${e.pi}`) || moving.has(`${e.si}:${e.pi + 1}`)) continue; // 本群自身入射邊
          if (segsCross([x, y], nb, e.a, e.b)) bad += 1;
        }
      }
    }
    return bad;
  };

  const groups = buildGroups();
  let fixCount = 0;
  let failCount = 0;
  const MAX_R = 6;
  for (const [key, refs] of groups) {
    const [ox, oy] = key.split(',').map(Number);
    const ownRoutes = new Set(refs.map((r) => routeOf(r.si)));
    const edges = buildEdges(); // 反映前面已套用之移動
    const orig = badnessAt(ox, oy, refs, ownRoutes, edges);
    if (orig === 0) continue;

    let best = null;
    let bestBad = orig;
    let bestDist = Infinity;
    for (let r = 1; r <= MAX_R; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = ox + dx;
          const ny = oy + dy;
          const bad = badnessAt(nx, ny, refs, ownRoutes, edges);
          if (bad >= orig) continue; // 只接受能改善者
          const dist = dx * dx + dy * dy;
          if (bad < bestBad || (bad === bestBad && dist < bestDist)) {
            best = [nx, ny];
            bestBad = bad;
            bestDist = dist;
          }
        }
      }
      if (best && bestBad === 0) break;
    }

    if (best) {
      const [nx, ny] = best;
      for (const r of refs) {
        const seg = skeletonFlat[r.si];
        const pts = seg.points;
        if (Array.isArray(pts[r.pi])) { pts[r.pi][0] = nx; pts[r.pi][1] = ny; }
        else { pts[r.pi].x = nx; pts[r.pi].y = ny; }
        const nd = seg.nodes?.[r.pi];
        if (nd) {
          nd.x_grid = nx; nd.y_grid = ny;
          if (!nd.tags) nd.tags = {};
          nd.tags.x_grid = nx; nd.tags.y_grid = ny;
        }
        const ep = r.pi === 0 ? seg.properties_start : (r.pi === pts.length - 1 ? seg.properties_end : null);
        if (ep) {
          ep.x_grid = nx; ep.y_grid = ny;
          if (!ep.tags) ep.tags = {};
          ep.tags.x_grid = nx; ep.tags.y_grid = ny;
        }
      }
      fixCount++;
    } else {
      failCount++;
      console.warn(`[⑨骨架後矯正] 頂點 (${ox},${oy}) 在鄰格(${MAX_R})內無法改善，保持原位。`);
    }
  }

  if (fixCount > 0 || failCount > 0) {
    console.log(
      `[⑨骨架後矯正] 位移 ${fixCount} 個落線/碰撞/交叉的彩色頂點到鄰格（junction 連動、保拓撲）` +
        (failCount > 0 ? `；${failCount} 個無法改善保持原位。` : '。')
    );
  }
}

// ── 四分樹切割預覽（載入骨架時計算，供「開始執行」前顯示） ──────────────────────

/**
 * 自骨架 geojson 計算四分樹切割結果（與 Step 1 同一條：去黑站→骨架→四分樹→**最小葉格均勻網格**），
 * 回傳實際 snap 用的均勻網格線 xs/ys（經緯度座標，與骨架同空間，可直接用渲染 xScale/yScale 畫出）。
 * 不執行正規化、不改任何資料；純供「載入骨架後、按開始執行前」預覽切割。
 * @returns {{ xs:number[], ys:number[], bounds:{minLon:number,maxLon:number,minLat:number,maxLat:number} } | null}
 */
export function computeQuadtreePartitionFromGeojson(geojson) {
  if (!geojson?.features?.length) return null;
  try {
    const fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {});
    const baseFlat = fields?.spaceNetworkGridJsonData;
    if (!Array.isArray(baseFlat) || baseFlat.length === 0) return null;
    const { skeletonFlat: c3Flat } = buildConnectSkeleton(baseFlat);
    if (!c3Flat?.length) return null;
    const snap = buildSnapLonLatFromC3Segments(c3Flat, { allColorSplitNodes: true });
    if (!snap || !Array.isArray(snap.sortedX) || !Array.isArray(snap.sortedY)) return null;
    // sortedX／sortedY＝以「最小葉格」為單位之均勻網格線（與實際 snap 同一組）。
    return { xs: snap.sortedX.slice(), ys: snap.sortedY.slice(), bounds: snap.bounds };
  } catch (e) {
    console.error('computeQuadtreePartitionFromGeojson 失敗', e);
    return null;
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
  // 開始執行 → 清掉「載入骨架時」的四分樹切割預覽（結果改為整數格空間，預覽已不再對齊）。
  layer.quadtreePartition = null;

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
  // 四分樹以「所有彩色點 🔴connect／🔵terminal／🟡cross／🟣purple」切格（不含黑點），
  // 讓藍/黃/紫點也被分隔，避免不同路線被 snap 擠到同一格行/列而重疊（如迴龍分支）。
  const snapResult = buildSnapLonLatFromC3Segments(c3Flat, { allColorSplitNodes: true });
  if (!snapResult) {
    console.warn('executeNormalizeRma：四分樹建立失敗。');
    return false;
  }
  const d3Flat = JSON.parse(JSON.stringify(c3Flat));
  applySnapToSkeleton(d3Flat, snapResult.snapLonLat);
  const snapCoincidences = findNewCoincidentSkeletonVertices(c3Flat, d3Flat);
  if (snapCoincidences.length > 0) {
    warnNewCoincidentSkeletonVertices('四分樹正規化', snapCoincidences);
    return false;
  }

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
        const fixCoincidences = findNewCoincidentSkeletonVertices(c3Flat, fixResult.patched);
        if (fixCoincidences.length > 0) {
          warnNewCoincidentSkeletonVertices('鄰線錯邊修正', fixCoincidences);
        } else if (crossAfter <= crossBefore) {
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
        JSON.parse(JSON.stringify(normalizedFlat)),
        { protectAllNonBlackSkeleton: true }
      );
      if (pruneResult?.segments?.length) {
        const crossAfter = countCrossings(pruneResult.segments);
        const pruneCoincidences = findNewCoincidentSkeletonVertices(c3Flat, pruneResult.segments);
        if (pruneCoincidences.length > 0) {
          warnNewCoincidentSkeletonVertices('刪空欄列', pruneCoincidences);
        } else if (crossAfter <= crossBefore) {
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

  // ── 骨架後矯正（放黑站之前）：彩色頂點若落在別條路線線上/頂點、或相鄰段與他線交叉 →
  //     整個 junction 連動位移到最近鄰格（保拓撲，只在能改善時才移）。黑站尚未放回。
  const beforeSkeletonAdjust = JSON.parse(JSON.stringify(normalizedFlat));
  adjustSkeletonPointsOnRouteOrCrossing(normalizedFlat);
  const adjustCoincidences = findNewCoincidentSkeletonVertices(c3Flat, normalizedFlat);
  if (adjustCoincidences.length > 0) {
    warnNewCoincidentSkeletonVertices('骨架後矯正', adjustCoincidences);
    normalizedFlat = beforeSkeletonAdjust;
  }

  // ── 建共軌圖（路線間走向偵測；以矯正後骨架建立） ──────────────────────────────
  let graph = buildSchematicGraph(normalizedFlat);
  try { graph = splitHighDegreeNodes(graph); } catch { /* 非致命 */ }

  // ── 放回黑站（沿各自路線弧長插值，不改 connect 拓樸） ───────────────────────
  const fullFlat = reinsertBlackStations(normalizedFlat, sections);

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
