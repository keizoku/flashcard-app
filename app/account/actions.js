"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setDisplayName } from "@/lib/sharing";

// 表示名を変える（公開したデッキに、作った人として出る）
export async function updateDisplayName(prevState, formData) {
  const user = await requireUser();
  const result = await setDisplayName(user.id, formData.get("displayName"));
  if (result.error) return { error: result.error, saved: false };
  revalidatePath("/shared");
  return { error: null, saved: true, name: result.name };
}
