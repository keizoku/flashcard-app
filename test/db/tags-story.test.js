import { beforeEach, describe, expect, test } from "vitest";
import { createStory, makeStoryPrompt } from "@/app/stories/new/actions";
import { pool } from "@/lib/db";
import { createStoryDeck, getWordPool, getWordPoolCounts, STORY_TAG } from "@/lib/story";
import { getAllTags, getDeckTags, setDeckTags } from "@/lib/tags";
import { getTargetsByCard } from "@/lib/targets";
import { createCard, createDeck, createUser, loginAs, resetDb, runAction } from "../helpers.js";

let me;
let other;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
  await loginAs(me);
});

describe("タグ", () => {
  test("TG-05 setDeckTags は置き換え、使われなくなったタグは消す", async () => {
    const deck = await createDeck(me.id);
    await setDeckTags(deck, ["a", "b"]);
    await setDeckTags(deck, ["b", "c"]);
    expect(await getDeckTags(deck)).toEqual(["b", "c"]);
    expect((await pool.query("SELECT name FROM tags ORDER BY name")).rows.map((r) => r.name)).toEqual(["b", "c"]);
  });

  test("TG-06 getAllTags は自分の単語帳に付いたタグだけ（名前は共有）", async () => {
    await setDeckTags(await createDeck(me.id), ["mine", "shared"]);
    await setDeckTags(await createDeck(other.id), ["theirs", "shared"]);
    expect(await getAllTags(me.id)).toEqual(["mine", "shared"]);
    expect(await getAllTags(other.id)).toEqual(["shared", "theirs"]);
  });
});

describe("物語", () => {
  async function seedWords() {
    const deck = await createDeck(me.id);
    await createCard(deck, { targets: [{ word: "skeptical", form: "skeptical" }], reviewBox: 3 });
    await createCard(deck, { targets: [{ word: "figure sth out", form: "figured it out" }], reviewBox: 1 });
    await createCard(await createDeck(other.id), { targets: [{ word: "theirs", form: "theirs" }], reviewBox: 5 });
    return deck;
  }

  test("SY-03 getWordPool: 覚えた語 / 学習中の語 / 両方（自分の語だけ）", async () => {
    const deck = await seedWords();
    expect(await getWordPool(me.id, { source: "learned" })).toEqual(["skeptical"]);
    expect(await getWordPool(me.id, { source: "learning" })).toEqual(["figure sth out"]);
    expect((await getWordPool(me.id, { source: "both" })).sort()).toEqual(["figure sth out", "skeptical"]);
    expect(await getWordPool(me.id, { source: "both", deckId: deck + 999 })).toEqual([]);
    expect(await getWordPoolCounts(me.id)).toEqual({ learned: 1, learning: 1, both: 2 });
  });

  test("SY-04 makeStoryPrompt は語がなければエラー", async () => {
    expect((await makeStoryPrompt({ source: "learned" })).error).toBeTruthy();
    await seedWords();
    const r = await makeStoryPrompt({ source: "both", count: 10, length: "short", theme: "海" });
    expect(r).toMatchObject({ error: null, poolSize: 2 });
    expect(r.words.sort()).toEqual(["figure sth out", "skeptical"]);
    expect(r.prompt).toContain("テーマ・設定: 海");
  });

  test("SY-07 使う語の数は 3〜40 に収める", async () => {
    const deck = await createDeck(me.id);
    for (let i = 0; i < 45; i++) await createCard(deck, { targets: [{ word: `word${i}`, form: `word${i}` }], reviewBox: 3 });
    expect((await makeStoryPrompt({ source: "learned", count: 1 })).words).toHaveLength(3);
    expect((await makeStoryPrompt({ source: "learned", count: 100 })).words).toHaveLength(40);
    expect((await makeStoryPrompt({ source: "learned", count: 10 })).words).toHaveLength(10);
  });

  const ANSWER = [
    "タイトル: The Last Signal",
    "[1] Maya had always been skeptical of the rumors.",
    "訳: マヤはずっとうわさに懐疑的だった。",
    "語句: skeptical = 形容詞「懐疑的な」【懐疑的】",
    "[2] Then she finally figured it out.",
    "訳: そしてついに、彼女はそれを理解した。",
    "語句: figured it out = 句動詞「理解する」【理解した】",
    "[3] The end.",
  ].join("\n");

  test("SY-05 createStoryDeck: 物語の単語帳を作り、語を含む文をカードにする", async () => {
    const r = await createStoryDeck(me.id, { answer: ANSWER, words: ["skeptical", "figure sth out"] });
    expect(r).toMatchObject({ cardCount: 2 });
    const deck = (await pool.query("SELECT * FROM decks WHERE id = $1", [r.deckId])).rows[0];
    expect(deck).toMatchObject({ user_id: me.id, name: "物語: The Last Signal", kind: "story" });
    expect(await getDeckTags(r.deckId)).toEqual([STORY_TAG]);

    const cards = (await pool.query("SELECT id, front, ai_translation FROM cards ORDER BY id")).rows;
    expect(cards.map((c) => c.front)).toEqual(["Maya had always been skeptical of the rumors.", "Then she finally figured it out."]);
    const targets = await getTargetsByCard(cards.map((c) => c.id));
    expect(targets.get(cards[1].id)[0]).toMatchObject({ word: "figure sth out", form: "figured it out", translation_form: "理解した" });
  });

  test("SY-06 createStory: 答えの形がちがえばエラー、正しければ新しい単語帳へ", async () => {
    expect((await createStory({ answer: "hello", words: ["skeptical"] })).error).toMatch(/\[1\]/);
    expect((await createStory({ answer: ANSWER, words: [] })).error).toMatch(/プロンプト/);
    const { redirectTo } = await runAction(createStory({ answer: ANSWER, words: ["skeptical"] }));
    expect(redirectTo).toMatch(/^\/decks\/\d+$/);
  });
});
