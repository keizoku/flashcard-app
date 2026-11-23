import "server-only";
import { hashToken, newToken } from "./auth.js";
import { pool } from "./db.js";
import { appUrl, sendMail } from "./mail.js";
import { normalizeEmail } from "./emailAddress.js";

// 登録の確認・パスワードの再設定に使う、メールのリンク

const TOKEN_HOURS = { verify: 24, reset: 1 };
// 同じ人に続けてメールを送らない間隔（秒）
export const RESEND_INTERVAL_SECONDS = 60;

// メールアドレスの形を整える部分は emailAddress.js（Next.js の外の道具からも使うため、分けてある）
export { normalizeEmail } from "./emailAddress.js";

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    "SELECT id, email, password_hash, verified_at FROM users WHERE lower(email) = lower($1)",
    [email]
  );
  return rows[0] ?? null;
}

// 少し前に同じ種類のメールを送っていれば true（何度も送らない）
export async function sentRecently(userId, purpose) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM email_tokens
     WHERE user_id = $1 AND purpose = $2 AND created_at > now() - make_interval(secs => $3)`,
    [userId, purpose, RESEND_INTERVAL_SECONDS]
  );
  return rowCount > 0;
}

// リンクを作る。同じ種類の古いリンクは使えなくする
async function createEmailToken(userId, purpose) {
  const token = newToken();
  await pool.query("DELETE FROM email_tokens WHERE user_id = $1 AND purpose = $2", [userId, purpose]);
  await pool.query(
    `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [hashToken(token), userId, purpose, TOKEN_HOURS[purpose]]
  );
  return token;
}

// リンクの合言葉を確かめる。正しければユーザー ID を返し、合言葉は消す（1回しか使えない）
//   db: pool か、トランザクション中の client
export async function consumeEmailToken(db, token, purpose) {
  if (!token || String(token).length > 200) return null;
  const { rows } = await db.query(
    "DELETE FROM email_tokens WHERE token_hash = $1 AND purpose = $2 RETURNING user_id, expires_at > now() AS valid",
    [hashToken(token), purpose]
  );
  return rows[0]?.valid ? rows[0].user_id : null;
}

// 合言葉が使えるか（消さずに確かめる。再設定の画面を出すときに使う）
export async function isValidEmailToken(token, purpose) {
  if (!token || String(token).length > 200) return false;
  const { rowCount } = await pool.query(
    "SELECT 1 FROM email_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > now()",
    [hashToken(token), purpose]
  );
  return rowCount > 0;
}

// 登録を有効にする。最初に有効になったユーザーには、ユーザー管理を入れる前のデータを引き継ぐ
export async function activateUser(client, userId) {
  // 2人が同時に有効にしても、引き継ぐのは1人だけになるよう、順番に処理する
  await client.query("SELECT pg_advisory_xact_lock(7301)");
  const { rows } = await client.query("SELECT verified_at FROM users WHERE id = $1 FOR UPDATE", [userId]);
  if (!rows[0] || rows[0].verified_at) return;
  const others = await client.query("SELECT 1 FROM users WHERE verified_at IS NOT NULL LIMIT 1");
  if (others.rowCount === 0) {
    await client.query("UPDATE decks SET user_id = $1 WHERE user_id IS NULL", [userId]);
    await client.query("UPDATE settings SET user_id = $1 WHERE user_id IS NULL", [userId]);
    await client.query("UPDATE known_words SET user_id = $1 WHERE user_id IS NULL", [userId]);
  }
  await client.query("UPDATE users SET verified_at = now() WHERE id = $1", [userId]);
}

const SIGNATURE = "\n\n--\nフラッシュカード\n※ このメールに心当たりがなければ、何もせずに削除してください。";

export async function sendVerifyMail(user) {
  const token = await createEmailToken(user.id, "verify");
  return sendMail({
    to: user.email,
    subject: "【フラッシュカード】登録を完了してください",
    text:
      `フラッシュカードへの登録ありがとうございます。\n` +
      `下のリンクを開くと登録が完了し、そのままログインします（${TOKEN_HOURS.verify}時間有効）。\n\n` +
      `${appUrl(`/verify?token=${token}`)}` +
      SIGNATURE,
  });
}

export async function sendResetMail(user) {
  const token = await createEmailToken(user.id, "reset");
  return sendMail({
    to: user.email,
    subject: "【フラッシュカード】パスワードの再設定",
    text:
      `パスワードの再設定を受け付けました。\n` +
      `下のリンクを開いて、新しいパスワードを設定してください（${TOKEN_HOURS.reset}時間有効）。\n\n` +
      `${appUrl(`/reset-password?token=${token}`)}` +
      SIGNATURE,
  });
}

// すでに登録済みのアドレスで、もう一度登録しようとしたとき
export async function sendAlreadyRegisteredMail(user) {
  return sendMail({
    to: user.email,
    subject: "【フラッシュカード】このメールアドレスは登録済みです",
    text:
      `このメールアドレスで登録しようとする操作がありましたが、すでに登録済みです。\n` +
      `ログインはこちら: ${appUrl("/login")}\n` +
      `パスワードを忘れたときはこちら: ${appUrl("/forgot-password")}` +
      SIGNATURE,
  });
}
