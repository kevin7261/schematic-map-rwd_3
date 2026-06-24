<script setup>
  /**
   * 📄 ProcessedJsonDataTab.vue - 處理後 JSON 數據分頁組件 (Processed JSON Data Tab Component)
   *
   * 這是一個專門用於顯示圖層處理後 JSON 數據的組件，提供多圖層的 JSON 數據查看功能。
   * 該組件能夠動態顯示當前開啟圖層的處理後 JSON 數據，幫助用戶查看和檢查處理後的數據結構。
   *
   * 🎯 主要功能 (Core Features):
   * 1. 📄 處理後 JSON 數據顯示：顯示圖層的處理後 JSON 數據 (processedJsonData)
   *    - 格式化 JSON 字符串顯示
   *    - 支持多圖層切換查看
   *    - 自動檢測數據可用性
   * 2. 🔄 動態圖層切換：支援多圖層的數據展示
   *    - 自動檢測新開啟的圖層
   *    - 智能切換到最新的圖層
   *    - 保持用戶的選擇狀態
   * 3. 📊 數據結構查看：提供完整的 JSON 數據結構
   *    - 格式化顯示 JSON 數據
   *    - 支持大型數據集的顯示
   *    - 提供數據可用性狀態
   * 4. 🎨 視覺化展示：直觀的數據展示方式
   *    - 清晰的代碼格式
   *    - 適當的縮進和換行
   *    - 易於閱讀的數據結構
   * 5. 📱 響應式設計：適配各種設備尺寸
   *    - 桌面版：完整的 JSON 數據顯示
   *    - 平板版：優化的觸控介面
   *    - 手機版：簡化的數據顯示
   *
   * 🏗️ 技術特點 (Technical Features):
   * - Vue 3 Composition API：現代化的組件設計
   * - Pinia 狀態管理：集中式的數據管理
   * - 響應式數據綁定：即時的狀態同步
   * - 計算屬性：高效的數據處理
   * - 監聽器：自動響應狀態變化
   *
   * 🎨 視覺設計 (Visual Design):
   * - 清晰的數據層次，突出 JSON 結構
   * - 一致的色彩方案，保持視覺統一性
   * - 直觀的代碼顯示，降低理解成本
   * - 適當的間距和排版，提升可讀性
   *
   * 🚀 使用場景 (Use Cases):
   * - 地理資訊系統的處理後數據查看
   * - 數據分析平台的數據結構檢查
   * - 互動式地圖的處理後數據查看
   * - 多維度數據的結構分析
   * - 研究工具的數據檢查
   *
   * @component ProcessedJsonDataTab
   * @version 1.0.0
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

  // Props (defined for consistency with parent component, but not used in this component)
  defineProps({
    containerHeight: {
      type: Number,
      default: 600,
    },
    isPanelDragging: {
      type: Boolean,
      default: false,
    },
    activeMarkers: {
      type: Array,
      default: () => [],
    },
  });

  // 獲取所有開啟且有資料的圖層
  const visibleLayers = computed(() => {
    const allLayers = dataStore.getAllLayers();
    return allLayers.filter((layer) => layer.visible && layer.processedJsonData);
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
   * 📊 當前圖層的處理後 JSON 數據 (Current Layer Processed JSON Data)
   */
  const currentLayerProcessedJsonData = computed(() => {
    if (!activeLayerTab.value) return null;
    const layer = visibleLayers.value.find((l) => l.layerId === activeLayerTab.value);
    return layer ? layer.processedJsonData || null : null;
  });

  /**
   * 📊 格式化後的 JSON 字符串 (Formatted JSON String)
   */
  const formattedJsonString = computed(() => {
    if (!currentLayerProcessedJsonData.value) return null;
    try {
      return JSON.stringify(currentLayerProcessedJsonData.value, null, 2);
    } catch (error) {
      console.error('格式化 JSON 數據時發生錯誤:', error);
      return String(currentLayerProcessedJsonData.value);
    }
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
  <!-- 📄 多圖層處理後 JSON 數據視圖組件 -->
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
    <div v-if="visibleLayers.length > 0" class="flex-grow-1 overflow-auto my-bgcolor-white">
      <!-- 📊 當前圖層資訊 -->
      <div class="p-3 border-bottom">
        <h5 class="my-title-md-black">{{ currentLayerName }}</h5>
        <div class="my-title-xs-gray">處理後 JSON 數據 (processedJsonData)</div>
      </div>

      <!-- 📄 JSON 數據顯示區域 -->
      <div v-if="formattedJsonString" class="p-3">
        <pre class="my-content-sm-black" style="white-space: pre-wrap; word-wrap: break-word">{{
          formattedJsonString
        }}</pre>
      </div>
      <div v-else-if="currentLayerProcessedJsonData === null" class="p-3 text-center">
        <div class="my-title-md-gray py-5">此圖層沒有可用的處理後 JSON 數據</div>
      </div>
    </div>

    <!-- 沒有開啟圖層時的空狀態 -->
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <div class="my-title-md-gray p-3">沒有開啟的圖層或沒有處理後 JSON 數據</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  pre {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 1rem;
    margin: 0;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    overflow-x: auto;
  }
</style>
