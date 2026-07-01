/**
 * 「站點與路線調整前置」— 載入全球城市預算結果（骨架2→⑨正規化→匯入）。
 * 下拉選單與「選擇路線圖」相同三層結構 + 快選。
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { setControlLoadFeedback } from '@/utils/control/controlLoadFeedback.js';
import { loadMilpJsonRaw } from '@/utils/routeMapAdjust/schematic/milp/readMilpResult.js';
import {
  parseRmaMilpReadPrepFile,
  rmaMilpReadPrepRelativePath,
} from '@/utils/routeMapAdjust/pipeline/rmaPrepFromMetro.js';
import { SCHEMATIC_MILP_READ_LAYER_ID } from '@/utils/routeMapAdjust/schematic/layerIds.js';
import OFFICIAL_MAP from '@/utils/metroOfficialMap.json';

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
export function useRmaMilpReadPrepCatalog(dataStore) {
  const prepLayer = computed(() => dataStore.findLayerById(SCHEMATIC_MILP_READ_LAYER_ID));

  const metroCatalog = ref([]);
  const prepIndex = ref([]);

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
    if (!prepIndex.value.length) {
      try {
        const res = await fetch(`${base}data/metro/rma_milp_read_prep/_index.json`);
        if (res.ok) prepIndex.value = await res.json();
      } catch (e) {
        void e;
      }
    }
  };
  onMounted(loadCatalogs);

  const prepCityIds = computed(() => new Set(prepIndex.value.map((e) => e.cityId)));
  const loadableCities = computed(() =>
    metroCatalog.value.filter((c) => c.file && prepCityIds.value.has(c.id))
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

  const applyPrepPayload = (parsed, city) => {
    const parsedPrep = parseRmaMilpReadPrepFile(parsed);
    if (!parsedPrep.ok) {
      setControlLoadFeedback(SCHEMATIC_MILP_READ_LAYER_ID, parsedPrep.message, 'danger');
      return false;
    }
    const flat = JSON.parse(JSON.stringify(parsedPrep.flat));
    const res = loadMilpJsonRaw(flat);
    if (!res?.ok) {
      setControlLoadFeedback(
        SCHEMATIC_MILP_READ_LAYER_ID,
        res?.message || '載入預算結果失敗。',
        'danger'
      );
      return false;
    }
    const lyr = prepLayer.value;
    if (lyr) {
      if (!lyr.visible) lyr.visible = true;
      lyr.jsonFileName = `rma_milp_read_prep_${city.id}.json`;
      loadedCityId.value = city.id;
      dataStore.saveLayerState(SCHEMATIC_MILP_READ_LAYER_ID, {
        dataJson: lyr.dataJson,
        spaceNetworkGridJsonData: lyr.spaceNetworkGridJsonData,
        spaceNetworkGridJsonData_SectionData: lyr.spaceNetworkGridJsonData_SectionData,
        spaceNetworkGridJsonData_ConnectData: lyr.spaceNetworkGridJsonData_ConnectData,
        spaceNetworkGridJsonData_StationData: lyr.spaceNetworkGridJsonData_StationData,
        dashboardData: lyr.dashboardData,
        isLoaded: true,
        jsonFileName: lyr.jsonFileName,
      });
    }
    dataStore.requestSpaceNetworkGridFullRedraw();
    setControlLoadFeedback(
      SCHEMATIC_MILP_READ_LAYER_ID,
      `已載入 ${cityLabel(city)} 預算結果（⑨ 正規化→前置，${flat.length} 段）。`,
      'success'
    );
    return true;
  };

  const loadCity = async (city) => {
    if (!city?.id) return;
    isLoading.value = true;
    setControlLoadFeedback(SCHEMATIC_MILP_READ_LAYER_ID, '讀取中…', 'muted');
    try {
      const rel = rmaMilpReadPrepRelativePath(city.id);
      const res = await fetch(`${process.env.BASE_URL || '/'}data/metro/${rel}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const parsed = await res.json();
      applyPrepPayload(parsed, city);
    } catch (e) {
      setControlLoadFeedback(
        SCHEMATIC_MILP_READ_LAYER_ID,
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
      setControlLoadFeedback(
        SCHEMATIC_MILP_READ_LAYER_ID,
        '請依序選擇 洲 → 國家 → 城市。',
        'danger'
      );
      return;
    }
    await loadCity(city);
  };

  const quickLoadCity = async (cityId) => {
    const city = metroCatalog.value.find((c) => c.id === cityId);
    if (!city) return;
    selContinent.value = city.continent;
    await nextTick();
    selCountry.value = city.country;
    await nextTick();
    selCity.value = city.id;
    await loadCity(city);
  };

  const loadedCityLabel = computed(() => {
    if (!loadedCityId.value) return '';
    const c = metroCatalog.value.find((x) => x.id === loadedCityId.value);
    return c ? cityLabel(c) : loadedCityId.value;
  });

  /** 已載入城市之官方路線圖連結（同「選擇路線圖」，依 metroOfficialMap.json） */
  const loadedOfficialUrl = computed(() => OFFICIAL_MAP[loadedCityId.value] || '');

  return {
    metroCatalog,
    prepIndex,
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
  };
}

/** feedback 用（與 layer id 相同；避免 magic string 散落 template） */
export const SCHEMATIC_MILP_READ_PREP_LAYER_ID = SCHEMATIC_MILP_READ_LAYER_ID;
