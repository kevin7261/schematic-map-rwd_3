/**
 * 🎨 Prettier 配置文件 (Prettier Configuration)
 *
 * 定義程式碼格式化規則，確保團隊程式碼風格一致
 * 配合 ESLint 使用，提供自動格式化功能
 */

module.exports = {
  // 🔤 基礎格式設定 (Basic Formatting Settings)
  semi: true, // 總是使用分號
  singleQuote: true, // 使用單引號而非雙引號
  quoteProps: 'as-needed', // 只在需要時為物件屬性加引號
  trailingComma: 'es5', // 在 ES5 有效的地方加上尾隨逗號

  // 📏 縮排和空格設定 (Indentation and Spacing Settings)
  tabWidth: 2, // 使用 2 個空格作為一個縮排層級
  useTabs: false, // 使用空格而非 tab 字符
  printWidth: 100, // 每行最大長度為 100 字符

  // 🔧 Vue.js 專用設定 (Vue.js Specific Settings)
  vueIndentScriptAndStyle: true, // Vue 文件中的 <script> 和 <style> 標籤內容縮排

  // 📝 HTML 和模板設定 (HTML and Template Settings)
  htmlWhitespaceSensitivity: 'css', // 根據 CSS display 屬性決定 HTML 空格敏感度

  // 🔗 換行設定 (Line Breaking Settings)
  endOfLine: 'lf', // 使用 Unix 風格的換行符 (LF)
  bracketSpacing: true, // 物件字面量的大括號內部前後要有空格
  bracketSameLine: false, // 多行 HTML 元素的 > 放在最後一行的末尾

  // 📦 插件設定 (Plugins Settings)
  plugins: [], // 暫時不使用額外插件

  // 🎯 檔案特定覆寫設定 (File-specific Overrides)
  overrides: [
    {
      // Vue 單文件組件特殊設定
      files: ['*.vue'],
      options: {
        parser: 'vue',
        vueIndentScriptAndStyle: true,
      },
    },
    {
      // JavaScript 和 TypeScript 文件設定
      files: ['*.js', '*.ts'],
      options: {
        parser: 'babel',
        singleQuote: true,
        semi: true,
      },
    },
    {
      // JSON 文件設定
      files: ['*.json'],
      options: {
        parser: 'json',
        tabWidth: 2,
      },
    },
    {
      // CSS 和 SCSS 文件設定
      files: ['*.css', '*.scss', '*.sass'],
      options: {
        parser: 'css',
        singleQuote: false, // CSS 中使用雙引號
      },
    },
    {
      // Markdown 文件設定
      files: ['*.md'],
      options: {
        parser: 'markdown',
        printWidth: 80, // Markdown 文件較短的行長度
        proseWrap: 'always', // 總是換行
      },
    },
  ],
};
