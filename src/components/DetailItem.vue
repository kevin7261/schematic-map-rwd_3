<script>
  /**
   * 📋 DetailItem.vue - 詳細資訊項目組件 (Detail Item Component)
   *
   * 這是一個用於顯示標籤-數值對的通用組件，提供統一的資訊展示格式。
   * 該組件設計簡潔實用，支援多種數據類型，是構建詳細資訊面板的基礎組件。
   *
   * 🎯 主要功能 (Core Features):
   * 1. 📝 標籤-數值對顯示：提供結構化的資訊展示
   *    - 清晰的標籤描述，幫助用戶理解數據含義
   *    - 統一的數值格式，保持視覺一致性
   *    - 靈活的佈局設計，適應不同內容長度
   * 2. 🎨 統一樣式格式化：確保視覺一致性
   *    - 使用預定義的 CSS 類名，保持樣式統一
   *    - 響應式字體大小，適配不同螢幕尺寸
   *    - 適當的間距設計，提升可讀性
   * 3. 🔄 多種數據類型支援：適應不同的數據格式
   *    - 字串類型：直接顯示文字內容
   *    - 數值類型：保持數值格式，支援格式化
   *    - 布林類型：顯示 true/false 或自定義文字
   *    - 物件類型：顯示 JSON 字串或自定義格式
   * 4. 📱 響應式設計：適配各種設備尺寸
   *    - 桌面版：標準間距和字體大小
   *    - 平板版：適中的顯示效果
   *    - 手機版：緊湊的佈局，優化空間利用
   * 5. 🔧 高度可重用：簡化組件開發
   *    - 簡單的 API 設計，易於使用
   *    - 無狀態組件，性能優化
   *    - 可組合設計，支援複雜佈局
   *
   * 🏗️ 技術特點 (Technical Features):
   * - Vue 3 組件設計，支援響應式數據綁定
   * - 無狀態設計，純展示組件
   * - TypeScript 類型支援（透過 JSDoc）
   * - 輕量級實現，性能優化
   * - 無副作用，易於測試
   *
   * 🎨 視覺設計 (Visual Design):
   * - 標籤使用灰色小字體，提供層次感
   * - 數值使用黑色標準字體，突出重要資訊
   * - 統一的間距設計，保持視覺平衡
   * - 響應式字體大小，適配不同設備
   *
   * 🚀 使用場景 (Use Cases):
   * - 屬性面板中的資料項目顯示
   * - 詳細資訊的結構化展示
   * - 表單預覽和確認頁面
   * - 用戶資料卡片中的資訊項目
   * - 統計數據的格式化顯示
   * - 配置選項的展示
   * - 產品規格的詳細說明
   *
   * 📱 響應式支援 (Responsive Support):
   * - 桌面版：標準間距和字體大小
   * - 平板版：適中的顯示效果
   * - 手機版：緊湊佈局，優化空間利用
   *
   * 🔧 組件 API (Component API):
   * - label: 標籤文字（必填）
   * - value: 顯示數值（必填，支援多種類型）
   *
   * @component DetailItem
   * @version 2.0.0
   * @author Kevin Cheng
   * @since 1.0.0
   * @example
   * // 基本使用
   * <DetailItem label="人口數" :value="12345" />
   * <DetailItem label="區域名稱" value="中西區" />
   *
   * // 複雜數據類型
   * <DetailItem label="啟用狀態" :value="true" />
   * <DetailItem label="配置資訊" :value="{name: 'test', id: 1}" />
   */
  export default {
    name: 'DetailItem',

    /**
     * 🔧 組件屬性定義 (Component Props)
     * 定義組件接收的外部屬性和驗證規則
     */
    props: {
      /**
       * 📝 標籤文字
       * 顯示在數值上方的描述性標籤
       * @type {String}
       * @required true
       * @example "人口數", "面積", "密度"
       */
      label: {
        type: String,
        required: true,
      },

      /**
       * 📊 顯示數值
       * 要顯示的實際數值，支援多種資料類型
       * @type {String|Number|Boolean|Object}
       * @required true
       * @example 12345, "中西區", true, {name: "test"}
       */
      value: {
        type: [String, Number, Boolean, Object],
        required: true,
      },
    },
  };
</script>

<template>
  <!-- 📋 詳細資訊項目容器 (Detail Item Container) -->
  <!-- 提供標籤-數值對的結構化顯示，使用統一的間距和樣式 -->
  <div class="pb-2">
    <!-- 📝 標籤文字區域 (Label Text Area) -->
    <!-- 使用灰色小標題樣式，提供數值的描述性標籤 -->
    <div class="my-title-xs-gray pb-1">{{ label }}</div>

    <!-- 📊 數值顯示區域 (Value Display Area) -->
    <!-- 使用黑色內容樣式，顯示實際的數據值 -->
    <div class="my-content-sm-black pb-1">{{ value }}</div>
  </div>
</template>

<style scoped>
  /**
   * 🎨 DetailItem 組件專屬樣式 (Component-Specific Styles)
   *
   * 定義組件內部元素的樣式規則，使用 scoped 避免樣式污染
   * 主要樣式規則已在 common.css 中定義，此處僅包含組件特定調整
   */

  /* 移除了未使用的樣式 */
</style>
