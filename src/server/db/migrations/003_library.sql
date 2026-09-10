-- Phase 3: projects, assets, and the shape phase 4 will write into.
--
-- All five tables land together on purpose. Only projects and assets are
-- written by phase 3 code. jobs, asset_lineage, and staged_uploads are created
-- empty and stay empty until the job system arrives in phase 4.
--
-- This deliberately reverses the note in 001_initial.sql, which said library
-- tables were not stubbed because an empty table is harder to reason about than
-- one that does not exist. That held while the shape was unsettled. The shape is
-- now settled in DOCS/specs/2026-09-09-phase-3-library-design.md, and the whole
-- model is easier to review in one file than split across two phases. The
-- decision and its rejected alternatives are in DOCS/MEMORY.md.

CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- Names are not unique. Two projects called "demo" is normal, and a rejected
-- rename is worse than a repeated name.

CREATE TABLE jobs (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id    TEXT NOT NULL,
  model_id   TEXT NOT NULL,
  params     TEXT NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('queued','running','complete','failed','cancelled')),
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE assets (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('source','generated','stem')),
  label            TEXT NOT NULL,
  filename         TEXT NOT NULL,
  format           TEXT NOT NULL CHECK (format IN ('wav','flac','mp3','m4a')),
  bytes            INTEGER NOT NULL,
  checksum         TEXT NOT NULL,
  duration_seconds REAL,
  sample_rate      INTEGER,
  channels         INTEGER,
  peaks            TEXT,
  job_id           TEXT REFERENCES jobs (id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- The file path is not stored. It is derived from project_id, id, and format by
-- src/server/library/storage.ts. A stored path can disagree with the disk, and
-- then the same fact has two sources of truth.

CREATE INDEX assets_by_project ON assets (project_id, created_at DESC);

CREATE TABLE asset_lineage (
  job_id   TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  role     TEXT NOT NULL,
  PRIMARY KEY (job_id, asset_id, role)
) STRICT;

-- role names what an input was to its job, for example the clip a region was
-- repainted against. Phase 4 defines the values, when a task registry exists to
-- define them against.

CREATE TABLE staged_uploads (
  asset_id        TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  server_identity TEXT NOT NULL,
  remote_path     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (asset_id, server_identity)
) STRICT;
