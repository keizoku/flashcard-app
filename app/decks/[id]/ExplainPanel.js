"use client";

import { useState, useTransition } from "react";
import PromptBox from "@/app/components/PromptBox";
import { getCardPrompt, importCardExplanations } from "./actions";

// 解説がないカードについて、チャット AI 用のプロンプトを作り、答えを取り込む
export default function ExplainPanel({ deckId, missingCount }) {
  const [prompt, setPrompt] = useState(null);
  const [aiText, setAiText] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function makePrompt() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const r = await getCardPrompt(deckId);
      if (r.error) setError(r.error);
      else setPrompt(r);
    });
  }

  function importAnswer() {
    setError(null);
    startTransition(async () => {
      const r = await importCardExplanations(deckId, aiText);
      if (r.error) {
        setError(r.error);
        return;
      }
      setMessage(`${r.saved} 枚に解説を取り込みました。${r.skipped ? `（読み取れなかったもの ${r.skipped} 件）` : ""}`);
      setAiText("");
      setPrompt(null);
    });
  }

  return (
    <details className="ai-panel">
      <summary>チャット AI で解説を作る（例文・豆知識・和訳の対応が足りないカード {missingCount} 枚）</summary>
      <ol className="steps">
        <li>
          <button type="button" className="secondary-button" onClick={makePrompt} disabled={pending}>
            {pending && !prompt ? "作成中…" : "プロンプトを作る"}
          </button>
          {prompt && (
            <>
              <p className="note small">
                {prompt.count} 枚分のプロンプトです
                {missingCount > prompt.count && "（一度に20枚まで。残りは取り込んだあとにもう一度作ってください）"}。
                コピーして <a href="https://claude.ai/new" target="_blank" rel="noreferrer">claude.ai</a>{" "}
                などのチャット AI に貼り付けて送信します。
              </p>
              <PromptBox text={prompt.prompt} />
            </>
          )}
        </li>
        <li>
          AI の答え（「### 番号」で始まる部分）をコピーして、ここに貼り付けます。
          <textarea
            className="ai-answer"
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={6}
            placeholder={"### 12\n和訳: ...\n意味: ...\n例文: ... | ...\n豆知識: ..."}
          />
        </li>
        <li>
          <button type="button" onClick={importAnswer} disabled={pending || !aiText.trim()}>
            {pending && aiText ? "取り込み中…" : "解説を取り込む"}
          </button>
        </li>
      </ol>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </details>
  );
}
