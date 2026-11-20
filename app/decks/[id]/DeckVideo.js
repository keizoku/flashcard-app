"use client";

import { createContext, useContext, useMemo, useRef } from "react";
import VideoPlayer from "@/app/components/VideoPlayer";

// デッキの動画を、デッキの画面の中で再生する（再生した時間はリスニングとして記録する）。
// カードの「▶ 動画のこの場面」は、この動画のカードなら、別のタブではなくここで再生する
const DeckVideoContext = createContext(null);

export function useDeckVideo() {
  return useContext(DeckVideoContext);
}

export default function DeckVideo({ videoId, deckId, children }) {
  const playerRef = useRef(null);
  const boxRef = useRef(null);
  const value = useMemo(
    () => ({
      videoId,
      playAt(seconds) {
        boxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        playerRef.current?.playAt(seconds);
      },
    }),
    [videoId]
  );

  return (
    <DeckVideoContext.Provider value={value}>
      <section className="deck-video" ref={boxRef} aria-label="動画">
        <VideoPlayer ref={playerRef} videoId={videoId} deckId={deckId} />
        <p className="note small">再生している間を、リスニングの時間として記録します（統計の画面で見られます）。</p>
      </section>
      {children}
    </DeckVideoContext.Provider>
  );
}
