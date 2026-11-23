// 管理用: メールを使わずに、アカウントを作る・パスワードを作り直す（scripts/create-user.mjs から使う）。
// 公開した DB にテスト用のアカウントを用意するため（docs/deploy.md）。
// Next.js の外の node で動かすので、server-only の部品や "@/" の読み込みは使わない。
// db: pg の Client か Pool（query が使えるもの）
import { normalizeEmail } from "./emailAddress.js";
import { checkPasswordRule, hashPassword } from "./passwordHash.js";

const BAD_EMAIL = "メールアドレスの形が正しくありません";

// 確認済みのアカウントを作る。登録済みのアドレスなら作らない（パスワードも変えない）
export async function createVerifiedUser(db, rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { error: BAD_EMAIL };
  const rule = checkPasswordRule(String(password ?? ""));
  if (rule) return { error: rule };
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, verified_at) VALUES ($1, $2, now())
     ON CONFLICT DO NOTHING RETURNING id`,
    [email, await hashPassword(password)]
  );
  if (!rows[0]) return { created: false, exists: true, email };
  return { created: true, id: rows[0].id, email };
}

// パスワードを作り直す。確認済みにして、その人のログインはすべて切る
export async function setUserPassword(db, rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { error: BAD_EMAIL };
  const rule = checkPasswordRule(String(password ?? ""));
  if (rule) return { error: rule };
  const hash = await hashPassword(password);
  const { rows } = await db.query(
    `UPDATE users SET password_hash = $2, verified_at = COALESCE(verified_at, now())
     WHERE lower(email) = lower($1) RETURNING id`,
    [email, hash]
  );
  if (!rows[0]) return { error: "そのメールアドレスのアカウントが見つかりません" };
  await db.query("DELETE FROM user_sessions WHERE user_id = $1", [rows[0].id]);
  return { updated: true, id: rows[0].id, email };
}
