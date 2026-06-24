<script>
  import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { useDataStore } from '@/stores/dataStore.js';
  import { useDefineStore } from '@/stores/defineStore.js';
  import {
    getGeoJsonFeatureTagProps,
    isGeoJsonNodePointFeature,
    isGeoJsonWayLineFeature,
    normalizeRouteSegmentEndpointType,
    segmentNodeLon,
    segmentNodeLat,
    routeIdFromGeoJsonWayTags,
    ensureSegmentStationStrings,
  } from '@/utils/geojsonRouteHelpers.js';
import {
  expandLonLatChainFromRouteCoordinates,
  isMapDrawnRoutesExportArray,
  mapDrawnExportRowsFromJsonDrawRoot,
} from '@/utils/mapDrawnRoutesImport.js';
  import {
    enumerateCrossingCandidates,
    applyCrossingToRows,
    renumberAndRecomputeRouteExportRows,
  } from '@/utils/routeSegmentIntersections.js';
  import {
    LAYER_ID as OSM_PIPELINE_LAYER_ID,
    setOsm2GeojsonSessionOsmXml,
    syncOsm2LayerDerivedGeoJsonAndScheduleArtifactsPersist,
  } from '@/utils/layers/osm_2_geojson_2_json/index.js';

  /** 每條手繪折線開始（第一個頂點）時使用，與底色對比清楚的隨機 sRGB hex */
  function pickRandomRouteDrawHexColor() {
    const h = Math.random() * 360;
    let s = 0.72;
    let l = 0.44;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hh = ((h % 360) / 360) * 6;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    const m = l - c / 2;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hh < 1) [rp, gp, bp] = [c, x, 0];
    else if (hh < 2) [rp, gp, bp] = [x, c, 0];
    else if (hh < 3) [rp, gp, bp] = [0, c, x];
    else if (hh < 4) [rp, gp, bp] = [0, x, c];
    else if (hh < 5) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    const clamp255 = (t) => Math.max(0, Math.min(255, Math.round((t + m) * 255)));
    return `#${clamp255(rp).toString(16).padStart(2, '0')}${clamp255(gp).toString(16).padStart(2, '0')}${clamp255(bp).toString(16).padStart(2, '0')}`;
  }

  export default {
    name: 'MapTab',
    emits: ['active-layer-change'],
    props: {
      containerHeight: { type: Number, default: 500 },
      isPanelDragging: { type: Boolean, default: false },
    },
    setup(props, { emit }) {
      const dataStore = useDataStore();
      const mapStore = useDefineStore();

      const mapEl = ref(null);
      let map = null;

      const persistOsmPipelineLayerArtifactsIfApplicable = (ly) => {
        if (!ly || ly.layerId !== OSM_PIPELINE_LAYER_ID) return;
        const g = dataStore.findGroupNameByLayerId(OSM_PIPELINE_LAYER_ID);
        if (!g || syncOsm2LayerDerivedGeoJsonAndScheduleArtifactsPersist(ly, g) == null) return;
        dataStore.saveLayerState(OSM_PIPELINE_LAYER_ID, {
          jsonData: ly.jsonData,
          geojsonData: ly.geojsonData,
          dataOSM: ly.dataOSM,
          dataGeojson: ly.dataGeojson,
          dataJson: ly.dataJson,
        });
        dataStore.syncOsm2DataJsonMirrorFromParent();
      };
      // 為每個圖層存儲獨立的地圖狀態
      const layerStates = new Map(); // layerId -> { center, zoom, tileLayer, townshipLayer, isTownshipVisible, geojsonLayers }
      let currentLayerId = null;
      let currentTileLayer = null;
      let townshipBoundaryLayer = null;
      const MAX_RETRY_COUNT = 3; // 最多重試3次

      // Get all visible layers that have geojson data for map rendering
      const visibleGeojsonLayers = computed(() =>
        dataStore.getAllLayers().filter((l) => l.visible && (l.geojsonData || l.jsonData))
      );

      // Get all visible layers (including those without geojson data)
      const allVisibleLayers = computed(() => dataStore.getAllLayers().filter((l) => l.visible));

      const activeLeftTab = computed(() => dataStore.activeLeftTab);

      const ensureMap = () => {
        // 如果地圖已存在且有效，只需要刷新尺寸
        if (map && mapEl.value) {
          try {
            map.invalidateSize();
            return;
          } catch (err) {
            // 地圖對象無效，需要重新創建
            // eslint-disable-next-line no-console
            console.warn('Map object invalid, recreating...', err);
            try {
              map.remove();
            } catch (removeErr) {
              void removeErr;
            }
            map = null;
          }
        }

        if (!mapEl.value) return;

        // 清理 DOM 元素上可能殘留的 Leaflet 實例
        if (mapEl.value._leaflet_id) {
          // 移除所有 Leaflet 相關的屬性
          delete mapEl.value._leaflet_id;
          mapEl.value.innerHTML = '';
          // 移除所有 leaflet 相關的 class
          mapEl.value.className = mapEl.value.className
            .split(' ')
            .filter((c) => !c.startsWith('leaflet-'))
            .join(' ');
        }

        // 確保容器有尺寸
        const rect = mapEl.value.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          // 如果容器沒有尺寸，延遲重試
          setTimeout(() => {
            ensureMap();
          }, 100);
          return;
        }

        try {
          // 創建新地圖
          map = L.map(mapEl.value, {
            center: mapStore.mapView.center,
            zoom: mapStore.mapView.zoom,
            zoomControl: false,
            attributionControl: false,
          });

          setBasemap();

          // 確保地圖正確渲染
          nextTick(() => {
            if (map) {
              map.invalidateSize();
            }
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to create map:', err);
          map = null;
        }
      };

      const setBasemap = () => {
        if (!map) return;

        if (currentTileLayer) {
          map.removeLayer(currentTileLayer);
          currentTileLayer = null;
        }

        const config = mapStore.basemaps.find((b) => b.value === mapStore.selectedBasemap);
        if (config && config.url) {
          currentTileLayer = L.tileLayer(config.url, { attribution: '' });
          currentTileLayer.addTo(map);
        }

        // Set background color - 默认设为白色
        if (mapEl.value) {
          if (mapStore.selectedBasemap === 'blank') {
            mapEl.value.style.backgroundColor = '#ffffff';
          } else if (mapStore.selectedBasemap === 'black') {
            mapEl.value.style.backgroundColor = '#000000';
          } else {
            // 将默认背景改为白色而不是透明
            mapEl.value.style.backgroundColor = '#ffffff';
          }
        }
      };

      const changeBasemap = (basemapType) => {
        mapStore.setSelectedBasemap(basemapType);
        setBasemap();
      };

      const getBasemapLabel = (value) => {
        const basemap = mapStore.basemaps.find((b) => b.value === value);
        return basemap ? basemap.label : value;
      };

      const toggleTownshipBoundary = () => {
        if (!map) return;

        if (!townshipBoundaryLayer) {
          townshipBoundaryLayer = L.tileLayer(
            'https://wmts.nlsc.gov.tw/wmts/TOWN/default/EPSG:3857/{z}/{y}/{x}.png',
            {
              attribution: '內政部國土測繪中心',
              maxZoom: 20,
              opacity: 1,
            }
          );
        }

        if (townshipBoundaryLayer && map.hasLayer(townshipBoundaryLayer)) {
          map.removeLayer(townshipBoundaryLayer);
        } else {
          townshipBoundaryLayer.addTo(map);
          if (townshipBoundaryLayer.setZIndex) {
            townshipBoundaryLayer.setZIndex(100);
          }
        }
      };

      const townshipBoundaryButtonLabel = computed(() => {
        if (!map) return '顯示鄉鎮區界';
        return townshipBoundaryLayer && map.hasLayer(townshipBoundaryLayer)
          ? '隱藏鄉鎮區界'
          : '顯示鄉鎮區界';
      });

      const showAllFeatures = () => {
        if (!map) return;
        const bounds = L.latLngBounds([]);
        let hasValidBounds = false;

        // 獲取當前地圖上所有的 geojson 圖層
        map.eachLayer((layer) => {
          if (
            layer &&
            layer.getBounds &&
            layer !== currentTileLayer &&
            layer !== townshipBoundaryLayer
          ) {
            const layerBounds = layer.getBounds();
            if (layerBounds.isValid()) {
              bounds.extend(layerBounds);
              hasValidBounds = true;
            }
          }
        });

        if (hasValidBounds) {
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      };

      const showFullCity = () => {
        if (!map) return;
        map.setView(mapStore.mapView.center, mapStore.mapView.zoom);
      };

      const isAnyLayerVisible = computed(() => {
        if (!map) return false;
        let hasGeoJsonLayer = false;
        map.eachLayer((layer) => {
          if (layer !== currentTileLayer && layer !== townshipBoundaryLayer) {
            hasGeoJsonLayer = true;
          }
        });
        return hasGeoJsonLayer;
      });

      const fitBoundsIfAny = () => {
        if (!map) return;
        const bounds = L.latLngBounds([]);
        let has = false;
        map.eachLayer((layer) => {
          if (
            layer &&
            layer.getBounds &&
            layer !== currentTileLayer &&
            layer !== townshipBoundaryLayer
          ) {
            const layerBounds = layer.getBounds();
            if (layerBounds.isValid()) {
              bounds.extend(layerBounds);
              has = true;
            }
          }
        });
        if (has) map.fitBounds(bounds, { padding: [40, 40] });
      };

      /** 與路段 JSON segment.start／end.type 一致：terminal 藍、intersection 紅、normal／其餘黑 */
      const circleStyleForJsonEndpointType = (type, hover) => {
        const t = normalizeRouteSegmentEndpointType(type);
        const h = !!hover;
        if (t === 'terminal') {
          return h
            ? {
                radius: 7,
                color: '#052c65',
                weight: 3,
                fillColor: '#6ea8fe',
                fillOpacity: 1,
                pane: 'markerPane',
              }
            : {
                radius: 4,
                color: '#0d6efd',
                weight: 2,
                fillColor: '#9ec5fe',
                fillOpacity: 1,
                pane: 'markerPane',
              };
        }
        if (t === 'intersection') {
          return h
            ? {
                radius: 7,
                color: '#58151c',
                weight: 3,
                fillColor: '#f5c2c7',
                fillOpacity: 1,
                pane: 'markerPane',
              }
            : {
                radius: 4,
                color: '#dc3545',
                weight: 2,
                fillColor: '#f1aeb5',
                fillOpacity: 1,
                pane: 'markerPane',
              };
        }
        return h
          ? {
              radius: 6,
              color: '#000000',
              weight: 2,
              fillColor: '#555555',
              fillOpacity: 1,
              pane: 'markerPane',
            }
          : {
              radius: 3,
              color: '#000000',
              weight: 1,
              fillColor: '#1a1a1a',
              fillOpacity: 1,
              pane: 'markerPane',
            };
      };

      const midStationCircleStyle = (hover) =>
        hover
          ? {
              radius: 5,
              color: '#000000',
              weight: 2,
              fillColor: '#333333',
              fillOpacity: 1,
              pane: 'markerPane',
            }
          : {
              radius: 2,
              color: '#000000',
              weight: 1,
              fillColor: '#000000',
              fillOpacity: 1,
              pane: 'markerPane',
            };

      const escapeHtmlAttr = (s) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;');

      /** Leaflet Polyline／MultiPolygon 嵌套後取第一個 LatLng */
      const firstNestedLatLng = (latlngs) => {
        if (!latlngs || latlngs.length === 0) return null;
        const x = latlngs[0];
        if (x && typeof x.lat === 'number' && typeof x.lng === 'number') return x;
        return firstNestedLatLng(x);
      };

      /** 路段節點 popup：station_id／name／route_name_list／type／connect_number／lon／lat */
      const stationPopupHtmlFromNode = (node) => {
        if (!node) return '';
        const lon = segmentNodeLon(node);
        const lat = segmentNodeLat(node);
        let rnl = node.route_name_list;
        const rnlStr = Array.isArray(rnl)
          ? escapeHtmlAttr(JSON.stringify(rnl))
          : escapeHtmlAttr(String(rnl ?? '[]'));
        return `<strong>station_id</strong> ${escapeHtmlAttr(node.station_id)}<br>
<strong>station_name</strong> ${escapeHtmlAttr(node.station_name)}<br>
<strong>route_name_list</strong> ${rnlStr}<br>
<strong>type</strong> <code>${escapeHtmlAttr(node.type)}</code><br>
<strong>connect_number</strong> ${escapeHtmlAttr(node.connect_number)}<br>
<strong>lon</strong> ${escapeHtmlAttr(lon)}<br>
<strong>lat</strong> ${escapeHtmlAttr(lat)}`;
      };

      /** 路段依序列表：segment.start→stations→end（站數與 station_id／station_name） */
      const routeRowStationsOrderedPopupSection = (row) => {
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
          const sid = escapeHtmlAttr(node.station_id ?? node.tags?.station_id ?? '');
          const snm = escapeHtmlAttr(
            node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? ''
          );
          html += `<strong>#${idx + 1}</strong> station_id ${sid} · station_name ${snm}<br>`;
        });
        return html;
      };

      /** 路段折線 popup：routeName／route_id／color／起點 lon／lat／stations */
      const routeRowPolylinePopupHtml = (row, chain) => {
        if (!chain || chain.length < 1) return '';
        const [flon, flat] = chain[0];
        const head = `<strong>routeName</strong> ${escapeHtmlAttr(row.routeName)}<br>
<strong>route_id</strong> ${escapeHtmlAttr(row.route_id ?? '')}<br>
<strong>color</strong> ${escapeHtmlAttr(row.color)}<br>
<strong>lon</strong> ${escapeHtmlAttr(flon)}<br>
<strong>lat</strong> ${escapeHtmlAttr(flat)}`;
        const stations = routeRowStationsOrderedPopupSection(row);
        return stations ? `${head}<br>${stations}` : head;
      };

      // ==================== 畫線模式 (Draw Mode) ====================

      const drawMode = ref(false); // 是否在畫線模式
      const drawPoints = ref([]); // 當前正在畫的折線頂點 [[lon,lat], ...]
      /** 本次折線之色（在第一個頂點置入時選定，並用於預覽與寫入 jsonData.color） */
      let currentDrawStrokeColor = '#666666';
      let drawPreviewPolyline = null; // Leaflet Polyline 預覽圖層
      let drawPreviewDot = null; // 當前最後一點的圓點
      let dblClickPending = false; // 防止 dblclick 觸發兩次 click 的 flag

      /** 將 drawPoints 渲染成預覽折線 */
      const refreshDrawPreview = () => {
        if (!map) return;
        const pts = drawPoints.value.map(([lon, lat]) => [lat, lon]);
        if (drawPreviewPolyline) {
          drawPreviewPolyline.setLatLngs(pts);
        } else if (pts.length >= 2) {
          drawPreviewPolyline = L.polyline(pts, {
            color: currentDrawStrokeColor,
            weight: 3,
            opacity: 0.9,
            dashArray: '6 4',
            pane: 'overlayPane',
          });
          if (drawPreviewPolyline.setPane) drawPreviewPolyline.setPane('overlayPane');
          drawPreviewPolyline.addTo(map);
        }
        // 最後一點圓點
        if (drawPreviewDot) {
          if (drawPoints.value.length > 0) {
            const last = drawPoints.value[drawPoints.value.length - 1];
            drawPreviewDot.setLatLng([last[1], last[0]]);
          } else {
            map.removeLayer(drawPreviewDot);
            drawPreviewDot = null;
          }
        } else if (drawPoints.value.length > 0) {
          const last = drawPoints.value[drawPoints.value.length - 1];
          drawPreviewDot = L.circleMarker([last[1], last[0]], {
            radius: 5,
            color: currentDrawStrokeColor,
            weight: 2,
            fillColor: '#fff3cd',
            fillOpacity: 1,
            pane: 'markerPane',
          }).addTo(map);
        }
      };

      /** 清除預覽圖層 */
      const clearDrawPreview = () => {
        if (!map) return;
        if (drawPreviewPolyline) {
          map.removeLayer(drawPreviewPolyline);
          drawPreviewPolyline = null;
        }
        if (drawPreviewDot) {
          map.removeLayer(drawPreviewDot);
          drawPreviewDot = null;
        }
      };

      /** 完成當前一段折線，轉成路段格式寫入 layer.jsonData */
      const finishCurrentLine = () => {
        const pts = drawPoints.value;
        if (pts.length < 2) {
          drawPoints.value = [];
          clearDrawPreview();
          return;
        }

        const currentLayer = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        const targetLayer = currentLayer;
        const existing = Array.isArray(targetLayer?.jsonData) ? targetLayer.jsonData : [];
        /** 繪製順序：已存在之手繪列（含本次將寫入前）數量 + 1 — 僅用於 station_id 編號 */
        const drawnRoutesSoFar = existing.filter((r) => r && r._drawn).length;
        const routeSeq = drawnRoutesSoFar + 1;
        /** 站點依折線順序：`station_id`／`station_name` 皆為 `站點_{路線序}_{站序}` */
        const sid = (stationIdx) => `站點_${routeSeq}_${stationIdx}`;
        const sname = (stationIdx) => `站點_${routeSeq}_${stationIdx}`;

        const startPt = pts[0];
        const endPt = pts[pts.length - 1];
        const bends = pts.slice(1, -1);
        const ts = Date.now();
        let idx = 1;
        const newRow = {
          route_id: '',
          routeName: '',
          color: currentDrawStrokeColor,
          segment: {
            start: {
              station_id: sid(idx),
              station_name: sname(idx),
              lon: startPt[0],
              lat: startPt[1],
            },
            stations: bends.map((b) => {
              idx += 1;
              const j = idx;
              return {
                station_id: sid(j),
                station_name: sname(j),
                lon: b[0],
                lat: b[1],
              };
            }),
            end: {
              station_id: sid(pts.length),
              station_name: sname(pts.length),
              lon: endPt[0],
              lat: endPt[1],
            },
          },
          routeCoordinates: [startPt, bends, endPt],
          _drawn: true,
          _drawnAt: ts,
        };
        // 寫入 layer.jsonData（dataJson 鏡像圖層時寫入父圖層）
        if (targetLayer) {
          targetLayer.jsonData = renumberAndRecomputeRouteExportRows([...existing, newRow]);
          persistOsmPipelineLayerArtifactsIfApplicable(targetLayer);
        }
        drawPoints.value = [];
        clearDrawPreview();
        // 重繪地圖以顯示新畫的線
        loadOrSyncLayers();
      };

      /** 撤銷最後一段手繪路線 */
      const undoLastDrawnLine = () => {
        const currentLayer = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        const targetLayer = currentLayer;
        if (!targetLayer || !Array.isArray(targetLayer.jsonData)) return;
        const idx = [...targetLayer.jsonData]
          .map((r, i) => (r._drawn ? i : -1))
          .filter((i) => i >= 0);
        if (idx.length === 0) return;
        const rows = [...targetLayer.jsonData];
        rows.splice(idx[idx.length - 1], 1);
        targetLayer.jsonData = renumberAndRecomputeRouteExportRows(rows);
        persistOsmPipelineLayerArtifactsIfApplicable(targetLayer);
        loadOrSyncLayers();
      };

      /** click 事件：加一個頂點 */
      const onDrawMapClick = (e) => {
        if (dblClickPending) return;
        const prevLen = drawPoints.value.length;
        if (prevLen === 0) {
          currentDrawStrokeColor = pickRandomRouteDrawHexColor();
        }
        drawPoints.value = [...drawPoints.value, [e.latlng.lng, e.latlng.lat]];
        refreshDrawPreview();
      };

      /** dblclick 事件：完成線段（移除最後一個多餘的 click 點） */
      const onDrawMapDblClick = (e) => {
        dblClickPending = true;
        // dblclick 前 Leaflet 已觸發兩次 click，移除最後一個（與 dblclick 位置相同）
        const pts = [...drawPoints.value];
        if (pts.length > 0) pts.pop();
        drawPoints.value = pts;
        finishCurrentLine();
        setTimeout(() => {
          dblClickPending = false;
        }, 50);
        L.DomEvent.stopPropagation(e);
      };

      /** Escape 取消當前未完成的線段 */
      const onDrawKeyDown = (e) => {
        if (!drawMode.value) return;
        if (e.key === 'Escape') {
          drawPoints.value = [];
          clearDrawPreview();
        }
      };

      const enterDrawMode = () => {
        if (!map) return;
        drawMode.value = true;
        map.dragging.disable();
        map.scrollWheelZoom.disable();
        map.doubleClickZoom.disable();
        map.on('click', onDrawMapClick);
        map.on('dblclick', onDrawMapDblClick);
        if (mapEl.value) mapEl.value.style.cursor = 'crosshair';
        window.addEventListener('keydown', onDrawKeyDown);
      };

      const exitDrawMode = () => {
        if (!map) return;
        // 如果有未完成的線段，放棄
        drawPoints.value = [];
        clearDrawPreview();
        drawMode.value = false;
        map.dragging.enable();
        map.scrollWheelZoom.enable();
        map.doubleClickZoom.enable();
        map.off('click', onDrawMapClick);
        map.off('dblclick', onDrawMapDblClick);
        if (mapEl.value) mapEl.value.style.cursor = '';
        window.removeEventListener('keydown', onDrawKeyDown);
      };

      const toggleDrawMode = () => {
        if (drawMode.value) exitDrawMode();
        else {
          if (intersectMode.value) exitIntersectMode();
          enterDrawMode();
        }
      };

      const hasDrawnLines = computed(() => {
        const currentLayer = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        const ly = currentLayer;
        return ly && Array.isArray(ly.jsonData) && ly.jsonData.some((r) => r._drawn);
      });

      // ==================== 新增交叉點模式（一路線自交或兩路線相交之線段內部打斷並加入 intersection） ====================

      const crossingCandidatesCache = ref([]);
      const intersectMode = ref(false);
      let intersectionHintMarker = null;
      let intersectCaptureMove = null;
      let intersectCaptureClick = null;
      let intersectionPulseTimer = null;
      let activeSnapCrossingCandidate = null;
      let intersectEscHandler = null;
      const SNAP_CROSSING_PX = 32;

      function refreshCrossingCandidatesCache() {
        const current = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        const ly = current;
        if (
          !ly ||
          !Array.isArray(ly.jsonData) ||
          ly.jsonData.length < 1 ||
          !isMapDrawnRoutesExportArray(ly.jsonData)
        ) {
          crossingCandidatesCache.value = [];
          return;
        }
        crossingCandidatesCache.value = enumerateCrossingCandidates(ly.jsonData);
      }

      const canUseCrossingTool = computed(() => {
        const current = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        const ly = current;
        return Boolean(
          ly &&
            Array.isArray(ly.jsonData) &&
            ly.jsonData.length >= 1 &&
            isMapDrawnRoutesExportArray(ly.jsonData)
        );
      });

      const findNearestCrossingByPixel = (latlng) => {
        if (!map || !latlng || !crossingCandidatesCache.value.length) return null;
        const pM = map.latLngToContainerPoint(latlng);
        let best = null;
        let bestD = SNAP_CROSSING_PX + 1;
        for (const c of crossingCandidatesCache.value) {
          const pC = map.latLngToContainerPoint(L.latLng(c.lat, c.lon));
          const dx = pM.x - pC.x;
          const dy = pM.y - pC.y;
          const d = Math.hypot(dx, dy);
          if (d < bestD && d <= SNAP_CROSSING_PX) {
            bestD = d;
            best = c;
          }
        }
        return best;
      };

      const stopIntersectionPulse = () => {
        if (intersectionPulseTimer != null) {
          clearInterval(intersectionPulseTimer);
          intersectionPulseTimer = null;
        }
      };

      const hideIntersectionHint = () => {
        stopIntersectionPulse();
        if (intersectionHintMarker && map?.hasLayer(intersectionHintMarker)) {
          intersectionHintMarker.closeTooltip();
          map.removeLayer(intersectionHintMarker);
        }
      };

      const ensureIntersectionHintMarker = () => {
        if (intersectionHintMarker) return;
        intersectionHintMarker = L.circleMarker([0, 0], {
          radius: 11,
          color: '#ffc107',
          weight: 4,
          fillColor: '#dc3545',
          fillOpacity: 0.85,
          pane: 'markerPane',
        });
        if (intersectionHintMarker.setPane) intersectionHintMarker.setPane('markerPane');
        intersectionHintMarker.bindTooltip('可點擊新增交叉點（紅）', {
          permanent: true,
          direction: 'top',
          offset: [0, -14],
          opacity: 0.92,
          className: 'map-tab-intersection-hint-tooltip',
        });
      };

      const showIntersectionHintAt = (cand) => {
        if (!map || !cand) return;
        ensureIntersectionHintMarker();
        intersectionHintMarker.setLatLng([cand.lat, cand.lon]);
        intersectionHintMarker.addTo(map);
        intersectionHintMarker.openTooltip();
        if (typeof intersectionHintMarker.bringToFront === 'function') {
          intersectionHintMarker.bringToFront();
        }
        stopIntersectionPulse();
        let t = 0;
        intersectionPulseTimer = window.setInterval(() => {
          if (!map?.hasLayer(intersectionHintMarker)) return;
          t += 1;
          intersectionHintMarker.setRadius(9 + Math.sin(t / 3) * 3.5);
        }, 42);
      };

      const onIntersectCaptureMove = (ev) => {
        if (!intersectMode.value || !map) return;
        let latlng;
        try {
          latlng = map.mouseEventToLatLng(ev);
        } catch (err) {
          void err;
          return;
        }
        const snap = findNearestCrossingByPixel(latlng);
        activeSnapCrossingCandidate = snap;
        if (snap) {
          showIntersectionHintAt(snap);
          if (mapEl.value) mapEl.value.style.cursor = 'pointer';
        } else {
          hideIntersectionHint();
          if (mapEl.value && !drawMode.value) mapEl.value.style.cursor = '';
        }
      };

      const onIntersectCaptureClick = (ev) => {
        if (!intersectMode.value || !map || !activeSnapCrossingCandidate) return;
        const current = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        const ly = current;
        if (!ly || !Array.isArray(ly.jsonData) || !isMapDrawnRoutesExportArray(ly.jsonData)) {
          return;
        }
        const cand = activeSnapCrossingCandidate;
        const next = applyCrossingToRows(ly.jsonData, cand);
        if (!next) return;
        ev.stopPropagation();
        ev.preventDefault();
        ly.jsonData = next;
        persistOsmPipelineLayerArtifactsIfApplicable(ly);
        refreshCrossingCandidatesCache();
        activeSnapCrossingCandidate = null;
        hideIntersectionHint();
        loadOrSyncLayers();
      };

      const exitIntersectMode = () => {
        if (intersectEscHandler) {
          window.removeEventListener('keydown', intersectEscHandler);
          intersectEscHandler = null;
        }
        intersectMode.value = false;
        activeSnapCrossingCandidate = null;
        stopIntersectionPulse();
        hideIntersectionHint();
        if (mapEl.value && !drawMode.value) mapEl.value.style.cursor = '';
        if (map) {
          const el = map.getContainer();
          if (intersectCaptureMove) {
            el.removeEventListener('mousemove', intersectCaptureMove, true);
            intersectCaptureMove = null;
          }
          if (intersectCaptureClick) {
            el.removeEventListener('click', intersectCaptureClick, true);
            intersectCaptureClick = null;
          }
        } else {
          intersectCaptureMove = null;
          intersectCaptureClick = null;
        }
      };

      const enterIntersectMode = () => {
        if (!map) return;
        intersectMode.value = true;
        refreshCrossingCandidatesCache();
        intersectCaptureMove = onIntersectCaptureMove;
        intersectCaptureClick = onIntersectCaptureClick;
        map.getContainer().addEventListener('mousemove', intersectCaptureMove, true);
        map.getContainer().addEventListener('click', intersectCaptureClick, true);
        const esc = (e) => {
          if (e.key !== 'Escape') return;
          exitIntersectMode();
        };
        intersectEscHandler = esc;
        window.addEventListener('keydown', intersectEscHandler);
      };

      const toggleIntersectMode = () => {
        if (intersectMode.value) exitIntersectMode();
        else {
          if (drawMode.value) exitDrawMode();
          enterIntersectMode();
        }
      };

      /** 目前圖層是否有可清空之地圖幾何（線／點／未完成的預覽） */
      const hasRenderableGeometryOnActiveLayer = computed(() => {
        if (drawPoints.value.length > 0) return true;
        const current = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        const ly = current;
        if (!ly) return false;
        if (Array.isArray(ly.jsonData) && ly.jsonData.length > 0) return true;
        const feats = ly.geojsonData?.features;
        return Array.isArray(feats) && feats.length > 0;
      });

      /** 清空目前作用圖層之線、站資料（含載入／匯出路線與 GeoJSON）；OSM 管線圖層一併清 session／衍生欄位 */
      const clearActiveLayerLinesAndPoints = () => {
        const ly = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
        if (!ly) return;
        const target = ly;
        if (
          !window.confirm(
            '確定清空目前圖層在地圖上的所有線段與站點？（含已載入／匯出的路段與 GeoJSON）'
          )
        ) {
          return;
        }
        if (drawMode.value) exitDrawMode();
        if (intersectMode.value) exitIntersectMode();
        drawPoints.value = [];
        clearDrawPreview();

        target.jsonData = null;
        target.geojsonData = { type: 'FeatureCollection', features: [] };
        target.processedJsonData = null;
        target.dashboardData = null;
        target.dataTableData = null;
        target.layerInfoData = null;

        if (target.layerId === OSM_PIPELINE_LAYER_ID) {
          setOsm2GeojsonSessionOsmXml('');
          persistOsmPipelineLayerArtifactsIfApplicable(target);
        }

        loadOrSyncLayers();
      };

      const loadOrSyncLayers = async (retryAttempt = 0) => {
        if (!mapEl.value) return;

        // 確保地圖已初始化
        ensureMap();

        // 等待地圖完全初始化
        await nextTick();

        if (!map) {
          // 如果超過最大重試次數，停止重試
          if (retryAttempt >= MAX_RETRY_COUNT) {
            // eslint-disable-next-line no-console
            console.error('Map initialization failed after maximum retries');
            return;
          }
          // eslint-disable-next-line no-console
          console.warn(`Map not initialized, retrying... (${retryAttempt + 1}/${MAX_RETRY_COUNT})`);
          setTimeout(() => {
            loadOrSyncLayers(retryAttempt + 1);
          }, 100);
          return;
        }

        // Only load the layer for the current active tab
        const currentLayer = allVisibleLayers.value.find((l) => l.layerId === activeLayerTab.value);

        try {
          // Remove all geojson layers from map
          try {
            map.eachLayer((layer) => {
              if (layer && layer.options && layer.options.layerId) {
                map.removeLayer(layer);
              }
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error removing layers:', err);
          }

          // Add the current layer's geojson if it exists
          if (currentLayer) {
            try {
              let geojson = null;

              // 優先使用 geojsonData（如果存在）
              if (
                currentLayer.geojsonData &&
                currentLayer.geojsonData.features &&
                Array.isArray(currentLayer.geojsonData.features)
              ) {
                geojson = currentLayer.geojsonData;
              }
              // 如果沒有 geojsonData，但有 geojsonFileName，從文件載入
              else if (currentLayer.geojsonFileName) {
                const baseUrl = process.env.BASE_URL || '/';
                const dataPath = `${baseUrl}data/${currentLayer.geojsonFileName}`;

                try {
                  const response = await fetch(dataPath);
                  if (response.ok) {
                    geojson = await response.json();
                  } else {
                    // 嘗試備用路徑
                    const fallbackPath = `/data/${currentLayer.geojsonFileName}`;
                    const fallbackResponse = await fetch(fallbackPath);
                    if (fallbackResponse.ok) {
                      geojson = await fallbackResponse.json();
                    }
                  }
                } catch (fetchError) {
                  // eslint-disable-next-line no-console
                  console.warn(
                    'Failed to load GeoJSON from file:',
                    currentLayer.geojsonFileName,
                    fetchError
                  );
                }
              }

              // 如果沒有找到 GeoJSON 數據，返回
              if (!geojson) {
                return;
              }

              // 驗證 GeoJSON 格式
              if (!geojson.features || !Array.isArray(geojson.features)) {
                console.warn('Invalid GeoJSON format:', currentLayer.layerId);
                return;
              }

              /** 有路段匯出 jsonData 時：只畫 segment 的 routeCoordinates（起–中–迄折線），端點依 type 上色 */
              const exportRows = mapDrawnExportRowsFromJsonDrawRoot(
                currentLayer.jsonData,
                currentLayer.dataJson
              );
              if (Array.isArray(exportRows) && isMapDrawnRoutesExportArray(exportRows)) {
                const routeLayerGroup = L.layerGroup();
                routeLayerGroup.options.layerId = currentLayer.layerId;
                const stationLayerGroup = L.layerGroup();
                stationLayerGroup.options.layerId = currentLayer.layerId;

                for (const row of exportRows) {
                  const chain = expandLonLatChainFromRouteCoordinates(row.routeCoordinates);
                  if (!chain || chain.length < 2) continue;
                  const latlngs = chain.map(([lon, lat]) => [lat, lon]);
                  const lineColor =
                    typeof row.color === 'string' && row.color.trim() !== ''
                      ? row.color.trim()
                      : '#666666';
                  const baseLine = {
                    color: lineColor,
                    weight: 3,
                    opacity: 0.9,
                    pane: 'overlayPane',
                  };
                  const hoverLine = {
                    color: lineColor,
                    weight: 8,
                    opacity: 1,
                    pane: 'overlayPane',
                  };
                  const seg = row.segment || {};
                  const popupHtml = `<div style="max-width: 340px;">${routeRowPolylinePopupHtml(
                    row,
                    chain
                  )}</div>`;
                  const poly = L.polyline(latlngs, baseLine);
                  if (poly.setPane) poly.setPane('overlayPane');
                  poly.bindPopup(popupHtml, { closeButton: true });
                  poly.on('mouseover', function () {
                    this.setStyle(hoverLine);
                    if (this.bringToFront) this.bringToFront();
                    this.openPopup();
                  });
                  poly.on('mouseout', function () {
                    this.setStyle(baseLine);
                    this.closePopup();
                  });
                  routeLayerGroup.addLayer(poly);

                  const bindEndpoint = (node) => {
                    const lon = segmentNodeLon(node);
                    const lat = segmentNodeLat(node);
                    if (!node || !Number.isFinite(lon) || !Number.isFinite(lat)) {
                      return;
                    }
                    const latlng = [lat, lon];
                    const base = circleStyleForJsonEndpointType(node.type, false);
                    const hoverSt = circleStyleForJsonEndpointType(node.type, true);
                    const m = L.circleMarker(latlng, base);
                    if (m.setPane) m.setPane('markerPane');
                    const phtml = `<div style="max-width: 340px;">${stationPopupHtmlFromNode(node)}</div>`;
                    m.bindPopup(phtml, { closeButton: true });
                    m.on('mouseover', function () {
                      this.setStyle(hoverSt);
                      if (this.bringToFront) this.bringToFront();
                      this.openPopup();
                    });
                    m.on('mouseout', function () {
                      this.setStyle(base);
                      this.closePopup();
                    });
                    stationLayerGroup.addLayer(m);
                  };
                  bindEndpoint(seg.start);
                  bindEndpoint(seg.end);
                  for (const st of seg.stations || []) {
                    const slon = segmentNodeLon(st);
                    const slat = segmentNodeLat(st);
                    if (!st || !Number.isFinite(slon) || !Number.isFinite(slat)) {
                      continue;
                    }
                    const latlng = [slat, slon];
                    const base = midStationCircleStyle(false);
                    const hoverSt = midStationCircleStyle(true);
                    const m = L.circleMarker(latlng, base);
                    if (m.setPane) m.setPane('markerPane');
                    m.bindPopup(
                      `<div style="max-width: 340px;">${stationPopupHtmlFromNode(st)}</div>`,
                      { closeButton: true }
                    );
                    m.on('mouseover', function () {
                      this.setStyle(hoverSt);
                      if (this.bringToFront) this.bringToFront();
                      this.openPopup();
                    });
                    m.on('mouseout', function () {
                      this.setStyle(base);
                      this.closePopup();
                    });
                    stationLayerGroup.addLayer(m);
                  }
                }

                routeLayerGroup.addTo(map);
                stationLayerGroup.addTo(map);
                await nextTick();
                fitBoundsIfAny();
                return;
              }

              const routeFeatures = geojson.features.filter(isGeoJsonWayLineFeature);
              const stationFeatures = geojson.features.filter(isGeoJsonNodePointFeature);

              // 創建路線圖層組
              const routeLayerGroup = L.layerGroup();
              routeLayerGroup.options.layerId = currentLayer.layerId;

              // 繪製路線
              routeFeatures.forEach((feature) => {
                const tags = getGeoJsonFeatureTagProps(feature);
                const routeColor = tags.color || '#666666';

                const baseRouteStyle = {
                  color: routeColor,
                  weight: 3,
                  opacity: 0.9,
                  fillColor: routeColor,
                  fillOpacity: 0.8,
                };
                const hoverRouteStyle = {
                  color: routeColor,
                  weight: 8,
                  opacity: 1,
                  fillColor: routeColor,
                  fillOpacity: 0.95,
                };

                const routeLayer = L.geoJSON(feature, {
                  style: baseRouteStyle,
                  pane: 'overlayPane', // 確保路線在 overlayPane
                });

                const applyRouteStyle = (style) => {
                  routeLayer.eachLayer((ly) => {
                    if (ly && typeof ly.setStyle === 'function') ly.setStyle(style);
                  });
                };

                // 添加 hover：整條線（同一 feature 內所有 path，含 MultiLineString）一併加粗高亮
                routeLayer.eachLayer((layer) => {
                  if (layer.setPane) {
                    layer.setPane('overlayPane');
                  }

                  const routeNameShown = tags.name ?? tags.route_name ?? '';
                  const routeColorShown = tags.color ?? routeColor;
                  const routeIdShown = routeIdFromGeoJsonWayTags(tags) || '';
                  const latlngRaw =
                    typeof layer.getLatLngs === 'function' ? layer.getLatLngs() : null;
                  const ll0 = firstNestedLatLng(latlngRaw);
                  const plon = ll0 != null ? ll0.lng : '';
                  const plat = ll0 != null ? ll0.lat : '';
                  const linePopupHtml = `<div style="max-width: 340px;"><strong>routeName</strong> ${escapeHtmlAttr(
                    routeNameShown
                  )}<br><strong>route_id</strong> ${escapeHtmlAttr(
                    routeIdShown
                  )}<br><strong>color</strong> ${escapeHtmlAttr(
                    routeColorShown
                  )}<br><strong>lon</strong> ${escapeHtmlAttr(plon)}<br><strong>lat</strong> ${escapeHtmlAttr(
                    plat
                  )}</div>`;

                  layer.bindPopup(linePopupHtml, {
                    closeButton: true,
                  });

                  layer.on('mouseover', function () {
                    applyRouteStyle(hoverRouteStyle);
                    routeLayer.eachLayer((ly) => {
                      if (ly && typeof ly.bringToFront === 'function') ly.bringToFront();
                    });
                    this.openPopup();
                  });
                  layer.on('mouseout', function () {
                    applyRouteStyle(baseRouteStyle);
                    this.closePopup();
                  });
                });

                routeLayerGroup.addLayer(routeLayer);
              });

              // 創建車站圖層組（使用較高的 pane 確保在上方）
              const stationLayerGroup = L.layerGroup();
              stationLayerGroup.options.layerId = currentLayer.layerId;

              // 繪製車站（依 JSON／tags 之 type：terminal 藍、intersection 紅、其餘黑）
              stationFeatures.forEach((feature) => {
                const tags = getGeoJsonFeatureTagProps(feature);
                const ptType = normalizeRouteSegmentEndpointType(tags.type);
                const baseStationStyle = circleStyleForJsonEndpointType(ptType, false);
                const hoverStationStyle = circleStyleForJsonEndpointType(ptType, true);
                const c = feature.geometry?.coordinates;
                let rnl = tags.route_name_list;
                if (typeof rnl === 'string') {
                  try {
                    rnl = JSON.parse(rnl);
                  } catch {
                    rnl = [];
                  }
                }
                if (!Array.isArray(rnl)) rnl = [];
                const plon = Number(c?.[0]);
                const plat = Number(c?.[1]);
                const nodeForPopup = {
                  ...ensureSegmentStationStrings(
                    {
                      station_id: tags.station_id ?? '',
                      station_name: tags.station_name ?? tags.name ?? '',
                      route_name_list: rnl,
                      type: tags.type,
                      connect_number: tags.connect_number,
                    },
                    plon,
                    plat
                  ),
                  lon: c?.[0],
                  lat: c?.[1],
                };
                const stationPopupBlock = `<div style="max-width: 340px;">${stationPopupHtmlFromNode(
                  nodeForPopup
                )}</div>`;

                const stationLayer = L.geoJSON(feature, {
                  pointToLayer: (feature, latlng) =>
                    L.circleMarker(latlng, { ...baseStationStyle }),
                });

                const applyStationStyle = (style) => {
                  stationLayer.eachLayer((ly) => {
                    if (ly && typeof ly.setStyle === 'function') ly.setStyle(style);
                  });
                };

                // hover：整個點（同一 feature 之 circleMarker）放大並變色
                stationLayer.eachLayer((layer) => {
                  if (layer.setPane) {
                    layer.setPane('markerPane');
                  }

                  layer.bindPopup(stationPopupBlock, {
                    closeButton: true,
                  });

                  layer.on('mouseover', function () {
                    applyStationStyle(hoverStationStyle);
                    if (typeof this.bringToFront === 'function') this.bringToFront();
                    this.openPopup();
                  });
                  layer.on('mouseout', function () {
                    applyStationStyle(baseStationStyle);
                    this.closePopup();
                  });
                });

                stationLayerGroup.addLayer(stationLayer);
              });

              // 先添加路線圖層（下層）
              routeLayerGroup.addTo(map);
              // 再添加車站圖層（上層）
              stationLayerGroup.addTo(map);

              // Fit bounds to the loaded layer
              await nextTick();
              fitBoundsIfAny();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('Load GeoJSON from jsonData failed:', currentLayer.layerId, e);
            }
          }
        } finally {
          await nextTick();
          if (intersectMode.value && map) {
            refreshCrossingCandidatesCache();
          }
        }
      };

      const invalidateSize = () => {
        if (!map) return;
        nextTick(() => {
          try {
            map.invalidateSize();
          } catch (err) {
            void err;
          }
        });
      };

      onMounted(() => {
        // 延遲初始化，確保 DOM 已準備好
        nextTick(() => {
          setTimeout(() => {
            // 初始化地圖，不管是否有可見圖層
            ensureMap();

            // 如果有可見圖層，載入圖層數據
            if (allVisibleLayers.value.length > 0) {
              loadOrSyncLayers();
            }

            // 確保地圖尺寸正確
            setTimeout(() => {
              invalidateSize();
            }, 200);
          }, 100);
        });
      });

      // Watch basemap changes
      watch(
        () => mapStore.selectedBasemap,
        () => {
          if (map) {
            setBasemap();
          }
        }
      );

      onUnmounted(() => {
        // 清理畫線／交叉點模式
        if (drawMode.value) exitDrawMode();
        if (intersectMode.value) exitIntersectMode();

        // 清理地圖實例
        if (map) {
          try {
            map.remove();
          } catch (err) {
            void err;
          }
          map = null;
        }

        // 清理圖層狀態
        layerStates.clear();
        currentLayerId = null;
        currentTileLayer = null;
        townshipBoundaryLayer = null;

        // 清理 DOM 元素
        if (mapEl.value) {
          if (mapEl.value._leaflet_id) {
            delete mapEl.value._leaflet_id;
          }
          mapEl.value.innerHTML = '';
        }
      });

      watch(
        () => dataStore.layers,
        () => {
          loadOrSyncLayers();
        },
        { deep: true }
      );

      // Watch for changes in all visible layers (including those without geojson)
      watch(
        () => allVisibleLayers.value.length,
        (newLength, oldLength) => {
          // 當從沒有圖層變為有圖層時，強制重新創建地圖
          if (oldLength === 0 && newLength > 0) {
            // 清理舊的地圖實例
            if (map) {
              try {
                map.remove();
              } catch (err) {
                void err;
              }
              map = null;
            }

            nextTick(() => {
              setTimeout(() => {
                ensureMap();
                loadOrSyncLayers();
                setTimeout(() => {
                  invalidateSize();
                }, 100);
              }, 100);
            });
          } else if (newLength > 0) {
            // 正常情況下的更新
            nextTick(() => {
              // 確保地圖已初始化
              ensureMap();

              // 如果有可見圖層，載入圖層數據
              setTimeout(() => {
                loadOrSyncLayers();
              }, 50);

              // 確保地圖尺寸正確
              setTimeout(() => {
                invalidateSize();
              }, 100);
            });
          }
        }
      );

      // Tab functionality similar to D3jsTab
      const activeLayerTab = ref(null);

      // Use allVisibleLayers for tab functionality (includes layers without geojson)
      const visibleLayers = allVisibleLayers;

      // Set active layer tab
      const setActiveLayerTab = (layerId) => {
        if (activeLayerTab.value === layerId) {
          return;
        }

        if (drawMode.value) exitDrawMode();
        if (intersectMode.value) exitIntersectMode();

        // 保存當前地圖狀態
        if (map && currentLayerId) {
          try {
            const stateToSave = {
              center: map.getCenter(),
              zoom: map.getZoom(),
              isTownshipVisible: townshipBoundaryLayer
                ? map.hasLayer(townshipBoundaryLayer)
                : false,
              selectedBasemap: mapStore.selectedBasemap,
            };
            const existingState = layerStates.get(currentLayerId) || {};
            layerStates.set(currentLayerId, { ...existingState, ...stateToSave });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('Error saving layer state:', err);
          }
        }

        // 切換到新的圖層
        activeLayerTab.value = layerId;
        currentLayerId = layerId;

        // 通知父層目前 UpperView 的作用圖層
        emit('active-layer-change', activeLayerTab.value);

        // 確保地圖已初始化
        nextTick(() => {
          ensureMap();

          // 恢復圖層狀態（底圖）
          if (layerId && layerStates.has(layerId)) {
            const layerState = layerStates.get(layerId);
            if (
              layerState.selectedBasemap &&
              layerState.selectedBasemap !== mapStore.selectedBasemap
            ) {
              mapStore.setSelectedBasemap(layerState.selectedBasemap);
            }
          }

          // 載入當前圖層的 GeoJSON 數據
          setTimeout(() => {
            loadOrSyncLayers();

            // 恢復圖層狀態（視圖和邊界）
            if (layerId && layerStates.has(layerId) && map) {
              const layerState = layerStates.get(layerId);
              try {
                map.setView(layerState.center, layerState.zoom);

                // 恢復鄉鎮區界狀態
                if (
                  layerState.isTownshipVisible &&
                  (!townshipBoundaryLayer || !map.hasLayer(townshipBoundaryLayer))
                ) {
                  if (!townshipBoundaryLayer) {
                    townshipBoundaryLayer = L.tileLayer(
                      'https://wmts.nlsc.gov.tw/wmts/TOWN/default/EPSG:3857/{z}/{y}/{x}.png',
                      {
                        attribution: '內政部國土測繪中心',
                        maxZoom: 20,
                        opacity: 1,
                      }
                    );
                  }
                  townshipBoundaryLayer.addTo(map);
                  if (townshipBoundaryLayer.setZIndex) {
                    townshipBoundaryLayer.setZIndex(100);
                  }
                } else if (
                  !layerState.isTownshipVisible &&
                  townshipBoundaryLayer &&
                  map.hasLayer(townshipBoundaryLayer)
                ) {
                  map.removeLayer(townshipBoundaryLayer);
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('Error restoring layer state:', err);
              }
            }
          }, 100);
        });
      };

      // Get layer full title with group name
      const getLayerFullTitle = (layer) => {
        if (!layer) return { groupName: null, layerName: '未知圖層' };
        const groupName = dataStore.findGroupNameByLayerId(layer.layerId);
        return {
          groupName: groupName,
          layerName: layer.layerName,
        };
      };

      // Watch for visible layers changes and auto-select first layer
      watch(
        () => visibleLayers.value,
        (newLayers) => {
          if (newLayers.length === 0) {
            activeLayerTab.value = null;
            currentLayerId = null;
            return;
          }
          if (
            !activeLayerTab.value ||
            !newLayers.find((layer) => layer.layerId === activeLayerTab.value)
          ) {
            setActiveLayerTab(newLayers[0].layerId);
          }
        },
        { deep: true, immediate: true }
      );

      /** 與 Control／Left 選取之圖層對齊（避免 Upper 地圖分頁仍停在別的可見圖層） */
      watch(
        () => dataStore.controlActiveLayerId,
        (id) => {
          if (!id) return;
          const list = visibleLayers.value;
          if (!list.some((l) => l.layerId === id)) return;
          if (activeLayerTab.value !== id) {
            setActiveLayerTab(id);
          }
        },
        { flush: 'post' }
      );

      return {
        mapEl,
        invalidateSize,
        selectedBasemap: computed(() => mapStore.selectedBasemap),
        changeBasemap,
        getBasemapLabel,
        toggleTownshipBoundary,
        townshipBoundaryButtonLabel,
        showAllFeatures,
        showFullCity,
        isAnyLayerVisible,
        mapStore,
        visibleGeojsonLayers,
        allVisibleLayers,
        activeLeftTab,
        // Tab functionality
        activeLayerTab,
        visibleLayers,
        setActiveLayerTab,
        getLayerFullTitle,
        // Draw mode
        drawMode,
        drawPoints,
        toggleDrawMode,
        undoLastDrawnLine,
        hasDrawnLines,
        clearActiveLayerLinesAndPoints,
        hasRenderableGeometryOnActiveLayer,
        intersectMode,
        toggleIntersectMode,
        canUseCrossingTool,
      };
    },
  };
</script>

<template>
  <div class="d-flex flex-column h-100">
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
      v-if="allVisibleLayers.length > 0"
      class="flex-grow-1 d-flex flex-column my-bgcolor-white"
      style="min-height: 0"
    >
      <!-- 地圖容器 -->
      <div class="flex-grow-1 position-relative">
        <div ref="mapEl" class="w-100 h-100 map-container"></div>

        <!-- 地圖底部控制項區域 -->
        <div
          class="position-absolute map-bottom-controls d-flex align-items-center rounded-pill shadow my-blur gap-2 p-2 mb-3"
        >
          <!-- 畫線模式 -->
          <button
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer"
            :class="drawMode ? 'btn-warning' : 'my-btn-transparent'"
            :title="
              drawMode
                ? '退出畫線模式（ESC / 再按一次）'
                : '進入畫線模式（在地圖上點擊畫線，雙擊完成）'
            "
            @click="toggleDrawMode"
          >
            {{ drawMode ? '畫線中…' : '畫線' }}
          </button>

          <!-- 交叉點：同線自交或兩線相交之內部打斷 -->
          <button
            class="btn rounded-pill border-0 my-font-size-xs text-nowrap my-cursor-pointer"
            :class="intersectMode ? 'btn-danger' : 'my-btn-transparent'"
            title="於交叉處（同一路線自交或兩線相交）點擊打斷並新增交叉點（紅）；靠近會出現提示"
            :disabled="!canUseCrossingTool"
            @click="toggleIntersectMode"
          >
            {{ intersectMode ? '交叉點…' : '交叉點' }}
          </button>

          <!-- 撤銷最後一段手繪線 -->
          <button
            v-if="hasDrawnLines"
            class="btn rounded-pill border-0 my-btn-transparent my-font-size-xs text-nowrap my-cursor-pointer"
            title="撤銷最後一段手繪路線"
            @click="undoLastDrawnLine"
          >
            撤銷
          </button>

          <button
            class="btn rounded-pill border-0 my-btn-transparent my-font-size-xs text-nowrap my-cursor-pointer text-danger"
            title="清空目前圖層所有線段與站點"
            :disabled="!hasRenderableGeometryOnActiveLayer"
            @click="clearActiveLayerLinesAndPoints"
          >
            全部清空
          </button>

          <!-- 畫線模式提示 -->
          <span v-if="drawMode" class="my-font-size-xs text-warning-emphasis text-nowrap px-1">
            單擊加點・雙擊完成・ESC 取消
          </span>

          <span v-if="intersectMode" class="my-font-size-xs text-danger-emphasis text-nowrap px-1">
            靠近兩線交叉處可看見提示・點擊打斷並新增交叉點・ESC 結束
          </span>

          <div v-if="!drawMode && !intersectMode" class="d-flex align-items-center">
            <div class="dropdown dropup">
              <button
                class="btn rounded-pill border-0 my-btn-transparent my-font-size-xs text-nowrap"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                {{ getBasemapLabel(selectedBasemap) }}
              </button>
              <ul class="dropdown-menu">
                <li v-for="basemap in mapStore.basemaps" :key="basemap.value">
                  <a
                    class="dropdown-item my-content-xs-black py-1"
                    href="#"
                    @click.prevent="changeBasemap(basemap.value)"
                  >
                    {{ basemap.label }}
                  </a>
                </li>
              </ul>
            </div>

            <!-- 顯示鄉鎮區界 -->
            <button
              class="btn rounded-pill border-0 my-btn-transparent my-font-size-xs text-nowrap my-cursor-pointer"
              :title="
                townshipBoundaryButtonLabel === '隱藏鄉鎮區界'
                  ? '隱藏鄉鎮區界圖層'
                  : '顯示鄉鎮區界圖層'
              "
              @click="toggleTownshipBoundary"
            >
              {{ townshipBoundaryButtonLabel }}
            </button>

            <!-- 顯示全部 -->
            <button
              class="btn rounded-pill border-0 my-btn-transparent my-font-size-xs text-nowrap my-cursor-pointer"
              @click="showAllFeatures"
              :disabled="!isAnyLayerVisible"
              title="顯示圖面所有資料範圍"
            >
              顯示全部
            </button>

            <!-- 顯示全市 -->
            <button
              class="btn rounded-pill border-0 my-btn-transparent my-font-size-xs text-nowrap my-cursor-pointer"
              @click="showFullCity"
              title="回到預設地圖範圍"
            >
              顯示全市
            </button>
          </div>
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
  .w-100 {
    width: 100%;
  }
  .h-100 {
    height: 100%;
  }

  /* 地圖容器樣式 */
  .map-container {
    position: relative;
    background-color: #f0f0f0;
  }

  /* 地圖底部控制項樣式 */
  .map-bottom-controls {
    bottom: 0px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2000;
  }
</style>

<!-- Leaflet 工具提示掛在 body，需非 scoped -->
<style>
  .leaflet-tooltip.map-tab-intersection-hint-tooltip {
    background: rgba(220, 53, 69, 0.95);
    color: #fff;
    border: 1px solid #ffc107;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  .leaflet-tooltip.map-tab-intersection-hint-tooltip::before {
    border-top-color: rgba(220, 53, 69, 0.95);
  }
</style>
