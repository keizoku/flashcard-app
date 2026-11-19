import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getRecommendations } from "@/lib/recommend";
import { CAPTIONS, DURATIONS, ORDERS, PERIODS, normalizeFilters } from "@/lib/youtubeSearch";
import { Recommendations } from "./Recommendations";

export const metadata = { title: "動画を探す | フラッシュカード" };

export const dynamic = "force-dynamic";

function Select({ name, label, options, value }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// 学習に使う動画を探す。上は「YouTube で探す」（YouTube の検索結果を新しいタブで開く）、下はおすすめ。
// どちらも YouTube の API キーは使わない
export default async function SearchPage() {
  const user = await requireUser();
  const filters = normalizeFilters({});
  const recs = await getRecommendations(user.id);

  return (
    <main className="search-page">
      <p className="back-link">
        <Link href="/">← デッキ一覧</Link>
      </p>
      <h1>動画を探す</h1>
      <p className="note">
        条件を入れて「YouTube で探す」を押すと、YouTube の検索結果が新しいタブで開きます。
        気に入った動画の URL をコピーして、<Link href="/decks/new">新しいデッキ</Link>に貼ってください。
      </p>

      <form action="/search/youtube" target="_blank" className="add-form search-form">
        <label className="search-q">
          キーワード（英語で入れると、英語の動画が出やすくなります）
          <input name="q" required maxLength={100} placeholder="例: travel vlog, cooking for beginners, TED" />
        </label>
        <div className="search-grid">
          <Select name="duration" label="長さ" options={DURATIONS} value={filters.duration} />
          <Select name="captions" label="字幕" options={CAPTIONS} value="1" />
          <Select name="order" label="並び順" options={ORDERS} value={filters.order} />
          <Select name="period" label="公開された時期" options={PERIODS} value={filters.period} />
        </div>
        <button type="submit">YouTube で探す ↗</button>
        <p className="note small">ジャンルや国で絞りたいときは、YouTube の画面の「フィルタ」か、キーワード（例: news, british）で。</p>
      </form>

      <Recommendations videos={recs.videos} />
    </main>
  );
}
