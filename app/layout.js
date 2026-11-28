import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { guestHoursLeft } from "@/lib/guest";
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
              {user?.guestExpiresAt ? (
                <>
                  <Link href="/shared">みんなの単語帳</Link>
                  <Link href="/stats">統計</Link>
                  <Link href="/settings">レベル設定</Link>
                  <Link href="/account" className="nav-guest" title="おためし中。期限が来ると、アカウントごと削除されます">
                    おためし中（あと {guestHoursLeft(user.guestExpiresAt)} 時間）
                  </Link>
                </>
              ) : user ? (
                <>
                  <Link href="/shared">みんなの単語帳</Link>
                  <Link href="/stats">統計</Link>
                  <Link href="/settings">レベル設定</Link>
                  {/* 管理者（ADMIN_USERNAMES の人）にだけ出す */}
                  {isAdmin(user) && <Link href="/admin">管理</Link>}
                  {/* ログインの ID は出さない（画面を人に見られても大丈夫なように）。表示名がなければ「アカウント」 */}
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
                  <Link href="/try">登録せずに試す</Link>
                </>
              )}
            </div>
          </nav>
        </header>
        {children}
        {/* どの画面にも、無料・実験中であることと、利用規約へのリンクを出す */}
        <footer className="site-footer">
          <span>無料・実験中のサービスです。何も保証しません。</span>
          <Link href="/terms">利用規約</Link>
        </footer>
      </body>
    </html>
  );
}
