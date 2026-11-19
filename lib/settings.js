import "server-only";
import { pool } from "./db.js";
import { findLevel } from "./levels.js";
import { LEARNED_BOX } from "./review.js";

export async function getSettings(userId) {
  const { rows } = await pool.query("SELECT level_key, vocab_size FROM settings WHERE user_id = $1", [userId]);
  const row = rows[0] ?? { level_key: "eiken-2", vocab_size: 5000 };
  const level = findLevel(row.level_key);
  return {
    levelKey: row.level_key,
    vocabSize: row.vocab_size,
    levelLabel: level && level.key !== "custom" ? level.label : "語彙数を直接指定",
  };
}

// 語の状態を返す
//   knownWords … 知っている語: 「知ってる」を押した語 ＋ 学習で「覚えた」カードの語
//   studyWords … 学習中の語: カードにしたが、まだ「覚えた」になっていない語
export async function getWordState(userId) {
  const { rows } = await pool.query(
    `SELECT word, true AS known FROM known_words WHERE user_id = $1
     UNION ALL
     SELECT t.word, c.review_box >= ${LEARNED_BOX} AS known
     FROM card_targets t JOIN cards c ON c.id = t.card_id JOIN decks d ON d.id = c.deck_id
     WHERE d.user_id = $1`,
    [userId]
  );
  const knownWords = new Set(rows.filter((r) => r.known).map((r) => r.word));
  const studyWords = new Set(rows.filter((r) => !r.known && !knownWords.has(r.word)).map((r) => r.word));
  return { knownWords, studyWords };
}
