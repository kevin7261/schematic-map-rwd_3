/**
 * SectionData：任兩交叉點（connect）之間為一筆「紅點間路段」。
 * 不列出：起迄兩紅點皆與多條路段相連者（兩端皆為轉乘／分歧節點）。
 */

function connectEndpointDedupeKey(c) {
  if (!c || typeof c !== 'object') return 'invalid';
  const cn = c.connect_number ?? c.tags?.connect_number;
  if (cn != null && String(cn).trim() !== '') return `cn:${String(cn).trim()}`;
  const x = c.x_grid ?? c.tags?.x_grid;
  const y = c.y_grid ?? c.tags?.y_grid;
  if (x != null && y != null) return `xy:${Math.round(Number(x))},${Math.round(Number(y))}`;
  const sid = c.station_id ?? c.tags?.station_id;
  if (sid != null && String(sid).trim() !== '') return `id:${String(sid).trim()}`;
  return 'invalid';
}

/** 每個紅點鍵出現在幾筆 SectionData（同一筆起迄同鍵只算一次） */
function buildConnectIncidentSectionCount(sectionData) {
  const map = new Map();
  for (const sd of sectionData || []) {
    if (!sd) continue;
    const keys = new Set();
    for (const k of ['connect_start', 'connect_end']) {
      const c = sd[k];
      if (!c) continue;
      keys.add(connectEndpointDedupeKey(c));
    }
    for (const key of keys) {
      if (key === 'invalid') continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return map;
}

function formatConnectShort(c) {
  if (!c || typeof c !== 'object') return '—';
  const cn = c.connect_number ?? c.tags?.connect_number;
  const name = String(c.station_name ?? c.tags?.station_name ?? '').trim();
  const x = c.x_grid ?? c.tags?.x_grid;
  const y = c.y_grid ?? c.tags?.y_grid;
  const parts = [];
  if (cn != null && String(cn).trim() !== '') parts.push(`#${cn}`);
  if (name) parts.push(name);
  if (x != null && y != null) parts.push(`(${Math.round(Number(x))},${Math.round(Number(y))})`);
  return parts.join(' ') || '—';
}

/**
 * @returns {Array<{ index: number, routeName: string, startText: string, endText: string }>}
 */
export function listSectionRoutesBetweenConnects(sectionData) {
  const counts = buildConnectIncidentSectionCount(sectionData);
  const rows = [];
  let listed = 0;
  for (const sd of sectionData || []) {
    if (!sd) continue;
    const s = sd.connect_start;
    const e = sd.connect_end;
    const sk = s ? connectEndpointDedupeKey(s) : 'invalid';
    const ek = e ? connectEndpointDedupeKey(e) : 'invalid';
    const sc = sk !== 'invalid' ? counts.get(sk) || 0 : 0;
    const ec = ek !== 'invalid' ? counts.get(ek) || 0 : 0;
    if (sc >= 2 && ec >= 2) continue;
    rows.push({
      index: listed,
      routeName: String(sd.route_name ?? sd.route_hint ?? '').trim(),
      startText: formatConnectShort(s),
      endText: formatConnectShort(e),
    });
    listed += 1;
  }
  return rows;
}

export { connectEndpointDedupeKey, buildConnectIncidentSectionCount };
