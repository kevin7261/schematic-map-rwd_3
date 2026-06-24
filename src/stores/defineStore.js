/**
 * =============================================================================
 * 🗺️ defineStore.js - 地圖底圖與視圖配置管理中心
 * =============================================================================
 *
 * 用途：使用 Pinia 管理地圖底圖選擇和視圖狀態
 *
 * 主要功能：
 * - 🗺️ 地圖底圖配置管理（OpenStreetMap、Google Maps、Esri等）
 * - 📍 地圖視圖狀態管理（中心點、縮放等級）
 * - 🔄 底圖切換功能
 * - 💾 視圖狀態持久化
 *
 * 支援的底圖提供商：
 * - OpenStreetMap (開源街道圖)
 * - Esri (ArcGIS 服務)
 * - Google Maps (街道圖與衛星圖)
 * - 內政部國土測繪中心 (台灣官方地圖)
 * - Carto (專業製圖底圖)
 * - 自定義空白底圖
 *
 * @author 長期照護資源分析系統團隊
 * @version 2.0.0
 */

import { defineStore } from 'pinia';

// Default map center and zoom for Taiwan
const DEFAULT_MAP_CENTER = [23.5, 121.0]; // Taiwan center
const DEFAULT_MAP_ZOOM = 8; // Suitable for showing Taiwan

/**
 * 🗺️ 地圖定義存儲 (Map Definition Store)
 *
 * 此 Store 負責：
 * 1. 管理可用的底圖清單
 * 2. 追蹤當前選中的底圖
 * 3. 儲存地圖視圖狀態（中心點、縮放等級）
 * 4. 提供底圖切換和視圖更新的方法
 */
export const useDefineStore = defineStore('define', {
  // =============================================================================
  // 📊 狀態定義 (State Definition)
  // =============================================================================
  state: () => ({
    /**
     * 🎨 當前選中的底圖識別碼
     * @type {string}
     * @default 'carto_light_labels'
     * @description
     * - 預設使用 Carto Light 底圖（淺色主題，適合資料視覺化）
     * - 值對應 basemaps 陣列中的 value 欄位
     */
    selectedBasemap: 'carto_light_labels',

    /**
     * 🗺️ 地圖視圖狀態物件
     * @type {Object}
     * @property {[number, number]} center - 地圖中心點座標 [緯度, 經度]
     * @property {number} zoom - 地圖縮放等級 (1-20)
     * @description
     * - 保存用戶最後查看的地圖位置和縮放等級
     * - 用於地圖初始化和視圖恢復
     * - 由 MapTab 組件在地圖移動/縮放後更新
     */
    mapView: {
      center: DEFAULT_MAP_CENTER, // 預設中心點：台灣地理中心
      zoom: DEFAULT_MAP_ZOOM, // 預設縮放等級：8（適合顯示台灣全島）
    },

    /**
     * 🗺️ 可用底圖配置清單
     * @type {Array<{label: string, value: string, url: string}>}
     * @description
     * - 定義所有可用的底圖選項
     * - label: 用戶看到的底圖名稱（中文）
     * - value: 底圖的唯一識別碼
     * - url: WMTS/XYZ 瓦片服務的 URL 模板
     *
     * URL 模板變數：
     * - {s}: 子域名（a、b、c 等，用於負載平衡）
     * - {z}: 縮放等級
     * - {x}: X 軸瓦片索引
     * - {y}: Y 軸瓦片索引
     * - {r}: Retina 顯示器支援（Carto 專用）
     */
    basemaps: [
      // ----------- 🌍 開源社群底圖 -----------
      {
        label: 'OpenStreetMap',
        value: 'osm',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        // OpenStreetMap 標準底圖
        // 特點：開源、免費、全球覆蓋、社群維護
      },

      // ----------- 🏢 Esri ArcGIS 底圖服務 -----------
      {
        label: 'Esri Street',
        value: 'esri_street',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        // Esri 街道圖
        // 特點：專業製圖、詳細標註、適合都市分析
      },
      {
        label: 'Esri Topo',
        value: 'esri_topo',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        // Esri 地形圖
        // 特點：地形等高線、地貌顯示、適合空間分析
      },
      {
        label: 'Esri World Imagery',
        value: 'esri_imagery',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        // Esri 衛星影像
        // 特點：高解析度衛星圖像、真實地表顯示
      },

      // ----------- 🔍 Google Maps 底圖服務 -----------
      {
        label: 'Google Maps 街道',
        value: 'google_road',
        url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        // Google Maps 街道圖
        // 特點：最新道路資訊、中文標註、台灣地區詳細
      },
      {
        label: 'Google Maps 衛星',
        value: 'google_satellite',
        url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        // Google Maps 衛星圖
        // 特點：高品質衛星影像、定期更新
      },

      // ----------- 🏛️ 內政部國土測繪中心底圖服務 -----------
      {
        label: '國土規劃中心電子地圖',
        value: 'nlsc_emap',
        url: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',
        // 國土測繪中心電子地圖
        // 特點：官方地圖、台灣專用、行政界線準確
      },
      {
        label: '國土規劃中心正射影像',
        value: 'nlsc_photo',
        url: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}',
        // 國土測繪中心正射影像
        // 特點：官方影像、高精度、適合測繪用途
      },

      // ----------- ⛰️ 地形圖底圖 -----------
      {
        label: '地形圖',
        value: 'terrain',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        // OpenTopoMap 地形圖
        // 特點：等高線顯示、地貌明顯、適合地理分析
      },

      // ----------- 🎨 Carto 專業製圖底圖 -----------
      {
        label: 'Carto Light',
        value: 'carto_light_labels',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        // Carto Light 淺色底圖
        // 特點：簡潔設計、適合資料疊加、標註清晰
        // 推薦：資料視覺化專案的首選底圖
      },
      {
        label: 'Carto Dark',
        value: 'carto_dark_labels',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        // Carto Dark 深色底圖
        // 特點：深色主題、降低視覺疲勞、適合夜間使用
      },
      {
        label: 'Carto Voyager',
        value: 'carto_voyager',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        // Carto Voyager 混合底圖
        // 特點：地形與街道結合、色彩柔和、適合探索分析
      },

      // ----------- ⚪ 特殊底圖 -----------
      {
        label: '白色地圖',
        value: 'blank',
        url: '',
        // 空白白色底圖
        // 特點：純白背景、突顯資料圖層、簡報展示用
      },
      {
        label: '黑色底圖',
        value: 'black',
        url: '',
        // 空白黑色底圖
        // 特點：純黑背景、高對比度、夜間模式
      },
    ],
  }),

  // =============================================================================
  // 🔧 動作定義 (Actions Definition)
  // =============================================================================
  actions: {
    /**
     * 🎨 設定選中的底圖
     *
     * @param {string} value - 底圖識別碼（對應 basemaps 中的 value）
     * @description
     * - 更新當前選中的底圖
     * - 觸發地圖組件重新載入底圖瓦片
     * - 狀態變更會自動觸發 MapTab 中的 watcher
     *
     * @example
     * // 切換到 Google Maps 衛星圖
     * mapStore.setSelectedBasemap('google_satellite');
     */
    setSelectedBasemap(value) {
      this.selectedBasemap = value;
    },

    /**
     * 📍 設定地圖視圖狀態
     *
     * @param {[number, number]} center - 地圖中心點座標 [緯度, 經度]
     * @param {number} zoom - 縮放等級 (1-20)
     * @description
     * - 保存用戶的地圖視圖狀態
     * - 用於視圖持久化和恢復
     * - 在地圖移動或縮放後自動調用
     *
     * @example
     * // 設定地圖視圖到台北市政府
     * mapStore.setMapView([25.0375, 121.5637], 15);
     */
    setMapView(center, zoom) {
      this.mapView.center = center;
      this.mapView.zoom = zoom;
    },
  },
});
