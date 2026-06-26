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
  computeRouteMapAdjustCrossPoints,
  computeRouteMapAdjustSharedSegments,
  computeRouteMapAdjustSharedEndpointSegments,
  computeRouteMapAdjustLoopRoutes,
  buildRouteMapAdjustSkeleton,
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
      const clonedLines = deepClone(lines);
      const clonedBlacks = deepClone(
        Array.isArray(src.selectRouteMapBlackDots) ? src.selectRouteMapBlackDots : []
      );
      dst.routeMapAdjustLines = clonedLines;
      dst.routeMapAdjustBlackDots = clonedBlacks;
      dst.routeMapAdjustStationMeta = deepClone(src.selectRouteMapStationMeta || null);
      // 預設即顯示「共線」與「路線交叉的地方」：載入後自動計算
      const { terminals, connects, blacks } = computeRouteMapAdjustStations(clonedLines, clonedBlacks);
      dst.routeMapAdjustCrossStations = computeRouteMapAdjustCrossPoints(clonedLines, [
        ...terminals,
        ...connects,
        ...blacks,
      ]);
      dst.routeMapAdjustSharedSegments = computeRouteMapAdjustSharedSegments(clonedLines);
      dst.routeMapAdjustSkeleton = null; // 骨架由按鈕觸發
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
      dst.routeMapAdjustCrossStations = [];
      dst.routeMapAdjustSharedSegments = [];
      dst.routeMapAdjustSkeleton = null;
    }
  };

  /** 是否已建立骨架 */
  const hasSkeleton = computed(() => !!adjustLayer.value?.routeMapAdjustSkeleton);

  /** 🦴 切換骨架：把目前路網變成骨架（重疊→一條線、交叉無點處生成點）；再按一次還原 */
  const toggleSkeleton = () => {
    const lyr = adjustLayer.value;
    if (!lyr) return;
    if (lyr.routeMapAdjustSkeleton) {
      lyr.routeMapAdjustSkeleton = null; // 還原
      return;
    }
    const lines = Array.isArray(lyr.routeMapAdjustLines) ? lyr.routeMapAdjustLines : [];
    if (!lines.length) {
      window.alert('尚未載入路線，請先「從選擇路線圖載入」。');
      return;
    }
    lyr.routeMapAdjustSkeleton = buildRouteMapAdjustSkeleton(
      lines,
      Array.isArray(lyr.routeMapAdjustBlackDots) ? lyr.routeMapAdjustBlackDots : [],
      Object.keys(lyr.routeMapAdjustStationMeta || {}).map((k) => k.split(',').map(Number))
    );
    dataStore.requestRouteMapAdjustFit();
  };

  /** 骨架統計：節點數、邊數、生成之交叉節點數 */
  const skeletonStats = computed(() => {
    const sk = adjustLayer.value?.routeMapAdjustSkeleton;
    if (!sk) return { built: false, nodes: 0, edges: 0, crossNodes: 0 };
    return {
      built: true,
      nodes: Array.isArray(sk.nodes) ? sk.nodes.length : 0,
      edges: Array.isArray(sk.edges) ? sk.edges.length : 0,
      crossNodes: Array.isArray(sk.crossNodes) ? sk.crossNodes.length : 0,
    };
  });


  /** 🔶 共線段清單（被 ≥2 路線共用之重疊段），供面板列出（含路線屬性 list） */
  const sharedSegmentList = computed(() => {
    const lyr = adjustLayer.value;
    const segs = Array.isArray(lyr?.routeMapAdjustSharedSegments)
      ? lyr.routeMapAdjustSharedSegments
      : [];
    return segs.map((e, i) => ({
      index: i,
      routeCount: e.routes?.length || 0,
      routeNames: (e.routes || []).map(
        (r) => r.routeName || routeMapAdjustColorNameForIndex(r.routeIndex)
      ),
    }));
  });

  /** 🔵 頭尾共點線段清單（頭尾兩端皆為紅點之路線子路徑），供面板列出（地圖以藍色線高亮） */
  const sharedEndpointList = computed(() => {
    const lyr = adjustLayer.value;
    const lines = Array.isArray(lyr?.routeMapAdjustLines) ? lyr.routeMapAdjustLines : [];
    return computeRouteMapAdjustSharedEndpointSegments(lines).map((s, i) => ({
      index: i,
      routeName: lines[s.routeIndex]?.routeName || routeMapAdjustColorNameForIndex(s.routeIndex),
      aRouteCount: s.aRouteCount,
      bRouteCount: s.bRouteCount,
    }));
  });

  /** 🟢 頭尾同點（環線）清單：單一路線頭尾為同一點，供面板列出（地圖以綠色高亮） */
  const loopRouteList = computed(() => {
    const lyr = adjustLayer.value;
    const lines = Array.isArray(lyr?.routeMapAdjustLines) ? lyr.routeMapAdjustLines : [];
    return computeRouteMapAdjustLoopRoutes(lines).map((s, i) => ({
      index: i,
      routeName: lines[s.routeIndex]?.routeName || routeMapAdjustColorNameForIndex(s.routeIndex),
    }));
  });

  /** cross 站點清單（type 固定為 'cross'），供面板列出 */
  const routeMapAdjustCrossList = computed(() => {
    const lyr = adjustLayer.value;
    const arr = Array.isArray(lyr?.routeMapAdjustCrossStations)
      ? lyr.routeMapAdjustCrossStations
      : [];
    return arr.map((latlng, i) => ({ index: i, type: 'cross', latlng }));
  });

  const routeMapAdjustSource = computed(() => adjustLayer.value?.routeMapAdjustSource || '');

  /** 🏷️ 車站名顯示開關（讀寫圖層欄位，供 v-model 綁定） */
  const showStationNames = computed({
    get: () => !!adjustLayer.value?.routeMapAdjustShowNames,
    set: (v) => {
      if (adjustLayer.value) adjustLayer.value.routeMapAdjustShowNames = !!v;
    },
  });

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

  /** 站名查表鍵（與渲染端一致：lat,lng 取 6 位小數） */
  const metaKey = (lat, lng) => `${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;

  const routeMapAdjustRouteList = computed(() => {
    const lyr = adjustLayer.value;
    const lines = Array.isArray(lyr?.routeMapAdjustLines) ? lyr.routeMapAdjustLines : [];
    const blackDots = Array.isArray(lyr?.routeMapAdjustBlackDots) ? lyr.routeMapAdjustBlackDots : [];
    const meta = lyr?.routeMapAdjustStationMeta || {};
    const nameAt = (latlng) =>
      (latlng && meta[metaKey(latlng[0], latlng[1])]?.name) || '';
    // 以實際 route_name／station_name 充實清單（取代僅以顏色／type 呈現）
    return computeRouteMapAdjustRouteStations(lines, blackDots).map((r) => ({
      ...r,
      routeName: lines[r.routeIndex]?.routeName || `路線 ${r.routeIndex + 1}`,
      stations: r.stations.map((st) => ({ ...st, name: nameAt(st.latlng) })),
    }));
  });

  const routeMapAdjustStationColor = (type) =>
    type === 'terminal' ? '#1565c0' : type === 'connect' ? '#ff0000' : '#000000';
  const routeMapAdjustRouteColor = (index) => routeMapAdjustRouteList.value[index]?.color || '#000000';
  /** 路線名稱：優先用實際 route_name，無則退回顏色名 */
  const routeMapAdjustRouteName = (index) => {
    const lines = adjustLayer.value?.routeMapAdjustLines || [];
    return lines[index]?.routeName || routeMapAdjustColorNameForIndex(index);
  };
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
    routeMapAdjustCrossList,
    sharedSegmentList,
    sharedEndpointList,
    loopRouteList,
    hasSkeleton,
    toggleSkeleton,
    skeletonStats,
    routeMapAdjustSource,
    showStationNames,
    routeMapAdjustStats,
    routeMapAdjustRouteList,
    routeMapAdjustStationColor,
    routeMapAdjustRouteColor,
    routeMapAdjustRouteName,
    routeMapAdjustStationLabel,
  };
}
