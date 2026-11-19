import { expect, test } from "vitest";
import { displayTarget, isIdiomKey, levelLabel } from "@/lib/format";
import { findLevel, LEVELS } from "@/lib/levels";
import { INTERVAL_DAYS, LEARNED_BOX, MAX_BOX, STATUSES } from "@/lib/review";

test("FM-01 displayTarget は sth / sb を 〜 にする", () => {
  expect(displayTarget("figure sth out")).toBe("figure 〜 out");
  expect(displayTarget("take care of sb")).toBe("take care of 〜");
  expect(displayTarget("something")).toBe("something");
  expect(displayTarget(null)).toBe("");
});

test("FM-02 isIdiomKey は空白を含むキー", () => {
  expect(isIdiomKey("bite the bullet")).toBe(true);
  expect(isIdiomKey("run")).toBe(false);
});

test("LV-06 levelLabel は語彙数から英検の級を返す", () => {
  expect(levelLabel(2000)).toBe("英検3級");
  expect(levelLabel(2001)).toBe("英検準2級");
  expect(levelLabel(5000)).toBe("英検2級");
  expect(levelLabel(12000)).toBe("英検1級");
  expect(levelLabel(20000)).toBe("英検1級以上");
});

test("LV-07 findLevel", () => {
  expect(findLevel("eiken-2").vocabSize).toBe(5000);
  expect(findLevel("custom").vocabSize).toBeNull();
  expect(findLevel("nope")).toBeNull();
  expect(new Set(LEVELS.map((l) => l.key)).size).toBe(LEVELS.length);
});

test("ST-10 記憶テストの間隔: 0,1,3,7,14,30,60 日、覚えた = box 3 以上", () => {
  expect(INTERVAL_DAYS).toEqual([0, 1, 3, 7, 14, 30, 60]);
  expect(MAX_BOX).toBe(6);
  expect(LEARNED_BOX).toBe(3);
  expect(INTERVAL_DAYS[LEARNED_BOX]).toBe(7);
  expect(STATUSES.map((s) => s.key)).toEqual(["learned", "learning", "forgot", "new"]);
});
