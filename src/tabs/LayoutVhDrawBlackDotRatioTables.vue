<script setup>
  import { computed } from 'vue';
  import { useDataStore } from '@/stores/dataStore.js';
  import { computeLayoutVhDrawBlackDotRowColRatioReport } from '@/utils/layers/json_grid_coord_normalized/index.js';

  const props = defineProps({
    layer: { type: Object, required: true },
  });

  const dataStore = useDataStore();

  const report = computed(() => {
    const fc = props.layer?.geojsonData;
    if (!fc || fc.type !== 'FeatureCollection') return null;
    return computeLayoutVhDrawBlackDotRowColRatioReport(dataStore, fc);
  });

  const showTables = computed(
    () =>
      report.value &&
      (report.value.colRatios?.length || report.value.rowRatios?.length)
  );
</script>

<template>
  <div
    v-if="showTables"
    class="border rounded overflow-auto bg-body mb-2"
    style="max-height: 220px; font-size: 11px"
  >
    <div class="px-2 py-1 border-bottom text-muted">
      {{ report.nCols }} 欄 × {{ report.nRows }} 列；Σ<sub>欄</sub>={{ report.sumColMax }} ，Σ<sub>列</sub>={{
        report.sumRowMax
      }}
      — {{ new Date(report.computedAt).toLocaleString() }}
    </div>
    <div class="px-2 py-1 fw-semibold small bg-secondary bg-opacity-10">欄（x 區間）</div>
    <table class="table table-sm table-bordered mb-0 align-middle">
      <thead class="sticky-top bg-secondary bg-opacity-10">
        <tr class="text-nowrap">
          <th>#</th>
          <th>x</th>
          <th>max</th>
          <th>比例</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, ix) in report.colRatios" :key="'bdcol-' + ix">
          <td>{{ ix }}</td>
          <td class="text-nowrap">
            {{ report.xTicks[ix] }}～{{ report.xTicks[ix + 1] }}
          </td>
          <td>{{ report.colMaxBlackDots[ix] }}</td>
          <td>{{ (Number(r) * 100).toFixed(2) }}%</td>
        </tr>
      </tbody>
    </table>
    <div class="px-2 py-1 fw-semibold small bg-secondary bg-opacity-10">列（y 區間）</div>
    <table class="table table-sm table-bordered mb-0 align-middle">
      <thead class="sticky-top bg-secondary bg-opacity-10">
        <tr class="text-nowrap">
          <th>#</th>
          <th>y</th>
          <th>max</th>
          <th>比例</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, jy) in report.rowRatios" :key="'bdrow-' + jy">
          <td>{{ jy }}</td>
          <td class="text-nowrap">
            {{ report.yTicks[jy] }}～{{ report.yTicks[jy + 1] }}
          </td>
          <td>{{ report.rowMaxBlackDots[jy] }}</td>
          <td>{{ (Number(r) * 100).toFixed(2) }}%</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div
    v-else-if="layer.geojsonData?.type === 'FeatureCollection'"
    class="text-muted my-font-size-xs mb-2 py-1"
    style="line-height: 1.45"
  >
    無法列出比例表：請確認 geojson 內至少有一條 LineString 路線。
  </div>
  <div v-else class="text-muted my-font-size-xs mb-2 py-1" style="line-height: 1.45">
    本層尚無 geojson；開啟圖層或待路網同步後即會自動顯示比例表。
  </div>
</template>
