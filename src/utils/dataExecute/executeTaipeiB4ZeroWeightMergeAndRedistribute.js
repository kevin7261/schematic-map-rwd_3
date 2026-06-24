/* eslint-disable no-console */

/**
 * 以 taipei_b4 的 K3Tab（權威來源）為輸入跑零權重黑點合併，寫回 taipei_c4。
 *
 * 重要：**輸入固定讀 b4**，不讀 c4。否則重複按「開始執行」會把上一次合併後的
 * max(97,78)=97 回填進 c4，再次合併時 78 已消失、下一輪變成把其他鄰段也拉成 97，
 * 永久污染 c4（「根本沒改」現象即此因）。
 *
 * （與 executeTaipeiB5ZeroWeightMergeAndRedistribute.js 分檔複製，測試4／測試5 不共用本體。）
 */

import { useDataStore } from '@/stores/dataStore.js';
import { runTaipeiB4PipelineFromK3Routes } from '@/utils/dataExecute/taipeiB4PipelineFromK3.js';

export async function executeTaipeiB4ZeroWeightMergeAndRedistribute() {
  const dataStore = useDataStore();
  const a4 = dataStore.findLayerById('taipei_a4');
  const b4 = dataStore.findLayerById('taipei_b4');
  const c4 = dataStore.findLayerById('taipei_c4');
  if (!a4 || !b4 || !c4) {
    console.warn(
      'executeTaipeiB4ZeroWeightMergeAndRedistribute：缺少 taipei_a4／taipei_b4／taipei_c4 圖層'
    );
    return;
  }
  const k3 = b4.spaceNetworkGridJsonDataK3Tab;
  if (!Array.isArray(k3) || k3.length === 0) {
    console.warn(
      'executeTaipeiB4ZeroWeightMergeAndRedistribute：taipei_b4 尚無 K3Tab 路網，請先執行 a4→b4'
    );
    return;
  }

  const summariseWeights = (routes, label, filter) => {
    const rows = [];
    for (const r of routes || []) {
      const name = String(r?.route_name ?? r?.name ?? '');
      const pts = r?.points || [];
      const sw = Array.isArray(r?.station_weights) ? r.station_weights : [];
      const w = sw.map((x) => Number(x?.weight)).filter((v) => Number.isFinite(v));
      const pickSid = (p, fallback) => {
        const props =
          (Array.isArray(p) && p.length > 2 && p[2]) || (p && typeof p === 'object' ? p : null);
        const t = props?.tags;
        return (
          props?.station_name ??
          t?.station_name ??
          t?.name ??
          fallback?.station_name ??
          fallback?.tags?.station_name ??
          fallback?.tags?.name ??
          '?'
        );
      };
      const sName = pickSid(pts[0], r?.properties_start);
      const eName = pickSid(pts[pts.length - 1], r?.properties_end);
      const row = { route: name, from: sName, to: eName, wts: w.join(','), nav: r?.nav_weight };
      if (!filter || filter(row)) rows.push(row);
    }
    console.log(`[c4 merge debug] ${label}：${rows.length} rows`);
    console.table(rows);
  };

  const onlyBannan = (row) => row.route === '板南線';
  summariseWeights(k3, 'INPUT b4.K3Tab (板南線)', onlyBannan);

  const { removedBlackDots, scaledSegs, initialSegmentCount, blackPlacementStats } =
    await runTaipeiB4PipelineFromK3Routes(dataStore, a4, c4, k3, {
      zeroWeightMerge: true,
      mergeMaxWeightDiff: dataStore.taipeiK3MergeMaxWeightDiff,
      sourceLabel: 'executeTaipeiB4ZeroWeightMergeAndRedistribute',
    });

  summariseWeights(c4.spaceNetworkGridJsonDataK3Tab, 'OUTPUT c4.K3Tab (板南線)', onlyBannan);
  summariseWeights(
    c4.layoutGridJsonData,
    'OUTPUT c4.layoutGridJsonData ← LayoutGridTab 讀這個 (板南線)',
    onlyBannan
  );
  summariseWeights(
    c4.spaceNetworkGridJsonData,
    'OUTPUT c4.spaceNetworkGridJsonData (板南線)',
    onlyBannan
  );

  const summariseProcessed = (rows, label) => {
    if (!Array.isArray(rows)) {
      console.log(`[c4 merge debug] ${label}: (not array)`, rows);
      return;
    }
    const out = [];
    for (const r of rows) {
      const routeName = String(
        r?.routeName ?? r?.route_name ?? r?.properties?.route_name ?? ''
      );
      if (routeName !== '板南線') continue;
      const seg = r?.segment || r?.properties?.segment || {};
      const start = seg.start || {};
      const end = seg.end || {};
      const sw = Array.isArray(r?.station_weights)
        ? r.station_weights
        : Array.isArray(r?.properties?.station_weights)
          ? r.properties.station_weights
          : [];
      const w = sw.map((x) => Number(x?.weight)).filter((v) => Number.isFinite(v));
      out.push({
        route: routeName,
        from: start.station_name ?? '?',
        to: end.station_name ?? '?',
        wts: w.join(','),
        nav: r?.nav_weight ?? r?.properties?.nav_weight,
      });
    }
    console.log(`[c4 merge debug] ${label}：${out.length} rows`);
    console.table(out);
  };
  summariseProcessed(c4.processedJsonData, 'OUTPUT c4.processedJsonData (板南線)');
  summariseProcessed(
    c4.processedJsonDataK3Tab,
    'OUTPUT c4.processedJsonDataK3Tab (板南線)'
  );

  console.log(
    `c4 手動零權重合併完成：合併 ${removedBlackDots.length} 個零權重黑點；` +
      `黑點配置 ${blackPlacementStats.placedBlackSectionCount} 段，` +
      `切段後路段數 ${scaledSegs.length}（輸入 ${initialSegmentCount} 段）`
  );
}
