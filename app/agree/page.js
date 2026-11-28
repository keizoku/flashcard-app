import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import TermsText, { TermsSummary } from "@/app/terms/TermsText";
import { getCurrentUser } from "@/lib/auth";
import { needsTermsAgreement } from "@/lib/terms";
import AgreeForm from "./AgreeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "利用規約への同意 | フラッシュカード" };

// 利用規約への同意。まだ同意していない人（前からのアカウント・規約が変わったとき）は、
// ほかの画面を開くとここへ来る（lib/auth.js の requireUser）。同意しないなら、ログアウトできる
export default async function AgreePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!needsTermsAgreement(user)) redirect("/");
  return (
    <main className="auth-page agree-page">
      <h1>利用規約への同意</h1>
      <p>続けて使う前に、利用規約を読んで、同意してください。大事なところは次のとおりです。</p>
      <TermsSummary />
      <details className="terms-details">
        <summary>利用規約の全文を読む</summary>
        <TermsText />
      </details>
      <AgreeForm />
      <form action={logout} className="agree-logout">
        <p className="note small">同意しない場合は、使えません。</p>
        <button type="submit" className="link-button">
          同意せずにログアウトする
        </button>
      </form>
    </main>
  );
}
