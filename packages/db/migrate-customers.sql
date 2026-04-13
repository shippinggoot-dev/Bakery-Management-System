-- ────────────────────────────────────────────────────────────��────────────────
-- Customer Registration & Loyalty Tables
-- Run this migration in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Sequence for card numbers ─────────────────────────────────────────────────
-- The application generates BAK-XXXXXX card numbers in code.
-- This table is the source of truth for customers.

-- ── customers ──────────────────────────────────────────────────────��─────────
CREATE TABLE IF NOT EXISTS customers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL,
  card_number           TEXT NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  phone                 TEXT,
  email                 TEXT,
  birthday              TEXT,          -- YYYY-MM-DD
  dietary_requirements  TEXT,          -- JSON array string
  favourite_category    TEXT,
  loyalty_opt_in        BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_opt_in      BOOLEAN NOT NULL DEFAULT FALSE,
  consent_timestamp     TIMESTAMPTZ,
  points                INTEGER NOT NULL DEFAULT 0,
  lifetime_points       INTEGER NOT NULL DEFAULT 0,
  total_spend           TEXT NOT NULL DEFAULT '0',
  tier                  TEXT NOT NULL DEFAULT 'bronze',
  last_visit_at         TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_owner_id      ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone         ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email         ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_tier          ON customers(tier);
CREATE INDEX IF NOT EXISTS idx_customers_last_visit_at ON customers(last_visit_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_card_number ON customers(card_number);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_owner ON customers USING (owner_id = auth.uid());
GRANT ALL ON customers TO authenticated;

-- ── loyalty_tiers ────────────────────��──────────────────────��────────────────
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  min_points  INTEGER NOT NULL DEFAULT 0,
  multiplier  TEXT NOT NULL DEFAULT '1.0',
  color       TEXT NOT NULL DEFAULT '#CD7F32',
  perks       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_owner_id ON loyalty_tiers(owner_id);
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_tiers_owner ON loyalty_tiers USING (owner_id = auth.uid());
GRANT ALL ON loyalty_tiers TO authenticated;

-- ── loyalty_transactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  points_delta    INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  reference_id    UUID,
  reference_type  TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_owner_id    ON loyalty_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type        ON loyalty_transactions(type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_created_at  ON loyalty_transactions(created_at);

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_transactions_owner ON loyalty_transactions USING (owner_id = auth.uid());
GRANT ALL ON loyalty_transactions TO authenticated;

-- ── rewards ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL,
  customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL,
  description           TEXT NOT NULL,
  discount_pct          INTEGER,
  free_item_description TEXT,
  points_required       INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending',
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until           TIMESTAMPTZ NOT NULL,
  redeemed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewards_customer_id ON rewards(customer_id);
CREATE INDEX IF NOT EXISTS idx_rewards_owner_id    ON rewards(owner_id);
CREATE INDEX IF NOT EXISTS idx_rewards_status      ON rewards(status);
CREATE INDEX IF NOT EXISTS idx_rewards_valid_until ON rewards(valid_until);

ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY rewards_owner ON rewards USING (owner_id = auth.uid());
GRANT ALL ON rewards TO authenticated;

-- ── customer_segments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_segments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  criteria     TEXT NOT NULL DEFAULT '{}',
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_owner_id ON customer_segments(owner_id);
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_segments_owner ON customer_segments USING (owner_id = auth.uid());
GRANT ALL ON customer_segments TO authenticated;

-- ── customer_segment_members ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_segment_members (
  segment_id  UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (segment_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_csm_segment_id  ON customer_segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_csm_customer_id ON customer_segment_members(customer_id);

ALTER TABLE customer_segment_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY csm_owner ON customer_segment_members
  USING (EXISTS (
    SELECT 1 FROM customer_segments
    WHERE customer_segments.id = customer_segment_members.segment_id
      AND customer_segments.owner_id = auth.uid()
  ));
GRANT ALL ON customer_segment_members TO authenticated;

-- ── customer_sales ─────────────────────────────────────────────────────────��─
CREATE TABLE IF NOT EXISTS customer_sales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL,
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  amount              TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'NOK',
  items               TEXT,
  points_awarded      INTEGER NOT NULL DEFAULT 0,
  reward_redeemed_id  UUID,
  notes               TEXT,
  sold_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_sales_customer_id ON customer_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sales_owner_id    ON customer_sales(owner_id);
CREATE INDEX IF NOT EXISTS idx_customer_sales_sold_at     ON customer_sales(sold_at);

ALTER TABLE customer_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_sales_owner ON customer_sales USING (owner_id = auth.uid());
GRANT ALL ON customer_sales TO authenticated;
