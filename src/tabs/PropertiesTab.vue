<script>
  import DetailItem from '../components/DetailItem.vue';
  import { useDataStore } from '../stores/dataStore';
  import { computed } from 'vue';

  export default {
    name: 'PropertiesTab',

    /**
     * 🧩 組件註冊 (Component Registration)
     * 註冊物件屬性分頁內使用的子組件
     */
    components: {
      DetailItem, // 詳細資訊項目組件
    },

    /**
     * 🔧 組件設定函數 (Component Setup)
     * 使用 Composition API 設定組件邏輯
     */
    setup() {
      // 📦 取得 Pinia 數據存儲實例
      const dataStore = useDataStore();

      /**
       * 📊 選中物件計算屬性 (Selected Feature Computed Property)
       * 從 Pinia store 獲取當前選中的地圖物件
       * 提供響應式的選中物件數據
       */
      const selectedFeature = computed(() => dataStore.selectedFeature);

      const selectedLayer = computed(() => {
        if (!selectedFeature.value?.properties?.layerId) {
          return null;
        }

        const layerId = selectedFeature.value.properties.layerId;

        // 特殊處理 DataTable 的數據
        if (layerId === 'datatable') {
          // 如果有項目顏色，使用該顏色
          const itemColor = selectedFeature.value.properties.itemColor;
          return {
            colorName: 'custom', // 使用自定義顏色
            layerName: '地鐵線路數據',
            customColor: itemColor || '#6c757d', // 預設為灰色
          };
        }

        const layer = dataStore.findLayerById(layerId);
        return layer;
      });

      /**
       * 🏷️ 圖層名稱計算屬性 (Layer Name Computed Property)
       * 根據 selectedFeature.properties.layerId 從 dataStore 的 layers 中找到對應的圖層名稱，包含群組名稱
       */
      const layerName = computed(() => {
        if (!selectedFeature.value?.properties?.layerId) {
          return null;
        }

        const layerId = selectedFeature.value.properties.layerId;

        // 特殊處理 DataTable 的數據
        if (layerId === 'datatable') {
          return {
            groupName: '數據表格',
            layerName: '地鐵線路數據',
          };
        }

        const layer = dataStore.findLayerById(layerId);
        if (!layer) return layerId;

        const groupName = dataStore.findGroupNameByLayerId(layerId);
        return {
          groupName: groupName,
          layerName: layer.layerName,
        };
      });

      /**
       * 📋 是否有屬性計算屬性 (Has Properties Computed Property)
       * 檢查選中物件是否包含有效的屬性資料
       *
       * @returns {boolean} 是否有屬性資料
       */
      const hasProperties = computed(() => {
        return (
          !!selectedFeature.value?.properties?.propertyData &&
          Object.keys(selectedFeature.value.properties.propertyData).length > 0
        );
      });

      // 📤 返回響應式數據給模板使用
      return {
        selectedFeature, // 選中物件
        selectedLayer, // 選中圖層
        layerName, // 圖層名稱
        hasProperties, // 是否有屬性
      };
    },

    /**
     * 🛠️ 組件方法定義 (Component Methods)
     * 定義資料格式化和處理方法
     */
    methods: {
      /**
       * 🎨 格式化屬性值 (Format Property Value)
       * 根據值的類型進行適當的格式化處理
       *
       * @param {any} value - 原始屬性值
       * @returns {string} 格式化後的顯示值
       */
      formatValue(value) {
        // 數字類型：添加千分位分隔符
        if (typeof value === 'number') {
          return value.toLocaleString();
        }
        // 其他類型：直接返回
        return value;
      },
    },
  };
</script>

<template>
  <div class="h-100 flex-grow-1 d-flex flex-column my-bgcolor-gray-200">
    <div v-if="selectedFeature" class="my-bgcolor-white h-100">
      <div>
        <div
          v-if="selectedLayer"
          :class="
            selectedLayer.colorName === 'custom' ? '' : `my-bgcolor-${selectedLayer.colorName}`
          "
          :style="{
            minHeight: '4px',
            backgroundColor:
              selectedLayer.colorName === 'custom' ? selectedLayer.customColor : undefined,
          }"
        ></div>

        <div class="p-3">
          <div class="pb-2">
            <div class="my-title-xs-gray pb-1">圖層</div>
            <div class="my-content-sm-black pb-1">
              <span v-if="layerName?.groupName" class="my-title-xs-gray"
                >{{ layerName.groupName }} -
              </span>
              <span>{{ layerName?.layerName || layerName }}</span>
            </div>
          </div>
          <template v-if="hasProperties">
            <DetailItem
              v-for="(value, key) in selectedFeature.properties.propertyData"
              :key="key"
              :label="key"
              :value="formatValue(value)"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- 📭 無點擊地圖上物件的空狀態 -->
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <div class="my-title-md-gray p-3">沒有點擊地圖上的物件</div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
