/**
 * 📦 數據存儲模組 (Data Store Module) - Pinia Store
 *
 * 這是一個基於 Pinia 的集中式狀態管理模組，專為 Schematic Map 3 設計。
 * 該模組負責管理整個應用程式的狀態，包括圖層配置、數據載入、用戶互動
 * 和視覺化設定等。它提供了統一的 API 介面，簡化了組件間的數據交互，
 * 並確保狀態的一致性和可預測性。
 *
 * 🎯 核心功能 (Core Features):
 * 1. 🏙️ 圖層管理系統：管理所有圖層的配置、狀態和數據
 *    - 圖層配置：定義圖層的基本屬性和載入方式
 *    - 圖層狀態：追蹤圖層的可見性、載入狀態和數據狀態
 *    - 圖層分組：將圖層組織成邏輯群組，便於管理
 * 2. 📊 數據載入控制：管理異步數據載入流程
 *    - 自動載入：當圖層開啟時自動載入對應數據
 *    - 載入狀態：追蹤載入進度和錯誤狀態
 *    - 數據快取：避免重複載入相同數據
 * 3. 🎯 用戶互動管理：處理用戶選擇和互動狀態
 *    - 要素選擇：管理當前選中的地理要素
 *    - 圖層切換：處理圖層的開啟和關閉
 *    - 視覺化設定：管理 D3.js 視覺化組件的設定
 * 4. 📈 統計數據管理：計算和快取統計信息
 *    - 實時統計：根據當前可見圖層計算統計數據
 *    - 數據摘要：提供圖層數據的摘要信息
 *    - 性能優化：避免重複計算，提高性能
 *
 * 🏗️ 架構設計 (Architecture Design):
 * - 集中式狀態管理：所有狀態集中在一個 store 中
 * - 響應式更新：使用 Vue 3 的響應式系統確保 UI 同步
 * - 模組化設計：將不同功能分離到不同的函數中
 * - 類型安全：提供完整的 TypeScript 類型定義
 * - 持久化支援：支援狀態的本地存儲和恢復
 *
 * 🔧 技術特點 (Technical Features):
 * - Pinia 狀態管理：使用 Vue 3 官方推薦的狀態管理庫
 * - Composition API：使用 Vue 3 的 Composition API 設計
 * - 異步操作：支援 Promise 和 async/await 語法
 * - 錯誤處理：完整的錯誤捕獲和恢復機制
 * - 性能優化：使用計算屬性和快取機制
 *
 * 📊 狀態結構 (State Structure):
 * - layers: 圖層配置和狀態陣列
 * - layerStates: 圖層狀態的詳細追蹤
 * - selectedFeature: 當前選中的地理要素
 * - d3jsDimensions: D3.js 視覺化組件的尺寸設定
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 在組件中使用 store
 * import { useDataStore } from '@/stores/dataStore';
 *
 * const dataStore = useDataStore();
 *
 * // 切換圖層可見性
 * await dataStore.toggleLayerVisibility('taipei_metro');
 *
 * // 獲取可見圖層
 * const visibleLayers = dataStore.visibleLayers;
 *
 * // 設定選中的要素
 * dataStore.setSelectedFeature(feature);
 * ```
 *
 * 🔄 數據流程 (Data Flow):
 * 1. 組件調用 store 方法
 * 2. Store 更新內部狀態
 * 3. 響應式系統觸發 UI 更新
 * 4. 組件重新渲染
 * 5. 用戶看到更新後的界面
 *
 * ⚠️ 注意事項 (Important Notes):
 * - 所有狀態變更都應該通過 store 方法進行
 * - 異步操作需要適當的錯誤處理
 * - 大型數據集可能需要較長的載入時間
 * - 建議在載入過程中顯示進度指示器
 *
 * @file dataStore.js
 * @version 3.0.0
 * @author Kevin Cheng
 * @since 1.0.0
 * @see {@link https://pinia.vuejs.org/} Pinia 官方文檔
 * @see {@link https://vuejs.org/guide/composition-api/} Vue 3 Composition API 文檔
 */
// ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

/**
 * Pinia 狀態管理庫引入
 * Vue 3 官方推薦的狀態管理解決方案
 * 提供更好的 TypeScript 支援和開發者體驗
 *
 * @see https://pinia.vuejs.org/
 */
import { defineStore } from 'pinia';

/**
 * Vue 3 Composition API 核心功能引入
 * 提供響應式數據和計算屬性功能
 *
 * @see https://vuejs.org/
 */
import { ref, computed, nextTick } from 'vue';

/**
 * 數據處理工具函數引入
 * 提供數據載入功能
 */
import {
  loadDataLayerJson,
  loadGridSchematicJson,
  processGridToDrawData,
  processMetroToDrawData,
  loadGeoJsonForRoutes,
  loadOsmXmlAsGeoJsonForRoutes,
} from '../utils/dataProcessor.js';

import {
  isCoordNormalizedDataJsonMirrorFollowonLayerId,
  LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
} from '../utils/layers/json_grid_coord_normalized/layerIds.js';
import { ensureTaipeiFListedGrayHighlightSnapshot } from '../utils/layerStationsTowardSchematicCenter.js';
import { executeHillClimb } from '../utils/layers/schematic_layout/hillClimb/executeHillClimb.js';
import { executeMilp } from '../utils/layers/schematic_layout/milp/executeMilp.js';
import {
  executeReadMilpResult,
  executeMilpStraightenSeed,
} from '../utils/layers/schematic_layout/milp/readMilpResult.js';
import { executeStroke } from '../utils/layers/schematic_layout/stroke/executeStroke.js';
import { executeStroke as executeStrokeRma } from '../utils/routeMapAdjust/schematic/stroke/executeStroke.js';
import { executeHillClimb as executeHillClimbRma } from '../utils/routeMapAdjust/schematic/hillClimb/executeHillClimb.js';
import { executeMilp as executeMilpRma } from '../utils/routeMapAdjust/schematic/milp/executeMilp.js';
import { executeForce as executeForceRma } from '../utils/routeMapAdjust/schematic/forceDirected/executeForce.js';
import { executeWangChi as executeWangChiRma } from '../utils/routeMapAdjust/schematic/leastSquares/executeWangChi.js';
import { executeBast as executeBastRma } from '../utils/routeMapAdjust/schematic/gridGraph/executeBast.js';
import { executeMerrick as executeMerrickRma } from '../utils/routeMapAdjust/schematic/pathSimplify/executeMerrick.js';
import { executeSat as executeSatRma } from '../utils/routeMapAdjust/schematic/sat/executeSat.js';
import { executeNormalizeRma } from '../utils/routeMapAdjust/schematic/normalize/executeNormalize.js';
import { executeReadMilpResult as executeReadMilpResultRma } from '../utils/routeMapAdjust/schematic/milp/readMilpResult.js';
import { makeRouteAdjustLayoutLayer } from '../utils/routeMapAdjust/routeAdjustLayout/layerDef.js';
import {
  executeRouteAdjustStroke,
  executeRouteAdjustHillClimb,
  executeRouteAdjustMilp,
  executeRouteAdjustForce,
  executeRouteAdjustWangChi,
  executeRouteAdjustBast,
  executeRouteAdjustMerrick,
  executeRouteAdjustSat,
} from '../utils/routeMapAdjust/routeAdjustLayout/execute.js';
import {
  ROUTE_ADJUST_STROKE_LAYER_ID,
  ROUTE_ADJUST_HILLCLIMB_LAYER_ID,
  ROUTE_ADJUST_MILP_LAYER_ID,
  ROUTE_ADJUST_FORCE_LAYER_ID,
  ROUTE_ADJUST_WANGCHI_LAYER_ID,
  ROUTE_ADJUST_BAST_LAYER_ID,
  ROUTE_ADJUST_MERRICK_LAYER_ID,
  ROUTE_ADJUST_SAT_LAYER_ID,
} from '../utils/routeMapAdjust/routeAdjustLayout/layerIds.js';
import { assignOsm2LayerViewerFields } from '../utils/layers/osm_2_geojson_2_json/layerMerge.js';
import {
  LAYER_ID as OSM_2_GEOJSON_2_JSON_LAYER_ID,
  setOsm2GeojsonSessionOsmXml,
} from '../utils/layers/osm_2_geojson_2_json/sessionOsmXml.js';
import {
  mirrorResetAndPersistJsonGridCoordNormalized,
  reloadJsonGridCoordNormalizedLayer,
  syncOsm2DataJsonMirrorFromParent as syncOsm2DataJsonMirrorFromParentImpl,
} from '../utils/layers/json_grid_coord_normalized/mirrorFromOsm2Layer.js';
import {
  mirrorResetAndPersistJsonGridFromCoordNormalized,
  reloadJsonGridFromCoordNormalizedLayer,
  seedConnectStraightenHvFromUpstreamIfEmpty,
  refreshRmaLayoutNetworkGridFromVhIfVisible,
} from '../utils/layers/json_grid_coord_normalized/mirrorFromCoordNormalizedLayer.js';
import { isRmaLayoutNetworkGridFromVhDrawLayerId } from '../utils/layers/json_grid_coord_normalized/layerIds.js';
import { sortLayoutVhDrawCopyBlackDotDataTableRowsByWeightDiffAsc } from '../utils/layers/json_grid_coord_normalized/layoutTrafficWeightsSync.js';
import {
  isRegisteredNetworkDrawSketchLayerId,
  isNetworkDrawSketchPipelineB3LayerId,
} from '../utils/networkDrawSketchPipelineLayers.js';
// ==================== 📦 主要數據存儲定義 (Main Data Store Definition) ====================

/**
 * 📦 數據存儲 Store 實例 (Data Store Instance)
 *
 * 使用 Pinia 的 defineStore 創建數據存儲實例，採用 Composition API 設計模式。
 * 該 store 是整個應用程式的狀態管理中心，提供統一的狀態管理和數據操作介面。
 *
 * 🎯 Store 功能 (Store Features):
 * - 圖層管理：管理所有圖層的配置、狀態和數據
 * - 狀態追蹤：追蹤圖層的載入狀態、可見性等
 * - 數據載入：處理異步數據載入和錯誤處理
 * - 用戶互動：管理用戶選擇和互動狀態
 * - 視覺化設定：管理 D3.js 視覺化組件的設定
 *
 * 🔧 技術實現 (Technical Implementation):
 * - 使用 defineStore 創建 Pinia store
 * - 採用 Composition API 設計模式
 * - 支援狀態持久化（persist: true）
 * - 提供響應式狀態更新
 *
 * @type {Store} Pinia Store 實例
 * @since 1.0.0
 */
export const useDataStore = defineStore(
  'data',
  () => {
    // ==================== 🗺️ 圖層狀態管理 (Layer State Management) ====================

    /**
     * 📊 圖層狀態存儲 (Layer States Storage)
     *
     * 存儲所有圖層的詳細狀態信息，包括可見性、載入狀態、數據內容等。
     * 這個響應式對象會自動追蹤圖層狀態的變化，並觸發相關的 UI 更新。
     *
     * 狀態結構：
     * - layerId: 圖層唯一識別碼
     * - visible: 圖層是否可見
     * - isLoading: 圖層是否正在載入
     * - isLoaded: 圖層是否已載入完成
     * - jsonData: 圖層的原始 JSON 數據（不可修改）
     * - processedJsonData: 圖層的處理後 JSON 數據（用於顯示和計算）
     * - geojsonData: 圖層的 GeoJSON 數據（如果圖層包含 GeoJSON 格式數據）
     * - dashboardData: 圖層的儀表板數據
     * - dataTableData: 圖層的表格數據
     * - layerInfoData: 圖層的資訊數據
     *
     * @type {Ref<Object>} 圖層狀態響應式對象
     * @since 1.0.0
     */
    const layerStates = ref({});

    /**
     * 🗺️ 圖層配置定義 (Layer Configuration Definition)
     *
     * 靜態定義的圖層配置陣列，包含所有可用的圖層信息。每個圖層都包含
     * 完整的配置信息，包括載入方式、顯示設定、數據來源等。
     *
     * 圖層群組結構：
     * - 測試圖層：包含網格示意圖測試等開發用圖層
     * - 數據圖層：包含台北捷運等實際數據圖層
     *
     * 圖層屬性說明：
     * - layerId: 圖層唯一識別碼
     * - layerName: 圖層顯示名稱
     * - visible: 圖層初始可見性
     * - isLoading: 圖層載入狀態
     * - isLoaded: 圖層載入完成狀態
     * - type: 圖層類型（grid, point, line 等）
     * - colorName: 圖層顏色名稱
     * - jsonData: 圖層原始 JSON 數據（不可修改）
     * - processedJsonData: 圖層處理後 JSON 數據（用於顯示和計算）
     * - geojsonData: 圖層的 GeoJSON 數據（如果圖層包含 GeoJSON 格式數據）
     * - dashboardData: 圖層儀表板數據
     * - dataTableData: 圖層表格數據
     * - layerInfoData: 圖層資訊數據
     * - jsonLoader: 圖層 JSON 數據載入函數
     * - geojsonLoader: 圖層 GeoJSON 數據載入函數
     * - jsonFileName: 圖層 JSON 文件名稱
     * - geojsonFileName: 圖層 GeoJSON 文件名稱
     * - isDataLayer: 是否為數據圖層
     * - hideFromMap: 是否從地圖隱藏
     * - display: 是否顯示
     * - isGridSchematic: 是否為網格示意圖
     *
     * @type {Ref<Array>} 圖層配置響應式陣列
     * @since 1.0.0
     */
    const layers = ref([
      {
        groupName: '路線圖處理',
        groupLayers: [
          {
            /** 🗺️ 選擇路線圖（select_route_map）— 載入世界各城市路線並唯讀顯示。
             *  與 leaflet_josm_draw 完全獨立（程式集中於 src/utils/selectRouteMap/）。 */
            layerId: 'select_route_map',
            layerName: '選擇路線圖',
            visible: false,
            isLoading: false,
            isLoaded: true,
            colorName: 'red',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: false,
            hideFromMap: true,
            display: true,
            /** 🏷️ 標記為「選擇路線圖」圖層 */
            isSelectRouteMapLayer: true,
            /** ✏️ 載入之路線：[{ color, latlngs:[[lat,lng],...], routeName?, routeId?, ... }, ...] */
            selectRouteMapLines: [],
            /** ⚫ 一般黑點（中間站）：[[lat, lng], ...] */
            selectRouteMapBlackDots: [],
            /** 站點中繼資料：{ '${lat},${lng}': { id, name, osmId } } */
            selectRouteMapStationMeta: null,
            /** 資料來源標籤 */
            selectRouteMapSource: null,
            /** 載入之原始 GeoJSON（FeatureCollection），供 GeoJSON 檢視分頁顯示 */
            selectRouteMapGeojson: null,
            /** 🏷️ 是否在地圖上常駐顯示車站名 */
            selectRouteMapShowNames: false,
            upperViewTabs: ['select-route-map', 'select-route-map-geojson'],
          },
          {
            /** 🗺️ 路線圖調整（route_map_adjust）— 從「選擇路線圖」載入路線後（之後可）調整。
             *  與 select_route_map 完全獨立（程式集中於 src/utils/routeMapAdjust/）。 */
            layerId: 'route_map_adjust',
            layerName: '路線圖轉換骨架',
            visible: false,
            isLoading: false,
            isLoaded: true,
            colorName: 'blue',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: false,
            hideFromMap: true,
            display: true,
            /** 🏷️ 標記為「路線圖調整」圖層 */
            isRouteMapAdjustLayer: true,
            /** ✏️ 調整中之路線：[{ color, latlngs:[[lat,lng],...], routeName?, routeId?, ... }, ...] */
            routeMapAdjustLines: [],
            /** ⚫ 一般黑點（中間站）：[[lat, lng], ...] */
            routeMapAdjustBlackDots: [],
            /** 🟡 交叉站點（cross）：路線幾何交叉但無站點處，[[lat, lng], ...] */
            routeMapAdjustCrossStations: [],
            /** 🔶 共線段：被 ≥2 路線共用（重疊）之線段，[{a,b,routes:[屬性...]}...]（載入後預設計算） */
            routeMapAdjustSharedSegments: [],
            /** 🦴 骨架圖：{ nodes:[[lat,lng]...], edges:[{a,b,routeCount}...], crossNodes:[[lat,lng]...] }｜null */
            routeMapAdjustSkeleton: null,
            /** 站點中繼資料：{ '${lat},${lng}': { id, name, osmId } } */
            routeMapAdjustStationMeta: null,
            /** 資料來源標籤 */
            routeMapAdjustSource: null,
            /** 🏷️ 是否在地圖上常駐顯示車站名 */
            routeMapAdjustShowNames: false,
            upperViewTabs: ['route-map-adjust'],
          },
          {
            /** 🗺️ 路線圖轉換骨架2（route_map_adjust_2）— 路線圖轉換骨架之獨立複製版本。
             *  程式與 route_map_adjust 完全獨立（複製自 src/utils/routeMapAdjust/）。 */
            layerId: 'route_map_adjust_2',
            layerName: '路線圖轉換骨架2',
            visible: false,
            isLoading: false,
            isLoaded: true,
            colorName: 'blue',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: false,
            hideFromMap: true,
            display: true,
            /** 🏷️ 標記為「路線圖轉換骨架2」圖層 */
            isRouteMapAdjust2Layer: true,
            /** ✏️ 調整中之路線：[{ color, latlngs:[[lat,lng],...], routeName?, routeId?, ... }, ...] */
            routeMapAdjustLines: [],
            /** ⚫ 一般黑點（中間站）：[[lat, lng], ...] */
            routeMapAdjustBlackDots: [],
            /** 🟡 交叉站點（cross）：路線幾何交叉但無站點處，[[lat, lng], ...] */
            routeMapAdjustCrossStations: [],
            /** 🔶 共線段：被 ≥2 路線共用（重疊）之線段，[{a,b,routes:[屬性...]}...]（載入後預設計算） */
            routeMapAdjustSharedSegments: [],
            /** 🦴 骨架圖：{ nodes:[[lat,lng]...], edges:[{a,b,routeCount}...], crossNodes:[[lat,lng]...] }｜null */
            routeMapAdjustSkeleton: null,
            /** 站點中繼資料：{ '${lat},${lng}': { id, name, osmId } } */
            routeMapAdjustStationMeta: null,
            /** 資料來源標籤 */
            routeMapAdjustSource: null,
            /** 🏷️ 是否在地圖上常駐顯示車站名 */
            routeMapAdjustShowNames: false,
            upperViewTabs: ['route-map-adjust-2'],
          },
          {
            /** 🗺️ 路線圖調整直線骨架（route_map_adjust_straight）— 從「選擇路線圖」載入路線後（之後可）調整。
             *  與 route_map_adjust 完全獨立（程式集中於 src/utils/routeMapAdjust/ 之複製版）。 */
            layerId: 'route_map_adjust_straight',
            layerName: '路線圖轉換直線骨架',
            visible: false,
            isLoading: false,
            isLoaded: true,
            colorName: 'indigo',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: false,
            hideFromMap: true,
            display: true,
            /** 🏷️ 標記為「路線圖轉換直線骨架」圖層 */
            isRouteMapAdjustStraightLayer: true,
            /** ✏️ 調整中之路線：[{ color, latlngs:[[lat,lng],...], routeName?, routeId?, ... }, ...] */
            routeMapAdjustLines: [],
            /** ⚫ 一般黑點（中間站）：[[lat, lng], ...] */
            routeMapAdjustBlackDots: [],
            /** 🟡 交叉站點（cross）：路線幾何交叉但無站點處，[[lat, lng], ...] */
            routeMapAdjustCrossStations: [],
            /** 🔶 共線段：被 ≥2 路線共用（重疊）之線段，[{a,b,routes:[屬性...]}...]（載入後預設計算） */
            routeMapAdjustSharedSegments: [],
            /** 🦴 骨架圖：{ nodes:[[lat,lng]...], edges:[{a,b,routeCount}...], crossNodes:[[lat,lng]...] }｜null */
            routeMapAdjustSkeleton: null,
            /** 🦴 拉直後路線（紅/藍錨點間直線；建骨架時產生，還原骨架時清除） */
            routeMapAdjustStraightenedLines: null,
            /** ⚫ 拉直後黑點（各紅/藍段上平均分配；建骨架時產生） */
            routeMapAdjustStraightenedBlackDots: null,
            /** 拉直後站點中繼（黑點位移後更新鍵） */
            routeMapAdjustStraightenedStationMeta: null,
            /** 站點中繼資料：{ '${lat},${lng}': { id, name, osmId } } */
            routeMapAdjustStationMeta: null,
            /** 資料來源標籤 */
            routeMapAdjustSource: null,
            /** 🏷️ 是否在地圖上常駐顯示車站名 */
            routeMapAdjustShowNames: false,
            upperViewTabs: ['route-map-adjust-straight'],
          },
        ],
      },
      {
        groupName: '示意圖佈局',
        groupLayers: [
          {
            /** 示意圖佈局 #1（從路線圖調整載入）：Stroke-based，程式同 schematic_stroke。 */
            layerId: 'schematic_rma_stroke',
            layerName: '① 示意圖佈局（Stroke-based）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeStrokeRma,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            /** 🏷️ 標記為「路線圖調整 → 示意圖佈局」圖層（ControlTab 顯示專屬載入/執行面板） */
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #2（從路線圖調整載入）：Hill Climbing，程式同 schematic_hillclimb。 */
            layerId: 'schematic_rma_hillclimb',
            layerName: '② 示意圖佈局（Hill Climbing）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'deeppurple',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeHillClimbRma,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #3（從路線圖調整載入）：MILP，程式同 schematic_milp。 */
            layerId: 'schematic_rma_milp',
            layerName: '③ 示意圖佈局（MILP）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeMilpRma,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #4（從路線圖調整載入）：Hong et al. (2006) 力導向（Method 5：PrEd + 正交/45° 磁簧力）。 */
            layerId: 'schematic_rma_force',
            layerName: '④ 示意圖佈局（Force-directed）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'green',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeForceRma,
            /** 「拉直」步驟產出的 connect 直邊骨架 { skeletonFlat, sections, meta }，供「開始執行」取用 */
            straightenedInput: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #5（從路線圖調整載入）：Wang & Chi (2011) Focus+Context 最小二乘變形。 */
            layerId: 'schematic_rma_wangchi',
            layerName: '⑤ 示意圖佈局（Least-Squares）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'cyan',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeWangChiRma,
            /** 「拉直」步驟產出的 connect 直邊骨架 { skeletonFlat, sections, meta }，供「開始執行」取用 */
            straightenedInput: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #6（從路線圖調整載入）：Bast et al. (2020) Octilinear Grid Graph 最短路近似。 */
            layerId: 'schematic_rma_bast',
            layerName: '⑥ 示意圖佈局（Octilinear Grid）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'orange',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeBastRma,
            /** 「拉直」步驟產出的 connect 直邊骨架 { skeletonFlat, sections, meta }，供「開始執行」取用 */
            straightenedInput: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #7（從路線圖調整載入）：Merrick & Gudmundsson (2007) C-directed 路徑簡化。 */
            layerId: 'schematic_rma_merrick',
            layerName: '⑦ 示意圖佈局（Path Simplification）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'red',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeMerrickRma,
            /** 「拉直」步驟產出的 connect 直邊骨架 { skeletonFlat, sections, meta }，供「開始執行」取用 */
            straightenedInput: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #8（從路線圖調整載入）：Fuchs (2022) SAT-based octilinear（精確八方向 MaxSAT）。 */
            layerId: 'schematic_rma_sat',
            layerName: '⑧ 示意圖佈局（SAT）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'red',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeSatRma,
            /** 「拉直」步驟產出的 connect 直邊骨架 { skeletonFlat, sections, meta }，供「開始執行」取用 */
            straightenedInput: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 ⑨（正規化）：座標正規化 → 鄰線錯邊修正（若須）→ 刪空欄列，完全在本層內完成。 */
            layerId: 'schematic_rma_normalize',
            layerName: '⑨ 示意圖佈局（正規化）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'lime',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeNormalizeRma,
            /** 「拉直」步驟產出的 connect 直邊骨架 { skeletonFlat, sections, meta }，供「開始執行」取用 */
            straightenedInput: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            /** 鄰線錯邊修正所用的 c3 參考路網（每次正規化後存入） */
            jsonGridCoordNormalizeReferenceC3: null,
            /** 鄰線錯邊修正座標紀錄（持久化） */
            jsonGridNeighborFixPersist: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
        ],
      },
      {
        groupName: '路線正規化',
        groupLayers: [
          {
            /** MILP結果正規化（RMA）：讀 ③ MILP（schematic_rma_milp）結果（或匯入下載 JSON）並做保拓樸座標正規化。 */
            layerId: 'schematic_rma_milp_read',
            layerName: '路線正規化',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeReadMilpResultRma,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_STROKE_LAYER_ID,
            layerName: '① 站點與路線調整（Stroke-based）',
            colorName: 'teal',
            executeFunction: executeRouteAdjustStroke,
          }),
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_HILLCLIMB_LAYER_ID,
            layerName: '② 站點與路線調整（Hill Climbing）',
            colorName: 'deeppurple',
            executeFunction: executeRouteAdjustHillClimb,
          }),
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_MILP_LAYER_ID,
            layerName: '③ 站點與路線調整（MILP）',
            colorName: 'pink',
            executeFunction: executeRouteAdjustMilp,
          }),
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_FORCE_LAYER_ID,
            layerName: '④ 站點與路線調整（力導向）',
            colorName: 'orange',
            executeFunction: executeRouteAdjustForce,
          }),
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_WANGCHI_LAYER_ID,
            layerName: '⑤ 站點與路線調整（Wang & Chi）',
            colorName: 'indigo',
            executeFunction: executeRouteAdjustWangChi,
          }),
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_BAST_LAYER_ID,
            layerName: '⑥ 站點與路線調整（Bast 格網最短路）',
            colorName: 'cyan',
            executeFunction: executeRouteAdjustBast,
          }),
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_MERRICK_LAYER_ID,
            layerName: '⑦ 站點與路線調整（Merrick 路徑簡化）',
            colorName: 'brown',
            executeFunction: executeRouteAdjustMerrick,
          }),
          makeRouteAdjustLayoutLayer({
            layerId: ROUTE_ADJUST_SAT_LAYER_ID,
            layerName: '⑧ 站點與路線調整（SAT）',
            colorName: 'bluegrey',
            executeFunction: executeRouteAdjustSat,
          }),
          {
            /** 站點與路線往中心聚集（RMA·先橫後直）：自「MILP結果正規化（RMA）」抓資料，演算法同 OSM 版。 */
            layerId: 'schematic_rma_toward_center_hv',
            layerName: '站點與路線往中心聚集（先橫後直）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 站點與路線往中心聚集（RMA·先直後橫）：自「先橫後直（RMA）」抓資料，演算法同 OSM 版。 */
            layerId: 'schematic_rma_toward_center_vh',
            layerName: '站點與路線往中心聚集（先直後橫）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            isRouteSchematicLayer: true,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'route-schematic',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
        ],
      },
      {
        groupName: '路網網格',
        groupLayers: [
          {
            /** 路網網格（RMA）：與「版面網絡網格 → 路網網格」同檢視／繪製／UI，資料源自 RMA「先直後橫」(schematic_rma_toward_center_vh)。 */
            layerId: 'layout_network_grid_from_vh_draw_rma',
            layerName: '路網網格',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            layoutVhDrawFineGrid: null,
            layoutVhDrawFineGridTurnRbMidDots: false,
            csvFileName_traffic: 'taipei_city/mrt_link_volume_undirected.csv',
            layoutVhDrawTrafficData: null,
            layoutVhDrawShowTrafficWeights: true,
            layoutVhDrawTrafficMissing: [],
            layoutVhDrawBlackDotRowColRatioReport: null,
            layoutVhDrawShowBlackDotRowColRatioOverlay: false,
            layoutVhDrawShowWeightRowColRatioOverlay: false,
            layoutVhDrawAutoHideMidBlackDots: false,
            layoutVhDrawShowEndpointStationNames: false,
            layoutVhDrawShowMidBlackDotStationNames: false,
            layoutVhDrawWeightedNeighborHideMinPt: 5,
            upperViewTabs: ['space-layout-grid-viewer', 'layout-grid-viewer', 'json-viewer'],
          },
          {
            /** 路網網格_2（RMA）：與 layout_network_grid_from_vh_draw_rma 同檢視與資料源，純檢視複本（fisheye／最短路徑選取）。 */
            layerId: 'layout_network_grid_from_vh_draw_rma2',
            layerName: '路網網格_2',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            layoutVhDrawFineGrid: null,
            layoutVhDrawFineGridTurnRbMidDots: false,
            layoutVhDrawShowTrafficWeights: true,
            layoutVhDrawShowBlackDotRowColRatioOverlay: false,
            layoutVhDrawShowWeightRowColRatioOverlay: false,
            layoutVhDrawAutoHideMidBlackDots: false,
            layoutVhDrawShowEndpointStationNames: false,
            layoutVhDrawShowMidBlackDotStationNames: false,
            upperViewTabs: ['space-layout-grid-viewer', 'layout-grid-viewer', 'json-viewer'],
          },
        ],
      },
      {
        groupName: '空間網絡網格',
        groupLayers: [
          {
            /** 🗺️ Leaflet 自由畫線圖層（JOSM 式畫法）— 置於分頁最上方 */
            layerId: 'leaflet_josm_draw',
            layerName: '畫線',
            visible: false,
            isLoading: false,
            isLoaded: true,
            colorName: 'red',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: false,
            hideFromMap: true,
            display: true,
            /** 🏷️ 標記為 Leaflet 畫線圖層，SpaceNetworkGridTab 依此走 Leaflet 繪製分支 */
            isLeafletDrawLayer: true,
            /** ✏️ 已完成的線段：[{ color, latlngs: [[lat, lng], ...] }, ...]（持久化，切換分頁後保留） */
            leafletDrawLines: [],
            /** ⚫ 手動繪製的一般黑點：[[lat, lng], ...] */
            leafletDrawBlackDots: [],
            upperViewTabs: ['space-network-grid'],
          },
          {
            layerId: 'osm_2_geojson_2_json',
            layerName: 'OSM／GeoJSON → JSON',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'blue',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: loadOsmXmlAsGeoJsonForRoutes,
            processToDrawData: null,
            geojsonFileName: null,
            /** 對應 `public/taipei/taipei.osm`，供 Control「自動讀入」 */
            publicBundledTaipeiOsmPath: 'taipei/taipei.osm',
            /** 僅經 Control 本機選 .osm／.geojson 載入後才有資料；無 osmFileName 時開圖層不請求伺服器（geojsonLoader 為空載入）。 */
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: false,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            upperViewTabs: ['map', 'osm-viewer', 'geojson-viewer', 'json-viewer'],
          },
          {
            layerId: 'json_grid_coord_normalized',
            layerName: '座標正規化',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'cyan',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            upperViewTabs: ['space-layout-grid-viewer', 'json-viewer'],
            /** 鄰線錯邊「修正」座標紀錄；不因 {@link resetJsonGridCoordNormalizedPipelineFields} 清空（另存於此）。 */
            jsonGridNeighborFixPersist: null,
            /** 與 {@link executeJsonGridCoordNormalize} 當次拓撲比對相同之 c3 路網（不可從現有 d3 反推，否則找不到錯邊） */
            jsonGridCoordNormalizeReferenceC3: null,
          },
          {
            /** 路網正交段往紅十字／示意中心縮進（佇序：列→欄）；dataJson 優先自「座標正規化」鏡像（見 mirrorFromCoordNormalizedLayer）；Control「往中心聚集」可下載路段匯出 JSON */
            layerId: 'orthogonal_toward_center_hv',
            layerName: '站點與路線往中心聚集（先橫後直）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            upperViewTabs: ['space-layout-grid-viewer', 'json-viewer'],
          },
          {
            /** 紅／藍 connect 拉直：自 orthogonal_toward_center_hv 鏡像路網副本；Control 三鍵（單點／自動／一鍵完成）移動 connect 端點，移 1 格使水平／垂直路線變多（HV 邊數嚴格增加） */
            layerId: 'connect_straighten_hv',
            layerName: '紅藍 connect 拉直（先橫後直）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            /** 最近一次 connect 移動：舊格／新格（供示意圖雙圈預覽） */
            connectStraightenMovePreview: null,
            /** 使用者已匯入本機 JSON：之後開啟不再自動鏡像上游 hv */
            connectStraightenUserJsonOverride: false,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            upperViewTabs: ['space-layout-grid-viewer', 'json-viewer'],
          },
          {
            /** 與前一層同演算法；控制台「朝十字縮進」隊列順序為欄（x）整表→列（y）整表；Control「往中心聚集」可下載路段匯出 JSON */
            layerId: 'orthogonal_toward_center_vh',
            layerName: '站點與路線往中心聚集（先直後橫）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            upperViewTabs: ['space-layout-grid-viewer', 'json-viewer'],
          },
          {
            /** 預設鏡像「先直後橫」層；可於 Control 本機選 JSON 覆寫，見 vhDrawUserJsonOverride；執行結果之 OSM 存於 dataOSM（並維護 dataJson／geojson 供繪製） */
            layerId: 'orthogonal_toward_center_vh_draw',
            layerName: '站點與路線（先直後橫）·dataJson 繪製',
            visible: false,
            isLoading: false,
            isLoaded: false,
            /** 為 true 時不自動鏡像 VH／不因 VH 更新覆寫（使用者已選檔讀入） */
            vhDrawUserJsonOverride: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            upperViewTabs: ['space-layout-grid-viewer', 'json-viewer'],
          },
          {
            /** 示意圖佈局 #1：Li & Dong (2010) stroke-based 示意圖方法（octilinear，8 方向）。讀入 osm_2_geojson_2_json，按執行排成示意圖。 */
            layerId: 'schematic_stroke',
            layerName: '① 示意圖佈局（Stroke-based）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeStroke,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #2：Stott & Rodgers (2011) Hill Climbing 多準則最佳化。 */
            layerId: 'schematic_hillclimb',
            layerName: '② 示意圖佈局（Hill Climbing）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'deeppurple',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeHillClimb,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖佈局 #3：Nöllenburg & Wolff (2011) MILP（rectilinear，HiGHS 求解）。 */
            layerId: 'schematic_milp',
            layerName: '③ 示意圖佈局（MILP）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeMilp,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** MILP結果正規化：讀 ③ MILP 結果（或載入下載的 MILP JSON 檔）並做座標正規化（b3→c3→d3）。 */
            layerId: 'schematic_milp_read',
            layerName: 'MILP結果正規化',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeReadMilpResult,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖管線：站點與路線往中心聚集（先橫後直）。自「MILP結果正規化」抓資料，演算法與 OSM 版完全相同。 */
            layerId: 'schematic_toward_center_hv',
            layerName: '站點與路線往中心聚集（先橫後直）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** 示意圖管線：站點與路線往中心聚集（先直後橫）。自「先橫後直」抓資料，演算法與 OSM 版完全相同。 */
            layerId: 'schematic_toward_center_vh',
            layerName: '站點與路線往中心聚集（先直後橫）',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
          {
            /** connect 拉直：自「先直後橫」移入結果，於此做紅/藍 connect 拉直（一鍵＋逐點除錯）。 */
            layerId: 'schematic_milp_straighten',
            layerName: 'connect 拉直',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'pink',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: executeMilpStraightenSeed,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            connectStraightenHighlightCell: null,
            connectStraightenMovePreview: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            upperViewTabs: [
              'space-layout-grid-viewer',
              'space-network-grid-json-data',
              'dashboard',
            ],
          },
        ],
      },
      {
        groupName: '版面網絡網格',
        groupLayers: [
          {
            /** 檢視用：與 `layout_network_grid_from_vh_draw` 同行為與 UI；獨立 Pinia 狀態（鏡像邏輯於 mirror 模組內複製實作） */
            layerId: 'layout_network_grid_from_vh_draw_copy',
            layerName: '路網網格',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            layoutVhDrawFineGrid: null,
            /** 細格中段黑點：轉折吸附＋紅／藍錨區間像素弧長均分（僅在已套用細格時有效） */
            layoutVhDrawFineGridTurnRbMidDots: false,
            /** public/data 底下之相對路徑（須配合 vue.config.js publicPath／process.env.BASE_URL） */
            csvFileName_traffic: 'taipei_city/mrt_link_volume_undirected.csv',
            /** 交通流量 CSV 資料，載入後為 Array<{a,b,weight}> */
            layoutVhDrawTrafficData: null,
            /** 是否在地圖上顯示交通 weight 標籤（相鄰紅／藍／黑點中點） */
            layoutVhDrawShowTrafficWeights: true,
            /** 交通流量 CSV 載入後，找不到相鄰紅／藍／黑點者列於此 */
            layoutVhDrawTrafficMissing: [],
            /** 「計算欄／列黑點 max 比例」結果：各欄、各列分別 Σ 歸一 */
            layoutVhDrawBlackDotRowColRatioReport: null,
            /** Upper「layout-grid」檢視專用：顯示欄／列 black-dot Σ 歸一比例條（pt 區間，與藍字同源） */
            layoutVhDrawShowBlackDotRowColRatioOverlay: false,
            /** Upper「layout-grid」檢視專用：以「線 weight max」Σ 歸一決定欄寬／列高（與黑點數比例擇一） */
            layoutVhDrawShowWeightRowColRatioOverlay: false,
            /** 開啟才執行「依 weight_差值 由小到大暫隱中段黑點直到鄰線間距達標」之自動隱藏迴圈 */
            layoutVhDrawAutoHideMidBlackDots: false,
            /** 顯示紅／藍點（端點 intersection／terminal）車站名稱（小字） */
            layoutVhDrawShowEndpointStationNames: false,
            /** 顯示黑點（中段站）車站名稱（小字） */
            layoutVhDrawShowMidBlackDotStationNames: false,
            /**
             * 加權比例條下：鄰線寬／高皆須 ≥ 此值（pt）才停止依 weight_差值 暫隱中段黑點（控制台可調）。
             * 預設 5，與模組常數 LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT 一致。
             */
            layoutVhDrawWeightedNeighborHideMinPt: 5,
            upperViewTabs: ['space-layout-grid-viewer', 'layout-grid-viewer', 'json-viewer'],
          },
          {
            /** 檢視用：與 `layout_network_grid_from_vh_draw_copy` 同檢視與資料來源，但 Control 不提供載入 CSV／隨機 weight（純檢視複本，重用 _copy 之繪製／資料邏輯） */
            layerId: 'layout_network_grid_from_vh_draw_copy2',
            layerName: '路網網格_2',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'teal',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            spaceNetworkGridJsonData_SectionData: null,
            spaceNetworkGridJsonData_ConnectData: null,
            spaceNetworkGridJsonData_StationData: null,
            showStationPlacement: true,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: null,
            geojsonLoader: null,
            processToDrawData: null,
            geojsonFileName: null,
            osmFileName: null,
            jsonFileName: null,
            executeFunction: null,
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            highlightedSegmentIndex: null,
            jsonGridFromCoordSuggestTargetGrid: null,
            squareGridCellsTaipeiTest3: false,
            dataOSM: null,
            dataGeojson: null,
            dataJson: null,
            layoutUniformGridGeoJson: null,
            layoutUniformGridMeta: null,
            layoutVhDrawFineGrid: null,
            layoutVhDrawFineGridTurnRbMidDots: false,
            csvFileName_traffic: 'taipei_city/mrt_link_volume_undirected.csv',
            layoutVhDrawTrafficData: null,
            layoutVhDrawShowTrafficWeights: true,
            layoutVhDrawTrafficMissing: [],
            layoutVhDrawBlackDotRowColRatioReport: null,
            layoutVhDrawShowBlackDotRowColRatioOverlay: false,
            layoutVhDrawShowWeightRowColRatioOverlay: false,
            layoutVhDrawAutoHideMidBlackDots: false,
            layoutVhDrawShowEndpointStationNames: false,
            layoutVhDrawShowMidBlackDotStationNames: false,
            layoutVhDrawWeightedNeighborHideMinPt: 5,
            /** 路網網格_2：layout-grid 滑鼠放大鏡（fisheye）開關，開啟才執行變形 */
            layoutVhDrawFisheyeEnabled: false,
            /** 路網網格_2：最短路徑選取模式開關，開啟後點紅/藍點選兩站算最少站路線並放大沿線 */
            layoutVhDrawPathSelectMode: false,
            upperViewTabs: ['space-layout-grid-viewer', 'layout-grid-viewer', 'json-viewer'],
          },
        ],
      },
      {
        groupName: '測試圖層',
        groupLayers: [
          {
            layerId: 'test_layer',
            layerName: '網格示意圖測試',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'green',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: loadGridSchematicJson,
            geojsonLoader: null,
            processToDrawData: processGridToDrawData,
            jsonFileName: 'test/test.json',
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            isGridSchematic: true, // 標記為網格示意圖類型
            upperViewTabs: [
              'grid-scaling',
              'dashboard',
              'processed-json-data',
              'json-data',
              'draw-json-data',
            ],
          },
        ],
      },
      {
        groupName: '數據圖層',
        groupLayers: [
          {
            layerId: 'taipei_metro',
            layerName: 'Taipei Metro',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'orange',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: loadDataLayerJson,
            geojsonLoader: loadGeoJsonForRoutes,
            processToDrawData: processMetroToDrawData,
            geojsonFileName: 'taipei/01_osm2geojson_taipei.geojson',
            jsonFileName: 'taipei/taipei_schematic.json',
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            upperViewTabs: [
              'd3js',
              'dashboard',
              'processed-json-data',
              'json-data',
              'draw-json-data',
            ],
          },
          {
            layerId: 'taipei_metro_2',
            layerName: 'Taipei Metro 2',
            visible: false,
            isLoading: false,
            isLoaded: false,
            colorName: 'orange',
            jsonData: null,
            spaceNetworkGridJsonData: null,
            layoutGridJsonData: null,
            layoutGridJsonData_Test: null,
            layoutGridJsonData_Test2: null,
            layoutGridJsonData_Test3: null,
            layoutGridJsonData_Test4: null,
            geojsonData: null,
            processedJsonData: null,
            drawJsonData: null,
            dashboardData: null,
            dataTableData: null,
            layerInfoData: null,
            jsonLoader: loadDataLayerJson,
            geojsonLoader: loadGeoJsonForRoutes,
            processToDrawData: processMetroToDrawData,
            geojsonFileName: 'taipei_city/01_osm2geojson_taipei_city.geojson',
            jsonFileName: 'taipei_city/taipei_schematic.json',
            isDataLayer: true,
            hideFromMap: true,
            display: true,
            upperViewTabs: [
              'd3js',
              'dashboard',
              'processed-json-data',
              'json-data',
              'draw-json-data',
            ],
          },
        ],
      },
    ]);

    /**
     * 💾 保存圖層狀態 (Save Layer State)
     *
     * 將圖層的狀態信息保存到 layerStates 響應式對象中。這個函數用於
     * 更新圖層的各種狀態，包括可見性、載入狀態、數據內容等。
     *
     * 🎯 主要功能 (Main Features):
     * - 狀態更新：更新指定圖層的狀態信息
     * - 自動初始化：如果圖層狀態不存在，會自動創建
     * - 合併更新：使用 Object.assign 合併新的狀態數據
     * - 響應式更新：觸發 Vue 的響應式更新機制
     *
     * 🔧 技術實現 (Technical Implementation):
     * - 檢查圖層狀態是否存在，不存在則創建空對象
     * - 使用 Object.assign 合併新的狀態數據
     * - 觸發響應式更新，通知相關組件重新渲染
     *
     * 🚀 使用範例 (Usage Examples):
     * ```javascript
     * // 更新圖層可見性
     * saveLayerState('taipei_metro', { visible: true });
     *
     * // 更新圖層載入狀態
     * saveLayerState('taipei_metro', { isLoading: true });
     *
     * // 更新圖層數據
     * saveLayerState('taipei_metro', {
     *   jsonData: data,
     *   dashboardData: summary,
     *   dataTableData: table,
     *   layerInfoData: info
     * });
     * ```
     *
     * @param {string} layerId - 圖層唯一識別碼
     * @param {Object} stateData - 要更新的狀態數據
     * @param {boolean} [stateData.visible] - 圖層可見性
     * @param {boolean} [stateData.isLoading] - 圖層載入狀態
     * @param {boolean} [stateData.isLoaded] - 圖層載入完成狀態
     * @param {Object} [stateData.jsonData] - 圖層原始 JSON 數據
     * @param {Object} [stateData.processedJsonData] - 圖層處理後 JSON 數據
     * @param {Object} [stateData.geojsonData] - 圖層的 GeoJSON 數據
     * @param {Object} [stateData.dashboardData] - 圖層儀表板數據
     * @param {Array} [stateData.dataTableData] - 圖層表格數據
     * @param {Object} [stateData.layerInfoData] - 圖層資訊數據
     *
     * @example
     * // 基本用法
     * saveLayerState('test_layer', { visible: true });
     *
     * @since 1.0.0
     */
    const saveLayerState = (layerId, stateData) => {
      if (!layerStates.value[layerId]) {
        layerStates.value[layerId] = {};
      }
      Object.assign(layerStates.value[layerId], stateData);
    };

    // ==================== 🔍 圖層搜尋函數 (Layer Search Functions) ====================

    /**
     * 🔍 根據 ID 搜尋圖層 (Find Layer by ID)
     *
     * 在靜態圖層配置中搜尋指定 ID 的圖層。這個函數會遍歷所有圖層群組，
     * 找到匹配的圖層並返回其配置對象。
     *
     * 🎯 主要功能 (Main Features):
     * - 圖層搜尋：根據 layerId 搜尋對應的圖層配置
     * - 深度搜尋：遍歷所有圖層群組和子圖層
     * - 精確匹配：使用嚴格相等比較確保精確匹配
     * - 安全返回：找不到時返回 null，避免錯誤
     *
     * 🔧 技術實現 (Technical Implementation):
     * - 使用雙重迴圈遍歷圖層群組和子圖層
     * - 使用嚴格相等比較（===）進行 ID 匹配
     * - 找到匹配圖層時立即返回，提高性能
     * - 遍歷完成後返回 null 表示未找到
     *
     * 🚀 使用範例 (Usage Examples):
     * ```javascript
     * // 搜尋圖層
     * const layer = findLayerById('taipei_metro');
     * if (layer) {
     *   console.log('找到圖層:', layer.layerName);
     * } else {
     *   console.log('圖層不存在');
     * }
     *
     * // 檢查圖層是否存在
     * if (findLayerById('test_layer')) {
     *   console.log('測試圖層存在');
     * }
     * ```
     *
     * 📊 搜尋範圍 (Search Scope):
     * - 測試圖層群組：包含網格示意圖測試等開發用圖層
     * - 數據圖層群組：包含台北捷運等實際數據圖層
     * - 未來可擴展：支援更多圖層群組
     *
     * ⚠️ 注意事項 (Important Notes):
     * - 搜尋是線性的，大型圖層列表可能影響性能
     * - 返回的圖層對象是引用，修改會影響原始配置
     * - 建議在組件中使用前檢查返回值是否為 null
     *
     * @param {string} layerId - 要搜尋的圖層 ID
     * @returns {Object|null} - 找到的圖層配置對象，未找到時返回 null
     *
     * @example
     * // 基本用法
     * const layer = findLayerById('taipei_metro');
     * if (layer) {
     *   console.log(layer.layerName);
     * }
     *
     * @since 1.0.0
     */
    const findLayerById = (layerId) => {
      for (const mainGroup of layers.value) {
        for (const layer of mainGroup.groupLayers) {
          if (layer.layerId === layerId) {
            return layer;
          }
        }
      }
      return null;
    };

    /**
     * 📋 獲取所有圖層 (Get All Layers)
     *
     * 從靜態圖層配置中提取所有圖層的扁平陣列。這個函數會遍歷所有圖層群組，
     * 將所有子圖層合併成一個一維陣列，便於進行批量操作和搜尋。
     *
     * 🎯 主要功能 (Main Features):
     * - 扁平化提取：將嵌套的圖層群組結構扁平化為一維陣列
     * - 完整覆蓋：包含所有圖層群組中的所有子圖層
     * - 保持引用：返回的圖層對象保持對原始配置的引用
     * - 高效操作：提供便於批量操作的數據結構
     *
     * 🔧 技術實現 (Technical Implementation):
     * - 使用 for...of 迴圈遍歷圖層群組
     * - 使用展開運算符（...）合併子圖層陣列
     * - 保持原始圖層對象的引用，不進行深拷貝
     * - 返回新的陣列，避免修改原始配置
     *
     * 🚀 使用範例 (Usage Examples):
     * ```javascript
     * // 獲取所有圖層
     * const allLayers = getAllLayers();
     * console.log('總圖層數量:', allLayers.length);
     *
     * // 篩選可見圖層
     * const visibleLayers = allLayers.filter(layer => layer.visible);
     *
     * // 篩選載入中的圖層
     * const loadingLayers = allLayers.filter(layer => layer.isLoading);
     *
     * // 搜尋特定類型的圖層
     * const gridLayers = allLayers.filter(layer => layer.isGridSchematic);
     * ```
     *
     * 📊 返回數據結構 (Return Data Structure):
     * ```javascript
     * [
     *   {
     *     layerId: string,        // 圖層唯一識別碼
     *     layerName: string,      // 圖層顯示名稱
     *     visible: boolean,       // 圖層可見性
     *     isLoading: boolean,     // 圖層載入狀態
     *     isLoaded: boolean,      // 圖層載入完成狀態
     *     type: string,           // 圖層類型
     *     colorName: string,      // 圖層顏色名稱
     *     jsonData: Object,       // 圖層原始 JSON 數據
     *     processedJsonData: Object, // 圖層處理後 JSON 數據
     *     dashboardData: Object,    // 圖層儀表板數據
     *     dataTableData: Array,       // 圖層表格數據
     *     layerInfoData: Object,      // 圖層資訊數據
     *     jsonLoader: Function,   // 圖層數據載入函數
     *     jsonFileName: string,   // 圖層 JSON 文件名稱
     *     isDataLayer: boolean,   // 是否為數據圖層
     *     hideFromMap: boolean,   // 是否從地圖隱藏
     *     display: boolean,       // 是否顯示
     *     isGridSchematic: boolean // 是否為網格示意圖
     *   }
     * ]
     * ```
     *
     * 🔄 使用場景 (Use Cases):
     * - 批量操作：對所有圖層執行相同的操作
     * - 統計計算：計算圖層的統計信息
     * - 篩選搜尋：根據條件篩選特定圖層
     * - 狀態檢查：檢查圖層的整體狀態
     *
     * ⚠️ 注意事項 (Important Notes):
     * - 返回的陣列是動態的，會反映圖層配置的變化
     * - 圖層對象是引用，修改會影響原始配置
     * - 建議在需要時才調用，避免不必要的性能開銷
     *
     * @returns {Array} - 包含所有圖層的扁平陣列
     *
     * @example
     * // 基本用法
     * const allLayers = getAllLayers();
     * console.log('圖層數量:', allLayers.length);
     *
     * @since 1.0.0
     */
    const getAllLayers = () => {
      const allLayers = [];
      for (const mainGroup of layers.value) {
        allLayers.push(...mainGroup.groupLayers);
      }
      return allLayers;
    };

    /** OSM 管線父圖層資料更新後，鏡像至座標正規化圖層 — 實作見 json_grid_coord_normalized／mirrorFromOsm2Layer.js */
    const syncOsm2DataJsonMirrorFromParent = () => {
      syncOsm2DataJsonMirrorFromParentImpl(findLayerById, saveLayerState);
    };

    // ==================== 🔄 主要圖層處理函數 (Main Layer Processing Functions) ====================

    /**
     * 🔄 切換圖層可見性 (Toggle Layer Visibility)
     *
     * 控制圖層的顯示/隱藏狀態，並在需要時自動載入數據。這是圖層管理的核心函數，
     * 負責處理圖層的開啟、關閉、數據載入等操作，確保圖層狀態的一致性和數據的及時載入。
     *
     * 🎯 主要功能 (Main Features):
     * - 可見性切換：切換圖層的顯示/隱藏狀態
     * - 自動載入：當圖層開啟且未載入時自動載入數據
     * - 狀態管理：更新圖層的各種狀態信息
     * - 錯誤處理：處理載入過程中的錯誤和異常
     * - 日誌記錄：提供詳細的操作日誌和調試信息
     *
     * 🔧 技術實現 (Technical Implementation):
     * - 異步操作：使用 async/await 處理數據載入
     * - 狀態檢查：檢查圖層的載入狀態和可見性
     * - 條件載入：只在需要時才載入數據，避免重複載入
     * - 錯誤恢復：載入失敗時恢復圖層狀態
     * - 狀態同步：確保所有相關狀態的一致性
     *
     * 🔄 操作流程 (Operation Flow):
     * 1. 搜尋圖層：根據 layerId 找到對應的圖層配置
     * 2. 狀態檢查：檢查圖層的當前狀態和載入條件
     * 3. 可見性切換：切換圖層的可見性狀態
     * 4. 條件載入：如果圖層開啟且未載入，則載入數據
     * 5. 狀態更新：更新圖層的載入狀態和數據內容
     * 6. 錯誤處理：處理載入過程中的錯誤和異常
     *
     * 🚀 使用範例 (Usage Examples):
     * ```javascript
     * // 開啟圖層
     * await toggleLayerVisibility('taipei_metro');
     *
     * // 關閉圖層
     * await toggleLayerVisibility('taipei_metro');
     *
     * // 在組件中使用
     * const handleLayerToggle = async (layerId) => {
     *   try {
     *     await toggleLayerVisibility(layerId);
     *     console.log('圖層切換成功');
     *   } catch (error) {
     *     console.error('圖層切換失敗:', error);
     *   }
     * };
     * ```
     *
     * 📊 載入條件 (Loading Conditions):
     * - 圖層必須存在且可訪問
     * - 圖層必須被開啟（visible: true）
     * - 圖層尚未載入（isLoaded: false）
     * - 圖層不在載入中（isLoading: false）
     *
     * ⚠️ 錯誤處理 (Error Handling):
     * - 圖層不存在：記錄錯誤並返回
     * - 載入失敗：恢復圖層狀態並記錄錯誤
     * - 網路錯誤：提供詳細的錯誤信息
     * - 數據格式錯誤：記錄錯誤並繼續執行
     *
     * 🔍 調試信息 (Debug Information):
     * - 圖層搜尋結果：記錄找到的圖層信息
     * - 載入條件檢查：記錄載入條件的評估結果
     * - 載入過程：記錄載入的開始、進度和完成
     * - 錯誤信息：記錄載入過程中的錯誤和異常
     *
     * @param {string} layerId - 要切換的圖層 ID
     * @returns {Promise<void>} - 異步操作，無返回值
     * @throws {Error} - 當圖層不存在或載入失敗時拋出錯誤
     *
     * @example
     * // 基本用法
     * await toggleLayerVisibility('test_layer');
     *
     * @since 1.0.0
     * @see {@link findLayerById} 圖層搜尋函數
     * @see {@link saveLayerState} 圖層狀態保存函數
     */
    const findGroupNameByLayerId = (id) => {
      for (const mainGroup of layers.value) {
        for (const lyr of mainGroup.groupLayers) {
          if (lyr.layerId === id) {
            return mainGroup.groupName;
          }
        }
      }
      return null;
    };

    const toggleLayerVisibility = async (layerId) => {
      const layer = findLayerById(layerId);
      if (!layer) {
        console.error(`❌ DataStore: Layer with id "${layerId}" not found.`);
        return;
      }

      // 切換可見性狀態
      layer.visible = !layer.visible;

      // 保存圖層的可見性狀態
      saveLayerState(layerId, { visible: layer.visible });

      if (layer.visible && layer.layerId === 'json_grid_coord_normalized') {
        mirrorResetAndPersistJsonGridCoordNormalized(findLayerById, saveLayerState, layer);
      }

      // connect_straighten_hv：打開即顯示上游「往中心聚集（先橫後直）」結果（本層尚無資料時鏡像一份）
      if (layer.visible && layer.layerId === 'connect_straighten_hv') {
        seedConnectStraightenHvFromUpstreamIfEmpty(findLayerById, saveLayerState, layer);
      }

      // 路網網格（RMA）：打開即自 RMA「先直後橫」(schematic_rma_toward_center_vh) 重建路網（來源變更時重抓）
      if (layer.visible && isRmaLayoutNetworkGridFromVhDrawLayerId(layer.layerId)) {
        refreshRmaLayoutNetworkGridFromVhIfVisible(findLayerById, saveLayerState, layer.layerId);
      }

      if (layer.visible && isCoordNormalizedDataJsonMirrorFollowonLayerId(layer.layerId)) {
        if (
          layer.layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID &&
          layer.vhDrawUserJsonOverride
        ) {
          layer.isLoaded = true;
          saveLayerState(layer.layerId, { isLoaded: true });
        } else {
          mirrorResetAndPersistJsonGridFromCoordNormalized(findLayerById, saveLayerState, layer);
        }
      }

      // 🩹 修正：taipei_6_1_test2 的 dataTableData 欄位 schema 曾變更（改為 0-based，且由三連改為兩連，再改為單列/單行）
      // 若 Pinia persist 還留著舊資料（會出現 idx/idx1/idx2=203 之類的不存在座標，或舊的 pair/triplet schema），強制標記為未載入以觸發重新載入
      if (
        layer.visible &&
        layer.layerId === 'taipei_6_1_test2' &&
        Array.isArray(layer.dataTableData)
      ) {
        const hasStaleHugeIdx = layer.dataTableData.some((r) => {
          const v = r?.idx;
          const v1 = r?.idx1;
          const v2 = r?.idx2;
          return (
            (typeof v === 'number' && Number.isFinite(v) && v > 150) ||
            (typeof v1 === 'number' && Number.isFinite(v1) && v1 > 150) ||
            (typeof v2 === 'number' && Number.isFinite(v2) && v2 > 150)
          );
        });
        // 檢查是否為舊的 pair/triplet schema（有 idx1/idx2 但沒有 idx，或同時有 idx 和 idx1/idx2）
        const hasOldPairOrTripletSchema = layer.dataTableData.some(
          (r) =>
            r &&
            (Object.prototype.hasOwnProperty.call(r, 'idx1') ||
              Object.prototype.hasOwnProperty.call(r, 'idx2') ||
              Object.prototype.hasOwnProperty.call(r, 'idx1_max_weight') ||
              Object.prototype.hasOwnProperty.call(r, 'idx2_max_weight'))
        );
        // 檢查是否為新的 single schema（應該只有 idx，不應該有 idx1/idx2）
        const hasNewSingleSchema = layer.dataTableData.some(
          (r) =>
            r &&
            Object.prototype.hasOwnProperty.call(r, 'idx') &&
            !Object.prototype.hasOwnProperty.call(r, 'idx1') &&
            !Object.prototype.hasOwnProperty.call(r, 'idx2')
        );
        // 如果沒有新 schema 或還有舊 schema，強制重新載入
        if (hasStaleHugeIdx || hasOldPairOrTripletSchema || !hasNewSingleSchema) {
          layer.isLoaded = false;
        }
      }

      // 如果圖層被開啟且尚未載入，則載入資料
      // 需要載入數據的情況：必須有 jsonLoader 或 geojsonLoader
      const shouldLoad =
        layer.visible &&
        !layer.isLoaded &&
        !layer.isLoading &&
        (layer.jsonLoader || layer.geojsonLoader);

      if (shouldLoad) {
        try {
          layer.isLoading = true;
          saveLayerState(layerId, { isLoading: layer.isLoading });

          let result;

          // 優先使用 jsonLoader，然後是 geojsonLoader
          // 所有數據載入都必須通過 jsonLoader 或 geojsonLoader，不允許直接調用載入函數
          if (layer.jsonLoader) {
            result = await layer.jsonLoader(layer);
          } else if (layer.geojsonLoader) {
            // 如果有 geojsonLoader，使用它載入 GeoJSON 數據
            result = await layer.geojsonLoader(layer);
          } else {
            throw new Error('圖層沒有有效的數據載入器（必須設置 jsonLoader 或 geojsonLoader）');
          }

          // 更新圖層資料
          // jsonData：保留給一般 JSON 載入/舊流程
          layer.jsonData = result.jsonData;
          layer._taipeiFListedGraySnapshotDone = false;
          layer._taipeiFListedGrayStationKeySet = undefined;
          layer._taipeiFListedGrayRouteCellKeySet = undefined;
          // spaceNetworkGridJsonData：空間網絡網格專用資料欄位（execute_* 產物會寫入這裡）
          layer.spaceNetworkGridJsonData =
            result.spaceNetworkGridJsonData ?? layer.spaceNetworkGridJsonData;
          // spaceNetworkGridJsonData_SectionData：路段連線資料
          layer.spaceNetworkGridJsonData_SectionData =
            result.spaceNetworkGridJsonData_SectionData ??
            layer.spaceNetworkGridJsonData_SectionData;
          // spaceNetworkGridJsonData_ConnectData：交叉點資料（每筆交叉點所有屬性 + 所連結的路線 list）
          layer.spaceNetworkGridJsonData_ConnectData =
            result.spaceNetworkGridJsonData_ConnectData ??
            layer.spaceNetworkGridJsonData_ConnectData;
          // spaceNetworkGridJsonData_StationData：車站資料（供車站配置功能使用）
          layer.spaceNetworkGridJsonData_StationData =
            result.spaceNetworkGridJsonData_StationData ??
            layer.spaceNetworkGridJsonData_StationData;
          // taipei_k3 專用分頁：與主 space-network-grid 欄位分離之深度複製資料
          layer.spaceNetworkGridJsonDataK3Tab =
            result.spaceNetworkGridJsonDataK3Tab ?? layer.spaceNetworkGridJsonDataK3Tab;
          layer.spaceNetworkGridJsonDataK3Tab_SectionData =
            result.spaceNetworkGridJsonDataK3Tab_SectionData ??
            layer.spaceNetworkGridJsonDataK3Tab_SectionData;
          layer.spaceNetworkGridJsonDataK3Tab_ConnectData =
            result.spaceNetworkGridJsonDataK3Tab_ConnectData ??
            layer.spaceNetworkGridJsonDataK3Tab_ConnectData;
          layer.spaceNetworkGridJsonDataK3Tab_StationData =
            result.spaceNetworkGridJsonDataK3Tab_StationData ??
            layer.spaceNetworkGridJsonDataK3Tab_StationData;
          // taipei_l3 專用分頁：程式／欄位與 k3 完全分離（不共用 K3Tab 鍵）
          layer.spaceNetworkGridJsonDataL3Tab =
            result.spaceNetworkGridJsonDataL3Tab ?? layer.spaceNetworkGridJsonDataL3Tab;
          layer.spaceNetworkGridJsonDataL3Tab_SectionData =
            result.spaceNetworkGridJsonDataL3Tab_SectionData ??
            layer.spaceNetworkGridJsonDataL3Tab_SectionData;
          layer.spaceNetworkGridJsonDataL3Tab_ConnectData =
            result.spaceNetworkGridJsonDataL3Tab_ConnectData ??
            layer.spaceNetworkGridJsonDataL3Tab_ConnectData;
          layer.spaceNetworkGridJsonDataL3Tab_StationData =
            result.spaceNetworkGridJsonDataL3Tab_StationData ??
            layer.spaceNetworkGridJsonDataL3Tab_StationData;
          // taipei_m3 專用分頁：與 l3 分離之 M3Tab 鍵
          layer.spaceNetworkGridJsonDataM3Tab =
            result.spaceNetworkGridJsonDataM3Tab ?? layer.spaceNetworkGridJsonDataM3Tab;
          layer.spaceNetworkGridJsonDataM3Tab_SectionData =
            result.spaceNetworkGridJsonDataM3Tab_SectionData ??
            layer.spaceNetworkGridJsonDataM3Tab_SectionData;
          layer.spaceNetworkGridJsonDataM3Tab_ConnectData =
            result.spaceNetworkGridJsonDataM3Tab_ConnectData ??
            layer.spaceNetworkGridJsonDataM3Tab_ConnectData;
          layer.spaceNetworkGridJsonDataM3Tab_StationData =
            result.spaceNetworkGridJsonDataM3Tab_StationData ??
            layer.spaceNetworkGridJsonDataM3Tab_StationData;
          if (typeof result.showStationPlacement === 'boolean') {
            layer.showStationPlacement = result.showStationPlacement;
          }
          ensureTaipeiFListedGrayHighlightSnapshot(layer);
          // layoutGridJsonData：版面網格專用資料欄位
          layer.layoutGridJsonData = result.layoutGridJsonData ?? layer.layoutGridJsonData;
          // layoutGridJsonData_Test：版面網格測試專用資料欄位
          layer.layoutGridJsonData_Test =
            result.layoutGridJsonData_Test ?? layer.layoutGridJsonData_Test;
          // layoutGridJsonData_Test2：與 layout-network-grid 測試分頁對應之資料欄位
          layer.layoutGridJsonData_Test2 =
            result.layoutGridJsonData_Test2 ?? layer.layoutGridJsonData_Test2;
          // layoutGridJsonData_Test3：版面網格測試3專用資料欄位
          layer.layoutGridJsonData_Test3 =
            result.layoutGridJsonData_Test3 ?? layer.layoutGridJsonData_Test3;
          // layoutGridJsonData_Test4：版面網格測試4專用資料欄位
          layer.layoutGridJsonData_Test4 =
            result.layoutGridJsonData_Test4 ?? layer.layoutGridJsonData_Test4;
          layer.processedJsonData = result.processedJsonData;
          layer.processedJsonDataK3Tab =
            result.processedJsonDataK3Tab ?? layer.processedJsonDataK3Tab;
          layer.processedJsonDataL3Tab =
            result.processedJsonDataL3Tab ?? layer.processedJsonDataL3Tab;
          layer.processedJsonDataM3Tab =
            result.processedJsonDataM3Tab ?? layer.processedJsonDataM3Tab;
          layer.geojsonData = result.geojsonData || null; // 如果有 geojsonData，則保存
          layer.dataTableData = result.dataTableData;
          if (
            (layer.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
              layer.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2) &&
            Array.isArray(layer.dataTableData)
          ) {
            sortLayoutVhDrawCopyBlackDotDataTableRowsByWeightDiffAsc(layer.dataTableData);
          }
          layer.dashboardData = result.dashboardData;
          layer.layerInfoData = result.layerInfoData;
          /** 本機載入之 OSM 原文保留於 session，供未帶 sourceOsmXmlText 之載入路徑沿用 */
          if (
            layer.layerId === OSM_2_GEOJSON_2_JSON_LAYER_ID &&
            typeof result.sourceOsmXmlText === 'string' &&
            result.sourceOsmXmlText.length > 0
          ) {
            setOsm2GeojsonSessionOsmXml(result.sourceOsmXmlText);
          }
          if (Object.prototype.hasOwnProperty.call(result, 'trafficData')) {
            layer.trafficData = result.trafficData;
          }

          // 生成繪製數據
          if (layer.processToDrawData && layer.processedJsonData) {
            layer.drawJsonData = layer.processToDrawData(layer.processedJsonData);
          }

          if (layer.layerId === OSM_2_GEOJSON_2_JSON_LAYER_ID) {
            assignOsm2LayerViewerFields(layer, {
              sourceOsmXmlText:
                typeof result.sourceOsmXmlText === 'string' ? result.sourceOsmXmlText : '',
            });
            syncOsm2DataJsonMirrorFromParent();
          }

          layer.isLoaded = true;

          // 保存完整的圖層狀態
          saveLayerState(layerId, {
            isLoaded: layer.isLoaded,
            jsonData: layer.jsonData,
            spaceNetworkGridJsonData: layer.spaceNetworkGridJsonData,
            spaceNetworkGridJsonData_SectionData: layer.spaceNetworkGridJsonData_SectionData,
            spaceNetworkGridJsonData_ConnectData: layer.spaceNetworkGridJsonData_ConnectData,
            spaceNetworkGridJsonData_StationData: layer.spaceNetworkGridJsonData_StationData,
            spaceNetworkGridJsonDataK3Tab: layer.spaceNetworkGridJsonDataK3Tab,
            spaceNetworkGridJsonDataK3Tab_SectionData:
              layer.spaceNetworkGridJsonDataK3Tab_SectionData,
            spaceNetworkGridJsonDataK3Tab_ConnectData:
              layer.spaceNetworkGridJsonDataK3Tab_ConnectData,
            spaceNetworkGridJsonDataK3Tab_StationData:
              layer.spaceNetworkGridJsonDataK3Tab_StationData,
            processedJsonDataK3Tab: layer.processedJsonDataK3Tab,
            spaceNetworkGridJsonDataL3Tab: layer.spaceNetworkGridJsonDataL3Tab,
            spaceNetworkGridJsonDataL3Tab_SectionData:
              layer.spaceNetworkGridJsonDataL3Tab_SectionData,
            spaceNetworkGridJsonDataL3Tab_ConnectData:
              layer.spaceNetworkGridJsonDataL3Tab_ConnectData,
            spaceNetworkGridJsonDataL3Tab_StationData:
              layer.spaceNetworkGridJsonDataL3Tab_StationData,
            processedJsonDataL3Tab: layer.processedJsonDataL3Tab,
            spaceNetworkGridJsonDataM3Tab: layer.spaceNetworkGridJsonDataM3Tab,
            spaceNetworkGridJsonDataM3Tab_SectionData:
              layer.spaceNetworkGridJsonDataM3Tab_SectionData,
            spaceNetworkGridJsonDataM3Tab_ConnectData:
              layer.spaceNetworkGridJsonDataM3Tab_ConnectData,
            spaceNetworkGridJsonDataM3Tab_StationData:
              layer.spaceNetworkGridJsonDataM3Tab_StationData,
            processedJsonDataM3Tab: layer.processedJsonDataM3Tab,
            layoutGridJsonData: layer.layoutGridJsonData,
            layoutGridJsonData_Test: layer.layoutGridJsonData_Test,
            layoutGridJsonData_Test2: layer.layoutGridJsonData_Test2,
            layoutGridJsonData_Test3: layer.layoutGridJsonData_Test3,
            layoutGridJsonData_Test4: layer.layoutGridJsonData_Test4,
            processedJsonData: layer.processedJsonData,
            geojsonData: layer.geojsonData,
            drawJsonData: layer.drawJsonData,
            dataTableData: layer.dataTableData,
            dashboardData: layer.dashboardData,
            layerInfoData: layer.layerInfoData,
            trafficData: layer.trafficData,
            dataOSM: layer.dataOSM,
            dataGeojson: layer.dataGeojson,
            dataJson: layer.dataJson,
          });
        } catch (error) {
          console.error(`❌ 載入圖層 "${layer.layerName}" 失敗:`, error);
          /** OSM／可空載入圖層：維持使用者已開啟之可見狀態，不因無檔／請求失敗而自動關閉 */
          if (layerId !== OSM_2_GEOJSON_2_JSON_LAYER_ID) {
            layer.visible = false;
            saveLayerState(layerId, { visible: false });
          }
        } finally {
          layer.isLoading = false;
          saveLayerState(layerId, { isLoading: false });
        }
      }
    };

    // ==================== 地圖物件管理 ====================

    // 選中的地圖物件
    const selectedFeature = ref(null);

    // ==================== D3jsTab 尺寸管理 ====================

    // D3jsTab 繪製範圍尺寸
    const d3jsDimensions = ref({
      width: 0,
      height: 0,
    });

    // 更新 D3jsTab 尺寸
    const updateD3jsDimensions = (width, height) => {
      d3jsDimensions.value = {
        width: Math.round(width),
        height: Math.round(height),
      };
    };

    // 更新當前圖層計算後的網格狀態（可見行列與單元尺寸）
    const updateComputedGridState = (layerId, state) => {
      if (!layerStates.value[layerId]) {
        layerStates.value[layerId] = {};
      }
      layerStates.value[layerId].computedGridState = {
        visibleX: state.visibleX,
        visibleY: state.visibleY,
        cellWidth: Math.round(state.cellWidth),
        cellHeight: Math.round(state.cellHeight),
        updatedAt: Date.now(),
      };
    };

    // LayoutGridTab_Test3 尺寸（以 pt 為單位）
    const layoutGridTabTest3Dimensions = ref({
      x: 0, // 寬度（pt）
      y: 0, // 高度（pt）
    });

    // 更新 LayoutGridTab_Test3 尺寸
    const updateLayoutGridTabTest3Dimensions = (x, y) => {
      layoutGridTabTest3Dimensions.value = {
        x: Math.round(x),
        y: Math.round(y),
      };
    };

    // LayoutGridTab_Test3 網格最小尺寸（以 pt 為單位）
    const layoutGridTabTest3MinCellDimensions = ref({
      minWidth: 0, // 最小寬度（pt）
      minHeight: 0, // 最小高度（pt）
    });

    // 更新 LayoutGridTab_Test3 網格最小尺寸
    const updateLayoutGridTabTest3MinCellDimensions = (minWidth, minHeight) => {
      layoutGridTabTest3MinCellDimensions.value = {
        minWidth: Math.round(minWidth),
        minHeight: Math.round(minHeight),
      };
    };

    // LayoutGridTab_Test4 當前尺寸（以 pt 為單位）
    const layoutGridTabTest4Dimensions = ref({
      x: 0, // 寬度（pt）
      y: 0, // 高度（pt）
    });

    // 更新 LayoutGridTab_Test4 尺寸
    const updateLayoutGridTabTest4Dimensions = (x, y) => {
      layoutGridTabTest4Dimensions.value = {
        x: Math.round(x),
        y: Math.round(y),
      };
    };

    // LayoutGridTab_Test4 網格最小尺寸（以 pt 為單位）
    const layoutGridTabTest4MinCellDimensions = ref({
      minWidth: 0, // 最小寬度（pt）
      minHeight: 0, // 最小高度（pt）
    });

    // ==================== LayoutGridTab_Test4 顯示控制（ControlTab 開關） ====================
    // 顯示權重（預設顯示；開啟才顯示 LayoutGridTab_Test4 的權重數字）
    const showWeightLabels = ref(true);
    const setShowWeightLabels = (value) => {
      showWeightLabels.value = !!value;
    };

    /**
     * 空間網路主分頁（space-network-grid）與 K3 分頁（space-network-grid-k3）共用：
     * 折線上 station_weights 數字是否繪製（預設顯示）。
     * space-network-grid-l3 為依版面動態欄列之網格預覽（單格 ≤50pt）、不使用此旗標。
     * taipei_f／g 另保留專區「顯示權重」(showWeightLabels) 控制格線示意層；此開關與之 AND。
     */
    const spaceNetworkGridShowRouteWeights = ref(true);
    const setSpaceNetworkGridShowRouteWeights = (value) => {
      spaceNetworkGridShowRouteWeights.value = !!value;
    };

    /**
     * 空間網路主分頁／K3／K4（非 taipei_f／g 示意格專用路徑）：是否將滑鼠網格座標寫入
     * layoutGridTabTest4MouseGridCoordinate，供 Control「空間網路圖」專區顯示。taipei_f／g 仍隨時同步（不受此開關影響）。
     */
    const spaceNetworkGridShowMouseGridCoordinate = ref(true);
    const setSpaceNetworkGridShowMouseGridCoordinate = (value) => {
      spaceNetworkGridShowMouseGridCoordinate.value = !!value;
    };

    /**
     * 操作分頁（ControlTab）目前選取之圖層；供 SpaceNetworkGridTab／K3／L3 與右側選擇對齊，
     * 避免地圖仍用「最新開啟圖層」而與 Control 不一致。
     */
    const controlActiveLayerId = ref(null);
    const setControlActiveLayerId = (layerId) => {
      controlActiveLayerId.value = layerId ?? null;
    };

    // 顯示粗細（預設固定 px；開啟則 d3.scaleLinear：權重 domain＝全圖 min～max，range 1px～10pt 等效；Test4 與 space-network-grid／K3）
    const showRouteThickness = ref(false);
    const setShowRouteThickness = (value) => {
      showRouteThickness.value = !!value;
    };

    /**
     * layout-network-grid（taipei_k4）：內繪區依 snap 欄／列 max 權重比例分配格寬／格高。
     * 關閉時均分內繪 px；開啟時以同一 remap 套用格線、路線與紅／藍 connect 點位。
     */
    const spaceNetworkK4WeightProportionalInnerGrid = ref(false);
    const setSpaceNetworkK4WeightProportionalInnerGrid = (value) => {
      spaceNetworkK4WeightProportionalInnerGrid.value = !!value;
    };

    /**
     * layout-network-grid（taipei_k4）比例格：分配用有效權重 ∝ max^n，預設 n=1（與 max 線性相同）。
     * 註：若僅將各帶 max 乘同一常數再正規化，相對比例不變，故以指數 n 調整強弱。
     */
    const spaceNetworkK4WeightProportionalScaleN = ref(1);
    const setSpaceNetworkK4WeightProportionalScaleN = (value) => {
      const x = Number(value);
      if (!Number.isFinite(x)) return;
      const clamped = Math.min(6, Math.max(0.25, x));
      spaceNetworkK4WeightProportionalScaleN.value = clamped;
    };

    /**
     * taipei_k4（a4～c6）：滑鼠所在 snap 欄／列內繪寬高依帶索引距離加權（所在帶 n 倍、相鄰帶 n-1…，最小 1）。
     * 與「依 max 比例分配」可併用。預設 n=5。
     */
    const spaceNetworkK4MouseBandFocusMagnifyEnabled = ref(false);
    const setSpaceNetworkK4MouseBandFocusMagnifyEnabled = (value) => {
      spaceNetworkK4MouseBandFocusMagnifyEnabled.value = !!value;
    };
    const spaceNetworkK4MouseBandFocusMagnifyN = ref(5);
    const setSpaceNetworkK4MouseBandFocusMagnifyN = (value) => {
      const x = Number(value);
      if (!Number.isFinite(x)) return;
      spaceNetworkK4MouseBandFocusMagnifyN.value = Math.max(1, Math.min(50, Math.round(x)));
    };

    // 權重放大（預設等寬等高；開啟才依權重比例改變網格長寬）
    const enableWeightScaling = ref(false);
    const setEnableWeightScaling = (value) => {
      enableWeightScaling.value = !!value;
    };

    // 顯示網格（預設開啟；開啟才顯示網格線）
    const showGrid = ref(true);
    const setShowGrid = (value) => {
      showGrid.value = !!value;
    };

    /**
     * taipei_g 空間網路：滑鼠縮放（焦點欄／列權重 5，沿軸每遠一格減 1，其餘為 1）。
     * 與「權重放大」互斥；開啟時會關閉權重放大。
     */
    const taipeiFSpaceNetworkMouseZoom = ref(false);

    /**
     * taipei_g 空間網路：權重放大（依權重比例分配欄寬／列高）。
     * 關閉時改為等寬等高，不計算權重比例長寬。
     */
    const taipeiFSpaceNetworkGridScaling = ref(true);
    const setTaipeiFSpaceNetworkGridScaling = (value) => {
      const on = !!value;
      taipeiFSpaceNetworkGridScaling.value = on;
      if (on) {
        taipeiFSpaceNetworkMouseZoom.value = false;
      }
    };

    const setTaipeiFSpaceNetworkMouseZoom = (value) => {
      const on = !!value;
      taipeiFSpaceNetworkMouseZoom.value = on;
      if (on) {
        taipeiFSpaceNetworkGridScaling.value = false;
      }
    };

    // 顯示站名（預設關閉）：taipei_f／g 專區與 Control「空間網路圖」之紅點／藍點 connect 站名共用；K3／K4 分頁同 ref
    const showStationNames = ref(false);
    const setShowStationNames = (value) => {
      showStationNames.value = !!value;
    };

    // 顯示黑點（沿線站）站名（預設關閉）；與紅／藍 connect 站名分開；K3／K4 與非 efinal 空間網路層同 ref
    const showBlackDotStationNames = ref(false);
    const setShowBlackDotStationNames = (value) => {
      showBlackDotStationNames.value = !!value;
    };

    // space-network-grid-json-data-k3：紅/藍/黑點近距重疊門檻（px，整數≥1）；JSON 座標 snap 到此倍數（k4 預設 10，與 taipeiK4SpaceNetworkPlotPx 後備一致）
    const k3JsonOverlapDistancePx = ref(10);
    const setK3JsonOverlapDistancePx = (value) => {
      const n = Math.round(Number(value));
      if (Number.isFinite(n) && n >= 1) {
        k3JsonOverlapDistancePx.value = Math.min(200, n);
      }
    };
    // Control（K3/K4）站點近距檢查：連續黑/紅/藍點最小距離門檻（px，整數≥1；預設 10）
    const k3JsonMinStationDistancePx = ref(10);
    const setK3JsonMinStationDistancePx = (value) => {
      const n = Math.round(Number(value));
      if (Number.isFinite(n) && n >= 1) {
        k3JsonMinStationDistancePx.value = Math.min(200, n);
      }
    };
    // 黑點合併門檻（相鄰兩段 |Δweight| <= N 觸發合併；預設 10）
    const taipeiK3MergeMaxWeightDiff = ref(10);
    const setTaipeiK3MergeMaxWeightDiff = (value) => {
      const n = Math.round(Number(value));
      if (Number.isFinite(n) && n >= 0) {
        taipeiK3MergeMaxWeightDiff.value = Math.min(100000, n);
      }
    };

    /** space-network-grid-json-data-k3 面板量測之視窗（供 Control 與主圖無尺寸時對齊繪區 px） */
    const k3JsonDataTabViewport = ref(null);
    const setK3JsonDataTabViewport = (width, height) => {
      const w = Math.round(Number(width));
      const h = Math.round(Number(height));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        k3JsonDataTabViewport.value = { width: w, height: h };
      }
    };
    // 當前執行的合併操作（用於在 ControlTab 中顯示）
    const currentMergeOperation4 = ref(null);

    // 更新 LayoutGridTab_Test4 網格最小尺寸
    const updateLayoutGridTabTest4MinCellDimensions = (minWidth, minHeight) => {
      layoutGridTabTest4MinCellDimensions.value = {
        minWidth: Math.round(minWidth),
        minHeight: Math.round(minHeight),
      };
    };

    // 設置當前執行的合併操作
    const setCurrentMergeOperation4 = (operation) => {
      currentMergeOperation4.value = operation;
    };

    // 清除當前執行的合併操作
    const clearCurrentMergeOperation4 = () => {
      currentMergeOperation4.value = null;
    };

    // 自動合併閾值（預設 5pt，當網格最小寬度或高度小於此值時觸發合併）
    const autoMergeThreshold = ref(5);
    const setAutoMergeThreshold = (value) => {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue > 0) {
        autoMergeThreshold.value = numValue;
      }
    };

    /** taipei_g 空間網路 resize：最小格寬低於此（pt）觸發水平向黑點自動合併 */
    const taipeiFResizeMinWidthPtThreshold = ref(10);
    const setTaipeiFResizeMinWidthPtThreshold = (value) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        taipeiFResizeMinWidthPtThreshold.value = Math.min(500, Math.max(0.5, n));
      }
    };

    /** taipei_g 空間網路 resize：最小格高低於此（pt）觸發垂直向黑點自動合併 */
    const taipeiFResizeMinHeightPtThreshold = ref(3);
    const setTaipeiFResizeMinHeightPtThreshold = (value) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        taipeiFResizeMinHeightPtThreshold.value = Math.min(500, Math.max(0.5, n));
      }
    };

    /**
     * taipei_g：最近一次由「resize 自動合併門檻」觸發的合併結果。
     * maxWeightDiff 與手動「合併黑點路段 (權重差≤N)」之 N 同義；mergeAxisConstraint 為該次僅嘗試水平或垂直向合併。
     */
    const taipeiFResizeLastAutoMergeInfo = ref(null);
    const setTaipeiFResizeLastAutoMergeInfo = (payload) => {
      if (payload == null) {
        taipeiFResizeLastAutoMergeInfo.value = null;
        return;
      }
      const m = typeof payload === 'object' && payload ? payload : {};
      const maxWd = Number(m.maxWeightDiff);
      taipeiFResizeLastAutoMergeInfo.value = {
        maxWeightDiff: Number.isFinite(maxWd) ? maxWd : null,
        mergeAxisConstraint:
          m.mergeAxisConstraint === 'vertical'
            ? 'vertical'
            : m.mergeAxisConstraint === 'horizontal'
              ? 'horizontal'
              : null,
        mergeCount: Number.isFinite(Number(m.mergeCount))
          ? Math.max(0, Math.round(Number(m.mergeCount)))
          : 0,
        removedColCount: Number.isFinite(Number(m.removedColCount))
          ? Math.max(0, Math.round(Number(m.removedColCount)))
          : 0,
        removedRowCount: Number.isFinite(Number(m.removedRowCount))
          ? Math.max(0, Math.round(Number(m.removedRowCount)))
          : 0,
        removedCols: Array.isArray(m.removedCols)
          ? m.removedCols
              .map((v) => Number(v))
              .filter((v) => Number.isFinite(v))
              .map((v) => Math.round(v))
          : [],
        removedRows: Array.isArray(m.removedRows)
          ? m.removedRows
              .map((v) => Number(v))
              .filter((v) => Number.isFinite(v))
              .map((v) => Math.round(v))
          : [],
        source: m.source === 'manual' ? 'manual' : 'resize',
        at: typeof m.at === 'number' ? m.at : Date.now(),
      };
    };
    const clearTaipeiFResizeLastAutoMergeInfo = () => {
      taipeiFResizeLastAutoMergeInfo.value = null;
    };

    // 權重放大倍數（預設 5，開啟權重放大時使用此倍數）
    const weightScalingMultiplier = ref(5);
    const setWeightScalingMultiplier = (value) => {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue > 0) {
        weightScalingMultiplier.value = numValue;
      }
    };

    // LayoutGridTab_Test4 當前滑鼠網格座標
    const layoutGridTabTest4MouseGridCoordinate = ref({
      x: null, // 網格 X 座標
      y: null, // 網格 Y 座標
    });

    // 更新 LayoutGridTab_Test4 滑鼠網格座標
    const updateLayoutGridTabTest4MouseGridCoordinate = (x, y) => {
      layoutGridTabTest4MouseGridCoordinate.value = {
        x: x !== null && x !== undefined ? Math.round(x) : null, // 網格座標為整數
        y: y !== null && y !== undefined ? Math.round(y) : null, // 網格座標為整數
      };
    };

    // 清除 LayoutGridTab_Test4 滑鼠網格座標
    const clearLayoutGridTabTest4MouseGridCoordinate = () => {
      layoutGridTabTest4MouseGridCoordinate.value = {
        x: null,
        y: null,
      };
    };

    /**
     * 路網網格_2（layout-grid-viewer 像素軸）：滑鼠所在之 pt 座標（X 自左、Y 自左下往上）與
     * 子網格座標（subX／subY，沿用既有背景格線之欄／列；依子網格個數編號 1,2,3…；
     * subX 自左、subY 自下往上；與 pt 無關），供 Control 操作面板顯示。
     */
    const layoutVhDrawViewerMousePt = ref({
      x: null, // pt（四捨五入整數，與軸刻度同）
      y: null,
      subX: null, // 子網格欄（1=最左）
      subY: null, // 子網格列（1=最下）
    });

    const updateLayoutVhDrawViewerMousePt = (x, y, subX = null, subY = null) => {
      layoutVhDrawViewerMousePt.value = {
        x: Number.isFinite(x) ? Math.round(x) : null,
        y: Number.isFinite(y) ? Math.round(y) : null,
        subX: Number.isFinite(subX) ? subX : null,
        subY: Number.isFinite(subY) ? subY : null,
      };
    };

    const clearLayoutVhDrawViewerMousePt = () => {
      layoutVhDrawViewerMousePt.value = { x: null, y: null, subX: null, subY: null };
    };

    /** 路網網格_2：最短路徑放大所選之兩個紅/藍點（[{gx,gy}]，最多 2 個；點滿 2 個即計算 BFS 最少站路線並放大沿線網格） */
    const layoutVhDrawPathSel = ref([]);
    const setLayoutVhDrawPathSel = (arr) => {
      layoutVhDrawPathSel.value = Array.isArray(arr) ? arr : [];
    };
    /** 最短路徑（導航）結果摘要：是否找到、經過站數、轉乘次數 */
    const layoutVhDrawPathInfo = ref({ found: false, stations: 0, transfers: 0 });
    const setLayoutVhDrawPathInfo = (info) => {
      layoutVhDrawPathInfo.value = {
        found: !!info?.found,
        stations: Number.isFinite(info?.stations) ? info.stations : 0,
        transfers: Number.isFinite(info?.transfers) ? info.transfers : 0,
      };
    };
    const clearLayoutVhDrawPathSel = () => {
      layoutVhDrawPathSel.value = [];
      layoutVhDrawPathInfo.value = { found: false, stations: 0, transfers: 0 };
    };

    /** taipei_g 空間網路圖：繪圖區網格跨度與內框像素（供 resize／zoom 換算最小格 pt） */
    const spaceNetworkSchematicPlotBounds = ref(null);

    const setSpaceNetworkSchematicPlotBounds = (bounds) => {
      if (
        bounds &&
        typeof bounds.xSpan === 'number' &&
        typeof bounds.ySpan === 'number' &&
        typeof bounds.plotW === 'number' &&
        typeof bounds.plotH === 'number'
      ) {
        spaceNetworkSchematicPlotBounds.value = { ...bounds };
      } else {
        spaceNetworkSchematicPlotBounds.value = null;
      }
    };

    const clearSpaceNetworkSchematicPlotBounds = () => {
      spaceNetworkSchematicPlotBounds.value = null;
    };

    /** taipei_g 示意網格：目前縮放下的最小格寬／高（pt；顯示值至少 2pt，算法對齊 LayoutGridTab_Test4） */
    const spaceNetworkGridMinCellDimensions = ref({
      minWidth: 0,
      minHeight: 0,
    });

    const updateSpaceNetworkGridMinCellDimensions = (minWidth, minHeight) => {
      spaceNetworkGridMinCellDimensions.value = {
        minWidth: minWidth > 0 ? Math.max(2, Math.round(minWidth)) : 0,
        minHeight: minHeight > 0 ? Math.max(2, Math.round(minHeight)) : 0,
      };
    };

    const clearSpaceNetworkGridMinCellDimensions = () => {
      spaceNetworkGridMinCellDimensions.value = {
        minWidth: 0,
        minHeight: 0,
      };
    };

    /**
     * taipei_l3／taipei_m3：space-network-grid-l3|m3／json-data-l3|m3 示意網格（欄列由版面決定，單格寬高 ≤50pt）。
     * 由 SpaceNetworkGridTabL3／SpaceNetworkGridJsonDataTabL3（含 m3 別名實例）依容器量測寫入。
     */
    const spaceNetworkGridL3MinCellDimensions = ref({
      minWidth: 0,
      minHeight: 0,
      gridCols: 0,
      gridRows: 0,
      innerDrawWidth: 0,
      innerDrawHeight: 0,
    });

    /**
     * @param {{ minWidth: number, minHeight: number, cols: number, rows: number, innerDrawWidth?: number, innerDrawHeight?: number }} metrics
     */
    const updateSpaceNetworkGridL3MinCellDimensions = (metrics) => {
      if (!metrics || typeof metrics !== 'object') {
        clearSpaceNetworkGridL3MinCellDimensions();
        return;
      }
      const mw = Number(metrics.minWidth);
      const mh = Number(metrics.minHeight);
      const c = Number(metrics.cols);
      const r = Number(metrics.rows);
      const idw = Number(metrics.innerDrawWidth);
      const idh = Number(metrics.innerDrawHeight);
      spaceNetworkGridL3MinCellDimensions.value = {
        minWidth: mw > 0 ? Math.max(2, Math.round(mw)) : 0,
        minHeight: mh > 0 ? Math.max(2, Math.round(mh)) : 0,
        gridCols: Number.isFinite(c) && c > 0 ? c : 0,
        gridRows: Number.isFinite(r) && r > 0 ? r : 0,
        innerDrawWidth: Number.isFinite(idw) && idw > 0 ? Math.round(idw) : 0,
        innerDrawHeight: Number.isFinite(idh) && idh > 0 ? Math.round(idh) : 0,
      };
    };

    const clearSpaceNetworkGridL3MinCellDimensions = () => {
      spaceNetworkGridL3MinCellDimensions.value = {
        minWidth: 0,
        minHeight: 0,
        gridCols: 0,
        gridRows: 0,
        innerDrawWidth: 0,
        innerDrawHeight: 0,
      };
    };

    // 紅點逐步高亮：目前被 highlight 的 connect_number（null 表示無）
    const highlightedConnectNumber = ref(null);
    const setHighlightedConnectNumber = (value) => {
      highlightedConnectNumber.value = value != null ? value : null;
    };

    // 黑點車站逐步高亮：{ layerId, x, y, stationId?, color? } | null
    const highlightedBlackStation = ref(null);
    /** 每次變更 +1，強制 SpaceNetworkGridTab 重繪（Pinia 物件替換有時不觸發細粒度追蹤） */
    const blackStationHighlightRedrawTrigger = ref(0);
    const setHighlightedBlackStation = (value) => {
      if (value && value.layerId && typeof value.x === 'number' && typeof value.y === 'number') {
        const o = { layerId: value.layerId, x: value.x, y: value.y };
        if (value.stationId != null && String(value.stationId).trim() !== '') {
          o.stationId = value.stationId;
        }
        if (typeof value.color === 'string' && value.color.trim() !== '') {
          o.color = value.color.trim();
        }
        highlightedBlackStation.value = o;
      } else {
        highlightedBlackStation.value = null;
      }
      blackStationHighlightRedrawTrigger.value += 1;
    };

    /** L3「一鍵至 weight 差 n」與 l3「執行下一步」共用：最小候選 weight 差 ≥ 此值則停（字串，預設 500） */
    const taipeiL3ReductionWeightDiffThreshold = ref('500');
    const setTaipeiL3ReductionWeightDiffThreshold = (v) => {
      taipeiL3ReductionWeightDiffThreshold.value =
        v != null && String(v).trim() !== '' ? String(v) : '500';
    };

    // 疊加縮減預覽：高亮「會保留」的整欄或整列 { layerId, kind: 'col'|'row', index } | null
    const highlightedOverlayShrinkStrip = ref(null);
    const overlayShrinkStripRedrawTrigger = ref(0);
    const setHighlightedOverlayShrinkStrip = (value) => {
      const ok =
        value &&
        value.layerId &&
        (value.kind === 'col' || value.kind === 'row') &&
        typeof value.index === 'number' &&
        Number.isFinite(value.index);
      highlightedOverlayShrinkStrip.value = ok
        ? { layerId: value.layerId, kind: value.kind, index: value.index }
        : null;
      overlayShrinkStripRedrawTrigger.value += 1;
    };

    /** 空間網路分頁：強制卸載 SVG 後重載並重繪（略過 drawMap 同尺寸快取，如 taipei_g 隨機權重後） */
    const spaceNetworkGridFullRedrawTrigger = ref(0);
    const requestSpaceNetworkGridFullRedraw = () => {
      spaceNetworkGridFullRedrawTrigger.value += 1;
    };

    /** 🗺️ Leaflet 畫線圖層目前的繪製工具：'none'（不編輯，預設）｜'line'（畫線）｜'point'（畫黑點） */
    const leafletDrawMode = ref('none');
    const setLeafletDrawMode = (mode) => {
      leafletDrawMode.value = mode === 'point' || mode === 'line' ? mode : 'none';
    };

    /** 🗺️ 畫線地圖目前選用的參考路線圖 id（DRAW_REF_MAPS 之一）；'none' 表示未選 */
    const leafletDrawRefMap = ref('none');
    const setLeafletDrawRefMap = (id) => {
      leafletDrawRefMap.value = typeof id === 'string' && id ? id : 'none';
    };

    /** 🗺️ 一次性「將畫線地圖縮放到目前所有線」的觸發器（載入城市/讀圖/隨機後呼叫） */
    const leafletDrawFitTrigger = ref(0);
    const requestLeafletDrawFit = () => {
      leafletDrawFitTrigger.value += 1;
    };

    /** 🗺️「選擇路線圖」(select_route_map) 一次性 fitBounds 觸發器（與 leaflet 畫線完全獨立） */
    const selectRouteMapFitTrigger = ref(0);
    const requestSelectRouteMapFit = () => {
      selectRouteMapFitTrigger.value += 1;
    };

    /** 🗺️「路線圖調整」(route_map_adjust) 一次性 fitBounds 觸發器（與其他圖層完全獨立） */
    const routeMapAdjustFitTrigger = ref(0);
    const requestRouteMapAdjustFit = () => {
      routeMapAdjustFitTrigger.value += 1;
    };

    /** 🗺️「路線圖轉換骨架2」(route_map_adjust_2) 一次性 fitBounds 觸發器 */
    const routeMapAdjust2FitTrigger = ref(0);
    const requestRouteMapAdjust2Fit = () => {
      routeMapAdjust2FitTrigger.value += 1;
    };

    /** 🗺️「路線圖轉換直線骨架」(route_map_adjust_straight) 一次性 fitBounds 觸發器 */
    const routeMapAdjustStraightFitTrigger = ref(0);
    const requestRouteMapAdjustStraightFit = () => {
      routeMapAdjustStraightFitTrigger.value += 1;
    };

    /** 🗺️ 三個示意圖佈局圖層（schematic_rma_*）獨立顯示：目前要畫的圖層 id + 重繪 tick */
    const routeSchematicActiveLayerId = ref(null);
    const routeSchematicTick = ref(0);
    const setRouteSchematicActiveLayer = (id) => {
      routeSchematicActiveLayerId.value = id || null;
      routeSchematicTick.value += 1;
    };

    /**
     * layout-grid-viewer 加權版面：「全部隨機 weight」後 3 秒路線／比例條內插動畫。
     * snapshot：{ routes, remap }；anim：{ layerId, from, to, progress, active, pendingTo, startTime }
     */
    const layoutVhDrawRouteAnimSnapshot = ref(null);
    const layoutVhDrawRouteAnim = ref(null);
    const layoutVhDrawRouteAnimTrigger = ref(0);

    const setLayoutVhDrawRouteAnimSnapshot = (layerId, snapshot) => {
      if (!layerId || !snapshot?.routes) {
        layoutVhDrawRouteAnimSnapshot.value = null;
        return;
      }
      layoutVhDrawRouteAnimSnapshot.value = {
        layerId: String(layerId),
        snapshot: JSON.parse(JSON.stringify(snapshot)),
      };
    };

    const getLayoutVhDrawRouteAnimSnapshot = (layerId) => {
      const row = layoutVhDrawRouteAnimSnapshot.value;
      if (!row || row.layerId !== String(layerId)) return null;
      return row.snapshot;
    };

    const requestLayoutVhDrawRouteWeightAnim = (layerId) => {
      const from = getLayoutVhDrawRouteAnimSnapshot(layerId);
      if (!from || !Object.keys(from.routes || {}).length) return;
      layoutVhDrawRouteAnim.value = {
        layerId: String(layerId),
        from,
        to: null,
        progress: 0,
        active: false,
        pendingTo: true,
        startTime: 0,
      };
    };

    const completeLayoutVhDrawRouteWeightAnimTo = (layerId, toSnapshot) => {
      const anim = layoutVhDrawRouteAnim.value;
      if (!anim || anim.layerId !== String(layerId) || !anim.pendingTo) return false;
      layoutVhDrawRouteAnim.value = {
        ...anim,
        to: JSON.parse(JSON.stringify(toSnapshot)),
        pendingTo: false,
        active: true,
        progress: 0,
        startTime: Date.now(),
      };
      return true;
    };

    const setLayoutVhDrawRouteAnimProgress = (progress) => {
      const anim = layoutVhDrawRouteAnim.value;
      if (!anim?.active) return;
      layoutVhDrawRouteAnim.value = {
        ...anim,
        progress: Math.max(0, Math.min(1, Number(progress) || 0)),
      };
      layoutVhDrawRouteAnimTrigger.value += 1;
    };

    const clearLayoutVhDrawRouteAnim = () => {
      if (!layoutVhDrawRouteAnim.value) return;
      layoutVhDrawRouteAnim.value = null;
      layoutVhDrawRouteAnimTrigger.value += 1;
    };

    /**
     * Layout-grid（VH→版面路網）「比例條繪製」：繪區內相鄰縱／橫線間距（pt，含粗格實線與區間虛線；CSS 96dpi）。
     * 由 SpaceNetworkGridTab drawMap 依 Upper 繪區 width/height 即時寫入；供 Control 對照。
     */
    const layoutVhDrawWeightedDashSubgridPtUi = ref({
      layerId: null,
      status: 'idle',
      wPtMin: null,
      wPtMax: null,
      hPtMin: null,
      hPtMax: null,
    });
    const setLayoutVhDrawWeightedDashSubgridPtUi = (patch) => {
      const base = {
        layerId: null,
        status: 'idle',
        wPtMin: null,
        wPtMax: null,
        hPtMin: null,
        hPtMax: null,
      };
      layoutVhDrawWeightedDashSubgridPtUi.value =
        patch && typeof patch === 'object' ? { ...base, ...patch } : base;
    };

    /**
     * 手繪預覽疊加（可選）：折線以包圍盒正規化 [0,1]²；執行下一步時寫入 taipei_b3_dp_nd.spaceNetworkGridJsonData（Normalize Segments，圖幅依最後選定之可見參考圖層）並清除此欄。
     * polylinesNorm：每條折線為 { nx, ny }[]，nx 由左至右、ny 由上至下（與手繪 SVG 一致）。
     */
    const networkDrawSketchGridOverlay = ref(null);
    const setNetworkDrawSketchGridOverlay = (v) => {
      if (
        v &&
        v.layerId &&
        Array.isArray(v.polylinesNorm) &&
        v.polylinesNorm.some((pl) => Array.isArray(pl) && pl.length >= 2)
      ) {
        networkDrawSketchGridOverlay.value = {
          layerId: String(v.layerId),
          polylinesNorm: v.polylinesNorm.map((pl) =>
            (pl || []).map((p) => ({
              nx: Number(p.nx),
              ny: Number(p.ny),
            }))
          ),
        };
      } else {
        networkDrawSketchGridOverlay.value = null;
      }
    };
    const clearNetworkDrawSketchGridOverlay = () => {
      networkDrawSketchGridOverlay.value = null;
    };

    /** 最後在 space-network-grid 分頁選中的資料圖層（供手繪「執行下一步」對齊用） */
    const lastSpaceNetworkGridSketchTargetLayerId = ref(null);
    const touchLastSpaceNetworkGridSketchTargetLayerId = (layerId) => {
      if (
        layerId == null ||
        isRegisteredNetworkDrawSketchLayerId(layerId) ||
        isNetworkDrawSketchPipelineB3LayerId(layerId)
      )
        return;
      const layer = findLayerById(layerId);
      if (
        layer &&
        Array.isArray(layer.upperViewTabs) &&
        layer.upperViewTabs.includes('space-network-grid')
      ) {
        lastSpaceNetworkGridSketchTargetLayerId.value = String(layerId);
      }
    };

    /** 切到 space-network-grid 後，將圖層分頁切到指定 layerId（一次性；優先於 networkDrawSketchGridOverlay.layerId） */
    const networkSketchAfterDrawSwitchLayerPending = ref(false);
    const setNetworkSketchAfterDrawSwitchLayerPending = (v) => {
      networkSketchAfterDrawSwitchLayerPending.value = !!v;
    };
    const networkSketchAfterDrawTargetLayerId = ref(null);
    const setNetworkSketchAfterDrawTargetLayerId = (v) => {
      networkSketchAfterDrawTargetLayerId.value =
        typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
    };

    /** 由 store 請求首頁切換上半部頁籤（例：手繪後切至 space-network-grid）；HomeView 監聽後套用並清除 */
    const pendingHomeActiveUpperTab = ref(null);
    const requestHomeActiveUpperTab = (tab) => {
      if (typeof tab !== 'string' || !tab) return;
      pendingHomeActiveUpperTab.value = null;
      nextTick(() => {
        pendingHomeActiveUpperTab.value = tab;
      });
    };
    const clearPendingHomeActiveUpperTab = () => {
      pendingHomeActiveUpperTab.value = null;
    };

    // Z 形水平垂直化下一步：每按一次執行一筆（紅點間直線→Z 形），依同路線順序
    const hvZNextIndex = ref(0);
    const hvZStepTrigger = ref(0);
    const advanceHVZStep = () => {
      hvZStepTrigger.value += 1;
    };

    // Flip L 型下一步：每按一次 flip 一個 L 型
    const hvFlipNextIndex = ref(0);
    const hvFlipStepTrigger = ref(0);
    const advanceFlipStep = () => {
      hvFlipStepTrigger.value += 1;
    };

    /** 串接Flip L型：按過「下一步」或「一鍵完成」後才顯示高亮與虛線 */
    const connectFlipOverlayVisible = ref(false);
    const setConnectFlipOverlayVisible = (value) => {
      connectFlipOverlayVisible.value = !!value;
    };

    /** ㄈ縮減為L型：目前在 nShapeList 中的索引 */
    const nShapeNextIndex = ref(0);
    const nShapeStepTrigger = ref(0);
    const advanceNShapeStep = () => {
      nShapeStepTrigger.value += 1;
    };

    /** ㄈ縮減為L型：按過「下一步」或「一鍵完成」後才顯示高亮 */
    const nShapeOverlayVisible = ref(false);
    const setNShapeOverlayVisible = (value) => {
      nShapeOverlayVisible.value = !!value;
    };

    const highlightDiagnosticsTrigger = ref(0);

    // 重疊路段：高亮用，只存重疊區段 { points: [[x,y],[x,y]], turnCounts: [{ routeName, turnCount }] }（按鈕偵測後填入）
    const overlappingSegmentRanges = ref([]);
    const setOverlappingSegmentHighlight = (ranges) => {
      overlappingSegmentRanges.value = Array.isArray(ranges) ? ranges.map((r) => ({ ...r })) : [];
      highlightDiagnosticsTrigger.value += 1;
    };
    const clearOverlappingSegmentHighlight = () => {
      overlappingSegmentRanges.value = [];
      highlightDiagnosticsTrigger.value += 1;
    };

    /** taipei_f：依欄（grid x）逐步高亮——僅垂直線段；verticalPaths 為 [[x,y],[x,y]] 格線座標 */
    const taipeiFColRouteHighlight = ref(null);
    const taipeiFColRouteHighlightRedrawTrigger = ref(0);
    const setTaipeiFColRouteHighlight = (value) => {
      const pathsOk =
        value &&
        Array.isArray(value.verticalPaths) &&
        value.verticalPaths.length > 0 &&
        value.verticalPaths.every(
          (p) =>
            Array.isArray(p) &&
            p.length >= 2 &&
            p.every((pt) => Array.isArray(pt) && pt.length >= 2)
        );
      if (value && value.layerId && pathsOk) {
        const vPaths = value.verticalPaths.map((p) =>
          p.map((pt) => [Number(pt[0]), Number(pt[1])])
        );
        const pathColorsOk =
          Array.isArray(value.verticalPathColors) &&
          value.verticalPathColors.length === vPaths.length &&
          value.verticalPathColors.every((c) => typeof c === 'string' && c.trim() !== '');
        taipeiFColRouteHighlight.value = {
          layerId: value.layerId,
          verticalPaths: vPaths,
          verticalPathColors: pathColorsOk
            ? value.verticalPathColors.map((c) => String(c).trim())
            : null,
          segmentIndices: Array.isArray(value.segmentIndices) ? value.segmentIndices.slice() : [],
          gridX: value.gridX,
          componentIndex: value.componentIndex,
          stepIndex: value.stepIndex,
          planLength: value.planLength,
          delta: value.delta != null ? Number(value.delta) : 0,
          topologyError:
            typeof value.topologyError === 'string' && value.topologyError.trim() !== ''
              ? value.topologyError.trim()
              : null,
        };
      } else {
        taipeiFColRouteHighlight.value = null;
      }
      taipeiFColRouteHighlightRedrawTrigger.value += 1;
    };
    const clearTaipeiFColRouteHighlight = () => setTaipeiFColRouteHighlight(null);

    /** taipei_f：依列（grid y）逐步高亮——僅水平線段；horizontalPaths 為 [[x,y],[x,y]] 格線座標 */
    const taipeiFRowRouteHighlight = ref(null);
    const taipeiFRowRouteHighlightRedrawTrigger = ref(0);
    const setTaipeiFRowRouteHighlight = (value) => {
      const pathsOk =
        value &&
        Array.isArray(value.horizontalPaths) &&
        value.horizontalPaths.length > 0 &&
        value.horizontalPaths.every(
          (p) =>
            Array.isArray(p) &&
            p.length >= 2 &&
            p.every((pt) => Array.isArray(pt) && pt.length >= 2)
        );
      if (value && value.layerId && pathsOk) {
        const hPaths = value.horizontalPaths.map((p) =>
          p.map((pt) => [Number(pt[0]), Number(pt[1])])
        );
        const pathColorsOk =
          Array.isArray(value.horizontalPathColors) &&
          value.horizontalPathColors.length === hPaths.length &&
          value.horizontalPathColors.every((c) => typeof c === 'string' && c.trim() !== '');
        taipeiFRowRouteHighlight.value = {
          layerId: value.layerId,
          horizontalPaths: hPaths,
          horizontalPathColors: pathColorsOk
            ? value.horizontalPathColors.map((c) => String(c).trim())
            : null,
          segmentIndices: Array.isArray(value.segmentIndices) ? value.segmentIndices.slice() : [],
          gridY: value.gridY,
          componentIndex: value.componentIndex,
          stepIndex: value.stepIndex,
          planLength: value.planLength,
          delta: value.delta != null ? Number(value.delta) : 0,
          topologyError:
            typeof value.topologyError === 'string' && value.topologyError.trim() !== ''
              ? value.topologyError.trim()
              : null,
        };
      } else {
        taipeiFRowRouteHighlight.value = null;
      }
      taipeiFRowRouteHighlightRedrawTrigger.value += 1;
    };
    const clearTaipeiFRowRouteHighlight = () => setTaipeiFRowRouteHighlight(null);

    // 清除「其他路線交叉點」紅點高亮（與 setHighlightedConnectNumber(null) 等價）
    const clearConnectOnOtherRouteHighlight = () => {
      setHighlightedConnectNumber(null);
    };

    // 權重縮放指數（預設 2，用於非線性縮放：值越大，最大值和最小值的差異越大）
    // 例如：指數 = 2 時，maxVal=1 -> weightedValue=1，maxVal=3 -> weightedValue=9，maxVal=5 -> weightedValue=25
    const weightScalingExponent = ref(2);
    const setWeightScalingExponent = (value) => {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue > 0) {
        weightScalingExponent.value = numValue;
      }
    };

    const setSelectedFeature = (feature) => {
      // 記錄選取變化的log
      selectedFeature.value = feature;
    };

    const clearSelectedFeature = () => {
      selectedFeature.value = null;
    };

    /**
     * 🔄 強制重新載入圖層 (Force Reload Layer)
     *
     * 清除圖層的載入狀態並重新載入數據
     *
     * @param {string} layerId - 圖層 ID
     * @returns {Promise<void>}
     */
    const reloadLayer = async (layerId) => {
      const layer = findLayerById(layerId);
      if (!layer) {
        console.error(`❌ DataStore: Layer with id "${layerId}" not found.`);
        return;
      }

      if (layerId === 'json_grid_coord_normalized') {
        reloadJsonGridCoordNormalizedLayer(findLayerById, saveLayerState, layer);
        return;
      }

      if (isCoordNormalizedDataJsonMirrorFollowonLayerId(layerId)) {
        if (
          layerId === LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID &&
          layer?.vhDrawUserJsonOverride
        ) {
          return;
        }
        reloadJsonGridFromCoordNormalizedLayer(findLayerById, saveLayerState, layer);
        return;
      }

      // 清除載入狀態
      layer.isLoaded = false;
      layer.isLoading = false;

      // 如果圖層是可見的，重新載入
      if (layer.visible && (layer.jsonLoader || layer.geojsonLoader)) {
        try {
          layer.isLoading = true;
          saveLayerState(layerId, { isLoading: layer.isLoading });

          let result;
          if (layer.jsonLoader) {
            result = await layer.jsonLoader(layer);
          } else if (layer.geojsonLoader) {
            result = await layer.geojsonLoader(layer);
          }

          // 更新圖層資料
          layer.jsonData = result.jsonData;
          layer._taipeiFListedGraySnapshotDone = false;
          layer._taipeiFListedGrayStationKeySet = undefined;
          layer._taipeiFListedGrayRouteCellKeySet = undefined;
          layer.spaceNetworkGridJsonData =
            result.spaceNetworkGridJsonData ?? layer.spaceNetworkGridJsonData;
          layer.spaceNetworkGridJsonData_SectionData =
            result.spaceNetworkGridJsonData_SectionData ??
            layer.spaceNetworkGridJsonData_SectionData;
          layer.spaceNetworkGridJsonData_ConnectData =
            result.spaceNetworkGridJsonData_ConnectData ??
            layer.spaceNetworkGridJsonData_ConnectData;
          layer.spaceNetworkGridJsonData_StationData =
            result.spaceNetworkGridJsonData_StationData ??
            layer.spaceNetworkGridJsonData_StationData;
          layer.spaceNetworkGridJsonDataK3Tab =
            result.spaceNetworkGridJsonDataK3Tab ?? layer.spaceNetworkGridJsonDataK3Tab;
          layer.spaceNetworkGridJsonDataK3Tab_SectionData =
            result.spaceNetworkGridJsonDataK3Tab_SectionData ??
            layer.spaceNetworkGridJsonDataK3Tab_SectionData;
          layer.spaceNetworkGridJsonDataK3Tab_ConnectData =
            result.spaceNetworkGridJsonDataK3Tab_ConnectData ??
            layer.spaceNetworkGridJsonDataK3Tab_ConnectData;
          layer.spaceNetworkGridJsonDataK3Tab_StationData =
            result.spaceNetworkGridJsonDataK3Tab_StationData ??
            layer.spaceNetworkGridJsonDataK3Tab_StationData;
          layer.spaceNetworkGridJsonDataL3Tab =
            result.spaceNetworkGridJsonDataL3Tab ?? layer.spaceNetworkGridJsonDataL3Tab;
          layer.spaceNetworkGridJsonDataL3Tab_SectionData =
            result.spaceNetworkGridJsonDataL3Tab_SectionData ??
            layer.spaceNetworkGridJsonDataL3Tab_SectionData;
          layer.spaceNetworkGridJsonDataL3Tab_ConnectData =
            result.spaceNetworkGridJsonDataL3Tab_ConnectData ??
            layer.spaceNetworkGridJsonDataL3Tab_ConnectData;
          layer.spaceNetworkGridJsonDataL3Tab_StationData =
            result.spaceNetworkGridJsonDataL3Tab_StationData ??
            layer.spaceNetworkGridJsonDataL3Tab_StationData;
          layer.spaceNetworkGridJsonDataM3Tab =
            result.spaceNetworkGridJsonDataM3Tab ?? layer.spaceNetworkGridJsonDataM3Tab;
          layer.spaceNetworkGridJsonDataM3Tab_SectionData =
            result.spaceNetworkGridJsonDataM3Tab_SectionData ??
            layer.spaceNetworkGridJsonDataM3Tab_SectionData;
          layer.spaceNetworkGridJsonDataM3Tab_ConnectData =
            result.spaceNetworkGridJsonDataM3Tab_ConnectData ??
            layer.spaceNetworkGridJsonDataM3Tab_ConnectData;
          layer.spaceNetworkGridJsonDataM3Tab_StationData =
            result.spaceNetworkGridJsonDataM3Tab_StationData ??
            layer.spaceNetworkGridJsonDataM3Tab_StationData;
          layer.layoutGridJsonData = result.layoutGridJsonData ?? layer.layoutGridJsonData;
          layer.layoutGridJsonData_Test =
            result.layoutGridJsonData_Test ?? layer.layoutGridJsonData_Test;
          layer.layoutGridJsonData_Test2 =
            result.layoutGridJsonData_Test2 ?? layer.layoutGridJsonData_Test2;
          layer.layoutGridJsonData_Test3 =
            result.layoutGridJsonData_Test3 ?? layer.layoutGridJsonData_Test3;
          layer.layoutGridJsonData_Test4 =
            result.layoutGridJsonData_Test4 ?? layer.layoutGridJsonData_Test4;
          layer.geojsonData = result.geojsonData ?? layer.geojsonData;
          layer.processedJsonData = result.processedJsonData ?? layer.processedJsonData;
          layer.processedJsonDataK3Tab =
            result.processedJsonDataK3Tab ?? layer.processedJsonDataK3Tab;
          layer.processedJsonDataL3Tab =
            result.processedJsonDataL3Tab ?? layer.processedJsonDataL3Tab;
          layer.processedJsonDataM3Tab =
            result.processedJsonDataM3Tab ?? layer.processedJsonDataM3Tab;
          layer.drawJsonData = result.drawJsonData ?? layer.drawJsonData;
          layer.dashboardData = result.dashboardData ?? layer.dashboardData;
          layer.dataTableData = result.dataTableData ?? layer.dataTableData;
          if (
            (layer.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
              layer.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2) &&
            Array.isArray(layer.dataTableData)
          ) {
            sortLayoutVhDrawCopyBlackDotDataTableRowsByWeightDiffAsc(layer.dataTableData);
          }
          layer.layerInfoData = result.layerInfoData ?? layer.layerInfoData;
          if (Object.prototype.hasOwnProperty.call(result, 'trafficData')) {
            layer.trafficData = result.trafficData;
          }

          ensureTaipeiFListedGrayHighlightSnapshot(layer);

          layer.isLoaded = true;
          layer.isLoading = false;
          saveLayerState(layerId, {
            isLoaded: layer.isLoaded,
            isLoading: layer.isLoading,
          });

          console.log(`✅ DataStore: Layer "${layerId}" reloaded successfully.`);
        } catch (error) {
          console.error(`❌ DataStore: Failed to reload layer "${layerId}":`, error);
          layer.isLoading = false;
          saveLayerState(layerId, { isLoading: layer.isLoading });
        }
      }
    };

    // ==================== 返回的狀態和方法 ====================

    return {
      layers,
      clearPendingHomeActiveUpperTab,
      findLayerById, // 根據 ID 尋找圖層
      getAllLayers, // 獲取所有圖層的扁平陣列
      findGroupNameByLayerId, // 根據圖層ID找到對應的群組名稱
      toggleLayerVisibility,
      syncOsm2DataJsonMirrorFromParent,
      reloadLayer, // 強制重新載入圖層
      selectedFeature,
      setSelectedFeature,
      clearSelectedFeature,
      visibleLayers: computed(() => getAllLayers().filter((layer) => layer.visible)),
      loadingLayers: computed(() => getAllLayers().filter((layer) => layer.isLoading)),
      // 狀態管理相關函數
      layerStates,
      saveLayerState,
      // D3jsTab 尺寸管理
      d3jsDimensions,
      updateD3jsDimensions,
      updateComputedGridState,
      // LayoutGridTab_Test3 尺寸管理
      layoutGridTabTest3Dimensions,
      updateLayoutGridTabTest3Dimensions,
      layoutGridTabTest3MinCellDimensions,
      updateLayoutGridTabTest3MinCellDimensions,
      // LayoutGridTab_Test4 尺寸管理
      layoutGridTabTest4Dimensions,
      updateLayoutGridTabTest4Dimensions,
      layoutGridTabTest4MinCellDimensions,
      updateLayoutGridTabTest4MinCellDimensions,
      // LayoutGridTab_Test4 滑鼠網格座標
      layoutGridTabTest4MouseGridCoordinate,
      updateLayoutGridTabTest4MouseGridCoordinate,
      clearLayoutGridTabTest4MouseGridCoordinate,
      layoutVhDrawViewerMousePt,
      updateLayoutVhDrawViewerMousePt,
      clearLayoutVhDrawViewerMousePt,
      layoutVhDrawPathSel,
      setLayoutVhDrawPathSel,
      clearLayoutVhDrawPathSel,
      layoutVhDrawPathInfo,
      setLayoutVhDrawPathInfo,
      spaceNetworkSchematicPlotBounds,
      setSpaceNetworkSchematicPlotBounds,
      clearSpaceNetworkSchematicPlotBounds,
      spaceNetworkGridMinCellDimensions,
      updateSpaceNetworkGridMinCellDimensions,
      clearSpaceNetworkGridMinCellDimensions,
      spaceNetworkGridL3MinCellDimensions,
      updateSpaceNetworkGridL3MinCellDimensions,
      clearSpaceNetworkGridL3MinCellDimensions,
      highlightedConnectNumber,
      setHighlightedConnectNumber,
      highlightedBlackStation,
      setHighlightedBlackStation,
      blackStationHighlightRedrawTrigger,
      taipeiL3ReductionWeightDiffThreshold,
      setTaipeiL3ReductionWeightDiffThreshold,
      highlightedOverlayShrinkStrip,
      setHighlightedOverlayShrinkStrip,
      overlayShrinkStripRedrawTrigger,
      spaceNetworkGridFullRedrawTrigger,
      requestSpaceNetworkGridFullRedraw,
      leafletDrawMode,
      setLeafletDrawMode,
      leafletDrawRefMap,
      setLeafletDrawRefMap,
      leafletDrawFitTrigger,
      requestLeafletDrawFit,
      selectRouteMapFitTrigger,
      requestSelectRouteMapFit,
      routeMapAdjustFitTrigger,
      requestRouteMapAdjustFit,
      routeMapAdjust2FitTrigger,
      requestRouteMapAdjust2Fit,
      routeMapAdjustStraightFitTrigger,
      requestRouteMapAdjustStraightFit,
      routeSchematicActiveLayerId,
      routeSchematicTick,
      setRouteSchematicActiveLayer,
      layoutVhDrawRouteAnimSnapshot,
      layoutVhDrawRouteAnim,
      layoutVhDrawRouteAnimTrigger,
      setLayoutVhDrawRouteAnimSnapshot,
      getLayoutVhDrawRouteAnimSnapshot,
      requestLayoutVhDrawRouteWeightAnim,
      completeLayoutVhDrawRouteWeightAnimTo,
      setLayoutVhDrawRouteAnimProgress,
      clearLayoutVhDrawRouteAnim,
      layoutVhDrawWeightedDashSubgridPtUi,
      setLayoutVhDrawWeightedDashSubgridPtUi,
      networkDrawSketchGridOverlay,
      setNetworkDrawSketchGridOverlay,
      clearNetworkDrawSketchGridOverlay,
      lastSpaceNetworkGridSketchTargetLayerId,
      touchLastSpaceNetworkGridSketchTargetLayerId,
      networkSketchAfterDrawSwitchLayerPending,
      setNetworkSketchAfterDrawSwitchLayerPending,
      networkSketchAfterDrawTargetLayerId,
      setNetworkSketchAfterDrawTargetLayerId,
      pendingHomeActiveUpperTab,
      requestHomeActiveUpperTab,
      hvZNextIndex,
      hvZStepTrigger,
      advanceHVZStep,
      hvFlipNextIndex,
      hvFlipStepTrigger,
      advanceFlipStep,
      connectFlipOverlayVisible,
      setConnectFlipOverlayVisible,
      nShapeNextIndex,
      nShapeStepTrigger,
      advanceNShapeStep,
      nShapeOverlayVisible,
      setNShapeOverlayVisible,
      highlightDiagnosticsTrigger,
      overlappingSegmentRanges,
      setOverlappingSegmentHighlight,
      clearOverlappingSegmentHighlight,
      clearConnectOnOtherRouteHighlight,
      taipeiFColRouteHighlight,
      setTaipeiFColRouteHighlight,
      clearTaipeiFColRouteHighlight,
      taipeiFColRouteHighlightRedrawTrigger,
      taipeiFRowRouteHighlight,
      setTaipeiFRowRouteHighlight,
      clearTaipeiFRowRouteHighlight,
      taipeiFRowRouteHighlightRedrawTrigger,
      // LayoutGridTab_Test4 開關（路線權重數字：與 space-network-grid / K3 分頁共用 store 鍵名）
      showWeightLabels,
      setShowWeightLabels,
      spaceNetworkGridShowRouteWeights: spaceNetworkGridShowRouteWeights,
      setSpaceNetworkGridShowRouteWeights: setSpaceNetworkGridShowRouteWeights,
      spaceNetworkGridShowMouseGridCoordinate,
      setSpaceNetworkGridShowMouseGridCoordinate,
      controlActiveLayerId,
      setControlActiveLayerId,
      showRouteThickness,
      setShowRouteThickness,
      spaceNetworkK4WeightProportionalInnerGrid,
      setSpaceNetworkK4WeightProportionalInnerGrid,
      spaceNetworkK4WeightProportionalScaleN,
      setSpaceNetworkK4WeightProportionalScaleN,
      spaceNetworkK4MouseBandFocusMagnifyEnabled,
      setSpaceNetworkK4MouseBandFocusMagnifyEnabled,
      spaceNetworkK4MouseBandFocusMagnifyN,
      setSpaceNetworkK4MouseBandFocusMagnifyN,
      enableWeightScaling,
      setEnableWeightScaling,
      showGrid,
      setShowGrid,
      taipeiFSpaceNetworkGridScaling,
      setTaipeiFSpaceNetworkGridScaling,
      taipeiFSpaceNetworkMouseZoom,
      setTaipeiFSpaceNetworkMouseZoom,
      showStationNames,
      setShowStationNames,
      showBlackDotStationNames,
      setShowBlackDotStationNames,
      k3JsonOverlapDistancePx,
      setK3JsonOverlapDistancePx,
      k3JsonMinStationDistancePx,
      setK3JsonMinStationDistancePx,
      taipeiK3MergeMaxWeightDiff,
      setTaipeiK3MergeMaxWeightDiff,
      k3JsonDataTabViewport,
      setK3JsonDataTabViewport,
      currentMergeOperation4,
      setCurrentMergeOperation4,
      clearCurrentMergeOperation4,
      // 自動合併閾值
      autoMergeThreshold,
      setAutoMergeThreshold,
      taipeiFResizeMinWidthPtThreshold,
      setTaipeiFResizeMinWidthPtThreshold,
      taipeiFResizeMinHeightPtThreshold,
      setTaipeiFResizeMinHeightPtThreshold,
      taipeiFResizeLastAutoMergeInfo,
      setTaipeiFResizeLastAutoMergeInfo,
      clearTaipeiFResizeLastAutoMergeInfo,
      // 權重縮放指數
      weightScalingExponent,
      setWeightScalingExponent,
      // 權重放大倍數
      weightScalingMultiplier,
      setWeightScalingMultiplier,
    };
  },
  {
    persist: true,
  }
);
