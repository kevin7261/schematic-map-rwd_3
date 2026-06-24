/**
 * taipei_k4：K3 分頁／JSON 分頁用「繪區像素」座標（原網格座標經與 SpaceNetworkGridTabK3 相同之
 * margin／線性或正方形 fit 映射）；原點在繪區左下（x 向右、y 向上）；JSON 展示時 x/y snap 到 snapGrid 倍數。
 * 勿用於 taipei_k3。
 */
import * as d3 from 'd3';

/** 須與 SpaceNetworkGridTabK3 主路網 draw 區塊之 margin 一致 */
export const TAIPEI_K4_SPACE_NETWORK_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

/** 與 dataStore.k3JsonOverlapDistancePx 初始值一致；未傳或無效 snap 時 k4 用 */
const TAIPEI_K4_DEFAULT_JSON_SNAP_GRID_PX = 10;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * 網格座標經 xScale/yScale 對應到繪區後，將繪區內 px 四捨五入到 snapGrid 倍數，再反算回網格座標。
 * 繪區 y 為「左下為原點、向上為正」（與 SVG 由上而下之距離互補：y_plot = plotInnerHeight − y_fromTop）。
 * 與 JSON 分頁 taipei_k4 之 snap 一致；主圖 resize 重繪時路線／站點用同一套規則。
 *
 * @param {number} gx
 * @param {number} gy
 * @param {function} xScale — 與 SpaceNetworkGridTabK3 主繪圖相同
 * @param {function} yScale
 * @param {{ left: number, top: number }} margin
 * @param {number} snapGrid — 整數 ≥ 1（px）；未傳或無效時預設 10
 * @param {number} plotInnerHeight — 繪區內高度（與主圖 height 一致）；若缺則 y 改以左上為原點（相容舊行為）
 * @returns {[number, number]}
 */
export function snapDataCoordToK4PlotPxMultiples(
  gx,
  gy,
  xScale,
  yScale,
  margin,
  snapGrid,
  plotInnerHeight
) {
  const sg =
    Number.isFinite(Number(snapGrid)) && Number(snapGrid) >= 1
      ? Math.round(Number(snapGrid))
      : TAIPEI_K4_DEFAULT_JSON_SNAP_GRID_PX;
  const ml = Number(margin?.left);
  const mt = Number(margin?.top);
  const h = Number(plotInnerHeight);
  if (!Number.isFinite(ml) || !Number.isFinite(mt)) return [num(gx), num(gy)];
  const rx = xScale(num(gx)) - ml;
  const ryFromTop = yScale(num(gy)) - mt;
  const ry = Number.isFinite(h) && h > 0 ? h - ryFromTop : ryFromTop;
  const sx = Math.round(rx / sg) * sg;
  const sy = Math.round(ry / sg) * sg;
  const ySvg = Number.isFinite(h) && h > 0 ? mt + h - sy : mt + sy;
  return [num(xScale.invert(ml + sx)), num(yScale.invert(ySvg))];
}

/**
 * @param {Array<Object>} flatSegments
 * @returns {{ xMin: number, xMax: number, yMin: number, yMax: number }}
 */
export function collectBoundsFromFlatSegments(flatSegments) {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const add = (x, y) => {
    const xf = num(x);
    const yf = num(y);
    if (!Number.isFinite(xf) || !Number.isFinite(yf)) return;
    xMin = Math.min(xMin, xf);
    xMax = Math.max(xMax, xf);
    yMin = Math.min(yMin, yf);
    yMax = Math.max(yMax, yf);
  };
  if (!Array.isArray(flatSegments)) {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }
  for (const seg of flatSegments) {
    const pts = seg?.points;
    if (!Array.isArray(pts)) continue;
    for (const p of pts) {
      const x = Array.isArray(p) ? p[0] : p?.x;
      const y = Array.isArray(p) ? p[1] : p?.y;
      add(x, y);
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }
  const pad = 1;
  return {
    xMin: xMin - pad,
    xMax: xMax + pad,
    yMin: yMin - pad,
    yMax: yMax + pad,
  };
}

function collectBoundsFromExportRows(rows) {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const add = (x, y) => {
    const xf = num(x);
    const yf = num(y);
    if (!Number.isFinite(xf) || !Number.isFinite(yf)) return;
    xMin = Math.min(xMin, xf);
    xMax = Math.max(xMax, xf);
    yMin = Math.min(yMin, yf);
    yMax = Math.max(yMax, yf);
  };
  const pair = (p) => {
    if (Array.isArray(p) && p.length >= 2) add(p[0], p[1]);
  };
  const walkRc = (rc) => {
    if (!Array.isArray(rc) || rc.length < 3) return;
    pair(rc[0]);
    const mids = rc[1];
    if (Array.isArray(mids)) mids.forEach(pair);
    pair(rc[2]);
  };
  if (!Array.isArray(rows)) {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }
  for (const row of rows) {
    walkRc(row?.routeCoordinates);
    const seg = row?.segment;
    if (seg?.start) add(seg.start.x_grid, seg.start.y_grid);
    if (seg?.end) add(seg.end.x_grid, seg.end.y_grid);
    const mids = seg?.stations;
    if (Array.isArray(mids)) {
      for (const s of mids) {
        if (s) add(s.x_grid, s.y_grid);
      }
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }
  const pad = 1;
  return {
    xMin: xMin - pad,
    xMax: xMax + pad,
    yMin: yMin - pad,
    yMax: yMax + pad,
  };
}

/**
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} bounds
 * @param {number} innerW  — 等同 getDimensions().width（整個內容區寬）
 * @param {number} innerH
 * @param {boolean} squareGridCells
 * @param {number} [snapGrid=10] — 座標 snap 單位（px 整數倍數；10＝四捨五入到 10 的倍數；未傳時預設 10）
 */
export function createTaipeiK4PlotPxMappers(bounds, innerW, innerH, squareGridCells, snapGrid) {
  const sg =
    Number.isFinite(Number(snapGrid)) && Number(snapGrid) >= 1
      ? Math.round(Number(snapGrid))
      : TAIPEI_K4_DEFAULT_JSON_SNAP_GRID_PX;
  const margin = TAIPEI_K4_SPACE_NETWORK_MARGIN;
  const width = Math.max(1, innerW - margin.left - margin.right);
  const height = Math.max(1, innerH - margin.top - margin.bottom);
  const { xMin, xMax, yMin, yMax } = bounds;

  let toPlotPxX;
  let toPlotPxY;
  if (squareGridCells) {
    const spanX = xMax - xMin;
    const spanY = yMax - yMin;
    const sx = spanX > 0 ? spanX : 1;
    const sy = spanY > 0 ? spanY : 1;
    const cellSize = Math.min(width / sx, height / sy);
    const gridW = sx * cellSize;
    const gridH = sy * cellSize;
    const gridLeft = margin.left + (width - gridW) / 2;
    const gridTop = margin.top + (height - gridH) / 2;
    toPlotPxX = (gx) => gridLeft + ((num(gx) - xMin) / sx) * gridW - margin.left;
    /** 繪區 y：左下為 0、向上為正 */
    toPlotPxY = (gy) =>
      height - (gridTop + ((num(gy) - yMin) / sy) * gridH - margin.top);
  } else {
    const xs = d3
      .scaleLinear()
      .domain([xMin, xMax])
      .range([margin.left, margin.left + width]);
    const ys = d3
      .scaleLinear()
      .domain([yMax, yMin])
      .range([margin.top, margin.top + height]);
    toPlotPxX = (gx) => xs(num(gx)) - margin.left;
    /** 繪區 y：左下為 0、向上為正（與 SVG y 由上而下互補） */
    toPlotPxY = (gy) => height - (ys(num(gy)) - margin.top);
  }

  const roundPx = (v) => {
    const r = Number(v);
    if (!Number.isFinite(r)) return v;
    return Math.round(r / sg) * sg;
  };

  /** 頂點 props／起迄 properties 內與格座標對齊之欄位一併改為繪區整數 px */
  const mapPropsGridFieldsToPlotPx = (props) => {
    if (!props || typeof props !== 'object') return;
    if (Number.isFinite(num(props.x_grid)) && Number.isFinite(num(props.y_grid))) {
      props.x_grid = roundPx(toPlotPxX(props.x_grid));
      props.y_grid = roundPx(toPlotPxY(props.y_grid));
    }
    if (Number.isFinite(num(props.display_x)) && Number.isFinite(num(props.display_y))) {
      props.display_x = roundPx(toPlotPxX(props.display_x));
      props.display_y = roundPx(toPlotPxY(props.display_y));
    }
    const tags = props.tags;
    if (tags && typeof tags === 'object') {
      if (Number.isFinite(num(tags.x_grid)) && Number.isFinite(num(tags.y_grid))) {
        tags.x_grid = roundPx(toPlotPxX(tags.x_grid));
        tags.y_grid = roundPx(toPlotPxY(tags.y_grid));
      }
    }
  };

  const mapPair = (p) => {
    if (!Array.isArray(p) || p.length < 2) return p;
    const nx = roundPx(toPlotPxX(p[0]));
    const ny = roundPx(toPlotPxY(p[1]));
    if (p.length > 2 && p[2] && typeof p[2] === 'object') {
      mapPropsGridFieldsToPlotPx(p[2]);
    }
    return p.length > 2 ? [nx, ny, p[2]] : [nx, ny];
  };

  return {
    mapPair,
    mapPropsGridFieldsToPlotPx,
    plotInnerWidth: width,
    plotInnerHeight: height,
    margin,
  };
}

export function mapCoordArrayWithPairMapper(arr, mapPair) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((p) => {
    if (Array.isArray(p) && p.length >= 2) return mapPair(p);
    if (p && typeof p === 'object' && Number.isFinite(num(p.x)) && Number.isFinite(num(p.y))) {
      const mapped = mapPair([p.x, p.y]);
      return { ...p, x: mapped[0], y: mapped[1] };
    }
    return p;
  });
}

/**
 * 將 K3Tab 之 segments 或 processed 匯出列轉成「繪區 px」展示用深拷貝（不修改 store）。
 *
 * @param {*} jsonData — spaceNetworkGridJsonDataK3Tab 或 processedJsonDataK3Tab
 * @param {Array<Object>|null|undefined} boundsSourceSegments — 用於 bbox；通常為 layer.spaceNetworkGridJsonDataK3Tab
 * @param {{ squareGridCellsTaipeiTest3?: boolean }} layer
 * @param {number} innerW
 * @param {number} innerH
 * @param {number} [snapGrid=10] — 座標 snap 單位（px 整數倍數；未傳時預設 10）
 */
export function taipeiK4MapK3TabJsonToPlotPxForDisplay(
  jsonData,
  boundsSourceSegments,
  layer,
  innerW,
  innerH,
  snapGrid
) {
  if (jsonData == null) return jsonData;
  const square = layer?.squareGridCellsTaipeiTest3 === true;
  let bounds = collectBoundsFromFlatSegments(boundsSourceSegments);
  if (!Array.isArray(boundsSourceSegments) || boundsSourceSegments.length === 0) {
    if (Array.isArray(jsonData) && jsonData.length && jsonData[0]?.routeCoordinates) {
      bounds = collectBoundsFromExportRows(jsonData);
    }
  }
  const { mapPair, mapPropsGridFieldsToPlotPx } = createTaipeiK4PlotPxMappers(
    bounds,
    innerW,
    innerH,
    square,
    snapGrid
  );

  const clone = JSON.parse(JSON.stringify(jsonData));

  const mapSegmentLike = (seg) => {
    if (!seg || typeof seg !== 'object') return;
    if (Array.isArray(seg.points)) seg.points = mapCoordArrayWithPairMapper(seg.points, mapPair);
    if (Array.isArray(seg.original_points)) {
      seg.original_points = mapCoordArrayWithPairMapper(seg.original_points, mapPair);
    }
    if (Array.isArray(seg.start_coord) && seg.start_coord.length >= 2) {
      seg.start_coord = mapPair(seg.start_coord);
    }
    if (Array.isArray(seg.end_coord) && seg.end_coord.length >= 2) {
      seg.end_coord = mapPair(seg.end_coord);
    }
    if (seg.properties_start) mapPropsGridFieldsToPlotPx(seg.properties_start);
    if (seg.properties_end) mapPropsGridFieldsToPlotPx(seg.properties_end);
    if (Array.isArray(seg.nodes)) {
      for (const node of seg.nodes) {
        if (node && typeof node === 'object') mapPropsGridFieldsToPlotPx(node);
      }
    }
  };

  if (Array.isArray(clone)) {
    if (clone.length > 0 && clone[0]?.routeCoordinates) {
      for (const row of clone) {
        const rc = row?.routeCoordinates;
        if (!Array.isArray(rc) || rc.length < 3) continue;
        row.routeCoordinates = [
          mapPair(rc[0]),
          Array.isArray(rc[1]) ? rc[1].map((q) => mapPair(q)) : rc[1],
          mapPair(rc[2]),
        ];
        const seg = row.segment;
        if (seg?.start) mapPropsGridFieldsToPlotPx(seg.start);
        if (seg?.end) mapPropsGridFieldsToPlotPx(seg.end);
        const stations = seg?.stations;
        if (Array.isArray(stations)) {
          for (const st of stations) {
            if (!st) continue;
            mapPropsGridFieldsToPlotPx(st);
          }
        }
      }
      return clone;
    }
    for (const seg of clone) {
      mapSegmentLike(seg);
    }
    return clone;
  }

  if (clone && typeof clone === 'object' && Array.isArray(clone.mapDrawnRoutes)) {
    for (const seg of clone.mapDrawnRoutes) {
      mapSegmentLike(seg);
    }
  }

  return clone;
}
