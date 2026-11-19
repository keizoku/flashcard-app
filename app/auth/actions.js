"use server";

import { redirect } from "next/navigation";
import {
  activateUser,
  consumeEmailToken,
  findUserByEmail,
  normalizeEmail,
  sendAlreadyRegisteredMail,
  sendResetMail,
  sendVerifyMail,
  sentRecently,
} from "@/lib/accounts";
import { createSession, destroyOtherSessions, destroySession, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { burnPasswordCheck, checkPasswordRule, hashPassword, verifyPassword } from "@/lib/password";

const MAIL_ERROR = "メールを送れませんでした。しばらくしてからもう一度お試しください";

// ログイン後に戻る先。このアプリの中のパスだけを許す
function safeNext(raw) {
  const next = String(raw ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

// ---- ログイン・ログアウト -------------------------------------------------
export async function login(prevState, formData) {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const keep = { email: String(formData.get("email") ?? "").trim() };
  if (!email || !password) return { ...keep, error: "メールアドレスとパスワードを入力してください" };

  const user = await findUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.password_hash) : await burnPasswordCheck(password);
  if (!ok) return { ...keep, error: "メールアドレスかパスワードが違います" };
  if (!user.verified_at) {
    return { ...keep, error: "まだ登録が完了していません。届いたメールのリンクを開いてください", unverified: true };
  }

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ---- 新規登録 -------------------------------------------------------------
// 登録済みかどうかが画面からわからないよう、どの場合も「メールを送りました」と表示する
export async function signup(prevState, formData) {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const keep = { email: String(formData.get("email") ?? "").trim() };
  if (!email) return { ...keep, error: "メールアドレスを正しく入力してください" };
  const rule = checkPasswordRule(password);
  if (rule) return { ...keep, error: rule };
  if (password !== String(formData.get("password2") ?? "")) return { ...keep, error: "確認用のパスワードが一致しません" };

  const existing = await findUserByEmail(email);
  let sent = true;
  if (existing?.verified_at) {
    // 本人にだけ「登録済みです」と知らせる
    if (!(await sentRecently(existing.id, "verify"))) sent = await sendAlreadyRegisteredMail(existing);
  } else if (existing) {
    // まだ有効になっていない登録は、新しいパスワードで登録し直して、確認メールを送り直す
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [existing.id, await hashPassword(password)]);
    if (!(await sentRecently(existing.id, "verify"))) sent = await sendVerifyMail(existing);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING id, email`,
      [email, await hashPassword(password)]
    );
    if (rows[0]) sent = await sendVerifyMail(rows[0]);
  }
  if (!sent) return { ...keep, error: MAIL_ERROR };
  return { email, error: null, sent: true };
}

// 確認メールを送り直す（まだ登録が完了していない人だけ）
export async function resendVerify(prevState, formData) {
  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "メールアドレスを正しく入力してください", email: String(formData.get("email") ?? "") };
  const user = await findUserByEmail(email);
  if (user && !user.verified_at && !(await sentRecently(user.id, "verify"))) {
    if (!(await sendVerifyMail(user))) return { error: MAIL_ERROR, email };
  }
  return { error: null, email, sent: true };
}

// ---- パスワードを忘れたとき ------------------------------------------------
export async function requestReset(prevState, formData) {
  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "メールアドレスを正しく入力してください", email: String(formData.get("email") ?? "") };
  const user = await findUserByEmail(email);
  if (user && !(await sentRecently(user.id, "reset"))) {
    if (!(await sendResetMail(user))) return { error: MAIL_ERROR, email };
  }
  return { error: null, email, sent: true };
}

// メールのリンクから、新しいパスワードを設定する。設定したらそのままログインする
export async function resetPassword(token, prevState, formData) {
  const password = String(formData.get("password") ?? "");
  const rule = checkPasswordRule(password);
  if (rule) return { error: rule };
  if (password !== String(formData.get("password2") ?? "")) return { error: "確認用のパスワードが一致しません" };

  const hash = await hashPassword(password);
  const client = await pool.connect();
  let userId;
  try {
    await client.query("BEGIN");
    userId = await consumeEmailToken(client, token, "reset");
    if (!userId) {
      await client.query("ROLLBACK");
      return { error: "リンクの期限が切れているか、すでに使われています。もう一度メールを送ってください", expired: true };
    }
    await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, hash]);
    // リンクを開けた = メールアドレスの持ち主なので、登録が未完了ならここで完了にする
    await activateUser(client, userId);
    // ほかの端末のログインは、すべて切る
    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await createSession(userId);
  redirect("/?notice=password-reset");
}

// ---- アカウント ------------------------------------------------------------
export async function changePassword(prevState, formData) {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
    return { error: "今のパスワードが違います", saved: false };
  }
  const rule = checkPasswordRule(password);
  if (rule) return { error: rule, saved: false };
  if (password !== String(formData.get("password2") ?? "")) {
    return { error: "確認用のパスワードが一致しません", saved: false };
  }
  await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, await hashPassword(password)]);
  // この端末以外のログインは切る
  await destroyOtherSessions(user.id);
  return { error: null, saved: true, version: Date.now() };
}
