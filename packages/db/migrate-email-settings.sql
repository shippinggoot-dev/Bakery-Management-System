-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL UNIQUE,
  from_name           text,
  from_email          text,
  resend_api_key      text,
  send_confirmations  boolean NOT NULL DEFAULT false,
  send_status_updates boolean NOT NULL DEFAULT false,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);

-- RLS: owners can only see and modify their own row
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS owner_all ON email_settings
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
