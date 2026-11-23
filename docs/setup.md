# セットアップの説明書

フラッシュカードアプリを、自分のパソコンで動かすための手順です。Windows・Mac・Linux で使えます。
セットアップのスクリプトが、確認・設定・起動・動作確認までを自動で行います。

## 0. 前もって用意するもの

| | Windows | Mac | Linux |
| --- | --- | --- | --- |
| Docker | [Docker Desktop](https://www.docker.com/products/docker-desktop/)（WSL 2 を使う設定のまま） | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | [Docker Engine](https://docs.docker.com/engine/install/) と Compose プラグイン |
| git | [Git for Windows](https://git-scm.com/download/win) | ターミナルで `xcode-select --install` | `sudo apt install git` など |
| GitHub | リポジトリは非公開です。持ち主に「Collaborator」として招待してもらい、メールで届く招待を承認してください | 同じ | 同じ |

- Node.js や PostgreSQL を入れる必要はありません（Docker の中で動きます）
- メモリは 4GB 以上あると安心です。ディスクは 3GB ほど使います
- **Docker Desktop は、セットアップの前に起動しておいてください**

## 1. ソースコードを取ってくる

Windows は「PowerShell」、Mac は「ターミナル」を開いて、置きたい場所で実行します。

```bash
git clone https://github.com/keizoku/flashcard-app.git
```

```bash
cd flashcard-app
```

## 2. セットアップを実行する

### Windows

エクスプローラーで `flashcard-app` フォルダを開いて **`setup.cmd` をダブルクリック** します。
PowerShell から実行するなら、次のとおりです。

```powershell
.\setup.cmd
```

### Mac / Linux

```bash
./setup.sh
```

### スクリプトがすること

1. git と Docker が入っていて、Docker が動いているかを確かめる
2. コミットの前に単体テストが走るように、git を設定する（`git config core.hooksPath .githooks`）
3. 使うポート（3000・5432・8025・3100）が空いているかを確かめる
4. `docker compose up -d --build` で起動し、画面が開けるようになるまで待つ（**初回は数分かかります**）
5. 単体テストを実行して、正しく動くかを確かめる（テスト用の DB を使うので、データには触れません）
6. 次にすることを表示する

画面のテストとテスト結果レポート（`docker compose run --rm e2e`）は、セットアップでは実行しません。
使うときに、ブラウザ入りのイメージ（約 2GB）をダウンロードします（[testing.md](testing.md)）。

何度実行しても大丈夫です。DB のデータは消しません。単体テストを飛ばすときは
`./setup.sh --skip-tests`（Windows は `.\setup.cmd -SkipTests`）。

## 3. ユーザー登録

1. http://localhost:3000/signup で、メールアドレスとパスワード（8文字以上）を入れる
2. 開発用の受信箱 http://localhost:8025 を開き、届いたメールのリンクを開くと、登録が完了します

メールは外には送られず、この受信箱（Mailpit）に届きます。本物のメールを送りたいときは、
`.env.example` を `.env` にコピーして SMTP の設定を書き、`docker compose up -d` を実行します。
使える人をメールアドレスで決めたいときは、`.env` の `ALLOWED_EMAILS` に書きます（空なら、だれでも登録できます）。

## 4. ふだんの使い方

| やりたいこと | コマンド（`flashcard-app` フォルダで） |
| --- | --- |
| 止める | `docker compose down`（データは残ります） |
| また使う | `docker compose up -d`（または、もう一度セットアップのスクリプト） |
| 新しい版にする | `git pull` のあと、もう一度セットアップのスクリプト |
| ログを見る | `docker compose logs -f app`（Ctrl+C で抜ける） |

パソコンを再起動したら、Docker Desktop を起動してから `docker compose up -d` を実行します。

## 5. うまくいかないとき

| 表示 | どうするか |
| --- | --- |
| Docker が動いていません | Docker Desktop を起動し、落ち着くまで（Windows は「Engine running」）待ってから、もう一度実行 |
| 使われているポートがあります: 5432 | 別の PostgreSQL が動いています。止めてから、もう一度実行（Windows は「サービス」で postgresql を停止） |
| 使われているポートがあります: 3000 / 3100 | 別の開発用サーバーが動いています。止めてから、もう一度実行 |
| 300 秒待っても画面が開けません | `docker compose logs app` でエラーを確かめる。初回でパソコンが遅いときは、少し待ってから http://localhost:3000 を開く |
| 単体テストが失敗しました | 表示されたログを、このアプリの持ち主に送る |
| Windows で「このシステムではスクリプトの実行が無効」 | `setup.ps1` ではなく `setup.cmd` を使う |
| Windows で `/usr/bin/env: 'bash\r'` などの改行のエラー | `git config --global core.autocrlf false` のあと、clone し直す |
| Linux で `permission denied ... docker.sock` | `sudo usermod -aG docker $USER` のあと、ログインし直す |

## 6. 最初からやり直す

**データ（単語帳・カード・ユーザー）がすべて消えます。**

```bash
docker compose down -v
```

そのあと、もう一度セットアップのスクリプトを実行します。

## メンテナンスするときの決まり

- `compose.yaml` のポートやサービスを変えたら、`setup.sh` と `setup.ps1` の `PORTS` も直す
- スクリプトの文言を変えたら、この説明書も直す
- `setup.ps1` は「UTF-8（BOM 付き）」で保存する（Windows の PowerShell 5.1 で日本語を正しく読ませるため）
- `setup.cmd` は改行を CRLF にする（`.gitattributes` で決めてある）。ほかのファイルは LF
