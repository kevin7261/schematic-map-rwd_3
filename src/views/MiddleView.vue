/** * 🗺️ 中間主要內容面板組件 (Middle Main Content Panel Component) * * 功能說明 (Features): * 1. 📊
分層佈局管理：管理上半部（地圖/儀表板）和下半部（表格）的垂直佈局 * 2. 🖱️
拖曳調整功能：提供垂直拖曳調整器，讓使用者動態調整上下面板高度比例 * 3. 📱
響應式設計：根據螢幕尺寸和面板狀態自動調整佈局 * 4. 🔄
事件轉發：將子組件事件轉發給父組件，實現組件間通信 * 5. 🎯 高亮功能：提供地圖要素高亮顯示的統一介面
* 6. 📏 尺寸計算：動態計算各面板的實際像素高度 * * 技術特點 (Technical Features): * - 使用 Vue 3
Composition API 進行狀態管理 * - 支援動態面板高度調整和響應式佈局 * - 實現完整的拖曳調整功能 * -
提供事件轉發和狀態同步機制 * - 整合多個子組件的協調工作 * * 佈局結構 (Layout Structure): * -
上半部：UpperView（地圖、儀表板、D3.js 圖表等） * - 中間：垂直拖曳調整器 * -
下半部：BottomView（資料表格、樣式設定等） * * @file MiddleView.vue * @version 2.0.0 * @author Kevin
Cheng * @since 1.0.0 */
<script setup>
  // ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

  /**
   * Vue 3 Composition API 核心功能引入
   * 提供響應式數據、計算屬性、生命週期鉤子等功能
   *
   * @see https://vuejs.org/
   */
  import {
    ref, // 響應式引用
    computed, // 計算屬性
    onMounted, // 組件掛載生命週期
    onUnmounted, // 組件卸載生命週期
    defineProps, // 定義組件屬性
    defineEmits, // 定義組件事件
    defineExpose, // 暴露組件方法
    watch, // 監聽器
  } from 'vue';

  // ==================== 🧩 子組件引入 (Subcomponent Imports) ====================

  /**
   * 上半部區域組件引入
   * 包含地圖、儀表板、D3.js 圖表等主要內容
   *
   * @see ./UpperView.vue
   */
  import UpperView from './UpperView.vue';

  /**
   * 下半部區域組件引入
   * 包含資料表格、樣式設定等輔助功能
   *
   * @see ./BottomView.vue
   */
  import BottomView from './BottomView.vue';

  // --- 📥 組件屬性定義 (Component Props) ---
  /**
   * 📋 接收來自父組件 (HomeView) 的所有必要數據和狀態
   * 包含面板尺寸、分頁狀態、地圖設定、資料等
   */
  const props = defineProps({
    // 🎛️ 分頁和面板設定 (Tab and Panel Settings)
    activeUpperTab: { type: String, default: 'd3js' },
    activeBottomTab: { type: String, default: 'table' },
    mainPanelWidth: { type: Number, default: 60 },
    dynamicMainAreaHeight: { type: Number, default: 500 },

    // 🗺️ 圖層和地圖設定 (Layer and Map Settings)
    selectedFilter: { type: String, default: '' },

    // 🔧 其他設定 (Other Settings)
    zoomLevel: { type: Number, default: 11 },
    currentCoords: { type: Object, default: () => ({ lat: 25.033, lng: 121.5654 }) },
    activeMarkers: { type: Number, default: 0 },
    isSidePanelDragging: { type: Boolean, default: false },
  });

  // --- 📤 組件事件定義 (Component Events) ---
  /**
   * 📡 定義向父組件 (HomeView) 發送的所有事件
   * 採用事件轉發模式，確保資料流向清晰
   */
  defineEmits([
    // 📊 分頁更新事件 (Tab Update Events)
    'update:activeUpperTab', // 更新主要分頁
    'update:activeBottomTab', // 更新底部分頁

    // 🗺️ 地圖狀態更新事件 (Map State Update Events)
    'update:zoomLevel', // 更新縮放等級
    'update:currentCoords', // 更新目前座標
    'update:activeMarkers', // 更新作用中標記數

    // 📊 表格相關事件
    'update:tableSearchQuery', // 更新搜尋查詢
    'sort-table', // 表格排序
    'highlight-on-map', // 在地圖上高亮顯示
    'feature-selected', // 選中特徵事件

    // 🔄 操作相關事件
    'reset-view', // 重設視圖
  ]);

  // --- 📚 內部組件引用 (Internal Component References) ---
  /** 📊 主內容面板引用 (用於呼叫 UpperView 的方法如 highlightFeature) */
  const mainContentRef = ref(null);

  // --- 🔧 內部垂直拖曳調整邏輯 (Internal Vertical Resizing Logic) ---

  /** 📏 底部面板高度百分比 (預設 30%，可透過拖曳調整) */
  const bottomViewHeightPercent = ref(30);

  /** 🖱️ 是否正在進行垂直拖曳 (追蹤垂直拖曳狀態) */
  const isVerticalDragging = ref(false);

  /**
   * 🖱️ 計算是否有任何拖曳正在進行 (影響滑鼠指標事件)
   * 結合側邊面板拖曳和垂直拖曳狀態，用於禁用指標事件
   */
  const isOverallDragging = computed(() => {
    return props.isSidePanelDragging || isVerticalDragging.value;
  });

  /**
   * 📏 中間區域總高度計算 (Computing Total Middle Section Height)
   * 從父組件傳入的動態高度，確保不為負數
   */
  const middleSectionTotalHeight = computed(() => {
    const totalHeight = props.dynamicMainAreaHeight;

    return Math.max(totalHeight, 0); // 確保不為負數，避免佈局錯誤
  });

  /**
   * 📏 底部面板實際像素高度計算 (Computing Actual Bottom View Pixel Height)
   * 根據百分比和總高度計算實際像素值
   */
  const actualBottomViewPixelHeight = computed(() => {
    const pixelHeight = (bottomViewHeightPercent.value / 100) * middleSectionTotalHeight.value;

    return pixelHeight;
  });

  /**
   * 📏 主內容區域高度計算 (Computing Main Content Area Height)
   * 總高度減去底部面板高度，得到上部區域可用高度
   */
  const contentHeight = computed(() => {
    const mainContentH = middleSectionTotalHeight.value - actualBottomViewPixelHeight.value;

    return mainContentH;
  });

  /**
   * 🖱️ 開始垂直拖曳調整 (Start Vertical Resize)
   * 處理滑鼠按下事件，開始垂直面板大小調整
   *
   * @param {MouseEvent} event - 滑鼠按下事件
   */
  const startVerticalResize = (event) => {
    // 阻止預設行為和事件冒泡，避免干擾其他元素
    event.preventDefault();
    event.stopPropagation();

    // 設定拖曳狀態和視覺回饋
    isVerticalDragging.value = true;
    document.body.classList.add('my-no-select'); // 防止文字選取，提升拖曳體驗

    // 記錄初始位置和狀態，用於計算拖曳變化量
    const startY = event.clientY;
    const startBottomPercent = bottomViewHeightPercent.value;
    const currentMiddleSectionHeight = middleSectionTotalHeight.value;

    /**
     * 🖱️ 處理滑鼠移動事件 (Handle Mouse Move)
     * 計算拖曳距離並更新面板高度比例
     *
     * @param {MouseEvent} moveEvent - 滑鼠移動事件
     */
    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaY = moveEvent.clientY - startY;

      // 防止除零錯誤
      if (currentMiddleSectionHeight === 0) return;

      // 計算百分比變化 (Y座標變化轉換為高度百分比變化)
      const deltaPercent = (deltaY / currentMiddleSectionHeight) * 100;

      // 向上拖曳 (deltaY < 0) 增加底部面板高度百分比
      // 向下拖曳 (deltaY > 0) 減少底部面板高度百分比
      let newPercent = startBottomPercent - deltaPercent;

      // 限制在合理範圍 (0-100%)，確保佈局穩定
      newPercent = Math.max(0, Math.min(100, newPercent));

      // 四捨五入到小數點後一位，避免精度問題
      bottomViewHeightPercent.value = Math.round(newPercent * 10) / 10;
    };

    /**
     * 🖱️ 處理滑鼠放開事件 (Handle Mouse Up)
     * 清理拖曳狀態，移除事件監聽器
     */
    const handleMouseUp = () => {
      // 清除拖曳狀態和視覺回饋
      isVerticalDragging.value = false;
      document.body.classList.remove('my-no-select');

      // 移除臨時事件監聽器，避免記憶體洩漏
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // 註冊全域事件監聽器，確保拖曳行為在整個頁面範圍內有效
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  /**
   * 👀 監聽 activeUpperTab 變化 (Watch activeUpperTab Changes)
   * 當分頁切換時記錄日誌，用於除錯和狀態追蹤
   */
  watch(
    () => props.activeUpperTab,
    () => {
      // Tab changed
    }
  );

  /**
   * 🚀 組件掛載時初始化 (Component Mounted Initialization)
   * 組件載入完成後的初始化工作
   */
  onMounted(() => {
    // 初始計算將依賴從 HomeView 傳遞的正確 prop
  });

  /**
   * 🗑️ 組件卸載時清理 (Component Unmounted Cleanup)
   * 組件銷毀前的清理工作，確保沒有記憶體洩漏
   */
  onUnmounted(() => {});

  // --- 🔧 可從父組件呼叫的方法 (Methods Callable from Parent) ---

  /**
   * 🎯 高亮顯示特徵 (Highlight Feature)
   * 透過 mainContentRef 呼叫主內容面板的高亮功能
   * 用於從表格或其他來源觸發地圖上的要素高亮
   *
   * @param {Object} highlightData - 包含 layerId 和 id 的高亮數據物件
   */
  const highlightFeature = (highlightData) => {
    if (!mainContentRef.value) {
      console.warn('⚠️ 無法高亮顯示：mainContentRef 未定義');
      return;
    }

    mainContentRef.value.highlightFeature(highlightData);
  };

  /**
   * 🗺️ 適應台南邊界 (Fit to Tainan Bounds)
   * 透過 mainContentRef 呼叫地圖適應邊界功能
   * 將地圖視圖調整到顯示完整的台南市範圍
   */
  const fitToTainanBounds = () => {
    if (mainContentRef.value) {
      mainContentRef.value.fitToTainanBounds();
    }
  };

  /**
   * 🔄 重設地圖視圖 (Reset Map View)
   * MapTab已移除，此功能不再需要
   */
  const resetMapTab = () => {};

  /**
   * 📏 刷新地圖尺寸 (Invalidate Map Size)
   * 透過 mainContentRef 呼叫地圖尺寸重新計算功能
   * 當容器大小變化但自動偵測失效時使用
   */
  const invalidateMapSize = () => {
    if (mainContentRef.value) {
      mainContentRef.value.invalidateMapSize();
    }
  };

  /**
   * 🛑 停止地圖點擊模式 (Stop Map Click Mode)
   * 透過 mainContentRef 呼叫停止地圖點擊功能
   */
  const stopMapClickMode = () => {
    if (mainContentRef.value) {
      mainContentRef.value.stopMapClickMode();
    }
  };

  /**
   * 📤 暴露方法給父組件使用 (Expose Methods to Parent Component)
   * 讓 HomeView 可以直接呼叫這些方法，實現組件間的方法調用
   */
  defineExpose({
    highlightFeature, // 高亮顯示功能
    fitToTainanBounds, // 地圖邊界適應
    resetMapTab, // 地圖視圖重設
    invalidateMapSize, // 地圖尺寸刷新
    stopMapClickMode, // 停止地圖點擊模式
    // 如果 HomeView 需要直接存取子組件，可以暴露 mainContentRef 和 bottomViewRef
    // mainContentRef,    // 主內容組件引用
    // bottomViewRef      // 底部視圖組件引用
  });
</script>

<template>
  <!-- 🎛️ 中間面板組件 (Middle Panel Component) -->
  <!-- 負責管理上下兩個面板的佈局和垂直拖曳調整功能 -->
  <!-- 這是一個佈局容器，使用 flexbox 垂直排列，填滿可用空間 -->
  <div class="d-flex flex-column overflow-hidden h-100">
    <!-- 📊 上半部內容區域 (Upper Content Area) -->
    <!-- 包含地圖、儀表板等主要顯示內容 -->
    <!-- 動態高度根據 contentHeight 計算，拖曳時禁用指標事件避免干擾 -->
    <div
      :style="{
        pointerEvents: isOverallDragging ? 'none' : 'auto',
        height: contentHeight + 'px',
        overflow: 'hidden',
        minHeight: '0',
      }"
    >
      <!-- 🗺️ 上層視圖組件 (Upper View Component) -->
      <!-- 傳遞所有必要的 props 給 UpperView，包含地圖狀態、資料、樣式設定等 -->
      <UpperView
        ref="mainContentRef"
        :activeUpperTab="activeUpperTab"
        :mainPanelWidth="mainPanelWidth"
        :contentHeight="contentHeight"
        :selectedFilter="selectedFilter"
        :zoomLevel="zoomLevel"
        :isPanelDragging="isOverallDragging"
        :activeMarkers="activeMarkers"
        @update:activeUpperTab="$emit('update:activeUpperTab', $event)"
        @update:zoomLevel="$emit('update:zoomLevel', $event)"
        @update:currentCoords="$emit('update:currentCoords', $event)"
        @update:activeMarkers="$emit('update:activeMarkers', $event)"
        @feature-selected="$emit('feature-selected', $event)"
      />
    </div>

    <!-- 🔧 水平拖曳調整器 (Horizontal Resizer) -->
    <!-- 用於調整上下面板的高度比例 -->
    <!-- 監聽 mousedown 事件開始拖曳，動態顯示拖曳狀態的樣式 -->
    <div
      class="my-resizer my-resizer-horizontal my-resizer-middle"
      :class="{ 'my-dragging': isVerticalDragging }"
      @mousedown="startVerticalResize"
      title="拖曳調整底部面板高度"
    ></div>

    <!-- 📋 下半部內容區域 (Bottom Content Area) -->
    <!-- 包含資料表格、控制項等輔助顯示內容 -->
    <!-- 動態高度根據 actualBottomViewPixelHeight 計算 -->
    <div
      class="overflow-hidden"
      :style="{
        pointerEvents: isOverallDragging ? 'none' : 'auto',
        height: actualBottomViewPixelHeight + 'px',
      }"
    >
      <!-- 📊 底部視圖組件 (Bottom View Component) -->
      <!-- 傳遞表格資料、樣式設定、面板狀態等 props -->
      <BottomView
        :activeBottomTab="activeBottomTab"
        :bottomViewHeight="actualBottomViewPixelHeight"
        :isPanelDragging="isOverallDragging"
        @update:activeBottomTab="$emit('update:activeBottomTab', $event)"
        @highlight-on-map="$emit('highlight-on-map', $event)"
        @feature-selected="$emit('feature-selected', $event)"
        @reset-view="$emit('reset-view')"
      />
    </div>
  </div>
</template>

<style scoped></style>
