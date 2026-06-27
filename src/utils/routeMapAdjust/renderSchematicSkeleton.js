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

const nodeFill = (tags) => tags?.node_class_color || '#555555';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const rowHtml = (k, v) =>
  v == null || v === '' ? '' : `<div><span style="color:#888">${esc(k)}</span> ${esc(v)}</div>`;

// 線 tooltip：與路線圖 hover 相同樣式（route_name/route_id/railway/color）
const wayTooltipHtml = (tags) =>
  `<div style="font-size:12px;line-height:1.5">` +
  rowHtml('route_name', tags.route_name) +
  rowHtml('route_id', tags.route_id) +
  rowHtml('railway', tags.railway) +
  rowHtml('color', tags.color) +
  `</div>`;

// 點 tooltip：與路線圖站點 hover 相同樣式（station_name/station_id/type/route_name_list）
const nodeTooltipHtml = (tags) => {
  const list = Array.isArray(tags.route_name_list)
    ? tags.route_name_list.filter(Boolean)
    : [];
  return (
    `<div style="font-size:12px;line-height:1.5">` +
    rowHtml('station_name', tags.station_name) +
    rowHtml('station_id', tags.station_id) +
    rowHtml('type', tags.node_kind === 'black' ? '一般 normal' : tags.type) +
    (list.length
      ? `<div><span style="color:#888">route_name_list</span> ${esc(list.join('、'))}</div>`
      : '') +
    `</div>`
  );
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
          const pl = L.polyline(latlngs, {
            color: tags.color || '#666666',
            weight: 4,
            opacity: 0.9,
            interactive: true,
          });
          pl.bindTooltip(wayTooltipHtml(tags), { sticky: true });
          pl.on('mouseover', () => pl.setStyle({ weight: 8 }));
          pl.on('mouseout', () => pl.setStyle({ weight: 4 }));
          pl.addTo(lineGroup);
          for (const ll of latlngs) pts.push(ll);
        }
      } else if (g?.type === 'Point') {
        const [lng, lat] = g.coordinates || [];
        if (lng == null || lat == null) continue;
        const r = Number(tags.node_class_r) || 5;
        const m = L.circleMarker([lat, lng], {
          radius: r,
          color: '#ffffff', // 白色 1px border
          weight: 1,
          fillColor: nodeFill(tags),
          fillOpacity: 1,
          interactive: true,
          pane: 'schDots',
        });
        m.bindTooltip(nodeTooltipHtml(tags), { sticky: true });
        m.on('mouseover', () => m.setRadius(r + 3));
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
