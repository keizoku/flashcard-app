// 使える人を、メールアドレスで決める（環境変数 ALLOWED_EMAILS、カンマ区切り）。
// インターネットに公開して、まず自分だけで使うときなどに設定する（docs/deploy.md）。
// 決めていなければ（空なら）、だれでも登録・ログインできる
function allowedList() {
  return String(process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// だれでも登録できるか（使える人を決めていないか）。決めているときは、画面に「新規登録」を出さない
export function isSignupOpen() {
  return allowedList().length === 0;
}

export function isAllowedEmail(email) {
  const list = allowedList();
  if (list.length === 0) return true;
  return list.includes(String(email ?? "").trim().toLowerCase());
}
