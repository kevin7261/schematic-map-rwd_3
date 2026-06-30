/**
 * Control 分頁：{@link LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID}（先直後橫·dataJson 繪製）
 * 由原 ControlTab.vue 抽出，行為不變。
 */
import { nextTick, onUnmounted, reactive, ref } from 'vue';
import { setControlLoadFeedback } from '@/utils/control/controlLoadFeedback.js';
import { buildTaipeiB3ExecuteLayerFieldsFromGeojson } from '@/utils/taipeiTest4/buildTaipeiA3StyleLayerFieldsFromGeojson.js';
import { flatSegmentsToGeojsonStyleExportRows } from '@/utils/taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js';
import { reinsertBlackStations } from '@/utils/layers/schematic_layout/assemble.js';
import {
  isMapDrawnRoutesExportArray,
  mapDrawnExportRowsFromJsonDrawRoot,
  minimalLineStringFeatureCollectionFromRouteExportRows,
} from '@/utils/mapDrawnRoutesImport.js';
import {
  LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
  LINE_ORTHOGONAL_LAYER_ID,
  LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID,
  applyCoordNormalizedLayerDataJsonToFollowon,
  jsonGridFromCoordNormalizedPersistPayload,
  peekDiagonalReplaceNextUnitArmHighlightBundle,
  replaceDiagonalEdgesWithLOrtho,
  replaceDiagonalsInRouteUntilClear,
  replaceUnitOrthogonalLWith45DiagonalWhereClear,
  resolveB3InputSpaceNetwork,
  listUnitOrthogonalLCandidates,
  tryReplaceUnitOrthogonalLWith45,
  unitOrthogonalL45HighlightBundle,
  listOrthogonalLShapesInFlatSegments,
  orthoBundleHighlightForLShape,
  orthoBundleHighlightForAllLShapes,
  tryFlipOrthogonalLShapeInFlatSegments,
  flipFirstPossibleOrthogonalLShapeInFlatSegments,
  syncJsonGridFromCoordDataJsonFromPipeline,
} from '@/utils/layers/json_grid_coord_normalized/index.js';
import { normalizeSpaceNetworkDataToFlatSegments } from '@/utils/gridNormalizationMinDistance.js';

const VH_DRAW_LOCAL_JSON_INPUT_ID = 'orthogonal-vh-draw-local-json-input';

/**
 * @param {{
 *   dataStore: import('@/stores/dataStore.js').ReturnType;
 *   isExecuting: import('vue').Ref<boolean>;
 *   applyJsonGridFromCoordBestMoveSegmentsToLayer: (
 *     lyr: unknown,
 *     segments: unknown[],
 *     mapDrawnStationsFallback?: unknown[] | null
 *   ) => void;
 *   stopJsonGridFromCoordVertexAuto: () => void;
 *   stopRbConnectAuto: () => void;
 * }} opts
 */
export function useOrthogonalVhDrawControlTab({
  dataStore,
  isExecuting,
  applyJsonGridFromCoordBestMoveSegmentsToLayer,
  stopJsonGridFromCoordVertexAuto,
  stopRbConnectAuto,
}) {
  const jsonImportFeedbackLayerId = ref(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);

  const pickOrthogonalVhDrawLocalJsonClick = (feedbackLayerId) => {
    jsonImportFeedbackLayerId.value =
      feedbackLayerId || LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID;
    document.getElementById(VH_DRAW_LOCAL_JSON_INPUT_ID)?.click();
  };

  /**
   * 下載 Control「先直後橫·繪製」快照：dataJson／mapDrawnRoutes 皆與 json-viewer 匯出列一致（含完整 segment.stations 黑點）；
   * 不用 buildMapDrawnRoutesExport，以免 connect 跨段合併時中段站較少。
   */
  const downloadOrthogonalVhDrawControlTabJson = () => {
    const lyr = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    if (!lyr?.spaceNetworkGridJsonData?.length) {
      window.alert('尚無路網可匯出。請先完成流程或讀入 JSON。');
      return;
    }
    try {
      syncJsonGridFromCoordDataJsonFromPipeline(lyr);
      let canonical = mapDrawnExportRowsFromJsonDrawRoot(lyr.jsonData, lyr.dataJson);
      if (!Array.isArray(canonical) || canonical.length === 0) {
        window.alert('無法匯出 dataJson：匯出列為空。');
        return;
      }
      const snapshot = JSON.parse(JSON.stringify(canonical));
      const payload = {
        exportedAt: new Date().toISOString(),
        layerId: LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
        mapDrawnRoutes: snapshot,
        dataJson: snapshot,
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orthogonal_toward_center_vh_draw_control.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      window.alert('匯出失敗（詳見控制台）。');
    }
  };

  const extractMapDrawnRoutesRowsFromParsedJson = (parsed) => {
    if (parsed && typeof parsed === 'object') {
      const fromDataJson = mapDrawnExportRowsFromJsonDrawRoot(null, parsed.dataJson);
      if (fromDataJson && isMapDrawnRoutesExportArray(fromDataJson)) return fromDataJson;
    }
    if (Array.isArray(parsed) && isMapDrawnRoutesExportArray(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.mapDrawnRoutes) &&
      isMapDrawnRoutesExportArray(parsed.mapDrawnRoutes)
    ) {
      return parsed.mapDrawnRoutes;
    }
    return null;
  };

  /**
   * 共用核心：以「地圖路段匯出列」（routeName／segment／routeCoordinates，含完整 segment.stations 黑點）
   * 寫入 `orthogonal_toward_center_vh_draw`。「選擇 JSON 檔讀入…」與「從站點與路線往中心聚集匯入」共用，
   * 確保兩者與「下載 JSON → 匯入 JSON」完全等價（含黑點）。
   * @returns {boolean} 是否成功
   */
  const applyOrthogonalVhDrawFromExportRows = async (rows, label, feedbackLayerId) => {
    const fbId = feedbackLayerId || LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID;
    const lyr = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    if (!lyr) return false;
    if (!Array.isArray(rows) || rows.length === 0) {
      setControlLoadFeedback(
        fbId,
        'JSON 須為地圖路段匯出陣列（routeName／segment／routeCoordinates），或含 dataJson／mapDrawnRoutes 之物件。',
        'danger'
      );
      return false;
    }
    try {
      lyr.isLoading = true;
      const fc = minimalLineStringFeatureCollectionFromRouteExportRows(rows, {
        stationPoints: 'all',
        routeLine: 'full',
      });
      const derived = buildTaipeiB3ExecuteLayerFieldsFromGeojson(fc, {});
      const sn = derived?.spaceNetworkGridJsonData;
      if (!Array.isArray(sn) || sn.length === 0) {
        setControlLoadFeedback(fbId, '無法由該來源建立路網（spaceNetworkGridJsonData 為空）。', 'danger');
        lyr.isLoading = false;
        return false;
      }
      lyr.vhDrawUserJsonOverride = true;
      lyr.jsonFileName = label;
      applyJsonGridFromCoordBestMoveSegmentsToLayer(lyr, sn, rows);
      lyr.isLoaded = true;
      lyr.isLoading = false;
      await dataStore.saveLayerState(lyr.layerId, {
        ...jsonGridFromCoordNormalizedPersistPayload(lyr),
      });
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
      return true;
    } catch (err) {
      console.error(err);
      setControlLoadFeedback(fbId, '匯入失敗（詳見控制台）。', 'danger');
      lyr.isLoading = false;
      dataStore.saveLayerState(lyr.layerId, { isLoading: false });
      return false;
    }
  };

  /** 與「選擇 JSON 檔讀入…」相同：寫入 `orthogonal_toward_center_vh_draw`（含 dataJson／路網），可由路網網格層按鈕觸發。 */
  const applyOrthogonalVhDrawFromImportedJsonFile = async (file) => {
    const fbId = jsonImportFeedbackLayerId.value || LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID;
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      console.error(err);
      setControlLoadFeedback(fbId, '讀取或解析 JSON 失敗（詳見控制台）。', 'danger');
      return;
    }
    const rows = extractMapDrawnRoutesRowsFromParsedJson(parsed);
    const ok = await applyOrthogonalVhDrawFromExportRows(rows, file.name, fbId);
    if (ok) {
      setControlLoadFeedback(
        fbId,
        `已讀入「${file.name}」至 VH 繪製層。之後開啟該圖層將沿用此檔（不再自動鏡像 VH）。`,
        'success'
      );
    }
  };

  const onOrthogonalVhDrawLocalJsonInputChange = async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    await applyOrthogonalVhDrawFromImportedJsonFile(file);
  };

  /** 匯出列之中段黑點數＝各段 segment.stations 之總數。 */
  const midStationCountInRows = (rws) =>
    (Array.isArray(rws) ? rws : []).reduce((n, r) => {
      const st = r?.segment?.stations ?? r?.stations;
      return n + (Array.isArray(st) ? st.length : 0);
    }, 0);

  /**
   * 自單一圖層讀「匯出列」路網。黑點（中段站）在不同層可能存在不同表示：dataJson／jsonData 之匯出列、
   * processedJsonData、或 spaceNetworkGridJsonData 之 nodes。逐一算出各表示之匯出列，取「中段黑點最多」者
   * （平手取段數較多者）；並印診斷到 console 供定位。
   */
  const readConvergeCenterRowsFromLayer = (L) => {
    if (!L) return null;
    const reps = [];
    const direct = mapDrawnExportRowsFromJsonDrawRoot(L.jsonData, L.dataJson);
    if (Array.isArray(direct) && direct.length) reps.push(['dataJson', direct]);
    if (Array.isArray(L.processedJsonData) && L.processedJsonData.length) {
      reps.push(['processedJsonData', L.processedJsonData]);
    }
    if (Array.isArray(L.spaceNetworkGridJsonData) && L.spaceNetworkGridJsonData.length) {
      try {
        reps.push(['spaceNetworkGridJsonData', flatSegmentsToGeojsonStyleExportRows(L.spaceNetworkGridJsonData)]);
      } catch (e) {
        console.error(e);
      }
      // 示意圖管線「往中心聚集」層只存 connect 骨架，黑點站抽離成 schematicBlackSections metadata；
      // 與該層「下載 JSON」相同：把黑點平均沿線放回骨架，產生含黑點之匯出列。
      try {
        const skel = normalizeSpaceNetworkDataToFlatSegments(
          JSON.parse(JSON.stringify(L.spaceNetworkGridJsonData))
        );
        const sections = Array.isArray(L.schematicBlackSections) ? L.schematicBlackSections : [];
        if (sections.length === skel.length && sections.length > 0) {
          reps.push([
            'schematicBlackSections放回',
            flatSegmentsToGeojsonStyleExportRows(reinsertBlackStations(skel, sections)),
          ]);
        }
      } catch (e) {
        console.error(e);
      }
    }
    let best = null;
    let bestDots = -1;
    let bestLen = -1;
    let bestFrom = '';
    for (const [from, rws] of reps) {
      if (!Array.isArray(rws) || rws.length === 0) continue;
      const dots = midStationCountInRows(rws);
      if (dots > bestDots || (dots === bestDots && rws.length > bestLen)) {
        best = rws;
        bestDots = dots;
        bestLen = rws.length;
        bestFrom = from;
      }
    }
    console.log('[匯入診斷]', L.layerId, {
      表示: reps.map(([f, rws]) => `${f}:段${rws?.length ?? 0}/黑點${midStationCountInRows(rws)}`),
      採用: bestFrom,
      採用黑點: Math.max(0, bestDots),
      首段: best && best[0] ? JSON.stringify(best[0]).slice(0, 800) : null,
      首筆spaceNetwork: Array.isArray(L.spaceNetworkGridJsonData) && L.spaceNetworkGridJsonData[0]
        ? JSON.stringify(L.spaceNetworkGridJsonData[0]).slice(0, 800)
        : null,
    });
    return best;
  };

  /**
   * 自「站點與路線往中心聚集」抓路網寫入 VH 繪製層並同步路網網格。
   * 同一顯示名有兩組同源圖層：OSM 管線（orthogonal_toward_center_vh／_hv）與示意圖管線
   * （schematic_toward_center_vh／_hv）。傳入候選 id 清單，依序取第一個有資料者；
   * OSM 那組若記憶體為空，會就地執行與「開啟圖層」相同之鏡像填充再讀。
   * @param {string|string[]} sourceLayerIds
   */
  const applyOrthogonalVhDrawFromConvergeCenterLayer = async (sourceLayerIds, feedbackLayerId) => {
    const fbId = feedbackLayerId || LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID;
    const lyr = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
    if (!lyr) return;
    const candidates = (Array.isArray(sourceLayerIds) ? sourceLayerIds : [sourceLayerIds]).filter(
      Boolean
    );
    // 中段黑點數＝各段 segment.stations 之總數。
    const countMidStations = (rws) =>
      (Array.isArray(rws) ? rws : []).reduce((n, r) => {
        const st = r?.segment?.stations ?? r?.stations;
        return n + (Array.isArray(st) ? st.length : 0);
      }, 0);
    let src = null;
    let rows = null;
    let blackDotCount = -1;
    const tried = [];
    for (const id of candidates) {
      const L = dataStore.findLayerById(id);
      if (!L) continue;
      tried.push(L.layerName || id);
      let r = readConvergeCenterRowsFromLayer(L);
      // OSM 管線那組若從未開啟，就地以「開啟圖層」相同之鏡像把上游填入再讀（示意圖那組上游不同，不套用）。
      if ((!r || r.length === 0) && String(id).startsWith('orthogonal_toward_center')) {
        try {
          applyCoordNormalizedLayerDataJsonToFollowon(dataStore.findLayerById.bind(dataStore), L);
        } catch (e) {
          console.error(e);
        }
        r = readConvergeCenterRowsFromLayer(L);
      }
      if (!r || r.length === 0) continue;
      // 同名兩層（OSM／示意圖）擇一：優先選「有中段黑點」者，避免選到骨架層。
      const dots = countMidStations(r);
      if (dots > blackDotCount) {
        blackDotCount = dots;
        src = L;
        rows = r;
      }
      if (dots > 0) break;
    }
    if (!src || !rows || rows.length === 0) {
      setControlLoadFeedback(
        fbId,
        `「站點與路線往中心聚集」尚無路網可匯入（已試：${tried.join('、') || '無'}）；請先開啟並產生該圖層資料。`,
        'danger'
      );
      return;
    }
    const srcLabel = src.layerName || src.layerId;
    if (blackDotCount < 0) blackDotCount = 0;
    // 與「下載 JSON → 選擇 JSON 檔讀入」完全相同之核心（含黑點之 sn＋rows 回填合併）。
    const ok = await applyOrthogonalVhDrawFromExportRows(rows, srcLabel, fbId);
    if (ok) {
      setControlLoadFeedback(
        fbId,
        `已自「${srcLabel}」匯入 ${rows.length} 段路網（中段黑點 ${blackDotCount} 顆）至 VH 繪製層。` +
          (blackDotCount === 0
            ? '\n⚠ 來源本身沒有中段黑點（可能是示意圖骨架層；黑點要到「connect 拉直」才放回）。'
            : ''),
        blackDotCount === 0 ? 'muted' : 'success'
      );
    }
  };

  const VH_DRAW_DIAGONAL_ROUTE_AUTO_MS = 1000;
  let vhDrawDiagonalRouteAutoTimerId = null;
  const vhDrawDiagonalRouteAutoActive = ref(false);
  const vhDrawDiagonalRouteAutoKind = ref('l');
  let vhDrawDiagonalRouteAutoTickBusy = false;
  const vhDrawDiagonalRouteCursor = ref(0);
  let vhDrawDiagonalRouteAutoIdleStreak = 0;
  const vhDrawDiagonalRouteStepHint = ref('');

  const stopVhDrawDiagonalRouteAuto = () => {
    if (vhDrawDiagonalRouteAutoTimerId != null) {
      clearInterval(vhDrawDiagonalRouteAutoTimerId);
      vhDrawDiagonalRouteAutoTimerId = null;
    }
    vhDrawDiagonalRouteAutoActive.value = false;
    vhDrawDiagonalRouteAutoKind.value = 'l';
    vhDrawDiagonalRouteAutoTickBusy = false;
    vhDrawDiagonalRouteAutoIdleStreak = 0;
  };

  function vhDrawDiagonalOrthoOptsFor(kind) {
    if (kind === 'nz')
      return { preferVertFirst: true, tryL: false, tryNzIfNoL: true, tryHv45: false };
    if (kind === 'hv45')
      return { preferVertFirst: true, tryL: false, tryNzIfNoL: false, tryHv45: true };
    return { preferVertFirst: true, tryL: true, tryNzIfNoL: false, tryHv45: false };
  }

  function vhDrawDiagonalAutoButtonLabel(kind) {
    if (vhDrawDiagonalRouteAutoActive.value && vhDrawDiagonalRouteAutoKind.value === kind) {
      if (kind === 'nz') return '停止自動（每秒一條路線·N／Z）';
      if (kind === 'hv45') return '停止自動（每秒一條路線·H／V／45°）';
      return '停止自動（每秒一條路線·僅 L）';
    }
    if (kind === 'nz') return '自動執行：每秒一條路線（僅 N／Z）';
    if (kind === 'hv45') return '自動執行：每秒一條路線（H／V／45°）';
    return '自動執行：每秒一條路線（僅 L）';
  }

  const applyVhDrawDiagonalAfterReplace = async (lyr, segments) => {
    applyJsonGridFromCoordBestMoveSegmentsToLayer(lyr, segments);
    await dataStore.saveLayerState(lyr.layerId, {
      ...jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true }),
    });
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const getVhDrawFlatSegments = (lyr) => {
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) return null;
    return normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
  };

  const syncVhDrawDiagonalRouteHighlightToLayer = async (lyr, kind = 'l') => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    stopVhDrawLShapeAuto();
    const c = Number(vhDrawDiagonalRouteCursor.value);
    const idx = Number.isFinite(c) ? Math.max(0, Math.floor(c)) : 0;
    const orthoOpts = vhDrawDiagonalOrthoOptsFor(kind);
    const flat = getVhDrawFlatSegments(lyr);
    const armBundle =
      flat?.length && idx >= 0 && idx < flat.length
        ? peekDiagonalReplaceNextUnitArmHighlightBundle(flat, idx, orthoOpts)
        : null;
    lyr.highlightedSegmentIndex = armBundle ?? ['vhDrawRoute', idx];
    await dataStore.saveLayerState(lyr.layerId, {
      highlightedSegmentIndex: lyr.highlightedSegmentIndex,
    });
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const onOrthogonalVhDrawDiagonalToLClick = async (lyr, kind, opts = {}) => {
    const silent = opts.silent === true;
    const externalExecuting = opts.externalExecuting === true;
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (!externalExecuting && isExecuting.value) return;
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    vhDrawDiagonalRouteCursor.value = 0;
    vhDrawDiagonalRouteStepHint.value = '';
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) {
      const msg = '無路網；請確認本層已有 dataJson／geojson，且來源「先直後橫」層已更新。';
      if (silent) vhDrawDiagonalRouteStepHint.value = msg;
      else window.alert(msg);
      return;
    }
    if (!externalExecuting) {
      isExecuting.value = true;
    }
    try {
      await nextTick();
      lyr.highlightedSegmentIndex = null;
      await dataStore.saveLayerState(lyr.layerId, { highlightedSegmentIndex: null });
      const flat = normalizeSpaceNetworkDataToFlatSegments(
        JSON.parse(JSON.stringify(resolved.spaceNetwork))
      );
      const r = replaceDiagonalEdgesWithLOrtho(flat, vhDrawDiagonalOrthoOptsFor(kind));
      if (!r.ok) {
        const msg = r.message || '無法套用（路網幾何約束）。';
        if (silent) vhDrawDiagonalRouteStepHint.value = msg;
        else window.alert(msg);
        return;
      }
      if (r.replacedCount === 0) {
        const msg = r.message || '沒有可替換的非正交邊。';
        if (silent) vhDrawDiagonalRouteStepHint.value = msg;
        else window.alert(msg);
        return;
      }
      applyJsonGridFromCoordBestMoveSegmentsToLayer(lyr, r.segments);
      await dataStore.saveLayerState(lyr.layerId, {
        ...jsonGridFromCoordNormalizedPersistPayload(lyr, { omitLoadingFlags: true }),
      });
      await nextTick();
      dataStore.requestSpaceNetworkGridFullRedraw();
      if (silent) {
        if (kind === 'nz') {
          vhDrawDiagonalRouteStepHint.value = `斜邊→N／Z：已替換 ${r.replacedCount} 條非 H／V 邊。`;
        } else if (kind === 'hv45') {
          vhDrawDiagonalRouteStepHint.value = `斜邊→H／V／45°：已替換 ${r.replacedCount} 條 |Δx|≠|Δy| 斜邊。`;
        } else {
          vhDrawDiagonalRouteStepHint.value = `斜邊→正交 L：已替換 ${r.replacedCount} 條非 H／V 邊。`;
        }
      } else if (kind === 'nz') {
        window.alert(
          `已將 ${r.replacedCount} 條非水平／垂直邊改為 N／Z 形（三段：先豎─橫─豎或先橫─豎─橫，內點轉角枚舉；不試 L）。約束：無交叉、無與他線共線重疊、線段開放內部不壓紅／藍 connect、轉角不重疊他線紅／藍 connect 顯示格且轉角不與他線頂點共格；違反則略過該邊。平手時先直後橫偏好（N 優先於 Z）。`
        );
      } else if (kind === 'hv45') {
        window.alert(
          `已將 ${r.replacedCount} 條 |Δx|≠|Δy| 之斜邊改為僅含水平／垂直／45° 之路徑：轉折座標對齊 **0.5 格**，含<strong>單轉折</strong>（兩段：先斜後正或先正後斜）與<strong>雙轉折</strong>（三段：斜線─直線─斜線）。若該邊已為單段 45° 則略過。約束：無交叉、無與他線共線重疊、線段開放內部不壓紅／藍 connect、轉角不重疊他線紅／藍 connect 顯示格且轉角不與他線頂點共格；違反則略過該邊。平手時優先與鄰邊串成直線，再平手則較少轉折優先，再「先直後橫」偏好。`
        );
      } else {
        window.alert(
          `已將 ${r.replacedCount} 條非水平／垂直邊改為正交 L（兩段；不試 N／Z）。約束：無交叉、無與他線共線重疊、線段開放內部不壓紅／藍 connect、轉角不重疊他線紅／藍 connect 顯示格且轉角不與他線頂點共格；違反則略過該邊。平手時優先與鄰邊串成直線，再平手則「先直後橫」偏好。`
        );
      }
    } catch (err) {
      console.error(err);
      const msg = '套用時發生錯誤（詳見控制台）。';
      if (silent) vhDrawDiagonalRouteStepHint.value = msg;
      else window.alert(msg);
    } finally {
      if (!externalExecuting) {
        setTimeout(() => {
          isExecuting.value = false;
        }, 300);
      }
    }
  };

  const onOrthogonalVhDrawUnitLTo45Click = async (lyr, opts = {}) => {
    const silent = opts.silent === true;
    const externalExecuting = opts.externalExecuting === true;
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (!externalExecuting && isExecuting.value) return;
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    vhDrawUnitL45Hint.value = '';
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) {
      const msg = '無路網；請確認本層已有 dataJson／geojson，且來源「先直後橫」層已更新。';
      if (silent) vhDrawUnitL45Hint.value = msg;
      else window.alert(msg);
      return;
    }
    if (!externalExecuting) {
      isExecuting.value = true;
    }
    try {
      await nextTick();
      lyr.highlightedSegmentIndex = null;
      await dataStore.saveLayerState(lyr.layerId, { highlightedSegmentIndex: null });
      const flat = normalizeSpaceNetworkDataToFlatSegments(
        JSON.parse(JSON.stringify(resolved.spaceNetwork))
      );
      const r = replaceUnitOrthogonalLWith45DiagonalWhereClear(flat);
      if (!r.ok) {
        const msg = r.message || '無法套用（路網幾何約束）。';
        if (silent) vhDrawUnitL45Hint.value = msg;
        else window.alert(msg);
        return;
      }
      if (r.replacedCount === 0) {
        vhDrawUnitL45Hint.value = r.message || '沒有可替換的單位 L。';
        if (!silent) window.alert(r.message || '沒有可替換的單位 L。');
        return;
      }
      await applyVhDrawDiagonalAfterReplace(lyr, r.segments);
      vhDrawUnitL45Hint.value = r.message || '';
      if (!silent) window.alert(r.message || '已完成。');
    } catch (err) {
      console.error(err);
      const msg = '套用時發生錯誤（詳見控制台）。';
      if (silent) vhDrawUnitL45Hint.value = msg;
      else window.alert(msg);
    } finally {
      if (!externalExecuting) {
        setTimeout(() => {
          isExecuting.value = false;
        }, 300);
      }
    }
  };

  const onOrthogonalVhDrawUnitL45OneClick = async (lyr) => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (isExecuting.value) return;
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    const flat = getVhDrawFlatSegments(lyr);
    if (!flat?.length) {
      window.alert('無路網；請確認本層已有 dataJson／geojson。');
      return;
    }
    const candidates = listUnitOrthogonalLCandidates(flat);
    if (!candidates.length) {
      vhDrawUnitL45Hint.value = '路網中沒有單位正交 L（兩臂各 1 格）。';
      window.alert(vhDrawUnitL45Hint.value);
      await applyVhDrawLOrthoBundleHighlight(lyr, null);
      return;
    }
    const n = candidates.length;
    const idx = ((vhDrawUnitL45Cursor.value % n) + n) % n;
    const cand = candidates[idx];
    vhDrawUnitL45Cursor.value = (idx + 1) % n;
    const highlightBundle = unitOrthogonalL45HighlightBundle(cand);
    await applyVhDrawLOrthoBundleHighlight(lyr, highlightBundle);
    const r = tryReplaceUnitOrthogonalLWith45(flat, cand);
    if (r.replaced) {
      await applyVhDrawDiagonalAfterReplace(lyr, r.segments);
      vhDrawUnitL45Hint.value = `候選 ${idx + 1}／${n}（路段 #${cand.si + 1}，頂點 #${cand.ci}）：${r.reason}`;
    } else {
      vhDrawUnitL45Hint.value = `候選 ${idx + 1}／${n}（路段 #${cand.si + 1}，頂點 #${cand.ci}）不可替換：${r.reason}`;
    }
  };

  const VH_DRAW_UNIT_L45_AUTO_MS = 1000;

  const toggleOrthogonalVhDrawUnitL45Auto = (lyr) => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (vhDrawUnitL45AutoActive.value) {
      stopVhDrawUnitL45Auto();
      return;
    }
    const flatProbe = getVhDrawFlatSegments(lyr);
    if (!flatProbe?.length) {
      window.alert('無路網；請確認本層已有 dataJson／geojson。');
      return;
    }
    if (!listUnitOrthogonalLCandidates(flatProbe).length) {
      window.alert('路網中沒有單位正交 L（兩臂各 1 格）。');
      return;
    }
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    vhDrawUnitL45AutoActive.value = true;
    vhDrawUnitL45AutoNoReplaceStreak = 0;
    vhDrawUnitL45AutoTimerId = setInterval(async () => {
      if (!vhDrawUnitL45AutoActive.value || vhDrawUnitL45AutoTickBusy) return;
      const lyrFresh = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
      if (!lyrFresh) {
        stopVhDrawUnitL45Auto();
        return;
      }
      vhDrawUnitL45AutoTickBusy = true;
      try {
        const flat = getVhDrawFlatSegments(lyrFresh);
        if (!flat?.length) {
          stopVhDrawUnitL45Auto();
          return;
        }
        const candidates = listUnitOrthogonalLCandidates(flat);
        if (!candidates.length) {
          stopVhDrawUnitL45Auto();
          vhDrawUnitL45Hint.value = '所有單位 L 已替換或消失，自動已停止。';
          return;
        }
        const n = candidates.length;
        const idx = ((vhDrawUnitL45Cursor.value % n) + n) % n;
        const cand = candidates[idx];
        vhDrawUnitL45Cursor.value = (idx + 1) % n;
        const r = tryReplaceUnitOrthogonalLWith45(flat, cand);
        if (r.replaced) {
          vhDrawUnitL45AutoNoReplaceStreak = 0;
          await applyVhDrawDiagonalAfterReplace(lyrFresh, r.segments);
          vhDrawUnitL45Hint.value = `候選 ${idx + 1}／${n}（路段 #${cand.si + 1}，頂點 #${cand.ci}）：${r.reason}（自動）`;
        } else {
          vhDrawUnitL45AutoNoReplaceStreak += 1;
          vhDrawUnitL45Hint.value = `候選 ${idx + 1}／${n}（路段 #${cand.si + 1}，頂點 #${cand.ci}）不可替換：${r.reason}（連續 ${vhDrawUnitL45AutoNoReplaceStreak}／${n}）`;
          if (vhDrawUnitL45AutoNoReplaceStreak >= n) {
            stopVhDrawUnitL45Auto();
            vhDrawUnitL45Hint.value += '；已輪完一週皆不可替換，自動停止。';
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        vhDrawUnitL45AutoTickBusy = false;
      }
    }, VH_DRAW_UNIT_L45_AUTO_MS);
  };

  const onOrthogonalVhDrawDiagonalOneRouteClick = async (lyr, kind) => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (isExecuting.value) return;
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) {
      window.alert('無路網；請確認本層已有 dataJson／geojson。');
      return;
    }
    isExecuting.value = true;
    try {
      await nextTick();
      const flat = normalizeSpaceNetworkDataToFlatSegments(
        JSON.parse(JSON.stringify(resolved.spaceNetwork))
      );
      const n = flat.length;
      if (n === 0) {
        window.alert('無 flat 路段。');
        return;
      }
      await syncVhDrawDiagonalRouteHighlightToLayer(lyr, kind);
      const si = ((vhDrawDiagonalRouteCursor.value % n) + n) % n;
      const r = replaceDiagonalsInRouteUntilClear(flat, si, vhDrawDiagonalOrthoOptsFor(kind));
      if (!r.ok) {
        window.alert(r.message || '無法套用（路網幾何約束）。');
        return;
      }
      vhDrawDiagonalRouteCursor.value = (si + 1) % n;
      if (r.replacedCount > 0) {
        await applyVhDrawDiagonalAfterReplace(lyr, r.segments);
      }
      vhDrawDiagonalRouteStepHint.value = `${r.message || ''} 下次：路線 #${vhDrawDiagonalRouteCursor.value + 1}／共 ${n} 條折線。`;
      await syncVhDrawDiagonalRouteHighlightToLayer(lyr, kind);
    } catch (err) {
      console.error(err);
      window.alert('套用時發生錯誤（詳見控制台）。');
    } finally {
      setTimeout(() => {
        isExecuting.value = false;
      }, 300);
    }
  };

  const toggleOrthogonalVhDrawDiagonalRouteAuto = (lyr, kind) => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (vhDrawDiagonalRouteAutoActive.value && vhDrawDiagonalRouteAutoKind.value === kind) {
      stopVhDrawDiagonalRouteAuto();
      return;
    }
    if (vhDrawDiagonalRouteAutoActive.value) {
      stopVhDrawDiagonalRouteAuto();
    }
    const resolved = resolveB3InputSpaceNetwork(lyr, { routeLineFromExportRows: 'full' });
    if (!resolved?.spaceNetwork?.length) {
      window.alert('無路網；請確認本層已有 dataJson／geojson。');
      return;
    }
    const flatProbe = normalizeSpaceNetworkDataToFlatSegments(
      JSON.parse(JSON.stringify(resolved.spaceNetwork))
    );
    if (!flatProbe.length) {
      window.alert('無 flat 路段。');
      return;
    }
    vhDrawDiagonalRouteAutoKind.value = kind;
    vhDrawDiagonalRouteAutoActive.value = true;
    vhDrawDiagonalRouteAutoIdleStreak = 0;
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    stopJsonGridFromCoordVertexAuto();
    stopRbConnectAuto();
    void syncVhDrawDiagonalRouteHighlightToLayer(lyr, kind).catch((e) => console.error(e));
    vhDrawDiagonalRouteAutoTimerId = setInterval(async () => {
      if (!vhDrawDiagonalRouteAutoActive.value || vhDrawDiagonalRouteAutoTickBusy) return;
      const lyrFresh = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
      if (!lyrFresh) {
        stopVhDrawDiagonalRouteAuto();
        return;
      }
      vhDrawDiagonalRouteAutoTickBusy = true;
      try {
        const res = resolveB3InputSpaceNetwork(lyrFresh, { routeLineFromExportRows: 'full' });
        if (!res?.spaceNetwork?.length) {
          stopVhDrawDiagonalRouteAuto();
          return;
        }
        const f = normalizeSpaceNetworkDataToFlatSegments(
          JSON.parse(JSON.stringify(res.spaceNetwork))
        );
        const n = f.length;
        if (n === 0) {
          stopVhDrawDiagonalRouteAuto();
          return;
        }
        const si = ((vhDrawDiagonalRouteCursor.value % n) + n) % n;
        const r = replaceDiagonalsInRouteUntilClear(
          f,
          si,
          vhDrawDiagonalOrthoOptsFor(vhDrawDiagonalRouteAutoKind.value)
        );
        if (!r.ok) {
          stopVhDrawDiagonalRouteAuto();
          window.alert(r.message || '路網約束錯誤，已停止自動。');
          return;
        }
        vhDrawDiagonalRouteCursor.value = (si + 1) % n;
        if (r.replacedCount > 0) {
          vhDrawDiagonalRouteAutoIdleStreak = 0;
          await applyVhDrawDiagonalAfterReplace(lyrFresh, r.segments);
          vhDrawDiagonalRouteStepHint.value = `${r.message} 下次：#${vhDrawDiagonalRouteCursor.value + 1}／${n}`;
        } else {
          vhDrawDiagonalRouteAutoIdleStreak += 1;
          vhDrawDiagonalRouteStepHint.value = `${r.message} （本輪連續 ${vhDrawDiagonalRouteAutoIdleStreak}／${n} 條無替換）`;
          if (vhDrawDiagonalRouteAutoIdleStreak >= n) {
            stopVhDrawDiagonalRouteAuto();
            vhDrawDiagonalRouteStepHint.value =
              '已輪完一週各路線皆無可替換斜邊，自動執行已停止。';
          }
        }
        await syncVhDrawDiagonalRouteHighlightToLayer(lyrFresh, vhDrawDiagonalRouteAutoKind.value);
      } catch (tickErr) {
        console.error(tickErr);
      } finally {
        vhDrawDiagonalRouteAutoTickBusy = false;
      }
    }, VH_DRAW_DIAGONAL_ROUTE_AUTO_MS);
  };

  const VH_DRAW_LSHAPE_AUTO_MS = 1000;
  let vhDrawLShapeAutoTimerId = null;
  const vhDrawLShapeAutoActive = ref(false);
  let vhDrawLShapeAutoTickBusy = false;
  let vhDrawLShapeAutoNoFlipStreak = 0;
  const vhDrawLShapeCursor = ref(0);
  const vhDrawLShapeStepHint = ref('');
  const vhDrawTripleBatchHint = ref('');
  const vhDrawUnitL45Hint = ref('');
  const vhDrawUnitL45Cursor = ref(0);
  const vhDrawUnitL45AutoActive = ref(false);
  let vhDrawUnitL45AutoTimerId = null;
  let vhDrawUnitL45AutoTickBusy = false;
  let vhDrawUnitL45AutoNoReplaceStreak = 0;

  const stopVhDrawUnitL45Auto = () => {
    if (vhDrawUnitL45AutoTimerId != null) {
      clearInterval(vhDrawUnitL45AutoTimerId);
      vhDrawUnitL45AutoTimerId = null;
    }
    vhDrawUnitL45AutoActive.value = false;
    vhDrawUnitL45AutoTickBusy = false;
    vhDrawUnitL45AutoNoReplaceStreak = 0;
  };

  const stopVhDrawLShapeAuto = () => {
    if (vhDrawLShapeAutoTimerId != null) {
      clearInterval(vhDrawLShapeAutoTimerId);
      vhDrawLShapeAutoTimerId = null;
    }
    vhDrawLShapeAutoActive.value = false;
    vhDrawLShapeAutoTickBusy = false;
    vhDrawLShapeAutoNoFlipStreak = 0;
  };

  const applyVhDrawLOrthoBundleHighlight = async (lyr, bundle) => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    lyr.highlightedSegmentIndex = bundle;
    await dataStore.saveLayerState(lyr.layerId, {
      highlightedSegmentIndex: bundle,
    });
    await nextTick();
    dataStore.requestSpaceNetworkGridFullRedraw();
  };

  const lShapeStepLabel = (L) =>
    L?.cornerKey
      ? `跨路段 L · 轉角格 (${L.cornerKey.replace(',', ', ')})`
      : `單一折線 seg ${L.segIndex} · 轉角索引 ${L.cornerIdx}`;

  const onOrthogonalVhDrawLShapeOneClick = async (lyr) => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (isExecuting.value) return;
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    const flat = getVhDrawFlatSegments(lyr);
    if (!flat?.length) {
      window.alert('無路網；請確認本層已有 dataJson／geojson。');
      return;
    }
    const list = listOrthogonalLShapesInFlatSegments(flat);
    if (!list.length) {
      window.alert(
        '目前路網中找不到符合條件的正交 L 形（轉折格在含斜線之完整圖上須僅兩條正交邊；兩臂沿 H／V 延伸至「有不同向連線」之格即停）。'
      );
      vhDrawLShapeStepHint.value = 'L 形：0 個';
      await applyVhDrawLOrthoBundleHighlight(lyr, null);
      return;
    }
    const n = list.length;
    const idx = ((vhDrawLShapeCursor.value % n) + n) % n;
    const L = list[idx];
    const bundle = orthoBundleHighlightForLShape(L);
    await applyVhDrawLOrthoBundleHighlight(lyr, bundle);
    vhDrawLShapeCursor.value = (idx + 1) % n;
    const r = tryFlipOrthogonalLShapeInFlatSegments(flat, L);
    if (r.flipped) {
      await applyVhDrawDiagonalAfterReplace(lyr, r.segments);
      vhDrawLShapeStepHint.value = `L 形 ${idx + 1}／${n} · ${lShapeStepLabel(L)} · ${r.reason}`;
      return;
    }
    vhDrawLShapeStepHint.value = `L 形 ${idx + 1}／${n} · ${lShapeStepLabel(L)} · 無法 flip：${r.reason}`;
  };

  const onOrthogonalVhDrawLShapeHighlightAllClick = async (lyr, opts = {}) => {
    const silent = opts.silent === true;
    const externalExecuting = opts.externalExecuting === true;
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (!externalExecuting && isExecuting.value) return;
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    vhDrawLShapeCursor.value = 0;
    const flat = getVhDrawFlatSegments(lyr);
    if (!flat?.length) {
      const msg = '無路網；請確認本層已有 dataJson／geojson。';
      if (silent) vhDrawLShapeStepHint.value = msg;
      else window.alert(msg);
      return;
    }
    const firstList = listOrthogonalLShapesInFlatSegments(flat);
    if (!firstList.length) {
      if (!silent) {
        window.alert(
          '目前路網中找不到符合條件的正交 L 形（轉折格在含斜線之完整圖上須僅兩條正交邊；兩臂沿 H／V 延伸至「有不同向連線」之格即停）。'
        );
      }
      vhDrawLShapeStepHint.value = silent ? 'L 形：0 個可 flip（已略過）' : 'L 形：0 個';
      await applyVhDrawLOrthoBundleHighlight(lyr, null);
      return;
    }
    let work = flat;
    let flippedCount = 0;
    let lastNoFlip = null;
    const maxSteps = Math.max(20, firstList.length * 4);
    for (let step = 0; step < maxSteps; step++) {
      const r = flipFirstPossibleOrthogonalLShapeInFlatSegments(work);
      if (!r.flipped) {
        lastNoFlip = r;
        break;
      }
      work = r.segments;
      flippedCount += 1;
    }
    if (flippedCount > 0) {
      await applyVhDrawDiagonalAfterReplace(lyr, work);
      vhDrawLShapeStepHint.value = `一鍵 flip 完成：已 flip ${flippedCount} 個 L；停止原因：${lastNoFlip?.reason || '達到安全上限'}`;
      return;
    }
    const bundle = orthoBundleHighlightForAllLShapes(firstList);
    await applyVhDrawLOrthoBundleHighlight(lyr, bundle);
    vhDrawLShapeStepHint.value = `找到 ${firstList.length} 個 L，但沒有可 flip：${lastNoFlip?.reason || '無可行 flip'}`;
  };

  async function onOrthogonalVhDrawTripleBatchClick(lyr, options = {}) {
    const skipUnitL45 = options.skipUnitL45 === true;
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (isExecuting.value) return;
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    vhDrawTripleBatchHint.value = '';
    vhDrawUnitL45Hint.value = '';
    vhDrawLShapeStepHint.value = '';
    vhDrawDiagonalRouteStepHint.value = '';
    isExecuting.value = true;
    try {
      await nextTick();
      await onOrthogonalVhDrawLShapeHighlightAllClick(lyr, {
        silent: true,
        externalExecuting: true,
      });
      const m1 = vhDrawLShapeStepHint.value || '—';
      let lyr2 = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) || lyr;
      await onOrthogonalVhDrawDiagonalToLClick(lyr2, 'l', {
        silent: true,
        externalExecuting: true,
      });
      const m2 = vhDrawDiagonalRouteStepHint.value || '—';
      lyr2 = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) || lyr2;
      await onOrthogonalVhDrawDiagonalToLClick(lyr2, 'nz', {
        silent: true,
        externalExecuting: true,
      });
      const m3 = vhDrawDiagonalRouteStepHint.value || '—';
      lyr2 = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) || lyr2;
      await onOrthogonalVhDrawDiagonalToLClick(lyr2, 'hv45', {
        silent: true,
        externalExecuting: true,
      });
      const m4 = vhDrawDiagonalRouteStepHint.value || '—';
      lyr2 = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) || lyr2;
      if (!skipUnitL45) {
        await onOrthogonalVhDrawUnitLTo45Click(lyr2, {
          silent: true,
          externalExecuting: true,
        });
        const m5 = vhDrawUnitL45Hint.value || '—';
        vhDrawTripleBatchHint.value = `① L：${m1} ② 斜→L：${m2} ③ 斜→N／Z：${m3} ④ 斜→H／V／45°：${m4} ⑤ 單位 L→45°：${m5}`;
      } else {
        vhDrawUnitL45Hint.value = '';
        vhDrawTripleBatchHint.value = `① L：${m1} ② 斜→L：${m2} ③ 斜→N／Z：${m3} ④ 斜→H／V／45°：${m4} ⑤ 單位正交 L→45°：未執行`;
      }
    } catch (e) {
      console.error(e);
      vhDrawTripleBatchHint.value = '批次中斷：發生錯誤（詳見控制台）。';
    } finally {
      setTimeout(() => {
        isExecuting.value = false;
      }, 300);
    }
  }

  const toggleOrthogonalVhDrawLShapeAuto = (lyr) => {
    if (!lyr || lyr.layerId !== LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID) return;
    if (vhDrawLShapeAutoActive.value) {
      stopVhDrawLShapeAuto();
      return;
    }
    const flatProbe = getVhDrawFlatSegments(lyr);
    if (!flatProbe?.length) {
      window.alert('無路網；請確認本層已有 dataJson／geojson。');
      return;
    }
    const listProbe = listOrthogonalLShapesInFlatSegments(flatProbe);
    if (!listProbe.length) {
      window.alert(
        '目前路網中找不到符合條件的正交 L 形（轉折格在含斜線之完整圖上須僅兩條正交邊；兩臂沿 H／V 延伸至「有不同向連線」之格即停）。'
      );
      return;
    }
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
    stopJsonGridFromCoordVertexAuto();
    stopRbConnectAuto();
    vhDrawLShapeAutoActive.value = true;
    vhDrawLShapeAutoNoFlipStreak = 0;
    vhDrawLShapeAutoTimerId = setInterval(async () => {
      if (!vhDrawLShapeAutoActive.value || vhDrawLShapeAutoTickBusy) return;
      const lyrFresh = dataStore.findLayerById(LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID);
      if (!lyrFresh) {
        stopVhDrawLShapeAuto();
        return;
      }
      vhDrawLShapeAutoTickBusy = true;
      try {
        const flat = getVhDrawFlatSegments(lyrFresh);
        if (!flat?.length) {
          stopVhDrawLShapeAuto();
          return;
        }
        const list = listOrthogonalLShapesInFlatSegments(flat);
        if (!list.length) {
          stopVhDrawLShapeAuto();
          vhDrawLShapeStepHint.value = 'L 形已消失，自動已停止。';
          await applyVhDrawLOrthoBundleHighlight(lyrFresh, null);
          return;
        }
        const n = list.length;
        const idx = ((vhDrawLShapeCursor.value % n) + n) % n;
        const L = list[idx];
        const bundle = orthoBundleHighlightForLShape(L);
        await applyVhDrawLOrthoBundleHighlight(lyrFresh, bundle);
        vhDrawLShapeCursor.value = (idx + 1) % n;
        const r = tryFlipOrthogonalLShapeInFlatSegments(flat, L);
        if (r.flipped) {
          vhDrawLShapeAutoNoFlipStreak = 0;
          await applyVhDrawDiagonalAfterReplace(lyrFresh, r.segments);
          vhDrawLShapeStepHint.value = `L 形 ${idx + 1}／${n} · ${lShapeStepLabel(L)} · ${r.reason}（自動每秒）`;
        } else {
          vhDrawLShapeAutoNoFlipStreak += 1;
          vhDrawLShapeStepHint.value = `L 形 ${idx + 1}／${n} · ${lShapeStepLabel(L)} · 無法 flip：${r.reason}（連續 ${vhDrawLShapeAutoNoFlipStreak}／${n}）`;
          if (vhDrawLShapeAutoNoFlipStreak >= n) {
            stopVhDrawLShapeAuto();
            vhDrawLShapeStepHint.value += '；已輪完一週皆不可 flip，自動停止。';
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        vhDrawLShapeAutoTickBusy = false;
      }
    }, VH_DRAW_LSHAPE_AUTO_MS);
  };

  const stopAllOrthogonalVhDrawAutos = () => {
    stopVhDrawDiagonalRouteAuto();
    stopVhDrawLShapeAuto();
    stopVhDrawUnitL45Auto();
  };

  onUnmounted(stopAllOrthogonalVhDrawAutos);

  return reactive({
    LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
    VH_DRAW_LOCAL_JSON_INPUT_ID,
    pickOrthogonalVhDrawLocalJsonClick,
    downloadOrthogonalVhDrawControlTabJson,
    onOrthogonalVhDrawLocalJsonInputChange,
    applyOrthogonalVhDrawFromConvergeCenterLayer,
    LINE_ORTHOGONAL_TOWARD_CENTER_VERT_FIRST_LAYER_ID: LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID,
    LINE_ORTHOGONAL_TOWARD_CENTER_HORIZ_FIRST_LAYER_ID: LINE_ORTHOGONAL_LAYER_ID,
    vhDrawDiagonalRouteAutoActive,
    vhDrawDiagonalRouteAutoKind,
    vhDrawDiagonalRouteStepHint,
    vhDrawDiagonalAutoButtonLabel,
    onOrthogonalVhDrawDiagonalToLClick,
    onOrthogonalVhDrawUnitLTo45Click,
    onOrthogonalVhDrawUnitL45OneClick,
    toggleOrthogonalVhDrawUnitL45Auto,
    vhDrawUnitL45AutoActive,
    vhDrawUnitL45Hint,
    onOrthogonalVhDrawDiagonalOneRouteClick,
    toggleOrthogonalVhDrawDiagonalRouteAuto,
    vhDrawLShapeAutoActive,
    vhDrawLShapeStepHint,
    vhDrawTripleBatchHint,
    onOrthogonalVhDrawTripleBatchClick,
    onOrthogonalVhDrawLShapeOneClick,
    toggleOrthogonalVhDrawLShapeAuto,
    onOrthogonalVhDrawLShapeHighlightAllClick,
    stopVhDrawDiagonalRouteAuto,
    stopVhDrawLShapeAuto,
    stopVhDrawUnitL45Auto,
    stopAllOrthogonalVhDrawAutos,
  });
}
