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

// そのユーザーのデータを消して、登録した直後の状態に戻す（テスト用のアカウントを、また最初から試してもらうため）。
// 消すもの: デッキ（カード・記録・タグの対応・場面の絵もいっしょに消える）、レベル設定、「知ってる」の語、勉強時間。
// 「はじめの4ステップ」を閉じた印も消す（また出るように）。アカウント・パスワード・ログインは残す。
// 1つの SQL で行うので、途中で失敗したら何も消えない
export async function resetUserData(db, rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { error: BAD_EMAIL };
  const { rows } = await db.query(
    `WITH u AS (SELECT id FROM users WHERE lower(email) = lower($1)),
          d AS (DELETE FROM decks WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          s AS (DELETE FROM settings WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          k AS (DELETE FROM known_words WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          t AS (DELETE FROM study_time WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          o AS (UPDATE users SET onboarding_dismissed_at = NULL WHERE id IN (SELECT id FROM u) RETURNING id)
     SELECT (SELECT id FROM u) AS id,
            (SELECT count(*) FROM d)::int AS decks,
            (SELECT count(*) FROM s)::int AS settings,
            (SELECT count(*) FROM k)::int AS known_words,
            (SELECT count(*) FROM t)::int AS study_time,
            (SELECT count(*) FROM o)::int AS onboarding`,
    [email]
  );
  const r = rows[0];
  if (!r?.id) return { error: "そのメールアドレスのアカウントが見つかりません" };
  return {
    reset: true,
    id: r.id,
    email,
    deleted: { decks: r.decks, settings: r.settings, knownWords: r.known_words, studyTime: r.study_time },
  };
}
