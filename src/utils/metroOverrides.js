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
  },

  // 🇨🇳 長三角／珠三角緊鄰城市：discovery 的 bbox 過大，誤含鄰市整套地鐵 → 以營運者/線名剔除鄰市線。
  //    （共線如廣佛線由鄰市營運者經營，會一併被剔，屬可接受的取捨；驗證若標 missing 可再個別補。）
  'china-foshan': { dropByName: '广州|廣州|Guangzhou|黄埔|黃埔|海珠' },
  'china-dongguan': { dropByName: '广州|廣州|Guangzhou|黄埔|黃埔|海珠' },
  'china-suzhou': { dropByName: '无锡|無錫|Wuxi|常州|Changzhou|嘉善|嘉兴|嘉興' },
  'china-wuxi': { dropByName: '苏州|蘇州|Suzhou|常州|Changzhou|苏虞张' },
  'china-changzhou': { dropByName: '无锡|無錫|Wuxi|苏州|蘇州|Suzhou' },
  'china-nantong': { dropByName: '苏州|蘇州|Suzhou|苏虞张|常熟|张家港|張家港' },
  'china-shaoxing': { dropByName: '杭州|Hangzhou|杭海|临平|臨平|萧山|蕭山' },
  // 北京：剔除城際/雄安(屬河北)與纜車；八通線等重複交給 dedupe
  'china-beijing': { dropByName: '雄安|城际|城際|缆车|纜車', dedupeByName: ['八通'] },
  // 🇮🇳 古爾岡：剔除德里地鐵（屬鄰市德里），只留 Rapid Metro
  'india-gurgaon': { dropByName: 'Delhi|DMRC' },
  // 🇭🇰 香港：剔除深圳殘留（簡體深圳線）；APM 由全域雜訊過濾處理
  'china-hong-kong': { dropByName: '深圳|Shenzhen' },
};

/** 取得某 city id 的覆寫設定（無則回空物件） */
export function overridesFor(id) {
  return METRO_OVERRIDES[id] || {};
}
