import { resolveSchematicInput } from './input.js';
import { reinsertBlackStations } from './assemble.js';
import { analyzeRoutePairRotation } from './routePairRotationCheck.js';

/**
 * ③ MILP 完成後由使用者按鈕觸發：路線對 CCW 環序審計（validate-junction-rotation skill 同邏輯）。
 * 不修改佈局結果，僅讀取 ref/out 比對。
 */
export function auditMilpRoutePairRotation(layerId, spaceNetworkGridJsonData) {
  const input = resolveSchematicInput(layerId);
  if (!input.ok) return { ok: false, message: input.message };
  if (!Array.isArray(spaceNetworkGridJsonData) || spaceNetworkGridJsonData.length === 0) {
    return { ok: false, message: '尚無佈局結果，請先按「開始執行」。' };
  }

  const refFull = reinsertBlackStations(
    JSON.parse(JSON.stringify(input.skeletonFlat)),
    input.sections
  );
  const outFull = JSON.parse(JSON.stringify(spaceNetworkGridJsonData));
  const routePairReport = analyzeRoutePairRotation(refFull, outFull, {
    refAngleFlat: input.refAngleFlat,
  });

  return {
    ok: true,
    audit: {
      primaryVerdict: routePairReport.summary.primaryVerdict,
      violationCount: routePairReport.violations.length,
      violations: routePairReport.violations,
      summaryZh: routePairReport.summaryZh,
      reasonLines: routePairReport.reasonLines,
      junctionCountGe3: routePairReport.summary.junctionCountGe3,
      routePairPass: routePairReport.summary.routePairPass,
    },
  };
}
