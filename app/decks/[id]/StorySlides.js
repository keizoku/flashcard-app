"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HighlightedMany, HighlightedParts } from "@/app/components/Highlighted";
import { speak, stopSpeaking } from "@/app/components/speech";
import { useStudyClock } from "@/app/components/studyTimer";
import { useSwipeKeys } from "@/app/components/useSwipeKeys";
import { sceneForSentence } from "@/lib/sceneUtils";

// 物語のスライド。1枚目は題名と使った単語、そのあと1文ずつ大きく出す。
// 場面の絵があれば、文の上に出す（題名のスライドには最初の場面の絵）。
// 自動再生: 今の文を読み上げ、読み終わったら少しあけて次の文へ。最後の文を読み終わったら止まる。
// 自動再生している間を、このデッキのリスニングの時間として記録する。
// キーボード: ← → で前後、スペースで自動再生 / 止める、↑ で今の文を読み上げ、Esc で閉じる
// iPhone・iPad では、左右のスワイプで前後へ（本のページと同じ向き: 指を左へ → 次の文）
const GAP_MS = 1200; // 文と文の間

export default function StorySlides({ deckId, title, sentences, scenes = [], onClose }) {
  const [index, setIndex] = useState(0); // 0 = 題名、1〜 = 文
  const [playing, setPlaying] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const boxRef = useRef(null);
  const clock = useStudyClock({ kind: "listening", deckId });
  const last = sentences.length;
  const sentence = index > 0 ? sentences[index - 1] : null;
  const words = [...new Set(sentences.flatMap((s) => s.forms))];
  const scene = index > 0 ? sceneForSentence(scenes, index - 1) : scenes[0] ?? null;
  const nextScene = sceneForSentence(scenes, index); // 次の文の場面（絵を先に読み込んでおく）

  const go = useCallback((i) => setIndex(Math.max(0, Math.min(last, i))), [last]);

  // 自動再生している間だけ、リスニングの時間を数える
  useEffect(() => {
    if (playing) clock.activity(Date.now());
    else clock.pause(Date.now());
  }, [playing, clock]);

  // 自動再生: 今の文を読み上げて、読み終わったら次へ
  useEffect(() => {
    if (!playing) return;
    if (index === 0) {
      setIndex(1);
      return;
    }
    let alive = true;
    let timer = null;
    speak(sentences[index - 1].text, {
      onEnd: () => {
        if (!alive) return;
        if (index < last) timer = setTimeout(() => alive && setIndex(index + 1), GAP_MS);
        else setPlaying(false);
      },
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      stopSpeaking();
    };
  }, [playing, index, last, sentences]);

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= last) setIndex(1); // 最後まで見たあとは、最初の文から
    setPlaying(true);
  }, [playing, index, last]);

  const readCurrent = useCallback(() => {
    if (sentence) speak(sentence.text);
  }, [sentence]);

  // 開いている間は、後ろのページをスクロールさせない。閉じたら読み上げを止める
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    boxRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      stopSpeaking();
    };
  }, []);

  useSwipeKeys({ pageTurn: true });
  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        readCurrent();
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, togglePlay, readCurrent, onClose]);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else boxRef.current?.requestFullscreen?.().catch(() => {});
  }

  return (
    <div className="slides" role="dialog" aria-modal="true" aria-label="物語のスライド" ref={boxRef} tabIndex={-1}>
      <div className="slides-bar">
        <span className="slide-count">
          {index} / {last}
        </span>
        <div className="slides-bar-actions">
          <label className="choice">
            <input type="checkbox" checked={showTranslation} onChange={(e) => setShowTranslation(e.target.checked)} />
            和訳を表示
          </label>
          <button type="button" className="secondary-button" onClick={toggleFullscreen}>
            全画面
          </button>
          <button type="button" className="secondary-button" onClick={onClose} aria-label="スライドを閉じる（Esc）">
            ✕ 閉じる
          </button>
        </div>
      </div>

      <div className={`slide-stage${scene?.image ? " with-image" : ""}`} onClick={readCurrent}>
        {scene?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="slide-image" src={scene.image} alt="この場面の絵" />
        )}
        {nextScene?.image && nextScene.image !== scene?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="slide-preload" src={nextScene.image} alt="" aria-hidden="true" />
        )}
        {sentence ? (
          <>
            <p className="slide-sentence">
              <HighlightedMany text={sentence.text} forms={sentence.forms} />
            </p>
            {showTranslation && sentence.translation && (
              <p className="slide-ja">
                <HighlightedParts text={sentence.translation} parts={sentence.parts} />
              </p>
            )}
            {sentence.forms.length > 0 && (
              <p className="slide-words">
                {sentence.forms.map((w) => (
                  <span key={w} className="tag-chip">
                    {w}
                  </span>
                ))}
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="slide-title">{title}</h2>
            {words.length > 0 && (
              <p className="slide-words">
                使った単語:{" "}
                {words.map((w) => (
                  <span key={w} className="tag-chip">
                    {w}
                  </span>
                ))}
              </p>
            )}
            <p className="note small no-touch">→ で次へ。スペースで自動再生（読み上げながら進む）。</p>
            <p className="note small touch-only">左へスワイプで次へ。「▶ 自動再生」で読み上げながら進む。</p>
          </>
        )}
      </div>

      <div className="slides-controls">
        <button type="button" className="secondary-button" onClick={() => go(index - 1)} disabled={index === 0}>
          ← 前へ
        </button>
        <button type="button" className="study-link button-link" onClick={togglePlay}>
          {playing ? "■ 止める" : "▶ 自動再生"}
        </button>
        <button type="button" className="secondary-button" onClick={() => go(index + 1)} disabled={index === last}>
          次へ →
        </button>
      </div>
      <div className="slides-progress" aria-hidden="true">
        <div style={{ width: `${(index / Math.max(1, last)) * 100}%` }} />
      </div>
    </div>
  );
}
