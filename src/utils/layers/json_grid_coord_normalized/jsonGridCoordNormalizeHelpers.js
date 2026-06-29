/* eslint-disable no-console */

import { straightenSpaceNetworkAfterStrippingBlackStations } from '@/utils/dataExecute/straightenRoutesCurrentLayer.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { buildTaipeiC3StyleLayerFieldsFromStraightenedNetwork } from '@/utils/taipeiTest4/buildTaipeiC3StyleLayerFieldsFromStraightenedNetwork.js';
import { minimalLineStringFeatureCollectionFromRouteExportRows } from '@/utils/mapDrawnRoutesImport.js';
import { normalizeRouteSegmentEndpointType } from '@/utils/geojsonRouteHelpers.js';
import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';
import { minimalOsmXmlFromLonLatFeatureCollection } from './minimalOsmXmlFromGeoJson.js';

/**
 * @returns {{ type:'FeatureCollection', features: unknown[] }}
 */
export function lineStringFeatureCollectionFromSpaceNetwork(spaceNetworkJsonData) {
  const flat = normalizeSpaceNetworkDataToFlatSegments(spaceNetworkJsonData);
  const features = [];
  if (!Array.isArray(flat)) {
    return { type: 'FeatureCollection', features: [] };
  }
  for (const seg of flat) {
    const points = Array.isArray(seg?.points) ? seg.points : [];
    const coords = [];
    for (const p of points) {
      const x = Number(Array.isArray(p) ? p[0] : p?.x);
      const y = Number(Array.isArray(p) ? p[1] : p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      coords.push([x, y]);
    }
    if (coords.length < 2) continue;
    const routeName = String(seg.route_name ?? seg.name ?? 'Unknown');
    const wtags = seg.way_properties?.tags || {};
    const color =
      typeof wtags.color === 'string' && wtags.color.trim() !== '' ? wtags.color.trim() : '#666666';
    features.push({
      type: 'Feature',
      properties: {
        name: routeName,
        route_id: routeName,
        color,
      },
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function writeLayoutNormalizedLayerDataOsmFromNetwork(layer, spaceNetworkJsonData) {
  if (!layer) return;
  if (spaceNetworkJsonData == null) {
    layer.dataOSM = null;
    return;
  }
  const fc = lineStringFeatureCollectionFromSpaceNetwork(spaceNetworkJsonData);
  layer.dataOSM = minimalOsmXmlFromLonLatFeatureCollection(fc);
}

/**
 * 路網網格線：**直接**由 draw 匯出列建 LineString（每段照輸入 routeCoordinates 原樣，含中間轉折），
 * **不經 OSM XML 來回**（來回會把輸入結構改掉、把本來連續的線弄斷）。每段一條 way、不切不串。
 * @param {object} draw
 * @returns {Array} LineString 類型的 GeoJSON features
 */
export function freshLayoutLineFeaturesFromDraw(draw) {
  const rows = Array.isArray(draw?.dataJson)
    ? draw.dataJson
    : Array.isArray(draw?.jsonData)
      ? draw.jsonData
      : null;
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const fc = minimalLineStringFeatureCollectionFromRouteExportRows(rows, {
    routeLine: 'full',
    stationPoints: 'all',
  });
  const lineFeats = Array.isArray(fc?.features)
    ? fc.features.filter(
        (f) => f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString'
      )
    : [];
  for (const f of lineFeats) {
    const p = f.properties && typeof f.properties === 'object' ? f.properties : {};
    const idx =
      p.export_row_index != null && Number.isFinite(Number(p.export_row_index))
        ? Number(p.export_row_index)
        : -1;
    const row = idx >= 0 && idx < rows.length ? rows[idx] : null;
    if (!row || typeof row !== 'object') continue;
    const seg = row.segment && typeof row.segment === 'object' ? row.segment : null;
    const tw = row.traffic_weight;
    f.properties = {
      ...p,
      name: p.name || row.routeName || '',
      color: p.color || row.color || '#666666',
      tags: {
        ...(p.tags && typeof p.tags === 'object' ? p.tags : {}),
        color: row.color || p.color,
        name: row.routeName ?? p.name,
        route_name: row.routeName ?? p.name,
        ...(tw != null && Number.isFinite(Number(tw)) ? { traffic_weight: Number(tw) } : {}),
        ...(seg?.start?.station_id ? { start_station_id: seg.start.station_id } : {}),
        ...(seg?.end?.station_id ? { end_station_id: seg.end.station_id } : {}),
      },
    };
  }
  return lineFeats;
}

/**
 * 路網網格 connect 點：即時由 draw 匯出列建端點 Point（紅／藍），每站保留**自己的 route_name_list**
 * （依 station 身分分群，不依座標合併）→ 同一站(同 station_id)被多線共用才是 intersection(紅)，
 * 否則為 terminal(藍)；避免別線剛好穿過某終點時被誤併成交會。
 * @param {object} draw
 * @returns {Array} Point 類型的 GeoJSON features
 */
export function freshLayoutConnectPointFeaturesFromDraw(draw) {
  const rows = Array.isArray(draw?.dataJson)
    ? draw.dataJson
    : Array.isArray(draw?.jsonData)
      ? draw.jsonData
      : null;
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const fc = minimalLineStringFeatureCollectionFromRouteExportRows(rows, {
    stationPoints: 'endpoints',
    routeLine: 'endpoints',
  });
  return Array.isArray(fc?.features)
    ? fc.features
        .filter((f) => f?.geometry?.type === 'Point')
        .map((f) => {
          const p = f.properties || {};
          const t = normalizeRouteSegmentEndpointType(p.type ?? p.tags?.type ?? 'normal');
          return {
            ...f,
            nodeType: 'connect',
            properties: {
              ...p,
              node_type: 'connect',
              type: t,
              tags: { ...(p.tags || {}), node_type: 'connect', type: t },
            },
          };
        })
    : [];
}

/**
 * 路網網格 dataOSM：**完全照輸入匯出列**，每個 section 原封不動各做一條 way（routeLine:'full'）。
 * 不切段（不依座標重新切）、也不串接合併 —— 輸入本來連續就連續、本來分段就分段。
 * @param {object} layer
 * @param {Array} exportRows 匯出列（含 routeName／color／routeCoordinates）
 */
export function writeLayoutNormalizedLayerDataOsmFromExportRows(layer, exportRows) {
  if (!layer) return;
  if (!Array.isArray(exportRows) || exportRows.length === 0) {
    layer.dataOSM = null;
    return;
  }
  const fc = minimalLineStringFeatureCollectionFromRouteExportRows(exportRows, {
    routeLine: 'full',
    stationPoints: 'all',
  });
  const hasLine =
    Array.isArray(fc?.features) && fc.features.some((f) => f?.geometry?.type === 'LineString');
  layer.dataOSM = hasLine ? minimalOsmXmlFromLonLatFeatureCollection(fc) : null;
}

/**
 * 本圖層路網輸入（b 或已存在之路網格狀資料）。
 *
 * @param {{ routeLineFromExportRows?: 'endpoints' | 'full' }} [options]
 *   `full`：在僅有匯出列、`geojsonData` 曾以起迄視圖產製時，改自 `dataJson`／`jsonData` 還原
 *   完整 routeCoordinates 折鏈（與 HV 統計／頂點表一致）。
 * @returns {{ spaceNetwork: unknown[], fromExistingSn: boolean } | null}
 */
export function resolveB3InputSpaceNetwork(coordLayer, options = {}) {
  const routeLineFromRows =
    options.routeLineFromExportRows === 'full' ? 'full' : 'endpoints';

  if (
    Array.isArray(coordLayer?.spaceNetworkGridJsonData) &&
    coordLayer.spaceNetworkGridJsonData.length > 0
  ) {
    return { spaceNetwork: coordLayer.spaceNetworkGridJsonData, fromExistingSn: true };
  }

  const raw = Array.isArray(coordLayer?.dataJson)
    ? coordLayer.dataJson
    : Array.isArray(coordLayer?.jsonData)
      ? coordLayer.jsonData
      : null;
  const hasRaw = Array.isArray(raw) && raw.length > 0;

  let geojsonForExport = null;

  if (routeLineFromRows === 'full' && hasRaw) {
    geojsonForExport = minimalLineStringFeatureCollectionFromRouteExportRows(raw, {
      stationPoints: 'all',
      routeLine: 'full',
    });
  }

  if (!geojsonForExport?.features?.length) {
    const gj = coordLayer?.geojsonData;
    if (gj?.type === 'FeatureCollection' && Array.isArray(gj.features) && gj.features.length > 0) {
      geojsonForExport = gj;
    }
  }

  if (!geojsonForExport?.features?.length && hasRaw) {
    geojsonForExport = minimalLineStringFeatureCollectionFromRouteExportRows(raw, {
      stationPoints: routeLineFromRows === 'full' ? 'all' : 'endpoints',
      routeLine: routeLineFromRows,
    });
  }
  if (!geojsonForExport?.features?.length) {
    console.warn(
      'executeJsonGridCoordNormalize：本圖層無路網輸入（請於左側先開啟本圖層以自「OSM／GeoJSON → JSON」複製 dataJson／geojsonData，或貼入 spaceNetworkGridJsonData）'
    );
    return null;
  }

  const derived = buildTaipeiB3ExecuteLayerFieldsFromGeojson(geojsonForExport, {});
  const sn = derived?.spaceNetworkGridJsonData;
  if (!Array.isArray(sn) || sn.length === 0) {
    console.warn('executeJsonGridCoordNormalize：自本層 geojson／dataJson 建立 b3 路網失敗');
    return null;
  }
  return { spaceNetwork: sn, fromExistingSn: false };
}

/**
 * @returns {{ c3Network: unknown[], resolved: { fromExistingSn: boolean } } | null}
 */
export function buildC3NetworkForCoordNormalize(coordLayer) {
  const resolved = resolveB3InputSpaceNetwork(coordLayer);
  if (!resolved?.spaceNetwork?.length) return null;

  const straightened = straightenSpaceNetworkAfterStrippingBlackStations(resolved.spaceNetwork);
  if (!straightened) {
    console.warn('executeJsonGridCoordNormalize：內部 B3→C3（路線整形）失敗');
    return null;
  }

  const c3Derived = buildTaipeiC3StyleLayerFieldsFromStraightenedNetwork(straightened);
  const c3Network = c3Derived?.spaceNetworkGridJsonData;
  if (!Array.isArray(c3Network) || c3Network.length === 0) {
    console.warn('executeJsonGridCoordNormalize：無法取得 c3 路網');
    return null;
  }

  return { c3Network, resolved };
}
