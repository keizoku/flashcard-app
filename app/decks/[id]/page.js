import Link from "next/link";
import { notFound } from "next/navigation";
import ComprehensionBar from "@/app/components/ComprehensionBar";
import { needsExplanation } from "@/lib/cardPrompts";
import { requireUser } from "@/lib/auth";
import { analyzeWithState, loadContext } from "@/lib/comprehension";
import { pool } from "@/lib/db";
import { ensureScenes } from "@/lib/scenes";
import { DUE_CONDITION } from "@/lib/review";
import { attachTargets } from "@/lib/targets";
import { videoUrl } from "@/lib/youtube";
import AddCardForm from "./AddCardForm";
import CardList from "./CardList";
import DeckVideo from "./DeckVideo";
import ExplainPanel from "./ExplainPanel";
import StoryReader from "./StoryReader";
import StoryScenes from "./StoryScenes";

// この画面の操作（サーバーアクション）が動ける長さ（秒）。絵を自動で作るとき、画像生成サービスを最大90秒待つので、
// それより長くする（Vercel の無料プランの上限は300秒）
export const maxDuration = 120;

// リクエストのたびに DB から読み直す
export const dynamic = "force-dynamic";

const NOTICES = { imported: "みんなの単語帳から取り込みました。学習は最初からです。" };

export default async function DeckPage({ params, searchParams }) {
  const user = await requireUser();
  const { id } = await params;
  const { notice } = (await searchParams) ?? {};
  const deckId = Number(id);
  if (!Number.isSafeInteger(deckId) || deckId <= 0) notFound();

  const { rows: deckRows } = await pool.query(
    "SELECT id, name, kind, video_id, transcript, sentences, published_at, transcript IS NOT NULL AS has_transcript FROM decks WHERE id = $1 AND user_id = $2",
    [deckId, user.id]
  );
  const deck = deckRows[0];
  if (!deck) notFound();

  const { rows: cardRows } = await pool.query(
    `SELECT id, front, back, target_word, target_form, video_id, start_seconds,
            ai_translation, ai_translation_form, ai_meaning, ai_examples, ai_trivia, ai_generated_at
     FROM cards WHERE deck_id = $1 ORDER BY id`,
    [deckId]
  );
  const cards = await attachTargets(cardRows);
  const isStory = deck.kind === "story";
  // この動画の理解度（字幕があるときだけ。物語のデッキでは出さない）
  const comprehension =
    deck.transcript && !isStory ? (await analyzeWithState(deck.id, deck.transcript, await loadContext(user.id))).comprehension : null;
  // 物語の本文。各文に、カードの覚えたい語（英文の形・和訳の部分）を付ける
  const cardByFront = new Map(cards.map((c) => [c.front, c]));
  const storySentences = isStory
    ? (deck.sentences ?? []).map((s) => {
        const card = cardByFront.get(s.text);
        return {
          text: s.text,
          translation: s.translation ?? "",
          forms: card?.targets.map((t) => t.form) ?? [],
          parts: card?.targets.map((t) => t.translation_form) ?? [],
        };
      })
    : [];

  // 物語の場面（絵を付けるまとまり）。初めて開いたときに作る
  const scenes = isStory ? ((await ensureScenes(user.id, deck.id)) ?? []) : [];

  const { rows: dueRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM cards WHERE deck_id = $1 AND ${DUE_CONDITION}`,
    [deckId]
  );
  const dueCount = dueRows[0].n;

  // 解説が足りないカード（例文・豆知識、または和訳の対応部分がない）
  const missingAi = cards.filter(needsExplanation).length;

  // 理解度・カードの追加・カードの一覧（動画があれば、動画の下に出す）
  const body = (
      <>
        {comprehension && (
          <section className="comprehension-box">
            <h2>
              この動画の理解度 <span className="comprehension-percent">{comprehension.percent}%</span>
            </h2>
            <p className="note small">
              字幕の {comprehension.total} 文のうち、{comprehension.understood} 文が全部わかります。
              {comprehension.percent === 100
                ? "クリアです！"
                : "単語を覚えるほど増えます。100% でこの動画はクリアです。"}
            </p>
            <ComprehensionBar comprehension={comprehension} />
          </section>
        )}
        {missingAi > 0 && <ExplainPanel deckId={deck.id} missingCount={missingAi} />}
        <AddCardForm deckId={deck.id} />
        <p className="note">カードをクリックすると答えが表示されます（{cards.length} 枚）</p>
        {cards.length === 0 ? (
          <p className="note">まだカードがありません。上のフォームから追加してください。</p>
        ) : (
          <CardList
            deckId={deck.id}
            cards={cards.map(({ ai_generated_at, ...c }) => c)}
          />
        )}
      </>
  );

  return (
    <main>
      <p className="back-link">
        <Link href="/">← 単語帳の一覧</Link>
      </p>
      {NOTICES[notice] && (
        <p className="notice" role="status">
          {NOTICES[notice]}
        </p>
      )}
      <h1>{deck.name}</h1>
      {deck.published_at && (
        <p className="note small">
          <span className="shared-badge">公開中</span> <Link href={`/shared/${deck.id}`}>みんなの単語帳</Link>に出ています
        </p>
      )}
      <p className="actions-row">
        {cards.length > 0 && (
          <Link href={`/decks/${deck.id}/study`} className="button-link study-link">
            {dueCount > 0 ? `学習する（今日 ${dueCount} 枚）` : "学習する（今日の分は終わり）"}
          </Link>
        )}
        {!isStory && (
          <Link href={`/decks/${deck.id}/import`} className="button-link">
            {deck.has_transcript ? "保存した字幕から例文を追加" : "YouTube の字幕から例文を追加"}
          </Link>
        )}
        {deck.video_id && (
          <a href={videoUrl(deck.video_id)} target="_blank" rel="noreferrer" className="button-link">
            YouTube で開く
          </a>
        )}
        <Link href={`/decks/${deck.id}/edit`} className="button-link">
          単語帳を編集・削除
        </Link>
      </p>
      {isStory && storySentences.length > 0 && (
        <StoryReader
          deckId={deck.id}
          title={deck.name.replace(/^物語:\s*/, "")}
          sentences={storySentences}
          scenes={scenes.map((sc) => ({ first: sc.first, last: sc.last, image: sc.hasImage ? `/api/scenes/${sc.id}/image?v=${sc.version}` : null }))}
        />
      )}
      {isStory && scenes.length > 0 && <StoryScenes scenes={scenes} sentences={storySentences.map((x) => ({ text: x.text }))} />}
      {deck.video_id && !isStory ? (
        <DeckVideo videoId={deck.video_id} deckId={deck.id}>
          {body}
        </DeckVideo>
      ) : (
        body
      )}
    </main>
  );
}
