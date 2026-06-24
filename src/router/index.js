/**
 * 🗺️ 路由管理模組 (Router Management Module)
 * Schematic Map 2 的路由管理系統
 *
 * 功能說明 (Features):
 * 1. 🛣️ 路由配置管理：定義應用程式的所有路由規則
 * 2. 📱 響應式路由：支援不同設備的路由導航
 * 3. 🔄 路由守衛：提供路由切換的權限控制和驗證
 * 4. 📊 路由狀態管理：追蹤當前路由狀態和歷史記錄
 * 5. 🎯 動態路由：支援動態路由參數和查詢字符串
 *
 * 技術特點 (Technical Features):
 * - 使用 Vue Router 4 最新版本
 * - 支援 HTML5 History API 模式
 * - 提供完整的路由生命週期管理
 * - 支援路由懶載入和程式碼分割
 *
 * 路由結構 (Route Structure):
 * - /: 首頁（示意圖主界面）
 * - 其他路由可根據需要擴展
 *
 * @file index.js
 * @version 2.0.0
 * @author Kevin Cheng
 * @since 1.0.0
 */

// ==================== 📦 第三方庫引入 (Third-Party Library Imports) ====================

/**
 * Vue Router 4 核心功能引入
 * 提供現代化的單頁應用路由管理功能
 *
 * @see https://router.vuejs.org/
 */
import { createRouter, createWebHistory } from 'vue-router';

/**
 * 首頁視圖組件引入
 * 包含示意圖的主要功能界面
 *
 * @see ../views/HomeView.vue
 */
import HomeView from '../views/HomeView.vue';

// ==================== 📍 路由配置定義 (Route Configuration Definition) ====================

/**
 * 📍 路由配置陣列 (Routes Configuration Array)
 *
 * 定義應用程式的所有路由規則，包含路徑、組件、元數據等
 * 每個路由物件包含必要的路由資訊，支援嵌套路由和動態路由
 *
 * 設計原則：
 * - 使用語義化的路由名稱
 * - 保持路由結構的簡潔性
 * - 支援未來擴展需求
 * - 提供完整的路由元數據
 *
 * @type {Array<Object>}
 * @description 路由配置陣列，每個物件定義一個路由規則
 */
const routes = [
  {
    path: '/', // 🏠 根路徑
    name: 'Home', // 路由名稱，用於程式化導航
    component: HomeView, // 對應的 Vue 組件
    meta: {
      title: 'Schematic Map 2', // 瀏覽器分頁標題
      description: 'Schematic Map 2 響應式示意圖展示平台', // 頁面描述
      requiresAuth: false, // 是否需要身份驗證
    },
  },
  /** 常見誤連或書籤；本專案無獨立考試頁，導回首頁以免 Router 警告 */
  {
    path: '/exam',
    redirect: '/',
  },
  // 未來可在此處添加更多路由
  // {
  //   path: '/about',
  //   name: 'About',
  //   component: () => import('../views/AboutView.vue'),
  //   meta: {
  //     title: '關於我們',
  //     description: '了解我們的團隊和使命',
  //     requiresAuth: false,
  //   },
  // },
  /** 其餘未知路徑導向首頁（SPA；避免 console 「No match found」） */
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

// ==================== 🛣️ 路由器實例創建 (Router Instance Creation) ====================

/**
 * 🛣️ 路由器實例創建 (Router Instance Creation)
 *
 * 使用 Vue Router 4 創建路由器實例，配置路由模式和基礎路徑
 * 支援 HTML5 History API 模式，提供更自然的 URL 結構
 *
 * 配置說明：
 * - history: 使用 HTML5 History API 模式，支援瀏覽器前進後退
 * - base: 設定應用程式的基礎路徑，用於 GitHub Pages 部署
 * - routes: 路由配置陣列，定義所有可用的路由規則
 * - scrollBehavior: 路由切換時的滾動行為（可選）
 *
 * @type {Router}
 * @description Vue Router 實例，提供路由導航功能
 */
const router = createRouter({
  /**
   * 使用 HTML5 History API 模式
   * 提供更自然的 URL 結構，不包含 # 符號
   * 需要服務器配置支援，確保所有路由都指向 index.html
   */
  history: createWebHistory('/schematic-map-rwd_3/'),

  /**
   * 路由配置陣列
   * 包含所有定義的路由規則
   */
  routes,

  /**
   * 滾動行為配置（可選）
   * 定義路由切換時的滾動位置
   */
  scrollBehavior(to, from, savedPosition) {
    // 如果有保存的位置（瀏覽器前進後退），恢復該位置
    if (savedPosition) {
      return savedPosition;
    }
    // 否則滾動到頁面頂部
    return { top: 0 };
  },
});

// ==================== 🔒 路由守衛配置 (Route Guards Configuration) ====================

/**
 * 🔒 全域前置守衛 (Global Before Guard)
 *
 * 在每個路由切換前執行，用於權限控制、身份驗證等
 * 可以在此處添加登入檢查、權限驗證等邏輯
 *
 * @param {RouteLocationNormalized} to - 即將進入的路由
 * @param {RouteLocationNormalized} from - 即將離開的路由
 * @param {Function} next - 路由控制函數
 */
router.beforeEach((to, from, next) => {
  document.title = to.meta?.title || 'Schematic Map 2';

  // 記錄路由切換日誌（開發環境）
  // 繼續路由導航
  next();
});

/**
 * 🔒 全域後置守衛 (Global After Guard)
 *
 * 在每個路由切換完成後執行，用於頁面分析、統計等
 * 可以在此處添加 Google Analytics、頁面追蹤等邏輯
 *
 * @param {RouteLocationNormalized} to - 已進入的路由
 * @param {RouteLocationNormalized} from - 已離開的路由
 */
router.afterEach(() => {
  // 記錄路由切換完成日誌
  // 可以在這裡添加頁面分析代碼
  // 例如：Google Analytics 頁面追蹤
  // gtag('config', 'GA_MEASUREMENT_ID', {
  //   page_path: to.fullPath,
  // });
});

// ==================== 📤 模組導出 (Module Export) ====================

/**
 * 導出路由器實例
 * 供 main.js 使用，註冊到 Vue 應用程式中
 */
export default router;
