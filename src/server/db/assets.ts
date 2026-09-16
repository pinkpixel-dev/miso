import type { Database } from 'better-sqlite3';
import type { Asset, AssetFormat, AssetKind, LibraryTake } from '../../shared/types.ts';

/**
 * Asset rows.
 *
 * Peaks live in a TEXT column as JSON. They are display data, never queried on,
 * so a column per channel would buy nothing and a separate table would cost a
 * join on every read.
 *
 * Newest first breaks ties on rowid, not id. created_at has one second
 * resolution, so two assets imported in the same second tie, and the id is a
 * random UUID which would order them arbitrarily. rowid is insertion order.
 */

interface Record_ {
  id: string;
  project_id: string;
  kind: string;
  label: string;
  filename: string;
  format: string;
  bytes: number;
  checksum: string;
  duration_seconds: number | null;
  sample_rate: number | null;
  channels: number | null;
  peaks: string | null;
  created_at: string;
}

export interface NewAsset {
  /**
   * Chosen by the caller, not here. The file on disk is named by this id, and
   * the file is written before the row, so the id has to exist first.
   */
  id: string;
  projectId: string;
  kind: AssetKind;
  label: string;
  filename: string;
  format: AssetFormat;
  bytes: number;
  checksum: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  /** The job that produced this asset. Absent for an imported file. */
  jobId?: string;
}

function parsePeaks(raw: string | null): number[][] | undefined {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as number[][];
  } catch {
    // A row whose peaks column is not JSON is treated as having none. The
    // waveform redraws from a fresh upload rather than the read failing.
    return undefined;
  }
}

function toAsset(record: Record_): Asset {
  return {
    id: record.id,
    projectId: record.project_id,
    kind: record.kind as AssetKind,
    label: record.label,
    filename: record.filename,
    format: record.format as AssetFormat,
    bytes: record.bytes,
    checksum: record.checksum,
    durationSeconds: record.duration_seconds ?? undefined,
    sampleRate: record.sample_rate ?? undefined,
    channels: record.channels ?? undefined,
    peaks: parsePeaks(record.peaks),
    createdAt: record.created_at,
  };
}

export function listAssets(handle: Database, projectId: string): Asset[] {
  const records = handle
    .prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(projectId) as Record_[];
  return records.map(toAsset);
}

/** The row shape behind a library take. Peaks are never selected. */
interface LibraryRecord {
  id: string;
  project_id: string;
  project_name: string;
  kind: string;
  label: string;
  format: string;
  bytes: number;
  duration_seconds: number | null;
  created_at: string;
  has_peaks: number;
  task_id: string | null;
  title: string | null;
  params: string | null;
}

/**
 * Reads a string parameter out of a job's stored JSON.
 *
 * A row whose params will not parse loses its prompt and keeps its take, which
 * is the same choice `toJob` makes for the same reason.
 */
function jobText(params: string | null, name: string): string | undefined {
  if (params === null) return undefined;
  try {
    const value = (JSON.parse(params) as Record<string, unknown>)[name];
    return typeof value === 'string' && value !== '' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every take in Miso, across every project, newest first.
 *
 * Columns are listed rather than selected with a star, and that is the point of
 * the function: the peaks column is 23 KB a row and the library draws no
 * waveforms. Leaving it unread is what makes one response for the whole
 * database reasonable.
 *
 * The joins carry what a search needs and nothing more. The project name comes
 * from projects, and the task, the song title, the prompt and the lyrics come
 * from the job that produced the take. An imported take has no job and matches
 * on its label and its project alone.
 */
export function listLibraryTakes(handle: Database): LibraryTake[] {
  const records = handle
    .prepare(
      `SELECT a.id, a.project_id, a.kind, a.label, a.format, a.bytes,
              a.duration_seconds, a.created_at,
              a.peaks IS NOT NULL AS has_peaks,
              p.name AS project_name,
              j.task_id, j.title, j.params
       FROM assets a
       JOIN projects p ON p.id = a.project_id
       LEFT JOIN jobs j ON j.id = a.job_id
       ORDER BY a.created_at DESC, a.rowid DESC`,
    )
    .all() as LibraryRecord[];

  return records.map((record) => ({
    assetId: record.id,
    projectId: record.project_id,
    projectName: record.project_name,
    label: record.label,
    kind: record.kind as AssetKind,
    format: record.format as AssetFormat,
    bytes: record.bytes,
    durationSeconds: record.duration_seconds ?? undefined,
    createdAt: record.created_at,
    hasPeaks: record.has_peaks === 1,
    taskId: record.task_id ?? undefined,
    title: record.title ?? undefined,
    prompt: jobText(record.params, 'prompt'),
    lyrics: jobText(record.params, 'lyrics'),
  }));
}

export function readAsset(handle: Database, id: string): Asset | undefined {
  const record = handle.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record_ | undefined;
  return record ? toAsset(record) : undefined;
}

export function insertAsset(handle: Database, input: NewAsset): Asset {
  const id = input.id;
  handle
    .prepare(
      `INSERT INTO assets
         (id, project_id, kind, label, filename, format, bytes, checksum,
          duration_seconds, sample_rate, channels, job_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.kind,
      input.label,
      input.filename,
      input.format,
      input.bytes,
      input.checksum,
      input.durationSeconds ?? null,
      input.sampleRate ?? null,
      input.channels ?? null,
      input.jobId ?? null,
    );

  const asset = readAsset(handle, id);
  if (!asset) throw new Error(`Asset ${id} vanished immediately after being created`);
  return asset;
}

export function setAssetPeaks(handle: Database, id: string, peaks: number[][]): Asset | undefined {
  const result = handle.prepare('UPDATE assets SET peaks = ? WHERE id = ?').run(JSON.stringify(peaks), id);
  return result.changes === 0 ? undefined : readAsset(handle, id);
}

export function renameAsset(handle: Database, id: string, label: string): Asset | undefined {
  const result = handle.prepare('UPDATE assets SET label = ? WHERE id = ?').run(label, id);
  return result.changes === 0 ? undefined : readAsset(handle, id);
}

export function deleteAsset(handle: Database, id: string): boolean {
  return handle.prepare('DELETE FROM assets WHERE id = ?').run(id).changes > 0;
}
