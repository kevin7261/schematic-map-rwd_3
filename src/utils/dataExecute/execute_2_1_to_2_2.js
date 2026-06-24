// # @title Colab 2-2: 示意化網格運算
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 2.1 的直線化資料 (01_straighten_*.json)。
// 2. 執行「示意化 (Schematization)」：
//    將精細座標吸附到較粗的網格 (Grid Size = 5)，使地圖更具抽象感。
// 3. [關鍵] 屬性同步搬移：
//    當座標改變時，同步更新 `nodes` 列表，確保站點資訊 (黑點/紅點) 不會錯位或消失。
// 4. [防呆] 混合模式偵測：
//    同時檢查 `properties_start/end` 與 `nodes` 列表，確保交會點 (Connect Node) 被正確識別。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';
import { schematizeStraightenedNetwork } from '@/utils/dataExecute/schematizeStraightenedNetwork.js';

export { schematizeStraightenedNetwork } from '@/utils/dataExecute/schematizeStraightenedNetwork.js';

// ==========================================
// 4. 輔助函式：視覺化
// ==========================================
/**
 * 取得路線顏色
 * @param {Object} segment - 線段物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getSegmentColor(segment) {
  let props = segment.way_properties?.tags || {};
  if (!props || Object.keys(props).length === 0) {
    props = segment.properties || {};
  }
  return props.colour || props.color || '#000000';
}

/**
 * 繪製地圖 (支援讀取 nodes 顯示紅點/黑點)
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} data - 線段資料
 * @param {string} title - 圖表標題
 */
// eslint-disable-next-line no-unused-vars
function plotRoadData(ax, data, title) {
  // 在 JavaScript 環境中，此功能由前端 d3jsmap 組件處理
  console.log(`[視覺化] ${title}`);
}

// ==========================================
// 5. 主執行流程
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_2_1_to_2_2(_jsonData) {
  const dataStore = useDataStore();
  const taipei2_1Layer = dataStore.findLayerById('taipei_2_1');
  const taipei2_2Layer = dataStore.findLayerById('taipei_2_2');

  // ==========================================
  // 2. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 2.1 直線化後的檔案
  const inputJsonFilename = taipei2_1Layer ? 'taipei_2_1 (in-memory)' : 'taipei_2_1';
  // 輸出：Step 2.2 示意化後的檔案 (已直接傳給下一個圖層)

  // [參數] 示意化網格大小 (數值越大，地圖越抽象/方正)
  const GRID_SIZE = 5;

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案: 從 taipei_2_1 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_2_2 圖層`);
  console.log(`   - 網格大小: ${GRID_SIZE}`);
  console.log('='.repeat(60));

  if (!taipei2_1Layer || !taipei2_1Layer.spaceNetworkGridJsonData) {
    console.error(`❌ [錯誤] 找不到檔案: ${inputJsonFilename}`);
    console.error('請確認 Colab 4 (Step 2.1) 是否已執行並產生檔案。');
    throw new Error(`找不到檔案: ${inputJsonFilename}`);
  }

  try {
    // --- [Step A] 讀取資料 ---
    console.log('\n🚀 [Step A] 讀取直線性資料 (Straightened Data)...');
    const L_topology = taipei2_1Layer.spaceNetworkGridJsonData;
    console.log(`   -> 讀取 ${L_topology.length} 條線段。`);

    // --- [Step B–D] 驗證、交會點碰撞偵測、示意化（與 schematizeStraightenedNetwork 相同） ---
    console.log('\n🚀 [Step B] 驗證 nodes 完整性...');
    console.log('\n🚀 [Step C] 偵測交會點與網格碰撞...');
    const { strokes: S_strokes, connectNodesCount, frozenNodesCount } = schematizeStraightenedNetwork(
      L_topology,
      GRID_SIZE
    );
    console.log(`   -> 識別出 ${connectNodesCount} 個交會點 (Connect Nodes)。`);
    if (frozenNodesCount > 0) {
      console.log(`   -> ⚠️ 發現 ${frozenNodesCount} 個節點發生網格碰撞，將強制鎖定位置 (Frozen)。`);
    }

    console.log(`\n🚀 [Step D] 執行示意化 (Grid Size = ${GRID_SIZE})...`);
    console.log(`   -> 完成 ${S_strokes.length} 條線段的網格吸附運算。`);

    // --- [Step E] 儲存檔案 ---
    console.log('\n🚀 [Step E] 儲存 Schematized JSON...');
    if (!taipei2_2Layer) {
      throw new Error('找不到 taipei_2_2 圖層');
    }

    taipei2_2Layer.spaceNetworkGridJsonData = S_strokes;
    console.log(`✅ 資料已傳給 taipei_2_2 圖層`);

    // --- [Step F] 繪製對照圖 ---
    console.log('\n🚀 [Step F] 產生對照圖 (Input vs Output)...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    plotRoadData(null, L_topology, '1. Straightened (Input)');
    plotRoadData(null, S_strokes, `2. Schematized (Output, Grid ${GRID_SIZE})`);

    // 自動開啟 taipei_2_2 圖層以便查看結果
    if (!taipei2_2Layer.visible) {
      taipei2_2Layer.visible = true;
      dataStore.saveLayerState('taipei_2_2', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      inputSegments: L_topology.length,
      outputSegments: S_strokes.length,
      gridSize: GRID_SIZE,
      connectNodesCount,
      frozenNodesCount,
      processedSegments: S_strokes.filter((s) => s.processed !== false).length,
    };

    taipei2_2Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
