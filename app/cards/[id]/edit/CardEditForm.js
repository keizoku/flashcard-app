"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmButton from "@/app/components/ConfirmButton";
import { deleteCard, updateCard } from "./actions";
import TargetsEditor from "./TargetsEditor";

export default function CardEditForm({ card }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateCard.bind(null, card.id), { error: null });
  const [deleting, startDelete] = useTransition();

  function onDelete() {
    startDelete(async () => {
      const r = await deleteCard(card.id);
      if (!r.error) router.push(`/decks/${r.deckId}`);
    });
  }

  const examplesText = (card.ai_examples ?? []).map((ex) => `${ex.en} | ${ex.ja}`).join("\n");

  return (
    <>
      <form action={formAction} className="add-form">
        <label>
          表（例文・問題）
          <textarea name="front" defaultValue={card.front} rows={3} maxLength={500} required />
        </label>
        <TargetsEditor initialTargets={card.targets} />
        <label>
          裏（自分のメモ・答え）
          <textarea name="back" defaultValue={card.back} rows={2} maxLength={500} />
        </label>

        <fieldset className="ai-fieldset">
          <legend>AI の解説</legend>
          <label>
            和訳
            <textarea name="ai_translation" defaultValue={card.ai_translation ?? ""} rows={2} />
          </label>
          <label>
            例文（1行に1つ。「英文 | 和訳」の形）
            <textarea name="ai_examples" defaultValue={examplesText} rows={3} />
          </label>
          <label>
            豆知識
            <textarea name="ai_trivia" defaultValue={card.ai_trivia ?? ""} rows={3} />
          </label>
        </fieldset>

        {state.error && <p className="error" role="alert">{state.error}</p>}
        <div className="form-buttons">
          <button type="submit" disabled={pending || deleting}>
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </form>

      <section className="danger-zone">
        <h2>カードの削除</h2>
        <ConfirmButton
          label="このカードを削除"
          confirmMessage="このカードを削除します。元に戻せません。"
          confirmLabel="削除する"
          pendingLabel="削除中…"
          pending={deleting}
          disabled={pending}
          onConfirm={onDelete}
        />
      </section>
    </>
  );
}
