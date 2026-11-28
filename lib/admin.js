// 管理者（ユーザーの数・使われ方の集計を見られる人）を、メールアドレスで決める（環境変数 ADMIN_EMAILS、カンマ区切り）。
// 決めていなければ（空なら）、だれも管理者でない。おためしユーザーは管理者にしない
import { notFound } from "next/navigation";
import { requireUser } from "./auth";

function adminList() {
  return String(process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// user: getCurrentUser() の値（{ email, guestExpiresAt }）か null
export function isAdmin(user) {
  if (!user || user.guestExpiresAt) return false;
  return adminList().includes(String(user.email ?? "").trim().toLowerCase());
}

// 管理者の画面で使う。ログインしていなければログイン画面へ。管理者でなければ「見つかりません」
// （管理者の画面があることを、ほかの人に知らせないため）
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  return user;
}
