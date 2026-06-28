/**
 * 新加坡 DTL／TEL 修正：TEL 東延至 Sungei Bedok；DTL 東延 DT37。
 * 注意：Expo→Tampines 段為 DTL3 正線（Upper Changi／Tampines East／Tampines West），不可刪。
 */

const EXPO = [103.962064, 1.335385];
const BAYSHORE = [103.941856, 1.312994];
// TE30：Upper East Coast Rd × Bedok South Rd 一帶（勿與 Bedok South 路名路口混淆）
const BEDOK_SOUTH = [103.94833, 1.31667];
const SUNGEI_BEDOK = [103.95694, 1.32028];
const XILIN = [103.965, 1.32889];

const kk = (c) => `${(+c[0]).toFixed(5)},${(+c[1]).toFixed(5)}`;

function dedupeConsecutive(cs) {
  const out = [];
  for (const c of cs) {
    const last = out[out.length - 1];
    if (!last || kk(last) !== kk(c)) out.push(c.slice());
  }
  return out;
}

function hasCoord(cs, pt) {
  const k = kk(pt);
  return cs.some((c) => kk(c) === k);
}

function appendPath(cs, extra) {
  let out = cs.slice();
  for (const p of extra) {
    if (!hasCoord(out, p)) out.push(p.slice());
  }
  return dedupeConsecutive(out);
}

function prependPath(cs, extra) {
  let out = cs.slice();
  for (let i = extra.length - 1; i >= 0; i--) {
    if (!hasCoord(out, extra[i])) out.unshift(extra[i].slice());
  }
  return dedupeConsecutive(out);
}

function upsertManualNode(fc, name, coord, id) {
  const hit = fc.features.find((f) => f.properties?.station_name === name);
  if (hit) {
    hit.geometry.coordinates = coord.slice();
    if (id) hit.properties.station_id = id;
    return;
  }
  fc.features.push({
    type: 'Feature',
    properties: {
      osm_id: '',
      station_name: name,
      element_type: 'node',
      station_id: id || `sg-${name.replace(/\s+/g, '-')}`,
    },
    geometry: { type: 'Point', coordinates: coord.slice() },
  });
}

/** @param {import('geojson').FeatureCollection} fc */
export function applySingaporeMrtExtensions(fc) {
  if (!fc?.features) return fc;

  for (const f of fc.features) {
    if (f.properties?.element_type !== 'way') continue;
    const rn = f.properties.route_name || '';
    let cs = f.geometry.coordinates;
    if (!cs?.length) continue;

    if (/Thomson/i.test(rn)) {
      if (kk(cs[cs.length - 1]) === kk(BAYSHORE) && !hasCoord(cs, SUNGEI_BEDOK)) {
        cs = appendPath(cs, [BEDOK_SOUTH, SUNGEI_BEDOK]);
      } else if (kk(cs[0]) === kk(BAYSHORE) && !hasCoord(cs, SUNGEI_BEDOK)) {
        cs = prependPath(cs, [SUNGEI_BEDOK, BEDOK_SOUTH]);
      }
      f.properties.route_name = 'MRT Thomson–East Coast Line (Woodlands North → Sungei Bedok)';
    }

    if (/Downtown/i.test(rn)) {
      if (kk(cs[cs.length - 1]) === kk(EXPO) && !hasCoord(cs, SUNGEI_BEDOK)) {
        cs = appendPath(cs, [XILIN, SUNGEI_BEDOK]);
      } else if (kk(cs[0]) === kk(EXPO) && !hasCoord(cs, SUNGEI_BEDOK)) {
        cs = prependPath(cs, [SUNGEI_BEDOK, XILIN]);
      }
      f.properties.route_name = 'MRT Downtown Line (Bukit Panjang → Sungei Bedok)';
    }

    f.geometry.coordinates = cs;
  }

  upsertManualNode(fc, 'Bedok South', BEDOK_SOUTH, 'TE30');
  upsertManualNode(fc, 'Xilin', XILIN, 'DT36');
  upsertManualNode(fc, 'Sungei Bedok', SUNGEI_BEDOK, 'TE31-DT37');

  return fc;
}
