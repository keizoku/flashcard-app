import { beforeEach, describe, expect, test } from "vitest";
import { analyzeTranscript, importSentences, markKnown, registerCards } from "@/app/decks/[id]/import/actions";
import { forgetKnownWord, saveSettings } from "@/app/settings/actions";
import { pool } from "@/lib/db";
import { getSettings, getWordState } from "@/lib/settings";
import { getTargetsByCard } from "@/lib/targets";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/transcript";
import { createCard, createDeck, createUser, formData, getCard, loginAs, resetDb } from "../helpers.js";

let me;
let other;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
  await loginAs(me);
});

const TRANSCRIPT = "0:00 I think this is a very good day for us.\n0:05 I was skeptical about the whole plan at first.";

describe("字幕の取り込み", () => {
  test("IM-01 analyzeTranscript: 字幕と URL を保存して、候補を返す", async () => {
    const deck = await createDeck(me.id);
    const r = await analyzeTranscript({ deckId: deck, text: TRANSCRIPT, url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(r.error).toBeNull();
    expect(r.stages[1].map((c) => c.sentence)).toEqual(["I was skeptical about the whole plan at first."]);
    expect(r.sentencePrompts).toHaveLength(1);
    expect((await pool.query("SELECT video_id, transcript FROM decks")).rows[0]).toEqual({ video_id: "dQw4w9WgXcQ", transcript: TRANSCRIPT });
  });

  test("IM-02 他人のデッキ・空の字幕・おかしな URL は拒否", async () => {
    const theirs = await createDeck(other.id);
    expect((await analyzeTranscript({ deckId: theirs, text: TRANSCRIPT })).error).toMatch(/見つかりません/);
    const mine = await createDeck(me.id);
    expect((await analyzeTranscript({ deckId: mine, text: " " })).error).toMatch(/貼り付けて/);
    expect((await analyzeTranscript({ deckId: mine, text: TRANSCRIPT, url: "nope" })).error).toMatch(/URL/);
  });

  test("IM-08 字幕が200,000文字を超えたらエラー（保存しない）", async () => {
    const deck = await createDeck(me.id);
    const r = await analyzeTranscript({ deckId: deck, text: "a ".repeat(MAX_TRANSCRIPT_LENGTH / 2 + 1) });
    expect(r.error).toMatch(/字幕が長すぎます/);
    expect((await pool.query("SELECT transcript FROM decks")).rows[0].transcript).toBeNull();
  });

  test("IM-03 「知ってる」を押した語は候補から消える（ユーザーごと）", async () => {
    const deck = await createDeck(me.id, { transcript: TRANSCRIPT });
    expect(await markKnown("Skeptical")).toEqual({ error: null });
    expect(await markKnown("not valid!")).toMatchObject({ error: expect.any(String) });
    const r = await analyzeTranscript({ deckId: deck, text: TRANSCRIPT });
    expect(r.stages[1]).toEqual([]);
    expect((await getWordState(other.id)).knownWords.has("skeptical")).toBe(false);
  });

  test("IM-04 registerCards: 選んだ文をカードにする。覚えたい語が複数なら1枚にまとめる", async () => {
    const deck = await createDeck(me.id, { videoId: "dQw4w9WgXcQ" });
    const r = await registerCards({
      deckId: deck,
      items: [
        {
          sentence: "I bit the bullet and practiced solely.",
          back: "",
          start: 12,
          translation: "思い切ってひたすら練習した。",
          targets: [
            { form: "bit the bullet", lemma: "bite the bullet", meaning: "覚悟してやる", translationForm: "思い切って" },
            { form: "solely", lemma: "solely", meaning: "ひたすら", translationForm: "存在しない" },
          ],
        },
      ],
    });
    expect(r).toEqual({ error: null, count: 1 });
    const card = (await pool.query("SELECT * FROM cards")).rows[0];
    expect(card).toMatchObject({ video_id: "dQw4w9WgXcQ", start_seconds: 12, target_word: "bite the bullet", ai_translation: "思い切ってひたすら練習した。" });
    const targets = (await getTargetsByCard([card.id])).get(card.id);
    expect(targets.map((t) => [t.word, t.translation_form])).toEqual([
      ["bite the bullet", "思い切って"],
      ["solely", null], // 和訳の中にない対応部分は捨てる
    ]);
  });

  test("IM-05 registerCards: 文の中にない語・4語以上・他人のデッキは拒否", async () => {
    const deck = await createDeck(me.id);
    const item = (targets) => ({ sentence: "I was skeptical.", back: "", start: null, targets });
    const t = { form: "skeptical", lemma: "skeptical" };
    expect((await registerCards({ deckId: deck, items: [item([{ form: "doubt", lemma: "doubt" }])] })).error).toBeTruthy();
    expect((await registerCards({ deckId: deck, items: [item([t, t, t, t])] })).error).toBeTruthy();
    expect((await registerCards({ deckId: deck, items: [] })).error).toBeTruthy();
    const theirs = await createDeck(other.id);
    expect((await registerCards({ deckId: theirs, items: [item([t])] })).error).toMatch(/見つかりません/);
    expect((await pool.query("SELECT 1 FROM cards")).rowCount).toBe(0);
  });

  test("IM-06 importSentences: AI で整えた文を保存し、登録済みのカードを新しい文で上書きする", async () => {
    const deck = await createDeck(me.id, { transcript: "0:05 i was skeptical about the whole" });
    const card = await createCard(deck, { front: "i was skeptical about the whole", targets: [{ word: "skeptical", form: "skeptical" }] });
    await pool.query("UPDATE cards SET start_seconds = 5 WHERE id = $1", [card]);
    const answer = "[0:05] I was skeptical about the whole plan at first.\n訳: 最初は計画全体に懐疑的だった。\n語句: skeptical = 形容詞「懐疑的な」【懐疑的】";

    const r = await importSentences({ deckId: deck, text: answer });
    expect(r).toMatchObject({ error: null, imported: 1, updatedCards: 1, mode: "ai" });
    expect(await getCard(card)).toMatchObject({
      front: "I was skeptical about the whole plan at first.",
      ai_translation: "最初は計画全体に懐疑的だった。",
      ai_meaning: "形容詞「懐疑的な」",
      ai_translation_form: "懐疑的",
    });
  });

  test("IM-07 importSentences: 元の字幕がなければ、整えた文を字幕として保存する", async () => {
    const deck = await createDeck(me.id);
    await importSentences({ deckId: deck, text: "[0:05] I was skeptical about the whole plan at first." });
    expect((await pool.query("SELECT transcript, sentences_hash FROM decks")).rows[0].transcript).toContain("[0:05]");
  });
});

describe("レベル設定", () => {
  test("LV-01 設定がなければ英検2級（5,000語）", async () => {
    expect(await getSettings(me.id)).toEqual({ levelKey: "eiken-2", vocabSize: 5000, levelLabel: "英検2級" });
  });

  test("LV-02 saveSettings はユーザーごとに保存する", async () => {
    expect(await saveSettings({}, formData({ level: "toeic-900" }))).toEqual({ error: null, saved: true });
    expect(await saveSettings({}, formData({ level: "eiken-1" }))).toEqual({ error: null, saved: true });
    expect(await getSettings(me.id)).toMatchObject({ levelKey: "eiken-1", vocabSize: 12000 });
    expect((await getSettings(other.id)).levelKey).toBe("eiken-2");
  });

  test("LV-03 語彙数を直接指定（100〜30,000 の整数）", async () => {
    expect(await saveSettings({}, formData({ level: "custom", vocabSize: "7777" }))).toMatchObject({ saved: true });
    expect(await getSettings(me.id)).toEqual({ levelKey: "custom", vocabSize: 7777, levelLabel: "語彙数を直接指定" });
    expect(await saveSettings({}, formData({ level: "custom", vocabSize: "99" }))).toMatchObject({ saved: false });
    expect(await saveSettings({}, formData({ level: "custom", vocabSize: "1.5" }))).toMatchObject({ saved: false });
    expect(await saveSettings({}, formData({ level: "nope" }))).toMatchObject({ saved: false });
  });

  test("LV-04 forgetKnownWord は自分の「知ってる」だけ消す", async () => {
    await pool.query("INSERT INTO known_words (user_id, word) VALUES ($1, 'cat'), ($2, 'cat')", [me.id, other.id]);
    await forgetKnownWord("cat");
    expect((await getWordState(me.id)).knownWords.has("cat")).toBe(false);
    expect((await getWordState(other.id)).knownWords.has("cat")).toBe(true);
  });
});

describe("getWordState（知っている語・学習中の語）", () => {
  test("LV-05 「知ってる」の語と「覚えた」（box 3 以上）カードの語は知っている、それ以外のカードの語は学習中", async () => {
    await pool.query("INSERT INTO known_words (user_id, word) VALUES ($1, 'cat')", [me.id]);
    const deck = await createDeck(me.id);
    await createCard(deck, { targets: [{ word: "dog", form: "dog" }], reviewBox: 3 });
    await createCard(deck, { targets: [{ word: "bird", form: "bird" }], reviewBox: 2 });
    // 同じ語のカードが2枚あり、片方が「覚えた」なら知っている
    await createCard(deck, { targets: [{ word: "dog", form: "dog" }], reviewBox: 0 });
    await createCard(await createDeck(other.id), { targets: [{ word: "fish", form: "fish" }] });

    const { knownWords, studyWords } = await getWordState(me.id);
    expect([...knownWords].sort()).toEqual(["cat", "dog"]);
    expect([...studyWords]).toEqual(["bird"]);
  });
});
