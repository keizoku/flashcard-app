import { beforeEach, describe, expect, test } from "vitest";
import AgreePage from "@/app/agree/page";
import { agreeToTerms } from "@/app/agree/actions";
import { POST as postStudyTime } from "@/app/api/study-time/route";
import { signup } from "@/app/auth/actions";
import RootLayout from "@/app/layout";
import Home from "@/app/page";
import TermsPage from "@/app/terms/page";
import { startGuest } from "@/app/try/actions";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { needsTermsAgreement, TERMS_VERSION } from "@/lib/terms";
import { createAccountByAdmin } from "@/lib/userAdmin";
import { createUser, formData, loginAs, resetDb, runAction } from "../helpers.js";

// 利用規約（無料・実験中・保証しない・損害の責任を負わない）と、同意してもらうステップ
beforeEach(async () => {
  await resetDb();
  globalThis.testHeaders = { "x-forwarded-for": "198.51.100.50" };
});

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node.type === "function" && !node.type.prototype?.render) {
    try {
      const out = node.type(node.props ?? {});
      if (!(out instanceof Promise)) return textOf(out);
    } catch {}
  }
  return textOf(node.props?.children);
}

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

const agreedRow = async (id) =>
  (await pool.query("SELECT terms_version, terms_agreed_at FROM users WHERE id = $1", [id])).rows[0];

describe("利用規約を読む", () => {
  test("KY-01 利用規約には、無料・実験中であること、保証しないこと、損害の責任を負わないこと（法律で認められる範囲で）が書いてある", () => {
    const text = textOf(TermsPage());
    for (const s of ["無料", "実験", "何も保証しません", "責任を負いません", "消費者契約法", "日本の法律"]) {
      expect(text).toContain(s);
    }
  });

  test("KY-02 どの画面の下にも、利用規約へのリンクと「無料・実験中」を出す（ログインしていなくても）", async () => {
    let page = await RootLayout({ children: null });
    expect(hrefsOf(page)).toContain("/terms");
    expect(textOf(page)).toContain("実験中");
    await loginAs(await createUser({ username: "me" }));
    page = await RootLayout({ children: null });
    expect(hrefsOf(page)).toContain("/terms");
  });
});

describe("登録・おためしで同意してもらう", () => {
  test("KY-03 新規登録は、利用規約に同意しないとできない。同意すると、同意した版と日時を記録する", async () => {
    const base = { username: "taro", password: "newpassword", password2: "newpassword" };
    const r = await signup({}, formData(base));
    expect(r.error).toMatch(/利用規約/);
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(0);

    expect((await signup({}, formData({ ...base, terms: "on" }))).done).toBe(true);
    const user = await getCurrentUser();
    expect(user.termsVersion).toBe(TERMS_VERSION);
    expect((await agreedRow(user.id)).terms_agreed_at).not.toBeNull();
  });

  test("KY-04 おためしも、利用規約に同意しないと始められない。同意すると記録する", async () => {
    const r = await runAction(startGuest({ error: null }, formData({ agree: "on" })));
    expect(r.result.error).toMatch(/利用規約/);
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(0);

    const ok = await runAction(startGuest({ error: null }, formData({ agree: "on", terms: "on" })));
    expect(ok.redirectTo).toBe("/");
    expect((await getCurrentUser()).termsVersion).toBe(TERMS_VERSION);
  });
});

describe("まだ同意していない人（前からのアカウントなど）", () => {
  test("KY-05 ログインが必要な画面・トップは、同意の画面（/agree）へ移す。同意した人はそのまま使える", async () => {
    const old = await createUser({ username: "old", agreed: false });
    await loginAs(old);
    expect(needsTermsAgreement(await getCurrentUser())).toBe(true);
    expect((await runAction(requireUser())).redirectTo).toBe("/agree");
    expect((await runAction(Home({ searchParams: Promise.resolve({}) }))).redirectTo).toBe("/agree");
    expect((await runAction(AgreePage())).redirectTo).toBeNull();

    globalThis.testCookies.clear();
    await loginAs(await createUser({ username: "new" }));
    expect((await runAction(requireUser())).redirectTo).toBeNull();
    // 同意ずみの人が同意の画面を開くと、トップへ
    expect((await runAction(AgreePage())).redirectTo).toBe("/");
  });

  test("KY-06 規約の版が上がったら（前の版に同意した人）、もう一度同意してもらう", async () => {
    const u = await createUser({ username: "me" });
    await pool.query("UPDATE users SET terms_version = $2 WHERE id = $1", [u.id, TERMS_VERSION - 1]);
    await loginAs(u);
    expect((await runAction(requireUser())).redirectTo).toBe("/agree");
  });

  test("KY-07 同意の画面: チェックしないと記録しない。チェックすると、自分の分だけ記録してトップへ。ほかの人には触れない", async () => {
    const me = await createUser({ username: "me", agreed: false });
    const other = await createUser({ username: "other", agreed: false });
    await loginAs(me);
    expect((await agreeToTerms({}, formData({}))).error).toMatch(/チェック/);
    expect((await agreedRow(me.id)).terms_version).toBeNull();

    expect((await runAction(agreeToTerms({}, formData({ terms: "on" })))).redirectTo).toBe("/");
    expect((await agreedRow(me.id)).terms_version).toBe(TERMS_VERSION);
    expect((await agreedRow(other.id))).toEqual({ terms_version: null, terms_agreed_at: null });
    expect((await runAction(requireUser())).redirectTo).toBeNull();
  });

  test("KY-08 ログインしていなければ、同意の画面・同意の操作はログイン画面へ", async () => {
    expect((await runAction(AgreePage())).redirectTo).toBe("/login");
    expect((await runAction(agreeToTerms({}, formData({ terms: "on" })))).redirectTo).toBe("/login");
  });

  test("KY-09 同意していない人は、勉強時間などを送る API も使えない（403）", async () => {
    await loginAs(await createUser({ username: "old", agreed: false }));
    const req = new Request("http://localhost:3000/api/study-time", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "vocab", seconds: 30 }),
    });
    expect((await postStudyTime(req)).status).toBe(403);
    expect((await pool.query("SELECT count(*)::int AS n FROM study_time")).rows[0].n).toBe(0);
  });

  test("KY-10 管理用の道具で作ったアカウントは、まだ同意していない（最初にログインしたとき、本人に同意してもらう）", async () => {
    const r = await createAccountByAdmin(pool, "tester1", "testpass123");
    expect(await agreedRow(r.id)).toEqual({ terms_version: null, terms_agreed_at: null });
  });
});
