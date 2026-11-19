import Link from "next/link";
import { ForgotForm } from "@/app/auth/AuthForms";

export const metadata = { title: "パスワードの再設定 | フラッシュカード" };

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <h1>パスワードの再設定</h1>
      <p className="note">登録したメールアドレスに、新しいパスワードを設定するリンクを送ります。</p>
      <ForgotForm />
      <ul className="auth-links">
        <li>
          <Link href="/login">ログインへ戻る</Link>
        </li>
      </ul>
    </main>
  );
}
