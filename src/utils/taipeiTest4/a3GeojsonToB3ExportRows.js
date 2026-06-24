/**
 * taipei 測試 3：a3 GeoJSON → b3 匯出列（Colab 1-1 或既有座標比對），僅由此流程使用。
 */

import { exportRouteSegmentsFromGeoJson } from '@/utils/geojsonExportRouteSegments.js';
import {
  geojsonSupportsColab11Linearize,
  linearizeGeojsonColab11,
  colabRawSegmentsToExportRows,
} from '@/utils/taipeiTest3/colab11LinearizeForA3B3.js';

/**
 * @param {*} geojson - FeatureCollection
 * @param {{
 *   forceCoordinateRouteSegments?: boolean,
 *   renameEachEmittedSegment?: boolean,
 *   emittedSegmentNamePrefix?: string,
 *   compactStationNumericIds?: boolean,
 * }} [options]
 * @returns {{ rows: Array, colabMeta: object | null, linearizeAlgorithm: string }}
 */
export function exportTaipeiA3GeojsonToB3Rows(geojson, options = {}) {
  const forceCoord = Boolean(options?.forceCoordinateRouteSegments);
  if (!forceCoord && geojsonSupportsColab11Linearize(geojson)) {
    const { outputSegments, meta } = linearizeGeojsonColab11(geojson);
    return {
      rows: colabRawSegmentsToExportRows(outputSegments),
      colabMeta: meta,
      linearizeAlgorithm: 'colab_1_1',
    };
  }
  return {
    rows: exportRouteSegmentsFromGeoJson(geojson, options),
    colabMeta: null,
    linearizeAlgorithm: 'coordinate_match',
  };
}
