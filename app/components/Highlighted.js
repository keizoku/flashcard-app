// 文の中の form（単語）を <mark> で強調する。サーバー・クライアントどちらでも使える
export default function Highlighted({ text, form }) {
  if (!form) return text;
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?<![A-Za-z'])${escaped}(?![A-Za-z'])`).exec(text);
  if (!m) return text;
  return (
    <>
      {text.slice(0, m.index)}
      <mark>{m[0]}</mark>
      {text.slice(m.index + m[0].length)}
    </>
  );
}

// 和訳など、単語の区切りがない文の中の一部（part）を強調する。最初に見つかった所だけ
export function HighlightedPart({ text, part }) {
  const i = part ? text.indexOf(part) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{part}</mark>
      {text.slice(i + part.length)}
    </>
  );
}

// 文の中の複数の語（forms）を強調する。英文用（単語の区切りで探す）
export function HighlightedMany({ text, forms }) {
  return <Spans text={text} spans={findSpans(text, forms, true)} />;
}

// 和訳の中の複数の部分（parts）を強調する
export function HighlightedParts({ text, parts }) {
  return <Spans text={text} spans={findSpans(text, parts, false)} />;
}

function findSpans(text, needles, wordBoundary) {
  const spans = [];
  for (const n of needles ?? []) {
    if (!n) continue;
    let from = -1;
    if (wordBoundary) {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp(`(?<![A-Za-z'])${escaped}(?![A-Za-z'])`).exec(text);
      from = m ? m.index : -1;
    } else {
      from = text.indexOf(n);
    }
    if (from >= 0) spans.push({ from, to: from + n.length });
  }
  return spans.sort((a, b) => a.from - b.from);
}

function Spans({ text, spans }) {
  const parts = [];
  let pos = 0;
  spans.forEach((s, i) => {
    if (s.from < pos) return; // 重なりは無視
    parts.push(text.slice(pos, s.from), <mark key={i}>{text.slice(s.from, s.to)}</mark>);
    pos = s.to;
  });
  parts.push(text.slice(pos));
  return <>{parts}</>;
}
