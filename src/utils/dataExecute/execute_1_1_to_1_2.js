// # @title Colab 1-2: 網格壓縮
// ==============================================================================
// 📝 程式說明：
// 1. 讀取 Step 2 產生的 Normalize JSON (Raw Grid)。
// 2. 執行「坐標壓縮 (Coordinate Compression)」：
//    消除網格中的空隙，將稀疏的座標映射為連續的整數索引 (0, 1, 2...)。
// 3. 更新所有線段 (Segments) 與站點屬性中的 Grid 座標。
// 4. 再次執行防呆檢查，確保 `nodes` 列表已從屬性中移除，保持檔案輕量。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';

// ==========================================
// 3. 輔助函式定義
// ==========================================
/**
 * 從屬性中提取顏色，若無則預設為藍色
 * @param {Object} props - 屬性物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getColorFromProps(props) {
  const tags = props?.tags || {};
  return tags.colour || tags.color || '#2c7bb6';
}

/**
 * 繪製 Normalize JSON 格式的資料
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} data - Segments 資料
 * @param {string} title - 圖表標題
 */
// eslint-disable-next-line no-unused-vars
function plotNormalizeFormat(ax, data, title) {
  // 在 JavaScript 環境中，此功能由前端組件處理
  console.log(`[視覺化] ${title}`);
}

/**
 * 繪製壓縮前後的對照圖
 * @param {Array} rawData - 壓縮前的資料
 * @param {Array} compressedData - 壓縮後的資料
 * @param {Array<number>} rawDims - 原始尺寸 [width, height]
 * @param {Array<number>} compDims - 壓縮後尺寸 [width, height]
 */
// eslint-disable-next-line no-unused-vars
function plotComparison(rawData, compressedData, rawDims, compDims) {
  // 在 JavaScript 環境中，此功能由前端組件處理
  console.log(
    `[視覺化] 對照圖: Before (${rawDims[0]} x ${rawDims[1]}) vs After (${compDims[0]} x ${compDims[1]})`
  );
}

// ==========================================
// 4. 主執行流程
// ==========================================
// eslint-disable-next-line no-unused-vars
export function execute_1_1_to_1_2(_jsonData) {
  const dataStore = useDataStore();
  const taipei1_1Layer = dataStore.findLayerById('taipei_1_1');
  const taipei1_2Layer = dataStore.findLayerById('taipei_1_2');

  // ==========================================
  // 2. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 2 的 Normalize JSON (未壓縮的原始網格)
  const inputJsonFilename = taipei1_1Layer ? 'taipei_1_1 (in-memory)' : 'taipei_1_1';
  // 輸出：Step 3 的 Normalize JSON (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案 (Raw JSON): 從 taipei_1_1 圖層讀取`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_1_2 圖層`);
  console.log('='.repeat(60));

  if (!taipei1_1Layer || !taipei1_1Layer.spaceNetworkGridJsonData) {
    console.error(`❌ [錯誤] 找不到檔案: ${inputJsonFilename}，請先確認 Colab 2 是否執行成功。`);
    throw new Error(`找不到檔案: ${inputJsonFilename}，請先確認 Colab 2 是否執行成功。`);
  }

  try {
    // --- [Step A] 讀取資料 ---
    console.log('\n🚀 [Step A] 讀取 Normalize JSON 資料...');
    const rawSegments = taipei1_1Layer.spaceNetworkGridJsonData;

    if (!Array.isArray(rawSegments)) {
      throw new Error('[錯誤] 輸入數據格式錯誤，應為 Normalize Segments 陣列格式');
    }

    console.log(`   -> 成功讀取 ${rawSegments.length} 個線段 (Segments)。`);

    // --- [Step B] 計算座標壓縮映射 (Mapping) ---
    console.log('\n🚀 [Step B] 分析座標並計算壓縮映射...');
    const usedX = new Set();
    const usedY = new Set();

    // 收集所有出現過的 X 與 Y 座標
    for (const seg of rawSegments) {
      for (const p of seg.points || []) {
        usedX.add(Math.floor(p[0]));
        usedY.add(Math.floor(p[1]));
      }
    }

    // 排序並建立映射表 (Old Value -> New Index)
    const sortedX = Array.from(usedX).sort((a, b) => a - b);
    const sortedY = Array.from(usedY).sort((a, b) => a - b);

    const mapX = {};
    const mapY = {};
    sortedX.forEach((val, i) => {
      mapX[val] = i;
    });
    sortedY.forEach((val, i) => {
      mapY[val] = i;
    });

    // 記錄原始跨度與壓縮後大小
    const minX = Math.min(...usedX);
    const maxX = Math.max(...usedX);
    const minY = Math.min(...usedY);
    const maxY = Math.max(...usedY);
    const rawSpanX = maxX - minX + 1;
    const rawSpanY = maxY - minY + 1;

    console.log(
      `   -> X 軸壓縮: 原始跨度 ${rawSpanX} -> 壓縮後 ${sortedX.length} (減少 ${rawSpanX - sortedX.length} 格)`
    );
    console.log(
      `   -> Y 軸壓縮: 原始跨度 ${rawSpanY} -> 壓縮後 ${sortedY.length} (減少 ${rawSpanY - sortedY.length} 格)`
    );

    // --- [Step C] 套用壓縮並生成新資料 ---
    console.log('\n🚀 [Step C] 套用壓縮映射並更新屬性...');
    const compressedSegments = [];

    for (const seg of rawSegments) {
      // 深層複製以避免修改原始資料
      const newSeg = JSON.parse(JSON.stringify(seg));

      // [防呆] 再次確保 way_properties 中沒有 'nodes'
      if (newSeg.way_properties) {
        delete newSeg.way_properties.nodes;
      }

      // 1. 更新幾何點位 (points)
      const newPoints = [];
      for (const p of seg.points || []) {
        const nx = mapX[Math.floor(p[0])];
        const ny = mapY[Math.floor(p[1])];
        newPoints.push([nx, ny]);
      }
      newSeg.points = newPoints;

      // 2. 更新站點屬性中的 Grid 資訊 (properties_start)
      if (newSeg.properties_start) {
        const sx = mapX[Math.floor(newSeg.properties_start.x_grid)];
        const sy = mapY[Math.floor(newSeg.properties_start.y_grid)];
        newSeg.properties_start.x_grid = sx;
        newSeg.properties_start.y_grid = sy;
      }

      // 3. 更新站點屬性中的 Grid 資訊 (properties_end)
      if (newSeg.properties_end) {
        const ex = mapX[Math.floor(newSeg.properties_end.x_grid)];
        const ey = mapY[Math.floor(newSeg.properties_end.y_grid)];
        newSeg.properties_end.x_grid = ex;
        newSeg.properties_end.y_grid = ey;
      }

      compressedSegments.push(newSeg);
    }

    console.log(`   -> 轉換完成，共生成 ${compressedSegments.length} 個已壓縮線段。`);

    // --- [Step D] 儲存檔案 ---
    console.log('\n🚀 [Step D] 儲存 JSON 檔案...');
    if (!taipei1_2Layer) {
      throw new Error('找不到 taipei_1_2 圖層');
    }

    taipei1_2Layer.spaceNetworkGridJsonData = compressedSegments;
    console.log(`✅ 資料已傳給 taipei_1_2 圖層`);

    // --- [Step E] 視覺化對照 ---
    console.log('\n🚀 [Step E] 產生壓縮前後對照圖...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    const rawDims = [rawSpanX, rawSpanY];
    const compDims = [sortedX.length, sortedY.length];
    plotComparison(rawSegments, compressedSegments, rawDims, compDims);

    // 自動開啟 taipei_1_2 圖層以便查看結果
    if (!taipei1_2Layer.visible) {
      taipei1_2Layer.visible = true;
      dataStore.saveLayerState('taipei_1_2', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      segmentCount: compressedSegments.length,
      originalSpan: {
        x: rawSpanX,
        y: rawSpanY,
      },
      compressedSize: {
        x: sortedX.length,
        y: sortedY.length,
      },
      originalRange: {
        x: { min: minX, max: maxX },
        y: { min: minY, max: maxY },
      },
      removedEmptyRows: rawSpanX - sortedX.length,
      removedEmptyCols: rawSpanY - sortedY.length,
    };

    taipei1_2Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}
