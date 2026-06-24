/**
 * Control 分頁：版面網絡網格家族（layout_network_grid_from_vh_draw*）
 * 由原 ControlTab.vue 抽出，行為不變。
 */
import { nextTick, reactive } from 'vue';
import {
  LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
  LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT,
  jsonGridFromCoordNormalizedPersistPayload,
  syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy,
  applyLayoutTrafficCsvToVhDrawLayerRoots,
  applyRandomLayoutTrafficWeightsToVhDrawLayerRoots,
} from '@/utils/layers/json_grid_coord_normalized/index.js';
import {
  layoutVhDrawAutoRandomWeightLayerId,
  isLayoutVhDrawAutoRandomWeightActive,
  stopLayoutVhDrawAutoRandomWeight,
  toggleLayoutVhDrawAutoRandomWeight,
} from './layoutVhDrawAutoRandomWeightTimer.js';

/**
 * @param {{
 *   dataStore: import('@/stores/dataStore.js').ReturnType;
 *   pickOrthogonalVhDrawLocalJsonClick: () => void;
 *   importOrthogonalVhDrawFromConvergeCenter: (sourceLayerId: string) => void;
 *   convergeCenterVertFirstLayerId: string;
 *   convergeCenterHorizFirstLayerId: string;
 * }} opts
 */
export function useLayoutNetworkGridFromVhDrawControlTab({
  dataStore,
  pickOrthogonalVhDrawLocalJsonClick,
  importOrthogonalVhDrawFromConvergeCenter,
  convergeCenterVertFirstLayerId,
  convergeCenterHorizFirstLayerId,
}) {
  const persistLayoutVhDrawGridRoutesDataJsonSnapshotCopy = () => {
    syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy((id) => dataStore.findLayerById(id));
    const lay = dataStore.findLayerById(LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY);
    if (lay) {
      dataStore.saveLayerState(
        lay.layerId,
        jsonGridFromCoordNormalizedPersistPayload(lay, { omitLoadingFlags: true })
      );
    }
  };

  const isLayoutNetworkGridFromVhDrawControlLayer = (lyr) =>
    !!lyr &&
    (lyr.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY ||
      lyr.layerId === LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2);

  const layoutVhDrawCopyRowsSortedByWeightDiffAsc = (lyr) => {
    if (!lyr || lyr.layerId !== LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY) return [];
    const rows = lyr.dataTableData;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return [...rows].sort((a, b) => {
      const da = Number(a?.weight_差值);
      const db = Number(b?.weight_差值);
      const na = Number.isFinite(da) ? da : 0;
      const nb = Number.isFinite(db) ? db : 0;
      if (na !== nb) return na - nb;
      const ia = Number(a?.['#']);
      const ib = Number(b?.['#']);
      if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
      return 0;
    });
  };

  const onLayoutNetworkLoadTrafficCsvClick = async (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    try {
      const rel = String(lyr.csvFileName_traffic ?? '').trim();
      if (!rel || rel.includes('..')) throw new Error('無效的 csvFileName_traffic');
      const base = process.env.BASE_URL ?? '/';
      const csvUrl = `${base.endsWith('/') ? base : `${base}/`}data/${rel}`;
      const resp = await fetch(csvUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) throw new Error('CSV 內容不足');
      const header = lines[0].split(',');
      const aIdx = header.findIndex((c) => c.includes('站點A'));
      const bIdx = header.findIndex((c) => c.includes('站點B'));
      const wIdx = header.findIndex((c) => c.includes('總人次') || c === 'weight');
      if (aIdx < 0 || bIdx < 0 || wIdx < 0)
        throw new Error(`CSV 欄位未找到（header: ${header.join(',')}）`);
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length <= Math.max(aIdx, bIdx, wIdx)) continue;
        const a = parts[aIdx].trim();
        const b = parts[bIdx].trim();
        const w = Number(parts[wIdx]);
        if (!a || !b || !Number.isFinite(w)) continue;
        data.push({ a, b, weight: w });
      }
      lyr.layoutVhDrawTrafficData = data;
      lyr.layoutVhDrawTrafficMissing = [];
      applyLayoutTrafficCsvToVhDrawLayerRoots(
        dataStore,
        LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
        data
      );
      const vhDraw = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
      if (vhDraw) {
        dataStore.saveLayerState(vhDraw.layerId, {
          jsonData: vhDraw.jsonData,
          dataJson: vhDraw.dataJson,
          processedJsonData: vhDraw.processedJsonData,
        });
      }
      persistLayoutVhDrawGridRoutesDataJsonSnapshotCopy();
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
    } catch (err) {
      console.error(err);
      window.alert('載入 CSV 失敗：' + err.message);
    }
  };

  const onLayoutNetworkClearTrafficCsvClick = async (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawTrafficData = null;
    lyr.layoutVhDrawTrafficMissing = [];
    applyLayoutTrafficCsvToVhDrawLayerRoots(
      dataStore,
      LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
      null
    );
    const vhDrawClear = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    if (vhDrawClear) {
      dataStore.saveLayerState(vhDrawClear.layerId, {
        jsonData: vhDrawClear.jsonData,
        dataJson: vhDrawClear.dataJson,
        processedJsonData: vhDrawClear.processedJsonData,
      });
    }
    persistLayoutVhDrawGridRoutesDataJsonSnapshotCopy();
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowTrafficWeightsChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowTrafficWeights = checked;
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawAutoHideMidBlackDotsChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawAutoHideMidBlackDots = checked === true;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowEndpointStationNamesChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowEndpointStationNames = checked === true;
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowMidBlackDotStationNamesChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowMidBlackDotStationNames = checked === true;
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 路網網格_2：清除最短路徑放大所選的紅/藍點。 */
  const onClearLayoutVhDrawPathSel = async () => {
    dataStore.clearLayoutVhDrawPathSel();
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 路網網格_2：最短路徑選取模式開關。關閉時一併清除已選紅/藍點。 */
  const onLayoutVhDrawPathSelectModeChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawPathSelectMode = checked === true;
    if (!lyr.layoutVhDrawPathSelectMode) dataStore.clearLayoutVhDrawPathSel();
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  /** 路網網格_2：layout-grid 滑鼠放大鏡（fisheye）開關。開啟才執行變形。 */
  const onLayoutVhDrawFisheyeEnabledChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawFisheyeEnabled = checked === true;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowBlackDotRowColRatioOverlayChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowBlackDotRowColRatioOverlay = checked === true;
    // 比例來源擇一：開啟黑點數比例時關閉 weight 比例
    if (checked === true) lyr.layoutVhDrawShowWeightRowColRatioOverlay = false;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawShowWeightRowColRatioOverlayChange = async (lyr, checked) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    lyr.layoutVhDrawShowWeightRowColRatioOverlay = checked === true;
    // 比例來源擇一：開啟 weight 比例時關閉黑點數比例
    if (checked === true) lyr.layoutVhDrawShowBlackDotRowColRatioOverlay = false;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutVhDrawCopyWeightedNeighborHideMinPtChange = async (lyr, ev) => {
    if (!lyr || lyr.layerId !== LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY) return;
    let v = Number(ev?.target?.value);
    if (!Number.isFinite(v)) v = LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT;
    v = Math.min(99, Math.max(0.25, v));
    lyr.layoutVhDrawWeightedNeighborHideMinPt = v;
    dataStore.saveLayerState(
      lyr.layerId,
      jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true })
    );
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const sampleLayoutTrafficWeight1to9InverseGeometric = (ratio = 2) => {
    const r = Math.max(1.0001, Number(ratio));
    const weights = [];
    let sum = 0;
    for (let k = 1; k <= 9; k++) {
      const w = 1 / r ** k;
      weights.push(w);
      sum += w;
    }
    let u = Math.random() * sum;
    for (let i = 0; i < weights.length; i++) {
      u -= weights[i];
      if (u <= 0) return i + 1;
    }
    return 9;
  };

  const applyLayoutNetworkRandomizeTrafficWeights = async (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    const vhDraw = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    if (!vhDraw) {
      window.alert('找不到 VH 繪製層（orthogonal_toward_center_vh_draw）。');
      stopLayoutVhDrawAutoRandomWeight();
      return;
    }

    dataStore.requestLayoutVhDrawRouteWeightAnim(lyr.layerId);

    const sampleFn = () => sampleLayoutTrafficWeight1to9InverseGeometric(2);
    const dataRows = applyRandomLayoutTrafficWeightsToVhDrawLayerRoots(
      dataStore,
      LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
      sampleFn
    );
    if (!dataRows.length) {
      window.alert(
        '尚無可產生 weight 的相鄰路段。請確認 VH 繪製層已有路網（站名、station_id 或格點座標），或改用載入 CSV。'
      );
      stopLayoutVhDrawAutoRandomWeight();
      return;
    }
    lyr.layoutVhDrawTrafficData = dataRows;

    lyr.layoutVhDrawTrafficMissing = [];
    const vhDrawRand = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    if (vhDrawRand) {
      dataStore.saveLayerState(vhDrawRand.layerId, {
        jsonData: vhDrawRand.jsonData,
        dataJson: vhDrawRand.dataJson,
        processedJsonData: vhDrawRand.processedJsonData,
      });
    }
    persistLayoutVhDrawGridRoutesDataJsonSnapshotCopy();
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onLayoutNetworkRandomizeTrafficWeightsClick = (lyr) =>
    applyLayoutNetworkRandomizeTrafficWeights(lyr);

  const onLayoutNetworkToggleAutoRandomizeTrafficWeightsClick = (lyr) => {
    if (!isLayoutNetworkGridFromVhDrawControlLayer(lyr)) return;
    toggleLayoutVhDrawAutoRandomWeight(lyr.layerId, () =>
      applyLayoutNetworkRandomizeTrafficWeights(lyr)
    );
  };

  return reactive({
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
    LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
    LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT,
    /** 路網網格_2：layout-grid-viewer 目前滑鼠所在 pt 座標（{x,y}，無則為 null） */
    get layoutVhDrawViewerMousePt() {
      return dataStore.layoutVhDrawViewerMousePt;
    },
    isLayoutNetworkGridFromVhDrawControlLayer,
    layoutVhDrawCopyRowsSortedByWeightDiffAsc,
    pickOrthogonalVhDrawLocalJsonClick,
    importOrthogonalVhDrawFromConvergeCenter,
    convergeCenterVertFirstLayerId,
    convergeCenterHorizFirstLayerId,
    onLayoutNetworkLoadTrafficCsvClick,
    onLayoutNetworkClearTrafficCsvClick,
    onLayoutVhDrawShowTrafficWeightsChange,
    onLayoutVhDrawShowEndpointStationNamesChange,
    onLayoutVhDrawShowMidBlackDotStationNamesChange,
    onLayoutVhDrawFisheyeEnabledChange,
    onLayoutVhDrawPathSelectModeChange,
    onClearLayoutVhDrawPathSel,
    get layoutVhDrawPathSelCount() {
      return Array.isArray(dataStore.layoutVhDrawPathSel) ? dataStore.layoutVhDrawPathSel.length : 0;
    },
    get layoutVhDrawPathInfo() {
      return dataStore.layoutVhDrawPathInfo;
    },
    onLayoutVhDrawShowBlackDotRowColRatioOverlayChange,
    onLayoutVhDrawShowWeightRowColRatioOverlayChange,
    onLayoutVhDrawAutoHideMidBlackDotsChange,
    onLayoutVhDrawCopyWeightedNeighborHideMinPtChange,
    onLayoutNetworkRandomizeTrafficWeightsClick,
    onLayoutNetworkToggleAutoRandomizeTrafficWeightsClick,
    isLayoutVhDrawAutoRandomWeightActive: (lyr) =>
      isLayoutVhDrawAutoRandomWeightActive(lyr?.layerId),
    get layoutVhDrawAutoRandomWeightActiveLayerId() {
      return layoutVhDrawAutoRandomWeightLayerId.value;
    },
  });
}
