/**
 * 站名正規化分組鍵（非顯示名）：同名合併時把 OSM 常見寫法差異視為同一站。
 * 例：市ケ谷／市ヶ谷／市ヶ谷駅、半形／全形。
 */
export function normStationName(s) {
  return String(s || '')
    .trim()
    .normalize('NFKC')
    .replace(/駅$/u, '')
    .replace(/ヶ/g, 'ケ')
    .replace(/が/g, 'ガ')
    .replace(/臺/g, '台')
    .replace(/塩/g, '鹽')
    .replace(/\s+/g, '');
}
