-- 最初のテーブルとサンプルデータ

-- デッキ（テーマ）
CREATE TABLE decks (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- カード。必ずどれか1つのデッキに属する。デッキを消すとカードも消える
CREATE TABLE cards (
  id         SERIAL PRIMARY KEY,
  deck_id    INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front      TEXT NOT NULL,           -- 表（問題）
  back       TEXT NOT NULL,           -- 裏（答え）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cards_deck_id_idx ON cards (deck_id);

-- サンプルデータ
INSERT INTO decks (id, name) VALUES
  (1, '英単語'),
  (2, 'Docker');
SELECT setval('decks_id_seq', (SELECT max(id) FROM decks));

INSERT INTO cards (deck_id, front, back) VALUES
  (1, 'apple', 'りんご'),
  (1, 'book',  '本'),
  (1, 'cat',   'ねこ'),
  (2, 'Docker とは？',  'アプリを「コンテナ」という箱に入れて、どのPCでも同じように動かすための仕組み'),
  (2, 'イメージとは？', 'コンテナを作るための設計図'),
  (2, 'docker compose up -d の -d は？', 'バックグラウンドで起動する（detached）');
