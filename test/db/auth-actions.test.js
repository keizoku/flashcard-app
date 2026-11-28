import { beforeEach, describe, expect, test } from "vitest";
import {
  changePassword,
  login,
  logout,
  recoverPassword,
  regenerateRecoveryCode,
  signup,
} from "@/app/auth/actions";
import { SignupForm } from "@/app/auth/AuthForms";
import SignupPage from "@/app/signup/page";
import { MAX_SIGNUPS_PER_IP } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createDeck, createUser, formData, loginAs, PASSWORD, resetDb, runAction } from "../helpers.js";

// 登録・ログイン・パスワード。メールアドレスは使わず、ID とパスワード。忘れたときは復旧コード
beforeEach(resetDb);

const signupForm = (username, password = "newpassword", password2 = password) =>
  formData({ username, password, password2, terms: "on" });
const from = (ip) => {
  globalThis.testHeaders = { "x-forwarded-for": ip };
};
const userRow = async (username) =>
  (await pool.query("SELECT * FROM users WHERE username = $1", [username])).rows[0] ?? null;

describe("新規登録", () => {
  test("SU-08 ID とパスワードで登録すると、そのままログインし、復旧コードを一度だけ返す。DB にはコードのハッシュだけ", async () => {
    from("198.51.100.1");
    const r = await signup({}, signupForm("Taro_01"));
    expect(r).toMatchObject({ done: true, error: null, username: "taro_01" });
    expect(r.recoveryCode).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    const row = await userRow("taro_01");
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.recovery_code_hash).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(r.recoveryCode.replace(/-/g, ""));
    expect((await getCurrentUser()).username).toBe("taro_01");
    // メールアドレスの列はもうない
    expect(Object.keys(row)).not.toContain("email");
  });

  test("SU-09 入力のチェック: ID の決まり（英小文字・数字・_・-、3〜20文字、guest で始まらない）、パスワード8文字以上、確認用と一致", async () => {
    for (const bad of ["ab", "a".repeat(21), "taro@example.com", "たろう", "-taro", "guest01", "Guest-x"]) {
      expect((await signup({}, signupForm(bad))).error).toMatch(/ID は|guest/);
    }
    expect((await signup({}, signupForm("taro", "short"))).error).toMatch(/8文字以上/);
    expect((await signup({}, signupForm("taro", "newpassword", "other-pass"))).error).toMatch(/一致しません/);
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(0);
    expect(await getCurrentUser()).toBeNull();
  });

  test("SU-10 使われている ID（大文字・小文字の違いだけでも）では登録できない。前の人のパスワードは変わらない", async () => {
    await createUser({ username: "taken" });
    const before = (await userRow("taken")).password_hash;
    const r = await signup({}, signupForm("TAKEN"));
    expect(r.error).toMatch(/ほかの人が使っています/);
    expect((await userRow("taken")).password_hash).toBe(before);
    expect(await getCurrentUser()).toBeNull();
  });

  test("SU-11 同じ接続元から1日に登録できるのは決まった回数まで。ほかの接続元からは登録できる。接続元はハッシュで保存する", async () => {
    from("198.51.100.2");
    for (let i = 0; i < MAX_SIGNUPS_PER_IP; i++) {
      globalThis.testCookies.clear();
      expect((await signup({}, signupForm(`user${i}x`))).done).toBe(true);
    }
    globalThis.testCookies.clear();
    expect((await signup({}, signupForm("onemore"))).error).toMatch(/1日に/);
    expect(await userRow("onemore")).toBeNull();
    from("198.51.100.3");
    expect((await signup({}, signupForm("onemore"))).done).toBe(true);
    const { rows } = await pool.query("SELECT ip_hash FROM signup_starts");
    expect(JSON.stringify(rows)).not.toContain("198.51.100");
  });

  test("SU-14 手元の開発サーバー（next dev）では、登録の回数の制限をかけない。本番ではかける", async () => {
    from("198.51.100.30");
    const saved = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";
      for (let i = 0; i < MAX_SIGNUPS_PER_IP + 1; i++) {
        globalThis.testCookies.clear();
        expect((await signup({}, signupForm(`dev${i}x`))).done).toBe(true);
      }
      process.env.NODE_ENV = "production";
      from("198.51.100.31");
      for (let i = 0; i < MAX_SIGNUPS_PER_IP; i++) {
        globalThis.testCookies.clear();
        expect((await signup({}, signupForm(`prod${i}x`))).done).toBe(true);
      }
      globalThis.testCookies.clear();
      expect((await signup({}, signupForm("prodmore"))).error).toMatch(/1日に/);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  test("SU-12 最初に登録した人が、ユーザー管理を入れる前のデータ（持ち主のない単語帳など）を引き継ぐ。2人目からは引き継がない", async () => {
    from("198.51.100.4");
    const legacyDeck = await createDeck(null, { name: "old" });
    await pool.query("INSERT INTO settings (user_id, level_key, vocab_size) VALUES (NULL, 'eiken-1', 12000)");
    await pool.query("INSERT INTO known_words (user_id, word) VALUES (NULL, 'cat')");
    await signup({}, signupForm("first"));
    const first = await userRow("first");
    expect((await pool.query("SELECT user_id FROM decks WHERE id = $1", [legacyDeck])).rows[0].user_id).toBe(first.id);
    expect((await pool.query("SELECT user_id FROM settings")).rows).toEqual([{ user_id: first.id }]);
    expect((await pool.query("SELECT user_id FROM known_words")).rows).toEqual([{ user_id: first.id }]);

    const later = await createDeck(null, { name: "later" });
    globalThis.testCookies.clear();
    await signup({}, signupForm("second"));
    expect((await pool.query("SELECT user_id FROM decks WHERE id = $1", [later])).rows[0].user_id).toBeNull();
  });
});

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

describe("新規登録の画面", () => {
  test("SU-13 ログイン中に開いても、トップへ移さない（登録した直後に画面が変わって、復旧コードが見えなくならないように）", async () => {
    expect(propsOf(await SignupPage(), SignupForm)).toEqual({ loggedIn: false });
    await loginAs(await createUser({ username: "me" }));
    const { result, redirectTo } = await runAction(SignupPage());
    expect(redirectTo).toBeNull();
    expect(propsOf(result, SignupForm)).toEqual({ loggedIn: true });
  });
});

describe("ログイン・ログアウト", () => {
  test("LI-01 正しいパスワードでログインし、next の画面へ戻る（ID の大文字・小文字と前後の空白は気にしない）", async () => {
    const u = await createUser({ username: "me" });
    const { redirectTo } = await runAction(login({}, formData({ username: " ME ", password: PASSWORD, next: "/stats" })));
    expect(redirectTo).toBe("/stats");
    expect((await getCurrentUser()).id).toBe(u.id);
  });

  test("LI-02 next はアプリの中のパスだけ（外部サイトへは飛ばさない）", async () => {
    await createUser({ username: "me" });
    for (const next of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com"]) {
      globalThis.testCookies.clear();
      const { redirectTo } = await runAction(login({}, formData({ username: "me", password: PASSWORD, next })));
      expect(redirectTo).toBe("/");
    }
  });

  test("LI-03 パスワード違い・登録のない ID は、同じメッセージ", async () => {
    await createUser({ username: "me" });
    const wrong = await login({}, formData({ username: "me", password: "wrongpassword" }));
    const none = await login({}, formData({ username: "nobody", password: "wrongpassword" }));
    expect(wrong.error).toBe(none.error);
    expect(wrong.error).toBe("ID かパスワードが違います");
    expect(await getCurrentUser()).toBeNull();
  });

  test("LI-06 前からのアカウント（メールアドレスがそのまま ID）は、メールアドレスとパスワードでログインできる。そのような ID では新しく登録できない", async () => {
    const u = await createUser({ username: "test.test@test.com" });
    const { redirectTo } = await runAction(login({}, formData({ username: " Test.Test@test.com ", password: PASSWORD })));
    expect(redirectTo).toBe("/");
    expect((await getCurrentUser()).id).toBe(u.id);
    globalThis.testCookies.clear();
    expect((await signup({}, signupForm("someone@test.com"))).error).toMatch(/ID は/);
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

describe("パスワードを忘れたとき（復旧コード）", () => {
  async function registered(username = "taro") {
    from("198.51.100.9");
    const r = await signup({}, signupForm(username));
    globalThis.testCookies.clear();
    return r.recoveryCode;
  }
  const recoverForm = (username, code, password = "brandnew99", password2 = password) =>
    formData({ username, code, password, password2 });

  test("PW-15 ID と復旧コードが合えば、新しいパスワードにし、ほかの端末をログアウトさせてログインする。新しい復旧コードを返す", async () => {
    const code = await registered();
    const u = await userRow("taro");
    await loginAs(u); // 別の端末
    globalThis.testCookies.clear();
    // 小文字・「-」なしで入れてもよい
    const r = await recoverPassword({}, recoverForm("Taro", code.toLowerCase().replace(/-/g, " ")));
    expect(r).toMatchObject({ done: true, error: null, username: "taro" });
    expect(r.recoveryCode).not.toBe(code);
    expect((await pool.query("SELECT count(*)::int AS n FROM user_sessions")).rows[0].n).toBe(1);
    expect((await getCurrentUser()).id).toBe(u.id);
    // 新しいパスワードでログインできる
    globalThis.testCookies.clear();
    expect((await runAction(login({}, formData({ username: "taro", password: "brandnew99" })))).redirectTo).toBe("/");
  });

  test("PW-16 使った復旧コードは2回使えない（新しいコードなら使える）", async () => {
    const code = await registered();
    const r1 = await recoverPassword({}, recoverForm("taro", code));
    globalThis.testCookies.clear();
    expect((await recoverPassword({}, recoverForm("taro", code))).error).toBe("ID か復旧コードが違います");
    expect((await recoverPassword({}, recoverForm("taro", r1.recoveryCode))).done).toBe(true);
  });

  test("PW-20 同じ復旧コードで同時に2回送られても、通るのは1回だけ", async () => {
    const code = await registered();
    const results = await Promise.all([
      recoverPassword({}, recoverForm("taro", code, "parallel-a1")),
      recoverPassword({}, recoverForm("taro", code, "parallel-b2")),
    ]);
    expect(results.filter((r) => r.done)).toHaveLength(1);
    expect(results.filter((r) => r.error === "ID か復旧コードが違います")).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM user_sessions")).rows[0].n).toBe(1);
  });

  test("PW-17 コード違い・登録のない ID・ほかの人のコード・コードを持っていない人は、同じメッセージで、何も変えない", async () => {
    const mine = await registered("taro");
    const theirs = await registered("hanako");
    const before = (await userRow("taro")).password_hash;
    for (const [u, c] of [["taro", "AAAA-BBBB-CCCC-DDDD"], ["nobody", mine], ["taro", theirs]]) {
      expect((await recoverPassword({}, recoverForm(u, c))).error).toBe("ID か復旧コードが違います");
    }
    expect((await userRow("taro")).password_hash).toBe(before);
    expect(await getCurrentUser()).toBeNull();
    // 復旧コードを持っていない人（今までのアカウント）
    await createUser({ username: "old" });
    expect((await recoverPassword({}, recoverForm("old", ""))).error).toMatch(/入力してください/);
    expect((await recoverPassword({}, recoverForm("old", mine))).error).toBe("ID か復旧コードが違います");
  });

  test("PW-18 新しいパスワードが決まりに合わない・確認用と違うときは、何も変えない（コードもまだ使える）", async () => {
    const code = await registered();
    expect((await recoverPassword({}, recoverForm("taro", code, "short"))).error).toMatch(/8文字以上/);
    expect((await recoverPassword({}, recoverForm("taro", code, "brandnew99", "other-pass"))).error).toMatch(/一致しません/);
    expect((await recoverPassword({}, recoverForm("taro", code))).done).toBe(true);
  });
});

describe("パスワードの変更・復旧コードの作り直し", () => {
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
    const again = await runAction(login({}, formData({ username: u.username, password: PASSWORD })));
    expect(again.redirectTo).toBe("/");
  });

  test("PW-07 ログインしていなければ /login へ（パスワードの変更・復旧コードの作り直し）", async () => {
    const { redirectTo } = await runAction(changePassword({}, formData({ current: "x", password: "y", password2: "y" })));
    expect(redirectTo).toBe("/login");
    expect((await runAction(regenerateRecoveryCode({}, formData({ current: "x" })))).redirectTo).toBe("/login");
  });

  test("PW-19 復旧コードの作り直し: 今のパスワードが正しければ新しいコードを返し、前のコードは使えなくなる。違えば作らない。ほかの人のコードは変えない", async () => {
    from("198.51.100.20");
    const old = (await signup({}, signupForm("taro"))).recoveryCode;
    globalThis.testCookies.clear();
    await signup({}, signupForm("hanako"));
    const theirHash = (await userRow("hanako")).recovery_code_hash;
    globalThis.testCookies.clear();
    await loginAs(await userRow("taro"));
    expect((await regenerateRecoveryCode({}, formData({ current: "wrongpassword" }))).error).toBe("今のパスワードが違います");
    const r = await regenerateRecoveryCode({}, formData({ current: "newpassword" }));
    expect(r.recoveryCode).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    expect(r.recoveryCode).not.toBe(old);
    expect((await userRow("hanako")).recovery_code_hash).toBe(theirHash);
    globalThis.testCookies.clear();
    const form = (code) => formData({ username: "taro", code, password: "brandnew99", password2: "brandnew99" });
    expect((await recoverPassword({}, form(old))).error).toBe("ID か復旧コードが違います");
    expect((await recoverPassword({}, form(r.recoveryCode))).done).toBe(true);
  });
});
