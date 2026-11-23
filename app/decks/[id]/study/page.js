import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { DUE_CONDITION } from "@/lib/review";
import { attachTargets } from "@/lib/targets";
import StudySession from "./StudySession";

export const dynamic = "force-dynamic";

export default async function StudyPage({ params, searchParams }) {
  const user = await requireUser();
  const { id } = await params;
  const { all } = await searchParams;
  const deckId = Number(id);
  if (!Number.isSafeInteger(deckId) || deckId <= 0) notFound();

  const { rows: deckRows } = await pool.query("SELECT id, name FROM decks WHERE id = $1 AND user_id = $2", [
    deckId,
    user.id,
  ]);
  const deck = deckRows[0];
  if (!deck) notFound();

  const studyAll = all === "1";
  // 期限を過ぎたもの（古い順）→ まだ学習していないもの（登録順）の順に出す
  const { rows: cardRows } = await pool.query(
    `SELECT id, front, back, target_word, target_form, video_id, start_seconds,
            ai_translation, ai_translation_form, ai_meaning, ai_examples, ai_trivia
     FROM cards
     WHERE deck_id = $1 ${studyAll ? "" : `AND ${DUE_CONDITION}`}
     ORDER BY review_due_at ASC NULLS LAST, id`,
    [deckId]
  );
  const cards = await attachTargets(cardRows);
  const { rows: next } = await pool.query(
    "SELECT min(review_due_at) AS at, COUNT(*)::int AS total FROM cards WHERE deck_id = $1",
    [deckId]
  );

  return (
    <main>
      <p className="back-link">
        <Link href={`/decks/${deck.id}`}>← {deck.name}</Link>
      </p>
      {cards.length === 0 ? (
        <div className="study-empty">
          <h1>今日学習するカードはありません</h1>
          {next[0].total === 0 ? (
            <p className="note">この単語帳にはまだカードがありません。</p>
          ) : (
            <>
              <p className="note">
                次にカードが出るのは {new Date(next[0].at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}{" "}
                ごろです。
              </p>
              <Link href={`/decks/${deck.id}/study?all=1`} className="button-link">
                全カード（{next[0].total} 枚）を学習する
              </Link>
            </>
          )}
        </div>
      ) : (
        <StudySession deckId={deck.id} cards={cards} studyAll={studyAll} />
      )}
    </main>
  );
}
