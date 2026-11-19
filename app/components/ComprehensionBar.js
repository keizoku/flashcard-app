// 動画の理解度を1本の横棒で表す（全部わかる / 学習中の語を覚えればわかる / まだ知らない語がある）
// 色は統計ページと同じ（覚えた=青、覚え中=水色、未学習=灰色）
export default function ComprehensionBar({ comprehension: c }) {
  const rest = c.total - c.understood - c.waiting;
  const parts = [
    { key: "learned", label: "全部わかる", n: c.understood },
    { key: "learning", label: "学習中の語を覚えればわかる", n: c.waiting },
    { key: "new", label: "まだ知らない語がある", n: rest },
  ];
  return (
    <div className="comprehension">
      <div
        className="stacked-bar"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.n}文`).join("、")}
      >
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <span key={p.key} className={`seg status-${p.key}`} style={{ flexGrow: p.n }} data-tip={`${p.label} ${p.n} 文`} />
          ))}
      </div>
      <ul className="legend" aria-label="凡例">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`swatch status-${p.key}`} aria-hidden="true" />
            {p.label} {p.n}
          </li>
        ))}
      </ul>
    </div>
  );
}
