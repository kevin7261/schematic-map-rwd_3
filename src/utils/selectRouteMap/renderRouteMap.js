/**
 * 🗺️ 選擇路線圖（select_route_map）— Leaflet 唯讀顯示
 *
 * ⚠️ 本檔為「選擇路線圖」圖層**獨立複製**之版本，刻意不與 SpaceNetworkGridTab 的
 *    Leaflet 畫線渲染共用任何程式。為唯讀顯示：畫出載入的路線與三類站點（端點藍／
 *    交點紅／黑點），hover 顯示屬性，並可由 store 觸發一次性 fitBounds；不含任何
 *    畫線／畫黑點等編輯互動。
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { watch } from 'vue';
import { computeRouteMapStations } from './routeStations.js';
import { SELECT_ROUTE_MAP_LAYER_ID } from './cityCatalog.js';

/**
 * 在指定 DOM 容器上掛載「選擇路線圖」的 Leaflet 地圖。
 * @param {HTMLElement} el 容器（須已有尺寸）
 * @param {*} dataStore Pinia dataStore 實例
 * @returns {{ invalidateSize: () => void, destroy: () => void }}
 */
export function mountRouteMap(el, dataStore) {
  const layer = dataStore.findLayerById(SELECT_ROUTE_MAP_LAYER_ID);
  if (!el || !layer) {
    return { invalidateSize: () => {}, destroy: () => {} };
  }
  if (!Array.isArray(layer.selectRouteMapLines)) layer.selectRouteMapLines = [];
  if (!Array.isArray(layer.selectRouteMapBlackDots)) layer.selectRouteMapBlackDots = [];

  if (el._leaflet_id) delete el._leaflet_id;
  el.innerHTML = '';

  const map = L.map(el, {
    center: [25.0478, 121.5319], // 台北車站附近
    zoom: 12,
    zoomControl: true,
    attributionControl: false,
  });

  // 底圖：CartoDB Positron（乾淨淺色）
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);
  // 疊加：OpenRailwayMap 鐵道／捷運路線
  L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
  }).addTo(map);

  // 自訂 pane 控制疊放順序：線(overlayPane 400) < 站名 < 站點圓點
  //  → 站名永遠在圓點「之下」，名稱絕不會擋到任何站點
  map.createPane('srmNames');
  map.getPane('srmNames').style.zIndex = 450;
  map.createPane('srmDots');
  map.getPane('srmDots').style.zIndex = 460;
  map.getPane('srmNames').style.pointerEvents = 'none';

  const finishedGroup = L.layerGroup().addTo(map);
  const stationGroup = L.layerGroup().addTo(map);
  const nameGroup = L.layerGroup().addTo(map); // 🏷️ 車站名常駐標籤（由開關控制）

  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]
    );
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

  const buildRoutesAtCoord = () => {
    const m = new Map();
    for (const ln of layer.selectRouteMapLines || []) {
      if (!ln || !Array.isArray(ln.latlngs)) continue;
      for (const c of ln.latlngs) {
        const k = llKey(c[0], c[1]);
        let set = m.get(k);
        if (!set) {
          set = new Set();
          m.set(k, set);
        }
        if (ln.routeName) set.add(ln.routeName);
      }
    }
    return m;
  };
  const stationTooltipHtml = (latlng, type, routesAtCoord) => {
    const k = llKey(latlng[0], latlng[1]);
    const meta = (layer.selectRouteMapStationMeta && layer.selectRouteMapStationMeta[k]) || {};
    const routes = [...(routesAtCoord.get(k) || [])];
    return (
      `<div style="font-size:12px;line-height:1.5">` +
      rowHtml('station_name', meta.name) +
      rowHtml('station_id', meta.id) +
      rowHtml('osm_id', meta.osmId) +
      rowHtml('type', typeLabel(type)) +
      (routes.length
        ? `<div><span style="color:#888">route_name_list</span> ${esc(routes.join('、'))}</div>`
        : '') +
      `</div>`
    );
  };

  const renderFinished = () => {
    finishedGroup.clearLayers();
    for (const ln of layer.selectRouteMapLines) {
      if (!ln || !Array.isArray(ln.latlngs) || ln.latlngs.length < 2) continue;
      const baseWeight = 4;
      const pl = L.polyline(ln.latlngs, {
        color: ln.color || '#e6194b',
        weight: baseWeight,
        opacity: 0.9,
        interactive: true,
      });
      pl.bindTooltip(lineTooltipHtml(ln), { sticky: true });
      // hover：線加粗
      pl.on('mouseover', () => pl.setStyle({ weight: baseWeight + 4 }));
      pl.on('mouseout', () => pl.setStyle({ weight: baseWeight }));
      pl.addTo(finishedGroup);
    }
  };

  const renderStations = () => {
    stationGroup.clearLayers();
    // 站點座標（來自 stationMeta 的 key "lat,lng"）→ 讓分類「只」在真實車站，不在共軌/交叉非站點冒紅點
    const stationCoords = Object.keys(layer.selectRouteMapStationMeta || {}).map((k) =>
      k.split(',').map(Number)
    );
    const { terminals, connects, blacks } = computeRouteMapStations(
      layer.selectRouteMapLines,
      layer.selectRouteMapBlackDots,
      stationCoords
    );
    const routesAtCoord = buildRoutesAtCoord();
    const addStationDot = (latlng, fillColor, radius, type) => {
      // 🔴🔵 端點/交點：先畫白色底圈「切斷」路線（路線中間不可有紅/藍點 → 落在白色缺口中）
      if (type === 'connect' || type === 'terminal') {
        L.circleMarker(latlng, {
          radius: radius + 3,
          color: '#ffffff',
          weight: 0,
          fillColor: '#ffffff',
          fillOpacity: 1,
          interactive: false,
          pane: 'srmDots',
        }).addTo(stationGroup);
      }
      const m = L.circleMarker(latlng, {
        radius,
        color: fillColor,
        weight: 1,
        fillColor,
        fillOpacity: 1,
        interactive: true,
        pane: 'srmDots', // 圓點置於最上層 pane，永遠不被站名遮住
      });
      m.bindTooltip(stationTooltipHtml(latlng, type, routesAtCoord), { sticky: true });
      // hover：圓點放大
      m.on('mouseover', () => m.setRadius(radius + 3));
      m.on('mouseout', () => m.setRadius(radius));
      m.addTo(stationGroup);
    };
    // 繪製順序：黑點 → 端點(藍) → 交點(紅)，讓交點顯示在最上層
    blacks.forEach((p) => addStationDot(p, '#000000', 3, 'black'));
    terminals.forEach((p) => addStationDot(p, '#1565c0', 4, 'terminal'));
    connects.forEach((p) => addStationDot(p, '#ff0000', 4, 'connect'));
  };

  // 🏷️ 車站名常駐標籤：開關開啟時，於有 station_name 的站點「直接寫字」顯示名稱
  //    （非 tooltip／popup，而是以 divIcon 將文字直接畫在地圖上）
  const renderNames = () => {
    nameGroup.clearLayers();
    if (!layer.selectRouteMapShowNames) return;
    const { terminals, connects, blacks } = computeRouteMapStations(
      layer.selectRouteMapLines,
      layer.selectRouteMapBlackDots
    );
    // 站名顏色與站點圓點一致：交點紅 > 端點藍 > 黑點黑（順序＝圓點疊放優先序，
    // 讓「同時是端點又是交點」的站，名稱取與最上層圓點相同的顏色＝紅）。
    const entries = [
      ...connects.map((p) => ({ p, fontSize: 13, color: '#ff0000' })),
      ...terminals.map((p) => ({ p, fontSize: 13, color: '#1565c0' })),
      ...blacks.map((p) => ({ p, fontSize: 10, color: '#000000' })),
    ];
    const seen = new Set();
    entries.forEach(({ p, fontSize, color }) => {
      const k = llKey(p[0], p[1]);
      if (seen.has(k)) return;
      seen.add(k);
      const meta = (layer.selectRouteMapStationMeta && layer.selectRouteMapStationMeta[k]) || {};
      if (!meta.name) return;
      const icon = L.divIcon({
        className: 'select-route-map-station-name',
        // 置於站點「正上方」並留間距，避免文字蓋住站點圓點（translate -100% 讓文字底緣對齊錨點，top 再上移清開圓點半徑）
        html: `<span style="position:absolute;left:0;top:-7px;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;font-size:${fontSize}px;line-height:1.2;font-weight:600;color:${color};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;pointer-events:none">${esc(meta.name)}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(p, { icon, interactive: false, keyboard: false, pane: 'srmNames' }).addTo(nameGroup);
    });
  };

  const renderAll = () => {
    renderFinished();
    renderStations();
    renderNames();
  };
  renderAll();

  // 反應式重繪：載入／清除等外部變更時即時更新地圖
  const stopLinesWatch = watch(
    () => [
      layer.selectRouteMapLines,
      layer.selectRouteMapBlackDots,
      layer.selectRouteMapShowNames,
    ],
    renderAll,
    { deep: true }
  );

  // 一次性縮放到目前所有線（載入城市後由 store 觸發）
  const fitToContent = () => {
    const pts = [];
    for (const ln of layer.selectRouteMapLines || []) {
      if (ln && Array.isArray(ln.latlngs)) pts.push(...ln.latlngs);
    }
    (layer.selectRouteMapBlackDots || []).forEach((p) => pts.push(p));
    if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
  };
  const stopFitWatch = watch(() => dataStore.selectRouteMapFitTrigger, fitToContent);
  // 初次掛載時若已有資料，縮放到內容
  fitToContent();

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
        stopLinesWatch();
      } catch (e) {
        void e;
      }
      try {
        stopFitWatch();
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
