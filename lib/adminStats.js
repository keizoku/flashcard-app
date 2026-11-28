// 管理者の画面の集計（ユーザーの数と、どのくらい使われているか）。数だけを返し、だれのデータかは返さない。
// 「使った人」「回答数」「勉強時間」「単語帳・カードの数」は、登録ユーザー（おためしでない人）の分だけ数える。
// おためしユーザーは1日で消える（データもいっしょに消える）ので、日ごとの数があとから変わってしまうため。
// おためしは、始めた回数（guest_daily）で見る
import { pool } from "./db";

const TZ = "Asia/Tokyo";
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;
const dayOf = (col) => `(${col} AT TIME ZONE '${TZ}')::date`;

// 登録ユーザーが使った記録（だれが・いつ）。記憶テストに答えた・勉強時間・カードを作った・単語帳を作った
const ACTIVITY = `
  SELECT d.user_id, l.reviewed_at AS at FROM review_logs l JOIN decks d ON d.id = l.deck_id
  UNION ALL SELECT t.user_id, t.recorded_at FROM study_time t
  UNION ALL SELECT d.user_id, c.created_at FROM cards c JOIN decks d ON d.id = c.deck_id
  UNION ALL SELECT d.user_id, d.created_at FROM decks d`;
const REGISTERED = "SELECT id FROM users WHERE guest_expires_at IS NULL";

// 全体の数。日の区切りは日本時間（「7日」は今日を入れて7日）
export async function getAdminSummary() {
  const { rows } = await pool.query(`
    WITH reg AS (${REGISTERED}),
         act AS (SELECT a.user_id, ${dayOf("a.at")} AS day FROM (${ACTIVITY}) a WHERE a.user_id IN (SELECT id FROM reg))
    SELECT
      (SELECT COUNT(*)::int FROM reg) AS registered,
      (SELECT COUNT(*)::int FROM users WHERE id IN (SELECT id FROM reg) AND ${dayOf("created_at")} > ${TODAY} - 7) AS new7,
      (SELECT COUNT(*)::int FROM users WHERE id IN (SELECT id FROM reg) AND ${dayOf("created_at")} > ${TODAY} - 30) AS new30,
      (SELECT COUNT(*)::int FROM users WHERE guest_expires_at > now()) AS guests_active,
      (SELECT COALESCE(SUM(starts), 0)::int FROM guest_daily WHERE day = ${TODAY}) AS guests_today,
      (SELECT COALESCE(SUM(starts), 0)::int FROM guest_daily WHERE day > ${TODAY} - 30) AS guests_30,
      (SELECT COUNT(DISTINCT user_id)::int FROM act WHERE day = ${TODAY}) AS active_today,
      (SELECT COUNT(DISTINCT user_id)::int FROM act WHERE day > ${TODAY} - 7) AS active_7,
      (SELECT COUNT(DISTINCT user_id)::int FROM act WHERE day > ${TODAY} - 30) AS active_30,
      (SELECT COUNT(*)::int FROM decks WHERE user_id IN (SELECT id FROM reg)) AS decks,
      (SELECT COUNT(*)::int FROM cards c JOIN decks d ON d.id = c.deck_id WHERE d.user_id IN (SELECT id FROM reg)) AS cards,
      (SELECT COUNT(*)::int FROM review_logs l JOIN decks d ON d.id = l.deck_id
        WHERE d.user_id IN (SELECT id FROM reg) AND ${dayOf("l.reviewed_at")} > ${TODAY} - 30) AS reviews_30,
      (SELECT COALESCE(SUM(seconds), 0)::int FROM study_time
        WHERE user_id IN (SELECT id FROM reg) AND ${dayOf("recorded_at")} > ${TODAY} - 30) AS study_30`);
  const r = rows[0];
  return {
    users: { registered: r.registered, new7: r.new7, new30: r.new30 },
    guests: { active: r.guests_active, startsToday: r.guests_today, starts30: r.guests_30 },
    active: { today: r.active_today, days7: r.active_7, days30: r.active_30 },
    content: { decks: r.decks, cards: r.cards, reviews30: r.reviews_30, studySeconds30: r.study_30 },
  };
}

// 日ごとの推移（直近 days 日、古い順）。
// [{ day: "YYYY-MM-DD", signups（新規登録）, guestStarts（おためし開始）, activeUsers（使った人）, reviews（回答数）, studySeconds（勉強時間） }]
export async function getAdminDaily({ days = 30 } = {}) {
  const { rows } = await pool.query(
    `WITH reg AS (${REGISTERED}),
          act AS (SELECT a.user_id, ${dayOf("a.at")} AS day FROM (${ACTIVITY}) a WHERE a.user_id IN (SELECT id FROM reg)),
          span AS (SELECT generate_series(${TODAY} - ($1::int - 1), ${TODAY}, '1 day')::date AS day)
     SELECT to_char(s.day, 'YYYY-MM-DD') AS day,
       (SELECT COUNT(*)::int FROM users WHERE id IN (SELECT id FROM reg) AND ${dayOf("created_at")} = s.day) AS signups,
       (SELECT COALESCE(SUM(starts), 0)::int FROM guest_daily g WHERE g.day = s.day) AS "guestStarts",
       (SELECT COUNT(DISTINCT user_id)::int FROM act WHERE act.day = s.day) AS "activeUsers",
       (SELECT COUNT(*)::int FROM review_logs l JOIN decks d ON d.id = l.deck_id
         WHERE d.user_id IN (SELECT id FROM reg) AND ${dayOf("l.reviewed_at")} = s.day) AS reviews,
       (SELECT COALESCE(SUM(seconds), 0)::int FROM study_time
         WHERE user_id IN (SELECT id FROM reg) AND ${dayOf("recorded_at")} = s.day) AS "studySeconds"
     FROM span s ORDER BY s.day`,
    [days]
  );
  return rows;
}
