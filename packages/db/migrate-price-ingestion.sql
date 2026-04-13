-- =============================================================================
-- Price Ingestion Module — Database Migration
-- =============================================================================
-- Run once in the Supabase SQL Editor to create the four new tables.
-- Safe to re-run: all statements use IF NOT EXISTS.
-- =============================================================================

-- ── price_ingestion_sessions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_ingestion_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('invoice', 'csv', 'api')),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_name     TEXT,
  item_count    INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  applied_count INTEGER DEFAULT 0,
  error_message TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_price_ingestion_sessions_owner_id
  ON price_ingestion_sessions (owner_id);
CREATE INDEX IF NOT EXISTS idx_price_ingestion_sessions_status
  ON price_ingestion_sessions (status);
CREATE INDEX IF NOT EXISTS idx_price_ingestion_sessions_started_at
  ON price_ingestion_sessions (started_at);

-- ── price_ingestion_items ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_ingestion_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES price_ingestion_sessions (id) ON DELETE CASCADE,
  raw_name        TEXT NOT NULL,
  raw_price       TEXT,
  raw_unit        TEXT,
  raw_quantity    TEXT,
  ingredient_id   UUID REFERENCES ingredients (id) ON DELETE SET NULL,
  supplier_id     UUID REFERENCES suppliers (id) ON DELETE SET NULL,
  match_score     TEXT,
  price_per_unit  TEXT,
  unit            TEXT,
  applied         BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
  rejected        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_ingestion_items_session_id
  ON price_ingestion_items (session_id);
CREATE INDEX IF NOT EXISTS idx_price_ingestion_items_ingredient_id
  ON price_ingestion_items (ingredient_id);

-- ── margin_settings ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS margin_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                  UUID NOT NULL UNIQUE,
  min_margin_pct            TEXT NOT NULL DEFAULT '20',
  price_rise_threshold_pct  TEXT NOT NULL DEFAULT '5',
  webhook_url               TEXT,
  webhook_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_margin_settings_owner_id
  ON margin_settings (owner_id);

-- ── notifications ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL,
  type       TEXT NOT NULL
               CHECK (type IN ('price_change', 'margin_breach', 'ingestion_complete', 'ingestion_failed')),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  payload    TEXT,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_id
  ON notifications (owner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read
  ON notifications (read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications (created_at);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Each table is owner-scoped. Anonymous users get their own rows via owner_id.

ALTER TABLE price_ingestion_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_ingestion_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;

-- Sessions: owner sees/writes own rows
CREATE POLICY "price_ingestion_sessions_owner"
  ON price_ingestion_sessions
  USING      (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Items: owner sees items from own sessions
CREATE POLICY "price_ingestion_items_owner"
  ON price_ingestion_items
  USING (
    session_id IN (
      SELECT id FROM price_ingestion_sessions WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM price_ingestion_sessions WHERE owner_id = auth.uid()
    )
  );

-- Margin settings: one row per owner
CREATE POLICY "margin_settings_owner"
  ON margin_settings
  USING      (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Notifications: owner sees own notifications
CREATE POLICY "notifications_owner"
  ON notifications
  USING      (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Grant access to the anon and authenticated roles (Supabase default roles)
GRANT ALL ON price_ingestion_sessions TO anon, authenticated;
GRANT ALL ON price_ingestion_items    TO anon, authenticated;
GRANT ALL ON margin_settings          TO anon, authenticated;
GRANT ALL ON notifications            TO anon, authenticated;
