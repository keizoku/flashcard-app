import { readFileSync } from "node:fs";
import { afterEach, expect, test } from "vitest";
import { pool } from "@/lib/db";

// 025（メールアドレスから ID へ）が、今までのユーザーをどう変えるか。
// テスト用の DB の中に別の場所（スキーマ）を作り、024 までの形の users に 025 を当てて確かめる
const SQL = readFileSync(new URL("../../db/migrations/025_usernames.sql", import.meta.url), "utf8");
const SCHEMA = "m025_test";

afterEach(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
});

test("MG-01 今までのユーザーは、メールアドレス（小文字）がそのまま ID になる。パスワードはそのまま。おためしユーザーは guest-<番号>。登録を完了していない人は消える", async () => {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${SCHEMA}`);
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
        verified_at TIMESTAMPTZ, guest_expires_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX users_email_idx ON users (lower(email));
      CREATE TABLE email_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id));
      INSERT INTO users (email, password_hash, verified_at, guest_expires_at) VALUES
        ('test.test@test.com', 'h1', now(), NULL),
        (' Taro.Yamada@Example.com', 'h2', now(), NULL),
        ('never@example.com', 'h3', NULL, NULL),
        ('guest-abc@guest.invalid', 'h4', now(), now() + interval '1 day');
    `);
    await client.query(SQL);
    const { rows } = await client.query("SELECT id, username, password_hash, recovery_code_hash FROM users ORDER BY id");
    expect(rows).toEqual([
      { id: 1, username: "test.test@test.com", password_hash: "h1", recovery_code_hash: null },
      { id: 2, username: "taro.yamada@example.com", password_hash: "h2", recovery_code_hash: null },
      { id: 4, username: "guest-4", password_hash: "h4", recovery_code_hash: null },
    ]);
    const cols = (await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'users'",
      [SCHEMA]
    )).rows.map((r) => r.column_name);
    expect(cols).not.toContain("email");
    expect(cols).not.toContain("verified_at");
  } finally {
    await client.query("RESET search_path");
    client.release();
  }
});
