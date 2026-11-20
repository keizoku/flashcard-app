import "server-only";
import { pool } from "./db.js";
import { MAX_SEND_SECONDS, STUDY_KINDS } from "./studyClock.js";

// 勉強時間（単語を覚えた時間・リスニングの時間）の記録と集計。日は日本時間で区切る

export const MAX_MANUAL_MINUTES = 600;
const TZ = "Asia/Tokyo";
const isKind = (kind) => Object.hasOwn(STUDY_KINDS, kind);

// 画面から送られてきた秒数を記録する。deckId は自分のデッキか null
export async function recordStudyTime(userId, { kind, seconds, deckId = null }) {
  if (!isKind(kind)) return { error: "種類が正しくありません" };
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SEND_SECONDS) return { error: "秒数が正しくありません" };
  if (deckId !== null) {
    if (!Number.isSafeInteger(deckId)) return { error: "デッキが見つかりません" };
    const { rowCount } = await pool.query("SELECT 1 FROM decks WHERE id = $1 AND user_id = $2", [deckId, userId]);
    if (rowCount === 0) return { error: "デッキが見つかりません" };
  }
  await pool.query("INSERT INTO study_time (user_id, deck_id, kind, seconds) VALUES ($1, $2, $3, $4)", [
    userId,
    deckId,
    kind,
    seconds,
  ]);
  return { ok: true };
}

// 手で足す（アプリの外で聞いた時間など）。今の日時で入れる
export async function addManualStudyTime(userId, { kind, minutes }) {
  if (!isKind(kind)) return { error: "種類を選んでください" };
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MANUAL_MINUTES) {
    return { error: `時間は 1〜${MAX_MANUAL_MINUTES} 分の整数で入れてください` };
  }
  await pool.query("INSERT INTO study_time (user_id, kind, source, seconds) VALUES ($1, $2, 'manual', $3)", [
    userId,
    kind,
    minutes * 60,
  ]);
  return { ok: true };
}

// 手で足した記録を消す（自分の、手で足したものだけ）
export async function deleteManualStudyTime(userId, id) {
  const { rowCount } = await pool.query("DELETE FROM study_time WHERE id = $1 AND user_id = $2 AND source = 'manual'", [
    id,
    userId,
  ]);
  return rowCount > 0 ? { ok: true } : { error: "記録が見つかりません" };
}

// 集計。秒数を種類ごとに { vocab, listening } で返す
// days: 直近 n 日の日ごと / today / week（直近7日）/ total（全部）/ byDeck（デッキ別、全部）/ manual（手で足した記録、新しい順に10件）
export async function getStudyTimeStats(userId, { days = 14, now = new Date() } = {}) {
  // decks にも kind があるので、study_time には必ず s を付ける
  const sums = `COALESCE(SUM(s.seconds) FILTER (WHERE s.kind = 'vocab'), 0)::int AS vocab,
                COALESCE(SUM(s.seconds) FILTER (WHERE s.kind = 'listening'), 0)::int AS listening`;
  const { rows: dayRows } = await pool.query(
    `WITH today AS (SELECT ($3::timestamptz AT TIME ZONE '${TZ}')::date AS d)
     SELECT to_char(day, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(s.seconds) FILTER (WHERE s.kind = 'vocab'), 0)::int AS vocab,
            COALESCE(SUM(s.seconds) FILTER (WHERE s.kind = 'listening'), 0)::int AS listening
       FROM today, generate_series(today.d - ($2::int - 1), today.d, '1 day') AS day
       LEFT JOIN study_time s ON s.user_id = $1 AND (s.recorded_at AT TIME ZONE '${TZ}')::date = day
      GROUP BY day ORDER BY day`,
    [userId, days, now]
  );
  const add = (list) =>
    list.reduce((acc, d) => ({ vocab: acc.vocab + d.vocab, listening: acc.listening + d.listening }), { vocab: 0, listening: 0 });
  const { rows: totalRows } = await pool.query(`SELECT ${sums} FROM study_time s WHERE s.user_id = $1`, [userId]);
  const { rows: byDeck } = await pool.query(
    `SELECT d.id, d.name, ${sums}
       FROM study_time s JOIN decks d ON d.id = s.deck_id
      WHERE s.user_id = $1 AND d.user_id = $1
      GROUP BY d.id, d.name
      ORDER BY SUM(s.seconds) DESC, d.id`,
    [userId]
  );
  const { rows: manual } = await pool.query(
    `SELECT id::int, kind, seconds, recorded_at FROM study_time
      WHERE user_id = $1 AND source = 'manual' ORDER BY recorded_at DESC, id DESC LIMIT 10`,
    [userId]
  );
  return {
    days: dayRows,
    today: add(dayRows.slice(-1)),
    week: add(dayRows.slice(-7)),
    total: totalRows[0],
    byDeck,
    manual,
  };
}
