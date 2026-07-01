/**
 * 站點與路線調整前置 flat segments → connect 骨架 + 黑點 sections（供八演算法重佈局）。
 * 邏輯同 ControlTab milpReadFlatToSkeleton，獨立實作供本管線使用。
 */

/**
 * @param {Array<object>} flat normalizeSpaceNetworkDataToFlatSegments 結果
 * @returns {{ skeleton: Array<object>, sections: Array<{ blackNodes: Array }> }}
 */
export function flatSegmentsToConnectSkeleton(flat) {
  const skeleton = [];
  const sections = [];
  if (!Array.isArray(flat)) return { skeleton, sections };

  for (const seg of flat) {
    const pts = Array.isArray(seg?.points) ? seg.points : [];
    const nodes = Array.isArray(seg?.nodes) ? seg.nodes : [];
    const black = [];
    for (let i = 1; i < pts.length - 1; i++) black.push(nodes[i]);

    const last = pts.length - 1;
    if (last < 1) continue;

    skeleton.push({
      route_name: seg.route_name,
      name: seg.name,
      points: [
        Array.isArray(pts[0]) ? pts[0].slice() : { ...pts[0] },
        Array.isArray(pts[last]) ? pts[last].slice() : { ...pts[last] },
      ],
      nodes: [nodes[0], nodes[last]],
      properties_start: seg.properties_start,
      properties_end: seg.properties_end,
      way_properties: seg.way_properties,
      color: seg.color,
      route_colors: seg.route_colors,
    });
    sections.push({ blackNodes: black });
  }

  return { skeleton, sections };
}
