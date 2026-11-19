import { beforeEach, describe, expect, test } from "vitest";
import { addCard, addDeck, deleteDecks } from "@/app/actions";
import { deleteCard, updateCard } from "@/app/cards/[id]/edit/actions";
import { deleteCards, getCardPrompt, importCardExplanations } from "@/app/decks/[id]/actions";
import { deleteDeck, updateDeck } from "@/app/decks/[id]/edit/actions";
import { pool } from "@/lib/db";
import { getDeckTags } from "@/lib/tags";
import { MAX_CARDS_PER_PROMPT } from "@/lib/cardPrompts";
import { getTargetsByCard } from "@/lib/targets";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/transcript";
import { createCard, createDeck, createUser, formData, getCard, loginAs, resetDb, runAction } from "../helpers.js";

let me;
let other;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
  await loginAs(me);
});

describe("デッキ", () => {
  test("DK-01 addDeck: 自分のデッキを作り、字幕があれば取り込み画面へ", async () => {
    const { redirectTo } = await runAction(
      addDeck({}, formData({ name: "", url: "https://youtu.be/dQw4w9WgXcQ", transcript: "0:00 hello", tags: "英語, 会話" }))
    );
    const deck = (await pool.query("SELECT * FROM decks")).rows[0];
    expect(deck).toMatchObject({ user_id: me.id, name: "Video dQw4w9WgXcQ", video_id: "dQw4w9WgXcQ", transcript: "0:00 hello" });
    expect(redirectTo).toBe(`/decks/${deck.id}/import`);
    expect(await getDeckTags(deck.id)).toEqual(["会話", "英語"]);
  });

  test("DK-02 addDeck: 入力のチェック", async () => {
    expect((await addDeck({}, formData({ name: "", url: "", transcript: "" }))).error).toMatch(/デッキ名/);
    expect((await addDeck({}, formData({ name: "x", url: "https://example.com", transcript: "" }))).error).toMatch(/URL/);
    expect((await addDeck({}, formData({ name: "x".repeat(101), url: "", transcript: "" }))).error).toMatch(/100文字/);
  });

  test("DK-03 updateDeck / deleteDeck / deleteDecks は他人のデッキを変えない", async () => {
    const mine = await createDeck(me.id, { name: "mine" });
    const theirs = await createDeck(other.id, { name: "theirs" });

    expect(await updateDeck(theirs, {}, formData({ name: "hacked", url: "", transcript: "", tags: "" }))).toMatchObject({
      error: "デッキが見つかりません",
    });
    await runAction(deleteDeck(theirs));
    expect(await deleteDecks([mine, theirs])).toMatchObject({ deleted: 1 });

    const names = (await pool.query("SELECT name FROM decks ORDER BY id")).rows.map((r) => r.name);
    expect(names).toEqual(["theirs"]);
  });

  test("DK-04 updateDeck は名前・タグを変えてデッキ画面へ", async () => {
    const mine = await createDeck(me.id, { name: "old" });
    const { redirectTo } = await runAction(updateDeck(mine, {}, formData({ name: "new", url: "", transcript: "", tags: "a" })));
    expect(redirectTo).toBe(`/decks/${mine}`);
    expect((await pool.query("SELECT name FROM decks")).rows[0].name).toBe("new");
    expect(await getDeckTags(mine)).toEqual(["a"]);
  });

  test("DK-09 addDeck: 字幕がなければデッキの画面へ", async () => {
    const { redirectTo } = await runAction(addDeck({}, formData({ name: "no transcript", url: "", transcript: "" })));
    const deck = (await pool.query("SELECT id FROM decks")).rows[0];
    expect(redirectTo).toBe(`/decks/${deck.id}`);
  });

  test("DK-10 addDeck: 字幕が200,000文字を超えたらエラー", async () => {
    const r = await addDeck({}, formData({ name: "x", url: "", transcript: "a".repeat(MAX_TRANSCRIPT_LENGTH + 1) }));
    expect(r.error).toMatch(/字幕が長すぎます/);
    expect((await pool.query("SELECT 1 FROM decks")).rowCount).toBe(0);
  });

  test("DK-11 deleteDeck: 自分のデッキを消して、トップへ", async () => {
    const mine = await createDeck(me.id);
    await createCard(mine);
    const { redirectTo } = await runAction(deleteDeck(mine));
    expect(redirectTo).toBe("/");
    expect((await pool.query("SELECT 1 FROM decks")).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM cards")).rowCount).toBe(0);
  });

  test("DK-12 deleteDecks: 0個・1001個はエラー", async () => {
    const mine = await createDeck(me.id);
    expect((await deleteDecks([])).error).toMatch(/選んで/);
    expect((await deleteDecks(Array.from({ length: 1001 }, (_, i) => i + 1))).error).toMatch(/1000個/);
    expect((await pool.query("SELECT id FROM decks")).rows).toEqual([{ id: mine }]);
  });
});

describe("カード", () => {
  test("DK-05 addCard: 自分のデッキにだけ追加できる", async () => {
    const mine = await createDeck(me.id);
    const theirs = await createDeck(other.id);
    expect(await addCard(mine, {}, formData({ front: "f", back: "b" }))).toMatchObject({ error: null });
    expect(await addCard(theirs, {}, formData({ front: "f", back: "b" }))).toMatchObject({ error: "このデッキは見つかりません" });
    expect(await addCard(mine, {}, formData({ front: "", back: "b" }))).toMatchObject({ error: expect.stringMatching(/両方/) });
    expect((await pool.query("SELECT deck_id FROM cards")).rows).toEqual([{ deck_id: mine }]);
  });

  test("DK-13 addCard: 表か裏が500文字を超えたらエラー", async () => {
    const mine = await createDeck(me.id);
    expect((await addCard(mine, {}, formData({ front: "a".repeat(501), back: "b" }))).error).toMatch(/500文字以内/);
    expect((await addCard(mine, {}, formData({ front: "f", back: "b".repeat(501) }))).error).toMatch(/500文字以内/);
    expect(await addCard(mine, {}, formData({ front: "a".repeat(500), back: "b" }))).toMatchObject({ error: null });
  });

  test("DK-06 updateCard: 覚えたい語は表の文の中の形、和訳の対応部分は和訳の中の文字", async () => {
    const deck = await createDeck(me.id);
    const card = await createCard(deck, { front: "I was skeptical." });
    const base = { front: "I was skeptical.", back: "", ai_translation: "私は懐疑的だった。", ai_trivia: "", ai_examples: "" };
    const t = (x) => JSON.stringify([{ word: "skeptical", form: "skeptical", meaning: "懐疑的な", translation_form: "懐疑的", ...x }]);

    expect((await updateCard(card, {}, formData({ ...base, targets: t({ form: "doubtful" }) }))).error).toMatch(/表の文の中/);
    expect((await updateCard(card, {}, formData({ ...base, targets: t({ word: "Skeptical!" }) }))).error).toMatch(/小文字/);
    expect((await updateCard(card, {}, formData({ ...base, targets: t({ translation_form: "疑い" }) }))).error).toMatch(/和訳の中/);

    const { redirectTo } = await runAction(
      updateCard(card, {}, formData({ ...base, targets: t(), ai_examples: "She is skeptical. | 彼女は懐疑的だ。\n\nNo translation" }))
    );
    expect(redirectTo).toBe(`/decks/${deck}`);
    const saved = await getCard(card);
    expect(saved).toMatchObject({ target_word: "skeptical", ai_translation_form: "懐疑的", ai_translation: "私は懐疑的だった。" });
    expect(saved.ai_examples).toEqual([
      { en: "She is skeptical.", ja: "彼女は懐疑的だ。" },
      { en: "No translation", ja: "" },
    ]);
    expect(saved.ai_generated_at).not.toBeNull();
  });

  test("DK-07 他人のカードは編集・削除できない", async () => {
    const theirs = await createCard(await createDeck(other.id));
    expect(await updateCard(theirs, {}, formData({ front: "x", back: "", targets: "[]" }))).toEqual({ error: "カードが見つかりません" });
    expect(await deleteCard(theirs)).toEqual({ error: "カードが見つかりません" });
    expect(await getCard(theirs)).not.toBeNull();
  });

  test("DK-14 deleteCard: 自分のカードを消して、デッキの ID を返す", async () => {
    const deck = await createDeck(me.id);
    const card = await createCard(deck);
    expect(await deleteCard(card)).toEqual({ error: null, deckId: deck });
    expect(await getCard(card)).toBeNull();
  });

  test("DK-08 deleteCards は指定したデッキのカードだけ消す", async () => {
    const a = await createDeck(me.id);
    const b = await createDeck(me.id);
    const ca = await createCard(a);
    const cb = await createCard(b);
    expect(await deleteCards(a, [ca, cb])).toMatchObject({ deleted: 1 });
    expect(await getCard(cb)).not.toBeNull();
    expect(await deleteCards(await createDeck(other.id), [cb])).toEqual({ error: "デッキが見つかりません" });
  });
});

describe("カードの解説（チャット AI）", () => {
  test("EX-06 解説が足りないカードのプロンプトを作り、答えを取り込む", async () => {
    const deck = await createDeck(me.id);
    const card = await createCard(deck, { front: "I was skeptical.", targets: [{ word: "skeptical", form: "skeptical" }] });
    const p = await getCardPrompt(deck);
    expect(p).toMatchObject({ error: null, count: 1 });
    expect(p.prompt).toContain(`### ${card}`);

    const answer = [`### ${card}`, "和訳: 私は懐疑的だった。", "対応: 懐疑的", "意味: 形容詞「懐疑的な」", "例文: A | B", "豆知識: T", "### 99999", "和訳: x"].join("\n");
    expect(await importCardExplanations(deck, answer)).toEqual({ error: null, saved: 1, skipped: 1 });
    const saved = await getCard(card);
    expect(saved).toMatchObject({ ai_translation: "私は懐疑的だった。", ai_trivia: "T", ai_meaning: "形容詞「懐疑的な」", ai_translation_form: "懐疑的" });
    expect(await getCardPrompt(deck)).toEqual({ error: "解説が足りないカードはありません" });
  });

  test("EX-07 対応部分が和訳の中になければ使わない", async () => {
    const deck = await createDeck(me.id);
    const card = await createCard(deck, { front: "I was skeptical.", targets: [{ word: "skeptical", form: "skeptical" }] });
    await importCardExplanations(deck, `### ${card}\n和訳: 疑っていた。\n対応: 懐疑的`);
    const targets = (await getTargetsByCard([card])).get(card);
    expect(targets[0].translation_form).toBeNull();
  });

  test("EX-08 複数の語は「語句 = 内容」で語ごとに入れる", async () => {
    const deck = await createDeck(me.id);
    const card = await createCard(deck, {
      front: "I bit the bullet and practiced solely.",
      targets: [
        { word: "bite the bullet", form: "bit the bullet" },
        { word: "solely", form: "solely" },
      ],
    });
    await importCardExplanations(
      deck,
      `### ${card}\n和訳: 思い切ってひたすら練習した。\n対応: bit the bullet = 思い切って\n対応: solely = ひたすら\n意味: solely = 副詞\n意味: bit the bullet = イディオム`
    );
    const targets = (await getTargetsByCard([card])).get(card);
    expect(targets.map((t) => [t.form, t.meaning, t.translation_form])).toEqual([
      ["bit the bullet", "イディオム", "思い切って"],
      ["solely", "副詞", "ひたすら"],
    ]);
  });

  test("EX-09 他人のデッキには取り込めない", async () => {
    const theirs = await createDeck(other.id);
    const card = await createCard(theirs);
    expect(await importCardExplanations(theirs, `### ${card}\n和訳: x`)).toEqual({ error: "デッキが見つかりません" });
    expect(await getCardPrompt(theirs)).toEqual({ error: "デッキが見つかりません" });
  });

  test("EX-10 解説の足りないカードが21枚以上でも、1回のプロンプトは20枚まで", async () => {
    const deck = await createDeck(me.id);
    const ids = [];
    for (let i = 0; i < MAX_CARDS_PER_PROMPT + 1; i++) ids.push(await createCard(deck, { front: `Sentence ${i}.` }));
    const p = await getCardPrompt(deck);
    expect(MAX_CARDS_PER_PROMPT).toBe(20);
    expect(p.count).toBe(20);
    expect(ids.filter((id) => p.prompt.includes(`### ${id}\n`))).toHaveLength(20);
  });
});
