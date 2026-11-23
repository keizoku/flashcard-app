import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listPublicDecks } from "@/lib/sharing";

export const dynamic = "force-dynamic";
export const metadata = { title: "みんなの単語帳 | フラッシュカード" };

const dateText = (d) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(d);

// みんなのデッキ: 公開中のデッキの一覧。開くと中身を見て、自分のデッキに取り込める
export default async function SharedDecksPage() {
  const user = await requireUser();
  const decks = await listPublicDecks(user.id);

  return (
    <main>
      <h1>みんなの単語帳</h1>
      <p className="note">
        公開されている単語帳です。取り込むと、その時点のカードが自分の単語帳としてコピーされます（学習は最初から）。
        自分の単語帳を公開するときは、単語帳の「編集」から。
      </p>
      {decks.length === 0 ? (
        <div className="empty-state">
          <p>まだ公開されている単語帳はありません。</p>
        </div>
      ) : (
        <ul className="decks shared-decks">
          {decks.map((d) => (
            <li key={d.id}>
              <Link href={`/shared/${d.id}`}>
                <span className="deck-main">
                  <span className="deck-name">{d.name}</span>
                  <span className="shared-meta">
                    {d.display_name} · {dateText(d.published_at)} 公開
                    {d.kind === "story" && " · 物語"}
                  </span>
                  {d.tags.length > 0 && (
                    <span className="deck-tags">
                      {d.tags.map((t) => (
                        <span key={t} className="tag-chip">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="deck-count">
                  {d.is_mine ? <span className="shared-badge">自分の単語帳</span> : d.imported_deck_id && <span className="shared-badge">取り込みずみ</span>}
                  {d.card_count} 枚
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
