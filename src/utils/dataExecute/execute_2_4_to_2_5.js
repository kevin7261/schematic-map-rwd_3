// # @title Colab 2-5: 路線串接
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 2.4 (幾何優化後) 的 JSON 資料。
// 2. 執行「資料清洗與整合」：
//    - Grouping: 依據 `route_name` 將零散的線段分組。
//    - Color Fix: 掃描整組路線，找出正確顏色，並強制套用到該路線的所有線段上。
//      (包含內建的台北捷運標準色碼表，作為備援)。
// 3. 輸出格式：
//    - 維持 Flat List (扁平列表) 結構，方便 Colab 6 (並行線處理) 讀取。
// 4. 視覺化驗證：
//    - 延續 Colab 4 的嚴格標準，只繪製「真實車站」，隱藏幾何轉折點。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 2. 核心判定工具 (嚴格過濾)
// ==========================================
/**
 * [嚴格判定] 是否為真實車站 (黑點/紅點)。
 * 過濾掉幾何運算產生的 node_type='line' 轉折點。
 * @param {Object} node - 節點屬性物件
 * @returns {boolean} 是否為真實車站
 */
// eslint-disable-next-line no-unused-vars
function isRealStation(node) {
  if (!node) return false;
  // 1. 轉乘點 (Connect Node)
  if (node.node_type === 'connect') return true;
  // 2. 有站名的點
  if (node.station_name) return true;
  if (node.tags?.station_name) return true;

  return false;
}

/**
 * 安全地從多層次屬性中提取數值
 * @param {Object} item - 項目物件
 * @param {string|Array<string>} keys - 要搜尋的鍵名
 * @returns {*} 找到的數值或 null
 */
function getTagValue(item, keys) {
  if (typeof keys === 'string') keys = [keys];
  // 搜尋順序：way_properties -> properties -> tags -> item root
  const searchTargets = [
    item.way_properties?.tags || {},
    item.properties || {},
    item.properties?.tags || {},
    item,
    item.tags || {},
  ];
  for (const target of searchTargets) {
    if (!target || typeof target !== 'object') continue;
    for (const k of keys) {
      const val = target[k];
      if (val) return val;
    }
  }
  return null;
}

// 台北捷運標準色碼表 (備援用，解決資料遺失問題)
const MRT_COLORS = {
  板南線: '#005EB8',
  淡水信義線: '#CB2C30',
  松山新店線: '#008659',
  中和新蘆線: '#F8B61C',
  文湖線: '#C48C31',
  環狀線: '#FFDB00',
  萬大線: '#B1D348',
  萬大中和樹林線: '#B1D348',
  三鶯線: '#79BCE8',
  安坑輕軌: '#C6A66C',
  淡海輕軌: '#C6A66C',
  機場線: '#8246AF',
  貓空纜車: '#77BC1F',
};

/**
 * 強健的路線名稱提取
 * @param {Object} item - 項目物件
 * @returns {string} 路線名稱
 */
function getRouteNameRobust(item) {
  const name = getTagValue(item, ['route_name', 'name', 'ref']);
  if (!name) return 'Unknown_Route';
  // 處理類似 "Bannan Line (BL)" 的情況，只取前面名稱
  return name.split('(')[0].trim();
}

/**
 * 強健的顏色提取
 * @param {Object} item - 項目物件
 * @returns {string} 顏色字串
 */
function getColorRobust(item) {
  // 1. 優先從資料屬性抓
  let c = getTagValue(item, ['color', 'colour']);
  if (c && c !== '#555555') return c;

  // 2. 抓不到就查表 (依據路線名稱)
  const name = getRouteNameRobust(item);
  for (const [key, color] of Object.entries(MRT_COLORS)) {
    if (name.includes(key)) return color;
  }

  return '#555555'; // 預設灰
}

// ==========================================
// 3. 資料整理核心 (Data Cleaning)
// ==========================================
/**
 * 將線段依路線分組，統一顏色，最後展平輸出。
 * @param {Array} segmentsData - 線段資料陣列
 * @returns {Array} [outputFlat, routeColorMap]
 */
function organizeAndFixData(segmentsData) {
  const grouped = new Map();
  const routeColorMap = {};

  // --- Phase 1: 分組與顏色偵測 ---
  for (const seg of segmentsData) {
    const rName = getRouteNameRobust(seg);
    if (!grouped.has(rName)) {
      grouped.set(rName, []);
    }
    grouped.get(rName).push(seg);

    const segColor = getColorRobust(seg);
    // 記錄該路線最可能的顏色 (優先選非灰色的顏色)
    if (
      !routeColorMap[rName] ||
      (routeColorMap[rName] === '#555555' && segColor !== '#555555')
    ) {
      routeColorMap[rName] = segColor;
    }
  }

  // --- Phase 2: 統一屬性並展平 ---
  const outputFlat = [];
  const sortedRouteNames = Array.from(grouped.keys()).sort();

  for (const rName of sortedRouteNames) {
    const color = routeColorMap[rName] || '#555555';

    for (const seg of grouped.get(rName)) {
      // 修復 way_properties 結構
      if (!seg.way_properties) seg.way_properties = {};
      if (!seg.way_properties.tags) seg.way_properties.tags = {};

      // 強制寫入統一後的顏色 (雙重保險)
      seg.way_properties.tags.color = color;
      seg.way_properties.tags.route_name = rName; // 確保名稱統一

      // 也可以更新外層 properties 以防萬一
      if (seg.properties) {
        seg.properties.color = color;
        seg.properties.route_name = rName;
      }

      outputFlat.push(seg);
    }
  }

  return [outputFlat, routeColorMap];
}

// ==========================================
// 4. 視覺化 (Visual Verification)
// ==========================================
/**
 * 繪製合併結果對照圖
 * @param {Array} originalData - 原始資料
 * @param {Array} finalData - 最終資料
 */
// eslint-disable-next-line no-unused-vars
function plotMergeResult(originalData, finalData) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log('[視覺化] Merge Result: Input vs Output');
}

// ==========================================
// 5. 主程式執行
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_4_to_2_5(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_4Layer = dataStore.findLayerById('taipei_2_4');
  const taipei2_5Layer = dataStore.findLayerById('taipei_2_5');

  // ==========================================
  // 1. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 2.4 最終幾何優化後的檔案
  const inputJsonFilename = taipei2_4Layer ? 'taipei_2_4 (in-memory)' : 'taipei_2_4';
  // 輸出：Step 3 整合後的檔案 (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_4 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_5 圖層`);
  console.log('='.repeat(60));

  if (!taipei2_4Layer || !taipei2_4Layer.spaceNetworkGridJsonData) {
    console.error(`❌ [錯誤] 找不到輸入檔案: ${inputJsonFilename}`);
    console.error('   請確認 Colab 4 是否已執行並產生檔案。');
    throw new Error(`找不到輸入檔案: ${inputJsonFilename}`);
  }

  try {
    const dataStep4 = JSON.parse(JSON.stringify(taipei2_4Layer.spaceNetworkGridJsonData));

    console.log('🚀 開始執行資料整合...');

    // 1. 執行整合與修復
    const [outputFlatList, routeColorMap] = organizeAndFixData(dataStep4);

    console.log('\n' + '='.repeat(40));
    console.log('📊 資料處理報告 (Data Report)');
    console.log('='.repeat(40));
    console.log(`  - 輸入片段數: ${dataStep4.length}`);
    console.log(`  - 輸出片段數: ${outputFlatList.length} (維持 Flat List 結構)`);

    console.log('\n🎨 路線顏色對照表 (Route Colors):');
    console.log('-'.repeat(40));
    for (const [r, c] of Object.entries(routeColorMap)) {
      console.log(`  - ${r.padEnd(20)} : ${c}`);
    }
    console.log('-'.repeat(40));

    // 2. 儲存檔案
    console.log('\n🚀 儲存 JSON 檔案...');
    if (!taipei2_5Layer) {
      throw new Error('找不到 taipei_2_5 圖層');
    }

    taipei2_5Layer.spaceNetworkGridJsonData = outputFlatList;
    console.log(`✅ 資料已傳給 taipei_2_5 圖層`);

    // 3. 繪圖驗證
    console.log('\n🚀 產生對照圖 (Input vs Output)...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    plotMergeResult(dataStep4, outputFlatList);

    // 自動開啟 taipei_2_5 圖層以便查看結果
    if (!taipei2_5Layer.visible) {
      taipei2_5Layer.visible = true;
      dataStore.saveLayerState('taipei_2_5', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      originalSegmentCount: dataStep4.length,
      outputSegmentCount: outputFlatList.length,
      routeCount: Object.keys(routeColorMap).length,
      routeColorMap: routeColorMap,
    };

    taipei2_5Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
