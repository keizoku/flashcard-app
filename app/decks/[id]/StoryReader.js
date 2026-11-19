"use client";

import { useEffect, useState } from "react";
import { HighlightedMany, HighlightedParts } from "@/app/components/Highlighted";
import { isSpeechSupported, speak, speakSequence, stopSpeaking } from "@/app/components/speech";

// 物語を通して読む。使った単語を強調し、和訳の表示切り替えと、全文の読み上げができる
// sentences: [{ text, translation, forms: [英文の中の語], parts: [和訳の中の部分] }]
export default function StoryReader({ title, sentences }) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [reading, setReading] = useState(-1); // 読み上げ中の文の番号（-1 = 止まっている）
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(isSpeechSupported());
    return () => stopSpeaking();
  }, []);

  function readAll() {
    if (reading >= 0) {
      stopSpeaking();
      setReading(-1);
      return;
    }
    speakSequence(
      sentences.map((s) => s.text),
      { onSentence: (i) => setReading(i), onDone: () => setReading(-1) }
    );
  }

  return (
    <section className="story">
      <div className="story-head">
        <h2>{title}</h2>
        <div className="actions-row">
          {supported && (
            <button type="button" className="secondary-button" onClick={readAll}>
              {reading >= 0 ? "■ 止める" : "▶ 全文を読み上げる"}
            </button>
          )}
          <label className="choice">
            <input type="checkbox" checked={showTranslation} onChange={(e) => setShowTranslation(e.target.checked)} />
            和訳を表示
          </label>
        </div>
      </div>
      <div className="story-body">
        {sentences.map((s, i) => (
          <p key={i} className={`story-sentence${reading === i ? " reading" : ""}`}>
            <span
              className="story-en"
              role={supported ? "button" : undefined}
              tabIndex={supported ? 0 : undefined}
              title={supported ? "クリックでこの文を読み上げる" : undefined}
              onClick={() => supported && speak(s.text)}
              onKeyDown={(e) => supported && e.key === "Enter" && speak(s.text)}
            >
              <HighlightedMany text={s.text} forms={s.forms} />
            </span>
            {showTranslation && s.translation && (
              <span className="story-ja">
                <HighlightedParts text={s.translation} parts={s.parts} />
              </span>
            )}
          </p>
        ))}
      </div>
    </section>
  );
}
