"use client";

import { useActionState, useRef } from "react";
import TagEditor from "@/app/components/TagEditor";
import { TitleStatus, useVideoTitle } from "@/app/components/useVideoTitle";
import { addDeck } from "@/app/actions";

const initialState = { error: null, name: "", url: "", transcript: "", version: 0 };

// samples: おためしユーザーに出すサンプルの動画（lib/sampleVideos.js）。押すと URL の欄に入る
export default function AddDeckForm({ allTags = [], samples = null }) {
  const [state, formAction, pending] = useActionState(addDeck, initialState);
  const nameRef = useRef(null);
  const urlRef = useRef(null);
  const { status, onUrlChange } = useVideoTitle(nameRef);

  function pickSample(url) {
    urlRef.current.value = url;
    onUrlChange(url);
  }

  return (
    // エラーのときは入力を残したまま作り直す（成功したら、作った単語帳の画面へ移る）
    <form action={formAction} className="add-form" key={state.version}>
      {samples?.length > 0 && (
        <section className="guide-box sample-videos" aria-label="おためし用のサンプル動画">
          <p className="guide-title">どの動画にするか迷ったら、この動画で試してみてください</p>
          <ul>
            {samples.map((v) => (
              <li key={v.id}>
                <span>
                  <strong>{v.title}</strong>
                  <span className="note small">
                    {Math.floor(v.seconds / 60)}分{v.seconds % 60}秒・英語の字幕あり。{v.note}
                  </span>
                </span>
                <span className="sample-actions">
                  {/* 字幕をコピーするには YouTube で開く必要があるので、別のタブ（ウィンドウ）で開く */}
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondary-button"
                    aria-label={`${v.title} を YouTube で開く（別のタブ）`}
                  >
                    YouTube で開く ↗
                  </a>
                  <button type="button" className="secondary-button" onClick={() => pickSample(v.url)}>
                    この動画を使う
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <label>
        YouTube の URL（任意）
        <input
          ref={urlRef}
          name="url"
          defaultValue={state.url}
          placeholder="https://www.youtube.com/watch?v=..."
          inputMode="url"
          autoFocus
          onChange={(e) => onUrlChange(e.target.value)}
        />
      </label>
      <label>
        単語帳の名前
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
      <details open={Boolean(state.transcript)}>
        <summary className="summary-label">字幕も入れる（任意）</summary>
        <div className="details-body">
          <label>
            字幕のテキスト
            <textarea
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
        {pending ? "作成中…" : "単語帳を作成"}
      </button>
    </form>
  );
}
