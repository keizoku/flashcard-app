import Link from "next/link";
import { dismissOnboarding } from "./actions";

// トップの「はじめの4ステップ」（lib/onboarding.js）。新しく登録した人を、使い方の順に案内する
const LABELS = {
  level: { title: "自分のレベルを決める", note: "知らない単語がひとつだけの文を探すのに使います", link: "レベル設定へ" },
  deck: { title: "動画を選んで、単語帳を作る", note: "YouTube の動画のアドレス（URL）を貼るだけです", link: "単語帳を作る" },
  cards: { title: "字幕を貼って、覚えたい文を選ぶ", note: "チェックした文がカードになります", link: "字幕を貼る" },
  study: { title: "記憶テストをやってみる", note: "覚えている / 覚えていないで答えると、ちょうどいい間隔でまた出ます", link: "学習する" },
};

export default function Onboarding({ onboarding }) {
  const { steps, doneCount } = onboarding;
  // 次にやるステップ（まだ終わっていない最初のもの）を目立たせる
  const nextKey = steps.find((s) => !s.done)?.key;
  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-head">
        <h2 id="onboarding-title">
          はじめの4ステップ{" "}
          <span className="note small">
            （{doneCount} / {steps.length} 完了）
          </span>
        </h2>
        <form action={dismissOnboarding}>
          <button type="submit" className="link-button">
            閉じる
          </button>
        </form>
      </div>
      <ol className="onboarding-steps">
        {steps.map((s, i) => {
          const label = LABELS[s.key];
          return (
            <li key={s.key} className={`onboarding-step${s.done ? " done" : ""}${s.key === nextKey ? " next" : ""}`}>
              <span className="onboarding-mark" aria-hidden="true">
                {s.done ? "✓" : i + 1}
              </span>
              <div className="onboarding-body">
                <strong>
                  {label.title}
                  {s.done && <span className="sr-only">（完了）</span>}
                </strong>
                <span className="note small">{label.note}</span>
              </div>
              {!s.done && s.href && (
                <Link href={s.href} className={s.key === nextKey ? "button-link study-link" : "button-link"}>
                  {label.link}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
