/**
 * 環序審計用 ref：格網拓撲 + 縮放前經緯度離開角（避免 scale 四捨五入吃掉近距站角差，如景安→南勢角）。
 */

import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildConnectSkeleton, scaleSkeletonToIntegerGrid } from './input.js';
import { reinsertBlackStations } from './assemble.js';

/**
 * @param {object} geojson FeatureCollection
 * @returns {{ refFull: Array, refAngleFlat: Array, sections: Array, skeletonFlat: Array }}
 */
export function buildRotationRefFromGeojson(geojson) {
  const fields = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojson, {
    forceCoordinateRouteSegments: true,
  });
  const baseFlat = JSON.parse(JSON.stringify(fields?.spaceNetworkGridJsonData || []));
  const { skeletonFlat, sections } = buildConnectSkeleton(baseFlat);
  const refAngleFlat = JSON.parse(JSON.stringify(skeletonFlat));
  scaleSkeletonToIntegerGrid(skeletonFlat, {});
  const refFull = reinsertBlackStations(JSON.parse(JSON.stringify(skeletonFlat)), sections);
  return { refFull, refAngleFlat, sections, skeletonFlat };
}
