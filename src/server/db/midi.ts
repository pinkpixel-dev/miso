import type { Database } from 'better-sqlite3';
import type { MidiArtifact, MidiNote } from '../../shared/types.ts';

/**
 * Transcription rows.
 *
 * The note list lives in a TEXT column as JSON, the same way peaks do on an
 * asset. It is display and playback data, never queried on, so columns or a
 * table of notes would cost a join on every read and buy nothing.
 *
 * Newest first breaks ties on rowid rather than id, for the reason assets do:
 * created_at has one second resolution and the id is a random UUID.
 */

interface Record_ {
  id: string;
  project_id: string;
  source_asset_id: string;
  job_id: string | null;
  label: string;
  filename: string;
  bytes: number;
  note_count: number;
  duration_seconds: number | null;
  events: string;
  created_at: string;
}

export interface NewMidiArtifact {
  /** Chosen by the caller: the file on disk is named by it and written first. */
  id: string;
  projectId: string;
  sourceAssetId: string;
  jobId?: string;
  label: string;
  filename: string;
  bytes: number;
  checksum: string;
  durationSeconds?: number;
  notes: MidiNote[];
}

function parseNotes(raw: string): MidiNote[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MidiNote[]) : [];
  } catch {
    // A row whose events column is not JSON still has a downloadable file. The
    // preview is what goes missing, not the transcription.
    return [];
  }
}

function toArtifact(row: Record_): MidiArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceAssetId: row.source_asset_id,
    jobId: row.job_id ?? undefined,
    label: row.label,
    filename: row.filename,
    bytes: row.bytes,
    noteCount: row.note_count,
    durationSeconds: row.duration_seconds ?? undefined,
    notes: parseNotes(row.events),
    createdAt: row.created_at,
  };
}

export function insertMidiArtifact(handle: Database, input: NewMidiArtifact): MidiArtifact {
  handle
    .prepare(
      `INSERT INTO midi_artifacts
         (id, project_id, source_asset_id, job_id, label, filename, bytes, checksum,
          note_count, duration_seconds, events)
       VALUES
         (@id, @projectId, @sourceAssetId, @jobId, @label, @filename, @bytes, @checksum,
          @noteCount, @durationSeconds, @events)`,
    )
    .run({
      id: input.id,
      projectId: input.projectId,
      sourceAssetId: input.sourceAssetId,
      jobId: input.jobId ?? null,
      label: input.label,
      filename: input.filename,
      bytes: input.bytes,
      checksum: input.checksum,
      noteCount: input.notes.length,
      durationSeconds: input.durationSeconds ?? null,
      events: JSON.stringify(input.notes),
    });

  const row = findMidiArtifact(handle, input.id);
  if (!row) throw new Error('The transcription row disappeared immediately after it was written');
  return row;
}

export function findMidiArtifact(handle: Database, id: string): MidiArtifact | undefined {
  const row = handle.prepare('SELECT * FROM midi_artifacts WHERE id = ?').get(id) as Record_ | undefined;
  return row ? toArtifact(row) : undefined;
}

export function listMidiArtifacts(handle: Database, projectId: string): MidiArtifact[] {
  const rows = handle
    .prepare('SELECT * FROM midi_artifacts WHERE project_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(projectId) as Record_[];
  return rows.map(toArtifact);
}

/** True when a row was removed. The file on disk is the caller's to delete. */
export function deleteMidiArtifact(handle: Database, id: string): boolean {
  return handle.prepare('DELETE FROM midi_artifacts WHERE id = ?').run(id).changes > 0;
}
