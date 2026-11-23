"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ownsDeck, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { dismissOnboardingFor, getOnboarding } from "@/lib/onboarding";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/transcript";
import { parseTags, setDeckTags } from "@/lib/tags";
import { fetchVideoTitle } from "@/lib/videoTitle";
import { parseVideoId } from "@/lib/youtube";

const MAX_LENGTH = 500;
const MAX_DECK_NAME_LENGTH = 100;

// デッキを1つ作る（トップ画面のフォームから呼ばれる）
// YouTube の URL と字幕は任意。入れておくと、例文を探すときに毎回貼り付けなくてよい
export async function addDeck(prevState, formData) {
  const user = await requireUser();
  let name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const transcript = String(formData.get("transcript") ?? "").trim();
  const tags = parseTags(formData.get("tags"));
  const keep = { name, url, transcript, tags, version: Date.now() };

  const videoId = url ? parseVideoId(url) : null;
  if (url && !videoId) return { ...keep, error: "YouTube の URL を読み取れませんでした" };
  // デッキ名が空なら、動画のタイトルを使う
  if (!name && videoId) name = (await fetchVideoTitle(videoId)) ?? "";
  if (!name) return { ...keep, error: "デッキ名を入力してください" };
  if (name.length > MAX_DECK_NAME_LENGTH) {
    return { ...keep, error: `デッキ名は${MAX_DECK_NAME_LENGTH}文字以内で入力してください` };
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return { ...keep, error: `字幕が長すぎます（${MAX_TRANSCRIPT_LENGTH.toLocaleString()} 文字まで）` };
  }

  const { rows } = await pool.query(
    "INSERT INTO decks (user_id, name, video_id, transcript) VALUES ($4, $1, $2, $3) RETURNING id",
    [name, videoId, transcript || null, user.id]
  );

  if (tags.length) await setDeckTags(rows[0].id, tags);

  revalidatePath("/");
  // 作ったデッキへ移る。字幕があれば、そのまま例文を探す画面へ。
  // はじめの4ステップの途中なら、字幕がなくても字幕を貼る画面へ（次のステップに迷わないように）
  const guiding = !transcript && (await getOnboarding(user.id)).show;
  redirect(transcript || guiding ? `/decks/${rows[0].id}/import` : `/decks/${rows[0].id}`);
}

// カードを1枚追加する（デッキ画面のフォームから呼ばれる）
// deckId はフォーム側で bind して渡す
export async function addCard(deckIdArg, prevState, formData) {
  const user = await requireUser();
  const deckId = Number(deckIdArg);
  if (!Number.isSafeInteger(deckId) || deckId <= 0 || !(await ownsDeck(user.id, deckId))) {
    return { error: "このデッキは見つかりません", front: "", back: "", version: Date.now() };
  }

  const front = String(formData.get("front") ?? "").trim();
  const back = String(formData.get("back") ?? "").trim();

  if (!front || !back) {
    return { error: "表と裏の両方を入力してください", front, back, version: Date.now() };
  }
  if (front.length > MAX_LENGTH || back.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}文字以内で入力してください`, front, back, version: Date.now() };
  }

  // 存在するデッキにだけ追加する（消されたデッキなどへの追加を防ぐ）
  const { rowCount } = await pool.query(
    "INSERT INTO cards (deck_id, front, back) SELECT id, $2, $3 FROM decks WHERE id = $1",
    [deckId, front, back]
  );
  if (rowCount === 0) {
    return { error: "このデッキは見つかりません", front, back, version: Date.now() };
  }

  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/");
  return { error: null, front: "", back: "", version: Date.now() };
}

// 選んだデッキをまとめて削除する（中のカードも一緒に消える）
export async function deleteDecks(deckIds) {
  const user = await requireUser();
  const ids = (Array.isArray(deckIds) ? deckIds : [])
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  if (ids.length === 0) return { error: "削除するデッキを選んでください" };
  if (ids.length > 1000) return { error: "一度に削除できるのは1000個までです" };
  const { rowCount } = await pool.query("DELETE FROM decks WHERE id = ANY($1::int[]) AND user_id = $2", [ids, user.id]);
  revalidatePath("/");
  return { error: null, deleted: rowCount };
}

// YouTube の URL から動画のタイトルを取る（デッキ名の自動入力用）
export async function getVideoTitle(url) {
  await requireUser();
  const videoId = parseVideoId(url);
  if (!videoId) return { title: null };
  return { title: await fetchVideoTitle(videoId) };
}

// トップの「はじめの4ステップ」を閉じる（自分の分だけ）
export async function dismissOnboarding() {
  const user = await requireUser();
  await dismissOnboardingFor(user.id);
  revalidatePath("/");
}
