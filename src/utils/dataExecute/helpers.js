/**
 * 輔助函數模組 (Helper Functions Module)
 *
 * 提供數據執行函數所需的共享輔助函數
 *
 * @file helpers.js
 * @version 1.0.0
 * @author Kevin Cheng
 */

/**
 * 計算兩點之間的距離（用於距離矩陣）
 * @param {Array<number>} point1 - [lon, lat]
 * @param {Array<number>} point2 - [lon, lat]
 * @returns {number} 歐幾里得距離
 */
export function calculateDistance(point1, point2) {
  const dx = point1[0] - point2[0];
  const dy = point1[1] - point2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 找到最近的兩個點
 * @param {Array<Array<number>>} points - 點座標陣列 [[lon, lat], ...]
 * @returns {Object} {point1, point2, minDistance}
 */
export function findNearestTwoPoints(points) {
  if (points.length < 2) {
    throw new Error('點數量不足，需要至少 2 個點');
  }

  let minDistance = Infinity;
  let minIdx1 = 0;
  let minIdx2 = 1;

  // 計算距離矩陣
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const distance = calculateDistance(points[i], points[j]);
      if (distance < minDistance) {
        minDistance = distance;
        minIdx1 = i;
        minIdx2 = j;
      }
    }
  }

  return {
    point1: points[minIdx1],
    point2: points[minIdx2],
    minDistance: minDistance,
  };
}

