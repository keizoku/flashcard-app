import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/app/auth/AuthForms";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "新規登録 | フラッシュカード" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth-page">
      <h1>新規登録</h1>
      <p className="note">
        メールアドレスに確認メールが届きます。メールのリンクを開くと登録が完了します。
      </p>
      <SignupForm />
      <ul className="auth-links">
        <li>
          登録済みの方は <Link href="/login">ログイン</Link>
        </li>
        <li>
          確認メールが届かない方は <Link href="/resend">送り直す</Link>
        </li>
      </ul>
    </main>
  );
}
