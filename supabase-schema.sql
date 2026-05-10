-- sessions テーブル
CREATE TABLE sessions (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON sessions (user_id, created_at DESC);

-- friends テーブル
CREATE TABLE friends (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL,
  name        TEXT        NOT NULL,
  friend_code TEXT        NOT NULL,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON friends (user_id);

-- pairing_codes テーブル（PCとスマホのペアリング用6桁コード）
CREATE TABLE IF NOT EXISTS pairing_codes (
  code        TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);
ALTER TABLE pairing_codes DISABLE ROW LEVEL SECURITY;

-- live_sessions テーブル（PCのアクティブセッション + リアルタイムスコア）
CREATE TABLE IF NOT EXISTS live_sessions (
  user_id         UUID        PRIMARY KEY,
  session_id      TEXT        NOT NULL,
  score           INT         DEFAULT 50,
  elapsed         INT         DEFAULT 0,
  current_app     TEXT        DEFAULT '',
  phone_count     INT         DEFAULT 0,
  session_title   TEXT        DEFAULT '',
  category        TEXT        DEFAULT '',
  planned_minutes INT         DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE live_sessions DISABLE ROW LEVEL SECURITY;

-- phone_events テーブル（スマホ離脱イベント）
CREATE TABLE IF NOT EXISTS phone_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL,
  session_id  TEXT        NOT NULL,
  type        TEXT        NOT NULL,
  ts          TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ON phone_events (session_id);
ALTER TABLE phone_events DISABLE ROW LEVEL SECURITY;

-- RLS（Row Level Security）は使わず、anon key + user_id フィルタで管理
-- ※個人用アプリのため許容。将来的に認証を追加する場合はここにポリシーを追加
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE friends  DISABLE ROW LEVEL SECURITY;

-- ── マイグレーション（既存DBへの適用） ──────────────────────────────────────
-- live_sessions に score カラムを追加（既存テーブルがある場合）
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS score           INT  DEFAULT 50,
  ADD COLUMN IF NOT EXISTS elapsed         INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_app     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_count     INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_title   TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS category        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS planned_minutes INT  DEFAULT 0;

-- Realtime 有効化（スマホがリアルタイムでスコアを受信するために必須）
ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;

-- session-photos ストレージバケット（写真のクロスデバイス同期用）
INSERT INTO storage.buckets (id, name, public)
  VALUES ('session-photos', 'session-photos', true)
  ON CONFLICT (id) DO NOTHING;

-- session_photos テーブル（セッションIDと写真URLのマッピング）
CREATE TABLE IF NOT EXISTS session_photos (
  session_id  TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL,
  photo_url   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE session_photos DISABLE ROW LEVEL SECURITY;
