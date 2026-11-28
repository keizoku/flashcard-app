import Link from "next/link";
import { RecoverForm } from "@/app/auth/AuthForms";

export const metadata = { title: "パスワードを忘れたとき | フラッシュカード" };

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <h1>パスワードを忘れたとき</h1>
      <p className="note">
        登録したときに出た「復旧コード」で、パスワードを作り直せます。
        パスキーを登録している端末なら、ログインの画面の「パスキーでログイン」でも入れます。
      </p>
      <p className="note">
        メールアドレスで登録した方は、ログインしたあと、アカウントの画面で復旧コードを作るまで、ここは使えません。
        パスワードがわからないときは、管理者に作り直してもらってください。
      </p>
      <RecoverForm />
      <ul className="auth-links">
        <li>
          <Link href="/login">ログインへ戻る</Link>
        </li>
      </ul>
    </main>
  );
}
