-- Phase 1 schema: settings only.
--
-- Projects, assets, jobs, asset lineage, and staged uploads arrive in phase 3
-- as 002_library.sql. They are deliberately not stubbed here: an empty table is
-- harder to reason about than a table that does not exist yet.

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
