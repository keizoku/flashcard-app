import { beforeEach, describe, expect, test } from "vitest";
import { pool } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { hashRecoveryCode } from "@/lib/recovery";
import { createAccountByAdmin, listAccounts, renameUser, resetUserData, setUserPassword } from "@/lib/userAdmin";
import { createCard, createDeck, createUser, loginAs, resetDb } from "../helpers.js";

// 管理用の道具（scripts/create-user.mjs・rename-user.mjs・reset-user.mjs、docs/deploy.md）
beforeEach(resetDb);

const userRow = async (username) =>
  (await pool.query("SELECT id, username, password_hash, recovery_code_hash FROM users WHERE username = $1", [username])).rows[0];

describe("管理用の道具", () => {
  test("UA-01 アカウントを作る。ID は小文字に、パスワードはハッシュにして保存し、復旧コードを返す（DB にはハッシュだけ）", async () => {
    const r = await createAccountByAdmin(pool, " Tester1 ", "testpass123");
    expect(r).toMatchObject({ created: true, username: "tester1" });
    const row = await userRow("tester1");
    expect(row.password_hash).not.toContain("testpass123");
    expect(await verifyPassword("testpass123", row.password_hash)).toBe(true);
    expect(row.recovery_code_hash).toBe(hashRecoveryCode(r.recoveryCode));
  });

  test("UA-02 ID・パスワードが決まりに合わなければ作らない", async () => {
    expect((await createAccountByAdmin(pool, "a@example.com", "testpass123")).error).toMatch(/ID は/);
    expect((await createAccountByAdmin(pool, "guest-1", "testpass123")).error).toMatch(/guest/);
    expect((await createAccountByAdmin(pool, "tester1", "short")).error).toMatch(/8文字以上/);
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(0);
  });

  test("UA-03 使われている ID なら作らず、そう知らせる（パスワードは変えない）", async () => {
    await createUser({ username: "tester1" });
    const before = await userRow("tester1");
    const r = await createAccountByAdmin(pool, "TESTER1", "testpass123");
    expect(r).toMatchObject({ created: false, exists: true });
    expect((await userRow("tester1")).password_hash).toBe(before.password_hash);
  });

  test("UA-04 パスワードを作り直す: 新しいパスワードにし、その人のログインをすべて切る。ほかの人には触れない", async () => {
    const t = await createUser({ username: "tester1" });
    const other = await createUser({ username: "other" });
    const otherHash = (await userRow("other")).password_hash;
    await loginAs(t);
    await loginAs(other);

    expect(await setUserPassword(pool, "Tester1", "newpass456")).toMatchObject({ updated: true });
    expect(await verifyPassword("newpass456", (await userRow("tester1")).password_hash)).toBe(true);
    const sessions = (await pool.query("SELECT user_id FROM user_sessions")).rows.map((r) => r.user_id);
    expect(sessions).toEqual([other.id]);
    expect((await userRow("other")).password_hash).toBe(otherHash);

    expect((await setUserPassword(pool, "nobody", "newpass456")).error).toMatch(/見つかりません/);
    expect((await setUserPassword(pool, "tester1", "short")).error).toMatch(/8文字以上/);
  });

  test("UA-05 道具は server-only の部品を使わない（Next.js の外の node で動かすため）", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
    for (const f of ["lib/userAdmin.js", "lib/passwordHash.js", "lib/username.js", "lib/recovery.js"]) {
      expect(read(f)).not.toMatch(/import\s+"server-only"|from\s+"@\//);
    }
    for (const f of ["create-user", "reset-user", "rename-user"]) {
      expect(read(`scripts/${f}.mjs`)).toMatch(/lib\/userAdmin\.js/);
    }
  });

  test("UA-07 ID を変える: データ・パスワード・ログインはそのまま。使われている ID・決まりに合わない ID・おためしユーザーには変えない。ほかの人には触れない", async () => {
    const t = await createUser({ username: "user1" });
    const other = await createUser({ username: "other" });
    const deck = await createDeck(t.id);
    await loginAs(t);
    const before = await userRow("user1");
    expect(await renameUser(pool, "USER1", "FcAdmin")).toMatchObject({ renamed: true, from: "user1", to: "fcadmin" });
    const after = await userRow("fcadmin");
    expect(after).toMatchObject({ id: t.id, password_hash: before.password_hash });
    expect(await userRow("user1")).toBeUndefined();
    expect((await pool.query("SELECT user_id FROM decks WHERE id = $1", [deck])).rows[0].user_id).toBe(t.id);
    expect((await pool.query("SELECT count(*)::int AS n FROM user_sessions WHERE user_id = $1", [t.id])).rows[0].n).toBe(1);

    expect((await renameUser(pool, "fcadmin", "other")).error).toMatch(/ほかの人/);
    expect((await renameUser(pool, "fcadmin", "a@b")).error).toMatch(/ID は/);
    expect((await renameUser(pool, "nobody", "newname")).error).toMatch(/見つかりません/);
    await pool.query("INSERT INTO users (username, password_hash, guest_expires_at) VALUES ('guest-abc', 'x', now() + interval '1 day')");
    expect((await renameUser(pool, "guest-abc", "newname")).error).toMatch(/見つかりません/);
    expect((await userRow("other")).id).toBe(other.id);
  });

  test("UA-08 アカウントの一覧: おためしでない人の ID・登録日・単語帳とカードの数（ID の順）", async () => {
    const a = await createUser({ username: "alice" });
    await createUser({ username: "bob" });
    await createCard(await createDeck(a.id));
    await pool.query("INSERT INTO users (username, password_hash, guest_expires_at) VALUES ('guest-abc', 'x', now() + interval '1 day')");
    const list = await listAccounts(pool);
    expect(list.map((r) => [r.username, r.decks, r.cards])).toEqual([
      ["alice", 1, 1],
      ["bob", 0, 0],
    ]);
    expect(list[0].created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("UA-06 データを最初の状態に戻す: その人の単語帳・カード・記録・設定・勉強時間を消し、はじめの4ステップをまた出す。アカウントとパスワードは残す。ほかの人には触れない", async () => {
    const t = await createUser({ username: "tester1" });
    const other = await createUser({ username: "other" });
    for (const u of [t, other]) {
      const deck = await createDeck(u.id);
      const card = await createCard(deck);
      await pool.query("INSERT INTO review_logs (card_id, deck_id, remembered) VALUES ($1, $2, true)", [card, deck]);
      await pool.query("INSERT INTO settings (user_id, level_key, vocab_size) VALUES ($1, 'eiken-2', 5000)", [u.id]);
      await pool.query("INSERT INTO known_words (user_id, word) VALUES ($1, 'apple')", [u.id]);
      await pool.query("INSERT INTO study_time (user_id, kind, seconds) VALUES ($1, 'vocab', 60)", [u.id]);
      await pool.query("UPDATE users SET onboarding_dismissed_at = now() WHERE id = $1", [u.id]);
    }
    await loginAs(t);
    const before = await userRow("tester1");

    const counts = async (id) =>
      (
        await pool.query(
          `SELECT (SELECT count(*) FROM decks WHERE user_id = $1)::int AS decks,
                  (SELECT count(*) FROM settings WHERE user_id = $1)::int AS settings,
                  (SELECT count(*) FROM known_words WHERE user_id = $1)::int AS known,
                  (SELECT count(*) FROM study_time WHERE user_id = $1)::int AS time,
                  (SELECT onboarding_dismissed_at IS NOT NULL FROM users WHERE id = $1) AS dismissed`,
          [id]
        )
      ).rows[0];
    expect(await counts(t.id)).toEqual({ decks: 1, settings: 1, known: 1, time: 1, dismissed: true });

    const r = await resetUserData(pool, "Tester1");
    expect(r).toMatchObject({ reset: true, deleted: { decks: 1, settings: 1, knownWords: 1, studyTime: 1 } });
    expect(await counts(t.id)).toEqual({ decks: 0, settings: 0, known: 0, time: 0, dismissed: false });
    expect((await pool.query("SELECT count(*)::int AS n FROM cards")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM review_logs")).rows[0].n).toBe(1);
    expect((await userRow("tester1")).password_hash).toBe(before.password_hash);
    expect(await counts(other.id)).toEqual({ decks: 1, settings: 1, known: 1, time: 1, dismissed: true });

    expect((await resetUserData(pool, "nobody")).error).toMatch(/見つかりません/);
  });
});
