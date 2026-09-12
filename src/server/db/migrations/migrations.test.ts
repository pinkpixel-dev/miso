import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrate } from '../migrate.ts';

const migrationsDir = dirname(fileURLToPath(import.meta.url));

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

describe('004_jobs.sql', () => {
  it('adds staging to the states a job can be in', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    const insert = (state: string) =>
      handle
        .prepare(
          `INSERT INTO jobs (id, project_id, task_id, model_id, params, state)
           VALUES (?, 'p1', 'generate.text2music', 'ace_step_turbo_q8_0', '{}', ?)`,
        )
        .run(`job-${state}`, state);

    for (const state of ['queued', 'staging', 'running', 'complete', 'failed', 'cancelled']) {
      expect(() => insert(state)).not.toThrow();
    }
    expect(() => insert('halfway')).toThrow();
  });

  /**
   * The migration drops and recreates jobs, and both assets and asset_lineage
   * reference it. This is the case that would break a real library rather than
   * an empty one.
   */
  it('leaves an existing library intact', () => {
    const handle = new Database(':memory:');
    handle.pragma('foreign_keys = ON');

    // Everything up to the point where 004 has not been applied yet.
    const upTo003 = readdirSync(join(migrationsDir))
      .filter((name) => name.endsWith('.sql') && name < '004')
      .sort();
    for (const name of upTo003) handle.exec(readFileSync(join(migrationsDir, name), 'utf8'));

    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    handle
      .prepare(
        `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
         VALUES ('a1', 'p1', 'source', 'Take 1', 'take1.wav', 'wav', 100, 'abc')`,
      )
      .run();

    handle.exec(readFileSync(join(migrationsDir, '004_jobs.sql'), 'utf8'));

    expect(handle.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 1 });
    expect(handle.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    // And the recreated table still accepts a job the asset can point at.
    handle
      .prepare(
        `INSERT INTO jobs (id, project_id, task_id, model_id, params, state)
         VALUES ('j1', 'p1', 'generate.text2music', 'ace_step_turbo_q8_0', '{}', 'queued')`,
      )
      .run();
    handle.prepare("UPDATE assets SET job_id = 'j1' WHERE id = 'a1'").run();
    expect(handle.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
