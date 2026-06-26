/**
 * 🗺️ 路線圖調整（route_map_adjust）— Leaflet 唯讀顯示
 *
 * ⚠️ 本檔為「路線圖調整」圖層**獨立複製**之版本，刻意不與 select_route_map / SpaceNetworkGridTab
 *    的渲染共用任何程式。為唯讀顯示：畫出載入的路線與三類站點（端點藍／交點紅／黑點），
 *    hover 顯示屬性，並可由 store 觸發一次性 fitBounds；不含任何編輯互動。
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { watch } from 'vue';
import {
  computeRouteMapAdjustStations,
  computeRouteMapAdjustSharedEndpointSegments,
} from './routeStations.js';
import { ROUTE_MAP_ADJUST_LAYER_ID } from './loadFromSelectRouteMap.js';

/**
 * 在指定 DOM 容器上掛載「路線圖調整」的 Leaflet 地圖。
 * @param {HTMLElement} el 容器（須已有尺寸）
 * @param {*} dataStore Pinia dataStore 實例
 * @returns {{ invalidateSize: () => void, destroy: () => void }}
 */
export function mountRouteMapAdjust(el, dataStore) {
  const layer = dataStore.findLayerById(ROUTE_MAP_ADJUST_LAYER_ID);
  if (!el || !layer) {
    return { invalidateSize: () => {}, destroy: () => {} };
  }
  if (!Array.isArray(layer.routeMapAdjustLines)) layer.routeMapAdjustLines = [];
  if (!Array.isArray(layer.routeMapAdjustBlackDots)) layer.routeMapAdjustBlackDots = [];

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
  map.createPane('srmaNames');
  map.getPane('srmaNames').style.zIndex = 450;
  map.getPane('srmaNames').style.pointerEvents = 'none';
  map.createPane('srmaDots');
  map.getPane('srmaDots').style.zIndex = 460;

  // ⚠️ 群組加入順序＝由下而上的圖層順序：
  //    共線黃色底色（最底）→ 路線 → 合併結構 → 站點／交叉（最上）
  const sharedGroup = L.layerGroup().addTo(map); // 🔴 共線段底色高亮（墊在路線底下）
  const endpointGroup = L.layerGroup().addTo(map); // 🔵 頭尾共點端點線段藍色底色高亮（墊在路線底下）
  const finishedGroup = L.layerGroup().addTo(map);
  const mergedGroup = L.layerGroup().addTo(map);
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
    t === 'terminal'
      ? '端點 terminal'
      : t === 'connect'
        ? '交點 intersection'
        : t === 'cross'
          ? '交叉 cross'
          : '一般 normal';

  const buildRoutesAtCoord = () => {
    const m = new Map();
    for (const ln of layer.routeMapAdjustLines || []) {
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
    const meta = (layer.routeMapAdjustStationMeta && layer.routeMapAdjustStationMeta[k]) || {};
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
    for (const ln of layer.routeMapAdjustLines) {
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
    const { terminals, connects, blacks } = computeRouteMapAdjustStations(
      layer.routeMapAdjustLines,
      layer.routeMapAdjustBlackDots
    );
    const routesAtCoord = buildRoutesAtCoord();
    const addStationDot = (latlng, fillColor, radius, type) => {
      const m = L.circleMarker(latlng, {
        radius,
        color: fillColor,
        weight: 1,
        fillColor,
        fillOpacity: 1,
        interactive: true,
        pane: 'srmaDots', // 圓點置於最上層 pane，永遠不被站名遮住
      });
      m.bindTooltip(stationTooltipHtml(latlng, type, routesAtCoord), { sticky: true });
      // hover：圓點放大
      m.on('mouseover', () => m.setRadius(radius + 3));
      m.on('mouseout', () => m.setRadius(radius));
      m.addTo(stationGroup);
    };
    // 繪製順序：黑點 → 端點(藍) → 交點(紅) → 交叉(黃)，讓 cross 顯示在最上層
    blacks.forEach((p) => addStationDot(p, '#000000', 3, 'black'));
    terminals.forEach((p) => addStationDot(p, '#1565c0', 4, 'terminal'));
    connects.forEach((p) => addStationDot(p, '#ff0000', 4, 'connect'));
    // 🟡 交叉站點（cross）：路線幾何交叉但無站點處。以黃色底色 halo + 黃點 highlight。
    const crosses = Array.isArray(layer.routeMapAdjustCrossStations)
      ? layer.routeMapAdjustCrossStations
      : [];
    crosses.forEach((p) => {
      // 黃色底色光暈（halo）
      L.circleMarker(p, {
        radius: 10,
        color: '#ffe000',
        weight: 0,
        fillColor: '#ffe000',
        fillOpacity: 0.45,
        interactive: false,
        pane: 'srmaDots',
      }).addTo(stationGroup);
      addStationDot(p, '#ffd600', 5, 'cross');
    });
  };

  // 合併後路網結構：每條邊只畫一次（重疊之多條路線→一條線）；
  // 共用邊（≥2 路線）以深色粗線強調，單一路線邊用該路線顏色；tooltip 列出所有經過之路線屬性。
  const mergedEdgeTooltipHtml = (edge) => {
    const routes = Array.isArray(edge.routes) ? edge.routes : [];
    const rows = routes
      .map(
        (r) =>
          `<div>` +
          rowHtml('route_name', r.routeName) +
          rowHtml('route_id', r.routeId) +
          rowHtml('railway', r.railway) +
          rowHtml('color', r.color) +
          `</div>`
      )
      .join('<hr style="margin:3px 0;border:none;border-top:1px solid #eee">');
    return (
      `<div style="font-size:12px;line-height:1.5">` +
      `<div><span style="color:#888">routes</span> ${routes.length}</div>` +
      rows +
      `</div>`
    );
  };
  const renderMerged = () => {
    mergedGroup.clearLayers();
    const net = layer.routeMapAdjustMergedNetwork;
    const edges = Array.isArray(net?.edges) ? net.edges : [];
    for (const edge of edges) {
      if (!edge || !Array.isArray(edge.a) || !Array.isArray(edge.b)) continue;
      const shared = (edge.routes?.length || 0) >= 2;
      const pl = L.polyline([edge.a, edge.b], {
        color: shared ? '#222222' : edge.routes?.[0]?.color || '#888888',
        weight: shared ? 5 : 3,
        opacity: 0.9,
        interactive: true,
      });
      pl.bindTooltip(mergedEdgeTooltipHtml(edge), { sticky: true });
      pl.addTo(mergedGroup);
    }
  };

  const hasMerged = () => {
    const net = layer.routeMapAdjustMergedNetwork;
    return !!net && Array.isArray(net.edges) && net.edges.length > 0;
  };

  // 🟡 共線段（被 ≥2 路線共用之重疊段）高亮：預設顯示，以黃色粗線當「底色」墊在路線底下
  //    （像螢光筆），讓彩色路線疊在黃色高亮之上。
  const sharedTooltipHtml = (edge) => {
    const routes = Array.isArray(edge.routes) ? edge.routes : [];
    return (
      `<div style="font-size:12px;line-height:1.5">` +
      `<div><span style="color:#888">共線 routes</span> ${routes.length}</div>` +
      routes.map((r) => rowHtml('route_name', r.routeName)).join('') +
      `</div>`
    );
  };
  const renderShared = () => {
    sharedGroup.clearLayers();
    const segs = Array.isArray(layer.routeMapAdjustSharedSegments)
      ? layer.routeMapAdjustSharedSegments
      : [];
    for (const edge of segs) {
      if (!edge || !Array.isArray(edge.a) || !Array.isArray(edge.b)) continue;
      const pl = L.polyline([edge.a, edge.b], {
        color: '#ff1744', // 紅色底色高亮，標示共線（重疊）段
        weight: 12,
        opacity: 0.85,
        lineCap: 'round',
        interactive: true,
      });
      pl.bindTooltip(sharedTooltipHtml(edge), { sticky: true });
      pl.addTo(sharedGroup);
    }
  };

  // 🏷️ 車站名常駐標籤：開關開啟時，於有 station_name 的站點「直接寫字」顯示名稱
  //    （非 tooltip／popup，而是以 divIcon 將文字直接畫在地圖上）
  const renderNames = () => {
    nameGroup.clearLayers();
    if (!layer.routeMapAdjustShowNames) return;
    const { terminals, connects, blacks } = computeRouteMapAdjustStations(
      layer.routeMapAdjustLines,
      layer.routeMapAdjustBlackDots
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
      const meta = (layer.routeMapAdjustStationMeta && layer.routeMapAdjustStationMeta[k]) || {};
      if (!meta.name) return;
      const icon = L.divIcon({
        className: 'route-map-adjust-station-name',
        // 置於站點「正上方」並留間距，避免文字蓋住站點圓點（translate -100% 讓文字底緣對齊錨點，top 再上移清開圓點半徑）
        html: `<span style="position:absolute;left:0;top:-7px;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;font-size:${fontSize}px;line-height:1.2;font-weight:600;color:${color};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;pointer-events:none">${esc(meta.name)}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(p, { icon, interactive: false, keyboard: false, pane: 'srmaNames' }).addTo(nameGroup);
    });
  };

  // 🔵 頭尾共點：以藍色粗線標示「端點 → 下一個交叉點」之間的整段子路徑（底色，墊在路線底下）
  const renderEndpoints = () => {
    endpointGroup.clearLayers();
    const segs = computeRouteMapAdjustSharedEndpointSegments(layer.routeMapAdjustLines);
    for (const s of segs) {
      if (!Array.isArray(s.path) || s.path.length < 2) continue;
      L.polyline(s.path, {
        color: '#1e88e5', // 藍色底色高亮，標示頭尾共點之子路徑
        weight: 12,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(endpointGroup);
    }
  };

  const renderAll = () => {
    // 已合併：顯示單一結構（重疊→一條線）；否則顯示原始各路線 + 共線/頭尾共點高亮
    if (hasMerged()) {
      finishedGroup.clearLayers();
      sharedGroup.clearLayers();
      endpointGroup.clearLayers();
      renderMerged();
    } else {
      mergedGroup.clearLayers();
      renderFinished();
      renderShared(); // 預設顯示共線（紅）
      renderEndpoints(); // 預設顯示頭尾共點（藍線）
    }
    renderStations(); // 站點 + 交叉（cross）預設顯示
    renderNames();
  };
  renderAll();

  // 反應式重繪：載入／清除等外部變更時即時更新地圖
  const stopLinesWatch = watch(
    () => [
      layer.routeMapAdjustLines,
      layer.routeMapAdjustBlackDots,
      layer.routeMapAdjustCrossStations,
      layer.routeMapAdjustSharedSegments,
      layer.routeMapAdjustMergedNetwork,
      layer.routeMapAdjustShowNames,
    ],
    renderAll,
    { deep: true }
  );

  // 一次性縮放到目前所有線（從選擇路線圖載入後由 store 觸發）
  const fitToContent = () => {
    const pts = [];
    for (const ln of layer.routeMapAdjustLines || []) {
      if (ln && Array.isArray(ln.latlngs)) pts.push(...ln.latlngs);
    }
    (layer.routeMapAdjustBlackDots || []).forEach((p) => pts.push(p));
    if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
  };
  const stopFitWatch = watch(() => dataStore.routeMapAdjustFitTrigger, fitToContent);
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
