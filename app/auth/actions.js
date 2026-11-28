"use server";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAccount, findUserByUsername, renewRecoveryCode } from "@/lib/accounts";
import { createSession, destroyOtherSessions, destroySession, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { GUEST_BLOCKED } from "@/lib/guest";
import { burnPasswordCheck, checkPasswordRule, hashPassword, verifyPassword } from "@/lib/password";
import { hashRecoveryCode } from "@/lib/recovery";
import { checkUsernameRule, normalizeUsername } from "@/lib/username";

// ログイン後に戻る先。このアプリの中のパスだけを許す
function safeNext(raw) {
  const next = String(raw ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

const sameHash = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

// ---- ログイン・ログアウト -------------------------------------------------
export async function login(prevState, formData) {
  const username = normalizeUsername(formData.get("username"));
  const password = String(formData.get("password") ?? "");
  const keep = { username: String(formData.get("username") ?? "").trim() };
  if (!username || !password) return { ...keep, error: "ID とパスワードを入力してください" };

  // おためしユーザーは、パスワードではログインできない（パスワードの値がどれとも合わない）
  const user = await findUserByUsername(username);
  const ok = user ? await verifyPassword(password, user.password_hash) : await burnPasswordCheck(password);
  if (!ok) return { ...keep, error: "ID かパスワードが違います" };

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ---- 新規登録 -------------------------------------------------------------
// 作れたら、そのままログインし、復旧コードを一度だけ返す（画面で見せて、メモしてもらう）
export async function signup(prevState, formData) {
  const username = normalizeUsername(formData.get("username"));
  const password = String(formData.get("password") ?? "");
  const keep = { username: String(formData.get("username") ?? "").trim() };
  const ruleU = checkUsernameRule(username);
  if (ruleU) return { ...keep, error: ruleU };
  const rule = checkPasswordRule(password);
  if (rule) return { ...keep, error: rule };
  if (password !== String(formData.get("password2") ?? "")) return { ...keep, error: "確認用のパスワードが一致しません" };

  const r = await createAccount({ username, password, headers: await headers() });
  if (r.error) return { ...keep, error: r.error };
  await createSession(r.user.id);
  return { error: null, done: true, username: r.user.username, recoveryCode: r.recoveryCode };
}

// ---- パスワードを忘れたとき（復旧コードで作り直す） ---------------------------
// 合っていれば、新しいパスワードにし、ほかの端末のログインをすべて切ってログインする。
// 使った復旧コードは使えなくなり、新しいコードを一度だけ返す
export async function recoverPassword(prevState, formData) {
  const username = normalizeUsername(formData.get("username"));
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const keep = { username: String(formData.get("username") ?? "").trim() };
  if (!username || !code) return { ...keep, error: "ID と復旧コードを入力してください" };
  const rule = checkPasswordRule(password);
  if (rule) return { ...keep, error: rule };
  if (password !== String(formData.get("password2") ?? "")) return { ...keep, error: "確認用のパスワードが一致しません" };

  const user = await findUserByUsername(username);
  if (!user || user.guest_expires_at || !sameHash(user.recovery_code_hash, hashRecoveryCode(code))) {
    return { ...keep, error: "ID か復旧コードが違います" };
  }
  const client = await pool.connect();
  let newCode;
  try {
    await client.query("BEGIN");
    // 同じコードで同時に2回送られても、1回だけ通す（コードが変わっていなければ更新する）
    const { rowCount } = await client.query(
      "UPDATE users SET password_hash = $2 WHERE id = $1 AND recovery_code_hash = $3",
      [user.id, await hashPassword(password), user.recovery_code_hash]
    );
    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return { ...keep, error: "ID か復旧コードが違います" };
    }
    newCode = await renewRecoveryCode(user.id, client);
    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [user.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await createSession(user.id);
  return { error: null, done: true, username: user.username, recoveryCode: newCode };
}

// ---- アカウント ------------------------------------------------------------
export async function changePassword(prevState, formData) {
  const user = await requireUser();
  if (user.guestExpiresAt) return { error: GUEST_BLOCKED, saved: false };
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

// 復旧コードを作り直す（なくしたとき・まだ持っていないとき）。今のパスワードを確かめてから
export async function regenerateRecoveryCode(prevState, formData) {
  const user = await requireUser();
  if (user.guestExpiresAt) return { error: GUEST_BLOCKED };
  const current = String(formData.get("current") ?? "");
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
    return { error: "今のパスワードが違います" };
  }
  return { error: null, recoveryCode: await renewRecoveryCode(user.id), version: Date.now() };
}
