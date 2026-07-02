/**
 * 🔧 vue.config.js - Vue CLI 專案配置文件
 *
 * 功能說明：
 * 1. 🌐 配置專案的公開路徑，用於 GitHub Pages 部署
 * 2. 📦 設定 Babel 轉譯依賴項目，確保舊瀏覽器兼容性
 * 3. 🖥️ 配置開發伺服器的端口和主機設定
 * 4. 🚀 優化建置和開發環境的各項設定
 *
 * 設計理念：
 * - 支援 GitHub Pages 部署的路徑配置
 * - 提供穩定的開發環境設定
 * - 確保跨平台和跨瀏覽器的兼容性
 *
 * @config vue.config.js
 * @version 1.0.0
 */

const { defineConfig } = require('@vue/cli-service');
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');

module.exports = defineConfig({
  /**
   * 🌐 公開路徑設定 (Public Path Configuration)
   * 設定應用程式的基礎 URL 路徑，用於正確載入靜態資源
   * - 開發環境：通常為 '/'
   * - GitHub Pages：需要設定為專案名稱路徑
   */
  publicPath: '/schematic-map-rwd_3/',

  /**
   * 📄 頁面標題設定 (Page Title Configuration)
   * 設定應用程式的頁面標題
   */
  chainWebpack: (config) => {
    config.plugin('html').tap((args) => {
      args[0].title = 'Schematic Map 3';
      return args;
    });
  },

  /**
   * 📦 依賴項目轉譯設定 (Transpile Dependencies)
   * 勿設為 true：會讓 Babel 掃描整個 node_modules（含 bootstrap 已壓縮 bundle），
   * 在 Dropbox 同步或安裝中途易造成 ENOENT／無謂負載。專案 browserslist 已排除 IE11，
   * 預設僅轉譯應用程式碼即可。
   */
  transpileDependencies: false,

  /**
   * Vue 3 esm-bundler：於編譯期明確定義 feature flags，消除主控台警示並利於 production tree-shaking。
   * @see https://vuejs.org/api/compile-time-flags.html
   */
  configureWebpack: {
    plugins: [
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: JSON.stringify(true),
        __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
      }),
      /**
       * highs-js 的 emscripten glue 以 `node:` scheme 參照 Node 核心模組（node:fs／node:crypto…）；
       * webpack 5 無法直接解析該 scheme，先去掉 `node:` 前綴，再由下方 resolve.fallback 設為 false 解決。
       */
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
    ],
    /**
     * 啟用 webpack 5 非同步 WebAssembly：供 Octilinear MILP 圖層動態載入 HiGHS(highs-js) WASM 求解器。
     * highs-js 以 dynamic import 走獨立 chunk；其 .wasm 由 highsLoader 的 locateFile 取得（預設 CDN）。
     */
    experiments: {
      asyncWebAssembly: true,
    },
    /**
     * highs-js 的 emscripten glue 於瀏覽器環境會條件式參照 Node 核心模組；webpack 5 不自帶 polyfill，
     * 明確關閉這些 fallback 以免建置失敗（執行期走 WASM／CDN，不需要這些模組）。
     */
    resolve: {
      fallback: {
        fs: false,
        path: false,
        crypto: false,
      },
    },
  },

  /**
   * 🖥️ 開發伺服器配置 (Development Server Configuration)
   * 設定本地開發環境的伺服器參數
   */
  devServer: {
    /**
     * 🔌 服務端口
     * 設定開發伺服器監聽的端口號
     */
    port: 8080,

    /**
     * 🌐 主機設定
     * '0.0.0.0' 允許外部設備訪問（如手機、其他電腦）
     * 'localhost' 僅允許本機訪問
     */
    host: '0.0.0.0',

    /**
     * 勿監聽 `public/data/`：本專案 dev API 會往該處寫檔，監聽會觸發 live reload 造成整頁重載／看似當機。
     */
    static: {
      directory: path.join(__dirname, 'public'),
      watch: {
        ignored: [path.join(__dirname, 'public', 'data')],
      },
    },

    /**
     * 📁 儲存 API：開發環境下 POST /api/save-result 可將 JSON 寫入 public/data/result/
     */
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer?.app) return middlewares;
      const express = require('express');
      devServer.app.use(express.json({ limit: '50mb' }));

      /** AI調整：dev proxy 轉發 LLM（需 OPENAI_API_KEY 環境變數） */
      devServer.app.post('/api/llm-layout', async (req, res) => {
        try {
          const apiKey = process.env.OPENAI_API_KEY || process.env.VUE_APP_OPENAI_API_KEY;
          if (!apiKey) {
            res.status(503).json({ ok: false, error: 'OPENAI_API_KEY not set on dev server' });
            return;
          }
          const { messages, model = process.env.LLM_LAYOUT_MODEL || 'gpt-5.4' } = req.body || {};
          if (!Array.isArray(messages) || !messages.length) {
            res.status(400).json({ ok: false, error: 'messages required' });
            return;
          }
          const body = { model, messages, response_format: { type: 'json_object' } };
          if (!/^gpt-5/i.test(String(model))) body.temperature = 0.2;
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
          });
          const data = await r.json();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: data.error?.message || r.statusText });
            return;
          }
          const content = data.choices?.[0]?.message?.content;
          res.json({ ok: true, content });
        } catch (err) {
          console.error('[llm-layout]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.post('/api/save-result', (req, res) => {
        try {
          const resultDir = path.join(__dirname, 'public', 'data', 'result');
          if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
          const filePath = path.join(resultDir, '08_compact_layout_taipei.json');
          fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf8');
          res.json({ ok: true, path: 'data/result/08_compact_layout_taipei.json' });
        } catch (err) {
          console.error('[save-result]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      /** AI測試 HV（僅 devServer / 本地 Cursor 開發，正式 build 不含此 API） */
      const aiTestHvDir = path.join(__dirname, 'public', 'data', 'ai_test');
      const aiTestHvPayloadPath = path.join(aiTestHvDir, 'hv_payload.json');
      const aiTestHvResponsePath = path.join(aiTestHvDir, 'hv_response.json');
      const ensureAiTestHvDir = () => {
        if (!fs.existsSync(aiTestHvDir)) fs.mkdirSync(aiTestHvDir, { recursive: true });
      };

      devServer.app.post('/api/ai-test-hv/payload', (req, res) => {
        try {
          ensureAiTestHvDir();
          fs.writeFileSync(aiTestHvPayloadPath, JSON.stringify(req.body, null, 2), 'utf8');
          res.json({ ok: true, path: 'public/data/ai_test/hv_payload.json' });
        } catch (err) {
          console.error('[ai-test-hv/payload]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.get('/api/ai-test-hv/payload', (req, res) => {
        try {
          if (!fs.existsSync(aiTestHvPayloadPath)) {
            res.status(404).json({ ok: false, error: 'payload not found' });
            return;
          }
          res.json(JSON.parse(fs.readFileSync(aiTestHvPayloadPath, 'utf8')));
        } catch (err) {
          console.error('[ai-test-hv/payload GET]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.post('/api/ai-test-hv/response', (req, res) => {
        try {
          ensureAiTestHvDir();
          fs.writeFileSync(aiTestHvResponsePath, JSON.stringify(req.body, null, 2), 'utf8');
          res.json({ ok: true, path: 'public/data/ai_test/hv_response.json' });
        } catch (err) {
          console.error('[ai-test-hv/response]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.get('/api/ai-test-hv/response', (req, res) => {
        try {
          if (!fs.existsSync(aiTestHvResponsePath)) {
            res.json({ ok: true, missing: true });
            return;
          }
          res.json(JSON.parse(fs.readFileSync(aiTestHvResponsePath, 'utf8')));
        } catch (err) {
          console.error('[ai-test-hv/response GET]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.delete('/api/ai-test-hv/response', (req, res) => {
        try {
          if (fs.existsSync(aiTestHvResponsePath)) fs.unlinkSync(aiTestHvResponsePath);
          res.json({ ok: true });
        } catch (err) {
          console.error('[ai-test-hv/response DELETE]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      const aiTestHvAuditPath = path.join(aiTestHvDir, 'hv_audit.json');

      devServer.app.get('/api/ai-test-hv/audit', (req, res) => {
        try {
          if (!fs.existsSync(aiTestHvAuditPath)) {
            res.json({ ok: true, missing: true });
            return;
          }
          res.json(JSON.parse(fs.readFileSync(aiTestHvAuditPath, 'utf8')));
        } catch (err) {
          console.error('[ai-test-hv/audit GET]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.delete('/api/ai-test-hv/audit', (req, res) => {
        try {
          if (fs.existsSync(aiTestHvAuditPath)) fs.unlinkSync(aiTestHvAuditPath);
          res.json({ ok: true });
        } catch (err) {
          console.error('[ai-test-hv/audit DELETE]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      /** AI測試（路線調整）HV — ai_test HV 之獨立實體複製（程式不共用），寫入 public/data/route_adjust_ai_test。 */
      const raAiTestHvDir = path.join(__dirname, 'public', 'data', 'route_adjust_ai_test');
      const raAiTestHvPayloadPath = path.join(raAiTestHvDir, 'hv_payload.json');
      const raAiTestHvResponsePath = path.join(raAiTestHvDir, 'hv_response.json');
      const ensureRaAiTestHvDir = () => {
        if (!fs.existsSync(raAiTestHvDir)) fs.mkdirSync(raAiTestHvDir, { recursive: true });
      };

      devServer.app.post('/api/route-adjust-ai-test-hv/payload', (req, res) => {
        try {
          ensureRaAiTestHvDir();
          fs.writeFileSync(raAiTestHvPayloadPath, JSON.stringify(req.body, null, 2), 'utf8');
          res.json({ ok: true, path: 'public/data/route_adjust_ai_test/hv_payload.json' });
        } catch (err) {
          console.error('[route-adjust-ai-test-hv/payload]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.get('/api/route-adjust-ai-test-hv/payload', (req, res) => {
        try {
          if (!fs.existsSync(raAiTestHvPayloadPath)) {
            res.status(404).json({ ok: false, error: 'payload not found' });
            return;
          }
          res.json(JSON.parse(fs.readFileSync(raAiTestHvPayloadPath, 'utf8')));
        } catch (err) {
          console.error('[route-adjust-ai-test-hv/payload GET]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.post('/api/route-adjust-ai-test-hv/response', (req, res) => {
        try {
          ensureRaAiTestHvDir();
          fs.writeFileSync(raAiTestHvResponsePath, JSON.stringify(req.body, null, 2), 'utf8');
          res.json({ ok: true, path: 'public/data/route_adjust_ai_test/hv_response.json' });
        } catch (err) {
          console.error('[route-adjust-ai-test-hv/response]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.get('/api/route-adjust-ai-test-hv/response', (req, res) => {
        try {
          if (!fs.existsSync(raAiTestHvResponsePath)) {
            res.json({ ok: true, missing: true });
            return;
          }
          res.json(JSON.parse(fs.readFileSync(raAiTestHvResponsePath, 'utf8')));
        } catch (err) {
          console.error('[route-adjust-ai-test-hv/response GET]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.delete('/api/route-adjust-ai-test-hv/response', (req, res) => {
        try {
          if (fs.existsSync(raAiTestHvResponsePath)) fs.unlinkSync(raAiTestHvResponsePath);
          res.json({ ok: true });
        } catch (err) {
          console.error('[route-adjust-ai-test-hv/response DELETE]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      const raAiTestHvAuditPath = path.join(raAiTestHvDir, 'hv_audit.json');

      devServer.app.get('/api/route-adjust-ai-test-hv/audit', (req, res) => {
        try {
          if (!fs.existsSync(raAiTestHvAuditPath)) {
            res.json({ ok: true, missing: true });
            return;
          }
          res.json(JSON.parse(fs.readFileSync(raAiTestHvAuditPath, 'utf8')));
        } catch (err) {
          console.error('[route-adjust-ai-test-hv/audit GET]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      devServer.app.delete('/api/route-adjust-ai-test-hv/audit', (req, res) => {
        try {
          if (fs.existsSync(raAiTestHvAuditPath)) fs.unlinkSync(raAiTestHvAuditPath);
          res.json({ ok: true });
        } catch (err) {
          console.error('[route-adjust-ai-test-hv/audit DELETE]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });

      /** 以下 API 仍保留於 devServer，前端已不再呼叫（路網成品改存圖層 dataOSM／dataGeojson／dataJson）。 */
      devServer.app.post('/api/save-osm2-geojson-2-json-artifacts', (req, res) => {
        try {
          const body = req.body || {};
          const groupName = body.groupName;
          const layerId = body.layerId;
          if (typeof groupName !== 'string' || typeof layerId !== 'string') {
            res.status(400).json({ ok: false, error: 'groupName and layerId required' });
            return;
          }
          if (
            !groupName.trim() ||
            !layerId.trim() ||
            groupName.includes('..') ||
            layerId.includes('..') ||
            groupName.includes('/') ||
            groupName.includes('\\') ||
            layerId.includes('/') ||
            layerId.includes('\\')
          ) {
            res.status(400).json({ ok: false, error: 'invalid groupName or layerId' });
            return;
          }
          const layerDir = path.join(__dirname, 'public', 'data', 'layers', groupName, layerId);
          if (!fs.existsSync(layerDir)) fs.mkdirSync(layerDir, { recursive: true });
          if (typeof body.osmXml === 'string' && body.osmXml.length > 0) {
            fs.writeFileSync(path.join(layerDir, 'source.osm'), body.osmXml, 'utf8');
          }
          if (body.geojson != null && typeof body.geojson === 'object') {
            fs.writeFileSync(
              path.join(layerDir, 'routes.geojson'),
              JSON.stringify(body.geojson, null, 2),
              'utf8'
            );
          }
          if (body.segments != null) {
            fs.writeFileSync(
              path.join(layerDir, 'segments.json'),
              JSON.stringify(body.segments, null, 2),
              'utf8'
            );
          }
          res.json({ ok: true, dir: path.join('data', 'layers', groupName, layerId) });
        } catch (err) {
          console.error('[save-osm2-geojson-2-json-artifacts]', err);
          res.status(500).json({ ok: false, error: err.message });
        }
      });
      return middlewares;
    },
  },
});
