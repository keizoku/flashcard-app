import "server-only";
import { pool } from "./db.js";

// カードの覚えたい語（複数）をまとめて読む。戻り値: Map<カードID, [{ word, form, meaning, translation_form }]>
export async function getTargetsByCard(cardIds) {
  const map = new Map();
  if (cardIds.length === 0) return map;
  const { rows } = await pool.query(
    `SELECT card_id, word, form, meaning, translation_form FROM card_targets
     WHERE card_id = ANY($1::int[]) ORDER BY card_id, position, id`,
    [cardIds]
  );
  for (const r of rows) {
    if (!map.has(r.card_id)) map.set(r.card_id, []);
    map.get(r.card_id).push({ word: r.word, form: r.form, meaning: r.meaning, translation_form: r.translation_form });
  }
  return map;
}

// カードの覚えたい語を置き換える。1つ目の語は cards の列（target_word など）にも入れておく
// db: pool か、トランザクション中の client
export async function replaceCardTargets(db, cardId, targets) {
  await db.query("DELETE FROM card_targets WHERE card_id = $1", [cardId]);
  for (const [i, t] of targets.entries()) {
    await db.query(
      `INSERT INTO card_targets (card_id, position, word, form, meaning, translation_form)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [cardId, i, t.word, t.form, t.meaning || null, t.translation_form || null]
    );
  }
  const first = targets[0];
  await db.query(
    `UPDATE cards SET target_word = $2, target_form = $3, ai_meaning = $4, ai_translation_form = $5 WHERE id = $1`,
    [cardId, first?.word ?? null, first?.form ?? null, first?.meaning || null, first?.translation_form || null]
  );
}

// カードの一覧に targets を付ける（targets がないカードは、cards の列から1つ作る）
export async function attachTargets(cards) {
  const map = await getTargetsByCard(cards.map((c) => c.id));
  return cards.map((c) => ({
    ...c,
    targets:
      map.get(c.id) ??
      (c.target_form
        ? [{ word: c.target_word, form: c.target_form, meaning: c.ai_meaning, translation_form: c.ai_translation_form }]
        : []),
  }));
}
