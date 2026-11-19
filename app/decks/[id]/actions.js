"use server";

import { revalidatePath } from "next/cache";
import { buildCardPrompt, MAX_CARDS_PER_PROMPT, NEEDS_EXPLANATION, parseCardExplanations } from "@/lib/cardPrompts";
import { ownsDeck, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { attachTargets, replaceCardTargets } from "@/lib/targets";

const MAX_TEXT = 2000;

function toId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// 解説がまだないカード（最大20枚）について、チャット AI に渡すプロンプトを作る
// このユーザーのデッキなら、その ID を返す
async function ownedDeckId(value) {
  const user = await requireUser();
  const deckId = toId(value);
  return deckId && (await ownsDeck(user.id, deckId)) ? deckId : null;
}

export async function getCardPrompt(deckIdArg) {
  const deckId = await ownedDeckId(deckIdArg);
  if (!deckId) return { error: "デッキが見つかりません" };
  const { rows } = await pool.query(
    `SELECT id, front, target_form, target_word, ai_meaning, ai_translation_form FROM cards
     WHERE deck_id = $1 AND ${NEEDS_EXPLANATION} ORDER BY id LIMIT $2`,
    [deckId, MAX_CARDS_PER_PROMPT]
  );
  if (rows.length === 0) return { error: "解説が足りないカードはありません" };
  const cards = await attachTargets(rows);
  return { error: null, prompt: buildCardPrompt(cards), count: cards.length };
}

// チャット AI の答えを読み取って、カードに保存する
export async function importCardExplanations(deckIdArg, text) {
  const deckId = await ownedDeckId(deckIdArg);
  if (!deckId) return { error: "デッキが見つかりません" };
  if (String(text ?? "").length > 200_000) return { error: "貼り付けたテキストが長すぎます" };

  const parsed = parseCardExplanations(text);
  if (parsed.size === 0) {
    return { error: "「### 番号」で始まる解説が見つかりませんでした。AI の答えをそのまま貼り付けてください" };
  }

  // このデッキのカードだけを更新する
  const { rows } = await pool.query(
    "SELECT id, ai_translation, target_word, target_form, ai_meaning, ai_translation_form FROM cards WHERE deck_id = $1",
    [deckId]
  );
  const cards = new Map((await attachTargets(rows)).map((c) => [c.id, c]));
  const clip = (t) => String(t ?? "").trim().slice(0, MAX_TEXT);
  const norm = (t) => String(t ?? "").toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
  let saved = 0;
  let skipped = 0;
  for (const [id, ex] of parsed) {
    const card = cards.get(id);
    if (!card || !(ex.translation || ex.meaning || ex.trivia || ex.examples.length)) {
      skipped += 1;
      continue;
    }
    // 和訳の対応部分は、（新しい、または今の）和訳の中に実際にあるときだけ使う
    const translation = clip(ex.translation) || card.ai_translation || "";
    const inTranslation = (f) => (f && translation.includes(f) ? f : null);

    // 覚えたい語ごとの「意味」「対応」。「語句 = 内容」で書かれていれば語句で対応づけ、なければ1つ目の語に入れる
    const targets = card.targets.map((t, i) => {
      const pick = (key) => {
        const hit = ex.perTarget.find(
          (p) => p.key === key && [norm(t.form), norm(t.word?.replace(/\b(?:sth|sb)\b/g, ""))].includes(norm(p.phrase))
        );
        if (hit) return hit.value;
        return i === 0 && !ex.perTarget.some((p) => p.key === key) ? ex[key] : "";
      };
      return {
        ...t,
        meaning: clip(pick("meaning")) || t.meaning,
        translation_form: inTranslation(clip(pick("translationForm"))) ?? (ex.translation ? null : t.translation_form),
      };
    });

    await pool.query(
      `UPDATE cards SET ai_translation = COALESCE($2, ai_translation),
         ai_examples = COALESCE($3, ai_examples), ai_trivia = COALESCE($4, ai_trivia), ai_generated_at = now()
       WHERE id = $1 AND deck_id = $5`,
      [
        id,
        clip(ex.translation) || null,
        ex.examples.length ? JSON.stringify(ex.examples.slice(0, 5).map((e) => ({ en: clip(e.en), ja: clip(e.ja) }))) : null,
        clip(ex.trivia) || null,
        deckId,
      ]
    );
    if (targets.length) await replaceCardTargets(pool, id, targets);
    saved += 1;
  }
  revalidatePath(`/decks/${deckId}`);
  return { error: null, saved, skipped };
}

// 選んだカードをまとめて削除する（このデッキのカードだけ）
export async function deleteCards(deckIdArg, cardIds) {
  const deckId = await ownedDeckId(deckIdArg);
  if (!deckId) return { error: "デッキが見つかりません" };
  const ids = (Array.isArray(cardIds) ? cardIds : []).map(toId).filter(Boolean);
  if (ids.length === 0) return { error: "削除するカードを選んでください" };
  if (ids.length > 1000) return { error: "一度に削除できるのは1000枚までです" };
  const { rowCount } = await pool.query("DELETE FROM cards WHERE deck_id = $1 AND id = ANY($2::int[])", [deckId, ids]);
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/");
  return { error: null, deleted: rowCount };
}
