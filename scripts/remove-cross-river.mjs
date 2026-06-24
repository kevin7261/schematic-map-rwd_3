/**
 * Remove all cross_river pseudo-stations from public data:
 * - station_id / station_name / name === "cross_river" or starts with "cross_river_"
 * - Syncs aligned points / original_points, rebuilds consecutive station_weights, trims edge_weights.
 * - GeoJSON: drops Point features with cross_river properties.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.join(__dirname, '..', 'public', 'data');

function isCrossRiverId(s) {
  if (s == null) return false;
  const t = String(s).trim();
  return t === 'cross_river' || t.startsWith('cross_river_');
}

function isCrossRiverNode(node) {
  if (!node || typeof node !== 'object') return false;
  const sid = node.station_id ?? node.tags?.station_id;
  const sname = node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? node.name;
  return isCrossRiverId(sid) || isCrossRiverId(sname);
}

function isCrossRiverStationListEntry(row) {
  if (!row || typeof row !== 'object') return false;
  return isCrossRiverId(row.station_id) || isCrossRiverId(row.station_name);
}

function connectNodeKey(p) {
  if (!p || typeof p !== 'object') return '';
  if (p.id != null) return `id:${p.id}`;
  const x = p.x_grid ?? p.tags?.x_grid;
  const y = p.y_grid ?? p.tags?.y_grid;
  return `xy:${x},${y}`;
}

function routeLabelSeg(seg) {
  return String(seg?.name ?? seg?.route_name ?? seg?.way_properties?.tags?.route_name ?? '').trim();
}

function mergeTwoSegEndpoints(a, b) {
  const ptsA = a.points || [];
  const ptsB = b.points || [];
  const merged = [...ptsA];
  if (ptsB.length) {
    const la = ptsA[ptsA.length - 1];
    const fb = ptsB[0];
    const same =
      la &&
      fb &&
      Number(la[0]) === Number(fb[0]) &&
      Number(la[1]) === Number(fb[1]);
    if (same) merged.push(...ptsB.slice(1));
    else merged.push(...ptsB);
  }
  return {
    ...a,
    points: merged,
    properties_start: a.properties_start,
    properties_end: b.properties_end,
    processed: a.processed,
    way_properties: a.way_properties ?? b.way_properties,
  };
}

function canMergeCrossRiverBridge(a, b) {
  if (!a || !b) return false;
  if (routeLabelSeg(a) !== routeLabelSeg(b)) return false;
  if (!isCrossRiverNode(a.properties_end) || !isCrossRiverNode(b.properties_start)) return false;
  return connectNodeKey(a.properties_end) === connectNodeKey(b.properties_start);
}

/** 合併「A→cross_river」+「cross_river→B」為單一路段；刪除僅 cross—cross 的短段。 */
function mergeCrossRiverBridgesInSegmentList(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  let merges = 0;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const cur = list[i];
    if (isCrossRiverNode(cur.properties_start) && isCrossRiverNode(cur.properties_end)) {
      merges++;
      continue;
    }
    if (out.length > 0 && canMergeCrossRiverBridge(out[out.length - 1], cur)) {
      out[out.length - 1] = mergeTwoSegEndpoints(out[out.length - 1], cur);
      merges++;
      continue;
    }
    if (i + 1 < list.length && canMergeCrossRiverBridge(cur, list[i + 1])) {
      out.push(mergeTwoSegEndpoints(cur, list[i + 1]));
      i++;
      merges++;
      continue;
    }
    out.push(cur);
  }
  if (merges > 0) {
    list.length = 0;
    list.push(...out);
  }
  return merges;
}

function isFlatSegmentList(arr) {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr[0] &&
    typeof arr[0] === 'object' &&
    arr[0].properties_start &&
    Array.isArray(arr[0].points)
  );
}

/** Sum edge weights along old index path from survivor a to next survivor b (exclusive end chain). */
function rebuildStationWeights(oldLen, removedSet, oldWeights) {
  if (!Array.isArray(oldWeights) || oldWeights.length === 0) return null;
  const edgeW = new Array(Math.max(0, oldLen - 1)).fill(null);
  for (const w of oldWeights) {
    const a = Number(w?.start_idx);
    const b = Number(w?.end_idx);
    const wt = w?.weight;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a !== b - 1) continue;
    if (a >= 0 && a < edgeW.length) edgeW[a] = wt;
  }
  function oldToNew(oldIdx) {
    let s = 0;
    for (const r of removedSet) {
      if (r < oldIdx) s++;
    }
    return oldIdx - s;
  }
  const survivors = [];
  for (let i = 0; i < oldLen; i++) {
    if (!removedSet.has(i)) survivors.push(i);
  }
  const out = [];
  for (let k = 0; k < survivors.length - 1; k++) {
    const a = survivors[k];
    const b = survivors[k + 1];
    let sum = 0;
    let any = false;
    for (let e = a; e < b; e++) {
      const wt = edgeW[e];
      if (wt != null && typeof wt === 'number' && Number.isFinite(wt)) {
        sum += wt;
        any = true;
      }
    }
    if (any) {
      out.push({
        start_idx: oldToNew(a),
        end_idx: oldToNew(b),
        weight: sum,
      });
    }
  }
  return out;
}

function stripSegmentLikeObject(seg) {
  if (!seg || typeof seg !== 'object' || !Array.isArray(seg.nodes)) return 0;
  const nodes = seg.nodes;
  const removed = new Set();
  for (let i = 0; i < nodes.length; i++) {
    if (isCrossRiverNode(nodes[i])) removed.add(i);
  }
  if (removed.size === 0) return 0;

  const oldLen = nodes.length;
  const keep = (i) => !removed.has(i);
  seg.nodes = nodes.filter((_, i) => keep(i));

  if (Array.isArray(seg.points) && seg.points.length === oldLen) {
    seg.points = seg.points.filter((_, i) => keep(i));
  }
  if (Array.isArray(seg.original_points) && seg.original_points.length === oldLen) {
    seg.original_points = seg.original_points.filter((_, i) => keep(i));
  }
  if (Array.isArray(seg.original_nodes) && seg.original_nodes.length === oldLen) {
    seg.original_nodes = seg.original_nodes.filter((_, i) => keep(i));
  }

  if (typeof seg.length === 'number') seg.length = Array.isArray(seg.points) ? seg.points.length : seg.nodes.length;
  if (Array.isArray(seg.segment_counts) && seg.segment_counts.length === 1) {
    seg.segment_counts[0] = Array.isArray(seg.points) ? seg.points.length : seg.nodes.length;
  }

  if (Array.isArray(seg.station_weights) && seg.station_weights.length > 0) {
    const nw = rebuildStationWeights(oldLen, removed, seg.station_weights);
    if (nw !== null) seg.station_weights = nw;
  }
  if (Array.isArray(seg.edge_weights)) {
    const target = Math.max(0, seg.nodes.length - 1);
    if (seg.edge_weights.length > target) seg.edge_weights = seg.edge_weights.slice(0, target);
    else if (seg.edge_weights.length < target) {
      while (seg.edge_weights.length < target) seg.edge_weights.push(1);
    }
  }

  return removed.size;
}

function stripSectionDataEntry(sec) {
  if (!sec || typeof sec !== 'object' || !Array.isArray(sec.station_list)) return 0;
  const before = sec.station_list.length;
  sec.station_list = sec.station_list.filter((r) => !isCrossRiverStationListEntry(r));
  return before - sec.station_list.length;
}

function stripStationDataRow(row) {
  if (!row || typeof row !== 'object') return false;
  const sid = row.station_id ?? row.tags?.station_id;
  const sname = row.station_name ?? row.tags?.station_name ?? row.tags?.name;
  return isCrossRiverId(sid) || isCrossRiverId(sname);
}

function processValue(val, stats) {
  if (val == null) return;
  if (Array.isArray(val)) {
    for (let i = val.length - 1; i >= 0; i--) {
      const item = val[i];
      if (item && typeof item === 'object' && item.type === 'Feature' && item.properties) {
        const p = item.properties;
        const sid = p.station_id ?? p.tags?.station_id;
        const sname = p.station_name ?? p.tags?.station_name ?? p.tags?.name;
        if (isCrossRiverId(sid) || isCrossRiverId(sname)) {
          val.splice(i, 1);
          stats.geoFeaturesRemoved++;
          continue;
        }
      }
      processValue(item, stats);
    }
    return;
  }
  if (typeof val !== 'object') return;

  if (Array.isArray(val.segments)) {
    stats.bridgeMerges += mergeCrossRiverBridgesInSegmentList(val.segments);
    for (const seg of val.segments) {
      stats.nodesRemoved += stripSegmentLikeObject(seg);
    }
  }

  stats.nodesRemoved += stripSegmentLikeObject(val);

  if (Array.isArray(val.spaceNetworkGridJsonData)) {
    for (const route of val.spaceNetworkGridJsonData) {
      if (route?.segments) {
        stats.bridgeMerges += mergeCrossRiverBridgesInSegmentList(route.segments);
        for (const seg of route.segments) stats.nodesRemoved += stripSegmentLikeObject(seg);
      } else {
        stats.nodesRemoved += stripSegmentLikeObject(route);
      }
    }
  }

  if (Array.isArray(val.spaceNetworkGridJsonData_SectionData)) {
    for (const sec of val.spaceNetworkGridJsonData_SectionData) {
      stats.sectionRows += stripSectionDataEntry(sec);
    }
  }
  if (Array.isArray(val.spaceNetworkGridJsonData_StationData)) {
    const before = val.spaceNetworkGridJsonData_StationData.length;
    val.spaceNetworkGridJsonData_StationData = val.spaceNetworkGridJsonData_StationData.filter(
      (r) => !stripStationDataRow(r)
    );
    stats.stationDataRemoved += before - val.spaceNetworkGridJsonData_StationData.length;
  }

  for (const k of Object.keys(val)) {
    if (k === 'segments' || k === 'spaceNetworkGridJsonData') continue;
    processValue(val[k], stats);
  }
}

function walkJsonRoot(root, stats) {
  if (Array.isArray(root)) {
    if (isFlatSegmentList(root)) {
      stats.bridgeMerges += mergeCrossRiverBridgesInSegmentList(root);
    }
    for (const item of root) {
      if (item && typeof item === 'object' && !item.type) {
        stats.nodesRemoved += stripSegmentLikeObject(item);
        if (Array.isArray(item.segments)) {
          for (const seg of item.segments) stats.nodesRemoved += stripSegmentLikeObject(seg);
        }
      }
      processValue(item, stats);
    }
    return;
  }
  processValue(root, stats);
}

function processGeoJsonRoot(root, stats) {
  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    const kept = [];
    for (const f of root.features) {
      const p = f?.properties;
      if (p) {
        const sid = p.station_id ?? p.tags?.station_id;
        const sname = p.station_name ?? p.tags?.station_name ?? p.tags?.name;
        if (isCrossRiverId(sid) || isCrossRiverId(sname)) {
          stats.geoFeaturesRemoved++;
          continue;
        }
      }
      kept.push(f);
    }
    root.features = kept;
  }
}

function collectFiles(dir, acc) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) collectFiles(full, acc);
    else if (name.endsWith('.json') || name.endsWith('.geojson')) acc.push(full);
  }
}

const files = [];
collectFiles(DATA_ROOT, files);

let filesChanged = 0;
const totalStats = {
  nodesRemoved: 0,
  geoFeaturesRemoved: 0,
  sectionRows: 0,
  stationDataRemoved: 0,
  bridgeMerges: 0,
};

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.warn('Skip (invalid JSON):', file);
    continue;
  }
  const stats = {
    nodesRemoved: 0,
    geoFeaturesRemoved: 0,
    sectionRows: 0,
    stationDataRemoved: 0,
    bridgeMerges: 0,
  };
  if (data.type === 'FeatureCollection') {
    processGeoJsonRoot(data, stats);
  } else {
    walkJsonRoot(data, stats);
  }
  const touched =
    stats.nodesRemoved +
    stats.geoFeaturesRemoved +
    stats.sectionRows +
    stats.stationDataRemoved +
    stats.bridgeMerges;
  if (touched > 0) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    filesChanged++;
    totalStats.nodesRemoved += stats.nodesRemoved;
    totalStats.geoFeaturesRemoved += stats.geoFeaturesRemoved;
    totalStats.sectionRows += stats.sectionRows;
    totalStats.stationDataRemoved += stats.stationDataRemoved;
    totalStats.bridgeMerges += stats.bridgeMerges;
    console.log(file.replace(DATA_ROOT, 'public/data'));
  }
}

console.log(
  `\nDone. Files changed: ${filesChanged}. Removed node slots: ${totalStats.nodesRemoved}, bridge segment merges: ${totalStats.bridgeMerges}, GeoJSON features: ${totalStats.geoFeaturesRemoved}, SectionData touches: ${totalStats.sectionRows}, StationData rows: ${totalStats.stationDataRemoved}`
);
