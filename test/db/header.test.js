import { beforeEach, describe, expect, test } from "vitest";
import RootLayout from "@/app/layout";
import { setDisplayName } from "@/lib/sharing";
import { createUser, loginAs, resetDb } from "../helpers.js";

// 画面の上のヘッダー。アカウントのリンクには、メールアドレスではなく表示名（ニックネーム）を出す

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props?.children);
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
  me = await createUser({ email: "me@example.com" });
  await loginAs(me);
});

describe("ヘッダーのアカウントのリンク", () => {
  test("SS-10 表示名があれば表示名を出す。なければ「アカウント」。どちらでもメールアドレスは出さない", async () => {
    let page = await RootLayout({ children: null });
    expect(textOf(accountLink(page))).toBe("アカウント");
    expect(textOf(page)).not.toContain("me@example.com");

    await setDisplayName(me.id, "たろう");
    page = await RootLayout({ children: null });
    expect(textOf(accountLink(page))).toBe("たろう");
    expect(textOf(page)).not.toContain("me@example.com");
  });
});
