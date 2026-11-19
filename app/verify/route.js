import { NextResponse } from "next/server";
import { activateUser, consumeEmailToken } from "@/lib/accounts";
import { createSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { appUrl } from "@/lib/mail";

// 確認メールのリンク（/verify?token=...）。開くと登録が完了し、そのままログインする
export async function GET(request) {
  const token = request.nextUrl.searchParams.get("token");
  const client = await pool.connect();
  let userId;
  try {
    await client.query("BEGIN");
    userId = await consumeEmailToken(client, token, "verify");
    if (userId) await activateUser(client, userId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // 転送先は APP_URL で作る（コンテナの中から見たホスト名 0.0.0.0 に飛ばないように）
  if (!userId) return NextResponse.redirect(appUrl("/resend?expired=1"));
  await createSession(userId);
  return NextResponse.redirect(appUrl("/?notice=welcome"));
}
