import { beforeEach, describe, expect, test } from "vitest";
import { dismissOnboarding } from "@/app/actions";
import Home from "@/app/page";
import { pool } from "@/lib/db";
import { getOnboarding } from "@/lib/onboarding";
import { createCard, createDeck, createUser, loginAs, resetDb, runAction } from "../helpers.js";

// トップの「はじめの4ステップ」（lib/onboarding.js、docs/features.md）
let me;
let other;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
  await loginAs(me);
});

const doneOf = (o) => Object.fromEntries(o.steps.map((s) => [s.key, s.done]));
const hrefOf = (o, key) => o.steps.find((s) => s.key === key).href;

describe("はじめの4ステップ", () => {
  test("OB-01 新しいユーザー: 4つとも未完了で、欄を出す。行き先はレベル設定・動画を探す。3と4はまだ行き先がない", async () => {
    const o = await getOnboarding(me.id);
    expect(o.show).toBe(true);
    expect(o.doneCount).toBe(0);
    expect(o.steps.map((s) => s.key)).toEqual(["level", "deck", "cards", "study"]);
    expect(hrefOf(o, "level")).toBe("/settings");
    expect(hrefOf(o, "deck")).toBe("/search");
    expect(hrefOf(o, "cards")).toBeNull();
    expect(hrefOf(o, "study")).toBeNull();
  });

  test("OB-02 データを見て自動でチェックが付き、次の行き先が決まる（物語のデッキは字幕を貼る先にしない）", async () => {
    await pool.query("INSERT INTO settings (user_id, level_key, vocab_size) VALUES ($1, 'eiken-pre2', 3000)", [me.id]);
    await createDeck(me.id, { name: "物語", kind: "story" });
    const deck = await createDeck(me.id, { name: "動画" });
    let o = await getOnboarding(me.id);
    expect(doneOf(o)).toEqual({ level: true, deck: true, cards: false, study: false });
    expect(hrefOf(o, "cards")).toBe(`/decks/${deck}/import`);

    const card = await createCard(deck);
    o = await getOnboarding(me.id);
    expect(doneOf(o)).toMatchObject({ cards: true, study: false });
    expect(hrefOf(o, "study")).toBe(`/decks/${deck}/study`);

    await pool.query("INSERT INTO review_logs (card_id, deck_id, remembered) VALUES ($1, $2, true)", [card, deck]);
    o = await getOnboarding(me.id);
    expect(o.doneCount).toBe(4);
    expect(o.show).toBe(false);
  });

  test("OB-03 他人のデータでは、チェックが付かない", async () => {
    await pool.query("INSERT INTO settings (user_id, level_key, vocab_size) VALUES ($1, 'eiken-2', 5000)", [other.id]);
    const deck = await createDeck(other.id);
    const card = await createCard(deck);
    await pool.query("INSERT INTO review_logs (card_id, deck_id, remembered) VALUES ($1, $2, true)", [card, deck]);
    const o = await getOnboarding(me.id);
    expect(o.doneCount).toBe(0);
    expect(hrefOf(o, "study")).toBeNull();
  });

  test("OB-04 「閉じる」を押すと、終わっていなくても出なくなる。閉じるのは自分の分だけ", async () => {
    await runAction(dismissOnboarding());
    expect((await getOnboarding(me.id)).show).toBe(false);
    expect((await getOnboarding(other.id)).show).toBe(true);
  });

  test("OB-05 トップの画面は、出すときだけ欄の中身を渡す", async () => {
    const find = (node) => {
      if (node == null || typeof node !== "object") return null;
      if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null;
      if (node.props?.onboarding) return node.props.onboarding;
      return find(node.props?.children);
    };
    const shown = find(await Home({ searchParams: Promise.resolve({}) }));
    expect(shown?.show).toBe(true);
    await runAction(dismissOnboarding());
    expect(find(await Home({ searchParams: Promise.resolve({}) }))).toBeNull();
  });
});
