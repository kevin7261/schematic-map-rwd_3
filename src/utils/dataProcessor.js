import {
  isMapDrawnRoutesExportArray,
  mapDrawnExportRowsToFlatSegments,
  simplifyTaipeiNetworkSegmentsInRoutes,
} from './mapDrawnRoutesImport.js';
import {
  applyMrtTrafficVolumesToTaipeiRoutes,
  applyOutgoingTrafficWeightsToMapDrawnExportJson,
  buildTaipeiFDataTableRowsLikeSplitOutput,
  taipeiFSpaceNetworkDataToRoutesForDataTable,
} from './randomConnectSegmentWeights.js';
import { buildTaipeiK3JunctionDataTableRows } from './taipeiK3JunctionDataTable.js';
import { buildTaipeiL3JunctionDataTableRows } from './taipeiL3JunctionDataTable.js';
import { isTaipeiTestStraighteningLayerId } from './taipeiTestStraighteningLayerIds.js';
import {
  isTaipeiTestFghiLayerId,
  isTaipeiTestHLayerTab,
  isTaipeiTestILayerTab,
} from './taipeiTestPipeline.js';
import {
  getGeoJsonFeatureTagProps,
  getGeoJsonRouteStableId,
  isGeoJsonWayLineFeature,
} from './geojsonRouteHelpers.js';
import { osmXmlStringToGeoJsonFeatureCollection } from './osmXmlToGeoJson.js';
import { exportRouteSegmentsFromGeoJson } from './geojsonExportRouteSegments.js';

/**
 * 📊 數據處理核心模組 (Data Processing Core Module)
 *
 * 這是一個專為 Schematic Map 3 設計的數據處理核心模組，負責處理各種格式的地理空間數據，
 * 並將其轉換為適合前端視覺化組件使用的標準化格式。該模組是整個系統的數據處理中心，
 * 確保數據的完整性、一致性和可用性。
 *
 * 🎯 主要功能 (Core Features):
 * 1. 📁 JSON 檔案載入：支援多種 JSON 格式的地理空間數據載入
 *    - 網格示意圖數據：包含 x, y 座標的網格節點數據
 *    - 行政區示意圖數據：包含節點和連線的複雜網絡數據
 *    - 一般地理數據：標準的 GeoJSON 或自定義格式數據
 * 2. 📋 數據預處理：將原始數據轉換為標準化格式
 *    - 數據驗證和清理：確保數據完整性和正確性
 *    - 格式標準化：統一不同來源的數據格式
 *    - 數據增強：添加必要的計算屬性和元數據
 * 3. 📊 統計摘要生成：自動計算並生成數據統計信息
 *    - 節點數量統計：計算總節點數、可見節點數等
 *    - 空間範圍計算：計算數據的地理邊界和範圍
 *    - 數據品質指標：評估數據的完整性和準確性
 * 4. 📈 表格數據建構：生成適合表格組件顯示的數據結構
 *    - 可排序的數據列：支援按不同屬性排序
 *    - 可篩選的數據行：支援條件篩選和搜索
 *    - 分頁支援：處理大量數據的分頁顯示
 *
 * 🔧 技術特點 (Technical Features):
 * - 異步數據載入：使用 Promise 和 async/await 處理異步操作
 * - 錯誤處理機制：完整的錯誤捕獲和恢復機制
 * - 記憶體優化：高效的數據結構和垃圾回收
 * - 模組化設計：可重用的函數和組件
 * - 類型安全：完整的 JSDoc 類型註解
 *
 * 📊 支援的數據格式 (Supported Data Formats):
 * - JSON 網格數據：包含 x, y 尺寸參數的網格配置
 * - JSON 節點數據：包含節點座標、屬性、連線的網絡數據
 * - JSON 行政區數據：包含行政區邊界和屬性的地理數據
 * - 自定義格式：可擴展支援其他數據格式
 *
 * 🏗️ 架構設計 (Architecture Design):
 * - 單一職責原則：每個函數只負責一個特定功能
 * - 開放封閉原則：易於擴展新功能，無需修改現有代碼
 * - 依賴反轉原則：依賴抽象而非具體實現
 * - 介面隔離原則：提供最小化的必要介面
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 載入網格示意圖數據
 * const gridData = await loadGridSchematicJson({
 *   jsonFileName: 'test/test.json'
 * });
 *
 * // 載入行政區示意圖數據
 * const layerData = await loadDataLayerJson({
 *   jsonFileName: 'taipei/taipei_schematic.json'
 * });
 * ```
 *
 * 🔄 數據流程 (Data Flow):
 * 1. 接收圖層配置對象
 * 2. 根據配置選擇適當的載入函數
 * 3. 從指定路徑載入 JSON 數據
 * 4. 驗證數據格式和完整性
 * 5. 執行數據預處理和轉換
 * 6. 生成統計摘要和表格數據
 * 7. 返回標準化的數據對象
 *
 * ⚠️ 注意事項 (Important Notes):
 * - 所有數據載入操作都是異步的，需要使用 await 或 .then()
 * - 載入失敗時會拋出錯誤，需要適當的錯誤處理
 * - 大型數據集可能需要較長的載入時間
 * - 建議在載入過程中顯示進度指示器
 *
 * @file dataProcessor.js
 * @version 3.0.0
 * @author Kevin Cheng
 * @since 1.0.0
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API} Fetch API 文檔
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise} Promise 文檔
 */

// ==================== ⚙️ 配置常數 (Configuration Constants) ====================

/**
 * 📁 檔案路徑配置 (File Path Configuration)
 *
 * 定義應用程式在不同環境下的數據文件路徑配置。這個配置對象確保了應用程式
 * 在開發環境和生產環境中都能正確載入數據文件，並提供了備用路徑機制以增強
 * 系統的穩定性和容錯能力。
 *
 * 🎯 設計目標 (Design Goals):
 * - 環境適應性：自動適應開發和生產環境的不同路徑需求
 * - 容錯機制：提供備用路徑，確保數據載入的穩定性
 * - 維護性：集中管理路徑配置，便於後續維護和更新
 * - 擴展性：易於添加新的路徑配置和環境支援
 *
 * 🔧 路徑策略 (Path Strategy):
 * - 生產環境：使用 GitHub Pages 的完整路徑，包含專案名稱
 * - 開發環境：使用相對路徑，便於本地開發和測試
 * - 備用路徑：當主要路徑失敗時，自動嘗試備用路徑
 * - 動態檢測：根據當前環境自動選擇適當的路徑
 *
 * 📊 路徑說明 (Path Descriptions):
 * - JSON: 主要數據文件路徑，用於生產環境部署
 * - FALLBACK_JSON: 備用數據文件路徑，用於開發環境或主要路徑失敗時
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 載入數據文件
 * const response = await loadFile(
 *   `${PATH_CONFIG.JSON}/${fileName}`,
 *   `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`
 * );
 * ```
 *
 * ⚠️ 注意事項 (Important Notes):
 * - 路徑配置需要與實際的文件結構保持一致
 * - 修改路徑配置後需要重新建置應用程式
 * - 確保所有環境都有對應的數據文件
 *
 * @type {Object}
 * @property {string} JSON - 主要 JSON 文件路徑（生產環境）
 * @property {string} FALLBACK_JSON - 備用 JSON 文件路徑（開發環境）
 * @since 1.0.0
 */
const PATH_CONFIG = {
  /**
   * JSON 文件路徑 - 生產環境
   * 用於 GitHub Pages 部署的完整路徑，包含專案名稱
   * 格式：/schematic-map-rwd_3/data
   */
  JSON: '/schematic-map-rwd_3/data',

  /**
   * 備用 JSON 路徑 - 開發環境
   * 用於本地開發環境的相對路徑
   * 格式：/data
   */
  FALLBACK_JSON: '/data',
};

// ==================== 🔧 輔助函數 (Helper Functions) ====================

/**
 * 📁 通用檔案載入函數 (Generic File Loading Function)
 *
 * 這是一個高級檔案載入函數，提供了完整的容錯機制和詳細的錯誤處理。
 * 它支援主要路徑和備用路徑的檔案載入，確保在各種環境下都能成功載入數據文件。
 * 該函數是整個數據載入系統的核心，為上層函數提供了穩定可靠的檔案載入服務。
 *
 * 🎯 核心功能 (Core Features):
 * - 雙路徑載入：支援主要路徑和備用路徑的檔案載入
 * - 自動容錯：主要路徑失敗時自動嘗試備用路徑
 * - 詳細日誌：提供完整的載入過程日誌記錄
 * - 錯誤處理：完整的錯誤捕獲和錯誤信息提供
 * - 狀態追蹤：實時追蹤載入狀態和進度
 *
 * 🔧 技術實現 (Technical Implementation):
 * - 使用 Fetch API 進行異步檔案載入
 * - 支援 HTTP 狀態碼檢查和錯誤處理
 * - 提供詳細的錯誤信息和調試日誌
 * - 支援 Promise 鏈式調用和 async/await 語法
 *
 * 📊 載入流程 (Loading Process):
 * 1. 驗證輸入參數的有效性
 * 2. 嘗試從主要路徑載入檔案
 * 3. 檢查 HTTP 響應狀態
 * 4. 如果主要路徑失敗，嘗試備用路徑
 * 5. 記錄載入過程和結果
 * 6. 返回響應對象或拋出錯誤
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 基本用法 - 只使用主要路徑
 * try {
 *   const response = await loadFile('/data/example.json');
 *   const data = await response.json();
 *   console.log('數據載入成功:', data);
 * } catch (error) {
 *   console.error('載入失敗:', error.message);
 * }
 *
 * // 進階用法 - 使用備用路徑
 * try {
 *   const response = await loadFile(
 *     '/schematic-map-rwd_3/data/taipei.json',
 *     '/data/taipei.json'
 *   );
 *   const data = await response.json();
 *   console.log('數據載入成功:', data);
 * } catch (error) {
 *   console.error('所有路徑都載入失敗:', error.message);
 * }
 * ```
 *
 * ⚠️ 錯誤處理 (Error Handling):
 * - 網路錯誤：網路連接問題或伺服器無響應
 * - HTTP 錯誤：4xx 或 5xx 狀態碼
 * - 檔案不存在：404 錯誤
 * - 權限問題：403 錯誤
 * - 所有路徑失敗：主要路徑和備用路徑都無法載入
 *
 * 🔍 調試信息 (Debug Information):
 * - 載入開始：記錄嘗試載入的檔案路徑
 * - 載入成功：記錄成功載入的檔案路徑
 * - 載入失敗：記錄失敗原因和錯誤信息
 * - 路徑切換：記錄從主要路徑切換到備用路徑
 *
 * @param {string} primaryPath - 主要檔案路徑，優先嘗試載入此路徑
 * @param {string} [fallbackPath=null] - 備用檔案路徑，主要路徑失敗時使用
 * @returns {Promise<Response>} - 成功載入的檔案響應物件
 * @throws {Error} - 當所有路徑都無法載入時拋出詳細錯誤信息
 *
 * @example
 * // 載入 JSON 檔案
 * const response = await loadFile('/data/example.json');
 * const data = await response.json();
 *
 * // 載入帶備用路徑的檔案
 * const response = await loadFile('/data/file.json', '/fallback/file.json');
 *
 * @since 1.0.0
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API} Fetch API 文檔
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Response} Response 文檔
 */
async function loadFile(primaryPath, fallbackPath = null) {
  try {
    // 嘗試載入主要路徑
    const response = await fetch(primaryPath);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    console.warn(`⚠️ 主要路徑載入失敗: ${primaryPath}`, error.message);

    // 如果有備用路徑，嘗試載入備用路徑
    if (fallbackPath) {
      try {
        const fallbackResponse = await fetch(fallbackPath);

        if (!fallbackResponse.ok) {
          throw new Error(`HTTP ${fallbackResponse.status}: ${fallbackResponse.statusText}`);
        }

        return fallbackResponse;
      } catch (fallbackError) {
        console.error(`❌ 備用路徑也載入失敗: ${fallbackPath}`, fallbackError.message);
        throw new Error(
          `無法載入檔案。主要路徑: ${primaryPath}, 備用路徑: ${fallbackPath}。錯誤: ${error.message}`
        );
      }
    }

    // 沒有備用路徑或備用路徑也失敗
    throw new Error(`無法載入檔案: ${primaryPath}。錯誤: ${error.message}`);
  }
}

/**
 * 解析捷運連結流量 CSV（表頭：站點A,站點B,總人次）
 * @param {string} text
 * @returns {Array<{ 站點A: string, 站點B: string, 總人次: number }>}
 */
function parseMrtLinkVolumeCsvLines(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  const idxA = header.findIndex((h) => h.trim() === '站點A');
  const idxB = header.findIndex((h) => h.trim() === '站點B');
  const idxV = header.findIndex((h) => h.trim() === '總人次');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;
    const row = {
      站點A: (parts[idxA >= 0 ? idxA : 0] ?? '').trim(),
      站點B: (parts[idxB >= 0 ? idxB : 1] ?? '').trim(),
      總人次: Number(parts[idxV >= 0 ? idxV : 2]),
    };
    if (row['站點A'] && row['站點B'] && Number.isFinite(row['總人次'])) rows.push(row);
  }
  return rows;
}

/**
 * taipei_h／taipei_i：讀取 `csvFileName_traffic` → `trafficData`（含檔名、列資料）
 * @param {{ csvFileName_traffic?: string }} layer
 * @returns {Promise<{ trafficData: { csvFileName: string, rows: Array, rowCount: number } | null }>}
 */
export async function loadCsvTrafficForLayer(layer) {
  const fileName = layer?.csvFileName_traffic;
  if (!fileName) return { trafficData: null };
  const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
  const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
  const response = await loadFile(dataPath, fallbackPath);
  const text = await response.text();
  const rows = parseMrtLinkVolumeCsvLines(text);
  return {
    trafficData: {
      csvFileName: fileName,
      rows,
      rowCount: rows.length,
    },
  };
}

// ==================== 主要函數 ====================

/**
 * 📊 載入數據圖層 JSON 資料 (Load Data Layer JSON Data)
 *
 * 這是一個專門用於載入數據圖層 JSON 資料的函數，主要處理包含節點和連線信息的
 * 複雜地理空間數據。該函數支援多種數據格式，包括示意圖節點數據和標準地理數據，
 * 並提供完整的數據預處理和格式轉換功能。
 *
 * 🎯 主要功能 (Main Features):
 * - 數據圖層載入：從指定路徑載入 JSON 格式的數據圖層
 * - 格式識別：自動識別數據格式（示意圖節點或標準地理數據）
 * - 數據預處理：執行必要的數據清理和格式轉換
 * - 統計計算：生成數據統計摘要和表格數據
 * - 錯誤處理：提供完整的錯誤捕獲和恢復機制
 *
 * 🔧 支援的數據格式 (Supported Data Formats):
 * - 示意圖節點數據：包含節點陣列和路線信息的複雜數據結構
 * - 標準地理數據：包含地理要素屬性的標準 JSON 格式
 * - 自定義格式：可擴展支援其他自定義數據格式
 *
 * 📊 數據處理流程 (Data Processing Flow):
 * 1. 接收圖層配置對象，提取 JSON 文件名稱
 * 2. 使用 loadFile 函數載入 JSON 數據文件
 * 3. 解析 JSON 數據並驗證格式
 * 4. 調用 processDataLayerJson 進行數據預處理
 * 5. 返回標準化的數據對象
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 載入台北捷運數據
 * const layer = {
 *   jsonFileName: 'taipei/taipei_schematic.json',
 *   layerName: 'Taipei Metro',
 *   type: 'point'
 * };
 *
 * try {
 *   const result = await loadDataLayerJson(layer);
 *   console.log('數據載入成功:', result.dashboardData);
 *   console.log('表格數據:', result.dataTableData);
 * } catch (error) {
 *   console.error('載入失敗:', error.message);
 * }
 * ```
 *
 * 📈 返回數據結構 (Return Data Structure):
 * ```javascript
 * {
 *   jsonData: Object | null,     // 原始 JSON 數據（不可修改）
 *   processedJsonData: Object | null, // 處理後的 JSON 數據（用於顯示和計算）
 *   dashboardData: Object,         // 統計摘要數據
 *   dataTableData: Array,           // 表格顯示數據
 *   layerInfoData: Object,          // 圖層資訊數據
 * }
 * ```
 *
 * ⚠️ 注意事項 (Important Notes):
 * - 該函數是異步的，需要使用 await 或 .then() 處理
 * - 載入失敗時會拋出錯誤，需要適當的錯誤處理
 * - 大型數據集可能需要較長的載入時間
 * - 建議在載入過程中顯示進度指示器
 *
 * @param {Object} layer - 圖層配置對象，包含載入所需的配置信息
 * @param {string} layer.jsonFileName - JSON 文件名稱，相對於數據目錄
 * @param {string} [layer.layerName] - 圖層名稱，用於日誌記錄
 * @param {string} [layer.type] - 圖層類型，用於數據處理
 * @returns {Promise<Object>} - 包含處理後數據的對象
 * @throws {Error} - 當載入或處理失敗時拋出錯誤
 *
 * @example
 * // 基本用法
 * const layer = { jsonFileName: 'taipei/metro.json' };
 * const data = await loadDataLayerJson(layer);
 *
 * @since 1.0.0
 * @see {@link loadFile} 通用檔案載入函數
 * @see {@link processDataLayerJson} 數據圖層處理函數
 */
export async function loadDataLayerJson(layer) {
  try {
    const fileName = layer.jsonFileName;
    // 數據圖層直接從 /data/ 路徑載入
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const response = await loadFile(dataPath);

    const jsonData = await response.json();

    // 處理數據圖層的特殊邏輯
    return await processDataLayerJson(jsonData);
  } catch (error) {
    console.error('❌ 數據圖層 JSON 數據載入或處理失敗:', error);
    throw error;
  }
}

/**
 * 由路網 GeoJSON FeatureCollection 建立與 loadGeoJsonForRoutes 相同的儀表板／表格欄位。
 * @param {Object} geojson
 * @returns {Object}
 */
export function buildStandardRouteGeoJsonLoadResult(geojson) {
  const routeFeatures = geojson.features.filter(isGeoJsonWayLineFeature);

  const routeMap = new Map();
  routeFeatures.forEach((feature) => {
    const tags = getGeoJsonFeatureTagProps(feature);
    const routeId = getGeoJsonRouteStableId(feature);

    if (!routeMap.has(routeId)) {
      routeMap.set(routeId, {
        '#': routeMap.size + 1,
        route_id: tags.route_id || '-',
        route_name: tags.route_name || '-',
        route_company: tags.route_company || '-',
        color: tags.color || '#666666',
        railway: tags.railway || '-',
        ...tags,
      });
    }
  });

  const dataTableData = Array.from(routeMap.values());

  const dashboardData = {
    totalRoutes: dataTableData.length,
    routeNames: dataTableData.map((route) => route.route_name).filter((name) => name !== '-'),
  };

  const layerInfoData = {
    totalRoutes: dataTableData.length,
    routeNames: dataTableData.map((route) => route.route_name).filter((name) => name !== '-'),
  };

  return {
    jsonData: null,
    processedJsonData: geojson,
    geojsonData: geojson,
    dashboardData,
    dataTableData,
    layerInfoData,
  };
}

/**
 * 📊 載入 GeoJSON 並處理路線數據 (Load GeoJSON and Process Route Data)
 *
 * 從 GeoJSON 文件中提取路線（routes）信息，生成用於表格顯示的數據
 *
 * @param {Object} layer - 圖層配置對象
 * @param {string} layer.geojsonFileName - GeoJSON 文件名稱
 * @returns {Promise<Object>} - 包含處理後數據的對象
 */
export async function loadGeoJsonForRoutes(layer) {
  try {
    const fileName = layer.geojsonFileName;
    const baseUrl = process.env.BASE_URL || '/';
    const dataPath = `${baseUrl}data/${fileName}`;

    // 嘗試多個路徑
    let response;
    try {
      response = await fetch(dataPath);
    } catch (e) {
      // 如果主要路徑失敗，嘗試備用路徑
      const fallbackPath = `/data/${fileName}`;
      response = await fetch(fallbackPath);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const geojson = await response.json();

    return buildStandardRouteGeoJsonLoadResult(geojson);
  } catch (error) {
    console.error('❌ GeoJSON 數據載入或處理失敗:', error);
    throw error;
  }
}

/**
 * 讀取 public/data 下路網來源檔，於瀏覽器轉成路網 GeoJSON，欄位與 loadGeoJsonForRoutes 一致。
 * 圖層 `osm_2_geojson_2_json`：副檔名 `.geojson` 時依 JSON 解析；否則依 OSM XML 解析。
 *
 * @param {Object} layer
 * @param {string} [layer.osmFileName] - 相對於 /data/ 的檔名；未設定或空白時不發請求，回傳空路網
 */
export async function loadOsmXmlAsGeoJsonForRoutes(layer) {
  try {
    const fileName = layer?.osmFileName;
    if (!fileName || String(fileName).trim() === '') {
      const emptyFc = { type: 'FeatureCollection', features: [] };
      if (layer?.layerId === 'osm_2_geojson_2_json') {
        const base = buildStandardRouteGeoJsonLoadResult(emptyFc);
        const routeExportRows = exportRouteSegmentsFromGeoJson(emptyFc, {
          insertStationsOntoLinesByProximity: false,
        });
        return {
          ...base,
          jsonData: routeExportRows,
          processedJsonData: null,
          sourceOsmXmlText: '',
        };
      }
      return {
        ...buildStandardRouteGeoJsonLoadResult(emptyFc),
        sourceOsmXmlText: undefined,
      };
    }
    const baseUrl = process.env.BASE_URL || '/';
    const dataPath = `${baseUrl}data/${fileName}`;

    let response;
    try {
      response = await fetch(dataPath);
    } catch (e) {
      response = await fetch(`/data/${fileName}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const bodyText = await response.text();
    if (layer?.layerId === 'osm_2_geojson_2_json') {
      const { osmXmlToOsm2GeojsonLoaderResult, parseGeoJsonTextToOsm2GeojsonLoaderResult } =
        await import('@/utils/layers/osm_2_geojson_2_json/index.js');
      const lower = String(fileName).toLowerCase();
      if (lower.endsWith('.geojson')) {
        return parseGeoJsonTextToOsm2GeojsonLoaderResult(bodyText);
      }
      return osmXmlToOsm2GeojsonLoaderResult(bodyText);
    }
    const geojson = osmXmlStringToGeoJsonFeatureCollection(bodyText);
    return {
      ...buildStandardRouteGeoJsonLoadResult(geojson),
      sourceOsmXmlText: bodyText,
    };
  } catch (error) {
    console.error('❌ OSM XML 載入或轉 GeoJSON 失敗:', error);
    throw error;
  }
}

/**
 * 將 OSM XML 字串轉成與 loadOsmXmlAsGeoJsonForRoutes 相同形狀之載入結果（本機選檔時不依賴 /data/ 路徑）。
 *
 * @param {string} xmlString
 * @returns {Object}
 */
export function parseOsmXmlStringToRouteGeoJsonLoadResult(xmlString) {
  const geojson = osmXmlStringToGeoJsonFeatureCollection(xmlString);
  return buildStandardRouteGeoJsonLoadResult(geojson);
}

// 移除了重複的 randomizeNodeValues 函數，因為在 D3jsTab.vue 中有相同的實現

/**
 * 📊 載入網格示意圖 JSON 數據 (Load Grid Schematic JSON Data)
 *
 * 這是一個專門用於載入網格型示意圖數據的高級載入器，能夠根據 JSON 配置文件中的
 * 網格尺寸參數（x, y）動態生成對應的網格節點數據結構。該函數是網格示意圖功能
 * 的核心，為 D3.js 視覺化組件提供標準化的網格數據。
 *
 * 🎯 主要功能 (Main Features):
 * - 網格配置載入：從 JSON 文件讀取網格尺寸參數
 * - 動態網格生成：根據配置參數動態生成網格節點
 * - 數據結構標準化：生成符合視覺化組件要求的數據格式
 * - 統計摘要生成：自動計算網格統計信息和摘要數據
 * - 表格數據建構：生成適合表格顯示的數據結構
 *
 * 🔧 技術特點 (Technical Features):
 * - 異步數據載入：使用 Promise 和 async/await 處理異步操作
 * - 容錯機制：支援主要路徑和備用路徑的數據載入
 * - 動態生成：根據配置參數動態生成網格節點
 * - 數據驗證：確保網格參數的有效性和合理性
 * - 詳細日誌：提供完整的載入過程日誌記錄
 *
 * 📊 網格數據結構 (Grid Data Structure):
 * - 網格節點：包含 x, y 座標、數值、類型等屬性
 * - 網格尺寸：可配置的 x, y 方向節點數量
 * - 節點屬性：包含座標、數值、類型等完整信息
 * - 統計摘要：包含總節點數、網格尺寸等統計信息
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 載入網格示意圖數據
 * const layer = {
 *   jsonFileName: 'test/test.json',
 *   layerName: 'Grid Test',
 *   type: 'grid'
 * };
 *
 * try {
 *   const result = await loadGridSchematicJson(layer);
 *   console.log('網格數據:', result.jsonData);
 *   console.log('摘要數據:', result.dashboardData);
 *   console.log('表格數據:', result.dataTableData);
 * } catch (error) {
 *   console.error('載入失敗:', error.message);
 * }
 * ```
 *
 * 📈 輸入 JSON 格式 (Input JSON Format):
 * ```javascript
 * {
 *   "x": 10,        // 網格 X 方向節點數量
 *   "y": 10         // 網格 Y 方向節點數量
 * }
 * ```
 *
 * 📈 輸出數據結構 (Output Data Structure):
 * ```javascript
 * {
 *   jsonData: {
 *     gridX: number,        // 網格 X 方向節點數量
 *     gridY: number,        // 網格 Y 方向節點數量
 *     nodes: Array,         // 網格節點陣列
 *     type: 'grid'          // 數據類型標識
 *   },
 *   dashboardData: {
 *     totalNodes: number,   // 總節點數量
 *     gridSize: string,     // 網格尺寸描述
 *     gridX: number,        // X 方向節點數量
 *     gridY: number,        // Y 方向節點數量
 *     nodeCount: number     // 節點總數
 *   },
 *   dataTableData: Array,       // 表格顯示數據
 * }
 * ```
 *
 * 🔄 數據處理流程 (Data Processing Flow):
 * 1. 接收圖層配置對象，提取 JSON 文件名稱
 * 2. 使用 loadFile 函數載入 JSON 配置文件
 * 3. 解析 JSON 數據，提取 x, y 網格尺寸參數
 * 4. 驗證網格參數的有效性（確保為正整數）
 * 5. 動態生成網格節點數據結構
 * 6. 計算統計摘要和生成表格數據
 * 7. 返回標準化的網格數據對象
 *
 * ⚠️ 注意事項 (Important Notes):
 * - 該函數是異步的，需要使用 await 或 .then() 處理
 * - 網格尺寸參數必須為正整數
 * - 大型網格可能需要較長的生成時間
 * - 建議在生成過程中顯示進度指示器
 *
 * @param {Object} layer - 圖層配置對象，包含載入所需的配置信息
 * @param {string} layer.jsonFileName - JSON 文件名稱，相對於數據目錄
 * @param {string} [layer.layerName] - 圖層名稱，用於日誌記錄
 * @param {string} [layer.type] - 圖層類型，應為 'grid'
 * @returns {Promise<Object>} - 包含處理後網格數據的對象
 * @throws {Error} - 當載入或處理失敗時拋出錯誤
 *
 * @example
 * // 基本用法
 * const layer = { jsonFileName: 'test/test.json' };
 * const result = await loadGridSchematicJson(layer);
 * console.log(result.gridData); // 網格數據
 * console.log(result.dashboardData); // 摘要數據
 *
 * @since 1.0.0
 * @see {@link loadFile} 通用檔案載入函數
 * @see {@link processGridSchematicJson} 網格示意圖處理函數
 */
export async function loadGridSchematicJson(layer) {
  try {
    // 載入 JSON 檔案
    const response = await loadFile(
      `${PATH_CONFIG.JSON}/${layer.jsonFileName}`,
      `${PATH_CONFIG.FALLBACK_JSON}/${layer.jsonFileName}`
    );

    const jsonData = await response.json();

    // 處理網格示意圖數據
    return await processGridSchematicJson(jsonData);
  } catch (error) {
    console.error('❌ 網格示意圖 JSON 數據載入失敗:', error);
    throw error;
  }
}

/**
 * 📊 處理網格示意圖 JSON 數據 (Process Grid Schematic JSON Data)
 *
 * 這是一個專門用於處理網格示意圖 JSON 數據的核心函數，負責將原始的網格配置
 * 參數轉換為適合 D3.js 視覺化組件使用的標準化數據格式。該函數是網格示意圖
 * 數據處理流程的關鍵環節，確保數據的完整性和一致性。
 *
 * 🎯 主要功能 (Main Features):
 * - 網格參數解析：從 JSON 數據中提取 x, y 網格尺寸參數
 * - 動態網格生成：根據尺寸參數動態生成網格節點陣列
 * - 節點屬性設定：為每個節點設定座標、數值、類型等屬性
 * - 統計摘要計算：計算網格統計信息和摘要數據
 * - 表格數據建構：生成適合表格組件顯示的數據結構
 *
 * 🔧 技術實現 (Technical Implementation):
 * - 雙重迴圈生成：使用嵌套迴圈生成二維網格節點
 * - 隨機數值分配：為每個節點隨機分配 1-5 的數值
 * - 座標計算：根據網格位置計算節點的 x, y 座標
 * - 數據結構標準化：生成符合視覺化要求的標準數據格式
 *
 * 📊 網格生成邏輯 (Grid Generation Logic):
 * - 外層迴圈：遍歷 Y 方向（行）
 * - 內層迴圈：遍歷 X 方向（列）
 * - 節點座標：直接使用迴圈索引作為座標
 * - 節點數值：使用 Math.random() 生成 1-5 的隨機數
 * - 節點類型：預設為 1（可擴展支援多種類型）
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 處理網格配置數據
 * const jsonData = { x: 5, y: 5 };
 * const result = await processGridSchematicJson(jsonData);
 *
 * console.log('網格節點數量:', result.jsonData.nodes.length);
 * console.log('網格尺寸:', result.dashboardData.gridSize);
 * console.log('表格數據:', result.dataTableData);
 * ```
 *
 * 📈 輸入數據格式 (Input Data Format):
 * ```javascript
 * {
 *   "x": 10,        // 網格 X 方向節點數量
 *   "y": 10         // 網格 Y 方向節點數量
 * }
 * ```
 *
 * 📈 輸出數據結構 (Output Data Structure):
 * ```javascript
 * {
 *   jsonData: {
 *     gridX: number,        // 網格 X 方向節點數量
 *     gridY: number,        // 網格 Y 方向節點數量
 *     nodes: [              // 網格節點陣列
 *       {
 *         x: number,        // 節點 X 座標
 *         y: number,        // 節點 Y 座標
 *         value: number,    // 節點數值（1-5）
 *         type: number,     // 節點類型
 *         coord: { x: number, y: number }  // 節點座標對象
 *       }
 *     ],
 *     type: 'grid'          // 數據類型標識
 *   },
 *   dashboardData: {
 *     totalNodes: number,   // 總節點數量
 *     gridSize: string,     // 網格尺寸描述
 *     gridX: number,        // X 方向節點數量
 *     gridY: number,        // Y 方向節點數量
 *     nodeCount: number     // 節點總數
 *   },
 *   dataTableData: [            // 表格顯示數據
 *     {
 *       '#': number,        // 行號
 *       name: string,       // 網格名稱
 *       gridSize: string,   // 網格尺寸描述
 *       totalNodes: number, // 總節點數量
 *       nodes: Array        // 節點陣列
 *     }
 *   ],
 * }
 * ```
 *
 * 🔄 數據處理流程 (Data Processing Flow):
 * 1. 解析網格尺寸參數（x, y）
 * 2. 設定預設值（如果參數無效）
 * 3. 使用雙重迴圈生成網格節點
 * 4. 為每個節點設定座標和屬性
 * 5. 計算統計摘要信息
 * 6. 生成表格顯示數據
 * 7. 返回標準化的數據結構
 *
 * ⚠️ 注意事項 (Important Notes):
 * - 網格尺寸參數會自動設定預設值（10x10）
 * - 節點數值是隨機生成的，每次調用結果不同
 * - 大型網格可能需要較長的生成時間
 * - 生成的節點陣列是扁平化的，不保持二維結構
 *
 * @param {Object} jsonData - 包含網格尺寸參數的 JSON 數據
 * @param {number} [jsonData.x=10] - 網格 X 方向節點數量
 * @param {number} [jsonData.y=10] - 網格 Y 方向節點數量
 * @returns {Object} - 包含處理後網格數據的完整結構
 *
 * @example
 * // 處理網格數據
 * const jsonData = { x: 3, y: 3 };
 * const result = await processGridSchematicJson(jsonData);
 *
 * @since 1.0.0
 * @see {@link loadGridSchematicJson} 網格示意圖載入函數
 */
/**
 * 🎲 生成符合機率分布的隨機數 (Generate Weighted Random Number)
 *
 * 根據指定的權重比例生成隨機數，實現非均勻分布
 * 權重比例：9:8:7:6:5:4:3:2:1:1 (對應數值 0:1:2:3:4:5:6:7:8:9)
 * 數值越高機率越低，數值越低機率越高
 *
 * @returns {number} 0-9 之間的整數，符合指定機率分布
 */
function generateWeightedRandomValue() {
  // 定義權重：9:8:7:6:5:4:3:2:1:1 (總權重 = 46)
  const weights = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1]; // 對應數值 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  // 生成 0 到總權重之間的隨機數
  let random = Math.random() * totalWeight;

  // 根據權重分配確定返回的數值
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return i; // 返回對應的數值 (0, 1, 2, 3, 4, 5, 6, 7, 8, 9)
    }
  }

  // 備用返回（理論上不會執行到這裡）
  return 0;
}

async function processGridSchematicJson(jsonData) {
  // 解析網格尺寸
  const gridX = parseInt(jsonData.x) || 10;
  const gridY = parseInt(jsonData.y) || 10;

  // 生成網格節點數據
  const gridNodes = [];
  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      gridNodes.push({
        x: x,
        y: y,
        value: generateWeightedRandomValue(), // 使用權重隨機生成 1-5 的數值
        type: 1, // 預設節點類型
        coord: { x: x, y: y },
      });
    }
  }

  // 計算 x 排和 y 排的最大值與最小值
  const xRowStats = []; // 每一 x 排的統計數據
  const yRowStats = []; // 每一 y 排的統計數據

  // 計算 x 排統計（垂直方向）
  for (let x = 0; x < gridX; x++) {
    const xRowNodes = gridNodes.filter((node) => node.x === x);
    const values = xRowNodes.map((node) => node.value);
    xRowStats.push({
      row: x,
      min: Math.min(...values),
      max: Math.max(...values),
      sum: values.reduce((sum, val) => sum + val, 0),
      count: values.length,
      avg: (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2),
    });
  }

  // 計算 y 排統計（水平方向）
  for (let y = 0; y < gridY; y++) {
    const yRowNodes = gridNodes.filter((node) => node.y === y);
    const values = yRowNodes.map((node) => node.value);
    yRowStats.push({
      row: y,
      min: Math.min(...values),
      max: Math.max(...values),
      sum: values.reduce((sum, val) => sum + val, 0),
      count: values.length,
      avg: (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2),
    });
  }

  // 計算整體統計
  const allValues = gridNodes.map((node) => node.value);
  const overallStats = {
    min: Math.min(...allValues),
    max: Math.max(...allValues),
    sum: allValues.reduce((sum, val) => sum + val, 0),
    count: allValues.length,
    avg: (allValues.reduce((sum, val) => sum + val, 0) / allValues.length).toFixed(2),
  };

  // 建立摘要資料
  const dashboardData = {
    totalNodes: gridX * gridY,
    gridSize: `${gridX} x ${gridY}`,
    gridX: gridX,
    gridY: gridY,
    nodeCount: gridNodes.length,
    // 新增統計數據
    xRowStats: xRowStats,
    yRowStats: yRowStats,
    overallStats: overallStats,
    // 簡化的統計摘要（用於儀表板顯示）
    xRowMinMax: {
      min: Math.min(...xRowStats.map((stat) => stat.min)),
      max: Math.max(...xRowStats.map((stat) => stat.max)),
    },
    yRowMinMax: {
      min: Math.min(...yRowStats.map((stat) => stat.min)),
      max: Math.max(...yRowStats.map((stat) => stat.max)),
    },
  };

  // 建立圖層資訊數據
  const layerInfoData = {
    totalNodes: gridX * gridY,
    gridSize: `${gridX} x ${gridY}`,
    gridX: gridX,
    gridY: gridY,
    // 新增統計數據
    xRowStats: xRowStats,
    yRowStats: yRowStats,
    overallStats: overallStats,
    xRowMinMax: {
      min: Math.min(...xRowStats.map((stat) => stat.min)),
      max: Math.max(...xRowStats.map((stat) => stat.max)),
    },
    yRowMinMax: {
      min: Math.min(...yRowStats.map((stat) => stat.min)),
      max: Math.max(...yRowStats.map((stat) => stat.max)),
    },
  };

  // 建立表格資料
  const dataTableData = [
    {
      '#': 1,
      name: `網格示意圖 (${gridX}x${gridY})`,
      gridSize: `${gridX} x ${gridY}`,
      totalNodes: gridX * gridY,
      nodes: gridNodes,
      // 新增統計數據到表格
      xRowMinMax: {
        min: Math.min(...xRowStats.map((stat) => stat.min)),
        max: Math.max(...xRowStats.map((stat) => stat.max)),
      },
      yRowMinMax: {
        min: Math.min(...yRowStats.map((stat) => stat.min)),
        max: Math.max(...yRowStats.map((stat) => stat.max)),
      },
      overallStats: overallStats,
    },
  ];

  return {
    jsonData: jsonData, // 保持原始數據不變
    processedJsonData: {
      gridX: gridX,
      gridY: gridY,
      nodes: gridNodes,
      type: 'grid',
      // 新增統計數據到處理後的數據
      xRowStats: xRowStats,
      yRowStats: yRowStats,
      overallStats: overallStats,
      xRowMinMax: {
        min: Math.min(...xRowStats.map((stat) => stat.min)),
        max: Math.max(...xRowStats.map((stat) => stat.max)),
      },
      yRowMinMax: {
        min: Math.min(...yRowStats.map((stat) => stat.min)),
        max: Math.max(...yRowStats.map((stat) => stat.max)),
      },
    },
    dashboardData,
    dataTableData,
    layerInfoData,
  };
}

/**
 * 📊 處理數據圖層 JSON 數據 (Process Data Layer JSON Data)
 *
 * 這是一個專門用於處理數據圖層 JSON 數據的核心函數，負責將原始的地理空間數據
 * 轉換為適合前端視覺化組件使用的標準化格式。該函數支援多種數據格式，包括
 * 示意圖節點數據和標準地理數據，並提供完整的數據預處理和格式轉換功能。
 *
 * 🎯 主要功能 (Main Features):
 * - 數據格式識別：自動識別輸入數據的格式類型
 * - 示意圖節點處理：處理包含節點陣列的複雜示意圖數據
 * - 標準地理數據處理：處理一般的地理空間數據
 * - 數據隨機化：為示意圖節點隨機分配數值（用於測試）
 * - 統計摘要生成：計算數據統計信息和摘要數據
 * - 表格數據建構：生成適合表格組件顯示的數據結構
 *
 * 🔧 支援的數據格式 (Supported Data Formats):
 * - 示意圖節點數據：包含節點陣列的複雜數據結構
 *   - 格式：Array<{ nodes: Array, name: string, color: string }>
 *   - 用途：用於繪製複雜的示意圖網絡
 * - 標準地理數據：包含地理要素屬性的標準 JSON 格式
 *   - 格式：Array<{ name: string, id: string, [其他屬性]: any }>
 *   - 用途：用於一般的地理數據顯示
 *
 * 📊 數據處理邏輯 (Data Processing Logic):
 * 1. 格式檢測：檢查數據是否為示意圖節點格式
 * 2. 示意圖處理：如果是示意圖格式，執行節點隨機化和統計計算
 * 3. 標準處理：如果是標準格式，執行一般的地理數據處理
 * 4. 統計計算：計算數據統計信息和摘要數據
 * 5. 表格建構：生成適合表格顯示的數據結構
 *
 * 🚀 使用範例 (Usage Examples):
 * ```javascript
 * // 處理示意圖節點數據
 * const schematicData = [
 *   {
 *     name: 'Line 1',
 *     color: 'red',
 *     nodes: [
 *       { coord: { x: 0, y: 0 }, value: 0 },
 *       { coord: { x: 1, y: 0 }, value: 0 }
 *     ]
 *   }
 * ];
 * const result = await processDataLayerJson(schematicData);
 *
 * // 處理標準地理數據
 * const geoData = [
 *   { name: 'Station 1', id: 'S1', type: 'metro' },
 *   { name: 'Station 2', id: 'S2', type: 'metro' }
 * ];
 * const result = await processDataLayerJson(geoData);
 * ```
 *
 * 📈 示意圖節點數據格式 (Schematic Node Data Format):
 * ```javascript
 * [
 *   {
 *     name: string,           // 路線名稱
 *     color: string,          // 路線顏色
 *     nodes: [                // 節點陣列
 *       {
 *         coord: { x: number, y: number },  // 節點座標
 *         value: number,       // 節點數值
 *         [其他屬性]: any      // 其他節點屬性
 *       }
 *     ]
 *   }
 * ]
 * ```
 *
 * 📈 標準地理數據格式 (Standard Geo Data Format):
 * ```javascript
 * [
 *   {
 *     name: string,           // 要素名稱
 *     id: string,             // 要素 ID
 *     [其他屬性]: any         // 其他地理屬性
 *   }
 * ]
 * ```
 *
 * 📈 輸出數據結構 (Output Data Structure):
 * ```javascript
 * {
 *   jsonData: Object | null,  // 原始 JSON 數據（標準格式）或 null（示意圖格式）
 *   dashboardData: {            // 統計摘要數據
 *     totalLines?: number,    // 總路線數量（示意圖格式）
 *     totalNodes?: number,    // 總節點數量（示意圖格式）
 *     lineNames?: string[],   // 路線名稱陣列（示意圖格式）
 *     totalCount?: number,    // 總項目數量（標準格式）
 *     itemNames?: string[]    // 項目名稱陣列（標準格式）
 *   },
 *   dataTableData: Array          // 表格顯示數據
 * }
 * ```
 *
 * 🔄 數據處理流程 (Data Processing Flow):
 * 1. 檢查數據格式（示意圖節點或標準地理數據）
 * 2. 根據格式選擇適當的處理邏輯
 * 3. 執行數據預處理和格式轉換
 * 4. 計算統計摘要信息
 * 5. 生成表格顯示數據
 * 6. 返回標準化的數據結構
 *
 * ⚠️ 注意事項 (Important Notes):
 * - 示意圖節點數據會進行隨機化處理（用於測試）
 * - 標準地理數據保持原始格式不變
 * - 統計摘要會根據數據格式自動調整
 * - 表格數據會根據數據類型生成不同的結構
 *
 * @param {Object} jsonData - 需要處理的 JSON 數據
 * @param {Array} [jsonData] - 示意圖節點數據陣列
 * @param {Array} [jsonData] - 標準地理數據陣列
 * @returns {Object} - 包含處理後數據的完整結構
 *
 * @example
 * // 處理示意圖數據
 * const schematicData = [{ name: 'Line 1', nodes: [] }];
 * const result = await processDataLayerJson(schematicData);
 *
 * // 處理標準地理數據
 * const geoData = [{ name: 'Station 1', id: 'S1' }];
 * const result = await processDataLayerJson(geoData);
 *
 * @since 1.0.0
 * @see {@link randomizeNodeValues} 節點數值隨機化函數
 * @see {@link loadDataLayerJson} 數據圖層載入函數
 */
async function processDataLayerJson(jsonData) {
  // 檢查是否為示意圖節點格式
  if (Array.isArray(jsonData) && jsonData.length > 0 && jsonData[0].nodes) {
    // 這是示意圖節點格式，不需要處理為地圖圖層

    // 為每個路線的節點隨機分配 1-5 的數值
    const processedJsonData = jsonData.map((line) => ({
      ...line,
      nodes: line.nodes.map((node) => ({
        ...node,
        value: generateWeightedRandomValue(),
      })),
    }));

    // 建立摘要資料
    const dashboardData = {
      totalLines: processedJsonData.length,
      totalNodes: processedJsonData.reduce((sum, line) => sum + line.nodes.length, 0),
      lineNames: processedJsonData.map((line) => line.name),
    };

    // 建立圖層資訊數據
    const layerInfoData = {
      totalLines: processedJsonData.length,
      totalNodes: processedJsonData.reduce((sum, line) => sum + line.nodes.length, 0),
      lineNames: processedJsonData.map((line) => line.name),
    };

    // 為示意圖數據建立 dataTableData，每個路線作為一個項目
    const dataTableData = processedJsonData.map((line, index) => ({
      '#': index + 1,
      color: line.color,
      name: line.name,
      nodes: line.nodes,
    }));

    return {
      jsonData: jsonData, // 保持原始數據不變
      processedJsonData: processedJsonData, // 處理後的示意圖數據（包含隨機數值）
      dashboardData,
      dataTableData,
      layerInfoData,
    };
  }

  // 標準 JSON 格式處理 - 示意圖節點數據

  // 建立摘要資料
  const dashboardData = {
    totalCount: jsonData.length,
    itemNames: jsonData.map((item) => item.name || item.id || '未命名項目'),
  };

  // 建立圖層資訊數據
  const layerInfoData = {
    totalItems: jsonData.length,
    itemNames: jsonData.map((item) => item.name || item.id || '未命名項目'),
    hasFeatures: jsonData.some((item) => item.features),
    hasProperties: jsonData.some((item) => item.properties),
  };

  return {
    jsonData: jsonData, // 保持原始數據不變
    processedJsonData: jsonData, // 標準格式數據直接使用原始數據
    dashboardData,
    layerInfoData,
    dataTableData: jsonData.map((item, index) => ({
      '#': index + 1,
      name: item.name || item.id || '未命名項目',
      ...item,
    })),
  };
}

// ==================== 🎨 繪製數據處理函數 (Draw Data Processing Functions) ====================

/**
 * 🎨 網格示意圖轉繪製數據 (Process Grid to Draw Data)
 *
 * 將網格示意圖的 processedJsonData 轉換為適合 D3.js 繪製的 drawJsonData
 *
 * @param {Object} processedData - 處理後的網格數據
 * @param {Array} hiddenColumnIndices - 被隱藏的列索引（可選）
 * @param {Array} hiddenRowIndices - 被隱藏的行索引（可選）
 * @returns {Object} 繪製用的數據結構
 */
export function processGridToDrawData(
  processedData,
  hiddenColumnIndices = [],
  hiddenRowIndices = []
) {
  if (!processedData || !processedData.nodes) {
    console.warn('網格數據不完整，無法生成繪製數據');
    return null;
  }

  // 計算網格尺寸
  const gridX = processedData.gridX || 10;
  const gridY = processedData.gridY || 10;

  // 建立快速查找的 Map：(x,y) -> node
  const nodeMap = new Map();
  processedData.nodes.forEach((node) => {
    nodeMap.set(`${node.x},${node.y}`, node);
  });

  /**
   * 獲取相鄰被刪除的 grid 值
   * @param {number} x - 當前節點的 x 座標
   * @param {number} y - 當前節點的 y 座標
   * @returns {Object} 包含四個方向相鄰被刪除的 grid 值
   */
  const getAdjacentDeletedValues = (x, y) => {
    const deletedNeighbors = {
      left: [], // 左側被刪除的列的值
      right: [], // 右側被刪除的列的值
      top: [], // 上方被刪除的行的值
      bottom: [], // 下方被刪除的行的值
    };

    // 檢查左側被刪除的列
    for (let checkX = x - 1; checkX >= 0; checkX--) {
      if (hiddenColumnIndices.includes(checkX)) {
        const deletedNode = nodeMap.get(`${checkX},${y}`);
        if (deletedNode) {
          deletedNeighbors.left.push(deletedNode.value);
        }
      } else {
        // 遇到未被刪除的列就停止
        break;
      }
    }

    // 檢查右側被刪除的列
    for (let checkX = x + 1; checkX < gridX; checkX++) {
      if (hiddenColumnIndices.includes(checkX)) {
        const deletedNode = nodeMap.get(`${checkX},${y}`);
        if (deletedNode) {
          deletedNeighbors.right.push(deletedNode.value);
        }
      } else {
        // 遇到未被刪除的列就停止
        break;
      }
    }

    // 檢查上方被刪除的行
    for (let checkY = y - 1; checkY >= 0; checkY--) {
      if (hiddenRowIndices.includes(checkY)) {
        const deletedNode = nodeMap.get(`${x},${checkY}`);
        if (deletedNode) {
          deletedNeighbors.top.push(deletedNode.value);
        }
      } else {
        // 遇到未被刪除的行就停止
        break;
      }
    }

    // 檢查下方被刪除的行
    for (let checkY = y + 1; checkY < gridY; checkY++) {
      if (hiddenRowIndices.includes(checkY)) {
        const deletedNode = nodeMap.get(`${x},${checkY}`);
        if (deletedNode) {
          deletedNeighbors.bottom.push(deletedNode.value);
        }
      } else {
        // 遇到未被刪除的行就停止
        break;
      }
    }

    return deletedNeighbors;
  };

  // 生成繪製用的節點數據
  const drawNodes = processedData.nodes.map((node, index) => {
    // 獲取相鄰被刪除的 grid 值
    const deletedNeighbors = getAdjacentDeletedValues(node.x, node.y);

    return {
      id: `grid_${node.x}_${node.y}`,
      x: node.x,
      y: node.y,
      value: node.value,
      type: node.type || 1,
      coord: { x: node.x, y: node.y },
      gridIndex: index,
      isGridNode: true,
      // 顏色：優先使用自定義顏色，否則預設白色
      color: node.color || '#FFFFFF',
      // 相鄰被刪除的 grid 值
      deletedNeighbors: deletedNeighbors,
    };
  });

  // 生成繪製用的連線數據（網格邊界）
  const drawLinks = [];
  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      const currentIndex = y * gridX + x;

      // 水平連線（向右）
      if (x < gridX - 1) {
        const rightIndex = y * gridX + (x + 1);
        drawLinks.push({
          id: `link_h_${x}_${y}`,
          source: currentIndex,
          target: rightIndex,
          type: 'horizontal',
        });
      }

      // 垂直連線（向下）
      if (y < gridY - 1) {
        const bottomIndex = (y + 1) * gridX + x;
        drawLinks.push({
          id: `link_v_${x}_${y}`,
          source: currentIndex,
          target: bottomIndex,
          type: 'vertical',
        });
      }
    }
  }

  // 計算統計標籤數據
  const xRowStats = [];
  const yRowStats = [];

  // 計算 X 排（垂直方向）統計
  for (let x = 0; x < gridX; x++) {
    const values = [];
    for (let y = 0; y < gridY; y++) {
      const nodeIndex = y * gridX + x;
      if (drawNodes[nodeIndex]) {
        values.push(drawNodes[nodeIndex].value);
      }
    }

    if (values.length > 0) {
      xRowStats.push({
        row: x,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((sum, val) => sum + val, 0) / values.length,
        count: values.length,
      });
    }
  }

  // 計算 Y 排（水平方向）統計
  for (let y = 0; y < gridY; y++) {
    const values = [];
    for (let x = 0; x < gridX; x++) {
      const nodeIndex = y * gridX + x;
      if (drawNodes[nodeIndex]) {
        values.push(drawNodes[nodeIndex].value);
      }
    }

    if (values.length > 0) {
      yRowStats.push({
        row: y,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((sum, val) => sum + val, 0) / values.length,
        count: values.length,
      });
    }
  }

  // 計算整體統計
  const allValues = drawNodes.map((node) => node.value);
  const overallStats = {
    min: Math.min(...allValues),
    max: Math.max(...allValues),
    avg: allValues.reduce((sum, val) => sum + val, 0) / allValues.length,
    count: allValues.length,
  };

  // 計算需要高亮的 column（基於最大值最小的 column）
  // 步驟 1: 提取每個 column 的最大值，形成陣列 [max1, max2, max3, ...]
  const columnMaxValues = xRowStats.map((stat) => stat.max);
  // 步驟 2: 找出所有 column 最大值中的最小值（min of max）
  const minColumnMax = Math.min(...columnMaxValues);
  // 步驟 3: 找出哪些 column 的最大值等於這個最小值，並取得它們的索引
  const highlightColumnIndices = xRowStats
    .map((stat, index) => ({ stat, index })) // 將統計數據與索引配對
    .filter(({ stat }) => stat.max === minColumnMax) // 篩選出最大值等於 minColumnMax 的 column
    .map(({ index }) => index); // 只保留索引值

  // 計算需要高亮的 row（基於最大值最小的 row）
  // 步驟 1: 提取每個 row 的最大值，形成陣列 [max1, max2, max3, ...]
  const rowMaxValues = yRowStats.map((stat) => stat.max);
  // 步驟 2: 找出所有 row 最大值中的最小值（min of max）
  const minRowMax = Math.min(...rowMaxValues);
  // 步驟 3: 找出哪些 row 的最大值等於這個最小值，並取得它們的索引
  const highlightRowIndices = yRowStats
    .map((stat, index) => ({ stat, index })) // 將統計數據與索引配對
    .filter(({ stat }) => stat.max === minRowMax) // 篩選出最大值等於 minRowMax 的 row
    .map(({ index }) => index); // 只保留索引值

  return {
    type: 'grid',
    gridX,
    gridY,
    nodes: drawNodes,
    links: drawLinks,
    totalNodes: drawNodes.length,
    totalLinks: drawLinks.length,
    // 統計標籤數據
    statsLabels: {
      xRowStats, // X 排統計數據
      yRowStats, // Y 排統計數據
      overallStats, // 整體統計數據
      // 簡化的顏色配置
      color: '#4CAF50', // 預設綠色
      highlightColumnIndices, // 需要高亮的 column 索引（紅色）
      highlightRowIndices, // 需要高亮的 row 索引（紅色）
    },
  };
}

/**
 * 🎨 台北捷運轉繪製數據 (Process Metro to Draw Data)
 *
 * 將台北捷運的 processedJsonData 轉換為適合 D3.js 繪製的 drawJsonData
 *
 * @param {Array} processedData - 處理後的捷運數據
 * @returns {Object} 繪製用的數據結構
 */
export function processMetroToDrawData(processedData) {
  if (!Array.isArray(processedData) || processedData.length === 0) {
    console.warn('捷運數據不完整，無法生成繪製數據');
    return null;
  }

  // 生成繪製用的節點數據
  const drawNodes = [];
  const drawLinks = [];

  processedData.forEach((line, lineIndex) => {
    if (!line.nodes || !Array.isArray(line.nodes)) return;

    // 處理每個路線的節點
    line.nodes.forEach((node, nodeIdx) => {
      const nodeId = `metro_${lineIndex}_${nodeIdx}`;

      drawNodes.push({
        id: nodeId,
        x: node.coord.x,
        y: node.coord.y,
        value: node.value,
        type: node.type,
        coord: { x: node.coord.x, y: node.coord.y },
        lineName: line.name,
        lineColor: line.color,
        lineIndex: lineIndex,
        nodeIndex: nodeIdx,
        isMetroNode: true,
      });

      // 生成路線連線（相鄰節點）
      if (nodeIdx > 0) {
        const prevNodeId = `metro_${lineIndex}_${nodeIdx - 1}`;
        drawLinks.push({
          id: `metro_link_${lineIndex}_${nodeIdx - 1}`,
          source: prevNodeId,
          target: nodeId,
          lineName: line.name,
          lineColor: line.color,
          lineIndex: lineIndex,
          type: 'metro',
        });
      }
    });
  });

  return {
    type: 'metro',
    lines: processedData.map((line) => ({
      name: line.name,
      color: line.color,
      nodeCount: line.nodes.length,
    })),
    nodes: drawNodes,
    links: drawLinks,
    totalNodes: drawNodes.length,
    totalLinks: drawLinks.length,
    totalLines: processedData.length,
  };
}

/**
 * 📊 載入空間網絡網格 JSON 數據 (Load Space Network Grid JSON Data)
 *
 * 這是一個專門用於載入空間網絡網格數據的函數，主要用於 Step 6 的權重簡化數據。
 * 該函數會從指定的 JSON 文件讀取經過 execute_4_1_to_6_1 處理後的數據格式，
 * 並將其轉換為適合前端視覺化組件使用的標準化格式。
 *
 * 🎯 主要功能 (Main Features):
 * - 空間網絡數據載入：從 JSON 文件讀取空間網絡網格數據
 * - 格式標準化：將數據轉換為標準格式供視覺化使用
 * - 統計計算：生成數據統計摘要和表格數據
 * - 雙重賦值：同時賦值給 spaceNetworkGridJsonData 和 layoutGridJsonData
 *
 * 🔧 支援的數據格式 (Supported Data Formats):
 * - 包含 meta 和 routes 的 JSON 結構
 * - 每個 route 包含 route_name 和 segments
 * - 每個 segment 包含 points、original_points、edge_weights 等
 *
 * 📊 數據處理流程 (Data Processing Flow):
 * 1. 接收圖層配置對象，提取 JSON 文件名稱
 * 2. 使用 loadFile 函數載入 JSON 數據文件
 * 3. 解析 JSON 數據並提取 routes 陣列
 * 4. 計算統計摘要信息
 * 5. 生成表格顯示數據
 * 6. 返回標準化的數據對象
 *
 * 📈 返回數據結構 (Return Data Structure):
 * ```javascript
 * {
 *   jsonData: Object | null,           // 原始 JSON 數據
 *   spaceNetworkGridJsonData: Array,   // 空間網絡網格數據（routes 陣列）
 *   layoutGridJsonData: Array,         // 版面網格數據（routes 陣列）
 *   processedJsonData: Array,          // 處理後的數據
 *   dashboardData: Object,             // 統計摘要數據
 *   dataTableData: Array,              // 表格顯示數據
 *   layerInfoData: Object              // 圖層資訊數據
 * }
 * ```
 *
 * @param {Object} layer - 圖層配置對象，包含載入所需的配置信息
 * @param {string} layer.jsonFileName - JSON 文件名稱，相對於數據目錄
 * @returns {Promise<Object>} - 包含處理後數據的對象
 * @throws {Error} - 當載入或處理失敗時拋出錯誤
 *
 * @example
 * // 基本用法
 * const layer = { jsonFileName: 'taipei/step06/5_centered_taipei.json' };
 * const data = await loadSpaceNetworkGridJson(layer);
 *
 * @since 3.0.0
 * @see {@link loadFile} 通用檔案載入函數
 * @see {@link execute_4_1_to_6_1} 數據生成函數
 */

/** taipei_i：不匯入之路線（prefix 比對，含 綠線(支線)、萬大中和樹林線(第一／二期) 等） */
const TAIPEI_I_EXCLUDED_ROUTE_NAME_PREFIXES = [
  '機場線',
  '綠線',
  '三鶯線',
  '萬大中和樹林線',
  '民生汐止線', // 資料檔路線名（口語「民汐線」）
];

function isTaipeiIExcludedRouteName(routeName) {
  const n = String(routeName ?? '').trim();
  if (!n) return false;
  if (n === '民汐線') return true;
  return TAIPEI_I_EXCLUDED_ROUTE_NAME_PREFIXES.some((p) => n === p || n.startsWith(p));
}

/**
 * taipei_k3：讀 j3 下載之 JSON（純 mapDrawnRoutes 陣列，或含 mapDrawnRoutes／dataTableData／layerInfoData／dashboard 之 bundle），
 * 還原扁平 segments；再依 taipei_h3→i3 同款 **在黑點頂點切段**（與 j3 路網粒度一致，站間一筆權重、未對應為 0），
 * 然後 Section／Connect／Station 與 `csvFileName_traffic` 流量／DataTable，語意對齊 executeTaipeiTest3_I3_To_J3。
 *
 * @param {{ jsonFileName: string, csvFileName_traffic?: string, layerId?: string }} layer
 * @returns {Promise<Object>} 與 loadSpaceNetworkGridJson 末端合併欄位相容之物件
 */
export async function loadTaipeiK3J3RoutesTrafficJson(layer) {
  try {
    const fileName = layer.jsonFileName;
    if (!fileName) {
      throw new Error('taipei_k3：缺少 jsonFileName');
    }
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
    const response = await loadFile(dataPath, fallbackPath);
    const jsonData = await response.json();

    let mapDrawnRows = null;
    if (Array.isArray(jsonData) && isMapDrawnRoutesExportArray(jsonData)) {
      mapDrawnRows = jsonData;
    } else if (
      jsonData &&
      typeof jsonData === 'object' &&
      Array.isArray(jsonData.mapDrawnRoutes) &&
      isMapDrawnRoutesExportArray(jsonData.mapDrawnRoutes)
    ) {
      mapDrawnRows = jsonData.mapDrawnRoutes;
    }

    if (!mapDrawnRows?.length) {
      throw new Error(
        `taipei_k3：JSON 須為地圖路段匯出陣列，或物件含 mapDrawnRoutes（檔案：${fileName}）`
      );
    }

    const { splitFlatH3SegmentsAtBlackVerticesOnly } = await import(
      './taipeiTest3/h3ToI3SplitAtBlackVertices.js'
    );
    let flatSegs = mapDrawnExportRowsToFlatSegments(mapDrawnRows);
    flatSegs = splitFlatH3SegmentsAtBlackVerticesOnly(flatSegs);

    const { computeStationDataFromRoutes } = await import(
      './dataExecute/computeStationDataFromRoutes.js'
    );
    const computed = computeStationDataFromRoutes(flatSegs);
    const connectData = computed.connectData;
    const stationData = computed.stationData;
    const sectionData = computed.sectionData;

    const csvFileName = layer.csvFileName_traffic ?? 'taipei_city/mrt_link_volume_undirected.csv';
    const { trafficData } = await loadCsvTrafficForLayer({
      csvFileName_traffic: csvFileName,
    });
    if (!trafficData?.rows?.length) {
      console.warn('taipei_k3：CSV 無資料或讀取失敗', csvFileName);
    }

    const routesForTraffic = taipeiFSpaceNetworkDataToRoutesForDataTable(flatSegs);
    const trafficStats = applyMrtTrafficVolumesToTaipeiRoutes(routesForTraffic, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });
    applyOutgoingTrafficWeightsToMapDrawnExportJson(jsonData, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });

    const snOut = JSON.parse(JSON.stringify(flatSegs));

    const dataTableData = buildTaipeiK3JunctionDataTableRows(snOut);

    const { flatSegmentsToGeojsonStyleExportRows } = await import(
      './taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js'
    );
    let processedJsonData;
    try {
      processedJsonData = flatSegmentsToGeojsonStyleExportRows(snOut);
    } catch (e) {
      console.error('taipei_k3：processedJsonData 轉換失敗', e);
      processedJsonData = [];
    }

    const isBundle = jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData);

    const nameSet = new Set();
    for (const seg of flatSegs) {
      const n = seg.name || seg.route_name;
      if (n) nameSet.add(n);
    }
    const nSeg = flatSegs.length;
    let pts = 0;
    for (const seg of flatSegs) {
      pts += (seg.points || []).length;
    }

    let layerInfoData = { totalRoutes: 0, totalSegments: 0, totalPoints: 0 };
    if (isBundle && jsonData.layerInfoData && typeof jsonData.layerInfoData === 'object') {
      layerInfoData = JSON.parse(JSON.stringify(jsonData.layerInfoData));
    }
    layerInfoData.totalRoutes = nameSet.size || nSeg;
    layerInfoData.totalSegments = nSeg;
    layerInfoData.totalPoints = pts;
    layerInfoData.trafficCsvRows = trafficData?.rowCount ?? 0;
    layerInfoData.trafficEdgesMatched = trafficStats.matched;
    layerInfoData.trafficEdgesUnmatched = trafficStats.unmatched;

    let dashboardData = {};
    if (isBundle && jsonData.dashboardData && typeof jsonData.dashboardData === 'object') {
      dashboardData = JSON.parse(JSON.stringify(jsonData.dashboardData));
    }
    dashboardData.segmentCount = flatSegs.length;
    dashboardData.sourceJsonFile = fileName;
    dashboardData.trafficCsvFile = csvFileName;
    dashboardData.trafficMatched = trafficStats.matched;
    dashboardData.trafficUnmatched = trafficStats.unmatched;

    return {
      jsonData,
      spaceNetworkGridJsonData: snOut,
      spaceNetworkGridJsonData_SectionData: computed.sectionData,
      spaceNetworkGridJsonData_ConnectData: computed.connectData,
      spaceNetworkGridJsonData_StationData: computed.stationData,
      /** 與上列語意相同之深度複製，僅供 taipei_k3 專用 Upper 分頁（與主 space-network-grid 不共用參照） */
      spaceNetworkGridJsonDataK3Tab: JSON.parse(JSON.stringify(snOut)),
      spaceNetworkGridJsonDataK3Tab_SectionData: JSON.parse(JSON.stringify(computed.sectionData)),
      spaceNetworkGridJsonDataK3Tab_ConnectData: JSON.parse(JSON.stringify(computed.connectData)),
      spaceNetworkGridJsonDataK3Tab_StationData: JSON.parse(JSON.stringify(computed.stationData)),
      processedJsonDataK3Tab:
        processedJsonData != null ? JSON.parse(JSON.stringify(processedJsonData)) : null,
      showStationPlacement: true,
      layoutGridJsonData: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test2: JSON.parse(JSON.stringify(snOut)),
      processedJsonData,
      dataTableData,
      layerInfoData,
      dashboardData,
      trafficData: trafficData ?? null,
    };
  } catch (error) {
    console.error('❌ taipei_k3 路段匯出 JSON 載入失敗:', error);
    throw error;
  }
}

/**
 * taipei_a4（版面網格測試_1）：路段匯出 JSON 載入（獨立複製，不共用函式本體）。
 *
 * @param {{ jsonFileName: string, csvFileName_traffic?: string, layerId?: string }} layer
 * @returns {Promise<Object>} 與 loadSpaceNetworkGridJson 末端合併欄位相容之物件
 */
export async function loadTaipeiA4J3RoutesTrafficJson(layer) {
  try {
    const fileName = layer.jsonFileName;
    if (!fileName) {
      throw new Error('taipei_a4：缺少 jsonFileName');
    }
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
    const response = await loadFile(dataPath, fallbackPath);
    const jsonData = await response.json();

    let mapDrawnRows = null;
    if (Array.isArray(jsonData) && isMapDrawnRoutesExportArray(jsonData)) {
      mapDrawnRows = jsonData;
    } else if (
      jsonData &&
      typeof jsonData === 'object' &&
      Array.isArray(jsonData.mapDrawnRoutes) &&
      isMapDrawnRoutesExportArray(jsonData.mapDrawnRoutes)
    ) {
      mapDrawnRows = jsonData.mapDrawnRoutes;
    }

    if (!mapDrawnRows?.length) {
      throw new Error(
        `taipei_a4：JSON 須為地圖路段匯出陣列，或物件含 mapDrawnRoutes（檔案：${fileName}）`
      );
    }

    const { splitFlatH3SegmentsAtBlackVerticesOnly } = await import(
      './taipeiTest3/h3ToI3SplitAtBlackVertices.js'
    );
    let flatSegs = mapDrawnExportRowsToFlatSegments(mapDrawnRows);
    flatSegs = splitFlatH3SegmentsAtBlackVerticesOnly(flatSegs);

    const { computeStationDataFromRoutes } = await import(
      './dataExecute/computeStationDataFromRoutes.js'
    );
    const computed = computeStationDataFromRoutes(flatSegs);
    const connectData = computed.connectData;
    const stationData = computed.stationData;
    const sectionData = computed.sectionData;

    const csvFileName = layer.csvFileName_traffic ?? 'taipei_city/mrt_link_volume_undirected.csv';
    const { trafficData } = await loadCsvTrafficForLayer({
      csvFileName_traffic: csvFileName,
    });
    if (!trafficData?.rows?.length) {
      console.warn('taipei_a4：CSV 無資料或讀取失敗', csvFileName);
    }

    const routesForTraffic = taipeiFSpaceNetworkDataToRoutesForDataTable(flatSegs);
    const trafficStats = applyMrtTrafficVolumesToTaipeiRoutes(routesForTraffic, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });
    applyOutgoingTrafficWeightsToMapDrawnExportJson(jsonData, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });

    const snOut = JSON.parse(JSON.stringify(flatSegs));

    const dataTableData = buildTaipeiK3JunctionDataTableRows(snOut);

    const { flatSegmentsToGeojsonStyleExportRows } = await import(
      './taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js'
    );
    let processedJsonData;
    try {
      processedJsonData = flatSegmentsToGeojsonStyleExportRows(snOut);
    } catch (e) {
      console.error('taipei_a4：processedJsonData 轉換失敗', e);
      processedJsonData = [];
    }

    const isBundle = jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData);

    const nameSet = new Set();
    for (const seg of flatSegs) {
      const n = seg.name || seg.route_name;
      if (n) nameSet.add(n);
    }
    const nSeg = flatSegs.length;
    let pts = 0;
    for (const seg of flatSegs) {
      pts += (seg.points || []).length;
    }

    let layerInfoData = { totalRoutes: 0, totalSegments: 0, totalPoints: 0 };
    if (isBundle && jsonData.layerInfoData && typeof jsonData.layerInfoData === 'object') {
      layerInfoData = JSON.parse(JSON.stringify(jsonData.layerInfoData));
    }
    layerInfoData.totalRoutes = nameSet.size || nSeg;
    layerInfoData.totalSegments = nSeg;
    layerInfoData.totalPoints = pts;
    layerInfoData.trafficCsvRows = trafficData?.rowCount ?? 0;
    layerInfoData.trafficEdgesMatched = trafficStats.matched;
    layerInfoData.trafficEdgesUnmatched = trafficStats.unmatched;

    let dashboardData = {};
    if (isBundle && jsonData.dashboardData && typeof jsonData.dashboardData === 'object') {
      dashboardData = JSON.parse(JSON.stringify(jsonData.dashboardData));
    }
    dashboardData.segmentCount = flatSegs.length;
    dashboardData.sourceJsonFile = fileName;
    dashboardData.trafficCsvFile = csvFileName;
    dashboardData.trafficMatched = trafficStats.matched;
    dashboardData.trafficUnmatched = trafficStats.unmatched;

    return {
      jsonData,
      spaceNetworkGridJsonData: snOut,
      spaceNetworkGridJsonData_SectionData: computed.sectionData,
      spaceNetworkGridJsonData_ConnectData: computed.connectData,
      spaceNetworkGridJsonData_StationData: computed.stationData,
      /** 與上列語意相同之深度複製，僅供 taipei_a4 專用 Upper 分頁（與主 space-network-grid 不共用參照） */
      spaceNetworkGridJsonDataK3Tab: JSON.parse(JSON.stringify(snOut)),
      spaceNetworkGridJsonDataK3Tab_SectionData: JSON.parse(JSON.stringify(computed.sectionData)),
      spaceNetworkGridJsonDataK3Tab_ConnectData: JSON.parse(JSON.stringify(computed.connectData)),
      spaceNetworkGridJsonDataK3Tab_StationData: JSON.parse(JSON.stringify(computed.stationData)),
      processedJsonDataK3Tab:
        processedJsonData != null ? JSON.parse(JSON.stringify(processedJsonData)) : null,
      showStationPlacement: true,
      layoutGridJsonData: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test2: JSON.parse(JSON.stringify(snOut)),
      processedJsonData,
      dataTableData,
      layerInfoData,
      dashboardData,
      trafficData: trafficData ?? null,
    };
  } catch (error) {
    console.error('❌ taipei_a4 路段匯出 JSON 載入失敗:', error);
    throw error;
  }
}

/**
 * taipei_l3：與 loadTaipeiK3J3RoutesTrafficJson 行為相同，但錯誤訊息與回傳之 L3 專用欄位獨立（不共用 K3 鍵名）。
 *
 * @param {{ jsonFileName: string, csvFileName_traffic?: string, layerId?: string }} layer
 * @returns {Promise<Object>} 與 loadSpaceNetworkGridJson 末端合併欄位相容之物件
 */
export async function loadTaipeiL3J3RoutesTrafficJson(layer) {
  try {
    const fileName = layer.jsonFileName;
    if (!fileName) {
      throw new Error('taipei_l3：缺少 jsonFileName');
    }
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
    const response = await loadFile(dataPath, fallbackPath);
    const jsonData = await response.json();

    let mapDrawnRows = null;
    if (Array.isArray(jsonData) && isMapDrawnRoutesExportArray(jsonData)) {
      mapDrawnRows = jsonData;
    } else if (
      jsonData &&
      typeof jsonData === 'object' &&
      Array.isArray(jsonData.mapDrawnRoutes) &&
      isMapDrawnRoutesExportArray(jsonData.mapDrawnRoutes)
    ) {
      mapDrawnRows = jsonData.mapDrawnRoutes;
    }

    if (!mapDrawnRows?.length) {
      throw new Error(
        `taipei_l3：JSON 須為地圖路段匯出陣列，或物件含 mapDrawnRoutes（檔案：${fileName}）`
      );
    }

    const { splitFlatH3SegmentsAtBlackVerticesOnly } = await import(
      './taipeiTest3/h3ToI3SplitAtBlackVertices.js'
    );
    let flatSegs = mapDrawnExportRowsToFlatSegments(mapDrawnRows);
    flatSegs = splitFlatH3SegmentsAtBlackVerticesOnly(flatSegs);

    const { computeStationDataFromRoutes } = await import(
      './dataExecute/computeStationDataFromRoutes.js'
    );
    const computed = computeStationDataFromRoutes(flatSegs);
    const connectData = computed.connectData;
    const stationData = computed.stationData;
    const sectionData = computed.sectionData;

    const csvFileName = layer.csvFileName_traffic ?? 'taipei_city/mrt_link_volume_undirected.csv';
    const { trafficData } = await loadCsvTrafficForLayer({
      csvFileName_traffic: csvFileName,
    });
    if (!trafficData?.rows?.length) {
      console.warn('taipei_l3：CSV 無資料或讀取失敗', csvFileName);
    }

    const routesForTraffic = taipeiFSpaceNetworkDataToRoutesForDataTable(flatSegs);
    const trafficStats = applyMrtTrafficVolumesToTaipeiRoutes(routesForTraffic, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });
    applyOutgoingTrafficWeightsToMapDrawnExportJson(jsonData, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });

    const snOut = JSON.parse(JSON.stringify(flatSegs));

    const dataTableData = buildTaipeiL3JunctionDataTableRows(snOut);

    const { flatSegmentsToGeojsonStyleExportRows } = await import(
      './taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js'
    );
    let processedJsonData;
    try {
      processedJsonData = flatSegmentsToGeojsonStyleExportRows(snOut);
    } catch (e) {
      console.error('taipei_l3：processedJsonData 轉換失敗', e);
      processedJsonData = [];
    }

    const isBundle = jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData);

    const nameSet = new Set();
    for (const seg of flatSegs) {
      const n = seg.name || seg.route_name;
      if (n) nameSet.add(n);
    }
    const nSeg = flatSegs.length;
    let pts = 0;
    for (const seg of flatSegs) {
      pts += (seg.points || []).length;
    }

    let layerInfoData = { totalRoutes: 0, totalSegments: 0, totalPoints: 0 };
    if (isBundle && jsonData.layerInfoData && typeof jsonData.layerInfoData === 'object') {
      layerInfoData = JSON.parse(JSON.stringify(jsonData.layerInfoData));
    }
    layerInfoData.totalRoutes = nameSet.size || nSeg;
    layerInfoData.totalSegments = nSeg;
    layerInfoData.totalPoints = pts;
    layerInfoData.trafficCsvRows = trafficData?.rowCount ?? 0;
    layerInfoData.trafficEdgesMatched = trafficStats.matched;
    layerInfoData.trafficEdgesUnmatched = trafficStats.unmatched;

    let dashboardData = {};
    if (isBundle && jsonData.dashboardData && typeof jsonData.dashboardData === 'object') {
      dashboardData = JSON.parse(JSON.stringify(jsonData.dashboardData));
    }
    dashboardData.segmentCount = flatSegs.length;
    dashboardData.sourceJsonFile = fileName;
    dashboardData.trafficCsvFile = csvFileName;
    dashboardData.trafficMatched = trafficStats.matched;
    dashboardData.trafficUnmatched = trafficStats.unmatched;

    return {
      jsonData,
      spaceNetworkGridJsonData: snOut,
      spaceNetworkGridJsonData_SectionData: computed.sectionData,
      spaceNetworkGridJsonData_ConnectData: computed.connectData,
      spaceNetworkGridJsonData_StationData: computed.stationData,
      /** 與上列語意相同之深度複製，僅供 taipei_l3 專用 Upper 分頁（與主 space-network-grid 不共用參照） */
      spaceNetworkGridJsonDataL3Tab: JSON.parse(JSON.stringify(snOut)),
      spaceNetworkGridJsonDataL3Tab_SectionData: JSON.parse(JSON.stringify(computed.sectionData)),
      spaceNetworkGridJsonDataL3Tab_ConnectData: JSON.parse(JSON.stringify(computed.connectData)),
      spaceNetworkGridJsonDataL3Tab_StationData: JSON.parse(JSON.stringify(computed.stationData)),
      processedJsonDataL3Tab:
        processedJsonData != null ? JSON.parse(JSON.stringify(processedJsonData)) : null,
      showStationPlacement: true,
      layoutGridJsonData: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test2: JSON.parse(JSON.stringify(snOut)),
      processedJsonData,
      dataTableData,
      layerInfoData,
      dashboardData,
      trafficData: trafficData ?? null,
    };
  } catch (error) {
    console.error('❌ taipei_l3 路段匯出 JSON 載入失敗:', error);
    throw error;
  }
}

/**
 * taipei_m3：與 loadTaipeiL3J3RoutesTrafficJson 行為相同，回傳 M3 專用欄位鍵名。
 *
 * @param {{ jsonFileName: string, csvFileName_traffic?: string, layerId?: string }} layer
 * @returns {Promise<Object>} 與 loadSpaceNetworkGridJson 末端合併欄位相容之物件
 */
export async function loadTaipeiM3J3RoutesTrafficJson(layer) {
  try {
    const fileName = layer.jsonFileName;
    if (!fileName) {
      throw new Error('taipei_m3：缺少 jsonFileName');
    }
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
    const response = await loadFile(dataPath, fallbackPath);
    const jsonData = await response.json();

    let mapDrawnRows = null;
    if (Array.isArray(jsonData) && isMapDrawnRoutesExportArray(jsonData)) {
      mapDrawnRows = jsonData;
    } else if (
      jsonData &&
      typeof jsonData === 'object' &&
      Array.isArray(jsonData.mapDrawnRoutes) &&
      isMapDrawnRoutesExportArray(jsonData.mapDrawnRoutes)
    ) {
      mapDrawnRows = jsonData.mapDrawnRoutes;
    }

    if (!mapDrawnRows?.length) {
      throw new Error(
        `taipei_m3：JSON 須為地圖路段匯出陣列，或物件含 mapDrawnRoutes（檔案：${fileName}）`
      );
    }

    const { splitFlatH3SegmentsAtBlackVerticesOnly } = await import(
      './taipeiTest3/h3ToI3SplitAtBlackVertices.js'
    );
    let flatSegs = mapDrawnExportRowsToFlatSegments(mapDrawnRows);
    flatSegs = splitFlatH3SegmentsAtBlackVerticesOnly(flatSegs);

    const { computeStationDataFromRoutes } = await import(
      './dataExecute/computeStationDataFromRoutes.js'
    );
    const computed = computeStationDataFromRoutes(flatSegs);
    const connectData = computed.connectData;
    const stationData = computed.stationData;
    const sectionData = computed.sectionData;

    const csvFileName = layer.csvFileName_traffic ?? 'taipei_city/mrt_link_volume_undirected.csv';
    const { trafficData } = await loadCsvTrafficForLayer({
      csvFileName_traffic: csvFileName,
    });
    if (!trafficData?.rows?.length) {
      console.warn('taipei_m3：CSV 無資料或讀取失敗', csvFileName);
    }

    const routesForTraffic = taipeiFSpaceNetworkDataToRoutesForDataTable(flatSegs);
    const trafficStats = applyMrtTrafficVolumesToTaipeiRoutes(routesForTraffic, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });
    applyOutgoingTrafficWeightsToMapDrawnExportJson(jsonData, trafficData, {
      connectData,
      stationData,
      sectionData,
      zeroUnmatchedTraffic: true,
    });

    const snOut = JSON.parse(JSON.stringify(flatSegs));

    const dataTableData = buildTaipeiL3JunctionDataTableRows(snOut);

    const { flatSegmentsToGeojsonStyleExportRows } = await import(
      './taipeiTest3/flatSegmentsToGeojsonStyleExportRows.js'
    );
    let processedJsonData;
    try {
      processedJsonData = flatSegmentsToGeojsonStyleExportRows(snOut);
    } catch (e) {
      console.error('taipei_m3：processedJsonData 轉換失敗', e);
      processedJsonData = [];
    }

    const isBundle = jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData);

    const nameSet = new Set();
    for (const seg of flatSegs) {
      const n = seg.name || seg.route_name;
      if (n) nameSet.add(n);
    }
    const nSeg = flatSegs.length;
    let pts = 0;
    for (const seg of flatSegs) {
      pts += (seg.points || []).length;
    }

    let layerInfoData = { totalRoutes: 0, totalSegments: 0, totalPoints: 0 };
    if (isBundle && jsonData.layerInfoData && typeof jsonData.layerInfoData === 'object') {
      layerInfoData = JSON.parse(JSON.stringify(jsonData.layerInfoData));
    }
    layerInfoData.totalRoutes = nameSet.size || nSeg;
    layerInfoData.totalSegments = nSeg;
    layerInfoData.totalPoints = pts;
    layerInfoData.trafficCsvRows = trafficData?.rowCount ?? 0;
    layerInfoData.trafficEdgesMatched = trafficStats.matched;
    layerInfoData.trafficEdgesUnmatched = trafficStats.unmatched;

    let dashboardData = {};
    if (isBundle && jsonData.dashboardData && typeof jsonData.dashboardData === 'object') {
      dashboardData = JSON.parse(JSON.stringify(jsonData.dashboardData));
    }
    dashboardData.segmentCount = flatSegs.length;
    dashboardData.sourceJsonFile = fileName;
    dashboardData.trafficCsvFile = csvFileName;
    dashboardData.trafficMatched = trafficStats.matched;
    dashboardData.trafficUnmatched = trafficStats.unmatched;

    return {
      jsonData,
      spaceNetworkGridJsonData: snOut,
      spaceNetworkGridJsonData_SectionData: computed.sectionData,
      spaceNetworkGridJsonData_ConnectData: computed.connectData,
      spaceNetworkGridJsonData_StationData: computed.stationData,
      spaceNetworkGridJsonDataM3Tab: JSON.parse(JSON.stringify(snOut)),
      spaceNetworkGridJsonDataM3Tab_SectionData: JSON.parse(JSON.stringify(computed.sectionData)),
      spaceNetworkGridJsonDataM3Tab_ConnectData: JSON.parse(JSON.stringify(computed.connectData)),
      spaceNetworkGridJsonDataM3Tab_StationData: JSON.parse(JSON.stringify(computed.stationData)),
      processedJsonDataM3Tab:
        processedJsonData != null ? JSON.parse(JSON.stringify(processedJsonData)) : null,
      showStationPlacement: true,
      layoutGridJsonData: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test2: JSON.parse(JSON.stringify(snOut)),
      processedJsonData,
      dataTableData,
      layerInfoData,
      dashboardData,
      trafficData: trafficData ?? null,
    };
  } catch (error) {
    console.error('❌ taipei_m3 路段匯出 JSON 載入失敗:', error);
    throw error;
  }
}

export async function loadSpaceNetworkGridJson(layer) {
  try {
    let trafficDataOut = null;
    const fileName = layer.jsonFileName;
    // 從 /data/ 路徑載入
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
    const response = await loadFile(dataPath, fallbackPath);

    const jsonData = await response.json();

    // 提取 routes 陣列作為主要數據
    // 支援兩種格式：
    // 1. 直接是陣列格式：[...]
    // 2. 對象格式：{ routes: [...], meta: {...} }
    // 3. e 圖層匯出包：{ spaceNetworkGridJsonData: [...], ... }
    // 4. taipei_f／taipei_g：e 層「地圖路段匯出」純陣列 [{ routeName, segment, routeCoordinates }, ...] → 還原與 taipei_e 相同之 flat segments
    let routesData;
    let meta;
    let mapDrawnFImportBundle = null;

    if (
      isTaipeiTestFghiLayerId(layer.layerId) &&
      Array.isArray(jsonData) &&
      isMapDrawnRoutesExportArray(jsonData)
    ) {
      const mapDrawnRows = isTaipeiTestILayerTab(layer.layerId)
        ? jsonData.filter((row) => !isTaipeiIExcludedRouteName(row.routeName ?? row.route_name))
        : jsonData;
      const flatSegs = mapDrawnExportRowsToFlatSegments(mapDrawnRows);
      if (flatSegs.length > 0) {
        const { computeStationDataFromRoutes } = await import(
          './dataExecute/computeStationDataFromRoutes.js'
        );
        const computed = computeStationDataFromRoutes(flatSegs);
        routesData = flatSegs;
        meta = {};
        mapDrawnFImportBundle = {
          spaceNetworkGridJsonData_SectionData: computed.sectionData,
          spaceNetworkGridJsonData_ConnectData: computed.connectData,
          spaceNetworkGridJsonData_StationData: computed.stationData,
          showStationPlacement: true,
        };
      } else if (isTaipeiTestILayerTab(layer.layerId)) {
        const { computeStationDataFromRoutes } = await import(
          './dataExecute/computeStationDataFromRoutes.js'
        );
        const computed = computeStationDataFromRoutes([]);
        routesData = [];
        meta = {};
        mapDrawnFImportBundle = {
          spaceNetworkGridJsonData_SectionData: computed.sectionData,
          spaceNetworkGridJsonData_ConnectData: computed.connectData,
          spaceNetworkGridJsonData_StationData: computed.stationData,
          showStationPlacement: true,
        };
      }
    }

    if (mapDrawnFImportBundle == null) {
      if (Array.isArray(jsonData)) {
        routesData = jsonData;
        meta = {};
      } else if (jsonData && typeof jsonData === 'object') {
        if (Array.isArray(jsonData.spaceNetworkGridJsonData)) {
          routesData = jsonData.spaceNetworkGridJsonData;
        } else {
          routesData = jsonData.routes || [];
        }
        meta = jsonData.meta || {};
      } else {
        routesData = [];
        meta = {};
      }
    }

    if (isTaipeiTestILayerTab(layer.layerId) && Array.isArray(routesData)) {
      routesData = routesData.filter((r) => !isTaipeiIExcludedRouteName(r.route_name ?? r.name));
    }

    // 計算統計數據
    const totalRoutes = routesData.length;
    const totalSegments = routesData.reduce((sum, route) => sum + (route.segments || []).length, 0);

    // 計算總節點數（從 segments 中的 points 計算）
    let totalPoints = 0;
    for (const route of routesData) {
      for (const seg of route.segments || []) {
        totalPoints += (seg.points || []).length;
      }
    }

    // 建立摘要資料
    const dashboardData = {
      totalRoutes: totalRoutes,
      totalSegments: totalSegments,
      totalPoints: totalPoints,
      gridWidth: meta.width || 0,
      gridHeight: meta.height || 0,
      routeNames: routesData.map((route) => route.route_name || 'Unknown'),
    };

    // 建立圖層資訊數據
    const layerInfoData = {
      totalRoutes: totalRoutes,
      totalSegments: totalSegments,
      totalPoints: totalPoints,
      gridWidth: meta.width || 0,
      gridHeight: meta.height || 0,
      description: meta.description || '',
      projectName: meta.project_name || '',
    };

    // taipei_a / taipei_a2：用 L 型產生 dataTableData，並產生 spaceNetworkGridJsonData_SectionData / ConnectData / StationData（圖層 tab 顯示）
    if (isTaipeiTestStraighteningLayerId(layer.layerId)) {
      const { buildStraightSegments, generateDataTableDataFromLShapeSegments } = await import(
        './segmentUtils.js'
      );
      // 支援兩種格式：flat segments 或 routes with segments
      let layoutData = routesData;
      if (
        Array.isArray(routesData) &&
        routesData.length > 0 &&
        routesData[0]?.segments &&
        !routesData[0]?.points
      ) {
        layoutData = routesData.flatMap((r) =>
          (r.segments || []).map((s) => ({ ...s, name: r.route_name || r.name || 'Unknown' }))
        );
      }
      const straightSegments = buildStraightSegments(layoutData);
      const dataTableData = generateDataTableDataFromLShapeSegments(straightSegments);

      // 計算 SectionData / ConnectData / StationData 供「車站配置」按鈕使用；略過無站名（不存 "—"）
      const normalize = (v) => {
        const s = (v ?? '').trim();
        return s === '—' || s === '－' ? '' : s;
      };
      const spaceNetworkGridJsonData_SectionData = (routesData || []).map((route) => {
        const start = route.properties_start || {};
        const end = route.properties_end || {};
        const connect_start = JSON.parse(JSON.stringify(start));
        const connect_end = JSON.parse(JSON.stringify(end));
        const connectSids = new Set();
        const startSid = normalize(start.station_id ?? start.tags?.station_id ?? '');
        const endSid = normalize(end.station_id ?? end.tags?.station_id ?? '');
        if (startSid) connectSids.add(startSid);
        if (endSid) connectSids.add(endSid);
        const station_list = (route.nodes || [])
          .filter((n) => n.node_type === 'line')
          .map((n) => ({
            station_id: normalize(n.station_id ?? n.tags?.station_id ?? ''),
            station_name: normalize(n.station_name ?? n.tags?.station_name ?? n.tags?.name ?? ''),
          }))
          .filter((s) => s.station_id !== '' || s.station_name !== '')
          .filter((s) => !s.station_id || !connectSids.has(s.station_id));
        return { connect_start, connect_end, station_list };
      });

      const connectPointKey = (props) => {
        if (!props) return null;
        const cn = props.connect_number ?? props.tags?.connect_number;
        if (cn != null) return `cn:${cn}`;
        const x = props.x_grid ?? props.tags?.x_grid ?? '';
        const y = props.y_grid ?? props.tags?.y_grid ?? '';
        return `xy:${x},${y}`;
      };
      const connectPointMap = new Map();
      for (const route of routesData || []) {
        const routeName = route.route_name ?? route.name ?? 'Unknown';
        for (const propKey of ['properties_start', 'properties_end']) {
          const props = route[propKey];
          if (!props) continue;
          const key = connectPointKey(props);
          if (!key) continue;
          const attrs = JSON.parse(JSON.stringify(props));
          if (!connectPointMap.has(key)) {
            connectPointMap.set(key, { ...attrs, route_list: [] });
          }
          const entry = connectPointMap.get(key);
          if (!entry.route_list.includes(routeName)) entry.route_list.push(routeName);
        }
      }
      const spaceNetworkGridJsonData_ConnectData = Array.from(connectPointMap.values());

      // StationData：所有唯一車站（含完整屬性），供「車站配置」hover 使用；略過無站名（不存 "—"）
      const stationMap = new Map();
      for (const route of routesData || []) {
        for (const node of route.nodes || []) {
          const sid = normalize(node.station_id ?? node.tags?.station_id ?? '');
          const sname = normalize(
            node.station_name ?? node.tags?.station_name ?? node.tags?.name ?? ''
          );
          if (!sid && !sname) continue;
          const key = sid || sname;
          if (!stationMap.has(key)) {
            stationMap.set(key, {
              station_id: sid,
              station_name: sname,
              node_type: node.node_type ?? '',
              connect_number: node.connect_number ?? node.tags?.connect_number ?? null,
              x_grid: node.x_grid ?? node.tags?.x_grid ?? null,
              y_grid: node.y_grid ?? node.tags?.y_grid ?? null,
              tags: node.tags ? JSON.parse(JSON.stringify(node.tags)) : {},
            });
          }
        }
      }
      const spaceNetworkGridJsonData_StationData = Array.from(stationMap.values());

      // taipei_a / taipei_a2：不從 json 載入存 SectionData/ConnectData/StationData，由使用者點「儲存車站資訊」後才填入
      const omitStationDataForStraightening = isTaipeiTestStraighteningLayerId(layer.layerId);

      return {
        jsonData: jsonData,
        spaceNetworkGridJsonData: JSON.parse(JSON.stringify(routesData)),
        spaceNetworkGridJsonData_SectionData: omitStationDataForStraightening
          ? null
          : spaceNetworkGridJsonData_SectionData,
        spaceNetworkGridJsonData_ConnectData: omitStationDataForStraightening
          ? null
          : spaceNetworkGridJsonData_ConnectData,
        spaceNetworkGridJsonData_StationData: omitStationDataForStraightening
          ? null
          : spaceNetworkGridJsonData_StationData,
        layoutGridJsonData: JSON.parse(JSON.stringify(routesData)),
        layoutGridJsonData_Test: JSON.parse(JSON.stringify(routesData)),
        layoutGridJsonData_Test2: JSON.parse(JSON.stringify(routesData)),
        processedJsonData: routesData,
        dashboardData,
        dataTableData,
        layerInfoData,
      };
    }

    /** 扁平 segment 陣列（每筆含 points、name，無 segments[]）→ 權重迴圈用的假分組；繪圖仍用扁平 */
    let spaceNetworkFlatSegments = null;
    const isFlatSpaceNetworkSegmentList = (arr) =>
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr[0]?.points &&
      !(Array.isArray(arr[0]?.segments) && arr[0].segments.length > 0);

    if (isFlatSpaceNetworkSegmentList(routesData)) {
      spaceNetworkFlatSegments = JSON.parse(JSON.stringify(routesData));
      routesData = routesData.map((seg) => ({
        route_name: seg.name || seg.route_name || 'Unknown',
        segments: [seg],
        color: seg.way_properties?.tags?.color,
        original_props: seg.original_props || {},
      }));
      const nSeg = spaceNetworkFlatSegments.length;
      let pts = 0;
      for (const seg of spaceNetworkFlatSegments) {
        pts += (seg.points || []).length;
      }
      const nameSet = new Set();
      for (const seg of spaceNetworkFlatSegments) {
        const n = seg.name || seg.route_name;
        if (n) nameSet.add(n);
      }
      dashboardData.totalRoutes = nameSet.size || nSeg;
      dashboardData.totalSegments = nSeg;
      dashboardData.totalPoints = pts;
      dashboardData.routeNames = Array.from(nameSet);
      layerInfoData.totalRoutes = dashboardData.totalRoutes;
      layerInfoData.totalSegments = nSeg;
      layerInfoData.totalPoints = pts;
    }

    const isEExportWrapper =
      jsonData &&
      typeof jsonData === 'object' &&
      !Array.isArray(jsonData) &&
      Array.isArray(jsonData.spaceNetworkGridJsonData);
    const exportBundle = {};
    if (mapDrawnFImportBundle) {
      Object.assign(exportBundle, mapDrawnFImportBundle);
    }
    if (isEExportWrapper) {
      const copy = (k) =>
        jsonData[k] != null ? JSON.parse(JSON.stringify(jsonData[k])) : undefined;
      if (jsonData.spaceNetworkGridJsonData_SectionData != null) {
        exportBundle.spaceNetworkGridJsonData_SectionData = copy(
          'spaceNetworkGridJsonData_SectionData'
        );
      }
      if (jsonData.spaceNetworkGridJsonData_ConnectData != null) {
        exportBundle.spaceNetworkGridJsonData_ConnectData = copy(
          'spaceNetworkGridJsonData_ConnectData'
        );
      }
      if (jsonData.spaceNetworkGridJsonData_StationData != null) {
        exportBundle.spaceNetworkGridJsonData_StationData = copy(
          'spaceNetworkGridJsonData_StationData'
        );
      }
      if (typeof jsonData.showStationPlacement === 'boolean') {
        exportBundle.showStationPlacement = jsonData.showStationPlacement;
      }
    }

    /** taipei_f／taipei_g／taipei_h／taipei_h2／taipei_i／taipei_i2：依黑點切斷 segments、重算儀表板；表格列數＝切後 segment 數（h／h2／i／i2 另套流量 CSV；i2 與 taipei_h 同檔、獨立圖層） */
    let taipeiFDataTableData = null;
    if (isTaipeiTestFghiLayerId(layer.layerId)) {
      simplifyTaipeiNetworkSegmentsInRoutes(routesData);
      if (spaceNetworkFlatSegments != null) {
        spaceNetworkFlatSegments = routesData.flatMap((route) =>
          (route.segments || []).map((s) => ({
            ...s,
            route_name: route.route_name,
            name: s.name || route.route_name,
          }))
        );
      }
      const { splitTaipeiFRoutesAtBlackStations, rebuildTaipeiFStationConnectAfterSplit } =
        await import('./randomConnectSegmentWeights.js');
      const splitOpts = {
        connectData: exportBundle.spaceNetworkGridJsonData_ConnectData,
        stationData: exportBundle.spaceNetworkGridJsonData_StationData,
        sectionData: exportBundle.spaceNetworkGridJsonData_SectionData,
      };
      if (layer.layerId === 'taipei_i2') {
        splitOpts.initialSegmentWeight = 0;
      }
      taipeiFDataTableData = splitTaipeiFRoutesAtBlackStations(routesData, splitOpts);
      const rebuilt = rebuildTaipeiFStationConnectAfterSplit(routesData, {
        stationData: exportBundle.spaceNetworkGridJsonData_StationData,
        connectData: exportBundle.spaceNetworkGridJsonData_ConnectData,
      });
      exportBundle.spaceNetworkGridJsonData_StationData = rebuilt.stationData;
      exportBundle.spaceNetworkGridJsonData_ConnectData = rebuilt.connectData;
      if (spaceNetworkFlatSegments != null) {
        spaceNetworkFlatSegments = routesData.flatMap((route) =>
          (route.segments || []).map((s) => ({
            ...s,
            route_name: route.route_name,
            name: s.name || route.route_name,
          }))
        );
      }
      let ts = 0;
      let tp = 0;
      for (const route of routesData) {
        for (const seg of route.segments || []) {
          ts++;
          tp += (seg.points || []).length;
        }
      }
      dashboardData.totalSegments = ts;
      dashboardData.totalPoints = tp;
      layerInfoData.totalSegments = ts;
      layerInfoData.totalPoints = tp;

      if (
        (isTaipeiTestHLayerTab(layer.layerId) ||
          isTaipeiTestILayerTab(layer.layerId) ||
          layer.layerId === 'taipei_i2') &&
        typeof layer.csvLoader_Traffic === 'function'
      ) {
        const tr = await layer.csvLoader_Traffic(layer);
        trafficDataOut = tr.trafficData ?? null;
        const trafficStats = applyMrtTrafficVolumesToTaipeiRoutes(routesData, trafficDataOut, {
          connectData: exportBundle.spaceNetworkGridJsonData_ConnectData,
          stationData: exportBundle.spaceNetworkGridJsonData_StationData,
          sectionData: exportBundle.spaceNetworkGridJsonData_SectionData,
          /** taipei_h2／taipei_i2：CSV 總人次 ÷100 後四捨五入為整數權重 */
          divideTrafficVolumeBy100ToInt:
            layer.layerId === 'taipei_h2' || layer.layerId === 'taipei_i2',
          /** taipei_i2：CSV 對不到的切段不保留隨機權重，一律為 0 */
          zeroUnmatchedTraffic: layer.layerId === 'taipei_i2',
        });
        layerInfoData.trafficCsvRows = trafficDataOut?.rowCount ?? 0;
        layerInfoData.trafficEdgesMatched = trafficStats.matched;
        layerInfoData.trafficEdgesUnmatched = trafficStats.unmatched;
        if (layer.layerId === 'taipei_h2') {
          const { ensureTaipeiH2SegmentNavWeightDefaults } = await import(
            './taipeiH2ShortestPath.js'
          );
          ensureTaipeiH2SegmentNavWeightDefaults(routesData);
        }
        taipeiFDataTableData = buildTaipeiFDataTableRowsLikeSplitOutput(routesData, {
          connectData: exportBundle.spaceNetworkGridJsonData_ConnectData,
          stationData: exportBundle.spaceNetworkGridJsonData_StationData,
          sectionData: exportBundle.spaceNetworkGridJsonData_SectionData,
        });
      }
    }

    // 建立表格資料（✅ 每個黑點/節點一行；每行包含與該點相連的 2 個 weight，並由小到大排序）
    let dataTableData = [];

    // 輔助函數：從 node 物件中提取 station_name
    const getStationName = (node) => {
      if (!node) return '';
      return node.station_name || node.tags?.station_name || node.tags?.name || '';
    };

    const getStationId = (node) => {
      if (!node) return '';
      return node.station_id || node.tags?.station_id || '';
    };

    // 盡量用穩定且唯一的 key（優先 node.id，其次 station_id，其次 station_name + grid）
    const getNodeKey = (node) => {
      if (!node) return 'node:unknown';
      if (Number.isFinite(node.id)) return `id:${node.id}`;
      const sid = getStationId(node);
      if (sid) return `station_id:${sid}`;
      const name = getStationName(node) || 'unknown';
      const x = node.x_grid ?? node.tags?.x_grid ?? '';
      const y = node.y_grid ?? node.tags?.y_grid ?? '';
      return `name:${name}|x:${x}|y:${y}`;
    };

    // key -> { node, weights: number[], routeName: string, routeColor: string }
    // 注意：這裡用「route + node」做 key，讓轉乘站在不同路線各有一筆（每筆都會是 2 個相鄰權重）
    const nodeAdj = new Map();

    const ensureNodeEntry = (node, routeName, routeColor) => {
      const key = `${routeName}|${getNodeKey(node)}`;
      if (!nodeAdj.has(key)) {
        nodeAdj.set(key, { node, weights: [], routeName, routeColor: routeColor || '' });
      } else {
        // 用資訊更完整的 node 覆蓋（避免先遇到空物件）
        const cur = nodeAdj.get(key);
        const curName = getStationName(cur.node);
        const newName = getStationName(node);
        if (!curName && newName) cur.node = node;
        if (!cur.routeColor && routeColor) cur.routeColor = routeColor;
      }
      return key;
    };

    const addWeightToNode = (node, weight, routeName, routeColor) => {
      if (!node) return;
      const key = ensureNodeEntry(node, routeName, routeColor);
      if (typeof weight === 'number' && Number.isFinite(weight)) {
        nodeAdj.get(key).weights.push(weight);
      }
    };

    for (const route of routesData) {
      const routeName = route.route_name || 'Unknown';
      // 預設顏色（從 route 層級取得，如果有的話）
      const defaultRouteColor = route.original_props?.colour || route.color || '#999999';
      const segments = route.segments || [];

      for (let segIndex = 0; segIndex < segments.length; segIndex++) {
        const seg = segments[segIndex];
        // 優先從 segment 的 way_properties.tags.color 取得顏色（Step04/Step06 常見格式）
        const routeColor =
          seg.way_properties?.tags?.color || seg.way_properties?.tags?.colour || defaultRouteColor;
        const nodes = seg.nodes || [];
        const propertiesStart = seg.properties_start;
        const propertiesEnd = seg.properties_end;

        /**
         * Step04 / execute_4_1_to_6_1 格式：station_weights: [{ start_idx, end_idx, weight }, ...]
         * Step06 格式：edge_weights: [weight, weight, ...]（通常對應相鄰節點）
         */
        const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : null;
        const edgeWeights = Array.isArray(seg.edge_weights) ? seg.edge_weights : null;

        if (stationWeights && stationWeights.length > 0) {
          // ✅ 優先處理 station_weights（兩個黑點之間一個權重）
          for (let wIndex = 0; wIndex < stationWeights.length; wIndex++) {
            const wInfo = stationWeights[wIndex];
            const startIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
            const endIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
            const weight = wInfo?.weight;

            const startNode =
              startIdx === 0 ? propertiesStart || nodes[0] : nodes[startIdx] || nodes[0];
            const endNode =
              endIdx === nodes.length - 1
                ? propertiesEnd || nodes[endIdx]
                : nodes[endIdx] || nodes[nodes.length - 1];

            // 兩端節點都要收到這條邊的 weight
            addWeightToNode(startNode, weight, routeName, routeColor);
            addWeightToNode(endNode, weight, routeName, routeColor);
          }
        } else if (edgeWeights && edgeWeights.length > 0) {
          // ↩️ fallback：處理 edge_weights（相鄰節點之間的權重）
          for (let edgeIndex = 0; edgeIndex < edgeWeights.length; edgeIndex++) {
            const weight = edgeWeights[edgeIndex];

            const startNode =
              edgeIndex === 0 ? propertiesStart || nodes[0] : nodes[edgeIndex] || nodes[0];
            const endNode =
              edgeIndex === edgeWeights.length - 1
                ? propertiesEnd || nodes[edgeIndex + 1]
                : nodes[edgeIndex + 1] || nodes[nodes.length - 1];

            addWeightToNode(startNode, weight, routeName, routeColor);
            addWeightToNode(endNode, weight, routeName, routeColor);
          }
        } else {
          // 沒有 weight 資訊時，至少把節點本身登記起來（避免完全缺列）
          for (const node of nodes) ensureNodeEntry(node, routeName, routeColor);
          if (propertiesStart) ensureNodeEntry(propertiesStart, routeName, routeColor);
          if (propertiesEnd) ensureNodeEntry(propertiesEnd, routeName, routeColor);
        }
      }
    }

    // 產生 table rows
    if (layer.layerId === 'taipei_6_1_test2') {
      // 針對 taipei_6_1_test2：依序列出每2個相鄰row和col，顯示各自最大值
      // 收集所有節點的網格座標和權重
      // 重要：這裡一律以 seg.points 的座標為準（0..82 / 0..132），避免 node.x_grid / tags.x_grid 出現舊座標系（例如 203）
      const gridNodes = new Map(); // key: "x,y", value: { xGrid, yGrid, weights: number[] }

      const addWeightAt = (x, y, weight) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (typeof weight !== 'number' || !Number.isFinite(weight)) return;
        const xGrid = Math.round(x);
        const yGrid = Math.round(y);
        const key = `${xGrid},${yGrid}`;
        if (!gridNodes.has(key)) {
          gridNodes.set(key, { xGrid, yGrid, maxWeight: weight, weights: [weight] });
        } else {
          const existing = gridNodes.get(key);
          // 只保留 max，避免 rasterize 時塞爆 weights 陣列
          if (weight > (existing.maxWeight ?? -Infinity)) {
            existing.maxWeight = weight;
            existing.weights = [weight];
          }
        }
      };

      const rasterizeAndAddWeight = (ax, ay, bx, by, weight) => {
        // 目前資料主要是水平/垂直線段，但保守支援斜線（用 Bresenham）
        ax = Math.round(ax);
        ay = Math.round(ay);
        bx = Math.round(bx);
        by = Math.round(by);

        const dx = Math.abs(bx - ax);
        const dy = Math.abs(by - ay);

        if (dx === 0 && dy === 0) {
          addWeightAt(ax, ay, weight);
          return;
        }

        // 水平
        if (dy === 0) {
          const x0 = Math.min(ax, bx);
          const x1 = Math.max(ax, bx);
          for (let x = x0; x <= x1; x++) addWeightAt(x, ay, weight);
          return;
        }

        // 垂直
        if (dx === 0) {
          const y0 = Math.min(ay, by);
          const y1 = Math.max(ay, by);
          for (let y = y0; y <= y1; y++) addWeightAt(ax, y, weight);
          return;
        }

        // 斜線（Bresenham）
        let x = ax;
        let y = ay;
        const sx = ax < bx ? 1 : -1;
        const sy = ay < by ? 1 : -1;
        let err = dx - dy;
        // Use a bounded loop to avoid ESLint `no-constant-condition` on `while (true)`.
        // Bresenham should reach the end in <= dx + dy + 1 steps.
        const maxSteps = dx + dy + 1;
        for (let steps = 0; steps < maxSteps; steps++) {
          addWeightAt(x, y, weight);
          if (x === bx && y === by) break;
          const e2 = 2 * err;
          if (e2 > -dy) {
            err -= dy;
            x += sx;
          }
          if (e2 < dx) {
            err += dx;
            y += sy;
          }
        }
      };

      // 將 station_weights / edge_weights 依照端點座標分配到節點（兩端都累積）
      for (const route of routesData) {
        const segments = route?.segments || [];
        for (const seg of segments) {
          const points = Array.isArray(seg.points) ? seg.points : [];
          if (points.length < 2) continue;

          const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : null;
          const edgeWeights = Array.isArray(seg.edge_weights) ? seg.edge_weights : null;

          if (stationWeights && stationWeights.length > 0) {
            for (const wInfo of stationWeights) {
              const sIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
              const eIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
              const w = wInfo?.weight;
              if (
                sIdx === null ||
                eIdx === null ||
                sIdx < 0 ||
                eIdx < 0 ||
                sIdx >= points.length ||
                eIdx >= points.length
              ) {
                continue;
              }

              // 🎯 重要：points 相鄰兩點可能跳格（dx/dy > 1），必須把線段經過的格點都補齊
              const step = sIdx <= eIdx ? 1 : -1;
              for (let i = sIdx; i !== eIdx; i += step) {
                const p1 = points[i];
                const p2 = points[i + step];
                const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
                const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
                const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
                const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
                rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
              }
            }
          } else if (edgeWeights && edgeWeights.length > 0) {
            // edge_weights 通常對應 points[i] -> points[i+1]
            const nEdges = Math.min(edgeWeights.length, points.length - 1);
            for (let i = 0; i < nEdges; i++) {
              const w = edgeWeights[i];
              const p1 = points[i];
              const p2 = points[i + 1];
              const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
              const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
              const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
              const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
              rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
            }
          }
        }
      }

      // 找出網格的有效範圍（去除頭尾空行/列）
      let minRow = Infinity;
      let maxRow = -Infinity;
      let minCol = Infinity;
      let maxCol = -Infinity;

      for (const node of gridNodes.values()) {
        minRow = Math.min(minRow, node.yGrid);
        maxRow = Math.max(maxRow, node.yGrid);
        minCol = Math.min(minCol, node.xGrid);
        maxCol = Math.max(maxCol, node.xGrid);
      }

      // 如果沒有有效數據，直接返回
      if (
        minRow === Infinity ||
        maxRow === -Infinity ||
        minCol === Infinity ||
        maxCol === -Infinity
      ) {
        return {
          jsonData: jsonData,
          spaceNetworkGridJsonData: JSON.parse(JSON.stringify(routesData)),
          layoutGridJsonData: JSON.parse(JSON.stringify(routesData)),
          layoutGridJsonData_Test: JSON.parse(JSON.stringify(routesData)),
          layoutGridJsonData_Test2: JSON.parse(JSON.stringify(routesData)),
          // 注意：layoutGridJsonData_Test3 現在由 loadSpaceNetworkGridJson3 處理（專用於 taipei_6_1_test2）
          processedJsonData: routesData,
          dashboardData,
          dataTableData: [],
          layerInfoData,
        };
      }

      console.log(
        `🔍 [taipei_6_1_test2] 開始生成 dataTableData, minCol=${minCol}, maxCol=${maxCol}, minRow=${minRow}, maxRow=${maxRow}`
      );

      // 🎯 先計算每一列/行的最大值（確保每一列/行都有值）
      const colMaxValues = {}; // key: col index, value: max weight
      const rowMaxValues = {}; // key: row index, value: max weight

      // 初始化所有列/行的最大值為 0
      for (let col = minCol; col <= maxCol; col++) {
        colMaxValues[col] = 0;
      }
      for (let row = minRow; row <= maxRow; row++) {
        rowMaxValues[row] = 0;
      }

      // 從 gridNodes 計算每一列/行的最大值
      for (const node of gridNodes.values()) {
        const maxWeight = node.weights.length > 0 ? Math.max(...node.weights) : 0;
        colMaxValues[node.xGrid] = Math.max(colMaxValues[node.xGrid] || 0, maxWeight);
        rowMaxValues[node.yGrid] = Math.max(rowMaxValues[node.yGrid] || 0, maxWeight);
      }

      // 先收集所有有效的 col 和 row 數據（單個）
      const colSingles = [];
      const rowSingles = [];

      // 處理單個列（col i）- 先處理 col
      for (let col = minCol; col <= maxCol; col++) {
        // 使用預先計算的 colMaxValues（即使沒有節點也有值，至少是 0）
        const colMaxWeight = colMaxValues[col] ?? 0;

        colSingles.push({
          actualCol: col,
          colMaxWeight,
        });
      }

      // 處理單個行（row i）- 後處理 row
      for (let row = minRow; row <= maxRow; row++) {
        // 使用預先計算的 rowMaxValues（即使沒有節點也有值，至少是 0）
        const rowMaxWeight = rowMaxValues[row] ?? 0;

        rowSingles.push({
          actualRow: row,
          rowMaxWeight,
        });
      }

      console.log(`✅ 收集到 ${colSingles.length} 個 col, ${rowSingles.length} 個 row`);

      // 檢查哪些 row 有水平線，哪些 col 有垂直線，哪些 row/col 有交叉點（紅色點 connect）或黑點（station）
      const rowsWithHorizontalLines = new Set();
      const colsWithVerticalLines = new Set();
      const rowsWithConnectNodes = new Set();
      const colsWithConnectNodes = new Set();
      const rowsWithStationNodes = new Set();
      const colsWithStationNodes = new Set();

      // 遍歷所有路線的 segments，檢查是否有水平或垂直線，以及交叉點
      for (const route of routesData) {
        const segments = route.segments || [];
        for (const seg of segments) {
          const points = seg.points || [];
          const nodes = seg.nodes || [];
          const propertiesStart = seg.properties_start;
          const propertiesEnd = seg.properties_end;

          // 檢查每一段相鄰點之間的線段
          for (let i = 0; i < points.length - 1; i++) {
            const pt1 = points[i];
            const pt2 = points[i + 1];

            // 提取座標（支援陣列格式 [x, y] 或物件格式 {x, y}）
            const x1 = Array.isArray(pt1) ? pt1[0] : pt1.x || 0;
            const y1 = Array.isArray(pt1) ? pt1[1] : pt1.y || 0;
            const x2 = Array.isArray(pt2) ? pt2[0] : pt2.x || 0;
            const y2 = Array.isArray(pt2) ? pt2[1] : pt2.y || 0;

            // 四捨五入到整數（網格座標）
            const x1Grid = Math.round(x1);
            const y1Grid = Math.round(y1);
            const x2Grid = Math.round(x2);
            const y2Grid = Math.round(y2);

            // 檢查是否為水平線（y 相同，x 不同）
            if (y1Grid === y2Grid && x1Grid !== x2Grid) {
              // 這條水平線經過的 row
              rowsWithHorizontalLines.add(y1Grid);
            }

            // 檢查是否為垂直線（x 相同，y 不同）
            if (x1Grid === x2Grid && y1Grid !== y2Grid) {
              // 這條垂直線經過的 col
              colsWithVerticalLines.add(x1Grid);
            }
          }

          // 檢查交叉點（紅色點 connect）和黑點（station）- 檢查起點和終點
          // 注意：座標一律以 points 為準，避免 properties/nodes 內的 x_grid 帶入舊座標系
          // 檢查起點
          if (propertiesStart) {
            const nodeType =
              propertiesStart.node_type ||
              propertiesStart.tags?.node_type ||
              (propertiesStart.connect_number ? 'connect' : '');
            const hasConnectNumber = !!(
              propertiesStart.connect_number || propertiesStart.tags?.connect_number
            );
            const hasStationId = !!(propertiesStart.station_id || propertiesStart.tags?.station_id);
            const hasStationName = !!(
              propertiesStart.station_name ||
              propertiesStart.tags?.station_name ||
              propertiesStart.tags?.name
            );

            const p0 = points?.[0];
            const x = Array.isArray(p0) ? p0[0] : p0?.x;
            const y = Array.isArray(p0) ? p0[1] : p0?.y;
            if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));

              // 檢查是否為 connect 節點（紅色點）
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }

              // 檢查是否為 station 節點（黑點）
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }

          // 檢查終點
          if (propertiesEnd) {
            const nodeType =
              propertiesEnd.node_type ||
              propertiesEnd.tags?.node_type ||
              (propertiesEnd.connect_number ? 'connect' : '');
            const hasConnectNumber = !!(
              propertiesEnd.connect_number || propertiesEnd.tags?.connect_number
            );
            const hasStationId = !!(propertiesEnd.station_id || propertiesEnd.tags?.station_id);
            const hasStationName = !!(
              propertiesEnd.station_name ||
              propertiesEnd.tags?.station_name ||
              propertiesEnd.tags?.name
            );

            const plast = points?.[points.length - 1];
            const x = Array.isArray(plast) ? plast[0] : plast?.x;
            const y = Array.isArray(plast) ? plast[1] : plast?.y;
            if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));

              // 檢查是否為 connect 節點（紅色點）
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }

              // 檢查是否為 station 節點（黑點）
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }

          // 檢查 nodes 列表中的 connect 節點（紅色點）和 station 節點（黑點）（座標仍以 points 為準）
          if (Array.isArray(nodes) && nodes.length > 0) {
            for (let i = 0; i < nodes.length && i < points.length; i++) {
              const node = nodes[i];
              const pt = points[i];
              if (!node || !pt) continue;

              const nodeType =
                node.node_type || node.tags?.node_type || (node.connect_number ? 'connect' : '');
              const hasConnectNumber = !!(node.connect_number || node.tags?.connect_number);
              const hasStationId = !!(node.station_id || node.tags?.station_id);
              const hasStationName = !!(
                node.station_name ||
                node.tags?.station_name ||
                node.tags?.name
              );

              const x = Array.isArray(pt) ? pt[0] : pt?.x;
              const y = Array.isArray(pt) ? pt[1] : pt?.y;
              if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;

              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));

              // 檢查是否為 connect 節點（紅色點）
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }

              // 檢查是否為 station 節點（黑點）：node_type === 'station' 或 有 station_id/station_name 但不是 connect
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }
        }
      }

      // 現在用相對位置（從 0 開始）來生成 dataTableData
      // 欄位需求：# type idx idx_max_weight removable 合併
      // removable 規則：如果該 col 有垂直線或該 row 有水平線，或有紅點（connect）或黑點（station），則為 X
      // 合併 欄位預設為 X
      // 先加入所有 col
      colSingles.forEach((single) => {
        const hasVerticalLine = colsWithVerticalLines.has(single.actualCol);
        const hasConnectNode = colsWithConnectNodes.has(single.actualCol);
        const hasStationNode = colsWithStationNodes.has(single.actualCol);
        dataTableData.push({
          type: 'col',
          idx: single.actualCol - minCol, // 相對位置（從 0 開始）
          idx_max_weight: single.colMaxWeight,
          removable: hasVerticalLine || hasConnectNode || hasStationNode ? 'X' : 'V',
          合併: 'X', // 預設為 X
        });
      });

      // 再加入所有 row
      rowSingles.forEach((single) => {
        const hasHorizontalLine = rowsWithHorizontalLines.has(single.actualRow);
        const hasConnectNode = rowsWithConnectNodes.has(single.actualRow);
        const hasStationNode = rowsWithStationNodes.has(single.actualRow);
        dataTableData.push({
          type: 'row',
          idx: single.actualRow - minRow, // 相對位置（從 0 開始）
          idx_max_weight: single.rowMaxWeight,
          removable: hasHorizontalLine || hasConnectNode || hasStationNode ? 'X' : 'V',
          合併: 'X', // 預設為 X
        });
      });

      // 排序：先用 type（先 col 再 row），然後用 idx_max_weight 由小到大
      dataTableData.sort((a, b) => {
        // 1. 先用 type 排序：先 col 再 row
        if (a.type !== b.type) {
          // 'col' < 'row'，所以 col 會排在前面
          return a.type === 'col' ? -1 : 1;
        }

        // 2. 然後用 idx_max_weight 由小到大
        const aMaxWeight = a.idx_max_weight ?? Number.POSITIVE_INFINITY;
        const bMaxWeight = b.idx_max_weight ?? Number.POSITIVE_INFINITY;
        return aMaxWeight - bMaxWeight;
      });

      // 添加序號 #（從 1 開始），並確保 # 在最前面
      dataTableData = dataTableData.map((item, index) => {
        return {
          '#': index + 1,
          type: item.type,
          idx: item.idx,
          idx_max_weight: item.idx_max_weight,
          removable: item.removable || 'V', // 預設為 'V'
          合併: item.合併 || 'X', // 預設為 'X'
        };
      });

      console.log(
        `🎯 前 5 筆 dataTableData:`,
        dataTableData.slice(0, 5).map((d) => ({
          '#': d['#'],
          type: d.type,
          idx: d.idx,
          idx_max_weight: d.idx_max_weight,
          removable: d.removable,
          合併: d.合併,
        }))
      );
    } else if (isTaipeiTestFghiLayerId(layer.layerId)) {
      dataTableData = Array.isArray(taipeiFDataTableData) ? taipeiFDataTableData : [];
    } else {
      // 其他圖層：每個節點 1 row，取最小的兩個 weight（由小到大）
      let rowIndex = 1;
      for (const entry of nodeAdj.values()) {
        const node = entry.node;
        const weights = (entry.weights || []).filter(
          (w) => typeof w === 'number' && Number.isFinite(w)
        );
        weights.sort((a, b) => a - b);

        // 依需求：每筆一定要有 2 個與該黑點相連的 weight（不足 2 的通常是路線端點，直接略過）
        if (weights.length < 2) continue;

        const w1 = weights[0];
        const w2 = weights[1];

        const stationId = getStationId(node);
        const xGrid = node?.x_grid ?? node?.tags?.x_grid ?? null;
        const yGrid = node?.y_grid ?? node?.tags?.y_grid ?? null;

        dataTableData.push({
          '#': rowIndex++,
          route_name: entry.routeName || '',
          route_color: entry.routeColor || '',
          station_id: stationId || '',
          station_name: getStationName(node),
          node_type: node?.node_type ?? '',
          x_grid: xGrid,
          y_grid: yGrid,
          weight_1: w1,
          weight_2: w2,
          合併: 'X',
        });
      }

      // 排序：先看 weight_1，再看 weight_2（都由小到大）
      dataTableData.sort((a, b) => {
        const a1 = a.weight_1 ?? Number.POSITIVE_INFINITY;
        const b1 = b.weight_1 ?? Number.POSITIVE_INFINITY;
        if (a1 !== b1) return a1 - b1;
        const a2 = a.weight_2 ?? Number.POSITIVE_INFINITY;
        const b2 = b.weight_2 ?? Number.POSITIVE_INFINITY;
        return a2 - b2;
      });

      // 重新編號（排序後更新 # 欄位）
      dataTableData.forEach((row, index) => {
        row['#'] = index + 1;
      });
    }

    const snOut =
      spaceNetworkFlatSegments != null
        ? JSON.parse(JSON.stringify(spaceNetworkFlatSegments))
        : JSON.parse(JSON.stringify(routesData));

    return {
      jsonData: jsonData, // 保持原始數據不變
      spaceNetworkGridJsonData: snOut,
      layoutGridJsonData: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test: JSON.parse(JSON.stringify(snOut)),
      layoutGridJsonData_Test2: JSON.parse(JSON.stringify(snOut)),
      processedJsonData: snOut,
      dashboardData,
      dataTableData,
      layerInfoData,
      trafficData: trafficDataOut,
      ...exportBundle,
    };
  } catch (error) {
    console.error('❌ 空間網絡網格 JSON 數據載入或處理失敗:', error);
    throw error;
  }
}

/**
 * 🎯 載入空間網絡網格 JSON 數據（版本3：專用於 taipei_6_1_test2）
 * 與 loadSpaceNetworkGridJson 的主要差異：
 * 1. layoutGridJsonData_Test3 為版面網格專用；另賦 spaceNetworkGridJsonData 供 SpaceNetworkGridTab 繪製路線
 * 2. 所有座標 *2（確保座標一定是偶數）
 *
 * @param {Object} layer - 圖層配置對象
 * @returns {Promise<Object>} 包含處理後數據的對象
 */
export async function loadSpaceNetworkGridJson3(layer) {
  try {
    const fileName = layer.jsonFileName;
    // 從 /data/ 路徑載入
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
    const response = await loadFile(dataPath, fallbackPath);

    const jsonData = await response.json();

    // 提取 routes 陣列作為主要數據
    // 支援兩種格式：
    // 1. 直接是陣列格式：[...]
    // 2. 對象格式：{ routes: [...], meta: {...} }
    let routesData;
    let meta;

    if (Array.isArray(jsonData)) {
      // 如果 jsonData 本身就是陣列，直接使用
      routesData = jsonData;
      meta = {};
    } else if (jsonData && typeof jsonData === 'object') {
      // 如果是對象格式，提取 routes 和 meta
      routesData = jsonData.routes || [];
      meta = jsonData.meta || {};
    } else {
      // 其他情況，設為空陣列
      routesData = [];
      meta = {};
    }

    // 🎯 所有座標 *2（確保座標一定是偶數）
    const scaleCoordinates = (routes) => {
      return routes.map((route) => {
        const segments = route.segments || [];
        return {
          ...route,
          segments: segments.map((seg) => {
            const points = seg.points || [];
            // 將每個點的座標 *2
            const scaledPoints = points.map((pt) => {
              if (Array.isArray(pt)) {
                // 陣列格式：[x, y] 或 [x, y, props]
                if (pt.length >= 2) {
                  const scaled = [pt[0] * 2, pt[1] * 2];
                  // 如果有第三個元素（props），保留它
                  if (pt.length > 2) {
                    scaled.push(pt[2]);
                  }
                  return scaled;
                }
                return pt;
              } else if (pt && typeof pt === 'object') {
                // 物件格式：{x, y, ...}
                return {
                  ...pt,
                  x: (pt.x || 0) * 2,
                  y: (pt.y || 0) * 2,
                };
              }
              return pt;
            });

            return {
              ...seg,
              points: scaledPoints,
            };
          }),
        };
      });
    };

    const scaledRoutesData = scaleCoordinates(routesData);

    // 計算統計數據
    const totalRoutes = scaledRoutesData.length;
    const totalSegments = scaledRoutesData.reduce(
      (sum, route) => sum + (route.segments || []).length,
      0
    );

    // 計算總節點數（從 segments 中的 points 計算）
    let totalPoints = 0;
    for (const route of scaledRoutesData) {
      for (const seg of route.segments || []) {
        totalPoints += (seg.points || []).length;
      }
    }

    // 建立摘要資料
    const dashboardData = {
      totalRoutes: totalRoutes,
      totalSegments: totalSegments,
      totalPoints: totalPoints,
      gridWidth: (meta.width || 0) * 2, // 網格寬度也 *2
      gridHeight: (meta.height || 0) * 2, // 網格高度也 *2
      routeNames: scaledRoutesData.map((route) => route.route_name || 'Unknown'),
    };

    // 建立圖層資訊數據
    const layerInfoData = {
      totalRoutes: totalRoutes,
      totalSegments: totalSegments,
      totalPoints: totalPoints,
      gridWidth: (meta.width || 0) * 2, // 網格寬度也 *2
      gridHeight: (meta.height || 0) * 2, // 網格高度也 *2
      description: meta.description || '',
      projectName: meta.project_name || '',
    };

    // 🎯 為 taipei_6_1_test2 生成 dataTableData（使用縮放後的座標）
    let dataTableData = [];
    if (layer.layerId === 'taipei_6_1_test2') {
      // 收集所有節點的網格座標和權重（使用縮放後的座標，已經是偶數）
      const gridNodes = new Map(); // key: "x,y", value: { xGrid, yGrid, weights: number[] }

      const addWeightAt = (x, y, weight) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (typeof weight !== 'number' || !Number.isFinite(weight)) return;
        const xGrid = Math.round(x);
        const yGrid = Math.round(y);
        const key = `${xGrid},${yGrid}`;
        if (!gridNodes.has(key)) {
          gridNodes.set(key, { xGrid, yGrid, maxWeight: weight, weights: [weight] });
        } else {
          const existing = gridNodes.get(key);
          if (weight > (existing.maxWeight ?? -Infinity)) {
            existing.maxWeight = weight;
            existing.weights = [weight];
          }
        }
      };

      const rasterizeAndAddWeight = (ax, ay, bx, by, weight) => {
        ax = Math.round(ax);
        ay = Math.round(ay);
        bx = Math.round(bx);
        by = Math.round(by);

        const dx = Math.abs(bx - ax);
        const dy = Math.abs(by - ay);

        if (dx === 0 && dy === 0) {
          addWeightAt(ax, ay, weight);
          return;
        }

        if (dy === 0) {
          const x0 = Math.min(ax, bx);
          const x1 = Math.max(ax, bx);
          for (let x = x0; x <= x1; x++) addWeightAt(x, ay, weight);
          return;
        }

        if (dx === 0) {
          const y0 = Math.min(ay, by);
          const y1 = Math.max(ay, by);
          for (let y = y0; y <= y1; y++) addWeightAt(ax, y, weight);
          return;
        }

        // 斜線（Bresenham）
        let x = ax;
        let y = ay;
        const sx = ax < bx ? 1 : -1;
        const sy = ay < by ? 1 : -1;
        let err = dx - dy;
        const maxSteps = dx + dy + 1;
        for (let steps = 0; steps < maxSteps; steps++) {
          addWeightAt(x, y, weight);
          if (x === bx && y === by) break;
          const e2 = 2 * err;
          if (e2 > -dy) {
            err -= dy;
            x += sx;
          }
          if (e2 < dx) {
            err += dx;
            y += sy;
          }
        }
      };

      // 將 station_weights / edge_weights 依照端點座標分配到節點（使用縮放後的座標）
      for (const route of scaledRoutesData) {
        const segments = route?.segments || [];
        for (const seg of segments) {
          const points = Array.isArray(seg.points) ? seg.points : [];
          if (points.length < 2) continue;

          const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : null;
          const edgeWeights = Array.isArray(seg.edge_weights) ? seg.edge_weights : null;

          if (stationWeights && stationWeights.length > 0) {
            for (const wInfo of stationWeights) {
              const sIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
              const eIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
              const w = wInfo?.weight;
              if (
                sIdx === null ||
                eIdx === null ||
                sIdx < 0 ||
                eIdx < 0 ||
                sIdx >= points.length ||
                eIdx >= points.length
              ) {
                continue;
              }

              const step = sIdx <= eIdx ? 1 : -1;
              for (let i = sIdx; i !== eIdx; i += step) {
                const p1 = points[i];
                const p2 = points[i + step];
                const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
                const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
                const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
                const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
                rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
              }
            }
          } else if (edgeWeights && edgeWeights.length > 0) {
            const nEdges = Math.min(edgeWeights.length, points.length - 1);
            for (let i = 0; i < nEdges; i++) {
              const w = edgeWeights[i];
              const p1 = points[i];
              const p2 = points[i + 1];
              const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
              const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
              const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
              const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
              rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
            }
          }
        }
      }

      // 找出網格的有效範圍
      let minRow = Infinity;
      let maxRow = -Infinity;
      let minCol = Infinity;
      let maxCol = -Infinity;

      for (const node of gridNodes.values()) {
        minRow = Math.min(minRow, node.yGrid);
        maxRow = Math.max(maxRow, node.yGrid);
        minCol = Math.min(minCol, node.xGrid);
        maxCol = Math.max(maxCol, node.xGrid);
      }

      if (
        minRow === Infinity ||
        maxRow === -Infinity ||
        minCol === Infinity ||
        maxCol === -Infinity
      ) {
        return {
          jsonData: jsonData,
          spaceNetworkGridJsonData: JSON.parse(JSON.stringify(scaledRoutesData)),
          layoutGridJsonData_Test3: JSON.parse(JSON.stringify(scaledRoutesData)),
          dashboardData,
          layerInfoData,
          dataTableData: [],
        };
      }

      console.log(
        `🔍 [taipei_6_1_test2] 開始生成 dataTableData (loadSpaceNetworkGridJson3), minCol=${minCol}, maxCol=${maxCol}, minRow=${minRow}, maxRow=${maxRow}`
      );

      // 計算每一列/行的最大值
      const colMaxValues = {};
      const rowMaxValues = {};

      for (let col = minCol; col <= maxCol; col++) {
        colMaxValues[col] = 0;
      }
      for (let row = minRow; row <= maxRow; row++) {
        rowMaxValues[row] = 0;
      }

      for (const node of gridNodes.values()) {
        const maxWeight = node.weights.length > 0 ? Math.max(...node.weights) : 0;
        colMaxValues[node.xGrid] = Math.max(colMaxValues[node.xGrid] || 0, maxWeight);
        rowMaxValues[node.yGrid] = Math.max(rowMaxValues[node.yGrid] || 0, maxWeight);
      }

      const colSingles = [];
      const rowSingles = [];

      for (let col = minCol; col <= maxCol; col++) {
        colSingles.push({
          actualCol: col,
          colMaxWeight: colMaxValues[col] ?? 0,
        });
      }

      for (let row = minRow; row <= maxRow; row++) {
        rowSingles.push({
          actualRow: row,
          rowMaxWeight: rowMaxValues[row] ?? 0,
        });
      }

      console.log(`✅ 收集到 ${colSingles.length} 個 col, ${rowSingles.length} 個 row`);

      // 檢查哪些 row 有水平線，哪些 col 有垂直線，哪些 row/col 有交叉點（紅色點 connect）或黑點（station）
      const rowsWithHorizontalLines = new Set();
      const colsWithVerticalLines = new Set();
      const rowsWithConnectNodes = new Set();
      const colsWithConnectNodes = new Set();
      const rowsWithStationNodes = new Set();
      const colsWithStationNodes = new Set();

      for (const route of scaledRoutesData) {
        const segments = route.segments || [];
        for (const seg of segments) {
          const points = seg.points || [];
          const nodes = seg.nodes || [];
          const propertiesStart = seg.properties_start;
          const propertiesEnd = seg.properties_end;

          for (let i = 0; i < points.length - 1; i++) {
            const pt1 = points[i];
            const pt2 = points[i + 1];
            const x1 = Array.isArray(pt1) ? pt1[0] : pt1.x || 0;
            const y1 = Array.isArray(pt1) ? pt1[1] : pt1.y || 0;
            const x2 = Array.isArray(pt2) ? pt2[0] : pt2.x || 0;
            const y2 = Array.isArray(pt2) ? pt2[1] : pt2.y || 0;
            const x1Grid = Math.round(x1);
            const y1Grid = Math.round(y1);
            const x2Grid = Math.round(x2);
            const y2Grid = Math.round(y2);

            if (y1Grid === y2Grid && x1Grid !== x2Grid) {
              rowsWithHorizontalLines.add(y1Grid);
            }
            if (x1Grid === x2Grid && y1Grid !== y2Grid) {
              colsWithVerticalLines.add(x1Grid);
            }
          }

          if (propertiesStart) {
            const nodeType =
              propertiesStart.node_type ||
              propertiesStart.tags?.node_type ||
              (propertiesStart.connect_number ? 'connect' : '');
            const hasConnectNumber = !!(
              propertiesStart.connect_number || propertiesStart.tags?.connect_number
            );
            const hasStationId = !!(propertiesStart.station_id || propertiesStart.tags?.station_id);
            const hasStationName = !!(
              propertiesStart.station_name ||
              propertiesStart.tags?.station_name ||
              propertiesStart.tags?.name
            );
            const p0 = points?.[0];
            const x = Array.isArray(p0) ? p0[0] : p0?.x;
            const y = Array.isArray(p0) ? p0[1] : p0?.y;
            if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }

          if (propertiesEnd) {
            const nodeType =
              propertiesEnd.node_type ||
              propertiesEnd.tags?.node_type ||
              (propertiesEnd.connect_number ? 'connect' : '');
            const hasConnectNumber = !!(
              propertiesEnd.connect_number || propertiesEnd.tags?.connect_number
            );
            const hasStationId = !!(propertiesEnd.station_id || propertiesEnd.tags?.station_id);
            const hasStationName = !!(
              propertiesEnd.station_name ||
              propertiesEnd.tags?.station_name ||
              propertiesEnd.tags?.name
            );
            const plast = points?.[points.length - 1];
            const x = Array.isArray(plast) ? plast[0] : plast?.x;
            const y = Array.isArray(plast) ? plast[1] : plast?.y;
            if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }

          if (Array.isArray(nodes) && nodes.length > 0) {
            for (let i = 0; i < nodes.length && i < points.length; i++) {
              const node = nodes[i];
              const pt = points[i];
              if (!node || !pt) continue;
              const nodeType =
                node.node_type || node.tags?.node_type || (node.connect_number ? 'connect' : '');
              const hasConnectNumber = !!(node.connect_number || node.tags?.connect_number);
              const hasStationId = !!(node.station_id || node.tags?.station_id);
              const hasStationName = !!(
                node.station_name ||
                node.tags?.station_name ||
                node.tags?.name
              );
              const x = Array.isArray(pt) ? pt[0] : pt?.x;
              const y = Array.isArray(pt) ? pt[1] : pt?.y;
              if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }
        }
      }

      // 生成 dataTableData
      colSingles.forEach((single) => {
        const hasVerticalLine = colsWithVerticalLines.has(single.actualCol);
        const hasConnectNode = colsWithConnectNodes.has(single.actualCol);
        const hasStationNode = colsWithStationNodes.has(single.actualCol);
        dataTableData.push({
          type: 'col',
          idx: single.actualCol - minCol,
          idx_max_weight: single.colMaxWeight,
          removable: hasVerticalLine || hasConnectNode || hasStationNode ? 'X' : 'V',
          刪除: 'X',
        });
      });

      rowSingles.forEach((single) => {
        const hasHorizontalLine = rowsWithHorizontalLines.has(single.actualRow);
        const hasConnectNode = rowsWithConnectNodes.has(single.actualRow);
        const hasStationNode = rowsWithStationNodes.has(single.actualRow);
        dataTableData.push({
          type: 'row',
          idx: single.actualRow - minRow,
          idx_max_weight: single.rowMaxWeight,
          removable: hasHorizontalLine || hasConnectNode || hasStationNode ? 'X' : 'V',
          刪除: 'X',
        });
      });

      // 排序
      dataTableData.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'col' ? -1 : 1;
        }
        const aMaxWeight = a.idx_max_weight ?? Number.POSITIVE_INFINITY;
        const bMaxWeight = b.idx_max_weight ?? Number.POSITIVE_INFINITY;
        return aMaxWeight - bMaxWeight;
      });

      // 添加序號 #
      dataTableData = dataTableData.map((item, index) => {
        return {
          '#': index + 1,
          type: item.type,
          idx: item.idx,
          idx_max_weight: item.idx_max_weight,
          removable: item.removable || 'V',
          刪除: item.刪除 || 'X',
        };
      });

      console.log(
        `🎯 前 5 筆 dataTableData (loadSpaceNetworkGridJson3):`,
        dataTableData.slice(0, 5).map((d) => ({
          '#': d['#'],
          type: d.type,
          idx: d.idx,
          idx_max_weight: d.idx_max_weight,
          removable: d.removable,
          刪除: d.刪除,
        }))
      );
    }

    return {
      jsonData: jsonData, // 保持原始數據不變
      spaceNetworkGridJsonData: JSON.parse(JSON.stringify(scaledRoutesData)), // 與 taipei_6_1_test 相同欄位，供 SpaceNetworkGridTab
      layoutGridJsonData_Test3: JSON.parse(JSON.stringify(scaledRoutesData)), // 版面網格測試3數據（座標已 *2，深拷貝）
      dashboardData,
      layerInfoData,
      dataTableData, // 添加 dataTableData
    };
  } catch (error) {
    console.error('❌ 空間網絡網格 JSON 數據載入或處理失敗 (loadSpaceNetworkGridJson3):', error);
    throw error;
  }
}

export async function loadSpaceNetworkGridJson4(layer) {
  try {
    const fileName = layer.jsonFileName;
    // 從 /data/ 路徑載入
    const dataPath = `${PATH_CONFIG.JSON}/${fileName}`;
    const fallbackPath = `${PATH_CONFIG.FALLBACK_JSON}/${fileName}`;
    const response = await loadFile(dataPath, fallbackPath);

    const jsonData = await response.json();

    // 提取 routes 陣列作為主要數據
    // 支援兩種格式：
    // 1. 直接是陣列格式：[...]
    // 2. 對象格式：{ routes: [...], meta: {...} }
    let routesData;
    let meta;

    if (Array.isArray(jsonData)) {
      // 如果 jsonData 本身就是陣列，直接使用
      routesData = jsonData;
      meta = {};
    } else if (jsonData && typeof jsonData === 'object') {
      // 如果是對象格式，提取 routes 和 meta
      routesData = jsonData.routes || [];
      meta = jsonData.meta || {};
    } else {
      // 其他情況，設為空陣列
      routesData = [];
      meta = {};
    }

    // 🎯 先檢查哪些 row 有水平線，哪些 col 有垂直線，哪些 row/col 有交叉點（紅色點 connect）或黑點（station）
    // 使用原始數據（未乘以2）來檢查
    const rowsWithHorizontalLines = new Set();
    const colsWithVerticalLines = new Set();
    const rowsWithConnectNodes = new Set();
    const colsWithConnectNodes = new Set();
    const rowsWithStationNodes = new Set();
    const colsWithStationNodes = new Set();

    // 遍歷所有路線的 segments，檢查是否有水平或垂直線，以及交叉點
    // 使用原始數據（未乘以2）來檢查
    for (const route of routesData) {
      const segments = route.segments || [];
      for (const seg of segments) {
        const points = seg.points || [];
        const nodes = seg.nodes || [];
        const propertiesStart = seg.properties_start;
        const propertiesEnd = seg.properties_end;

        // 檢查每一段相鄰點之間的線段
        for (let i = 0; i < points.length - 1; i++) {
          const pt1 = points[i];
          const pt2 = points[i + 1];
          const x1 = Array.isArray(pt1) ? pt1[0] : pt1.x || 0;
          const y1 = Array.isArray(pt1) ? pt1[1] : pt1.y || 0;
          const x2 = Array.isArray(pt2) ? pt2[0] : pt2.x || 0;
          const y2 = Array.isArray(pt2) ? pt2[1] : pt2.y || 0;
          const x1Grid = Math.round(x1);
          const y1Grid = Math.round(y1);
          const x2Grid = Math.round(x2);
          const y2Grid = Math.round(y2);

          // 水平線（同一行）
          if (y1Grid === y2Grid && x1Grid !== x2Grid) {
            rowsWithHorizontalLines.add(y1Grid);
          }
          // 垂直線（同一列）
          if (x1Grid === x2Grid && y1Grid !== y2Grid) {
            colsWithVerticalLines.add(x1Grid);
          }
        }

        // 檢查起點
        if (propertiesStart) {
          const nodeType =
            propertiesStart.node_type ||
            propertiesStart.tags?.node_type ||
            (propertiesStart.connect_number ? 'connect' : '');
          const hasConnectNumber = !!(
            propertiesStart.connect_number || propertiesStart.tags?.connect_number
          );
          const hasStationId = !!(propertiesStart.station_id || propertiesStart.tags?.station_id);
          const hasStationName = !!(
            propertiesStart.station_name ||
            propertiesStart.tags?.station_name ||
            propertiesStart.tags?.name
          );
          const p0 = points?.[0];
          const x = Array.isArray(p0) ? p0[0] : p0?.x;
          const y = Array.isArray(p0) ? p0[1] : p0?.y;
          if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
            const xGrid = Math.round(Number(x));
            const yGrid = Math.round(Number(y));
            if (nodeType === 'connect' || hasConnectNumber) {
              colsWithConnectNodes.add(xGrid);
              rowsWithConnectNodes.add(yGrid);
            }
            if (
              nodeType === 'station' ||
              ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
            ) {
              colsWithStationNodes.add(xGrid);
              rowsWithStationNodes.add(yGrid);
            }
          }
        }

        // 檢查終點
        if (propertiesEnd) {
          const nodeType =
            propertiesEnd.node_type ||
            propertiesEnd.tags?.node_type ||
            (propertiesEnd.connect_number ? 'connect' : '');
          const hasConnectNumber = !!(
            propertiesEnd.connect_number || propertiesEnd.tags?.connect_number
          );
          const hasStationId = !!(propertiesEnd.station_id || propertiesEnd.tags?.station_id);
          const hasStationName = !!(
            propertiesEnd.station_name ||
            propertiesEnd.tags?.station_name ||
            propertiesEnd.tags?.name
          );
          const plast = points?.[points.length - 1];
          const x = Array.isArray(plast) ? plast[0] : plast?.x;
          const y = Array.isArray(plast) ? plast[1] : plast?.y;
          if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
            const xGrid = Math.round(Number(x));
            const yGrid = Math.round(Number(y));
            if (nodeType === 'connect' || hasConnectNumber) {
              colsWithConnectNodes.add(xGrid);
              rowsWithConnectNodes.add(yGrid);
            }
            if (
              nodeType === 'station' ||
              ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
            ) {
              colsWithStationNodes.add(xGrid);
              rowsWithStationNodes.add(yGrid);
            }
          }
        }

        // 檢查 nodes 陣列中的節點
        if (Array.isArray(nodes) && nodes.length > 0) {
          for (let i = 0; i < nodes.length && i < points.length; i++) {
            const node = nodes[i];
            const pt = points[i];
            if (!node || !pt) continue;
            const nodeType =
              node.node_type || node.tags?.node_type || (node.connect_number ? 'connect' : '');
            const hasConnectNumber = !!(node.connect_number || node.tags?.connect_number);
            const hasStationId = !!(node.station_id || node.tags?.station_id);
            const hasStationName = !!(
              node.station_name ||
              node.tags?.station_name ||
              node.tags?.name
            );
            const x = Array.isArray(pt) ? pt[0] : pt?.x;
            const y = Array.isArray(pt) ? pt[1] : pt?.y;
            if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
            const xGrid = Math.round(Number(x));
            const yGrid = Math.round(Number(y));
            if (nodeType === 'connect' || hasConnectNumber) {
              colsWithConnectNodes.add(xGrid);
              rowsWithConnectNodes.add(yGrid);
            }
            if (
              nodeType === 'station' ||
              ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
            ) {
              colsWithStationNodes.add(xGrid);
              rowsWithStationNodes.add(yGrid);
            }
          }
        }
      }
    }

    // 🎯 找出需要保留的行和列（有黑點、紅點或路線的行/列）
    const validRows = new Set();
    const validCols = new Set();

    // 合併所有有效的行和列
    rowsWithHorizontalLines.forEach((row) => validRows.add(row));
    rowsWithConnectNodes.forEach((row) => validRows.add(row));
    rowsWithStationNodes.forEach((row) => validRows.add(row));

    colsWithVerticalLines.forEach((col) => validCols.add(col));
    colsWithConnectNodes.forEach((col) => validCols.add(col));
    colsWithStationNodes.forEach((col) => validCols.add(col));

    // 如果沒有有效的行或列，使用原始數據
    if (validRows.size === 0 || validCols.size === 0) {
      console.warn('⚠️ 沒有找到有效的行或列，跳過刪除空行/列的操作');
    } else {
      // 建立行和列的映射表（舊座標 -> 新座標）
      const sortedRows = Array.from(validRows).sort((a, b) => a - b);
      const sortedCols = Array.from(validCols).sort((a, b) => a - b);

      const rowMap = new Map(); // 舊 row -> 新 row
      const colMap = new Map(); // 舊 col -> 新 col

      sortedRows.forEach((oldRow, index) => {
        rowMap.set(oldRow, index);
      });

      sortedCols.forEach((oldCol, index) => {
        colMap.set(oldCol, index);
      });

      // 🎯 重新映射所有點的座標
      const remapCoordinates = (routes) => {
        return routes.map((route) => {
          const segments = route.segments || [];
          return {
            ...route,
            segments: segments.map((seg) => {
              const points = seg.points || [];
              const remappedPoints = points.map((pt) => {
                if (Array.isArray(pt)) {
                  // 陣列格式：[x, y] 或 [x, y, props]
                  if (pt.length >= 2) {
                    const oldX = pt[0];
                    const oldY = pt[1];
                    const oldXGrid = Math.round(oldX);
                    const oldYGrid = Math.round(oldY);

                    // 如果該座標不在有效列/行中，使用最接近的有效座標
                    let newX = oldX;
                    let newY = oldY;

                    if (colMap.has(oldXGrid)) {
                      newX = colMap.get(oldXGrid);
                    } else {
                      // 找到最接近的有效列
                      let closestCol = sortedCols[0];
                      let minDist = Math.abs(oldXGrid - closestCol);
                      for (const col of sortedCols) {
                        const dist = Math.abs(oldXGrid - col);
                        if (dist < minDist) {
                          minDist = dist;
                          closestCol = col;
                        }
                      }
                      newX = colMap.get(closestCol);
                    }

                    if (rowMap.has(oldYGrid)) {
                      newY = rowMap.get(oldYGrid);
                    } else {
                      // 找到最接近的有效行
                      let closestRow = sortedRows[0];
                      let minDist = Math.abs(oldYGrid - closestRow);
                      for (const row of sortedRows) {
                        const dist = Math.abs(oldYGrid - row);
                        if (dist < minDist) {
                          minDist = dist;
                          closestRow = row;
                        }
                      }
                      newY = rowMap.get(closestRow);
                    }

                    const remapped = [newX, newY];
                    // 如果有第三個元素（props），保留它
                    if (pt.length > 2) {
                      remapped.push(pt[2]);
                    }
                    return remapped;
                  }
                  return pt;
                } else if (pt && typeof pt === 'object') {
                  // 物件格式：{x, y, ...}
                  const oldX = pt.x || 0;
                  const oldY = pt.y || 0;
                  const oldXGrid = Math.round(oldX);
                  const oldYGrid = Math.round(oldY);

                  let newX = oldX;
                  let newY = oldY;

                  if (colMap.has(oldXGrid)) {
                    newX = colMap.get(oldXGrid);
                  } else {
                    let closestCol = sortedCols[0];
                    let minDist = Math.abs(oldXGrid - closestCol);
                    for (const col of sortedCols) {
                      const dist = Math.abs(oldXGrid - col);
                      if (dist < minDist) {
                        minDist = dist;
                        closestCol = col;
                      }
                    }
                    newX = colMap.get(closestCol);
                  }

                  if (rowMap.has(oldYGrid)) {
                    newY = rowMap.get(oldYGrid);
                  } else {
                    let closestRow = sortedRows[0];
                    let minDist = Math.abs(oldYGrid - closestRow);
                    for (const row of sortedRows) {
                      const dist = Math.abs(oldYGrid - row);
                      if (dist < minDist) {
                        minDist = dist;
                        closestRow = row;
                      }
                    }
                    newY = rowMap.get(closestRow);
                  }

                  return {
                    ...pt,
                    x: newX,
                    y: newY,
                  };
                }
                return pt;
              });

              return {
                ...seg,
                points: remappedPoints,
              };
            }),
          };
        });
      };

      const remappedRoutesData = remapCoordinates(routesData);
      console.log(`✅ 已刪除空行/列：保留 ${sortedRows.length} 行，${sortedCols.length} 列`);

      // 更新 meta 資訊
      meta.width = sortedCols.length;
      meta.height = sortedRows.length;

      // 使用重新映射後的數據替換原始數據
      routesData.length = 0;
      routesData.push(...remappedRoutesData);
    }

    // 🎯 所有座標 *2（確保座標一定是偶數）
    // 在刪除空行/列之後再乘以2
    const scaleCoordinates = (routes) => {
      const getXYFromPoint = (pt) => {
        if (Array.isArray(pt) && pt.length >= 2) return [Number(pt[0]), Number(pt[1])];
        if (pt && typeof pt === 'object') return [Number(pt.x), Number(pt.y)];
        return [NaN, NaN];
      };

      return routes.map((route) => {
        const segments = route.segments || [];
        return {
          ...route,
          segments: segments.map((seg) => {
            const points = seg.points || [];
            // 將每個點的座標 *2
            const scaledPoints = points.map((pt) => {
              if (Array.isArray(pt)) {
                // 陣列格式：[x, y] 或 [x, y, props]
                if (pt.length >= 2) {
                  const scaled = [pt[0] * 2, pt[1] * 2];
                  // 如果有第三個元素（props），保留它
                  if (pt.length > 2) {
                    scaled.push(pt[2]);
                  }
                  return scaled;
                }
                return pt;
              } else if (pt && typeof pt === 'object') {
                // 物件格式：{x, y, ...}
                return {
                  ...pt,
                  x: (pt.x || 0) * 2,
                  y: (pt.y || 0) * 2,
                };
              }
              return pt;
            });

            // ✅ 同步更新 segment 端點座標資訊（避免 LayoutGridTab_Test4 用 properties_start/end 的舊座標造成「紅點不見」）
            const [startX, startY] = getXYFromPoint(scaledPoints[0]);
            const [endX, endY] = getXYFromPoint(scaledPoints[scaledPoints.length - 1]);

            const nextPropertiesStart = seg.properties_start
              ? { ...seg.properties_start, x_grid: startX, y_grid: startY }
              : seg.properties_start;
            const nextPropertiesEnd = seg.properties_end
              ? { ...seg.properties_end, x_grid: endX, y_grid: endY }
              : seg.properties_end;

            const nextStartCoord = Array.isArray(seg.start_coord)
              ? [startX, startY]
              : seg.start_coord;
            const nextEndCoord = Array.isArray(seg.end_coord) ? [endX, endY] : seg.end_coord;

            // （選擇性）同步 nodes 的 x_grid/y_grid（tooltip/其他 tab 可能會看）
            const nextNodes = Array.isArray(seg.nodes)
              ? seg.nodes.map((node, idx) => {
                  const p = scaledPoints[idx];
                  const [nx, ny] = getXYFromPoint(p);
                  if (!node || (!Number.isFinite(nx) && !Number.isFinite(ny))) return node;
                  return { ...node, x_grid: nx, y_grid: ny };
                })
              : seg.nodes;

            return {
              ...seg,
              points: scaledPoints,
              nodes: nextNodes,
              properties_start: nextPropertiesStart,
              properties_end: nextPropertiesEnd,
              start_coord: nextStartCoord,
              end_coord: nextEndCoord,
            };
          }),
        };
      });
    };

    // ✅ 不再合併 segments，直接使用原始的 segments 和 station_weights
    // 參考正確的 loadSpaceNetworkGridJson 的處理方式
    const scaledRoutesData = scaleCoordinates(routesData);

    // 🎯 為 taipei_6_1_test3 生成 dataTableData（與 taipei_6_1_test2 相同格式）
    let dataTableData = [];
    if (layer.layerId === 'taipei_6_1_test3') {
      // 針對 taipei_6_1_test3：依序列出每2個相鄰row和col，顯示各自最大值（與 taipei_6_1_test2 相同格式）
      // 收集所有節點的網格座標和權重（使用縮放後的座標，已經是偶數）
      const gridNodes = new Map(); // key: "x,y", value: { xGrid, yGrid, maxWeight: number, weights: number[] }

      const addWeightAt = (x, y, weight) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (typeof weight !== 'number' || !Number.isFinite(weight)) return;
        const xGrid = Math.round(x);
        const yGrid = Math.round(y);
        const key = `${xGrid},${yGrid}`;
        if (!gridNodes.has(key)) {
          gridNodes.set(key, { xGrid, yGrid, maxWeight: weight, weights: [weight] });
        } else {
          const existing = gridNodes.get(key);
          if (weight > (existing.maxWeight ?? -Infinity)) {
            existing.maxWeight = weight;
            existing.weights = [weight];
          }
        }
      };

      const rasterizeAndAddWeight = (ax, ay, bx, by, weight) => {
        ax = Math.round(ax);
        ay = Math.round(ay);
        bx = Math.round(bx);
        by = Math.round(by);

        const dx = Math.abs(bx - ax);
        const dy = Math.abs(by - ay);

        if (dx === 0 && dy === 0) {
          addWeightAt(ax, ay, weight);
          return;
        }

        if (dy === 0) {
          const x0 = Math.min(ax, bx);
          const x1 = Math.max(ax, bx);
          for (let x = x0; x <= x1; x++) addWeightAt(x, ay, weight);
          return;
        }

        if (dx === 0) {
          const y0 = Math.min(ay, by);
          const y1 = Math.max(ay, by);
          for (let y = y0; y <= y1; y++) addWeightAt(ax, y, weight);
          return;
        }

        // 斜線（Bresenham）
        let x = ax;
        let y = ay;
        const sx = ax < bx ? 1 : -1;
        const sy = ay < by ? 1 : -1;
        let err = dx - dy;
        const maxSteps = dx + dy + 1;
        for (let steps = 0; steps < maxSteps; steps++) {
          addWeightAt(x, y, weight);
          if (x === bx && y === by) break;
          const e2 = 2 * err;
          if (e2 > -dy) {
            err -= dy;
            x += sx;
          }
          if (e2 < dx) {
            err += dx;
            y += sy;
          }
        }
      };

      // 將 station_weights / edge_weights 依照端點座標分配到節點（使用縮放後的座標）
      for (const route of scaledRoutesData) {
        const segments = route?.segments || [];
        for (const seg of segments) {
          const points = Array.isArray(seg.points) ? seg.points : [];
          if (points.length < 2) continue;

          const stationWeights = Array.isArray(seg.station_weights) ? seg.station_weights : null;
          const edgeWeights = Array.isArray(seg.edge_weights) ? seg.edge_weights : null;

          if (stationWeights && stationWeights.length > 0) {
            for (const wInfo of stationWeights) {
              const sIdx = Number.isFinite(wInfo?.start_idx) ? wInfo.start_idx : null;
              const eIdx = Number.isFinite(wInfo?.end_idx) ? wInfo.end_idx : null;
              const w = wInfo?.weight;
              if (
                sIdx === null ||
                eIdx === null ||
                sIdx < 0 ||
                eIdx < 0 ||
                sIdx >= points.length ||
                eIdx >= points.length
              ) {
                continue;
              }

              const step = sIdx <= eIdx ? 1 : -1;
              for (let i = sIdx; i !== eIdx; i += step) {
                const p1 = points[i];
                const p2 = points[i + step];
                const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
                const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
                const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
                const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
                rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
              }
            }
          } else if (edgeWeights && edgeWeights.length > 0) {
            const nEdges = Math.min(edgeWeights.length, points.length - 1);
            for (let i = 0; i < nEdges; i++) {
              const w = edgeWeights[i];
              const p1 = points[i];
              const p2 = points[i + 1];
              const x1 = Array.isArray(p1) ? p1[0] : p1?.x;
              const y1 = Array.isArray(p1) ? p1[1] : p1?.y;
              const x2 = Array.isArray(p2) ? p2[0] : p2?.x;
              const y2 = Array.isArray(p2) ? p2[1] : p2?.y;
              rasterizeAndAddWeight(Number(x1), Number(y1), Number(x2), Number(y2), Number(w));
            }
          }
        }
      }

      // 找出網格的有效範圍
      let minRow = Infinity;
      let maxRow = -Infinity;
      let minCol = Infinity;
      let maxCol = -Infinity;

      for (const node of gridNodes.values()) {
        minRow = Math.min(minRow, node.yGrid);
        maxRow = Math.max(maxRow, node.yGrid);
        minCol = Math.min(minCol, node.xGrid);
        maxCol = Math.max(maxCol, node.xGrid);
      }

      if (
        minRow === Infinity ||
        maxRow === -Infinity ||
        minCol === Infinity ||
        maxCol === -Infinity
      ) {
        return {
          jsonData: jsonData,
          spaceNetworkGridJsonData: JSON.parse(JSON.stringify(scaledRoutesData)),
          layoutGridJsonData_Test4: JSON.parse(JSON.stringify(scaledRoutesData)),
          dashboardData,
          layerInfoData,
          dataTableData: [],
        };
      }

      console.log(
        `🔍 [taipei_6_1_test3] 開始生成 dataTableData (loadSpaceNetworkGridJson4), minCol=${minCol}, maxCol=${maxCol}, minRow=${minRow}, maxRow=${maxRow}`
      );

      // 計算每一列/行的最大值
      const colMaxValues = {};
      const rowMaxValues = {};

      for (let col = minCol; col <= maxCol; col++) {
        colMaxValues[col] = 0;
      }
      for (let row = minRow; row <= maxRow; row++) {
        rowMaxValues[row] = 0;
      }

      for (const node of gridNodes.values()) {
        const maxWeight = node.weights.length > 0 ? Math.max(...node.weights) : 0;
        colMaxValues[node.xGrid] = Math.max(colMaxValues[node.xGrid] || 0, maxWeight);
        rowMaxValues[node.yGrid] = Math.max(rowMaxValues[node.yGrid] || 0, maxWeight);
      }

      const colSingles = [];
      const rowSingles = [];

      for (let col = minCol; col <= maxCol; col++) {
        colSingles.push({
          actualCol: col,
          colMaxWeight: colMaxValues[col] ?? 0,
        });
      }

      for (let row = minRow; row <= maxRow; row++) {
        rowSingles.push({
          actualRow: row,
          rowMaxWeight: rowMaxValues[row] ?? 0,
        });
      }

      console.log(`✅ 收集到 ${colSingles.length} 個 col, ${rowSingles.length} 個 row`);

      // 檢查哪些 row 有水平線，哪些 col 有垂直線，哪些 row/col 有交叉點（紅色點 connect）或黑點（station）
      const rowsWithHorizontalLines = new Set();
      const colsWithVerticalLines = new Set();
      const rowsWithConnectNodes = new Set();
      const colsWithConnectNodes = new Set();
      const rowsWithStationNodes = new Set();
      const colsWithStationNodes = new Set();

      for (const route of scaledRoutesData) {
        const segments = route.segments || [];
        for (const seg of segments) {
          const points = seg.points || [];
          const nodes = seg.nodes || [];
          const propertiesStart = seg.properties_start;
          const propertiesEnd = seg.properties_end;

          for (let i = 0; i < points.length - 1; i++) {
            const pt1 = points[i];
            const pt2 = points[i + 1];
            const x1 = Array.isArray(pt1) ? pt1[0] : pt1.x || 0;
            const y1 = Array.isArray(pt1) ? pt1[1] : pt1.y || 0;
            const x2 = Array.isArray(pt2) ? pt2[0] : pt2.x || 0;
            const y2 = Array.isArray(pt2) ? pt2[1] : pt2.y || 0;
            const x1Grid = Math.round(x1);
            const y1Grid = Math.round(y1);
            const x2Grid = Math.round(x2);
            const y2Grid = Math.round(y2);

            if (y1Grid === y2Grid && x1Grid !== x2Grid) {
              rowsWithHorizontalLines.add(y1Grid);
            }
            if (x1Grid === x2Grid && y1Grid !== y2Grid) {
              colsWithVerticalLines.add(x1Grid);
            }
          }

          if (propertiesStart) {
            const nodeType =
              propertiesStart.node_type ||
              propertiesStart.tags?.node_type ||
              (propertiesStart.connect_number ? 'connect' : '');
            const hasConnectNumber = !!(
              propertiesStart.connect_number || propertiesStart.tags?.connect_number
            );
            const hasStationId = !!(propertiesStart.station_id || propertiesStart.tags?.station_id);
            const hasStationName = !!(
              propertiesStart.station_name ||
              propertiesStart.tags?.station_name ||
              propertiesStart.tags?.name
            );
            const p0 = points?.[0];
            const x = Array.isArray(p0) ? p0[0] : p0?.x;
            const y = Array.isArray(p0) ? p0[1] : p0?.y;
            if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }

          if (propertiesEnd) {
            const nodeType =
              propertiesEnd.node_type ||
              propertiesEnd.tags?.node_type ||
              (propertiesEnd.connect_number ? 'connect' : '');
            const hasConnectNumber = !!(
              propertiesEnd.connect_number || propertiesEnd.tags?.connect_number
            );
            const hasStationId = !!(propertiesEnd.station_id || propertiesEnd.tags?.station_id);
            const hasStationName = !!(
              propertiesEnd.station_name ||
              propertiesEnd.tags?.station_name ||
              propertiesEnd.tags?.name
            );
            const plast = points?.[points.length - 1];
            const x = Array.isArray(plast) ? plast[0] : plast?.x;
            const y = Array.isArray(plast) ? plast[1] : plast?.y;
            if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }

          if (Array.isArray(nodes) && nodes.length > 0) {
            for (let i = 0; i < nodes.length && i < points.length; i++) {
              const node = nodes[i];
              const pt = points[i];
              if (!node || !pt) continue;
              const nodeType =
                node.node_type || node.tags?.node_type || (node.connect_number ? 'connect' : '');
              const hasConnectNumber = !!(node.connect_number || node.tags?.connect_number);
              const hasStationId = !!(node.station_id || node.tags?.station_id);
              const hasStationName = !!(
                node.station_name ||
                node.tags?.station_name ||
                node.tags?.name
              );
              const x = Array.isArray(pt) ? pt[0] : pt?.x;
              const y = Array.isArray(pt) ? pt[1] : pt?.y;
              if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
              const xGrid = Math.round(Number(x));
              const yGrid = Math.round(Number(y));
              if (nodeType === 'connect' || hasConnectNumber) {
                colsWithConnectNodes.add(xGrid);
                rowsWithConnectNodes.add(yGrid);
              }
              if (
                nodeType === 'station' ||
                ((hasStationId || hasStationName) && nodeType !== 'connect' && !hasConnectNumber)
              ) {
                colsWithStationNodes.add(xGrid);
                rowsWithStationNodes.add(yGrid);
              }
            }
          }
        }
      }

      // 生成 dataTableData：每個單數網格與下一個單數網格一組（偶數是點，不參與組合）
      // 過濾出單數的 col（偶數是點）
      const colSinglesOdd = colSingles.filter((single) => {
        const idx = single.actualCol - minCol;
        return idx % 2 !== 0; // 只保留單數索引
      });

      // 處理 col：每個單數 col 與下一個單數 col 一組（形成重疊組合：1-3, 3-5, 5-7...）
      for (let i = 0; i < colSinglesOdd.length; i++) {
        const col1 = colSinglesOdd[i];
        const col2 = colSinglesOdd[i + 1];

        if (col1) {
          const idx1 = col1.actualCol - minCol;
          const idx1_max_weight = col1.colMaxWeight ?? 0;

          if (col2) {
            // 有下一個單數 col，組成一組
            const idx2 = col2.actualCol - minCol;
            const idx2_max_weight = col2.colMaxWeight ?? 0;
            dataTableData.push({
              type: 'col',
              idx1: idx1,
              idx2: idx2,
              idx1_max_weight: idx1_max_weight,
              idx2_max_weight: idx2_max_weight,
              合併: 'X',
            });
          } else {
            // 沒有下一個單數 col（最後一個），不添加（因為無法形成組合）
            // 如果需要，可以添加單獨一組，idx2 為 null
            // 但根據需求，應該每個都要有下一個，所以這裡跳過
          }
        }
      }

      // 過濾出單數的 row（偶數是點）
      const rowSinglesOdd = rowSingles.filter((single) => {
        const idx = single.actualRow - minRow;
        return idx % 2 !== 0; // 只保留單數索引
      });

      // 處理 row：每個單數 row 與下一個單數 row 一組（形成重疊組合：1-3, 3-5, 5-7...）
      for (let i = 0; i < rowSinglesOdd.length; i++) {
        const row1 = rowSinglesOdd[i];
        const row2 = rowSinglesOdd[i + 1];

        if (row1) {
          const idx1 = row1.actualRow - minRow;
          const idx1_max_weight = row1.rowMaxWeight ?? 0;

          if (row2) {
            // 有下一個單數 row，組成一組
            const idx2 = row2.actualRow - minRow;
            const idx2_max_weight = row2.rowMaxWeight ?? 0;
            dataTableData.push({
              type: 'row',
              idx1: idx1,
              idx2: idx2,
              idx1_max_weight: idx1_max_weight,
              idx2_max_weight: idx2_max_weight,
              合併: 'X',
            });
          } else {
            // 沒有下一個單數 row（最後一個），不添加（因為無法形成組合）
            // 如果需要，可以添加單獨一組，idx2 為 null
            // 但根據需求，應該每個都要有下一個，所以這裡跳過
          }
        }
      }

      // 排序：先按 type（col 在前），再按 idx1_max_weight + idx2_max_weight 的总和从小到大排序
      dataTableData.sort((a, b) => {
        // 1. 先用 type 排序：先 col 再 row
        if (a.type !== b.type) {
          return a.type === 'col' ? -1 : 1;
        }
        // 2. 相同 type 内，按 idx1_max_weight + idx2_max_weight 的总和从小到大排序
        const aSum = (a.idx1_max_weight ?? 0) + (a.idx2_max_weight ?? 0);
        const bSum = (b.idx1_max_weight ?? 0) + (b.idx2_max_weight ?? 0);
        return aSum - bSum;
      });

      // 添加序號 #
      dataTableData = dataTableData.map((item, index) => {
        return {
          '#': index + 1,
          type: item.type,
          idx1: item.idx1,
          idx2: item.idx2,
          idx1_max_weight: item.idx1_max_weight,
          idx2_max_weight: item.idx2_max_weight,
          合併: item.合併 ?? 'X',
        };
      });

      console.log(
        `🎯 [taipei_6_1_test3] 生成 dataTableData (每2個相鄰row/col一組)，共 ${dataTableData.length} 筆`
      );
    }

    // 計算統計數據
    const totalRoutes = scaledRoutesData.length;
    const totalSegments = scaledRoutesData.reduce(
      (sum, route) => sum + (route.segments || []).length,
      0
    );

    // 計算總節點數（從 segments 中的 points 計算）
    let totalPoints = 0;
    for (const route of scaledRoutesData) {
      for (const seg of route.segments || []) {
        totalPoints += (seg.points || []).length;
      }
    }

    // 獲取最終的網格尺寸（meta.width 和 meta.height 已經是刪除空行/列後的網格數量，座標乘以2不影響網格數量）
    const finalGridWidth = meta.width || 0;
    const finalGridHeight = meta.height || 0;

    // 建立摘要資料
    const dashboardData = {
      totalRoutes: totalRoutes,
      totalSegments: totalSegments,
      totalPoints: totalPoints,
      gridWidth: finalGridWidth,
      gridHeight: finalGridHeight,
      routeNames: scaledRoutesData.map((route) => route.route_name || 'Unknown'),
    };

    // 建立圖層資訊數據
    const layerInfoData = {
      totalRoutes: totalRoutes,
      totalSegments: totalSegments,
      totalPoints: totalPoints,
      gridWidth: finalGridWidth,
      gridHeight: finalGridHeight,
      description: meta.description || '',
      projectName: meta.project_name || '',
    };

    return {
      jsonData: jsonData, // 保持原始數據不變
      spaceNetworkGridJsonData: JSON.parse(JSON.stringify(scaledRoutesData)), // 供 SpaceNetworkGridTab 與 test 圖層一致
      layoutGridJsonData_Test4: JSON.parse(JSON.stringify(scaledRoutesData)), // 版面網格測試4數據（座標已 *2，深拷貝）
      dashboardData,
      layerInfoData,
      dataTableData, // 添加 dataTableData（僅 taipei_6_1_test3 會有值）
    };
  } catch (error) {
    console.error('❌ 空間網絡網格 JSON 數據載入或處理失敗 (loadSpaceNetworkGridJson4):', error);
    throw error;
  }
}
