import { beforeEach, describe, expect, test } from "vitest";
import { addDeck, dismissOnboarding } from "@/app/actions";
import NewDeckPage from "@/app/decks/new/page";
import SettingsPage from "@/app/settings/page";
import Home from "@/app/page";
import { pool } from "@/lib/db";
import { getOnboarding } from "@/lib/onboarding";
import { createCard, createDeck, createUser, formData, loginAs, resetDb, runAction } from "../helpers.js";

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
  test("OB-01 新しいユーザー: 4つとも未完了で、欄を出す。行き先はレベル設定・新しい単語帳。3と4はまだ行き先がない", async () => {
    const o = await getOnboarding(me.id);
    expect(o.show).toBe(true);
    expect(o.doneCount).toBe(0);
    expect(o.steps.map((s) => s.key)).toEqual(["level", "deck", "cards", "study"]);
    expect(hrefOf(o, "level")).toBe("/settings");
    expect(hrefOf(o, "deck")).toBe("/decks/new");
    expect(hrefOf(o, "cards")).toBeNull();
    expect(hrefOf(o, "study")).toBeNull();
  });

  test("OB-02 データを見て自動でチェックが付き、次の行き先が決まる（物語の単語帳は字幕を貼る先にしない）", async () => {
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

  test("OB-06 レベル設定の画面: ステップの途中なら、保存したあと「次へ」でトップに戻れるようにする。終わった人には出さない", async () => {
    const formProps = (node) => findProps(node, (p) => "levelKey" in p);
    let page = await SettingsPage();
    expect(formProps(page).nextHref).toBe("/");
    expect(hrefsOf(page)).toContain("/");
    await runAction(dismissOnboarding());
    page = await SettingsPage();
    expect(formProps(page).nextHref ?? null).toBeNull();
  });

  test("OB-07 新しい単語帳の画面: ステップの途中なら手順を出す。終わった人には出さない。どちらでも「動画を探す」へのリンクはない", async () => {
    const open = async () => NewDeckPage({ searchParams: Promise.resolve({}) });
    let page = await open();
    expect(textOf(page)).toContain("YouTube で、見たい英語の動画を開く");
    expect(hrefsOf(page)).not.toContain("/search");
    await runAction(dismissOnboarding());
    page = await open();
    expect(textOf(page)).not.toContain("YouTube で、見たい英語の動画を開く");
    expect(hrefsOf(page)).not.toContain("/search");
  });

  test("OB-08 ステップの途中に単語帳を作ると、字幕がなくても、そのまま字幕を貼る画面へ進む", async () => {
    const { redirectTo } = await runAction(addDeck({}, formData({ name: "最初の動画", url: "", transcript: "" })));
    const deck = (await pool.query("SELECT id FROM decks WHERE user_id = $1", [me.id])).rows[0];
    expect(redirectTo).toBe(`/decks/${deck.id}/import`);
  });

  test("OB-09 サンプルの単語帳がある人（おためし）: 「サンプルで試す」（記憶テスト・字幕から文を選ぶ）を別に出す。サンプルでは「自分で作る」のステップは進まない。ない人には出さない", async () => {
    expect((await getOnboarding(me.id)).sample).toBeNull();

    const sample = await createDeck(me.id, { name: "サンプル" });
    const story = await createDeck(me.id, { name: "物語のサンプル", kind: "story" });
    await pool.query("UPDATE decks SET is_sample = true WHERE id = ANY($1::int[])", [[sample, story]]);
    const card = await createCard(sample);
    await createCard(story);
    let o = await getOnboarding(me.id);
    expect(o.sample).toEqual({ deckId: sample, studied: false, studyHref: `/decks/${sample}/study`, importHref: `/decks/${sample}/import` });
    // サンプルだけでは、自分で作るステップ（単語帳・カード・記憶テスト）は終わらない。記憶テストの行き先にもしない
    expect(doneOf(o)).toEqual({ level: false, deck: false, cards: false, study: false });
    expect(hrefOf(o, "study")).toBeNull();

    // サンプルで記憶テストをすると「サンプルで試す」が終わる。自分で作るステップはそのまま
    await pool.query("INSERT INTO review_logs (card_id, deck_id, remembered) VALUES ($1, $2, true)", [card, sample]);
    o = await getOnboarding(me.id);
    expect(o.sample.studied).toBe(true);
    expect(doneOf(o).study).toBe(false);
    expect(o.show).toBe(true);

    // 自分の動画の単語帳で進める
    const mine = await createDeck(me.id, { name: "自分の動画" });
    o = await getOnboarding(me.id);
    expect(doneOf(o).deck).toBe(true);
    expect(hrefOf(o, "cards")).toBe(`/decks/${mine}/import`);
    // 他人のサンプルは見ない
    expect((await getOnboarding(other.id)).sample).toBeNull();
  });
});

// JSX の中の文字をすべてつなげる（部品の中身までは開かない。手順の部品だけは開く）
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node.type === "function" && node.type.name === "DeckSteps") return textOf(node.type(node.props));
  return textOf(node.props?.children);
}
function hrefsOf(node, out = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => hrefsOf(n, out));
    return out;
  }
  if (typeof node.type === "function" && node.type.name === "DeckSteps") return hrefsOf(node.type(node.props), out);
  if (node.props?.href) out.push(node.props.href);
  hrefsOf(node.props?.children, out);
  return out;
}
function findProps(node, match) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((n) => findProps(n, match)).find(Boolean) ?? null;
  if (node.props && match(node.props)) return node.props;
  return findProps(node.props?.children, match);
}
