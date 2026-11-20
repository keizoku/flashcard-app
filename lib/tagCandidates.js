// デッキの一覧で、今の結果をさらに絞り込めるタグと、その件数。
// 件数の多い順。同じ件数なら文字コード順にする。
// localeCompare は言語の設定で並びが変わり、サーバーとブラウザで画面が食い違うので使わない
export function tagCandidates(decks, activeTags) {
  const counts = new Map();
  for (const d of decks) for (const t of d.tags) if (!activeTags.includes(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}
