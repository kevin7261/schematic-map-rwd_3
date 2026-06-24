/** * 📊 圖層資訊顯示組件 (Layer Information Display Component) * * 功能概述 (Function Overview): *
本組件負責顯示當前選中圖層的詳細資訊，包括基本統計數據、項目數量、 *
以及相關的技術參數。提供直觀的圖層資訊查看介面。 * * 主要功能 (Main Features): * 1. 📋
圖層資訊展示：顯示當前選中圖層的基本資訊和統計數據 * 2. 📊
項目數量統計：計算並顯示圖層中包含的資料項目總數 * 3. 🔄
多圖層支援：支援多個圖層的分頁切換和資訊顯示 * 4. 📱 響應式設計：適配不同螢幕尺寸的顯示需求 * 5. 🎯
即時更新：當圖層狀態變化時自動更新顯示內容 * 6. 📐 技術參數顯示：顯示 D3.js 繪圖區域的尺寸資訊 * *
技術特點 (Technical Features): * - 使用 Vue 3 Composition API 進行現代化狀態管理 * - 整合 Pinia
狀態管理系統實現跨組件數據共享 * - 支援動態圖層切換和資訊即時更新 * - 提供簡潔直觀的圖層資訊展示介面
* - 具備載入狀態指示和錯誤處理機制 * * 顯示內容 (Display Content): * -
項目數量：當前圖層包含的資料項目總數 * - 圖層標題：包含群組名稱和圖層名稱的完整標題 * -
分頁導航：支援多圖層的分頁切換功能 * - 技術參數：D3.js 繪圖區域的寬度和高度資訊 * -
載入狀態：顯示資料載入進度和狀態 * * @file LayerInfoTab.vue * @version 2.1.0 * @author Kevin Cheng *
@since 1.0.0 * @updated 2024 - 重構為圖層資訊顯示組件 */
<script setup>
  // ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

  /**
   * Vue 3 Composition API 核心功能引入
   * 提供響應式數據管理、計算屬性、生命週期鉤子等現代化 Vue 開發功能
   *
   * @description 包含：
   * - ref: 創建響應式基本類型數據
   * - computed: 創建計算屬性，自動追蹤依賴變化
   * - watch: 監聽響應式數據變化
   * - onMounted: 組件掛載完成後的生命週期鉤子
   *
   * @see https://vuejs.org/guide/extras/composition-api-faq.html
   */
  import { ref, computed, watch, onMounted } from 'vue';

  /**
   * Pinia 狀態管理庫引入
   * 提供集中式狀態管理和跨組件數據共享能力
   *
   * @description 主要功能：
   * - 集中管理應用程式全域狀態
   * - 提供響應式狀態更新機制
   * - 支援跨組件狀態共享
   * - 整合開發者工具支援
   *
   * @see https://pinia.vuejs.org/introduction.html
   */
  import { useDataStore } from '@/stores/dataStore.js';

  /**
   * 工具函數引入
   * 提供圖示 HTML 生成和組件引入功能
   */
  import { getIconHtml } from '../utils/utils.js';

  // ==================== 🏪 狀態管理初始化 (State Management Initialization) ====================

  /**
   * 獲取 Pinia 數據存儲實例
   * 用於訪問全域狀態和圖層數據，實現組件間的數據共享
   *
   * @type {Object} Pinia store 實例
   * @description 提供對全域圖層數據、設定狀態等的訪問權限
   */
  const dataStore = useDataStore();

  // ==================== 📊 響應式狀態定義 (Reactive State Definition) ====================

  /**
   * 📑 當前作用中的圖層分頁 (Active Layer Tab)
   * 追蹤使用者當前選中的圖層分頁，用於控制資訊內容顯示
   *
   * @type {Ref<string|null>}
   * @description
   * - 存儲當前選中圖層的 layerId
   * - null 表示沒有選中任何圖層
   * - 用於控制哪個圖層的資訊需要顯示
   */
  const activeLayerTab = ref(null);

  /**
   * 📊 分析結果 (Analysis Results)
   * 存儲圖層分析的結果數據，用於顯示統計資訊
   *
   * @type {Ref<Object|null>}
   * @description
   * - 包含圖層統計數據的物件
   * - null 表示尚未載入分析結果
   * - 結構包含 layerName, timestamp, statistics 等欄位
   */
  const analysisResults = ref(null);

  /**
   * 🔄 分析載入狀態 (Analysis Loading State)
   * 追蹤分析過程的載入狀態，用於顯示載入指示器
   *
   * @type {Ref<boolean>}
   * @description
   * - true: 正在載入分析結果，顯示載入動畫
   * - false: 載入完成，顯示分析結果或錯誤訊息
   */
  const isLoadingAnalysis = ref(false);

  // ==================== 📊 計算屬性定義 (Computed Properties Definition) ====================

  /**
   * 獲取所有可見且有資料的圖層 (Get All Visible Layers with Data)
   * 從全域狀態中篩選出可見且已載入資料的圖層
   *
   * @type {ComputedRef<Array>}
   * @description
   * - 返回包含所有可見圖層的陣列
   * - 用於生成分頁導航和圖層切換功能
   * - 每個圖層包含 layerId, layerName, dataTableData 等屬性
   * - 自動響應全域狀態變化
   *
   * @returns {Array<Object>} 可見圖層陣列
   */
  const visibleLayers = computed(() => {
    // 從數據存儲中獲取所有圖層
    const allLayers = dataStore.getAllLayers();
    // 篩選出可見的圖層（layer.visible === true）
    return allLayers.filter((layer) => layer.visible);
  });

  // ==================== 🎯 核心功能函數 (Core Function Functions) ====================

  /**
   * 📑 設定作用中圖層分頁 (Set Active Layer Tab)
   * 切換到指定的圖層分頁並觸發相關的資訊載入
   *
   * @param {string} layerId - 要切換到的圖層 ID
   * @description 更新 activeLayerTab 狀態，觸發圖層資訊載入
   */
  const setActiveLayerTab = (layerId) => {
    activeLayerTab.value = layerId;
  };

  /**
   * 📊 取得圖層完整標題 (包含群組名稱) (Get Layer Full Title with Group Name)
   * 組合群組名稱和圖層名稱，形成完整的圖層標題
   *
   * @param {Object} layer - 圖層物件
   * @returns {Object} 包含 groupName 和 layerName 的物件
   * @description
   * - 從 dataStore 中查找對應的群組名稱
   * - 返回結構化的標題資訊
   * - 處理圖層不存在的情況
   */
  const getLayerFullTitle = (layer) => {
    if (!layer) return { groupName: null, layerName: '未知圖層' };
    const groupName = dataStore.findGroupNameByLayerId(layer.layerId);
    return {
      groupName: groupName,
      layerName: layer.layerName,
    };
  };

  /**
   * 🎨 格式化顯示值 (Format Display Value)
   * 根據值的類型進行適當的格式化處理，避免顯示 [object Object]
   *
   * @param {any} value - 要格式化的值
   * @returns {string} 格式化後的顯示值
   * @description
   * - 處理基本類型：直接返回
   * - 處理陣列：格式化陣列內容
   * - 處理物件：轉換為 JSON 字串或顯示物件屬性
   * - 處理 null/undefined：顯示適當的預設值
   */
  const formatDisplayValue = (value) => {
    // 處理 null 或 undefined
    if (value === null || value === undefined) {
      return '無資料';
    }

    // 處理基本類型
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    // 處理陣列
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '空陣列';
      }

      // 檢查陣列內容是否為物件
      const hasObjects = value.some((item) => typeof item === 'object' && item !== null);

      if (hasObjects) {
        // 如果是物件陣列，顯示物件的主要屬性
        return value
          .map((item, index) => {
            if (typeof item === 'object' && item !== null) {
              // 嘗試顯示物件的主要屬性
              const keys = Object.keys(item);
              if (keys.length > 0) {
                const mainKey = keys[0];
                return `${index + 1}: ${mainKey}=${item[mainKey]}`;
              }
              return `${index + 1}: 物件`;
            }
            return String(item);
          })
          .join(', ');
      } else {
        // 基本類型陣列，直接連接
        return value.join(', ');
      }
    }

    // 處理物件
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return '空物件';
      }

      // 如果物件屬性較少，顯示所有屬性
      if (keys.length <= 3) {
        return keys.map((key) => `${key}: ${value[key]}`).join(', ');
      }

      // 如果物件屬性較多，顯示前幾個屬性
      const previewKeys = keys.slice(0, 2);
      return (
        previewKeys.map((key) => `${key}: ${value[key]}`).join(', ') +
        ` ... (共 ${keys.length} 個屬性)`
      );
    }

    // 其他類型，轉換為字串
    return String(value);
  };

  /**
   * 取得當前圖層配置資訊的條目（用於顯示）
   * 按照 dataStore.js 中的順序顯示所有欄位
   * Data 欄位和 function 欄位顯示「有資料」或「無資料」
   */
  const currentLayerConfigEntries = computed(() => {
    if (!activeLayerTab.value) return [];
    const currentLayer = visibleLayers.value.find(
      (layer) => layer.layerId === activeLayerTab.value
    );
    if (!currentLayer) return [];

    // 按照 dataStore.js 中的順序定義所有欄位
    const fieldsOrder = [
      'layerId',
      'layerName',
      'visible',
      'isLoading',
      'isLoaded',
      'colorName',
      'jsonData',
      'spaceNetworkGridJsonData',
      'spaceNetworkGridJsonData_SectionData',
      'spaceNetworkGridJsonData_ConnectData',
      'spaceNetworkGridJsonData_StationData',
      'geojsonData',
      'processedJsonData',
      'drawJsonData',
      'dashboardData',
      'dataTableData',
      'layerInfoData',
      'trafficData',
      'csvFileName_traffic',
      'csvLoader_Traffic',
      'jsonLoader',
      'geojsonLoader',
      'processToDrawData',
      'geojsonFileName',
      'osmFileName',
      'jsonFileName',
      'executeFunction',
      'isDataLayer',
      'hideFromMap',
      'display',
      'upperViewTabs',
    ];

    // Data 欄位和 function 欄位
    const dataAndFunctionFields = new Set([
      'jsonData',
      'spaceNetworkGridJsonData',
      'spaceNetworkGridJsonData_SectionData',
      'spaceNetworkGridJsonData_ConnectData',
      'spaceNetworkGridJsonData_StationData',
      'geojsonData',
      'processedJsonData',
      'drawJsonData',
      'dashboardData',
      'dataTableData',
      'layerInfoData',
      'trafficData',
      'jsonLoader',
      'geojsonLoader',
      'csvLoader_Traffic',
      'processToDrawData',
      'executeFunction',
    ]);

    return fieldsOrder
      .filter((key) => key in currentLayer)
      .map((key) => {
        let value = currentLayer[key];
        // Data 欄位和 function 欄位顯示「V」或「X」
        if (dataAndFunctionFields.has(key)) {
          value = value !== null && value !== undefined ? 'V' : 'X';
        } else if (typeof value === 'function') {
          value = value.name || '匿名函數';
        }
        return [key, value];
      });
  });

  /** 有站號或站名才視為有效（略過無站名，不顯示） */
  const isMeaningfulStation = (s) => {
    if (!s) return false;
    const id = (s.station_id ?? '').trim();
    const name = (s.station_name ?? '').trim();
    const idOk = id && id !== '—' && id !== '－';
    const nameOk = name && name !== '—' && name !== '－';
    return idOk || nameOk;
  };
  /** 車站標籤顯示：僅用於已過濾的有效項目，不顯示 "—"、不顯示（無站名） */
  const formatStationLabel = (s) => {
    if (!s || !isMeaningfulStation(s)) return '';
    const id = (s.station_id ?? '').trim();
    const name = (s.station_name ?? '').trim();
    const idOk = id && id !== '—' && id !== '－';
    const nameOk = name && name !== '—' && name !== '－';
    if (idOk && nameOk) return `${id} — ${name}`;
    return idOk ? id : name;
  };

  /**
   * 當前圖層的 spaceNetworkGridJsonData_SectionData（路段連線資料），供 LayerInfoTab 顯示
   */
  const connectDataForDisplay = computed(() => {
    if (!activeLayerTab.value) return null;
    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    return layer?.spaceNetworkGridJsonData_SectionData ?? null;
  });

  /**
   * 當前圖層的 spaceNetworkGridJsonData_ConnectData（交叉點資料：每筆所有屬性 + route_list），供 LayerInfoTab 顯示
   */
  const connectPointsForDisplay = computed(() => {
    if (!activeLayerTab.value) return null;
    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    return layer?.spaceNetworkGridJsonData_ConnectData ?? null;
  });

  /**
   * 當前圖層的 spaceNetworkGridJsonData_StationData（所有車站資料），供 LayerInfoTab 顯示
   */
  const stationDataForDisplay = computed(() => {
    if (!activeLayerTab.value) return null;
    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    return layer?.spaceNetworkGridJsonData_StationData ?? null;
  });

  /** taipei_h／taipei_i：由 csvLoader_Traffic 寫入之連結流量列 */
  const trafficDataForDisplay = computed(() => {
    if (!activeLayerTab.value) return null;
    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    return layer?.trafficData ?? null;
  });

  // ==================== 👀 響應式監聽器 (Reactive Watchers) ====================

  /**
   * 記錄上一次的圖層列表用於比較變化
   * 用於偵測新增的圖層並自動切換到最新圖層
   */
  const previousLayers = ref([]);

  /**
   * 👀 監聽可見圖層變化，自動切換到新開啟的圖層分頁
   * 當圖層可見性發生變化時，自動調整當前選中的分頁
   *
   * @description 主要邏輯：
   * - 偵測新增的圖層並自動切換到最新圖層
   * - 處理圖層被隱藏時的分頁切換
   * - 當沒有可見圖層時清除選中狀態
   * - 維護圖層列表的歷史記錄
   */
  watch(
    () => visibleLayers.value,
    (newLayers) => {
      // 如果沒有可見圖層，清除選中的分頁和分析結果
      if (newLayers.length === 0) {
        activeLayerTab.value = null;
        analysisResults.value = null;
        previousLayers.value = [];
        return;
      }

      // 找出新增的圖層（比較新舊圖層列表）
      const previousLayerIds = previousLayers.value.map((layer) => layer.layerId);
      const newLayerIds = newLayers.map((layer) => layer.layerId);
      const addedLayerIds = newLayerIds.filter((id) => !previousLayerIds.includes(id));

      // 如果有新增的圖層，自動切換到最新新增的圖層
      if (addedLayerIds.length > 0) {
        const newestAddedLayerId = addedLayerIds[addedLayerIds.length - 1];
        activeLayerTab.value = newestAddedLayerId;
      }
      // 如果當前沒有選中分頁，或選中的分頁不在可見列表中，選中第一個
      else if (
        !activeLayerTab.value ||
        !newLayers.find((layer) => layer.layerId === activeLayerTab.value)
      ) {
        activeLayerTab.value = newLayers[0].layerId;
      }

      // 更新記錄的圖層列表
      previousLayers.value = [...newLayers];
    },
    { deep: true, immediate: true }
  );

  // ==================== 📊 資料處理函數 (Data Processing Functions) ====================

  /**
   * 📊 載入圖層基本資訊 (Load Layer Basic Information)
   * 分析指定圖層的資料並計算統計資訊
   *
   * @param {Object} layer - 要載入資訊的圖層物件
   * @description 主要功能：
   * - 分析圖層中的 features 資料
   * - 計算總數量、總人口數、平均值等統計指標
   * - 提供載入狀態指示和錯誤處理
   * - 將結果存儲到 analysisResults 中
   */
  const loadLayerInfo = async (layer) => {
    // 優先使用 geojsonData，如果沒有則使用 processedJsonData
    const hasData = layer && (layer.geojsonData || layer.processedJsonData);
    if (!hasData) {
      console.warn('無法載入資訊：圖層數據不存在');
      return;
    }

    isLoadingAnalysis.value = true;

    try {
      // 模擬載入過程，提供視覺反饋
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 優先使用 geojsonData，如果沒有則使用 processedJsonData
      const geojsonData =
        layer.geojsonData ||
        (layer.processedJsonData && layer.processedJsonData.features
          ? layer.processedJsonData
          : null);
      if (!geojsonData || !geojsonData.features) {
        throw new Error('圖層沒有有效的 GeoJSON 數據');
      }

      const features = geojsonData.features;

      // 計算基本統計資訊
      const stats = {
        totalFeatures: features.length,
        totalPopulation: features.reduce((sum, f) => sum + (f.properties.P_CNT || 0), 0),
        totalCount: features.reduce((sum, f) => sum + (f.properties.count || 0), 0),
        avgPopulation: 0,
        avgCount: 0,
      };

      // 計算平均值（避免除零錯誤）
      if (stats.totalFeatures > 0) {
        stats.avgPopulation = stats.totalPopulation / stats.totalFeatures;
        stats.avgCount = stats.totalCount / stats.totalFeatures;
      }

      // 儲存分析結果
      analysisResults.value = {
        layerName: layer.layerName,
        timestamp: new Date().toLocaleString(),
        statistics: stats,
      };
    } catch (error) {
      console.error('載入圖層資訊失敗:', error);
      // 儲存錯誤資訊以供顯示
      analysisResults.value = {
        error: '載入過程中發生錯誤',
        details: error.message,
      };
    } finally {
      isLoadingAnalysis.value = false;
    }
  };

  /**
   * 👀 監聽當前選中的圖層變化，自動執行資訊載入
   * 當 activeLayerTab 發生變化時，自動載入對應圖層的資訊
   *
   * @description 主要邏輯：
   * - 當切換到新圖層時，自動載入該圖層的資訊
   * - 當清除選中狀態時，清除分析結果
   * - 確保圖層資訊與當前選中狀態保持同步
   */
  watch(
    () => activeLayerTab.value,
    (newLayerId) => {
      if (newLayerId) {
        const layer = dataStore.findLayerById(newLayerId);
        if (layer && layer.processedJsonData) {
          loadLayerInfo(layer);
        }
      } else {
        analysisResults.value = null;
      }
    },
    { immediate: true }
  );

  /**
   * 👀 監聽當前圖層的 processedJsonData 變化，確保即時更新顯示
   * 當圖層數據重新載入時，圖層資訊會自動更新
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      return layer ? layer.processedJsonData : null;
    },
    (newProcessedData) => {
      if (newProcessedData) {
        // 觸發響應式更新，讓圖層資訊重新渲染
        // Vue 會自動檢測到數據變化並重新渲染組件
      }
    },
    { deep: true }
  );

  /**
   * 👀 監聽當前圖層的 layoutGridJsonData/spaceNetworkGridJsonData/jsonData 變化，確保即時更新顯示
   * 當圖層資料被更新時，自動觸發響應式更新
   * 注意：taipei 圖層不使用 jsonData
   */
  watch(
    () => {
      if (!activeLayerTab.value) return null;
      const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
      if (!layer) return null;
      const isTaipeiLayer = layer.layerId?.startsWith('taipei_');
      return isTaipeiLayer
        ? layer.layoutGridJsonData || layer.spaceNetworkGridJsonData
        : layer.layoutGridJsonData || layer.spaceNetworkGridJsonData || layer.jsonData;
    },
    () => {
      // 觸發響應式更新，讓圖層資訊重新渲染
      // 通過訪問 currentLayerConfigEntries 來觸發 computed 重新計算
    },
    { deep: true, immediate: true }
  );

  // ==================== 🚀 生命週期鉤子 (Lifecycle Hooks) ====================

  /**
   * 🚀 組件掛載事件 (Component Mounted Event)
   * 組件初始化完成後的設定工作
   *
   * @description 主要工作：
   * - 初始化第一個可見圖層為作用中分頁
   * - 確保組件載入後有正確的初始狀態
   */
  onMounted(() => {
    // 初始化第一個可見圖層為作用中分頁
    if (visibleLayers.value.length > 0 && !activeLayerTab.value) {
      activeLayerTab.value = visibleLayers.value[0].layerId;
    }
  });
</script>

<template>
  <!-- 📊 圖層資訊分頁視圖組件 -->
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <!-- 📑 圖層分頁導航 -->
    <div v-if="visibleLayers.length > 0" class="">
      <ul class="nav nav-tabs nav-fill">
        <li
          v-for="layer in visibleLayers"
          :key="layer.layerId"
          class="nav-item d-flex flex-column align-items-center"
        >
          <!-- tab按鈕 -->
          <div
            class="btn nav-link rounded-0 border-0 position-relative d-flex align-items-center justify-content-center my-bgcolor-gray-200"
            :class="{
              active: activeLayerTab === layer.layerId,
            }"
            @click="setActiveLayerTab(layer.layerId)"
          >
            <span>
              <span v-if="getLayerFullTitle(layer).groupName" class="my-title-xs-gray"
                >{{ getLayerFullTitle(layer).groupName }} -
              </span>
              <span class="my-title-sm-black">{{ getLayerFullTitle(layer).layerName }}</span>
            </span>
          </div>
          <div class="w-100" :class="`my-bgcolor-${layer.colorName}`" style="min-height: 4px"></div>
        </li>
      </ul>
    </div>

    <!-- 有開啟圖層時的內容 -->
    <div v-if="visibleLayers.length > 0" class="my-bgcolor-white h-100">
      <div>
        <div class="p-3">
          <!-- 載入狀態區域 -->
          <div v-if="isLoadingAnalysis" class="pb-2">
            <div class="my-title-xs-gray pb-1">載入狀態</div>
            <div class="my-content-sm-black pb-1">
              <span v-html="getIconHtml('spinner', 'fa-spin me-2')"></span>
              正在載入圖層資訊...
            </div>
          </div>

          <!-- 圖層資訊顯示區域 -->
          <template v-if="visibleLayers.length > 0 && currentLayerConfigEntries.length > 0">
            <!-- 顯示圖層配置資訊（按照 dataStore.js 中的順序，Data 和 function 欄位顯示「有資料」或「無資料」） -->
            <div v-if="currentLayerConfigEntries.length > 0">
              <div v-for="[key, value] in currentLayerConfigEntries" :key="key" class="pb-2">
                <div class="my-title-xs-gray pb-1">{{ key }}</div>
                <div class="my-content-sm-black pb-1">
                  {{ formatDisplayValue(value) }}
                </div>
              </div>
            </div>

            <!-- spaceNetworkGridJsonData_SectionData 路段連線資料 -->
            <div
              v-if="connectDataForDisplay && connectDataForDisplay.length > 0"
              class="pt-3 mt-3 border-top"
            >
              <div class="my-title-xs-gray pb-1">
                spaceNetworkGridJsonData_SectionData（路段連線）
              </div>
              <div class="my-content-sm-black">
                <div
                  v-for="(seg, idx) in connectDataForDisplay"
                  :key="idx"
                  class="mb-3 p-2 rounded border border-secondary bg-light"
                >
                  <div class="my-title-xs-gray">路段 {{ idx + 1 }}</div>
                  <div class="ps-2">
                    <div class="mb-1">
                      <strong>connect_start</strong> (紅點) — connect_number:
                      {{ seg.connect_start?.connect_number }}, station_id:
                      {{ seg.connect_start?.station_id }}, station_name:
                      {{ seg.connect_start?.station_name }}
                    </div>
                    <div class="mb-1">
                      <strong>connect_end</strong> (紅點) — connect_number:
                      {{ seg.connect_end?.connect_number }}, station_id:
                      {{ seg.connect_end?.station_id }}, station_name:
                      {{ seg.connect_end?.station_name }}
                    </div>
                    <div class="mb-1"><strong>station_list</strong> (黑點):</div>
                    <ul
                      v-if="seg.station_list?.filter(isMeaningfulStation).length"
                      class="list-unstyled ps-3 small"
                    >
                      <li v-for="(s, i) in seg.station_list.filter(isMeaningfulStation)" :key="i">
                        {{ formatStationLabel(s) }}
                      </li>
                    </ul>
                    <div v-else class="ps-3 text-muted">無</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- spaceNetworkGridJsonData_ConnectData 交叉點資料（每筆所有屬性 + route_list） -->
            <div
              v-if="connectPointsForDisplay && connectPointsForDisplay.length > 0"
              class="pt-3 mt-3 border-top"
            >
              <div class="my-title-xs-gray pb-1">
                spaceNetworkGridJsonData_ConnectData（交叉點）
              </div>
              <div class="my-content-sm-black">
                <div
                  v-for="(pt, idx) in connectPointsForDisplay"
                  :key="idx"
                  class="mb-3 p-2 rounded border border-secondary bg-light"
                >
                  <div class="my-title-xs-gray">交叉點 {{ idx + 1 }}</div>
                  <div class="ps-2">
                    <div class="mb-1">
                      <strong>屬性</strong> — connect_number: {{ pt.connect_number }}, x_grid:
                      {{ pt.x_grid }}, y_grid: {{ pt.y_grid }}, station_id: {{ pt.station_id }},
                      station_name: {{ pt.station_name }}
                    </div>
                    <div class="mb-1">
                      <strong>route_list</strong> (所連結路線):
                      {{ (pt.route_list || []).join(', ') || '無' }}
                    </div>
                    <details
                      v-if="Object.keys(pt).filter((k) => k !== 'route_list').length > 0"
                      class="mt-1 small"
                    >
                      <summary class="text-muted">完整屬性</summary>
                      <pre class="ps-2 mt-1 mb-0 small text-break">{{
                        JSON.stringify({ ...pt, route_list: pt.route_list }, null, 2)
                      }}</pre>
                    </details>
                  </div>
                </div>
              </div>
            </div>

            <!-- spaceNetworkGridJsonData_StationData 所有車站資料，略過無站名 -->
            <div
              v-if="
                stationDataForDisplay &&
                stationDataForDisplay.filter(isMeaningfulStation).length > 0
              "
              class="pt-3 mt-3 border-top"
            >
              <div class="my-title-xs-gray pb-1">spaceNetworkGridJsonData_StationData（車站）</div>
              <div class="my-content-sm-black">
                <ul class="list-unstyled mb-0">
                  <li
                    v-for="(s, idx) in stationDataForDisplay.filter(isMeaningfulStation)"
                    :key="idx"
                    class="mb-1 ps-2 small"
                  >
                    {{ formatStationLabel(s) }}
                  </li>
                </ul>
              </div>
            </div>

            <!-- trafficData（taipei_h／taipei_i：捷運連結流量 CSV；含 csvFileName） -->
            <div
              v-if="
                trafficDataForDisplay &&
                (trafficDataForDisplay.csvFileName || trafficDataForDisplay.rows?.length)
              "
              class="pt-3 mt-3 border-top"
            >
              <div class="my-title-xs-gray pb-1">trafficData（連結流量 CSV）</div>
              <div v-if="trafficDataForDisplay.csvFileName" class="my-content-sm-black small mb-2">
                <span class="text-muted">csvFileName：</span>{{ trafficDataForDisplay.csvFileName }}
              </div>
              <div v-if="trafficDataForDisplay.rows?.length" class="my-content-sm-black small mb-2">
                共 {{ trafficDataForDisplay.rowCount }} 筆 undirected 連結
              </div>
              <ul
                v-if="trafficDataForDisplay.rows?.length"
                class="list-unstyled mb-0 small text-break"
              >
                <li
                  v-for="(row, idx) in trafficDataForDisplay.rows.slice(0, 40)"
                  :key="idx"
                  class="mb-1 ps-2"
                >
                  {{ row['站點A'] }} — {{ row['站點B'] }}：{{ row['總人次'] }}
                </li>
              </ul>
              <div v-if="trafficDataForDisplay.rows?.length > 40" class="text-muted small mt-1">
                …其餘 {{ trafficDataForDisplay.rows.length - 40 }} 筆省略
              </div>
            </div>
          </template>

          <!-- 錯誤顯示 -->
          <div v-else-if="analysisResults && analysisResults.error" class="pb-2">
            <div class="my-title-xs-gray pb-1">載入錯誤</div>
            <div class="my-content-sm-black pb-1">{{ analysisResults.error }}</div>
            <div v-if="analysisResults.details" class="my-content-xs-gray pb-1">
              詳細信息：{{ analysisResults.details }}
            </div>
          </div>

          <!-- 初始狀態 -->
          <div v-else-if="!isLoadingAnalysis" class="pb-2">
            <div class="my-title-xs-gray pb-1">載入狀態</div>
            <div class="my-content-sm-black pb-1">等待圖層數據載入...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 沒有開啟圖層時的空狀態 -->
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <div class="my-title-md-gray p-3">沒有開啟的圖層</div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
