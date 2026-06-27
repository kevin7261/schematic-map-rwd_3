/**
 * Li & Dong (2010) — "A stroke-based method for automated generation of schematic
 * network maps" (IJGIS 24:11, 1631–1647) 之忠實實作（worker-safe，不依賴 dataStore）。
 *
 * 本檔輸出 stroke 演算法**自己**的座標（不接 MILP）。流程嚴格對應論文：
 *   Main(){ FormStrokes(L,T); ProgressiveSchematization(S); }  （p.1640 虛擬碼）
 *   A. FormStrokes（§3, p.1633–1635, p.1640）：命名線段按「同名 + 相鄰」串成 stroke；
 *      同名分叉處以 good-continuation（最小偏向角）選擇延伸（無名線段才用 PJS/every-best-fit）。
 *   B. Ranking（§6, Eq.3, p.1639）：type → length → degree（交叉數），高排序先處理、作固定參考。
 *   C. Re-orientation（§4, p.1635–1636）：四主方向（格線優先；對角線為次選）+ 最大方向扭曲 DP 切子筆畫。
 *   D. Perpendicular projection（§5, Eq.1/Eq.2, p.1637–1638）：沿軸座標保留、垂軸座標設加權共同值
 *      （重要交叉點 / 已置放點權重高）；對角線旋轉 ±45° 後同理。保留所有中間點、不重新取樣。
 *   E. Inconsistency repair（§6, Fig.9, p.1639–1640）：原(子)筆畫與投影線之間構成多邊形，
 *      以 point-in-polygon 偵測；若他筆畫已置放點落入多邊形 → 化解（夾住共同座標、不掃過該點）。
 *
 * 註：metro 線段無「道路類型」屬性，故 Eq.3 之 type 視為常數，排序退化為 length → degree（忠實）。
 */

const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/** 兩角度差（0..π）。 */
function angBetween(a, b) {
  let d = Math.abs(a - b) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
}

// 四個 orientation（無向線方向），對應論文「四主方向 + 兩對角線」。
const ORIENTS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
const GRID_ORIENTS = new Set([0, Math.PI / 2]); // 格線（H/V）為優先

/**
 * 將子筆畫弦方向 snap 到一個 orientation。
 * four 模式：格線（H/V）給予優先 bonus（論文建議：對角線為次選）；
 * eight 模式：四 orientation 等權。
 */
function snapOrientation(chordAng, mode, gridBiasRad) {
  const m = ((chordAng % Math.PI) + Math.PI) % Math.PI; // 0..π（無向）
  let best = ORIENTS[0];
  let bestScore = Infinity;
  for (const o of ORIENTS) {
    let d = Math.abs(m - o);
    if (d > Math.PI / 2) d = Math.PI - d;
    const score = d - (mode === 'four' && GRID_ORIENTS.has(o) ? gridBiasRad : 0);
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

/** §4 第一法：最大方向扭曲檢查（Douglas–Peucker 式，以「方向扭曲」非垂距為準）。 */
function dpDirectionSplit(pts, thresholdRad) {
  const breaks = new Set([0, pts.length - 1]);
  const rec = (s, e) => {
    if (e - s < 2) return;
    const chord = Math.atan2(pts[e][1] - pts[s][1], pts[e][0] - pts[s][0]);
    let worst = -1;
    let worstD = thresholdRad;
    for (let i = s; i < e; i++) {
      const segAng = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      const d = angBetween(chord, segAng);
      if (d > worstD) { worstD = d; worst = i + 1 <= e - 1 ? i + 1 : i; }
    }
    if (worst > s && worst < e) { breaks.add(worst); rec(s, worst); rec(worst, e); }
  };
  rec(0, pts.length - 1);
  return [...breaks].sort((a, b) => a - b);
}

/** 建鄰接表（僅實邊；忽略 link）。 */
function buildAdjacency(graph) {
  const adj = new Map();
  const deg = new Map();
  for (const e of graph.edges) {
    if (e.isLink) continue;
    if (!adj.has(e.u)) adj.set(e.u, []);
    if (!adj.has(e.v)) adj.set(e.v, []);
    adj.get(e.u).push({ e, o: e.v });
    adj.get(e.v).push({ e, o: e.u });
    deg.set(e.u, (deg.get(e.u) || 0) + 1);
    deg.set(e.v, (deg.get(e.v) || 0) + 1);
  }
  return { adj, deg };
}

/**
 * A. FormStrokes（§3 / p.1640 虛擬碼，命名分支）。
 * 依 route 分組，於同名線內以 good-continuation（最小偏向角）串成 stroke 節點序列。
 */
function formStrokes(graph, coords0) {
  const byRoute = new Map();
  for (const e of graph.edges) {
    if (e.isLink) continue;
    for (const rn of e.routes || new Set([e.route_name])) {
      if (!byRoute.has(rn)) byRoute.set(rn, []);
      byRoute.get(rn).push(e);
    }
  }

  const strokes = [];
  for (const [, edges] of byRoute) {
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.u)) adj.set(e.u, []);
      if (!adj.has(e.v)) adj.set(e.v, []);
      adj.get(e.u).push({ e, o: e.v });
      adj.get(e.v).push({ e, o: e.u });
    }
    const usedE = new Set();
    // 種子：度數 1 的端點優先（線端），否則任一節點。
    const ends = [...adj.keys()].filter((n) => adj.get(n).length === 1);
    const seeds = ends.length ? ends : [adj.keys().next().value];

    for (const seed of seeds) {
      // 自種子沿 good-continuation 走，直到無未用邊。
      let cur = seed;
      let prev = null;
      const seq = [cur];
      for (;;) {
        const cand = (adj.get(cur) || []).filter(({ e }) => !usedE.has(e.id));
        if (!cand.length) break;
        let pick = cand[0];
        if (prev != null && cand.length > 1) {
          // good continuation：選與入向偏向角最小者（§3(d) 之延伸精神）。
          const inAng = Math.atan2(coords0[cur][1] - coords0[prev][1], coords0[cur][0] - coords0[prev][0]);
          let bestD = Infinity;
          for (const c of cand) {
            const outAng = Math.atan2(coords0[c.o][1] - coords0[cur][1], coords0[c.o][0] - coords0[cur][0]);
            const d = angBetween(inAng, outAng);
            if (d < bestD) { bestD = d; pick = c; }
          }
        }
        usedE.add(pick.e.id);
        seq.push(pick.o);
        prev = cur;
        cur = pick.o;
      }
      if (seq.length >= 2) strokes.push(seq);
    }
    // 殘邊（環/重複種子未覆蓋）→ 各自成 2 節點 stroke。
    for (const e of edges) if (!usedE.has(e.id)) { usedE.add(e.id); strokes.push([e.u, e.v]); }
  }
  return strokes;
}

/** B. Ranking 鍵（Eq.3）：type 常數 → length（降冪）→ degree 交叉數（降冪）。 */
function strokeRankKey(seq, coords0, nodeDeg) {
  let length = 0;
  for (let i = 1; i < seq.length; i++) {
    length += Math.hypot(coords0[seq[i]][0] - coords0[seq[i - 1]][0], coords0[seq[i]][1] - coords0[seq[i - 1]][1]);
  }
  let degree = 0;
  for (const nid of seq) if ((nodeDeg.get(nid) || 0) > 2) degree++;
  return { length, degree };
}

/** ray-casting point-in-polygon。 */
function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = (yi > pt[1]) !== (yj > pt[1]) &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * D. 對單一子筆畫做垂直投影（§5）。回傳每個自由節點的新座標（已置放點不動）。
 * @returns Map<index, [x,y]>（僅自由節點）
 */
function projectSubStroke(idxs, chain, work, placed, nodeDeg, orientAng, foreignPlaced) {
  // 單位向量：沿軸 u、垂軸 n。
  const u = [Math.cos(orientAng), Math.sin(orientAng)];
  const n = [-Math.sin(orientAng), Math.cos(orientAng)];

  // 加權共同垂軸座標：已置放點權重最高（漸進錨定）、交叉點次之、其餘 1。
  let wsum = 0, pacc = 0;
  const perpOf = (p) => p[0] * n[0] + p[1] * n[1];
  for (const i of idxs) {
    const nid = chain[i];
    const p = work[i];
    let w = 1;
    if (placed.has(nid)) w = 1000;
    else if ((nodeDeg.get(nid) || 0) > 2) w = 10;
    wsum += w; pacc += w * perpOf(p);
  }
  let perpCommon = wsum > 0 ? pacc / wsum : 0;
  const projAt = (i, pc) => {
    const along = work[i][0] * u[0] + work[i][1] * u[1];
    return [along * u[0] + pc * n[0], along * u[1] + pc * n[1]];
  };

  // E. 一致性化解（§6, Fig.9）：原(子)筆畫與投影線間構成多邊形；以 point-in-polygon
  //    偵測落入其中的他筆畫已置放點，再夾住 perpCommon 使投影線不掃過該點（維持拓樸）。
  if (foreignPlaced && foreignPlaced.length) {
    const origLo = Math.min(...idxs.map((i) => perpOf(work[i])));
    const origHi = Math.max(...idxs.map((i) => perpOf(work[i])));
    for (let pass = 0; pass < 4; pass++) {
      // 多邊形 = 原子筆畫路徑（前向）+ 投影路徑（反向）閉合。
      const poly = idxs.map((i) => work[i]).concat(idxs.slice().reverse().map((i) => projAt(i, perpCommon)));
      let changed = false;
      for (const fp of foreignPlaced) {
        if (!pointInPolygon(fp, poly)) continue;
        const fperp = fp[0] * n[0] + fp[1] * n[1];
        // 把投影線夾到 foreign 點的「原始側」之外，使其不再被多邊形掃過。
        if (fperp <= origLo && perpCommon < fperp) { perpCommon = fperp + 1; changed = true; }
        else if (fperp >= origHi && perpCommon > fperp) { perpCommon = fperp - 1; changed = true; }
        else if (Math.abs(fperp - perpCommon) < 1) { // 線正好壓在點上：往原值方向推開
          perpCommon += perpCommon >= (origLo + origHi) / 2 ? 1 : -1; changed = true;
        }
      }
      if (!changed) break;
    }
  }

  const out = new Map();
  for (const i of idxs) {
    const nid = chain[i];
    if (placed.has(nid)) continue; // 已置放點固定不動
    const along = work[i][0] * u[0] + work[i][1] * u[1];
    out.set(i, [
      Math.round(along * u[0] + perpCommon * n[0]),
      Math.round(along * u[1] + perpCommon * n[1]),
    ]);
  }
  return out;
}

/**
 * 對 connect 圖節點座標跑 Li & Dong (2010) stroke 法。回傳 coords（node 索引 → [x,y]）。
 * @param {object} graph buildSchematicGraph 之輸出
 * @param {Array<[number,number]>} coords0 初始（地理、整數格）座標
 * @param {{thresholdDeg?:number, directionMode?:'four'|'eight', gridBiasDeg?:number}} opts
 */
export function runStrokeOnGraph(graph, coords0, opts = {}) {
  const threshold = (opts.thresholdDeg ?? 45) * DEG;
  const mode = opts.directionMode ?? 'four'; // 論文建議四主方向
  const gridBias = (opts.gridBiasDeg ?? 10) * DEG; // 格線優先 bonus

  const coords = coords0.map((c) => c.slice());
  const { deg: nodeDeg } = buildAdjacency(graph);
  const placed = new Set();

  // A + B：成筆畫並依 Eq.3 排序（type 常數 → length → degree，皆降冪）。
  const strokes = formStrokes(graph, coords0);
  strokes.sort((a, b) => {
    const ka = strokeRankKey(a, coords0, nodeDeg);
    const kb = strokeRankKey(b, coords0, nodeDeg);
    if (kb.length !== ka.length) return kb.length - ka.length;
    return kb.degree - ka.degree;
  });

  for (const chain of strokes) {
    // 工作座標：已置放點用目前 schematic 座標，否則用原始座標。
    const work = chain.map((nid) => (placed.has(nid) ? coords[nid].slice() : coords0[nid].slice()));
    const orig = chain.map((nid) => coords0[nid]);

    // C：最大方向扭曲 DP 切子筆畫；含已置放點作為固定切點。
    const fixedIdx = [];
    for (let i = 0; i < chain.length; i++) if (placed.has(chain[i])) fixedIdx.push(i);
    const breaks = [...new Set([0, chain.length - 1, ...dpDirectionSplit(orig, threshold), ...fixedIdx])]
      .sort((a, b) => a - b);

    // 鄰近 foreign 已置放點（不屬本筆畫），供 Step E 夾制。
    const chainSet = new Set(chain);
    const foreignPlaced = [];
    for (const nid of placed) if (!chainSet.has(nid)) foreignPlaced.push(coords[nid]);

    for (let b = 0; b < breaks.length - 1; b++) {
      const s = breaks[b];
      const e = breaks[b + 1];
      const idxs = [];
      for (let i = s; i <= e; i++) idxs.push(i);

      // C：定向（四主方向 / 八方向）。
      const chordAng = Math.atan2(orig[e][1] - orig[s][1], orig[e][0] - orig[s][0]);
      const orientAng = snapOrientation(chordAng, mode, gridBias);

      // D + E：垂直投影（自由點），已置放點固定。
      const projected = projectSubStroke(idxs, chain, work, placed, nodeDeg, orientAng, foreignPlaced);
      for (const [i, p] of projected) work[i] = p;
    }

    // 提交本筆畫尚未置放之節點座標。
    for (let i = 0; i < chain.length; i++) {
      const nid = chain[i];
      if (!placed.has(nid)) {
        coords[nid] = [Math.round(work[i][0]), Math.round(work[i][1])];
        placed.add(nid);
      }
    }
  }

  // 殘餘未被任何 stroke 覆蓋之節點（理論上不應發生）→ 保留原座標。
  return coords;
}
