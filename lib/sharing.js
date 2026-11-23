import "server-only";
import { pool } from "./db.js";

// デッキの共有（features.md の「7. デッキの共有」）
//   - 自分のデッキを公開すると、ログインしているほかのユーザーが「みんなのデッキ」で見て、取り込める
//   - 取り込むと、その時点のデッキ・カード・覚えたい語・タグを、取り込んだ人のデッキとしてコピーする
//     （記憶テストの状態はコピーしない。元のデッキをあとで変えても、コピーは変わらない）
//   - 公開したデッキには、作った人として「表示名」を出す（メールアドレスは見せない）

export const MAX_DISPLAY_NAME_LENGTH = 30;

// 表示名を整える → { name } か { error }。空なら name は null（表示名なし）
export function normalizeDisplayName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { name: null };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { error: "表示名に使えない文字が入っています" };
  if ([...name].length > MAX_DISPLAY_NAME_LENGTH) return { error: `表示名は${MAX_DISPLAY_NAME_LENGTH}文字以内にしてください` };
  return { name };
}

export async function getDisplayName(userId) {
  const { rows } = await pool.query("SELECT display_name FROM users WHERE id = $1", [userId]);
  return rows[0]?.display_name ?? null;
}

// 表示名を変える。公開中のデッキがあるときは、空にはできない
export async function setDisplayName(userId, raw) {
  const { name, error } = normalizeDisplayName(raw);
  if (error) return { error };
  if (!name) {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM decks WHERE user_id = $1 AND published_at IS NOT NULL LIMIT 1",
      [userId]
    );
    if (rowCount > 0) return { error: "公開中の単語帳があるので、表示名は空にできません" };
  }
  await pool.query("UPDATE users SET display_name = $2 WHERE id = $1", [userId, name]);
  return { name };
}

// 自分のデッキを公開する / 公開をやめる → { ok: true } か { error }
//   公開には、表示名と、1枚以上のカードが要る。公開をやめても、取り込まれたコピーはそのまま
export async function setDeckPublished(userId, deckId, publish) {
  const { rows } = await pool.query(
    `SELECT d.id, (SELECT COUNT(*)::int FROM cards c WHERE c.deck_id = d.id) AS card_count, u.display_name
     FROM decks d JOIN users u ON u.id = d.user_id
     WHERE d.id = $1 AND d.user_id = $2`,
    [deckId, userId]
  );
  const deck = rows[0];
  if (!deck) return { error: "単語帳が見つかりません" };
  if (publish) {
    if (!deck.display_name) return { error: "公開する前に、アカウントの画面で表示名を決めてください" };
    if (deck.card_count === 0) return { error: "カードのない単語帳は公開できません" };
    await pool.query("UPDATE decks SET published_at = COALESCE(published_at, now()) WHERE id = $1 AND user_id = $2", [
      deckId,
      userId,
    ]);
  } else {
    await pool.query("UPDATE decks SET published_at = NULL WHERE id = $1 AND user_id = $2", [deckId, userId]);
  }
  return { ok: true };
}

// 公開中のデッキの一覧（新しく公開した順）。見ている人の目印（自分のもの・取り込みずみ）も付ける
export async function listPublicDecks(viewerId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.kind, d.published_at, u.display_name,
            (SELECT COUNT(*)::int FROM cards c WHERE c.deck_id = d.id) AS card_count,
            COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id
                      WHERE dt.deck_id = d.id), '{}') AS tags,
            d.user_id = $1 AS is_mine,
            (SELECT m.id FROM decks m WHERE m.user_id = $1 AND m.source_deck_id = d.id ORDER BY m.id DESC LIMIT 1) AS imported_deck_id
     FROM decks d JOIN users u ON u.id = d.user_id
     WHERE d.published_at IS NOT NULL
     ORDER BY d.published_at DESC, d.id DESC`,
    [viewerId]
  );
  return rows;
}

// 公開中のデッキ1つと、そのカード（公開していなければ null）
export async function getPublicDeck(deckId, viewerId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.kind, d.video_id, d.published_at, u.display_name,
            d.transcript IS NOT NULL AS has_transcript,
            COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id
                      WHERE dt.deck_id = d.id), '{}') AS tags,
            d.user_id = $2 AS is_mine,
            (SELECT m.id FROM decks m WHERE m.user_id = $2 AND m.source_deck_id = d.id ORDER BY m.id DESC LIMIT 1) AS imported_deck_id
     FROM decks d JOIN users u ON u.id = d.user_id
     WHERE d.id = $1 AND d.published_at IS NOT NULL`,
    [deckId, viewerId]
  );
  const deck = rows[0];
  if (!deck) return null;
  const { rows: cards } = await pool.query(
    `SELECT c.id, c.front, c.back, c.ai_translation,
            COALESCE((SELECT array_agg(t.word ORDER BY t.position, t.id) FROM card_targets t WHERE t.card_id = c.id), '{}') AS words
     FROM cards c WHERE c.deck_id = $1 ORDER BY c.id`,
    [deckId]
  );
  return { ...deck, cards };
}

// 公開中のデッキを、userId のデッキとしてコピーする → { deckId } か { error }
//   コピーするもの: デッキ（名前・動画・字幕・AI で整えた文・物語の語）、タグ、カードの中身と解説、覚えたい語
//   コピーしないもの: 記憶テストの状態（未学習から始める）、学習の記録
export async function copyPublicDeck(userId, sourceId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM decks WHERE id = $1 AND published_at IS NOT NULL FOR SHARE",
      [sourceId]
    );
    const src = rows[0];
    if (!src) {
      await client.query("ROLLBACK");
      return { error: "この単語帳は公開されていません" };
    }
    if (src.user_id === userId) {
      await client.query("ROLLBACK");
      return { error: "自分の単語帳は取り込めません" };
    }
    const { rows: created } = await client.query(
      `INSERT INTO decks (user_id, name, video_id, transcript, sentences, sentences_hash, kind, story_words, source_deck_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        userId,
        src.name,
        src.video_id,
        src.transcript,
        src.sentences === null ? null : JSON.stringify(src.sentences),
        src.sentences_hash,
        src.kind,
        src.story_words === null ? null : JSON.stringify(src.story_words),
        src.id,
      ]
    );
    const deckId = created[0].id;
    await client.query("INSERT INTO deck_tags (deck_id, tag_id) SELECT $1, tag_id FROM deck_tags WHERE deck_id = $2", [
      deckId,
      src.id,
    ]);

    const { rows: cards } = await client.query("SELECT * FROM cards WHERE deck_id = $1 ORDER BY id", [src.id]);
    for (const c of cards) {
      const { rows: newCard } = await client.query(
        `INSERT INTO cards (deck_id, front, back, target_word, target_form, video_id, start_seconds,
                            ai_translation, ai_meaning, ai_examples, ai_trivia, ai_generated_at, ai_translation_form)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          deckId, c.front, c.back, c.target_word, c.target_form, c.video_id, c.start_seconds,
          c.ai_translation, c.ai_meaning, c.ai_examples === null ? null : JSON.stringify(c.ai_examples),
          c.ai_trivia, c.ai_generated_at, c.ai_translation_form,
        ]
      );
      await client.query(
        `INSERT INTO card_targets (card_id, position, word, form, meaning, translation_form)
         SELECT $1, position, word, form, meaning, translation_form FROM card_targets WHERE card_id = $2 ORDER BY position, id`,
        [newCard[0].id, c.id]
      );
    }
    await client.query("COMMIT");
    return { deckId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
