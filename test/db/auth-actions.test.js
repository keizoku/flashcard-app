import { beforeEach, describe, expect, test } from "vitest";
import { changePassword, login, logout, requestReset, resendVerify, resetPassword, signup } from "@/app/auth/actions";
import { GET as verifyRoute } from "@/app/verify/route";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createUser, formData, linkIn, loginAs, PASSWORD, resetDb, runAction } from "../helpers.js";

beforeEach(resetDb);

const mails = () => globalThis.sentMails;
const tokenOf = (mail) => new URL(linkIn(mail)).searchParams.get("token");
const verify = (token) => verifyRoute({ nextUrl: new URL(`http://localhost:3000/verify?token=${token}`) });
const signupForm = (email, password = "newpassword", password2 = password) => formData({ email, password, password2 });

describe("新規登録 → 確認メール → 登録完了", () => {
  test("SU-01 登録すると未確認のユーザーができ、確認メールが届く。リンクを開くとログインする", async () => {
    const r = await signup({}, signupForm("New@Example.com"));
    expect(r).toMatchObject({ sent: true, email: "new@example.com", error: null });
    const user = (await pool.query("SELECT id, verified_at FROM users")).rows[0];
    expect(user.verified_at).toBeNull();
    expect(mails()).toHaveLength(1);

    const res = await verify(tokenOf(mails()[0]));
    expect(res.headers.get("location")).toBe("http://localhost:3000/?notice=welcome");
    expect((await getCurrentUser()).id).toBe(user.id);
  });

  test("SU-02 使用済み・でたらめのリンクは再送の画面へ", async () => {
    const res = await verify("bogus");
    expect(res.headers.get("location")).toBe("http://localhost:3000/resend?expired=1");
    expect(await getCurrentUser()).toBeNull();
  });

  test("SU-03 入力のチェック", async () => {
    expect((await signup({}, signupForm("bad"))).error).toMatch(/メールアドレス/);
    expect((await signup({}, signupForm("a@example.com", "short"))).error).toMatch(/8文字以上/);
    expect((await signup({}, signupForm("a@example.com", "password1", "password2"))).error).toMatch(/一致しません/);
    expect(mails()).toHaveLength(0);
  });

  test("SU-04 登録済みのアドレスでも同じ表示。本人には「登録済み」のメールだけ届き、パスワードは変わらない", async () => {
    const u = await createUser({ email: "taken@example.com" });
    const before = (await pool.query("SELECT password_hash FROM users WHERE id = $1", [u.id])).rows[0];
    const r = await signup({}, signupForm("taken@example.com"));
    expect(r).toMatchObject({ sent: true });
    expect(mails()[0].subject).toMatch(/登録済み/);
    const after = (await pool.query("SELECT password_hash FROM users WHERE id = $1", [u.id])).rows[0];
    expect(after).toEqual(before);
  });

  test("SU-05 未確認のアドレスで登録し直すと、新しいパスワードになり確認メールを送り直す（60秒以内は送らない）", async () => {
    await signup({}, signupForm("again@example.com", "firstpassword"));
    expect(mails()).toHaveLength(1);
    await signup({}, signupForm("again@example.com", "secondpassword"));
    expect(mails()).toHaveLength(1); // 続けては送らない
    await pool.query("UPDATE email_tokens SET created_at = now() - interval '2 minutes'");
    await signup({}, signupForm("again@example.com", "thirdpassword"));
    expect(mails()).toHaveLength(2);
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(1);

    await verify(tokenOf(mails()[1]));
    globalThis.testCookies.clear();
    const { redirectTo } = await runAction(login({}, formData({ email: "again@example.com", password: "thirdpassword" })));
    expect(redirectTo).toBe("/");
  });
});

describe("ログイン・ログアウト", () => {
  test("LI-01 正しいパスワードでログインし、next の画面へ戻る", async () => {
    const u = await createUser({ email: "me@example.com" });
    const { redirectTo } = await runAction(login({}, formData({ email: "ME@example.com", password: PASSWORD, next: "/stats" })));
    expect(redirectTo).toBe("/stats");
    expect((await getCurrentUser()).id).toBe(u.id);
  });

  test("LI-02 next はアプリの中のパスだけ（外部サイトへは飛ばさない）", async () => {
    await createUser({ email: "me@example.com" });
    for (const next of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com"]) {
      globalThis.testCookies.clear();
      const { redirectTo } = await runAction(login({}, formData({ email: "me@example.com", password: PASSWORD, next })));
      expect(redirectTo).toBe("/");
    }
  });

  test("LI-03 パスワード違い・登録のないアドレスは、同じメッセージ", async () => {
    await createUser({ email: "me@example.com" });
    const wrong = await login({}, formData({ email: "me@example.com", password: "wrongpassword" }));
    const none = await login({}, formData({ email: "none@example.com", password: "wrongpassword" }));
    expect(wrong.error).toBe(none.error);
    expect(await getCurrentUser()).toBeNull();
  });

  test("LI-04 登録が完了していなければログインできない", async () => {
    await createUser({ email: "new@example.com", verified: false });
    const r = await login({}, formData({ email: "new@example.com", password: PASSWORD }));
    expect(r).toMatchObject({ unverified: true });
    expect(globalThis.testCookies.size).toBe(0);
  });

  test("LI-05 ログアウトするとセッションが消え、ログイン画面へ", async () => {
    const u = await createUser();
    await loginAs(u);
    const { redirectTo } = await runAction(logout());
    expect(redirectTo).toBe("/login");
    expect(await getCurrentUser()).toBeNull();
    expect((await pool.query("SELECT 1 FROM user_sessions")).rowCount).toBe(0);
  });
});

describe("確認メールの再送", () => {
  test("SU-06 未確認のユーザーにだけ送る。どの場合も同じ表示", async () => {
    await createUser({ email: "done@example.com" });
    await createUser({ email: "new@example.com", verified: false });
    for (const email of ["done@example.com", "new@example.com", "none@example.com"]) {
      expect(await resendVerify({}, formData({ email }))).toMatchObject({ sent: true });
    }
    expect(mails().map((m) => m.to)).toEqual(["new@example.com"]);
  });

  test("SU-07 60秒以内にもう一度頼んでも、送らない", async () => {
    await createUser({ email: "new@example.com", verified: false });
    await resendVerify({}, formData({ email: "new@example.com" }));
    expect(await resendVerify({}, formData({ email: "new@example.com" }))).toMatchObject({ sent: true });
    expect(mails()).toHaveLength(1);
  });
});

describe("パスワードの再設定", () => {
  test("PW-01 メールのリンクから新しいパスワードを設定し、ほかの端末をログアウトさせて、ログインする", async () => {
    const u = await createUser({ email: "me@example.com" });
    await loginAs(u); // 別の端末のセッション
    globalThis.testCookies.clear();

    expect(await requestReset({}, formData({ email: "me@example.com" }))).toMatchObject({ sent: true });
    const token = tokenOf(mails()[0]);
    const { redirectTo } = await runAction(
      resetPassword(token, {}, formData({ password: "brandnewpass", password2: "brandnewpass" }))
    );
    expect(redirectTo).toBe("/?notice=password-reset");
    expect((await pool.query("SELECT count(*)::int AS n FROM user_sessions")).rows[0].n).toBe(1);
    expect((await getCurrentUser()).id).toBe(u.id);

    globalThis.testCookies.clear();
    const again = await runAction(login({}, formData({ email: "me@example.com", password: "brandnewpass" })));
    expect(again.redirectTo).toBe("/");
  });

  test("PW-02 リンクは1回しか使えない", async () => {
    await createUser({ email: "me@example.com" });
    await requestReset({}, formData({ email: "me@example.com" }));
    const token = tokenOf(mails()[0]);
    const fd = () => formData({ password: "brandnewpass", password2: "brandnewpass" });
    await runAction(resetPassword(token, {}, fd()));
    expect(await resetPassword(token, {}, fd())).toMatchObject({ expired: true });
  });

  test("PW-03 未確認のユーザーも、再設定のリンクを開ければ登録完了になる", async () => {
    const u = await createUser({ email: "new@example.com", verified: false });
    await requestReset({}, formData({ email: "new@example.com" }));
    await runAction(resetPassword(tokenOf(mails()[0]), {}, formData({ password: "brandnewpass", password2: "brandnewpass" })));
    expect((await pool.query("SELECT verified_at FROM users WHERE id = $1", [u.id])).rows[0].verified_at).not.toBeNull();
  });

  test("PW-04 登録のないアドレスにはメールを送らない（表示は同じ）", async () => {
    expect(await requestReset({}, formData({ email: "none@example.com" }))).toMatchObject({ sent: true });
    expect(mails()).toHaveLength(0);
  });

  test("PW-12 60秒以内にもう一度頼んでも、送らない", async () => {
    await createUser({ email: "me@example.com" });
    await requestReset({}, formData({ email: "me@example.com" }));
    expect(await requestReset({}, formData({ email: "me@example.com" }))).toMatchObject({ sent: true });
    expect(mails()).toHaveLength(1);
  });

  test("PW-13 新しいパスワードが確認用と違えば、再設定しない（リンクはまだ使える）", async () => {
    await createUser({ email: "me@example.com" });
    await requestReset({}, formData({ email: "me@example.com" }));
    const token = tokenOf(mails()[0]);
    const r = await resetPassword(token, {}, formData({ password: "brandnewpass", password2: "different1" }));
    expect(r.error).toMatch(/一致しません/);
    const { redirectTo } = await runAction(
      resetPassword(token, {}, formData({ password: "brandnewpass", password2: "brandnewpass" }))
    );
    expect(redirectTo).toBe("/?notice=password-reset");
  });
});

describe("パスワードの変更", () => {
  test("PW-05 今のパスワードが正しければ変更し、ほかの端末だけログアウトさせる", async () => {
    const u = await createUser();
    await loginAs(u); // 別の端末
    await loginAs(u); // この端末
    const r = await changePassword({}, formData({ current: PASSWORD, password: "changedpass1", password2: "changedpass1" }));
    expect(r).toMatchObject({ saved: true, error: null });
    expect((await pool.query("SELECT count(*)::int AS n FROM user_sessions")).rows[0].n).toBe(1);
    expect(await getCurrentUser()).not.toBeNull();
  });

  test("PW-06 今のパスワードが違えば変更しない", async () => {
    const u = await createUser();
    await loginAs(u);
    const r = await changePassword({}, formData({ current: "wrongpassword", password: "changedpass1", password2: "changedpass1" }));
    expect(r).toMatchObject({ saved: false, error: "今のパスワードが違います" });
  });

  test("PW-14 新しいパスワードが確認用と違えば、変更しない", async () => {
    const u = await createUser();
    await loginAs(u);
    const r = await changePassword({}, formData({ current: PASSWORD, password: "changedpass1", password2: "changedpass2" }));
    expect(r).toMatchObject({ saved: false, error: expect.stringMatching(/一致しません/) });
    // 今までのパスワードでログインできる（変わっていない）
    globalThis.testCookies.clear();
    const again = await runAction(login({}, formData({ email: u.email, password: PASSWORD })));
    expect(again.redirectTo).toBe("/");
  });

  test("PW-07 ログインしていなければ /login へ", async () => {
    const { redirectTo } = await runAction(changePassword({}, formData({ current: "x", password: "y", password2: "y" })));
    expect(redirectTo).toBe("/login");
  });
});
