import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { login, requestReset, resendVerify, signup } from "@/app/auth/actions";
import { isAllowedEmail } from "@/lib/allowlist";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createUser, formData, loginAs, PASSWORD, resetDb, runAction } from "../helpers.js";

// 決まった人だけが使える（ALLOWED_EMAILS。docs/auth.md・docs/deploy.md）
beforeEach(async () => {
  await resetDb();
  process.env.ALLOWED_EMAILS = " Me@Example.com , second@example.com ";
});
afterEach(() => {
  delete process.env.ALLOWED_EMAILS;
});

const mails = () => globalThis.sentMails;

describe("使える人を決める（ALLOWED_EMAILS）", () => {
  test("AL-01 カンマ区切りで決める。大文字小文字・空白は気にしない。決めていなければ、だれでも使える", () => {
    expect(isAllowedEmail("me@example.com")).toBe(true);
    expect(isAllowedEmail("SECOND@example.com")).toBe(true);
    expect(isAllowedEmail("other@example.com")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
    process.env.ALLOWED_EMAILS = " , ";
    expect(isAllowedEmail("other@example.com")).toBe(true);
    delete process.env.ALLOWED_EMAILS;
    expect(isAllowedEmail("other@example.com")).toBe(true);
  });

  test("AL-02 決めた人でなければ登録できない。ユーザーは作らず、メールも送らない。決めた人は登録できる", async () => {
    const r = await signup({}, formData({ email: "other@example.com", password: "newpassword", password2: "newpassword" }));
    expect(r.error).toMatch(/決まった人だけ/);
    expect(r.sent).toBeFalsy();
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(0);
    expect(mails()).toHaveLength(0);

    const ok = await signup({}, formData({ email: "me@example.com", password: "newpassword", password2: "newpassword" }));
    expect(ok).toMatchObject({ sent: true, error: null });
    expect(mails()).toHaveLength(1);
  });

  test("AL-03 決めた人でなければ、登録済みでもログインできない（表示はパスワード違いと同じ）", async () => {
    await createUser({ email: "other@example.com" });
    const r = await login({}, formData({ email: "other@example.com", password: PASSWORD }));
    expect(r.error).toBe("メールアドレスかパスワードが違います");
    expect(await getCurrentUser()).toBeNull();

    await createUser({ email: "me@example.com" });
    const ok = await runAction(login({}, formData({ email: "me@example.com", password: PASSWORD })));
  expect(ok.redirectTo).toBe("/");
  });

  test("AL-04 決めた人でなければ、確認メール・再設定のメールを送らない（表示は同じ）", async () => {
    await createUser({ email: "other@example.com", verified: false });
    await createUser({ email: "third@example.com" });
    expect(await resendVerify({}, formData({ email: "other@example.com" }))).toMatchObject({ sent: true, error: null });
    expect(await requestReset({}, formData({ email: "third@example.com" }))).toMatchObject({ sent: true, error: null });
    expect(mails()).toHaveLength(0);
  });

  test("AL-05 決めた人でなくなったら、ログインしていてもログインしていない扱いになる", async () => {
    const other = await createUser({ email: "other@example.com" });
    await loginAs(other);
    expect(await getCurrentUser()).toBeNull();
    delete process.env.ALLOWED_EMAILS;
    expect((await getCurrentUser())?.id).toBe(other.id);
  });
});
