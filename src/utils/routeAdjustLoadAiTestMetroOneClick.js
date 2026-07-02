/**
 * AI示意圖測試 — 載入全球城市一鍵執行預算結果（轉成 ai_test routes 格式）。
 * 下拉選單與「站點與路線調整前置」的「選擇路線圖（一鍵執行預算）」相同。
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { setControlLoadFeedback } from '@/utils/control/controlLoadFeedback.js';
import {
  parseRmaMilpReadOneClickFile,
  rmaMilpReadOneClickRelativePath,
} from '@/utils/routeMapAdjust/pipeline/rmaOneClickPipeline.js';
import { processUniformGridToDrawData } from '@/utils/dataProcessor.js';
import { convertRmaFlatToAiTestRoutes } from '@/utils/routeAdjustRmaFlatToAiTestRoutes.js';
import { resetAiTestHvBridgeFiles } from '@/utils/routeAdjustAiTestHvOptimizeExecute.js';
import OFFICIAL_MAP from '@/utils/metroOfficialMap.json';

export const AI_TEST_LAYER_ID = 'route_adjust_ai_test_layer';
export const AI_TEST_METRO_LOAD_FB = 'route_adjust_ai_test_layer:metro';

const CONTINENT_ORDER = [
  '亞洲 Asia',
  '歐洲 Europe',
  '北美 North America',
  '南美 South America',
  '大洋洲 Oceania',
  '非洲 Africa',
  '其他 Other',
];

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
  'austria-vienna',
  'united-kingdom-london',
  'united-states-new-york-city',
];

/**
 * @param {*} dataStore Pinia dataStore
 */
export function useRouteAdjustAiTestMetroOneClickCatalog(dataStore) {
  const aiTestLayer = computed(() => dataStore.findLayerById(AI_TEST_LAYER_ID));

  const metroCatalog = ref([]);
  const oneClickIndex = ref([]);

  const loadCatalogs = async () => {
    const base = process.env.BASE_URL || '/';
    if (!metroCatalog.value.length) {
      try {
        const res = await fetch(`${base}data/metro/_catalog.json`);
        if (res.ok) metroCatalog.value = await res.json();
      } catch (e) {
        void e;
      }
    }
    if (!oneClickIndex.value.length) {
      try {
        const res = await fetch(`${base}data/metro/rma_milp_read_one_click/_index.json`);
        if (res.ok) oneClickIndex.value = await res.json();
      } catch (e) {
        void e;
      }
    }
  };
  onMounted(loadCatalogs);

  const oneClickCityIds = computed(() => new Set(oneClickIndex.value.map((e) => e.cityId)));
  const oneClickMetaById = computed(
    () => new Map(oneClickIndex.value.map((e) => [e.cityId, e]))
  );
  const loadableCities = computed(() =>
    metroCatalog.value
      .filter((c) => c.file && oneClickCityIds.value.has(c.id))
      .map((c) => {
        const oc = oneClickMetaById.value.get(c.id);
        return {
          ...c,
          stations: oc?.stations ?? c.stations,
          routes: oc?.routes ?? c.routes,
        };
      })
  );

  const selContinent = ref('');
  const selCountry = ref('');
  const selCity = ref('');
  const selQuick = ref('');
  const selStationSort = ref('');
  const isLoading = ref(false);
  const loadedCityId = ref('');

  const quickCities = computed(() => {
    const byId = new Map(loadableCities.value.map((c) => [c.id, c]));
    return QUICK_CITY_IDS.map((id) => byId.get(id)).filter(Boolean);
  });
  const stationSortedCities = computed(() =>
    loadableCities.value
      .filter((c) => c.stations > 0)
      .slice()
      .sort((a, b) => a.stations - b.stations)
  );
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

  const cityLabel = (city) => (city.cityZh ? `${city.cityZh} ${city.city}` : city.city);

  const applyToAiTestLayer = async (routes, city, meta) => {
    const lyr = aiTestLayer.value;
    if (!lyr) {
      setControlLoadFeedback(AI_TEST_METRO_LOAD_FB, '找不到 AI示意圖測試圖層。', 'danger');
      return false;
    }

    const gridX = meta?.gridX ?? 0;
    const gridY = meta?.gridY ?? 0;
    const gridSize = `${gridX} x ${gridY}`;

    lyr.processedJsonData = {
      gridX,
      gridY,
      type: 'grid',
      uniform: true,
      nodes: [],
      routes,
      metroSourceCityId: city.id,
      metroSourceKind: 'rma-milp-read-one-click',
    };
    lyr.drawJsonData = processUniformGridToDrawData(lyr.processedJsonData);
    lyr.hvOptimizeLastResult = null;
    lyr.hvOptimizeSession = null;
    lyr.hvOptimizeBridgeStatus = null;
    lyr.hvOptimizeBridgePending = false;
    lyr.jsonFileName = `rma_milp_read_one_click_${city.id}.json`;
    lyr.isLoaded = true;
    if (!lyr.visible) lyr.visible = true;

    loadedCityId.value = city.id;

    await resetAiTestHvBridgeFiles();

    dataStore.saveLayerState(AI_TEST_LAYER_ID, {
      processedJsonData: lyr.processedJsonData,
      drawJsonData: lyr.drawJsonData,
      isLoaded: true,
      jsonFileName: lyr.jsonFileName,
    });
    dataStore.requestSpaceNetworkGridFullRedraw();

    setControlLoadFeedback(
      AI_TEST_METRO_LOAD_FB,
      `已載入 ${cityLabel(city)} 至 AI測試（${meta.routeNameCount ?? meta.routeCount} 線・${meta.stationCount} 站，網格 ${gridSize}）。`,
      'success'
    );
    return true;
  };

  const applyOneClickPayload = async (parsed, city) => {
    const parsedOneClick = parseRmaMilpReadOneClickFile(parsed);
    if (!parsedOneClick.ok) {
      setControlLoadFeedback(AI_TEST_METRO_LOAD_FB, parsedOneClick.message, 'danger');
      return false;
    }
    const flat = JSON.parse(JSON.stringify(parsedOneClick.flat));
    const converted = convertRmaFlatToAiTestRoutes(flat);
    if (!converted.ok) {
      setControlLoadFeedback(AI_TEST_METRO_LOAD_FB, converted.message || '轉換失敗。', 'danger');
      return false;
    }
    return applyToAiTestLayer(converted.routes, city, converted.meta);
  };

  const loadCity = async (city) => {
    if (!city?.id) return;
    isLoading.value = true;
    setControlLoadFeedback(AI_TEST_METRO_LOAD_FB, '讀取一鍵執行結果…', 'muted');
    try {
      const rel = rmaMilpReadOneClickRelativePath(city.id);
      const res = await fetch(`${process.env.BASE_URL || '/'}data/metro/${rel}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const parsed = await res.json();
      await applyOneClickPayload(parsed, city);
    } catch (e) {
      setControlLoadFeedback(
        AI_TEST_METRO_LOAD_FB,
        '讀取失敗：' + (e?.message || e),
        'danger'
      );
    } finally {
      isLoading.value = false;
    }
  };

  const loadSelectedCity = async () => {
    const city = metroCatalog.value.find((c) => c.id === selCity.value);
    if (!city) {
      setControlLoadFeedback(AI_TEST_METRO_LOAD_FB, '請依序選擇 洲 → 國家 → 城市。', 'danger');
      return;
    }
    await loadCity(city);
  };

  const quickLoadCity = async (cityId) => {
    if (!cityId) return;
    const city = metroCatalog.value.find((c) => c.id === cityId);
    if (!city) return;
    selContinent.value = city.continent;
    await nextTick();
    selCountry.value = city.country;
    await nextTick();
    selCity.value = city.id;
    await loadCity(city);
    selQuick.value = '';
    selStationSort.value = '';
  };

  const loadedCityLabel = computed(() => {
    if (!loadedCityId.value) return '';
    const c = metroCatalog.value.find((x) => x.id === loadedCityId.value);
    return c ? cityLabel(c) : loadedCityId.value;
  });

  const loadedOfficialUrl = computed(() => OFFICIAL_MAP[loadedCityId.value] || '');

  watch(
    () => aiTestLayer.value?.processedJsonData?.metroSourceCityId,
    (cityId) => {
      if (cityId) loadedCityId.value = cityId;
      else if (aiTestLayer.value?.isLoaded) loadedCityId.value = '';
    }
  );

  return {
    metroCatalog,
    oneClickIndex,
    loadCatalogs,
    loadableCities,
    selContinent,
    selCountry,
    selCity,
    selQuick,
    selStationSort,
    quickCities,
    stationSortedCities,
    drawContinents,
    drawCountries,
    drawCities,
    isLoading,
    loadedCityId,
    loadedCityLabel,
    loadedOfficialUrl,
    loadSelectedCity,
    quickLoadCity,
    clearLoadedCity: () => {
      loadedCityId.value = '';
    },
  };
}
