/**
 * K3Tab 路段權重：除以 100 並 floor（正權重至少為 1）。
 * 與 taipei_b4、runTaipeiB4PipelineFromK3Routes 相同規則。
 */

function deepCloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function scaleWeightValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n <= 0) return 0;
  const scaled = Math.floor(n / 100);
  return scaled >= 1 ? scaled : 1;
}

export function scaleSegmentWeights(seg) {
  if (!seg || typeof seg !== 'object') return;
  if (Array.isArray(seg.station_weights)) {
    seg.station_weights = seg.station_weights.map((item) => {
      if (!item || typeof item !== 'object') return item;
      return {
        ...item,
        weight: scaleWeightValue(item.weight),
      };
    });
  }
  if (seg.nav_weight != null) {
    seg.nav_weight = scaleWeightValue(seg.nav_weight);
  }
}

/** 回傳新陣列，不修改輸入 */
export function scaleRoutesWeights(routes) {
  if (!Array.isArray(routes)) return [];
  const cloned = deepCloneJson(routes);
  for (const seg of cloned) scaleSegmentWeights(seg);
  return cloned;
}
