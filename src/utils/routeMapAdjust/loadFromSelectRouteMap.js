/**
 * 🗺️ 路線圖調整（route_map_adjust）— 「從選擇路線圖載入」邏輯（composable）
 *
 * ⚠️ 本檔為「路線圖調整」圖層**獨立複製**之版本，刻意不與 select_route_map 的程式共用；
 *    僅透過 dataStore 讀取「選擇路線圖」圖層的資料欄位，深拷貝一份到本圖層，之後可獨立調整。
 */
import { ref, computed } from 'vue';
import {
  computeRouteMapAdjustStations,
  computeRouteMapAdjustRouteStations,
  routeMapAdjustColorNameForIndex,
} from './routeStations.js';

/** 本圖層 id（與 dataStore 內定義一致） */
export const ROUTE_MAP_ADJUST_LAYER_ID = 'route_map_adjust';
/** 來源圖層 id：「選擇路線圖」 */
const SOURCE_SELECT_ROUTE_MAP_LAYER_ID = 'select_route_map';

/** 深拷貝（切斷與來源圖層的物件參照，確保載入後可獨立調整而不互相影響） */
const deepClone = (v) => {
  try {
    return v == null ? v : JSON.parse(JSON.stringify(v));
  } catch (e) {
    void e;
    return v;
  }
};

/**
 * 「路線圖調整」composable。
 * @param {*} dataStore Pinia dataStore 實例
 */
export function useRouteMapAdjust(dataStore) {
  const adjustLayer = computed(() => dataStore.findLayerById(ROUTE_MAP_ADJUST_LAYER_ID));
  const sourceLayer = computed(() => dataStore.findLayerById(SOURCE_SELECT_ROUTE_MAP_LAYER_ID));

  /** 來源「選擇路線圖」目前是否已有可載入的路線 */
  const hasSourceRoutes = computed(() => {
    const lines = sourceLayer.value?.selectRouteMapLines;
    return Array.isArray(lines) && lines.length > 0;
  });

  const isLoading = ref(false);

  /** 📥 從「選擇路線圖」載入目前的路線（深拷貝一份到本圖層） */
  const loadFromSelectRouteMap = () => {
    const src = sourceLayer.value;
    const dst = adjustLayer.value;
    if (!dst) return;
    const lines = Array.isArray(src?.selectRouteMapLines) ? src.selectRouteMapLines : [];
    if (!lines.length) {
      window.alert('「選擇路線圖」目前沒有路線，請先在「選擇路線圖」載入城市路線。');
      return;
    }
    isLoading.value = true;
    try {
      dst.routeMapAdjustLines = deepClone(lines);
      dst.routeMapAdjustBlackDots = deepClone(
        Array.isArray(src.selectRouteMapBlackDots) ? src.selectRouteMapBlackDots : []
      );
      dst.routeMapAdjustStationMeta = deepClone(src.selectRouteMapStationMeta || null);
      dst.routeMapAdjustSource = src.selectRouteMapSource
        ? `從選擇路線圖載入：${src.selectRouteMapSource}`
        : '從選擇路線圖載入';
      dataStore.requestRouteMapAdjustFit();
    } finally {
      isLoading.value = false;
    }
  };

  /** 🧹 清除目前調整中的路線 */
  const clearRouteMapAdjust = () => {
    const dst = adjustLayer.value;
    if (dst) {
      dst.routeMapAdjustLines = [];
      dst.routeMapAdjustBlackDots = [];
      dst.routeMapAdjustStationMeta = null;
      dst.routeMapAdjustSource = null;
    }
  };

  const routeMapAdjustSource = computed(() => adjustLayer.value?.routeMapAdjustSource || '');

  const routeMapAdjustStats = computed(() => {
    const lyr = adjustLayer.value;
    const lines = Array.isArray(lyr?.routeMapAdjustLines) ? lyr.routeMapAdjustLines : [];
    const blackDots = Array.isArray(lyr?.routeMapAdjustBlackDots) ? lyr.routeMapAdjustBlackDots : [];
    const { terminals, connects, blacks } = computeRouteMapAdjustStations(lines, blackDots);
    return {
      routes: lines.length,
      connect: connects.length,
      terminal: terminals.length,
      black: blacks.length,
    };
  });

  const routeMapAdjustRouteList = computed(() => {
    const lyr = adjustLayer.value;
    const lines = Array.isArray(lyr?.routeMapAdjustLines) ? lyr.routeMapAdjustLines : [];
    const blackDots = Array.isArray(lyr?.routeMapAdjustBlackDots) ? lyr.routeMapAdjustBlackDots : [];
    return computeRouteMapAdjustRouteStations(lines, blackDots);
  });

  const routeMapAdjustStationColor = (type) =>
    type === 'terminal' ? '#1565c0' : type === 'connect' ? '#ff0000' : '#000000';
  const routeMapAdjustRouteColor = (index) => routeMapAdjustRouteList.value[index]?.color || '#000000';
  const routeMapAdjustRouteName = (index) => routeMapAdjustColorNameForIndex(index);
  const routeMapAdjustStationLabel = (type) =>
    type === 'terminal'
      ? 'terminal（端點）'
      : type === 'connect'
        ? 'connect（交點）'
        : '一般（黑點）';

  return {
    hasSourceRoutes,
    isLoading,
    loadFromSelectRouteMap,
    clearRouteMapAdjust,
    routeMapAdjustSource,
    routeMapAdjustStats,
    routeMapAdjustRouteList,
    routeMapAdjustStationColor,
    routeMapAdjustRouteColor,
    routeMapAdjustRouteName,
    routeMapAdjustStationLabel,
  };
}
