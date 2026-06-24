# 網格節點多值顯示功能更新日誌

## 📅 更新日期

2025-10-07

## 🎯 功能概述

為每個網格節點添加了兩個額外的計算值，並在視覺化中顯示，提供更豐富的數據展示。

## ✨ 新增功能

### 1. 左右列值計算與顯示

- **計算邏輯**：對於每個網格節點，計算其左右兩列中，最大值較小的那一列的最小值
- **顯示位置**：節點的左上角
- **顯示顏色**：金色 (#FFD700)
- **字體大小**：10px

### 2. 上下行值計算與顯示

- **計算邏輯**：對於每個網格節點，計算其上下兩行中，最大值較小的那一行的最小值
- **顯示位置**：節點的右上角
- **顯示顏色**：青綠色 (#00CED1)
- **字體大小**：10px

### 3. 主要數值顯示優化

- **顯示位置**：節點中心
- **顯示顏色**：白色 (#FFFFFF)
- **字體大小**：14px
- **字體粗細**：粗體

## 🔧 技術實現

### 修改的文件

#### 1. `src/utils/dataProcessor.js`

**修改位置**：`processGridSchematicJson()` 函數

**新增代碼**：

- 在生成網格節點後，計算每列和每行的統計數據
- 為每個節點添加 `leftRightValue` 和 `upDownValue` 屬性
- 處理邊界情況（最外層節點只有單側相鄰列/行）

**核心邏輯**：

```javascript
// 第二階段：為每個節點計算左右列和上下行的值
gridNodes.forEach((node) => {
  // 計算左右列值
  const leftCol = node.x - 1;
  const rightCol = node.x + 1;

  if (leftCol >= 0 && rightCol < gridX) {
    const leftMax = xRowStats[leftCol].max;
    const rightMax = xRowStats[rightCol].max;

    if (leftMax < rightMax) {
      leftRightValue = xRowStats[leftCol].min;
    } else if (rightMax < leftMax) {
      leftRightValue = xRowStats[rightCol].min;
    } else {
      leftRightValue = Math.min(
        xRowStats[leftCol].min,
        xRowStats[rightCol].min
      );
    }
  }

  // 類似的邏輯計算上下行值
  // ...
});
```

**修改的函數**：

- `processGridToDrawData()` - 添加新屬性到繪製數據

#### 2. `src/tabs/D3jsTab.vue`

**修改位置**：`drawGridNodes()` 函數

**新增代碼**：

- 為每個節點繪製三個文字元素（主要數值、左右列值、上下行值）
- 調整文字位置和樣式
- 添加條件檢查，只在值存在時才顯示

**核心邏輯**：

```javascript
// 繪製主要數值（中間）
nodeGroup
  .append('text')
  .attr('x', x)
  .attr('y', y)
  .attr('font-size', 14)
  .attr('fill', '#FFFFFF')
  .text(node.value);

// 繪製左右列值（左上角）
if (node.leftRightValue !== null) {
  nodeGroup
    .append('text')
    .attr('x', x - columnWidths[node.x] / 2 + 3)
    .attr('y', y - rowHeights[node.y] / 2 + 3)
    .attr('font-size', 10)
    .attr('fill', '#FFD700')
    .text(node.leftRightValue);
}

// 繪製上下行值（右上角）
if (node.upDownValue !== null) {
  nodeGroup
    .append('text')
    .attr('x', x + columnWidths[node.x] / 2 - 3)
    .attr('y', y - rowHeights[node.y] / 2 + 3)
    .attr('font-size', 10)
    .attr('fill', '#00CED1')
    .text(node.upDownValue);
}
```

**修改的函數**：

- `updateDrawJsonData()` - 在重新映射時保留新屬性

### 新增的文件

#### 1. `docs/GRID_VALUES_DOCUMENTATION.md`

- 完整的功能說明文檔
- 詳細的計算邏輯說明
- 實作範例和數據結構
- 使用場景和注意事項

#### 2. `public/data/test/test_small_grid.json`

- 5x5 小型測試網格
- 用於快速演示和測試新功能

#### 3. `CHANGELOG_GRID_VALUES.md`

- 本更新日誌文件

### 更新的文件

#### 1. `README.md`

- 在"視覺化類型"章節添加網格示意圖的詳細說明
- 添加新功能的特性描述
- 添加文檔鏈接

## 📊 數據結構變更

### Grid Node 結構（新增屬性）

```javascript
{
  x: number,                      // 節點的列索引
  y: number,                      // 節點的行索引
  value: number,                  // 節點主要數值 (0-9)
  type: number,                   // 節點類型
  coord: { x, y },                // 節點座標
  leftRightValue: number | null,  // ⭐ 新增：左右列值
  upDownValue: number | null      // ⭐ 新增：上下行值
}
```

## 🎨 視覺化效果

### 節點顯示佈局

```
     [上下行值]  ← 右上角，青綠色，10px
[左右列值]  [主要數值]  ← 主要數值：中心，白色，14px，粗體
↑
左上角，金色，10px
```

### 顏色方案

- **主要數值**：白色 (#FFFFFF) - 顯眼且易讀
- **左右列值**：金色 (#FFD700) - 溫暖色調，與左側位置呼應
- **上下行值**：青綠色 (#00CED1) - 冷色調，與右側位置呼應

## 🔍 邊界情況處理

### 最左側列的節點

- 沒有左列，只有右列
- `leftRightValue` = 右列的最小值

### 最右側列的節點

- 沒有右列，只有左列
- `leftRightValue` = 左列的最小值

### 最上側行的節點

- 沒有上行，只有下行
- `upDownValue` = 下行的最小值

### 最下側行的節點

- 沒有下行，只有上行
- `upDownValue` = 上行的最小值

### 四個角落的節點

- 同時處於邊界，按上述規則處理

## 🚀 使用方式

### 查看效果

1. 啟動開發服務器：`npm run dev`
2. 打開瀏覽器訪問應用
3. 在"Layers"標籤中開啟"網格示意圖測試"圖層
4. 切換到"D3.js"標籤查看視覺化效果

### 測試數據

- 標準測試：使用 `public/data/test/test.json` (10x5 網格)
- 小型測試：使用 `public/data/test/test_small_grid.json` (5x5 網格)

## 📚 相關文檔

- **功能詳細說明**：[GRID_VALUES_DOCUMENTATION.md](docs/GRID_VALUES_DOCUMENTATION.md)
- **主要說明文檔**：[README.md](README.md)
- **數據處理文檔**：[PACKAGE_JSON_DOCUMENTATION.md](docs/PACKAGE_JSON_DOCUMENTATION.md)

## 🔄 向後兼容性

### 完全兼容

- 不影響現有的任何功能
- 所有現有的網格數據會自動計算新的值
- 不需要修改任何現有的數據文件
- 不影響其他類型的圖層（行政區示意圖、捷運圖等）

### 新舊數據

- 舊數據會自動補充新的計算值
- 不會破壞任何現有的數據結構
- 所有現有功能保持不變

## ⚡ 性能影響

### 計算開銷

- 新增的計算在數據載入時一次性完成
- 不影響實時渲染性能
- 時間複雜度：O(n)，其中 n 是網格節點總數

### 渲染開銷

- 每個節點額外繪製兩個文字元素
- 對小型網格（<100 節點）幾乎無影響
- 對大型網格（>1000 節點）可能有輕微影響

## 🐛 已知問題

- 無

## 📝 未來改進計劃

1. 添加配置選項，允許用戶選擇顯示/隱藏額外的值
2. 支援自定義顏色方案
3. 添加動畫效果，高亮顯示選中的節點及其相關的列/行
4. 支援更多的統計值計算（如平均值、中位數等）

## 👥 貢獻者

- Kevin Cheng - 功能開發與實現

## 📄 授權

MIT License


