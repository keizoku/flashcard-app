import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { TERMS_VERSION } from "./terms.js";

// おためしユーザー。新規登録をせずに、1日だけ全機能を試せるアカウント。
// - 1日（GUEST_HOURS）たったら、アカウントごと（単語帳・カード・学習の記録もすべて）削除する
// - いたずらで大量に作られないよう、同時に使える人数・同じ接続元から始められる回数・作れる量を決めている
// - 人に見せる・アカウントを残すための機能（公開・表示名・パスワード・パスキー）は使えない
// 詳しくは docs/auth.md の「おためしユーザー」

export const GUEST_HOURS = 24;
export const GUEST_LIMITS = {
  decks: 5, // 単語帳の数
  cards: 200, // カードの数（全部の単語帳の合計）
  imageBytes: 10 * 1024 * 1024, // 物語の絵の大きさの合計（10MB）
};
export const MAX_ACTIVE_GUESTS = 30; // 同時に使えるおためしユーザーの数（全体）
export const MAX_STARTS_PER_IP = 3; // 同じ接続元から、1日に始められる回数
export const MAX_STARTS_PER_DAY = 100; // 全体で、1日に始められる回数
// 手元の開発サーバー（next dev）では、始められる回数の制限（同じ接続元・全体の1日の回数）をかけない。
// 何度も始めて動作を確かめられるように。本番（Vercel）・テストではかける
const countStarts = () => process.env.NODE_ENV !== "development";
// パスワードの代わりに入れる値。"scrypt$" で始まらないので、どのパスワードとも合わない（パスワードではログインできない）
const NO_PASSWORD = "guest-no-password";

export const GUEST_BLOCKED = "おためし中は使えません。続けて使うときは、新規登録してください";
export const GUEST_FULL = "いま、おためしを始められる人数がいっぱいです。時間をおいて、もう一度お試しください";

// 接続元（IP アドレス）のハッシュ。IP アドレスそのものは保存しない
export const hashIp = (ip) => createHash("sha256").update(`flashcard-guest:${String(ip ?? "")}`).digest("hex");

// プロキシ（Vercel など）を通ったときの、元の接続元。x-forwarded-for の最初の値
export function clientIp(headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

// 期限が過ぎたおためしユーザーを、アカウントごと削除する（単語帳・カード・セッションなども一緒に消える）。
// 1日以上前の「始めた記録」も消す。消した人数を返す
export async function deleteExpiredGuests() {
  const { rowCount } = await pool.query(
    "DELETE FROM users WHERE guest_expires_at IS NOT NULL AND guest_expires_at <= now()"
  );
  await pool.query(
    "DELETE FROM guest_starts WHERE created_at < now() - make_interval(hours => $1)",
    [GUEST_HOURS]
  );
  return rowCount;
}

// おためしユーザーを作る → { user: { id, username, guestExpiresAt } } か { error }。
// ID は guest-<ランダム>（ふつうの登録では「guest」で始まる ID は使えないので、重ならない）
export async function createGuest({ ip }) {
  await deleteExpiredGuests();
  const ipHash = hashIp(ip);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 同時に何人もが始めたときに数え間違えないよう、1人ずつ順番に処理する
    await client.query("SELECT pg_advisory_xact_lock(hashtext('flashcard-guest-start'))");
    const { rows: counts } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE guest_expires_at > now()) AS active,
         (SELECT COUNT(*)::int FROM guest_starts WHERE ip_hash = $1 AND created_at > now() - make_interval(hours => $2)) AS from_ip,
         (SELECT COUNT(*)::int FROM guest_starts WHERE created_at > now() - make_interval(hours => $2)) AS today`,
      [ipHash, GUEST_HOURS]
    );
    const c = counts[0];
    let error = null;
    if (countStarts() && c.from_ip >= MAX_STARTS_PER_IP) {
      error = `おためしは、同じ場所から1日に${MAX_STARTS_PER_IP}回までです。続けて使うときは、新規登録してください`;
    } else if (c.active >= MAX_ACTIVE_GUESTS || (countStarts() && c.today >= MAX_STARTS_PER_DAY)) {
      error = GUEST_FULL;
    }
    if (error) {
      await client.query("ROLLBACK");
      return { error };
    }
    const username = `guest-${randomBytes(9).toString("hex")}`;
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, guest_expires_at, terms_version, terms_agreed_at)
       VALUES ($1, $2, now() + make_interval(hours => $3), $4, now())
       RETURNING id, username, guest_expires_at AS "guestExpiresAt"`,
      [username, NO_PASSWORD, GUEST_HOURS, TERMS_VERSION]
    );
    await client.query("INSERT INTO guest_starts (ip_hash) VALUES ($1)", [ipHash]);
    // 管理者の画面の「日ごとの推移」のため、日ごと（日本時間）の回数だけを数える（ユーザーを消しても残る）
    await client.query(
      `INSERT INTO guest_daily (day, starts) VALUES ((now() AT TIME ZONE 'Asia/Tokyo')::date, 1)
       ON CONFLICT (day) DO UPDATE SET starts = guest_daily.starts + 1`
    );
    await client.query("COMMIT");
    return { user: rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// おためしユーザーなら、その期限（Date）。ふつうのユーザーなら null
export async function guestExpiry(userId, db = pool) {
  const { rows } = await db.query("SELECT guest_expires_at FROM users WHERE id = $1", [userId]);
  return rows[0]?.guest_expires_at ?? null;
}

// おためしユーザーを、すぐに削除する（「おためしを終える」）。ふつうのユーザーは消さない
export async function deleteGuest(userId) {
  const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1 AND guest_expires_at IS NOT NULL", [userId]);
  return { deleted: rowCount > 0 };
}

// 公開・表示名・パスワード・パスキーなど、おためしでは使えない操作のとき → エラーの文 か null
export async function guestBlockedError(userId, db = pool) {
  return (await guestExpiry(userId, db)) ? GUEST_BLOCKED : null;
}

// おためしユーザーが、決めた量を超えて作ろうとしていないか → エラーの文 か null。
// add: これから増やす量 { decks, cards, imageBytes }。ふつうのユーザーは、いつも null。
// replaceSceneId: 絵を差し替えるときの場面（今の絵の大きさは数えない）
export async function guestLimitError(userId, add = {}, { db = pool, replaceSceneId = null } = {}) {
  if (!(await guestExpiry(userId, db))) return null;
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM decks WHERE user_id = $1) AS decks,
       (SELECT COUNT(*)::int FROM cards c JOIN decks d ON d.id = c.deck_id WHERE d.user_id = $1) AS cards,
       (SELECT COALESCE(SUM(octet_length(s.image)), 0)::bigint FROM story_scenes s JOIN decks d ON d.id = s.deck_id
         WHERE d.user_id = $1 AND s.id IS DISTINCT FROM $2::int) AS image_bytes`,
    [userId, replaceSceneId]
  );
  const now = rows[0];
  if ((add.decks ?? 0) > 0 && now.decks + add.decks > GUEST_LIMITS.decks) {
    return `おためしでは、単語帳は${GUEST_LIMITS.decks}冊までです`;
  }
  if ((add.cards ?? 0) > 0 && now.cards + add.cards > GUEST_LIMITS.cards) {
    return `おためしでは、カードは全部で${GUEST_LIMITS.cards}枚までです（いま ${now.cards} 枚）`;
  }
  if ((add.imageBytes ?? 0) > 0 && Number(now.image_bytes) + add.imageBytes > GUEST_LIMITS.imageBytes) {
    return `おためしでは、絵は全部で ${GUEST_LIMITS.imageBytes / 1024 / 1024}MB までです`;
  }
  return null;
}

// 削除までの残り時間（時間。切り上げ、最低1）。画面の上に「おためし中（あと N 時間）」と出す
export function guestHoursLeft(expiresAt, now = Date.now()) {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now) / (60 * 60 * 1000)));
}
