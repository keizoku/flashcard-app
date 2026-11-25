import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { pool } from "./db.js";
import { isAllowedEmail } from "./allowlist.js";
import { isHttpsApp } from "./appUrl.js";

// ログインの状態（セッション）を扱う。
// Cookie にはランダムな値を入れ、DB にはそのハッシュだけを保存する（DB が漏れても Cookie を作れない）

export const SESSION_COOKIE = "flashcard_session";
const SESSION_DAYS = 30;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");

// ログインする（Server Action / Route Handler の中でだけ呼べる）
export async function createSession(userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query("INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token),
    userId,
    expires,
  ]);
  // 期限切れのセッションは、ついでに片付ける
  await pool.query("DELETE FROM user_sessions WHERE expires_at < now()");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsApp(),
    path: "/",
    expires,
  });
}

// ログアウトする
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [hashToken(token)]);
  store.delete(SESSION_COOKIE);
}

// 今のセッション以外を、すべてログアウトさせる（パスワードを変えたとき）
export async function destroyOtherSessions(userId) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await pool.query("DELETE FROM user_sessions WHERE user_id = $1 AND token_hash <> $2", [
    userId,
    token ? hashToken(token) : "",
  ]);
}

// ログイン中のユーザー（いなければ null）。{ id, email, displayName（表示名。なければ null） }。
// 1回の表示の中では DB を1回だけ読む
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.display_name AS "displayName" FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.verified_at IS NOT NULL`,
    [hashToken(token)]
  );
  // 使える人を決めているときは、決めた人でなくなったユーザーをログインしていない扱いにする
  if (rows[0] && !isAllowedEmail(rows[0].email)) return null;
  return rows[0] ?? null;
});

// ログインが必要な画面・操作で使う。ログインしていなければログイン画面へ
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// そのデッキが、このユーザーのものか
export async function ownsDeck(userId, deckId) {
  const { rowCount } = await pool.query("SELECT 1 FROM decks WHERE id = $1 AND user_id = $2", [deckId, userId]);
  return rowCount > 0;
}

// そのカードが、このユーザーのデッキのものか
export async function ownsCard(userId, cardId) {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM cards c JOIN decks d ON d.id = c.deck_id WHERE c.id = $1 AND d.user_id = $2",
    [cardId, userId]
  );
  return rowCount > 0;
}
