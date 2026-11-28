import TermsText from "./TermsText";

export const metadata = { title: "利用規約 | フラッシュカード" };

// 利用規約。ログインしていなくても読める（登録の前に読むため）
export default function TermsPage() {
  return (
    <main>
      <h1>利用規約</h1>
      <TermsText />
    </main>
  );
}
