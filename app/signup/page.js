import Link from "next/link";
import { SignupForm } from "@/app/auth/AuthForms";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "新規登録 | フラッシュカード" };

// ログイン中に開いても、トップへは移さない。登録するとその場でログインするので、
// 移してしまうと、復旧コードを見せる前に画面が変わってしまう（フォームの中で「ログインしています」と出す）
export default async function SignupPage() {
  const loggedIn = Boolean(await getCurrentUser());
  return (
    <main className="auth-page">
      <h1>新規登録</h1>
      <p className="note">
        ID とパスワードを決めるだけで登録できます。メールアドレスはいりません。
        登録すると「復旧コード」が出ます。パスワードを忘れたときに必要なので、メモしてください。
      </p>
      <SignupForm loggedIn={loggedIn} />
      <ul className="auth-links">
        <li>
          登録済みの方は <Link href="/login">ログイン</Link>
        </li>
      </ul>
    </main>
  );
}
