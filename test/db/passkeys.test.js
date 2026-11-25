import { beforeEach, describe, expect, test } from "vitest";
import { pool } from "@/lib/db";
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyLogin,
  finishPasskeyRegistration,
  listPasskeys,
  MAX_PASSKEY_NAME_LENGTH,
} from "@/lib/passkeys";
import { completePasskeyLogin, completePasskeyRegistration, removePasskey, startPasskeyLogin, startPasskeyRegistration } from "@/app/auth/passkeyActions";
import { getCurrentUser } from "@/lib/auth";
import { createFakeAuthenticator } from "../fakeAuthenticator.js";
import { createUser, loginAs, logoutCookie, resetDb, runAction } from "../helpers.js";

// パスキー（端末の指紋・顔・PIN でログインする）。本物の端末の代わりに、偽物の端末（fakeAuthenticator）で確かめる

let me;
let other;
beforeEach(async () => {
  await resetDb();
  delete process.env.ALLOWED_EMAILS;
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
});

// 偽物の端末で、パスキーを登録しておく
async function register(user, name = "iPhone") {
  const device = createFakeAuthenticator();
  const { options, token } = await beginPasskeyRegistration(user);
  const r = await finishPasskeyRegistration(user.id, token, device.register(options), name);
  expect(r.error).toBeUndefined();
  return device;
}

describe("パスキーの登録", () => {
  test("PK-01 登録の options: このアプリのドメイン（APP_URL）で、端末に保存するパスキーを求める。登録ずみの端末は除く", async () => {
    let { options } = await beginPasskeyRegistration(me);
    expect(options.rp).toMatchObject({ id: "localhost", name: "フラッシュカード" });
    expect(options.user.name).toBe("me@example.com");
    expect(options.authenticatorSelection.residentKey).toBe("required");
    expect(options.excludeCredentials).toEqual([]);

    const device = await register(me);
    ({ options } = await beginPasskeyRegistration(me));
    expect(options.excludeCredentials.map((c) => c.id)).toEqual([device.id]);
    // 同じ人なら、何度登録しても端末に渡す利用者の ID は同じ（同じ端末では上書きになる）
    expect(options.user.id).toBe((await beginPasskeyRegistration(me)).options.user.id);
    expect(options.user.id).not.toBe((await beginPasskeyRegistration(other)).options.user.id);
  });

  test("PK-02 端末の答えを確かめて保存する。名前は前後の空白を除いて30文字まで、空なら「パスキー」", async () => {
    await register(me, "  iPhone  ");
    await register(me, "");
    await register(me, "a".repeat(MAX_PASSKEY_NAME_LENGTH + 5));
    const list = await listPasskeys(me.id);
    expect(list.map((p) => p.name).sort()).toEqual(["a".repeat(MAX_PASSKEY_NAME_LENGTH), "iPhone", "パスキー"].sort());
    expect(list[0]).toHaveProperty("createdAt");
    expect(list[0].lastUsedAt).toBeNull();
    // 公開鍵だけを保存する
    const { rows } = await pool.query("SELECT public_key, counter FROM passkeys WHERE user_id = $1", [me.id]);
    expect(rows).toHaveLength(3);
    expect(rows[0].public_key.length).toBeGreaterThan(60);
  });

  test("PK-03 合言葉（challenge）が違う・使いずみ・期限切れ・他人のもの、ほかのサイトの答えは、保存しない", async () => {
    const device = createFakeAuthenticator();
    const { options, token } = await beginPasskeyRegistration(me);

    // 合言葉を書きかえた答え
    const forged = device.register({ ...options, challenge: "AAAA" });
    expect((await finishPasskeyRegistration(me.id, token, forged, "x")).error).toBeTruthy();
    // 1回失敗したら、その合言葉はもう使えない
    expect((await finishPasskeyRegistration(me.id, token, device.register(options), "x")).error).toBeTruthy();

    // ほかのサイト（origin）の答え
    let b = await beginPasskeyRegistration(me);
    const fromOtherSite = device.register(b.options, { origin: "https://evil.example.com" });
    expect((await finishPasskeyRegistration(me.id, b.token, fromOtherSite, "x")).error).toBeTruthy();

    // 期限切れ（5分を過ぎた）
    b = await beginPasskeyRegistration(me);
    await pool.query("UPDATE passkey_challenges SET expires_at = now() - interval '1 second'");
    expect((await finishPasskeyRegistration(me.id, b.token, device.register(b.options), "x")).error).toBeTruthy();

    // 他人が始めた登録の合言葉で、自分のパスキーにはできない
    b = await beginPasskeyRegistration(other);
    expect((await finishPasskeyRegistration(me.id, b.token, device.register(b.options), "x")).error).toBeTruthy();

    // ログイン用の合言葉は、登録には使えない
    b = await beginPasskeyLogin();
    expect((await finishPasskeyRegistration(me.id, b.token, device.register(b.options), "x")).error).toBeTruthy();

    expect(await listPasskeys(me.id)).toEqual([]);
    expect(await listPasskeys(other.id)).toEqual([]);
  });
});

test("PK-10 Vercel で APP_URL を入れ忘れても、パスキーのドメインは localhost ではなく、公開している URL のドメインになる", async () => {
  const saved = process.env.APP_URL;
  try {
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "flashcard-app-xxxx.vercel.app";
    expect((await beginPasskeyRegistration(me)).options.rp.id).toBe("flashcard-app-xxxx.vercel.app");
    expect((await beginPasskeyLogin()).options.rpId).toBe("flashcard-app-xxxx.vercel.app");
  } finally {
    process.env.APP_URL = saved;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  }
});

describe("パスキーでログイン", () => {
  test("PK-04 登録した端末でログインできる。使った日時と回数を記録する。同じ合言葉は2回使えない", async () => {
    const device = await register(me);
    const { options, token } = await beginPasskeyLogin();
    expect(options.rpId).toBe("localhost");
    expect(options.allowCredentials ?? []).toEqual([]); // メールアドレスを入れずに、端末に選んでもらう

    const answer = device.login(options);
    expect(await finishPasskeyLogin(token, answer)).toEqual({ userId: me.id });
    const [p] = await listPasskeys(me.id);
    expect(p.lastUsedAt).not.toBeNull();
    const { rows } = await pool.query("SELECT counter FROM passkeys WHERE id = $1", [device.id]);
    expect(Number(rows[0].counter)).toBe(1);

    // 同じ答えをもう一度送っても（盗み見て使い回す）、ログインできない
    expect((await finishPasskeyLogin(token, answer)).error).toBeTruthy();
  });

  test("PK-05 登録していない端末・ほかのサイトの答え・合言葉の違い・回数が戻った端末（複製の疑い）では、ログインできない", async () => {
    const device = await register(me);
    const stranger = createFakeAuthenticator();
    let b = await beginPasskeyLogin();
    expect(await finishPasskeyLogin(b.token, stranger.login(b.options))).toEqual({ error: "パスキーでログインできませんでした" });

    b = await beginPasskeyLogin();
    expect((await finishPasskeyLogin(b.token, device.login(b.options, { origin: "https://evil.example.com" }))).error).toBeTruthy();

    b = await beginPasskeyLogin();
    expect((await finishPasskeyLogin(b.token, device.login({ ...b.options, challenge: "AAAA" }))).error).toBeTruthy();

    // 一度 5 回まで進んだのに、次に 2 回と言ってきた（同じ鍵の複製）
    b = await beginPasskeyLogin();
    expect(await finishPasskeyLogin(b.token, device.login(b.options, { counter: 5 }))).toEqual({ userId: me.id });
    b = await beginPasskeyLogin();
    expect((await finishPasskeyLogin(b.token, device.login(b.options, { counter: 2 }))).error).toBeTruthy();

    // 登録の合言葉は、ログインには使えない
    b = await beginPasskeyRegistration(me);
    expect((await finishPasskeyLogin(b.token, device.login(b.options))).error).toBeTruthy();
  });

  test("PK-06 使える人を決めていて、その人でなくなった・登録が完了していないユーザーは、パスキーがあってもログインできない", async () => {
    const device = await register(me);
    process.env.ALLOWED_EMAILS = "other@example.com";
    let b = await beginPasskeyLogin();
    expect((await finishPasskeyLogin(b.token, device.login(b.options))).error).toBeTruthy();

    delete process.env.ALLOWED_EMAILS;
    await pool.query("UPDATE users SET verified_at = NULL WHERE id = $1", [me.id]);
    b = await beginPasskeyLogin();
    expect((await finishPasskeyLogin(b.token, device.login(b.options))).error).toBeTruthy();
  });
});

describe("パスキーの一覧・削除", () => {
  test("PK-07 一覧は自分のものだけ。消せるのも自分のものだけ。ユーザーを消すとパスキーも消える", async () => {
    const mine = await register(me, "iPhone");
    const theirs = await register(other, "他人の iPad");
    expect((await listPasskeys(me.id)).map((p) => p.name)).toEqual(["iPhone"]);

    expect(await deletePasskey(me.id, theirs.id)).toEqual({ deleted: false });
    expect((await listPasskeys(other.id)).map((p) => p.name)).toEqual(["他人の iPad"]);
    expect(await deletePasskey(me.id, mine.id)).toEqual({ deleted: true });
    expect(await listPasskeys(me.id)).toEqual([]);

    // 消したパスキーでは、もうログインできない
    const b = await beginPasskeyLogin();
    expect((await finishPasskeyLogin(b.token, mine.login(b.options))).error).toBeTruthy();

    await pool.query("DELETE FROM users WHERE id = $1", [other.id]);
    const { rowCount } = await pool.query("SELECT 1 FROM passkeys");
    expect(rowCount).toBe(0);
  });
});

describe("画面からの操作（Server Action）", () => {
  test("PK-08 ログイン中の人が登録し、ログアウトしたあとパスキーでログインすると、セッションができて元の画面に戻る", async () => {
    const device = createFakeAuthenticator();
    await loginAs(me);
    const reg = await startPasskeyRegistration();
    expect((await completePasskeyRegistration(device.register(reg), "Mac")).error).toBeUndefined();
    expect((await listPasskeys(me.id)).map((p) => p.name)).toEqual(["Mac"]);

    logoutCookie();
    expect(await getCurrentUser()).toBeNull();
    const opts = await startPasskeyLogin();
    const { redirectTo } = await runAction(completePasskeyLogin(device.login(opts), "/stats"));
    expect(redirectTo).toBe("/stats");
    expect((await getCurrentUser())?.id).toBe(me.id);
  });

  test("PK-09 ログインしていないと登録・削除できない。戻り先はこのアプリの中だけ。他人のパスキーは消せない", async () => {
    const device = createFakeAuthenticator();
    expect((await runAction(startPasskeyRegistration())).redirectTo).toBe("/login");

    await loginAs(me);
    const reg = await startPasskeyRegistration();
    await completePasskeyRegistration(device.register(reg), "Mac");
    logoutCookie();
    const opts = await startPasskeyLogin();
    expect((await runAction(completePasskeyLogin(device.login(opts), "https://evil.example.com"))).redirectTo).toBe("/");

    const theirs = await register(other, "他人の iPad");
    await loginAs(me);
    expect(await removePasskey(theirs.id)).toEqual({ error: "パスキーが見つかりません" });
    expect((await listPasskeys(other.id)).length).toBe(1);
    expect(await removePasskey(device.id)).toEqual({ error: null });
    expect(await listPasskeys(me.id)).toEqual([]);
  });
});
