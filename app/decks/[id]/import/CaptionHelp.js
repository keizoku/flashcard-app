"use client";

import { useState } from "react";
import { CAPTION_HELP_CLOSED, CAPTION_HELP_COOKIE, PREF_COOKIE_MAX_AGE } from "@/lib/uiPrefs";

// 「YouTube の字幕をコピーする方法」。はじめは開いて出す。
// 「閉じる」を押したら、そのことを Cookie に覚えて、次からは1行だけ（押すと開く）にする
export default function CaptionHelp({ initialClosed }) {
  const [closed, setClosed] = useState(initialClosed);

  function close() {
    document.cookie = `${CAPTION_HELP_COOKIE}=${CAPTION_HELP_CLOSED}; path=/; max-age=${PREF_COOKIE_MAX_AGE}; SameSite=Lax`;
    setClosed(true);
  }

  if (closed) {
    return (
      <details className="help">
        <summary>YouTube の字幕をコピーする方法</summary>
        <Steps />
      </details>
    );
  }
  return (
    <section className="help help-open" aria-label="YouTube の字幕をコピーする方法">
      <div className="help-head">
        <strong>YouTube の字幕をコピーする方法</strong>
        <button type="button" className="link-button" onClick={close}>
          閉じる
        </button>
      </div>
      <Steps />
    </section>
  );
}

function Steps() {
  return (
    <ol>
      <li>パソコンのブラウザで YouTube の動画を開く</li>
      <li>動画の説明欄の下にある「文字起こしを表示」を押す</li>
      <li>右側に出た文字起こしを、マウスで最初から最後まで選択してコピー</li>
      <li>下の欄に貼り付ける（時刻が一緒に入っていると、カードからその場面を再生できます）</li>
    </ol>
  );
}
