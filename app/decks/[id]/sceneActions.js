"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deleteSceneImage, generateSceneImage, updateScenePrompt } from "@/lib/scenes";

// 物語の場面の絵の操作（デッキの画面から）

export async function updatePrompt(sceneId, prompt) {
  const user = await requireUser();
  return updateScenePrompt(user.id, Number(sceneId), prompt);
}

// 無料の画像生成サービスで絵を作る（数秒〜数十秒かかる）
export async function generateImage(sceneId) {
  const user = await requireUser();
  const result = await generateSceneImage(user.id, Number(sceneId));
  if (result.ok) revalidatePath("/decks/[id]", "page");
  return result;
}

export async function removeImage(sceneId) {
  const user = await requireUser();
  const result = await deleteSceneImage(user.id, Number(sceneId));
  if (result.ok) revalidatePath("/decks/[id]", "page");
  return result;
}
