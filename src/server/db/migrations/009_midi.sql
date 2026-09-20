-- Transcriptions: what `analyze.midi` leaves behind.
--
-- Deliberately not a row in `assets`. A MIDI file is not a take. It cannot be
-- played by the dock, drawn as a waveform, exported as WAV or MP3, separated,
-- mixed, or read at all by music-metadata, which is what decides an asset's
-- format. Filing one as an asset would put a broken row on every screen that
-- lists takes, and DOCS/MEMORY.md already carries the rule from the MP3 work:
-- a format Miso cannot read must not end up inside a project as a take.
--
-- `events` is the note list the model returned, as JSON. It is stored rather
-- than re-derived because the preview plays from it, and parsing MIDI back
-- into notes to play a file we were handed the notes for would be work in a
-- circle. The `.mid` file is what you download; `events` is what you hear.
--
-- The source is the take this was read from. Deleting that take takes its
-- transcriptions with it, because a transcription of nothing means nothing.
-- The job is kept for the same reason assets keep theirs, and survives the
-- job being dismissed.
CREATE TABLE midi_artifacts (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source_asset_id  TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  job_id           TEXT REFERENCES jobs (id) ON DELETE SET NULL,
  label            TEXT NOT NULL,
  filename         TEXT NOT NULL,
  bytes            INTEGER NOT NULL,
  checksum         TEXT NOT NULL,
  note_count       INTEGER NOT NULL,
  duration_seconds REAL,
  events           TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- The page lists one project's transcriptions, newest first, and a take's
-- detail shows its own.
CREATE INDEX midi_artifacts_project ON midi_artifacts (project_id, created_at DESC);
CREATE INDEX midi_artifacts_source ON midi_artifacts (source_asset_id);
