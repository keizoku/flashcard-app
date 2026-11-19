"use client";

import { useActionState, useRef, useTransition } from "react";
import { TitleStatus, useVideoTitle } from "@/app/components/useVideoTitle";
import ConfirmButton from "@/app/components/ConfirmButton";
import TagEditor from "@/app/components/TagEditor";
import { deleteDeck, updateDeck } from "./actions";

export default function DeckEditForm({ deck, initialUrl, cardCount, tags, allTags }) {
  const [state, formAction, pending] = useActionState(updateDeck.bind(null, deck.id), { error: null });
  const [deleting, startDelete] = useTransition();
  const nameRef = useRef(null);
  const urlRef = useRef(null);
  const { status, onUrlChange } = useVideoTitle(nameRef);

  function onDelete() {
    startDelete(async () => {
      await deleteDeck(deck.id);
    });
  }

  return (
    <>
      <form action={formAction} className="add-form">
        <label>
          デッキ名
          <input ref={nameRef} name="name" defaultValue={deck.name} maxLength={100} required />
          <TitleStatus status={status} />
        </label>
        <div className="field">
          <span className="field-label">タグ</span>
          <TagEditor initialTags={tags} allTags={allTags} />
        </div>
        <label>
          YouTube の URL（任意）
          <input
            ref={urlRef}
            name="url"
            defaultValue={initialUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            inputMode="url"
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onUrlChange(urlRef.current?.value ?? "", { force: true })}
          disabled={pending || deleting}
        >
          デッキ名を動画のタイトルにする
        </button>
        <label>
          字幕のテキスト（任意）
          <textarea name="transcript" defaultValue={deck.transcript ?? ""} rows={10} />
        </label>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <div className="form-buttons">
          <button type="submit" disabled={pending || deleting}>
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </form>

      <section className="danger-zone">
        <h2>デッキの削除</h2>
        <p className="note small">デッキと、中のカード（{cardCount} 枚）がすべて削除されます。元に戻せません。</p>
        <ConfirmButton
          label="このデッキを削除"
          confirmMessage={`デッキ「${deck.name}」と、中のカード ${cardCount} 枚を削除します。元に戻せません。`}
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
