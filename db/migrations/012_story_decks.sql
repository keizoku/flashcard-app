-- 覚えた単語で作る物語のデッキ
--   kind: 'video'（YouTube の字幕から作るデッキ。これまでのデッキ）/ 'story'（物語のデッキ）
--   story_words: 物語に使ってもらった単語（原形・イディオムのキー）の一覧
ALTER TABLE decks
  ADD COLUMN kind        TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'story')),
  ADD COLUMN story_words JSONB;
