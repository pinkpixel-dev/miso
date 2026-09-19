-- A mix is its own kind of take.
--
-- Recombining stems produces something that is neither generated nor a stem:
-- audio.cpp never saw it, and it is a whole track rather than a part of one.
-- Without a kind of its own it would sit under the same heading as the songs
-- the models wrote, which is exactly the distinction somebody recombining
-- stems is trying to see.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt.
--
-- The rebuild has one trap in it, and it is not obvious. With foreign keys
-- enforced, which is how this service opens the database, DROP TABLE runs an
-- implicit DELETE of every row first. asset_lineage and staged_uploads both
-- reference assets ON DELETE CASCADE, so that delete takes them with it and a
-- project loses the record of what was made from what. Measured, not guessed:
-- dropping the table with one lineage row present left none.
--
-- The usual answer is to turn foreign keys off around the rebuild. That is not
-- available here. PRAGMA foreign_keys is a no-op inside a transaction, and the
-- migration runner puts every migration in one so a failure cannot leave the
-- schema half changed. Giving that up to save two copies would be the worse
-- trade.
--
-- So the children are carried across by hand: held in temporary tables, and
-- put back once assets exists again under its own name.
--
-- legacy_alter_table keeps the rename from rewriting the references in other
-- tables to point at the temporary name.
PRAGMA legacy_alter_table = ON;

CREATE TEMP TABLE lineage_carry AS SELECT * FROM asset_lineage;
CREATE TEMP TABLE staged_carry AS SELECT * FROM staged_uploads;

CREATE TABLE assets_new (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('source','generated','stem','mix')),
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

INSERT INTO assets_new
  (id, project_id, kind, label, filename, format, bytes, checksum,
   duration_seconds, sample_rate, channels, peaks, job_id, created_at)
SELECT
  id, project_id, kind, label, filename, format, bytes, checksum,
  duration_seconds, sample_rate, channels, peaks, job_id, created_at
FROM assets;

DROP TABLE assets;

ALTER TABLE assets_new RENAME TO assets;

CREATE INDEX assets_by_project ON assets (project_id, created_at DESC);

-- Back into tables the cascade emptied. Every asset id they name is in the
-- rebuilt table, so these inserts satisfy the same foreign keys they did
-- before.
INSERT INTO asset_lineage (job_id, asset_id, role)
SELECT job_id, asset_id, role FROM lineage_carry;

INSERT INTO staged_uploads (asset_id, server_identity, remote_path, created_at)
SELECT asset_id, server_identity, remote_path, created_at FROM staged_carry;

DROP TABLE lineage_carry;
DROP TABLE staged_carry;

PRAGMA legacy_alter_table = OFF;
