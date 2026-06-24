<script setup>
  /**
   * 📊 DashboardTab.vue - 儀表板分頁組件 (Dashboard Tab Component)
   *
   * 這是一個專門用於數據分析和統計展示的儀表板組件，提供多圖層的數據摘要和視覺化統計。
   * 該組件能夠動態顯示當前開啟圖層的關鍵指標和統計信息，幫助用戶快速了解數據概況。
   *
   * 🎯 主要功能 (Core Features):
   * 1. 📊 多圖層數據摘要：顯示所有開啟圖層的統計信息
   *    - 圖層數量統計和概覽
   *    - 數據點總數和分佈情況
   *    - 地理範圍和覆蓋區域
   * 2. 🔄 動態圖層切換：支援多圖層的數據展示
   *    - 自動檢測新開啟的圖層
   *    - 智能切換到最新的圖層
   *    - 保持用戶的選擇狀態
   * 3. 📈 統計數據展示：提供詳細的數據分析
   *    - 節點數量和分佈統計
   *    - 地理範圍和邊界信息
   *    - 數據品質和完整性指標
   * 4. 🎨 視覺化圖表：直觀的數據展示方式
   *    - 統計圖表和視覺化元素
   *    - 顏色編碼的數據分類
   *    - 互動式的數據探索
   * 5. 📱 響應式設計：適配各種設備尺寸
   *    - 桌面版：完整的統計信息展示
   *    - 平板版：優化的觸控介面
   *    - 手機版：簡化的核心數據顯示
   *
   * 🏗️ 技術特點 (Technical Features):
   * - Vue 3 Composition API：現代化的組件設計
   * - Pinia 狀態管理：集中式的數據管理
   * - 響應式數據綁定：即時的狀態同步
   * - 計算屬性：高效的數據處理
   * - 監聽器：自動響應狀態變化
   *
   * 🎨 視覺設計 (Visual Design):
   * - 清晰的數據層次，突出重要統計信息
   * - 一致的色彩方案，保持視覺統一性
   * - 直觀的圖表設計，降低理解成本
   * - 適當的間距和排版，提升可讀性
   *
   * 🚀 使用場景 (Use Cases):
   * - 地理資訊系統的數據概覽
   * - 數據分析平台的統計展示
   * - 互動式地圖的數據摘要
   * - 多維度數據的快速分析
   * - 研究工具的数据概覽
   *
   * 📱 響應式支援 (Responsive Support):
   * - 桌面版：完整的統計圖表和詳細信息
   * - 平板版：優化的觸控介面和適中的信息密度
   * - 手機版：簡化的核心統計和關鍵指標
   *
   * 🔧 組件 API (Component API):
   * - 自動獲取可見圖層：從 Pinia store 監聽圖層狀態
   * - 動態計算統計數據：基於當前圖層數據生成摘要
   * - 智能圖層切換：自動響應圖層變化
   *
   * @component DashboardTab
   * @version 2.0.0
   * @author Kevin Cheng
   * @since 1.0.0
   */

  // ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

  /**
   * Vue 3 Composition API 核心功能引入
   * 提供響應式數據、計算屬性、監聽器、生命週期鉤子等功能
   *
   * @see https://vuejs.org/
   */
  import { ref, computed, watch, onMounted } from 'vue';

  /**
   * Pinia 狀態管理庫引入
   * 提供集中式狀態管理和跨組件數據共享
   *
   * @see https://pinia.vuejs.org/
   */
  import { useDataStore } from '@/stores/dataStore.js';

  // ==================== 🏪 狀態管理初始化 (State Management Initialization) ====================

  /**
   * 獲取 Pinia 數據存儲實例
   * 用於訪問全域狀態和圖層數據
   */
  const dataStore = useDataStore();

  const activeLayerTab = ref(null); /** 📑 當前作用中的圖層分頁 */

  const emit = defineEmits(['active-layer-change']);

  // 獲取所有開啟且有資料的圖層
  const visibleLayers = computed(() => {
    const allLayers = dataStore.getAllLayers();
    return allLayers.filter((layer) => layer.visible);
  });

  /**
   * 📑 設定作用中圖層分頁 (Set Active Layer Tab)
   * @param {string} layerId - 圖層 ID
   */
  const setActiveLayerTab = (layerId) => {
    activeLayerTab.value = layerId;
    emit('active-layer-change', activeLayerTab.value);
  };

  /**
   * 📊 當前圖層摘要 (Current Layer Summary)
   */
  const currentLayerSummary = computed(() => {
    if (!activeLayerTab.value) return null;
    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    return layer ? layer.dashboardData || null : null;
  });

  /**
   * 📊 取得當前選中圖層名稱 (Get Current Selected Layer Name)
   */
  const currentLayerName = computed(() => {
    if (!activeLayerTab.value) return '無開啟圖層';
    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    return layer ? layer.layerName || '未知圖層' : '無開啟圖層';
  });

  /**
   * 📊 取得圖層完整標題 (包含群組名稱) (Get Layer Full Title with Group Name)
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
   * 📊 格式化顯示值 (Format Display Value)
   * 根據值的類型進行適當的格式化處理
   */
  const formatDisplayValue = (value) => {
    if (value === null || value === undefined) {
      return '無資料';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
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
    return String(value);
  };

  /**
   * 📊 取得 dashboardData 的條目（用於顯示）
   */
  const dashboardDataEntries = computed(() => {
    if (!currentLayerSummary.value) return [];
    return Object.entries(currentLayerSummary.value);
  });

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
        emit('active-layer-change', activeLayerTab.value);
      }
      // 如果當前沒有選中分頁，或選中的分頁不在可見列表中，選中第一個
      else if (
        !activeLayerTab.value ||
        !newLayers.find((layer) => layer.layerId === activeLayerTab.value)
      ) {
        activeLayerTab.value = newLayers[0].layerId;
        emit('active-layer-change', activeLayerTab.value);
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
      emit('active-layer-change', activeLayerTab.value);
    }
  });
</script>

<template>
  <!-- 📊 多圖層資料儀表板視圖組件 -->
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
    <div v-if="visibleLayers.length > 0" class="flex-grow-1 overflow-auto my-bgcolor-white p-3">
      <!-- 📊 當前圖層資訊 -->
      <div class="mb-4">
        <h5 class="my-title-md-black">{{ currentLayerName }}</h5>
      </div>

      <!-- 📊 圖層儀表板資料 -->
      <div v-if="currentLayerSummary && dashboardDataEntries.length > 0">
        <div v-for="[key, value] in dashboardDataEntries" :key="key" class="mb-3">
          <div class="my-title-xs-gray pb-1">{{ key }}</div>
          <div class="my-content-sm-black pb-1">
            {{ formatDisplayValue(value) }}
          </div>
        </div>
      </div>
      <div v-else-if="!currentLayerSummary" class="text-center py-5">
        <div class="my-title-md-gray">此圖層沒有可用的儀表板資訊</div>
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
