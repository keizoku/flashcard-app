import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getComprehensionByDeck } from "@/lib/comprehension";
import { pool } from "@/lib/db";
import DeckList from "./DeckList";
import Landing from "./landing/Landing";

// リクエストのたびに DB から読み直す
export const dynamic = "force-dynamic";

const NOTICES = {
  welcome: "登録が完了しました。ようこそ！",
  "password-reset": "新しいパスワードを設定しました。",
};

export default async function Home({ searchParams }) {
  // ログインしていなければ、ホームページ（アプリの紹介）を出す
  const user = await getCurrentUser();
  if (!user) return <Landing />;
  const { notice } = await searchParams;
  const { rows: decks } = await pool.query(
    `
    SELECT d.id, d.name, d.kind, COUNT(c.id)::int AS card_count,
           COUNT(c.id) FILTER (WHERE c.review_due_at IS NULL OR c.review_due_at <= now())::int AS due_count,
           COALESCE((SELECT array_agg(t.name ORDER BY t.name)
                     FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id
                     WHERE dt.deck_id = d.id), '{}') AS tags
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id
    WHERE d.user_id = $1
    GROUP BY d.id
    ORDER BY d.id`,
    [user.id]
  );

  // 字幕のあるデッキは、動画の理解度も出す
  const comprehension = await getComprehensionByDeck(user.id);
  const decksWithProgress = decks.map((d) => {
    const c = comprehension.get(d.id);
    return { ...d, comprehension: c ? { percent: c.percent, understood: c.understood, total: c.total } : null };
  });

  return (
    <main>
      {NOTICES[notice] && (
        <p className="notice" role="status">
          {NOTICES[notice]}
        </p>
      )}
      <div className="page-head">
        <h1>デッキ</h1>
        <div className="actions-row">
          <Link href="/stories/new" className="button-link">
            覚えた単語で物語を作る
          </Link>
          <Link href="/decks/new" className="button-link study-link">
            ＋ 新しいデッキ
          </Link>
        </div>
      </div>
      {decks.length === 0 ? (
        <div className="empty-state">
          <p>まだデッキがありません。</p>
          <p className="note small">YouTube の URL を入れるだけで、動画のタイトルのデッキが作れます。</p>
          <Link href="/decks/new" className="button-link study-link">
            最初のデッキを作る
          </Link>
        </div>
      ) : (
        <>
          <DeckList decks={decksWithProgress} />
        </>
      )}
    </main>
  );
}
