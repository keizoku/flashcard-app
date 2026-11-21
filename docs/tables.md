# テーブル定義書

PostgreSQL 17。全テーブルの全列を書く。テーブル同士の関係（図）とマイグレーションの履歴は [data-model.md](data-model.md) にある。

- この文書は `db/migrations/` を全部当てた DB と同じでなければならない。
  テーブルや列を足す・消すと、単体テスト（`test/db/schema-doc.test.js`）が失敗して教えてくれる
- 「NULL」の列: ○ = NULL を入れられる、空欄 = 必ず値が入る（`NOT NULL`）
- 日時はすべて `timestamptz`（タイムゾーンつき。DB には UTC で入る）

## 一覧

| テーブル | 内容 | 作ったマイグレーション |
| --- | --- | --- |
| [users](#users) | ユーザー | 013 |
| [user_sessions](#user_sessions) | ログイン中のセッション | 013 |
| [email_tokens](#email_tokens) | メールのリンクの合言葉 | 013 |
| [decks](#decks) | デッキ | 001 |
| [cards](#cards) | カード | 001 |
| [card_targets](#card_targets) | カードの覚えたい語 | 011 |
| [review_logs](#review_logs) | 「覚えている / 覚えていない」の記録 | 008 |
| [tags](#tags) | タグ | 010 |
| [deck_tags](#deck_tags) | デッキとタグの対応 | 010 |
| [settings](#settings) | レベル設定 | 002 |
| [known_words](#known_words) | 「知ってる」を押した語 | 002 |
| [videos](#videos) | おすすめに出す YouTube の動画の情報 | 015（016 で列を変更） |
| [study_time](#study_time) | 勉強時間（単語・リスニング） | 017 |
| [story_scenes](#story_scenes) | 物語の場面と、場面の絵 | 018 |
| [schema_migrations](#schema_migrations) | 当てたマイグレーション | `scripts/migrate.mjs` |

---

## users

ユーザー。メールアドレスとパスワードでログインする（[auth.md](auth.md)）。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | integer | | 連番 | 主キー |
| email | text | | | メールアドレス。大文字・小文字は同じとみなして一意 |
| password_hash | text | | | `scrypt$<salt>$<hash>`。パスワードそのものは保存しない |
| verified_at | timestamptz | ○ | | 確認メールのリンクを開いた日時。NULL = まだ（ログインできない） |
| created_at | timestamptz | | now() | 登録した日時 |
| display_name | text | ○ | | 表示名（30文字まで）。公開したデッキに、作った人として出す。NULL = まだ決めていない |

- 主キー: `id`
- インデックス: `users_email_idx`（一意、`lower(email)`）

## user_sessions

ログイン中のセッション。ブラウザの Cookie と対応する。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| token_hash | text | | | Cookie の値の sha256。値そのものは保存しない |
| user_id | integer | | | ログインしているユーザー |
| expires_at | timestamptz | | | 有効期限。作ってから30日 |
| created_at | timestamptz | | now() | ログインした日時 |

- 主キー: `token_hash`
- 外部キー: `user_id` → `users.id`（ユーザーを消すと消える）
- インデックス: `user_sessions_user_id_idx`（`user_id`）

## email_tokens

確認メール・パスワード再設定メールのリンクに入れる合言葉。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| token_hash | text | | | 合言葉の sha256。値そのものは保存しない |
| user_id | integer | | | 送った相手 |
| purpose | text | | | `verify`（登録の確認、24時間有効）/ `reset`（パスワードの再設定、1時間有効） |
| expires_at | timestamptz | | | 有効期限 |
| created_at | timestamptz | | now() | 送った日時。再送の間隔（60秒）の判定にも使う |

- 主キー: `token_hash`
- 外部キー: `user_id` → `users.id`（ユーザーを消すと消える）
- チェック: `purpose` は `verify` か `reset`
- インデックス: `email_tokens_user_id_idx`（`user_id, purpose`）

## decks

デッキ。動画1本ぶんの字幕、または AI に書いてもらった物語1つ。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | integer | | 連番 | 主キー |
| name | text | | | デッキの名前（100文字まで） |
| created_at | timestamptz | | now() | 作った日時 |
| video_id | text | ○ | | YouTube の動画 ID（11文字） |
| transcript | text | ○ | | 貼り付けた字幕（200,000文字まで）。物語なら AI の答えの全文 |
| sentences | jsonb | ○ | | AI で整えた文 `[{ start, text, translation, glosses, original }]` |
| sentences_hash | text | ○ | | `sentences` を作ったときの字幕の sha256。字幕が変わったら `sentences` は使わない |
| kind | text | | 'video' | `video`（動画の字幕から）/ `story`（物語） |
| story_words | jsonb | ○ | | 物語で使ってもらった語 |
| user_id | integer | ○ | | 持ち主。NULL はユーザー管理を入れる前のデータ（最初に登録したユーザーが引き継ぐ） |
| published_at | timestamptz | ○ | | 公開した日時（みんなのデッキに出す）。NULL = 公開していない |
| source_deck_id | integer | ○ | | 取り込み元のデッキ（みんなのデッキから取り込んだとき）。元を消すと NULL |

- 主キー: `id`
- 外部キー: `user_id` → `users.id`（ユーザーを消すと消える）、`source_deck_id` → `decks.id`（元を消すと NULL）
- チェック: `kind` は `video` か `story`
- インデックス: `decks_user_id_idx`（`user_id`）、`decks_published_at_idx`（`published_at`、公開中のものだけ）、`decks_source_deck_id_idx`（`source_deck_id`）

## cards

カード。表に例文、裏に自由記入。AI の解説（和訳・意味・例文・豆知識）と記憶テストの状態も持つ。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | integer | | 連番 | 主キー |
| deck_id | integer | | | 入っているデッキ |
| front | text | | | 表（例文）。500文字まで |
| back | text | | | 裏（自由記入）。500文字まで |
| created_at | timestamptz | | now() | 作った日時 |
| target_word | text | ○ | | 1つ目の覚えたい語の見出し（`card_targets` のコピー。古い画面との互換） |
| target_form | text | ○ | | 1つ目の覚えたい語の、例文の中の形（同上） |
| video_id | text | ○ | | 例文が話された動画 |
| start_seconds | integer | ○ | | 例文が話された時刻（秒）。YouTube をその時刻で開く |
| ai_translation | text | ○ | | 例文の和訳 |
| ai_meaning | text | ○ | | 1つ目の覚えたい語の意味（`card_targets` のコピー） |
| ai_examples | jsonb | ○ | | ほかの例文 `[{ en, ja }]` |
| ai_trivia | text | ○ | | 豆知識 |
| ai_generated_at | timestamptz | ○ | | AI の解説を入れた日時 |
| review_box | smallint | | 0 | 記憶テストの段階 0〜6（[features.md](features.md#4-記憶テスト)） |
| review_due_at | timestamptz | ○ | | 次に出す日時（N日後の朝4時）。NULL = まだ一度も学習していない |
| last_reviewed_at | timestamptz | ○ | | 最後に答えた日時 |
| review_count | integer | | 0 | 答えた回数 |
| lapse_count | integer | | 0 | 「覚えていない」を押した回数 |
| ai_translation_form | text | ○ | | 1つ目の覚えたい語に対応する、和訳の中の部分（`card_targets` のコピー） |

- 主キー: `id`
- 外部キー: `deck_id` → `decks.id`（デッキを消すと消える）
- インデックス: `cards_deck_id_idx`（`deck_id`）、`cards_review_due_idx`（`deck_id, review_due_at`。今日出すカードを探す）

## card_targets

カードの覚えたい語。1枚に複数持てる。覚えたい語は、こちらが正しい値（`cards.target_*` はそのコピー）。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | integer | | 連番 | 主キー |
| card_id | integer | | | カード |
| position | smallint | | 0 | 並び順（0 から） |
| word | text | | | 見出し（原形、またはイディオムのキー `figure sth out`） |
| form | text | | | 例文の中の形（`figured it out`）。必ず `cards.front` に含まれる |
| meaning | text | ○ | | この文での意味 |
| translation_form | text | ○ | | 和訳の中で対応する部分。必ず `cards.ai_translation` に含まれる（含まれなければ NULL） |

- 主キー: `id`
- 外部キー: `card_id` → `cards.id`（カードを消すと消える）
- インデックス: `card_targets_card_id_idx`（`card_id, position`）、`card_targets_word_idx`（`word`。登録ずみの語を探す）

## review_logs

記憶テストで「覚えている / 覚えていない」を押した記録。統計と、答えの取り消しに使う。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | bigint | | 連番 | 主キー |
| card_id | integer | ○ | | 答えたカード。カードを消すと NULL になる（記録は残す） |
| deck_id | integer | | | カードが入っていたデッキ。ユーザーの絞り込みに使う |
| remembered | boolean | | | true = 覚えている、false = 覚えていない |
| reviewed_at | timestamptz | | now() | 答えた日時 |
| prev_box | smallint | ○ | | 答える前の `cards.review_box`（取り消し用） |
| prev_due_at | timestamptz | ○ | | 答える前の `cards.review_due_at`（取り消し用） |
| prev_last_reviewed_at | timestamptz | ○ | | 答える前の `cards.last_reviewed_at`（取り消し用） |

- 主キー: `id`
- 外部キー: `card_id` → `cards.id`（カードを消すと NULL）、`deck_id` → `decks.id`（デッキを消すと消える）
- インデックス: `review_logs_reviewed_at_idx`（`reviewed_at`。日ごとの集計）

## tags

タグの名前。全ユーザーで共有する。どのデッキにも使われなくなったら消す。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | integer | | 連番 | 主キー |
| name | text | | | タグの名前 |

- 主キー: `id`
- 一意: `name`

## deck_tags

どのデッキにどのタグを付けたか。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| deck_id | integer | | | デッキ |
| tag_id | integer | | | タグ |

- 主キー: `deck_id, tag_id`
- 外部キー: `deck_id` → `decks.id`、`tag_id` → `tags.id`（どちらも、消すと消える）
- インデックス: `deck_tags_tag_id_idx`（`tag_id`）

## settings

ユーザーごとのレベル設定。行がなければ英検2級（5,000語）とみなす。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| level_key | text | | | レベルの種類（`eiken-2` など） |
| vocab_size | integer | | | 知っているとみなす語の数 |
| user_id | integer | ○ | | ユーザー。NULL はユーザー管理を入れる前のデータ |

- 主キー: なし（`user_id` の一意インデックスで1人1行にする）
- 外部キー: `user_id` → `users.id`（ユーザーを消すと消える）
- チェック: `vocab_size` は 1 以上
- インデックス: `settings_user_id_idx`（一意、`user_id`）

## known_words

「知ってる」を押した語。字幕の解析で、知らない語の候補から外す。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| word | text | | | 語（原形） |
| created_at | timestamptz | | now() | 押した日時 |
| user_id | integer | ○ | | ユーザー。NULL はユーザー管理を入れる前のデータ |

- 主キー: なし（`user_id, word` の一意インデックス）
- 外部キー: `user_id` → `users.id`（ユーザーを消すと消える）
- インデックス: `known_words_user_word_idx`（一意、`user_id, word`）

## videos

おすすめの動画（みんなが学んだ動画）に出すための、YouTube の動画の情報（[features.md](features.md#13-おすすめの動画librecommendjs)）。
YouTube の oEmbed（API キー不要）で取る。ユーザーのものではない（どのユーザーのデッキかは入れない）。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| video_id | text | | | YouTube の動画 ID（11文字） |
| title | text | ○ | | 動画のタイトル（YouTube のもの。デッキ名ではない）。見られない動画は NULL |
| channel_title | text | ○ | | チャンネル名 |
| checked_at | timestamptz | | now() | oEmbed で取った日時。7日たつと取り直す |
| available | boolean | | true | oEmbed で取れたか。false = 非公開・消された（おすすめに出さない） |

- 主キー: `video_id`

## study_time

勉強時間（[features.md](features.md#14-勉強時間libstudytimejslibstudyclockjs)）。単語を覚えた時間（記憶テストの画面で操作していた時間）と、
リスニングの時間（アプリの中で動画を再生していた時間）。画面から30秒ごとなどに少しずつ送られてくるので、
1行は「その間に勉強した秒数」。統計の画面で手で足した分も入る。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | bigint | | 連番 | 主キー |
| user_id | integer | | | 勉強した人 |
| deck_id | integer | ○ | | 勉強したデッキ。手で足した分・デッキを消したあとは NULL |
| kind | text | | | `vocab`（単語）か `listening`（リスニング） |
| source | text | | 'auto' | `auto`（画面が測った）か `manual`（手で足した） |
| seconds | integer | | | 秒数。1以上（画面からは1回 600 秒まで、手で足すのは 600 分まで） |
| recorded_at | timestamptz | | now() | 記録した日時。日ごとの集計は日本時間で区切る |

- 主キー: `id`
- 外部キー: `user_id` → `users.id`（ユーザーを消すと消える）、`deck_id` → `decks.id`（デッキを消すと NULL。時間の記録は残す）
- インデックス: `study_time_user_recorded_at_idx`（`user_id, recorded_at`。日ごとの集計）、`study_time_deck_id_idx`（`deck_id`）

## story_scenes

物語の場面（[features.md](features.md#6-覚えた語で物語を作るlibstoryjslibstorypromptjs)）。物語のデッキの文を4文くらいずつの場面に分け、
場面ごとに絵を付ける。物語のデッキを初めて開いたときに作る。絵は画像そのものを入れる（取り込んだ画像か、無料の画像生成サービスで作った画像）。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| id | integer | | 連番 | 主キー |
| deck_id | integer | | | 物語のデッキ |
| position | integer | | | 場面の順番（0から） |
| first_sentence | integer | | | 場面の最初の文（`decks.sentences` の番号、0から） |
| last_sentence | integer | | | 場面の最後の文 |
| prompt | text | | | 絵の指示文（英語）。初めは「絵のスタイル＋場面の英文」。利用者が直せる |
| image | bytea | ○ | | 絵（5MB まで）。NULL = まだない |
| image_type | text | ○ | | 画像の種類（`image/png` など）。中身の先頭のバイトで見分けたもの |
| image_source | text | ○ | | `upload`（取り込んだ）か `generated`（自動で作った） |
| image_updated_at | timestamptz | ○ | | 絵を変えた日時。画像の URL に付けて、古い絵がキャッシュで出ないようにする |

- 主キー: `id`
- 外部キー: `deck_id` → `decks.id`（デッキを消すと消える）
- 一意: `(deck_id, position)`

## schema_migrations

当てたマイグレーションのファイル名。`scripts/migrate.mjs` が作る（`db/migrations/` には入っていない）。

| 列 | 型 | NULL | 初期値 | 説明 |
| --- | --- | --- | --- | --- |
| name | text | | | ファイル名（`013_users.sql` など） |
| applied_at | timestamptz | | now() | 当てた日時 |

- 主キー: `name`
