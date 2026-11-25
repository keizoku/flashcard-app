# 単体テスト

Vitest。`test/` にある。ロジック（DB を使わない関数）と、DB を使う処理（Server Action を含む）の両方をテストする。

## 実行

```bash
docker compose exec app npm test          # 全部を1回実行（アプリが起動しているとき）
docker compose run --rm app npm test      # アプリが起動していないとき
docker compose exec app npm run test:watch  # ファイルを保存するたびに実行
docker compose exec app npx vitest run test/db/study.test.js  # 1つのファイルだけ
```

### コミットの前に自動で実行

`.githooks/pre-commit` が、コミットの前にテストを実行し、失敗したらコミットを止める。
Markdown だけの変更なら実行しない（テスト仕様書・テーブル定義書を変えたときは実行する）。クローンし直したときは、最初に1回だけ有効にする:

```bash
git config core.hooksPath .githooks
```

どうしても今コミットしたいときは `git commit --no-verify`（あとで必ず直す）。

## しくみ

| ファイル | 役割 |
| --- | --- |
| `vitest.config.mjs` | `@/` の別名、`server-only` を空にする、テストファイルを1つずつ順に実行する |
| `test/globalSetup.js` | 最初に1回: テスト用 DB `flashcard_unittest` を作り直し、`db/migrations` を最初から当てる |
| `test/dbUrl.js` | テスト用 DB の接続先。名前が `_test` / `_unittest` で終わらなければ止まる（開発の DB を消さないため） |
| `test/setup.js` | 各ファイルの前に: DB の接続先を差し替え、Next.js の部品などを偽物にする（下の表）。手元の `.env` で使える人を決めていても（`ALLOWED_EMAILS`）、消して、だれでも使える状態で始める（画面のテストも `compose.yaml` で空にする） |
| `test/helpers.js` | `resetDb`（全テーブルを空に）、`createUser`、`loginAs`、`createDeck`、`createCard`、`runAction` など |
| `test/unit/` | DB を使わないテスト |
| `test/db/` | DB を使うテスト（各テストの前に `resetDb`） |

偽物にしているもの:

| 本物 | テストでは |
| --- | --- |
| `next/headers` の `cookies()` | `globalThis.testCookies`（Map）に読み書き |
| `next/navigation` の `redirect()` | 例外を投げる。`runAction(...)` で `redirectTo` を取り出せる |
| `next/cache` の `revalidatePath` | 何もしない |
| `lib/mail.js` の `sendMail` | 送らずに `globalThis.sentMails` に貯める（`linkIn(mail)` でリンクを取り出せる） |
| `lib/videoTitle.js` | YouTube に問い合わせず `Video <id>` を返す |
| `next/navigation` の `notFound()` | 例外（`err.notFound = true`）を投げる |

画面（`app/` の `.js`）は JSX なので、`vitest.config.mjs` の `appJsx` が JSX として読む。画面のテストでは、
画面の関数を呼んで返ってきた JSX の、文字や部品に渡した props を調べる（見た目や操作は確かめない）。

開発用の DB（`flashcard`）には触らない。Mailpit にもメールは届かない。

## ブラウザで1件ずつ実行する（テスト実行ツール）

```bash
docker compose exec app npm run test:ui
```

http://localhost:3100 を開く（止めるときは Ctrl+C）。テスト仕様書（[test-spec.md](test-spec.md)）の表がそのまま出る。

- 行の「実行」で、その行のテスト。「この節を実行」「全部実行」「表示中を実行」「失敗を再実行」もある
- ID を押すと、テストの名前・かかった時間・失敗の理由（期待した値と実際の値）が開く
- 上の欄で ID や文言で絞り込める。「失敗」「未実行」「未テスト」でも絞り込める
- 結果はブラウザに保存されるので、開き直しても前回の結果が見られる
- 画面のテスト（`UI-`）は、このツールでは実行しない（「画面のテスト（E2E）」と出る。下の `docker compose run --rm e2e` で実行する）
- テスト用の DB（`flashcard_unittest`）を使う。開発用の DB には触れない。
  同時に1つしか実行しない（テストのたびに DB を作り直すため）。コミットの前のテストと同時には実行しない
- しくみ: `tools/test-runner/server.mjs` が仕様書を読み、`vitest run -t "ID "` を JSON で実行して結果を返す。
  画面は `tools/test-runner/index.html`。テストを実行できるので、このパソコンからだけ開ける（`compose.yaml` で `127.0.0.1:3100`）

## 画面のテストとテスト結果レポート

```bash
docker compose run --rm e2e
```

単体テストと画面のテストを全部実行し、**テスト結果レポート**（`reports/<日時>/index.html`）を作る。ブラウザで開くと、次のものが見られる。

- 結果のまとめ（成功・失敗の数、仕様書の条件の網羅率、コミット・作った日時）と、節ごとの網羅のグラフ
- 画面のテストの、手順ごとのスクリーンショット（エビデンス）。押すと大きく見られる
- テスト実行ツールで「全部実行」した直後の画面
- テスト仕様書の表に、ID ごとの結果を付けたもの（「失敗」「未」だけにも絞れる）と、失敗の詳細

画像も HTML の中に入っているので、ファイル1つを渡せば、ほかの人も見られる。`reports/` は git に入れない。

画面のテストだけを実行するときは `docker compose run --rm e2e npm run test:e2e`。

- 画面のテストは `e2e/app.spec.mjs`（Playwright）。ID は `UI-`。本物のブラウザ（Chromium）でアプリを操作し、
  `shot()` で手順ごとのスクリーンショットをテスト結果に添付する
- `e2e` コンテナ（`mcr.microsoft.com/playwright`、ブラウザ入り）の中で、テスト用の DB（`flashcard_e2e`）につないだアプリを
  ポート 3200 で別に起動する（コンテナの外には出さない）。開発用の DB・画面（3000）には触れない
- データは `e2e/db.mjs` で作る。ログインは、セッションを DB に入れて Cookie を渡す（UI-01 だけは画面からログインする）
- 初回はイメージ（約 2GB）とパッケージのダウンロードで数分かかる。`node_modules` は volume `e2e_node_modules` に置き、
  `package-lock.json` が変わったときだけ入れ直す（`tools/report/entry.sh`）
- Playwright の版は、`package.json` の `@playwright/test` と `compose.yaml` のイメージの版を必ず合わせる
- 単体テストと同じ `flashcard_unittest` も使うので、コミットの前のテストやテスト実行ツールと同時には実行しない
- しくみ: `tools/report/make-report.mjs` が vitest と Playwright を JSON で実行し、`results.mjs` で ID ごとにまとめ、
  `render.mjs` で HTML にする。テスト実行ツールの画面は、ツールを起動して Chromium で「全部実行」を押して撮る

## テストを書くときの決まり

- 機能を足す・変えるときは、同じコミットでテストも足す・直す。バグを直すときは、先にそのバグで失敗するテストを書く
- テストの名前は「ID 何がどうなるべきか」の形で、日本語で書く（例: `ST-11 …`）。失敗したときに、仕様として読めるように。
  ID と、確かめる条件・期待する結果は [test-spec.md](test-spec.md) に書く（書き忘れると `DOC-03` が失敗する）
- ユーザーごとのデータを扱う処理には、**他人のデータに触れないこと**のテストを必ず入れる
- 時間のかかるパスワードのハッシュは `createUser` が使い回す（パスワードは `PASSWORD`）
- テストのために本番のコードを変えない（偽物は `test/setup.js` で用意する）

## 機能とテストの対応

| 機能（設計書） | テスト |
| --- | --- |
| YouTube の URL・時刻（[architecture](architecture.md)） | `unit/youtube.test.js` |
| 表示用の道具・レベル・記憶テストの間隔 | `unit/format-levels-review.test.js` |
| タグの整形（[features 1](features.md#1-単語帳)） | `unit/tags.test.js` |
| タグの保存・ユーザーごとの一覧 | `db/tags-story.test.js` |
| 字幕の区間・文・段階・理解度（[features 2](features.md#2-字幕の解析libtranscriptjs)） | `unit/transcript.test.js` |
| 原形・頻出順位・イディオム | `unit/vocab-idioms.test.js` |
| AI で整えた文の読み取り・プロンプト（[features 5.1](features.md#51-字幕を文に整えるlibsentencesjs)） | `unit/sentences-parse.test.js` |
| カードの解説・物語のプロンプトと読み取り（[features 5.2, 6](features.md)） | `unit/card-story-prompts.test.js` |
| 単語帳・カードの作成・編集・削除、解説の取り込み（[features 1, 3](features.md)） | `db/decks-cards.test.js` |
| 字幕の取り込み・カードの登録・「知ってる」・レベル設定・語の状態 | `db/import-settings.test.js` |
| 記憶テスト・取り消し（[features 4](features.md#4-記憶テスト)） | `db/study.test.js` |
| 物語の単語帳（[features 6](features.md)） | `db/tags-story.test.js` |
| パスワードのハッシュ（[auth](auth.md)） | `unit/password.test.js` |
| メールアドレスの正規化・トークン | `unit/accounts-email.test.js`、`unit/auth-token.test.js` |
| ログインしていない人の転送（middleware） | `unit/middleware.test.js` |
| テーブル定義書と DB が同じか（[tables](tables.md)） | `db/schema-doc.test.js` |
| テスト仕様書とテストの ID が同じか（[test-spec](test-spec.md)） | `unit/test-spec.test.js` |
| 画面の文言に「デッキ」を使わない（「単語帳」と呼ぶ） | `unit/wording.test.js` |
| 左右のスワイプとタップを ← / → に置きかえる（iPhone・iPad） | `unit/swipe.test.js` |
| 画面の SQL（他人の単語帳は 404、トップ・統計のデータの分離、学習の順） | `db/pages.test.js` |
| テスト実行ツールの仕様書の読み取り・結果のまとめ | `unit/test-runner.test.js` |
| テスト結果レポートの結果のまとめ・HTML | `unit/report.test.js` |
| 単語帳の共有（表示名・公開・みんなの単語帳・取り込み、[features 10](features.md#10-単語帳の共有libsharingjsappshared)） | `db/sharing.test.js` |
| 画面の操作（ログイン・ヘッダー・他人の単語帳・学習のキーボードとスワイプ・取り込み・統計・トップ・単語帳の共有・ホームページ） | `../e2e/app.spec.mjs`（画面のテスト） |
| セッション・持ち主の確認 | `db/session.test.js` |
| メールのリンク・登録の完了・以前のデータの引き継ぎ | `db/accounts.test.js` |
| 登録・ログイン・ログアウト・再送・再設定・パスワードの変更 | `db/auth-actions.test.js` |

## テストしていないもの

- 画面のテスト（UI-01〜09）にない操作（学習の ← と ↑、読み上げ、取り込みの段階の切り替えなど）。変えたときは、ブラウザで確かめる
- 統計の画面の細かい数（単語帳別の内訳・グラフ・苦手な語の順）。覚え具合の数は UI-05 で確かめている
- 本物の SMTP・YouTube への通信
- セットアップのスクリプト（`setup.sh` / `setup.ps1`）。変えたときは実際に動かして確かめる（Windows 版は Windows で）
