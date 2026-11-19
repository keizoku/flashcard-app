import "server-only";
import { pool } from "./db.js";

export const MAX_TAGS_PER_DECK = 10;
export const MAX_TAG_LENGTH = 20;

// フォームから来たタグ（JSON の配列、またはカンマ区切り）を、きれいな配列にする
export function parseTags(raw) {
  let list = [];
  const text = String(raw ?? "").trim();
  if (text.startsWith("[")) {
    try {
      list = JSON.parse(text);
    } catch {
      list = [];
    }
  } else {
    list = text.split(/[,、，]/);
  }
  const seen = new Set();
  const tags = [];
  for (const item of Array.isArray(list) ? list : []) {
    const name = String(item ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    tags.push(name);
  }
  return tags.slice(0, MAX_TAGS_PER_DECK);
}

// デッキのタグを、指定した一覧に置き換える。どのデッキにも使われなくなったタグは消す
export async function setDeckTags(deckId, tags) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM deck_tags WHERE deck_id = $1", [deckId]);
    for (const name of tags) {
      const { rows } = await client.query(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name]
      );
      await client.query("INSERT INTO deck_tags (deck_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
        deckId,
        rows[0].id,
      ]);
    }
    await client.query("DELETE FROM tags t WHERE NOT EXISTS (SELECT 1 FROM deck_tags dt WHERE dt.tag_id = t.id)");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// このユーザーのデッキに使われているタグの一覧（名前順）
// （タグの名前は全ユーザーで共有するが、どのデッキに付いているかはユーザーごと）
export async function getAllTags(userId) {
  const { rows } = await pool.query(
    `SELECT name FROM tags t
     WHERE EXISTS (SELECT 1 FROM deck_tags dt JOIN decks d ON d.id = dt.deck_id WHERE dt.tag_id = t.id AND d.user_id = $1)
     ORDER BY name`,
    [userId]
  );
  return rows.map((r) => r.name);
}

// デッキに付いているタグ
export async function getDeckTags(deckId) {
  const { rows } = await pool.query(
    "SELECT t.name FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.deck_id = $1 ORDER BY t.name",
    [deckId]
  );
  return rows.map((r) => r.name);
}
