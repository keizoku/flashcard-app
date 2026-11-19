# flashcard-app

YouTube の字幕から英文の暗記カードを作る、個人用のアプリ。Next.js 15 + PostgreSQL 17 を Docker で動かす（Mac に Node.js はない）。

- 設計書: `docs/`（入口は `docs/README.md`）
- 単体テスト: `docker compose exec app npm test`（詳しくは `docs/testing.md`）
- 画面のテスト＋テスト結果レポート: `docker compose run --rm e2e`（`reports/` に HTML ができる）

## 作業の決まり

- コードを変えたら、**同じコミットで `docs/` の設計書と `test/` のテストも直す**。新しい機能にはテストを足す。
  ユーザーごとのデータを扱う処理には、他人のデータに触れないことのテストを入れる
- テストの名前の先頭には ID（`ST-11` など）を付け、`docs/test-spec.md`（テスト仕様書）に条件と期待する結果の行を足す。
  テストのない条件に気づいたら「未」の行を足す
- バグを直すときは、先にそのバグで失敗するテストを書く
- コミットの前にテストが走る（`.githooks/pre-commit`）。失敗したら直してからコミットする。`--no-verify` は使わない
- テーブルを変えるときは `db/migrations/` に次の番号のファイルを足す（当てたファイルは書き換えない）。`docs/tables.md`（テーブル定義書）と `docs/data-model.md` も直す
- ポート・サービス・環境変数を変えたら、`setup.sh` / `setup.ps1` と `docs/setup.md` も直す
- コメント・画面の文言・設計書は、やさしい日本語で書く
- npm のコマンドはコンテナの中で動かす（`docker compose exec app ...`）
- 開発用の DB（`flashcard`）のデータは、本人の学習データ。テストや確認で書き換えない（テストは `flashcard_unittest` を使う）
