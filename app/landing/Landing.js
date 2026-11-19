import Link from "next/link";
import DemoCard from "./DemoCard";
import "./landing.css";

// ホームページ（ログインしていない人がトップを開いたときに出す）。
// アプリでできることだけを書く（数字や利用者の声などは作らない）。
export default function Landing() {
  return (
    <main className="lp">
      {/* はじめの画面 */}
      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-eyebrow">YouTube で、英語をものにする暗記カード</p>
          <h1>
            好きな動画が、
            <br />
            そのまま、
            <br />
            <span className="lp-keep">
              <span className="lp-em">あなたの教科書</span>になる。
            </span>
          </h1>
          <p className="lp-lead">
            字幕を貼るだけで、<strong>「知らない単語がひとつだけ」</strong>の文を見つけて、
            覚えるまでちょうどいい間隔で出してくれます。
            難しすぎない。簡単すぎない。だから、続きます。
          </p>
          <div className="lp-cta-row">
            <Link href="/signup" className="lp-button lp-primary">
              無料で始める
            </Link>
            <a href="#how" className="lp-button lp-ghost">
              使い方を見る
            </a>
          </div>
          <p className="lp-fine">登録はメールアドレスだけ。料金はかかりません。</p>
        </div>
        <div className="lp-hero-visual">
          <DemoCard />
        </div>
      </section>

      {/* よくある悩み */}
      <section className="lp-section">
        <h2>英語、こんなふうに止まっていませんか？</h2>
        <div className="lp-grid lp-grid-3">
          <div className="lp-pain">
            <p className="lp-pain-title">単語帳が続かない</p>
            <p>単語だけを並べて覚えても、使われ方がわからず、すぐに忘れてしまう。</p>
          </div>
          <div className="lp-pain">
            <p className="lp-pain-title">教材が難しすぎる</p>
            <p>知らない単語だらけの文は、辞書を引くだけで疲れて、内容が頭に入らない。</p>
          </div>
          <div className="lp-pain">
            <p className="lp-pain-title">覚えても忘れる</p>
            <p>いつ復習すればいいかわからず、せっかく覚えた単語が抜けていく。</p>
          </div>
        </div>
        <p className="lp-answer">
          このアプリは、その3つを<strong>しくみで</strong>解決します。
        </p>
      </section>

      {/* i+1 */}
      <section className="lp-section lp-band">
        <div className="lp-split">
          <div>
            <p className="lp-eyebrow">いちばんの特長</p>
            <h2>「わかる文 ＋ 新しい単語 1つ」だけを選ぶ</h2>
            <p>
              ほとんどわかる文の中に、知らない単語がひとつだけ。言語学習で「i+1」と呼ばれる、
              いちばん身につきやすい難しさです。
            </p>
            <p>
              あなたのレベル（英検 3級〜1級、TOEIC の点数）に合わせて、動画の字幕の中から
              そんな文だけを自動で選びます。文脈ごと覚えるので、意味も使い方も一緒に残ります。
            </p>
          </div>
          <div className="lp-stage-demo" aria-label="字幕の文を、知らない語の数で分けた例">
            <div className="lp-stage-tabs" aria-hidden="true">
              <span className="active">i+1</span>
              <span>i+2</span>
              <span>i+3</span>
            </div>
            <ul>
              <li>
                I was <mark>skeptical</mark> about the plan at first.
                <span>知らない語: skeptical</span>
              </li>
              <li>
                We finally <mark>figured it out</mark> together.
                <span>イディオム: figure sth out</span>
              </li>
              <li>
                That was a <mark>reasonable</mark> price for the tickets.
                <span>知らない語: reasonable</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 使い方 */}
      <section className="lp-section" id="how">
        <h2>使い方は 4 ステップ</h2>
        <ol className="lp-steps">
          <li>
            <span className="lp-step-num">1</span>
            <p className="lp-step-title">レベルを選ぶ</p>
            <p>英検の級か TOEIC の点数を選ぶと、あなたが「知っている単語」の目安が決まります。</p>
          </li>
          <li>
            <span className="lp-step-num">2</span>
            <p className="lp-step-title">好きな動画の字幕を貼る</p>
            <p>YouTube の「文字起こし」をコピーして貼るだけ。趣味の動画でも、ニュースでも。</p>
          </li>
          <li>
            <span className="lp-step-num">3</span>
            <p className="lp-step-title">覚えたい文を選ぶ</p>
            <p>「知らない単語がひとつだけ」の文が並びます。チェックして、カードに登録。</p>
          </li>
          <li>
            <span className="lp-step-num">4</span>
            <p className="lp-step-title">毎日、出てきたカードに答える</p>
            <p>「覚えている / 覚えていない」を押すだけ。次に出す日は、アプリが決めます。</p>
          </li>
        </ol>
      </section>

      {/* 機能 */}
      <section className="lp-section lp-band">
        <h2>続けるための工夫が、ぜんぶ入っています</h2>
        <div className="lp-grid lp-grid-3">
          <Feature title="忘れるころに、もう一度" icon="↻">
            覚えている間隔に合わせて、1日後・3日後・1週間後…と出し直します。
            切り替わりは毎朝 4 時。夜に学習しても、翌朝にはちゃんと出てきます。
          </Feature>
          <Feature title="動画の理解度がわかる" icon="◔">
            字幕のうち、全部わかる文が何 % かを表示。単語を覚えるほど上がり、100% でその動画はクリアです。
          </Feature>
          <Feature title="和訳と解説も、無料で" icon="✎">
            お手持ちのチャット AI（claude.ai など）に頼む文章を、ボタン1つでコピー。
            答えを貼れば、和訳・意味・例文・豆知識がカードに入ります。
          </Feature>
          <Feature title="耳でも覚える" icon="♪">
            例文を、ふつうの速さとゆっくりで読み上げ。カードが出たら自動で読む設定もできます。
          </Feature>
          <Feature title="覚えた単語で物語を作る" icon="❋">
            覚えた単語・覚え中の単語を使った短い物語を AI に書いてもらい、まとめて読み返せます。
          </Feature>
          <Feature title="みんなのデッキ" icon="⇄">
            ほかの人が公開したデッキを、そのまま自分のデッキとして取り込めます。あなたのデッキも公開できます。
          </Feature>
        </div>
      </section>

      {/* 1日の流れ */}
      <section className="lp-section">
        <div className="lp-split">
          <div>
            <h2>1 日 10 分から。</h2>
            <p>
              スキマ時間にアプリを開いて、今日のカードに答えるだけ。パソコンなら矢印キーだけで、
              手を止めずにどんどん進められます。
            </p>
            <p>
              統計の画面では、覚えた単語の数、日ごとの学習回数、苦手な単語がひと目でわかります。
              増えていく数字が、次の 10 分の力になります。
            </p>
          </div>
          <div className="lp-day">
            <div className="lp-day-row">
              <span className="lp-day-time">朝</span>
              <span>今日のカードに答える（→ で答え、→ / ← で覚えている・いない）</span>
            </div>
            <div className="lp-day-row">
              <span className="lp-day-time">昼</span>
              <span>気になった動画の字幕を貼って、新しい文を 5 つ登録</span>
            </div>
            <div className="lp-day-row">
              <span className="lp-day-time">夜</span>
              <span>理解度が上がった動画を、もう一度見てみる</span>
            </div>
          </div>
        </div>
      </section>

      {/* よくある質問 */}
      <section className="lp-section lp-band">
        <h2>よくある質問</h2>
        <div className="lp-faq">
          <details>
            <summary>本当に無料ですか？</summary>
            <p>
              はい。アプリの利用は無料です。和訳や解説は、あなたが使っているチャット AI に文章をコピーして頼む方式なので、
              アプリ側で料金はかかりません。
            </p>
          </details>
          <details>
            <summary>どのくらいのレベルから使えますか？</summary>
            <p>
              英検 3級（中学卒業程度）から 1級、TOEIC の点数でも選べます。あとから変えることもでき、
              選んだレベルに合わせて「知らない単語」の判定が変わります。
            </p>
          </details>
          <details>
            <summary>どんな動画が使えますか？</summary>
            <p>
              字幕（文字起こし）がある YouTube の動画なら、どれでも使えます。好きなジャンルの動画を選ぶのが、続けるいちばんのコツです。
            </p>
          </details>
          <details>
            <summary>スマートフォンでも使えますか？</summary>
            <p>ブラウザで動くので、スマートフォンでもパソコンでも使えます。字幕の貼り付けはパソコンが楽です。</p>
          </details>
          <details>
            <summary>知っている単語ばかり出てきたら？</summary>
            <p>候補の横の「知ってる」を押すと、その単語は次から「知らない単語」に数えません。使うほど、あなた専用になります。</p>
          </details>
        </div>
      </section>

      {/* 最後の呼びかけ */}
      <section className="lp-final">
        <h2>次に見る動画から、始めよう。</h2>
        <p>登録は 1 分。最初の 1 枚を作るまで、5 分もかかりません。</p>
        <div className="lp-cta-row lp-center">
          <Link href="/signup" className="lp-button lp-primary">
            無料で始める
          </Link>
          <Link href="/login" className="lp-button lp-ghost">
            ログイン
          </Link>
        </div>
      </section>
    </main>
  );
}

function Feature({ title, icon, children }) {
  return (
    <div className="lp-feature">
      <span className="lp-feature-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="lp-feature-title">{title}</p>
      <p>{children}</p>
    </div>
  );
}
