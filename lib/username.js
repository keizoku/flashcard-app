// ログインの ID（ユーザー名）の決まり。メールアドレスの代わりに使う。
// Next.js の外（scripts/）からも使うので、server-only にしない
//   - 英小文字・数字・「_」「-」だけ。3〜20文字。最初は英小文字か数字
//   - 大文字で入れても小文字にする（Taro と taro は同じ ID）
//   - 「guest」で始まる ID は、おためしユーザーのために取っておく

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_HINT = `英小文字・数字・「_」「-」で${USERNAME_MIN}〜${USERNAME_MAX}文字`;
const PATTERN = new RegExp(`^[a-z0-9][a-z0-9_-]{${USERNAME_MIN - 1},${USERNAME_MAX - 1}}$`);

export function normalizeUsername(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

// ID の決まりに合わなければ、画面に出す文を返す。合えば null
export function checkUsernameRule(username) {
  if (!PATTERN.test(username)) return `ID は${USERNAME_HINT}にしてください`;
  if (username.startsWith("guest")) return "「guest」で始まる ID は使えません";
  return null;
}
