import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getAllTags, getDeckTags } from "@/lib/tags";
import { videoUrl } from "@/lib/youtube";
import DeckEditForm from "./DeckEditForm";
import PublishPanel from "./PublishPanel";

export const dynamic = "force-dynamic";

export default async function DeckEditPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const deckId = Number(id);
  if (!Number.isSafeInteger(deckId) || deckId <= 0) notFound();

  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.video_id, d.transcript, d.published_at, u.display_name, COUNT(c.id)::int AS card_count
     FROM decks d JOIN users u ON u.id = d.user_id LEFT JOIN cards c ON c.deck_id = d.id
     WHERE d.id = $1 AND d.user_id = $2 GROUP BY d.id, u.display_name`,
    [deckId, user.id]
  );
  const deck = rows[0];
  if (!deck) notFound();
  const [tags, allTags] = await Promise.all([getDeckTags(deck.id), getAllTags(user.id)]);

  return (
    <main>
      <p className="back-link">
        <Link href={`/decks/${deck.id}`}>← {deck.name}</Link>
      </p>
      <h1>デッキを編集</h1>
      <DeckEditForm
        deck={{ id: deck.id, name: deck.name, transcript: deck.transcript }}
        initialUrl={deck.video_id ? videoUrl(deck.video_id) : ""}
        cardCount={deck.card_count}
        tags={tags}
        allTags={allTags}
      />
      <PublishPanel deckId={deck.id} published={deck.published_at !== null} displayName={deck.display_name} />
    </main>
  );
}
