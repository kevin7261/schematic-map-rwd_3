<script setup>
  /**
   * 📊 SpaceNetworkGridTabL3.vue — taipei_l3 專用 Upper 分頁
   * 均分網格之欄／列由版面內繪區決定，單格寬、高皆 ≤50pt；視覺與 GridScalingTab（網格示意圖測試）一致。
   * 不讀 spaceNetworkGridJsonDataL3Tab、不修改圖層 drawJsonData。
   */

  import { computed, watch, onMounted, onUnmounted, nextTick, toRef } from 'vue';
  import { useDataStore } from '@/stores/dataStore.js';
  import {
    taipeiL3GridMetricsFromContainerPx,
    TAIPEI_L3_GRID_MARGIN,
    TAIPEI_L3_MAX_CELL_PT,
  } from '@/utils/taipeiL3GridMinCellMetrics.js';
  import * as d3 from 'd3';

  const emit = defineEmits(['active-layer-change']);

  const props = defineProps({
    containerHeight: { type: Number, default: 600 },
    isPanelDragging: { type: Boolean, default: false },
    activeMarkers: { type: Array, default: () => [] },
    isActive: { type: Boolean, default: false },
    /** 綁定之圖層 id（例如 taipei_l3_dp_2） */
    layerId: { type: String, default: 'taipei_l3_dp_2' },
  });

  const dataStore = useDataStore();
  const layerIdRef = toRef(props, 'layerId');

  /** 與 GridScalingTab 相同之網格示意配色 */
  const COLOR_CONFIG = {
    BACKGROUND: '#212121',
    GRID_LINE: '#666666',
    GRID_LINE_SECONDARY: '#333333',
  };

  const containerDomId = computed(
    () => `space-network-grid-${String(props.layerId).replace(/[^a-z0-9_-]/gi, '')}-fixed-container`
  );

  const visibleL3Layers = computed(() =>
    dataStore.getAllLayers().filter((l) => l.visible && l.layerId === layerIdRef.value)
  );

  const targetLayerTitle = computed(() => {
    const lyr = dataStore.findLayerById(props.layerId);
    return lyr?.layerName || props.layerId;
  });

  let resizeObserver = null;

  const getDimensions = () => {
    const id = containerDomId.value;
    const container = document.getElementById(id);
    if (container) {
      const rect = container.getBoundingClientRect();
      const w = Math.max(container.clientWidth || rect.width, 40);
      const h = Math.max(container.clientHeight || rect.height, 30);
      dataStore.updateD3jsDimensions(w, h);
      return { width: w, height: h };
    }
    dataStore.updateD3jsDimensions(800, 600);
    return { width: 800, height: 600 };
  };

  const drawUniformGrid = () => {
    if (!props.isActive) return;
    const id = containerDomId.value;
    const el = document.getElementById(id);
    if (!el) {
      return;
    }

    const dimensions = getDimensions();
    const m = TAIPEI_L3_GRID_MARGIN;
    const margin = { top: m, right: m, bottom: m, left: m };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;
    if (width <= 0 || height <= 0) {
      dataStore.clearSpaceNetworkGridL3MinCellDimensions();
      return;
    }

    const metrics = taipeiL3GridMetricsFromContainerPx(dimensions.width, dimensions.height);
    dataStore.updateSpaceNetworkGridL3MinCellDimensions(metrics);

    const cols = metrics.cols;
    const rows = metrics.rows;
    const cellW = width / cols;
    const cellH = height / rows;

    d3.select(`#${id}`).selectAll('svg').remove();

    const svg = d3
      .select(`#${id}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', COLOR_CONFIG.BACKGROUND)
      .style('transition', 'all 0.2s ease-in-out');

    // 主網格線（與 GridScalingTab.drawGridLines 邊界線一致）
    for (let i = 0; i <= cols; i++) {
      const xPos = i * cellW;
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('x1', margin.left + xPos)
        .attr('y1', margin.top)
        .attr('x2', margin.left + xPos)
        .attr('y2', margin.top + height);
    }
    for (let j = 0; j <= rows; j++) {
      const yPos = j * cellH;
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE)
        .style('stroke-width', 1)
        .attr('x1', margin.left)
        .attr('y1', margin.top + yPos)
        .attr('x2', margin.left + width)
        .attr('y2', margin.top + yPos);
    }

    // 次網格線（格心，與 GridScalingTab 次要線語意相同）
    for (let i = 0; i < cols; i++) {
      const xCenter = (i + 0.5) * cellW;
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE_SECONDARY)
        .style('stroke-width', 1)
        .attr('x1', margin.left + xCenter)
        .attr('y1', margin.top)
        .attr('x2', margin.left + xCenter)
        .attr('y2', margin.top + height);
    }
    for (let j = 0; j < rows; j++) {
      const yCenter = (j + 0.5) * cellH;
      svg
        .append('line')
        .style('stroke', COLOR_CONFIG.GRID_LINE_SECONDARY)
        .style('stroke-width', 1)
        .attr('x1', margin.left)
        .attr('y1', margin.top + yCenter)
        .attr('x2', margin.left + width)
        .attr('y2', margin.top + yCenter);
    }
  };

  const resize = () => {
    if (!props.isActive) return;
    const container = document.getElementById(containerDomId.value);
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setTimeout(() => resize(), 100);
      return;
    }
    getDimensions();
    drawUniformGrid();
  };

  watch(
    () => dataStore.controlActiveLayerId,
    (id) => {
      if (!id) return;
      if (!visibleL3Layers.value.some((l) => l.layerId === id)) return;
      emit('active-layer-change', id);
    },
    { flush: 'post' }
  );

  watch(
    () => visibleL3Layers.value,
    (layers) => {
      if (layers.length === 0) {
        return;
      }
      emit('active-layer-change', props.layerId);
      nextTick(() => resize());
    },
    { deep: true, immediate: true }
  );

  watch(
    () => props.containerHeight,
    () => nextTick(() => resize())
  );

  watch(
    () => props.isActive,
    (on) => {
      if (on) nextTick(() => resize());
    }
  );

  onMounted(() => {
    window.addEventListener('resize', resize);
    const container = document.getElementById(containerDomId.value);
    if (container && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) resize();
        }
      });
      resizeObserver.observe(container);
      const parent = container.parentElement;
      if (parent) resizeObserver.observe(parent);
    }
    nextTick(() => resize());
  });

  onUnmounted(() => {
    window.removeEventListener('resize', resize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    dataStore.clearSpaceNetworkGridL3MinCellDimensions();
  });

  defineExpose({ resize });
</script>

<template>
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <div
      v-if="visibleL3Layers.length > 0"
      class="flex-grow-1 d-flex flex-column my-bgcolor-white"
      style="min-height: 0"
    >
      <div class="px-3 py-2 border-bottom">
        <span class="my-title-xs-gray">測試圖層風格 · </span>
        <span class="my-title-sm-black"
          >動態網格（單格≤{{ TAIPEI_L3_MAX_CELL_PT }}pt，{{ layerId }}）</span
        >
      </div>
      <div class="flex-grow-1 d-flex flex-column" style="min-height: 0">
        <div
          :id="containerDomId"
          class="space-network-grid-l3-fixed-host w-100 h-100 flex-grow-1"
          style="min-height: 0; overflow: hidden"
        />
      </div>
    </div>
    <div v-else class="flex-grow-1 d-flex align-items-center justify-content-center">
      <div class="text-center my-title-md-gray p-3">請先開啟「{{ targetLayerTitle }}」圖層</div>
    </div>
  </div>
</template>

<style scoped>
  .space-network-grid-l3-fixed-host {
    position: relative;
    overflow: hidden;
  }
</style>
