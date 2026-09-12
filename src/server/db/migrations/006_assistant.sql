-- Phase 4: the lyrics assistant, and prompts worth keeping.
--
-- jobs.original_prompt records what the person wrote when the prompt that ran
-- was not it. The assistant expands a short idea into a paragraph, and without
-- this column going back to the idea would mean reverse engineering it out of
-- the expansion. It is NULL on every job whose prompt was sent as written,
-- which is how "was this enhanced" is answered without a second flag.
--
-- saved_prompts is separate from job history on purpose. History records what
-- was used. This records what somebody decided was worth using again, which is
-- a much smaller set and does not shrink when a project is deleted. Rows are
-- global rather than owned by a project: a style you like is yours, not the
-- album's.

ALTER TABLE jobs ADD COLUMN original_prompt TEXT;

CREATE TABLE saved_prompts (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('prompt','lyrics')),
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- A name is unique within its kind, so saving over a name you already used
-- replaces it rather than leaving two entries that look the same in a list.
CREATE UNIQUE INDEX saved_prompts_by_name ON saved_prompts (kind, name);
