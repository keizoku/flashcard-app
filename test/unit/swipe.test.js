import { expect, test } from "vitest";
import { MAX_SWIPE_MS, MIN_SWIPE_PX, swipeKey } from "@/lib/swipe";

// iPhone・iPad など、キーボードのない端末で、左右のスワイプを ← / → キーの代わりにする

const at = (x, y = 300, t = 0) => ({ x, y, t });

test("SW-01 指を右へ動かすと →、左へ動かすと ←（記憶テスト: キーと同じ向き）", () => {
  expect(swipeKey(at(100), at(220, 300, 200))).toBe("ArrowRight");
  expect(swipeKey(at(220), at(100, 300, 200))).toBe("ArrowLeft");
});

test("SW-02 ページをめくる向き（スライド）: 指を左へ動かすと次（→）、右へ動かすと前（←）", () => {
  expect(swipeKey(at(220), at(100, 300, 200), { pageTurn: true })).toBe("ArrowRight");
  expect(swipeKey(at(100), at(220, 300, 200), { pageTurn: true })).toBe("ArrowLeft");
});

test("SW-03 短すぎる・ゆっくりすぎる・縦に動かした（スクロール）ときは、なにもしない", () => {
  // 短い（タップや指のぶれ）
  expect(swipeKey(at(100), at(100 + MIN_SWIPE_PX - 1, 300, 100))).toBeNull();
  expect(swipeKey(at(100), at(100 + MIN_SWIPE_PX, 300, 100))).toBe("ArrowRight");
  // ゆっくり（文字を選んでいる、など）
  expect(swipeKey(at(100), at(250, 300, MAX_SWIPE_MS + 1))).toBeNull();
  // 縦の動きが大きい（ページのスクロール）
  expect(swipeKey(at(100, 300), at(200, 420, 200))).toBeNull();
  // 少しななめでも、横の動きが十分大きければスワイプ
  expect(swipeKey(at(100, 300), at(220, 340, 200))).toBe("ArrowRight");
  // 始まりがない
  expect(swipeKey(null, at(220))).toBeNull();
});
