import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GUEST_HOURS, GUEST_LIMITS } from "@/lib/guest";
import TryForm from "./TryForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "登録せずに試す | フラッシュカード" };

// おためし（新規登録をせずに、1日だけ全機能を試す）の説明と、始めるボタン
export default async function TryPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth-page">
      <h1>登録せずに試す</h1>
      <p>メールアドレスもパスワードもいりません。あなただけの、おためし用のアカウントを作ります。</p>
      <ul className="try-rules">
        <li>
          <strong>{GUEST_HOURS}時間（1日）たつと、アカウントごと自動で削除されます。</strong>
          作った単語帳・カード・学習の記録も、すべて消えます。あとから取り出すことはできません。
        </li>
        <li>
          単語帳は {GUEST_LIMITS.decks} 冊まで、カードは全部で {GUEST_LIMITS.cards} 枚まで、物語の絵は全部で{" "}
          {GUEST_LIMITS.imageBytes / 1024 / 1024}MB まで作れます。
        </li>
        <li>単語帳の公開・表示名・パスワード・パスキーは使えません。</li>
        <li>
          同じブラウザなら、閉じても期限までは続きから使えます。メールアドレス・パスワードはないので、
          ほかのブラウザ・端末からは入れません（Cookie を消したときも、もう戻れません）。
        </li>
        <li>「おためしを終える」を押すと、その場で削除されます。</li>
      </ul>
      <TryForm />
      <ul className="auth-links">
        <li>
          続けて使う方は <Link href="/login">ログイン</Link>
        </li>
      </ul>
    </main>
  );
}
