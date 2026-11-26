import "server-only";
import { pool } from "./db.js";
import { guestLimitError } from "./guest.js";
import { LEARNED_BOX } from "./review.js";
import { findForm, parseAiSentences, transcriptHash } from "./sentences.js";
import { parseStoryTitle } from "./storyPrompt.js";
import { setDeckTags } from "./tags.js";
import { replaceCardTargets } from "./targets.js";
import { findGloss, sameWord } from "./transcript.js";

export const STORY_TAG = "物語";
const MAX_TARGETS_PER_CARD = 3;

// 物語に使える語（カードにした語）。source: "learned"（覚えた）/ "learning"（学習中）/ "both"
export async function getWordPool(userId, { source = "learned", deckId = null } = {}) {
  const cond =
    source === "learned"
      ? `c.review_box >= ${LEARNED_BOX}`
      : source === "learning"
        ? `c.review_box < ${LEARNED_BOX}`
        : "TRUE";
  const { rows } = await pool.query(
    `SELECT t.word, max(c.review_box) AS box, max(c.last_reviewed_at) AS last
     FROM card_targets t JOIN cards c ON c.id = t.card_id JOIN decks d ON d.id = c.deck_id
     WHERE d.user_id = $2 AND ${cond} AND ($1::int IS NULL OR c.deck_id = $1)
     GROUP BY t.word`,
    [deckId, userId]
  );
  return rows.map((r) => r.word);
}

// 語の数ごとの件数（画面に出す用）
export async function getWordPoolCounts(userId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(DISTINCT t.word) FILTER (WHERE c.review_box >= ${LEARNED_BOX})::int AS learned,
       COUNT(DISTINCT t.word) FILTER (WHERE c.review_box < ${LEARNED_BOX})::int  AS learning,
       COUNT(DISTINCT t.word)::int AS both
     FROM card_targets t JOIN cards c ON c.id = t.card_id JOIN decks d ON d.id = c.deck_id
     WHERE d.user_id = $1`,
    [userId]
  );
  return rows[0];
}

// 物語の答えから、デッキとカードを作る。戻り値: { deckId, cardCount } または { error }
export async function createStoryDeck(userId, { answer, words }) {
  const sentences = parseAiSentences(answer);
  if (sentences.length === 0) {
    return { error: "「[1] 英文」の形の行が見つかりませんでした。AI の答えをそのまま貼り付けてください" };
  }
  // おためしユーザーは、作れる量を決めている（カードは、すべての文がカードになったときの数で確かめる）
  const limit = await guestLimitError(userId, { decks: 1, cards: sentences.length });
  if (limit) return { error: limit };
  const title = parseStoryTitle(answer) || "Untitled";
  const transcript = String(answer).trim();

  const client = await pool.connect();
  let deckId;
  let cardCount = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO decks (user_id, name, kind, transcript, sentences, sentences_hash, story_words)
       VALUES ($6, $1, 'story', $2, $3, $4, $5) RETURNING id`,
      [`物語: ${title}`.slice(0, 100), transcript, JSON.stringify(sentences), transcriptHash(transcript), JSON.stringify(words), userId]
    );
    deckId = rows[0].id;

    // 使ってもらった語が入っている文を、その語を覚えたい語にしたカードにする
    for (const s of sentences) {
      const targets = [];
      for (const word of words) {
        if (targets.length >= MAX_TARGETS_PER_CARD) break;
        const form =
          findForm(s.text, { word, form: word.replace(/\s*\b(?:sth|sb)\b\s*/g, " ").trim() }) ??
          idiomFormFromGloss(s, word);
        if (!form || targets.some((t) => t.form === form)) continue;
        const gloss = findGloss(s.glosses, { form, lemma: word });
        targets.push({
          word,
          form,
          meaning: gloss?.meaning || null,
          translation_form: gloss?.ja && s.translation?.includes(gloss.ja) ? gloss.ja : null,
        });
      }
      if (targets.length === 0) continue;
      const card = await client.query(
        `INSERT INTO cards (deck_id, front, back, ai_translation, ai_generated_at)
         VALUES ($1, $2, '', $3::text, CASE WHEN $3::text IS NOT NULL THEN now() END) RETURNING id`,
        [deckId, s.text, s.translation || null]
      );
      await replaceCardTargets(client, card.rows[0].id, targets);
      cardCount += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await setDeckTags(deckId, [STORY_TAG]);
  return { deckId, cardCount };
}

// イディオム（figure sth out など）は、AI が「語句:」に書いた形（figured it out）を手がかりに探す
function idiomFormFromGloss(sentence, word) {
  if (!word.includes(" ")) return null;
  const keyWords = word.split(" ").filter((w) => w !== "sth" && w !== "sb");
  for (const g of sentence.glosses ?? []) {
    const phraseWords = g.phrase.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
    // キーの語が、順番どおりに語句の中に出てくるか
    let i = 0;
    for (const w of phraseWords) if (i < keyWords.length && sameWord(w, keyWords[i])) i += 1;
    if (i === keyWords.length && sentence.text.toLowerCase().includes(g.phrase.toLowerCase())) {
      const at = sentence.text.toLowerCase().indexOf(g.phrase.toLowerCase());
      return sentence.text.slice(at, at + g.phrase.length);
    }
  }
  return null;
}
