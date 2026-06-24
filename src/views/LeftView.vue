<script>
  /**
   * 📋 LeftView.vue - 左側控制面板組件
   *
   * 功能說明：
   * 1. 🎛️ 提供圖層管理和控制的主要介面
   * 2. 📊 顯示 Schematic Map 2 的標題和品牌資訊
   * 3. 📋 整合圖層列表分頁，提供完整的圖層操作功能
   * 4. 🎨 提供統一的左側面板樣式和佈局
   * 5. 📱 支援響應式設計，適應不同螢幕尺寸
   *
   * 架構說明：
   * - 標題區域：顯示系統名稱和品牌資訊
   * - 圖層控制區域：包含 LayersTab 組件，提供圖層管理功能
   *
   * 設計理念：
   * - 簡潔清晰的介面設計
   * - 專注於圖層控制功能
   * - 與中間和右側面板協調工作
   *
   * @component LeftView
   * @version 1.0.0
   */

  // 🧩 子組件引入 (Subcomponent Imports)
  import LayersTab from '../tabs/LayersTab.vue'; // 圖層列表分頁組件

  export default {
    name: 'LeftView',

    /**
     * 🧩 組件註冊 (Component Registration)
     * 註冊左側面板內使用的子組件
     */
    components: {
      LayersTab, // 圖層列表分頁組件
    },

    /**
     * 🔧 組件設定函數 (Component Setup)
     * 使用 Composition API 設定組件邏輯
     * 目前此組件主要作為容器，邏輯主要由子組件處理
     */
    setup() {
      // 📤 返回響應式數據給模板使用
      // 目前不需要額外的響應式狀態，所有邏輯由子組件處理
      return {};
    },
  };
</script>

<template>
  <div class="my-bgcolor-gray-100 h-100 d-flex flex-column overflow-hidden">
    <!-- 📰 頁面標題區域 -->
    <div class="p-3">
      <h1 class="my-font-size-lg my-letter-spacing-lg text-center m-3">Schematic Map 2</h1>
    </div>

    <!-- 📋 圖層列表分頁內容 -->
    <div class="flex-grow-1 overflow-hidden">
      <LayersTab />
    </div>
  </div>
</template>

<style scoped></style>
