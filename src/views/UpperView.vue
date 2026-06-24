/** * 🌟 上半部區域組件 (Upper Area Component) * * 功能說明 (Features): * 1. 📊
分頁管理：管理儀表板和 D3.js 圖表的分頁切換 * 2. 🗺️ 地圖顯示：提供地圖視覺化和互動功能 * 3. 📈
數據視覺化：整合 D3.js 進行各種圖表繪製 * 4. 📱 響應式設計：適配不同螢幕尺寸的顯示需求 * 5. 🎯
高亮功能：提供地圖要素高亮顯示功能 * 6. 🔄 狀態同步：與父組件保持狀態同步 * * 技術特點 (Technical
Features): * - 使用 Vue 2 Options API 進行組件管理 * - 整合多個分頁組件，提供統一的介面 * -
支援響應式佈局和動態尺寸調整 * - 提供完整的事件處理和狀態管理 * - 整合地圖和圖表視覺化功能 * *
包含分頁 (Included Tabs): * - DashboardTab：儀表板分頁，顯示統計圖表和摘要資訊 * - D3jsTab：D3.js
圖表分頁，提供進階數據視覺化 * * @file UpperView.vue * @version 2.0.0 * @author Kevin Cheng * @since
1.0.0 */
<script>
  // ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

  /**
   * Vue Composition API 核心功能引入
   * 提供響應式數據、生命週期鉤子等功能
   *
   * @see https://vuejs.org/
   */
  import { ref, watch, nextTick, computed } from 'vue';

  // ==================== 🧩 子組件引入 (Subcomponent Imports) ====================

  /**
   * 儀表板分頁組件引入
   * 提供統計圖表和數據摘要顯示功能
   *
   * @see ../tabs/DashboardTab.vue
   */
  import DashboardTab from '../tabs/DashboardTab.vue';

  /**
   * D3.js 圖表分頁組件引入
   * 提供進階數據視覺化和圖表繪製功能
   *
   * @see ../tabs/D3jsTab.vue
   */
  import D3jsTab from '../tabs/D3jsTab.vue';
  /**
   * 網格縮放分頁組件引入
   * 提供網格縮放視覺化功能
   *
   * @see ../tabs/GridScalingTab.vue
   */
  import GridScalingTab from '../tabs/GridScalingTab.vue';
  import SpaceNetworkGridTab from '../tabs/SpaceNetworkGridTab.vue';
  import LayoutGridTab from '../tabs/LayoutGridTab.vue';
  import LayoutGridTab_Test from '../tabs/LayoutGridTab_Test.vue';
  import LayoutGridTab_Test3 from '../tabs/LayoutGridTab_Test3.vue';
  import LayoutGridTab_Test4 from '../tabs/LayoutGridTab_Test4.vue';
  /**
   * 處理後 JSON 數據分頁組件引入
   * 顯示圖層的處理後 JSON 數據
   *
   * @see ../tabs/ProcessedJsonDataTab.vue
   */
  import ProcessedJsonDataTab from '../tabs/ProcessedJsonDataTab.vue';

  /**
   * 原始 JSON 數據分頁組件引入
   * 顯示圖層的原始 JSON 數據
   *
   * @see ../tabs/JsonDataTab.vue
   */
  import JsonDataTab from '../tabs/JsonDataTab.vue';

  /**
   * 繪製數據分頁組件引入
   * 顯示圖層的繪製數據
   *
   * @see ../tabs/DrawJsonDataTab.vue
   */
  import DrawJsonDataTab from '../tabs/DrawJsonDataTab.vue';

  /**
   * 空間網絡網格 JSON 數據分頁組件引入
   * 顯示圖層的空間網絡網格 JSON 數據
   *
   * @see ../tabs/SpaceNetworkGridJsonDataTab.vue
   */
  import SpaceNetworkGridJsonDataTab from '../tabs/SpaceNetworkGridJsonDataTab.vue';
  import SpaceNetworkGridTabK3 from '../tabs/SpaceNetworkGridTabK3.vue';
  import SpaceNetworkGridJsonDataTabK3 from '../tabs/SpaceNetworkGridJsonDataTabK3.vue';
  import SpaceNetworkGridTabL3 from '../tabs/SpaceNetworkGridTabL3.vue';
  import SpaceNetworkGridJsonDataTabL3 from '../tabs/SpaceNetworkGridJsonDataTabL3.vue';

  /**
   * 佈局網格 JSON 數據分頁組件引入
   * 顯示圖層的佈局網格 JSON 數據
   *
   * @see ../tabs/LayoutGridJsonDataTab.vue
   */
  import LayoutGridJsonDataTab from '../tabs/LayoutGridJsonDataTab.vue';
  import LayoutGridJsonDataTab_Test from '../tabs/LayoutGridJsonDataTab_Test.vue';
  import LayoutGridJsonDataTab_Test3 from '../tabs/LayoutGridJsonDataTab_Test3.vue';
  import LayoutGridJsonDataTab_Test4 from '../tabs/LayoutGridJsonDataTab_Test4.vue';
  import MapTab from '../tabs/MapTab.vue';
  import { getIcon } from '../utils/utils.js';
  import { useDataStore } from '../stores/dataStore.js';

  export default {
    name: 'UpperView',

    /**
     * 🧩 組件註冊 (Component Registration)
     * 註冊上半部面板內使用的子組件
     */
    components: {
      DashboardTab,
      D3jsTab,
      GridScalingTab,
      SpaceNetworkGridTab,
      LayoutGridTab,
      LayoutGridTab_Test,
      LayoutGridTab_Test3,
      LayoutGridTab_Test4,
      ProcessedJsonDataTab,
      JsonDataTab,
      DrawJsonDataTab,
      SpaceNetworkGridJsonDataTab,
      SpaceNetworkGridTabK3,
      SpaceNetworkGridJsonDataTabK3,
      SpaceNetworkGridTabL3,
      SpaceNetworkGridTabM3: SpaceNetworkGridTabL3,
      SpaceNetworkGridJsonDataTabL3,
      SpaceNetworkGridJsonDataTabM3: SpaceNetworkGridJsonDataTabL3,
      LayoutGridJsonDataTab,
      LayoutGridJsonDataTab_Test,
      LayoutGridJsonDataTab_Test3,
      LayoutGridJsonDataTab_Test4,
      MapTab,
    },

    /**
     * 🔧 組件屬性定義 (Component Props)
     * 接收來自父組件的配置和狀態數據
     */
    props: {
      activeUpperTab: { type: String, default: 'd3js' },
      mainPanelWidth: { type: Number, default: 60 },
      contentHeight: { type: Number, default: 500 },
      selectedFilter: { type: String, default: '' },
      zoomLevel: { type: Number, default: 11 },
      isPanelDragging: { type: Boolean, default: false },
      activeMarkers: { type: Number, default: 0 },
    },

    /**
     * 📡 組件事件定義 (Component Events)
     * 定義向父組件發送的事件類型
     */
    emits: [
      'update:activeUpperTab', // 更新作用中分頁
      'update:zoomLevel', // 更新地圖縮放等級
      'update:currentCoords', // 更新當前座標
      'update:activeMarkers', // 更新作用中標記數量
      'feature-selected', // 選中地圖特徵
    ],

    /**
     * 🔧 組件設定函數 (Component Setup)
     * 使用 Composition API 設定組件邏輯
     */
    setup(props, { emit }) {
      const dataStore = useDataStore();
      // 📚 子組件引用 (Child Component References)
      /** 📊 儀表板視圖組件引用 */
      const DashboardTab = ref(null);
      /** 📊 儀表板容器引用 (用於控制滑鼠事件) */
      const dashboardContainerRef = ref(null);
      /** 📊 D3.js 視圖組件引用 */
      const D3jsTab = ref(null);
      /** 📊 網格縮放視圖組件引用 */
      const GridScalingTab = ref(null);
      /** 📊 空間網絡網格視圖組件引用 */
      const SpaceNetworkGridTab = ref(null);
      /** 📊 版面網格視圖組件引用 */
      const LayoutGridTab = ref(null);
      /** 📊 D3.js 容器引用 (用於控制滑鼠事件) */
      const d3jsContainerRef = ref(null);
      /** 📊 網格縮放容器引用 (用於控制滑鼠事件) */
      const gridScalingContainerRef = ref(null);
      /** 📊 空間網絡網格容器引用 */
      const d3jsMapContainerRef = ref(null);
      /** 📊 版面網格容器引用 */
      const layoutGridContainerRef = ref(null);
      /** 📊 處理後 JSON 數據組件引用 */
      const ProcessedJsonDataTab = ref(null);
      /** 📊 處理後 JSON 數據容器引用 */
      const processedJsonDataContainerRef = ref(null);
      /** 📊 原始 JSON 數據組件引用 */
      const JsonDataTab = ref(null);
      /** 📊 原始 JSON 數據容器引用 */
      const jsonDataContainerRef = ref(null);
      /** 📊 繪製 JSON 數據組件引用 */
      const DrawJsonDataTab = ref(null);
      /** 📊 繪製 JSON 數據容器引用 */
      const drawJsonDataContainerRef = ref(null);
      /** 📊 空間網絡網格 JSON 數據組件引用 */
      const SpaceNetworkGridJsonDataTab = ref(null);
      /** 📊 空間網絡網格 JSON 數據容器引用 */
      const spaceNetworkGridJsonDataContainerRef = ref(null);
      /** 📊 taipei_k3 專用空間網絡網格（程式／資料與主分頁分離） */
      const SpaceNetworkGridTabK3 = ref(null);
      const d3jsMapContainerK3Ref = ref(null);
      const SpaceNetworkGridJsonDataTabK3 = ref(null);
      const spaceNetworkGridJsonDataK3ContainerRef = ref(null);
      /** 📊 taipei_l3 專用（與 k3 分離之複製元件／欄位） */
      const SpaceNetworkGridTabL3 = ref(null);
      const d3jsMapContainerL3Ref = ref(null);
      const SpaceNetworkGridJsonDataTabL3 = ref(null);
      const spaceNetworkGridJsonDataL3ContainerRef = ref(null);
      /** 📊 taipei_m3 專用（與 l3 分離之複製元件／欄位） */
      const SpaceNetworkGridTabM3 = ref(null);
      const d3jsMapContainerM3Ref = ref(null);
      const SpaceNetworkGridJsonDataTabM3 = ref(null);
      const spaceNetworkGridJsonDataM3ContainerRef = ref(null);
      /** 📊 佈局網格 JSON 數據組件引用 */
      const LayoutGridJsonDataTab = ref(null);
      /** 📊 佈局網格 JSON 數據容器引用 */
      const layoutGridJsonDataContainerRef = ref(null);
      /** 📊 版面網格測試組件引用 */
      const LayoutGridTab_Test = ref(null);
      /** 📊 版面網格測試容器引用 */
      const layoutGridTestContainerRef = ref(null);
      /** 📊 佈局網格 JSON 測試數據組件引用 */
      const LayoutGridJsonDataTab_Test = ref(null);
      /** 📊 佈局網格 JSON 測試數據容器引用 */
      const layoutGridJsonDataTestContainerRef = ref(null);
      /** 📊 版面網格測試3組件引用 */
      const LayoutGridTab_Test3 = ref(null);
      /** 📊 版面網格測試3容器引用 */
      const layoutGridTest3ContainerRef = ref(null);
      /** 📊 版面網格測試4組件引用 */
      const LayoutGridTab_Test4 = ref(null);
      /** 📊 版面網格測試4容器引用 */
      const layoutGridTest4ContainerRef = ref(null);
      /** 📊 佈局網格 JSON 測試3數據組件引用 */
      const LayoutGridJsonDataTab_Test3 = ref(null);
      /** 📊 佈局網格 JSON 測試3數據容器引用 */
      const layoutGridJsonDataTest3ContainerRef = ref(null);
      /** 📊 佈局網格 JSON 測試4數據組件引用 */
      const LayoutGridJsonDataTab_Test4 = ref(null);
      /** 📊 佈局網格 JSON 測試4數據容器引用 */
      const layoutGridJsonDataTest4ContainerRef = ref(null);
      const MapTabRef = ref(null);
      const mapTabContainerRef = ref(null);
      const osm2GeojsonViewersContainerRef = ref(null);
      /** osm_2_geojson_2_json 三 Upper 分頁共用一個 JSON 檢視元件，模式由 activeUpperTab 推導 */
      const SpaceNetworkGridJsonDataTabOsm2 = ref(null);
      /** 與 space-network-grid 相同元件，篩選具 space-layout-grid-viewer 之圖層 */
      const SpaceNetworkGridTabLayoutViewer = ref(null);
      const spaceLayoutGridViewerContainerRef = ref(null);
      const SpaceNetworkGridTabCanvasLayoutViewer = ref(null);
      const canvasLayoutGridViewerContainerRef = ref(null);
      const SpaceNetworkGridTabLayoutPixelViewer = ref(null);
      const layoutPixelGridViewerContainerRef = ref(null);

      const spaceLayoutGridViewerLayerFilter = (layer) =>
        Array.isArray(layer?.upperViewTabs) &&
        layer.upperViewTabs.includes('space-layout-grid-viewer');

      const canvasLayoutGridViewerLayerFilter = (layer) =>
        Array.isArray(layer?.upperViewTabs) &&
        layer.upperViewTabs.includes('canvas-layout-grid-viewer');

      const layoutPixelGridViewerLayerFilter = (layer) =>
        Array.isArray(layer?.upperViewTabs) &&
        layer.upperViewTabs.includes('layout-grid-viewer');

      // 目前 UpperView 所選圖層（由各子 Tab 回傳）
      const activeUpperLayerId = ref(null);

      /** l3／m3 Upper 子元件綁定：對應資料處理_2 之 taipei_l3_dp_2／taipei_m3_dp_2 */
      const upperL3BoundLayerId = computed(() => 'taipei_l3_dp_2');
      const upperM3BoundLayerId = computed(() => 'taipei_m3_dp_2');

      /** osm-viewer／geojson-viewer／json-viewer → SpaceNetworkGridJsonDataTab.osmViewerMode */
      const osm2UpperJsonViewerMode = computed(() => {
        switch (props.activeUpperTab) {
          case 'osm-viewer':
            return 'osm-xml';
          case 'geojson-viewer':
            return 'osm-geojson';
          case 'json-viewer':
            return 'osm-derived-json';
          default:
            return '';
        }
      });

      // 所有可能的 tabs 列表
      const allPossibleTabs = [
        'd3js',
        'grid-scaling',
        'space-network-grid',
        'layout-grid',
        'layout-grid-test',
        'layout-grid-test3',
        'layout-grid-test4',
        'dashboard',
        'processed-json-data',
        'json-data',
        'draw-json-data',
        'space-network-grid-json-data',
        'layout-network-grid',
        'layout-network-grid-json-data',
        'space-network-grid-l3',
        'space-network-grid-json-data-l3',
        'space-network-grid-m3',
        'space-network-grid-json-data-m3',
        'layout-grid-json-data',
        'layout-grid-json-data-test',
        'layout-grid-json-data-test3',
        'layout-grid-test4',
        'layout-grid-json-data-test4',
        'map',
        'osm-viewer',
        'geojson-viewer',
        'json-viewer',
        'space-layout-grid-viewer',
        'canvas-layout-grid-viewer',
        'layout-grid-viewer',
      ];

      // 分頁是否啟用：彙整**所有可見圖層**的 upperViewTabs（聯集），與子 Tab 當下回報的圖層解耦
      // ——避免上半部某一 tab 作用中為 Geo 圖層時，同時可見的 hand-draw 仍無法點手繪分頁
      const isTabEnabled = computed(() => {
        const enabledMap = {};
        const allowed = new Set();
        for (const l of dataStore.getAllLayers()) {
          if (!l || !l.visible) continue;
          if (Array.isArray(l.upperViewTabs)) {
            for (const t of l.upperViewTabs) {
              if (t) allowed.add(t);
            }
          }
        }
        allPossibleTabs.forEach((tabId) => {
          enabledMap[tabId] = allowed.has(tabId);
        });
        return enabledMap;
      });

      const handleActiveLayerChange = (layerId) => {
        activeUpperLayerId.value = layerId;
      };

      // ==================== 🔄 左側開啟圖層 → UpperView 自動切換 (Auto switch on newly opened layer) ====================
      // 目標：在 LeftView 開啟圖層時，UpperView 直接切到該圖層，並優先顯示可視化分頁（d3js）
      const visibleLayers = computed(() => dataStore.getAllLayers().filter((l) => l.visible));
      const previousVisibleLayerIds = ref([]);
      let isUpdatingTab = false; // 防止遞迴更新的標誌（在兩個 watch 之間共享）

      watch(
        () => visibleLayers.value.map((l) => l.layerId),
        (newIds) => {
          // 防止遞迴更新
          if (isUpdatingTab) return;

          // 沒有可見圖層
          if (!Array.isArray(newIds) || newIds.length === 0) {
            activeUpperLayerId.value = null;
            previousVisibleLayerIds.value = [];
            return;
          }

          const prevIds = previousVisibleLayerIds.value || [];
          const added = newIds.filter((id) => !prevIds.includes(id));

          // 如果有新增圖層：切到最新新增的圖層
          if (added.length > 0) {
            const newestAddedLayerId = added[added.length - 1];
            activeUpperLayerId.value = newestAddedLayerId;

            // 優先顯示可視化分頁（d3js）
            if (props.activeUpperTab !== 'd3js') {
              const layer = dataStore.findLayerById(newestAddedLayerId);
              const tabs = Array.isArray(layer?.upperViewTabs) ? layer.upperViewTabs : [];
              if (tabs.includes('d3js')) {
                isUpdatingTab = true;
                emit('update:activeUpperTab', 'd3js');
                nextTick(() => {
                  isUpdatingTab = false;
                });
              }
            }
          }
          // 如果目前選中的圖層不在可見列表中：回到第一個可見圖層
          else if (!activeUpperLayerId.value || !newIds.includes(activeUpperLayerId.value)) {
            activeUpperLayerId.value = newIds[0];
          }

          previousVisibleLayerIds.value = [...newIds];
        },
        { immediate: true }
      );

      /**
       * 👀 監聽激活圖層變化
       * 當圖層變化時，如果當前 tab 不在新圖層的 upperViewTabs 中，切換到第一個可用的 tab
       * 注意：只監聽 activeUpperLayerId，避免同時監聽 activeUpperTab 造成遞迴更新
       */
      watch(
        () => activeUpperLayerId.value,
        (layerId) => {
          if (!layerId || isUpdatingTab) return;

          const layer = dataStore.findLayerById(layerId);
          const allowedTabs = Array.isArray(layer?.upperViewTabs) ? layer.upperViewTabs : [];
          const currentTab = props.activeUpperTab;

          // 如果當前 tab 不在允許列表中，切換到第一個可用的 tab
          if (currentTab && allowedTabs.length > 0 && !allowedTabs.includes(currentTab)) {
            const next = allowedTabs[0] || null;
            if (next && next !== currentTab) {
              isUpdatingTab = true;
              emit('update:activeUpperTab', next);
              // 使用 nextTick 確保更新完成後重置標誌
              nextTick(() => {
                isUpdatingTab = false;
              });
            }
          }
        },
        { immediate: true }
      );

      /**
       * 👀 監聽拖曳狀態和分頁變化 (Watch Dragging State and Tab Changes)
       * 調整儀表板容器的滑鼠指標事件，防止拖曳時的干擾
       */
      watch(
        [() => props.isPanelDragging, () => props.activeUpperTab],
        ([dragging, tab]) => {
          nextTick(() => {
            // 處理儀表板容器
            if (dashboardContainerRef.value) {
              if (dragging && tab === 'dashboard') {
                // 拖曳時禁用儀表板的滑鼠事件
                dashboardContainerRef.value.style.pointerEvents = 'none';
              } else {
                // 恢復儀表板的滑鼠事件
                dashboardContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理 D3.js 容器
            if (d3jsContainerRef.value) {
              if (dragging && tab === 'd3js') {
                // 拖曳時禁用 D3.js 容器的滑鼠事件
                d3jsContainerRef.value.style.pointerEvents = 'none';
              } else {
                // 恢復 D3.js 容器的滑鼠事件
                d3jsContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理網格縮放容器
            if (gridScalingContainerRef.value) {
              if (dragging && tab === 'grid-scaling') {
                // 拖曳時禁用網格縮放容器的滑鼠事件
                gridScalingContainerRef.value.style.pointerEvents = 'none';
              } else {
                // 恢復網格縮放容器的滑鼠事件
                gridScalingContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理空間網絡網格容器
            if (d3jsMapContainerRef.value) {
              if (dragging && tab === 'space-network-grid') {
                d3jsMapContainerRef.value.style.pointerEvents = 'none';
              } else {
                d3jsMapContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (spaceLayoutGridViewerContainerRef.value) {
              if (dragging && tab === 'space-layout-grid-viewer') {
                spaceLayoutGridViewerContainerRef.value.style.pointerEvents = 'none';
              } else {
                spaceLayoutGridViewerContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (canvasLayoutGridViewerContainerRef.value) {
              if (dragging && tab === 'canvas-layout-grid-viewer') {
                canvasLayoutGridViewerContainerRef.value.style.pointerEvents = 'none';
              } else {
                canvasLayoutGridViewerContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (layoutPixelGridViewerContainerRef.value) {
              if (dragging && tab === 'layout-grid-viewer') {
                layoutPixelGridViewerContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutPixelGridViewerContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (d3jsMapContainerK3Ref.value) {
              if (dragging && tab === 'layout-network-grid') {
                d3jsMapContainerK3Ref.value.style.pointerEvents = 'none';
              } else {
                d3jsMapContainerK3Ref.value.style.pointerEvents = 'auto';
              }
            }

            // 處理版面網格容器
            if (layoutGridContainerRef.value) {
              if (dragging && tab === 'layout-grid') {
                layoutGridContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutGridContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理處理後 JSON 數據容器
            if (processedJsonDataContainerRef.value) {
              if (dragging && tab === 'processed-json-data') {
                processedJsonDataContainerRef.value.style.pointerEvents = 'none';
              } else {
                processedJsonDataContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理原始 JSON 數據容器
            if (jsonDataContainerRef.value) {
              if (dragging && tab === 'json-data') {
                jsonDataContainerRef.value.style.pointerEvents = 'none';
              } else {
                jsonDataContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理繪製 JSON 數據容器
            if (drawJsonDataContainerRef.value) {
              if (dragging && tab === 'draw-json-data') {
                drawJsonDataContainerRef.value.style.pointerEvents = 'none';
              } else {
                drawJsonDataContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理空間網絡網格 JSON 數據容器
            if (spaceNetworkGridJsonDataContainerRef.value) {
              if (dragging && tab === 'space-network-grid-json-data') {
                spaceNetworkGridJsonDataContainerRef.value.style.pointerEvents = 'none';
              } else {
                spaceNetworkGridJsonDataContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (spaceNetworkGridJsonDataK3ContainerRef.value) {
              if (dragging && tab === 'layout-network-grid-json-data') {
                spaceNetworkGridJsonDataK3ContainerRef.value.style.pointerEvents = 'none';
              } else {
                spaceNetworkGridJsonDataK3ContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (d3jsMapContainerL3Ref.value) {
              if (dragging && tab === 'space-network-grid-l3') {
                d3jsMapContainerL3Ref.value.style.pointerEvents = 'none';
              } else {
                d3jsMapContainerL3Ref.value.style.pointerEvents = 'auto';
              }
            }

            if (spaceNetworkGridJsonDataL3ContainerRef.value) {
              if (dragging && tab === 'space-network-grid-json-data-l3') {
                spaceNetworkGridJsonDataL3ContainerRef.value.style.pointerEvents = 'none';
              } else {
                spaceNetworkGridJsonDataL3ContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (d3jsMapContainerM3Ref.value) {
              if (dragging && tab === 'space-network-grid-m3') {
                d3jsMapContainerM3Ref.value.style.pointerEvents = 'none';
              } else {
                d3jsMapContainerM3Ref.value.style.pointerEvents = 'auto';
              }
            }

            if (spaceNetworkGridJsonDataM3ContainerRef.value) {
              if (dragging && tab === 'space-network-grid-json-data-m3') {
                spaceNetworkGridJsonDataM3ContainerRef.value.style.pointerEvents = 'none';
              } else {
                spaceNetworkGridJsonDataM3ContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理佈局網格 JSON 數據容器
            if (layoutGridJsonDataContainerRef.value) {
              if (dragging && tab === 'layout-grid-json-data') {
                layoutGridJsonDataContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutGridJsonDataContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理版面網格測試容器
            if (layoutGridTestContainerRef.value) {
              if (dragging && tab === 'layout-grid-test') {
                layoutGridTestContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutGridTestContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理佈局網格 JSON 測試數據容器
            if (layoutGridJsonDataTestContainerRef.value) {
              if (dragging && tab === 'layout-grid-json-data-test') {
                layoutGridJsonDataTestContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutGridJsonDataTestContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理版面網格測試3容器
            if (layoutGridTest3ContainerRef.value) {
              if (dragging && tab === 'layout-grid-test3') {
                layoutGridTest3ContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutGridTest3ContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            // 處理佈局網格 JSON 測試3數據容器
            if (layoutGridJsonDataTest3ContainerRef.value) {
              if (dragging && tab === 'layout-grid-json-data-test3') {
                layoutGridJsonDataTest3ContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutGridJsonDataTest3ContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (mapTabContainerRef.value) {
              if (dragging && tab === 'map') {
                mapTabContainerRef.value.style.pointerEvents = 'none';
              } else {
                mapTabContainerRef.value.style.pointerEvents = 'auto';
              }
            }

            if (osm2GeojsonViewersContainerRef.value) {
              const isOsm2Tab =
                tab === 'osm-viewer' || tab === 'geojson-viewer' || tab === 'json-viewer';
              if (dragging && isOsm2Tab) {
                osm2GeojsonViewersContainerRef.value.style.pointerEvents = 'none';
              } else {
                osm2GeojsonViewersContainerRef.value.style.pointerEvents = 'auto';
              }
            }
          });
        },
        { immediate: true }
      ); // immediate: true 表示立即執行一次

      /**
       * 👀 監聽分頁變化 (Watch Tab Changes)
       * 當切換分頁時觸發相應的更新動作，確保組件正常顯示
       */
      watch(
        () => props.activeUpperTab,
        (newTab) => {
          // 當切換到 D3.js 分頁時，延遲觸發 resize 以確保容器已顯示
          if (newTab === 'd3js') {
            nextTick(() => {
              setTimeout(() => {
                if (D3jsTab.value && D3jsTab.value.resize) {
                  D3jsTab.value.resize();
                }
              }, 100); // 給容器一些時間來完成顯示動畫
            });
          } else if (newTab === 'grid-scaling') {
            nextTick(() => {
              setTimeout(() => {
                if (GridScalingTab.value && GridScalingTab.value.resize) {
                  GridScalingTab.value.resize();
                }
              }, 100); // 給容器一些時間來完成顯示動畫
            });
          } else if (newTab === 'space-network-grid') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTab.value && SpaceNetworkGridTab.value.resize) {
                  SpaceNetworkGridTab.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-network-grid') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTabK3.value && SpaceNetworkGridTabK3.value.resize) {
                  SpaceNetworkGridTabK3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridTab.value && LayoutGridTab.value.resize) {
                  LayoutGridTab.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'space-network-grid-json-data') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridJsonDataTab.value && SpaceNetworkGridJsonDataTab.value.resize) {
                  SpaceNetworkGridJsonDataTab.value.resize();
                }
              }, 100);
            });
          } else if (
            newTab === 'osm-viewer' ||
            newTab === 'geojson-viewer' ||
            newTab === 'json-viewer'
          ) {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridJsonDataTabOsm2.value?.resize) {
                  SpaceNetworkGridJsonDataTabOsm2.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'space-layout-grid-viewer') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTabLayoutViewer.value?.resize) {
                  SpaceNetworkGridTabLayoutViewer.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'canvas-layout-grid-viewer') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTabCanvasLayoutViewer.value?.resize) {
                  SpaceNetworkGridTabCanvasLayoutViewer.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-viewer') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTabLayoutPixelViewer.value?.resize) {
                  SpaceNetworkGridTabLayoutPixelViewer.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-network-grid-json-data') {
            nextTick(() => {
              setTimeout(() => {
                if (
                  SpaceNetworkGridJsonDataTabK3.value &&
                  SpaceNetworkGridJsonDataTabK3.value.resize
                ) {
                  SpaceNetworkGridJsonDataTabK3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'space-network-grid-l3') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTabL3.value && SpaceNetworkGridTabL3.value.resize) {
                  SpaceNetworkGridTabL3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'space-network-grid-json-data-l3') {
            nextTick(() => {
              setTimeout(() => {
                if (
                  SpaceNetworkGridJsonDataTabL3.value &&
                  SpaceNetworkGridJsonDataTabL3.value.resize
                ) {
                  SpaceNetworkGridJsonDataTabL3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'space-network-grid-m3') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTabM3.value && SpaceNetworkGridTabM3.value.resize) {
                  SpaceNetworkGridTabM3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'space-network-grid-json-data-m3') {
            nextTick(() => {
              setTimeout(() => {
                if (
                  SpaceNetworkGridJsonDataTabM3.value &&
                  SpaceNetworkGridJsonDataTabM3.value.resize
                ) {
                  SpaceNetworkGridJsonDataTabM3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-json-data') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridJsonDataTab.value && LayoutGridJsonDataTab.value.resize) {
                  LayoutGridJsonDataTab.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-test') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridTab_Test.value && LayoutGridTab_Test.value.resize) {
                  LayoutGridTab_Test.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-json-data-test') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridJsonDataTab_Test.value && LayoutGridJsonDataTab_Test.value.resize) {
                  LayoutGridJsonDataTab_Test.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-test3') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridTab_Test3.value && LayoutGridTab_Test3.value.resize) {
                  LayoutGridTab_Test3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-json-data-test3') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridJsonDataTab_Test3.value && LayoutGridJsonDataTab_Test3.value.resize) {
                  LayoutGridJsonDataTab_Test3.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-test4') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridTab_Test4.value && LayoutGridTab_Test4.value.resize) {
                  LayoutGridTab_Test4.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'layout-grid-json-data-test4') {
            nextTick(() => {
              setTimeout(() => {
                if (LayoutGridJsonDataTab_Test4.value && LayoutGridJsonDataTab_Test4.value.resize) {
                  LayoutGridJsonDataTab_Test4.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'map') {
            nextTick(() => {
              setTimeout(() => {
                if (MapTabRef.value && MapTabRef.value.invalidateSize) {
                  MapTabRef.value.invalidateSize();
                }
              }, 120);
            });
          }
        }
      );

      /**
       * 👀 監聽面板大小變化 (Watch Panel Size Changes)
       * 當面板寬度或高度變化時，更新相應的子組件
       */
      watch([() => props.mainPanelWidth, () => props.contentHeight], () => {
        nextTick(() => {
          // 觸發各個 Tab 重新調整以適應新的容器尺寸
          if (D3jsTab.value && D3jsTab.value.resize) {
            D3jsTab.value.resize();
          }
          if (GridScalingTab.value && GridScalingTab.value.resize) {
            GridScalingTab.value.resize();
          }
          if (SpaceNetworkGridTab.value && SpaceNetworkGridTab.value.resize) {
            SpaceNetworkGridTab.value.resize();
          }
          if (SpaceNetworkGridTabK3.value && SpaceNetworkGridTabK3.value.resize) {
            SpaceNetworkGridTabK3.value.resize();
          }
          if (SpaceNetworkGridTabL3.value && SpaceNetworkGridTabL3.value.resize) {
            SpaceNetworkGridTabL3.value.resize();
          }
          if (SpaceNetworkGridTabM3.value && SpaceNetworkGridTabM3.value.resize) {
            SpaceNetworkGridTabM3.value.resize();
          }
          if (LayoutGridTab.value && LayoutGridTab.value.resize) {
            LayoutGridTab.value.resize();
          }
          if (SpaceNetworkGridJsonDataTab.value && SpaceNetworkGridJsonDataTab.value.resize) {
            SpaceNetworkGridJsonDataTab.value.resize();
          }
          if (SpaceNetworkGridJsonDataTabK3.value && SpaceNetworkGridJsonDataTabK3.value.resize) {
            SpaceNetworkGridJsonDataTabK3.value.resize();
          }
          if (SpaceNetworkGridJsonDataTabL3.value && SpaceNetworkGridJsonDataTabL3.value.resize) {
            SpaceNetworkGridJsonDataTabL3.value.resize();
          }
          if (SpaceNetworkGridJsonDataTabM3.value && SpaceNetworkGridJsonDataTabM3.value.resize) {
            SpaceNetworkGridJsonDataTabM3.value.resize();
          }
          if (LayoutGridJsonDataTab.value && LayoutGridJsonDataTab.value.resize) {
            LayoutGridJsonDataTab.value.resize();
          }
          if (MapTabRef.value && MapTabRef.value.invalidateSize) {
            MapTabRef.value.invalidateSize();
          }
          if (SpaceNetworkGridTabLayoutViewer.value?.resize) {
            SpaceNetworkGridTabLayoutViewer.value.resize();
          }
          if (SpaceNetworkGridTabCanvasLayoutViewer.value?.resize) {
            SpaceNetworkGridTabCanvasLayoutViewer.value.resize();
          }
          if (SpaceNetworkGridTabLayoutPixelViewer.value?.resize) {
            SpaceNetworkGridTabLayoutPixelViewer.value.resize();
          }
        });
      });

      /**
       * 🎯 高亮顯示指定地圖特徵 (Highlight Feature on Map)
       * 如果當前不在地圖分頁，會自動切換到地圖分頁再執行高亮
       * 注意：地圖功能已移除，此函數現在為空函數
       *
       * @param {Object} highlightData - 包含 layerId 和 id 的高亮數據物件
       */
      const highlightFeature = () => {
        // 地圖功能已移除，不需要高亮顯示
      };

      /**
       * 🔄 重設地圖視圖 (Reset Map View)
       * 將地圖恢復到初始視圖狀態
       * 注意：地圖功能已移除，此函數現在為空函數
       */
      const resetView = () => {
        // 地圖功能已移除，不需要重設視圖
      };

      /**
       * 🗺️ 適應台南地區邊界 (Fit to Tainan Bounds)
       * 調整地圖視圖以完整顯示台南地區
       * 注意：地圖功能已移除，此函數現在為空函數
       */
      const fitToTainanBounds = () => {
        // 地圖功能已移除，不需要適應邊界
      };

      /**
       * 📏 使地圖尺寸失效 (Invalidate Map Size)
       * 強制重新計算地圖尺寸並重繪示意圖
       * 用於響應容器尺寸變化
       */
      const invalidateMapSize = () => {
        // 觸發 D3jsTab 重新繪製
        if (D3jsTab.value && D3jsTab.value.resize) {
          D3jsTab.value.resize();
        }
        // 觸發 GridScalingTab 重新繪製
        if (GridScalingTab.value && GridScalingTab.value.resize) {
          GridScalingTab.value.resize();
        }
        if (MapTabRef.value && MapTabRef.value.invalidateSize) {
          MapTabRef.value.invalidateSize();
        }
        if (SpaceNetworkGridTabLayoutViewer.value?.resize) {
          SpaceNetworkGridTabLayoutViewer.value.resize();
        }
        if (SpaceNetworkGridTabCanvasLayoutViewer.value?.resize) {
          SpaceNetworkGridTabCanvasLayoutViewer.value.resize();
        }
        if (SpaceNetworkGridTabLayoutPixelViewer.value?.resize) {
          SpaceNetworkGridTabLayoutPixelViewer.value.resize();
        }

        // 觸發全域 resize 事件作為備用方案
        setTimeout(() => {
          const event = new Event('resize');
          window.dispatchEvent(event);
        }, 50);
      };

      return {
        DashboardTab, // 儀表板組件引用
        D3jsTab, // D3.js 組件引用
        GridScalingTab, // 網格縮放組件引用
        SpaceNetworkGridTab, // 空間網絡網格組件引用
        SpaceNetworkGridTabK3, // taipei_k3 專用空間網絡網格
        SpaceNetworkGridTabL3, // taipei_l3 專用空間網絡網格
        SpaceNetworkGridTabM3, // taipei_m3 專用空間網絡網格
        LayoutGridTab, // 版面網格組件引用
        LayoutGridTab_Test, // 版面網格測試組件引用
        LayoutGridTab_Test3, // 版面網格測試3組件引用
        LayoutGridTab_Test4, // 版面網格測試4組件引用
        ProcessedJsonDataTab, // 處理後 JSON 數據組件引用
        JsonDataTab, // 原始 JSON 數據組件引用
        DrawJsonDataTab, // 繪製 JSON 數據組件引用
        SpaceNetworkGridJsonDataTab, // 空間網絡網格 JSON 數據組件引用
        SpaceNetworkGridJsonDataTabK3, // taipei_k3 專用 JSON 檢視
        SpaceNetworkGridJsonDataTabL3, // taipei_l3 專用 JSON 檢視
        SpaceNetworkGridJsonDataTabM3, // taipei_m3 專用 JSON 檢視
        LayoutGridJsonDataTab, // 佈局網格 JSON 數據組件引用
        LayoutGridJsonDataTab_Test, // 佈局網格 JSON 測試數據組件引用
        LayoutGridJsonDataTab_Test3, // 佈局網格 JSON 測試3數據組件引用
        LayoutGridJsonDataTab_Test4, // 佈局網格 JSON 測試4數據組件引用
        dashboardContainerRef, // 儀表板容器引用
        d3jsContainerRef, // D3.js 容器引用
        gridScalingContainerRef, // 網格縮放容器引用
        d3jsMapContainerRef, // 空間網絡網格容器引用
        d3jsMapContainerK3Ref, // taipei_k3 空間網絡網格容器引用
        d3jsMapContainerL3Ref, // taipei_l3 空間網絡網格容器引用
        d3jsMapContainerM3Ref, // taipei_m3 空間網絡網格容器引用
        layoutGridContainerRef, // 版面網格容器引用
        layoutGridTestContainerRef, // 版面網格測試容器引用
        processedJsonDataContainerRef, // 處理後 JSON 數據容器引用
        jsonDataContainerRef, // 原始 JSON 數據容器引用
        drawJsonDataContainerRef, // 繪製 JSON 數據容器引用
        spaceNetworkGridJsonDataContainerRef, // 空間網絡網格 JSON 數據容器引用
        spaceNetworkGridJsonDataK3ContainerRef, // taipei_k3 JSON 容器引用
        spaceNetworkGridJsonDataL3ContainerRef, // taipei_l3 JSON 容器引用
        spaceNetworkGridJsonDataM3ContainerRef, // taipei_m3 JSON 容器引用
        layoutGridJsonDataContainerRef, // 佈局網格 JSON 數據容器引用
        layoutGridJsonDataTestContainerRef, // 佈局網格 JSON 測試數據容器引用
        layoutGridTest3ContainerRef, // 版面網格測試3容器引用
        layoutGridTest4ContainerRef, // 版面網格測試4容器引用
        layoutGridJsonDataTest3ContainerRef, // 佈局網格 JSON 測試3數據容器引用
        layoutGridJsonDataTest4ContainerRef, // 佈局網格 JSON 測試4數據容器引用
        mapTabContainerRef, // Leaflet（MapTab）容器引用
        osm2GeojsonViewersContainerRef, // osm_2_geojson_2_json 三視窗容器引用
        SpaceNetworkGridJsonDataTabOsm2,
        osm2UpperJsonViewerMode,
        SpaceNetworkGridTabLayoutViewer,
        spaceLayoutGridViewerContainerRef,
        spaceLayoutGridViewerLayerFilter,
        SpaceNetworkGridTabCanvasLayoutViewer,
        canvasLayoutGridViewerContainerRef,
        canvasLayoutGridViewerLayerFilter,
        SpaceNetworkGridTabLayoutPixelViewer,
        layoutPixelGridViewerContainerRef,
        layoutPixelGridViewerLayerFilter,
        MapTabRef,
        highlightFeature, // 高亮顯示功能
        resetView, // 重設視圖功能
        fitToTainanBounds, // 適應邊界功能
        invalidateMapSize, // 刷新地圖尺寸功能

        // 🛠️ 工具函數
        getIcon, // 圖標獲取函數

        // 動態分頁可用性
        isTabEnabled, // 每個 tab 是否啟用的映射
        handleActiveLayerChange,
        activeUpperLayerId, // 當前選中的圖層 ID
        upperL3BoundLayerId,
        upperM3BoundLayerId,
      };
    },
  };
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden">
    <!-- 📑 分頁導航按鈕 -->
    <!-- 顯示所有 tabs，沒有圖層支持的 tabs 會被禁用 -->
    <div class="d-flex justify-content-start my-bgcolor-gray-200 p-3">
      <div class="d-flex align-items-center rounded-pill shadow my-blur gap-1 p-2">
        <!-- 🗺️ Leaflet 底圖（僅部分圖層於 upperViewTabs 宣告 map） -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'map',
          }"
          :disabled="!isTabEnabled['map']"
          @click="$emit('update:activeUpperTab', 'map')"
          title="Leaflet 地圖（底圖）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('map').icon"></i>
        </button>
        <!-- 📄 osm_2_geojson_2_json：OSM XML／GeoJSON／路網衍生 JSON -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{ 'my-btn-blue': activeUpperTab === 'osm-viewer' }"
          :disabled="!isTabEnabled['osm-viewer']"
          title="OSM XML（dataOSM）"
          style="width: 30px; height: 30px"
          @click="$emit('update:activeUpperTab', 'osm-viewer')"
        >
          <i :class="getIcon('code').icon"></i>
        </button>
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{ 'my-btn-blue': activeUpperTab === 'geojson-viewer' }"
          :disabled="!isTabEnabled['geojson-viewer']"
          title="GeoJSON（dataGeojson）"
          style="width: 30px; height: 30px"
          @click="$emit('update:activeUpperTab', 'geojson-viewer')"
        >
          <i :class="getIcon('project_diagram').icon"></i>
        </button>
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{ 'my-btn-blue': activeUpperTab === 'json-viewer' }"
          :disabled="!isTabEnabled['json-viewer']"
          title="路段 JSON（dataJson）"
          style="width: 30px; height: 30px"
          @click="$emit('update:activeUpperTab', 'json-viewer')"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{ 'my-btn-blue': activeUpperTab === 'space-layout-grid-viewer' }"
          :disabled="!isTabEnabled['space-layout-grid-viewer']"
          title="路段 dataJson 網格示意（D3）"
          style="width: 30px; height: 30px"
          @click="$emit('update:activeUpperTab', 'space-layout-grid-viewer')"
        >
          <i :class="getIcon('th').icon"></i>
        </button>
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{ 'my-btn-blue': activeUpperTab === 'canvas-layout-grid-viewer' }"
          :disabled="!isTabEnabled['canvas-layout-grid-viewer']"
          title="路段 dataJson 網格（正方格·以畫面短邊）"
          style="width: 30px; height: 30px"
          @click="$emit('update:activeUpperTab', 'canvas-layout-grid-viewer')"
        >
          <i :class="getIcon('th_large').icon"></i>
        </button>
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{ 'my-btn-blue': activeUpperTab === 'layout-grid-viewer' }"
          :disabled="!isTabEnabled['layout-grid-viewer']"
          title="版面路網：繪區像素刻度（無整數網格／細格）"
          style="width: 30px; height: 30px"
          @click="$emit('update:activeUpperTab', 'layout-grid-viewer')"
        >
          <i :class="getIcon('crosshairs').icon"></i>
        </button>
        <!-- 📈 空間網絡網格按鈕 (Space Network Grid Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'space-network-grid',
          }"
          :disabled="!isTabEnabled['space-network-grid']"
          @click="$emit('update:activeUpperTab', 'space-network-grid')"
          title="空間網絡網格"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('project_diagram').icon"></i>
        </button>
        <!-- 📄 空間網絡網格 JSON 數據按鈕 (Space Network Grid JSON Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'space-network-grid-json-data',
          }"
          :disabled="!isTabEnabled['space-network-grid-json-data']"
          @click="$emit('update:activeUpperTab', 'space-network-grid-json-data')"
          title="空間網絡網格 JSON 數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📈 空間網絡網格（taipei_k3 專用複製分頁） -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-network-grid',
          }"
          :disabled="!isTabEnabled['layout-network-grid']"
          @click="$emit('update:activeUpperTab', 'layout-network-grid')"
          title="空間網絡網格（k3 獨立資料）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('project_diagram').icon"></i>
        </button>
        <!-- 📄 空間網絡網格 JSON（taipei_k3 專用複製分頁） -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-network-grid-json-data',
          }"
          :disabled="!isTabEnabled['layout-network-grid-json-data']"
          @click="$emit('update:activeUpperTab', 'layout-network-grid-json-data')"
          title="空間網絡網格 JSON（k3 獨立資料）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📈 空間網絡網格（taipei_l3 專用複製分頁） -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'space-network-grid-l3',
          }"
          :disabled="!isTabEnabled['space-network-grid-l3']"
          @click="$emit('update:activeUpperTab', 'space-network-grid-l3')"
          title="空間網絡網格（l3 獨立資料）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('project_diagram').icon"></i>
        </button>
        <!-- 📄 空間網絡網格 JSON（taipei_l3 專用複製分頁） -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'space-network-grid-json-data-l3',
          }"
          :disabled="!isTabEnabled['space-network-grid-json-data-l3']"
          @click="$emit('update:activeUpperTab', 'space-network-grid-json-data-l3')"
          title="空間網絡網格 JSON（l3 獨立資料）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📈 空間網絡網格（taipei_m3 專用複製分頁） -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'space-network-grid-m3',
          }"
          :disabled="!isTabEnabled['space-network-grid-m3']"
          @click="$emit('update:activeUpperTab', 'space-network-grid-m3')"
          title="空間網絡網格（m3 獨立資料）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('project_diagram').icon"></i>
        </button>
        <!-- 📄 空間網絡網格 JSON（taipei_m3 專用複製分頁） -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'space-network-grid-json-data-m3',
          }"
          :disabled="!isTabEnabled['space-network-grid-json-data-m3']"
          @click="$emit('update:activeUpperTab', 'space-network-grid-json-data-m3')"
          title="空間網絡網格 JSON（m3 獨立資料）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📈 版面網格按鈕 (Layout Grid Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid',
          }"
          :disabled="!isTabEnabled['layout-grid']"
          @click="$emit('update:activeUpperTab', 'layout-grid')"
          title="版面網格"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('th').icon"></i>
        </button>
        <!-- 📄 佈局網格 JSON 數據按鈕 (Layout Grid JSON Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid-json-data',
          }"
          :disabled="!isTabEnabled['layout-grid-json-data']"
          @click="$emit('update:activeUpperTab', 'layout-grid-json-data')"
          title="佈局網格 JSON 數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📄 版面網格測試按鈕 (Layout Grid Test Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid-test',
          }"
          :disabled="!isTabEnabled['layout-grid-test']"
          @click="$emit('update:activeUpperTab', 'layout-grid-test')"
          title="版面網格測試"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('th').icon"></i>
        </button>
        <!-- 📄 佈局網格 JSON 測試數據按鈕 (Layout Grid JSON Test Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid-json-data-test',
          }"
          :disabled="!isTabEnabled['layout-grid-json-data-test']"
          @click="$emit('update:activeUpperTab', 'layout-grid-json-data-test')"
          title="佈局網格 JSON 測試數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📄 版面網格測試3按鈕 (Layout Grid Test3 Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid-test3',
          }"
          :disabled="!isTabEnabled['layout-grid-test3']"
          @click="$emit('update:activeUpperTab', 'layout-grid-test3')"
          title="版面網格測試3"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('th').icon"></i>
        </button>
        <!-- 📄 佈局網格 JSON 測試3數據按鈕 (Layout Grid JSON Test3 Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid-json-data-test3',
          }"
          :disabled="!isTabEnabled['layout-grid-json-data-test3']"
          @click="$emit('update:activeUpperTab', 'layout-grid-json-data-test3')"
          title="佈局網格 JSON 測試3數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📄 版面網格測試4按鈕 (Layout Grid Test4 Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid-test4',
          }"
          :disabled="!isTabEnabled['layout-grid-test4']"
          @click="$emit('update:activeUpperTab', 'layout-grid-test4')"
          title="版面網格測試4"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('th').icon"></i>
        </button>
        <!-- 📄 佈局網格 JSON 測試4數據按鈕 (Layout Grid JSON Test4 Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'layout-grid-json-data-test4',
          }"
          :disabled="!isTabEnabled['layout-grid-json-data-test4']"
          @click="$emit('update:activeUpperTab', 'layout-grid-json-data-test4')"
          title="佈局網格 JSON 測試4數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('file_code').icon"></i>
        </button>
        <!-- 📈 D3.js 按鈕 (D3.js Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'd3js',
          }"
          :disabled="!isTabEnabled['d3js']"
          @click="$emit('update:activeUpperTab', 'd3js')"
          title="D3.js 數據視覺化"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('chart_line').icon"></i>
        </button>
        <!-- 📊 網格縮放按鈕 (Grid Scaling Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'grid-scaling',
          }"
          :disabled="!isTabEnabled['grid-scaling']"
          @click="$emit('update:activeUpperTab', 'grid-scaling')"
          title="網格縮放視覺化"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('chart_line').icon"></i>
        </button>
        <!-- 📄 處理後 JSON 數據按鈕 (Processed JSON Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'processed-json-data',
          }"
          :disabled="!isTabEnabled['processed-json-data']"
          @click="$emit('update:activeUpperTab', 'processed-json-data')"
          title="處理後 JSON 數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('code').icon"></i>
        </button>
        <!-- 📄 原始 JSON 數據按鈕 (Original JSON Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'json-data',
          }"
          :disabled="!isTabEnabled['json-data']"
          @click="$emit('update:activeUpperTab', 'json-data')"
          title="原始 JSON 數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('json_data').icon"></i>
        </button>
        <!-- 🎨 繪製數據按鈕 (Draw Data Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'draw-json-data',
          }"
          :disabled="!isTabEnabled['draw-json-data']"
          @click="$emit('update:activeUpperTab', 'draw-json-data')"
          title="繪製數據"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('draw_data').icon"></i>
        </button>
        <!-- 📊 儀表板按鈕 (Dashboard Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'dashboard',
          }"
          :disabled="!isTabEnabled['dashboard']"
          @click="$emit('update:activeUpperTab', 'dashboard')"
          title="資料儀表板"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('chart_bar').icon"></i>
        </button>
      </div>
    </div>

    <!-- 📄 分頁內容區域 -->
    <div class="flex-grow-1 overflow-auto">
      <!-- D3.js 分頁內容 -->
      <div v-show="activeUpperTab === 'd3js'" ref="d3jsContainerRef" class="h-100">
        <D3jsTab
          ref="D3jsTab"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 網格縮放分頁內容 -->
      <div v-show="activeUpperTab === 'grid-scaling'" ref="gridScalingContainerRef" class="h-100">
        <GridScalingTab
          ref="GridScalingTab"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格分頁內容 -->
      <div v-show="activeUpperTab === 'space-network-grid'" ref="d3jsMapContainerRef" class="h-100">
        <SpaceNetworkGridTab
          ref="SpaceNetworkGridTab"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'space-network-grid'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格（taipei_k3 專用：元件與圖層資料欄位與主分頁分離） -->
      <div
        v-show="activeUpperTab === 'layout-network-grid'"
        ref="d3jsMapContainerK3Ref"
        class="h-100"
      >
        <SpaceNetworkGridTabK3
          ref="SpaceNetworkGridTabK3"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'layout-network-grid'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格（taipei_l3 專用：元件與圖層資料欄位與主／k3 分頁分離） -->
      <div
        v-show="activeUpperTab === 'space-network-grid-l3'"
        ref="d3jsMapContainerL3Ref"
        class="h-100"
      >
        <SpaceNetworkGridTabL3
          ref="SpaceNetworkGridTabL3"
          class="flex-grow-1 d-flex flex-column"
          :layer-id="upperL3BoundLayerId"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'space-network-grid-l3'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格（taipei_m3 專用：元件與圖層資料欄位與 l3 分頁分離） -->
      <div
        v-show="activeUpperTab === 'space-network-grid-m3'"
        ref="d3jsMapContainerM3Ref"
        class="h-100"
      >
        <SpaceNetworkGridTabM3
          ref="SpaceNetworkGridTabM3"
          class="flex-grow-1 d-flex flex-column"
          :layer-id="upperM3BoundLayerId"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'space-network-grid-m3'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 版面網格分頁內容 -->
      <div v-show="activeUpperTab === 'layout-grid'" ref="layoutGridContainerRef" class="h-100">
        <LayoutGridTab
          ref="LayoutGridTab"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'layout-grid'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- Leaflet 底圖分頁（MapTab） -->
      <div v-show="activeUpperTab === 'map'" ref="mapTabContainerRef" class="h-100">
        <MapTab
          ref="MapTabRef"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- osm_2_geojson_2_json：OSM／GeoJSON／衍生 JSON -->
      <div
        v-show="
          activeUpperTab === 'osm-viewer' ||
          activeUpperTab === 'geojson-viewer' ||
          activeUpperTab === 'json-viewer'
        "
        ref="osm2GeojsonViewersContainerRef"
        class="h-100 overflow-hidden"
      >
        <SpaceNetworkGridJsonDataTab
          ref="SpaceNetworkGridJsonDataTabOsm2"
          :osm-viewer-mode="osm2UpperJsonViewerMode"
          :container-height="contentHeight"
          :is-panel-dragging="isPanelDragging"
          :active-markers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <div
        v-show="activeUpperTab === 'space-layout-grid-viewer'"
        ref="spaceLayoutGridViewerContainerRef"
        class="h-100"
      >
        <SpaceNetworkGridTab
          ref="SpaceNetworkGridTabLayoutViewer"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'space-layout-grid-viewer'"
          :layer-filter="spaceLayoutGridViewerLayerFilter"
          container-id-suffix="layoutViewer"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <div
        v-show="activeUpperTab === 'canvas-layout-grid-viewer'"
        ref="canvasLayoutGridViewerContainerRef"
        class="h-100"
      >
        <SpaceNetworkGridTab
          ref="SpaceNetworkGridTabCanvasLayoutViewer"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'canvas-layout-grid-viewer'"
          :layer-filter="canvasLayoutGridViewerLayerFilter"
          :square-plot-by-shorter-side="true"
          container-id-suffix="canvasLayoutViewer"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <div
        v-show="activeUpperTab === 'layout-grid-viewer'"
        ref="layoutPixelGridViewerContainerRef"
        class="h-100"
      >
        <SpaceNetworkGridTab
          ref="SpaceNetworkGridTabLayoutPixelViewer"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'layout-grid-viewer'"
          :layer-filter="layoutPixelGridViewerLayerFilter"
          :layout-vh-draw-pixel-axes="true"
          container-id-suffix="layoutPixelViewer"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 儀表板分頁內容 -->
      <div v-show="activeUpperTab === 'dashboard'" ref="dashboardContainerRef" class="h-100">
        <DashboardTab
          ref="DashboardTab"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 處理後 JSON 數據分頁內容 -->
      <div
        v-show="activeUpperTab === 'processed-json-data'"
        ref="processedJsonDataContainerRef"
        class="h-100"
      >
        <ProcessedJsonDataTab
          ref="ProcessedJsonDataTab"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 原始 JSON 數據分頁內容 -->
      <div v-show="activeUpperTab === 'json-data'" ref="jsonDataContainerRef" class="h-100">
        <JsonDataTab
          ref="JsonDataTab"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 繪製數據分頁內容 -->
      <div
        v-show="activeUpperTab === 'draw-json-data'"
        ref="drawJsonDataContainerRef"
        class="h-100"
      >
        <DrawJsonDataTab
          ref="DrawJsonDataTab"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格 JSON 數據分頁內容 -->
      <div
        v-show="activeUpperTab === 'space-network-grid-json-data'"
        ref="spaceNetworkGridJsonDataContainerRef"
        class="h-100"
      >
        <SpaceNetworkGridJsonDataTab
          ref="SpaceNetworkGridJsonDataTab"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格 JSON（taipei_k3 專用複製分頁） -->
      <div
        v-show="activeUpperTab === 'layout-network-grid-json-data'"
        ref="spaceNetworkGridJsonDataK3ContainerRef"
        class="h-100"
      >
        <SpaceNetworkGridJsonDataTabK3
          ref="SpaceNetworkGridJsonDataTabK3"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格 JSON（taipei_l3 專用複製分頁） -->
      <div
        v-show="activeUpperTab === 'space-network-grid-json-data-l3'"
        ref="spaceNetworkGridJsonDataL3ContainerRef"
        class="h-100"
      >
        <SpaceNetworkGridJsonDataTabL3
          ref="SpaceNetworkGridJsonDataTabL3"
          :layer-id="upperL3BoundLayerId"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :isActive="activeUpperTab === 'space-network-grid-json-data-l3'"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 空間網絡網格 JSON（taipei_m3 專用複製分頁） -->
      <div
        v-show="activeUpperTab === 'space-network-grid-json-data-m3'"
        ref="spaceNetworkGridJsonDataM3ContainerRef"
        class="h-100"
      >
        <SpaceNetworkGridJsonDataTabM3
          ref="SpaceNetworkGridJsonDataTabM3"
          :layer-id="upperM3BoundLayerId"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :isActive="activeUpperTab === 'space-network-grid-json-data-m3'"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 佈局網格 JSON 數據分頁內容 -->
      <div
        v-show="activeUpperTab === 'layout-grid-json-data'"
        ref="layoutGridJsonDataContainerRef"
        class="h-100"
      >
        <LayoutGridJsonDataTab
          ref="LayoutGridJsonDataTab"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 版面網格測試分頁內容 -->
      <div
        v-show="activeUpperTab === 'layout-grid-test'"
        ref="layoutGridTestContainerRef"
        class="h-100"
      >
        <LayoutGridTab_Test
          ref="LayoutGridTab_Test"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'layout-grid-test'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 佈局網格 JSON 測試數據分頁內容 -->
      <div
        v-show="activeUpperTab === 'layout-grid-json-data-test'"
        ref="layoutGridJsonDataTestContainerRef"
        class="h-100"
      >
        <LayoutGridJsonDataTab_Test
          ref="LayoutGridJsonDataTab_Test"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 版面網格測試3分頁內容 -->
      <div
        v-show="activeUpperTab === 'layout-grid-test3'"
        ref="layoutGridTest3ContainerRef"
        class="h-100"
      >
        <LayoutGridTab_Test3
          ref="LayoutGridTab_Test3"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'layout-grid-test3'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 佈局網格 JSON 測試3數據分頁內容 -->
      <div
        v-show="activeUpperTab === 'layout-grid-json-data-test3'"
        ref="layoutGridJsonDataTest3ContainerRef"
        class="h-100"
      >
        <LayoutGridJsonDataTab_Test3
          ref="LayoutGridJsonDataTab_Test3"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 版面網格測試4分頁內容 -->
      <div
        v-show="activeUpperTab === 'layout-grid-test4'"
        ref="layoutGridTest4ContainerRef"
        class="h-100"
      >
        <LayoutGridTab_Test4
          ref="LayoutGridTab_Test4"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          :isActive="activeUpperTab === 'layout-grid-test4'"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>

      <!-- 佈局網格 JSON 測試4數據分頁內容 -->
      <div
        v-show="activeUpperTab === 'layout-grid-json-data-test4'"
        ref="layoutGridJsonDataTest4ContainerRef"
        class="h-100"
      >
        <LayoutGridJsonDataTab_Test4
          ref="LayoutGridJsonDataTab_Test4"
          :containerHeight="contentHeight"
          :isPanelDragging="isPanelDragging"
          :activeMarkers="activeMarkers"
          @active-layer-change="handleActiveLayerChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
