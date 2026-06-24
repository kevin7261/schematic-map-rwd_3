/**
 * 與 SpaceNetworkGridTab drawMap 一致：taipei_c／d 在具 minSpacingOverlayCell 時，
 * 繪圖座標為疊加網格（與空列／空行縮減後）空間。
 */

import {
  normalizeSpaceNetworkDataToFlatSegments,
  networkCoordToMinSpacingOverlayCell,
} from '@/utils/gridNormalizationMinDistance.js';
import { remapOverlayCellAfterRemoval } from '@/utils/dataExecute/execute_d_to_e_test.js';
import {
  isReducedSchematicPlotLayerId,
  isTaipeiTestCLayerTab,
} from '@/utils/taipeiTestPipeline.js';

export function isReducedSchematicPlotLayer(layer) {
  const id = layer?.layerId;
  if (!isReducedSchematicPlotLayerId(id)) return false;
  const c = layer?.minSpacingOverlayCell;
  return !!(c && Number(c.cellW) > 0 && Number(c.cellH) > 0);
}

/**
 * @param {object|null} layer
 * @returns {((gx: number, gy: number) => number[]) | null}
 */
export function createReducedSchematicPlotMapper(layer) {
  if (!isReducedSchematicPlotLayer(layer)) return null;
  const cw = Number(layer.minSpacingOverlayCell.cellW);
  const ch = Number(layer.minSpacingOverlayCell.cellH);
  const rm = layer.overlayRemovalMaps;
  // taipei_c 已為疊加正規化網格座標且無 overlayRemovalMaps 時，座標即繪圖索引。
  // 此處保留小數可避免同一路段多個黑點被 round 到同一格而重疊。
  if (isTaipeiTestCLayerTab(layer.layerId) && !rm?.mapX) {
    return (gx, gy) => [Number(gx), Number(gy)];
  }
  return (gx, gy) => {
    const cell = networkCoordToMinSpacingOverlayCell(gx, gy, cw, ch);
    if (!cell) return [Number(gx), Number(gy)];
    if (rm?.mapX) {
      const r = remapOverlayCellAfterRemoval(cell.ix, cell.iy, rm);
      if (r) return [r[0], r[1]];
    }
    return [cell.ix, cell.iy];
  };
}

export function mapNetworkToSchematicPlotXY(layer, gx, gy) {
  const mapFn = createReducedSchematicPlotMapper(layer);
  if (!mapFn) return [Number(gx), Number(gy)];
  return mapFn(Number(gx), Number(gy));
}

/**
 * 與 drawMap 縮減繪圖之資料邊界一致（經 createReducedSchematicPlotMapper 映射後取 min／max）。
 * @param {object|null} layer
 * @returns {{ xMin: number, xMax: number, yMin: number, yMax: number, centerX: number, centerY: number } | null}
 */
export function getSchematicPlotBoundsFromLayer(layer) {
  const flat = normalizeSpaceNetworkDataToFlatSegments(layer?.spaceNetworkGridJsonData || []);
  const mapFn = createReducedSchematicPlotMapper(layer);
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const addPt = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  };
  for (const seg of flat) {
    for (const p of seg.points || []) {
      const x = Array.isArray(p) ? Number(p[0]) : Number(p?.x ?? 0);
      const y = Array.isArray(p) ? Number(p[1]) : Number(p?.y ?? 0);
      if (!mapFn) addPt(x, y);
      else {
        const [nx, ny] = mapFn(x, y);
        addPt(nx, ny);
      }
    }
  }
  if (!Number.isFinite(xMin)) return null;
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    centerX: (xMin + xMax) / 2,
    centerY: (yMin + yMax) / 2,
  };
}
