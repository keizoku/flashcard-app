"use client";

import { useState } from "react";

// タグの絞り込み欄。追加したタグはすべて満たすデッキだけを出す（AND 条件）。
// 候補には、今の結果をさらに絞り込めるタグだけを、件数つきで出す
export default function TagFilter({ activeTags, candidates, onChange }) {
  const [text, setText] = useState("");
  const query = text.trim().toLowerCase();
  const shown = candidates.filter((c) => !query || c.tag.toLowerCase().includes(query));

  function add(tag) {
    if (!tag || activeTags.includes(tag)) return;
    onChange([...activeTags, tag]);
    setText("");
  }

  function onKeyDown(e) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      // 完全に一致するタグ、なければ候補の先頭を追加する
      const exact = candidates.find((c) => c.tag.toLowerCase() === query);
      add((exact ?? shown[0])?.tag);
    } else if (e.key === "Backspace" && !text && activeTags.length) {
      onChange(activeTags.slice(0, -1));
    } else if (e.key === "Escape") {
      setText("");
    }
  }

  return (
    <div className="tag-filter-box" role="search" aria-label="タグで絞り込む">
      <div className="tag-input">
        <span className="tag-filter-icon" aria-hidden="true">
          絞り込み
        </span>
        {activeTags.map((t, i) => (
          <span key={t} className="tag-filter-item">
            {i > 0 && <span className="and">かつ</span>}
            <span className="tag-chip active">
              {t}
              <button
                type="button"
                onClick={() => onChange(activeTags.filter((x) => x !== t))}
                aria-label={`絞り込みからタグ「${t}」を外す`}
              >
                ×
              </button>
            </span>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={activeTags.length ? "タグを足して、さらに絞り込む" : "タグを入力して絞り込む"}
          aria-label="絞り込むタグを入力"
        />
        {activeTags.length > 0 && (
          <button type="button" className="link-button" onClick={() => onChange([])}>
            クリア
          </button>
        )}
      </div>
      {shown.length > 0 ? (
        <div className="tag-filter">
          {shown.map((c) => (
            <button key={c.tag} type="button" className="tag-chip" onClick={() => add(c.tag)}>
              ＋ {c.tag}（{c.count}）
            </button>
          ))}
        </div>
      ) : (
        query && <p className="note small">「{text.trim()}」で絞り込めるタグはありません。</p>
      )}
    </div>
  );
}
