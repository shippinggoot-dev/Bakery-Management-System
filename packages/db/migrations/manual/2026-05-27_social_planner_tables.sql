-- =============================================================================
-- Social Planner — schema for Instagram drafts, AI usage, brand voice, subs
-- =============================================================================
-- Step 1 of the social planner feature. Adds four tables, RLS-enabled with
-- the standard owner_access policy used elsewhere in the project.
--
-- Run this ONCE in the Supabase SQL Editor (supabase.com → your project →
-- SQL Editor → paste and click Run).
--
-- Safe to re-run: IF NOT EXISTS guards prevent duplicate-object errors.
-- =============================================================================

-- ── instagram_drafts ────────────────────────────────────────────────────────
-- Scheduled and unscheduled draft posts. Cron worker polls this table.

CREATE TABLE IF NOT EXISTS instagram_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL,
  image_url     text,
  caption       text,
  scheduled_for timestamptz,
  status        text NOT NULL DEFAULT 'draft',
  platforms     jsonb NOT NULL DEFAULT '["instagram"]'::jsonb,
  ig_media_id   text,
  published_at  timestamptz,
  error_message text,
  retry_count   integer NOT NULL DEFAULT 0,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_drafts_owner
  ON instagram_drafts(owner_id);

-- Partial index — only the rows the cron worker actually scans
CREATE INDEX IF NOT EXISTS idx_instagram_drafts_due
  ON instagram_drafts(scheduled_for)
  WHERE status = 'scheduled';

ALTER TABLE instagram_drafts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='instagram_drafts' AND policyname='owner_access'
  ) THEN
    CREATE POLICY owner_access ON instagram_drafts
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

-- ── ai_usage ────────────────────────────────────────────────────────────────
-- Per-Claude-call audit log for quota + cost visibility.

CREATE TABLE IF NOT EXISTS ai_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL,
  feature       text NOT NULL,
  input_tokens  integer NOT NULL,
  output_tokens integer NOT NULL,
  cost_cents    numeric(10,4) NOT NULL,
  outcome       text NOT NULL DEFAULT 'ok',
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_owner_created
  ON ai_usage(owner_id, created_at);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='ai_usage' AND policyname='owner_access'
  ) THEN
    CREATE POLICY owner_access ON ai_usage
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

-- ── brand_voice ─────────────────────────────────────────────────────────────
-- One row per bakery; stores Claude's analysis of their captioning style.

CREATE TABLE IF NOT EXISTS brand_voice (
  owner_id          uuid PRIMARY KEY,
  voice_description text,
  example_captions  jsonb,
  generated_at      timestamp,
  updated_at        timestamp NOT NULL DEFAULT now()
);

ALTER TABLE brand_voice ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='brand_voice' AND policyname='owner_access'
  ) THEN
    CREATE POLICY owner_access ON brand_voice
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

-- ── subscriptions ───────────────────────────────────────────────────────────
-- Quota tier per user. Stripe columns left null until Stripe is wired up.

CREATE TABLE IF NOT EXISTS subscriptions (
  owner_id               uuid PRIMARY KEY,
  tier                   text NOT NULL DEFAULT 'free',
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='subscriptions' AND policyname='owner_access'
  ) THEN
    CREATE POLICY owner_access ON subscriptions
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

-- =============================================================================
-- Done. Verify with:
--   SELECT tablename FROM pg_tables WHERE schemaname='public'
--     AND tablename IN ('instagram_drafts','ai_usage','brand_voice','subscriptions');
-- Should return 4 rows.
-- =============================================================================
