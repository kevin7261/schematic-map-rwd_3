/* eslint-disable no-console */

import { useDataStore } from '@/stores/dataStore.js';
import { computeStationDataFromRoutes } from '@/utils/dataExecute/computeStationDataFromRoutes.js';
import { buildSchematicGraph, splitHighDegreeNodes } from './graph.js';
import { findOutputOverlaps, resolveSharedCorridorDrawing } from './assemble.js';
import { resolveSchematicInput, readPt } from './input.js';

const MAX_LIST_ROWS = 60;
const MAX_HIGHLIGHTS = 200;

function routeNameOf(seg) {
  return String(seg?.route_name ?? seg?.name ?? '?').trim() || '?';
}

function polylineSubEdges(pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
  return out;
}

function fixedCorridorHighlights(fullFlat, graph) {
  const out = [];
  for (const edge of graph?.edges || []) {
    if (edge.isLink) continue;
    const sis = edge.sections || [];
    if (sis.length <= 1) continue;
    const primary = sis.find((si) => !fullFlat[si]?._schematicCorridorSkipDraw) ?? sis[0];
    const routes = fullFlat[primary]?._schematicCorridorRoutes || sis.map((si) => routeNameOf(fullFlat[si]));
    const pts = Array.isArray(fullFlat[primary]?.points) ? fullFlat[primary].points.map(readPt) : [];
    for (const [a, b] of polylineSubEdges(pts)) {
      out.push({ points: [a, b], routes, kind: 'fixed', fixed: true });
    }
  }
  return out;
}

/** 掃描 + 立即套用骨架慣例（一條多色虛線）到預覽資料。 */
export function scanSchematicInputOverlaps(layerId) {
  const input = resolveSchematicInput(layerId);
  if (!input.ok) return { ok: false, message: input.message };

  const graph = splitHighDegreeNodes(buildSchematicGraph(input.skeletonFlat), 8);
  const preview = JSON.parse(JSON.stringify(input.skeletonFlat));
  const corridor = resolveSharedCorridorDrawing(preview, graph);

  const rows = [];
  for (const edge of graph.edges || []) {
    if (edge.isLink) continue;
    const sis = edge.sections || [];
    if (sis.length <= 1) continue;
    const routes = [...new Set(sis.map((si) => routeNameOf(preview[si])))];
    rows.push({
      kind: 'corridor',
      routes,
      label: `${routes.join(' × ')} → 已改多色虛線（${sis.length} 段）`,
    });
  }

  const geo = findOutputOverlaps(preview);
  for (const ex of geo.examples) {
    rows.push({
      kind: 'geometry',
      routes: [ex.r1, ex.r2],
      label: `「${ex.r1}」×「${ex.r2}」仍重疊`,
    });
  }

  const highlights = [
    ...fixedCorridorHighlights(preview, graph),
    ...geo.examples.map((e) => ({
      points: [e.a, e.b],
      routes: [e.r1, e.r2],
      kind: 'geometry',
      fixed: false,
    })),
  ];

  return {
    ok: true,
    corridorCount: corridor.corridorGroups || 0,
    collinearCount: corridor.collinearGroups || 0,
    geometryCount: geo.count,
    fixedCount: (corridor.corridorGroups || 0) + (corridor.collinearGroups || 0),
    total: geo.count,
    rows,
    highlights,
    skeletonFlat: preview,
    corridor,
  };
}

export function applySchematicOverlapScanToLayer(layer, scan) {
  const dataStore = useDataStore();
  if (!layer) {
    dataStore.clearOverlappingSegmentHighlight();
    return;
  }
  if (!scan?.ok) {
    layer.schematicOverlapScan = scan?.message ? { error: scan.message, total: 0, rows: [] } : null;
    dataStore.clearOverlappingSegmentHighlight();
    return;
  }

  layer.schematicOverlapScan = {
    corridorCount: scan.corridorCount,
    collinearCount: scan.collinearCount,
    geometryCount: scan.geometryCount,
    fixedCount: scan.fixedCount,
    total: scan.total,
    rows: scan.rows.slice(0, MAX_LIST_ROWS),
    truncated: scan.rows.length > MAX_LIST_ROWS,
    layoutDone: false,
  };

  layer.spaceNetworkGridJsonData = scan.skeletonFlat;
  const computed = computeStationDataFromRoutes(scan.skeletonFlat);
  layer.spaceNetworkGridJsonData_SectionData = computed.sectionData;
  layer.spaceNetworkGridJsonData_ConnectData = computed.connectData;
  layer.spaceNetworkGridJsonData_StationData = computed.stationData;
  layer.isLoaded = true;

  dataStore.setOverlappingSegmentHighlight(scan.highlights.slice(0, MAX_HIGHLIGHTS));
}

export function syncPostLayoutOverlapState(layer, fullFlat, corridor, outOv) {
  const dataStore = useDataStore();
  if (!layer) return;

  // 只在地圖上標「真正未解決的重疊」（橘）。已合併的共軌本身就以多色交錯虛線呈現，
  // 不再疊綠色診斷標記（會讓乾淨的共軌看起來像重疊）。
  const highlights = [];
  for (const ex of outOv.examples || []) {
    highlights.push({
      points: [ex.a, ex.b],
      routes: [ex.r1, ex.r2],
      kind: 'geometry',
      fixed: false,
    });
  }

  const merged = (corridor?.corridorGroups || 0) + (corridor?.collinearGroups || 0);
  layer.schematicOverlapScan = {
    corridorCount: corridor?.corridorGroups || 0,
    collinearCount: corridor?.collinearGroups || 0,
    geometryCount: outOv.count,
    fixedCount: merged,
    total: outOv.count,
    layoutDone: true,
    rows: outOv.count > 0 ? outOv.examples.map((e) => ({
      kind: 'geometry',
      routes: [e.r1, e.r2],
      label: `「${e.r1}」×「${e.r2}」仍重疊`,
    })) : [],
    truncated: outOv.count > 8,
  };

  dataStore.setOverlappingSegmentHighlight(highlights.slice(0, MAX_HIGHLIGHTS));
}

export function refreshSchematicOverlapScan(layer) {
  if (!layer?.layerId) return { ok: false, message: '無圖層' };
  if (layer.dashboardData?.algo && Array.isArray(layer.spaceNetworkGridJsonData)) {
    const flat = layer.spaceNetworkGridJsonData;
    const outOv = findOutputOverlaps(flat);
    const mergedSegs = flat.filter(
      (s) => !s._schematicCorridorSkipDraw && s._schematicCorridorRoutes?.length >= 2
    ).length;
    syncPostLayoutOverlapState(layer, flat, { corridorGroups: mergedSegs, collinearGroups: 0 }, outOv);
    return { ok: true, total: outOv.count, fixedCount: mergedSegs };
  }
  const scan = scanSchematicInputOverlaps(layer.layerId);
  applySchematicOverlapScanToLayer(layer, scan);
  return scan;
}
