"use client";

import { useState } from "react";

const MAX_TAGS = 10;
const MAX_LENGTH = 20;

// デッキのタグを入力する部品。Enter かカンマで追加、× で外す。
// 今までに使ったタグは、押すだけで追加できる。値は name の hidden input（JSON の配列）で送る
export default function TagEditor({ name = "tags", initialTags = [], allTags = [] }) {
  const [tags, setTags] = useState(initialTags);
  const [text, setText] = useState("");

  function add(raw) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
    if (!tag) return;
    setTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase()) || prev.length >= MAX_TAGS ? prev : [...prev, tag]
    );
    setText("");
  }

  function onKeyDown(e) {
    // 日本語入力の変換中の Enter は、確定なので追加しない
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && tags.length) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  const suggestions = allTags.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  return (
    <div className="tag-editor">
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
      <div className="tag-input">
        {tags.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} aria-label={`タグ「${t}」を外す`}>
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[,、，]/g, ""))}
          onKeyDown={onKeyDown}
          onBlur={() => add(text)}
          placeholder={tags.length ? "" : "例: 英語、ビジネス（Enter で追加）"}
          maxLength={MAX_LENGTH}
          aria-label="タグを追加"
          disabled={tags.length >= MAX_TAGS}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="tag-suggestions">
          <span className="note small">使ったタグ:</span>
          {suggestions.map((t) => (
            <button key={t} type="button" className="tag-chip suggestion" onClick={() => add(t)}>
              ＋ {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
