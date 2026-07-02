/**
 * AI測試 HV 最佳化 — 操作頁說明文字（與 skill / prompt 同步）
 */

import { HV_OPTIMIZE_SYSTEM_PROMPT } from './uniformGridHvOptimize.js';

/** 鐵律（置頂顯示） */
export const AI_TEST_HV_IRON_RULE = `【鐵律】座標只能由 Cursor LLM 推理決定。
禁止任何腳本、greedy 演算法、程式迴圈產生 coords。
App 只做幾何驗證與預覽；writeResponse.mjs 只寫檔，不算座標。
hv_response.json 須 computedBy: "llm"，否則 App 拒絕。`;

/** 操作流程（App + Cursor） */
export const AI_TEST_HV_PROCEDURE = `【操作流程】（僅本地 npm run serve + Cursor）

1. App：按「隨機產生」→ 按「HV 最佳化（水平/垂直）」→ 寫入 hv_payload.json
2. Cursor：對 Agent 說「HV 最佳化」→ LLM 推理新座標 → writeResponse.mjs 寫 hv_response.json
3. App：再按「HV 最佳化」→ 虛線預覽 → 按「執行（套用移動）」

若按「隨機產生」後 fingerprint 改變，須在 Cursor 重新用 LLM 計算。`;

/** Skill 硬性規定與 Agent 步驟 */
export const AI_TEST_HV_SKILL_TEXT = `【Skill：ai-test-hv-optimize】

Agent 必做（僅 LLM 推理，禁止跑求解腳本）：
1. 讀 public/data/ai_test/hv_payload.json（routesFingerprint、network）
2. 依下方 System Prompt 在對話中推理新座標
   - 只平移 crossing（紅）/ endpoint（藍）/ bend（粉紅）；vertex 不可動
   - 紅點移動後仍是紅，絕不可變藍；kind 不可改
   - **拉直路線**：紅/藍/粉紅之間僅 HV 直線；**禁止**製造新轉折
   - **方向鎖定**：偏水平→水平 HV；偏垂直→垂直 HV；45°→兩者皆可；不可翻向
   - **套用順序（僅 LLM 推理）**：各路線依 x、y 座標序列（非 id 序）從中位往外；每步牽動邊 HV 須增加；同層選增益最大；禁止程式搜格
   - **拓撲結構關係不可變**（只改座標）：edges 連接、route id 順序、轉乘匯流、端點歸屬
   - 拓撲不可變；整數格、不重疊
   - 禁止新增跨路線交叉（移動前沒有的邊內部交叉一律不可）
   - coords 須涵蓋全部 movable id（未動者回傳原座標）
3. writeResponse.mjs 寫入（computedBy: "llm"）

核心檔案：
• public/data/ai_test/hv_payload.json — App 寫入
• public/data/ai_test/hv_response.json — Agent（LLM）寫入
• .claude/skills/ai-test-hv-optimize/writeResponse.mjs — 寫 response（不求解）`;

/** Prompt 模板摘要 + 完整 System Prompt */
export const AI_TEST_HV_PROMPT_TEMPLATE = `【Prompt 模板摘要】

輸入：hv_payload.json 的 routesFingerprint、network.movablePoints、network.edges、network.topology.routeKeypointSequences

拓撲結構關係不可變：edges 連接、route id 順序、轉乘 id 匯流、端點歸屬；只平移座標

路線語意：紅/藍/粉紅之間僅一條直線；移動目的是 HV 拉直，不是新增轉折；黑站不在 network

方向鎖定：偏水平段→水平 HV；偏垂直段→垂直 HV；45°→兩者皆可；翻向則不可移動

套用順序（僅 LLM 推理）：各路線紅/藍/粉紅依 x、y 座標序列（非 id 序）從中位往外；每步須拉直（牽動邊 HV↑）；同層選增益最大；App 不替 LLM 求解

任務：最大化 HV 邊；整數格、不重疊

禁止新增交叉：移動後不得產生新的跨路線邊內部交叉

輸出（writeResponse.mjs）：
{
  "routesFingerprint": "<與 payload 相同>",
  "computedBy": "llm",
  "model": "<Cursor model 名稱>",
  "coords": [{"id": 0, "x": 0, "y": 0}, ...]
}

寫檔命令：
node .claude/skills/ai-test-hv-optimize/writeResponse.mjs '{"routesFingerprint":"…","computedBy":"llm","model":"Composer","coords":[...]}'`;

export { HV_OPTIMIZE_SYSTEM_PROMPT as AI_TEST_HV_SYSTEM_PROMPT };
