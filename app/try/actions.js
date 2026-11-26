"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { clientIp, createGuest, deleteGuest } from "@/lib/guest";
import { createStarterDeck } from "@/lib/starterDeck";

// おためしを始める（/try の画面から）。1日で消えることに同意してもらってから作る
export async function startGuest(prevState, formData) {
  if (await getCurrentUser()) redirect("/");
  if (formData.get("agree") !== "on") {
    return { error: "1日たつと、作ったものもすべて削除されることを確かめて、チェックを入れてください" };
  }
  const r = await createGuest({ ip: clientIp(await headers()) });
  if (r.error) return { error: r.error };
  // すぐ試せるよう、物語の単語帳を1冊入れておく（作れなくても、おためしは始める）
  try {
    await createStarterDeck(r.user.id);
  } catch (err) {
    console.error("おためしの単語帳を作れませんでした", err);
  }
  // セッションも、アカウントと同じときに切れる
  await createSession(r.user.id, { expiresAt: r.user.guestExpiresAt });
  redirect("/");
}

// おためしを終える。アカウントと作ったものを、すぐに削除する
export async function endGuest() {
  const user = await getCurrentUser();
  if (user?.guestExpiresAt) {
    await deleteGuest(user.id);
    await destroySession();
  }
  redirect("/");
}
