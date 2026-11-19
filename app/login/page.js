import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/auth/AuthForms";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "ログイン | フラッシュカード" };

export default async function LoginPage({ searchParams }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="auth-page">
      <h1>ログイン</h1>
      <LoginForm next={typeof next === "string" ? next : ""} />
      <ul className="auth-links">
        <li>
          はじめての方は <Link href="/signup">新規登録</Link>
        </li>
        <li>
          <Link href="/forgot-password">パスワードを忘れた</Link>
        </li>
      </ul>
    </main>
  );
}
