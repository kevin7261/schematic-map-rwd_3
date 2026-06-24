/**
 * 資料處理複本：GeoJSON → 匯出列（Colab 1-1 或座標比對）；路段輸出使用同目錄之 geojsonExportRouteSegments。
 */

import { exportRouteSegmentsFromGeoJson } from './geojsonExportRouteSegments.js';
import {
  geojsonSupportsColab11Linearize,
  linearizeGeojsonColab11,
  colabRawSegmentsToExportRows,
} from '@/utils/taipeiDataProcTest3/colab11LinearizeForA3B3.js';

/**
 * @param {*} geojson - FeatureCollection
 * @param {{ forceCoordinateRouteSegments?: boolean }} [options] — `forceCoordinateRouteSegments` 為 true 時略過 Colab 1-1，一律用與 Python `export_route_segments` 相同之座標比對（含 `segment.stations` 中途站）。
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
    rows: exportRouteSegmentsFromGeoJson(geojson),
    colabMeta: null,
    linearizeAlgorithm: 'coordinate_match',
  };
}
