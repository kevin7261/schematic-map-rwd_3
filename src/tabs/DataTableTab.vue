/** * 📊 多圖層資料表格分頁組件 (Multi-Layer Data Table Tab Component) * * 功能說明 (Features): * 1.
📋 多圖層資料表格顯示：支援同時顯示多個圖層的資料表格 * 2. 🔄
動態欄位偵測：根據資料內容自動偵測並顯示適合的欄位 * 3. 📊
排序功能：支援點擊欄位標題進行升序/降序排序 * 4. 🎯
項目點擊互動：點擊表格項目可觸發高亮顯示和屬性選擇 * 5. 📱 響應式設計：適配不同螢幕尺寸的顯示需求 *
6. 🎨 視覺化增強：特殊欄位（如顏色、節點數）提供視覺化顯示 * * 技術特點 (Technical Features): * -
使用 Vue 3 Composition API 進行狀態管理 * - 支援動態欄位生成和類型檢測 * - 實現多圖層分頁切換機制 *
- 提供完整的排序和篩選功能 * - 整合 Pinia 狀態管理系統 * * 支援的資料類型 (Supported Data Types): *
- 示意圖節點資料：color, name, nodes 等欄位 * - 地理空間資料：包含空間分析結果的各種屬性 * -
統計資料：人口統計、感染率等數值資料 * * @file DataTableTab.vue * @version 2.0.0 * @author Kevin
Cheng * @since 1.0.0 */
<script setup>
  // ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

  /**
   * Vue 3 Composition API 核心功能引入
   * 提供響應式數據、計算屬性、生命週期鉤子等功能
   *
   * @see https://vuejs.org/
   */
  import { ref, computed, defineEmits, onMounted, watch } from 'vue';

  /**
   * Pinia 狀態管理庫引入
   * 提供集中式狀態管理和跨組件數據共享
   *
   * @see https://pinia.vuejs.org/
   */
  import { useDataStore } from '@/stores/dataStore.js';
  import { getIcon } from '../utils/utils.js';

  // ==================== 📡 組件事件定義 (Component Events Definition) ====================

  /**
   * 定義組件向父組件發送的事件
   * 採用事件驅動模式，實現組件間的鬆耦合通信
   */
  const emit = defineEmits([
    'highlight-on-map', // 在地圖上高亮顯示指定項目
    'feature-selected', // 選中特徵事件，用於觸發屬性面板顯示
  ]);

  // ==================== 🏪 狀態管理初始化 (State Management Initialization) ====================

  /**
   * 獲取 Pinia 數據存儲實例
   * 用於訪問全域狀態和圖層數據
   */
  const dataStore = useDataStore();

  // ==================== 📊 響應式狀態定義 (Reactive State Definition) ====================

  /**
   * 📑 當前作用中的圖層分頁 (Active Layer Tab)
   * 追蹤使用者當前選中的圖層分頁，用於控制表格內容顯示
   *
   * @type {Ref<string|null>}
   * @description 存儲當前選中圖層的 layerId，null 表示沒有選中任何圖層
   */
  const activeLayerTab = ref(null);

  /**
   * 📊 每個圖層的排序狀態 (Layer Sort States)
   * 存儲每個圖層的排序配置，包括排序欄位和排序方向
   *
   * @type {Ref<Object>}
   * @description 物件結構：{ [layerId]: { key: string, order: 'asc'|'desc' } }
   */
  const layerSortStates = ref({});

  // ==================== 📊 計算屬性定義 (Computed Properties Definition) ====================

  /**
   * 獲取所有開啟且有資料的圖層 (Get All Visible Layers with Data)
   * 從全域狀態中篩選出可見且已載入資料的圖層
   *
   * @type {ComputedRef<Array>}
   * @description 返回包含所有可見圖層的陣列，用於生成分頁導航
   * @returns {Array<Object>} 可見圖層陣列，每個圖層包含 layerId, layerName, dataTableData 等屬性
   */
  const visibleLayers = computed(() => {
    // 從數據存儲中獲取所有圖層
    const allLayers = dataStore.getAllLayers();
    // 篩選出可見的圖層（layer.visible === true）
    return allLayers.filter((layer) => layer.visible);
  });

  // ==================== 🔧 核心功能函數定義 (Core Function Definitions) ====================

  /**
   * 📑 設定作用中圖層分頁 (Set Active Layer Tab)
   * 切換當前選中的圖層分頁，觸發表格內容更新
   *
   * @param {string} layerId - 要設為作用中的圖層唯一識別碼
   * @description 當使用者點擊圖層分頁標籤時調用此函數
   * @example setActiveLayerTab('data_layer') // 切換到數據圖層
   */
  const setActiveLayerTab = (layerId) => {
    activeLayerTab.value = layerId;
  };

  /**
   * 📊 取得圖層完整標題 (包含群組名稱) (Get Layer Full Title with Group Name)
   * 為圖層生成完整的顯示標題，包含群組名稱和圖層名稱
   *
   * @param {Object} layer - 圖層物件
   * @param {string} layer.layerId - 圖層唯一識別碼
   * @param {string} layer.layerName - 圖層名稱
   * @returns {Object} 包含群組名稱和圖層名稱的物件
   * @returns {string|null} returns.groupName - 群組名稱，可能為 null
   * @returns {string} returns.layerName - 圖層名稱，預設為 '未知圖層'
   * @description 用於在分頁標籤中顯示完整的圖層標題
   * @example getLayerFullTitle(layer) // { groupName: '數據圖層', layerName: '示意圖數據' }
   */
  const getLayerFullTitle = (layer) => {
    // 如果圖層不存在，返回預設值
    if (!layer) return { groupName: null, layerName: '未知圖層' };

    // 從數據存儲中查找圖層所屬的群組名稱
    const groupName = dataStore.findGroupNameByLayerId(layer.layerId);

    // 返回包含群組名稱和圖層名稱的物件
    return {
      groupName: groupName,
      layerName: layer.layerName,
    };
  };

  /**
   * 📊 動態獲取圖層表格欄位名稱 (Get Layer Table Column Names Dynamically)
   * 根據圖層資料內容自動偵測並生成適合在表格中顯示的欄位名稱
   *
   * 功能說明：
   * - 自動掃描所有資料項目，收集出現的欄位名稱
   * - 過濾掉不適合顯示的欄位（如複雜物件、函數等）
   * - 特別保留示意圖資料的基本欄位（color, name, nodes）
   * - 支援動態資料結構，適應不同類型的圖層資料
   *
   * @param {Object} layer - 圖層物件
   * @param {Array} layer.dataTableData - 圖層的表格資料陣列
   * @returns {string[]} 適合顯示的欄位名稱陣列
   * @description 用於動態生成表格標題行，確保只顯示有意義的欄位
   * @example getLayerColumns(layer) // ['#', 'color', 'name', 'nodes', 'count']
   */
  const getLayerColumns = (layer) => {
    // 使用原始資料而不是排序後的資料，避免因排序影響欄位偵測
    // 確保欄位偵測的穩定性和一致性
    const data = layer.dataTableData;

    // 如果沒有資料或資料為空，返回一個空陣列
    // 避免在空資料情況下進行無意義的處理
    if (!data || data.length === 0) {
      return [];
    }

    // 使用 Set 收集所有資料項目中出現的欄位名稱
    // Set 自動去重，確保每個欄位名稱只出現一次
    const allKeys = new Set();

    // 遍歷所有資料項目，收集欄位名稱
    data.forEach((item) => {
      // 獲取每個資料項目的所有屬性鍵
      Object.keys(item).forEach((key) => {
        const value = item[key];

        // 特別處理示意圖資料的基本欄位
        // 這些欄位即使包含複雜資料結構也需要顯示
        if (key === 'color' || key === 'name' || key === 'nodes') {
          allKeys.add(key);
        }
        // 過濾掉複雜物件，只保留基本資料類型
        // 確保表格顯示的資料是可讀的
        else if (typeof value !== 'object' || value === null) {
          allKeys.add(key);
        }
      });
    });

    // 將 Set 轉換為陣列
    const columns = Array.from(allKeys);

    // 過濾掉不需要顯示的欄位
    const hiddenColumns = ['id', 'segment_index', 'start_idx', 'end_idx', 'weight_index'];
    const filteredColumns = columns.filter((col) => !hiddenColumns.includes(col));

    return filteredColumns;
  };

  /**
   * 📊 取得圖層資料數量 (Get Layer Data Count)
   * 計算指定圖層的資料項目數量，用於在分頁標籤中顯示資料統計
   *
   * @param {Object} layer - 圖層物件
   * @param {string} layer.layerId - 圖層唯一識別碼
   * @param {string} layer.layerName - 圖層名稱
   * @param {Array} layer.dataTableData - 圖層的表格資料陣列
   * @returns {number} 資料項目數量，如果沒有資料則返回 0
   * @description 用於在分頁標籤中顯示資料數量，提供使用者即時的資料統計資訊
   * @example getLayerDataCount(layer) // 15 (表示該圖層有 15 筆資料)
   */
  const getLayerDataCount = (layer) => {
    // 使用可選鏈運算符安全地獲取資料長度，避免 undefined 錯誤
    const count = layer.dataTableData?.length || 0;

    // 記錄詳細的除錯資訊，用於開發和問題排查

    return count;
  };

  /**
   * 📊 取得排序後的資料 (Get Sorted Data)
   * 根據當前圖層的排序狀態對資料進行排序，支援多種資料類型的排序
   *
   * 功能說明：
   * - 支援數值欄位的數值排序（即使資料以字串形式儲存）
   * - 支援字串欄位的字典序排序
   * - 支援升序和降序排序
   * - 保持原始資料不變，返回排序後的副本
   *
   * @param {Object} layer - 圖層物件
   * @param {string} layer.layerId - 圖層唯一識別碼
   * @param {Array} layer.dataTableData - 圖層的表格資料陣列
   * @returns {Array} 排序後的資料陣列副本
   * @description 用於在表格中顯示按指定欄位和方向排序的資料
   * @example getSortedData(layer) // 返回按指定欄位排序的資料陣列
   */
  const getSortedData = (layer) => {
    // 如果圖層沒有資料，返回空陣列
    if (!layer.dataTableData) return [];

    // 獲取當前圖層的排序狀態
    const sortState = layerSortStates.value[layer.layerId];

    // 如果沒有排序狀態或沒有指定排序欄位，返回原始資料
    if (!sortState || !sortState.key) {
      return layer.dataTableData;
    }

    // 使用展開運算符創建資料副本，避免修改原始資料
    return [...layer.dataTableData].sort((a, b) => {
      // 獲取要比較的兩個值
      const aValue = a[sortState.key];
      const bValue = b[sortState.key];

      // 定義應該按數值排序的欄位（即使它們被儲存為字串）
      // 這些欄位通常包含統計數據或計數值
      const numericFields = [
        'count',
        'spatial_lag',
        '#',
        'P_CNT',
        '感染率(%)',
        'weight',
        'weight_與前站',
        'weight_與後站',
        'weight_差值',
      ];

      // 如果是數值欄位，強制轉換為數值進行排序
      if (numericFields.includes(sortState.key)) {
        // 使用 parseFloat 轉換為數值，轉換失敗時使用 0 作為預設值
        const aNum = parseFloat(aValue) || 0;
        const bNum = parseFloat(bValue) || 0;
        // 根據排序方向返回比較結果
        return sortState.order === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // 字串類型的比較，使用 localeCompare 進行本地化排序
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortState.order === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      // 一般數值類型的比較（用於純數值欄位）
      return sortState.order === 'asc' ? aValue - bValue : bValue - aValue;
    });
  };

  /**
   * 📊 處理排序點擊 (Handle Sort Click)
   * @param {string} layerId - 圖層 ID
   * @param {string} key - 排序欄位
   */
  const handleSort = (layerId, key) => {
    if (!layerSortStates.value[layerId]) {
      layerSortStates.value[layerId] = { key: null, order: 'asc' };
    }

    const sortState = layerSortStates.value[layerId];

    if (sortState.key === key) {
      // 切換排序方向
      sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
    } else {
      // 設定新的排序欄位
      sortState.key = key;
      sortState.order = 'asc';
    }
  };

  /**
   * 🎨 取得排序圖示 (Get Sort Icon)
   * @param {string} layerId - 圖層 ID
   * @param {string} key - 欄位名稱
   * @returns {string} FontAwesome 圖示類別
   */
  const getSortIcon = (layerId, key) => {
    const sortState = layerSortStates.value[layerId];
    if (!sortState || sortState.key !== key) {
      return getIcon('sort').icon;
    }
    return sortState.order === 'asc' ? getIcon('sort_up').icon : getIcon('sort_down').icon;
  };

  /**
   * 🎯 處理項目點擊 (Handle Item Click)
   * @param {Object} item - 點擊的項目
   * @param {Object} layer - 圖層物件
   */
  const handleItemClick = (item, layer) => {
    // 創建符合 PropertiesTab 期望的 feature 格式
    const feature = {
      properties: {
        id: item['#'] || item.id || 'unknown',
        layerId: layer.layerId,
        propertyData: { ...item },
        itemColor: item.color || '#6c757d',
      },
    };

    dataStore.setSelectedFeature(feature);

    // 觸發 feature-selected 事件，讓 HomeView 自動切換到屬性標籤
    emit('feature-selected', feature);
  };

  // 記錄上一次的圖層列表用於比較
  const previousLayers = ref([]);

  /**
   * 👀 監聽可見圖層變化，自動切換到新開啟的圖層分頁
   */
  watch(
    () => visibleLayers.value,
    (newLayers) => {
      // 如果沒有可見圖層，清除選中的分頁
      if (newLayers.length === 0) {
        activeLayerTab.value = null;
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

  /**
   * 🚀 組件掛載事件 (Component Mounted Event)
   */
  onMounted(() => {
    // 初始化第一個可見圖層為作用中分頁
    if (visibleLayers.value.length > 0 && !activeLayerTab.value) {
      activeLayerTab.value = visibleLayers.value[0].layerId;
    }
  });
</script>

<template>
  <!-- 📊 多圖層資料表格分頁組件 -->
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
            <span class="my-title-sm-black">
              <span v-if="getLayerFullTitle(layer).groupName" class="my-title-xs-gray"
                >{{ getLayerFullTitle(layer).groupName }} -
              </span>
              <span>{{ getLayerFullTitle(layer).layerName }}</span>
              <span class="my-content-xs-gray ms-2" v-if="getLayerDataCount(layer)">
                {{ getLayerDataCount(layer) }}
              </span>
            </span>
          </div>
          <div class="w-100" :class="`my-bgcolor-${layer.colorName}`" style="min-height: 4px"></div>
        </li>
      </ul>
    </div>

    <!-- 📋 圖層表格內容區域 -->
    <div v-if="visibleLayers.length > 0" class="flex-grow-1 overflow-hidden">
      <div
        v-for="layer in visibleLayers"
        :key="layer.layerId"
        v-show="activeLayerTab === layer.layerId"
        class="h-100"
      >
        <div class="h-100 d-flex flex-column">
          <div class="flex-grow-1 overflow-auto">
            <table class="table w-100 mb-0">
              <thead class="sticky-top my-table-thead">
                <tr class="text-center text-nowrap">
                  <template v-for="column in getLayerColumns(layer)" :key="column">
                    <th
                      v-if="!column.endsWith('_color')"
                      @click="handleSort(layer.layerId, column)"
                      class="my-bgcolor-white-hover p-1 my-cursor-pointer"
                    >
                      <span class="my-title-xs-gray text-nowrap">
                        {{ column === 'nodes' ? '節點數' : column }}
                      </span>
                      <span class="my-title-xs-gray text-nowrap ms-2">
                        <i :class="getSortIcon(layer.layerId, column)"></i>
                      </span>
                    </th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in getSortedData(layer)"
                  :key="`${layer.layerId}-${item['#'] ?? item.id ?? ''}-${item.start_idx ?? ''}-${item.end_idx ?? ''}`"
                  class="my-table-tr-hover text-center text-nowrap border-bottom my-cursor-pointer"
                  @click="handleItemClick(item, layer)"
                >
                  <template v-for="column in getLayerColumns(layer)" :key="column">
                    <td
                      v-if="!column.endsWith('_color')"
                      class="border-0 text-nowrap text-truncate p-0"
                      style="max-width: 80px"
                    >
                      <!-- 特殊處理：color 欄位顯示顏色圓點 -->
                      <div
                        v-if="column === 'color'"
                        class="d-flex align-items-center justify-content-center px-3 py-2"
                      >
                        <div
                          class="rounded-circle me-2"
                          style="width: 12px; height: 12px; flex-shrink: 0"
                          :style="{
                            backgroundColor: item[column],
                          }"
                          :title="item[column]"
                        ></div>
                        <div class="my-content-xs-black">
                          {{ item[column] || '-' }}
                        </div>
                      </div>
                      <!-- 特殊處理：nodes 欄位顯示節點數量 -->
                      <div v-else-if="column === 'nodes'" class="my-content-xs-black px-3 py-2">
                        {{ Array.isArray(item[column]) ? item[column].length : '-' }}
                      </div>
                      <!-- 特殊處理：xRowMinMax 欄位顯示 x 排最大值最小值 -->
                      <div
                        v-else-if="column === 'xRowMinMax'"
                        class="my-content-xs-black px-3 py-2"
                      >
                        <div class="d-flex flex-column">
                          <div>最小值: {{ item[column]?.min || '-' }}</div>
                          <div>最大值: {{ item[column]?.max || '-' }}</div>
                        </div>
                      </div>
                      <!-- 特殊處理：yRowMinMax 欄位顯示 y 排最大值最小值 -->
                      <div
                        v-else-if="column === 'yRowMinMax'"
                        class="my-content-xs-black px-3 py-2"
                      >
                        <div class="d-flex flex-column">
                          <div>最小值: {{ item[column]?.min || '-' }}</div>
                          <div>最大值: {{ item[column]?.max || '-' }}</div>
                        </div>
                      </div>
                      <!-- 特殊處理：overallStats 欄位顯示整體統計 -->
                      <div
                        v-else-if="column === 'overallStats'"
                        class="my-content-xs-black px-3 py-2"
                      >
                        <div class="d-flex flex-column">
                          <div>最小值: {{ item[column]?.min || '-' }}</div>
                          <div>最大值: {{ item[column]?.max || '-' }}</div>
                          <div>平均: {{ item[column]?.avg || '-' }}</div>
                        </div>
                      </div>
                      <!-- 特殊處理：name 欄位 -->
                      <div v-else-if="column === 'name'" class="my-content-xs-black px-3 py-2">
                        {{ item[column] || '-' }}
                      </div>
                      <!-- 特殊處理：route_name 欄位顯示顏色圓點在名稱前面 -->
                      <div
                        v-else-if="column === 'route_name'"
                        class="d-flex align-items-center justify-content-center px-3 py-2"
                      >
                        <div
                          v-if="item['route_color']"
                          class="rounded-circle me-2"
                          style="width: 12px; height: 12px; flex-shrink: 0"
                          :style="{
                            backgroundColor: item['route_color'],
                          }"
                          :title="item['route_color']"
                        ></div>
                        <div class="my-content-xs-black">
                          {{ item[column] || '-' }}
                        </div>
                      </div>
                      <div v-else-if="column === '#'" class="d-flex p-0">
                        <div
                          style="min-width: 6px"
                          :style="{
                            backgroundColor: item['color'],
                          }"
                        ></div>
                        <div class="my-content-xs-black w-100 px-3 py-2">
                          {{ item[column] ?? '-' }}
                        </div>
                      </div>
                      <!-- 特殊處理：spatial_lag 欄位顯示顏色圓點在數字前面 -->
                      <div
                        v-else-if="column === 'spatial_lag'"
                        class="d-flex align-items-center justify-content-center px-3 py-2"
                      >
                        <div
                          v-if="item['spatial_lag_color']"
                          class="rounded-circle me-2"
                          style="width: 12px; height: 12px; flex-shrink: 0"
                          :style="{
                            backgroundColor: item['spatial_lag_color'],
                          }"
                          :title="item['spatial_lag_color']"
                        ></div>
                        <div class="my-content-xs-black">
                          {{
                            typeof item[column] === 'number'
                              ? item[column].toFixed(2)
                              : item[column] || '-'
                          }}
                        </div>
                      </div>
                      <!-- 特殊處理：binaryValue 欄位顯示顏色圓點在數字前面 -->
                      <div
                        v-else-if="column === 'binaryValue'"
                        class="d-flex align-items-center justify-content-center px-3 py-2"
                      >
                        <div
                          v-if="item['joinCounts_color']"
                          class="rounded-circle me-2"
                          style="width: 12px; height: 12px; flex-shrink: 0"
                          :style="{
                            backgroundColor: item['joinCounts_color'],
                          }"
                          :title="item['joinCounts_color']"
                        ></div>
                        <div class="my-content-xs-black">
                          {{ item[column] }}
                        </div>
                      </div>
                      <!-- 特殊處理：count 欄位顯示顏色圓點在數字前面 -->
                      <div
                        v-else-if="column === 'count'"
                        class="d-flex align-items-center justify-content-center px-3 py-2"
                      >
                        <div
                          v-if="item['color']"
                          class="rounded-circle me-2"
                          style="width: 12px; height: 12px; flex-shrink: 0"
                          :style="{
                            backgroundColor: item['color'],
                          }"
                          :title="item['color']"
                        ></div>
                        <div class="my-content-xs-black">
                          {{ item[column] }}
                        </div>
                      </div>
                      <!-- 特殊處理：感染率(%) 欄位顯示顏色圓點在數字前面 -->
                      <div
                        v-else-if="column === '感染率(%)'"
                        class="d-flex align-items-center justify-content-center px-3 py-2"
                      >
                        <div
                          v-if="item['infection_rate_color']"
                          class="rounded-circle me-2"
                          style="width: 12px; height: 12px; flex-shrink: 0"
                          :style="{
                            backgroundColor: item['infection_rate_color'],
                          }"
                          :title="item['infection_rate_color']"
                        ></div>
                        <div class="my-content-xs-black">
                          {{ item[column] || '-' }}
                        </div>
                      </div>
                      <div v-else class="my-content-xs-black px-3 py-2">
                        {{ item[column] ?? '-' }}
                      </div>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- 📭 無開啟圖層的空狀態 -->
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <div class="my-title-md-gray p-3">沒有開啟的圖層</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .my-table-thead {
    border-bottom: 2px solid var(--my-color-gray-300) !important;
  }
</style>
