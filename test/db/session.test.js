import { beforeEach, describe, expect, test } from "vitest";
import {
  createSession, destroyOtherSessions, destroySession, getCurrentUser, hashToken, ownsCard, ownsDeck, requireUser,
} from "@/lib/auth";
import { pool } from "@/lib/db";
import { createCard, createDeck, createUser, loginAs, resetDb } from "../helpers.js";

beforeEach(resetDb);
const sessionCount = async (userId) =>
  (await pool.query("SELECT count(*)::int AS n FROM user_sessions WHERE user_id = $1", [userId])).rows[0].n;

describe("セッション", () => {
  test("SS-01 createSession は Cookie にトークンを入れ、DB にはハッシュだけを保存する", async () => {
    const u = await createUser();
    await createSession(u.id);
    const token = globalThis.testCookies.get("flashcard_session");
    const { rows } = await pool.query("SELECT token_hash, expires_at FROM user_sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(rows[0].token_hash).not.toBe(token);
    const days = (rows[0].expires_at - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(await getCurrentUser()).toEqual({ id: u.id, email: u.email });
  });

  test("SS-02 createSession は期限切れのセッションを片付ける", async () => {
    const u = await createUser();
    await pool.query("INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ('old', $1, now() - interval '1 day')", [u.id]);
    await createSession(u.id);
    expect(await sessionCount(u.id)).toBe(1);
  });

  test("SS-03 Cookie がない・知らないトークン・期限切れ・未確認のユーザーは null", async () => {
    expect(await getCurrentUser()).toBeNull();
    globalThis.testCookies.set("flashcard_session", "unknown");
    expect(await getCurrentUser()).toBeNull();

    const u = await createUser();
    globalThis.testCookies.set("flashcard_session", "expired");
    await pool.query("INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 second')", [hashToken("expired"), u.id]);
    expect(await getCurrentUser()).toBeNull();

    const unverified = await createUser({ email: "new@example.com", verified: false });
    await loginAs(unverified);
    expect(await getCurrentUser()).toBeNull();
  });

  test("SS-04 requireUser はログインしていなければ /login へ", async () => {
    await expect(requireUser()).rejects.toMatchObject({ redirectTo: "/login" });
    const u = await createUser();
    await loginAs(u);
    expect((await requireUser()).id).toBe(u.id);
  });

  test("SS-05 destroySession は DB のセッションと Cookie を消す", async () => {
    const u = await createUser();
    await loginAs(u);
    await destroySession();
    expect(globalThis.testCookies.has("flashcard_session")).toBe(false);
    expect(await sessionCount(u.id)).toBe(0);
  });

  test("SS-06 destroyOtherSessions は今の端末だけ残す", async () => {
    const u = await createUser();
    await loginAs(u);
    await loginAs(u);
    await loginAs(u); // 最後のものが「今の端末」
    expect(await sessionCount(u.id)).toBe(3);
    await destroyOtherSessions(u.id);
    expect(await sessionCount(u.id)).toBe(1);
    expect(await getCurrentUser()).not.toBeNull();
  });
});

describe("持ち主の確認", () => {
  test("SS-07 ownsDeck / ownsCard は自分のものだけ true", async () => {
    const a = await createUser({ email: "a@example.com" });
    const b = await createUser({ email: "b@example.com" });
    const deck = await createDeck(a.id);
    const card = await createCard(deck);
    expect(await ownsDeck(a.id, deck)).toBe(true);
    expect(await ownsDeck(b.id, deck)).toBe(false);
    expect(await ownsCard(a.id, card)).toBe(true);
    expect(await ownsCard(b.id, card)).toBe(false);
    expect(await ownsDeck(a.id, 99999)).toBe(false);
  });
});
