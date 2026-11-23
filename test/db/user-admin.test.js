import { beforeEach, describe, expect, test } from "vitest";
import { pool } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createVerifiedUser, resetUserData, setUserPassword } from "@/lib/userAdmin";
import { createCard, createDeck, createUser, loginAs, resetDb } from "../helpers.js";

// テスト用のアカウントを、メールなしで作る道具（scripts/create-user.mjs、docs/deploy.md）
beforeEach(resetDb);

const userRow = async (email) =>
  (await pool.query("SELECT id, email, password_hash, verified_at FROM users WHERE email = $1", [email])).rows[0];

describe("テスト用のアカウントを作る", () => {
  test("UA-01 確認済みのアカウントを作る。アドレスは小文字に、パスワードはハッシュにして保存する", async () => {
    const r = await createVerifiedUser(pool, " Tester1@Example.com ", "testpass123");
    expect(r).toMatchObject({ created: true, email: "tester1@example.com" });
    const row = await userRow("tester1@example.com");
    expect(row.verified_at).not.toBeNull();
    expect(row.password_hash).not.toContain("testpass123");
    expect(await verifyPassword("testpass123", row.password_hash)).toBe(true);
  });

  test("UA-02 アドレス・パスワードがおかしければ作らない", async () => {
    expect((await createVerifiedUser(pool, "bad", "testpass123")).error).toMatch(/メールアドレス/);
    expect((await createVerifiedUser(pool, "a@example.com", "short")).error).toMatch(/8文字以上/);
    expect((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(0);
  });

  test("UA-03 登録済みのアドレスなら作らず、そう知らせる（パスワードは変えない）", async () => {
    await createUser({ email: "tester1@example.com" });
    const before = await userRow("tester1@example.com");
    const r = await createVerifiedUser(pool, "TESTER1@example.com", "testpass123");
    expect(r).toMatchObject({ created: false, exists: true });
    expect((await userRow("tester1@example.com")).password_hash).toBe(before.password_hash);
  });

  test("UA-04 パスワードを作り直す: 新しいパスワードにし、確認済みにして、その人のログインをすべて切る。ほかの人には触れない", async () => {
    const t = await createUser({ email: "tester1@example.com", verified: false });
    const other = await createUser({ email: "other@example.com" });
    const otherHash = (await userRow("other@example.com")).password_hash;
    await loginAs(t);
    await loginAs(other);

    expect(await setUserPassword(pool, "Tester1@example.com", "newpass456")).toMatchObject({ updated: true });
    const row = await userRow("tester1@example.com");
    expect(await verifyPassword("newpass456", row.password_hash)).toBe(true);
    expect(row.verified_at).not.toBeNull();
    const sessions = (await pool.query("SELECT user_id FROM user_sessions")).rows.map((r) => r.user_id);
    expect(sessions).toEqual([other.id]);
    expect((await userRow("other@example.com")).password_hash).toBe(otherHash);

    expect((await setUserPassword(pool, "nobody@example.com", "newpass456")).error).toMatch(/見つかりません/);
    expect((await setUserPassword(pool, "tester1@example.com", "short")).error).toMatch(/8文字以上/);
  });

  test("UA-05 道具は server-only の部品を使わない（Next.js の外の node で動かすため）", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
    for (const f of ["lib/userAdmin.js", "lib/passwordHash.js", "lib/emailAddress.js"]) {
      expect(read(f)).not.toMatch(/import\s+"server-only"|from\s+"@\//);
    }
    expect(read("scripts/create-user.mjs")).toMatch(/lib\/userAdmin\.js/);
    expect(read("scripts/reset-user.mjs")).toMatch(/lib\/userAdmin\.js/);
  });

  test("UA-06 データを最初の状態に戻す: その人の単語帳・カード・記録・設定・勉強時間を消し、はじめの4ステップをまた出す。アカウントとパスワードは残す。ほかの人には触れない", async () => {
    const t = await createUser({ email: "tester1@example.com" });
    const other = await createUser({ email: "other@example.com" });
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
    const before = await userRow("tester1@example.com");

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

    const r = await resetUserData(pool, "Tester1@example.com");
    expect(r).toMatchObject({ reset: true, deleted: { decks: 1, settings: 1, knownWords: 1, studyTime: 1 } });
    expect(await counts(t.id)).toEqual({ decks: 0, settings: 0, known: 0, time: 0, dismissed: false });
    expect((await pool.query("SELECT count(*)::int AS n FROM cards")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM review_logs")).rows[0].n).toBe(1);
    expect((await userRow("tester1@example.com")).password_hash).toBe(before.password_hash);
    expect(await counts(other.id)).toEqual({ decks: 1, settings: 1, known: 1, time: 1, dismissed: true });

    expect((await resetUserData(pool, "nobody@example.com")).error).toMatch(/見つかりません/);
  });
});
