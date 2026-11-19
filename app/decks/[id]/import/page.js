import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { videoUrl } from "@/lib/youtube";
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
      <details className="help">
        <summary>YouTube の字幕をコピーする方法</summary>
        <ol>
          <li>パソコンのブラウザで YouTube の動画を開く</li>
          <li>動画の説明欄の下にある「文字起こしを表示」を押す</li>
          <li>右側に出た文字起こしを、マウスで最初から最後まで選択してコピー</li>
          <li>下の欄に貼り付ける（時刻が一緒に入っていると、カードからその場面を再生できます）</li>
        </ol>
      </details>
      <ImportClient
        deckId={deck.id}
        initialUrl={deck.video_id ? videoUrl(deck.video_id) : ""}
        initialText={deck.transcript ?? ""}
      />
    </main>
  );
}
