// メールアドレスを、前後の空白を除いて小文字にする。形がおかしければ null。
// Next.js の外（scripts/create-user.mjs）からも使うので、server-only にしない
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 254 ? email : null;
}
