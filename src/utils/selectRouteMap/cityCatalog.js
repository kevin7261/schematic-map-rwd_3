/**
 * 🗺️ 選擇路線圖（select_route_map）— 城市路線載入邏輯（composable）
 *
 * ⚠️ 本檔為「選擇路線圖」圖層**獨立複製**之版本，刻意不與 ControlTab 內 leaflet_josm_draw
 *    的「載入城市路線」程式共用，避免互相牽動。
 *
 * 提供：洲 → 國家 → 城市 三層選單、讀取所選城市之 GeoJSON 並畫到「選擇路線圖」圖層、
 * 以及目前路線／站點統計與各路線站點清單。
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue';
// 🔗 各城市地鐵「官方路線圖」連結（catalog id → url），與管線解耦獨立維護
import OFFICIAL_MAP from '../metroOfficialMap.json';
import {
  computeRouteMapStations,
  computeRouteMapRouteStations,
  routeMapColorNameForIndex,
} from './routeStations.js';

/** 本圖層 id（與 dataStore 內定義一致） */
export const SELECT_ROUTE_MAP_LAYER_ID = 'select_route_map';

const CONTINENT_ORDER = [
  '亞洲 Asia',
  '歐洲 Europe',
  '北美 North America',
  '南美 South America',
  '大洋洲 Oceania',
  '非洲 Africa',
  '其他 Other',
];

/** 🔖 快選城市（固定顯示順序）：值對應 _catalog.json 的 id */
const QUICK_CITY_IDS = [
  'taiwan-taipei',
  'taiwan-kaohsiung',
  'japan-tokyo',
  'japan-osaka',
  'south-korea-seoul',
  'china-beijing',
  'china-shanghai',
  'china-hong-kong',
  'singapore-singapore',
  'france-paris',
  'germany-berlin',
  'united-kingdom-london',
  'united-states-new-york-city',
];

/**
 * 把扁平 GeoJSON（way/node）套到「選擇路線圖」圖層：路線、黑點中間站、站名站號 meta；回傳路線數。
 */
const applyMetroFcToLayer = (fc, lyr) => {
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  const isWay = (f) => f?.properties?.element_type === 'way' && f.geometry?.type === 'LineString';
  const isNode = (f) => f?.properties?.element_type === 'node' && f.geometry?.type === 'Point';
  const lines = feats
    .filter(isWay)
    .map((f) => ({
      color: f.properties.color || '#666666',
      routeName: f.properties.route_name,
      routeId: f.properties.route_id,
      routeCompany: f.properties.route_company,
      railway: f.properties.railway,
      osmId: f.properties.osm_id,
      latlngs: (f.geometry.coordinates || []).map(([lon, lat]) => [lat, lon]),
    }))
    .filter((l) => l.latlngs.length >= 2);
  if (!lines.length) return 0;
  const ll6 = (lat, lon) => `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
  const stationMeta = {};
  const nodes = [];
  for (const f of feats) {
    if (!isNode(f)) continue;
    const [lon, lat] = f.geometry.coordinates;
    stationMeta[ll6(lat, lon)] = {
      id: f.properties.station_id,
      name: f.properties.station_name,
      osmId: f.properties.osm_id,
    };
    nodes.push([lat, lon]);
  }
  const memb = new Map();
  lines.forEach((l, li) => {
    l.latlngs.forEach((c, i) => {
      const k = ll6(c[0], c[1]);
      let m = memb.get(k);
      if (!m) {
        m = { lines: new Set(), endpoint: false };
        memb.set(k, m);
      }
      m.lines.add(li);
      if (i === 0 || i === l.latlngs.length - 1) m.endpoint = true;
    });
  });
  const blackDots = nodes.filter(([lat, lon]) => {
    const m = memb.get(ll6(lat, lon));
    return m && m.lines.size < 2 && !m.endpoint;
  });
  lyr.selectRouteMapLines = lines;
  lyr.selectRouteMapBlackDots = blackDots;
  lyr.selectRouteMapStationMeta = stationMeta;
  return lines.length;
};

/**
 * 「選擇路線圖」城市載入 composable。
 * @param {*} dataStore Pinia dataStore 實例
 */
export function useSelectRouteMapCatalog(dataStore) {
  const routeMapLayer = computed(() => dataStore.findLayerById(SELECT_ROUTE_MAP_LAYER_ID));

  /** 🌍 全球城市清單（catalog） */
  const metroCatalog = ref([]);
  const loadMetroCatalog = async () => {
    if (metroCatalog.value.length) return;
    try {
      const res = await fetch(`${process.env.BASE_URL || '/'}data/metro/_catalog.json`);
      if (res.ok) metroCatalog.value = await res.json();
    } catch (e) {
      void e;
    }
  };
  onMounted(loadMetroCatalog);

  const selContinent = ref('');
  const selCountry = ref('');
  const selCity = ref('');
  /** 快選下拉目前選取的 city id（與三層選單獨立） */
  const selQuick = ref('');

  const loadableCities = computed(() => metroCatalog.value.filter((c) => c.file));
  /** 快選城市清單：依 QUICK_CITY_IDS 順序，僅保留 catalog 中實際可載入者 */
  const quickCities = computed(() => {
    const byId = new Map(loadableCities.value.map((c) => [c.id, c]));
    return QUICK_CITY_IDS.map((id) => byId.get(id)).filter(Boolean);
  });
  const drawContinents = computed(() => {
    const set = new Set(loadableCities.value.map((c) => c.continent));
    return CONTINENT_ORDER.filter((c) => set.has(c));
  });
  const drawCountries = computed(() => {
    const map = new Map();
    for (const c of loadableCities.value)
      if (c.continent === selContinent.value && !map.has(c.country))
        map.set(c.country, c.countryZh || '');
    return [...map.entries()]
      .map(([country, zh]) => ({ country, label: (zh ? zh + ' ' : '') + country }))
      .sort((a, b) => a.country.localeCompare(b.country));
  });
  const drawCities = computed(() =>
    loadableCities.value
      .filter((c) => c.continent === selContinent.value && c.country === selCountry.value)
      .sort((a, b) => a.city.localeCompare(b.city))
  );
  watch(selContinent, () => {
    selCountry.value = '';
    selCity.value = '';
  });
  watch(selCountry, () => {
    selCity.value = '';
  });

  /** 📂 載入所選城市「預先抓好」的 GeoJSON 並畫到「選擇路線圖」圖層 */
  const isTracingRefMap = ref(false);
  const drawLoadMsg = ref('');
  /** 載入指定 city 物件之 GeoJSON 並畫到圖層（三層選單與快選共用） */
  const loadCity = async (city) => {
    const lyr = routeMapLayer.value;
    if (!lyr) return;
    isTracingRefMap.value = true;
    drawLoadMsg.value = '讀取中…';
    try {
      const res = await fetch(`${process.env.BASE_URL || '/'}data/metro/${city.file}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const fc = await res.json();
      const n = applyMetroFcToLayer(fc, lyr);
      if (!n) {
        window.alert('此城市資料無有效路線。');
        return;
      }
      // 保存原始 GeoJSON（FeatureCollection），供 UpperView 之 GeoJSON 檢視分頁顯示
      lyr.selectRouteMapGeojson = fc;
      lyr.selectRouteMapSource = `${city.city}, ${city.country}・© OpenStreetMap contributors（ODbL）`;
      // 🔗 該城市地鐵「官方路線圖」連結（存於 metroOfficialMap.json，依 catalog id 查）
      lyr.selectRouteMapOfficialUrl = OFFICIAL_MAP[city.id] || '';
      dataStore.requestSelectRouteMapFit();
    } catch (e) {
      window.alert('讀取失敗：' + (e && e.message ? e.message : e));
    } finally {
      isTracingRefMap.value = false;
      drawLoadMsg.value = '';
    }
  };

  /** 📂 載入三層選單所選城市 */
  const loadSelectedCity = async () => {
    const city = metroCatalog.value.find((c) => c.id === selCity.value);
    if (!city || !city.file) {
      window.alert('請依序選擇 洲 → 國家 → 城市。');
      return;
    }
    await loadCity(city);
  };

  /** ⚡ 快選城市：同步三層選單以反映選擇，並立即載入 */
  const quickLoadCity = async (cityId) => {
    const city = metroCatalog.value.find((c) => c.id === cityId);
    if (!city || !city.file) return;
    // 依序設定三層選單；watch 會在每次 nextTick 清空下一層，故逐層 await 後再設下一層
    selContinent.value = city.continent;
    await nextTick();
    selCountry.value = city.country;
    await nextTick();
    selCity.value = city.id;
    await loadCity(city);
  };

  /** 🧹 清除目前載入的路線 */
  const clearRouteMap = () => {
    const lyr = routeMapLayer.value;
    if (lyr) {
      lyr.selectRouteMapLines = [];
      lyr.selectRouteMapBlackDots = [];
      lyr.selectRouteMapStationMeta = null;
      lyr.selectRouteMapSource = null;
      lyr.selectRouteMapGeojson = null;
      lyr.selectRouteMapOfficialUrl = '';
    }
  };

  /** 目前資料來源標籤 */
  const routeMapSource = computed(() => routeMapLayer.value?.selectRouteMapSource || '');
  /** 🔗 目前城市的官方路線圖連結（無則為空字串） */
  const routeMapOfficialUrl = computed(() => routeMapLayer.value?.selectRouteMapOfficialUrl || '');

  /** 🏷️ 車站名顯示開關（讀寫圖層欄位，供 v-model 綁定） */
  const showStationNames = computed({
    get: () => !!routeMapLayer.value?.selectRouteMapShowNames,
    set: (v) => {
      if (routeMapLayer.value) routeMapLayer.value.selectRouteMapShowNames = !!v;
    },
  });

  /** 目前路線／站點統計 */
  const routeMapStats = computed(() => {
    const lyr = routeMapLayer.value;
    const lines = Array.isArray(lyr?.selectRouteMapLines) ? lyr.selectRouteMapLines : [];
    const blackDots = Array.isArray(lyr?.selectRouteMapBlackDots) ? lyr.selectRouteMapBlackDots : [];
    const { terminals, connects, blacks } = computeRouteMapStations(lines, blackDots);
    return {
      routes: lines.length,
      connect: connects.length,
      terminal: terminals.length,
      black: blacks.length,
    };
  });

  /** 站名查表鍵（與渲染端一致：lat,lng 取 6 位小數） */
  const metaKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;

  /** 各路線依序（起點→終點）的站點清單（含實際 route_name／station_name） */
  const routeMapRouteList = computed(() => {
    const lyr = routeMapLayer.value;
    const lines = Array.isArray(lyr?.selectRouteMapLines) ? lyr.selectRouteMapLines : [];
    const blackDots = Array.isArray(lyr?.selectRouteMapBlackDots) ? lyr.selectRouteMapBlackDots : [];
    const meta = lyr?.selectRouteMapStationMeta || {};
    const nameAt = (latlng) => (latlng && meta[metaKey(latlng[0], latlng[1])]?.name) || '';
    return computeRouteMapRouteStations(lines, blackDots).map((r) => ({
      ...r,
      routeName: lines[r.routeIndex]?.routeName || `路線 ${r.routeIndex + 1}`,
      stations: r.stations.map((st) => ({ ...st, name: nameAt(st.latlng) })),
    }));
  });

  const routeMapStationColor = (type) =>
    type === 'terminal' ? '#1565c0' : type === 'connect' ? '#ff0000' : '#000000';
  const routeMapRouteColor = (index) => routeMapRouteList.value[index]?.color || '#000000';
  /** 路線名稱：優先用實際 route_name，無則退回顏色名 */
  const routeMapRouteName = (index) => {
    const lines = routeMapLayer.value?.selectRouteMapLines || [];
    return lines[index]?.routeName || routeMapColorNameForIndex(index);
  };
  const routeMapStationLabel = (type) =>
    type === 'terminal'
      ? 'terminal（端點）'
      : type === 'connect'
        ? 'connect（交點）'
        : '一般（黑點）';

  return {
    metroCatalog,
    loadMetroCatalog,
    selContinent,
    selCountry,
    selCity,
    selQuick,
    loadableCities,
    quickCities,
    drawContinents,
    drawCountries,
    drawCities,
    isTracingRefMap,
    drawLoadMsg,
    loadSelectedCity,
    quickLoadCity,
    clearRouteMap,
    routeMapSource,
    routeMapOfficialUrl,
    showStationNames,
    routeMapStats,
    routeMapRouteList,
    routeMapStationColor,
    routeMapRouteColor,
    routeMapRouteName,
    routeMapStationLabel,
  };
}
