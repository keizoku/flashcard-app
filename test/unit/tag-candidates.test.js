import { expect, test } from "vitest";
import { tagCandidates } from "@/lib/tagCandidates";

// デッキの一覧で、さらに絞り込めるタグの候補。サーバーとブラウザで並びが同じになること

const decks = [
  { tags: ["物語", "旅行", "B"] },
  { tags: ["旅行", "a", "英語"] },
  { tags: ["英語", "物語"] },
  { tags: [] },
];

test("TG-07 絞り込みのタグの候補: 選んでいるタグは除き、件数の多い順。同じ件数なら文字コード順（言語の設定で並びが変わらない）", () => {
  expect(tagCandidates(decks, [])).toEqual([
    { tag: "旅行", count: 2 },
    { tag: "物語", count: 2 },
    { tag: "英語", count: 2 },
    { tag: "B", count: 1 },
    { tag: "a", count: 1 },
  ]);
  expect(tagCandidates(decks, ["英語"]).map((c) => c.tag)).toEqual(["旅行", "物語", "B", "a"]);
  expect(tagCandidates([], [])).toEqual([]);
});
