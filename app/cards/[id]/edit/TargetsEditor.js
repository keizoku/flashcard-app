"use client";

import { useState } from "react";

const MAX_TARGETS = 3;
const empty = { form: "", word: "", meaning: "", translation_form: "" };

// カードの覚えたい語（最大3つ）を編集する。値は name の hidden input（JSON の配列）で送る
export default function TargetsEditor({ name = "targets", initialTargets = [] }) {
  const [rows, setRows] = useState(initialTargets.length ? initialTargets : []);

  function update(i, key, value) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  return (
    <fieldset className="ai-fieldset">
      <legend>覚えたい語（{rows.length} / {MAX_TARGETS}）</legend>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length === 0 && <p className="note small">ありません（単語カードなど）。</p>}
      {rows.map((r, i) => (
        <div key={i} className="target-row">
          <div className="form-row">
            <label>
              強調する語句（文の中の形のまま）
              <input value={r.form} onChange={(e) => update(i, "form", e.target.value)} placeholder="例: ran / figured it out" />
            </label>
            <label>
              見出し（原形・イディオム）
              <input value={r.word} onChange={(e) => update(i, "word", e.target.value)} placeholder="例: run / figure sth out" />
            </label>
          </div>
          <div className="form-row">
            <label>
              この文での意味
              <input value={r.meaning ?? ""} onChange={(e) => update(i, "meaning", e.target.value)} />
            </label>
            <label>
              和訳の中で強調する部分
              <input
                value={r.translation_form ?? ""}
                onChange={(e) => update(i, "translation_form", e.target.value)}
                placeholder="例: 専用"
              />
            </label>
          </div>
          <button
            type="button"
            className="link-button danger"
            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
          >
            この語を外す
          </button>
        </div>
      ))}
      {rows.length < MAX_TARGETS && (
        <button type="button" className="secondary-button" onClick={() => setRows((prev) => [...prev, { ...empty }])}>
          ＋ 語を追加
        </button>
      )}
    </fieldset>
  );
}
