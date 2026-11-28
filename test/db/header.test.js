import { existsSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import RootLayout from "@/app/layout";
import { setDisplayName } from "@/lib/sharing";
import { createUser, loginAs, resetDb } from "../helpers.js";

// 画面の上のヘッダー。アカウントのリンクには、ログインの ID ではなく表示名（ニックネーム）を出す

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props?.children);
}

// リンク先（href）を全部集める
function hrefsOf(node, out = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => hrefsOf(n, out));
    return out;
  }
  if (typeof node.props?.href === "string") out.push(node.props.href);
  hrefsOf(node.props?.children, out);
  return out;
}

// href が /account のリンク
function accountLink(node) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = accountLink(n);
      if (found) return found;
    }
    return null;
  }
  if (node.props?.href === "/account") return node;
  return accountLink(node.props?.children);
}

let me;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ username: "me" });
  await loginAs(me);
});

describe("ヘッダーのアカウントのリンク", () => {
  test("SS-10 表示名があれば表示名を出す。なければ「アカウント」。どちらでもログインの ID は出さない", async () => {
    let page = await RootLayout({ children: null });
    expect(textOf(accountLink(page))).toBe("アカウント");
    expect(textOf(page)).not.toMatch(/\bme\b/);

    await setDisplayName(me.id, "たろう");
    page = await RootLayout({ children: null });
    expect(textOf(accountLink(page))).toBe("たろう");
    expect(textOf(page)).not.toMatch(/\bme\b/);
  });
});

describe("ほかの人の単語帳を使う入り口", () => {
  test("SS-11 「動画を探す」はない。ほかの人の単語帳は、本人が公開したものだけを「みんなの単語帳」で使う", async () => {
    const page = await RootLayout({ children: null });
    expect(textOf(page)).not.toContain("動画を探す");
    expect(hrefsOf(page)).not.toContain("/search");
    expect(hrefsOf(page)).toContain("/shared");
    // 公開していない単語帳の動画を集める画面と道具は、もうない
    expect(existsSync("app/search")).toBe(false);
    expect(existsSync("lib/recommend.js")).toBe(false);
  });
});
