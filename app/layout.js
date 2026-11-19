import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata = {
  title: "フラッシュカード",
  description: "暗記カードアプリ",
};

export default async function RootLayout({ children }) {
  const user = await getCurrentUser();
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <nav>
            <Link href="/" className="brand">フラッシュカード</Link>
            <div className="nav-links">
              {user ? (
                <>
                  <Link href="/search">動画を探す</Link>
                  <Link href="/shared">みんなのデッキ</Link>
                  <Link href="/stats">統計</Link>
                  <Link href="/settings">レベル設定</Link>
                  {/* メールアドレスは出さない（画面を人に見られても大丈夫なように）。表示名がなければ「アカウント」 */}
                  <Link href="/account" className="nav-account" title="アカウント（表示名・パスワードの変更）">
                    {user.displayName ?? "アカウント"}
                  </Link>
                  <form action={logout} className="nav-logout">
                    <button type="submit">ログアウト</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login">ログイン</Link>
                  <Link href="/signup">新規登録</Link>
                </>
              )}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
