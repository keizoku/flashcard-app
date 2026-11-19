"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import ConfirmButton from "@/app/components/ConfirmButton";
import CardDetails from "@/app/components/CardDetails";
import { HighlightedMany } from "@/app/components/Highlighted";
import SpeakButton from "@/app/components/SpeakButton";
import { displayTarget } from "@/lib/format";
import { formatTime, videoUrl } from "@/lib/youtube";
import { deleteCards } from "./actions";

// カードの一覧。チェックを付けて、まとめて削除できる
export default function CardList({ deckId, cards }) {
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const allSelected = cards.length > 0 && selected.size === cards.length;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const r = await deleteCards(deckId, [...selected]);
      if (r.error) setError(r.error);
      else setSelected(new Set());
    });
  }

  return (
    <>
      <div className="select-bar">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setSelected(allSelected ? new Set() : new Set(cards.map((c) => c.id)))}
          disabled={pending}
        >
          {allSelected ? "選択をすべて外す" : `すべて選ぶ（${cards.length} 枚）`}
        </button>
        {selected.size > 0 && (
          <ConfirmButton
            label={`選んだ ${selected.size} 枚を削除`}
            confirmMessage={`選んだカード ${selected.size} 枚を削除します。元に戻せません。`}
            confirmLabel="削除する"
            pendingLabel="削除中…"
            pending={pending}
            onConfirm={onDelete}
          />
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <ul className="cards">
        {cards.map((card) => (
          <li key={card.id} className={`card-row${selected.has(card.id) ? " checked" : ""}`}>
            <input
              type="checkbox"
              className="card-check"
              checked={selected.has(card.id)}
              onChange={() => toggle(card.id)}
              aria-label="このカードを選ぶ"
            />
            <details>
              <summary>
                <HighlightedMany text={card.front} forms={(card.targets ?? []).map((t) => t.form)} />
              </summary>
              {card.targets?.length > 0 && (
                <p className="card-word">{card.targets.map((t) => displayTarget(t.word)).join(" / ")}</p>
              )}
              {card.back && <p className="card-note">{card.back}</p>}
              <CardDetails card={card} />
              <p className="card-actions">
                <SpeakButton text={card.front} />
                <SpeakButton text={card.front} slow />
                {card.video_id && (
                  <a href={videoUrl(card.video_id, card.start_seconds)} target="_blank" rel="noreferrer">
                    ▶ 動画のこの場面{card.start_seconds !== null && `（${formatTime(card.start_seconds)}）`}
                  </a>
                )}
                <Link href={`/cards/${card.id}/edit`}>編集</Link>
              </p>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
