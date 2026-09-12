import type { Database } from 'better-sqlite3';
import type { SavedPrompt, SavedPromptKind } from '../../shared/types.ts';

/**
 * Prompts and lyric sheets somebody decided to keep.
 *
 * Global rather than per project, and saving over a name replaces what was
 * there. Two entries called "warm synthwave" that differ by a word is the
 * failure mode a list like this has, and a unique name per kind is what
 * prevents it.
 */

interface Record_ {
  id: string;
  kind: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function toSaved(record: Record_): SavedPrompt {
  return {
    id: record.id,
    kind: record.kind as SavedPromptKind,
    name: record.name,
    body: record.body,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function listSaved(handle: Database, kind?: SavedPromptKind): SavedPrompt[] {
  const records = (
    kind === undefined
      ? handle.prepare('SELECT * FROM saved_prompts ORDER BY kind, name').all()
      : handle.prepare('SELECT * FROM saved_prompts WHERE kind = ? ORDER BY name').all(kind)
  ) as Record_[];

  return records.map(toSaved);
}

export function readSaved(handle: Database, id: string): SavedPrompt | undefined {
  const record = handle.prepare('SELECT * FROM saved_prompts WHERE id = ?').get(id) as
    | Record_
    | undefined;
  return record ? toSaved(record) : undefined;
}

/**
 * Saves under a name, replacing whatever was under it.
 *
 * The id of an existing entry is kept, so a link to it stays valid and the list
 * does not reorder under somebody who is saving twice in a row.
 */
export function saveNamed(
  handle: Database,
  id: string,
  input: { kind: SavedPromptKind; name: string; body: string },
): SavedPrompt {
  const existing = handle
    .prepare('SELECT id FROM saved_prompts WHERE kind = ? AND name = ?')
    .get(input.kind, input.name) as { id: string } | undefined;

  if (existing) {
    handle
      .prepare(`UPDATE saved_prompts SET body = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(input.body, existing.id);
    const updated = readSaved(handle, existing.id);
    if (!updated) throw new Error(`Saved prompt ${existing.id} vanished while being replaced`);
    return updated;
  }

  handle
    .prepare('INSERT INTO saved_prompts (id, kind, name, body) VALUES (?, ?, ?, ?)')
    .run(id, input.kind, input.name, input.body);

  const saved = readSaved(handle, id);
  if (!saved) throw new Error(`Saved prompt ${id} vanished immediately after being created`);
  return saved;
}

export function deleteSaved(handle: Database, id: string): boolean {
  return handle.prepare('DELETE FROM saved_prompts WHERE id = ?').run(id).changes > 0;
}
