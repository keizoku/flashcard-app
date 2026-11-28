"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { TERMS_VERSION } from "@/lib/terms";

// 利用規約に同意する（/agree の画面から）。ログイン中の本人の分だけを記録する
export async function agreeToTerms(prevState, formData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (formData.get("terms") !== "on") {
    return { error: "利用規約を読んで、同意のチェックを入れてください" };
  }
  await pool.query("UPDATE users SET terms_version = $2, terms_agreed_at = now() WHERE id = $1", [user.id, TERMS_VERSION]);
  redirect("/");
}
