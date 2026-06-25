<!--
  🗺️ SelectRouteMapTab.vue — 「選擇路線圖」圖層專用 Upper 顯示分頁

  ⚠️ 本元件為「選擇路線圖」圖層**獨立複製**之顯示層，刻意不與 SpaceNetworkGridTab 共用。
     僅作為薄殼：提供穩定的 Leaflet 容器並委派 src/utils/selectRouteMap/renderRouteMap.js
     掛載／銷毀地圖。為唯讀顯示（畫出載入的城市路線與站點，hover 顯示屬性）。
-->
<template>
  <div class="h-100 w-100 position-relative">
    <div ref="mapEl" class="h-100 w-100"></div>
  </div>
</template>

<script>
  import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { mountRouteMap } from '../utils/selectRouteMap/renderRouteMap.js';

  export default {
    name: 'SelectRouteMapTab',
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
        // 容器尚未取得尺寸（v-show 顯示前）時稍後再試，避免 Leaflet 在 0 尺寸下崩潰
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
          setTimeout(() => {
            if (props.isActive) ensureMounted();
          }, 100);
          return;
        }
        handle = mountRouteMap(el, dataStore);
      };

      const destroy = () => {
        if (handle) {
          handle.destroy();
          handle = null;
        }
      };

      /** 供父層在版面尺寸變更時呼叫 */
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
