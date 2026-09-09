-- Phase 2: installs Miso started.
--
-- audio.cpp forgets queued installs when it restarts, with no error, so Miso
-- keeps its own record of what it asked for. Rows are keyed by package and
-- backend URL: pointing Miso at a different server must not show installs that
-- belong to the first one.
--
-- The phase 3 library schema lands as 003_library.sql.

CREATE TABLE installs (
  package_id       TEXT NOT NULL,
  backend_url      TEXT NOT NULL,
  state            TEXT NOT NULL CHECK (state IN ('running','complete','failed','cancelled','interrupted')),
  phase            TEXT,
  downloaded_bytes INTEGER,
  total_bytes      INTEGER,
  error            TEXT,
  started_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (package_id, backend_url)
) STRICT;

CREATE INDEX installs_active ON installs (state) WHERE state = 'running';
