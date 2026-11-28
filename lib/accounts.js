import "server-only";
import { pool } from "./db.js";
import { clientIp, hashIp } from "./guest.js";
import { hashPassword } from "./password.js";
import { hashRecoveryCode, newRecoveryCode } from "./recovery.js";
import { normalizeUsername } from "./username.js";

// アカウント（ID とパスワード）。メールアドレスは持たない（docs/auth.md）

export const MAX_SIGNUPS_PER_IP = 5; // 同じ接続元から、1日に登録できる回数
const SIGNUP_HOURS = 24;
// 手元の開発サーバー（next dev）では、登録の回数の制限をかけない（何度も試せるように）
const countSignups = () => process.env.NODE_ENV !== "development";

export async function findUserByUsername(raw) {
  const username = normalizeUsername(raw);
  if (!username) return null;
  const { rows } = await pool.query(
    "SELECT id, username, password_hash, recovery_code_hash, guest_expires_at FROM users WHERE username = $1",
    [username]
  );
  return rows[0] ?? null;
}

// アカウントを作る → { user: { id, username }, recoveryCode } か { error }。
// headers: リクエストのヘッダー（接続元を数えるため）。username は決まりに合っているものを渡す
export async function createAccount({ username, password, headers }) {
  const ipHash = hashIp(clientIp(headers));
  const code = newRecoveryCode();
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 同時に何人もが登録したときに、数え間違えないよう、1人ずつ順番に処理する
    await client.query("SELECT pg_advisory_xact_lock(hashtext('flashcard-signup'))");
    await client.query("DELETE FROM signup_starts WHERE created_at < now() - make_interval(hours => $1)", [SIGNUP_HOURS]);
    if (countSignups()) {
      const { rows } = await client.query(
        "SELECT COUNT(*)::int AS n FROM signup_starts WHERE ip_hash = $1 AND created_at > now() - make_interval(hours => $2)",
        [ipHash, SIGNUP_HOURS]
      );
      if (rows[0].n >= MAX_SIGNUPS_PER_IP) {
        await client.query("ROLLBACK");
        return { error: `同じ場所から登録できるのは、1日に${MAX_SIGNUPS_PER_IP}回までです。時間をおいてお試しください` };
      }
    }
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, recovery_code_hash) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING id, username`,
      [username, passwordHash, hashRecoveryCode(code)]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return { error: "この ID はほかの人が使っています。別の ID にしてください" };
    }
    await client.query("INSERT INTO signup_starts (ip_hash) VALUES ($1)", [ipHash]);
    await claimLegacyData(client, rows[0].id);
    await client.query("COMMIT");
    return { user: rows[0], recoveryCode: code };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ユーザー管理を入れる前のデータ（持ち主のない単語帳など）は、最初に登録したユーザーが引き継ぐ
async function claimLegacyData(client, userId) {
  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE guest_expires_at IS NULL AND id <> $1",
    [userId]
  );
  if (rows[0].n > 0) return;
  await client.query("UPDATE decks SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await client.query("UPDATE settings SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await client.query("UPDATE known_words SET user_id = $1 WHERE user_id IS NULL", [userId]);
}

// 新しい復旧コードを作って保存し、コードを返す（前のコードは使えなくなる）。db: pool か client
export async function renewRecoveryCode(userId, db = pool) {
  const code = newRecoveryCode();
  await db.query("UPDATE users SET recovery_code_hash = $2 WHERE id = $1", [userId, hashRecoveryCode(code)]);
  return code;
}
