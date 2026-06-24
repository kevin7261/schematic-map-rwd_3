/**
 * Axis / grid ticks: step is always 5 × 10^k (k integer); labels at most 2 decimal places.
 */

export function niceTickStepMultipleOf5(span, approxCount = 10) {
  const raw = span / Math.max(approxCount, 1);
  if (!Number.isFinite(raw) || raw <= 0) return 0.05;
  const pow = Math.floor(Math.log10(raw));
  const c0 = 5 * 10 ** pow;
  const c1 = 5 * 10 ** (pow + 1);
  let step = raw <= c0 ? c0 : c1;
  if (step < 0.05) step = 0.05;
  return step;
}

export function buildTicksInRange(min, max, step) {
  const ticks = [];
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) {
    return ticks;
  }
  const eps = 1e-9 * Math.max(Math.abs(step), 1);
  const start = Math.ceil((min - eps) / step) * step;
  for (let t = start; t <= max + eps; t += step) {
    if (t >= min - eps && t <= max + eps) ticks.push(t);
  }
  return ticks;
}

/** Coarse integer grid step: at least 5, rounded up to a multiple of 5 */
export function snapCoarseGridStepToMultipleOf5(step) {
  const s = Math.max(1, Math.ceil(Number(step) || 1));
  return Math.max(5, Math.ceil(s / 5) * 5);
}

export function formatAxisTickLabelMaxTwoDecimals(tick, asFloat) {
  if (!Number.isFinite(tick)) return '';
  if (!asFloat) return String(tick);
  const r = Math.round(tick * 100) / 100;
  if (Number.isInteger(r) || Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
  return r.toFixed(2);
}
