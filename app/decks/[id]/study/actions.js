"use server";

import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { INTERVAL_DAYS, MAX_BOX, nextDueSql } from "@/lib/review";

// 学習中の画面を読み直さないよう、このファイルでは revalidatePath を呼ばない
// （デッキ画面・一覧・統計は毎回 DB から読み直すので、戻ったときに最新になる）

function toId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// 「覚えている / 覚えていない」を記録して、次に出す日時を決める。
// 戻り値の logId を undoReview に渡すと、答える前の状態に戻せる
export async function recordReview(cardIdArg, remembered) {
  const user = await requireUser();
  const cardId = toId(cardIdArg);
  if (!cardId) return { error: "カードが見つかりません" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT c.deck_id, c.review_box, c.review_due_at, c.last_reviewed_at
       FROM cards c JOIN decks d ON d.id = c.deck_id
       WHERE c.id = $1 AND d.user_id = $2
       FOR UPDATE OF c`,
      [cardId, user.id]
    );
    const card = rows[0];
    if (!card) {
      await client.query("ROLLBACK");
      return { error: "カードが見つかりません" };
    }

    const box = remembered ? Math.min(card.review_box + 1, MAX_BOX) : 0;
    const days = INTERVAL_DAYS[box];
    await client.query(
      `UPDATE cards SET
         review_box = $2,
         review_due_at = ${nextDueSql("now()", "$3::int")},
         last_reviewed_at = now(),
         review_count = review_count + 1,
         lapse_count = lapse_count + CASE WHEN $4 THEN 0 ELSE 1 END
       WHERE id = $1`,
      [cardId, box, days, Boolean(remembered)]
    );
    const log = await client.query(
      `INSERT INTO review_logs (card_id, deck_id, remembered, prev_box, prev_due_at, prev_last_reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [cardId, card.deck_id, Boolean(remembered), card.review_box, card.review_due_at, card.last_reviewed_at]
    );
    await client.query("COMMIT");
    return { error: null, box, days, logId: Number(log.rows[0].id) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// 直前の答えを取り消して、答える前の状態に戻す（そのカードの最新の記録だけ取り消せる）
export async function undoReview(logIdArg) {
  const user = await requireUser();
  const logId = toId(logIdArg);
  if (!logId) return { error: "取り消す記録が見つかりません" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT l.card_id, l.remembered, l.prev_box, l.prev_due_at, l.prev_last_reviewed_at
       FROM review_logs l JOIN decks d ON d.id = l.deck_id
       WHERE l.id = $1 AND d.user_id = $2
         AND l.id = (SELECT max(id) FROM review_logs WHERE card_id = l.card_id)
       FOR UPDATE OF l`,
      [logId, user.id]
    );
    const log = rows[0];
    if (!log || log.card_id === null || log.prev_box === null) {
      await client.query("ROLLBACK");
      return { error: "この答えは取り消せません" };
    }
    await client.query(
      `UPDATE cards SET
         review_box = $2,
         review_due_at = $3,
         last_reviewed_at = $4,
         review_count = GREATEST(review_count - 1, 0),
         lapse_count = GREATEST(lapse_count - CASE WHEN $5 THEN 0 ELSE 1 END, 0)
       WHERE id = $1`,
      [log.card_id, log.prev_box, log.prev_due_at, log.prev_last_reviewed_at, log.remembered]
    );
    await client.query("DELETE FROM review_logs WHERE id = $1", [logId]);
    await client.query("COMMIT");
    return { error: null };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
