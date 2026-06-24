/**
 * 🔄 babel.config.js - Babel 轉譯器配置文件
 *
 * 功能說明：
 * 1. 📦 配置 Vue CLI 的 Babel 預設集
 * 2. 🔧 設定自動 polyfill 引入策略
 * 3. 🌐 配置 Core-JS 版本以確保瀏覽器兼容性
 * 4. ⚡ 優化程式碼轉譯和打包大小
 *
 * 設計理念：
 * - 按需引入 polyfill，減少打包體積
 * - 支援現代和舊版瀏覽器的兼容性
 * - 使用最新的 Core-JS 版本
 *
 * @config babel.config.js
 * @version 1.0.0
 */

module.exports = {
  /**
   * 🎯 預設集配置 (Presets Configuration)
   * 定義 Babel 轉譯的預設規則和插件集合
   */
  presets: [
    [
      /**
       * 📦 Vue CLI Babel 預設集
       * 包含 Vue 3 專案所需的所有 Babel 轉換規則
       * - ES6+ 語法轉換
       * - JSX 支援（如果需要）
       * - TypeScript 支援（如果需要）
       */
      '@vue/cli-plugin-babel/preset',
      {
        /**
         * 🔧 自動 Polyfill 引入策略 (Automatic Polyfill Strategy)
         * 'usage': 根據程式碼使用情況自動引入所需的 polyfill
         * 'entry': 在入口文件引入完整的 polyfill
         * false: 不自動引入 polyfill
         */
        useBuiltIns: 'usage',

        /**
         * 🌐 Core-JS 版本設定 (Core-JS Version Configuration)
         * 指定使用的 Core-JS 版本，提供 JavaScript 新特性的 polyfill
         * 版本 3 提供最新的 JavaScript 標準支援
         */
        corejs: 3,
      },
    ],
  ],
};
