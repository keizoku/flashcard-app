import { beforeEach, describe, expect, test } from "vitest";
import CardEditPage from "@/app/cards/[id]/edit/page";
import DeckList from "@/app/DeckList";
import DeckEditPage from "@/app/decks/[id]/edit/page";
import ImportPage from "@/app/decks/[id]/import/page";
import DeckPage from "@/app/decks/[id]/page";
import StudySession from "@/app/decks/[id]/study/StudySession";
import StudyPage from "@/app/decks/[id]/study/page";
import Home from "@/app/page";
import StatsPage from "@/app/stats/page";
import { pool } from "@/lib/db";
import { createCard, createDeck, createUser, loginAs, resetDb } from "../helpers.js";

// 画面（Server Component）の SQL を確かめる。画面の関数を呼んで、返ってきた JSX の中身を調べる
// （ブラウザでの見た目や操作は確かめない）

let me;
let other;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
  await loginAs(me);
});

const params = (id) => ({ params: Promise.resolve({ id: String(id) }), searchParams: Promise.resolve({}) });

// JSX の中の文字をすべてつなげる（部品の中身までは開かない）
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props?.children);
}

// JSX の中から、ある部品に渡した props を探す
function propsOf(node, component) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = propsOf(n, component);
      if (found) return found;
    }
    return null;
  }
  if (node.type === component) return node.props;
  return propsOf(node.props?.children, component);
}

const isNotFound = (promise) =>
  promise.then(
    () => false,
    (err) => {
      if (err.notFound) return true;
      throw err;
    }
  );

describe("他人の単語帳・カードの画面", () => {
  test("PG-01 単語帳・編集・取り込み・学習・カード編集の画面は、他人のものなら 404、自分のものなら開ける", async () => {
    const mine = await createDeck(me.id, { name: "mine" });
    const theirs = await createDeck(other.id, { name: "theirs" });
    const myCard = await createCard(mine);
    const theirCard = await createCard(theirs);

    for (const Page of [DeckPage, DeckEditPage, ImportPage, StudyPage]) {
      expect(await isNotFound(Page(params(theirs))), Page.name).toBe(true);
      expect(await isNotFound(Page(params(mine))), Page.name).toBe(false);
      expect(await isNotFound(Page(params("abc"))), Page.name).toBe(true);
    }
    expect(await isNotFound(CardEditPage(params(theirCard)))).toBe(true);
    expect(await isNotFound(CardEditPage(params(myCard)))).toBe(false);
  });
});

describe("トップの単語帳の一覧", () => {
  test("PG-02 自分の単語帳だけを、今日出す枚数と一緒に出す", async () => {
    const mine = await createDeck(me.id, { name: "mine" });
    await createDeck(other.id, { name: "theirs" });
    await createCard(mine); // 未学習 → 今日出す
    const later = await createCard(mine);
    await pool.query("UPDATE cards SET review_due_at = now() + interval '3 days' WHERE id = $1", [later]);

    const page = await Home({ searchParams: Promise.resolve({}) });
    const { decks } = propsOf(page, DeckList);
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({ id: mine, name: "mine", card_count: 2, due_count: 1 });
  });

  test("PG-04 単語帳の種類（動画 / 覚えた単語で作った物語）も渡す。一覧で物語を区別するため", async () => {
    const video = await createDeck(me.id, { name: "video" });
    const story = await createDeck(me.id, { name: "story", kind: "story" });
    const page = await Home({ searchParams: Promise.resolve({}) });
    const { decks } = propsOf(page, DeckList);
    expect(decks.map((d) => [d.id, d.kind])).toEqual([
      [video, "video"],
      [story, "story"],
    ]);
  });
});

describe("統計の画面", () => {
  test("PG-03 自分の単語帳・カード・学習の記録だけを数える", async () => {
    const mine = await createDeck(me.id, { name: "MY-DECK" });
    const theirs = await createDeck(other.id, { name: "THEIR-DECK" });
    const myCard = await createCard(mine, { targets: [{ word: "myword", form: "myword" }] });
    const theirCard = await createCard(theirs, { targets: [{ word: "theirword", form: "theirword" }] });
    await pool.query("UPDATE cards SET lapse_count = 2, review_count = 2 WHERE id = ANY($1)", [[myCard, theirCard]]);
    // 今日の記録: 自分 1 回、他人 3 回
    await pool.query("INSERT INTO review_logs (card_id, deck_id, remembered) VALUES ($1, $2, true)", [myCard, mine]);
    for (let i = 0; i < 3; i++) {
      await pool.query("INSERT INTO review_logs (card_id, deck_id, remembered) VALUES ($1, $2, false)", [theirCard, theirs]);
    }

    const text = textOf(await StatsPage());
    expect(text).toContain("全 1 枚");
    expect(text).toContain("MY-DECK");
    expect(text).toContain("myword");
    expect(text).toContain("今日 1 回（覚えている 1 / 覚えていない 0）");
    expect(text).not.toContain("THEIR-DECK");
    expect(text).not.toContain("theirword");
  });
});

describe("学習の画面", () => {
  test("ST-12 期限を過ぎたもの（古い順）→ 未学習（登録順）の順に出す。期限前のものは「全カード」のときだけ", async () => {
    const deck = await createDeck(me.id);
    const due = async (sql) => {
      const id = await createCard(deck);
      if (sql) await pool.query(`UPDATE cards SET review_due_at = ${sql} WHERE id = $1`, [id]);
      return id;
    };
    const future = await due("now() + interval '1 day'");
    const new1 = await due(null);
    const yesterday = await due("now() - interval '1 day'");
    const twoDaysAgo = await due("now() - interval '2 days'");
    const new2 = await due(null);

    const ids = async (all) => {
      const page = await StudyPage({ params: Promise.resolve({ id: String(deck) }), searchParams: Promise.resolve(all ? { all: "1" } : {}) });
      return propsOf(page, StudySession).cards.map((c) => c.id);
    };
    expect(await ids(false)).toEqual([twoDaysAgo, yesterday, new1, new2]);
    expect(await ids(true)).toEqual([twoDaysAgo, yesterday, future, new1, new2]);
  });
});
