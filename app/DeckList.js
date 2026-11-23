"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ConfirmButton from "@/app/components/ConfirmButton";
import TagFilter from "@/app/components/TagFilter";
import { tagCandidates } from "@/lib/tagCandidates";
import { deleteDecks } from "./actions";

// デッキの一覧。チェックを付けて、まとめて削除できる
export default function DeckList({ decks: allDecks }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 絞り込みのタグは URL（?tag=英語&tag=ビジネス）に持たせる。戻る・再読み込みでも残る
  const activeTags = searchParams.getAll("tag");
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const hasTags = useMemo(() => allDecks.some((d) => d.tags.length > 0), [allDecks]);
  // 追加したタグをすべて持つデッキだけ（AND 条件）
  const decks = allDecks.filter((d) => activeTags.every((t) => d.tags.includes(t)));
  // 今の結果をさらに絞り込めるタグと、その件数
  const candidates = useMemo(() => tagCandidates(decks, activeTags), [decks, activeTags]);
  const visibleSelected = new Set([...selected].filter((id) => decks.some((d) => d.id === id)));
  const allSelected = decks.length > 0 && visibleSelected.size === decks.length;
  const cardCount = decks.filter((d) => visibleSelected.has(d.id)).reduce((n, d) => n + d.card_count, 0);

  function filterBy(tags) {
    setSelected(new Set());
    const q = new URLSearchParams();
    for (const t of tags) q.append("tag", t);
    router.replace(tags.length ? `/?${q}` : "/", { scroll: false });
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const r = await deleteDecks([...visibleSelected]);
      if (r.error) setError(r.error);
      else setSelected(new Set());
    });
  }

  return (
    <>
      {hasTags && <TagFilter activeTags={activeTags} candidates={candidates} onChange={filterBy} />}
      <p className="note">
        {activeTags.length
          ? `タグ「${activeTags.join("」かつ「")}」の単語帳 ${decks.length} 冊（全 ${allDecks.length} 冊）`
          : `${allDecks.length} 冊の単語帳`}
      </p>
      {decks.length === 0 && (
        <p className="note small">条件に合う単語帳はありません。タグを外してください。</p>
      )}
      <div className="select-bar">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setSelected(allSelected ? new Set() : new Set(decks.map((d) => d.id)))}
          disabled={pending}
        >
          {allSelected ? "選択をすべて外す" : `すべて選ぶ（${decks.length} 個）`}
        </button>
        {visibleSelected.size > 0 && (
          <ConfirmButton
            label={`選んだ ${visibleSelected.size} 個を削除`}
            confirmMessage={`単語帳 ${visibleSelected.size} 冊と、中のカード ${cardCount} 枚を削除します。元に戻せません。`}
            confirmLabel="削除する"
            pendingLabel="削除中…"
            pending={pending}
            onConfirm={onDelete}
          />
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <ul className="decks">
        {decks.map((deck) => (
          // 覚えた単語で作った物語のデッキは、淡い色と「物語」の印で区別する
          <li
            key={deck.id}
            className={`card-row${deck.kind === "story" ? " story-deck" : ""}${selected.has(deck.id) ? " checked" : ""}`}
          >
            <input
              type="checkbox"
              className="card-check"
              checked={selected.has(deck.id)}
              onChange={() => toggle(deck.id)}
              aria-label={`単語帳「${deck.name}」を選ぶ`}
            />
            <Link href={`/decks/${deck.id}`}>
              <span className="deck-main">
                <span className="deck-name">
                  {deck.kind === "story" && <span className="story-badge">物語</span>}
                  {deck.name}
                </span>
                {deck.comprehension && (
                  <span
                    className="deck-progress"
                    title={`字幕の ${deck.comprehension.total} 文のうち、${deck.comprehension.understood} 文が全部わかる`}
                  >
                    <span className="deck-progress-bar" aria-hidden="true">
                      <span style={{ width: `${deck.comprehension.percent}%` }} />
                    </span>
                    <span className="deck-progress-label">
                      理解度 {deck.comprehension.percent}%{deck.comprehension.percent === 100 && " クリア！"}
                    </span>
                  </span>
                )}
                {deck.tags.length > 0 && (
                  <span className="deck-tags">
                    {deck.tags.map((t) => (
                      <span key={t} className="tag-chip">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="deck-count">
                {deck.due_count > 0 && <span className="deck-due">今日 {deck.due_count} 枚 · </span>}
                {deck.card_count} 枚
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
