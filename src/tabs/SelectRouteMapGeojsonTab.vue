<!--
  📄 SelectRouteMapGeojsonTab.vue — 「選擇路線圖」圖層專用 GeoJSON 檢視分頁

  ⚠️ 本元件為「選擇路線圖」圖層**獨立複製**之檢視層，刻意不與其他 JSON 檢視元件共用。
     顯示載入城市時保存的原始 GeoJSON（FeatureCollection），格式化後唯讀呈現。
-->
<template>
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <div class="p-3 border-bottom my-bgcolor-white">
      <div class="my-title-md-black">選擇路線圖 — GeoJSON</div>
      <div class="my-title-xs-gray">
        載入之原始 GeoJSON（FeatureCollection）<span v-if="featureCount"> · {{ featureCount }} features</span>
      </div>
      <div v-if="source" class="my-font-size-xs text-muted pt-1" style="line-height: 1.45">
        資料來源：{{ source }}
      </div>
      <button
        v-if="hasGeojson"
        type="button"
        class="btn rounded-pill border-0 my-btn-blue my-font-size-xs mt-2 my-cursor-pointer"
        @click="copyGeojson"
      >
        {{ copied ? '已複製' : '複製 GeoJSON' }}
      </button>
    </div>

    <div v-if="hasGeojson" class="flex-grow-1 overflow-auto my-bgcolor-white p-3">
      <pre class="srm-geojson-pre">{{ formatted }}</pre>
    </div>
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="my-title-md-gray p-3 text-center">
        尚未載入路線。請先在「選擇路線圖」載入城市路線。
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, computed } from 'vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { SELECT_ROUTE_MAP_LAYER_ID } from '../utils/selectRouteMap/cityCatalog.js';

  export default {
    name: 'SelectRouteMapGeojsonTab',
    setup() {
      const dataStore = useDataStore();
      const layer = computed(() => dataStore.findLayerById(SELECT_ROUTE_MAP_LAYER_ID));
      const geojson = computed(() => layer.value?.selectRouteMapGeojson || null);
      const hasGeojson = computed(() => !!geojson.value);
      const featureCount = computed(() =>
        Array.isArray(geojson.value?.features) ? geojson.value.features.length : 0
      );
      const source = computed(() => layer.value?.selectRouteMapSource || '');
      const formatted = computed(() => {
        if (!geojson.value) return '';
        try {
          return JSON.stringify(geojson.value, null, 2);
        } catch (e) {
          void e;
          return '';
        }
      });

      const copied = ref(false);
      const copyGeojson = async () => {
        try {
          await navigator.clipboard.writeText(formatted.value);
          copied.value = true;
          setTimeout(() => {
            copied.value = false;
          }, 1500);
        } catch (e) {
          void e;
        }
      };

      return { hasGeojson, featureCount, source, formatted, copied, copyGeojson };
    },
  };
</script>

<style scoped>
  .srm-geojson-pre {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre;
    margin: 0;
    color: #222;
  }
</style>
