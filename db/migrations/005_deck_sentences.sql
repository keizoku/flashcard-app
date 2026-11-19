-- 句読点のない字幕を AI で文に整えた結果を、デッキごとに保存しておく（毎回 AI を呼ばないように）
ALTER TABLE decks
  ADD COLUMN sentences      JSONB,  -- [{ "start": 秒, "text": "完結した文" }]
  ADD COLUMN sentences_hash TEXT;   -- どの字幕から作ったか（字幕が変わったら作り直す）
