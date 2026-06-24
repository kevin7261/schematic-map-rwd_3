/**
 * taipei_k4：路線僅在「相鄰兩個紅／藍 connect」之間視覺相連（該子折線可跨多段 flat segment）；
 * 不把整條端點鏈併成單一 LineString。connect 間黑點沿該子折線「螢幕 px 弧長」均分（傳入 xScale/yScale），
 * resize 後繪區變化時位置隨比例尺重算。未傳 scale 時退回到資料座標弧長（舊行為）。
 * 若傳入 margin＋snapGridPx，則輸出之網格座標經繪區 px snap 後反算，與 JSON 分頁門檻倍數一致。
 */

import { snapDataCoordToK4PlotPxMultiples } from './taipeiK4SpaceNetworkPlotPx.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pt(xy) {
  return [num(xy[0]), num(xy[1])];
}

function ptKey(xy) {
  const x = Math.round(num(xy[0]) * 1e6) / 1e6;
  const y = Math.round(num(xy[1]) * 1e6) / 1e6;
  return `${x},${y}`;
}

function samePt(a, b, eps = 1e-5) {
  return Math.abs(num(a[0]) - num(b[0])) <= eps && Math.abs(num(a[1]) - num(b[1])) <= eps;
}

function dist2d(p, q) {
  const dx = num(p[0]) - num(q[0]);
  const dy = num(p[1]) - num(q[1]);
  return Math.sqrt(dx * dx + dy * dy);
}

/** 與 SpaceNetworkGridTabK3 站點圖：中段「真站／黑點」判斷一致 */
function isMidBlackRealStation(midProps) {
  if (!midProps || typeof midProps !== 'object') return false;
  if (midProps.display === false) return false;
  if (String(midProps.node_type || '').trim() === 'connect') return false;
  return !!(
    midProps.station_name ||
    midProps.tags?.station_name ||
    midProps.tags?._forceDrawBlackDot
  );
}

function groupFlatSegmentsByEndpointChain(flatSegments) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) return [];
  const chains = [];
  let cur = [];
  for (const seg of flatSegments) {
    const pts = seg?.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    if (!cur.length) {
      cur.push(seg);
      continue;
    }
    const prev = cur[cur.length - 1];
    const pLast = prev.points[prev.points.length - 1];
    const b0 = pts[0];
    const b = Array.isArray(b0) ? pt([b0[0], b0[1]]) : pt([b0.x, b0.y]);
    const pA = Array.isArray(pLast) ? pt([pLast[0], pLast[1]]) : pt([pLast.x, pLast.y]);
    if (samePt(pA, b)) cur.push(seg);
    else {
      chains.push(cur);
      cur = [seg];
    }
  }
  if (cur.length) chains.push(cur);
  return chains;
}

/**
 * 鏈內串接 points／nodes；接縫重點去重，若一端為 connect 則保留 connect。
 * @returns {{ coords: number[][], metas: { nodeType: string, props: object }[] }}
 */
function concatSegmentChain(chainSegs) {
  const coords = [];
  const metas = [];
  for (const seg of chainSegs) {
    const pts = seg.points || [];
    const nodes = seg.nodes || [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const c = Array.isArray(p) ? pt([p[0], p[1]]) : pt([p.x, p.y]);
      const node = nodes[i] && typeof nodes[i] === 'object' ? nodes[i] : {};
      const fromPt = Array.isArray(p) && p.length > 2 && typeof p[2] === 'object' ? p[2] : {};
      const mergedProps = { ...node, ...fromPt };
      let nt = String(node.node_type || mergedProps.node_type || '').trim();
      if (!nt) nt = 'line';
      if (coords.length && ptKey(coords[coords.length - 1]) === ptKey(c)) {
        const prev = metas[metas.length - 1];
        if (nt === 'connect' || prev.nodeType === 'connect') {
          metas[metas.length - 1] = {
            nodeType: nt === 'connect' || prev.nodeType === 'connect' ? 'connect' : prev.nodeType,
            props: { ...prev.props, ...mergedProps },
          };
        }
        continue;
      }
      coords.push(c);
      metas.push({ nodeType: nt, props: mergedProps });
    }
  }
  return { coords, metas };
}

function polylineTotalLength(coords) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += dist2d(coords[i - 1], coords[i]);
  return s;
}

function polylineTotalLengthPx(coords, xScale, yScale) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) {
    const p1 = coords[i - 1];
    const p2 = coords[i];
    const ax = xScale(num(p1[0]));
    const ay = yScale(num(p1[1]));
    const bx = xScale(num(p2[0]));
    const by = yScale(num(p2[1]));
    s += Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
  }
  return s;
}

/** 沿 sub 從 sub[0] 起算之 px 弧長，到 (gx,gy) 在折線（螢幕線段）上之正交投影 */
function accumPxToDataPointOnPolyline(sub, gx, gy, xScale, yScale) {
  const px = xScale(num(gx));
  const py = yScale(num(gy));
  let bestDist = Infinity;
  let bestAcc = 0;
  let acc = 0;
  for (let i = 0; i < sub.length - 1; i++) {
    const p1 = sub[i];
    const p2 = sub[i + 1];
    const x1 = xScale(num(p1[0]));
    const y1 = yScale(num(p1[1]));
    const x2 = xScale(num(p2[0]));
    const y2 = yScale(num(p2[1]));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let r = 0;
    if (len2 > 1e-18) {
      r = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    }
    const qx = x1 + r * dx;
    const qy = y1 + r * dy;
    const d = Math.sqrt((px - qx) ** 2 + (py - qy) ** 2);
    const segLen = Math.sqrt(len2);
    const accHere = acc + r * segLen;
    if (d < bestDist) {
      bestDist = d;
      bestAcc = accHere;
    }
    acc += segLen;
  }
  return bestAcc;
}

/** 沿 coords 從起點累積距離 target（0…total）之點 */
function pointAtDistanceAlongPolyline(coords, target) {
  if (!Array.isArray(coords) || coords.length === 0) return [0, 0];
  if (coords.length === 1) return pt(coords[0]);
  let t = Math.max(0, target);
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const len = dist2d(p1, p2);
    if (t <= len || i === coords.length - 2) {
      if (len <= 1e-12) return pt(p1);
      const r = Math.min(1, t / len);
      return [
        num(p1[0]) + r * (num(p2[0]) - num(p1[0])),
        num(p1[1]) + r * (num(p2[1]) - num(p1[1])),
      ];
    }
    t -= len;
  }
  return pt(coords[coords.length - 1]);
}

/** 沿 coords 從起點累積「螢幕 px」距離 targetPx 之資料座標點 */
function pointAtDistanceAlongPolylinePx(coords, targetPx, xScale, yScale) {
  if (!Array.isArray(coords) || coords.length === 0) return [0, 0];
  if (coords.length === 1) return pt(coords[0]);
  let t = Math.max(0, targetPx);
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const ax = xScale(num(p1[0]));
    const ay = yScale(num(p1[1]));
    const bx = xScale(num(p2[0]));
    const by = yScale(num(p2[1]));
    const len = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    if (t <= len || i === coords.length - 2) {
      if (len <= 1e-12) return pt(p1);
      const r = Math.min(1, t / len);
      return [
        num(p1[0]) + r * (num(p2[0]) - num(p1[0])),
        num(p1[1]) + r * (num(p2[1]) - num(p1[1])),
      ];
    }
    t -= len;
  }
  return pt(coords[coords.length - 1]);
}

/** 頂點在 sub 上的累積弧長（從 sub[0] 起） */
function cumulativeDistToVertex(sub, idx) {
  let s = 0;
  for (let i = 0; i < idx && i < sub.length - 1; i++) s += dist2d(sub[i], sub[i + 1]);
  return s;
}

function buildPolylineCumulativeDistances(coords, usePx, xScale, yScale) {
  const cum = [0];
  if (!Array.isArray(coords) || coords.length < 2) return cum;
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    let segLen;
    if (usePx && xScale && yScale) {
      const ax = xScale(num(a[0]));
      const ay = yScale(num(a[1]));
      const bx = xScale(num(b[0]));
      const by = yScale(num(b[1]));
      segLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    } else {
      segLen = dist2d(a, b);
    }
    acc += segLen;
    cum.push(acc);
  }
  return cum;
}

function pointAtDistanceMetric(coords, d, usePx, xScale, yScale) {
  return usePx
    ? pointAtDistanceAlongPolylinePx(coords, d, xScale, yScale)
    : pointAtDistanceAlongPolyline(coords, d);
}

function slicePolylineByDistance(coords, cum, fromD, toD, usePx, xScale, yScale) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 1e-12) return [];
  const d0 = Math.max(0, Math.min(total, fromD));
  const d1 = Math.max(0, Math.min(total, toD));
  if (d1 - d0 <= 1e-12) return [];

  const out = [];
  out.push(pointAtDistanceMetric(coords, d0, usePx, xScale, yScale));
  for (let i = 1; i < coords.length - 1; i++) {
    if (cum[i] > d0 + 1e-9 && cum[i] < d1 - 1e-9) out.push(pt(coords[i]));
  }
  out.push(pointAtDistanceMetric(coords, d1, usePx, xScale, yScale));
  return out;
}

function pointToSegmentDistance(p, a, b) {
  const px = num(p[0]);
  const py = num(p[1]);
  const ax = num(a[0]);
  const ay = num(a[1]);
  const bx = num(b[0]);
  const by = num(b[1]);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-18) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.sqrt((px - qx) ** 2 + (py - qy) ** 2);
}

function pointToPolylineDistance(p, coords) {
  if (!Array.isArray(coords) || coords.length === 0) return Infinity;
  if (coords.length === 1) return dist2d(p, coords[0]);
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentDistance(p, coords[i], coords[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function extractSegmentWeight(seg) {
  const ws = Array.isArray(seg?.station_weights) ? seg.station_weights : [];
  const w0 = ws.find((w) => Number.isFinite(Number(w?.weight)));
  if (w0) return Number(w0.weight);
  if (Number.isFinite(Number(seg?.nav_weight))) return Number(seg.nav_weight);
  return 1;
}

/**
 * @param {Array<object>} flatSegments
 * @param {Array<object>} routeFeatures — 未使用時可傳入以保留 API；邏輯以 flatSegments 為準
 * @param {Array<object>} stationFeatures
 * @param {{ xScale: function, yScale: function, margin?: { left: number, top: number }, snapGridPx?: number, plotInnerHeight?: number } | null | undefined} pixelScales — 有則黑點均分依 SVG px 弧長；無則依資料座標弧長；margin＋snapGridPx＋plotInnerHeight 則輸出座標對齊繪區 px 門檻倍數（y 繪區為左下原點）
 * @returns {{ routeFeatures: object[], stationFeatures: object[] }}
 */
export function rebuildTaipeiK4DrawFromFlatSegments(
  flatSegments,
  routeFeatures,
  stationFeatures,
  pixelScales
) {
  if (!Array.isArray(flatSegments) || flatSegments.length === 0) {
    return { routeFeatures: routeFeatures || [], stationFeatures: stationFeatures || [] };
  }

  const xScale =
    pixelScales && typeof pixelScales.xScale === 'function' ? pixelScales.xScale : null;
  const yScale =
    pixelScales && typeof pixelScales.yScale === 'function' ? pixelScales.yScale : null;
  const usePx = !!(xScale && yScale);
  const margin = pixelScales?.margin;
  const snapPxRaw = pixelScales?.snapGridPx;
  const plotInnerHeight = pixelScales?.plotInnerHeight;
  const canSnap =
    usePx &&
    margin &&
    Number.isFinite(Number(margin.left)) &&
    Number.isFinite(Number(margin.top)) &&
    snapPxRaw != null &&
    Number.isFinite(Number(snapPxRaw)) &&
    Number(snapPxRaw) >= 1 &&
    Number.isFinite(Number(plotInnerHeight)) &&
    Number(plotInnerHeight) > 0;

  const snapXY = (xy) => {
    if (!canSnap) return pt(xy);
    return snapDataCoordToK4PlotPxMultiples(
      xy[0],
      xy[1],
      xScale,
      yScale,
      margin,
      snapPxRaw,
      plotInnerHeight
    );
  };

  const chains = groupFlatSegmentsByEndpointChain(flatSegments);
  const outRoutes = [];
  const connects = (stationFeatures || []).filter((f) => f && f.nodeType === 'connect');
  const origBlacks = (stationFeatures || []).filter((f) => f && f.nodeType !== 'connect');
  const newBlacks = [];

  for (const chain of chains) {
    if (!chain.length) continue;
    const { coords: coordsRaw, metas } = concatSegmentChain(chain);
    const coords = coordsRaw;
    if (coords.length < 2) continue;

    const seg0 = chain[0];
    const props0 = seg0.props || seg0.original_props || {};
    const tags =
      props0.way_properties?.tags || props0.properties?.tags || seg0.way_properties?.tags || {};
    const name = seg0.route_name || props0.name || props0.route_name || seg0.name;
    const color = seg0.route_color || props0.color;
    const navWeight =
      seg0.nav_weight != null && Number.isFinite(Number(seg0.nav_weight))
        ? Number(seg0.nav_weight)
        : 1;
    const chainWeightRefs = chain
      .map((seg) => {
        const pts = Array.isArray(seg?.points) ? seg.points : [];
        const coords = pts
          .map((p) => (Array.isArray(p) ? pt([p[0], p[1]]) : pt([p?.x, p?.y])))
          .filter((c) => Array.isArray(c) && c.length >= 2);
        if (coords.length < 2) return null;
        return { coords, weight: extractSegmentWeight(seg) };
      })
      .filter((x) => x && Number.isFinite(Number(x.weight)));

    const connectIdx = [];
    for (let i = 0; i < metas.length; i++) {
      if (String(metas[i].nodeType).trim() === 'connect') connectIdx.push(i);
    }

    const pushLineIfOk = (sliceCoords, idx) => {
      if (!Array.isArray(sliceCoords) || sliceCoords.length < 2) return;
      const midRaw = pointAtDistanceAlongPolyline(
        sliceCoords,
        polylineTotalLength(sliceCoords) / 2
      );
      let segWeight = Number.isFinite(Number(navWeight)) ? Number(navWeight) : 1;
      let bestD = Infinity;
      for (const ref of chainWeightRefs) {
        const d = pointToPolylineDistance(midRaw, ref.coords);
        if (d < bestD) {
          bestD = d;
          segWeight = ref.weight;
        }
      }
      const mapped = canSnap ? sliceCoords.map((c) => snapXY(c)) : sliceCoords.map((c) => pt(c));
      const dedup = [];
      for (const c of mapped) {
        if (!dedup.length || !samePt(dedup[dedup.length - 1], c, 1e-8)) dedup.push(c);
      }
      if (dedup.length < 2) return;
      outRoutes.push({
        geometry: { type: 'LineString', coordinates: dedup },
        properties: {
          tags: typeof tags === 'object' && tags ? { ...tags } : {},
          name,
          color,
          // 切段後每段補一組站間權重，供主圖顯示路線權重數字。
          station_weights: [{ start_idx: 0, end_idx: dedup.length - 1, weight: segWeight }],
          original_points: undefined,
          points: undefined,
          _flatSegmentIndex: idx,
        },
      });
    };

    let routeFeatIdx = outRoutes.length;

    if (connectIdx.length < 2) {
      for (const seg of chain) {
        const pts = seg?.points;
        if (!Array.isArray(pts) || pts.length < 2) continue;
        const lineCoords = pts.map((p) => {
          const q = Array.isArray(p) ? pt([p[0], p[1]]) : pt([p.x, p.y]);
          return canSnap ? snapXY(q) : q;
        });
        pushLineIfOk(lineCoords, routeFeatIdx++);
      }
      continue;
    }

    const ic0 = connectIdx[0];
    if (ic0 > 0) {
      pushLineIfOk(coords.slice(0, ic0 + 1), routeFeatIdx++);
    }
    for (let ci = 0; ci < connectIdx.length - 1; ci++) {
      const ia = connectIdx[ci];
      const ib = connectIdx[ci + 1];
      const sub = coords.slice(ia, ib + 1);
      if (sub.length < 2) continue;
      const interiorKeys = new Set();
      for (let u = ia + 1; u < ib; u++) interiorKeys.add(ptKey(coords[u]));

      const blacksHere = origBlacks
        .filter((f) => {
          const c = f?.geometry?.coordinates;
          if (!Array.isArray(c) || c.length < 2) return false;
          return interiorKeys.has(ptKey(c));
        })
        .map((f) => {
          const c = f.geometry.coordinates;
          let acc;
          if (usePx) {
            acc = accumPxToDataPointOnPolyline(sub, c[0], c[1], xScale, yScale);
          } else {
            let bestIdx = ia;
            let bestD = Infinity;
            for (let u = ia; u < ib; u++) {
              const d = dist2d(coords[u], c);
              if (d < bestD) {
                bestD = d;
                bestIdx = u;
              }
            }
            acc = cumulativeDistToVertex(coords, bestIdx) + dist2d(coords[bestIdx], c);
          }
          return { f, acc };
        })
        .sort((a, b) => a.acc - b.acc);

      const interiorMetaBlacks = [];
      for (let k = ia + 1; k < ib; k++) {
        if (String(metas[k].nodeType).trim() === 'connect') continue;
        if (isMidBlackRealStation(metas[k].props)) interiorMetaBlacks.push(metas[k]);
      }

      let K = blacksHere.length;
      if (!K) K = interiorMetaBlacks.length;

      const totalL = usePx ? polylineTotalLengthPx(sub, xScale, yScale) : polylineTotalLength(sub);
      if (totalL <= 1e-12) continue;
      const cutDistances = [0];

      if (K > 0) {
        for (let m = 0; m < K; m++) {
          const d = (totalL * (m + 1)) / (K + 1);
          const [nx, ny] = usePx
            ? pointAtDistanceAlongPolylinePx(sub, d, xScale, yScale)
            : pointAtDistanceAlongPolyline(sub, d);
          const [fx, fy] = canSnap ? snapXY([nx, ny]) : [nx, ny];
          const srcFeat = blacksHere[m]?.f;
          const srcMeta = interiorMetaBlacks[m]?.props;
          const baseProps = srcFeat?.properties
            ? { ...srcFeat.properties }
            : srcMeta
              ? { ...srcMeta }
              : {};
          newBlacks.push({
            geometry: { type: 'Point', coordinates: [fx, fy] },
            properties: {
              ...baseProps,
              x_grid: fx,
              y_grid: fy,
            },
            nodeType: 'line',
          });
          cutDistances.push(d);
        }
      }
      cutDistances.push(totalL);
      const cum = buildPolylineCumulativeDistances(sub, usePx, xScale, yScale);
      for (let si = 0; si < cutDistances.length - 1; si++) {
        const part = slicePolylineByDistance(
          sub,
          cum,
          cutDistances[si],
          cutDistances[si + 1],
          usePx,
          xScale,
          yScale
        );
        pushLineIfOk(part, routeFeatIdx++);
      }
    }
    const icLast = connectIdx[connectIdx.length - 1];
    if (icLast < coords.length - 1) {
      pushLineIfOk(coords.slice(icLast), routeFeatIdx++);
    }
  }

  if (!outRoutes.length) {
    return { routeFeatures: routeFeatures || [], stationFeatures: stationFeatures || [] };
  }

  const snappedConnects = canSnap
    ? connects.map((f) => {
        if (!f?.geometry?.coordinates) return f;
        const [nx, ny] = snapXY(f.geometry.coordinates);
        const props = { ...(f.properties || {}), x_grid: nx, y_grid: ny };
        return {
          ...f,
          geometry: { ...f.geometry, coordinates: [nx, ny] },
          properties: props,
        };
      })
    : connects;

  return {
    routeFeatures: outRoutes,
    stationFeatures: [...snappedConnects, ...newBlacks],
  };
}
