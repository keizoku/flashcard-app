"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CardDetails from "@/app/components/CardDetails";
import SpeakButton from "@/app/components/SpeakButton";
import { getSpeechSettings, speak, stopSpeaking, useSpeechSettings } from "@/app/components/speech";
import { useVocabTimer } from "@/app/components/studyTimer";
import VideoPlayer from "@/app/components/VideoPlayer";
import { HighlightedMany } from "@/app/components/Highlighted";
import { displayTarget } from "@/lib/format";
import { formatTime, videoUrl } from "@/lib/youtube";
import { recordReview, undoReview } from "./actions";

// 1枚ずつカードを出して、「覚えている / 覚えていない」を記録する。
// 「覚えていない」カードは、この回の最後にもう一度出す。
// 表の面で ← を押すと、前のカードに戻る（そのカードへの答えは取り消して、答え直せる）
export default function StudySession({ deckId, cards, studyAll }) {
  const [queue, setQueue] = useState(cards);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState({ remembered: 0, forgot: 0 });
  const [error, setError] = useState(null);
  // 答えるたびに、答える前の状態を積んでおく（前のカードに戻るため）
  const [history, setHistory] = useState([]);
  // 答えの面で「動画のこの場面」を押したカード（その場で動画を再生する）と、再生しているか
  const [videoCardId, setVideoCardId] = useState(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  // カードを出した回数。同じカードがもう一度出たとき（「もう一度」で続けて出るとき）も、出たことが分かるように
  const [shown, setShown] = useState(0);

  const card = queue[0];
  const speech = useSpeechSettings();

  // 「カードが出たら自動で読み上げる」設定なら、表の面（答えを考える面）を出したときに読み上げる
  useEffect(() => {
    if (card && getSpeechSettings().autoReadFront) speak(card.front);
    return () => stopSpeaking();
  }, [shown, card?.id, speech.autoReadFront]); // eslint-disable-line react-hooks/exhaustive-deps
  // めくったら（→ = わかった）読み上げを止める。答えの面では、自動では読み上げない（↑ で読み上げられる）
  useEffect(() => {
    if (revealed) stopSpeaking();
  }, [revealed]);
  const done = !card;
  // 単語を覚えた時間を測る。動画を再生している間はリスニングとして数えるので、こちらは止める。終わったあとも止める
  useVocabTimer({ deckId, paused: done || videoPlaying });
  const total = cards.length;
  const firstTimeLeft = queue.filter((c) => !c.retry).length;

  const answer = useCallback(
    (remembered) => {
      if (!card || !revealed) return;
      stopSpeaking(); // 答えの面で ↑ で読み上げていたら止める
      // 記録は裏で送り、画面はすぐ次のカードへ
      const saving = recordReview(card.id, remembered).then(
        (r) => {
          if (r.error) setError(r.error);
          return r;
        },
        () => {
          setError("記録できませんでした。ページを再読み込み（⌘R）してから、もう一度試してください");
          return {};
        }
      );
      setHistory((h) => [...h, { queue, counts, saving }]);
      setCounts((c) => (remembered ? { ...c, remembered: c.remembered + 1 } : { ...c, forgot: c.forgot + 1 }));
      setQueue((q) => (remembered ? q.slice(1) : [...q.slice(1), { ...card, retry: true }]));
      setShown((n) => n + 1);
      setRevealed(false);
    },
    [card, revealed, queue, counts]
  );

  // 前のカードに戻る。そのカードへの答えは取り消す
  const goBack = useCallback(() => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setQueue(last.queue);
    setCounts(last.counts);
    setShown((n) => n + 1);
    setRevealed(false);
    setError(null);
    last.saving
      .then((r) => (r.logId ? undoReview(r.logId) : { error: "前の答えを取り消せませんでした" }))
      .then((r) => r?.error && setError(r.error))
      .catch(() => setError("前の答えを取り消せませんでした。ページを再読み込み（⌘R）してください"));
  }, [history]);

  // キーボード:
  //   表の面   … → で答えを見る（スペース/Enter でも可）、← で前のカードに戻る
  //   答えの面 … ← または 1 で覚えていない、→ または 2 で覚えている
  //   どちらでも … ↑ で読み上げ、Shift+↑ でゆっくり読み上げ
  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (e.repeat) return; // キーの押しっぱなしで、めくって次へ進んでしまわないように
      if (e.key === "ArrowUp" && card) {
        // ↑ で読み上げ（Shift+↑ でゆっくり）。ページのスクロールはしない
        e.preventDefault();
        speak(card.front, e.shiftKey ? { rate: 0.7 } : {});
        return;
      }
      if (!revealed && e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (!revealed && (e.key === "ArrowRight" || e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && (e.key === "ArrowLeft" || e.key === "1")) {
        answer(false);
      } else if (revealed && (e.key === "ArrowRight" || e.key === "2")) {
        answer(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, answer, goBack, card]);

  if (done) {
    return (
      <div className="study-done">
        <h1>お疲れさまでした</h1>
        <p>
          {total} 枚を学習しました（覚えている {counts.remembered} 回 / 覚えていない {counts.forgot} 回）。
        </p>
        <p className="note small">
          覚えていたカードは、だんだん間隔をあけて出てきます（1日後 → 3日後 → 1週間後 …）。
        </p>
        <div className="form-buttons">
          <button type="button" className="secondary-button" onClick={goBack}>
            ← 最後のカードに戻る
          </button>
          <Link href={`/decks/${deckId}`} className="button-link">
            単語帳に戻る
          </Link>
          {!studyAll && (
            <Link href={`/decks/${deckId}/study?all=1`} className="button-link">
              全カードをもう一度
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="study">
      <div className="study-progress">
        <span>
          残り {firstTimeLeft} 枚{queue.length > firstTimeLeft && `（＋やり直し ${queue.length - firstTimeLeft} 枚）`}
        </span>
        <span>
          覚えている {counts.remembered} / 覚えていない {counts.forgot}
        </span>
      </div>
      <div className="study-bar" aria-hidden="true">
        <div style={{ width: `${((total - firstTimeLeft) / total) * 100}%` }} />
      </div>

      <section className="study-card" aria-live="polite">
        {card.retry && <span className="tag">もう一度</span>}
        <p className="study-front">
          <HighlightedMany text={card.front} forms={(card.targets ?? []).map((t) => t.form)} />
        </p>
        <div className="speak-row">
          <SpeakButton text={card.front} label="読み上げる（↑）" shortcut="↑" />
          <SpeakButton text={card.front} slow label="ゆっくり読み上げる（Shift+↑）" shortcut="Shift+↑" />
        </div>

        {revealed ? (
          <div className="study-back">
            {card.targets?.length > 0 && (
                <p className="card-word">{card.targets.map((t) => displayTarget(t.word)).join(" / ")}</p>
              )}
            {card.back && <p className="card-note">{card.back}</p>}
            <CardDetails card={card} />
            {card.video_id && (
              <p className="card-actions">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setVideoCardId(videoCardId === card.id ? null : card.id)}
                >
                  {videoCardId === card.id ? "動画を閉じる" : "▶ 動画のこの場面"}
                  {card.start_seconds !== null && `（${formatTime(card.start_seconds)}）`}
                </button>
                <a href={videoUrl(card.video_id, card.start_seconds)} target="_blank" rel="noreferrer">
                  YouTube で開く
                </a>
              </p>
            )}
            {card.video_id && videoCardId === card.id && (
              <VideoPlayer
                key={card.id}
                videoId={card.video_id}
                deckId={deckId}
                start={card.start_seconds}
                autoplay
                onPlayingChange={setVideoPlaying}
              />
            )}
          </div>
        ) : (
          <div className="study-front-actions">
            <button
              type="button"
              className="study-back-button"
              onClick={goBack}
              disabled={history.length === 0}
              aria-label="前のカードに戻る"
            >
              <kbd>←</kbd> 前へ
            </button>
            <button type="button" className="study-reveal" onClick={() => setRevealed(true)}>
              答えを見る <kbd>→</kbd>
            </button>
          </div>
        )}
      </section>

      {revealed && (
        <div className="study-answers">
          <button type="button" className="study-forgot" onClick={() => answer(false)}>
            覚えていない <kbd>←</kbd>
          </button>
          <button type="button" className="study-remembered" onClick={() => answer(true)}>
            覚えている <kbd>→</kbd>
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
