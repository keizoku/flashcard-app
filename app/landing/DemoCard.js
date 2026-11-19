"use client";

import { useState } from "react";

// ホームページの、さわれる見本のカード（学習の画面と同じ流れ: 答えを見る → 覚えている / 覚えていない）
const CARDS = [
  { en: ["I was ", "skeptical", " about the plan at first."], ja: "最初は、その計画に懐疑的だった。", word: "skeptical", meaning: "疑い深い、懐疑的な" },
  { en: ["We finally ", "figured it out", " together."], ja: "私たちはついに、一緒にそれを解き明かした。", word: "figure sth out", meaning: "（考えて）わかる、解決する" },
  { en: ["That was a ", "reasonable", " price for the tickets."], ja: "チケットにしては、手ごろな値段だった。", word: "reasonable", meaning: "手ごろな、妥当な" },
];

export default function DemoCard() {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState({ remembered: 0, forgot: 0 });
  const done = index >= CARDS.length;
  const card = CARDS[index];

  function answer(remembered) {
    setCounts((c) => ({ ...c, [remembered ? "remembered" : "forgot"]: c[remembered ? "remembered" : "forgot"] + 1 }));
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  return (
    <div className="lp-demo" aria-label="見本のカード（さわってみてください）">
      <div className="lp-demo-head">
        <span>{done ? "おつかれさま！" : `残り ${CARDS.length - index} 枚`}</span>
        <span>
          覚えている {counts.remembered} / 覚えていない {counts.forgot}
        </span>
      </div>
      <div className="lp-demo-bar" aria-hidden="true">
        <span style={{ width: `${(index / CARDS.length) * 100}%` }} />
      </div>
      {done ? (
        <div className="lp-demo-card lp-demo-done">
          <p className="lp-demo-big">3 枚を学習しました</p>
          <p>覚えていないカードは、明日また出てきます。これが毎日の 1 セットです。</p>
          <button
            type="button"
            className="lp-demo-again"
            onClick={() => {
              setIndex(0);
              setCounts({ remembered: 0, forgot: 0 });
            }}
          >
            もう一度さわる
          </button>
        </div>
      ) : (
        <div className="lp-demo-card">
          <p className="lp-demo-en">
            {card.en[0]}
            <mark>{card.en[1]}</mark>
            {card.en[2]}
          </p>
          {revealed ? (
            <div className="lp-demo-back">
              <p>{card.ja}</p>
              <p className="lp-demo-meaning">
                <strong>{card.word}</strong>：{card.meaning}
              </p>
            </div>
          ) : (
            <p className="lp-demo-hint">意味を思い出してから、答えを見てみましょう</p>
          )}
          {revealed ? (
            <div className="lp-demo-actions">
              <button type="button" className="lp-demo-forgot" onClick={() => answer(false)}>
                覚えていない
              </button>
              <button type="button" className="lp-demo-remembered" onClick={() => answer(true)}>
                覚えている
              </button>
            </div>
          ) : (
            <button type="button" className="lp-demo-reveal" onClick={() => setRevealed(true)}>
              答えを見る
            </button>
          )}
        </div>
      )}
      <p className="lp-demo-caption">↑ 見本です。さわってみてください</p>
    </div>
  );
}
