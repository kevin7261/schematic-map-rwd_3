/* eslint-disable no-console */

/**
 * 圖層「MILP結果正規化」：讀 ③ MILP 結果（或匯入下載的 MILP JSON），做**保拓樸的座標正規化**＝
 * 壓縮空白行/列（沒有任何站、且沒有對角線穿過的整數格線才移除），保證：
 *   不新增交叉、不新增重疊、仍維持八方向（H/V/45°）。
 *
 * 不採用 OSM 管線的 quadtree「格帶吸附」正規化——那是有損粗化，會破壞已乾淨的 MILP 八方向佈局
 * （兩軸獨立換 index 為非仿射變換，會翻面而產生本來不存在的交叉）。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { buildConnectSkeleton } from '../input.js';
import { writeSchematicResultToLayer, reinsertBlackStations } from '../assemble.js';
import { revalidatePinkToBrownInFlat, recomputeGrayAfterBrownToBlack, refreshPinkDpRatioInFlat } from '../../routeStations.js';
import {
  SCHEMATIC_MILP_LAYER_ID,
  SCHEMATIC_MILP_READ_LAYER_ID,
  SCHEMATIC_MILP_STRAIGHTEN_LAYER_ID,
  SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID,
} from '../layerIds.js';

function fail(msg) {
  console.warn('[MILP結果正規化] ' + msg);
  if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert('[未產出]\n' + msg);
  return { ok: false, message: msg };
}

const rdP = (p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x ?? 0), Number(p?.y ?? 0)]);
const wrP = (p, x, y) => { if (Array.isArray(p)) { p[0] = x; p[1] = y; } else if (p && typeof p === 'object') { p.x = x; p.y = y; } };
const cz = (ax, ay, bx, by) => ax * by - ay * bx;

/** 兩子邊（不同 section、不共端點）是否「交叉或疊線」。 */
function pairBad(a, b, c, d) {
  // 共線疊線
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  if (Math.abs(cz(rx, ry, sx, sy)) < 1e-9 && Math.abs(cz(rx, ry, c[0] - a[0], c[1] - a[1])) < 1e-9) {
    const L = Math.hypot(rx, ry); if (L > 1e-9) {
      const ux = rx / L, uy = ry / L;
      const tb = (b[0] - a[0]) * ux + (b[1] - a[1]) * uy;
      const tc = (c[0] - a[0]) * ux + (c[1] - a[1]) * uy;
      const td = (d[0] - a[0]) * ux + (d[1] - a[1]) * uy;
      const lo = Math.max(Math.min(0, tb), Math.min(tc, td));
      const hi = Math.min(Math.max(0, tb), Math.max(tc, td));
      if (hi - lo > 1e-6) return true;
    }
    return false;
  }
  // 嚴格內部相交
  const d1 = cz(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]);
  const d2 = cz(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]);
  const d3 = cz(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]);
  const d4 = cz(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** 整份 flat 的「交叉＋疊線」子邊對數（不同 section、不共端點）。 */
function countFlatBad(segs) {
  const subs = [];
  segs.forEach((seg, sid) => {
    const pts = (seg.points || []).map(rdP);
    const ep0 = pts.length ? `${pts[0][0]},${pts[0][1]}` : '';
    const epN = pts.length ? `${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}` : '';
    for (let i = 1; i < pts.length; i++) subs.push({ sid, a: pts[i - 1], b: pts[i], ep0, epN });
  });
  let n = 0;
  for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) {
    if (subs[i].sid === subs[j].sid) continue;
    // 共端點（兩 section 在 connect 相接）不算
    if (subs[i].ep0 === subs[j].ep0 || subs[i].ep0 === subs[j].epN || subs[i].epN === subs[j].ep0 || subs[i].epN === subs[j].epN) continue;
    if (pairBad(subs[i].a, subs[i].b, subs[j].a, subs[j].b)) n++;
  }
  return n;
}

/**
 * 壓縮空白行/列：移除「此 segs 內整排沒有任何點」之整數格線（本層傳入 connect 骨架
 * → 等同「整排沒有紅/藍 connect 點就刪除」，與黑點無關；一律移除，含對角線穿過者）。就地改寫 segs。
 */
function compactEmptyGridLines(segs) {
  const xs = new Set(), ys = new Set();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of segs) for (const p of seg.points || []) {
    const [x, y] = rdP(p); xs.add(x); ys.add(y);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const removeCols = [], removeRows = [];
  for (let c = minX + 1; c < maxX; c++) if (!xs.has(c)) removeCols.push(c);
  for (let r = minY + 1; r < maxY; r++) if (!ys.has(r)) removeRows.push(r);
  const remap = (v, removed) => { let s = 0; for (const k of removed) { if (k < v) s++; else break; } return v - s; };
  for (const seg of segs) for (const p of seg.points || []) {
    const [x, y] = rdP(p);
    wrP(p, remap(x, removeCols), remap(y, removeRows));
  }
  return { removedCols: removeCols.length, removedRows: removeRows.length };
}

/**
 * 僅「匯入並顯示原始 MILP 結果」（不正規化）。匯入後存於 dataJson 作為輸入，同時顯示為「原來的樣子」。
 */
export function loadMilpJsonRaw(parsed) {
  const ds = useDataStore();
  const readLayer = ds.findLayerById(SCHEMATIC_MILP_READ_LAYER_ID);
  if (!readLayer) return fail('找不到圖層 ' + SCHEMATIC_MILP_READ_LAYER_ID);
  if (!Array.isArray(parsed) || parsed.length === 0) return fail('匯入內容為空或格式不符。');
  const flat = JSON.parse(JSON.stringify(parsed));
  // 匯入時以格座標重算 dp_ratio（覆蓋骨架2 經緯度 DP 的舊值，否則 hover 會顯示錯誤比例如 0.9231）。
  try {
    refreshPinkDpRatioInFlat(flat);
  } catch (e) {
    console.warn('[MILP結果正規化] 匯入時重算 dp_ratio 失敗，沿用原 tags。', e);
  }
  readLayer.dataJson = JSON.parse(JSON.stringify(flat));
  const write = writeSchematicResultToLayer(SCHEMATIC_MILP_READ_LAYER_ID, flat, {
    algo: '已匯入 MILP JSON（原始，未正規化）。按「座標正規化」做壓縮。',
    sourceLayerId: SCHEMATIC_MILP_LAYER_ID,
    imported: true,
    coordNormalize: false,
    readAt: Date.now(),
  });
  if (!write.ok) return write;
  ds.requestSpaceNetworkGridFullRedraw();
  return { ok: true, message: '已匯入 MILP JSON（原始）。按「座標正規化」做壓縮。', stats: write.stats };
}

/**
 * 圖層「connect 拉直」之「執行下一步」＝把「MILP結果正規化」的目前結果**移入本層**（深拷），
 * 之後在本層按「紅/藍 connect 拉直」「逐點除錯」。不在 MILP結果正規化 上做拉直。
 */
export function executeMilpStraightenSeed() {
  const ds = useDataStore();
  // 上游＝「站點與路線往中心聚集（先直後橫）」(只存骨架；黑點站在 schematicBlackSections metadata)。
  const vh = ds.findLayerById(SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID);
  let seed = null;
  let from = '';
  if (vh && Array.isArray(vh.spaceNetworkGridJsonData) && vh.spaceNetworkGridJsonData.length) {
    const skel = JSON.parse(JSON.stringify(vh.spaceNetworkGridJsonData));
    const sections = Array.isArray(vh.schematicBlackSections) ? vh.schematicBlackSections : [];
    // 最後一步：把黑點站平均沿線放回。
    seed = sections.length === skel.length ? reinsertBlackStations(skel, sections) : skel;
    from = '站點與路線往中心聚集（先直後橫）';
  } else {
    // 退回「MILP結果正規化」(本身含黑點站)。
    const read = ds.findLayerById(SCHEMATIC_MILP_READ_LAYER_ID);
    if (read && Array.isArray(read.spaceNetworkGridJsonData) && read.spaceNetworkGridJsonData.length) {
      seed = JSON.parse(JSON.stringify(read.spaceNetworkGridJsonData));
      from = 'MILP結果正規化';
    }
  }
  if (!Array.isArray(seed) || seed.length === 0) {
    return fail('上游尚無結果：請先完成「MILP結果正規化」與「往中心聚集（先橫後直/先直後橫）」。');
  }
  const write = writeSchematicResultToLayer(SCHEMATIC_MILP_STRAIGHTEN_LAYER_ID, seed, {
    algo: `自「${from}」移入結果（黑點站已平均放回；待 connect 拉直）`,
    sourceLayerId: from,
    readAt: Date.now(),
  });
  if (!write.ok) return write;
  return { ok: true, message: `已移入「${from}」結果（黑點站已平均放回）；可按「紅/藍 connect 拉直」或逐點除錯。`, stats: write.stats };
}

/**
 * 🔘 獨立按鈕用（座標正規化前）：以紅/黃/藍為邊界重算粉紅點（參數同骨架2），不再需要者改棕色。
 *   就地套用到目前輸入（dataJson 或 ③ MILP 結果）並重新顯示（未正規化）。
 */
export function recomputeMilpReadPinkToBrown() {
  const ds = useDataStore();
  const readLayer = ds.findLayerById(SCHEMATIC_MILP_READ_LAYER_ID);
  if (!readLayer) return fail('找不到圖層 ' + SCHEMATIC_MILP_READ_LAYER_ID);
  const loaded = Array.isArray(readLayer.dataJson) && readLayer.dataJson.length ? readLayer.dataJson : null;
  let input = loaded;
  if (!input) {
    const milp = ds.findLayerById(SCHEMATIC_MILP_LAYER_ID);
    input = Array.isArray(milp?.spaceNetworkGridJsonData) && milp.spaceNetworkGridJsonData.length
      ? milp.spaceNetworkGridJsonData : null;
  }
  if (!input) {
    return fail('未提供 MILP 結果：請先「匯入 JSON 檔」或從①②③（RMA）匯入排版結果。');
  }
  const flat = JSON.parse(JSON.stringify(input));
  const demoted = revalidatePinkToBrownInFlat(flat, { planar: true }); // MILP 結果為平面格座標
  const res = loadMilpJsonRaw(flat); // 更新 dataJson + 重新顯示（仍未正規化）
  if (!res.ok) return res;
  return { ok: true, message: `粉紅點重算完成：${demoted} 個不需為粉紅 → 已改為棕色。`, demoted };
}

/**
 * 🔘 第二顆按鈕：把棕點改回一般黑點 → 拉直路線（紅/黃/藍/粉紅為錨點）→ 再以「紅/黃/藍/粉紅 + 灰」為
 *   邊界重算灰點配置（規則同骨架2）。就地套用到目前輸入（dataJson 或 ③ MILP 結果）並重新顯示（未正規化）。
 */
export function recomputeMilpReadBrownToBlackGray() {
  const ds = useDataStore();
  const readLayer = ds.findLayerById(SCHEMATIC_MILP_READ_LAYER_ID);
  if (!readLayer) return fail('找不到圖層 ' + SCHEMATIC_MILP_READ_LAYER_ID);
  const loaded = Array.isArray(readLayer.dataJson) && readLayer.dataJson.length ? readLayer.dataJson : null;
  let input = loaded;
  if (!input) {
    const milp = ds.findLayerById(SCHEMATIC_MILP_LAYER_ID);
    input = Array.isArray(milp?.spaceNetworkGridJsonData) && milp.spaceNetworkGridJsonData.length
      ? milp.spaceNetworkGridJsonData : null;
  }
  if (!input) {
    return fail('未提供 MILP 結果：請先「匯入 JSON 檔」或從①②③（RMA）匯入排版結果。');
  }
  const flat = JSON.parse(JSON.stringify(input));
  const { brownToBlack, straightened, gray } = recomputeGrayAfterBrownToBlack(flat, { planar: true });
  const res = loadMilpJsonRaw(flat);
  if (!res.ok) return res;
  return {
    ok: true,
    message: `棕點還原為黑點 ${brownToBlack} 個；拉直 ${straightened} 個中間頂點；重算灰點：新增 ${gray} 個（兩相鄰邊界點間黑點 ≤ 4）。`,
    brownToBlack,
    straightened,
    gray,
  };
}

/** 「座標正規化」：保拓樸壓縮空白行列。 */
export function executeReadMilpResult() {
  const ds = useDataStore();
  const readLayer = ds.findLayerById(SCHEMATIC_MILP_READ_LAYER_ID);
  if (!readLayer) return fail('找不到圖層 ' + SCHEMATIC_MILP_READ_LAYER_ID);

  const loaded = Array.isArray(readLayer.dataJson) && readLayer.dataJson.length ? readLayer.dataJson : null;
  let input = loaded;
  if (!input) {
    const milp = ds.findLayerById(SCHEMATIC_MILP_LAYER_ID);
    input = Array.isArray(milp?.spaceNetworkGridJsonData) && milp.spaceNetworkGridJsonData.length
      ? milp.spaceNetworkGridJsonData : null;
  }
  if (!input) {
    return fail('未提供 MILP 結果：請按「匯入 JSON 檔」選擇下載的 MILP 結果 JSON，或先執行「③ 示意圖佈局（MILP）」。');
  }

  const baseFlat = JSON.parse(JSON.stringify(input));

  // 座標正規化前：以紅/黃/藍為邊界重算粉紅點（參數同骨架2），不再需要者降級為棕色。
  //   MILP 結果為平面格座標 → planar:true（不做 cos(lat) 校正）。
  try {
    const demoted = revalidatePinkToBrownInFlat(baseFlat, { planar: true });
    if (demoted > 0) console.log(`[路線正規化] 粉紅點以紅/黃/藍邊界重算：${demoted} 個 → 降級棕色。`);
  } catch (e) {
    console.error('[路線正規化] 粉紅點重算（→棕色）失敗，沿用原分類。', e);
  }

  const before = countFlatBad(baseFlat);

  // 只看紅/藍 connect 點：抽出 connect 骨架（去黑點）→ 移除「整排沒有 connect 的空白行/列」
  // → 黑點沿邊重新內插放回。依使用者要求一律移除（含對角線穿過者）。
  const { skeletonFlat, sections } = buildConnectSkeleton(baseFlat);
  const { removedCols, removedRows } = compactEmptyGridLines(skeletonFlat);
  const finalSegs = reinsertBlackStations(skeletonFlat, sections);
  try {
    refreshPinkDpRatioInFlat(finalSegs); // 壓縮後座標已變，須重算 dp_ratio
  } catch (e) {
    console.warn('[MILP結果正規化] 正規化後重算 dp_ratio 失敗。', e);
  }
  const after = countFlatBad(finalSegs);

  const write = writeSchematicResultToLayer(SCHEMATIC_MILP_READ_LAYER_ID, finalSegs, {
    algo: '座標正規化（移除整排無紅/藍 connect 點之空白行列）',
    sourceLayerId: SCHEMATIC_MILP_LAYER_ID,
    coordNormalize: true,
    removedCols,
    removedRows,
    crossBefore: before,
    crossAfter: after,
    topologyError: after > before,
    topologyErrorCount: Math.max(0, after - before),
    readAt: Date.now(),
  });
  if (!write.ok) return write;
  ds.requestSpaceNetworkGridFullRedraw();

  // 拓撲錯誤偵測：若正規化「新增」了交叉/重疊（多為移除對角線穿過之空白行列把 45° 壓歪所致），顯示警示。
  const introduced = after - before;
  if (introduced > 0) {
    const msg =
      `⚠ 座標正規化後出現拓撲錯誤！\n` +
      `新增交叉／重疊 ${introduced} 處（${before} → ${after}）。\n` +
      `原因：移除了被 45° 對角線穿過的空白行/列，使對角線被壓歪而相交。\n` +
      `後果：此結果已非平面拓撲，「紅／藍 connect 拉直」會因路網有交叉而拒跑。`;
    console.warn('[MILP結果正規化] ' + msg);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg);
  }

  const warn = introduced > 0 ? `；⚠ 拓撲錯誤：新增交叉/重疊 ${introduced}（${before}→${after}）` : `；交叉/重疊維持 ${after}（無新增）`;
  return {
    ok: true,
    message: `座標正規化完成：移除空白 ${removedCols} 欄、${removedRows} 列${warn}`,
    stats: write.stats,
  };
}
