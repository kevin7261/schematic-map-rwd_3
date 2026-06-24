/** 版面路網「全部隨機 weight」後之路線／比例條漸變動畫（layout-grid-viewer 加權模式） */

export const LAYOUT_VH_DRAW_ROUTE_WEIGHT_ANIM_MS = 3000;

export function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** 與 SpaceNetworkGridTab drawMap 內 slabRemapPlotLocal 同源 */
export function slabRemapPlotLocal(ticks, rats, span, uIn) {
  const n = ticks.length;
  if (n < 2 || rats.length !== n - 1) return Number(uIn);
  const u0 = Number(ticks[0]);
  const u1 = Number(ticks[n - 1]);
  const x = Math.min(Math.max(Number(uIn), u0), u1);
  const newW = rats.map((r) => r * span);
  const cumStarts = [0];
  for (let ii = 0; ii < newW.length; ii++) {
    cumStarts.push(cumStarts[ii] + newW[ii]);
  }
  let i = 0;
  for (; i < n - 2; i++) {
    if (x < Number(ticks[i + 1])) break;
  }
  const a = Number(ticks[i]);
  const b = Number(ticks[i + 1]);
  const ow = b - a;
  const frac = ow > 1e-12 ? (x - a) / ow : 0;
  const f = Math.max(0, Math.min(1, frac));
  return cumStarts[i] + f * newW[i];
}

/**
 * @param {{ wtx: number[], wty: number[], ratXC: number[], ratYR: number[], width: number, height: number }} remap
 * @param {{ top: number, left: number }} margin
 */
export function buildPlotRemapFnsFromAnimRemap(remap, margin) {
  const wtx = remap.wtx.map(Number);
  const wty = remap.wty.map(Number);
  const ratXC = remap.ratXC.map(Number);
  const ratYR = remap.ratYR.map(Number);
  const width = Number(remap.width);
  const height = Number(remap.height);
  const plotRemapSvgX = (sx) =>
    margin.left + slabRemapPlotLocal(wtx, ratXC, width, sx - margin.left);
  const plotRemapSvgY = (sy) =>
    margin.top + slabRemapPlotLocal(wty, ratYR, height, sy - margin.top);
  return { plotRemapSvgX, plotRemapSvgY };
}

function resamplePolyline(pts, sampleCount) {
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const n = Math.max(2, Math.floor(sampleCount));
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lens.push(L);
    total += L;
  }
  if (!(total > 1e-12)) {
    return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    let acc = 0;
    for (let i = 0; i < lens.length; i++) {
      if (acc + lens[i] >= target) {
        const tt = lens[i] > 0 ? (target - acc) / lens[i] : 0;
        out.push([
          pts[i][0] + tt * (pts[i + 1][0] - pts[i][0]),
          pts[i][1] + tt * (pts[i + 1][1] - pts[i][1]),
        ]);
        break;
      }
      acc += lens[i];
    }
    if (out.length <= k) out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  }
  return out;
}

function interpolateNumberArrays(from, to, t) {
  const n = Math.min(from.length, to.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(from[i] + t * (to[i] - from[i]));
  }
  return out;
}

/**
 * @param {Map<string, number[][]>|null|undefined} routesMap
 * @param {{ wtx: number[], wty: number[], ratXC: number[], ratYR: number[], width: number, height: number }} remapArgs
 */
export function buildLayoutVhDrawRouteAnimSnapshot(routesMap, remapArgs) {
  const routes = {};
  if (routesMap) {
    for (const [k, pts] of routesMap.entries()) {
      if (Array.isArray(pts) && pts.length >= 2) {
        routes[k] = pts.map((p) => [Number(p[0]), Number(p[1])]);
      }
    }
  }
  return {
    routes,
    remap: {
      wtx: remapArgs.wtx.map(Number),
      wty: remapArgs.wty.map(Number),
      ratXC: remapArgs.ratXC.map(Number),
      ratYR: remapArgs.ratYR.map(Number),
      width: Number(remapArgs.width),
      height: Number(remapArgs.height),
    },
  };
}

/**
 * 動畫中僅內插欄／列比例條（plotRemap）；路線須由繪製端依內插 remap 重跑 HV45° 算法。
 */
export function interpolateLayoutVhDrawRouteAnimRemap(from, to, t) {
  if (!from?.remap || !to?.remap) return null;
  return {
    wtx: (from.remap.wtx || []).map(Number),
    wty: (from.remap.wty || []).map(Number),
    width: Number(to.remap.width ?? from.remap.width),
    height: Number(to.remap.height ?? from.remap.height),
    ratXC: interpolateNumberArrays(from.remap.ratXC || [], to.remap.ratXC || [], t),
    ratYR: interpolateNumberArrays(from.remap.ratYR || [], to.remap.ratYR || [], t),
  };
}

/** 前後快照幾乎相同時略過動畫（以比例條與路線折點綜合判斷） */
export function layoutVhDrawRouteAnimSnapshotHasMotion(from, to, eps = 0.5) {
  const ratXC = from.remap?.ratXC;
  const ratXC2 = to.remap?.ratXC;
  if (ratXC && ratXC2) {
    for (let i = 0; i < Math.min(ratXC.length, ratXC2.length); i++) {
      if (Math.abs(ratXC[i] - ratXC2[i]) > 1e-6) return true;
    }
  }
  const ratYR = from.remap?.ratYR;
  const ratYR2 = to.remap?.ratYR;
  if (ratYR && ratYR2) {
    for (let i = 0; i < Math.min(ratYR.length, ratYR2.length); i++) {
      if (Math.abs(ratYR[i] - ratYR2[i]) > 1e-6) return true;
    }
  }
  if (!from?.routes || !to?.routes) return false;
  const keys = new Set([...Object.keys(from.routes), ...Object.keys(to.routes)]);
  for (const key of keys) {
    const fp = from.routes[key];
    const tp = to.routes[key];
    if (!fp || !tp) return true;
    const fr = resamplePolyline(fp, 12);
    const tr = resamplePolyline(tp, 12);
    for (let i = 0; i < fr.length; i++) {
      const dx = fr[i][0] - tr[i][0];
      const dy = fr[i][1] - tr[i][1];
      if (Math.hypot(dx, dy) > eps) return true;
    }
  }
  return false;
}
