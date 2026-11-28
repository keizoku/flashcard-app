import { pool } from "@/lib/db";
import { hashToken } from "@/lib/auth";

// テストで使う、データ作り・ログインなどの道具

const TABLES = [
  "review_logs", "card_targets", "cards", "deck_tags", "tags", "decks",
  "known_words", "settings", "email_tokens", "user_sessions", "users", "study_time", "story_scenes", "passkeys", "passkey_challenges", "guest_starts", "guest_daily",
];

// すべてのテーブルを空にして、Cookie と送ったメールも消す
export async function resetDb() {
  await pool.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  globalThis.testCookies.clear();
  globalThis.testHeaders = {};
  globalThis.sentMails.length = 0;
}

// パスワードのハッシュは時間がかかるので、テストでは決まった値を使う（パスワード "password123"）
export const PASSWORD = "password123";
let cachedHash = null;
async function passwordHash() {
  if (!cachedHash) {
    const { hashPassword } = await import("@/lib/password");
    cachedHash = await hashPassword(PASSWORD);
  }
  return cachedHash;
}

export async function createUser({ email = "user@example.com", verified = true } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, verified_at) VALUES ($1, $2, CASE WHEN $3 THEN now() END)
     RETURNING id, email`,
    [email, await passwordHash(), verified]
  );
  return rows[0];
}

// そのユーザーでログインした状態にする（Cookie にセッションを入れる）
export async function loginAs(user) {
  const token = `test-session-${user.id}-${Math.random()}`;
  await pool.query(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')",
    [hashToken(token), user.id]
  );
  globalThis.testCookies.set("flashcard_session", token);
  return token;
}

export function logoutCookie() {
  globalThis.testCookies.clear();
}

export async function createDeck(userId, { name = "Deck", transcript = null, videoId = null, kind = "video" } = {}) {
  const { rows } = await pool.query(
    "INSERT INTO decks (user_id, name, transcript, video_id, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [userId, name, transcript, videoId, kind]
  );
  return rows[0].id;
}

// targets: [{ word, form, meaning?, translation_form? }]
export async function createCard(deckId, { front = "Hello world.", back = "", targets = [], reviewBox = 0 } = {}) {
  const { rows } = await pool.query(
    "INSERT INTO cards (deck_id, front, back, review_box) VALUES ($1, $2, $3, $4) RETURNING id",
    [deckId, front, back, reviewBox]
  );
  const id = rows[0].id;
  if (targets.length) {
    const { replaceCardTargets } = await import("@/lib/targets");
    await replaceCardTargets(pool, id, targets);
  }
  return id;
}

export async function getCard(id) {
  const { rows } = await pool.query("SELECT * FROM cards WHERE id = $1", [id]);
  return rows[0] ?? null;
}

// redirect() で止まった Server Action の行き先を返す（止まらなければ戻り値をそのまま返す）
export async function runAction(promise) {
  try {
    return { result: await promise, redirectTo: null };
  } catch (err) {
    if (err.redirectTo) return { result: null, redirectTo: err.redirectTo };
    throw err;
  }
}

export function formData(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

// メールの本文から、最初の URL を取り出す
export function linkIn(mail) {
  return mail.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}
