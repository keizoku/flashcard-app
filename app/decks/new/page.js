import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getOnboarding } from "@/lib/onboarding";
import { getAllTags } from "@/lib/tags";
import { isValidVideoId, videoUrl } from "@/lib/youtube";
import AddDeckForm from "./AddDeckForm";

export const metadata = { title: "新しい単語帳 | フラッシュカード" };

export const dynamic = "force-dynamic";

const one = (v) => String((Array.isArray(v) ? v[0] : v) ?? "");

// 「動画を探す」のおすすめから来たときは、動画の URL とタイトルを入れた状態で開く（?video=ID&name=タイトル&back=/search）
export default async function NewDeckPage({ searchParams }) {
  const user = await requireUser();
  const allTags = await getAllTags(user.id);
  const q = (await searchParams) ?? {};
  const video = one(q.video);
  const initial = {
    url: isValidVideoId(video) ? videoUrl(video) : "",
    name: one(q.name).trim().slice(0, 100),
  };
  // 戻り先は、このアプリの「動画を探す」の画面だけ（ほかのサイトへは飛ばさない）
  const backToSearch = one(q.back) === "/search" ? "/search" : null;
  // はじめの4ステップの途中なら、デッキの作り方の手順を出す（「動画を探す」は慣れてからなので出さない）
  const guiding = (await getOnboarding(user.id)).show;

  return (
    <main>
      <p className="back-link">
        {backToSearch ? <Link href={backToSearch}>← 動画を探すに戻る</Link> : <Link href="/">← 単語帳の一覧</Link>}
      </p>
      <h1>新しい単語帳</h1>
      {guiding && !initial.url && <DeckSteps />}
      {!guiding && !initial.url && (
        <p className="note small">
          使う動画が決まっていなければ、<Link href="/search">動画を探す</Link>から選べます。
        </p>
      )}
      <AddDeckForm allTags={allTags} initial={initial} />
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

