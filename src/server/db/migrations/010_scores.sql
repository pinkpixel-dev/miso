-- Scores: the ABC plan YuE2 writes before it writes the music.
--
-- Not a row in `assets`, for the same reason a transcription is not one. An
-- ABC score cannot be played by the dock, drawn as a waveform, exported as
-- audio, separated or mixed, and music-metadata cannot read it. See the note
-- on `midi_artifacts` in 009.
--
-- Not a row in `midi_artifacts` either, though they are cousins. That table is
-- built around note events and a note count, which is what its preview plays
-- and what its rows are sorted and described by. A score has neither. It is a
-- text document with voices, chord symbols and section markers, and forcing it
-- into columns that mean something else would leave note_count lying at zero
-- on every row.
--
-- `abc` holds the score itself rather than a path. It came back as about a
-- kilobyte of text, which is smaller than the row describing it, so a file on
-- disk would add a rename dance and a way to leave orphans behind for nothing.
-- The download route serves this column.
--
-- The take is the song this was planned for. Deleting the take takes its score
-- with it, because a plan for a song that no longer exists means nothing. The
-- job is kept the same way assets keep theirs, and survives the job being
-- dismissed.
CREATE TABLE score_artifacts (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  asset_id    TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  job_id      TEXT REFERENCES jobs (id) ON DELETE SET NULL,
  label       TEXT NOT NULL,
  filename    TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  checksum    TEXT NOT NULL,
  abc         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- A take shows its own score, and the project lists them newest first.
CREATE INDEX score_artifacts_asset ON score_artifacts (asset_id);
CREATE INDEX score_artifacts_project ON score_artifacts (project_id, created_at DESC);
