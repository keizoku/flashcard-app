import { describe, expect, test } from "vitest";
import { buildCardPrompt, needsExplanation, parseCardExplanations } from "@/lib/cardPrompts";
import { buildStoryPrompt, parseStoryTitle } from "@/lib/storyPrompt";

describe("カードの解説", () => {
  test("EX-01 needsExplanation: 例文・豆知識がない、または和訳の対応部分がない語がある", () => {
    expect(needsExplanation({ ai_examples: null, ai_trivia: null, targets: [] })).toBe(true);
    expect(needsExplanation({ ai_examples: [], ai_trivia: "x", targets: [{ translation_form: "a" }] })).toBe(false);
    expect(needsExplanation({ ai_examples: [], ai_trivia: "x", targets: [{ translation_form: null }] })).toBe(true);
  });

  test("EX-02 buildCardPrompt はカード番号・例文・対象の語句（見出しが違えば添える）を並べる", () => {
    const p = buildCardPrompt([
      { id: 12, front: "I was skeptical.", targets: [{ word: "skeptical", form: "skeptical" }] },
      { id: 15, front: "I figured it out.", targets: [{ word: "figure sth out", form: "figured it out" }] },
      { id: 16, front: "Plain card.", targets: [] },
    ]);
    expect(p).toContain("### 12\n例文: I was skeptical.\n対象の語句: skeptical\n");
    expect(p).toContain("対象の語句: figured it out（見出し: figure 〜 out）");
    expect(p).toContain("### 16\n例文: Plain card.\n対象の語句: Plain card.");
  });

  test("EX-03 parseCardExplanations: 1語のカード", () => {
    const r = parseCardExplanations(
      [
        "```",
        "### 12",
        "和訳: 最初は半信半疑だった。",
        "対応: 半信半疑",
        "意味: 形容詞「懐疑的な」",
        "例文: She is skeptical. | 彼女は懐疑的だ。",
        "例文: I'm skeptical about that | claim. | 疑問だ。",
        "豆知識: ギリシャ語が語源。",
        "続きの説明。",
        "```",
      ].join("\n")
    );
    expect(r.get(12)).toEqual({
      translation: "最初は半信半疑だった。",
      translationForm: "半信半疑",
      meaning: "形容詞「懐疑的な」",
      examples: [
        { en: "She is skeptical.", ja: "彼女は懐疑的だ。" },
        { en: "I'm skeptical about that", ja: "claim. | 疑問だ。" },
      ],
      trivia: "ギリシャ語が語源。 続きの説明。",
      perTarget: [],
    });
  });

  test("EX-04 parseCardExplanations: 複数の語は「語句 = 内容」で語ごとに", () => {
    const r = parseCardExplanations(
      "### 15\n和訳: 思い切って練習した。\n対応: bit the bullet = 思い切って\n意味: bit the bullet = イディオム\n意味: solely = 副詞"
    );
    expect(r.get(15).perTarget).toEqual([
      { key: "translationForm", phrase: "bit the bullet", value: "思い切って" },
      { key: "meaning", phrase: "bit the bullet", value: "イディオム" },
      { key: "meaning", phrase: "solely", value: "副詞" },
    ]);
    expect(r.get(15).meaning).toBe("イディオム");
  });

  test("EX-05 番号の見出しがなければ空", () => {
    expect(parseCardExplanations("和訳: x").size).toBe(0);
  });
});

describe("物語", () => {
  test("SY-01 buildStoryPrompt は語句（〜 は ... に）・長さ・テーマを入れる", () => {
    const p = buildStoryPrompt({ words: ["figure sth out", "skeptical"], levelLabel: "英検2級", length: "short", theme: "宇宙" });
    expect(p).toContain("- figure ... out\n- skeptical");
    expect(p).toContain("短め（約150語）");
    expect(p).toContain("テーマ・設定: 宇宙");
    expect(buildStoryPrompt({ words: [], levelLabel: "x", length: "??" })).toContain("ふつう（約300語）");
  });

  test("SY-02 parseStoryTitle", () => {
    expect(parseStoryTitle("```\nタイトル: 「The Last Signal」\n[1] ...")).toBe("The Last Signal");
    expect(parseStoryTitle("Title: \"Hello\"")).toBe("Hello");
    expect(parseStoryTitle("[1] no title")).toBe("");
  });
});
