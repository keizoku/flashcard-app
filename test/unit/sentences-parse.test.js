import { describe, expect, test } from "vitest";
import { buildSentencePrompts, findForm, parseAiSentences, transcriptHash } from "@/lib/sentences";

describe("parseAiSentences（AI で整えた字幕の読み取り）", () => {
  const answer = [
    "```",
    "[0:06] It's simply creating a new YouTube account solely for immersion.",
    "訳: それは、イマージョン専用の YouTube アカウントを新しく作ることです。",
    "語句: solely = 副詞「もっぱら」【専用】 / immersion = 名詞「没入」【イマージョン】",
    "[1:02:03] And it turned out a really good decision.",
    "元: and uh it it turned out a really good decision",
    "訳: そしてそれは本当にいい決断になりました。",
    "```",
  ].join("\n");

  test("SE-01 時刻・文・訳・語句・元の字幕を読む", () => {
    const r = parseAiSentences(answer);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      start: 6,
      text: "It's simply creating a new YouTube account solely for immersion.",
      translation: "それは、イマージョン専用の YouTube アカウントを新しく作ることです。",
      glosses: [
        { phrase: "solely", meaning: "副詞「もっぱら」", ja: "専用" },
        { phrase: "immersion", meaning: "名詞「没入」", ja: "イマージョン" },
      ],
    });
    expect(r[1]).toMatchObject({ start: 3723, original: "and uh it it turned out a really good decision" });
  });

  test("SE-02 物語の [1] 形式は時刻なし", () => {
    const r = parseAiSentences("タイトル: X\n[1] Maya was skeptical.\n訳: マヤは懐疑的だった。");
    expect(r).toEqual([{ start: null, text: "Maya was skeptical.", translation: "マヤは懐疑的だった。", glosses: [], original: "" }]);
  });

  test("SE-03 時刻のない英語の行は前の文の続き。曲がった引用符を直す", () => {
    const r = parseAiSentences("[0:01] I don’t know\nwhat to say.");
    expect(r[0].text).toBe("I don't know what to say.");
  });

  test("SE-04 英語の語がない行や、関係ない文章は無視する", () => {
    expect(parseAiSentences("こんにちは\n[0:01] 123")).toEqual([]);
    expect(parseAiSentences(null)).toEqual([]);
  });
});

describe("buildSentencePrompts", () => {
  test("SE-05 短い字幕は1つのプロンプト。時刻とレベルを入れる", () => {
    const prompts = buildSentencePrompts([{ start: 6, text: "hello there" }], "英検2級");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("[0:06] hello there");
    expect(prompts[0]).toContain("「英検2級」");
  });

  test("SE-06 長い字幕は分けて、何回目かを書く", () => {
    const seg = { start: 0, text: Array.from({ length: 700 }, () => "word").join(" ") };
    const prompts = buildSentencePrompts([seg, seg, seg]);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("全 2 回のうち 1 回目");
    expect(prompts[1]).toContain("前の回の続きです");
  });
});

describe("findForm（新しい文の中で、覚えたい語の形を探す）", () => {
  test("SE-07 そのままの形（大文字小文字は区別しない）", () => {
    expect(findForm("Skeptical people doubt.", { word: "skeptical", form: "skeptical" })).toBe("Skeptical");
  });
  test("SE-08 語の一部には一致しない", () => {
    expect(findForm("He reran it.", { word: "ran", form: "ran" })).toBeNull();
  });
  test("SE-09 活用形がちがっても探す", () => {
    expect(findForm("She runs every day.", { word: "run", form: "ran" })).toBe("runs");
  });
  test("SE-10 イディオムは、そのままの形で見つからなければ null", () => {
    expect(findForm("He bites the bullet.", { word: "bite the bullet", form: "bit the bullet" })).toBeNull();
  });
});

test("SE-11 transcriptHash は字幕が変わったかの判定に使う", () => {
  expect(transcriptHash("a")).toBe(transcriptHash("a"));
  expect(transcriptHash("a")).not.toBe(transcriptHash("b"));
});
