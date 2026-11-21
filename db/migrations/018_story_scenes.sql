-- 物語の場面。物語（decks.kind = 'story'）の文を、4文くらいずつの場面に分け、場面ごとに絵を付ける。
-- 絵は、利用者が取り込んだ画像か、無料の画像生成サービスで作った画像（画像そのものをここに入れる）
CREATE TABLE story_scenes (
  id               SERIAL PRIMARY KEY,
  deck_id          INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL,          -- 場面の順番（0から）
  first_sentence   INTEGER NOT NULL,          -- 場面の最初の文（decks.sentences の番号、0から）
  last_sentence    INTEGER NOT NULL,          -- 場面の最後の文
  prompt           TEXT NOT NULL,             -- 絵の指示文（英語）。利用者が直せる
  image            BYTEA,                     -- 絵（NULL = まだない）
  image_type       TEXT,                      -- image/png など。中身で見分けた種類
  image_source     TEXT CHECK (image_source IN ('upload', 'generated')),
  image_updated_at TIMESTAMPTZ,
  UNIQUE (deck_id, position)
);
