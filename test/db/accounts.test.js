import { beforeEach, describe, expect, test } from "vitest";
import {
  activateUser, consumeEmailToken, findUserByEmail, isValidEmailToken, sendResetMail, sendVerifyMail, sentRecently,
} from "@/lib/accounts";
import { pool } from "@/lib/db";
import { createDeck, createUser, linkIn, resetDb } from "../helpers.js";

beforeEach(resetDb);

const tokenFromMail = (mail) => new URL(linkIn(mail)).searchParams.get("token");

async function inTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

test("AC-01 findUserByEmail は大文字小文字を区別しない", async () => {
  const u = await createUser({ email: "Foo@Example.com" });
  expect((await findUserByEmail("foo@example.COM")).id).toBe(u.id);
  expect(await findUserByEmail("none@example.com")).toBeNull();
});

describe("メールのリンク（合言葉）", () => {
  test("AC-02 確認メールのリンクは /verify?token=…、24時間有効", async () => {
    const u = await createUser({ verified: false });
    expect(await sendVerifyMail(u)).toBe(true);
    const mail = globalThis.sentMails.at(-1);
    expect(mail.to).toBe(u.email);
    expect(linkIn(mail)).toMatch(/^http:\/\/localhost:3000\/verify\?token=/);
    const { rows } = await pool.query("SELECT extract(epoch FROM expires_at - created_at)::int / 3600 AS h FROM email_tokens");
    expect(rows[0].h).toBe(24);
  });

  test("AC-03 再設定のリンクは1時間有効", async () => {
    const u = await createUser();
    await sendResetMail(u);
    expect(linkIn(globalThis.sentMails.at(-1))).toContain("/reset-password?token=");
    const { rows } = await pool.query("SELECT extract(epoch FROM expires_at - created_at)::int / 3600 AS h FROM email_tokens");
    expect(rows[0].h).toBe(1);
  });

  test("AC-04 合言葉は1回しか使えず、種類がちがうと使えない", async () => {
    const u = await createUser({ verified: false });
    await sendVerifyMail(u);
    const token = tokenFromMail(globalThis.sentMails.at(-1));
    expect(await isValidEmailToken(token, "reset")).toBe(false);
    expect(await isValidEmailToken(token, "verify")).toBe(true);
    expect(await consumeEmailToken(pool, token, "reset")).toBeNull();
    expect(await consumeEmailToken(pool, token, "verify")).toBe(u.id);
    expect(await consumeEmailToken(pool, token, "verify")).toBeNull();
  });

  test("AC-05 期限切れの合言葉は使えない（使おうとすると消える）", async () => {
    const u = await createUser({ verified: false });
    await sendVerifyMail(u);
    const token = tokenFromMail(globalThis.sentMails.at(-1));
    await pool.query("UPDATE email_tokens SET expires_at = now() - interval '1 second'");
    expect(await isValidEmailToken(token, "verify")).toBe(false);
    expect(await consumeEmailToken(pool, token, "verify")).toBeNull();
    expect((await pool.query("SELECT 1 FROM email_tokens")).rowCount).toBe(0);
  });

  test("AC-06 新しいリンクを送ると、同じ種類の古いリンクは使えなくなる", async () => {
    const u = await createUser({ verified: false });
    await sendVerifyMail(u);
    const old = tokenFromMail(globalThis.sentMails.at(-1));
    await sendVerifyMail(u);
    expect(await isValidEmailToken(old, "verify")).toBe(false);
    expect(await isValidEmailToken(tokenFromMail(globalThis.sentMails.at(-1)), "verify")).toBe(true);
  });

  test("AC-07 おかしな合言葉は DB を見ずに拒否", async () => {
    expect(await consumeEmailToken(pool, "", "verify")).toBeNull();
    expect(await consumeEmailToken(pool, "x".repeat(201), "verify")).toBeNull();
    expect(await isValidEmailToken(null, "verify")).toBe(false);
  });

  test("AC-08 sentRecently: 60秒以内に同じ種類を送っていれば true", async () => {
    const u = await createUser();
    expect(await sentRecently(u.id, "reset")).toBe(false);
    await sendResetMail(u);
    expect(await sentRecently(u.id, "reset")).toBe(true);
    expect(await sentRecently(u.id, "verify")).toBe(false);
    await pool.query("UPDATE email_tokens SET created_at = now() - interval '61 seconds'");
    expect(await sentRecently(u.id, "reset")).toBe(false);
  });
});

describe("activateUser（登録の完了）", () => {
  test("AC-09 最初に完了したユーザーが、ユーザー管理以前のデータを引き継ぐ", async () => {
    const legacyDeck = await createDeck(null, { name: "old" });
    await pool.query("INSERT INTO settings (user_id, level_key, vocab_size) VALUES (NULL, 'eiken-1', 12000)");
    await pool.query("INSERT INTO known_words (user_id, word) VALUES (NULL, 'cat')");

    const first = await createUser({ email: "first@example.com", verified: false });
    const second = await createUser({ email: "second@example.com", verified: false });
    await inTx((c) => activateUser(c, first.id));
    await inTx((c) => activateUser(c, second.id));

    const deck = await pool.query("SELECT user_id FROM decks WHERE id = $1", [legacyDeck]);
    expect(deck.rows[0].user_id).toBe(first.id);
    expect((await pool.query("SELECT user_id FROM settings")).rows).toEqual([{ user_id: first.id }]);
    expect((await pool.query("SELECT user_id FROM known_words")).rows).toEqual([{ user_id: first.id }]);
    const users = await pool.query("SELECT email FROM users WHERE verified_at IS NOT NULL ORDER BY id");
    expect(users.rows.map((r) => r.email)).toEqual(["first@example.com", "second@example.com"]);
  });

  test("AC-10 すでに有効なユーザーがいれば、引き継がない", async () => {
    await createUser({ email: "existing@example.com" });
    const legacyDeck = await createDeck(null);
    const u = await createUser({ email: "late@example.com", verified: false });
    await inTx((c) => activateUser(c, u.id));
    expect((await pool.query("SELECT user_id FROM decks WHERE id = $1", [legacyDeck])).rows[0].user_id).toBeNull();
  });

  test("AC-11 2回呼んでも完了日時は変わらない", async () => {
    const u = await createUser({ verified: false });
    await inTx((c) => activateUser(c, u.id));
    const t1 = (await pool.query("SELECT verified_at FROM users")).rows[0].verified_at;
    await inTx((c) => activateUser(c, u.id));
    const t2 = (await pool.query("SELECT verified_at FROM users")).rows[0].verified_at;
    expect(t2).toEqual(t1);
  });
});
