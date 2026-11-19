"use client";

import { useActionState } from "react";
import { addCard } from "@/app/actions";

const initialState = { error: null, front: "", back: "", version: 0 };

export default function AddCardForm({ deckId }) {
  const [state, formAction, pending] = useActionState(
    addCard.bind(null, deckId),
    initialState
  );

  return (
    // version が変わるたびにフォームを作り直す（成功時は空、エラー時は入力を残す）
    <form action={formAction} className="add-form" key={state.version}>
      <label>
        表（問題）
        <input name="front" defaultValue={state.front} maxLength={500} required autoFocus={state.version !== 0} />
      </label>
      <label>
        裏（答え）
        <input name="back" defaultValue={state.back} maxLength={500} required />
      </label>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "追加中…" : "カードを追加"}
      </button>
    </form>
  );
}
