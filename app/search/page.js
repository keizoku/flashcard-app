import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getRecommendations } from "@/lib/recommend";
import { Recommendations } from "./Recommendations";

export const metadata = { title: "動画を探す | フラッシュカード" };

export const dynamic = "force-dynamic";

// 学習に使う動画を、みんなが学んだ動画の中から探す（YouTube の API キーは使わない）
export default async function SearchPage() {
  const user = await requireUser();
  const recs = await getRecommendations(user.id);

  return (
    <main className="search-page">
      <p className="back-link">
        <Link href="/">← デッキ一覧</Link>
      </p>
      <h1>動画を探す</h1>
      <p className="note">
        ほかの人が字幕を入れてデッキにした動画を、あなたのレベルと覚えた語で解析しました。
        キーワード・レベル・長さで絞り込めます。
      </p>
      <Recommendations videos={recs.videos} />
    </main>
  );
}
