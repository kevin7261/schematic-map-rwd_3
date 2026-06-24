/**
 * ㄈ縮減為 L 型（與 taipei_a／taipei_a2 ControlTab executeNShapeAll 相同 options）
 * skipConnectMove：允許縮減時一併變換路徑上的 connect；segmentUtils.syncNShapeGeometry 會保留／合併節點與新座標對齊。
 */
import { buildNShapeList, buildStraightSegments, reduceNShapeInRoutesData } from '@/utils/segmentUtils.js';

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

const REDUCE_N_OPTIONS = {
  skipConnectMove: true,
  skipCrossing: true,
  useRectangleOtherRouteCheck: true,
};

/**
 * 就地更新 initialData 所代表的網路（傳入深拷貝可保留原圖層）。
 * @returns {{ routesData: Array, nShapePassesRun: number, nShapeReducedAny: boolean }}
 */
export function applyNShapeReduceAllToSpaceNetworkData(initialData) {
  let data = initialData;
  if (!Array.isArray(data) || data.length === 0) {
    return { routesData: data, nShapePassesRun: 0, nShapeReducedAny: false };
  }
  let nShapeReducedAny = false;
  let nShapePassesRun = 0;
  for (let pass = 0; pass < 100; pass++) {
    nShapePassesRun = pass + 1;
    const layoutData = getTaipeiTestLayoutData(data);
    const straightSegs = buildStraightSegments(layoutData);
    const list = buildNShapeList(straightSegs);
    if (list.length === 0) break;
    let changedAny = false;
    for (const segStartIdx of list) {
      const result = reduceNShapeInRoutesData(data, segStartIdx, REDUCE_N_OPTIONS);
      if (result.changed) {
        data = result.routesData;
        changedAny = true;
        nShapeReducedAny = true;
      }
    }
    if (!changedAny) break;
  }
  return { routesData: data, nShapePassesRun, nShapeReducedAny };
}
