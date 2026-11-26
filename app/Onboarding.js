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
  const { steps, doneCount, sample } = onboarding;
  // 次にやるステップ（まだ終わっていない最初のもの）を目立たせる
  const nextKey = steps.find((s) => !s.done)?.key;
  const [levelStep, ...ownSteps] = steps;
  const stepItem = (s, i) => <Step key={s.key} step={s} number={i + 1} next={s.key === nextKey} />;
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
      {sample ? (
        // サンプルの単語帳がある人（おためし）: レベルを決めたら、「サンプルで試す」と「自分で作る」のどちらからでも始められる
        <>
          <ol className="onboarding-steps">{stepItem(levelStep, 0)}</ol>
          <p className="onboarding-branch">次は、どちらからでも始められます</p>
          <div className="onboarding-routes">
            <section className="onboarding-route" aria-label="A. サンプルの単語帳で試す">
              <h3>A. サンプルの単語帳で、まず試す</h3>
              <p className="note small">最初から入っている動画の単語帳で、すぐに試せます</p>
              <ul className="onboarding-steps">
                <li className={`onboarding-step${sample.studied ? " done" : " next"}`}>
                  <span className="onboarding-mark" aria-hidden="true">
                    {sample.studied ? "✓" : "A"}
                  </span>
                  <div className="onboarding-body">
                    <strong>
                      {LABELS.study.title}
                      {sample.studied && <span className="sr-only">（完了）</span>}
                    </strong>
                    <span className="note small">{LABELS.study.note}</span>
                  </div>
                  <Link href={sample.studyHref} className={sample.studied ? "button-link" : "button-link study-link"}>
                    {LABELS.study.link}
                  </Link>
                </li>
                <li className="onboarding-step">
                  <span className="onboarding-mark" aria-hidden="true">
                    A
                  </span>
                  <div className="onboarding-body">
                    <strong>字幕から、覚えたい文を選ぶ</strong>
                    <span className="note small">字幕は入っているので、貼らずにカードを増やせます</span>
                  </div>
                  <Link href={sample.importHref} className="button-link">
                    文を選ぶ
                  </Link>
                </li>
              </ul>
            </section>
            <section className="onboarding-route" aria-label="B. 自分で動画を選んで、単語帳を作る">
              <h3>B. 自分で動画を選んで、単語帳を作る</h3>
              <p className="note small">見たい YouTube の動画から、自分の単語帳を作ります</p>
              <ol className="onboarding-steps">{ownSteps.map((s, i) => stepItem(s, i + 1))}</ol>
            </section>
          </div>
        </>
      ) : (
        <ol className="onboarding-steps">{steps.map(stepItem)}</ol>
      )}
    </section>
  );
}

function Step({ step: s, number, next }) {
  const label = LABELS[s.key];
  return (
    <li className={`onboarding-step${s.done ? " done" : ""}${next ? " next" : ""}`}>
      <span className="onboarding-mark" aria-hidden="true">
        {s.done ? "✓" : number}
      </span>
      <div className="onboarding-body">
        <strong>
          {label.title}
          {s.done && <span className="sr-only">（完了）</span>}
        </strong>
        <span className="note small">{label.note}</span>
      </div>
      {!s.done && s.href && (
        <Link href={s.href} className={next ? "button-link study-link" : "button-link"}>
          {label.link}
        </Link>
      )}
    </li>
  );
}
