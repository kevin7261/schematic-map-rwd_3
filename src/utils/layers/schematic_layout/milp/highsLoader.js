/* eslint-disable no-console */

/**
 * 動態載入 HiGHS(highs-js) WASM 求解器（dynamic import → 獨立 chunk）。
 * 先試**本地** `public/highs.wasm`（與 npm JS glue 同版，行為一致）；失敗則退回 CDN。
 */

let highsPromise = null;
const CDN = 'https://lovasoa.github.io/highs-js/';

async function init(locateFile) {
  const mod = await import(/* webpackChunkName: "highs-solver" */ 'highs');
  const highsLoader = mod.default || mod;
  return highsLoader({ locateFile });
}

export function loadHighs() {
  if (highsPromise) return highsPromise;
  highsPromise = (async () => {
    const base = process.env.BASE_URL || '/'; // webpack DefinePlugin 會在 build 時替換為 publicPath
    try {
      return await init((file) => base + file); // 本地 public/highs.wasm
    } catch (e) {
      console.warn('[HiGHS] 本地 WASM 載入失敗，改用 CDN：' + (e?.message || e));
      try {
        return await init((file) => CDN + file);
      } catch (e2) {
        throw new Error('HiGHS 求解器無法載入（本地與 CDN 皆失敗）：' + (e2?.message || e2));
      }
    }
  })();
  return highsPromise;
}
