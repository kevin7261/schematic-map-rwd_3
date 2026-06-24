<script>
  import { computed, ref, onMounted, onUnmounted } from 'vue';
  import { getIcon } from '../utils/utils.js';
  import LayersTab from '../tabs/LayersTab.vue';
  import DataTableTab from '../tabs/DataTableTab.vue';
  import PropertiesTab from '../tabs/PropertiesTab.vue';
  import LayerInfo from '../tabs/LayerInfoTab.vue';

  export default {
    name: 'ResponsiveLowerView',

    /**
     * 🧩 組件註冊 (Component Registration)
     * 註冊響應式下半部面板內使用的子組件
     */
    components: {
      LayersTab, // 圖層列表分頁組件
      DataTableTab, // 資料表格分頁組件
      PropertiesTab, // 物件屬性分頁組件
      LayerInfo, // 圖層資訊分頁組件
    },

    /**
     * 🔧 組件屬性定義 (Component Props)
     * 接收來自父組件的配置和狀態數據
     */
    props: {
      activeTab: { type: String, default: 'layers' },
      activeRightTab: { type: String, default: 'layer-info' },
      activeBottomTab: { type: String, default: 'table' },
    },

    /**
     * 📡 組件事件定義 (Component Events)
     * 定義向父組件發送的事件類型
     */
    emits: [
      'update:activeTab', // 更新作用中分頁
      'update:activeRightTab', // 更新右側分頁
      'update:activeBottomTab', // 更新底部分頁
      'highlight-on-map', // 在地圖上高亮顯示
      'highlight-feature', // 高亮顯示特徵
      'feature-selected', // 特徵選中事件
    ],

    /**
     * 🔧 組件設定函數 (Component Setup)
     * 使用 Composition API 設定組件邏輯
     */
    setup(props, { emit }) {
      // 📱 動態視窗高度偵測 (Dynamic Viewport Height Detection)
      const bottomSafeArea = ref(0);

      /**
       * 📊 計算可用的分頁列表 (Compute Available Tabs)
       * 根據需求顯示不同的分頁選項
       */
      const availableTabs = computed(() => [
        { id: 'layers', name: '圖層', icon: getIcon('layer_group').icon },
        { id: 'table', name: '資料表', icon: getIcon('table').icon },
        { id: 'properties', name: '屬性', icon: getIcon('location_dot').icon },
        { id: 'layer-info', name: '圖層資訊', icon: getIcon('info_circle').icon },
      ]);

      /**
       * 📱 計算底部安全區域 (Calculate Bottom Safe Area)
       * 動態計算瀏覽器界面佔用的空間
       */
      const calculateBottomSafeArea = () => {
        const windowHeight = window.innerHeight;
        const visualHeight = window.visualViewport?.height || windowHeight;
        const heightDiff = windowHeight - visualHeight;

        // 如果可視高度小於視窗高度，說明有瀏覽器界面佔用空間
        bottomSafeArea.value = heightDiff > 0 ? heightDiff : 0;
      };

      /**
       * 🎨 動態底部導航樣式 (Dynamic Bottom Navigation Style)
       * 根據瀏覽器界面動態調整高度和位置
       */
      const getBottomNavStyle = computed(() => {
        const baseHeight = 60;
        const extraPadding = bottomSafeArea.value > 0 ? bottomSafeArea.value + 10 : 10;

        return {
          'min-height': `${baseHeight}px`,
          height: `${baseHeight + extraPadding}px`,
          padding: `8px 4px ${extraPadding}px 4px`,
        };
      });

      /**
       * 🔘 切換分頁 (Switch Tab)
       * @param {string} tabId - 分頁 ID
       */
      const switchTab = (tabId) => {
        emit('update:activeTab', tabId);
      };

      /**
       * 🚀 組件掛載時初始化 (Component Mounted Initialization)
       */
      onMounted(() => {
        // 初始計算
        calculateBottomSafeArea();

        // 監聽視窗大小變化
        window.addEventListener('resize', calculateBottomSafeArea);

        // 監聽 Visual Viewport API（支援的瀏覽器）
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', calculateBottomSafeArea);
          window.visualViewport.addEventListener('scroll', calculateBottomSafeArea);
        }

        // 監聽方向變化
        window.addEventListener('orientationchange', () => {
          // 延遲執行，等待瀏覽器完成方向變化
          setTimeout(calculateBottomSafeArea, 300);
        });
      });

      /**
       * 🗑️ 組件卸載時清理 (Component Unmounted Cleanup)
       */
      onUnmounted(() => {
        window.removeEventListener('resize', calculateBottomSafeArea);

        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', calculateBottomSafeArea);
          window.visualViewport.removeEventListener('scroll', calculateBottomSafeArea);
        }

        window.removeEventListener('orientationchange', calculateBottomSafeArea);
      });

      // 📤 返回響應式數據和函數給模板使用
      return {
        availableTabs,
        switchTab,
        getBottomNavStyle,
        bottomSafeArea,
      };
    },
  };
</script>

<template>
  <!-- 📱 響應式下半部面板組件 (Responsive Lower Panel Component) -->
  <div class="d-flex flex-column h-100 my-bgcolor-gray-200">
    <!-- 📄 分頁內容區域 (Tab Content Area) -->
    <div
      class="flex-grow-1 overflow-hidden"
      :style="{
        'padding-bottom': `70px`,
      }"
    >
      <!-- 📋 圖層分頁內容 -->
      <div v-show="activeTab === 'layers'" class="h-100">
        <LayersTab />
      </div>

      <!-- 📊 資料表格分頁內容 -->
      <div v-show="activeTab === 'table'" class="h-100">
        <DataTableTab
          @highlight-on-map="$emit('highlight-on-map', $event)"
          @feature-selected="$emit('feature-selected', $event)"
        />
      </div>

      <!-- 📈 物件屬性分頁內容 -->
      <div v-show="activeTab === 'properties'" class="h-100">
        <PropertiesTab @highlight-feature="$emit('highlight-feature', $event)" />
      </div>

      <!-- 📊 圖層資訊分頁內容 -->
      <div v-show="activeTab === 'layer-info'" class="h-100">
        <LayerInfo />
      </div>
    </div>

    <!-- 📑 分頁導航 (Tab Navigation) - 固定在底部，動態適應瀏覽器界面 -->
    <div
      class="position-fixed bottom-0 start-0 end-0 d-flex align-items-center justify-content-between my-bgcolor-gray-200 border-top z-100 w-100"
      :style="getBottomNavStyle"
    >
      <button
        v-for="tab in availableTabs"
        :key="tab.id"
        class="d-flex rounded-3 border-0 flex-grow-1 py-2 mx-1"
        :class="{
          'my-btn-transparent': activeTab !== tab.id,
          'my-btn-active': activeTab === tab.id,
        }"
        :style="{
          'min-height': '44px',
          'touch-action': 'manipulation',
          '-webkit-appearance': 'none !important',
        }"
        @click="switchTab(tab.id)"
      >
        <div class="d-flex flex-column align-items-center justify-content-center w-100">
          <span class="my-font-size-sm"><i :class="tab.icon" class="mb-1"></i></span>
          <span class="my-font-size-xs">{{ tab.name }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
  /* 活躍按鈕樣式 - 圓形背景 */
  .my-btn-active {
    color: var(--my-color-white);
    background-color: var(--my-color-blue);
    border-radius: 50% !important; /* 強制圓形 */
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    max-width: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-grow: 0 !important;
  }

  .my-btn-active:hover,
  .my-btn-active:active {
    color: var(--my-color-white);
    background-color: var(--my-color-blue-hover);
  }
</style>
