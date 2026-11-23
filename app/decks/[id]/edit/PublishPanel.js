"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setPublished } from "./actions";

// デッキの公開（みんなのデッキに出す）の切り替え
export default function PublishPanel({ deckId, published, displayName }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function toggle(next) {
    setError(null);
    startTransition(async () => {
      const result = await setPublished(deckId, next);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <section className="publish-panel" aria-labelledby="publish-heading">
      <h2 id="publish-heading">公開</h2>
      {published ? (
        <>
          <p>
            <span className="shared-badge">公開中</span> <Link href={`/shared/${deckId}`}>みんなの単語帳</Link>
            に出ています（作った人: {displayName}）。
          </p>
          <p className="note small">公開をやめても、すでに取り込んだ人の単語帳は消えません。</p>
          <button type="button" className="secondary-button" onClick={() => toggle(false)} disabled={pending}>
            {pending ? "変更中…" : "公開をやめる"}
          </button>
        </>
      ) : (
        <>
          <p className="note small">
            公開すると、ほかのユーザーが「みんなの単語帳」でこの単語帳を見て、自分の単語帳として取り込めます
            （そのときのカードと解説がコピーされます。あなたの学習の記録は見えません）。
            {!displayName && (
              <>
                {" "}公開するには、先に<Link href="/account">アカウント</Link>で表示名を決めてください。
              </>
            )}
          </p>
          <button type="button" onClick={() => toggle(true)} disabled={pending}>
            {pending ? "変更中…" : "この単語帳を公開する"}
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
