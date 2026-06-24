/**
 * 僅供繪圖：將對角線段展開為矩齒（曼哈頓階梯），與 applyHVZToSpaceNetwork 之鋸齒「先橫後豎」變體一致。
 * 不修改資料，只影響示意圖 polyline。
 */

const EPS = 1e-9;

function roundCoord(v, decimals) {
  const n = Number(v);
  if (decimals <= 0) return Math.round(n);
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function roundPt(p, decimals) {
  return [roundCoord(p[0], decimals), roundCoord(p[1], decimals)];
}

/** 與 applyHVZToSpaceNetwork.buildSawtooth 之 ptsH 相同（先橫後豎） */
function buildSawtoothPtsHorizontalFirst(A, B, numL, decimals) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const n = Math.max(1, numL);
  const kxH = Math.ceil((n + 1) / 2);
  const kyH = Math.floor((n + 1) / 2);
  const xStepH = kxH > 0 ? dx / kxH : 0;
  const yStepH = kyH > 0 ? dy / kyH : 0;
  const ptsH = [roundPt(A, decimals)];
  let x = A[0];
  let y = A[1];
  for (let i = 1; i <= n; i++) {
    if (i % 2 === 1) {
      x += xStepH;
      ptsH.push(roundPt([x, y], decimals));
    } else {
      y += yStepH;
      ptsH.push(roundPt([x, y], decimals));
    }
  }
  ptsH.push(roundPt(B, decimals));
  return ptsH;
}

function segmentNeedsSawtooth(A, B) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  return Math.abs(dx) >= EPS && Math.abs(dy) >= EPS;
}

function numLForFineSteps(A, B, coordDecimals) {
  const adx = Math.abs(B[0] - A[0]);
  const ady = Math.abs(B[1] - A[1]);
  const stepMax = coordDecimals <= 0 ? 1 : 10 ** (-coordDecimals);
  return Math.min(5000, Math.max(2, Math.ceil(adx / stepMax) + Math.ceil(ady / stepMax) - 1));
}

/**
 * 單邊 A→B：若為對角線則回傳矩齒座標；否則 [A,B]（四捨五入）
 * @param {number} coordDecimals Test3 用 1（0.1 格）
 */
export function expandDiagonalEdgeToSawtoothDisplay(A, B, coordDecimals = 1) {
  if (!A || !B) return [A, B].filter(Boolean);
  if (!segmentNeedsSawtooth(A, B)) {
    return [roundPt(A, coordDecimals), roundPt(B, coordDecimals)];
  }
  const numL = numLForFineSteps(A, B, coordDecimals);
  return buildSawtoothPtsHorizontalFirst(A, B, numL, coordDecimals);
}

/**
 * 整條折線：逐邊將對角線段換成矩齒，接縫去重。
 */
export function expandPolylineDiagonalsToSawtoothDisplay(coords, coordDecimals = 1) {
  if (!Array.isArray(coords) || coords.length < 2) return coords;
  const out = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const A = coords[i];
    const B = coords[i + 1];
    if (!Array.isArray(A) || !Array.isArray(B) || A.length < 2 || B.length < 2) continue;
    const seg = expandDiagonalEdgeToSawtoothDisplay(
      [Number(A[0]), Number(A[1])],
      [Number(B[0]), Number(B[1])],
      coordDecimals
    );
    if (out.length === 0) {
      out.push(...seg);
    } else {
      const [fx, fy] = out[out.length - 1];
      const [sx, sy] = seg[0];
      if (Math.abs(fx - sx) < EPS && Math.abs(fy - sy) < EPS) {
        out.push(...seg.slice(1));
      } else {
        out.push(...seg);
      }
    }
  }
  return out.length >= 2 ? out : coords;
}
