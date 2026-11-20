"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { addManualStudyTime, deleteManualStudyTime } from "@/lib/studyTime";

// 勉強時間を手で足す（アプリの外で聞いた時間など）
export async function addStudyTime(prevState, formData) {
  const user = await requireUser();
  const text = String(formData.get("minutes") ?? "").trim();
  const minutes = /^\d+$/.test(text) ? Number(text) : NaN;
  const result = await addManualStudyTime(user.id, { kind: String(formData.get("kind") ?? ""), minutes });
  if (result.error) return { error: result.error, saved: false };
  revalidatePath("/stats");
  return { error: null, saved: true };
}

// 手で足した記録を消す
export async function removeStudyTime(id) {
  const user = await requireUser();
  const result = await deleteManualStudyTime(user.id, Number(id));
  if (result.ok) revalidatePath("/stats");
  return result;
}
