/* eslint-disable no-console */

/**
 * 站點與路線調整佈局結果寫回圖層（邏輯同 schematic/assemble.writeSchematicResultToLayer，獨立入口）。
 */

import { useDataStore } from '@/stores/dataStore.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest4/flatSegmentsToGeojsonStyleExportRows.js';
import { resolveSharedCorridorDrawing } from '../schematic/assemble.js';
import { schematicStats } from '../schematic/objective.js';
  import { isRouteAdjustLayoutOrAiLayer } from './layerIds.js';

/**
 * @returns {{ ok: boolean, message?: string, stats?: object, corridor?: object }}
 */
export function writeRouteAdjustLayoutResultToLayer(layerId, fullFlat, meta = {}) {
  const dataStore = useDataStore();
  const layer = dataStore.findLayerById(layerId);
  if (!layer) return { ok: false, message: '找不到圖層 ' + layerId };
  if (!Array.isArray(fullFlat) || fullFlat.length === 0) {
    return { ok: false, message: '無結果路段可寫入' };
  }

  const corridor = isRouteAdjustLayoutOrAiLayer(layerId)
    ? resolveSharedCorridorDrawing(fullFlat, meta._schematicGraph ?? null)
    : null;

  for (const seg of fullFlat) {
    if (seg && seg.color == null) seg.color = seg.way_properties?.tags?.color || undefined;
    if (seg && seg.route_colors == null) {
      const rc = seg.way_properties?.tags?.route_colors;
      if (rc) seg.route_colors = rc;
    }
    if (seg?.route_colors != null) {
      if (!seg.way_properties) seg.way_properties = { tags: {} };
      if (!seg.way_properties.tags) seg.way_properties.tags = {};
      seg.way_properties.tags.route_colors = seg.route_colors;
    }
    if (seg?._schematicCorridorSkipDraw) {
      if (!seg.way_properties) seg.way_properties = { tags: {} };
      if (!seg.way_properties.tags) seg.way_properties.tags = {};
      seg.way_properties.tags._schematicCorridorSkipDraw = true;
    }
  }

  layer.spaceNetworkGridJsonData = fullFlat;
  const computed = computeStationDataFromRoutes(fullFlat);
  layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  layer.showStationPlacement = false;

  try {
    layer.processedJsonData = flatSegmentsToGeojsonStyleExportRows(fullFlat);
  } catch (e) {
    console.error('routeAdjustLayout：匯出 processedJsonData 失敗', e);
    layer.processedJsonData = [];
  }

  const stats = schematicStats(fullFlat);
  const prevDash = layer.dashboardData && typeof layer.dashboardData === 'object' ? layer.dashboardData : {};
  const { _schematicGraph, ...dashMeta } = meta;
  void _schematicGraph;
  layer.dashboardData = {
    ...prevDash,
    ...dashMeta,
    segmentCount: fullFlat.length,
    ...stats,
    routeAdjustInputLayerId: meta.sourceLayerId,
  };
  layer.isLoaded = true;
  if (!layer.visible) layer.visible = true;
  dataStore.saveLayerState(layerId, { visible: true });

  return { ok: true, stats, corridor };
}
