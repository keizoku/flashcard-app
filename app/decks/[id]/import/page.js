import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { CAPTION_HELP_CLOSED, CAPTION_HELP_COOKIE } from "@/lib/uiPrefs";
import { videoUrl } from "@/lib/youtube";
import CaptionHelp from "./CaptionHelp";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const deckId = Number(id);
  if (!Number.isSafeInteger(deckId) || deckId <= 0) notFound();

  const { rows } = await pool.query(
    "SELECT id, name, video_id, transcript FROM decks WHERE id = $1 AND user_id = $2",
    [deckId, user.id]
  );
  const deck = rows[0];
  if (!deck) notFound();
  const settings = await getSettings(user.id);
  // 字幕のコピー方法: はじめは開いて出す。「閉じる」を押した人には1行だけ
  const helpClosed = (await cookies()).get(CAPTION_HELP_COOKIE)?.value === CAPTION_HELP_CLOSED;

  return (
    <main>
      <p className="back-link">
        <Link href={`/decks/${deck.id}`}>← {deck.name}</Link>
      </p>
      <h1>字幕から例文を追加</h1>
      <p className="note">
        いまのレベル: <strong>{settings.levelLabel}</strong>（上位 {settings.vocabSize.toLocaleString()} 語）{" "}
        <Link href="/settings">変更</Link>
      </p>
      <CaptionHelp initialClosed={helpClosed} />
      <ImportClient
        deckId={deck.id}
        initialUrl={deck.video_id ? videoUrl(deck.video_id) : ""}
        initialText={deck.transcript ?? ""}
      />
    </main>
  );
}
