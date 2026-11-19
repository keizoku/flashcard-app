import Link from "next/link";
import { ResendForm } from "@/app/auth/AuthForms";

export const metadata = { title: "確認メールの再送 | フラッシュカード" };

export default async function ResendPage({ searchParams }) {
  const { expired } = await searchParams;
  return (
    <main className="auth-page">
      <h1>確認メールを送り直す</h1>
      {expired ? (
        <p className="error" role="alert">
          リンクの期限が切れているか、すでに使われています。登録が済んでいれば <Link href="/login">ログイン</Link>{" "}
          できます。まだなら、下から確認メールを送り直してください。
        </p>
      ) : (
        <p className="note">登録したメールアドレスを入れてください。</p>
      )}
      <ResendForm />
      <ul className="auth-links">
        <li>
          <Link href="/login">ログインへ戻る</Link>
        </li>
      </ul>
    </main>
  );
}
