"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createStoryDeck, getWordPool } from "@/lib/story";
import { buildStoryPrompt, STORY_LENGTHS } from "@/lib/storyPrompt";

const MAX_WORDS = 40;
const WORD = /^[a-z]+(?:[' -][a-z]+)*$/;

// 条件に合う語を選んで、物語のプロンプトを作る
export async function makeStoryPrompt({ source, deckId, count, length, theme }) {
  const user = await requireUser();
  const src = ["learned", "learning", "both"].includes(source) ? source : "learned";
  const deck = Number(deckId) > 0 ? Number(deckId) : null;
  const n = Math.min(Math.max(Number(count) || 15, 3), MAX_WORDS);
  const pool = await getWordPool(user.id, { source: src, deckId: deck });
  if (pool.length === 0) {
    return { error: "条件に合う語がありません。「学習中の語」や「両方」も試してください" };
  }
  // 毎回ちがう組み合わせになるよう、ランダムに選ぶ
  const words = [...pool].sort(() => Math.random() - 0.5).slice(0, n).sort();
  const settings = await getSettings(user.id);
  const prompt = buildStoryPrompt({
    words,
    levelLabel: `${settings.levelLabel}（約 ${settings.vocabSize.toLocaleString()} 語）`,
    length: STORY_LENGTHS[length] ? length : "medium",
    theme: String(theme ?? "").trim().slice(0, 100),
  });
  return { error: null, prompt, words, poolSize: pool.length };
}

// 物語の答えを取り込んで、新しいデッキを作る
export async function createStory({ answer, words }) {
  const user = await requireUser();
  const text = String(answer ?? "");
  if (!text.trim()) return { error: "AI の答えを貼り付けてください" };
  if (text.length > 100_000) return { error: "貼り付けたテキストが長すぎます" };
  const list = (Array.isArray(words) ? words : [])
    .map((w) => String(w).toLowerCase())
    .filter((w) => WORD.test(w) && w.length <= 80)
    .slice(0, MAX_WORDS);
  if (list.length === 0) return { error: "先にプロンプトを作ってください" };

  const r = await createStoryDeck(user.id, { answer: text, words: list });
  if (r.error) return r;
  revalidatePath("/");
  redirect(`/decks/${r.deckId}`);
}
