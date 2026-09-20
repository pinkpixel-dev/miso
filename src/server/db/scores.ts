import type { Database } from 'better-sqlite3';
import type { ScoreArtifact } from '../../shared/types.ts';

/**
 * Score rows, one per take that was planned before it was played.
 *
 * The ABC text lives in a column rather than in a file, which 010 explains: it
 * is about a kilobyte, so a file on disk would add a rename dance and a way to
 * leave orphans behind and buy nothing.
 *
 * A take has at most one score today, because a run returns one. The table does
 * not enforce that, so a family that someday returns two stores two rather than
 * losing one.
 */

interface Record_ {
  id: string;
  project_id: string;
  asset_id: string;
  job_id: string | null;
  label: string;
  filename: string;
  bytes: number;
  checksum: string;
  abc: string;
  created_at: string;
}

export interface NewScoreArtifact {
  id: string;
  projectId: string;
  assetId: string;
  jobId?: string;
  label: string;
  filename: string;
  bytes: number;
  checksum: string;
  abc: string;
}

function toArtifact(row: Record_): ScoreArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    jobId: row.job_id ?? undefined,
    label: row.label,
    filename: row.filename,
    bytes: row.bytes,
    abc: row.abc,
    createdAt: row.created_at,
  };
}

export function insertScoreArtifact(handle: Database, input: NewScoreArtifact): ScoreArtifact {
  handle
    .prepare(
      `INSERT INTO score_artifacts
         (id, project_id, asset_id, job_id, label, filename, bytes, checksum, abc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.projectId,
      input.assetId,
      input.jobId ?? null,
      input.label,
      input.filename,
      input.bytes,
      input.checksum,
      input.abc,
    );

  const row = handle
    .prepare('SELECT * FROM score_artifacts WHERE id = ?')
    .get(input.id) as Record_;

  return toArtifact(row);
}

/** The score for one take, or undefined when it was generated without planning. */
export function findScoreForAsset(handle: Database, assetId: string): ScoreArtifact | undefined {
  const row = handle
    .prepare('SELECT * FROM score_artifacts WHERE asset_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(assetId) as Record_ | undefined;

  return row === undefined ? undefined : toArtifact(row);
}

/**
 * Which of these takes have a score, as a set of asset ids.
 *
 * The library asks about a page of takes at once, so this answers in one query
 * rather than one per row. The ABC itself is not read: the caller only needs to
 * know whether to draw the link.
 */
export function assetsWithScores(handle: Database, assetIds: string[]): Set<string> {
  if (assetIds.length === 0) return new Set();

  const holes = assetIds.map(() => '?').join(', ');
  const rows = handle
    .prepare(`SELECT DISTINCT asset_id FROM score_artifacts WHERE asset_id IN (${holes})`)
    .all(...assetIds) as { asset_id: string }[];

  return new Set(rows.map((row) => row.asset_id));
}

/**
 * Every score in one project, newest first.
 *
 * The ABC comes with each row rather than behind a second request. The picker
 * on the create form loads a score into the box the moment it is chosen, and a
 * score is about a kilobyte, so a list of them is smaller than the list of
 * transcriptions next door that carries every note event.
 *
 * `score_artifacts_project` in 010 is the index this reads, which was added
 * against this query before there was one.
 */
export function listScoreArtifacts(handle: Database, projectId: string): ScoreArtifact[] {
  const rows = handle
    .prepare('SELECT * FROM score_artifacts WHERE project_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(projectId) as Record_[];

  return rows.map(toArtifact);
}
