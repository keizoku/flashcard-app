import Link from "next/link";
import { ResetForm } from "@/app/auth/AuthForms";
import { isValidEmailToken } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const metadata = { title: "新しいパスワード | フラッシュカード" };

export default async function ResetPasswordPage({ searchParams }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && (await isValidEmailToken(token, "reset"));
  return (
    <main className="auth-page">
      <h1>新しいパスワードを設定</h1>
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <>
          <p className="error" role="alert">リンクの期限が切れているか、すでに使われています。</p>
          <ul className="auth-links">
            <li>
              <Link href="/forgot-password">再設定のメールをもう一度送る</Link>
            </li>
          </ul>
        </>
      )}
    </main>
  );
}
