"use client";

import { useActionState, useRef } from "react";
import TagEditor from "@/app/components/TagEditor";
import { TitleStatus, useVideoTitle } from "@/app/components/useVideoTitle";
import { addDeck } from "@/app/actions";

const initialState = { error: null, name: "", url: "", transcript: "", version: 0 };

// initial: 「動画を探す」から来たときの、URL とデッキ名
export default function AddDeckForm({ allTags = [], initial = { url: "", name: "" } }) {
  const [state, formAction, pending] = useActionState(addDeck, { ...initialState, ...initial });
  const fromSearch = Boolean(initial.url);
  const nameRef = useRef(null);
  const { status, onUrlChange } = useVideoTitle(nameRef);

  return (
    // エラーのときは入力を残したまま作り直す（成功したら、作ったデッキの画面へ移る）
    <form action={formAction} className="add-form" key={state.version}>
      <label>
        YouTube の URL（任意）
        <input
          name="url"
          defaultValue={state.url}
          placeholder="https://www.youtube.com/watch?v=..."
          inputMode="url"
          autoFocus={!fromSearch}
          onChange={(e) => onUrlChange(e.target.value)}
        />
      </label>
      <label>
        デッキ名
        <input
          ref={nameRef}
          name="name"
          defaultValue={state.name}
          maxLength={100}
          placeholder="URL を入れると、動画のタイトルが入ります"
        />
        <TitleStatus status={status} />
      </label>
      <div className="field">
        <span className="field-label">タグ（任意）</span>
        <TagEditor key={state.version} initialTags={state.tags ?? []} allTags={allTags} />
      </div>
      <details open={Boolean(state.transcript) || fromSearch}>
        <summary className="summary-label">字幕も入れる（任意）</summary>
        <div className="details-body">
          {fromSearch && (
            <p className="note small">
              <a href={state.url || initial.url} target="_blank" rel="noopener noreferrer">
                動画を YouTube で開き
              </a>
              、説明の下の「文字起こしを表示」を押して、出てきた字幕をすべて選んでコピーし、ここに貼り付けます。
            </p>
          )}
          <label>
            字幕のテキスト
            <textarea
              autoFocus={fromSearch}
              name="transcript"
              defaultValue={state.transcript}
              rows={6}
              placeholder={"YouTube の「文字起こしを表示」からコピーして貼り付け\n0:00\nHello everyone, ..."}
            />
          </label>
          <p className="note small">字幕を入れると、作成後にそのまま i+1 の文を探す画面に移ります。</p>
        </div>
      </details>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "作成中…" : "デッキを作成"}
      </button>
    </form>
  );
}
