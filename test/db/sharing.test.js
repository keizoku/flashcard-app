import { beforeEach, describe, expect, test } from "vitest";
import { updateDisplayName } from "@/app/account/actions";
import { setPublished } from "@/app/decks/[id]/edit/actions";
import { importSharedDeck } from "@/app/shared/actions";
import SharedDeckPage from "@/app/shared/[id]/page";
import { pool } from "@/lib/db";
import {
  copyPublicDeck,
  getPublicDeck,
  listPublicDecks,
  normalizeDisplayName,
  setDeckPublished,
  setDisplayName,
} from "@/lib/sharing";
import { getDeckTags, setDeckTags } from "@/lib/tags";
import { getTargetsByCard } from "@/lib/targets";
import { createCard, createDeck, createUser, formData, loginAs, resetDb, runAction } from "../helpers.js";

// 単語帳の共有（公開・みんなの単語帳・取り込み）

let me;
let other;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ username: "me" });
  other = await createUser({ username: "other" });
  await loginAs(me);
});

// other が作って公開した単語帳（カード2枚・タグ・字幕・解説つき）
async function publishedByOther({ name = "Other's deck" } = {}) {
  await setDisplayName(other.id, "たろう");
  const deck = await createDeck(other.id, { name, transcript: "0:00 I was skeptical.", videoId: "dQw4w9WgXcQ" });
  await setDeckTags(deck, ["英検", "映画"]);
  const c1 = await createCard(deck, {
    front: "I was skeptical.",
    back: "メモ",
    targets: [{ word: "skeptical", form: "skeptical", meaning: "疑い深い", translation_form: "疑って" }],
    reviewBox: 3,
  });
  await pool.query(
    `UPDATE cards SET ai_translation = '私は疑っていた。', ai_examples = '[{"en":"x","ja":"y"}]', ai_trivia = 'まめ',
       ai_generated_at = now(), start_seconds = 5, video_id = 'dQw4w9WgXcQ',
       review_count = 4, lapse_count = 2, review_due_at = now() + interval '9 days', last_reviewed_at = now()
     WHERE id = $1`,
    [c1]
  );
  await pool.query("INSERT INTO review_logs (card_id, deck_id, remembered) VALUES ($1, $2, true)", [c1, deck]);
  await createCard(deck, { front: "Figure it out.", targets: [{ word: "figure sth out", form: "Figure it out" }] });
  expect(await setDeckPublished(other.id, deck, true)).toEqual({ ok: true });
  return deck;
}

describe("表示名", () => {
  test("SH-01 表示名は前後の空白を除き、30文字まで。制御文字は使えない。空なら表示名なし", () => {
    expect(normalizeDisplayName("  たろう  ")).toEqual({ name: "たろう" });
    expect(normalizeDisplayName("a   b")).toEqual({ name: "a b" });
    expect(normalizeDisplayName("")).toEqual({ name: null });
    expect(normalizeDisplayName("あ".repeat(30))).toEqual({ name: "あ".repeat(30) });
    expect(normalizeDisplayName("あ".repeat(31)).error).toMatch(/30文字以内/);
    expect(normalizeDisplayName("a\u0007b").error).toMatch(/使えない文字/);
  });

  test("SH-02 表示名を保存できる（自分の分だけ）。公開中の単語帳があると、空にはできない", async () => {
    const r = await updateDisplayName(null, formData({ displayName: " はなこ " }));
    expect(r).toEqual({ error: null, saved: true, name: "はなこ" });
    const names = await pool.query("SELECT username, display_name FROM users ORDER BY id");
    expect(names.rows).toEqual([
      { username: "me", display_name: "はなこ" },
      { username: "other", display_name: null },
    ]);

    const deck = await createDeck(me.id);
    await createCard(deck);
    await setDeckPublished(me.id, deck, true);
    expect((await updateDisplayName(null, formData({ displayName: "" }))).error).toMatch(/公開中の単語帳がある/);
    await setDeckPublished(me.id, deck, false);
    expect(await updateDisplayName(null, formData({ displayName: "" }))).toMatchObject({ saved: true, name: null });
  });
});

describe("公開する・やめる", () => {
  test("SH-03 表示名とカードがあれば公開できる。公開日時は、公開し直さない限り変わらない。やめると NULL", async () => {
    const deck = await createDeck(me.id);
    expect((await runAction(setPublished(deck, true))).result.error).toMatch(/表示名を決めて/);
    await setDisplayName(me.id, "はなこ");
    expect((await runAction(setPublished(deck, true))).result.error).toMatch(/カードのない単語帳/);
    await createCard(deck);
    expect((await runAction(setPublished(deck, true))).result).toEqual({ ok: true, published: true });
    const first = (await pool.query("SELECT published_at FROM decks WHERE id = $1", [deck])).rows[0].published_at;
    expect(first).not.toBeNull();
    await setDeckPublished(me.id, deck, true);
    expect((await pool.query("SELECT published_at FROM decks WHERE id = $1", [deck])).rows[0].published_at).toEqual(first);
    expect((await runAction(setPublished(deck, false))).result).toEqual({ ok: true, published: false });
    expect((await pool.query("SELECT published_at FROM decks WHERE id = $1", [deck])).rows[0].published_at).toBeNull();
  });

  test("SH-04 他人の単語帳は公開も、公開をやめることもできない", async () => {
    await setDisplayName(me.id, "はなこ");
    const theirs = await publishedByOther();
    const hidden = await createDeck(other.id);
    await createCard(hidden);
    expect((await runAction(setPublished(theirs, false))).result.error).toBe("単語帳が見つかりません");
    expect((await runAction(setPublished(hidden, true))).result.error).toBe("単語帳が見つかりません");
    const { rows } = await pool.query("SELECT id, published_at IS NOT NULL AS published FROM decks ORDER BY id");
    expect(rows).toEqual([
      { id: theirs, published: true },
      { id: hidden, published: false },
    ]);
  });
});

describe("みんなの単語帳", () => {
  test("SH-05 一覧には公開中の単語帳だけが、表示名・枚数・タグ付きで出る。ログインの ID は出さない", async () => {
    const theirs = await publishedByOther();
    await createDeck(other.id, { name: "非公開" });
    await setDisplayName(me.id, "はなこ");
    const mine = await createDeck(me.id, { name: "My public" });
    await createCard(mine);
    await setDeckPublished(me.id, mine, true);

    const list = await listPublicDecks(me.id);
    expect(list.map((d) => d.name).sort()).toEqual(["My public", "Other's deck"]);
    const t = list.find((d) => d.id === theirs);
    expect(t).toMatchObject({ display_name: "たろう", card_count: 2, tags: ["映画", "英検"], is_mine: false, imported_deck_id: null });
    expect(list.find((d) => d.id === mine)).toMatchObject({ display_name: "はなこ", is_mine: true });
    expect(JSON.stringify(list)).not.toMatch(/username|"other"|"me"/);
  });

  test("SH-06 公開していない単語帳の中身は見られない（画面は 404）。公開中なら、カードと覚えたい語が見られる", async () => {
    const theirs = await publishedByOther();
    const hidden = await createDeck(other.id, { name: "非公開" });
    expect(await getPublicDeck(hidden, me.id)).toBeNull();
    await expect(SharedDeckPage({ params: Promise.resolve({ id: String(hidden) }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND|not ?found/i);

    const deck = await getPublicDeck(theirs, me.id);
    expect(deck.cards.map((c) => ({ front: c.front, words: c.words }))).toEqual([
      { front: "I was skeptical.", words: ["skeptical"] },
      { front: "Figure it out.", words: ["figure sth out"] },
    ]);
    expect(JSON.stringify(deck)).not.toMatch(/username|"other"|"me"/);
    expect(deck.cards[0]).not.toHaveProperty("review_box");

    await setDeckPublished(other.id, theirs, false);
    expect(await getPublicDeck(theirs, me.id)).toBeNull();
    expect(await listPublicDecks(me.id)).toEqual([]);
  });
});

describe("取り込み", () => {
  test("SH-07 取り込むと、その時点の単語帳・タグ・カード・解説・覚えたい語が自分の単語帳にコピーされる。学習の状態は最初から", async () => {
    const theirs = await publishedByOther();
    const { redirectTo } = await runAction(importSharedDeck(theirs));
    const { rows: decks } = await pool.query("SELECT * FROM decks WHERE user_id = $1", [me.id]);
    expect(decks).toHaveLength(1);
    const copy = decks[0];
    expect(redirectTo).toBe(`/decks/${copy.id}?notice=imported`);
    expect(copy).toMatchObject({
      name: "Other's deck",
      video_id: "dQw4w9WgXcQ",
      transcript: "0:00 I was skeptical.",
      kind: "video",
      source_deck_id: theirs,
      published_at: null,
    });
    expect(await getDeckTags(copy.id)).toEqual(["映画", "英検"]);

    const { rows: cards } = await pool.query("SELECT * FROM cards WHERE deck_id = $1 ORDER BY id", [copy.id]);
    expect(cards.map((c) => c.front)).toEqual(["I was skeptical.", "Figure it out."]);
    expect(cards[0]).toMatchObject({
      back: "メモ",
      ai_translation: "私は疑っていた。",
      ai_examples: [{ en: "x", ja: "y" }],
      ai_trivia: "まめ",
      start_seconds: 5,
      video_id: "dQw4w9WgXcQ",
      review_box: 0,
      review_count: 0,
      lapse_count: 0,
      review_due_at: null,
      last_reviewed_at: null,
    });
    const targets = await getTargetsByCard(cards.map((c) => c.id));
    expect(targets.get(cards[0].id)).toMatchObject([{ word: "skeptical", form: "skeptical", meaning: "疑い深い", translation_form: "疑って" }]);
    expect(targets.get(cards[1].id)).toMatchObject([{ word: "figure sth out", form: "Figure it out" }]);
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM review_logs WHERE deck_id = $1", [copy.id])).rows[0].n).toBe(0);
  });

  test("SH-08 取り込んだあとに元の単語帳を変えても・消しても、コピーは変わらない。元の単語帳も変わらない", async () => {
    const theirs = await publishedByOther();
    const { deckId } = await copyPublicDeck(me.id, theirs);
    const before = (await pool.query("SELECT * FROM cards WHERE deck_id = $1 ORDER BY id", [theirs])).rows;

    await pool.query("UPDATE cards SET front = 'Changed.' WHERE deck_id = $1", [deckId]);
    expect((await pool.query("SELECT * FROM cards WHERE deck_id = $1 ORDER BY id", [theirs])).rows).toEqual(before);

    await pool.query("UPDATE cards SET back = '元を変えた' WHERE deck_id = $1", [theirs]);
    expect((await pool.query("SELECT back FROM cards WHERE deck_id = $1 ORDER BY id", [deckId])).rows.map((r) => r.back)).toEqual(["メモ", ""]);

    await pool.query("DELETE FROM decks WHERE id = $1", [theirs]);
    const { rows } = await pool.query("SELECT source_deck_id, (SELECT COUNT(*)::int FROM cards WHERE deck_id = $1) AS n FROM decks WHERE id = $1", [deckId]);
    expect(rows[0]).toEqual({ source_deck_id: null, n: 2 });
  });

  test("SH-09 公開していない・ない単語帳・自分の単語帳は取り込めない", async () => {
    const hidden = await createDeck(other.id);
    await createCard(hidden);
    expect((await runAction(importSharedDeck(hidden))).result).toEqual({ error: "この単語帳は公開されていません" });
    expect((await runAction(importSharedDeck(999999))).result).toEqual({ error: "この単語帳は公開されていません" });
    expect((await runAction(importSharedDeck("abc"))).result).toEqual({ error: "この単語帳は公開されていません" });

    await setDisplayName(me.id, "はなこ");
    const mine = await createDeck(me.id);
    await createCard(mine);
    await setDeckPublished(me.id, mine, true);
    expect((await runAction(importSharedDeck(mine))).result).toEqual({ error: "自分の単語帳は取り込めません" });
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM decks")).rows[0].n).toBe(2);
  });

  test("SH-10 取り込みずみの印は、取り込んだ人にだけ付く。もう一度取り込むと、別の単語帳になる", async () => {
    const theirs = await publishedByOther();
    const first = (await copyPublicDeck(me.id, theirs)).deckId;
    expect((await listPublicDecks(me.id))[0].imported_deck_id).toBe(first);
    expect((await getPublicDeck(theirs, me.id)).imported_deck_id).toBe(first);
    const third = await createUser({ username: "third" });
    expect((await listPublicDecks(third.id))[0].imported_deck_id).toBeNull();

    const second = (await copyPublicDeck(me.id, theirs)).deckId;
    expect(second).not.toBe(first);
    expect((await listPublicDecks(me.id))[0].imported_deck_id).toBe(second);
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM decks WHERE user_id = $1", [me.id])).rows[0].n).toBe(2);
  });
});
