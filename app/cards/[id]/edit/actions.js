"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ownsCard, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { replaceCardTargets } from "@/lib/targets";

const MAX_TEXT = 500;
const MAX_LONG_TEXT = 2000;
const TARGET = /^[a-z]+(?:[' -][a-z]+)*$/;

function toId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// 「英文 | 和訳」の行を例文の配列にする
function parseExamples(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [en, ...rest] = line.split("|");
      return { en: en.trim(), ja: rest.join("|").trim() };
    })
    .filter((ex) => ex.en);
}

// このユーザーのカードなら、その ID を返す
async function ownedCardId(value) {
  const user = await requireUser();
  const cardId = toId(value);
  return cardId && (await ownsCard(user.id, cardId)) ? cardId : null;
}

export async function updateCard(cardIdArg, prevState, formData) {
  const cardId = await ownedCardId(cardIdArg);
  if (!cardId) return { error: "カードが見つかりません" };

  const get = (name) => String(formData.get(name) ?? "").trim();
  const front = get("front");
  const back = get("back");
  const translation = get("ai_translation");
  const trivia = get("ai_trivia");
  const examples = parseExamples(formData.get("ai_examples"));

  if (!front) return { error: "表（例文）を入力してください" };
  if (front.length > MAX_TEXT || back.length > MAX_TEXT) return { error: `表と裏は${MAX_TEXT}文字以内にしてください` };
  // 覚えたい語（複数）
  let rawTargets = [];
  try {
    rawTargets = JSON.parse(get("targets") || "[]");
  } catch {
    return { error: "覚えたい語を読み取れませんでした" };
  }
  const targets = [];
  for (const t of Array.isArray(rawTargets) ? rawTargets.slice(0, 3) : []) {
    const form = String(t?.form ?? "").trim();
    const word = String(t?.word ?? "").trim().toLowerCase();
    if (!form && !word) continue; // 空の行は無視
    if (!form || !front.includes(form)) return { error: `「${form || "（空）"}」は、表の文の中にある形のまま入力してください` };
    if (!TARGET.test(word) || word.length > 80) {
      return { error: "見出しは英語の小文字で入力してください（例: run、figure sth out）" };
    }
    const meaning = String(t?.meaning ?? "").trim().slice(0, MAX_LONG_TEXT);
    const tf = String(t?.translation_form ?? "").trim();
    if (tf && !translation.includes(tf)) {
      return { error: `「${tf}」は、和訳の中にある文字のまま入力してください` };
    }
    targets.push({ word, form, meaning, translation_form: tf || null });
  }
  if ([translation, trivia].some((t) => t.length > MAX_LONG_TEXT)) {
    return { error: `AI の解説は${MAX_LONG_TEXT}文字以内にしてください` };
  }
  if (examples.length > 10) return { error: "例文は10個までにしてください" };

  const hasAi = Boolean(translation || trivia || examples.length || targets.some((t) => t.meaning));
  const { rows } = await pool.query(
    `UPDATE cards SET front = $2, back = $3,
       ai_translation = $4, ai_examples = $5, ai_trivia = $6,
       ai_generated_at = CASE WHEN $7 THEN COALESCE(ai_generated_at, now()) ELSE NULL END
     WHERE id = $1 RETURNING deck_id`,
    [
      cardId, front, back,
      translation || null, examples.length ? JSON.stringify(examples) : null, trivia || null,
      hasAi,
    ]
  );
  if (rows[0]) await replaceCardTargets(pool, cardId, targets);
  if (!rows[0]) return { error: "カードが見つかりません" };

  revalidatePath(`/decks/${rows[0].deck_id}`);
  redirect(`/decks/${rows[0].deck_id}`);
}

export async function deleteCard(cardIdArg) {
  const cardId = await ownedCardId(cardIdArg);
  if (!cardId) return { error: "カードが見つかりません" };
  const { rows } = await pool.query("DELETE FROM cards WHERE id = $1 RETURNING deck_id", [cardId]);
  if (!rows[0]) return { error: "カードが見つかりません" };
  revalidatePath(`/decks/${rows[0].deck_id}`);
  revalidatePath("/");
  return { error: null, deckId: rows[0].deck_id };
}
