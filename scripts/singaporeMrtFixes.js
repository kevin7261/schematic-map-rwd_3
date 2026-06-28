/**
 * 新加坡 MRT 修正：TEL／DTL 東延；CCL 成環（Stage 6）。
 *
 * CCL 拓撲（Land Transport Guru）：
 * - 主環：Marina Bay → Bayfront → Promenade → Nicoll Highway → … → HarbourFront → CCL6 → Marina Bay
 * - CCLe 支線（在 Promenade 分岔，勿插入 Promenade→Nicoll 之間）：Promenade → Esplanade → Bras Basah → Dhoby Ghaut
 * OSM 兩段「Marina Bay→HarbourFront」高度重疊，不可 mergeLineFamilies 硬縫。
 */

const EXPO = [103.962064, 1.335385];
const BAYSHORE = [103.941856, 1.312994];
const BEDOK_SOUTH = [103.94833, 1.31667];
const SUNGEI_BEDOK = [103.95694, 1.32028];
const XILIN = [103.965, 1.32889];

const MARINA_BAY = [103.855077, 1.275199];
const HARBOURFRONT = [103.821754, 1.26526];
const PROMENADE = [103.861051, 1.292656];
const ESPLANADE = [103.855494, 1.29336];
const BRAS_BASAH = [103.85056, 1.29694];
const DHOBY_GHAUT = [103.845877, 1.299227];
/** CCL Stage 6（2026-07）：HarbourFront → Marina Bay */
const CCL6 = [
  [103.83111, 1.27],
  [103.83667, 1.27278],
  [103.84722, 1.27333],
];

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

function fixCircleLine(fc) {
  const ways = (fc.features || []).filter(
    (f) =>
      f.properties?.element_type === 'way' &&
      /Circle Line/i.test(f.properties.route_name || '') &&
      !/Extension \(CE\)/i.test(f.properties.route_name || '')
  );
  if (!ways.length) return;

  const marinaFirst = ways.find((w) => kk(w.geometry.coordinates[0]) === kk(MARINA_BAY));
  const base = marinaFirst || ways.slice().sort((a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length)[0];
  const props = { ...base.properties, route_name: 'MRT Circle Line', element_type: 'way' };
  const status = ways.some((w) => w.properties.status === 'construction') ? 'construction' : 'open';

  fc.features = fc.features.filter((f) => !ways.includes(f));

  let mainCs = base.geometry.coordinates.slice();
  if (kk(mainCs[mainCs.length - 1]) === kk(HARBOURFRONT) && kk(mainCs[0]) === kk(MARINA_BAY)) {
    mainCs = appendPath(mainCs, CCL6);
    if (kk(mainCs[0]) !== kk(mainCs[mainCs.length - 1])) mainCs.push(MARINA_BAY.slice());
  } else if (kk(mainCs[0]) === kk(HARBOURFRONT)) {
    mainCs = appendPath(mainCs, CCL6);
    if (kk(mainCs[0]) !== kk(mainCs[mainCs.length - 1])) mainCs.push(MARINA_BAY.slice());
  }
  mainCs = dedupeConsecutive(mainCs);

  // CC4→CC3→CC2→CC1 西向支線（獨立 way；不可接 Nicoll Highway）
  const branchCs = dedupeConsecutive([
    PROMENADE.slice(),
    ESPLANADE.slice(),
    BRAS_BASAH.slice(),
    DHOBY_GHAUT.slice(),
  ]);

  fc.features.push({
    type: 'Feature',
    properties: { ...props, status },
    geometry: { type: 'LineString', coordinates: mainCs },
  });
  fc.features.push({
    type: 'Feature',
    properties: { ...props, status },
    geometry: { type: 'LineString', coordinates: branchCs },
  });

  upsertManualNode(fc, 'Bras Basah', BRAS_BASAH, 'CC2');
  upsertManualNode(fc, 'Keppel', CCL6[0], 'CC30');
  upsertManualNode(fc, 'Cantonment', CCL6[1], 'CC31');
  upsertManualNode(fc, 'Prince Edward Road', CCL6[2], 'CC32');
}

/** @param {import('geojson').FeatureCollection} fc */
export function applySingaporeMrtExtensions(fc) {
  if (!fc?.features) return fc;

  fixCircleLine(fc);

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
