import { displayTarget } from "@/lib/format";
import { HighlightedParts } from "./Highlighted";
import SpeakButton from "./SpeakButton";

// カードの裏面に出す解説（和訳・意味・例文・豆知識）。サーバー・クライアントどちらでも使える
export default function CardDetails({ card }) {
  const examples = Array.isArray(card.ai_examples) ? card.ai_examples : [];
  const targets = card.targets ?? [];
  const multi = targets.length > 1;
  const hasMeaning = multi ? targets.some((t) => t.meaning) : Boolean(card.ai_meaning);
  if (!card.ai_translation && !hasMeaning && !card.ai_trivia && examples.length === 0) {
    return card.back ? null : <p className="empty">（意味・訳は未入力）</p>;
  }
  return (
    <div className="ai-details">
      {card.ai_translation && (
        <p>
          <span className="ai-label">和訳</span>
          <HighlightedParts
            text={card.ai_translation}
            parts={targets.length ? targets.map((t) => t.translation_form) : [card.ai_translation_form]}
          />
        </p>
      )}
      {multi ? (
        <div>
          <span className="ai-label">意味</span>
          <ul className="ai-examples">
            {targets.map((t) => (
              <li key={t.word}>
                <strong>{displayTarget(t.word)}</strong>
                {t.meaning ? `：${t.meaning}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        card.ai_meaning && (
          <p>
            <span className="ai-label">意味</span>
            {card.ai_meaning}
          </p>
        )
      )}
      {examples.length > 0 && (
        <div>
          <span className="ai-label">例文</span>
          <ul className="ai-examples">
            {examples.map((ex, i) => (
              <li key={i}>
                {ex.en}
                <SpeakButton text={ex.en} label="この例文を読み上げる" />
                <br />
                <span className="ja">{ex.ja}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {card.ai_trivia && (
        <p>
          <span className="ai-label">豆知識</span>
          {card.ai_trivia}
        </p>
      )}
    </div>
  );
}
