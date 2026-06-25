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
  import MapTab from '../tabs/MapTab.vue';
  import SelectRouteMapTab from '../tabs/SelectRouteMapTab.vue';
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
      ProcessedJsonDataTab,
      JsonDataTab,
      DrawJsonDataTab,
      SpaceNetworkGridJsonDataTab,
      MapTab,
      SelectRouteMapTab,
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
      /** 📊 D3.js 容器引用 (用於控制滑鼠事件) */
      const d3jsContainerRef = ref(null);
      /** 📊 網格縮放容器引用 (用於控制滑鼠事件) */
      const gridScalingContainerRef = ref(null);
      /** 📊 空間網絡網格容器引用 */
      const d3jsMapContainerRef = ref(null);
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
      const MapTabRef = ref(null);
      const mapTabContainerRef = ref(null);
      /** 🗺️ 選擇路線圖（select_route_map）顯示元件引用 */
      const SelectRouteMapTab = ref(null);
      const selectRouteMapContainerRef = ref(null);
      const osm2GeojsonViewersContainerRef = ref(null);
      /** osm_2_geojson_2_json 三 Upper 分頁共用一個 JSON 檢視元件，模式由 activeUpperTab 推導 */
      const SpaceNetworkGridJsonDataTabOsm2 = ref(null);
      /** 與 space-network-grid 相同元件，篩選具 space-layout-grid-viewer 之圖層 */
      const SpaceNetworkGridTabLayoutViewer = ref(null);
      const spaceLayoutGridViewerContainerRef = ref(null);
      const SpaceNetworkGridTabLayoutPixelViewer = ref(null);
      const layoutPixelGridViewerContainerRef = ref(null);

      const spaceLayoutGridViewerLayerFilter = (layer) =>
        Array.isArray(layer?.upperViewTabs) &&
        layer.upperViewTabs.includes('space-layout-grid-viewer');

      const layoutPixelGridViewerLayerFilter = (layer) =>
        Array.isArray(layer?.upperViewTabs) &&
        layer.upperViewTabs.includes('layout-grid-viewer');

      // 目前 UpperView 所選圖層（由各子 Tab 回傳）
      const activeUpperLayerId = ref(null);


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
        'select-route-map',
        'space-network-grid',
        'dashboard',
        'processed-json-data',
        'json-data',
        'draw-json-data',
        'space-network-grid-json-data',
        'map',
        'osm-viewer',
        'geojson-viewer',
        'json-viewer',
        'space-layout-grid-viewer',
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

            if (layoutPixelGridViewerContainerRef.value) {
              if (dragging && tab === 'layout-grid-viewer') {
                layoutPixelGridViewerContainerRef.value.style.pointerEvents = 'none';
              } else {
                layoutPixelGridViewerContainerRef.value.style.pointerEvents = 'auto';
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
          } else if (newTab === 'select-route-map') {
            nextTick(() => {
              setTimeout(() => {
                if (SelectRouteMapTab.value && SelectRouteMapTab.value.resize) {
                  SelectRouteMapTab.value.resize();
                }
              }, 100);
            });
          } else if (newTab === 'space-network-grid') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTab.value && SpaceNetworkGridTab.value.resize) {
                  SpaceNetworkGridTab.value.resize();
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
          } else if (newTab === 'layout-grid-viewer') {
            nextTick(() => {
              setTimeout(() => {
                if (SpaceNetworkGridTabLayoutPixelViewer.value?.resize) {
                  SpaceNetworkGridTabLayoutPixelViewer.value.resize();
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
          if (SpaceNetworkGridJsonDataTab.value && SpaceNetworkGridJsonDataTab.value.resize) {
            SpaceNetworkGridJsonDataTab.value.resize();
          }
          if (MapTabRef.value && MapTabRef.value.invalidateSize) {
            MapTabRef.value.invalidateSize();
          }
          if (SelectRouteMapTab.value && SelectRouteMapTab.value.resize) {
            SelectRouteMapTab.value.resize();
          }
          if (SpaceNetworkGridTabLayoutViewer.value?.resize) {
            SpaceNetworkGridTabLayoutViewer.value.resize();
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
        ProcessedJsonDataTab, // 處理後 JSON 數據組件引用
        JsonDataTab, // 原始 JSON 數據組件引用
        DrawJsonDataTab, // 繪製 JSON 數據組件引用
        SpaceNetworkGridJsonDataTab, // 空間網絡網格 JSON 數據組件引用
        dashboardContainerRef, // 儀表板容器引用
        d3jsContainerRef, // D3.js 容器引用
        gridScalingContainerRef, // 網格縮放容器引用
        d3jsMapContainerRef, // 空間網絡網格容器引用
        processedJsonDataContainerRef, // 處理後 JSON 數據容器引用
        jsonDataContainerRef, // 原始 JSON 數據容器引用
        drawJsonDataContainerRef, // 繪製 JSON 數據容器引用
        spaceNetworkGridJsonDataContainerRef, // 空間網絡網格 JSON 數據容器引用
        mapTabContainerRef, // Leaflet（MapTab）容器引用
        SelectRouteMapTab, // 選擇路線圖顯示元件引用
        selectRouteMapContainerRef, // 選擇路線圖容器引用
        osm2GeojsonViewersContainerRef, // osm_2_geojson_2_json 三視窗容器引用
        SpaceNetworkGridJsonDataTabOsm2,
        osm2UpperJsonViewerMode,
        SpaceNetworkGridTabLayoutViewer,
        spaceLayoutGridViewerContainerRef,
        spaceLayoutGridViewerLayerFilter,
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
          :class="{ 'my-btn-blue': activeUpperTab === 'layout-grid-viewer' }"
          :disabled="!isTabEnabled['layout-grid-viewer']"
          title="版面路網：繪區像素刻度（無整數網格／細格）"
          style="width: 30px; height: 30px"
          @click="$emit('update:activeUpperTab', 'layout-grid-viewer')"
        >
          <i :class="getIcon('crosshairs').icon"></i>
        </button>
        <!-- 🗺️ 選擇路線圖按鈕 (Select Route Map Button) -->
        <button
          class="btn rounded-circle border-0 d-flex align-items-center justify-content-center my-btn-transparent my-font-size-xs"
          :class="{
            'my-btn-blue': activeUpperTab === 'select-route-map',
          }"
          :disabled="!isTabEnabled['select-route-map']"
          @click="$emit('update:activeUpperTab', 'select-route-map')"
          title="選擇路線圖（載入城市路線）"
          style="width: 30px; height: 30px"
        >
          <i :class="getIcon('map').icon"></i>
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
      <!-- 🗺️ 選擇路線圖（select_route_map）：載入城市路線之唯讀 Leaflet 顯示 -->
      <div
        v-show="activeUpperTab === 'select-route-map'"
        ref="selectRouteMapContainerRef"
        class="h-100"
      >
        <SelectRouteMapTab
          ref="SelectRouteMapTab"
          class="flex-grow-1 d-flex flex-column"
          :containerHeight="contentHeight"
          :isActive="activeUpperTab === 'select-route-map'"
        />
      </div>

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

    </div>
  </div>
</template>

<style scoped></style>
