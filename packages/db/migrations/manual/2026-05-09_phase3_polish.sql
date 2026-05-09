-- =====================================================================
-- Phase 3 polish migration
--
-- Run this AFTER 2026-05-09_phase2_integrations.sql.
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.
-- =====================================================================

-- 1) Auto-todos linkage. When a system event (e.g. a confirmed PO) creates a
--    todo, source_type + source_id let us dedupe (no double creation if the
--    same PO is re-confirmed) and lifecycle (mark the linked todo done when
--    the source PO is delivered).
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS source_id   uuid;

CREATE INDEX IF NOT EXISTS idx_todos_source
  ON todos(source_type, source_id);
