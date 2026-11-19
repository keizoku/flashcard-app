import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { attachTargets } from "@/lib/targets";
import CardEditForm from "./CardEditForm";

export const dynamic = "force-dynamic";

export default async function CardEditPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const cardId = Number(id);
  if (!Number.isSafeInteger(cardId) || cardId <= 0) notFound();

  const { rows } = await pool.query(
    `SELECT c.id, c.deck_id, c.front, c.back, c.target_form, c.target_word,
            c.ai_translation, c.ai_translation_form, c.ai_meaning, c.ai_examples, c.ai_trivia, d.name AS deck_name
     FROM cards c JOIN decks d ON d.id = c.deck_id WHERE c.id = $1 AND d.user_id = $2`,
    [cardId, user.id]
  );
  if (!rows[0]) notFound();
  const [card] = await attachTargets(rows);

  return (
    <main>
      <p className="back-link">
        <Link href={`/decks/${card.deck_id}`}>← {card.deck_name}</Link>
      </p>
      <h1>カードを編集</h1>
      <CardEditForm card={card} />
    </main>
  );
}
