import { describe, expect, test } from "vitest";
import { analyzeTranscript, findGloss, lacksPunctuation, MAX_STAGE, parseSegments, sameWord } from "@/lib/transcript";

describe("parseSegments（YouTube の文字起こしの貼り付け）", () => {
  test("TR-01 時刻と文が別の行の形", () => {
    expect(parseSegments("0:03\nhello everyone\n0:06\nwelcome back")).toEqual([
      { start: 3, text: "hello everyone" },
      { start: 6, text: "welcome back" },
    ]);
  });

  test("TR-02 時刻・読み上げ用テキスト・本文がくっついた形", () => {
    expect(parseSegments("0:066 secondsnew youtube account\n1:041 minute, 4 secondsand then")).toEqual([
      { start: 6, text: "new youtube account" },
      { start: 64, text: "and then" },
    ]);
  });

  test("TR-03 日本語表示の読み上げ用テキスト・時間付きの時刻", () => {
    expect(parseSegments("1:111 分 11 秒hello\n1:02:03\nlater")).toEqual([
      { start: 71, text: "hello" },
      { start: 3723, text: "later" },
    ]);
  });

  test("TR-04 [Music]・>>・チャプター名・読み上げ用の行・画面の文字を除く", () => {
    const text = "Chapter 1: Intro\n0:00\n[Music] >> hi there\n5 seconds\nSync to video time\nAll comments";
    expect(parseSegments(text)).toEqual([{ start: 0, text: "hi there" }]);
  });

  test("TR-05 [0:06] 形式（AI で整えた字幕）も読める", () => {
    expect(parseSegments("[0:06] It's simple.")).toEqual([{ start: 6, text: "It's simple." }]);
  });

  test("TR-06 時刻のない行は前の時刻を引き継ぐ。曲がった引用符はまっすぐにする", () => {
    expect(parseSegments("0:10\nfirst line\nit’s second")).toEqual([
      { start: 10, text: "first line" },
      { start: 10, text: "it's second" },
    ]);
  });
});

test("TR-07 lacksPunctuation: 句読点がほとんどない字幕を見分ける", () => {
  const words = Array.from({ length: 60 }, () => "word").join(" ");
  expect(lacksPunctuation([{ start: 0, text: words }])).toBe(true);
  expect(lacksPunctuation([{ start: 0, text: "This is one. This is two." }])).toBe(false);
});

describe("analyzeTranscript", () => {
  const known = (extra = {}) => ({ vocabSize: 3000, knownWords: new Set(), studyWords: new Set(), ...extra });

  test("TR-08 知らない語の数で、段階（i+1, i+2, i+3）に分ける", () => {
    const text = [
      "0:00 I think this is a very good day for us.",
      "0:05 I was skeptical about the whole plan at first.",
      "0:10 She was skeptical and ambivalent about the new job.",
    ].join("\n");
    const r = analyzeTranscript(text, known());
    expect(r.mode).toBe("punctuated");
    expect(r.stages[1].map((c) => c.sentence)).toEqual(["I was skeptical about the whole plan at first."]);
    expect(r.stages[1][0].items).toMatchObject([{ kind: "word", form: "skeptical", lemma: "skeptical" }]);
    expect(r.stages[1][0].start).toBe(5);
    expect(r.stages[2].map((c) => c.sentence)).toEqual(["She was skeptical and ambivalent about the new job."]);
    expect(r.comprehension).toMatchObject({ total: 3, understood: 1, percent: 33 });
  });

  test("TR-09 知っている語・語彙数の範囲内の語は数えない", () => {
    const text = "I was skeptical about the whole plan at first.";
    expect(analyzeTranscript(text, known({ knownWords: new Set(["skeptical"]) })).stages[1]).toEqual([]);
    expect(analyzeTranscript(text, known({ vocabSize: 30000 })).comprehension.understood).toBe(1);
  });

  test("TR-10 学習中の語を含む文は候補にしない（理解度では「もう少し」に数える）", () => {
    const text = "I was skeptical about the whole plan at first.";
    const r = analyzeTranscript(text, known({ studyWords: new Set(["skeptical"]) }));
    expect(r.stages[1]).toEqual([]);
    expect(r.comprehension.waiting).toBe(1);
  });

  test("TR-11 人名など文中で大文字の語・全部大文字の語は数えない", () => {
    const r = analyzeTranscript("Yesterday I met Zorblat at the NASA office.", known());
    expect(r.comprehension.understood).toBe(1);
  });

  test("TR-12 短すぎる文・長すぎる文は候補にしない", () => {
    const long = `I was skeptical ${"and then we went home ".repeat(10)}.`;
    const r = analyzeTranscript(`Skeptical indeed. ${long}`, known());
    expect(r.stats.tooShort).toBe(1);
    expect(r.stats.tooLong).toBe(1);
    expect(r.stages[1]).toEqual([]);
  });

  test("TR-13 同じ文は1回だけ数える", () => {
    const r = analyzeTranscript("I was skeptical about it all. I was skeptical about it all.", known());
    expect(r.comprehension.total).toBe(1);
  });

  test("TR-14 イディオムは1つの語として数える", () => {
    const r = analyzeTranscript("In the end I just bit the bullet and called her.", known({ vocabSize: 5000 }));
    expect(r.stages[1]).toHaveLength(1);
    expect(r.stages[1][0].items[0]).toMatchObject({ kind: "idiom", form: "bit the bullet", lemma: "bite the bullet" });
  });

  test("TR-15 AI で整えた文を渡すと、和訳と語句の意味・和訳の対応部分を付ける", () => {
    const sentences = [
      {
        start: 6,
        text: "I was skeptical about the whole plan at first.",
        translation: "最初は計画全体に懐疑的だった。",
        glosses: [{ phrase: "skeptical", meaning: "形容詞「懐疑的な」", ja: "懐疑的" }],
        original: "",
      },
    ];
    const r = analyzeTranscript("", known(), { sentences });
    expect(r.mode).toBe("ai");
    expect(r.stages[1][0]).toMatchObject({
      translation: "最初は計画全体に懐疑的だった。",
      items: [{ meaning: "形容詞「懐疑的な」", translationForm: "懐疑的" }],
    });
  });

  test("TR-16 句読点のない字幕は、接続詞の前などで仮に区切る", () => {
    const text = Array.from({ length: 8 }, () => "we went to the park with my friends and").join(" ");
    expect(analyzeTranscript(text, known()).mode).toBe("heuristic");
  });

  test("TR-17 段階は最大 3", () => {
    expect(MAX_STAGE).toBe(3);
  });
});

describe("findGloss（AI が付けた語句の意味を探す）", () => {
  const glosses = [
    { phrase: "turned out", meaning: "句動詞「結果的に〜になる」", ja: "になりました" },
    { phrase: "puff itself up", meaning: "膨らむ", ja: "" },
  ];
  test("TR-18 文の中の形で一致", () => {
    expect(findGloss(glosses, { form: "turned out", lemma: "turn out" }).meaning).toMatch(/句動詞/);
  });
  test("TR-19 原形でも一致", () => {
    expect(findGloss([{ phrase: "turn out", meaning: "m" }], { form: "turned out", lemma: "turn out" }).meaning).toBe("m");
  });
  test("TR-20 1語の対象が熟語の一部として説明されている場合", () => {
    expect(findGloss(glosses, { form: "puff", lemma: "puff" }).meaning).toBe("膨らむ");
  });
  test("TR-21 見つからなければ null", () => {
    expect(findGloss(glosses, { form: "skeptical", lemma: "skeptical" })).toBeNull();
    expect(findGloss(null, { form: "x", lemma: "x" })).toBeNull();
  });
  test("TR-22 sameWord は活用形を同じ語とみなす", () => {
    expect(sameWord("ran", "run")).toBe(true);
    expect(sameWord("cat", "dog")).toBe(false);
  });
});
