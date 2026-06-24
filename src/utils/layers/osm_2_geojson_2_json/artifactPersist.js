import { LAYER_ID, getOsm2GeojsonSessionOsmXml } from './sessionOsmXml.js';

/**
 * `public/data/layers/` 底下的相對路徑片段（segments 已 encodeURIComponent），fetch 時接在 `{BASE_URL}data/` 之後。
 * @param {string} groupName
 * @param {string} [layerId]
 * @returns {string|null}
 */
export function encodeOsm2ArtifactsDirForDataUrl(groupName, layerId = LAYER_ID) {
  if (groupName == null || layerId == null) return null;
  const g = String(groupName);
  const lid = String(layerId);
  if (!g.trim() || !lid.trim()) return null;
  if (g.includes('/') || g.includes('\\') || lid.includes('/') || lid.includes('\\')) return null;
  if (g.includes('..') || lid.includes('..')) return null;
  return `layers/${encodeURIComponent(g)}/${encodeURIComponent(lid)}`;
}

/**
 * POST 至 devServer（vue.config.js）；production 無該端點則安靜略過。
 */
export function schedulePersistOsm2GeojsonArtifacts({ groupName, layer, sourceOsmXmlText } = {}) {
  if (!layer || layer.layerId !== LAYER_ID || !groupName) return;
  const osmRaw =
    typeof sourceOsmXmlText === 'string' && sourceOsmXmlText.length > 0
      ? sourceOsmXmlText
      : getOsm2GeojsonSessionOsmXml();
  const payload = {
    groupName: String(groupName),
    layerId: LAYER_ID,
    osmXml: osmRaw?.length ? osmRaw : null,
    geojson: layer.geojsonData ?? null,
    segments: layer.jsonData ?? null,
  };
  void fetch('/api/save-osm2-geojson-2-json-artifacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
