import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Project } from '../../shared/types.ts';

/**
 * Project rows and their rollups.
 *
 * Every function takes the handle rather than reaching for the singleton, so
 * tests run against an in-memory database. This matches db/installs.ts.
 *
 * Asset count and total bytes are summed on read rather than kept as columns.
 * A stored counter drifts the moment an import fails halfway, and these tables
 * are small enough that the sum costs nothing worth optimising.
 */

interface Record_ {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  asset_count: number;
  bytes: number;
}

const SELECT = `
  SELECT p.id, p.name, p.created_at, p.updated_at,
         COUNT(a.id) AS asset_count,
         COALESCE(SUM(a.bytes), 0) AS bytes
  FROM projects p
  LEFT JOIN assets a ON a.project_id = p.id
`;

function toProject(record: Record_): Project {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    assetCount: record.asset_count,
    bytes: record.bytes,
  };
}

export function listProjects(handle: Database): Project[] {
  const records = handle
    .prepare(`${SELECT} GROUP BY p.id ORDER BY p.created_at DESC, p.rowid DESC`)
    .all() as Record_[];
  return records.map(toProject);
}

export function readProject(handle: Database, id: string): Project | undefined {
  const record = handle.prepare(`${SELECT} WHERE p.id = ? GROUP BY p.id`).get(id) as Record_ | undefined;
  return record ? toProject(record) : undefined;
}

export function createProject(handle: Database, name: string): Project {
  const id = randomUUID();
  handle.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, name);

  const project = readProject(handle, id);
  if (!project) throw new Error(`Project ${id} vanished immediately after being created`);
  return project;
}

export function renameProject(handle: Database, id: string, name: string): Project | undefined {
  const result = handle
    .prepare("UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, id);

  return result.changes === 0 ? undefined : readProject(handle, id);
}

export function deleteProject(handle: Database, id: string): boolean {
  return handle.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
