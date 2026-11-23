"use client";

import Link from "next/link";
import { useState } from "react";
import { FITS, LENGTHS, filterVideos } from "@/lib/videoFilter";
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
            この動画で単語帳を作る
          </Link>
        </div>
      </div>
    </li>
  );
}

function Select({ label, options, value, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// みんなが学んだ動画（あなたのレベルに合う順）。キーワード・レベル・長さで、その場で絞り込む
export function Recommendations({ videos }) {
  const [q, setQ] = useState("");
  const [fit, setFit] = useState("all");
  const [length, setLength] = useState("any");

  if (videos.length === 0) {
    return (
      <div className="notice">
        <p>まだ探せる動画がありません。字幕を入れた単語帳が増えると、ここに出てきます。</p>
        <p className="note small">
          それまでは、YouTube で好きな動画を見つけて、その URL を<Link href="/decks/new">新しい単語帳</Link>に貼ってください。
        </p>
      </div>
    );
  }
  const shown = filterVideos(videos, { q, fit, length });
  return (
    <section className="search-results recommendations">
      <div className="add-form search-form">
        <label className="search-q">
          キーワード（タイトル・チャンネル名）
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="例: travel, cooking" />
        </label>
        <div className="search-grid">
          <Select label="レベル" options={FITS} value={fit} onChange={setFit} />
          <Select label="長さ" options={LENGTHS} value={length} onChange={setLength} />
        </div>
        <p className="note small">「ちょうどいい」は、全部わかる文が5〜8割の動画です。自分の単語帳にある動画は出しません。</p>
        <p className="search-count small">
          {videos.length}本のうち <b>{shown.length}本</b>を表示
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="note">条件に合う動画がありません。条件をゆるめてみてください。</p>
      ) : (
        <ul className="video-list">
          {shown.map((v) => (
            <VideoResult key={v.id} video={v} />
          ))}
        </ul>
      )}
    </section>
  );
}
