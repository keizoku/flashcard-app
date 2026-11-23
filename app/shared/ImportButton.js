"use client";

import { useState, useTransition } from "react";
import { importSharedDeck } from "./actions";

// 「自分のデッキに取り込む」ボタン。取り込めたらデッキの画面へ移る
export default function ImportButton({ deckId, cardCount, again = false }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await importSharedDeck(deckId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="import-shared">
      <button type="button" className={again ? "secondary-button" : undefined} onClick={onClick} disabled={pending}>
        {pending ? "取り込み中…" : again ? "もう一度取り込む（別の単語帳になります）" : `自分の単語帳に取り込む（${cardCount} 枚）`}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
