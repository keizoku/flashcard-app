-- デッキに元の YouTube 動画と字幕を保存する（毎回貼り付けなくてよいように）
ALTER TABLE decks
  ADD COLUMN video_id   TEXT,
  ADD COLUMN transcript TEXT;
