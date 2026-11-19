"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { findLevel, MAX_VOCAB_SIZE, MIN_VOCAB_SIZE } from "@/lib/levels";

export async function saveSettings(prevState, formData) {
  const user = await requireUser();
  const level = findLevel(String(formData.get("level") ?? ""));
  if (!level) return { error: "レベルを選んでください", saved: false };

  let vocabSize = level.vocabSize;
  if (level.key === "custom") {
    vocabSize = Number(formData.get("vocabSize"));
    if (!Number.isInteger(vocabSize) || vocabSize < MIN_VOCAB_SIZE || vocabSize > MAX_VOCAB_SIZE) {
      return {
        error: `語彙数は ${MIN_VOCAB_SIZE.toLocaleString()}〜${MAX_VOCAB_SIZE.toLocaleString()} の整数で入力してください`,
        saved: false,
      };
    }
  }

  await pool.query(
    `INSERT INTO settings (user_id, level_key, vocab_size) VALUES ($3, $1, $2)
     ON CONFLICT (user_id) DO UPDATE SET level_key = EXCLUDED.level_key, vocab_size = EXCLUDED.vocab_size`,
    [level.key, vocabSize, user.id]
  );
  revalidatePath("/", "layout");
  return { error: null, saved: true };
}

// 「知ってる」に登録した単語を取り消す
export async function forgetKnownWord(word) {
  const user = await requireUser();
  const w = String(word ?? "");
  if (!w || w.length > 80) return { error: "単語が正しくありません" };
  await pool.query("DELETE FROM known_words WHERE word = $1 AND user_id = $2", [w, user.id]);
  revalidatePath("/settings");
  return { error: null };
}
