/**
 * 2点間のユークリッド距離を計算します。
 */
export function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * ユニットAとユニットBが衝突（重なり）しているか判定します。
 * マージンを含めて判定します。
 */
export function isColliding(x1, y1, r1, x2, y2, r2) {
    const dist = distance(x1, y1, x2, y2);
    return dist < (r1 + r2);
}