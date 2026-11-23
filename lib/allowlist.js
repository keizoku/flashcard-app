// 使える人を、メールアドレスで決める（環境変数 ALLOWED_EMAILS、カンマ区切り）。
// インターネットに公開して、まず自分だけで使うときなどに設定する（docs/deploy.md）。
// 決めていなければ（空なら）、だれでも登録・ログインできる
export function isAllowedEmail(email) {
  const list = String(process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(String(email ?? "").trim().toLowerCase());
}
