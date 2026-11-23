import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getOnboarding } from "@/lib/onboarding";
import { getAllTags } from "@/lib/tags";
import AddDeckForm from "./AddDeckForm";

export const metadata = { title: "新しい単語帳 | フラッシュカード" };

export const dynamic = "force-dynamic";

export default async function NewDeckPage() {
  const user = await requireUser();
  const allTags = await getAllTags(user.id);
  // はじめの4ステップの途中なら、単語帳の作り方の手順を出す
  const guiding = (await getOnboarding(user.id)).show;

  return (
    <main>
      <p className="back-link">
        <Link href="/">← 単語帳の一覧</Link>
      </p>
      <h1>新しい単語帳</h1>
      {guiding && <DeckSteps />}
      <AddDeckForm allTags={allTags} />
    </main>
  );
}

// はじめの4ステップの、ステップ2の手順
function DeckSteps() {
  return (
    <section className="guide-box" aria-label="単語帳の作り方">
      <p className="guide-title">ステップ2：動画を選んで、単語帳を作る</p>
      <ol>
        <li>YouTube で、見たい英語の動画を開く（字幕［CC］が出る動画を選んでください。次のステップで字幕を使います）</li>
        <li>ブラウザの上のアドレス（URL）をコピーする。スマートフォンなら「共有」→「コピー」</li>
        <li>下の「YouTube の URL」に貼って、「単語帳を作成」を押す（単語帳の名前は動画のタイトルが自動で入ります）</li>
      </ol>
    </section>
  );
}

