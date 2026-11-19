import { expect, test } from "vitest";
import { findIdioms } from "@/lib/idioms";
import { allBaseForms, lemmaCandidates, totalLemmas } from "@/lib/vocab";

test("VO-01 活用形は、より頻出の原形にまとめる", () => {
  expect(lemmaCandidates("running")[0].lemma).toBe("run");
  expect(lemmaCandidates("ran")[0].lemma).toBe("run");
  expect(lemmaCandidates("abandons")[0].lemma).toBe("abandon");
});

test("VO-02 短縮形は元の語として扱う", () => {
  expect(lemmaCandidates("don't")[0].lemma).toBe("do");
  expect(lemmaCandidates("can't")[0].lemma).toBe("can");
  expect(lemmaCandidates("won't")[0].lemma).toBe("will");
});

test("VO-03 頻出の語ほど順位が小さい", () => {
  const the = lemmaCandidates("the")[0].rank;
  const skeptical = lemmaCandidates("skeptical")[0].rank;
  expect(the).toBeLessThan(100);
  expect(skeptical).toBeGreaterThan(5000);
});

test("VO-04 リストにない語は順位なし", () => {
  expect(lemmaCandidates("zzzqqq")[0]).toEqual({ lemma: "zzzqqq", rank: null });
});

test("VO-05 allBaseForms は頻度に関係なく原形の候補をすべて返す（bit → bite）", () => {
  expect(allBaseForms("bit")).toContain("bite");
  expect(totalLemmas()).toBeGreaterThan(10000);
});

const tokensOf = (sentence) =>
  sentence.split(" ").map((w) => {
    const lower = w.toLowerCase();
    return { forms: new Set([lower, ...allBaseForms(lower)]) };
  });

test("VO-06 イディオムを活用形・間に入る語ごと見つける", () => {
  const found = findIdioms(tokensOf("I finally figured it out"));
  expect(found.map((m) => m.idiom.key)).toContain("figure sth out");
  const m = found.find((x) => x.idiom.key === "figure sth out");
  expect([m.first, m.last]).toEqual([2, 4]);

  expect(findIdioms(tokensOf("she bit the bullet")).map((m) => m.idiom.key)).toContain("bite the bullet");
});

test("VO-07 重なるイディオムは長いものを優先する", () => {
  const found = findIdioms(tokensOf("he bit the bullet today"));
  const used = found.flatMap((m) => [...m.matched]);
  expect(new Set(used).size).toBe(used.length);
});
