import * as d3 from 'd3';

/** 線寬 range 下限（px） */
export const ROUTE_STROKE_WEIGHT_MIN_PX = 1;
/** 線寬 range 上限（pt） */
export const ROUTE_STROKE_WEIGHT_MAX_PT = 10;

/** CSS 參考像素：1pt = 96/72 px */
const PT_TO_CSS_PX = 96 / 72;
const ROUTE_STROKE_WEIGHT_MAX_PX = ROUTE_STROKE_WEIGHT_MAX_PT * PT_TO_CSS_PX;

/**
 * 由權重樣本建立 d3.scaleLinear：domain [minW, maxW]，range [1px, 10pt 等效 px]、clamp。
 * @param {number[]} positiveWeights
 * @returns {import('d3-scale').ScaleLinear<number, number>}
 */
export function buildRouteWeightStrokeScaleLinear(positiveWeights) {
  const nums = (positiveWeights || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  let lo = nums.length ? Math.min(...nums) : 1;
  let hi = nums.length ? Math.max(...nums) : 1;
  if (hi < lo) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  if (!nums.length) {
    lo = 1;
    hi = 2;
  } else if (lo === hi) {
    const w = lo;
    lo = Math.max(1e-6, w - 1);
    hi = w + 1;
  }
  return d3
    .scaleLinear()
    .domain([lo, hi])
    .range([ROUTE_STROKE_WEIGHT_MIN_PX, ROUTE_STROKE_WEIGHT_MAX_PX])
    .clamp(true);
}

/**
 * @param {unknown} weight
 * @param {import('d3-scale').ScaleLinear<number, number>} scale
 */
export function strokeWidthPxFromWeightScale(scale, weight) {
  const w = Number(weight);
  const x = Number.isFinite(w) && w > 0 ? w : 1;
  return scale(x);
}

export function formatStrokeWidthPx(px) {
  const v = Number(px);
  if (!Number.isFinite(v)) return `${ROUTE_STROKE_WEIGHT_MIN_PX}px`;
  return `${v}px`;
}

/**
 * GeoJSON route features：station_weights 與 tags 上的權重。
 * @param {Array<{ properties?: object }>} features
 * @returns {number[]}
 */
export function collectWeightsFromGeoRouteFeatures(features) {
  const out = [];
  for (const f of features || []) {
    const props = f?.properties;
    if (!props || typeof props !== 'object') continue;
    const tags = props.tags || {};
    const sw = props.station_weights;
    if (Array.isArray(sw)) {
      for (const row of sw) {
        const n = Number(row?.weight);
        if (Number.isFinite(n) && n > 0) out.push(n);
      }
    }
    const tw = Number(tags?.weight ?? tags?.route_weight ?? tags?.routeWeight);
    if (Number.isFinite(tw) && tw > 0) out.push(tw);
  }
  return out;
}

/**
 * K3 主圖：dataTable 查表之 weight 與各 feature 之 station_weights／tags。
 * @param {Array<{ properties?: object }>} routeFeatures
 * @param {Map<unknown, unknown>} dataTableWeightLookup
 * @returns {number[]}
 */
export function collectWeightsFromK3RouteDrawing(routeFeatures, dataTableWeightLookup) {
  const out = [];
  if (dataTableWeightLookup && typeof dataTableWeightLookup.values === 'function') {
    for (const v of dataTableWeightLookup.values()) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.push(n);
    }
  }
  out.push(...collectWeightsFromGeoRouteFeatures(routeFeatures));
  return out;
}
