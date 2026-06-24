/** Control 分頁片段：{@link LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID}（空間網絡網格群·先直後橫·繪製） */
<script setup>
  defineProps({
    layer: { type: Object, required: true },
    isExecuting: { type: Boolean, required: true },
    /** {@link useOrthogonalVhDrawControlTab} 回傳值 */
    api: { type: Object, required: true },
  });
</script>

<template>
  <div
    v-if="layer.layerId === api.LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID"
    class="pb-3 mb-3 border-bottom"
  >
    <div class="my-title-xs-gray pb-2">本機 JSON（路段匯出）</div>
    <button
      type="button"
      class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-blue mb-2"
      :disabled="isExecuting || layer.isLoading"
      @click="api.pickOrthogonalVhDrawLocalJsonClick"
    >
      選擇 JSON 檔讀入…
    </button>
    <button
      type="button"
      class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
      :disabled="isExecuting || layer.isLoading || !layer.spaceNetworkGridJsonData?.length"
      @click="api.downloadOrthogonalVhDrawControlTabJson"
    >
      下載 JSON（與 json-viewer dataJson 一致）
    </button>
    <div
      v-if="layer.vhDrawUserJsonOverride && layer.jsonFileName"
      class="text-muted my-font-size-xs mb-2"
      style="line-height: 1.45"
    >
      目前來源：<strong>{{ layer.jsonFileName }}</strong
      >（不會隨 VH 層自動更新）
    </div>
    <div class="my-title-xs-gray pb-2">一鍵批次（不跳視窗）</div>
    <button
      type="button"
      class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green mb-2"
      :disabled="isExecuting || layer.isLoading || api.vhDrawUnitL45AutoActive"
      @click="api.onOrthogonalVhDrawTripleBatchClick(layer)"
    >
      一鍵執行：L flip 全網 → 斜邊→正交 L → 斜邊→N／Z → 斜邊→H／V／45° → 單位 L→45°
    </button>
    <button
      type="button"
      class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-orange mb-2"
      :disabled="isExecuting || layer.isLoading || api.vhDrawUnitL45AutoActive"
      @click="api.onOrthogonalVhDrawTripleBatchClick(layer, { skipUnitL45: true })"
    >
      一鍵執行：L flip 全網 → 斜邊→正交 L → 斜邊→N／Z → 斜邊→H／V／45°（不執行 單位正交
      L→45°）
    </button>
    <div
      v-if="api.vhDrawTripleBatchHint"
      class="text-muted my-font-size-xs mb-3"
      style="line-height: 1.45"
    >
      {{ api.vhDrawTripleBatchHint }}
    </div>
    <div class="my-title-xs-gray pb-2">正交 L 形標示</div>
    <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
      轉折格在<strong>完整路網</strong>（含斜線）上須<strong>僅兩條邊</strong>，且皆為水平／垂直並垂直（不可有第三線或斜線接在轉角）。兩臂沿
      H／V
      延伸，每到一格若在完整路網上有與<strong>臂走向不共線</strong>之連線（含斜線、橫／豎分歧）即為該臂端點並停止。含單一折線內轉角與多路段端點相接之轉角。
    </div>
    <div class="d-grid gap-2 mb-2">
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-primary"
        :disabled="isExecuting || api.vhDrawDiagonalRouteAutoActive || api.vhDrawUnitL45AutoActive"
        @click="api.onOrthogonalVhDrawLShapeOneClick(layer)"
      >
        下一步：標示下一個 L，若可行則 flip（不可行寫原因）
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
        :class="api.vhDrawLShapeAutoActive ? 'my-btn-orange' : 'my-btn-blue'"
        :disabled="isExecuting || api.vhDrawUnitL45AutoActive"
        @click="api.toggleOrthogonalVhDrawLShapeAuto(layer)"
      >
        {{
          api.vhDrawLShapeAutoActive
            ? '停止自動（每秒一個 L）'
            : '自動執行：每秒一個 L 並嘗試 flip'
        }}
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green"
        :disabled="isExecuting || api.vhDrawLShapeAutoActive || api.vhDrawUnitL45AutoActive"
        @click="api.onOrthogonalVhDrawLShapeHighlightAllClick(layer)"
      >
        一鍵：連續 flip 所有可行 L（不可行寫停止原因）
      </button>
    </div>
    <div
      v-if="api.vhDrawLShapeStepHint"
      class="text-muted my-font-size-xs mb-3"
      style="line-height: 1.45"
    >
      {{ api.vhDrawLShapeStepHint }}
    </div>
    <div class="my-title-xs-gray pb-2">斜向邊 → 正交 L</div>
    <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
      僅嘗試兩種<strong>正交 L</strong>（一角、兩段 H／V）；不試
      N／Z。逐條處理單一斜向邊；約束同下（交叉／共線重疊／壓紅藍／轉角疊他線頂點則略過）。
    </div>
    <div class="d-grid gap-2 mb-3">
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-primary"
        :disabled="
          isExecuting ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawDiagonalOneRouteClick(layer, 'l')"
      >
        下一步：下一條路線（僅 L；該線斜邊清完後換下一條，循環）
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
        :class="
          api.vhDrawDiagonalRouteAutoActive && api.vhDrawDiagonalRouteAutoKind === 'l'
            ? 'my-btn-orange'
            : 'my-btn-blue'
        "
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawUnitL45AutoActive ||
          (api.vhDrawDiagonalRouteAutoActive && api.vhDrawDiagonalRouteAutoKind !== 'l')
        "
        @click="api.toggleOrthogonalVhDrawDiagonalRouteAuto(layer, 'l')"
      >
        {{ api.vhDrawDiagonalAutoButtonLabel('l') }}
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green"
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawDiagonalToLClick(layer, 'l')"
      >
        一鍵全路網：非 H／V 邊 → 僅正交 L（兩段）
      </button>
    </div>

    <div class="my-title-xs-gray pb-2">斜向邊 → N／Z 形</div>
    <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
      不試 L，僅以 <strong>Z</strong>（橫─豎─橫）或
      <strong>N／反 N</strong
      >（豎─橫─豎）替換斜邊，內點轉角枚舉；約束同上。平手時「先直後橫」偏好（N 優先於 Z）。
    </div>
    <div class="d-grid gap-2 mb-2">
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-primary"
        :disabled="
          isExecuting ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawDiagonalOneRouteClick(layer, 'nz')"
      >
        下一步：下一條路線（僅 N／Z；該線斜邊清完後換下一條，循環）
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
        :class="
          api.vhDrawDiagonalRouteAutoActive && api.vhDrawDiagonalRouteAutoKind === 'nz'
            ? 'my-btn-orange'
            : 'my-btn-blue'
        "
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawUnitL45AutoActive ||
          (api.vhDrawDiagonalRouteAutoActive && api.vhDrawDiagonalRouteAutoKind !== 'nz')
        "
        @click="api.toggleOrthogonalVhDrawDiagonalRouteAuto(layer, 'nz')"
      >
        {{ api.vhDrawDiagonalAutoButtonLabel('nz') }}
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green"
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawDiagonalToLClick(layer, 'nz')"
      >
        一鍵全路網：非 H／V 邊 → 僅 N／Z（三正交段）
      </button>
    </div>

    <div class="my-title-xs-gray pb-2">斜向邊 → H／V／45°</div>
    <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
      不試 L、不試 N／Z。僅處理
      <strong>|Δx|≠|Δy|</strong> 之斜邊：每段僅水平、垂直或 45°（|Δx|=|Δy|）。轉折可在<strong
        >0.5 格</strong
      >（枚舉半格刻度）。含<strong>單轉折</strong>兩段（先斜後正／先正後斜）與<strong>雙轉折</strong>三段（斜線─直線─斜線）。若該邊已是單段
      45° 則略過。約束同 L／N／Z。
    </div>
    <div class="d-grid gap-2 mb-2">
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-primary"
        :disabled="
          isExecuting ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawDiagonalOneRouteClick(layer, 'hv45')"
      >
        下一步：下一條路線（H／V／45°；該線可換之斜邊清完後換下一條，循環）
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
        :class="
          api.vhDrawDiagonalRouteAutoActive && api.vhDrawDiagonalRouteAutoKind === 'hv45'
            ? 'my-btn-orange'
            : 'my-btn-blue'
        "
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawUnitL45AutoActive ||
          (api.vhDrawDiagonalRouteAutoActive && api.vhDrawDiagonalRouteAutoKind !== 'hv45')
        "
        @click="api.toggleOrthogonalVhDrawDiagonalRouteAuto(layer, 'hv45')"
      >
        {{ api.vhDrawDiagonalAutoButtonLabel('hv45') }}
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green"
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawDiagonalToLClick(layer, 'hv45')"
      >
        一鍵全路網：|Δx|≠|Δy| 斜邊 → H／V／45°（0.5 格·一至兩轉折）
      </button>
    </div>
    <div
      v-if="api.vhDrawDiagonalRouteStepHint"
      class="text-muted my-font-size-xs mb-2"
      style="line-height: 1.45"
    >
      {{ api.vhDrawDiagonalRouteStepHint }}
    </div>
    <div class="my-title-xs-gray pb-2">單位正交 L → 45°</div>
    <div class="text-muted my-font-size-xs mb-2" style="line-height: 1.45">
      前面 L flip 與斜向邊轉換完成後再執行。轉角為先橫／豎再豎／橫之正交
      L，且自轉角沿兩臂各至少
      <strong>1</strong>
      格時，將靠轉角之<strong>各 1 格</strong>（必要時自動插入折點）換成<strong
        >單一 45° 斜線</strong
      >並移除原位轉折；預覽仍以
      L（兩段各一格）呈現。約束同上：無交叉、無與他線共線重疊、頂點不落在他線開放段上、線段開放內部不壓紅／藍
      connect；轉折為 connect 站點時略過。
    </div>
    <div class="d-grid gap-2 mb-2">
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer btn-outline-primary"
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawUnitL45OneClick(layer)"
      >
        下一步：下一個單位 L → 45°（可行則替換，不可行寫原因）
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer"
        :class="api.vhDrawUnitL45AutoActive ? 'my-btn-orange' : 'my-btn-blue'"
        :disabled="isExecuting || api.vhDrawLShapeAutoActive || api.vhDrawDiagonalRouteAutoActive"
        @click="api.toggleOrthogonalVhDrawUnitL45Auto(layer)"
      >
        {{
          api.vhDrawUnitL45AutoActive
            ? '停止自動（每秒一個單位 L）'
            : '自動執行：每秒一個單位 L → 45°'
        }}
      </button>
      <button
        type="button"
        class="btn rounded-pill border-0 my-font-size-xs text-nowrap w-100 my-cursor-pointer my-btn-green"
        :disabled="
          isExecuting ||
          api.vhDrawLShapeAutoActive ||
          api.vhDrawDiagonalRouteAutoActive ||
          api.vhDrawUnitL45AutoActive
        "
        @click="api.onOrthogonalVhDrawUnitLTo45Click(layer)"
      >
        一鍵全路網：單位 L → 45°（僅安全處）
      </button>
    </div>
    <div
      v-if="api.vhDrawUnitL45Hint"
      class="text-muted my-font-size-xs mb-3"
      style="line-height: 1.45"
    >
      {{ api.vhDrawUnitL45Hint }}
    </div>
    <div class="text-muted my-font-size-xs" style="line-height: 1.45">
      <strong>JSON</strong>：與 taipei_e／f／j3 下載相同之<strong>純陣列</strong>或含
      <code class="small">mapDrawnRoutes</code>
      之物件。各區塊共用同一條路線序號與提示列；斜向替換之自動執行僅能擇一（L、N／Z、H／V／45°）運行。
    </div>
  </div>
</template>
