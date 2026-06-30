/** 管線地圖 hover（Control 頂部）共用 HTML：路線色塊、站點各路線色 */

export const escHtml = (s) =>
  String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** @param {string} [color] */
export const colorSwatchHtml = (color) => {
  const c = String(color ?? '').trim();
  if (!c) return '';
  return `<span style="display:inline-block;width:10px;height:10px;border:1px solid #ccc;background:${escHtml(c)};vertical-align:middle;margin-right:4px"></span>`;
};

/** @param {string} k @param {*} v */
export const tooltipRowHtml = (k, v) =>
  v == null || v === '' ? '' : `<div><span style="color:#888">${escHtml(k)}</span> ${escHtml(v)}</div>`;

/** @param {string} [color] */
export const tooltipColorRowHtml = (color) => {
  const c = String(color ?? '').trim();
  if (!c) return '';
  return `<div><span style="color:#888">color</span> ${colorSwatchHtml(c)}${escHtml(c)}</div>`;
};

/** @param {{ routeName?: string, routeId?: string, routeCompany?: string, railway?: string, osmId?: string, color?: string }} ln */
export const pipelineLineTooltipHtml = (ln) => {
  const line = ln && typeof ln === 'object' ? ln : {};
  return (
    `<div style="font-size:12px;line-height:1.5">` +
    tooltipRowHtml('route_name', line.routeName) +
    tooltipRowHtml('route_id', line.routeId) +
    tooltipRowHtml('route_company', line.routeCompany) +
    tooltipRowHtml('railway', line.railway) +
    tooltipRowHtml('osm_id', line.osmId) +
    tooltipColorRowHtml(line.color) +
    `</div>`
  );
};

/**
 * 座標 → 經過該點的路線（含顏色），dedupe by routeName+color。
 * @param {Array} lines
 * @param {(lat: number, lng: number) => string} llKeyFn
 * @returns {Map<string, Array<{ routeName: string, color: string }>>}
 */
export function buildPipelineRoutesAtCoord(lines, llKeyFn) {
  const m = new Map();
  for (const ln of lines || []) {
    if (!ln || !Array.isArray(ln.latlngs)) continue;
    const routeName = String(ln.routeName || ln.routeId || '').trim() || '(未命名)';
    const color = String(ln.color ?? '').trim();
    for (const c of ln.latlngs) {
      const k = llKeyFn(c[0], c[1]);
      let arr = m.get(k);
      if (!arr) {
        arr = [];
        m.set(k, arr);
      }
      if (!arr.some((x) => x.routeName === routeName && x.color === color)) {
        arr.push({ routeName, color });
      }
    }
  }
  return m;
}

/** 示意圖骨架節點：route_name_list + route_colors 對應 */
export function parseSchematicNodeRoutes(tags = {}, bag = {}) {
  let names = [];
  const rawList = tags.route_name_list ?? bag.route_name_list;
  if (Array.isArray(rawList)) names = rawList.filter(Boolean);
  else if (typeof rawList === 'string' && rawList.trim()) {
    names = rawList
      .split(/[,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (names.length === 0) return [];
  const colorStr = tags.route_colors ?? tags.route_color ?? bag.route_colors ?? bag.route_color ?? '';
  const colors = String(colorStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return names.map((routeName, i) => ({
    routeName,
    color: colors[i] || colors[0] || '',
  }));
}

/** 示意圖骨架線：單色或 route_colors 多色 */
export const schematicWayColorHtml = (tags = {}) => {
  const multi = String(tags.route_colors || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const single = String(tags.route_color || tags.color || '').trim();
  if (multi.length >= 2) {
    return (
      `<div><span style="color:#888">route_colors</span> ${multi.map((c) => colorSwatchHtml(c)).join(' ')}${escHtml(multi.join(', '))}</div>`
    );
  }
  return tooltipColorRowHtml(single || multi[0]);
};

/** @param {string} [color] @param {string} [reason] */
export const tooltipStationDotHtml = (color, reason) => {
  const c = String(color ?? '').trim();
  const r = String(reason ?? '').trim();
  if (!c && !r) return '';
  let html = '';
  if (c) {
    html += `<div><span style="color:#888">站點顏色</span> ${colorSwatchHtml(c)}${escHtml(c)}</div>`;
  }
  if (r) {
    html += `<div><span style="color:#888">變色原因</span> ${escHtml(r)}</div>`;
  }
  return html;
};

/** Leaflet 路線圖／選擇路線圖：端點藍／交點紅／黑點／交叉黃 */
export function leafletRouteMapStationDisplay(type, fillColor) {
  /** @type {Record<string, { color: string, typeLabel: string, reason: string }>} */
  const map = {
    terminal: {
      color: '#1565c0',
      typeLabel: '端點 terminal',
      reason: '路線幾何端點（僅接一條路線的頭或尾）',
    },
    connect: {
      color: '#ff0000',
      typeLabel: '交點 intersection',
      reason: '兩條以上路線共用此座標（轉乘／交會站）',
    },
    black: {
      color: '#000000',
      typeLabel: '一般 normal',
      reason: '路線中間站（非端點、非交點）',
    },
    cross: {
      color: '#ffd600',
      typeLabel: '交叉 cross',
      reason: '路線幾何交叉點（未列為正式車站）',
    },
  };
  const base = map[type] || { color: '', typeLabel: type || '', reason: '' };
  const color = String(fillColor ?? base.color).trim() || base.color;
  return { ...base, color };
}

/** 骨架模式：粉紅／灰／黑黑點站 */
export function skeletonBlackDotStationDisplay({ isPink = false, isGray = false } = {}) {
  if (isPink) {
    return {
      color: '#e377c2',
      typeLabel: '粉紅轉折 right_angle_pink',
      reason: '骨架邊曲折度過高，Douglas–Peucker 挑出的代表性轉折點',
    };
  }
  if (isGray) {
    return {
      color: '#7f7f7f',
      typeLabel: '灰點 gray',
      reason: '相鄰邊界節點間黑點過多，以灰點標示段中間隔點',
    };
  }
  return leafletRouteMapStationDisplay('black');
}

/**
 * 骨架模式節點（route_map_adjust 系列）
 * @param {*} n
 * @param {Set<string>} terminalKeys
 * @param {Set<string>} connectKeys
 * @param {(lat: number, lng: number) => string} llKeyFn
 */
export function skeletonAdjustNodeDisplay(n, terminalKeys, connectKeys, llKeyFn) {
  const nk = llKeyFn(n.latlng[0], n.latlng[1]);
  if (n.isCross) {
    return {
      color: '#ffd600',
      typeLabel: '交叉生成節點',
      reason: '骨架化時新路線交叉所產生之節點',
    };
  }
  if (n.isPurple) {
    return {
      color: '#9c27b0',
      typeLabel: '切斷轉折點',
      reason: '路線切斷或折點處之骨架節點',
    };
  }
  if (connectKeys.has(nk) || n.isRouteJunction) {
    return {
      color: '#ff0000',
      typeLabel: '交點 intersection',
      reason: '≥3 臂分歧或路線交會（connect）',
    };
  }
  if (terminalKeys.has(nk)) {
    return {
      color: '#1565c0',
      typeLabel: '端點 terminal',
      reason: '骨架路線端點',
    };
  }
  return {
    color: '#000000',
    typeLabel: '端點/節點',
    reason: '骨架一般節點',
  };
}

/** 示意圖骨架 GeoJSON 節點 */
export function schematicSkeletonNodeDisplay(tags = {}, bag = {}) {
  const color = String(tags.node_class_color ?? bag.node_class_color ?? '#555555').trim();
  const kind = String(tags.node_kind ?? bag.node_kind ?? '').trim();
  const cc = color.toLowerCase();
  const nodeType = tags.node_type ?? bag.node_type;

  if (kind === 'black' || cc === '#000000') {
    return { color: '#000000', typeLabel: '一般 normal', reason: '黑點站（路線中間站）' };
  }
  if (kind === 'cross' || cc === '#ffd600') {
    return { color: '#ffd600', typeLabel: '交叉 cross', reason: '≥3 路線交會之交叉點' };
  }
  if (kind === 'purple' || cc === '#9c27b0') {
    return { color: '#9c27b0', typeLabel: '切斷 purple', reason: '路線切斷／折點' };
  }
  if (kind === 'right_angle_pink' || cc === '#e377c2') {
    return {
      color: '#e377c2',
      typeLabel: '粉紅轉折 right_angle_pink',
      reason: '曲折路段之代表性轉折點',
    };
  }
  if (kind === 'gray' || cc === '#7f7f7f') {
    return { color: '#7f7f7f', typeLabel: '灰點 gray', reason: '過長黑點段中間之間隔點' };
  }
  if (kind === 'brown' || cc === '#9a6324') {
    return { color: '#9a6324', typeLabel: '棕點 brown', reason: '降級之原粉紅轉折點' };
  }
  if (nodeType === 'connect' || kind === 'connect' || cc === '#ff0000') {
    return { color: '#ff0000', typeLabel: '交點 intersection', reason: '轉乘／路線交會站' };
  }
  if (nodeType === 'terminal' || kind === 'terminal' || cc === '#1565c0') {
    return { color: '#1565c0', typeLabel: '端點 terminal', reason: '路線端點' };
  }
  return {
    color: color || '#555555',
    typeLabel: tags.type ?? bag.type ?? kind ?? '',
    reason: '依 node_class_color／node_kind 分類著色',
  };
}

/** @param {Array<{ routeName?: string, color?: string }>} routes */
export const pipelineRouteListHtml = (routes) => {
  if (!Array.isArray(routes) || routes.length === 0) return '';
  const items = routes
    .map((r) => {
      const name = escHtml(r?.routeName || '(未命名)');
      const sw = colorSwatchHtml(r?.color);
      return `<div style="margin-top:2px">${sw}${name}</div>`;
    })
    .join('');
  return `<div><span style="color:#888">route_name_list</span>${items}</div>`;
};

/**
 * @param {object} opts
 * @param {object} [opts.meta]
 * @param {string} [opts.typeLabel]
 * @param {string} [opts.stationDotColor]
 * @param {string} [opts.stationColorReason]
 * @param {Array<{ routeName?: string, color?: string }>} [opts.routes]
 * @param {string} [opts.extraHtml] 額外 HTML（交角、dp_ratio 等）
 */
export const pipelineStationTooltipHtml = ({
  meta = {},
  typeLabel = '',
  stationDotColor = '',
  stationColorReason = '',
  routes = [],
  extraHtml = '',
}) =>
  `<div style="font-size:12px;line-height:1.5">` +
  tooltipRowHtml('station_name', meta.name) +
  tooltipRowHtml('station_id', meta.id) +
  tooltipRowHtml('osm_id', meta.osmId) +
  tooltipRowHtml('type', typeLabel) +
  tooltipStationDotHtml(stationDotColor, stationColorReason) +
  extraHtml +
  pipelineRouteListHtml(routes) +
  `</div>`;
