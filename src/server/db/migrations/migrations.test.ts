import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from '../migrate.ts';

function fresh(): Database.Database {
  const handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
  return handle;
}

function tableNames(handle: Database.Database): string[] {
  return handle
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
}

describe('003_library.sql', () => {
  it('creates all five library tables', () => {
    const names = tableNames(fresh());
    for (const table of ['projects', 'assets', 'jobs', 'asset_lineage', 'staged_uploads']) {
      expect(names).toContain(table);
    }
  });

  it('deletes a project\'s assets with the project', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    handle
      .prepare(
        `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
         VALUES ('a1', 'p1', 'source', 'Take 1', 'take1.wav', 'wav', 100, 'abc')`,
      )
      .run();

    handle.prepare("DELETE FROM projects WHERE id = 'p1'").run();

    const left = handle.prepare('SELECT COUNT(*) AS n FROM assets').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('refuses an asset format outside the accepted four', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    expect(() =>
      handle
        .prepare(
          `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
           VALUES ('a1', 'p1', 'source', 'Take 1', 'take1.ogg', 'ogg', 100, 'abc')`,
        )
        .run(),
    ).toThrow();
  });
});
