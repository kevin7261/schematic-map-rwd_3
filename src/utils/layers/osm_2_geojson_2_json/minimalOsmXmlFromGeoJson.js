/**
 * 由 LineString FeatureCollection 產生極簡 OSM 0.6 XML（負 id，供 Upper 檢視／與手繪後路網同步）。
 * @param {{ type?: string, features?: object[] }} fc
 * @returns {string}
 */
export function minimalOsmXmlFromLonLatFeatureCollection(fc) {
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const header =
    '<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="schematic-map-rwd_3">\n';
  const footer = '</osm>\n';

  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    return `${header}${footer}`;
  }

  let nodeId = -1;
  let wayId = -1000;
  const nodeLines = [];
  const wayBlocks = [];

  for (const f of fc.features) {
    if (!f || f.type !== 'Feature' || !f.geometry || f.geometry.type !== 'LineString') continue;
    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const refs = [];
    for (const c of coords) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      nodeId -= 1;
      nodeLines.push(`  <node id="${nodeId}" lat="${esc(lat)}" lon="${esc(lon)}"/>`);
      refs.push(nodeId);
    }
    if (refs.length < 2) continue;
    wayId -= 1;
    const props = f.properties && typeof f.properties === 'object' ? f.properties : {};
    const name = props.name != null ? String(props.name) : '';
    const color = props.color != null ? String(props.color) : '';
    const rid = props.route_id != null ? String(props.route_id) : '';
    const nd = refs.map((id) => `    <nd ref="${id}"/>`).join('\n');
    const tagLines = [];
    if (name) tagLines.push(`    <tag k="name" v="${esc(name)}"/>`);
    if (color) tagLines.push(`    <tag k="color" v="${esc(color)}"/>`);
    if (rid) tagLines.push(`    <tag k="route_id" v="${esc(rid)}"/>`);
    const inner = [nd, ...tagLines].filter(Boolean).join('\n');
    wayBlocks.push(`  <way id="${wayId}">\n${inner}\n  </way>`);
  }

  const body = [...nodeLines, ...wayBlocks].join('\n');
  return `${header}${body}${body ? '\n' : ''}${footer}`;
}
