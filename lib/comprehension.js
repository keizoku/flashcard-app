import "server-only";
import { pool } from "./db.js";
import { getSavedSentences } from "./sentences.js";
import { getSettings, getWordState } from "./settings.js";
import { analyzeTranscript } from "./transcript.js";

// 今の設定と学習の状態で、字幕を解析する（候補の段階と理解度）
//   ctx: loadContext(userId) の結果
export async function analyzeWithState(deckId, transcript, ctx) {
  const { settings, words } = ctx;
  const sentences = await getSavedSentences(deckId, transcript);
  return {
    settings,
    ...analyzeTranscript(transcript, { vocabSize: settings.vocabSize, ...words }, { sentences }),
  };
}

export async function loadContext(userId) {
  const [settings, words] = await Promise.all([getSettings(userId), getWordState(userId)]);
  return { settings, words };
}

// 字幕のあるデッキの理解度（デッキ ID → comprehension）。字幕がないデッキは入らない
export async function getComprehensionByDeck(userId) {
  const ctx = await loadContext(userId);
  const { rows } = await pool.query(
    "SELECT id, transcript FROM decks WHERE user_id = $1 AND transcript IS NOT NULL AND kind = 'video'",
    [userId]
  );
  const result = new Map();
  for (const d of rows) {
    const r = await analyzeWithState(d.id, d.transcript, ctx);
    result.set(d.id, r.comprehension);
  }
  return result;
}
