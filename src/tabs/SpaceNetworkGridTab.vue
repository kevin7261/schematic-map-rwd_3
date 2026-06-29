<script setup>
  /**
   * 📊 SpaceNetworkGridTab.vue - 空間網絡網格數據視覺化分頁組件
   *
   * 功能說明：
   * 1. 📑 圖層分頁導航 - 顯示所有可見圖層的標籤頁
   * 2. 📊 當前圖層資訊 - 顯示選中圖層的名稱和詳細信息
   * 3. 📈 圖層摘要資料 - 顯示總數量、行政區數量等統計信息
   * 4. 🎨 D3.js 圖表 - 使用 D3.js 繪製各種類型的圖表（網格示意圖、行政區示意圖）
   * 5. 🔄 自動切換功能 - 當新圖層開啟時自動切換到該圖層的分頁
   *
   * @component SpaceNetworkGridTab
   * @version 2.0.0
   * @author Kevin Cheng
   */

  import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import {
    computeLeafletDrawStations,
    snapPointToLines,
    routeColorForIndex,
  } from '@/utils/leafletDrawStations.js';
  import { useDataStore } from '@/stores/dataStore.js';
  import {
    buildStraightSegments,
    computeFlipAnalysis,
    buildNShapeList,
    computeNShapeAnalysis,
  } from '@/utils/segmentUtils.js';
  import {
    networkCoordToMinSpacingOverlayCell,
    closestPointOnPolyline,
    collectLineStationGridPointsFromStationData,
    collectStationPlacementPoints,
    normalizeSpaceNetworkDataToFlatSegments,
  } from '@/utils/gridNormalizationMinDistance.js';
  import { createReducedSchematicPlotMapper } from '@/utils/schematicPlotMapper.js';
  import {
    overlayCoordsBeforeRemovalFromReduced,
    overlayReducedTooltipPair,
    remapOverlayCellAfterRemoval,
  } from '@/utils/dataExecute/execute_d_to_e_test.js';
  import {
    bresenhamGridCells,
    resolveTaipeiFStationNameAndId,
    buildConnectNumberToNameIdMap,
    buildConnectGridKeyToNameIdMap,
    buildSectionRouteGridNameIdMap,
    buildSectionGridKeyToNameIdMap,
    buildBlackStationDisplayByGrid,
    applyTaipeiFMergePruneRebuildToLayer,
  } from '@/utils/randomConnectSegmentWeights.js';
  import { buildListedSectionRouteGridCellKeySet } from '@/utils/taipeiFColRouteHighlightPlan.js';
  import * as layerStationsTowardSchematicCenter from '@/utils/layerStationsTowardSchematicCenter.js';
  import { isTaipeiTestStraighteningLayerId } from '@/utils/taipeiTestStraighteningLayerIds.js';
  import {
    TAIPEI_TEST_SPACE_NETWORK_STATION_TAB_IDS,
    isTaipeiTestCDLayerTab,
    isTaipeiTestCDELayerTab,
    isTaipeiTestCLayerTab,
    isTaipeiTestDLayerTab,
    isTaipeiTestELayerTab,
    isTaipeiTestFghiSpaceLayerTab as isTaipeiEfinalSpaceLayerTab,
    isTaipeiTestGOrHWeightLayerTab as isTaipeiGOrHWeightLayer,
    isTaipeiTestFLayerTab,
    isTaipeiTestILayerTab,
    isTaipeiTest3BcdeLayerTab,
    isTaipeiTest3I3OrJ3LayerTab,
  } from '@/utils/taipeiTestPipeline.js';
  import {
    isMapDrawnRoutesExportArray,
    mapDrawnExportRowsFromJsonDrawRoot,
    mergeSegmentStationsFromPriorExportRows,
    enrichExportRowStationsFromPool,
    expandLonLatChainFromRouteCoordinates,
  } from '@/utils/mapDrawnRoutesImport.js';
  import {
    getGeoJsonFeatureTagProps,
    normalizeRouteSegmentEndpointType,
    segmentNodeLon,
    segmentNodeLat,
  } from '@/utils/geojsonRouteHelpers.js';
  import {
    buildPinkDpRatioDetailMap,
    measurePinkDpFromScreenAnchors,
    isScreenDpAnchorFeature,
  } from '@/utils/routeMapAdjust/routeStations.js';
  import {
    SCHEMATIC_MILP_LAYER_ID,
    SCHEMATIC_MILP_READ_LAYER_ID,
  } from '@/utils/routeMapAdjust/schematic/layerIds.js';

  import * as d3 from 'd3';
  import {
    buildRouteWeightStrokeScaleLinear,
    collectWeightsFromGeoRouteFeatures,
    formatStrokeWidthPx,
    strokeWidthPxFromWeightScale,
  } from '@/utils/routeWeightStrokeScale.js';
  import {
    niceTickStepMultipleOf5,
    buildTicksInRange,
    snapCoarseGridStepToMultipleOf5,
    formatAxisTickLabelMaxTwoDecimals,
  } from '@/utils/gridAxisTicks.js';
  import {
    isSpaceLayoutUniformGridViewerLayerId,
    LAYER_ID as OSM_2_GEOJSON_2_JSON_LAYER_ID,
    getOsm2GeojsonSessionOsmXml,
  } from '@/utils/layers/osm_2_geojson_2_json/sessionOsmXml.js';
  import {
    JSON_GRID_COORD_NORMALIZED_LAYER_ID,
    POINT_ORTHOGONAL_LAYER_ID,
    COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID,
    LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS,
    LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
    isLineOrthogonalTowardCenterLayerId,
    isLayoutNetworkGridFromVhDrawLayerId,
    isLayoutVhDrawSecondCopyLayerId,
    isSpaceGridVhDrawFamilyLayerId,
    LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY,
    buildVhDrawStationRowsForLayoutMap,
    maxLayoutVhDrawBlackDotsOnLegInOpenXSlab,
    maxLayoutVhDrawBlackDotsOnLegInOpenYSlab,
    maxLayoutVhDrawBlackDotsOnLegInOpenXSlabPlotPx,
    maxLayoutVhDrawBlackDotsOnLegInOpenYSlabPlotPx,
    maxLayoutVhDrawLineWeightInOpenXSlab,
    maxLayoutVhDrawLineWeightInOpenYSlab,
    maxLayoutVhDrawLineWeightInOpenXSlabPlotPx,
    maxLayoutVhDrawLineWeightInOpenYSlabPlotPx,
    getNodeTrafficWeightFromLayoutSegment,
    applyLayoutVhDrawFineGridToFeatureCollection,
    featureCollectionGridBounds,
    computeLayoutVhDrawFineGridSpec,
    integerLatticeBlackDotAtPixelArcLengthAlongLineString,
    integerLatticeBlackDotAtPixelArcLengthAlongFineSubgridLineString,
    snapBlackDotGxGyToFineSubgridAlongPolyline,
    snapBlackDotGxGyToIntegerLatticeAlongPolyline,
    layoutVhDrawCopyRouteLabelFromExportRow,
    findLayoutSegmentMidNeighbors,
    layoutVhDrawCopyBlackDotRowMatchKey,
    classifyLayoutVhDrawBlackDotGeomKind,
    LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT,
  } from '@/utils/layers/json_grid_coord_normalized/index.js';
  import {
    resolveB3InputSpaceNetwork,
    freshLayoutLineFeaturesFromDraw,
    freshLayoutConnectPointFeaturesFromDraw,
  } from '@/utils/layers/json_grid_coord_normalized/jsonGridCoordNormalizeHelpers.js';
  import { osmXmlStringToGeojsonData } from '@/utils/layers/osm_2_geojson_2_json/pipeline.js';
  import { uniformGridCellFromLayoutMeta } from '@/utils/stationUniformGridGeoJson.js';
  import {
    LAYOUT_VH_DRAW_ROUTE_WEIGHT_ANIM_MS,
    easeInOutCubic,
    buildLayoutVhDrawRouteAnimSnapshot,
    interpolateLayoutVhDrawRouteAnimRemap,
    layoutVhDrawRouteAnimSnapshotHasMotion,
    buildPlotRemapFnsFromAnimRemap,
  } from '@/utils/layers/layout_network_grid_from_vh_draw/layoutVhDrawRouteWeightAnim.js';

  /**
   * 均勻網格族路線 hover：本層 dataJson 若曾由路網重算，segment.stations 可能被清空；
   * 先合併本層 processedJsonData，再自系譜父層（point_orthogonal／座標正規化／OSM 管線）補回同起迄之中段站。
   */
  function buildEnrichedMapDrawnRowsForUniformGridTooltip(dataStore, layerTab, activeLayer) {
    if (!isSpaceLayoutUniformGridViewerLayerId(layerTab) || !activeLayer) return null;
    const base = mapDrawnExportRowsFromJsonDrawRoot(activeLayer.jsonData, activeLayer.dataJson);
    if (!Array.isArray(base) || base.length === 0) return null;
    let out = JSON.parse(JSON.stringify(base));
    out = mergeSegmentStationsFromPriorExportRows(out, activeLayer.processedJsonData);

    const chainIds = [
      ...LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS,
      POINT_ORTHOGONAL_LAYER_ID,
      JSON_GRID_COORD_NORMALIZED_LAYER_ID,
      OSM_2_GEOJSON_2_JSON_LAYER_ID,
    ];
    for (const id of chainIds) {
      if (id === layerTab) continue;
      const src = dataStore.findLayerById(id);
      if (!src) continue;
      out = mergeSegmentStationsFromPriorExportRows(
        out,
        mapDrawnExportRowsFromJsonDrawRoot(src.jsonData, src.dataJson)
      );
      out = mergeSegmentStationsFromPriorExportRows(out, src.processedJsonData);
    }
    return out;
  }

  /**
   * layout-grid 比例條：黑點 max 為 0 之欄／列區間至少保留 minPt（預設 10）對應之 px，其餘寬高依正權重分配。
   * @param {unknown[]} vals
   * @param {number} spanPx
   * @param {(pt:number)=>number} ptToPx
   * @param {number} [minPt=10]
   */
  function slabRatiosBlackMaxWithMinPtForZeros(vals, spanPx, ptToPx, minPt = 10) {
    const span = Number(spanPx);
    const n = vals.length;
    if (n === 0 || !Number.isFinite(span) || span <= 0) return [];
    const minPx = Math.max(0, ptToPx(minPt));
    const v = vals.map((raw) => {
      const x = Number(raw);
      return Number.isFinite(x) && x > 0 ? x : 0;
    });
    const nZero = v.reduce((acc, x) => acc + (x === 0 ? 1 : 0), 0);
    const sumPos = v.reduce((a, b) => a + b, 0);

    if (nZero === 0) {
      if (!(sumPos > 0)) return v.map(() => 1 / n);
      return v.map((x) => x / sumPos);
    }

    if (!(sumPos > 0)) {
      const idealEach = Math.max(minPx, span / n);
      let alloc = v.map(() => idealEach);
      let allocSum = alloc.reduce((a, b) => a + b, 0);
      if (allocSum > span + 1e-9) {
        const f = span / allocSum;
        alloc = alloc.map((x) => x * f);
      }
      return alloc.map((x) => x / span);
    }

    const denom = span - minPx * nZero;
    if (denom <= 1e-9) {
      const eps = 1e-9;
      const w = v.map((x) => (x > 0 ? x : eps));
      const sum = w.reduce((a, b) => a + b, 0);
      return sum > 0 ? w.map((x) => x / sum) : v.map(() => 1 / n);
    }
    const k = (minPx * sumPos) / denom;
    const eff = v.map((x) => (x > 0 ? x : k));
    const sumEff = eff.reduce((a, b) => a + b, 0);
    if (!(sumEff > 0)) return v.map(() => 1 / n);
    return eff.map((x) => x / sumEff);
  }

  /** 與 MapTab 路段／站點 popup 同源（OSM／GeoJSON → JSON 檢視） */
  const escapeLayoutTooltipHtml = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const routeRowStationsOrderedTooltipSection = (row) => {
    const seg = row?.segment;
    if (!seg || typeof seg !== 'object') return '';
    const ordered = [];
    if (seg.start) ordered.push(seg.start);
    if (Array.isArray(seg.stations)) {
      for (const st of seg.stations) ordered.push(st);
    }
    if (seg.end) ordered.push(seg.end);
    if (!ordered.length) return '';
    let html = `<strong>stations（依序）</strong> ${ordered.length}<br>`;
    ordered.forEach((node, idx) => {
      const sid = escapeLayoutTooltipHtml(node.station_id ?? node.tags?.station_id ?? '');
      const snm = escapeLayoutTooltipHtml(
        node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? ''
      );
      const twRaw =
        idx === ordered.length - 1
          ? undefined
          : (node[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY] ??
            node.tags?.[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY]);
      const twTxt =
        twRaw !== undefined && twRaw !== null && Number.isFinite(Number(twRaw))
          ? ` · traffic_weight（連至沿路下一站）${escapeLayoutTooltipHtml(String(Number(twRaw)))}`
          : '';
      html += `<strong>#${idx + 1}</strong> station_id ${sid} · station_name ${snm}${twTxt}<br>`;
    });
    return html;
  };

  const routeIdPrefixFromStationId = (stationId) => {
    const m = String(stationId ?? '')
      .trim()
      .match(/^[A-Za-z]+/);
    return m ? m[0] : '';
  };

  const routeIdForTooltipRow = (row) => {
    const explicit = String(row?.route_id ?? row?.tags?.route_id ?? '').trim();
    if (explicit) return explicit;
    const seg = row?.segment;
    if (!seg || typeof seg !== 'object') return '';
    const counts = new Map();
    const bump = (node) => {
      const prefix = routeIdPrefixFromStationId(node?.station_id ?? node?.tags?.station_id);
      if (!prefix) return;
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    };
    bump(seg.start);
    for (const st of Array.isArray(seg.stations) ? seg.stations : []) bump(st);
    bump(seg.end);
    let best = '';
    let bestCount = 0;
    for (const [prefix, count] of counts.entries()) {
      if (count > bestCount) {
        best = prefix;
        bestCount = count;
      }
    }
    return best;
  };

  const routeExportRowPolylineTooltipHtml = (row, chain) => {
    if (!row || typeof row !== 'object') return '';
    if (!chain || chain.length < 1) return '';
    const [flon, flat] = chain[0];
    const head = `<strong>routeName</strong> ${escapeLayoutTooltipHtml(row.routeName)}<br>
<strong>route_id</strong> ${escapeLayoutTooltipHtml(routeIdForTooltipRow(row))}<br>
<strong>color</strong> ${escapeLayoutTooltipHtml(row.color)}<br>
<strong>lon</strong> ${escapeLayoutTooltipHtml(flon)}<br>
<strong>lat</strong> ${escapeLayoutTooltipHtml(flat)}`;
    const stations = routeRowStationsOrderedTooltipSection(row);
    return stations ? `${head}<br>${stations}` : head;
  };

  const stationEndpointTooltipHtmlFromProps = (propBag, endpointType, lonVal, latVal) => {
    const p = propBag && typeof propBag === 'object' ? propBag : {};
    const tags = p.tags && typeof p.tags === 'object' ? p.tags : {};
    const sid = escapeLayoutTooltipHtml(p.station_id ?? tags.station_id ?? '');
    const snm = escapeLayoutTooltipHtml(p.station_name ?? tags.station_name ?? tags.name ?? '');
    const rnl = p.route_name_list ?? tags.route_name_list;
    const rnlStr = Array.isArray(rnl)
      ? escapeLayoutTooltipHtml(JSON.stringify(rnl))
      : escapeLayoutTooltipHtml(String(rnl ?? '[]'));
    const cn = p.connect_number ?? tags.connect_number ?? '';
    const twRaw = p[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY] ?? tags[LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY];
    const twLine =
      twRaw !== undefined && twRaw !== null && Number.isFinite(Number(twRaw))
        ? `<br><strong>traffic_weight</strong> （連至沿路下一站）${escapeLayoutTooltipHtml(String(Number(twRaw)))}`
        : '';
    // 🩷 粉紅點重算所得之轉折比例（垂線/頭尾直線；即 RIGHT_ANGLE_PINK_DP_EPSILON_RATIO 比較對象）。
    const dpr = p.dp_ratio ?? tags.dp_ratio;
    const dprLine =
      dpr !== undefined && dpr !== null && Number.isFinite(Number(dpr))
        ? `<br><strong>dp_ratio（轉折比例）</strong> ${escapeLayoutTooltipHtml(Number(dpr).toFixed(3))}`
        : '';
    return `<strong>station_id</strong> ${sid}<br>
<strong>station_name</strong> ${snm}<br>
<strong>route_name_list</strong> ${rnlStr}<br>
<strong>type</strong> <code style="color:#c2185b">${escapeLayoutTooltipHtml(endpointType)}</code><br>
<strong>connect_number</strong> ${escapeLayoutTooltipHtml(cn)}<br>
<strong>lon</strong> ${escapeLayoutTooltipHtml(lonVal)}<br>
<strong>lat</strong> ${escapeLayoutTooltipHtml(latVal)}${twLine}${dprLine}`;
  };

  /**
   * @param {*} meta — layoutUniformGridMeta（wgs84／compressed）
   */
  function buildLayoutViewerUniformAxisTicks(meta, approxPerAxis = 12) {
    if (!meta || typeof meta !== 'object') return null;
    const nApprox = Math.max(4, Math.floor(Number(approxPerAxis)) || 12);

    if (meta.mode === 'wgs84' && meta.bounds && Number.isFinite(meta.divisionsPerAxis)) {
      const b = meta.bounds;
      const div = Math.max(1, Math.floor(Number(meta.divisionsPerAxis)));
      const stride = Math.max(1, Math.ceil(div / nApprox));
      const lonSpan = b.maxLon - b.minLon;
      const latSpan = b.maxLat - b.minLat;
      const xTicks = [];
      for (let i = 0; i <= div; i += stride) {
        xTicks.push(div > 0 && lonSpan !== 0 ? b.minLon + (lonSpan * i) / div : b.minLon + i);
      }
      const lastX = div > 0 && lonSpan !== 0 ? b.maxLon : b.minLon + div;
      if (
        xTicks.length === 0 ||
        Math.abs(xTicks[xTicks.length - 1] - lastX) > 1e-9 * Math.max(1, Math.abs(lastX))
      ) {
        xTicks.push(lastX);
      }
      const yTicks = [];
      for (let j = 0; j <= div; j += stride) {
        yTicks.push(div > 0 && latSpan !== 0 ? b.minLat + (latSpan * j) / div : b.minLat + j);
      }
      const lastY = div > 0 && latSpan !== 0 ? b.maxLat : b.minLat + div;
      if (
        yTicks.length === 0 ||
        Math.abs(yTicks[yTicks.length - 1] - lastY) > 1e-9 * Math.max(1, Math.abs(lastY))
      ) {
        yTicks.push(lastY);
      }
      return {
        xTicks,
        yTicks,
        xLabelsAsFloat: true,
        yLabelsAsFloat: true,
        skipDefaultBackgroundGrid: true,
      };
    }

    if (meta.mode === 'compressed' && Number.isFinite(meta.nx) && Number.isFinite(meta.ny)) {
      const nx = Math.max(0, Math.floor(Number(meta.nx)));
      const ny = Math.max(0, Math.floor(Number(meta.ny)));
      const sx = Math.max(1, Math.ceil((nx + 1) / nApprox));
      const sy = Math.max(1, Math.ceil((ny + 1) / nApprox));
      const xTicks = [];
      for (let i = 0; i <= nx; i += sx) xTicks.push(i);
      if (xTicks.length === 0 || xTicks[xTicks.length - 1] !== nx) xTicks.push(nx);
      const yTicks = [];
      for (let j = 0; j <= ny; j += sy) yTicks.push(j);
      if (yTicks.length === 0 || yTicks[yTicks.length - 1] !== ny) yTicks.push(ny);
      return {
        xTicks,
        yTicks,
        xLabelsAsFloat: false,
        yLabelsAsFloat: false,
        skipDefaultBackgroundGrid: true,
      };
    }

    return null;
  }

  /** 與 MapTab circleStyleForJsonEndpointType 非 hover 狀之色塊對應（D3 無 pane／半徑略同 Leaflet px） */
  function mapTabApproxBaseSvgForEndpoint(normType) {
    const t = normalizeRouteSegmentEndpointType(normType);
    if (t === 'terminal') {
      return { fill: '#9ec5fe', stroke: '#0d6efd', r: 4, strokeW: 2 };
    }
    if (t === 'intersection') {
      return { fill: '#f1aeb5', stroke: '#dc3545', r: 4, strokeW: 2 };
    }
    return { fill: '#1a1a1a', stroke: '#000000', r: 3, strokeW: 1 };
  }

  /** 與 MapTab circleStyleForJsonEndpointType hover 對應 */
  function mapTabApproxHoverSvgForEndpoint(normType) {
    const t = normalizeRouteSegmentEndpointType(normType);
    if (t === 'terminal') {
      return { fill: '#6ea8fe', stroke: '#052c65', r: 7, strokeW: 3 };
    }
    if (t === 'intersection') {
      return { fill: '#f5c2c7', stroke: '#58151c', r: 7, strokeW: 3 };
    }
    return { fill: '#555555', stroke: '#000000', r: 6, strokeW: 2 };
  }

  const emit = defineEmits(['active-layer-change']);

  /** taipei_f／taipei_g：與邊緣欄／列最大權重標籤同源，供權重比例格寬／列高用 */
  function accumulateTaipeiFColRowWeightMaxFromFeatures(routeFeatures) {
    const colWeightMax = new Map();
    const rowWeightMax = new Map();
    const consumeGeom = (geomCoords, props) => {
      const sw = props?.station_weights;
      if (!Array.isArray(sw) || sw.length === 0) return;
      const refPoints = props.original_points || props.points || geomCoords;
      if (!Array.isArray(refPoints) || refPoints.length < 2) return;
      const refCoords = refPoints
        .map((pt) => {
          if (Array.isArray(pt)) {
            return pt.length >= 2 ? [pt[0], pt[1]] : null;
          }
          return pt && pt.x !== undefined && pt.y !== undefined ? [pt.x, pt.y] : null;
        })
        .filter((pt) => pt !== null);
      if (refCoords.length < 2) return;
      for (const weightInfo of sw) {
        const { start_idx, end_idx, weight } = weightInfo;
        const wn = Number(weight);
        if (
          !Number.isFinite(wn) ||
          typeof start_idx !== 'number' ||
          typeof end_idx !== 'number' ||
          start_idx < 0 ||
          end_idx < 0 ||
          start_idx >= refCoords.length ||
          end_idx >= refCoords.length ||
          start_idx >= end_idx
        ) {
          continue;
        }
        for (let i = start_idx; i < end_idx; i++) {
          const ax = Math.round(Number(refCoords[i][0]));
          const ay = Math.round(Number(refCoords[i][1]));
          const bx = Math.round(Number(refCoords[i + 1][0]));
          const by = Math.round(Number(refCoords[i + 1][1]));
          const verts = bresenhamGridCells(ax, ay, bx, by);
          for (let j = 0; j < verts.length - 1; j++) {
            const [x0, y0] = verts[j];
            const [x1, y1] = verts[j + 1];
            if (y0 === y1) {
              const ix = Math.min(x0, x1);
              colWeightMax.set(ix, Math.max(colWeightMax.get(ix) ?? -Infinity, wn));
            } else if (x0 === x1) {
              const iy = Math.min(y0, y1);
              rowWeightMax.set(iy, Math.max(rowWeightMax.get(iy) ?? -Infinity, wn));
            }
          }
        }
      }
    };
    for (const feature of routeFeatures || []) {
      if (!feature?.geometry) continue;
      const props = feature.properties || {};
      const geom = feature.geometry;
      if (geom.type === 'LineString') consumeGeom(geom.coordinates, props);
      else if (geom.type === 'MultiLineString') {
        for (const coords of geom.coordinates || []) consumeGeom(coords, props);
      }
    }
    return { colWeightMax, rowWeightMax };
  }

  /**
   * 欄寬 ∝ 該欄最大權重（預設平方；squareWeights=false 時為線性）
   * 全為 0 則均分
   */
  function createTaipeiFWeightedXScale(
    xMin,
    xMax,
    marginLeft,
    plotW,
    colWeightMax,
    squareWeights = true
  ) {
    const n = Math.max(0, Math.round(xMax - xMin));
    if (n <= 0) {
      const s = d3
        .scaleLinear()
        .domain([xMin, xMax])
        .range([marginLeft, marginLeft + plotW]);
      return { scale: s, minCellWFrac: 1 };
    }
    const contribs = [];
    for (let j = 0; j < n; j++) {
      const ix = xMin + j;
      const w = colWeightMax.get(ix);
      if (Number.isFinite(w) && w > 0) {
        contribs.push(squareWeights ? w * w : w);
      } else {
        contribs.push(0);
      }
    }
    const sum = contribs.reduce((a, b) => a + b, 0);
    const widthsPx = sum <= 0 ? Array(n).fill(plotW / n) : contribs.map((c) => (c / sum) * plotW);
    const minCellWFrac = Math.min(...widthsPx) / plotW;
    const xBorderPx = [marginLeft];
    for (let j = 0; j < n; j++) xBorderPx.push(xBorderPx[j] + widthsPx[j]);
    const scale = (x) => {
      const xf = Number(x);
      if (!Number.isFinite(xf)) return marginLeft;
      if (xf <= xMin) return xBorderPx[0];
      if (xf >= xMax) return xBorderPx[n];
      const j = Math.min(Math.max(0, Math.floor(xf - xMin)), n - 1);
      const t = xf - (xMin + j);
      return xBorderPx[j] + t * widthsPx[j];
    };
    scale.invert = (px) => {
      const p = Number(px);
      if (p <= xBorderPx[0]) return xMin;
      if (p >= xBorderPx[n]) return xMax;
      let j = 0;
      while (j < n && p > xBorderPx[j + 1]) j++;
      j = Math.min(j, n - 1);
      const denom = widthsPx[j] > 1e-12 ? widthsPx[j] : 1;
      return xMin + j + (p - xBorderPx[j]) / denom;
    };
    return { scale, minCellWFrac };
  }

  /**
   * 列高 ∝ 該列最大權重（預設平方；squareWeights=false 時為線性）
   * 全為 0 則均分；data y 大者在畫面上方
   */
  function createTaipeiFWeightedYScale(
    yMin,
    yMax,
    marginTop,
    plotH,
    rowWeightMax,
    squareWeights = true
  ) {
    const n = Math.max(0, Math.round(yMax - yMin));
    if (n <= 0) {
      const s = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([marginTop, marginTop + plotH]);
      return { scale: s, minCellHFrac: 1 };
    }
    const contribs = [];
    for (let j = 0; j < n; j++) {
      const iy = yMin + j;
      const w = rowWeightMax.get(iy);
      if (Number.isFinite(w) && w > 0) {
        contribs.push(squareWeights ? w * w : w);
      } else {
        contribs.push(0);
      }
    }
    const sum = contribs.reduce((a, b) => a + b, 0);
    const heightsPx = sum <= 0 ? Array(n).fill(plotH / n) : contribs.map((c) => (c / sum) * plotH);
    const minCellHFrac = Math.min(...heightsPx) / plotH;
    const yLinePx = new Array(n + 1);
    yLinePx[n] = marginTop;
    for (let k = n - 1; k >= 0; k--) {
      yLinePx[k] = yLinePx[k + 1] + heightsPx[k];
    }
    const scale = (y) => {
      const yf = Number(y);
      if (!Number.isFinite(yf)) return marginTop + plotH / 2;
      if (yf <= yMin) return yLinePx[0];
      if (yf >= yMax) return yLinePx[n];
      const j = Math.min(Math.max(0, Math.floor(yf - yMin)), n - 1);
      const t = yf - (yMin + j);
      return yLinePx[j] + t * (yLinePx[j + 1] - yLinePx[j]);
    };
    scale.invert = (py) => {
      const p = Number(py);
      if (p <= marginTop) return yMax;
      if (p >= marginTop + plotH) return yMin;
      for (let k = 0; k < n; k++) {
        const yLo = yLinePx[k];
        const yHi = yLinePx[k + 1];
        const span = yHi - yLo;
        if (span === 0) continue;
        const lo = Math.min(yLo, yHi);
        const hi = Math.max(yLo, yHi);
        if (p >= lo && p <= hi) {
          return yMin + k + (p - yLo) / span;
        }
      }
      return (yMin + yMax) / 2;
    };
    return { scale, minCellHFrac };
  }

  // Props
  const props = defineProps({
    containerHeight: {
      type: Number,
      default: 600,
    },
    isPanelDragging: {
      type: Boolean,
      default: false,
    },
    activeMarkers: {
      type: Array,
      default: () => [],
    },
    /** 對應 UpperView 之 space-network-grid 分頁是否顯示（供手繪轉網格後切層） */
    isActive: {
      type: Boolean,
      default: true,
    },
    /** 若為函數，只顯示 visible 且 filter(layer)===true 的圖層（例如 space-layout-grid-viewer 專用分頁） */
    layerFilter: {
      type: Function,
      default: null,
    },
    /** 區分同台掛載多個元件時之 SVG 容器 id（預設與先前相同；勿含空格） */
    containerIdSuffix: {
      type: String,
      default: '',
    },
    /**
     * canvas-layout-grid-viewer：繪區取容器可繪寬高之 min（短邊），格元正方形並置中（與測試3 square 邏輯一致）。
     * 不影響未掛此 prop 之 space-layout-grid-viewer／space-network-grid。
     */
    squarePlotByShorterSide: {
      type: Boolean,
      default: false,
    },
    /**
     * layout-grid-viewer：**繪區內像素**刻度與淺線（非整數網格座標）；不依細格細分線／區間「黑點 max」標籤。
     */
    layoutVhDrawPixelAxes: {
      type: Boolean,
      default: false,
    },
  });

  const dataStore = useDataStore();

  const activeLayerTab = ref(null); /** 📑 當前作用中的圖層分頁 */

  /** 與作用中圖層分頁一致（供 drawMap 內 layerTab 別名） */
  const spaceGridDataLayerTabId = computed(() => activeLayerTab.value);

  /**
   * 🆔 獲取動態容器 ID (Get Dynamic Container ID)
   * 基於當前活動圖層生成唯一的容器 ID，避免多圖層衝突；
   * 若 UpperView 同台掛兩個本元件（如 space-network-grid 與 space-layout-grid-viewer），須設定 containerIdSuffix 避免 getElementById 命中錯誤面板。
   */
  const getContainerId = () => {
    const layerId = activeLayerTab.value || 'default';
    const raw = typeof props.containerIdSuffix === 'string' ? props.containerIdSuffix.trim() : '';
    const safe = /^[a-zA-Z0-9_-]+$/.test(raw) ? raw : '';
    const suf = safe ? `-${safe}` : '';
    return `schematic-container-space-network-grid-${layerId}${suf}`;
  };

  // ==================== 📊 示意圖繪製相關狀態 (Schematic Drawing State) ====================

  /** 📊 網格數據狀態 (Grid Data State) */
  const gridData = ref(null);
  const gridDimensions = ref({ x: 10, y: 10 });

  /** 📊 行政區數據狀態 (Administrative District Data State) */
  const nodeData = ref(null);
  const linkData = ref(null);

  /** 📊 地圖數據狀態 (Map Data State) */
  const mapGeoJsonData = ref(null);

  /** taipei_g：resize 觸發自動合併時避免重入 */
  const taipeiFResizeAutoMergeRunning = ref(false);

  // ==================== 🎨 視覺化常數 (Visualization Constants) ====================

  /** 🎨 顏色配置 (Color Configuration) */
  const COLOR_CONFIG = {
    BACKGROUND: '#FFFFFF',
    GRID_LINE: '#666666',
    GRID_LINE_SECONDARY: '#333333',
    NODE_FILL: '#4CAF50',
    NODE_STROKE: '#2E7D32',
    TEXT_FILL: '#000000',
  };

  /** 🎨 顏色映射 (Color Mapping) */
  const colorMap = {
    red: '#ff0000',
    lightpink: '#ffb3ba',
    blue: '#0066cc',
    green: '#00aa44',
    lightgreen: '#90ee90',
    orange: '#ff8800',
    brown: '#8b4513',
    yellow: '#ffcc00',
    purple: '#800080',
    paleturquoise: '#afeeee',
    limegreen: '#32cd32',
  };

  // ResizeObserver 實例
  let resizeObserver = null;

  // 獲取所有開啟的圖層（可選僅列出 layerFilter 通過者）
  const visibleLayers = computed(() => {
    const allLayers = dataStore.getAllLayers().filter((layer) => layer.visible);
    const fn = props.layerFilter;
    if (typeof fn === 'function') {
      return allLayers.filter((layer) => {
        try {
          return Boolean(fn(layer));
        } catch (e) {
          void e;
          return false;
        }
      });
    }
    return allLayers;
  });

  /**
   * 📑 設定作用中圖層分頁 (Set Active Layer Tab)
   * @param {string} layerId - 圖層 ID
   */
  const setActiveLayerTab = (layerId) => {
    // 如果切換到相同圖層，不需要重新處理
    if (activeLayerTab.value === layerId) {
      return;
    }

    // 立即清除 SVG 內容和 tooltip，避免重疊
    const oldContainerId = getContainerId();
    d3.select(`#${oldContainerId}`).selectAll('svg').remove();
    d3.select('body').selectAll('.d3js-map-tooltip').remove();
    // 若離開 Leaflet 畫線圖層，銷毀地圖實例避免殘留 DOM
    destroyLeafletDrawMap();

    // 清除數據狀態
    gridData.value = null;
    nodeData.value = null;
    linkData.value = null;
    mapGeoJsonData.value = null;

    // 設置新的活動圖層
    activeLayerTab.value = layerId;

    dataStore.touchLastSpaceNetworkGridSketchTargetLayerId(layerId);

    // 通知父層目前 UpperView 的作用圖層
    emit('active-layer-change', activeLayerTab.value);
  };

  /**
   * 📊 當前圖層摘要 (Current Layer Summary)
   * 檢查圖層是否有任何可用的數據（dashboardData、spaceNetworkGridJsonData 等）
   */
  const currentLayerSummary = computed(() => {
    if (!activeLayerTab.value) {
      return null;
    }

    const layer = dataStore.findLayerById(activeLayerTab.value);
    if (!layer) return null;

    // 檢查是否有任何可用的數據（SpaceNetworkGridTab 只看 spaceNetworkGridJsonData）
    const hasData =
      (layer.dashboardData !== null && layer.dashboardData !== undefined) ||
      (layer.spaceNetworkGridJsonData !== null && layer.spaceNetworkGridJsonData !== undefined) ||
      (layer.dataTableData !== null && layer.dataTableData !== undefined);

    /** 資料處理 b3_dp→m3_dp 等：尚未執行「上一步」時尚無路網，仍應掛載繪圖容器以便有資料後重繪 */
    const hasSpaceNetworkGridTab =
      Array.isArray(layer.upperViewTabs) && layer.upperViewTabs.includes('space-network-grid');
    const hasSpaceLayoutGridViewerTab =
      Array.isArray(layer.upperViewTabs) &&
      (layer.upperViewTabs.includes('space-layout-grid-viewer') ||
        layer.upperViewTabs.includes('canvas-layout-grid-viewer') ||
        layer.upperViewTabs.includes('layout-grid-viewer'));

    // 如果有數據，返回 dashboardData（如果存在）或一個標記物件
    return hasData || hasSpaceNetworkGridTab || hasSpaceLayoutGridViewerTab
      ? layer.dashboardData || { hasData: true }
      : null;
  });

  /**
   * 📊 檢查當前圖層是否有 layerInfoData
   */
  const hasLayerInfoData = computed(() => {
    if (!activeLayerTab.value) {
      return false;
    }

    const layer = dataStore.findLayerById(activeLayerTab.value);

    return layer && layer.layerInfoData !== null && layer.layerInfoData !== undefined;
  });

  /**
   * 📊 取得圖層完整標題 (包含群組名稱) (Get Layer Full Title with Group Name)
   */
  const getLayerFullTitle = (layer) => {
    if (!layer) return { groupName: null, layerName: '未知圖層' };
    const groupName = dataStore.findGroupNameByLayerId(layer.layerId);
    return {
      groupName: groupName,
      layerName: layer.layerName,
    };
  };

  /**
   * 「版面網格·座標正規化」：自 OSM→GeoJSON 圖層（`osm_2_geojson_2_json`）之 dataOSM（或載入記憶之 session XML）解析路網 GeoJSON；
   * 不依賴本圖層之 osm-viewer 分頁。
   */
  const backingGeoJsonFromOsm2DataOsmForCoordNormViewer = (layer) => {
    if (!layer || layer.layerId !== JSON_GRID_COORD_NORMALIZED_LAYER_ID) return null;
    const osmLayer = dataStore.findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID);
    let xml = osmLayer?.dataOSM;
    if (!xml || !String(xml).trim()) {
      xml = getOsm2GeojsonSessionOsmXml();
    }
    if (xml && String(xml).trim()) {
      try {
        const { geojsonData } = osmXmlStringToGeojsonData(String(xml));
        if (geojsonData?.features?.length) return geojsonData;
      } catch (_) {
        /* fallback 至圖層已快取之 GeoJSON */
      }
    }
    const gj = osmLayer?.geojsonData || osmLayer?.dataGeojson;
    return gj?.type === 'FeatureCollection' && Array.isArray(gj.features) && gj.features.length > 0
      ? gj
      : null;
  };

  /**
   * 📦 取得此分頁可用的主要示意圖資料
   * SpaceNetworkGridTab 只看 spaceNetworkGridJsonData
   */
  const getSchematicJsonData = (layer) => {
    if (!layer) return null;
    return layer.spaceNetworkGridJsonData ?? null;
  };

  /**
   * 🎨 判斷是否為網格示意圖圖層 (Check if Layer is Grid Schematic)
   * @param {string} layerId - 圖層 ID
   * @returns {boolean} 是否為網格示意圖圖層
   */
  const isGridSchematicLayer = (layerId) => {
    if (!layerId) return false;
    const layer = dataStore.findLayerById(layerId);
    return layer && layer.isGridSchematic === true;
  };

  /**
   * 🗺️ 判斷是否為地圖圖層 (Check if Layer has Map GeoJSON Data or Normalize Segments)
   * @param {string} layerId - 圖層 ID
   * @returns {boolean} 是否為地圖圖層
   */
  const getMapFeatureCollection = (layer) => {
    if (!layer) return null;
    const schematic = getSchematicJsonData(layer);
    /** @type {{ type:'FeatureCollection', features: unknown[] }|null} */
    let base = null;
    // 路網網格：render 當下**直接由 draw 匯出列重建** geojson（線照輸入原樣、點各站自己的 type），
    // 不用可能過期的 persist `layer.geojsonData`（避免舊的被座標合併／截斷的版本）。
    if (isLayoutNetworkGridFromVhDrawLayerId(layer.layerId)) {
      const draw = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
      const lineFeats = freshLayoutLineFeaturesFromDraw(draw);
      const pointFeats = freshLayoutConnectPointFeaturesFromDraw(draw);
      if (lineFeats.length || pointFeats.length) {
        base = { type: 'FeatureCollection', features: [...lineFeats, ...pointFeats] };
      }
    }
    if (base) {
      // 已即時重建，直接往下走後續（細格／均勻格等）處理。
    } else if (
      schematic &&
      schematic.type === 'FeatureCollection' &&
      Array.isArray(schematic.features)
    ) {
      base = schematic;
    } else {
      const gj = layer.geojsonData;
      if (gj && gj.type === 'FeatureCollection' && Array.isArray(gj.features)) base = gj;
      else {
        base = backingGeoJsonFromOsm2DataOsmForCoordNormViewer(layer);
      }
    }
    if (!base) return null;
    /** @type {{ type:'FeatureCollection', features: unknown[] }} */
    let out = base;
    if (
      isLayoutNetworkGridFromVhDrawLayerId(layer.layerId) &&
      layer.layoutVhDrawFineGrid
    ) {
      const spec = computeLayoutVhDrawFineGridSpec(dataStore, base);
      if (spec) {
        out = JSON.parse(JSON.stringify(base));
        applyLayoutVhDrawFineGridToFeatureCollection(out, spec);
      }
    }
    const ug = layer.layoutUniformGridGeoJson;
    if (
      ug &&
      ug.type === 'FeatureCollection' &&
      Array.isArray(ug.features) &&
      ug.features.length > 0
    ) {
      return {
        type: 'FeatureCollection',
        features: [...out.features, ...ug.features],
      };
    }
    return out;
  };

  /**
   * 🗺️ 檢查是否為 Normalize Segments 格式
   * @param {any} data - 數據
   * @returns {boolean} 是否為 Normalize Segments 格式
   */
  const isNormalizeSegmentsFormat = (data) => {
    if (!Array.isArray(data) || data.length === 0) return false;
    // 檢查第一個元素是否有 Normalize Segments 的結構
    const firstItem = data[0];

    // 檢查是否為 2-5 格式（按路線分組）
    if (firstItem && firstItem.route_name && Array.isArray(firstItem.segments)) {
      return true;
    }

    // 檢查是否為一般 Normalize Segments 格式
    // points 可能是 [x,y]、[x,y,props] 或 { x, y }，皆視為可繪製路網
    const firstPoint = firstItem?.points?.[0];
    const isArrayPoint =
      Array.isArray(firstPoint) && firstPoint.length >= 2 && Number.isFinite(Number(firstPoint[0]));
    const isObjectPoint =
      firstPoint &&
      typeof firstPoint === 'object' &&
      !Array.isArray(firstPoint) &&
      Number.isFinite(Number(firstPoint.x)) &&
      Number.isFinite(Number(firstPoint.y));

    return (
      firstItem &&
      typeof firstItem === 'object' &&
      Array.isArray(firstItem.points) &&
      firstItem.points.length >= 2 &&
      (isArrayPoint || isObjectPoint)
    );
  };

  const isMapLayer = (layerId) => {
    if (!layerId) return false;
    const layer = dataStore.findLayerById(layerId);
    if (!layer) return false;

    // 檢查是否為 Normalize Segments 格式
    const d = getSchematicJsonData(layer);
    if (d && isNormalizeSegmentsFormat(d)) {
      return true;
    }

    // 檢查是否為 GeoJSON FeatureCollection 格式
    const fc = getMapFeatureCollection(layer);
    if (!fc) return false;

    // 檢查是否包含 Point / LineString / MultiLineString features
    return fc.features.some(
      (f) =>
        f &&
        f.geometry &&
        (f.geometry.type === 'Point' ||
          f.geometry.type === 'LineString' ||
          f.geometry.type === 'MultiLineString')
    );
  };

  // ==================== 📊 數據載入和處理函數 (Data Loading and Processing Functions) ====================

  /**
   * 📊 載入圖層數據 (Load Layer Data)
   * @param {string} layerId - 圖層 ID
   */
  const loadLayerData = async (layerId) => {
    try {
      // 找到指定的圖層
      const targetLayer = dataStore.findLayerById(layerId);
      if (!targetLayer) {
        throw new Error(`找不到圖層配置: ${layerId}`);
      }

      // 🎯 優先檢查是否為地圖圖層（有 GeoJSON 數據或 Normalize Segments）
      if (isMapLayer(layerId)) {
        const schematicData = getSchematicJsonData(targetLayer);
        // 檢查是否為 Normalize Segments 格式
        if (schematicData && isNormalizeSegmentsFormat(schematicData)) {
          // Normalize Segments 格式
          mapGeoJsonData.value = {
            type: 'NormalizeSegments',
            segments: schematicData,
          };
        } else {
          // 地圖數據（GeoJSON 格式）
          mapGeoJsonData.value = getMapFeatureCollection(targetLayer);
        }
        // 清除其他數據狀態
        gridData.value = null;
        nodeData.value = null;
        linkData.value = null;
      } else if (targetLayer.dataTableData && targetLayer.dataTableData.length > 0) {
        // 清除地圖數據狀態
        mapGeoJsonData.value = null;

        // 表格數據格式，轉換為示意圖格式
        const schematicData = targetLayer.dataTableData.map((item) => ({
          color: item.color,
          name: item.name,
          nodes: item.nodes || [],
        }));

        nodeData.value = schematicData;

        setLinkData();
      } else {
        // 如果有 spaceNetworkGridJsonData，嘗試作為其他格式處理
        // 清除地圖數據狀態
        mapGeoJsonData.value = null;

        const d = getSchematicJsonData(targetLayer);
        if (!d) {
          const mayShowEmptySpaceNetwork =
            Array.isArray(targetLayer.upperViewTabs) &&
            (targetLayer.upperViewTabs.includes('space-network-grid') ||
              targetLayer.upperViewTabs.includes('space-layout-grid-viewer') ||
              targetLayer.upperViewTabs.includes('canvas-layout-grid-viewer') ||
              targetLayer.upperViewTabs.includes('layout-grid-viewer'));
          if (mayShowEmptySpaceNetwork) {
            gridData.value = null;
            nodeData.value = null;
            linkData.value = null;
            return;
          }
          console.error('❌ 無法找到圖層數據:', {
            layerId: layerId,
            hasSpaceNetworkGridJsonData: !!targetLayer.spaceNetworkGridJsonData,
            hasDataTableData: !!targetLayer.dataTableData,
            isLoaded: targetLayer.isLoaded,
          });
          throw new Error('無法從圖層數據中提取示意圖數據');
        }

        // 嘗試將資料作為節點數據使用
        if (Array.isArray(d)) {
          nodeData.value = d;
          setLinkData();
        } else if (d.type === 'grid') {
          // 網格數據
          gridData.value = d;
          gridDimensions.value = {
            x: d.gridX,
            y: d.gridY,
          };
        } else {
          // 其他格式，直接使用
          nodeData.value = d;
          setLinkData();
        }
      }
    } catch (error) {
      console.error('❌ 無法載入圖層數據:', error.message);
    }
  };

  /**
   * 📊 設定連接數據 (Set Link Data)
   */
  const setLinkData = () => {
    if (!nodeData.value) {
      console.warn('⚠️ setLinkData: nodeData.value 為空');
      linkData.value = [];
      return;
    }

    // 確保 nodeData.value 是數組
    if (!Array.isArray(nodeData.value)) {
      console.error('❌ setLinkData: nodeData.value 不是數組:', nodeData.value);
      linkData.value = [];
      return;
    }

    linkData.value = [];

    nodeData.value.forEach((path, index) => {
      // 確保 path 和 path.nodes 存在且是數組
      if (!path) {
        console.warn(`⚠️ setLinkData: 路徑 ${index} 為 null 或 undefined，跳過`);
        return;
      }
      if (!path.nodes) {
        console.warn(
          `⚠️ setLinkData: 路徑 ${index} (${path.name || '未命名'}) 缺少 nodes 屬性，跳過`
        );
        return;
      }
      if (!Array.isArray(path.nodes)) {
        console.warn(
          `⚠️ setLinkData: 路徑 ${index} (${path.name || '未命名'}) 的 nodes 不是數組 (${typeof path.nodes})，跳過`
        );
        return;
      }

      let thisX, thisY;
      let nodes = [];

      path.nodes.slice(0, path.nodes.length - 1).forEach((node) => {
        thisX = node.coord.x;
        thisY = node.coord.y;

        switch (node.type) {
          case 1:
          case 6:
          case 21:
          case 41:
            thisX = node.coord.x + 0.5;
            thisY = node.coord.y;
            break;
          case 2:
          case 8:
          case 12:
          case 32:
            thisX = node.coord.x;
            thisY = node.coord.y - 0.5;
            break;
          case 3:
          case 5:
          case 23:
          case 43:
            thisX = node.coord.x - 0.5;
            thisY = node.coord.y;
            break;
          case 4:
          case 7:
          case 14:
          case 34:
            thisX = node.coord.x;
            thisY = node.coord.y + 0.5;
            break;
        }

        nodes.push({
          value: node.value,
          type: node.type,
          coord: { x: thisX, y: thisY },
        });
      });

      let data = {
        color: colorMap[path.color] || path.color,
        name: path.name,
        nodes: nodes,
      };

      linkData.value.push(data);
    });
  };

  // ==================== 📏 容器尺寸和繪製函數 (Container Dimensions and Drawing Functions) ====================

  /**
   * 📏 獲取容器尺寸 (Get Container Dimensions)
   * @returns {Object} 包含 width 和 height 的尺寸物件
   */
  const getDimensions = () => {
    const container = document.getElementById(getContainerId());

    if (container) {
      // 獲取容器的實際可用尺寸
      const rect = container.getBoundingClientRect();
      const width = container.clientWidth || rect.width;
      const height = container.clientHeight || rect.height;

      const dimensions = {
        width: Math.max(width, 40),
        height: Math.max(height, 30),
      };

      // 更新 dataStore 中的尺寸狀態
      dataStore.updateD3jsDimensions(dimensions.width, dimensions.height);

      return dimensions;
    }

    // 如果找不到容器，使用預設尺寸
    const defaultDimensions = {
      width: 800,
      height: 600,
    };

    // 更新 dataStore 中的尺寸狀態
    dataStore.updateD3jsDimensions(defaultDimensions.width, defaultDimensions.height);

    return defaultDimensions;
  };

  /**
   * taipei_g 線性網格：依目前 SVG 版面、viewBox 與 d3 zoom 換算「一格」的螢幕 pt（與 Test4 相同 px→pt）
   */
  const refreshSpaceNetworkMinCellDimensions = () => {
    const b = dataStore.spaceNetworkSchematicPlotBounds;
    if (!b || !isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) {
      return;
    }
    const svgEl = document.querySelector(`#${getContainerId()} svg`);
    if (!svgEl || typeof svgEl.getBoundingClientRect !== 'function') {
      return;
    }
    const t = d3.zoomTransform(svgEl);
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    const vbw = vb && vb.width > 0 ? vb.width : 1;
    const vbh = vb && vb.height > 0 ? vb.height : 1;
    const scaleX = rect.width / vbw;
    const scaleY = rect.height / vbh;
    const xSpan = Math.max(1e-9, b.xSpan);
    const ySpan = Math.max(1e-9, b.ySpan);
    const cellWpxScreen =
      b.minCellWFrac != null && Number(b.minCellWFrac) > 0
        ? Number(b.minCellWFrac) * b.plotW * t.k * scaleX
        : (b.plotW / xSpan) * t.k * scaleX;
    const cellHpxScreen =
      b.minCellHFrac != null && Number(b.minCellHFrac) > 0
        ? Number(b.minCellHFrac) * b.plotH * t.k * scaleY
        : (b.plotH / ySpan) * t.k * scaleY;
    const ptWRaw = cellWpxScreen > 0 ? Math.max(1, Math.ceil(cellWpxScreen * 0.75)) : 0;
    const ptHRaw = cellHpxScreen > 0 ? Math.max(1, Math.ceil(cellHpxScreen * 0.75)) : 0;

    const rawMinW = Number(dataStore.taipeiFResizeMinWidthPtThreshold);
    const rawMinH = Number(dataStore.taipeiFResizeMinHeightPtThreshold);
    const MIN_W_PT = Number.isFinite(rawMinW) && rawMinW > 0 ? rawMinW : 10;
    const MIN_H_PT = Number.isFinite(rawMinH) && rawMinH > 0 ? rawMinH : 3;

    let reportMinW = ptWRaw;
    let reportMinH = ptHRaw;
    dataStore.updateSpaceNetworkGridMinCellDimensions(reportMinW, reportMinH);

    // 滑鼠縮放時不跑縮減網格（resize 依門檻自動合併）
    if (dataStore.taipeiFSpaceNetworkMouseZoom === true) {
      return;
    }
    const MAX_MERGE_DIFF = 4;
    if (taipeiFResizeAutoMergeRunning.value) return;
    const fLayer = isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)
      ? dataStore.findLayerById(activeLayerTab.value)
      : null;
    if (
      !fLayer ||
      !Array.isArray(fLayer.spaceNetworkGridJsonData) ||
      fLayer.spaceNetworkGridJsonData.length === 0
    ) {
      return;
    }
    // taipei_i：僅路網顯示，不跑與 Control 相同的 resize 自動合併
    if (fLayer.layerId != null && isTaipeiTestILayerTab(fLayer.layerId)) return;

    if (ptWRaw >= MIN_W_PT) {
      fLayer.taipeiFResizeAutoMergeHorizontalNext = 0;
    }
    if (ptHRaw >= MIN_H_PT) {
      fLayer.taipeiFResizeAutoMergeVerticalNext = 0;
    }

    const hNext = fLayer.taipeiFResizeAutoMergeHorizontalNext ?? 0;
    const vNext = fLayer.taipeiFResizeAutoMergeVerticalNext ?? 0;

    let axis = null;
    let diff = 0;
    if (ptWRaw < MIN_W_PT && hNext <= MAX_MERGE_DIFF) {
      axis = 'horizontal';
      diff = hNext;
    } else if (ptHRaw < MIN_H_PT && vNext <= MAX_MERGE_DIFF) {
      axis = 'vertical';
      diff = vNext;
    }
    if (!axis) return;

    taipeiFResizeAutoMergeRunning.value = true;
    nextTick(() => {
      try {
        // 與 Control「合併黑點路段」相同：merge → rebuild → 刪空欄列 → rebuild → 表格（見 applyTaipeiFMergePruneRebuildToLayer）
        const mergeResult = applyTaipeiFMergePruneRebuildToLayer(fLayer, {
          maxWeightDiff: diff,
          mergeAxisConstraint: axis,
        });
        dataStore.setTaipeiFResizeLastAutoMergeInfo({
          maxWeightDiff: diff,
          mergeAxisConstraint: axis,
          mergeCount: mergeResult.mergeCount,
          removedColCount: mergeResult.removedColCount,
          removedRowCount: mergeResult.removedRowCount,
          removedCols: mergeResult.removedCols,
          removedRows: mergeResult.removedRows,
          source: 'resize',
          at: Date.now(),
        });
        if (axis === 'horizontal') {
          fLayer.taipeiFResizeAutoMergeHorizontalNext = hNext + 1;
        } else {
          fLayer.taipeiFResizeAutoMergeVerticalNext = vNext + 1;
        }
        dataStore.requestSpaceNetworkGridFullRedraw();
      } finally {
        taipeiFResizeAutoMergeRunning.value = false;
      }
    });
  };

  /**
   * 🎨 繪製網格示意圖 (Draw Grid Schematic)
   */
  const drawGridSchematic = () => {
    if (!gridData.value) {
      return;
    }

    // 獲取容器尺寸
    const dimensions = getDimensions();

    // 添加適當的邊距
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // 檢查是否已存在 SVG，如果存在且尺寸相同則不需要重繪
    const containerId = getContainerId();
    const existingSvg = d3.select(`#${containerId}`).select('svg');
    if (existingSvg.size() > 0) {
      const existingWidth = parseFloat(existingSvg.attr('width'));
      const existingHeight = parseFloat(existingSvg.attr('height'));

      // 如果尺寸變化很小（小於 2px），則只更新尺寸而不重繪
      // 降低閾值以確保寬度變化時能正確重繪
      if (
        Math.abs(existingWidth - (width + margin.left + margin.right)) < 2 &&
        Math.abs(existingHeight - (height + margin.top + margin.bottom)) < 2
      ) {
        return;
      }
    }

    // 清除之前的圖表
    d3.select(`#${containerId}`).selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out');

    // 🔍 創建可縮放的內容群組
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');

    // 注意：現在使用實時計算的 columnMaxValues 和 rowMaxValues，不再需要預先計算的統計數據

    // 🎯 計算每列和每行的最大值（用於刪除邏輯）
    const columnMaxValues = new Array(gridDimensions.value.x).fill(0);
    const rowMaxValues = new Array(gridDimensions.value.y).fill(0);

    if (gridData.value && gridData.value.nodes) {
      gridData.value.nodes.forEach((node) => {
        columnMaxValues[node.x] = Math.max(columnMaxValues[node.x], node.value || 0);
        rowMaxValues[node.y] = Math.max(rowMaxValues[node.y], node.value || 0);
      });
    }

    // 遞歸計算需要隱藏的行列，直到所有單元格 >= 40px
    const computeHiddenIndices = () => {
      const hiddenCols = new Set();
      const hiddenRows = new Set();

      // 最多迭代次數，避免無限循環
      const maxIterations = Math.max(gridDimensions.value.x, gridDimensions.value.y);
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;

        // 🎯 計算當前可見列和行的最大值總和（用於比例分配）
        const visibleColumnMaxValues = columnMaxValues.filter((_, i) => !hiddenCols.has(i));
        const visibleRowMaxValues = rowMaxValues.filter((_, i) => !hiddenRows.has(i));

        const totalVisibleColumnValue = visibleColumnMaxValues.reduce((sum, val) => sum + val, 0);
        const totalVisibleRowValue = visibleRowMaxValues.reduce((sum, val) => sum + val, 0);

        // 🎯 計算每列的實際寬度和每行的實際高度
        const actualColumnWidths = columnMaxValues.map((maxVal, index) => {
          if (hiddenCols.has(index)) return 0;
          if (totalVisibleColumnValue === 0) {
            return width / visibleColumnMaxValues.length;
          }
          return (maxVal / totalVisibleColumnValue) * width;
        });

        const actualRowHeights = rowMaxValues.map((maxVal, index) => {
          if (hiddenRows.has(index)) return 0;
          if (totalVisibleRowValue === 0) {
            return height / visibleRowMaxValues.length;
          }
          return (maxVal / totalVisibleRowValue) * height;
        });

        let needAdjust = false;

        // 🎯 找出實際寬度 < 40 的列中，max 值最小的並隱藏
        const narrowColumns = columnMaxValues
          .map((max, index) => ({ index, max, width: actualColumnWidths[index] }))
          .filter((item) => !hiddenCols.has(item.index) && item.width < 40)
          .sort((a, b) => a.max - b.max);

        if (narrowColumns.length > 0 && visibleColumnMaxValues.length > 1) {
          hiddenCols.add(narrowColumns[0].index);
          needAdjust = true;
        }

        // 🎯 找出實際高度 < 40 的行中，max 值最小的並隱藏
        const shortRows = rowMaxValues
          .map((max, index) => ({ index, max, height: actualRowHeights[index] }))
          .filter((item) => !hiddenRows.has(item.index) && item.height < 40)
          .sort((a, b) => a.max - b.max);

        if (shortRows.length > 0 && visibleRowMaxValues.length > 1) {
          hiddenRows.add(shortRows[0].index);
          needAdjust = true;
        }

        // 如果這次迭代沒有調整，說明已達到穩定狀態
        if (!needAdjust) {
          break;
        }
      }

      return {
        hiddenColumnIndices: Array.from(hiddenCols),
        hiddenRowIndices: Array.from(hiddenRows),
      };
    };

    const { hiddenColumnIndices, hiddenRowIndices } = computeHiddenIndices();

    // 計算最終顯示的列數和行數
    const visibleColumns = gridDimensions.value.x - hiddenColumnIndices.length;
    const visibleRows = gridDimensions.value.y - hiddenRowIndices.length;

    // 🎯 最大值已經在上面計算過了，這裡直接使用

    // 過濾掉隱藏的列和行，只計算可見的最大值
    const visibleColumnMaxValues = columnMaxValues.filter(
      (_, i) => !hiddenColumnIndices.includes(i)
    );
    const visibleRowMaxValues = rowMaxValues.filter((_, i) => !hiddenRowIndices.includes(i));

    // 計算可見列/行的總和，用於比例分配
    const totalVisibleColumnValue = visibleColumnMaxValues.reduce((sum, val) => sum + val, 0);
    const totalVisibleRowValue = visibleRowMaxValues.reduce((sum, val) => sum + val, 0);

    // 🎯 根據最大值比例分配每列寬度和每行高度
    const columnWidths = columnMaxValues.map((maxVal, index) => {
      if (hiddenColumnIndices.includes(index)) {
        return 0; // 隱藏的列寬度為0
      }
      // 如果總和為0，平均分配
      if (totalVisibleColumnValue === 0) {
        return width / visibleColumns;
      }
      return (maxVal / totalVisibleColumnValue) * width;
    });

    const rowHeights = rowMaxValues.map((maxVal, index) => {
      if (hiddenRowIndices.includes(index)) {
        return 0; // 隱藏的行高度為0
      }
      // 如果總和為0，平均分配
      if (totalVisibleRowValue === 0) {
        return height / visibleRows;
      }
      return (maxVal / totalVisibleRowValue) * height;
    });

    // 計算累積位置（用於快速查找每列/行的起始位置）
    const columnPositions = [0];
    const rowPositions = [0];
    for (let i = 0; i < columnWidths.length; i++) {
      columnPositions.push(columnPositions[i] + columnWidths[i]);
    }
    for (let i = 0; i < rowHeights.length; i++) {
      rowPositions.push(rowPositions[i] + rowHeights[i]);
    }

    // 🎯 繪製邊界外框
    const borderGroup = zoomGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 🔍 設置縮放行為
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);

    // 繪製網格節點（使用 zoomGroup）
    drawGridNodes(
      zoomGroup,
      columnWidths,
      rowHeights,
      columnPositions,
      rowPositions,
      margin,
      hiddenColumnIndices,
      hiddenRowIndices,
      columnMaxValues,
      rowMaxValues
    );

    // 將此次重繪後的可見行列與單元尺寸寫入 store，供其他 Tab 讀取
    // 注意：這裡使用平均值作為參考，實際尺寸已經是動態的
    const avgCellWidth =
      visibleColumns > 0 ? width / visibleColumns : width / gridDimensions.value.x;
    const avgCellHeight = visibleRows > 0 ? height / visibleRows : height / gridDimensions.value.y;
    if (activeLayerTab.value) {
      dataStore.updateComputedGridState(activeLayerTab.value, {
        visibleX: visibleColumns,
        visibleY: visibleRows,
        cellWidth: avgCellWidth,
        cellHeight: avgCellHeight,
      });

      // 🔄 更新 drawJsonData，刪除被隱藏的行列
      updateDrawJsonData(hiddenColumnIndices, hiddenRowIndices);
    }
  };

  /**
   * 🔄 更新 drawJsonData（刪除被隱藏的行列）
   * @param {Array} hiddenColumnIndices - 被隱藏的列索引
   * @param {Array} hiddenRowIndices - 被隱藏的行索引
   */
  const updateDrawJsonData = (hiddenColumnIndices, hiddenRowIndices) => {
    if (!activeLayerTab.value || !gridData.value) return;

    const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    if (!currentLayer || !currentLayer.drawJsonData) return;

    // 建立快速查找的 Map：(x,y) -> node
    const nodeMap = new Map();
    gridData.value.nodes.forEach((node) => {
      nodeMap.set(`${node.x},${node.y}`, node);
    });

    /**
     * 獲取相鄰被刪除的 grid 值
     * @param {number} x - 當前節點的 x 座標
     * @param {number} y - 當前節點的 y 座標
     * @returns {Object} 包含四個方向相鄰被刪除的 grid 值
     */
    const getAdjacentDeletedValues = (x, y) => {
      const deletedNeighbors = {
        left: [], // 左側被刪除的列的值
        right: [], // 右側被刪除的列的值
        top: [], // 上方被刪除的行的值
        bottom: [], // 下方被刪除的行的值
      };

      // 檢查左側被刪除的列
      for (let checkX = x - 1; checkX >= 0; checkX--) {
        if (hiddenColumnIndices.includes(checkX)) {
          const deletedNode = nodeMap.get(`${checkX},${y}`);
          if (deletedNode) {
            deletedNeighbors.left.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的列就停止
          break;
        }
      }

      // 檢查右側被刪除的列
      for (let checkX = x + 1; checkX < gridDimensions.value.x; checkX++) {
        if (hiddenColumnIndices.includes(checkX)) {
          const deletedNode = nodeMap.get(`${checkX},${y}`);
          if (deletedNode) {
            deletedNeighbors.right.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的列就停止
          break;
        }
      }

      // 檢查上方被刪除的行
      for (let checkY = y - 1; checkY >= 0; checkY--) {
        if (hiddenRowIndices.includes(checkY)) {
          const deletedNode = nodeMap.get(`${x},${checkY}`);
          if (deletedNode) {
            deletedNeighbors.top.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的行就停止
          break;
        }
      }

      // 檢查下方被刪除的行
      for (let checkY = y + 1; checkY < gridDimensions.value.y; checkY++) {
        if (hiddenRowIndices.includes(checkY)) {
          const deletedNode = nodeMap.get(`${x},${checkY}`);
          if (deletedNode) {
            deletedNeighbors.bottom.push(deletedNode.value);
          }
        } else {
          // 遇到未被刪除的行就停止
          break;
        }
      }

      return deletedNeighbors;
    };

    // 建立列和行的映射（原始索引 -> 新索引）
    const columnMapping = new Map();
    const rowMapping = new Map();
    let newColIndex = 0;
    let newRowIndex = 0;

    for (let i = 0; i < gridDimensions.value.x; i++) {
      if (!hiddenColumnIndices.includes(i)) {
        columnMapping.set(i, newColIndex++);
      }
    }

    for (let i = 0; i < gridDimensions.value.y; i++) {
      if (!hiddenRowIndices.includes(i)) {
        rowMapping.set(i, newRowIndex++);
      }
    }

    // 過濾並重新映射節點
    const newNodes = gridData.value.nodes
      .filter((node) => !hiddenColumnIndices.includes(node.x) && !hiddenRowIndices.includes(node.y))
      .map((node) => {
        // 獲取相鄰被刪除的 grid 值（使用原始座標）
        const deletedNeighbors = getAdjacentDeletedValues(node.x, node.y);

        return {
          ...node,
          x: columnMapping.get(node.x),
          y: rowMapping.get(node.y),
          coord: {
            x: columnMapping.get(node.x),
            y: rowMapping.get(node.y),
          },
          // 相鄰被刪除的 grid 值
          deletedNeighbors: deletedNeighbors,
        };
      });

    // 重新計算統計數據
    const newGridX = gridDimensions.value.x - hiddenColumnIndices.length;
    const newGridY = gridDimensions.value.y - hiddenRowIndices.length;

    // 計算 X 排統計
    const xRowStats = [];
    for (let x = 0; x < newGridX; x++) {
      const values = newNodes.filter((node) => node.x === x).map((node) => node.value);
      if (values.length > 0) {
        xRowStats.push({
          row: x,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          count: values.length,
        });
      }
    }

    // 計算 Y 排統計
    const yRowStats = [];
    for (let y = 0; y < newGridY; y++) {
      const values = newNodes.filter((node) => node.y === y).map((node) => node.value);
      if (values.length > 0) {
        yRowStats.push({
          row: y,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          count: values.length,
        });
      }
    }

    // 計算整體統計
    const allValues = newNodes.map((node) => node.value);
    const overallStats = {
      min: Math.min(...allValues),
      max: Math.max(...allValues),
      avg: allValues.reduce((sum, val) => sum + val, 0) / allValues.length,
      count: allValues.length,
    };

    // 更新 drawJsonData
    currentLayer.drawJsonData = {
      ...currentLayer.drawJsonData,
      gridX: newGridX,
      gridY: newGridY,
      nodes: newNodes,
      totalNodes: newNodes.length,
      statsLabels: {
        xRowStats,
        yRowStats,
        overallStats,
        color: currentLayer.drawJsonData.statsLabels?.color || '#4CAF50',
        highlightColumnIndices: [],
        highlightRowIndices: [],
      },
    };
  };

  /**
   * 🔢 繪製網格節點 (Draw Grid Nodes)
   * @param {Object} svg - D3 SVG 選擇器
   * @param {Array} columnWidths - 每列的寬度陣列
   * @param {Array} rowHeights - 每行的高度陣列
   * @param {Array} columnPositions - 每列的累積位置陣列
   * @param {Array} rowPositions - 每行的累積位置陣列
   * @param {Object} margin - 邊距配置
   * @param {Array} hiddenColumnIndices - 需要隱藏的列索引
   * @param {Array} hiddenRowIndices - 需要隱藏的行索引
   * @param {Array} columnMaxValues - 每列的最大值陣列
   * @param {Array} rowMaxValues - 每行的最大值陣列
   */
  const drawGridNodes = (
    svg,
    columnWidths,
    rowHeights,
    columnPositions,
    rowPositions,
    margin,
    hiddenColumnIndices,
    hiddenRowIndices,
    columnMaxValues,
    rowMaxValues
  ) => {
    if (!gridData.value || !gridData.value.nodes) return;

    // 獲取當前圖層的 drawJsonData（暫時保留以備將來使用）
    // const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    // const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;

    // 計算可見列和行的累積位置
    const visibleColumnPositions = [0];
    let cumX = 0;
    for (let i = 0; i < columnWidths.length; i++) {
      if (!hiddenColumnIndices.includes(i)) {
        cumX += columnWidths[i];
        visibleColumnPositions.push(cumX);
      }
    }

    const visibleRowPositions = [0];
    let cumY = 0;
    for (let i = 0; i < rowHeights.length; i++) {
      if (!hiddenRowIndices.includes(i)) {
        cumY += rowHeights[i];
        visibleRowPositions.push(cumY);
      }
    }

    // 建立原始索引到可見索引的映射
    const columnToVisibleIndex = new Map();
    const rowToVisibleIndex = new Map();
    let visibleColIdx = 0;
    let visibleRowIdx = 0;

    for (let i = 0; i < columnWidths.length; i++) {
      if (!hiddenColumnIndices.includes(i)) {
        columnToVisibleIndex.set(i, visibleColIdx++);
      }
    }

    for (let i = 0; i < rowHeights.length; i++) {
      if (!hiddenRowIndices.includes(i)) {
        rowToVisibleIndex.set(i, visibleRowIdx++);
      }
    }

    // 創建節點群組
    const nodeGroup = svg.append('g').attr('class', 'grid-nodes');

    // 獲取當前圖層的 drawJsonData 以取得 deletedNeighbors 資訊
    const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;
    const drawNodes = drawJsonData ? drawJsonData.nodes : null;

    // 建立快速查找 drawNode 的 Map：(x,y) -> drawNode
    const drawNodeMap = new Map();
    if (drawNodes) {
      drawNodes.forEach((drawNode) => {
        drawNodeMap.set(`${drawNode.x},${drawNode.y}`, drawNode);
      });
    }

    // 繪製每個節點（只顯示數值文字，不顯示圓圈）
    gridData.value.nodes.forEach((node) => {
      // 檢查是否需要隱藏該節點
      if (hiddenColumnIndices.includes(node.x) || hiddenRowIndices.includes(node.y)) {
        return; // 不繪製此節點
      }

      const visibleColIdx = columnToVisibleIndex.get(node.x);
      const visibleRowIdx = rowToVisibleIndex.get(node.y);

      if (visibleColIdx === undefined || visibleRowIdx === undefined) return;

      // 計算節點中心位置
      const x = margin.left + visibleColumnPositions[visibleColIdx] + columnWidths[node.x] / 2;
      const y = margin.top + visibleRowPositions[visibleRowIdx] + rowHeights[node.y] / 2;

      // 節點數字顏色使用配置的文字顏色
      const nodeColor = COLOR_CONFIG.TEXT_FILL;

      // 使用固定字體大小，不受網格大小影響
      const fontSize = 14; // 固定字體大小

      // 只繪製節點數值文字，使用動態決定的顏色
      nodeGroup
        .append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', fontSize)
        .attr('font-weight', 'bold')
        .attr('fill', nodeColor)
        .text(node.value);

      // 🎯 繪製相鄰被刪除的 grid 值
      const drawNode = drawNodeMap.get(`${visibleColIdx},${visibleRowIdx}`);
      if (drawNode && drawNode.deletedNeighbors) {
        const deletedNeighbors = drawNode.deletedNeighbors;
        const deletedFontSize = 10; // 被刪除值的字體大小
        const deletedColor = '#FFA500'; // 橙色，用於區分

        // 計算當前格子的寬度和高度
        const cellWidth = columnWidths[node.x];
        const cellHeight = rowHeights[node.y];

        // 左側被刪除的值
        if (deletedNeighbors.left && deletedNeighbors.left.length > 0) {
          const leftText = deletedNeighbors.left.join(',');
          nodeGroup
            .append('text')
            .attr('x', x - cellWidth / 4)
            .attr('y', y)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(leftText);
        }

        // 右側被刪除的值
        if (deletedNeighbors.right && deletedNeighbors.right.length > 0) {
          const rightText = deletedNeighbors.right.join(',');
          nodeGroup
            .append('text')
            .attr('x', x + cellWidth / 4)
            .attr('y', y)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(rightText);
        }

        // 上方被刪除的值
        if (deletedNeighbors.top && deletedNeighbors.top.length > 0) {
          const topText = deletedNeighbors.top.join(',');
          nodeGroup
            .append('text')
            .attr('x', x)
            .attr('y', y - cellHeight / 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(topText);
        }

        // 下方被刪除的值
        if (deletedNeighbors.bottom && deletedNeighbors.bottom.length > 0) {
          const bottomText = deletedNeighbors.bottom.join(',');
          nodeGroup
            .append('text')
            .attr('x', x)
            .attr('y', y + cellHeight / 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'top')
            .attr('font-size', deletedFontSize)
            .attr('fill', deletedColor)
            .text(bottomText);
        }
      }
    });

    // 繪製統計數據標籤
    drawStatisticsLabels(
      svg,
      columnWidths,
      rowHeights,
      columnPositions,
      rowPositions,
      margin,
      hiddenColumnIndices,
      hiddenRowIndices,
      columnMaxValues,
      rowMaxValues
    );
  };

  /**
   * 📊 繪製統計數據標籤 (Draw Statistics Labels)
   * @param {Object} svg - D3 SVG 選擇器
   * @param {Array} columnWidths - 每列的寬度陣列
   * @param {Array} rowHeights - 每行的高度陣列
   * @param {Array} columnPositions - 每列的累積位置陣列
   * @param {Array} rowPositions - 每行的累積位置陣列
   * @param {Object} margin - 邊距配置
   * @param {Array} hiddenColumnIndices - 需要隱藏的列索引
   * @param {Array} hiddenRowIndices - 需要隱藏的行索引
   * @param {Array} columnMaxValues - 每列的最大值陣列
   * @param {Array} rowMaxValues - 每行的最大值陣列
   */
  const drawStatisticsLabels = (
    svg,
    columnWidths,
    rowHeights,
    columnPositions,
    rowPositions,
    margin,
    hiddenColumnIndices,
    hiddenRowIndices,
    columnMaxValues,
    rowMaxValues
  ) => {
    if (!gridData.value || !columnMaxValues || !rowMaxValues) return;

    // 創建統計標籤群組
    const statsGroup = svg.append('g').attr('class', 'statistics-labels');

    // 使用固定字體大小，不受網格大小影響
    const fontSize = 12; // 固定字體大小（比節點數字稍小）
    const labelOffset = 5;

    // 使用實時計算的最大值數據，而不是預先計算的數據
    const currentLayer = dataStore.findLayerById(activeLayerTab.value);
    const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;

    // 創建實時統計數據
    const xRowStats = columnMaxValues.map((maxVal, index) => ({
      row: index,
      max: maxVal,
    }));

    const yRowStats = rowMaxValues.map((maxVal, index) => ({
      row: index,
      max: maxVal,
    }));

    const color = drawJsonData?.statsLabels?.color || '#4CAF50';

    if (xRowStats && yRowStats) {
      // 計算可見列的累積位置
      const visibleColumnPositions = [0];
      let cumX = 0;
      for (let i = 0; i < columnWidths.length; i++) {
        if (!hiddenColumnIndices.includes(i)) {
          cumX += columnWidths[i];
          visibleColumnPositions.push(cumX);
        }
      }
      const totalVisibleGridWidth = cumX;

      // 計算可見行的累積位置
      const visibleRowPositions = [0];
      let cumY = 0;
      for (let i = 0; i < rowHeights.length; i++) {
        if (!hiddenRowIndices.includes(i)) {
          cumY += rowHeights[i];
          visibleRowPositions.push(cumY);
        }
      }

      // 建立原始索引到可見索引的映射
      const columnToVisibleIndex = new Map();
      const rowToVisibleIndex = new Map();
      let visibleColIdx = 0;
      let visibleRowIdx = 0;

      for (let i = 0; i < columnWidths.length; i++) {
        if (!hiddenColumnIndices.includes(i)) {
          columnToVisibleIndex.set(i, visibleColIdx++);
        }
      }

      for (let i = 0; i < rowHeights.length; i++) {
        if (!hiddenRowIndices.includes(i)) {
          rowToVisibleIndex.set(i, visibleRowIdx++);
        }
      }

      // 繪製 X 排（垂直方向）統計標籤 - 只顯示最大值
      if (xRowStats) {
        xRowStats.forEach((xStat, index) => {
          // 當該列被隱藏時，不顯示此標籤
          if (hiddenColumnIndices.includes(index)) {
            return; // 不繪製此標籤
          }

          const visibleColIdx = columnToVisibleIndex.get(xStat.row);
          if (visibleColIdx === undefined) return;

          const x =
            margin.left + visibleColumnPositions[visibleColIdx] + columnWidths[xStat.row] / 2;
          const y = margin.top - labelOffset;

          // 只顯示最大值標籤
          statsGroup
            .append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', fontSize)
            .attr('font-weight', 'bold')
            .attr('fill', color) // 使用預設顏色
            .text(`${xStat.max}`);
        });
      }

      // 繪製 Y 排（水平方向）統計標籤 - 只顯示最大值
      if (yRowStats) {
        yRowStats.forEach((yStat, index) => {
          // 當該行被隱藏時，不顯示此標籤
          if (hiddenRowIndices.includes(index)) {
            return; // 不繪製此標籤
          }

          const visibleRowIdx = rowToVisibleIndex.get(yStat.row);
          if (visibleRowIdx === undefined) return;

          const x = margin.left + totalVisibleGridWidth + labelOffset;
          const y = margin.top + visibleRowPositions[visibleRowIdx] + rowHeights[yStat.row] / 2;

          // 只顯示最大值標籤（整個網格右側）
          statsGroup
            .append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', fontSize)
            .attr('font-weight', 'bold')
            .attr('fill', color) // 使用預設顏色
            .text(`${yStat.max}`);
        });
      }
    }
  };

  /**
   * 🎨 繪製行政區示意圖 (Draw Administrative District Schematic)
   */
  const drawAdministrativeSchematic = () => {
    if (!nodeData.value) {
      console.warn('⚠️ drawAdministrativeSchematic: nodeData.value 為空');
      return;
    }

    // 確保 nodeData.value 是數組
    if (!Array.isArray(nodeData.value)) {
      console.error('❌ nodeData.value 不是數組:', nodeData.value);
      return;
    }

    // 檢查數據格式並記錄無效的路徑
    const invalidPaths = nodeData.value.filter((path, index) => {
      if (!path) {
        console.warn(`⚠️ 路徑 ${index} 為 null 或 undefined`);
        return true;
      }
      if (!path.nodes) {
        console.warn(`⚠️ 路徑 ${index} (${path.name || '未命名'}) 缺少 nodes 屬性`);
        return true;
      }
      if (!Array.isArray(path.nodes)) {
        console.warn(
          `⚠️ 路徑 ${index} (${path.name || '未命名'}) 的 nodes 不是數組:`,
          typeof path.nodes
        );
        return true;
      }
      return false;
    });

    if (invalidPaths.length > 0) {
      console.warn(`⚠️ 發現 ${invalidPaths.length} 個無效路徑，將跳過這些路徑`);
    }

    // 畫布長寬px
    let dimensions = getDimensions();

    // 添加適當的邊距，確保內容不被截斷
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // 獲取所有節點座標（使用兼容 flatMap 的方法）
    const allPoints = nodeData.value.reduce((acc, d) => {
      if (d.nodes && Array.isArray(d.nodes)) {
        const points = d.nodes
          .map((node) => ({
            x: node.coord?.x,
            y: node.coord?.y,
          }))
          .filter((p) => p.x !== undefined && p.y !== undefined);
        return acc.concat(points);
      }
      return acc;
    }, []);

    // 找到點的最大最小值
    let xMax = d3.max(allPoints, (d) => d.x);
    let yMax = d3.max(allPoints, (d) => d.y);

    // 檢查是否已存在 SVG，如果存在且尺寸相同則不需要重繪
    const containerId = getContainerId();
    const existingSvg = d3.select(`#${containerId}`).select('svg');
    if (existingSvg.size() > 0) {
      const existingWidth = parseFloat(existingSvg.attr('width'));
      const existingHeight = parseFloat(existingSvg.attr('height'));

      // 如果尺寸變化很小（小於 2px），則只更新尺寸而不重繪
      // 降低閾值以確保寬度變化時能正確重繪
      if (
        Math.abs(existingWidth - (width + margin.left + margin.right)) < 2 &&
        Math.abs(existingHeight - (height + margin.top + margin.bottom)) < 2
      ) {
        return;
      }
    }

    // 清除之前的圖表
    d3.select(`#${containerId}`).selectAll('svg').remove();

    // 創建 SVG 元素
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out'); // 添加平滑過渡效果

    // 🔍 創建可縮放的內容群組
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');

    // 直接使用容器的完整尺寸，允許形狀變形以完全填滿容器
    const actualWidth = width;
    const actualHeight = height;

    // 繪製參數已準備就緒

    // 設定比例尺，使用實際繪圖區域
    const x = d3
      .scaleLinear()
      .domain([0, xMax])
      .range([margin.left, margin.left + actualWidth]);
    const y = d3
      .scaleLinear()
      .domain([yMax, 0])
      .range([margin.top, margin.top + actualHeight]);

    // 🎯 繪製邊界外框
    const borderGroup = zoomGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', actualWidth)
      .attr('height', actualHeight)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 🔍 設置縮放行為
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);

    // 創建線條生成器
    const lineGenerator = d3
      .line()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveNatural);

    // 繪製每個路徑的節點連接
    // 過濾掉無效的路徑
    const validPaths = nodeData.value.filter(
      (path) => path && path.nodes && Array.isArray(path.nodes)
    );
    validPaths.forEach((path) => {
      if (!path.nodes || !Array.isArray(path.nodes)) {
        return;
      }
      path.nodes.forEach((node) => {
        // 確保 node 和 node.coord 存在
        if (!node || !node.coord) {
          return;
        }

        let dString = '';
        let nodes = [];

        switch (node.type) {
          case 1:
            nodes = [
              { x: node.coord.x - 0.5, y: node.coord.y },
              { x: node.coord.x + 0.5, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 2:
            nodes = [
              { x: node.coord.x, y: node.coord.y - 0.5 },
              { x: node.coord.x, y: node.coord.y + 0.5 },
            ];
            dString = lineGenerator(nodes);
            break;
          case 3:
            nodes = [
              { x: node.coord.x + 0.5, y: node.coord.y },
              { x: node.coord.x - 0.5, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 4:
            nodes = [
              { x: node.coord.x, y: node.coord.y + 0.5 },
              { x: node.coord.x, y: node.coord.y - 0.5 },
            ];
            dString = lineGenerator(nodes);
            break;
          case 5:
            nodes = [
              { x: node.coord.x, y: node.coord.y },
              { x: node.coord.x - 0.5, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 6:
            nodes = [
              { x: node.coord.x + 0.5, y: node.coord.y },
              { x: node.coord.x, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 7:
            nodes = [
              { x: node.coord.x, y: node.coord.y + 0.5 },
              { x: node.coord.x, y: node.coord.y },
            ];
            dString = lineGenerator(nodes);
            break;
          case 8:
            nodes = [
              { x: node.coord.x, y: node.coord.y },
              { x: node.coord.x, y: node.coord.y - 0.5 },
            ];
            dString = lineGenerator(nodes);
            break;
          case 12:
          case 43: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) + arcWidth) },
                { x: node.coord.x, y: node.coord.y - 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x - 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) - arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(0)
              .endAngle(Math.PI / 2);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) - arcWidth}, ${y(node.coord.y) + arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          case 21:
          case 34: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) - arcWidth) },
                { x: node.coord.x, y: node.coord.y + 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x + 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) + arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(-Math.PI / 2)
              .endAngle(-Math.PI);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) + arcWidth}, ${y(node.coord.y) - arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          case 14:
          case 23: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) - arcWidth) },
                { x: node.coord.x, y: node.coord.y + 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x - 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) - arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(Math.PI / 2)
              .endAngle(Math.PI);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) - arcWidth}, ${y(node.coord.y) - arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          case 32:
          case 41: {
            let xWidth = Math.abs(x(node.coord.x - 0.5) - x(node.coord.x));
            let yHeight = Math.abs(y(node.coord.y) - y(node.coord.y - 0.5));

            let arcWidth = 0;

            if (xWidth < yHeight) {
              arcWidth = xWidth;

              nodes = [
                { x: node.coord.x, y: y.invert(y(node.coord.y) + arcWidth) },
                { x: node.coord.x, y: node.coord.y - 0.5 },
              ];
            } else {
              arcWidth = yHeight;

              nodes = [
                { x: node.coord.x + 0.5, y: node.coord.y },
                { x: x.invert(x(node.coord.x) + arcWidth), y: node.coord.y },
              ];
            }

            dString = lineGenerator(nodes);

            const arc = d3
              .arc()
              .innerRadius(arcWidth - 3)
              .outerRadius(arcWidth + 3)
              .startAngle(0)
              .endAngle(-Math.PI / 2);

            zoomGroup
              .append('path')
              .attr('d', arc)
              .attr(
                'transform',
                `translate(${x(node.coord.x) + arcWidth}, ${y(node.coord.y) + arcWidth})`
              )
              .attr('fill', path.color);
            break;
          }
          default:
            break;
        }

        if (dString !== '') {
          zoomGroup
            .append('path')
            .attr('d', dString)
            .attr('stroke', path.color)
            .attr('fill', 'none')
            .attr('stroke-width', 6);
        }
      });
    });

    // 繪製節點數值標籤
    if (linkData.value && Array.isArray(linkData.value)) {
      // 獲取當前圖層的 drawJsonData（暫時保留以備將來使用）
      // const currentLayer = dataStore.findLayerById(activeLayerTab.value);
      // const drawJsonData = currentLayer ? currentLayer.drawJsonData : null;

      const allLinks = linkData.value
        .filter((line) => line && line.nodes && Array.isArray(line.nodes))
        .flatMap((line) =>
          line.nodes.map((node) => ({
            ...node,
          }))
        );

      allLinks.forEach((node) => {
        // 確保 node 和 node.coord 存在
        if (!node || !node.coord || node.coord.x === undefined || node.coord.y === undefined) {
          return;
        }

        // 節點數字顏色使用配置的文字顏色
        const nodeColor = COLOR_CONFIG.TEXT_FILL;

        zoomGroup
          .append('text')
          .attr('x', x(node.coord.x))
          .attr('y', y(node.coord.y))
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '10px')
          .attr('fill', nodeColor)
          .text(`${node.value}`);
      });
    }
  };

  /** taipei_g 滑鼠縮放：強制重繪時保留 d3 zoom、焦點格索引 */
  let drawMapForceNext = false;
  let savedTaipeiFZoomTransform = null;
  const taipeiFMouseZoomHover = ref({ ix: null, iy: null });
  let taipeiFMouseZoomRaf = 0;
  let scheduleTaipeiFDrawForMouseZoom = () => {};
  let layoutRouteWeightAnimRaf = 0;
  /** 路線漸變動畫幀節流:每幀整圖 full redraw 太貴,限制實際重繪 ≥ 此毫秒才一次(約 32fps 上限) */
  const LAYOUT_VH_DRAW_ROUTE_WEIGHT_ANIM_MIN_FRAME_MS = 31;
  let layoutRouteWeightAnimLastMs = 0;
  /** 路網網格_2 放大鏡（fisheye）焦點細格索引（fcx 自左 0-based、fcyTop 自上 0-based）；null=無放大 */
  const layoutVhDrawFisheyeFocus = ref(null);
  let layoutVhDrawFisheyeRaf = 0;
  let scheduleLayoutVhDrawFisheyeRedraw = () => {};
  /** 路網網格_2 最短路徑放大：點選紅/藍點（grid 座標）切換選取，點滿 2 個即計算放大、點第三個重設起點。 */
  const layoutVhDrawPathNodeKey = (gx, gy) => `${Number(gx).toFixed(3)},${Number(gy).toFixed(3)}`;
  const toggleLayoutVhDrawConnectSelection = (gx, gy) => {
    const cur = Array.isArray(dataStore.layoutVhDrawPathSel)
      ? dataStore.layoutVhDrawPathSel.slice()
      : [];
    const k = layoutVhDrawPathNodeKey(gx, gy);
    const idx = cur.findIndex((p) => layoutVhDrawPathNodeKey(p.gx, p.gy) === k);
    let next;
    if (idx >= 0) next = cur.filter((_, i) => i !== idx);
    else if (cur.length >= 2) next = [{ gx: Number(gx), gy: Number(gy) }];
    else next = [...cur, { gx: Number(gx), gy: Number(gy) }];
    dataStore.setLayoutVhDrawPathSel(next);
    scheduleLayoutVhDrawFisheyeRedraw();
  };

  const tickLayoutRouteWeightAnim = () => {
    const anim = dataStore.layoutVhDrawRouteAnim;
    if (!anim?.active) {
      layoutRouteWeightAnimRaf = 0;
      return;
    }
    const now = Date.now();
    const elapsed = now - Number(anim.startTime || 0);
    const rawT = Math.min(1, elapsed / LAYOUT_VH_DRAW_ROUTE_WEIGHT_ANIM_MS);
    if (rawT >= 1) {
      dataStore.clearLayoutVhDrawRouteAnim();
      layoutRouteWeightAnimRaf = 0;
      return;
    }
    // 節流:距上次更新未達門檻則略過本幀重繪(整圖 redraw 太貴),但保留 rAF 迴圈以準時結束
    if (now - layoutRouteWeightAnimLastMs >= LAYOUT_VH_DRAW_ROUTE_WEIGHT_ANIM_MIN_FRAME_MS) {
      layoutRouteWeightAnimLastMs = now;
      const t = easeInOutCubic(rawT);
      dataStore.setLayoutVhDrawRouteAnimProgress(t);
    }
    layoutRouteWeightAnimRaf = requestAnimationFrame(tickLayoutRouteWeightAnim);
  };

  const startLayoutRouteWeightAnimLoop = () => {
    if (layoutRouteWeightAnimRaf) return;
    layoutRouteWeightAnimLastMs = 0;
    layoutRouteWeightAnimRaf = requestAnimationFrame(tickLayoutRouteWeightAnim);
  };

  /**
   * 🗺️ 繪製地圖 (Draw Map)
   * 使用 D3.js 繪製 GeoJSON 地圖數據或 Normalize Segments（站點和路線）
   * 背景強制為白色
   */
  const drawMap = () => {
    const layerTab = spaceGridDataLayerTabId.value;
    /** layout-grid-viewer：`layout_network_grid_from_vh_draw`（／_2）；刻度線以繪區 **px** 定位，**刻度數為 pt（CSS 96dpi）**；**X 原點在左、Y 刻度讀數以左下為 0 往上遞增**；視窗／容器 resize 會重算；不套用整數網格底色／細格 M。 */
    const layoutVhDrawPixelAxisMode =
      props.layoutVhDrawPixelAxes === true && isLayoutNetworkGridFromVhDrawLayerId(layerTab);
    const layoutViewerPxPtScale = layoutVhDrawPixelAxisMode
      ? {
          pxToPt: (px) => (Number(px) * 72) / 96,
          ptToPx: (pt) => (Number(pt) * 96) / 72,
        }
      : null;
    const uniformGridRouteFamilyTab = isSpaceLayoutUniformGridViewerLayerId(layerTab);
    const activeTabLayer = dataStore.findLayerById(layerTab);
    // 🔍 示意圖佈局層：線寬/點大小固定螢幕 pt、不隨 d3 zoom 縮放（vector-effect + 半徑 ÷ k）。
    const isSchematicLayout = activeTabLayer?.isRouteSchematicLayer === true;
    /** 示意圖佈局：中段黑點 node_type=line 須繪製（非 bend 幾何轉折）。 */
    const isDrawableMidStation = (nodeProps) => {
      if (!nodeProps || typeof nodeProps !== 'object') return false;
      if (nodeProps.node_type === 'connect') return true;
      if (nodeProps.station_name || nodeProps.station_id) return true;
      if (nodeProps.tags?.station_name || nodeProps.tags?.station_id) return true;
      if (nodeProps.tags?._forceDrawBlackDot) return true;
      if (isSchematicLayout && nodeProps.node_type === 'line') return true;
      return false;
    };
    const layoutUniformGridTooltipJr = uniformGridRouteFamilyTab
      ? buildEnrichedMapDrawnRowsForUniformGridTooltip(dataStore, layerTab, activeTabLayer)
      : null;
    const forceThisDraw = drawMapForceNext;
    drawMapForceNext = false;
    if (!mapGeoJsonData.value) return;

    // 獲取容器尺寸
    const dimensions = getDimensions();

    // 添加適當的邊距（增加底部和左側邊距以容納刻度標籤）
    /** layout_network_grid_from_vh_draw：軸下「刻度間黑點 max」、左側欄區間標籤；layout-grid-viewer（像素軸）與 space-layout-grid-viewer 同源即時計算，邊距對齊後者。 */
    const margin = layoutVhDrawPixelAxisMode
      ? { top: 20, right: 20, bottom: 52, left: 72 }
      : isLayoutNetworkGridFromVhDrawLayerId(layerTab)
        ? { top: 20, right: 20, bottom: 52, left: 72 }
        : { top: 20, right: 20, bottom: 40, left: 50 };
    let width = dimensions.width - margin.left - margin.right;
    let height = dimensions.height - margin.top - margin.bottom;
    if (props.squarePlotByShorterSide) {
      const side = Math.min(width, height);
      width = side;
      height = side;
    }

    // 檢查是否已存在 SVG，如果存在且尺寸相同則不需要重繪
    const containerId = getContainerId();
    const svgW = width + margin.left + margin.right;
    const svgH = height + margin.top + margin.bottom;
    const existingSvg = d3.select(`#${containerId}`).select('svg');
    if (forceThisDraw && existingSvg.size() > 0) {
      const node = existingSvg.node();
      if (node) {
        savedTaipeiFZoomTransform = d3.zoomTransform(node);
      }
    }
    if (existingSvg.size() > 0) {
      const ew = parseFloat(existingSvg.attr('data-inner-w'));
      const eh = parseFloat(existingSvg.attr('data-inner-h'));

      if (
        !forceThisDraw &&
        !layoutVhDrawPixelAxisMode &&
        Number.isFinite(ew) &&
        Number.isFinite(eh) &&
        Math.abs(ew - svgW) < 2 &&
        Math.abs(eh - svgH) < 2
      ) {
        refreshSpaceNetworkMinCellDimensions();
        return;
      }
    }

    // 清除之前的圖表和 tooltip
    d3.select(`#${containerId}`).selectAll('svg').remove();
    d3.select('body').selectAll('.d3js-map-tooltip').remove();

    // 🎯 強制設置容器背景為白色（清除任何可能的殘留樣式）
    const container = document.getElementById(containerId);
    if (container) {
      container.style.backgroundColor = '#FFFFFF';
      container.style.background = '#FFFFFF';
      container.style.setProperty('background-color', '#FFFFFF', 'important');
      container.style.setProperty('background', '#FFFFFF', 'important');
    }

    // 創建 SVG 元素（強制白色背景）；viewBox + 100% 填滿容器，配合 preserveAspectRatio 適應版面；
    // layout-grid-viewer（像素軸）：none 以使示意與網格拉滿 Upper 繪區、避免 meet 視窗留白。
    const svg = d3
      .select(`#${containerId}`)
      .append('svg')
      .attr('viewBox', `0 0 ${svgW} ${svgH}`)
      .attr('preserveAspectRatio', layoutVhDrawPixelAxisMode ? 'none' : 'xMidYMid meet')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('data-inner-w', svgW)
      .attr('data-inner-h', svgH)
      .style('background-color', '#FFFFFF')
      .style('background', '#FFFFFF')
      .style('transition', layoutVhDrawPixelAxisMode ? 'none' : 'all 0.2s ease-in-out');

    // 🎯 強制設置 SVG 背景色（使用 DOM 直接設置以確保生效）
    const svgElement = svg.node();
    if (svgElement) {
      svgElement.style.setProperty('background-color', '#FFFFFF', 'important');
      svgElement.style.setProperty('background', '#FFFFFF', 'important');
    }

    // 🎯 創建背景層群組（確保在最底層）
    const backgroundGroup = svg.append('g').attr('class', 'background-layer');

    // 🎯 添加白色背景矩形（最底層，確保背景是白色）
    backgroundGroup
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .attr('fill', '#FFFFFF')
      .attr('fill-opacity', 1);

    // 確保背景層在最底層
    backgroundGroup.lower();

    // 🔍 創建可縮放的內容群組
    const zoomGroup = svg.append('g').attr('class', 'zoom-group');

    // 創建 tooltip 元素（用於顯示 hover 信息）
    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'd3js-map-tooltip')
      .style('position', 'absolute')
      .style('padding', '8px 12px')
      .style('background-color', uniformGridRouteFamilyTab ? '#ffffff' : 'rgba(0, 0, 0, 0.8)')
      .style('color', uniformGridRouteFamilyTab ? '#1a1a1a' : '#FFFFFF')
      .style('border-radius', uniformGridRouteFamilyTab ? '6px' : '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000)
      .style('max-width', uniformGridRouteFamilyTab ? '340px' : '300px')
      .style('box-shadow', uniformGridRouteFamilyTab ? '0 3px 14px rgba(0,0,0,0.35)' : 'none')
      .style('border', uniformGridRouteFamilyTab ? '1px solid rgba(0,0,0,0.12)' : 'none');

    // 檢查是否為 Normalize Segments 格式
    const isNormalizeFormat = mapGeoJsonData.value.type === 'NormalizeSegments';
    let routeFeatures = [];
    let stationFeatures = [];
    /** 展開後路段（Normalize 分支內賦值；繪製階段供度數著色等使用） */
    let flatSegments = [];
    /** 路線正規化／③MILP：粉紅 dp_ratio 幾何（Normalize 分支內賦值） */
    let livePinkDpDetail = null;
    /** taipei_d：以「縮減疊加網格（空列／空行）後」座標繪製路網 */
    let taipeiCReducedOverlayDraw = false;
    /** 網路座標 (gx,gy) → 繪圖用縮減格座標；非縮減模式為 null */
    let reducedPlotMapper = null;
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;

    if (isNormalizeFormat) {
      // Normalize Segments 格式處理（優先使用 layer 當前資料，以反映 flip 後的狀態）
      const activeLayerForSegments = dataStore.findLayerById(layerTab);
      const jrForTooltipRowMatch = layoutUniformGridTooltipJr;
      const matchExportRowIndexForNormalizeSegment = (seg) => {
        if (!Array.isArray(jrForTooltipRowMatch) || jrForTooltipRowMatch.length === 0) return null;
        const pts = seg?.points;
        if (!Array.isArray(pts) || pts.length < 2) return null;
        const p0 = pts[0];
        const p1 = pts[pts.length - 1];
        const ax = Number(Array.isArray(p0) ? p0[0] : p0?.x);
        const ay = Number(Array.isArray(p0) ? p0[1] : p0?.y);
        const bx = Number(Array.isArray(p1) ? p1[0] : p1?.x);
        const by = Number(Array.isArray(p1) ? p1[1] : p1?.y);
        if (
          !Number.isFinite(ax) ||
          !Number.isFinite(ay) ||
          !Number.isFinite(bx) ||
          !Number.isFinite(by)
        ) {
          return null;
        }
        const eps = 1e-3;
        for (let i = 0; i < jrForTooltipRowMatch.length; i++) {
          const r = jrForTooltipRowMatch[i];
          const s = r?.segment?.start;
          const e = r?.segment?.end;
          if (!s || !e) continue;
          const sax = Number(s.x_grid ?? s.lon);
          const say = Number(s.y_grid ?? s.lat);
          const ebx = Number(e.x_grid ?? e.lon);
          const eby = Number(e.y_grid ?? e.lat);
          if (
            Math.abs(sax - ax) <= eps &&
            Math.abs(say - ay) <= eps &&
            Math.abs(ebx - bx) <= eps &&
            Math.abs(eby - by) <= eps
          ) {
            return i;
          }
        }
        return null;
      };
      const currentLayerData = activeLayerForSegments?.spaceNetworkGridJsonData;
      const segments =
        Array.isArray(currentLayerData) && currentLayerData.length > 0
          ? currentLayerData
          : mapGeoJsonData.value.segments || [];

      // 檢查是否為 2-5 格式（按路線分組）
      const isMergedRoutesFormat =
        segments.length > 0 && segments[0].route_name && Array.isArray(segments[0].segments);

      flatSegments = [];
      if (isMergedRoutesFormat) {
        // 2-5 格式：展開所有路線的 segments
        segments.forEach((route) => {
          const routeColor = route.color || '#555555';
          route.segments.forEach((seg) => {
            flatSegments.push({
              ...seg,
              route_name: route.route_name,
              route_color: routeColor,
              original_props: route.original_props,
            });
          });
        });
      } else {
        flatSegments = segments;
      }

      // 路線正規化／③MILP：hover 用格座標即時算 dp_ratio（不 mutate 圖層，避免 deep watch 迴圈）。
      livePinkDpDetail =
        layerTab === SCHEMATIC_MILP_READ_LAYER_ID || layerTab === SCHEMATIC_MILP_LAYER_ID
          ? buildPinkDpRatioDetailMap(flatSegments)
          : null;
      const liveDpDetailAtLocal = (x, y) => {
        if (!livePinkDpDetail) return null;
        return livePinkDpDetail.get(`${Number(x).toFixed(6)},${Number(y).toFixed(6)}`) ?? null;
      };
      const nodePropsWithLiveDpRatio = (nodeProps, gridX, gridY) => {
        if (!livePinkDpDetail) {
          return { ...nodeProps, x_grid: gridX, y_grid: gridY };
        }
        const detail = liveDpDetailAtLocal(gridX, gridY);
        const out = { ...nodeProps, x_grid: gridX, y_grid: gridY };
        const t = { ...(nodeProps.tags || {}) };
        delete out.dp_ratio;
        delete t.dp_ratio;
        if (detail) {
          out.dp_ratio = detail.ratio;
          t.dp_ratio = detail.ratio;
        }
        out.tags = t;
        return out;
      };

      // 從 segments 中提取所有座標點
      const allPoints = new Set();
      flatSegments.forEach((seg) => {
        seg.points.forEach((point) => {
          // 支持 [x, y] 或 [x, y, props] 格式
          const x = Array.isArray(point) ? point[0] : point.x || 0;
          const y = Array.isArray(point) ? point[1] : point.y || 0;
          allPoints.add(`${x},${y}`);
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        });
      });

      /** 均勻網格族：路段 hover 需對齊 dataJson 匯出列（與 MapTab）；僅座標比對易因格線／經緯度空間不一致或同路線多段而失敗 */
      const matchExportRowIndexByEndpointStationIds = (seg) => {
        if (!Array.isArray(jrForTooltipRowMatch) || jrForTooltipRowMatch.length === 0) return null;
        const nodes = seg?.nodes;
        if (!Array.isArray(nodes) || nodes.length < 2) return null;
        const sidA = String(nodes[0]?.station_id ?? nodes[0]?.tags?.station_id ?? '').trim();
        const sidB = String(
          nodes[nodes.length - 1]?.station_id ?? nodes[nodes.length - 1]?.tags?.station_id ?? ''
        ).trim();
        if (!sidA || !sidB) return null;
        for (let i = 0; i < jrForTooltipRowMatch.length; i++) {
          const r = jrForTooltipRowMatch[i];
          const sm = r?.segment;
          if (!sm?.start || !sm?.end) continue;
          const rs = String(sm.start.station_id ?? sm.start.tags?.station_id ?? '').trim();
          const re = String(sm.end.station_id ?? sm.end.tags?.station_id ?? '').trim();
          if (rs === sidA && re === sidB) return i;
          if (rs === sidB && re === sidA) return i;
        }
        return null;
      };

      const resolveMapStyleExportRowIndexForSegment = (seg, flatSegmentIndex) => {
        if (!isSpaceLayoutUniformGridViewerLayerId(layerTab)) {
          return matchExportRowIndexForNormalizeSegment(seg);
        }
        let idx = matchExportRowIndexForNormalizeSegment(seg);
        if (idx != null) return idx;
        idx = matchExportRowIndexByEndpointStationIds(seg);
        if (idx != null) return idx;
        if (
          Array.isArray(jrForTooltipRowMatch) &&
          jrForTooltipRowMatch.length === flatSegments.length &&
          flatSegmentIndex >= 0 &&
          flatSegmentIndex < jrForTooltipRowMatch.length
        ) {
          const r = jrForTooltipRowMatch[flatSegmentIndex];
          if (r) return flatSegmentIndex;
        }
        return null;
      };

      // 將 segments 轉換為 routeFeatures 格式
      // 檢查是否為 2-3/2-4/2-5 格式（有 start_coord/end_coord）
      const isZLayoutFormat = flatSegments.length > 0 && flatSegments[0].start_coord;

      routeFeatures = flatSegments.map((seg, flatSegmentIndex) => {
        // 檢查是否為 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式（points 為 [x, y, props]）
        const isHydratedFormat =
          seg.points &&
          seg.points.length > 0 &&
          Array.isArray(seg.points[0]) &&
          seg.points[0].length > 2;

        // 提取純座標（如果是 [x, y, props] 格式，只取前兩個元素）
        let coordinates = seg.points.map((point) => {
          if (Array.isArray(point) && point.length >= 2) {
            return [point[0], point[1]];
          }
          return point;
        });
        if (isZLayoutFormat || isHydratedFormat) {
          // 2-3/2-4/2-5/2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式：從 props 或 original_props 獲取屬性
          const props = seg.props || seg.original_props || {};
          return {
            geometry: {
              type: 'LineString',
              coordinates: coordinates,
            },
            properties: {
              tags: {
                ...(props.way_properties?.tags || props.properties?.tags || {}),
                ...(seg.route_colors ? { route_colors: seg.route_colors } : {}),
                ...(seg._schematicCorridorSkipDraw
                  ? { _schematicCorridorSkipDraw: true }
                  : {}),
              },
              name: seg.route_name || props.name || props.route_name,
              color: seg.route_color,
              station_weights: seg.station_weights, // 傳遞 station_weights
              nav_weight:
                seg.nav_weight != null && Number.isFinite(Number(seg.nav_weight))
                  ? Number(seg.nav_weight)
                  : 1,
              original_points: seg.original_points || seg.points, // 傳遞原始點用於計算距離
              points: seg.points, // 傳遞 points 用於計算距離
              l3_black_dot_reduced_weight_green: Boolean(seg.l3_black_dot_reduced_weight_green),
              _flatSegmentIndex: flatSegmentIndex,
              map_draw_row_index: resolveMapStyleExportRowIndexForSegment(seg, flatSegmentIndex),
            },
          };
        } else {
          // Normalize Segments 格式
          return {
            geometry: {
              type: 'LineString',
              coordinates: coordinates,
            },
            properties: {
              tags: {
                ...(seg.way_properties?.tags || {}),
                ...(seg.route_colors ? { route_colors: seg.route_colors } : {}),
                ...(seg._schematicCorridorSkipDraw
                  ? { _schematicCorridorSkipDraw: true }
                  : {}),
              },
              name: seg.name,
              station_weights: seg.station_weights, // 傳遞 station_weights
              nav_weight:
                seg.nav_weight != null && Number.isFinite(Number(seg.nav_weight))
                  ? Number(seg.nav_weight)
                  : 1,
              original_points: seg.original_points || seg.points, // 傳遞原始點用於計算距離
              points: seg.points, // 傳遞 points 用於計算距離
              l3_black_dot_reduced_weight_green: Boolean(seg.l3_black_dot_reduced_weight_green),
              _flatSegmentIndex: flatSegmentIndex,
              map_draw_row_index: resolveMapStyleExportRowIndexForSegment(seg, flatSegmentIndex),
            },
          };
        }
      });

      // 從 segments 中提取站點
      // 測試3：若已具 MapDrawn 匯出 JSON（processedJsonData），站點僅依該單一資料繪製，勿與 flatSegments 的 nodes／折線轉折混用
      const stationMap = new Map();
      const useTest3JsonStations =
        isTaipeiTest3BcdeLayerTab(layerTab) &&
        !isTaipeiTest3I3OrJ3LayerTab(layerTab) &&
        activeLayerForSegments &&
        isMapDrawnRoutesExportArray(activeLayerForSegments.processedJsonData);

      if (useTest3JsonStations) {
        const rows = activeLayerForSegments.processedJsonData;
        for (const row of rows) {
          const seg = row.segment || {};
          const routeColor = row.color;
          const addEndpoint = (pt) => {
            if (!pt || typeof pt !== 'object') return;
            const x = Number(pt.x_grid);
            const y = Number(pt.y_grid);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            const k = `${x},${y}`;
            // connect 端點優先：即使該格已被中段(line)黑點佔用也覆寫成 connect，
            // 終點藍點才不會被同格的中段黑點蓋掉（正規化後黑點沿線重插，可能落在終點格）。
            const exEp = stationMap.get(k);
            if (!exEp || exEp.nodeType !== 'connect') {
              stationMap.set(k, {
                geometry: { type: 'Point', coordinates: [x, y] },
                properties: {
                  ...pt,
                  x_grid: x,
                  y_grid: y,
                  color: routeColor,
                  node_type: 'connect',
                },
                nodeType: 'connect',
              });
            }
          };
          addEndpoint(seg.start);
          addEndpoint(seg.end);
          for (const st of seg.stations || []) {
            const x = Number(st.x_grid);
            const y = Number(st.y_grid);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const k = `${x},${y}`;
            const midIsConnect = String(st.node_type ?? '').trim() === 'connect';
            // 不可用中段(line)黑點覆寫已存在的 connect 端點（紅/藍點優先）。
            const exMid = stationMap.get(k);
            if (exMid && exMid.nodeType === 'connect' && !midIsConnect) continue;
            stationMap.set(k, {
              geometry: { type: 'Point', coordinates: [x, y] },
              properties: {
                ...st,
                x_grid: x,
                y_grid: y,
                color: routeColor,
                node_type: midIsConnect ? 'connect' : 'line',
              },
              nodeType: midIsConnect ? 'connect' : 'line',
            });
          }
        }
      } else {
        flatSegments.forEach((seg) => {
          // 檢查是否為 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式（points 為 [x, y, props]）
          const isHydratedFormat =
            seg.points &&
            seg.points.length > 0 &&
            Array.isArray(seg.points[0]) &&
            seg.points[0].length > 2;

          if (isHydratedFormat) {
            // 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式：從 points 陣列中提取端點屬性
            const pts = seg.points || [];
            if (pts.length > 0) {
              // 起點
              const startPt = pts[0];
              const [x1, y1] = Array.isArray(startPt)
                ? [startPt[0], startPt[1]]
                : [startPt.x || 0, startPt.y || 0];
              const startProps = Array.isArray(startPt) && startPt.length > 2 ? startPt[2] : {};
              const key1 = `${x1},${y1}`;
              if (!stationMap.has(key1)) {
                stationMap.set(key1, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x1, y1],
                  },
                  properties: {
                    ...startProps,
                    x_grid: x1,
                    y_grid: y1,
                  },
                  nodeType: startProps.node_type || 'connect',
                });
              }

              // 終點
              if (pts.length > 1) {
                const endPt = pts[pts.length - 1];
                const [x2, y2] = Array.isArray(endPt)
                  ? [endPt[0], endPt[1]]
                  : [endPt.x || 0, endPt.y || 0];
                const endProps = Array.isArray(endPt) && endPt.length > 2 ? endPt[2] : {};
                const key2 = `${x2},${y2}`;
                if (!stationMap.has(key2)) {
                  stationMap.set(key2, {
                    geometry: {
                      type: 'Point',
                      coordinates: [x2, y2],
                    },
                    properties: {
                      ...endProps,
                      x_grid: x2,
                      y_grid: y2,
                    },
                    nodeType: endProps.node_type || 'connect',
                  });
                }
              }

              // 2-6/2-7/2-8/2-9/2-10/3-1/4-1/6-1 格式：提取所有中間點（只繪製真正的車站，不繪製幾何轉折點）
              // 對於 6-1 格式，points 數組中每個點都是 [x, y, props]，直接提取所有中間點的屬性
              // 對於其他格式，使用 original_points 和 original_nodes 來分佈中間站點
              if (pts.length > 2) {
                // 直接從 points 數組中提取所有中間點（跳過起點和終點）
                for (let i = 1; i < pts.length - 1; i++) {
                  const midPt = pts[i];
                  const [x, y] = Array.isArray(midPt)
                    ? [midPt[0], midPt[1]]
                    : [midPt.x || 0, midPt.y || 0];
                  const midFromPt = Array.isArray(midPt) && midPt.length > 2 ? midPt[2] : {};
                  const midFromNode =
                    seg.nodes?.[i] && typeof seg.nodes[i] === 'object' ? seg.nodes[i] : {};
                  const midProps = { ...midFromNode, ...midFromPt };
                  const key = `${x},${y}`;

                  // 判斷是否為真正的車站（不是幾何轉折點）
                  // 真正的車站：node_type === 'connect' 或有 station_name
                  // 不繪製：node_type === 'line' 的幾何轉折點
                  // taipei_h3：tags._forceDrawBlackDot（見 g3ToH3PlaceBlackStationsFromA3Rows）
                  const isRealStation = isDrawableMidStation(midProps);

                  // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
                  if (!stationMap.has(key) && isRealStation) {
                    stationMap.set(key, {
                      geometry: {
                        type: 'Point',
                        coordinates: [x, y],
                      },
                      properties: {
                        ...midProps,
                        x_grid: x,
                        y_grid: y,
                      },
                      nodeType: midProps.node_type || 'line', // 保留原始 node_type
                    });
                  }
                }
              }

              // 如果沒有從 points 中提取到中間點，則使用 original_points 和 original_nodes 來分佈（兼容舊格式）
              if (
                seg.original_points &&
                Array.isArray(seg.original_points) &&
                seg.points &&
                Array.isArray(seg.points) &&
                seg.original_points.length > seg.points.length
              ) {
                const numStations = Math.max(0, seg.original_points.length - 2); // 減去起點和終點
                const originalNodes = seg.original_nodes || [];
                if (numStations > 0 && seg.points.length >= 2) {
                  // 計算路徑總長度
                  const dist = (p1, p2) => {
                    const x1 = Array.isArray(p1) ? p1[0] : p1.x || 0;
                    const y1 = Array.isArray(p1) ? p1[1] : p1.y || 0;
                    const x2 = Array.isArray(p2) ? p2[0] : p2.x || 0;
                    const y2 = Array.isArray(p2) ? p2[1] : p2.y || 0;
                    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
                  };

                  let totalLen = 0;
                  const segments = [];
                  for (let i = 0; i < seg.points.length - 1; i++) {
                    const d = dist(seg.points[i], seg.points[i + 1]);
                    totalLen += d;
                    segments.push({ len: d, p1: seg.points[i], p2: seg.points[i + 1] });
                  }

                  if (totalLen > 0) {
                    const stepDist = totalLen / (numStations + 1);
                    let currentTarget = stepDist;
                    let segIdx = 0;
                    let coveredLen = 0;

                    for (let i = 0; i < numStations; i++) {
                      // 計算對應的 original_points 索引（跳過起點，從 1 開始）
                      const originalIndex = i + 1;
                      // 優先從 original_points 中提取屬性（如果是 [x, y, props] 格式）
                      let nodeProps = {};
                      if (
                        seg.original_points[originalIndex] &&
                        Array.isArray(seg.original_points[originalIndex]) &&
                        seg.original_points[originalIndex].length > 2
                      ) {
                        nodeProps = seg.original_points[originalIndex][2] || {};
                      } else {
                        nodeProps = originalNodes[originalIndex] || {};
                      }

                      while (segIdx < segments.length) {
                        const segData = segments[segIdx];
                        if (coveredLen + segData.len >= currentTarget) {
                          const localDist = currentTarget - coveredLen;
                          const ratio = localDist / segData.len;
                          const p1x = Array.isArray(segData.p1) ? segData.p1[0] : segData.p1.x || 0;
                          const p1y = Array.isArray(segData.p1) ? segData.p1[1] : segData.p1.y || 0;
                          const p2x = Array.isArray(segData.p2) ? segData.p2[0] : segData.p2.x || 0;
                          const p2y = Array.isArray(segData.p2) ? segData.p2[1] : segData.p2.y || 0;
                          const nx = p1x + (p2x - p1x) * ratio;
                          const ny = p1y + (p2y - p1y) * ratio;
                          const key = `${nx},${ny}`;

                          // 判斷是否為真正的車站（不是幾何轉折點）
                          // 真正的車站：node_type === 'connect' 或有 station_name
                          // 不繪製：node_type === 'line' 的幾何轉折點
                          const isRealStation = isDrawableMidStation(nodeProps);

                          // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
                          if (!stationMap.has(key) && isRealStation) {
                            stationMap.set(key, {
                              geometry: {
                                type: 'Point',
                                coordinates: [nx, ny],
                              },
                              properties: {
                                ...nodeProps, // 使用 original_points 或 original_nodes 中的屬性
                                x_grid: nx,
                                y_grid: ny,
                              },
                              nodeType: nodeProps.node_type || 'line', // 保留原始 node_type
                            });
                          }
                          break;
                        } else {
                          coveredLen += segData.len;
                          segIdx++;
                        }
                      }
                      currentTarget += stepDist;
                    }
                  }
                }
              }
            }
          } else if (isZLayoutFormat) {
            // 2-3/2-4/2-5 格式：從 start_coord/end_coord 和 start_props/end_props 提取
            if (seg.start_coord && seg.start_props) {
              const [x, y] = seg.start_coord;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: {
                    ...seg.start_props,
                    x_grid: x,
                    y_grid: y,
                  },
                  nodeType: seg.start_props.node_type || 'connect',
                });
              }
            }
            if (seg.end_coord && seg.end_props) {
              const [x, y] = seg.end_coord;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: {
                    ...seg.end_props,
                    x_grid: x,
                    y_grid: y,
                  },
                  nodeType: seg.end_props.node_type || 'connect',
                });
              }
            }

            // 2-3/2-4/2-5 格式：在路徑上分佈中間站點（黑點）
            if (
              isZLayoutFormat &&
              seg.original_points &&
              Array.isArray(seg.original_points) &&
              seg.points &&
              Array.isArray(seg.points)
            ) {
              const numStations = Math.max(0, seg.original_points.length - 2); // 減去起點和終點
              const originalNodes = seg.original_nodes || [];
              if (numStations > 0 && seg.points.length >= 2) {
                // 計算路徑總長度
                const dist = (p1, p2) => {
                  // 支持 [x, y] 或 [x, y, props] 格式
                  const x1 = Array.isArray(p1) ? p1[0] : p1.x || 0;
                  const y1 = Array.isArray(p1) ? p1[1] : p1.y || 0;
                  const x2 = Array.isArray(p2) ? p2[0] : p2.x || 0;
                  const y2 = Array.isArray(p2) ? p2[1] : p2.y || 0;
                  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
                };

                let totalLen = 0;
                const segments = [];
                for (let i = 0; i < seg.points.length - 1; i++) {
                  const d = dist(seg.points[i], seg.points[i + 1]);
                  totalLen += d;
                  segments.push({ len: d, p1: seg.points[i], p2: seg.points[i + 1] });
                }

                if (totalLen > 0) {
                  const stepDist = totalLen / (numStations + 1);
                  let currentTarget = stepDist;
                  let segIdx = 0;
                  let coveredLen = 0;

                  for (let i = 0; i < numStations; i++) {
                    // 計算對應的 original_points 索引（跳過起點，從 1 開始）
                    const originalIndex = i + 1;
                    const nodeProps = originalNodes[originalIndex] || {};

                    while (segIdx < segments.length) {
                      const segData = segments[segIdx];
                      if (coveredLen + segData.len >= currentTarget) {
                        const localDist = currentTarget - coveredLen;
                        const ratio = localDist / segData.len;
                        // 支持 [x, y] 或 [x, y, props] 格式
                        const p1x = Array.isArray(segData.p1) ? segData.p1[0] : segData.p1.x || 0;
                        const p1y = Array.isArray(segData.p1) ? segData.p1[1] : segData.p1.y || 0;
                        const p2x = Array.isArray(segData.p2) ? segData.p2[0] : segData.p2.x || 0;
                        const p2y = Array.isArray(segData.p2) ? segData.p2[1] : segData.p2.y || 0;
                        const nx = p1x + (p2x - p1x) * ratio;
                        const ny = p1y + (p2y - p1y) * ratio;
                        const key = `${nx},${ny}`;

                        // 判斷是否為真正的車站（不是幾何轉折點）
                        // 真正的車站：node_type === 'connect' 或有 station_name
                        // 不繪製：node_type === 'line' 的幾何轉折點
                        const isRealStation = isDrawableMidStation(nodeProps);

                        // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
                        if (!stationMap.has(key) && isRealStation) {
                          stationMap.set(key, {
                            geometry: {
                              type: 'Point',
                              coordinates: [nx, ny],
                            },
                            properties: {
                              ...nodeProps, // 使用 original_nodes 中的屬性
                              x_grid: nx,
                              y_grid: ny,
                            },
                            nodeType: nodeProps.node_type || 'line', // 保留原始 node_type
                          });
                        }
                        break;
                      } else {
                        coveredLen += segData.len;
                        segIdx++;
                      }
                    }
                    currentTarget += stepDist;
                  }
                }
              }
            }
          } else if (
            seg.nodes &&
            Array.isArray(seg.nodes) &&
            seg.points &&
            Array.isArray(seg.points)
          ) {
            // 2-1 格式：從 nodes 陣列提取所有點（只繪製真正的車站，不繪製幾何轉折點）
            seg.points.forEach((point, index) => {
              const [x, y] = point;
              const nodeProps = seg.nodes[index] || {};
              // flip 後紅點位移：若有 display_x/display_y 則用於繪製紅點，線仍用 points
              const drawX = nodeProps.display_x ?? x;
              const drawY = nodeProps.display_y ?? y;
              const key = `${drawX},${drawY}`;

              // 判斷是否為真正的車站（不是幾何轉折點）
              // 真正的車站：node_type === 'connect' 或有 station_name
              // 不繪製：node_type === 'line' 的幾何轉折點
              // taipei_h3：g3→h3 插入之中段站帶 tags._forceDrawBlackDot（可无站名仍畫黑點）
              const isRealStation = isDrawableMidStation(nodeProps);

              // 只添加真正的車站（避免重複），不添加 node_type === 'line' 的幾何轉折點
              // connect 端點優先於同格中段(line)黑點，避免終點藍點被蓋掉。
              const exNode = stationMap.get(key);
              const thisNodeType = nodeProps.node_type || 'line';
              const canPlace =
                isRealStation &&
                (!exNode || (exNode.nodeType !== 'connect' && thisNodeType === 'connect'));
              if (canPlace) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [drawX, drawY],
                  },
                  properties: nodePropsWithLiveDpRatio(nodeProps, drawX, drawY),
                  nodeType: thisNodeType, // 用於區分 connect 和 line
                });
              }
            });
          } else {
            // 1-1, 1-2 格式：從 properties_start 和 properties_end 提取
            if (seg.properties_start) {
              const x = seg.properties_start.x_grid;
              const y = seg.properties_start.y_grid;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: seg.properties_start,
                  nodeType: 'connect',
                });
              }
            }
            if (seg.properties_end) {
              const x = seg.properties_end.x_grid;
              const y = seg.properties_end.y_grid;
              const key = `${x},${y}`;
              if (!stationMap.has(key)) {
                stationMap.set(key, {
                  geometry: {
                    type: 'Point',
                    coordinates: [x, y],
                  },
                  properties: seg.properties_end,
                  nodeType: 'connect',
                });
              }
            }
          }
        });
      }
      stationFeatures = Array.from(stationMap.values());

      // taipei_d：路網／站點改在「縮減疊加網格」座標空間繪製（overlayRemovalMaps 由 execute_d_to_e_test 寫入 taipei_d）
      const tcLayerDraw = dataStore.findLayerById(layerTab);
      if (
        isTaipeiTestCDLayerTab(layerTab) &&
        tcLayerDraw?.minSpacingOverlayCell &&
        Number(tcLayerDraw.minSpacingOverlayCell.cellW) > 0 &&
        Number(tcLayerDraw.minSpacingOverlayCell.cellH) > 0
      ) {
        taipeiCReducedOverlayDraw = true;
        // 與 schematicPlotMapper／Control 表格 mapNetworkToSchematicPlotXY 一致（taipei_c 無 rm 時勿再 floor(g/cell)）
        reducedPlotMapper =
          createReducedSchematicPlotMapper(tcLayerDraw) || ((gx, gy) => [Number(gx), Number(gy)]);

        const mapCoordPair = (p) => {
          if (!Array.isArray(p) || p.length < 2) return p;
          const [nx, ny] = reducedPlotMapper(Number(p[0]), Number(p[1]));
          return p.length > 2 ? [nx, ny, p[2]] : [nx, ny];
        };

        const mapCoordArray = (arr) => {
          if (!Array.isArray(arr)) return arr;
          return arr.map(mapCoordPair);
        };

        routeFeatures = routeFeatures.map((f) => {
          const coords = f.geometry?.coordinates;
          if (!coords) return f;
          const isMulti =
            coords.length > 0 && Array.isArray(coords[0]) && typeof coords[0][0] !== 'number';
          const newCoords = isMulti
            ? coords.map((line) => mapCoordArray(line))
            : mapCoordArray(coords);
          return {
            ...f,
            geometry: { ...f.geometry, coordinates: newCoords },
            properties: {
              ...f.properties,
              original_points: f.properties.original_points
                ? mapCoordArray(f.properties.original_points)
                : f.properties.original_points,
              points: f.properties.points
                ? mapCoordArray(f.properties.points)
                : f.properties.points,
            },
          };
        });

        stationFeatures = stationFeatures.map((f) => {
          const [x, y] = f.geometry.coordinates;
          const [nx, ny] = reducedPlotMapper(Number(x), Number(y));
          return {
            ...f,
            geometry: { ...f.geometry, coordinates: [nx, ny] },
            properties: { ...f.properties, x_grid: nx, y_grid: ny },
          };
        });

        xMin = Infinity;
        xMax = -Infinity;
        yMin = Infinity;
        yMax = -Infinity;
        const addB = (x, y) => {
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        };
        routeFeatures.forEach((f) => {
          const coords = f.geometry?.coordinates;
          if (!coords) return;
          const isMulti =
            coords.length > 0 && Array.isArray(coords[0]) && typeof coords[0][0] !== 'number';
          if (isMulti) {
            coords.forEach((line) => {
              line.forEach((c) => addB(c[0], c[1]));
            });
          } else {
            coords.forEach((c) => addB(c[0], c[1]));
          }
        });
        stationFeatures.forEach((f) => {
          const c = f.geometry?.coordinates;
          if (c) addB(c[0], c[1]);
        });
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
          xMin = 0;
          xMax = 1;
          yMin = 0;
          yMax = 1;
        } else {
          // 縮減疊加繪圖時不加邊界 padding，避免多畫一圈「空」網格線
          const pad = taipeiCReducedOverlayDraw ? 0 : 1;
          xMin -= pad;
          xMax += pad;
          yMin -= pad;
          yMax += pad;
        }
        // taipei_c：縮減網格 ix′/iy′ 為 0…n−1 之稠密索引；畫滿每一欄／列（僅用幾何 bbox 會漏掉無頂點但保留的格）
        if (
          isTaipeiTestCLayerTab(layerTab) &&
          taipeiCReducedOverlayDraw &&
          !tcLayerDraw?.overlayShrinkApplyPending &&
          tcLayerDraw?.gridTooltipMaps?.collapseSortedX?.length &&
          tcLayerDraw?.gridTooltipMaps?.collapseSortedY?.length
        ) {
          const nx = tcLayerDraw.gridTooltipMaps.collapseSortedX.length;
          const ny = tcLayerDraw.gridTooltipMaps.collapseSortedY.length;
          xMin = -0.5;
          xMax = nx - 0.5;
          yMin = -0.5;
          yMax = ny - 0.5;
        }
      }
    } else {
      // GeoJSON 格式處理
      // 分離路線和站點
      routeFeatures = mapGeoJsonData.value.features.filter(
        (f) =>
          f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
      );
      stationFeatures = mapGeoJsonData.value.features.filter(
        (f) => f.geometry && f.geometry.type === 'Point'
      );

      // 計算邊界（使用網格座標）
      mapGeoJsonData.value.features.forEach((feature) => {
        if (!feature || !feature.geometry) return;
        const geom = feature.geometry;

        if (geom.type === 'Point') {
          const [x, y] = geom.coordinates;
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        } else if (geom.type === 'LineString') {
          geom.coordinates.forEach((coord) => {
            const [x, y] = coord;
            xMin = Math.min(xMin, x);
            xMax = Math.max(xMax, x);
            yMin = Math.min(yMin, y);
            yMax = Math.max(yMax, y);
          });
        } else if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach((line) => {
            line.forEach((coord) => {
              const [x, y] = coord;
              xMin = Math.min(xMin, x);
              xMax = Math.max(xMax, x);
              yMin = Math.min(yMin, y);
              yMax = Math.max(yMax, y);
            });
          });
        }
      });
    }

    /**
     * taipei_g：資料為整數格索引 (ix, iy)；路線／站點對齊格線交點 (ix, iy)。
     * 背景僅依軸刻度步長畫線（與刻度一致），不與縮減疊加繪圖、疊加網格對齊併用。
     */
    const overlayForSnap = taipeiCReducedOverlayDraw ? null : dataStore.shortestPairOverlayGrid;
    const useSchematicCellCenterGrid =
      isNormalizeFormat &&
      !taipeiCReducedOverlayDraw &&
      isTaipeiEfinalSpaceLayerTab(layerTab) &&
      !overlayForSnap;

    if (
      useSchematicCellCenterGrid &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax)
    ) {
      const gx0 = Math.floor(xMin);
      const gx1 = Math.ceil(xMax);
      const gy0 = Math.floor(yMin);
      const gy1 = Math.ceil(yMax);
      xMin = gx0;
      xMax = gx1 + 1;
      yMin = gy0;
      yMax = gy1 + 1;
    }

    /** taipei_g 邊緣欄／列最大權重（繪上／右緣前即算好，供比例尺與標籤共用） */
    const colWeightMax = new Map();
    const rowWeightMax = new Map();
    let taipeiFMinCellWFrac;
    let taipeiFMinCellHFrac;
    if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(layerTab)) {
      const acc = accumulateTaipeiFColRowWeightMaxFromFeatures(routeFeatures);
      acc.colWeightMax.forEach((v, k) => colWeightMax.set(k, v));
      acc.rowWeightMax.forEach((v, k) => rowWeightMax.set(k, v));
    }

    // 權重比例格寬／滑鼠焦點縮放僅 taipei_g；taipei_f 固定等寬等高（僅檢視）
    const mouseZoomOn =
      useSchematicCellCenterGrid &&
      isTaipeiGOrHWeightLayer(layerTab) &&
      dataStore.taipeiFSpaceNetworkMouseZoom === true;
    if (mouseZoomOn) {
      const hh = taipeiFMouseZoomHover.value;
      const hx = Number.isFinite(hh.ix) ? hh.ix : null;
      const hy = Number.isFinite(hh.iy) ? hh.iy : null;
      colWeightMax.clear();
      rowWeightMax.clear();
      const nx = Math.max(0, Math.round(xMax - xMin));
      const ny = Math.max(0, Math.round(yMax - yMin));
      for (let j = 0; j < nx; j++) {
        const ix = xMin + j;
        const d = hx == null ? 999 : Math.abs(ix - hx);
        colWeightMax.set(ix, d <= 4 ? 5 - d : 1);
      }
      for (let j = 0; j < ny; j++) {
        const iy = yMin + j;
        const d = hy == null ? 999 : Math.abs(iy - hy);
        rowWeightMax.set(iy, d <= 4 ? 5 - d : 1);
      }
    }

    const taipeiFWeightScalingEffective = dataStore.taipeiFSpaceNetworkGridScaling !== false;
    const taipeiFApplyWeightPixelScaling =
      useSchematicCellCenterGrid &&
      isTaipeiGOrHWeightLayer(layerTab) &&
      (mouseZoomOn || taipeiFWeightScalingEffective);

    // 設定比例尺（網格座標）；taipei_g 且開啟權重放大時欄寬／列高依權重比例；否則等寬等高
    let xScale;
    let yScale;
    if (taipeiFApplyWeightPixelScaling) {
      const squareWeightsForScale = !mouseZoomOn;
      const xs = createTaipeiFWeightedXScale(
        xMin,
        xMax,
        margin.left,
        width,
        colWeightMax,
        squareWeightsForScale
      );
      const ys = createTaipeiFWeightedYScale(
        yMin,
        yMax,
        margin.top,
        height,
        rowWeightMax,
        squareWeightsForScale
      );
      xScale = xs.scale;
      yScale = ys.scale;
      taipeiFMinCellWFrac = xs.minCellWFrac;
      taipeiFMinCellHFrac = ys.minCellHFrac;
    } else if (props.squarePlotByShorterSide) {
      const spanX = xMax - xMin;
      const spanY = yMax - yMin;
      const sx = spanX > 0 ? spanX : 1;
      const sy = spanY > 0 ? spanY : 1;
      const cellSize = Math.min(width / sx, height / sy);
      const gridW = sx * cellSize;
      const gridH = sy * cellSize;
      const gridLeft = margin.left + (width - gridW) / 2;
      const gridTop = margin.top + (height - gridH) / 2;
      xScale = d3
        .scaleLinear()
        .domain([xMin, xMax])
        .range([gridLeft, gridLeft + gridW]);
      yScale = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([gridTop, gridTop + gridH]);
    } else if (
      isTaipeiTest3BcdeLayerTab(layerTab) &&
      dataStore.findLayerById(layerTab)?.squareGridCellsTaipeiTest3 === true
    ) {
      /** 測試3且 Control 選「正方形」：與版面網格測試3一致，依繪區寬高取 min 並置中 */
      const spanX = xMax - xMin;
      const spanY = yMax - yMin;
      const sx = spanX > 0 ? spanX : 1;
      const sy = spanY > 0 ? spanY : 1;
      const cellSize = Math.min(width / sx, height / sy);
      const gridW = sx * cellSize;
      const gridH = sy * cellSize;
      const gridLeft = margin.left + (width - gridW) / 2;
      const gridTop = margin.top + (height - gridH) / 2;
      xScale = d3
        .scaleLinear()
        .domain([xMin, xMax])
        .range([gridLeft, gridLeft + gridW]);
      yScale = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([gridTop, gridTop + gridH]);
    } else {
      xScale = d3
        .scaleLinear()
        .domain([xMin, xMax])
        .range([margin.left, margin.left + width]);
      yScale = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([margin.top, margin.top + height]);
    }

    if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(layerTab)) {
      const bounds = {
        xSpan: xMax - xMin,
        ySpan: yMax - yMin,
        plotW: width,
        plotH: height,
      };
      if (taipeiFApplyWeightPixelScaling) {
        bounds.minCellWFrac = taipeiFMinCellWFrac;
        bounds.minCellHFrac = taipeiFMinCellHFrac;
      }
      dataStore.setSpaceNetworkSchematicPlotBounds(bounds);
    } else {
      dataStore.clearSpaceNetworkSchematicPlotBounds();
      dataStore.clearSpaceNetworkGridMinCellDimensions();
    }

    const offsetPathToSchematicCellCenters = (pathCoords) => pathCoords;

    /** 最小間距疊加網格 hover：taipei_c／d／e 有 minSpacingOverlayCell 且非縮減繪圖時，以 floor 算疊加格 */
    const minSpacingStLayer = dataStore.findLayerById(layerTab);
    let minSpacingOverlay = null;
    if (
      minSpacingStLayer &&
      isTaipeiTestCDELayerTab(layerTab) &&
      !taipeiCReducedOverlayDraw &&
      minSpacingStLayer.minSpacingOverlayCell &&
      Number(minSpacingStLayer.minSpacingOverlayCell.cellW) > 0 &&
      Number(minSpacingStLayer.minSpacingOverlayCell.cellH) > 0
    ) {
      minSpacingOverlay = {
        cellW: Number(minSpacingStLayer.minSpacingOverlayCell.cellW),
        cellH: Number(minSpacingStLayer.minSpacingOverlayCell.cellH),
      };
    }

    /** 等分網格座標 → 像素（滑鼠縮放時用於焦點欄／列索引，避免與權重比例尺循環） */
    const xPickLinear = props.squarePlotByShorterSide
      ? d3.scaleLinear().domain([xMin, xMax]).range(xScale.range())
      : d3
          .scaleLinear()
          .domain([xMin, xMax])
          .range([margin.left, margin.left + width]);
    const yPickLinear = props.squarePlotByShorterSide
      ? d3.scaleLinear().domain([yMax, yMin]).range(yScale.range())
      : d3
          .scaleLinear()
          .domain([yMax, yMin])
          .range([margin.top, margin.top + height]);

    /** 疊加與縮減數字相同時：避免誤以為未執行 b→c／縮減 */
    const eventToNetworkXY = (event) => {
      const t = d3.zoomTransform(svg.node());
      const [mouseX, mouseY] = d3.pointer(event, svg.node());
      const lx = (mouseX - t.x) / t.k;
      const ly = (mouseY - t.y) / t.k;
      return [xScale.invert(lx), yScale.invert(ly)];
    };

    const minSpacingInline = (gx, gy) => {
      const rm = minSpacingStLayer?.overlayRemovalMaps;
      const gtm = minSpacingStLayer?.gridTooltipMaps;
      if (taipeiCReducedOverlayDraw) {
        const ix = Math.round(Number(gx));
        const iy = Math.round(Number(gy));
        if (rm?.mapX) {
          const ov = overlayCoordsBeforeRemovalFromReduced(ix, iy, rm);
          if (ov && (ov[0] !== ix || ov[1] !== iy)) {
            return ` <span style="color:#c9f">[刪空前疊加 ${ov[0]},${ov[1]}] <span style="color:#a8f">[縮減 ${ix},${iy}]</span></span>`;
          }
          return ` <span style="color:#c9f">[縮減 ${ix},${iy}]</span>`;
        }
        const pair = gtm ? overlayReducedTooltipPair(ix, iy, gtm) : null;
        const ov = pair?.overlay;
        const red = pair?.reduced ?? [ix, iy];
        if (ov && (ov[0] !== red[0] || ov[1] !== red[1])) {
          return ` <span style="color:#c9f">[刪空／塌縮前 ${ov[0]},${ov[1]}] <span style="color:#a8f">[縮減 ${red[0]},${red[1]}]</span></span>`;
        }
        return ` <span style="color:#c9f">[縮減 ${red[0]},${red[1]}]</span>`;
      }
      if (!minSpacingOverlay) return '';
      const c = networkCoordToMinSpacingOverlayCell(
        gx,
        gy,
        minSpacingOverlay.cellW,
        minSpacingOverlay.cellH
      );
      if (!c) return '';
      const red = rm?.mapX ? remapOverlayCellAfterRemoval(c.ix, c.iy, rm) : null;
      return red && (red[0] !== c.ix || red[1] !== c.iy)
        ? ` <span style="color:#c9f">[疊加 ${c.ix},${c.iy}] <span style="color:#a8f">[縮減疊加 ${red[0]},${red[1]}]</span></span>`
        : ` <span style="color:#c9f">[疊加 ${c.ix},${c.iy}]</span>`;
    };

    /**
     * @param {'full' | 'supplementOnly'} mode — supplementOnly：主行已標「縮減網格索引」，此處僅在與刪空前不同時補一行對照
     */
    const minSpacingTooltipBlock = (gx, gy, mode = 'full') => {
      const supplementOnly = mode === 'supplementOnly';
      const rm = minSpacingStLayer?.overlayRemovalMaps;
      const gtm = minSpacingStLayer?.gridTooltipMaps;
      if (taipeiCReducedOverlayDraw) {
        const ix = Math.round(Number(gx));
        const iy = Math.round(Number(gy));
        if (rm?.mapX) {
          const ov = overlayCoordsBeforeRemovalFromReduced(ix, iy, rm);
          if (supplementOnly) {
            if (!ov || (ov[0] === ix && ov[1] === iy)) return '';
            return `<br><strong>刪空列／行前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})`;
          }
          let block = `<br><strong>縮減網格索引 (ix′, iy′):</strong> (${ix}, ${iy})`;
          if (ov && (ov[0] !== ix || ov[1] !== iy)) {
            block = `<br><strong>刪空列／行前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})` + block;
          }
          return block;
        }
        const pair = gtm ? overlayReducedTooltipPair(ix, iy, gtm) : null;
        const ov = pair?.overlay;
        const red = pair?.reduced ?? [ix, iy];
        if (supplementOnly) {
          if (!ov || (ov[0] === red[0] && ov[1] === red[1])) return '';
          return `<br><strong>刪空／塌縮前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})`;
        }
        let block = `<br><strong>縮減網格索引 (ix′, iy′):</strong> (${red[0]}, ${red[1]})`;
        if (ov && (ov[0] !== red[0] || ov[1] !== red[1])) {
          block = `<br><strong>刪空／塌縮前疊加 (ix, iy):</strong> (${ov[0]}, ${ov[1]})` + block;
        }
        return block;
      }
      if (!minSpacingOverlay) return '';
      const c = networkCoordToMinSpacingOverlayCell(
        gx,
        gy,
        minSpacingOverlay.cellW,
        minSpacingOverlay.cellH
      );
      if (!c) return '';
      const red = rm?.mapX ? remapOverlayCellAfterRemoval(c.ix, c.iy, rm) : null;
      let block = `<br><strong>疊加網格座標 (ix, iy):</strong> (${c.ix}, ${c.iy})`;
      if (red && (red[0] !== c.ix || red[1] !== c.iy)) {
        block += `<br><strong>縮減疊加網格座標 (ix′, iy′):</strong> (${red[0]}, ${red[1]})`;
      }
      return block;
    };

    // 🔍 設置縮放行為
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10]) // 縮放範圍：0.1x 到 10x
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
        // 示意圖佈局：點半徑 ÷ k，使螢幕大小恆定（線寬由 vector-effect:non-scaling-stroke 處理）。
        if (isSchematicLayout) {
          const kk = event.transform.k || 1;
          zoomGroup.selectAll('circle').each(function () {
            const sel = d3.select(this);
            const r0 = +sel.attr('data-r0');
            if (Number.isFinite(r0) && r0 > 0) sel.attr('r', r0 / kk);
          });
        }
        if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(layerTab)) {
          refreshSpaceNetworkMinCellDimensions();
        }
      });

    // 將縮放行為應用到 SVG
    svg.call(zoom);
    if (savedTaipeiFZoomTransform != null && isTaipeiEfinalSpaceLayerTab(layerTab)) {
      svg.call(zoom.transform, savedTaipeiFZoomTransform);
    }
    savedTaipeiFZoomTransform = null;
    if (useSchematicCellCenterGrid && isTaipeiEfinalSpaceLayerTab(layerTab)) {
      refreshSpaceNetworkMinCellDimensions();
    }

    // taipei_f／g：同步滑鼠網格座標到 dataStore（與 LayoutGridTab_Test4 同源）。
    // 其餘 map 圖層在 store「顯示滑鼠網格座標」開啟時亦同步，供 Control「空間網路圖」專區顯示。
    svg.on('mousemove.spaceNetworkFGridCoord', null);
    svg.on('mouseleave.spaceNetworkFGridCoord', null);
    const excludedMouseCoordLayers =
      layerTab === 'taipei_6_1_test3' || layerTab === 'taipei_6_1_test4';
    const showSpaceNetworkMouseGridCoord = dataStore.spaceNetworkGridShowMouseGridCoordinate;

    if (isTaipeiEfinalSpaceLayerTab(layerTab)) {
      svg
        .on('mousemove.spaceNetworkFGridCoord', function (event) {
          let roundedGridX;
          let roundedGridY;
          if (mouseZoomOn) {
            const t = d3.zoomTransform(svg.node());
            const [mouseX, mouseY] = d3.pointer(event, svg.node());
            const lx = (mouseX - t.x) / t.k;
            const ly = (mouseY - t.y) / t.k;
            const gxL = xPickLinear.invert(lx);
            const gyL = yPickLinear.invert(ly);
            roundedGridX = Math.round(gxL);
            roundedGridY = Math.round(gyL);
            const nx = Math.max(0, Math.round(xMax - xMin));
            const ny = Math.max(0, Math.round(yMax - yMin));
            const inGrid =
              nx > 0 &&
              ny > 0 &&
              roundedGridX >= xMin &&
              roundedGridX <= xMin + nx - 1 &&
              roundedGridY >= yMin &&
              roundedGridY <= yMin + ny - 1;
            const nix = inGrid ? roundedGridX : null;
            const niy = inGrid ? roundedGridY : null;
            const prev = taipeiFMouseZoomHover.value;
            if (prev.ix !== nix || prev.iy !== niy) {
              taipeiFMouseZoomHover.value = { ix: nix, iy: niy };
              scheduleTaipeiFDrawForMouseZoom();
            }
          } else {
            const [gx, gy] = eventToNetworkXY(event);
            roundedGridX = Math.round(gx);
            roundedGridY = Math.round(gy);
          }
          if (
            roundedGridX >= Math.floor(xMin) - 1 &&
            roundedGridX <= Math.ceil(xMax) + 1 &&
            roundedGridY >= Math.floor(yMin) - 1 &&
            roundedGridY <= Math.ceil(yMax) + 1
          ) {
            dataStore.updateLayoutGridTabTest4MouseGridCoordinate(roundedGridX, roundedGridY);
          } else {
            dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
          }
        })
        .on('mouseleave.spaceNetworkFGridCoord', function () {
          dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
          if (mouseZoomOn) {
            const prev = taipeiFMouseZoomHover.value;
            if (prev.ix != null || prev.iy != null) {
              taipeiFMouseZoomHover.value = { ix: null, iy: null };
              scheduleTaipeiFDrawForMouseZoom();
            }
          }
        });
    } else if (
      showSpaceNetworkMouseGridCoord &&
      isMapLayer(layerTab) &&
      !excludedMouseCoordLayers
    ) {
      svg
        .on('mousemove.spaceNetworkFGridCoord', function (event) {
          const [gx, gy] = eventToNetworkXY(event);
          const roundedGridX = Math.round(gx);
          const roundedGridY = Math.round(gy);
          if (
            roundedGridX >= Math.floor(xMin) - 1 &&
            roundedGridX <= Math.ceil(xMax) + 1 &&
            roundedGridY >= Math.floor(yMin) - 1 &&
            roundedGridY <= Math.ceil(yMax) + 1
          ) {
            dataStore.updateLayoutGridTabTest4MouseGridCoordinate(roundedGridX, roundedGridY);
          } else {
            dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
          }
        })
        .on('mouseleave.spaceNetworkFGridCoord', function () {
          dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
        });
    } else if (!excludedMouseCoordLayers) {
      dataStore.clearLayoutGridTabTest4MouseGridCoordinate();
    }

    // 路網網格_2（layout-grid-viewer 像素軸）：把目前已畫的灰網格每格寬、高各切 4（4×4＝細格＝子網格），
    // 同步滑鼠所在 pt 座標與子網格 (x, y) 到 store，供 Control 操作面板顯示。
    // 灰網格欄／列邊界＝xTicks／yTicks（本函式稍後產生，事件觸發時已備妥）；
    // subX 自左數起、subY 自下往上數起，依細格個數編號 1,2,3…（與 pt 無關）。
    const layoutVhDrawSubgridDiv = 4; // 每個灰格沿寬／高各切的份數
    // 細格邊界（螢幕相對 px，含 0 與 width/height；fisheye 啟用時為變形後位置）；於下方建立 warp 時填入，事件觸發時已備妥。
    let layoutFisheyeColEdges = null;
    let layoutFisheyeRowEdges = null;
    const clearLayoutVhDrawFisheyeFocus = () => {
      if (layoutVhDrawFisheyeFocus.value) {
        layoutVhDrawFisheyeFocus.value = null;
        scheduleLayoutVhDrawFisheyeRedraw();
      }
    };
    svg.on('mousemove.layoutVhDrawViewerPt', null);
    svg.on('mouseleave.layoutVhDrawViewerPt', null);
    if (
      layoutVhDrawPixelAxisMode &&
      layoutViewerPxPtScale &&
      isLayoutVhDrawSecondCopyLayerId(layerTab)
    ) {
      svg
        .on('mousemove.layoutVhDrawViewerPt', function (event) {
          const t = d3.zoomTransform(svg.node());
          const [mouseX, mouseY] = d3.pointer(event, svg.node());
          const lx = (mouseX - t.x) / t.k;
          const ly = (mouseY - t.y) / t.k;
          if (
            lx >= margin.left &&
            lx <= margin.left + width &&
            ly >= margin.top &&
            ly <= margin.top + height &&
            Array.isArray(layoutFisheyeColEdges) &&
            Array.isArray(layoutFisheyeRowEdges)
          ) {
            const ptX = layoutViewerPxPtScale.pxToPt(lx - margin.left);
            const ptY = layoutViewerPxPtScale.pxToPt(height - (ly - margin.top));
            const relX = lx - margin.left;
            const relYTop = ly - margin.top;
            const ex = layoutFisheyeColEdges;
            const ey = layoutFisheyeRowEdges;
            const ny = ey.length - 1;
            // 滑鼠落在哪個（變形後）細格：欄自左 0-based、列自上 0-based
            let fcx = null;
            for (let k = 0; k < ex.length - 1; k++) {
              if (relX >= ex[k] - 1e-6 && relX <= ex[k + 1] + 1e-6) {
                fcx = k;
                break;
              }
            }
            let fcyTop = null;
            for (let m = 0; m < ny; m++) {
              if (relYTop >= ey[m] - 1e-6 && relYTop <= ey[m + 1] + 1e-6) {
                fcyTop = m;
                break;
              }
            }
            const subX = fcx != null ? fcx + 1 : null; // 自左 1-indexed
            const subY = fcyTop != null ? ny - fcyTop : null; // 自下往上 1-indexed
            dataStore.updateLayoutVhDrawViewerMousePt(ptX, ptY, subX, subY);
            // 放大鏡焦點：僅開關開啟且未選滿 2 點（路徑模式優先）時追蹤，細格改變才重繪（變形）。
            if (
              activeTabLayer?.layoutVhDrawFisheyeEnabled === true &&
              (!Array.isArray(dataStore.layoutVhDrawPathSel) ||
                dataStore.layoutVhDrawPathSel.length !== 2)
            ) {
              const pf = layoutVhDrawFisheyeFocus.value;
              const nf = fcx != null && fcyTop != null ? { fcx, fcyTop } : null;
              if (
                (pf?.fcx ?? null) !== (nf?.fcx ?? null) ||
                (pf?.fcyTop ?? null) !== (nf?.fcyTop ?? null)
              ) {
                layoutVhDrawFisheyeFocus.value = nf;
                scheduleLayoutVhDrawFisheyeRedraw();
              }
            } else {
              clearLayoutVhDrawFisheyeFocus();
            }
          } else {
            dataStore.clearLayoutVhDrawViewerMousePt();
            clearLayoutVhDrawFisheyeFocus();
          }
        })
        .on('mouseleave.layoutVhDrawViewerPt', function () {
          dataStore.clearLayoutVhDrawViewerMousePt();
          clearLayoutVhDrawFisheyeFocus();
        });
    } else {
      dataStore.clearLayoutVhDrawViewerMousePt();
      clearLayoutVhDrawFisheyeFocus();
    }

    // 🎯 繪製邊界外框
    const borderGroup = zoomGroup.append('g').attr('class', 'border-group');
    borderGroup
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 2);

    // 計算網格間距（根據座標範圍自動調整）
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    /** taipei_d3／e3／…、`json_grid_coord_normalized`／衍生正交層：整數座標系，背景與軸每 1 單位一條線／一個刻度（每格一線） */
    const isTaipeiD3CoordNormalizeLayer =
      layerTab === 'taipei_d3' ||
      layerTab === 'taipei_e3' ||
      layerTab === 'taipei_f3' ||
      layerTab === 'taipei_g3' ||
      layerTab === 'taipei_h3' ||
      layerTab === 'taipei_d3_dp' ||
      layerTab === 'taipei_e3_dp' ||
      layerTab === 'taipei_f3_dp' ||
      layerTab === 'taipei_g3_dp' ||
      layerTab === 'taipei_h3_dp' ||
      layerTab === JSON_GRID_COORD_NORMALIZED_LAYER_ID ||
      layerTab === POINT_ORTHOGONAL_LAYER_ID ||
      layerTab === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
      layerTab === 'schematic_milp_read' || // MILP結果正規化：整數座標系，每格一線
      layerTab === 'schematic_rma_milp_read' || // MILP結果正規化（RMA）：整數座標系，每格一線
      layerTab === 'schematic_rma_normalize' || // ⑨ 座標正規化：整數座標系，每格一線
      layerTab === 'schematic_milp_straighten' || // connect 拉直：整數座標系，每格一線
      isLineOrthogonalTowardCenterLayerId(layerTab) ||
      isSpaceGridVhDrawFamilyLayerId(layerTab) ||
      isTaipeiTest3I3OrJ3LayerTab(layerTab);

    /** 經緯度或小範圍連續座標：整數步長會變成 1 導致刻度迴圈為空，改以 d3.ticks 產生網格與軸刻度 */
    const preferContinuousGridTicks =
      !isTaipeiD3CoordNormalizeLayer &&
      !taipeiCReducedOverlayDraw &&
      !useSchematicCellCenterGrid &&
      Number.isFinite(xRange) &&
      Number.isFinite(yRange) &&
      xRange > 1e-9 &&
      yRange > 1e-9 &&
      Math.max(xRange, yRange) <= 30;

    const layoutUniformTickOverride = isSpaceLayoutUniformGridViewerLayerId(layerTab)
      ? buildLayoutViewerUniformAxisTicks(dataStore.findLayerById(layerTab)?.layoutUniformGridMeta)
      : null;

    // 縮減疊加／taipei_g：背景與軸皆每個整數一條線／一個刻度；其餘圖層網格與軸標籤可抽稀（粗步長為 5 的倍數）
    const xGridStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw || useSchematicCellCenterGrid
        ? 1
        : snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(xRange / 15)));
    const yGridStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw || useSchematicCellCenterGrid
        ? 1
        : snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(yRange / 15)));
    const tickXStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw
        ? snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(xRange / 15)))
        : useSchematicCellCenterGrid
          ? 1
          : xGridStep;
    const tickYStep = isTaipeiD3CoordNormalizeLayer
      ? 1
      : taipeiCReducedOverlayDraw
        ? snapCoarseGridStepToMultipleOf5(Math.max(1, Math.ceil(yRange / 15)))
        : useSchematicCellCenterGrid
          ? 1
          : yGridStep;

    // 軸／網格共用刻度位置（json 繪製均勻格：與 meta 對齊；taipei_g：整數格；連續座標：nice step；其餘：抽稀）
    const xTicks = [];
    const yTicks = [];
    let xAxisLabelsAsFloat = false;
    let yAxisLabelsAsFloat = false;

    if (layoutUniformTickOverride) {
      xTicks.push(...layoutUniformTickOverride.xTicks);
      yTicks.push(...layoutUniformTickOverride.yTicks);
      xAxisLabelsAsFloat = layoutUniformTickOverride.xLabelsAsFloat;
      yAxisLabelsAsFloat = layoutUniformTickOverride.yLabelsAsFloat;
    } else if (
      layoutVhDrawPixelAxisMode &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      const mergeLayoutPixelTicksToFullSpan = (baseTicks, spanMax) => {
        const m = Number(spanMax);
        if (!(Number.isFinite(m) && m > 0)) return [...baseTicks];
        const set = new Set(
          baseTicks.filter((t) => Number.isFinite(Number(t))).map((t) => Number(t))
        );
        set.add(0);
        set.add(m);
        return [...set].filter((t) => t >= -1e-9 && t <= m + 1e-9).sort((a, b) => a - b);
      };
      /** layout-grid-viewer：刻度／背景格線對齊有紅／藍 connect 的欄、列（繪區內像素座標） */
      const uniqSortedPixelTicks = (raw, spanMax) => {
        const m = Number(spanMax);
        const eps = 1e-4;
        const arr = raw.filter((t) => Number.isFinite(t) && t >= -1e-9 && t <= m + 1e-9);
        arr.sort((a, b) => a - b);
        const out = [];
        for (const v of arr) {
          if (out.length === 0 || Math.abs(v - out[out.length - 1]) > eps) out.push(v);
        }
        return out;
      };
      const isRbConnectStationFeature = (sf) => {
        if (!sf || typeof sf !== 'object') return false;
        if (sf.nodeType === 'connect') return true;
        const p = sf.properties && typeof sf.properties === 'object' ? sf.properties : {};
        const tags = p.tags && typeof p.tags === 'object' ? p.tags : {};
        const nodeType = String(p.node_type ?? tags.node_type ?? p.nodeType ?? tags.nodeType ?? '')
          .trim()
          .toLowerCase();
        if (nodeType === 'connect') return true;
        const cn = p.connect_number ?? tags.connect_number ?? p.connectNumber ?? tags.connectNumber;
        if (Number.isFinite(Number(cn))) return true;
        /** VH 繪製層 Point：紅／藍對應 intersection／terminal（MapTab endpoint），通常無 node_type:connect */
        if (p.endpointFromRouteLonLatSegment === true) {
          const ep = normalizeRouteSegmentEndpointType(p.type ?? tags.type ?? 'normal');
          if (ep === 'intersection' || ep === 'terminal') return true;
        }
        return false;
      };
      /** 與下方站點繪製一致：疊加網格時僞 connect 之座標移到格中心（endpointFromRouteLonLatSegment 站點不套用） */
      const layoutRbBlueTickPlotXY = (sf, gx, gy) => {
        const p = sf.properties && typeof sf.properties === 'object' ? sf.properties : {};
        const tags = p.tags && typeof p.tags === 'object' ? p.tags : {};
        const mapLonLatEndpoints = p.endpointFromRouteLonLatSegment === true;
        const nt = String(sf.nodeType ?? p.node_type ?? tags.node_type ?? '').trim() || 'line';
        const isConnect = nt === 'connect';
        if (overlayForSnap && !mapLonLatEndpoints && isConnect) {
          const ox = overlayForSnap.xLength;
          const oy = overlayForSnap.yLength;
          if (Number(ox) > 0 && Number(oy) > 0) {
            const cx = (Math.floor(gx / ox) + 0.5) * ox;
            const cy = (Math.floor(gy / oy) + 0.5) * oy;
            return [cx, cy];
          }
        }
        return [gx, gy];
      };
      let hasLayoutConnectPixelTicksX = false;
      let hasLayoutConnectPixelTicksY = false;
      if (isLayoutNetworkGridFromVhDrawLayerId(layerTab)) {
        const pxFromConnect = [];
        const pyFromConnect = [];
        for (const sf of stationFeatures) {
          if (!isRbConnectStationFeature(sf)) continue;
          const c = sf.geometry?.coordinates;
          if (!Array.isArray(c) || c.length < 2) continue;
          const gx = Number(c[0]);
          const gy = Number(c[1]);
          if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
          const [tx, ty] = layoutRbBlueTickPlotXY(sf, gx, gy);
          const sx = xScale(tx) - margin.left;
          const sy = yScale(ty) - margin.top;
          if (Number.isFinite(sx) && Number.isFinite(sy)) {
            pxFromConnect.push(sx);
            pyFromConnect.push(sy);
          }
        }
        if (pxFromConnect.length > 0) {
          xTicks.push(
            ...mergeLayoutPixelTicksToFullSpan(uniqSortedPixelTicks(pxFromConnect, width), width)
          );
          hasLayoutConnectPixelTicksX = true;
        }
        if (pyFromConnect.length > 0) {
          yTicks.push(
            ...mergeLayoutPixelTicksToFullSpan(uniqSortedPixelTicks(pyFromConnect, height), height)
          );
          hasLayoutConnectPixelTicksY = true;
        }
      }
      if (!hasLayoutConnectPixelTicksX || !hasLayoutConnectPixelTicksY) {
        const { pxToPt, ptToPx } = layoutViewerPxPtScale;
        const spanPtX = pxToPt(width);
        const spanPtY = pxToPt(height);
        const stepPtX = Math.max(1, niceTickStepMultipleOf5(spanPtX, 11));
        const stepPtY = Math.max(1, niceTickStepMultipleOf5(spanPtY, 11));
        const stepPxX = ptToPx(stepPtX);
        const stepPxY = ptToPx(stepPtY);
        if (!hasLayoutConnectPixelTicksX) {
          xTicks.push(
            ...mergeLayoutPixelTicksToFullSpan(buildTicksInRange(0, width, stepPxX), width)
          );
        }
        if (!hasLayoutConnectPixelTicksY) {
          yTicks.push(
            ...mergeLayoutPixelTicksToFullSpan(buildTicksInRange(0, height, stepPxY), height)
          );
        }
      }
    } else if (useSchematicCellCenterGrid) {
      for (let tx = Math.ceil(xMin / tickXStep) * tickXStep; tx <= xMax; tx += tickXStep) {
        xTicks.push(tx);
      }
      for (let ty = Math.ceil(yMin / tickYStep) * tickYStep; ty <= yMax; ty += tickYStep) {
        yTicks.push(ty);
      }
    } else if (preferContinuousGridTicks) {
      const xTickStep = niceTickStepMultipleOf5(xRange, 10);
      const yTickStep = niceTickStepMultipleOf5(yRange, 8);
      xTicks.push(...buildTicksInRange(xMin, xMax, xTickStep));
      yTicks.push(...buildTicksInRange(yMin, yMax, yTickStep));
      xAxisLabelsAsFloat = true;
      yAxisLabelsAsFloat = true;
    } else {
      for (let x = Math.ceil(xMin / tickXStep) * tickXStep; x <= xMax; x += tickXStep) {
        xTicks.push(x);
      }
      for (let y = Math.ceil(yMin / tickYStep) * tickYStep; y <= yMax; y += tickYStep) {
        yTicks.push(y);
      }
    }

    const skipDefaultLightBackgroundGrid = Boolean(
      layoutUniformTickOverride?.skipDefaultBackgroundGrid
    );

    /** layout_network_grid_from_vh_draw／讀版面路網·dataJson：與細格整數座標同源之全域 M（各 col／row 開區間黑點數之極大）；像素軸檢視不套用。 */
    let layoutVhDrawSubdivM = 0;
    if (
      !layoutVhDrawPixelAxisMode &&
      isLayoutNetworkGridFromVhDrawLayerId(layerTab) &&
      activeTabLayer?.geojsonData?.type === 'FeatureCollection' &&
      Array.isArray(activeTabLayer.geojsonData.features)
    ) {
      const subdivSpec = computeLayoutVhDrawFineGridSpec(dataStore, activeTabLayer.geojsonData);
      if (subdivSpec && Number.isFinite(subdivSpec.m)) {
        layoutVhDrawSubdivM = Math.max(0, Math.floor(subdivSpec.m));
      }
    }

    /** 固定淺灰背景格線（layout_network 不再套深灰強調線） */
    const layoutVHGridStroke = { stroke: '#E0E0E0', strokeW: 0.5, opacity: 0.6 };
    /** M>0：粗格區間內等分細線（對應細格每單元 (M+1) 份） */
    const layoutVHGridStrokeInner = { stroke: '#ECECEC', strokeW: 0.35, opacity: 0.5 };

    /**
     * layout-grid 像素軸：開啟「黑點數顯示比例」或「weight 顯示比例」時，依該區間 max Σ 歸一後
     * 重設繪區欄寬／列高（分段線性映射）。兩者擇一作為比例來源；weight 模式優先。
     */
    const layoutVhDrawWeightedByWeight =
      layoutVhDrawPixelAxisMode &&
      isLayoutNetworkGridFromVhDrawLayerId(layerTab) &&
      activeTabLayer?.layoutVhDrawShowWeightRowColRatioOverlay === true;
    const layoutVhDrawWeightedLayoutMode =
      layoutVhDrawPixelAxisMode &&
      isLayoutNetworkGridFromVhDrawLayerId(layerTab) &&
      (activeTabLayer?.layoutVhDrawShowBlackDotRowColRatioOverlay === true ||
        layoutVhDrawWeightedByWeight);

    /** 全部隨機 weight 動畫進行中：略過網格、刻度與軸帶數字，僅顯示路線／站點 */
    const layoutRouteWeightAnimActive =
      isLayoutNetworkGridFromVhDrawLayerId(layerTab) &&
      dataStore.layoutVhDrawRouteAnim?.active === true &&
      dataStore.layoutVhDrawRouteAnim.layerId === layerTab;

    if (layoutVhDrawPixelAxisMode && isLayoutNetworkGridFromVhDrawLayerId(layerTab)) {
      if (!layoutVhDrawWeightedLayoutMode) {
        dataStore.setLayoutVhDrawWeightedDashSubgridPtUi({
          layerId: layerTab,
          status: 'overlay_off',
        });
      }
    }

    // 🎯 繪製淺灰色網格線（在背景層）；json 繪製疊均勻格時略過以免與自訂直角格重疊
    const gridGroup = zoomGroup.append('g').attr('class', 'grid-group');

    // 路網網格_2 放大鏡（fisheye）：把目前細格視為等距格，焦點細格放大 5 倍，每往外一圈 −1（最小 1）。
    // 分軸：欄寬倍率＝5−|欄−焦點欄|、列高倍率＝5−|列−焦點列|；總寬／高正規化回繪區（維持填滿）。
    // warpRel*(rel)：把「均勻細格座標(0..span)」映射到變形後位置；edges：各細格變形後邊界（供滑鼠落格判定）。
    const layoutVhDrawFisheyeFocusVal = layoutVhDrawFisheyeFocus.value;
    const layoutFisheyeNx = layoutVhDrawSubgridDiv * Math.max(0, xTicks.length - 1);
    const layoutFisheyeNy = layoutVhDrawSubgridDiv * Math.max(0, yTicks.length - 1);
    const layoutVhDrawCopy2Pixel =
      layoutVhDrawPixelAxisMode &&
      !layoutVhDrawWeightedLayoutMode &&
      isLayoutVhDrawSecondCopyLayerId(layerTab) &&
      layoutFisheyeNx > 0 &&
      layoutFisheyeNy > 0;
    const layoutVhDrawPathSelectModeOn =
      layoutVhDrawCopy2Pixel && activeTabLayer?.layoutVhDrawPathSelectMode === true;
    const layoutVhDrawFisheyeEnabledOn =
      layoutVhDrawCopy2Pixel && activeTabLayer?.layoutVhDrawFisheyeEnabled === true;

    // ── 最短路徑放大（導航）：選取模式開啟並點兩個紅/藍點 → 以 Dijkstra 在 (車站,路線) 狀態圖求最短，
    //    沿同線前進成本小、同站換線（轉乘）成本很大 → 沿線經過的欄/列 ×5（與滑鼠 fisheye 互斥，路徑優先）──
    let layoutPathColSet = null;
    let layoutPathRowSet = null;
    let layoutPathEdgeKeySet = null;
    let layoutPathInfo = { found: false, stations: 0, transfers: 0 };
    const layoutPathSelPts =
      layoutVhDrawPathSelectModeOn && Array.isArray(dataStore.layoutVhDrawPathSel)
        ? dataStore.layoutVhDrawPathSel
        : [];
    if (layoutPathSelPts.length === 2) {
      const nodeKey = (gx, gy) => `${Number(gx).toFixed(3)},${Number(gy).toFixed(3)}`;
      const lineKeyOf = (rf) => {
        const p = rf?.properties || {};
        const t = p.tags || {};
        const c =
          p.route_name ??
          p.routeName ??
          p.name ??
          t.name ??
          t.route_name ??
          p.color ??
          p.colour ??
          t.color ??
          t.colour;
        return c != null ? String(c).trim() : '';
      };
      // 每段「經過車站數」成本＝段內中間站（黑點，排除 connect）＋1（抵達的紅/藍點）。
      const drawLayerForCost = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
      const exportRowsForCost = buildVhDrawStationRowsForLayoutMap(dataStore, drawLayerForCost);
      const epXYForCost = (ep) =>
        ep && typeof ep === 'object'
          ? [Number(ep.x_grid ?? ep.lon), Number(ep.y_grid ?? ep.lat)]
          : [NaN, NaN];
      const midCountOfRow = (row) => {
        const mids = Array.isArray(row?.segment?.stations) ? row.segment.stations : [];
        let n = 0;
        for (const m of mids) {
          if (!m || typeof m !== 'object' || m.node_type === 'connect') continue;
          n++;
        }
        return n > 0 ? n : mids.length;
      };
      const segStationCountOf = (rf) => {
        const cs = rf?.geometry?.coordinates;
        if (!Array.isArray(cs) || cs.length < 2 || !Array.isArray(exportRowsForCost)) return 1;
        const g0 = cs[0];
        const g1 = cs[cs.length - 1];
        const rn = lineKeyOf(rf);
        const eps = 1e-3;
        let fallback = null;
        for (const row of exportRowsForCost) {
          const seg = row?.segment;
          if (!seg) continue;
          const [ax, ay] = epXYForCost(seg.start);
          const [bx, by] = epXYForCost(seg.end);
          if (![ax, ay, bx, by].every(Number.isFinite)) continue;
          const fw =
            Math.abs(g0[0] - ax) < eps &&
            Math.abs(g0[1] - ay) < eps &&
            Math.abs(g1[0] - bx) < eps &&
            Math.abs(g1[1] - by) < eps;
          const bw =
            Math.abs(g0[0] - bx) < eps &&
            Math.abs(g0[1] - by) < eps &&
            Math.abs(g1[0] - ax) < eps &&
            Math.abs(g1[1] - ay) < eps;
          if (!(fw || bw)) continue;
          const rowRn = String(row.routeName ?? '').trim();
          if (rn && rowRn) {
            if (rowRn === rn) return midCountOfRow(row) + 1;
            continue;
          }
          if (!fallback) fallback = row;
        }
        return fallback ? midCountOfRow(fallback) + 1 : 1;
      };
      const incident = new Map(); // station -> [{to, fi, line, coords, cost}]
      const stationLines = new Map(); // station -> Set(line)
      const featStationCount = new Map(); // fi -> 段內經過車站數（含抵達紅/藍點）
      const addInc = (st, e) => {
        if (!incident.has(st)) incident.set(st, []);
        incident.get(st).push(e);
      };
      const addLine = (st, line) => {
        if (!stationLines.has(st)) stationLines.set(st, new Set());
        stationLines.get(st).add(line);
      };
      for (let fi = 0; fi < routeFeatures.length; fi++) {
        const rf = routeFeatures[fi];
        if (rf?.geometry?.type !== 'LineString') continue;
        const cs = rf.geometry.coordinates;
        if (!Array.isArray(cs) || cs.length < 2) continue;
        const ka = nodeKey(cs[0][0], cs[0][1]);
        const kb = nodeKey(cs[cs.length - 1][0], cs[cs.length - 1][1]);
        if (ka === kb) continue;
        const line = lineKeyOf(rf);
        const cost = Math.max(1, segStationCountOf(rf));
        featStationCount.set(fi, cost);
        addInc(ka, { to: kb, fi, line, coords: cs, cost });
        addInc(kb, { to: ka, fi, line, coords: cs, cost });
        addLine(ka, line);
        addLine(kb, line);
      }
      const startSt = nodeKey(layoutPathSelPts[0].gx, layoutPathSelPts[0].gy);
      const goalSt = nodeKey(layoutPathSelPts[1].gx, layoutPathSelPts[1].gy);
      // 成本：每經過一站（紅/藍/黑）＝1（即段成本＝段內車站數）；一次轉乘＝5。
      const TRANSFER_COST = 5;
      // Dijkstra over (車站,路線) 狀態（線性取最小，路網規模小足夠）。
      const stateInfo = new Map(); // skey -> { st, line }
      const dist = new Map();
      const prev = new Map(); // skey -> { pkey, fi|null }（fi=null 代表轉乘）
      const visited = new Set();
      const mkState = (st, line) => {
        const skey = `${st}::${line}`;
        if (!stateInfo.has(skey)) stateInfo.set(skey, { st, line });
        return skey;
      };
      for (const line of stationLines.get(startSt) || []) dist.set(mkState(startSt, line), 0);
      let goalStateKey = null;
      if (startSt !== goalSt) {
        let guard = 0;
        while (guard++ < 200000) {
          let bestK = null;
          let bestC = Infinity;
          for (const [k, c] of dist) {
            if (!visited.has(k) && c < bestC) {
              bestC = c;
              bestK = k;
            }
          }
          if (bestK == null) break;
          visited.add(bestK);
          const { st, line } = stateInfo.get(bestK);
          if (st === goalSt) {
            goalStateKey = bestK;
            break;
          }
          const relax = (nk, nc, fi) => {
            if (!dist.has(nk) || nc < dist.get(nk)) {
              dist.set(nk, nc);
              prev.set(nk, { pkey: bestK, fi });
            }
          };
          for (const e of incident.get(st) || []) {
            if (e.line !== line) continue; // 同線前進（成本＝該段經過車站數）
            relax(mkState(e.to, line), bestC + e.cost, e.fi);
          }
          for (const l2 of stationLines.get(st) || []) {
            if (l2 === line) continue; // 同站換線＝轉乘
            relax(mkState(st, l2), bestC + TRANSFER_COST, null);
          }
        }
      }
      if (goalStateKey) {
        layoutPathColSet = new Set();
        layoutPathRowSet = new Set();
        layoutPathEdgeKeySet = new Set();
        const cellW = width / layoutFisheyeNx;
        const cellH = height / layoutFisheyeNy;
        const addCell = (gx, gy) => {
          const sx = xScale(gx) - margin.left;
          const sy = yScale(gy) - margin.top;
          if (sx >= -1e-6 && sx <= width + 1e-6 && sy >= -1e-6 && sy <= height + 1e-6) {
            layoutPathColSet.add(
              Math.min(layoutFisheyeNx - 1, Math.max(0, Math.floor(sx / cellW)))
            );
            layoutPathRowSet.add(
              Math.min(layoutFisheyeNy - 1, Math.max(0, Math.floor(sy / cellH)))
            );
          }
        };
        const sampleSeg = (coords) => {
          for (let i = 0; i < coords.length - 1; i++) {
            const x0 = xScale(coords[i][0]);
            const y0 = yScale(coords[i][1]);
            const x1 = xScale(coords[i + 1][0]);
            const y1 = yScale(coords[i + 1][1]);
            const stepN = Math.max(
              1,
              Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, Math.min(cellW, cellH) / 2))
            );
            for (let s = 0; s <= stepN; s++) {
              const t = s / stepN;
              addCell(
                coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
                coords[i][1] + t * (coords[i + 1][1] - coords[i][1])
              );
            }
          }
        };
        let cur = goalStateKey;
        let guard = 0;
        let stationsPassed = 0; // 沿線經過的紅/藍/黑點數（不含起點，下方再 +1）
        let transfers = 0;
        while (prev.has(cur) && guard++ < 100000) {
          const { pkey, fi } = prev.get(cur);
          if (fi != null) {
            const cs = routeFeatures[fi]?.geometry?.coordinates;
            if (Array.isArray(cs)) {
              sampleSeg(cs);
              layoutPathEdgeKeySet.add(`${fi}#0`);
              stationsPassed += featStationCount.get(fi) ?? 1;
            }
          } else {
            transfers += 1;
          }
          cur = pkey;
        }
        layoutPathInfo = { found: true, stations: stationsPassed + 1, transfers };
      }
    }
    if (layoutVhDrawPathSelectModeOn) dataStore.setLayoutVhDrawPathInfo(layoutPathInfo);
    const layoutPathMagActive = !!layoutPathColSet && layoutPathColSet.size > 0;

    const layoutVhDrawMouseFisheyeActive =
      layoutVhDrawFisheyeEnabledOn &&
      !layoutPathMagActive &&
      !!layoutVhDrawFisheyeFocusVal &&
      Number.isFinite(layoutVhDrawFisheyeFocusVal.fcx) &&
      Number.isFinite(layoutVhDrawFisheyeFocusVal.fcyTop);
    const layoutVhDrawFisheyeActive = layoutPathMagActive || layoutVhDrawMouseFisheyeActive;

    // 各軸細格放大倍率來源：路徑模式＝沿線格 ×5、其餘 ×1；滑鼠模式＝焦點 5、每外一格 −1（最小 1）。
    const scaleOfFisheyeX = layoutPathMagActive
      ? (k) => (layoutPathColSet.has(k) ? 5 : 1)
      : layoutVhDrawMouseFisheyeActive
        ? (k) => Math.max(1, 5 - Math.abs(k - layoutVhDrawFisheyeFocusVal.fcx))
        : null;
    const scaleOfFisheyeY = layoutPathMagActive
      ? (m) => (layoutPathRowSet.has(m) ? 5 : 1)
      : layoutVhDrawMouseFisheyeActive
        ? (m) => Math.max(1, 5 - Math.abs(m - layoutVhDrawFisheyeFocusVal.fcyTop))
        : null;

    const buildLayoutFisheyeAxis = (span, n, scaleOf) => {
      const cnt = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      if (cnt <= 0 || !(span > 0)) return { warp: (v) => v, edges: [0, Math.max(0, span || 0)] };
      const active = typeof scaleOf === 'function';
      const edges = new Array(cnt + 1);
      edges[0] = 0;
      if (active) {
        let total = 0;
        const scales = new Array(cnt);
        for (let k = 0; k < cnt; k++) {
          const s = Number(scaleOf(k));
          scales[k] = Number.isFinite(s) && s > 0 ? s : 1;
          total += scales[k];
        }
        let acc = 0;
        for (let k = 0; k < cnt; k++) {
          acc += scales[k];
          edges[k + 1] = (acc / total) * span;
        }
      } else {
        for (let k = 1; k <= cnt; k++) edges[k] = (k / cnt) * span;
      }
      const cell = span / cnt;
      const warp = active
        ? (v) => {
            const x = Number(v);
            if (!Number.isFinite(x)) return v;
            if (x <= 0) return 0;
            if (x >= span) return span;
            const fk = x / cell;
            const k = Math.min(cnt - 1, Math.floor(fk));
            return edges[k] + (edges[k + 1] - edges[k]) * (fk - k);
          }
        : (v) => v;
      return { warp, edges };
    };
    const layoutFisheyeAxX = buildLayoutFisheyeAxis(width, layoutFisheyeNx, scaleOfFisheyeX);
    const layoutFisheyeAxY = buildLayoutFisheyeAxis(height, layoutFisheyeNy, scaleOfFisheyeY);
    const fisheyeWarpRelX = layoutFisheyeAxX.warp;
    const fisheyeWarpRelY = layoutFisheyeAxY.warp;
    // 提供給上方滑鼠 handler 判定落格（變形後邊界）。
    layoutFisheyeColEdges = layoutFisheyeAxX.edges;
    layoutFisheyeRowEdges = layoutFisheyeAxY.edges;
    /** fisheye：沿（已重佈線之）svg 折線取弧長比例 frac 對應點，使黑點落在重算後的八方向路線上。 */
    const layoutFisheyePointAtArcFrac = (svgPts, frac) => {
      if (!Array.isArray(svgPts) || svgPts.length < 2) return null;
      const lens = [];
      let total = 0;
      for (let i = 0; i < svgPts.length - 1; i++) {
        const l = Math.hypot(svgPts[i + 1][0] - svgPts[i][0], svgPts[i + 1][1] - svgPts[i][1]);
        lens.push(l);
        total += l;
      }
      if (!(total > 0)) return [Number(svgPts[0][0]), Number(svgPts[0][1])];
      const target = Math.max(0, Math.min(1, Number(frac))) * total;
      let acc = 0;
      for (let i = 0; i < lens.length; i++) {
        if (acc + lens[i] >= target) {
          const t = lens[i] > 0 ? (target - acc) / lens[i] : 0;
          return [
            svgPts[i][0] + t * (svgPts[i + 1][0] - svgPts[i][0]),
            svgPts[i][1] + t * (svgPts[i + 1][1] - svgPts[i][1]),
          ];
        }
        acc += lens[i];
      }
      const last = svgPts[svgPts.length - 1];
      return [Number(last[0]), Number(last[1])];
    };

    /** 軸刻度：一般為資料域 xScale(tick)；layout-grid-viewer 為繪區 px：X 由左向右、**Y 線位仍由上往下量**，唯 Y 刻度字為「距底往上」之 pt（原點在左下）。fisheye 啟用時套用變形。 */
    const svgXFromAxisTick = (tick) =>
      layoutVhDrawPixelAxisMode ? margin.left + fisheyeWarpRelX(Number(tick)) : xScale(Number(tick));
    const svgYFromAxisTick = (tick) =>
      layoutVhDrawPixelAxisMode ? margin.top + fisheyeWarpRelY(Number(tick)) : yScale(Number(tick));

    // 路網網格_2：把目前已畫的灰網格每格寬、高各切 layoutVhDrawSubgridDiv 份（於灰格內等分處加淺灰細虛線），子網格即這些細格。
    if (layoutVhDrawPixelAxisMode && isLayoutVhDrawSecondCopyLayerId(layerTab)) {
      const div = layoutVhDrawSubgridDiv;
      const subgridGroup = zoomGroup.append('g').attr('class', 'layout-vh-draw-subgrid-group');
      for (let i = 0; i < xTicks.length - 1; i++) {
        const a = Number(xTicks[i]);
        const b = Number(xTicks[i + 1]);
        if (![a, b].every(Number.isFinite) || b <= a) continue;
        for (let k = 1; k < div; k++) {
          const xPos = svgXFromAxisTick(a + ((b - a) * k) / div);
          subgridGroup
            .append('line')
            .attr('x1', xPos)
            .attr('y1', margin.top)
            .attr('x2', xPos)
            .attr('y2', margin.top + height)
            .attr('stroke', layoutVHGridStroke.stroke)
            .attr('stroke-width', layoutVHGridStroke.strokeW)
            .attr('stroke-opacity', layoutVHGridStroke.opacity)
            .attr('stroke-dasharray', '4,3');
        }
      }
      for (let j = 0; j < yTicks.length - 1; j++) {
        const a = Number(yTicks[j]);
        const b = Number(yTicks[j + 1]);
        if (![a, b].every(Number.isFinite) || b <= a) continue;
        for (let k = 1; k < div; k++) {
          const yPos = svgYFromAxisTick(a + ((b - a) * k) / div);
          subgridGroup
            .append('line')
            .attr('x1', margin.left)
            .attr('y1', yPos)
            .attr('x2', margin.left + width)
            .attr('y2', yPos)
            .attr('stroke', layoutVHGridStroke.stroke)
            .attr('stroke-width', layoutVHGridStroke.strokeW)
            .attr('stroke-opacity', layoutVHGridStroke.opacity)
            .attr('stroke-dasharray', '4,3');
        }
      }
    }

    const appendLayoutVhDrawInnerSubgridLines = () => {
      if (layoutVhDrawSubdivM <= 0) return;
      const vhIn = layoutVHGridStrokeInner;
      const innerG = gridGroup.append('g').attr('class', 'layout-vh-draw-grid-inner');
      for (let i = 0; i < xTicks.length - 1; i++) {
        const xa = Number(xTicks[i]);
        const xb = Number(xTicks[i + 1]);
        if (![xa, xb].every(Number.isFinite) || Math.abs(xb - xa) < 1e-12) continue;
        for (let j = 1; j <= layoutVhDrawSubdivM; j++) {
          const gx = xa + (xb - xa) * (j / (layoutVhDrawSubdivM + 1));
          const xPos = svgXFromAxisTick(gx);
          innerG
            .append('line')
            .attr('x1', xPos)
            .attr('y1', margin.top)
            .attr('x2', xPos)
            .attr('y2', margin.top + height)
            .attr('stroke', vhIn.stroke)
            .attr('stroke-width', vhIn.strokeW)
            .attr('opacity', vhIn.opacity);
        }
      }
      for (let i = 0; i < yTicks.length - 1; i++) {
        const ya = Number(yTicks[i]);
        const yb = Number(yTicks[i + 1]);
        if (![ya, yb].every(Number.isFinite) || Math.abs(yb - ya) < 1e-12) continue;
        for (let j = 1; j <= layoutVhDrawSubdivM; j++) {
          const gy = ya + (yb - ya) * (j / (layoutVhDrawSubdivM + 1));
          const yPos = svgYFromAxisTick(gy);
          innerG
            .append('line')
            .attr('x1', margin.left)
            .attr('y1', yPos)
            .attr('x2', margin.left + width)
            .attr('y2', yPos)
            .attr('stroke', vhIn.stroke)
            .attr('stroke-width', vhIn.strokeW)
            .attr('opacity', vhIn.opacity);
        }
      }
    };

    if (!skipDefaultLightBackgroundGrid && !layoutRouteWeightAnimActive) {
      if (useSchematicCellCenterGrid) {
        if (dataStore.showGrid) {
          appendLayoutVhDrawInnerSubgridLines();
          xTicks.forEach((tick) => {
            const xPos = svgXFromAxisTick(tick);
            const vh = layoutVHGridStroke;
            gridGroup
              .append('line')
              .attr('x1', xPos)
              .attr('y1', margin.top)
              .attr('x2', xPos)
              .attr('y2', margin.top + height)
              .attr('stroke', vh.stroke)
              .attr('stroke-width', vh.strokeW)
              .attr('opacity', vh.opacity);
          });
          yTicks.forEach((tick) => {
            const yPos = svgYFromAxisTick(tick);
            const vh = layoutVHGridStroke;
            gridGroup
              .append('line')
              .attr('x1', margin.left)
              .attr('y1', yPos)
              .attr('x2', margin.left + width)
              .attr('y2', yPos)
              .attr('stroke', vh.stroke)
              .attr('stroke-width', vh.strokeW)
              .attr('opacity', vh.opacity);
          });
        }
      } else if (!(layoutVhDrawPixelAxisMode && layoutVhDrawWeightedLayoutMode)) {
        appendLayoutVhDrawInnerSubgridLines();
        xTicks.forEach((tick) => {
          const xPos = svgXFromAxisTick(tick);
          const vh = layoutVHGridStroke;
          gridGroup
            .append('line')
            .attr('x1', xPos)
            .attr('y1', margin.top)
            .attr('x2', xPos)
            .attr('y2', margin.top + height)
            .attr('stroke', vh.stroke)
            .attr('stroke-width', vh.strokeW)
            .attr('opacity', vh.opacity);
        });
        yTicks.forEach((tick) => {
          const yPos = svgYFromAxisTick(tick);
          const vh = layoutVHGridStroke;
          gridGroup
            .append('line')
            .attr('x1', margin.left)
            .attr('y1', yPos)
            .attr('x2', margin.left + width)
            .attr('y2', yPos)
            .attr('stroke', vh.stroke)
            .attr('stroke-width', vh.strokeW)
            .attr('opacity', vh.opacity);
        });
      }
    }

    // 將網格線移到最底層
    gridGroup.lower();

    // 疊加縮減預覽：高亮目前步驟「會保留」的整欄或整列（刪空前 ix／iy）
    const shrinkStrip = dataStore.highlightedOverlayShrinkStrip;
    if (
      shrinkStrip &&
      shrinkStrip.layerId === layerTab &&
      (shrinkStrip.kind === 'col' || shrinkStrip.kind === 'row') &&
      Number.isFinite(shrinkStrip.index)
    ) {
      const stripG = zoomGroup.append('g').attr('class', 'overlay-shrink-strip-highlight');
      const si = shrinkStrip.index;
      if (shrinkStrip.kind === 'col') {
        const xa = useSchematicCellCenterGrid ? xScale(si) : xScale(si - 0.5);
        const xb = useSchematicCellCenterGrid ? xScale(si + 1) : xScale(si + 0.5);
        const left = Math.min(xa, xb);
        const rw = Math.abs(xb - xa);
        stripG
          .append('rect')
          .attr('x', left)
          .attr('y', margin.top)
          .attr('width', rw)
          .attr('height', height)
          .attr('fill', 'rgba(180, 100, 255, 0.2)')
          .attr('stroke', 'rgba(120, 50, 200, 0.55)')
          .attr('stroke-width', 1)
          .attr('pointer-events', 'none');
      } else {
        const ya = useSchematicCellCenterGrid ? yScale(si) : yScale(si - 0.5);
        const yb = useSchematicCellCenterGrid ? yScale(si + 1) : yScale(si + 0.5);
        const top = Math.min(ya, yb);
        const rh = Math.abs(yb - ya);
        stripG
          .append('rect')
          .attr('x', margin.left)
          .attr('y', top)
          .attr('width', width)
          .attr('height', rh)
          .attr('fill', 'rgba(180, 100, 255, 0.2)')
          .attr('stroke', 'rgba(120, 50, 200, 0.55)')
          .attr('stroke-width', 1)
          .attr('pointer-events', 'none');
      }
    }

    const layoutLayerForFineGrid =
      !layoutVhDrawPixelAxisMode && isLayoutNetworkGridFromVhDrawLayerId(layerTab)
        ? dataStore.findLayerById(layerTab)
        : null;
    const coarseFcLayout = layoutLayerForFineGrid?.geojsonData;
    /** 細格啟用後，M／原點皆以目前 geojson 即時重算（不依 persist 的快照） */
    const layoutFineGridSpec =
      layoutLayerForFineGrid?.layoutVhDrawFineGrid &&
      coarseFcLayout?.type === 'FeatureCollection' &&
      Array.isArray(coarseFcLayout.features)
        ? computeLayoutVhDrawFineGridSpec(dataStore, coarseFcLayout)
        : null;
    let layoutBlackMaxXTicks = xTicks;
    let layoutBlackMaxYTicks = yTicks;
    if (
      layoutFineGridSpec &&
      coarseFcLayout?.type === 'FeatureCollection' &&
      Array.isArray(coarseFcLayout.features)
    ) {
      const b = featureCollectionGridBounds(coarseFcLayout);
      if (
        Number.isFinite(b.xMin) &&
        Number.isFinite(b.xMax) &&
        Number.isFinite(b.yMin) &&
        Number.isFinite(b.yMax)
      ) {
        const x0c = Math.floor(b.xMin);
        const x1c = Math.ceil(b.xMax);
        const y0c = Math.floor(b.yMin);
        const y1c = Math.ceil(b.yMax);
        layoutBlackMaxXTicks = [];
        for (let x = x0c; x <= x1c; x++) layoutBlackMaxXTicks.push(x);
        layoutBlackMaxYTicks = [];
        for (let y = y0c; y <= y1c; y++) layoutBlackMaxYTicks.push(y);
      }
    }

    const layoutFineGridMapX = layoutFineGridSpec
      ? (gx) => Math.round((Number(gx) - layoutFineGridSpec.x0) * (layoutFineGridSpec.m + 1))
      : null;
    const layoutFineGridMapY = layoutFineGridSpec
      ? (gy) => Math.round((Number(gy) - layoutFineGridSpec.y0) * (layoutFineGridSpec.m + 1))
      : null;

    // 🎯 繪製座標軸和刻度（在邊界外）；動畫期間略過
    const axisGroup = zoomGroup.append('g').attr('class', 'axis-group');

    if (!layoutRouteWeightAnimActive) {
      // X軸刻度（taipei_g：標籤在格線座標 tick，與路線／站點一致）
      xTicks.forEach((tick) => {
        const xPos = svgXFromAxisTick(tick);

        // 繪製刻度線（在底部邊界外）
        axisGroup
          .append('line')
          .attr('x1', xPos)
          .attr('y1', margin.top + height)
          .attr('x2', xPos)
          .attr('y2', margin.top + height + 5)
          .attr('stroke', '#666666')
          .attr('stroke-width', 1);

        // 繪製刻度標籤（layout_network_grid_from_vh_draw：列／垂直線之黑點區間標註繪於相鄰刻度之間）
        const xTickLabel = layoutViewerPxPtScale
          ? `${Math.round(layoutViewerPxPtScale.pxToPt(tick))}pt`
          : formatAxisTickLabelMaxTwoDecimals(tick, xAxisLabelsAsFloat);
        axisGroup
          .append('text')
          .attr('x', xPos)
          .attr('y', margin.top + height + 14)
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px')
          .attr('fill', '#666666')
          .text(xTickLabel);
      });

      // Y軸刻度
      yTicks.forEach((tick) => {
        const yPos = svgYFromAxisTick(tick);

        // 繪製刻度線（在左側邊界外）
        axisGroup
          .append('line')
          .attr('x1', margin.left)
          .attr('y1', yPos)
          .attr('x2', margin.left - 5)
          .attr('y2', yPos)
          .attr('stroke', '#666666')
          .attr('stroke-width', 1);

        // 繪製刻度標籤（layout_network_grid_from_vh_draw：欄／水平線之黑點區間標註繪於相鄰刻度之間）
        const yTickLabel = layoutViewerPxPtScale
          ? `${Math.round(layoutViewerPxPtScale.pxToPt(height - Number(tick)))}pt`
          : formatAxisTickLabelMaxTwoDecimals(tick, yAxisLabelsAsFloat);
        axisGroup
          .append('text')
          .attr('x', margin.left - 8)
          .attr('y', yPos)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '10px')
          .attr('fill', '#666666')
          .text(yTickLabel);
      });
    }

    /** 繪區內 pt→px 後再套加權映射（layout-grid 欄寬／列高比例）；預設恆等。 */
    // 預設：fisheye 啟用時套用變形（路線／點與格線同源）；未啟用為原樣。加權模式（copy 層）後續會另行覆寫。
    let plotRemapSvgX = layoutVhDrawFisheyeActive
      ? (sx) => margin.left + fisheyeWarpRelX(sx - margin.left)
      : (sx) => sx;
    let plotRemapSvgY = layoutVhDrawFisheyeActive
      ? (sy) => margin.top + fisheyeWarpRelY(sy - margin.top)
      : (sy) => sy;

    const liveDpDetailAt = (x, y) => {
      if (!livePinkDpDetail) return null;
      return livePinkDpDetail.get(`${Number(x).toFixed(6)},${Number(y).toFixed(6)}`) ?? null;
    };
    const clearPinkDpHoverOverlay = () => {
      zoomGroup.selectAll('.pink-dp-ratio-hover-overlay').remove();
    };
    /** 垂足：在 SVG 像素空間計算，避免 x/y 非等比 scale 時垂線看起來歪斜。 */
    const footOnSegmentSvg = (p, a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return [a[0], a[1]];
      let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return [a[0] + t * dx, a[1] + t * dy];
    };
    const drawPinkDpHoverOverlay = (detail) => {
      clearPinkDpHoverOverlay();
      if (!detail) return;
      const toSvg = ([gx, gy]) => [plotRemapSvgX(xScale(gx)), plotRemapSvgY(yScale(gy))];
      const sa = toSvg(detail.anchorA);
      const sb = toSvg(detail.anchorB);
      const sp = toSvg(detail.pointP);
      const sh = footOnSegmentSvg(sp, sa, sb);
      const [sax, say] = sa;
      const [sbx, sby] = sb;
      const [spx, spy] = sp;
      const [shx, shy] = sh;
      const g = zoomGroup.append('g').attr('class', 'pink-dp-ratio-hover-overlay');
      g.append('line')
        .attr('x1', sax)
        .attr('y1', say)
        .attr('x2', sbx)
        .attr('y2', sby)
        .attr('stroke', '#1565c0')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '8,5')
        .attr('opacity', 0.95)
        .style('pointer-events', 'none');
      g.append('line')
        .attr('x1', spx)
        .attr('y1', spy)
        .attr('x2', shx)
        .attr('y2', shy)
        .attr('stroke', '#e377c2')
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.95)
        .style('pointer-events', 'none');
      g.append('circle')
        .attr('cx', sax)
        .attr('cy', say)
        .attr('r', 5)
        .attr('fill', '#ff0000')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .style('pointer-events', 'none');
      g.append('circle')
        .attr('cx', sbx)
        .attr('cy', sby)
        .attr('r', 5)
        .attr('fill', '#ff0000')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .style('pointer-events', 'none');
      g.append('circle')
        .attr('cx', shx)
        .attr('cy', shy)
        .attr('r', 3.5)
        .attr('fill', '#1565c0')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .style('pointer-events', 'none');
      g.raise();
    };

    // 創建線條生成器（加權模式下於 ratio 就緒後重設）
    let lineGenerator = d3
      .line()
      .x((d) => plotRemapSvgX(xScale(d[0])))
      .y((d) => plotRemapSvgY(yScale(d[1])))
      .curve(d3.curveLinear);

    /** 加權繪區：路徑已為 plot 內 SVG 座標時，直接連線（不重複套用 remap）。 */
    const routeLinePlotSvgDirect = d3
      .line()
      .x((d) => d[0])
      .y((d) => d[1])
      .curve(d3.curveLinear);

    /**
     * 欄／列比例條開啟時，獨立 X／Y remap 會拉非等比斜線；
     * 對「原本在 plot 上接近 45°」的斜段，改以 pt 空間強制 |dx_pt|=|dy_pt|，讓 resize 後仍維持 45°。
     */
    const snapWeightedLayoutRouteTo45DiagonalsInPlotSvg = (gridCoords) => {
      if (!Array.isArray(gridCoords) || gridCoords.length < 2) return null;
      const pxToPt = layoutViewerPxPtScale?.pxToPt ?? ((v) => Number(v));
      const ptToPx = layoutViewerPxPtScale?.ptToPx ?? ((v) => Number(v));
      const epsLenPt = 0.2;
      const epsDiagPt = 0.75;
      const pts = gridCoords.map((p) => {
        const gx = Number(p[0]);
        const gy = Number(p[1]);
        return [plotRemapSvgX(xScale(gx)), plotRemapSvgY(yScale(gy))];
      });
      const isNear45InBasePt = (g0, g1) => {
        const bx0 = xScale(Number(g0[0]));
        const by0 = yScale(Number(g0[1]));
        const bx1 = xScale(Number(g1[0]));
        const by1 = yScale(Number(g1[1]));
        const dptx = pxToPt(bx1 - bx0);
        const dpty = pxToPt(by1 - by0);
        const adx = Math.abs(dptx);
        const ady = Math.abs(dpty);
        if (!(adx > epsLenPt) || !(ady > epsLenPt)) return false;
        return Math.abs(adx - ady) <= epsDiagPt;
      };
      for (let i = 0; i < gridCoords.length - 1; i++) {
        if (!isNear45InBasePt(gridCoords[i], gridCoords[i + 1])) continue;
        const A = pts[i];
        const B = pts[i + 1];
        const dptx = pxToPt(B[0] - A[0]);
        const dpty = pxToPt(B[1] - A[1]);
        if (!(Math.abs(dptx) > epsLenPt) || !(Math.abs(dpty) > epsLenPt)) continue;
        const sx = dptx >= 0 ? 1 : -1;
        const sy = dpty >= 0 ? 1 : -1;
        const Lpt = Math.min(Math.abs(dptx), Math.abs(dpty));
        if (!(Lpt > epsLenPt)) continue;
        const Lpx = ptToPx(Lpt);
        pts[i + 1] = [A[0] + sx * Lpx, A[1] + sy * Lpx];
      }
      return pts;
    };

    /** taipei_h2 導航：僅由 store 寫入 station_weights（路徑 10／其餘 0），此處不畫額外 highlight */
    const matchH2TrafficConnect = () => false;
    const matchH2TrafficBlack = () => false;

    // 疊加網格時：將紅點（交叉點）對齊到所在疊加網格單元中心
    // 縮減疊加格繪圖時座標已是格索引空間，不可再套用 shortestPair 疊加網格位移
    const overlayCellCenter = (gx, gy) => {
      if (!overlayForSnap || overlayForSnap.xLength <= 0 || overlayForSnap.yLength <= 0)
        return [gx, gy];
      const ox = overlayForSnap.xLength;
      const oy = overlayForSnap.yLength;
      const cx = (Math.floor(gx / ox) + 0.5) * ox;
      const cy = (Math.floor(gy / oy) + 0.5) * oy;
      return [cx, cy];
    };
    // 黑點重分配：位移交叉點後，黑點在「兩交叉點之間」的新線段上平均配置（僅疊加網格開啟時用）
    const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
    /** 測試3：折線邊的端點度數；度數≤1 之 connect 為末端（藍），≥2 為交叉（紅）。i3／j3 用 h3 全路網計度（切段後子折線度數會誤判） */
    let taipeiTest3ConnectDegreeMap = null;
    let segmentsForTest3ConnectDegree = flatSegments;
    if (isTaipeiTest3I3OrJ3LayerTab(layerTab)) {
      const tab = layerTab;
      const h3LayerId =
        typeof tab === 'string' && tab.endsWith('_dp')
          ? 'taipei_h3_dp'
          : 'taipei_h3';
      const h3Layer = dataStore.findLayerById(h3LayerId);
      const h3Data = h3Layer?.spaceNetworkGridJsonData;
      if (Array.isArray(h3Data) && h3Data.length > 0) {
        try {
          segmentsForTest3ConnectDegree = normalizeSpaceNetworkDataToFlatSegments(h3Data);
        } catch {
          segmentsForTest3ConnectDegree = flatSegments;
        }
      }
    }
    if (
      isTaipeiTest3BcdeLayerTab(layerTab) &&
      Array.isArray(segmentsForTest3ConnectDegree) &&
      segmentsForTest3ConnectDegree.length > 0
    ) {
      taipeiTest3ConnectDegreeMap = new Map();
      const bumpDeg = (k) =>
        taipeiTest3ConnectDegreeMap.set(k, (taipeiTest3ConnectDegreeMap.get(k) || 0) + 1);
      const mapPt = reducedPlotMapper
        ? (gx, gy) => reducedPlotMapper(Number(gx), Number(gy))
        : (gx, gy) => [Number(gx), Number(gy)];
      for (const seg of segmentsForTest3ConnectDegree) {
        const pts = seg.points || [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const ax = Array.isArray(p0) ? Number(p0[0]) : Number(p0?.x ?? 0);
          const ay = Array.isArray(p0) ? Number(p0[1]) : Number(p0?.y ?? 0);
          const bx = Array.isArray(p1) ? Number(p1[0]) : Number(p1?.x ?? 0);
          const by = Array.isArray(p1) ? Number(p1[1]) : Number(p1?.y ?? 0);
          const [x1, y1] = mapPt(ax, ay);
          const [x2, y2] = mapPt(bx, by);
          const k1 = key(x1, y1);
          const k2 = key(x2, y2);
          if (k1 === k2) continue;
          bumpDeg(k1);
          bumpDeg(k2);
        }
      }
    }

    const taipeiTest3ConnectFill = (isConn, lx, ly) => {
      if (!isConn || !taipeiTest3ConnectDegreeMap) return null;
      const deg = taipeiTest3ConnectDegreeMap.get(key(lx, ly)) ?? 0;
      if (deg <= 1) return '#1565c0';
      return null;
    };

    /** 與度數≤1 末端同色：資料若標 terminal／terminus 等，不依全路網度數強制紅（與 SpaceNetworkGridTabK3 一致） */
    const connectBlueFromTaggedTerminal = (props, tags) => {
      const p = props && typeof props === 'object' ? props : {};
      const t = tags && typeof tags === 'object' ? tags : {};
      const raw =
        p.type ?? t.type ?? p.connect_type ?? t.connect_type ?? p.station_type ?? t.station_type;
      const s = raw == null ? '' : String(raw).trim().toLowerCase();
      if (!s) return false;
      return (
        s === 'terminal' || s === 'terminus' || s === 'end' || s === 'endpoint' || s === 'line_end'
      );
    };

    const connectKeys = new Set(
      stationFeatures
        .filter((f) => f.nodeType === 'connect')
        .map((f) => key(f.geometry.coordinates[0], f.geometry.coordinates[1]))
    );
    const blackRedistributeMap = new Map(); // key(x,y) -> [newX, newY]
    // 路線座標轉換：疊加網格時，線也一起移動（紅點→網格中心，黑點→平均配置）
    const transformPathCoords = (pathCoords) => {
      if (!overlayForSnap || !Array.isArray(pathCoords) || pathCoords.length < 2) return pathCoords;
      const indices = pathCoords
        .map((c, i) => (connectKeys.has(key(c[0], c[1])) ? i : -1))
        .filter((i) => i >= 0);
      if (indices.length < 2) return pathCoords;
      const result = [];
      for (let s = 0; s < indices.length - 1; s++) {
        const i0 = indices[s];
        const i1 = indices[s + 1];
        const start = overlayCellCenter(pathCoords[i0][0], pathCoords[i0][1]);
        const end = overlayCellCenter(pathCoords[i1][0], pathCoords[i1][1]);
        const blacks = pathCoords.slice(i0 + 1, i1);
        const N = blacks.length;
        result.push(start);
        for (let idx = 0; idx < N; idx++) {
          const t = (idx + 1) / (N + 1);
          const nx = start[0] + t * (end[0] - start[0]);
          const ny = start[1] + t * (end[1] - start[1]);
          result.push([nx, ny]);
          blackRedistributeMap.set(key(blacks[idx][0], blacks[idx][1]), [nx, ny]);
        }
        if (s === indices.length - 2) result.push(end);
      }
      return result.length > 0 ? result : pathCoords;
    };

    // 計算兩點之間的距離
    const dist = (p1, p2) => {
      const dx = p1[0] - p2[0];
      const dy = p1[1] - p2[1];
      return Math.sqrt(dx * dx + dy * dy);
    };

    // 在折線上找到距離起點 target_dist 的座標
    const getPointAtDistance = (polyline, targetDist) => {
      if (targetDist <= 0) return polyline[0];
      let currentDist = 0;
      for (let i = 0; i < polyline.length - 1; i++) {
        const p1 = polyline[i];
        const p2 = polyline[i + 1];
        const segLen = dist(p1, p2);
        if (currentDist + segLen >= targetDist) {
          const remain = targetDist - currentDist;
          const ratio = segLen > 0 ? remain / segLen : 0;
          return [p1[0] + (p2[0] - p1[0]) * ratio, p1[1] + (p2[1] - p1[1]) * ratio];
        }
        currentDist += segLen;
      }
      return polyline[polyline.length - 1];
    };

    // 計算某個車站點在折線上的路徑距離
    const getStationDistOnPolyline = (stationPt, polyline) => {
      let bestDist = 0;
      let minDistSq = Infinity;
      let currentAccumulatedDist = 0;

      for (let i = 0; i < polyline.length - 1; i++) {
        const p1 = polyline[i];
        const p2 = polyline[i + 1];
        const segLen = dist(p1, p2);

        // 投影點到線段
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
          currentAccumulatedDist += segLen;
          continue;
        }

        const t = Math.max(
          0,
          Math.min(1, ((stationPt[0] - p1[0]) * dx + (stationPt[1] - p1[1]) * dy) / lenSq)
        );
        const projPt = [p1[0] + t * dx, p1[1] + t * dy];
        const dSq = (stationPt[0] - projPt[0]) ** 2 + (stationPt[1] - projPt[1]) ** 2;

        if (dSq < minDistSq) {
          minDistSq = dSq;
          bestDist = currentAccumulatedDist + segLen * t;
        }

        currentAccumulatedDist += segLen;
      }

      return bestDist;
    };

    /** 路線 tooltip：單一數值完整顯示（整數不帶小數；非整數保留必要位數） */
    const formatPathCoordNumber = (n) => {
      if (!Number.isFinite(n)) return '';
      const r = Math.round(n);
      if (Math.abs(n - r) < 1e-9) return String(r);
      return n.toFixed(10).replace(/\.?0+$/, '');
    };

    /** space-network-grid 分頁：路段匯出 stations 附錄（含格線／lon·lat；非 layout-viewer） */
    const tooltipHtmlSegmentStationsOrderedVerbose = (seg) => {
      if (!seg || typeof seg !== 'object') return '';
      const esc = (t) =>
        String(t ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      const ordered = [];
      if (seg.start) ordered.push(seg.start);
      if (Array.isArray(seg.stations)) {
        for (const s of seg.stations) ordered.push(s);
      }
      if (seg.end) ordered.push(seg.end);
      if (!ordered.length) return '';
      let h = `<br><strong>stations（依序）</strong> ${ordered.length}<br>`;
      ordered.forEach((n, idx) => {
        const lo = segmentNodeLon(n);
        const la = segmentNodeLat(n);
        let posFrag = '';
        if (Number.isFinite(lo) && Number.isFinite(la)) {
          posFrag = ` lon/lat (${formatPathCoordNumber(lo)}, ${formatPathCoordNumber(la)})`;
        }
        let gridFrag = '';
        if (Number.isFinite(Number(n.grid_simp_x)) && Number.isFinite(Number(n.grid_simp_y))) {
          gridFrag = ` · grid_simp (${n.grid_simp_x}, ${n.grid_simp_y})`;
        } else if (Number.isFinite(Number(n.grid_x)) && Number.isFinite(Number(n.grid_y))) {
          gridFrag = ` · grid (${n.grid_x}, ${n.grid_y})`;
        }
        h += `<strong>#${idx + 1}</strong>${posFrag}${gridFrag} · station_id ${esc(
          n.station_id ?? n.tags?.station_id ?? ''
        )} · station_name ${esc(n.station_name ?? n.tags?.station_name ?? n.tags?.name ?? '')}<br>`;
      });
      return h;
    };

    const routeStrokeScaleLinear = dataStore.showRouteThickness
      ? buildRouteWeightStrokeScaleLinear(collectWeightsFromGeoRouteFeatures(routeFeatures))
      : null;

    const drawRoutePath = (
      coords,
      tags,
      name,
      color,
      stationWeights,
      originalPoints,
      points,
      isHvZTest3E3F3Highlight = false,
      l3BlackDotReducedWeightGreen = false,
      routeFeatureRouteId = '',
      exportRowIndexHint = null,
      /** 加權模式專用：已在加權 SVG 空間計算完成的 H/V/45° 座標，直接畫線不再套 remap。 */
      svgCoordsOverride = null,
      /** 路網網格_2 最短路徑：此段在路徑上 → 加粗顯示。 */
      pathHighlightThicken = false
    ) => {
      if (tags?._schematicCorridorSkipDraw) return;
      // 參數保留以維持位置呼叫相容；對應的縮減綠標邏輯已隨測試圖層移除
      void l3BlackDotReducedWeightGreen;
      // 與 MapTab 一致：tags.color／tags.colour，否則 feature.properties.color（如路段匯出列），預設 #666666
      const trimColour = (s) => (typeof s === 'string' && s.trim() !== '' ? s.trim() : '');
      const routeColor =
        trimColour(tags?.colour) || trimColour(tags?.color) || trimColour(color) || '#666666';
      let pathData;
      if (svgCoordsOverride) {
        pathData = routeLinePlotSvgDirect(svgCoordsOverride);
      } else if (layoutVhDrawWeightedLayoutMode) {
        const snappedPts = snapWeightedLayoutRouteTo45DiagonalsInPlotSvg(coords);
        pathData = snappedPts ? routeLinePlotSvgDirect(snappedPts) : lineGenerator(coords);
      } else {
        pathData = lineGenerator(coords);
      }
      if (!pathData) return;

      let baseStroke = isHvZTest3E3F3Highlight ? '#c2185b' : routeColor;

      const resolveWeightForRouteLineWidth = () => {
        if (Array.isArray(stationWeights) && stationWeights.length > 0) {
          let mx = 0;
          for (const w of stationWeights) {
            const n = Number(w?.weight);
            if (Number.isFinite(n) && n > mx) mx = n;
          }
          if (mx > 0) return mx;
        }
        const tw = Number(tags?.weight ?? tags?.route_weight ?? tags?.routeWeight);
        if (Number.isFinite(tw) && tw > 0) return tw;
        return 1;
      };

      const linePx =
        dataStore.showRouteThickness && routeStrokeScaleLinear
          ? strokeWidthPxFromWeightScale(routeStrokeScaleLinear, resolveWeightForRouteLineWidth())
          : null;
      let baseStrokeW =
        linePx != null ? formatStrokeWidthPx(linePx) : isHvZTest3E3F3Highlight ? 7 : 3;
      let hoverStrokeW =
        linePx != null ? formatStrokeWidthPx(linePx * 1.5) : isHvZTest3E3F3Highlight ? 9 : 5;
      if (pathHighlightThicken) {
        baseStrokeW = formatStrokeWidthPx(linePx != null ? linePx * 2.4 : 7);
        hoverStrokeW = formatStrokeWidthPx(linePx != null ? linePx * 3.4 : 9);
      }

      let routeTooltipHtml = '';
      let routeTooltipAppendNearLine = true;

      const pathElement = zoomGroup
        .append('path')
        .attr('d', pathData)
        .attr('stroke', baseStroke)
        .attr('fill', 'none')
        .attr('stroke-width', baseStrokeW)
        .style('vector-effect', isSchematicLayout ? 'non-scaling-stroke' : null)
        .attr('opacity', 0.9)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('cursor', 'pointer');

      // 🎨 多色交錯（純顯示，不影響演算法/互動）：該段有 ≥2 種 route_colors 時，於同一路徑疊畫虛線，
      //   base 設第 0 色，其餘色以 dash 交錯平鋪覆蓋（pointer-events:none，hover/tooltip 仍由 base 接）。
      const routeColorsList = String(tags?.route_colors || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const overlayPaths = [];
      const useSkeletonMulticolorDash = isSchematicLayout && routeColorsList.length >= 2;
      if (useSkeletonMulticolorDash) {
        const N = routeColorsList.length;
        const dashLen = 8;
        const dashArray = `${dashLen} ${dashLen * (N - 1)}`;
        pathElement
          .attr('stroke', routeColorsList[0])
          .attr('stroke-dasharray', dashArray)
          .attr('stroke-dashoffset', '0')
          .attr('stroke-linecap', 'butt');
        for (let i = 1; i < N; i++) {
          overlayPaths.push(
            zoomGroup
              .append('path')
              .attr('d', pathData)
              .attr('stroke', routeColorsList[i])
              .attr('fill', 'none')
              .attr('stroke-width', baseStrokeW)
              .style('vector-effect', 'non-scaling-stroke')
              .attr('opacity', 0.9)
              .attr('stroke-linecap', 'butt')
              .attr('stroke-dasharray', dashArray)
              .attr('stroke-dashoffset', String(dashLen * i))
              .style('pointer-events', 'none')
          );
        }
      } else if (routeColorsList.length >= 2) {
        const N = routeColorsList.length;
        const dashLen = 8;
        const dashArray = `${dashLen} ${dashLen * (N - 1)}`;
        baseStroke = routeColorsList[0];
        pathElement
          .attr('stroke', baseStroke)
          .attr('stroke-dasharray', dashArray)
          .attr('stroke-dashoffset', '0')
          .attr('stroke-linecap', 'butt');
        for (let i = 1; i < N; i++) {
          overlayPaths.push(
            zoomGroup
              .append('path')
              .attr('d', pathData)
              .attr('stroke', routeColorsList[i])
              .attr('fill', 'none')
              .attr('stroke-width', baseStrokeW)
              .style('vector-effect', isSchematicLayout ? 'non-scaling-stroke' : null)
              .attr('opacity', 0.9)
              .attr('stroke-linecap', 'butt')
              .attr('stroke-dasharray', dashArray)
              .attr('stroke-dashoffset', String(dashLen * i))
              .style('pointer-events', 'none')
          );
        }
      }

      // 添加 hover 效果
      pathElement
        .on('mouseover', function (event) {
          d3.select(this).attr('stroke-width', hoverStrokeW).attr('opacity', 1);
          overlayPaths.forEach((ov) => ov.attr('stroke-width', hoverStrokeW).attr('opacity', 1));

          const buildLegacyLineTooltip = () => {
            let tooltipContent = '';
            if (name) {
              tooltipContent += `<strong>路線名稱:</strong> ${name}<br>`;
            }
            const interiorCoords = coords.length > 2 ? coords.slice(1, -1) : [];
            const fmt = (p) => {
              if (!p) return '';
              const gx = Number(p[0]);
              const gy = Number(p[1]);
              const show = `(${formatPathCoordNumber(gx)}, ${formatPathCoordNumber(gy)})`;
              return `${show}${minSpacingInline(gx, gy)}`;
            };
            tooltipContent += `<strong>這一個路段的轉折點數:</strong> ${interiorCoords.length}`;
            if (coords.length >= 2) {
              tooltipContent += `<br><strong>起點座標:</strong> ${fmt(coords[0])}<br><strong>終點座標:</strong> ${fmt(coords[coords.length - 1])}`;
            }
            if (interiorCoords.length > 0) {
              tooltipContent += `<br><strong>轉折點座標（依序）:</strong> ${interiorCoords.map((p) => fmt(p)).join('；')}`;
            } else if (coords.length >= 2) {
              tooltipContent += `<br><strong>轉折點座標:</strong> （無）`;
            }
            tooltipContent += '<br>';
            if (tags) {
              const tagsHtml = Object.entries(tags)
                .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                .join('<br>');
              tooltipContent += tagsHtml || '無標籤資訊';
            }
            if (stationWeights && Array.isArray(stationWeights) && stationWeights.length > 0) {
              tooltipContent += '<br><strong>站間權重 (station_weights):</strong><br>';
              stationWeights.forEach((w, wi) => {
                const sw = w?.start_idx;
                const ew = w?.end_idx;
                const wt = w?.weight;
                tooltipContent += `  #${wi + 1} start_idx=${sw} → end_idx=${ew}，weight=${wt}<br>`;
              });
            }
            if (uniformGridRouteFamilyTab) {
              const jl = dataStore.findLayerById(layerTab);
              const jr =
                layoutUniformGridTooltipJr ??
                mapDrawnExportRowsFromJsonDrawRoot(jl?.jsonData, jl?.dataJson);
              if (Array.isArray(jr)) {
                const idxHint =
                  exportRowIndexHint != null && Number.isFinite(Number(exportRowIndexHint))
                    ? Number(exportRowIndexHint)
                    : null;
                let segMatch = null;
                if (
                  idxHint != null &&
                  idxHint >= 0 &&
                  idxHint < jr.length &&
                  jr[idxHint] &&
                  typeof jr[idxHint] === 'object'
                ) {
                  segMatch = jr[idxHint]?.segment ?? null;
                }
                const rid = routeFeatureRouteId != null ? String(routeFeatureRouteId) : '';
                const rnm = name != null ? String(name) : '';
                if (!segMatch && rid !== '') {
                  const hits = jr.filter((r) => r && String(r.route_id ?? '') === rid);
                  segMatch = hits.length === 1 ? (hits[0]?.segment ?? null) : null;
                }
                if (!segMatch && rnm !== '') {
                  const hitsNm = jr.filter((r) => r && String(r.routeName ?? '') === rnm);
                  segMatch = hitsNm.length === 1 ? (hitsNm[0]?.segment ?? null) : null;
                }
                if (segMatch) {
                  const jrFile =
                    mapDrawnExportRowsFromJsonDrawRoot(jl?.jsonData, jl?.dataJson) ?? [];
                  const stationHoverPool = [
                    ...jrFile,
                    ...(Array.isArray(layoutUniformGridTooltipJr)
                      ? layoutUniformGridTooltipJr
                      : []),
                  ];
                  const segForTip = enrichExportRowStationsFromPool(
                    { segment: segMatch, routeName: rnm },
                    stationHoverPool
                  ).segment;
                  tooltipContent += tooltipHtmlSegmentStationsOrderedVerbose(segForTip);
                }
              }
            }
            return tooltipContent || '無標籤資訊';
          };

          if (uniformGridRouteFamilyTab) {
            routeTooltipAppendNearLine = false;
            const jl = dataStore.findLayerById(layerTab);
            const jr =
              layoutUniformGridTooltipJr ??
              mapDrawnExportRowsFromJsonDrawRoot(jl?.jsonData, jl?.dataJson);
            let rowMatch = null;
            if (Array.isArray(jr)) {
              const idxHint =
                exportRowIndexHint != null && Number.isFinite(Number(exportRowIndexHint))
                  ? Number(exportRowIndexHint)
                  : null;
              if (
                idxHint != null &&
                idxHint >= 0 &&
                idxHint < jr.length &&
                jr[idxHint] &&
                typeof jr[idxHint] === 'object'
              ) {
                rowMatch = jr[idxHint];
              }
              const rid = routeFeatureRouteId != null ? String(routeFeatureRouteId) : '';
              const rnm = name != null ? String(name) : '';
              if (!rowMatch && rid !== '') {
                const hits = jr.filter((r) => r && String(r.route_id ?? '') === rid);
                rowMatch = hits.length === 1 ? hits[0] : null;
              }
              if (!rowMatch && rnm !== '') {
                const hitsNm = jr.filter((r) => r && String(r.routeName ?? '') === rnm);
                if (hitsNm.length === 1) {
                  rowMatch = hitsNm[0];
                } else if (
                  hitsNm.length > 1 &&
                  idxHint != null &&
                  idxHint >= 0 &&
                  idxHint < jr.length &&
                  jr[idxHint] &&
                  String(jr[idxHint]?.routeName ?? '') === rnm
                ) {
                  rowMatch = jr[idxHint];
                }
              }
            }
            if (rowMatch) {
              const jrFile = mapDrawnExportRowsFromJsonDrawRoot(jl?.jsonData, jl?.dataJson) ?? [];
              const stationHoverPool = [
                ...jrFile,
                ...(Array.isArray(layoutUniformGridTooltipJr) ? layoutUniformGridTooltipJr : []),
              ];
              const rowForTip = enrichExportRowStationsFromPool(rowMatch, stationHoverPool);
              const chain = expandLonLatChainFromRouteCoordinates(rowForTip.routeCoordinates);
              routeTooltipHtml = routeExportRowPolylineTooltipHtml(rowForTip, chain);
            } else {
              routeTooltipAppendNearLine = true;
              routeTooltipHtml = buildLegacyLineTooltip();
            }
          } else {
            routeTooltipAppendNearLine = true;
            routeTooltipHtml = buildLegacyLineTooltip();
          }

          tooltip
            .html(routeTooltipHtml)
            .style('opacity', 1)
            .style('left', event.pageX + 10 + 'px')
            .style('top', event.pageY - 10 + 'px');
        })
        .on('mousemove', function (event) {
          tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
          if (!routeTooltipAppendNearLine) return;
          if ((!minSpacingOverlay && !taipeiCReducedOverlayDraw) || !routeTooltipHtml) return;
          const [gx, gy] = eventToNetworkXY(event);
          const near = closestPointOnPolyline(coords, gx, gy);
          if (!near) return;
          const [qx, qy] = near;
          const nqx = qx;
          const nqy = qy;
          const nearCoordStr = `(${formatPathCoordNumber(nqx)}, ${formatPathCoordNumber(nqy)})`;
          const nearLine = `<br><strong>游標鄰近路徑點:</strong> ${nearCoordStr}${minSpacingTooltipBlock(nqx, nqy)}`;
          tooltip.html(routeTooltipHtml + nearLine);
        })
        .on('mouseout', function () {
          // 恢復路線樣式
          d3.select(this)
            .attr('stroke-width', baseStrokeW)
            .attr('opacity', 0.9)
            .attr('stroke', baseStroke);
          overlayPaths.forEach((ov) => ov.attr('stroke-width', baseStrokeW).attr('opacity', 0.9));

          // 隱藏 tooltip
          tooltip.style('opacity', 0);
        });

      // 繪製 station_weights；示意格層依 showWeightLabels；與 K3 分頁共用 spaceNetworkGridShowRouteWeights
      if (
        stationWeights &&
        Array.isArray(stationWeights) &&
        stationWeights.length > 0 &&
        (!useSchematicCellCenterGrid || dataStore.showWeightLabels) &&
        dataStore.spaceNetworkGridShowRouteWeights
      ) {
        if (!Array.isArray(coords) || coords.length < 2) {
          /* skip weights */
        } else {
          const refPoints = originalPoints || points || coords;
          if (!Array.isArray(refPoints) || refPoints.length < 2) {
            /* skip */
          } else {
            const refCoords = refPoints
              .map((pt) => {
                if (Array.isArray(pt)) {
                  return pt.length >= 2 ? [pt[0], pt[1]] : null;
                }
                return pt && pt.x !== undefined && pt.y !== undefined ? [pt.x, pt.y] : null;
              })
              .filter((pt) => pt !== null);

            if (refCoords.length >= 2) {
              const stationDists = refCoords.map((pt) => getStationDistOnPolyline(pt, coords));
              const useL3MergedWeightGreenFill = false;

              const appendWeightLabel = (px, py) => {
                const textGroup = zoomGroup.append('g').attr('class', 'edge-weight-label');
                textGroup
                  .append('text')
                  .attr('x', xScale(px))
                  .attr('y', yScale(py))
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'middle')
                  .attr('font-size', useSchematicCellCenterGrid ? '9px' : '7px')
                  .attr('font-weight', 'bold')
                  .attr('fill', useL3MergedWeightGreenFill ? '#0a8f2e' : '#1a1a1a')
                  .attr('stroke', useL3MergedWeightGreenFill ? '#f0fff4' : '#ffffff')
                  .attr('stroke-width', useL3MergedWeightGreenFill ? 0.55 : 0.4)
                  .attr('paint-order', 'stroke')
                  .style('pointer-events', 'none');
                return textGroup;
              };

              stationWeights.forEach((weightInfo) => {
                const { start_idx, end_idx, weight } = weightInfo;
                if (
                  typeof start_idx !== 'number' ||
                  typeof end_idx !== 'number' ||
                  start_idx < 0 ||
                  end_idx < 0 ||
                  start_idx >= stationDists.length ||
                  end_idx >= stationDists.length ||
                  start_idx >= end_idx
                ) {
                  return;
                }

                // 一律取「畫面上此路段折線」的弧長中點，權重數字落在路線上（含 taipei_g 格線座標）
                const startDist = stationDists[start_idx];
                const endDist = stationDists[end_idx];
                const midDist = (startDist + endDist) / 2;
                const midPoint = getPointAtDistance(coords, midDist);
                const [midX, midY] = midPoint;
                appendWeightLabel(midX, midY).select('text').text(String(weight));
              });
            }
          }
        }
      }
    };

    /**
     * layout-grid-viewer（layoutVhDrawPixelAxisMode）：以路徑**起點—終點（pt）**重畫為
     * **45°–水平／垂直–45°**（含 0／1 轉折退化），**每條路線至多 2 個轉折**（≤4 頂點）。
     * 雙轉折時，中間 H／V 段取起迄 **幾何中點**（ym 或 xm）；純 H／V 摺線不改畫。
     * 候選依轉折由少到多；並做**幾何重疊 + 水平／垂直共線重疊**檢測與反覆調整。
     * **只要存在全網無衝突的 H/V/45° 候選就不得選重疊路徑**；候選僅限 H/V/45°（絕不使用其他角度）。
     * 均勻網格輔助線僅單線簡化、不排除與路網重疊。
     */
    /** @type {Map<string, number[][]>|null} */
    let layoutPixelVhDrawRouteGridByKey = null;
    /** 加權模式：已在加權 SVG 空間重算的 H/V/45° 路線（直接畫，不再套 remap）。 */
    let layoutWeightedRouteSvgByKey = null;
    /** 加權模式：待 plotRemapSvgX/Y 就緒後呼叫，重跑同套 HV45° 算法。 */
    let recomputeWeightedRoutes = null;
    /** @param {number[][]} path */
    let hvTransformPath = (path) => path;

    if (layoutVhDrawPixelAxisMode && isLayoutNetworkGridFromVhDrawLayerId(layerTab)) {
      /** px：小於此視為水平／垂直 */
      const PATH_EPS = 0.5;
      /** 與其他路線做重疊判斷（端點相接允許；內部交叉／共線重疊不允許） */
      const OVERLAP_PT_TOL = 0.75;

      const dist2 = (p, q) => {
        const dx = p[0] - q[0];
        const dy = p[1] - q[1];
        return dx * dx + dy * dy;
      };
      const ptNear = (p, q, tol) => dist2(p, q) <= tol * tol;
      const segShareEnd = (a1, a2, b1, b2, tol) =>
        ptNear(a1, b1, tol) || ptNear(a1, b2, tol) || ptNear(a2, b1, tol) || ptNear(a2, b2, tol);

      const pointStrictInteriorOnOpenSegment = (p, a1, a2, tol) => {
        const len2 = dist2(a1, a2);
        if (len2 < tol * tol) return false;
        const t = ((p[0] - a1[0]) * (a2[0] - a1[0]) + (p[1] - a1[1]) * (a2[1] - a1[1])) / len2;
        const te = 1e-6;
        if (t <= te || t >= 1 - te) return false;
        const x = a1[0] + t * (a2[0] - a1[0]);
        const y = a1[1] + t * (a2[1] - a1[1]);
        return dist2(p, [x, y]) <= tol * tol;
      };

      const segmentIntersectionInterior = (a1, a2, b1, b2, te) => {
        if (segShareEnd(a1, a2, b1, b2, OVERLAP_PT_TOL)) return false;
        const x1 = a1[0];
        const y1 = a1[1];
        const x2 = a2[0];
        const y2 = a2[1];
        const x3 = b1[0];
        const y3 = b1[1];
        const x4 = b2[0];
        const y4 = b2[1];
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(d) < 1e-14) {
          const cross = (x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1);
          if (Math.abs(cross) > OVERLAP_PT_TOL) return false;
          const useX = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
          const proj = useX ? (p) => p[0] : (p) => p[1];
          const a = proj(a1);
          const b = proj(a2);
          const c = proj(b1);
          const d0 = proj(b2);
          const lo = Math.max(Math.min(a, b), Math.min(c, d0));
          const hi = Math.min(Math.max(a, b), Math.max(c, d0));
          return hi - lo > te;
        }
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
        const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / d;
        return t > te && t < 1 - te && u > te && u < 1 - te;
      };

      const edgePairOverlaps = (a1, a2, b1, b2, tol) => {
        if (segShareEnd(a1, a2, b1, b2, tol)) return false;
        const te = 1e-7;
        if (segmentIntersectionInterior(a1, a2, b1, b2, te)) return true;
        if (pointStrictInteriorOnOpenSegment(a1, b1, b2, tol)) return true;
        if (pointStrictInteriorOnOpenSegment(a2, b1, b2, tol)) return true;
        if (pointStrictInteriorOnOpenSegment(b1, a1, a2, tol)) return true;
        if (pointStrictInteriorOnOpenSegment(b2, a1, a2, tol)) return true;
        return false;
      };

      const polylinePairOverlapsPx = (polyA, polyB, tol) => {
        if (!polyA || !polyB || polyA.length < 2 || polyB.length < 2) return false;
        for (let i = 0; i < polyA.length - 1; i++) {
          const p1 = polyA[i];
          const p2 = polyA[i + 1];
          for (let j = 0; j < polyB.length - 1; j++) {
            const q1 = polyB[j];
            const q2 = polyB[j + 1];
            if (edgePairOverlaps(p1, p2, q1, q2, tol)) return true;
          }
        }
        return false;
      };

      /** 兩段水平（或兩段垂直）幾乎同列／同行且投影重疊長度超過容許 */
      const parallelHVStripOverlap = (polyA, polyB, eps) => {
        const HV_OVERLAP_MIN_LEN = OVERLAP_PT_TOL * 2 + 0.01;
        const collectH = (poly) => {
          const segs = [];
          for (let i = 0; i < poly.length - 1; i++) {
            const p1 = poly[i];
            const p2 = poly[i + 1];
            if (Math.abs(p2[1] - p1[1]) < eps && Math.abs(p2[0] - p1[0]) >= eps) {
              segs.push({
                y: (p1[1] + p2[1]) / 2,
                lo: Math.min(p1[0], p2[0]),
                hi: Math.max(p1[0], p2[0]),
              });
            }
          }
          return segs;
        };
        const collectV = (poly) => {
          const segs = [];
          for (let i = 0; i < poly.length - 1; i++) {
            const p1 = poly[i];
            const p2 = poly[i + 1];
            if (Math.abs(p2[0] - p1[0]) < eps && Math.abs(p2[1] - p1[1]) >= eps) {
              segs.push({
                x: (p1[0] + p2[0]) / 2,
                lo: Math.min(p1[1], p2[1]),
                hi: Math.max(p1[1], p2[1]),
              });
            }
          }
          return segs;
        };
        const hh = (as, bs) => {
          for (const a of as) {
            for (const b of bs) {
              if (Math.abs(a.y - b.y) > eps) continue;
              const lo = Math.max(a.lo, b.lo);
              const hi = Math.min(a.hi, b.hi);
              if (hi - lo > HV_OVERLAP_MIN_LEN) return true;
            }
          }
          return false;
        };
        const vv = (as, bs) => {
          for (const a of as) {
            for (const b of bs) {
              if (Math.abs(a.x - b.x) > eps) continue;
              const lo = Math.max(a.lo, b.lo);
              const hi = Math.min(a.hi, b.hi);
              if (hi - lo > HV_OVERLAP_MIN_LEN) return true;
            }
          }
          return false;
        };
        return hh(collectH(polyA), collectH(polyB)) || vv(collectV(polyA), collectV(polyB));
      };

      const routesGeomConflict = (polyA, polyB, tol) =>
        polylinePairOverlapsPx(polyA, polyB, tol) || parallelHVStripOverlap(polyA, polyB, tol);

      /**
       * 各路線自 bend 少到多選候選；全網存在無衝突 H/V/45° 選項時必選之。
       * @param {{ candidates: { bends: number; pts: number[][] }[] }[]} rows
       * @returns {number[]}
       */
      const assignRoutesMinimizeOverlap = (rows, tol) => {
        const chosenIdx = rows.map(() => 0);
        const ptsAt = (i) => rows[i].candidates[chosenIdx[i]].pts;

        for (let i = 0; i < rows.length; i++) {
          let pick = -1;
          for (let p = 0; p < rows[i].candidates.length; p++) {
            const pi = rows[i].candidates[p].pts;
            let ok = true;
            for (let k = 0; k < i; k++) {
              if (routesGeomConflict(pi, ptsAt(k), tol)) {
                ok = false;
                break;
              }
            }
            if (ok) {
              pick = p;
              break;
            }
          }
          chosenIdx[i] = pick >= 0 ? pick : 0;
        }

        const pairwiseConflict = () => {
          for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
              if (routesGeomConflict(ptsAt(i), ptsAt(j), tol)) return { i, j };
            }
          }
          return null;
        };

        let guard = 0;
        const maxGuard = rows.length * rows.length * 16 + 48;
        while (guard < maxGuard) {
          const hit = pairwiseConflict();
          if (!hit) break;
          const { i, j } = hit;
          if (chosenIdx[j] + 1 < rows[j].candidates.length) {
            chosenIdx[j] += 1;
          } else if (chosenIdx[i] + 1 < rows[i].candidates.length) {
            chosenIdx[i] += 1;
          } else {
            break;
          }
          guard += 1;
        }

        let changed = true;
        while (changed) {
          changed = false;
          for (let i = 0; i < rows.length; i++) {
            const curPts = rows[i].candidates[chosenIdx[i]].pts;
            let curBad = false;
            for (let j = 0; j < rows.length; j++) {
              if (i === j) continue;
              if (routesGeomConflict(curPts, ptsAt(j), tol)) {
                curBad = true;
                break;
              }
            }
            if (!curBad) continue;
            for (let p = 0; p < rows[i].candidates.length; p++) {
              if (p === chosenIdx[i]) continue;
              const pi = rows[i].candidates[p].pts;
              let ok = true;
              for (let j = 0; j < rows.length; j++) {
                if (i === j) continue;
                if (routesGeomConflict(pi, rows[j].candidates[chosenIdx[j]].pts, tol)) {
                  ok = false;
                  break;
                }
              }
              if (ok) {
                chosenIdx[i] = p;
                changed = true;
                break;
              }
            }
          }
        }

        return chosenIdx;
      };

      const classifyEdgeHV45 = (A, B, eps) => {
        const dx = B[0] - A[0];
        const dy = B[1] - A[1];
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (ady < eps) return 'H';
        if (adx < eps) return 'V';
        if (Math.abs(adx - ady) < eps) return '45';
        return 'X';
      };

      const polylineEdgesAllHV45 = (pts, eps) => {
        for (let i = 0; i < pts.length - 1; i++) {
          if (classifyEdgeHV45(pts[i], pts[i + 1], eps) === 'X') return false;
        }
        return pts.length >= 2;
      };

      const dedupeConsecutivePx = (pts, tol) =>
        pts.reduce((acc, p) => {
          if (acc.length === 0 || !ptNear(p, acc[acc.length - 1], tol)) acc.push(p);
          return acc;
        }, []);

      const polylineKeyForDedupe = (pts) =>
        pts
          .map((p) => `${Math.round(p[0] * 1000) / 1000},${Math.round(p[1] * 1000) / 1000}`)
          .join('|');

      /** 起迄 S,T（pt）→ 45°–H/V–45° 候選，轉折 0→1→2；雙轉折之中段在起迄中點 ym 或 xm */
      const buildStCandidatesPx = (S, T) => {
        /** @type {{ bends: number; pts: number[][] }[]} */
        const raw = [];
        const dx = T[0] - S[0];
        const dy = T[1] - S[1];
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        const sx = dx >= 0 ? 1 : -1;
        const sy = dy >= 0 ? 1 : -1;
        const k = Math.min(adx, ady);

        const tryPush = (pts) => {
          const d = dedupeConsecutivePx(pts, PATH_EPS * 0.5);
          if (d.length < 2) return;
          if (!polylineEdgesAllHV45(d, PATH_EPS)) return;
          const bends = Math.max(0, d.length - 2);
          if (bends > 2) return;
          raw.push({ bends, pts: d });
        };

        tryPush([S, T]);

        if (k > PATH_EPS) {
          const CA = [S[0] + sx * k, S[1] + sy * k];
          tryPush([S, CA, T]);
          let CB;
          if (adx > ady) {
            CB = [T[0] - sx * k, S[1]];
          } else {
            CB = [S[0], T[1] - sy * k];
          }
          tryPush([S, CB, T]);
        }

        // 45°–水平–45°：只在 adx > ady 時中間段才向前（避免反向的「Z」型平行斜線）。
        // 中段水平線預設在 1/2；若與他線重疊，後續選案可改用 1/4 或 3/4（皆維持 H/V/45°，
        // 中段長度恆為 adx-ady，僅高度不同）。1/2 先 push 以維持預設偏好。
        if (adx > ady + PATH_EPS) {
          for (const f of [0.5, 0.25, 0.75]) {
            const ym = S[1] + (T[1] - S[1]) * f;
            const M1 = [S[0] + sx * Math.abs(ym - S[1]), ym];
            const M2 = [T[0] - sx * Math.abs(ym - T[1]), ym];
            tryPush([S, M1, M2, T]);
          }
        }

        // 45°–垂直–45°：只在 ady > adx 時中間段才向前（避免反向的「Z」型平行斜線）。
        // 中段垂直線預設在 1/2，重疊時可改 1/4 或 3/4。
        if (ady > adx + PATH_EPS) {
          for (const f of [0.5, 0.25, 0.75]) {
            const xm = S[0] + (T[0] - S[0]) * f;
            const M1 = [xm, S[1] + sy * Math.abs(xm - S[0])];
            const M2 = [xm, T[1] - sy * Math.abs(xm - T[0])];
            tryPush([S, M1, M2, T]);
          }
        }

        // 正交 L（純 H+V）：先橫後豎 / 先豎後橫——任何情況下都產生，確保 45° 重疊時有替代
        if (adx > PATH_EPS && ady > PATH_EPS) {
          tryPush([S, [T[0], S[1]], T]);
          tryPush([S, [S[0], T[1]], T]);
        }

        raw.sort((a, b) => a.bends - b.bends);
        const seen = new Set();
        const out = [];
        for (const c of raw) {
          const k0 = polylineKeyForDedupe(c.pts);
          if (seen.has(k0)) continue;
          seen.add(k0);
          out.push(c);
        }
        return out;
      };

      /**
       * 起迄 S,T（pt）→ 僅 H/V/45° 候選；無枚舉解時僅保留仍為 H/V/45° 之折線或起迄直線。
       * @returns {{ bends: number; pts: number[][] }[]}
       */
      const buildHv45RouteCandidatesPx = (S, T, pxIn) => {
        const simplified = buildStCandidatesPx(S, T);
        if (simplified.length > 0) return simplified;
        if (polylineEdgesAllHV45(pxIn, PATH_EPS)) return [{ bends: -1, pts: pxIn }];
        const st = [S, T];
        if (polylineEdgesAllHV45(st, PATH_EPS)) return [{ bends: 0, pts: st }];
        return [];
      };

      const pxPathToGridPath = (pxPts) =>
        pxPts.map((c) => [xScale.invert(c[0]), yScale.invert(c[1])]);

      hvTransformPath = (gridPath) => {
        if (!Array.isArray(gridPath) || gridPath.length < 2) return gridPath;
        const pxIn = gridPath.map((c) => [xScale(c[0]), yScale(c[1])]);
        if (polylineEdgesAllHV45(pxIn, PATH_EPS)) return gridPath;
        const S = pxIn[0];
        const T = pxIn[pxIn.length - 1];
        const candidates = buildHv45RouteCandidatesPx(S, T, pxIn);
        if (candidates[0]?.pts) return pxPathToGridPath(candidates[0].pts);
        if (polylineEdgesAllHV45([S, T], PATH_EPS)) {
          return [gridPath[0], gridPath[gridPath.length - 1]];
        }
        return [];
      };

      /**
       * 在「不重疊」（硬性）前提下，於各候選間選出使「共用車站端點之相鄰 H/V 段共線連續長度」最大者；
       * 轉折數為最末分手段。自既有 baseIdx（不重疊、轉折最少）出發做 overlap-preserving 局部搜尋。
       * 端點相連對象＝端點座標相近（≤tol）之其他路線端邊；同朝向（H／V）且共線層級相同（同列 y／同行 x）即視為連續，加總長度。
       * @param {{ candidates: { bends:number; pts:number[][] }[] }[]} rows
       * @param {number[]} baseIdx
       * @param {number} tol
       * @returns {number[]}
       */
      const maximizeHvConnectivity = (rows, baseIdx, tol) => {
        const n = rows.length;
        if (n <= 1) return baseIdx;
        const endpointsOf = (i) => {
          const pts = rows[i].candidates[0]?.pts;
          if (!pts || pts.length < 2) return null;
          return [pts[0], pts[pts.length - 1]];
        };
        /** 端點分群成 junction（共用車站） */
        const junctions = [];
        const findJunction = (p) => {
          for (let j = 0; j < junctions.length; j++) {
            if (ptNear(p, [junctions[j].x, junctions[j].y], tol)) return j;
          }
          junctions.push({ x: p[0], y: p[1] });
          return junctions.length - 1;
        };
        const routeJ = [];
        for (let i = 0; i < n; i++) {
          const e = endpointsOf(i);
          routeJ.push(e ? [findJunction(e[0]), findJunction(e[1])] : null);
        }
        /** 候選之 45° 邊數：最後 H/V 調整僅在「同 45° 邊數」候選間切換（只翻邊，不消除既定 45° 線）。 */
        const count45 = (pts) => {
          let c = 0;
          for (let e = 0; e < pts.length - 1; e++) {
            if (classifyEdgeHV45(pts[e], pts[e + 1], PATH_EPS) === '45') c += 1;
          }
          return c;
        };
        const base45 = baseIdx.map((bi, i) => {
          const cand = rows[i].candidates[bi];
          return cand ? count45(cand.pts) : 0;
        });
        /** 端邊：朝向＋共線層級（H 取 y、V 取 x）＋長度；非 H/V 不計 */
        const terminalEdge = (pts, atStart) => {
          const m = pts.length;
          if (m < 2) return null;
          const A = atStart ? pts[0] : pts[m - 1];
          const B = atStart ? pts[1] : pts[m - 2];
          const orient = classifyEdgeHV45(A, B, PATH_EPS);
          if (orient !== 'H' && orient !== 'V') return null;
          return {
            orient,
            level: orient === 'H' ? A[1] : A[0],
            len: Math.hypot(B[0] - A[0], B[1] - A[1]),
          };
        };
        const LEVEL_EPS = PATH_EPS;
        const BEND_PENALTY = 1e-3;
        const scoreOf = (idxArr) => {
          /** @type {Map<number, {orient:string; level:number; len:number}[]>} */
          const byJ = new Map();
          let bendSum = 0;
          for (let i = 0; i < n; i++) {
            const rj = routeJ[i];
            if (!rj) continue;
            const cand = rows[i].candidates[idxArr[i]];
            if (!cand) continue;
            bendSum += Math.max(0, cand.bends);
            const es = terminalEdge(cand.pts, true);
            const ee = terminalEdge(cand.pts, false);
            if (es) {
              if (!byJ.has(rj[0])) byJ.set(rj[0], []);
              byJ.get(rj[0]).push(es);
            }
            if (ee) {
              if (!byJ.has(rj[1])) byJ.set(rj[1], []);
              byJ.get(rj[1]).push(ee);
            }
          }
          let s = 0;
          for (const edges of byJ.values()) {
            const used = new Array(edges.length).fill(false);
            for (let a = 0; a < edges.length; a++) {
              if (used[a]) continue;
              let total = edges[a].len;
              let cnt = 1;
              for (let b = a + 1; b < edges.length; b++) {
                if (used[b]) continue;
                if (
                  edges[b].orient === edges[a].orient &&
                  Math.abs(edges[b].level - edges[a].level) < LEVEL_EPS
                ) {
                  used[b] = true;
                  total += edges[b].len;
                  cnt += 1;
                }
              }
              used[a] = true;
              if (cnt >= 2) s += total;
            }
          }
          return s - BEND_PENALTY * bendSum;
        };
        const ptsAtIdx = (i, idxArr) => rows[i].candidates[idxArr[i]].pts;
        const cur = baseIdx.slice();
        let curScore = scoreOf(cur);
        let improved = true;
        let guard = 0;
        const maxGuard = n * n * 8 + 64;
        while (improved && guard < maxGuard) {
          improved = false;
          for (let i = 0; i < n; i++) {
            let bestP = cur[i];
            let bestS = curScore;
            for (let p = 0; p < rows[i].candidates.length; p++) {
              if (p === cur[i]) continue;
              const pi = rows[i].candidates[p].pts;
              // 只在「同 45° 邊數」候選間翻邊；避免改用純正交 L 而把該有的 45° 線消除
              if (count45(pi) !== base45[i]) continue;
              let ok = true;
              for (let j = 0; j < n; j++) {
                if (i === j) continue;
                if (routesGeomConflict(pi, ptsAtIdx(j, cur), tol)) {
                  ok = false;
                  break;
                }
              }
              if (!ok) continue;
              const trial = cur.slice();
              trial[i] = p;
              const sc = scoreOf(trial);
              if (sc > bestS + 1e-9) {
                bestS = sc;
                bestP = p;
              }
            }
            if (bestP !== cur[i]) {
              cur[i] = bestP;
              curScore = bestS;
              improved = true;
            }
            guard += 1;
            if (guard >= maxGuard) break;
          }
        }
        return cur;
      };

      layoutPixelVhDrawRouteGridByKey = new Map();

      const routeItems = [];
      routeFeatures.forEach((feature, featIdx) => {
        if (!feature?.geometry) return;
        const pr = feature.properties || {};
        if (pr.layoutUniformStationGrid === true) return;
        const g = feature.geometry;
        if (g.type === 'LineString') {
          routeItems.push({ coordinates: g.coordinates, featIdx, pi: 0 });
        } else if (g.type === 'MultiLineString') {
          g.coordinates.forEach((coords, pi) =>
            routeItems.push({ coordinates: coords, featIdx, pi })
          );
        }
      });

      /** @type {{ key: string; pxIn: number[][]; candidates: { bends: number; pts: number[][] }[] }[]} */
      const assignment = [];
      for (const item of routeItems) {
        const gridPath = transformPathCoords(item.coordinates);
        const key = `${item.featIdx}#${item.pi}`;
        if (!Array.isArray(gridPath) || gridPath.length < 2) {
          layoutPixelVhDrawRouteGridByKey.set(key, gridPath);
          continue;
        }
        const pxIn = gridPath.map((c) => [xScale(c[0]), yScale(c[1])]);
        const S = pxIn[0];
        const T = pxIn[pxIn.length - 1];
        if (polylineEdgesAllHV45(pxIn, PATH_EPS)) {
          const stAlts = buildStCandidatesPx(S, T);
          const pxKey = polylineKeyForDedupe(pxIn);
          const alts = stAlts.filter((c) => polylineKeyForDedupe(c.pts) !== pxKey);
          const candidates = [{ bends: -1, pts: pxIn }, ...alts];
          assignment.push({ key, pxIn, candidates });
          continue;
        }
        const candidates = buildHv45RouteCandidatesPx(S, T, pxIn);
        if (candidates.length === 0) {
          const fallback = hvTransformPath(gridPath);
          if (Array.isArray(fallback) && fallback.length >= 2) {
            layoutPixelVhDrawRouteGridByKey.set(key, fallback);
          }
          continue;
        }
        assignment.push({ key, pxIn, candidates });
      }

      const chosenIdxBase = assignRoutesMinimizeOverlap(assignment, OVERLAP_PT_TOL);
      const chosenIdx = maximizeHvConnectivity(assignment, chosenIdxBase, OVERLAP_PT_TOL);

      for (let ri = 0; ri < assignment.length; ri += 1) {
        const row = assignment[ri];
        const pts = row.candidates[chosenIdx[ri]].pts;
        layoutPixelVhDrawRouteGridByKey.set(
          row.key,
          pts.map((c) => [xScale.invert(c[0]), yScale.invert(c[1])])
        );
      }

      /**
       * 加權繪區：待 plotRemapSvgX/Y 計算完畢後呼叫。
       * 以加權 SVG 座標重跑同套 buildStCandidatesPx + conflict resolution，
       * 保證路線在加權空間中只有 H/V/45° 且轉折 ≤ 2。
       */
      if (layoutVhDrawWeightedLayoutMode || layoutVhDrawFisheyeActive) {
        recomputeWeightedRoutes = (remapX, remapY) => {
          layoutWeightedRouteSvgByKey = new Map();
          const wAssign = [];
          for (const item of routeItems) {
            const gridPath = transformPathCoords(item.coordinates);
            const wKey = `${item.featIdx}#${item.pi}`;
            if (!Array.isArray(gridPath) || gridPath.length < 2) {
              layoutWeightedRouteSvgByKey.set(
                wKey,
                (gridPath || []).map((c) => [remapX(xScale(c[0])), remapY(yScale(c[1]))])
              );
              continue;
            }
            const pxIn = gridPath.map((c) => [remapX(xScale(c[0])), remapY(yScale(c[1]))]);
            const S = pxIn[0];
            const T = pxIn[pxIn.length - 1];
            if (polylineEdgesAllHV45(pxIn, PATH_EPS)) {
              const stAlts = buildStCandidatesPx(S, T);
              const pxKey = polylineKeyForDedupe(pxIn);
              const alts = stAlts.filter((c) => polylineKeyForDedupe(c.pts) !== pxKey);
              wAssign.push({ key: wKey, candidates: [{ bends: -1, pts: pxIn }, ...alts] });
              continue;
            }
            const candidates = buildHv45RouteCandidatesPx(S, T, pxIn);
            if (candidates.length === 0) continue;
            wAssign.push({ key: wKey, candidates });
          }
          const wIdxBase = assignRoutesMinimizeOverlap(wAssign, OVERLAP_PT_TOL);
          const wIdx = maximizeHvConnectivity(wAssign, wIdxBase, OVERLAP_PT_TOL);
          for (let ri = 0; ri < wAssign.length; ri++) {
            layoutWeightedRouteSvgByKey.set(wAssign[ri].key, wAssign[ri].candidates[wIdx[ri]].pts);
          }
        };
      }
      // fisheye：以變形後 remap 立即重佈線（H/V/45°），供路線繪製與黑點弧長對位使用。
      if (layoutVhDrawFisheyeActive && recomputeWeightedRoutes) {
        recomputeWeightedRoutes(plotRemapSvgX, plotRemapSvgY);
      }
    }

    const drawLayoutUniformGridLines = (coords) => {
      if (!Array.isArray(coords) || coords.length < 2) return;
      const transformed = offsetPathToSchematicCellCenters(
        hvTransformPath(transformPathCoords(coords))
      );
      const d = lineGenerator(transformed);
      if (!d) return;
      zoomGroup
        .append('path')
        .attr('d', d)
        .attr('class', 'layout-uniform-station-grid-line')
        .attr('stroke', '#5c6b7a')
        .attr('fill', 'none')
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('opacity', 0.88)
        .attr('stroke-linecap', 'round')
        .style('stroke-width', '1pt')
        .style('pointer-events', 'none');
    };

    // 均勻细分網格線（繪於路線之下）
    for (const uf of routeFeatures) {
      if (!uf || !uf.geometry || uf.geometry.type !== 'LineString') continue;
      const pq = uf.properties || {};
      if (pq.layoutUniformStationGrid !== true) continue;
      drawLayoutUniformGridLines(uf.geometry.coordinates);
    }

    const tabLyrRouteHl = dataStore.findLayerById(layerTab);
    const vhDrawRouteStrokeHlIdx =
      isSpaceGridVhDrawFamilyLayerId(layerTab) &&
      tabLyrRouteHl &&
      Array.isArray(tabLyrRouteHl.highlightedSegmentIndex) &&
      tabLyrRouteHl.highlightedSegmentIndex[0] === 'vhDrawRoute' &&
      Number.isFinite(Number(tabLyrRouteHl.highlightedSegmentIndex[1]))
        ? Number(tabLyrRouteHl.highlightedSegmentIndex[1])
        : null;

    // 繪製路線（支援 LineString / MultiLineString）；有疊加網格時線一起移動
    /** layout-grid 加權繪區：延後至欄／列比例與 plotRemap 就緒後再畫。 */
    const drawLayoutRoutesPass = () => {
      routeFeatures.forEach((feature, featIdx) => {
        if (!feature || !feature.geometry) return;
        const props = feature.properties || {};
        if (props.layoutUniformStationGrid === true) return;
        const tags = props.tags || {};
        const geom = feature.geometry;
        const isHvZHl = false;

        const routeFeatId =
          props.route_id != null && props.route_id !== '' ? String(props.route_id) : '';
        const exportRowIdx =
          props.map_draw_row_index != null && Number.isFinite(Number(props.map_draw_row_index))
            ? Number(props.map_draw_row_index)
            : props.export_row_index != null && Number.isFinite(Number(props.export_row_index))
              ? Number(props.export_row_index)
              : null;

        const isVhDrawRouteHl =
          vhDrawRouteStrokeHlIdx != null &&
          exportRowIdx != null &&
          exportRowIdx === vhDrawRouteStrokeHlIdx;

        if (geom.type === 'LineString') {
          const rawGrid = transformPathCoords(geom.coordinates);
          const key0 = `${featIdx}#0`;
          const gridForDraw =
            layoutPixelVhDrawRouteGridByKey?.get(key0) ?? hvTransformPath(rawGrid);
          const svgOvr = layoutWeightedRouteSvgByKey?.get(key0) ?? null;
          drawRoutePath(
            offsetPathToSchematicCellCenters(gridForDraw),
            tags,
            props.name,
            props.color,
            props.station_weights,
            props.original_points,
            props.points,
            isHvZHl || isVhDrawRouteHl,
            Boolean(props.l3_black_dot_reduced_weight_green),
            routeFeatId,
            exportRowIdx,
            svgOvr,
            layoutPathEdgeKeySet?.has(key0) === true
          );
        } else if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach((coords, pi) => {
            const rawGrid = transformPathCoords(coords);
            const keyPi = `${featIdx}#${pi}`;
            const gridForDraw =
              layoutPixelVhDrawRouteGridByKey?.get(keyPi) ?? hvTransformPath(rawGrid);
            const svgOvr = layoutWeightedRouteSvgByKey?.get(keyPi) ?? null;
            drawRoutePath(
              offsetPathToSchematicCellCenters(gridForDraw),
              tags,
              props.name,
              props.color,
              props.station_weights,
              props.original_points,
              props.points,
              isHvZHl || isVhDrawRouteHl,
              Boolean(props.l3_black_dot_reduced_weight_green),
              routeFeatId,
              exportRowIdx,
              svgOvr,
              layoutPathEdgeKeySet?.has(keyPi) === true
            );
          });
        }
      });
    };
    if (!layoutVhDrawWeightedLayoutMode) {
      drawLayoutRoutesPass();
    }

    // taipei_f：欄高亮——垂直線 overlay（SectionData 路段紅色，其餘綠色；無 per-path 色則橘色）
    const colHl = dataStore.taipeiFColRouteHighlight;
    if (
      isTaipeiTestFLayerTab(layerTab) &&
      colHl &&
      colHl.layerId === layerTab &&
      Array.isArray(colHl.verticalPaths) &&
      colHl.verticalPaths.length > 0
    ) {
      const colHlG = zoomGroup.append('g').attr('class', 'taipei-f-col-vertical-highlight');
      colHl.verticalPaths.forEach((pathCoords, pi) => {
        if (!Array.isArray(pathCoords) || pathCoords.length < 2) return;
        const transformed = offsetPathToSchematicCellCenters(
          hvTransformPath(transformPathCoords(pathCoords))
        );
        const d = lineGenerator(transformed);
        if (!d) return;
        const stroke =
          Array.isArray(colHl.verticalPathColors) && colHl.verticalPathColors[pi]
            ? colHl.verticalPathColors[pi]
            : '#ff6600';
        colHlG
          .append('path')
          .attr('d', d)
          .attr('stroke', stroke)
          .attr('fill', 'none')
          .attr('stroke-width', 8)
          .attr('opacity', 0.65)
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'none');
      });
    }

    // taipei_f：列高亮——水平線 overlay（SectionData 紅／其他綠；無 per-path 色則青綠）
    const rowHl = dataStore.taipeiFRowRouteHighlight;
    if (
      isTaipeiTestFLayerTab(layerTab) &&
      rowHl &&
      rowHl.layerId === layerTab &&
      Array.isArray(rowHl.horizontalPaths) &&
      rowHl.horizontalPaths.length > 0
    ) {
      const rowHlG = zoomGroup.append('g').attr('class', 'taipei-f-row-horizontal-highlight');
      rowHl.horizontalPaths.forEach((pathCoords, pi) => {
        if (!Array.isArray(pathCoords) || pathCoords.length < 2) return;
        const transformed = offsetPathToSchematicCellCenters(
          hvTransformPath(transformPathCoords(pathCoords))
        );
        const dRow = lineGenerator(transformed);
        if (!dRow) return;
        const stroke =
          Array.isArray(rowHl.horizontalPathColors) && rowHl.horizontalPathColors[pi]
            ? rowHl.horizontalPathColors[pi]
            : '#009688';
        rowHlG
          .append('path')
          .attr('d', dRow)
          .attr('stroke', stroke)
          .attr('fill', 'none')
          .attr('stroke-width', 8)
          .attr('opacity', 0.65)
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'none');
      });
    }

    if (
      useSchematicCellCenterGrid &&
      dataStore.showWeightLabels &&
      dataStore.spaceNetworkGridShowRouteWeights &&
      !isTaipeiTestILayerTab(layerTab) &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax) &&
      xMax > xMin &&
      yMax > yMin
    ) {
      const marginMaxG = zoomGroup.append('g').attr('class', 'taipei-f-grid-margin-weight-max');
      const edgeLabelFill = '#1565C0';
      const edgeFs = '11px';
      // 每欄／每列皆顯示；無水平線之欄、無垂直線之列顯示 0
      for (let ix = xMin; ix < xMax; ix++) {
        const maxW = colWeightMax.get(ix);
        const label = Number.isFinite(maxW) ? String(maxW) : '0';
        marginMaxG
          .append('text')
          .attr('x', xScale(ix + 0.5))
          .attr('y', margin.top - 3)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'bottom')
          .attr('font-size', edgeFs)
          .attr('font-weight', 'bold')
          .attr('fill', edgeLabelFill)
          .text(label);
      }
      for (let iy = yMin; iy < yMax; iy++) {
        const maxW = rowWeightMax.get(iy);
        const label = Number.isFinite(maxW) ? String(maxW) : '0';
        marginMaxG
          .append('text')
          .attr('x', margin.left + width + 4)
          .attr('y', yScale(iy + 0.5))
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', edgeFs)
          .attr('font-weight', 'bold')
          .attr('fill', edgeLabelFill)
          .text(label);
      }
    }

    // layout_network_grid_from_vh_draw：JSON segment.stations 中段黑點；
    // — 沿折線 **像素弧長** 均分（與站數 n 對應），resize 時重算弧長；不再優先吸至轉折。
    // — 粗格視圖：對齊至背景插入之 (M+1) 細分網格整數格點（與 computeLayoutVhDrawFineGridSpec 同源）。
    // — 已套用細格座標視圖：對齊至細格整數網線。
    if (isLayoutNetworkGridFromVhDrawLayerId(layerTab)) {
      const drawLayer = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
      const exportRowsForSta = buildVhDrawStationRowsForLayoutMap(dataStore, drawLayer);
      const layoutEpXY = (ep) => {
        if (!ep || typeof ep !== 'object') return [NaN, NaN];
        const x = Number(ep.x_grid ?? ep.lon);
        const y = Number(ep.y_grid ?? ep.lat);
        return [x, y];
      };
      const layoutRouteNameOfFeature = (feat) => {
        const p = feat?.properties || {};
        return String(
          p.name ?? p.route_name ?? p.tags?.name ?? p.tags?.route_name ?? ''
        ).trim();
      };
      // 嚴格依 route_name 配對：端點相符且同路線名才採用；端點相符但屬別條路線（不同 route_name）
      // 絕不採用——即使兩線端點座標重疊，不相關的兩站仍各自獨立，不可互相借用車站。
      // 僅在「任一端缺 route_name 資訊」（例如 dataOSM 來源無路線名）時，才退回單純端點配對。
      const layoutFindRowForLineGrid = (gridPts, rows, routeName) => {
        const eps = 1e-3;
        if (!Array.isArray(gridPts) || gridPts.length < 2 || !Array.isArray(rows)) return null;
        const g0 = gridPts[0];
        const g1 = gridPts[gridPts.length - 1];
        const rn = String(routeName ?? '').trim();
        let coordOnlyFallback = null;
        for (const row of rows) {
          const seg = row?.segment;
          if (!seg) continue;
          const [ax, ay] = layoutEpXY(seg.start);
          const [bx, by] = layoutEpXY(seg.end);
          if (![ax, ay, bx, by].every(Number.isFinite)) continue;
          const fw =
            Math.abs(g0[0] - ax) < eps &&
            Math.abs(g0[1] - ay) < eps &&
            Math.abs(g1[0] - bx) < eps &&
            Math.abs(g1[1] - by) < eps;
          const bw =
            Math.abs(g0[0] - bx) < eps &&
            Math.abs(g0[1] - by) < eps &&
            Math.abs(g1[0] - ax) < eps &&
            Math.abs(g1[1] - ay) < eps;
          if (!(fw || bw)) continue;
          const rowRn = String(row.routeName ?? '').trim();
          if (rn && rowRn) {
            if (rowRn === rn) return row; // 同路線：採用
            continue; // 別條路線：即使端點重疊也不借用
          }
          if (!coordOnlyFallback) coordOnlyFallback = row; // 缺路線名才退回端點配對
        }
        return coordOnlyFallback;
      };
      const layoutMidStationCountFromJsonRow = (row) => {
        const mids = Array.isArray(row?.segment?.stations) ? row.segment.stations : [];
        if (mids.length === 0) return 0;
        let n = 0;
        for (const m of mids) {
          if (!m || typeof m !== 'object') continue;
          if (m.node_type === 'connect') continue;
          n++;
        }
        return n > 0 ? n : mids.length;
      };
      const distPxSeg = (pa, pb) => {
        const dx = pb[0] - pa[0];
        const dy = pb[1] - pa[1];
        return Math.hypot(dx, dy);
      };
      const gridXYAtPixelDistanceAlong = (gridPts, targetPx) => {
        if (!gridPts || gridPts.length < 2) return null;
        const pix = gridPts.map(([gx, gy]) => [xScale(gx), yScale(gy)]);
        const lens = [];
        let total = 0;
        for (let i = 0; i < pix.length - 1; i++) {
          const L = distPxSeg(pix[i], pix[i + 1]);
          lens.push(L);
          total += L;
        }
        if (!(total > 0) || !Number.isFinite(targetPx) || targetPx <= 0) {
          const g0 = gridPts[0];
          return [g0[0], g0[1]];
        }
        const d = Math.min(targetPx, total);
        let acc = 0;
        for (let i = 0; i < lens.length; i++) {
          const L = lens[i];
          if (acc + L >= d) {
            const t = L > 0 ? (d - acc) / L : 0;
            const g0 = gridPts[i];
            const g1 = gridPts[i + 1];
            return [g0[0] + t * (g1[0] - g0[0]), g0[1] + t * (g1[1] - g0[1])];
          }
          acc += L;
        }
        const last = gridPts[gridPts.length - 1];
        return [last[0], last[1]];
      };

      /** 複本＋加權比例條：依新 targetPx 重算中段黑點格座標（與 k 迴圈同源 clamp） */
      const recomputeLayoutMidGxyFromTargetPx = (gridPtsIn, targetPxIn) => {
        let gxyR;
        if (layoutFineGridSpec) {
          gxyR = integerLatticeBlackDotAtPixelArcLengthAlongLineString(
            gridPtsIn,
            targetPxIn,
            (gx, gy) => [xScale(gx), yScale(gy)]
          );
        } else if (
          layoutMidDotsFineSubgridSpec &&
          Number.isFinite(layoutMidDotsFineSubgridSpec.m) &&
          Math.floor(layoutMidDotsFineSubgridSpec.m) > 0
        ) {
          gxyR = integerLatticeBlackDotAtPixelArcLengthAlongFineSubgridLineString(
            gridPtsIn,
            targetPxIn,
            (gx, gy) => [xScale(gx), yScale(gy)],
            layoutMidDotsFineSubgridSpec
          );
        } else {
          gxyR = gridXYAtPixelDistanceAlong(gridPtsIn, targetPxIn);
        }
        if (!gxyR) return null;
        const midDotLatticeEpsR = 1e-3;
        if (layoutFineGridSpec) {
          const clampedInt = snapBlackDotGxGyToIntegerLatticeAlongPolyline(
            gridPtsIn,
            gxyR[0],
            gxyR[1],
            midDotLatticeEpsR
          );
          if (clampedInt) gxyR = clampedInt;
        } else if (
          layoutMidDotsFineSubgridSpec &&
          Number.isFinite(layoutMidDotsFineSubgridSpec.m) &&
          Math.floor(layoutMidDotsFineSubgridSpec.m) > 0
        ) {
          const clampedFine = snapBlackDotGxGyToFineSubgridAlongPolyline(
            gridPtsIn,
            gxyR[0],
            gxyR[1],
            layoutMidDotsFineSubgridSpec,
            midDotLatticeEpsR
          );
          if (clampedFine) gxyR = clampedFine;
        }
        return gxyR;
      };

      /** 與 `layoutMidStationCountFromJsonRow` 對齊：弧長分段黑點 k 對應第 k 筆中端站 JSON */
      const layoutMidStationsAlignedWithArc = (r) => {
        const mids = (Array.isArray(r?.segment?.stations) ? r.segment.stations : []).filter(
          (m) => m && typeof m === 'object'
        );
        if (!mids.length) return [];
        const nc = mids.filter((m) => m.node_type !== 'connect');
        return nc.length > 0 ? nc : mids;
      };

      /** layout_network_grid_from_vh_draw：中段黑點段落抬頭（路線名／起迄站） */
      const layoutVhDrawRouteSegmentHoverHeadHtml = (exportRow) => {
        const r = exportRow && typeof exportRow === 'object' ? exportRow : null;
        if (
          !isLayoutNetworkGridFromVhDrawLayerId(layerTab) ||
          !r
        )
          return '';
        const seg = r.segment;
        if (!seg || typeof seg !== 'object') return '';
        const routeNm = escapeLayoutTooltipHtml(
          String(r.routeName ?? r.route_name ?? r.name ?? '').trim()
        );
        const nodeDisplay = (node) => {
          if (!node || typeof node !== 'object') return '';
          const tags = node.tags && typeof node.tags === 'object' ? node.tags : {};
          const nameish = (node.station_name ?? tags.station_name ?? tags.name ?? '').trim();
          if (nameish) return nameish;
          return String(node.station_id ?? tags.station_id ?? '').trim();
        };
        const startNm = escapeLayoutTooltipHtml(nodeDisplay(seg.start));
        const endNm = escapeLayoutTooltipHtml(nodeDisplay(seg.end));
        return `<strong>route_name</strong> ${routeNm || '(—)'}<br>
<strong>start</strong> ${startNm || '(—)'}<br>
<strong>end</strong> ${endNm || '(—)'}<br>`;
      };

      /** 粗格＋插入細網：與 `applyLayoutVhDrawFineGridToFeatureCollection` 相同之整數軸 (Fx,Fy)。像素軸檢視不依插入細網對齊。 */
      const layoutMidDotsFineSubgridSpec = layoutVhDrawPixelAxisMode
        ? null
        : !layoutFineGridSpec &&
            coarseFcLayout?.type === 'FeatureCollection' &&
            Array.isArray(coarseFcLayout.features)
          ? computeLayoutVhDrawFineGridSpec(dataStore, coarseFcLayout)
          : null;

      const layoutMidDotTooltipGridLinesHtml = (gx, gy) => {
        const ngx = Number(gx);
        const ngy = Number(gy);
        if (!Number.isFinite(ngx) || !Number.isFinite(ngy)) {
          return `<strong>網格座標</strong> (—)<br>`;
        }
        if (layoutFineGridSpec) {
          const ix = Math.round(ngx);
          const iy = Math.round(ngy);
          return `<strong>細格座標</strong> (${ix}, ${iy})<br>`;
        }
        const sub =
          layoutMidDotsFineSubgridSpec &&
          Number.isFinite(layoutMidDotsFineSubgridSpec.m) &&
          Math.floor(layoutMidDotsFineSubgridSpec.m) > 0
            ? layoutMidDotsFineSubgridSpec
            : null;
        if (sub) {
          const s = Math.floor(sub.m) + 1;
          const fx = Math.round((ngx - sub.x0) * s);
          const fy = Math.round((ngy - sub.y0) * s);
          const gxLbl = formatAxisTickLabelMaxTwoDecimals(ngx, xAxisLabelsAsFloat);
          const gyLbl = formatAxisTickLabelMaxTwoDecimals(ngy, yAxisLabelsAsFloat);
          return `<strong>插入網格座標</strong> (${escapeLayoutTooltipHtml(String(fx))}, ${escapeLayoutTooltipHtml(String(fy))})<br><strong>粗格座標</strong> (${escapeLayoutTooltipHtml(gxLbl)}, ${escapeLayoutTooltipHtml(gyLbl)})<br>`;
        }
        const gxLbl = formatAxisTickLabelMaxTwoDecimals(ngx, xAxisLabelsAsFloat);
        const gyLbl = formatAxisTickLabelMaxTwoDecimals(ngy, yAxisLabelsAsFloat);
        return `<strong>網格座標</strong> (${escapeLayoutTooltipHtml(gxLbl)}, ${escapeLayoutTooltipHtml(gyLbl)})<br>`;
      };

      /** 中段黑點：與本站點圓 hover 同源（版面 JSON：`stationEndpointTooltipHtmlFromProps`） */
      const showLayoutVHDrawMidStationTooltip = (
        event,
        stationPropBag,
        gx,
        gy,
        segmentExportRow
      ) => {
        const gridCoordLine = layoutMidDotTooltipGridLinesHtml(gx, gy);
        const routeSegmentHead = layoutVhDrawRouteSegmentHoverHeadHtml(segmentExportRow);
        if (uniformGridRouteFamilyTab) {
          const jlStation = dataStore.findLayerById(layerTab);
          const jrStation =
            layoutUniformGridTooltipJr ??
            mapDrawnExportRowsFromJsonDrawRoot(jlStation?.jsonData, jlStation?.dataJson);
          const props = stationPropBag && typeof stationPropBag === 'object' ? stationPropBag : {};
          const tags = props.tags || {};
          const sidTip = String(props.station_id ?? tags.station_id ?? '').trim();
          const hasRnl =
            (Array.isArray(props.route_name_list) && props.route_name_list.length > 0) ||
            (Array.isArray(tags.route_name_list) && tags.route_name_list.length > 0);
          let propBagForStation = props;
          if (Array.isArray(jrStation) && jrStation.length > 0 && sidTip && !hasRnl) {
            const nameSet = new Set();
            const idMatches = (n) =>
              String(n?.station_id ?? n?.tags?.station_id ?? '').trim() === sidTip;
            for (const rowJr of jrStation) {
              const sm = rowJr?.segment;
              if (!sm) continue;
              const hitsMid = Array.isArray(sm.stations) && sm.stations.some(idMatches);
              if (idMatches(sm.start) || idMatches(sm.end) || hitsMid) {
                const nm = String(rowJr.routeName ?? '').trim();
                if (nm) nameSet.add(nm);
              }
            }
            if (nameSet.size > 0) {
              propBagForStation = { ...props, route_name_list: [...nameSet] };
            }
          }
          const lonTip = Number.isFinite(segmentNodeLon(props)) ? segmentNodeLon(props) : gx;
          const latTip = Number.isFinite(segmentNodeLat(props)) ? segmentNodeLat(props) : gy;
          const tagMerged = getGeoJsonFeatureTagProps({ properties: props });
          const typeForTooltip = normalizeRouteSegmentEndpointType(
            props.type ?? tags.type ?? tagMerged.type ?? 'normal'
          );
          tooltip
            .html(
              routeSegmentHead +
                gridCoordLine +
                stationEndpointTooltipHtmlFromProps(
                  propBagForStation,
                  typeForTooltip,
                  lonTip,
                  latTip
                )
            )
            .style('opacity', 1)
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 10}px`);
          return;
        }
        const props = stationPropBag && typeof stationPropBag === 'object' ? stationPropBag : {};
        const tags = props.tags || {};
        const tagMergedFb = getGeoJsonFeatureTagProps({ properties: props });
        tooltip
          .html(
            routeSegmentHead +
              gridCoordLine +
              stationEndpointTooltipHtmlFromProps(
                props,
                normalizeRouteSegmentEndpointType(
                  props.type ?? tags.type ?? tagMergedFb.type ?? 'normal'
                ),
                gx,
                gy
              )
          )
          .style('opacity', 1)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      };

      const nearestSegIndexOnGridPolyline = (gridPts, gx, gy) => {
        if (!Array.isArray(gridPts) || gridPts.length < 2) return -1;
        const px = Number(gx);
        const py = Number(gy);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return -1;
        let bestIdx = -1;
        let bestDistSq = Infinity;
        for (let i = 0; i < gridPts.length - 1; i++) {
          const a = gridPts[i];
          const b = gridPts[i + 1];
          if (!Array.isArray(a) || !Array.isArray(b)) continue;
          const ax = Number(a[0]);
          const ay = Number(a[1]);
          const bx = Number(b[0]);
          const by = Number(b[1]);
          if (![ax, ay, bx, by].every(Number.isFinite)) continue;
          const dx = bx - ax;
          const dy = by - ay;
          const lenSq = dx * dx + dy * dy;
          if (!(lenSq > 0)) continue;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
          const hx = ax + t * dx;
          const hy = ay + t * dy;
          const dSq = (px - hx) * (px - hx) + (py - hy) * (py - hy);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }
        return bestIdx;
      };

      const layoutTrafficStationName = (node) => {
        if (!node || typeof node !== 'object') return '';
        const tags = node.tags && typeof node.tags === 'object' ? node.tags : {};
        return String(node.station_name ?? tags.station_name ?? tags.name ?? '').trim();
      };
      const layoutTrafficKey = (a, b) => [String(a).trim(), String(b).trim()].sort().join('\x00');
      const layoutTrafficEdges = [];
      const layoutTrafficEdgeKeys = new Set();
      /** 複本＋加權：隱藏中段後依折疊邊之 max(weight) 覆寫標注（無向鍵與 layoutTrafficKey 一致） */
      let layoutTrafficEdgeCollapseWeights = null;
      const addLayoutTrafficEdges = (orderedPoints, routeKey) => {
        if (!Array.isArray(orderedPoints) || orderedPoints.length < 2) return;
        for (let i = 0; i < orderedPoints.length - 1; i++) {
          const a = orderedPoints[i];
          const b = orderedPoints[i + 1];
          if (!a?.name || !b?.name || !Array.isArray(a.gxy) || !Array.isArray(b.gxy)) continue;
          const key = layoutTrafficKey(a.name, b.name);
          const px0 = xScale(a.gxy[0]);
          const py0 = yScale(a.gxy[1]);
          const px1 = xScale(b.gxy[0]);
          const py1 = yScale(b.gxy[1]);
          if (![px0, py0, px1, py1].every(Number.isFinite)) continue;
          layoutTrafficEdgeKeys.add(key);
          layoutTrafficEdges.push({
            key,
            routeKey: routeKey ?? null,
            gx0: Number(a.gxy[0]),
            gy0: Number(a.gxy[1]),
            gx1: Number(b.gxy[0]),
            gy1: Number(b.gxy[1]),
            a: a.name,
            b: b.name,
            x: (px0 + px1) / 2,
            y: (py0 + py1) / 2,
            px0,
            py0,
            px1,
            py1,
          });
        }
      };

      const layoutStaG = zoomGroup.append('g').attr('class', 'layout-vh-draw-line-stations-pt');
      const layoutVhDrawMidBlackDotRadius = 2.5;
      /** 黑點（中段站）車站名稱開關：開啟時於黑點上方標註小字站名。 */
      const layoutShowMidBlackDotNames =
        activeTabLayer?.layoutVhDrawShowMidBlackDotStationNames === true;
      const paintMidBlackDotName = (cx, cy, name) => {
        if (!layoutShowMidBlackDotNames) return;
        const nm = name != null ? String(name).trim() : '';
        if (!nm) return;
        layoutStaG
          .append('text')
          .attr('class', 'layout-vh-draw-mid-black-dot-name')
          .attr('x', cx)
          .attr('y', cy - layoutVhDrawMidBlackDotRadius - 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'bottom')
          .attr('font-size', '7px')
          .attr('font-weight', '600')
          .attr('fill', '#1a1a1a')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 0.3)
          .attr('paint-order', 'stroke')
          .style('pointer-events', 'none')
          .text(nm);
      };
      const layoutDotsForBandMaxRealtime = [];
      /** 線段（leg）weight：每條路線折線各 leg 之 {格座標包圍, 方向, 所屬交通邊 traffic_weight}，供軸帶「線 weight max」綠字。 */
      const layoutWeightedLegsRealtime = [];
      const layoutPxBandMaxColVals = [];
      const layoutPxBandMaxRowVals = [];
      const pendingWeightedMidDots = [];
      const layoutVhDrawCopyWeightedLayerTab = isLayoutNetworkGridFromVhDrawLayerId(layerTab)
        ? layerTab
        : null;
      const layoutVhDrawCopyRouteLabelFn = layoutVhDrawCopyRouteLabelFromExportRow;
      const layoutVhDrawCopyRowMatchKeyFn = layoutVhDrawCopyBlackDotRowMatchKey;
      const layoutVhDrawCopyFindMidNeighborsFn = findLayoutSegmentMidNeighbors;
      const layoutCopyGeomKindByKey = layoutVhDrawCopyWeightedLayerTab ? new Map() : null;
      const copyRouteMidPlans =
        layoutVhDrawCopyWeightedLayerTab && layoutVhDrawWeightedLayoutMode ? new Map() : null;
      const copyLayoutTrafficChains = copyRouteMidPlans ? [] : null;
      const layoutDotsForBandMaxAfterCopyFinalize = [];
      const layoutLineFeatCount = routeFeatures.filter(
        (f) => f?.geometry?.type === 'LineString'
      ).length;
      let layoutLineFeatIdx = 0;
      let layoutRouteFi = 0;
      let layoutRfGlobalIdx = 0;
      for (const rf of routeFeatures) {
        const rfGlobalIdx = layoutRfGlobalIdx++;
        if (!rf?.geometry || rf.geometry.type !== 'LineString') continue;
        const coords = rf.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const gridPtsOrig = coords.map((c) => [Number(c[0]), Number(c[1])]);
        // layout-grid-viewer：黑點座標基於簡化路徑（45°-H/V-45°）而非原始格座標
        const gridPts = layoutPixelVhDrawRouteGridByKey?.get(`${rfGlobalIdx}#0`) ?? gridPtsOrig;
        let row = layoutFindRowForLineGrid(
          gridPtsOrig,
          exportRowsForSta,
          layoutRouteNameOfFeature(rf)
        );
        if (
          !row &&
          exportRowsForSta.length > 0 &&
          layoutLineFeatCount === exportRowsForSta.length
        ) {
          // 位置對齊退路：僅在「同路線名或缺路線名」時採用，避免借用別條路線的車站。
          const posRow = exportRowsForSta[layoutLineFeatIdx] ?? null;
          const featRn = layoutRouteNameOfFeature(rf);
          const posRn = String(posRow?.routeName ?? '').trim();
          row = !posRow || (featRn && posRn && posRn !== featRn) ? null : posRow;
        }
        layoutLineFeatIdx += 1;
        const trafficOrderedPoints = [];
        const trafficSeg = row?.segment;
        const trafficStartName = layoutTrafficStationName(trafficSeg?.start);
        const trafficEndName = layoutTrafficStationName(trafficSeg?.end);
        if (trafficStartName)
          trafficOrderedPoints.push({ name: trafficStartName, gxy: gridPts[0] });
        const nSta = row ? layoutMidStationCountFromJsonRow(row) : 0;
        const midsArc = layoutMidStationsAlignedWithArc(row);
        let copyTrafficChain = null;
        if (copyRouteMidPlans) {
          copyTrafficChain = { routeKey: `${rfGlobalIdx}#0`, rfGi: rfGlobalIdx, nodes: [] };
          if (trafficStartName) {
            copyTrafficChain.nodes.push({
              name: trafficStartName,
              gxy: [Number(gridPts[0][0]), Number(gridPts[0][1])],
              matchKey: null,
            });
          }
        }
        const pix = gridPts.map(([gx, gy]) => [xScale(gx), yScale(gy)]);
        let totalPx = 0;
        for (let i = 0; i < pix.length - 1; i++) totalPx += distPxSeg(pix[i], pix[i + 1]);
        let totalGrid = 0;
        for (let i = 0; i < gridPts.length - 1; i++) {
          totalGrid += Math.hypot(
            gridPts[i + 1][0] - gridPts[i][0],
            gridPts[i + 1][1] - gridPts[i][1]
          );
        }
        const canDrawMidDots = layoutFineGridSpec ? totalGrid > 0 && totalPx > 0 : totalPx > 0;

        // 線段（leg）weight：折線各 leg 可能跨越多個「站→下一站」交通邊（簡化路徑常為少數長 leg），
        // 故依弧長邊界（segLenPx 之倍數）把每個 leg 切成子段，各子段取其所屬交通邊之 traffic_weight；
        // 方向以 plot px 分類（H／V／D），子段 gx／gy 範圍依弧長比例內插。
        if (totalPx > 0 && pix.length >= 2) {
          const segLenPx = totalPx / (nSta + 1);
          const orderedForWeight = [trafficSeg?.start, ...midsArc];
          const edgeWeightAt = (ei) =>
            getNodeTrafficWeightFromLayoutSegment(
              ei >= 0 && ei < orderedForWeight.length ? orderedForWeight[ei] : null
            );
          const segEpsPxLeg = 1.0;
          let arcAccLeg = 0;
          for (let j = 0; j < pix.length - 1; j++) {
            const ax = Number(pix[j][0]);
            const ay = Number(pix[j][1]);
            const bx = Number(pix[j + 1][0]);
            const by = Number(pix[j + 1][1]);
            const legLen = Math.hypot(bx - ax, by - ay);
            const legStart = arcAccLeg;
            const legEnd = arcAccLeg + legLen;
            arcAccLeg = legEnd;
            if (!(legLen > 0)) continue;
            const adx = Math.abs(bx - ax);
            const ady = Math.abs(by - ay);
            let legDir = 'D';
            if (ady < segEpsPxLeg && adx >= segEpsPxLeg) legDir = 'H';
            else if (adx < segEpsPxLeg && ady >= segEpsPxLeg) legDir = 'V';
            const g0 = gridPts[j];
            const g1 = gridPts[j + 1];
            const gx0 = Number(g0[0]);
            const gy0 = Number(g0[1]);
            const gx1 = Number(g1[0]);
            const gy1 = Number(g1[1]);
            const eiStart = segLenPx > 0 ? Math.floor((legStart + 1e-6) / segLenPx) : 0;
            const eiEnd = segLenPx > 0 ? Math.floor((legEnd - 1e-6) / segLenPx) : 0;
            for (let ei = Math.max(0, eiStart); ei <= Math.min(nSta, eiEnd); ei++) {
              const w = edgeWeightAt(ei);
              if (w == null) continue;
              const lo = Math.max(legStart, ei * segLenPx);
              const hi = Math.min(legEnd, (ei + 1) * segLenPx);
              if (!(hi > lo)) continue;
              const t0 = (lo - legStart) / legLen;
              const t1 = (hi - legStart) / legLen;
              const sx0 = gx0 + (gx1 - gx0) * t0;
              const sy0 = gy0 + (gy1 - gy0) * t0;
              const sx1 = gx0 + (gx1 - gx0) * t1;
              const sy1 = gy0 + (gy1 - gy0) * t1;
              layoutWeightedLegsRealtime.push({
                fi: layoutRouteFi,
                gx0: Math.min(sx0, sx1),
                gx1: Math.max(sx0, sx1),
                gy0: Math.min(sy0, sy1),
                gy1: Math.max(sy0, sy1),
                dir: legDir,
                weight: w,
              });
            }
          }
        }

        if (canDrawMidDots)
          for (let k = 1; k <= nSta; k++) {
            let gxy;
            const targetPx = (k * totalPx) / (nSta + 1);
            if (layoutFineGridSpec) {
              gxy = integerLatticeBlackDotAtPixelArcLengthAlongLineString(
                gridPts,
                targetPx,
                (gx, gy) => [xScale(gx), yScale(gy)]
              );
            } else if (
              layoutMidDotsFineSubgridSpec &&
              Number.isFinite(layoutMidDotsFineSubgridSpec.m) &&
              Math.floor(layoutMidDotsFineSubgridSpec.m) > 0
            ) {
              gxy = integerLatticeBlackDotAtPixelArcLengthAlongFineSubgridLineString(
                gridPts,
                targetPx,
                (gx, gy) => [xScale(gx), yScale(gy)],
                layoutMidDotsFineSubgridSpec
              );
            } else {
              gxy = gridXYAtPixelDistanceAlong(gridPts, targetPx);
            }
            if (!gxy) continue;

            /** 強制落在插入細分／細格視圖之合法網格座標（resize 弧度重算後仍對齊） */
            const midDotLatticeEps = 1e-3;
            if (layoutFineGridSpec) {
              const clampedInt = snapBlackDotGxGyToIntegerLatticeAlongPolyline(
                gridPts,
                gxy[0],
                gxy[1],
                midDotLatticeEps
              );
              if (clampedInt) gxy = clampedInt;
            } else if (
              layoutMidDotsFineSubgridSpec &&
              Number.isFinite(layoutMidDotsFineSubgridSpec.m) &&
              Math.floor(layoutMidDotsFineSubgridSpec.m) > 0
            ) {
              const clampedFine = snapBlackDotGxGyToFineSubgridAlongPolyline(
                gridPts,
                gxy[0],
                gxy[1],
                layoutMidDotsFineSubgridSpec,
                midDotLatticeEps
              );
              if (clampedFine) gxy = clampedFine;
            }
            const sta = midsArc[k - 1] ?? {};
            let copyMidMatchKey = null;
            let nbMid = null;
            if (row && trafficSeg && sta && typeof sta === 'object') {
              nbMid = layoutVhDrawCopyFindMidNeighborsFn(trafficSeg, sta);
              if (nbMid && copyRouteMidPlans) {
                let exportRowIndexForLabel = layoutLineFeatIdx > 0 ? layoutLineFeatIdx - 1 : 0;
                if (Array.isArray(exportRowsForSta)) {
                  const ixLbl = exportRowsForSta.indexOf(row);
                  if (ixLbl >= 0) exportRowIndexForLabel = ixLbl;
                }
                const routeLabelEarly = layoutVhDrawCopyRouteLabelFn(row, exportRowIndexForLabel);
                copyMidMatchKey = layoutVhDrawCopyRowMatchKeyFn({
                  路線: routeLabelEarly,
                  黑點站名: layoutTrafficStationName(sta) || '（無名）',
                  前站另一端站名: layoutTrafficStationName(nbMid.prev) || '',
                  後站另一端站名: layoutTrafficStationName(nbMid.next) || '',
                });
              }
            }
            const dotSegIndex = nearestSegIndexOnGridPolyline(gridPts, gxy[0], gxy[1]);
            if (
              dotSegIndex >= 0 &&
              Number.isFinite(Number(gxy[0])) &&
              Number.isFinite(Number(gxy[1]))
            ) {
              /**
               * 段方向分類：H（水平）、V（垂直）、D（45°斜線）；用於 layout-grid-viewer 刻度間黑點 max 計算時的軸向過濾。
               * ⚠ 必須在「畫面像素空間」分類：routing 演算法在 px 空間建 45° 路徑，
               *   之後以 xScale.invert 還原回 grid(pt) 座標；若 plot 非正方形，pt 空間的 adx≠ady，
               *   會把 45° 誤判成 V 而被排除。
               */
              let segDir = 'D';
              if (dotSegIndex < gridPts.length - 1) {
                const sA = gridPts[dotSegIndex];
                const sB = gridPts[dotSegIndex + 1];
                const pxA = xScale(Number(sA[0]));
                const pyA = yScale(Number(sA[1]));
                const pxB = xScale(Number(sB[0]));
                const pyB = yScale(Number(sB[1]));
                const adxPx = Math.abs(pxB - pxA);
                const adyPx = Math.abs(pyB - pyA);
                const segEpsPx = 1.0;
                if (adyPx < segEpsPx && adxPx >= segEpsPx) segDir = 'H';
                else if (adxPx < segEpsPx && adyPx >= segEpsPx) segDir = 'V';
              }
              const dotForBand = {
                gx: Number(gxy[0]),
                gy: Number(gxy[1]),
                fi: layoutRouteFi,
                si: dotSegIndex,
                segDir,
              };
              if (copyMidMatchKey) dotForBand.copyMidMatchKey = copyMidMatchKey;
              layoutDotsForBandMaxRealtime.push(dotForBand);
            }
            if (
              layoutCopyGeomKindByKey &&
              dotSegIndex >= 0 &&
              row &&
              trafficSeg &&
              nbMid &&
              copyMidMatchKey
            ) {
              const key = copyMidMatchKey;
              const kind = classifyLayoutVhDrawBlackDotGeomKind(
                gridPts,
                gxy,
                dotSegIndex,
                (gx, gy) => [xScale(Number(gx)), yScale(Number(gy))]
              );
              layoutCopyGeomKindByKey.set(key, kind);
              if (copyRouteMidPlans) {
                const routeKeyPlan = `${rfGlobalIdx}#0`;
                let pl = copyRouteMidPlans.get(routeKeyPlan);
                if (!pl) {
                  pl = {
                    rfGlobalIdx,
                    totalPx,
                    gridPts,
                    row,
                    trafficSeg,
                    items: [],
                    bandFi: layoutRouteFi,
                  };
                  copyRouteMidPlans.set(routeKeyPlan, pl);
                } else if (!Number.isFinite(pl.bandFi)) {
                  pl.bandFi = layoutRouteFi;
                }
                pl.items.push({ k, sta, matchKey: key, kind });
              }
            }
            const trafficMidName = layoutTrafficStationName(sta);
            if (trafficMidName) trafficOrderedPoints.push({ name: trafficMidName, gxy });
            if (copyTrafficChain && trafficMidName) {
              copyTrafficChain.nodes.push({
                name: trafficMidName,
                gxy: [Number(gxy[0]), Number(gxy[1])],
                matchKey: copyMidMatchKey,
              });
            }
            const paintMidDot = (cx, cy) => {
              layoutStaG
                .append('circle')
                .attr('class', 'layout-vh-draw-mid-black-dot space-network-rb-station-dot')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', layoutVhDrawMidBlackDotRadius)
                .attr('fill', '#000000')
                .attr('stroke', '#000000')
                .attr('stroke-width', 1)
                .style('cursor', 'pointer')
                .style('pointer-events', 'all')
                .on('mouseover', function (event) {
                  d3.select(this).attr('r', 5).attr('stroke-width', 2);
                  showLayoutVHDrawMidStationTooltip(event, sta, gxy[0], gxy[1], row);
                })
                .on('mousemove', function (event) {
                  tooltip
                    .style('left', `${event.pageX + 10}px`)
                    .style('top', `${event.pageY - 10}px`);
                })
                .on('mouseout', function () {
                  d3.select(this).attr('r', layoutVhDrawMidBlackDotRadius).attr('stroke-width', 1);
                  tooltip.style('opacity', 0);
                });
              paintMidBlackDotName(cx, cy, trafficMidName);
            };
            if (layoutVhDrawWeightedLayoutMode) {
              if (copyRouteMidPlans) {
                /* 延後至鄰線間距 wPtMin/hPtMin 算出後篩選並重分配弧長 */
              } else {
                pendingWeightedMidDots.push({
                  paint: paintMidDot,
                  routeKey: `${rfGlobalIdx}#0`,
                  frac: nSta > 0 ? k / (nSta + 1) : 0.5,
                  sx: xScale(gxy[0]),
                  sy: yScale(gxy[1]),
                });
              }
            } else if (layoutVhDrawFisheyeActive) {
              // fisheye：黑點沿「已重佈線」的八方向路線弧長對位（與 weighted 同邏輯），確保落在線上並跟著變形。
              const fSvg = layoutWeightedRouteSvgByKey?.get(`${rfGlobalIdx}#0`);
              const fFrac = nSta > 0 ? k / (nSta + 1) : 0.5;
              const fPt =
                Array.isArray(fSvg) && fSvg.length >= 2
                  ? layoutFisheyePointAtArcFrac(fSvg, fFrac)
                  : null;
              if (fPt) paintMidDot(fPt[0], fPt[1]);
              else paintMidDot(plotRemapSvgX(xScale(gxy[0])), plotRemapSvgY(yScale(gxy[1])));
            } else {
              paintMidDot(xScale(gxy[0]), yScale(gxy[1]));
            }
          }
        if (trafficEndName) {
          trafficOrderedPoints.push({ name: trafficEndName, gxy: gridPts[gridPts.length - 1] });
        }
        if (copyTrafficChain) {
          if (trafficEndName) {
            const gl = gridPts[gridPts.length - 1];
            copyTrafficChain.nodes.push({
              name: trafficEndName,
              gxy: [Number(gl[0]), Number(gl[1])],
              matchKey: null,
            });
          }
          copyTrafficChain.bandFi = layoutRouteFi;
          copyLayoutTrafficChains.push(copyTrafficChain);
        }
        if (!copyRouteMidPlans) {
          addLayoutTrafficEdges(trafficOrderedPoints, `${rfGlobalIdx}#0`);
        }
        layoutRouteFi += 1;
      }

      if (layoutCopyGeomKindByKey && layoutVhDrawCopyWeightedLayerTab) {
        const copyLyr = dataStore.findLayerById(layoutVhDrawCopyWeightedLayerTab);
        const tbl = copyLyr?.dataTableData;
        if (Array.isArray(tbl)) {
          for (const rec of tbl) {
            const mk = layoutVhDrawCopyRowMatchKeyFn({
              路線: rec?.路線,
              黑點站名: rec?.黑點站名,
              前站另一端站名: rec?.前站另一端站名,
              後站另一端站名: rec?.後站另一端站名,
            });
            rec.點位類型 = layoutCopyGeomKindByKey.get(mk) ?? '—';
          }
        }
      }

      if (layoutBlackMaxXTicks.length >= 2) {
        if (layoutVhDrawPixelAxisMode) {
          for (let xi = 0; xi < layoutBlackMaxXTicks.length - 1; xi++) {
            const t0 = layoutBlackMaxXTicks[xi];
            const t1 = layoutBlackMaxXTicks[xi + 1];
            const xv = maxLayoutVhDrawBlackDotsOnLegInOpenXSlabPlotPx(
              layoutDotsForBandMaxRealtime,
              xScale,
              margin.left,
              t0,
              t1
            );
            layoutPxBandMaxColVals.push(xv);
            if (!layoutVhDrawWeightedLayoutMode && !layoutRouteWeightAnimActive) {
              const cx = margin.left + (Number(t0) + Number(t1)) / 2;
              axisGroup
                .append('text')
                .attr('class', 'layout-vh-draw-axis-interval-black-max-x')
                .attr('x', cx)
                .attr('y', margin.top + height + 28)
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px')
                .attr('font-weight', '600')
                .attr('fill', '#1565C0')
                .text(String(xv));
              const wv = maxLayoutVhDrawLineWeightInOpenXSlabPlotPx(
                layoutWeightedLegsRealtime,
                xScale,
                margin.left,
                t0,
                t1
              );
              axisGroup
                .append('text')
                .attr('class', 'layout-vh-draw-axis-interval-line-weight-max-x')
                .attr('x', cx)
                .attr('y', margin.top + height + 40)
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px')
                .attr('font-weight', '600')
                .attr('fill', '#2E7D32')
                .text(String(wv));
            }
          }
        } else {
          for (let xi = 0; xi < layoutBlackMaxXTicks.length - 1; xi++) {
            const t0 = layoutBlackMaxXTicks[xi];
            const t1 = layoutBlackMaxXTicks[xi + 1];
            const xv = maxLayoutVhDrawBlackDotsOnLegInOpenXSlab(
              layoutDotsForBandMaxRealtime,
              t0,
              t1
            );
            const fx0 = layoutFineGridMapX ? layoutFineGridMapX(t0) : t0;
            const fx1 = layoutFineGridMapX ? layoutFineGridMapX(t1) : t1;
            const cx = (xScale(fx0) + xScale(fx1)) / 2;
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-black-max-x')
              .attr('x', cx)
              .attr('y', margin.top + height + 28)
              .attr('text-anchor', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#1565C0')
              .text(String(xv));
            const wv = maxLayoutVhDrawLineWeightInOpenXSlab(layoutWeightedLegsRealtime, t0, t1);
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-line-weight-max-x')
              .attr('x', cx)
              .attr('y', margin.top + height + 40)
              .attr('text-anchor', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#2E7D32')
              .text(String(wv));
          }
        }
      }

      if (layoutBlackMaxYTicks.length >= 2) {
        const yBandLabelX = margin.left - 46;
        if (layoutVhDrawPixelAxisMode) {
          for (let yi = 0; yi < layoutBlackMaxYTicks.length - 1; yi++) {
            const t0 = layoutBlackMaxYTicks[yi];
            const t1 = layoutBlackMaxYTicks[yi + 1];
            const yv = maxLayoutVhDrawBlackDotsOnLegInOpenYSlabPlotPx(
              layoutDotsForBandMaxRealtime,
              yScale,
              margin.top,
              t0,
              t1
            );
            layoutPxBandMaxRowVals.push(yv);
            if (!layoutVhDrawWeightedLayoutMode && !layoutRouteWeightAnimActive) {
              const cy = margin.top + (Number(t0) + Number(t1)) / 2;
              axisGroup
                .append('text')
                .attr('class', 'layout-vh-draw-axis-interval-black-max-y')
                .attr('x', yBandLabelX)
                .attr('y', cy)
                .attr('text-anchor', 'end')
                .attr('dominant-baseline', 'middle')
                .attr('font-size', '9px')
                .attr('font-weight', '600')
                .attr('fill', '#1565C0')
                .text(String(yv));
              const wv = maxLayoutVhDrawLineWeightInOpenYSlabPlotPx(
                layoutWeightedLegsRealtime,
                yScale,
                margin.top,
                t0,
                t1
              );
              axisGroup
                .append('text')
                .attr('class', 'layout-vh-draw-axis-interval-line-weight-max-y')
                .attr('x', yBandLabelX - 18)
                .attr('y', cy)
                .attr('text-anchor', 'end')
                .attr('dominant-baseline', 'middle')
                .attr('font-size', '9px')
                .attr('font-weight', '600')
                .attr('fill', '#2E7D32')
                .text(String(wv));
            }
          }
        } else {
          for (let yi = 0; yi < layoutBlackMaxYTicks.length - 1; yi++) {
            const t0 = layoutBlackMaxYTicks[yi];
            const t1 = layoutBlackMaxYTicks[yi + 1];
            const yv = maxLayoutVhDrawBlackDotsOnLegInOpenYSlab(
              layoutDotsForBandMaxRealtime,
              t0,
              t1
            );
            const fy0 = layoutFineGridMapY ? layoutFineGridMapY(t0) : t0;
            const fy1 = layoutFineGridMapY ? layoutFineGridMapY(t1) : t1;
            const cy = (yScale(fy0) + yScale(fy1)) / 2;
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-black-max-y')
              .attr('x', yBandLabelX)
              .attr('y', cy)
              .attr('text-anchor', 'end')
              .attr('dominant-baseline', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#1565C0')
              .text(String(yv));
            const wv = maxLayoutVhDrawLineWeightInOpenYSlab(layoutWeightedLegsRealtime, t0, t1);
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-line-weight-max-y')
              .attr('x', yBandLabelX - 18)
              .attr('y', cy)
              .attr('text-anchor', 'end')
              .attr('dominant-baseline', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#2E7D32')
              .text(String(wv));
          }
        }
      }

      if (layoutVhDrawWeightedLayoutMode) {
        const copyWeightedMidStateByMatchKey = new Map();
        layoutTrafficEdgeCollapseWeights = null;
        const nColSlabs = layoutBlackMaxXTicks.length - 1;
        const nRowSlabs = layoutBlackMaxYTicks.length - 1;

        // weight 顯示比例：以各欄／列區間「線 weight max」作為欄寬／列高比例來源（取代黑點數）。
        // 內部虛線子格與軸帶藍字仍依黑點數；綠字仍為 weight max。
        const layoutWeightBandColVals = [];
        const layoutWeightBandRowVals = [];
        if (layoutVhDrawWeightedByWeight) {
          for (let xi = 0; xi < nColSlabs; xi++) {
            layoutWeightBandColVals.push(
              maxLayoutVhDrawLineWeightInOpenXSlabPlotPx(
                layoutWeightedLegsRealtime,
                xScale,
                margin.left,
                layoutBlackMaxXTicks[xi],
                layoutBlackMaxXTicks[xi + 1]
              )
            );
          }
          for (let yi = 0; yi < nRowSlabs; yi++) {
            layoutWeightBandRowVals.push(
              maxLayoutVhDrawLineWeightInOpenYSlabPlotPx(
                layoutWeightedLegsRealtime,
                yScale,
                margin.top,
                layoutBlackMaxYTicks[yi],
                layoutBlackMaxYTicks[yi + 1]
              )
            );
          }
        }
        /** 比例來源：weight 模式用線 weight max，否則用黑點 max。 */
        const ratioSrcColVals = () =>
          layoutVhDrawWeightedByWeight ? layoutWeightBandColVals : layoutPxBandMaxColVals;
        const ratioSrcRowVals = () =>
          layoutVhDrawWeightedByWeight ? layoutWeightBandRowVals : layoutPxBandMaxRowVals;
        const canApplyWeightedPlotRemap =
          nColSlabs > 0 &&
          nRowSlabs > 0 &&
          !layoutFineGridSpec &&
          layoutPxBandMaxColVals.length === nColSlabs &&
          layoutPxBandMaxRowVals.length === nRowSlabs;
        /** 以指定黑點集合重算各粗格區間內虚線子格數（layoutPxBandMaxColVals / RowVals）。 */
        const recomputeLayoutPxBandMaxFromDots = (dots) => {
          layoutPxBandMaxColVals.length = 0;
          layoutPxBandMaxRowVals.length = 0;
          if (layoutBlackMaxXTicks.length >= 2) {
            if (layoutVhDrawPixelAxisMode) {
              for (let xi = 0; xi < layoutBlackMaxXTicks.length - 1; xi++) {
                const t0 = layoutBlackMaxXTicks[xi];
                const t1 = layoutBlackMaxXTicks[xi + 1];
                layoutPxBandMaxColVals.push(
                  maxLayoutVhDrawBlackDotsOnLegInOpenXSlabPlotPx(dots, xScale, margin.left, t0, t1)
                );
              }
            } else {
              for (let xi = 0; xi < layoutBlackMaxXTicks.length - 1; xi++) {
                const t0 = layoutBlackMaxXTicks[xi];
                const t1 = layoutBlackMaxXTicks[xi + 1];
                layoutPxBandMaxColVals.push(maxLayoutVhDrawBlackDotsOnLegInOpenXSlab(dots, t0, t1));
              }
            }
          }
          if (layoutBlackMaxYTicks.length >= 2) {
            if (layoutVhDrawPixelAxisMode) {
              for (let yi = 0; yi < layoutBlackMaxYTicks.length - 1; yi++) {
                const t0 = layoutBlackMaxYTicks[yi];
                const t1 = layoutBlackMaxYTicks[yi + 1];
                layoutPxBandMaxRowVals.push(
                  maxLayoutVhDrawBlackDotsOnLegInOpenYSlabPlotPx(dots, yScale, margin.top, t0, t1)
                );
              }
            } else {
              for (let yi = 0; yi < layoutBlackMaxYTicks.length - 1; yi++) {
                const t0 = layoutBlackMaxYTicks[yi];
                const t1 = layoutBlackMaxYTicks[yi + 1];
                layoutPxBandMaxRowVals.push(maxLayoutVhDrawBlackDotsOnLegInOpenYSlab(dots, t0, t1));
              }
            }
          }
        };
        const slabRemapPlotLocal = (ticks, rats, span, uIn) => {
          const n = ticks.length;
          if (n < 2 || rats.length !== n - 1) return Number(uIn);
          const u0 = Number(ticks[0]);
          const u1 = Number(ticks[n - 1]);
          const x = Math.min(Math.max(Number(uIn), u0), u1);
          const newW = rats.map((r) => r * span);
          const cumStarts = [0];
          for (let ii = 0; ii < newW.length; ii++) {
            cumStarts.push(cumStarts[ii] + newW[ii]);
          }
          let i = 0;
          for (; i < n - 2; i++) {
            if (x < Number(ticks[i + 1])) break;
          }
          const a = Number(ticks[i]);
          const b = Number(ticks[i + 1]);
          const ow = b - a;
          const frac = ow > 1e-12 ? (x - a) / ow : 0;
          const f = Math.max(0, Math.min(1, frac));
          return cumStarts[i] + f * newW[i];
        };
        /** 沿 SVG 折線（已在加權空間）以弧長比例取點 */
        const pointAtArcFracSvg = (svgPts, frac) => {
          if (!svgPts || svgPts.length < 2) return null;
          const lens = [];
          let total = 0;
          for (let ii = 0; ii < svgPts.length - 1; ii++) {
            const L = Math.hypot(
              svgPts[ii + 1][0] - svgPts[ii][0],
              svgPts[ii + 1][1] - svgPts[ii][1]
            );
            lens.push(L);
            total += L;
          }
          if (!(total > 0)) return [svgPts[0][0], svgPts[0][1]];
          const target = Math.max(0, Math.min(1, frac)) * total;
          let acc = 0;
          for (let ii = 0; ii < lens.length; ii++) {
            if (acc + lens[ii] >= target) {
              const t = lens[ii] > 0 ? (target - acc) / lens[ii] : 0;
              return [
                svgPts[ii][0] + t * (svgPts[ii + 1][0] - svgPts[ii][0]),
                svgPts[ii][1] + t * (svgPts[ii + 1][1] - svgPts[ii][1]),
              ];
            }
            acc += lens[ii];
          }
          const last = svgPts[svgPts.length - 1];
          return [last[0], last[1]];
        };
        const flushPendingWeightedMidDots = () => {
          for (let pi = 0; pi < pendingWeightedMidDots.length; pi++) {
            const p = pendingWeightedMidDots[pi];
            // 優先沿加權路線弧長插值（路線在加權空間已重算）
            if (
              p.routeKey != null &&
              p.frac != null &&
              layoutWeightedRouteSvgByKey?.has(p.routeKey)
            ) {
              const svgPts = layoutWeightedRouteSvgByKey.get(p.routeKey);
              const pt = pointAtArcFracSvg(svgPts, p.frac);
              if (pt) {
                p.paint(pt[0], pt[1]);
                continue;
              }
            }
            // fallback：直接套 remap
            p.paint(plotRemapSvgX(p.sx), plotRemapSvgY(p.sy));
          }
          pendingWeightedMidDots.length = 0;
        };
        /** 複本＋加權：子網格寬／高小於閾值時，依 weight_差值由小到大暫隱中段黑點直至鄰線間距≥閾值，再弧長重分配並進 pending。 */
        const runCopyWeightedMidFinalize = (hiddenForSubgridPt) => {
          if (!copyRouteMidPlans || copyRouteMidPlans.size === 0) return;
          copyWeightedMidStateByMatchKey.clear();
          layoutDotsForBandMaxAfterCopyFinalize.length = 0;
          const copyLyr = layoutVhDrawCopyWeightedLayerTab
            ? dataStore.findLayerById(layoutVhDrawCopyWeightedLayerTab)
            : null;
          const tbl = copyLyr?.dataTableData;
          const hideSet =
            hiddenForSubgridPt instanceof Set
              ? hiddenForSubgridPt
              : new Set(hiddenForSubgridPt ?? []);
          if (Array.isArray(tbl)) {
            for (const rec of tbl) {
              if (!rec || typeof rec !== 'object') continue;
              rec.因細間距隱藏 = false;
              rec.合併鄰段_weight = null;
            }
          }
          for (const [, plan] of copyRouteMidPlans) {
            const {
              totalPx: tPx,
              gridPts: gPts,
              row: rowP,
              items,
              rfGlobalIdx: rfGi,
              bandFi: planBandFiRaw,
            } = plan;
            let planBandFi = planBandFiRaw;
            if (!Number.isFinite(planBandFi) && copyLayoutTrafficChains?.length) {
              const chMeta = copyLayoutTrafficChains.find((c) => c.rfGi === rfGi);
              if (chMeta && Number.isFinite(chMeta.bandFi)) planBandFi = chMeta.bandFi;
            }
            if (!Array.isArray(items) || !items.length || !gPts || !(tPx > 0)) continue;
            const visible = [];
            for (const it of items) {
              const hide = hideSet.has(it.matchKey);
              let rec = null;
              if (Array.isArray(tbl)) {
                rec = tbl.find(
                  (r) =>
                    r &&
                    layoutVhDrawCopyRowMatchKeyFn({
                      路線: r.路線,
                      黑點站名: r.黑點站名,
                      前站另一端站名: r.前站另一端站名,
                      後站另一端站名: r.後站另一端站名,
                    }) === it.matchKey
                );
                if (rec) rec.因細間距隱藏 = hide;
              }
              if (hide) {
                copyWeightedMidStateByMatchKey.set(it.matchKey, { hidden: true });
                if (rec) {
                  const wf = Number(rec.weight_與前站);
                  const wb = Number(rec.weight_與後站);
                  rec.合併鄰段_weight = Math.max(
                    Number.isFinite(wf) ? wf : 0,
                    Number.isFinite(wb) ? wb : 0
                  );
                }
              } else if (rec) {
                rec.合併鄰段_weight = null;
              }
              if (!hide) visible.push(it);
            }
            visible.sort((a, b) => a.k - b.k);
            const rCnt = visible.length;
            for (let ii = 0; ii < rCnt; ii++) {
              const it = visible[ii];
              const targetPx2 = ((ii + 1) * tPx) / (rCnt + 1);
              const gxy2 = recomputeLayoutMidGxyFromTargetPx(gPts, targetPx2);
              if (!gxy2) continue;
              const si2 = nearestSegIndexOnGridPolyline(gPts, gxy2[0], gxy2[1]);
              const kind2 =
                si2 >= 0
                  ? classifyLayoutVhDrawBlackDotGeomKind(gPts, gxy2, si2, (gx, gy) => [
                      xScale(Number(gx)),
                      yScale(Number(gy)),
                    ])
                  : it.kind;
              copyWeightedMidStateByMatchKey.set(it.matchKey, { gxy: gxy2 });
              let segDir2 = 'D';
              if (si2 >= 0 && si2 < gPts.length - 1) {
                const sA = gPts[si2];
                const sB = gPts[si2 + 1];
                const pxA = xScale(Number(sA[0]));
                const pyA = yScale(Number(sA[1]));
                const pxB = xScale(Number(sB[0]));
                const pyB = yScale(Number(sB[1]));
                const adxPx = Math.abs(pxB - pxA);
                const adyPx = Math.abs(pyB - pyA);
                const segEpsPx = 1.0;
                if (adyPx < segEpsPx && adxPx >= segEpsPx) segDir2 = 'H';
                else if (adxPx < segEpsPx && adyPx >= segEpsPx) segDir2 = 'V';
              }
              if (Number.isFinite(planBandFi)) {
                layoutDotsForBandMaxAfterCopyFinalize.push({
                  gx: Number(gxy2[0]),
                  gy: Number(gxy2[1]),
                  fi: planBandFi,
                  si: si2,
                  segDir: segDir2,
                });
              }
              if (layoutCopyGeomKindByKey) layoutCopyGeomKindByKey.set(it.matchKey, kind2);
              if (Array.isArray(tbl)) {
                const rec2 = tbl.find(
                  (r) =>
                    r &&
                    layoutVhDrawCopyRowMatchKeyFn({
                      路線: r.路線,
                      黑點站名: r.黑點站名,
                      前站另一端站名: r.前站另一端站名,
                      後站另一端站名: r.後站另一端站名,
                    }) === it.matchKey
                );
                if (rec2) rec2.點位類型 = kind2;
              }
              const staV = it.sta;
              const gxTip = gxy2[0];
              const gyTip = gxy2[1];
              const paintOne = (cx, cy) => {
                layoutStaG
                  .append('circle')
                  .attr('class', 'layout-vh-draw-mid-black-dot space-network-rb-station-dot')
                  .attr('cx', cx)
                  .attr('cy', cy)
                  .attr('r', layoutVhDrawMidBlackDotRadius)
                  .attr('fill', '#000000')
                  .attr('stroke', '#000000')
                  .attr('stroke-width', 1)
                  .style('cursor', 'pointer')
                  .style('pointer-events', 'all')
                  .on('mouseover', function (event) {
                    d3.select(this).attr('r', 5).attr('stroke-width', 2);
                    showLayoutVHDrawMidStationTooltip(event, staV, gxTip, gyTip, rowP);
                  })
                  .on('mousemove', function (event) {
                    tooltip
                      .style('left', `${event.pageX + 10}px`)
                      .style('top', `${event.pageY - 10}px`);
                  })
                  .on('mouseout', function () {
                    d3.select(this)
                      .attr('r', layoutVhDrawMidBlackDotRadius)
                      .attr('stroke-width', 1);
                    tooltip.style('opacity', 0);
                  });
                paintMidBlackDotName(cx, cy, layoutTrafficStationName(staV));
              };
              pendingWeightedMidDots.push({
                paint: paintOne,
                routeKey: `${rfGi}#0`,
                frac: rCnt > 0 ? (ii + 1) / (rCnt + 1) : 0.5,
                sx: xScale(gxy2[0]),
                sy: yScale(gxy2[1]),
              });
            }
          }
          copyRouteMidPlans.clear();
        };

        const buildCollapsedTrafficOrderedPoints = (nodes, midStateByMatchKey) => {
          const out = [];
          if (!Array.isArray(nodes)) return out;
          for (const n of nodes) {
            if (!n?.name) continue;
            if (!n.matchKey) {
              out.push({ name: n.name, gxy: [...n.gxy] });
              continue;
            }
            const st = midStateByMatchKey.get(n.matchKey);
            if (st?.hidden) continue;
            const gxRaw = st?.gxy?.[0];
            const gyRaw = st?.gxy?.[1];
            out.push({
              name: n.name,
              gxy: [
                Number.isFinite(Number(gxRaw)) ? Number(gxRaw) : Number(n.gxy[0]),
                Number.isFinite(Number(gyRaw)) ? Number(gyRaw) : Number(n.gxy[1]),
              ],
            });
          }
          return out;
        };
        const elementaryChainEdgeWeight = (nodes, j, tblByMatchKey, csvMap) => {
          const b = nodes[j + 1];
          if (!b) return 0;
          let w = 0;
          if (b.matchKey) {
            const rec = tblByMatchKey.get(b.matchKey);
            w = Number(rec?.weight_與前站) || 0;
          } else {
            const a = nodes[j];
            if (a?.matchKey) {
              const rec = tblByMatchKey.get(a.matchKey);
              w = Number(rec?.weight_與後站) || 0;
            }
          }
          const na = String(nodes[j]?.name ?? '').trim();
          const nb = String(nodes[j + 1]?.name ?? '').trim();
          if (na && nb && csvMap && typeof csvMap.get === 'function') {
            const ck = layoutTrafficKey(na, nb);
            const cw = Number(csvMap.get(ck));
            if (Number.isFinite(cw)) w = Math.max(w, cw);
          }
          return w;
        };
        const maxChainEdgeWeightAlong = (nodes, i0, i1, tblByMatchKey, csvMap) => {
          let mx = 0;
          for (let j = i0; j < i1; j++) {
            mx = Math.max(mx, elementaryChainEdgeWeight(nodes, j, tblByMatchKey, csvMap));
          }
          return mx;
        };
        const collectCollapsedEdgeWeightsForNodes = (
          nodes,
          midStateByMatchKey,
          tblByMatchKey,
          csvMap
        ) => {
          const visIdx = [];
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n.matchKey) {
              visIdx.push(i);
              continue;
            }
            const st = midStateByMatchKey.get(n.matchKey);
            if (!st?.hidden) visIdx.push(i);
          }
          const out = new Map();
          for (let ii = 0; ii < visIdx.length - 1; ii++) {
            const i0 = visIdx[ii];
            const i1 = visIdx[ii + 1];
            const a = nodes[i0].name;
            const b = nodes[i1].name;
            const k = layoutTrafficKey(a, b);
            const w = maxChainEdgeWeightAlong(nodes, i0, i1, tblByMatchKey, csvMap);
            out.set(k, Math.max(out.get(k) ?? 0, w));
          }
          return out;
        };
        /** 複本＋加權：依隱藏後折疊站序重建交通邊與 max 合併權重圖 */
        const rebuildCopyLayoutTrafficEdgesAndWeights = () => {
          if (!copyLayoutTrafficChains || copyLayoutTrafficChains.length === 0) return;
          const copyLyr0 = layoutVhDrawCopyWeightedLayerTab
            ? dataStore.findLayerById(layoutVhDrawCopyWeightedLayerTab)
            : null;
          const tbl0 = copyLyr0?.dataTableData;
          const tblByMatchKey0 = new Map();
          if (Array.isArray(tbl0)) {
            for (const rec of tbl0) {
              if (!rec || typeof rec !== 'object') continue;
              const mk = layoutVhDrawCopyRowMatchKeyFn({
                路線: rec.路線,
                黑點站名: rec.黑點站名,
                前站另一端站名: rec.前站另一端站名,
                後站另一端站名: rec.後站另一端站名,
              });
              tblByMatchKey0.set(mk, rec);
            }
          }
          const trafficRowsCollapse =
            Array.isArray(copyLyr0?.layoutVhDrawTrafficData) &&
            copyLyr0.layoutVhDrawTrafficData.length > 0
              ? copyLyr0.layoutVhDrawTrafficData
              : null;
          const csvMapForCollapse = new Map();
          if (Array.isArray(trafficRowsCollapse)) {
            for (const row of trafficRowsCollapse) {
              if (!row || typeof row !== 'object') continue;
              const ck = layoutTrafficKey(row.a, row.b);
              const cw = Number(row.weight);
              if (Number.isFinite(cw)) csvMapForCollapse.set(ck, cw);
            }
          }
          layoutTrafficEdges.length = 0;
          layoutTrafficEdgeKeys.clear();
          layoutTrafficEdgeCollapseWeights = new Map();
          for (const ch of copyLayoutTrafficChains) {
            const pts = buildCollapsedTrafficOrderedPoints(
              ch.nodes,
              copyWeightedMidStateByMatchKey
            );
            addLayoutTrafficEdges(pts, ch.routeKey);
            const wmap = collectCollapsedEdgeWeightsForNodes(
              ch.nodes,
              copyWeightedMidStateByMatchKey,
              tblByMatchKey0,
              csvMapForCollapse
            );
            for (const [k, w] of wmap) {
              layoutTrafficEdgeCollapseWeights.set(
                k,
                Math.max(layoutTrafficEdgeCollapseWeights.get(k) ?? 0, w)
              );
            }
          }
        };

        /** 比例條模式：粗格實線＋依 col／row 黑點 max 的虛線子網格＋軸帶黑點 max 藍字 */
        const drawWeightedVhInnerGridAndBandLabels = (ratX, ratY, colVals, rowVals) => {
          gridGroup.selectAll('.layout-vh-draw-weighted-grid-v').remove();
          gridGroup.selectAll('.layout-vh-draw-weighted-grid-h').remove();
          gridGroup.selectAll('.layout-vh-draw-weighted-grid-inner-dash').remove();
          axisGroup.selectAll('.layout-vh-draw-axis-interval-black-max-x').remove();
          axisGroup.selectAll('.layout-vh-draw-axis-interval-black-max-y').remove();
          axisGroup.selectAll('.layout-vh-draw-axis-interval-line-weight-max-x').remove();
          axisGroup.selectAll('.layout-vh-draw-axis-interval-line-weight-max-y').remove();
          const vhWeightedSolid = { stroke: '#757575', strokeW: 0.55, opacity: 0.82 };
          const vhWeightedInnerDash = {
            stroke: '#BDBDBD',
            strokeW: 0.4,
            opacity: 0.65,
            dash: '4,4',
          };
          const wtxL = layoutBlackMaxXTicks.map((t) => Number(t));
          const wtyL = layoutBlackMaxYTicks.map((t) => Number(t));
          let xCursor = margin.left;
          const innerWtG = gridGroup
            .append('g')
            .attr('class', 'layout-vh-draw-weighted-grid-inner-dash')
            .style('pointer-events', 'none');
          for (let xi = 0; xi <= ratX.length; xi++) {
            gridGroup
              .append('line')
              .attr('class', 'layout-vh-draw-weighted-grid-v')
              .attr('x1', xCursor)
              .attr('y1', margin.top)
              .attr('x2', xCursor)
              .attr('y2', margin.top + height)
              .attr('stroke', vhWeightedSolid.stroke)
              .attr('stroke-width', vhWeightedSolid.strokeW)
              .attr('opacity', vhWeightedSolid.opacity);
            if (xi < ratX.length) {
              const slabW = width * ratX[xi];
              const nSub = Math.max(0, Math.round(Number(colVals[xi]) || 0));
              for (let j = 1; j <= nSub; j++) {
                const xIn = xCursor + (slabW * j) / (nSub + 1);
                innerWtG
                  .append('line')
                  .attr('class', 'layout-vh-draw-weighted-grid-inner-v')
                  .attr('x1', xIn)
                  .attr('y1', margin.top)
                  .attr('x2', xIn)
                  .attr('y2', margin.top + height)
                  .attr('stroke', vhWeightedInnerDash.stroke)
                  .attr('stroke-width', vhWeightedInnerDash.strokeW)
                  .attr('opacity', vhWeightedInnerDash.opacity)
                  .attr('stroke-dasharray', vhWeightedInnerDash.dash);
              }
              xCursor += slabW;
            }
          }
          let yCursor = margin.top;
          for (let yi = 0; yi <= ratY.length; yi++) {
            gridGroup
              .append('line')
              .attr('class', 'layout-vh-draw-weighted-grid-h')
              .attr('x1', margin.left)
              .attr('y1', yCursor)
              .attr('x2', margin.left + width)
              .attr('y2', yCursor)
              .attr('stroke', vhWeightedSolid.stroke)
              .attr('stroke-width', vhWeightedSolid.strokeW)
              .attr('opacity', vhWeightedSolid.opacity);
            if (yi < ratY.length) {
              const slabH = height * ratY[yi];
              const nSubH = Math.max(0, Math.round(Number(rowVals[yi]) || 0));
              for (let j = 1; j <= nSubH; j++) {
                const yIn = yCursor + (slabH * j) / (nSubH + 1);
                innerWtG
                  .append('line')
                  .attr('class', 'layout-vh-draw-weighted-grid-inner-h')
                  .attr('x1', margin.left)
                  .attr('y1', yIn)
                  .attr('x2', margin.left + width)
                  .attr('y2', yIn)
                  .attr('stroke', vhWeightedInnerDash.stroke)
                  .attr('stroke-width', vhWeightedInnerDash.strokeW)
                  .attr('opacity', vhWeightedInnerDash.opacity)
                  .attr('stroke-dasharray', vhWeightedInnerDash.dash);
              }
              yCursor += slabH;
            }
          }
          for (let xi = 0; xi < nColSlabs; xi++) {
            const t0 = Number(layoutBlackMaxXTicks[xi]);
            const t1 = Number(layoutBlackMaxXTicks[xi + 1]);
            const midOld = (t0 + t1) / 2;
            const midNew = slabRemapPlotLocal(wtxL, ratX, width, midOld);
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-black-max-x')
              .attr('x', margin.left + midNew)
              .attr('y', margin.top + height + 28)
              .attr('text-anchor', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#1565C0')
              .text(String(colVals[xi]));
            const wvX = maxLayoutVhDrawLineWeightInOpenXSlabPlotPx(
              layoutWeightedLegsRealtime,
              xScale,
              margin.left,
              t0,
              t1
            );
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-line-weight-max-x')
              .attr('x', margin.left + midNew)
              .attr('y', margin.top + height + 40)
              .attr('text-anchor', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#2E7D32')
              .text(String(wvX));
          }
          const yBandLabelXW = margin.left - 46;
          for (let yi = 0; yi < nRowSlabs; yi++) {
            const t0 = Number(layoutBlackMaxYTicks[yi]);
            const t1 = Number(layoutBlackMaxYTicks[yi + 1]);
            const midOld = (t0 + t1) / 2;
            const midNew = slabRemapPlotLocal(wtyL, ratY, height, midOld);
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-black-max-y')
              .attr('x', yBandLabelXW)
              .attr('y', margin.top + midNew)
              .attr('text-anchor', 'end')
              .attr('dominant-baseline', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#1565C0')
              .text(String(rowVals[yi]));
            const wvY = maxLayoutVhDrawLineWeightInOpenYSlabPlotPx(
              layoutWeightedLegsRealtime,
              yScale,
              margin.top,
              t0,
              t1
            );
            axisGroup
              .append('text')
              .attr('class', 'layout-vh-draw-axis-interval-line-weight-max-y')
              .attr('x', yBandLabelXW - 18)
              .attr('y', margin.top + midNew)
              .attr('text-anchor', 'end')
              .attr('dominant-baseline', 'middle')
              .attr('font-size', '9px')
              .attr('font-weight', '600')
              .attr('fill', '#2E7D32')
              .text(String(wvY));
          }
        };

        if (canApplyWeightedPlotRemap) {
          const ptToPxForRatioFloor =
            layoutViewerPxPtScale?.ptToPx ?? ((pt) => (Number(pt) * 96) / 72);
          const pxToPtDashSubgrid = (px) => (Number(px) * 72) / 96;
          const roundPt2Dash = (pt) => Math.round(Number(pt) * 100) / 100;
          const neiThrSrc = dataStore.findLayerById(layerTab);
          const rawNeiThr = Number(neiThrSrc?.layoutVhDrawWeightedNeighborHideMinPt);
          const ptThrNeiDefault = LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT;
          const ptThrNei =
            layoutVhDrawCopyWeightedLayerTab && Number.isFinite(rawNeiThr) && rawNeiThr > 0
              ? rawNeiThr
              : ptThrNeiDefault;

          const copyWeightedHideForSubgrid = new Set();
          if (copyRouteMidPlans && copyRouteMidPlans.size > 0) {
            const copyLyrIt = layoutVhDrawCopyWeightedLayerTab
              ? dataStore.findLayerById(layoutVhDrawCopyWeightedLayerTab)
              : null;
            const tblIt = copyLyrIt?.dataTableData;
            const weightByMatchKey = new Map();
            if (Array.isArray(tblIt)) {
              for (const rec of tblIt) {
                if (!rec || typeof rec !== 'object') continue;
                const mk = layoutVhDrawCopyRowMatchKeyFn({
                  路線: rec.路線,
                  黑點站名: rec.黑點站名,
                  前站另一端站名: rec.前站另一端站名,
                  後站另一端站名: rec.後站另一端站名,
                });
                const w = Number(rec.weight_差值);
                weightByMatchKey.set(mk, Number.isFinite(w) ? w : 0);
              }
            }
            const orderedKeys = [];
            const seenMk = new Set();
            for (const [, plan] of copyRouteMidPlans) {
              if (!Array.isArray(plan.items)) continue;
              for (const it of plan.items) {
                if (!it.matchKey || seenMk.has(it.matchKey)) continue;
                seenMk.add(it.matchKey);
                orderedKeys.push(it.matchKey);
              }
            }
            orderedKeys.sort((a, b) => {
              const wa = weightByMatchKey.has(a) ? Number(weightByMatchKey.get(a)) : 0;
              const wb = weightByMatchKey.has(b) ? Number(weightByMatchKey.get(b)) : 0;
              const na = Number.isFinite(wa) ? wa : 0;
              const nb = Number.isFinite(wb) ? wb : 0;
              if (na !== nb) return na - nb;
              return String(a).localeCompare(String(b));
            });
            const nStepMax = orderedKeys.length + 2;
            // 依 weight_差值（相連兩段 weight 差）由小到大逐一暫隱中段黑點，直到鄰線間距達標。
            // 僅當圖層「自動隱藏黑點」開關開啟才計算此迴圈；關閉時黑點全顯示。
            if (activeTabLayer?.layoutVhDrawAutoHideMidBlackDots === true)
              for (let step = 0; step < nStepMax; step++) {
              const dotsEff = layoutDotsForBandMaxRealtime.filter(
                (d) => !d.copyMidMatchKey || !copyWeightedHideForSubgrid.has(d.copyMidMatchKey)
              );
              recomputeLayoutPxBandMaxFromDots(dotsEff);
              if (
                layoutPxBandMaxColVals.length !== nColSlabs ||
                layoutPxBandMaxRowVals.length !== nRowSlabs
              )
                break;
              const ratXt = slabRatiosBlackMaxWithMinPtForZeros(
                ratioSrcColVals(),
                width,
                ptToPxForRatioFloor
              );
              const ratYt = slabRatiosBlackMaxWithMinPtForZeros(
                ratioSrcRowVals(),
                height,
                ptToPxForRatioFloor
              );
              if (!ratXt.length || !ratYt.length) break;
              const wGapT = [];
              for (let xi = 0; xi < ratXt.length; xi++) {
                const slabW = width * ratXt[xi];
                const nSub = Math.max(0, Math.round(Number(layoutPxBandMaxColVals[xi]) || 0));
                const gapPx = nSub >= 1 ? slabW / (nSub + 1) : slabW;
                wGapT.push(pxToPtDashSubgrid(gapPx));
              }
              const hGapT = [];
              for (let yi = 0; yi < ratYt.length; yi++) {
                const slabH = height * ratYt[yi];
                const nSubH = Math.max(0, Math.round(Number(layoutPxBandMaxRowVals[yi]) || 0));
                const gapPx = nSubH >= 1 ? slabH / (nSubH + 1) : slabH;
                hGapT.push(pxToPtDashSubgrid(gapPx));
              }
              const wMnRawT = Math.min(...wGapT);
              const hMnRawT = Math.min(...hGapT);
              if (wMnRawT >= ptThrNei && hMnRawT >= ptThrNei) break;
              let added = false;
              for (let oi = 0; oi < orderedKeys.length; oi++) {
                const mk = orderedKeys[oi];
                if (!copyWeightedHideForSubgrid.has(mk)) {
                  copyWeightedHideForSubgrid.add(mk);
                  added = true;
                  break;
                }
              }
              if (!added) break;
            }
            const dotsFinal = layoutDotsForBandMaxRealtime.filter(
              (d) => !d.copyMidMatchKey || !copyWeightedHideForSubgrid.has(d.copyMidMatchKey)
            );
            recomputeLayoutPxBandMaxFromDots(dotsFinal);
          }

          const ratXC = slabRatiosBlackMaxWithMinPtForZeros(
            ratioSrcColVals(),
            width,
            ptToPxForRatioFloor
          );
          const ratYR = slabRatiosBlackMaxWithMinPtForZeros(
            ratioSrcRowVals(),
            height,
            ptToPxForRatioFloor
          );
          let finalRatXC = ratXC;
          let finalRatYR = ratYR;

          /** 鄰近縱／橫線間距（px）：含粗格實線與區間內虛線。nSub≥1 時為 slab/(nSub+1)；nSub=0 時僅實線邊界，間距為整段 slab。 */
          const wGapPtList = [];
          for (let xi = 0; xi < ratXC.length; xi++) {
            const slabW = width * ratXC[xi];
            const nSub = Math.max(0, Math.round(Number(layoutPxBandMaxColVals[xi]) || 0));
            const gapPx = nSub >= 1 ? slabW / (nSub + 1) : slabW;
            wGapPtList.push(pxToPtDashSubgrid(gapPx));
          }
          const hGapPtList = [];
          for (let yi = 0; yi < ratYR.length; yi++) {
            const slabH = height * ratYR[yi];
            const nSubH = Math.max(0, Math.round(Number(layoutPxBandMaxRowVals[yi]) || 0));
            const gapPx = nSubH >= 1 ? slabH / (nSubH + 1) : slabH;
            hGapPtList.push(pxToPtDashSubgrid(gapPx));
          }
          const wMnRaw = Math.min(...wGapPtList);
          const wMxRaw = Math.max(...wGapPtList);
          const hMnRaw = Math.min(...hGapPtList);
          const hMxRaw = Math.max(...hGapPtList);
          const wMn = roundPt2Dash(wMnRaw);
          const wMx = roundPt2Dash(wMxRaw);
          const hMn = roundPt2Dash(hMnRaw);
          const hMx = roundPt2Dash(hMxRaw);
          dataStore.setLayoutVhDrawWeightedDashSubgridPtUi({
            layerId: layerTab,
            status: 'ok',
            wPtMin: wMn,
            wPtMax: wMx,
            hPtMin: hMn,
            hPtMax: hMx,
          });

          const wtx = layoutBlackMaxXTicks.map((t) => Number(t));
          const wty = layoutBlackMaxYTicks.map((t) => Number(t));

          plotRemapSvgX = (sx) =>
            margin.left + slabRemapPlotLocal(wtx, ratXC, width, sx - margin.left);
          plotRemapSvgY = (sy) =>
            margin.top + slabRemapPlotLocal(wty, ratYR, height, sy - margin.top);
          lineGenerator = d3
            .line()
            .x((d) => plotRemapSvgX(xScale(d[0])))
            .y((d) => plotRemapSvgY(yScale(d[1])))
            .curve(d3.curveLinear);

          // remap 就緒 → 在加權座標空間重算 HV45° 路線（保證角度與重疊約束）
          if (recomputeWeightedRoutes) recomputeWeightedRoutes(plotRemapSvgX, plotRemapSvgY);

          if (!layoutRouteWeightAnimActive) {
            drawWeightedVhInnerGridAndBandLabels(
              ratXC,
              ratYR,
              layoutPxBandMaxColVals,
              layoutPxBandMaxRowVals
            );
          }

          runCopyWeightedMidFinalize(copyWeightedHideForSubgrid);

          if (
            copyLayoutTrafficChains &&
            copyLayoutTrafficChains.length > 0 &&
            layoutVhDrawPixelAxisMode &&
            copyWeightedMidStateByMatchKey.size > 0
          ) {
            const copyBandFiTouched = new Set(
              copyLayoutTrafficChains.map((c) => c.bandFi).filter((fi) => Number.isFinite(fi))
            );
            const kept = layoutDotsForBandMaxRealtime.filter((d) => !copyBandFiTouched.has(d.fi));
            layoutDotsForBandMaxRealtime.length = 0;
            for (const d of kept) layoutDotsForBandMaxRealtime.push(d);
            for (const d of layoutDotsForBandMaxAfterCopyFinalize) {
              layoutDotsForBandMaxRealtime.push(d);
            }
            layoutPxBandMaxColVals.length = 0;
            for (let xi = 0; xi < layoutBlackMaxXTicks.length - 1; xi++) {
              const t0 = layoutBlackMaxXTicks[xi];
              const t1 = layoutBlackMaxXTicks[xi + 1];
              layoutPxBandMaxColVals.push(
                maxLayoutVhDrawBlackDotsOnLegInOpenXSlabPlotPx(
                  layoutDotsForBandMaxRealtime,
                  xScale,
                  margin.left,
                  t0,
                  t1
                )
              );
            }
            layoutPxBandMaxRowVals.length = 0;
            for (let yi = 0; yi < layoutBlackMaxYTicks.length - 1; yi++) {
              const t0 = layoutBlackMaxYTicks[yi];
              const t1 = layoutBlackMaxYTicks[yi + 1];
              layoutPxBandMaxRowVals.push(
                maxLayoutVhDrawBlackDotsOnLegInOpenYSlabPlotPx(
                  layoutDotsForBandMaxRealtime,
                  yScale,
                  margin.top,
                  t0,
                  t1
                )
              );
            }
            const ratXC2 = slabRatiosBlackMaxWithMinPtForZeros(
              ratioSrcColVals(),
              width,
              ptToPxForRatioFloor
            );
            const ratYR2 = slabRatiosBlackMaxWithMinPtForZeros(
              ratioSrcRowVals(),
              height,
              ptToPxForRatioFloor
            );
            const wGapPtList2 = [];
            for (let xi = 0; xi < ratXC2.length; xi++) {
              const slabW = width * ratXC2[xi];
              const nSub = Math.max(0, Math.round(Number(layoutPxBandMaxColVals[xi]) || 0));
              const gapPx = nSub >= 1 ? slabW / (nSub + 1) : slabW;
              wGapPtList2.push(pxToPtDashSubgrid(gapPx));
            }
            const hGapPtList2 = [];
            for (let yi = 0; yi < ratYR2.length; yi++) {
              const slabH = height * ratYR2[yi];
              const nSubH = Math.max(0, Math.round(Number(layoutPxBandMaxRowVals[yi]) || 0));
              const gapPx = nSubH >= 1 ? slabH / (nSubH + 1) : slabH;
              hGapPtList2.push(pxToPtDashSubgrid(gapPx));
            }
            const wMnRaw2 = Math.min(...wGapPtList2);
            const wMxRaw2 = Math.max(...wGapPtList2);
            const hMnRaw2 = Math.min(...hGapPtList2);
            const hMxRaw2 = Math.max(...hGapPtList2);
            dataStore.setLayoutVhDrawWeightedDashSubgridPtUi({
              layerId: layerTab,
              status: 'ok',
              wPtMin: roundPt2Dash(wMnRaw2),
              wPtMax: roundPt2Dash(wMxRaw2),
              hPtMin: roundPt2Dash(hMnRaw2),
              hPtMax: roundPt2Dash(hMxRaw2),
            });
            plotRemapSvgX = (sx) =>
              margin.left + slabRemapPlotLocal(wtx, ratXC2, width, sx - margin.left);
            plotRemapSvgY = (sy) =>
              margin.top + slabRemapPlotLocal(wty, ratYR2, height, sy - margin.top);
            lineGenerator = d3
              .line()
              .x((d) => plotRemapSvgX(xScale(d[0])))
              .y((d) => plotRemapSvgY(yScale(d[1])))
              .curve(d3.curveLinear);
            if (recomputeWeightedRoutes) recomputeWeightedRoutes(plotRemapSvgX, plotRemapSvgY);
            if (!layoutRouteWeightAnimActive) {
              drawWeightedVhInnerGridAndBandLabels(
                ratXC2,
                ratYR2,
                layoutPxBandMaxColVals,
                layoutPxBandMaxRowVals
              );
            }
            finalRatXC = ratXC2;
            finalRatYR = ratYR2;
          }

          const applyRouteWeightAnimBeforeDraw = (activeRatXC, activeRatYR) => {
            if (!layoutWeightedRouteSvgByKey) return;
            const snapWtx = layoutBlackMaxXTicks.map((t) => Number(t));
            const snapWty = layoutBlackMaxYTicks.map((t) => Number(t));
            const currentSnap = buildLayoutVhDrawRouteAnimSnapshot(layoutWeightedRouteSvgByKey, {
              wtx: snapWtx,
              wty: snapWty,
              ratXC: activeRatXC,
              ratYR: activeRatYR,
              width,
              height,
            });
            dataStore.setLayoutVhDrawRouteAnimSnapshot(layerTab, currentSnap);

            let animRun = dataStore.layoutVhDrawRouteAnim;
            if (animRun?.layerId === layerTab && animRun.pendingTo) {
              if (layoutVhDrawRouteAnimSnapshotHasMotion(animRun.from, currentSnap)) {
                dataStore.completeLayoutVhDrawRouteWeightAnimTo(layerTab, currentSnap);
                startLayoutRouteWeightAnimLoop();
                animRun = dataStore.layoutVhDrawRouteAnim;
              } else {
                dataStore.clearLayoutVhDrawRouteAnim();
                animRun = null;
              }
            }

            if (
              animRun?.active &&
              animRun.layerId === layerTab &&
              animRun.from &&
              animRun.to
            ) {
              const blendedRemap = interpolateLayoutVhDrawRouteAnimRemap(
                animRun.from,
                animRun.to,
                animRun.progress
              );
              if (blendedRemap) {
                const remapFns = buildPlotRemapFnsFromAnimRemap(blendedRemap, margin);
                plotRemapSvgX = remapFns.plotRemapSvgX;
                plotRemapSvgY = remapFns.plotRemapSvgY;
                lineGenerator = d3
                  .line()
                  .x((d) => plotRemapSvgX(xScale(d[0])))
                  .y((d) => plotRemapSvgY(yScale(d[1])))
                  .curve(d3.curveLinear);
                // 動畫幀：依內插 remap 重跑 HV45° 路線（與靜態加權繪製同源，非折點線性內插）
                if (recomputeWeightedRoutes) {
                  recomputeWeightedRoutes(plotRemapSvgX, plotRemapSvgY);
                }
              }
            }
          };

          applyRouteWeightAnimBeforeDraw(finalRatXC, finalRatYR);
          rebuildCopyLayoutTrafficEdgesAndWeights();
          flushPendingWeightedMidDots();
          drawLayoutRoutesPass();
        } else {
          dataStore.setLayoutVhDrawWeightedDashSubgridPtUi({
            layerId: layerTab,
            status: 'cant_remap',
          });
          runCopyWeightedMidFinalize(new Set());
          rebuildCopyLayoutTrafficEdgesAndWeights();
          flushPendingWeightedMidDots();
          drawLayoutRoutesPass();
        }
      }

      // ── 交通流量標注：CSV 對應紅／藍／黑點之間的相鄰邊；無 CSV 對應邊顯示 0 ──
      /** 加權比例條：路段已在加權 SVG 空間重畫，標籤須沿加權折線取弧長中點（勿再用均勻空間端點中點套 plotRemap）。 */
      const layoutTrafficPointAtArcFracSvg = (svgPts, frac) => {
        if (!svgPts || svgPts.length < 2) return null;
        const f = Math.max(0, Math.min(1, Number(frac) || 0));
        const lens = [];
        let total = 0;
        for (let ii = 0; ii < svgPts.length - 1; ii++) {
          const L = Math.hypot(
            svgPts[ii + 1][0] - svgPts[ii][0],
            svgPts[ii + 1][1] - svgPts[ii][1]
          );
          lens.push(L);
          total += L;
        }
        if (!(total > 1e-12)) return [svgPts[0][0], svgPts[0][1]];
        const target = f * total;
        let acc = 0;
        for (let ii = 0; ii < lens.length; ii++) {
          if (acc + lens[ii] >= target) {
            const t = lens[ii] > 0 ? (target - acc) / lens[ii] : 0;
            return [
              svgPts[ii][0] + t * (svgPts[ii + 1][0] - svgPts[ii][0]),
              svgPts[ii][1] + t * (svgPts[ii + 1][1] - svgPts[ii][1]),
            ];
          }
          acc += lens[ii];
        }
        const last = svgPts[svgPts.length - 1];
        return [last[0], last[1]];
      };
      const layoutTrafficUniformPolylineLen = (gridPts) => {
        if (!gridPts || gridPts.length < 2) return 0;
        let s = 0;
        for (let i = 0; i < gridPts.length - 1; i++) {
          const a = gridPts[i];
          const b = gridPts[i + 1];
          s += Math.hypot(
            xScale(Number(b[0])) - xScale(Number(a[0])),
            yScale(Number(b[1])) - yScale(Number(a[1]))
          );
        }
        return s;
      };
      const layoutTrafficDistAlongUniformPx = (gridPts, gx, gy) => {
        if (!gridPts || gridPts.length < 2) return 0;
        const px = Number(gx);
        const py = Number(gy);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return 0;
        let bestAlong = 0;
        let bestPerpSq = Infinity;
        let acc = 0;
        for (let i = 0; i < gridPts.length - 1; i++) {
          const a = gridPts[i];
          const b = gridPts[i + 1];
          const ax = xScale(Number(a[0]));
          const ay = yScale(Number(a[1]));
          const bx = xScale(Number(b[0]));
          const by = yScale(Number(b[1]));
          const qx = xScale(px);
          const qy = yScale(py);
          const dx = bx - ax;
          const dy = by - ay;
          const lenSq = dx * dx + dy * dy;
          const t =
            lenSq > 1e-18 ? Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / lenSq)) : 0;
          const hx = ax + t * dx;
          const hy = ay + t * dy;
          const perpSq = (qx - hx) * (qx - hx) + (qy - hy) * (qy - hy);
          if (perpSq < bestPerpSq) {
            bestPerpSq = perpSq;
            bestAlong = acc + t * Math.sqrt(lenSq);
          }
          acc += Math.sqrt(lenSq);
        }
        return bestAlong;
      };
      const layoutTrafficLabelXY = (edge) => {
        if (
          layoutVhDrawWeightedLayoutMode &&
          edge?.routeKey != null &&
          layoutWeightedRouteSvgByKey &&
          layoutWeightedRouteSvgByKey.has(edge.routeKey) &&
          layoutPixelVhDrawRouteGridByKey &&
          layoutPixelVhDrawRouteGridByKey.has(edge.routeKey)
        ) {
          const svgPts = layoutWeightedRouteSvgByKey.get(edge.routeKey);
          const gridPts = layoutPixelVhDrawRouteGridByKey.get(edge.routeKey);
          if (
            Array.isArray(svgPts) &&
            svgPts.length >= 2 &&
            Array.isArray(gridPts) &&
            gridPts.length >= 2
          ) {
            const totalU = layoutTrafficUniformPolylineLen(gridPts);
            if (totalU > 1e-9) {
              const d0 = layoutTrafficDistAlongUniformPx(gridPts, edge.gx0, edge.gy0);
              const d1 = layoutTrafficDistAlongUniformPx(gridPts, edge.gx1, edge.gy1);
              const midFrac = Math.max(0, Math.min(1, (d0 + d1) / (2 * totalU)));
              const pt = layoutTrafficPointAtArcFracSvg(svgPts, midFrac);
              if (Array.isArray(pt) && pt.every(Number.isFinite)) return pt;
            }
          }
        }
        return [plotRemapSvgX(edge.x), plotRemapSvgY(edge.y)];
      };

      const trafficLayer = dataStore.findLayerById(layerTab);
      let trafficRawData = trafficLayer?.layoutVhDrawTrafficData;
      if (Array.isArray(trafficRawData) && trafficRawData.length > 0) {
        const trafficMap = new Map();
        const missingTrafficRows = [];
        for (const row of trafficRawData) {
          const k = layoutTrafficKey(row.a, row.b);
          trafficMap.set(k, row.weight);
          if (!layoutTrafficEdgeKeys.has(k)) {
            missingTrafficRows.push({
              a: row.a,
              b: row.b,
              weight: row.weight,
              reason: '找不到相鄰紅/藍/黑點',
            });
          }
        }
        const prevMissing = JSON.stringify(trafficLayer.layoutVhDrawTrafficMissing ?? []);
        const nextMissing = JSON.stringify(missingTrafficRows);
        if (prevMissing !== nextMissing)
          trafficLayer.layoutVhDrawTrafficMissing = missingTrafficRows;

        /** 未定義視為開啟（相容舊圖層 state） */
        const showTrafficW = trafficLayer?.layoutVhDrawShowTrafficWeights !== false;
        if (showTrafficW) {
          const trafficG = zoomGroup.append('g').attr('class', 'layout-vh-draw-traffic-labels');
          for (const edge of layoutTrafficEdges) {
            const weight = layoutTrafficEdgeCollapseWeights?.has(edge.key)
              ? Number(layoutTrafficEdgeCollapseWeights.get(edge.key))
              : (trafficMap.get(edge.key) ?? 0);
            const [lx, ly] = layoutTrafficLabelXY(edge);
            trafficG
              .append('text')
              .attr('x', lx)
              .attr('y', ly)
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'middle')
              .attr('font-size', '8px')
              .attr('font-weight', '600')
              .attr('fill', '#6a1b9a')
              .attr('stroke', '#ffffff')
              .attr('stroke-width', 0.5)
              .attr('paint-order', 'stroke')
              .style('pointer-events', 'none')
              .text(String(weight));
          }
        }
      } else if (trafficLayer?.layoutVhDrawTrafficMissing?.length) {
        trafficLayer.layoutVhDrawTrafficMissing = [];
      }
    }

    // 繪製站點（根據 nodeType 區分 connect 和 line）
    stationFeatures.forEach((feature) => {
      const [x, y] = feature.geometry.coordinates;
      const props = feature.properties || {};
      const tags = props.tags || {};
      const nodeType = feature.nodeType || 'line'; // connect 或 line

      // 根據 nodeType 決定顏色和大小
      const isConnect = nodeType === 'connect';
      // 直線化測試／網格正規化：僅在「車站配置」開啟且已有 SectionData 時改由下方專區繪製，避免與 segment.nodes 重疊
      // taipei_h3／taipei_h3_dp：g3→h3 黑點僅存在於 segment.nodes／stationFeatures，專區未畫中段站，須走本迴圈
      const stLayer = dataStore.findLayerById(layerTab);
      if (
        TAIPEI_TEST_SPACE_NETWORK_STATION_TAB_IDS.includes(layerTab) &&
        layerTab !== 'taipei_h3' &&
        layerTab !== 'taipei_h3_dp' &&
        !isTaipeiTest3I3OrJ3LayerTab(layerTab) &&
        stLayer?.spaceNetworkGridJsonData_SectionData?.length > 0 &&
        stLayer?.showStationPlacement
      )
        return;

      // 經緯度路段（MapTab／json-derived）之站點：與 Map 分頁 terminal／intersection／normal 同色
      const mapLonLatEndpoints = props.endpointFromRouteLonLatSegment === true;

      // 有疊加網格時：紅點對齊網格單元中心；黑點依重分配表畫在兩交叉點間平均位置（勿套用於經緯度路段點）
      let drawX = x;
      let drawY = y;
      if (overlayForSnap && !mapLonLatEndpoints) {
        if (isConnect) {
          [drawX, drawY] = overlayCellCenter(x, y);
        } else {
          const redist = blackRedistributeMap.get(key(x, y));
          if (redist) [drawX, drawY] = redist;
        }
      }
      const degGx =
        props.x_grid !== undefined && Number.isFinite(Number(props.x_grid))
          ? Number(props.x_grid)
          : Number(x);
      const degGy =
        props.y_grid !== undefined && Number.isFinite(Number(props.y_grid))
          ? Number(props.y_grid)
          : Number(y);
      let fillColor;
      let radius;
      let strokeWidth;
      /** @type {'terminal'|'intersection'|'normal'} */
      let endpointNormForHover = 'normal';
      let strokeColor;
      let isHighlighted = false;
      let isOnOtherRoute = false;
      const hlStroke = '#ff6600';
      let cn;

      if (mapLonLatEndpoints) {
        const tagMerged = getGeoJsonFeatureTagProps(feature);
        endpointNormForHover = normalizeRouteSegmentEndpointType(
          props.type ?? tagMerged.type ?? 'normal'
        );
        const b = mapTabApproxBaseSvgForEndpoint(endpointNormForHover);
        fillColor = b.fill;
        strokeColor = b.stroke;
        radius = b.r;
        strokeWidth = b.strokeW;
        cn = props.connect_number ?? tags.connect_number;
      } else {
        const tagMergedGrid = getGeoJsonFeatureTagProps(feature);
        endpointNormForHover = normalizeRouteSegmentEndpointType(
          props.type ?? tags.type ?? tagMergedGrid.type ?? 'normal'
        );
        fillColor =
          isConnect && connectBlueFromTaggedTerminal(props, tags)
            ? '#1565c0'
            : (taipeiTest3ConnectFill(isConnect, degGx, degGy) ??
              (isConnect ? '#ff0000' : '#000000'));
        cn = props.connect_number ?? tags.connect_number;
        const sidLine = props.station_id ?? tags.station_id;
        const gxLine = props.x_grid !== undefined ? Number(props.x_grid) : Number(x);
        const gyLine = props.y_grid !== undefined ? Number(props.y_grid) : Number(y);
        const isConnectHl =
          isConnect &&
          dataStore.highlightedConnectNumber != null &&
          cn === dataStore.highlightedConnectNumber;
        const isH2ConnectHl = isConnect && matchH2TrafficConnect(cn);
        const isH2BlackHl = !isConnect && matchH2TrafficBlack(gxLine, gyLine, sidLine);
        const hbL3 = dataStore.highlightedBlackStation;
        const coordEpsL3 = 0.08;
        const hbSidL3 = hbL3?.stationId;
        const isL3ReductionBlackHl =
          !isConnect &&
          hbL3 &&
          hbL3.layerId === layerTab &&
          (layerTab === 'taipei_l3' ||
            layerTab === 'taipei_l3_dp') &&
          (hbSidL3 != null && String(hbSidL3).trim() !== ''
            ? String(sidLine ?? '').trim() === String(hbSidL3).trim()
            : Math.abs(Number(gxLine) - Number(hbL3.x)) < coordEpsL3 &&
              Math.abs(Number(gyLine) - Number(hbL3.y)) < coordEpsL3);
        isHighlighted = isConnectHl || isH2ConnectHl;
        isOnOtherRoute = isHighlighted || isH2BlackHl || isL3ReductionBlackHl;
        radius = isHighlighted || isH2BlackHl || isL3ReductionBlackHl ? 5 : isConnect ? 2.5 : 1.5;
        strokeWidth = isHighlighted || isH2BlackHl || isL3ReductionBlackHl ? 2.5 : 1;
        strokeColor =
          isHighlighted || isH2BlackHl || isL3ReductionBlackHl
            ? isL3ReductionBlackHl &&
              hbL3?.color &&
              typeof hbL3.color === 'string' &&
              hbL3.color.trim() !== ''
              ? hbL3.color.trim()
              : hlStroke
            : '#ffffff'; // 白邊（與骨架點一致；非高亮時）
      }

      // 🎨「路線圖處理」示意圖佈局骨架：點用骨架分類色（黃交叉/紫切斷/紅 connect/藍 terminal/灰）+ 白色 1px border
      if (tags.node_class_color && typeof tags.node_class_color === 'string') {
        fillColor = tags.node_class_color;
        radius = Number(tags.node_class_r) || radius;
        strokeColor = '#ffffff';
        strokeWidth = 1;
      }

      const circleElement = zoomGroup
        .append('circle')
        .attr('cx', plotRemapSvgX(xScale(drawX)))
        .attr('cy', plotRemapSvgY(yScale(drawY)))
        .attr('r', radius)
        .attr('data-r0', isSchematicLayout ? radius : null)
        .attr('fill', fillColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .style('vector-effect', isSchematicLayout ? 'non-scaling-stroke' : null)
        .attr(
          'class',
          [
            isOnOtherRoute ? 'highlighted-connect-point' : '',
            isConnect ? 'rb-connect-dot' : '',
            'space-network-rb-station-dot',
          ]
            .filter(Boolean)
            .join(' ')
        )
        .style('cursor', 'pointer');

      const layoutEndpointNamesOn =
        isLayoutNetworkGridFromVhDrawLayerId(layerTab) &&
        activeTabLayer?.layoutVhDrawShowEndpointStationNames === true;
      // 紅／藍點：connect 站（紅/藍）或經緯度路段端點之 intersection（紅）／terminal（藍）
      const isRedBlueEndpoint =
        isConnect ||
        (mapLonLatEndpoints &&
          (endpointNormForHover === 'terminal' || endpointNormForHover === 'intersection'));
      // 路網網格_2 最短路徑放大：選取模式開啟時，紅/藍點可點選（已選者加橘色外環、點選切換）。
      if (
        isLayoutVhDrawSecondCopyLayerId(layerTab) &&
        activeTabLayer?.layoutVhDrawPathSelectMode === true &&
        isRedBlueEndpoint
      ) {
        const selArr = Array.isArray(dataStore.layoutVhDrawPathSel)
          ? dataStore.layoutVhDrawPathSel
          : [];
        const selIdx = selArr.findIndex(
          (p) => layoutVhDrawPathNodeKey(p.gx, p.gy) === layoutVhDrawPathNodeKey(drawX, drawY)
        );
        if (selIdx >= 0) {
          // 起點／終點放大、加橘色外環、移到最上層。
          const selR = Math.max(Number(radius) * 2.2, 7);
          circleElement.attr('r', selR).attr('stroke', '#e0651a').attr('stroke-width', 3).raise();
          // 顯示起／迄站名（強制顯示，與名稱開關無關）。
          let selName =
            props.station_name !== undefined ? props.station_name : tags.station_name;
          if (selName == null || String(selName).trim() === '') selName = tags.name;
          selName = selName != null ? String(selName).trim() : '';
          zoomGroup
            .append('text')
            .attr('class', 'space-network-rb-station-label')
            .attr('x', plotRemapSvgX(xScale(drawX)))
            .attr('y', plotRemapSvgY(yScale(drawY)) - selR - 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', '#e0651a')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.6)
            .attr('paint-order', 'stroke')
            .style('pointer-events', 'none')
            .text(`${selIdx === 0 ? '起點' : '終點'}${selName ? '：' + selName : ''}`)
            .raise();
        }
        circleElement.on('click', function (event) {
          event.stopPropagation();
          toggleLayoutVhDrawConnectSelection(drawX, drawY);
        });
      }
      const showRedBlueName =
        (dataStore.showStationNames && isConnect) || (layoutEndpointNamesOn && isRedBlueEndpoint);
      if (showRedBlueName) {
        let labelName = props.station_name !== undefined ? props.station_name : tags.station_name;
        if (labelName == null || String(labelName).trim() === '') {
          labelName = tags.name;
        }
        labelName = labelName != null ? String(labelName).trim() : '';
        if (labelName) {
          zoomGroup
            .append('text')
            .attr('class', 'space-network-rb-station-label')
            .attr('x', plotRemapSvgX(xScale(drawX)))
            .attr('y', plotRemapSvgY(yScale(drawY)) - radius - 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', dataStore.showStationNames && isConnect ? '11px' : '8px')
            .attr('font-weight', 'bold')
            .attr('fill', '#1a1a1a')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.35)
            .attr('paint-order', 'stroke')
            .style('pointer-events', 'none')
            .text(labelName);
        }
      } else if (dataStore.showBlackDotStationNames && !isConnect) {
        let labelName = props.station_name !== undefined ? props.station_name : tags.station_name;
        if (labelName == null || String(labelName).trim() === '') {
          labelName = tags.name;
        }
        labelName = labelName != null ? String(labelName).trim() : '';
        if (labelName) {
          zoomGroup
            .append('text')
            .attr('class', 'space-network-rb-station-label')
            .attr('x', plotRemapSvgX(xScale(drawX)))
            .attr('y', plotRemapSvgY(yScale(drawY)) - radius - 4)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'bottom')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#1a1a1a')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.35)
            .attr('paint-order', 'stroke')
            .style('pointer-events', 'none')
            .text(labelName);
        }
      }

      // 添加 hover 效果
      circleElement
        .on('mouseover', function (event) {
          if (mapLonLatEndpoints) {
            const hov = mapTabApproxHoverSvgForEndpoint(endpointNormForHover);
            d3.select(this)
              .attr('r', hov.r)
              .attr('stroke-width', hov.strokeW)
              .attr('fill', hov.fill)
              .attr('stroke', hov.stroke);
          } else {
            const highlightRadius = isConnect ? 4 : 3;
            d3.select(this).attr('r', highlightRadius).attr('stroke-width', 2);
          }

          // 顯示 tooltip（包含座標和標籤）
          /** 版面網格／座標正規化家族：站點 hover 與 MapTab popup 同欄位（含 type／route_name_list） */
          if (uniformGridRouteFamilyTab) {
            const jlStation = dataStore.findLayerById(layerTab);
            const jrStation =
              layoutUniformGridTooltipJr ??
              mapDrawnExportRowsFromJsonDrawRoot(jlStation?.jsonData, jlStation?.dataJson);
            const sidTip = String(props.station_id ?? tags.station_id ?? '').trim();
            const hasRnl =
              (Array.isArray(props.route_name_list) && props.route_name_list.length > 0) ||
              (Array.isArray(tags.route_name_list) && tags.route_name_list.length > 0);
            let propBagForStation = props;
            if (Array.isArray(jrStation) && jrStation.length > 0 && sidTip && !hasRnl) {
              const nameSet = new Set();
              const idMatches = (n) =>
                String(n?.station_id ?? n?.tags?.station_id ?? '').trim() === sidTip;
              for (const row of jrStation) {
                const sm = row?.segment;
                if (!sm) continue;
                const hitsMid = Array.isArray(sm.stations) && sm.stations.some(idMatches);
                if (idMatches(sm.start) || idMatches(sm.end) || hitsMid) {
                  const nm = String(row.routeName ?? '').trim();
                  if (nm) nameSet.add(nm);
                }
              }
              if (nameSet.size > 0) {
                propBagForStation = { ...props, route_name_list: [...nameSet] };
              }
            }
            const lonTip = Number.isFinite(segmentNodeLon(props))
              ? segmentNodeLon(props)
              : Number(x);
            const latTip = Number.isFinite(segmentNodeLat(props))
              ? segmentNodeLat(props)
              : Number(y);
            const tagForStationType = getGeoJsonFeatureTagProps(feature);
            const typeForTooltip = normalizeRouteSegmentEndpointType(
              props.type ?? tags.type ?? tagForStationType.type ?? endpointNormForHover
            );
            const tooltipContent = stationEndpointTooltipHtmlFromProps(
              propBagForStation,
              typeForTooltip,
              lonTip,
              latTip
            );
            tooltip
              .html(tooltipContent)
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
            return;
          }

          const gridGx =
            props.x_proj !== undefined && props.y_proj !== undefined
              ? Number(props.x_proj)
              : props.x_grid !== undefined
                ? Number(props.x_grid)
                : Number(x);
          const gridGy =
            props.y_proj !== undefined && props.y_proj !== undefined
              ? Number(props.y_proj)
              : props.y_grid !== undefined
                ? Number(props.y_grid)
                : Number(y);

          let coordinateHtml;
          if (taipeiCReducedOverlayDraw) {
            coordinateHtml = `<strong>縮減網格索引 (ix′, iy′):</strong> (${Math.round(gridGx)}, ${Math.round(gridGy)})`;
          } else if (props.x_proj !== undefined && props.y_proj !== undefined) {
            coordinateHtml = `<strong>座標:</strong> (${props.x_proj}, ${props.y_proj})`;
          } else if (props.x_grid !== undefined && props.y_grid !== undefined) {
            coordinateHtml = `<strong>座標:</strong> (${props.x_grid}, ${props.y_grid})`;
          } else {
            coordinateHtml = `<strong>座標:</strong> (${x}, ${y})`;
          }

          const spacingBlock = taipeiCReducedOverlayDraw
            ? minSpacingTooltipBlock(gridGx, gridGy, 'supplementOnly')
            : minSpacingTooltipBlock(gridGx, gridGy);
          let tooltipParts = [coordinateHtml + spacingBlock];

          if (mapLonLatEndpoints && isSpaceLayoutUniformGridViewerLayerId(layerTab)) {
            const layoutLyr = dataStore.findLayerById(layerTab);
            const gc = uniformGridCellFromLayoutMeta(
              layoutLyr?.layoutUniformGridMeta,
              Number(x),
              Number(y)
            );
            if (gc) {
              tooltipParts.push(
                `<strong>${gc.labelX}:</strong> ${gc.ix}<br><strong>${gc.labelY}:</strong> ${gc.iy}`
              );
            }
          }

          // 優先顯示 station_id 和 station_name（同時支援 props 直屬與 props.tags）
          const stationId = props.station_id !== undefined ? props.station_id : tags.station_id;
          const stationName =
            props.station_name !== undefined ? props.station_name : tags.station_name;
          if (stationId !== undefined) {
            tooltipParts.push(`<strong>站點ID:</strong> ${stationId}`);
          }
          if (stationName !== undefined) {
            tooltipParts.push(`<strong>站點名稱:</strong> ${stationName}`);
          }

          if (mapLonLatEndpoints) {
            tooltipParts.push(`<strong>節點類型:</strong> ${endpointNormForHover}`);
          }

          // 顯示 connect_number（如果存在，用紅色標示）
          if (props.connect_number !== undefined) {
            tooltipParts.push(
              `<strong style="color: #ff0000;">Connect #:</strong> <span style="color: #ff0000;">${props.connect_number}</span>`
            );
          }

          // 顯示 node_type
          if (props.node_type !== undefined) {
            tooltipParts.push(`<strong>節點類型:</strong> ${props.node_type}`);
          }

          const isPinkHoverNode =
            props.node_kind === 'right_angle_pink' ||
            tags.node_kind === 'right_angle_pink' ||
            String(props.node_class_color ?? tags.node_class_color ?? '').toLowerCase() === '#e377c2';
          const isMilpPinkLayer =
            layerTab === SCHEMATIC_MILP_READ_LAYER_ID || layerTab === SCHEMATIC_MILP_LAYER_ID;
          const dpLookupKey = (gx, gy) =>
            `${Number(gx).toFixed(6)},${Number(gy).toFixed(6)}`;
          const pinkGx = Number(props.x_grid ?? gridGx ?? drawX ?? x);
          const pinkGy = Number(props.y_grid ?? gridGy ?? drawY ?? y);
          let dpDetail = null;
          if (isPinkHoverNode && isMilpPinkLayer) {
            const screenAnchors = [];
            for (const f of stationFeatures) {
              if (!isScreenDpAnchorFeature(f)) continue;
              const fp = f.properties || {};
              const ft = fp.tags || {};
              const gx = Number(fp.x_grid ?? ft.x_grid ?? f.geometry?.coordinates?.[0]);
              const gy = Number(fp.y_grid ?? ft.y_grid ?? f.geometry?.coordinates?.[1]);
              if (Number.isFinite(gx) && Number.isFinite(gy)) screenAnchors.push([gx, gy]);
            }
            dpDetail = measurePinkDpFromScreenAnchors([pinkGx, pinkGy], screenAnchors);
            if (!dpDetail && flatSegments.length > 0) {
              const flatMap = buildPinkDpRatioDetailMap(flatSegments);
              dpDetail =
                flatMap.get(dpLookupKey(pinkGx, pinkGy)) ??
                flatMap.get(dpLookupKey(x, y)) ??
                flatMap.get(dpLookupKey(drawX, drawY));
            }
          } else if (livePinkDpDetail && isPinkHoverNode) {
            dpDetail =
              liveDpDetailAt(pinkGx, pinkGy) ?? liveDpDetailAt(x, y) ?? liveDpDetailAt(drawX, drawY);
          }
          if (dpDetail) {
            tooltipParts.push(
              `<strong style="color:#e377c2;">dp_ratio:</strong> ${Number(dpDetail.ratio).toFixed(4)}` +
                `<br><span style="color:#888;font-size:11px;">` +
                `垂距 ${Number(dpDetail.perpLen).toFixed(2)} ÷ 头尾 ${Number(dpDetail.chordLen).toFixed(2)}` +
                ` · 锚点 (${dpDetail.anchorA[0]},${dpDetail.anchorA[1]})→(${dpDetail.anchorB[0]},${dpDetail.anchorB[1]})` +
                `</span>`
            );
            drawPinkDpHoverOverlay(dpDetail);
          } else if (isPinkHoverNode && isMilpPinkLayer) {
            tooltipParts.push(
              `<strong style="color:#c62828;">dp_ratio:</strong> <span style="color:#c62828;">无法计算（折线上找不到相邻 RYB+P 锚点）</span>`
            );
            clearPinkDpHoverOverlay();
          }

          // 顯示其他 tags（dp_ratio 已於上方專列；MILP 層不顯示 tags 內舊 dp_ratio）
          const tagsHtml = Object.entries(tags)
            .filter(
              ([key]) =>
                !(dpDetail && key === 'dp_ratio') &&
                !(isMilpPinkLayer && isPinkHoverNode && key === 'dp_ratio')
            )
            .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
            .join('<br>');
          if (tagsHtml) {
            tooltipParts.push(tagsHtml);
          }

          const tooltipContent = tooltipParts.join('<br>');

          tooltip
            .html(tooltipContent)
            .style('opacity', 1)
            .style('left', event.pageX + 10 + 'px')
            .style('top', event.pageY - 10 + 'px');
        })
        .on('mousemove', function (event) {
          // 更新 tooltip 位置
          tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
        })
        .on('mouseout', function () {
          if (mapLonLatEndpoints) {
            d3.select(this)
              .attr('r', radius)
              .attr('stroke-width', strokeWidth)
              .attr('fill', fillColor)
              .attr('stroke', strokeColor);
          } else {
            d3.select(this).attr('r', radius).attr('stroke-width', 1);
          }

          // 隱藏 tooltip
          tooltip.style('opacity', 0);
          clearPinkDpHoverOverlay();
        });
    });

    // 🎯 車站配置：ConnectData(紅點) -> SectionData(黑點順序) -> StationData(完整站屬性)
    if (TAIPEI_TEST_SPACE_NETWORK_STATION_TAB_IDS.includes(layerTab)) {
      const stLayer = dataStore.findLayerById(layerTab);
      // taipei_h3／taipei_h3_dp：黑／紅／藍皆已由上方 stationFeatures 迴圈繪製，勿再由此區塊重畫
      if (
        stLayer?.showStationPlacement &&
        layerTab !== 'taipei_h3' &&
        layerTab !== 'taipei_h3_dp' &&
        !isTaipeiTest3I3OrJ3LayerTab(layerTab)
      ) {
        const connectData = stLayer.spaceNetworkGridJsonData_ConnectData;
        const sectionData = stLayer.spaceNetworkGridJsonData_SectionData;
        const stationData = stLayer.spaceNetworkGridJsonData_StationData;
        const rtData = stLayer.spaceNetworkGridJsonData;
        // taipei_g：預建完整站名查詢 ctx（含 SectionData connect_start/end 站名補查）
        const taipeiFLabelCtx =
          isTaipeiEfinalSpaceLayerTab(layerTab) &&
          Array.isArray(connectData) &&
          Array.isArray(sectionData)
            ? {
                connectNumberToNameId: buildConnectNumberToNameIdMap(connectData, sectionData),
                connectGridKeyToNameId: buildConnectGridKeyToNameIdMap(connectData, sectionData),
                sectionRouteGridNameIdMap: buildSectionRouteGridNameIdMap(sectionData),
                sectionGridKeyToNameIdMap: buildSectionGridKeyToNameIdMap(sectionData),
                blackLabelsByGrid: buildBlackStationDisplayByGrid(stationData),
                stationData,
                connectData,
              }
            : null;
        if (Array.isArray(connectData) && Array.isArray(sectionData) && Array.isArray(rtData)) {
          const flatSegs =
            rtData.length > 0 && rtData[0]?.segments && !rtData[0]?.points
              ? rtData.flatMap((r) =>
                  (r.segments || []).map((s) => ({
                    ...s,
                    route_name: s.route_name ?? r.route_name ?? r.name,
                    name: s.name ?? r.route_name ?? r.name,
                  }))
                )
              : rtData;

          const toNum = (v) => Number(v ?? 0);
          const getC = (p) =>
            Array.isArray(p) ? [toNum(p[0]), toNum(p[1])] : [toNum(p?.x), toNum(p?.y)];
          const pointKey = (x, y) => `${toNum(x)},${toNum(y)}`;
          const normalizeRouteKey = (arr) =>
            (Array.isArray(arr) ? arr : [])
              .map((r) => String(r ?? '').trim())
              .filter((r) => r !== '')
              .sort()
              .join('|');

          const stationLookup = new Map();
          if (Array.isArray(stationData)) {
            stationData.forEach((s) => {
              if (s.station_id) stationLookup.set(s.station_id, s);
            });
          }

          // 從當前路段端點建立「當前紅點」：座標 + 經過的路線名（route_list）
          const currentConnects = new Map();
          const endpointTypeRank = (t) => {
            const s = String(t ?? '')
              .trim()
              .toLowerCase();
            if (s === 'intersection') return 3;
            if (s === 'terminal') return 2;
            return 1;
          };
          flatSegs.forEach((seg) => {
            const routeName = seg.route_name ?? seg.name ?? 'Unknown';
            const pts = seg.points?.map(getC) || [];
            if (pts.length < 2) return;
            const segNodes = Array.isArray(seg.nodes) ? seg.nodes : [];
            const ends = [
              { pt: pts[0], node: segNodes[0] },
              { pt: pts[pts.length - 1], node: segNodes[segNodes.length - 1] },
            ];
            for (const { pt, node } of ends) {
              const k = pointKey(pt[0], pt[1]);
              if (!currentConnects.has(k)) {
                currentConnects.set(k, {
                  x: pt[0],
                  y: pt[1],
                  routeNames: new Set(),
                  nodeProps: null,
                });
              }
              const entry = currentConnects.get(k);
              entry.routeNames.add(routeName);
              // 保留 type 等級最高的端點 node（intersection > terminal > 其他）作為該格 connect 屬性，
              // 供反查不到 ConnectData 時直接依 node 自身 type 上色（例如終點站＝藍）。
              if (node && typeof node === 'object') {
                const prevRank = entry.nodeProps
                  ? endpointTypeRank(entry.nodeProps.type ?? entry.nodeProps.tags?.type)
                  : 0;
                if (endpointTypeRank(node.type ?? node.tags?.type) >= prevRank) {
                  entry.nodeProps = node;
                }
              }
            }
          });

          // 依 route_list 分組儲存的 ConnectData（同一 route_list 可能多筆，用座標接近度區分）
          const connectByRouteKey = new Map();
          connectData.forEach((cd) => {
            if (!cd) return;
            const rk = normalizeRouteKey(cd.route_list);
            if (!rk) return;
            if (!connectByRouteKey.has(rk)) connectByRouteKey.set(rk, []);
            connectByRouteKey.get(rk).push(cd);
          });

          const connectByNumber = new Map();
          const connectByCoord = new Map();
          connectData.forEach((c) => {
            if (!c) return;
            const cn = c.connect_number ?? c.tags?.connect_number;
            const cx = c.x_grid ?? c.tags?.x_grid;
            const cy = c.y_grid ?? c.tags?.y_grid;
            if (cn != null && !connectByNumber.has(cn)) connectByNumber.set(cn, c);
            if (cx != null && cy != null) {
              const pk = pointKey(cx, cy);
              if (!connectByCoord.has(pk)) connectByCoord.set(pk, c);
            }
          });
          const resolveConnect = (props, fallbackPoint) => {
            const cn = props?.connect_number ?? props?.tags?.connect_number;
            if (cn != null && connectByNumber.has(cn)) return connectByNumber.get(cn);
            const x = props?.x_grid ?? props?.tags?.x_grid ?? fallbackPoint?.[0];
            const y = props?.y_grid ?? props?.tags?.y_grid ?? fallbackPoint?.[1];
            if (x != null && y != null) return connectByCoord.get(pointKey(x, y)) || null;
            return null;
          };
          const connectId = (cd) => {
            if (!cd) return null;
            const cn = cd.connect_number ?? cd.tags?.connect_number;
            if (cn != null) return `cn:${cn}`;
            const cx = cd.x_grid ?? cd.tags?.x_grid;
            const cy = cd.y_grid ?? cd.tags?.y_grid;
            if (cx != null && cy != null) return `xy:${pointKey(cx, cy)}`;
            return null;
          };
          const pairKey = (a, b) => [a, b].sort().join(' <-> ');
          const sectionBuckets = new Map();
          sectionData.forEach((sd) => {
            if (!sd) return;
            const startCd = resolveConnect(sd.connect_start, null);
            const endCd = resolveConnect(sd.connect_end, null);
            const startCid = connectId(startCd);
            const endCid = connectId(endCd);
            const key = startCid && endCid ? pairKey(startCid, endCid) : null;
            if (key) {
              if (!sectionBuckets.has(key)) sectionBuckets.set(key, []);
              sectionBuckets.get(key).push(sd);
            }
          });

          const expectedBlackCount = sectionData.reduce((sum, sd) => {
            if (!sd) return sum;
            const connectSids = new Set();
            const startSid = (
              sd.connect_start?.station_id ??
              sd.connect_start?.tags?.station_id ??
              ''
            )
              .toString()
              .trim();
            const endSid = (sd.connect_end?.station_id ?? sd.connect_end?.tags?.station_id ?? '')
              .toString()
              .trim();
            if (startSid) connectSids.add(startSid);
            if (endSid) connectSids.add(endSid);
            const stList = (sd.station_list || []).filter(
              (s) => !s.station_id || !connectSids.has(String(s.station_id ?? '').trim())
            );
            return sum + stList.length;
          }, 0);

          const drawDot = (cx, cy, props, isConnect, isBlackHighlighted = false) => {
            // taipei_c／taipei_d／taipei_e：黑點改由專用區塊繪製（c＝弧長；d＝向心滑動；e＝d→e 縮減後 StationData）
            if (
              !isConnect &&
              (isTaipeiTestCDELayerTab(layerTab) || isTaipeiEfinalSpaceLayerTab(layerTab))
            )
              return;
            const mapped = reducedPlotMapper ? reducedPlotMapper(cx, cy) : [cx, cy];
            let [px, py] =
              isConnect && overlayForSnap && !reducedPlotMapper
                ? overlayCellCenter(cx, cy)
                : mapped;
            let fillColor = isConnect ? '#ff0000' : '#000000';
            if (isConnect) {
              const tagsDot = props.tags || {};
              if (connectBlueFromTaggedTerminal(props, tagsDot)) {
                fillColor = '#1565c0';
              } else {
                const gxD =
                  props.x_grid != null && Number.isFinite(Number(props.x_grid))
                    ? Number(props.x_grid)
                    : cx;
                const gyD =
                  props.y_grid != null && Number.isFinite(Number(props.y_grid))
                    ? Number(props.y_grid)
                    : cy;
                const [degX, degY] = reducedPlotMapper ? reducedPlotMapper(gxD, gyD) : [gxD, gyD];
                fillColor = taipeiTest3ConnectFill(true, degX, degY) ?? '#ff0000';
              }
            }
            const cnDot = props.connect_number ?? props.tags?.connect_number;
            const isH2Conn = isConnect && matchH2TrafficConnect(cnDot);
            const isHighlighted = isConnect
              ? (dataStore.highlightedConnectNumber != null &&
                  cnDot === dataStore.highlightedConnectNumber) ||
                isH2Conn
              : isBlackHighlighted;
            const r = isHighlighted ? 5 : isConnect ? 2.5 : 1.5;
            const strokeColor = isHighlighted ? '#ff6600' : '#ffffff'; // 白邊（與骨架點一致）
            const strokeWidth = isHighlighted ? 2.5 : 1;
            const el = zoomGroup
              .append('circle')
              .attr('cx', plotRemapSvgX(xScale(px)))
              .attr('cy', plotRemapSvgY(yScale(py)))
              .attr('r', r)
              .attr('fill', fillColor)
              .attr('stroke', strokeColor)
              .attr('stroke-width', strokeWidth)
              .attr(
                'class',
                [isHighlighted ? 'highlighted-connect-point' : '', 'space-network-rb-station-dot']
                  .filter(Boolean)
                  .join(' ')
              )
              .style('cursor', 'pointer');
            if (dataStore.showStationNames && isConnect) {
              let sname = (props.station_name ?? props.tags?.station_name ?? props.tags?.name ?? '')
                .toString()
                .trim();
              if (isTaipeiEfinalSpaceLayerTab(layerTab) && taipeiFLabelCtx) {
                const filled = resolveTaipeiFStationNameAndId(props, taipeiFLabelCtx);
                if (!sname) sname = (filled.station_name ?? '').toString().trim();
              }
              if (sname) {
                zoomGroup
                  .append('text')
                  .attr('class', 'space-network-rb-station-label')
                  .attr('x', plotRemapSvgX(xScale(px)))
                  .attr('y', plotRemapSvgY(yScale(py)) - r - 4)
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'bottom')
                  .attr('font-size', '11px')
                  .attr('font-weight', 'bold')
                  .attr('fill', '#1a1a1a')
                  .attr('stroke', '#ffffff')
                  .attr('stroke-width', 0.35)
                  .attr('paint-order', 'stroke')
                  .style('pointer-events', 'none')
                  .text(sname);
              }
            } else if (dataStore.showBlackDotStationNames && !isConnect) {
              let sname = (props.station_name ?? props.tags?.station_name ?? props.tags?.name ?? '')
                .toString()
                .trim();
              if (isTaipeiEfinalSpaceLayerTab(layerTab) && taipeiFLabelCtx) {
                const filled = resolveTaipeiFStationNameAndId(props, taipeiFLabelCtx);
                if (!sname) sname = (filled.station_name ?? '').toString().trim();
              }
              if (sname) {
                zoomGroup
                  .append('text')
                  .attr('class', 'space-network-rb-station-label')
                  .attr('x', plotRemapSvgX(xScale(px)))
                  .attr('y', plotRemapSvgY(yScale(py)) - r - 4)
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'bottom')
                  .attr('font-size', '10px')
                  .attr('font-weight', 'bold')
                  .attr('fill', '#1a1a1a')
                  .attr('stroke', '#ffffff')
                  .attr('stroke-width', 0.35)
                  .attr('paint-order', 'stroke')
                  .style('pointer-events', 'none')
                  .text(sname);
              }
            }
            el.on('mouseover', function (event) {
              d3.select(this)
                .attr('r', isConnect ? 4 : 3)
                .attr('stroke-width', 2);
              const dispX = cx;
              const dispY = cy;
              const dispFmt = (v) =>
                typeof v === 'number' && v.toFixed
                  ? taipeiCReducedOverlayDraw
                    ? String(Math.round(v))
                    : useSchematicCellCenterGrid
                      ? String(Math.round(Number(v)))
                      : v.toFixed(2)
                  : v;
              const coordLine = taipeiCReducedOverlayDraw
                ? `<strong>縮減網格索引 (ix′, iy′):</strong> (${dispFmt(dispX)}, ${dispFmt(dispY)})${minSpacingTooltipBlock(Number(dispX), Number(dispY), 'supplementOnly')}`
                : `<strong>座標:</strong> (${dispFmt(dispX)}, ${dispFmt(dispY)})${minSpacingTooltipBlock(Number(dispX), Number(dispY))}`;
              const parts = [coordLine];
              let sid = (props.station_id ?? props.tags?.station_id ?? '').toString().trim();
              let sname = (
                props.station_name ??
                props.tags?.station_name ??
                props.tags?.name ??
                ''
              ).trim();
              // taipei_g：紅點僅依 ConnectData／SectionData 對照（見 resolveTaipeiFStationNameAndId）
              if (isTaipeiEfinalSpaceLayerTab(layerTab) && taipeiFLabelCtx) {
                const filled = resolveTaipeiFStationNameAndId(props, taipeiFLabelCtx);
                if (!sname) sname = filled.station_name;
                if (!sid) sid = filled.station_id;
              }
              if (sid !== undefined && sid !== '') parts.push(`<strong>站點ID:</strong> ${sid}`);
              if (sname !== undefined && sname !== '')
                parts.push(`<strong>站點名稱:</strong> ${sname}`);
              if (props.connect_number != null)
                parts.push(
                  `<strong style="color:#ff0000;">Connect #:</strong> <span style="color:#ff0000;">${props.connect_number}</span>`
                );
              parts.push(`<strong>節點類型:</strong> ${isConnect ? 'connect' : 'line (station)'}`);
              const tags = props.tags || {};
              const skipTagKeys =
                isTaipeiEfinalSpaceLayerTab(layerTab) && isConnect
                  ? new Set(['station_name', 'station_id', 'name', 'x_grid', 'y_grid'])
                  : null;
              const tagsHtml = Object.entries(tags)
                .filter(([k]) => !skipTagKeys?.has(k))
                .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
                .join('<br>');
              if (tagsHtml) parts.push(tagsHtml);
              tooltip
                .html(parts.join('<br>'))
                .style('opacity', 1)
                .style('left', event.pageX + 10 + 'px')
                .style('top', event.pageY - 10 + 'px');
            })
              .on('mousemove', function (event) {
                tooltip
                  .style('left', event.pageX + 10 + 'px')
                  .style('top', event.pageY - 10 + 'px');
              })
              .on('mouseout', function () {
                d3.select(this).attr('r', r).attr('stroke-width', strokeWidth);
                tooltip.style('opacity', 0);
              });
          };

          // 1) 紅點：畫在「當前路段端點」位置，用 route_list 對應儲存的 ConnectData 屬性；同 route_list 多筆時以座標接近度配對
          const usedConnectData = new Set();
          const endpointConnectMap = new Map();
          currentConnects.forEach(({ x, y, routeNames, nodeProps }) => {
            // taipei_g：同格僅單一路線為黑點（StationData），多路線才畫紅點
            if (isTaipeiEfinalSpaceLayerTab(layerTab) && routeNames.size < 2) return;
            const rk = normalizeRouteKey([...routeNames]);
            const storedList = (rk && connectByRouteKey.get(rk)) || [];
            let chosen = null;
            if (storedList.length === 1) {
              chosen = storedList[0];
            } else if (storedList.length > 1) {
              let bestDist = Infinity;
              for (const cd of storedList) {
                if (usedConnectData.has(cd)) continue;
                const sx = toNum(cd?.x_grid ?? cd?.tags?.x_grid ?? 0);
                const sy = toNum(cd?.y_grid ?? cd?.tags?.y_grid ?? 0);
                const d = (x - sx) ** 2 + (y - sy) ** 2;
                if (d < bestDist) {
                  bestDist = d;
                  chosen = cd;
                }
              }
            }
            if (chosen) usedConnectData.add(chosen);
            endpointConnectMap.set(pointKey(x, y), chosen);
            // 反查不到 ConnectData（或反查結果無 type）時，改用該格端點 node 自身屬性上色，
            // 才能讓終點站正確畫成藍點（例如「松山」終點與別線中途站同格時仍正確）。
            const chosenHasType = chosen && (chosen.type ?? chosen.tags?.type);
            const drawProps = chosenHasType ? chosen : nodeProps || chosen || {};
            drawDot(x, y, drawProps, true);
          });

          // 2) 黑點：每筆 SectionData 對應一個 segment（兩紅點之間）；以 connectId 雙端鍵 + route_name 配對，僅在該段內弧長均分
          const segmentPoly = (seg) => (seg.points || []).map(getC);
          const placeBlackAlongPoly = (poly, stList) => {
            if (stList.length === 0 || poly.length < 2) return 0;
            let totalLen = 0;
            const pathSegs = [];
            for (let i = 0; i < poly.length - 1; i++) {
              const dx = poly[i + 1][0] - poly[i][0];
              const dy = poly[i + 1][1] - poly[i][1];
              const len = Math.hypot(dx, dy);
              totalLen += len;
              pathSegs.push({ len, p1: poly[i], p2: poly[i + 1] });
            }
            if (totalLen <= 0) return 0;
            const step = totalLen / (stList.length + 1);
            for (let si = 0; si < stList.length; si++) {
              const target = step * (si + 1);
              let covered = 0;
              for (const ps of pathSegs) {
                if (covered + ps.len >= target) {
                  const ratio = (target - covered) / ps.len;
                  const sx = ps.p1[0] + (ps.p2[0] - ps.p1[0]) * ratio;
                  const sy = ps.p1[1] + (ps.p2[1] - ps.p1[1]) * ratio;
                  const fullProps = stationLookup.get(stList[si].station_id) || stList[si];
                  const hb = dataStore.highlightedBlackStation;
                  const coordEps = 0.08;
                  const gxb = Number(fullProps.x_grid ?? fullProps.tags?.x_grid ?? sx);
                  const gyb = Number(fullProps.y_grid ?? fullProps.tags?.y_grid ?? sy);
                  const sidB =
                    fullProps.station_id ?? fullProps.tags?.station_id ?? stList[si].station_id;
                  const isBlackHighlighted =
                    (hb &&
                      layerTab === hb.layerId &&
                      Math.abs(Number(sx) - Number(hb.x)) < coordEps &&
                      Math.abs(Number(sy) - Number(hb.y)) < coordEps) ||
                    matchH2TrafficBlack(gxb, gyb, sidB);
                  // 該格已是 connect（紅/藍）時不疊黑點，否則別線的中途站黑點會蓋住終點藍點
                  // （例：松山終點與文湖線中途站「南港軟體園區」同格 (34,36)）。
                  if (!currentConnects.has(pointKey(sx, sy))) {
                    drawDot(sx, sy, fullProps, false, isBlackHighlighted);
                  }
                  break;
                }
                covered += ps.len;
              }
            }
            return stList.length;
          };

          const usedSection = new Set();
          const unmatchedSegments = [];
          let actualBlackCount = 0;

          // taipei_g：切段後黑點改由 StationData（與 rebuildTaipeiFStationConnectAfterSplit 一致），
          // 不再用 Section 弧長配對（端點紅／黑語意已變）。
          if (!isTaipeiEfinalSpaceLayerTab(layerTab)) {
            flatSegs.forEach((seg) => {
              if (!seg?.points || seg.points.length < 2) return;
              const pts = seg.points.map(getC);
              const startK = pointKey(pts[0][0], pts[0][1]);
              const endK = pointKey(pts[pts.length - 1][0], pts[pts.length - 1][1]);
              const segRoute = seg.route_name ?? seg.name ?? 'Unknown';
              const startCd = endpointConnectMap.get(startK);
              const endCd = endpointConnectMap.get(endK);
              const startCid = connectId(startCd);
              const endCid = connectId(endCd);
              const key = startCid && endCid ? pairKey(startCid, endCid) : null;
              const info = { routeName: segRoute, startPt: pts[0], endPt: pts[pts.length - 1] };

              if (!key) {
                unmatchedSegments.push({
                  ...info,
                  reason: !startCd
                    ? '起點未配對到 ConnectData'
                    : !endCd
                      ? '終點未配對到 ConnectData'
                      : !startCid
                        ? '起點 ConnectData 無 connect_number / x_grid,y_grid'
                        : '終點 ConnectData 無 connect_number / x_grid,y_grid',
                });
                return;
              }
              const candidates = sectionBuckets.get(key) || [];
              const avail = candidates.filter((sd) => !usedSection.has(sd));
              const byRoute = avail.filter((sd) => (sd.route_name ?? '').trim() === segRoute);
              // 嚴格依 route_name 配對：同名路段的 section 優先；否則只接受「無 route_name」的未指派 section。
              // 絕不把「別條路線（不同 route_name）」的 section 當成自己的 —— 即使兩線座標重疊、落在同一 bucket，
              // 不相關的兩站仍各自獨立，不可互相借用車站。
              const matched =
                byRoute.length >= 1
                  ? byRoute[0]
                  : avail.find((sd) => !(sd.route_name ?? '').trim()) || null;
              if (!matched) {
                unmatchedSegments.push({
                  ...info,
                  key,
                  reason:
                    avail.length === 0
                      ? candidates.length > 0
                        ? '該路段鍵的 SectionData 已全部被其他 segment 使用'
                        : `bucket 不存在 (key: ${key})`
                      : `同鍵多筆且無法依 route_name「${segRoute}」唯一對應`,
                });
                return;
              }
              usedSection.add(matched);

              const connectSids = new Set();
              if (matched.connect_start?.station_id)
                connectSids.add(matched.connect_start.station_id);
              if (matched.connect_end?.station_id) connectSids.add(matched.connect_end.station_id);
              const stList = (matched.station_list || []).filter(
                (s) => !s.station_id || !connectSids.has(s.station_id)
              );
              if (stList.length === 0) {
                unmatchedSegments.push({
                  ...info,
                  reason: '已配對 SectionData，但 station_list 過濾後為空',
                });
                return;
              }
              // 依 connect_start / connect_end 確保 poly 方向與 station_list 一致，避免黑點畫反
              const sdStartCd = resolveConnect(matched.connect_start, null);
              const sdEndCd = resolveConnect(matched.connect_end, null);
              let poly = segmentPoly(seg);
              if (
                sdStartCd &&
                sdEndCd &&
                connectId(startCd) === connectId(sdEndCd) &&
                connectId(endCd) === connectId(sdStartCd)
              ) {
                poly = [...poly].reverse();
              }
              actualBlackCount += placeBlackAlongPoly(poly, stList);
            });

            const unusedSections = sectionData.filter((sd) => !usedSection.has(sd));
            if (unusedSections.length > 0) {
              console.warn(
                `[車站配置] ⚠️ 有 ${unusedSections.length} 筆 SectionData 未被任何畫面上的 segment 使用（常見於 reconfigure 切段後 segment 數與儲存時不同，請再按「儲存車站資訊」）`,
                unusedSections.map((s) => ({
                  route_name: s.route_name,
                  nStations: (s.station_list || []).length,
                }))
              );
            }
            if (unmatchedSegments.length > 0) {
              console.warn(
                `[車站配置] ⚠️ ${unmatchedSegments.length} 個畫面上的 segment 無法配對 SectionData：`,
                unmatchedSegments
              );
            }
            if (!isTaipeiTestCLayerTab(layerTab) && expectedBlackCount !== actualBlackCount) {
              console.error(
                `[車站配置] 🚨 重大 bug：原始黑點數 ${expectedBlackCount} 與重新配置後黑點數 ${actualBlackCount} 不符`,
                {
                  expectedBlackCount,
                  actualBlackCount,
                  unmatchedCount: unmatchedSegments.length,
                  unusedSectionCount: unusedSections.length,
                }
              );
            }
          }
        }
      }
    }

    // taipei_c／c2：黑點沿路段弧長位置繪製（與 JSON StationData 座標同源，100% 在路線上）
    if (isTaipeiTestCLayerTab(layerTab)) {
      const stLayerC = dataStore.findLayerById(layerTab);
      if (stLayerC && Array.isArray(stLayerC.spaceNetworkGridJsonData)) {
        const rawPl = collectStationPlacementPoints(stLayerC).filter((p) => p.kind === 'station');
        const seenBlack = new Set();
        for (const p of rawPl) {
          const id = p.meta?.station_id ?? p.meta?.tags?.station_id;
          const dedupeKey =
            id != null && String(id).trim() !== ''
              ? `id:${String(id).trim()}`
              : `pos:${String(p.name ?? '')}|${Number(p.x).toFixed(5)},${Number(p.y).toFixed(5)}`;
          if (seenBlack.has(dedupeKey)) continue;
          seenBlack.add(dedupeKey);
          const x = Number(p.x);
          const y = Number(p.y);
          const [px, py] = reducedPlotMapper ? reducedPlotMapper(x, y) : [x, y];

          const hb = dataStore.highlightedBlackStation;
          const coordEps = 0.08;
          const props = p.meta || {};
          const tags = props.tags || {};
          const sid = props.station_id ?? tags.station_id;
          const hbSid = hb?.stationId;
          const isBlackHighlighted =
            hb &&
            hb.layerId === layerTab &&
            (hbSid != null && String(hbSid).trim() !== ''
              ? String(sid ?? '').trim() === String(hbSid).trim()
              : Math.abs(Number(x) - Number(hb.x)) < coordEps &&
                Math.abs(Number(y) - Number(hb.y)) < coordEps);
          const radius = isBlackHighlighted ? 5 : 1.5;
          const strokeWidth = isBlackHighlighted ? 2.5 : 1;
          const fillColor = '#000000';
          const strokeColor = isBlackHighlighted ? '#ff6600' : '#ffffff'; // 白邊（與骨架點一致）

          const el = zoomGroup
            .append('circle')
            .attr('cx', xScale(px))
            .attr('cy', yScale(py))
            .attr('r', radius)
            .attr('fill', fillColor)
            .attr('stroke', strokeColor)
            .attr('stroke-width', strokeWidth)
            .attr('class', isBlackHighlighted ? 'highlighted-connect-point' : '')
            .style('cursor', 'pointer');

          if (dataStore.showBlackDotStationNames) {
            let arcLabel = (props.station_name ?? tags.station_name ?? tags.name ?? '')
              .toString()
              .trim();
            if (arcLabel) {
              zoomGroup
                .append('text')
                .attr('x', xScale(px))
                .attr('y', yScale(py) - radius - 4)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'bottom')
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', '#1a1a1a')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 0.35)
                .attr('paint-order', 'stroke')
                .style('pointer-events', 'none')
                .text(arcLabel);
            }
          }

          el.on('mouseover', function (event) {
            d3.select(this)
              .attr('r', isBlackHighlighted ? 5 : 3)
              .attr('stroke-width', 2);
            const dispFmt = (v) =>
              typeof v === 'number' && v.toFixed
                ? taipeiCReducedOverlayDraw
                  ? String(Math.round(v))
                  : v.toFixed(2)
                : v;
            const parts = [`<strong>座標（刪減後）:</strong> (${dispFmt(x)}, ${dispFmt(y)})`];
            const sname = props.station_name ?? tags.station_name;
            if (sid !== undefined && sid !== '') parts.push(`<strong>站點ID:</strong> ${sid}`);
            if (sname !== undefined && sname !== '')
              parts.push(`<strong>站點名稱:</strong> ${sname}`);
            parts.push(`<strong>來源:</strong> 路段弧長（與 StationData 座標同源）`);
            tooltip
              .html(parts.join('<br>'))
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
          })
            .on('mousemove', function (event) {
              tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              d3.select(this).attr('r', radius).attr('stroke-width', strokeWidth);
              tooltip.style('opacity', 0);
            });
        }
      }
    }

    // taipei_e／e2／taipei_f／taipei_g：黑點以 StationData 座標繪製（d→e 縮減後；f／g 層載入 e_final JSON 與 e 同源）
    if (isTaipeiTestELayerTab(layerTab) || isTaipeiEfinalSpaceLayerTab(layerTab)) {
      const stLayerE = dataStore.findLayerById(layerTab);
      if (
        stLayerE?.showStationPlacement &&
        Array.isArray(stLayerE.spaceNetworkGridJsonData_StationData)
      ) {
        // taipei_g：預建站名查詢 ctx 供黑點 tooltip 補查
        const _stationDataE = stLayerE.spaceNetworkGridJsonData_StationData;
        const _connectDataE = stLayerE.spaceNetworkGridJsonData_ConnectData || [];
        const _sectionDataE = stLayerE.spaceNetworkGridJsonData_SectionData || [];
        const taipeiFBlackCtx = isTaipeiEfinalSpaceLayerTab(layerTab)
          ? {
              connectNumberToNameId: buildConnectNumberToNameIdMap(_connectDataE, _sectionDataE),
              connectGridKeyToNameId: buildConnectGridKeyToNameIdMap(_connectDataE, _sectionDataE),
              sectionRouteGridNameIdMap: buildSectionRouteGridNameIdMap(_sectionDataE),
              sectionGridKeyToNameIdMap: buildSectionGridKeyToNameIdMap(_sectionDataE),
              blackLabelsByGrid: buildBlackStationDisplayByGrid(_stationDataE),
              stationData: _stationDataE,
              connectData: _connectDataE,
            }
          : null;

        const rows = collectLineStationGridPointsFromStationData(
          stLayerE.spaceNetworkGridJsonData_StationData
        );
        // taipei_f 灰底：即「紅點間路段」SectionData 清單內、Control 向心／SectionData-only 位移會處理的黑點。
        // station_list 身分鍵 ∪ 列入路段最短路徑格（與 layer 滑動邏輯同源；含無 id／站名之端點格）。
        layerStationsTowardSchematicCenter.ensureTaipeiFListedGrayHighlightSnapshot(stLayerE);
        const taipeiFListedGrayCtx = isTaipeiTestFLayerTab(layerTab)
          ? {
              stationKeySet:
                Array.isArray(_sectionDataE) && _sectionDataE.length > 0
                  ? (stLayerE._taipeiFListedGrayStationKeySet ??
                    layerStationsTowardSchematicCenter.buildListedSectionStationKeySet(
                      _sectionDataE,
                      stLayerE
                    ))
                  : null,
              routeCellKeySet:
                stLayerE._taipeiFListedGrayRouteCellKeySet ??
                buildListedSectionRouteGridCellKeySet(stLayerE),
            }
          : null;
        for (const row of rows) {
          const x = Number(row.x);
          const y = Number(row.y);
          // 與 drawRoutePath／drawDot 一致：taipei_g 時站點在格線交點 (ix, iy)
          let px;
          let py;
          if (reducedPlotMapper) {
            [px, py] = reducedPlotMapper(x, y);
          } else {
            px = x;
            py = y;
          }

          const gridKeyXY = `${Math.round(Number(x))},${Math.round(Number(y))}`;
          const isListedSectionStationGray =
            taipeiFListedGrayCtx != null &&
            ((taipeiFListedGrayCtx.stationKeySet &&
              layerStationsTowardSchematicCenter.isLineStationRowOnListedSectionKeySet(
                row,
                taipeiFListedGrayCtx.stationKeySet
              )) ||
              (taipeiFListedGrayCtx.routeCellKeySet &&
                taipeiFListedGrayCtx.routeCellKeySet.has(gridKeyXY)));

          const hb = dataStore.highlightedBlackStation;
          const coordEps = 0.08;
          const props = row.meta || {};
          const tags = props.tags || {};
          const sid = props.station_id ?? tags.station_id;
          const hbSid = hb?.stationId;
          const isBlackHighlighted =
            (hb &&
              hb.layerId === layerTab &&
              (hbSid != null && String(hbSid).trim() !== ''
                ? String(sid ?? '').trim() === String(hbSid).trim()
                : Math.abs(Number(x) - Number(hb.x)) < coordEps &&
                  Math.abs(Number(y) - Number(hb.y)) < coordEps)) ||
            matchH2TrafficBlack(x, y, sid);
          const radius = isBlackHighlighted ? 5 : 1.5;
          const strokeWidth = isBlackHighlighted ? 2.5 : 1;
          const fillColor = '#000000';
          const hlColor =
            isBlackHighlighted && hb?.color && typeof hb.color === 'string' ? hb.color : '#ff6600';
          const strokeColor = isBlackHighlighted ? hlColor : '#ffffff'; // 白邊（與骨架點一致）

          if (isListedSectionStationGray) {
            zoomGroup
              .append('circle')
              .attr('cx', xScale(px))
              .attr('cy', yScale(py))
              .attr('r', 4.5)
              .attr('fill', '#9e9e9e')
              .attr('opacity', 0.5)
              .style('pointer-events', 'none');
          }

          const el = zoomGroup
            .append('circle')
            .attr('cx', xScale(px))
            .attr('cy', yScale(py))
            .attr('r', radius)
            .attr('fill', fillColor)
            .attr('stroke', strokeColor)
            .attr('stroke-width', strokeWidth)
            .attr('class', isBlackHighlighted ? 'highlighted-connect-point' : '')
            .style('cursor', 'pointer');

          if (dataStore.showBlackDotStationNames) {
            let snameLabel = (props.station_name ?? tags.station_name ?? tags.name ?? '')
              .toString()
              .trim();
            if (isTaipeiEfinalSpaceLayerTab(layerTab) && taipeiFBlackCtx) {
              const routeHintForRes = String(tags.route_hint ?? props.route_hint ?? '').trim();
              const filled = resolveTaipeiFStationNameAndId(props, {
                ...taipeiFBlackCtx,
                routeName: routeHintForRes,
              });
              if (!snameLabel) snameLabel = (filled.station_name ?? '').toString().trim();
            }
            if (snameLabel) {
              zoomGroup
                .append('text')
                .attr('x', xScale(px))
                .attr('y', yScale(py) - radius - 4)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'bottom')
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', '#1a1a1a')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 0.35)
                .attr('paint-order', 'stroke')
                .style('pointer-events', 'none')
                .text(snameLabel);
            }
          }

          el.on('mouseover', function (event) {
            d3.select(this)
              .attr('r', isBlackHighlighted ? 5 : 3)
              .attr('stroke-width', 2);
            const dispFmt = (v) => (typeof v === 'number' && v.toFixed ? String(Math.round(v)) : v);
            const parts = [
              `<strong>座標（縮減後 ix′, iy′）:</strong> (${dispFmt(x)}, ${dispFmt(y)})`,
            ];
            let snameBlack = (props.station_name ?? tags.station_name ?? tags.name ?? '').trim();
            let sidBlack = (sid ?? '').toString().trim();
            // taipei_g：同時補齊站名與站點ID（含 Section 全格點表、tags.route_hint 路線）
            if (isTaipeiEfinalSpaceLayerTab(layerTab) && taipeiFBlackCtx) {
              const routeHint = String(tags.route_hint ?? '').trim();
              const filled = resolveTaipeiFStationNameAndId(props, {
                ...taipeiFBlackCtx,
                routeName: routeHint,
              });
              if (!snameBlack) snameBlack = filled.station_name;
              if (!sidBlack) sidBlack = filled.station_id;
            }
            if (sidBlack !== undefined && sidBlack !== '')
              parts.push(`<strong>站點ID:</strong> ${sidBlack}`);
            if (snameBlack !== undefined && snameBlack !== '')
              parts.push(`<strong>站名:</strong> ${snameBlack}`);
            parts.push(
              `<strong>來源:</strong> StationData（d→e 縮減網格後${
                isTaipeiTestFLayerTab(layerTab)
                  ? '；f 與 e 下載 JSON 同源'
                  : isTaipeiTestILayerTab(layerTab)
                    ? '；i 路網上顯示權重（無權重網格縮放）'
                    : isTaipeiGOrHWeightLayer(layerTab)
                      ? '；g／h 與 e 下載 JSON 同源'
                      : ''
              }）`
            );
            tooltip
              .html(parts.join('<br>'))
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
          })
            .on('mousemove', function (event) {
              tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              d3.select(this).attr('r', radius).attr('stroke-width', strokeWidth);
              tooltip.style('opacity', 0);
            });
        }
      }
    }

    // taipei_d／d2：黑點以 StationData 座標繪製（execute_c_to_d_test 向心滑動結果）
    if (isTaipeiTestDLayerTab(layerTab)) {
      const stLayerD = dataStore.findLayerById(layerTab);
      if (stLayerD && Array.isArray(stLayerD.spaceNetworkGridJsonData_StationData)) {
        const rows = collectLineStationGridPointsFromStationData(
          stLayerD.spaceNetworkGridJsonData_StationData
        );
        for (const row of rows) {
          const x = Number(row.x);
          const y = Number(row.y);
          const [px, py] = reducedPlotMapper ? reducedPlotMapper(x, y) : [x, y];

          const hb = dataStore.highlightedBlackStation;
          const coordEps = 0.08;
          const props = row.meta || {};
          const tags = props.tags || {};
          const sid = props.station_id ?? tags.station_id;
          const hbSid = hb?.stationId;
          const isBlackHighlighted =
            hb &&
            hb.layerId === layerTab &&
            (hbSid != null && String(hbSid).trim() !== ''
              ? String(sid ?? '').trim() === String(hbSid).trim()
              : Math.abs(Number(x) - Number(hb.x)) < coordEps &&
                Math.abs(Number(y) - Number(hb.y)) < coordEps);
          const radius = isBlackHighlighted ? 5 : 1.5;
          const strokeWidth = isBlackHighlighted ? 2.5 : 1;
          const fillColor = '#000000';
          const strokeColor = isBlackHighlighted ? '#ff6600' : '#ffffff'; // 白邊（與骨架點一致）

          const el = zoomGroup
            .append('circle')
            .attr('cx', xScale(px))
            .attr('cy', yScale(py))
            .attr('r', radius)
            .attr('fill', fillColor)
            .attr('stroke', strokeColor)
            .attr('stroke-width', strokeWidth)
            .attr('class', isBlackHighlighted ? 'highlighted-connect-point' : '')
            .style('cursor', 'pointer');

          el.on('mouseover', function (event) {
            d3.select(this)
              .attr('r', isBlackHighlighted ? 5 : 3)
              .attr('stroke-width', 2);
            const dispFmt = (v) =>
              typeof v === 'number' && v.toFixed
                ? taipeiCReducedOverlayDraw
                  ? String(Math.round(v))
                  : v.toFixed(2)
                : v;
            const parts = [`<strong>座標（刪減後）:</strong> (${dispFmt(x)}, ${dispFmt(y)})`];
            const sname = props.station_name ?? tags.station_name;
            if (sid !== undefined && sid !== '') parts.push(`<strong>站點ID:</strong> ${sid}`);
            if (sname !== undefined && sname !== '') parts.push(`<strong>站名:</strong> ${sname}`);
            parts.push(`<strong>來源:</strong> StationData（d 網格向心正規化）`);
            tooltip
              .html(parts.join('<br>'))
              .style('opacity', 1)
              .style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY - 10 + 'px');
          })
            .on('mousemove', function (event) {
              tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 10 + 'px');
            })
            .on('mouseout', function () {
              d3.select(this).attr('r', radius).attr('stroke-width', strokeWidth);
              tooltip.style('opacity', 0);
            });
        }
      }
    }

    // 🎯 繪製路段高亮覆蓋層（taipei_a：串接Flip L 型，依 hvFlipNextIndex 選中）
    if (isNormalizeFormat) {
      const activeLayer = dataStore.findLayerById(layerTab);
      const routesData = activeLayer?.spaceNetworkGridJsonData;
      let layoutData = Array.isArray(routesData) ? routesData : [];
      if (layoutData.length > 0 && layoutData[0]?.segments && !layoutData[0]?.points) {
        layoutData = layoutData.flatMap((r) =>
          (r.segments || []).map((s) => ({ ...s, name: r.route_name || r.name || 'Unknown' }))
        );
      }
      const straightSegments = buildStraightSegments(layoutData);
      const totalL = Math.max(0, (straightSegments?.length ?? 0) - 1);

      let segStartIdx = null;
      if (
        isTaipeiTestStraighteningLayerId(activeLayer?.layerId) &&
        totalL > 0 &&
        dataStore.connectFlipOverlayVisible
      ) {
        segStartIdx = dataStore.hvFlipNextIndex % totalL;
      }

      if (segStartIdx !== null && segStartIdx !== undefined && segStartIdx >= 0) {
        const seg = straightSegments[segStartIdx];
        const segNext = straightSegments[segStartIdx + 1];
        const EPS = 1e-4;
        const samePoint = (a, b) =>
          a && b && Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
        const isConnected =
          seg &&
          segNext &&
          seg.points?.length >= 2 &&
          segNext.points?.length >= 2 &&
          samePoint(seg.points[1], segNext.points[0]);
        const lShapePoints = isConnected ? [seg.points[0], seg.points[1], segNext.points[1]] : null;
        if (lShapePoints && lShapePoints.length >= 3) {
          // 選中的 L 型路線：高亮（金黃實線）
          const pathData = lineGenerator(lShapePoints);
          if (pathData) {
            zoomGroup
              .append('path')
              .attr('class', 'highlight-segment-overlay')
              .attr('d', pathData)
              .attr('stroke', '#FFD700')
              .attr('fill', 'none')
              .attr('stroke-width', '10pt')
              .attr('opacity', 0.55)
              .style('pointer-events', 'none');
          }
          // Flip 路線：可行＝綠虛線，不可行＝紅虛線（串接Flip L型 用放寬規則）
          const [a, b, c] = lShapePoints;
          const d = [a[0] + c[0] - b[0], a[1] + c[1] - b[1]];
          const connectFlipOptions = {
            skipConnectMove: true,
            skipCrossing: true,
            useRectangleOtherRouteCheck: true,
          };
          const { flipColor } = computeFlipAnalysis(
            straightSegments,
            segStartIdx,
            layoutData,
            connectFlipOptions
          );
          const flipPathData = lineGenerator([a, d, c]);
          if (flipPathData) {
            zoomGroup
              .append('path')
              .attr('class', 'highlight-flip-overlay')
              .attr('d', flipPathData)
              .attr('stroke', flipColor)
              .attr('fill', 'none')
              .attr('stroke-width', '6pt')
              .attr('stroke-dasharray', '8,5')
              .attr('opacity', 0.7)
              .style('pointer-events', 'none');
          }
          lShapePoints.forEach((coord) => {
            zoomGroup
              .append('circle')
              .attr('class', 'highlight-endpoint-overlay')
              .attr('cx', xScale(coord[0]))
              .attr('cy', yScale(coord[1]))
              .attr('r', 7)
              .attr('fill', 'rgba(255, 215, 0, 0.85)')
              .attr('stroke', '#FF8800')
              .attr('stroke-width', 2)
              .style('pointer-events', 'none');
          });
        }
      }
    }

    // 🎯 繪製 ㄈ 型高亮覆蓋層（taipei_a：ㄈ縮減 依 nShapeNextIndex 選中）
    if (
      isNormalizeFormat &&
      isTaipeiTestStraighteningLayerId(layerTab) &&
      dataStore.nShapeOverlayVisible
    ) {
      const nLayer = dataStore.findLayerById(layerTab);
      const nRoutesData = nLayer?.spaceNetworkGridJsonData;
      let nLayoutData = Array.isArray(nRoutesData) ? nRoutesData : [];
      if (nLayoutData.length > 0 && nLayoutData[0]?.segments && !nLayoutData[0]?.points) {
        nLayoutData = nLayoutData.flatMap((r) =>
          (r.segments || []).map((s) => ({ ...s, name: r.route_name || r.name || 'Unknown' }))
        );
      }
      const nStraightSegs = buildStraightSegments(nLayoutData);
      const nList = buildNShapeList(nStraightSegs);
      if (nList.length > 0) {
        const nIdx = dataStore.nShapeNextIndex % nList.length;
        const segStartIdx = nList[nIdx];
        const s0 = nStraightSegs[segStartIdx];
        const s1 = nStraightSegs[segStartIdx + 1];
        const s2 = nStraightSegs[segStartIdx + 2];
        const EPS2 = 1e-4;
        const sameP = (a, b) =>
          a && b && Math.abs(a[0] - b[0]) < EPS2 && Math.abs(a[1] - b[1]) < EPS2;
        if (
          s0?.points?.length >= 2 &&
          s1?.points?.length >= 2 &&
          s2?.points?.length >= 2 &&
          sameP(s0.points[1], s1.points[0]) &&
          sameP(s1.points[1], s2.points[0])
        ) {
          const a = s0.points[0],
            b = s0.points[1],
            c = s1.points[1],
            d = s2.points[1];
          const REDUCE_N_OPT = {
            skipConnectMove: true,
            skipCrossing: true,
            useRectangleOtherRouteCheck: true,
          };
          const analysis = computeNShapeAnalysis(nStraightSegs, segStartIdx, REDUCE_N_OPT);
          const { reduceColor, newCorner: e } = analysis;

          // 金黃實線高亮：ㄈ 型現狀 A->B->C->D
          const nShapePath = lineGenerator([a, b, c, d]);
          if (nShapePath) {
            zoomGroup
              .append('path')
              .attr('class', 'highlight-nshape-overlay')
              .attr('d', nShapePath)
              .attr('stroke', '#FFD700')
              .attr('fill', 'none')
              .attr('stroke-width', '10pt')
              .attr('opacity', 0.55)
              .style('pointer-events', 'none');
          }
          // 虛線：縮減後的 L 型 A->E->D
          if (e) {
            const lPath = lineGenerator([a, e, d]);
            if (lPath) {
              zoomGroup
                .append('path')
                .attr('class', 'highlight-nshape-reduce-overlay')
                .attr('d', lPath)
                .attr('stroke', reduceColor)
                .attr('fill', 'none')
                .attr('stroke-width', '6pt')
                .attr('stroke-dasharray', '8,5')
                .attr('opacity', 0.7)
                .style('pointer-events', 'none');
            }
          }
          // 標示 4 個頂點
          for (const coord of [a, b, c, d]) {
            zoomGroup
              .append('circle')
              .attr('class', 'highlight-nshape-endpoint-overlay')
              .attr('cx', xScale(coord[0]))
              .attr('cy', yScale(coord[1]))
              .attr('r', 7)
              .attr('fill', 'rgba(255, 215, 0, 0.85)')
              .attr('stroke', '#FF8800')
              .attr('stroke-width', 2)
              .style('pointer-events', 'none');
          }
        }
      }
    }

    // 診斷高亮：共軌已合併（綠）／仍重疊（橘）
    if (
      (isNormalizeFormat || isSchematicLayout) &&
      Array.isArray(dataStore.overlappingSegmentRanges) &&
      dataStore.overlappingSegmentRanges.length > 0
    ) {
      const overlapLineGen = d3
        .line()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[1]));
      const overlapGroup = zoomGroup.append('g').attr('class', 'overlapping-segments-overlay');
      dataStore.overlappingSegmentRanges.forEach((range) => {
        const pts = range.points;
        if (!Array.isArray(pts) || pts.length < 2) return;
        const pathData = overlapLineGen(pts);
        if (!pathData) return;
        const isFixed = range.fixed === true || range.kind === 'fixed';
        const routeLabel = Array.isArray(range.routes) ? range.routes.join(' × ') : '';
        const displayText = isFixed
          ? `已合併多色虛線：${routeLabel || '—'}`
          : range.turnCounts?.length
            ? `仍重疊：${routeLabel}（轉折 ${range.turnCounts.map((t) => `${t.routeName} ${t.turnCount}`).join('；')}）`
            : `仍重疊：${routeLabel || '—'}`;
        overlapGroup
          .append('path')
          .attr('d', pathData)
          .attr('stroke', isFixed ? '#2e7d32' : '#ff8800')
          .attr('fill', 'none')
          .attr('stroke-width', isFixed ? '6pt' : '8pt')
          .attr('stroke-dasharray', isFixed ? '6 4' : null)
          .attr('opacity', isFixed ? 0.65 : 0.75)
          .attr('title', displayText)
          .style('pointer-events', 'stroke')
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select('body').selectAll('.d3js-map-tooltip').remove();
            d3.select('body')
              .append('div')
              .attr('class', 'd3js-map-tooltip')
              .style('position', 'absolute')
              .style('z-index', 1000)
              .style('background', 'rgba(0,0,0,0.85)')
              .style('color', '#fff')
              .style('padding', '6px 10px')
              .style('border-radius', '4px')
              .style('font-size', '12px')
              .style('pointer-events', 'none')
              .style('left', `${event.pageX + 10}px`)
              .style('top', `${event.pageY + 10}px`)
              .text(displayText);
          })
          .on('mousemove', function (event) {
            d3.select('.d3js-map-tooltip')
              .style('left', `${event.pageX + 10}px`)
              .style('top', `${event.pageY + 10}px`);
          })
          .on('mouseout', function () {
            d3.select('body').selectAll('.d3js-map-tooltip').remove();
          });
      });
    }

    // taipei_c／d／e（含測試2）／f：繪圖座標空間之幾何中心十字參考線（與 xScale／yScale 定義域一致）
    if (
      isNormalizeFormat &&
      (isTaipeiTestCDELayerTab(layerTab) || isTaipeiTestFLayerTab(layerTab)) &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax)
    ) {
      const crossCx = (xMin + xMax) / 2;
      const crossCy = (yMin + yMax) / 2;
      const crossG = zoomGroup
        .append('g')
        .attr('class', 'schematic-center-cross')
        .style('pointer-events', 'none');
      crossG
        .append('line')
        .attr('x1', xScale(crossCx))
        .attr('y1', margin.top)
        .attr('x2', xScale(crossCx))
        .attr('y2', margin.top + height)
        .attr('stroke', '#0046E3')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5 4')
        .attr('opacity', 0.65);
      crossG
        .append('line')
        .attr('x1', margin.left)
        .attr('y1', yScale(crossCy))
        .attr('x2', margin.left + width)
        .attr('y2', yScale(crossCy))
        .attr('stroke', '#0046E3')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5 4')
        .attr('opacity', 0.65);
    }

    // 手繪網路線「執行下一步」：以包圍盒對齊目前圖幅資料域之疊加層（與既有路網同一 xScale／yScale）
    const sketchOv = dataStore.networkDrawSketchGridOverlay;
    if (
      sketchOv &&
      sketchOv.layerId === activeLayerTab.value &&
      Array.isArray(sketchOv.polylinesNorm) &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax)
    ) {
      const xSpan = xMax - xMin || 1;
      const ySpan = yMax - yMin || 1;
      const sketchLine = d3
        .line()
        .x((d) => xScale(xMin + d[0] * xSpan))
        .y((d) => yScale(yMax - d[1] * ySpan))
        .curve(d3.curveLinear);
      const gSk = zoomGroup
        .append('g')
        .attr('class', 'network-draw-sketch-grid-overlay')
        .style('pointer-events', 'none');
      for (const pl of sketchOv.polylinesNorm) {
        if (!pl || pl.length < 2) continue;
        const pts = [];
        for (const p of pl) {
          const nx = Number(p.nx);
          const ny = Number(p.ny);
          if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
          pts.push([nx, ny]);
        }
        if (pts.length < 2) continue;
        const dPath = sketchLine(pts);
        if (!dPath) continue;
        gSk
          .append('path')
          .attr('d', dPath)
          .attr('fill', 'none')
          .attr('stroke', '#c51162')
          .attr('stroke-width', 3)
          .attr('stroke-dasharray', '10,6')
          .attr('opacity', 0.92);
      }
    }

    // 手繪匯出之紅（交叉）／藍（懸空端）／綠（相接端）圓點（與 NetworkDrawTab 同色同半徑）；寫在目前分頁圖層之 networkDrawSketchMarkersPlot
    const sketchMarkersLayerForTab = dataStore.findLayerById(layerTab);
    const plotPts = sketchMarkersLayerForTab?.networkDrawSketchMarkersPlot;
    if (
      Array.isArray(plotPts) &&
      plotPts.length > 0 &&
      Number.isFinite(xMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMin) &&
      Number.isFinite(yMax)
    ) {
      const gMk = zoomGroup
        .append('g')
        .attr('class', 'network-draw-export-markers')
        .style('pointer-events', 'none');
      for (const m of plotPts) {
        if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
        gMk
          .append('circle')
          .attr('cx', xScale(m.x))
          .attr('cy', yScale(m.y))
          .attr('r', m.r != null && Number.isFinite(Number(m.r)) ? Number(m.r) : 4)
          .attr('fill', m.fill || '#333333')
          .attr('stroke', m.stroke || '#ffffff')
          .attr('stroke-width', 1);
      }
    }

    // connect 拉直：逐點之 highlight（橘圈＝目前評估之點；灰圈＝移動前格、青圈＝移動後格）
    if (layerTab === 'schematic_milp_straighten') {
      const mLyr = dataStore.findLayerById('schematic_milp_straighten');
      if (mLyr) {
        const mp = mLyr.connectStraightenMovePreview;
        if (
          mp &&
          Number.isFinite(Number(mp.fromGx)) && Number.isFinite(Number(mp.fromGy)) &&
          Number.isFinite(Number(mp.toGx)) && Number.isFinite(Number(mp.toGy))
        ) {
          zoomGroup.append('g').style('pointer-events', 'none').append('circle')
            .attr('cx', xScale(Math.round(Number(mp.fromGx)))).attr('cy', yScale(Math.round(Number(mp.fromGy))))
            .attr('r', 12).attr('fill', 'rgba(120,120,120,0.2)').attr('stroke', '#616161')
            .attr('stroke-width', 3).attr('stroke-dasharray', '6,4');
          zoomGroup.append('g').style('pointer-events', 'none').append('circle')
            .attr('cx', xScale(Math.round(Number(mp.toGx)))).attr('cy', yScale(Math.round(Number(mp.toGy))))
            .attr('r', 12).attr('fill', 'rgba(0,137,123,0.22)').attr('stroke', '#00695c').attr('stroke-width', 3);
        }
        const hc = mLyr.connectStraightenHighlightCell;
        if (hc && Number.isFinite(Number(hc.gx)) && Number.isFinite(Number(hc.gy))) {
          zoomGroup.append('g').style('pointer-events', 'none').append('circle')
            .attr('cx', xScale(Math.round(Number(hc.gx)))).attr('cy', yScale(Math.round(Number(hc.gy)))).attr('r', 13)
            .attr('fill', 'rgba(255,136,0,0.28)').attr('stroke', '#ff8800').attr('stroke-width', 4);
        }
      }
    }

    // point_orthogonal／temp／先直後橫 VH 繪製：Control「下一頂點」— 橘圈；temp「朝紅十字」列＝橘線／點，欄＝藍虛線／點；VH 另支援 orthoBundle（L 形青線）
    if (
      layerTab === POINT_ORTHOGONAL_LAYER_ID ||
      layerTab === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
      isLineOrthogonalTowardCenterLayerId(layerTab) ||
      isSpaceGridVhDrawFamilyLayerId(layerTab)
    ) {
      const hlLayer = dataStore.findLayerById(layerTab);
      const hl = hlLayer?.highlightedSegmentIndex;
      /** 橘圈：作用中分頁無 [seg,pt] 時，改讀可見之「紅藍點列表」層（Control 在該層操作時仍顯示於座標正規化／垂直化等分頁） */
      const rbConnectVertexHlLayer = (() => {
        const tabL = hlLayer;
        const hTab = tabL?.highlightedSegmentIndex;
        if (
          Array.isArray(hTab) &&
          hTab.length >= 2 &&
          Number.isFinite(Number(hTab[0])) &&
          Number.isFinite(Number(hTab[1]))
        ) {
          return tabL;
        }
        const rb = dataStore.findLayerById(COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID);
        if (!rb?.visible) return tabL;
        const hRb = rb.highlightedSegmentIndex;
        if (
          !Array.isArray(hRb) ||
          hRb.length < 2 ||
          !Number.isFinite(Number(hRb[0])) ||
          !Number.isFinite(Number(hRb[1]))
        ) {
          return tabL;
        }
        if (
          layerTab === JSON_GRID_COORD_NORMALIZED_LAYER_ID ||
          layerTab === POINT_ORTHOGONAL_LAYER_ID ||
          layerTab === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
          isLineOrthogonalTowardCenterLayerId(layerTab)
        ) {
          return rb;
        }
        return tabL;
      })();
      /** temp「朝紅十字」列／欄：列＝橘實線；欄＝藍虛線（便於區分水平／垂直階段）。 */
      const towardCrossAxis = isLineOrthogonalTowardCenterLayerId(layerTab)
        ? hlLayer?.lineOrthoTowardCrossHighlightTableAxis
        : null;
      const isColTowardCrossHl = towardCrossAxis === 'col';
      const towardCrossLineStroke = isColTowardCrossHl ? '#0d47a1' : '#ff6600';
      const towardCrossLineDash = isColTowardCrossHl ? '10,5' : null;
      const towardCrossPtFill = isColTowardCrossHl
        ? 'rgba(13, 71, 161, 0.28)'
        : 'rgba(255, 152, 0, 0.28)';
      const towardCrossPtStroke = isColTowardCrossHl ? '#0d47a1' : '#ff6600';

      const orthoBundleLineStroke = isSpaceGridVhDrawFamilyLayerId(layerTab)
        ? '#00acc1'
        : towardCrossLineStroke;
      const orthoBundleLineDash = isSpaceGridVhDrawFamilyLayerId(layerTab)
        ? null
        : towardCrossLineDash;

      if (
        (isLineOrthogonalTowardCenterLayerId(layerTab) ||
          isSpaceGridVhDrawFamilyLayerId(layerTab)) &&
        hlLayer &&
        Array.isArray(hl) &&
        hl[0] === 'orthoBundle' &&
        Array.isArray(hl[1])
      ) {
        const resolved = resolveB3InputSpaceNetwork(hlLayer, { routeLineFromExportRows: 'full' });
        const flat =
          resolved?.spaceNetwork?.length > 0
            ? normalizeSpaceNetworkDataToFlatSegments(
                JSON.parse(JSON.stringify(resolved.spaceNetwork))
              )
            : [];
        const lines = hl[1];
        for (let li = 0; li < lines.length; li++) {
          const spec = lines[li];
          if (!Array.isArray(spec) || spec[0] !== 'ortho' || spec.length < 4) continue;
          const si = Number(spec[1]);
          const e0 = Number(spec[2]);
          const e1 = Number(spec[3]);
          const seg = flat[si];
          const pts = seg?.points;
          if (
            Array.isArray(pts) &&
            Number.isFinite(e0) &&
            Number.isFinite(e1) &&
            e0 <= e1 &&
            e1 < pts.length - 1
          ) {
            const pA = pts[e0];
            const pB = pts[e1 + 1];
            const gx0 = Array.isArray(pA) ? Number(pA[0]) : Number(pA?.x);
            const gy0 = Array.isArray(pA) ? Number(pA[1]) : Number(pA?.y);
            const gx1 = Array.isArray(pB) ? Number(pB[0]) : Number(pB?.x);
            const gy1 = Array.isArray(pB) ? Number(pB[1]) : Number(pB?.y);
            if (
              Number.isFinite(gx0) &&
              Number.isFinite(gy0) &&
              Number.isFinite(gx1) &&
              Number.isFinite(gy1)
            ) {
              zoomGroup
                .append('g')
                .attr('class', 'json-grid-line-orthogonal-axis-highlight')
                .style('pointer-events', 'none')
                .append('line')
                .attr('x1', xScale(gx0))
                .attr('y1', yScale(gy0))
                .attr('x2', xScale(gx1))
                .attr('y2', yScale(gy1))
                .attr('stroke', orthoBundleLineStroke)
                .attr('stroke-width', 5)
                .attr('stroke-dasharray', orthoBundleLineDash ?? '')
                .attr('stroke-linecap', 'round')
                .attr('stroke-linejoin', 'round')
                .attr('fill', 'none');
            }
          }
        }
      }

      /** 斜邊→正交／N-Z／H-V-45° 步進：下一筆替換轉角之「單位兩臂」預覽（與 orthoBundle 同色） */
      if (
        isSpaceGridVhDrawFamilyLayerId(layerTab) &&
        hlLayer &&
        Array.isArray(hl) &&
        hl[0] === 'diagReplaceUnitArms' &&
        Array.isArray(hl[1])
      ) {
        const armSegs = hl[1];
        for (let ai = 0; ai < armSegs.length; ai++) {
          const seg = armSegs[ai];
          if (!seg || typeof seg !== 'object') continue;
          const gx0 = Number(seg.x0);
          const gy0 = Number(seg.y0);
          const gx1 = Number(seg.x1);
          const gy1 = Number(seg.y1);
          if (![gx0, gy0, gx1, gy1].every(Number.isFinite)) continue;
          zoomGroup
            .append('g')
            .attr('class', 'json-grid-diag-replace-unit-arm-highlight')
            .style('pointer-events', 'none')
            .append('line')
            .attr('x1', xScale(gx0))
            .attr('y1', yScale(gy0))
            .attr('x2', xScale(gx1))
            .attr('y2', yScale(gy1))
            .attr('stroke', orthoBundleLineStroke)
            .attr('stroke-width', 5)
            .attr('stroke-dasharray', orthoBundleLineDash ?? '')
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('fill', 'none');
        }
      }

      if (
        isLineOrthogonalTowardCenterLayerId(layerTab) &&
        hlLayer &&
        Array.isArray(hl) &&
        hl[0] === 'ortho' &&
        hl.length >= 4
      ) {
        const resolved = resolveB3InputSpaceNetwork(hlLayer, { routeLineFromExportRows: 'full' });
        const flat =
          resolved?.spaceNetwork?.length > 0
            ? normalizeSpaceNetworkDataToFlatSegments(
                JSON.parse(JSON.stringify(resolved.spaceNetwork))
              )
            : [];
        const si = Number(hl[1]);
        const e0 = Number(hl[2]);
        const e1 = Number(hl[3]);
        const seg = flat[si];
        const pts = seg?.points;
        if (
          Array.isArray(pts) &&
          Number.isFinite(e0) &&
          Number.isFinite(e1) &&
          e0 <= e1 &&
          e1 < pts.length - 1
        ) {
          const pA = pts[e0];
          const pB = pts[e1 + 1];
          const gx0 = Array.isArray(pA) ? Number(pA[0]) : Number(pA?.x);
          const gy0 = Array.isArray(pA) ? Number(pA[1]) : Number(pA?.y);
          const gx1 = Array.isArray(pB) ? Number(pB[0]) : Number(pB?.x);
          const gy1 = Array.isArray(pB) ? Number(pB[1]) : Number(pB?.y);
          if (
            Number.isFinite(gx0) &&
            Number.isFinite(gy0) &&
            Number.isFinite(gx1) &&
            Number.isFinite(gy1)
          ) {
            zoomGroup
              .append('g')
              .attr('class', 'json-grid-line-orthogonal-axis-highlight')
              .style('pointer-events', 'none')
              .append('line')
              .attr('x1', xScale(gx0))
              .attr('y1', yScale(gy0))
              .attr('x2', xScale(gx1))
              .attr('y2', yScale(gy1))
              .attr('stroke', towardCrossLineStroke)
              .attr('stroke-width', 5)
              .attr('stroke-dasharray', towardCrossLineDash ?? '')
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('fill', 'none');
          }
        }
      }

      /** 紅藍 connect 移動：灰圈＝移動前格、青圈＝移動後格（先畫，橘圈最後疊上＝目前頂點） */
      const rbPrevLyr = dataStore.findLayerById(COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID);
      const rbMp = rbPrevLyr?.rbConnectMovePreview;
      if (
        rbMp &&
        Number.isFinite(Number(rbMp.fromGx)) &&
        Number.isFinite(Number(rbMp.fromGy)) &&
        Number.isFinite(Number(rbMp.toGx)) &&
        Number.isFinite(Number(rbMp.toGy)) &&
        (layerTab === JSON_GRID_COORD_NORMALIZED_LAYER_ID ||
          layerTab === POINT_ORTHOGONAL_LAYER_ID ||
          layerTab === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
          isLineOrthogonalTowardCenterLayerId(layerTab))
      ) {
        const fgx = Math.round(Number(rbMp.fromGx));
        const fgy = Math.round(Number(rbMp.fromGy));
        const tgx = Math.round(Number(rbMp.toGx));
        const tgy = Math.round(Number(rbMp.toGy));
        zoomGroup
          .append('g')
          .attr('class', 'rb-connect-move-preview-from')
          .style('pointer-events', 'none')
          .append('circle')
          .attr('cx', xScale(fgx))
          .attr('cy', yScale(fgy))
          .attr('r', 12)
          .attr('fill', 'rgba(120, 120, 120, 0.2)')
          .attr('stroke', '#616161')
          .attr('stroke-width', 3)
          .attr('stroke-dasharray', '6,4');
        zoomGroup
          .append('g')
          .attr('class', 'rb-connect-move-preview-to')
          .style('pointer-events', 'none')
          .append('circle')
          .attr('cx', xScale(tgx))
          .attr('cy', yScale(tgy))
          .attr('r', 12)
          .attr('fill', 'rgba(0, 137, 123, 0.22)')
          .attr('stroke', '#00695c')
          .attr('stroke-width', 3);
      }

      /** 本輪已 highlight／處理過的紅藍 connect 點：綠圈 */
      if (
        rbPrevLyr?.visible &&
        Array.isArray(rbPrevLyr.rbConnectVisitedKeys) &&
        rbPrevLyr.rbConnectVisitedKeys.length > 0 &&
        (layerTab === JSON_GRID_COORD_NORMALIZED_LAYER_ID ||
          layerTab === POINT_ORTHOGONAL_LAYER_ID ||
          layerTab === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
          isLineOrthogonalTowardCenterLayerId(layerTab))
      ) {
        const resolved = resolveB3InputSpaceNetwork(rbPrevLyr, { routeLineFromExportRows: 'full' });
        const flat =
          resolved?.spaceNetwork?.length > 0
            ? normalizeSpaceNetworkDataToFlatSegments(
                JSON.parse(JSON.stringify(resolved.spaceNetwork))
              )
            : [];
        const seen = new Set(rbPrevLyr.rbConnectVisitedKeys);
        for (const key of seen) {
          const [siRaw, piRaw] = String(key).split(',');
          const si = Number(siRaw);
          const pi = Number(piRaw);
          const pt = flat[si]?.points?.[pi];
          if (!pt) continue;
          const gx = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
          const gy = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
          if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
          zoomGroup
            .append('g')
            .attr('class', 'rb-connect-visited-highlight')
            .style('pointer-events', 'none')
            .append('circle')
            .attr('cx', xScale(gx))
            .attr('cy', yScale(gy))
            .attr('r', 11)
            .attr('fill', 'rgba(46, 125, 50, 0.2)')
            .attr('stroke', '#2e7d32')
            .attr('stroke-width', 3);
        }
      }

      const vhl = rbConnectVertexHlLayer?.highlightedSegmentIndex;
      if (
        rbConnectVertexHlLayer &&
        Array.isArray(vhl) &&
        vhl.length >= 2 &&
        Number.isFinite(Number(vhl[0])) &&
        Number.isFinite(Number(vhl[1]))
      ) {
        const resolved = resolveB3InputSpaceNetwork(rbConnectVertexHlLayer, {
          routeLineFromExportRows: 'full',
        });
        const flat =
          resolved?.spaceNetwork?.length > 0
            ? normalizeSpaceNetworkDataToFlatSegments(
                JSON.parse(JSON.stringify(resolved.spaceNetwork))
              )
            : [];
        const si = Number(vhl[0]);
        const pi = Number(vhl[1]);
        const seg = flat[si];
        const pt = seg?.points?.[pi];
        if (pt) {
          const gx = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.x);
          const gy = Array.isArray(pt) ? Number(pt[1]) : Number(pt?.y);
          if (Number.isFinite(gx) && Number.isFinite(gy)) {
            const ptFill = isLineOrthogonalTowardCenterLayerId(layerTab)
              ? towardCrossPtFill
              : 'rgba(255, 152, 0, 0.28)';
            const ptStroke = isLineOrthogonalTowardCenterLayerId(layerTab)
              ? towardCrossPtStroke
              : '#ff6600';
            zoomGroup
              .append('g')
              .attr('class', 'json-grid-from-coord-vertex-highlight')
              .style('pointer-events', 'none')
              .append('circle')
              .attr('cx', xScale(gx))
              .attr('cy', yScale(gy))
              .attr('r', 14)
              .attr('fill', ptFill)
              .attr('stroke', ptStroke)
              .attr('stroke-width', 3.5);
          }
        }
      }

      const sg = hlLayer?.jsonGridFromCoordSuggestTargetGrid;
      const sx = sg != null ? Number(sg.x) : NaN;
      const sy = sg != null ? Number(sg.y) : NaN;
      if (Number.isFinite(sx) && Number.isFinite(sy)) {
        zoomGroup
          .append('g')
          .attr('class', 'json-grid-from-coord-suggest-highlight')
          .style('pointer-events', 'none')
          .append('circle')
          .attr('cx', xScale(sx))
          .attr('cy', yScale(sy))
          .attr('r', 14)
          .attr('fill', 'rgba(76, 175, 80, 0.22)')
          .attr('stroke', '#2e7d32')
          .attr('stroke-width', 3.5);
      }

      /** temp：最近一次「朝紅十字縮進」之格位移預覽（灰圈＝舊、青圈＝新；與線網資料一致） */
      if (isLineOrthogonalTowardCenterLayerId(layerTab) && hlLayer) {
        const mp = hlLayer.lineOrthoTowardCrossMovePreview;
        const fx = mp != null ? Number(mp.fromGx) : NaN;
        const fy = mp != null ? Number(mp.fromGy) : NaN;
        const tx = mp != null ? Number(mp.toGx) : NaN;
        const ty = mp != null ? Number(mp.toGy) : NaN;
        if (
          Number.isFinite(fx) &&
          Number.isFinite(fy) &&
          Number.isFinite(tx) &&
          Number.isFinite(ty) &&
          (fx !== tx || fy !== ty)
        ) {
          const preG = zoomGroup
            .append('g')
            .attr('class', 'line-orthogonal-toward-cross-move-preview')
            .style('pointer-events', 'none');
          preG
            .append('circle')
            .attr('cx', xScale(fx))
            .attr('cy', yScale(fy))
            .attr('r', 12)
            .attr('fill', 'rgba(97, 97, 97, 0.18)')
            .attr('stroke', '#757575')
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', '5,4');
          preG
            .append('circle')
            .attr('cx', xScale(tx))
            .attr('cy', yScale(ty))
            .attr('r', 13)
            .attr('fill', 'rgba(0, 131, 143, 0.2)')
            .attr('stroke', '#00838f')
            .attr('stroke-width', 3);
          preG
            .append('line')
            .attr('x1', xScale(fx))
            .attr('y1', yScale(fy))
            .attr('x2', xScale(tx))
            .attr('y2', yScale(ty))
            .attr('stroke', '#546e7a')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,5')
            .attr('opacity', 0.85);
          preG.raise();
        }
      }

      /** temp：紅虛線十字 — 若有鎖定中心格則固定於該格，否則為繪區 bbox 幾何中點（四捨五入） */
      if (isLineOrthogonalTowardCenterLayerId(layerTab)) {
        const fc = hlLayer?.lineOrthoTowardCrossFrozenCenter;
        const useFrozen =
          fc != null && Number.isFinite(Number(fc.cx)) && Number.isFinite(Number(fc.cy));
        const bboxOk =
          Number.isFinite(xMin) &&
          Number.isFinite(xMax) &&
          Number.isFinite(yMin) &&
          Number.isFinite(yMax);
        const spanOk = bboxOk && xMax > xMin && yMax > yMin;
        if (useFrozen || (bboxOk && spanOk)) {
          // 中心＝紅/黃/藍/紫點（交叉點/端點）之中位數中心（整數格）；無則退回 bbox 幾何中點
          const med = useFrozen
            ? null
            : layerStationsTowardSchematicCenter.getMedianAnchorCenterGrid(hlLayer);
          const cxG = useFrozen
            ? Math.round(Number(fc.cx))
            : med
              ? med.gx
              : Math.round((xMin + xMax) / 2);
          const cyG = useFrozen
            ? Math.round(Number(fc.cy))
            : med
              ? med.gy
              : Math.round((yMin + yMax) / 2);
          const crossG = zoomGroup
            .append('g')
            .attr('class', 'line-orthogonal-grid-center-crosshair')
            .style('pointer-events', 'none');
          const xL = margin.left;
          const xR = margin.left + width;
          const yT = margin.top;
          const yB = margin.top + height;
          const xP = xScale(cxG);
          const yP = yScale(cyG);
          const dash = '8,5';
          const applyStrokeAttrs = (el) =>
            el
              .attr('stroke', '#e53935')
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', dash)
              .attr('opacity', 0.92)
              .attr('vector-effect', 'non-scaling-stroke');
          applyStrokeAttrs(
            crossG.append('line').attr('x1', xP).attr('y1', yT).attr('x2', xP).attr('y2', yB)
          );
          applyStrokeAttrs(
            crossG.append('line').attr('x1', xL).attr('y1', yP).attr('x2', xR).attr('y2', yP)
          );
          crossG.raise();
        }
      }
    }

    // 站點與路線調整：以「紅/藍/黃/紫 頂點（各 segment 端點，不含黑點）」之**中位數位置**畫紅色虛線十字
    // （純參考線，不改資料）。中位數中心由 getMedianAnchorCenterGrid 取得。
    if (layerTab === 'schematic_rma_route_adjust') {
      const adjLayer = dataStore.findLayerById(layerTab);
      const med = layerStationsTowardSchematicCenter.getMedianAnchorCenterGrid(adjLayer);
      if (med) {
        const crossG = zoomGroup
          .append('g')
          .attr('class', 'route-adjust-median-crosshair')
          .style('pointer-events', 'none');
        const xL = margin.left;
        const xR = margin.left + width;
        const yT = margin.top;
        const yB = margin.top + height;
        const xP = xScale(med.gx);
        const yP = yScale(med.gy);
        const applyStrokeAttrs = (el) =>
          el
            .attr('stroke', '#e53935')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '8,5')
            .attr('opacity', 0.92)
            .attr('vector-effect', 'non-scaling-stroke');
        applyStrokeAttrs(
          crossG.append('line').attr('x1', xP).attr('y1', yT).attr('x2', xP).attr('y2', yB)
        );
        applyStrokeAttrs(
          crossG.append('line').attr('x1', xL).attr('y1', yP).attr('x2', xR).attr('y2', yP)
        );
        crossG.raise();
      }
    }

    // ⑨ 示意圖正規化：載入骨架後、按「開始執行」前，疊畫**四分樹最小葉格之均勻網格**（與實際
    // snap 用的同一組 xs/ys，與骨架同空間）。執行後 layer.quadtreePartition 會被清掉，只在預覽階段顯示。
    if (layerTab === 'schematic_rma_normalize') {
      const nmLayer = dataStore.findLayerById(layerTab);
      const part = nmLayer?.quadtreePartition;
      if (part && Array.isArray(part.xs) && Array.isArray(part.ys) && part.xs.length && part.ys.length) {
        const MAX_LINES = 4000; // 防呆：格線過多時不畫（避免凍住）
        if (part.xs.length + part.ys.length <= MAX_LINES) {
          const qtG = zoomGroup
            .append('g')
            .attr('class', 'schematic-normalize-quadtree-partition')
            .style('pointer-events', 'none');
          const yT = yScale(part.ys[0]);
          const yB = yScale(part.ys[part.ys.length - 1]);
          const xL = xScale(part.xs[0]);
          const xR = xScale(part.xs[part.xs.length - 1]);
          const lineAttrs = (el) =>
            el
              .attr('fill', 'none')
              .attr('stroke', '#1976d2')
              .attr('stroke-width', 1)
              .attr('opacity', 0.4)
              .attr('vector-effect', 'non-scaling-stroke');
          for (const xv of part.xs) {
            const xp = xScale(xv);
            lineAttrs(qtG.append('line').attr('x1', xp).attr('y1', yT).attr('x2', xp).attr('y2', yB));
          }
          for (const yv of part.ys) {
            const yp = yScale(yv);
            lineAttrs(qtG.append('line').attr('x1', xL).attr('y1', yp).attr('x2', xR).attr('y2', yp));
          }
          qtG.lower(); // 置於路線/站點之下，當背景格
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[⑨四分樹預覽] 格線過多（${part.xs.length}×${part.ys.length}），略過顯示以免凍住。`);
        }
      }
    }

    // 紅／藍／黑站點、路線中段黑點、站名：置於路線／網格／流量等標註之上
    const gVhMidDots = zoomGroup.select('g.layout-vh-draw-line-stations-pt');
    if (!gVhMidDots.empty()) gVhMidDots.raise();
    zoomGroup.selectAll('circle.space-network-rb-station-dot').raise();
    // 紅／藍 connect 點再 raise 一次，確保在中段黑點之上（避免同／鄰格黑點蓋住終點藍點）
    zoomGroup.selectAll('circle.rb-connect-dot').raise();
    zoomGroup.selectAll('text.space-network-rb-station-label').raise();
  };

  /**
   * 🎨 統一繪製函數 (Unified Drawing Function)
   * 根據圖層類型選擇相應的繪製方法
   */
  /* ───────────────────────────────────────────────────────────────────────
   * 🗺️ Leaflet 自由畫線圖層（JOSM 式畫法）
   *   - 點一下放一個節點，線段接續延伸
   *   - 滑鼠移動時最後節點到游標間有橡皮筋預覽線（JOSM rubber band）
   *   - 雙擊或按 Enter 結束目前這條線；按 Esc 取消尚未完成的線
   *   - 完成的線段持久化到 layer.leafletDrawLines，切換分頁後保留
   * ─────────────────────────────────────────────────────────────────────── */
  const LEAFLET_JOSM_DRAW_LAYER_ID = 'leaflet_josm_draw';
  let leafletDrawMap = null;
  let leafletDrawCleanup = null;

  const isLeafletDrawLayer = (layerId) => layerId === LEAFLET_JOSM_DRAW_LAYER_ID;

  /** Leaflet 畫線專用容器（永遠存在於 DOM，以 v-show 切換顯示） */
  const leafletDrawEl = ref(null);
  /** 目前作用圖層是否為 Leaflet 畫線圖層 */
  const isLeafletDrawLayerActive = computed(() => isLeafletDrawLayer(activeLayerTab.value));

  /** 🧹 銷毀 Leaflet 地圖實例並移除事件監聽（切換分頁／卸載時呼叫，no-op 安全） */
  const destroyLeafletDrawMap = () => {
    if (leafletDrawCleanup) {
      try {
        leafletDrawCleanup();
      } catch (e) {
        void e;
      }
      leafletDrawCleanup = null;
    }
    if (leafletDrawMap) {
      try {
        leafletDrawMap.remove();
      } catch (e) {
        void e;
      }
      leafletDrawMap = null;
    }
  };

  const drawLeafletDrawMap = () => {
    // 掛載到專用的穩定容器（永遠存在於 DOM，避免脫離 DOM 造成 Leaflet 拖曳崩潰）
    const el = leafletDrawEl.value;
    if (!el) return;

    // 地圖已掛在同一個容器上（例如 resize 重繪）：只校正尺寸，保留視野與進行中的線
    if (leafletDrawMap && leafletDrawMap.getContainer && leafletDrawMap.getContainer() === el) {
      leafletDrawMap.invalidateSize();
      return;
    }

    // 容器尚未取得尺寸（v-show 顯示前／版面未就緒）時先不初始化，待版面就緒後再建立，
    // 避免 Leaflet 在 0 尺寸狀態下拖曳時崩潰（getSizedParentNode null）
    if (el.offsetWidth === 0 || el.offsetHeight === 0) {
      setTimeout(() => {
        if (isLeafletDrawLayer(spaceGridDataLayerTabId.value)) {
          drawLeafletDrawMap();
        }
      }, 100);
      return;
    }

    // 重置 Leaflet 初始化標記
    destroyLeafletDrawMap();
    if (el._leaflet_id) {
      delete el._leaflet_id;
    }
    el.innerHTML = '';

    const layer = dataStore.findLayerById(LEAFLET_JOSM_DRAW_LAYER_ID);
    if (!Array.isArray(layer.leafletDrawLines)) {
      layer.leafletDrawLines = [];
    }
    if (!Array.isArray(layer.leafletDrawBlackDots)) {
      layer.leafletDrawBlackDots = [];
    }

    const map = L.map(el, {
      center: [25.0478, 121.5319], // 台北車站附近
      zoom: 12,
      zoomControl: true,
      doubleClickZoom: false, // 雙擊用於結束畫線
      attributionControl: false,
    });
    leafletDrawMap = map;

    // 底圖：CartoDB Positron（乾淨淺色、不雜亂）
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);
    // 疊加：OpenRailwayMap 鐵道／捷運路線
    L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    // 已完成的線
    const finishedGroup = L.layerGroup().addTo(map);
    // 站點（端點藍／交點紅／黑點）— 置於線之上
    const stationGroup = L.layerGroup().addTo(map);

    // 一般（瀏覽）模式才讓線／點可互動，hover 顯示屬性（與 osm／geojson 圖層一致）；
    // 編輯模式（line／point）維持不可互動，以利在其上繼續繪製。
    const isEditing = () => dataStore.leafletDrawMode === 'line' || dataStore.leafletDrawMode === 'point';
    const esc = (s) =>
      String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const llKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;
    const rowHtml = (k, v) =>
      v == null || v === '' ? '' : `<div><span style="color:#888">${esc(k)}</span> ${esc(v)}</div>`;

    const lineTooltipHtml = (ln) =>
      `<div style="font-size:12px;line-height:1.5">` +
      rowHtml('route_name', ln.routeName) +
      rowHtml('route_id', ln.routeId) +
      rowHtml('route_company', ln.routeCompany) +
      rowHtml('railway', ln.railway) +
      rowHtml('osm_id', ln.osmId) +
      rowHtml('color', ln.color) +
      `</div>`;

    const typeLabel = (t) =>
      t === 'terminal' ? '端點 terminal' : t === 'connect' ? '交點 intersection' : '一般 normal';

    // coord → 經過此站的路線名集合（供 route_name_list）
    const buildRoutesAtCoord = () => {
      const map = new Map();
      for (const ln of layer.leafletDrawLines || []) {
        if (!ln || !Array.isArray(ln.latlngs)) continue;
        for (const c of ln.latlngs) {
          const k = llKey(c[0], c[1]);
          let set = map.get(k);
          if (!set) {
            set = new Set();
            map.set(k, set);
          }
          if (ln.routeName) set.add(ln.routeName);
        }
      }
      return map;
    };
    const stationTooltipHtml = (latlng, type, routesAtCoord) => {
      const k = llKey(latlng[0], latlng[1]);
      const meta = (layer.leafletDrawStationMeta && layer.leafletDrawStationMeta[k]) || {};
      const routes = [...(routesAtCoord.get(k) || [])];
      return (
        `<div style="font-size:12px;line-height:1.5">` +
        rowHtml('station_name', meta.name) +
        rowHtml('station_id', meta.id) +
        rowHtml('osm_id', meta.osmId) +
        rowHtml('type', typeLabel(type)) +
        (routes.length ? `<div><span style="color:#888">route_name_list</span> ${esc(routes.join('、'))}</div>` : '') +
        `</div>`
      );
    };

    const renderFinished = () => {
      finishedGroup.clearLayers();
      const editing = isEditing();
      for (const ln of layer.leafletDrawLines) {
        if (!ln || !Array.isArray(ln.latlngs) || ln.latlngs.length < 2) continue;
        const pl = L.polyline(ln.latlngs, {
          color: ln.color || '#e6194b',
          weight: 4,
          opacity: 0.9,
          interactive: !editing, // 編輯時不攔截事件，瀏覽時可 hover
        });
        if (!editing) pl.bindTooltip(lineTooltipHtml(ln), { sticky: true });
        pl.addTo(finishedGroup);
      }
    };

    // 推導並繪製站點：端點(藍) / 交點(紅) / 黑點；瀏覽模式可 hover 顯示站點屬性
    const renderStations = () => {
      stationGroup.clearLayers();
      const { terminals, connects, blacks } = computeLeafletDrawStations(
        layer.leafletDrawLines,
        layer.leafletDrawBlackDots
      );
      const editing = isEditing();
      const routesAtCoord = editing ? null : buildRoutesAtCoord();
      const addStationDot = (latlng, fillColor, radius, type) => {
        const m = L.circleMarker(latlng, {
          radius,
          color: '#ffffff', // 白色 1px border（與骨架點一致）
          weight: 1,
          fillColor,
          fillOpacity: 1,
          interactive: !editing,
        });
        if (!editing) m.bindTooltip(stationTooltipHtml(latlng, type, routesAtCoord), { sticky: true });
        m.addTo(stationGroup);
      };
      // 繪製順序：黑點 → 端點(藍) → 交點(紅)，讓交點顯示在最上層
      blacks.forEach((p) => addStationDot(p, '#000000', 3, 'black'));
      terminals.forEach((p) => addStationDot(p, '#1565c0', 4, 'terminal'));
      connects.forEach((p) => addStationDot(p, '#ff0000', 4, 'connect'));
    };

    const renderAll = () => {
      renderFinished();
      renderStations();
    };
    renderAll();

    // 反應式重繪：操作 tab 的清除／切換等外部變更時即時更新地圖
    const stopLinesWatch = watch(
      () => [layer.leafletDrawLines, layer.leafletDrawBlackDots],
      renderAll,
      { deep: true }
    );

    // 一次性縮放到目前所有線（載入城市/讀圖/隨機後由 store 觸發）
    const stopFitWatch = watch(
      () => dataStore.leafletDrawFitTrigger,
      () => {
        const pts = [];
        for (const ln of layer.leafletDrawLines || []) {
          if (ln && Array.isArray(ln.latlngs)) pts.push(...ln.latlngs);
        }
        (layer.leafletDrawBlackDots || []).forEach((p) => pts.push(p));
        if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
      }
    );

    // 目前正在畫的線狀態
    let current = []; // L.LatLng[]
    let committedLine = null; // 已點下的節點連成的折線
    let rubberLine = null; // 最後節點 → 游標 的橡皮筋線
    let vertexDots = L.layerGroup().addTo(map);
    let currentColor = routeColorForIndex(layer.leafletDrawLines.length);
    let dblClickPending = false;

    const clearCurrent = () => {
      current = [];
      if (committedLine) {
        map.removeLayer(committedLine);
        committedLine = null;
      }
      if (rubberLine) {
        map.removeLayer(rubberLine);
        rubberLine = null;
      }
      vertexDots.clearLayers();
    };

    const refreshCommitted = () => {
      if (committedLine) {
        committedLine.setLatLngs(current);
      } else if (current.length >= 1) {
        committedLine = L.polyline(current, {
          color: currentColor,
          weight: 4,
          opacity: 0.9,
          interactive: false, // 不攔截滑鼠事件，確保雙擊落到地圖上以結束畫線
        }).addTo(map);
      }
      vertexDots.clearLayers();
      current.forEach((ll, i) => {
        L.circleMarker(ll, {
          radius: i === current.length - 1 ? 5 : 4,
          color: currentColor,
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 1,
          interactive: false, // 同上，避免節點圓點吃掉雙擊事件
        }).addTo(vertexDots);
      });
    };

    const finishLine = () => {
      if (current.length >= 2) {
        layer.leafletDrawLines = [
          ...layer.leafletDrawLines,
          { color: currentColor, latlngs: current.map((ll) => [ll.lat, ll.lng]) },
        ];
        renderAll();
      }
      clearCurrent();
    };

    // 封閉目前路線：最後一點接回起點（需 ≥3 點）
    const closeLine = () => {
      if (current.length >= 3) {
        const latlngs = current.map((ll) => [ll.lat, ll.lng]);
        latlngs.push([current[0].lat, current[0].lng]); // 接回起點
        layer.leafletDrawLines = [
          ...layer.leafletDrawLines,
          { color: currentColor, latlngs, closed: true },
        ];
        renderAll();
        clearCurrent();
      } else {
        finishLine();
      }
    };

    // 若點擊位置接近既有幾何（任一路線的節點、黑點，或線段中段），回傳該點以「黏過去」成同一站
    const SNAP_PX = 14;
    const findNearestExistingPoint = (lat, lng) => {
      const target = map.latLngToContainerPoint([lat, lng]);
      let best = null;
      let bestD = SNAP_PX;
      const consider = (pt) => {
        if (!Array.isArray(pt) || pt.length < 2) return;
        const d = target.distanceTo(map.latLngToContainerPoint([pt[0], pt[1]]));
        if (d <= bestD) {
          bestD = d;
          best = pt;
        }
      };
      // 既有節點與黑點（優先黏到既有站點）
      for (const l of layer.leafletDrawLines) {
        if (l && Array.isArray(l.latlngs)) l.latlngs.forEach(consider);
      }
      layer.leafletDrawBlackDots.forEach(consider);
      // 最近的線上一點（黏到別條線的中段，使其接上）
      consider(snapPointToLines([lat, lng], layer.leafletDrawLines));
      return best; // [lat,lng] 或 null
    };

    const onClick = (e) => {
      if (dblClickPending) return;
      // ⚫ 畫黑點模式：先黏既有站點；否則吸附到最近路線上（黑點一定畫在線上）
      if (dataStore.leafletDrawMode === 'point') {
        const hit = findNearestExistingPoint(e.latlng.lat, e.latlng.lng);
        const pt = hit || snapPointToLines([e.latlng.lat, e.latlng.lng], layer.leafletDrawLines);
        if (pt) {
          layer.leafletDrawBlackDots = [...layer.leafletDrawBlackDots, pt];
        }
        return;
      }
      if (dataStore.leafletDrawMode !== 'line') return; // 'none'（不編輯）→ 點擊不繪製
      // ✏️ 畫線模式：依路線索引取色（多樣、不重複）；節點接近既有站點則黏過去
      if (current.length === 0) {
        currentColor = routeColorForIndex(layer.leafletDrawLines.length);
      }
      const hit = findNearestExistingPoint(e.latlng.lat, e.latlng.lng);
      const node = hit ? L.latLng(hit[0], hit[1]) : e.latlng;
      current = [...current, node];
      refreshCommitted();
    };

    const onMouseMove = (e) => {
      if (dataStore.leafletDrawMode === 'point') return; // 黑點模式不顯示橡皮筋線
      if (current.length === 0) return;
      const last = current[current.length - 1];
      const pts = [last, e.latlng];
      if (rubberLine) {
        rubberLine.setLatLngs(pts);
      } else {
        rubberLine = L.polyline(pts, {
          color: currentColor,
          weight: 2,
          opacity: 0.7,
          dashArray: '6 4',
          interactive: false, // 橡皮筋線不攔截事件
        }).addTo(map);
      }
    };

    const onDblClick = (e) => {
      dblClickPending = true;
      // 雙擊的第二下會多丟一個重複節點，移除它
      if (current.length > 0) {
        current = current.slice(0, -1);
      }
      finishLine();
      L.DomEvent.stopPropagation(e);
      setTimeout(() => {
        dblClickPending = false;
      }, 50);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        clearCurrent();
      } else if (e.key === 'Enter') {
        finishLine();
      }
    };

    // 右鍵：把目前路線封閉（最後一點接回起點）
    const onContextMenu = (e) => {
      if (e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
      if (dataStore.leafletDrawMode !== 'line') return;
      closeLine();
    };

    // 游標：編輯模式（line／point）十字、非編輯（none）一般指標
    const applyDrawCursor = (mode) => {
      el.style.cursor = mode === 'line' || mode === 'point' ? 'crosshair' : '';
    };
    // 離開畫線模式（切到黑點或不編輯）時，捨棄尚未完成的線；同步更新游標
    const stopModeWatch = watch(
      () => dataStore.leafletDrawMode,
      (mode) => {
        if (mode !== 'line') clearCurrent();
        applyDrawCursor(mode);
        renderAll(); // 切換編輯／瀏覽時，更新線與點的可互動性（hover 屬性）
      }
    );

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('dblclick', onDblClick);
    map.on('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    applyDrawCursor(dataStore.leafletDrawMode);

    // Leaflet 在隱藏／尺寸 0 容器初始化時需手動校正尺寸
    nextTick(() => {
      if (leafletDrawMap === map) {
        map.invalidateSize();
      }
    });

    leafletDrawCleanup = () => {
      stopLinesWatch();
      stopFitWatch();
      stopModeWatch();
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('dblclick', onDblClick);
      map.off('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  };

  const drawSchematic = () => {
    const srcId = spaceGridDataLayerTabId.value;
    if (!srcId) return;
    if (isLeafletDrawLayer(srcId)) {
      drawLeafletDrawMap();
      return;
    }
    // 非 Leaflet 畫線圖層：確保先銷毀殘留的 Leaflet 地圖
    destroyLeafletDrawMap();
    if (isMapLayer(srcId)) {
      drawMap();
    } else if (isGridSchematicLayer(srcId)) {
      drawGridSchematic();
    } else {
      drawAdministrativeSchematic();
    }
  };

  scheduleTaipeiFDrawForMouseZoom = () => {
    if (taipeiFMouseZoomRaf) return;
    taipeiFMouseZoomRaf = requestAnimationFrame(() => {
      taipeiFMouseZoomRaf = 0;
      drawMapForceNext = true;
      drawSchematic();
    });
  };

  // 路網網格_2 fisheye：焦點細格改變時，rAF 內強制重繪（變形格線／路線／點）。
  scheduleLayoutVhDrawFisheyeRedraw = () => {
    if (layoutVhDrawFisheyeRaf) return;
    layoutVhDrawFisheyeRaf = requestAnimationFrame(() => {
      layoutVhDrawFisheyeRaf = 0;
      drawMapForceNext = true;
      drawSchematic();
    });
  };

  /**
   * 📏 調整尺寸 (Resize)
   * 響應容器尺寸變化，重新繪製示意圖
   */
  const resize = () => {
    // 確保容器存在且可見
    const container = document.getElementById(getContainerId());
    if (!container) {
      return;
    }

    // 檢查容器是否可見（寬度和高度都大於 0）
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      // 如果容器不可見，延遲執行
      setTimeout(() => {
        resize();
      }, 100);
      return;
    }

    // 先更新尺寸狀態，再重新繪製
    getDimensions();
    /** layout-grid-viewer：繞過 drawMap 同尺寸早退並避免舊 viewBox／pt 刻度殘留，拖曳 resizing 時即時對齊。 */
    if (props.layoutVhDrawPixelAxes) {
      drawMapForceNext = true;
    }
    drawSchematic();
    refreshSpaceNetworkMinCellDimensions();
  };

  // 記錄上一次的圖層列表用於比較
  const previousLayers = ref([]);

  /**
   * 與操作分頁（ControlTab）選取對齊。
   */
  watch(
    () => dataStore.controlActiveLayerId,
    (id) => {
      if (!id) return;
      if (!visibleLayers.value.some((l) => l.layerId === id)) return;
      if (activeLayerTab.value === id) return;
      setActiveLayerTab(id);
    },
    { flush: 'post' }
  );

  /**
   * 手繪「執行下一步」後：Upper 切到 space-network-grid 時，將圖層分頁對齊目標 layerId。
   */
  watch(
    () => props.isActive,
    (on) => {
      if (!on) return;
      nextTick(() => {
        if (!dataStore.networkSketchAfterDrawSwitchLayerPending) return;
        const id =
          dataStore.networkSketchAfterDrawTargetLayerId ||
          dataStore.networkDrawSketchGridOverlay?.layerId;
        dataStore.setNetworkSketchAfterDrawSwitchLayerPending(false);
        dataStore.setNetworkSketchAfterDrawTargetLayerId(null);
        if (!id) return;
        if (visibleLayers.value.some((l) => l.layerId === id)) {
          setActiveLayerTab(id);
        }
      });
    },
    { flush: 'post' }
  );

  /**
   * 👀 監聽可見圖層變化，自動切換到新開啟的圖層分頁
   */
  watch(
    () => visibleLayers.value,
    (newLayers) => {
      // 如果沒有可見圖層，清除選中的分頁
      if (newLayers.length === 0) {
        activeLayerTab.value = null;
        previousLayers.value = [];
        return;
      }

      // 找出新增的圖層（比較新舊圖層列表）
      const previousLayerIds = previousLayers.value.map((layer) => layer.layerId);
      const newLayerIds = newLayers.map((layer) => layer.layerId);
      const addedLayerIds = newLayerIds.filter((id) => !previousLayerIds.includes(id));

      // 如果有新增的圖層，自動切換到最新新增的圖層
      if (addedLayerIds.length > 0) {
        const newestAddedLayerId = addedLayerIds[addedLayerIds.length - 1];
        activeLayerTab.value = newestAddedLayerId;
        dataStore.touchLastSpaceNetworkGridSketchTargetLayerId(newestAddedLayerId);
        emit('active-layer-change', activeLayerTab.value);
      }
      // 如果當前沒有選中分頁，或選中的分頁不在可見列表中，選中第一個
      else if (
        !activeLayerTab.value ||
        !newLayers.find((layer) => layer.layerId === activeLayerTab.value)
      ) {
        activeLayerTab.value = newLayers[0].layerId;
        dataStore.touchLastSpaceNetworkGridSketchTargetLayerId(newLayers[0].layerId);
        emit('active-layer-change', activeLayerTab.value);
      }

      // 更新記錄的圖層列表
      previousLayers.value = [...newLayers];
    },
    { deep: true, immediate: true }
  );

  /**
   * 👀 監聽活動圖層變化，載入數據並繪製示意圖
   */
  watch(
    () => activeLayerTab.value,
    async (newLayerId, oldLayerId) => {
      if (newLayerId && newLayerId !== oldLayerId) {
        if (oldLayerId === 'taipei_l3' && newLayerId !== 'taipei_l3') {
          const hb = dataStore.highlightedBlackStation;
          if (hb?.layerId === 'taipei_l3') dataStore.setHighlightedBlackStation(null);
        }
        if (oldLayerId === 'taipei_l3_dp' && newLayerId !== 'taipei_l3_dp') {
          const hb = dataStore.highlightedBlackStation;
          if (hb?.layerId === 'taipei_l3_dp') dataStore.setHighlightedBlackStation(null);
        }
        // 確保 SVG 內容和 tooltip 已清除（雙重保險）
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        // 切換圖層時銷毀殘留的 Leaflet 畫線地圖
        destroyLeafletDrawMap();

        // 清除舊數據（雙重保險）
        gridData.value = null;
        nodeData.value = null;
        linkData.value = null;
        mapGeoJsonData.value = null;

        // 載入新圖層數據

        await loadLayerData(newLayerId);

        // 等待 DOM 更新後繪製
        await nextTick();

        drawSchematic();
      }
    }
  );

  /**
   * 👀 監聽當前圖層的主要示意圖資料變化
   * 當圖層數據載入完成時，自動載入並繪製示意圖
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const layer = dataStore.findLayerById(activeLayerTab.value);
      if (!layer) return null;
      const osmLay =
        activeLayerTab.value === JSON_GRID_COORD_NORMALIZED_LAYER_ID
          ? dataStore.findLayerById(OSM_2_GEOJSON_2_JSON_LAYER_ID)
          : null;
      /** OSM／a3 等僅有 geojsonData 時，異步載入完成須觸發重繪（原本只監聽 spaceNetworkGridJsonData） */
      /** 版面網格·座標正規化：父層 dataOSM／GeoJSON 變動須連動重繪 */
      return {
        sn: layer.spaceNetworkGridJsonData,
        gj: layer.geojsonData,
        ug: layer.layoutUniformGridGeoJson,
        um: layer.layoutUniformGridMeta,
        parentDataOsm: osmLay?.dataOSM,
        parentGj: osmLay?.geojsonData,
        parentDataGj: osmLay?.dataGeojson,
      };
    },
    async () => {
      if (!activeLayerTab.value) return;
      const layer = dataStore.findLayerById(activeLayerTab.value);
      if (!layer) return;
      const hasSn = layer.spaceNetworkGridJsonData != null;
      const gj = layer.geojsonData;
      const hasGj =
        gj &&
        gj.type === 'FeatureCollection' &&
        Array.isArray(gj.features) &&
        gj.features.length > 0;
      const ugFc = layer.layoutUniformGridGeoJson;
      const hasUg =
        ugFc &&
        ugFc.type === 'FeatureCollection' &&
        Array.isArray(ugFc.features) &&
        ugFc.features.length > 0;
      let hasOsmBackedMap = false;
      if (layer.layerId === JSON_GRID_COORD_NORMALIZED_LAYER_ID) {
        hasOsmBackedMap = !!backingGeoJsonFromOsm2DataOsmForCoordNormViewer(layer);
      }
      if (!hasSn && !hasGj && !hasUg && !hasOsmBackedMap) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await loadLayerData(activeLayerTab.value);
      await nextTick();
      drawSchematic();
    },
    { deep: true }
  );

  /**
   * 👀 監聽路段高亮索引變化，重繪以更新高亮
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const lid = activeLayerTab.value;
      const layer = dataStore.findLayerById(lid);
      if (!layer) return null;
      if (
        layer.layerId === POINT_ORTHOGONAL_LAYER_ID ||
        layer.layerId === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
        isLineOrthogonalTowardCenterLayerId(layer.layerId)
      ) {
        const hl = layer.highlightedSegmentIndex;
        const sg = layer.jsonGridFromCoordSuggestTargetGrid;
        const mp = isLineOrthogonalTowardCenterLayerId(layer.layerId)
          ? (layer.lineOrthoTowardCrossMovePreview ?? null)
          : null;
        const fz = isLineOrthogonalTowardCenterLayerId(layer.layerId)
          ? (layer.lineOrthoTowardCrossFrozenCenter ?? null)
          : null;
        const hxAxis = isLineOrthogonalTowardCenterLayerId(layer.layerId)
          ? (layer.lineOrthoTowardCrossHighlightTableAxis ?? null)
          : null;
        return JSON.stringify([
          hl == null ? null : hl,
          sg?.x ?? null,
          sg?.y ?? null,
          mp == null ? null : mp,
          fz == null ? null : { cx: fz.cx, cy: fz.cy },
          hxAxis,
        ]);
      }
      if (isSpaceGridVhDrawFamilyLayerId(layer.layerId)) {
        return JSON.stringify(layer.highlightedSegmentIndex ?? null);
      }
      if (layer.layerId === 'schematic_milp_straighten') {
        return JSON.stringify([
          layer.connectStraightenHighlightCell ?? null,
          layer.connectStraightenMovePreview ?? null,
        ]);
      }
      return layer.highlightedSegmentIndex ?? null;
    },
    async (newVal, oldVal) => {
      const same =
        Array.isArray(newVal) && Array.isArray(oldVal)
          ? newVal[0] === oldVal[0] && newVal[1] === oldVal[1]
          : newVal === oldVal;
      if (!same && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** 「紅藍點列表」層 highlight／移動預覽變化時，在座標正規化／垂直化等分頁也重繪 */
  watch(
    () => {
      const rb = dataStore.findLayerById(COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID);
      return JSON.stringify([
        rb?.visible,
        rb?.highlightedSegmentIndex ?? null,
        rb?.rbConnectMovePreview ?? null,
        rb?.rbConnectVisitedKeys ?? null,
      ]);
    },
    async (nv, ov) => {
      if (nv === ov || !activeLayerTab.value) return;
      const lid = activeLayerTab.value;
      if (
        !(
          lid === JSON_GRID_COORD_NORMALIZED_LAYER_ID ||
          lid === POINT_ORTHOGONAL_LAYER_ID ||
          lid === COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID ||
          isLineOrthogonalTowardCenterLayerId(lid)
        )
      ) {
        return;
      }
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawSchematic();
    }
  );

  /**
   * 👀 監聽車站配置開關變化（直線化測試／網格正規化），重繪以顯示/隱藏車站
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const layer = dataStore.findLayerById(activeLayerTab.value);
      return layer?.showStationPlacement ?? null;
    },
    async (newVal, oldVal) => {
      if (newVal !== oldVal && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** taipei_f／taipei_g：dataStore「顯示網格／顯示權重／…」切換時重繪（Control 專屬操作僅 taipei_g） */
  watch(
    () => [
      dataStore.showGrid,
      dataStore.showWeightLabels,
      dataStore.showRouteThickness,
      dataStore.taipeiFSpaceNetworkGridScaling,
      dataStore.taipeiFSpaceNetworkMouseZoom,
    ],
    async () => {
      if (!isTaipeiEfinalSpaceLayerTab(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      taipeiFMouseZoomHover.value = { ix: null, iy: null };
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawSchematic();
    }
  );

  /** 空間網路主分頁：路線權重數字開關（與 space-network-grid-k3／l3 共用 store） */
  watch(
    () => [
      dataStore.spaceNetworkGridShowRouteWeights,
      dataStore.showWeightLabels,
      dataStore.showRouteThickness,
      dataStore.spaceNetworkGridShowMouseGridCoordinate,
    ],
    async () => {
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData || !activeLayerTab.value || !isMapLayer(activeLayerTab.value)) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawMapForceNext = true;
      drawSchematic();
    },
    { flush: 'post' }
  );

  /** 顯示紅／藍或黑點站名：地圖示意層重繪 */
  watch(
    () => [dataStore.showStationNames, dataStore.showBlackDotStationNames],
    async () => {
      if (!activeLayerTab.value || !isMapLayer(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawSchematic();
    }
  );

  /** 測試3：Control「正方形／預設」切換時重繪路網示意 */
  watch(
    () =>
      activeLayerTab.value && isTaipeiTest3BcdeLayerTab(activeLayerTab.value)
        ? dataStore.findLayerById(activeLayerTab.value)?.squareGridCellsTaipeiTest3
        : null,
    async () => {
      if (!activeLayerTab.value || !isTaipeiTest3BcdeLayerTab(activeLayerTab.value)) return;
      if (!isMapLayer(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await nextTick();
      drawSchematic();
    }
  );

  /** 隨機權重等：強制卸載 SVG 後重載，避免 drawMap 同尺寸快取略過整圖重繪 */
  watch(
    () => dataStore.spaceNetworkGridFullRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      if (!activeLayerTab.value || !isMapLayer(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      const containerId = getContainerId();
      d3.select(`#${containerId}`).selectAll('svg').remove();
      d3.select('body').selectAll('.d3js-map-tooltip').remove();
      await loadLayerData(activeLayerTab.value);
      await nextTick();
      drawSchematic();
    }
  );

  /** 版面路網「全部隨機 weight」：路線／站點內插動畫幀更新；結束時 clear 亦觸發重繪以恢復網格／刻度 */
  watch(
    () => dataStore.layoutVhDrawRouteAnimTrigger,
    (n) => {
      if (n < 1) return;
      if (!activeLayerTab.value || !isMapLayer(activeLayerTab.value)) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (!hasData) return;
      drawMapForceNext = true;
      drawSchematic();
    }
  );

  /** taipei_f：欄（Col）路段逐步高亮 */
  watch(
    () => dataStore.taipeiFColRouteHighlightRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** taipei_f：列（Row）路段逐步高亮 */
  watch(
    () => dataStore.taipeiFRowRouteHighlightRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** 黑點車站逐步 highlight：store 變更時重繪，否則圓點樣式不會更新 */
  watch(
    () => dataStore.blackStationHighlightRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  /** 疊加縮減預覽：欄／列帶狀高亮 */
  watch(
    () => dataStore.overlayShrinkStripRedrawTrigger,
    async (n) => {
      if (n < 1) return;
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    }
  );

  watch(
    () => [
      dataStore.hvZStepTrigger,
      dataStore.hvFlipStepTrigger,
      dataStore.nShapeStepTrigger,
      dataStore.highlightDiagnosticsTrigger,
    ],
    async () => {
      const hasData = gridData.value || mapGeoJsonData.value;
      if (hasData && activeLayerTab.value) {
        const containerId = getContainerId();
        d3.select(`#${containerId}`).selectAll('svg').remove();
        d3.select('body').selectAll('.d3js-map-tooltip').remove();
        await nextTick();
        drawSchematic();
      }
    },
    { deep: true }
  );

  /**
   * 👀 監聽容器高度變化，觸發示意圖重繪
   */
  watch(
    () => props.containerHeight,
    () => {
      // 觸發示意圖重繪以適應新高度
      nextTick(() => {
        resize();
      });
    }
  );

  /**
   * 🚀 組件掛載事件 (Component Mounted Event)
   */
  onMounted(async () => {
    // 初始化第一個可見圖層為作用中分頁
    if (visibleLayers.value.length > 0 && !activeLayerTab.value) {
      activeLayerTab.value = visibleLayers.value[0].layerId;

      // 載入初始數據
      await loadLayerData(activeLayerTab.value);
      await nextTick();
      drawSchematic();

      emit('active-layer-change', activeLayerTab.value);
    }

    // 監聽窗口大小變化
    window.addEventListener('resize', resize);

    // 監聽容器尺寸變化
    const container = document.getElementById(getContainerId());
    if (container && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            resize();
          }
        }
      });
      resizeObserver.observe(container);

      // 同時監聽父容器
      const parentContainer = container.parentElement;
      if (parentContainer) {
        resizeObserver.observe(parentContainer);
      }
    }
  });

  /**
   * 🚀 組件卸載事件 (Component Unmounted Event)
   */
  onUnmounted(() => {
    if (taipeiFMouseZoomRaf) {
      cancelAnimationFrame(taipeiFMouseZoomRaf);
      taipeiFMouseZoomRaf = 0;
    }
    if (layoutRouteWeightAnimRaf) {
      cancelAnimationFrame(layoutRouteWeightAnimRaf);
      layoutRouteWeightAnimRaf = 0;
    }
    dataStore.clearLayoutVhDrawRouteAnim();
    destroyLeafletDrawMap();
    window.removeEventListener('resize', resize);

    // 清理 ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  });

  // 暴露方法給父組件使用
  defineExpose({
    resize, // 調整尺寸方法
  });
</script>

<template>
  <!-- 📊 多圖層 D3.js 數據視覺化儀表板視圖組件 -->
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <!-- 📑 圖層分頁導航 -->
    <div v-if="visibleLayers.length > 0" class="">
      <ul class="nav nav-tabs nav-fill">
        <li
          v-for="layer in visibleLayers"
          :key="layer.layerId"
          class="nav-item d-flex flex-column align-items-center"
        >
          <!-- tab按鈕 -->
          <div
            class="btn nav-link rounded-0 border-0 position-relative d-flex align-items-center justify-content-center my-bgcolor-gray-200"
            :class="{
              active: activeLayerTab === layer.layerId,
            }"
            @click="setActiveLayerTab(layer.layerId)"
          >
            <span>
              <span v-if="getLayerFullTitle(layer).groupName" class="my-title-xs-gray"
                >{{ getLayerFullTitle(layer).groupName }} -
              </span>
              <span class="my-title-sm-black">{{ getLayerFullTitle(layer).layerName }}</span>
            </span>
          </div>
          <div class="w-100" :class="`my-bgcolor-${layer.colorName}`" style="min-height: 4px"></div>
        </li>
      </ul>
    </div>

    <!-- 有開啟圖層時的內容 -->
    <div
      v-if="visibleLayers.length > 0"
      class="flex-grow-1 d-flex flex-column my-bgcolor-white"
      style="min-height: 0"
    >
      <!-- 📊 圖層摘要資料 -->
      <div v-if="currentLayerSummary" class="flex-grow-1 d-flex flex-column" style="min-height: 0">
        <!-- D3.js 示意圖 - 以彈性高度填滿可用空間 -->
        <div class="flex-grow-1 d-flex flex-column" style="min-height: 0">
          <div class="flex-grow-1" style="min-height: 0; position: relative">
            <!-- 🗺️ Leaflet 畫線專用容器：永遠存在於 DOM（v-show，非 v-if），避免脫離 DOM 造成拖曳崩潰 -->
            <div
              v-show="isLeafletDrawLayerActive"
              ref="leafletDrawEl"
              class="w-100 h-100"
              style="position: absolute; inset: 0; z-index: 2"
            ></div>
            <!-- 🎨 統一示意圖容器 (Unified Schematic Container) -->
            <div
              :id="getContainerId()"
              class="w-100 h-100"
              style="min-height: 0; overflow: hidden; background-color: #ffffff"
            ></div>
          </div>
        </div>
      </div>
      <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
        <div class="text-center">
          <div class="my-title-md-gray" v-if="hasLayerInfoData">有資料</div>
          <div class="my-title-md-gray" v-else>此圖層沒有可用的摘要資訊</div>
        </div>
      </div>
    </div>

    <!-- 沒有開啟圖層時的空狀態 -->
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <div class="my-title-md-gray p-3">沒有開啟的圖層</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /**
   * 🎨 SpaceNetworkGridTab 組件樣式 (SpaceNetworkGridTab Component Styles)
   *
   * 定義組件內部元素的樣式規則，使用 scoped 避免樣式污染
   * 主要樣式規則已在 common.css 中定義，此處僅包含組件特定調整
   */

  /* 📊 示意圖容器樣式 (Schematic Container Styles) */
  [id^='schematic-container-space-network-grid'] {
    position: relative;
    overflow: hidden;
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  /* 🗺️ 地圖模式時強制白色背景 */
  [id^='schematic-container-space-network-grid'] svg {
    display: block;
    max-width: 100%;
    max-height: 100%;
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  /* 🔍 縮放功能樣式 */
  [id^='schematic-container-space-network-grid'] svg {
    cursor: grab;
  }

  [id^='schematic-container-space-network-grid'] svg:active {
    cursor: grabbing;
  }

  /* 📝 網格文字樣式 (Grid Text Styles) */
  :deep(.grid-nodes text) {
    pointer-events: none;
    user-select: none;
  }

  /* 🎯 D3.js 圖表互動樣式 (D3.js Chart Interaction Styles) */
  :deep(.bar:hover) {
    cursor: pointer;
  }

  :deep(.scatter:hover) {
    cursor: pointer;
  }

  :deep(.dot:hover) {
    cursor: pointer;
  }
</style>
