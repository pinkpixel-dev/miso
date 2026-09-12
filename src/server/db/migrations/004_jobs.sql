-- Phase 4: the job queue.
--
-- jobs is dropped and recreated rather than altered. SQLite cannot change a
-- CHECK constraint in place, and the table is empty: 003 created it for phase 4
-- to fill, and nothing in phase 3 ever inserted a row. assets.job_id and
-- asset_lineage.job_id are declared against the name "jobs", which exists again
-- by the end of this file, and every assets.job_id today is NULL, so the drop
-- violates nothing.
--
-- What changed from the 003 shape:
--   * staging is a state. Uploading a source asset to audio.cpp happens before
--     the model runs and can fail on its own, so it reads differently in the UI
--     and is worth telling apart from running.
--   * started_at and finished_at exist. Elapsed time while a job runs, and the
--     duration estimate from past runs, both need them, and created_at cannot
--     give either once a job has waited in the queue.
--   * attempts exists. A 503 server_busy is requeued with backoff, and without
--     a count that retry loop has no end.

DROP TABLE jobs;

CREATE TABLE jobs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id     TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  params      TEXT NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('queued','staging','running','complete','failed','cancelled')),
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  started_at  TEXT,
  finished_at TEXT
) STRICT;

-- The queue reads "oldest job still waiting" on every turn of the worker, and
-- the project screen reads "this project's jobs, newest first".
CREATE INDEX jobs_by_state ON jobs (state, created_at);
CREATE INDEX jobs_by_project ON jobs (project_id, created_at DESC);
