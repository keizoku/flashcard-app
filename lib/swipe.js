// 左右のスワイプとタップを、← / → キーに置きかえる（iPhone・iPad など、キーボードのない端末のため）。
// 画面の部品（app/components/useSwipeKeys.js）から使う。テストしやすいよう、計算だけをここに置く

// これより短い動きは、タップや指のぶれとみなす
export const MIN_SWIPE_PX = 50;
// これより長くかけた動きは、文字を選ぶなどの別の操作とみなす
export const MAX_SWIPE_MS = 800;
// 縦の動きが、横の動きのこの割合を超えたら、ページのスクロールとみなす
const MAX_SLOPE = 0.6;

// start / end: { x, y, t }（画面の座標と、時刻のミリ秒）
// pageTurn: true なら、本のページをめくる向き（指を左へ → 次）。
//           false なら、キーと同じ向き（指を右へ → →）
// 返す値: "ArrowRight" / "ArrowLeft" / null（スワイプではない）
export function swipeKey(start, end, { pageTurn = false } = {}) {
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < MIN_SWIPE_PX) return null;
  if (end.t - start.t > MAX_SWIPE_MS) return null;
  if (Math.abs(dy) > Math.abs(dx) * MAX_SLOPE) return null;
  const toRight = dx > 0;
  return toRight !== pageTurn ? "ArrowRight" : "ArrowLeft";
}

// タップ: これより動かしたら、タップではない（スワイプやスクロール）
export const MAX_TAP_PX = 10;
// タップ: これより長く押したら、タップではない（長押しで文字を選ぶ、など）
export const MAX_TAP_MS = 500;

// ほとんど動かさず、すぐ離したか
export function isTap(start, end) {
  if (!start || !end) return false;
  return (
    Math.abs(end.x - start.x) <= MAX_TAP_PX &&
    Math.abs(end.y - start.y) <= MAX_TAP_PX &&
    end.t - start.t <= MAX_TAP_MS
  );
}
