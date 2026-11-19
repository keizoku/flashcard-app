"use client";

import { useRef, useState } from "react";

// チャット AI に貼り付けるプロンプトを表示して、ボタンでコピーできるようにする
export default function PromptBox({ text, label = "プロンプトをコピー" }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // クリップボード API が使えない環境では、選択してコピーする
      ref.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="prompt-box">
      <textarea ref={ref} readOnly value={text} rows={5} onFocus={(e) => e.target.select()} />
      <button type="button" className="secondary-button" onClick={copy}>
        {copied ? "コピーしました" : label}
      </button>
    </div>
  );
}
