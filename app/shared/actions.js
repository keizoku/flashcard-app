"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { copyPublicDeck } from "@/lib/sharing";

// 公開中のデッキを、自分のデッキとして取り込む（その時点の内容をコピーする）
export async function importSharedDeck(deckIdArg) {
  const user = await requireUser();
  const deckId = Number(deckIdArg);
  if (!Number.isSafeInteger(deckId) || deckId <= 0) return { error: "この単語帳は公開されていません" };
  const result = await copyPublicDeck(user.id, deckId);
  if (result.error) return result;
  revalidatePath("/");
  revalidatePath("/shared");
  redirect(`/decks/${result.deckId}?notice=imported`);
}
