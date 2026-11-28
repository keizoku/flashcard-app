-- おためしを始めた人数を、日ごと（日本時間）に数える。管理者の画面の「日ごとの推移」で使う。
-- おためしユーザーは1日で消え、guest_starts も1日で消すので、数だけをここに残す（だれが始めたかは残さない）
CREATE TABLE guest_daily (
  day    DATE PRIMARY KEY,
  starts INTEGER NOT NULL DEFAULT 0 CHECK (starts >= 0)
);
