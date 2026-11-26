"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isHttpsApp } from "@/lib/appUrl";
import { createSession, requireUser } from "@/lib/auth";
import { GUEST_BLOCKED } from "@/lib/guest";
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyLogin,
  finishPasskeyRegistration,
} from "@/lib/passkeys";

// パスキーの登録・ログイン・削除（画面の部品 app/auth/PasskeyButtons.js から呼ぶ）。
// 合言葉（challenge）の場所を示す値は、この Cookie に入れる（5分。JavaScript からは読めない）
const CHALLENGE_COOKIE = "flashcard_passkey";

async function setChallengeCookie(token) {
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttpsApp(),
    path: "/",
    maxAge: 5 * 60,
  });
}

async function takeChallengeCookie() {
  const store = await cookies();
  const token = store.get(CHALLENGE_COOKIE)?.value ?? null;
  store.delete(CHALLENGE_COOKIE);
  return token;
}

// ログイン後に戻る先。このアプリの中のパスだけを許す
function safeNext(raw) {
  const next = String(raw ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

// ---- 登録（アカウントの画面） ----
// おためしユーザーは、パスキーを登録できない（{ error } を返す）
export async function startPasskeyRegistration() {
  const user = await requireUser();
  if (user.guestExpiresAt) return { error: GUEST_BLOCKED };
  const { options, token } = await beginPasskeyRegistration(user);
  await setChallengeCookie(token);
  return options;
}

export async function completePasskeyRegistration(response, name) {
  const user = await requireUser();
  if (user.guestExpiresAt) return { error: GUEST_BLOCKED };
  const r = await finishPasskeyRegistration(user.id, await takeChallengeCookie(), response, name);
  return r.error ? { error: r.error } : {};
}

export async function removePasskey(id) {
  const user = await requireUser();
  const { deleted } = await deletePasskey(user.id, id);
  return { error: deleted ? null : "パスキーが見つかりません" };
}

// ---- ログイン（ログインの画面） ----
export async function startPasskeyLogin() {
  const { options, token } = await beginPasskeyLogin();
  await setChallengeCookie(token);
  return options;
}

// うまくいけば、ログインして元の画面へ移る。だめなら { error }
export async function completePasskeyLogin(response, next) {
  const r = await finishPasskeyLogin(await takeChallengeCookie(), response);
  if (r.error) return { error: r.error };
  await createSession(r.userId);
  redirect(safeNext(next));
}
