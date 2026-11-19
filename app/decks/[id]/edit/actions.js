"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { setDeckPublished } from "@/lib/sharing";
import { parseTags, setDeckTags } from "@/lib/tags";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/transcript";
import { parseVideoId } from "@/lib/youtube";

const MAX_DECK_NAME_LENGTH = 100;

function toId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// デッキの名前・動画・字幕を変更する
export async function updateDeck(deckIdArg, prevState, formData) {
  const user = await requireUser();
  const deckId = toId(deckIdArg);
  if (!deckId) return { error: "デッキが見つかりません" };

  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const transcript = String(formData.get("transcript") ?? "").trim();

  if (!name) return { error: "デッキ名を入力してください" };
  if (name.length > MAX_DECK_NAME_LENGTH) return { error: `デッキ名は${MAX_DECK_NAME_LENGTH}文字以内で入力してください` };
  const videoId = url ? parseVideoId(url) : null;
  if (url && !videoId) return { error: "YouTube の URL を読み取れませんでした" };
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return { error: `字幕が長すぎます（${MAX_TRANSCRIPT_LENGTH.toLocaleString()} 文字まで）` };
  }

  const { rowCount } = await pool.query(
    "UPDATE decks SET name = $2, video_id = $3, transcript = $4 WHERE id = $1 AND user_id = $5",
    [deckId, name, videoId, transcript || null, user.id]
  );
  if (rowCount === 0) return { error: "デッキが見つかりません" };
  await setDeckTags(deckId, parseTags(formData.get("tags")));

  revalidatePath("/");
  redirect(`/decks/${deckId}`);
}

// デッキを削除する（中のカードも一緒に消える）
export async function deleteDeck(deckIdArg) {
  const user = await requireUser();
  const deckId = toId(deckIdArg);
  if (!deckId) return { error: "デッキが見つかりません" };
  await pool.query("DELETE FROM decks WHERE id = $1 AND user_id = $2", [deckId, user.id]);
  revalidatePath("/");
  redirect("/");
}

// デッキを公開する / 公開をやめる（みんなのデッキに出す）
export async function setPublished(deckIdArg, publish) {
  const user = await requireUser();
  const deckId = toId(deckIdArg);
  if (!deckId) return { error: "デッキが見つかりません" };
  const result = await setDeckPublished(user.id, deckId, Boolean(publish));
  if (result.error) return result;
  revalidatePath(`/decks/${deckId}`);
  revalidatePath(`/decks/${deckId}/edit`);
  revalidatePath("/shared");
  return { ok: true, published: Boolean(publish) };
}
