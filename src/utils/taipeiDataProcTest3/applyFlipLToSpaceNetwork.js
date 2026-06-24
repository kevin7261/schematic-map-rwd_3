/**
 * Flip L 型（與 taipei_a／taipei_a2 ControlTab 相同邏輯）
 */
import { buildStraightSegments, flipLShapeInRoutesData } from '@/utils/segmentUtils.js';

function getTaipeiTestLayoutData(routesData) {
  if (!Array.isArray(routesData)) return [];
  if (routesData.length > 0 && routesData[0]?.segments && !routesData[0]?.points) {
    return routesData.flatMap((route) =>
      (route.segments || []).map((segment) => ({
        ...segment,
        name: route.route_name || route.name || 'Unknown',
      }))
    );
  }
  return routesData;
}

/**
 * 可 flip 的 L 個數（straightSegments 相鄰兩段為一個 L）
 */
export function countFlipLPositions(routesData) {
  if (!Array.isArray(routesData) || routesData.length === 0) return 0;
  const layoutData = getTaipeiTestLayoutData(routesData);
  const straightSegs = buildStraightSegments(layoutData);
  return Math.max(0, straightSegs.length - 1);
}

/**
 * 單步 flip；回傳新路網（flipL 內部深拷貝，changed 時替換參考）
 */
export function applyFlipLStepToSpaceNetworkData(routesData, flipIndex, options = {}) {
  const totalL = countFlipLPositions(routesData);
  if (totalL <= 0) {
    return { nextFlipIndex: flipIndex + 1, routesData };
  }
  const idx = flipIndex % totalL;
  const result = flipLShapeInRoutesData(routesData, idx, options);
  return {
    nextFlipIndex: flipIndex + 1,
    routesData: result.changed ? result.routesData : routesData,
  };
}

/**
 * 一鍵：重複掃描直到無可 flip 或達上限（與 executeFlipAll 相同）
 */
export function applyFlipLAllToSpaceNetworkData(initialData, options = {}) {
  let data = initialData;
  if (!Array.isArray(data) || data.length === 0) return data;
  for (let pass = 0; pass < 15; pass++) {
    const layoutData = getTaipeiTestLayoutData(data);
    const straightSegs = buildStraightSegments(layoutData);
    const totalL = Math.max(0, straightSegs.length - 1);
    if (totalL <= 0) break;
    let changedAny = false;
    for (let idx = 0; idx < totalL; idx++) {
      const result = flipLShapeInRoutesData(data, idx, options);
      if (result.changed) {
        data = result.routesData;
        changedAny = true;
      }
    }
    if (!changedAny) break;
  }
  return data;
}
