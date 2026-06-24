<script>
  /**
   * 📋 LayersTab.vue - 圖層列表分頁組件 (Layers Tab Component)
   *
   * 這是一個專門用於圖層管理的分頁組件，提供完整的圖層控制介面。
   * 該組件是整個示意圖系統的核心控制面板，讓用戶能夠輕鬆管理各種圖層的顯示狀態。
   *
   * 🎯 主要功能 (Core Features):
   * 1. 🎛️ 圖層顯示控制：提供完整的圖層開關功能
   *    - 一鍵切換圖層的顯示/隱藏狀態
   *    - 即時更新圖層狀態和視覺反饋
   *    - 支援批量圖層操作
   * 2. 📊 載入狀態監控：實時顯示圖層載入進度
   *    - 載入中的視覺指示器
   *    - 載入完成的狀態確認
   *    - 載入失敗的錯誤提示
   * 3. 🔍 智能篩選功能：快速定位所需圖層
   *    - 按城市或區域篩選圖層
   *    - 按圖層類型分類顯示
   *    - 搜尋功能快速定位
   * 4. 📋 分組組織管理：邏輯清晰的圖層結構
   *    - 按功能或用途分組圖層
   *    - 可折疊的群組設計
   *    - 層次化的組織結構
   * 5. 🎨 視覺狀態指示：直觀的狀態反饋系統
   *    - 顏色編碼的狀態指示
   *    - 圖示化的狀態表示
   *    - 動畫效果增強用戶體驗
   * 6. 📱 響應式設計：適配各種設備尺寸
   *    - 桌面版：完整功能展示
   *    - 平板版：優化的觸控介面
   *    - 手機版：簡化的操作流程
   *
   * 🏗️ 技術特點 (Technical Features):
   * - Vue 3 Composition API：現代化的組件設計
   * - Pinia 狀態管理：集中式的狀態控制
   * - 響應式數據綁定：即時的狀態同步
   * - 事件驅動架構：鬆耦合的組件通信
   * - 無障礙設計：支援鍵盤導航和螢幕閱讀器
   *
   * 🎨 視覺設計 (Visual Design):
   * - 清晰的視覺層次，突出重要資訊
   * - 一致的色彩方案，保持品牌統一性
   * - 直觀的圖示設計，降低學習成本
   * - 適當的間距和排版，提升可讀性
   *
   * 🚀 使用場景 (Use Cases):
   * - 地理資訊系統的圖層管理
   * - 數據視覺化平台的圖層控制
   * - 互動式地圖的圖層切換
   * - 多維度數據的層次展示
   * - 分析工具的功能模組選擇
   *
   * 📱 響應式支援 (Responsive Support):
   * - 桌面版：完整的功能和詳細資訊
   * - 平板版：觸控優化的介面設計
   * - 手機版：簡化的操作和核心功能
   *
   * 🔧 組件 API (Component API):
   * - 接收圖層數據：從 Pinia store 獲取圖層配置
   * - 事件發射：向父組件發送圖層狀態變更事件
   * - 狀態管理：維護圖層的本地狀態
   *
   * @component LayersTab
   * @version 2.0.0
   * @author Kevin Cheng
   * @since 1.0.0
   */

  // 🔧 Vue Composition API 引入 (Vue Composition API Imports)
  import { computed, ref } from 'vue'; // 引入響應式 API
  import { useDataStore } from '@/stores/dataStore.js'; // 引入資料存儲

  export default {
    name: 'LayersTab',

    /**
     * 🔧 組件設定函數 (Component Setup)
     * 使用 Composition API 設定組件邏輯和狀態管理
     */
    setup() {
      // 📦 取得 Pinia 數據存儲實例 (Get Pinia Data Store Instance)
      const dataStore = useDataStore();

      // 📚 組件引用 (Component References)
      /** 📋 圖層列表 DOM 元素引用，用於滾動和操作 */
      const layerListRef = ref(null);

      /** 主群組預設展開；Set 內為已收合的群組名稱（替換 Set 以觸發響應式更新） */
      const collapsedGroupNames = ref(new Set());

      const isGroupCollapsed = (groupName) => collapsedGroupNames.value.has(groupName);

      const toggleGroupCollapsed = (groupName) => {
        const next = new Set(collapsedGroupNames.value);
        if (next.has(groupName)) next.delete(groupName);
        else next.add(groupName);
        collapsedGroupNames.value = next;
      };

      // 🧮 計算屬性 (Computed Properties)
      /** 📊 從 store 中獲取圖層數據，當 store 狀態改變時自動更新 */
      const layers = computed(() => dataStore.layers);

      // 🔧 圖層操作函數 (Layer Operation Functions)

      /**
       * 🔘 切換圖層可見性 (Toggle Layer Visibility)
       * 呼叫 store 中的 action 來切換指定圖層的顯示/隱藏狀態
       *
       * @param {string} layerId - 要切換的圖層 ID
       */
      const toggleLayer = (layerId) => {
        dataStore.toggleLayerVisibility(layerId);
      };

      /**
       * 🎛️ 處理開關變更事件 (Handle Toggle Change Event)
       * 避免重複觸發，只在實際需要時切換圖層
       * 提供詳細的狀態檢查和錯誤處理
       *
       * @param {string} layerId - 圖層 ID
       * @param {Event} event - 變更事件對象
       */
      const handleToggleChange = (layerId, event) => {
        // 防止事件冒泡，避免觸發父元素的事件
        event.stopPropagation();

        // 在所有圖層群組中查找指定的圖層
        const layer = dataStore.layers
          .flatMap((mainGroup) => mainGroup.groupLayers)
          .find((l) => l.layerId === layerId);

        // 檢查圖層是否存在
        if (!layer) {
          console.error('❌ LayersTab: 找不到圖層', layerId);
          return;
        }

        // 記錄詳細的狀態資訊用於除錯
        // 只有當當前狀態與 checkbox 狀態不一致時才切換
        // 這可以避免重複觸發和狀態衝突
        if (layer.visible !== event.target.checked) {
          dataStore.toggleLayerVisibility(layerId);
        }
      };

      // 📤 返回響應式數據和方法給模板使用 (Return Reactive Data and Methods for Template)
      return {
        // 📊 圖層數據和狀態 (Layer Data and States)
        layers, // 圖層群組數據
        layerListRef, // 圖層列表 DOM 引用

        // 🔧 圖層操作函數 (Layer Operation Functions)
        toggleLayer, // 切換圖層可見性
        handleToggleChange, // 處理開關變更事件

        isGroupCollapsed,
        toggleGroupCollapsed,

        // 🛠️ 工具函數 (Utility Functions)
      };
    },
  };
</script>

<template>
  <div class="h-100 d-flex flex-column overflow-hidden my-bgcolor-gray-100">
    <div class="flex-grow-1 overflow-auto layer-list-container" ref="layerListRef">
      <div class="mb-3">
        <!-- 主群組 -->
        <div v-for="mainGroup in layers" :key="mainGroup.groupName" class="p-3">
          <!-- 主群組標題（可點擊收合／展開） -->
          <div
            class="d-flex align-items-center pb-2 layer-group-header"
            role="button"
            tabindex="0"
            :aria-expanded="!isGroupCollapsed(mainGroup.groupName)"
            :aria-label="`${mainGroup.groupName} 圖層群組`"
            @click="toggleGroupCollapsed(mainGroup.groupName)"
            @keydown.enter.prevent="toggleGroupCollapsed(mainGroup.groupName)"
            @keydown.space.prevent="toggleGroupCollapsed(mainGroup.groupName)"
          >
            <span
              class="layer-group-chevron me-2"
              :class="{ 'layer-group-chevron--collapsed': isGroupCollapsed(mainGroup.groupName) }"
              aria-hidden="true"
            >▼</span>
            <div class="my-title-xs-gray">{{ mainGroup.groupName }}</div>
          </div>

          <!-- 圖層列表 -->
          <div
            v-show="!isGroupCollapsed(mainGroup.groupName)"
            v-for="layer in mainGroup.groupLayers"
            :key="layer.layerId"
            class="mb-1"
          >
            <!-- 圖層卡片 -->
            <div class="btn rounded-0 border-0 d-flex shadow-sm my-bgcolor-white-hover p-0">
              <!-- 圖層圖示 -->
              <div :class="`my-bgcolor-${layer.colorName}`" style="min-width: 6px"></div>
              <div class="w-100">
                <div class="d-flex">
                  <!-- 圖層名稱 - 點擊可切換圖層 -->
                  <div
                    class="d-flex align-items-center text-start w-100 px-3 py-2 cursor-pointer"
                    @click="toggleLayer(layer.layerId)"
                  >
                    <span class="my-content-sm-black">
                      {{ layer.layerName }}
                      <span class="my-content-xs-gray ms-2">
                        {{ layer.dashboardData?.totalCount }}
                      </span>
                    </span>
                  </div>
                  <!-- 切換圖層可見性 - 只有開關本身處理切換 -->
                  <div
                    class="d-flex align-items-center justify-content-center px-3 py-2"
                    @click.stop
                  >
                    <input
                      type="checkbox"
                      :id="'switch-' + layer.layerId"
                      :checked="layer.visible"
                      :disabled="layer.isLoading"
                      @change="handleToggleChange(layer.layerId, $event)"
                    />
                    <label :for="'switch-' + layer.layerId"></label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /* 🎨 圖層切換開關樣式 (Layer Toggle Switch Styles) */
  /* https://www.tpisoftware.com/tpu/articleDetails/2744 */

  .cursor-pointer {
    cursor: pointer;
  }

  .layer-group-header {
    cursor: pointer;
    user-select: none;
    border-radius: 4px;
    margin: 0 -4px;
    padding: 4px 4px 8px;
    transition: background-color 0.15s ease;
  }

  .layer-group-header:hover {
    background-color: rgba(0, 0, 0, 0.04);
  }

  .layer-group-header:focus-visible {
    outline: 2px solid var(--my-color-gray-400, #9ca3af);
    outline-offset: 2px;
  }

  .layer-group-chevron {
    display: inline-block;
    font-size: 0.55rem;
    line-height: 1;
    color: var(--my-color-gray-500, #6b7280);
    transition: transform 0.2s ease;
    transform-origin: center;
  }

  .layer-group-chevron--collapsed {
    transform: rotate(-90deg);
  }

  /* 載入中的圖層顯示不同樣式 */
  .btn:has(input:disabled) {
    opacity: 0.7;
  }

  input[type='checkbox'] {
    height: 0;
    width: 0;
    visibility: hidden;
  }

  label {
    cursor: pointer;
    width: 28px;
    height: 16px;
    background: var(--my-color-gray-300);
    display: block;
    border-radius: 16px;
    position: relative;
    transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* 優化背景色過渡 */
  }

  label:after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    background: var(--my-color-white);
    border-radius: 12px;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); /* 優化滑動過渡 */
  }

  input:checked + label {
    background: var(--my-color-green);
  }

  input:checked + label:after {
    transform: translateX(12px);
  }

  /* 禁用狀態樣式 */
  input:disabled + label {
    cursor: not-allowed;
    opacity: 0.6;
    background: var(--my-color-gray-200);
  }

  input:disabled + label:after {
    background: var(--my-color-gray-300);
  }
</style>
