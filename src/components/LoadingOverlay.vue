/** * ⏳ LoadingOverlay.vue - 載入覆蓋層組件 (Loading Overlay Component) * *
這是一個全螢幕載入狀態顯示組件，為用戶提供視覺化的載入進度反饋和狀態提示。 *
該組件設計簡潔美觀，支援多種載入狀態配置，是整個應用程式中載入體驗的重要組成部分。 * * 🎯 主要功能
(Core Features): * 1. 🖥️ 全螢幕覆蓋層：提供沉浸式的載入體驗 * -
半透明黑色背景，確保載入內容的視覺焦點 * - 置頂顯示，確保在所有內容之上 * -
響應式設計，適配各種螢幕尺寸 * 2. 🎨 載入動畫：提供視覺化的載入指示 * - Bootstrap 標準載入動畫，保持
UI 一致性 * - 可配置的載入動畫顏色和大小 * - 無障礙支援，提供螢幕閱讀器友好的描述 * 3. 📊
進度條顯示：精確的載入進度反饋 * - 可選的進度條顯示，支援百分比進度 * - 平滑的進度動畫效果 * -
進度數值的實時顯示 * 4. 📝 自定義文字：靈活的載入提示配置 * - 主要載入文字，描述當前操作 * -
輔助說明文字，提供詳細資訊 * - 多語言支援的潛在擴展性 * 5. 🔧 高度可配置：適應不同的使用場景 * -
可控制顯示/隱藏狀態 * - 可選的進度條顯示 * - 靈活的文字內容配置 * * 🏗️ 技術特點 (Technical
Features): * - Vue 3 組件設計，支援響應式數據綁定 * - Bootstrap 5 樣式整合，保持 UI 一致性 * -
無障礙設計，支援螢幕閱讀器 * - 響應式佈局，適配各種設備 * - 輕量級實現，性能優化 * * 🎨 視覺設計
(Visual Design): * - 半透明背景，不影響用戶對載入內容的理解 * - 中央卡片佈局，突出載入內容 * -
圓角陰影設計，現代化視覺效果 * - 統一的顏色方案，與應用程式主題一致 * * 🚀 使用場景 (Use Cases): * -
數據載入過程中的使用者反饋 * - 長時間操作的進度顯示 * - 系統初始化狀態提示 * - 網路請求載入指示 * -
文件上傳進度顯示 * - 複雜計算過程的狀態提示 * * 📱 響應式支援 (Responsive Support): * -
桌面版：標準尺寸的載入卡片 * - 平板版：適中的卡片尺寸 * - 手機版：全寬度卡片，優化觸控體驗 * * 🔧
組件 API (Component API): * - isVisible: 控制載入層的顯示/隱藏 * - loadingText: 主要載入文字 * -
progress: 載入進度百分比 (0-100) * - showProgress: 是否顯示進度條 * - subText: 輔助說明文字 * *
@component LoadingOverlay * @version 2.0.0 * @author Kevin Cheng * @since 1.0.0 * @see {@link
https://getbootstrap.com/docs/5.0/components/spinners/} Bootstrap 載入動畫文檔 */
<script>
  // ==================== 📦 組件定義 (Component Definition) ====================

  // 導出 Vue 組件選項對象，定義載入覆蓋層組件的行為和屬性
  export default {
    /**
     * 組件名稱定義
     * 用於 Vue DevTools 調試和組件識別
     * - name: 'LoadingOverlay' - 組件在開發工具中顯示的名稱
     */
    name: 'LoadingOverlay',

    /**
     * 組件屬性定義 (Component Props)
     * 接收來自父組件的載入狀態和配置選項
     * 所有屬性都是響應式的，會在父組件更新時自動重新渲染
     */
    props: {
      /**
       * 載入覆蓋層顯示狀態控制
       * - type: Boolean - 布林值類型
       * - default: false - 預設為隱藏狀態
       * - required: true - 必填屬性，父組件必須提供
       */
      isVisible: {
        type: Boolean, // 屬性類型：布林值
        default: false, // 預設值：隱藏狀態
        required: true, // 必填：父組件必須傳入此屬性
      },

      /**
       * 載入過程的主要文字描述
       * - type: String - 字串類型
       * - default: '載入中...' - 預設載入文字
       * - 用於顯示當前載入操作的主要描述
       */
      loadingText: {
        type: String, // 屬性類型：字串
        default: '載入中...', // 預設值：中文載入提示
      },

      /**
       * 載入進度百分比數值
       * - type: Number - 數值類型
       * - default: -1 - 預設值 -1 表示不顯示進度
       * - validator: 自定義驗證函數，確保數值在 -1 到 100 之間
       * - 0-100: 正常的進度百分比
       * - -1: 表示不顯示進度條
       */
      progress: {
        type: Number, // 屬性類型：數值
        default: -1, // 預設值：-1 表示不顯示進度
        // 自定義驗證函數：確保進度值在有效範圍內
        validator: (value) => value >= -1 && value <= 100,
      },

      /**
       * 進度條顯示控制開關
       * - type: Boolean - 布林值類型
       * - default: false - 預設不顯示進度條
       * - 控制是否顯示進度條組件
       */
      showProgress: {
        type: Boolean, // 屬性類型：布林值
        default: false, // 預設值：不顯示進度條
      },

      /**
       * 輔助說明文字內容
       * - type: String - 字串類型
       * - default: '' - 預設為空字串
       * - 可選的輔助說明，提供額外的載入信息
       */
      subText: {
        type: String, // 屬性類型：字串
        default: '', // 預設值：空字串（不顯示輔助文字）
      },
    },
  };
</script>

<template>
  <!-- 載入覆蓋層組件 -->
  <!-- 在資料載入時顯示，提供視覺化的載入進度回饋和狀態提示 -->

  <!--
    📦 全螢幕覆蓋層容器 (Full Screen Overlay Container)
    - class="position-fixed": Bootstrap 5 固定定位類，相對於視窗固定定位
    - class="top-0 start-0": 定位到視窗的左上角（top: 0, left: 0）
    - class="w-100 h-100": 寬度和高度都是 100%，覆蓋整個視窗
    - class="d-flex": 啟用 flexbox 佈局
    - class="justify-content-center": 水平方向居中對齊
    - class="align-items-center": 垂直方向居中對齊
    - style="background-color: rgba(0, 0, 0, 0.7)": 半透明黑色背景，透明度 0.7
    - style="z-index: 9999": 設定高層級，確保在所有內容之上顯示
    - v-if="isVisible": Vue 條件渲染，只有當 isVisible 為 true 時才顯示
  -->
  <div
    class="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center"
    style="background-color: rgba(0, 0, 0, 0.7); z-index: 9999"
    v-if="isVisible"
  >
    <!--
      🎨 載入內容卡片 (Loading Content Card)
      - class="text-center": 文字居中對齊
      - class="my-bgcolor-white": 自定義白色背景類
      - class="p-4": Bootstrap 內邊距類，四周 1.5rem 的內邊距
      - class="rounded": Bootstrap 圓角類，添加圓角效果
      - class="shadow": Bootstrap 陰影類，添加陰影效果
      - style="min-width: 300px": 最小寬度 300px，確保內容不會太窄
      - style="max-width: 400px": 最大寬度 400px，確保在大螢幕上不會太寬
    -->
    <div
      class="text-center my-bgcolor-white p-4 rounded shadow"
      style="min-width: 300px; max-width: 400px"
    >
      <!--
        🎯 載入動畫圓環 (Loading Spinner)
        - class="spinner-border": Bootstrap 5 的圓形載入動畫類
        - class="text-primary": 設定動畫顏色為主題色（藍色）
        - class="mb-3": Bootstrap 下邊距類，底部 1rem 的邊距
        - style="width: 2rem; height: 2rem": 設定動畫大小為 2rem x 2rem
        - role="status": 無障礙屬性，告知螢幕閱讀器這是一個狀態指示器
      -->
      <div class="spinner-border text-primary mb-3" style="width: 2rem; height: 2rem" role="status">
        <!--
          ♿ 無障礙輔助文字 (Accessibility Screen Reader Text)
          - class="visually-hidden": Bootstrap 的視覺隱藏類，只對螢幕閱讀器可見
          - 內容："載入中..." - 為螢幕閱讀器提供載入狀態的文字說明
        -->
        <span class="visually-hidden">載入中...</span>
      </div>

      <!--
        📝 主要載入文字 (Main Loading Text)
        - class="my-title-lg-black": 自定義大標題樣式類，黑色文字
        - {{ loadingText }}: Vue 插值語法，顯示 props 中的 loadingText 屬性值
      -->
      <div class="my-title-lg-black">{{ loadingText }}</div>

      <!--
        📊 載入進度條區域 (Loading Progress Bar Area)
        - class="mt-3": Bootstrap 上邊距類，頂部 1rem 的邊距
        - v-if="showProgress && progress >= 0": Vue 條件渲染
          - showProgress: 控制是否顯示進度條的開關
          - progress >= 0: 確保進度值大於等於 0（有效範圍）
      -->
      <div class="mt-3" v-if="showProgress && progress >= 0">
        <!--
          📈 Bootstrap 進度條容器 (Bootstrap Progress Container)
          - class="progress": Bootstrap 進度條容器類
          - style="height: 8px": 設定進度條高度為 8px，較細的進度條
        -->
        <div class="progress" style="height: 8px">
          <!--
            🎚️ 進度條滑塊 (Progress Bar Slider)
            - class="progress-bar": Bootstrap 進度條滑塊類
            - class="bg-primary": 設定滑塊背景色為主題色（藍色）
            - class="d-flex align-items-center justify-content-center": flexbox 居中對齊
            - role="progressbar": 無障礙屬性，告知螢幕閱讀器這是一個進度條
            - :style="{ width: progress + '%' }": Vue 動態樣式綁定，根據 progress 設定寬度
            - :aria-valuenow="progress": 無障礙屬性，當前進度值
            - aria-valuemin="0": 無障礙屬性，最小值為 0
            - aria-valuemax="100": 無障礙屬性，最大值為 100
            - style="transition: width 0.3s ease": CSS 過渡動畫，寬度變化時有平滑效果
            - style="font-size: 0.75rem; color: white": 進度數字的樣式設定
            - {{ Math.round(progress) }}%: 顯示四捨五入後的進度百分比
          -->
          <div
            class="progress-bar bg-primary d-flex align-items-center justify-content-center"
            role="progressbar"
            :style="{ width: progress + '%' }"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
            style="transition: width 0.3s ease; font-size: 0.75rem; color: white"
          >
            {{ Math.round(progress) }}%
          </div>
        </div>
      </div>

      <!--
        📋 輔助說明文字 (Additional Description Text)
        - v-if="subText": Vue 條件渲染，只有當 subText 有值時才顯示
        - class="mt-2": Bootstrap 上邊距類，頂部 0.5rem 的邊距
        - class="my-content-xs-gray": 自定義小字體灰色文字樣式類
        - {{ subText }}: Vue 插值語法，顯示 props 中的 subText 屬性值
      -->
      <div v-if="subText" class="mt-2">
        <small class="my-content-xs-gray">{{ subText }}</small>
      </div>
    </div>
  </div>
</template>
