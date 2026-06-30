/**
 * 🗺️ 三個示意圖佈局圖層（schematic_rma_*）之**獨立**載入顯示。
 *
 * 載入後直接畫出「路線圖轉換骨架」的骨架 geojson（layer.geojsonData）：
 *  - 線：底色＋原色畫法 — 先以 way tags.hl_color（🔴 合併／🔵 頭尾共點／🟢 環線）墊在底下，
 *        上面再畫 way tags.color（路線原來的顏色）；無 hl_color 者只畫原色。
 *  - 點：用 node tags.node_class_color（🟡 交叉／🟣 切斷／🖤 黑點站）或型別預設色；白色 1px border、置於最上層。
 * 不經共用的 SpaceNetworkGridTab，顏色完全自控、與骨架一致。
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { watch } from 'vue';
import { bindLeafletHoverOrControlPanel } from '@/utils/control/pipelineMapHoverDisplay.js';
import {
  tooltipRowHtml as rowHtml,
  schematicWayColorHtml,
  parseSchematicNodeRoutes,
  pipelineStationTooltipHtml,
  schematicSkeletonNodeDisplay,
} from '@/utils/control/pipelineMapHoverHtml.js';

const SCHEMATIC_COLORED_DOT_R = 4;
const SCHEMATIC_COLORED_DOT_STROKE = '#ffffff';
const SCHEMATIC_COLORED_DOT_STROKE_W = 1;
const nodeFill = (tags) => tags?.node_class_color || '#555555';

// 線 tooltip：route_name/route_id/railway + 路線色（單色或多色 route_colors）
const wayTooltipHtml = (tags) =>
  `<div style="font-size:12px;line-height:1.5">` +
  rowHtml('route_name', tags.route_name) +
  rowHtml('route_id', tags.route_id) +
  rowHtml('railway', tags.railway) +
  schematicWayColorHtml(tags) +
  `</div>`;

// 點 tooltip：站名 + 各路線色塊
const nodeTooltipHtml = (props) => {
  const bag = props && typeof props === 'object' ? props : {};
  const tags = bag.tags && typeof bag.tags === 'object' ? bag.tags : {};
  const stationName = bag.station_name ?? tags.station_name ?? tags.name ?? '';
  const stationId = bag.station_id ?? tags.station_id ?? '';
  const routes = parseSchematicNodeRoutes(tags, bag);
  const disp = schematicSkeletonNodeDisplay(tags, bag);
  return pipelineStationTooltipHtml({
    meta: { name: stationName, id: stationId },
    typeLabel: disp.typeLabel,
    stationDotColor: disp.color,
    stationColorReason: disp.reason,
    routes,
  });
};

export function mountSchematicSkeleton(el, dataStore) {
  if (!el) return { invalidateSize: () => {}, destroy: () => {} };
  if (el._leaflet_id) delete el._leaflet_id;
  el.innerHTML = '';

  const map = L.map(el, {
    center: [25.0478, 121.5319],
    zoom: 12,
    zoomControl: true,
    attributionControl: false,
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);
  map.createPane('schUnder');
  map.getPane('schUnder').style.zIndex = 350; // 共線/環線/頭尾共點底色，墊在路線(overlayPane 400)底下
  map.createPane('schDots');
  map.getPane('schDots').style.zIndex = 460; // 點永遠在線之上

  const lineGroup = L.layerGroup().addTo(map);
  const dotGroup = L.layerGroup().addTo(map);

  const render = () => {
    lineGroup.clearLayers();
    dotGroup.clearLayers();
    const id = dataStore.routeSchematicActiveLayerId;
    const layer = id ? dataStore.findLayerById(id) : null;
    const fc = layer?.geojsonData;
    const feats = Array.isArray(fc?.features) ? fc.features : [];
    const pts = [];
    for (const f of feats) {
      const g = f?.geometry;
      const tags = f?.properties?.tags || {};
      if (g?.type === 'LineString') {
        const latlngs = (g.coordinates || []).map(([lng, lat]) => [lat, lng]);
        if (latlngs.length >= 2) {
          // 🔴🔵🟢 共線/環線/頭尾共點底色：墊在路線底下，上面才畫路線原來的顏色
          if (tags.hl_color) {
            L.polyline(latlngs, {
              color: tags.hl_color,
              weight: 12,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
              interactive: false,
              pane: 'schUnder',
            }).addTo(lineGroup);
          }
          // 顏色：1 種→實線；≥2 種→同一路徑疊畫多條虛線、dash 交錯，所有顏色同時呈現
          const colors = String(tags.route_colors || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const baseW = 4;
          if (colors.length >= 2) {
            const N = colors.length;
            const dashLen = 8;
            const dashArray = `${dashLen} ${dashLen * (N - 1)}`;
            const pls = colors.map((c, i) =>
              L.polyline(latlngs, {
                color: c,
                weight: baseW,
                opacity: 0.95,
                interactive: true,
                dashArray,
                dashOffset: String(dashLen * i),
              })
            );
            pls.forEach((pl) => {
              bindLeafletHoverOrControlPanel(pl, id, dataStore, wayTooltipHtml(tags));
              pl.on('mouseover', () => pls.forEach((q) => q.setStyle({ weight: baseW + 4 })));
              pl.on('mouseout', () => pls.forEach((q) => q.setStyle({ weight: baseW })));
              pl.addTo(lineGroup);
            });
          } else {
            const pl = L.polyline(latlngs, {
              color: tags.color || '#666666',
              weight: baseW,
              opacity: 0.9,
              interactive: true,
            });
            bindLeafletHoverOrControlPanel(pl, id, dataStore, wayTooltipHtml(tags));
            pl.on('mouseover', () => pl.setStyle({ weight: 8 }));
            pl.on('mouseout', () => pl.setStyle({ weight: 4 }));
            pl.addTo(lineGroup);
          }
          for (const ll of latlngs) pts.push(ll);
        }
      } else if (g?.type === 'Point') {
        const [lng, lat] = g.coordinates || [];
        if (lng == null || lat == null) continue;
        const nodeProps = f?.properties || {};
        const r = SCHEMATIC_COLORED_DOT_R;
        const m = L.circleMarker([lat, lng], {
          radius: r,
          color: SCHEMATIC_COLORED_DOT_STROKE,
          weight: SCHEMATIC_COLORED_DOT_STROKE_W,
          fillColor: nodeFill(tags),
          fillOpacity: 1,
          interactive: true,
          pane: 'schDots',
        });
        bindLeafletHoverOrControlPanel(m, id, dataStore, nodeTooltipHtml(nodeProps));
        m.on('mouseover', () => m.setRadius(r + 2));
        m.on('mouseout', () => m.setRadius(r));
        m.addTo(dotGroup);
        pts.push([lat, lng]);
      }
    }
    if (pts.length >= 2) {
      try {
        map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
      } catch (e) {
        void e;
      }
    }
  };

  render();
  const stop = watch(
    () => [dataStore.routeSchematicActiveLayerId, dataStore.routeSchematicTick],
    render
  );

  return {
    invalidateSize: () => {
      try {
        map.invalidateSize();
      } catch (e) {
        void e;
      }
    },
    destroy: () => {
      try {
        stop();
      } catch (e) {
        void e;
      }
      try {
        map.remove();
      } catch (e) {
        void e;
      }
    },
  };
}
