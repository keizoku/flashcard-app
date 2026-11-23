import { afterEach, beforeEach, describe, expect, test } from "vitest";
import Landing from "@/app/landing/Landing";
import RootLayout from "@/app/layout";
import LoginPage from "@/app/login/page";
import Home from "@/app/page";
import SignupPage from "@/app/signup/page";
import { isSignupOpen } from "@/lib/allowlist";
import { resetDb } from "../helpers.js";

// 使える人を決めている（ALLOWED_EMAILS）ときは、だれでも登録できるように見せない（docs/auth.md）
beforeEach(resetDb);
afterEach(() => {
  delete process.env.ALLOWED_EMAILS;
});
const inviteOnly = () => {
  process.env.ALLOWED_EMAILS = "me@example.com";
};

// JSX の中の文字をすべてつなげる（部品の中身までは開かない）
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props?.children);
}
// JSX の中のリンク先をすべて集める
function hrefsOf(node, out = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => hrefsOf(n, out));
    return out;
  }
  if (node.props?.href) out.push(node.props.href);
  hrefsOf(node.props?.children, out);
  return out;
}

describe("決まった人だけが使えるときの表示", () => {
  test("IV-01 登録を受け付けているかどうか（ALLOWED_EMAILS が空なら受け付ける）", () => {
    expect(isSignupOpen()).toBe(true);
    inviteOnly();
    expect(isSignupOpen()).toBe(false);
  });

  test("IV-02 ホームページ: 「無料で始める」を出さず、決まった人だけと伝える。ログインへは行ける", async () => {
    const open = Landing({});
    expect(textOf(open)).toContain("無料で始める");
    expect(hrefsOf(open)).toContain("/signup");

    inviteOnly();
    const home = await Home({ searchParams: Promise.resolve({}) });
    expect(home.props.inviteOnly).toBe(true);
    const closed = Landing({ inviteOnly: true });
    expect(textOf(closed)).not.toContain("無料で始める");
    expect(textOf(closed)).toContain("決まった人だけ");
    expect(hrefsOf(closed)).not.toContain("/signup");
    expect(hrefsOf(closed)).toContain("/login");
  });

  test("IV-03 ヘッダーとログインの画面: 新規登録へのリンクを出さない", async () => {
    expect(hrefsOf(await RootLayout({ children: null }))).toContain("/signup");
    expect(hrefsOf(await LoginPage({ searchParams: Promise.resolve({}) }))).toContain("/signup");

    inviteOnly();
    expect(hrefsOf(await RootLayout({ children: null }))).not.toContain("/signup");
    expect(hrefsOf(await LoginPage({ searchParams: Promise.resolve({}) }))).not.toContain("/signup");
  });

  test("IV-04 新規登録の画面: 直接開いたら、決まった人だけが登録できると書く（決めた人は登録できる）", async () => {
    expect(textOf(await SignupPage())).not.toContain("決まった人だけ");
    inviteOnly();
    expect(textOf(await SignupPage())).toContain("決まった人だけ");
  });
});
