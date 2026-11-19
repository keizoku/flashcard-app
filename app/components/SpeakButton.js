"use client";

import { useEffect, useState } from "react";
import { isSpeechSupported, speak } from "./speech";

// 英文を読み上げるボタン。読み上げに対応していないブラウザでは出さない
// slow: true で、ゆっくり（0.7倍）読み上げるボタンにする
// shortcut: キーボードの操作をボタンに小さく表示する（パソコンだけ。タッチの端末では CSS で隠れる）
export default function SpeakButton({ text, slow = false, label, shortcut, className = "" }) {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(isSpeechSupported()), []);
  if (!supported || !text) return null;

  return (
    <button
      type="button"
      className={`speak-button ${className}`}
      onClick={(e) => {
        // カードの開閉（<summary>）などに、クリックが伝わらないようにする
        e.preventDefault();
        e.stopPropagation();
        speak(text, slow ? { rate: 0.7 } : {});
      }}
      aria-label={label ?? (slow ? "ゆっくり読み上げる" : "読み上げる")}
      title={label ?? (slow ? "ゆっくり読み上げる" : "読み上げる")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        {!slow && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
      {slow && <span className="speak-label">ゆっくり</span>}
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}
