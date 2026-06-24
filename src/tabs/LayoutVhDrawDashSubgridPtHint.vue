<script setup>
  import { computed } from 'vue';
  import { storeToRefs } from 'pinia';
  import { useDataStore } from '@/stores/dataStore.js';
  import {
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
  } from '@/utils/layers/json_grid_coord_normalized/index.js';

  const props = defineProps({
    layer: { type: Object, required: true },
  });

  const dataStore = useDataStore();
  const { layoutVhDrawWeightedDashSubgridPtUi } = storeToRefs(dataStore);

  const isLayoutVhDrawControlLayer = computed(() => {
    const id = props.layer?.layerId;
    return (
      id === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
      id === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2
    );
  });

  const fmtPtRange = (a, b) => {
    if (a == null || b == null) return '—';
    const ra = Math.round(Number(a) * 100) / 100;
    const rb = Math.round(Number(b) * 100) / 100;
    if (Math.abs(ra - rb) < 1e-5) return String(ra);
    return `${ra}～${rb}`;
  };

  const readout = computed(() => {
    if (!isLayoutVhDrawControlLayer.value) return { kind: 'hidden' };
    if (props.layer?.layoutVhDrawShowBlackDotRowColRatioOverlay !== true) {
      return {
        kind: 'muted',
        text: '開啟「顯示比例條繪製」後，會在此顯示網格鄰線間距（實線／虛線相鄰）之寬／高（pt）。',
      };
    }
    const ui = layoutVhDrawWeightedDashSubgridPtUi.value;
    const lid = props.layer?.layerId;
    if (!ui || ui.layerId !== lid) {
      return {
        kind: 'muted',
        text: '請在 Upper「layout-grid」選取本圖層，數值會隨繪區 resize 即時更新。',
      };
    }
    if (ui.status === 'ok' || ui.status === 'partial') {
      return {
        kind: 'dims',
        wLabel: fmtPtRange(ui.wPtMin, ui.wPtMax),
        hLabel: fmtPtRange(ui.hPtMin, ui.hPtMax),
      };
    }
    if (ui.status === 'cant_remap') {
      return {
        kind: 'muted',
        text: '無法計算網格鄰線間距（與細格視圖或區間資料不一致）。',
      };
    }
    return {
      kind: 'muted',
      text: '數值將於 Upper 繪製後顯示。',
    };
  });
</script>

<template>
  <div
    v-if="readout.kind !== 'hidden'"
    class="my-font-size-xs mb-2 py-1 px-1 rounded border border-secondary border-opacity-25"
    style="line-height: 1.5"
    :class="readout.kind === 'dims' ? 'text-body' : 'text-muted'"
  >
    <template v-if="readout.kind === 'dims'">
      網格鄰線間距（相鄰實線／虛線，約）：寬 <strong>{{ readout.wLabel }}</strong> × 高
      <strong>{{ readout.hLabel }}</strong> pt
    </template>
    <template v-else>{{ readout.text }}</template>
  </div>
</template>
