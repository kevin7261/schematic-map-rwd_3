/**
 * 離線／純函式版「站點與路線調整前置」一鍵執行：
 * 重算粉紅點 → 棕點→黑點＋灰點 → 移除無用網格 → 站點調整移除交叉。
 * 與 UI executeMilpReadPrepOneClick 四步驟等價（不依賴 Pinia dataStore）。
 */

import {
  revalidatePinkToBrownInFlat,
  recomputeGrayAfterBrownToBlack,
  refreshPinkDpRatioInFlat,
} from '../routeStations.js';
import { buildConnectSkeleton } from '../schematic/input.js';
import { reinsertBlackStations } from '../schematic/assemble.js';
import {
  countFlatBad,
  snapNonBlackSkeletonToIntegerGrid,
  compactEmptyGridLinesSafe,
  resolveRouteCrossingsByMinimalEndpointMove,
} from '../schematic/milp/coordNormalizeMilpCompact.js';

export const RMA_MILP_READ_ONE_CLICK_KIND = 'rma-milp-read-one-click';
export const RMA_MILP_READ_ONE_CLICK_VERSION = 1;

const cloneFlat = (flat) => JSON.parse(JSON.stringify(flat));

const hasBrownNodes = (flat) =>
  flat.some((seg) =>
    (Array.isArray(seg?.nodes) ? seg.nodes : []).some((nd) => {
      const t = nd?.tags || {};
      return (
        (nd?.node_kind ?? t.node_kind) === 'brown' ||
        String(t.node_class_color ?? nd?.node_class_color ?? '').toLowerCase() === '#9a6324'
      );
    })
  );

/** 步驟 1：粉紅→棕 */
export function stepPinkToBrown(flat) {
  const demoted = revalidatePinkToBrownInFlat(flat, { planar: true });
  return { demoted };
}

/** 步驟 2：棕→黑＋灰（無棕點時跳過） */
export function stepBrownToBlackGray(flat) {
  if (!hasBrownNodes(flat)) {
    return { brownToBlack: 0, straightened: 0, gray: 0, splitSegments: 0, skipped: true };
  }
  return { ...recomputeGrayAfterBrownToBlack(flat, { planar: true }), skipped: false };
}

/** 步驟 3：移除無用網格 */
export function stepRemoveGrid(flat) {
  try {
    revalidatePinkToBrownInFlat(flat, { planar: true });
  } catch {
    /* 非致命 */
  }
  const before = countFlatBad(flat);
  const snappedGroups = snapNonBlackSkeletonToIntegerGrid(flat);
  const { skeletonFlat, sections } = buildConnectSkeleton(flat);
  const { removedCols, removedRows } = compactEmptyGridLinesSafe(skeletonFlat, before);
  const finalSegs = reinsertBlackStations(skeletonFlat, sections);
  try {
    refreshPinkDpRatioInFlat(finalSegs);
  } catch {
    /* 非致命 */
  }
  const after = countFlatBad(finalSegs);
  flat.length = 0;
  flat.push(...finalSegs);
  return { removedCols, removedRows, snappedGroups, crossBefore: before, crossAfter: after };
}

/** 步驟 4：站點調整移除交叉 */
export function stepRemoveCrossings(flat) {
  const { skeletonFlat, sections } = buildConnectSkeleton(flat);
  const { crossBefore, crossAfter, endpointMoves } =
    resolveRouteCrossingsByMinimalEndpointMove(skeletonFlat);
  if (crossBefore === 0 || endpointMoves === 0) {
    return { crossBefore, crossAfter, endpointMoves, changed: false };
  }
  const finalSegs = reinsertBlackStations(skeletonFlat, sections);
  try {
    refreshPinkDpRatioInFlat(finalSegs);
  } catch {
    /* 非致命 */
  }
  flat.length = 0;
  flat.push(...finalSegs);
  return { crossBefore, crossAfter, endpointMoves, changed: true };
}

/**
 * 對 flat 路網執行完整一鍵四步驟（就地修改 flat 並回傳統計）。
 * @param {Array} inputFlat
 * @returns {{ ok: boolean, message?: string, flat?: Array, stats?: object }}
 */
export function runRmaMilpReadOneClickOnFlat(inputFlat) {
  if (!Array.isArray(inputFlat) || !inputFlat.length) {
    return { ok: false, message: '輸入路網為空。' };
  }
  const flat = cloneFlat(inputFlat);
  const pink = stepPinkToBrown(flat);
  const brown = stepBrownToBlackGray(flat);
  const grid = stepRemoveGrid(flat);
  const crossing = stepRemoveCrossings(flat);
  if (!flat.length) {
    return { ok: false, message: '一鍵執行後路網為空。' };
  }
  return {
    ok: true,
    flat,
    stats: { pink, brown, grid, crossing },
  };
}

/**
 * @param {unknown} parsed
 * @returns {{ ok: boolean, message?: string, flat?: Array }}
 */
export function parseRmaMilpReadOneClickFile(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, message: 'JSON 格式無效。' };
  }
  if (
    parsed.kind === RMA_MILP_READ_ONE_CLICK_KIND &&
    Array.isArray(parsed.spaceNetworkGridJsonData)
  ) {
    if (!parsed.spaceNetworkGridJsonData.length) {
      return { ok: false, message: '一鍵執行預算結果為空。' };
    }
    return { ok: true, flat: parsed.spaceNetworkGridJsonData };
  }
  if (Array.isArray(parsed) && parsed.length) {
    return { ok: true, flat: parsed };
  }
  return {
    ok: false,
    message: '非一鍵執行預算格式（須含 spaceNetworkGridJsonData）。',
  };
}

/** 預算 JSON 檔路徑（相對 public/data/metro） */
export function rmaMilpReadOneClickRelativePath(cityId) {
  return `rma_milp_read_one_click/${cityId}.json`;
}
