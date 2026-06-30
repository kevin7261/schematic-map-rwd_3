/**
 * Control 分頁：管線四階段圖層「匯入／匯出 JSON」。
 */
import { ref } from 'vue';
import { setControlLoadFeedback } from '@/utils/control/controlLoadFeedback.js';
import {
  applyPipelineLayerSnapshot,
  buildPipelineLayerSnapshot,
  buildPipelineLayerSnapshotFilename,
  isPipelineSnapshotLayer,
  parsePipelineLayerSnapshotFile,
  pipelineLayerHasExportableData,
  resolvePipelineCityName,
  triggerPipelineJsonDownload,
  findPipelineGroupName,
} from './pipelineLayerSnapshot.js';

export const PIPELINE_LAYER_SNAPSHOT_INPUT_ID = 'pipeline-layer-snapshot-json-input';

/**
 * @param {{
 *   dataStore: { findLayerById: Function, layers: Array, saveLayerState: Function };
 *   onAfterImport?: (layer: object) => void | Promise<void>;
 * }} opts
 */
export function usePipelineLayerSnapshotControlTab({ dataStore, onAfterImport }) {
  const pipelineSnapshotImportTargetLayerId = ref(null);

  const pipelineLayerCanExport = (layer) =>
    isPipelineSnapshotLayer(dataStore, layer) && pipelineLayerHasExportableData(layer);

  const pickPipelineLayerSnapshotImport = (layer) => {
    if (!layer?.layerId) return;
    pipelineSnapshotImportTargetLayerId.value = layer.layerId;
    document.getElementById(PIPELINE_LAYER_SNAPSHOT_INPUT_ID)?.click();
  };

  const exportPipelineLayerSnapshot = (layer) => {
    if (!layer?.layerId) return;
    if (!pipelineLayerHasExportableData(layer)) {
      setControlLoadFeedback(
        layer.layerId,
        '此圖層尚無可匯出資料。請先完成對應步驟或載入城市路線。',
        'danger'
      );
      return;
    }
    try {
      const snapshot = buildPipelineLayerSnapshot(layer, dataStore);
      const filename = buildPipelineLayerSnapshotFilename(
        snapshot.groupName || findPipelineGroupName(dataStore, layer.layerId) || 'group',
        snapshot.layerName || layer.layerName,
        snapshot.cityName || resolvePipelineCityName(dataStore)
      );
      triggerPipelineJsonDownload(snapshot, filename);
      setControlLoadFeedback(layer.layerId, `已匯出「${filename}」。`, 'success');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('匯出管線快照失敗', e);
      setControlLoadFeedback(layer.layerId, '匯出失敗（詳見控制台）。', 'danger');
    }
  };

  const onPipelineLayerSnapshotInputChange = async (event) => {
    const file = event?.target?.files?.[0];
    event.target.value = '';
    const layerId = pipelineSnapshotImportTargetLayerId.value;
    pipelineSnapshotImportTargetLayerId.value = null;
    if (!file || !layerId) return;
    const layer = dataStore.findLayerById(layerId);
    if (!layer) {
      setControlLoadFeedback(layerId, '找不到目標圖層。', 'danger');
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const check = parsePipelineLayerSnapshotFile(parsed, layerId);
      if (!check.ok) {
        setControlLoadFeedback(layerId, check.message || '無法匯入。', 'danger');
        return;
      }
      applyPipelineLayerSnapshot(layer, check.snapshot, dataStore);
      if (typeof onAfterImport === 'function') {
        await onAfterImport(layer);
      }
      setControlLoadFeedback(
        layerId,
        `已匯入「${check.snapshot.layerName || layer.layerName}」快照。`,
        'success'
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('匯入管線快照失敗', e);
      setControlLoadFeedback(layerId, '匯入失敗：' + (e?.message || String(e)), 'danger');
    }
  };

  return {
    isPipelineSnapshotLayer: (layer) => isPipelineSnapshotLayer(dataStore, layer),
    pipelineLayerCanExport,
    pickPipelineLayerSnapshotImport,
    exportPipelineLayerSnapshot,
    onPipelineLayerSnapshotInputChange,
  };
}
