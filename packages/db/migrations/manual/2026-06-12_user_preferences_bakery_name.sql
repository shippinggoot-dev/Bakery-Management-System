-- =====================================================================
-- Move workspace bakery name from browser localStorage to user_preferences
--
-- Before this change, each user's personalised bakery name was stored
-- only in localStorage (key `bms-bakery-name`) — so it lived per-device
-- and was lost on browser clear / new device. The ThemeProvider rewrite
-- (apps/web/src/components/ThemeProvider.tsx) now treats the server as
-- the source of truth for authenticated, non-anonymous users; the column
-- below is where it lands.
--
-- Anonymous (demo-mode) users continue to use localStorage only, since
-- the update procedure is protectedProcedure and rejects them.
--
-- First time a real user loads the new code with localStorage still
-- holding a personalised name, ThemeProvider migrates it up silently
-- via preferences.update — no data backfill needed here.
--
-- Additive only, idempotent.
-- =====================================================================

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS bakery_name text;
