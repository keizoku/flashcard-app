"use client";

import Link from "next/link";
import { useState } from "react";
import { formatTime, videoUrl } from "@/lib/youtube";

// おすすめの動画の「レベルに合うか」の表示
const FIT_LABELS = { good: "ちょうどいい", easy: "やさしい", hard: "むずかしい" };

// おすすめの動画1本。サムネイル（または「ここで再生」）でその場で再生し、タイトルで YouTube を開く
function VideoResult({ video }) {
  const [playing, setPlaying] = useState(false);
  const newDeckHref = `/decks/new?${new URLSearchParams({ video: video.id, name: video.title, back: "/search" })}`;
  const length = video.seconds ? `約 ${formatTime(video.seconds)}` : null;

  return (
    <li className="video-result">
      <div className="video-thumb">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&cc_load_policy=1&cc_lang_pref=en&hl=en`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button type="button" className="thumb-button" onClick={() => setPlaying(true)} title="ここで再生する">
            <img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy" />
            {length && <span className="thumb-time">{length}</span>}
            <span className="thumb-play" aria-hidden="true">▶</span>
          </button>
        )}
      </div>
      <div className="video-body">
        <h2 className="video-title">
          <a href={videoUrl(video.id)} target="_blank" rel="noopener noreferrer">
            {video.title}
          </a>
        </h2>
        <p className="note small">
          {video.channel}
          {length && ` ・ ${length}`}
        </p>
        <p className="video-badges">
          <span className={`badge fit-${video.fit}`}>{FIT_LABELS[video.fit]}</span>{" "}
          <span className="small">
            理解度 {video.percent}%（全部わかる文 {video.understood} / {video.total}）・ 新しい語が1つの文 {video.iPlus1} ・{" "}
            {video.learners}人が学習
          </span>
        </p>
        <div className="video-actions">
          {!playing && (
            <button type="button" className="secondary-button" onClick={() => setPlaying(true)}>
              ここで再生
            </button>
          )}
          <a href={videoUrl(video.id)} target="_blank" rel="noopener noreferrer" className="button-link">
            YouTube で見る ↗
          </a>
          <Link href={newDeckHref} className="button-link primary">
            この動画でデッキを作る
          </Link>
        </div>
      </div>
    </li>
  );
}

// おすすめの動画（みんなが学んだ動画を、あなたのレベルに合う順に）
export function Recommendations({ videos }) {
  return (
    <section className="search-results recommendations">
      <h2 className="section-title">あなたへのおすすめ（みんなが学んだ動画）</h2>
      <p className="note small">
        ほかの人が字幕を入れてデッキにした動画を、あなたのレベルと覚えた語で解析しました。
        「ちょうどいい」は、全部わかる文が5〜8割の動画です。自分のデッキにある動画は出しません。
      </p>
      {videos.length === 0 ? (
        <p className="note">まだおすすめできる動画がありません。字幕を入れたデッキが増えると、ここに出てきます。</p>
      ) : (
        <ul className="video-list">
          {videos.map((v) => (
            <VideoResult key={v.id} video={v} />
          ))}
        </ul>
      )}
    </section>
  );
}
