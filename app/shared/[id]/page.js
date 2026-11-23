import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPublicDeck } from "@/lib/sharing";
import ImportButton from "../ImportButton";

export const dynamic = "force-dynamic";

const dateText = (d) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(d);

// 公開中のデッキの中身。公開していないデッキは 404
export default async function SharedDeckPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const deckId = Number(id);
  if (!Number.isSafeInteger(deckId) || deckId <= 0) notFound();
  const deck = await getPublicDeck(deckId, user.id);
  if (!deck) notFound();

  return (
    <main>
      <p className="back-link">
        <Link href="/shared">← みんなの単語帳</Link>
      </p>
      <h1>{deck.name}</h1>
      <p className="note">
        {deck.display_name} · {dateText(deck.published_at)} 公開 · {deck.cards.length} 枚
        {deck.has_transcript && " · 字幕つき"}
        {deck.kind === "story" && " · 物語"}
      </p>
      {deck.tags.length > 0 && (
        <p className="deck-tags">
          {deck.tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
            </span>
          ))}
        </p>
      )}

      {deck.is_mine ? (
        <p className="notice">
          自分の単語帳です。<Link href={`/decks/${deck.id}/edit`}>公開をやめるときは「編集」から</Link>
        </p>
      ) : deck.imported_deck_id ? (
        <div className="notice">
          <p>
            取り込みずみです: <Link href={`/decks/${deck.imported_deck_id}`}>自分の単語帳を開く</Link>
          </p>
          <ImportButton deckId={deck.id} cardCount={deck.cards.length} again />
        </div>
      ) : (
        <ImportButton deckId={deck.id} cardCount={deck.cards.length} />
      )}

      <h2>カード</h2>
      <ul className="shared-cards">
        {deck.cards.map((c) => (
          <li key={c.id}>
            <span className="shared-front">{c.front}</span>
            {c.ai_translation && <span className="shared-translation">{c.ai_translation}</span>}
            {(c.words.length > 0 || c.back) && (
              <span className="shared-sub">
                {c.words.length > 0 && <strong>{c.words.join(" / ")}</strong>}
                {c.words.length > 0 && c.back && " · "}
                {c.back}
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
