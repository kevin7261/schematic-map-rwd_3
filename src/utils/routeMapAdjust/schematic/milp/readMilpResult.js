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
import {
  countFlatBad,
  snapNonBlackSkeletonToIntegerGrid,
  compactEmptyGridLinesSafe,
  resolveIntroducedCrossings,
} from './coordNormalizeMilpCompact.js';

function fail(msg) {
  console.warn('[MILP結果正規化] ' + msg);
  if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert('[未產出]\n' + msg);
  return { ok: false, message: msg };
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
    message: `棕點還原為黑點 ${brownToBlack} 個；拉直 ${straightened} 段；重算灰點：新增 ${gray} 個（兩相鄰邊界點間黑點 ≤ 4）。`,
    brownToBlack,
    straightened,
    gray,
  };
}

/** 「座標正規化」：整數格吸附 → 保拓樸壓縮空白行列 → 必要時修正交叉。 */
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
  try {
    const demoted = revalidatePinkToBrownInFlat(baseFlat, { planar: true });
    if (demoted > 0) console.log(`[路線正規化] 粉紅點以紅/黃/藍邊界重算：${demoted} 個 → 降級棕色。`);
  } catch (e) {
    console.error('[路線正規化] 粉紅點重算（→棕色）失敗，沿用原分類。', e);
  }

  const before = countFlatBad(baseFlat);

  // ① 紅/黃/藍/粉紅/灰骨架節點 snap 至整數格（同位置共點同步）。
  const snappedGroups = snapNonBlackSkeletonToIntegerGrid(baseFlat);
  if (snappedGroups > 0) {
    console.log(`[路線正規化] 骨架邊界節點整數化：${snappedGroups} 組共點已調整。`);
  }

  // ② connect 骨架 → 安全刪空欄列（保護對角穿過格線 + 不新增交叉）。
  const { skeletonFlat, sections } = buildConnectSkeleton(baseFlat);
  const { removedCols, removedRows } = compactEmptyGridLinesSafe(skeletonFlat, before);

  // ③ 若仍新增交叉，於骨架上微調頂點後再插回黑點。
  let crossFixed = 0;
  if (countFlatBad(skeletonFlat) > before) {
    crossFixed = resolveIntroducedCrossings(skeletonFlat, before);
    if (crossFixed > 0) {
      console.log(`[路線正規化] 交叉修正：${crossFixed} 組骨架共點已微調。`);
    }
  }
  let finalSegs = reinsertBlackStations(skeletonFlat, sections);

  try {
    refreshPinkDpRatioInFlat(finalSegs);
  } catch (e) {
    console.warn('[MILP結果正規化] 正規化後重算 dp_ratio 失敗。', e);
  }
  const after = countFlatBad(finalSegs);

  const write = writeSchematicResultToLayer(SCHEMATIC_MILP_READ_LAYER_ID, finalSegs, {
    algo: '座標正規化（骨架整數格 + 安全刪空欄列 + 交叉修正）',
    sourceLayerId: SCHEMATIC_MILP_LAYER_ID,
    coordNormalize: true,
    removedCols,
    removedRows,
    crossBefore: before,
    crossAfter: after,
    crossFixed,
    snappedGroups,
    topologyError: after > before,
    topologyErrorCount: Math.max(0, after - before),
    readAt: Date.now(),
  });
  if (!write.ok) return write;
  ds.requestSpaceNetworkGridFullRedraw();

  const introduced = after - before;
  if (introduced > 0) {
    const msg =
      `⚠ 座標正規化後仍出現拓撲錯誤！\n` +
      `新增交叉／重疊 ${introduced} 處（${before} → ${after}）。\n` +
      `已嘗試整數 snap、保護對角格線與頂點微調（修正 ${crossFixed} 點），仍無法完全消除。\n` +
      `後果：「紅／藍 connect 拉直」可能因路網有交叉而拒跑。`;
    console.warn('[MILP結果正規化] ' + msg);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg);
  }

  const fixNote = crossFixed > 0 ? `；交叉修正 ${crossFixed} 點` : '';
  const snapNote = snappedGroups > 0 ? `；整數化 ${snappedGroups} 組共點` : '';
  const warn = introduced > 0
    ? `；⚠ 拓撲錯誤：新增交叉/重疊 ${introduced}（${before}→${after}）`
    : `；交叉/重疊維持 ${after}（無新增）`;
  return {
    ok: true,
    message: `座標正規化完成：移除空白 ${removedCols} 欄、${removedRows} 列${snapNote}${fixNote}${warn}`,
    stats: write.stats,
  };
}
