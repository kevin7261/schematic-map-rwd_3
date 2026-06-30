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
  computeRouteMapAdjustSkeletonStations,
  computeRouteMapAdjustSharedEndpointSegments,
  computeRouteMapAdjustLoopRoutes,
} from './routeStations.js';
import { ROUTE_MAP_ADJUST_LAYER_ID } from './loadFromSelectRouteMap.js';
import { bindLeafletHoverOrControlPanel } from '@/utils/control/pipelineMapHoverDisplay.js';
import {
  escHtml as esc,
  pipelineLineTooltipHtml as lineTooltipHtml,
  buildPipelineRoutesAtCoord,
  pipelineStationTooltipHtml,
  leafletRouteMapStationDisplay,
  skeletonAdjustNodeDisplay,
} from '@/utils/control/pipelineMapHoverHtml.js';

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

  // 底圖：CartoDB Positron（乾淨淺色）。骨架模式時隱藏（純白底，只看骨頭）。
  const baseTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);
  // 疊加：OpenRailwayMap 鐵道／捷運路線。骨架模式時隱藏。
  const railTile = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
  }).addTo(map);
  // 骨架模式：移除底圖（純白底）；一般模式：顯示底圖。
  const setBasemapVisible = (show) => {
    for (const t of [baseTile, railTile]) {
      if (!t) continue;
      if (show && !map.hasLayer(t)) t.addTo(map);
      else if (!show && map.hasLayer(t)) map.removeLayer(t);
    }
  };

  // 自訂 pane 控制疊放順序：共線/環線/頭尾共點底色(srmaUnder 350) < 路線(overlayPane 400) < 站名 < 站點圓點
  //  → 紅/綠/藍底色高亮永遠墊在路線「底下」，上面才畫路線原來的顏色；站名永遠在圓點「之下」
  map.createPane('srmaUnder');
  map.getPane('srmaUnder').style.zIndex = 350;
  map.createPane('srmaNames');
  map.getPane('srmaNames').style.zIndex = 450;
  map.getPane('srmaNames').style.pointerEvents = 'none';
  map.createPane('srmaDots');
  map.getPane('srmaDots').style.zIndex = 460;

  // ⚠️ 疊放順序由 pane 的 zIndex 決定（非加入順序）：
  //    共線/環線/頭尾共點底色(srmaUnder 350) → 路線(overlayPane 400) → 站點／交叉（最上）
  const sharedGroup = L.layerGroup().addTo(map); // 🔴 共線段底色高亮（墊在路線底下）
  const loopGroup = L.layerGroup().addTo(map); // 🟢 頭尾同點（環線）綠色底色高亮（墊在路線底下）
  const endpointGroup = L.layerGroup().addTo(map); // 🔵 頭尾共點端點線段藍色底色高亮（墊在路線底下）
  const finishedGroup = L.layerGroup().addTo(map);
  const skeletonGroup = L.layerGroup().addTo(map); // 🦴 骨架圖（啟用時改顯示此層）
  const stationGroup = L.layerGroup().addTo(map);
  const nameGroup = L.layerGroup().addTo(map); // 🏷️ 車站名常駐標籤（由開關控制）

  const llKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;
  const rowHtml = (k, v) =>
    v == null || v === '' ? '' : `<div><span style="color:#888">${esc(k)}</span> ${esc(v)}</div>`;


  const buildRoutesAtCoord = () =>
    buildPipelineRoutesAtCoord(layer.routeMapAdjustLines, (lat, lng) => llKey(lat, lng));

  const stationTooltipHtml = (latlng, type, routesAtCoord, fillColor) => {
    const k = llKey(latlng[0], latlng[1]);
    const meta = (layer.routeMapAdjustStationMeta && layer.routeMapAdjustStationMeta[k]) || {};
    const routes = routesAtCoord.get(k) || [];
    const disp = leafletRouteMapStationDisplay(type, fillColor);
    return pipelineStationTooltipHtml({
      meta,
      typeLabel: disp.typeLabel,
      stationDotColor: disp.color,
      stationColorReason: disp.reason,
      routes,
    });
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
      bindLeafletHoverOrControlPanel(pl, ROUTE_MAP_ADJUST_LAYER_ID, dataStore, lineTooltipHtml(ln));
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
      layer.routeMapAdjustBlackDots,
      Object.keys(layer.routeMapAdjustStationMeta || {}).map((k) => k.split(',').map(Number))
    );
    const routesAtCoord = buildRoutesAtCoord();
    const addStationDot = (latlng, fillColor, radius, type) => {
      // 🔴🔵 端點/交點：先畫白色底圈「切斷」路線（路線中間不可有紅/藍點）
      if (type === 'connect' || type === 'terminal') {
        L.circleMarker(latlng, {
          radius: radius + 3,
          color: '#ffffff',
          weight: 0,
          fillColor: '#ffffff',
          fillOpacity: 1,
          interactive: false,
          pane: 'srmaDots',
        }).addTo(stationGroup);
      }
      const m = L.circleMarker(latlng, {
        radius,
        color: '#ffffff', // 白色 1px border
        weight: 1,
        fillColor,
        fillOpacity: 1,
        interactive: true,
        pane: 'srmaDots', // 圓點置於最上層 pane，永遠不被線/站名遮住
      });
      bindLeafletHoverOrControlPanel(
        m,
        ROUTE_MAP_ADJUST_LAYER_ID,
        dataStore,
        stationTooltipHtml(latlng, type, routesAtCoord, fillColor)
      );
      // hover：圓點放大
      m.on('mouseover', () => m.setRadius(radius + 2));
      m.on('mouseout', () => m.setRadius(radius));
      m.addTo(stationGroup);
    };
    // 繪製順序：黑點 → 端點(藍) → 交點(紅) → 交叉(黃)，讓 cross 顯示在最上層
    blacks.forEach((p) => addStationDot(p, '#000000', 4, 'black'));
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
        pane: 'srmaUnder', // 墊在路線底下，上面才畫路線原來的顏色
      });
      bindLeafletHoverOrControlPanel(
        pl,
        ROUTE_MAP_ADJUST_LAYER_ID,
        dataStore,
        sharedTooltipHtml(edge)
      );
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
      layer.routeMapAdjustBlackDots,
      Object.keys(layer.routeMapAdjustStationMeta || {}).map((k) => k.split(',').map(Number))
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

  // 目前所有黑點站（車站）座標清單，供紫點 highlight 選取「最中心的車站」
  const blackStationPts = () => {
    const { blacks } = computeRouteMapAdjustStations(
      layer.routeMapAdjustLines,
      layer.routeMapAdjustBlackDots,
      Object.keys(layer.routeMapAdjustStationMeta || {}).map((k) => k.split(',').map(Number))
    );
    return Array.isArray(blacks) ? blacks : [];
  };
  // 點到線段最近點
  const closestOnSeg = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return a;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return [a[0] + dx * t, a[1] + dy * t];
  };
  // 找出 path 上「最接近各弧長比例」的黑點站（車站）座標：紫點 highlight 要落在最中心的車站上，
  //   而非幾何中心點（內插點）。以投影方式找「落在 path 上」的黑點站（容差），避免座標精度不符而漏抓。
  const blackStationsNearFractions = (path, fractions, blackPts) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + d(path[i - 1], path[i]));
    const total = cum[cum.length - 1] || 1;
    const ON = 3e-5; // 約 3m：黑點站是否落在此 path 上
    // 候選＝投影距離夠近的黑點站，記其在 path 上的弧長位置
    const cands = [];
    for (const s of blackPts) {
      if (!Array.isArray(s) || s.length < 2) continue;
      let bd = Infinity;
      let bpos = 0;
      for (let i = 1; i < path.length; i++) {
        const cp = closestOnSeg(s, path[i - 1], path[i]);
        const dist = d(s, cp);
        if (dist < bd) {
          bd = dist;
          bpos = cum[i - 1] + d(path[i - 1], cp);
        }
      }
      if (bd <= ON) cands.push({ p: s, pos: bpos });
    }
    if (!cands.length) return [];
    const out = [];
    const used = new Set();
    for (const fr of fractions) {
      const target = total * fr;
      let best = null;
      let bd = Infinity;
      for (const c of cands) {
        const k = llKey(c.p[0], c.p[1]);
        if (used.has(k)) continue;
        const dd = Math.abs(c.pos - target);
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
      if (best) {
        used.add(llKey(best.p[0], best.p[1]));
        out.push(best.p);
      }
    }
    return out;
  };
  // 🟣 在「最中心的黑點站」處畫紫色 highlight——樣式與黃色交叉點完全相同（紫色光暈 halo + 實心點）
  const addPurpleCuts = (group, path, fractions, blackPts) => {
    for (const c of blackStationsNearFractions(path, fractions, blackPts)) {
      // 紫色底色光暈（halo）
      L.circleMarker(c, {
        radius: 10,
        color: '#9c27b0',
        weight: 0,
        fillColor: '#9c27b0',
        fillOpacity: 0.45,
        interactive: false,
        pane: 'srmaDots',
      }).addTo(group);
      // 紫點
      L.circleMarker(c, {
        radius: 5,
        color: '#ffffff', // 白色 1px border
        weight: 1,
        fillColor: '#9c27b0',
        fillOpacity: 1,
        interactive: false,
        pane: 'srmaDots',
      }).addTo(group);
    }
  };

  // 🔵 頭尾共點：以藍色粗線標示「端點 → 下一個交叉點」之間的整段子路徑（底色，墊在路線底下）
  //    並在 1/2 處放紫點（切斷位置）；但**同一對端點之分歧群組中最短的那條不放紫點**（保持直線，其餘才彎折）。
  const renderEndpoints = () => {
    endpointGroup.clearLayers();
    const bset = blackStationPts();
    const segs = computeRouteMapAdjustSharedEndpointSegments(layer.routeMapAdjustLines).filter(
      (s) => Array.isArray(s.path) && s.path.length >= 2
    );
    const pathLen = (p) => {
      let d = 0;
      for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      return d;
    };
    const endKey = (q) => `${(+q[0]).toFixed(6)},${(+q[1]).toFixed(6)}`;
    const pairKeyOf = (p) => {
      const a = endKey(p[0]);
      const b = endKey(p[p.length - 1]);
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    // 每對端點分歧群組 → 找最短的那條（其 index），該條不放紫點
    const shortestByPair = new Map(); // pairKey -> { idx, len }
    segs.forEach((s, idx) => {
      const k = pairKeyOf(s.path);
      const len = pathLen(s.path);
      const cur = shortestByPair.get(k);
      if (!cur || len < cur.len - 1e-12) shortestByPair.set(k, { idx, len });
    });
    const skipPurpleIdx = new Set([...shortestByPair.values()].map((v) => v.idx));
    segs.forEach((s, idx) => {
      L.polyline(s.path, {
        color: '#1e88e5', // 藍色底色高亮，標示頭尾共點之子路徑
        weight: 12,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        pane: 'srmaUnder', // 墊在路線底下
      }).addTo(endpointGroup);
      // 🟣 藍線：最接近 1/2 的車站放紫點；該對端點中最短的那條跳過（不放）
      if (!skipPurpleIdx.has(idx)) addPurpleCuts(endpointGroup, s.path, [1 / 2], bset);
    });
  };

  // 🟢 頭尾同點（環線）：單一路線頭尾為同一點，以綠色粗線標示整條（底色，墊在路線底下）
  //    並在 1/3、2/3 處放紫點（切斷位置）。環線(circle)只有綠線、不會有藍點。
  const renderLoops = () => {
    loopGroup.clearLayers();
    const bset = blackStationPts();
    const loops = computeRouteMapAdjustLoopRoutes(layer.routeMapAdjustLines);
    for (const s of loops) {
      if (!Array.isArray(s.path) || s.path.length < 2) continue;
      L.polyline(s.path, {
        color: '#00c853', // 綠色底色高亮，標示頭尾同點之環線
        weight: 12,
        opacity: 0.6,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        pane: 'srmaUnder', // 墊在路線底下
      }).addTo(loopGroup);
      addPurpleCuts(loopGroup, s.path, [1 / 3, 2 / 3], bset); // 🟣 綠線：最接近 1/3、2/3 的車站
    }
  };

  // 🦴 骨架圖：重疊→一條邊（去重）；交叉無點處生成的節點以橘色標出
  const hasSkeleton = () => {
    const sk = layer.routeMapAdjustSkeleton;
    return !!sk && Array.isArray(sk.edges) && sk.edges.length > 0;
  };
  // 骨架邊 tooltip：與原本路線 hover 相同樣式（逐路線列 route_name/route_id/railway/color），
  //   重疊路段則把每條路線依序列出。
  const skeletonEdgeTooltip = (e) => {
    const routes = Array.isArray(e.routes) ? e.routes : [];
    return (
      `<div style="font-size:12px;line-height:1.5">` +
      routes.map((r) => lineTooltipHtml(r)).join('<hr style="margin:3px 0;border:none;border-top:1px solid #eee">') +
      `</div>`
    );
  };
  // 骨架節點 tooltip（須在 renderSkeleton 內建立，以取得 terminalKeys／connectKeys）
  const buildSkeletonNodeTooltip =
    (terminalKeys, connectKeys) => (n) => {
      const k = llKey(n.latlng[0], n.latlng[1]);
      const meta = (layer.routeMapAdjustStationMeta && layer.routeMapAdjustStationMeta[k]) || {};
      const routes = Array.isArray(n.routes)
        ? n.routes.map((r) => ({
            routeName: r.routeName || r.routeId || '(未命名)',
            color: r.color || '',
          }))
        : [];
      const disp = skeletonAdjustNodeDisplay(n, terminalKeys, connectKeys, llKey);
      return pipelineStationTooltipHtml({
        meta,
        typeLabel: disp.typeLabel,
        stationDotColor: disp.color,
        stationColorReason: disp.reason,
        routes,
      });
    };
  const renderSkeleton = () => {
    skeletonGroup.clearLayers();
    const sk = layer.routeMapAdjustSkeleton;
    if (!sk) return;
    // 骨架站點分類（degree 拓撲）：紅 = 交叉/分歧(degree≥3)、藍 = 端點(degree≤1)、其餘皆黑。
    //   共軌並行通過的中段站 degree=2 → 黑（同一骨架路線除頭尾外不出現紅點）。
    const { terminals, connects, blacks } = computeRouteMapAdjustSkeletonStations(
      layer.routeMapAdjustLines,
      layer.routeMapAdjustBlackDots,
      Object.keys(layer.routeMapAdjustStationMeta || {}).map((k) => k.split(',').map(Number))
    );
    const terminalKeys = new Set((terminals || []).map((p) => llKey(p[0], p[1])));
    const connectKeys = new Set((connects || []).map((p) => llKey(p[0], p[1])));
    const skeletonNodeTooltip = buildSkeletonNodeTooltip(terminalKeys, connectKeys);
    for (const e of sk.edges || []) {
      const path = Array.isArray(e.path) ? e.path : [];
      if (path.length < 2) continue;
      // 骨架邊顏色：取該邊所有路線之「不同顏色」。
      //   1 種顏色（單一路線）→ 實線畫該顏色；
      //   ≥2 種顏色（多路線共線）→ 同一路徑疊畫多條虛線、dash 交錯，讓所有顏色同時呈現。
      const baseWeight = 3;
      const colors = [];
      const seenC = new Set();
      for (const r of e.routes || []) {
        const c = r?.color || null;
        if (c && !seenC.has(c)) {
          seenC.add(c);
          colors.push(c);
        }
      }
      if (colors.length === 0) colors.push('#000000');

      if (colors.length === 1) {
        const pl = L.polyline(path, {
          color: colors[0],
          weight: baseWeight,
          opacity: 0.9,
          interactive: true,
        });
        bindLeafletHoverOrControlPanel(
          pl,
          ROUTE_MAP_ADJUST_LAYER_ID,
          dataStore,
          skeletonEdgeTooltip(e)
        );
        pl.on('mouseover', () => pl.setStyle({ weight: baseWeight + 4 }));
        pl.on('mouseout', () => pl.setStyle({ weight: baseWeight }));
        pl.addTo(skeletonGroup);
      } else {
        // 多色交錯：dash=dashLen、gap=dashLen*(N-1)，第 i 色 offset=dashLen*i → N 色剛好無縫平鋪整條線
        const N = colors.length;
        const dashLen = 8;
        const dashArray = `${dashLen} ${dashLen * (N - 1)}`;
        const pls = colors.map((c, i) =>
          L.polyline(path, {
            color: c,
            weight: baseWeight,
            opacity: 0.95,
            interactive: true,
            dashArray,
            dashOffset: String(dashLen * i),
          })
        );
        pls.forEach((pl) => {
          bindLeafletHoverOrControlPanel(
          pl,
          ROUTE_MAP_ADJUST_LAYER_ID,
          dataStore,
          skeletonEdgeTooltip(e)
        );
          pl.on('mouseover', () => pls.forEach((q) => q.setStyle({ weight: baseWeight + 4 })));
          pl.on('mouseout', () => pls.forEach((q) => q.setStyle({ weight: baseWeight })));
          pl.addTo(skeletonGroup);
        });
      }
    }
    // 🖤 黑點站（一般中間站）：骨架化後仍照原位置畫出（不可消失）。先畫，讓端點/交點/交叉節點疊在其上。
    const routesAtCoord = buildRoutesAtCoord();
    for (const p of blacks || []) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const r = 4;
      const m = L.circleMarker(p, {
        radius: r,
        color: '#ffffff', // 白色 1px border
        weight: 1,
        fillColor: '#000000',
        fillOpacity: 1,
        interactive: true,
        pane: 'srmaDots',
      });
      bindLeafletHoverOrControlPanel(
        m,
        ROUTE_MAP_ADJUST_LAYER_ID,
        dataStore,
        stationTooltipHtml(p, 'black', routesAtCoord, '#000000')
      );
      m.on('mouseover', () => m.setRadius(r + 2));
      m.on('mouseout', () => m.setRadius(r));
      m.addTo(skeletonGroup);
    }
    // 節點：🟣 切斷處(紫) → 紫、大；🟡 新加交叉 → 黃、大；其餘 → 灰、一般
    for (const n of sk.nodes || []) {
      if (!n || !Array.isArray(n.latlng)) continue;
      const nk = llKey(n.latlng[0], n.latlng[1]);
      // 骨架：🟡 交叉點(isCross)→黃／🟣 切斷點(isPurple)→紫／🔴 分歧(connect, degree≥3)→紅／🔵 端點→藍／🖤 其餘→黑。
      const baseR = 4;
      let fill = '#000000';
      if (n.isCross) fill = '#ffd600';
      else if (n.isPurple) fill = '#9c27b0';
      else if (connectKeys.has(nk) || n.isRouteJunction) fill = '#ff0000';
      else if (terminalKeys.has(nk)) fill = '#1565c0';
      const m = L.circleMarker(n.latlng, {
        radius: baseR,
        color: '#ffffff', // 白色 1px border
        weight: 1,
        fillColor: fill,
        fillOpacity: 1,
        interactive: true,
        pane: 'srmaDots',
      });
      bindLeafletHoverOrControlPanel(
        m,
        ROUTE_MAP_ADJUST_LAYER_ID,
        dataStore,
        skeletonNodeTooltip(n)
      );
      m.on('mouseover', () => m.setRadius(baseR + 2));
      m.on('mouseout', () => m.setRadius(baseR));
      m.addTo(skeletonGroup);
    }
  };

  const renderAll = () => {
    if (hasSkeleton()) {
      // 骨架模式：隱藏底圖（純白底，只看骨頭）+ 只顯示骨架（清掉原始路線與各高亮、站點）
      setBasemapVisible(false);
      finishedGroup.clearLayers();
      sharedGroup.clearLayers();
      loopGroup.clearLayers();
      endpointGroup.clearLayers();
      stationGroup.clearLayers();
      renderSkeleton();
      renderNames();
      return;
    }
    setBasemapVisible(true); // 一般模式：顯示底圖
    skeletonGroup.clearLayers();
    // 顯示原始各路線 + 共線（紅）/環線（綠）/頭尾共點（藍）高亮 + 站點/交叉（黃）
    renderFinished();
    renderShared(); // 預設顯示共線（紅）
    renderLoops(); // 預設顯示頭尾同點環線（綠）
    renderEndpoints(); // 預設顯示頭尾共點（藍線）
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
      layer.routeMapAdjustSkeleton,
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
