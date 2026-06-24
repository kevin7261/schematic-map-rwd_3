# 網格節點值說明文檔 (Grid Node Values Documentation)

## 📊 功能概述 (Feature Overview)

為每個網格節點計算並顯示三個數值：

1. **主要數值** (Main Value): 節點本身的隨機生成值 (0-9)
2. **左右列值** (Left-Right Column
   Value): 左右兩列中，最大值較小的那一列的最小值
3. **上下行值** (Up-Down Row Value): 上下兩行中，最大值較小的那一行的最小值

## 🎯 計算邏輯 (Calculation Logic)

### 左右列值 (Left-Right Column Value)

對於位於第 `x` 列的節點：

1. **獲取相鄰列**：

   - 左列: `x - 1`
   - 右列: `x + 1`

2. **比較最大值**：

   - 計算左列的最大值: `max(左列所有節點值)`
   - 計算右列的最大值: `max(右列所有節點值)`

3. **選擇較小最大值的列**：

   - 如果 `max(左列) < max(右列)`，選擇左列
   - 如果 `max(右列) < max(左列)`，選擇右列
   - 如果兩者相等，取兩列最小值中較小的那個

4. **返回該列的最小值**：

   - 返回 `min(選中列的所有節點值)`

5. **邊界情況**：
   - 如果只有左列（最右側節點），返回左列的最小值
   - 如果只有右列（最左側節點），返回右列的最小值
   - 如果兩者都不存在，返回 `null`

### 上下行值 (Up-Down Row Value)

對於位於第 `y` 行的節點：

1. **獲取相鄰行**：

   - 上行: `y - 1`
   - 下行: `y + 1`

2. **比較最大值**：

   - 計算上行的最大值: `max(上行所有節點值)`
   - 計算下行的最大值: `max(下行所有節點值)`

3. **選擇較小最大值的行**：

   - 如果 `max(上行) < max(下行)`，選擇上行
   - 如果 `max(下行) < max(上行)`，選擇下行
   - 如果兩者相等，取兩行最小值中較小的那個

4. **返回該行的最小值**：

   - 返回 `min(選中行的所有節點值)`

5. **邊界情況**：
   - 如果只有上行（最下側節點），返回上行的最小值
   - 如果只有下行（最上側節點），返回下行的最小值
   - 如果兩者都不存在，返回 `null`

## 🎨 視覺化顯示 (Visual Display)

在D3.js視覺化組件中，每個網格節點會顯示三個數值：

- **中間** (Center): 主要數值 - 白色，14px，粗體
- **左上角** (Top-Left): 左右列值 - 金色 (#FFD700)，10px
- **右上角** (Top-Right): 上下行值 - 青綠色 (#00CED1)，10px

## 📝 實作範例 (Implementation Example)

### 例子：3x3 網格

```
網格數據：
   Col 0  Col 1  Col 2
Row 0:  5     2     8
Row 1:  3     7     4
Row 2:  6     1     9
```

#### 計算過程：

**節點 (1, 1) - 值為 7**

1. **左右列值**：

   - 左列 (Col 0): 值 = [5, 3, 6], max = 6, min = 3
   - 右列 (Col 2): 值 = [8, 4, 9], max = 9, min = 4
   - 比較: 6 < 9，選擇左列
   - 結果: `leftRightValue = 3`

2. **上下行值**：
   - 上行 (Row 0): 值 = [5, 2, 8], max = 8, min = 2
   - 下行 (Row 2): 值 = [6, 1, 9], max = 9, min = 1
   - 比較: 8 < 9，選擇上行
   - 結果: `upDownValue = 2`

**顯示結果**：

```
     2  ← 上下行值（右上角，青綠色）
3    7  ← 主要數值（中間，白色）
↑
左右列值（左上角，金色）
```

## 🔧 技術實作 (Technical Implementation)

### 數據處理 (dataProcessor.js)

在 `processGridSchematicJson()` 函數中：

1. 首先生成基本網格節點
2. 計算每列和每行的統計數據（最大值、最小值）
3. 為每個節點計算 `leftRightValue` 和 `upDownValue`
4. 將這些值添加到節點對象中

### 視覺化 (D3jsTab.vue)

在 `drawGridNodes()` 函數中：

1. 繪製主要數值（中間）
2. 繪製左右列值（左上角）
3. 繪製上下行值（右上角）

### 數據傳遞

1. `processGridSchematicJson()` → 生成帶有新屬性的節點
2. `processGridToDrawData()` → 將屬性傳遞到繪製數據
3. `updateDrawJsonData()` → 在重新映射時保留這些屬性
4. `drawGridNodes()` → 視覺化顯示

## 📊 數據結構 (Data Structure)

```javascript
// Grid Node 結構
{
  x: number,              // 節點的列索引
  y: number,              // 節點的行索引
  value: number,          // 節點主要數值 (0-9)
  type: number,           // 節點類型
  coord: { x, y },        // 節點座標
  leftRightValue: number | null,  // 左右列值
  upDownValue: number | null      // 上下行值
}
```

## 🎯 使用場景 (Use Cases)

此功能可用於：

1. **網絡分析**：了解節點與相鄰列/行的關係
2. **數據可視化**：提供多維度的數據展示
3. **決策支援**：基於相鄰區域的特徵做出決策
4. **異常檢測**：識別與周圍環境差異較大的節點

## 🔍 注意事項 (Notes)

1. 邊界節點（最外層）只有單側的相鄰列/行
2. 當兩側最大值相同時，取兩側最小值中較小的那個
3. 數值為 `null` 表示該方向沒有相鄰列/行
4. 這些值會在網格重新映射（隱藏行/列）時保持一致

## 📖 相關文件 (Related Files)

- `src/utils/dataProcessor.js` - 數據計算邏輯
- `src/tabs/D3jsTab.vue` - 視覺化顯示
- `src/stores/dataStore.js` - 數據存儲管理


