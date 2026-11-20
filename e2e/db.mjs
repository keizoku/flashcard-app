import { createHash, randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

// 画面のテストで使う DB の道具。開発用の DB（flashcard）には触れない。

// テスト用 DB の接続先。名前が _e2e で終わるものしか使わない
export function e2eDatabaseUrl() {
  const fromEnv = process.env.E2E_DATABASE_URL;
  const url = new URL(fromEnv ?? process.env.DATABASE_URL ?? "postgres://flashcard:flashcard@db:5432/flashcard");
  if (!fromEnv) url.pathname = "/flashcard_e2e";
  if (!/_e2e$/.test(url.pathname)) {
    throw new Error(`画面のテスト用 DB の名前は _e2e で終わる必要があります: ${url.pathname}`);
  }
  return url.toString();
}

let pool;
export function db() {
  pool ??= new pg.Pool({ connectionString: e2eDatabaseUrl(), max: 2 });
  return pool;
}
export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

const TABLES = [
  "review_logs", "card_targets", "cards", "deck_tags", "tags", "decks",
  "known_words", "settings", "email_tokens", "user_sessions", "users", "videos", "study_time",
];

export async function resetDb() {
  await db().query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

// テスト用のパスワード。lib/password.js と同じ形式（scrypt$<salt>$<hash>）で保存する
// （lib/password.js は Next.js の外では読み込めないので、ここで同じ計算をする）
export const PASSWORD = "password123";
function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 64).toString("base64")}`;
}

export async function createUser(email) {
  const { rows } = await db().query(
    "INSERT INTO users (email, password_hash, verified_at) VALUES ($1, $2, now()) RETURNING id, email",
    [email, hashPassword(PASSWORD)]
  );
  return rows[0];
}

// ログインした状態にする（セッションを DB に入れ、ブラウザに Cookie を入れる）。lib/auth.js と同じ形
export async function loginAs(context, user) {
  const token = randomBytes(24).toString("hex");
  await db().query(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')",
    [createHash("sha256").update(token).digest("hex"), user.id]
  );
  await context.addCookies([{ name: "flashcard_session", value: token, url: "http://localhost:3200" }]);
}

// kind: "video"（ふつうのデッキ）か "story"（覚えた単語で作った物語）
export async function createDeck(userId, { name = "Deck", transcript = null, videoId = null, kind = "video" } = {}) {
  const { rows } = await db().query(
    "INSERT INTO decks (user_id, name, transcript, video_id, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [userId, name, transcript, videoId, kind]
  );
  return rows[0].id;
}

// カードを作る。review は記憶テストの状態（{ box, count, lapses }）。答えたことがあるカードは、次は明日
export async function createCard(deckId, { front, back = "", word = null, review = null }) {
  const count = review?.count ?? 0;
  const { rows } = await db().query(
    `INSERT INTO cards (deck_id, front, back, target_word, target_form,
                        review_box, review_count, lapse_count, review_due_at, last_reviewed_at)
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7,
             CASE WHEN $6 > 0 THEN now() + interval '1 day' END,
             CASE WHEN $6 > 0 THEN now() END)
     RETURNING id`,
    [deckId, front, back, word, review?.box ?? 0, count, review?.lapses ?? 0]
  );
  const id = rows[0].id;
  if (word) {
    await db().query("INSERT INTO card_targets (card_id, word, form) VALUES ($1, $2, $2)", [id, word]);
  }
  return id;
}
