-- 字幕から例文カードを作る機能（センテンスマイニング）用

-- 例文カード用の列（手で作ったカードは NULL のまま）
ALTER TABLE cards
  ADD COLUMN target_word  TEXT,     -- 覚えたい単語の原形（例: run）
  ADD COLUMN target_form  TEXT,     -- 例文の中での形（例: ran）。強調表示に使う
  ADD COLUMN video_id     TEXT,     -- YouTube の動画 ID
  ADD COLUMN start_seconds INTEGER; -- 動画の中でその文が始まる秒数

-- 設定（1人用アプリなので1行だけ）
CREATE TABLE settings (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  level_key   TEXT    NOT NULL,
  vocab_size  INTEGER NOT NULL CHECK (vocab_size > 0)
);
INSERT INTO settings (level_key, vocab_size) VALUES ('eiken-2', 5000);

-- 「この単語は知っている」とユーザーが指定した単語（原形）
CREATE TABLE known_words (
  word       TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
