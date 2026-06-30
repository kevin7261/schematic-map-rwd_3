/** Control：版面網絡網格家族（layout_network_grid_from_vh_draw／_copy／_2） */
<script setup>
  import LayoutVhDrawBlackDotRatioTables from '@/tabs/LayoutVhDrawBlackDotRatioTables.vue';
  import LayoutVhDrawDashSubgridPtHint from '@/tabs/LayoutVhDrawDashSubgridPtHint.vue';

  defineProps({
    layer: { type: Object, required: true },
    isExecuting: { type: Boolean, required: true },
    /** {@link useLayoutNetworkGridFromVhDrawControlTab} */
    api: { type: Object, required: true },
    /** 管線四階段圖層：改由 Control 頂部「匯入／匯出 JSON（斷點存檔）」 */
    hideLegacyJsonIo: { type: Boolean, default: false },
  });
</script>

<template>
  <template v-if="api.isLayoutNetworkGridFromVhDrawControlLayer(layer)">
    <div
      v-if="api.isSecondCopyLayer(layer)"
      class="pb-3 mb-3 border-bottom"
    >
      <div class="my-title-xs-gray pb-2">滑鼠所在座標</div>
      <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
        於 Upper「<strong>layout-grid</strong>」檢視移動滑鼠，顯示游標所在之子網格 (x,
        y)（將目前灰網格每格寬、高各切 4＝4×4 細格；x 自左、y 自下往上，依細格個數編號 1,2,3…；與
        pt 無關）。開啟下方放大鏡開關後，以該細格為焦點做 fisheye 變形：焦點欄／列放大 5
        倍，每往外一格 −1（最小 1 倍），格線與路線、點隨之變形且路線維持 H/V/45°。pt 座標另列供參。
      </div>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="my-content-sm-black">滑鼠放大鏡變形（fisheye）</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-fisheye-' + layer.layerId"
            :checked="layer.layoutVhDrawFisheyeEnabled === true"
            @change="api.onLayoutVhDrawFisheyeEnabledChange(layer, $event.target.checked)"
          />
          <label :for="'switch-layout-vh-fisheye-' + layer.layerId"></label>
        </div>
      </div>
      <div class="my-content-sm-black mb-1">
        子網格 (x, y) =
        <strong>{{
          api.layoutVhDrawViewerMousePt &&
          api.layoutVhDrawViewerMousePt.subX != null &&
          api.layoutVhDrawViewerMousePt.subY != null
            ? `(${api.layoutVhDrawViewerMousePt.subX}, ${api.layoutVhDrawViewerMousePt.subY})`
            : '—'
        }}</strong>
      </div>
      <div class="my-content-sm-black mb-2">
        pt 座標 (x, y) =
        <strong>{{
          api.layoutVhDrawViewerMousePt &&
          api.layoutVhDrawViewerMousePt.x != null &&
          api.layoutVhDrawViewerMousePt.y != null
            ? `(${api.layoutVhDrawViewerMousePt.x}, ${api.layoutVhDrawViewerMousePt.y}) pt`
            : '—'
        }}</strong>
      </div>
      <div class="d-flex align-items-center justify-content-between mb-1">
        <div class="my-content-sm-black">最短路徑選取模式</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-pathsel-' + layer.layerId"
            :checked="layer.layoutVhDrawPathSelectMode === true"
            @change="api.onLayoutVhDrawPathSelectModeChange(layer, $event.target.checked)"
          />
          <label :for="'switch-layout-vh-pathsel-' + layer.layerId"></label>
        </div>
      </div>
      <div class="text-muted my-font-size-xs mb-1" style="line-height: 1.45">
        開啟後在檢視中點兩個<strong>紅／藍點</strong>（已選者橘色外環），以導航式最短路徑（Dijkstra
        於「車站×路線」狀態圖求最佳）：每經過一站（紅/藍/黑點）成本 <strong>1</strong>、每次<strong>轉乘成本
        5</strong>（＝願意多繞 5 站換免一次轉乘）。沿線經過的欄／列放大
        5 倍、路段加粗、標起迄站名；點第三個重設起點。此模式與滑鼠放大鏡互斥（選滿 2
        點即以路徑放大為準）。
      </div>
      <div class="my-content-sm-black mb-1">
        已選紅／藍點：<strong>{{ api.layoutVhDrawPathSelCount }}</strong> / 2
      </div>
      <div
        v-if="api.layoutVhDrawPathSelCount === 2"
        class="my-content-sm-black mb-1"
      >
        <template v-if="api.layoutVhDrawPathInfo && api.layoutVhDrawPathInfo.found">
          路線：經過 <strong>{{ api.layoutVhDrawPathInfo.stations }}</strong> 站、轉乘
          <strong>{{ api.layoutVhDrawPathInfo.transfers }}</strong> 次
        </template>
        <template v-else>
          <span class="text-danger">兩點間無法連通</span>
        </template>
      </div>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-secondary"
        :disabled="api.layoutVhDrawPathSelCount === 0"
        @click="api.onClearLayoutVhDrawPathSel()"
      >
        清除路徑選取
      </button>
    </div>

    <div class="pb-3 mb-3 border-bottom">
      <div class="my-title-xs-gray pb-2">粗格版面：欄／列黑點 max 比例（分開歸一）</div>
      <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
        各<strong>欄開區間</strong>與<strong>列開區間</strong>分別算出刻度間 black-dot max
        後，在<strong>同一方向</strong>內加總歸一（欄、列互不混算；與版面網格區間標註同源）。
        若該方向全系皆為 0，該方向各段比例均等。下方比例表依<strong>目前 geojson 路網</strong
        >自動計算（粗格／格座標區間，無須按鈕）。<strong>黑點數顯示比例</strong>／<strong
          >weight 顯示比例</strong
        >僅於 Upper「<strong>layout-grid</strong>」分頁生效：依該檢視之 pt 區間即時算出之
        black-dot max（藍字）或線 weight max（綠字）Σ 歸一後重設欄寬／列高（兩者擇一）。
      </div>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="my-content-sm-black">黑點數顯示比例</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-draw-bd-rowcol-' + layer.layerId"
            :checked="layer.layoutVhDrawShowBlackDotRowColRatioOverlay === true"
            @change="
              api.onLayoutVhDrawShowBlackDotRowColRatioOverlayChange(layer, $event.target.checked)
            "
          />
          <label :for="'switch-layout-vh-draw-bd-rowcol-' + layer.layerId"></label>
        </div>
      </div>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="my-content-sm-black">weight 顯示比例</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-draw-weight-rowcol-' + layer.layerId"
            :checked="layer.layoutVhDrawShowWeightRowColRatioOverlay === true"
            @change="
              api.onLayoutVhDrawShowWeightRowColRatioOverlayChange(layer, $event.target.checked)
            "
          />
          <label :for="'switch-layout-vh-draw-weight-rowcol-' + layer.layerId"></label>
        </div>
      </div>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="my-content-sm-black">自動隱藏黑點（依間距）</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-draw-auto-hide-mid-' + layer.layerId"
            :checked="layer.layoutVhDrawAutoHideMidBlackDots === true"
            @change="api.onLayoutVhDrawAutoHideMidBlackDotsChange(layer, $event.target.checked)"
          />
          <label :for="'switch-layout-vh-draw-auto-hide-mid-' + layer.layerId"></label>
        </div>
      </div>
      <div
        v-if="api.isMainCopyLayer(layer)"
        class="d-flex flex-wrap align-items-center gap-2 mb-2"
      >
        <label
          class="my-content-sm-black mb-0 text-nowrap"
          :for="'layout-vh-draw-nei-min-pt-' + layer.layerId"
          >子網格鄰線最小寬／高（pt）</label
        >
        <input
          :id="'layout-vh-draw-nei-min-pt-' + layer.layerId"
          type="number"
          class="form-control form-control-sm"
          style="width: 5.5rem"
          min="0.25"
          max="99"
          step="0.25"
          :value="
            Number(layer.layoutVhDrawWeightedNeighborHideMinPt) > 0
              ? layer.layoutVhDrawWeightedNeighborHideMinPt
              : api.LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT
          "
          @change="api.onLayoutVhDrawCopyWeightedNeighborHideMinPtChange(layer, $event)"
        />
        <span class="text-muted my-font-size-xs" style="line-height: 1.45"
          >細於此則依 weight_差值由小到大暫隱黑點，直至寬與高皆 ≥ 此值。</span
        >
      </div>
      <div
        v-if="api.isMainCopyLayer(layer)"
        class="mt-3"
      >
        <div class="my-content-sm-black mb-1">weight_差值 由小到大（黑點清單）</div>
        <div
          v-if="api.layoutVhDrawCopyRowsSortedByWeightDiffAsc(layer).length === 0"
          class="text-muted my-font-size-xs"
          style="line-height: 1.45"
        >
          尚無資料。請開啟本圖層並確認 VH 繪製層路網與中段站已同步（或載入／隨機 weight
          後會更新）。
        </div>
        <div
          v-else
          class="border rounded overflow-auto bg-body"
          style="max-height: 220px; font-size: 11px"
        >
          <table class="table table-sm table-bordered mb-0 align-middle">
            <thead class="sticky-top bg-secondary bg-opacity-10">
              <tr class="text-nowrap">
                <th>序</th>
                <th>weight_差值</th>
                <th>點位類型</th>
                <th>黑點站名</th>
                <th>路線</th>
                <th>與前</th>
                <th>與後</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(wdRow, wdIdx) in api.layoutVhDrawCopyRowsSortedByWeightDiffAsc(layer)"
                :key="'layout-wdiff-' + layer.layerId + '-' + wdIdx + '-' + (wdRow['#'] ?? '')"
              >
                <td>{{ wdIdx + 1 }}</td>
                <td>{{ wdRow.weight_差值 }}</td>
                <td class="text-nowrap">{{ wdRow.點位類型 }}</td>
                <td class="text-break">{{ wdRow.黑點站名 }}</td>
                <td class="text-break" style="max-width: 120px">{{ wdRow.路線 }}</td>
                <td class="text-nowrap">{{ wdRow.weight_與前站 }}</td>
                <td class="text-nowrap">{{ wdRow.weight_與後站 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <LayoutVhDrawDashSubgridPtHint :layer="layer" />
      <LayoutVhDrawBlackDotRatioTables :layer="layer" />
    </div>

    <!-- RMA 路網網格／路網網格_2：自「路線正規化」群組任一路網層匯入（同工作階段記憶體） -->
    <div v-if="api.isRmaLayer(layer)" class="pb-3 mb-3 border-bottom">
      <div class="my-title-xs-gray pb-2">匯入路網（路線正規化群組）</div>
      <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
        自「路線正規化」群組任一有路網之圖層匯入本層（黑點站沿線放回）。匯入後沿用所選來源，
        切換分頁不會被預設來源覆寫。無路網之來源按鈕為停用。跨工作階段存檔請用 Control 頂部「匯出／匯入
        JSON（斷點存檔）」。
      </div>
      <button
        v-for="src in api.routeNormalizationImportSources"
        :key="'rma-import-' + layer.layerId + '-' + src.layerId"
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
        :disabled="isExecuting || layer.isLoading || !api.routeNormSourceHasData(src.layerId)"
        @click="api.importRmaLayoutNetworkGridFrom(layer, src.layerId)"
      >
        從 {{ src.label }}
      </button>
    </div>

    <div v-else-if="!hideLegacyJsonIo" class="pb-3 mb-3 border-bottom">
      <div class="my-title-xs-gray pb-2">匯入路網</div>
      <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
        自上游「站點與路線往中心聚集」記憶體中的路網，或本機 JSON 檔，寫入
        <code class="small">orthogonal_toward_center_vh_draw</code>
        並同步路網網格（之後不再自動鏡像 VH）。
      </div>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
        :disabled="isExecuting || layer.isLoading"
        @click="api.importOrthogonalVhDrawFromConvergeCenter(api.convergeCenterVertFirstLayerId)"
      >
        從站點與路線往中心聚集（先直後橫）
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
        :disabled="isExecuting || layer.isLoading"
        @click="api.importOrthogonalVhDrawFromConvergeCenter(api.convergeCenterHorizFirstLayerId)"
      >
        從站點與路線往中心聚集（先橫後直）
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue mb-2"
        :disabled="isExecuting || layer.isLoading"
        @click="api.pickOrthogonalVhDrawLocalJsonClick"
      >
        匯入
      </button>
    </div>

    <div class="pb-3 mb-3 border-bottom">
      <template v-if="!api.isRmaLayer(layer) && !hideLegacyJsonIo">
        <div class="my-title-xs-gray pb-2">還原 VH 繪製（本機 JSON）</div>
        <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
          與「站點與路線（先直後橫）·dataJson 繪製」之<strong>選擇 JSON 檔讀入</strong>相同：寫入
          <code class="small">orthogonal_toward_center_vh_draw</code>
          的 dataJson／路網並同步路網網格。可先於該層<strong>下載 JSON</strong
          >後在此讀入，省去重跑先前步驟。
        </div>
        <button
          type="button"
          class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue mb-3"
          :disabled="isExecuting"
          @click="api.pickOrthogonalVhDrawLocalJsonClick"
        >
          選擇 JSON 檔讀入…
        </button>
      </template>
      <template v-if="api.isMainCopyLayer(layer)">
        <div class="my-title-xs-gray pb-2">路段交通流量（CSV）</div>
        <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
          來源：<code class="small">{{ layer.csvFileName_traffic }}</code
          >（站點A、站點B、總人次）。載入後在每條路段折線中點顯示對應
          <strong>總人次</strong>；無對應資料者顯示 <strong>0</strong>。「全部隨機 weight」無須
          CSV：會依 VH 繪製層<strong>沿路每一相鄰邊</strong>（含原未 assign／原為 0 者）抽 1–9（機率∝<code
            class="small"
            >1/2<sup>k</sup></code
          >）；每次按鈕皆自路網重抽全表。CSV 若找不到相鄰紅／藍／黑點，會列在下方。
        </div>
      </template>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="my-content-sm-black">顯示 weight 標籤</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-draw-traffic-weights-' + layer.layerId"
            :checked="layer.layoutVhDrawShowTrafficWeights !== false"
            @change="api.onLayoutVhDrawShowTrafficWeightsChange(layer, $event.target.checked)"
          />
          <label :for="'switch-layout-vh-draw-traffic-weights-' + layer.layerId"></label>
        </div>
      </div>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="my-content-sm-black">顯示紅／藍點車站名稱</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-draw-endpoint-names-' + layer.layerId"
            :checked="layer.layoutVhDrawShowEndpointStationNames === true"
            @change="
              api.onLayoutVhDrawShowEndpointStationNamesChange(layer, $event.target.checked)
            "
          />
          <label :for="'switch-layout-vh-draw-endpoint-names-' + layer.layerId"></label>
        </div>
      </div>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="my-content-sm-black">顯示黑點車站名稱</div>
        <div class="layer-toggle flex-shrink-0" @click.stop>
          <input
            type="checkbox"
            :id="'switch-layout-vh-draw-mid-names-' + layer.layerId"
            :checked="layer.layoutVhDrawShowMidBlackDotStationNames === true"
            @change="
              api.onLayoutVhDrawShowMidBlackDotStationNamesChange(layer, $event.target.checked)
            "
          />
          <label :for="'switch-layout-vh-draw-mid-names-' + layer.layerId"></label>
        </div>
      </div>
      <div
        v-if="api.isMainCopyLayer(layer)"
        class="d-grid gap-2"
      >
        <button
          type="button"
          class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue"
          @click="api.onLayoutNetworkLoadTrafficCsvClick(layer)"
        >
          載入 mrt_link_volume_undirected.csv
        </button>
        <button
          type="button"
          class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green"
          @click="api.onLayoutNetworkRandomizeTrafficWeightsClick(layer)"
        >
          全部隨機 weight（1–9，反等比機率）
        </button>
        <button
          type="button"
          class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
          :class="
            api.isLayoutVhDrawAutoRandomWeightActive(layer)
              ? 'my-btn-blue'
              : 'btn-outline-secondary'
          "
          @click="api.onLayoutNetworkToggleAutoRandomizeTrafficWeightsClick(layer)"
        >
          {{
            api.isLayoutVhDrawAutoRandomWeightActive(layer)
              ? '停止每 5 秒隨機 weight'
              : '每 5 秒隨機 weight'
          }}
        </button>
        <button
          v-if="layer.layoutVhDrawTrafficData"
          type="button"
          class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-secondary"
          @click="api.onLayoutNetworkClearTrafficCsvClick(layer)"
        >
          清除交通流量資料（{{ layer.layoutVhDrawTrafficData.length }} 筆）
        </button>
      </div>
      <div
        v-if="layer.layoutVhDrawTrafficData && layer.layoutVhDrawTrafficMissing?.length"
        class="alert alert-warning my-font-size-xs mt-2 mb-0 py-2"
        style="line-height: 1.45"
      >
        <div class="fw-bold mb-1">
          CSV 找不到相鄰紅／藍／黑點：{{ layer.layoutVhDrawTrafficMissing.length }} 筆
        </div>
        <div class="overflow-auto" style="max-height: 120px">
          <div
            v-for="(it, idx) in layer.layoutVhDrawTrafficMissing"
            :key="'traffic-missing-' + idx"
            class="text-break"
          >
            #{{ idx + 1 }} {{ it.a }} - {{ it.b }}：{{ it.weight }}
            <span class="text-muted">({{ it.reason }})</span>
          </div>
        </div>
      </div>
      <div v-else-if="layer.layoutVhDrawTrafficData" class="text-success my-font-size-xs mt-2">
        CSV 所有 weight 皆已找到相鄰點。
      </div>
    </div>
  </template>
</template>

<style scoped>
  /* 與 ControlTab.vue 相同：pill 開關（子元件無法沿用父層 scoped） */
  .layer-toggle input[type='checkbox'] {
    height: 0;
    width: 0;
    visibility: hidden;
  }

  .layer-toggle label {
    cursor: pointer;
    width: 28px;
    height: 16px;
    background: var(--my-color-gray-300);
    display: block;
    border-radius: 16px;
    position: relative;
    transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .layer-toggle label:after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    background: var(--my-color-white);
    border-radius: 12px;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .layer-toggle input:checked + label {
    background: var(--my-color-green);
  }

  .layer-toggle input:checked + label:after {
    transform: translateX(12px);
  }

  .layer-toggle input:disabled + label {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
