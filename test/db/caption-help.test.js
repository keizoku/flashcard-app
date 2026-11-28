import { beforeEach, describe, expect, test } from "vitest";
import ImportPage from "@/app/decks/[id]/import/page";
import { CAPTION_HELP_COOKIE } from "@/lib/uiPrefs";
import { createDeck, createUser, loginAs, resetDb } from "../helpers.js";

// 字幕から例文を追加する画面の「YouTube の字幕をコピーする方法」（docs/features.md）
let me;
let deck;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ username: "me" });
  await loginAs(me);
  deck = await createDeck(me.id, { name: "動画" });
});

const open = () => ImportPage({ params: Promise.resolve({ id: String(deck) }) });
function findProps(node, match) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((n) => findProps(n, match)).find(Boolean) ?? null;
  if (node.props && match(node.props)) return node.props;
  return findProps(node.props?.children, match);
}
const helpOf = (page) => findProps(page, (p) => "initialClosed" in p);

describe("字幕をコピーする方法", () => {
  test("CH-01 はじめは開いた状態で出す", async () => {
    expect(helpOf(await open())).toMatchObject({ initialClosed: false });
  });

  test("CH-02 「閉じる」を押したこと（Cookie）が残っていれば、1行だけの状態で出す", async () => {
    globalThis.testCookies.set(CAPTION_HELP_COOKIE, "closed");
    expect(helpOf(await open())).toMatchObject({ initialClosed: true });
    globalThis.testCookies.set(CAPTION_HELP_COOKIE, "something-else");
    expect(helpOf(await open())).toMatchObject({ initialClosed: false });
  });
});
