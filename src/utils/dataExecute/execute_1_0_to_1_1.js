// # @title Colab 1-1: 路線直線化
// ==============================================================================
// 📝 程式說明：
// 1. 計算最佳網格大小 (Grid Unit)：基於所有站點間的最小距離。
// 2. 座標轉換：將經緯度「吸附 (Snap)」至整數網格索引 (Grid X, Grid Y)。
// 3. 線段切分：將 LineString 切碎為 Segments (A->B)，便於後續路徑搜尋。
// 4. 資料優化：從輸出的 `way_properties` 中移除龐大的 `nodes` 列表以縮減體積。
// ==============================================================================

import { useDataStore } from '@/stores/dataStore.js';
import { findNearestTwoPoints } from './helpers.js';

// ==========================================
// 3. 輔助函式定義
// ==========================================
/**
 * 找出點集合中距離最近的兩個點。
 * 用途：決定網格的最小單位 (Grid Unit)，防止不同站點被合併到同一格。
 * 回傳：(Point1, Point2, Distance)
 * @param {Array<Array<number>>} points - 點座標陣列 [[lon, lat], ...]
 * @returns {Object} {point1, point2, minDistance}
 */
function findNearestTwoPointsLocal(points) {
  const { point1, point2, minDistance } = findNearestTwoPoints(points);
  return { point1, point2, minDistance };
}

/**
 * 從屬性提取顏色，預設藍色
 * @param {Object} props - 屬性物件
 * @returns {string} 顏色字串
 */
// eslint-disable-next-line no-unused-vars
function getColorFromProps(props) {
  const tags = props?.tags || {};
  return tags.colour || tags.color || '#2c7bb6';
}

// ==========================================
// 4. 主執行流程
// ==========================================
export function execute_1_0_to_1_1(jsonData) {
  const dataStore = useDataStore();
  const taipei1_1Layer = dataStore.findLayerById('taipei_1_1');

  // ==========================================
  // 2. 檔案路徑與全域設定
  // ==========================================
  // 輸入：Step 1 產生的 GeoJSON (已透過參數傳入)
  // 輸出：標準化後的 JSON (已直接傳給下一個圖層)

  console.log('='.repeat(60));
  console.log('📂 [設定] 檔案路徑配置');
  console.log(`   - 輸入檔案 (GeoJSON): 已透過參數傳入`);
  console.log(`   - 輸出資料: 已直接傳給 taipei_1_1 圖層`);
  console.log('='.repeat(60));

  if (!jsonData || !jsonData.features || !Array.isArray(jsonData.features)) {
    console.error('❌ [錯誤] 輸入資料格式錯誤，應為有效的 GeoJSON 格式。');
    throw new Error('輸入資料格式錯誤，應為有效的 GeoJSON 格式。');
  }

  try {
    // --- [Step A] 讀取與分類 GeoJSON ---
    console.log('\n🚀 [Step A] 讀取並解析 GeoJSON 資料...');
    const geojsonData = jsonData;

    const stationsData = []; // 用於計算數學距離
    const stationFeaturesMap = {}; // ID 對應完整 Feature
    const lineFeatures = []; // 路線 Feature

    for (const feature of geojsonData.features || []) {
      const geom = feature.geometry || {};
      const props = feature.properties || {};

      if (geom.type === 'Point') {
        const [lon, lat] = geom.coordinates;
        const sId = props.id;
        stationsData.push({ id: sId, lon: parseFloat(lon), lat: parseFloat(lat) });
        stationFeaturesMap[sId] = feature;
      } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
        lineFeatures.push(feature);
      }
    }

    if (stationsData.length < 2) {
      console.error('❌ [錯誤] 站點數量不足 (少於 2 個)，無法計算網格。');
      throw new Error('站點數量不足 (少於 2 個)，無法計算網格。');
    }

    console.log(`   -> 讀取完成：${stationsData.length} 個站點, ${lineFeatures.length} 條路線。`);

    // --- [Step B] 計算網格單元 (Grid Unit) ---
    console.log('\n🚀 [Step B] 計算最佳網格尺寸 (Grid Unit)...');
    const pointsNp = stationsData.map((s) => [s.lon, s.lat]);

    // 邊界計算
    const minLon = Math.min(...pointsNp.map((p) => p[0]));
    const maxLon = Math.max(...pointsNp.map((p) => p[0]));
    const minLat = Math.min(...pointsNp.map((p) => p[1]));
    const maxLat = Math.max(...pointsNp.map((p) => p[1]));

    // 找最近兩點距離作為基礎單位
    const { point1: p1, point2: p2, minDistance: minDist } = findNearestTwoPointsLocal(pointsNp);
    let gridUnit = Math.max(Math.abs(p1[0] - p2[0]), Math.abs(p1[1] - p2[1]));
    if (gridUnit === 0) gridUnit = 0.0001; // 防呆

    // 預估網格寬高
    const estW = Math.floor((maxLon - minLon) / gridUnit) + 1;
    const estH = Math.floor((maxLat - minLat) / gridUnit) + 1;

    console.log(`   -> 最近兩點距離 (Grid Unit): ${gridUnit.toFixed(6)} 度`);
    console.log(`   -> 預估網格大小: ${estW} (W) x ${estH} (H)`);

    // --- [Step C] 執行網格吸附 (Snapping) ---
    console.log('\n🚀 [Step C] 執行網格吸附與資料轉換...');

    // 1. 建立站點座標查找表 (Lon/Lat -> Grid X/Y)
    const stationLookup = {};
    for (const s of stationsData) {
      // 座標正規化公式：(Val - Min) / Unit -> Int
      const rawX = Math.floor((s.lon - minLon) / gridUnit);
      const rawY = Math.floor((s.lat - minLat) / gridUnit);

      const originalFeat = stationFeaturesMap[s.id];
      const newProps = JSON.parse(JSON.stringify(originalFeat.properties || {}));
      newProps.x_grid = rawX;
      newProps.y_grid = rawY;

      stationLookup[s.id] = {
        coords: [rawX, rawY],
        properties: newProps,
      };
    }

    // 2. 處理路線與切分 Segments
    const outputSegments = [];
    for (const line of lineFeatures) {
      const nodeIds = line.properties?.nodes || [];

      // [重要] 移除 nodes 屬性以減少 JSON 體積
      const wayProps = JSON.parse(JSON.stringify(line.properties || {}));
      delete wayProps.nodes;

      const routeName = wayProps.tags?.route_name || 'unknown';

      // 依序找出該路線經過的網格點
      const pathNodes = [];
      for (const nid of nodeIds) {
        if (nid in stationLookup) {
          const nodeData = stationLookup[nid];
          // 去除連續重複點 (A -> A)
          if (
            !pathNodes.length ||
            pathNodes[pathNodes.length - 1].coords[0] !== nodeData.coords[0] ||
            pathNodes[pathNodes.length - 1].coords[1] !== nodeData.coords[1]
          ) {
            pathNodes.push(nodeData);
          }
        }
      }

      // 生成 Segments (每兩點一組)
      if (pathNodes.length >= 2) {
        for (let i = 0; i < pathNodes.length - 1; i++) {
          const startNode = pathNodes[i];
          const endNode = pathNodes[i + 1];

          outputSegments.push({
            name: routeName,
            processed: false,
            points: [startNode.coords, endNode.coords],
            properties_start: startNode.properties,
            properties_end: endNode.properties,
            way_properties: wayProps,
          });
        }
      }
    }

    console.log(`   -> 轉換完成，共生成 ${outputSegments.length} 個線段 (Segments)。`);

    // --- [Step D] 輸出 JSON ---
    console.log('\n🚀 [Step D] 儲存 Normalize JSON 檔案...');
    if (!taipei1_1Layer) {
      throw new Error('找不到 taipei_1_1 圖層');
    }

    taipei1_1Layer.spaceNetworkGridJsonData = outputSegments;
    console.log(`✅ 資料已傳給 taipei_1_1 圖層`);

    // --- [Step E] 視覺化對照 ---
    console.log('\n🚀 [Step E] 產生對照圖 (GeoJSON vs Grid)...');
    // Note: 在 JavaScript 環境中，繪圖功能由前端 d3jsmap 組件處理
    console.log(`   - Before: GeoJSON (Lat/Lon)`);
    console.log(`   - After: Raw Grid (${estW} x ${estH})`);

    // 自動開啟 taipei_1_1 圖層以便查看結果
    if (!taipei1_1Layer.visible) {
      taipei1_1Layer.visible = true;
      dataStore.saveLayerState('taipei_1_1', { visible: true });
    }

    // 產生摘要並存到 dashboardData
    const dashboardData = {
      stationCount: stationsData.length,
      segmentCount: outputSegments.length,
      gridUnit: parseFloat(gridUnit.toFixed(6)),
      gridSize: {
        width: estW,
        height: estH,
      },
      bounds: {
        minLon: parseFloat(minLon.toFixed(6)),
        maxLon: parseFloat(maxLon.toFixed(6)),
        minLat: parseFloat(minLat.toFixed(6)),
        maxLat: parseFloat(maxLat.toFixed(6)),
      },
      nearestDistance: parseFloat(minDist.toFixed(6)),
    };

    taipei1_1Layer.dashboardData = dashboardData;
  } catch (error) {
    console.error(`\n❌ [例外狀況] 執行過程中發生錯誤：${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

// ==========================================
// 5. 輔助函式：視覺化
// ==========================================
// Note: 在 JavaScript 環境中，視覺化功能由前端組件處理
// 以下函式保留作為參考，實際繪圖由前端組件執行

/**
 * (左圖) 繪製原始地理座標
 * @param {Object} ax - 繪圖軸物件 (前端組件中處理)
 * @param {Array} features - GeoJSON features
 * @param {string} title - 圖表標題
 */
// eslint-disable-next-line no-unused-vars
function plotGeojsonLayer(ax, features, title) {
  // 在 JavaScript 環境中，此功能由前端組件處理
  console.log(`[視覺化] ${title}`);
}

/**
 * (右圖) 繪製網格化後的 Segments
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
 * 繪製左右對照圖
 * @param {Array} originalFeatures - 原始 GeoJSON features
 * @param {Array} outputSegments - 輸出 Segments
 * @param {number} w - 網格寬度
 * @param {number} h - 網格高度
 */
// eslint-disable-next-line no-unused-vars
function plotComparison(originalFeatures, outputSegments, w, h) {
  // 在 JavaScript 環境中，此功能由前端組件處理
  console.log(`[視覺化] 對照圖: Before vs After (${w} x ${h})`);
}
