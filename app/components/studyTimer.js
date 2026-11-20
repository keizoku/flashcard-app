"use client";

import { useEffect, useRef } from "react";
import { createStudyClock, splitSeconds } from "@/lib/studyClock";

// 勉強時間を測って、サーバー（/api/study-time）に送る部品
const FLUSH_MS = 30_000; // この間隔で、たまった時間を送る
export const VOCAB_IDLE_MS = 120_000; // 単語: 2分なにも操作しなければ、席を外したとみなす

// 送る。画面を閉じるときにも届くよう sendBeacon を使う（だめなら fetch の keepalive）
export function sendStudyTime(kind, deckId, seconds) {
  for (const part of splitSeconds(seconds)) {
    const body = JSON.stringify({ kind, deckId: deckId ?? null, seconds: part });
    const sent = navigator.sendBeacon?.("/api/study-time", new Blob([body], { type: "text/plain" }));
    if (!sent) {
      fetch("/api/study-time", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(
        () => {}
      );
    }
  }
}

// 時計を作り、30秒ごと・画面を隠したとき・閉じたとき・部品が消えたときに、たまった時間を送る
export function useStudyClock({ kind, deckId, idleMs }) {
  const clockRef = useRef(null);
  if (!clockRef.current) clockRef.current = createStudyClock({ idleMs });

  useEffect(() => {
    const clock = clockRef.current;
    const flush = () => sendStudyTime(kind, deckId, clock.take(Date.now()));
    const timer = setInterval(flush, FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      clock.pause(Date.now());
      flush();
    };
  }, [kind, deckId]);

  return clockRef.current;
}

// 単語を覚えた時間。画面を見ていて、操作がある間だけ数える。
// paused の間（動画を再生している間など）は数えない（その時間はリスニングとして数える）
export function useVocabTimer({ deckId, paused = false }) {
  const clock = useStudyClock({ kind: "vocab", deckId, idleMs: VOCAB_IDLE_MS });
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) clock.pause(Date.now());
    else if (document.visibilityState === "visible") clock.activity(Date.now());
  }, [paused, clock]);

  useEffect(() => {
    const onActivity = () => {
      if (!pausedRef.current && document.visibilityState === "visible") clock.activity(Date.now());
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clock.pause(Date.now());
      else onActivity();
    };
    const events = ["keydown", "pointerdown", "wheel", "touchstart"];
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    onActivity();
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clock]);
}
