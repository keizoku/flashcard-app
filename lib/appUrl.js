// このアプリの URL（https://… のように、最後の / なし）。メールのリンク・ログインの Cookie・パスキーのドメインに使う。
//   1. 環境変数 APP_URL があれば、それ
//   2. なければ、Vercel で動いているときは Vercel が教える本番の URL（VERCEL_PROJECT_PRODUCTION_URL。https）
//   3. どちらもなければ、手元の http://localhost:3000
// 2 があるので、Vercel で APP_URL を入れ忘れても localhost にはならない（localhost だとパスキーが使えない）。
// Next.js の外の道具（scripts/）からも使えるよう、server-only は付けない
export function appOrigin() {
  const set = (process.env.APP_URL ?? "").trim();
  if (set) return new URL(set).origin;
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercel) return new URL(`https://${vercel}`).origin;
  return "http://localhost:3000";
}

export const isHttpsApp = () => appOrigin().startsWith("https:");

// パスキーのドメイン（rpId）が、開いているページ（hostname）で使えるか。同じドメインか、その下のドメインなら使える
export function rpIdFitsHost(rpId, hostname) {
  if (!rpId || !hostname) return false;
  return hostname === rpId || hostname.endsWith(`.${rpId}`);
}
