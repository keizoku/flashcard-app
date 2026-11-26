import "server-only";
import grandTrainTour from "../data/starter/grand-train-tour.json";
import { pool } from "./db.js";
import { guestLimitError } from "./guest.js";
import { transcriptHash } from "./sentences.js";
import { createStoryDeck } from "./story.js";
import { setDeckTags } from "./tags.js";
import { replaceCardTargets } from "./targets.js";

// おためしユーザーに、最初から入れておく単語帳（2冊）。始めてすぐに、全部の機能を試せるように。
// 1. 動画の単語帳: 字幕・AI で整えた文・カードが入っている（字幕から例文を追加・動画の再生・記憶テストをすぐ試せる）。
//    data/starter/ のファイルは、手元の DB の単語帳を scripts/export-deck.mjs で書き出したもの
// 2. 物語の単語帳: このアプリのために書いた短い物語（物語のスライド・読み上げ）。
//    形は、物語を作るときに AI が返す答えと同じ（lib/storyPrompt.js）

export const STARTER_VIDEO_DECKS = [grandTrainTour];

export const STARTER_WORDS = ["nervous", "give up", "figure sth out", "eventually", "confident", "look forward to sth"];

export const STARTER_STORY = `タイトル: The First Pancake
[1] Ken was nervous about cooking breakfast for his family.
訳: ケンは、家族の朝ごはんを作ることに緊張していた。
語句: nervous = 形容詞「緊張して」【緊張していた】
[2] His first pancake was burnt, and he almost gave up.
訳: 最初のパンケーキは焦げてしまい、彼はもう少しであきらめるところだった。
語句: gave up = 句動詞「あきらめる」【あきらめる】
[3] Then he watched the pan closely and tried again.
訳: それから彼はフライパンをよく見て、もう一度やってみた。
[4] Slowly, he figured out the right heat.
訳: 少しずつ、彼はちょうどいい火加減がわかってきた。
語句: figured out = 句動詞「（考えて）わかる」【わかってきた】
[5] Eventually, the pancakes turned golden and soft.
訳: やがて、パンケーキはきつね色でふわふわになった。
語句: Eventually = 副詞「やがて、最終的に」【やがて】
[6] His little sister tasted one and smiled.
訳: 妹がひとつ食べて、にっこりした。
[7] Now Ken feels confident in the kitchen.
訳: 今では、ケンは台所で自信を持っている。
語句: confident = 形容詞「自信がある」【自信を持っている】
[8] He is already looking forward to next Sunday.
訳: 彼はもう、次の日曜日を楽しみにしている。
語句: looking forward to = 句動詞「〜を楽しみにする」【楽しみにしている】`;

// 書き出した単語帳（data/starter/）を、userId の単語帳として入れる → { deckId } か { error }。
// 記憶テストは、未学習から始める
export async function insertDeckSnapshot(userId, snap) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const limit = await guestLimitError(userId, { decks: 1, cards: snap.cards.length }, { db: client });
    if (limit) {
      await client.query("ROLLBACK");
      return { error: limit };
    }
    const { rows } = await client.query(
      `INSERT INTO decks (user_id, name, kind, video_id, transcript, sentences, sentences_hash, story_words, is_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING id`,
      [
        userId,
        snap.name,
        snap.kind,
        snap.videoId,
        snap.transcript,
        snap.sentences ? JSON.stringify(snap.sentences) : null,
        snap.sentences && snap.transcript ? transcriptHash(snap.transcript) : null,
        snap.storyWords ? JSON.stringify(snap.storyWords) : null,
      ]
    );
    const deckId = rows[0].id;
    for (const c of snap.cards) {
      const { rows: card } = await client.query(
        `INSERT INTO cards (deck_id, front, back, video_id, start_seconds, ai_translation, ai_examples, ai_trivia, ai_generated_at)
         VALUES ($1, $2, $3, $4, $5, $6::text, $7, $8,
                 CASE WHEN $6::text IS NOT NULL OR $7::jsonb IS NOT NULL OR $8::text IS NOT NULL THEN now() END)
         RETURNING id`,
        [
          deckId,
          c.front,
          c.back ?? "",
          snap.videoId,
          c.startSeconds,
          c.aiTranslation,
          c.aiExamples ? JSON.stringify(c.aiExamples) : null,
          c.aiTrivia,
        ]
      );
      await replaceCardTargets(client, card[0].id, c.targets);
    }
    await client.query("COMMIT");
    if (snap.tags?.length) await setDeckTags(deckId, snap.tags);
    return { deckId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// おためしを始めたときに呼ぶ。動画の単語帳 → 物語の単語帳の順に入れる。どちらもサンプルの印（is_sample）を付ける
export async function createStarterDecks(userId) {
  for (const snap of STARTER_VIDEO_DECKS) await insertDeckSnapshot(userId, snap);
  const story = await createStoryDeck(userId, { answer: STARTER_STORY, words: STARTER_WORDS });
  if (story.deckId) await pool.query("UPDATE decks SET is_sample = true WHERE id = $1 AND user_id = $2", [story.deckId, userId]);
}
