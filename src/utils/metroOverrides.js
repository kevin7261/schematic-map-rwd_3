/**
 * 🗂️ 各城市地鐵抓取「覆寫設定」（per-city overrides）
 *
 * 抓取 pipeline（src/utils/metroOsmFetch.js）為通用邏輯；本檔集中放各城市的個別調整，
 * 由抓取腳本（scripts/_refetchCities.mjs、scripts/fetchAllFromCatalog.mjs）讀取後傳入。
 *
 * 可用欄位（皆為選填）：
 *   - bbox: [s,w,n,e]          覆寫 catalog 的 bbox（如台北西延至桃園機場以納入機場捷運）
 *   - keepOperators: string    只保留符合此 regex 的營運者（僅對 status=open 生效；如東京只留兩家地鐵公司）
 *   - colorByName: [{match,color}]  依 route_name 套用官方配色（首個符合者勝；施工/計畫線藉此繼承母線色）
 *   - dedupeByName: [string]    同一 regex family 的線只保留座標點最多者（清掉 OSM 同線多名稱的重複）
 */

// 🎨 各城市官方線色（route_id → hex），與本檔分離存於 JSON 以便程式化產生／合併。
//    由 overridesFor() 併入各城市的 colorById，讓重生成時依 route_id 套官方色、不被調色盤蓋掉。
import COLOR_BY_ID from './metroColorOverrides.json' with { type: 'json' };

export const METRO_OVERRIDES = {
  // 🇹🇼 台北（含新北、桃園捷運）：西延 bbox 納入機場捷運/桃園綠線；套台北捷運官方配色；去除萬大線等重複
  'taiwan-taipei': {
    bbox: [24.9, 121.15, 25.21, 121.68], // 西延 121.15、南延 24.9、北延 25.21，涵蓋機場捷運/桃園綠線與淡海輕軌(崁頂)
    // 配色：首個符合者勝，故「具體 family」需排在「通用關鍵字」之前，避免誤配
    colorByName: [
      { match: '南港基隆|基隆', color: '#b0a000' }, // 南港基隆線（規劃，暫定）
      { match: '泰山', color: '#7ac143' }, // 五股泰山/泰山板橋輕軌（規劃）
      { match: '淡水|信義', color: '#e3002c' }, // 紅：淡水信義線（含信義線東延）
      { match: '文湖', color: '#c48c31' }, // 棕：文湖線
      { match: '松山|新店|台電', color: '#008659' }, // 綠：松山新店線
      { match: '新蘆|蘆洲', color: '#f8b61c' }, // 橘：中和新蘆線
      { match: '環狀', color: '#ffdb00' }, // 黃：環狀線（含北/南/東環段）
      { match: '萬大|樹林', color: '#b07aa1' }, // 萬大-中和-樹林線（興建，暫定）
      { match: '三鶯', color: '#cd6629' }, // 三鶯線（興建，暫定）
      { match: '民生汐止|汐止東湖', color: '#5b8f8f' }, // 民生汐止線（規劃，暫定）
      { match: '機場|A線', color: '#8246af' }, // 紫：桃園機場捷運
      { match: '桃園|綠線', color: '#6cb02c' }, // 桃園綠線
      { match: '淡海', color: '#23a3dc' }, // 淡海輕軌
      { match: '安坑', color: '#00a14b' }, // 安坑輕軌
      { match: '板南|南港|板橋|土城', color: '#0070bd' }, // 藍：板南線（南港-板橋-土城）— 置末
    ],
    // 去重：OSM 同一條線常有多個名稱變體；同 family 只留座標點最多者
    dedupeByName: ['萬大|樹林', '環狀.*東環|東環段'],
  },

  // 🇯🇵 東京：只保留兩家地鐵公司（東京メトロ＋都營）；直通/私鐵段由 pipeline 內建剔除
  'japan-tokyo': {
    keepOperators: '東京メトロ|東京地下鉄|Tokyo Metro|東京都交通局',
  },
  'japan-tokyo-metro': {
    keepOperators: '東京メトロ|東京地下鉄|Tokyo Metro|東京都交通局',
  },
  // 東京（兩家地鐵公司）＋ JR 山手線 ＋ JR 中央線（強制納入此二 JR 線，繞過直通/JR 過濾）
  'japan-tokyo-yamanote-chuo': {
    keepOperators: '東京メトロ|東京地下鉄|Tokyo Metro|東京都交通局',
    includeRail: '山手線|Yamanote|中央線|中央・総武|Chūō|Chuo',
    dedupeByName: ['山手|Yamanote', '中央線快速|中央線（', '中央・総武'],
  },

  // 🇨🇳 長三角／珠三角緊鄰城市：discovery 的 bbox 過大，誤含鄰市整套地鐵 → 以營運者/線名剔除鄰市線。
  //    （共線如廣佛線由鄰市營運者經營，會一併被剔，屬可接受的取捨；驗證若標 missing 可再個別補。）
  // 緊鄰城市群：鄰市線名/營運者常無城市標記，改用「收緊 bbox ＋ 地理裁切」剔除鄰市線
  'china-foshan': { bbox: [22.85, 112.82, 23.22, 113.28], clipToBbox: true },
  'china-dongguan': { bbox: [22.73, 113.6, 23.18, 114.08], clipToBbox: true },
  'china-suzhou': { bbox: [31.12, 120.4, 31.48, 121.0], clipToBbox: true },
  'china-wuxi': { bbox: [31.42, 120.1, 31.72, 120.58], clipToBbox: true },
  'china-changzhou': { bbox: [31.63, 119.78, 31.95, 120.12], clipToBbox: true },
  'china-nantong': { bbox: [31.88, 120.68, 32.12, 121.12], clipToBbox: true },
  'china-shaoxing': { bbox: [29.92, 120.42, 30.12, 120.78], clipToBbox: true },
  // 北京：剔除城際/雄安(屬河北)與纜車；八通線等重複交給 dedupe
  'china-beijing': { dropByName: '雄安|城际|城際|缆车|纜車', dedupeByName: ['八通'] },
  // 🇮🇳 古爾岡：剔除德里地鐵（屬鄰市德里），只留 Rapid Metro
  'india-gurgaon': { dropByName: 'Delhi|DMRC' },
  // 🇭🇰 香港：剔除深圳殘留（簡體深圳線）；APM 由全域雜訊過濾處理
  'china-hong-kong': { dropByName: '深圳|Shenzhen|輕鐵|輕鉄|Light Rail' },

  // 🚇 單線「城市」：discovery 把單一路線當成城市，其 bbox 會誤含整個都會網 → 只保留該線本身。
  'japan-rinkai-line': { includeRail: 'りんかい|臨海|Rinkai', onlyLineName: 'りんかい|臨海|Rinkai' },
  'japan-yurikamome': { onlyLineName: 'ゆりかもめ|Yurikamome' },
  'japan-minatomirai-line': { onlyLineName: 'みなとみらい|Minatomirai' },
  'japan-saitama-rapid-railway-line': { onlyLineName: '埼玉高速|Saitama Rapid' },
  'japan-kanazawa-seaside-line': { onlyLineName: 'シーサイド|金沢シーサイド|Seaside' },
  'japan-kobe-new-transit': { onlyLineName: 'ポートライナー|六甲ライナー|Port Liner|Rokko' },
  'japan-nippori-toneri-liner': { onlyLineName: '日暮里|舎人|Nippori|Toneri' },
  'japan-saitama-prefecture': { onlyLineName: '埼玉|伊奈線|New Shuttle|ニューシャトル' },
  'south-korea-shinbundang-line': { onlyLineName: '신분당|新盆唐|Shinbundang|DX' },
  'united-states-path': { onlyLineName: 'PATH|Port Authority Trans' },
  'united-states-staten-island-railway': { onlyLineName: 'Staten Island' },
  // 桃園：已併入台北；此獨立條目只留桃園自有線（機場捷運＋桃園綠線）
  'taiwan-taoyuan': { onlyLineName: '桃園|機場|Taoyuan|Airport' },

  // 單線/小系統城市，bbox 誤含鄰近大都會網 → 只留自有線
  'united-kingdom-docklands-light-railway': { onlyLineName: 'DLR|Docklands' },
  'india-noida': { onlyLineName: 'Aqua|Noida|नोएडा' },
  'india-navi-mumbai': { bbox: [18.98, 73.0, 19.12, 73.15], keepOperators: 'CIDCO' },
  'south-korea-gimpo': { bbox: [37.55, 126.58, 37.7, 126.85], onlyLineName: '김포|골드|Gimpo|Gold' },
  // 橫濱：剔除東京/鎌倉鄰市線
  'japan-yokohama': { dropByName: 'ゆりかもめ|江ノ島|江ノ電|羽田|世田谷|湘南' },
  // 里昂：剔除 TER 區域火車與機場接駁（非地鐵）
  'france-lyon': { dropByName: 'TER |Rhônexpress' },

  // 方向/分支變體重複去重；個別鄰市/雜訊線剔除
  'india-mumbai': { dedupeByName: ['Line 9', 'Line-2|Line 2', 'Green Line'] },
  'india-chennai': { dedupeByName: ['Line 3', 'Line 4', 'Line 5'] },
  'iran-karaj': { dropByName: 'خط ۱۰|Line 10', dedupeByName: ['خط ۲'] },
  'qatar-doha': { dedupeByName: ['الأحمر|Red', 'الذهب|Gold|金'] },
  'united-states-washington-dc': { dedupeByName: ['Purple'] },
  'south-korea-incheon': {
    dropByName: '서울|首爾|首尔|Seoul|의정부|광명|Gwangmyeong|김포|Gimpo|신분당|新盆唐|Sinbundang',
  },
  'chile-santiago': { dedupeByName: ['Línea 1|Line 1', 'Línea 2', 'Línea 4', 'Línea 5'] },
};

/** 取得某 city id 的覆寫設定（無則回空物件）；併入官方 colorById（route_id→hex） */
export function overridesFor(id) {
  const base = METRO_OVERRIDES[id] || {};
  const cbi = COLOR_BY_ID[id];
  if (!cbi) return base;
  return { ...base, colorById: { ...(base.colorById || {}), ...cbi } };
}
