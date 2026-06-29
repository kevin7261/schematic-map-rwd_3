<!--
  🗺️ RouteMapAdjustTab2.vue — 「路線圖轉換骨架2」圖層專用 Upper 顯示分頁

  ⚠️ 本元件為「路線圖調整」圖層**獨立複製**之顯示層，刻意不與 SelectRouteMapTab /
     SpaceNetworkGridTab 共用。僅作為薄殼：提供穩定的 Leaflet 容器並委派
     src/utils/routeMapAdjust/renderRouteMapAdjust.js 掛載／銷毀地圖。現階段為唯讀顯示。
-->
<template>
  <div class="h-100 w-100 position-relative rma2-map-tab">
    <div ref="mapEl" class="h-100 w-100"></div>
  </div>
</template>

<script>
  import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { mountRouteMapAdjust2 } from '../utils/routeMapAdjust/renderRouteMapAdjust2.js';

  export default {
    name: 'RouteMapAdjustTab2',
    props: {
      isActive: { type: Boolean, default: false },
      containerHeight: { type: Number, default: 500 },
    },
    setup(props) {
      const dataStore = useDataStore();
      const mapEl = ref(null);
      let handle = null;

      const ensureMounted = () => {
        const el = mapEl.value;
        if (!el || handle) return;
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
          setTimeout(() => {
            if (props.isActive) ensureMounted();
          }, 100);
          return;
        }
        handle = mountRouteMapAdjust2(el, dataStore);
      };

      const destroy = () => {
        if (handle) {
          handle.destroy();
          handle = null;
        }
      };

      const resize = () => {
        if (handle) handle.invalidateSize();
        else if (props.isActive) ensureMounted();
      };

      watch(
        () => props.isActive,
        (active) => {
          if (active) nextTick(ensureMounted);
        }
      );

      onMounted(() => {
        if (props.isActive) nextTick(ensureMounted);
      });
      onBeforeUnmount(destroy);

      return { mapEl, resize };
    },
  };
</script>

<style>
  /* 點擊路線／站點時不顯示瀏覽器 focus 藍方框 */
  .rma2-map-tab .leaflet-interactive:focus,
  .rma2-map-tab .leaflet-container:focus,
  .rma2-map-tab svg:focus,
  .rma2-map-tab path:focus {
    outline: none;
  }
</style>
