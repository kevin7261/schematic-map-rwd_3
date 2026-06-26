export const meta = {
  name: 'validate-metro-lines',
  description: 'Validate each city\'s OSM-derived metro lines (count + names) against Wikipedia',
  phases: [{ title: 'Validate', detail: 'one agent per city: read our lines, compare to Wikipedia' }],
};

// args = ["taiwan-taipei", "japan-tokyo", ...] (catalog city ids)；容錯：若被當字串傳入則 parse
let ids = args;
if (typeof ids === 'string') {
  try {
    ids = JSON.parse(ids);
  } catch (e) {
    ids = ids.split(/[\s,]+/).filter(Boolean);
  }
}
ids = Array.isArray(ids) ? ids : [];
log(`驗證 ${ids.length} 城市的地鐵線（對照 Wikipedia 線數/線名）；args 型別=${typeof args}`);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    city: { type: 'string' },
    verdict: { type: 'string', enum: ['ok', 'minor', 'major'] },
    wikiLineCount: { type: 'integer' },
    ourLineCount: { type: 'integer' },
    missing: { type: 'array', items: { type: 'string' }, description: '真實營運但我們缺的線' },
    extra: { type: 'array', items: { type: 'string' }, description: '我們有但非真實營運線' },
    colorIssues: {
      type: 'array',
      items: { type: 'string' },
      description: '顏色與 Wikipedia 官方色明顯不符的線（格式："線名: 我們color vs 官方color"）',
    },
    stationIssue: { type: 'string', description: '站數/缺站問題（與 Wikipedia 差距明顯時說明，否則空字串）' },
    notes: { type: 'string' },
  },
  required: ['id', 'city', 'verdict', 'wikiLineCount', 'ourLineCount', 'missing', 'extra', 'colorIssues', 'stationIssue', 'notes'],
};

const prompt = (id) => `驗證城市 id = "${id}" 的地鐵資料是否與 Wikipedia 相符。

步驟：
1. 先取得我們目前的資料：用 Bash 執行  node scripts/_cityLines.mjs ${id}
   （印出 JSON：{ id, city, country, cityZh, stationCount, lines:[{name,color,status},...]}）
2. 用 Wikipedia 查證該城市「目前營運中」的地鐵/捷運/輕軌路線、各線官方代表色、總站數——優先英文條目，缺則查當地語言版（WebFetch / WebSearch）。
3. 比對，判斷：
   - missing：真實營運、我們缺的線
   - extra：我們有但非真實營運線（同線重複/變體、非地鐵雜訊、誤抓鄰近城市的線）
   - colorIssues：我們的 color 與 Wikipedia 官方線色明顯不符者（色系完全不同才算；細微色差不算）。格式「線名: 我們#xxx vs 官方#yyy/色名」
   - stationIssue：我們 stationCount 與 Wikipedia 該系統營運中總站數差距明顯（如缺整段）時說明；接近則空字串
   - 視為同一條線：不同語言/羅馬拼音、方向後綴、分支變體；施工/計畫(status≠open)線不算 extra、未通車不算 missing。
   - verdict：相符=ok；1 處小差異=minor；多處缺漏/多餘/抓錯城市/多條顏色錯=major。

精簡作業。notes 用繁體中文。回傳結構化結果。`;

const results = await parallel(
  ids.map((id) => () => agent(prompt(id), { schema: SCHEMA, label: id, phase: 'Validate' }))
);

const ok = results.filter(Boolean);
const major = ok.filter((r) => r.verdict === 'major');
const minor = ok.filter((r) => r.verdict === 'minor');
log(`完成：ok ${ok.length - major.length - minor.length}、minor ${minor.length}、major ${major.length}`);

return {
  total: ids.length,
  validated: ok.length,
  okCount: ok.length - major.length - minor.length,
  major: major.sort((a, b) => b.extra.length + b.missing.length - (a.extra.length + a.missing.length)),
  minor,
};
