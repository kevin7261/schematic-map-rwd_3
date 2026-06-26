<!--
  🗺️ RouteSchematicTab.vue — 三個示意圖佈局圖層（schematic_rma_*）之獨立顯示分頁。

  載入後直接畫「路線圖轉換骨架」的骨架（layer.geojsonData），線/點顏色與骨架一致，
  不經共用的 SpaceNetworkGridTab。委派 src/utils/routeMapAdjust/renderSchematicSkeleton.js。
-->
<template>
  <div class="h-100 w-100 position-relative route-schematic-tab">
    <div ref="mapEl" class="h-100 w-100"></div>
  </div>
</template>

<script>
  import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { mountSchematicSkeleton } from '../utils/routeMapAdjust/renderSchematicSkeleton.js';

  export default {
    name: 'RouteSchematicTab',
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
        handle = mountSchematicSkeleton(el, dataStore);
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
  .route-schematic-tab .leaflet-interactive:focus,
  .route-schematic-tab svg:focus,
  .route-schematic-tab path:focus {
    outline: none;
  }
</style>
