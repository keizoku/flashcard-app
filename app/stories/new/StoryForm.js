"use client";

import { useState, useTransition } from "react";
import PromptBox from "@/app/components/PromptBox";
import { displayTarget } from "@/lib/format";
import { createStory, makeStoryPrompt } from "./actions";

const SOURCES = [
  { key: "learned", label: "覚えた語" },
  { key: "learning", label: "学習中の語" },
  { key: "both", label: "両方" },
];
const LENGTHS = [
  { key: "short", label: "短め（約150語）" },
  { key: "medium", label: "ふつう（約300語）" },
  { key: "long", label: "長め（約500語）" },
];

export default function StoryForm({ counts, decks }) {
  const [source, setSource] = useState(counts.learned > 0 ? "learned" : "both");
  const [deckId, setDeckId] = useState("");
  const [count, setCount] = useState(15);
  const [length, setLength] = useState("medium");
  const [theme, setTheme] = useState("");
  const [result, setResult] = useState(null); // { prompt, words, poolSize }
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function makePrompt() {
    setError(null);
    startTransition(async () => {
      const r = await makeStoryPrompt({ source, deckId, count, length, theme });
      if (r.error) setError(r.error);
      else setResult(r);
    });
  }

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await createStory({ answer, words: result.words });
        if (r?.error) setError(r.error);
      } catch {
        setError("デッキを作れませんでした。ページを再読み込みしてから、もう一度試してください");
      }
    });
  }

  return (
    <>
      <div className="add-form">
        <div className="field">
          <span className="field-label">使う単語</span>
          <div className="choice-row">
            {SOURCES.map((s) => (
              <label key={s.key} className="choice">
                <input type="radio" name="source" checked={source === s.key} onChange={() => setSource(s.key)} />
                {s.label}（{counts[s.key]} 語）
              </label>
            ))}
          </div>
          {counts.learned === 0 && (
            <p className="note small">
              「覚えた語」（学習で3回続けて「覚えている」）はまだありません。はじめは「学習中の語」や「両方」で作れます。
            </p>
          )}
        </div>
        <label>
          どのデッキの単語から
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            <option value="">すべてのデッキ</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          使う単語の数: {count} 語（多いときは、その中からランダムに選びます）
          <input type="range" min="3" max="40" value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <div className="field">
          <span className="field-label">長さ</span>
          <div className="choice-row">
            {LENGTHS.map((l) => (
              <label key={l.key} className="choice">
                <input type="radio" name="length" checked={length === l.key} onChange={() => setLength(l.key)} />
                {l.label}
              </label>
            ))}
          </div>
        </div>
        <label>
          テーマ・設定（任意）
          <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="例: 宇宙、ビジネス、ミステリー、日常" maxLength={100} />
        </label>
        <button type="button" onClick={makePrompt} disabled={pending}>
          {pending && !result ? "作成中…" : result ? "単語を選び直してプロンプトを作り直す" : "プロンプトを作る"}
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {result && (
        <section className="ai-panel">
          <ol className="steps">
            <li>
              選んだ単語（{result.words.length} 語 / 候補 {result.poolSize} 語）:
              <div className="known-words story-words">
                {result.words.map((w) => (
                  <span key={w} className="tag-chip">
                    {displayTarget(w)}
                  </span>
                ))}
              </div>
            </li>
            <li>
              プロンプトをコピーして、
              <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
                claude.ai
              </a>
              などのチャット AI に貼り付けて送信します。
              <PromptBox text={result.prompt} />
            </li>
            <li>
              AI の答え（「タイトル:」と「[1] 英文」の行）をコピーして、ここに貼り付けます。
              <textarea
                className="ai-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={8}
                placeholder={"タイトル: The Last Signal\n[1] Maya had always been skeptical of ...\n訳: ...\n語句: ..."}
              />
            </li>
            <li>
              <button type="button" onClick={create} disabled={pending || !answer.trim()}>
                {pending && answer ? "作成中…" : "物語のデッキを作る"}
              </button>
            </li>
          </ol>
        </section>
      )}
    </>
  );
}
