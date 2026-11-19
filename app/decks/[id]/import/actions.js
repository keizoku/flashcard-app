"use server";

import { revalidatePath } from "next/cache";
import { ownsDeck, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { analyzeWithState, loadContext } from "@/lib/comprehension";
import { buildSentencePrompts, parseAiSentences, saveSentences } from "@/lib/sentences";
import { replaceCardTargets } from "@/lib/targets";
import { MAX_STAGE, MAX_TRANSCRIPT_LENGTH, parseSegments } from "@/lib/transcript";
import { parseVideoId } from "@/lib/youtube";

const MAX_TEXT_LENGTH = 500;
const MAX_ITEMS = 200;

// 字幕を解析して i+1 の候補を返す。字幕と URL はデッキに保存する
// このユーザーのデッキなら、その ID を返す
async function ownedDeck(value) {
  const user = await requireUser();
  const deckId = Number(value);
  if (!Number.isSafeInteger(deckId) || deckId <= 0 || !(await ownsDeck(user.id, deckId))) return { user, deckId: null };
  return { user, deckId };
}

export async function analyzeTranscript({ deckId: deckIdArg, text, url }) {
  const { user, deckId } = await ownedDeck(deckIdArg);
  if (!deckId) return { error: "このデッキは見つかりません" };

  const transcript = String(text ?? "").trim();
  if (!transcript) return { error: "字幕のテキストを貼り付けてください" };
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return { error: `字幕が長すぎます（${MAX_TRANSCRIPT_LENGTH.toLocaleString()} 文字まで）` };
  }

  let videoId = null;
  if (String(url ?? "").trim()) {
    videoId = parseVideoId(url);
    if (!videoId) return { error: "YouTube の URL を読み取れませんでした" };
  }

  const { rowCount } = await pool.query(
    "UPDATE decks SET video_id = $2, transcript = $3 WHERE id = $1",
    [deckId, videoId, transcript]
  );
  if (rowCount === 0) return { error: "このデッキは見つかりません" };

  return analyzeSaved(user.id, deckId, transcript, videoId);
}

// 保存済みの字幕（と、AI で整えた文があればそれ）で、i+1・i+2・i+3 の文を探す
async function analyzeSaved(userId, deckId, transcript, videoId, extra = {}) {
  const result = await analyzeWithState(deckId, transcript, await loadContext(userId));
  const { settings } = result;
  return {
    error: null,
    videoId,
    // 句読点のある字幕でも、言い直しや意味の通らない文を直したり、和訳を付けたりできるよう、いつも用意する
    sentencePrompts:
      transcript
        ? buildSentencePrompts(
            parseSegments(transcript),
            `${settings.levelLabel}（約 ${settings.vocabSize.toLocaleString()} 語）`
          )
        : null,
    ...extra,
    stages: result.stages,
    comprehension: result.comprehension,
    stats: result.stats,
    mode: result.mode,
  };
}

// チャット AI で整えた文（"[0:06] It's simply ..." の行）を取り込む
export async function importSentences({ deckId: deckIdArg, text }) {
  const { user, deckId } = await ownedDeck(deckIdArg);
  if (!deckId) return { error: "このデッキは見つかりません" };
  if (String(text ?? "").length > MAX_TRANSCRIPT_LENGTH) return { error: "貼り付けたテキストが長すぎます" };

  const sentences = parseAiSentences(text);
  if (sentences.length === 0) {
    return { error: "「[0:06] 文」の形の行が見つかりませんでした。AI の答えをそのまま貼り付けてください" };
  }

  const { rows } = await pool.query("SELECT video_id, transcript FROM decks WHERE id = $1", [deckId]);
  const deck = rows[0];
  if (!deck) return { error: "このデッキは見つかりません" };

  // 元の字幕がなければ、整えた文をそのまま字幕として保存する
  let transcript = deck.transcript;
  if (!transcript) {
    transcript = String(text).trim();
    await pool.query("UPDATE decks SET transcript = $2 WHERE id = $1", [deckId, transcript]);
  }
  const updatedCards = await saveSentences(deckId, transcript, sentences);
  revalidatePath(`/decks/${deckId}`);
  return analyzeSaved(user.id, deckId, transcript, deck.video_id, { imported: sentences.length, updatedCards });
}

// 単語の原形、またはイディオムのキー（figure sth out など）として正しい形か
const TARGET = /^[a-z]+(?:[' -][a-z]+)*$/;

// 「この単語（イディオム）は知っている」と登録する
export async function markKnown(word) {
  const user = await requireUser();
  const w = String(word ?? "").toLowerCase();
  if (!TARGET.test(w) || w.length > 80) return { error: "単語が正しくありません" };
  await pool.query("INSERT INTO known_words (user_id, word) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.id, w]);
  return { error: null };
}

// 選んだ文をカードとして登録する。1つの文に覚えたい語が複数あれば（i+2、i+3）、1枚のカードにまとめる
export async function registerCards({ deckId: deckIdArg, items }) {
  const { deckId } = await ownedDeck(deckIdArg);
  if (!deckId) return { error: "このデッキは見つかりません" };
  if (!Array.isArray(items) || items.length === 0) return { error: "登録する文を選んでください" };
  if (items.length > MAX_ITEMS) return { error: `一度に登録できるのは ${MAX_ITEMS} 枚までです` };

  const cards = [];
  for (const item of items) {
    const sentence = String(item?.sentence ?? "").trim();
    const back = String(item?.back ?? "").trim();
    const start = item?.start;
    const translation = String(item?.translation ?? "").trim().slice(0, 2000);
    if (!sentence || sentence.length > MAX_TEXT_LENGTH || back.length > MAX_TEXT_LENGTH) {
      return { error: `文と意味・訳は ${MAX_TEXT_LENGTH} 文字以内にしてください` };
    }
    if (start !== null && !(Number.isInteger(start) && start >= 0)) {
      return { error: "登録するデータが正しくありません" };
    }
    const rawTargets = Array.isArray(item?.targets) ? item.targets : [];
    if (rawTargets.length === 0 || rawTargets.length > MAX_STAGE) return { error: "登録するデータが正しくありません" };
    const targets = [];
    for (const t of rawTargets) {
      const form = String(t?.form ?? "");
      const word = String(t?.lemma ?? "").toLowerCase();
      const translationForm = String(t?.translationForm ?? "").trim();
      if (!form || !sentence.includes(form) || !TARGET.test(word) || word.length > 80) {
        return { error: "登録するデータが正しくありません" };
      }
      targets.push({
        word,
        form,
        meaning: String(t?.meaning ?? "").trim().slice(0, 2000),
        translation_form: translationForm && translation.includes(translationForm) ? translationForm : null,
      });
    }
    cards.push({ sentence, back, start, translation, targets });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 動画 ID はデッキに保存されたものを使う
    const deck = await client.query("SELECT video_id FROM decks WHERE id = $1 FOR SHARE", [deckId]);
    if (deck.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "このデッキは見つかりません" };
    }
    const vid = deck.rows[0].video_id;
    for (const c of cards) {
      const hasAi = Boolean(c.translation || c.targets.some((t) => t.meaning));
      const inserted = await client.query(
        `INSERT INTO cards (deck_id, front, back, video_id, start_seconds, ai_translation, ai_generated_at)
         VALUES ($1, $2, $3, $4, $5, $6::text, CASE WHEN $7::boolean THEN now() END)
         RETURNING id`,
        [deckId, c.sentence, c.back, vid, c.start, c.translation || null, hasAi]
      );
      await replaceCardTargets(client, inserted.rows[0].id, c.targets);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/");
  return { error: null, count: cards.length };
}
