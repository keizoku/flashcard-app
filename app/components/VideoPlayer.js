"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useStudyClock } from "@/app/components/studyTimer";
import { videoUrl } from "@/lib/youtube";

// アプリの中で YouTube の動画を再生する。再生している間を、リスニングの時間として記録する。
// YouTube の IFrame Player API（API キー不要）を使う。
// ref.playAt(秒) で、その場所から再生する

let apiPromise = null;
function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const PLAYING = 1;
// 動画の持ち主が、ほかのサイトでの再生を止めている
const EMBED_BLOCKED = new Set([101, 150]);

const VideoPlayer = forwardRef(function VideoPlayer({ videoId, deckId, start = null, autoplay = false, onPlayingChange }, ref) {
  const holderRef = useRef(null);
  const playerRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const onPlayingRef = useRef(onPlayingChange);
  onPlayingRef.current = onPlayingChange;
  const [blocked, setBlocked] = useState(false);
  const clock = useStudyClock({ kind: "listening", deckId });

  useImperativeHandle(ref, () => ({
    playAt(seconds) {
      const player = playerRef.current;
      if (player?.seekTo) {
        player.seekTo(seconds ?? 0, true);
        player.playVideo();
      } else {
        pendingSeekRef.current = seconds ?? 0;
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let player = null;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !holderRef.current) return;
      const target = document.createElement("div");
      holderRef.current.replaceChildren(target);
      player = new YT.Player(target, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: { start: start ?? 0, autoplay: autoplay ? 1 : 0, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            playerRef.current = player;
            if (pendingSeekRef.current !== null) {
              player.seekTo(pendingSeekRef.current, true);
              player.playVideo();
              pendingSeekRef.current = null;
            }
          },
          onStateChange: (e) => {
            const playing = e.data === PLAYING;
            if (playing) clock.activity(Date.now());
            else clock.pause(Date.now());
            onPlayingRef.current?.(playing);
          },
          onError: (e) => {
            if (EMBED_BLOCKED.has(e.data)) setBlocked(true);
          },
        },
      });
    }, () => {});
    return () => {
      cancelled = true;
      clock.pause(Date.now());
      onPlayingRef.current?.(false);
      playerRef.current = null;
      player?.destroy?.();
    };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="video-player">
      {blocked ? (
        <p className="note small">
          この動画は、持ち主の設定でアプリの中では再生できません。
          <a href={videoUrl(videoId, start)} target="_blank" rel="noreferrer">
            YouTube で開く
          </a>
          （リスニングの時間は、統計の画面で手で足せます）
        </p>
      ) : (
        <div className="video-frame" ref={holderRef} />
      )}
    </div>
  );
});

export default VideoPlayer;
