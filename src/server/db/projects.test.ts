import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrate.ts';
import { createProject, deleteProject, listProjects, readProject, renameProject } from './projects.ts';

let handle: Database.Database;

beforeEach(() => {
  handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
});

describe('projects', () => {
  it('creates a project with a generated id and zero rollups', () => {
    const project = createProject(handle, 'Demo');
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(project.name).toBe('Demo');
    expect(project.assetCount).toBe(0);
    expect(project.bytes).toBe(0);
  });

  it('lists projects newest first', () => {
    const first = createProject(handle, 'One');
    const second = createProject(handle, 'Two');

    const ids = listProjects(handle).map((p) => p.id);
    expect(ids).toEqual([second.id, first.id]);
  });

  it('sums asset count and bytes into the rollups', () => {
    const project = createProject(handle, 'Demo');
    const insert = handle.prepare(
      `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
       VALUES (?, ?, 'source', 'Take', 'take.wav', 'wav', ?, 'abc')`,
    );
    insert.run('a1', project.id, 100);
    insert.run('a2', project.id, 250);

    const read = readProject(handle, project.id);
    expect(read?.assetCount).toBe(2);
    expect(read?.bytes).toBe(350);
  });

  it('renames a project and moves updated_at', () => {
    const project = createProject(handle, 'Old');
    handle.prepare("UPDATE projects SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(project.id);

    const renamed = renameProject(handle, project.id, 'New');
    expect(renamed?.name).toBe('New');
    expect(renamed?.updatedAt).not.toBe('2020-01-01 00:00:00');
  });

  it('answers undefined for a project that does not exist', () => {
    expect(readProject(handle, 'nope')).toBeUndefined();
    expect(renameProject(handle, 'nope', 'New')).toBeUndefined();
    expect(deleteProject(handle, 'nope')).toBe(false);
  });

  it('deletes a project and reports that it did', () => {
    const project = createProject(handle, 'Demo');
    expect(deleteProject(handle, project.id)).toBe(true);
    expect(listProjects(handle)).toHaveLength(0);
  });
});
